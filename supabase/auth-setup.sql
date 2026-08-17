-- =============================================================
-- Annual Budget Planner — Supabase Auth + RLS (ทางเลือก A: login จริง)
-- เป้าหมาย: แต่ละคน login ด้วยบัญชีจริง · แผนกเขียนได้เฉพาะงบตัวเอง · บัญชีดู/แก้ทุกอย่าง
--
-- ⚠ รันหลังจาก schema.sql แล้ว · รันใน SQL Editor ของ Supabase
-- ⚠ หลังเปิด RLS แบบนี้ แอปจะต้อง "login" ก่อนถึงจะอ่าน/เขียนได้ (client sync จะต่อให้ทีหลัง)
-- =============================================================

-- ---------- 1) โปรไฟล์: ผูก auth user → แผนก/บทบาท ----------
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique,          -- รหัสแผนก / 'accounting' / 'MGR:<unit>'
  full_name     text,
  role          text not null default 'USER',   -- USER | MANAGER | ACCOUNTING
  department_id text,                 -- สำหรับ USER (เช่น 'd1132')
  org_unit      text,                 -- สำหรับ MANAGER (เช่น 'qa')
  created_at    timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists prof_self on profiles;
create policy prof_self on profiles for select to authenticated using (true);

-- ---------- 2) ฟังก์ชันช่วยอ่านบทบาท/แผนกของผู้ล็อกอิน ----------
create or replace function auth_role() returns text language sql stable as $$
  select coalesce((select role from profiles where id = auth.uid()), 'NONE');
$$;
create or replace function auth_dept() returns text language sql stable as $$
  select (select department_id from profiles where id = auth.uid());
$$;
create or replace function is_acct() returns boolean language sql stable as $$
  select auth_role() = 'ACCOUNTING';
$$;

-- ---------- 3) เปลี่ยน RLS จาก "anon เขียนได้หมด" → ตามบทบาท ----------
-- master + report tables: ทุกคนที่ล็อกอินอ่านได้ · เขียนได้เฉพาะบัญชี
do $$
declare t text;
begin
  foreach t in array array[
    'app_meta','departments','gl_accounts','cct_master','department_rows',
    'budget_periods','exchange_rates','fuel_prices','budget_snapshots','snapshot_rows',
    'audit_logs','notifications'
  ] loop
    execute format('drop policy if exists anon_all on %I;', t);
    execute format('drop policy if exists rls_read on %I;', t);
    execute format('drop policy if exists rls_write on %I;', t);
    execute format('create policy rls_read on %I for select to authenticated using (true);', t);
    execute format('create policy rls_write on %I for all to authenticated using (is_acct()) with check (is_acct());', t);
  end loop;
end $$;

-- budgets / gl_notes / dept_status / cell_details / actuals:
--   อ่านได้ทุกคนที่ล็อกอิน · เขียนได้ = บัญชี หรือ เจ้าของแผนกนั้น
do $$
declare t text;
begin
  foreach t in array array['budgets','gl_notes','dept_status','cell_details','actuals'] loop
    execute format('drop policy if exists anon_all on %I;', t);
    execute format('drop policy if exists rls_read on %I;', t);
    execute format('drop policy if exists rls_write on %I;', t);
    execute format('create policy rls_read on %I for select to authenticated using (true);', t);
    execute format($f$create policy rls_write on %I for all to authenticated
        using (is_acct() or department_id = auth_dept())
        with check (is_acct() or department_id = auth_dept());$f$, t);
  end loop;
end $$;
-- actuals: เกิดจริงเป็นของบัญชี → เขียนได้เฉพาะบัญชี
drop policy if exists rls_write on actuals;
create policy rls_write on actuals for all to authenticated using (is_acct()) with check (is_acct());

-- ให้ role authenticated มีสิทธิ์ตาราง (RLS ยังกรองอีกชั้น)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- =============================================================
-- 4) สร้างบัญชีผู้ใช้ (ทำใน Supabase Dashboard → Authentication → Users → Add user)
--    หรือรัน insert profiles หลังสร้าง auth user แล้ว (ต้องมี id ของ auth user)
--
--    แนวทางแนะนำ: ตั้ง email เป็น <username>@ml.local (เช่น 1132@ml.local, accounting@ml.local,
--    mgr-qa@ml.local) + รหัสผ่านเริ่มต้น แล้ว map เข้า profiles:
--
--    insert into profiles (id, username, role, department_id, org_unit) values
--      ('<auth-uid>', '1132', 'USER', 'd1132', null),
--      ('<auth-uid>', 'accounting', 'ACCOUNTING', null, null),
--      ('<auth-uid>', 'MGR:qa', 'MANAGER', null, 'qa');
--
--    (มี 63 แผนก + ผู้จัดการฝ่าย + บัญชี — แนะนำสร้างสคริปต์รวม ผมช่วยทำ mapping ให้ได้
--     เมื่อคุณตัดสินใจ email pattern แล้ว)
-- =============================================================

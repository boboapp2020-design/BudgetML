-- =============================================================
-- auth-revert.sql — ปิดระบบ login ชั่วคราว: คืน RLS ให้ anon อ่าน/เขียนได้เหมือนเดิม
--
-- ใช้คู่กับ Supa.AUTH_REQUIRED = false ใน js/supa.js (client ไม่บังคับรหัสผ่าน)
-- รันใน Supabase → SQL Editor
--
-- ผลลัพธ์: ยกเลิก policy ตามบทบาท (rls_read/rls_write) แล้วกลับเป็น anon_all
--   → แอปทำงานได้โดยไม่ต้อง login (เหมือนก่อนเปิด Auth A)
-- หมายเหตุ: ผู้ใช้ 73 คนใน Auth + profiles ยังอยู่ครบ — เปิดกลับได้ด้วย auth-setup.sql
-- =============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'app_meta','departments','gl_accounts','cct_master','department_rows',
    'budget_periods','budgets','gl_notes','dept_status','cell_details',
    'budget_snapshots','snapshot_rows','actuals','exchange_rates','fuel_prices',
    'audit_logs','notifications'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists rls_read  on %I;', t);
    execute format('drop policy if exists rls_write on %I;', t);
    execute format('drop policy if exists anon_all  on %I;', t);
    execute format('create policy anon_all on %I for all to anon using (true) with check (true);', t);
  end loop;
end $$;

-- คืนสิทธิ์ระดับตารางให้ anon
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;

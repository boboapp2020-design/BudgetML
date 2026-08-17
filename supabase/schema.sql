-- =============================================================
-- Annual Budget Planner — Supabase (PostgreSQL) schema
-- โครงตารางแบบ relational แทน Google Sheet (_DB JSON blob)
--
-- วิธีติดตั้ง:
--   1) สร้าง Project ใน supabase.com
--   2) เปิดเมนู SQL Editor → New query → วางไฟล์นี้ทั้งหมด → Run
--   3) เอา Project URL + anon (public) key ไปวางในแอปที่ Budget Control
--
-- หลักการ:
--   - id ของแผนก/GL ใช้ค่าเดิมจากแอป ('d1132', 'g635100') เป็น text PK → mapping ตรงๆ
--   - ตัวเลข 12 เดือน / รายการย่อย เก็บเป็น jsonb (รองรับ null ต่อเดือน)
--   - budgets ล็อกด้วย key (year, department_id, gl_id, cct) → แต่ละแผนก upsert
--     เฉพาะแถวตัวเอง สองแผนกกรอกพร้อมกันไม่ชนกัน (แก้ปัญหา collision)
--
-- ความปลอดภัย (อ่านให้ครบ):
--   - เฟสนี้ยังไม่มี login จริง (ทุกแผนกใช้รหัสเดียวกัน) → RLS เปิดให้ anon
--     อ่าน/เขียนได้ทั้งหมด และต้องเก็บ URL+key ไว้ "นอก" repo สาธารณะ
--   - เมื่อเปิด login จริง (Supabase Auth) ค่อยแทน policy anon_* ด้านล่างด้วย
--     policy ที่เช็ค auth.jwt() ต่อแผนก — โครงตารางไม่ต้องแก้
-- =============================================================

-- ---------- meta (แถวเดียว) ----------
create table if not exists app_meta (
  id             text primary key default 'main',
  schema_version int,
  rev            bigint default 0,
  company        text,
  currency       text,
  year_current   int,
  year_previous  int,
  app_name       text,
  sides          jsonb,           -- {"1":"ด้านสนับสนุน",...}
  updated_at     timestamptz default now()
);

-- ---------- master ----------
create table if not exists departments (
  id       text primary key,      -- 'd1132'
  code     text unique not null,  -- '1132'
  name     text not null,
  name_en  text,
  side     text,                  -- '1'..'4'
  active   boolean default true
);

create table if not exists gl_accounts (
  id       text primary key,      -- 'g635100'
  code     text unique not null,  -- '635100'
  name     text not null,
  gl_group text,
  io_group text,                  -- '21' หรือ 'ไม่คุม'
  active   boolean default true
);

create table if not exists cct_master (
  code          text primary key, -- '8003310100'
  name          text,
  department_id text references departments(id) on delete cascade
);

-- การมอบหมายระดับแถว CCT × GL (+ IO / code a)
create table if not exists department_rows (
  department_id text not null references departments(id) on delete cascade,
  cct           text not null,
  gl_id         text not null references gl_accounts(id) on delete cascade,
  io            text,
  code_a        text,
  primary key (department_id, cct, gl_id)
);

-- ---------- รอบงบประมาณ ----------
create table if not exists budget_periods (
  year              int primary key,
  status            text,          -- OPEN / CLOSED
  phase             text,          -- ORIGINAL / REVISE (null = ORIGINAL)
  actual_thru       int,           -- รอบ Revise: มีเกิดจริงถึงเดือน N
  opened_at         timestamptz,
  locked_at         timestamptz,
  locked_by         text,
  revise_opened_at  timestamptz,
  revise_opened_by  text
);

-- ---------- งบประมาณ (ตารางหลัก — 1 แถว = ปี×แผนก×GL×CCT) ----------
create table if not exists budgets (
  year          int  not null,
  department_id text not null references departments(id) on delete cascade,
  gl_id         text not null references gl_accounts(id) on delete cascade,
  cct           text not null,
  months        jsonb not null,    -- [12] ตัวเลขหรือ null
  mtp1          numeric,           -- MTP ปี +1
  mtp2          numeric,           -- MTP ปี +2
  not_used      boolean default false,
  updated_at    timestamptz default now(),
  updated_by    text,
  primary key (year, department_id, gl_id, cct)
);
create index if not exists budgets_dept_year on budgets (department_id, year);

-- ---------- เหตุผล / สมมติฐาน (ต่อ rowKey) ----------
create table if not exists gl_notes (
  year          int  not null,
  department_id text not null references departments(id) on delete cascade,
  row_key       text not null,     -- 'g635100@8003310100'
  reason        text,
  assumption    text,
  primary key (year, department_id, row_key)
);

-- ---------- สถานะแผนกต่อปี ----------
create table if not exists dept_status (
  year          int  not null,
  department_id text not null references departments(id) on delete cascade,
  status        text,              -- DRAFT/IN_PROGRESS/SUBMITTED/LOCKED/COMPLETED/NEED_REVISION
  submitted_at  timestamptz,
  revision_note text,
  primary key (year, department_id)
);

-- ---------- รายละเอียดค่าใช้จ่ายรายช่อง ----------
create table if not exists cell_details (
  year          int  not null,
  department_id text not null references departments(id) on delete cascade,
  row_key       text not null,
  month         int  not null,     -- 0..11
  items         jsonb,             -- [{desc, amount}, ...]
  updated_at    timestamptz default now(),
  updated_by    text,
  primary key (year, department_id, row_key, month)
);

-- ---------- งบเดิม (snapshot ORIGINAL) ที่ freeze ตอนเปิด Revise ----------
create table if not exists budget_snapshots (
  year       int  not null,
  label      text not null,        -- 'ORIGINAL'
  created_at timestamptz default now(),
  primary key (year, label)
);
create table if not exists snapshot_rows (
  year          int  not null,
  label         text not null,
  department_id text not null,
  gl_id         text not null,
  cct           text not null,
  months        jsonb not null,
  primary key (year, label, department_id, gl_id, cct)
);

-- ---------- เกิดจริงรายเดือน (บัญชีเป็นผู้ใส่) ----------
create table if not exists actuals (
  year          int  not null,
  department_id text not null references departments(id) on delete cascade,
  gl_id         text not null,
  cct           text not null,
  months        jsonb not null,
  updated_at    timestamptz default now(),
  updated_by    text,
  primary key (year, department_id, gl_id, cct)
);

-- ---------- อัตราแลกเปลี่ยน / ราคาน้ำมัน ----------
create table if not exists exchange_rates (
  year        int  not null,
  currency    text not null,
  rate_to_lak numeric,
  primary key (year, currency)
);
create table if not exists fuel_prices (
  year            int  not null,
  fuel_type       text not null,
  price_per_liter numeric,
  primary key (year, fuel_type)
);

-- ---------- audit log (append-only) ----------
create table if not exists audit_logs (
  id         text primary key,     -- ใช้ id เดิมจากแอป
  ts         timestamptz,
  user_id    text,
  user_name  text,
  action     text,
  dept_id    text,
  gl_code    text,
  month      int,
  old_value  jsonb,
  new_value  jsonb
);
create index if not exists audit_ts on audit_logs (ts desc);

-- ---------- notifications ----------
create table if not exists notifications (
  id             text primary key,
  ts             timestamptz,
  target_role    text,
  target_dept_id text,
  message        text,
  read           boolean default false
);

-- =============================================================
-- RLS — เฟสนี้เปิดให้ anon อ่าน/เขียนได้ (ยังไม่มี login จริง)
-- ⚠ URL + anon key ต้องไม่ commit ลง repo สาธารณะ
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'app_meta','departments','gl_accounts','cct_master','department_rows',
    'budget_periods','budgets','gl_notes','dept_status','cell_details',
    'budget_snapshots','snapshot_rows','actuals','exchange_rates','fuel_prices',
    'audit_logs','notifications'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists anon_all on %I;', t);
    execute format(
      'create policy anon_all on %I for all to anon using (true) with check (true);', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

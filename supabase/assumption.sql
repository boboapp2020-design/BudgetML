-- ตาราง Assumption (MTP) — เก็บเฉพาะค่าที่แอดมินแก้ (override) บนค่าต้นทางจากไฟล์
-- รันครั้งเดียวใน Supabase SQL editor
create table if not exists public.assumption_cells (
  r          integer     not null,   -- แถว (0-based ตามกริดไฟล์)
  c          integer     not null,   -- คอลัมน์ (0-based)
  v          double precision,       -- ค่าที่แก้
  updated_at timestamptz,
  updated_by text,
  primary key (r, c)
);
alter table public.assumption_cells enable row level security;
-- เปิดสิทธิ์ให้ publishable key อ่าน/เขียน (เหมือนตารางอื่นในระบบ)
drop policy if exists assumption_all on public.assumption_cells;
create policy assumption_all on public.assumption_cells for all using (true) with check (true);

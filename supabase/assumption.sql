-- ตาราง Assumption (MTP) — เก็บเฉพาะค่าที่แอดมินแก้ (override) แยกตาม "ปีงบ" (year)
-- รันครั้งเดียวใน Supabase SQL editor (ถ้าเคยสร้างเวอร์ชันเก่าไว้ จะ drop แล้วสร้างใหม่)
drop table if exists public.assumption_cells;
create table public.assumption_cells (
  year       integer     not null,   -- ปีงบ (ค.ศ.)
  r          integer     not null,   -- แถว (0-based)
  c          integer     not null,   -- คอลัมน์ (0-based)
  v          double precision,       -- ค่าที่แก้
  updated_at timestamptz,
  updated_by text,
  primary key (year, r, c)
);
alter table public.assumption_cells enable row level security;
drop policy if exists assumption_all on public.assumption_cells;
create policy assumption_all on public.assumption_cells for all using (true) with check (true);

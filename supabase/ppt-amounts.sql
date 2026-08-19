-- ตารางจำนวนเงินหน้า "ต้นทุนต่อหน่วย" (กรอกมือ รายหมวด PPT 1-33) — รันครั้งเดียวใน Supabase SQL Editor
-- code = รหัสหมวด PPT (1-33) · amount = จำนวนเงิน (กีบ) ที่ user กรอก
create table if not exists ppt_amounts (
  year       int  not null,
  code       int  not null,
  amount     numeric,
  updated_at timestamptz,
  updated_by text,
  primary key (year, code)
);
alter table ppt_amounts enable row level security;
drop policy if exists anon_all on ppt_amounts;
create policy anon_all on ppt_amounts for all using (true) with check (true);

-- สถานะส่งต้นทุน PPT รายแผนก/ปี (ส่งแล้ว = ล็อก · แอดมินปลดล็อก)
create table if not exists ppt_submits (
  year         int  not null,
  dept_code    text not null,
  submitted_at timestamptz,
  submitted_by text,
  primary key (year, dept_code)
);
alter table ppt_submits enable row level security;
drop policy if exists anon_all on ppt_submits;
create policy anon_all on ppt_submits for all using (true) with check (true);

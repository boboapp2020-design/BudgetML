-- ตารางปริมาณผลิต (ตัวหารของต้นทุนต่อหน่วย) — รันครั้งเดียวใน Supabase SQL Editor
-- metric: caneCompany (ตันอ้อยไร่บริษัท) · caneCommunity (ตันอ้อยไร่ส่งเสริม/ชุมชน)
--         sugarProduce (ตันน้ำตาลผลิต) · sugarTrading (ตันน้ำตาล Trading)
-- plan = ปริมาณตามแผน/งบ · actual = ปริมาณเกิดจริง
create table if not exists prod_volumes (
  year        int  not null,
  metric      text not null,
  plan        numeric,
  actual      numeric,
  updated_at  timestamptz,
  updated_by  text,
  primary key (year, metric)
);
alter table prod_volumes enable row level security;
drop policy if exists anon_all on prod_volumes;
create policy anon_all on prod_volumes for all using (true) with check (true);

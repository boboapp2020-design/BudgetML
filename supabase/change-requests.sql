-- คำร้องปรับงบกลางปี (ขอเพิ่ม/ลด/โยก) + หน้าต่างเปิด-ปิดการยื่น — รันครั้งเดียวใน Supabase SQL Editor
-- ปลอดภัยกับข้อมูลเดิม (create if not exists) · แอปเขียน/อ่านผ่าน anon key ตามปกติ

-- 1) หน้าต่างปรับงบ: เปิด/ปิดได้ราย ปี×ช่วง (win = 'm1_3' เดือน 1-3 · 'm5_12' เดือน 5-12)
create table if not exists change_windows (
  year       int  not null,
  win        text not null,
  open       bool not null default false,
  opened_at  timestamptz,
  opened_by  text,
  primary key (year, win)
);
alter table change_windows enable row level security;
drop policy if exists anon_all on change_windows;
create policy anon_all on change_windows for all using (true) with check (true);

-- 2) คำร้องปรับงบ: 1 แถว = 1 คำร้อง · items เก็บรายการปรับ (jsonb) [{deptId,glId,cct,month,delta}]
--    status: PENDING_MGR -> PENDING_ACC -> APPROVED | REJECTED | CANCELLED
create table if not exists change_requests (
  id          text primary key,
  year        int  not null,
  win         text,
  type        text not null,               -- increase | decrease | transfer
  dept_id     text not null,               -- หน่วยงานผู้ยื่น
  created_by  text,
  created_at  timestamptz,
  reason      text,
  memo_note   text,                        -- Phase 1: ข้อความ/เลขที่ memo (Phase 2 จะเพิ่มไฟล์แนบ)
  items       jsonb not null default '[]', -- รายการปรับงบ
  to_dept_id  text,                         -- เผื่อโยกข้ามหน่วยงาน (Phase 3)
  status      text not null default 'PENDING_MGR',
  mgr_by      text, mgr_at timestamptz, mgr_note text,
  acc_by      text, acc_at timestamptz, acc_note text,
  applied_at  timestamptz
);
alter table change_requests enable row level security;
drop policy if exists anon_all on change_requests;
create policy anon_all on change_requests for all using (true) with check (true);

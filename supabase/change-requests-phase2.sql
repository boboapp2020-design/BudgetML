-- เฟส 2: แนบไฟล์ memo (PDF/รูป) ให้คำร้องปรับงบ — รันครั้งเดียวใน Supabase SQL Editor
-- (ต้องรัน change-requests.sql เฟส 1 ไปแล้ว)

-- 1) เพิ่มคอลัมน์เก็บ metadata ไฟล์แนบ (path/ชื่อ/ชนิด/ขนาด/url) เป็น jsonb
alter table change_requests add column if not exists memo_file jsonb;

-- 2) สร้าง Storage bucket 'memos' (public read — ดาวน์โหลดผ่าน public URL ได้เลย · path สุ่มเดายาก)
insert into storage.buckets (id, name, public)
values ('memos', 'memos', true)
on conflict (id) do update set public = true;

-- 3) นโยบายให้ anon อัปโหลด/อ่าน/ลบ ไฟล์ในบัคเก็ต memos (สอดคล้องกับ anon key ที่แอปใช้)
drop policy if exists memos_insert on storage.objects;
create policy memos_insert on storage.objects for insert with check (bucket_id = 'memos');

drop policy if exists memos_select on storage.objects;
create policy memos_select on storage.objects for select using (bucket_id = 'memos');

drop policy if exists memos_delete on storage.objects;
create policy memos_delete on storage.objects for delete using (bucket_id = 'memos');

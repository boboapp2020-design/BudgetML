-- เฟส 2 (robust): แนบไฟล์ memo (PDF/รูป) — รันครั้งเดียวใน Supabase SQL Editor
-- เวอร์ชันนี้หุ้ม policy ด้วย exception-safe: ถ้า create policy บน storage.objects ติดสิทธิ์
-- คอลัมน์ + bucket จะยังถูกสร้าง (ไม่ rollback ทั้งชุด) และท้ายสคริปต์รายงานสถานะให้เห็น

-- 1) คอลัมน์เก็บ metadata ไฟล์แนบ
alter table change_requests add column if not exists memo_file jsonb;

-- 2) Storage bucket 'memos' (public read)
insert into storage.buckets (id, name, public)
values ('memos', 'memos', true)
on conflict (id) do update set public = true;

-- 3) policy ให้ anon upload/อ่าน/ลบ (หุ้ม exception กันทั้งชุดพัง)
do $$
begin
  begin
    drop policy if exists memos_insert on storage.objects;
    create policy memos_insert on storage.objects for insert with check (bucket_id = 'memos');
  exception when others then raise notice 'memos_insert policy skipped: %', sqlerrm; end;
  begin
    drop policy if exists memos_select on storage.objects;
    create policy memos_select on storage.objects for select using (bucket_id = 'memos');
  exception when others then raise notice 'memos_select policy skipped: %', sqlerrm; end;
  begin
    drop policy if exists memos_delete on storage.objects;
    create policy memos_delete on storage.objects for delete using (bucket_id = 'memos');
  exception when others then raise notice 'memos_delete policy skipped: %', sqlerrm; end;
end $$;

-- 4) รีเฟรช schema cache ของ PostgREST (ให้เห็นคอลัมน์ใหม่ทันที)
notify pgrst, 'reload schema';

-- 5) รายงานสถานะ (ควรได้ true / true / 3)
select
  exists(select 1 from information_schema.columns where table_name = 'change_requests' and column_name = 'memo_file') as has_memo_file,
  exists(select 1 from storage.buckets where id = 'memos') as has_bucket,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'memos\_%') as memo_policies;

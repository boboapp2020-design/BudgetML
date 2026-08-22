-- =============================================================
-- Security hardening (v20.20) — รันใน Supabase SQL Editor
-- 1) audit_logs: เพิ่ม/อ่านได้เท่านั้น — ห้ามแก้/ลบ (กันลบร่องรอย)
-- 2) user_passwords: แอปเก็บเป็น SHA-256 hash แล้ว (คำนำหน้า sha256:)
--    แถว plaintext เก่าจะถูกอัปเกรดเป็น hash อัตโนมัติเมื่อผู้ใช้ login สำเร็จครั้งถัดไป
-- =============================================================

-- audit_logs: insert-only
alter table public.audit_logs enable row level security;
drop policy if exists anon_all on public.audit_logs;
drop policy if exists audit_read on public.audit_logs;
drop policy if exists audit_insert on public.audit_logs;
create policy audit_read   on public.audit_logs for select using (true);
create policy audit_insert on public.audit_logs for insert with check (true);
-- (ไม่มี policy update/delete = ทำไม่ได้จากทุก client — แก้ได้เฉพาะ service key)

-- หมายเหตุ: การปิดช่องโหว่ "anon เขียนได้ทุกตาราง" แบบสมบูรณ์ = supabase/auth-setup.sql
-- (ต้องย้ายผู้ใช้เข้า Supabase Auth ก่อน — ตัดสินใจร่วมกันแล้วค่อยรัน)

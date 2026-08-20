-- =============================================================
-- user-passwords.sql
-- ตารางรหัสผ่านราย email (เฉพาะคนที่เปลี่ยนรหัสเอง — ค่าเริ่มต้นของทุกคนคือ 'a')
-- admin ไม่เกี่ยว (ใช้ admin / 1234 ฝั่งแอป)
-- รันครั้งเดียวใน Supabase SQL Editor — ปลอดภัย รันซ้ำได้
-- =============================================================

CREATE TABLE IF NOT EXISTS public.user_passwords (
  email      text PRIMARY KEY,
  pass       text NOT NULL,
  changed_at timestamptz
);

ALTER TABLE public.user_passwords ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon all user_passwords" ON public.user_passwords
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'user_passwords ready' AS status;

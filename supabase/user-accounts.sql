-- =============================================================
-- user-accounts.sql
-- สมุดผู้ใช้ที่แอดมินจัดการเอง (email → บทบาท)
-- ว่าง = ระบบใช้ค่าเริ่มต้นจากโค้ด (EMAIL_DIR ใน 43 อีเมล)
-- เมื่อแอดมินแก้ครั้งแรกในหน้า "จัดการผู้ใช้" ระบบจะเขียนทั้งชุดลงตารางนี้
-- รันครั้งเดียวใน Supabase SQL Editor — ปลอดภัย รันซ้ำได้
-- =============================================================

CREATE TABLE IF NOT EXISTS public.user_accounts (
  email  text PRIMARY KEY,
  roles  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{kind:'filler'|'viewer', id, name, sub}]
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon all user_accounts" ON public.user_accounts
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'user_accounts ready' AS status;

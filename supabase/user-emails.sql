-- =============================================================
-- user-emails.sql
-- ตารางอีเมลแจ้งเตือน: code = รหัสแผนก (เช่น '2712') หรือ ROLE ('ACCOUNTING')
-- emails = รายชื่ออีเมล (jsonb array) — คนเดียวมีหลายอีเมลได้
-- รันครั้งเดียวใน Supabase SQL Editor — ปลอดภัย รันซ้ำได้
-- =============================================================

CREATE TABLE IF NOT EXISTS public.user_emails (
  code   text PRIMARY KEY,
  emails jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.user_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon all user_emails" ON public.user_emails
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'user_emails ready' AS status;

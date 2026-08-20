-- =============================================================
-- budget-scenarios.sql
-- เพิ่มคอลัมน์ sc (jsonb) เก็บงบสมมติฐาน 3 เคส (Base / Best / Worst)
-- โครงสร้างค่า: { "base":[y+2,y+3], "best":[y+1,y+2,y+3], "worst":[y+1,y+2,y+3] }
-- รันครั้งเดียวใน Supabase SQL Editor — ปลอดภัย รันซ้ำได้ (IF NOT EXISTS)
-- =============================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS sc jsonb;

-- แจ้ง PostgREST ให้รีเฟรช schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'budgets.sc column ready' AS status;

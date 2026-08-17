# ย้ายดาต้าเบสไป Supabase (PostgreSQL)

แทน Google Sheet + Apps Script ด้วย Supabase Postgres — เพื่อแก้ปัญหา collision
เมื่อหลายแผนกกรอกพร้อมกัน (แต่ละแผนก upsert เฉพาะแถวของตัวเอง)

## ขั้นตอนตั้งค่า (ทำครั้งเดียว)

1. สมัคร/เข้า https://supabase.com → **New project** (ตั้งรหัสผ่าน database ไว้ ไม่ต้องใช้ในแอป)
2. รอ project สร้างเสร็จ (~2 นาที)
3. เมนูซ้าย **SQL Editor** → **New query** → วางไฟล์ [`schema.sql`](schema.sql) ทั้งหมด → **Run**
   (ต้องขึ้น "Success. No rows returned")
4. เมนู **Project Settings → API** คัดลอก 2 ค่า:
   - **Project URL** (เช่น `https://xxxxx.supabase.co`)
   - **anon public** key (คีย์ยาวขึ้นต้น `eyJ...`)
5. ในแอป: login เป็น accounting → **Budget Control** → การ์ด "เชื่อมต่อฐานข้อมูล" →
   เลือก Supabase → วาง URL + anon key → **บันทึก & ทดสอบ**
   - ครั้งแรกแอปจะ push ข้อมูลปัจจุบันขึ้น Supabase ให้อัตโนมัติ

## ความปลอดภัย

- **อย่า** ใส่ URL/anon key ลงในโค้ดที่ push ขึ้น GitHub — เก็บใน localStorage ของเบราว์เซอร์
  (แอปวางให้เองตอนกรอกใน Budget Control) เหมือนที่เคยทำกับ Google Apps Script URL
- เฟสนี้ RLS เปิดให้ anon อ่าน/เขียนได้ (เพราะยังไม่มี login จริง — ทุกแผนกใช้รหัส `1234`)
  ความปลอดภัยจึงอยู่ที่ "ไม่เปิดเผย URL/key" เท่านั้น เท่ากับระดับเดิมของ GAS URL
- เมื่อเปิดระบบ login จริง (Supabase Auth) จะแทน policy `anon_all` ด้วย policy ต่อแผนก
  ที่เช็ค `auth.jwt()` — โครงตารางไม่ต้องแก้

## ตารางหลัก

| ตาราง | เก็บอะไร |
|---|---|
| `app_meta` | เวอร์ชัน schema, ชื่อบริษัท, ปีงบ, ชื่อด้าน (แถวเดียว) |
| `departments` / `gl_accounts` / `cct_master` | master 62 แผนก / 151 GL / 184 CCT |
| `department_rows` | การมอบหมาย CCT × GL + IO + code a |
| `budget_periods` | รอบงบ + phase (ORIGINAL/REVISE) + เกิดจริงถึงเดือน |
| **`budgets`** | งบ 12 เดือน + MTP (1 แถว = ปี×แผนก×GL×CCT) — ตารางที่ป้องกัน collision |
| `gl_notes` | เหตุผล / สมมติฐาน |
| `dept_status` | สถานะแต่ละแผนกต่อปี |
| `cell_details` | รายละเอียดค่าใช้จ่ายรายช่อง |
| `budget_snapshots` / `snapshot_rows` | งบเดิม (freeze ตอนเปิด Revise) |
| `actuals` | ตัวเลขเกิดจริงรายเดือน |
| `exchange_rates` / `fuel_prices` | อัตราแลกเปลี่ยน / ราคาน้ำมัน |
| `audit_logs` / `notifications` | log และการแจ้งเตือน |

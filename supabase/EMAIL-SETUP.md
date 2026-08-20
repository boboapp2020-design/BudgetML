# ตั้งค่าระบบส่งอีเมล (Supabase Edge Function + Resend)

ระบบอีเมลถูกวางโครงไว้ครบแล้วในโค้ด — เหลือ 3 ขั้นตอนตั้งค่าครั้งเดียว จากนั้นอีเมลจะยิงอัตโนมัติทุกเหตุการณ์ (เปิดรอบ / ส่งงบ / ผจก.รับรอง / ตีกลับ / ล็อก)

## ขั้นที่ 1 — สมัคร Resend และเอา API Key
1. สมัครที่ https://resend.com (ฟรี 100 อีเมล/วัน 3,000/เดือน)
2. เมนู **API Keys** → Create API Key → คัดลอกไว้ (ขึ้นต้น `re_...`)
3. (ทางเลือก) เมนู **Domains** เพิ่มโดเมนบริษัท เพื่อส่งจาก `budget@บริษัท.com`
   — ถ้าไม่เพิ่ม จะส่งจาก `onboarding@resend.dev` ได้เลย (ทดสอบได้ทันที)

## ขั้นที่ 2 — Deploy Edge Function (ทำครั้งเดียว)
ใช้เครื่องที่มี Supabase CLI (ติดตั้ง: https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref fdicsryxzyxuoxacxilz
supabase secrets set RESEND_API_KEY=re_XXXXXXXXX
# ถ้ามีโดเมนของตัวเอง (ไม่บังคับ):
supabase secrets set EMAIL_FROM="iBud งบประมาณ <budget@yourdomain.com>"
supabase functions deploy send-email --no-verify-jwt
```

ทดสอบ:
```bash
curl -X POST "https://fdicsryxzyxuoxacxilz.supabase.co/functions/v1/send-email" -H "Content-Type: application/json" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -d "{\"to\":[\"you@example.com\"],\"subject\":\"ทดสอบ iBud\",\"html\":\"<b>สวัสดี</b>\"}"
```

## ขั้นที่ 3 — รัน SQL สร้างตารางอีเมล + ใส่อีเมล
1. รัน `supabase/user-emails.sql` ใน SQL Editor
2. ใส่อีเมล: code = รหัสแผนก (`'2712'`) หรือ `'ACCOUNTING'` (แอดมิน)
   ```sql
   INSERT INTO user_emails (code, emails) VALUES
     ('ACCOUNTING', '["acc1@mitrlao.com","acc2@mitrlao.com"]'),
     ('2712', '["farm@mitrlao.com"]')
   ON CONFLICT (code) DO UPDATE SET emails = EXCLUDED.emails;
   ```
   (หรือส่งรายชื่อ+อีเมลมา เดี๋ยว Claude ทำ SQL ให้ทั้ง 91 คน)

## เหตุการณ์ที่ยิงอีเมลอัตโนมัติ (js/email.js)
| เหตุการณ์ | ผู้รับ |
|---|---|
| แผนกส่งงบ (Submit) | ACCOUNTING |
| ผจก.รับรอง (Endorse) | ACCOUNTING |
| ตีกลับ (บัญชี/ผจก. · เดี่ยว/หลายแผนก) | แผนกที่ถูกตีกลับ |
| ล็อกคืนรายแผนก | แผนกนั้น |
| แจ้งเตือนในแอปอื่นๆ ทั้งหมด | ตาม target ของ notify() |

กติกา: EmailBridge อ่านอีเมลจากตาราง `user_emails` — ถ้า code ไหนไม่มีอีเมล = ข้ามเงียบๆ (แจ้งเตือนในแอปยังทำงานปกติ) จึงเปิดใช้ทีละแผนกได้

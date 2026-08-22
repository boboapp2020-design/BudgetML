# 🚀 Deploy ขึ้น Cloudflare Pages

แอปเป็น static SPA (HTML+JS ล้วน ไม่มี build system) — ใช้ Cloudflare Pages ได้ตรงๆ
**ข้อสำคัญ: ห้าม deploy ทั้ง repo** เพราะมีไฟล์ภายใน (Excel งบจริง, backup, SQL) — ให้ deploy เฉพาะโฟลเดอร์ `dist/` ที่สร้างจาก `build.sh` เท่านั้น

---

## วิธีที่ 1 — เชื่อม GitHub (อัปเดตอัตโนมัติทุกครั้งที่ push) ✅ แนะนำ

1. เข้า https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. เลือก repo `boboapp2020-design` (branch `main`)
3. ตั้งค่า Build:
   - **Build command:** `bash build.sh`
   - **Build output directory:** `dist`
4. Deploy → ได้ URL `https://<ชื่อโปรเจกต์>.pages.dev`
5. (ทางเลือก) ผูกโดเมนของบริษัทที่แท็บ **Custom domains**

หลังจากนี้ทุกครั้งที่ push ขึ้น GitHub → Cloudflare build+deploy ให้เองอัตโนมัติ

## วิธีที่ 2 — อัปโหลดตรงจากเครื่อง (ไม่ผ่าน GitHub)

ต้องมี Node.js (ใช้เครื่องที่มี npm):
```bash
bash build.sh
npx wrangler pages deploy dist --project-name ibud-budget
```
(ครั้งแรกจะให้ login Cloudflare ในเบราว์เซอร์)

หรือแบบไม่ใช้ CLI: Dashboard → Pages → **Upload assets** → ลากโฟลเดอร์ `dist/` ทั้งก้อน

---

## สิ่งที่จัดเตรียมไว้แล้ว

| ไฟล์ | ทำอะไร |
|---|---|
| `build.sh` | คัดเฉพาะไฟล์แอป → `dist/` (index.html · css · js · fonts · Flags · favicon/logo/hero) — **ไม่มี** Excel/backup/SQL/รายงาน |
| `dist/_headers` (สร้างอัตโนมัติ) | Security headers: กัน iframe (clickjacking) · nosniff · referrer policy · index.html ไม่ cache (ผู้ใช้ได้เวอร์ชันใหม่ทันทีที่ deploy) |
| Hash routing (`#/...`) | ไม่ต้องตั้ง redirect/SPA fallback ใดๆ |
| ฟอนต์/รูป local ทั้งหมด | ไม่พึ่ง CDN ภายนอก — โหลดได้แม้เน็ตองค์กรบล็อก |

## เช็กลิสต์ก่อนเปิดใช้จริง

- [ ] Supabase → **Authentication → URL Configuration**: เพิ่มโดเมน pages.dev/โดเมนบริษัท (ถ้าเปิดใช้ Auth ในอนาคต)
- [ ] ทดสอบเปิด URL จริง: login · กรอกงบ · sync ขึ้น Supabase
- [ ] ⚠ ช่องโหว่ RLS (anon เขียนได้) ยังเปิดอยู่ — ก่อนแจก URL สาธารณะวงกว้าง ควรเปิด `supabase/auth-setup.sql` (ดู รายงานตรวจช่องโหว่.html)
- [ ] แจ้ง URL ใหม่ให้ผู้ใช้ + เลิกใช้ Start Budget App.bat (เปิดผ่านเว็บแทน)

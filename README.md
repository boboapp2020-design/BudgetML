# Annual Budget Planner — Plan • Analyze • Control

ระบบจัดทำและวิเคราะห์งบประมาณประจำปี · บริษัท น้ำตาลมิตรลาว จำกัด
MVP Phase 1 — เริ่มที่ 1 หน่วยงาน (แผนกบริหารคุณภาพ 1132) พร้อมขยายเป็น 20+ หน่วยงาน

## วิธีเปิดใช้งาน

**วิธีที่ 1 (แนะนำ):** ดับเบิลคลิก **`Start Budget App.bat`**
→ ระบบจะรัน local server และเปิด browser ที่ http://localhost:8123 ให้อัตโนมัติ

**วิธีที่ 2:** ดับเบิลคลิก `index.html` เปิดด้วย Edge/Chrome ได้โดยตรง (ทำงาน offline 100%)

> ไม่ต้องติดตั้งอะไรทั้งสิ้น — ไม่ใช้ Node.js / Python / อินเทอร์เน็ต

## การเข้าใช้งาน

หน้า Login แสดง**หน่วยงานครบทั้งบริษัท 62 แผนก** (จัดกลุ่มตามด้าน: สนับสนุน · อ้อย · โรงงาน · บริหารสำนักงาน) — เลือกหน่วยงานเพื่อเข้าใช้งานได้เลย
(ระบบรหัสผ่านรายแผนกจะเปิดใช้ในขั้นถัดไป — โครงสร้างบัญชีผู้ใช้แยกรายแผนกเตรียมไว้แล้ว: username = รหัสหน่วยงาน)

| บทบาท | ทำอะไรได้ |
|---|---|
| Department User (62 แผนก) | เห็นเฉพาะ GL ของตนเอง, กรอกงบ 12 เดือน + MTP, Reason/Assumption, Submit |
| แผนกบัญชี (Accounting / Admin) | ดูทุกหน่วยงาน, Drill-down, วิเคราะห์, ตีกลับ, Lock/Unlock, จัดการ Master, Audit Log |

**กฎสำคัญ:** Accounting ดูและวิเคราะห์ได้ทุกอย่าง แต่**แก้ตัวเลขงบของหน่วยงานไม่ได้** —
ถ้าพบข้อผิดพลาดให้กด "ตีกลับ (Need Revision)" เพื่อให้หน่วยงานแก้ไขเอง (บังคับที่ Data Layer)

## ข้อมูลตั้งต้น (จากไฟล์จริง `งบประมาณ.xlsx`)

- งบปี **2025 รายเดือนจริง** 8 GL ของแผนกบริหารคุณภาพ (ล็อกเป็นปีก่อน)
- ปีงบ **2026 = รอบที่กำลังจัดทำ** — สมมติฐาน/สาเหตุเพิ่มลดเป็นข้อความจริงจากไฟล์
  ส่วนตัวเลขรายเดือน 2026 เป็น**ตัวอย่างสาธิต** (ไฟล์จริงยังไม่ได้กรอก) แก้ไขได้ทั้งหมด
- ช่องกรอกตรงกับฟอร์มจริง: 12 เดือน (คอลัมน์ AY–BJ) + สมมติฐาน/สาเหตุ + งบปี 2027, 2028 (BN–BQ)
- Budget Rate 2026: THB 680 · USD 21,738 กีบ · ราคาน้ำมัน ดีเซล 19,210 / เบนซิน 23,520 กีบ/ลิตร

รีเซ็ตข้อมูลกลับค่าเริ่มต้นได้ที่: Accounting → Budget Control → "รีเซ็ตข้อมูลสาธิต"

## โครงสร้างโปรเจกต์

```
index.html            จุดเริ่ม (SPA)
css/app.css           ธีม Corporate Navy/Blue
js/seed.js            ข้อมูลตั้งต้นจาก Excel (Department, GL, งบ 2025/2026, Rate, น้ำมัน)
js/store.js           Data + Business Logic layer (RBAC, validation, anomaly, audit) ★ ทุก mutation ผ่านที่นี่
js/charts.js          SVG charts (bar/line/donut + tooltip) ไม่พึ่ง CDN
js/ui.js              Layout shell + components ร่วม
js/pages-user.js      หน้าฝั่งหน่วยงาน (Dashboard, กรอกงบ, Review/Submit, Calculators)
js/pages-acc.js       หน้าฝั่งบัญชี (Executive Dashboard, Drill-down, Analysis, Control, Audit)
js/app.js             Router + Login
serve.ps1             Local web server (PowerShell, ไม่ต้องติดตั้ง)
DESIGN.md             เอกสารออกแบบ: Architecture, Schema, Flow, Page Map, Permission Matrix
```

ข้อมูลเก็บใน `localStorage` ของ browser (โครงสร้าง JSON versioned ตาม schema ใน DESIGN.md)
— ออกแบบเป็นชั้นเพื่อ port ขึ้น **Express + SQLite** ได้โดยไม่แก้ UI เมื่อพร้อมใช้หลายเครื่องพร้อมกัน

## เชื่อมต่อ Google Sheet (Apps Script Backend)

ข้อมูลซิงค์กับชีท [บัญชี (ดาต้าเบสหลัก)](https://docs.google.com/spreadsheets/d/1KiE6hk3FJTF4QSk_nYgUwYXynCFFE__J3pcTBdeRhDo/edit) ได้อัตโนมัติ:

1. เปิดชีท → **ส่วนขยาย → Apps Script** → วางโค้ดจาก `apps-script\Code.gs` → Save
2. **Deploy → New deployment → Web app** · Execute as: **Me** · Who has access: **Anyone** → อนุญาตสิทธิ์
3. คัดลอก Web app URL (ลงท้าย `/exec`) → ในแอป login `accounting` → Budget Control → การ์ด "เชื่อมต่อ Google Sheet" → วาง URL → บันทึก & ทดสอบ

หลังเชื่อมต่อ: ทุกการแก้ไข push ขึ้นชีทอัตโนมัติ (ไฟสถานะ 🟢 บน header), เปิดแอปจะดึงข้อมูลล่าสุดจากชีทก่อนเสมอ, มีระบบ rev กันเขียนทับกัน — ชีทจะสร้างแท็บอ่านง่าย (MASTER_* + 1 แผนก 1 sheet) ให้เองทุกครั้งที่บันทึก

## Roadmap

- **Phase 2:** ติดตั้ง Node.js → REST API + SQLite + login จริง → multi-user 20+ หน่วยงาน
- **Phase 3:** Export .xlsx แบบ formatted, Waterfall chart, Reference Rate ผูกช่องกรอก
- **Phase 4:** AI Budget Analyst / Executive Summary (โครงข้อมูล Number+Reason+Assumption พร้อมแล้ว)

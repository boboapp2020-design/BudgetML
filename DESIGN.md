# Annual Budget Planner — เอกสารออกแบบระบบ (MVP)

**Plan • Analyze • Control** — ระบบจัดทำและวิเคราะห์งบประมาณประจำปี บริษัท น้ำตาลมิตรลาว จำกัด

> ข้อมูลตั้งต้น (Seed) มาจากไฟล์จริง `งบประมาณ.xlsx`:
> แผนกบริหารคุณภาพ (รหัส 1132) — งบปี 2025 รายเดือนจริง 8 GL, สมมติฐาน/สาเหตุเพิ่มลดปี 2026 จริง,
> อัตราแลกเปลี่ยนงบประมาณ 2026 (THB 680 / USD 21,738 กีบ), ราคาน้ำมัน (ดีเซล 19,210 / เบนซิน 23,520 กีบ/ลิตร)
>
> **รอบงบประมาณในระบบ:** ปีงบ **2026 (กำลังจัดทำ — OPEN)** เทียบปีก่อน **2025 (LOCKED, ข้อมูลจริง)**
> ตรงกับสถานะจริงของไฟล์ (ในไฟล์ยังไม่มีการกรอกงบ 2026 รายเดือน) — ตัวเลข draft 2026 ในระบบเป็นตัวอย่างสาธิต
> ที่ประมาณจากแนวโน้ม 2025 + เหตุผลจริง ผู้ใช้แก้ไขได้ทั้งหมด

---

## 1. System Architecture

**ข้อจำกัดจริงของเครื่องที่ใช้งาน:** ไม่มี Node.js / Python / runtime ใดๆ ติดตั้งอยู่
→ MVP จึงเป็น **Self-contained Web App (HTML + CSS + JavaScript ล้วน, ไม่ต้อง build, ไม่ต้องติดตั้งอะไร)**
เปิดใช้ได้ทันทีด้วย browser และออกแบบเป็นชั้น (layered) เพื่อ port ขึ้น server จริงภายหลังโดยไม่แก้ UI

```
┌─────────────────────────────────────────────────┐
│  Presentation   pages-user.js / pages-acc.js    │  หน้าจอ + event
│  Components     ui.js (layout, cards, grid…)     │
│  Visualization  charts.js (SVG, ไม่ใช้ CDN)      │
├─────────────────────────────────────────────────┤
│  Domain / Logic store.js                         │  RBAC, validation,
│                 (repository + business rules)    │  anomaly rules, audit
├─────────────────────────────────────────────────┤
│  Data           localStorage (JSON, versioned)   │  ← สลับเป็น REST API +
│                 seed.js (ข้อมูลจริงจาก Excel)     │    SQLite/Postgres ได้
└─────────────────────────────────────────────────┘
```

หลักการสำคัญ:
- **ทุก mutation ผ่าน store.js เท่านั้น** — ตรวจ role + สถานะ lock ก่อนเขียนเสมอ และบันทึก Audit Log อัตโนมัติ
- **ไม่ hard-code หน่วยงาน/GL/ปี** — ทุกอย่างเป็นข้อมูลใน "ฐานข้อมูล" (Accounting เพิ่ม Department/GL/ปีงบได้จาก UI)
- **AI-ready** — ข้อมูล Number + Reason + Assumption + Comparison ถูกเก็บเป็น structured JSON พร้อมส่งให้ AI วิเคราะห์ใน Phase 4

**เส้นทางขยายเป็นระบบ multi-user จริง (แนะนำ):** ติดตั้ง Node.js LTS → ย้าย store.js เป็น Express + SQLite
(schema เดียวกัน) → UI เดิมใช้ต่อได้ทั้งหมด

## 2. Database Schema

```
users            (id, username, name, role USER|ACCOUNTING, departmentId)
departments      (id, code, name, active)                    -- 1132 แผนกบริหารคุณภาพ
gl_accounts      (id, code, name, glGroup, active)           -- master GL (เพิ่มได้ไม่จำกัด)
department_gl    (departmentId, glId)                        -- มอบหมาย GL ให้หน่วยงาน
budget_periods   (year PK, status OPEN|CLOSED, openedAt, lockedAt, lockedBy)
budgets          (year, departmentId, glId, m1..m12 NUMBER|null,   -- null = ยังไม่กรอก
                  mtp1, mtp2)                                      -- งบปี +1/+2 ยอดรวมรายปี (MTP ช่อง BN-BQ)
gl_notes         (year, departmentId, glId, reason, assumption)
dept_status      (year, departmentId, status DRAFT|IN_PROGRESS|COMPLETED|SUBMITTED|
                  NEED_REVISION|LOCKED, submittedAt, revisionNote)
exchange_rates   (year, currency, rateToLAK)                 -- Budget Rate ทางการ + manual ได้
fuel_prices      (year, fuelType, pricePerLiter)
audit_logs       (id, ts, userId, userName, action, deptId, glCode, month, oldValue, newValue)
notifications    (id, ts, targetRole|targetDeptId, message, read)
```

ความสัมพันธ์: Department →N GL (ผ่าน department_gl), BudgetPeriod →N dept_status,
Budget = (year × department × GL × month) → Annual Total คำนวณเสมอ ไม่เก็บซ้ำ

## 3. User Flow

**Department User:** Login → Dashboard (สถานะ+ยอดรวม) → Budget Input (ตาราง GL×12เดือน,
auto-save draft, total real-time) → กรอก Reason/Assumption ราย GL → Review & Validation
(ครบทุก GL ทุกเดือน? ติดลบ? ผิดปกติ?) → Submit → ถ้า Accounting ตีกลับ = Need Revision → แก้ →
Submit ใหม่ → Accounting Lock → อ่านอย่างเดียว

**Accounting:** Login → Executive Dashboard (KPI + chart + alert) → Department Overview →
Drill-down: Department → GL → รายเดือน → Reason & Assumption (breadcrumb) → Analysis /
เทียบปีก่อน / Anomaly → Export CSV / Print → ตีกลับ (Need Revision) หรือ ปิดรอบ+Lock
(มี confirmation) → Audit Log ตรวจย้อนหลังได้ทุกการแก้ไข

## 4. Page Map

| Route | ผู้ใช้ | เนื้อหา |
|---|---|---|
| `#/login` | ทุกคน | เลือกบัญชีสาธิต |
| `#/dashboard` | USER | KPI ของหน่วยงาน, เทียบปีก่อน, สถานะ, สิ่งที่ต้องทำ |
| `#/budget` | USER | **ตารางกรอกงบ: GL เป็นแถว × เดือนเป็นคอลัมน์** + Reason/Assumption |
| `#/review` | USER | Validation + Completion % + เทียบปีก่อน + Submit |
| `#/calculators` | USER | อัตราแลกเปลี่ยน / ราคาน้ำมัน / Qty×Price×Freq → "ใช้ยอดนี้" |
| `#/acc/dashboard` | ACC | Executive KPI, chart, anomaly alerts |
| `#/acc/departments` | ACC | ภาพรวมทุกหน่วยงาน + **drill-down → GL → เดือน → เหตุผล** |
| `#/acc/analysis` | ACC | Top เพิ่ม/ลด, GL ใหญ่สุด, รายเดือน, ผิดปกติ, Export |
| `#/acc/control` | ACC | เปิด/ปิดรอบ, Lock/Unlock, ตีกลับ, จัดการ Department/GL/มอบหมาย/Rate |
| `#/acc/audit` | ACC | Audit Log (read-only) |

## 5. UI Design Concept

Modern Corporate Financial Dashboard — Desktop-first, Sidebar + Header + Content

- พื้นหลัง `#f9f9f7`, การ์ดขาว `#fcfcfb` + เส้นขอบบาง, Primary **Navy `#0d366b` / Blue `#256abf`**
- ตัวเลข: `tabular-nums`, จัดขวา, คั่นหลักพัน; เพิ่มขึ้น = แดง `#d03b3b`, ลดลง = เขียว `#006300`, คงที่ = เทา
- Chart palette ใช้ชุดที่ผ่านการ validate (colorblind-safe): น้ำเงิน `#2a78d6`, ส้ม `#eb6834`,
  เขียวมิ้นท์ `#1baf7a`, เหลือง `#eda100` … (ลำดับตายตัว); เทียบปี = ฟ้าอ่อน(ปีก่อน)/น้ำเงินเข้ม(ปีนี้)
- ตารางงบ: sticky คอลัมน์ GL + sticky header, Tab เลื่อนช่อง, วาง (paste) จาก Excel ได้หลายช่อง,
  ไฮไลต์ช่องที่แก้, ⚠ เตือนค่าผิดปกติ, Total คำนวณ real-time
- Dashboard เรียงตามหลัก **Summary → Comparison → Exception → Detail**
- Font: Segoe UI / Leelawadee (มีในเครื่อง ไม่พึ่ง CDN — ใช้งาน offline ได้สมบูรณ์)

## 6. Permission Matrix

| สิทธิ์ | USER | ACCOUNTING |
|---|:---:|:---:|
| ดู/กรอก/แก้งบของหน่วยงานตนเอง | ✓ | ✗ (ดูได้ **แก้ไม่ได้**) |
| ดูหน่วยงานอื่น | ✗ | ✓ ทุกหน่วยงาน |
| Submit งบ | ✓ | ✗ |
| ตีกลับ (Need Revision) | ✗ | ✓ |
| เปิด/ปิดรอบ, Lock / Unlock | ✗ | ✓ (Unlock = สิทธิ์พิเศษ ยืนยัน 2 ชั้น) |
| จัดการ Department / GL / มอบหมาย GL / Budget Rate | ✗ | ✓ |
| ดู Audit Log | ✗ | ✓ (read-only) |
| แก้ตัวเลขงบแทน User | ✗ | **✗ — บังคับที่ Data Layer** |

## 7. MVP Development Plan

- **Phase 1 (สร้างครบในรอบนี้):** Login/Role, ตารางกรอกงบ GL×เดือน + auto-total + auto-save,
  Reason/Assumption, Validation + Submit, Lock/Need Revision, Dashboard ทั้ง 2 ฝั่ง, เทียบปีก่อน,
  Drill-down, Audit Log, Notification, Calculators 3 ตัว, Export CSV + Print, Seed ข้อมูลจริง
- **Phase 2:** ติดตั้ง Node.js → API + SQLite + auth จริง (bcrypt/session) → รองรับ 20+ หน่วยงานพร้อมกัน
- **Phase 3:** Excel export แบบ formatted (.xlsx), Reference Rate ผูกช่องกรอก, Waterfall chart
- **Phase 4:** AI Budget Analyst / Executive Summary / Assumption Review (โครงข้อมูลพร้อมแล้ว)

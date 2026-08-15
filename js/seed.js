/* =============================================================
 * seed.js — ข้อมูลตั้งต้นของระบบ (Demo Data)
 *
 * แหล่งข้อมูล: งบประมาณ.xlsx (บริษัท น้ำตาลมิตรลาว จำกัด)
 *  - งบปี 2025 รายเดือนของแผนกบริหารคุณภาพ (1132) = ตัวเลขจริงจาก sheet "บริหารคุณภาพ"
 *  - สมมติฐาน / สาเหตุเพิ่มลด ปี 2026 = ข้อความจริงจากไฟล์
 *  - อัตราแลกเปลี่ยน + ราคาน้ำมัน = Assumption MTP 2026 จริง
 *  - ตัวเลข draft ปี 2026 รายเดือน = ตัวอย่างสาธิต (ไฟล์จริงยังไม่กรอก)
 *    ประมาณจากยอดเกิดจริง+คาดการณ์ 2025 และเหตุผลในไฟล์ — ผู้ใช้แก้ไขได้ทั้งหมด
 * ============================================================= */

const SEED = (() => {
  const Y_PREV = 2025;  // ปีก่อน (ข้อมูลจริง, ล็อกแล้ว)
  const Y_CUR  = 2026;  // ปีงบที่กำลังจัดทำ

  // 17 หน่วยงานตามฟอร์มจริง (จาก SEED_DATA ใน seed-data.js — สกัดจากไฟล์ ML_Form)
  // เปิดใช้งานทุกหน่วยงาน — Accounting ปิด/เปิดรายหน่วยงานได้ที่ Budget Control
  const departments = SEED_DATA.departments.map(d => ({
    id: d.id, code: d.code, name: d.name, nameEn: d.id === 'd1132' ? 'Quality Management' : '',
    active: true,
  }));

  // GL master 106 รายการจากไฟล์จริง (ชื่อ + กลุ่มบัญชี Group Sap)
  const glAccounts = SEED_DATA.glMaster.map(g => ({
    id: 'g' + g.code, code: g.code, name: g.name, glGroup: g.group || 'อื่นๆ', active: true,
  }));

  // มอบหมาย GL ให้แต่ละหน่วยงานตามฟอร์มจริง
  const departmentGL = [];
  SEED_DATA.departments.forEach(d =>
    d.glCodes.forEach(code => departmentGL.push({ departmentId: d.id, glId: 'g' + code })));

  // ผู้ใช้ 1 บัญชีต่อหน่วยงาน (username = รหัสหน่วยงาน) + Accounting
  // ⚠ ระบบรหัสผ่านรายแผนกจะเปิดใช้ภายหลัง — ตอนนี้เข้าโดยคลิกเลือกหน่วยงานที่หน้า Login
  const users = [
    { id: 'u2', username: 'accounting', password: '1234', name: 'แผนกบัญชี (Admin)', role: 'ACCOUNTING', departmentId: null },
    ...SEED_DATA.departments.map(d => ({
      id: 'u_' + d.id, username: d.code, password: '1234',
      name: 'ผู้ใช้งาน ' + d.name, role: 'USER', departmentId: d.id,
    })),
  ];

  const budgetPeriods = [
    { year: Y_PREV, status: 'CLOSED', openedAt: '2024-08-15T08:00:00', lockedAt: '2024-10-20T17:00:00', lockedBy: 'แผนกบัญชี (Admin)' },
    { year: Y_CUR,  status: 'OPEN',   openedAt: '2025-08-20T08:00:00', lockedAt: null, lockedBy: null },
  ];

  // ---------- งบประมาณปี 2025 รายเดือนจริง ทุกหน่วยงาน × GL (จาก SEED_DATA, checksum ตรงกับไฟล์ 100%) ----------
  // ปี 2026 ไม่ seed แถว = ฟอร์มเปล่าทุกช่อง (ระบบสร้างแถวเองเมื่อผู้ใช้กรอก)
  const budgets = [];
  SEED_DATA.departments.forEach(d => {
    d.glCodes.forEach(code => {
      budgets.push({
        year: Y_PREV, departmentId: d.id, glId: 'g' + code,
        months: d.budget2025[code].map(Number), // string (round-trip precision) → number
        mtp1: null, mtp2: null,
        updatedAt: '2024-09-20T10:00:00', updatedBy: 'ข้อมูลจากไฟล์ ML_Form 2026',
      });
    });
  });

  /* ---------- MOCK งบประมาณปี 2026 ทุกหน่วยงาน (สำหรับออกแบบ Dashboard) ----------
   * สร้างแบบ deterministic จากฐานปี 2025 จริง (factor 0.85–1.30 ต่อ GL)
   * สถานะคละกันให้ครบทุกเคส: SUBMITTED / COMPLETED / IN_PROGRESS / NEED_REVISION */
  const h32 = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const rk = n => Math.round(n / 1000) * 1000; // ปัดหลักพัน (ตัวเลขตั้งงบ)
  const ST_PLAN = {
    '1111': 'SUBMITTED', '1122': 'SUBMITTED', '1161': 'SUBMITTED', '1155': 'SUBMITTED',
    '1164': 'SUBMITTED', '1144': 'SUBMITTED', '1143': 'SUBMITTED', '1145': 'SUBMITTED',
    '1141': 'SUBMITTED', '1131': 'SUBMITTED', '1133': 'SUBMITTED',
    '1172': 'COMPLETED', '1227': 'COMPLETED',
    '1132': 'IN_PROGRESS', '1142': 'IN_PROGRESS', '1171': 'IN_PROGRESS',
    '1181': 'NEED_REVISION',
  };
  const REASONS = [
    'ปรับตามแผนดำเนินงานปี 2026 และผลเบิกจ่ายจริงปี 2025',
    'เพิ่มขึ้นตามแผนซ่อมบำรุงและการต่ออายุใบรับรองประจำปี 2026',
    'ลดลงจากการควบคุมค่าใช้จ่ายและการเจรจาราคากับผู้ให้บริการ',
    'ปรับตามอัตราแลกเปลี่ยนและราคากลางที่ประกาศใช้ปี 2026',
  ];
  const ASSUMES = [
    'ประมาณการจากปริมาณงานเฉลี่ยปี 2025 × ราคากลางปี 2026',
    'คำนวณจากสัญญาผู้ให้บริการปัจจุบันและแผนงานรายไตรมาส',
    'อ้างอิง Budget Rate ที่แผนกบัญชีประกาศ (THB 680 / USD 21,738 กีบ)',
  ];

  const glNotes = [];
  const deptStatus = [];
  SEED_DATA.departments.forEach(d => {
    const st = ST_PLAN[d.code] || 'SUBMITTED';
    const totals = [];
    d.glCodes.forEach((code, gi) => {
      const prev = d.budget2025[code].map(Number);
      const h = h32(d.code + ':' + code);
      const factor = 0.85 + (h % 46) / 100;
      const months = prev.map(v => (v > 0 ? rk(v * factor) : 0));
      const total = months.reduce((s, v) => s + v, 0);
      let mtp1 = total > 0 ? rk(total * (1.02 + (h % 7) / 100)) : 0;
      let mtp2 = total > 0 ? rk(mtp1 * 1.045) : 0;
      if (st === 'IN_PROGRESS' && gi % 3 === 0) { // บาง GL ยังกรอกไม่ครบ
        const cut = 2 + (h % 4);
        for (let i = 12 - cut; i < 12; i++) months[i] = null;
        mtp1 = null; mtp2 = null;
      }
      budgets.push({ year: Y_CUR, departmentId: d.id, glId: 'g' + code, months, mtp1, mtp2,
        updatedAt: '2026-08-14T15:00:00', updatedBy: 'ผู้ใช้งาน ' + d.name });
      totals.push({ code, total });
    });
    // เหตุผล/สมมติฐาน: 3 GL ยอดสูงสุดของแต่ละหน่วยงาน
    totals.sort((a, b) => b.total - a.total).slice(0, 3).forEach(t => {
      if (t.total <= 0) return;
      const h = h32(d.code + '/' + t.code);
      glNotes.push({ year: Y_CUR, departmentId: d.id, glId: 'g' + t.code,
        reason: REASONS[h % REASONS.length], assumption: ASSUMES[h % ASSUMES.length] });
    });
    deptStatus.push({ year: Y_PREV, departmentId: d.id, status: 'LOCKED', submittedAt: '2024-09-22T16:40:00', revisionNote: null });
    deptStatus.push({ year: Y_CUR, departmentId: d.id, status: st,
      submittedAt: (st === 'SUBMITTED' || st === 'NEED_REVISION') ? '2026-08-1' + (2 + (h32(d.code) % 3)) + 'T10:30:00' : null,
      revisionNote: st === 'NEED_REVISION' ? 'ยอดค่าซ่อมแซมสูงกว่าปีก่อนมาก กรุณาตรวจสอบและระบุสมมติฐานเพิ่มเติม' : null });
  });

  // ตัวอย่างรายละเอียดค่าใช้จ่ายรายช่อง (feature 🧾)
  const cellDetails = [];
  [['d1132', 5], ['d1144', 2]].forEach(([deptId, mi]) => {
    const d = SEED_DATA.departments.find(x => x.id === deptId);
    const row = budgets.find(b => b.year === Y_CUR && b.departmentId === deptId && typeof b.months[mi] === 'number' && b.months[mi] > 0);
    if (!row) return;
    const v = row.months[mi];
    const a1 = rk(v * 0.6), a2 = v - a1;
    cellDetails.push({ year: Y_CUR, departmentId: deptId, glId: row.glId, month: mi,
      items: [{ desc: 'รายการหลักตามแผนงานประจำปี', amount: a1 }, { desc: 'ค่าดำเนินการส่วนเพิ่ม', amount: a2 }],
      updatedAt: '2026-08-14T15:05:00', updatedBy: 'ผู้ใช้งาน ' + d.name });
  });

  // ---------- Budget Exchange Rate ปี 2026 (ทางการ จากไฟล์; CNY/EUR แปลงผ่าน cross rate THB) ----------
  const exchangeRates = [
    { year: Y_CUR, currency: 'THB', rateToLAK: 680 },
    { year: Y_CUR, currency: 'USD', rateToLAK: 21738 },
    { year: Y_CUR, currency: 'CNY', rateToLAK: 3060 },    // 4.50 CNY/THB × 680
    { year: Y_CUR, currency: 'EUR', rateToLAK: 25976 },   // 38.20 EUR/THB × 680
  ];

  const fuelPrices = [
    { year: Y_CUR, fuelType: 'ดีเซล',  pricePerLiter: 19210 },
    { year: Y_CUR, fuelType: 'เบนซิน', pricePerLiter: 23520 },
  ];

  const auditLogs = [];

  const notifications = [
    { id: 'n1', ts: '2026-08-15T08:00:00', targetDeptId: null, targetRole: 'ACCOUNTING', message: 'มี 11 หน่วยงานส่งงบประมาณปี 2026 แล้ว รอตรวจสอบ · เหลือ 6 หน่วยงานยังไม่ส่ง', read: false },
    { id: 'n2', ts: '2026-08-15T08:00:00', targetDeptId: 'd1181', targetRole: null, message: 'งบประมาณปี 2026 ถูกส่งกลับให้แก้ไข — ยอดค่าซ่อมแซมสูงกว่าปีก่อนมาก กรุณาตรวจสอบ', read: false },
    { id: 'n3', ts: '2026-08-15T08:00:00', targetDeptId: 'd1132', targetRole: null, message: 'กำหนดส่งงบประมาณปี 2026 ภายใน 23 กันยายน 2026 เวลา 17.00 น.', read: false },
  ];

  return {
    meta: { schemaVersion: 5, seededAt: null, appName: 'Annual Budget Planner', company: 'บริษัท น้ำตาลมิตรลาว จำกัด', currency: 'LAK', yearCurrent: Y_CUR, yearPrevious: Y_PREV },
    users, departments, glAccounts, departmentGL, budgetPeriods, budgets, glNotes, deptStatus,
    cellDetails, // รายละเอียดค่าใช้จ่ายรายช่อง (GL×เดือน)
    exchangeRates, fuelPrices, auditLogs, notifications,
  };
})();

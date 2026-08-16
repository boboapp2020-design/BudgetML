/* =============================================================
 * seed.js — ข้อมูลตั้งต้นของระบบ (schema v9: ทั้งบริษัท 62 แผนก)
 *
 * แหล่งข้อมูล: ML_งบค่าใช้จ่ายต้นปี_2026-แจ้งหน่วยงาน.xlsx (ผ่าน SEED_DATA)
 *  - งบปี 2026 = งบอนุมัติจริงทั้งบริษัท 1,812 แถว CCT × GL (checksum ตรงไฟล์ 100%)
 *  - ทุกแผนกอยู่สถานะ LOCKED และรอบปี 2026 ปิดแล้ว (ตามจริง: แจ้งหน่วยงานแล้ว)
 *    → ขั้นถัดไปของระบบคือ "เปิดรอบ Revise กลางปี" จาก Budget Control
 *  - งบปี 2025 รายเดือนจริง เฉพาะฝ่ายสนับสนุน 17 หน่วยเดิม (ผูกผ่านรหัส CCT)
 *  - สมมติฐาน / สาเหตุเพิ่ม-ลด / MTP 2027-2028 มาจากไฟล์จริง
 *  - rowKey ของแถว = glId + '@' + cct  เช่น "g635100@8003303000"
 * ============================================================= */

const SEED = (() => {
  const Y_PREV = 2025;  // ปีก่อน (ข้อมูลจริงเฉพาะฝ่ายสนับสนุน, ล็อกแล้ว)
  const Y_CUR  = 2026;  // ปีงบอนุมัติปัจจุบัน (ล็อกแล้ว รอรอบ Revise)

  const departments = SEED_DATA.departments.map(d => ({
    id: d.id, code: d.code, name: d.name, nameEn: '',
    side: d.side, // '1'=สนับสนุน '2'=อ้อย '3'=โรงงาน '4'=บริหารสำนักงาน
    active: true,
  }));

  const glAccounts = SEED_DATA.glMaster.map(g => ({
    id: 'g' + g.code, code: g.code, name: g.name, glGroup: g.group || 'อื่นๆ',
    ioGroup: g.ioGroup || 'ไม่คุม', // รหัสกลุ่ม IO 2 หลัก หรือ 'ไม่คุม' (จากชีท ML&SF_รหัสควบคุมงบ)
    active: true,
  }));

  // หน่วยงานย่อย (Cost Center) ทั้งบริษัท
  const cctMaster = SEED_DATA.cctMaster.map(c => ({ code: c.code, name: c.name, departmentId: c.deptId }));

  // การมอบหมายระดับแถว: CCT × GL (+ IO / code a) — หน่วยกรอกจริง
  const departmentRows = [];
  SEED_DATA.departments.forEach(d => d.rows.forEach(r =>
    departmentRows.push({ departmentId: d.id, cct: r.cct, glId: 'g' + r.gl, io: r.io || '', codeA: r.codeA || '' })));

  // มุมมองระดับ GL (distinct) — สำหรับ dashboard/วิเคราะห์
  const departmentGL = [];
  const seenDG = new Set();
  departmentRows.forEach(x => {
    const k = x.departmentId + '|' + x.glId;
    if (!seenDG.has(k)) { seenDG.add(k); departmentGL.push({ departmentId: x.departmentId, glId: x.glId }); }
  });

  const users = [
    { id: 'u2', username: 'accounting', password: '1234', name: 'แผนกบัญชี (Admin)', role: 'ACCOUNTING', departmentId: null },
    ...SEED_DATA.departments.map(d => ({
      id: 'u_' + d.id, username: d.code, password: '1234',
      name: 'ผู้ใช้งาน ' + d.name, role: 'USER', departmentId: d.id,
    })),
  ];

  const budgetPeriods = [
    { year: Y_PREV, status: 'CLOSED', openedAt: '2024-08-15T08:00:00', lockedAt: '2024-10-20T17:00:00', lockedBy: 'แผนกบัญชี (Admin)' },
    // ปี 2026: งบอนุมัติแจ้งหน่วยงานแล้ว → ปิดรอบตั้งงบ รอเปิดรอบ Revise กลางปี
    { year: Y_CUR,  status: 'CLOSED', openedAt: '2025-08-20T08:00:00', lockedAt: '2025-11-28T17:00:00', lockedBy: 'แผนกบัญชี (Admin)' },
  ];

  const budgets = [];
  const glNotes = [];
  const deptStatus = [];

  // ---------- งบปี 2025 รายเดือนจริง (ฝ่ายสนับสนุน — ผูกผ่าน CCT) ----------
  SEED_DATA.budgets2025.forEach(b => {
    budgets.push({
      year: Y_PREV, departmentId: b.deptId, glId: 'g' + b.gl, cct: b.cct,
      months: b.m.map(Number), mtp1: null, mtp2: null,
      updatedAt: '2024-09-20T10:00:00', updatedBy: 'ข้อมูลจากไฟล์ ML_Form 2026',
    });
  });

  // ---------- งบปี 2026 อนุมัติจริง ทั้งบริษัท (LOCKED) ----------
  SEED_DATA.departments.forEach(d => {
    d.rows.forEach(r => {
      budgets.push({
        year: Y_CUR, departmentId: d.id, glId: 'g' + r.gl, cct: r.cct,
        months: r.m.map(Number),
        mtp1: (typeof r.y1 === 'number') ? r.y1 : null,  // MTP ปี 2027 จากไฟล์
        mtp2: (typeof r.y2 === 'number') ? r.y2 : null,  // MTP ปี 2028 จากไฟล์
        updatedAt: '2025-11-25T16:00:00', updatedBy: 'ไฟล์งบอนุมัติ 2026 (แจ้งหน่วยงาน)',
      });
      // สมมติฐาน / สาเหตุเพิ่ม-ลด จากไฟล์จริง
      if (r.a || r.rs) {
        glNotes.push({ year: Y_CUR, departmentId: d.id, rowKey: 'g' + r.gl + '@' + r.cct,
          reason: r.rs || '', assumption: r.a || '' });
      }
    });
    deptStatus.push({ year: Y_PREV, departmentId: d.id, status: 'LOCKED', submittedAt: '2024-09-22T16:40:00', revisionNote: null });
    deptStatus.push({ year: Y_CUR, departmentId: d.id, status: 'LOCKED', submittedAt: '2025-11-20T16:40:00', revisionNote: null });
  });

  const cellDetails = [];

  const exchangeRates = [
    { year: Y_CUR, currency: 'THB', rateToLAK: 680 },
    { year: Y_CUR, currency: 'USD', rateToLAK: 21738 },
    { year: Y_CUR, currency: 'CNY', rateToLAK: 3060 },
    { year: Y_CUR, currency: 'EUR', rateToLAK: 25976 },
  ];

  const fuelPrices = [
    { year: Y_CUR, fuelType: 'ดีเซล',  pricePerLiter: 19210 },
    { year: Y_CUR, fuelType: 'เบนซิน', pricePerLiter: 23520 },
  ];

  const auditLogs = [];

  const notifications = [
    { id: 'n1', ts: '2025-11-28T17:00:00', targetDeptId: null, targetRole: 'ACCOUNTING',
      message: 'งบประมาณปี 2026 ทั้งบริษัท (62 แผนก) อนุมัติและปิดรอบแล้ว · ขั้นถัดไป: เปิดรอบ Revise กลางปีที่ Budget Control', read: false },
  ];

  return {
    meta: {
      schemaVersion: 9, seededAt: null, appName: 'Annual Budget Planner',
      company: 'บริษัท น้ำตาลมิตรลาว จำกัด', currency: 'LAK',
      yearCurrent: Y_CUR, yearPrevious: Y_PREV,
      sides: SEED_DATA.sides, // ชื่อด้าน: {'1':'ด้านสนับสนุน',...}
    },
    users, departments, glAccounts, cctMaster, departmentRows, departmentGL,
    budgetPeriods, budgets, glNotes, deptStatus, cellDetails,
    budgetSnapshots: [], // งบเดิม (ORIGINAL) ถูก freeze ตอนเปิดรอบ Revise
    actuals: [],         // ตัวเลขเกิดจริงรายเดือน (บัญชีเป็นผู้ใส่)
    exchangeRates, fuelPrices, auditLogs, notifications,
  };
})();

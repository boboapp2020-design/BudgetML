/* =============================================================
 * seed.js — ข้อมูลตั้งต้นของระบบ (schema v11)
 *
 * แหล่งข้อมูล: ตัวอย่างการทำงบค่าใช้จ่าย.xlsx (งบต้นปี 2026 ทั้งบริษัท @680)
 *  ผ่าน SEED_DATA (js/seed-data.js — auto-generated, checksum 1,444,780,372,591)
 *
 * โมเดลใหม่ (จำแนกตามไฟล์จริง):
 *  - "department" ของแอป = หน่วยงาน (คอลัมน์ D) = leaf ที่ล็อกอินเข้ามากรอกงบ (152 บัญชี)
 *    · ล็อกอินด้วยรหัส CCT (คอลัมน์ C)  · 1 หน่วยงานอาจมีหลาย CCT (ชื่อเดียวกันรวมเป็นบัญชีเดียว)
 *  - ผังกำกับดูแล (Oversight) เหนือขึ้นไป: บริษัท → ด้าน(CR) → ฝ่าย(CP) → แผนก(F) → [หน่วยงาน]
 *  - งบปี 2026 = งบต้นปีอนุมัติจริง (LOCKED) · ปีก่อน 2025 = ฐานว่าง (ไฟล์นี้ไม่มี 2025)
 *  - rowKey ของแถว = glId + '@' + cct
 * ============================================================= */

const SEED = (() => {
  const Y_PREV = 2025;  // ปีก่อน (ไม่มีข้อมูลในไฟล์นี้ → ฐานว่าง)
  const Y_CUR  = 2026;  // ปีงบอนุมัติปัจจุบัน (งบต้นปี 2026, ล็อกแล้ว รอรอบ Revise)
  const U = SEED_DATA.units;
  const COMPANY = 'บริษัท น้ำตาลมิตรลาว จำกัด';

  // ---------- app department = หน่วยงาน (หน่วยกรอกจริง) ----------
  const departments = U.map(u => ({
    id: u.id, code: u.code, name: u.name, nameEn: '',
    side: u.side, active: true,
    // บริบทลำดับชั้น (ครบ 16 คอลัมน์จากไฟล์) — แผนก(F)/ฝ่ายย่อย/ฝ่าย(CP)/ด้าน(CR)/หน่วยงานรับผิดชอบ
    deptCode: u.deptCode, deptName: u.deptName,
    subDiv: u.subDiv, subDivCode: u.subDivCode,
    div: u.div, area: u.area, areaCode: u.areaCode,
    respUnit: u.respUnit, ccts: u.ccts,
  }));

  // ---------- GL master (173 บัญชี + Type + Group PPT/Sap) ----------
  const glAccounts = SEED_DATA.glMaster.map(g => ({
    id: 'g' + g.code, code: g.code, name: g.name,
    glGroup: g.group || 'อื่นๆ',      // Group GL PPT
    glGroupSap: g.grpSap || '',        // Group Sap
    glType: g.type || '',              // Type (VC-Exp / FC / SAL / ...)
    ioGroup: 'ไม่คุม',
    active: true,
  }));

  // ---------- Routing ผู้กรอก (แทนที่การกรอกเดิม) ----------
  //  คอลัมน์ "หน่วยงานที่รับผิดชอบ" (resp) กำหนดว่าใครกรอก แถวนั้น ๆ:
  //   ACC + Group Sap มี 'อ้อย'  → แผนกบริการไร่   (u8001010400)
  //   ACC อื่น ๆ                 → แผนกบัญชีทั่วไป (u8003851100)
  //   HR                         → แผนกบุคคลโรงงาน (u8003821400)
  //   HR PPE / หน่วยงาน / ค่าส่งออกน้ำตาล / อื่น ๆ → หน่วยงานเจ้าของกรอกเอง (ตามเดิม)
  //  ต้นทุนถูก "ย้าย" ไปเป็นของแผนกกลาง (roll-up ใน dashboard/ด้าน ตามแผนกกลาง) ตามที่ผู้ใช้เลือก
  const F_OOI = 'u8001010400', F_ACC = 'u8003851100', F_HR = 'u8003821400';
  const glSapOf = {}; SEED_DATA.glMaster.forEach(g => { glSapOf['g' + g.code] = g.grpSap || ''; });
  function fillerOf(r, ownerId) {
    const resp = (r.resp || '').trim();
    if (resp === 'ACC') return (glSapOf['g' + r.gl] || '').indexOf('อ้อย') >= 0 ? F_OOI : F_ACC;
    if (resp === 'HR') return F_HR;
    return ownerId;
  }

  // ---------- หน่วยงานย่อย (Cost Center) — mapping CCT → หน่วยงาน ----------
  const cctMaster = [];
  U.forEach(u => u.ccts.forEach(c => cctMaster.push({ code: c, name: u.name, departmentId: u.id })));

  // ---------- การมอบหมายระดับแถว: CCT × GL (+ IO / code a) — departmentId = ผู้กรอกจริง (routing) ----------
  const departmentRows = [];
  U.forEach(u => u.rows.forEach(r =>
    departmentRows.push({ departmentId: fillerOf(r, u.id), cct: r.cct, glId: 'g' + r.gl, io: r.io || '', codeA: r.codeA || '' })));

  // ---------- มุมมองระดับ GL (distinct) ----------
  const departmentGL = [];
  const seenDG = new Set();
  departmentRows.forEach(x => {
    const k = x.departmentId + '|' + x.glId;
    if (!seenDG.has(k)) { seenDG.add(k); departmentGL.push({ departmentId: x.departmentId, glId: x.glId }); }
  });

  /* ---------- ผังกำกับดูแล (Oversight tree) — สร้างอัตโนมัติจากไฟล์จริง ----------
   * บริษัท(co) → ด้าน(area) → ฝ่าย(div) → แผนก(deptf, leaf: deptCodes = รหัสหน่วยงานใต้แผนก)
   * โครงสร้าง node: { id, name, parent, deptCodes?[], budget? }  (Store helpers ใช้รูปแบบนี้)
   */
  const OVERSIGHT = [];
  OVERSIGHT.push({ id: 'co', name: COMPANY, parent: null });

  // ด้าน (area) — parent = บริษัท
  const areaId = {}; // area name → node id
  SEED_DATA.areas.forEach(a => {
    const id = 'area_' + a.side;
    areaId[a.name] = id;
    OVERSIGHT.push({ id, name: a.name, parent: 'co' });
  });

  // ฝ่าย (div) — key ด้วย area+div (ชื่อฝ่ายซ้ำข้ามด้านได้) — parent = ด้าน
  const divId = {}; // (area '~' div) → node id
  let dvi = 0;
  SEED_DATA.divisions.forEach(d => {
    const key = d.area + '~' + d.name;
    if (divId[key]) return;
    const id = 'div_' + (++dvi);
    divId[key] = id;
    OVERSIGHT.push({ id, name: d.name, parent: areaId[d.area] || 'co' });
  });

  // แผนก (dept F) — parent = ฝ่าย · deptCodes = รหัสหน่วยงาน (unit.code) ที่สังกัดแผนกนี้
  SEED_DATA.depts.forEach(dp => {
    const codes = U.filter(u => u.deptCode === dp.code).map(u => u.code);
    OVERSIGHT.push({
      id: 'deptf_' + dp.code,
      name: dp.name + ' (' + dp.code + ')',
      parent: divId[dp.area + '~' + dp.div] || areaId[dp.area] || 'co',
      deptCodes: codes,
    });
  });

  // ผู้จัดการ/ผู้ดูแล 1 คน/หน่วยกำกับดูแลทุกระดับ — เห็น rollup เฉพาะ subtree ของตน
  const managers = OVERSIGHT.map(u => ({
    id: 'mgr_' + u.id, username: 'MGR:' + u.id, password: '1234',
    name: u.name, role: 'MANAGER', departmentId: null, orgUnit: u.id,
  }));

  // ---------- ผู้ใช้ ----------
  const users = [
    { id: 'u2', username: 'accounting', password: '1234', name: 'แผนกบัญชี (Admin)', role: 'ACCOUNTING', departmentId: null },
    ...managers,
    ...U.map(u => ({
      id: 'user_' + u.id, username: u.code, password: '1234',
      name: u.name, role: 'USER', departmentId: u.id,
    })),
  ];

  // ---------- รอบงบประมาณ ----------
  const budgetPeriods = [
    { year: Y_PREV, status: 'CLOSED', openedAt: '2024-08-15T08:00:00', lockedAt: '2024-10-20T17:00:00', lockedBy: COMPANY },
    { year: Y_CUR,  status: 'CLOSED', openedAt: '2025-08-20T08:00:00', lockedAt: '2025-11-28T17:00:00', lockedBy: 'แผนกบัญชี (Admin)' },
  ];

  // ---------- งบปี 2026 อนุมัติจริง ทั้งบริษัท (LOCKED) ----------
  const budgets = [];
  const glNotes = [];
  const deptStatus = [];
  U.forEach(u => {
    u.rows.forEach(r => {
      budgets.push({
        year: Y_CUR, departmentId: fillerOf(r, u.id), glId: 'g' + r.gl, cct: r.cct,
        months: r.m.map(Number), mtp1: null, mtp2: null,
        updatedAt: '2025-11-25T16:00:00', updatedBy: 'ไฟล์งบต้นปี 2026',
      });
    });
  });
  // สถานะ = ตามผู้กรอกจริง (distinct owner หลัง routing)
  [...new Set(budgets.map(b => b.departmentId))].forEach(did =>
    deptStatus.push({ year: Y_CUR, departmentId: did, status: 'LOCKED', submittedAt: '2025-11-20T16:40:00', revisionNote: null }));

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
      message: 'งบประมาณปี 2026 ทั้งบริษัท (' + U.length + ' หน่วยงาน) อนุมัติและปิดรอบแล้ว · ขั้นถัดไป: เปิดรอบ Revise กลางปีที่ Budget Control', read: false },
  ];

  return {
    meta: {
      schemaVersion: 11, seededAt: null, appName: 'Annual Budget Planner',
      company: COMPANY, currency: 'LAK',
      yearCurrent: Y_CUR, yearPrevious: Y_PREV,
      sides: SEED_DATA.sides,
    },
    oversight: OVERSIGHT,
    users, departments, glAccounts, cctMaster, departmentRows, departmentGL,
    budgetPeriods, budgets, glNotes, deptStatus, cellDetails,
    budgetSnapshots: [],
    actuals: [],
    exchangeRates, fuelPrices, auditLogs, notifications,
  };
})();

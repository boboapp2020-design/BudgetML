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

  // ---------- app department = แผนก (คอลัมน์ F) — หน่วยกรอกจริง (64 แผนก) ----------
  //  ผู้กรอก 1 คน = 1 แผนก(F) · กรอกทุก GL ทุกหน่วยงาน(D)/CCT ใต้แผนกตน (ยกเว้น HR/ACC routing)
  const sideOfArea = {}; SEED_DATA.areas.forEach(a => { sideOfArea[a.name] = a.side; });
  const departments = SEED_DATA.depts.map(dp => ({
    id: 'd' + dp.code, code: dp.code, name: dp.name, nameEn: '',
    side: sideOfArea[dp.area] || '', active: true,
    area: dp.area, div: dp.div, subDiv: dp.subDiv,   // สังกัด(CT) / ฝ่าย(CP=ผู้อนุมัติ) / ฝ่ายย่อย(CO)
  }));

  // ---------- GL master (173 บัญชี + Type + Group PPT/Sap) ----------
  const pptCodeOf = (typeof PPT_MAP !== 'undefined') ? PPT_MAP.glCode : {};
  const glAccounts = SEED_DATA.glMaster.map(g => ({
    id: 'g' + g.code, code: g.code, name: g.name,
    glGroup: g.group || 'อื่นๆ',      // Group GL PPT (ชื่อกลุ่ม)
    glGroupSap: g.grpSap || '',        // Group Sap
    glType: g.type || '',              // Type (VC-Exp / FC / SAL / ...)
    pptCode: pptCodeOf[g.code] || null, // รหัสหมวด PPT 1-33 (ตัวแยกไร่บริษัท/ส่งเสริม — ใช้หน้าต้นทุนต่อหน่วย)
    ioGroup: 'ไม่คุม',
    active: true,
  }));

  // ---------- Routing ผู้กรอก (ระดับแผนก F) ----------
  //  ปกติ: แถวถูกกรอกโดย "แผนก(F) เจ้าของ" (dp.code ของหน่วยงานนั้น)
  //  ยกเว้นตามคอลัมน์ resp (หน่วยงานที่รับผิดชอบ):
  //   ACC + Group Sap มี 'อ้อย' → แผนกบริการไร่ (F 2712)
  //   ACC อื่น ๆ                → แผนกบัญชีทั่วไปและการเงิน (F 1161)
  //   HR                        → แผนกทรัพยากรบุคคล (F 1155)
  //   HR PPE / หน่วยงาน / ค่าส่งออกน้ำตาล / อื่น ๆ → แผนกเจ้าของกรอกเอง
  //  ต้นทุนย้ายไปเป็นของแผนกกลาง (roll-up ตามแผนกกลาง) ตามที่ผู้ใช้เลือก
  const F_OOI = 'd2712', F_ACC = 'd1161', F_HR = 'd1155';
  const glSapOf = {}; SEED_DATA.glMaster.forEach(g => { glSapOf['g' + g.code] = g.grpSap || ''; });
  function fillerOf(r, ownerDeptCode) {
    const resp = (r.resp || '').trim();
    if (resp === 'ACC') return (glSapOf['g' + r.gl] || '').indexOf('อ้อย') >= 0 ? F_OOI : F_ACC;
    if (resp === 'HR') return F_HR;
    return 'd' + ownerDeptCode;
  }

  // ---------- หน่วยงานย่อย (Cost Center) — mapping CCT → ชื่อหน่วยงาน(D) + แผนก(F) ----------
  const cctMaster = [];
  U.forEach(u => u.ccts.forEach(c => cctMaster.push({ code: c, name: u.name, departmentId: 'd' + u.deptCode })));

  // ---------- การมอบหมายระดับแถว: CCT × GL (+ IO / code a) — departmentId = ผู้กรอกจริง (routing) ----------
  const departmentRows = [];
  U.forEach(u => u.rows.forEach(r =>
    departmentRows.push({ departmentId: fillerOf(r, u.deptCode), cct: r.cct, glId: 'g' + r.gl, io: r.io || '', codeA: r.codeA || '' })));

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

  // ฝ่าย (div = คอลัมน์ CP) — ★ ชั้นผู้อนุมัติ (approver) ★ — key ด้วย area+div — parent = สังกัด
  const divId = {}; // (area '~' div) → node id
  let dvi = 0;
  SEED_DATA.divisions.forEach(d => {
    const key = d.area + '~' + d.name;
    if (divId[key]) return;
    const id = 'div_' + (++dvi);
    divId[key] = id;
    OVERSIGHT.push({ id, name: d.name, parent: areaId[d.area] || 'co', approver: true });
  });

  // ฝ่ายย่อย (subDiv = คอลัมน์ CO) — ชั้นย่อยใต้ฝ่าย — key ด้วย area+div+subDiv — parent = ฝ่าย
  const subId = {}; // (area '~' div '~' subDiv) → node id
  let svi = 0;
  U.forEach(u => {
    const sd = u.subDiv || u.div;
    const key = u.area + '~' + u.div + '~' + sd;
    if (subId[key]) return;
    const id = 'sub_' + (++svi);
    subId[key] = id;
    OVERSIGHT.push({ id, name: sd, parent: divId[u.area + '~' + u.div] || areaId[u.area] || 'co' });
  });

  // แผนก (dept F = app department / หน่วยกรอก) — parent = ฝ่ายย่อย · deptCodes = รหัสแผนกตัวเอง
  SEED_DATA.depts.forEach(dp => {
    const sd = dp.subDiv || dp.div;
    OVERSIGHT.push({
      id: 'deptf_' + dp.code,
      name: dp.name + ' (' + dp.code + ')',
      parent: subId[dp.area + '~' + dp.div + '~' + sd] || divId[dp.area + '~' + dp.div] || areaId[dp.area] || 'co',
      deptCodes: [dp.code],
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
    ...departments.map(d => ({
      id: 'user_' + d.id, username: d.code, password: '1234',
      name: d.name, role: 'USER', departmentId: d.id,
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
        year: Y_CUR, departmentId: fillerOf(r, u.deptCode), glId: 'g' + r.gl, cct: r.cct,
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
      message: 'งบประมาณปี 2026 ทั้งบริษัท (' + departments.length + ' แผนก) อนุมัติและปิดรอบแล้ว · ขั้นถัดไป: เปิดรอบ Revise กลางปีที่ Budget Control', read: false },
  ];

  return {
    meta: {
      schemaVersion: 11, seededAt: null, appName: 'Annual Budget Planner',
      company: COMPANY, currency: 'LAK',
      yearCurrent: Y_CUR, yearPrevious: Y_PREV,
      sides: SEED_DATA.sides,
      // สิทธิ์กรอก "ปริมาณผลิต" ราย metric (นอกจากแอดมินบัญชี) — รหัสแผนก F · แก้ที่นี่ที่เดียว
      volumeEditors: {
        caneCompany: ['2712'],    // ตันอ้อยไร่บริษัท → แผนกบริการไร่
        caneCommunity: ['2712'],  // ตันอ้อยไร่ส่งเสริม → แผนกบริการไร่
        sugarProduce: [],         // ตันน้ำตาลผลิต → ฝ่ายผลิต (ยังไม่กำหนด = เว้นว่าง รอ link)
        sugarTrading: [],         // ตันน้ำตาล Trading → ฝ่ายผลิต (ยังไม่กำหนด)
      },
      pptCategories: (typeof PPT_MAP !== 'undefined') ? PPT_MAP.codeName : {},  // รหัสหมวด PPT → ชื่อ
      // สิทธิ์กรอก "จำนวนเงิน" หน้าต้นทุนต่อหน่วย รายหมวด PPT (รหัส → รหัสแผนก F) — แก้ที่นี่ที่เดียว
      //  ตอนนี้: บริการไร่ (2712) กรอกเฉพาะค่าอ้อย หมวด 1-6 · หมวดอื่นรอมอบหมาย (แอดมินกรอกได้เสมอ)
      pptEditors: { '1': ['2712'], '2': ['2712'], '3': ['2712'], '4': ['2712'], '5': ['2712'], '6': ['2712'] },
    },
    oversight: OVERSIGHT,
    users, departments, glAccounts, cctMaster, departmentRows, departmentGL,
    budgetPeriods, budgets, glNotes, deptStatus, cellDetails,
    budgetSnapshots: [],
    actuals: [],
    // จำนวนเงินหน้าต้นทุนต่อหน่วย — ปี 2025 seed จากชีท "สรุป PPT รายฝ่าย_บาท" คอลัมน์ BE (งบปรับปรุง Revise 2025)
    pptAmounts: [96547666531, 5600393022, 13397836929, 377703432450, 21710158500, 22966428267, 2817989908, 112553890143, 12974344444, 9533276229, 12003552851, 10105424450, 15527734873, 2728090987, 2794106715, 46491537759, 6369665519, 4330224090, 14999684327, 3006389005, 3738815928, 83966784606, 14079004689, 1366114440, 11200587787, 1149540806, 254734127, -35945112411, -8214251691, 0, 184029066625, 7782874597, 16091638300]
      .map((a, i) => ({ year: Y_PREV, code: i + 1, amount: a, updatedAt: null, updatedBy: 'ไฟล์ Revise 2025 (ชีท PPT)' })),
    pptSubmits: [],   // สถานะส่งต้นทุน PPT รายแผนก/ปี (ส่งแล้ว = ล็อก · แอดมินปลดล็อก)
    // ปริมาณผลิตปี 2025 (จากชีทสรุป PPT ไฟล์ Revise 2025) — ฐานเทียบต้นทุนต่อหน่วย
    // ปริมาณผลิต Revise 2025 (ชีท PPT คอลัมน์ BE แถว 62-67) — ตัวหารให้ /ตัน ตรงไฟล์
    prodVolumes: [
      { year: Y_PREV, metric: 'caneCompany',   plan: null, actual: 111555.65,  updatedAt: null, updatedBy: 'ไฟล์ Revise 2025 (ชีท PPT)' },
      { year: Y_PREV, metric: 'caneCommunity', plan: null, actual: 453736.175, updatedAt: null, updatedBy: 'ไฟล์ Revise 2025 (ชีท PPT)' },
      { year: Y_PREV, metric: 'sugarProduce',  plan: null, actual: 72501.216,  updatedAt: null, updatedBy: 'ไฟล์ Revise 2025 (ชีท PPT)' },
      { year: Y_PREV, metric: 'sugarTrading',  plan: null, actual: null,        updatedAt: null, updatedBy: 'ไฟล์ Revise 2025 (ชีท PPT)' },
    ],
    exchangeRates, fuelPrices, auditLogs, notifications,
  };
})();

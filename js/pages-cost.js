/* =============================================================
 * pages-cost.js — ต้นทุนต่อหน่วย (ตรงชีท "สรุป PPT รายฝ่าย")
 *
 *  จำนวนเงินรายหมวด (1-33) = ดึง auto จาก GL รวมตามงบ (ไม่กรอกมือ)
 *    · ปีงบปัจจุบัน → รวมจากงบแต่ละหน่วยงาน (glAccounts.pptCode)
 *    · ปีก่อน (ไม่มีงบในระบบ) → ค่าอ้างอิงจากไฟล์ Revise (pptAmounts seed)
 *  🟨 เหลือง = รวมแต่ละรายการ (auto)   🟥 ชมพู = รวมใหญ่ (auto)
 *  กีบ/ตันอ้อย · กีบ/ตันน้ำตาล = auto (จำนวนเงิน ÷ ปริมาณ)
 *
 *  สิ่งเดียวที่ "กรอกมือ" = ปริมาณผลิต (ตัวหาร) แยกตามแผนก (meta.volumeEditors):
 *    · แถว 53 ตันอ้อยไร่บริษัท + 54 ไร่ส่งเสริม → แผนกบริการไร่ (2712)  · 55 = 53+54 (auto)
 *    · แถว 56 ตันน้ำตาลผลิต → แผนกหม้อปั่น (3224)
 *    · แถว 57 ตันน้ำตาล Trading → งานการตลาด/ขาย (1143)              · 58 = 56+57 (auto)
 *  ผูก lock รอบปีเหมือนงบ · กดส่ง (Submit) แล้วล็อก แอดมินปลดล็อกเท่านั้น
 * ============================================================= */

const PagesCost = (() => {
  const esc = s => UI.esc(s);
  const fmt = n => UI.fmt(n);
  const card = (t, b, o) => UI.card(t, b, o);
  let divMode = 'fc';   // ชุดตัวหาร: 'fc' = คาดการณ์ (งบต้นปี) · 'act' = เกิดจริง+คาดการณ์

  const ALL = []; for (let i = 1; i <= 33; i++) ALL.push(i);
  // Layout ตรงชีท PPT — ['cat',รหัส,div] · ['sum',ชื่อ,[รหัส..],div,style]
  //  div: 'co'=÷ตันไร่บริษัท · 'comm'=÷ตันไร่ส่งเสริม · 'all'=÷ตันรวม · style 'grand'=ชมพู
  const LAYOUT = [
    ['cat', 1, 'co'], ['cat', 2, 'co'],
    ['sum', 'รวม ค่าอ้อย - ไร่บริษัท', [1, 2], 'co'],
    ['cat', 3, 'co'],
    ['sum', 'รวม ค่าอ้อย + ค่านำอ้อยเข้าหีบ - ไร่บริษัท', [1, 2, 3], 'co'],
    ['cat', 4, 'comm'], ['cat', 5, 'comm'],
    ['sum', 'รวม ค่าอ้อย - ไร่ส่งเสริม', [4, 5], 'comm'],
    ['cat', 6, 'comm'],
    ['sum', 'รวม ค่าอ้อย + ค่านำอ้อยเข้าหีบ - ไร่ส่งเสริม', [4, 5, 6], 'comm'],
    ['sum', 'รวม ค่าอ้อยทั้งหมด', [1, 2, 4, 5], 'all'],
    ['sum', 'รวม ค่านำอ้อยเข้าหีบทั้งหมด', [3, 6], 'all'],
    ['sum', 'รวม ค่าอ้อย + ค่านำอ้อยเข้าหีบทั้งหมด', [1, 2, 3, 4, 5, 6], 'all'],
    ['cat', 7, 'all'],
    ['sum', 'รวมค่าวัตถุดิบ', [1, 2, 3, 4, 5, 6, 7], 'all', 'grand'],
    ['cat', 8, 'all'], ['cat', 9, 'all'], ['cat', 10, 'all'], ['cat', 11, 'all'], ['cat', 12, 'all'],
    ['sum', 'รวม เงินเดือน ค่าแรง สวัสดิการ', [8, 9, 10, 11, 12], 'all'],
    ['cat', 13, 'all'], ['cat', 14, 'all'], ['cat', 15, 'all'], ['cat', 16, 'all'], ['cat', 17, 'all'],
    ['cat', 18, 'all'], ['cat', 19, 'all'], ['cat', 20, 'all'], ['cat', 21, 'all'], ['cat', 22, 'all'],
    ['sum', 'รวม ค่าใช้จ่ายแปรสภาพ', [13, 14, 15, 16, 17, 18, 19, 20, 21, 22], 'all'],
    ['sum', 'รวม ต้นทุนการผลิต (รวมค่าเสื่อมราคา)', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], 'all', 'grand'],
    ['cat', 23, 'all'], ['cat', 24, 'all'], ['cat', 25, 'all'], ['cat', 26, 'all'], ['cat', 27, 'all'], ['cat', 28, 'all'], ['cat', 31, 'all'], ['cat', 33, 'all'],
    ['sum', 'รวม ค่าใช้จ่ายในการบริหารจัดการ', [23, 24, 25, 26, 27, 28, 31, 33], 'all'],
    ['cat', 29, 'all'], ['cat', 32, 'all'],
    ['sum', 'รวม (กำไร) - ขาดทุนจากอัตราแลกเปลี่ยน', [29, 32], 'all'],
    ['cat', 30, 'all'],
    ['sum', 'รวม ประมาณการค่าใช้จ่ายทั้งหมด', ALL, 'all', 'grand'],
  ];

  function unitCost(user) {
    const year = UI.year();
    const names = Store.db.meta.pptCategories || {};
    // สถานะรอบปี (เหมือนงบประจำปี)
    const rv = Store.revisePhase(year);
    const yearOpen = Store.isYearEditable(year);
    const roundChip = rv.on
      ? `<span class="uc-round uc-round-rv">🔁 รอบ ${rv.kind === 'LANDING' ? 'ปิดยอด' : 'Revise'} · เกิดจริงถึง ด.${rv.thru}</span>`
      : yearOpen ? `<span class="uc-round uc-round-open">🟢 ปีงบ ${year} · เปิดกรอกปริมาณ</span>`
        : `<span class="uc-round uc-round-lock">🔒 ปีงบ ${year} · ปิดรอบแล้ว</span>`;

    // ---- ตัวหาร (ปริมาณผลิต) — "ส่งไปหาร" เมื่อแผนกที่รับผิดชอบกด Submit เท่านั้น ----
    //  ปีเปิด: ต้องกดส่งก่อน /ตัน จึงคำนวณ · ปีปิดรอบ (ประวัติ): ถือว่าข้อมูลสุดท้ายแล้ว คำนวณได้เลย
    const editorsCfg = (Store.db.meta && Store.db.meta.volumeEditors) || {};
    const yearLocked = !Store.isYearEditable(year);
    const metricSubmitted = key => { const eds = editorsCfg[key] || []; return eds.length > 0 && eds.every(c => Store.pptSubmitted(year, c)); };
    const committed = key => yearLocked || metricSubmitted(key);
    // ปริมาณดึงจาก Assumption (MTP) — Realistic ทั้งคู่:
    //  คาดการณ์ = งบต้นปี (col 6) · เกิดจริง+คาดการณ์ = col 16 · แถว: 4 ไร่บริษัท / 5 ไร่ส่งเสริม / 13 น้ำตาลผลิต / 15.5 น้ำตาล Trading
    const BUD_COL = 6, ACT_COL = 16;
    const AS_COL = divMode === 'fc' ? BUD_COL : ACT_COL;   // ตัวหาร /ตัน ตามชุดที่เลือก
    const AS_ROW = { caneCompany: 21, caneCommunity: 36, sugarProduce: 81, sugarTrading: 98 };
    let _asGrid, _asTried = false;
    const asGrid = () => { if (!_asTried) { _asTried = true; try { _asGrid = (typeof PagesAssum !== 'undefined' && PagesAssum.grid) ? PagesAssum.grid() : null; } catch (e) { _asGrid = null; } } return _asGrid; };
    const tv = m => { const r = AS_ROW[m]; if (r != null) { const g = asGrid(); if (g && g[r]) return g[r][AS_COL] || 0; } return Store.volume(year, m).plan ?? 0; };
    const tC = m => tv(m);   // ดึงจาก assumption แล้ว — ไม่ต้องรอกด Submit ปริมาณอีก
    // ผลรวมปริมาณ "เกิดจริง" (ไว้แสดงในคอลัมน์เกิดจริงเท่านั้น ไม่ใช่ตัวหาร)
    const aVol = m => Store.volume(year, m).actual;
    const sumActual = keys => { const vs = keys.map(aVol); return vs.every(x => x == null) ? null : vs.reduce((s, x) => s + (x || 0), 0); };
    const caneAllActual = sumActual(['caneCompany', 'caneCommunity']);
    const sugarAllActual = sumActual(['sugarProduce', 'sugarTrading']);
    const _cc = tC('caneCompany'), _ccm = tC('caneCommunity'), _sp = tC('sugarProduce'), _st = tC('sugarTrading');
    const DIV = {
      co: _cc, comm: _ccm,
      all: (_cc != null && _ccm != null) ? _cc + _ccm : null,   // แถว 55 = 53+54 (คำนวณเมื่อบริการไร่ส่ง)
      sugar: (_sp != null && _st != null) ? _sp + _st : null,   // แถว 58 = 56+57 (คำนวณเมื่อหม้อปั่น+การตลาดส่งครบ)
    };

    // ---- จำนวนเงินรายหมวด = ดึง auto จาก GL ตามงบ · ปีก่อน (ไม่มีงบ) ใช้ค่าไฟล์ Revise ----
    // แยกรายได้ (440/450) ออกจากยอดต้นทุน (ตามที่ผู้ใช้ระบุ — ไม่แยก 823)
    const NON_COST = /^(44|45)/;
    const glPpt = {}; Store.db.glAccounts.forEach(g => { glPpt[g.id] = NON_COST.test(g.code || '') ? 0 : (g.pptCode || 0); });
    const budgetByCode = {};
    Store.db.budgets.filter(b => b.year === year).forEach(b => {
      const c = glPpt[b.glId]; if (c) budgetByCode[c] = (budgetByCode[c] || 0) + b.months.reduce((s, v) => s + (v || 0), 0);
    });
    const hasBudget = Object.keys(budgetByCode).length > 0;
    const amtOf = code => hasBudget ? (budgetByCode[code] || 0) : (Store.pptAmount(year, code).amount || 0);
    const sumOf = codes => codes.reduce((s, c) => s + (amtOf(c) || 0), 0);
    const srcNote = hasBudget
      ? `<small class="muted uc-auto">↩ รวม auto จากงบแต่ละหน่วยงาน (GL)</small>`
      : `<small class="muted uc-auto">↩ ค่าอ้างอิงจากไฟล์ Revise ${year} (ยังไม่มีงบในระบบ)</small>`;

    const perCane = (a, div) => { const d = DIV[div]; return (a == null || d == null || d <= 0) ? null : a / d; };
    const perSugar = a => (a == null || DIV.sugar == null || DIV.sugar <= 0) ? null : a / DIV.sugar;
    const divCell = v => v == null ? '<span class="muted">— ยังไม่ส่ง</span>' : fmt(Math.round(v));
    // อัตรา THB (กีบ/บาท) "ประจำรอบ" — จากแถว LAK:THB (24.3, i175) ของ Assumption:
    //  ÷คาดการณ์ ใช้อัตราคอลัมน์งบต้นปี (snapshot ตอนล็อกรอบ) · ÷เกิดจริง+คาดการณ์ ใช้อัตราคอลัมน์คาดการณ์ (สดจาก Budget Control จนกว่าจะล็อก)
    const bcRate = (Store.db.exchangeRates || []).find(x => x.year === year && x.currency === 'THB')?.rateToLAK || 0;
    const fxOf = col => { const g = asGrid(); const v = (g && g[175]) ? g[175][col] : 0; return v > 0 ? v : 0; };
    const thbRate = (divMode === 'fc' ? fxOf(BUD_COL) : fxOf(ACT_COL)) || bcRate;
    const toBaht = v => (v == null || thbRate <= 0) ? null : v / thbRate;
    const tonCell = (a, div) => {
      const kc = perCane(a, div), ks = perSugar(a);
      const cell = v => `<td class="num uc-ton">${v === null ? '—' : fmt(Math.round(v))}</td>`;
      // เรียงคู่กัน: กีบ/ตันอ้อย · บาท/ตันอ้อย · กีบ/ตันน้ำตาล · บาท/ตันน้ำตาล
      return cell(kc) + cell(toBaht(kc)) + cell(ks) + cell(toBaht(ks));
    };
    const modeName = divMode === 'fc' ? 'คาดการณ์' : 'เกิดจริง+คาดการณ์';
    const divTag = div => div === 'co' ? ` <small class="muted">(÷ ตันไร่บริษัท · ${modeName})</small>` : div === 'comm' ? ` <small class="muted">(÷ ตันไร่ส่งเสริม · ${modeName})</small>` : '';

    // ตารางต้นทุน (อ่านอย่างเดียว — ทุก user เห็นชุดเดียวกัน)
    const body = LAYOUT.map(row => {
      if (row[0] === 'cat') {
        const [, code, div] = row;
        const a = amtOf(code);
        return `<tr class="uc-cat uc-auto-row"><td class="uc-item">${code}. ${esc(names[code] || ('หมวด ' + code))}</td>
          <td class="num">${a ? fmt(Math.round(a)) : '<span class="muted">0</span>'}</td>${tonCell(a, div)}</tr>`;
      }
      const [, name, codes, div, style] = row;
      const a = sumOf(codes);
      return `<tr class="uc-sum ${style === 'grand' ? 'uc-grand' : ''}"><td><b>${esc(name)}</b>${divTag(div)}</td>
        <td class="num">${fmt(Math.round(a))}</td>${tonCell(a, div)}</tr>`;
    }).join('');

    // KPI
    const caneCo = perCane(sumOf([1, 2, 3]), 'co'), caneComm = perCane(sumOf([4, 5, 6]), 'comm');
    const grand = sumOf(ALL), totCane = perCane(grand, 'all'), totSugar = perSugar(grand);

    // ---- ฟอร์มปริมาณผลิต (กรอกมือ แยกตามแผนก) ----
    const deptName = code => (Store.db.departments.find(d => d.code === code) || {}).name || code;
    const fillerHint = key => {
      const arr = editorsCfg[key] || [];
      return arr.length ? ` <small class="muted">(${arr.map(deptName).join(', ')} กรอก)</small>` : ' <small class="muted">(รอมอบหมาย)</small>';
    };
    const statusChip = key => {
      if (yearLocked) return '';
      const arr = editorsCfg[key] || [];
      if (!arr.length) return '';
      return metricSubmitted(key) ? ' <span class="uc-st uc-st-ok">✅ ส่งแล้ว</span>' : ' <span class="uc-st uc-st-wait">⏳ ยังไม่ส่ง</span>';
    };
    // อ่านอย่างเดียว — ปริมาณดึงจาก Assumption: คาดการณ์ = งบต้นปี Opt (col5) · เกิดจริง+คาดการณ์ (col16)
    // แถวที่แมพ: ปริมาณอ้อย-ไร่บริษัท (i21) · ไร่ส่งเสริม (i36) · ปริมาณน้ำตาล-ผลิต (i81)
    const AS_FC_COL = BUD_COL;   // คาดการณ์ = งบต้นปี Real
    const asVal = (m, col) => { const r = AS_ROW[m]; if (r == null) return null; const g = asGrid(); return (g && g[r]) ? (g[r][col] || 0) : null; };
    const volCell = v => v == null ? '<span class="muted">—</span>' : `<b>${fmt(Math.round(v))}</b>`;
    const volRows = Store.VOLUME_METRICS.map(m => {
      const pv = Store.volume(year - 1, m.key);
      return `<tr><td>${esc(m.label)}</td>
        <td class="num">${volCell(asVal(m.key, AS_FC_COL))}</td>
        <td class="num">${volCell(asVal(m.key, ACT_COL))}</td>
        <td class="num muted">${(pv.actual ?? pv.plan) == null ? '—' : fmt(pv.actual ?? pv.plan)}</td></tr>`;
    }).join('');
    const volSum = (keys, col) => { const vs = keys.map(k => asVal(k, col)); return vs.every(x => x == null) ? null : vs.reduce((s, x) => s + (x || 0), 0); };
    // ผลรวมปีก่อน (ปี 2025) จากปริมาณที่บันทึกไว้
    const pvVal = k => { const p = Store.volume(year - 1, k); return p.actual ?? p.plan; };
    const pvSum = keys => { const vs = keys.map(pvVal); return vs.every(x => x == null) ? null : vs.reduce((s, x) => s + (x || 0), 0); };
    const vPlan = m => Store.volume(year, m).plan || 0;
    const caneAllPlan = vPlan('caneCompany') + vPlan('caneCommunity');
    const sugarAllPlan = vPlan('sugarProduce') + vPlan('sugarTrading');

    // Submit / ปลดล็อก (ผู้กรอกปริมาณ = filler)
    const dcode = user.departmentId ? (Store.dept(user.departmentId) || {}).code : null;
    const isFiller = Store.isPptFiller(user);
    const mySubmitted = dcode && Store.pptSubmitted(year, dcode);
    const submits = Store.pptSubmitsFor(year);
    // สถานะล็อกแบบแข็ง (เฉพาะกรณีรอบปิดแล้วยังส่งค้าง) — ปุ่ม Submit/Edit จริงอยู่ในการ์ดกรอก
    const submitBar = '';   // เอาป้ายสถานะ "ล็อก/ส่งแล้ว" ออกตามที่ผู้ใช้ต้องการ
    // แถบปุ่ม Submit / Edit ในส่วนกรอก — โผล่ทุกคนที่กรอกช่องได้ (ผู้กรอกปริมาณ หรือ แอดมิน)
    const isAdmin = user.role === 'ACCOUNTING';
    // filler ที่ส่งแล้วก็ยังเห็นแถบ (ไว้กด Edit ปลดล็อกเอง) — canEditVolume จะ false หลังส่ง
    const canFill = Store.canEditVolume(user, null, year) || isAdmin || (isFiller && mySubmitted && yearOpen);
    // สถานะ "ส่งแล้ว": filler=แผนกตนส่ง · admin=ทุกแผนกรับผิดชอบส่งครบ
    const allSubmitted = Store.VOLUME_METRICS.every(m => metricSubmitted(m.key));
    const finalized = isAdmin ? allSubmitted : mySubmitted;
    const fillFoot = '';   // เอาปุ่ม Submit ออก — หน้านี้ไม่กรอกแล้ว (ปริมาณดึงจาก Assumption)
    const adminUnlock = (user.role === 'ACCOUNTING' && submits.length)
      ? card(`📮 แผนกที่ส่งปริมาณแล้ว ปี ${year} (${submits.length})`, submits.map(s => {
          const dn = (Store.db.departments.find(d => d.code === s.deptCode) || {}).name || s.deptCode;
          return `<div class="uc-sub-row"><span>🔒 ${esc(dn)} (${s.deptCode}) · ส่งโดย ${esc(s.submittedBy || '')}</span><button class="ghost-btn small" data-unlock-ppt="${s.deptCode}">🔓 ปลดล็อก</button></div>`;
        }).join('')) : '';

    return UI.pageHead(`ต้นทุนต่อหน่วย ปี ${year} 🏭`,
        ``,
        roundChip)
      + submitBar + adminUnlock
      + card(`ต้นทุนการผลิต`, `
          <div class="table-scroll"><table class="data-table small"><thead>
            <tr><th>ปริมาณ ปี ${year}</th><th class="num">คาดการณ์ (ตัน)</th><th class="num">เกิดจริง+คาดการณ์ (ตัน)</th><th class="num">ปี ${year - 1}</th></tr></thead>
            <tbody>${volRows}
              <tr class="tr-sum"><td>รวมตันอ้อยทั้งหมด <small class="muted">(53+54)</small></td><td class="num">${volCell(volSum(['caneCompany','caneCommunity'], AS_FC_COL))}</td><td class="num">${volCell(volSum(['caneCompany','caneCommunity'], ACT_COL))}</td><td class="num muted">${pvSum(['caneCompany','caneCommunity']) == null ? '—' : fmt(Math.round(pvSum(['caneCompany','caneCommunity'])))}</td></tr>
              <tr class="tr-sum"><td>รวมตันน้ำตาลทั้งหมด <small class="muted">(56+57)</small></td><td class="num">${volCell(volSum(['sugarProduce','sugarTrading'], AS_FC_COL))}</td><td class="num">${volCell(volSum(['sugarProduce','sugarTrading'], ACT_COL))}</td><td class="num muted">${pvSum(['sugarProduce','sugarTrading']) == null ? '—' : fmt(Math.round(pvSum(['sugarProduce','sugarTrading'])))}</td></tr>
            </tbody></table></div>${fillFoot}`)
      + `<div class="kpi-grid kpi-grid-4">
          <div class="kpi kpi-tint-blue"><div class="kpi-label">🌾 ต้นทุนอ้อย ไร่บริษัท / ตัน</div><div class="kpi-value">${caneCo == null ? '—' : fmt(Math.round(caneCo))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ค่าอ้อย+จัดหา (1-3) ÷ ตันไร่บริษัท (Assumption ${modeName})</div></div>
          <div class="kpi kpi-tint-teal"><div class="kpi-label">🌱 ต้นทุนอ้อย ไร่ส่งเสริม / ตัน</div><div class="kpi-value">${caneComm == null ? '—' : fmt(Math.round(caneComm))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ค่าอ้อย+จัดหา (4-6) ÷ ตันไร่ส่งเสริม (Assumption ${modeName})</div></div>
          <div class="kpi"><div class="kpi-label">🏭 ต้นทุนรวม / ตันอ้อย</div><div class="kpi-value">${totCane == null ? '—' : fmt(Math.round(totCane))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ทุกหมวด ÷ ตันอ้อยรวม (Assumption ${modeName})</div></div>
          <div class="kpi"><div class="kpi-label">🍬 ต้นทุนรวม / ตันน้ำตาล</div><div class="kpi-value">${totSugar == null ? '—' : fmt(Math.round(totSugar))} <small>กีบ/ตัน</small></div><div class="kpi-sub">รวมทั้งหมด ${fmt(Math.round(grand))} กีบ</div></div>
        </div>`
      + card('', `<div class="uc-divmode">
            <button class="ghost-btn small${divMode === 'fc' ? ' uc-dm-on' : ''}" data-divmode="fc">÷ คาดการณ์ (ตัน)</button>
            <button class="ghost-btn small${divMode === 'act' ? ' uc-dm-on' : ''}" data-divmode="act">÷ เกิดจริง+คาดการณ์ (ตัน)</button>
          </div>
          <p class="muted small" style="margin:0 0 8px">💡 จำนวนเงินทุกหมวด <span class="uc-auto" style="padding:1px 6px;border-radius:4px;background:#eef3ff">ดึง auto จาก GL ตามงบ</span> · <span style="background:#fff7cc;padding:1px 6px;border-radius:4px">เหลือง=รวมหมวด</span> · <span style="background:#fbe0ec;padding:1px 6px;border-radius:4px">ชมพู=รวมใหญ่</span> · กีบ/ตัน = จำนวนเงิน ÷ ปริมาณ<b>${modeName}</b> &nbsp; ${srcNote}</p>
          <div class="table-scroll"><table class="data-table uc-table">
          <thead><tr><th style="min-width:300px">รายการ (หมวด PPT)</th><th class="num">จำนวนเงิน (กีบ)</th><th class="num">กีบ/ตันอ้อย</th><th class="num">บาท/ตันอ้อย</th><th class="num">กีบ/ตันน้ำตาล</th><th class="num">บาท/ตันน้ำตาล</th></tr></thead>
          <tbody>${body}</tbody></table></div>`, { cls: 'card-flush' });
  }

  function unitCostBind(user) {
    const year = UI.year();
    document.querySelectorAll('[data-divmode]').forEach(b => b.addEventListener('click', () => { divMode = b.dataset.divmode; App.render(); }));
    document.querySelectorAll('.uc-vol').forEach(inp => inp.addEventListener('change', () => {
      const raw = inp.value.replace(/[,\s]/g, '').trim();
      const val = raw === '' ? null : Number(raw);
      if (raw !== '' && (!isFinite(val) || val < 0)) { UI.toast('ตัวเลขไม่ถูกต้อง', 'err'); return; }
      try { Store.setVolume(user, year, inp.dataset.vol, inp.dataset.field, val); UI.toast('บันทึกปริมาณแล้ว — คำนวณต่อตันใหม่'); App.render(); }
      catch (e) { UI.toast(e.message, 'err'); }
    }));
    const isAdmin = user.role === 'ACCOUNTING';
    document.getElementById('pptSubmitBtn')?.addEventListener('click', () => {
      UI.confirm2('ส่งปริมาณผลิต', `ส่งปริมาณผลิตปี ${year}?`, 'ค่าจะถูกส่งไปคำนวณต่อตัน · ยังกด "แก้ไข (Edit)" ได้ภายหลัง', () => {
        try { isAdmin ? Store.submitAllPpt(user, year) : Store.submitPpt(user, year); UI.toast('ส่งปริมาณแล้ว — คำนวณต่อตันเรียบร้อย'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
      });
    });
    document.getElementById('pptEditBtn')?.addEventListener('click', () => {
      try { isAdmin ? Store.unlockAllPpt(user, year) : Store.reopenOwnPpt(user, year); UI.toast('เปิดให้แก้ไขปริมาณแล้ว'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    });
    document.querySelectorAll('[data-unlock-ppt]').forEach(b => b.addEventListener('click', () => {
      try { Store.unlockPpt(user, year, b.dataset.unlockPpt); UI.toast('ปลดล็อกแล้ว — แผนกแก้ไขได้อีก'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    }));
  }

  return { unitCost, unitCostBind };
})();

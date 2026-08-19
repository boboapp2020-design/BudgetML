/* =============================================================
 * pages-cost.js — ต้นทุนต่อหน่วย (ฟอร์มกรอกมือ ตรงชีท "สรุป PPT รายฝ่าย")
 *
 *  ⬜ ขาว  = จำนวนเงิน (User กรอกมือ รายหมวด 1-33) — แยกจากระบบงบ · 1 ชุด/ปี · 2026 เริ่มว่าง
 *  🟨 เหลือง = รวมแต่ละรายการ (auto)   🟥 ชมพู = รวมใหญ่ (auto)
 *  กีบ/ตันอ้อย · กีบ/ตันน้ำตาล = auto (จำนวนเงิน ÷ ปริมาณ)
 *  สิทธิ์กรอกรายหมวด (meta.pptEditors): บริการไร่ = ค่าอ้อย หมวด 1-6 · หมวดอื่นรอมอบหมาย
 *  ปริมาณ (ตัวหาร): อ้อย=บริการไร่ · น้ำตาล=ฝ่ายผลิต (meta.volumeEditors) · ผูก lock รอบปีเหมือนงบ
 * ============================================================= */

const PagesCost = (() => {
  const esc = s => UI.esc(s);
  const fmt = n => UI.fmt(n);
  const card = (t, b, o) => UI.card(t, b, o);

  const ALL = []; for (let i = 1; i <= 33; i++) ALL.push(i);
  // Layout ตรงชีท PPT — ['cat',รหัส,div] (ขาว=input) · ['sum',ชื่อ,[รหัส..],div,style] (เหลือง/ชมพู)
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
    const canEditAnyVol = Store.canEditVolume(user, null, year);
    const canEditAnyPpt = Store.canEditPpt(user, null, year);
    // สถานะรอบปี (เหมือนงบประจำปี)
    const rv = Store.revisePhase(year);
    const yearOpen = Store.isYearEditable(year);
    const roundChip = rv.on
      ? `<span class="uc-round uc-round-rv">🔁 รอบ ${rv.kind === 'LANDING' ? 'ปิดยอด' : 'Revise'} · เกิดจริงถึง ด.${rv.thru}</span>`
      : yearOpen ? `<span class="uc-round uc-round-open">🟢 ปีงบ ${year} · เปิดกรอก</span>`
        : `<span class="uc-round uc-round-lock">🔒 ปีงบ ${year} · ปิดรอบแล้ว</span>`;

    // ตัวหาร (ปริมาณ) — actual ก่อน ไม่มีใช้ plan
    const t = m => { const v = Store.volume(year, m); return v.actual ?? v.plan ?? 0; };
    const DIV = { co: t('caneCompany'), comm: t('caneCommunity'), all: t('caneCompany') + t('caneCommunity'), sugar: t('sugarProduce') };
    // หมวดที่ "ดึงจากงบแต่ละหน่วยงานอัตโนมัติ" (ไม่กรอกมือ) — 7=ค่าเคมีภัณฑ์
    const AUTO = new Set([7]);
    const glPpt = {}; Store.db.glAccounts.forEach(g => { glPpt[g.id] = g.pptCode || 0; });
    const budgetByCode = {};
    Store.db.budgets.filter(b => b.year === year).forEach(b => { const c = glPpt[b.glId]; if (c) budgetByCode[c] = (budgetByCode[c] || 0) + b.months.reduce((s, v) => s + (v || 0), 0); });
    //  หมวด auto (เคมี): ใช้งบถ้ามี · ไม่มีงบ (เช่นปี 2025) ใช้ค่าอ้างอิงจากไฟล์
    const amtOf = code => AUTO.has(code) ? (budgetByCode[code] || Store.pptAmount(year, code).amount || 0) : Store.pptAmount(year, code).amount;
    const sumOf = codes => codes.reduce((s, c) => s + (amtOf(c) || 0), 0);
    const perCane = (a, div) => { const d = DIV[div]; return (a == null || d <= 0) ? null : a / d; };
    const perSugar = a => (a == null || DIV.sugar <= 0) ? null : a / DIV.sugar;
    const tonCell = (a, div) => `<td class="num uc-ton">${perCane(a, div) === null ? '—' : fmt(Math.round(perCane(a, div)))}</td>
        <td class="num uc-ton">${perSugar(a) === null ? '—' : fmt(Math.round(perSugar(a)))}</td>`;
    const divTag = div => div === 'co' ? ' <small class="muted">(÷ ตันไร่บริษัท)</small>' : div === 'comm' ? ' <small class="muted">(÷ ตันไร่ส่งเสริม)</small>' : '';

    // จำกัดการมองเห็น: ผู้กรอก (non-admin ที่มี section) เห็นเฉพาะหมวดของตน (รวม auto ต่อท้าย เช่น เคมี)
    //  แอดมิน = เห็นทุกหมวด · แผนกที่ไม่ได้รับมอบหมาย = เห็นทั้งตาราง (อ่านอย่างเดียว)
    let vmax = 33;
    if (user.role !== 'ACCOUNTING') {
      const dcode = (Store.dept(user.departmentId) || {}).code;
      const editors = Store.db.meta.pptEditors || {};
      const mine = ALL.filter(c => (editors[String(c)] || []).includes(dcode));
      if (mine.length) { vmax = Math.max.apply(null, mine); while (AUTO.has(vmax + 1)) vmax++; }
    }
    const visibleLayout = LAYOUT.filter(row => (row[0] === 'cat' ? [row[1]] : row[2]).every(c => c <= vmax));

    const body = visibleLayout.map(row => {
      if (row[0] === 'cat') {
        const [, code, div] = row;
        const a = amtOf(code);
        const isAuto = AUTO.has(code);
        const canE = !isAuto && Store.canEditPpt(user, code, year);
        const amtCell = isAuto
          ? `${a ? fmt(Math.round(a)) : '<span class="muted">0</span>'} <small class="muted uc-auto">↩ จากงบ</small>`
          : (canE
            ? `<input class="uc-amt" data-code="${code}" inputmode="decimal" value="${a == null ? '' : a}" placeholder="กรอก">`
            : (a == null ? '<span class="muted">—</span>' : fmt(a)));
        return `<tr class="uc-cat ${isAuto ? 'uc-auto-row' : ''}"><td class="uc-item">${code}. ${esc(names[code] || ('หมวด ' + code))}${isAuto ? ' <small class="muted">(ดึงจากงบแต่ละหน่วยงาน)</small>' : ''}</td>
          <td class="num ${isAuto ? '' : 'uc-white'}">${amtCell}</td>${tonCell(a, div)}</tr>`;
      }
      const [, name, codes, div, style] = row;
      const a = sumOf(codes);
      return `<tr class="uc-sum ${style === 'grand' ? 'uc-grand' : ''}"><td><b>${esc(name)}</b>${divTag(div)}</td>
        <td class="num">${fmt(Math.round(a))}</td>${tonCell(a, div)}</tr>`;
    }).join('');

    // KPI
    const caneCo = perCane(sumOf([1, 2, 3]), 'co'), caneComm = perCane(sumOf([4, 5, 6]), 'comm');
    const grand = sumOf(ALL), totCane = perCane(grand, 'all'), totSugar = perSugar(grand);

    // ฟอร์มปริมาณ
    const volRows = Store.VOLUME_METRICS.map(m => {
      const v = Store.volume(year, m.key), pv = Store.volume(year - 1, m.key);
      const canM = Store.canEditVolume(user, m.key, year);
      const isSugar = m.key.indexOf('sugar') === 0;
      const inp = f => canM
        ? `<input class="uc-vol" data-vol="${m.key}" data-field="${f}" inputmode="decimal" value="${v[f] ?? ''}" placeholder="กรอก">`
        : `<b>${v[f] == null ? '—' : fmt(v[f])}</b>`;
      return `<tr><td>${esc(m.label)}${isSugar ? ' <small class="muted">(ฝ่ายผลิตกรอก)</small>' : ''}</td>
        <td class="num">${inp('plan')}</td><td class="num">${inp('actual')}</td>
        <td class="num muted">${(pv.actual ?? pv.plan) == null ? '—' : fmt(pv.actual ?? pv.plan)}</td></tr>`;
    }).join('');

    // Submit / ปลดล็อก
    const dcode = user.departmentId ? (Store.dept(user.departmentId) || {}).code : null;
    const isFiller = Store.isPptFiller(user);
    const mySubmitted = dcode && Store.pptSubmitted(year, dcode);
    const submits = Store.pptSubmitsFor(year);
    const submitBar = isFiller
      ? (mySubmitted
        ? `<div class="lock-banner">🔒 ส่งข้อมูลต้นทุนปี ${year} แล้ว — แก้ไขไม่ได้ · ให้แอดมินปลดล็อกก่อนจึงแก้ได้อีก</div>`
        : (yearOpen ? `<div class="uc-submit-bar"><span>กรอกครบแล้วกดส่ง — <b>ส่งแล้วแก้ไม่ได้</b> (แอดมินปลดล็อกเท่านั้น)</span><button class="primary-btn" id="pptSubmitBtn">✅ ส่งข้อมูล (Submit)</button></div>` : ''))
      : '';
    const adminUnlock = (user.role === 'ACCOUNTING' && submits.length)
      ? card(`📮 แผนกที่ส่งต้นทุนแล้ว ปี ${year} (${submits.length})`, submits.map(s => {
          const dn = (Store.db.departments.find(d => d.code === s.deptCode) || {}).name || s.deptCode;
          return `<div class="uc-sub-row"><span>🔒 ${esc(dn)} (${s.deptCode}) · ส่งโดย ${esc(s.submittedBy || '')}</span><button class="ghost-btn small" data-unlock-ppt="${s.deptCode}">🔓 ปลดล็อก</button></div>`;
        }).join('')) : '';

    return UI.pageHead(`ต้นทุนต่อหน่วย ปี ${year} 🏭`,
        `ฟอร์มกรอกมือ ตรงชีท "สรุป PPT รายฝ่าย" · ⬜ขาว=กรอก · 🟨เหลือง=รวมหมวด · 🟥ชมพู=รวมใหญ่ · /ตัน auto · ทุก user เห็นชุดเดียวกัน`,
        roundChip)
      + submitBar + adminUnlock
      + card(`📥 ปริมาณผลิต ปี ${year} (ตัวหาร) — อ้อย=บริการไร่ · น้ำตาล=ฝ่ายผลิต`, `
          ${!yearOpen && user.role !== 'ACCOUNTING' ? `<div class="lock-banner">🔒 ปีงบ ${year} ปิดรอบแล้ว — อ่านอย่างเดียว · ปลดล็อกที่ Budget Control ก่อน (แอดมินแก้ได้เสมอ)</div>` : ''}
          <div class="table-scroll"><table class="data-table small"><thead>
            <tr><th>ปริมาณ ปี ${year}</th><th class="num">ตามแผน/งบ (ตัน)</th><th class="num">เกิดจริง (ตัน)</th><th class="num">ปี ${year - 1}</th></tr></thead>
            <tbody>${volRows}
              <tr class="tr-sum"><td>รวมตันอ้อยทั้งหมด</td><td class="num">${fmt(Math.round((Store.volume(year, 'caneCompany').plan || 0) + (Store.volume(year, 'caneCommunity').plan || 0)))}</td><td class="num">${fmt(Math.round(DIV.all))}</td><td class="num muted">—</td></tr>
            </tbody></table></div>`)
      + `<div class="kpi-grid kpi-grid-4">
          <div class="kpi kpi-tint-blue"><div class="kpi-label">🌾 ต้นทุนอ้อย ไร่บริษัท / ตัน</div><div class="kpi-value">${caneCo == null ? '—' : fmt(Math.round(caneCo))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ค่าอ้อย+จัดหา (1-3) ÷ ตันไร่บริษัท</div></div>
          <div class="kpi kpi-tint-teal"><div class="kpi-label">🌱 ต้นทุนอ้อย ไร่ส่งเสริม / ตัน</div><div class="kpi-value">${caneComm == null ? '—' : fmt(Math.round(caneComm))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ค่าอ้อย+จัดหา (4-6) ÷ ตันไร่ส่งเสริม</div></div>
          <div class="kpi"><div class="kpi-label">🏭 ต้นทุนรวม / ตันอ้อย</div><div class="kpi-value">${totCane == null ? '—' : fmt(Math.round(totCane))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ทุกหมวด ÷ ตันอ้อยรวม</div></div>
          <div class="kpi"><div class="kpi-label">🍬 ต้นทุนรวม / ตันน้ำตาล</div><div class="kpi-value">${totSugar == null ? '—' : fmt(Math.round(totSugar))} <small>กีบ/ตัน</small></div><div class="kpi-sub">รวมทั้งหมด ${fmt(Math.round(grand))} กีบ</div></div>
        </div>`
      + card('', `${!yearOpen && !canEditAnyPpt ? '' : `<p class="muted small" style="margin:0 0 8px">✏️ กรอกจำนวนเงินในช่อง <span class="uc-white" style="padding:1px 6px;border-radius:4px">สีขาว</span> ที่คุณรับผิดชอบ · <span style="background:#fff7cc;padding:1px 6px;border-radius:4px">เหลือง=รวมหมวด</span> · <span style="background:#fbe0ec;padding:1px 6px;border-radius:4px">ชมพู=รวมใหญ่</span> คำนวณอัตโนมัติ</p>`}
          <div class="table-scroll"><table class="data-table uc-table">
          <thead><tr><th style="min-width:300px">รายการ (หมวด PPT)</th><th class="num">จำนวนเงิน (กีบ)</th><th class="num">กีบ/ตันอ้อย</th><th class="num">กีบ/ตันน้ำตาล</th></tr></thead>
          <tbody>${body}</tbody></table></div>`, { cls: 'card-flush' });
  }

  function unitCostBind(user) {
    const year = UI.year();
    document.querySelectorAll('.uc-vol').forEach(inp => inp.addEventListener('change', () => {
      const raw = inp.value.replace(/[,\s]/g, '').trim();
      const val = raw === '' ? null : Number(raw);
      if (raw !== '' && (!isFinite(val) || val < 0)) { UI.toast('ตัวเลขไม่ถูกต้อง', 'err'); return; }
      try { Store.setVolume(user, year, inp.dataset.vol, inp.dataset.field, val); UI.toast('บันทึกปริมาณแล้ว'); App.render(); }
      catch (e) { UI.toast(e.message, 'err'); }
    }));
    document.querySelectorAll('.uc-amt').forEach(inp => inp.addEventListener('change', () => {
      const raw = inp.value.replace(/[,\s]/g, '').trim();
      const val = raw === '' ? null : Number(raw);
      if (raw !== '' && !isFinite(val)) { UI.toast('ตัวเลขไม่ถูกต้อง', 'err'); return; }
      try { Store.setPptAmount(user, year, Number(inp.dataset.code), val); UI.toast('บันทึกจำนวนเงินแล้ว — คำนวณต่อตันใหม่'); App.render(); }
      catch (e) { UI.toast(e.message, 'err'); }
    }));
    document.getElementById('pptSubmitBtn')?.addEventListener('click', () => {
      UI.confirm2('ส่งข้อมูลต้นทุน', `ส่งข้อมูลต้นทุนปี ${year}?`, 'หลังส่งจะแก้ไขไม่ได้ ต้องให้แอดมินปลดล็อกก่อน', () => {
        try { Store.submitPpt(user, year); UI.toast('ส่งข้อมูลแล้ว — ล็อกการแก้ไข'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
      });
    });
    document.querySelectorAll('[data-unlock-ppt]').forEach(b => b.addEventListener('click', () => {
      try { Store.unlockPpt(user, year, b.dataset.unlockPpt); UI.toast('ปลดล็อกแล้ว — แผนกแก้ไขได้อีก'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    }));
  }

  return { unitCost, unitCostBind };
})();

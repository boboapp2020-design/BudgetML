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
    // ตัวหาร /ตัน = ปริมาณ "ตามแผน/งบ" (คาดการณ์) ให้สอดคล้องกับตัวตั้งที่เป็นงบ · เกิดจริงใช้แค่แสดงเทียบ
    const tv = m => { const v = Store.volume(year, m); return v.plan ?? 0; };
    const tC = m => committed(m) ? tv(m) : null;
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
    const glPpt = {}; Store.db.glAccounts.forEach(g => { glPpt[g.id] = g.pptCode || 0; });
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
    const tonCell = (a, div) => `<td class="num uc-ton">${perCane(a, div) === null ? '—' : fmt(Math.round(perCane(a, div)))}</td>
        <td class="num uc-ton">${perSugar(a) === null ? '—' : fmt(Math.round(perSugar(a)))}</td>`;
    const divTag = div => div === 'co' ? ' <small class="muted">(÷ ตันไร่บริษัท · ตามแผน)</small>' : div === 'comm' ? ' <small class="muted">(÷ ตันไร่ส่งเสริม · ตามแผน)</small>' : '';

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
    const volRows = Store.VOLUME_METRICS.map(m => {
      const v = Store.volume(year, m.key), pv = Store.volume(year - 1, m.key);
      const canM = Store.canEditVolume(user, m.key, year);
      const inp = f => canM
        ? `<input class="uc-vol" data-vol="${m.key}" data-field="${f}" inputmode="decimal" value="${v[f] ?? ''}" placeholder="กรอก">`
        : `<b>${v[f] == null ? '—' : fmt(v[f])}</b>`;
      return `<tr><td>${esc(m.label)}${fillerHint(m.key)}${statusChip(m.key)}</td>
        <td class="num">${inp('actual')}</td>
        <td class="num muted">${(pv.actual ?? pv.plan) == null ? '—' : fmt(pv.actual ?? pv.plan)}</td></tr>`;
    }).join('');
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
    const fillFoot = canFill
      ? (finalized
        ? `<div class="uc-fill-foot done"><span class="uc-st uc-st-ok">✅ ส่งข้อมูลแล้ว — ค่าถูกส่งไปคำนวณ/ตันเรียบร้อย</span><button class="ghost-btn" id="pptEditBtn">✏️ แก้ไข (Edit)</button></div>`
        : `<div class="uc-fill-foot"><span class="muted">กรอกปริมาณครบแล้วกดส่งเพื่อคำนวณ/ตัน · ส่งแล้วยังกด "แก้ไข" ได้</span><button class="primary-btn" id="pptSubmitBtn">✅ Submit — ส่งข้อมูล</button></div>`)
      : '';
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
          ${yearOpen ? `<div class="uc-hint-calc">🧮 ค่า <b>กีบ/ตัน</b> จะเริ่มคำนวณ <b>เมื่อแผนกที่รับผิดชอบกดปุ่ม "ส่งข้อมูล (Submit)"</b> เท่านั้น · /ตันอ้อย รอ <b>บริการไร่</b> ส่ง · /ตันน้ำตาล รอ <b>หม้อปั่น + การตลาด</b> ส่งครบ</div>` : ''}
          <div class="table-scroll"><table class="data-table small"><thead>
            <tr><th>ปริมาณ ปี ${year}</th><th class="num">เกิดจริง (ตัน)</th><th class="num">ปี ${year - 1}</th></tr></thead>
            <tbody>${volRows}
              <tr class="tr-sum"><td>รวมตันอ้อยทั้งหมด <small class="muted">(53+54)</small></td><td class="num">${caneAllActual == null ? '—' : fmt(Math.round(caneAllActual))}</td><td class="num muted">—</td></tr>
              <tr class="tr-sum"><td>รวมตันน้ำตาลทั้งหมด <small class="muted">(56+57)</small></td><td class="num">${sugarAllActual == null ? '—' : fmt(Math.round(sugarAllActual))}</td><td class="num muted">—</td></tr>
            </tbody></table></div>${fillFoot}`)
      + `<div class="kpi-grid kpi-grid-4">
          <div class="kpi kpi-tint-blue"><div class="kpi-label">🌾 ต้นทุนอ้อย ไร่บริษัท / ตัน</div><div class="kpi-value">${caneCo == null ? '—' : fmt(Math.round(caneCo))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ค่าอ้อย+จัดหา (1-3) ÷ ตันไร่บริษัท (ตามแผน/งบ)</div></div>
          <div class="kpi kpi-tint-teal"><div class="kpi-label">🌱 ต้นทุนอ้อย ไร่ส่งเสริม / ตัน</div><div class="kpi-value">${caneComm == null ? '—' : fmt(Math.round(caneComm))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ค่าอ้อย+จัดหา (4-6) ÷ ตันไร่ส่งเสริม (ตามแผน/งบ)</div></div>
          <div class="kpi"><div class="kpi-label">🏭 ต้นทุนรวม / ตันอ้อย</div><div class="kpi-value">${totCane == null ? '—' : fmt(Math.round(totCane))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ทุกหมวด ÷ ตันอ้อยรวม (ตามแผน/งบ)</div></div>
          <div class="kpi"><div class="kpi-label">🍬 ต้นทุนรวม / ตันน้ำตาล</div><div class="kpi-value">${totSugar == null ? '—' : fmt(Math.round(totSugar))} <small>กีบ/ตัน</small></div><div class="kpi-sub">รวมทั้งหมด ${fmt(Math.round(grand))} กีบ</div></div>
        </div>`
      + card('', `<p class="muted small" style="margin:0 0 8px">💡 จำนวนเงินทุกหมวด <span class="uc-auto" style="padding:1px 6px;border-radius:4px;background:#eef3ff">ดึง auto จาก GL ตามงบ</span> · <span style="background:#fff7cc;padding:1px 6px;border-radius:4px">เหลือง=รวมหมวด</span> · <span style="background:#fbe0ec;padding:1px 6px;border-radius:4px">ชมพู=รวมใหญ่</span> · กีบ/ตัน = จำนวนเงิน ÷ ปริมาณ &nbsp; ${srcNote}</p>
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

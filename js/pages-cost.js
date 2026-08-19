/* =============================================================
 * pages-cost.js — ต้นทุนต่อหน่วย (ตรงชีท "สรุป PPT รายฝ่าย_บาท")
 *
 *  จัดกลุ่มด้วย "รหัสหมวด PPT (1-33)" ต่อ GL (glAccounts[].pptCode จาก ppt-map.js)
 *  — แยกไร่บริษัท(หมวด1-3) / ไร่ส่งเสริม(หมวด4-6) ได้เป๊ะ รวมถึงค่าจัดหาอ้อย
 *  Layout ตามชีท: บล็อกไร่บริษัท ÷ ตันไร่บริษัท · ไร่ส่งเสริม ÷ ตันไร่ส่งเสริม · ที่เหลือ ÷ ตันรวม
 *  3 ชุด/ปี: งบต้นปี(ORIGINAL) · งบล่าสุด · เกิดจริง — ชุดละ (กีบ · /ตันอ้อย · /ตันน้ำตาล)
 *  ปริมาณ (ตัวหาร) กรอกโดยแผนกบริการไร่ (meta.volumeEditors) — ทุกคนเห็นข้อมูลชุดเดียวกัน
 * ============================================================= */

const PagesCost = (() => {
  const esc = s => UI.esc(s);
  const fmt = n => UI.fmt(n);
  const card = (t, b, o) => UI.card(t, b, o);

  const ALL = []; for (let i = 1; i <= 33; i++) ALL.push(i);
  // Layout ตรงชีท PPT — ['cat',รหัส,div] หรือ ['sum',ชื่อ,[รหัส...],div,style]
  //  div: 'co'=÷ตันไร่บริษัท · 'comm'=÷ตันไร่ส่งเสริม · 'all'=÷ตันรวม
  const LAYOUT = [
    ['cat', 1, 'co'], ['cat', 2, 'co'],
    ['sum', 'รวม ค่าอ้อย - ไร่บริษัท', [1, 2], 'co'],
    ['cat', 3, 'co'],
    ['sum', 'รวม ค่าอ้อย + ค่านำอ้อยเข้าหีบ - ไร่บริษัท', [1, 2, 3], 'co', 'strong'],
    ['cat', 4, 'comm'], ['cat', 5, 'comm'],
    ['sum', 'รวม ค่าอ้อย - ไร่ส่งเสริม', [4, 5], 'comm'],
    ['cat', 6, 'comm'],
    ['sum', 'รวม ค่าอ้อย + ค่านำอ้อยเข้าหีบ - ไร่ส่งเสริม', [4, 5, 6], 'comm', 'strong'],
    ['sum', 'รวม ค่าอ้อยทั้งหมด', [1, 2, 4, 5], 'all'],
    ['sum', 'รวม ค่านำอ้อยเข้าหีบทั้งหมด', [3, 6], 'all'],
    ['sum', 'รวม ค่าอ้อย + ค่านำอ้อยเข้าหีบทั้งหมด', [1, 2, 3, 4, 5, 6], 'all', 'strong'],
    ['cat', 7, 'all'],
    ['sum', 'รวมค่าวัตถุดิบ', [1, 2, 3, 4, 5, 6, 7], 'all', 'strong'],
    ['cat', 8, 'all'], ['cat', 9, 'all'], ['cat', 10, 'all'], ['cat', 11, 'all'], ['cat', 12, 'all'],
    ['sum', 'รวม เงินเดือน ค่าแรง สวัสดิการ', [8, 9, 10, 11, 12], 'all'],
    ['cat', 13, 'all'], ['cat', 14, 'all'], ['cat', 15, 'all'], ['cat', 16, 'all'], ['cat', 17, 'all'],
    ['cat', 18, 'all'], ['cat', 19, 'all'], ['cat', 20, 'all'], ['cat', 21, 'all'], ['cat', 22, 'all'],
    ['sum', 'รวม ค่าใช้จ่ายแปรสภาพ', [13, 14, 15, 16, 17, 18, 19, 20, 21, 22], 'all'],
    ['sum', 'รวม ต้นทุนการผลิต (รวมค่าเสื่อมราคา)', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], 'all', 'strong'],
    ['cat', 23, 'all'], ['cat', 24, 'all'], ['cat', 25, 'all'], ['cat', 26, 'all'], ['cat', 27, 'all'], ['cat', 28, 'all'], ['cat', 31, 'all'], ['cat', 33, 'all'],
    ['sum', 'รวม ค่าใช้จ่ายในการบริหารจัดการ', [23, 24, 25, 26, 27, 28, 31, 33], 'all'],
    ['cat', 29, 'all'], ['cat', 32, 'all'],
    ['sum', 'รวม (กำไร) - ขาดทุนจากอัตราแลกเปลี่ยน', [29, 32], 'all'],
    ['cat', 30, 'all'],
    ['sum', 'รวม ประมาณการค่าใช้จ่ายทั้งหมด', ALL, 'all', 'grand'],
  ];

  // รวมยอดปี year แยกตาม รหัสหมวด PPT × 3 ชุด (orig/live/act)
  function byCode(year) {
    const pc = {}; Store.db.glAccounts.forEach(g => { pc[g.id] = g.pptCode || 0; });
    const acc = {}; // code -> {orig, live, act}
    const add = (set, glId, months) => {
      const code = pc[glId]; if (!code) return;
      if (!acc[code]) acc[code] = { orig: 0, live: 0, act: 0 };
      acc[code][set] += (months || []).reduce((s, v) => s + (v || 0), 0);
    };
    Store.db.budgets.filter(b => b.year === year).forEach(b => add('live', b.glId, b.months));
    (Store.db.actuals || []).filter(a => a.year === year).forEach(a => add('act', a.glId, a.months));
    const snap = (Store.db.budgetSnapshots || []).find(s => s.year === year && s.label === 'ORIGINAL');
    if (snap) snap.rows.forEach(r => add('orig', r.glId, r.months));
    else Store.db.budgets.filter(b => b.year === year).forEach(b => add('orig', b.glId, b.months));
    return acc;
  }

  function unitCost(user) {
    const year = UI.year();
    const acc = byCode(year);
    const names = (Store.db.meta.pptCategories) || {};
    const canEditAny = Store.canEditVolume(user);   // แก้ได้อย่างน้อย 1 metric
    const vol = m => Store.volume(year, m);
    const vPrev = m => Store.volume(year - 1, m);
    const pick = (m, pa) => { const v = vol(m); const a = v.actual ?? null, p = v.plan ?? null; return pa ? (a ?? p ?? 0) : (p ?? a ?? 0); };
    const D = set => { const pa = set === 'act'; const co = pick('caneCompany', pa), comm = pick('caneCommunity', pa); return { co, comm, all: co + comm, sugar: pick('sugarProduce', pa) }; };
    const DIV = { orig: D('orig'), live: D('live'), act: D('act') };

    const amt = (codes, set) => codes.reduce((s, c) => s + ((acc[c] && acc[c][set]) || 0), 0);
    const perCane = (v, set, div) => { const d = DIV[set][div]; return d > 0 ? v / d : null; };
    const perSugar = (v, set) => { const d = DIV[set].sugar; return d > 0 ? v / d : null; };
    const cells = (codes, div) => ['orig', 'live', 'act'].map(set => {
      const v = amt(codes, set), pc = perCane(v, set, div), ps = perSugar(v, set);
      return `<td class="num">${fmt(Math.round(v))}</td>
        <td class="num uc-ton">${pc === null ? '—' : fmt(Math.round(pc))}</td>
        <td class="num uc-ton">${ps === null ? '—' : fmt(Math.round(ps))}</td>`;
    }).join('');

    const body = LAYOUT.map(row => {
      if (row[0] === 'cat') {
        const [, code, div] = row;
        return `<tr class="uc-cat"><td class="uc-item">${code}. ${esc(names[code] || ('หมวด ' + code))}${div !== 'all' ? '' : ''}</td>${cells([code], div)}</tr>`;
      }
      const [, name, codes, div, style] = row;
      const divTag = div === 'co' ? ' <small class="muted">(÷ ตันไร่บริษัท)</small>' : div === 'comm' ? ' <small class="muted">(÷ ตันไร่ส่งเสริม)</small>' : '';
      return `<tr class="uc-sum ${style === 'grand' ? 'uc-grand' : style === 'strong' ? 'uc-strong' : ''}"><td><b>${esc(name)}</b>${divTag}</td>${cells(codes, div)}</tr>`;
    }).join('');

    // KPI: ต้นทุนแต่ละประเภทไร่ (เกิดจริง)
    const caneCoAct = perCane(amt([1, 2, 3], 'act'), 'act', 'co');
    const caneCommAct = perCane(amt([4, 5, 6], 'act'), 'act', 'comm');
    const grandAct = amt(ALL, 'act'), grandLive = amt(ALL, 'live'), grandOrig = amt(ALL, 'orig');
    const totCaneAct = perCane(grandAct, 'act', 'all'), totSugarAct = perSugar(grandAct, 'act');

    // ฟอร์มปริมาณ
    const volRows = Store.VOLUME_METRICS.map(m => {
      const v = vol(m.key), pv = vPrev(m.key);
      const canM = Store.canEditVolume(user, m.key);
      const isSugar = m.key.indexOf('sugar') === 0;
      const inp = f => canM
        ? `<input class="uc-vol" data-vol="${m.key}" data-field="${f}" inputmode="decimal" value="${v[f] ?? ''}" placeholder="กรอก">`
        : `<b>${v[f] === null || v[f] === undefined ? '—' : fmt(v[f])}</b>`;
      return `<tr><td>${esc(m.label)}${isSugar ? ' <small class="muted">(ฝ่ายผลิตกรอก)</small>' : ''}</td>
        <td class="num">${inp('plan')}</td><td class="num">${inp('actual')}</td>
        <td class="num muted">${(pv.actual ?? pv.plan) == null ? '—' : fmt(pv.actual ?? pv.plan)}</td></tr>`;
    }).join('');

    return UI.pageHead(`ต้นทุนต่อหน่วย ปี ${year} 🏭`,
        `ตรงชีท "สรุป PPT รายฝ่าย" · 33 หมวด · แยกไร่บริษัท/ไร่ส่งเสริม · กีบ//ตันอ้อย//ตันน้ำตาล · ทุก user เห็นชุดเดียวกัน`)
      + card(`📥 ปริมาณผลิต (ตัวหาร) — ${canEditAny ? '✏️ คุณมีสิทธิ์กรอกบางรายการ' : 'ดูอย่างเดียว'} · อ้อย=บริการไร่ · น้ำตาล=ฝ่ายผลิต`, `
          <div class="table-scroll"><table class="data-table small"><thead>
            <tr><th>ปริมาณ ปี ${year}</th><th class="num">ตามแผน/งบ (ตัน)</th><th class="num">เกิดจริง (ตัน)</th><th class="num">ปี ${year - 1}</th></tr></thead>
            <tbody>${volRows}
              <tr class="tr-sum"><td>รวมตันอ้อยทั้งหมด</td><td class="num">${fmt(Math.round(DIV.live.all))}</td><td class="num">${fmt(Math.round(DIV.act.all))}</td>
                <td class="num muted">${fmt(Math.round((vPrev('caneCompany').actual || 0) + (vPrev('caneCommunity').actual || 0)))}</td></tr>
            </tbody></table></div>
          <p class="muted small" style="margin-top:8px">💡 กรอกก่อนตั้งงบปีถัดไป · หมวด 1-3 (ไร่บริษัท) ÷ ตันไร่บริษัท · หมวด 4-6 (ไร่ส่งเสริม) ÷ ตันไร่ส่งเสริม · หมวดอื่น ÷ ตันอ้อยรวม · ทุกหมวด ÷ ตันน้ำตาลผลิต (สูตรตรงไฟล์)</p>`)
      + `<div class="kpi-grid kpi-grid-4">
          <div class="kpi kpi-tint-blue"><div class="kpi-label">🌾 ต้นทุนอ้อย ไร่บริษัท / ตัน (เกิดจริง)</div><div class="kpi-value">${caneCoAct === null ? '—' : fmt(Math.round(caneCoAct))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ค่าอ้อย+จัดหา ÷ ตันไร่บริษัท</div></div>
          <div class="kpi kpi-tint-teal"><div class="kpi-label">🌱 ต้นทุนอ้อย ไร่ส่งเสริม / ตัน (เกิดจริง)</div><div class="kpi-value">${caneCommAct === null ? '—' : fmt(Math.round(caneCommAct))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ค่าอ้อย+จัดหา ÷ ตันไร่ส่งเสริม</div></div>
          <div class="kpi"><div class="kpi-label">🏭 ต้นทุนรวม / ตันอ้อย</div><div class="kpi-value">${totCaneAct === null ? '—' : fmt(Math.round(totCaneAct))} <small>กีบ/ตัน</small></div><div class="kpi-sub">ทุกค่าใช้จ่าย ÷ ตันอ้อยรวม</div></div>
          <div class="kpi"><div class="kpi-label">🍬 ต้นทุนรวม / ตันน้ำตาล</div><div class="kpi-value">${totSugarAct === null ? '—' : fmt(Math.round(totSugarAct))} <small>กีบ/ตัน</small></div><div class="kpi-sub">งบล่าสุด ${fmt(Math.round(grandLive))} · ต้นปี ${fmt(Math.round(grandOrig))}</div></div>
        </div>`
      + card('', `<div class="table-scroll"><table class="data-table uc-table">
          <thead>
            <tr><th rowspan="2" style="min-width:280px">รายการ (หมวด PPT)</th><th colspan="3" class="uc-h1">งบต้นปี ${year}</th><th colspan="3" class="uc-h2">งบล่าสุด ${year}</th><th colspan="3" class="uc-h3">เกิดจริง ${year}</th></tr>
            <tr>${'<th class="num">กีบ</th><th class="num">/ตันอ้อย</th><th class="num">/ตันน้ำตาล</th>'.repeat(3)}</tr>
          </thead><tbody>${body}</tbody></table></div>`, { cls: 'card-flush' });
  }

  function unitCostBind(user) {
    document.querySelectorAll('.uc-vol').forEach(inp => {
      inp.addEventListener('change', () => {
        const raw = inp.value.replace(/[,\s]/g, '').trim();
        const val = raw === '' ? null : Number(raw);
        if (raw !== '' && (!isFinite(val) || val < 0)) { UI.toast('ตัวเลขไม่ถูกต้อง', 'err'); return; }
        try {
          Store.setVolume(user, UI.year(), inp.dataset.vol, inp.dataset.field, val);
          UI.toast('บันทึกปริมาณแล้ว — ต้นทุนต่อหน่วยคำนวณใหม่');
          App.render();
        } catch (e) { UI.toast(e.message, 'err'); }
      });
    });
  }

  return { unitCost, unitCostBind };
})();

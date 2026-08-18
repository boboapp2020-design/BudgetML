/* =============================================================
 * pages-cost.js — ต้นทุนต่อหน่วย (กีบ/ตันอ้อย · กีบ/ตันน้ำตาล)
 *
 * จำลองชีท "สรุป PPT รายฝ่าย_บาท" ของไฟล์จริง:
 *  - จัดกลุ่มค่าใช้จ่ายตาม Group Sap → บล็อกหมวด (ค่าอ้อย/วัตถุดิบ/แรงงาน/แปรสภาพ/บริหาร)
 *  - 3 ชุดตัวเลขต่อปี: งบต้นปี (ORIGINAL) · งบล่าสุด · เกิดจริง — ชุดละ (กีบ, /ตันอ้อย, /ตันน้ำตาล)
 *  - สูตรตามไฟล์: ค่าอ้อยไร่บริษัท ÷ ตันไร่บริษัท · ไร่ส่งเสริม ÷ ตันไร่ส่งเสริม
 *                 รายการกลาง ÷ ตันอ้อยรวม · ทุกรายการ ÷ ตันน้ำตาลผลิต
 *  - ปริมาณ (ตัวหาร) กรอกโดยแอดมิน/แผนกใน meta.volumeEditors — ทุกคนเห็นข้อมูลชุดเดียวกัน
 * ============================================================= */

const PagesCost = (() => {
  const esc = s => UI.esc(s);
  const fmt = n => UI.fmt(n);
  const card = (t, b, o) => UI.card(t, b, o);

  // หมวด (เรียงตามไฟล์) · div: ตัวหารต่อตันอ้อย — co=ตันไร่บริษัท, comm=ตันไร่ส่งเสริม, all=ตันรวม
  const BLOCKS = [
    { name: 'ค่าอ้อย — ไร่บริษัท', div: 'co', match: g => /ไร่บริษัท/.test(g) },
    { name: 'ค่าอ้อย — ไร่ส่งเสริม/ชุมชน', div: 'comm', match: g => /ไร่ส่งเสริม/.test(g) },
    { name: 'ค่าใช้จ่ายจัดหาอ้อย', div: 'all', match: g => /จัดหาอ้อย/.test(g) },
    { name: 'ค่าเคมีภัณฑ์', div: 'all', match: g => /เคมีภัณฑ์/.test(g) },
    { name: 'เงินเดือน ค่าแรง สวัสดิการ', div: 'all', match: g => /(เงินเดือน|คาแรง|ค่าแรง|จ้างเหมา|สวัสดิการ|โบนัส)/.test(g) },
    { name: 'ค่าใช้จ่ายแปรสภาพ', div: 'all', match: g => /(น้ำมัน|เชื้อเพลิง|ไฟฟ้า|ซ่อมแซม|เช่า|เครื่องมือ|หีบห่อ|บรรจุ|ขนส่ง|คุณภาพ|เสื่อมราคา)/.test(g) },
    { name: 'บริหาร / ขาย / การเงิน / อื่น ๆ', div: 'all', match: g => /(บริหารจัดการ|วิจัย|ส่งออก|ขายและการตลาด|ธรรมเนียม|พิเศษ|ดอกเบี้ย|ภาษี|ด้อยค่า|ยุติธรรม)/.test(g) },
    { name: 'กำไร/ขาดทุนอัตราแลกเปลี่ยน', div: 'all', match: g => /อัตราแลกเปลี่ยน/.test(g) },
    { name: 'ต้นทุนขายน้ำตาล Trading', div: 'all', match: g => /Trading/.test(g) },
  ];
  const blockOf = grp => { for (const b of BLOCKS) if (b.match(grp || '')) return b; return { name: 'อื่น ๆ (ไม่จัดกลุ่ม)', div: 'all' }; };

  // รวมยอดปี year แยกตาม Group Sap × 3 ชุด (orig=งบต้นปี ORIGINAL, live=งบล่าสุด, act=เกิดจริง)
  function totalsByGroup(year) {
    const glMap = {}; Store.db.glAccounts.forEach(g => { glMap[g.id] = g; });
    const acc = {};
    const add = (set, glId, months) => {
      const g = glMap[glId]; if (!g) return;
      const grp = g.glGroupSap || g.glGroup || 'อื่น ๆ';
      if (!acc[grp]) acc[grp] = { orig: 0, live: 0, act: 0 };
      acc[grp][set] += (months || []).reduce((s, v) => s + (v || 0), 0);
    };
    Store.db.budgets.filter(b => b.year === year).forEach(b => add('live', b.glId, b.months));
    (Store.db.actuals || []).filter(a => a.year === year).forEach(a => add('act', a.glId, a.months));
    const snap = (Store.db.budgetSnapshots || []).find(s => s.year === year && s.label === 'ORIGINAL');
    if (snap) snap.rows.forEach(r => add('orig', r.glId, r.months));
    else Store.db.budgets.filter(b => b.year === year).forEach(b => add('orig', b.glId, b.months)); // ยังไม่ freeze → ใช้ตัว live แทน
    return acc;
  }

  function unitCost(user) {
    const year = UI.year();
    const acc = totalsByGroup(year);
    const canEdit = Store.canEditVolume(user);
    const vol = m => Store.volume(year, m);
    const vPrev = m => Store.volume(year - 1, m);
    // ตัวหารต่อชุด: งบ (orig/live) ใช้แผนก่อน · เกิดจริง (act) ใช้จริงก่อน — ไม่มีก็ fallback อีกตัว
    const pick = (m, preferActual) => { const v = vol(m); const a = v.actual ?? null, p = v.plan ?? null; return preferActual ? (a ?? p ?? 0) : (p ?? a ?? 0); };
    const D = set => { const pa = set === 'act'; const co = pick('caneCompany', pa), comm = pick('caneCommunity', pa); return { co, comm, all: co + comm, sugar: pick('sugarProduce', pa) }; };
    const DIV = { orig: D('orig'), live: D('live'), act: D('act') };
    const perTon = (amt, set, k) => { const d = DIV[set][k]; return d > 0 ? amt / d : null; };
    const cell = (amt, set, k) => {
      const pa = perTon(amt, set, k), ps = perTon(amt, set, 'sugar');
      return `<td class="num">${fmt(Math.round(amt))}</td>
        <td class="num uc-ton">${pa === null ? '—' : fmt(Math.round(pa))}</td>
        <td class="num uc-ton">${ps === null ? '—' : fmt(Math.round(ps))}</td>`;
    };

    const blocks = new Map();
    Object.keys(acc).sort((a, b) => a.localeCompare(b, 'th')).forEach(grp => {
      const b = blockOf(grp);
      if (!blocks.has(b.name)) blocks.set(b.name, { def: b, rows: [] });
      blocks.get(b.name).rows.push({ grp, t: acc[grp] });
    });
    const ordered = [...blocks.entries()].sort((a, b) => {
      const ia = BLOCKS.findIndex(x => x.name === a[0]), ib = BLOCKS.findIndex(x => x.name === b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    let body = ''; const grand = { orig: 0, live: 0, act: 0 };
    for (const [name, blk] of ordered) {
      const sub = { orig: 0, live: 0, act: 0 };
      const rowsHtml = blk.rows.map(r => {
        sub.orig += r.t.orig; sub.live += r.t.live; sub.act += r.t.act;
        return `<tr class="uc-row"><td class="uc-item">${esc(r.grp)}</td>${cell(r.t.orig, 'orig', blk.def.div)}${cell(r.t.live, 'live', blk.def.div)}${cell(r.t.act, 'act', blk.def.div)}</tr>`;
      }).join('');
      grand.orig += sub.orig; grand.live += sub.live; grand.act += sub.act;
      body += `<tr class="uc-block"><td><b>${esc(name)}</b>${blk.def.div !== 'all' ? ` <small class="muted">(÷ ตัน${blk.def.div === 'co' ? 'อ้อยไร่บริษัท' : 'อ้อยไร่ส่งเสริม'})</small>` : ''}</td>${cell(sub.orig, 'orig', blk.def.div)}${cell(sub.live, 'live', blk.def.div)}${cell(sub.act, 'act', blk.def.div)}</tr>${rowsHtml}`;
    }
    body += `<tr class="tr-sum"><td><b>รวมค่าใช้จ่ายทั้งหมด</b></td>${cell(grand.orig, 'orig', 'all')}${cell(grand.live, 'live', 'all')}${cell(grand.act, 'act', 'all')}</tr>`;

    const volRows = Store.VOLUME_METRICS.map(m => {
      const v = vol(m.key), pv = vPrev(m.key);
      const inp = field => canEdit
        ? `<input class="uc-vol" data-vol="${m.key}" data-field="${field}" inputmode="decimal" value="${v[field] ?? ''}" placeholder="กรอก">`
        : `<b>${v[field] === null || v[field] === undefined ? '—' : fmt(v[field])}</b>`;
      return `<tr><td>${esc(m.label)}</td><td class="num">${inp('plan')}</td><td class="num">${inp('actual')}</td>
        <td class="num muted">${(pv.actual ?? pv.plan) == null ? '—' : fmt(pv.actual ?? pv.plan)}</td></tr>`;
    }).join('');

    const caneAct = DIV.act.all, sugarAct = DIV.act.sugar;
    return UI.pageHead(`ต้นทุนต่อหน่วย ปี ${year} 🏭`, `กีบ/ตันอ้อย · กีบ/ตันน้ำตาล · จัดกลุ่มตาม Group Sap ตามชีทสรุป PPT · ทุก user เห็นข้อมูลชุดเดียวกัน`)
      + card(`📥 ปริมาณผลิต (ตัวหาร) — ${canEdit ? '✏️ คุณมีสิทธิ์กรอก/แก้ไข' : 'ดูอย่างเดียว (กรอกโดยแผนกบัญชี/แผนกที่กำหนด)'}`, `
          <div class="table-scroll"><table class="data-table small"><thead>
            <tr><th>ปริมาณ ปี ${year}</th><th class="num">ตามแผน/งบ (ตัน)</th><th class="num">เกิดจริง (ตัน)</th><th class="num">ปี ${year - 1}</th></tr></thead>
            <tbody>${volRows}
              <tr class="tr-sum"><td>รวมตันอ้อยทั้งหมด</td><td class="num">${fmt(Math.round(DIV.live.all))}</td><td class="num">${fmt(Math.round(DIV.act.all))}</td>
                <td class="num muted">${fmt(Math.round((vPrev('caneCompany').actual || 0) + (vPrev('caneCommunity').actual || 0)))}</td></tr>
            </tbody></table></div>
          <p class="muted small" style="margin-top:8px">💡 กรอกปริมาณก่อนตั้งงบปีถัดไป · สูตรตามไฟล์จริง: ค่าอ้อยไร่บริษัท ÷ ตันไร่บริษัท · ไร่ส่งเสริม ÷ ตันไร่ส่งเสริม · รายการกลาง ÷ ตันอ้อยรวม · ทุกรายการ ÷ ตันน้ำตาลผลิต</p>`)
      + `<div class="kpi-grid kpi-grid-4">
          <div class="kpi kpi-tint-blue"><div class="kpi-label">🏭 ต้นทุนรวม / ตันอ้อย (เกิดจริง)</div><div class="kpi-value">${caneAct > 0 ? fmt(Math.round(grand.act / caneAct)) : '—'} <small>กีบ</small></div><div class="kpi-sub">รวมทุกหมวดค่าใช้จ่าย</div></div>
          <div class="kpi kpi-tint-teal"><div class="kpi-label">🍬 ต้นทุนรวม / ตันน้ำตาล (เกิดจริง)</div><div class="kpi-value">${sugarAct > 0 ? fmt(Math.round(grand.act / sugarAct)) : '—'} <small>กีบ</small></div><div class="kpi-sub">฿ ต่อตันน้ำตาลผลิต</div></div>
          <div class="kpi"><div class="kpi-label">🌾 ค่าอ้อยไร่บริษัท / ตัน</div><div class="kpi-value">${DIV.act.co > 0 ? fmt(Math.round((acc['ค่าอ้อยสด-ไร่บริษัท']?.act || 0) / DIV.act.co + ((acc['ค่าอ้อยไฟไหม้-ไร่บริษัท']?.act || 0) / DIV.act.co))) : '—'} <small>กีบ</small></div><div class="kpi-sub">เทียบไร่ส่งเสริม: ${DIV.act.comm > 0 ? fmt(Math.round(((acc['ค่าอ้อยสด - ไร่ส่งเสริม']?.act || 0) + (acc['ค่าอ้อยไฟไหม้ - ไร่ส่งเสริม']?.act || 0)) / DIV.act.comm)) : '—'} กีบ/ตัน</div></div>
          <div class="kpi"><div class="kpi-label">💰 ค่าใช้จ่ายรวมปี ${year} (ล่าสุด)</div><div class="kpi-value">${fmt(Math.round(grand.live))} <small>กีบ</small></div><div class="kpi-sub">งบต้นปี ${fmt(Math.round(grand.orig))} กีบ</div></div>
        </div>`
      + card('', `<div class="table-scroll"><table class="data-table uc-table">
          <thead>
            <tr><th rowspan="2" style="min-width:220px">รายการ (Group Sap)</th><th colspan="3" class="uc-h1">งบต้นปี ${year}</th><th colspan="3" class="uc-h2">งบล่าสุด ${year}</th><th colspan="3" class="uc-h3">เกิดจริง ${year}</th></tr>
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

/* =============================================================
 * pages-mgr.js — หน้าจอผู้จัดการฝ่าย (MANAGER)
 * ดูภาพรวมงบเฉพาะ "ฝ่าย" ของตนเอง (rollup ทุกแผนกในฝ่าย) · อ่านอย่างเดียว
 * ============================================================= */

const PagesMgr = (() => {
  const { fmt, fmtShort, deltaBadge, esc, card, pageHead, asOf } = UI;

  function kpiC(icon, iconBg, tint, label, valueHtml, sub) {
    return `<div class="kpi kpi-c ${tint}"><div class="kpi-ic" style="background:${iconBg}">${icon}</div>
      <div class="kpi-body"><div class="kpi-label">${label}</div>
      <div class="kpi-value">${valueHtml}</div><div class="kpi-sub">${sub}</div></div></div>`;
  }
  const ST_META = {
    SUBMITTED: { label: 'ส่งแล้ว รอตรวจ', color: '#256abf' }, LOCKED: { label: 'ปิดรอบแล้ว', color: '#52514e' },
    COMPLETED: { label: 'ครบ รอส่ง', color: '#0ca30c' }, IN_PROGRESS: { label: 'กำลังกรอก', color: '#eda100' },
    NEED_REVISION: { label: 'ตีกลับแก้ไข', color: '#d03b3b' }, DRAFT: { label: 'ยังไม่เริ่ม', color: '#c3c2b7' },
  };

  function dashboard(user) {
    const year = UI.year(), prevYear = year - 1;
    const unit = Store.oversightUnit(user.orgUnit) || { name: '(หน่วยงาน)' };
    const div = unit.name;
    const depts = Store.subtreeDepartments(user.orgUnit);
    const kids = Store.childUnits(user.orgUnit);
    const rv = Store.revisePhase(year);

    const cur = depts.reduce((s, d) => s + Store.deptTotal(year, d.id), 0);
    const prev = depts.reduce((s, d) => s + Store.deptTotal(prevYear, d.id), 0);
    const orig = rv.on ? depts.reduce((s, d) => s + Store.originalDeptTotal(year, d.id), 0) : 0;
    const baseVal = rv.on ? orig : prev;
    const cmp = Store.compare(cur, baseVal);
    const baseLabel = rv.on ? 'งบเดิม (ก่อน Revise)' : `ปี ${prevYear}`;

    // สถานะการส่ง
    const states = depts.map(d => Store.deptState(year, d.id).status);
    const cnt = {}; states.forEach(s => cnt[s] = (cnt[s] || 0) + 1);
    const submitted = (cnt.SUBMITTED || 0) + (cnt.LOCKED || 0);
    const stOrder = ['SUBMITTED', 'LOCKED', 'COMPLETED', 'IN_PROGRESS', 'NEED_REVISION', 'DRAFT'];
    const segs = stOrder.filter(s => cnt[s]).map(s =>
      `<div class="status-seg" style="flex:${cnt[s]};background:${ST_META[s].color}" title="${ST_META[s].label}: ${cnt[s]}"></div>`).join('');
    const legends = stOrder.filter(s => cnt[s]).map(s =>
      `<span class="st-legend"><span class="dl-dot" style="background:${ST_META[s].color}"></span>${ST_META[s].label} <b>${cnt[s]}</b></span>`).join('');

    // ตารางแผนกในฝ่าย
    const rows = depts.slice().sort((a, b) => Store.deptTotal(year, b.id) - Store.deptTotal(year, a.id)).map(d => {
      const c = Store.deptTotal(year, d.id), p = Store.deptTotal(prevYear, d.id);
      const o = rv.on ? Store.originalDeptTotal(year, d.id) : 0;
      const cc = Store.compare(c, rv.on ? o : p);
      const st = Store.deptState(year, d.id).status;
      const share = cur > 0 ? (c / cur * 100) : 0;
      const revCol = rv.on ? `<td class="num">${fmt(o)}</td>` : `<td class="num">${fmt(p)}</td>`;
      return `<tr>
        <td><a class="link" href="#/mgr/dept?d=${d.id}"><b>${UI.deptIcon(d)} ${esc(d.name)}</b></a><div class="muted small">${d.code} · <a class="link" href="#/mgr/dept?d=${d.id}">ดูรายย่อย →</a></div></td>
        ${revCol}
        <td class="num">${fmt(c)}</td>
        <td>${deltaBadge(cc.diff, cc.pct)}</td>
        <td><div class="comp-bar"><div class="comp-fill" style="width:${share.toFixed(0)}%"></div></div>${share.toFixed(1)}%</td>
        <td><span class="anomaly" style="background:${ST_META[st].color}22;color:${ST_META[st].color}">${ST_META[st].label}</span></td></tr>`;
    }).join('');

    const kidNote = kids.length ? ` · ครอบคลุมหน่วย: ${kids.map(k => esc(k.name)).join(', ')}` : '';
    return pageHead(`ภาพรวม${esc(div)} 📊`,
        `หน่วยกำกับดูแล · ${depts.length} แผนกที่มีงบ${kidNote} · งบปี ${year} · ${esc(Store.db.meta.company)} · ${asOf()}`,
        `<button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`)

      + `<div class="kpi-grid kpi-grid-4">
        ${kpiC('🏢', '#e6f0fb', 'kpi-tint-blue', `งบรวมทั้งฝ่าย ปี ${year}`, `${fmtShort(cur)} <small>กีบ</small>`, fmt(cur) + ' กีบ')}
        ${kpiC(rv.on ? '🧊' : '🗓️', '#e6f7f0', 'kpi-tint-teal', baseLabel, `${fmtShort(baseVal)} <small>กีบ</small>`, fmt(baseVal) + ' กีบ')}
        ${kpiC(cmp.diff >= 0 ? '📈' : '📉', cmp.diff >= 0 ? '#fdecec' : '#eaf6ea', 'kpi-tint-green', rv.on ? 'เพิ่ม/ลดจากงบเดิม' : 'เพิ่ม/ลด', `<span>${deltaBadge(cmp.diff, cmp.pct)}</span>`, (cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff) + ' กีบ')}
        ${kpiC('📮', submitted === depts.length ? '#eaf6ea' : '#fff7e6', 'kpi-tint-amber', rv.on ? 'ส่ง Revise แล้ว' : 'ส่งงบแล้ว', `${submitted} <small>/ ${depts.length} แผนก</small>`, submitted === depts.length ? 'ครบทุกแผนก ✓' : `รออีก ${depts.length - submitted} แผนก`)}
      </div>`

      + card(`📮 สถานะการส่งของแผนกในฝ่าย`, `<div class="exec-status-bar">${segs}</div><div class="st-legends">${legends}</div>`)

      + `<div class="grid-2">`
      + card(`📈 งบรายเดือนของฝ่าย ปี ${year} (กีบ)`, `<div id="chMgrMonthly"></div>`)
      + card(`🏆 Top GL ค่าใช้จ่ายสูงสุดในฝ่าย (กีบ)`, `<div id="chMgrTopGL"></div>`)
      + `</div>`

      + card(`🏢 แผนกภายใต้ ${esc(div)} (${depts.length})`, `<div class="table-scroll"><table class="data-table">
          <thead><tr><th>แผนก</th><th class="num">${rv.on ? 'งบเดิม' : 'ปี ' + prevYear} (กีบ)</th><th class="num">ปี ${year} (กีบ)</th><th>%Δ</th><th>สัดส่วนในฝ่าย</th><th>สถานะ</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`, { cls: 'card-flush' });
  }

  function dashboardBind(user) {
    const year = UI.year();
    const depts = Store.subtreeDepartments(user.orgUnit);
    const rv = Store.revisePhase(year);

    // รายเดือน: ปีนี้ (+ งบเดิม ช่วง revise + เกิดจริง)
    const monthly = y => { const m = Array(12).fill(0); depts.forEach(d => Store.deptMonthly(y, d.id).forEach((v, i) => m[i] += (v || 0))); return m; };
    const series = [];
    if (rv.on) {
      const om = Array(12).fill(0); depts.forEach(d => Store.originalDeptMonthly(year, d.id).forEach((v, i) => om[i] += (v || 0)));
      series.push({ name: 'งบเดิม', color: Charts.PREV_C, values: om });
    } else {
      series.push({ name: `ปี ${year - 1}`, color: Charts.PREV_C, values: monthly(year - 1) });
    }
    series.push({ name: `ปี ${year}${rv.on ? ' (Revise)' : ''}`, color: Charts.CUR_C, values: monthly(year) });
    const actMonthly = Array(12).fill(0); let hasAct = false;
    (Store.db.actuals || []).filter(a => a.year === year && depts.some(d => d.id === a.departmentId))
      .forEach(a => a.months.forEach((v, i) => { if (v) { actMonthly[i] += v; hasAct = true; } }));
    if (hasAct) series.push({ name: 'เกิดจริง', color: '#0ca30c', values: actMonthly.slice(0, Math.max(1, rv.thru || 12)) });
    Charts.line(document.getElementById('chMgrMonthly'), Store.MONTH_S, series);

    // Top GL ในฝ่าย
    const glTot = {};
    depts.forEach(d => Store.deptGLs(d.id).forEach(g => { glTot[g.id] = (glTot[g.id] || 0) + Store.glTotal(year, d.id, g.id); }));
    const gById = {}; Store.db.glAccounts.forEach(g => gById[g.id] = g);
    const total = Math.max(1, Object.values(glTot).reduce((s, v) => s + v, 0));
    const top = Object.entries(glTot).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    Charts.hbar(document.getElementById('chMgrTopGL'), top.map(([id, v]) => {
      const g = gById[id] || { code: id, name: '' };
      return { label: `${g.code} ${g.name}`, value: v, color: Charts.CUR_C, sub: `${(v / total * 100).toFixed(1)}% ของฝ่าย<br>` };
    }));
  }

  /* ---------- รายย่อยของแผนก (อ่านอย่างเดียว) ---------- */
  function parseQS() {
    const q = location.hash.split('?')[1] || '';
    return Object.fromEntries(new URLSearchParams(q));
  }
  function deptDetail(user) {
    const qs = parseQS();
    const year = UI.year(), prevYear = year - 1;
    const d = Store.dept(qs.d);
    // กันสิทธิ์: ผจก.ดูได้เฉพาะแผนกใน subtree ของตน
    if (!d || !Store.subtreeDeptCodes(user.orgUnit).includes(d.code)) { location.hash = '#/mgr/dashboard'; return ''; }
    const rv = Store.revisePhase(year);
    const unitName = (Store.oversightUnit(user.orgUnit) || {}).name || '';
    const rows = Store.deptRows(d.id);
    const cur = Store.deptTotal(year, d.id), prev = Store.deptTotal(prevYear, d.id);
    const orig = rv.on ? Store.originalDeptTotal(year, d.id) : 0;
    const baseVal = rv.on ? orig : prev;
    const cmp = Store.compare(cur, baseVal);

    const body = rows.map(r => {
      const m = Store.rowMonths(year, d.id, r.key);
      const tot = Store.rowTotal(year, d.id, r.key);
      const nt = Store.note(year, d.id, r.key);
      const noteHtml = (nt.reason || nt.assumption)
        ? `<div class="muted" style="font-size:11px">${nt.reason ? '💬 ' + esc(nt.reason.slice(0, 70)) : ''}${nt.assumption ? ' · 📌 ' + esc(nt.assumption.slice(0, 50)) : ''}</div>` : '';
      return `<tr>
        <td class="small" style="min-width:220px"><span class="gl-code">${r.gl.code}</span> ${esc(r.gl.name)}
          <div class="muted" style="font-size:11px">CCT ${r.cct}${r.io && r.io !== 'ไม่คุม' ? ' · IO ' + esc(r.io) : ''}</div>${noteHtml}</td>
        ${m.map(v => `<td class="num small">${v ? fmt(v) : '<span class="muted">—</span>'}</td>`).join('')}
        <td class="num"><b>${fmt(tot)}</b></td></tr>`;
    }).join('');

    return pageHead(`${UI.deptIcon(d)} ${esc(d.name)}`, `รายย่อยงบปี ${year} · 🔒 อ่านอย่างเดียว · ${asOf()}`)
      + `<div class="breadcrumb"><a href="#/mgr/dashboard">← กลับภาพรวม${esc(unitName)}</a> › <b>${esc(d.name)}</b></div>`
      + `<div class="kpi-grid kpi-grid-4">
        ${kpiC('💵', '#e6f0fb', 'kpi-tint-blue', `งบปี ${year}`, `${fmtShort(cur)} <small>กีบ</small>`, fmt(cur) + ' กีบ')}
        ${kpiC(rv.on ? '🧊' : '🗓️', '#e6f7f0', 'kpi-tint-teal', rv.on ? 'งบเดิม' : `ปี ${prevYear}`, `${fmtShort(baseVal)} <small>กีบ</small>`, fmt(baseVal) + ' กีบ')}
        ${kpiC(cmp.diff >= 0 ? '📈' : '📉', cmp.diff >= 0 ? '#fdecec' : '#eaf6ea', 'kpi-tint-green', 'เพิ่ม/ลด', `<span>${deltaBadge(cmp.diff, cmp.pct)}</span>`, (cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff) + ' กีบ')}
        ${kpiC('📋', '#fff7e6', 'kpi-tint-amber', 'จำนวนรายการ', `${rows.length} <small>รายการ</small>`, 'GL × CCT')}
      </div>`
      + card('', `<div class="mgr-toolbar"><button id="mgrFsBtn" class="ghost-btn small btn-fs" title="ขยายตารางเกือบเต็มจอ (Esc เพื่อย่อกลับ)">⛶ ขยายตาราง</button></div>
          <div class="table-scroll fs-scroll"><table class="data-table small">
          <thead><tr><th>รายการ (GL · CCT)</th>${Store.MONTH_S.map(mo => `<th class="num">${mo}</th>`).join('')}<th class="num">รวมทั้งปี</th></tr></thead>
          <tbody>${body}
          <tr class="tr-sum"><td><b>รวมทั้งแผนก</b></td>${Store.deptMonthly(year, d.id).map(v => `<td class="num"><b>${fmt(v)}</b></td>`).join('')}<td class="num"><b>${fmt(cur)}</b></td></tr>
          </tbody></table></div>`, { cls: 'card-flush fs-card' });
  }
  function deptDetailBind() {
    const fsCard = document.querySelector('.fs-card');
    const fsBtn = document.getElementById('mgrFsBtn');
    if (!fsCard || !fsBtn) return;
    const setFs = on => {
      fsCard.classList.toggle('fullscreen', on);
      document.body.classList.toggle('no-scroll', on);
      fsBtn.textContent = on ? '✕ ย่อกลับ' : '⛶ ขยายตาราง';
    };
    fsBtn.addEventListener('click', () => setFs(!fsCard.classList.contains('fullscreen')));
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && fsCard.classList.contains('fullscreen')) setFs(false);
      if (!document.body.contains(fsCard)) { document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', esc); }
    });
  }

  return { dashboard, dashboardBind, deptDetail, deptDetailBind };
})();

window.PagesMgr = PagesMgr;

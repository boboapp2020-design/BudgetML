/* =============================================================
 * pages-user.js — หน้าจอฝั่ง Department User
 * ============================================================= */

const PagesUser = (() => {
  const { fmt, fmtPct, deltaBadge, esc, kpi, card, pageHead, asOf, toast } = UI;

  // การ์ด KPI แบบเกจ % (สีเปลี่ยนตามความคืบหน้า — 100% เขียวสด)
  function gaugeKpi(label, pct, sub, dataAttr = '') {
    return `<div class="kpi kpi-gauge kpi-tint-amber"><div class="kpi-label">${label}</div>
      <div class="gauge-wrap" ${dataAttr}>${Charts.gauge(pct)}</div>
      <div class="kpi-sub">${sub}</div></div>`;
  }
  // การ์ด KPI — ไม่มีไอคอน เน้นตัวเลขใหญ่ (icon/iconBg คงพารามิเตอร์ไว้เพื่อความเข้ากันได้)
  function kpiC(icon, iconBg, tint, label, valueHtml, sub) {
    return `<div class="kpi kpi-noic ${tint}">
      <div class="kpi-body"><div class="kpi-label">${label}</div>
      <div class="kpi-value">${valueHtml}</div><div class="kpi-sub">${sub}</div></div></div>`;
  }
  // ไอคอนประจำ GL (เลือกตามกลุ่มบัญชี/ชื่อ)
  const GL_ICON_MAP = [
    [/น้ำมัน|เชื้อเพลิง/, '⛽', '#fdf0e6'], [/เงินเดือน|ค่าแรง|โบนัส|สวัสดิการ|ล่วงเวลา|เบี้ยเลี้ยง/, '👥', '#e6f0fb'],
    [/ซ่อม/, '🔧', '#fdeee6'], [/เดินทาง|ที่พัก|ยานพาหนะ/, '✈️', '#e6f4fb'],
    [/วิเคราะห์|คุณภาพ|ISO|มอก/, '🔬', '#f3effc'], [/สิ่งแวดล้อม|ปลอดภัย/, '🌿', '#e6f7f0'],
    [/เช่า/, '🏢', '#f0f0fa'], [/ไฟฟ้า|พลังงาน/, '⚡', '#fdf7e0'],
    [/เครื่องเขียน|สำนักงาน|วัสดุ|เครื่องมือ/, '✏️', '#fdeef4'], [/รับรอง|ประชุม|อบรม|สัมมนา/, '🤝', '#e6f7f0'],
    [/ภาษี|ธรรมเนียม|ประกัน/, '🧾', '#f0efec'], [/เคมี/, '🧪', '#f3effc'], [/วิเคราะห์คุณภาพ/, '🔬', '#f3effc'],
  ];
  function glIcon(g) {
    const label = (g.glGroup || '') + ' ' + g.name;
    const hit = GL_ICON_MAP.find(m => m[0].test(label)) || [null, '📄', '#eef2f8'];
    return `<span class="gl-ic" style="background:${hit[2]}">${hit[1]}</span>`;
  }

  function ctx(user) {
    const year = UI.year(), deptId = user.departmentId;
    return {
      year, deptId, prevYear: year - 1,
      dept: Store.dept(deptId),
      gls: Store.deptGLs(deptId),           // ระดับ GL (roll-up) — ใช้กับ dashboard/เปรียบเทียบ
      rows: Store.deptRows(deptId),         // ระดับแถว CCT×GL — ใช้กับตารางกรอก
      state: Store.deptState(year, deptId),
      comp: Store.completion(year, deptId),
      editable: Store.canEdit(user, year, deptId),
      revise: Store.revisePhase(year),      // {on, thru} — รอบ Revise + เดือนที่มีเกิดจริง
    };
  }

  /* ============ Dashboard ============ */
  function dashboard(user) {
    const c = ctx(user);
    const cur = Store.deptTotal(c.year, c.deptId), prev = Store.deptTotal(c.prevYear, c.deptId);
    const cmp = Store.compare(cur, prev);
    const anomalies = Store.deptAnomalies(c.year, c.deptId);
    const v = Store.validate(c.year, c.deptId);

    const kpis = `<div class="kpi-grid">
      ${kpi(`งบประมาณปี ${c.year}`, fmt(cur) + ' <small>กีบ</small>', 'ยอดรวมที่กรอกแล้ว')}
      ${kpi(`งบประมาณปี ${c.prevYear} (ปีก่อน)`, fmt(prev) + ' <small>กีบ</small>', 'baseline เปรียบเทียบ')}
      ${kpi('เพิ่ม / ลด เทียบปีก่อน', deltaBadge(cmp.diff, cmp.pct), (cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff) + ' กีบ')}
      ${gaugeKpi('ความครบถ้วน', c.comp.pct, `${c.comp.filled}/${c.comp.total} ช่อง · เป้าหมาย 100%`)}
      ${kpi('จำนวน GL', c.gls.length, 'ที่ได้รับมอบหมาย')}
    </div>`;

    const todo = [];
    if (c.state.status === 'NEED_REVISION') todo.push(`<li class="todo-crit">⚠ แผนกบัญชีส่งกลับให้แก้ไข${c.state.revisionNote ? ': ' + esc(c.state.revisionNote) : ''}</li>`);
    if (v.errors.length) todo.push(`<li>ยังกรอกไม่ครบ ${v.errors.length} รายการ — <a href="#/review">ดูรายละเอียด</a></li>`);
    anomalies.forEach(a => {
      if (!Store.note(c.year, c.deptId, a.gl.id).reason.trim())
        todo.push(`<li>GL ${a.gl.code} มีการเปลี่ยนแปลงผิดปกติ (${a.tag}) — ควรระบุสาเหตุเพิ่ม/ลด</li>`);
    });
    if (!todo.length && v.ok && !['SUBMITTED', 'LOCKED'].includes(c.state.status))
      todo.push('<li>ข้อมูลครบถ้วนแล้ว — พร้อม <a href="#/review">ตรวจสอบและส่งข้อมูล</a></li>');
    if (['SUBMITTED', 'LOCKED'].includes(c.state.status)) todo.push('<li>✓ ส่งข้อมูลเรียบร้อยแล้ว</li>');

    return pageHead(`Dashboard — ${esc(c.dept.name)}`, `งบประมาณปี ${c.year} เทียบปี ${c.prevYear} · ${asOf()}`)
      + kpis
      + `<div class="grid-2">`
      + card(`แนวโน้มรายเดือน ปี ${c.year} เทียบปี ${c.prevYear} (กีบ)`, `<div id="chMonthly"></div>`)
      + card(`GL งบประมาณสูงสุด ปี ${c.year} (กีบ)`, `<div id="chTopGL"></div>`)
      + `</div>`
      + card('สิ่งที่ต้องทำ', todo.length ? `<ul class="todo-list">${todo.join('')}</ul>` : '<p>ไม่มี</p>')
      + card(`เปรียบเทียบราย GL — ปี ${c.year} เทียบปี ${c.prevYear}`, compareTable(c));
  }
  function dashboardBind(user) {
    const c = ctx(user);
    Charts.line(document.getElementById('chMonthly'), Store.MONTH_S, [
      { name: `ปี ${c.prevYear}`, color: Charts.PREV_C, values: Store.deptMonthly(c.prevYear, c.deptId) },
      { name: `ปี ${c.year}`,     color: Charts.CUR_C,  values: Store.deptMonthly(c.year, c.deptId) },
    ]);
    const top = c.gls.map(g => ({ g, v: Store.glTotal(c.year, c.deptId, g.id) }))
      .filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 6);
    Charts.hbar(document.getElementById('chTopGL'),
      top.map(x => ({ label: `${x.g.code} ${x.g.name}`, value: x.v, color: Charts.CUR_C })));
    bindZeroToggle();
  }

  const HIDE_ZERO_KEY = 'abp_hide_zero_gl';
  function compareTable(c) {
    let zeroCount = 0;
    const rows = c.gls.map(g => {
      const cur = Store.glTotal(c.year, c.deptId, g.id), prev = Store.glTotal(c.prevYear, c.deptId, g.id);
      const cmp = Store.compare(cur, prev);
      const an = Store.glAnomaly(cmp);
      const isZero = cur === 0 && prev === 0;
      if (isZero) zeroCount++;
      return `<tr class="${isZero ? 'row-zero' : ''}">
        <td><span class="gl-code">${g.code}</span> ${esc(g.name)}</td>
        <td class="num">${fmt(prev)}</td><td class="num">${fmt(cur)}</td>
        <td class="num ${cmp.diff > 0 ? 'txt-up' : cmp.diff < 0 ? 'txt-down' : ''}">${(cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff)}</td>
        <td>${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td>${an ? `<span class="anomaly ${an.level}">⚠ ${an.tag}</span>` : ''}</td></tr>`;
    }).join('');
    const hide = localStorage.getItem(HIDE_ZERO_KEY) === '1';
    return `<div class="cmp-wrap ${hide && zeroCount ? 'hide-zero' : ''}">
      ${zeroCount ? `<div class="cmp-toolbar"><button class="ghost-btn small" data-zerotoggle>
        ${hide ? `👁 แสดงทั้งหมด (ซ่อนอยู่ ${zeroCount} GL)` : `🙈 ซ่อน GL ที่ไม่มีงบ (${zeroCount})`}</button></div>` : ''}
      <div class="table-scroll"><table class="data-table">
      <thead><tr><th>GL</th><th class="num">ปี ${c.prevYear} (กีบ)</th><th class="num">ปี ${c.year} (กีบ)</th>
      <th class="num">ผลต่าง (กีบ)</th><th>% เทียบปี ${c.prevYear}</th><th>ตรวจสอบ</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }
  function bindZeroToggle() {
    document.querySelectorAll('[data-zerotoggle]').forEach(btn => btn.addEventListener('click', () => {
      const now = localStorage.getItem(HIDE_ZERO_KEY) === '1';
      localStorage.setItem(HIDE_ZERO_KEY, now ? '0' : '1');
      App.render();
    }));
  }

  /* ============ Budget Input (GL = แถว, เดือน = คอลัมน์) ============ */
  function budget(user) {
    const c = ctx(user);
    const rvOn = c.revise.on, thru = c.revise.thru;
    // โหมด "ดูงบต้นปี" — สลับข้อมูลทั้งตารางเป็นงบต้นปี (ORIGINAL, อ่านอย่างเดียว) + เปลี่ยนธีมสี
    const hasOrig = !!Store.snapByLabel(c.year, 'ORIGINAL');
    const viewOrig = hasOrig && localStorage.getItem('abp_view_orig') === '1';
    const monthsOf = key => viewOrig ? Store.snapRowMonths(c.year, 'ORIGINAL', c.deptId, key) : Store.rowMonths(c.year, c.deptId, key);
    // คอลัมน์เทียบ (ghost) = ปีก่อน (หรืองบเดิมตอน Revise) — คงไว้ตามเดิม
    const baseLabel = rvOn ? `งบเดิม ${c.year}` : `ปี ${c.prevYear}`;
    const basePrev = rvOn ? Store.originalDeptTotal(c.year, c.deptId) : Store.deptTotal(c.prevYear, c.deptId);
    const cur = viewOrig ? Store.snapDeptTotal(c.year, 'ORIGINAL', c.deptId) : Store.deptTotal(c.year, c.deptId);
    const prev = basePrev;
    const cmp = Store.compare(cur, prev);
    const rvKind = c.revise.kind;
    const rvTitle = rvKind === 'LANDING' ? 'รอบปิดยอด (Landing) ปลายปี' : 'รอบ Revise กลางปี';
    const rvIcon = rvKind === 'LANDING' ? '🎯' : '🔁';
    const reviseMsg = rvOn
      ? `<div class="lock-banner revise-banner">${rvIcon} <b>${rvTitle}</b> — เดือน 1–${thru - 1} เป็นตัวเลขเกิดจริง (ล็อกโดยแผนกบัญชี) · เดือน ${thru} เพิ่มได้แต่ลดต่ำกว่าเกิดจริงไม่ได้ · เดือน ${thru + 1}–12 ปรับคาดการณ์ได้ · แถวที่ยอดต่างจากแผน ORIGINAL ต้องระบุเหตุผลก่อนส่ง</div>` : '';
    // เกิดจริงที่บัญชีอัปโหลด (นอกรอบ Revise) — ช่องไฮไลต์ = ล็อก
    const postedMsg = (!rvOn && Store.hasPostedActuals(c.year, c.deptId))
      ? `<div class="lock-banner revise-banner">📥 <b>ตัวเลขเกิดจริงจากแผนกบัญชี</b> — ช่องที่ไฮไลต์คือยอดเกิดจริงที่บัญชีอัปโหลด (ล็อก แก้ไขไม่ได้) · ช่องอื่นยังกรอก/แก้ได้ตามปกติ</div>` : '';
    // ป้ายล็อกแบบกะทัดรัด — ย้ายไปอยู่ในแถบเครื่องมือข้างปุ่ม (แทน banner เต็มความกว้าง)
    const lockChip = !c.editable
      ? `<span class="lock-chip">🔒 ${['SUBMITTED'].includes(c.state.status) ? 'ส่งแล้ว — แก้ได้เมื่อถูกตีกลับ' : 'รอบงบถูก Lock — อ่านอย่างเดียว'}</span>` : '';

    const head = `<tr>
      <th class="sticky-col th-gl">GL / บัญชี</th>
      ${Store.MONTH_S.map((m, i) => `<th class="num th-m">${m}<div class="th-yr">${rvOn && i < thru ? (i < thru - 1 ? '🔒 เกิดจริง' : '⚠ พื้นจริง') : c.year}</div></th>`).join('')}
      <th class="num th-total">${rvOn ? 'รวม Revise' : 'รวมปี'} ${c.year}</th>
      <th class="num th-prev">${baseLabel}</th>
      <th class="th-delta">%Δ</th>
      <th class="num th-mtp">ปี ${c.year + 1}<div class="th-yr">MTP</div></th>
      <th class="num th-mtp">ปี ${c.year + 2}<div class="th-yr">MTP</div></th>
      <th class="th-note">เหตุผล/สมมติฐาน</th>
      ${Store.SCEN_DEF.map(s => s.offs.map(o => `<th class="num th-sc sc-${s.key}">ปี ${c.year + o}<div class="th-yr">${s.label}</div></th>`).join('')).join('')}</tr>`;
    const scCols = Store.SCEN_DEF.reduce((n, s) => n + s.offs.length, 0);   // = 8 ช่องสมมติฐาน

    // การปรับงบจากคำร้องที่อนุมัติแล้ว (ติดหมายเหตุ 🔄 ราย GL/ช่องเดือน)
    const adjMap = Store.reqAdjustmentsFor(c.year, c.deptId);
    // แถว = CCT × GL ตามฟอร์มจริง (GL ที่มีหลายหน่วยงานย่อยจะแตกเป็นหลายแถว)
    const body = c.rows.map(r => {
      const g = r.gl;
      const adj = adjMap[r.key];   // การปรับจากคำร้อง (ถ้ามี)
      const m = monthsOf(r.key);
      const t = Store.mtp(c.year, c.deptId, r.key);
      const notUsed = Store.glNotUsed(c.year, c.deptId, r.key);
      const prevT = rvOn ? Store.originalRowTotal(c.year, c.deptId, r.key) : Store.rowTotal(c.prevYear, c.deptId, r.key);
      const curT = m.reduce((s, v) => s + (v ?? 0), 0);
      const gcmp = Store.compare(curT, prevT);
      const an = Store.glAnomaly(gcmp);
      const n = Store.note(c.year, c.deptId, r.key);
      const hasNote = n.reason.trim() || n.assumption.trim();
      const dis = (viewOrig || !c.editable || notUsed) ? 'disabled' : '';
      const pm = rvOn ? Store.originalMonths(c.year, c.deptId, r.key) : Store.rowMonths(c.prevYear, c.deptId, r.key);
      const am = Store.actualMonths(c.year, c.deptId, r.key);   // เกิดจริง (บัญชีอัปโหลด) — ใช้ทุกโหมด
      const rowTip = `CCT ${r.cct} ${esc(r.cctName)} · IO ${r.io || '—'}`;
      const cells = m.map((v, i) => {
        const hasDetail = !!Store.cellDetail(c.year, c.deptId, r.key, i);
        const posted = am[i] !== null && am[i] !== undefined;   // ช่องที่บัญชีโพสต์เกิดจริง
        const isFloor = rvOn && i === thru - 1;
        const isActual = rvOn && i < thru - 1;
        const lockPosted = posted && !isFloor;                 // ล็อก (ยกเว้นเดือนพื้นรอบ Revise ที่ยังเพิ่มได้)
        const cellCls = (isActual || lockPosted) ? ' cell-actual' : (isFloor ? ' cell-floor' : '');
        const cellTip = (isActual || lockPosted) ? 'ตัวเลขเกิดจริง — ล็อกโดยแผนกบัญชี'
          : (isFloor ? `เกิดจริงแล้ว ${fmt(am?.[i] ?? 0)} กีบ — เพิ่มได้ ลดต่ำกว่านี้ไม่ได้` : '');
        const cAdj = adj && adj.monthNet[i] != null;
        const cAdjTip = cAdj ? esc(`ปรับจากคำร้อง (สุทธิ ${adj.monthNet[i] > 0 ? '+' : ''}${fmt(Math.round(adj.monthNet[i]))} กีบ):\n` + adj.monthLines[i].join('\n')) : '';
        return `<td class="num cell-td${cAdj ? ' cell-adj' : ''}"><div class="cell-wrap">
          <input class="cell${cellCls}" data-row="${r.key}" data-m="${i}" inputmode="decimal"
            value="${v === null ? '' : fmt(v)}" placeholder="กรอก" ${dis || isActual || lockPosted ? 'disabled' : ''} ${cellTip ? `title="${cellTip}"` : ''}>
          ${viewOrig ? '' : `<button class="cell-detail-btn ${hasDetail ? 'has' : ''}" data-dt="${r.key}|${i}" tabindex="-1"
            title="${hasDetail ? 'มีรายละเอียดค่าใช้จ่าย — คลิกเพื่อดู/แก้ไข' : 'เพิ่มรายละเอียดค่าใช้จ่าย (หลายรายการ)'}">🧾</button>`}
          ${cAdj ? `<span class="cell-adj-dot" title="${cAdjTip}">🔄</span>` : ''}
        </div><span class="prev-ghost" title="${rvOn ? 'งบเดิม' : 'ปีก่อน'} ${Store.MONTH_S[i]}">${fmt(pm[i] ?? 0)}</span></td>`;
      }).join('');
      return `<tr data-gl-row="${r.key}" class="${notUsed ? 'tr-notused' : ''}">
        <td class="sticky-col td-gl" title="${rowTip}"><div class="gl-name-wrap">
            ${glIcon(g)}
            <span class="gl-code">${g.code}</span><span class="gl-nm" title="${esc(g.name)}">${esc(g.name)}</span>
            ${notUsed ? '<span class="nu-chip">ไม่ได้ใช้</span>' : ''}
            ${adj ? `<span class="adj-ic" title="${esc(`ปรับจากคำร้อง (สุทธิ ${adj.net > 0 ? '+' : ''}${fmt(Math.round(adj.net))} กีบ):\n` + adj.lines.join('\n'))}">🔄</span>` : ''}
            ${an && !notUsed ? `<span class="anomaly-ic ${an.level}" title="${an.tag}: ${an.msg}">⚠</span>` : ''}</div>
            ${r.multiCct ? `<div class="cct-tag">↳ ${esc(r.cctName)}</div>` : ''}</td>
        ${cells}
        <td class="num td-total" data-total="${r.key}">${fmt(curT)}</td>
        <td class="num td-prev">${fmt(prevT)}</td>
        <td class="td-delta" data-delta="${r.key}">${deltaBadge(gcmp.diff, gcmp.pct)}</td>
        <td class="num cell-td"><input class="cell cell-mtp" data-row="${r.key}" data-mtp="1" inputmode="decimal" placeholder="กรอก" value="${t.mtp1 === null ? '' : fmt(t.mtp1)}" ${dis}></td>
        <td class="num cell-td"><input class="cell cell-mtp" data-row="${r.key}" data-mtp="2" inputmode="decimal" placeholder="กรอก" value="${t.mtp2 === null ? '' : fmt(t.mtp2)}" ${dis}></td>
        <td class="td-note">
          <button class="nu-btn ${notUsed ? 'active' : ''}" data-nu="${r.key}" ${c.editable ? '' : 'disabled'}
            title="${notUsed ? 'กลับมากรอกแถวนี้' : 'ไม่ได้ใช้แถวนี้ (ตั้งเป็น 0 ทั้งแถว)'}">${notUsed ? '↩' : '🚫'}</button>
          <button class="note-btn ${hasNote ? 'has-note' : ''}" data-note="${r.key}">${hasNote ? '📝 มีข้อมูล' : '＋ เพิ่ม'}</button></td>
        ${Store.SCEN_DEF.map(s => s.offs.map(o => {
          const sv = Store.scenarioVal(c.year, c.deptId, r.key, s.key, o);
          return `<td class="num cell-td sc-cell sc-${s.key}"><input class="cell cell-sc" data-row="${r.key}" data-sc="${s.key}" data-off="${o}" inputmode="decimal" placeholder="กรอก" value="${sv === null ? '' : fmt(sv)}" ${dis}></td>`;
        }).join('')).join('')}
      </tr>`;
    }).join('');

    const foot = (() => {
      const mm = viewOrig ? Store.snapDeptMonthly(c.year, 'ORIGINAL', c.deptId) : Store.deptMonthly(c.year, c.deptId);
      const pm = rvOn ? Store.originalDeptMonthly(c.year, c.deptId) : Store.deptMonthly(c.prevYear, c.deptId);
      return `<tr class="tr-sum"><td class="sticky-col td-gl"><b>รวมทั้งหน่วยงาน</b></td>
        ${mm.map(v => `<td class="num" data-msum>${fmt(v)}</td>`).join('')}
        <td class="num td-total" data-gsum><b>${fmt(cur)}</b></td>
        <td class="num td-prev">${fmt(prev)}</td>
        <td class="td-delta">${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td></td><td></td><td></td>${'<td></td>'.repeat(scCols)}</tr>
        <tr class="tr-pct"><td class="sticky-col td-gl muted">เทียบกับ${rvOn ? 'งบเดิม' : 'ปีก่อน'} (รายเดือน)</td>
        ${mm.map((v, i) => { const cp = Store.compare(v, pm[i]); return `<td class="num" data-mpct="${i}">${deltaBadge(cp.diff, cp.pct)}</td>`; }).join('')}
        <td class="num" data-gpct>${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td></td><td></td><td></td><td></td><td></td>${'<td></td>'.repeat(scCols)}</tr>`;
    })();

    return pageHead(`กรอกงบประมาณปี ${c.year} 👋`, `${esc(c.dept.name)} · GL เป็นแถว เดือนเป็นคอลัมน์ · หน่วย: กีบ (LAK) · บันทึกอัตโนมัติ`,
        `<span id="autosaveInd" class="autosave-ind" title="กรอกแล้วบันทึกให้เองอัตโนมัติ ทุกช่อง — ออกจากเว็บแล้วกลับมากรอกต่อได้ ข้อมูลไม่หาย">💾 บันทึกอัตโนมัติ</span>
         <button id="ioViewBtn" class="ghost-btn">🔎 IO / CCT</button>
         <button id="calcuOpenBtn" class="ghost-btn btn-purple"><span class="btn-svg">${calcIcon(17)}</span> เครื่องคิดเลข</button>
         <button id="calcOpenBtn" class="ghost-btn btn-teal">🧮 เครื่องมือคำนวณ</button>
         <button id="exportMyXlsx" class="ghost-btn btn-green btn-push-right" title="ดาวน์โหลด Excel (ML Form) เฉพาะหน่วยงานของคุณ">⬇ Excel ของฉัน</button>`)
      + `<div class="kpi-grid kpi-grid-4">
          ${kpiC('💵', '#e6f0fb', 'kpi-tint-blue', (rvOn ? 'ยอด Revise ปี ' : 'ยอดรวมปี ') + c.year, `<span data-kpi-total>${fmt(cur)}</span> <small>กีบ</small>`, rvOn ? `เกิดจริง 1-${thru} + คาดการณ์ ${thru + 1}-12` : 'คำนวณอัตโนมัติ real-time')}
          ${kpiC(rvOn ? '🧊' : '📅', '#e6f7f0', 'kpi-tint-teal', baseLabel, fmt(prev) + ' <small>กีบ</small>', rvOn ? 'งบที่อนุมัติตอนต้นปี (freeze)' : 'baseline เปรียบเทียบ')}
          ${kpiC(cmp.diff >= 0 ? '📈' : '📉', cmp.diff >= 0 ? '#fdecec' : '#eaf6ea', 'kpi-tint-green', rvOn ? 'เพิ่ม/ลดระหว่างปี' : 'เพิ่ม/ลด', `<span data-kpi-delta>${deltaBadge(cmp.diff, cmp.pct)}</span>`, 'เทียบ' + baseLabel)}
          ${gaugeKpi('ความครบถ้วน', c.comp.pct, 'เป้าหมาย 100% ก่อน Submit', 'data-kpi-comp')}
        </div>`
      + reviseMsg + postedMsg
      + card('', `<div class="grid-toolbar">
          ${lockChip}
          <span class="grid-tools">
            ${hasOrig ? `<button id="viewOrigBtn" class="ghost-btn small ${viewOrig ? 'vo-on' : ''}" title="สลับตารางทั้งหมดเป็นงบที่ตั้งไว้ต้นปี (อนุมัติ) — ดูอย่างเดียว · กดอีกครั้งกลับงบปัจจุบัน">${viewOrig ? '🔙 กลับงบปัจจุบัน' : '📌 ดูงบต้นปี'}</button>` : ''}
            <button id="prevToggleBtn" class="ghost-btn small" title="แสดง/ซ่อนตัวเลขปีก่อนใต้ทุกช่อง (เทียบเดือนต่อเดือน)">🔀 ปีก่อน</button>
            <button id="gridFsBtn" class="ghost-btn small btn-fs" title="ขยายตารางเกือบเต็มจอ (Esc เพื่อย่อกลับ)">⛶</button>
            <a class="ghost-btn small btn-review" href="#/review">✓ ตรวจสอบงบ</a>
          </span></div>
        ${viewOrig ? '<div class="vo-banner">📌 กำลังดูงบต้นปี (อนุมัติ) — อ่านอย่างเดียว · กด "🔙 กลับงบปัจจุบัน" เพื่อแก้ไข</div>' : ''}
        <div class="table-scroll budget-scroll"><table class="budget-table"><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>`, { cls: 'card-flush budget-card' + (rvOn ? ' revise-mode' : '') + (viewOrig ? ' view-orig' : '') });
  }

  function budgetBind(user) {
    const c = ctx(user);
    const parseNum = s => {
      s = String(s).replace(/[,\s฿₭]/g, '').trim();
      if (s === '') return null;
      const v = Number(s);
      return isFinite(v) ? v : NaN;
    };

    const rvOn = c.revise.on;
    // baseline ตอนแก้ไข: รอบปกติ = ปีก่อน · รอบ Revise = งบเดิม (snapshot)
    const baseRowTotal = key => rvOn ? Store.originalRowTotal(c.year, c.deptId, key) : Store.rowTotal(c.prevYear, c.deptId, key);
    const baseDeptMonthly = () => rvOn ? Store.originalDeptMonthly(c.year, c.deptId) : Store.deptMonthly(c.prevYear, c.deptId);
    const baseDeptTotal = () => rvOn ? Store.originalDeptTotal(c.year, c.deptId) : Store.deptTotal(c.prevYear, c.deptId);
    function refreshRow(key) {
      const m = Store.rowMonths(c.year, c.deptId, key);
      const t = m.reduce((s, v) => s + (v ?? 0), 0);
      const prevT = baseRowTotal(key);
      const cmp = Store.compare(t, prevT);
      document.querySelector(`[data-total="${key}"]`).textContent = fmt(t);
      document.querySelector(`[data-delta="${key}"]`).innerHTML = deltaBadge(cmp.diff, cmp.pct);
      // footer + KPI + แถวเทียบ baseline
      const mm = Store.deptMonthly(c.year, c.deptId);
      const pm = baseDeptMonthly();
      document.querySelectorAll('[data-msum]').forEach((td, i) => { td.textContent = fmt(mm[i]); });
      document.querySelectorAll('[data-mpct]').forEach(td => {
        const i = Number(td.dataset.mpct);
        const cp = Store.compare(mm[i], pm[i]);
        td.innerHTML = deltaBadge(cp.diff, cp.pct);
      });
      const cur = Store.deptTotal(c.year, c.deptId), prev = baseDeptTotal();
      const dcmp = Store.compare(cur, prev);
      document.querySelector('[data-gsum] b').textContent = fmt(cur);
      const gp = document.querySelector('[data-gpct]');
      if (gp) gp.innerHTML = deltaBadge(dcmp.diff, dcmp.pct);
      document.querySelector('[data-kpi-total]').textContent = fmt(cur);
      document.querySelector('[data-kpi-delta]').innerHTML = deltaBadge(dcmp.diff, dcmp.pct);
      document.querySelector('[data-kpi-comp]').innerHTML = Charts.gauge(Store.completion(c.year, c.deptId).pct);
    }

    function commit(input) {
      const key = input.dataset.row;
      const v = parseNum(input.value);
      if (Number.isNaN(v)) { toast('รูปแบบตัวเลขไม่ถูกต้อง', 'err'); input.classList.add('cell-err'); return; }
      input.classList.remove('cell-err');
      try {
        let changed;
        if (input.dataset.sc) changed = Store.setScenario(user, c.year, c.deptId, key, input.dataset.sc, Number(input.dataset.off), v);
        else if (input.dataset.mtp) changed = Store.setMtp(user, c.year, c.deptId, key, Number(input.dataset.mtp), v);
        else changed = Store.setCell(user, c.year, c.deptId, key, Number(input.dataset.m), v);
        if (changed) { input.classList.add('cell-changed'); markSaved(); }
        input.value = v === null ? '' : fmt(v);
        if (v !== null && v < 0) { input.classList.add('cell-err'); toast('ไม่ควรมีตัวเลขติดลบในงบประมาณ', 'err'); }
        refreshRow(key);
      } catch (e) { toast(e.message, 'err'); input.value = ''; }
    }
    // ตัวบ่งชี้ "บันทึกอัตโนมัติแล้ว" (ทุกช่อง save ทันทีที่ออกจากช่อง → localStorage + Supabase)
    let _saveTimer;
    function markSaved() {
      const ind = document.getElementById('autosaveInd'); if (!ind) return;
      ind.classList.add('saved');
      ind.textContent = '✓ บันทึกแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => { ind.classList.remove('saved'); ind.textContent = '💾 บันทึกอัตโนมัติ'; }, 2500);
    }
    // safety-net: ปิดแท็บ/สลับหน้าต่างขณะยังพิมพ์ค้างในช่อง → commit ช่องนั้นก่อน (blur = save ลง localStorage ทันที)
    if (!window.__abpAutosaveHook) {
      window.__abpAutosaveHook = true;
      const flush = () => { const el = document.activeElement; if (el && el.classList && el.classList.contains('cell')) el.blur(); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
      window.addEventListener('pagehide', flush);
    }

    // ตัวเลขหลักพันล้านขึ้นไปยาวเกินช่อง → ย่อฟอนต์อัตโนมัติ (คงอ่านครบทุกหลัก)
    const fitCell = inp => {
      const n = (inp.value || '').length;
      inp.classList.toggle('cell-long', n > 11 && n <= 14);
      inp.classList.toggle('cell-xlong', n > 14);
    };
    const cells = Array.from(document.querySelectorAll('.cell'));
    cells.forEach(inp => {
      fitCell(inp);
      inp.addEventListener('input', () => fitCell(inp));
      inp.addEventListener('focus', () => { inp.value = inp.value.replace(/,/g, ''); inp.select(); });
      inp.addEventListener('blur', () => { commit(inp); fitCell(inp); });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); moveFocus(inp, 0, 1); }
      });
      inp.addEventListener('paste', e => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // ค่าเดียว ให้ paste ปกติ
        e.preventDefault();
        const rows = text.replace(/\r/g, '').split('\n').filter(r => r.length);
        const startKey = inp.dataset.row, startM = Number(inp.dataset.m ?? -1);
        if (startM < 0) return;
        const rowOrder = c.rows.map(r => r.key);
        let gi = rowOrder.indexOf(startKey);
        rows.forEach((rowText, ri) => {
          const vals = rowText.split('\t');
          const key = rowOrder[gi + ri];
          if (!key) return;
          vals.forEach((val, ci) => {
            const mi = startM + ci;
            if (mi > 11) return;
            const target = document.querySelector(`.cell[data-row="${key}"][data-m="${mi}"]`);
            if (target && !target.disabled) { target.value = val; commit(target); }
          });
        });
        toast('วางข้อมูลจาก Excel แล้ว');
      });
    });
    function moveFocus(inp, dCol, dRow) {
      if (inp.dataset.m === undefined) return;
      const rowOrder = c.rows.map(r => r.key);
      const gi = rowOrder.indexOf(inp.dataset.row) + dRow;
      const mi = Number(inp.dataset.m) + dCol;
      const next = document.querySelector(`.cell[data-row="${rowOrder[gi]}"][data-m="${mi}"]`);
      next?.focus();
    }

    /* --- ปุ่ม "ดูงบต้นปี" (toggle) — สลับตารางทั้งหมดเป็นงบต้นปี (อ่านอย่างเดียว) --- */
    document.getElementById('viewOrigBtn')?.addEventListener('click', () => {
      const on = localStorage.getItem('abp_view_orig') !== '1';
      localStorage.setItem('abp_view_orig', on ? '1' : '0');
      App.render();
    });
    const bCard = document.querySelector('.budget-card');

    /* --- เทียบปีก่อนเดือนต่อเดือน: ghost ทุกช่อง (toggle) --- */
    const SHOW_PREV_KEY = 'abp_show_prev';
    const pBtn = document.getElementById('prevToggleBtn');
    const applyPrevMode = on => {
      bCard.classList.toggle('show-prev', on);
      pBtn?.classList.toggle('btn-purple', on);
      if (pBtn) pBtn.textContent = on ? '🔀 ปีก่อน: เปิด' : '🔀 ปีก่อน';
    };
    applyPrevMode(localStorage.getItem(SHOW_PREV_KEY) === '1');
    pBtn?.addEventListener('click', () => {
      const on = !(localStorage.getItem(SHOW_PREV_KEY) === '1');
      localStorage.setItem(SHOW_PREV_KEY, on ? '1' : '0');
      applyPrevMode(on);
    });

    // ป้ายลอยเหนือช่องที่กำลังกรอก (เฉพาะตอนโหมด ghost ปิด)
    let chip = document.getElementById('prevChip');
    if (!chip) { chip = document.createElement('div'); chip.id = 'prevChip'; chip.className = 'prev-chip'; document.body.appendChild(chip); }
    const hideChip = () => { chip.style.display = 'none'; };
    const tableEl = document.querySelector('.budget-table');
    tableEl?.addEventListener('focusin', e => {
      const inp = e.target;
      if (!inp.classList?.contains('cell') || inp.dataset.m === undefined) return;
      if (bCard.classList.contains('show-prev')) return; // มี ghost อยู่แล้ว ไม่ต้องซ้ำ
      const mi = Number(inp.dataset.m);
      const pv = (rvOn ? Store.originalMonths(c.year, c.deptId, inp.dataset.row) : Store.rowMonths(c.prevYear, c.deptId, inp.dataset.row))[mi] ?? 0;
      chip.textContent = rvOn
        ? `งบเดิม ${Store.MONTH_S[mi]}: ${fmt(pv)} กีบ`
        : `ปีก่อน ${Store.MONTH_S[mi]} ${c.prevYear}: ${fmt(pv)} กีบ`;
      chip.style.display = 'block';
      const r2 = inp.getBoundingClientRect();
      chip.style.left = Math.max(8, Math.min(r2.left, innerWidth - chip.offsetWidth - 8)) + 'px';
      chip.style.top = (r2.top > 60 ? r2.top - chip.offsetHeight - 7 : r2.bottom + 7) + 'px';
    });
    tableEl?.addEventListener('focusout', hideChip);
    document.querySelector('.budget-scroll')?.addEventListener('scroll', hideChip);

    /* --- ขยายตารางเกือบเต็มจอ / ย่อกลับ (ปุ่มเดียว มุมขวาของแถบเหนือตาราง) --- */
    const fsCard = document.querySelector('.budget-card');
    const fsBtn = document.getElementById('gridFsBtn');
    const setFs = on => {
      fsCard.classList.toggle('fullscreen', on);
      document.body.classList.toggle('no-scroll', on);
      fsBtn.textContent = on ? '✕' : '⛶';
      fsBtn.title = on ? 'ย่อกลับ (Esc)' : 'ขยายตารางเกือบเต็มจอ (Esc เพื่อย่อกลับ)';
    };
    const fsToggle = () => setFs(!fsCard.classList.contains('fullscreen'));
    fsBtn?.addEventListener('click', fsToggle);
    // ESC = ย่อกลับ + ล้าง no-scroll (กันสถานะค้างเมื่อออกจากหน้า)
    const fsEsc = e => {
      if (e.key === 'Escape' && fsCard.classList.contains('fullscreen')) setFs(false);
      if (!document.body.contains(fsCard)) { document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', fsEsc); }
    };
    document.addEventListener('keydown', fsEsc);

    /* --- ล้างข้อมูลทั้งปี --- */
    document.getElementById('gridClearBtn')?.addEventListener('click', () => {
      UI.confirm2(`ล้างข้อมูลงบประมาณปี ${c.year} ทั้งหมด?`,
        `ตัวเลขทุกเดือน, MTP, เหตุผล/สมมติฐาน และรายละเอียดค่าใช้จ่ายของ ${esc(c.dept.name)} จะถูกล้างเป็นฟอร์มเปล่า`,
        'การกระทำนี้ย้อนกลับไม่ได้ (ข้อมูลปีอื่นไม่ถูกแตะ)',
        () => {
          try { Store.clearDeptYear(user, c.year, c.deptId); toast('ล้างข้อมูลปี ' + c.year + ' แล้ว — เริ่มกรอกใหม่ได้เลย'); App.render(); }
          catch (e) { toast(e.message, 'err'); }
        });
    });
    document.addEventListener('keydown', function escFs(e) {
      if (e.key === 'Escape' && fsCard?.classList.contains('fullscreen')) setFs(false);
      if (!document.body.contains(fsCard)) document.removeEventListener('keydown', escFs);
    });

    /* --- ป๊อปอัพรายละเอียดค่าใช้จ่ายรายช่อง --- */
    function openCellDetail(key, mi) {
      const rowInfo = c.rows.find(r => r.key === key);
      const g = rowInfo?.gl || Store.gl(Store.splitKey(key)[0]);
      const notUsed = Store.glNotUsed(c.year, c.deptId, key);
      const editable = c.editable && !notUsed;
      const saved = Store.cellDetail(c.year, c.deptId, key, mi);
      let rows = saved ? saved.items.map(it => ({ ...it })) : [{ desc: '', amount: null }];
      if (!rows.length) rows = [{ desc: '', amount: null }];

      const parseNum2 = s => { s = String(s).replace(/[,\s]/g, '').trim(); if (s === '') return null; const v = Number(s); return isFinite(v) ? v : NaN; };
      const rowHtml = (it, ri) => `<div class="dt-row" data-ri="${ri}">
          <input class="dt-amt" inputmode="decimal" placeholder="จำนวนเงิน (กีบ)" value="${it.amount === null || it.amount === undefined ? '' : fmt(it.amount)}" ${editable ? '' : 'disabled'}>
          <input class="dt-desc" placeholder="ค่าใช้จ่ายอะไร เช่น ค่าตรวจ Audit ครั้งที่ 1" value="${esc(it.desc || '')}" ${editable ? '' : 'disabled'}>
          ${editable ? `<button class="dt-del" title="ลบรายการนี้">−</button>` : ''}
        </div>`;

      const buttons = editable ? [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: 'ล้างข้อมูล', cls: 'ghost-btn', onClick: () => {
            const list = document.getElementById('dtRows');
            list.innerHTML = rowHtml({ desc: '', amount: null }, 0);
            wireRows(); recalc();
            toast('ล้างรายการในฟอร์มแล้ว — กด "ยืนยัน" เพื่อบันทึก');
          } },
        { label: '✓ ยืนยัน', cls: 'primary-btn', onClick: close => {
            const items = collect();
            if (items.some(it => Number.isNaN(it.amount))) { toast('มีจำนวนเงินที่ไม่ใช่ตัวเลข', 'err'); return; }
            const valid = items.filter(it => typeof it.amount === 'number');
            try {
              const r = Store.setCellDetail(user, c.year, c.deptId, key, mi, valid);
              if (r.cleared) toast('ลบรายละเอียดแล้ว (ตัวเลขในช่องคงเดิม)');
              else toast(`บันทึก ${r.count} รายการ รวม ${fmt(r.sum)} กีบ ลงช่อง ${Store.MONTH_S[mi]} แล้ว`);
              // อัปเดตช่องหลัก + ยอดรวมแบบไม่ re-render ทั้งหน้า
              const inp = document.querySelector(`.cell[data-row="${key}"][data-m="${mi}"]`);
              if (inp && !r.cleared) { inp.value = fmt(r.sum); inp.classList.add('cell-changed'); }
              const btn = document.querySelector(`[data-dt="${key}|${mi}"]`);
              if (btn) btn.classList.toggle('has', !r.cleared);
              refreshRow(key);
              close();
            } catch (e) { toast(e.message, 'err'); }
          } },
      ] : [{ label: 'ปิด', cls: 'ghost-btn' }];

      const back = UI.modal(`🧾 รายละเอียดค่าใช้จ่าย`, `
        <div class="dt-head"><span class="gl-code">${g.code}</span> ${esc(g.name)}
          <span class="dt-month">เดือน ${Store.MONTH_TH[mi]} ${c.year}</span></div>
        ${rowInfo ? `<div class="muted small" style="margin:-6px 0 10px">🏷 ${esc(rowInfo.cctName)} (CCT ${rowInfo.cct}) · IO ${rowInfo.io || '—'}</div>` : ''}
        ${editable ? '' : '<div class="lock-banner" style="margin:0 0 10px">🔒 อ่านอย่างเดียว — ' + (notUsed ? 'GL นี้ทำเครื่องหมายไม่ได้ใช้' : 'ส่งข้อมูล/ปิดรอบแล้ว') + '</div>'}
        <div id="dtRows">${rows.map(rowHtml).join('')}</div>
        ${editable ? '<button class="ghost-btn" id="dtAdd" style="width:100%">＋ เพิ่มรายการ</button>' : ''}
        <div class="dt-total">รวม <b id="dtTotal">0</b> กีบ</div>
        ${saved ? `<div class="muted small">บันทึกล่าสุด ${UI.fmtDT(saved.updatedAt)} โดย ${esc(saved.updatedBy)}</div>` : ''}`,
        buttons);
      back.querySelector('.modal').classList.add('modal-detail');

      const collect = () => Array.from(document.querySelectorAll('#dtRows .dt-row')).map(row => ({
        amount: parseNum2(row.querySelector('.dt-amt').value),
        desc: row.querySelector('.dt-desc').value.trim(),
      })).filter(it => it.amount !== null || it.desc !== '');
      const recalc = () => {
        const sum = collect().reduce((s, it) => s + (typeof it.amount === 'number' && !Number.isNaN(it.amount) ? it.amount : 0), 0);
        const el = document.getElementById('dtTotal');
        if (el) el.textContent = fmt(sum);
      };
      function wireRows() {
        document.querySelectorAll('#dtRows .dt-amt').forEach(inp => {
          inp.oninput = recalc;
          inp.onblur = () => { const v = parseNum2(inp.value); if (v !== null && !Number.isNaN(v)) inp.value = fmt(v); recalc(); };
          inp.onfocus = () => { inp.value = inp.value.replace(/,/g, ''); };
        });
        document.querySelectorAll('#dtRows .dt-del').forEach(b => b.onclick = () => {
          const list = document.getElementById('dtRows');
          if (list.children.length <= 1) { list.querySelector('.dt-amt').value = ''; list.querySelector('.dt-desc').value = ''; }
          else b.closest('.dt-row').remove();
          recalc();
        });
      }
      wireRows(); recalc();
      document.getElementById('dtAdd')?.addEventListener('click', () => {
        const list = document.getElementById('dtRows');
        list.insertAdjacentHTML('beforeend', rowHtml({ desc: '', amount: null }, list.children.length));
        wireRows();
        list.lastElementChild.querySelector('.dt-amt').focus();
      });
    }
    document.querySelectorAll('[data-dt]').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault();
      const s = btn.dataset.dt, p = s.lastIndexOf('|');
      openCellDetail(s.slice(0, p), Number(s.slice(p + 1)));
    }));

    document.querySelectorAll('[data-nu]').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.dataset.nu;
      const g = Store.gl(Store.splitKey(key)[0]);
      const now = Store.glNotUsed(c.year, c.deptId, key);
      try {
        Store.setGlNotUsed(user, c.year, c.deptId, key, !now);
        toast(!now ? `ทำเครื่องหมาย "ไม่ได้ใช้" GL ${g.code} แล้ว (ตั้งเป็น 0 ทั้งแถว)` : `GL ${g.code} กลับมากรอกได้แล้ว`);
        App.render();
      } catch (e) { toast(e.message, 'err'); }
    }));

    document.getElementById('exportMyXlsx')?.addEventListener('click', () => {
      UI.toast('กำลังสร้างไฟล์ Excel…');
      PagesAcc.exportForUser(user, 'xlsx').catch(e => UI.toast(e.message, 'err'));
    });
    document.getElementById('calcOpenBtn')?.addEventListener('click', () => {
      const back = UI.modal(`<span class="mt-ic mt-rainbow">🧮</span><span class="mt-tx">เครื่องมือคำนวณ<small>Financial Tools &amp; Calculators</small></span>`,
        calcCards(user), [{ label: 'ปิด', cls: 'ghost-btn' }]);
      back.querySelector('.modal').classList.add('modal-wide');
      calculatorsBind(user);
    });
    document.getElementById('ioViewBtn')?.addEventListener('click', () => {
      const d = Store.dept(user.departmentId);
      const rows = Store.deptRows(user.departmentId);
      const html = `
        <input id="ioSearch" class="io-search" placeholder="🔍 ค้นหา GL / CCT / IO / ชื่อบัญชี / หน่วยงานย่อย…">
        <div class="table-scroll" style="max-height:360px"><table class="data-table small" id="ioTable"><thead>
          <tr><th>code a</th><th>IO</th><th>CCT</th><th>หน่วยงานย่อย</th><th>GL</th><th>ชื่อบัญชี</th></tr></thead><tbody>
          ${rows.map(r => `<tr>
            <td class="mono copyable">${esc(r.codeA || '—')}</td>
            <td class="mono copyable ${r.io === 'ไม่คุม' ? 'muted' : ''}">${esc(r.io || '—')}</td>
            <td class="mono copyable">${r.cct}</td>
            <td class="small">${esc(r.cctName || '')}</td>
            <td><span class="gl-code">${r.gl.code}</span></td>
            <td class="small">${esc(r.gl.name)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted small" style="margin-top:8px">ทั้งหมด ${rows.length} แถว · คลิกเลขเพื่อคัดลอก — ใช้อ้างอิงตอนออก PR/PO หรือเอกสาร SAP</p>`;
      const back = UI.modal(`🔎 เลข IO / CCT — ${esc(d.name)}`, html, [{ label: 'ปิด', cls: 'primary-btn' }]);
      back.querySelector('.modal').classList.add('modal-wide');
      const inp = back.querySelector('#ioSearch');
      inp.addEventListener('input', () => {
        const q = inp.value.trim().toLowerCase();
        back.querySelectorAll('#ioTable tbody tr').forEach(tr => {
          tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
      inp.focus();
      back.querySelectorAll('td.copyable').forEach(td => td.addEventListener('click', () => {
        const t = td.textContent.trim();
        if (!t || t === '—' || t === 'ไม่คุม') return;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
          .then(() => UI.toast(`คัดลอก ${t} แล้ว ✓`)).catch(() => {});
      }));
    });
    document.getElementById('calcuOpenBtn')?.addEventListener('click', () => {
      const back = UI.modal(`<span class="mt-svg">${calcIcon(38)}</span><span class="mt-tx">เครื่องคิดเลข<small>คัดลอกผลลัพธ์เพื่อวางในช่องงบประมาณ</small></span>`,
        calcuHtml(), [{ label: 'ปิด', cls: 'ghost-btn' }]);
      back.querySelector('.modal').classList.add('modal-calcu');
      calcuBind();
    });

    document.querySelectorAll('[data-note]').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.dataset.note;
      const r = c.rows.find(x => x.key === key);
      const g = r?.gl || Store.gl(Store.splitKey(key)[0]);
      const n = Store.note(c.year, c.deptId, key);
      const prevT = Store.rowTotal(c.prevYear, c.deptId, key);
      const curT = Store.rowTotal(c.year, c.deptId, key);
      const cmp = Store.compare(curT, prevT);
      UI.modal(`GL ${g.code} — ${esc(g.name)}`, `
        ${r ? `<div class="muted small" style="margin-bottom:8px">🏷 ${esc(r.cctName)} (CCT ${r.cct}) · IO ${r.io || '—'} · code a: ${r.codeA || '—'}</div>` : ''}
        <div class="note-cmp">ปี ${c.prevYear}: <b>${fmt(prevT)}</b> กีบ → ปี ${c.year}: <b>${fmt(curT)}</b> กีบ ${deltaBadge(cmp.diff, cmp.pct)}</div>
        <label class="fld"><span>สาเหตุการเพิ่ม / ลด (Reason)</span>
          <textarea id="noteReason" rows="3" ${c.editable ? '' : 'disabled'} placeholder="เช่น ปี ${c.year} เป็นปีที่ทุกระบบต้องได้รับการต่ออายุ จำนวน Manday เพิ่มขึ้น">${esc(n.reason)}</textarea></label>
        <label class="fld"><span>สมมติฐานในการจัดทำงบ (Assumption)</span>
          <textarea id="noteAssume" rows="3" ${c.editable ? '' : 'disabled'} placeholder="เช่น ประมาณการจากค่าตรวจ Audit 5 ระบบ × 3 วัน × อัตรา Manday">${esc(n.assumption)}</textarea></label>`,
        c.editable ? [
          { label: 'ยกเลิก', cls: 'ghost-btn' },
          { label: 'บันทึก', cls: 'primary-btn', onClick: close => {
              try {
                Store.setNote(user, c.year, c.deptId, key,
                  document.getElementById('noteReason').value.trim(),
                  document.getElementById('noteAssume').value.trim());
                toast('บันทึกเหตุผล/สมมติฐานแล้ว'); close(); App.render();
              } catch (e) { toast(e.message, 'err'); }
            } },
        ] : [{ label: 'ปิด', cls: 'ghost-btn' }]);
    }));
  }

  /* ============ Review & Submit ============ */
  function review(user) {
    const c = ctx(user);
    const v = Store.validate(c.year, c.deptId);
    const cur = Store.deptTotal(c.year, c.deptId), prev = Store.deptTotal(c.prevYear, c.deptId);
    const cmp = Store.compare(cur, prev);
    const canSubmit = v.ok && c.editable;

    return pageHead(`ตรวจสอบ & ส่งข้อมูล — ปี ${c.year}`, `${esc(c.dept.name)} · ${asOf()}`)
      + `<div class="kpi-grid kpi-grid-4">
        ${gaugeKpi('Budget Completion', c.comp.pct, v.ok ? 'ครบถ้วน พร้อมส่ง ✓' : `เหลืออีก ${v.errors.length} รายการ`)}
        ${kpi('ยอดรวมปี ' + c.year, fmt(cur) + ' <small>กีบ</small>', '')}
        ${kpi('เทียบปี ' + c.prevYear, deltaBadge(cmp.diff, cmp.pct), (cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff) + ' กีบ')}
        ${kpi('สถานะ', UI.statusBadge(c.state.status), c.state.revisionNote ? '⚠ ' + esc(c.state.revisionNote) : '')}
      </div>`
      + (v.errors.length ? card(`รายการที่ยังไม่ครบ (${v.errors.length})`,
          `<ul class="err-list">${v.errors.slice(0, 30).map(e2 => `<li>${esc(e2)}</li>`).join('')}</ul>${v.errors.length > 30 ? `<details class="err-more"><summary>… และอีก ${v.errors.length - 30} รายการ (คลิกเพื่อดูทั้งหมด)</summary><ul class="err-list">${v.errors.slice(30).map(e2 => `<li>${esc(e2)}</li>`).join('')}</ul></details>` : ''}
           <a class="primary-btn" href="#/budget">ไปกรอกให้ครบ</a>`) : '')
      + (v.warnings.length ? card(`ข้อสังเกต (${v.warnings.length}) — ไม่บล็อกการส่ง แต่ควรระบุเหตุผล`,
          `<ul class="warn-list">${v.warnings.map(w => `<li>⚠ ${esc(w)}</li>`).join('')}</ul>`) : '')
      + card(`สรุปราย GL`, compareTable(c))
      + card('ส่งข้อมูลให้แผนกบัญชี', `
          <p>เมื่อส่งแล้วจะไม่สามารถแก้ไขได้ จนกว่าแผนกบัญชีจะตีกลับ (Need Revision) หรือ Unlock</p>
          <button id="submitBtn" class="primary-btn big" ${canSubmit ? '' : 'disabled'}>📤 Submit งบประมาณปี ${c.year}</button>
          ${!c.editable ? '<p class="muted">— ส่งแล้วหรือรอบถูกปิด —</p>' : (!v.ok ? '<p class="muted">ต้องกรอกครบ 100% ก่อนจึงจะส่งได้</p>' : '')}`);
  }
  function reviewBind(user) {
    bindZeroToggle();
    document.getElementById('submitBtn')?.addEventListener('click', () => {
      const c = ctx(user);
      UI.confirm2(`ยืนยันการส่งงบประมาณปี ${c.year}`,
        `ยอดรวม ${fmt(Store.deptTotal(c.year, c.deptId))} กีบ จะถูกส่งให้แผนกบัญชีตรวจสอบ`,
        'หลังส่งแล้วจะแก้ไขไม่ได้ จนกว่าจะถูกตีกลับให้แก้ไข',
        () => {
          try { Store.submit(user, c.year); toast('ส่งงบประมาณเรียบร้อยแล้ว'); App.render(); }
          catch (e) { toast(e.message, 'err'); }
        });
    });
  }

  /* ============ Calculators (ดีไซน์ตาม mock: 3 คอลัมน์ + ธง + การ์ดผลลัพธ์สี) ============ */
  // ธงชาติจากไฟล์ภาพในโฟลเดอร์ Flags (emoji ธงไม่แสดงบน Windows)
  const FLAG_IMG = { THB: 'Thai.png', USD: 'USA.png', CNY: 'China.png', EUR: 'EROU.png' };
  const flagImg = cur => FLAG_IMG[cur]
    ? `<img class="flag-img" src="Flags/${FLAG_IMG[cur]}" alt="${cur}">`
    : '<span class="flag">💱</span>';
  function calcCards(user) {
    const year = UI.year();
    const rates = Store.db.exchangeRates.filter(r => r.year === year);
    const fuels = Store.db.fuelPrices.filter(f => f.year === year);
    const rateRows = rates.map(r => `<tr>
      <td class="flag-cell">${flagImg(r.currency)} <b>${r.currency}</b></td>
      <td class="num"><b>${fmt(r.rateToLAK)}.00</b></td>
      <td class="muted small">ต่อ 1 ${r.currency}</td></tr>`).join('');

    return `<div class="ft-grid">

      <section class="ft-col">
        <div class="ft-head"><span class="ft-ic" style="background:#e6f0fb">💱</span>
          <div><b>อัตราแลกเปลี่ยน</b><small>Exchange Rate</small></div></div>
        <div class="ft-ratebox">
          <div class="ft-ratebox-head"><b>Budget Rate ${year}</b>
            <span class="pill-green">อัปเดตล่าสุด 15 ส.ค. ${year}</span></div>
          <table class="ft-table"><thead><tr><th>สกุลเงิน</th><th class="num">อัตราแลกเปลี่ยน</th><th>ต่อ 1 หน่วย</th></tr></thead>
          <tbody>${rateRows}</tbody></table>
        </div>
        <div class="ft-divider"><span>คำนวณเอง</span></div>
        <div class="two-up">
          <label class="fld"><span>เลือกสกุลเงิน</span><select id="fxCur">${rates.map(r => `<option value="${r.currency}">${r.currency}</option>`).join('')}</select></label>
          <label class="fld"><span>จำนวนเงิน</span><input id="fxAmt" inputmode="decimal" value="1,000"></label>
        </div>
        <div class="fx-ratebox"><div class="fxr-label">อัตราแลกเปลี่ยน (แก้ไขได้)</div>
          <div class="fxr-row"><input id="fxRate" inputmode="decimal" value="${rates[0] ? fmt(rates[0].rateToLAK) : ''}">
          <span class="muted small">ต่อ 1 <span id="fxCurLabel">${rates[0]?.currency || ''}</span></span></div></div>
        <button class="fx-result" id="fxCopyBar" title="คลิกเพื่อคัดลอกผลลัพธ์">
          <span class="fxr-sub">💰 เท่ากับ</span>
          <span class="fxr-val"><b id="fxOut">680,000</b> กีบ</span></button>
      </section>

      <section class="ft-col">
        <div class="ft-head"><span class="ft-ic" style="background:#fdecec">⛽</span>
          <div><b>ราคาน้ำมัน</b><small>Fuel Price</small></div>
          <span class="pill-green" style="margin-left:auto">ข้อมูลล่าสุด</span></div>
        <div class="fuel-info"><div class="ft-ratebox-head"><b>🛢 ราคากลาง ${year}</b></div>
          ${fuels.map(f => `<div class="fuel-row"><span>${esc(UI.fuelLabel(f.fuelType))}</span><b>${fmt(f.pricePerLiter)}.00 กีบ/ลิตร</b></div>`).join('')}
        </div>
        <label class="fld"><span>ชนิดน้ำมัน</span><select id="fuType">${fuels.map(f => `<option value="${f.pricePerLiter}">⛽ ${esc(UI.fuelLabel(f.fuelType))}</option>`).join('')}</select></label>
        <label class="fld"><span>ราคาปัจจุบัน (กีบ/ลิตร)</span><input id="fuPrice" inputmode="decimal" value="${fuels[0] ? fmt(fuels[0].pricePerLiter) : ''}"></label>
        <div class="two-up">
          <label class="fld"><span>คาดว่าเพิ่มขึ้น %</span><div class="suffix-wrap"><input id="fuInc" inputmode="decimal" value="0"><span class="suffix">%</span></div></label>
          <label class="fld"><span>ปริมาณใช้ (ลิตร/เดือน)</span><input id="fuCons" inputmode="decimal" value="1,000"></label>
        </div>
        <div class="green-card"><span class="gc-label">📈 ราคาคาดการณ์</span>
          <span class="gc-val"><b id="fuExp">—</b> กีบ/ลิตร</span></div>
        <div class="green-card"><span class="gc-label">🧮 ประมาณการค่าใช้จ่าย</span>
          <span class="gc-val"><b id="fuMon">—</b> กีบ/เดือน</span>
          <span class="gc-sub">ต่อปี <b id="fuYear">—</b> กีบ</span></div>
      </section>

      <section class="ft-col">
        <div class="ft-head"><span class="ft-ic" style="background:#f3effc">🧮</span>
          <div><b>Budget Assumption</b><small>Qty × Price × Freq</small></div></div>
        <label class="fld"><span>จำนวน (เช่น พนักงาน 25 คน)</span>
          <div class="suffix-wrap"><input id="qQty" inputmode="decimal" value="25"><span class="suffix">คน</span></div></label>
        <label class="fld"><span>ราคาต่อหน่วย (กีบ)</span>
          <div class="suffix-wrap"><input id="qPrice" inputmode="decimal" value="1,700,000"><span class="suffix">กีบ</span></div></label>
        <label class="fld"><span>ความถี่ (ครั้ง/ปี)</span>
          <div class="suffix-wrap"><input id="qFreq" inputmode="decimal" value="1"><span class="suffix">ครั้ง</span></div></label>
        <div class="purple-card"><span class="gc-label">💰 งบประมาณต่อปี</span>
          <span class="pc-val"><b id="qOut">—</b> กีบ</span></div>
        <div class="fld"><span class="muted small">สร้างข้อความ Assumption อัตโนมัติ</span>
          <div id="qText" class="assume-text">—</div></div>
        <button class="ghost-btn" id="qCopy" style="width:100%">📋 คัดลอกข้อความ + ตัวเลข</button>
      </section>

    </div>
    <div class="ft-foot muted small">ℹ️ หมายเหตุ: อัตราแลกเปลี่ยนและราคาน้ำมันเป็นราคากลางอ้างอิงสำหรับการจัดทำงบประมาณปี ${year} (กำหนดโดยแผนกบัญชี)</div>`;
  }

  /* ---------- ไอคอนเครื่องคิดเลข (วาดเป็น SVG — คมชัดทุกขนาด ดูเป็นเครื่องมือจริง) ---------- */
  function calcIcon(size = 38) {
    const key = (x, y, fill, w = 5.6, h = 5.2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${fill}"/>`;
    const N = '#38506e', ops = ['#0ea5b7', '#3b82f6', '#2f6fe0', '#1d4ed8'];
    let keys = '';
    const xs = [11.2, 17.8, 24.4], ys = [20.6, 26.8, 33];
    ys.forEach((y, r) => { xs.forEach(x => { keys += key(x, y, N); }); keys += key(31, y, ops[r]); });
    keys += key(11.2, 39.2, N, 12.2, 5.2) + key(24.4, 39.2, N) + key(31, 39.2, ops[3]);
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" style="display:block" aria-hidden="true">
      <defs><linearGradient id="cig${size}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
      <rect width="48" height="48" rx="11" fill="url(#cig${size})"/>
      <rect x="7.5" y="6" width="33" height="41" rx="4.5" fill="#ffffff"/>
      <rect x="7.5" y="6" width="33" height="41" rx="4.5" fill="none" stroke="rgba(11,40,80,.08)"/>
      <rect x="11.2" y="9.6" width="25.4" height="8" rx="2" fill="#1e2a3d"/>
      <rect x="29.8" y="11.4" width="4.6" height="4.4" rx="0.8" fill="none" stroke="#cfe0f5" stroke-width="1.1"/>
      ${keys}
    </svg>`;
  }

  /* ============ เครื่องคิดเลข (ธีมเขียวมิ้นต์ตาม mock) ============ */
  function calcuHtml() {
    const fnBtn = (k, sym, lb) => `<button data-ck="${k}" class="cbtn fn"><b>${sym}</b><small>${lb}</small></button>`;
    const opBtn = (k, sym, lb) => `<button data-ck="${k}" class="cbtn op"><b>${sym}</b><small>${lb}</small></button>`;
    const nBtn = k => `<button data-ck="${k}" class="cbtn">${k}</button>`;
    return `<div class="calcu2">
      <div class="calcu2-display"><span class="cd-label">ผลลัพธ์</span>
        <input id="calcuDisplay" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
      <div class="calcu2-fnrow">
        ${fnBtn('C', 'C', 'ล้างทั้งหมด')}${fnBtn('CE', 'CE', 'ล้างล่าสุด')}${fnBtn('⌫', '⌫', 'ลบตัวสุดท้าย')}
        ${fnBtn('%', '%', 'เปอร์เซ็นต์')}${opBtn('/', '÷', 'หาร')}
      </div>
      <div class="calcu2-grid">
        ${nBtn('7')}${nBtn('8')}${nBtn('9')}${opBtn('*', '×', 'คูณ')}
        ${nBtn('4')}${nBtn('5')}${nBtn('6')}${opBtn('-', '−', 'ลบ')}
        ${nBtn('1')}${nBtn('2')}${nBtn('3')}${opBtn('+', '+', 'บวก')}
        ${nBtn('0')}${nBtn('00')}
        <button data-ck="." class="cbtn"><b>·</b><small>จุดทศนิยม</small></button>
        <button data-ck="=" class="cbtn eq"><b>=</b><small>เท่ากับ</small></button>
      </div>
      <button class="calcu2-copy" id="calcuCopy">
        <span class="cc-ic">📋</span>
        <span><b>คัดลอกผลลัพธ์ → วางในช่องงบประมาณ</b><br>
        <small>พิมพ์สูตรในช่องผลลัพธ์ได้เลย แล้วกด Enter เพื่อคำนวณ</small></span>
      </button>
    </div>`;
  }
  function calcuBind() {
    const disp = document.getElementById('calcuDisplay');
    if (!disp) return;
    const sanitize = s => s.replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/[^0-9+\-*/().%\s]/g, '');
    const evaluate = () => {
      let expr = sanitize(disp.value).replace(/%/g, '/100');
      if (!expr.trim()) return;
      try {
        const val = Function('"use strict"; return (' + expr + ')')();
        if (typeof val !== 'number' || !isFinite(val)) throw 0;
        disp.value = (Math.round(val * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
        disp.classList.remove('calcu-err');
      } catch (e) { disp.classList.add('calcu-err'); toast('นิพจน์ไม่ถูกต้อง', 'err'); }
    };
    document.querySelectorAll('[data-ck]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.ck;
      disp.classList.remove('calcu-err');
      if (k === 'C') disp.value = '';
      else if (k === 'CE') disp.value = disp.value.replace(/[\d.,]+\s*$/, ''); // ล้างตัวเลขล่าสุด
      else if (k === '⌫') disp.value = disp.value.slice(0, -1);
      else if (k === '=') evaluate();
      else disp.value += k;
      disp.focus();
    }));
    disp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); evaluate(); }
    });
    document.getElementById('calcuCopy')?.addEventListener('click', () => {
      if (!disp.value) return;
      navigator.clipboard?.writeText(disp.value.replace(/,/g, ''));
      toast('คัดลอก ' + disp.value + ' แล้ว — วางในช่องงบได้เลย (Ctrl+V)');
    });
    disp.focus();
  }
  function calculators(user) {
    return pageHead('เครื่องมือคำนวณ (Calculators)', `ช่วยจัดทำ Budget Assumption · Budget Rate ปี ${UI.year()} กำหนดโดยแผนกบัญชี`)
      + calcCards(user);
  }
  function calculatorsBind(user) {
    const year = UI.year();
    const num = id => { const v = Number(String(document.getElementById(id).value).replace(/,/g, '')); return isFinite(v) ? v : 0; };
    const rates = Store.db.exchangeRates.filter(r => r.year === year);
    const fx = () => {
      const out = num('fxAmt') * num('fxRate');
      document.getElementById('fxOut').textContent = fmt(out);
    };
    document.getElementById('fxCur')?.addEventListener('change', e => {
      const r = rates.find(x => x.currency === e.target.value);
      if (r) document.getElementById('fxRate').value = fmt(r.rateToLAK);
      const lb = document.getElementById('fxCurLabel');
      if (lb) lb.textContent = e.target.value;
      fx();
    });
    ['fxAmt', 'fxRate'].forEach(id => document.getElementById(id)?.addEventListener('input', fx));
    document.getElementById('fxCopyBar')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(document.getElementById('fxOut').textContent.replace(/,/g, ''));
      toast('คัดลอก ' + document.getElementById('fxOut').textContent + ' กีบ แล้ว — วางในช่องงบได้เลย');
    });
    const fu = () => {
      const exp = num('fuPrice') * (1 + num('fuInc') / 100);
      const mon = exp * num('fuCons');
      document.getElementById('fuExp').textContent = fmt(exp);
      document.getElementById('fuMon').textContent = fmt(mon);
      document.getElementById('fuYear').textContent = fmt(mon * 12);
    };
    document.getElementById('fuType')?.addEventListener('change', e => { document.getElementById('fuPrice').value = fmt(Number(e.target.value)); fu(); });
    ['fuPrice', 'fuInc', 'fuCons'].forEach(id => document.getElementById(id)?.addEventListener('input', fu));
    const q = () => {
      const out = num('qQty') * num('qPrice') * num('qFreq');
      document.getElementById('qOut').textContent = fmt(out);
      document.getElementById('qText').textContent =
        out ? `ประมาณการจากจำนวน ${num('qQty').toLocaleString()} หน่วย × ${fmt(num('qPrice'))} กีบ/หน่วย × ${num('qFreq')} ครั้ง/ปี = ${fmt(out)} กีบ` : '—';
    };
    ['qQty', 'qPrice', 'qFreq'].forEach(id => document.getElementById(id)?.addEventListener('input', q));
    document.getElementById('qCopy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(document.getElementById('qText').textContent);
      toast('คัดลอกแล้ว — นำไปวางในช่อง Assumption ได้เลย');
    });
    fx(); fu(); q(); // คำนวณค่าเริ่มต้นทันทีที่เปิด
  }

  return { dashboard, dashboardBind, budget, budgetBind, review, reviewBind, calculators, calculatorsBind };
})();

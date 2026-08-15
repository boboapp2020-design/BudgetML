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
  // การ์ด KPI แบบมีไอคอนสี
  function kpiC(icon, iconBg, tint, label, valueHtml, sub) {
    return `<div class="kpi kpi-c ${tint}"><div class="kpi-ic" style="background:${iconBg}">${icon}</div>
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
      gls: Store.deptGLs(deptId),
      state: Store.deptState(year, deptId),
      comp: Store.completion(year, deptId),
      editable: Store.canEdit(user, year, deptId),
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
      ${kpi('สถานะ', UI.statusBadge(c.state.status), c.state.submittedAt ? 'ส่งเมื่อ ' + UI.fmtDT(c.state.submittedAt) : '')}
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
  }

  function compareTable(c) {
    const rows = c.gls.map(g => {
      const cur = Store.glTotal(c.year, c.deptId, g.id), prev = Store.glTotal(c.prevYear, c.deptId, g.id);
      const cmp = Store.compare(cur, prev);
      const an = Store.glAnomaly(cmp);
      return `<tr>
        <td><span class="gl-code">${g.code}</span> ${esc(g.name)}</td>
        <td class="num">${fmt(prev)}</td><td class="num">${fmt(cur)}</td>
        <td class="num ${cmp.diff > 0 ? 'txt-up' : cmp.diff < 0 ? 'txt-down' : ''}">${(cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff)}</td>
        <td>${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td>${an ? `<span class="anomaly ${an.level}">⚠ ${an.tag}</span>` : ''}</td></tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>GL</th><th class="num">ปี ${c.prevYear} (กีบ)</th><th class="num">ปี ${c.year} (กีบ)</th>
      <th class="num">ผลต่าง (กีบ)</th><th>% เทียบปี ${c.prevYear}</th><th>ตรวจสอบ</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  /* ============ Budget Input (GL = แถว, เดือน = คอลัมน์) ============ */
  function budget(user) {
    const c = ctx(user);
    const cur = Store.deptTotal(c.year, c.deptId), prev = Store.deptTotal(c.prevYear, c.deptId);
    const cmp = Store.compare(cur, prev);
    const lockMsg = !c.editable
      ? `<div class="lock-banner">🔒 ${['SUBMITTED'].includes(c.state.status) ? 'ส่งข้อมูลแล้ว — แก้ไขได้เมื่อถูกตีกลับ (Need Revision)' : 'รอบงบประมาณนี้ถูกปิด/Lock แล้ว — อ่านได้อย่างเดียว'}</div>` : '';

    const head = `<tr>
      <th class="sticky-col th-gl">GL / บัญชี</th>
      ${Store.MONTH_S.map((m, i) => `<th class="num th-m">${m}<div class="th-yr">${c.year}</div></th>`).join('')}
      <th class="num th-total">รวมปี ${c.year}</th>
      <th class="num th-prev">ปี ${c.prevYear}</th>
      <th class="th-delta">%Δ</th>
      <th class="num th-mtp">ปี ${c.year + 1}<div class="th-yr">MTP</div></th>
      <th class="num th-mtp">ปี ${c.year + 2}<div class="th-yr">MTP</div></th>
      <th class="th-note">เหตุผล/สมมติฐาน</th></tr>`;

    const body = c.gls.map(g => {
      const m = Store.months(c.year, c.deptId, g.id);
      const t = Store.mtp(c.year, c.deptId, g.id);
      const notUsed = Store.glNotUsed(c.year, c.deptId, g.id);
      const prevT = Store.glTotal(c.prevYear, c.deptId, g.id);
      const curT = m.reduce((s, v) => s + (v ?? 0), 0);
      const gcmp = Store.compare(curT, prevT);
      const an = Store.glAnomaly(gcmp);
      const n = Store.note(c.year, c.deptId, g.id);
      const hasNote = n.reason.trim() || n.assumption.trim();
      const dis = (!c.editable || notUsed) ? 'disabled' : '';
      const cells = m.map((v, i) => {
        const hasDetail = !!Store.cellDetail(c.year, c.deptId, g.id, i);
        return `<td class="num cell-td"><div class="cell-wrap">
          <input class="cell" data-gl="${g.id}" data-m="${i}" inputmode="decimal"
            value="${v === null ? '' : fmt(v)}" placeholder="กรอก" ${dis}>
          <button class="cell-detail-btn ${hasDetail ? 'has' : ''}" data-dt="${g.id}|${i}" tabindex="-1"
            title="${hasDetail ? 'มีรายละเอียดค่าใช้จ่าย — คลิกเพื่อดู/แก้ไข' : 'เพิ่มรายละเอียดค่าใช้จ่าย (หลายรายการ)'}">🧾</button>
        </div></td>`;
      }).join('');
      return `<tr data-gl-row="${g.id}" class="${notUsed ? 'tr-notused' : ''}">
        <td class="sticky-col td-gl"><div class="gl-name-wrap">
            ${glIcon(g)}
            <span class="gl-code">${g.code}</span><span class="gl-nm" title="${esc(g.name)}">${esc(g.name)}</span>
            ${notUsed ? '<span class="nu-chip">ไม่ได้ใช้</span>' : ''}
            ${an && !notUsed ? `<span class="anomaly-ic ${an.level}" title="${an.tag}: ${an.msg}">⚠</span>` : ''}</div></td>
        ${cells}
        <td class="num td-total" data-total="${g.id}">${fmt(curT)}</td>
        <td class="num td-prev">${fmt(prevT)}</td>
        <td class="td-delta" data-delta="${g.id}">${deltaBadge(gcmp.diff, gcmp.pct)}</td>
        <td class="num cell-td"><input class="cell cell-mtp" data-gl="${g.id}" data-mtp="1" inputmode="decimal" placeholder="กรอก" value="${t.mtp1 === null ? '' : fmt(t.mtp1)}" ${dis}></td>
        <td class="num cell-td"><input class="cell cell-mtp" data-gl="${g.id}" data-mtp="2" inputmode="decimal" placeholder="กรอก" value="${t.mtp2 === null ? '' : fmt(t.mtp2)}" ${dis}></td>
        <td class="td-note">
          <button class="nu-btn ${notUsed ? 'active' : ''}" data-nu="${g.id}" ${c.editable ? '' : 'disabled'}
            title="${notUsed ? 'กลับมากรอก GL นี้' : 'ไม่ได้ใช้ GL นี้ (ตั้งเป็น 0 ทั้งแถว)'}">${notUsed ? '↩' : '🚫'}</button>
          <button class="note-btn ${hasNote ? 'has-note' : ''}" data-note="${g.id}">${hasNote ? '📝 มีข้อมูล' : '＋ เพิ่ม'}</button></td>
      </tr>`;
    }).join('');

    const foot = (() => {
      const mm = Store.deptMonthly(c.year, c.deptId);
      const pm = Store.deptMonthly(c.prevYear, c.deptId);
      return `<tr class="tr-sum"><td class="sticky-col td-gl"><b>รวมทั้งหน่วยงาน</b></td>
        ${mm.map(v => `<td class="num" data-msum>${fmt(v)}</td>`).join('')}
        <td class="num td-total" data-gsum><b>${fmt(cur)}</b></td>
        <td class="num td-prev">${fmt(prev)}</td>
        <td class="td-delta">${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td></td><td></td><td></td></tr>
        <tr class="tr-pct"><td class="sticky-col td-gl muted">เทียบกับปีก่อน (รายเดือน)</td>
        ${mm.map((v, i) => { const cp = Store.compare(v, pm[i]); return `<td class="num" data-mpct="${i}">${deltaBadge(cp.diff, cp.pct)}</td>`; }).join('')}
        <td class="num" data-gpct>${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td></td><td></td><td></td><td></td><td></td></tr>`;
    })();

    return pageHead(`กรอกงบประมาณปี ${c.year} 👋`, `${esc(c.dept.name)} · GL เป็นแถว เดือนเป็นคอลัมน์ · หน่วย: กีบ (LAK) · บันทึกอัตโนมัติ`,
        `<button id="calcuOpenBtn" class="ghost-btn btn-purple">🖩 เครื่องคิดเลข</button>
         <button id="calcOpenBtn" class="ghost-btn btn-teal">🧮 เครื่องมือคำนวณ</button>
         <a class="ghost-btn btn-green" href="#/review">ตรวจสอบงบประมาณ →</a>`)
      + `<div class="kpi-grid kpi-grid-4">
          ${kpiC('💵', '#e6f0fb', 'kpi-tint-blue', 'ยอดรวมปี ' + c.year, `<span data-kpi-total>${fmt(cur)}</span> <small>กีบ</small>`, 'คำนวณอัตโนมัติ real-time')}
          ${kpiC('📅', '#e6f7f0', 'kpi-tint-teal', 'ปีก่อน ' + c.prevYear, fmt(prev) + ' <small>กีบ</small>', 'baseline เปรียบเทียบ')}
          ${kpiC(cmp.diff >= 0 ? '📈' : '📉', cmp.diff >= 0 ? '#fdecec' : '#eaf6ea', 'kpi-tint-green', 'เพิ่ม/ลด', `<span data-kpi-delta>${deltaBadge(cmp.diff, cmp.pct)}</span>`, 'เทียบงบปี ' + c.prevYear)}
          ${gaugeKpi('ความครบถ้วน', c.comp.pct, 'เป้าหมาย 100% ก่อน Submit', 'data-kpi-comp')}
        </div>`
      + lockMsg
      + card('', `<div class="grid-hint">💡 Tab/Enter เลื่อนช่อง · วาง (Ctrl+V) จาก Excel ได้หลายช่องพร้อมกัน · ช่องว่าง = ยังไม่กรอก (ใส่ 0 หากไม่มีงบ) · 🧾 ที่มุมช่อง = รายละเอียดหลายรายการ
          <span class="hint-actions">
            <button id="gridClearBtn" class="ghost-btn small btn-clear" title="ล้างข้อมูลที่กรอกทั้งปีนี้" ${c.editable ? '' : 'disabled'}>🗑 ล้างข้อมูล</button>
            <button id="gridFsBtn" class="ghost-btn small btn-fs" title="ขยายตารางเกือบเต็มจอ (Esc เพื่อย่อกลับ)">⛶</button>
          </span></div>
        <div class="table-scroll budget-scroll"><table class="budget-table"><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>`, { cls: 'card-flush budget-card' });
  }

  function budgetBind(user) {
    const c = ctx(user);
    const parseNum = s => {
      s = String(s).replace(/[,\s฿₭]/g, '').trim();
      if (s === '') return null;
      const v = Number(s);
      return isFinite(v) ? v : NaN;
    };

    function refreshRow(glId) {
      const m = Store.months(c.year, c.deptId, glId);
      const t = m.reduce((s, v) => s + (v ?? 0), 0);
      const prevT = Store.glTotal(c.prevYear, c.deptId, glId);
      const cmp = Store.compare(t, prevT);
      document.querySelector(`[data-total="${glId}"]`).textContent = fmt(t);
      document.querySelector(`[data-delta="${glId}"]`).innerHTML = deltaBadge(cmp.diff, cmp.pct);
      // footer + KPI + แถวเทียบปีก่อน
      const mm = Store.deptMonthly(c.year, c.deptId);
      const pm = Store.deptMonthly(c.prevYear, c.deptId);
      document.querySelectorAll('[data-msum]').forEach((td, i) => { td.textContent = fmt(mm[i]); });
      document.querySelectorAll('[data-mpct]').forEach(td => {
        const i = Number(td.dataset.mpct);
        const cp = Store.compare(mm[i], pm[i]);
        td.innerHTML = deltaBadge(cp.diff, cp.pct);
      });
      const cur = Store.deptTotal(c.year, c.deptId), prev = Store.deptTotal(c.prevYear, c.deptId);
      const dcmp = Store.compare(cur, prev);
      document.querySelector('[data-gsum] b').textContent = fmt(cur);
      const gp = document.querySelector('[data-gpct]');
      if (gp) gp.innerHTML = deltaBadge(dcmp.diff, dcmp.pct);
      document.querySelector('[data-kpi-total]').textContent = fmt(cur);
      document.querySelector('[data-kpi-delta]').innerHTML = deltaBadge(dcmp.diff, dcmp.pct);
      document.querySelector('[data-kpi-comp]').innerHTML = Charts.gauge(Store.completion(c.year, c.deptId).pct);
    }

    function commit(input) {
      const glId = input.dataset.gl;
      const v = parseNum(input.value);
      if (Number.isNaN(v)) { toast('รูปแบบตัวเลขไม่ถูกต้อง', 'err'); input.classList.add('cell-err'); return; }
      input.classList.remove('cell-err');
      try {
        let changed;
        if (input.dataset.mtp) changed = Store.setMtp(user, c.year, c.deptId, glId, Number(input.dataset.mtp), v);
        else changed = Store.setCell(user, c.year, c.deptId, glId, Number(input.dataset.m), v);
        if (changed) input.classList.add('cell-changed');
        input.value = v === null ? '' : fmt(v);
        if (v !== null && v < 0) { input.classList.add('cell-err'); toast('ไม่ควรมีตัวเลขติดลบในงบประมาณ', 'err'); }
        refreshRow(glId);
      } catch (e) { toast(e.message, 'err'); input.value = ''; }
    }

    const cells = Array.from(document.querySelectorAll('.cell'));
    cells.forEach(inp => {
      inp.addEventListener('focus', () => { inp.value = inp.value.replace(/,/g, ''); inp.select(); });
      inp.addEventListener('blur', () => commit(inp));
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); moveFocus(inp, 0, 1); }
      });
      inp.addEventListener('paste', e => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // ค่าเดียว ให้ paste ปกติ
        e.preventDefault();
        const rows = text.replace(/\r/g, '').split('\n').filter(r => r.length);
        const startGl = inp.dataset.gl, startM = Number(inp.dataset.m ?? -1);
        if (startM < 0) return;
        const glOrder = c.gls.map(g => g.id);
        let gi = glOrder.indexOf(startGl);
        rows.forEach((rowText, ri) => {
          const vals = rowText.split('\t');
          const glId = glOrder[gi + ri];
          if (!glId) return;
          vals.forEach((val, ci) => {
            const mi = startM + ci;
            if (mi > 11) return;
            const target = document.querySelector(`.cell[data-gl="${glId}"][data-m="${mi}"]`);
            if (target && !target.disabled) { target.value = val; commit(target); }
          });
        });
        toast('วางข้อมูลจาก Excel แล้ว');
      });
    });
    function moveFocus(inp, dCol, dRow) {
      if (inp.dataset.m === undefined) return;
      const glOrder = c.gls.map(g => g.id);
      const gi = glOrder.indexOf(inp.dataset.gl) + dRow;
      const mi = Number(inp.dataset.m) + dCol;
      const next = document.querySelector(`.cell[data-gl="${glOrder[gi]}"][data-m="${mi}"]`);
      next?.focus();
    }

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
    function openCellDetail(glId, mi) {
      const g = Store.gl(glId);
      const notUsed = Store.glNotUsed(c.year, c.deptId, glId);
      const editable = c.editable && !notUsed;
      const saved = Store.cellDetail(c.year, c.deptId, glId, mi);
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
              const r = Store.setCellDetail(user, c.year, c.deptId, glId, mi, valid);
              if (r.cleared) toast('ลบรายละเอียดแล้ว (ตัวเลขในช่องคงเดิม)');
              else toast(`บันทึก ${r.count} รายการ รวม ${fmt(r.sum)} กีบ ลงช่อง ${Store.MONTH_S[mi]} แล้ว`);
              // อัปเดตช่องหลัก + ยอดรวมแบบไม่ re-render ทั้งหน้า
              const inp = document.querySelector(`.cell[data-gl="${glId}"][data-m="${mi}"]`);
              if (inp && !r.cleared) { inp.value = fmt(r.sum); inp.classList.add('cell-changed'); }
              const btn = document.querySelector(`[data-dt="${glId}|${mi}"]`);
              if (btn) btn.classList.toggle('has', !r.cleared);
              refreshRow(glId);
              close();
            } catch (e) { toast(e.message, 'err'); }
          } },
      ] : [{ label: 'ปิด', cls: 'ghost-btn' }];

      const back = UI.modal(`🧾 รายละเอียดค่าใช้จ่าย`, `
        <div class="dt-head"><span class="gl-code">${g.code}</span> ${esc(g.name)}
          <span class="dt-month">เดือน ${Store.MONTH_TH[mi]} ${c.year}</span></div>
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
      const [glId, mi] = btn.dataset.dt.split('|');
      openCellDetail(glId, Number(mi));
    }));

    document.querySelectorAll('[data-nu]').forEach(btn => btn.addEventListener('click', () => {
      const glId = btn.dataset.nu;
      const g = Store.gl(glId);
      const now = Store.glNotUsed(c.year, c.deptId, glId);
      try {
        Store.setGlNotUsed(user, c.year, c.deptId, glId, !now);
        toast(!now ? `ทำเครื่องหมาย "ไม่ได้ใช้" GL ${g.code} แล้ว (ตั้งเป็น 0 ทั้งแถว)` : `GL ${g.code} กลับมากรอกได้แล้ว`);
        App.render();
      } catch (e) { toast(e.message, 'err'); }
    }));

    document.getElementById('calcOpenBtn')?.addEventListener('click', () => {
      const back = UI.modal(`<span class="mt-ic mt-rainbow">🧮</span><span class="mt-tx">เครื่องมือคำนวณ<small>Financial Tools &amp; Calculators</small></span>`,
        calcCards(user), [{ label: 'ปิด', cls: 'ghost-btn' }]);
      back.querySelector('.modal').classList.add('modal-wide');
      calculatorsBind(user);
    });
    document.getElementById('calcuOpenBtn')?.addEventListener('click', () => {
      const back = UI.modal(`<span class="mt-ic mt-teal">🖩</span><span class="mt-tx">เครื่องคิดเลข<small>คัดลอกผลลัพธ์เพื่อวางในช่องงบประมาณ</small></span>`,
        calcuHtml(), [{ label: 'ปิด', cls: 'ghost-btn' }]);
      back.querySelector('.modal').classList.add('modal-calcu');
      calcuBind();
    });

    document.querySelectorAll('[data-note]').forEach(btn => btn.addEventListener('click', () => {
      const glId = btn.dataset.note;
      const g = Store.gl(glId);
      const n = Store.note(c.year, c.deptId, glId);
      const prevT = Store.glTotal(c.prevYear, c.deptId, glId);
      const curT = Store.glTotal(c.year, c.deptId, glId);
      const cmp = Store.compare(curT, prevT);
      UI.modal(`GL ${g.code} — ${esc(g.name)}`, `
        <div class="note-cmp">ปี ${c.prevYear}: <b>${fmt(prevT)}</b> กีบ → ปี ${c.year}: <b>${fmt(curT)}</b> กีบ ${deltaBadge(cmp.diff, cmp.pct)}</div>
        <label class="fld"><span>สาเหตุการเพิ่ม / ลด (Reason)</span>
          <textarea id="noteReason" rows="3" ${c.editable ? '' : 'disabled'} placeholder="เช่น ปี ${c.year} เป็นปีที่ทุกระบบต้องได้รับการต่ออายุ จำนวน Manday เพิ่มขึ้น">${esc(n.reason)}</textarea></label>
        <label class="fld"><span>สมมติฐานในการจัดทำงบ (Assumption)</span>
          <textarea id="noteAssume" rows="3" ${c.editable ? '' : 'disabled'} placeholder="เช่น ประมาณการจากค่าตรวจ Audit 5 ระบบ × 3 วัน × อัตรา Manday">${esc(n.assumption)}</textarea></label>`,
        c.editable ? [
          { label: 'ยกเลิก', cls: 'ghost-btn' },
          { label: 'บันทึก', cls: 'primary-btn', onClick: close => {
              try {
                Store.setNote(user, c.year, c.deptId, glId,
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
          `<ul class="err-list">${v.errors.slice(0, 30).map(e2 => `<li>${esc(e2)}</li>`).join('')}${v.errors.length > 30 ? `<li>… และอีก ${v.errors.length - 30} รายการ</li>` : ''}</ul>
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
          ${fuels.map(f => `<div class="fuel-row"><span>${esc(f.fuelType)}</span><b>${fmt(f.pricePerLiter)}.00 กีบ/ลิตร</b></div>`).join('')}
        </div>
        <label class="fld"><span>ชนิดน้ำมัน</span><select id="fuType">${fuels.map(f => `<option value="${f.pricePerLiter}">⛽ ${esc(f.fuelType)}</option>`).join('')}</select></label>
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

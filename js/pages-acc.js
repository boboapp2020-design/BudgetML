/* =============================================================
 * pages-acc.js — หน้าจอฝั่ง Accounting / Admin
 * หลักการ: ดู วิเคราะห์ ควบคุม — แต่แก้ตัวเลขของ User ไม่ได้
 * ============================================================= */

const PagesAcc = (() => {
  const { fmt, fmtPct, deltaBadge, esc, kpi, card, pageHead, asOf, toast } = UI;

  // การ์ด KPI แบบมีไอคอนสี (สไตล์เดียวกับหน้ากรอกงบ)
  function kpiC(icon, iconBg, tint, label, valueHtml, sub) {
    return `<div class="kpi kpi-c ${tint}"><div class="kpi-ic" style="background:${iconBg}">${icon}</div>
      <div class="kpi-body"><div class="kpi-label">${label}</div>
      <div class="kpi-value">${valueHtml}</div><div class="kpi-sub">${sub}</div></div></div>`;
  }

  const ST_META = {
    SUBMITTED:     { label: 'ส่งแล้ว รอตรวจ', color: '#256abf' },
    LOCKED:        { label: 'ปิดรอบแล้ว',     color: '#52514e' },
    COMPLETED:     { label: 'ครบ รอส่ง',      color: '#0ca30c' },
    IN_PROGRESS:   { label: 'กำลังกรอก',      color: '#eda100' },
    NEED_REVISION: { label: 'ตีกลับแก้ไข',    color: '#d03b3b' },
    DRAFT:         { label: 'ยังไม่เริ่ม',    color: '#c3c2b7' },
  };

  /* ============ Executive Dashboard ============ */
  function dashboard(user) {
    const year = UI.year(), prevYear = year - 1;
    const depts = Store.activeDepartments();
    const cur = Store.companyTotal(year), prev = Store.companyTotal(prevYear);
    const cmp = Store.compare(cur, prev);
    const states = depts.map(d => ({ d, st: Store.deptState(year, d.id).status }));
    const cnt = {};
    states.forEach(x => { cnt[x.st] = (cnt[x.st] || 0) + 1; });
    const submitted = (cnt.SUBMITTED || 0) + (cnt.LOCKED || 0);
    const anomalies = depts.flatMap(d => Store.deptAnomalies(year, d.id));

    // แถบสถานะการส่ง (segmented bar)
    const stOrder = ['SUBMITTED', 'LOCKED', 'COMPLETED', 'IN_PROGRESS', 'NEED_REVISION', 'DRAFT'];
    const segs = stOrder.filter(s => cnt[s]).map(s =>
      `<div class="status-seg" style="flex:${cnt[s]};background:${ST_META[s].color}" title="${ST_META[s].label}: ${cnt[s]} หน่วยงาน"></div>`).join('');
    const legends = stOrder.filter(s => cnt[s]).map(s =>
      `<span class="st-legend"><span class="dl-dot" style="background:${ST_META[s].color}"></span>${ST_META[s].label} <b>${cnt[s]}</b></span>`).join('');
    const waiting = states.filter(x => !['SUBMITTED', 'LOCKED'].includes(x.st));
    const waitingNames = waiting.map(x => esc(x.d.name.replace('แผนก', ''))).join(' · ');

    // Top 5 เพิ่ม/ลด พร้อมเหตุผล
    const movers = depts.flatMap(d => Store.deptGLs(d.id).map(g => ({
      d, g, cmp: Store.compare(Store.glTotal(year, d.id, g.id), Store.glTotal(prevYear, d.id, g.id)),
    })));
    const moverRow = x => {
      const reason = (Store.note(year, x.d.id, x.g.id).reason || '').trim();
      return `<a class="mover-row" href="#/acc/departments?d=${x.d.id}&gl=${x.g.id}">
        <span class="mv-main"><b><span class="gl-code">${x.g.code}</span> ${esc(x.g.name)}</b>
          <small>${esc(x.d.name)}${reason ? ' · 💬 ' + esc(reason.slice(0, 55)) + (reason.length > 55 ? '…' : '') : ''}</small></span>
        <span class="mv-val"><span class="num">${(x.cmp.diff >= 0 ? '+' : '') + UI.fmtShort(x.cmp.diff)}</span>${deltaBadge(x.cmp.diff, x.cmp.pct)}</span></a>`;
    };
    const topInc = movers.filter(x => x.cmp.diff > 0).sort((a, b) => b.cmp.diff - a.cmp.diff).slice(0, 5).map(moverRow).join('');
    const topDec = movers.filter(x => x.cmp.diff < 0).sort((a, b) => a.cmp.diff - b.cmp.diff).slice(0, 5).map(moverRow).join('');

    return pageHead(`Executive Dashboard 📊`,
        `งบประมาณปี ${year} เทียบปี ${prevYear} · ${esc(Store.db.meta.company)} · ${asOf()}`,
        `<button class="ghost-btn" onclick="Store.exportDeptSummary(${year})">⬇ Export สรุปหน่วยงาน</button>
         <button class="ghost-btn" onclick="Store.exportDetail(${year})">⬇ Export รายละเอียด</button>
         <button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`)

      + `<div class="kpi-grid">
        ${kpiC('💰', '#e6f0fb', 'kpi-tint-blue', `งบประมาณรวมปี ${year}`,
            `${UI.fmtShort(cur)} <small>กีบ</small>`, fmt(cur) + ' กีบ · ' + depts.length + ' หน่วยงาน')}
        ${kpiC('🗓️', '#e6f7f0', 'kpi-tint-teal', `ปีก่อน ${prevYear} (baseline)`,
            `${UI.fmtShort(prev)} <small>กีบ</small>`, fmt(prev) + ' กีบ')}
        ${kpiC(cmp.diff >= 0 ? '📈' : '📉', cmp.diff >= 0 ? '#fdecec' : '#eaf6ea', 'kpi-tint-green', 'เพิ่ม/ลด เทียบปีก่อน',
            deltaBadge(cmp.diff, cmp.pct), (cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff) + ' กีบ')}
        ${kpiC('📤', submitted === depts.length ? '#eaf6ea' : '#fff7e6', 'kpi-tint-amber', 'ส่งงบประมาณแล้ว',
            `${submitted} <small>/ ${depts.length} หน่วยงาน</small>`, submitted === depts.length ? 'ครบทุกหน่วยงาน ✓' : `รออีก ${depts.length - submitted} หน่วยงาน`)}
        ${kpiC('⚠️', anomalies.length ? '#fdecec' : '#eaf6ea', anomalies.length ? 'kpi-tint-red' : 'kpi-tint-green', 'รายการผิดปกติ',
            `${anomalies.length} <small>รายการ</small>`, anomalies.length ? '<a class="link" href="#dashExceptions">ตรวจสอบด้านล่าง ↓</a>' : 'ไม่พบความผิดปกติ')}
      </div>`

      + card(`📮 สถานะการส่งงบประมาณ — ${submitted}/${depts.length} หน่วยงานส่งแล้ว`, `
          <div class="exec-status-bar">${segs}</div>
          <div class="st-legends">${legends}</div>
          ${waiting.length ? `<div class="st-waiting">⏳ ยังไม่ส่ง: ${waitingNames} — <a class="link" href="#/acc/departments">ติดตาม →</a></div>` : ''}`)

      + `<div class="grid-2">`
      + card(`📈 งบรายเดือน ปี ${year} เทียบปี ${prevYear} (กีบ)`, `<div id="chAccMonthly"></div>`)
      + card(`🍩 สัดส่วนงบตามกลุ่มบัญชี ปี ${year}`, `<div id="chAccGroup"></div>`)
      + `</div>`
      + `<div class="grid-2">`
      + card(`🏢 งบประมาณตามหน่วยงาน (กีบ) — คลิกเพื่อ drill-down`, `<div id="chAccDept"></div>`)
      + card(`🏆 Top GL งบประมาณสูงสุด ปี ${year} (กีบ) — คลิกเพื่อ drill-down`, `<div id="chAccTopGL"></div>`)
      + `</div>`

      + `<div class="grid-2">`
      + card(`📈 Top 5 เพิ่มขึ้นสูงสุด (พร้อมเหตุผลจากหน่วยงาน)`, topInc ? `<div class="mover-list">${topInc}</div>` : '<p class="muted">ไม่มีรายการ</p>')
      + card(`📉 Top 5 ลดลงมากสุด`, topDec ? `<div class="mover-list">${topDec}</div>` : '<p class="muted">ไม่มีรายการ</p>')
      + `</div>`

      + `<div id="dashExceptions"></div>`
      + card(`⚠️ Exceptions — การเปลี่ยนแปลงผิดปกติที่ควรตรวจสอบ (${anomalies.length})`,
          anomalies.length ? `<div class="table-scroll"><table class="data-table"><thead>
            <tr><th>หน่วยงาน</th><th>GL</th><th class="num">ปี ${prevYear} (กีบ)</th><th class="num">ปี ${year} (กีบ)</th><th>%</th><th>ประเภท</th><th></th></tr></thead><tbody>
            ${anomalies.map(a => `<tr class="exc-${a.level}">
              <td>${esc(Store.dept(a.deptId).name)}</td>
              <td><span class="gl-code">${a.gl.code}</span> ${esc(a.gl.name)}</td>
              <td class="num">${fmt(a.cmp.prev)}</td><td class="num">${fmt(a.cmp.cur)}</td>
              <td>${deltaBadge(a.cmp.diff, a.cmp.pct)}</td>
              <td><span class="anomaly ${a.level}">⚠ ${a.tag}</span></td>
              <td><a class="link" href="#/acc/departments?d=${a.deptId}&gl=${a.gl.id}">ดูรายละเอียด →</a></td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted">ไม่พบการเปลี่ยนแปลงผิดปกติ ✓</p>');
  }
  function dashboardBind(user) {
    const year = UI.year(), prevYear = year - 1;
    const depts = Store.activeDepartments();
    Charts.line(document.getElementById('chAccMonthly'), Store.MONTH_S, [
      { name: `ปี ${prevYear}`, color: Charts.PREV_C, values: Store.companyMonthly(prevYear) },
      { name: `ปี ${year}`,     color: Charts.CUR_C,  values: Store.companyMonthly(year) },
    ]);
    // แท่งนอนเรียงจากมากไปน้อย — แสดง Top 15 (ทั้งบริษัท 62 แผนก ดูครบได้ที่แท็บหน่วยงาน)
    const deptBars = depts.map(d => {
      const cur = Store.deptTotal(year, d.id), prev = Store.deptTotal(prevYear, d.id);
      return { d, v: cur > 0 ? cur : prev, cur, prev };
    }).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const TOP_N = 15;
    const shown = deptBars.slice(0, TOP_N);
    const rest = deptBars.slice(TOP_N);
    const bars = shown.map(x => ({
      label: x.d.name, value: x.v, color: x.cur > 0 ? Charts.CUR_C : Charts.PREV_C,
      sub: `ปี ${prevYear}: ${Math.round(x.prev).toLocaleString()} กีบ · ปี ${year}: ${Math.round(x.cur).toLocaleString()} กีบ<br>`,
      onClick: () => { location.hash = `#/acc/departments?d=${x.d.id}`; },
    }));
    if (rest.length) {
      bars.push({
        label: `อื่นๆ อีก ${rest.length} หน่วยงาน`, value: rest.reduce((s, x) => s + x.v, 0), color: '#c3c2b7',
        sub: `ดูครบทุกหน่วยงานที่แท็บ "หน่วยงาน"<br>`,
        onClick: () => { location.hash = '#/acc/departments'; },
      });
    }
    Charts.hbar(document.getElementById('chAccDept'), bars, { labelW: 230 });
    const allGl = depts.flatMap(d => Store.deptGLs(d.id).map(g => ({ d, g, v: Store.glTotal(year, d.id, g.id) })));
    const top = allGl.filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 6);
    Charts.hbar(document.getElementById('chAccTopGL'),
      top.map(x => ({ label: `${x.g.code} ${x.g.name}`, sub: esc(x.d.name) + '<br>', value: x.v, color: Charts.CUR_C,
                      onClick: () => { location.hash = `#/acc/departments?d=${x.d.id}&gl=${x.g.id}`; } })));
    // donut ≤4 กลุ่ม + อื่นๆ
    const byGroup = {};
    allGl.forEach(x => { byGroup[x.g.glGroup] = (byGroup[x.g.glGroup] || 0) + x.v; });
    let items = Object.entries(byGroup).map(([label, value]) => ({ label, value })).filter(i => i.value > 0).sort((a, b) => b.value - a.value);
    if (items.length > 4) {
      const other = items.slice(3).reduce((s, i) => s + i.value, 0);
      items = items.slice(0, 3).concat([{ label: 'อื่นๆ', value: other }]);
    }
    items.forEach((it, i) => { it.color = it.label === 'อื่นๆ' ? '#c3c2b7' : Charts.CAT[i]; });
    Charts.donut(document.getElementById('chAccGroup'), items);
  }

  /* ============ Departments + Drill-down ============ */
  function parseQS() {
    const q = location.hash.split('?')[1] || '';
    return Object.fromEntries(new URLSearchParams(q));
  }
  function departments(user) {
    const year = UI.year(), prevYear = year - 1;
    const qs = parseQS();
    if (qs.d && qs.gl) return drillGL(user, qs.d, qs.gl);
    if (qs.d) return drillDept(user, qs.d);

    const sides = Store.db.meta.sides || {};
    const depts = Store.activeDepartments().slice().sort((a, b) => a.code.localeCompare(b.code));
    let lastSide = null;
    const rows = depts.map(d => {
      const cur = Store.deptTotal(year, d.id), prev = Store.deptTotal(prevYear, d.id);
      const cmp = Store.compare(cur, prev);
      const comp = Store.completion(year, d.id);
      const st = Store.deptState(year, d.id);
      const side = d.side || (d.code || '')[0];
      let head = '';
      if (side !== lastSide) {
        lastSide = side;
        const n = depts.filter(x => (x.side || (x.code || '')[0]) === side).length;
        head = `<tr class="side-row"><td colspan="8">${esc(sides[side] || 'อื่นๆ')} · ${n} หน่วยงาน</td></tr>`;
      }
      return `${head}<tr>
        <td><a class="link" href="#/acc/departments?d=${d.id}"><b>${esc(d.name)}</b></a><div class="muted small">${d.code}</div></td>
        <td class="num">${fmt(prev)}</td><td class="num">${fmt(cur)}</td>
        <td class="num ${cmp.diff > 0 ? 'txt-up' : cmp.diff < 0 ? 'txt-down' : ''}">${(cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff)}</td>
        <td>${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td><div class="comp-bar"><div class="comp-fill ${comp.pct === 100 ? 'full' : ''}" style="width:${comp.pct}%"></div></div>${comp.pct}%</td>
        <td>${UI.statusBadge(st.status)}</td>
        <td class="td-actions">
          <a class="link" href="#/acc/departments?d=${d.id}" title="Drill-down">ดู →</a>
          ${['SUBMITTED'].includes(st.status) ? `<button class="ghost-btn small" data-revise="${d.id}" title="ตีกลับให้แก้ไข (Need Revision)">↩ ตีกลับ</button>` : ''}
        </td></tr>`;
    }).join('');

    return pageHead(`หน่วยงานทั้งหมด — งบปี ${year}`, `Company → Department → GL → รายเดือน → เหตุผล · ${asOf()}`,
        `<button class="ghost-btn" onclick="Store.exportDeptSummary(${year})">⬇ Export CSV</button>`)
      + `<div class="breadcrumb"><b>ทุกหน่วยงาน</b></div>`
      + card('', `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>หน่วยงาน</th><th class="num">ปี ${prevYear} (กีบ)</th><th class="num">ปี ${year} (กีบ)</th>
        <th class="num">ผลต่าง (กีบ)</th><th>%</th><th>ความครบถ้วน</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`, { cls: 'card-flush' });
  }

  function drillDept(user, deptId) {
    const year = UI.year(), prevYear = year - 1;
    const rv = Store.revisePhase(year);
    const d = Store.dept(deptId);
    const st = Store.deptState(year, deptId);
    const cur = Store.deptTotal(year, deptId), prev = Store.deptTotal(prevYear, deptId);
    const cmp = Store.compare(cur, prev);
    const rows = Store.deptGLs(deptId).map(g => {
      const c2 = Store.compare(Store.glTotal(year, deptId, g.id), Store.glTotal(prevYear, deptId, g.id));
      const an = Store.glAnomaly(c2);
      const n = Store.note(year, deptId, g.id);
      const revCols = rv.on ? (() => {
        const orig = Store.originalGlTotal(year, deptId, g.id);
        const rc = Store.compare(c2.cur, orig);
        return `<td class="num">${fmt(orig)}</td><td>${deltaBadge(rc.diff, rc.pct)}</td>`;
      })() : '';
      return `<tr>
        <td><a class="link" href="#/acc/departments?d=${deptId}&gl=${g.id}"><span class="gl-code">${g.code}</span> ${esc(g.name)}</a></td>
        <td class="num">${fmt(c2.prev)}</td><td class="num">${fmt(c2.cur)}</td>${revCols}
        <td>${deltaBadge(c2.diff, c2.pct)}</td>
        <td>${an ? `<span class="anomaly ${an.level}">⚠ ${an.tag}</span>` : ''}</td>
        <td class="small">${esc((n.reason || '').slice(0, 60))}${(n.reason || '').length > 60 ? '…' : ''}</td>
        <td><a class="link" href="#/acc/departments?d=${deptId}&gl=${g.id}">รายเดือน →</a></td></tr>`;
    }).join('');

    return pageHead(esc(d.name), `งบปี ${year} เทียบปี ${prevYear} · ${UI.statusBadge(st.status)}`,
        `${['SUBMITTED'].includes(st.status) ? `<button class="danger-btn" data-revise="${deptId}">↩ ตีกลับให้แก้ไข (Need Revision)</button>` : ''}`)
      + `<div class="breadcrumb"><a href="#/acc/departments">ทุกหน่วยงาน</a> › <b>${esc(d.name)}</b></div>`
      + `<div class="kpi-grid kpi-grid-4">
        ${kpi('ปี ' + year, fmt(cur) + ' <small>กีบ</small>')}
        ${kpi('ปี ' + prevYear, fmt(prev) + ' <small>กีบ</small>')}
        ${kpi('เพิ่ม/ลด', deltaBadge(cmp.diff, cmp.pct), (cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff) + ' กีบ')}
        ${kpi('ความครบถ้วน', Store.completion(year, deptId).pct + '%', 'เป้าหมาย 100%')}
      </div>`
      + card(`แนวโน้มรายเดือน (กีบ)`, `<div id="chDrillMonthly"></div>`)
      + card(`GL ทั้งหมดของหน่วยงาน — คลิกเพื่อดูรายเดือน${rv.on ? ' · 🔁 รอบ Revise (เทียบงบเดิม)' : ''}`, `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>GL</th><th class="num">ปี ${prevYear} (กีบ)</th><th class="num">${rv.on ? 'Revise' : 'ปี'} ${year} (กีบ)</th>${rv.on ? `<th class="num">งบเดิม ${year}</th><th>Δ เดิม</th>` : ''}<th>%ปีก่อน</th><th>ตรวจสอบ</th><th>สาเหตุ (ย่อ)</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`, { cls: 'card-flush' });
  }

  function drillGL(user, deptId, glId) {
    const year = UI.year(), prevYear = year - 1;
    const d = Store.dept(deptId), g = Store.gl(glId);
    if (!d || !g) return `<div class="breadcrumb"><a href="#/acc/departments">ทุกหน่วยงาน</a></div>`
      + UI.card('ไม่พบข้อมูล', `<p>ไม่พบหน่วยงานหรือ GL ที่ระบุ — <a class="link" href="#/acc/departments">กลับไปหน้าหน่วยงาน</a></p>`);
    const mCur = Store.months(year, deptId, glId), mPrev = Store.months(prevYear, deptId, glId);
    const cur = mCur.reduce((s, v) => s + (v ?? 0), 0), prev = mPrev.reduce((s, v) => s + (v ?? 0), 0);
    const cmp = Store.compare(cur, prev);
    const an = Store.glAnomaly(cmp);
    const n = Store.note(year, deptId, glId);
    const t = Store.mtp(year, deptId, glId);
    const rows = Store.MONTH_TH.map((mo, i) => {
      const c2 = Store.compare(mCur[i] ?? 0, mPrev[i] ?? 0);
      return `<tr><td>${mo}</td>
        <td class="num">${fmt(mPrev[i])}</td>
        <td class="num">${mCur[i] === null ? '<span class="txt-warn">ยังไม่กรอก</span>' : fmt(mCur[i])}</td>
        <td>${deltaBadge(c2.diff, c2.pct)}</td></tr>`;
    }).join('');

    return pageHead(`GL ${g.code} — ${esc(g.name)}`, `${esc(d.name)} · งบปี ${year} เทียบปี ${prevYear}`)
      + `<div class="breadcrumb"><a href="#/acc/departments">ทุกหน่วยงาน</a> › <a href="#/acc/departments?d=${deptId}">${esc(d.name)}</a> › <b>GL ${g.code}</b></div>`
      + `<div class="kpi-grid kpi-grid-4">
        ${kpi('ปี ' + year, fmt(cur) + ' <small>กีบ</small>')}
        ${kpi('ปี ' + prevYear, fmt(prev) + ' <small>กีบ</small>')}
        ${kpi('เพิ่ม/ลด', deltaBadge(cmp.diff, cmp.pct), an ? `⚠ ${an.tag}` : '')}
        ${kpi(`MTP ${year + 1} / ${year + 2}`, `${UI.fmtShort(t.mtp1 ?? 0)} / ${UI.fmtShort(t.mtp2 ?? 0)}`, 'กีบ (ยอดรวมรายปี)')}
      </div>`
      + (() => {
          // แยกตามหน่วยงานย่อย (CCT) — พร้อม IO สำหรับคีย์ SAP
          const cctRows = Store.deptRows(deptId).filter(r => r.glId === glId);
          if (cctRows.length <= 1 && cctRows[0]) {
            const r = cctRows[0];
            return card('🏷 รหัสควบคุมงบ (สำหรับคีย์ SAP)', `<div class="table-scroll"><table class="data-table small">
              <thead><tr><th>หน่วยงานย่อย (CCT)</th><th>รหัส CCT</th><th>IO</th><th>code a</th></tr></thead>
              <tbody><tr><td>${esc(r.cctName)}</td><td class="gl-code">${r.cct}</td><td class="gl-code">${r.io || '—'}</td><td class="small muted">${r.codeA || '—'}</td></tr></tbody></table></div>`);
          }
          if (!cctRows.length) return '';
          return card(`🏷 แยกตามหน่วยงานย่อย (${cctRows.length} CCT) — พร้อม IO สำหรับคีย์ SAP`, `<div class="table-scroll"><table class="data-table small">
            <thead><tr><th>หน่วยงานย่อย (CCT)</th><th>IO</th><th class="num">ปี ${prevYear} (กีบ)</th><th class="num">ปี ${year} (กีบ)</th><th>%Δ</th></tr></thead><tbody>
            ${cctRows.map(r => {
              const rc = Store.compare(Store.rowTotal(year, deptId, r.key), Store.rowTotal(prevYear, deptId, r.key));
              return `<tr><td>${esc(r.cctName)}<div class="muted small">${r.cct}</div></td>
                <td class="gl-code">${r.io || '—'}</td>
                <td class="num">${fmt(rc.prev)}</td><td class="num">${fmt(rc.cur)}</td>
                <td>${deltaBadge(rc.diff, rc.pct)}</td></tr>`;
            }).join('')}
          </tbody></table></div>`);
        })()
      + `<div class="grid-2">`
      + card(`รายเดือน (กีบ)`, `<div id="chGLMonthly"></div>`)
      + card('เหตุผลประกอบงบประมาณ', `
          <div class="note-view"><div class="nv-label">สาเหตุการเพิ่ม / ลด (Reason)</div>
          <div class="nv-text">${n.reason ? esc(n.reason) : '<span class="muted">— หน่วยงานยังไม่ได้ระบุ —</span>'}</div>
          <div class="nv-label">สมมติฐาน (Assumption)</div>
          <div class="nv-text">${n.assumption ? esc(n.assumption) : '<span class="muted">— หน่วยงานยังไม่ได้ระบุ —</span>'}</div></div>
          ${an ? `<div class="anomaly-box ${an.level}">⚠ <b>${an.tag}</b> — ${an.msg}</div>` : ''}`)
      + `</div>`
      + card(`ตารางรายเดือน`, `<div class="table-scroll"><table class="data-table">
          <thead><tr><th>เดือน</th><th class="num">ปี ${prevYear} (กีบ)</th><th class="num">ปี ${year} (กีบ)</th><th>%Δ</th></tr></thead>
          <tbody>${rows}
          <tr class="tr-sum"><td><b>รวมทั้งปี</b></td><td class="num"><b>${fmt(prev)}</b></td><td class="num"><b>${fmt(cur)}</b></td><td>${deltaBadge(cmp.diff, cmp.pct)}</td></tr>
          </tbody></table></div>`, { cls: 'card-flush' })
      + (() => {
          // รายละเอียดค่าใช้จ่ายที่หน่วยงานบันทึกไว้ (ตรวจย้อนหลังได้แม้ Lock แล้ว)
          const details = Store.MONTH_TH.map((mo, i) => ({ mo, i, d: Store.cellDetail(year, deptId, glId, i) })).filter(x => x.d);
          if (!details.length) return '';
          const dRows = details.map(x =>
            x.d.items.map((it, k) => `<tr>
              ${k === 0 ? `<td rowspan="${x.d.items.length}"><b>${x.mo}</b><div class="muted small">${UI.fmtDT(x.d.updatedAt)}</div></td>` : ''}
              <td>${esc(it.desc || '—')}</td>
              <td class="num">${fmt(it.amount)}</td></tr>`).join('')
            + `<tr class="tr-sum"><td></td><td>รวม ${x.mo} (${x.d.items.length} รายการ)</td><td class="num"><b>${fmt(x.d.items.reduce((s, it) => s + it.amount, 0))}</b></td></tr>`
          ).join('');
          return card(`🧾 รายละเอียดค่าใช้จ่ายที่หน่วยงานบันทึก — ปี ${year}`, `<div class="table-scroll"><table class="data-table small">
            <thead><tr><th>เดือน</th><th>รายการค่าใช้จ่าย</th><th class="num">จำนวนเงิน (กีบ)</th></tr></thead>
            <tbody>${dRows}</tbody></table></div>`, { cls: 'card-flush' });
        })();
  }

  function departmentsBind(user) {
    const qs = parseQS();
    if (qs.d && qs.gl && document.getElementById('chGLMonthly')) {
      const year = UI.year();
      Charts.groupedBar(document.getElementById('chGLMonthly'), Store.MONTH_S, [
        { name: `ปี ${year - 1}`, color: Charts.PREV_C, values: Store.months(year - 1, qs.d, qs.gl).map(v => v ?? 0) },
        { name: `ปี ${year}`,     color: Charts.CUR_C,  values: Store.months(year, qs.d, qs.gl).map(v => v ?? 0) },
      ]);
    } else if (qs.d && document.getElementById('chDrillMonthly')) {
      const year = UI.year();
      Charts.line(document.getElementById('chDrillMonthly'), Store.MONTH_S, [
        { name: `ปี ${year - 1}`, color: Charts.PREV_C, values: Store.deptMonthly(year - 1, qs.d) },
        { name: `ปี ${year}`,     color: Charts.CUR_C,  values: Store.deptMonthly(year, qs.d) },
      ]);
    }
    document.querySelectorAll('[data-revise]').forEach(btn => btn.addEventListener('click', () => {
      const deptId = btn.dataset.revise;
      UI.modal(`ตีกลับให้แก้ไข — ${esc(Store.dept(deptId).name)}`, `
        <p>ระบุเหตุผลที่ต้องแก้ไข (จะแจ้งเตือนไปยังหน่วยงาน):</p>
        <textarea id="revNote" rows="3" placeholder="เช่น GL 635202 เดือนตุลาคม สูงผิดปกติ กรุณาตรวจสอบและระบุสมมติฐานเพิ่มเติม"></textarea>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: 'ยืนยันตีกลับ', cls: 'danger-btn', onClick: close => {
            try {
              Store.needRevision(user, UI.year(), deptId, document.getElementById('revNote').value.trim());
              toast('ตีกลับให้หน่วยงานแก้ไขแล้ว'); close(); App.render();
            } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
  }

  /* ============ Analysis ============ */
  function analysis(user) {
    const year = UI.year(), prevYear = year - 1;
    const depts = Store.activeDepartments();
    const all = depts.flatMap(d => Store.deptGLs(d.id).map(g => {
      const cmp = Store.compare(Store.glTotal(year, d.id, g.id), Store.glTotal(prevYear, d.id, g.id));
      return { d, g, cmp };
    }));
    const inc = all.filter(x => x.cmp.diff > 0).sort((a, b) => b.cmp.diff - a.cmp.diff).slice(0, 10);
    const dec = all.filter(x => x.cmp.diff < 0).sort((a, b) => a.cmp.diff - b.cmp.diff).slice(0, 10);
    const tbl = (items, title, cls) => card(title, items.length ? `<div class="table-scroll"><table class="data-table small">
        <thead><tr><th>หน่วยงาน</th><th>GL</th><th class="num">ปี ${prevYear}</th><th class="num">ปี ${year}</th><th class="num">ผลต่าง (กีบ)</th><th>%</th><th>สาเหตุ (จากหน่วยงาน)</th></tr></thead><tbody>
        ${items.map(x => `<tr>
          <td>${esc(x.d.name)}</td>
          <td><a class="link" href="#/acc/departments?d=${x.d.id}&gl=${x.g.id}"><span class="gl-code">${x.g.code}</span> ${esc(x.g.name)}</a></td>
          <td class="num">${fmt(x.cmp.prev)}</td><td class="num">${fmt(x.cmp.cur)}</td>
          <td class="num ${cls}">${(x.cmp.diff >= 0 ? '+' : '') + fmt(x.cmp.diff)}</td>
          <td>${deltaBadge(x.cmp.diff, x.cmp.pct)}</td>
          <td class="small">${esc((Store.note(year, x.d.id, x.g.id).reason || '—').slice(0, 70))}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">ไม่มีรายการ</p>');

    return pageHead(`วิเคราะห์งบประมาณ ปี ${year}`, `เทียบงบปี ${prevYear} · ${asOf()}`,
        `<button class="ghost-btn" onclick="Store.exportDetail(${year})">⬇ Export รายละเอียด CSV</button>
         <button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`)
      + tbl(inc, `📈 Top 10 งบเพิ่มขึ้นสูงสุด (ต้องมีเหตุผลรองรับ)`, 'txt-up')
      + tbl(dec, `📉 Top 10 งบลดลงมากสุด`, 'txt-down')
      + card(`งบรายเดือนทุกหน่วยงาน ปี ${year} เทียบปี ${prevYear} (กีบ)`, `<div id="chAnaMonthly"></div>`);
  }
  function analysisBind(user) {
    const year = UI.year();
    Charts.groupedBar(document.getElementById('chAnaMonthly'), Store.MONTH_S, [
      { name: `ปี ${year - 1}`, color: Charts.PREV_C, values: Store.companyMonthly(year - 1) },
      { name: `ปี ${year}`,     color: Charts.CUR_C,  values: Store.companyMonthly(year) },
    ]);
  }

  /* ============ Budget Control ============ */
  function control(user) {
    const year = UI.year();
    const periods = Store.db.budgetPeriods.slice().sort((a, b) => b.year - a.year);
    const pRows = periods.map(p => {
      const phase = p.phase === 'REVISE' ? `<span class="status-badge st-revision">🔁 REVISE · เกิดจริงถึง ด.${p.actualThru}</span> ` : '';
      return `<tr>
      <td><b>ปีงบ ${p.year}</b></td>
      <td>${phase}${p.status === 'OPEN' ? '<span class="status-badge st-progress">OPEN · เปิดรับข้อมูล</span>' : '<span class="status-badge st-locked">CLOSED · ปิดรอบแล้ว</span>'}</td>
      <td class="small">${p.lockedAt ? 'Lock เมื่อ ' + UI.fmtDT(p.lockedAt) + ' โดย ' + esc(p.lockedBy) : 'เปิดเมื่อ ' + UI.fmtDT(p.openedAt)}</td>
      <td class="td-actions">
        ${p.status === 'OPEN'
          ? `<button class="danger-btn small" data-lock="${p.year}">🔒 ปิดรอบ & Lock</button>`
          : `<button class="ghost-btn small" data-unlock="${p.year}">🔓 Unlock (สิทธิ์พิเศษ)</button>`}
        ${p.status === 'CLOSED' && p.phase !== 'REVISE'
          ? `<button class="primary-btn small" data-revise-open="${p.year}" style="padding:4px 10px;font-size:12px">🔁 เปิดรอบ Revise</button>` : ''}
        ${p.phase === 'REVISE'
          ? `<a class="ghost-btn small" href="#/acc/actuals?y=${p.year}">📥 ใส่เกิดจริง</a>` : ''}
      </td></tr>`;
    }).join('');

    const depts = Store.db.departments;
    const nActive = depts.filter(d => d.active).length;
    const dRows = depts.slice().sort((a, b) => (b.active - a.active) || a.code.localeCompare(b.code)).map(d => {
      const gls = Store.deptGLs(d.id);
      return `<tr class="${d.active ? '' : 'tr-notused'}">
        <td><b>${esc(d.name)}</b><div class="muted small">${d.code}</div></td>
        <td>${d.active ? '<span class="status-badge st-completed">เปิดใช้งาน</span>' : '<span class="status-badge st-draft">ยังไม่เปิดใช้</span>'}</td>
        <td>${gls.length} GL</td>
        <td class="small">${gls.map(g => `<span class="gl-chip">${g.code}<button class="chip-x" data-unassign="${d.id}|${g.id}" title="ถอด GL">✕</button></span>`).join(' ')}</td>
        <td class="td-actions">
          <button class="ghost-btn small" data-assign="${d.id}">＋ มอบหมาย GL</button>
          ${d.active
            ? `<button class="ghost-btn small" data-toggledept="${d.id}|0">ปิดใช้งาน</button>`
            : `<button class="primary-btn small" data-toggledept="${d.id}|1" style="padding:4px 10px;font-size:12px">▶ เปิดใช้งาน</button>`}
        </td></tr>`;
    }).join('');

    const glRows = Store.db.glAccounts.slice().sort((a, b) => a.code.localeCompare(b.code)).map(g =>
      `<tr><td><span class="gl-code">${g.code}</span></td><td>${esc(g.name)}</td><td class="small muted">${esc(g.glGroup)}</td>
       <td class="small muted">${esc(g.ioGroup || 'ไม่คุม')}</td></tr>`).join('');
    const glGroups = [...new Set(Store.db.glAccounts.map(g => g.glGroup).filter(Boolean))].sort();

    const rates = Store.db.exchangeRates.filter(r => r.year === year);

    const syncOn = Sync.enabled();
    return pageHead('Budget Control', `จัดการรอบงบประมาณ หน่วยงาน GL และ Budget Rate · Admin เท่านั้น`)
      + card('🔗 เชื่อมต่อ Google Sheet (Apps Script Backend)', `
          <p style="margin-bottom:8px">${syncOn
            ? `สถานะ: ${Sync.chipHtml()} — ข้อมูลทุกการแก้ไขจะซิงค์ขึ้น Google Sheet อัตโนมัติ`
            : `ยังไม่ได้เชื่อมต่อ — ติดตั้งตามขั้นตอนนี้ (ทำครั้งเดียว ~2 นาที):`}</p>
          ${syncOn ? '' : `<ol class="setup-steps">
            <li>เปิดชีท <a class="link" href="https://docs.google.com/spreadsheets/d/1KiE6hk3FJTF4QSk_nYgUwYXynCFFE__J3pcTBdeRhDo/edit" target="_blank">บัญชี (ดาต้าเบสหลัก)</a> → เมนู <b>ส่วนขยาย → Apps Script</b></li>
            <li>ลบโค้ดเดิม แล้ววางโค้ดจากไฟล์ <code>apps-script\\Code.gs</code> (ในโฟลเดอร์แอปนี้) → กด Save</li>
            <li>กด <b>Deploy → New deployment → Web app</b> · Execute as: <b>Me</b> · Who has access: <b>Anyone</b> → Deploy → อนุญาตสิทธิ์</li>
            <li>คัดลอก <b>Web app URL</b> (ลงท้าย /exec) มาวางด้านล่าง → กด "บันทึก & ทดสอบ"</li>
          </ol>`}
          <div class="inline-form">
            <input id="gasUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(Sync.url())}" style="flex:1;min-width:320px">
            <button class="primary-btn" id="gasSave">บันทึก & ทดสอบ</button>
            ${syncOn ? `<button class="ghost-btn" id="gasPull">⬇ ดึงจากชีท</button>
            <button class="ghost-btn" id="gasPush">⬆ ส่งขึ้นชีทเดี๋ยวนี้</button>
            <button class="ghost-btn" id="gasOff">ยกเลิกการเชื่อมต่อ</button>` : ''}
          </div>`)
      + card('รอบงบประมาณ (Budget Periods)', `
          <div class="table-scroll"><table class="data-table"><thead><tr><th>ปีงบ</th><th>สถานะ</th><th>ประวัติ</th><th></th></tr></thead><tbody>${pRows}</tbody></table></div>
          <div class="inline-form"><input id="newPeriodYear" inputmode="numeric" placeholder="เช่น ${Math.max(...periods.map(p => p.year)) + 1}" style="width:120px">
          <button class="primary-btn" id="openPeriodBtn">＋ เปิดรอบงบประมาณปีใหม่</button></div>`)
      + card(`หน่วยงาน (Departments) — เปิดใช้งาน ${nActive} / ${depts.length} หน่วยงาน (ตามฟอร์ม ML_Form 2026)`, `
          <div class="table-scroll"><table class="data-table"><thead><tr><th>หน่วยงาน</th><th>สถานะ</th><th>จำนวน</th><th>GL ที่มอบหมาย</th><th></th></tr></thead><tbody>${dRows}</tbody></table></div>
          <div class="inline-form"><input id="newDeptCode" placeholder="รหัส เช่น 1133" style="width:110px">
          <input id="newDeptName" placeholder="ชื่อหน่วยงาน เช่น แผนกวิเคราะห์คุณภาพ" style="width:280px">
          <button class="primary-btn" id="addDeptBtn">＋ เพิ่มหน่วยงาน</button></div>`)
      + card(`GL Master (${Store.db.glAccounts.length} รายการ) — อ้างอิงจากไฟล์ ML_Form`, `
          <div class="table-scroll" style="max-height:260px"><table class="data-table small"><thead><tr><th>รหัส</th><th>ชื่อบัญชี</th><th>กลุ่ม</th><th>กลุ่ม IO</th></tr></thead><tbody>${glRows}</tbody></table></div>
          <div class="inline-form" style="margin-top:10px">
            <input id="newGlCode" inputmode="numeric" placeholder="รหัส เช่น 636500" style="width:130px">
            <input id="newGlName" placeholder="ชื่อบัญชี" style="width:250px">
            <input id="newGlGroup" list="glGroupList" placeholder="กลุ่มบัญชี" style="width:190px">
            <datalist id="glGroupList">${glGroups.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
            <input id="newGlIo" inputmode="numeric" maxlength="2" placeholder="กลุ่ม IO" title="รหัสกลุ่ม IO 2 หลัก (เว้นว่าง = ไม่คุม)" style="width:90px">
            <button class="primary-btn" id="addGlBtn">＋ เพิ่ม GL</button>
          </div>
          <p class="muted small" style="margin-top:6px">กลุ่ม IO = รหัส 2 หลักตามชีท ML&amp;SF (ใช้ประกอบเลข IO อัตโนมัติตอนมอบหมาย GL) · เว้นว่างถ้า GL นี้ไม่คุมงบด้วย IO</p>`)
      + card(`Budget Exchange Rate ปี ${year} (Reference Rate ทางการ)`, `
          <div class="table-scroll"><table class="data-table small"><thead><tr><th>สกุลเงิน</th><th class="num">กีบ / 1 หน่วย</th><th></th></tr></thead><tbody>
          ${rates.map(r => `<tr><td>${r.currency}</td><td class="num">${fmt(r.rateToLAK)}</td>
            <td><button class="ghost-btn small" data-editrate="${r.currency}">แก้ไข</button></td></tr>`).join('')}
          </tbody></table></div>`)
      + card(`⛽ ราคากลางน้ำมัน ปี ${year}`, `
          <div class="table-scroll"><table class="data-table small"><thead><tr><th>ชนิดน้ำมัน</th><th class="num">กีบ / ลิตร</th><th></th></tr></thead><tbody>
          ${Store.db.fuelPrices.filter(f => f.year === year).map(f => `<tr><td>${esc(f.fuelType)}</td><td class="num">${fmt(f.pricePerLiter)}</td>
            <td><button class="ghost-btn small" data-editfuel="${esc(f.fuelType)}">แก้ไข</button></td></tr>`).join('')}
          </tbody></table></div>
          <p class="muted small" style="margin-top:8px">ราคานี้แสดงในเครื่องมือคำนวณของทุกหน่วยงาน</p>`)
      + card('ข้อมูลจำลอง (Demo)', `
          <div class="td-actions">
            <button class="danger-btn" id="clearAllBtn">🧹 ล้างข้อมูลจำลองปี ${year} ทุกหน่วยงาน</button>
            <button class="ghost-btn" id="resetDemoBtn">↺ รีเซ็ตกลับข้อมูลจำลองตั้งต้น</button>
          </div>
          <p class="muted small" style="margin-top:8px">
            🧹 = ล้างตัวเลข/เหตุผล/รายละเอียดปี ${year} ของทุกหน่วยงาน → ฟอร์มเปล่า สถานะ Draft (ใช้ก่อนเปิดกรอกจริง · งบปี ${year - 1} baseline ไม่ถูกแตะ)<br>
            ↺ = คืนข้อมูลจำลองทั้งหมดกลับมาเหมือนเดิม (สำหรับทดลอง/ออกแบบ)</p>`);
  }
  function controlBind(user) {
    document.getElementById('gasSave')?.addEventListener('click', async () => {
      const u = document.getElementById('gasUrl').value.trim();
      if (!u) { toast('วาง Web app URL ก่อน (ลงท้าย /exec)', 'err'); return; }
      if (!/^https:\/\/script\.google\.com\/.+\/exec/.test(u)) { toast('URL ไม่ถูกต้อง — ต้องเป็น URL ของ Apps Script ที่ลงท้าย /exec', 'err'); return; }
      Sync.setUrl(u);
      toast('กำลังทดสอบการเชื่อมต่อ…');
      try {
        const r = await Sync.ping();
        if (!r.ok) throw new Error(r.reason || 'ping ล้มเหลว');
        toast(`เชื่อมต่อสำเร็จ ✓ (ชีท: ${r.sheet}) — กำลังซิงค์ข้อมูล…`);
        await Sync.pull();
        App.render();
      } catch (e) {
        Sync.setUrl('');
        toast('เชื่อมต่อไม่สำเร็จ: ' + e.message + ' — ตรวจว่า Deploy แบบ Anyone แล้ว', 'err');
        App.render();
      }
    });
    document.getElementById('gasPull')?.addEventListener('click', async () => {
      try { const r = await Sync.pull(); toast(r.adopted ? 'ดึงข้อมูลล่าสุดจากชีทแล้ว' : 'ข้อมูลตรงกันอยู่แล้ว ✓'); App.render(); }
      catch (e) { toast('ดึงไม่สำเร็จ: ' + e.message, 'err'); }
    });
    document.getElementById('gasPush')?.addEventListener('click', async () => {
      await Sync.push(true);
      toast(Sync.state.mode === 'ok' ? 'ส่งข้อมูลขึ้น Google Sheet แล้ว ✓' : 'ส่งไม่สำเร็จ — ' + (Sync.state.error || ''), Sync.state.mode === 'ok' ? 'ok' : 'err');
    });
    document.getElementById('gasOff')?.addEventListener('click', () => {
      UI.confirm2('ยกเลิกการเชื่อมต่อ Google Sheet?', 'แอปจะกลับไปเก็บข้อมูลใน browser เครื่องนี้เท่านั้น', 'ข้อมูลบนชีทไม่ถูกลบ เชื่อมต่อใหม่ได้ทุกเมื่อ',
        () => { Sync.setUrl(''); toast('ยกเลิกการเชื่อมต่อแล้ว'); App.render(); });
    });

    document.querySelectorAll('[data-lock]').forEach(b => b.addEventListener('click', () => {
      const y = b.dataset.lock;
      UI.confirm2(`ปิดรอบงบประมาณปี ${y}?`,
        `Are you sure you want to lock the ${y} Budget?`,
        'ทุกหน่วยงานจะถูก Lock และผู้ใช้จะไม่สามารถแก้ไขงบประมาณได้อีก',
        () => { try { Store.lockPeriod(user, y); toast(`Lock งบปี ${y} แล้ว`); App.render(); } catch (e) { toast(e.message, 'err'); } });
    }));
    document.querySelectorAll('[data-unlock]').forEach(b => b.addEventListener('click', () => {
      const y = b.dataset.unlock;
      UI.modal(`🔓 Unlock รอบงบประมาณปี ${y} (สิทธิ์พิเศษ)`, `
        <p class="warn-text">⚠ การ Unlock จะเปิดให้หน่วยงานแก้ไขข้อมูลได้อีกครั้ง และถูกบันทึกใน Audit Log</p>
        <p>พิมพ์ <b>UNLOCK</b> เพื่อยืนยัน:</p><input id="unlockConfirm" placeholder="UNLOCK">`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: 'ยืนยัน Unlock', cls: 'danger-btn', onClick: close => {
            if (document.getElementById('unlockConfirm').value.trim() !== 'UNLOCK') { toast('กรุณาพิมพ์ UNLOCK เพื่อยืนยัน', 'err'); return; }
            try { Store.unlockPeriod(user, y); toast(`Unlock งบปี ${y} แล้ว`); close(); App.render(); } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
    document.getElementById('openPeriodBtn')?.addEventListener('click', () => {
      const y = Number(document.getElementById('newPeriodYear').value);
      if (!y || y < 2000 || y > 2100) { toast('กรุณาระบุปี ค.ศ. ให้ถูกต้อง', 'err'); return; }
      try { Store.openPeriod(user, y); toast(`เปิดรอบงบปี ${y} แล้ว`); App.render(); } catch (e) { toast(e.message, 'err'); }
    });
    document.getElementById('addDeptBtn')?.addEventListener('click', () => {
      const code = document.getElementById('newDeptCode').value.trim(), name = document.getElementById('newDeptName').value.trim();
      if (!code || !name) { toast('กรอกรหัสและชื่อหน่วยงาน', 'err'); return; }
      try { Store.addDepartment(user, code, name); toast('เพิ่มหน่วยงานแล้ว'); App.render(); } catch (e) { toast(e.message, 'err'); }
    });
    document.getElementById('addGlBtn')?.addEventListener('click', () => {
      const code = document.getElementById('newGlCode').value.trim();
      const name = document.getElementById('newGlName').value.trim();
      const grp = document.getElementById('newGlGroup').value.trim();
      const iog = document.getElementById('newGlIo').value.trim();
      if (!/^\d{6,7}$/.test(code)) { toast('รหัส GL ต้องเป็นตัวเลข 6-7 หลัก', 'err'); return; }
      if (!name) { toast('กรอกชื่อบัญชี', 'err'); return; }
      if (iog && !/^\d{2}$/.test(iog)) { toast('กลุ่ม IO ต้องเป็นตัวเลข 2 หลัก หรือเว้นว่าง (= ไม่คุม)', 'err'); return; }
      try {
        Store.addGL(user, code, name, grp, iog);
        toast(`เพิ่ม GL ${code} ${name} แล้ว — มอบหมายให้หน่วยงานได้ที่ปุ่ม "＋ GL" ในการ์ดหน่วยงาน`);
        App.render();
      } catch (e) { toast(e.message, 'err'); }
    });
    document.querySelectorAll('[data-assign]').forEach(b => b.addEventListener('click', () => {
      const deptId = b.dataset.assign;
      const assigned = new Set(Store.deptGLs(deptId).map(g => g.id));
      const avail = Store.db.glAccounts.filter(g => g.active && !assigned.has(g.id)).sort((a, b2) => a.code.localeCompare(b2.code));
      if (!avail.length) { toast('ไม่มี GL ที่ยังไม่ได้มอบหมาย — เพิ่ม GL Master ก่อน', 'err'); return; }
      UI.modal(`มอบหมาย GL → ${esc(Store.dept(deptId).name)}`,
        `<select id="assignSel" size="8" style="width:100%">${avail.map(g => `<option value="${g.id}">${g.code} — ${esc(g.name)}</option>`).join('')}</select>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: 'มอบหมาย', cls: 'primary-btn', onClick: close => {
            const glId = document.getElementById('assignSel').value;
            if (!glId) { toast('เลือก GL ก่อน', 'err'); return; }
            try { Store.assignGL(user, deptId, glId); toast('มอบหมาย GL แล้ว'); close(); App.render(); } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
    document.querySelectorAll('[data-toggledept]').forEach(b => b.addEventListener('click', () => {
      const [deptId, on] = b.dataset.toggledept.split('|');
      const d = Store.dept(deptId);
      const activate = on === '1';
      const doIt = () => {
        try {
          Store.toggleDepartment(user, deptId, activate);
          toast((activate ? 'เปิดใช้งาน ' : 'ปิดใช้งาน ') + d.name + ' แล้ว' + (activate && !Store.deptGLs(deptId).length ? ' — อย่าลืมมอบหมาย GL' : ''));
          App.render();
        } catch (e) { toast(e.message, 'err'); }
      };
      if (!activate) UI.confirm2(`ปิดใช้งาน ${esc(d.name)}?`, 'หน่วยงานจะหายจาก Dashboard และรายงานรวม', 'ข้อมูลที่กรอกไว้ไม่ถูกลบ เปิดใช้ใหม่ได้ทุกเมื่อ', doIt);
      else doIt();
    }));

    document.querySelectorAll('[data-unassign]').forEach(b => b.addEventListener('click', () => {
      const [deptId, glId] = b.dataset.unassign.split('|');
      try { Store.unassignGL(user, deptId, glId); toast('ถอด GL แล้ว'); App.render(); } catch (e) { toast(e.message, 'err'); }
    }));
    document.querySelectorAll('[data-editrate]').forEach(b => b.addEventListener('click', () => {
      const cur = b.dataset.editrate;
      const r = Store.db.exchangeRates.find(x => x.year === UI.year() && x.currency === cur);
      UI.modal(`แก้ไข Budget Rate — ${cur} ปี ${UI.year()}`,
        `<label class="fld"><span>กีบ / 1 ${cur}</span><input id="rateVal" inputmode="decimal" value="${r.rateToLAK}"></label>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: 'บันทึก', cls: 'primary-btn', onClick: close => {
            const v = Number(String(document.getElementById('rateVal').value).replace(/,/g, ''));
            if (!isFinite(v) || v <= 0) { toast('ค่าไม่ถูกต้อง', 'err'); return; }
            try { Store.setRate(user, UI.year(), cur, v); toast('บันทึก Rate แล้ว'); close(); App.render(); } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
    document.querySelectorAll('[data-revise-open]').forEach(b => b.addEventListener('click', () => {
      const y = b.dataset.reviseOpen;
      UI.modal(`🔁 เปิดรอบ Revise งบประมาณปี ${y}`, `
        <p>ระบบจะ <b>เก็บงบเดิมทั้งปีไว้เป็นหลักฐานถาวร (snapshot)</b> แล้วเปิดให้ทุกหน่วยงานปรับคาดการณ์อีกครั้ง</p>
        <label class="fld"><span>มีตัวเลขเกิดจริงถึงเดือนที่</span>
          <select id="revThru">${Store.MONTH_TH.map((m, i) => `<option value="${i + 1}" ${i + 1 === 4 ? 'selected' : ''}>เดือน ${i + 1} — ${m}</option>`).join('')}</select></label>
        <p class="muted small">เดือน 1 ถึงเดือนก่อนหน้า = ล็อกสนิทเป็นเกิดจริง · เดือนสุดท้ายที่เลือก = หน่วยงานเพิ่มได้แต่ลดต่ำกว่าเกิดจริงไม่ได้ · เดือนที่เหลือ = ปรับคาดการณ์ได้</p>
        <p class="warn-text">⚠ หลังเปิดรอบ สถานะทุกหน่วยงานจะกลับเป็น "กำลังจัดทำ" และต้องส่งข้อมูลอีกครั้ง</p>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: '🔁 ยืนยันเปิดรอบ Revise', cls: 'primary-btn', onClick: close => {
            try {
              Store.openRevise(user, y, Number(document.getElementById('revThru').value));
              toast(`เปิดรอบ Revise ปี ${y} แล้ว — ไปใส่ตัวเลขเกิดจริงต่อได้เลย`); close();
              location.hash = '#/acc/actuals?y=' + y;
            } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
    document.querySelectorAll('[data-editfuel]').forEach(b => b.addEventListener('click', () => {
      const ft = b.dataset.editfuel;
      const f = Store.db.fuelPrices.find(x => x.year === UI.year() && x.fuelType === ft);
      UI.modal(`แก้ไขราคากลางน้ำมัน — ${esc(ft)} ปี ${UI.year()}`,
        `<label class="fld"><span>กีบ / ลิตร</span><input id="fuelVal" inputmode="decimal" value="${f.pricePerLiter}"></label>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: 'บันทึก', cls: 'primary-btn', onClick: close => {
            const v = Number(String(document.getElementById('fuelVal').value).replace(/,/g, ''));
            if (!isFinite(v) || v <= 0) { toast('ค่าไม่ถูกต้อง', 'err'); return; }
            try { Store.setFuelPrice(user, UI.year(), ft, v); toast('บันทึกราคาน้ำมันแล้ว'); close(); App.render(); } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
    document.getElementById('clearAllBtn')?.addEventListener('click', () => {
      const y = UI.year();
      UI.modal(`🧹 ล้างข้อมูลจำลองปี ${y} ทุกหน่วยงาน`, `
        <p>ตัวเลขทุกเดือน, MTP, เหตุผล/สมมติฐาน และรายละเอียดค่าใช้จ่าย <b>ของทั้ง ${Store.activeDepartments().length} หน่วยงาน</b>
        จะถูกล้างเป็นฟอร์มเปล่า สถานะกลับเป็น Draft (งบปี ${y - 1} ไม่ถูกแตะ)</p>
        <p class="warn-text">⚠ การกระทำนี้ย้อนกลับไม่ได้ และมีผลกับ Google Sheet ทันที</p>
        <p>พิมพ์ <b>CLEAR</b> เพื่อยืนยัน:</p><input id="clearAllConfirm" placeholder="CLEAR" autocomplete="off">`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: '🧹 ยืนยันล้างทุกหน่วยงาน', cls: 'danger-btn', onClick: close => {
            if (document.getElementById('clearAllConfirm').value.trim().toUpperCase() !== 'CLEAR') { toast('กรุณาพิมพ์ CLEAR เพื่อยืนยัน', 'err'); return; }
            try {
              const n = Store.clearAllDeptYear(user, y);
              toast(`ล้างข้อมูลปี ${y} แล้ว (${n} รายการ GL ทั้ง ${Store.activeDepartments().length} หน่วยงาน) — พร้อมเปิดกรอกจริง`);
              close(); App.render();
            } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    });
    document.getElementById('resetDemoBtn')?.addEventListener('click', () => {
      UI.confirm2('รีเซ็ตข้อมูลสาธิต?', 'ข้อมูลที่แก้ไขทั้งหมดจะถูกล้าง กลับเป็นข้อมูลตั้งต้นจากไฟล์ Excel', 'การกระทำนี้ย้อนกลับไม่ได้',
        () => { Store.resetDemo(); toast('รีเซ็ตแล้ว'); App.render(); });
    });
  }

  /* ============ ใส่ตัวเลขเกิดจริง (รอบ Revise — บัญชีเท่านั้น) ============ */
  function actuals(user) {
    const qs = parseQS();
    const year = Number(qs.y) || UI.year();
    const rv = Store.revisePhase(year);
    if (!rv.on) {
      return pageHead(`ตัวเลขเกิดจริง ปี ${year}`, 'ยังไม่ได้เปิดรอบ Revise')
        + card('', `<p>ปี ${year} ยังไม่ได้เปิดรอบ Revise — ไปที่ <a class="link" href="#/acc/control">Budget Control</a> แล้วกด "🔁 เปิดรอบ Revise" ก่อน</p>`);
    }
    const deptId = qs.d || Store.activeDepartments()[0]?.id;
    const deptOpts = Store.activeDepartments().map(d =>
      `<option value="${d.id}" ${d.id === deptId ? 'selected' : ''}>${esc(d.name)} (${d.code})</option>`).join('');
    const monthCols = Array.from({ length: rv.thru }, (_, i) => i);
    const rows = Store.deptRows(deptId).map(r => {
      const am = Store.actualMonths(year, deptId, r.key);
      const cells = monthCols.map(mi =>
        `<td class="num cell-td"><input class="cell act-cell" data-row="${r.key}" data-m="${mi}" inputmode="decimal"
           value="${am[mi] === null ? '' : fmt(am[mi])}" placeholder="กรอก"></td>`).join('');
      const filled = monthCols.filter(mi => am[mi] !== null).length;
      return `<tr>
        <td class="sticky-col td-gl" title="IO ${r.io}"><div class="gl-name-wrap">
          <span class="gl-code">${r.gl.code}</span><span class="gl-nm" title="${esc(r.gl.name)}">${esc(r.gl.name)}</span></div>
          ${r.multiCct ? `<div class="cct-tag">↳ ${esc(r.cctName)}</div>` : ''}</td>
        ${cells}
        <td class="small ${filled === rv.thru ? 'txt-ok' : 'txt-warn'}">${filled}/${rv.thru}</td></tr>`;
    }).join('');

    return pageHead(`📥 ใส่ตัวเลขเกิดจริง ปี ${year} (เดือน 1–${rv.thru})`,
        `รอบ Revise · บัญชีเท่านั้น · บันทึกแล้วช่องของหน่วยงานถูกล็อก/ตั้งพื้นอัตโนมัติ · ${asOf()}`)
      + `<div class="breadcrumb"><a href="#/acc/control">Budget Control</a> › <b>ใส่เกิดจริง</b></div>`
      + card('เลือกหน่วยงาน', `<select id="actDeptSel" style="font:inherit;padding:8px 10px;border:1px solid var(--border-strong);border-radius:8px;min-width:320px">${deptOpts}</select>`)
      + card(`ตารางเกิดจริง — ${esc(Store.dept(deptId).name)}`, `
          <div class="table-scroll" style="max-height:55vh"><table class="budget-table" style="min-width:${260 + rv.thru * 100}px"><thead><tr>
            <th class="sticky-col th-gl">GL / บัญชี</th>
            ${monthCols.map(mi => `<th class="num th-m">${Store.MONTH_S[mi]}<div class="th-yr">เกิดจริง ${year}</div></th>`).join('')}
            <th>ครบ</th></tr></thead><tbody>${rows}</tbody></table></div>`, { cls: 'card-flush' })
      + card('📋 วางจาก Excel ทีเดียว (ทุกหน่วยงาน)', `
          <p class="muted small">รูปแบบต่อบรรทัด: <code>code a</code> ตามด้วยตัวเลขเดือน 1–${rv.thru} (คั่นด้วย Tab) — หรือ <code>CCT [Tab] รหัส GL</code> ตามด้วยตัวเลข</p>
          <textarea id="actPaste" rows="6" placeholder="8003310100635202a\t45000000\t120000000\t8000000\t65000000" style="font-family:monospace;font-size:12px"></textarea>
          <button class="primary-btn" id="actPasteBtn" style="margin-top:8px">📥 นำเข้าเกิดจริง</button>`);
  }
  function actualsBind(user) {
    const qs = parseQS();
    const year = Number(qs.y) || UI.year();
    const deptId = qs.d || Store.activeDepartments()[0]?.id;
    document.getElementById('actDeptSel')?.addEventListener('change', e => {
      location.hash = `#/acc/actuals?y=${year}&d=${e.target.value}`;
    });
    const parseNum = s => { s = String(s).replace(/[,\s]/g, '').trim(); if (s === '') return null; const v = Number(s); return isFinite(v) ? v : NaN; };
    document.querySelectorAll('.act-cell').forEach(inp => {
      inp.addEventListener('focus', () => { inp.value = inp.value.replace(/,/g, ''); inp.select(); });
      inp.addEventListener('blur', () => {
        const v = parseNum(inp.value);
        if (Number.isNaN(v)) { toast('รูปแบบตัวเลขไม่ถูกต้อง', 'err'); return; }
        try {
          Store.setActual(user, year, deptId, inp.dataset.row, Number(inp.dataset.m), v);
          inp.value = v === null ? '' : UI.fmt(v);
          inp.classList.add('cell-changed');
        } catch (e) { toast(e.message, 'err'); }
      });
    });
    document.getElementById('actPasteBtn')?.addEventListener('click', () => {
      const text = document.getElementById('actPaste').value;
      if (!text.trim()) { toast('วางข้อมูลก่อน', 'err'); return; }
      try {
        const r = Store.pasteActuals(user, year, text);
        toast(`นำเข้าแล้ว ${r.matched} แถว${r.unmatched.length ? ` · จับคู่ไม่ได้ ${r.unmatched.length} แถว (${r.unmatched.slice(0, 3).join(', ')}…)` : ''}`,
          r.unmatched.length ? 'err' : 'ok');
        App.render();
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  /* ============ Audit Log ============ */
  function audit(user) {
    const logs = Store.db.auditLogs.slice(0, 300);
    const rows = logs.map(l => `<tr>
      <td class="small">${UI.fmtDT(l.ts)}</td>
      <td>${esc(l.userName)}</td>
      <td>${esc(l.action)}</td>
      <td>${l.deptId ? esc(Store.dept(l.deptId)?.name || l.deptId) : '—'}</td>
      <td>${l.glCode ? `<span class="gl-code">${l.glCode}</span>` : '—'}</td>
      <td>${l.month ? Store.MONTH_TH[l.month - 1] : '—'}</td>
      <td class="num">${l.oldValue !== null && typeof l.oldValue === 'number' ? fmt(l.oldValue) : esc(l.oldValue ?? '—')}</td>
      <td class="num">${l.newValue !== null && typeof l.newValue === 'number' ? fmt(l.newValue) : esc(String(l.newValue ?? '—').slice(0, 40))}</td>
    </tr>`).join('');
    return pageHead('Audit Log', `บันทึกการเปลี่ยนแปลงทั้งหมด (read-only) · แสดง ${logs.length} รายการล่าสุด`)
      + card('', `<div class="table-scroll"><table class="data-table small">
        <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>หน่วยงาน</th><th>GL</th><th>เดือน</th><th class="num">ค่าเดิม</th><th class="num">ค่าใหม่</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`, { cls: 'card-flush' });
  }

  return { dashboard, dashboardBind, departments, departmentsBind, analysis, analysisBind, control, controlBind, audit, actuals, actualsBind };
})();

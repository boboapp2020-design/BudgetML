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
    ENDORSED:      { label: 'ผจก.รับรองแล้ว', color: '#0d9488' },
    LOCKED:        { label: 'ปิดรอบแล้ว',     color: '#52514e' },
    COMPLETED:     { label: 'ครบ รอส่ง',      color: '#0ca30c' },
    IN_PROGRESS:   { label: 'กำลังกรอก',      color: '#eda100' },
    NEED_REVISION: { label: 'ตีกลับแก้ไข',    color: '#d03b3b' },
    DRAFT:         { label: 'ยังไม่เริ่ม',    color: '#c3c2b7' },
  };

  /* ============ Executive Dashboard (v3.6) ============ */
  const SIDE_META = {
    '1': { c: '#2a78d6', bg: '#e8f1fc', icon: '🏢' },
    '2': { c: '#13a06d', bg: '#e6f7f0', icon: '🌾' },
    '3': { c: '#eb6834', bg: '#fdeee6', icon: '🏭' },
    '4': { c: '#8b5cf6', bg: '#f1ecfd', icon: '🗂️' },
  };
  // ตัวเลขอ่านง่ายสำหรับผู้บริหาร: 1.36 ล้านล้าน / 45.2 พันล้าน / 8.4 ล้าน
  const thShort = v => {
    const a = Math.abs(v), sign = v < 0 ? '−' : '';
    if (a >= 1e12) return sign + (a / 1e12).toFixed(2) + ' ล้านล้าน';
    if (a >= 1e9)  return sign + (a / 1e9).toFixed(1) + ' พันล้าน';
    if (a >= 1e6)  return sign + (a / 1e6).toFixed(1) + ' ล้าน';
    return sign + fmt(a);
  };

  function dashboard(user) {
    const year = UI.year(), prevYear = year - 1;
    const depts = Store.activeDepartments();
    const rv = Store.revisePhase(year);
    const pd = Store.db.budgetPeriods.find(x => x.year === year) || {};
    const cur = Store.companyTotal(year);

    // ---------- เกิดจริงสะสม ----------
    const actuals = (Store.db.actuals || []).filter(a => a.year === year);
    const actTotal = actuals.reduce((s, a) => s + a.months.reduce((x, v) => x + (v || 0), 0), 0);
    const actDeptN = new Set(actuals.map(a => a.departmentId)).size;
    const actPct = cur > 0 ? actTotal / cur * 100 : 0;

    // ---------- งบเดิม (snapshot) เทียบ Revise ----------
    const origTotal = rv.on ? depts.reduce((s, d) => s + Store.originalDeptTotal(year, d.id), 0) : 0;
    const rvDiff = rv.on ? cur - origTotal : 0;
    const rvPct = rv.on && origTotal > 0 ? rvDiff / origTotal * 100 : 0;

    // ---------- MTP ปี +1 / +2 ----------
    const bs = Store.db.budgets.filter(b => b.year === year);
    const mtp1 = bs.reduce((s, b) => s + (typeof b.mtp1 === 'number' ? b.mtp1 : 0), 0);
    const mtp2 = bs.reduce((s, b) => s + (typeof b.mtp2 === 'number' ? b.mtp2 : 0), 0);

    // ---------- สถานะแผนก ----------
    const states = depts.map(d => ({ d, st: Store.deptState(year, d.id).status }));
    const cnt = {};
    states.forEach(x => { cnt[x.st] = (cnt[x.st] || 0) + 1; });
    const submitted = (cnt.SUBMITTED || 0) + (cnt.ENDORSED || 0) + (cnt.LOCKED || 0);
    const stOrder = ['SUBMITTED', 'ENDORSED', 'LOCKED', 'COMPLETED', 'IN_PROGRESS', 'NEED_REVISION', 'DRAFT'];
    const segs = stOrder.filter(s => cnt[s]).map(s =>
      `<div class="status-seg" style="flex:${cnt[s]};background:${ST_META[s].color}" title="${ST_META[s].label}: ${cnt[s]} หน่วยงาน"></div>`).join('');
    const legends = stOrder.filter(s => cnt[s]).map(s =>
      `<span class="st-legend"><span class="dl-dot" style="background:${ST_META[s].color}"></span>${ST_META[s].label} <b>${cnt[s]}</b></span>`).join('');
    const waiting = states.filter(x => !['SUBMITTED', 'LOCKED'].includes(x.st));
    const waitingNames = waiting.slice(0, 20).map(x => esc(x.d.name.replace('แผนก', ''))).join(' · ')
      + (waiting.length > 20 ? ` · และอีก ${waiting.length - 20} แผนก` : '');

    // ---------- สรุปรายด้าน (4 ด้าน) ----------
    const sides = Store.db.meta.sides || {};
    const sideAgg = {};
    depts.forEach(d => {
      const s = d.side || (d.code || '')[0];
      const t = Store.deptTotal(year, d.id);
      const a = sideAgg[s] = sideAgg[s] || { total: 0, n: 0, top: null };
      a.total += t; a.n++;
      if (!a.top || t > a.top.t) a.top = { name: d.name, t };
    });
    const sideCards = Object.keys(sideAgg).sort().map(s => {
      const a = sideAgg[s], m = SIDE_META[s] || SIDE_META['1'];
      const share = cur > 0 ? a.total / cur * 100 : 0;
      return `<a class="side-card" style="--sc:${m.c};--scbg:${m.bg}" href="#/acc/departments">
        <div class="sc-head"><span>${m.icon}</span> ${esc(sides[s] || 'อื่นๆ')} <span class="sc-n">${a.n} แผนก</span></div>
        <div class="sc-val">${thShort(a.total)} <small>กีบ</small></div>
        <div class="sc-bar"><i style="width:${Math.max(2, share).toFixed(1)}%"></i></div>
        <div class="sc-sub">${share.toFixed(1)}% ของทั้งบริษัท · สูงสุด: ${esc((a.top ? a.top.name : '—').replace('แผนก', ''))}</div>
      </a>`;
    }).join('');

    // ---------- Top movers: ช่วง Revise เทียบ "งบเดิม" / ปกติเทียบปีก่อน ----------
    const moverRow = x => {
      const reason = (Store.note(year, x.d.id, x.g.id).reason || '').trim();
      return `<a class="mover-row" href="#/acc/departments?d=${x.d.id}&gl=${x.g.id}">
        <span class="mv-main"><b><span class="gl-code">${x.g.code}</span> ${esc(x.g.name)}</b>
          <small>${esc(x.d.name)}${reason ? ' · 💬 ' + esc(reason.slice(0, 55)) + (reason.length > 55 ? '…' : '') : ''}</small></span>
        <span class="mv-val"><span class="num">${(x.cmp.diff >= 0 ? '+' : '') + UI.fmtShort(x.cmp.diff)}</span>${deltaBadge(x.cmp.diff, x.cmp.pct)}</span></a>`;
    };
    let movers;
    if (rv.on) {
      movers = depts.flatMap(d => Store.deptGLs(d.id).map(g => ({
        d, g, cmp: Store.compare(Store.glTotal(year, d.id, g.id), Store.originalGlTotal(year, d.id, g.id)),
      }))).filter(x => Math.abs(x.cmp.diff) > 0.5);
    } else {
      movers = depts.filter(d => Store.deptTotal(prevYear, d.id) > 0)
        .flatMap(d => Store.deptGLs(d.id).map(g => ({
          d, g, cmp: Store.compare(Store.glTotal(year, d.id, g.id), Store.glTotal(prevYear, d.id, g.id)),
        })));
    }
    const topInc = movers.filter(x => x.cmp.diff > 0).sort((a, b) => b.cmp.diff - a.cmp.diff).slice(0, 5).map(moverRow).join('');
    const topDec = movers.filter(x => x.cmp.diff < 0).sort((a, b) => a.cmp.diff - b.cmp.diff).slice(0, 5).map(moverRow).join('');
    const mvBase = rv.on ? 'จากงบเดิม (รอบ Revise)' : `เทียบปี ${prevYear}`;
    const mvEmpty = rv.on ? 'ยังไม่มีแผนกใดปรับจากงบเดิม' : 'ไม่มีรายการ';

    // ---------- Exceptions: เฉพาะหน่วยงานที่มีฐานเทียบปีก่อน ----------
    const baseDepts = depts.filter(d => Store.deptTotal(prevYear, d.id) > 0);
    const anomalies = baseDepts.flatMap(d => Store.deptAnomalies(year, d.id));

    // ---------- MTP outlook (คอลัมน์เทียบ 3 ปี) ----------
    const mtpMax = Math.max(cur, mtp1, mtp2, 1);
    const mtpCol = (label, v, base, first) => {
      const dp = base > 0 ? (v - base) / base * 100 : null;
      return `<div class="mtp-col">
        <div class="mtp-bar-wrap"><div class="mtp-bar${first ? ' mtp-bar-cur' : ''}" style="height:${Math.max(8, v / mtpMax * 118).toFixed(0)}px"></div></div>
        <div class="mtp-y">${label}</div>
        <div class="mtp-v">${v > 0 ? thShort(v) + ' กีบ' : '—'}</div>
        <div class="mtp-d" style="color:${dp === null ? '#98a4b5' : dp >= 0 ? '#0ca30c' : '#d03b3b'}">${dp === null ? '&nbsp;' : (dp >= 0 ? '+' : '') + dp.toFixed(1) + '%'}</div>
      </div>`;
    };
    const mtpHtml = `<div class="mtp-row">
        ${mtpCol('ปี ' + year + (rv.on ? ' (Revise)' : ''), cur, 0, true)}
        ${mtpCol('ปี ' + (year + 1) + ' (MTP)', mtp1, cur, false)}
        ${mtpCol('ปี ' + (year + 2) + ' (MTP)', mtp2, mtp1, false)}
      </div>
      <p class="muted small" style="text-align:center;margin-top:4px">แผนระยะกลาง (MTP) จากคอลัมน์ "ปี ${year + 1} / ปี ${year + 2}" ของไฟล์งบอนุมัติ — บางรายการไม่ได้ระบุ MTP</p>`;

    // ---------- Hero chip ----------
    const phaseChip = rv.on
      ? `<span class="eh-chip eh-chip-rv">🔁 รอบ Revise · เกิดจริงถึง ด.${rv.thru}</span>`
      : pd.status === 'OPEN'
        ? `<span class="eh-chip">🟢 เปิดรับข้อมูล</span>`
        : `<span class="eh-chip">🔒 ปิดรอบแล้ว</span>`;

    return pageHead(`Executive Dashboard 📊`,
        `ภาพรวมงบประมาณทั้งบริษัท ปี ${year} · ${esc(Store.db.meta.company)} · ${asOf()}`,
        `<button class="ghost-btn" onclick="Store.exportDeptSummary(${year})">⬇ Export สรุปหน่วยงาน</button>
         <button class="ghost-btn" onclick="Store.exportDetail(${year})">⬇ Export รายละเอียด</button>
         <button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`)

      + `<div class="exec-hero">
          <div class="eh-main">
            <div class="eh-kicker">งบประมาณทั้งบริษัท ปี ${year} ${phaseChip}</div>
            <div class="eh-big">${thShort(cur)} <small>กีบ</small></div>
            <div class="eh-full">${fmt(cur)} กีบ · ${depts.length} แผนก · ${(Store.db.departmentRows || []).length.toLocaleString()} รายการงบ (CCT × GL)</div>
          </div>
          <div class="eh-stats">
            <div class="eh-stat">
              <div class="ehs-label">💸 เกิดจริงสะสม${rv.on ? ` (ด.1-${rv.thru})` : ''}</div>
              <div class="ehs-val">${actTotal > 0 ? thShort(actTotal) + ' <small>กีบ</small>' : '<small>รอใส่ข้อมูล</small>'}</div>
              <div class="ehs-bar"><i style="width:${Math.min(100, actPct).toFixed(1)}%"></i></div>
              <div class="ehs-sub">ใช้ไป ${actPct.toFixed(1)}% ของงบ · มีข้อมูล ${actDeptN}/${depts.length} แผนก</div>
            </div>
            <div class="eh-stat">
              <div class="ehs-label">🔁 Revise เทียบงบเดิม</div>
              <div class="ehs-val">${rv.on ? (Math.abs(rvDiff) < 0.5 ? '± 0' : (rvDiff > 0 ? '+' : '−') + thShort(Math.abs(rvDiff))) + ' <small>กีบ</small>' : '<small>ยังไม่เปิดรอบ</small>'}</div>
              <div class="ehs-sub">${rv.on ? `งบเดิม ${thShort(origTotal)} กีบ · ${(rvPct >= 0 ? '+' : '') + rvPct.toFixed(2)}%` : 'งบปัจจุบัน = งบอนุมัติ'}</div>
            </div>
            <div class="eh-stat">
              <div class="ehs-label">🎯 MTP ปี ${year + 1}</div>
              <div class="ehs-val">${mtp1 > 0 ? thShort(mtp1) + ' <small>กีบ</small>' : '—'}</div>
              <div class="ehs-sub">${mtp1 > 0 && cur > 0 ? ((mtp1 - cur) / cur >= 0 ? '+' : '') + ((mtp1 - cur) / cur * 100).toFixed(1) + '% จากปี ' + year : 'จากไฟล์แผนระยะกลาง'}</div>
            </div>
            <div class="eh-stat">
              <div class="ehs-label">📮 ${rv.on ? 'ส่ง Revise แล้ว' : 'ส่งงบแล้ว'}</div>
              <div class="ehs-val">${submitted} <small>/ ${depts.length} แผนก</small></div>
              <div class="ehs-sub">${rv.on ? `กำลังปรับคาดการณ์ ${cnt.IN_PROGRESS || 0} แผนก` : (submitted === depts.length ? 'ครบทุกแผนก ✓' : `รออีก ${depts.length - submitted} แผนก`)}</div>
            </div>
          </div>
        </div>`

      + `<div class="side-cards">${sideCards}</div>`

      + `<div class="grid-2">`
      + card(`📈 งบปี ${year} รายเดือน${actTotal > 0 ? ' เทียบเกิดจริง' : ''}${rv.on ? ' และงบเดิม' : ''} (กีบ)`, `<div id="chAccMonthly"></div>`)
      + card(`🍩 สัดส่วนงบตามกลุ่มบัญชี ปี ${year}`, `<div id="chAccGroup"></div>`)
      + `</div>`
      + `<div class="grid-2">`
      + card(`🏢 Top 15 แผนกงบสูงสุด (กีบ) — คลิกเพื่อ drill-down`, `<div id="chAccDept"></div>`)
      + card(`🏆 Top 8 GL ค่าใช้จ่ายสูงสุดทั้งบริษัท ปี ${year} (กีบ)`, `<div id="chAccTopGL"></div>`)
      + `</div>`

      + `<div class="grid-2">`
      + card(`🧭 แนวโน้มแผนระยะกลาง ${year} → ${year + 2}`, mtpHtml)
      + card(`📮 สถานะ${rv.on ? 'รอบ Revise' : 'การส่งงบประมาณ'} — ${submitted}/${depts.length} แผนกส่งแล้ว`, `
          <div class="exec-status-bar">${segs}</div>
          <div class="st-legends">${legends}</div>
          ${waiting.length ? `<div class="st-waiting">⏳ ${rv.on ? 'ยังไม่ส่ง Revise' : 'ยังไม่ส่ง'}: ${waitingNames} — <a class="link" href="#/acc/departments">ติดตาม →</a></div>` : ''}`)
      + `</div>`

      + `<div class="grid-2">`
      + card(`📈 Top 5 เพิ่มขึ้นสูงสุด ${mvBase}`, topInc ? `<div class="mover-list">${topInc}</div>` : `<p class="muted">${mvEmpty}</p>`)
      + card(`📉 Top 5 ลดลงมากสุด ${mvBase}`, topDec ? `<div class="mover-list">${topDec}</div>` : `<p class="muted">${mvEmpty}</p>`)
      + `</div>`

      + `<div id="dashExceptions"></div>`
      + card(`⚠️ Exceptions — การเปลี่ยนแปลงผิดปกติเทียบปี ${prevYear} (${anomalies.length}) · เฉพาะ ${baseDepts.length} หน่วยงานที่มีฐานปีก่อน`,
          anomalies.length ? `<div class="table-scroll" style="max-height:340px"><table class="data-table"><thead>
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
    const year = UI.year();
    const depts = Store.activeDepartments();
    const rv = Store.revisePhase(year);

    // ---------- เส้นรายเดือน: งบเดิม (ช่วง revise) / งบปัจจุบัน / เกิดจริง ----------
    const actuals = (Store.db.actuals || []).filter(a => a.year === year);
    const actualMonthly = Array(12).fill(0);
    actuals.forEach(a => a.months.forEach((v, i) => { actualMonthly[i] += (v || 0); }));
    const series = [];
    if (rv.on) {
      const om = Array(12).fill(0);
      depts.forEach(d => Store.originalDeptMonthly(year, d.id).forEach((v, i) => { om[i] += (v || 0); }));
      series.push({ name: 'งบเดิม', color: Charts.PREV_C, values: om });
    }
    series.push({ name: `ปี ${year}${rv.on ? ' (Revise)' : ''}`, color: Charts.CUR_C, values: Store.companyMonthly(year) });
    if (actualMonthly.some(v => v > 0)) {
      series.push({ name: 'เกิดจริง', color: '#0ca30c', values: actualMonthly.slice(0, Math.max(1, rv.thru || 12)) });
    }
    Charts.line(document.getElementById('chAccMonthly'), Store.MONTH_S, series);

    // ---------- Top 15 แผนก + อื่นๆ ----------
    const com = Math.max(1, Store.companyTotal(year));
    const deptBars = depts.map(d => ({ d, v: Store.deptTotal(year, d.id) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const TOP_N = 15;
    const bars = deptBars.slice(0, TOP_N).map(x => ({
      label: x.d.name, value: x.v, color: (SIDE_META[x.d.side || (x.d.code || '')[0]] || {}).c || Charts.CUR_C,
      sub: `${(x.v / com * 100).toFixed(1)}% ของทั้งบริษัท · ${Math.round(x.v).toLocaleString()} กีบ<br>`,
      onClick: () => { location.hash = `#/acc/departments?d=${x.d.id}`; },
    }));
    const rest = deptBars.slice(TOP_N);
    if (rest.length) {
      const rv2 = rest.reduce((s, x) => s + x.v, 0);
      bars.push({ label: `อื่นๆ อีก ${rest.length} หน่วยงาน`, value: rv2, color: '#c3c2b7',
        sub: `${(rv2 / com * 100).toFixed(1)}% ของทั้งบริษัท · ดูครบที่แท็บ "หน่วยงาน"<br>`,
        onClick: () => { location.hash = '#/acc/departments'; } });
    }
    Charts.hbar(document.getElementById('chAccDept'), bars, { labelW: 230 });

    // ---------- Top 8 GL รวมทั้งบริษัท ----------
    const glTot = {};
    Store.db.budgets.filter(b => b.year === year).forEach(b => {
      glTot[b.glId] = (glTot[b.glId] || 0) + b.months.reduce((s, v) => s + (v || 0), 0);
    });
    const glUse = {};
    (Store.db.departmentRows || []).forEach(x => { (glUse[x.glId] = glUse[x.glId] || new Set()).add(x.departmentId); });
    const gById = {};
    Store.db.glAccounts.forEach(g => { gById[g.id] = g; });
    const topGl = Object.entries(glTot).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    Charts.hbar(document.getElementById('chAccTopGL'), topGl.map(([id, v]) => {
      const g = gById[id] || { code: id, name: '' };
      return { label: `${g.code} ${g.name}`, value: v, color: Charts.CUR_C,
        sub: `${(v / com * 100).toFixed(1)}% ของทั้งบริษัท · ใช้ใน ${(glUse[id] || new Set()).size} แผนก<br>` };
    }));

    // ---------- โดนัทกลุ่มบัญชี (aggregate ตรงจาก budgets — เร็ว) ----------
    const byGroup = {};
    Object.entries(glTot).forEach(([id, v]) => {
      const k = (gById[id] && gById[id].glGroup) || 'อื่นๆ';
      byGroup[k] = (byGroup[k] || 0) + v;
    });
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
      const phase = p.phase === 'REVISE' ? `<span class="status-badge st-revision">🔁 Revise กลางปี · เกิดจริงถึง ด.${p.actualThru}</span> `
        : p.phase === 'LANDING' ? `<span class="status-badge st-endorsed">🎯 ปิดยอด (Landing) · เกิดจริงถึง ด.${p.actualThru}</span> ` : '';
      return `<tr>
      <td><b>ปีงบ ${p.year}</b></td>
      <td>${phase}${p.status === 'OPEN' ? '<span class="status-badge st-progress">OPEN · เปิดรับข้อมูล</span>' : '<span class="status-badge st-locked">CLOSED · ปิดรอบแล้ว</span>'}</td>
      <td class="small">${p.lockedAt ? 'Lock เมื่อ ' + UI.fmtDT(p.lockedAt) + ' โดย ' + esc(p.lockedBy) : 'เปิดเมื่อ ' + UI.fmtDT(p.openedAt)}</td>
      <td class="td-actions">
        ${p.status === 'OPEN'
          ? `<button class="danger-btn small" data-lock="${p.year}">🔒 ปิดรอบ & Lock</button>`
          : `<button class="ghost-btn small" data-unlock="${p.year}">🔓 Unlock (สิทธิ์พิเศษ)</button>`}
        ${p.status === 'CLOSED' && !Store.revisePhase(p.year).on && p.year >= Store.db.meta.yearCurrent
          ? `<button class="primary-btn small" data-revise-open="${p.year}" style="padding:4px 10px;font-size:12px">🔁 Revise กลางปี</button>`
          : (p.year < Store.db.meta.yearCurrent ? '<span class="muted small" title="ปีฐาน/ปิดปีแล้ว — Revise ใช้กับปีงบปัจจุบันเท่านั้น">🔒 ปีฐาน</span>' : '')}
        ${Store.revisePhase(p.year).on
          ? `<a class="ghost-btn small" href="#/acc/actuals?y=${p.year}">📥 ใส่เกิดจริง</a>` : ''}
        ${p.year >= Store.db.meta.yearCurrent && periods.length > 1
          ? `<button class="danger-btn small" data-del-period="${p.year}" title="ลบรอบปีนี้ทั้งหมด" style="background:#b02a2a">🗑 ลบรอบปี</button>` : ''}
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
      + card(`🗄️ ฐานข้อมูล Supabase ${Sync.backend() === 'supa' ? '<span class="pill-on">● กำลังใช้งาน</span>' : ''}`, `
          <p style="margin-bottom:8px">${Sync.backend() === 'supa'
            ? `สถานะ: ${Sync.chipHtml()} — ทุกการแก้ไขซิงค์ขึ้น Supabase อัตโนมัติ · แต่ละแผนกกรอกพร้อมกันไม่ชนกัน`
            : `เก็บข้อมูลเป็นตาราง PostgreSQL จริง (แก้ปัญหาชนกันเวลาหลายแผนกกรอกพร้อมกัน) — ตั้งค่าตามไฟล์ <code>supabase/README.md</code>`}</p>
          <div class="inline-form" style="flex-wrap:wrap">
            <input id="supaUrl" placeholder="https://xxxx.supabase.co" value="${esc(Supa.url())}" style="flex:1;min-width:280px">
            <input id="supaKey" type="password" placeholder="${Supa.hasKey() ? '•••• (ตั้งไว้แล้ว — วางใหม่เพื่อเปลี่ยน)' : 'anon public key (sb_publishable_… หรือ eyJ…)'}" style="flex:1;min-width:280px">
            <button class="primary-btn" id="supaSave">บันทึก & ทดสอบ</button>
            ${Sync.backend() === 'supa' ? `<button class="ghost-btn" id="supaPull">⬇ ดึงจาก Supabase</button>
            <button class="ghost-btn" id="supaPush">⬆ ส่งขึ้นเดี๋ยวนี้</button>
            <button class="ghost-btn" id="supaOff">ยกเลิก</button>` : ''}
          </div>
          <p class="muted small" style="margin-top:6px">🔒 URL และ key เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่อยู่ในโค้ดสาธารณะ</p>`)
      + (() => {
          const gasActive = Sync.backend() === 'gas';
          const supaActive = Sync.backend() === 'supa';
          return card('🔗 Google Sheet (Apps Script) — ทางเลือกสำรอง (ไม่บังคับ)', `
          <p style="margin-bottom:8px">${
            supaActive ? '<span class="muted">ℹ️ ระบบกำลังใช้ <b>Supabase</b> เป็นฐานข้อมูลหลักอยู่ — ส่วนนี้เป็นวิธีเดิม (Google Sheet) <b>ไม่ต้องตั้งค่า</b> เว้นแต่ต้องการสลับกลับไปใช้ Google Sheet</span>'
            : gasActive ? `สถานะ: ${Sync.chipHtml()} — ข้อมูลซิงค์ขึ้น Google Sheet อัตโนมัติ`
            : '<span class="muted">ยังไม่ได้เชื่อมต่อ (วิธีเดิมก่อนย้ายมา Supabase) — แนะนำใช้ Supabase ด้านบนแทน</span>'}</p>
          ${(!supaActive && !gasActive) ? `<ol class="setup-steps">
            <li>เปิดชีท <a class="link" href="https://docs.google.com/spreadsheets/d/1KiE6hk3FJTF4QSk_nYgUwYXynCFFE__J3pcTBdeRhDo/edit" target="_blank">บัญชี</a> → เมนู <b>ส่วนขยาย → Apps Script</b> → วางโค้ด <code>apps-script/Code.gs</code> → Deploy Web app → คัดลอก URL /exec</li>
          </ol>` : ''}
          <div class="inline-form">
            <input id="gasUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(Sync.url())}" style="flex:1;min-width:320px">
            <button class="ghost-btn" id="gasSave">${supaActive ? 'สลับไปใช้ Google Sheet' : 'บันทึก & ทดสอบ'}</button>
            ${gasActive ? `<button class="ghost-btn" id="gasPull">⬇ ดึงจากชีท</button>
            <button class="ghost-btn" id="gasPush">⬆ ส่งขึ้นชีทเดี๋ยวนี้</button>
            <button class="ghost-btn" id="gasOff">ยกเลิกการเชื่อมต่อ</button>` : ''}
          </div>`);
        })()
      + card('รอบงบประมาณ (Budget Periods)', `
          <div class="table-scroll"><table class="data-table"><thead><tr><th>ปีงบ</th><th>สถานะ</th><th>ประวัติ</th><th></th></tr></thead><tbody>${pRows}</tbody></table></div>
          <div class="inline-form" style="border-top:1px dashed var(--border);padding-top:12px;margin-top:6px">
            <button class="primary-btn btn-grad" id="openRoundBtn">🗓️ เปิดรอบตั้งงบปีใหม่ (ปิดยอดปีนี้ + งบปีหน้า)</button>
          </div>
          <p class="muted small" style="margin-top:6px">เปิดพร้อมกัน: <b>ปิดยอดปี ${year}</b> (เกิดจริง N เดือน + คาดการณ์ที่เหลือ) และ <b>งบปี ${year + 1}</b> (12 เดือน) — แผนกกรอกทั้ง 2 ปีได้จากตัวเลือกปีมุมบน</p>
          <div class="inline-form" style="margin-top:10px"><input id="newPeriodYear" inputmode="numeric" placeholder="เช่น ${Math.max(...periods.map(p => p.year)) + 1}" style="width:120px">
          <button class="ghost-btn" id="openPeriodBtn">＋ เปิดรอบเปล่าปีใหม่ (ไม่ปิดยอด)</button></div>`)
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
      + card('🔍 ตรวจกระทบยอดกับไฟล์ (Reconciliation)', `
          <p class="muted small">อัปโหลดไฟล์งบ (Excel/CSV) เพื่อ<b>เทียบกับงบปี ${year} ในระบบ</b> — ดูว่าตรง/ต่าง/ขาดแถวไหน (จับคู่ด้วย code a / IO / CCT+GL) โดย<b>ไม่แก้ไขข้อมูล</b></p>
          <input type="file" id="reconFile" accept=".xlsx,.xls,.csv,.tsv,.txt" style="font:inherit">
          <span id="reconMsg" class="muted small" style="margin-left:10px"></span>`)
      + card('💾 สำรอง / กู้คืนข้อมูล (Backup)', `
          <div class="td-actions">
            <button class="primary-btn" id="backupBtn">⬇ ดาวน์โหลดสำรองทั้งหมด (JSON)</button>
            <label class="ghost-btn" style="cursor:pointer;margin:0"><input type="file" id="restoreFile" accept=".json" style="display:none"> 📁 กู้คืนจากไฟล์สำรอง</label>
          </div>
          <p class="muted small" style="margin-top:8px">สำรองทุกอย่าง (งบทุกปี · master · เกิดจริง · สถานะ · audit) เป็นไฟล์เดียว เก็บไว้กู้คืนได้ · แนะนำดาวน์โหลดก่อนทำงานสำคัญทุกครั้ง · กู้คืนจะเขียนทับข้อมูลปัจจุบัน + ซิงค์ขึ้นฐานข้อมูล</p>`)
      + card('🧹 ล้างข้อมูล mock (เครื่องมือชั่วคราวสำหรับตั้งค่าก่อนใช้จริง)', `
          <div class="td-actions">
            <button class="danger-btn" id="clearMockBtn">🧹 ล้าง mock ทั้งหมด → ฟอร์มเปล่า (ปี ${year})</button>
            <button class="ghost-btn" id="resetDemoBtn">↺ รีเซ็ตกลับข้อมูลตั้งต้นจากไฟล์</button>
          </div>
          <p class="muted small" style="margin-top:8px">
            🧹 = ล้าง<b>งบ 12 เดือน + MTP + เหตุผล + เกิดจริง + snapshot</b> ของ<b>ทุกแผนกปี ${year}</b> → ฟอร์มเปล่า สถานะ Draft + ปิดรอบ Revise ให้พร้อมกรอกงบจริงใหม่<br>
            (งบปี ${year - 1} baseline ไม่ถูกแตะ · ซิงค์ Supabase ทันที · <b>ย้อนกลับไม่ได้</b>)</p>`);
  }
  function controlBind(user) {
    /* ---------- Supabase ---------- */
    document.getElementById('supaSave')?.addEventListener('click', async () => {
      const url = document.getElementById('supaUrl').value.trim();
      let key = document.getElementById('supaKey').value.trim();
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) { toast('URL ไม่ถูกต้อง — ต้องเป็น https://xxxx.supabase.co', 'err'); return; }
      if (!key) { if (Supa.hasKey()) key = localStorage.getItem('abp_supa_key'); else { toast('วาง anon public key ก่อน', 'err'); return; } }
      if (!/^(sb_|eyJ)/.test(key)) { toast('anon key ไม่ถูกต้อง (ขึ้นต้น sb_ หรือ eyJ)', 'err'); return; }
      Supa.setConfig(url, key);
      toast('กำลังทดสอบการเชื่อมต่อ…');
      try {
        await Sync.ping();
        toast('เชื่อมต่อ Supabase สำเร็จ ✓ — กำลังซิงค์…');
        await Sync.pull();
        toast(Sync.state.mode === 'ok' ? 'ซิงค์กับ Supabase แล้ว ✓' : 'ซิงค์ไม่สำเร็จ — ' + (Sync.state.error || ''), Sync.state.mode === 'ok' ? 'ok' : 'err');
        App.render();
      } catch (e) { toast('เชื่อมต่อไม่สำเร็จ: ' + e.message, 'err'); }
    });
    document.getElementById('supaPull')?.addEventListener('click', async () => {
      toast('กำลังดึงข้อมูลจาก Supabase…');
      try { await Sync.pull(); toast('ดึงข้อมูลล่าสุดแล้ว ✓'); App.render(); }
      catch (e) { toast('ดึงไม่สำเร็จ: ' + e.message, 'err'); }
    });
    document.getElementById('supaPush')?.addEventListener('click', async () => {
      toast('กำลังส่งขึ้น Supabase…');
      await Sync.push();
      toast(Sync.state.mode === 'ok' ? 'ส่งขึ้น Supabase แล้ว ✓' : 'ส่งไม่สำเร็จ — ' + (Sync.state.error || ''), Sync.state.mode === 'ok' ? 'ok' : 'err');
    });
    document.getElementById('supaOff')?.addEventListener('click', () => {
      UI.confirm2('ยกเลิกการเชื่อมต่อ Supabase?', 'แอปจะกลับไปเก็บข้อมูลในเบราว์เซอร์เครื่องนี้ (หรือใช้ Google Sheet ถ้าตั้งไว้)', 'ข้อมูลบน Supabase ไม่ถูกลบ เชื่อมต่อใหม่ได้ทุกเมื่อ',
        () => { Supa.setConfig('', ''); toast('ยกเลิกการเชื่อมต่อ Supabase แล้ว'); App.render(); });
    });

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
    document.querySelectorAll('[data-del-period]').forEach(b => b.addEventListener('click', () => {
      const y = b.dataset.delPeriod;
      const n = Store.db.budgets.filter(x => x.year === Number(y)).length;
      UI.modal(`🗑 ลบรอบงบประมาณปี ${y}?`, `
        <p class="warn-text">⚠ จะลบข้อมูลปี ${y} ทั้งหมด — งบ ${n} แถว + สถานะ/สมมติฐาน/เกิดจริง/snapshot ของปีนี้ (ลบออกจาก Supabase ด้วย)</p>
        <p class="small muted">ปีอื่นไม่กระทบ · บันทึกใน Audit Log · (เวอร์ชันถัดไปจะเพิ่ม PIN ยืนยัน)</p>
        <p>พิมพ์เลขปี <b>${y}</b> เพื่อยืนยัน:</p><input id="delConfirm" inputmode="numeric" placeholder="${y}">`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: '🗑 ยืนยันลบรอบปี', cls: 'danger-btn', onClick: close => {
            if (String(document.getElementById('delConfirm').value).trim() !== String(y)) { toast(`กรุณาพิมพ์ ${y} เพื่อยืนยัน`, 'err'); return; }
            try { Store.deletePeriod(user, y); toast(`ลบรอบงบปี ${y} แล้ว`); close(); if (UI.year() === Number(y)) UI.setYear(Store.db.meta.yearCurrent); App.render(); }
            catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
    document.getElementById('openRoundBtn')?.addEventListener('click', () => {
      const cur = UI.year(), next = cur + 1;
      UI.modal(`🗓️ เปิดรอบตั้งงบปี ${next}`, `
        <p>ระบบจะทำ 2 อย่างพร้อมกัน:</p>
        <ol class="setup-steps">
          <li><b>ปิดยอดปี ${cur}</b> — ล็อกเกิดจริงถึงเดือนที่เลือก (นำเข้าไฟล์ SAP ทีหลัง) แล้วให้แผนกคาดการณ์เดือนที่เหลือ</li>
          <li><b>เปิดงบปี ${next}</b> — กริด 12 เดือนสำหรับกรอกงบใหม่</li>
        </ol>
        <label class="fld"><span>เกิดจริงปี ${cur} ถึงเดือนที่</span>
          <select id="roundThru">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===9?'selected':''}>เดือน ${i+1} (${Store.MONTH_TH[i]})</option>`).join('')}</select></label>
        <label class="fld"><span>ตั้งต้นงบปี ${next}</span>
          <select id="roundPrefill">
            <option value="blank">ฟอร์มเปล่า (กรอกใหม่ทั้งหมด)</option>
            <option value="landing" selected>คัดลอกจากยอดปิดปี ${cur} (แก้ต่อได้)</option>
          </select></label>
        <p class="warn-text">⚠ สถานะทุกแผนกจะกลับเป็น "กำลังจัดทำ" · ปี ${next} จะกลายเป็นปีงบปัจจุบัน</p>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: `🗓️ เปิดรอบตั้งงบปี ${next}`, cls: 'primary-btn', onClick: close => {
            try {
              const thru = Number(document.getElementById('roundThru').value);
              const prefill = document.getElementById('roundPrefill').value;
              const r = Store.openBudgetRound(user, cur, thru, next, prefill);
              toast(`เปิดรอบตั้งงบปี ${next} แล้ว (สร้าง ${r.created} แถว) — เลือกปีที่มุมบนเพื่อสลับระหว่างปิดยอด ${cur} กับงบ ${next}`);
              UI.setYear(next); close(); App.render();
            } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    });
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
      UI.modal(`🔁 Revise กลางปี — งบประมาณปี ${y}`, `
        <p>รอบ Revise กลางปี (ปกติ ~เม.ย.) — เทียบกับ<b>แผน ORIGINAL</b> ที่อนุมัติไว้ แล้วเปิดให้ทุกหน่วยงานปรับคาดการณ์</p>
        <label class="fld"><span>มีตัวเลขเกิดจริงถึงเดือนที่</span>
          <select id="revThru">${Store.MONTH_TH.map((m, i) => `<option value="${i + 1}" ${i + 1 === 4 ? 'selected' : ''}>เดือน ${i + 1} — ${m}</option>`).join('')}</select></label>
        <p class="muted small">เดือน 1 ถึงเดือนก่อนหน้า = ล็อกสนิทเป็นเกิดจริง · เดือนสุดท้ายที่เลือก = หน่วยงานเพิ่มได้แต่ลดต่ำกว่าเกิดจริงไม่ได้ · เดือนที่เหลือ = ปรับคาดการณ์ได้</p>
        <p class="warn-text">⚠ หลังเปิดรอบ สถานะทุกหน่วยงานจะกลับเป็น "กำลังจัดทำ" และต้องส่งข้อมูลอีกครั้ง</p>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: '🔁 ยืนยันเปิดรอบ Revise', cls: 'primary-btn', onClick: close => {
            try {
              Store.openRevise(user, y, Number(document.getElementById('revThru').value), 'REVISE');
              toast(`เปิดรอบ Revise กลางปี ${y} แล้ว — ไปใส่ตัวเลขเกิดจริงต่อได้เลย`); close();
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
    document.getElementById('reconFile')?.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const msg = document.getElementById('reconMsg'); msg.textContent = 'กำลังอ่านและกระทบยอด…';
      try {
        const grid = await fileToGrid(file);
        const recs = gridToRecords(grid);
        const r = Store.reconcileFile(UI.year(), recs);
        const money = n => Math.round(n).toLocaleString();
        const mtbl = r.mismatch.length ? `<div style="margin-top:10px"><b class="txt-warn">ตัวเลขต่างกัน (${r.mismatch.length})</b><div class="table-scroll" style="max-height:200px"><table class="data-table small"><thead><tr><th>แผนก</th><th>GL</th><th>CCT</th><th class="num">ในระบบ</th><th class="num">ในไฟล์</th><th class="num">ต่าง</th></tr></thead><tbody>${r.mismatch.slice(0, 100).map(m => `<tr><td class="small">${esc(m.dept)}</td><td><span class="gl-code">${m.gl}</span></td><td class="mono small">${m.cct}</td><td class="num">${money(m.app)}</td><td class="num">${money(m.file)}</td><td class="num" style="color:${m.diff >= 0 ? '#d03b3b' : '#0ca30c'}">${(m.diff >= 0 ? '+' : '') + money(m.diff)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
        const fotbl = r.fileOnly.length ? `<div style="margin-top:10px"><b>มีในไฟล์ แต่ไม่มีในระบบ (${r.fileOnly.length})</b><div class="muted small">${r.fileOnly.slice(0, 20).map(x => esc(x.id)).join(' · ')}${r.fileOnly.length > 20 ? ' …' : ''}</div></div>` : '';
        const aotbl = r.appOnly.length ? `<div style="margin-top:8px"><b>มีในระบบ แต่ไม่มีในไฟล์ (${r.appOnly.length})</b><div class="muted small">${r.appOnly.slice(0, 20).map(x => x.gl + '@' + x.cct).join(' · ')}${r.appOnly.length > 20 ? ' …' : ''}</div></div>` : '';
        UI.modal(`🔍 ผลกระทบยอด — งบปี ${UI.year()} vs ไฟล์`, `
          <div class="kpi-grid kpi-grid-4" style="margin-bottom:10px">
            ${kpiC('✓', '#eaf6ea', 'kpi-tint-green', 'ตรงกัน', `${r.matched} <small>แถว</small>`, '')}
            ${kpiC('≠', '#fff7e6', 'kpi-tint-amber', 'ตัวเลขต่าง', `${r.mismatch.length} <small>แถว</small>`, '')}
            ${kpiC('📄', '#e6f0fb', 'kpi-tint-blue', 'ไฟล์เกิน', `${r.fileOnly.length} <small>แถว</small>`, 'ไม่มีในระบบ')}
            ${kpiC('🗄️', '#fdecec', 'kpi-tint-red', 'ระบบเกิน', `${r.appOnly.length} <small>แถว</small>`, 'ไม่มีในไฟล์')}
          </div>
          <p>ยอดรวมไฟล์: <b>${money(r.fileTotal)}</b> กีบ · ยอดในระบบ (เฉพาะแถวจับคู่ได้): <b>${money(r.appMatchedTotal)}</b> กีบ · ผลต่าง: <b style="color:${Math.abs(r.fileTotal - r.appMatchedTotal) < 0.5 ? '#0ca30c' : '#d03b3b'}">${money(r.fileTotal - r.appMatchedTotal)}</b> กีบ</p>
          ${mtbl}${fotbl}${aotbl}`, [{ label: 'ปิด', cls: 'primary-btn' }]);
        msg.textContent = `ตรง ${r.matched} · ต่าง ${r.mismatch.length} · ไฟล์เกิน ${r.fileOnly.length} · ระบบเกิน ${r.appOnly.length}`;
        document.getElementById('reconFile').value = '';
      } catch (err) { msg.textContent = ''; toast('กระทบยอดไม่สำเร็จ: ' + err.message, 'err'); document.getElementById('reconFile').value = ''; }
    });
    document.getElementById('backupBtn')?.addEventListener('click', () => {
      try { Store.exportBackup(); toast('ดาวน์โหลดไฟล์สำรองแล้ว ✓'); } catch (e) { toast(e.message, 'err'); }
    });
    document.getElementById('restoreFile')?.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      let text; try { text = await file.text(); } catch (err) { toast('อ่านไฟล์ไม่สำเร็จ', 'err'); return; }
      UI.confirm2('กู้คืนข้อมูลจากไฟล์สำรอง?', `ไฟล์: ${esc(file.name)} — ข้อมูลปัจจุบันทั้งหมดจะถูกเขียนทับด้วยไฟล์นี้ และซิงค์ขึ้นฐานข้อมูล`, 'ตรวจให้แน่ใจว่าเป็นไฟล์สำรองที่ถูกต้อง · ย้อนกลับไม่ได้',
        async () => {
          try { const r = Store.restoreBackup(user, text); await Sync.push?.(); toast(`กู้คืนแล้ว ✓ (${r.depts} แผนก · ${r.budgets} แถวงบ)`); App.render(); }
          catch (err) { toast('กู้คืนไม่สำเร็จ: ' + err.message, 'err'); }
          document.getElementById('restoreFile').value = '';
        });
    });
    document.getElementById('clearMockBtn')?.addEventListener('click', () => {
      const y = UI.year();
      UI.modal(`🧹 ล้าง mock ปี ${y} → ฟอร์มเปล่าทั้งหมด`, `
        <p>งบ 12 เดือน, MTP, เหตุผล/สมมติฐาน, ตัวเลขเกิดจริง และ snapshot <b>ของทั้ง ${Store.activeDepartments().length} แผนก</b>
        จะถูกล้างเป็นฟอร์มเปล่า · ปิดรอบ Revise · สถานะกลับเป็น Draft (งบปี ${y - 1} ไม่ถูกแตะ)</p>
        <p class="warn-text">⚠ การกระทำนี้ย้อนกลับไม่ได้ และซิงค์ขึ้น Supabase ทันที</p>
        <p>พิมพ์ <b>CLEAR</b> เพื่อยืนยัน:</p><input id="clearAllConfirm" placeholder="CLEAR" autocomplete="off">`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: '🧹 ยืนยันล้างเป็นฟอร์มเปล่า', cls: 'danger-btn', onClick: close => {
            if (document.getElementById('clearAllConfirm').value.trim().toUpperCase() !== 'CLEAR') { toast('กรุณาพิมพ์ CLEAR เพื่อยืนยัน', 'err'); return; }
            try {
              const n = Store.clearMock(user, y);
              toast(`ล้าง mock ปี ${y} แล้ว (${n} รายการ ทั้ง ${Store.activeDepartments().length} แผนก) — ฟอร์มเปล่า พร้อมกรอกจริง`);
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
      + card('📤 อัปโหลดไฟล์งบ Revise (Excel / CSV) — จับคู่เข้า GL อัตโนมัติ', `
          <p class="muted small">อัปโหลดไฟล์งบ Revise (โครงเดียวกับไฟล์งบต้นปี: <code>code a · IO · CCT · GL · 12 เดือน</code>) — ระบบจับคู่แต่ละแถวเข้า GL ด้วย code a → IO → CCT+GL แล้วเติมงบทั้ง 12 เดือนให้อัตโนมัติทุกหน่วยงานในไฟล์</p>
          <input type="file" id="reviseFile" accept=".xlsx,.xls,.csv,.tsv,.txt" style="font:inherit">
          <span id="reviseFileMsg" class="muted small" style="margin-left:10px"></span>
          <label class="muted small" style="display:block;margin-top:8px"><input type="checkbox" id="reviseAuto" checked style="vertical-align:-2px"> สร้างแผนก / GL / CCT ใหม่อัตโนมัติ ถ้ายังไม่มีในระบบ (จะได้ 0 แถวจับคู่ไม่ได้)</label>`)
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
    document.getElementById('reviseFile')?.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const msg = document.getElementById('reviseFileMsg');
      msg.textContent = 'กำลังอ่านไฟล์…';
      try {
        const grid = await fileToGrid(file);
        const recs = gridToRecords(grid);
        if (!recs.length) throw new Error('ไม่พบแถวข้อมูลในไฟล์');
        const auto = document.getElementById('reviseAuto')?.checked;
        const willMatch = recs.filter(r => Store.actualRowRef(r)).length;
        const willCreate = auto ? recs.length - willMatch : 0;
        msg.textContent = `พบ ${recs.length} แถว · จับคู่ได้ ${willMatch} แถว${willCreate ? ` · สร้างใหม่ ${willCreate}` : ''}`;
        UI.modal('📤 นำเข้างบ Revise จากไฟล์', `
          <p>ไฟล์: <b>${esc(file.name)}</b></p>
          <p>พบ <b>${recs.length}</b> แถว · จับคู่เข้า GL ที่มีอยู่ <b>${willMatch}</b> แถว${recs.length - willMatch ? ` · เป็นแถวใหม่ ${recs.length - willMatch} แถว` : ''}</p>
          <p class="muted small">${auto ? 'แถวใหม่จะถูก<b>สร้างแผนก/GL/CCT ให้อัตโนมัติ</b> แล้วเติมงบ' : 'แถวที่จับคู่ไม่ได้จะถูกข้าม (ติ๊ก "สร้างใหม่อัตโนมัติ" เพื่อให้นำเข้าครบ)'} · เติมงบ 12 เดือน แล้วซิงค์ขึ้นฐานข้อมูล</p>
          <p class="warn-text">⚠ การนำเข้าจะ<b>เขียนทับตัวเลขที่แผนกกรอก</b> — ระบบบันทึก audit log ว่าค่ามาจากไฟล์ (ผู้กรอกล่าสุด = "นำเข้าจากไฟล์ Revise")</p>`, [
          { label: 'ยกเลิก', cls: 'ghost-btn', onClick: close => { close(); document.getElementById('reviseFile').value = ''; msg.textContent = ''; } },
          { label: `📥 นำเข้า`, cls: 'primary-btn', onClick: close => {
              try {
                const r = Store.importBudgetFile(user, year, recs, { autoCreate: auto });
                close();
                const c = r.created || {};
                const createdTxt = (c.rows ? `สร้างแถวใหม่ ${c.rows}` + (c.depts ? ` (แผนกใหม่ ${c.depts})` : '') + (c.gls ? ` · GL ใหม่ ${c.gls}` : '') + (c.ccts ? ` · CCT ใหม่ ${c.ccts}` : '') : '');
                const unTxt = r.unmatched.length ? `<div class="warn-text" style="margin-top:8px">⚠ จับคู่ไม่ได้ ${r.unmatched.length} แถว:</div><div class="table-scroll" style="max-height:180px"><table class="data-table small"><thead><tr><th>code a</th><th>CCT</th><th>GL</th><th>รหัสแผนก</th></tr></thead><tbody>${r.unmatched.slice(0, 50).map(u => `<tr><td class="mono">${esc(u.codeA || '—')}</td><td class="mono">${esc(u.cct)}</td><td class="mono">${esc(u.gl)}</td><td>${esc(u.deptCode || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:#0ca30c;margin-top:8px">✓ นำเข้าครบทุกแถว</p>';
                UI.modal('✅ ผลการนำเข้างบ Revise', `<p>เติมงบ <b>${r.matched}</b> แถว · <b>${r.cells}</b> ช่อง${createdTxt ? '<br>' + createdTxt : ''}</p>${unTxt}`, [{ label: 'ปิด', cls: 'primary-btn', onClick: cl => { cl(); App.render(); } }]);
              } catch (err) { toast(err.message, 'err'); }
            } },
        ]);
      } catch (err) { msg.textContent = ''; toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'err'); document.getElementById('reviseFile').value = ''; }
    });
  }

  /* ---------- ตัวอ่านไฟล์งบ Revise (Excel/CSV) ---------- */
  function loadXLSX() {
    return new Promise((res, rej) => {
      if (window.XLSX) return res(window.XLSX);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res(window.XLSX);
      s.onerror = () => rej(new Error('โหลดตัวอ่าน Excel ไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต) — หรือบันทึกไฟล์เป็น .csv แล้วอัปโหลดแทน'));
      document.head.appendChild(s);
    });
  }
  function splitCSV(line, delim) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  }
  async function fileToGrid(file) {
    const name = file.name.toLowerCase();
    if (/\.(csv|tsv|txt)$/.test(name)) {
      const text = await file.text();
      const ti = text.indexOf('\t'), ci = text.indexOf(',');
      const delim = (ti >= 0 && (ci < 0 || ti < ci)) ? '\t' : ',';
      return text.replace(/\r/g, '').split('\n').map(l => splitCSV(l, delim));
    }
    const XLSX = await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    let best = wb.SheetNames[0], bestN = -1;
    wb.SheetNames.forEach(n => { const g = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }); if (g.length > bestN) { bestN = g.length; best = n; } });
    return XLSX.utils.sheet_to_json(wb.Sheets[best], { header: 1, raw: true, defval: '' });
  }
  function gridToRecords(grid) {
    let hi = -1;
    for (let i = 0; i < Math.min(grid.length, 25); i++) {
      const cells = grid[i].map(c => String(c).trim().toLowerCase());
      if (cells.some(c => /code\s*a/.test(c)) || (cells.some(c => c.includes('gl')) && cells.some(c => c.includes('cct')))) { hi = i; break; }
    }
    if (hi < 0) throw new Error('ไม่พบหัวตาราง (ต้องมีคอลัมน์ code a / IO / CCT / GL)');
    const H = grid[hi].map(c => String(c).trim());
    const find = re => H.findIndex(c => re.test(c));
    const idx = { codeA: find(/code\s*a/i), io: find(/IO/), cct: find(/CCT/i), gl: find(/รหัสบัญชี|\/GL|\bGL\b/), glName: find(/ชื่อบัญชี/),
      deptCode: find(/รหัสแผนก/), deptName: H.findIndex(c => c.trim() === 'แผนก'), cctName: find(/ชื่อหน่วยงาน/) };
    const totalCol = find(/งบประมาณ.*เดือน|12\s*เดือน|รวม.*ปี/i);
    const mStart = idx.glName >= 0 ? idx.glName + 1 : (idx.gl >= 0 ? idx.gl + 2 : -1);
    const monthCols = [];
    if (mStart >= 0) for (let k = 0; k < 12; k++) monthCols.push(mStart + k);
    const y1 = find(/2027/), y2 = find(/2028/);
    const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[, ]/g, '')); return isFinite(n) ? n : null; };
    const recs = [];
    for (let r = hi + 1; r < grid.length; r++) {
      const row = grid[r]; if (!row) continue;
      const glc = idx.gl >= 0 ? String(row[idx.gl] || '').trim() : '';
      const codeA = idx.codeA >= 0 ? String(row[idx.codeA] || '').trim() : '';
      const io = idx.io >= 0 ? String(row[idx.io] || '').trim() : '';
      const cct = idx.cct >= 0 ? String(row[idx.cct] || '').trim() : '';
      if (!/^\d{6,7}$/.test(glc) && !codeA && !io) continue;
      const S = i => i >= 0 ? String(row[i] || '').trim() : '';
      recs.push({ codeA, io, cct, glCode: glc, months: monthCols.map(ci => num(row[ci])),
        deptCode: S(idx.deptCode), deptName: S(idx.deptName), cctName: S(idx.cctName), glName: S(idx.glName),
        mtp1: y1 >= 0 ? num(row[y1]) : null, mtp2: y2 >= 0 ? num(row[y2]) : null });
    }
    return recs;
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

  /* ============ งบการเงินตามงบ (Budget P&L by กลุ่มบัญชี) ============ */
  function pnl(user) {
    const year = UI.year(), prevYear = year - 1;
    const gById = {}; Store.db.glAccounts.forEach(g => { gById[g.id] = g; });
    const agg = {};
    const bucket = grp => (agg[grp] = agg[grp] || { cur: 0, prev: 0, mtp1: 0, mtp2: 0, gls: new Set() });
    Store.db.budgets.filter(b => b.year === year).forEach(b => {
      const g = gById[b.glId]; if (!g) return; const a = bucket(g.glGroup || 'อื่นๆ');
      a.cur += b.months.reduce((s, v) => s + (v || 0), 0);
      a.mtp1 += (typeof b.mtp1 === 'number' ? b.mtp1 : 0);
      a.mtp2 += (typeof b.mtp2 === 'number' ? b.mtp2 : 0);
      a.gls.add(b.glId);
    });
    Store.db.budgets.filter(b => b.year === prevYear).forEach(b => {
      const g = gById[b.glId]; if (!g) return; bucket(g.glGroup || 'อื่นๆ').prev += b.months.reduce((s, v) => s + (v || 0), 0);
    });
    const groups = Object.entries(agg).sort((a, b) => b[1].cur - a[1].cur);
    const grand = groups.reduce((t, [, v]) => ({ cur: t.cur + v.cur, prev: t.prev + v.prev, mtp1: t.mtp1 + v.mtp1, mtp2: t.mtp2 + v.mtp2 }), { cur: 0, prev: 0, mtp1: 0, mtp2: 0 });
    const rows = groups.map(([grp, v]) => {
      const cmp = Store.compare(v.cur, v.prev);
      const share = grand.cur > 0 ? v.cur / grand.cur * 100 : 0;
      return `<tr>
        <td data-v="${esc(grp)}"><b>${esc(grp)}</b><div class="muted small">${v.gls.size} GL</div></td>
        <td class="num" data-v="${v.prev}">${fmt(v.prev)}</td>
        <td class="num" data-v="${v.cur}"><b>${fmt(v.cur)}</b></td>
        <td data-v="${cmp.diff}">${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td data-v="${share}"><div class="comp-bar"><div class="comp-fill" style="width:${share.toFixed(0)}%"></div></div>${share.toFixed(1)}%</td>
        <td class="num" data-v="${v.mtp1}">${v.mtp1 ? fmt(v.mtp1) : '—'}</td>
        <td class="num" data-v="${v.mtp2}">${v.mtp2 ? fmt(v.mtp2) : '—'}</td></tr>`;
    }).join('');
    const gcmp = Store.compare(grand.cur, grand.prev);

    return pageHead('📑 งบการเงินตามงบ (Budget P&L)', `สรุปงบตามกลุ่มบัญชี (ธรรมชาติค่าใช้จ่าย) · ทั้งบริษัท ปี ${year} · ${asOf()}`,
        `<button class="ghost-btn" onclick="Store.exportPnl(${year})">⬇ Export CSV</button>
         <button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`)
      + `<div class="kpi-grid kpi-grid-4">
        ${kpiC('📑', '#e6f0fb', 'kpi-tint-blue', `งบรวมปี ${year}`, `${UI.fmtShort(grand.cur)} <small>กีบ</small>`, fmt(grand.cur) + ' กีบ')}
        ${kpiC('🗓️', '#e6f7f0', 'kpi-tint-teal', `ปี ${prevYear}`, `${UI.fmtShort(grand.prev)} <small>กีบ</small>`, fmt(grand.prev) + ' กีบ')}
        ${kpiC(gcmp.diff >= 0 ? '📈' : '📉', gcmp.diff >= 0 ? '#fdecec' : '#eaf6ea', 'kpi-tint-green', 'เพิ่ม/ลด', `<span>${deltaBadge(gcmp.diff, gcmp.pct)}</span>`, (gcmp.diff >= 0 ? '+' : '') + fmt(gcmp.diff) + ' กีบ')}
        ${kpiC('🎯', '#fff7e6', 'kpi-tint-amber', `MTP ปี ${year + 1}`, `${UI.fmtShort(grand.mtp1)} <small>กีบ</small>`, grand.mtp1 && grand.cur ? ((grand.mtp1 - grand.cur) / grand.cur * 100).toFixed(1) + '% จากปีนี้' : '—')}
      </div>`
      + card(`งบตามกลุ่มบัญชี (${groups.length} กลุ่ม) — คลิกหัวคอลัมน์เพื่อเรียง`, `<div class="table-scroll"><table class="data-table sortable-table" id="pnlTable">
          <thead><tr><th class="sortable">กลุ่มบัญชี</th><th class="num sortable">ปี ${prevYear} (กีบ)</th><th class="num sortable">ปี ${year} (กีบ)</th><th class="sortable">%Δ</th><th class="sortable">สัดส่วน</th><th class="num sortable">MTP ปี ${year + 1}</th><th class="num sortable">MTP ปี ${year + 2}</th></tr></thead>
          <tbody>${rows}
          <tr class="tr-sum"><td><b>รวมทั้งหมด</b></td><td class="num"><b>${fmt(grand.prev)}</b></td><td class="num"><b>${fmt(grand.cur)}</b></td><td>${deltaBadge(gcmp.diff, gcmp.pct)}</td><td><b>100%</b></td><td class="num"><b>${fmt(grand.mtp1)}</b></td><td class="num"><b>${fmt(grand.mtp2)}</b></td></tr>
          </tbody></table></div>`, { cls: 'card-flush' });
  }
  function pnlBind() { UI.enableSort(document.getElementById('pnlTable')); }

  /* ============ ควบคุมงบ (Budget vs Actual / Variance) ============ */
  function variance(user) {
    const year = UI.year();
    const rv = Store.revisePhase(year);
    const acts = (Store.db.actuals || []).filter(a => a.year === year);
    const actByDept = {}, gById = {}; Store.db.glAccounts.forEach(g => { gById[g.id] = g; });
    const actByGrp = {}; let actTotal = 0;
    acts.forEach(a => { const s = a.months.reduce((x, v) => x + (v || 0), 0); actByDept[a.departmentId] = (actByDept[a.departmentId] || 0) + s; const grp = (gById[a.glId] || {}).glGroup || 'อื่นๆ'; actByGrp[grp] = (actByGrp[grp] || 0) + s; actTotal += s; });
    const budTotal = Store.companyTotal(year);
    const usedPct = budTotal > 0 ? actTotal / budTotal * 100 : 0;
    const flag = (act, bud) => act > bud && bud > 0 ? { c: '#d03b3b', t: '🔴 เกินงบ' } : bud > 0 && act / bud >= 0.9 ? { c: '#eda100', t: '🟡 ใกล้เต็ม' } : act > 0 ? { c: '#0ca30c', t: '🟢 ปกติ' } : { c: '#c3c2b7', t: '—' };

    const budByGrp = {};
    Store.db.budgets.filter(b => b.year === year).forEach(b => { const grp = (gById[b.glId] || {}).glGroup || 'อื่นๆ'; budByGrp[grp] = (budByGrp[grp] || 0) + b.months.reduce((s, v) => s + (v || 0), 0); });

    const deptRows = Store.activeDepartments().map(d => ({ d, bud: Store.deptTotal(year, d.id), act: actByDept[d.id] || 0 }))
      .filter(x => x.bud > 0).sort((a, b) => (b.act / (b.bud || 1)) - (a.act / (a.bud || 1))).map(x => {
        const rem = x.bud - x.act, pct = x.bud > 0 ? x.act / x.bud * 100 : 0, f = flag(x.act, x.bud);
        return `<tr>
          <td data-v="${esc(x.d.name)}"><b>${UI.deptIcon(x.d)} ${esc(x.d.name)}</b><div class="muted small">${x.d.code}</div></td>
          <td class="num" data-v="${x.bud}">${fmt(x.bud)}</td>
          <td class="num" data-v="${x.act}">${fmt(x.act)}</td>
          <td class="num" data-v="${rem}" style="color:${rem < 0 ? '#d03b3b' : '#0ca30c'}">${fmt(rem)}</td>
          <td data-v="${pct}"><div class="comp-bar"><div class="comp-fill ${pct >= 100 ? '' : 'full'}" style="width:${Math.min(100, pct).toFixed(0)}%;background:${f.c}"></div></div>${pct.toFixed(1)}%</td>
          <td data-v="${pct}"><span style="color:${f.c};font-weight:600">${f.t}</span></td></tr>`;
      }).join('');
    const grpRows = Object.keys(budByGrp).map(grp => ({ grp, bud: budByGrp[grp], act: actByGrp[grp] || 0 }))
      .sort((a, b) => b.bud - a.bud).map(x => {
        const rem = x.bud - x.act, pct = x.bud > 0 ? x.act / x.bud * 100 : 0, f = flag(x.act, x.bud);
        return `<tr><td><b>${esc(x.grp)}</b></td><td class="num">${fmt(x.bud)}</td><td class="num">${fmt(x.act)}</td>
          <td class="num" style="color:${rem < 0 ? '#d03b3b' : '#0ca30c'}">${fmt(rem)}</td>
          <td>${pct.toFixed(1)}%</td><td><span style="color:${f.c};font-weight:600">${f.t}</span></td></tr>`;
      }).join('');

    const emptyNote = actTotal === 0
      ? `<div class="anomaly-box warning" style="margin-bottom:14px">ℹ️ ยังไม่มีตัวเลขเกิดจริงปี ${year} — ${rv.on ? 'ใส่เกิดจริงที่เมนู "ใส่เกิดจริง" หรืออัปโหลดไฟล์ SAP' : 'เปิดรอบ Revise แล้วนำเข้าเกิดจริงก่อน'} · รายงานนี้จะคำนวณอัตโนมัติเมื่อมีข้อมูล</div>` : '';

    return pageHead('🎯 ควบคุมงบ — งบ vs เกิดจริง', `เทียบงบที่ตั้งกับเกิดจริงสะสม${rv.on ? ` (ถึงเดือน ${rv.thru})` : ''} · ทั้งบริษัท ปี ${year} · ${asOf()}`,
        `<button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`)
      + emptyNote
      + `<div class="kpi-grid kpi-grid-4">
        ${kpiC('💰', '#e6f0fb', 'kpi-tint-blue', `งบทั้งปี ${year}`, `${UI.fmtShort(budTotal)} <small>กีบ</small>`, fmt(budTotal) + ' กีบ')}
        ${kpiC('💸', '#e6f7f0', 'kpi-tint-teal', 'เกิดจริงสะสม', `${UI.fmtShort(actTotal)} <small>กีบ</small>`, fmt(actTotal) + ' กีบ')}
        ${kpiC('🏦', '#eaf6ea', 'kpi-tint-green', 'คงเหลือ', `${UI.fmtShort(budTotal - actTotal)} <small>กีบ</small>`, fmt(budTotal - actTotal) + ' กีบ')}
        ${kpiC('🎯', usedPct >= 100 ? '#fdecec' : '#fff7e6', usedPct >= 100 ? 'kpi-tint-red' : 'kpi-tint-amber', '% ใช้ไป', `${usedPct.toFixed(1)} <small>%</small>`, usedPct >= 100 ? 'เกินงบ ⚠' : 'ของงบทั้งปี')}
      </div>`
      + card(`ควบคุมงบรายแผนก — คลิกหัวคอลัมน์เพื่อเรียง`, `<div class="table-scroll" style="max-height:60vh"><table class="data-table sortable-table" id="varTable">
          <thead><tr><th class="sortable">แผนก</th><th class="num sortable">งบทั้งปี (กีบ)</th><th class="num sortable">เกิดจริง (กีบ)</th><th class="num sortable">คงเหลือ (กีบ)</th><th class="sortable">% ใช้ไป</th><th class="sortable">สถานะ</th></tr></thead>
          <tbody>${deptRows}</tbody></table></div>`, { cls: 'card-flush' })
      + card(`ควบคุมงบตามกลุ่มบัญชี`, `<div class="table-scroll"><table class="data-table">
          <thead><tr><th>กลุ่มบัญชี</th><th class="num">งบทั้งปี</th><th class="num">เกิดจริง</th><th class="num">คงเหลือ</th><th>% ใช้ไป</th><th>สถานะ</th></tr></thead>
          <tbody>${grpRows}</tbody></table></div>`, { cls: 'card-flush' });
  }
  function varianceBind() { UI.enableSort(document.getElementById('varTable')); }

  return { dashboard, dashboardBind, departments, departmentsBind, analysis, analysisBind, control, controlBind, audit, actuals, actualsBind, pnl, pnlBind, variance, varianceBind };
})();

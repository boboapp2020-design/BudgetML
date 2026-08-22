/* =============================================================
 * pages-mgr.js — หน้าจอผู้จัดการฝ่าย (MANAGER)
 * ดูภาพรวมงบเฉพาะ "ฝ่าย" ของตนเอง (rollup ทุกแผนกในฝ่าย) · อ่านอย่างเดียว
 * ============================================================= */

const PagesMgr = (() => {
  const { fmt, fmtShort, deltaBadge, esc, card, pageHead, asOf } = UI;

  // การ์ด KPI ผู้จัดการ/ผู้บริหาร — ไม่ใช้ไอคอน เน้นตัวเลขใหญ่ชัด (icon/iconBg คงไว้เพื่อความเข้ากันได้ ไม่ใช้แล้ว)
  function kpiC(icon, iconBg, tint, label, valueHtml, sub) {
    return `<div class="kpi kpi-noic ${tint}">
      <div class="kpi-body"><div class="kpi-label">${label}</div>
      <div class="kpi-value">${valueHtml}</div><div class="kpi-sub">${sub}</div></div></div>`;
  }
  const ST_META = {
    SUBMITTED: { label: 'ส่งแล้ว รอตรวจ', color: '#256abf' }, ENDORSED: { label: 'ผจก.รับรองแล้ว', color: '#0d9488' }, LOCKED: { label: 'ปิดรอบแล้ว', color: '#52514e' },
    COMPLETED: { label: 'ครบ รอส่ง', color: '#0ca30c' }, IN_PROGRESS: { label: 'กำลังกรอก', color: '#eda100' },
    NEED_REVISION: { label: 'ตีกลับแก้ไข', color: '#d03b3b' }, DRAFT: { label: 'ยังไม่เริ่ม', color: '#c3c2b7' },
  };

  // หน่วยที่ผู้บริหารกำลัง "เจาะดู" (เลือกฝ่ายย่อยใน subtree ของตน) — default = หน่วยของตัวเอง
  function currentViewUnit(user) {
    const qs = parseQS();
    const ids = Store.subtreeUnits(user.orgUnit).map(x => x.unit.id);
    return (qs.u && ids.includes(qs.u)) ? qs.u : user.orgUnit;
  }

  function dashboard(user) {
    const year = UI.year(), prevYear = year - 1;
    const viewUnitId = currentViewUnit(user);
    const units = Store.subtreeUnits(user.orgUnit);
    const unit = Store.oversightUnit(viewUnitId) || { name: '(หน่วยงาน)' };
    const div = unit.name;
    const depts = Store.subtreeDepartments(viewUnitId);
    const kids = Store.childUnits(viewUnitId);
    const rv = Store.revisePhase(year);
    const dset = new Set(depts.map(d => d.id));

    const cur = depts.reduce((s, d) => s + Store.deptTotal(year, d.id), 0);
    const prev = depts.reduce((s, d) => s + Store.deptTotal(prevYear, d.id), 0);
    const orig = rv.on ? depts.reduce((s, d) => s + Store.originalDeptTotal(year, d.id), 0) : 0;
    const baseVal = rv.on ? orig : prev;
    const cmp = Store.compare(cur, baseVal);
    const baseLabel = rv.on ? 'งบเดิม (ORIGINAL)' : `ปี ${prevYear}`;

    // MTP รวมของฝ่าย
    let mtp1 = 0, mtp2 = 0;
    Store.db.budgets.filter(b => b.year === year && dset.has(b.departmentId)).forEach(b => { mtp1 += (b.mtp1 || 0); mtp2 += (b.mtp2 || 0); });
    const mtpPct = cur > 0 ? (mtp1 - cur) / cur * 100 : 0;

    // การกระจุกตัว
    const deptT = depts.map(d => ({ d, t: Store.deptTotal(year, d.id) })).sort((a, b) => b.t - a.t);
    const topShare = cur > 0 && deptT.length ? deptT[0].t / cur * 100 : 0;
    const top5Share = cur > 0 ? deptT.slice(0, 5).reduce((s, x) => s + x.t, 0) / cur * 100 : 0;

    // สถานะการส่ง
    const states = depts.map(d => Store.deptState(year, d.id).status);
    const cnt = {}; states.forEach(s => cnt[s] = (cnt[s] || 0) + 1);
    const submitted = (cnt.SUBMITTED || 0) + (cnt.ENDORSED || 0) + (cnt.LOCKED || 0);
    const stOrder = ['SUBMITTED', 'ENDORSED', 'LOCKED', 'COMPLETED', 'IN_PROGRESS', 'NEED_REVISION', 'DRAFT'];
    const segs = stOrder.filter(s => cnt[s]).map(s =>
      `<div class="status-seg" style="flex:${cnt[s]};background:${ST_META[s].color}" title="${ST_META[s].label}: ${cnt[s]}"></div>`).join('');
    const legends = stOrder.filter(s => cnt[s]).map(s =>
      `<span class="st-legend"><span class="dl-dot" style="background:${ST_META[s].color}"></span>${ST_META[s].label} <b>${cnt[s]}</b></span>`).join('');

    // โครงสร้างต้นทุน (GL group) — top cost driver
    const grp = {};
    depts.forEach(d => Store.deptGLs(d.id).forEach(g => { const gg = g.glGroup || 'อื่นๆ'; grp[gg] = (grp[gg] || 0) + Store.glTotal(year, d.id, g.id); }));
    const grpTop = Object.entries(grp).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const topCost = grpTop[0];

    // ตารางแผนก
    const rows = deptT.map(({ d, t }) => {
      const c = t, p = Store.deptTotal(prevYear, d.id);
      const o = rv.on ? Store.originalDeptTotal(year, d.id) : 0;
      const cc = Store.compare(c, rv.on ? o : p);
      const st = Store.deptState(year, d.id).status;
      const share = cur > 0 ? (c / cur * 100) : 0;
      const stOrd = ['DRAFT', 'IN_PROGRESS', 'NEED_REVISION', 'COMPLETED', 'SUBMITTED', 'LOCKED'].indexOf(st);
      const revCol = rv.on ? `<td class="num" data-v="${o}">${fmt(o)}</td>` : `<td class="num" data-v="${p}">${fmt(p)}</td>`;
      return `<tr>
        <td data-v="${esc(d.name)}"><a class="link" href="#/mgr/dept?d=${d.id}"><b>${esc(d.name)}</b></a><div class="muted small">${d.code}</div></td>
        ${revCol}
        <td class="num" data-v="${c}">${fmt(c)}</td>
        <td data-v="${cc.diff}">${deltaBadge(cc.diff, cc.pct)}</td>
        <td data-v="${share}"><div class="comp-bar"><div class="comp-fill" style="width:${share.toFixed(0)}%"></div></div>${share.toFixed(1)}%</td>
        <td data-v="${stOrd}"><span class="anomaly" style="background:${ST_META[st].color}22;color:${ST_META[st].color}">${ST_META[st].label}</span></td>
        <td class="td-actions">${st === 'SUBMITTED'
          ? `<button class="ghost-btn small" data-mgr-approve="${d.id}" style="color:#0d9488;font-weight:600">✓ รับรอง</button> <button class="ghost-btn small" data-mgr-return="${d.id}" title="ตีกลับให้แก้ไข">↩</button>`
          : st === 'ENDORSED' ? '<span class="muted small">✓ รับรองแล้ว</span>'
          : st === 'NEED_REVISION' ? '<span class="muted small">↩ ตีกลับแล้ว</span>' : '<span class="muted small">—</span>'}</td></tr>`;
    }).join('');
    const totalRow = `<tr class="tr-sum"><td><b>รวม${esc(div)} · ${depts.length} แผนก</b></td>${rv.on ? `<td class="num"><b>${fmt(orig)}</b></td>` : `<td class="num"><b>${fmt(prev)}</b></td>`}<td class="num"><b>${fmt(cur)}</b></td><td>${deltaBadge(cmp.diff, cmp.pct)}</td><td><b>100%</b></td><td></td><td></td></tr>`;

    // auto-insights
    const ins = [];
    if (topShare >= 35 && deptT[0]) ins.push({ c: 'amber', i: '🎯', t: `งบกระจุกที่ "${esc(deptT[0].d.name)}" ${topShare.toFixed(0)}%`, p: `แผนกเดียวถืองบ ${fmt(deptT[0].t)} กีบ — ควรตรวจสมมติฐานเป็นพิเศษ` });
    else if (top5Share >= 70 && depts.length > 5) ins.push({ c: 'amber', i: '🎯', t: `Top 5 แผนกถืองบ ${top5Share.toFixed(0)}%`, p: `กระจุกตัวสูง — อีก ${depts.length - 5} แผนกรวมกันแค่ ${(100 - top5Share).toFixed(0)}%` });
    if (topCost) ins.push({ c: 'blue', i: '🧱', t: `ต้นทุนหลัก: ${esc(topCost[0])} ${(topCost[1] / cur * 100).toFixed(0)}%`, p: `${fmt(topCost[1])} กีบ ของงบทั้งฝ่าย` });
    if (mtpPct >= 10) ins.push({ c: 'violet', i: '🧭', t: `แผน MTP โต +${mtpPct.toFixed(0)}% ปีถัดไป`, p: `จาก ${fmtShort(cur)} → ${fmtShort(mtp1)} กีบ — ต้องมีเหตุผลรองรับ` });
    if (submitted < depts.length) ins.push({ c: 'red', i: '📮', t: `ยังไม่ส่งงบ ${depts.length - submitted} แผนก`, p: `ส่งแล้ว ${submitted}/${depts.length} — ติดตามให้ครบก่อนปิดรอบ` });
    const insHtml = ins.length ? ins.map(x => `<div class="insit ${x.c}"><span class="ic">${x.i}</span><div><b>${x.t}</b><p>${x.p}</p></div></div>`).join('') : '<p class="muted">✓ ไม่พบประเด็นที่ต้องสังเกตเป็นพิเศษ</p>';

    return pageHead(`ภาพรวม${esc(div)} 📊`,
        `หน่วยกำกับดูแล · ${depts.length} แผนก · งบปี ${year} · ${esc(Store.db.meta.company)} · ${asOf()}`,
        `<button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>
         <button class="ghost-btn btn-green btn-push-right" id="exportMyXlsx" title="ดาวน์โหลด Excel (ML Form) เฉพาะฝ่าย/สายงานที่ท่านดูแล">⬇ Excel ฝ่ายของฉัน</button>`)

      + (units.length > 1 ? `<div class="mgr-view">
          <span class="mgr-view-lb">👁 ดูแยกฝ่าย / ศูนย์:</span>
          <select id="mgrViewUnit" class="mgr-view-sel">${units.map(({ unit: u, depth }) => `<option value="${u.id}" ${u.id === viewUnitId ? 'selected' : ''}>${'　'.repeat(depth)}${depth ? '└ ' : '▸ '}${esc(u.name)} · ${Store.subtreeDepartments(u.id).length} แผนก</option>`).join('')}</select>
          ${viewUnitId !== user.orgUnit ? `<a class="ghost-btn small" href="#/mgr/dashboard">↺ กลับดูทั้งหมด</a>` : ''}
        </div>` : '')

      + (cur === 0 && prev === 0 ? `<div class="lock-banner" style="background:#fff7e6;border-color:#f0c877;color:#7a4d09">📭 <b>ยังไม่มีข้อมูลงบปี ${year} ของแผนกในฝ่ายนี้</b> — ${year < Store.db.meta.yearCurrent ? 'ปีฐานมีข้อมูลเฉพาะหน่วยงานที่อยู่ในไฟล์งบปีนั้น (ด้านสนับสนุน/บริหารสำนักงาน) หากต้องการครบทุกฝ่าย ให้แผนกบัญชีนำเข้าไฟล์งบ/เกิดจริงของปีนั้นเพิ่ม' : 'แผนกยังไม่เริ่มกรอก — เลือกปีอื่นจากมุมบนเพื่อดูข้อมูลที่มี'}</div>` : '')
      + `<div class="kpi-grid kpi-grid-5">
        ${kpiC('🏢', '#e6f0fb', 'kpi-tint-blue', `งบรวมทั้งฝ่าย ปี ${year}`, `${fmtShort(cur)} <small>กีบ</small>`, fmt(cur) + ' กีบ')}
        ${kpiC(rv.on ? '🧊' : '🗓️', '#e6f7f0', 'kpi-tint-teal', baseLabel, `${fmtShort(baseVal)} <small>กีบ</small>`, `${(cmp.diff >= 0 ? '+' : '') + fmtShort(cmp.diff)} vs ปัจจุบัน`)}
        ${kpiC('🧭', '#f2edff', 'kpi-tint-blue', 'MTP แนวโน้มปีถัดไป', `${fmtShort(mtp1)} <small>กีบ</small>`, (mtpPct >= 0 ? '▲ +' : '▼ ') + mtpPct.toFixed(1) + '% vs ปีนี้')}
        ${kpiC('🎯', top5Share >= 70 ? '#fff7e6' : '#eaf6ea', 'kpi-tint-amber', 'การกระจุกตัว (Top 5)', `${top5Share.toFixed(0)}<small>%</small>`, deptT[0] ? `สูงสุด: ${esc(deptT[0].d.name.slice(0, 18))}` : '')}
        ${kpiC('📮', submitted === depts.length ? '#eaf6ea' : '#fff7e6', 'kpi-tint-amber', rv.on ? 'ส่ง Revise แล้ว' : 'ส่งงบแล้ว', `${submitted} <small>/ ${depts.length}</small>`, submitted === depts.length ? 'ครบทุกแผนก ✓' : `รออีก ${depts.length - submitted}`)}
      </div>`

      + card(`📮 สถานะการส่งของแผนกในฝ่าย`, `<div class="exec-status-bar">${segs}</div><div class="st-legends">${legends}</div>`)

      + `<div class="grid-2">`
      + card(`📈 งบรายเดือนของฝ่าย ปี ${year} (กีบ)`, `<div id="chMgrMonthly"></div>`)
      + card(`🍩 สัดส่วนงบ${kids.length ? 'ตามหน่วยย่อย' : 'ราย 6 แผนกสูงสุด'}`, `<div id="chMgrComp"></div>`)
      + `</div>`

      + `<div class="grid-2">`
      + card(`🧱 โครงสร้างต้นทุน — กลุ่มบัญชีสูงสุด (กีบ)`, `<div id="chMgrCost"></div>`)
      + card(`🔎 สิ่งที่ต้องสังเกต (Auto-insights)`, `<div class="ins">${insHtml}</div>`)
      + `</div>`

      + card(`🏢 แผนกภายใต้ ${esc(div)} (${depts.length}) — คลิกดูรายย่อย`, `<div class="table-scroll"><table class="data-table sortable-table" id="mgrDeptTable">
          <thead><tr><th class="sortable">แผนก</th><th class="num sortable">${rv.on ? 'งบเดิม' : 'ปี ' + prevYear} (กีบ)</th><th class="num sortable">ปี ${year} (กีบ)</th><th class="sortable">%Δ</th><th class="sortable">สัดส่วนในฝ่าย</th><th class="sortable">สถานะ</th><th>รับรอง</th></tr></thead>
          <tbody>${rows}${totalRow}</tbody></table></div>
          <p class="muted small" style="margin-top:6px">💡 คลิกหัวคอลัมน์เพื่อเรียง · คลิกชื่อแผนกเพื่อ drill</p>`, { cls: 'card-flush' });
  }

  function dashboardBind(user) {
    const year = UI.year();
    document.getElementById('exportMyXlsx')?.addEventListener('click', () => {
      UI.toast('กำลังสร้างไฟล์ Excel…');
      PagesAcc.exportForUser(user, 'xlsx').catch(e => UI.toast(e.message, 'err'));
    });
    const viewUnitId = currentViewUnit(user);
    const depts = Store.subtreeDepartments(viewUnitId);
    const kids = Store.childUnits(viewUnitId);
    const rv = Store.revisePhase(year);
    const dset = new Set(depts.map(d => d.id));
    UI.enableSort(document.getElementById('mgrDeptTable'));
    document.getElementById('mgrViewUnit')?.addEventListener('change', e => {
      const v = e.target.value;
      location.hash = (v === user.orgUnit) ? '#/mgr/dashboard' : '#/mgr/dashboard?u=' + v;
    });
    // รับรอง / ตีกลับ
    document.querySelectorAll('[data-mgr-approve]').forEach(b => b.addEventListener('click', () => {
      try { Store.mgrApprove(user, year, b.dataset.mgrApprove); UI.toast('รับรองงบแล้ว ✓ — ส่งต่อให้บัญชี'); App.render(); }
      catch (e) { UI.toast(e.message, 'err'); }
    }));
    document.querySelectorAll('[data-mgr-return]').forEach(b => b.addEventListener('click', () => {
      const deptId = b.dataset.mgrReturn;
      UI.modal(`↩ ตีกลับให้แก้ไข — ${UI.esc(Store.dept(deptId).name)}`,
        `<p>ระบุเหตุผลที่ต้องแก้ไข <b style="color:#c0392b">*</b> (บังคับ · แจ้งไปยังแผนก):</p><textarea id="mgrRetNote" rows="3" placeholder="เช่น ค่าใช้จ่ายเดินทางสูงผิดปกติ กรุณาทบทวน"></textarea>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: '↩ ยืนยันตีกลับ', cls: 'danger-btn', onClick: close => {
            const note = document.getElementById('mgrRetNote').value.trim();
            if (!note) { UI.toast('กรุณาระบุเหตุผลก่อนตีกลับ', 'err'); document.getElementById('mgrRetNote').focus(); return; }
            try { Store.mgrReturn(user, year, deptId, note); UI.toast('ตีกลับให้แผนกแก้ไขแล้ว'); close(); App.render(); }
            catch (e) { UI.toast(e.message, 'err'); }
          } },
      ]);
    }));

    // รายเดือน
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
    (Store.db.actuals || []).filter(a => a.year === year && dset.has(a.departmentId))
      .forEach(a => a.months.forEach((v, i) => { if (v) { actMonthly[i] += v; hasAct = true; } }));
    if (hasAct) series.push({ name: 'เกิดจริง', color: '#0ca30c', values: actMonthly.slice(0, Math.max(1, rv.thru || 12)) });
    Charts.line(document.getElementById('chMgrMonthly'), Store.MONTH_S, series);

    // สัดส่วน: ตามหน่วยย่อย (ถ้ามี) หรือ top 6 แผนก
    const compItems = [];
    if (kids.length) {
      kids.forEach((k, i) => { const t = Store.subtreeDepartments(k.id).reduce((s, d) => s + Store.deptTotal(year, d.id), 0); if (t > 0) compItems.push({ label: k.name, value: t, color: Charts.CAT[i % Charts.CAT.length] }); });
      // แผนกที่อยู่ในหน่วยนี้ตรง ๆ (ไม่ได้อยู่ใน child)
      const inKids = new Set(kids.flatMap(k => Store.subtreeDeptCodes(k.id)));
      const direct = depts.filter(d => !inKids.has(d.code)).reduce((s, d) => s + Store.deptTotal(year, d.id), 0);
      if (direct > 0) compItems.push({ label: 'หน่วยนี้โดยตรง', value: direct, color: Charts.CAT[kids.length % Charts.CAT.length] });
    } else {
      const dt = depts.map(d => ({ d, t: Store.deptTotal(year, d.id) })).filter(x => x.t > 0).sort((a, b) => b.t - a.t);
      dt.slice(0, 5).forEach((x, i) => compItems.push({ label: x.d.name, value: x.t, color: Charts.CAT[i % Charts.CAT.length] }));
      const rest = dt.slice(5).reduce((s, x) => s + x.t, 0);
      if (rest > 0) compItems.push({ label: 'อื่นๆ', value: rest, color: '#c3c2b7' });
    }
    if (compItems.length) Charts.donut(document.getElementById('chMgrComp'), compItems);

    // โครงสร้างต้นทุน (GL group)
    const grp = {};
    depts.forEach(d => Store.deptGLs(d.id).forEach(g => { const gg = g.glGroup || 'อื่นๆ'; grp[gg] = (grp[gg] || 0) + Store.glTotal(year, d.id, g.id); }));
    const total = Math.max(1, Object.values(grp).reduce((s, v) => s + v, 0));
    const top = Object.entries(grp).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    Charts.hbar(document.getElementById('chMgrCost'), top.map(([g, v]) => ({ label: g, value: v, color: Charts.CUR_C, sub: `${(v / total * 100).toFixed(1)}% ของฝ่าย<br>` })));
  }

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

    return pageHead(`${esc(d.name)}`, `รายย่อยงบปี ${year} · ${asOf()}`,
        `<a class="ghost-btn" href="#/mgr/dashboard">← กลับภาพรวมฝ่าย</a>`)
      + `<div class="breadcrumb"><a href="#/mgr/dashboard">← กลับภาพรวม${esc(unitName)}</a> › <b>${esc(d.name)}</b></div>`
      + `<div class="kpi-grid kpi-grid-4">
        ${kpiC('💵', '#e6f0fb', 'kpi-tint-blue', `งบปี ${year}`, `${fmtShort(cur)} <small>กีบ</small>`, fmt(cur) + ' กีบ')}
        ${kpiC(rv.on ? '🧊' : '🗓️', '#e6f7f0', 'kpi-tint-teal', rv.on ? 'งบเดิม' : `ปี ${prevYear}`, `${fmtShort(baseVal)} <small>กีบ</small>`, fmt(baseVal) + ' กีบ')}
        ${kpiC(cmp.diff >= 0 ? '📈' : '📉', cmp.diff >= 0 ? '#fdecec' : '#eaf6ea', 'kpi-tint-green', 'เพิ่ม/ลด', `<span>${deltaBadge(cmp.diff, cmp.pct)}</span>`, (cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff) + ' กีบ')}
        ${kpiC('📋', '#fff7e6', 'kpi-tint-amber', 'จำนวนรายการ', `${rows.length} <small>รายการ</small>`, 'GL × CCT')}
      </div>`
      + card('', `<div class="mgr-toolbar"><button id="mgrFsBtn" class="ghost-btn small btn-fs" title="ขยายตารางเกือบเต็มจอ (Esc เพื่อย่อกลับ)">⛶</button></div>
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
      fsBtn.textContent = on ? '✕' : '⛶';
      fsBtn.title = on ? 'ย่อกลับ (Esc)' : 'ขยายตารางเกือบเต็มจอ (Esc เพื่อย่อกลับ)';
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

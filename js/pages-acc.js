/* =============================================================
 * pages-acc.js — หน้าจอฝั่ง Accounting / Admin
 * หลักการ: ดู วิเคราะห์ ควบคุม — แต่แก้ตัวเลขของ User ไม่ได้
 * ============================================================= */

const PagesAcc = (() => {
  const { fmt, fmtPct, deltaBadge, esc, kpi, card, pageHead, asOf, toast } = UI;

  // การ์ด KPI แบบมีไอคอนสี (สไตล์เดียวกับหน้ากรอกงบ)
  function kpiC(icon, iconBg, tint, label, valueHtml, sub) {
    return `<div class="kpi kpi-noic ${tint}">
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

    // ---------- สรุปรายสังกัด (จัดกลุ่มตาม d.area = คอลัมน์สังกัด/CT) ----------
    const sides = Store.db.meta.sides || {};
    const affName = d => d.area || sides[d.side || (d.code || '')[0]] || 'อื่นๆ';   // สังกัด (CT)
    const affSide = d => d.side || (d.code || '')[0] || '1';                        // ด้าน (ไว้เลือกไอคอน/สี)
    const sideAgg = {};
    depts.forEach(d => {
      const key = affName(d);
      const t = Store.deptTotal(year, d.id);
      const a = sideAgg[key] = sideAgg[key] || { total: 0, n: 0, top: null, side: affSide(d) };
      a.total += t; a.n++;
      if (!a.top || t > a.top.t) a.top = { name: d.name, t };
    });
    const sideCards = Object.keys(sideAgg).sort().map(key => {
      const a = sideAgg[key], m = SIDE_META[a.side] || SIDE_META['1'];
      const share = cur > 0 ? a.total / cur * 100 : 0;
      return `<a class="side-card" style="--sc:${m.c};--scbg:${m.bg}" href="#/acc/departments">
        <div class="sc-head"><span>${m.icon}</span> ${esc(key)} <span class="sc-n">${a.n} แผนก</span></div>
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

    /* ========== FP&A: Variance เชิงเวลา (YTD) + Outlook + Insights ==========
     *  ข้อมูล 3 ชั้น: ORIGINAL (แผนอนุมัติ) · actuals (เกิดจริง ด.1-thru) · live (จริง+คาดการณ์)
     *  หลัก FP&A: เทียบจริงกับ "แผนช่วงเวลาเดียวกัน" (time-phased) ไม่ใช่แผนทั้งปี */
    const snap = (Store.db.budgetSnapshots || []).find(s => s.year === year && s.label === 'ORIGINAL');
    let thru = 0; actuals.forEach(a => a.months.forEach((v, i) => { if (v) thru = Math.max(thru, i + 1); }));
    const sumM = (m, n) => (m || []).slice(0, n).reduce((s, v) => s + (v || 0), 0);
    const glSap = {}; Store.db.glAccounts.forEach(g => { glSap[g.id] = g.glGroupSap || g.glGroup || 'อื่น ๆ'; });
    // จัดกลุ่มตาม "สังกัด" (d.area = คอลัมน์ CT) แทน "ด้าน" (d.side)
    const affMeta = Store.db.meta.sides || {};
    const affSideOf = {};   // ชื่อสังกัด → เลขด้าน (ไว้เลือกไอคอน/สี)
    const dSideOf = {}; depts.forEach(d => { const a = d.area || affMeta[d.side || (d.code || '')[0]] || 'อื่นๆ'; dSideOf[d.id] = a; affSideOf[a] = d.side || (d.code || '')[0] || '1'; });
    const fpa = { origYTD: 0, actYTD: 0, origFull: 0, bySide: {}, byGrp: {} };
    const sideBucket = s => fpa.bySide[s] = fpa.bySide[s] || { oY: 0, aY: 0, oF: 0, lF: 0 };
    const grpBucket = g => fpa.byGrp[g] = fpa.byGrp[g] || { oY: 0, aY: 0, oF: 0 };
    (snap ? snap.rows : []).forEach(r => {
      const oY = sumM(r.months, thru), oF = sumM(r.months, 12);
      fpa.origYTD += oY; fpa.origFull += oF;
      const sb = sideBucket(dSideOf[r.departmentId] || 'อื่นๆ'); sb.oY += oY; sb.oF += oF;
      const gb = grpBucket(glSap[r.glId]); gb.oY += oY; gb.oF += oF;
    });
    actuals.forEach(a => {
      const aY = sumM(a.months, thru);
      fpa.actYTD += aY;
      sideBucket(dSideOf[a.departmentId] || 'อื่นๆ').aY += aY;
      grpBucket(glSap[a.glId]).aY += aY;
    });
    bs.forEach(b => { sideBucket(dSideOf[b.departmentId] || 'อื่นๆ').lF += sumM(b.months, 12); });
    const ytdVar = fpa.actYTD - fpa.origYTD;                         // − = ต่ำกว่าแผน (favorable ด้านต้นทุน)
    const ytdPct = fpa.origYTD > 0 ? ytdVar / fpa.origYTD * 100 : 0;
    const outlook = cur - fpa.origFull;                              // งบล่าสุด (จริง+คาดการณ์) เทียบแผนเต็มปี
    const outlookPct = fpa.origFull > 0 ? outlook / fpa.origFull * 100 : 0;
    const runRate = thru > 0 ? fpa.actYTD / thru * 12 : 0;           // annualized run-rate
    // ต้นทุน/ตันอ้อย (ถ้ากรอกปริมาณแล้ว)
    const volCane = (Store.volume(year, 'caneCompany').actual ?? Store.volume(year, 'caneCompany').plan ?? 0)
                  + (Store.volume(year, 'caneCommunity').actual ?? Store.volume(year, 'caneCommunity').plan ?? 0);
    const costPerTon = volCane > 0 && fpa.actYTD > 0 ? fpa.actYTD / volCane : null;
    // Group Sap: top เกิน/ต่ำกว่าแผน YTD
    const grpRows = Object.entries(fpa.byGrp).map(([g, v]) => ({ g, ...v, dv: v.aY - v.oY }))
      .filter(x => Math.abs(x.dv) > 0);
    const grpOver = grpRows.filter(x => x.dv > 0).sort((a, b2) => b2.dv - a.dv).slice(0, 3);
    const grpUnder = grpRows.filter(x => x.dv < 0).sort((a, b2) => a.dv - b2.dv).slice(0, 3);
    // แผนก: outlook เกินแผนเต็มปี >5%
    const deptOver = snap ? depts.map(d => {
      const oF = snap.rows.filter(r => r.departmentId === d.id).reduce((s, r) => s + sumM(r.months, 12), 0);
      const lF = Store.deptTotal(year, d.id);
      return { d, oF, lF, dv: lF - oF };
    }).filter(x => x.oF > 0 && x.dv / x.oF > 0.05).sort((a, b2) => b2.dv - a.dv) : [];

    // ---------- Insights (กฎแบบ FP&A/audit — Fact ก่อน แล้วชี้ว่าต้องทำอะไร) ----------
    const insights = [];
    if (thru > 0) {
      insights.push({ sev: ytdVar <= 0 ? 'ok' : 'hi', ic: ytdVar <= 0 ? '✅' : '🔥',
        t: `<b>YTD (ด.1-${thru}):</b> เกิดจริง ${thShort(fpa.actYTD)} เทียบแผนช่วงเดียวกัน ${thShort(fpa.origYTD)} → ${ytdVar <= 0 ? 'ต่ำกว่าแผน' : 'เกินแผน'} ${thShort(Math.abs(ytdVar))} กีบ (${(ytdPct >= 0 ? '+' : '') + ytdPct.toFixed(1)}%)${ytdVar > 0 ? ' — ควรหาสาเหตุก่อนอนุมัติงบเพิ่ม' : ''}` });
      if (fpa.origFull > 0) insights.push({ sev: runRate > fpa.origFull * 1.05 ? 'hi' : runRate > fpa.origFull ? 'med' : 'ok', ic: '📈',
        t: `<b>Run-rate:</b> อัตราใช้จ่ายปัจจุบัน (${thShort(fpa.actYTD)}÷${thru} ด.×12) = ${thShort(runRate)} กีบ/ปี ${runRate > fpa.origFull ? `<b>สูงกว่าแผนเต็มปี ${((runRate / fpa.origFull - 1) * 100).toFixed(1)}%</b> — ถ้าคงอัตรานี้จะเกินงบ` : 'ยังอยู่ในกรอบแผนเต็มปี'}` });
    } else insights.push({ sev: 'info', ic: 'ℹ️', t: `ยังไม่มีตัวเลขเกิดจริงปี ${year} ในระบบ — ใส่ได้ที่ Budget Control → ใส่เกิดจริง (เปิดรอบ Revise ก่อน)` });
    if (snap && Math.abs(outlook) > 0.005 * fpa.origFull) insights.push({ sev: outlook > 0 ? 'med' : 'ok', ic: outlook > 0 ? '⚠️' : '💡',
      t: `<b>Outlook เต็มปี:</b> จริง+คาดการณ์ ${thShort(cur)} เทียบแผนอนุมัติ ${thShort(fpa.origFull)} → ${outlook > 0 ? 'จะเกิน' : 'ต่ำกว่า'}แผน ${thShort(Math.abs(outlook))} กีบ (${(outlookPct >= 0 ? '+' : '') + outlookPct.toFixed(1)}%)` });
    grpOver.forEach(x => insights.push({ sev: 'med', ic: '🔺',
      t: `<b>${esc(x.g)}</b> เกิดจริง YTD เกินแผน ${thShort(x.dv)} กีบ (แผน ${thShort(x.oY)} → จริง ${thShort(x.aY)})` }));
    if (deptOver.length) insights.push({ sev: 'med', ic: '🏢',
      t: `<b>${deptOver.length} แผนก</b> outlook เต็มปีเกินแผนอนุมัติ >5% — สูงสุด: ${deptOver.slice(0, 3).map(x => esc(x.d.name.replace('แผนก', '')) + ' +' + thShort(x.dv)).join(' · ')}` });
    // Red flags เชิงบัญชี (audit-brain)
    const taxGrp = fpa.byGrp['ภาษีนิติบุคคล'];
    if (taxGrp && taxGrp.oY > 0 && taxGrp.aY === 0) insights.push({ sev: 'hi', ic: '🚩',
      t: `<b>ภาษีเงินได้นิติบุคคล:</b> แผน YTD ${thShort(taxGrp.oY)} แต่เกิดจริง = 0 — ตรวจความครบถ้วนของการตั้งประมาณการภาษี (IAS 12)` });
    const fxKeys = Object.keys(fpa.byGrp).filter(g => g.includes('อัตราแลกเปลี่ยน'));
    const fxNet = fxKeys.reduce((s, g) => s + fpa.byGrp[g].aY, 0);
    if (Math.abs(fxNet) > 0.01 * (fpa.actYTD || 1)) insights.push({ sev: 'med', ic: '💱',
      t: `<b>อัตราแลกเปลี่ยน:</b> ผลกระทบสุทธิ YTD ${fxNet >= 0 ? 'ขาดทุน' : 'กำไร'} ${thShort(Math.abs(fxNet))} กีบ — ความผันผวน FX มีนัยสำคัญ ควรทบทวนนโยบายป้องกันความเสี่ยง (IAS 21)` });
    if (costPerTon) insights.push({ sev: 'info', ic: '🏭',
      t: `<b>ต้นทุน/ตันอ้อย (YTD):</b> ${fmt(Math.round(costPerTon))} กีบ/ตัน (ปริมาณ ${fmt(Math.round(volCane))} ตัน) — <a class="link" href="#/unitcost">ดูรายละเอียดต้นทุนต่อหน่วย →</a>` });
    else insights.push({ sev: 'info', ic: '🏭', t: `ยังไม่ได้กรอกปริมาณอ้อยปี ${year} — <a class="link" href="#/unitcost">กรอกที่หน้าต้นทุนต่อหน่วย</a> เพื่อดูต้นทุน กีบ/ตันอ้อย · กีบ/ตันน้ำตาล` });
    const insHtml = insights.map(i => `<div class="fpa-ins fpa-${i.sev}"><span class="fi-ic">${i.ic}</span><span>${i.t}</span></div>`).join('');

    // ---------- ตาราง Variance รายสังกัด ----------
    const sidesMeta = Store.db.meta.sides || {};
    const sideVarRows = Object.keys(fpa.bySide).sort().map(s => {
      const v = fpa.bySide[s];
      const dv = v.aY - v.oY, dp = v.oY > 0 ? dv / v.oY * 100 : 0;
      const fo = v.lF - v.oF, fop = v.oF > 0 ? fo / v.oF * 100 : 0;
      return `<tr>
        <td>${(SIDE_META[affSideOf[s]] || {}).icon || ''} ${esc(s)}</td>
        <td class="num">${fmt(Math.round(v.oY))}</td><td class="num">${fmt(Math.round(v.aY))}</td>
        <td class="num ${dv > 0 ? 'txt-up' : dv < 0 ? 'txt-down' : ''}">${(dv >= 0 ? '+' : '') + fmt(Math.round(dv))}</td>
        <td>${deltaBadge(dv, dp)}</td>
        <td class="num muted">${fmt(Math.round(v.oF))}</td><td class="num">${fmt(Math.round(v.lF))}</td>
        <td>${deltaBadge(fo, fop)}</td></tr>`;
    }).join('');
    const sv = Object.values(fpa.bySide).reduce((a, v) => ({ oY: a.oY + v.oY, aY: a.aY + v.aY, oF: a.oF + v.oF, lF: a.lF + v.lF }), { oY: 0, aY: 0, oF: 0, lF: 0 });
    const fpaHtml = (thru > 0 || snap) ? `
      <div class="grid-2 fpa-wrap">
        ${card(`🧠 Insights — วิเคราะห์อัตโนมัติ (FP&A)`, `<div class="fpa-list">${insHtml}</div>`)}
        ${card(`🎯 Variance รายสังกัด — จริง YTD (ด.1-${thru || '—'}) เทียบแผนช่วงเดียวกัน + Outlook เต็มปี`, `
          <div class="table-scroll"><table class="data-table small">
            <thead><tr><th>สังกัด</th><th class="num">แผน YTD</th><th class="num">จริง YTD</th><th class="num">ผลต่าง</th><th>%</th><th class="num">แผนเต็มปี</th><th class="num">Outlook</th><th>%</th></tr></thead>
            <tbody>${sideVarRows}
              <tr class="tr-sum"><td><b>รวม</b></td><td class="num"><b>${fmt(Math.round(sv.oY))}</b></td><td class="num"><b>${fmt(Math.round(sv.aY))}</b></td>
                <td class="num"><b>${(sv.aY - sv.oY >= 0 ? '+' : '') + fmt(Math.round(sv.aY - sv.oY))}</b></td><td>${deltaBadge(sv.aY - sv.oY, sv.oY > 0 ? (sv.aY - sv.oY) / sv.oY * 100 : 0)}</td>
                <td class="num muted"><b>${fmt(Math.round(sv.oF))}</b></td><td class="num"><b>${fmt(Math.round(sv.lF))}</b></td><td>${deltaBadge(sv.lF - sv.oF, sv.oF > 0 ? (sv.lF - sv.oF) / sv.oF * 100 : 0)}</td></tr>
            </tbody></table></div>
          <p class="muted small" style="margin-top:6px">หลัก FP&A: เทียบเกิดจริงกับ "แผนช่วงเวลาเดียวกัน" (time-phased) · Outlook = เกิดจริง+คาดการณ์ทั้งปี เทียบแผนอนุมัติ (ORIGINAL) · ผลต่างสีแดง = เกินแผน (ด้านต้นทุน)</p>`)}
      </div>` : '';

    // ---------- Hero chip ----------
    const phaseChip = rv.on
      ? `<span class="eh-chip eh-chip-rv">🔁 รอบ Revise · เกิดจริงถึง ด.${rv.thru}</span>`
      : pd.status === 'OPEN'
        ? `<span class="eh-chip">🟢 เปิดรับข้อมูล</span>`
        : `<span class="eh-chip">🔒 ปิดรอบแล้ว</span>`;

    return pageHead(`Executive Dashboard 📊`,
        `ภาพรวมงบประมาณทั้งบริษัท ปี ${year} · ${esc(Store.db.meta.company)} · ${asOf()}`,
        `<button class="present-btn" id="presentBtn">🎤 โหมดนำเสนอ</button>
         <button class="ghost-btn" onclick="Store.exportDeptSummary(${year})">⬇ Export สรุปหน่วยงาน</button>
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
              <div class="ehs-label">${rv.on ? '🔁 Revise เทียบงบเดิม' : '🎯 เทียบแผนอนุมัติ (ORIGINAL)'}</div>
              <div class="ehs-val">${rv.on
                ? (Math.abs(rvDiff) < 0.5 ? '± 0' : (rvDiff > 0 ? '+' : '−') + thShort(Math.abs(rvDiff))) + ' <small>กีบ</small>'
                : (snap ? (Math.abs(outlook) < 0.5 ? '± 0' : (outlook > 0 ? '+' : '−') + thShort(Math.abs(outlook))) + ' <small>กีบ</small>' : '<small>ยังไม่ freeze แผน</small>')}</div>
              <div class="ehs-sub">${rv.on
                ? `งบเดิม ${thShort(origTotal)} กีบ · ${(rvPct >= 0 ? '+' : '') + rvPct.toFixed(2)}%`
                : (snap ? `แผนอนุมัติ ${thShort(fpa.origFull)} กีบ · ${(outlookPct >= 0 ? '+' : '') + outlookPct.toFixed(2)}%` : 'จะ freeze อัตโนมัติตอนปิดรอบ & Lock')}</div>
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

      + fpaHtml

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
    document.getElementById('presentBtn')?.addEventListener('click', () => openPresent(year));

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
    if (qs.d && qs.edit) return drillDeptEdit(user, qs.d);
    if (qs.d) return drillDept(user, qs.d);

    const sides = Store.db.meta.sides || {};
    const affOf = d => d.area || (Store.db.meta.sides || {})[d.side || (d.code || '')[0]] || 'อื่นๆ';   // สังกัด (CT)
    const depts = Store.activeDepartments().slice().sort((a, b) => affOf(a).localeCompare(affOf(b)) || a.code.localeCompare(b.code));
    const totCur = depts.reduce((s, d) => s + Store.deptTotal(year, d.id), 0);
    const totPrev = depts.reduce((s, d) => s + Store.deptTotal(prevYear, d.id), 0);
    const totCmp = Store.compare(totCur, totPrev);
    const deptTotalRow = `<tr class="tr-sum"><td></td><td><b>รวมทั้งบริษัท · ${depts.length} หน่วยงาน</b></td><td class="num"><b>${fmt(totPrev)}</b></td><td class="num"><b>${fmt(totCur)}</b></td><td class="num"><b>${(totCmp.diff >= 0 ? '+' : '') + fmt(totCmp.diff)}</b></td><td>${deltaBadge(totCmp.diff, totCmp.pct)}</td><td></td><td></td><td></td></tr>`;
    let lastSide = null;
    const rows = depts.map(d => {
      const cur = Store.deptTotal(year, d.id), prev = Store.deptTotal(prevYear, d.id);
      const cmp = Store.compare(cur, prev);
      const comp = Store.completion(year, d.id);
      const st = Store.deptState(year, d.id);
      const aff = d.area || sides[d.side || (d.code || '')[0]] || 'อื่นๆ';   // สังกัด (CT)
      let head = '';
      if (aff !== lastSide) {
        lastSide = aff;
        const n = depts.filter(x => (x.area || sides[x.side || (x.code || '')[0]] || 'อื่นๆ') === aff).length;
        head = `<tr class="side-row"><td colspan="9">${esc(aff)} · ${n} หน่วยงาน</td></tr>`;
      }
      return `${head}<tr>
        <td class="chk-col"><input type="checkbox" class="dsel" value="${d.id}"></td>
        <td><a class="link" href="#/acc/departments?d=${d.id}"><b>${esc(d.name)}</b></a><div class="muted small">${d.code}</div></td>
        <td class="num">${fmt(prev)}</td><td class="num">${fmt(cur)}</td>
        <td class="num ${cmp.diff > 0 ? 'txt-up' : cmp.diff < 0 ? 'txt-down' : ''}">${(cmp.diff >= 0 ? '+' : '') + fmt(cmp.diff)}</td>
        <td>${deltaBadge(cmp.diff, cmp.pct)}</td>
        <td><div class="comp-bar"><div class="comp-fill ${comp.pct === 100 ? 'full' : ''}" style="width:${comp.pct}%"></div></div>${comp.pct}%</td>
        <td class="st-lock-col"><button class="lock-ic-btn" data-tlock="${d.id}" data-locked="${st.status === 'LOCKED' ? 1 : 0}"
          title="${st.status === 'LOCKED' ? 'แผนกนี้ถูกล็อก — คลิกเพื่อปลดล็อกให้แก้ไข' : 'แผนกนี้เปิดให้แก้ไข — คลิกเพื่อล็อกแผนกนี้'}">${UI.statusLock(st.status)}</button></td>
        <td class="td-actions"><div class="act-btns">
          <a class="act-ic" href="#/acc/departments?d=${d.id}" title="ดูรายละเอียด (Drill-down)">🔍</a>
          ${['SUBMITTED', 'ENDORSED'].includes(st.status) ? `<button class="act-ic act-rev" data-revise="${d.id}" title="ตีกลับให้แก้ไข (พร้อมเหตุผล) — ปลดล็อกเฉพาะแผนกนี้">↩</button>` : ''}
        </div></td></tr>`;
    }).join('');
    // ตัวเลือกฝ่าย (ชั้นผู้อนุมัติ) สำหรับตีกลับยกฝ่าย — แสดงเฉพาะฝ่ายที่มีแผนกใต้สังกัด
    const divOpts = (Store.db.oversight || []).filter(n => n.approver)
      .map(n => ({ n, codes: Store.subtreeDeptCodes(n.id) })).filter(x => x.codes.length)
      .map(x => `<option value="${x.n.id}">${esc(x.n.name)} · ${x.codes.length} แผนก</option>`).join('');
    const bulkBar = `<div class="bulk-bar">
        <b>↩ ตีกลับหลายแผนก:</b>
        <button id="bulkReviseBtn" class="danger-btn small" disabled>ตีกลับที่เลือก (<span id="bulkCount">0</span>)</button>
        <span class="muted small">หรือยกฝ่าย:</span>
        <select id="bulkDivSel"><option value="">— เลือกฝ่าย —</option>${divOpts}</select>
        <button id="bulkDivBtn" class="ghost-btn small">↩ ตีกลับยกฝ่าย</button>
      </div>`;

    return pageHead(`หน่วยงานทั้งหมด — งบปี ${year}`, `Company → Department → GL → รายเดือน → เหตุผล · ${asOf()}`,
        `<button class="ghost-btn btn-green" id="exportMLXlsx" title="ไฟล์ Excel โครงคอลัมน์ A→CT ตรงตามไฟล์ ML_งบค่าใช้จ่าย (งบต้นปี/ล่าสุด/เกิดจริง + จำแนกครบ)">⬇ Excel (ML Form)</button>
         <button class="ghost-btn" id="exportMLCsv" title="CSV โครงเดียวกับไฟล์ ML">⬇ CSV (ML Form)</button>
         <button class="ghost-btn" onclick="Store.exportDeptSummary(${year})" title="สรุปยอดรายหน่วยงานแบบย่อ">⬇ CSV สรุป</button>`)
      + `<div class="breadcrumb"><b>ทุกหน่วยงาน</b></div>`
      + card('', `${bulkBar}<div class="table-scroll"><table class="data-table">
        <thead><tr><th class="chk-col"><input type="checkbox" id="dselAll" title="เลือก/ยกเลิกทั้งหมด"></th><th>หน่วยงาน</th><th class="num">ปี ${prevYear} (กีบ)</th><th class="num">ปี ${year} (กีบ)</th>
        <th class="num">ผลต่าง (กีบ)</th><th>%</th><th>ความครบถ้วน</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${rows}${deptTotalRow}</tbody></table></div>`, { cls: 'card-flush' });
  }

  /* ---------- Export แบบไฟล์ ML_งบค่าใช้จ่าย (โครงคอลัมน์ A→CT ตรงตำแหน่งไฟล์จริง) ----------
   *  A codeA · B IO · C CCT · D ชื่อหน่วยงาน · E รหัสแผนก · F แผนก · G GL · H ชื่อบัญชี
   *  I-T งบต้นปี 12 เดือน (ORIGINAL) · U รวม · V เพิ่ม-ลด · W รวมหลังปรับ
   *  X-AI งบล่าสุด/Revise 12 เดือน (ตัว live) · AJ รวม · AM-AX เกิดจริง 12 เดือน · AY รวมเกิดจริง
   *  CK หน่วยงานที่รับผิดชอบ · CL Group GL PPT · CM Group Sap · CN-CO ฝ่ายย่อย · CP ฝ่าย · CQ รหัสด้าน · CR ด้าน · CS Type · CT สังกัด */
  function buildMLRows(year, allowSet) {   // allowSet = Set(departmentId) จำกัดสิทธิ์ · null/undefined = ทั้งบริษัท
    const NCOL = 100;   // A→CU ตรงตามไฟล์ตัวอย่าง (0-99) — ครบทุกคอลัมน์ ไม่มีช่องโหว่
    const db = Store.db;
    // master maps
    const cctInfo = {}; (db.cctMaster || []).forEach(c => { cctInfo[c.code] = c; });
    const glInfo = {}; db.glAccounts.forEach(g => { glInfo[g.id] = g; });
    const deptInfo = {}; db.departments.forEach(d => { deptInfo[d.id] = d; });
    // ข้อมูลจำแนกเต็มจากไฟล์ (resp/ฝ่ายย่อย/ฝ่าย/ด้าน/สังกัด) — จาก SEED_DATA
    const rich = {}; // cct|glcode -> unit meta + row meta
    (typeof SEED_DATA !== 'undefined' ? SEED_DATA.units : []).forEach(u => u.rows.forEach(r => {
      rich[r.cct + '|' + r.gl] = { resp: r.resp || '', u };
    }));
    const num = v => (v === null || v === undefined) ? 0 : v;
    const sum = a => (a || []).reduce((s, v) => s + num(v), 0);
    const orig = k => { const s = (db.budgetSnapshots || []).find(x => x.year === year && x.label === 'ORIGINAL'); return s ? s.rows.find(r => r.departmentId === k[0] && r.glId === k[1] && r.cct === k[2]) : null; };
    // index budgets/actuals/snapshot by dept|gl|cct
    const bIdx = {}, aIdx = {}, oIdx = {}, mIdx = {};
    db.budgets.filter(b => b.year === year).forEach(b => { const k = b.departmentId + '|' + b.glId + '|' + b.cct; bIdx[k] = b.months; mIdx[k] = { mtp1: b.mtp1, mtp2: b.mtp2 }; });
    (db.actuals || []).filter(a => a.year === year).forEach(a => { aIdx[a.departmentId + '|' + a.glId + '|' + a.cct] = a.months; });
    const snap = (db.budgetSnapshots || []).find(x => x.year === year && x.label === 'ORIGINAL');
    if (snap) snap.rows.forEach(r => { oIdx[r.departmentId + '|' + r.glId + '|' + r.cct] = r.months; });

    const out = [];
    // แถวหัว (ตรงตำแหน่งไฟล์: แถว 6 = section, แถว 7 = header) — แถว 1-5 เว้นเป็นชื่อรายงาน
    const blank = () => Array(NCOL).fill('');
    const r1 = blank(); r1[0] = year;
    const r2 = blank(); r2[0] = Store.db.meta.company;
    const r3 = blank(); r3[0] = 'งบประมาณค่าใช้จ่าย ปี' + year + ' (export จากระบบ)';
    const r4 = blank(); r4[0] = 'หน่วย : กีบ';
    const r5 = blank();
    const y1 = year + 1, y2 = year + 2, y3 = year + 3;
    const r6 = blank();   // แถวหัวข้อกลุ่ม (section)
    r6[8] = 'งบต้นปี ' + year; r6[23] = 'งบประมาณ ' + year + ' - ล่าสุด (Revise/Live)'; r6[38] = 'เกิดจริงสะสม ปี ' + year;
    r6[51] = 'คาดการณ์ ปี ' + year; r6[63] = 'งบต้นปี ' + y1; r6[76] = 'ผลต่างงบต้นปี ' + y1;
    r6[80] = 'งบประมาณ MTP ' + y2 + '-' + y3; r6[82] = 'งบประมาณ MTP ' + y1 + '-' + y3; r6[85] = 'งบประมาณ MTP ' + y1 + '-' + y3;
    const r7 = blank();
    const MTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const yy = String(year).slice(2), yy1 = String(y1).slice(2);
    r7[0] = 'code a'; r7[1] = 'IO / รหัสงบประมาณ'; r7[2] = 'รหัสหน่วยงาน/CCT'; r7[3] = 'ชื่อหน่วยงาน';
    r7[4] = 'รหัสแผนก'; r7[5] = 'แผนก'; r7[6] = 'รหัสบัญชี /GL'; r7[7] = 'ชื่อบัญชี';
    MTH.forEach((m, i) => { r7[8 + i] = m + '-' + yy; r7[23 + i] = m + '-' + yy; r7[38 + i] = m + '-' + yy; r7[63 + i] = m + '-' + yy1; });
    r7[20] = 'งบประมาณ 12เดือน ' + year + ' งบต้นปี'; r7[21] = 'เพิ่ม - ลดระหว่างปี ' + year; r7[22] = 'งบประมาณ 12เดือน ' + year;
    r7[35] = 'งบประมาณ 12เดือน ' + year + ' ล่าสุด'; r7[36] = 'เพิ่ม - ลดระหว่างปี ' + year; r7[37] = 'งบประมาณ 12เดือน ' + year + ' ล่าสุด';
    r7[50] = 'รวมงบเกิดจริง 12เดือน ' + year;
    // คาดการณ์ (เดือน 4-12) + PR+PO + รวม
    ['เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'].forEach((m, i) => { r7[51 + i] = m + '-' + yy; });
    r7[60] = 'PR+PO'; r7[61] = 'รวมคาดการณ์ ' + year; r7[62] = 'รวมเกิดจริง+คาดการณ์ ' + year;
    // งบปีถัดไป + MTP
    r7[75] = 'งบต้นปี ' + y1; r7[76] = 'งบประมาณ เพิ่ม - (ลด)'; r7[77] = '% เพิ่ม - (ลด)';
    r7[78] = 'สมมติฐาน ' + y1; r7[79] = 'สาเหตุ เพิ่ม - (ลด) ' + y1;
    r7[80] = 'ปี ' + y2; r7[81] = 'ปี ' + y3; r7[82] = 'ปี ' + y1; r7[83] = 'ปี ' + y2; r7[84] = 'ปี ' + y3;
    r7[85] = 'ปี ' + y1; r7[86] = 'ปี ' + y2; r7[87] = 'ปี ' + y3;
    r7[88] = 'หน่วยงานที่รับผิดชอบ'; r7[89] = 'Group GL PPT'; r7[90] = 'Group Sap'; r7[91] = 'รหัสฝ่ายย่อย'; r7[92] = 'ฝ่ายย่อย';
    r7[93] = 'ฝ่าย'; r7[94] = 'รหัสด้าน'; r7[95] = 'ด้าน'; r7[96] = 'Type'; r7[97] = 'สังกัด';
    r7[98] = 'PL/โสหุ้ย'; r7[99] = 'Cost structure Name';
    out.push(r1, r2, r3, r4, r5, r6, r7);

    // แถวข้อมูล — เรียงตาม แผนก → GL → CCT
    const rows = (db.departmentRows || []).slice().sort((a, b) => {
      const da = deptInfo[a.departmentId]?.code || '', db2 = deptInfo[b.departmentId]?.code || '';
      return da.localeCompare(db2) || (glInfo[a.glId]?.code || '').localeCompare(glInfo[b.glId]?.code || '') || a.cct.localeCompare(b.cct);
    });
    rows.forEach(x => {
      if (allowSet && !allowSet.has(x.departmentId)) return;   // จำกัดเฉพาะแผนก/ฝ่ายที่มีสิทธิ์
      const key = x.departmentId + '|' + x.glId + '|' + x.cct;
      const g = glInfo[x.glId] || {}; const cc = cctInfo[x.cct] || {};
      const ownerDept = deptInfo[cc.departmentId] || deptInfo[x.departmentId] || {};   // แผนกเจ้าของตามไฟล์ (จาก CCT)
      const rr = rich[x.cct + '|' + (g.code || '')] || {}; const u = rr.u || {};
      const live = bIdx[key] || Array(12).fill(null);
      const act = aIdx[key] || Array(12).fill(null);
      const og = oIdx[key] || Array(12).fill(null);
      const row = blank();
      row[0] = x.codeA || ''; row[1] = x.io || ''; row[2] = x.cct; row[3] = cc.name || u.name || '';
      row[4] = ownerDept.code || ''; row[5] = ownerDept.name || ''; row[6] = g.code || ''; row[7] = g.name || '';
      for (let i = 0; i < 12; i++) { row[8 + i] = num(og[i]); row[23 + i] = num(live[i]); row[38 + i] = num(act[i]); }
      row[20] = sum(og); row[21] = sum(live) - sum(og); row[22] = sum(live);
      row[35] = sum(live); row[36] = 0; row[37] = sum(live);
      row[50] = sum(act);
      row[88] = rr.resp || ''; row[89] = g.glGroup || ''; row[90] = g.glGroupSap || '';
      row[91] = u.subDivCode || ''; row[92] = u.subDiv || ''; row[93] = u.div || '';
      // ด้าน (94-95) = จากด้าน/side ของแผนก · สังกัด (97) = คอลัมน์ CT (u.area)
      row[94] = ownerDept.side || ''; row[95] = (db.meta.sides || {})[ownerDept.side] || ''; row[96] = g.glType || ''; row[97] = u.area || '';
      // 51-74: คาดการณ์ + งบปีถัดไปรายเดือน (ระบบไม่มีข้อมูลนี้ → 0 ตามไฟล์ · ไม่ให้เป็นช่องว่าง)
      for (let i = 51; i <= 74; i++) row[i] = 0;
      row[62] = sum(act);                                   // รวมเกิดจริง+คาดการณ์
      // 75-87: งบปีถัดไป + MTP (จาก mtp1/mtp2 ที่ระบบมี)
      const m1 = mIdx[key] ? (typeof mIdx[key].mtp1 === 'number' ? mIdx[key].mtp1 : 0) : 0;
      const m2 = mIdx[key] ? (typeof mIdx[key].mtp2 === 'number' ? mIdx[key].mtp2 : 0) : 0;
      row[75] = m1; row[76] = m1 - sum(live); row[77] = sum(live) ? (m1 - sum(live)) / sum(live) : 0;
      row[80] = m2; row[81] = 0; row[82] = m1; row[83] = m2; row[84] = 0; row[85] = m1; row[86] = m2; row[87] = 0;
      // PL/โสหุ้ย + Cost structure Name — ยึดจาก GL (pptCode → หมวดต้นทุน)
      const _ppt = Number(g.pptCode) || 0;
      row[98] = _ppt ? ((_ppt >= 1 && _ppt <= 22) ? 'PL' : 'โสหุ้ย') : '';   // 1-22 = ต้นทุนการผลิต (PL) · ที่เหลือ = โสหุ้ย
      row[99] = (db.meta.pptCategories || {})[_ppt] || g.glGroupSap || '';    // ชื่อหมวดต้นทุน (Cost structure)
      out.push(row);
    });
    return out;
  }
  // ขอบเขตสิทธิ์: แอดมิน=ทั้งบริษัท · ผู้จัดการ=แผนกในสายงานตน · ผู้กรอก=แผนกตนเอง
  function scopeDeptIds(user) {
    if (!user || user.role === 'ACCOUNTING') return null;
    if (user.role === 'MANAGER') {
      const codes = new Set(Store.subtreeDeptCodes(user.orgUnit));
      return new Set(Store.activeDepartments().filter(d => codes.has(d.code)).map(d => d.id));
    }
    return new Set(user.departmentId ? [user.departmentId] : []);
  }
  function scopeLabel(user) {
    if (!user || user.role === 'ACCOUNTING') return 'ทั้งบริษัท';
    if (user.role === 'MANAGER') return (user.name || 'ฝ่าย').replace(/[\\/:*?"<>|]/g, '');
    return (Store.dept(user.departmentId) || {}).name || 'แผนก';
  }
  const exportForUser = (user, kind) => exportML(kind, scopeDeptIds(user), scopeLabel(user));

  async function exportML(kind, allowSet, fnameSuffix) {
    const year = UI.year();
    const aoa = buildMLRows(year, allowSet);
    const fname = 'ML_งบค่าใช้จ่าย_' + year + (fnameSuffix ? '_' + fnameSuffix : '_export');
    if (kind === 'csv') {
      const csv = aoa.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname + '.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } else {
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = Array(100).fill({ wch: 13 }); ws['!cols'][0] = { wch: 20 }; ws['!cols'][1] = { wch: 16 }; ws['!cols'][3] = { wch: 26 }; ws['!cols'][5] = { wch: 26 }; ws['!cols'][7] = { wch: 32 }; ws['!cols'][99] = { wch: 26 };
      // ---- จัดรูปแบบตาราง (ต้องใช้ xlsx-js-style) ----
      const canStyle = !!(XLSX.version && window.XLSX === XLSX); // xlsx-js-style เก็บ style ผ่าน cell.s
      const BD = c => ({ style: 'thin', color: { rgb: c } });
      const border = { top: BD('B8C4D8'), bottom: BD('B8C4D8'), left: BD('B8C4D8'), right: BD('B8C4D8') };
      const SEC = [ // [c0, c1, สีพื้น section (r6), สีพื้นหัวเดือน (r7)]
        [8, 22, 'DDEBF7', '9DC3E6'],   // งบต้นปี — ฟ้าอ่อน
        [23, 37, 'E2EFDA', 'A9D18E'],  // งบล่าสุด/Revise — เขียวอ่อน
        [38, 50, 'BDD7EE', '8EAADB'],  // เกิดจริง — ฟ้า (ตามไฟล์)
        [51, 62, 'FCE4D6', 'F4B183'],  // คาดการณ์ — ส้มอ่อน
        [63, 79, 'EDEDED', 'D0CECE'],  // งบปีถัดไป — เทาอ่อน
        [80, 87, 'E2EFDA', 'A9D18E'],  // MTP — เขียวอ่อน
        [88, 99, 'FFF2CC', 'FFD966'],  // จำแนก master + PL/Cost — เหลืองอ่อน
      ];
      const setS = (r, c, s) => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a]) ws[a].s = s; };
      // ชื่อรายงาน (แถว 1-4)
      for (let r = 0; r < 4; r++) setS(r, 0, { font: { bold: r === 2, sz: r === 2 ? 14 : 11, color: { rgb: '16233A' } } });
      // แถว 6: section headers (merge + สี)
      ws['!merges'] = SEC.map(x => ({ s: { r: 5, c: x[0] }, e: { r: 5, c: x[1] } }));
      SEC.forEach(x => { for (let c = x[0]; c <= x[1]; c++) setS(5, c, { fill: { fgColor: { rgb: x[2] } }, font: { bold: true, sz: 12, color: { rgb: '1F3864' } }, alignment: { horizontal: 'center', vertical: 'center' }, border }); });
      // แถว 7: หัวคอลัมน์
      const hdrBase = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '4472C4' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border };
      for (let c = 0; c <= 7; c++) setS(6, c, hdrBase);
      SEC.forEach(x => { for (let c = x[0]; c <= x[1]; c++) setS(6, c, { ...hdrBase, fill: { fgColor: { rgb: x[3] } }, font: { ...hdrBase.font, color: { rgb: '1F3864' } } }); });
      // แถวข้อมูล: เส้นขอบ + ฟอร์แมตเลข + แถบสีสลับ + คอลัมน์รวมเน้น
      const TOTCOLS = new Set([20, 21, 22, 35, 36, 37, 50, 61, 62, 75, 76, 80, 81, 82, 83, 84, 85, 86, 87]);
      const COLS = []; for (let c = 0; c <= 99; c++) COLS.push(c);   // ทุกคอลัมน์ (0-99) มีเส้นขอบ/ฟอร์แมต ไม่มีช่องโหว่
      for (let r = 7; r < aoa.length; r++) {
        const zebra = (r % 2 === 1) ? 'F6F9FE' : 'FFFFFF';
        for (const c of COLS) {
          const a = XLSX.utils.encode_cell({ r, c }); const cell = ws[a]; if (!cell) continue;
          const isNum = typeof cell.v === 'number';
          cell.s = { border, fill: { fgColor: { rgb: TOTCOLS.has(c) ? 'EDF2FB' : zebra } },
            font: { sz: 10, bold: TOTCOLS.has(c), color: { rgb: '16233A' } },
            alignment: { horizontal: isNum ? 'right' : 'left', vertical: 'center' } };
          if (isNum) cell.z = (c === 77) ? '0%' : '#,##0';
        }
      }
      ws['!rows'] = []; ws['!rows'][5] = { hpt: 22 }; ws['!rows'][6] = { hpt: 30 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ML_งบค่าใช้จ่าย');
      XLSX.writeFile(wb, fname + '.xlsx');
    }
    toast('Export ' + (kind === 'csv' ? 'CSV' : 'Excel') + ' แล้ว (' + (aoa.length - 7) + ' แถว · โครงคอลัมน์ตามไฟล์ ML)');
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
        `<button class="ghost-btn" data-drill-back title="กลับไปหน้าหน่วยงาน & Drill-down">← กลับ</button>
         <span class="pa-right"><a class="primary-btn" href="#/acc/departments?d=${deptId}&edit=1" title="โหมดแอดมิน — แก้งบรายเดือนของหน่วยงานนี้ได้ทุกช่อง (บันทึก Audit Log)">✏️ แก้ไขงบรายเดือน</a>
         ${['SUBMITTED', 'ENDORSED', 'LOCKED'].includes(st.status) ? `<button class="danger-btn" data-revise="${deptId}" title="ปลดล็อกเฉพาะแผนกนี้ — แผนกอื่นยังล็อกตามเดิม">↩ ตีกลับให้แก้ไข (Need Revision)</button>` : ''}
         ${Store.period(year)?.status !== 'OPEN' && ['SUBMITTED', 'ENDORSED', 'COMPLETED'].includes(st.status) ? `<button class="ghost-btn" data-lockdept="${deptId}">🔒 ล็อกคืน</button>` : ''}</span>`)
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
        <tbody>${rows}<tr class="tr-sum"><td><b>รวมทั้งหน่วยงาน</b></td><td class="num"><b>${fmt(prev)}</b></td><td class="num"><b>${fmt(cur)}</b></td>${rv.on ? `<td class="num"><b>${fmt(Store.originalDeptTotal(year, deptId))}</b></td><td></td>` : ''}<td></td><td></td><td></td><td></td></tr></tbody></table></div>`, { cls: 'card-flush' });
  }

  // โหมดแอดมิน — แก้งบรายเดือนของหน่วยงานใดก็ได้ (grid แก้ไข) · บันทึก Audit Log
  function drillDeptEdit(user, deptId) {
    const year = UI.year();
    const d = Store.dept(deptId);
    if (!d) return UI.card('ไม่พบหน่วยงาน', '<a class="link" href="#/acc/departments">← กลับ</a>');
    const rows = Store.deptRows(deptId);
    const body = rows.map(r => {
      const m = Store.rowMonths(year, deptId, r.key);
      const tot = m.reduce((s, v) => s + (v ?? 0), 0);
      const cells = m.map((v, i) => `<td class="num cell-td"><input class="cell adm-cell${v && v !== 0 ? ' has-val' : ''}" data-key="${r.key}" data-m="${i}" inputmode="decimal" value="${v == null ? '' : fmt(v)}" placeholder="0"></td>`).join('');
      return `<tr data-gl-row="${r.key}"><td class="sticky-col td-gl" title="CCT ${r.cct} ${esc(r.cctName)} · IO ${r.io || '—'}"><div class="gl-name-wrap"><span class="gl-code">${r.gl.code}</span><span class="gl-nm" title="${esc(r.gl.name)}">${esc(r.gl.name)}</span></div>${r.multiCct ? `<div class="cct-tag">↳ ${esc(r.cctName)}</div>` : ''}</td>${cells}<td class="num td-total" data-tot="${r.key}">${fmt(tot)}</td></tr>`;
    }).join('');
    const mm = Store.deptMonthly(year, deptId);
    const foot = `<tr class="tr-sum"><td class="sticky-col td-gl"><b>รวมทั้งหน่วยงาน</b></td>${mm.map((v, i) => `<td class="num" data-foot-m="${i}"><b>${fmt(v)}</b></td>`).join('')}<td class="num" data-foot-total><b>${fmt(mm.reduce((s, v) => s + (v || 0), 0))}</b></td></tr>`;
    const head = `<tr><th class="sticky-col th-gl">GL / บัญชี</th>${Store.MONTH_S.map(mo => `<th class="num th-m">${mo}<div class="th-yr">${year}</div></th>`).join('')}<th class="num th-total">รวมปี</th></tr>`;
    return pageHead(`✏️ แก้ไขงบ — ${esc(d.name)}`, `โหมดแอดมิน · แก้งบรายเดือนได้ทุกช่อง · กดยืนยันเพื่อบันทึกลง Audit Log · ปีงบ ${year}`,
        `<button class="ghost-btn" data-drill-back-dept="${deptId}">← กลับหน้าหน่วยงาน</button>
         <span class="pa-right">
           <button class="ghost-btn" data-edit-expand title="ขยาย/ย่อ ตารางเต็มจอ">⛶ ขยาย</button>
           <button class="ghost-btn" data-edit-cancel disabled title="ยกเลิกการแก้ที่ยังไม่บันทึก">↺ ยกเลิก</button>
           <button class="primary-btn" data-edit-confirm disabled title="ยืนยันบันทึกการแก้ไขทั้งหมด ลง Audit Log">✔ ยืนยันบันทึก</button>
         </span>`)
      + `<div class="breadcrumb"><a href="#/acc/departments">ทุกหน่วยงาน</a> › <a href="#/acc/departments?d=${deptId}">${esc(d.name)}</a> › <b>แก้ไขงบ</b></div>`
      + `<div class="lock-banner" style="background:#fff7e6;border-color:#eda100;color:#7a5405;margin-bottom:12px">⚠ โหมดแอดมิน — แก้งบของ <b>${esc(d.name)}</b> ได้ทุกช่อง (ข้ามการล็อก) · พิมพ์ตัวเลขในช่องที่ต้องการ (ช่องที่แก้จะเป็นสีเหลือง) แล้วกด <b>✔ ยืนยันบันทึก</b> เพื่อลง Audit Log</div>`
      + `<div id="admEditWrap">` + card('', `<div class="table-scroll budget-scroll"><table class="budget-table" style="min-width:1500px"><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>`, { cls: 'card-flush budget-card' }) + `</div>`;
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

    return pageHead(`GL ${g.code} — ${esc(g.name)}`, `${esc(d.name)} · งบปี ${year} เทียบปี ${prevYear}`,
        `<a class="ghost-btn" href="#/acc/departments?d=${deptId}" title="กลับไปหน้าหน่วยงานนี้">← กลับ</a>
         <span class="pa-right"><a class="primary-btn" href="#/acc/departments?d=${deptId}&edit=1" title="โหมดแอดมิน — แก้งบรายเดือนของหน่วยงานนี้ได้ทุกช่อง (บันทึก Audit Log)">✏️ แก้ไขงบรายเดือน</a></span>`)
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
    // โหมดแอดมินแก้งบรายเดือน — สะสมการแก้ (staging) แล้วกด "ยืนยันบันทึก" → adminSetCell (+ audit)
    if (qs.d && qs.edit) {
      const year = UI.year(), deptId = qs.d;
      const allRows = Store.deptRows(deptId);
      const parseNum = s => { s = String(s).replace(/[,\s]/g, '').trim(); if (s === '') return null; const v = Number(s); return isFinite(v) ? v : NaN; };
      const norm = v => (v == null ? 0 : v);
      const pending = new Map(); // `${key}|${m}` -> { key, m, val, inp }
      const confirmBtn = document.querySelector('[data-edit-confirm]');
      const cancelBtn = document.querySelector('[data-edit-cancel]');
      const storedVal = (key, m) => Store.rowMonths(year, deptId, key)[m];
      const rowMonthsWithPending = key => {
        const arr = Store.rowMonths(year, deptId, key).slice();
        pending.forEach(p => { if (p.key === key) arr[p.m] = p.val; });
        return arr;
      };
      const refreshTotals = key => {
        const tc = document.querySelector(`[data-tot="${CSS.escape(key)}"]`);
        if (tc) tc.textContent = UI.fmt(rowMonthsWithPending(key).reduce((s, v) => s + (v ?? 0), 0));
        const months = new Array(12).fill(0);
        allRows.forEach(r => rowMonthsWithPending(r.key).forEach((v, i) => { months[i] += (v ?? 0); }));
        months.forEach((v, i) => { const c = document.querySelector(`[data-foot-m="${i}"]`); if (c) c.innerHTML = '<b>' + UI.fmt(v) + '</b>'; });
        const ft = document.querySelector('[data-foot-total]'); if (ft) ft.innerHTML = '<b>' + UI.fmt(months.reduce((s, x) => s + x, 0)) + '</b>';
      };
      const updateButtons = () => {
        const n = pending.size;
        if (confirmBtn) { confirmBtn.disabled = !n; confirmBtn.textContent = n ? `✔ ยืนยันบันทึก (${n})` : '✔ ยืนยันบันทึก'; }
        if (cancelBtn) cancelBtn.disabled = !n;
      };
      document.querySelectorAll('.adm-cell').forEach(inp => {
        inp.addEventListener('focus', () => { inp.value = inp.value.replace(/,/g, ''); inp.select(); });
        inp.addEventListener('blur', () => {
          const v = parseNum(inp.value);
          const key = inp.dataset.key, m = Number(inp.dataset.m), pk = key + '|' + m;
          if (Number.isNaN(v)) { toast('รูปแบบตัวเลขไม่ถูกต้อง', 'err'); const o = storedVal(key, m); inp.value = o == null ? '' : UI.fmt(o); return; }
          inp.value = v == null ? '' : UI.fmt(v);
          inp.classList.toggle('has-val', !!v);
          if (norm(v) === norm(storedVal(key, m))) { pending.delete(pk); inp.classList.remove('cell-pending'); }
          else { pending.set(pk, { key, m, val: v, inp }); inp.classList.add('cell-pending'); }
          refreshTotals(key);
          updateButtons();
        });
      });
      confirmBtn?.addEventListener('click', () => {
        if (!pending.size) return;
        let ok = 0, err = 0;
        pending.forEach(p => {
          try { if (Store.adminSetCell(user, year, deptId, p.key, p.m, p.val)) ok++; p.inp.classList.remove('cell-pending'); p.inp.classList.add('cell-changed'); }
          catch (e) { err++; p.inp.classList.add('cell-err'); }
        });
        pending.clear();
        updateButtons();
        toast(`บันทึก ${ok} รายการ ลง Audit Log แล้ว${err ? ` · ผิดพลาด ${err} รายการ` : ''}`, err ? 'err' : 'ok');
      });
      cancelBtn?.addEventListener('click', () => {
        const keys = new Set();
        pending.forEach(p => {
          const o = storedVal(p.key, p.m);
          p.inp.value = o == null ? '' : UI.fmt(o);
          p.inp.classList.toggle('has-val', !!o);
          p.inp.classList.remove('cell-pending');
          keys.add(p.key);
        });
        pending.clear();
        keys.forEach(k => refreshTotals(k));
        updateButtons();
      });
      const expandBtn = document.querySelector('[data-edit-expand]');
      const wrap = document.getElementById('admEditWrap');
      // ปุ่ม X ลอย — โผล่เมื่อเลื่อนเมาส์ขึ้นบนสุด (เฉพาะโหมดเต็มจอ)
      let fsClose = document.getElementById('admFsClose');
      if (!fsClose) {
        fsClose = document.createElement('button');
        fsClose.id = 'admFsClose';
        fsClose.type = 'button';
        fsClose.innerHTML = '<span class="fs-x">✕</span> ย่อกลับ <kbd>Esc</kbd>';
        document.body.appendChild(fsClose);
      }
      const onFsMove = ev => { if (ev.clientY <= 70) fsClose.classList.add('show'); else fsClose.classList.remove('show'); };
      const setFs = on => {
        wrap.classList.toggle('edit-fs', on);
        document.body.classList.toggle('edit-fs-lock', on);
        if (expandBtn) expandBtn.innerHTML = on ? '⤡ ย่อ' : '⛶ ขยาย';
        fsClose.style.display = on ? 'inline-flex' : 'none';
        fsClose.classList.add('show'); // โชว์ครั้งแรกให้เห็นก่อน แล้วค่อยซ่อนเมื่อเมาส์ลง
        if (on) { document.addEventListener('mousemove', onFsMove); setTimeout(() => { if (wrap.classList.contains('edit-fs')) fsClose.classList.remove('show'); }, 1800); }
        else document.removeEventListener('mousemove', onFsMove);
      };
      expandBtn?.addEventListener('click', () => setFs(!wrap.classList.contains('edit-fs')));
      fsClose.addEventListener('click', () => setFs(false));
      document.addEventListener('keydown', function esc(ev) {
        if (ev.key === 'Escape' && wrap?.classList.contains('edit-fs')) setFs(false);
      });
      document.querySelector('[data-drill-back-dept]')?.addEventListener('click', e => {
        if (pending.size && !confirm(`มีการแก้ไข ${pending.size} รายการที่ยังไม่บันทึก — ออกโดยไม่บันทึกหรือไม่?`)) return;
        location.hash = '#/acc/departments?d=' + e.currentTarget.dataset.drillBackDept;
      });
      return;
    }
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
    document.getElementById('exportMLXlsx')?.addEventListener('click', () => exportML('xlsx').catch(e => toast(e.message, 'err')));
    document.getElementById('exportMLCsv')?.addEventListener('click', () => exportML('csv').catch(e => toast(e.message, 'err')));
    document.querySelector('[data-drill-back]')?.addEventListener('click', () => { location.hash = '#/acc/departments'; });
    // แม่กุญแจ = ล็อก/ปลดล็อก "รายแผนก" (Budget Control = ทั้งระบบ)
    document.querySelectorAll('[data-tlock]').forEach(btn => btn.addEventListener('click', () => {
      const deptId = btn.dataset.tlock, name = esc(Store.dept(deptId).name);
      if (btn.dataset.locked === '1') {
        UI.modal(`🔓 ปลดล็อกให้แก้ไข — ${name}`, `
          <p>ปลดล็อก<b>เฉพาะแผนกนี้</b>ให้กลับมาแก้ไขได้ (แผนกอื่นยังล็อกตามเดิม) · ระบุเหตุผล <b style="color:#c0392b">*</b> (บังคับ · จะแจ้งไปยังหน่วยงาน):</p>
          <textarea id="tlockNote" rows="3" placeholder="เช่น เปิดให้ปรับตัวเลขตามที่ตกลง"></textarea>`, [
          { label: 'ยกเลิก', cls: 'ghost-btn' },
          { label: '🔓 ปลดล็อกแผนกนี้', cls: 'primary-btn', onClick: close => {
              const note = document.getElementById('tlockNote').value.trim();
              if (!note) { toast('กรุณาระบุเหตุผลก่อนปลดล็อก', 'err'); document.getElementById('tlockNote').focus(); return; }
              try { Store.needRevision(user, UI.year(), deptId, note); toast('ปลดล็อกแผนกนี้แล้ว — แก้ไขได้'); close(); App.render(); }
              catch (e) { toast(e.message, 'err'); }
            } },
        ]);
      } else {
        UI.confirm2(`🔒 ล็อกแผนกนี้ — ${name}`, 'ล็อกงบของแผนกนี้ให้แก้ไขไม่ได้ (เฉพาะแผนกนี้)',
          'การเปิด/ปิดทั้งระบบทำที่ Budget Control · ปลดล็อกภายหลังได้ที่ไอคอนแม่กุญแจนี้',
          () => { try { Store.lockDept(user, UI.year(), deptId); toast('ล็อกแผนกนี้แล้ว'); App.render(); } catch (e) { toast(e.message, 'err'); } });
      }
    }));
    document.querySelectorAll('[data-revise]').forEach(btn => btn.addEventListener('click', () => {
      const deptId = btn.dataset.revise;
      UI.modal(`ตีกลับให้แก้ไข — ${esc(Store.dept(deptId).name)}`, `
        <p>ระบุเหตุผลที่ต้องแก้ไข <b style="color:#c0392b">*</b> (บังคับ · จะแจ้งเตือนไปยังหน่วยงาน):</p>
        <textarea id="revNote" rows="3" placeholder="เช่น GL 635202 เดือนตุลาคม สูงผิดปกติ กรุณาตรวจสอบและระบุสมมติฐานเพิ่มเติม"></textarea>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: 'ยืนยันตีกลับ', cls: 'danger-btn', onClick: close => {
            const note = document.getElementById('revNote').value.trim();
            if (!note) { toast('กรุณาระบุเหตุผลก่อนตีกลับ', 'err'); document.getElementById('revNote').focus(); return; }
            try {
              Store.needRevision(user, UI.year(), deptId, note);
              toast('ตีกลับให้หน่วยงานแก้ไขแล้ว'); close(); App.render();
            } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
    // ล็อกคืนรายแผนก (หลังแผนกที่ถูกตีกลับแก้ไข + ส่งใหม่แล้ว)
    document.querySelectorAll('[data-lockdept]').forEach(btn => btn.addEventListener('click', () => {
      const deptId = btn.dataset.lockdept;
      UI.confirm2(`ล็อกคืน — ${esc(Store.dept(deptId).name)}`,
        `ตรวจงบที่แก้ไขแล้วเรียบร้อย ล็อกแผนกนี้กลับเป็นปิดรอบ?`,
        'แผนกจะแก้ไขไม่ได้อีก จนกว่าจะถูกตีกลับใหม่',
        () => {
          try { Store.lockDept(user, UI.year(), deptId); toast('ล็อกคืนแล้ว'); App.render(); }
          catch (e) { toast(e.message, 'err'); }
        });
    }));
    // ตีกลับหลายแผนก: checkbox + ยกฝ่าย
    const dsels = [...document.querySelectorAll('.dsel')];
    if (dsels.length) {
      const cntEl = document.getElementById('bulkCount');
      const bulkBtn = document.getElementById('bulkReviseBtn');
      const refresh = () => {
        const n = dsels.filter(cb => cb.checked).length;
        if (cntEl) cntEl.textContent = n;
        if (bulkBtn) bulkBtn.disabled = !n;
      };
      dsels.forEach(cb => cb.addEventListener('change', refresh));
      document.getElementById('dselAll')?.addEventListener('change', e => {
        dsels.forEach(cb => { cb.checked = e.target.checked; }); refresh();
      });
      const bulkModal = deptIds => {
        if (!deptIds.length) { toast('ไม่มีแผนกที่เลือก', 'err'); return; }
        const names = deptIds.map(id => Store.dept(id)?.name || id);
        const listHtml = names.slice(0, 12).map(n => `<li>${esc(n)}</li>`).join('')
          + (names.length > 12 ? `<li>… และอีก ${names.length - 12} แผนก</li>` : '');
        UI.modal(`ตีกลับ ${deptIds.length} แผนกพร้อมกัน`, `
          <ul class="err-list" style="max-height:180px;overflow:auto">${listHtml}</ul>
          <p style="margin-top:8px">เหตุผล <b style="color:#c0392b">*</b> (บังคับ · ใช้กับทุกแผนกที่เลือก · จะแจ้งเตือนทุกแผนก):</p>
          <textarea id="bulkRevNote" rows="3" placeholder="เช่น กรุณาทบทวนค่าซ่อมบำรุงตามนโยบายลด 10%"></textarea>`, [
          { label: 'ยกเลิก', cls: 'ghost-btn' },
          { label: `ยืนยันตีกลับ ${deptIds.length} แผนก`, cls: 'danger-btn', onClick: close => {
              const note = document.getElementById('bulkRevNote').value.trim();
              if (!note) { toast('กรุณาระบุเหตุผลก่อนตีกลับ', 'err'); document.getElementById('bulkRevNote').focus(); return; }
              try {
                const n = Store.needRevisionBulk(user, UI.year(), deptIds, note);
                toast(`ตีกลับแล้ว ${n} แผนก`); close(); App.render();
              } catch (e) { toast(e.message, 'err'); }
            } },
        ]);
      };
      bulkBtn?.addEventListener('click', () => bulkModal(dsels.filter(cb => cb.checked).map(cb => cb.value)));
      document.getElementById('bulkDivBtn')?.addEventListener('click', () => {
        const unit = document.getElementById('bulkDivSel')?.value;
        if (!unit) { toast('เลือกฝ่ายก่อน', 'err'); return; }
        const ids = Store.subtreeDepartments(unit).map(d => d.id);
        bulkModal(ids);
      });
    }
  }

  /* ============ Analysis ============ */
  function analysis(user, embed) {
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

    return (embed ? `<div class="an-actions"><button class="ghost-btn small" onclick="Store.exportDetail(${year})">⬇ Export รายละเอียด CSV</button> <button class="ghost-btn small" onclick="window.print()">🖨 พิมพ์ / PDF</button></div>`
        : pageHead(`วิเคราะห์งบประมาณ ปี ${year}`, `เทียบงบปี ${prevYear} · ${asOf()}`,
        `<button class="ghost-btn" onclick="Store.exportDetail(${year})">⬇ Export รายละเอียด CSV</button>
         <button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`))
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

    // เวอร์ชันงบ (snapshot ประวัติแต่ละรอบ)
    const snaps = Store.snapshotsFor(year);
    const curTot = Store.companyTotal(year);
    const snapRows = snaps.length ? snaps.map(s => {
      const tot = s.rows.reduce((t, r) => t + r.months.reduce((x, v) => x + (v || 0), 0), 0);
      const dv = curTot - tot;
      return `<tr><td><b>${esc(Store.SNAP_TITLE(s.label))}</b></td>
        <td class="small muted">${s.createdAt || s.takenAt ? UI.fmtDT(s.createdAt || s.takenAt) : '—'}${s.takenBy ? ' · ' + esc(s.takenBy) : ''}</td>
        <td class="num">${fmt(tot)}</td>
        <td class="num ${dv > 0 ? 'txt-up' : dv < 0 ? 'txt-down' : 'muted'}">${dv === 0 ? '—' : (dv >= 0 ? '+' : '') + fmt(dv)}</td>
        <td class="td-actions"><button class="ghost-btn small" data-snap-cmp="${esc(s.label)}">🔍 เทียบ</button>
          ${s.label !== 'ORIGINAL' ? `<button class="ghost-btn small btn-clear" data-snap-del="${esc(s.label)}" title="ลบเวอร์ชันนี้">🗑</button>` : ''}</td></tr>`;
    }).join('') : `<tr><td colspan="5" class="muted" style="padding:12px">ยังไม่มีเวอร์ชันที่บันทึกไว้ — กด "บันทึกเวอร์ชันปัจจุบัน" หรือระบบจะบันทึกอัตโนมัติเมื่อ Lock รอบ</td></tr>`;
    const snapCard = card(`📸 เวอร์ชันงบ ปี ${year} — บันทึกทุกรอบ · เทียบย้อนได้`, `
        <p class="muted small" style="margin:0 0 10px">📌 <b>ตัวเลขล่าสุด (ปัจจุบัน) = ${fmt(curTot)} กีบ</b> · ระบบบันทึกอัตโนมัติเมื่อ Lock รอบ (งบต้นปี / Revise) · หรือกดบันทึกเองได้ทุกเมื่อ</p>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>เวอร์ชัน</th><th>บันทึกเมื่อ</th><th class="num">ยอดรวม (กีบ)</th><th class="num">ต่างจากปัจจุบัน</th><th></th></tr></thead>
          <tbody><tr class="tr-sum"><td><b>🟢 ปัจจุบัน (ล่าสุด)</b></td><td class="small muted">real-time</td><td class="num"><b>${fmt(curTot)}</b></td><td class="num muted">—</td><td></td></tr>${snapRows}</tbody></table></div>
        <div class="inline-form" style="margin-top:10px;border-top:1px dashed var(--border);padding-top:12px">
          <input id="snapLabel" placeholder="ชื่อเวอร์ชัน เช่น งบต้นปี ${year} / Revise เม.ย." style="min-width:300px">
          <button class="primary-btn" id="snapSaveBtn">📸 บันทึกเวอร์ชันปัจจุบัน</button></div>`);
    const syncOn = Sync.enabled();
    return '<div class="ctrl-page">' + pageHead('Budget Control', `จัดการรอบงบประมาณ หน่วยงาน GL และ Budget Rate · Admin เท่านั้น <a href="#/acc/system" style="opacity:.35;font-size:12px;text-decoration:none" title="ตั้งค่าระบบ (IT)">⚙</a>`)
      + snapCard
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
          <p class="muted small" style="margin-top:8px">ทะเบียน GL ทั้งหมด (ดูอย่างเดียว) · <b>ต้องการเพิ่ม GL ใหม่ ใช้ฟอร์ม "➕ เพิ่ม GL (แถวงบใหม่)" ด้านล่าง</b> — สร้าง GL พร้อมมอบหมายให้แผนกในขั้นตอนเดียว</p>`)
      + card(`➕ เพิ่ม GL`, `
          <p class="muted small" style="margin:0 0 10px"><b>①</b> กรอกแค่ <b>รหัส GL + ชื่อบัญชี</b> = เพิ่มเข้าทะเบียน GL Master เลย (มอบหมายให้แผนกทีหลังได้)<br>
          <b>②</b> ถ้าอยากมอบหมายในตัวเลย ให้กรอก <b>CCT + รหัสแผนก</b> เพิ่ม → ระบบเพิ่มแถวงบว่าง (ปี ${year} + ${year - 1}) ให้แผนกนั้นกรอกทันที</p>
          <div class="glrow-form">
            <label>รหัส GL <b style="color:#c0392b">*</b><input id="grGl" inputmode="numeric" placeholder="เช่น 636500"></label>
            <label>ชื่อบัญชี<input id="grGlName" placeholder="เช่น ค่าที่ปรึกษา"></label>
            <label class="opt">CCT (รหัสหน่วยงาน) <small>— มอบหมาย</small><input id="grCct" inputmode="numeric" placeholder="เช่น 8003851100"></label>
            <label class="opt">ชื่อหน่วยงาน<input id="grUnit" placeholder="เช่น แผนกบัญชีทั่วไป"></label>
            <label class="opt">รหัสแผนก (F) <small>— มอบหมาย</small><input id="grDeptCode" list="grDeptList" placeholder="เช่น 1161"><datalist id="grDeptList">${Store.db.departments.map(d => `<option value="${d.code}">${esc(d.name)}</option>`).join('')}</datalist></label>
            <label class="opt">ชื่อแผนก<input id="grDeptName" placeholder="เช่น แผนกบัญชีทั่วไปและการเงิน"></label>
            <label class="opt">IO<input id="grIo" placeholder="เช่น 800558511... หรือ ไม่คุม"></label>
            <label class="opt">code a<input id="grCodeA" placeholder="เช่น 8003851100636500a"></label>
          </div>
          <div style="margin-top:10px"><button class="primary-btn" id="addGlRowBtn">➕ เพิ่ม GL</button>
          <span id="grMsg" class="muted small" style="margin-left:10px">* จำเป็นเฉพาะรหัส GL · ช่องสีจาง = กรอกเมื่อจะมอบหมายเลย</span></div>`)
      + card(`Budget Exchange Rate ปี ${year} (Reference Rate ทางการ)`, `
          <div class="table-scroll"><table class="data-table small"><thead><tr><th>สกุลเงิน</th><th class="num">กีบ / 1 หน่วย</th><th></th></tr></thead><tbody>
          ${rates.map(r => `<tr><td><span class="cur-cell">${UI.currencyFlag(r.currency)}<b>${r.currency}</b></span></td><td class="num">${fmt(r.rateToLAK)}</td>
            <td><button class="ghost-btn small" data-editrate="${r.currency}">แก้ไข</button></td></tr>`).join('')}
          </tbody></table></div>`)
      + card(`⛽ ราคากลางน้ำมัน ปี ${year}`, `
          <div class="table-scroll"><table class="data-table small"><thead><tr><th>ชนิดน้ำมัน</th><th class="num">กีบ / ลิตร</th><th></th></tr></thead><tbody>
          ${Store.db.fuelPrices.filter(f => f.year === year).map(f => `<tr><td>${esc(UI.fuelLabel(f.fuelType))}</td><td class="num">${fmt(f.pricePerLiter)}</td>
            <td><button class="ghost-btn small" data-editfuel="${esc(f.fuelType)}">แก้ไข</button></td></tr>`).join('')}
          </tbody></table></div>
          <p class="muted small" style="margin-top:8px">ราคานี้แสดงในเครื่องมือคำนวณของทุกหน่วยงาน</p>`)
      + card('📥 อัปโหลดตัวเลข "เกิดจริง" (บัญชี) — ทับงบผู้กรอกทันที', `
          <p class="muted small">อัปโหลดไฟล์ตัวเลข<b>เกิดจริง</b> (Excel/CSV) — ระบบจับคู่แต่ละแถวด้วย <code>code a → IO → CCT+GL</code> แล้ว<b>เขียนทับช่องงบเดือนนั้นในตารางของผู้กรอกทันที</b> · ช่องที่ทับจะ<b>ถูกล็อก</b> (ผู้กรอกแก้ไม่ได้) · <b>ใช้ได้ทุกเมื่อ ไม่ต้องเปิดรอบ Revise</b></p>
          <input type="file" id="postActFile" accept=".xlsx,.xls,.csv,.tsv,.txt" style="font:inherit">
          <span id="postActMsg" class="muted small" style="margin-left:10px"></span>
          <div style="margin-top:12px;border-top:1px dashed var(--border);padding-top:10px">
            <p class="muted small" style="margin:0 0 6px">— หรือวางจาก Excel: <code>code a</code> ตามด้วยตัวเลข 12 เดือน (คั่น Tab) · หรือ <code>CCT [Tab] รหัส GL</code> ตามด้วยตัวเลข —</p>
            <textarea id="postActPaste" rows="5" placeholder="8003310100635202a\t45000000\t120000000\t8000000\t65000000\t…" style="font-family:monospace;font-size:12px;width:100%"></textarea>
            <button class="primary-btn" id="postActPasteBtn" style="margin-top:8px">📥 โพสต์เกิดจริง (ทับงบ)</button>
          </div>
          <p class="warn-text small" style="margin-top:8px">⚠ เขียนทับตัวเลขที่แผนกกรอกในเดือนที่ตรงกัน (บันทึก audit log ว่ามาจากไฟล์เกิดจริง) — ถอยกลับได้จากเวอร์ชันงบ 📸 ที่บันทึกไว้</p>`)
      + card('📗 นำเข้าจากไฟล์ต้นฉบับ (I–T → งบต้นปี · AM–AX → งบปัจจุบัน)', `
          <p class="muted small">อัปโหลดไฟล์ <b>ML งบค่าใช้จ่าย</b> (โครง code a · IO · CCT · GL · เดือน) — ระบบจับคู่ด้วย <b>code a</b> แล้ว<br>
          • คอลัมน์ <b>I–T</b> (งบต้นปี) → บันทึกเป็น <b>งบต้นปี (ORIGINAL)</b><br>
          • คอลัมน์ <b>AM–AX</b> (เกิดจริงสะสม) → เขียนลง <b>ตารางงบปัจจุบัน</b></p>
          <input type="file" id="dualFile" accept=".xlsx,.xls,.csv" style="font:inherit">
          <span id="dualMsg" class="muted small" style="margin-left:10px"></span>
          <p class="warn-text small" style="margin-top:8px">⚠ เขียนทับงบปัจจุบัน + งบต้นปี ทั้งปี — <b>ควรกด "⬇ ดาวน์โหลดสำรอง" ด้านล่างก่อนทุกครั้ง</b></p>`)
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
      + '</div>';
  }
  // popup เทียบเวอร์ชันงบ (แอดมิน + ใช้ซ้ำได้) — ราย แผนก: เวอร์ชัน vs ปัจจุบัน + ผลต่าง
  function openSnapCompare(year, label) {
    const title = Store.SNAP_TITLE(label);
    const depts = Store.activeDepartments().map(d => {
      const snapT = Store.snapDeptTotal(year, label, d.id), curT = Store.deptTotal(year, d.id);
      return { d, snapT, curT, dv: curT - snapT };
    }).filter(x => x.snapT || x.curT).sort((a, b) => Math.abs(b.dv) - Math.abs(a.dv));
    const snapTot = Store.snapCompanyTotal(year, label), curTot = Store.companyTotal(year), grandDv = curTot - snapTot;
    const rows = depts.map(x => `<tr><td>${esc(x.d.name)}<div class="muted small">${x.d.code}</div></td>
      <td class="num">${UI.fmt(x.snapT)}</td><td class="num">${UI.fmt(x.curT)}</td>
      <td class="num ${x.dv > 0 ? 'txt-up' : x.dv < 0 ? 'txt-down' : 'muted'}">${x.dv === 0 ? '—' : (x.dv >= 0 ? '+' : '') + UI.fmt(x.dv)}</td>
      <td>${x.snapT ? UI.deltaBadge(x.dv, x.dv / x.snapT * 100) : '<span class="muted">ใหม่</span>'}</td></tr>`).join('');
    UI.modal(`เทียบงบ: ${esc(title)} ↔ ปัจจุบัน (ปี ${year})`, `
      <div class="cmp-sum"><div><span>${esc(title)}</span><b>${UI.fmt(snapTot)}</b></div>
        <div class="cmp-arrow">→</div>
        <div><span>ปัจจุบัน (ล่าสุด)</span><b>${UI.fmt(curTot)}</b></div>
        <div class="cmp-dv ${grandDv > 0 ? 'up' : grandDv < 0 ? 'down' : ''}"><span>ผลต่างรวม</span><b>${(grandDv >= 0 ? '+' : '') + UI.fmt(grandDv)}</b></div></div>
      <div class="table-scroll" style="max-height:52vh"><table class="data-table small"><thead>
        <tr><th>หน่วยงาน</th><th class="num">${esc(title)}</th><th class="num">ปัจจุบัน</th><th class="num">ผลต่าง (กีบ)</th><th>%</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted">ไม่มีข้อมูล</td></tr>'}</tbody></table></div>`,
      [{ label: 'ปิด', cls: 'ghost-btn' }]);
  }
  window.__openSnapCompare = openSnapCompare;   // ให้หน้าอื่นเรียกได้
  function controlBind(user) {
    document.getElementById('snapSaveBtn')?.addEventListener('click', () => {
      const lb = document.getElementById('snapLabel').value.trim();
      try { const saved = Store.takeSnapshot(user, UI.year(), lb); UI.toast(`บันทึกเวอร์ชัน "${saved}" แล้ว`); App.render(); }
      catch (e) { UI.toast(e.message, 'err'); }
    });
    document.querySelectorAll('[data-snap-cmp]').forEach(b => b.addEventListener('click', () => openSnapCompare(UI.year(), b.dataset.snapCmp)));
    document.querySelectorAll('[data-snap-del]').forEach(b => b.addEventListener('click', () => {
      const lb = b.dataset.snapDel;
      UI.confirm2(`ลบเวอร์ชัน "${lb}"?`, 'ลบแล้วเทียบย้อนเวอร์ชันนี้ไม่ได้อีก', 'งบปัจจุบันไม่ถูกแตะ',
        () => { try { Store.deleteSnapshot(user, UI.year(), lb); UI.toast('ลบเวอร์ชันแล้ว'); App.render(); } catch (e) { UI.toast(e.message, 'err'); } });
    }));

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
        <p class="warn-text">⚠ การ Unlock จะเปิดรอบใหม่ และตั้งสถานะทุกหน่วยงานกลับเป็น "กำลังจัดทำ" (แก้ไขได้ + ต้องส่งใหม่) · บันทึกใน Audit Log</p>
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
        { label: '🗑 ยืนยันลบรอบปี', cls: 'danger-btn', onClick: async close => {
            if (String(document.getElementById('delConfirm').value).trim() !== String(y)) { toast(`กรุณาพิมพ์ ${y} เพื่อยืนยัน`, 'err'); return; }
            try {
              Store.deletePeriod(user, y);                 // ลบในเครื่อง (ยกเลิก debounce push ที่ตามมา)
              if (UI.year() === Number(y)) UI.setYear(Store.db.meta.yearCurrent);
              close(); App.render();
              await Sync.deleteYearNow(Number(y));          // ลบขึ้น Supabase แบบ bulk (persist จริง)
              toast(`ลบรอบงบปี ${y} เรียบร้อย (ซิงค์ Supabase แล้ว)`);
            } catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'err'); App.render(); }
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
    document.getElementById('addGlRowBtn')?.addEventListener('click', () => {
      const v = id => (document.getElementById(id)?.value || '').trim();
      const f = { gl: v('grGl'), glName: v('grGlName'), cct: v('grCct'), unitName: v('grUnit'),
        deptCode: v('grDeptCode'), deptName: v('grDeptName'), io: v('grIo'), codeA: v('grCodeA') };
      const msg = document.getElementById('grMsg');
      try {
        const r = Store.addGLRow(user, f);
        const txt = r.assigned
          ? `✓ เพิ่ม GL ${f.gl} + มอบหมาย → แผนก ${f.deptCode} (กรอกได้เลย)`
          : `✓ เพิ่ม GL ${f.gl} เข้าทะเบียนแล้ว — มอบหมายให้แผนกได้ทีหลัง`;
        toast(txt);
        if (msg) { msg.textContent = txt; msg.style.color = '#1e7d46'; }
        App.render();
      } catch (e) { if (msg) { msg.textContent = '✗ ' + e.message; msg.style.color = '#c0392b'; } toast(e.message, 'err'); }
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
      UI.modal(`แก้ไขราคากลางน้ำมัน — ${esc(UI.fuelLabel(ft))} ปี ${UI.year()}`,
        `<label class="fld"><span>กีบ / ลิตร</span><input id="fuelVal" inputmode="decimal" value="${f.pricePerLiter}"></label>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: 'บันทึก', cls: 'primary-btn', onClick: close => {
            const v = Number(String(document.getElementById('fuelVal').value).replace(/,/g, ''));
            if (!isFinite(v) || v <= 0) { toast('ค่าไม่ถูกต้อง', 'err'); return; }
            try { Store.setFuelPrice(user, UI.year(), ft, v); toast('บันทึกราคาน้ำมันแล้ว'); close(); App.render(); } catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    }));
    // ---- โพสต์เกิดจริง (ทับงบ) จากไฟล์ ----
    const postActResult = (r, srcTxt) => {
      const unTxt = r.unmatched.length
        ? `<div class="warn-text" style="margin-top:8px">⚠ จับคู่ไม่ได้ ${r.unmatched.length} แถว:</div><div class="muted small" style="max-height:120px;overflow:auto">${r.unmatched.slice(0, 60).map(u => esc(String(u))).join(' · ')}${r.unmatched.length > 60 ? ' …' : ''}</div>`
        : '<p style="color:#0ca30c;margin-top:8px">✓ จับคู่ได้ครบทุกแถว</p>';
      UI.modal('✅ โพสต์เกิดจริงแล้ว', `<p>ทับงบ <b>${r.matched}</b> แถว · <b>${r.cells}</b> ช่อง${srcTxt ? ` <span class="muted small">(${esc(srcTxt)})</span>` : ''}<br><span class="muted small">ช่องที่ทับถูกล็อกในตารางผู้กรอกแล้ว</span></p>${unTxt}`,
        [{ label: 'ปิด', cls: 'primary-btn', onClick: cl => { cl(); App.render(); } }]);
    };
    // ---- นำเข้าจากไฟล์ต้นฉบับ: I-T → งบต้นปี (ORIGINAL) · AM-AX → งบปัจจุบัน ----
    document.getElementById('dualFile')?.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const msg = document.getElementById('dualMsg'); msg.textContent = 'กำลังอ่านไฟล์…';
      try {
        const grid = await fileToGrid(file);
        const recs = gridToDualRecords(grid);
        if (!recs.length) throw new Error('ไม่พบแถวข้อมูล (ต้องมีหัวตาราง code a)');
        const byCodeA = {}; (Store.db.departmentRows || []).forEach(r => { if (r.codeA) byCodeA[r.codeA] = 1; });
        const willMatch = recs.filter(r => r.codeA && byCodeA[r.codeA]).length;
        const sumIT = recs.reduce((s, r) => s + r.original.reduce((a, b) => a + b, 0), 0);
        const sumAM = recs.reduce((s, r) => s + r.current.reduce((a, b) => a + b, 0), 0);
        msg.textContent = `พบ ${recs.length} แถว · จับคู่ได้ ${willMatch}`;
        UI.modal('📗 นำเข้าจากไฟล์ต้นฉบับ', `
          <p>ไฟล์: <b>${esc(file.name)}</b></p>
          <p>พบ <b>${recs.length}</b> แถว · จับคู่ด้วย code a ได้ <b>${willMatch}</b> แถว${recs.length - willMatch ? ` · ไม่พบในระบบ ${recs.length - willMatch} แถว (ข้าม)` : ''}</p>
          <p class="small">งบต้นปี (I–T) รวม: <b>${fmt(Math.round(sumIT))}</b> กีบ<br>งบปัจจุบัน/เกิดจริง (AM–AX) รวม: <b>${fmt(Math.round(sumAM))}</b> กีบ</p>
          <p class="warn-text">⚠ เขียนทับ <b>งบปัจจุบัน = AM–AX</b> และ <b>งบต้นปี (ORIGINAL) = I–T</b> ทั้งปี ${UI.year()} — ทำสำรองแล้วใช่ไหม?</p>`, [
          { label: 'ยกเลิก', cls: 'ghost-btn', onClick: close => { close(); e.target.value = ''; msg.textContent = ''; } },
          { label: '📗 นำเข้า (ทับข้อมูล)', cls: 'danger-btn', onClick: close => {
              try {
                const r = Store.importDualBudget(user, UI.year(), recs, { autoCreate: true });
                close(); e.target.value = ''; msg.textContent = '';
                const cr = r.created && r.created.rows ? `<p class="small" style="color:#0a7">＋ สร้างแถวใหม่ ${r.created.rows}${r.created.depts ? ` · แผนกใหม่ ${r.created.depts}` : ''}${r.created.ccts ? ` · CCT ใหม่ ${r.created.ccts}` : ''}</p>` : '';
                const un = r.unmatched.length ? `<div class="warn-text" style="margin-top:8px">ไม่พบ/สร้างไม่ได้ ${r.unmatched.length} แถว:</div><div class="muted small" style="max-height:110px;overflow:auto">${r.unmatched.slice(0, 40).map(u => esc(String(u))).join(' · ')}</div>` : '<p style="color:#0ca30c;margin-top:8px">✓ นำเข้าครบทุกแถว</p>';
                UI.modal('✅ นำเข้าเรียบร้อย', `<p>งบปัจจุบัน: <b>${r.matched}</b> แถว · <b>${r.cellsCur}</b> ช่อง<br>งบต้นปี (ORIGINAL): <b>${r.cellsOrig}</b> ช่อง</p>${cr}${un}`, [{ label: 'ปิด', cls: 'primary-btn', onClick: cl => { cl(); App.render(); } }]);
              } catch (err) { toast(err.message, 'err'); }
            } },
        ]);
      } catch (err) { msg.textContent = ''; toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'err'); e.target.value = ''; }
    });
    document.getElementById('postActFile')?.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const msg = document.getElementById('postActMsg'); msg.textContent = 'กำลังอ่านไฟล์…';
      try {
        const grid = await fileToGrid(file);
        const recs = gridToRecords(grid);
        if (!recs.length) throw new Error('ไม่พบแถวข้อมูลในไฟล์');
        const willMatch = recs.filter(r => Store.actualRowRef(r)).length;
        msg.textContent = `พบ ${recs.length} แถว · จับคู่ได้ ${willMatch} แถว`;
        UI.modal('📥 โพสต์เกิดจริง (ทับงบผู้กรอก)', `
          <p>ไฟล์: <b>${esc(file.name)}</b></p>
          <p>พบ <b>${recs.length}</b> แถว · จับคู่เข้า GL ได้ <b>${willMatch}</b> แถว${recs.length - willMatch ? ` · จับคู่ไม่ได้ ${recs.length - willMatch} แถว (จะถูกข้าม)` : ''}</p>
          <p class="warn-text">⚠ ระบบจะ<b>เขียนทับตัวเลขงบที่แผนกกรอก</b> เฉพาะเดือนที่มีค่าในไฟล์ แล้ว<b>ล็อก</b>ช่องนั้น (ผู้กรอกแก้ไม่ได้) · ปีงบ ${UI.year()}</p>`, [
          { label: 'ยกเลิก', cls: 'ghost-btn', onClick: close => { close(); e.target.value = ''; msg.textContent = ''; } },
          { label: '📥 โพสต์เกิดจริง', cls: 'primary-btn', onClick: close => {
              try { const r = Store.postActuals(user, UI.year(), recs); close(); e.target.value = ''; msg.textContent = ''; postActResult(r, file.name); }
              catch (err) { toast(err.message, 'err'); }
            } },
        ]);
      } catch (err) { msg.textContent = ''; toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'err'); e.target.value = ''; }
    });
    document.getElementById('postActPasteBtn')?.addEventListener('click', () => {
      const text = document.getElementById('postActPaste').value;
      if (!text.trim()) { toast('วางข้อมูลก่อน', 'err'); return; }
      try { const r = Store.postActualsPaste(user, UI.year(), text); postActResult(r, 'วางจาก Excel'); }
      catch (err) { toast(err.message, 'err'); }
    });
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
  }

  /* ============ ใส่ตัวเลขเกิดจริง (รอบ Revise — บัญชีเท่านั้น) ============ */
  function system(user) {
    return pageHead('⚙ ตั้งค่าการเชื่อมต่อระบบ (IT)', 'ปกติไม่ต้องแตะ — URL + key ฝังในโค้ดแล้ว ระบบต่อ Supabase อัตโนมัติ · เฉพาะผู้ดูแลระบบ / IT',
        '<a class="ghost-btn" href="#/acc/control">← กลับ Budget Control</a>')
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
        })();
  }
  function systemBind(user) {
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
  }

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
          <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--border)"><b class="small">📤 อัปโหลดไฟล์เกิดจริง (Excel / CSV):</b>
            <input type="file" id="actFile" accept=".xlsx,.xls,.csv,.tsv,.txt" style="font:inherit;vertical-align:middle"> <span id="actFileMsg" class="muted small"></span></div>
          <p class="muted small">— หรือคัดลอกจาก Excel มาวางด้านล่าง —</p>
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
    document.getElementById('actFile')?.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const msg = document.getElementById('actFileMsg');
      msg.textContent = 'กำลังอ่านไฟล์…';
      try {
        const grid = await fileToGrid(file);                       // รองรับ .xlsx/.xls/.csv/.tsv/.txt
        const text = grid.map(row => row.join('\t')).join('\n');    // → รูปแบบเดียวกับ paste
        const r = Store.pasteActuals(user, year, text);
        msg.textContent = '';
        toast(`นำเข้าเกิดจริงจากไฟล์ ${r.matched} แถว${r.unmatched.length ? ` · จับคู่ไม่ได้ ${r.unmatched.length}` : ''}`, r.unmatched.length ? 'err' : 'ok');
        App.render();
      } catch (err) { msg.textContent = ''; toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'err'); e.target.value = ''; }
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
      const tryLoad = (src, onFail) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => res(window.XLSX);
        s.onerror = onFail;
        document.head.appendChild(s);
      };
      // โหลดตัวอ่านในเครื่องก่อน (self-contained ใช้ได้แม้ไม่มีเน็ต) → ถ้าไม่มีค่อย fallback CDN
      // ใช้รุ่น xlsx-js-style (รองรับสี/เส้นขอบ/ฟอร์แมตตอน export) — อ่านไฟล์ได้เหมือนรุ่นเดิม
      tryLoad('js/vendor/xlsx-style.min.js?v=11.3', () =>
        tryLoad('js/vendor/xlsx.full.min.js?v=8.1', () =>
          tryLoad('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
            () => rej(new Error('โหลดตัวอ่าน Excel ไม่สำเร็จ — ลองบันทึกไฟล์เป็น .csv แล้วอัปโหลดแทน')))));
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
  // แปลง grid ไฟล์ ML → records สำหรับนำเข้า 2 ชุด (I-T งบต้นปี + AM-AX เกิดจริง) จับด้วย code a
  // โครง ML คงที่: code a=0 · IO=1 · CCT=2 · รหัสแผนก=4 · GL=6 · I-T=8..19 · AM-AX=38..49
  function gridToDualRecords(grid) {
    let hi = -1;
    for (let i = 0; i < Math.min(grid.length, 25); i++) {
      if ((grid[i] || []).some(c => /code\s*a/i.test(String(c)))) { hi = i; break; }
    }
    if (hi < 0) throw new Error('ไม่พบหัวตาราง (code a) — ต้องเป็นไฟล์ ML งบค่าใช้จ่าย');
    const num = v => { if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[, ]/g, '')); return isFinite(n) ? n : 0; };
    const recs = [];
    for (let r = hi + 1; r < grid.length; r++) {
      const row = grid[r]; if (!row) continue;
      const gl = String(row[6] || '').trim(); const codeA = String(row[0] || '').trim();
      if (!/^\d{6,7}$/.test(gl) || !codeA) continue;
      const original = [], current = [];
      for (let k = 0; k < 12; k++) { original.push(num(row[8 + k])); current.push(num(row[38 + k])); }
      recs.push({ codeA, io: String(row[1] || '').trim(), cct: String(row[2] || '').trim(), deptCode: String(row[4] || '').trim(), glCode: gl, cctName: String(row[3] || '').trim(), deptName: String(row[5] || '').trim(), glName: String(row[7] || '').trim(), original, current });
    }
    return recs;
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
    return pageHead('Audit Log', `บันทึกการเปลี่ยนแปลงทั้งหมด (read-only) · แสดง ${logs.length} รายการล่าสุด · ทั้งหมด ${Store.db.auditLogs.length} รายการ`,
        `<span class="pa-right"><button class="primary-btn" id="exportAuditJson" title="ส่งออก Audit Log ทั้งหมดเป็นไฟล์ JSON (สำหรับแอปอ่านรายงานภายนอก)">⬇ Export Log (JSON)</button></span>`)
      + card('', `<div class="table-scroll"><table class="data-table small">
        <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>หน่วยงาน</th><th>GL</th><th>เดือน</th><th class="num">ค่าเดิม</th><th class="num">ค่าใหม่</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`, { cls: 'card-flush' });
  }
  function auditBind(user) {
    document.getElementById('exportAuditJson')?.addEventListener('click', () => {
      try { const n = Store.exportAuditJson(); toast(`ส่งออก Audit Log ${n} รายการ เป็นไฟล์ JSON แล้ว`, 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    });
  }

  /* ============ งบการเงินตามงบ (Budget P&L by กลุ่มบัญชี) ============ */
  function pnl(user, embed) {
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

    return (embed ? `<div class="an-actions"><button class="ghost-btn small" onclick="Store.exportPnl(${year})">⬇ Export CSV</button> <button class="ghost-btn small" onclick="window.print()">🖨 พิมพ์ / PDF</button></div>`
        : pageHead('📑 งบการเงินตามงบ (Budget P&L)', `สรุปงบตามกลุ่มบัญชี (ธรรมชาติค่าใช้จ่าย) · ทั้งบริษัท ปี ${year} · ${asOf()}`,
        `<button class="ghost-btn" onclick="Store.exportPnl(${year})">⬇ Export CSV</button>
         <button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`))
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
  function variance(user, embed) {
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
    const grpName = g => (typeof PPT_MAP !== 'undefined' && PPT_MAP.codeName && PPT_MAP.codeName[g]) || '';
    const grpRows = Object.keys(budByGrp).map(grp => ({ grp, name: grpName(grp), bud: budByGrp[grp], act: actByGrp[grp] || 0 }))
      .sort((a, b) => b.bud - a.bud).map(x => {
        const rem = x.bud - x.act, pct = x.bud > 0 ? x.act / x.bud * 100 : 0, f = flag(x.act, x.bud);
        return `<tr><td data-v="${esc(x.name || x.grp)}" class="grp-cell" data-tip="${esc('กลุ่มบัญชี ' + x.grp + ' — ' + (x.name || 'ไม่ระบุชื่อ'))}"><span class="grp-code">${esc(x.grp)}</span> <b>${esc(x.name || 'กลุ่ม ' + x.grp)}</b></td>
          <td class="num" data-v="${x.bud}">${fmt(x.bud)}</td><td class="num" data-v="${x.act}">${fmt(x.act)}</td>
          <td class="num" data-v="${rem}" style="color:${rem < 0 ? '#d03b3b' : '#0ca30c'}">${fmt(rem)}</td>
          <td data-v="${pct}">${pct.toFixed(1)}%</td><td data-v="${pct}"><span style="color:${f.c};font-weight:600">${f.t}</span></td></tr>`;
      }).join('');

    const emptyNote = actTotal === 0
      ? `<div class="anomaly-box warning" style="margin-bottom:14px">ℹ️ ยังไม่มีตัวเลขเกิดจริงปี ${year} — ${rv.on ? 'ใส่เกิดจริงที่เมนู "ใส่เกิดจริง" หรืออัปโหลดไฟล์ SAP' : 'เปิดรอบ Revise แล้วนำเข้าเกิดจริงก่อน'} · รายงานนี้จะคำนวณอัตโนมัติเมื่อมีข้อมูล</div>` : '';

    return (embed ? `<div class="an-actions"><button class="ghost-btn small" onclick="window.print()">🖨 พิมพ์ / PDF</button></div>`
        : pageHead('🎯 ควบคุมงบ — งบ vs เกิดจริง', `เทียบงบที่ตั้งกับเกิดจริงสะสม${rv.on ? ` (ถึงเดือน ${rv.thru})` : ''} · ทั้งบริษัท ปี ${year} · ${asOf()}`,
        `<button class="ghost-btn" onclick="window.print()">🖨 พิมพ์ / PDF</button>`))
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
      + card(`ควบคุมงบตามกลุ่มบัญชี — คลิกหัวคอลัมน์เพื่อเรียง · ชี้ที่ชื่อกลุ่มเพื่อดูรายละเอียด`, `<div class="table-scroll"><table class="data-table sortable-table" id="grpTable">
          <thead><tr><th class="sortable">กลุ่มบัญชี</th><th class="num sortable">งบทั้งปี</th><th class="num sortable">เกิดจริง</th><th class="num sortable">คงเหลือ</th><th class="sortable">% ใช้ไป</th><th class="sortable">สถานะ</th></tr></thead>
          <tbody>${grpRows}</tbody></table></div>`, { cls: 'card-flush' });
  }
  function varianceBind() { UI.enableSort(document.getElementById('varTable')); UI.enableSort(document.getElementById('grpTable')); }

  /* ============ โหมดนำเสนอผู้บริหาร (full-screen) — ดึงตัวตึงจากทุกหน้าแอดมิน ============ */
  function presentCompute(year) {
    const depts = Store.activeDepartments(), prevYear = year - 1;
    const cur = Store.companyTotal(year);
    const bs = Store.db.budgets.filter(b => b.year === year);
    const rows = bs.length;
    const mtp1 = bs.reduce((s, b) => s + (typeof b.mtp1 === 'number' ? b.mtp1 : 0), 0);
    const mtp2 = bs.reduce((s, b) => s + (typeof b.mtp2 === 'number' ? b.mtp2 : 0), 0);
    const prev = depts.reduce((s, d) => s + Store.deptTotal(prevYear, d.id), 0);
    const actuals = (Store.db.actuals || []).filter(a => a.year === year);
    const snap = (Store.db.budgetSnapshots || []).find(s => s.year === year && s.label === 'ORIGINAL');
    let thru = 0; actuals.forEach(a => a.months.forEach((v, i) => { if (v) thru = Math.max(thru, i + 1); }));
    const sumM = (m, n) => (m || []).slice(0, n).reduce((s, v) => s + (v || 0), 0);
    let origYTD = 0, origFull = 0, actYTD = 0;
    (snap ? snap.rows : []).forEach(r => { origYTD += sumM(r.months, thru); origFull += sumM(r.months, 12); });
    actuals.forEach(a => { actYTD += sumM(a.months, thru); });
    const ytdVar = actYTD - origYTD, ytdPct = origYTD > 0 ? ytdVar / origYTD * 100 : 0;
    const outlook = cur - origFull, outlookPct = origFull > 0 ? outlook / origFull * 100 : 0;
    const runRate = thru > 0 ? actYTD / thru * 12 : 0;
    const sides = Store.db.meta.sides || {}, sideAgg = {};
    depts.forEach(d => { const s = d.area || sides[d.side || (d.code || '')[0]] || 'อื่นๆ'; const a = sideAgg[s] = sideAgg[s] || { total: 0, n: 0 }; a.total += Store.deptTotal(year, d.id); a.n++; });
    const sideList = Object.keys(sideAgg).map(s => ({ s, name: s, total: sideAgg[s].total, n: sideAgg[s].n, share: cur > 0 ? sideAgg[s].total / cur * 100 : 0 })).sort((a, b) => b.total - a.total);
    const topDepts = depts.map(d => ({ name: d.name, v: Store.deptTotal(year, d.id) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
    const gById = {}; Store.db.glAccounts.forEach(g => gById[g.id] = g);
    const grp = {}; bs.forEach(b => { const g = gById[b.glId]; if (!g) return; const k = g.glGroupSap || g.glGroup || 'อื่นๆ'; grp[k] = (grp[k] || 0) + sumM(b.months, 12); });
    const topGrp = Object.entries(grp).map(([name, v]) => ({ name, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
    const dSideOf = {}; depts.forEach(d => dSideOf[d.id] = d.area || sides[d.side || (d.code || '')[0]] || 'อื่นๆ');
    const sv = {}; (snap ? snap.rows : []).forEach(r => { const s = dSideOf[r.departmentId] || 'อื่นๆ'; (sv[s] = sv[s] || { oY: 0, aY: 0 }).oY += sumM(r.months, thru); });
    actuals.forEach(a => { const s = dSideOf[a.departmentId] || 'อื่นๆ'; (sv[s] = sv[s] || { oY: 0, aY: 0 }).aY += sumM(a.months, thru); });
    const varList = Object.keys(sv).map(s => ({ name: s, oY: sv[s].oY, aY: sv[s].aY, dv: sv[s].aY - sv[s].oY })).sort((a, b) => b.dv - a.dv);
    const vol = m => { const v = Store.volume(year, m); return v.actual ?? v.plan ?? 0; };
    const caneTon = vol('caneCompany') + vol('caneCommunity'), sugarTon = vol('sugarProduce') + vol('sugarTrading');
    const reqs = Store.changeRequests().filter(r => r.year === year);
    const reqCnt = { pending: reqs.filter(r => ['PENDING_MGR', 'PENDING_ACC'].includes(r.status)).length, approved: reqs.filter(r => r.status === 'APPROVED').length, total: reqs.length };
    const states = depts.map(d => Store.deptState(year, d.id).status);
    const submitted = states.filter(s => ['SUBMITTED', 'ENDORSED', 'LOCKED'].includes(s)).length;
    return { year, prevYear, cur, prev, rows, deptN: depts.length, mtp1, mtp2, thru, snap: !!snap, origYTD, actYTD, ytdVar, ytdPct, origFull, outlook, outlookPct, runRate,
      sideList, topDepts, topGrp, varList, caneTon, sugarTon, perCane: caneTon > 0 ? cur / caneTon : null, perSugar: sugarTon > 0 ? cur / sugarTon : null,
      reqCnt, winsOpen: Store.changeWindowsOpen(year).map(w => w.label), submitted, periodClosed: Store.budgetRoundClosed(year) };
  }
  function presentSlides(D) {
    const S = [], sub = t => `<div class="ps-sub">${t}</div>`;
    const bars = (items, key) => { const mx = Math.max(1, ...items.map(x => x[key] != null ? x[key] : x.v)); return `<div class="ps-bars">` + items.map(it => { const v = it[key] != null ? it[key] : it.v; return `<div class="ps-bar-row"><span class="ps-bar-lbl">${esc((it.name || '').replace('แผนก', ''))}</span><span class="ps-bar-track"><i style="width:${Math.max(3, v / mx * 100).toFixed(1)}%"></i></span><span class="ps-bar-val">${thShort(v)}</span></div>`; }).join('') + `</div>`; };
    // 1 title
    S.push(`<div class="ps-center"><div class="ps-logo">📊</div><div class="ps-co">${esc(Store.db.meta.company)}</div><h1 class="ps-h1">สรุปผู้บริหาร · งบประมาณประจำปี ${D.year}</h1><div class="ps-date">${asOf()}${D.periodClosed ? ' · 🔒 ปิดรอบแล้ว' : ''}</div></div>`);
    // 2 company total
    S.push(`<div class="ps-kick">งบประมาณทั้งบริษัท ปี ${D.year}</div><div class="ps-big">${thShort(D.cur)} <span>กีบ</span></div>${sub(`${fmt(D.cur)} กีบ · ${D.deptN} แผนก · ${fmt(D.rows)} รายการงบ · ส่งแล้ว ${D.submitted}/${D.deptN}`)}
      <div class="ps-mini3"><div><div class="ps-ml">เทียบปี ${D.prevYear}</div><div class="ps-mv">${D.prev > 0 ? thShort(D.prev) : '—'}</div></div><div><div class="ps-ml">MTP ปี ${D.year + 1}</div><div class="ps-mv">${D.mtp1 > 0 ? thShort(D.mtp1) : '—'}</div></div><div><div class="ps-ml">MTP ปี ${D.year + 2}</div><div class="ps-mv">${D.mtp2 > 0 ? thShort(D.mtp2) : '—'}</div></div></div>`);
    // 3 YTD actual vs plan
    if (D.snap && D.thru > 0) S.push(`<div class="ps-kick">เกิดจริงสะสม เทียบแผน (เดือน 1-${D.thru})</div>
      <div class="ps-duo"><div><div class="ps-ml">แผน YTD</div><div class="ps-num">${thShort(D.origYTD)}</div></div><div class="ps-arrow">→</div><div><div class="ps-ml">เกิดจริง YTD</div><div class="ps-num">${thShort(D.actYTD)}</div></div></div>
      <div class="ps-big ${D.ytdVar <= 0 ? 'ps-good' : 'ps-bad'}">${D.ytdVar > 0 ? '+' : ''}${thShort(D.ytdVar)} <span>กีบ (${(D.ytdPct >= 0 ? '+' : '') + D.ytdPct.toFixed(1)}%)</span></div>
      ${sub(`${D.ytdVar <= 0 ? '✅ ต่ำกว่าแผน (ดีต่อต้นทุน)' : '🔴 เกินแผน — ควรตรวจสอบ'} · Run-rate ${thShort(D.runRate)}/ปี · Outlook เต็มปี ${D.outlook > 0 ? '+' : ''}${thShort(D.outlook)} (${(D.outlookPct >= 0 ? '+' : '') + D.outlookPct.toFixed(1)}%)`)}`);
    // 4 by side
    S.push(`<div class="ps-kick">งบตามสังกัด (${D.sideList.length} ด้าน)</div>${bars(D.sideList, 'total')}${sub(D.sideList.map(x => `${esc(x.name)} ${x.share.toFixed(0)}%`).join(' · '))}`);
    // 5 top depts
    S.push(`<div class="ps-kick">แผนกงบสูงสุด (ตัวตึง) · Top ${D.topDepts.length}</div>${bars(D.topDepts, 'v')}`);
    // 6 GL groups (P&L)
    S.push(`<div class="ps-kick">งบตามกลุ่มบัญชี (P&L) · Top ${D.topGrp.length}</div>${bars(D.topGrp, 'v')}`);
    // 7 variance by side
    if (D.snap && D.thru > 0) S.push(`<div class="ps-kick">Variance รายสังกัด — จริง เทียบแผน YTD (ด.1-${D.thru})</div>
      <div class="ps-vtable">${D.varList.map(x => `<div class="ps-vrow"><span class="ps-bar-lbl">${esc(x.name)}</span><span class="ps-vnum">${thShort(x.aY)} <small>/ ${thShort(x.oY)}</small></span><span class="ps-vdv ${x.dv <= 0 ? 'ps-good' : 'ps-bad'}">${x.dv > 0 ? '+' : ''}${thShort(x.dv)}</span></div>`).join('')}</div>
      ${sub('สีเขียว = ต่ำกว่าแผน (ดี) · สีแดง = เกินแผน')}`);
    // 8 unit cost
    S.push(`<div class="ps-kick">ต้นทุนต่อหน่วย ปี ${D.year}</div>
      <div class="ps-duo"><div><div class="ps-ml">🌾 ต้นทุน / ตันอ้อย</div><div class="ps-num2">${D.perCane != null ? fmt(Math.round(D.perCane)) : '—'} <small>กีบ/ตัน</small></div></div><div><div class="ps-ml">🍬 ต้นทุน / ตันน้ำตาล</div><div class="ps-num2">${D.perSugar != null ? fmt(Math.round(D.perSugar)) : '—'} <small>กีบ/ตัน</small></div></div></div>
      ${sub(D.caneTon > 0 || D.sugarTon > 0 ? `อ้อย ${fmt(Math.round(D.caneTon))} ตัน · น้ำตาล ${fmt(Math.round(D.sugarTon))} ตัน (งบรวม ÷ ปริมาณ)` : 'ยังไม่ได้กรอกปริมาณผลิต — ดูหน้า “ต้นทุนต่อหน่วย”')}`);
    // 9 change requests
    S.push(`<div class="ps-kick">คำร้องปรับงบกลางปี ${D.year}</div>
      <div class="ps-mini3"><div><div class="ps-ml">รออนุมัติ</div><div class="ps-mv">${D.reqCnt.pending}</div></div><div><div class="ps-ml">อนุมัติแล้ว</div><div class="ps-mv">${D.reqCnt.approved}</div></div><div><div class="ps-ml">ทั้งหมด</div><div class="ps-mv">${D.reqCnt.total}</div></div></div>
      ${sub(D.winsOpen.length ? '🟢 เปิดรับ: ' + D.winsOpen.map(esc).join(' · ') : (D.periodClosed ? '⚪ ปิดรับคำร้อง' : '🔒 ยังไม่ปิดรอบการตั้งงบ'))}`);
    // 10 insights
    const ins = [];
    if (D.snap && D.thru > 0) {
      ins.push(`${D.ytdVar <= 0 ? '✅' : '🔴'} <b>YTD:</b> เกิดจริง ${thShort(D.actYTD)} เทียบแผน ${thShort(D.origYTD)} → ${D.ytdVar <= 0 ? 'ต่ำกว่าแผน' : 'เกินแผน'} ${thShort(Math.abs(D.ytdVar))} (${(D.ytdPct >= 0 ? '+' : '') + D.ytdPct.toFixed(1)}%)`);
      ins.push(`📈 <b>Run-rate:</b> ${thShort(D.runRate)}/ปี — ${D.runRate > D.origFull ? 'สูงกว่าแผนเต็มปี ถ้าคงอัตรานี้จะเกินงบ' : 'อยู่ในกรอบแผนเต็มปี'}`);
      ins.push(`🎯 <b>Outlook เต็มปี:</b> ${thShort(D.cur)} เทียบแผน ${thShort(D.origFull)} → ${D.outlook > 0 ? 'จะเกิน' : 'ต่ำกว่า'}แผน ${thShort(Math.abs(D.outlook))} (${(D.outlookPct >= 0 ? '+' : '') + D.outlookPct.toFixed(1)}%)`);
      if (D.varList[0] && D.varList[0].dv > 0) ins.push(`⚠️ <b>${esc(D.varList[0].name)}</b> เกินแผน YTD สูงสุด ${thShort(D.varList[0].dv)} กีบ`);
    } else ins.push('ℹ️ ยังไม่มีตัวเลขเกิดจริง — เปิดรอบ Revise แล้วใส่เกิดจริงเพื่อดู Variance / Outlook');
    if (D.perCane != null) ins.push(`🏭 <b>ต้นทุน/ตันอ้อย:</b> ${fmt(Math.round(D.perCane))} กีบ/ตัน`);
    S.push(`<div class="ps-kick">🧠 Insights — วิเคราะห์อัตโนมัติ (FP&A)</div><ul class="ps-ins">${ins.map(x => `<li>${x}</li>`).join('')}</ul>`);
    // 11 closing
    S.push(`<div class="ps-center"><div class="ps-logo">✅</div><h1 class="ps-h1">จบการนำเสนอ</h1><div class="ps-date">${esc(Store.db.meta.company)} · ${asOf()}</div><div class="ps-sub" style="margin-top:14px">กด ESC เพื่อออกจากโหมดนำเสนอ</div></div>`);
    return S;
  }
  function openPresent(year) {
    const slides = presentSlides(presentCompute(year));
    let i = 0;
    const ov = document.createElement('div');
    ov.className = 'ps-overlay';
    ov.innerHTML = `<div class="ps-stage"></div>
      <button class="ps-exit" title="ออก (ESC)">✕</button>
      <div class="ps-ctrl"><button class="ps-nav" data-p="-1" title="ก่อนหน้า (←)">‹</button><span class="ps-count"></span><button class="ps-nav" data-p="1" title="ถัดไป (→)">›</button></div>
      <div class="ps-progress"><i></i></div>`;
    document.body.appendChild(ov);
    const stage = ov.querySelector('.ps-stage');
    const show = () => { stage.innerHTML = `<div class="ps-slide">${slides[i]}</div>`; ov.querySelector('.ps-count').textContent = (i + 1) + ' / ' + slides.length; ov.querySelector('.ps-progress i').style.width = ((i + 1) / slides.length * 100) + '%'; };
    const go = d => { i = Math.max(0, Math.min(slides.length - 1, i + d)); show(); };
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
    const onKey = e => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') { i = 0; show(); } else if (e.key === 'End') { i = slides.length - 1; show(); }
    };
    document.addEventListener('keydown', onKey);
    ov.querySelector('.ps-exit').addEventListener('click', close);
    ov.querySelectorAll('.ps-nav').forEach(b => b.addEventListener('click', () => go(+b.dataset.p)));
    stage.addEventListener('click', e => { if (e.target.closest('a')) return; go(e.clientX > window.innerWidth / 2 ? 1 : -1); });
    show();
    if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
  }

  /* ============ จัดการผู้ใช้ (Admin) — สมุด email→บทบาท + หน้าที่แต่ละคนเข้าถึง ============ */
  function hatInfo(r) {
    if (r.kind === 'filler') return { cls: 'fill', ic: '📝', tag: 'ผู้กรอกงบ', pg: `${esc(r.name)} <small>(${r.id})</small>`, sub: 'หน้ากรอกงบประมาณของแผนก' };
    if (r.id === 'MGR:co') return { cls: 'co', ic: '🏢', tag: 'ผู้ดูภาพรวมบริษัท (กจก.)', pg: esc(r.name), sub: 'Dashboard ภาพรวมทั้งบริษัท' };
    if (/^MGR:area_/.test(r.id)) return { cls: 'area', ic: '🏭', tag: 'ผู้ดูระดับสังกัด', pg: esc(r.name), sub: 'Dashboard ทั้งสังกัด' };
    return { cls: 'div', ic: '✅', tag: 'ผู้อนุมัติ (ฝ่าย)', pg: esc(r.name), sub: 'ทวนสอบ/อนุมัติงบของแผนกใต้ฝ่าย' };
  }
  const roleTypeOf = r => r.kind === 'filler' ? 'fill' : (r.id === 'MGR:co' ? 'co' : /^MGR:area_/.test(r.id) ? 'area' : 'div');
  const RT_LB = { fill: 'กรอก', div: 'อนุมัติ', area: 'สังกัด', co: 'ภาพรวมบริษัท' };
  // ตัวเลือกบทบาท (ใช้ทั้งฟอร์มเพิ่มผู้ใช้ + popup จัดการ)
  function roleOpts(firstLabel) {
    return `<option value="">${firstLabel}</option>
      <optgroup label="ผู้กรอกงบ (แผนก)">${Store.activeDepartments().map(d => `<option value="filler|${d.code}">${esc(d.name)} (${d.code})</option>`).join('')}</optgroup>
      <optgroup label="ผู้อนุมัติ / ผู้ดู">${(Store.db.oversight || []).filter(n => n.id === 'co' || /^area_/.test(n.id) || n.approver).map(n => `<option value="viewer|MGR:${n.id}">${esc(n.name)}${n.id === 'co' ? ' (ภาพรวมบริษัท)' : /^area_/.test(n.id) ? ' (สังกัด)' : ' (ฝ่าย)'}</option>`).join('')}</optgroup>`;
  }
  function users(user) {
    const dir = Store.directory().slice().sort((a, b) => (b.roles.length - a.roles.length) || a.email.localeCompare(b.email));
    const nFill = dir.filter(a => a.roles.some(r => r.kind === 'filler')).length;
    const nApp = dir.filter(a => a.roles.some(r => r.kind !== 'filler')).length;
    const nMulti = dir.filter(a => a.roles.length > 1).length;
    const custom = (Store.db.userAccounts || []).length > 0;
    const stat = (n, lb) => `<div class="stat"><b>${n}</b><span>${lb}</span></div>`;
    const rows = dir.map(a => {
      const c = { fill: 0, div: 0, area: 0, co: 0 };
      a.roles.forEach(r => c[roleTypeOf(r)]++);
      const sum = ['fill', 'div', 'area', 'co'].filter(t => c[t]).map(t =>
        `${RT_LB[t]}${t === 'co' ? '' : ' ' + c[t]}`).join(' · ') || 'ยังไม่มีบทบาท';
      return `<div class="ur2" data-email="${esc(a.email)}" data-rn="${a.roles.length}" tabindex="0">
        <div class="ur2-em">${esc(a.email)}</div>
        <div class="ur2-sum">${sum}</div>
        <span class="ur2-badge">${a.roles.length}</span>
        <span class="ur2-go">จัดการ ›</span></div>`;
    }).join('');
    return pageHead('จัดการผู้ใช้', `${dir.length} อีเมล · คลิกที่รายชื่อเพื่อจัดการบทบาท · รหัสเริ่มต้นทุกคน = a`,
        '<a class="ghost-btn" href="#/acc/dashboard">← กลับ</a>')
      + `<div class="ud-add">
          <b>➕ เพิ่มผู้ใช้ใหม่</b>
          <input id="newUserEmail" placeholder="อีเมล เช่น name@mitrphol.com" autocomplete="off">
          <select id="newUserRole">${roleOpts('— เลือกบทบาท (บังคับ) —')}</select>
          <button class="primary-btn" id="addUserBtn">เพิ่มผู้ใช้</button>
        </div>`
      + `<div class="stats-row">${stat(dir.length, '👥 ผู้ใช้ (อีเมล)')}${stat(nFill, '📝 มีบทบาทผู้กรอก')}${stat(nApp, '✅ มีบทบาทผู้อนุมัติ/ผู้ดู')}${stat(nMulti, '🎭 หลายบทบาท')}</div>`
      + (custom ? '' : `<div class="lock-banner" style="background:#eef4fc;border-color:#cfe0f5;color:#2b3654">ℹ️ กำลังใช้รายชื่อค่าเริ่มต้นจากระบบ — เมื่อแก้ครั้งแรกจะบันทึกทั้งชุด (ต้องรัน <b>supabase/user-accounts.sql</b>)</div>`)
      + `<div class="ud-bar2">
          <input id="udSearch" placeholder="🔍 ค้นหา อีเมล / หน่วยงาน / รหัส…" autocomplete="off">
          <select id="udSort" title="เรียงลำดับ">
            <option value="role-desc">เรียง: บทบาทมาก→น้อย</option>
            <option value="role-asc">เรียง: บทบาทน้อย→มาก</option>
            <option value="email-asc">เรียง: A→Z อีเมล</option>
            <option value="email-desc">เรียง: Z→A อีเมล</option>
          </select>
          <span class="count" id="udCount"></span>
        </div>`
      + `<div class="ur-list" id="udGrid">${rows}</div>`;
  }
  // popup จัดการผู้ใช้รายคน — เพิ่ม/ลบบทบาท · รีเซ็ตรหัส · ลบผู้ใช้ (อัปเดตในตัว)
  function openUserModal(actor, email) {
    const ov = document.createElement('div');
    ov.className = 'umodal-ov';
    ov.innerHTML = `<div class="umodal" role="dialog">
      <div class="umodal-h"><div class="umodal-av">${esc(email[0].toUpperCase())}</div>
        <div class="umodal-hi"><div class="umodal-em">${esc(email)}</div><div class="umodal-sub" id="umSub"></div></div>
        <button class="umodal-x" id="umClose" title="ปิด">✕</button></div>
      <div class="umodal-b">
        <div class="umodal-sec">บทบาทของผู้ใช้</div>
        <div class="umodal-roles" id="umRoles"></div>
        <div class="umodal-sec">เพิ่มบทบาท</div>
        <select class="umodal-addsel" id="umAdd">${roleOpts('+ เลือกบทบาทเพื่อเพิ่ม…')}</select>
      </div>
      <div class="umodal-f">
        <button class="ghost-btn small" id="umReset">🔑 รีเซ็ตรหัสผ่าน</button>
        <button class="ghost-btn small btn-clear" id="umDel">🗑 ลบผู้ใช้</button>
        <button class="primary-btn small" id="umDone">เสร็จ</button>
      </div></div>`;
    document.body.appendChild(ov);
    document.body.classList.add('no-scroll');
    const onEsc = e => { if (e.key === 'Escape') close(); };
    const close = () => { document.removeEventListener('keydown', onEsc); ov.remove(); document.body.classList.remove('no-scroll'); App.render(); };
    const renderRoles = () => {
      const a = Store.directoryAccount(email) || { roles: [] };
      document.getElementById('umSub').textContent = a.roles.length + ' บทบาท';
      const box = document.getElementById('umRoles');
      box.innerHTML = a.roles.length ? a.roles.map(r => { const t = roleTypeOf(r);
        return `<div class="umr-row"><span class="umr-tag ${t}">${RT_LB[t]}</span><span class="umr-name">${esc(r.name)}${r.kind === 'filler' ? ` <em>${r.id}</em>` : ''}</span>
          <button class="umr-del" data-rm="${r.kind}|${esc(String(r.id))}" title="ลบบทบาทนี้">✕</button></div>`; }).join('')
        : '<div class="muted" style="padding:6px 2px">ยังไม่มีบทบาท — เลือกด้านล่างเพื่อเพิ่ม</div>';
      box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
        const [k, id] = b.dataset.rm.split('|');
        try { Store.removeUserRole(actor, email, k, id); renderRoles(); } catch (e) { toast(e.message, 'err'); }
      }));
    };
    renderRoles();
    document.getElementById('umAdd').addEventListener('change', e => {
      if (!e.target.value) return;
      const [k, id] = e.target.value.split('|');
      try { Store.addUserRole(actor, email, k, id); renderRoles(); } catch (er) { toast(er.message, 'err'); }
      e.target.value = '';
    });
    document.getElementById('umReset').addEventListener('click', () => {
      try { Store.resetUserPassword(actor, email); toast(`รีเซ็ตรหัสผ่าน ${email} เป็น 'a' แล้ว`); } catch (e) { toast(e.message, 'err'); }
    });
    document.getElementById('umDel').addEventListener('click', () => {
      UI.confirm2(`ลบผู้ใช้ ${email}?`, 'ผู้ใช้นี้จะเข้าระบบไม่ได้อีก (ข้อมูลงบที่กรอกไว้ไม่ถูกลบ)', 'ลบออกจากสมุดผู้ใช้',
        () => { try { Store.removeUserAccount(actor, email); toast('ลบผู้ใช้แล้ว'); close(); } catch (e) { toast(e.message, 'err'); } });
    });
    document.getElementById('umClose').addEventListener('click', close);
    document.getElementById('umDone').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onEsc);
  }
  function usersBind(user) {
    document.getElementById('addUserBtn')?.addEventListener('click', () => {
      const el = document.getElementById('newUserEmail'), rl = document.getElementById('newUserRole');
      const email = el.value.trim();
      if (!rl.value) { toast('ต้องเลือกบทบาทอย่างน้อย 1 ก่อนเพิ่มผู้ใช้', 'err'); rl.focus(); return; }
      try {
        Store.addUserAccount(user, email);
        const [k, id] = rl.value.split('|'); Store.addUserRole(user, email, k, id);
        toast('เพิ่มผู้ใช้แล้ว'); el.value = ''; rl.value = ''; openUserModal(user, email);
      } catch (e) { toast(e.message, 'err'); }
    });
    document.querySelectorAll('.ur2').forEach(row => {
      const open = () => openUserModal(user, row.dataset.email);
      row.addEventListener('click', open);
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    const q = document.getElementById('udSearch'), grid = document.getElementById('udGrid'), cnt = document.getElementById('udCount'), sortSel = document.getElementById('udSort');
    const rows = [...grid.querySelectorAll('.ur2')];
    const filt = () => {
      const f = (q.value || '').trim().toLowerCase();
      let n = 0;
      rows.forEach(c => { const hit = !f || c.textContent.toLowerCase().includes(f); c.style.display = hit ? '' : 'none'; if (hit) n++; });
      cnt.textContent = n + ' / ' + rows.length + ' คน';
    };
    const sortRows = () => {
      const m = sortSel.value;
      const rn = el => Number(el.dataset.rn || 0), em = el => el.dataset.email || '';
      const cmp = m === 'role-asc' ? (a, b) => rn(a) - rn(b) || em(a).localeCompare(em(b))
        : m === 'email-asc' ? (a, b) => em(a).localeCompare(em(b))
        : m === 'email-desc' ? (a, b) => em(b).localeCompare(em(a))
        : (a, b) => rn(b) - rn(a) || em(a).localeCompare(em(b));
      [...rows].sort(cmp).forEach(el => grid.appendChild(el));
    };
    q?.addEventListener('input', filt);
    sortSel?.addEventListener('change', sortRows);
    filt();
  }

  /* ============ วิเคราะห์งบ (รวม วิเคราะห์ + งบการเงิน + ควบคุมงบ เป็นแท็บเดียว) ============ */
  const AN_TABS = [
    { k: 'analyze',  ic: '📈', label: 'วิเคราะห์งบ' },
    { k: 'pnl',      ic: '📑', label: 'งบการเงิน (P&L)' },
    { k: 'variance', ic: '🎯', label: 'ควบคุมงบ (เกิดจริง)' },
  ];
  const anTab = () => { const t = parseQS().tab; return AN_TABS.some(x => x.k === t) ? t : 'analyze'; };
  function analytics(user) {
    const year = UI.year(), tab = anTab();
    const bar = `<div class="an-tabs">${AN_TABS.map(t => `<a class="an-tab ${t.k === tab ? 'active' : ''}" href="#/acc/analytics?tab=${t.k}">${t.ic} <span>${t.label}</span></a>`).join('')}</div>`;
    const body = tab === 'pnl' ? pnl(user, true) : tab === 'variance' ? variance(user, true) : analysis(user, true);
    return pageHead(`วิเคราะห์งบประมาณ ปี ${year}`, `วิเคราะห์งบ · งบการเงิน · ควบคุมงบ (เกิดจริง) — รวมในหน้าเดียว · ${asOf()}`)
      + bar + `<div class="an-body">${body}</div>`;
  }
  function analyticsBind(user) {
    const tab = anTab();
    if (tab === 'pnl') pnlBind(user);
    else if (tab === 'variance') varianceBind(user);
    else analysisBind(user);
  }

  return { dashboard, dashboardBind, departments, departmentsBind, analysis, analysisBind, analytics, analyticsBind, control, controlBind, system, systemBind, audit, auditBind, actuals, actualsBind, pnl, pnlBind, variance, varianceBind, users, usersBind, exportForUser };
})();

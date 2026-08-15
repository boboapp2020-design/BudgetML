/* =============================================================
 * charts.js — SVG chart helpers (offline, ไม่ใช้ library ภายนอก)
 * Palette: ชุด validated colorblind-safe (dataviz reference palette)
 * เทียบปี: ปีก่อน = ฟ้าอ่อน #86b6ef (ordinal step 250), ปีนี้ = น้ำเงิน #256abf (step 500)
 * ============================================================= */

const Charts = (() => {
  const CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
  const PREV_C = '#86b6ef', CUR_C = '#256abf';
  const INK = '#0b0b0b', INK2 = '#52514e', MUTED = '#898781', GRID = '#e1e0d9', BASE = '#c3c2b7';

  const fmtShort = v => {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(0) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return String(Math.round(v));
  };
  const fmtFull = v => Math.round(v).toLocaleString('en-US');

  /* ---------- tooltip (shared) ---------- */
  let tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'chart-tip';
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(ev, html) {
    const t = tip();
    t.innerHTML = html;
    t.style.display = 'block';
    const pad = 12;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function svgBase(container, W, H) {
    container.innerHTML = '';
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'display:block;font-family:inherit' });
    container.appendChild(svg);
    return svg;
  }
  function yAxis(svg, x0, x1, y0, y1, max, ticks = 4) {
    for (let i = 0; i <= ticks; i++) {
      const v = max * i / ticks;
      const y = y1 - (y1 - y0) * i / ticks;
      svg.appendChild(el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: i === 0 ? BASE : GRID, 'stroke-width': 1 }));
      const t = el('text', { x: x0 - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: MUTED });
      t.textContent = fmtShort(v);
      svg.appendChild(t);
    }
  }

  /* ---------- Grouped bar: เทียบปีก่อน/ปีนี้ ตามหมวด ---------- */
  function groupedBar(container, labels, series, opts = {}) {
    // series: [{name, color, values}]
    const W = opts.width || 640, H = opts.height || 260, padL = 52, padR = 8, padT = 12, padB = 40;
    const svg = svgBase(container, W, H);
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    yAxis(svg, padL, W - padR, padT, H - padB, max);
    const n = labels.length, groupW = (W - padL - padR) / n;
    const barW = Math.min(26, (groupW - 12) / series.length);
    labels.forEach((lab, i) => {
      const cx = padL + groupW * i + groupW / 2;
      series.forEach((s, si) => {
        const v = s.values[i] ?? 0;
        const h = (H - padB - padT) * v / max;
        const x = cx - barW * series.length / 2 + si * barW + (si > 0 ? 2 : 0);
        const r = el('rect', { x, y: H - padB - h, width: barW - (series.length > 1 ? 2 : 0), height: Math.max(h, v > 0 ? 2 : 0), fill: s.color, rx: 3 });
        r.addEventListener('mousemove', ev => showTip(ev, `<b>${lab}</b><br>${s.name}: <b>${fmtFull(v)}</b> กีบ`));
        r.addEventListener('mouseleave', hideTip);
        svg.appendChild(r);
      });
      const t = el('text', { x: cx, y: H - padB + 16, 'text-anchor': 'middle', 'font-size': 11, fill: INK2 });
      t.textContent = lab;
      svg.appendChild(t);
    });
    legend(container, series);
  }

  /* ---------- Line: แนวโน้มรายเดือน ---------- */
  function line(container, labels, series, opts = {}) {
    const W = opts.width || 640, H = opts.height || 260, padL = 52, padR = 12, padT = 12, padB = 40;
    const svg = svgBase(container, W, H);
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    yAxis(svg, padL, W - padR, padT, H - padB, max);
    const n = labels.length;
    const px = i => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1));
    const py = v => H - padB - (H - padB - padT) * v / max;
    labels.forEach((lab, i) => {
      if (i % Math.ceil(n / 12) === 0) {
        const t = el('text', { x: px(i), y: H - padB + 16, 'text-anchor': 'middle', 'font-size': 11, fill: INK2 });
        t.textContent = lab;
        svg.appendChild(t);
      }
    });
    series.forEach(s => {
      const d = s.values.map((v, i) => (i === 0 ? 'M' : 'L') + px(i).toFixed(1) + ' ' + py(v ?? 0).toFixed(1)).join(' ');
      svg.appendChild(el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      s.values.forEach((v, i) => {
        const c = el('circle', { cx: px(i), cy: py(v ?? 0), r: 3.5, fill: s.color, stroke: '#fcfcfb', 'stroke-width': 1.5 });
        c.addEventListener('mousemove', ev => showTip(ev, `<b>${labels[i]}</b><br>${s.name}: <b>${fmtFull(v ?? 0)}</b> กีบ`));
        c.addEventListener('mouseleave', hideTip);
        svg.appendChild(c);
      });
    });
    legend(container, series);
  }

  /* ---------- Horizontal bar: Top GL ---------- */
  function hbar(container, items, opts = {}) {
    // items: [{label, sub, value, color, onClick}]
    const W = opts.width || 640, rowH = 34, padL = 8, padT = 4;
    const labelW = opts.labelW || 210, valueW = 86;
    const H = padT * 2 + rowH * items.length;
    const svg = svgBase(container, W, H);
    const max = niceMax(Math.max(1, ...items.map(i => Math.abs(i.value))));
    items.forEach((it, i) => {
      const y = padT + rowH * i;
      const t = el('text', { x: padL, y: y + rowH / 2 + 4, 'font-size': 12, fill: INK });
      t.textContent = it.label.length > 30 ? it.label.slice(0, 29) + '…' : it.label;
      svg.appendChild(t);
      const bw = (W - labelW - valueW - padL) * Math.abs(it.value) / max;
      const r = el('rect', { x: labelW, y: y + 7, width: Math.max(bw, 2), height: rowH - 14, fill: it.color || CAT[0], rx: 3 });
      if (it.onClick) { r.style.cursor = 'pointer'; r.addEventListener('click', it.onClick); }
      r.addEventListener('mousemove', ev => showTip(ev, `<b>${it.label}</b><br>${it.sub || ''}<b>${fmtFull(it.value)}</b> กีบ`));
      r.addEventListener('mouseleave', hideTip);
      svg.appendChild(r);
      const v = el('text', { x: W - 4, y: y + rowH / 2 + 4, 'text-anchor': 'end', 'font-size': 12, fill: INK2, 'font-variant-numeric': 'tabular-nums' });
      v.textContent = fmtShort(it.value);
      svg.appendChild(v);
    });
  }

  /* ---------- Donut: สัดส่วน (จำกัด ≤4 ชิ้น + อื่นๆ) ---------- */
  function donut(container, items, opts = {}) {
    const size = opts.size || 210, R = size / 2 - 6, r2 = R * 0.62, cx = size / 2, cy = size / 2;
    const wrap = document.createElement('div');
    wrap.className = 'donut-wrap';
    container.innerHTML = '';
    container.appendChild(wrap);
    const svgDiv = document.createElement('div');
    wrap.appendChild(svgDiv);
    const svg = svgBase(svgDiv, size, size);
    svgDiv.style.width = size + 'px';
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    let a0 = -Math.PI / 2;
    items.forEach(it => {
      const frac = it.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const p = (a, rr) => `${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)}`;
      const gap = 0.012;
      const d = `M ${p(a0 + gap, R)} A ${R} ${R} 0 ${large} 1 ${p(a1 - gap, R)} L ${p(a1 - gap, r2)} A ${r2} ${r2} 0 ${large} 0 ${p(a0 + gap, r2)} Z`;
      const path = el('path', { d, fill: it.color });
      path.addEventListener('mousemove', ev => showTip(ev, `<b>${it.label}</b><br><b>${fmtFull(it.value)}</b> กีบ (${(frac * 100).toFixed(1)}%)`));
      path.addEventListener('mouseleave', hideTip);
      svg.appendChild(path);
      a0 = a1;
    });
    const ct = el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: INK });
    ct.textContent = fmtShort(total);
    svg.appendChild(ct);
    const cs = el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 10, fill: MUTED });
    cs.textContent = 'กีบ รวม';
    svg.appendChild(cs);
    // legend as table
    const lg = document.createElement('div');
    lg.className = 'donut-legend';
    lg.innerHTML = items.map(it =>
      `<div class="dl-row"><span class="dl-dot" style="background:${it.color}"></span>
       <span class="dl-name">${it.label}</span>
       <span class="dl-val">${fmtFull(it.value)}</span>
       <span class="dl-pct">${(it.value / total * 100).toFixed(1)}%</span></div>`).join('');
    wrap.appendChild(lg);
  }

  function legend(container, series) {
    const lg = document.createElement('div');
    lg.className = 'chart-legend';
    lg.innerHTML = series.map(s => `<span class="lg-item"><span class="dl-dot" style="background:${s.color}"></span>${s.name}</span>`).join('');
    container.appendChild(lg);
  }

  /* ---------- Gauge: วงแหวน 270° สไตล์โมเดิร์น (gradient + animation, 100% = เขียวสด) ---------- */
  function gaugeTheme(pct) {
    if (pct >= 100) return ['#34d399', '#059669']; // เขียวสด
    if (pct >= 70)  return ['#fcd34d', '#d97706']; // เหลืองทอง
    if (pct >= 40)  return ['#fdba74', '#ea580c']; // ส้ม
    return ['#fca5a5', '#dc2626'];                 // แดง
  }
  function gaugeColor(pct) { return gaugeTheme(pct)[1]; }
  let gaugeId = 0;
  function gauge(pct, opts = {}) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    const S = opts.width || 118;
    const sw = S * 0.085;                       // ความหนาเส้น (บาง ทันสมัย)
    const c = S / 2, r = (S - sw) / 2 - 1;
    const [c1, c2] = gaugeTheme(pct);
    const id = 'gg' + (++gaugeId);
    // วงแหวน 270° เริ่มมุมล่างซ้าย (135°) กวาดตามเข็มไปมุมล่างขวา (45°)
    const rad = d => d * Math.PI / 180;
    const P = d => `${(c + r * Math.cos(rad(d))).toFixed(2)} ${(c + r * Math.sin(rad(d))).toFixed(2)}`;
    const arc = `M ${P(135)} A ${r} ${r} 0 1 1 ${P(45)}`;
    const L = 2 * Math.PI * r * 0.75;           // ความยาวเส้นโค้ง 270°
    const off = L * (1 - pct / 100);
    return `<svg viewBox="0 0 ${S} ${S}" width="${S}" style="display:block" role="img" aria-label="ความคืบหน้า ${pct}%">
      <defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <path d="${arc}" fill="none" stroke="#eeede8" stroke-width="${sw}" stroke-linecap="round"/>
      ${pct > 0 ? `<path d="${arc}" fill="none" stroke="url(#${id})" stroke-width="${sw}" stroke-linecap="round"
        stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}">
        <animate attributeName="stroke-dashoffset" from="${L.toFixed(1)}" to="${off.toFixed(1)}"
          dur="0.8s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"/>
      </path>` : ''}
      <text x="${c}" y="${c + S * 0.07}" text-anchor="middle" font-family="inherit"
        font-size="${S * 0.24}" font-weight="800" fill="${c2}" style="font-variant-numeric:tabular-nums">${pct}<tspan font-size="${S * 0.12}" font-weight="700" dx="1">%</tspan></text>
      ${pct >= 100
        ? `<circle cx="${c}" cy="${c + S * 0.36}" r="${S * 0.075}" fill="#059669"/>
           <path d="M ${c - S * 0.035} ${c + S * 0.36} l ${S * 0.025} ${S * 0.028} l ${S * 0.05} -${S * 0.058}" fill="none" stroke="#fff" stroke-width="${S * 0.022}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<text x="${c}" y="${c + S * 0.38}" text-anchor="middle" font-size="${S * 0.085}" fill="#898781" font-family="inherit">ความคืบหน้า</text>`}
    </svg>`;
  }

  return { CAT, PREV_C, CUR_C, groupedBar, line, hbar, donut, gauge, gaugeColor, fmtShort, fmtFull };
})();

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

  /* ---------- Gauge: % ความคืบหน้า (สีเปลี่ยนตามระดับ, 100% = เขียวสด) ---------- */
  function gaugeColor(pct) {
    if (pct >= 100) return '#0ca30c';
    if (pct >= 70)  return '#eda100';
    if (pct >= 40)  return '#eb6834';
    return '#d03b3b';
  }
  function gauge(pct, opts = {}) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    const W = opts.width || 150, H = W * 0.62;
    const cx = W / 2, cy = H * 0.92, r = W * 0.38, sw = W * 0.105;
    const color = gaugeColor(pct);
    const a = Math.PI * (1 - pct / 100); // 180° → 0°
    const x2 = cx + r * Math.cos(a), y2 = cy - r * Math.sin(a);
    const large = pct > 50 ? 1 : 0;
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" style="display:block" role="img" aria-label="ความคืบหน้า ${pct}%">
      <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#e1e0d9" stroke-width="${sw}" stroke-linecap="round"/>
      ${pct > 0 ? `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>` : ''}
      <text x="${cx}" y="${cy - r * 0.12}" text-anchor="middle" font-size="${W * 0.17}" font-weight="800" fill="${color}" font-family="inherit">${pct}%</text>
      ${pct >= 100 ? `<text x="${cx}" y="${cy - r * 0.62}" text-anchor="middle" font-size="${W * 0.1}">✓</text>` : ''}
    </svg>`;
  }

  return { CAT, PREV_C, CUR_C, groupedBar, line, hbar, donut, gauge, gaugeColor, fmtShort, fmtFull };
})();

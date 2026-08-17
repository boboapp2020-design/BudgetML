/* =============================================================
 * ui.js — Shared UI: layout shell, formatters, components
 * ============================================================= */

const UI = (() => {
  /* ---------- formatters ---------- */
  const fmt = v => (v === null || v === undefined || isNaN(v)) ? '—' : Math.round(v).toLocaleString('en-US');
  const fmtShort = Charts.fmtShort;
  const fmtPct = p => p === null ? 'ใหม่' : (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
  const fmtDT = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
           d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };
  // ทิศทางงบประมาณ: เพิ่ม = แดง (ใช้เงินมากขึ้น), ลด = เขียว, คงที่ = เทา
  function deltaBadge(diff, pct) {
    if (diff === 0) return `<span class="delta neutral">— 0%</span>`;
    const cls = diff > 0 ? 'up' : 'down';
    const arrow = diff > 0 ? '▲' : '▼';
    const p = pct === null ? 'ใหม่' : Math.abs(pct).toFixed(1) + '%';
    return `<span class="delta ${cls}">${arrow} ${p}</span>`;
  }
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const STATUS_TH = {
    DRAFT:        { label: 'Draft',         th: 'ยังไม่เริ่ม',        cls: 'st-draft' },
    IN_PROGRESS:  { label: 'In Progress',   th: 'กำลังจัดทำ',        cls: 'st-progress' },
    COMPLETED:    { label: 'Completed',     th: 'กรอกครบแล้ว',       cls: 'st-completed' },
    SUBMITTED:    { label: 'Submitted',     th: 'ส่งแล้ว รอตรวจ',    cls: 'st-submitted' },
    NEED_REVISION:{ label: 'Need Revision', th: 'ต้องแก้ไข',         cls: 'st-revision' },
    LOCKED:       { label: 'Locked',        th: 'ปิดรอบแล้ว',        cls: 'st-locked' },
  };
  const statusBadge = st => {
    const s = STATUS_TH[st] || STATUS_TH.DRAFT;
    return `<span class="status-badge ${s.cls}">${s.label} · ${s.th}</span>`;
  };

  /* ---------- layout shell ---------- */
  const NAV_USER = [
    { hash: '#/budget',    icon: '📝', label: 'กรอกงบประมาณ',    sub: 'Budget Input' },
    { hash: '#/review',    icon: '✅', label: 'ตรวจสอบงบประมาณ', sub: 'Review & Submit' },
    { hash: '#/dashboard', icon: '📊', label: 'Dashboard',        sub: 'ภาพรวมหน่วยงาน' },
  ];
  const NAV_MGR = [
    { hash: '#/mgr/dashboard', icon: '📊', label: 'ภาพรวมฝ่าย', sub: 'Division Overview' },
  ];
  const NAV_ACC = [
    { hash: '#/acc/dashboard',   icon: '📊', label: 'Executive Dashboard', sub: 'ภาพรวมทั้งบริษัท' },
    { hash: '#/acc/departments', icon: '🏢', label: 'หน่วยงาน & Drill-down', sub: 'Departments' },
    { hash: '#/acc/analysis',    icon: '📈', label: 'วิเคราะห์งบประมาณ',  sub: 'Analysis' },
    { hash: '#/acc/control',     icon: '⚙️', label: 'Budget Control',      sub: 'จัดการระบบ' },
    { hash: '#/acc/audit',       icon: '📜', label: 'Audit Log',           sub: 'ประวัติการแก้ไข' },
  ];

  /* โลโก้แอป — ถุงเงิน ₭ + เหรียญซ้อน + แท่งกราฟ + ลูกศรขึ้น ในวงกลมน้ำเงิน (inline SVG) */
  const APP_LOGO = `
  <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="โลโก้ งบประมาณประจำปี">
    <defs>
      <linearGradient id="alRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f8be8"/><stop offset="1" stop-color="#1c5cab"/></linearGradient>
      <linearGradient id="alBag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a4494"/><stop offset="1" stop-color="#0c2c61"/></linearGradient>
    </defs>
    <circle cx="24" cy="24" r="22" fill="#ffffff"/>
    <circle cx="24" cy="24" r="22" fill="none" stroke="url(#alRing)" stroke-width="3.1"/>
    <rect x="8.5" y="27.5" width="3" height="6.5" rx="1" fill="#2a78d6"/>
    <rect x="12.6" y="24" width="3" height="10" rx="1" fill="#6da7ec"/>
    <path d="M27.4 21.6 L33.6 15.4" fill="none" stroke="#6da7ec" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M30.5 15.1 L34 14.9 L33.8 18.4" fill="none" stroke="#6da7ec" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18.6 20 C14.5 23.4 13.6 30.2 17.2 33.9 C20.1 36.9 27.9 36.9 30.8 33.9 C34.4 30.2 33.5 23.4 29.4 20 Z" fill="url(#alBag)"/>
    <path d="M19.3 19.6 C19.3 15.4 21.2 13.8 24 13.8 C26.8 13.8 28.7 15.4 28.7 19.6 Z" fill="url(#alBag)"/>
    <rect x="18.2" y="18.3" width="11.6" height="2.8" rx="1.4" fill="#2f7fd6"/>
    <text x="24" y="30.6" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="12" font-weight="800" fill="#ffffff">₭</text>
    <ellipse cx="34.6" cy="36" rx="5.8" ry="2" fill="#1c5cab"/>
    <ellipse cx="34.6" cy="33.9" rx="5.8" ry="2" fill="#2a78d6"/>
    <ellipse cx="34.6" cy="31.8" rx="5.8" ry="2" fill="#5598e7"/>
    <text x="34.6" y="32.7" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="4.4" font-weight="800" fill="#ffffff">₭</text>
  </svg>`;

  /* ---------- ไอคอนประจำแผนก (เลือกจากคำสำคัญในชื่อ — เรียงจากเฉพาะเจาะจงก่อน) ---------- */
  const DEPT_ICONS = [
    ['บัญชี|การเงิน', '💰'], ['ทรัพยากรบุคคล', '👥'], ['สารสนเทศ|GIS', '💻'],
    ['นิติกร|กฎหมาย', '⚖️'], ['การตลาด', '📣'], ['พัสดุ|LOGISTIC', '📦'],
    ['จัดซื้อ|จัดชื้อ|จัดหาเชื้อเพลิง|จัดหาเชื่อเพลิง', '🛒'], ['ธุรการ', '🗂️'],
    ['สิ่งแวดล้อม|ความปลอดภัย', '🦺'], ['คุณภาพ', '🔬'], ['บรรจุ', '🧂'],
    ['เครื่องมือควบคุม', '🎛️'], ['เครื่องมือ', '🔧'], ['เก็บเกี่ยว', '🚜'],
    ['ชลประทาน|สำรวจ|โยธา', '💧'], ['เลี้ยงวัว', '🐄'], ['พันธุ์อ้อย', '🌱'],
    ['ใบขาว|อินทรีย์', '🧪'], ['ส่งเสริม', '🌱'], ['บริการไร่', '🛻'],
    ['ไร่|อ้อย', '🌾'], ['ลูกหีบ', '⚙️'], ['หม้อไอน้ำ', '🔥'],
    ['หม้อต้ม|หม้อเคี่ยว|หม้อปั่น', '♨️'], ['ไฟฟ้า', '⚡'], ['ซ่อมบำรุง', '🔧'],
    ['TPM', '🛠️'], ['ผลิต|โรงงาน', '🏭'], ['ประสานงาน|ภาครัฐ', '🤝'],
    ['กจ\\.|ผอ\\.|ผจก|ผจ\\.|ผู้อำนวยการ|ผู้จัดการ|สำนักงาน', '👔'],
  ];
  const SIDE_ICONS = { '1': '🏢', '2': '🌾', '3': '🏭', '4': '🗂️' };
  function deptIcon(d) {
    if (!d) return '👤';
    const name = d.name || '';
    for (const [re, ic] of DEPT_ICONS) if (new RegExp(re).test(name)) return ic;
    return SIDE_ICONS[d.side || (d.code || '')[0]] || '🏢';
  }

  let selectedYear = null;
  function year() {
    if (selectedYear) return selectedYear;
    const open = Store.db.budgetPeriods.filter(p => p.status === 'OPEN').map(p => p.year);
    selectedYear = open.length ? Math.max(...open) : Math.max(...Store.db.budgetPeriods.map(p => p.year));
    return selectedYear;
  }
  function setYear(y) { selectedYear = Number(y); }

  function shell(user, contentHtml, activeHash) {
    const nav = (user.role === 'ACCOUNTING' ? NAV_ACC : user.role === 'MANAGER' ? NAV_MGR : NAV_USER)
      .map(n => `<a href="${n.hash}" class="nav-item ${activeHash.startsWith(n.hash) ? 'active' : ''}">
        <span class="nav-ic">${n.icon}</span>
        <span class="nav-tx">${n.label}<small>${n.sub || ''}</small></span></a>`).join('');
    // การ์ดรอบงบประมาณปัจจุบัน (ท้าย sidebar)
    const y = year();
    const p = Store.period(y);
    const now = new Date();
    const yStart = new Date(y, 0, 1), yEnd = new Date(y, 11, 31);
    const daysLeft = Math.max(0, Math.ceil((yEnd - now) / 86400000));
    const prog = Math.min(100, Math.max(0, Math.round((now - yStart) / (yEnd - yStart) * 100)));
    const periodCard = `
      <div class="period-card">
        <div class="pc-title">📅 รอบงบประมาณปัจจุบัน</div>
        <div class="pc-year">ปีงบประมาณ ${y}
          ${p?.status === 'OPEN' ? '<span class="pc-badge open">เปิดใช้งาน</span>' : '<span class="pc-badge closed">ปิดรอบแล้ว</span>'}</div>
        <div class="pc-range">1 ม.ค. ${y} – 31 ธ.ค. ${y}${p?.status === 'OPEN' ? ` · เหลือเวลา ${daysLeft} วัน` : ''}</div>
        <div class="pc-bar"><div class="pc-fill" style="width:${prog}%"></div></div>
      </div>`;
    const notis = Store.myNotifications(user);
    const unread = notis.filter(n => !n.read).length;
    const yearOpts = Store.db.budgetPeriods.slice().sort((a, b) => b.year - a.year)
      .map(p => `<option value="${p.year}" ${p.year === year() ? 'selected' : ''}>ปีงบ ${p.year}${p.status === 'CLOSED' ? ' 🔒' : ''}</option>`).join('');
    return `
    <div class="app">
      <aside class="sidebar">
        <a class="brand brand-link" href="${user.role === 'ACCOUNTING' ? '#/acc/dashboard' : '#/budget'}" title="กลับหน้าหลัก">
          <div class="app-logo">${APP_LOGO}</div>
          <div><div class="brand-name">งบประมาณประจำปี</div>
          <div class="brand-sub">Annual Budget</div></div>
        </a>
        <nav>${nav}</nav>
        <div class="sidebar-foot">
          ${periodCard}
          <div class="sf-company">${esc(Store.db.meta.company)}</div>
          <div class="sf-role">${user.role === 'ACCOUNTING' ? 'Accounting / Admin' : user.role === 'MANAGER' ? esc(user.division || '') : esc(Store.dept(user.departmentId)?.name || '')} · เวอร์ชัน 1.0.0</div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="topbar-left">
            <img class="topbar-idash" src="Logo%20iDash.png" alt="iDash — AI Dashboard Intelligence Platform">
            <select id="yearSel" class="year-select" title="เลือกปีงบประมาณ">${yearOpts}</select>
            ${typeof Sync !== 'undefined' ? Sync.chipHtml() : ''}
          </div>
          <div class="topbar-right">
            <button id="notiBtn" class="icon-btn" title="การแจ้งเตือน">🔔${unread ? `<span class="noti-dot">${unread}</span>` : ''}</button>
            <div class="user-chip"><span class="uc-avatar" title="${user.role === 'ACCOUNTING' ? 'ผู้ดูแลระบบ' : user.role === 'MANAGER' ? esc(user.division || '') : esc(Store.dept(user.departmentId)?.name || '')}">${user.role === 'ACCOUNTING' ? '🧮' : user.role === 'MANAGER' ? '👔' : deptIcon(Store.dept(user.departmentId))}</span>
              <span class="uc-name">${esc(user.name)}</span></div>
            <button id="logoutBtn" class="ghost-btn">ออกจากระบบ</button>
          </div>
          <div id="notiPanel" class="noti-panel" hidden>
            <div class="noti-head">การแจ้งเตือน</div>
            ${notis.length ? notis.slice(0, 15).map(n =>
              `<div class="noti-item ${n.read ? '' : 'unread'}"><div>${esc(n.message)}</div><div class="noti-ts">${fmtDT(n.ts)}</div></div>`).join('')
              : '<div class="noti-item">ไม่มีการแจ้งเตือน</div>'}
          </div>
        </header>
        <main class="content">${contentHtml}</main>
      </div>
    </div>`;
  }

  function bindShell(user) {
    document.getElementById('yearSel')?.addEventListener('change', e => { setYear(e.target.value); App.render(); });
    document.getElementById('logoutBtn')?.addEventListener('click', () => { Store.logout(); location.hash = '#/login'; });
    const btn = document.getElementById('notiBtn'), panel = document.getElementById('notiPanel');
    btn?.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { Store.markNotificationsRead(user); btn.querySelector('.noti-dot')?.remove(); }
    });
    document.addEventListener('click', e => {
      if (panel && !panel.hidden && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) panel.hidden = true;
    });
  }

  /* ---------- components ---------- */
  function kpi(label, value, sub = '', extraCls = '') {
    return `<div class="kpi ${extraCls}"><div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
  }
  function card(title, bodyHtml, opts = {}) {
    return `<section class="card ${opts.cls || ''}">${title ? `<div class="card-head"><h3>${title}</h3>${opts.action || ''}</div>` : ''}
      <div class="card-body">${bodyHtml}</div></section>`;
  }
  function pageHead(title, sub, actions = '') {
    return `<div class="page-head"><div><h1>${title}</h1><div class="page-sub">${sub}</div></div><div class="page-actions">${actions}</div></div>`;
  }
  function asOf() {
    return `<span class="asof">ข้อมูล ณ ${fmtDT(new Date().toISOString())} · หน่วย: กีบ (LAK)</span>`;
  }

  function toast(msg, type = 'ok') {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.className = 'toast ' + type;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function modal(title, bodyHtml, buttons) {
    // buttons: [{label, cls, onClick(close)}]
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal"><div class="modal-head"><h3>${title}</h3><button class="modal-x">✕</button></div>
      <div class="modal-body">${bodyHtml}</div><div class="modal-foot"></div></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector('.modal-x').addEventListener('click', close);
    back.addEventListener('click', e => { if (e.target === back) close(); });
    const foot = back.querySelector('.modal-foot');
    (buttons || [{ label: 'ปิด', cls: 'ghost-btn' }]).forEach(b => {
      const btn = document.createElement('button');
      btn.className = b.cls || 'primary-btn';
      btn.textContent = b.label;
      btn.addEventListener('click', () => b.onClick ? b.onClick(close) : close());
      foot.appendChild(btn);
    });
    return back;
  }
  function confirm2(title, msg, warn, onYes) {
    modal(title, `<p>${msg}</p><p class="warn-text">⚠ ${warn}</p>`, [
      { label: 'ยกเลิก', cls: 'ghost-btn' },
      { label: 'ยืนยัน', cls: 'danger-btn', onClick: close => { close(); onYes(); } },
    ]);
  }

  return { APP_LOGO, fmt, fmtShort, fmtPct, fmtDT, deltaBadge, esc, statusBadge, STATUS_TH, deptIcon,
           shell, bindShell, year, setYear, kpi, card, pageHead, asOf, toast, modal, confirm2 };
})();

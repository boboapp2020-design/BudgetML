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
    ENDORSED:     { label: 'Endorsed',      th: 'ผจก.รับรองแล้ว',    cls: 'st-endorsed' },
    NEED_REVISION:{ label: 'Need Revision', th: 'ต้องแก้ไข',         cls: 'st-revision' },
    LOCKED:       { label: 'Locked',        th: 'ปิดรอบแล้ว',        cls: 'st-locked' },
  };
  const statusBadge = st => {
    const s = STATUS_TH[st] || STATUS_TH.DRAFT;
    return `<span class="status-badge ${s.cls}">${s.label} · ${s.th}</span>`;
  };
  // ธงชาติประจำสกุลเงิน (ไฟล์ในโฟลเดอร์ Flags)
  const FLAG_IMG = { THB: 'Thai.png', USD: 'USA.png', CNY: 'China.png', EUR: 'EROU.png' };
  const currencyFlag = cur => FLAG_IMG[cur]
    ? `<img class="flag-img" src="Flags/${FLAG_IMG[cur]}" alt="${cur}">`
    : '<span class="flag">💱</span>';
  // ชื่อชนิดน้ำมัน — แสดงไทย / ลาว (คง key เดิมไว้ใช้แก้ไข/lookup)
  const fuelLabel = ft => {
    const k = String(ft || '').trim().toLowerCase();
    if (k === 'diesel' || k === 'ดีเซล') return 'ดีเซล / ກາຊວນ';
    if (k === 'benzin' || k === 'benzine' || k === 'gasoline' || k === 'เบนซิน') return 'เบนซิน / ແອັດຊັງ';
    return ft;
  };

  /* ---------- layout shell ---------- */
  const NAV_USER = [
    { hash: '#/budget',    icon: '📝', label: 'กรอกงบประมาณ',    sub: 'Budget Input' },
    { hash: '#/review',    icon: '✅', label: 'ตรวจสอบงบประมาณ', sub: 'Review & Submit' },
    { hash: '#/unitcost',  icon: '🏭', label: 'ต้นทุนต่อหน่วย',  sub: 'กีบ/ตันอ้อย · น้ำตาล' },
    { hash: '#/requests',  icon: '📝', label: 'คำร้องปรับงบ',    sub: 'ขอเพิ่ม/ลด/โยก' },
    { hash: '#/dashboard', icon: '📊', label: 'Dashboard',        sub: 'ภาพรวมหน่วยงาน' },
  ];
  const NAV_MGR = [
    { hash: '#/mgr/dashboard', icon: '📊', label: 'ภาพรวมฝ่าย', sub: 'Division Overview' },
    { hash: '#/unitcost',      icon: '🏭', label: 'ต้นทุนต่อหน่วย', sub: 'กีบ/ตันอ้อย · น้ำตาล' },
    { hash: '#/requests',      icon: '📝', label: 'อนุมัติคำร้องปรับงบ', sub: 'Approve requests' },
  ];
  const NAV_ACC = [
    { hash: '#/acc/dashboard',   icon: '📊', label: 'Executive Dashboard', sub: 'ภาพรวมทั้งบริษัท' },
    { hash: '#/acc/departments', icon: '🏢', label: 'หน่วยงาน & Drill-down', sub: 'Departments' },
    { hash: '#/acc/analysis',    icon: '📈', label: 'วิเคราะห์งบประมาณ',  sub: 'Analysis' },
    { hash: '#/acc/pnl',         icon: '📑', label: 'งบการเงินตามงบ',     sub: 'Budget P&L' },
    { hash: '#/unitcost',        icon: '🏭', label: 'ต้นทุนต่อหน่วย',     sub: 'กีบ/ตันอ้อย · น้ำตาล' },
    { hash: '#/acc/variance',    icon: '🎯', label: 'ควบคุมงบ (เกิดจริง)', sub: 'Budget vs Actual' },
    { hash: '#/requests',        icon: '📝', label: 'คำร้องปรับงบ',       sub: 'ดำเนินการ/คุมหน้าต่าง' },
    { hash: '#/acc/control',     icon: '⚙️', label: 'Budget Control',      sub: 'จัดการระบบ' },
    { hash: '#/acc/audit',       icon: '📜', label: 'Audit Log',           sub: 'ประวัติการแก้ไข' },
  ];

  /* โลโก้แอป — ถุงเงิน ₭ + เหรียญซ้อน + แท่งกราฟ + ลูกศรขึ้น ในวงกลมน้ำเงิน (inline SVG) */
  const APP_LOGO = '<img src="logo-app.png?v=13.9" alt="iBud — Intelligent Budget System" class="app-logo-img">';

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
          <div class="sf-role">${user.role === 'ACCOUNTING' ? 'Accounting / Admin' : user.role === 'MANAGER' ? 'หน่วยกำกับดูแล · ' + esc(user.name || '') : esc(Store.dept(user.departmentId)?.name || '')} · เวอร์ชัน 1.0.0</div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="topbar-left">
            <select id="yearSel" class="year-select" title="เลือกปีงบประมาณ">${yearOpts}</select>
            ${typeof Sync !== 'undefined' ? Sync.chipHtml() : ''}
          </div>
          <div class="topbar-right">
            <button id="notiBtn" class="icon-btn" title="การแจ้งเตือน">🔔${unread ? `<span class="noti-dot">${unread}</span>` : ''}</button>
            <div class="user-chip"><span class="uc-avatar" title="${user.role === 'ACCOUNTING' ? 'ผู้ดูแลระบบ' : user.role === 'MANAGER' ? esc(user.name || '') : esc(Store.dept(user.departmentId)?.name || '')}">${user.role === 'ACCOUNTING' ? '🧮' : user.role === 'MANAGER' ? '👔' : deptIcon(Store.dept(user.departmentId))}</span>
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
    document.getElementById('logoutBtn')?.addEventListener('click', () => { Store.logout(); if (typeof Supa !== 'undefined') Supa.signOut(); location.hash = '#/login'; });
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
    back.innerHTML = `<div class="modal"><div class="modal-head"><h3>${title}</h3><button class="modal-x" title="ปิด (ESC)">✕</button></div>
      <div class="modal-body">${bodyHtml}</div><div class="modal-foot"></div></div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey);   // กด ESC เพื่อปิด
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

  /* ---------- ตารางเรียงลำดับได้ (คลิกหัวคอลัมน์) ---------- */
  function enableSort(table) {
    if (!table) return;
    const ths = Array.from(table.querySelectorAll('thead th'));
    let curCol = -1, dir = 1;
    const doSort = idx => {
      dir = (curCol === idx) ? -dir : (idx === 0 ? 1 : -1); // คอลัมน์ตัวเลขเริ่มจากมาก→น้อย, ชื่อจากน้อย→มาก
      curCol = idx;
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const av = a.children[idx]?.dataset.v ?? a.children[idx]?.textContent.trim() ?? '';
        const bv = b.children[idx]?.dataset.v ?? b.children[idx]?.textContent.trim() ?? '';
        const an = parseFloat(av), bn = parseFloat(bv);
        const c = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv), 'th');
        return c * dir;
      });
      rows.forEach(r => tbody.appendChild(r));
      ths.forEach((th, i) => { th.classList.remove('sort-asc', 'sort-desc'); if (i === idx) th.classList.add(dir > 0 ? 'sort-asc' : 'sort-desc'); });
    };
    ths.forEach((th, idx) => { if (th.classList.contains('sortable')) th.addEventListener('click', () => doSort(idx)); });
  }

  return { APP_LOGO, fmt, fmtShort, fmtPct, fmtDT, deltaBadge, esc, statusBadge, fuelLabel, currencyFlag, STATUS_TH, deptIcon, enableSort,
           shell, bindShell, year, setYear, kpi, card, pageHead, asOf, toast, modal, confirm2 };
})();

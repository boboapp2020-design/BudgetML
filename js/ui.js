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
  // สถานะแบบไอคอนแม่กุญแจล้วน (ประหยัดพื้นที่คอลัมน์) — LOCKED = กุญแจปิด · อื่นๆ = กุญแจคลายล็อก · hover เห็นข้อความเต็ม
  const LOCK_CLOSED = '<path d="M12 15.5a1.6 1.6 0 0 0 1.6-1.6 1.6 1.6 0 0 0-3.2 0 1.6 1.6 0 0 0 1.6 1.6zM17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zm-7 0V7a2 2 0 0 1 4 0v2h-4z"/>';
  const LOCK_OPEN   = '<path d="M12 15.5a1.6 1.6 0 0 0 1.6-1.6 1.6 1.6 0 0 0-3.2 0 1.6 1.6 0 0 0 1.6 1.6zM17 9H10V7a2 2 0 0 1 3.9-.5l1.9-.5A4 4 0 0 0 8 7v2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z"/>';
  const STATUS_COLOR = { DRAFT:'#94a3b8', IN_PROGRESS:'#2563eb', COMPLETED:'#0d9488', SUBMITTED:'#2563eb', ENDORSED:'#7c3aed', NEED_REVISION:'#d97706', LOCKED:'#64748b' };
  const statusLock = st => {
    const s = STATUS_TH[st] || STATUS_TH.DRAFT;
    const closed = st === 'LOCKED';
    const color = STATUS_COLOR[st] || '#64748b';
    return `<span class="lock-ic ${closed ? 'is-locked' : 'is-open'}" title="${s.label} · ${s.th}"><svg viewBox="0 0 24 24" width="20" height="20" fill="${color}" aria-hidden="true">${closed ? LOCK_CLOSED : LOCK_OPEN}</svg></span>`;
  };
  // ไอคอนบทบาท (SVG badge สีพื้น) — แยก "กรอก" (ดินสอ) กับ "อนุมัติ/ดู" (เครื่องหมายถูก) ให้ชัด
  //  type: 'fill' ผู้กรอก · 'div' ผู้อนุมัติ(ฝ่าย) · 'area' ผู้ดู(สังกัด) · 'co' ผู้ดูภาพรวมบริษัท
  const ROLE_SVG = {
    fill: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>',
    check: '<path fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7"/>',
    co: '<path d="M12 3l9 4.5v1.5H3V7.5L12 3zM5 11h2v7H5zm4 0h2v7H9zm4 0h2v7h-2zm4 0h2v7h-2zM3 19.5h18V21H3z"/>',
  };
  function roleBadge(type) {
    const glyph = type === 'fill' ? ROLE_SVG.fill : type === 'co' ? ROLE_SVG.co : ROLE_SVG.check;
    return `<span class="ricon ri-${type}"><svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">${glyph}</svg></span>`;
  }
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
    { hash: '#/acc/analytics',   icon: '📈', label: 'วิเคราะห์งบ',        sub: 'วิเคราะห์ · งบการเงิน · ควบคุมงบ' },
    { hash: '#/unitcost',        icon: '🏭', label: 'ต้นทุนต่อหน่วย',     sub: 'กีบ/ตันอ้อย · น้ำตาล' },
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

  // หน้าที่เข้าจากเมนูอื่น (ไม่มีใน sidebar) → ให้ไฮไลต์เมนูที่เกี่ยวข้อง
  const NAV_ALIAS = { '#/acc/users': '#/acc/control', '#/acc/system': '#/acc/control', '#/acc/actuals': '#/acc/control',
    '#/acc/analysis': '#/acc/analytics', '#/acc/pnl': '#/acc/analytics', '#/acc/variance': '#/acc/analytics' };
  function shell(user, contentHtml, activeHash) {
    const effHash = NAV_ALIAS[activeHash.split('?')[0]] || activeHash;
    const nav = (user.role === 'ACCOUNTING' ? NAV_ACC : user.role === 'MANAGER' ? NAV_MGR : NAV_USER)
      .map(n => `<a href="${n.hash}" class="nav-item ${effHash.startsWith(n.hash) ? 'active' : ''}">
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
          <div class="topbar-legend" title="ความหมายของสีไอคอนบทบาท">
            <span><i class="rl-dot ri-fill"></i>ผู้กรอกงบประมาณ</span>
            <span><i class="rl-dot ri-div"></i>ผู้ตรวจสอบงบประมาณ</span>
            <span><i class="rl-dot ri-area"></i>ผู้ดูงบประมาณ</span>
          </div>
          <div class="topbar-right">
            <button id="notiBtn" class="icon-btn" title="การแจ้งเตือน">🔔${unread ? `<span class="noti-dot">${unread}</span>` : ''}</button>
            ${(() => { // เมนูโปรไฟล์ — คลิก user chip: ข้อมูล + สลับบทบาท (ในเมนูเลย) + เปลี่ยนรหัส + ออก
              const email = sessionStorage.getItem('abp_email') || '';
              const curId = sessionStorage.getItem('abp_roleid') || '';
              const asg = email && typeof EmailAuth !== 'undefined' ? EmailAuth.assignmentsFor(email) : [];
              const roleLabel = user.role === 'ACCOUNTING' ? '👑 ผู้ดูแลระบบ (Admin)'
                : user.role === 'MANAGER' ? '✅ ผู้อนุมัติ / ผู้ดู — ' + esc(user.name || '')
                : '📝 ผู้กรอกงบ — ' + esc(Store.dept(user.departmentId)?.name || '');
              const avatar = user.role === 'ACCOUNTING' ? '🧮' : user.role === 'MANAGER' ? '👔' : deptIcon(Store.dept(user.departmentId));
              // รายการสลับบทบาท (เฉพาะคนหลายบทบาท)
              let switcher = '';
              if (asg.length > 1) {
                const TIP = { fill: '📝 ผู้กรอกงบ — กรอกงบประมาณของแผนกนี้', div: '✅ ผู้ตรวจสอบงบ (หัวหน้าฝ่าย) — ทวนสอบ/อนุมัติงบของแผนกใต้ฝ่าย', area: '🏭 ผู้ดูระดับสังกัด — ดูภาพรวมงบทั้งสังกัด', co: '🏛 ผู้ดูภาพรวมบริษัท (กจก.) — ดูงบทั้งบริษัท' };
                const item = a => { const isCur = String(a.id) === curId;
                  const t = a.role === 'filler' ? 'fill' : (a.id === 'MGR:co' ? 'co' : /area/.test(a.id) ? 'area' : 'div');
                  return `<button class="um-swrole ${isCur ? 'cur' : ''}" data-switch="${esc(String(a.id))}" data-roletip="${esc(TIP[t])}" ${isCur ? 'disabled' : ''}>
                    ${roleBadge(t)}<span class="umr-nm">${esc(a.name)}${a.role === 'filler' ? ` <em>${a.id}</em>` : ''}</span>${isCur ? '<span class="umr-cur">● อยู่นี่</span>' : ''}</button>`; };
                switcher = `<div class="um-switch"><div class="um-switch-h">🔄 สลับบทบาท (${asg.length})</div><div class="um-switch-list">${asg.map(item).join('')}</div></div>`;
              }
              return `
            <button class="user-chip uc-clickable" id="userMenuBtn" title="ตั้งค่าบัญชีของฉัน"><span class="uc-avatar">${avatar}</span>
              <span class="uc-name">${esc(user.name)}</span><span class="uc-caret">▾</span></button>
            <div id="userMenu" class="user-menu" hidden>
              <div class="um-head">
                <div class="um-avatar">${avatar}</div>
                <div class="um-info"><b>${esc(user.name)}</b>
                  ${email ? `<div class="um-email">${esc(email)}</div>` : ''}
                  <div class="um-role">${roleLabel}</div></div>
              </div>
              ${switcher}
              ${user.role === 'ACCOUNTING' ? '<a class="um-item" href="#/acc/users">👥 จัดการผู้ใช้ <small>เพิ่ม / ลบ / เปลี่ยนบทบาท · รีเซ็ตรหัส</small></a>' : ''}
              <button class="um-item" id="changePwBtn" data-pwkey="${user.role === 'ACCOUNTING' ? '__admin__' : esc(email)}">🔑 เปลี่ยนรหัสผ่าน <small>${user.role === 'ACCOUNTING' ? 'รหัสผู้ดูแลระบบ' : 'รหัสเดียวใช้ทุกบทบาทของคุณ'}</small></button>
              <button class="um-item um-danger" id="logoutBtn">🚪 ออกจากระบบ</button>
            </div>`;
            })()}
          </div>
          <div id="notiPanel" class="noti-panel" hidden>
            <div class="noti-head">🔔 กระดานข่าว / การแจ้งเตือน${unread ? ` · <span class="noti-unread-n">${unread} ใหม่</span>` : ''}</div>
            ${user.role === 'ACCOUNTING' ? `<div class="noti-compose">
              <textarea id="annInput" rows="2" placeholder="พิมพ์ประกาศถึงทุกคน (ทุกแผนก/ทุกบทบาท)…"></textarea>
              <button id="annPostBtn" class="primary-btn small">📢 ประกาศถึงทุกคน</button>
            </div>` : ''}
            <div class="noti-list">
            ${notis.length ? notis.slice(0, 40).map(n => {
              const ann = Store.isAnnouncement(n);
              return `<div class="noti-item ${n.read ? '' : 'unread'} ${ann ? 'is-ann' : ''}">
                <span class="noti-ic">${ann ? '📢' : '🔔'}</span>
                <div class="noti-body"><div class="noti-msg">${ann ? '<b class="noti-tag">ประกาศจากผู้ดูแลระบบ</b> ' : ''}${esc(n.message)}</div>
                <div class="noti-ts">${fmtDT(n.ts)}</div></div></div>`;
            }).join('') : '<div class="noti-item noti-empty">ยังไม่มีการแจ้งเตือน</div>'}
            </div>
          </div>
        </header>
        <main class="content">${contentHtml}</main>
      </div>
    </div>`;
  }

  function bindShell(user) {
    // ล้าง tooltip บทบาทที่อาจค้างจากรอบก่อน (กันลอยทับเนื้อหา)
    const hideRoleTip = () => document.getElementById('roleTip')?.classList.remove('show');
    hideRoleTip();
    document.getElementById('yearSel')?.addEventListener('change', e => { setYear(e.target.value); App.render(); });
    document.getElementById('logoutBtn')?.addEventListener('click', () => { sessionStorage.removeItem('abp_email'); sessionStorage.removeItem('abp_roleid'); Store.logout(); if (typeof Supa !== 'undefined') Supa.signOut(); location.hash = '#/login'; });
    // เมนูโปรไฟล์ (คลิกที่ user chip)
    const umBtn = document.getElementById('userMenuBtn'), umenu = document.getElementById('userMenu');
    const closeMenu = () => { if (umenu) umenu.hidden = true; hideRoleTip(); };
    umBtn?.addEventListener('click', () => { umenu.hidden = !umenu.hidden; if (umenu.hidden) hideRoleTip(); });
    document.addEventListener('click', e => {
      if (umenu && !umenu.hidden && !umenu.contains(e.target) && !umBtn.contains(e.target)) closeMenu();
    });
    // เมาส์ออกจากเมนู หรือเลื่อนจอ → ซ่อน tooltip ทันที (ไม่ให้ค้างลอย)
    umenu?.addEventListener('mouseleave', hideRoleTip);
    if (!window.__roleTipScrollBound) { window.__roleTipScrollBound = true; window.addEventListener('scroll', () => document.getElementById('roleTip')?.classList.remove('show'), true); }
    // สลับบทบาททันทีจากในเมนู (ไม่ต้องออกจากระบบ)
    document.querySelectorAll('[data-switch]').forEach(b => b.addEventListener('click', () => { hideRoleTip(); App.switchRole(b.dataset.switch); }));
    // hover ที่รายการบทบาท → tooltip บอกว่าบทบาทนี้คืออะไร (วางชิดซ้ายของเมนู · fixed ไม่โดน scroll ตัด)
    document.querySelectorAll('[data-roletip]').forEach(b => {
      b.addEventListener('mouseenter', () => {
        if (!umenu || umenu.hidden) return;                 // แสดงเฉพาะตอนเมนูเปิดจริง
        let tip = document.getElementById('roleTip');
        if (!tip) { tip = document.createElement('div'); tip.id = 'roleTip'; tip.className = 'role-tip'; document.body.appendChild(tip); }
        tip.textContent = b.dataset.roletip;
        const r = b.getBoundingClientRect();
        tip.style.top = (r.top + r.height / 2) + 'px';
        tip.style.left = (r.left - 10) + 'px';
        tip.classList.add('show');
      });
      b.addEventListener('mouseleave', hideRoleTip);
    });
    // เปลี่ยนรหัสผ่าน (ผูกกับ key: อีเมลของผู้ใช้ หรือ __admin__ สำหรับแอดมิน)
    document.getElementById('changePwBtn')?.addEventListener('click', e => {
      const email = e.currentTarget.dataset.pwkey || sessionStorage.getItem('abp_email');
      if (!email) return;
      const who = email === '__admin__' ? 'ผู้ดูแลระบบ (admin)' : email;
      modal(`เปลี่ยนรหัสผ่าน — ${esc(who)}`, `
        <label class="fld"><span>รหัสผ่านปัจจุบัน</span><input id="pwOld" type="password" autocomplete="current-password"></label>
        <label class="fld"><span>รหัสผ่านใหม่ <small class="muted">(อย่างน้อย 4 ตัวอักษร)</small></span><input id="pwNew" type="password" autocomplete="new-password"></label>
        <label class="fld"><span>ยืนยันรหัสผ่านใหม่</span><input id="pwNew2" type="password" autocomplete="new-password"></label>`, [
        { label: 'ยกเลิก', cls: 'ghost-btn' },
        { label: '🔑 บันทึกรหัสผ่านใหม่', cls: 'primary-btn', onClick: close => {
            const o = document.getElementById('pwOld').value, n = document.getElementById('pwNew').value, n2 = document.getElementById('pwNew2').value;
            if (n !== n2) { toast('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน', 'err'); return; }
            try { Store.setUserPassword(email, o, n); toast('เปลี่ยนรหัสผ่านเรียบร้อย — ใช้รหัสใหม่ในการเข้าครั้งถัดไป'); close(); }
            catch (e) { toast(e.message, 'err'); }
          } },
      ]);
    });
    const btn = document.getElementById('notiBtn'), panel = document.getElementById('notiPanel');
    btn?.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { Store.markNotificationsRead(user); btn.querySelector('.noti-dot')?.remove(); }
    });
    // แอดมินโพสต์ประกาศถึงทุกคน (targetRole='*') — เพิ่มลงกระดานสดโดยไม่ต้อง reload
    document.getElementById('annPostBtn')?.addEventListener('click', () => {
      const ta = document.getElementById('annInput'); const msg = ta.value.trim();
      if (!msg) { toast('พิมพ์ข้อความประกาศก่อน', 'err'); ta.focus(); return; }
      try {
        Store.postAnnouncement(user, msg);
        ta.value = ''; toast('ประกาศถึงทุกคนแล้ว 📢');
        const list = document.querySelector('#notiPanel .noti-list');
        if (list) {
          list.querySelector('.noti-empty')?.remove();
          const div = document.createElement('div');
          div.className = 'noti-item unread is-ann';
          div.innerHTML = `<span class="noti-ic">📢</span><div class="noti-body"><div class="noti-msg"><b class="noti-tag">ประกาศจากผู้ดูแลระบบ</b> ${esc(msg)}</div><div class="noti-ts">${fmtDT(new Date().toISOString())}</div></div>`;
          list.insertBefore(div, list.firstChild);
        }
      } catch (e) { toast(e.message, 'err'); }
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
  // ตัดอิโมจิหน้า/ท้ายหัวข้อออก (ดูเป็นทางการขึ้น) — เก็บ HTML/ข้อความอื่นไว้
  const stripEmoji = s => typeof s === 'string'
    ? s.replace(/^(?:[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍]|\s)+/u, '')
        .replace(/(?:[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍]|\s)+$/u, '').trim()
    : s;
  function card(title, bodyHtml, opts = {}) {
    const t = stripEmoji(title);
    return `<section class="card ${opts.cls || ''}">${t ? `<div class="card-head"><h3>${t}</h3>${opts.action || ''}</div>` : ''}
      <div class="card-body">${bodyHtml}</div></section>`;
  }
  function pageHead(title, sub, actions = '') {
    return `<div class="page-head"><div><h1>${stripEmoji(title)}</h1><div class="page-sub">${sub}</div></div><div class="page-actions">${actions}</div></div>`;
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

  return { APP_LOGO, fmt, fmtShort, fmtPct, fmtDT, deltaBadge, esc, statusBadge, statusLock, fuelLabel, currencyFlag, roleBadge, STATUS_TH, deptIcon, enableSort,
           shell, bindShell, year, setYear, kpi, card, pageHead, asOf, toast, modal, confirm2 };
})();

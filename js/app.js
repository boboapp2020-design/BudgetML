/* =============================================================
 * app.js — Router + Boot + Login
 * ============================================================= */

const App = (() => {
  const root = () => document.getElementById('root');

  const ROUTES = {
    '#/dashboard':       { role: 'USER',       page: () => PagesUser.dashboard,   bind: () => PagesUser.dashboardBind },
    '#/budget':          { role: 'USER',       page: () => PagesUser.budget,      bind: () => PagesUser.budgetBind },
    '#/review':          { role: 'USER',       page: () => PagesUser.review,      bind: () => PagesUser.reviewBind },
    '#/calculators':     { role: 'USER',       page: () => PagesUser.calculators, bind: () => PagesUser.calculatorsBind },
    '#/acc/dashboard':   { role: 'ACCOUNTING', page: () => PagesAcc.dashboard,    bind: () => PagesAcc.dashboardBind },
    '#/acc/departments': { role: 'ACCOUNTING', page: () => PagesAcc.departments,  bind: () => PagesAcc.departmentsBind },
    '#/acc/analysis':    { role: 'ACCOUNTING', page: () => PagesAcc.analysis,     bind: () => PagesAcc.analysisBind },
    '#/acc/control':     { role: 'ACCOUNTING', page: () => PagesAcc.control,      bind: () => PagesAcc.controlBind },
    '#/acc/audit':       { role: 'ACCOUNTING', page: () => PagesAcc.audit,        bind: null },
  };

  function loginPage() {
    const deptOpts = Store.db.departments.filter(d => d.active)
      .map(d => `<option value="${d.code}">${UI.esc(d.name)} (${d.code})</option>`).join('');

    root().innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand"><div class="login-applogo">${UI.APP_LOGO}</div>
          <h1>งบประมาณประจำปี</h1>
          <div class="login-sub">Annual Budget</div>
          <div class="login-company">${UI.esc(Store.db.meta.company)} · ปีงบประมาณ ${Store.db.meta.yearCurrent}</div></div>

        <!-- เข้าใช้งานรายหน่วยงาน -->
        <div id="deptLoginView">
          <label class="fld"><span>เลือกหน่วยงานของคุณ</span>
            <select id="deptSel">
              <option value="">— เลือกหน่วยงาน —</option>
              ${deptOpts}
            </select></label>
          <label class="fld"><span>PIN <small class="muted">(ยังไม่บังคับใช้ในเวอร์ชันทดลอง)</small></span>
            <input id="deptPin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" autocomplete="off"></label>
          <button class="primary-btn big" id="deptLoginBtn" style="width:100%">เข้าสู่ระบบ</button>
        </div>

        <!-- เข้าใช้งานผู้ดูแลระบบ (ซ่อนไว้จนกด) -->
        <div id="adminLoginView" hidden>
          <div class="admin-head"><span class="uc-avatar acc">A</span>
            <span><b>ผู้ดูแลระบบ — แผนกบัญชี</b><br><small class="muted">Accounting / Admin · ดูทุกหน่วยงาน วิเคราะห์ ควบคุมรอบงบ</small></span></div>
          <label class="fld"><span>PIN ผู้ดูแลระบบ <small class="muted">(ยังไม่บังคับใช้ในเวอร์ชันทดลอง)</small></span>
            <input id="adminPin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" autocomplete="off"></label>
          <button class="primary-btn big" id="adminLoginBtn" style="width:100%">เข้าสู่ระบบผู้ดูแล</button>
          <button class="admin-link" id="adminBack">← กลับไปเลือกหน่วยงาน</button>
        </div>

        <button class="admin-link" id="adminToggle">🔐 สำหรับผู้ดูแลระบบ (แผนกบัญชี)</button>
        <div class="login-powered"><img src="Logo%20iDash.png" alt="Powered by iDash"></div>
      </div>
    </div>`;

    const deptView = document.getElementById('deptLoginView');
    const adminView = document.getElementById('adminLoginView');
    const adminToggle = document.getElementById('adminToggle');

    const enter = user => { location.hash = user.role === 'ACCOUNTING' ? '#/acc/dashboard' : '#/budget'; };
    const deptLogin = () => {
      const code = document.getElementById('deptSel').value;
      if (!code) { UI.toast('กรุณาเลือกหน่วยงานก่อน', 'err'); return; }
      // หมายเหตุ: ระบบ PIN ยังไม่บังคับใช้ — ช่องนี้เตรียมไว้สำหรับเวอร์ชันถัดไป
      const user = Store.login(code, '1234');
      if (!user) { UI.toast('ไม่พบบัญชีผู้ใช้ของหน่วยงานนี้', 'err'); return; }
      enter(user);
    };
    document.getElementById('deptLoginBtn').addEventListener('click', deptLogin);
    document.getElementById('deptPin').addEventListener('keydown', e => { if (e.key === 'Enter') deptLogin(); });
    document.getElementById('deptSel').addEventListener('keydown', e => { if (e.key === 'Enter') deptLogin(); });

    const adminLogin = () => enter(Store.login('accounting', '1234'));
    document.getElementById('adminLoginBtn').addEventListener('click', adminLogin);
    document.getElementById('adminPin').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
    adminToggle.addEventListener('click', () => {
      deptView.hidden = true; adminView.hidden = false; adminToggle.hidden = true;
      document.getElementById('adminPin').focus();
    });
    document.getElementById('adminBack').addEventListener('click', () => {
      deptView.hidden = false; adminView.hidden = true; adminToggle.hidden = false;
    });
  }

  function render() {
    const hash = location.hash || '#/login';
    const base = hash.split('?')[0];
    const user = Store.currentUser();

    if (base === '#/login' || !user) { loginPage(); return; }

    const route = ROUTES[base];
    if (!route) { location.hash = user.role === 'ACCOUNTING' ? '#/acc/dashboard' : '#/dashboard'; return; }
    if (route.role !== user.role) {
      location.hash = user.role === 'ACCOUNTING' ? '#/acc/dashboard' : '#/budget';
      return;
    }
    const html = route.page()(user);
    root().innerHTML = UI.shell(user, html, base);
    UI.bindShell(user);
    route.bind?.()?.(user);
  }

  /* ---------- ตัวดักข้อผิดพลาด: แสดงบนจอแทนหน้าขาว + ปุ่มกู้คืน ---------- */
  function showFatal(msg) {
    const el = document.getElementById('root') || document.body;
    el.innerHTML = `
      <div style="max-width:560px;margin:60px auto;padding:28px;font-family:'Segoe UI','Leelawadee UI',sans-serif;
                  background:#fff;border:1px solid #e0b4b4;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.12)">
        <h2 style="color:#b02f2f;margin-bottom:10px">⚠ ระบบเปิดไม่สำเร็จ</h2>
        <p style="color:#52514e;margin-bottom:8px">ข้อความข้อผิดพลาด (ส่งภาพนี้ให้ผู้พัฒนาได้เลย):</p>
        <pre style="background:#f6f6f4;border-radius:8px;padding:12px;font-size:12px;white-space:pre-wrap;word-break:break-word;margin-bottom:16px">${String(msg).slice(0, 600)}</pre>
        <button onclick="try{localStorage.clear();sessionStorage.clear();}catch(e){};location.href=location.pathname+'?r='+Date.now()"
          style="font:inherit;background:#256abf;color:#fff;border:none;border-radius:8px;padding:11px 18px;cursor:pointer;font-weight:600">
          🔄 ล้างข้อมูลในเครื่องแล้วเปิดใหม่</button>
        <p style="color:#898781;font-size:12px;margin-top:12px">ปุ่มนี้ล้างเฉพาะข้อมูลชั่วคราวในเบราว์เซอร์เครื่องนี้ — ข้อมูลจริงบน Google Sheet ไม่หาย</p>
      </div>`;
  }
  window.addEventListener('error', e => {
    if (!document.querySelector('.app') && !document.querySelector('.login-wrap')) showFatal(e.message + '\n' + (e.filename || '') + ':' + (e.lineno || ''));
  });

  function safeRender() {
    try { render(); }
    catch (e) { showFatal(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); }
  }

  window.addEventListener('hashchange', safeRender);
  window.addEventListener('DOMContentLoaded', () => {
    if (!location.hash) location.hash = '#/login';
    safeRender();
    // ซิงค์กับ Google Sheet (ถ้าตั้งค่าไว้) — ถ้าได้ข้อมูลใหม่มา ให้วาดหน้าจอใหม่
    Sync.init().then(adopted => { if (adopted) safeRender(); }).catch(() => {});
  });

  return { render };
})();

window.App = App;

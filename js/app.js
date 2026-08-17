/* =============================================================
 * app.js — Router + Boot + Login
 * ============================================================= */

const App = (() => {
  const root = () => document.getElementById('root');
  const homeFor = u => u.role === 'ACCOUNTING' ? '#/acc/dashboard' : u.role === 'MANAGER' ? '#/mgr/dashboard' : '#/budget';

  // ---- Supabase Auth (login จริง) ----
  const EMAIL_DOMAIN = 'mitrphol.com';
  const authOn = () => (typeof Supa !== 'undefined' && Supa.enabled() && Supa.authRequired());
  // แปลง username → อีเมล (ต้องตรงกับที่สร้างใน create-users.ps1)
  function emailFor(username) {
    const d = '@' + EMAIL_DOMAIN;
    if (username === 'accounting') return 'accounting' + d;
    if (username.indexOf('MGR:') === 0) return 'mgr-' + username.slice(4).toLowerCase() + d;
    return username + d;
  }

  const ROUTES = {
    '#/dashboard':       { role: 'USER',       page: () => PagesUser.dashboard,   bind: () => PagesUser.dashboardBind },
    '#/budget':          { role: 'USER',       page: () => PagesUser.budget,      bind: () => PagesUser.budgetBind },
    '#/review':          { role: 'USER',       page: () => PagesUser.review,      bind: () => PagesUser.reviewBind },
    '#/calculators':     { role: 'USER',       page: () => PagesUser.calculators, bind: () => PagesUser.calculatorsBind },
    '#/mgr/dashboard':   { role: 'MANAGER',    page: () => PagesMgr.dashboard,    bind: () => PagesMgr.dashboardBind },
    '#/mgr/dept':        { role: 'MANAGER',    page: () => PagesMgr.deptDetail,   bind: () => PagesMgr.deptDetailBind },
    '#/acc/dashboard':   { role: 'ACCOUNTING', page: () => PagesAcc.dashboard,    bind: () => PagesAcc.dashboardBind },
    '#/acc/departments': { role: 'ACCOUNTING', page: () => PagesAcc.departments,  bind: () => PagesAcc.departmentsBind },
    '#/acc/analysis':    { role: 'ACCOUNTING', page: () => PagesAcc.analysis,     bind: () => PagesAcc.analysisBind },
    '#/acc/pnl':         { role: 'ACCOUNTING', page: () => PagesAcc.pnl,          bind: () => PagesAcc.pnlBind },
    '#/acc/variance':    { role: 'ACCOUNTING', page: () => PagesAcc.variance,     bind: () => PagesAcc.varianceBind },
    '#/acc/control':     { role: 'ACCOUNTING', page: () => PagesAcc.control,      bind: () => PagesAcc.controlBind },
    '#/acc/audit':       { role: 'ACCOUNTING', page: () => PagesAcc.audit,        bind: null },
    '#/acc/actuals':     { role: 'ACCOUNTING', page: () => PagesAcc.actuals,      bind: () => PagesAcc.actualsBind },
  };

  function loginPage() {
    // จัดกลุ่มหน่วยงานตาม "ด้าน" (1=สนับสนุน 2=อ้อย 3=โรงงาน 4=บริหารสำนักงาน)
    const sides = (Store.db.meta.sides) || {};
    const depts = Store.db.departments.filter(d => d.active);
    const bySide = {};
    depts.forEach(d => { const s = d.side || (d.code || '')[0] || '?'; (bySide[s] = bySide[s] || []).push(d); });
    const deptOpts = Object.keys(bySide).sort().map(s => {
      const opts = bySide[s].sort((a, b) => a.code.localeCompare(b.code))
        .map(d => `<option value="${d.code}">${UI.deptIcon(d)} ${UI.esc(d.name)} (${d.code})</option>`).join('');
      return `<optgroup label="${UI.esc(sides[s] || 'อื่นๆ')}">${opts}</optgroup>`;
    }).join('');
    // ผู้บริหาร/ผู้จัดการ (ดู rollup) — เรียงแบบต้นไม้ เยื้องตามชั้น
    const units = Store.oversight();
    const ordered = [];
    const walk = (u, d) => { ordered.push({ u, d }); units.filter(c => c.parent === u.id).forEach(c => walk(c, d + 1)); };
    units.filter(u => !u.parent).forEach(u => walk(u, 0));
    const mgrOpts = ordered.map(({ u, d }) =>
      `<option value="MGR:${UI.esc(u.id)}">${' '.repeat(d * 2)}${d ? '└ ' : ''}${UI.esc(u.name)}</option>`).join('');

    const rowCount = (Store.db.budgets || []).length;
    const rowsLabel = rowCount >= 1000 ? (Math.round(rowCount / 100) / 10) + 'K+' : String(rowCount);

    root().innerHTML = `
    <div class="login-wrap login-v7">
      <div class="login-orbs"><span></span><span></span><span></span></div>
      <div class="lv-shell">
        <!-- ซ้าย: hero แบรนด์ -->
        <aside class="lv-hero lv-hero-img">
          <img src="hero.jpg?v=7.2" alt="Annual Budget System">
        </aside>

        <!-- ขวา: การ์ด login -->
        <div class="lv-login">
          <div class="lv-badge">${UI.APP_LOGO}</div>
          <h2>เข้าสู่ระบบ</h2>
          <div class="lv-sub">ระบบงบประมาณประจำปี</div>

          <label class="fld"><span>เลือกหน่วยงาน / ฝ่ายของคุณ</span>
            <select id="deptSel">
              <option value="">🏢 — เลือกหน่วยงาน หรือ ฝ่าย —</option>
              <optgroup label="ผู้ดูแล / ผู้บริหาร">
                <option value="accounting">👑 ผู้ดูแลระบบ — แผนกบัญชี</option>
                ${mgrOpts}
              </optgroup>
              ${deptOpts}
            </select></label>

          <label class="fld"><span>รหัสผ่าน${authOn() ? '' : ' <small class="muted">(โหมดทดลอง — ไม่บังคับ)</small>'}</span>
            <div class="lv-pass">
              <span class="lv-lock">🔒</span>
              <input id="deptPin" type="password" placeholder="${authOn() ? 'กรอกรหัสผ่านของคุณ' : 'ไม่ต้องกรอกในโหมดนี้'}" autocomplete="current-password">
              <button type="button" class="lv-eye" id="pwEye" aria-label="แสดง/ซ่อนรหัสผ่าน">👁</button>
            </div></label>

          <div class="lv-row">
            <label class="lv-remember"><input type="checkbox" id="rememberMe"> จดจำฉันในระบบ</label>
            <a class="lv-forgot" id="forgotLink">ลืมรหัสผ่าน?</a>
          </div>

          <button class="primary-btn big lv-submit" id="deptLoginBtn">🔒 เข้าสู่ระบบ</button>

          <div class="lv-or"><span>ระบบวิเคราะห์และแสดงผลโดย</span></div>
          <div class="lv-idash"><img src="Logo%20iDash.png" alt="iDash — Intelligent Dashboard System"></div>
          <div class="lv-secure">🛡️ ระบบปลอดภัยด้วยมาตรฐานระดับองค์กร</div>
        </div>
      </div>
    </div>`;

    const enter = user => { location.hash = homeFor(user); };

    // login ผ่าน Supabase Auth: ยืนยันตัวตนที่ server → ตั้ง session ท้องถิ่น → ดึงข้อมูลตามสิทธิ์
    async function authLogin(username, password, btn) {
      if (!password) { UI.toast('กรุณากรอกรหัสผ่าน', 'err'); return; }
      const old = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ…'; }
      try {
        await Supa.signIn(emailFor(username), password);
        const user = Store.loginByUsername(username);
        if (!user) { Supa.signOut(); throw new Error('ไม่พบบัญชีผู้ใช้ในระบบ (' + username + ')'); }
        await Sync.pull().catch(() => {});
        enter(Store.currentUser() || user);
      } catch (e) {
        const m = /Invalid login/i.test(e.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : e.message;
        UI.toast('เข้าสู่ระบบไม่สำเร็จ: ' + m, 'err');
        if (btn) { btn.disabled = false; btn.innerHTML = old; }
      }
    }

    const doLogin = () => {
      const code = document.getElementById('deptSel').value;
      if (!code) { UI.toast('กรุณาเลือกหน่วยงานก่อน', 'err'); return; }
      const pw = document.getElementById('deptPin').value;
      if (authOn()) return authLogin(code, pw, document.getElementById('deptLoginBtn'));
      const user = Store.login(code, '1234');   // โหมดทดลอง (ปิด login) — เลือกหน่วยงานเข้าได้เลย
      if (!user) { UI.toast('ไม่พบบัญชีผู้ใช้ของหน่วยงานนี้', 'err'); return; }
      enter(user);
    };
    document.getElementById('deptLoginBtn').addEventListener('click', doLogin);
    document.getElementById('deptPin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('deptSel').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    document.getElementById('pwEye').addEventListener('click', () => {
      const inp = document.getElementById('deptPin');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('forgotLink').addEventListener('click', () =>
      UI.toast('ลืมรหัสผ่าน — ติดต่อแผนกบัญชี/ผู้ดูแลระบบเพื่อรีเซ็ตให้', 'info'));
  }

  function render() {
    const hash = location.hash || '#/login';
    const base = hash.split('?')[0];
    const user = Store.currentUser();

    if (base === '#/login' || !user) { loginPage(); return; }

    const route = ROUTES[base];
    if (!route) { location.hash = homeFor(user); return; }
    if (route.role !== user.role) { location.hash = homeFor(user); return; }
    const html = route.page()(user);
    root().innerHTML = UI.shell(user, html, base);
    UI.bindShell(user);
    route.bind?.()?.(user);
  }

  /* ---------- ตัวดักข้อผิดพลาด: แสดงบนจอแทนหน้าขาว + ปุ่มกู้คืน ---------- */
  function showFatal(msg) {
    const el = document.getElementById('root') || document.body;
    el.innerHTML = `
      <div style="max-width:560px;margin:60px auto;padding:28px;font-family:'IBM Plex Sans Thai','Segoe UI','Leelawadee UI',sans-serif;
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
    // เชื่อม Supabase: ต่ออายุ session เดิม + ดึงข้อมูล — ถ้า session หมดต้อง login ใหม่
    Sync.init().then(res => {
      if (res && res.needLogin) { Store.logout(); location.hash = '#/login'; safeRender(); }
      else if (res && res.adopted) safeRender();
    }).catch(() => {});
  });

  return { render };
})();

window.App = App;

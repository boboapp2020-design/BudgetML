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
    '#/acc/system':      { role: 'ACCOUNTING', page: () => PagesAcc.system,       bind: () => PagesAcc.systemBind },
    '#/acc/audit':       { role: 'ACCOUNTING', page: () => PagesAcc.audit,        bind: null },
    '#/acc/actuals':     { role: 'ACCOUNTING', page: () => PagesAcc.actuals,      bind: () => PagesAcc.actualsBind },
    '#/unitcost':        { role: '*',          page: () => PagesCost.unitCost,    bind: () => PagesCost.unitCostBind },
    '#/requests':        { role: '*',          page: () => PagesReq.requests,     bind: () => PagesReq.requestsBind },
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
    // ผู้บริหาร/ผู้จัดการ (ดู rollup) — เรียงแบบต้นไม้ เยื้องตามชั้น + ไอคอนต่อระดับ
    //  ชั้น: 0 บริษัท · 1 สังกัด · 2 ฝ่าย(ผู้อนุมัติ) · 3 ฝ่ายย่อย · 4 แผนก
    const units = Store.oversight();
    const ordered = [];
    const walk = (u, d) => { ordered.push({ u, d }); units.filter(c => c.parent === u.id).sort((a, b) => a.name.localeCompare(b.name, 'th')).forEach(c => walk(c, d + 1)); };
    units.filter(u => !u.parent).forEach(u => walk(u, 0));
    const LV_ICON = ['🏢', '🏭', '⭐', '📁', '📄'];
    const LV_NAME = ['บริษัท', 'สังกัด', 'ฝ่าย', 'ฝ่ายย่อย', 'แผนก'];
    const mgrOpts = ordered.map(({ u, d }) => {
      const icon = LV_ICON[d] || '·';
      const pad = '　'.repeat(d);                       // full-width space — เยื้องจริงใน <option>
      const nDept = Store.subtreeDepartments(u.id).length;  // จำนวนหน่วยงานในสายนี้
      const tag = u.approver ? ' ✓อนุมัติ' : '';
      return `<option value="MGR:${UI.esc(u.id)}">${pad}${icon} ${UI.esc(u.name)}${tag} · ${nDept} หน่วยงาน</option>`;
    }).join('');

    const rowCount = (Store.db.budgets || []).length;
    const rowsLabel = rowCount >= 1000 ? (Math.round(rowCount / 100) / 10) + 'K+' : String(rowCount);

    root().innerHTML = `
    <div class="login-wrap login-v7">
      <div class="login-orbs"><span></span><span></span><span></span></div>
      <div class="lv-shell">
        <!-- ซ้าย: hero แบรนด์ (ภาพ static — แสดงเต็มภาพ ไม่ครอป) -->
        <aside class="lv-hero lv-hero-img">
          <img src="hero.jpg?v=7.4" alt="Annual Budget System">
        </aside>

        <!-- ขวา: การ์ด login -->
        <div class="lv-login">
          <div class="lv-badge">${UI.APP_LOGO}</div>
          <h2>เข้าสู่ระบบ</h2>
          <div class="lv-sub">ระบบงบประมาณประจำปี</div>

          <label class="fld"><span>อีเมลบริษัท <small class="muted">(ผู้ดูแลระบบพิมพ์ admin)</small></span>
            <input id="loginEmail" type="text" placeholder="เช่น yourname@mitrphol.com" autocomplete="username"></label>

          <label class="fld"><span>รหัสผ่าน</span>
            <div class="lv-pass">
              <span class="lv-lock">🔒</span>
              <input id="deptPin" type="password" placeholder="กรอกรหัสผ่านของคุณ" autocomplete="current-password">
              <button type="button" class="lv-eye" id="pwEye" aria-label="แสดง/ซ่อนรหัสผ่าน">👁</button>
            </div></label>

          <button class="primary-btn big lv-submit" id="deptLoginBtn">🔒 เข้าสู่ระบบ</button>

          <a class="lv-forgot lv-alt-toggle" id="unitLoginLink">เข้าแบบเลือกหน่วยงาน (แบบเดิม) ▾</a>
          <div id="unitLoginBox" hidden>
            <label class="fld"><span>เลือกหน่วยงาน / ฝ่ายของคุณ</span>
              <select id="deptSel">
                <option value="">🏢 — เลือกหน่วยงาน หรือ ฝ่าย —</option>
                <optgroup label="ผู้ดูแล / ผู้บริหาร">
                  <option value="accounting">👑 ผู้ดูแลระบบ — แผนกบัญชี</option>
                  ${mgrOpts}
                </optgroup>
                ${deptOpts}
              </select></label>
            <button class="ghost-btn" id="unitLoginBtn" style="width:100%">เข้าด้วยหน่วยงานที่เลือก</button>
          </div>

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

    // เข้าเป็น 1 บทบาท (id = รหัสแผนก หรือ MGR:<node>) — เก็บอีเมลไว้เพื่อปุ่ม "สลับบทบาท"
    const loginAs = (id, email) => {
      const user = Store.login(id, '1234');
      if (!user) { UI.toast('ไม่พบบัญชีผู้ใช้ (' + id + ')', 'err'); return; }
      if (email) sessionStorage.setItem('abp_email', email); else sessionStorage.removeItem('abp_email');
      enter(user);
    };

    // หน้าเลือกบทบาท — 1 อีเมลมีหลายสิทธิ์ (กรอกหลายแผนก และ/หรือ เป็นผู้อนุมัติ)
    function renderPicker(email, asg) {
      const year = UI.year();
      const fillers = asg.filter(a => a.role === 'filler');
      const viewers = asg.filter(a => a.role !== 'filler');
      const fillBtn = a => {
        const deptId = 'd' + a.id;
        const st = Store.deptState(year, deptId).status;
        const pct = Store.completion(year, deptId).pct;
        const chip = st === 'LOCKED' ? '<span class="pk-chip pk-lock">🔒 ปิดรอบ</span>'
          : st === 'SUBMITTED' ? '<span class="pk-chip pk-ok">✅ ส่งแล้ว</span>'
          : st === 'NEED_REVISION' ? '<span class="pk-chip pk-warn">↩ ถูกตีกลับ — แก้ไขได้</span>'
          : `<span class="pk-chip">⏳ กรอกแล้ว ${pct}%</span>`;
        return `<button class="pk-item" data-pick="${a.id}"><b>${UI.esc(a.name)}</b> <small>(${a.id})</small>${chip}</button>`;
      };
      const viewBtn = a => {
        const unitId = a.id.replace(/^MGR:/, '');
        const pending = Store.subtreeDepartments(unitId).filter(d => Store.deptState(year, d.id).status === 'SUBMITTED').length;
        const isCo = unitId === 'co';
        return `<button class="pk-item" data-pick="${a.id}"><b>${UI.esc(a.name)}</b>
          ${pending ? `<span class="pk-chip pk-warn">🔔 รอทวนสอบ ${pending}</span>` : '<span class="pk-chip">ไม่มีงานค้าง</span>'}
          <small>${isCo ? 'ผู้ดูภาพรวมทั้งบริษัท (กจก.)' : UI.esc(a.sub)}</small></button>`;
      };
      document.querySelector('.lv-login').innerHTML = `
        <div class="lv-badge">${UI.APP_LOGO}</div>
        <h2>เลือกบทบาท</h2>
        <div class="lv-sub">${UI.esc(email)} · มี ${asg.length} สิทธิ์ในระบบ</div>
        <div class="pk-list">
          ${fillers.length ? `<div class="pk-group">📝 ผู้กรอกงบ (${fillers.length} แผนก)</div>` + fillers.map(fillBtn).join('') : ''}
          ${viewers.length ? `<div class="pk-group">✅ ผู้อนุมัติ / ผู้ดูภาพรวม</div>` + viewers.map(viewBtn).join('') : ''}
        </div>
        <a class="lv-forgot lv-alt-toggle" id="pkBack">← ใช้บัญชีอื่น</a>`;
      document.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => loginAs(b.dataset.pick, email)));
      document.getElementById('pkBack').addEventListener('click', () => { sessionStorage.removeItem('abp_email'); loginPage(); });
    }

    const doLogin = () => {
      const raw = document.getElementById('loginEmail').value.trim();
      const pw = document.getElementById('deptPin').value;
      if (!raw) { UI.toast('กรุณากรอกอีเมล (หรือ admin)', 'err'); return; }
      // ผู้ดูแลระบบ — ไม่ใช้อีเมล: admin / 1234
      if (raw.toLowerCase() === 'admin') {
        if (pw !== '1234') { UI.toast('รหัสผ่าน admin ไม่ถูกต้อง', 'err'); return; }
        return loginAs('accounting', null);
      }
      if (!raw.includes('@')) { UI.toast('กรอกอีเมลบริษัท เช่น yourname@mitrphol.com', 'err'); return; }
      const email = EmailAuth.norm(raw);
      const asg = EmailAuth.assignmentsFor(email);
      if (!asg.length) { UI.toast('ไม่พบอีเมลนี้ในระบบ — ติดต่อแผนกบัญชี (ผู้ดูแลระบบ)', 'err'); return; }
      if (pw !== Store.passwordFor(email)) { UI.toast('รหัสผ่านไม่ถูกต้อง', 'err'); return; }
      if (asg.length === 1) return loginAs(asg[0].id, email);
      sessionStorage.setItem('abp_email', email);
      renderPicker(email, asg);
    };
    document.getElementById('deptLoginBtn').addEventListener('click', doLogin);
    document.getElementById('deptPin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // ทางสำรอง: เข้าแบบเลือกหน่วยงาน (dropdown เดิม)
    document.getElementById('unitLoginLink').addEventListener('click', () => {
      const box = document.getElementById('unitLoginBox');
      box.hidden = !box.hidden;
    });
    document.getElementById('unitLoginBtn').addEventListener('click', () => {
      const code = document.getElementById('deptSel').value;
      if (!code) { UI.toast('กรุณาเลือกหน่วยงานก่อน', 'err'); return; }
      const pw = document.getElementById('deptPin').value;
      if (authOn()) return authLogin(code, pw, document.getElementById('unitLoginBtn'));
      // ทางสำรอง: admin ใช้ 1234 · ที่เหลือใช้รหัสกลาง 'a'
      if (code === 'accounting' ? pw !== '1234' : pw !== 'a') { UI.toast('รหัสผ่านไม่ถูกต้อง', 'err'); return; }
      loginAs(code, null);
    });

    document.getElementById('pwEye').addEventListener('click', () => {
      const inp = document.getElementById('deptPin');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });

    // กลับมาจากปุ่ม "สลับบทบาท" — มีอีเมลค้างอยู่ → เปิดหน้าเลือกบทบาททันที
    const pe = sessionStorage.getItem('abp_email');
    if (pe) {
      const asg = EmailAuth.assignmentsFor(pe);
      if (asg.length > 1) renderPicker(pe, asg);
    }
  }

  function render() {
    // กันสถานะค้าง: โหมดเต็มจอ/modal ที่ตั้ง body.no-scroll (overflow:hidden) แล้วเปลี่ยนหน้า
    // จะทำให้ทุกหน้าเลื่อนไม่ได้ — ล้างทุกครั้งที่ render (โหมดเต็มจอจะถูกตั้งใหม่เองใน bind ถ้าจำเป็น)
    document.body.classList.remove('no-scroll');
    const hash = location.hash || '#/login';
    const base = hash.split('?')[0];
    const user = Store.currentUser();

    if (base === '#/login' || !user) { loginPage(); return; }

    const route = ROUTES[base];
    if (!route) { location.hash = homeFor(user); return; }
    if (route.role !== '*' && route.role !== user.role) { location.hash = homeFor(user); return; }
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
    // กันกดบนข้อมูลเก่า: ถ้าต่อ Supabase ให้ขึ้นม่าน "กำลังดึงข้อมูลล่าสุด" จนซิงค์เสร็จก่อน แล้วค่อยเปิดหน้าจอ
    const useOverlay = (typeof Supa !== 'undefined' && Supa.enabled());
    let ov = null;
    if (useOverlay) {
      ov = document.createElement('div');
      ov.className = 'boot-sync';
      ov.innerHTML = '<div class="bs-card"><div class="bs-spin"></div></div>';
      document.body.appendChild(ov);
    } else {
      safeRender();
    }
    const done = () => { if (ov) { ov.remove(); ov = null; safeRender(); } };
    const fallback = setTimeout(done, 9000);   // ออฟไลน์/ช้าผิดปกติ → เปิดหน้าจอด้วยข้อมูลในเครื่อง
    Sync.init().then(res => {
      clearTimeout(fallback); done();
      if (res && res.needLogin) { Store.logout(); location.hash = '#/login'; safeRender(); }
      else if (!useOverlay && res && res.adopted) safeRender();
    }).catch(() => { clearTimeout(fallback); done(); });
  });

  return { render };
})();

window.App = App;

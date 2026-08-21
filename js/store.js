/* =============================================================
 * store.js — Data Access + Business Rules (ชั้นเดียวที่แตะข้อมูลได้)
 *
 * กติกาสำคัญที่บังคับใน layer นี้:
 *  - USER แก้ได้เฉพาะงบของหน่วยงานตนเอง และเฉพาะเมื่อรอบยังเปิด + ยังไม่ Submit/Lock
 *  - ACCOUNTING ดูได้ทุกอย่าง แต่ "แก้ตัวเลขงบของ User ไม่ได้" (โยน error)
 *  - ทุก mutation บันทึก Audit Log อัตโนมัติ
 * ============================================================= */

const Store = (() => {
  const DB_KEY = 'abp_db_v1';
  const SES_KEY = 'abp_session';
  let db = null;

  /* ---------- persistence ---------- */
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(DB_KEY); } catch (e) { /* storage ถูกปิดใช้งาน — ใช้ข้อมูลในหน่วยความจำ */ }
    db = null;
    if (raw) { try { db = JSON.parse(raw); } catch (e) { db = null; } }
    if (!db || db.meta?.schemaVersion !== SEED.meta.schemaVersion) {
      db = JSON.parse(JSON.stringify(SEED));
      db.meta.seededAt = new Date().toISOString();
      save();
    }
    reconcileConfig();
  }
  // โครงสร้าง/master = config ฝั่ง client (มาจากโค้ด SEED ไม่ใช่ Supabase) → รีเฟรชจาก SEED เสมอ
  //  ทำให้ผู้ใช้/ผัง/หน่วยงาน/GL(+Type,ฝ่าย,ด้าน) ครบเสมอ แม้ Supabase เก็บแค่คอลัมน์พื้นฐาน
  //  Supabase = แหล่งของ "ตัวเลข" เท่านั้น (budgets/status/snapshots/actuals/notes) — ไม่แตะที่นี่
  function reconcileConfig() {
    if (!db) return;
    const clone = x => JSON.parse(JSON.stringify(x));
    // ผู้ใช้ + ผัง = static จากโค้ด (ไม่ให้แก้ runtime)
    db.users = clone(SEED.users);
    db.oversight = clone(SEED.oversight);
    // โครงสร้าง/master = SEED (มี rich fields: Type/ฝ่าย/ด้าน) เป็น "ฐาน" + ของที่แอดมินเพิ่มภายหลัง
    //  (แถว/GL/CCT/แผนก ที่มาจาก Supabase แต่ไม่มีใน SEED = แอดมินเพิ่มเอง → เก็บไว้ merge บนสุด)
    const merge = (seedArr, cur, keyFn) => {
      const out = clone(seedArr); const seen = new Set(out.map(keyFn));
      (cur || []).forEach(x => { const k = keyFn(x); if (!seen.has(k)) { seen.add(k); out.push(x); } });
      return out;
    };
    db.glAccounts     = merge(SEED.glAccounts,     db.glAccounts,     g => g.id);
    db.departments    = merge(SEED.departments,    db.departments,    d => d.id);
    db.cctMaster      = merge(SEED.cctMaster,      db.cctMaster,      c => c.code);
    db.departmentRows = merge(SEED.departmentRows, db.departmentRows, r => r.departmentId + '|' + r.glId + '|' + r.cct);
    // departmentGL (distinct) — derive จาก departmentRows หลัง merge
    const seenDG = new Set(); db.departmentGL = [];
    db.departmentRows.forEach(x => { const k = x.departmentId + '|' + x.glId; if (!seenDG.has(k)) { seenDG.add(k); db.departmentGL.push({ departmentId: x.departmentId, glId: x.glId }); } });
    if (db.meta) {
      db.meta.sides = clone(SEED.meta.sides);
      db.meta.company = SEED.meta.company;   // ป้ายชื่อบริษัท/แอป = static จากโค้ด (Supabase ไม่ต้องเก็บ Thai ให้ถูก)
      db.meta.currency = SEED.meta.currency;
      db.meta.appName = SEED.meta.appName;
      db.meta.volumeEditors = clone(SEED.meta.volumeEditors || {});   // สิทธิ์กรอกปริมาณผลิต = config จากโค้ด
      db.meta.pptEditors = clone(SEED.meta.pptEditors || {});          // สิทธิ์กรอกจำนวนเงิน PPT รายหมวด
      db.meta.pptCategories = clone(SEED.meta.pptCategories || {});
    }
    // จำนวนเงิน PPT: SEED (ปี 2025 อ้างอิงจากไฟล์) เป็นฐาน + Supabase ทับ (ปีที่ user กรอก/แก้)
    {
      const m = {}; (SEED.pptAmounts || []).forEach(x => { m[x.year + '|' + x.code] = clone(x); });
      (db.pptAmounts || []).forEach(x => { m[x.year + '|' + x.code] = x; });
      db.pptAmounts = Object.keys(m).map(k => m[k]);
    }
  }
  let afterSave = null; // hook สำหรับ Sync (ตั้งค่าโดย sync.js)
  function setAfterSave(fn) { afterSave = fn; }
  function saveSilent() { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* storage เต็ม/ปิดใช้งาน */ } }
  function save() { saveSilent(); if (afterSave) afterSave(); }
  function adoptDb(newDb) { db = newDb; reconcileConfig(); saveSilent(); } // รับข้อมูลจาก backend มาแทนที่
  function resetDemo() { localStorage.removeItem(DB_KEY); load(); save(); }

  /* ---------- auth / session ---------- */
  function login(username, password) {
    const u = db.users.find(x => x.username === username && x.password === password);
    if (!u) return null;
    sessionStorage.setItem(SES_KEY, u.id);
    return u;
  }
  // ตั้ง session จาก username อย่างเดียว (ใช้หลังยืนยันตัวตนผ่าน Supabase Auth แล้ว — รหัสจริงอยู่ที่ Supabase)
  function loginByUsername(username) {
    const u = db.users.find(x => x.username === username);
    if (!u) return null;
    sessionStorage.setItem(SES_KEY, u.id);
    return u;
  }
  function logout() { sessionStorage.removeItem(SES_KEY); }

  /* ---------- รหัสผ่าน (ค่าเริ่มต้น 'a' · admin key '__admin__' ค่าเริ่มต้น 1234) ----------
   * เก็บใน db.userPasswords [{email, pass, changedAt}] → sync ตาราง user_passwords (optional) */
  const DEFAULT_EMAIL_PASS = 'a';
  const pwDefault = key => key === '__admin__' ? '1234' : DEFAULT_EMAIL_PASS;
  function passwordFor(email) {
    const key = String(email || '').trim().toLowerCase();
    return (db.userPasswords || []).find(x => x.email === key)?.pass || pwDefault(key);
  }
  function setUserPassword(email, oldPass, newPass) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) throw new Error('ไม่พบอีเมลของผู้ใช้');
    if (String(oldPass) !== passwordFor(key)) throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    newPass = String(newPass || '');
    if (newPass.length < 4) throw new Error('รหัสผ่านใหม่ต้องยาวอย่างน้อย 4 ตัวอักษร');
    if (!db.userPasswords) db.userPasswords = [];
    let row = db.userPasswords.find(x => x.email === key);
    if (!row) { row = { email: key, pass: newPass, changedAt: null }; db.userPasswords.push(row); }
    row.pass = newPass;
    row.changedAt = new Date().toISOString();
    save();
  }
  function currentUser() {
    const id = sessionStorage.getItem(SES_KEY);
    return db.users.find(u => u.id === id) || null;
  }

  /* ---------- สมุดผู้ใช้ (email → บทบาท) จัดการโดยแอดมิน ----------
   * ฐาน = EMAIL_DIR (directory.js). เมื่อแอดมินแก้ครั้งแรก → materialize ลง db.userAccounts (sync)
   * โครงสร้าง account: { email, roles:[{kind:'filler'|'viewer', id, name, sub}], active } */
  const normEmail = e => String(e || '').trim().toLowerCase();
  function baseDirectory() {
    const map = {};
    (typeof EMAIL_DIR !== 'undefined' ? EMAIL_DIR : []).forEach(u => {
      if (u.role === 'admin' || u.selected === false) return;
      (u.emails || []).forEach(e => {
        const k = normEmail(e); if (!k) return;
        (map[k] = map[k] || { email: k, roles: [], active: true })
          .roles.push({ kind: u.role === 'filler' ? 'filler' : 'viewer', id: u.id, name: u.name, sub: u.sub || '' });
      });
    });
    return Object.values(map);
  }
  // สมุดผู้ใช้ที่ใช้จริง: ถ้าแอดมินเคยแก้ (db.userAccounts มีข้อมูล) ใช้อันนั้น มิฉะนั้นใช้ฐานจากโค้ด
  function directory() {
    return (db.userAccounts && db.userAccounts.length) ? db.userAccounts : baseDirectory();
  }
  function directoryAccount(email) {
    const k = normEmail(email);
    return directory().find(a => normEmail(a.email) === k) || null;
  }
  // materialize ฐาน → db.userAccounts (เรียกก่อนแก้ทุกครั้ง เพื่อให้แก้ได้แล้ว sync)
  function ensureUserAccounts() {
    if (!db.userAccounts || !db.userAccounts.length) db.userAccounts = JSON.parse(JSON.stringify(baseDirectory()));
    return db.userAccounts;
  }
  // ชื่อของบทบาท (จาก id) — filler=รหัสแผนก, viewer=MGR:node
  function roleMeta(kind, id) {
    if (kind === 'filler') { const d = dept('d' + id) || db.departments.find(x => x.code === id); return { name: d?.name || id, sub: '' }; }
    const u = oversightUnit(String(id).replace(/^MGR:/, '')); return { name: u?.name || id, sub: u?.approver ? 'ระดับฝ่าย (ผู้อนุมัติ)' : '' };
  }
  function addUserAccount(actor, email) {
    assertAccounting(actor);
    const k = normEmail(email);
    if (!k || !k.includes('@')) throw new Error('กรอกอีเมลให้ถูกต้อง');
    const accs = ensureUserAccounts();
    if (accs.some(a => normEmail(a.email) === k)) throw new Error('มีอีเมลนี้อยู่แล้ว');
    accs.push({ email: k, roles: [], active: true });
    audit(actor, 'เพิ่มผู้ใช้', { newValue: k });
    save();
  }
  function removeUserAccount(actor, email) {
    assertAccounting(actor);
    const k = normEmail(email);
    const accs = ensureUserAccounts();
    const i = accs.findIndex(a => normEmail(a.email) === k);
    if (i < 0) throw new Error('ไม่พบผู้ใช้');
    if (accs.length <= 1) throw new Error('ต้องมีผู้ใช้อย่างน้อย 1 คน — ลบคนสุดท้ายไม่ได้'); // กันลิสต์ว่างแล้ว fallback กลับ default
    accs.splice(i, 1);
    audit(actor, 'ลบผู้ใช้', { oldValue: k });
    save();
  }
  function addUserRole(actor, email, kind, id) {
    assertAccounting(actor);
    const k = normEmail(email);
    const accs = ensureUserAccounts();
    const a = accs.find(x => normEmail(x.email) === k);
    if (!a) throw new Error('ไม่พบผู้ใช้');
    if (a.roles.some(r => r.kind === kind && String(r.id) === String(id))) throw new Error('มีบทบาทนี้อยู่แล้ว');
    const m = roleMeta(kind, id);
    a.roles.push({ kind, id, name: m.name, sub: m.sub });
    audit(actor, 'เพิ่มบทบาทผู้ใช้', { newValue: `${k} → ${kind} ${id}` });
    save();
  }
  function removeUserRole(actor, email, kind, id) {
    assertAccounting(actor);
    const k = normEmail(email);
    const accs = ensureUserAccounts();
    const a = accs.find(x => normEmail(x.email) === k);
    if (!a) throw new Error('ไม่พบผู้ใช้');
    a.roles = a.roles.filter(r => !(r.kind === kind && String(r.id) === String(id)));
    audit(actor, 'ลบบทบาทผู้ใช้', { oldValue: `${k} → ${kind} ${id}` });
    save();
  }
  // รีเซ็ตรหัสผ่านผู้ใช้กลับเป็นค่าเริ่มต้น (แอดมินช่วยผู้ใช้ที่ลืมรหัส)
  function resetUserPassword(actor, email) {
    assertAccounting(actor);
    const k = normEmail(email);
    if (db.userPasswords) db.userPasswords = db.userPasswords.filter(x => x.email !== k);
    audit(actor, 'รีเซ็ตรหัสผ่านผู้ใช้', { newValue: k + ' → ค่าเริ่มต้น' });
    save();
  }

  /* ---------- audit / notification ---------- */
  function audit(actor, action, extra = {}) {
    db.auditLogs.unshift({
      id: 'a' + Date.now() + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      userId: actor.id, userName: actor.name, action,
      deptId: extra.deptId ?? null, glCode: extra.glCode ?? null, month: extra.month ?? null,
      oldValue: extra.oldValue ?? null, newValue: extra.newValue ?? null,
    });
    if (db.auditLogs.length > 2000) db.auditLogs.length = 2000;
  }
  function notify(target, message) { // target: {role} หรือ {deptId}
    db.notifications.unshift({
      id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      targetRole: target.role ?? null, targetDeptId: target.deptId ?? null, message, read: false,
    });
    // ยิงอีเมลคู่ขนาน (best-effort — ทำงานเมื่อตั้งค่า Edge Function + user_emails แล้ว, ดู supabase/EMAIL-SETUP.md)
    try { if (typeof EmailBridge !== 'undefined') EmailBridge.dispatch(target, message); } catch (e) { /* เงียบ */ }
  }
  function myNotifications(user) {
    return db.notifications.filter(n =>
      n.targetRole === '*' ||                                     // ประกาศถึงทุกคน (จากแอดมิน)
      (n.targetRole && n.targetRole === user.role) ||
      (n.targetDeptId && n.targetDeptId === user.departmentId));
  }
  const isAnnouncement = n => n.targetRole === '*';
  function markNotificationsRead(user) {
    myNotifications(user).forEach(n => { n.read = true; }); save();
  }
  // ประกาศจากแอดมินถึงทุกคน (targetRole='*') — โผล่ในกระดิ่งของทุกบทบาท/ทุกแผนก
  function postAnnouncement(actor, message) {
    assertAccounting(actor);
    const msg = String(message || '').trim();
    if (!msg) throw new Error('กรุณาระบุข้อความประกาศ');
    notify({ role: '*' }, msg);
    audit(actor, 'ประกาศถึงทุกคน', { newValue: msg.slice(0, 160) });
    save();
    return true;
  }

  /* ---------- queries ---------- */
  const dept  = id => db.departments.find(d => d.id === id);
  const gl    = id => db.glAccounts.find(g => g.id === id);
  const glByCode = code => db.glAccounts.find(g => g.code === code);
  const period = year => db.budgetPeriods.find(p => p.year === Number(year));
  const activeDepartments = () => db.departments.filter(d => d.active);
  // ---------- ผังกำกับดูแล (Oversight tree) ----------
  const oversight = () => (SEED.oversight || []);
  const oversightUnit = id => oversight().find(u => u.id === id) || null;
  const childUnits = unitId => oversight().filter(c => c.parent === unitId);
  // ---------- ข้อยกเว้นการมองเห็น "รายอีเมล" (บาง user ห้ามเห็นงบของบางฝ่าย/แผนก) ----------
  // key = อีเมล (ตัวพิมพ์เล็ก) · divs = ชื่อฝ่าย/ฝ่ายย่อยที่ห้ามเห็น · codes = รหัสแผนก · areas = ชื่อสังกัด
  const VIEW_EXCLUSIONS = {
    'chanchalermk@mitrphol.com': { divs: ['ศูนย์ประกันคุณภาพ'] },
  };
  const exclusionRule = () => { let e = ''; try { e = (sessionStorage.getItem('abp_email') || '').toLowerCase(); } catch (x) {} return VIEW_EXCLUSIONS[e] || null; };
  function hiddenDeptCodes() {
    const rule = exclusionRule(); if (!rule) return null;
    const set = new Set((rule.codes || []).map(String));
    const divs = new Set(rule.divs || []), areas = new Set(rule.areas || []);
    if (divs.size || areas.size) db.departments.forEach(d => {
      if ((d.div && divs.has(d.div)) || (d.subDiv && divs.has(d.subDiv)) || (d.area && areas.has(d.area))) set.add(d.code);
    });
    return set.size ? set : null;
  }
  const hiddenUnitNames = () => { const rule = exclusionRule(); return rule ? new Set(rule.divs || []) : null; };

  function subtreeDeptCodes(unitId) {                    // แผนกที่มีงบทั้งหมดใต้หน่วยนี้ (รวม subtree)
    const u = oversightUnit(unitId); if (!u) return [];
    const codes = [...(u.deptCodes || [])];
    childUnits(unitId).forEach(c => codes.push(...subtreeDeptCodes(c.id)));
    let list = [...new Set(codes)];
    const hidden = hiddenDeptCodes();               // กรองแผนกที่ผู้ใช้คนนี้ห้ามเห็น
    if (hidden) list = list.filter(c => !hidden.has(c));
    return list;
  }
  const subtreeDepartments = unitId => subtreeDeptCodes(unitId)
    .map(code => db.departments.find(d => d.code === code)).filter(d => d && d.active);
  // หน่วยทั้งหมดใน subtree (รวมตัวเอง) เรียงแบบต้นไม้ + depth — ใช้ทำตัวเลือก "ดูแยกฝ่ายย่อย"
  function subtreeUnits(unitId) {
    const out = [];
    const hiddenU = hiddenUnitNames();              // ซ่อนหน่วย (ฝ่าย) ที่ผู้ใช้คนนี้ห้ามเห็นทั้งกิ่ง
    const walk = (id, depth) => {
      const u = oversightUnit(id); if (!u) return;
      if (hiddenU && hiddenU.has(u.name)) return;
      out.push({ unit: u, depth });
      childUnits(id).forEach(c => walk(c.id, depth + 1));
    };
    walk(unitId, 0);
    return out;
  }
  // หน่วยกำกับดูแลที่แผนกนี้สังกัด (สำหรับแสดงผล)
  const unitOfDept = code => oversight().find(u => (u.deptCodes || []).includes(code)) || null;

  function deptGLs(deptId) {
    return db.departmentGL.filter(x => x.departmentId === deptId)
      .map(x => gl(x.glId)).filter(g => g && g.active)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  /* ---------- ระดับแถว CCT × GL (หน่วยกรอกจริง — rowKey = glId + '@' + cct) ---------- */
  const cctName = code => (db.cctMaster || []).find(c => c.code === code)?.name || code;
  function deptRows(deptId) {
    const list = (db.departmentRows || []).filter(x => x.departmentId === deptId)
      .map(x => ({ key: x.glId + '@' + x.cct, glId: x.glId, gl: gl(x.glId), cct: x.cct, cctName: cctName(x.cct), io: x.io || '', codeA: x.codeA || '' }))
      .filter(r => r.gl && r.gl.active)
      .sort((a, b) => a.gl.code.localeCompare(b.gl.code) || a.cct.localeCompare(b.cct));
    // นับจำนวน CCT ต่อ GL เพื่อให้ UI รู้ว่า GL ไหนแตกหลายหน่วยงานย่อย
    const cnt = {};
    list.forEach(r => { cnt[r.glId] = (cnt[r.glId] || 0) + 1; });
    list.forEach(r => { r.multiCct = cnt[r.glId] > 1; });
    return list;
  }
  const splitKey = key => { const i = String(key).indexOf('@'); return [key.slice(0, i), key.slice(i + 1)]; };
  function rowByKey(year, deptId, key) {
    const [glId, cct] = splitKey(key);
    return db.budgets.find(b => b.year === Number(year) && b.departmentId === deptId && b.glId === glId && b.cct === cct) || null;
  }
  function rowMonths(year, deptId, key) {
    const r = rowByKey(year, deptId, key);
    return r ? r.months : Array(12).fill(null);
  }
  const sum = arr => arr.reduce((s, v) => s + (v ?? 0), 0);
  const rowTotal = (year, deptId, key) => sum(rowMonths(year, deptId, key));

  /* ---------- ระดับ GL (roll-up รวมทุก CCT) — ใช้กับ dashboard/วิเคราะห์ ---------- */
  function months(year, deptId, glId) {
    const rows = db.budgets.filter(b => b.year === Number(year) && b.departmentId === deptId && b.glId === glId);
    if (!rows.length) return Array(12).fill(null);
    const out = Array(12).fill(0);
    rows.forEach(r => r.months.forEach((v, i) => { out[i] += v ?? 0; }));
    return out;
  }
  const glTotal = (year, deptId, glId) => sum(months(year, deptId, glId));
  function deptTotal(year, deptId) {
    return deptGLs(deptId).reduce((s, g) => s + glTotal(year, deptId, g.id), 0);
  }
  function companyTotal(year) {
    return activeDepartments().reduce((s, d) => s + deptTotal(year, d.id), 0);
  }
  function deptMonthly(year, deptId) {
    const out = Array(12).fill(0);
    deptGLs(deptId).forEach(g => months(year, deptId, g.id).forEach((v, i) => { out[i] += v ?? 0; }));
    return out;
  }
  function companyMonthly(year) {
    const out = Array(12).fill(0);
    activeDepartments().forEach(d => deptMonthly(year, d.id).forEach((v, i) => { out[i] += v; }));
    return out;
  }
  // note: รับได้ทั้ง rowKey (มี '@') = เหตุผลรายแถว หรือ glId = รวมเหตุผลทุก CCT ของ GL นั้น
  function note(year, deptId, keyOrGl) {
    const k = String(keyOrGl);
    if (k.includes('@')) {
      return db.glNotes.find(n => n.year === Number(year) && n.departmentId === deptId && n.rowKey === k)
        || { year: Number(year), departmentId: deptId, rowKey: k, reason: '', assumption: '' };
    }
    const parts = db.glNotes.filter(n => n.year === Number(year) && n.departmentId === deptId && (n.rowKey || '').startsWith(k + '@'));
    const join = f => [...new Set(parts.map(p => (p[f] || '').trim()).filter(Boolean))].join(' / ');
    return { reason: join('reason'), assumption: join('assumption') };
  }
  function deptState(year, deptId) {
    return db.deptStatus.find(s => s.year === Number(year) && s.departmentId === deptId)
      || { year: Number(year), departmentId: deptId, status: 'DRAFT', submittedAt: null, revisionNote: null };
  }
  function completion(year, deptId) {
    const rows = deptRows(deptId);
    if (!rows.length) return { filled: 0, total: 0, pct: 0 };
    let filled = 0;
    const total = rows.length * 14;   // 12 เดือน + MTP 2 ปี (นับ MTP ด้วย)
    rows.forEach(r => {
      rowMonths(year, deptId, r.key).forEach(v => { if (v !== null && v !== undefined) filled++; });
      const row = rowByKey(year, deptId, r.key);
      if (row && row.mtp1 !== null && row.mtp1 !== undefined) filled++;
      if (row && row.mtp2 !== null && row.mtp2 !== undefined) filled++;
    });
    // ยังกรอกไม่ครบ → ไม่ปัดขึ้นเป็น 100 (floor); ครบจริงเท่านั้นถึงจะ 100
    const pct = total ? (filled >= total ? 100 : Math.floor(filled / total * 100)) : 0;
    return { filled, total, pct };
  }

  /* ---------- รอบ Revise: งบเดิม (snapshot) + เกิดจริง ---------- */
  function revisePhase(year) {
    const p = period(year);
    const on = p?.phase === 'REVISE' || p?.phase === 'LANDING';
    return { on, thru: p?.actualThru || 0, kind: on ? p.phase : null }; // kind: REVISE (เม.ย.) | LANDING (ก.ย. ปิดยอด)
  }
  function snapshotFor(year) {
    return (db.budgetSnapshots || []).find(s => s.year === Number(year) && s.label === 'ORIGINAL') || null;
  }
  // freeze แผน ORIGINAL "ครั้งเดียว" (ตอนอนุมัติ/Lock) — คงที่ทั้งปี ใช้เทียบทั้ง Revise และ Landing
  function ensureOriginal(year, actor) {
    if (snapshotFor(year)) return false;
    if (!db.budgetSnapshots) db.budgetSnapshots = [];
    db.budgetSnapshots.push({
      year: Number(year), label: 'ORIGINAL', takenAt: new Date().toISOString(), createdAt: new Date().toISOString(), takenBy: actor ? actor.name : 'system',
      rows: db.budgets.filter(b => b.year === Number(year)).map(b => ({
        departmentId: b.departmentId, glId: b.glId, cct: b.cct, months: b.months.slice(), mtp1: b.mtp1, mtp2: b.mtp2,
      })),
    });
    return true;
  }
  /* ---------- เวอร์ชันงบ (snapshot) หลายรอบ — งบต้นปี / Revise / กดเอง ---------- */
  const SNAP_TITLE = lb => lb === 'ORIGINAL' ? 'งบต้นปี (อนุมัติ)' : lb;
  function snapshotsFor(year) {
    return (db.budgetSnapshots || []).filter(s => s.year === Number(year)).slice()
      .sort((a, b) => ((a.takenAt || a.createdAt || '') + '').localeCompare((b.takenAt || b.createdAt || '')));
  }
  function snapByLabel(year, label) {
    return (db.budgetSnapshots || []).find(s => s.year === Number(year) && s.label === label) || null;
  }
  // ถ่าย snapshot งบปัจจุบันของทั้งปี (label ไม่ซ้ำต่อปี — ต่อท้ายเลขถ้าซ้ำ) · actor=null = ระบบถ่ายอัตโนมัติ
  function takeSnapshot(actor, year, label) {
    if (actor) assertAccounting(actor);
    year = Number(year);
    let lb = String(label || '').trim() || ('เวอร์ชัน ' + new Date().toISOString().slice(0, 10));
    const exist = new Set((db.budgetSnapshots || []).filter(s => s.year === year).map(s => s.label));
    if (exist.has(lb)) { let i = 2; while (exist.has(lb + ' (' + i + ')')) i++; lb = lb + ' (' + i + ')'; }
    if (!db.budgetSnapshots) db.budgetSnapshots = [];
    db.budgetSnapshots.push({
      year, label: lb, takenAt: new Date().toISOString(), createdAt: new Date().toISOString(), takenBy: actor ? actor.name : 'ระบบ (อัตโนมัติ)',
      rows: db.budgets.filter(b => b.year === year).map(b => ({ departmentId: b.departmentId, glId: b.glId, cct: b.cct, months: b.months.slice(), mtp1: b.mtp1, mtp2: b.mtp2 })),
    });
    if (actor) audit(actor, 'บันทึกเวอร์ชันงบ', { newValue: `${year} · ${lb}` });
    save();
    return lb;
  }
  function deleteSnapshot(actor, year, label) {
    assertAccounting(actor);
    if (label === 'ORIGINAL') throw new Error('ลบงบต้นปี (ORIGINAL) ไม่ได้ — ใช้เทียบรอบ Revise');
    db.budgetSnapshots = (db.budgetSnapshots || []).filter(s => !(s.year === Number(year) && s.label === label));
    audit(actor, 'ลบเวอร์ชันงบ', { newValue: `${year} · ${label}` });
    save();
  }
  const snapRowMonths = (year, label, deptId, rowKey) => {
    const s = snapByLabel(year, label); if (!s) return Array(12).fill(null);
    const [glId, cct] = splitKey(rowKey);
    const r = s.rows.find(x => x.departmentId === deptId && x.glId === glId && x.cct === cct);
    return r ? r.months : Array(12).fill(null);
  };
  function snapDeptMonthly(year, label, deptId) {
    const s = snapByLabel(year, label); const out = Array(12).fill(0);
    if (s) s.rows.filter(r => r.departmentId === deptId).forEach(r => r.months.forEach((v, i) => { out[i] += v ?? 0; }));
    return out;
  }
  const snapDeptTotal = (year, label, deptId) => sum(snapDeptMonthly(year, label, deptId));
  const snapCompanyTotal = (year, label) => { const s = snapByLabel(year, label); return s ? s.rows.reduce((t, r) => t + sum(r.months), 0) : 0; };

  function originalMonths(year, deptId, rowKey) {
    const s = snapshotFor(year);
    if (!s) return Array(12).fill(null);
    const [glId, cct] = splitKey(rowKey);
    const r = s.rows.find(x => x.departmentId === deptId && x.glId === glId && x.cct === cct);
    return r ? r.months : Array(12).fill(null);
  }
  const originalRowTotal = (year, deptId, rowKey) => sum(originalMonths(year, deptId, rowKey));
  function originalGlTotal(year, deptId, glId) {
    const s = snapshotFor(year);
    if (!s) return 0;
    return s.rows.filter(x => x.departmentId === deptId && x.glId === glId)
      .reduce((t, r) => t + sum(r.months), 0);
  }
  function originalDeptMonthly(year, deptId) {
    const out = Array(12).fill(0);
    const s = snapshotFor(year);
    if (s) s.rows.filter(x => x.departmentId === deptId).forEach(r => r.months.forEach((v, i) => { out[i] += v ?? 0; }));
    return out;
  }
  const originalDeptTotal = (year, deptId) => sum(originalDeptMonthly(year, deptId));
  function actualMonths(year, deptId, rowKey) {
    const [glId, cct] = splitKey(rowKey);
    const r = (db.actuals || []).find(x => x.year === Number(year) && x.departmentId === deptId && x.glId === glId && x.cct === cct);
    return r ? r.months : Array(12).fill(null);
  }

  // เปิดรอบแก้กลางปี · kind='REVISE' (เม.ย. thru=4) หรือ 'LANDING' (ก.ย. ปิดยอด thru=9)
  // ทั้งคู่เทียบกับ ORIGINAL เดิม (แผนที่อนุมัติ) — ไม่ freeze ใหม่
  function openRevise(actor, year, actualThru, kind) {
    assertAccounting(actor);
    kind = kind === 'LANDING' ? 'LANDING' : 'REVISE';
    const label = kind === 'LANDING' ? 'ปิดยอด (Landing)' : 'Revise กลางปี';
    const p = period(year);
    if (!p) throw new Error('ไม่พบรอบงบประมาณ');
    if (Number(year) < db.meta.yearCurrent) throw new Error(`ปี ${year} เป็นปีฐาน (ปิดปีแล้ว) — เปิดรอบได้เฉพาะปีงบปัจจุบัน (${db.meta.yearCurrent})`);
    if (revisePhase(year).on) throw new Error(`ปี ${year} เปิดรอบ ${p.phase === 'LANDING' ? 'ปิดยอด' : 'Revise'} อยู่แล้ว`);
    const n = Number(actualThru);
    if (!(n >= 1 && n <= 12)) throw new Error('เดือนที่มีเกิดจริงต้องอยู่ระหว่าง 1-12');
    ensureOriginal(year, actor); // freeze แผนถ้ายังไม่มี (ปกติ freeze ตอน Lock แล้ว → reuse)
    p.status = 'OPEN'; p.phase = kind; p.actualThru = n;
    p.reviseOpenedAt = new Date().toISOString(); p.reviseOpenedBy = actor.name;
    activeDepartments().forEach(d => {
      setStatusInternal(year, d.id, 'IN_PROGRESS', { submittedAt: null, revisionNote: null });
      notify({ deptId: d.id }, `เปิดรอบ ${label} ปี ${year} — เดือน 1-${n - 1} เป็นเกิดจริง (ล็อก) · เดือน ${n} เพิ่มได้ไม่ต่ำกว่าเกิดจริง · ปรับคาดการณ์เดือนที่เหลือแล้วส่งอีกครั้ง (เทียบกับแผน ORIGINAL)`);
    });
    audit(actor, `เปิดรอบ ${label}`, { newValue: `ปี ${year} เกิดจริงถึงเดือน ${n}` });
    save();
  }

  function setActual(actor, year, deptId, rowKey, monthIdx, value) {
    assertAccounting(actor); // เกิดจริงเป็นข้อมูลของฝ่ายบัญชี
    const rv = revisePhase(year);
    if (!rv.on) throw new Error('ต้องเปิดรอบ Revise ก่อนจึงจะใส่เกิดจริงได้');
    if (monthIdx >= rv.thru) throw new Error(`ใส่เกิดจริงได้เฉพาะเดือน 1-${rv.thru}`);
    if (value !== null && (typeof value !== 'number' || !isFinite(value))) throw new Error('ค่าไม่ถูกต้อง');
    if (!db.actuals) db.actuals = [];
    const [glId, cct] = splitKey(rowKey);
    let a = db.actuals.find(x => x.year === Number(year) && x.departmentId === deptId && x.glId === glId && x.cct === cct);
    if (!a) { a = { year: Number(year), departmentId: deptId, glId, cct, months: Array(12).fill(null), updatedAt: null, updatedBy: null }; db.actuals.push(a); }
    const old = a.months[monthIdx];
    a.months[monthIdx] = value;
    a.updatedAt = new Date().toISOString(); a.updatedBy = actor.name;
    // sync เข้างบ Revise: เดือนล็อกสนิท = เกิดจริง · เดือนสุดท้าย (พื้น) = ยกขึ้นถ้างบต่ำกว่าจริง
    const row = ensureRow(year, deptId, rowKey);
    if (monthIdx < rv.thru - 1) {
      row.months[monthIdx] = value;
    } else if (monthIdx === rv.thru - 1 && value !== null) {
      if (row.months[monthIdx] === null || row.months[monthIdx] < value) row.months[monthIdx] = value;
    }
    if (old !== value) audit(actor, 'บันทึกเกิดจริง', { deptId, glCode: auditRowRef(rowKey).glCode, month: monthIdx + 1, oldValue: old, newValue: value });
    save();
  }

  function pasteActuals(actor, year, text) {
    // วางจาก Excel: [code a][เดือน1..N] หรือ [CCT][GL][เดือน1..N]
    assertAccounting(actor);
    const rv = revisePhase(year);
    if (!rv.on) throw new Error('ต้องเปิดรอบ Revise ก่อน');
    const num = s => { s = String(s).replace(/[,\s]/g, ''); if (s === '') return null; const v = Number(s); return isFinite(v) ? v : null; };
    let matched = 0; const unmatched = [];
    text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      const cols = line.split('\t').map(s2 => s2.trim());
      let rowRef = null, vals = [];
      const c0 = cols[0].replace(/\s/g, '');
      const byCodeA = (db.departmentRows || []).find(x => x.codeA && x.codeA === c0);
      if (byCodeA) { rowRef = byCodeA; vals = cols.slice(1); }
      else if (cols.length >= 2) {
        const byPair = (db.departmentRows || []).find(x => x.cct === c0 && (gl(x.glId)?.code === cols[1]));
        if (byPair) { rowRef = byPair; vals = cols.slice(2); }
      }
      if (!rowRef) { if (/\d{6}/.test(c0)) unmatched.push(c0.slice(0, 20)); return; }
      const key = rowRef.glId + '@' + rowRef.cct;
      for (let mi = 0; mi < Math.min(rv.thru, vals.length); mi++) {
        const v = num(vals[mi]);
        if (v !== null) setActual(actor, year, rowRef.departmentId, key, mi, v);
      }
      matched++;
    });
    audit(actor, 'วางเกิดจริงจาก Excel', { newValue: `ปี ${year}: ${matched} แถว` });
    save();
    return { matched, unmatched };
  }

  // จับคู่แถวงบจากไฟล์เกิดจริง: ลำดับความสำคัญ IO → code a → CCT+GL
  function actualRowRef({ io, codeA, cct, glCode }) {
    const rows = db.departmentRows || [];
    if (io) { const r = rows.find(x => x.io && x.io === io); if (r) return r; }
    if (codeA) { const r = rows.find(x => x.codeA && x.codeA === codeA); if (r) return r; }
    if (cct && glCode) { const r = rows.find(x => x.cct === cct && gl(x.glId)?.code === glCode); if (r) return r; }
    return null;
  }
  // นำเข้าเกิดจริงจากไฟล์: records = [{io,codeA,cct,glCode, months:[..]}]
  function importActuals(actor, year, records) {
    assertAccounting(actor);
    const rv = revisePhase(year);
    if (!rv.on) throw new Error('ต้องเปิดรอบ Revise ก่อน');
    let matched = 0; const unmatched = [];
    records.forEach(rec => {
      const ref = actualRowRef(rec);
      if (!ref) { unmatched.push(rec.io || rec.codeA || ((rec.cct || '') + '/' + (rec.glCode || '')) || '?'); return; }
      const key = ref.glId + '@' + ref.cct;
      const mm = rec.months || [];
      for (let mi = 0; mi < Math.min(rv.thru, mm.length); mi++) {
        const v = mm[mi];
        if (v !== null && v !== undefined && isFinite(v)) setActual(actor, year, ref.departmentId, key, mi, v);
      }
      matched++;
    });
    audit(actor, 'นำเข้าเกิดจริงจากไฟล์', { newValue: `ปี ${year}: ${matched} แถว` });
    save();
    return { matched, unmatched };
  }

  // ---- โพสต์ "เกิดจริง" ทับงบผู้กรอกทันที (ไม่ต้องเปิดรอบ Revise) — ล็อกช่องที่โพสต์ ----
  // records = [{io,codeA,cct,glCode, months:[..]}] · เขียนได้ทั้ง 12 เดือน · ทับ row.months (งบ) + เก็บใน db.actuals (แหล่งจริง+ล็อก)
  function postActuals(actor, year, records) {
    assertAccounting(actor);
    const y = Number(year);
    if (!db.actuals) db.actuals = [];
    let matched = 0, cells = 0; const unmatched = [];
    records.forEach(rec => {
      const ref = actualRowRef(rec);
      if (!ref) { unmatched.push(rec.io || rec.codeA || ((rec.cct || '') + '/' + (rec.glCode || '')) || '?'); return; }
      const key = ref.glId + '@' + ref.cct;
      let a = db.actuals.find(x => x.year === y && x.departmentId === ref.departmentId && x.glId === ref.glId && x.cct === ref.cct);
      if (!a) { a = { year: y, departmentId: ref.departmentId, glId: ref.glId, cct: ref.cct, months: Array(12).fill(null), updatedAt: null, updatedBy: null }; db.actuals.push(a); }
      const row = ensureRow(y, ref.departmentId, key);
      const mm = rec.months || [];
      let touched = false;
      for (let mi = 0; mi < 12 && mi < mm.length; mi++) {
        const v = mm[mi];
        if (v === null || v === undefined || !isFinite(v)) continue;
        const old = row.months[mi];
        a.months[mi] = v;
        row.months[mi] = v;                 // ทับงบเดือนนั้นทันที
        if (old !== v) audit(actor, 'โพสต์เกิดจริง (ทับงบ)', { deptId: ref.departmentId, glCode: auditRowRef(key).glCode, month: mi + 1, oldValue: old, newValue: v });
        cells++; touched = true;
      }
      if (touched) {
        const ts = new Date().toISOString();
        a.updatedAt = ts; a.updatedBy = actor.name;
        row.updatedAt = ts; row.updatedBy = actor.name + ' (เกิดจริง/บัญชี)';
      }
      matched++;
    });
    save();
    return { matched, unmatched, cells };
  }
  // แปลงข้อความวาง (codeA หรือ CCT+GL ตามด้วยตัวเลขเดือน) → records แล้วโพสต์
  function postActualsPaste(actor, year, text) {
    assertAccounting(actor);
    const num = s => { s = String(s).replace(/[,\s]/g, ''); if (s === '') return null; const v = Number(s); return isFinite(v) ? v : null; };
    const records = [];
    text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      const cols = line.split('\t').map(s => s.trim());
      const c0 = cols[0].replace(/\s/g, '');
      const byCodeA = (db.departmentRows || []).find(x => x.codeA && x.codeA === c0);
      if (byCodeA) { records.push({ codeA: c0, months: cols.slice(1).map(num) }); return; }
      if (cols.length >= 2) {
        const byPair = (db.departmentRows || []).find(x => x.cct === c0 && gl(x.glId)?.code === cols[1]);
        if (byPair) { records.push({ cct: c0, glCode: cols[1], months: cols.slice(2).map(num) }); return; }
      }
      if (/\d{6}/.test(c0)) records.push({ codeA: c0, months: cols.slice(1).map(num) }); // ปล่อยให้ postActuals รายงานว่าจับคู่ไม่ได้
    });
    return postActuals(actor, year, records);
  }
  // หน่วยงานนี้มีเกิดจริง (โพสต์แล้ว) ในปีนี้ไหม
  function hasPostedActuals(year, deptId) {
    return (db.actuals || []).some(a => a.year === Number(year) && a.departmentId === deptId && a.months.some(v => v !== null && v !== undefined));
  }

  // ---- นำเข้าเกิดจริงจากไฟล์ SAP CA07 (จับคู่ GL + CCT เท่านั้น) — ทับงบปัจจุบัน + ล็อกช่อง ----
  // records = [{ cct, glCode, glName, m:{Jan..Oct, Nov, Dec} }]  (ค่าเป็นตัวเลข หรือ null=ข้าม)
  // กฎเดือน: Jan..Oct → ปีไฟล์ (y) ช่อง 0..9 · Nov,Dec → ปีก่อน (y-1) ช่อง 10,11
  // commit=false → dry-run (คืนแผน ไม่เขียน) · commit=true → เขียน row.months + db.actuals (ล็อก) + audit
  // autoCreate=true → สร้าง GL/แถวที่ยังไม่มี ตามแผนกที่ CCT ชี้ (แล้วใส่เกิดจริง) · CCT ที่ไม่มีในระบบเลย ยังสร้างไม่ได้ (ไม่รู้แผนก)
  function sapImport(actor, fileYear, records, commit, autoCreate) {
    assertAccounting(actor);
    const y = Number(fileYear);
    const IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    if (commit && !db.actuals) db.actuals = [];
    const matched = [], unmatchedGL = [], unknownCct = []; let cellCount = 0;
    const newGl = new Set(), newRow = new Set();
    const glGroupOf = c => { const p = String(c).slice(0, 2); if (['44', '45', '46'].includes(p)) return 'รายได้'; if (p === '51') return 'ต้นทุนอ้อย'; if (['65', '68', '75'].includes(p)) return 'ต้นทุน'; return 'ค่าใช้จ่าย'; };
    // แผนกของ CCT = แผนกที่ถือ CCT นั้น "มากสุด" (majority) — กัน CCT ที่ใช้ร่วมหลายแผนกเดาผิด
    const deptByCct = cct => {
      const cnt = {};
      (db.departmentRows || []).forEach(x => { if (x.cct === cct) cnt[x.departmentId] = (cnt[x.departmentId] || 0) + 1; });
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      if (top) return top[0];
      const cm = (db.cctMaster || []).find(c => c.code === cct); if (cm) return cm.departmentId;
      const b = db.budgets.find(x => x.cct === cct); return b ? b.departmentId : null;
    };
    (records || []).forEach(rec => {
      let g = glByCode(rec.glCode);
      let ref = actualRowRef({ cct: rec.cct, glCode: rec.glCode });
      let isNew = false;
      if (!ref && autoCreate) {
        const deptId = deptByCct(rec.cct);
        if (deptId) {
          const glId = 'g' + rec.glCode;
          if (!gl(glId) && !newGl.has(glId)) {
            newGl.add(glId);
            if (commit) { db.glAccounts.push({ id: glId, code: rec.glCode, name: rec.glName || rec.glCode, glGroup: glGroupOf(rec.glCode), ioGroup: 'ไม่คุม', active: true }); audit(actor, 'เพิ่ม GL (SAP reconcile)', { glCode: rec.glCode, newValue: rec.glName || '' }); }
          }
          if (!(db.departmentRows || []).some(x => x.departmentId === deptId && x.cct === rec.cct && x.glId === glId)) {
            newRow.add(deptId + '|' + glId + '|' + rec.cct);
            if (commit) { (db.departmentRows = db.departmentRows || []).push({ departmentId: deptId, cct: rec.cct, glId, io: '', codeA: rec.cct + rec.glCode + 'a' }); if (!db.departmentGL.some(x => x.departmentId === deptId && x.glId === glId)) db.departmentGL.push({ departmentId: deptId, glId }); }
          }
          ref = { departmentId: deptId, glId, cct: rec.cct }; isNew = true;
        }
      }
      if (!ref) {
        const cctExists = (db.departmentRows || []).some(x => x.cct === rec.cct);
        if (!g && !autoCreate) unmatchedGL.push({ cct: rec.cct, glCode: rec.glCode, glName: rec.glName, reason: 'ไม่มี GL นี้ในระบบ' });
        else if (!cctExists) unknownCct.push({ cct: rec.cct, glCode: rec.glCode, glName: rec.glName });
        else unmatchedGL.push({ cct: rec.cct, glCode: rec.glCode, glName: rec.glName, reason: 'ไม่มีคู่ GL+CCT นี้ในระบบ' });
        return;
      }
      const deptId = ref.departmentId, glId = ref.glId, cct = ref.cct, key = glId + '@' + cct;
      const cells = [];
      Object.keys(rec.m || {}).forEach(mon => {
        const mi = IDX[String(mon).slice(0, 3).toLowerCase()];
        if (mi === undefined) return;
        const v = rec.m[mon];
        if (v === null || v === undefined || !isFinite(v)) return;
        const yr = (mi >= 10) ? y - 1 : y;                 // Nov/Dec → ปีก่อน
        const existing = rowByKey(yr, deptId, key);
        cells.push({ year: yr, monthIdx: mi, oldVal: existing ? existing.months[mi] : null, newVal: v });
        if (commit) {
          let a = db.actuals.find(x => x.year === yr && x.departmentId === deptId && x.glId === glId && x.cct === cct);
          if (!a) { a = { year: yr, departmentId: deptId, glId, cct, months: Array(12).fill(null), updatedAt: null, updatedBy: null }; db.actuals.push(a); }
          const row = ensureRow(yr, deptId, key);
          const old = row.months[mi];
          a.months[mi] = v; row.months[mi] = v;            // ทับงบ + เก็บเกิดจริง (ล็อกช่อง)
          if (old !== v) audit(actor, 'นำเข้าเกิดจริง SAP (ทับงบ)', { deptId, glCode: rec.glCode, month: mi + 1, oldValue: old, newValue: v });
          const ts = new Date().toISOString(); a.updatedAt = ts; a.updatedBy = actor.name; row.updatedAt = ts; row.updatedBy = actor.name + ' (SAP เกิดจริง)';
        }
      });
      cellCount += cells.length;
      matched.push({ cct, glCode: rec.glCode, glName: rec.glName, deptId, deptName: dept(deptId)?.name, cells, created: isNew });
    });
    const created = { gls: newGl.size, rows: newRow.size };
    if (commit) { audit(actor, 'นำเข้าไฟล์ SAP CA07', { newValue: `ปี ${y}: ${matched.length} GL · ${cellCount} ช่อง · สร้างใหม่ ${created.rows} แถว / ${created.gls} GL` }); save(); }
    return { fileYear: y, matched, unmatchedGL, unknownCct, cellCount, glCount: matched.length, deptCount: new Set(matched.map(m => m.deptId)).size, created };
  }

  // ---- นำเข้าจากไฟล์ต้นฉบับ 2 ชุด: current (AM-AX) → db.budgets (งบปัจจุบัน) · original (I-T) → ORIGINAL (งบต้นปี freeze) ----
  // records = [{io,codeA,cct,glCode, current:[12], original:[12]}]
  function importDualBudget(actor, year, records, opts = {}) {
    assertAccounting(actor);
    const y = Number(year);
    const R = v => (v === null || v === undefined || !isFinite(v)) ? null : Math.round(v);
    let matched = 0, cellsCur = 0; const unmatched = [];
    const created = { depts: 0, ccts: 0, rows: 0 };
    const origMap = {};
    // แมทช์ด้วย code a เป็นหลัก (unique · เลี่ยง io ที่ซ้ำข้ามแถว) → fallback actualRowRef
    const byCodeA = {}; (db.departmentRows || []).forEach(r => { if (r.codeA) byCodeA[r.codeA] = r; });
    const matchRow = rec => (rec.codeA && byCodeA[rec.codeA]) ? byCodeA[rec.codeA] : actualRowRef(rec);
    records.forEach(rec => {
      let ref = matchRow(rec);
      // สร้างแผนก/CCT/แถว ใหม่ ถ้าไม่พบ (opts.autoCreate) — ต้องมี GL อยู่แล้ว + ระบุ CCT + รหัสแผนก
      if (!ref && opts.autoCreate && /^\d{6,7}$/.test(rec.glCode || '') && rec.cct && rec.deptCode) {
        const glId = 'g' + rec.glCode;
        if (gl(glId)) {
          let dept = db.departments.find(d => d.code === rec.deptCode);
          if (!dept) {
            const side = (rec.deptCode || '')[0] || '';
            dept = { id: 'd' + rec.deptCode, code: rec.deptCode, name: rec.deptName || rec.cctName || ('หน่วยงาน ' + rec.deptCode), nameEn: '', side, area: (db.meta.sides || {})[side] || '', active: true };
            db.departments.push(dept); created.depts++;
          }
          if (!(db.cctMaster || []).some(c => c.code === rec.cct)) { (db.cctMaster = db.cctMaster || []).push({ code: rec.cct, name: rec.cctName || '', departmentId: dept.id }); created.ccts++; }
          if (!(db.departmentRows || []).some(x => x.departmentId === dept.id && x.cct === rec.cct && x.glId === glId)) {
            (db.departmentRows = db.departmentRows || []).push({ departmentId: dept.id, cct: rec.cct, glId, io: rec.io || '', codeA: rec.codeA || '' });
            if (!db.departmentGL.some(x => x.departmentId === dept.id && x.glId === glId)) db.departmentGL.push({ departmentId: dept.id, glId });
            created.rows++;
          }
          ref = db.departmentRows.find(x => x.departmentId === dept.id && x.cct === rec.cct && x.glId === glId);
          if (ref && rec.codeA) byCodeA[rec.codeA] = ref;
        }
      }
      if (!ref) { unmatched.push(rec.codeA || ((rec.cct || '') + '/' + (rec.glCode || '')) || '?'); return; }
      const key = ref.glId + '@' + ref.cct;
      const row = ensureRow(y, ref.departmentId, key);
      const cur = rec.current || [];
      for (let i = 0; i < 12; i++) { const v = R(cur[i]); row.months[i] = (v === null ? 0 : v); if (v) cellsCur++; }
      row.updatedAt = new Date().toISOString(); row.updatedBy = actor.name + ' (นำเข้าไฟล์ต้นฉบับ)';
      origMap[ref.departmentId + '|' + ref.glId + '|' + ref.cct] = (rec.original || []).map(R);
      matched++;
    });
    // สร้าง ORIGINAL ใหม่ = I-T · แถวที่ไม่มีในไฟล์ = คงค่า ORIGINAL เดิม (ถ้ามี) ไม่งั้น 0
    const oldOrig = snapByLabel(y, 'ORIGINAL'); const oldMap = {};
    if (oldOrig) oldOrig.rows.forEach(r => { oldMap[r.departmentId + '|' + r.glId + '|' + r.cct] = r.months; });
    db.budgetSnapshots = (db.budgetSnapshots || []).filter(s => !(s.year === y && s.label === 'ORIGINAL'));
    let cellsOrig = 0;
    const origRows = db.budgets.filter(b => b.year === y).map(b => {
      const k = b.departmentId + '|' + b.glId + '|' + b.cct;
      const om = origMap[k];
      let months;
      if (om) { months = om.map(v => v === null ? 0 : v); om.forEach(v => { if (v) cellsOrig++; }); }
      else if (oldMap[k]) months = oldMap[k].slice();
      else months = Array(12).fill(0);
      return { departmentId: b.departmentId, glId: b.glId, cct: b.cct, months, mtp1: b.mtp1, mtp2: b.mtp2 };
    });
    db.budgetSnapshots.push({ year: y, label: 'ORIGINAL', takenAt: new Date().toISOString(), createdAt: new Date().toISOString(), takenBy: actor.name + ' (นำเข้าไฟล์ต้นฉบับ)', rows: origRows });
    audit(actor, 'นำเข้างบจากไฟล์ต้นฉบับ (AM-AX→ปัจจุบัน · I-T→ต้นปี)', { newValue: `ปี ${y}: ${matched} แถว · ปัจจุบัน ${cellsCur} ช่อง · ต้นปี ${cellsOrig} ช่อง · สร้างใหม่ ${created.rows} แถว` });
    save();
    return { matched, unmatched, cellsCur, cellsOrig, created };
  }

  // ---- นำเข้าจากไฟล์ V7-อนุมัติ: ORIGINAL2026=I-T · notes(BT=สมมติฐาน→assumption, BU=สาเหตุ→reason) · MTP(BV=2027,BW=2028) · งบ2025(Jan-Oct+Nov-Dec) ----
  // data = { y2026:[{codeA,cct,gl,it[12],assumption,reason,mtp1,mtp2}], b2025janoct:[{cct,gl,janOct[10]}], b2025novdec:[{codeA,nov,dec}] }
  function importV7Data(actor, data) {
    assertAccounting(actor);
    const R = v => (v === null || v === undefined || !isFinite(v)) ? 0 : Math.round(v);
    const rows = db.departmentRows || [];
    const byCodeA = {}; rows.forEach(r => { if (r.codeA) byCodeA[r.codeA] = r; });
    const byCctGl = {}; rows.forEach(r => { const gc = gl(r.glId)?.code; if (gc) byCctGl[r.cct + '|' + gc] = r; });
    const res = { orig2026: 0, notes: 0, mtp: 0, b2025: 0, unmatched2026: 0, matched2025: 0 };
    // ---- 2026: ORIGINAL=I-T · notes · MTP ----
    const origMap = {};
    (data.y2026 || []).forEach(rec => {
      const ref = (rec.codeA && byCodeA[rec.codeA]) || byCctGl[rec.cct + '|' + rec.gl];
      if (!ref) { res.unmatched2026++; return; }
      const key = ref.glId + '@' + ref.cct;
      origMap[ref.departmentId + '|' + ref.glId + '|' + ref.cct] = (rec.it || []).map(R);
      res.orig2026++;
      const reason = (rec.reason || '').trim(), assumption = (rec.assumption || '').trim();
      if (reason || assumption) {
        let n = db.glNotes.find(x => x.year === 2026 && x.departmentId === ref.departmentId && x.rowKey === key);
        if (!n) { n = { year: 2026, departmentId: ref.departmentId, rowKey: key, reason: '', assumption: '' }; db.glNotes.push(n); }
        n.reason = reason; n.assumption = assumption; res.notes++;
      }
      const m1 = R(rec.mtp1), m2 = R(rec.mtp2);
      if (m1 || m2) { const brow = ensureRow(2026, ref.departmentId, key); brow.mtp1 = m1; brow.mtp2 = m2; res.mtp++; }
    });
    // rebuild ORIGINAL 2026 = I-T (แถวที่ไม่มีในไฟล์คงค่าเดิม)
    const oldOrig = snapByLabel(2026, 'ORIGINAL'); const oldMap = {};
    if (oldOrig) oldOrig.rows.forEach(r => { oldMap[r.departmentId + '|' + r.glId + '|' + r.cct] = r.months; });
    db.budgetSnapshots = (db.budgetSnapshots || []).filter(s => !(s.year === 2026 && s.label === 'ORIGINAL'));
    const origRows = db.budgets.filter(b => b.year === 2026).map(b => {
      const k = b.departmentId + '|' + b.glId + '|' + b.cct;
      const months = origMap[k] ? origMap[k] : (oldMap[k] ? oldMap[k].slice() : Array(12).fill(0));
      return { departmentId: b.departmentId, glId: b.glId, cct: b.cct, months, mtp1: b.mtp1, mtp2: b.mtp2 };
    });
    db.budgetSnapshots.push({ year: 2026, label: 'ORIGINAL', takenAt: new Date().toISOString(), createdAt: new Date().toISOString(), takenBy: actor.name + ' (V7)', rows: origRows });
    // ---- งบ 2025 = Jan-Oct (by cct+gl) + Nov-Dec (by codeA) ----
    const joMap = {}; (data.b2025janoct || []).forEach(rec => { joMap[rec.cct + '|' + rec.gl] = (rec.janOct || []).map(R); });
    const ndMap = {}; (data.b2025novdec || []).forEach(rec => { if (rec.codeA) ndMap[rec.codeA] = [R(rec.nov), R(rec.dec)]; });
    rows.forEach(ref => {
      const gc = gl(ref.glId)?.code;
      const jo = joMap[ref.cct + '|' + gc];
      const nd = ref.codeA ? ndMap[ref.codeA] : null;
      if (!jo && !nd) return;
      const months = Array(12).fill(0);
      if (jo) for (let i = 0; i < 10; i++) months[i] = jo[i] || 0;
      if (nd) { months[10] = nd[0] || 0; months[11] = nd[1] || 0; }
      let brow = db.budgets.find(b => b.year === 2025 && b.departmentId === ref.departmentId && b.glId === ref.glId && b.cct === ref.cct);
      if (!brow) { brow = { year: 2025, departmentId: ref.departmentId, glId: ref.glId, cct: ref.cct, months: Array(12).fill(0), mtp1: null, mtp2: null, updatedAt: null, updatedBy: null }; db.budgets.push(brow); }
      brow.months = months; brow.updatedAt = new Date().toISOString(); brow.updatedBy = actor.name + ' (V7)';
      res.b2025++;
    });
    audit(actor, 'นำเข้าจากไฟล์ V7 (งบ2025 + ORIGINAL2026 + เหตุผล/สมมติฐาน/MTP)', { newValue: `2025:${res.b2025} · orig2026:${res.orig2026} · notes:${res.notes} · mtp:${res.mtp}` });
    save();
    return res;
  }

  // นำเข้า "งบ Revise" จากไฟล์ Excel: ตั้งค่างบ 12 เดือน (+MTP) ให้แถวที่จับคู่ได้ (authoritative)
  // records = [{io,codeA,cct,glCode,glName,deptCode,deptName,cctName, months:[12], mtp1, mtp2}]
  // opts.autoCreate = true → สร้างแผนก/GL/CCT/แถว ที่ยังไม่มีอัตโนมัติ (0 จับคู่ไม่ได้)
  function importBudgetFile(actor, year, records, opts = {}) {
    assertAccounting(actor);
    const y = Number(year);
    let matched = 0, cells = 0;
    const unmatched = [];
    const created = { depts: 0, gls: 0, ccts: 0, rows: 0 };
    const writeMonths = (row, mm) => {
      for (let mi = 0; mi < 12 && mi < mm.length; mi++) {
        const v = mm[mi];
        if (v === null || v === undefined || !isFinite(v)) continue;
        row.months[mi] = v; cells++;
      }
    };
    records.forEach(rec => {
      let ref = actualRowRef(rec);
      // ---- ไม่พบแถว: สร้างใหม่ถ้าเปิด autoCreate และระบุแผนกได้ ----
      if (!ref && opts.autoCreate && /^\d{6,7}$/.test(rec.glCode || '') && (rec.cct || '')) {
        // หาแผนก: จากรหัสแผนกในไฟล์ → จาก CCT ที่มีอยู่ → (ถ้ารหัสแผนกใช้ได้) สร้างใหม่
        let dept = rec.deptCode ? db.departments.find(d => d.code === rec.deptCode) : null;
        if (!dept) { const c = (db.cctMaster || []).find(x => x.code === rec.cct); if (c) dept = db.departments.find(d => d.id === c.departmentId); }
        if (!dept && /^\d{3,4}$/.test(rec.deptCode || '')) {
          dept = { id: 'd' + rec.deptCode, code: rec.deptCode, name: rec.deptName || ('แผนก ' + rec.deptCode), nameEn: '', side: rec.deptCode[0], active: true };
          db.departments.push(dept); created.depts++;
        }
        if (dept) {
          const glId = 'g' + rec.glCode;
          if (!gl(glId)) { db.glAccounts.push({ id: glId, code: rec.glCode, name: rec.glName || rec.glCode, glGroup: 'อื่นๆ', ioGroup: 'ไม่คุม', active: true }); created.gls++; }
          if (!(db.cctMaster || []).some(c => c.code === rec.cct)) { (db.cctMaster = db.cctMaster || []).push({ code: rec.cct, name: rec.cctName || '', departmentId: dept.id }); created.ccts++; }
          if (!(db.departmentRows || []).some(x => x.departmentId === dept.id && x.cct === rec.cct && x.glId === glId)) {
            (db.departmentRows = db.departmentRows || []).push({ departmentId: dept.id, cct: rec.cct, glId, io: rec.io || '', codeA: rec.codeA || '' });
            if (!db.departmentGL.some(x => x.departmentId === dept.id && x.glId === glId)) db.departmentGL.push({ departmentId: dept.id, glId });
            created.rows++;
          }
          ref = { departmentId: dept.id, cct: rec.cct, glId };
        }
      }
      if (!ref) { unmatched.push({ codeA: rec.codeA || '', io: rec.io || '', cct: rec.cct || '', gl: rec.glCode || '', deptCode: rec.deptCode || '' }); return; }
      const row = ensureRow(y, ref.departmentId, ref.glId + '@' + ref.cct);
      writeMonths(row, rec.months || []);
      if (rec.mtp1 != null && isFinite(rec.mtp1)) row.mtp1 = rec.mtp1;
      if (rec.mtp2 != null && isFinite(rec.mtp2)) row.mtp2 = rec.mtp2;
      row.updatedAt = new Date().toISOString();
      row.updatedBy = 'นำเข้าจากไฟล์ Revise';
      matched++;
    });
    audit(actor, 'นำเข้างบ Revise จากไฟล์', { newValue: `ปี ${y}: ${matched} แถว · ${cells} ช่อง · สร้างใหม่ ${created.rows} แถว` });
    save();
    return { matched, unmatched, cells, created };
  }

  // กระทบยอดไฟล์กับงบในระบบ (ไม่แก้ข้อมูล) — records = [{io,codeA,cct,glCode,deptCode,months}]
  function reconcileFile(year, records) {
    const y = Number(year);
    const res = { matched: 0, mismatch: [], fileOnly: [], appOnly: [], fileTotal: 0, appMatchedTotal: 0, appYearTotal: companyTotal(y) };
    const seenKeys = new Set();
    records.forEach(rec => {
      const fileTot = (rec.months || []).reduce((s, v) => s + (v || 0), 0);
      res.fileTotal += fileTot;
      const ref = actualRowRef(rec);
      if (!ref) { res.fileOnly.push({ id: rec.codeA || rec.io || ((rec.cct || '') + '/' + (rec.glCode || '')), dept: rec.deptCode || '', fileTot }); return; }
      const b = db.budgets.find(bb => bb.year === y && bb.departmentId === ref.departmentId && bb.glId === ref.glId && bb.cct === ref.cct);
      const appTot = b ? sum(b.months) : 0;
      res.appMatchedTotal += appTot;
      seenKeys.add(ref.departmentId + '|' + ref.glId + '|' + ref.cct);
      if (Math.abs(appTot - fileTot) < 0.5) res.matched++;
      else res.mismatch.push({ dept: dept(ref.departmentId)?.name || ref.departmentId, gl: gl(ref.glId)?.code, cct: ref.cct, app: appTot, file: fileTot, diff: fileTot - appTot });
    });
    // งบในระบบที่ไม่มีในไฟล์ (เฉพาะแถวที่มีตัวเลข)
    db.budgets.filter(b => b.year === y && b.months.some(v => v)).forEach(b => {
      if (!seenKeys.has(b.departmentId + '|' + b.glId + '|' + b.cct)) res.appOnly.push({ dept: dept(b.departmentId)?.name || b.departmentId, gl: gl(b.glId)?.code, cct: b.cct, app: sum(b.months) });
    });
    return res;
  }

  /* ---------- เปรียบเทียบ + Anomaly (rule-based) ---------- */
  function compare(cur, prev) {
    const diff = cur - prev;
    const pct = prev !== 0 ? diff / Math.abs(prev) * 100 : (cur !== 0 ? null : 0); // null = ปีก่อนเป็น 0
    return { cur, prev, diff, pct };
  }
  function glAnomaly(cmp) {
    if (cmp.prev > 0 && cmp.cur === 0) return { level: 'critical', tag: 'Budget Removed',  msg: 'ปีก่อนมีงบประมาณ แต่ปีนี้เป็นศูนย์' };
    if (cmp.prev === 0 && cmp.cur > 0) return { level: 'warning',  tag: 'New Budget',      msg: 'ปีก่อนไม่มีงบประมาณ แต่ปีนี้ตั้งงบใหม่' };
    if (cmp.pct !== null && cmp.pct >= 100) return { level: 'critical', tag: 'Significant Increase', msg: `งบประมาณเพิ่มขึ้น ${cmp.pct.toFixed(0)}% จากปีก่อน` };
    if (cmp.pct !== null && cmp.pct >= 50)  return { level: 'warning',  tag: 'High Increase',        msg: `งบประมาณเพิ่มขึ้น ${cmp.pct.toFixed(0)}% จากปีก่อน` };
    if (cmp.pct !== null && cmp.pct <= -50) return { level: 'warning',  tag: 'Significant Decrease', msg: `งบประมาณลดลง ${Math.abs(cmp.pct).toFixed(0)}% จากปีก่อน` };
    return null;
  }
  function deptAnomalies(year, deptId) {
    const prevYear = Number(year) - 1;
    const out = [];
    deptGLs(deptId).forEach(g => {
      const cmp = compare(glTotal(year, deptId, g.id), glTotal(prevYear, deptId, g.id));
      const an = glAnomaly(cmp);
      if (an) out.push({ deptId, gl: g, cmp, ...an });
    });
    return out;
  }

  /* ---------- validation ก่อน Submit ---------- */
  const MONTH_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  function validate(year, deptId) {
    const errors = [], warnings = [];
    deptRows(deptId).forEach(r => {
      const label = `GL ${r.gl.code}${r.multiCct ? ` (${r.cctName})` : ''}`;
      const m = rowMonths(year, deptId, r.key);
      m.forEach((v, i) => {
        if (v === null || v === undefined) errors.push(`${label} — ${MONTH_TH[i]} ยังไม่ได้กรอก`);
        else if (v < 0) errors.push(`${label} — ${MONTH_TH[i]} เป็นตัวเลขติดลบ (${v})`);
      });
      const row = rowByKey(year, deptId, r.key);
      if (!row || row.mtp1 === null || row.mtp1 === undefined) errors.push(`${label} — งบปี ${Number(year) + 1} (MTP) ยังไม่ได้กรอก`);
      if (!row || row.mtp2 === null || row.mtp2 === undefined) errors.push(`${label} — งบปี ${Number(year) + 2} (MTP) ยังไม่ได้กรอก`);
    });
    // ตรวจผิดปกติระดับ GL (roll-up) + เหตุผล
    deptGLs(deptId).forEach(g => {
      const cmp = compare(glTotal(year, deptId, g.id), glTotal(Number(year) - 1, deptId, g.id));
      const an = glAnomaly(cmp);
      if (an) {
        warnings.push(`GL ${g.code} ${g.name}: ${an.msg}`);
        if (!note(year, deptId, g.id).reason.trim()) warnings.push(`GL ${g.code} มีการเปลี่ยนแปลงผิดปกติ แต่ยังไม่ได้ระบุสาเหตุเพิ่ม/ลด`);
      }
    });
    // กติการอบ Revise: แถวที่ยอดต่างจากงบเดิม ต้องมีเหตุผลการ revise + ห้ามต่ำกว่าเกิดจริง
    const rv = revisePhase(year);
    if (rv.on && snapshotFor(year)) {
      deptRows(deptId).forEach(r => {
        const label = `GL ${r.gl.code}${r.multiCct ? ` (${r.cctName})` : ''}`;
        const cur = rowTotal(year, deptId, r.key);
        const orig = originalRowTotal(year, deptId, r.key);
        if (Math.abs(cur - orig) > 0.005 && !note(year, deptId, r.key).reason.trim()) {
          errors.push(`${label} — ยอด Revise ต่างจากงบเดิม (${(cur - orig >= 0 ? '+' : '') + Math.round(cur - orig).toLocaleString()} กีบ) ต้องระบุเหตุผลการ revise`);
        }
        const floorAct = actualMonths(year, deptId, r.key)[rv.thru - 1];
        const m = rowMonths(year, deptId, r.key);
        if (floorAct !== null && m[rv.thru - 1] !== null && m[rv.thru - 1] < floorAct) {
          errors.push(`${label} — เดือน ${rv.thru} ต่ำกว่าเกิดจริง (${Math.round(floorAct).toLocaleString()} กีบ)`);
        }
      });
    }
    return { errors, warnings, ok: errors.length === 0 };
  }

  /* ---------- helpers สิทธิ์ ---------- */
  function assertUserCanEdit(actor, year, deptId) {
    if (!actor) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
    if (actor.role !== 'USER') throw new Error('Accounting/Admin ไม่มีสิทธิ์แก้ไขตัวเลขงบประมาณของหน่วยงาน — หากข้อมูลผิดให้ตีกลับสถานะ Need Revision เพื่อให้หน่วยงานแก้ไขเอง');
    if (actor.departmentId !== deptId) throw new Error('แก้ไขได้เฉพาะข้อมูลของหน่วยงานตนเองเท่านั้น');
    const p = period(year);
    const st = deptState(year, deptId).status;
    // ถูกตีกลับ (NEED_REVISION) = ปลดล็อก "เฉพาะหน่วยงานนี้" แม้รอบทั้งปีปิด/Lock แล้ว — หน่วยงานอื่นยังล็อกตามเดิม
    if (!p || (p.status !== 'OPEN' && st !== 'NEED_REVISION')) throw new Error(`รอบงบประมาณปี ${year} ปิดแล้ว ไม่สามารถแก้ไขได้`);
    if (st === 'SUBMITTED') throw new Error('ส่งข้อมูลให้แผนกบัญชีแล้ว — แก้ไขได้เมื่อถูกตีกลับ (Need Revision) เท่านั้น');
    if (st === 'LOCKED') throw new Error('งบประมาณถูก Lock แล้ว ไม่สามารถแก้ไขได้');
  }
  function assertAccounting(actor) {
    if (!actor || actor.role !== 'ACCOUNTING') throw new Error('ต้องเป็น Accounting/Admin เท่านั้น');
  }
  function canEdit(actor, year, deptId) {
    try { assertUserCanEdit(actor, year, deptId); return true; } catch (e) { return false; }
  }

  /* ---------- mutations: USER (ระดับแถว CCT×GL — พารามิเตอร์ rowKey) ---------- */
  function ensureRow(year, deptId, rowKey) {
    let row = rowByKey(year, deptId, rowKey);
    if (!row) {
      const [glId, cct] = splitKey(rowKey);
      row = { year: Number(year), departmentId: deptId, glId, cct, months: Array(12).fill(null), mtp1: null, mtp2: null, updatedAt: null, updatedBy: null };
      db.budgets.push(row);
    }
    return row;
  }
  const auditRowRef = rowKey => {
    const [glId, cct] = splitKey(rowKey);
    return { glCode: gl(glId)?.code || glId, cctTail: cct.slice(-4) };
  };
  function setCell(actor, year, deptId, rowKey, monthIdx, value) {
    assertUserCanEdit(actor, year, deptId);
    if (value !== null && (typeof value !== 'number' || !isFinite(value))) throw new Error('ค่าไม่ถูกต้อง');
    // กติการอบ Revise: เดือนที่มีเกิดจริงถูกล็อก · เดือนสุดท้ายของเกิดจริงเป็น "พื้น" (เพิ่มได้ ลดไม่ได้)
    const rv = revisePhase(year);
    // เกิดจริงที่แผนกบัญชีอัปโหลด (postActuals) = ล็อกทันทีทุกโหมด · ยกเว้นเดือน "พื้น" ของรอบ Revise ที่ยังเพิ่มได้
    const postedVal = actualMonths(year, deptId, rowKey)[monthIdx];
    const isReviseFloor = rv.on && monthIdx === rv.thru - 1;
    if (postedVal !== null && postedVal !== undefined && !isReviseFloor)
      throw new Error(`เดือน ${monthIdx + 1} เป็นตัวเลขเกิดจริงที่แผนกบัญชีอัปโหลด — ล็อก แก้ไขไม่ได้`);
    if (rv.on) {
      if (monthIdx < rv.thru - 1) throw new Error(`เดือน ${monthIdx + 1} เป็นตัวเลขเกิดจริง (ล็อกโดยแผนกบัญชี) แก้ไขไม่ได้`);
      if (monthIdx === rv.thru - 1) {
        const act = actualMonths(year, deptId, rowKey)[monthIdx];
        if (act !== null && (value === null || value < act)) {
          throw new Error(`เดือน ${monthIdx + 1} มีเกิดจริง ${Math.round(act).toLocaleString()} กีบแล้ว — กรอกต่ำกว่านั้นไม่ได้ (เพิ่มได้เท่านั้น)`);
        }
      }
    }
    const row = ensureRow(year, deptId, rowKey);
    if (row.notUsed) throw new Error('แถวนี้ถูกทำเครื่องหมาย "ไม่ได้ใช้" — กดปุ่ม ↩ เพื่อกลับมากรอกก่อน');
    const old = row.months[monthIdx];
    if (old === value) return false;
    row.months[monthIdx] = value;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    audit(actor, 'แก้ไขงบประมาณ', { deptId, glCode: auditRowRef(rowKey).glCode, month: monthIdx + 1, oldValue: old, newValue: value });
    const st = deptState(year, deptId);
    if (st.status === 'DRAFT') setStatusInternal(year, deptId, 'IN_PROGRESS');
    save();
    return true;
  }
  // แอดมินแก้งบรายเดือนของหน่วยงานใดก็ได้ (ข้ามการล็อก/สถานะ) — บันทึก Audit Log ทุกครั้ง
  function adminSetCell(actor, year, deptId, rowKey, monthIdx, value) {
    assertAccounting(actor);
    if (value !== null && (typeof value !== 'number' || !isFinite(value))) throw new Error('ค่าไม่ถูกต้อง');
    const row = ensureRow(year, deptId, rowKey);
    const old = row.months[monthIdx];
    if (old === value) return false;
    row.months[monthIdx] = value;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name + ' (แอดมินแก้)';
    audit(actor, 'แอดมินแก้งบประมาณ', { deptId, glCode: auditRowRef(rowKey).glCode, month: monthIdx + 1, oldValue: old, newValue: value });
    save();
    return true;
  }
  function setMtp(actor, year, deptId, rowKey, which, value) { // which: 1 | 2
    assertUserCanEdit(actor, year, deptId);
    if (value !== null && (typeof value !== 'number' || !isFinite(value))) throw new Error('ค่าไม่ถูกต้อง');
    const row = ensureRow(year, deptId, rowKey);
    if (row.notUsed) throw new Error('แถวนี้ถูกทำเครื่องหมาย "ไม่ได้ใช้" — กดปุ่ม ↩ เพื่อกลับมากรอกก่อน');
    const key = which === 1 ? 'mtp1' : 'mtp2';
    const old = row[key];
    if (old === value) return false;
    row[key] = value;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    audit(actor, `แก้ไขงบ MTP ปี ${Number(year) + which}`, { deptId, glCode: auditRowRef(rowKey).glCode, oldValue: old, newValue: value });
    save();
    return true;
  }
  // mtp: รับ rowKey (มี '@') = ของแถว หรือ glId = รวมทุก CCT (null ถ้ายังไม่กรอกครบทุกแถว)
  function mtp(year, deptId, keyOrGl) {
    const k = String(keyOrGl);
    if (k.includes('@')) {
      const r = rowByKey(year, deptId, k);
      return { mtp1: r?.mtp1 ?? null, mtp2: r?.mtp2 ?? null };
    }
    const rows = db.budgets.filter(b => b.year === Number(year) && b.departmentId === deptId && b.glId === k);
    if (!rows.length) return { mtp1: null, mtp2: null };
    const agg = which => rows.some(r => r[which] === null || r[which] === undefined)
      ? null : rows.reduce((s, r) => s + r[which], 0);
    return { mtp1: agg('mtp1'), mtp2: agg('mtp2') };
  }

  /* ---------- งบสมมติฐาน 3 เคส (Base / Best / Worst) — แยกจาก MTP เดิม ----------
   * offs = จำนวนปีนับจากปีงบ (year+off): Base = +2,+3 · Best/Worst = +1,+2,+3
   * เก็บใน budget row: row.sc = { base:[..], best:[..], worst:[..] } (อาเรย์เรียงตาม offs) */
  const SCEN_DEF = [
    { key: 'base',  label: 'Base Case',  offs: [2, 3] },
    { key: 'best',  label: 'Best Case',  offs: [1, 2, 3] },
    { key: 'worst', label: 'Worst Case', offs: [1, 2, 3] },
  ];
  const scenDef = scKey => SCEN_DEF.find(s => s.key === scKey);
  function scenarioVal(year, deptId, rowKey, scKey, off) {
    const row = rowByKey(year, deptId, rowKey);
    const def = scenDef(scKey);
    if (!row || !row.sc || !row.sc[scKey] || !def) return null;
    const idx = def.offs.indexOf(off);
    return idx >= 0 && row.sc[scKey][idx] != null ? row.sc[scKey][idx] : null;
  }
  function setScenario(actor, year, deptId, rowKey, scKey, off, value) {
    assertUserCanEdit(actor, year, deptId);
    if (value !== null && (typeof value !== 'number' || !isFinite(value))) throw new Error('ค่าไม่ถูกต้อง');
    const def = scenDef(scKey);
    const idx = def ? def.offs.indexOf(off) : -1;
    if (idx < 0) throw new Error('สมมติฐานไม่ถูกต้อง');
    const row = ensureRow(year, deptId, rowKey);
    if (row.notUsed) throw new Error('แถวนี้ถูกทำเครื่องหมาย "ไม่ได้ใช้" — กดปุ่ม ↩ เพื่อกลับมากรอกก่อน');
    if (!row.sc) row.sc = {};
    if (!row.sc[scKey]) row.sc[scKey] = def.offs.map(() => null);
    const old = row.sc[scKey][idx] ?? null;
    if (old === value) return false;
    row.sc[scKey][idx] = value;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    audit(actor, `แก้ไขงบสมมติฐาน ${def.label} ปี ${Number(year) + off}`, { deptId, glCode: auditRowRef(rowKey).glCode, oldValue: old, newValue: value });
    save();
    return true;
  }
  /* ---------- รายละเอียดค่าใช้จ่ายรายช่อง (breakdown ต่อ GL×เดือน) ----------
   * เก็บถาวรใน db.cellDetails — ตรวจย้อนหลังได้แม้งบถูก Lock แล้ว */
  function cellDetail(year, deptId, rowKey, monthIdx) {
    return (db.cellDetails || []).find(x =>
      x.year === Number(year) && x.departmentId === deptId && x.rowKey === rowKey && x.month === monthIdx) || null;
  }
  function setCellDetail(actor, year, deptId, rowKey, monthIdx, items) {
    assertUserCanEdit(actor, year, deptId);
    if (!db.cellDetails) db.cellDetails = [];
    const clean = (items || [])
      .map(it => ({ desc: String(it.desc || '').trim(), amount: it.amount }))
      .filter(it => typeof it.amount === 'number' && isFinite(it.amount));
    const idx = db.cellDetails.findIndex(x =>
      x.year === Number(year) && x.departmentId === deptId && x.rowKey === rowKey && x.month === monthIdx);
    if (!clean.length) {
      // ไม่มีรายการ = ลบรายละเอียดทิ้ง (ตัวเลขในช่องคงเดิม)
      if (idx >= 0) {
        db.cellDetails.splice(idx, 1);
        audit(actor, 'ลบรายละเอียดค่าใช้จ่าย', { deptId, glCode: auditRowRef(rowKey).glCode, month: monthIdx + 1 });
        save();
      }
      return { cleared: true };
    }
    const sum = clean.reduce((s, it) => s + it.amount, 0);
    setCell(actor, year, deptId, rowKey, monthIdx, sum); // ลงยอดรวมในช่องหลัก (audit + สถานะ อัตโนมัติ)
    const rec = { year: Number(year), departmentId: deptId, rowKey, month: monthIdx,
                  items: clean, updatedAt: new Date().toISOString(), updatedBy: actor.name };
    if (idx >= 0) db.cellDetails[idx] = rec; else db.cellDetails.push(rec);
    audit(actor, 'บันทึกรายละเอียดค่าใช้จ่าย', { deptId, glCode: auditRowRef(rowKey).glCode, month: monthIdx + 1,
      newValue: clean.length + ' รายการ รวม ' + Math.round(sum).toLocaleString() + ' กีบ' });
    save();
    return { sum, count: clean.length };
  }

  const NOT_USED_REASON = 'ไม่ได้ใช้ GL นี้ในปีงบประมาณนี้';
  function glNotUsed(year, deptId, rowKey) {
    return !!rowByKey(year, deptId, rowKey)?.notUsed;
  }
  function setGlNotUsed(actor, year, deptId, rowKey, flag) {
    assertUserCanEdit(actor, year, deptId);
    if (revisePhase(year).on && flag) throw new Error('ช่วงรอบ Revise ไม่สามารถทำเครื่องหมาย "ไม่ได้ใช้" ได้ (มีตัวเลขเกิดจริงล็อกอยู่)');
    const row = ensureRow(year, deptId, rowKey);
    if (!!row.notUsed === !!flag) return;
    let n = db.glNotes.find(x => x.year === Number(year) && x.departmentId === deptId && x.rowKey === rowKey);
    const ref = auditRowRef(rowKey);
    if (flag) {
      row.stash = { months: row.months.slice(), mtp1: row.mtp1, mtp2: row.mtp2 };
      row.months = Array(12).fill(0);
      row.mtp1 = 0; row.mtp2 = 0; row.notUsed = true;
      if (!n) { n = { year: Number(year), departmentId: deptId, rowKey, reason: '', assumption: '' }; db.glNotes.push(n); }
      if (!n.reason.trim()) n.reason = NOT_USED_REASON;
      audit(actor, 'ทำเครื่องหมาย "ไม่ได้ใช้ GL นี้"', { deptId, glCode: ref.glCode });
    } else {
      row.notUsed = false;
      if (row.stash) {
        row.months = row.stash.months; row.mtp1 = row.stash.mtp1; row.mtp2 = row.stash.mtp2;
        delete row.stash;
      }
      if (n && n.reason === NOT_USED_REASON) n.reason = '';
      audit(actor, 'ยกเลิก "ไม่ได้ใช้ GL นี้" กลับมากรอก', { deptId, glCode: ref.glCode });
    }
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    if (deptState(year, deptId).status === 'DRAFT') setStatusInternal(year, deptId, 'IN_PROGRESS');
    save();
  }
  function setNote(actor, year, deptId, rowKey, reason, assumption) {
    assertUserCanEdit(actor, year, deptId);
    let n = db.glNotes.find(x => x.year === Number(year) && x.departmentId === deptId && x.rowKey === rowKey);
    if (!n) { n = { year: Number(year), departmentId: deptId, rowKey, reason: '', assumption: '' }; db.glNotes.push(n); }
    const changed = n.reason !== reason || n.assumption !== assumption;
    n.reason = reason; n.assumption = assumption;
    if (changed) audit(actor, 'แก้ไขสาเหตุ/สมมติฐาน', { deptId, glCode: auditRowRef(rowKey).glCode, newValue: (reason || assumption || '').slice(0, 120) });
    save();
  }
  function setStatusInternal(year, deptId, status, extra = {}) {
    let s = db.deptStatus.find(x => x.year === Number(year) && x.departmentId === deptId);
    if (!s) { s = { year: Number(year), departmentId: deptId, status: 'DRAFT', submittedAt: null, revisionNote: null }; db.deptStatus.push(s); }
    Object.assign(s, { status }, extra);
    return s;
  }
  function submit(actor, year) {
    const deptId = actor.departmentId;
    assertUserCanEdit(actor, year, deptId);
    const v = validate(year, deptId);
    if (!v.ok) throw new Error('ข้อมูลยังไม่ครบถ้วน: ' + v.errors[0] + (v.errors.length > 1 ? ` (และอีก ${v.errors.length - 1} รายการ)` : ''));
    setStatusInternal(year, deptId, 'SUBMITTED', { submittedAt: new Date().toISOString(), revisionNote: null });
    audit(actor, 'Submit งบประมาณ', { deptId, newValue: `ปี ${year}` });
    notify({ role: 'ACCOUNTING' }, `${dept(deptId).name} ส่งงบประมาณปี ${year} แล้ว (ยอดรวม ${Math.round(deptTotal(year, deptId)).toLocaleString()} กีบ)`);
    save();
  }

  function clearDeptYear(actor, year, deptId) {
    // ล้างข้อมูลที่กรอกทั้งปีของหน่วยงานตนเอง (เดือน + MTP + เหตุผล + รายละเอียด) → ฟอร์มเปล่า
    assertUserCanEdit(actor, year, deptId);
    if (revisePhase(year).on) throw new Error('ช่วงรอบ Revise ไม่สามารถล้างข้อมูลทั้งปีได้ (มีตัวเลขเกิดจริงล็อกอยู่)');
    const y = Number(year);
    db.budgets.filter(b => b.year === y && b.departmentId === deptId).forEach(row => {
      row.months = Array(12).fill(null);
      row.mtp1 = null; row.mtp2 = null;
      row.notUsed = false; delete row.stash;
      row.updatedAt = new Date().toISOString(); row.updatedBy = actor.name;
    });
    db.glNotes = db.glNotes.filter(n => !(n.year === y && n.departmentId === deptId));
    db.cellDetails = (db.cellDetails || []).filter(x => !(x.year === y && x.departmentId === deptId));
    setStatusInternal(y, deptId, 'DRAFT', { submittedAt: null, revisionNote: null });
    audit(actor, 'ล้างข้อมูลงบประมาณทั้งปี', { deptId, newValue: `ปี ${y}` });
    save();
  }

  function clearAllDeptYear(actor, year) {
    // แอดมินล้างข้อมูลที่กรอกของ "ทุกหน่วยงาน" ในปีที่ระบุ → ฟอร์มเปล่า (ใช้ล้าง mock ก่อนเปิดกรอกจริง)
    assertAccounting(actor);
    const y = Number(year);
    let cleared = 0;
    db.budgets.filter(b => b.year === y).forEach(row => {
      row.months = Array(12).fill(null);
      row.mtp1 = null; row.mtp2 = null;
      row.notUsed = false; delete row.stash;
      row.updatedAt = new Date().toISOString(); row.updatedBy = actor.name;
      cleared++;
    });
    db.departments.forEach(d => setStatusInternal(y, d.id, 'DRAFT', { submittedAt: null, revisionNote: null }));
    db.glNotes = db.glNotes.filter(n => n.year !== y);
    db.cellDetails = (db.cellDetails || []).filter(x => x.year !== y);
    audit(actor, 'ล้างข้อมูลจำลองทุกหน่วยงาน', { newValue: `ปี ${y} (${cleared} รายการ GL)` });
    save();
    return cleared;
  }

  // ล้าง mock ให้เป็นฟอร์มเปล่าทั้งหมด: งบ 12 เดือน→ว่าง + ปิด revise + ลบเกิดจริง/snapshot/เหตุผล → พร้อมกรอกจริง
  function clearMock(actor, year) {
    assertAccounting(actor);
    const y = Number(year);
    const p = period(y);
    if (p) { delete p.phase; delete p.actualThru; delete p.reviseOpenedAt; delete p.reviseOpenedBy; p.status = 'OPEN'; }
    let cleared = 0;
    db.budgets.filter(b => b.year === y).forEach(row => {
      row.months = Array(12).fill(null);
      row.mtp1 = null; row.mtp2 = null; row.notUsed = false; delete row.stash;
      row.updatedAt = new Date().toISOString(); row.updatedBy = actor.name;
      cleared++;
    });
    db.glNotes = db.glNotes.filter(n => n.year !== y);
    db.cellDetails = (db.cellDetails || []).filter(x => x.year !== y);
    db.actuals = (db.actuals || []).filter(a => a.year !== y);
    db.budgetSnapshots = (db.budgetSnapshots || []).filter(s => s.year !== y);
    db.departments.forEach(d => setStatusInternal(y, d.id, 'DRAFT', { submittedAt: null, revisionNote: null }));
    audit(actor, 'ล้าง mock เป็นฟอร์มเปล่าทั้งหมด', { newValue: `ปี ${y} (${cleared} รายการ)` });
    save();
    return cleared;
  }

  /* ---------- mutations: ACCOUNTING ---------- */
  function needRevision(actor, year, deptId, noteMsg) {
    assertAccounting(actor);
    setStatusInternal(year, deptId, 'NEED_REVISION', { revisionNote: noteMsg || null });
    audit(actor, 'ตีกลับให้แก้ไข (Need Revision)', { deptId, newValue: noteMsg });
    notify({ deptId }, `งบประมาณปี ${year} ถูกส่งกลับให้แก้ไข${noteMsg ? ' — ' + noteMsg : ''}`);
    save();
  }
  // ตีกลับหลายแผนกพร้อมกัน (เลือกเอง หรือยกฝ่าย) — เหตุผลเดียวใช้กับทุกแผนกที่เลือก
  function needRevisionBulk(actor, year, deptIds, noteMsg) {
    assertAccounting(actor);
    const y = Number(year);
    const ids = [...new Set(deptIds)].filter(id => dept(id));
    if (!ids.length) throw new Error('ไม่มีแผนกที่เลือก');
    ids.forEach(id => {
      setStatusInternal(y, id, 'NEED_REVISION', { revisionNote: noteMsg || null });
      notify({ deptId: id }, `งบประมาณปี ${y} ถูกส่งกลับให้แก้ไข${noteMsg ? ' — ' + noteMsg : ''}`);
    });
    audit(actor, 'ตีกลับหลายแผนกพร้อมกัน', { newValue: `ปี ${y} · ${ids.length} แผนก: ${ids.map(id => dept(id)?.code).join(', ')}${noteMsg ? ' — ' + noteMsg : ''}` });
    save();
    return ids.length;
  }
  // ล็อกคืน "รายแผนก" หลังแผนกที่ถูกตีกลับแก้ไขและส่งใหม่แล้ว (รอบทั้งปียังปิดตามเดิม)
  function lockDept(actor, year, deptId) {
    assertAccounting(actor);
    setStatusInternal(year, deptId, 'LOCKED');
    audit(actor, 'ล็อกหน่วยงานคืน (หลังแก้ไข)', { deptId, newValue: `ปี ${year}` });
    notify({ deptId }, `งบประมาณปี ${year} ผ่านการตรวจแล้ว — ล็อกเรียบร้อย`);
    save();
  }
  // ---- สายอนุมัติผู้จัดการฝ่าย (SoD): รับรอง / ตีกลับ เฉพาะแผนกใน subtree ตน ----
  function assertMgrScope(actor, deptId) {
    if (actor.role !== 'MANAGER') throw new Error('เฉพาะผู้จัดการฝ่ายเท่านั้น');
    if (!subtreeDeptCodes(actor.orgUnit).includes(dept(deptId)?.code)) throw new Error('แผนกนี้อยู่นอกฝ่ายที่ท่านดูแล');
  }
  function mgrApprove(actor, year, deptId) {
    assertMgrScope(actor, deptId);
    const st = deptState(year, deptId).status;
    if (st !== 'SUBMITTED') throw new Error('รับรองได้เฉพาะแผนกที่ "ส่งแล้ว รอตรวจ"');
    setStatusInternal(year, deptId, 'ENDORSED', { endorsedAt: new Date().toISOString(), endorsedBy: actor.name });
    audit(actor, 'ผู้จัดการฝ่ายรับรองงบ', { deptId, newValue: `ปี ${year}` });
    notify({ role: 'ACCOUNTING' }, `${dept(deptId).name} ผ่านการรับรองจาก ${actor.name} — รอบัญชีล็อก`);
    save();
  }
  function mgrReturn(actor, year, deptId, noteMsg) {
    assertMgrScope(actor, deptId);
    setStatusInternal(year, deptId, 'NEED_REVISION', { revisionNote: noteMsg || null });
    audit(actor, 'ผู้จัดการฝ่ายตีกลับงบ', { deptId, newValue: noteMsg });
    notify({ deptId }, `งบประมาณปี ${year} ถูกผู้จัดการฝ่ายส่งกลับให้แก้ไข${noteMsg ? ' — ' + noteMsg : ''}`);
    save();
  }
  function lockPeriod(actor, year) {
    assertAccounting(actor);
    const p = period(year);
    if (!p) throw new Error('ไม่พบรอบงบประมาณ');
    const wasPhase = p.phase; // REVISE / LANDING (ถ้ากำลังปิดหลังรอบแก้)
    const froze = ensureOriginal(year, actor); // freeze แผน ORIGINAL ณ อนุมัติ (ครั้งแรกเท่านั้น)
    // auto-snapshot: ปิดหลัง Revise/Landing → เก็บเวอร์ชันผลลัพธ์ของรอบนั้นไว้เทียบ
    if (wasPhase) takeSnapshot(null, year, (wasPhase === 'LANDING' ? 'ปิดยอด (Landing) ' : 'Revise ') + new Date().toISOString().slice(0, 10));
    p.status = 'CLOSED'; p.lockedAt = new Date().toISOString(); p.lockedBy = actor.name;
    delete p.phase; delete p.actualThru; // ปิดโหมด Revise/Landing — ตัวเลขถูกอนุมัติแล้ว (ORIGINAL คงไว้)
    activeDepartments().forEach(d => {
      setStatusInternal(year, d.id, 'LOCKED');
      notify({ deptId: d.id }, `รอบงบประมาณปี ${year} ถูกปิดและ Lock แล้ว ไม่สามารถแก้ไขข้อมูลได้`);
    });
    audit(actor, 'Lock รอบงบประมาณ', { newValue: `ปี ${year}${froze ? ' (freeze แผน ORIGINAL)' : ''}` });
    save();
  }
  function unlockPeriod(actor, year) {
    assertAccounting(actor); // สิทธิ์พิเศษ — UI บังคับยืนยัน 2 ชั้น
    const p = period(year);
    if (!p) throw new Error('ไม่พบรอบงบประมาณ');
    p.status = 'OPEN'; p.lockedAt = null; p.lockedBy = null;
    delete p.phase; delete p.actualThru;   // ออกจากโหมด Revise/Landing ด้วย — กลับสู่รอบเปิดปกติ (เทียบปีก่อน)
    // เปิดให้ทุกหน่วยงานกลับมาแก้ไขได้ (LOCKED/SUBMITTED/ENDORSED → กำลังจัดทำ) แล้วส่งใหม่
    activeDepartments().forEach(d => {
      const s = deptState(year, d.id);
      if (['LOCKED', 'SUBMITTED', 'ENDORSED'].includes(s.status)) setStatusInternal(year, d.id, 'IN_PROGRESS', { submittedAt: null });
    });
    audit(actor, 'Unlock รอบงบประมาณ (สิทธิ์พิเศษ)', { newValue: `ปี ${year} — เปิดให้หน่วยงานแก้ไขได้` });
    save();
  }
  function openPeriod(actor, year) {
    assertAccounting(actor);
    if (period(year)) throw new Error(`มีรอบงบประมาณปี ${year} อยู่แล้ว`);
    db.budgetPeriods.push({ year: Number(year), status: 'OPEN', openedAt: new Date().toISOString(), lockedAt: null, lockedBy: null });
    db.budgetPeriods.sort((a, b) => a.year - b.year);
    audit(actor, 'เปิดรอบงบประมาณ', { newValue: `ปี ${year}` });
    activeDepartments().forEach(d => notify({ deptId: d.id }, `เปิดรอบจัดทำงบประมาณปี ${year} แล้ว เริ่มกรอกข้อมูลได้`));
    save();
  }
  // เปิดรอบตั้งงบปีใหม่: (A) ปิดยอดปีปัจจุบัน = revise (เกิดจริง N เดือน + คาดการณ์ที่เหลือ)
  //                     (B) เปิดรอบงบปีใหม่ 12 เดือน (pre-fill: 'landing' คัดลอกจากปิดยอดปีปัจจุบัน หรือ 'blank')
  // ลบรอบงบทั้งปี (งบ+สถานะ+สมมติฐาน+รายละเอียด+เกิดจริง+snapshot) — เฉพาะปีปัจจุบัน/ปีที่เปิดใหม่
  function deletePeriod(actor, year) {
    assertAccounting(actor);
    year = Number(year);
    if (!db.budgetPeriods.find(p => p.year === year)) throw new Error('ไม่พบรอบงบประมาณปีนี้');
    if (db.budgetPeriods.length <= 1) throw new Error('ต้องมีรอบงบอย่างน้อย 1 ปี — ลบรอบสุดท้ายไม่ได้');
    if (year < db.meta.yearCurrent) throw new Error(`ปี ${year} เป็นปีฐาน/ปีที่อนุมัติแล้ว — ลบได้เฉพาะรอบปีปัจจุบันหรือปีที่เปิดใหม่ (≥ ${db.meta.yearCurrent})`);
    const nRows = db.budgets.filter(b => b.year === year).length;
    db.budgetPeriods = db.budgetPeriods.filter(p => p.year !== year);
    db.budgets = db.budgets.filter(b => b.year !== year);
    db.deptStatus = (db.deptStatus || []).filter(s => s.year !== year);
    db.glNotes = (db.glNotes || []).filter(n => n.year !== year);
    db.cellDetails = (db.cellDetails || []).filter(c => c.year !== year);
    db.actuals = (db.actuals || []).filter(a => a.year !== year);
    db.budgetSnapshots = (db.budgetSnapshots || []).filter(s => s.year !== year);
    if (db.meta.yearCurrent === year) {           // ลบปีปัจจุบัน → ถอยไปปีล่าสุดที่เหลือ
      const remain = db.budgetPeriods.map(p => p.year).sort((a, b) => b - a);
      db.meta.yearCurrent = remain[0];
      db.meta.yearPrevious = remain[1] != null ? remain[1] : remain[0] - 1;
    }
    audit(actor, 'ลบรอบงบประมาณ', { newValue: `ลบปี ${year} (${nRows} แถวงบ + สถานะ/สมมติฐาน/เกิดจริง/snapshot)` });
    save();
  }

  function openBudgetRound(actor, curYear, thru, nextYear, prefill) {
    assertAccounting(actor);
    curYear = Number(curYear); nextYear = Number(nextYear); thru = Number(thru);
    if (nextYear <= curYear) throw new Error('ปีใหม่ต้องมากกว่าปีปัจจุบัน');
    // (A) ปิดยอดปีปัจจุบัน = phase LANDING (เกิดจริง N เดือน + คาดการณ์ที่เหลือ, เทียบ ORIGINAL)
    if (!revisePhase(curYear).on) openRevise(actor, curYear, thru, 'LANDING');
    // (B) รอบปีใหม่
    if (!period(nextYear)) { db.budgetPeriods.push({ year: nextYear, status: 'OPEN', openedAt: new Date().toISOString(), lockedAt: null, lockedBy: null }); db.budgetPeriods.sort((a, b) => a.year - b.year); }
    const p = period(nextYear); p.status = 'OPEN'; delete p.phase; delete p.actualThru;
    let created = 0;
    (db.departmentRows || []).forEach(x => {
      let b = db.budgets.find(bb => bb.year === nextYear && bb.departmentId === x.departmentId && bb.glId === x.glId && bb.cct === x.cct);
      if (!b) { b = { year: nextYear, departmentId: x.departmentId, glId: x.glId, cct: x.cct, months: Array(12).fill(null), mtp1: null, mtp2: null, updatedAt: null, updatedBy: null }; db.budgets.push(b); created++; }
      if (prefill === 'landing') {
        const cur = db.budgets.find(bb => bb.year === curYear && bb.departmentId === x.departmentId && bb.glId === x.glId && bb.cct === x.cct);
        if (cur) { b.months = cur.months.map(v => v); b.updatedBy = 'pre-fill จากปิดยอด ' + curYear; }
      }
    });
    activeDepartments().forEach(d => setStatusInternal(nextYear, d.id, 'DRAFT', { submittedAt: null, revisionNote: null }));
    // ปีใหม่กลายเป็นปีงบปัจจุบัน
    db.meta.yearPrevious = curYear;
    db.meta.yearCurrent = nextYear;
    audit(actor, 'เปิดรอบตั้งงบปีใหม่', { newValue: `ปิดยอด ${curYear} (เกิดจริงถึง ด.${thru}) + เปิดงบ ${nextYear} (สร้าง ${created} แถว · pre-fill: ${prefill || 'ว่าง'})` });
    activeDepartments().forEach(d => notify({ deptId: d.id }, `เปิดรอบตั้งงบปี ${nextYear} — กรุณา (1) คาดการณ์ปิดยอดปี ${curYear} เดือน ${thru}-12 และ (2) กรอกงบปี ${nextYear} ทั้ง 12 เดือน`));
    save();
    return { created };
  }
  function toggleDepartment(actor, deptId, active) {
    assertAccounting(actor);
    const d = dept(deptId);
    if (!d) throw new Error('ไม่พบหน่วยงาน');
    if (active && !d.active && deptGLs(deptId).length === 0) {
      // เปิดใช้ได้ แต่เตือนให้มอบหมาย GL — ไม่บล็อก
    }
    d.active = !!active;
    audit(actor, active ? 'เปิดใช้งานหน่วยงาน' : 'ปิดใช้งานหน่วยงาน', { deptId, newValue: d.name });
    if (active) notify({ deptId }, `หน่วยงานของคุณถูกเปิดใช้งานในระบบงบประมาณแล้ว`);
    save();
  }
  function addDepartment(actor, code, name) {
    assertAccounting(actor);
    if (db.departments.some(d => d.code === code)) throw new Error('รหัสหน่วยงานซ้ำ');
    const d = { id: 'd' + code, code, name, nameEn: '', active: true };
    db.departments.push(d);
    audit(actor, 'เพิ่มหน่วยงาน', { deptId: d.id, newValue: `${code} ${name}` });
    save();
    return d;
  }
  // เพิ่ม/แก้ CCT ในผังหน่วยงาน (cct_master) → ผูกเข้าแผนก · ใช้ก่อนนำเข้า SAP สำหรับ CCT ที่ระบบยังไม่มี
  function addCct(actor, code, name, deptId) {
    assertAccounting(actor);
    if (!/^\d{6,}$/.test(String(code || ''))) throw new Error('รหัส CCT ไม่ถูกต้อง');
    if (!dept(deptId)) throw new Error('ไม่พบแผนกที่ระบุ');
    db.cctMaster = db.cctMaster || [];
    const ex = db.cctMaster.find(c => c.code === code);
    if (ex) { ex.name = name || ex.name; ex.departmentId = deptId; }
    else db.cctMaster.push({ code, name: name || code, departmentId: deptId });
    audit(actor, 'เพิ่ม/แก้ CCT', { newValue: `${code} ${name || ''} → ${dept(deptId)?.name}` });
    save();
    return { code, name, deptId };
  }
  // ---- Assumption (MTP) — ค่าที่แก้ (override) ราย cell r,c → ซิงค์ Supabase ----
  function assumEdits() { const m = {}; (db.assumptionCells || []).forEach(a => { m[a.r + '_' + a.c] = a.v; }); return m; }
  function assumSet(actor, r, c, v) {
    assertAccounting(actor);
    db.assumptionCells = db.assumptionCells || [];
    const i = db.assumptionCells.findIndex(a => a.r === r && a.c === c);
    const blank = (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)));
    if (blank) { if (i >= 0) db.assumptionCells.splice(i, 1); else return; }
    else { const row = { r, c, v: Number(v), updatedAt: new Date().toISOString(), updatedBy: actor.name }; if (i >= 0) db.assumptionCells[i] = row; else db.assumptionCells.push(row); }
    save();
  }
  function assumClear(actor) { assertAccounting(actor); if (!(db.assumptionCells || []).length) return; db.assumptionCells = []; save(); }
  function addGL(actor, code, name, glGroup, ioGroup) {
    assertAccounting(actor);
    if (db.glAccounts.some(g => g.code === code)) throw new Error('รหัส GL ซ้ำ');
    const g = {
      id: 'g' + code, code, name, glGroup: glGroup || 'อื่นๆ',
      ioGroup: /^\d{2}$/.test(ioGroup || '') ? ioGroup : 'ไม่คุม', // รหัสกลุ่ม IO 2 หลัก หรือ 'ไม่คุม'
      active: true,
    };
    db.glAccounts.push(g);
    audit(actor, 'เพิ่ม GL', { glCode: code, newValue: name });
    save();
    return g;
  }
  function assignGL(actor, deptId, glId) {
    assertAccounting(actor);
    if (db.departmentGL.some(x => x.departmentId === deptId && x.glId === glId)) return;
    // เลือก CCT หลักของหน่วยงาน (ตัวที่ใช้บ่อยที่สุด) ให้แถวใหม่ — เปลี่ยน/เพิ่ม CCT ได้ในอนาคต
    const cnt = {};
    (db.departmentRows || []).filter(x => x.departmentId === deptId).forEach(x => { cnt[x.cct] = (cnt[x.cct] || 0) + 1; });
    const mainCct = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0]
      || (db.cctMaster || []).find(c => c.departmentId === deptId)?.code || '0000000000';
    const g2 = gl(glId);
    const code = g2?.code || '';
    // ประกอบ IO ตามสูตรบริษัท: comp(3) + '55' + CCT หลัก 4-8 + รหัสกลุ่ม GL — ถ้า GL ไม่คุม ให้ระบุ 'ไม่คุม'
    const grp = g2?.ioGroup || 'ไม่คุม';
    const io = /^\d{2}$/.test(grp) ? mainCct.slice(0, 3) + '55' + mainCct.slice(3, 8) + grp : 'ไม่คุม';
    db.departmentRows.push({ departmentId: deptId, cct: mainCct, glId, io, codeA: mainCct + code + 'a' });
    db.departmentGL.push({ departmentId: deptId, glId });
    // สร้างแถวงบว่างปีปัจจุบัน + ปีก่อน → โผล่ในตารางกรอกงบของแผนกทันที + ติดไป Excel export + persist ขึ้น Supabase
    [db.meta.yearCurrent, db.meta.yearPrevious].forEach(y => {
      if (y && !db.budgets.some(b => b.year === y && b.departmentId === deptId && b.glId === glId && b.cct === mainCct))
        db.budgets.push({ year: y, departmentId: deptId, glId, cct: mainCct, months: Array(12).fill(null), mtp1: null, mtp2: null, updatedAt: null, updatedBy: actor.name });
    });
    audit(actor, 'มอบหมาย GL ให้หน่วยงาน', { deptId, glCode: code, newValue: 'CCT ' + mainCct });
    save();
  }
  // เพิ่มแถวงบใหม่ครบจาก 8 ฟิลด์ (GL/code a/CCT/IO/ชื่อบัญชี/ชื่อหน่วยงาน/ชื่อแผนก/รหัสแผนก)
  //  สร้าง GL master + cct_master + แผนก(F) ถ้ายังไม่มี + departmentRow + budget ว่าง (ปีปัจจุบัน+ปีก่อน)
  //  ของที่เพิ่มจะ persist ผ่าน merge ใน reconcileConfig + ซิงค์ขึ้น Supabase (เห็นทุกคน)
  function addGLRow(actor, f) {
    assertAccounting(actor);
    const g = {
      gl: (f.gl || '').trim(), codeA: (f.codeA || '').trim(), cct: (f.cct || '').trim(), io: (f.io || '').trim(),
      glName: (f.glName || '').trim(), unitName: (f.unitName || '').trim(),
      deptName: (f.deptName || '').trim(), deptCode: (f.deptCode || '').trim(),
    };
    if (!g.gl) throw new Error('ต้องกรอกอย่างน้อย: รหัส GL');
    if ((g.cct && !g.deptCode) || (!g.cct && g.deptCode))
      throw new Error('ถ้าจะมอบหมายเลย ต้องกรอกทั้ง CCT และ รหัสแผนก (หรือเว้นทั้งคู่ = เพิ่มเข้าทะเบียน GL เฉยๆ)');
    const glId = 'g' + g.gl;
    // 1) เพิ่มเข้าทะเบียน GL Master เสมอ (ถ้ายังไม่มี)
    const isNewGL = !gl(glId);
    if (isNewGL) db.glAccounts.push({ id: glId, code: g.gl, name: g.glName || g.gl, glGroup: 'อื่นๆ', glGroupSap: '', glType: '', ioGroup: 'ไม่คุม', active: true });
    else if (g.glName) gl(glId).name = g.glName;
    // 2) ถ้าระบุ CCT + รหัสแผนก → มอบหมายเป็นแถวงบด้วย
    let assigned = false, deptId = null;
    if (g.cct && g.deptCode) {
      deptId = 'd' + g.deptCode;
      if (db.departmentRows.some(x => x.departmentId === deptId && x.glId === glId && x.cct === g.cct))
        throw new Error(`แถวนี้มีอยู่แล้ว (แผนก ${g.deptCode} · GL ${g.gl} · CCT ${g.cct})`);
      if (!dept(deptId)) db.departments.push({ id: deptId, code: g.deptCode, name: g.deptName || g.deptCode, nameEn: '', active: true });
      if (!(db.cctMaster || []).some(c => c.code === g.cct)) db.cctMaster.push({ code: g.cct, name: g.unitName || g.cct, departmentId: deptId });
      db.departmentRows.push({ departmentId: deptId, cct: g.cct, glId, io: g.io, codeA: g.codeA });
      if (!db.departmentGL.some(x => x.departmentId === deptId && x.glId === glId)) db.departmentGL.push({ departmentId: deptId, glId });
      [db.meta.yearCurrent, db.meta.yearPrevious].forEach(y => {
        if (y && !db.budgets.some(b => b.year === y && b.departmentId === deptId && b.glId === glId && b.cct === g.cct))
          db.budgets.push({ year: y, departmentId: deptId, glId, cct: g.cct, months: Array(12).fill(null), mtp1: null, mtp2: null, updatedAt: null, updatedBy: actor.name });
      });
      assigned = true;
    }
    audit(actor, assigned ? 'เพิ่ม GL + มอบหมาย' : 'เพิ่ม GL (ทะเบียน)', { deptId, glCode: g.gl, newValue: assigned ? `CCT ${g.cct} → แผนก ${g.deptCode}` : (g.glName || '') });
    save();
    return { glId, isNewGL, assigned, deptId };
  }
  function unassignGL(actor, deptId, glId) {
    assertAccounting(actor);
    const hasData = db.budgets.some(b => b.departmentId === deptId && b.glId === glId && b.months.some(v => v));
    if (hasData) throw new Error('GL นี้มีข้อมูลงบประมาณแล้ว ไม่สามารถถอดออกได้');
    db.departmentRows = (db.departmentRows || []).filter(x => !(x.departmentId === deptId && x.glId === glId));
    db.departmentGL = db.departmentGL.filter(x => !(x.departmentId === deptId && x.glId === glId));
    audit(actor, 'ถอด GL ออกจากหน่วยงาน', { deptId, glCode: gl(glId)?.code });
    save();
  }
  /* ---------- ปริมาณผลิต (ตัวหารต้นทุนต่อหน่วย — ตันอ้อยไร่บริษัท/ส่งเสริม, ตันน้ำตาล) ---------- */
  const VOLUME_METRICS = [
    { key: 'caneCompany',   label: 'ตันอ้อย — ไร่บริษัท' },
    { key: 'caneCommunity', label: 'ตันอ้อย — ไร่ส่งเสริม/ชุมชน' },
    { key: 'sugarProduce',  label: 'ตันน้ำตาลผลิต' },
    { key: 'sugarTrading',  label: 'ตันน้ำตาล Trading' },
  ];
  function volume(year, metric) {
    return (db.prodVolumes || []).find(v => v.year === Number(year) && v.metric === metric)
      || { year: Number(year), metric, plan: null, actual: null };
  }
  // สิทธิ์กรอกปริมาณ: แอดมินบัญชี หรือ แผนกใน meta.volumeEditors (map ราย metric ใน seed.js)
  //  volumeEditors = { caneCompany:['2712'], sugarProduce:[], ... } (รองรับแบบ array เดิม = ใช้กับทุก metric)
  function volumeEditorsFor(metric) {
    const cfg = (db.meta && db.meta.volumeEditors) || {};
    if (Array.isArray(cfg)) return cfg;
    return cfg[metric] || [];
  }
  // รอบปีนี้เปิดให้กรอกไหม (เหมือนงบ: OPEN หรืออยู่ในรอบ Revise/Landing = แก้ได้)
  function isYearEditable(year) {
    const p = period(year);
    if (!p) return false;
    return p.status === 'OPEN' || revisePhase(year).on;
  }
  //  แก้ปริมาณได้เมื่อ: (แอดมิน = ได้เสมอ) · หรือ (แผนกที่ได้รับมอบหมาย metric นั้น + รอบปีเปิดอยู่)
  function canEditVolume(actor, metric, year) {
    if (!actor) return false;
    const yearOk = year == null ? true : isYearEditable(year);
    if (actor.role === 'ACCOUNTING') return true;   // แอดมินข้าม lock (เหมือน Unlock งบ)
    if (actor.role !== 'USER' || !actor.departmentId || !yearOk) return false;
    const d = dept(actor.departmentId); if (!d) return false;
    if (year != null && pptSubmitted(year, d.code)) return false;   // ส่งแล้ว = ล็อก (แอดมินปลดล็อก)
    if (metric) return volumeEditorsFor(metric).includes(d.code);
    return VOLUME_METRICS.some(m => volumeEditorsFor(m.key).includes(d.code));
  }
  /* ---------- จำนวนเงินหน้า "ต้นทุนต่อหน่วย" (กรอกมือ รายหมวด PPT 1-33, แยกจากระบบงบ) ---------- */
  function pptAmount(year, code) {
    return (db.pptAmounts || []).find(x => x.year === Number(year) && x.code === Number(code))
      || { year: Number(year), code: Number(code), amount: null };
  }
  function pptEditorsFor(code) {
    const cfg = (db.meta && db.meta.pptEditors) || {};
    return cfg[String(code)] || [];
  }
  // ส่งข้อมูล PPT รายแผนก/ปี → ล็อก (แอดมินปลดล็อกเท่านั้น)
  function pptSubmitted(year, deptCode) {
    return (db.pptSubmits || []).some(x => x.year === Number(year) && x.deptCode === deptCode);
  }
  function pptSubmitsFor(year) {
    return (db.pptSubmits || []).filter(x => x.year === Number(year));
  }
  function canEditPpt(actor, code, year) {
    if (!actor) return false;
    if (actor.role === 'ACCOUNTING') return true;   // แอดมิน = แก้ได้เสมอ (ปลดล็อก)
    const yearOk = year == null ? true : isYearEditable(year);
    if (actor.role !== 'USER' || !actor.departmentId || !yearOk) return false;
    const d = dept(actor.departmentId); if (!d) return false;
    if (pptSubmitted(year, d.code)) return false;   // ส่งแล้ว = ล็อก
    if (code != null) return pptEditorsFor(code).includes(d.code);
    const cfg = (db.meta && db.meta.pptEditors) || {};
    return Object.keys(cfg).some(c => (cfg[c] || []).includes(d.code));
  }
  // แผนกนี้เป็นผู้กรอกหน้าต้นทุน (ปริมาณผลิต) ไหม — ใช้ volumeEditors (จำนวนเงินเป็น auto จาก GL แล้ว)
  function isPptFiller(actor) {
    if (!actor || actor.role !== 'USER' || !actor.departmentId) return false;
    const d = dept(actor.departmentId); if (!d) return false;
    return VOLUME_METRICS.some(m => volumeEditorsFor(m.key).includes(d.code));
  }
  function submitPpt(actor, year) {
    if (!isPptFiller(actor)) throw new Error('เฉพาะแผนกที่ได้รับมอบหมายหน้านี้เท่านั้นที่ส่งได้');
    if (!isYearEditable(year)) throw new Error('รอบปีนี้ปิดแล้ว');
    const d = dept(actor.departmentId);
    if (pptSubmitted(year, d.code)) return;
    if (!db.pptSubmits) db.pptSubmits = [];
    db.pptSubmits.push({ year: Number(year), deptCode: d.code, submittedAt: new Date().toISOString(), submittedBy: actor.name });
    audit(actor, 'ส่งต้นทุน PPT', { newValue: `${year} · ${d.name}` });
    save();
  }
  function unlockPpt(actor, year, deptCode) {
    assertAccounting(actor);
    db.pptSubmits = (db.pptSubmits || []).filter(x => !(x.year === Number(year) && x.deptCode === deptCode));
    audit(actor, 'ปลดล็อกต้นทุน PPT', { newValue: `${year} · แผนก ${deptCode}` });
    save();
  }
  // ผู้กรอกกดแก้ไขปริมาณของตนเอง (Edit) — ได้เมื่อรอบปียังเปิด (ไม่ต้องรอแอดมิน)
  function reopenOwnPpt(actor, year) {
    if (!isPptFiller(actor)) throw new Error('เฉพาะแผนกที่ได้รับมอบหมายเท่านั้น');
    if (!isYearEditable(year)) throw new Error('รอบปีนี้ปิดแล้ว — ให้แอดมินปลดล็อก');
    const d = dept(actor.departmentId);
    db.pptSubmits = (db.pptSubmits || []).filter(x => !(x.year === Number(year) && x.deptCode === d.code));
    audit(actor, 'ขอแก้ไขต้นทุน PPT (Edit)', { newValue: `${year} · ${d.name}` });
    save();
  }
  // แผนกที่รับผิดชอบกรอกปริมาณทั้งหมด (จาก volumeEditors)
  function pptResponsibleDepts() {
    const codes = new Set();
    VOLUME_METRICS.forEach(m => volumeEditorsFor(m.key).forEach(c => codes.add(c)));
    return [...codes];
  }
  // แอดมิน Submit ปริมาณให้ครบทุกแผนกที่รับผิดชอบ (finalize → คำนวณ/ตัน)
  function submitAllPpt(actor, year) {
    assertAccounting(actor);
    if (!db.pptSubmits) db.pptSubmits = [];
    let n = 0;
    pptResponsibleDepts().forEach(code => {
      if (!pptSubmitted(year, code)) { db.pptSubmits.push({ year: Number(year), deptCode: code, submittedAt: new Date().toISOString(), submittedBy: actor.name + ' (แอดมิน)' }); n++; }
    });
    audit(actor, 'ส่งปริมาณผลิตแทนทุกแผนก (แอดมิน)', { newValue: `ปี ${year} · ${n} แผนก` });
    save();
  }
  // แอดมินปลดล็อก/เปิดแก้ปริมาณทั้งหมดของปี
  function unlockAllPpt(actor, year) {
    assertAccounting(actor);
    db.pptSubmits = (db.pptSubmits || []).filter(x => x.year !== Number(year));
    audit(actor, 'ปลดล็อกปริมาณผลิตทั้งหมด (แอดมิน)', { newValue: `ปี ${year}` });
    save();
  }
  function setPptAmount(actor, year, code, amount) {
    if (!canEditPpt(actor, code, year)) throw new Error('กรอกจำนวนเงินนี้ไม่ได้ — ต้องเป็นแผนกที่ได้รับมอบหมายหมวดนี้ และรอบปีต้องเปิดอยู่ (แอดมินแก้ได้เสมอ)');
    if (amount !== null && (typeof amount !== 'number' || !isFinite(amount))) throw new Error('ค่าไม่ถูกต้อง');
    if (!db.pptAmounts) db.pptAmounts = [];
    let x = db.pptAmounts.find(v => v.year === Number(year) && v.code === Number(code));
    if (!x) { x = { year: Number(year), code: Number(code), amount: null }; db.pptAmounts.push(x); }
    x.amount = amount; x.updatedAt = new Date().toISOString(); x.updatedBy = actor.name;
    audit(actor, 'กรอกต้นทุน PPT', { newValue: `${year} หมวด${code} = ${amount}` });
    save();
  }

  function setVolume(actor, year, metric, field, value) {
    if (!canEditVolume(actor, metric, year)) throw new Error('กรอกปริมาณนี้ไม่ได้ — ต้องเป็นแผนกที่ได้รับมอบหมาย และรอบปีต้องเปิดอยู่ (แอดมินแก้ได้เสมอ)');
    if (!VOLUME_METRICS.some(m => m.key === metric)) throw new Error('metric ไม่ถูกต้อง');
    if (field !== 'plan' && field !== 'actual') throw new Error('field ไม่ถูกต้อง');
    if (value !== null && (typeof value !== 'number' || !isFinite(value) || value < 0)) throw new Error('ค่าไม่ถูกต้อง');
    if (!db.prodVolumes) db.prodVolumes = [];
    let v = db.prodVolumes.find(x => x.year === Number(year) && x.metric === metric);
    if (!v) { v = { year: Number(year), metric, plan: null, actual: null }; db.prodVolumes.push(v); }
    v[field] = value; v.updatedAt = new Date().toISOString(); v.updatedBy = actor.name;
    audit(actor, 'กรอกปริมาณผลิต', { newValue: `${year} ${metric}.${field} = ${value}` });
    save();
  }

  function setRate(actor, year, currency, rate) {
    assertAccounting(actor);
    let r = db.exchangeRates.find(x => x.year === Number(year) && x.currency === currency);
    if (!r) { r = { year: Number(year), currency, rateToLAK: rate }; db.exchangeRates.push(r); }
    else r.rateToLAK = rate;
    audit(actor, 'กำหนด Budget Exchange Rate', { newValue: `${year} ${currency} = ${rate} LAK` });
    save();
  }
  function setFuelPrice(actor, year, fuelType, price) {
    assertAccounting(actor);
    let f = db.fuelPrices.find(x => x.year === Number(year) && x.fuelType === fuelType);
    if (!f) { f = { year: Number(year), fuelType, pricePerLiter: price }; db.fuelPrices.push(f); }
    else f.pricePerLiter = price;
    audit(actor, 'กำหนดราคากลางน้ำมัน', { newValue: `${year} ${fuelType} = ${price} กีบ/ลิตร` });
    save();
  }

  /* ---------- export ---------- */
  function csv(rows) { // rows: array of arrays → CSV string (Excel-ready, BOM UTF-8)
    const esc = v => {
      v = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  }
  function download(filename, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  // สำรองข้อมูลทั้งหมดเป็นไฟล์ JSON (กู้คืนได้)
  function exportBackup() {
    const stamp = (db.meta.seededAt || '').slice(0, 10) || 'now';
    download(`budget_backup_${db.meta.yearCurrent}_${stamp}.json`, JSON.stringify(db), 'application/json');
  }
  // ส่งออก Audit Log เป็นไฟล์ JSON (สำหรับแอปอ่านรายงานภายนอก)
  function exportAuditJson() {
    const logs = db.auditLogs.map(l => {
      const d = l.deptId ? dept(l.deptId) : null;
      return {
        id: l.id,
        ts: l.ts,
        userId: l.userId ?? null,
        userName: l.userName ?? null,
        action: l.action ?? null,
        deptId: l.deptId ?? null,
        deptCode: d?.code ?? null,
        deptName: d?.name ?? null,
        glCode: l.glCode ?? null,
        month: l.month ?? null,
        monthName: l.month ? MONTH_TH[l.month - 1] : null,
        oldValue: l.oldValue ?? null,
        newValue: l.newValue ?? null,
      };
    });
    const payload = {
      app: 'iBud Annual Budget',
      company: 'บริษัท น้ำตาลมิตรลาว จำกัด',
      schema: 'audit-log/v1',
      exportedAt: new Date().toISOString(),
      yearCurrent: db.meta.yearCurrent,
      count: logs.length,
      logs,
    };
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    download(`audit_log_${db.meta.yearCurrent}_${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
    return logs.length;
  }
  function restoreBackup(actor, jsonText) {
    assertAccounting(actor);
    let nd; try { nd = JSON.parse(jsonText); } catch (e) { throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง'); }
    if (!nd.meta || !Array.isArray(nd.budgets) || !Array.isArray(nd.departments)) throw new Error('ไฟล์สำรองไม่สมบูรณ์ (ไม่พบ meta/budgets/departments)');
    nd.meta.rev = Math.max((nd.meta.rev || 0), (db.meta.rev || 0)) + 1; // ให้ชนะ rev บนฐานข้อมูล
    adoptDb(nd); save();
    return { depts: nd.departments.length, budgets: nd.budgets.length };
  }
  const MONTH_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  function exportDetail(year) {
    // ระดับแถว CCT×GL พร้อมรหัสครบ (code a / IO / CCT) — พร้อมคีย์เข้า SAP
    const rv = revisePhase(year);
    const hasSnap = !!snapshotFor(year);
    const reviseCols = hasSnap ? ['งบเดิมทั้งปี', 'เพิ่ม-ลดระหว่างปี', `เกิดจริงสะสม (ถึง ด.${rv.thru})`] : [];
    const rows = [['หน่วยงาน','code a','IO','CCT','ชื่อหน่วยงานย่อย','รหัส GL','ชื่อบัญชี',
      ...MONTH_S.map(m => `${m} ${year}`), `รวมปี ${year}`, ...reviseCols, `รวมปี ${year - 1}`, 'ผลต่าง', '% เปลี่ยนแปลง',
      `ปี ${year + 1} (MTP)`, `ปี ${year + 2} (MTP)`, 'ไม่ได้ใช้', 'สมมติฐาน', 'สาเหตุเพิ่ม/ลด']];
    activeDepartments().forEach(d => deptRows(d.id).forEach(r => {
      const m = rowMonths(year, d.id, r.key);
      const cur = sum(m), prev = rowTotal(year - 1, d.id, r.key);
      const n = note(year, d.id, r.key);
      const t = mtp(year, d.id, r.key);
      const b = rowByKey(year, d.id, r.key);
      const reviseVals = hasSnap ? (() => {
        const orig = originalRowTotal(year, d.id, r.key);
        const actSum = sum(actualMonths(year, d.id, r.key).slice(0, rv.thru));
        return [orig, cur - orig, actSum];
      })() : [];
      rows.push([d.name, r.codeA, r.io || '—', r.cct, r.cctName, r.gl.code, r.gl.name,
        ...m.map(v => v ?? ''), cur, ...reviseVals, prev, cur - prev,
        prev !== 0 ? ((cur - prev) / Math.abs(prev) * 100).toFixed(1) + '%' : (cur ? 'ใหม่' : '0%'),
        t.mtp1 ?? '', t.mtp2 ?? '', b?.notUsed ? 'YES' : '', n.assumption, n.reason]);
    }));
    download(`budget_detail_${year}.csv`, csv(rows));
  }
  function exportDeptSummary(year) {
    const rows = [['หน่วยงาน', `งบปี ${year - 1}`, `งบปี ${year}`, 'ผลต่าง', '% เปลี่ยนแปลง', 'ความครบถ้วน', 'สถานะ']];
    activeDepartments().forEach(d => {
      const cur = deptTotal(year, d.id), prev = deptTotal(year - 1, d.id);
      rows.push([d.name, prev, cur, cur - prev, prev !== 0 ? ((cur - prev) / Math.abs(prev) * 100).toFixed(1) + '%' : '-',
        completion(year, d.id).pct + '%', deptState(year, d.id).status]);
    });
    download(`budget_departments_${year}.csv`, csv(rows));
  }
  function exportPnl(year) {
    const gById = {}; db.glAccounts.forEach(g => { gById[g.id] = g; });
    const agg = {};
    const bk = grp => (agg[grp] = agg[grp] || { cur: 0, prev: 0, mtp1: 0, mtp2: 0 });
    db.budgets.filter(b => b.year === Number(year)).forEach(b => { const g = gById[b.glId]; if (!g) return; const a = bk(g.glGroup || 'อื่นๆ'); a.cur += sum(b.months); a.mtp1 += (b.mtp1 || 0); a.mtp2 += (b.mtp2 || 0); });
    db.budgets.filter(b => b.year === Number(year) - 1).forEach(b => { const g = gById[b.glId]; if (!g) return; bk(g.glGroup || 'อื่นๆ').prev += sum(b.months); });
    const rows = [['กลุ่มบัญชี', `งบปี ${year - 1}`, `งบปี ${year}`, 'ผลต่าง', '% เปลี่ยนแปลง', `MTP ปี ${Number(year) + 1}`, `MTP ปี ${Number(year) + 2}`]];
    Object.entries(agg).sort((a, b) => b[1].cur - a[1].cur).forEach(([grp, v]) =>
      rows.push([grp, v.prev, v.cur, v.cur - v.prev, v.prev !== 0 ? ((v.cur - v.prev) / Math.abs(v.prev) * 100).toFixed(1) + '%' : '-', v.mtp1, v.mtp2]));
    download(`budget_pnl_${year}.csv`, csv(rows));
  }

  /* ---------- คำร้องปรับงบกลางปี (ขอเพิ่ม/ลด/โยก · 2 หน้าต่าง: เดือน 1-3, 5-12) ---------- */
  const CHANGE_WINDOWS = [
    { key: 'm1_3',  label: 'ช่วงที่ 1 · เดือน 1-3',  months: [1, 2, 3] },
    { key: 'm5_12', label: 'ช่วงที่ 2 · เดือน 5-12', months: [5, 6, 7, 8, 9, 10, 11, 12] },
  ];
  const REQ_TYPE = { increase: '➕ ขอเพิ่มงบ', decrease: '➖ ขอลดงบ', transfer: '🔄 ขอโยกงบ' };
  const reqTypeLabel = t => REQ_TYPE[t] || t;
  function changeWindowState(year, key) {
    return (db.changeWindows || []).find(w => w.year === Number(year) && w.window === key) || { year: Number(year), window: key, open: false };
  }
  function changeWindowsOpen(year) { return CHANGE_WINDOWS.filter(w => changeWindowState(year, w.key).open); }
  function monthsAllowed(year) {
    const set = new Set();
    changeWindowsOpen(year).forEach(w => w.months.forEach(m => set.add(m)));  // w = CHANGE_WINDOWS entry (มี .months)
    return [...set].sort((a, b) => a - b);
  }
  const windowOfMonth = m => (CHANGE_WINDOWS.find(w => w.months.includes(Number(m))) || {}).key || null;
  // ปิดรอบการตั้งงบแล้วหรือยัง (Lock งบ = period.status CLOSED) — เงื่อนไขก่อนเปิดรับคำร้องปรับงบ
  function budgetRoundClosed(year) { const p = period(year); return !!p && p.status === 'CLOSED'; }
  const currentMonth = () => new Date().getMonth() + 1;                         // เดือนปฏิทินจริง 1-12
  const windowForMonth = m => CHANGE_WINDOWS.find(w => w.months.includes(Number(m))) || null;
  function setChangeWindow(actor, year, key, open) {
    assertAccounting(actor);
    if (!CHANGE_WINDOWS.some(w => w.key === key)) throw new Error('ช่วงเวลาไม่ถูกต้อง');
    if (open) {
      if (!budgetRoundClosed(year))
        throw new Error('ต้องปิดรอบการตั้งงบ (Lock งบ) ก่อน จึงจะเปิดรับคำร้องปรับงบได้ — ไปที่ Budget Control เพื่อ Lock รอบปีนี้');
      // อิงเดือนจริง: เปิดได้เฉพาะช่วงที่ครอบคลุมเดือนปัจจุบัน
      const cw = windowForMonth(currentMonth()), mn = MONTH_S[currentMonth() - 1];
      if (!cw || cw.key !== key)
        throw new Error(`เปิดได้เฉพาะช่วงที่ตรงกับเดือนปัจจุบัน — ตอนนี้เดือน ${mn}${cw ? ` เปิดได้เฉพาะ "${cw.label}"` : ' อยู่นอกช่วงที่เปิดรับคำร้อง'}`);
      // เปิดได้ครั้งละ 1 ช่วง
      if (changeWindowsOpen(year).some(x => x.key !== key))
        throw new Error('เปิดได้ครั้งละ 1 ช่วงเท่านั้น — ปิดช่วงที่เปิดอยู่ก่อน');
    }
    if (!db.changeWindows) db.changeWindows = [];
    let w = db.changeWindows.find(x => x.year === Number(year) && x.window === key);
    if (!w) { w = { year: Number(year), window: key, open: false }; db.changeWindows.push(w); }
    w.open = !!open; w.openedAt = new Date().toISOString(); w.openedBy = actor.name;
    const lbl = CHANGE_WINDOWS.find(x => x.key === key).label;
    audit(actor, open ? 'เปิดหน้าต่างปรับงบ' : 'ปิดหน้าต่างปรับงบ', { newValue: `ปี ${year} · ${lbl}` });
    if (open) activeDepartments().forEach(d => notify({ deptId: d.id }, `เปิดให้ยื่นคำร้องปรับงบปี ${year} — ${lbl} · ยื่นขอเพิ่ม/ลด/โยกงบได้แล้ว`));
    save();
  }

  const changeRequests = () => db.changeRequests || [];
  const requestById = id => changeRequests().find(r => r.id === id) || null;
  function myRequests(user) { return user.departmentId ? changeRequests().filter(r => r.deptId === user.departmentId) : []; }
  function requestsForMgr(user) {
    if (user.role !== 'MANAGER') return [];
    const codes = subtreeDeptCodes(user.orgUnit);
    return changeRequests().filter(r => r.status === 'PENDING_MGR' && codes.includes(dept(r.deptId)?.code));
  }
  const requestsByStatus = status => changeRequests().filter(r => !status || r.status === status);

  function createChangeRequest(actor, data) {
    if (actor.role !== 'USER' || !actor.departmentId) throw new Error('เฉพาะหน่วยงานเท่านั้นที่ยื่นคำร้องได้');
    const year = Number(data.year);
    const allowed = monthsAllowed(year);
    if (!allowed.length) throw new Error('ยังไม่เปิดหน้าต่างปรับงบสำหรับปีนี้ (ติดต่อแผนกบัญชี)');
    const type = data.type;
    if (!['increase', 'decrease', 'transfer'].includes(type)) throw new Error('ประเภทคำร้องไม่ถูกต้อง');
    if (!String(data.reason || '').trim()) throw new Error('กรุณาระบุเหตุผลของคำร้อง');
    const chkMonth = m => { if (!allowed.includes(Number(m))) throw new Error(`เดือน ${m} อยู่นอกช่วงที่เปิดให้ปรับ (เปิด: เดือน ${allowed.join(', ')})`); };
    const amt = v => { const n = Number(String(v).replace(/[,\s]/g, '')); if (!isFinite(n) || n <= 0) throw new Error('จำนวนเงินต้องมากกว่า 0'); return n; };
    const items = [];
    let crossTo = null;
    if (type === 'transfer') {
      const a = amt(data.amount);
      chkMonth(data.fromMonth); chkMonth(data.toMonth);
      if (!data.fromKey || !data.toKey) throw new Error('เลือกช่องต้นทาง/ปลายทางให้ครบ');
      const toDeptId = data.toDeptId || actor.departmentId;
      if (!dept(toDeptId)) throw new Error('หน่วยงานปลายทางไม่ถูกต้อง');
      if (toDeptId === actor.departmentId && data.fromKey === data.toKey && Number(data.fromMonth) === Number(data.toMonth))
        throw new Error('ต้นทางและปลายทางต้องไม่ใช่ช่องเดียวกัน');
      const [fg, fc] = splitKey(data.fromKey), [tg, tc] = splitKey(data.toKey);
      items.push({ deptId: actor.departmentId, glId: fg, cct: fc, month: Number(data.fromMonth), delta: -a });
      items.push({ deptId: toDeptId, glId: tg, cct: tc, month: Number(data.toMonth), delta: a });
      if (toDeptId !== actor.departmentId) crossTo = toDeptId;
    } else {
      const a = amt(data.amount);
      chkMonth(data.month);
      if (!data.rowKey) throw new Error('เลือกช่องงบที่จะปรับ');
      const [g, c] = splitKey(data.rowKey);
      items.push({ deptId: actor.departmentId, glId: g, cct: c, month: Number(data.month), delta: type === 'increase' ? a : -a });
    }
    items.forEach(it => {
      if (it.delta < 0) {
        const cur = rowMonths(year, it.deptId, it.glId + '@' + it.cct)[it.month - 1] || 0;
        if (cur + it.delta < 0) throw new Error(`ลด/โยกเกินยอดของช่องนั้น (คงเหลือ ${Math.round(cur).toLocaleString()} กีบ)`);
      }
    });
    const req = {
      id: 'req' + Date.now() + Math.random().toString(36).slice(2, 6),
      year, window: windowOfMonth(items[0].month), type,
      deptId: actor.departmentId, createdBy: actor.name, createdAt: new Date().toISOString(),
      reason: String(data.reason).trim(), memoNote: String(data.memoNote || '').trim(),
      memoFile: data.memoFile || null,
      // มี memo ที่ลงนามแล้วแนบมา → ไม่ต้องผ่านหัวหน้าฝ่าย ส่งตรงแผนกบัญชี (แอดมิน) ตอบรับ/ตีกลับ
      items, toDeptId: crossTo, status: 'PENDING_ACC',
      mgrBy: null, mgrAt: null, mgrNote: null, accBy: null, accAt: null, accNote: null, appliedAt: null,
    };
    if (!db.changeRequests) db.changeRequests = [];
    db.changeRequests.unshift(req);
    audit(actor, 'ยื่นคำร้องปรับงบ', { deptId: actor.departmentId, newValue: `${reqTypeLabel(type)} ปี ${year}` });
    notify({ role: 'ACCOUNTING' }, `${dept(actor.departmentId).name} ยื่นคำร้องปรับงบปี ${year} (${reqTypeLabel(type)}) — รอแผนกบัญชีดำเนินการ`);
    save();
    return req;
  }
  function reqAssertMgrScope(actor, req) {
    if (actor.role !== 'MANAGER') throw new Error('เฉพาะหัวหน้าฝ่ายเท่านั้น');
    if (!subtreeDeptCodes(actor.orgUnit).includes(dept(req.deptId)?.code)) throw new Error('คำร้องนี้อยู่นอกฝ่ายที่ท่านดูแล');
  }
  function mgrApproveRequest(actor, id) {
    const req = requestById(id); if (!req) throw new Error('ไม่พบคำร้อง');
    reqAssertMgrScope(actor, req);
    if (req.status !== 'PENDING_MGR') throw new Error('คำร้องนี้ไม่ได้อยู่สถานะรอหัวหน้าฝ่าย');
    req.status = 'PENDING_ACC'; req.mgrBy = actor.name; req.mgrAt = new Date().toISOString();
    audit(actor, 'หัวหน้าฝ่ายอนุมัติคำร้องปรับงบ', { deptId: req.deptId, newValue: req.id });
    notify({ role: 'ACCOUNTING' }, `คำร้องปรับงบของ ${dept(req.deptId).name} ผ่านหัวหน้าฝ่าย (${actor.name}) — รอแผนกบัญชีดำเนินการ`);
    notify({ deptId: req.deptId }, `คำร้องปรับงบปี ${req.year} ผ่านการอนุมัติจากหัวหน้าฝ่ายแล้ว — รอแผนกบัญชีดำเนินการ`);
    save();
  }
  function mgrRejectRequest(actor, id, noteMsg) {
    const req = requestById(id); if (!req) throw new Error('ไม่พบคำร้อง');
    reqAssertMgrScope(actor, req);
    if (req.status !== 'PENDING_MGR') throw new Error('คำร้องนี้ไม่ได้อยู่สถานะรอหัวหน้าฝ่าย');
    req.status = 'REJECTED'; req.mgrBy = actor.name; req.mgrAt = new Date().toISOString(); req.mgrNote = noteMsg || null;
    audit(actor, 'หัวหน้าฝ่ายปฏิเสธคำร้องปรับงบ', { deptId: req.deptId, newValue: noteMsg || '' });
    notify({ deptId: req.deptId }, `คำร้องปรับงบปี ${req.year} ถูกหัวหน้าฝ่ายปฏิเสธ${noteMsg ? ' — ' + noteMsg : ''}`);
    save();
  }
  function accApproveRequest(actor, id) {
    assertAccounting(actor);
    const req = requestById(id); if (!req) throw new Error('ไม่พบคำร้อง');
    if (req.status !== 'PENDING_ACC') throw new Error('คำร้องนี้ดำเนินการไปแล้ว');
    // ตรวจซ้ำ ณ ตอนอนุมัติ: งบต้นทาง (delta ติดลบ) ต้องพอ — กันการโยก/ลดเกินยอดจนเงินงอก (เช่น ยอดถูกปรับลดหลังยื่น)
    req.items.forEach(it => {
      if (it.delta < 0) {
        const r = rowByKey(req.year, it.deptId, it.glId + '@' + it.cct);
        const cur = r ? (r.months[it.month - 1] || 0) : 0;
        if (cur + it.delta < 0) throw new Error(`งบต้นทางไม่พอ ณ ตอนอนุมัติ (${gl(it.glId)?.code} เดือน ${it.month} คงเหลือ ${Math.round(cur).toLocaleString()} กีบ) — ตีกลับให้หน่วยงานยื่นใหม่`);
      }
    });
    req.items.forEach(it => {
      const row = ensureRow(req.year, it.deptId, it.glId + '@' + it.cct);
      const i = it.month - 1, old = row.months[i] || 0;
      let nv = old + it.delta; if (nv < 0) nv = 0;
      row.months[i] = nv;
      row.updatedAt = new Date().toISOString(); row.updatedBy = `คำร้อง ${req.id} (${actor.name})`;
      audit(actor, 'ปรับงบตามคำร้อง', { deptId: it.deptId, glCode: gl(it.glId)?.code, month: it.month, oldValue: old, newValue: nv });
    });
    req.status = 'APPROVED'; req.accBy = actor.name; req.accAt = new Date().toISOString(); req.appliedAt = req.accAt;
    notify({ deptId: req.deptId }, `คำร้องปรับงบปี ${req.year} ได้รับอนุมัติและปรับงบให้เรียบร้อยแล้ว ✅`);
    [...new Set(req.items.map(it => it.deptId))].filter(d => d !== req.deptId)
      .forEach(d => notify({ deptId: d }, `มีการโยกงบเข้ามายังหน่วยงานของท่าน (ปี ${req.year}) ตามคำร้องที่อนุมัติแล้ว`));
    save();
  }
  function accRejectRequest(actor, id, noteMsg) {
    assertAccounting(actor);
    const req = requestById(id); if (!req) throw new Error('ไม่พบคำร้อง');
    if (!['PENDING_ACC', 'PENDING_MGR'].includes(req.status)) throw new Error('คำร้องนี้ดำเนินการไปแล้ว');
    req.status = 'REJECTED'; req.accBy = actor.name; req.accAt = new Date().toISOString(); req.accNote = noteMsg || null;
    audit(actor, 'บัญชีปฏิเสธคำร้องปรับงบ', { deptId: req.deptId, newValue: noteMsg || '' });
    notify({ deptId: req.deptId }, `คำร้องปรับงบปี ${req.year} ถูกแผนกบัญชีปฏิเสธ${noteMsg ? ' — ' + noteMsg : ''}`);
    save();
  }
  // สรุป "การปรับงบจากคำร้องที่อนุมัติแล้ว" ราย GL×CCT (สำหรับติดหมายเหตุในหน้ากรอก/ตรวจ)
  //  คืน map: rowKey(glId@cct) -> { net, monthNet:{i:delta}, monthLines:{i:[txt]}, lines:[txt] }
  function reqAdjustmentsFor(year, deptId) {
    const map = {};
    (db.changeRequests || []).filter(r => r.status === 'APPROVED' && r.year === Number(year)).forEach(r => {
      r.items.forEach(it => {
        if (it.deptId !== deptId) return;
        const key = it.glId + '@' + it.cct;
        const rec = map[key] || (map[key] = { net: 0, monthNet: {}, monthLines: {}, lines: [] });
        const i = it.month - 1, mn = MONTH_S[i] || ('ด.' + it.month);
        const amt = Math.abs(Math.round(it.delta)).toLocaleString();
        let txt;
        if (r.type === 'increase') txt = `+${amt} เพิ่มงบ (${mn})`;
        else if (r.type === 'decrease') txt = `−${amt} ลดงบ (${mn})`;
        else {
          const other = r.items.find(x => x !== it && (x.delta > 0) !== (it.delta > 0));
          const od = other ? dept(other.deptId) : null, og = other ? gl(other.glId) : null;
          const oname = other ? ((od && od.id !== deptId ? od.name + ' · ' : '') + (og ? og.code + ' ' + og.name : '')) : '';
          txt = it.delta < 0 ? `−${amt} โยกออก → ${oname} (${mn})` : `+${amt} โยกเข้า ← ${oname} (${mn})`;
        }
        const meta = [r.accBy && ('โดย ' + r.accBy), (r.appliedAt || r.accAt || '').slice(0, 10)].filter(Boolean).join(' · ');
        const line = txt + (meta ? '  [' + meta + ']' : '');
        rec.net += it.delta;
        rec.monthNet[i] = (rec.monthNet[i] || 0) + it.delta;
        (rec.monthLines[i] = rec.monthLines[i] || []).push(line);
        rec.lines.push(line);
      });
    });
    return map;
  }
  function cancelChangeRequest(actor, id) {
    const req = requestById(id); if (!req) throw new Error('ไม่พบคำร้อง');
    if (actor.role !== 'USER' || req.deptId !== actor.departmentId) throw new Error('ยกเลิกได้เฉพาะคำร้องของหน่วยงานตนเอง');
    if (!['PENDING_ACC', 'PENDING_MGR'].includes(req.status)) throw new Error('ยกเลิกได้เฉพาะคำร้องที่ยังรอดำเนินการ');
    req.status = 'CANCELLED';
    audit(actor, 'ยกเลิกคำร้องปรับงบ', { deptId: req.deptId, newValue: req.id });
    save();
  }

  load();

  return {
    get db() { return db; },
    save, saveSilent, setAfterSave, adoptDb, resetDemo,
    login, loginByUsername, logout, currentUser, passwordFor, setUserPassword,
    directory, baseDirectory, directoryAccount, addUserAccount, removeUserAccount, addUserRole, removeUserRole, resetUserPassword,
    dept, gl, glByCode, period, activeDepartments, deptGLs,
    oversight, oversightUnit, childUnits, subtreeDeptCodes, subtreeDepartments, subtreeUnits, unitOfDept,
    cctName, deptRows, rowByKey, rowMonths, rowTotal, splitKey,
    months, glTotal, deptTotal, companyTotal, deptMonthly, companyMonthly,
    note, deptState, completion, compare, glAnomaly, deptAnomalies, validate,
    revisePhase, snapshotFor, snapshotsFor, snapByLabel, takeSnapshot, deleteSnapshot, SNAP_TITLE,
    snapRowMonths, snapDeptMonthly, snapDeptTotal, snapCompanyTotal,
    originalMonths, originalRowTotal, originalGlTotal,
    originalDeptMonthly, originalDeptTotal, actualMonths, openRevise, setActual, pasteActuals,
    actualRowRef, importActuals, importBudgetFile, reconcileFile,
    postActuals, postActualsPaste, hasPostedActuals, importDualBudget, importV7Data, sapImport,
    canEdit, setCell, adminSetCell, setMtp, mtp, SCEN_DEF, scenarioVal, setScenario, setNote, submit, glNotUsed, setGlNotUsed,
    cellDetail, setCellDetail, clearDeptYear, clearAllDeptYear, clearMock,
    needRevision, needRevisionBulk, lockDept, mgrApprove, mgrReturn, lockPeriod, unlockPeriod, openPeriod, openBudgetRound, deletePeriod,
    addDepartment, addCct, toggleDepartment, addGL, addGLRow, assignGL, unassignGL, setRate, setFuelPrice,
    assumEdits, assumSet, assumClear,
    VOLUME_METRICS, volume, canEditVolume, setVolume, isYearEditable,
    pptAmount, canEditPpt, setPptAmount, pptSubmitted, pptSubmitsFor, isPptFiller, submitPpt, unlockPpt, reopenOwnPpt, submitAllPpt, unlockAllPpt,
    myNotifications, markNotificationsRead, notify, postAnnouncement, isAnnouncement,
    CHANGE_WINDOWS, reqTypeLabel, changeWindowState, changeWindowsOpen, monthsAllowed, windowOfMonth, setChangeWindow, budgetRoundClosed, currentMonth, windowForMonth,
    changeRequests, requestById, myRequests, requestsForMgr, requestsByStatus,
    createChangeRequest, mgrApproveRequest, mgrRejectRequest, accApproveRequest, accRejectRequest, cancelChangeRequest, reqAdjustmentsFor,
    exportDetail, exportDeptSummary, exportPnl, exportBackup, exportAuditJson, restoreBackup,
    MONTH_TH, MONTH_S,
  };
})();

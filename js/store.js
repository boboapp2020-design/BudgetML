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
      db.meta.volumeEditors = clone(SEED.meta.volumeEditors || []);   // สิทธิ์กรอกปริมาณผลิต = config จากโค้ด
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
  function currentUser() {
    const id = sessionStorage.getItem(SES_KEY);
    return db.users.find(u => u.id === id) || null;
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
  }
  function myNotifications(user) {
    return db.notifications.filter(n =>
      (n.targetRole && n.targetRole === user.role) ||
      (n.targetDeptId && n.targetDeptId === user.departmentId));
  }
  function markNotificationsRead(user) {
    myNotifications(user).forEach(n => { n.read = true; }); save();
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
  function subtreeDeptCodes(unitId) {                    // แผนกที่มีงบทั้งหมดใต้หน่วยนี้ (รวม subtree)
    const u = oversightUnit(unitId); if (!u) return [];
    const codes = [...(u.deptCodes || [])];
    childUnits(unitId).forEach(c => codes.push(...subtreeDeptCodes(c.id)));
    return [...new Set(codes)];
  }
  const subtreeDepartments = unitId => subtreeDeptCodes(unitId)
    .map(code => db.departments.find(d => d.code === code)).filter(d => d && d.active);
  // หน่วยทั้งหมดใน subtree (รวมตัวเอง) เรียงแบบต้นไม้ + depth — ใช้ทำตัวเลือก "ดูแยกฝ่ายย่อย"
  function subtreeUnits(unitId) {
    const out = [];
    const walk = (id, depth) => {
      const u = oversightUnit(id); if (!u) return;
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
    const total = rows.length * 12;
    rows.forEach(r => rowMonths(year, deptId, r.key).forEach(v => { if (v !== null && v !== undefined) filled++; }));
    return { filled, total, pct: total ? Math.round(filled / total * 100) : 0 };
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
      year: Number(year), label: 'ORIGINAL', takenAt: new Date().toISOString(), takenBy: actor ? actor.name : 'system',
      rows: db.budgets.filter(b => b.year === Number(year)).map(b => ({
        departmentId: b.departmentId, glId: b.glId, cct: b.cct, months: b.months.slice(), mtp1: b.mtp1, mtp2: b.mtp2,
      })),
    });
    return true;
  }
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
    if (!p || p.status !== 'OPEN') throw new Error(`รอบงบประมาณปี ${year} ปิดแล้ว ไม่สามารถแก้ไขได้`);
    const st = deptState(year, deptId).status;
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
    const froze = ensureOriginal(year, actor); // freeze แผน ORIGINAL ณ อนุมัติ (ครั้งแรกเท่านั้น)
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
  function canEditVolume(actor, metric) {
    if (!actor) return false;
    if (actor.role === 'ACCOUNTING') return true;
    if (actor.role !== 'USER' || !actor.departmentId) return false;
    const d = dept(actor.departmentId); if (!d) return false;
    if (metric) return volumeEditorsFor(metric).includes(d.code);
    // ไม่ระบุ metric → แก้ได้อย่างน้อย 1 metric
    return VOLUME_METRICS.some(m => volumeEditorsFor(m.key).includes(d.code));
  }
  function setVolume(actor, year, metric, field, value) {
    if (!canEditVolume(actor, metric)) throw new Error('เฉพาะแผนกบัญชี (Admin) หรือแผนกที่ได้รับมอบหมายเท่านั้นที่กรอกปริมาณนี้ได้');
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

  load();

  return {
    get db() { return db; },
    save, saveSilent, setAfterSave, adoptDb, resetDemo,
    login, loginByUsername, logout, currentUser,
    dept, gl, glByCode, period, activeDepartments, deptGLs,
    oversight, oversightUnit, childUnits, subtreeDeptCodes, subtreeDepartments, subtreeUnits, unitOfDept,
    cctName, deptRows, rowByKey, rowMonths, rowTotal, splitKey,
    months, glTotal, deptTotal, companyTotal, deptMonthly, companyMonthly,
    note, deptState, completion, compare, glAnomaly, deptAnomalies, validate,
    revisePhase, snapshotFor, originalMonths, originalRowTotal, originalGlTotal,
    originalDeptMonthly, originalDeptTotal, actualMonths, openRevise, setActual, pasteActuals,
    actualRowRef, importActuals, importBudgetFile, reconcileFile,
    canEdit, setCell, setMtp, mtp, setNote, submit, glNotUsed, setGlNotUsed,
    cellDetail, setCellDetail, clearDeptYear, clearAllDeptYear, clearMock,
    needRevision, mgrApprove, mgrReturn, lockPeriod, unlockPeriod, openPeriod, openBudgetRound, deletePeriod,
    addDepartment, toggleDepartment, addGL, addGLRow, assignGL, unassignGL, setRate, setFuelPrice,
    VOLUME_METRICS, volume, canEditVolume, setVolume,
    myNotifications, markNotificationsRead, notify,
    exportDetail, exportDeptSummary, exportPnl, exportBackup, restoreBackup,
    MONTH_TH, MONTH_S,
  };
})();

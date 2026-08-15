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
    const raw = localStorage.getItem(DB_KEY);
    db = null;
    if (raw) { try { db = JSON.parse(raw); } catch (e) { db = null; } }
    if (!db || db.meta?.schemaVersion !== SEED.meta.schemaVersion) {
      db = JSON.parse(JSON.stringify(SEED));
      db.meta.seededAt = new Date().toISOString();
      save();
    }
  }
  let afterSave = null; // hook สำหรับ Sync (ตั้งค่าโดย sync.js)
  function setAfterSave(fn) { afterSave = fn; }
  function saveSilent() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function save() { saveSilent(); if (afterSave) afterSave(); }
  function adoptDb(newDb) { db = newDb; saveSilent(); } // รับข้อมูลจาก Google Sheet มาแทนที่
  function resetDemo() { localStorage.removeItem(DB_KEY); load(); save(); }

  /* ---------- auth / session ---------- */
  function login(username, password) {
    const u = db.users.find(x => x.username === username && x.password === password);
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

  function deptGLs(deptId) {
    return db.departmentGL.filter(x => x.departmentId === deptId)
      .map(x => gl(x.glId)).filter(g => g && g.active)
      .sort((a, b) => a.code.localeCompare(b.code));
  }
  function budgetRow(year, deptId, glId) {
    return db.budgets.find(b => b.year === Number(year) && b.departmentId === deptId && b.glId === glId) || null;
  }
  function months(year, deptId, glId) {
    const r = budgetRow(year, deptId, glId);
    return r ? r.months : Array(12).fill(null);
  }
  const sum = arr => arr.reduce((s, v) => s + (v ?? 0), 0);
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
  function note(year, deptId, glId) {
    return db.glNotes.find(n => n.year === Number(year) && n.departmentId === deptId && n.glId === glId)
      || { year: Number(year), departmentId: deptId, glId, reason: '', assumption: '' };
  }
  function deptState(year, deptId) {
    return db.deptStatus.find(s => s.year === Number(year) && s.departmentId === deptId)
      || { year: Number(year), departmentId: deptId, status: 'DRAFT', submittedAt: null, revisionNote: null };
  }
  function completion(year, deptId) {
    const gls = deptGLs(deptId);
    if (!gls.length) return { filled: 0, total: 0, pct: 0 };
    let filled = 0, total = gls.length * 12;
    gls.forEach(g => months(year, deptId, g.id).forEach(v => { if (v !== null && v !== undefined) filled++; }));
    return { filled, total, pct: total ? Math.round(filled / total * 100) : 0 };
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
    deptGLs(deptId).forEach(g => {
      const m = months(year, deptId, g.id);
      m.forEach((v, i) => {
        if (v === null || v === undefined) errors.push(`GL ${g.code} — ${MONTH_TH[i]} ยังไม่ได้กรอก`);
        else if (v < 0) errors.push(`GL ${g.code} — ${MONTH_TH[i]} เป็นตัวเลขติดลบ (${v})`);
      });
      const row = budgetRow(year, deptId, g.id);
      if (!row || row.mtp1 === null || row.mtp1 === undefined) errors.push(`GL ${g.code} — งบปี ${Number(year) + 1} (MTP) ยังไม่ได้กรอก`);
      if (!row || row.mtp2 === null || row.mtp2 === undefined) errors.push(`GL ${g.code} — งบปี ${Number(year) + 2} (MTP) ยังไม่ได้กรอก`);
      const n = note(year, deptId, g.id);
      const cmp = compare(sum(m), glTotal(Number(year) - 1, deptId, g.id));
      const an = glAnomaly(cmp);
      if (an) {
        warnings.push(`GL ${g.code} ${g.name}: ${an.msg}`);
        if (!n.reason.trim()) warnings.push(`GL ${g.code} มีการเปลี่ยนแปลงผิดปกติ แต่ยังไม่ได้ระบุสาเหตุเพิ่ม/ลด`);
      }
    });
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

  /* ---------- mutations: USER ---------- */
  function setCell(actor, year, deptId, glId, monthIdx, value) {
    assertUserCanEdit(actor, year, deptId);
    if (value !== null && (typeof value !== 'number' || !isFinite(value))) throw new Error('ค่าไม่ถูกต้อง');
    let row = budgetRow(year, deptId, glId);
    if (!row) {
      row = { year: Number(year), departmentId: deptId, glId, months: Array(12).fill(null), updatedAt: null, updatedBy: null };
      db.budgets.push(row);
    }
    if (row.notUsed) throw new Error('GL นี้ถูกทำเครื่องหมาย "ไม่ได้ใช้" — กดปุ่ม ↩ เพื่อกลับมากรอกก่อน');
    const old = row.months[monthIdx];
    if (old === value) return false;
    row.months[monthIdx] = value;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    audit(actor, 'แก้ไขงบประมาณ', { deptId, glCode: gl(glId)?.code, month: monthIdx + 1, oldValue: old, newValue: value });
    const st = deptState(year, deptId);
    if (st.status === 'DRAFT') setStatusInternal(year, deptId, 'IN_PROGRESS');
    save();
    return true;
  }
  function setMtp(actor, year, deptId, glId, which, value) { // which: 1 | 2
    assertUserCanEdit(actor, year, deptId);
    if (value !== null && (typeof value !== 'number' || !isFinite(value))) throw new Error('ค่าไม่ถูกต้อง');
    let row = budgetRow(year, deptId, glId);
    if (!row) {
      row = { year: Number(year), departmentId: deptId, glId, months: Array(12).fill(null), mtp1: null, mtp2: null, updatedAt: null, updatedBy: null };
      db.budgets.push(row);
    }
    if (row.notUsed) throw new Error('GL นี้ถูกทำเครื่องหมาย "ไม่ได้ใช้" — กดปุ่ม ↩ เพื่อกลับมากรอกก่อน');
    const key = which === 1 ? 'mtp1' : 'mtp2';
    const old = row[key];
    if (old === value) return false;
    row[key] = value;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    audit(actor, `แก้ไขงบ MTP ปี ${Number(year) + which}`, { deptId, glCode: gl(glId)?.code, oldValue: old, newValue: value });
    save();
    return true;
  }
  function mtp(year, deptId, glId) {
    const r = budgetRow(year, deptId, glId);
    return { mtp1: r?.mtp1 ?? null, mtp2: r?.mtp2 ?? null };
  }
  /* ---------- รายละเอียดค่าใช้จ่ายรายช่อง (breakdown ต่อ GL×เดือน) ----------
   * เก็บถาวรใน db.cellDetails — ตรวจย้อนหลังได้แม้งบถูก Lock แล้ว */
  function cellDetail(year, deptId, glId, monthIdx) {
    return (db.cellDetails || []).find(x =>
      x.year === Number(year) && x.departmentId === deptId && x.glId === glId && x.month === monthIdx) || null;
  }
  function setCellDetail(actor, year, deptId, glId, monthIdx, items) {
    assertUserCanEdit(actor, year, deptId);
    if (!db.cellDetails) db.cellDetails = [];
    const clean = (items || [])
      .map(it => ({ desc: String(it.desc || '').trim(), amount: it.amount }))
      .filter(it => typeof it.amount === 'number' && isFinite(it.amount));
    const idx = db.cellDetails.findIndex(x =>
      x.year === Number(year) && x.departmentId === deptId && x.glId === glId && x.month === monthIdx);
    if (!clean.length) {
      // ไม่มีรายการ = ลบรายละเอียดทิ้ง (ตัวเลขในช่องคงเดิม)
      if (idx >= 0) {
        db.cellDetails.splice(idx, 1);
        audit(actor, 'ลบรายละเอียดค่าใช้จ่าย', { deptId, glCode: gl(glId)?.code, month: monthIdx + 1 });
        save();
      }
      return { cleared: true };
    }
    const sum = clean.reduce((s, it) => s + it.amount, 0);
    setCell(actor, year, deptId, glId, monthIdx, sum); // ลงยอดรวมในช่องหลัก (audit + สถานะ อัตโนมัติ)
    const rec = { year: Number(year), departmentId: deptId, glId, month: monthIdx,
                  items: clean, updatedAt: new Date().toISOString(), updatedBy: actor.name };
    if (idx >= 0) db.cellDetails[idx] = rec; else db.cellDetails.push(rec);
    audit(actor, 'บันทึกรายละเอียดค่าใช้จ่าย', { deptId, glCode: gl(glId)?.code, month: monthIdx + 1,
      newValue: clean.length + ' รายการ รวม ' + Math.round(sum).toLocaleString() + ' กีบ' });
    save();
    return { sum, count: clean.length };
  }

  const NOT_USED_REASON = 'ไม่ได้ใช้ GL นี้ในปีงบประมาณนี้';
  function glNotUsed(year, deptId, glId) {
    return !!budgetRow(year, deptId, glId)?.notUsed;
  }
  function setGlNotUsed(actor, year, deptId, glId, flag) {
    assertUserCanEdit(actor, year, deptId);
    let row = budgetRow(year, deptId, glId);
    if (!row) {
      row = { year: Number(year), departmentId: deptId, glId, months: Array(12).fill(null), mtp1: null, mtp2: null, updatedAt: null, updatedBy: null };
      db.budgets.push(row);
    }
    if (!!row.notUsed === !!flag) return;
    let n = db.glNotes.find(x => x.year === Number(year) && x.departmentId === deptId && x.glId === glId);
    if (flag) {
      row.stash = { months: row.months.slice(), mtp1: row.mtp1, mtp2: row.mtp2 };
      row.months = Array(12).fill(0);
      row.mtp1 = 0; row.mtp2 = 0; row.notUsed = true;
      if (!n) { n = { year: Number(year), departmentId: deptId, glId, reason: '', assumption: '' }; db.glNotes.push(n); }
      if (!n.reason.trim()) n.reason = NOT_USED_REASON;
      audit(actor, 'ทำเครื่องหมาย "ไม่ได้ใช้ GL นี้"', { deptId, glCode: gl(glId)?.code });
    } else {
      row.notUsed = false;
      if (row.stash) {
        row.months = row.stash.months; row.mtp1 = row.stash.mtp1; row.mtp2 = row.stash.mtp2;
        delete row.stash;
      }
      if (n && n.reason === NOT_USED_REASON) n.reason = '';
      audit(actor, 'ยกเลิก "ไม่ได้ใช้ GL นี้" กลับมากรอก', { deptId, glCode: gl(glId)?.code });
    }
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    if (deptState(year, deptId).status === 'DRAFT') setStatusInternal(year, deptId, 'IN_PROGRESS');
    save();
  }
  function setNote(actor, year, deptId, glId, reason, assumption) {
    assertUserCanEdit(actor, year, deptId);
    let n = db.glNotes.find(x => x.year === Number(year) && x.departmentId === deptId && x.glId === glId);
    if (!n) { n = { year: Number(year), departmentId: deptId, glId, reason: '', assumption: '' }; db.glNotes.push(n); }
    const changed = n.reason !== reason || n.assumption !== assumption;
    n.reason = reason; n.assumption = assumption;
    if (changed) audit(actor, 'แก้ไขสาเหตุ/สมมติฐาน', { deptId, glCode: gl(glId)?.code, newValue: (reason || assumption || '').slice(0, 120) });
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

  /* ---------- mutations: ACCOUNTING ---------- */
  function needRevision(actor, year, deptId, noteMsg) {
    assertAccounting(actor);
    setStatusInternal(year, deptId, 'NEED_REVISION', { revisionNote: noteMsg || null });
    audit(actor, 'ตีกลับให้แก้ไข (Need Revision)', { deptId, newValue: noteMsg });
    notify({ deptId }, `งบประมาณปี ${year} ถูกส่งกลับให้แก้ไข${noteMsg ? ' — ' + noteMsg : ''}`);
    save();
  }
  function lockPeriod(actor, year) {
    assertAccounting(actor);
    const p = period(year);
    if (!p) throw new Error('ไม่พบรอบงบประมาณ');
    p.status = 'CLOSED'; p.lockedAt = new Date().toISOString(); p.lockedBy = actor.name;
    activeDepartments().forEach(d => {
      setStatusInternal(year, d.id, 'LOCKED');
      notify({ deptId: d.id }, `รอบงบประมาณปี ${year} ถูกปิดและ Lock แล้ว ไม่สามารถแก้ไขข้อมูลได้`);
    });
    audit(actor, 'Lock รอบงบประมาณ', { newValue: `ปี ${year}` });
    save();
  }
  function unlockPeriod(actor, year) {
    assertAccounting(actor); // สิทธิ์พิเศษ — UI บังคับยืนยัน 2 ชั้น
    const p = period(year);
    if (!p) throw new Error('ไม่พบรอบงบประมาณ');
    p.status = 'OPEN'; p.lockedAt = null; p.lockedBy = null;
    activeDepartments().forEach(d => {
      const s = deptState(year, d.id);
      if (s.status === 'LOCKED') setStatusInternal(year, d.id, 'SUBMITTED');
    });
    audit(actor, 'Unlock รอบงบประมาณ (สิทธิ์พิเศษ)', { newValue: `ปี ${year}` });
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
  function addGL(actor, code, name, glGroup) {
    assertAccounting(actor);
    if (db.glAccounts.some(g => g.code === code)) throw new Error('รหัส GL ซ้ำ');
    const g = { id: 'g' + code, code, name, glGroup: glGroup || 'อื่นๆ', active: true };
    db.glAccounts.push(g);
    audit(actor, 'เพิ่ม GL', { glCode: code, newValue: name });
    save();
    return g;
  }
  function assignGL(actor, deptId, glId) {
    assertAccounting(actor);
    if (db.departmentGL.some(x => x.departmentId === deptId && x.glId === glId)) return;
    db.departmentGL.push({ departmentId: deptId, glId });
    audit(actor, 'มอบหมาย GL ให้หน่วยงาน', { deptId, glCode: gl(glId)?.code });
    save();
  }
  function unassignGL(actor, deptId, glId) {
    assertAccounting(actor);
    const hasData = db.budgets.some(b => b.departmentId === deptId && b.glId === glId && b.months.some(v => v));
    if (hasData) throw new Error('GL นี้มีข้อมูลงบประมาณแล้ว ไม่สามารถถอดออกได้');
    db.departmentGL = db.departmentGL.filter(x => !(x.departmentId === deptId && x.glId === glId));
    audit(actor, 'ถอด GL ออกจากหน่วยงาน', { deptId, glCode: gl(glId)?.code });
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

  /* ---------- export ---------- */
  function csv(rows) { // rows: array of arrays → CSV string (Excel-ready, BOM UTF-8)
    const esc = v => {
      v = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  }
  function download(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const MONTH_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  function exportDetail(year) {
    const rows = [['หน่วยงาน','รหัส GL','ชื่อบัญชี', ...MONTH_S.map(m => `${m} ${year}`), `รวมปี ${year}`, `รวมปี ${year - 1}`, 'ผลต่าง', '% เปลี่ยนแปลง', `ปี ${year + 1} (MTP)`, `ปี ${year + 2} (MTP)`, 'สมมติฐาน', 'สาเหตุเพิ่ม/ลด']];
    activeDepartments().forEach(d => deptGLs(d.id).forEach(g => {
      const m = months(year, d.id, g.id);
      const cur = sum(m), prev = glTotal(year - 1, d.id, g.id);
      const n = note(year, d.id, g.id);
      const t = mtp(year, d.id, g.id);
      rows.push([d.name, g.code, g.name, ...m.map(v => v ?? ''), cur, prev, cur - prev,
        prev !== 0 ? ((cur - prev) / Math.abs(prev) * 100).toFixed(1) + '%' : (cur ? 'ใหม่' : '0%'),
        t.mtp1 ?? '', t.mtp2 ?? '', n.assumption, n.reason]);
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

  load();

  return {
    get db() { return db; },
    save, saveSilent, setAfterSave, adoptDb, resetDemo,
    login, logout, currentUser,
    dept, gl, glByCode, period, activeDepartments, deptGLs,
    months, glTotal, deptTotal, companyTotal, deptMonthly, companyMonthly,
    note, deptState, completion, compare, glAnomaly, deptAnomalies, validate,
    canEdit, setCell, setMtp, mtp, setNote, submit, glNotUsed, setGlNotUsed,
    cellDetail, setCellDetail,
    needRevision, lockPeriod, unlockPeriod, openPeriod,
    addDepartment, toggleDepartment, addGL, assignGL, unassignGL, setRate,
    myNotifications, markNotificationsRead, notify,
    exportDetail, exportDeptSummary,
    MONTH_TH, MONTH_S,
  };
})();

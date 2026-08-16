/** =============================================================
 * Annual Budget Planner — Google Apps Script Backend (v3.4)
 * ผูกแอปเข้ากับ Google Sheet "บัญชี" (ดาต้าเบสหลัก)
 * https://docs.google.com/spreadsheets/d/1KiE6hk3FJTF4QSk_nYgUwYXynCFFE__J3pcTBdeRhDo/edit
 *
 * ── วิธีติดตั้ง (ทำครั้งเดียว ~2 นาที) ─────────────────────────
 * 1. เปิดชีท "บัญชี" (ลิงก์ด้านบน) แล้วไปที่เมนู  ส่วนขยาย (Extensions) → Apps Script
 * 2. ลบโค้ดเดิมในไฟล์ Code.gs แล้ววางโค้ดไฟล์นี้ทั้งหมด → กด Save (Ctrl+S)
 * 3. กด Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy
 *    (ถ้ามีถามสิทธิ์เพิ่ม ให้กด Authorize อีกครั้ง — เวอร์ชันนี้ใช้ trigger ตั้งเวลา)
 * 4. URL /exec เดิมใช้ได้ต่อ ไม่ต้องตั้งค่าในแอปใหม่
 *
 * ── หลักการทำงาน (เวอร์ชัน 62 แผนก) ───────────────────────────
 * - ข้อมูลจริง (canonical) เก็บเป็น JSON ในชีทซ่อนชื่อ "_DB" (กันชนกันด้วย LockService + rev)
 * - การบันทึกจากแอปจะเขียน _DB แล้วตอบกลับทันที (เร็ว)
 *   ชีทอ่านง่าย (MASTER_* และ 1 แผนก 1 sheet) จะถูกสร้างตามหลังอัตโนมัติ
 *   ภายใน ~1-2 นาที ด้วย trigger ตั้งเวลา (สร้างเฉพาะเมื่อมีข้อมูลใหม่)
 * - แท็บแผนกที่ถูกยุบ/เปลี่ยนชื่อ จะถูกลบเฉพาะแท็บที่สคริปต์เคยสร้างเอง
 *   ⚠ ชีทมุมมองเป็น "สำหรับอ่าน" — แก้ตัวเลขในชีทตรงๆ จะไม่ย้อนกลับเข้าแอป
 * ============================================================= */

var DB_SHEET = '_DB';
var CHUNK = 40000; // ตัวอักษรต่อเซลล์ (จำกัด 50,000/เซลล์)
var FALLBACK_SPREADSHEET_ID = '1KiE6hk3FJTF4QSk_nYgUwYXynCFFE__J3pcTBdeRhDo'; // ชีท "บัญชี"
var MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function ss_() {
  try { var s = SpreadsheetApp.getActive(); if (s) return s; } catch (e) {}
  return SpreadsheetApp.openById(FALLBACK_SPREADSHEET_ID);
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- HTTP endpoints ---------- */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'ping') return json_({ ok: true, app: 'AnnualBudgetPlanner', sheet: ss_().getName(), time: new Date().toISOString() });
    if (action === 'load') return json_({ ok: true, db: readDb_() });
    if (action === 'rebuild') { rebuildViewsIfDirty_(); return json_({ ok: true, rebuilt: true }); }
    return json_({ ok: false, reason: 'unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, reason: String(err) });
  }
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, reason: 'bad json' }); }
  if (req.action !== 'save' || !req.db) return json_({ ok: false, reason: 'unknown action' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (err) { return json_({ ok: false, reason: 'busy' }); }
  try {
    var cur = readDb_();
    var curRev = (cur && cur.meta && cur.meta.rev) || 0;
    var newRev = (req.db.meta && req.db.meta.rev) || 0;
    if (cur && newRev <= curRev) {
      // ข้อมูลบนชีทใหม่กว่า — ส่งกลับให้ client ปรับตาม
      return json_({ ok: false, reason: 'stale', db: cur });
    }
    writeDb_(req.db);
    // ทำเครื่องหมายว่ามีข้อมูลใหม่ → trigger จะสร้างชีทมุมมองตามหลัง (ตอบเร็ว ไม่ค้างหน้าแอป)
    PropertiesService.getScriptProperties().setProperty('abp_dirty_rev', String(newRev));
    ensureTrigger_();
    return json_({ ok: true, rev: newRev, time: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, reason: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- trigger สร้างชีทมุมมองตามหลัง ---------- */
function ensureTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'rebuildViewsIfDirty_';
  });
  if (!has) {
    ScriptApp.newTrigger('rebuildViewsIfDirty_').timeBased().everyMinutes(1).create();
  }
}
function rebuildViewsIfDirty_() {
  var props = PropertiesService.getScriptProperties();
  var dirty = props.getProperty('abp_dirty_rev');
  var built = props.getProperty('abp_built_rev');
  if (!dirty || dirty === built) return; // ไม่มีข้อมูลใหม่ — จบเงียบๆ (ไม่กินเวลา)
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return; } // มีรอบอื่นทำอยู่ — รอรอบหน้า
  try {
    var db = readDb_();
    if (db) { rebuildViews_(db); props.setProperty('abp_built_rev', dirty); }
  } finally {
    lock.releaseLock();
  }
}

/* ---------- canonical DB (JSON ในชีทซ่อน) ---------- */
function readDb_() {
  var sh = ss_().getSheetByName(DB_SHEET);
  if (!sh || sh.getLastRow() === 0) return null;
  var vals = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  var s = vals.map(function (r) { return r[0]; }).join('');
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
function writeDb_(db) {
  var ss = ss_();
  var sh = ss.getSheetByName(DB_SHEET);
  if (!sh) { sh = ss.insertSheet(DB_SHEET); try { sh.hideSheet(); } catch (e) {} }
  sh.clearContents();
  var s = JSON.stringify(db);
  var rows = [];
  for (var i = 0; i < s.length; i += CHUNK) rows.push([s.substring(i, i + CHUNK)]);
  sh.getRange(1, 1, rows.length, 1).setValues(rows);
}

/* ---------- สร้างชีทอ่านง่าย: MASTER_* + 1 แผนก 1 sheet ---------- */
function writeView_(ss, name, rows) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  if (!rows.length) return;
  var w = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  var norm = rows.map(function (r) {
    var out = r.slice();
    while (out.length < w) out.push('');
    return out.map(function (v) { return v === null || v === undefined ? '' : v; });
  });
  sh.getRange(1, 1, norm.length, w).setValues(norm);
  sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e6e6e6');
  if (sh.getFrozenRows() === 0) sh.setFrozenRows(1);
}

function rebuildViews_(db) {
  var ss = ss_();
  var glById = {}, deptById = {};
  db.glAccounts.forEach(function (g) { glById[g.id] = g; });
  db.departments.forEach(function (d) { deptById[d.id] = d; });

  var viewNames = []; // แท็บที่สร้างรอบนี้ — ใช้เก็บกวาดแท็บเก่า
  var wv = function (name, rows) { viewNames.push(name); writeView_(ss, name, rows); };

  wv('MASTER_Departments', [['รหัสหน่วยงาน', 'ชื่อหน่วยงาน', 'ด้าน', 'สถานะ']].concat(
    db.departments.map(function (d) {
      var side = (db.meta && db.meta.sides && db.meta.sides[d.side]) || '';
      return [d.code, d.name, side, d.active ? 'ACTIVE' : 'INACTIVE'];
    })));

  wv('MASTER_GL', [['รหัส GL', 'ชื่อบัญชี', 'กลุ่มบัญชี', 'สถานะ']].concat(
    db.glAccounts.slice().sort(function (a, b) { return a.code < b.code ? -1 : 1; })
      .map(function (g) { return [g.code, g.name, g.glGroup, g.active ? 'ACTIVE' : 'INACTIVE']; })));

  var cctById = {};
  (db.cctMaster || []).forEach(function (c) { cctById[c.code] = c.name; });

  wv('MASTER_Assign', [['รหัสหน่วยงาน', 'CCT', 'ชื่อหน่วยงานย่อย', 'รหัส GL', 'IO', 'code a']].concat(
    (db.departmentRows || []).map(function (x) {
      return [deptById[x.departmentId] ? deptById[x.departmentId].code : x.departmentId,
              x.cct, cctById[x.cct] || '', glById[x.glId] ? glById[x.glId].code : x.glId,
              x.io || '', x.codeA || ''];
    })));

  wv('MASTER_Rates', [['ปีงบ', 'สกุลเงิน', 'กีบ / 1 หน่วย']].concat(
    db.exchangeRates.map(function (r) { return [r.year, r.currency, r.rateToLAK]; })));

  wv('MASTER_FuelPrices', [['ปีงบ', 'ชนิดน้ำมัน', 'ราคา (กีบ/ลิตร)']].concat(
    db.fuelPrices.map(function (f) { return [f.year, f.fuelType, f.pricePerLiter]; })));

  wv('MASTER_Periods', [['ปีงบ', 'สถานะ', 'Phase', 'เกิดจริงถึงเดือน', 'Lock เมื่อ', 'Lock โดย']].concat(
    db.budgetPeriods.map(function (p) {
      return [p.year, p.status, p.phase === 'REVISE' ? 'REVISE' : 'ORIGINAL',
              p.actualThru || '', p.lockedAt || '', p.lockedBy || ''];
    })));

  /* ---- index ล่วงหน้า (เร็วกว่า filter ซ้อนมากเมื่อมี 1,812 แถว × 62 แผนก) ---- */
  var key = function (y, dept, gl, cct) { return y + '|' + dept + '|' + gl + '|' + cct; };
  var budgetByKey = {}, noteByKey = {}, actualByKey = {}, snapByKey = {};
  var budgetYearsByDept = {}; // dept -> {year: true} เอาไว้ข้ามปีที่แผนกไม่มีข้อมูล
  db.budgets.forEach(function (b) {
    budgetByKey[key(b.year, b.departmentId, b.glId, b.cct)] = b;
    (budgetYearsByDept[b.departmentId] = budgetYearsByDept[b.departmentId] || {})[b.year] = true;
  });
  db.glNotes.forEach(function (n) { noteByKey[n.year + '|' + n.departmentId + '|' + n.rowKey] = n; });
  (db.actuals || []).forEach(function (a) { actualByKey[key(a.year, a.departmentId, a.glId, a.cct)] = a; });
  (db.budgetSnapshots || []).forEach(function (s) {
    if (s.label !== 'ORIGINAL') return;
    s.rows.forEach(function (r) { snapByKey[key(s.year, r.departmentId, r.glId, r.cct)] = r; });
  });
  var snapYears = {};
  (db.budgetSnapshots || []).forEach(function (s) { if (s.label === 'ORIGINAL') snapYears[s.year] = true; });

  var asgByDept = {};
  (db.departmentRows || []).forEach(function (x) {
    (asgByDept[x.departmentId] = asgByDept[x.departmentId] || []).push(x);
  });
  var stByDeptYear = {};
  db.deptStatus.forEach(function (s) { stByDeptYear[s.year + '|' + s.departmentId] = s.status; });

  // 1 แผนก (ที่เปิดใช้งาน) = 1 sheet — ระดับแถว CCT × GL พร้อม IO/code a
  var years = db.budgetPeriods.map(function (p) { return p.year; }).sort();
  db.departments.filter(function (d) { return d.active; }).forEach(function (d) {
    var asg = (asgByDept[d.id] || []).slice().sort(function (a, b) {
      var ga = glById[a.glId] ? glById[a.glId].code : '', gb = glById[b.glId] ? glById[b.glId].code : '';
      return ga < gb ? -1 : (ga > gb ? 1 : (a.cct < b.cct ? -1 : 1));
    });
    var rows = [['ปีงบ', 'code a', 'IO', 'CCT', 'หน่วยงานย่อย', 'รหัส GL', 'ชื่อบัญชี'].concat(MONTHS)
      .concat(['รวมทั้งปี', 'งบเดิมทั้งปี', 'เพิ่ม-ลดระหว่างปี', 'เกิดจริงสะสม',
               'MTP ปี+1', 'MTP ปี+2', 'ไม่ได้ใช้', 'สมมติฐาน', 'สาเหตุเพิ่ม/ลด', 'สถานะแผนก'])];
    years.forEach(function (y) {
      if (!(budgetYearsByDept[d.id] || {})[y]) return; // แผนกนี้ไม่มีข้อมูลปีนี้ — ข้าม
      var st = stByDeptYear[y + '|' + d.id] || 'DRAFT';
      var hasSnap = !!snapYears[y];
      asg.forEach(function (a) {
        var g = glById[a.glId]; if (!g) return;
        var rowKey = a.glId + '@' + a.cct;
        var row = budgetByKey[key(y, d.id, a.glId, a.cct)] || null;
        var m = row ? row.months : [null, null, null, null, null, null, null, null, null, null, null, null];
        var note = noteByKey[y + '|' + d.id + '|' + rowKey] || {};
        var total = m.reduce(function (s2, v) { return s2 + (v || 0); }, 0);
        var origTotal = '', delta = '', actSum = '';
        if (hasSnap) {
          var sr = snapByKey[key(y, d.id, a.glId, a.cct)] || null;
          origTotal = sr ? sr.months.reduce(function (s4, v) { return s4 + (v || 0); }, 0) : 0;
          delta = total - origTotal;
          var ar = actualByKey[key(y, d.id, a.glId, a.cct)] || null;
          actSum = ar ? ar.months.reduce(function (s5, v) { return s5 + (v || 0); }, 0) : 0;
        }
        rows.push([y, a.codeA || '', a.io || '', a.cct, cctById[a.cct] || '', g.code, g.name]
          .concat(m.map(function (v) { return v === null || v === undefined ? '' : v; }))
          .concat([total, origTotal, delta, actSum,
                   row && row.mtp1 !== null && row.mtp1 !== undefined ? row.mtp1 : '',
                   row && row.mtp2 !== null && row.mtp2 !== undefined ? row.mtp2 : '',
                   row && row.notUsed ? 'YES' : '', note.assumption || '', note.reason || '', st]));
      });
    });
    wv((d.code + ' ' + d.name.replace(/แผนก/g, '').replace(/[\/\\\?\*\[\]:]/g, '-')).substring(0, 90), rows);
  });

  /* ---- เก็บกวาด: ลบแท็บที่สคริปต์เคยสร้างแต่รอบนี้ไม่ได้สร้างแล้ว ----
     1) ชื่อที่อยู่ในรายการ abp_view_tabs (แท็บที่เวอร์ชันนี้เคยสร้าง)
     2) แท็บตกค้างจากโค้ดรุ่นเก่า: ชื่อขึ้นต้นรหัสแผนก 4 หลัก และ A1 = 'ปีงบ'
        (ลายเซ็นของแท็บที่สคริปต์สร้าง — ไม่แตะแท็บอื่นของผู้ใช้) */
  var props = PropertiesService.getScriptProperties();
  var prev = [];
  try { prev = JSON.parse(props.getProperty('abp_view_tabs') || '[]'); } catch (e2) {}
  var nowSet = {};
  viewNames.forEach(function (n) { nowSet[n] = true; });
  prev.forEach(function (n) {
    if (nowSet[n] || n === DB_SHEET) return;
    var sh = ss.getSheetByName(n);
    if (sh) { try { ss.deleteSheet(sh); } catch (e3) {} }
  });
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (nowSet[n] || n === DB_SHEET) return;
    if (!/^\d{4} /.test(n)) return;
    try {
      if (String(sh.getRange(1, 1).getValue()) === 'ปีงบ') ss.deleteSheet(sh);
    } catch (e4) {}
  });
  props.setProperty('abp_view_tabs', JSON.stringify(viewNames));
}

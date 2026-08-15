/** =============================================================
 * Annual Budget Planner — Google Apps Script Backend
 * ผูกแอปเข้ากับ Google Sheet "บัญชี" (ดาต้าเบสหลัก)
 * https://docs.google.com/spreadsheets/d/1KiE6hk3FJTF4QSk_nYgUwYXynCFFE__J3pcTBdeRhDo/edit
 *
 * ── วิธีติดตั้ง (ทำครั้งเดียว ~2 นาที) ─────────────────────────
 * 1. เปิดชีท "บัญชี" (ลิงก์ด้านบน) แล้วไปที่เมนู  ส่วนขยาย (Extensions) → Apps Script
 * 2. ลบโค้ดเดิมในไฟล์ Code.gs แล้ววางโค้ดไฟล์นี้ทั้งหมด → กด Save (Ctrl+S)
 * 3. กด Deploy → New deployment → เลือกประเภท "Web app"
 *      - Execute as:      Me (บัญชีของคุณ)
 *      - Who has access:  Anyone
 *    → กด Deploy → อนุญาตสิทธิ์ (Authorize) → คัดลอก "Web app URL" (ลงท้าย /exec)
 * 4. ในแอป: login เป็น accounting → Budget Control → การ์ด "เชื่อมต่อ Google Sheet"
 *    → วาง URL → กด "บันทึก & ทดสอบ"
 *
 * ── หลักการทำงาน ───────────────────────────────────────────────
 * - ข้อมูลจริง (canonical) เก็บเป็น JSON ในชีทซ่อนชื่อ "_DB" (กันชนกันด้วย LockService + rev)
 * - ทุกครั้งที่บันทึก ระบบจะสร้างชีทอ่านง่าย (MASTER_* และ 1 แผนก 1 sheet) ให้อัตโนมัติ
 *   ⚠ ชีทเหล่านั้นเป็น "มุมมองสำหรับอ่าน" — แก้ตัวเลขในชีทตรงๆ จะไม่ย้อนกลับเข้าแอป
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
    rebuildViews_(req.db);
    return json_({ ok: true, rev: newRev, time: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, reason: String(err) });
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

  writeView_(ss, 'MASTER_Departments', [['รหัสหน่วยงาน', 'ชื่อหน่วยงาน', 'สถานะ']].concat(
    db.departments.map(function (d) { return [d.code, d.name, d.active ? 'ACTIVE' : 'INACTIVE']; })));

  writeView_(ss, 'MASTER_GL', [['รหัส GL', 'ชื่อบัญชี', 'กลุ่มบัญชี', 'สถานะ']].concat(
    db.glAccounts.slice().sort(function (a, b) { return a.code < b.code ? -1 : 1; })
      .map(function (g) { return [g.code, g.name, g.glGroup, g.active ? 'ACTIVE' : 'INACTIVE']; })));

  writeView_(ss, 'MASTER_Assign', [['รหัสหน่วยงาน', 'รหัส GL']].concat(
    db.departmentGL.map(function (x) {
      return [deptById[x.departmentId] ? deptById[x.departmentId].code : x.departmentId,
              glById[x.glId] ? glById[x.glId].code : x.glId];
    })));

  writeView_(ss, 'MASTER_Rates', [['ปีงบ', 'สกุลเงิน', 'กีบ / 1 หน่วย']].concat(
    db.exchangeRates.map(function (r) { return [r.year, r.currency, r.rateToLAK]; })));

  writeView_(ss, 'MASTER_FuelPrices', [['ปีงบ', 'ชนิดน้ำมัน', 'ราคา (กีบ/ลิตร)']].concat(
    db.fuelPrices.map(function (f) { return [f.year, f.fuelType, f.pricePerLiter]; })));

  writeView_(ss, 'MASTER_Periods', [['ปีงบ', 'สถานะ', 'Lock เมื่อ', 'Lock โดย']].concat(
    db.budgetPeriods.map(function (p) { return [p.year, p.status, p.lockedAt || '', p.lockedBy || '']; })));

  // 1 แผนก (ที่เปิดใช้งาน) = 1 sheet
  var years = db.budgetPeriods.map(function (p) { return p.year; }).sort();
  db.departments.filter(function (d) { return d.active; }).forEach(function (d) {
    var glIds = db.departmentGL.filter(function (x) { return x.departmentId === d.id; })
      .map(function (x) { return x.glId; })
      .sort(function (a, b) { return (glById[a] ? glById[a].code : '') < (glById[b] ? glById[b].code : '') ? -1 : 1; });
    var rows = [['ปีงบ', 'รหัส GL', 'ชื่อบัญชี'].concat(MONTHS)
      .concat(['รวมทั้งปี', 'MTP ปี+1', 'MTP ปี+2', 'ไม่ได้ใช้', 'สมมติฐาน', 'สาเหตุเพิ่ม/ลด', 'สถานะแผนก'])];
    years.forEach(function (y) {
      var st = (db.deptStatus.filter(function (s) { return s.year === y && s.departmentId === d.id; })[0] || {}).status || 'DRAFT';
      glIds.forEach(function (glId) {
        var g = glById[glId]; if (!g) return;
        var row = (db.budgets.filter(function (b) { return b.year === y && b.departmentId === d.id && b.glId === glId; })[0]) || null;
        var m = row ? row.months : [null, null, null, null, null, null, null, null, null, null, null, null];
        var note = (db.glNotes.filter(function (n2) { return n2.year === y && n2.departmentId === d.id && n2.glId === glId; })[0]) || {};
        var total = m.reduce(function (s2, v) { return s2 + (v || 0); }, 0);
        rows.push([y, g.code, g.name].concat(m.map(function (v) { return v === null || v === undefined ? '' : v; }))
          .concat([total, row && row.mtp1 !== null && row.mtp1 !== undefined ? row.mtp1 : '',
                   row && row.mtp2 !== null && row.mtp2 !== undefined ? row.mtp2 : '',
                   row && row.notUsed ? 'YES' : '', note.assumption || '', note.reason || '', st]));
      });
    });
    writeView_(ss, (d.code + ' ' + d.name.replace('แผนก', '')).substring(0, 90), rows);
  });
}

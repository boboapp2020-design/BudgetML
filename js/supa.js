/* =============================================================
 * supa.js — Supabase (PostgreSQL) backend adapter
 *
 * แทน Google Sheet: เก็บข้อมูลเป็นตาราง relational จริง
 *  - loadAll()  : ดึงทุกตาราง → ประกอบกลับเป็น db object (รูปเดิมที่ store.js ใช้)
 *  - pushDiff() : เทียบกับ baseline ครั้งก่อน → upsert เฉพาะแถวที่เปลี่ยน + ลบแถวที่หาย
 *      → แต่ละแผนกแตะเฉพาะแถวของตัวเอง สองแผนกกรอกพร้อมกันไม่ชนกัน
 *  - URL + key เก็บใน localStorage (ไม่อยู่ใน repo)
 *
 * mapping: DB ใช้ snake_case, แอปใช้ camelCase — แปลงผ่าน toRow/fromRow ต่อ table
 * ============================================================= */

const Supa = (() => {
  // ⚙ สวิตช์บังคับ login จริง (Supabase Auth) — ตั้ง false = ปิด login ชั่วคราว (ใช้ anon เหมือนเดิม)
  //   เปิดกลับ: ตั้ง true แล้วรัน supabase/auth-setup.sql อีกครั้ง (users 73 คนยังอยู่ครบ)
  const AUTH_REQUIRED = false;

  const URL_KEY = 'abp_supa_url', KEY_KEY = 'abp_supa_key';
  const CHUNK = 500;      // แถวต่อ 1 request upsert
  const PAGE = 1000;      // แถวต่อ 1 request fetch (PostgREST cap)
  const SEP = '~|~';      // ตัวคั่น key ที่ไม่โผล่ในข้อมูลจริง

  const TOK_KEY = 'abp_sb_token', REF_KEY = 'abp_sb_refresh', UID_KEY = 'abp_sb_uid';
  const DEFAULT_URL = 'https://fdicsryxzyxuoxacxilz.supabase.co';
  const DEFAULT_KEY = 'sb_publishable_1iBfWSMLMRf-Be1E96zS9w_f5tf1rVT';
  const base = () => (localStorage.getItem(URL_KEY) || DEFAULT_URL).replace(/\/+$/, '');
  const key  = () => localStorage.getItem(KEY_KEY) || DEFAULT_KEY;
  const enabled = () => !!(base() && key());
  function setConfig(url, k) {
    url = (url || '').trim(); k = (k || '').trim();
    if (url && k) { localStorage.setItem(URL_KEY, url); localStorage.setItem(KEY_KEY, k); }
    else { localStorage.removeItem(URL_KEY); localStorage.removeItem(KEY_KEY); }
  }

  /* ---------- Auth (GoTrue): login จริง → JWT ต่อ request ----------
   * token (JWT ผู้ใช้) ใช้แทน anon key ใน Authorization → ผ่าน RLS ตามบทบาท
   * เก็บ refresh token ไว้ต่ออายุตอนเปิดแอปใหม่ (ไม่ต้อง login ซ้ำทุกครั้ง) */
  let token = localStorage.getItem(TOK_KEY) || null;
  const authed = () => !!token;
  function saveSession(d) {
    token = d.access_token || null;
    if (token) localStorage.setItem(TOK_KEY, token); else localStorage.removeItem(TOK_KEY);
    if (d.refresh_token) localStorage.setItem(REF_KEY, d.refresh_token);
    if (d.user && d.user.id) localStorage.setItem(UID_KEY, d.user.id);
  }
  async function authReq(pathQ, body) {
    const res = await fetch(base() + '/auth/v1/' + pathQ, {
      method: 'POST', headers: { apikey: key(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    let data = {}; try { data = txt ? JSON.parse(txt) : {}; } catch (e) {}
    if (!res.ok) {
      const msg = data.error_description || data.msg || data.message || ('auth ' + res.status);
      throw new Error(msg);
    }
    return data;
  }
  async function signIn(email, password) {
    const d = await authReq('token?grant_type=password', { email, password });
    saveSession(d);
    return d;                                   // { access_token, refresh_token, user }
  }
  async function refresh() {
    const rt = localStorage.getItem(REF_KEY);
    if (!rt) return false;
    try { saveSession(await authReq('token?grant_type=refresh_token', { refresh_token: rt })); return authed(); }
    catch (e) { signOut(); return false; }
  }
  function signOut() {
    token = null;
    localStorage.removeItem(TOK_KEY); localStorage.removeItem(REF_KEY); localStorage.removeItem(UID_KEY);
  }
  async function myProfile() {
    const uid = localStorage.getItem(UID_KEY);
    if (!uid) return null;
    const r = await req('GET', 'profiles?id=eq.' + uid + '&select=*');
    return (r && r.length) ? r[0] : null;
  }

  /* ---------- HTTP ---------- */
  async function req(method, path, body, prefer) {
    const bearer = (AUTH_REQUIRED && token) ? token : key();  // ปิด auth → ใช้ anon key เสมอ · เปิด → JWT ผู้ใช้ (RLS ตามบทบาท)
    const h = { apikey: key(), Authorization: 'Bearer ' + bearer };
    if (body) h['Content-Type'] = 'application/json';
    if (prefer) h['Prefer'] = prefer;
    let res = await fetch(base() + '/rest/v1/' + path, {
      method, headers: h, body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && token) {           // JWT หมดอายุ → ต่ออายุแล้วลองใหม่ 1 ครั้ง
      if (await refresh()) {
        h.Authorization = 'Bearer ' + token;
        res = await fetch(base() + '/rest/v1/' + path, {
          method, headers: h, body: body ? JSON.stringify(body) : undefined,
        });
      }
    }
    if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + (await res.text()).slice(0, 240));
    if (res.status === 204) return null;
    return (res.headers.get('content-type') || '').includes('json') ? res.json() : null;
  }
  async function fetchAll(table, select = '*') {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const r = await req('GET', `${table}?select=${select}&limit=${PAGE}&offset=${from}`);
      out.push(...r);
      if (r.length < PAGE) break;
    }
    return out;
  }
  async function upsert(table, rows) {
    for (let i = 0; i < rows.length; i += CHUNK)
      await req('POST', table, rows.slice(i, i + CHUNK), 'resolution=merge-duplicates,return=minimal');
  }
  async function delMany(table, pkList) {
    // ลบทีละแถวด้วย PK (จำกัด concurrency) — เคสลบเกิดไม่บ่อยและครั้งละไม่กี่แถว
    const N = 6;
    for (let i = 0; i < pkList.length; i += N) {
      await Promise.all(pkList.slice(i, i + N).map(pk => {
        const q = Object.entries(pk).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
        return req('DELETE', `${table}?${q}`, null, 'return=minimal');
      }));
    }
  }

  const nz = v => (v === undefined ? null : v);

  /* ---------- นิยามตาราง (เรียงตาม dependency: parent ก่อน child) ---------- */
  const TABLES = [
    { name: 'app_meta', pk: ['id'], single: true,
      list: db => [db.meta],
      toRow: m => ({ id: 'main', schema_version: nz(m.schemaVersion), rev: nz(m.rev) || 0,
        company: nz(m.company), currency: nz(m.currency), year_current: nz(m.yearCurrent),
        year_previous: nz(m.yearPrevious), app_name: nz(m.appName), sides: nz(m.sides) }),
    },
    { name: 'departments', pk: ['id'], assign: 'departments',
      list: db => db.departments,
      toRow: d => ({ id: d.id, code: d.code, name: d.name, name_en: nz(d.nameEn), side: nz(d.side), active: d.active !== false }),
      fromRow: r => ({ id: r.id, code: r.code, name: r.name, nameEn: r.name_en || '', side: r.side, active: r.active !== false }),
    },
    { name: 'gl_accounts', pk: ['id'], assign: 'glAccounts',
      list: db => db.glAccounts,
      toRow: g => ({ id: g.id, code: g.code, name: g.name, gl_group: nz(g.glGroup), io_group: nz(g.ioGroup), active: g.active !== false }),
      fromRow: r => ({ id: r.id, code: r.code, name: r.name, glGroup: r.gl_group || 'อื่นๆ', ioGroup: r.io_group || 'ไม่คุม', active: r.active !== false }),
    },
    { name: 'cct_master', pk: ['code'], assign: 'cctMaster',
      list: db => db.cctMaster,
      toRow: c => ({ code: c.code, name: nz(c.name), department_id: nz(c.departmentId) }),
      fromRow: r => ({ code: r.code, name: r.name, departmentId: r.department_id }),
    },
    { name: 'department_rows', pk: ['department_id', 'cct', 'gl_id'], assign: 'departmentRows',
      list: db => db.departmentRows || [],
      toRow: x => ({ department_id: x.departmentId, cct: x.cct, gl_id: x.glId, io: nz(x.io), code_a: nz(x.codeA) }),
      fromRow: r => ({ departmentId: r.department_id, cct: r.cct, glId: r.gl_id, io: r.io || '', codeA: r.code_a || '' }),
    },
    { name: 'budget_periods', pk: ['year'], assign: 'budgetPeriods',
      list: db => db.budgetPeriods,
      toRow: p => ({ year: p.year, status: nz(p.status), phase: nz(p.phase), actual_thru: nz(p.actualThru),
        opened_at: nz(p.openedAt), locked_at: nz(p.lockedAt), locked_by: nz(p.lockedBy),
        revise_opened_at: nz(p.reviseOpenedAt), revise_opened_by: nz(p.reviseOpenedBy) }),
      fromRow: r => ({ year: r.year, status: r.status, phase: r.phase || undefined, actualThru: r.actual_thru || undefined,
        openedAt: r.opened_at, lockedAt: r.locked_at, lockedBy: r.locked_by,
        reviseOpenedAt: r.revise_opened_at || undefined, reviseOpenedBy: r.revise_opened_by || undefined }),
    },
    { name: 'budgets', pk: ['year', 'department_id', 'gl_id', 'cct'], assign: 'budgets',
      list: db => db.budgets,
      toRow: b => ({ year: b.year, department_id: b.departmentId, gl_id: b.glId, cct: b.cct,
        months: b.months, mtp1: nz(b.mtp1), mtp2: nz(b.mtp2), sc: nz(b.sc), not_used: !!b.notUsed,
        updated_at: nz(b.updatedAt), updated_by: nz(b.updatedBy) }),
      fromRow: r => ({ year: r.year, departmentId: r.department_id, glId: r.gl_id, cct: r.cct,
        months: r.months, mtp1: r.mtp1, mtp2: r.mtp2, sc: r.sc || undefined, notUsed: !!r.not_used,
        updatedAt: r.updated_at, updatedBy: r.updated_by }),
    },
    { name: 'gl_notes', pk: ['year', 'department_id', 'row_key'], assign: 'glNotes',
      list: db => db.glNotes,
      toRow: n => ({ year: n.year, department_id: n.departmentId, row_key: n.rowKey, reason: nz(n.reason), assumption: nz(n.assumption) }),
      fromRow: r => ({ year: r.year, departmentId: r.department_id, rowKey: r.row_key, reason: r.reason || '', assumption: r.assumption || '' }),
    },
    { name: 'dept_status', pk: ['year', 'department_id'], assign: 'deptStatus',
      list: db => db.deptStatus,
      toRow: s => ({ year: s.year, department_id: s.departmentId, status: nz(s.status), submitted_at: nz(s.submittedAt), revision_note: nz(s.revisionNote) }),
      fromRow: r => ({ year: r.year, departmentId: r.department_id, status: r.status, submittedAt: r.submitted_at, revisionNote: r.revision_note }),
    },
    { name: 'cell_details', pk: ['year', 'department_id', 'row_key', 'month'], assign: 'cellDetails',
      list: db => db.cellDetails || [],
      toRow: c => ({ year: c.year, department_id: c.departmentId, row_key: c.rowKey, month: c.month, items: nz(c.items), updated_at: nz(c.updatedAt), updated_by: nz(c.updatedBy) }),
      fromRow: r => ({ year: r.year, departmentId: r.department_id, rowKey: r.row_key, month: r.month, items: r.items || [], updatedAt: r.updated_at, updatedBy: r.updated_by }),
    },
    { name: 'exchange_rates', pk: ['year', 'currency'], assign: 'exchangeRates',
      list: db => db.exchangeRates,
      toRow: r => ({ year: r.year, currency: r.currency, rate_to_lak: nz(r.rateToLAK) }),
      fromRow: r => ({ year: r.year, currency: r.currency, rateToLAK: r.rate_to_lak }),
    },
    { name: 'fuel_prices', pk: ['year', 'fuel_type'], assign: 'fuelPrices',
      list: db => db.fuelPrices,
      toRow: f => ({ year: f.year, fuel_type: f.fuelType, price_per_liter: nz(f.pricePerLiter) }),
      fromRow: r => ({ year: r.year, fuelType: r.fuel_type, pricePerLiter: r.price_per_liter }),
    },
    { name: 'actuals', pk: ['year', 'department_id', 'gl_id', 'cct'], assign: 'actuals',
      list: db => db.actuals || [],
      toRow: a => ({ year: a.year, department_id: a.departmentId, gl_id: a.glId, cct: a.cct, months: a.months, updated_at: nz(a.updatedAt), updated_by: nz(a.updatedBy) }),
      fromRow: r => ({ year: r.year, departmentId: r.department_id, glId: r.gl_id, cct: r.cct, months: r.months, updatedAt: r.updated_at, updatedBy: r.updated_by }),
    },
    { name: 'audit_logs', pk: ['id'], assign: 'auditLogs', appendOnly: true,
      list: db => db.auditLogs || [],
      toRow: l => ({ id: l.id, ts: nz(l.ts), user_id: nz(l.userId), user_name: nz(l.userName), action: nz(l.action),
        dept_id: nz(l.deptId), gl_code: nz(l.glCode), month: nz(l.month), old_value: nz(l.oldValue), new_value: nz(l.newValue) }),
      fromRow: r => ({ id: r.id, ts: r.ts, userId: r.user_id, userName: r.user_name, action: r.action,
        deptId: r.dept_id, glCode: r.gl_code, month: r.month, oldValue: r.old_value, newValue: r.new_value }),
    },
    { name: 'notifications', pk: ['id'], assign: 'notifications', appendOnly: true,
      list: db => db.notifications || [],
      toRow: n => ({ id: n.id, ts: nz(n.ts), target_role: nz(n.targetRole), target_dept_id: nz(n.targetDeptId), message: nz(n.message), read: !!n.read }),
      fromRow: r => ({ id: r.id, ts: r.ts, targetRole: r.target_role, targetDeptId: r.target_dept_id, message: r.message, read: !!r.read }),
    },
    // snapshots (nested) — meta + rows แยกตาราง
    { name: 'budget_snapshots', pk: ['year', 'label'],
      list: db => (db.budgetSnapshots || []).map(s => ({ year: s.year, label: s.label, created_at: nz(s.createdAt) })),
    },
    { name: 'ppt_amounts', pk: ['year', 'code'], assign: 'pptAmounts', optional: true, // จำนวนเงินหน้าต้นทุนต่อหน่วย (กรอกมือ)
      list: db => db.pptAmounts || [],
      toRow: p => ({ year: p.year, code: p.code, amount: nz(p.amount), updated_at: nz(p.updatedAt), updated_by: nz(p.updatedBy) }),
      fromRow: r => ({ year: r.year, code: r.code, amount: r.amount, updatedAt: r.updated_at, updatedBy: r.updated_by }),
    },
    { name: 'ppt_submits', pk: ['year', 'dept_code'], assign: 'pptSubmits', optional: true, // สถานะส่งต้นทุน PPT
      list: db => db.pptSubmits || [],
      toRow: s => ({ year: s.year, dept_code: s.deptCode, submitted_at: nz(s.submittedAt), submitted_by: nz(s.submittedBy) }),
      fromRow: r => ({ year: r.year, deptCode: r.dept_code, submittedAt: r.submitted_at, submittedBy: r.submitted_by }),
    },
    { name: 'prod_volumes', pk: ['year', 'metric'], assign: 'prodVolumes', optional: true, // ตารางใหม่ — ข้ามเงียบๆ ถ้ายังไม่รัน prod-volumes.sql
      list: db => db.prodVolumes || [],
      toRow: p => ({ year: p.year, metric: p.metric, plan: nz(p.plan), actual: nz(p.actual), updated_at: nz(p.updatedAt), updated_by: nz(p.updatedBy) }),
      fromRow: r => ({ year: r.year, metric: r.metric, plan: r.plan, actual: r.actual, updatedAt: r.updated_at, updatedBy: r.updated_by }),
    },
    { name: 'change_windows', pk: ['year', 'win'], assign: 'changeWindows', optional: true, // หน้าต่างปรับงบ (เปิด/ปิด ราย ปี×ช่วง)
      list: db => db.changeWindows || [],
      toRow: w => ({ year: w.year, win: w.window, open: !!w.open, opened_at: nz(w.openedAt), opened_by: nz(w.openedBy) }),
      fromRow: r => ({ year: r.year, window: r.win, open: !!r.open, openedAt: r.opened_at, openedBy: r.opened_by }),
    },
    { name: 'change_requests', pk: ['id'], assign: 'changeRequests', optional: true, // คำร้องปรับงบกลางปี (ขอเพิ่ม/ลด/โยก)
      list: db => db.changeRequests || [],
      toRow: r => ({ id: r.id, year: r.year, win: nz(r.window), type: r.type, dept_id: r.deptId,
        created_by: nz(r.createdBy), created_at: nz(r.createdAt), reason: nz(r.reason), memo_note: nz(r.memoNote),
        memo_file: nz(r.memoFile), items: r.items || [], to_dept_id: nz(r.toDeptId), status: r.status,
        mgr_by: nz(r.mgrBy), mgr_at: nz(r.mgrAt), mgr_note: nz(r.mgrNote),
        acc_by: nz(r.accBy), acc_at: nz(r.accAt), acc_note: nz(r.accNote), applied_at: nz(r.appliedAt) }),
      fromRow: r => ({ id: r.id, year: r.year, window: r.win || null, type: r.type, deptId: r.dept_id,
        createdBy: r.created_by, createdAt: r.created_at, reason: r.reason || '', memoNote: r.memo_note || '',
        memoFile: r.memo_file || null, items: r.items || [], toDeptId: r.to_dept_id, status: r.status,
        mgrBy: r.mgr_by, mgrAt: r.mgr_at, mgrNote: r.mgr_note,
        accBy: r.acc_by, accAt: r.acc_at, accNote: r.acc_note, appliedAt: r.applied_at }),
    },
    { name: 'user_emails', pk: ['code'], assign: 'userEmails', optional: true, // อีเมลราย code (รหัสแผนก/ROLE) — ใช้กับ EmailBridge
      list: db => db.userEmails || [],
      toRow: u => ({ code: u.code, emails: u.emails || [] }),
      fromRow: r => ({ code: r.code, emails: r.emails || [] }),
    },
    { name: 'snapshot_rows', pk: ['year', 'label', 'department_id', 'gl_id', 'cct'],
      list: db => (db.budgetSnapshots || []).flatMap(s => (s.rows || []).map(r =>
        ({ year: s.year, label: s.label, department_id: r.departmentId, gl_id: r.glId, cct: r.cct, months: r.months }))),
    },
  ];

  const keyOf = (row, pk) => pk.map(k => row[k]).join(SEP);
  let baseline = {};  // name -> Map(key -> JSON(row)) จาก push/pull ครั้งล่าสุด

  /* ---------- โหลดทั้งหมด → db object ---------- */
  async function loadAll() {
    const meta = await req('GET', 'app_meta?id=eq.main&select=*');
    if (!meta || !meta.length) return null;  // เซิร์ฟเวอร์ยังว่าง → ให้ผู้เรียก push ขึ้นครั้งแรก

    const fetched = {};
    for (const t of TABLES) {
      try { fetched[t.name] = await fetchAll(t.name); }
      catch (e) { if (t.optional) fetched[t.name] = []; else throw e; }
    }

    const db = JSON.parse(JSON.stringify(SEED));   // เริ่มจาก seed เพื่อได้ users + โครง
    const m = meta[0];
    db.meta = { ...db.meta, schemaVersion: m.schema_version, rev: m.rev || 0, company: m.company,
      currency: m.currency, yearCurrent: m.year_current, yearPrevious: m.year_previous,
      appName: m.app_name, sides: m.sides };

    for (const t of TABLES) {
      if (!t.assign) continue;
      const rows = fetched[t.name] || [];
      if (t.optional && !rows.length) continue;   // ตาราง optional ว่าง/ยังไม่สร้าง → คงค่า seed ไว้ (เช่น ปริมาณผลิตปี 2025)
      db[t.assign] = rows.map(t.fromRow);
    }
    // snapshots ประกอบกลับ
    const snapMeta = fetched['budget_snapshots'] || [];
    const snapRows = fetched['snapshot_rows'] || [];
    db.budgetSnapshots = snapMeta.map(s => ({
      year: s.year, label: s.label, createdAt: s.created_at,
      rows: snapRows.filter(r => r.year === s.year && r.label === s.label)
        .map(r => ({ departmentId: r.department_id, glId: r.gl_id, cct: r.cct, months: r.months })),
    }));
    // departmentGL (derived)
    const seen = new Set(); db.departmentGL = [];
    (db.departmentRows || []).forEach(x => { const k = x.departmentId + '|' + x.glId;
      if (!seen.has(k)) { seen.add(k); db.departmentGL.push({ departmentId: x.departmentId, glId: x.glId }); } });

    primeBaseline(db);
    return db;
  }

  /* ---------- ตั้ง baseline หลัง pull/push สำเร็จ ---------- */
  function primeBaseline(db) {
    baseline = {};
    for (const t of TABLES) {
      const map = new Map();
      t.list(db).forEach(js => { const row = t.toRow ? t.toRow(js) : js; map.set(keyOf(row, t.pk), JSON.stringify(row)); });
      baseline[t.name] = map;
    }
  }

  /* ---------- push แบบ diff (เฉพาะแถวที่เปลี่ยน/หาย) ---------- */
  async function pushDiff(db) {
    const stash = [];
    // upsert parent→child
    for (const t of TABLES) {
      const prev = baseline[t.name] || new Map();
      const cur = new Map();
      const toUpsert = [];
      t.list(db).forEach(js => {
        const row = t.toRow ? t.toRow(js) : js;
        const k = keyOf(row, t.pk), j = JSON.stringify(row);
        cur.set(k, j);
        if (prev.get(k) !== j) toUpsert.push(row);
      });
      if (toUpsert.length) {
        try { await upsert(t.name, toUpsert); }
        catch (e) { if (!t.optional) throw e; }   // ตาราง optional ยังไม่สร้าง → ข้าม (ค่าเก็บใน localStorage จนกว่ารัน SQL)
      }
      stash.push({ t, cur, prev });
    }
    // delete child→parent (ข้าม append-only) — ถอด PK จาก JSON ที่เก็บไว้
    for (let i = stash.length - 1; i >= 0; i--) {
      const { t, cur, prev } = stash[i];
      if (!t.appendOnly) {
        const dels = [];
        for (const [k, j] of prev) if (!cur.has(k)) {
          const row = JSON.parse(j);
          dels.push(Object.fromEntries(t.pk.map(f => [f, row[f]])));
        }
        if (dels.length) await delMany(t.name, dels);
      }
      baseline[t.name] = cur;
    }
  }

  async function ping() {
    const r = await req('GET', 'app_meta?select=id&limit=1');
    return { ok: true, rows: Array.isArray(r) ? r.length : 0 };
  }

  /* ---------- Storage (ไฟล์แนบ memo คำร้องปรับงบ) ---------- */
  function publicUrl(bucket, path) { return base() + '/storage/v1/object/public/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'); }
  async function uploadFile(bucket, path, file) {
    const enc = path.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(base() + '/storage/v1/object/' + bucket + '/' + enc, {
      method: 'POST',
      headers: { apikey: key(), Authorization: 'Bearer ' + key(), 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
      body: file,
    });
    if (!res.ok) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ (' + res.status + '): ' + (await res.text()).slice(0, 160));
    return path;
  }
  // อัปโหลดไฟล์ memo → คืน metadata { path, name, type, size, url }
  async function uploadMemo(file, prefix) {
    const dot = file.name.lastIndexOf('.');
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
    const stem = (dot >= 0 ? file.name.slice(0, dot) : file.name).replace(/[^\w.\-]+/g, '_').slice(0, 40) || 'memo';
    const rand = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const path = (prefix ? prefix.replace(/[^\w/\-]+/g, '_') + '/' : '') + stem + '-' + rand + ext;
    await uploadFile('memos', path, file);
    return { path, name: file.name, type: file.type || '', size: file.size || 0, url: publicUrl('memos', path) };
  }

  /* ---------- อีเมลแจ้งเตือน (Edge Function: send-email → Resend) ---------- */
  // ต้อง deploy function + ตั้ง RESEND_API_KEY ก่อน (ดู supabase/EMAIL-SETUP.md) — ก่อนหน้านั้นจะคืน error เงียบๆ
  async function sendEmail(to, subject, html) {
    const res = await fetch(base() + '/functions/v1/send-email', {
      method: 'POST',
      headers: { apikey: key(), Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });
    if (!res.ok) throw new Error('ส่งอีเมลไม่สำเร็จ (' + res.status + '): ' + (await res.text()).slice(0, 160));
    return res.json();
  }

  /* ลบทั้งปี แบบ bulk (filter year เดียว = 1 request/ตาราง แทนลบรายแถว) + ล้าง baseline ของปีนั้น
     → เร็ว/เชื่อถือได้ · ไม่มี FK year→budget_periods จึงลบลำดับใดก็ได้ */
  async function deleteYear(year) {
    year = Number(year);
    const yearTables = ['snapshot_rows', 'budget_snapshots', 'budgets', 'gl_notes',
      'dept_status', 'cell_details', 'actuals', 'exchange_rates', 'fuel_prices', 'budget_periods'];
    for (const t of yearTables) {
      await req('DELETE', `${t}?year=eq.${year}`, null, 'return=minimal');
      const map = baseline[t];
      if (map) for (const [k, v] of [...map]) { try { if (JSON.parse(v).year === year) map.delete(k); } catch (e) {} }
    }
  }

  return { enabled, setConfig, url: base, hasKey: () => !!key(), ping, loadAll, pushDiff, primeBaseline, deleteYear,
    uploadMemo, publicUrl, sendEmail,
    signIn, signOut, refresh, authed, myProfile, authRequired: () => AUTH_REQUIRED };
})();

window.Supa = Supa;

/* ============================================================
   หน้า Assumption (MTP 2027-2029) — คัดลอกตารางจาก Template Assumption.xlsx
   มี formula engine คำนวณสด · ช่องกรอก (ไฮไลต์) แก้ได้ · ช่องสูตรคำนวณอัตโนมัติ
   ข้อมูลต้นทาง: window.ASSUMPTION_MTP (js/assumption-data.js)
   ============================================================ */
const PagesAssum = (() => {
  const { esc, card, pageHead } = UI;
  let pending = {};   // ค่าที่แก้แต่ยังไม่ Submit (staged) — key 'i_j' → number หรือ null(=คืนค่าเดิม)
  let editAll = false; // โหมด Edit — แก้ได้ทุกช่อง (พิมพ์ทับสูตรได้)

  /* ---------- Formula engine (รองรับ ref/range, + - * /, IFERROR, SUM, SUBTOTAL, COUNTIFS) ---------- */
  const colIdx = s => { let n = 0; for (const ch of s.toUpperCase()) if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const refRC = ref => { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref); return m ? { i: +m[2] - 1, j: colIdx(m[1]) } : null; };
  function tokenize(s) {
    const t = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) { let j = i + 1; while (j < s.length && /[0-9.]/.test(s[j])) j++; t.push({ t: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
      if (c === '"') { let j = i + 1; while (j < s.length && s[j] !== '"') j++; t.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      if (/[A-Za-z]/.test(c)) {
        let j = i; while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        if (s[j] === '(') { t.push({ t: 'func', v: s.slice(i, j).toUpperCase() }); i = j; continue; }
        const m = /^\$?[A-Za-z]{1,3}\$?\d+/.exec(s.slice(i)); if (m) { t.push({ t: 'ref', v: m[0] }); i += m[0].length; continue; }
        i = j; continue;
      }
      if (c === '$') { const m = /^\$?[A-Za-z]{1,3}\$?\d+/.exec(s.slice(i)); if (m) { t.push({ t: 'ref', v: m[0] }); i += m[0].length; continue; } i++; continue; }
      if ('+-*/(),:'.includes(c)) { t.push({ t: 'op', v: c }); i++; continue; }
      i++;
    }
    return t;
  }
  function evalBody(body, get, isBlank) {
    const toks = tokenize(body); let p = 0;
    const peek = () => toks[p], nx = () => toks[p++];
    const expandRange = (a, b) => { const A = refRC(a), B = refRC(b), out = []; if (!A || !B) return out; for (let i = Math.min(A.i, B.i); i <= Math.max(A.i, B.i); i++) for (let j = Math.min(A.j, B.j); j <= Math.max(A.j, B.j); j++) out.push({ i, j }); return out; };
    function parseExpr() { let v = parseTerm(); while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const o = nx().v; const r = parseTerm(); v = o === '+' ? v + r : v - r; } return v; }
    function parseTerm() { let v = parseFactor(); while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) { const o = nx().v; const r = parseFactor(); v = o === '*' ? v * r : (r === 0 ? NaN : v / r); } return v; }
    function parseFactor() {
      const tk = peek();
      if (!tk) return 0;
      if (tk.t === 'op' && tk.v === '-') { nx(); return -parseFactor(); }
      if (tk.t === 'op' && tk.v === '+') { nx(); return parseFactor(); }
      if (tk.t === 'op' && tk.v === '(') { nx(); const v = parseExpr(); if (peek() && peek().v === ')') nx(); return v; }
      if (tk.t === 'num') { nx(); return tk.v; }
      if (tk.t === 'func') return parseFunc();
      if (tk.t === 'ref') { nx(); if (peek() && peek().v === ':') { nx(); const r2 = nx(); return { range: expandRange(tk.v, r2.v) }; } const rc = refRC(tk.v); return rc ? get(rc.i, rc.j) : 0; }
      nx(); return 0;
    }
    function parseArg() {
      const tk = peek();
      if (tk && tk.t === 'ref' && toks[p + 1] && toks[p + 1].v === ':') { nx(); nx(); const r2 = nx(); return { range: expandRange(tk.v, r2.v) }; }
      if (tk && tk.t === 'str') { nx(); return { str: tk.v }; }
      return parseExpr();
    }
    function parseFunc() {
      const name = nx().v; if (peek() && peek().v === '(') nx();
      const args = []; if (peek() && peek().v !== ')') { args.push(parseArg()); while (peek() && peek().v === ',') { nx(); args.push(parseArg()); } }
      if (peek() && peek().v === ')') nx();
      return applyFunc(name, args);
    }
    // คืน list ของ cell-coord (หรือ {v:literal}); numOf/blankOf ใช้ตัดสินค่า/ช่องว่าง
    const cellsOf = a => (a && a.range) ? a.range : (typeof a === 'number' ? [{ v: a }] : []);
    const numOf = c => ('v' in c) ? c.v : get(c.i, c.j);
    const blankOf = c => ('v' in c) ? false : isBlank(c.i, c.j);
    function applyFunc(name, args) {
      if (name === 'IFERROR') { const a = typeof args[0] === 'number' ? args[0] : 0; const b = typeof args[1] === 'number' ? args[1] : 0; return isFinite(a) ? a : b; }
      if (name === 'SUM') { let s = 0; args.forEach(a => cellsOf(a).forEach(c => { const v = numOf(c); if (isFinite(v)) s += v; })); return s; }
      if (name === 'SUBTOTAL') { const code = typeof args[0] === 'number' ? args[0] : 9; const vals = cellsOf(args[1]).filter(c => !blankOf(c)).map(numOf).filter(isFinite); if (!vals.length) return 0; const sum = vals.reduce((x, y) => x + y, 0); return (code === 1 || code === 101) ? sum / vals.length : sum; }
      if (name === 'AVERAGE') { const vals = []; args.forEach(a => cellsOf(a).filter(c => !blankOf(c)).forEach(c => { const v = numOf(c); if (isFinite(v)) vals.push(v); })); return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0; }
      if (name === 'COUNTIFS') { const vals = cellsOf(args[0]).filter(c => !blankOf(c)).map(numOf); const crit = args[1] && args[1].str ? args[1].str : String(args[1]); const m = /^(>=|<=|<>|>|<|=)?\s*(-?[\d.]+)$/.exec(crit.trim()); if (!m) return 0; const op = m[1] || '=', n = parseFloat(m[2]); return vals.filter(v => op === '>' ? v > n : op === '<' ? v < n : op === '>=' ? v >= n : op === '<=' ? v <= n : op === '<>' ? v !== n : v === n).length; }
      return 0;
    }
    return parseExpr();
  }

  /* ---------- โหลด grid + คำนวณ ---------- */
  // override ที่ commit แล้ว (Supabase, รายปี) + pending (ยังไม่ submit); pending=null → คืนค่าเดิม
  function edits() { const m = Object.assign({}, Store.assumEdits(UI.year())); for (const k in pending) { if (pending[k] == null) delete m[k]; else m[k] = pending[k]; } return m; }
  function baseVal(V, i, j) { const v = V[i] && V[i][j]; return (typeof v === 'number') ? v : (v == null ? 0 : (isFinite(+v) ? +v : 0)); }

  /* ---- แถวอัตราแลกเปลี่ยน (24.x) — ดึงอัตโนมัติจาก Budget Control (exchange_rates) ---- */
  // i173 USD:THB · i174 EUR:THB · i175 LAK:THB · i176 LAK:USD · i177 LAK:EUR
  const FX_ROWS = { 173: ['USD', 'THB'], 174: ['EUR', 'THB'], 175: ['LAK', 'THB'], 176: ['LAK', 'USD'], 177: ['LAK', 'EUR'] };
  let _JYO = null;
  const JYO = () => { if (!_JYO) { _JYO = {}; COLS.forEach(c => { _JYO[c.j] = c.yo; }); } return _JYO; };
  function fxVal(i, j) {
    const pair = FX_ROWS[i]; if (!pair) return undefined;
    const yo = JYO()[j]; if (yo !== 0) return undefined;             // ดึงเฉพาะคอลัมน์ปีงบปัจจุบัน — ปีก่อน/อนาคต กรอกเอง
    const y = UI.year() + yo;
    const rate = cur => (Store.db.exchangeRates || []).find(x => x.year === y && x.currency === cur)?.rateToLAK ?? null;
    const [a, b] = pair;
    if (a === 'LAK') { return rate(b); }                             // LAK:X = กีบต่อ 1 หน่วย X
    const ra = rate(a), rb = rate(b);
    return (ra != null && rb != null && rb !== 0) ? ra / rb : null;  // A:B = rate(A)/rate(B)
  }
  const isFxCell = (i, j) => FX_ROWS[i] !== undefined && JYO()[j] === 0;

  // คำนวณทั้งกริด → คืน number[][] (memoized + กัน circular)
  function compute() {
    const D = window.ASSUMPTION_MTP; const V = D.v, F = D.f, R = V.length, C = D.cols;
    const ov = edits();
    const cache = Array.from({ length: R }, () => new Array(C).fill(undefined));
    const busy = new Set();
    const isBlank = (i, j) => { if (isFxCell(i, j)) return fxVal(i, j) == null; const ek = i + '_' + j; if (ek in ov) return false; const f = F[i] && F[i][j]; if (f && f.indexOf('!') < 0) return false; return (V[i] ? V[i][j] : null) == null; };
    function get(i, j) {
      if (i < 0 || i >= R || j < 0 || j >= C) return 0;
      if (cache[i][j] !== undefined) return cache[i][j];
      if (isFxCell(i, j)) { const n = fxVal(i, j); cache[i][j] = (n == null ? 0 : n); return cache[i][j]; }   // FX auto จาก Budget Control (ชนะทุกอย่าง)
      const ek = i + '_' + j;
      if (ek in ov) { const n = +ov[ek]; cache[i][j] = n; return n; }   // ค่าที่แก้มือ (override) — ทับสูตร/ค่าเดิมเสมอ
      const f = F[i] && F[i][j];
      // ช่องกรอก หรือ สูตรลิงก์ไฟล์ภายนอก (มี '!') → ใช้ค่าที่ Excel เก็บไว้ (คำนวณเองไม่ได้)
      if (!f || f.indexOf('!') >= 0) { const n = baseVal(V, i, j); cache[i][j] = n; return n; }
      const key = i + '|' + j; if (busy.has(key)) return 0; busy.add(key);
      let r; try { r = evalBody(f.slice(1), get, isBlank); } catch (e) { r = 0; } busy.delete(key);
      if (!isFinite(r)) r = 0; cache[i][j] = r; return r;
    }
    const out = Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => get(i, j)));
    return { V, F, out };
  }

  /* ---------- คำนิยามคอลัมน์ 25 ช่อง (j = 4..28) ---------- */
  // yo = ปีสัมพัทธ์จากปีงบที่เลือก (เกิดจริง=ปีก่อน, งบต้นปี/Revise/คาดการณ์=ปีนั้น, งบ MTP=+1/+2/+3) · null=ไม่มีปี
  const COLS = [
    { j: 4, grp: 'เกิดจริง', yo: -1, sc: '' },
    { j: 5, grp: 'งบต้นปี', yo: 0, sc: 'O' }, { j: 6, grp: 'งบต้นปี', yo: 0, sc: 'R' }, { j: 7, grp: 'งบต้นปี', yo: 0, sc: 'P' },
    { j: 8, grp: 'งบ Revise', yo: 0, sc: 'O' }, { j: 9, grp: 'งบ Revise', yo: 0, sc: 'R' }, { j: 10, grp: 'งบ Revise', yo: 0, sc: 'P' },
    { j: 11, grp: 'เกิดจริง ม.ค-ส.ค', yo: 0, sc: '' },
    { j: 12, grp: 'คาดการณ์ ก.ย-ธ.ค', yo: 0, sc: 'O' }, { j: 13, grp: 'คาดการณ์ ก.ย-ธ.ค', yo: 0, sc: 'R' }, { j: 14, grp: 'คาดการณ์ ก.ย-ธ.ค', yo: 0, sc: 'P' },
    { j: 15, grp: 'เกิดจริง+คาดการณ์', yo: 0, sc: 'O' }, { j: 16, grp: 'เกิดจริง+คาดการณ์', yo: 0, sc: 'R' }, { j: 17, grp: 'เกิดจริง+คาดการณ์', yo: 0, sc: 'P' },
    { j: 18, grp: 'งบประมาณ', yo: 1, sc: 'O' }, { j: 19, grp: 'งบประมาณ', yo: 1, sc: 'R' }, { j: 20, grp: 'งบประมาณ', yo: 1, sc: 'P' },
    { j: 21, grp: 'ผลต่าง', yo: null, sc: '' }, { j: 22, grp: '%Growth', yo: null, sc: '' },
    { j: 23, grp: 'งบประมาณ', yo: 2, sc: 'O' }, { j: 24, grp: 'งบประมาณ', yo: 2, sc: 'R' }, { j: 25, grp: 'งบประมาณ', yo: 2, sc: 'P' },
    { j: 26, grp: 'งบประมาณ', yo: 3, sc: 'O' }, { j: 27, grp: 'งบประมาณ', yo: 3, sc: 'R' }, { j: 28, grp: 'งบประมาณ', yo: 3, sc: 'P' },
  ];
  const REMARK_J = 29;
  const R0 = 6, R1 = 188; // แถวข้อมูล (sheet row 7..189) → index 6..188

  const fmt = (v, pct) => {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a < 1) return (v).toLocaleString('en-US', { maximumFractionDigits: 4 });
    if (a < 1000) return (v).toLocaleString('en-US', { maximumFractionDigits: 2 });
    return Math.round(v).toLocaleString('en-US');
  };

  function page(user) {
    pending = {};   // เริ่มหน้าใหม่ = ไม่มีค้าง
    const year = UI.year();                       // ปีงบที่เลือก (ค.ศ.)
    const thaiYr = yo => yo == null ? '' : (year + yo);         // ปี ค.ศ. ตาม offset
    const { V, F, out } = compute();
    const committed = Store.assumEdits(year);
    const scCls = sc => sc === 'O' ? 'sc-o' : sc === 'R' ? 'sc-r' : sc === 'P' ? 'sc-p' : '';
    const scLbl = sc => sc === 'O' ? 'Opt' : sc === 'R' ? 'Real' : sc === 'P' ? 'Pess' : '';
    // หัวตาราง 3 แถว (ตาม Excel): แถวรหัส A/A1/B/C… → แถบกลุ่ม+ช่วงเดือน → scenario
    const CODE = { 4: '', 5: 'A', 6: 'A', 7: 'A', 8: 'A1', 9: 'A1', 10: 'A1', 11: 'B', 12: 'C1', 13: 'C2', 14: 'C3', 15: 'D1 = B+C1', 16: 'D2 = B+C2', 17: 'D3 = B+C3', 18: 'E1', 19: 'E2', 20: 'E3', 21: 'F = E2−D2', 22: 'G = F÷D2', 23: 'H1', 24: 'H2', 25: 'H3', 26: 'I1', 27: 'I2', 28: 'I3' };
    const rangeOf = c => {
      if (c.yo == null) return '';
      const y = year + c.yo;
      if (c.grp === 'เกิดจริง ม.ค-ส.ค') return `(ม.ค.-ส.ค.${y})`;
      if (c.grp.startsWith('คาดการณ์')) return `(ก.ย.-ธ.ค.${y})`;
      return `(ม.ค.-ธ.ค.${y})`;
    };
    // แถวรหัส — รวมช่องรหัสซ้ำติดกัน (A, A1) ด้วย colspan
    let head0 = ''; for (let k = 0; k < COLS.length;) { const code = CODE[COLS[k].j] ?? ''; let span = 1; while (k + span < COLS.length && (CODE[COLS[k + span].j] ?? '') === code && code !== '' && !code.includes('=')) span++; head0 += `<th class="num as-h0" colspan="${span}">${esc(code)}</th>`; k += span; }
    // แถบกลุ่ม — รวมกลุ่มเดียวกัน (grp+yo) ด้วย colspan + ช่วงเดือน
    let head1 = ''; for (let k = 0; k < COLS.length;) { const c = COLS[k]; let span = 1; while (k + span < COLS.length && COLS[k + span].grp === c.grp && COLS[k + span].yo === c.yo) span++; head1 += `<th class="num as-h1" colspan="${span}">${esc(c.grp)}${c.yo != null ? ` <span class="as-rng">${rangeOf(c)}</span>` : ''}</th>`; k += span; }
    const head2 = COLS.map(c => `<th class="num as-h2 ${scCls(c.sc)}">${scLbl(c.sc)}</th>`).join('');
    let body = '', subN = 0;
    for (let i = R0; i <= R1; i++) {
      const note = V[i][0], order = V[i][1], name = V[i][2], unit = V[i][3], remark = V[i][REMARK_J];
      if (name == null && order == null) continue;
      const isMain = order != null && /^\d+$/.test(String(order));
      if (isMain) subN = 0; else subN++;
      const rowCls = isMain ? 'as-main' : ('as-sub' + (subN % 2 === 0 ? ' as-alt' : ''));
      const cells = COLS.map(c => {
        const j = c.j; const f = F[i] && F[i][j]; const ext = f && f.indexOf('!') >= 0; const val = out[i][j];
        const isFormula = f && !ext;
        // แถวอัตราแลกเปลี่ยน — auto จาก Budget Control (อ่านอย่างเดียวเสมอ)
        if (isFxCell(i, j)) return `<td class="num as-calc as-fx ${scCls(c.sc)}" data-r="${i}" data-c="${j}" title="ดึงจาก Budget Control (อัตราแลกเปลี่ยน)">${val ? fmt(val) : ''}</td>`;
        // โหมดปกติ: ช่องสูตร = อ่านอย่างเดียว · โหมด Edit (editAll): แก้ได้ทุกช่อง (พิมพ์ทับสูตร)
        if (isFormula && !editAll) return `<td class="num as-calc ${scCls(c.sc)}" data-r="${i}" data-c="${j}" title="${esc(f)}">${val ? fmt(val) : ''}</td>`;
        const edited = (i + '_' + j) in committed;
        return `<td class="num as-in ${scCls(c.sc)}${ext ? ' as-ext' : ''}${isFormula ? ' as-fcell' : ''}"><input class="as-cell${edited ? ' as-edited' : ''}" data-r="${i}" data-c="${j}" inputmode="decimal" value="${val ? fmt(val) : ''}"${isFormula ? ` title="สูตร: ${esc(f)}"` : ''}></td>`;
      }).join('');
      body += `<tr class="${rowCls}">
        <td class="as-note">${esc(note ?? '')}</td>
        <td class="as-ord">${esc(order ?? '')}</td>
        <td class="as-name" title="${esc(name ?? '')}">${esc(name ?? '')}</td>
        <td class="as-unit">${esc(unit ?? '')}</td>
        ${cells}
        <td class="as-remark">${esc(remark ?? '')}</td></tr>`;
    }
    const th = `<tr>
        <th class="as-note" rowspan="3">Note</th><th class="as-ord" rowspan="3">ลำดับ</th>
        <th class="as-name" rowspan="3">สมมุติฐาน</th><th class="as-unit" rowspan="3">หน่วย</th>
        ${head0}<th class="as-remark" rowspan="3">ผู้รับผิดชอบ</th></tr><tr>${head1}</tr><tr>${head2}</tr>`;
    return pageHead('Assumption MTP 2027–2029', 'ช่องเหลือง = กรอกได้ · ช่องเทา = สูตรคำนวณอัตโนมัติ · กด ✏️ Edit เพื่อแก้ได้ทุกช่อง (พิมพ์ทับสูตร)',
        `<button data-as-expand class="ghost-btn small" title="ขยาย/ย่อ เต็มจอ">⛶ ขยาย</button>
         <span class="pa-right">
           <button data-as-edit class="ghost-btn small${editAll ? ' as-edit-on' : ''}" title="เปิด/ปิด แก้ได้ทุกช่อง (พิมพ์ทับสูตรได้)">${editAll ? '✏️ Edit: เปิด' : '✏️ Edit'}</button>
           <button data-as-cancel class="ghost-btn small" disabled title="ยกเลิกการแก้ที่ยังไม่ Submit">↺ ยกเลิก</button>
           <button data-as-clear class="danger-btn small" title="ล้างค่าที่แก้ทั้งหมด กลับเป็นค่าต้นทาง">🗑 Clear</button>
           <button data-as-submit class="primary-btn small" disabled title="บันทึกค่าที่แก้ขึ้นระบบ (Supabase)">✔ Submit</button>
         </span>`)
      + `<div id="asWrap">` + card('', `<div class="table-scroll as-scroll"><table class="as-table mtp3"><thead>${th}</thead><tbody>${body}</tbody></table></div>`, { cls: 'card-flush' }) + `</div>`;
  }

  function recalcDom() {
    const { F, out } = compute();
    document.querySelectorAll('td.as-calc').forEach(td => {
      const i = +td.dataset.r, j = +td.dataset.c;
      td.textContent = out[i][j] ? fmt(out[i][j]) : '';
    });
  }

  function bind(user) {
    pending = {};
    const year = UI.year();
    const committed = Store.assumEdits(year);
    const subBtn = document.querySelector('[data-as-submit]'), canBtn = document.querySelector('[data-as-cancel]');
    const baseNum = (i, j) => { const V = window.ASSUMPTION_MTP.v; const v = V[i] && V[i][j]; return (typeof v === 'number') ? v : (v == null ? 0 : (isFinite(+v) ? +v : 0)); };
    const updateBtns = () => { const n = Object.keys(pending).length; if (subBtn) { subBtn.disabled = !n; subBtn.textContent = n ? `✔ Submit (${n})` : '✔ Submit'; } if (canBtn) canBtn.disabled = !n; };

    document.querySelectorAll('.as-cell').forEach(inp => {
      inp.addEventListener('focus', () => { inp.value = inp.value.replace(/,/g, ''); inp.select(); });
      inp.addEventListener('blur', () => {
        const i = +inp.dataset.r, j = +inp.dataset.c, k = i + '_' + j;
        const raw = inp.value.replace(/[,\s]/g, '').trim();
        const v = raw === '' ? null : Number(raw);
        if (raw !== '' && !isFinite(v)) { UI.toast('ตัวเลขไม่ถูกต้อง', 'err'); return; }
        inp.value = v ? fmt(v) : '';
        // เทียบกับค่าที่ commit แล้ว (หรือค่าต้นทาง) — ถ้าเท่าเดิม เอาออกจาก pending
        const cur = (k in committed) ? committed[k] : baseNum(i, j);
        if ((v == null ? 0 : v) === (cur == null ? 0 : cur)) { delete pending[k]; inp.classList.remove('as-pending'); }
        else { pending[k] = v; inp.classList.add('as-pending'); }
        updateBtns(); recalcDom();
      });
    });

    subBtn?.addEventListener('click', () => {
      const n = Object.keys(pending).length; if (!n) return;
      UI.confirm2(`Submit ค่าที่แก้ ${n} ช่อง`, 'บันทึกค่าที่แก้ขึ้นระบบ (Supabase) — มีผลกับสมมติฐานที่ใช้คำนวณ', 'ค่าเดิมจะถูกทับ', () => {
        let ok = 0; try { for (const k in pending) { const [i, j] = k.split('_').map(Number); Store.assumSet(user, year, i, j, pending[k]); ok++; } } catch (e) { UI.toast(e.message, 'err'); return; }
        pending = {}; UI.toast(`บันทึกแล้ว ${ok} ช่อง`); App.render();
      });
    });
    canBtn?.addEventListener('click', () => { if (!Object.keys(pending).length) return; pending = {}; App.render(); });
    document.querySelector('[data-as-clear]')?.addEventListener('click', () => {
      UI.confirm2('ล้างค่าที่แก้ทั้งหมด', 'ลบค่าที่แก้ทั้งหมด (ที่ Submit แล้ว) กลับเป็นค่าต้นทางจากไฟล์ Assumption', 'ย้อนกลับไม่ได้', () => {
        try { pending = {}; Store.assumClear(user, year); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
      });
    });

    document.querySelector('[data-as-edit]')?.addEventListener('click', () => { editAll = !editAll; pending = {}; App.render(); });
    wireFullscreen();
  }

  /* ---- ขยาย/ย่อ เต็มจอ + ปุ่ม ✕ ลอย (ใช้ร่วม admin/user) ---- */
  function wireFullscreen() {
    const wrap = document.getElementById('asWrap'), expBtn = document.querySelector('[data-as-expand]');
    if (!wrap || !expBtn) return;
    let fsClose = document.getElementById('asFsClose');
    if (fsClose) { const nf = fsClose.cloneNode(true); fsClose.replaceWith(nf); fsClose = nf; }   // ล้าง listener เก่าข้ามหน้า
    else { fsClose = document.createElement('button'); fsClose.id = 'asFsClose'; fsClose.type = 'button'; fsClose.innerHTML = '<span class="fs-x">✕</span> ย่อกลับ <kbd>Esc</kbd>'; document.body.appendChild(fsClose); }
    const onMove = ev => { if (ev.clientY <= 70) fsClose.classList.add('show'); else fsClose.classList.remove('show'); };
    const setFs = on => {
      wrap.classList.toggle('as-fs', on); document.body.classList.toggle('edit-fs-lock', on);
      expBtn.innerHTML = on ? '⤡ ย่อ' : '⛶ ขยาย';
      fsClose.style.display = on ? 'inline-flex' : 'none'; fsClose.classList.add('show');
      if (on) { document.addEventListener('mousemove', onMove); setTimeout(() => { if (wrap.classList.contains('as-fs')) fsClose.classList.remove('show'); }, 1800); }
      else document.removeEventListener('mousemove', onMove);
    };
    expBtn.addEventListener('click', () => setFs(!wrap.classList.contains('as-fs')));
    fsClose.addEventListener('click', () => setFs(false));
    document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape' && wrap && wrap.classList.contains('as-fs')) setFs(false); });
  }

  /* ============ หน้า Assumption ฝั่ง User (แยกตามแผนกผู้รับผิดชอบ · กรอก 2 รอบ/ปี) ============ */
  const SECTION_BY_DEPT = { '2712': 'ด้านอ้อย', '3224': 'ด้านโรงงาน', '1143': 'การตลาด' };
  // รอบ 1 = ตั้งงบ (เกิดจริงปีก่อน · งบต้นปี · งบ MTP +1/+2/+3) · รอบ 2 = Revise + คาดการณ์
  const ROUND_COLS = { 1: [4, 5, 6, 7, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], 2: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] };
  let userRound = 1;

  function userSection(user) {
    const code = user && user.departmentId ? String((Store.dept(user.departmentId) || {}).code || '') : '';
    return SECTION_BY_DEPT[code] || null;
  }

  function userPage(user) {
    pending = {};
    const section = userSection(user);
    if (!section) return pageHead('Assumption', 'สมมติฐานประกอบงบประมาณ')
      + card('ไม่มีรายการของแผนกคุณ', '<p class="muted">หน้านี้สำหรับแผนกผู้รับผิดชอบสมมติฐาน: <b>แผนกบริการไร่</b> (ด้านอ้อย) · <b>แผนกหม้อปั่น</b> (ด้านโรงงาน) · <b>แผนกขายและการตลาด</b> (การตลาด)</p>');
    const year = UI.year();
    const thaiYr = yo => yo == null ? '' : (year + yo);
    const { V, F, out } = compute();
    const committed = Store.assumEdits(year);
    const scCls = sc => sc === 'O' ? 'sc-o' : sc === 'R' ? 'sc-r' : sc === 'P' ? 'sc-p' : '';
    const scLbl = sc => sc === 'O' ? 'Opt' : sc === 'R' ? 'Real' : sc === 'P' ? 'Pess' : '';
    const cols = COLS.filter(c => ROUND_COLS[userRound].includes(c.j));
    const head1 = cols.map(c => `<th class="num as-h1 ${scCls(c.sc)}">${esc(c.grp)}${c.yo != null ? `<div class="as-yr">${thaiYr(c.yo)}</div>` : ''}</th>`).join('');
    const head2 = cols.map(c => `<th class="num as-h2 ${scCls(c.sc)}">${scLbl(c.sc)}</th>`).join('');
    // แบ่งบล็อกตามแถวหมวด (ลำดับเลขจำนวนเต็ม) — แสดงทั้งบล็อกถ้ามีแถวของแผนกนี้ (รวมแถวผลรวม อ่านอย่างเดียว)
    const blocks = []; let cur = null;
    for (let i = R0; i <= R1; i++) {
      const order = V[i][1], name = V[i][2];
      if (name == null && order == null) continue;
      const isMain = order != null && /^\d+$/.test(String(order));
      if (isMain || !cur) { cur = { rows: [], match: false }; blocks.push(cur); }
      cur.rows.push(i);
      if (String(V[i][REMARK_J] ?? '').trim() === section) cur.match = true;
    }
    let body = '', n = 0;
    blocks.filter(b => b.match).forEach(b => b.rows.forEach(i => {
      const order = V[i][1], isMain = order != null && /^\d+$/.test(String(order));
      const mine = String(V[i][REMARK_J] ?? '').trim() === section;
      if (isMain) n = 0; else n++;
      const cells = cols.map(c => {
        const j = c.j; const f = F[i] && F[i][j]; const ext = f && f.indexOf('!') >= 0; const val = out[i][j];
        // กรอกได้เฉพาะแถวของแผนกตัวเอง (ช่องไม่มีสูตร/ลิงก์ภายนอก) — แถวผลรวม/แถวแผนกอื่น = อ่านอย่างเดียว
        if ((f && !ext) || !mine) return `<td class="num as-calc ${scCls(c.sc)}" data-r="${i}" data-c="${j}">${val ? fmt(val) : ''}</td>`;
        const edited = (i + '_' + j) in committed;
        return `<td class="num as-in asu-in ${scCls(c.sc)}"><input class="as-cell asu-cell${edited ? ' as-edited' : ''}" data-r="${i}" data-c="${j}" inputmode="decimal" value="${val ? fmt(val) : ''}"></td>`;
      }).join('');
      body += `<tr class="${isMain ? 'as-main' : 'as-sub' + (n % 2 === 0 ? ' as-alt' : '')}">
        <td class="as-ord">${esc(order ?? '')}</td>
        <td class="as-name" title="${esc(V[i][2] ?? '')}">${esc(V[i][2] ?? '')}</td>
        <td class="as-unit">${esc(V[i][3] ?? '')}</td>${cells}</tr>`;
    }));
    const th = `<tr><th class="as-ord" rowspan="2">ลำดับ</th><th class="as-name" rowspan="2">สมมุติฐาน</th><th class="as-unit" rowspan="2">หน่วย</th>${head1}</tr><tr>${head2}</tr>`;
    return pageHead(`Assumption — ${esc(section)}`, `${esc(Store.dept(user.departmentId)?.name || '')} · ปีงบ ${year} · ช่องชมพู = กรอก · กรอกแล้วเลขวิ่งเข้าตาราง MTP อัตโนมัติ`,
        `<button data-as-expand class="ghost-btn small" title="ขยาย/ย่อ เต็มจอ">⛶ ขยาย</button>
         <span class="asu-rounds">
           <button data-asu-round="1" class="ghost-btn small${userRound === 1 ? ' asu-on' : ''}">รอบ 1 · ตั้งงบ</button>
           <button data-asu-round="2" class="ghost-btn small${userRound === 2 ? ' asu-on' : ''}">รอบ 2 · Revise/คาดการณ์</button>
         </span>
         <span class="pa-right">
           <button data-as-cancel class="ghost-btn small" disabled>↺ ยกเลิก</button>
           <button data-as-submit class="primary-btn small" disabled title="บันทึกขึ้นระบบ — เลขวิ่งเข้าตาราง MTP ทันที">✔ Submit</button>
         </span>`)
      + `<div id="asWrap">` + card('', `<div class="table-scroll as-scroll"><table class="as-table asu-table"><thead>${th}</thead><tbody>${body}</tbody></table></div>`, { cls: 'card-flush' }) + `</div>`;
  }

  function userBind(user) {
    pending = {};
    const year = UI.year();
    const committed = Store.assumEdits(year);
    const subBtn = document.querySelector('[data-as-submit]'), canBtn = document.querySelector('[data-as-cancel]');
    const baseNum = (i, j) => { const V = window.ASSUMPTION_MTP.v; const v = V[i] && V[i][j]; return (typeof v === 'number') ? v : (v == null ? 0 : (isFinite(+v) ? +v : 0)); };
    const updateBtns = () => { const nn = Object.keys(pending).length; if (subBtn) { subBtn.disabled = !nn; subBtn.textContent = nn ? `✔ Submit (${nn})` : '✔ Submit'; } if (canBtn) canBtn.disabled = !nn; };
    document.querySelectorAll('.asu-cell').forEach(inp => {
      inp.addEventListener('focus', () => { inp.value = inp.value.replace(/,/g, ''); inp.select(); });
      inp.addEventListener('blur', () => {
        const i = +inp.dataset.r, j = +inp.dataset.c, k = i + '_' + j;
        const raw = inp.value.replace(/[,\s]/g, '').trim();
        const v = raw === '' ? null : Number(raw);
        if (raw !== '' && !isFinite(v)) { UI.toast('ตัวเลขไม่ถูกต้อง', 'err'); return; }
        inp.value = v ? fmt(v) : '';
        const cur = (k in committed) ? committed[k] : baseNum(i, j);
        if ((v == null ? 0 : v) === (cur == null ? 0 : cur)) { delete pending[k]; inp.classList.remove('as-pending'); }
        else { pending[k] = v; inp.classList.add('as-pending'); }
        updateBtns(); recalcDom();
      });
    });
    subBtn?.addEventListener('click', () => {
      const nn = Object.keys(pending).length; if (!nn) return;
      UI.confirm2(`Submit ค่าที่กรอก ${nn} ช่อง`, 'บันทึกขึ้นระบบ — ตัวเลขจะวิ่งเข้าตาราง Assumption MTP ของแอดมินทันที', 'ค่าเดิมจะถูกทับ', () => {
        let ok = 0; try { for (const k in pending) { const [i, j] = k.split('_').map(Number); Store.assumSet(user, year, i, j, pending[k]); ok++; } } catch (e) { UI.toast(e.message, 'err'); return; }
        pending = {}; UI.toast(`บันทึกแล้ว ${ok} ช่อง`); App.render();
      });
    });
    canBtn?.addEventListener('click', () => { if (Object.keys(pending).length) { pending = {}; App.render(); } });
    document.querySelectorAll('[data-asu-round]').forEach(b => b.addEventListener('click', () => { userRound = +b.dataset.asuRound; pending = {}; App.render(); }));
    wireFullscreen();
  }

  // กริดค่าที่คำนวณแล้ว (ใช้ค่าที่ Submit แล้วจาก Supabase) — ให้หน้าอื่นดึงตัวเลขไปใช้ (เช่น ต้นทุนต่อหน่วย)
  function grid() { return compute().out; }
  return { page, bind, grid, userPage, userBind };
})();

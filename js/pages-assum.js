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
  // override ที่ commit แล้ว (Supabase) + pending (ยังไม่ submit); pending=null → คืนค่าเดิม
  function edits() { const m = Object.assign({}, Store.assumEdits()); for (const k in pending) { if (pending[k] == null) delete m[k]; else m[k] = pending[k]; } return m; }
  function baseVal(V, i, j) { const v = V[i] && V[i][j]; return (typeof v === 'number') ? v : (v == null ? 0 : (isFinite(+v) ? +v : 0)); }

  // คำนวณทั้งกริด → คืน number[][] (memoized + กัน circular)
  function compute() {
    const D = window.ASSUMPTION_MTP; const V = D.v, F = D.f, R = V.length, C = D.cols;
    const ov = edits();
    const cache = Array.from({ length: R }, () => new Array(C).fill(undefined));
    const busy = new Set();
    const isBlank = (i, j) => { const ek = i + '_' + j; if (ek in ov) return false; const f = F[i] && F[i][j]; if (f && f.indexOf('!') < 0) return false; return (V[i] ? V[i][j] : null) == null; };
    function get(i, j) {
      if (i < 0 || i >= R || j < 0 || j >= C) return 0;
      if (cache[i][j] !== undefined) return cache[i][j];
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
  const COLS = [
    { j: 4, grp: 'เกิดจริง', yr: '2568', sc: '' },
    { j: 5, grp: 'งบต้นปี', yr: '2569', sc: 'O' }, { j: 6, grp: 'งบต้นปี', yr: '2569', sc: 'R' }, { j: 7, grp: 'งบต้นปี', yr: '2569', sc: 'P' },
    { j: 8, grp: 'งบ Revise', yr: '2569', sc: 'O' }, { j: 9, grp: 'งบ Revise', yr: '2569', sc: 'R' }, { j: 10, grp: 'งบ Revise', yr: '2569', sc: 'P' },
    { j: 11, grp: 'เกิดจริง ม.ค-ส.ค', yr: '2569', sc: '' },
    { j: 12, grp: 'คาดการณ์ ก.ย-ธ.ค', yr: '2569', sc: 'O' }, { j: 13, grp: 'คาดการณ์ ก.ย-ธ.ค', yr: '2569', sc: 'R' }, { j: 14, grp: 'คาดการณ์ ก.ย-ธ.ค', yr: '2569', sc: 'P' },
    { j: 15, grp: 'เกิดจริง+คาดการณ์', yr: '2569', sc: 'O' }, { j: 16, grp: 'เกิดจริง+คาดการณ์', yr: '2569', sc: 'R' }, { j: 17, grp: 'เกิดจริง+คาดการณ์', yr: '2569', sc: 'P' },
    { j: 18, grp: 'งบประมาณ', yr: '2570', sc: 'O' }, { j: 19, grp: 'งบประมาณ', yr: '2570', sc: 'R' }, { j: 20, grp: 'งบประมาณ', yr: '2570', sc: 'P' },
    { j: 21, grp: 'ผลต่าง', yr: '', sc: '' }, { j: 22, grp: '%Growth', yr: '', sc: '' },
    { j: 23, grp: 'งบประมาณ', yr: '2571', sc: 'O' }, { j: 24, grp: 'งบประมาณ', yr: '2571', sc: 'R' }, { j: 25, grp: 'งบประมาณ', yr: '2571', sc: 'P' },
    { j: 26, grp: 'งบประมาณ', yr: '2572', sc: 'O' }, { j: 27, grp: 'งบประมาณ', yr: '2572', sc: 'R' }, { j: 28, grp: 'งบประมาณ', yr: '2572', sc: 'P' },
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
    const { V, F, out } = compute();
    const committed = Store.assumEdits();
    const scCls = sc => sc === 'O' ? 'sc-o' : sc === 'R' ? 'sc-r' : sc === 'P' ? 'sc-p' : '';
    const scLbl = sc => sc === 'O' ? 'Opt' : sc === 'R' ? 'Real' : sc === 'P' ? 'Pess' : '';
    // หัวตาราง 2 แถว
    const head1 = COLS.map(c => `<th class="num as-h1 ${scCls(c.sc)}">${esc(c.grp)}${c.yr ? `<div class="as-yr">${c.yr}</div>` : ''}</th>`).join('');
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
        <th class="as-note" rowspan="2">Note</th><th class="as-ord" rowspan="2">ลำดับ</th>
        <th class="as-name" rowspan="2">สมมุติฐาน</th><th class="as-unit" rowspan="2">หน่วย</th>
        ${head1}<th class="as-remark" rowspan="2">ผู้รับผิดชอบ</th></tr><tr>${head2}</tr>`;
    return pageHead('Assumption MTP 2027–2029', 'ช่องเหลือง = กรอกได้ · ช่องเทา = สูตรคำนวณอัตโนมัติ · กด ✏️ Edit เพื่อแก้ได้ทุกช่อง (พิมพ์ทับสูตร)',
        `<button data-as-expand class="ghost-btn small" title="ขยาย/ย่อ เต็มจอ">⛶ ขยาย</button>
         <span class="pa-right">
           <button data-as-edit class="ghost-btn small${editAll ? ' as-edit-on' : ''}" title="เปิด/ปิด แก้ได้ทุกช่อง (พิมพ์ทับสูตรได้)">${editAll ? '✏️ Edit: เปิด' : '✏️ Edit'}</button>
           <button data-as-cancel class="ghost-btn small" disabled title="ยกเลิกการแก้ที่ยังไม่ Submit">↺ ยกเลิก</button>
           <button data-as-clear class="danger-btn small" title="ล้างค่าที่แก้ทั้งหมด กลับเป็นค่าต้นทาง">🗑 Clear</button>
           <button data-as-submit class="primary-btn small" disabled title="บันทึกค่าที่แก้ขึ้นระบบ (Supabase)">✔ Submit</button>
         </span>`)
      + `<div id="asWrap">` + card('', `<div class="table-scroll as-scroll"><table class="as-table"><thead>${th}</thead><tbody>${body}</tbody></table></div>`, { cls: 'card-flush' }) + `</div>`;
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
    const committed = Store.assumEdits();
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
        let ok = 0; try { for (const k in pending) { const [i, j] = k.split('_').map(Number); Store.assumSet(user, i, j, pending[k]); ok++; } } catch (e) { UI.toast(e.message, 'err'); return; }
        pending = {}; UI.toast(`บันทึกแล้ว ${ok} ช่อง`); App.render();
      });
    });
    canBtn?.addEventListener('click', () => { if (!Object.keys(pending).length) return; pending = {}; App.render(); });
    document.querySelector('[data-as-clear]')?.addEventListener('click', () => {
      UI.confirm2('ล้างค่าที่แก้ทั้งหมด', 'ลบค่าที่แก้ทั้งหมด (ที่ Submit แล้ว) กลับเป็นค่าต้นทางจากไฟล์ Assumption', 'ย้อนกลับไม่ได้', () => {
        try { pending = {}; Store.assumClear(user); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
      });
    });

    /* ---- ขยาย/ย่อ เต็มจอ + ปุ่ม ✕ ลอย ---- */
    const wrap = document.getElementById('asWrap'), expBtn = document.querySelector('[data-as-expand]');
    let fsClose = document.getElementById('asFsClose');
    if (!fsClose) { fsClose = document.createElement('button'); fsClose.id = 'asFsClose'; fsClose.type = 'button'; fsClose.innerHTML = '<span class="fs-x">✕</span> ย่อกลับ <kbd>Esc</kbd>'; document.body.appendChild(fsClose); }
    const onMove = ev => { if (ev.clientY <= 70) fsClose.classList.add('show'); else fsClose.classList.remove('show'); };
    const setFs = on => {
      wrap.classList.toggle('as-fs', on); document.body.classList.toggle('edit-fs-lock', on);
      if (expBtn) expBtn.innerHTML = on ? '⤡ ย่อ' : '⛶ ขยาย';
      fsClose.style.display = on ? 'inline-flex' : 'none'; fsClose.classList.add('show');
      if (on) { document.addEventListener('mousemove', onMove); setTimeout(() => { if (wrap.classList.contains('as-fs')) fsClose.classList.remove('show'); }, 1800); }
      else document.removeEventListener('mousemove', onMove);
    };
    document.querySelector('[data-as-edit]')?.addEventListener('click', () => { editAll = !editAll; pending = {}; App.render(); });
    expBtn?.addEventListener('click', () => setFs(!wrap.classList.contains('as-fs')));
    fsClose.addEventListener('click', () => setFs(false));
    document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape' && wrap && wrap.classList.contains('as-fs')) setFs(false); });
  }

  // กริดค่าที่คำนวณแล้ว (ใช้ค่าที่ Submit แล้วจาก Supabase) — ให้หน้าอื่นดึงตัวเลขไปใช้ (เช่น ต้นทุนต่อหน่วย)
  function grid() { return compute().out; }
  return { page, bind, grid };
})();

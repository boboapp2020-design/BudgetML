/* =============================================================
 * pages-req.js — คำร้องปรับงบกลางปี (ขอเพิ่ม/ลด/โยก)
 *  หน้าต่างปรับงบ 2 ช่วง: เดือน 1-3 และ 5-12 (บัญชีเปิด/ปิด)
 *  สาย: หน่วยงานยื่น → หัวหน้าฝ่ายอนุมัติ → บัญชีดำเนินการ (แก้งบอัตโนมัติ) → แจ้งกลับ
 *  หน้าเดียว แสดงตามบทบาท (USER / MANAGER / ACCOUNTING)
 * ============================================================= */

const PagesReq = (() => {
  const esc = s => UI.esc(s);
  const fmt = n => UI.fmt(n);
  const card = (t, b, o) => UI.card(t, b, o);
  const MS = () => Store.MONTH_S;

  const STATUS = {
    PENDING_MGR: { t: 'รอหัวหน้าฝ่าย', c: 'st-wait' },
    PENDING_ACC: { t: 'รอบัญชีดำเนินการ', c: 'st-acc' },
    APPROVED:    { t: 'อนุมัติ & ปรับงบแล้ว', c: 'st-ok' },
    REJECTED:    { t: 'ปฏิเสธ', c: 'st-no' },
    CANCELLED:   { t: 'ยกเลิก', c: 'st-cancel' },
  };
  const statusChip = s => { const m = STATUS[s] || { t: s, c: '' }; return `<span class="req-st ${m.c}">${esc(m.t)}</span>`; };

  const rowLabel = (deptId, glId, cct) => {
    const g = Store.gl(glId);
    const rows = Store.deptRows(deptId);
    const r = rows.find(x => x.glId === glId && x.cct === cct);
    const tail = (r && r.multiCct) ? ` <small class="muted">[${esc(r.cctName)}]</small>` : '';
    return `${g ? esc(g.code + ' ' + g.name) : glId}${tail}`;
  };
  const itemLine = it => {
    const sign = it.delta > 0 ? '+' : '';
    const cls = it.delta > 0 ? 'req-plus' : 'req-minus';
    return `<div class="req-item"><span>${rowLabel(it.deptId, it.glId, it.cct)} · <b>${esc(MS()[it.month - 1] || ('ด.' + it.month))}</b></span>
      <span class="${cls}">${sign}${fmt(Math.round(it.delta))}</span></div>`;
  };
  const reqCard = (req, actionsHtml) => {
    const d = Store.dept(req.deptId);
    const when = (req.createdAt || '').slice(0, 16).replace('T', ' ');
    const note = [req.mgrNote && `หัวหน้าฝ่าย: ${req.mgrNote}`, req.accNote && `บัญชี: ${req.accNote}`].filter(Boolean).join(' · ');
    return `<div class="req-card">
      <div class="req-top">
        <div><b>${esc(Store.reqTypeLabel(req.type))}</b> ${statusChip(req.status)}<br>
          <small class="muted">${esc(d ? d.name : req.deptId)} · โดย ${esc(req.createdBy || '')} · ${esc(when)}</small></div>
      </div>
      <div class="req-items">${req.items.map(itemLine).join('')}</div>
      <div class="req-reason">📝 <b>เหตุผล:</b> ${esc(req.reason || '—')}${req.memoNote ? ` · <b>memo:</b> ${esc(req.memoNote)}` : ''}</div>
      ${note ? `<div class="req-note muted">🗒️ ${esc(note)}</div>` : ''}
      ${actionsHtml || ''}
    </div>`;
  };

  function requests(user) {
    const year = UI.year();
    const open = Store.changeWindowsOpen(year);
    const allowed = Store.monthsAllowed(year);
    const chip = open.length
      ? `<span class="uc-round uc-round-open">🟢 เปิดยื่นคำร้อง: ${open.map(w => w.label).join(' · ')}</span>`
      : `<span class="uc-round uc-round-lock">🔒 ปิดรับคำร้องปรับงบ ปี ${year}</span>`;

    let body = '';
    if (user.role === 'ACCOUNTING') body = accView(user, year, open);
    else if (user.role === 'MANAGER') body = mgrView(user, year);
    else body = userView(user, year, open, allowed);

    return UI.pageHead(`คำร้องปรับงบกลางปี ${year} 📝`,
      `ขอเพิ่ม/ลด/โยกงบระหว่างปี · ยื่นได้ 2 ช่วง (เดือน 1-3 และ 5-12) · หน่วยงานยื่น → หัวหน้าฝ่ายอนุมัติ → บัญชีดำเนินการ`,
      chip) + body;
  }

  /* ---------- USER: ยื่นคำร้อง + คำร้องของฉัน ---------- */
  function userView(user, year, open, allowed) {
    const mine = Store.myRequests(user).filter(r => r.year === year);
    const rows = user.departmentId ? Store.deptRows(user.departmentId) : [];
    const rowOpts = rows.map(r => `<option value="${esc(r.key)}">${esc(r.gl.code + ' ' + r.gl.name)}${r.multiCct ? ' [' + esc(r.cctName) + ']' : ''}</option>`).join('');
    const monthOpts = allowed.map(m => `<option value="${m}">เดือน ${m} — ${esc(MS()[m - 1])}</option>`).join('');

    const form = (open.length && user.departmentId) ? card('➕ ยื่นคำร้องใหม่', `
      <div class="req-form">
        <label class="fld"><span>ประเภทคำร้อง</span>
          <select id="reqType"><option value="increase">➕ ขอเพิ่มงบ</option><option value="decrease">➖ ขอลดงบ</option><option value="transfer">🔄 ขอโยกงบ (ภายในหน่วยงาน)</option></select></label>

        <div id="reqSingle">
          <div class="req-grid3">
            <label class="fld"><span>ช่องงบที่จะปรับ (GL)</span><select id="reqRow">${rowOpts}</select></label>
            <label class="fld"><span>เดือน</span><select id="reqMonth">${monthOpts}</select></label>
            <label class="fld"><span>จำนวนเงิน (กีบ)</span><input id="reqAmount" inputmode="decimal" placeholder="เช่น 5000000"></label>
          </div>
        </div>

        <div id="reqTransfer" style="display:none">
          <div class="req-tr">
            <div class="req-tr-side"><div class="req-tr-h">จาก (−)</div>
              <label class="fld"><span>ช่องต้นทาง</span><select id="reqFromRow">${rowOpts}</select></label>
              <label class="fld"><span>เดือน</span><select id="reqFromMonth">${monthOpts}</select></label></div>
            <div class="req-tr-arrow">➜</div>
            <div class="req-tr-side"><div class="req-tr-h">ไป (+)</div>
              <label class="fld"><span>ช่องปลายทาง</span><select id="reqToRow">${rowOpts}</select></label>
              <label class="fld"><span>เดือน</span><select id="reqToMonth">${monthOpts}</select></label></div>
          </div>
          <label class="fld"><span>จำนวนเงินที่โยก (กีบ)</span><input id="reqTAmount" inputmode="decimal" placeholder="เช่น 5000000"></label>
        </div>

        <label class="fld"><span>เหตุผล / ความจำเป็น <b class="req-req">*</b></span><textarea id="reqReason" rows="2" placeholder="อธิบายเหตุผลของการปรับงบ"></textarea></label>
        <label class="fld"><span>เลขที่ / อ้างอิง memo <small class="muted">(เฟส 2 จะแนบไฟล์ได้)</small></span><input id="reqMemo" placeholder="เช่น memo เลขที่ ... / อ้างอิงเอกสาร"></label>
        <button class="primary-btn" id="reqSubmit">📨 ส่งคำร้อง (ไปหัวหน้าฝ่าย)</button>
      </div>`) : card('', `<div class="lock-banner">🔒 ยังไม่เปิดหน้าต่างปรับงบปี ${year} — ยื่นคำร้องไม่ได้ (รอแผนกบัญชีเปิดช่วงเดือน 1-3 หรือ 5-12)</div>`);

    const list = mine.length
      ? mine.map(r => reqCard(r, r.status === 'PENDING_MGR'
          ? `<div class="req-actions"><button class="ghost-btn small" data-req-cancel="${r.id}">✕ ยกเลิกคำร้อง</button></div>` : '')).join('')
      : `<p class="muted" style="padding:10px">ยังไม่มีคำร้องปรับงบปีนี้</p>`;

    return form + card(`📋 คำร้องของฉัน ปี ${year} (${mine.length})`, list);
  }

  /* ---------- MANAGER: อนุมัติคำร้องในสายงาน ---------- */
  function mgrView(user, year) {
    const pending = Store.requestsForMgr(user).filter(r => r.year === year);
    const body = pending.length
      ? pending.map(r => reqCard(r, `<div class="req-actions">
          <button class="primary-btn small" data-req-mgr-ok="${r.id}">✅ อนุมัติ (ส่งต่อบัญชี)</button>
          <button class="ghost-btn small" data-req-mgr-no="${r.id}">↩ ตีกลับ</button></div>`)).join('')
      : `<p class="muted" style="padding:10px">ไม่มีคำร้องรออนุมัติในฝ่ายที่ท่านดูแล</p>`;
    return card(`🔎 คำร้องรออนุมัติ (หัวหน้าฝ่าย) ปี ${year} (${pending.length})`, body);
  }

  /* ---------- ACCOUNTING: คุมหน้าต่าง + ดำเนินการ ---------- */
  function accView(user, year, open) {
    const winCtl = Store.CHANGE_WINDOWS.map(w => {
      const st = Store.changeWindowState(year, w.key);
      return `<div class="req-win"><span>${st.open ? '🟢' : '⚪'} <b>${esc(w.label)}</b>${st.openedBy ? ` <small class="muted">· ${st.open ? 'เปิดโดย' : 'ปิดโดย'} ${esc(st.openedBy)}</small>` : ''}</span>
        <button class="${st.open ? 'ghost-btn' : 'primary-btn'} small" data-win="${w.key}" data-open="${st.open ? '0' : '1'}">${st.open ? '🔒 ปิดรับ' : '🟢 เปิดรับ'}</button></div>`;
    }).join('');

    const pendAcc = Store.requestsByStatus('PENDING_ACC').filter(r => r.year === year);
    const pendBody = pendAcc.length
      ? pendAcc.map(r => reqCard(r, `<div class="req-actions">
          <button class="primary-btn small" data-req-acc-ok="${r.id}">✅ อนุมัติ & ปรับงบ</button>
          <button class="ghost-btn small" data-req-acc-no="${r.id}">✕ ปฏิเสธ</button></div>`)).join('')
      : `<p class="muted" style="padding:10px">ไม่มีคำร้องรอดำเนินการ</p>`;

    const done = Store.changeRequests().filter(r => r.year === year && ['APPROVED', 'REJECTED', 'CANCELLED'].includes(r.status)).slice(0, 20);
    const doneBody = done.length ? done.map(r => reqCard(r, '')).join('') : `<p class="muted" style="padding:10px">ยังไม่มีประวัติ</p>`;

    return card(`🎚️ หน้าต่างปรับงบ ปี ${year}`, `<p class="muted small" style="margin:0 0 8px">เปิด/ปิดช่วงที่ให้หน่วยงานยื่นคำร้อง — เปิดแล้วทุกหน่วยงานได้รับแจ้งเตือน</p>${winCtl}`)
      + card(`📥 รอบัญชีดำเนินการ ปี ${year} (${pendAcc.length})`, pendBody)
      + card(`🗂️ ประวัติคำร้อง ปี ${year} (ล่าสุด ${done.length})`, doneBody);
  }

  /* ---------- bind ---------- */
  function requestsBind(user) {
    const year = UI.year();
    const num = v => Number(String(v || '').replace(/[,\s]/g, ''));

    // USER: toggle form by type
    const typeSel = document.getElementById('reqType');
    if (typeSel) {
      const sync = () => {
        const t = typeSel.value;
        document.getElementById('reqSingle').style.display = t === 'transfer' ? 'none' : '';
        document.getElementById('reqTransfer').style.display = t === 'transfer' ? '' : 'none';
      };
      typeSel.addEventListener('change', sync); sync();
    }
    document.getElementById('reqSubmit')?.addEventListener('click', () => {
      const t = document.getElementById('reqType').value;
      const data = { year, type: t, reason: document.getElementById('reqReason').value, memoNote: document.getElementById('reqMemo').value };
      if (t === 'transfer') {
        data.fromKey = document.getElementById('reqFromRow').value;
        data.fromMonth = document.getElementById('reqFromMonth').value;
        data.toKey = document.getElementById('reqToRow').value;
        data.toMonth = document.getElementById('reqToMonth').value;
        data.amount = document.getElementById('reqTAmount').value;
      } else {
        data.rowKey = document.getElementById('reqRow').value;
        data.month = document.getElementById('reqMonth').value;
        data.amount = document.getElementById('reqAmount').value;
      }
      try { Store.createChangeRequest(user, data); UI.toast('ส่งคำร้องแล้ว — รอหัวหน้าฝ่ายอนุมัติ'); App.render(); }
      catch (e) { UI.toast(e.message, 'err'); }
    });
    document.querySelectorAll('[data-req-cancel]').forEach(b => b.addEventListener('click', () => {
      UI.confirm2('ยกเลิกคำร้อง', 'ยกเลิกคำร้องนี้?', 'คำร้องจะถูกยกเลิก ไม่ส่งต่อหัวหน้าฝ่าย', () => {
        try { Store.cancelChangeRequest(user, b.dataset.reqCancel); UI.toast('ยกเลิกคำร้องแล้ว'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
      });
    }));

    // MANAGER
    document.querySelectorAll('[data-req-mgr-ok]').forEach(b => b.addEventListener('click', () => {
      try { Store.mgrApproveRequest(user, b.dataset.reqMgrOk); UI.toast('อนุมัติแล้ว — ส่งต่อแผนกบัญชี'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    }));
    document.querySelectorAll('[data-req-mgr-no]').forEach(b => b.addEventListener('click', () => {
      const note = window.prompt('เหตุผลที่ตีกลับ (แจ้งหน่วยงาน):', ''); if (note === null) return;
      try { Store.mgrRejectRequest(user, b.dataset.reqMgrNo, note); UI.toast('ตีกลับคำร้องแล้ว'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    }));

    // ACCOUNTING
    document.querySelectorAll('[data-win]').forEach(b => b.addEventListener('click', () => {
      try { Store.setChangeWindow(user, year, b.dataset.win, b.dataset.open === '1'); UI.toast(b.dataset.open === '1' ? 'เปิดรับคำร้องแล้ว' : 'ปิดรับคำร้องแล้ว'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    }));
    document.querySelectorAll('[data-req-acc-ok]').forEach(b => b.addEventListener('click', () => {
      UI.confirm2('อนุมัติและปรับงบ', 'อนุมัติคำร้องนี้และปรับงบตามรายการ?', 'ระบบจะแก้ตัวเลขงบทันที (บันทึก log) และแจ้งกลับหน่วยงาน', () => {
        try { Store.accApproveRequest(user, b.dataset.reqAccOk); UI.toast('อนุมัติและปรับงบเรียบร้อย ✅'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
      });
    }));
    document.querySelectorAll('[data-req-acc-no]').forEach(b => b.addEventListener('click', () => {
      const note = window.prompt('เหตุผลที่ปฏิเสธ (แจ้งหน่วยงาน):', ''); if (note === null) return;
      try { Store.accRejectRequest(user, b.dataset.reqAccNo, note); UI.toast('ปฏิเสธคำร้องแล้ว'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
    }));
  }

  return { requests, requestsBind };
})();

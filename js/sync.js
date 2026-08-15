/* =============================================================
 * sync.js — ซิงค์ข้อมูลกับ Google Sheet ผ่าน Apps Script Web App
 *
 * โมเดล: localStorage = working cache · Google Sheet (_DB) = ศูนย์กลาง
 *  - เปิดแอป → pull จากชีท (rev ใครใหม่กว่าใช้อันนั้น)
 *  - ทุกการแก้ไข → push อัตโนมัติ (debounce 2.5 วิ, มี rev กันเขียนทับ)
 *  - POST ใช้ Content-Type: text/plain เพื่อเลี่ยง CORS preflight ของ Apps Script
 * ============================================================= */

const Sync = (() => {
  const URL_KEY = 'abp_gas_url';
  let state = { mode: 'off', lastSync: null, error: null }; // off | sync | ok | err
  let timer = null, pushing = false, queued = false;

  const url = () => localStorage.getItem(URL_KEY) || '';
  function setUrl(u) {
    u = (u || '').trim();
    if (u) localStorage.setItem(URL_KEY, u); else localStorage.removeItem(URL_KEY);
    setState(u ? 'sync' : 'off');
  }
  const enabled = () => !!url();

  /* ---------- ไฟสถานะบน topbar ---------- */
  function setState(mode, error) {
    state.mode = mode;
    state.error = error || null;
    if (mode === 'ok') state.lastSync = new Date();
    const chip = document.getElementById('syncChip');
    if (chip) chip.outerHTML = chipHtml();
  }
  function chipHtml() {
    const t = state.lastSync ? state.lastSync.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
    const map = {
      off:  ['⚪', 'ออฟไลน์ (localStorage)', 'ยังไม่เชื่อมต่อ Google Sheet — ตั้งค่าที่ Budget Control'],
      sync: ['🔄', 'กำลังซิงค์…', 'กำลังรับส่งข้อมูลกับ Google Sheet'],
      ok:   ['🟢', 'ซิงค์แล้ว ' + t, 'ข้อมูลตรงกับ Google Sheet แล้ว'],
      err:  ['🔴', 'ซิงค์ไม่สำเร็จ', state.error || 'ตรวจสอบการเชื่อมต่อ/URL'],
    };
    const [ic, label, tip] = map[state.mode] || map.off;
    return `<span id="syncChip" class="sync-chip sync-${state.mode}" title="${(tip || '').replace(/"/g, '&quot;')}">${ic} <span class="sync-label">${label}</span></span>`;
  }

  /* ---------- HTTP ---------- */
  async function api(query, body) {
    const u = url();
    if (!u) throw new Error('ยังไม่ได้ตั้งค่า Apps Script URL');
    const res = body
      ? await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      : await fetch(u + (u.includes('?') ? '&' : '?') + query, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  const ping = () => api('action=ping');

  /* ---------- pull: ดึงจากชีท ---------- */
  async function pull() {
    setState('sync');
    try {
      const r = await api('action=load');
      if (!r.ok) throw new Error(r.reason || 'load ล้มเหลว');
      const serverRev = (r.db && r.db.meta && r.db.meta.rev) || 0;
      const localRev = Store.db.meta.rev || 0;
      if (!r.db) {                     // ชีทยังว่าง → ส่งข้อมูลเราขึ้นไปตั้งต้น
        await push(true);
        return { adopted: false, first: true };
      }
      // ชีทเป็น schema เก่ากว่า (แอปอัปเกรดโครงสร้างข้อมูล) → ส่งของใหม่ทับ ไม่รับของเก่า
      if ((r.db.meta.schemaVersion || 0) < (Store.db.meta.schemaVersion || 0)) {
        Store.db.meta.rev = Math.max(localRev, serverRev); // push จะ +1 ให้ชนะ rev บนชีท
        Store.saveSilent();
        await push(true);
        return { adopted: false, migrated: true };
      }
      if (serverRev > localRev) {      // ชีทใหม่กว่า → ใช้ของชีท
        Store.adoptDb(r.db);
        setState('ok');
        return { adopted: true };
      }
      if (localRev > serverRev) {      // เราใหม่กว่า → ส่งขึ้น
        await push(true);
        return { adopted: false };
      }
      setState('ok');
      return { adopted: false };
    } catch (e) {
      setState('err', e.message);
      throw e;
    }
  }

  /* ---------- push: ส่งขึ้นชีท ---------- */
  async function push(immediate) {
    if (!enabled()) return;
    if (pushing) { queued = true; return; }
    pushing = true;
    setState('sync');
    try {
      Store.db.meta.rev = (Store.db.meta.rev || 0) + 1;
      Store.saveSilent();
      const r = await api(null, { action: 'save', db: Store.db });
      if (r.ok) {
        setState('ok');
      } else if (r.reason === 'stale' && r.db) {
        Store.adoptDb(r.db);           // มีคนอื่นบันทึกใหม่กว่า → รับของชีทมาใช้
        setState('ok');
        UI.toast('มีการอัปเดตจากผู้ใช้อื่น — โหลดข้อมูลล่าสุดจาก Google Sheet แล้ว');
        window.App?.render();
      } else {
        throw new Error(r.reason || 'save ล้มเหลว');
      }
    } catch (e) {
      setState('err', e.message);
    } finally {
      pushing = false;
      if (queued) { queued = false; schedulePush(); }
    }
  }
  function schedulePush() {
    if (!enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(() => push(), 2500);
  }

  /* ---------- boot ---------- */
  async function init() {
    Store.setAfterSave(schedulePush);
    if (!enabled()) { setState('off'); return false; }
    try {
      const r = await pull();
      return r.adopted;
    } catch (e) { return false; }
  }

  return { url, setUrl, enabled, ping, pull, push, schedulePush, init, chipHtml, get state() { return state; } };
})();

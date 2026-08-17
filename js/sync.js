/* =============================================================
 * sync.js — ซิงค์ข้อมูลกับ backend (Supabase หรือ Google Apps Script)
 *
 * โมเดล: localStorage = working cache · backend = ศูนย์กลาง
 *  - เลือก backend อัตโนมัติ: ถ้าตั้งค่า Supabase ไว้ใช้ Supabase, ไม่งั้นใช้ GAS
 *  - เปิดแอป → pull · ทุกการแก้ไข → push อัตโนมัติ (debounce 2.5 วิ)
 *  - Supabase: push แบบ diff รายแถว (แต่ละแผนกไม่ชนกัน)
 *  - GAS: push ทั้งก้อน + rev กันเขียนทับ (ของเดิม)
 * ============================================================= */

const Sync = (() => {
  const URL_KEY = 'abp_gas_url';
  let state = { mode: 'off', lastSync: null, error: null, backend: null };
  let timer = null, pushing = false, queued = false;

  const gasUrl = () => localStorage.getItem(URL_KEY) || '';
  const usingSupa = () => (typeof Supa !== 'undefined' && Supa.enabled());
  const backend = () => usingSupa() ? 'supa' : (gasUrl() ? 'gas' : null);
  const enabled = () => backend() !== null;

  function setUrl(u) {           // ตั้งค่า GAS URL (ของเดิม)
    u = (u || '').trim();
    if (u) localStorage.setItem(URL_KEY, u); else localStorage.removeItem(URL_KEY);
    setState(backend() ? 'sync' : 'off');
  }

  /* ---------- ไฟสถานะบน topbar ---------- */
  function setState(mode, error) {
    state.mode = mode; state.error = error || null; state.backend = backend();
    if (mode === 'ok') state.lastSync = new Date();
    const chip = document.getElementById('syncChip');
    if (chip) chip.outerHTML = chipHtml();
  }
  function chipHtml() {
    const t = state.lastSync ? state.lastSync.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
    const be = state.backend === 'supa' ? 'Supabase' : state.backend === 'gas' ? 'Google Sheet' : '';
    const map = {
      off:  ['⚪', 'ออฟไลน์ (localStorage)', 'ยังไม่เชื่อมต่อฐานข้อมูล — ตั้งค่าที่ Budget Control'],
      sync: ['🔄', 'กำลังซิงค์…', 'กำลังรับส่งข้อมูลกับ ' + be],
      ok:   ['🟢', be + ' · ' + t, 'ข้อมูลตรงกับ ' + be + ' แล้ว'],
      err:  ['🔴', 'ซิงค์ไม่สำเร็จ', state.error || 'ตรวจสอบการเชื่อมต่อ'],
    };
    const [ic, label, tip] = map[state.mode] || map.off;
    return `<span id="syncChip" class="sync-chip sync-${state.mode}" title="${(tip || '').replace(/"/g, '&quot;')}">${ic} <span class="sync-label">${label}</span></span>`;
  }

  /* ================= GAS backend (ของเดิม) ================= */
  async function gasApi(query, body) {
    const u = gasUrl();
    if (!u) throw new Error('ยังไม่ได้ตั้งค่า Apps Script URL');
    const res = body
      ? await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      : await fetch(u + (u.includes('?') ? '&' : '?') + query, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  const gasPing = () => gasApi('action=ping');

  async function gasPull() {
    const r = await gasApi('action=load');
    if (!r.ok) throw new Error(r.reason || 'load ล้มเหลว');
    const serverRev = (r.db && r.db.meta && r.db.meta.rev) || 0;
    const localRev = Store.db.meta.rev || 0;
    if (!r.db) { await gasPush(true); return { adopted: false, first: true }; }
    if ((r.db.meta.schemaVersion || 0) < (Store.db.meta.schemaVersion || 0)) {
      Store.db.meta.rev = Math.max(localRev, serverRev); Store.saveSilent(); await gasPush(true);
      return { adopted: false, migrated: true };
    }
    if (serverRev > localRev) { Store.adoptDb(r.db); return { adopted: true }; }
    if (localRev > serverRev) { await gasPush(true); return { adopted: false }; }
    return { adopted: false };
  }
  async function gasPush() {
    Store.db.meta.rev = (Store.db.meta.rev || 0) + 1;
    Store.saveSilent();
    const r = await gasApi(null, { action: 'save', db: Store.db });
    if (r.ok) return;
    if (r.reason === 'stale' && r.db) {
      Store.adoptDb(r.db); UI.toast('มีการอัปเดตจากผู้ใช้อื่น — โหลดข้อมูลล่าสุดแล้ว'); window.App?.render(); return;
    }
    throw new Error(r.reason || 'save ล้มเหลว');
  }

  /* ================= Supabase backend ================= */
  async function supaPull() {
    const db = await Supa.loadAll();
    if (!db) { await Supa.pushDiff(Store.db); return { adopted: false, first: true }; }
    if ((db.meta.schemaVersion || 0) < (Store.db.meta.schemaVersion || 0)) {
      await Supa.pushDiff(Store.db); return { adopted: false, migrated: true };
    }
    Store.adoptDb(db); return { adopted: true };
  }
  async function supaPush() {
    Store.db.meta.rev = (Store.db.meta.rev || 0) + 1;
    Store.saveSilent();
    await Supa.pushDiff(Store.db);
  }

  /* ================= orchestration ================= */
  async function pull() {
    if (!enabled()) { setState('off'); return { adopted: false }; }
    setState('sync');
    try {
      const r = backend() === 'supa' ? await supaPull() : await gasPull();
      setState('ok'); return r;
    } catch (e) { setState('err', e.message); throw e; }
  }
  async function push() {
    if (!enabled()) return;
    if (pushing) { queued = true; return; }
    pushing = true; setState('sync');
    try {
      if (backend() === 'supa') await supaPush(); else await gasPush();
      setState('ok');
    } catch (e) { setState('err', e.message); }
    finally { pushing = false; if (queued) { queued = false; schedulePush(); } }
  }
  function schedulePush() {
    if (!enabled()) return;
    clearTimeout(timer);
    // หน่วงสั้น (รวมการพิมพ์รัวๆ/วางทั้งก้อนเป็น 1 ครั้ง) แล้วซิงค์ขึ้น Supabase เกือบทันที
    timer = setTimeout(() => push(), 800);
  }

  async function ping() { return backend() === 'supa' ? Supa.ping() : gasPing(); }

  async function init() {
    Store.setAfterSave(schedulePush);
    if (!enabled()) { setState('off'); return { adopted: false }; }
    // Supabase + RLS: ต้องยืนยันตัวตนก่อนถึง pull ได้ — ลองต่ออายุ session เดิม
    if (backend() === 'supa' && Supa.authRequired() && !Supa.authed()) {
      const ok = await Supa.refresh();
      if (!ok) { setState('off'); return { adopted: false, needLogin: !!Store.currentUser() }; }
    }
    try { const r = await pull(); return r; }
    catch (e) {
      if (String(e.message).includes('401') || String(e.message).includes('403')) {
        if (typeof Supa !== 'undefined') Supa.signOut();
        return { adopted: false, needLogin: true };
      }
      return { adopted: false };
    }
  }

  return {
    url: gasUrl, setUrl, enabled, backend, ping, pull, push, schedulePush, init, chipHtml,
    get state() { return state; },
  };
})();

/* =============================================================
 * email.js — EmailBridge: ส่งอีเมลแจ้งเตือนผ่าน Supabase Edge Function + Resend
 *
 * ทำงานอัตโนมัติเมื่อ store.notify() ถูกเรียก (ส่งงบ/รับรอง/ตีกลับ/ล็อก ฯลฯ)
 * จะส่งจริงก็ต่อเมื่อ:
 *   1. deploy edge function send-email + ตั้ง RESEND_API_KEY แล้ว (ดู supabase/EMAIL-SETUP.md)
 *   2. มีอีเมลของผู้รับในตาราง user_emails (code = รหัสแผนก หรือ 'ACCOUNTING')
 * ถ้ายังไม่ครบเงื่อนไข = ข้ามเงียบๆ (แจ้งเตือนในแอปทำงานปกติ ไม่มี error รบกวน)
 * ============================================================= */

const EmailBridge = (() => {
  const APP_NAME = 'iBud — งบประมาณประจำปี';

  // หาอีเมลผู้รับจาก target ของ notify(): {role:'ACCOUNTING'} หรือ {deptId:'d2712'}
  function emailsFor(target) {
    const list = (Store.db && Store.db.userEmails) || [];
    const find = code => (list.find(x => x.code === code)?.emails || []).filter(e => /@/.test(e));
    if (target.role) return find(target.role);
    if (target.deptId) {
      const d = Store.dept(target.deptId);
      return d ? find(d.code) : [];
    }
    return [];
  }

  function htmlBody(message) {
    return `<div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;border:1px solid #dbe4f0;border-radius:12px;overflow:hidden">
      <div style="background:#17469b;color:#fff;padding:14px 20px;font-weight:700">${APP_NAME}</div>
      <div style="padding:20px;color:#1c2b45;font-size:15px;line-height:1.6">${message}</div>
      <div style="padding:0 20px 20px"><a href="${location.origin + location.pathname}"
        style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:9px 22px;border-radius:8px;font-size:14px">เปิดระบบงบประมาณ →</a></div>
      <div style="background:#f4f7fc;color:#8a97ab;padding:10px 20px;font-size:12px">อีเมลอัตโนมัติจากระบบ iBud — บริษัท น้ำตาลมิตรลาว จำกัด</div>
    </div>`;
  }

  // best-effort: ยิงแล้วไม่รอผล ไม่โยน error (การแจ้งเตือนในแอปคือช่องทางหลัก)
  function dispatch(target, message) {
    try {
      if (typeof Supa === 'undefined' || !Supa.enabled()) return;
      const to = emailsFor(target);
      if (!to.length) return;
      const subject = '[iBud] ' + String(message).replace(/<[^>]+>/g, '').slice(0, 90);
      Supa.sendEmail(to, subject, htmlBody(message)).catch(() => {});
    } catch (e) { /* เงียบ */ }
  }

  return { dispatch, emailsFor };
})();
window.EmailBridge = EmailBridge;

// =============================================================
// send-email — Supabase Edge Function
// รับ { to: string[], subject, html } แล้วส่งอีเมลผ่าน Resend API
// ต้องตั้ง secret: RESEND_API_KEY (และ EMAIL_FROM ถ้ามีโดเมนของตัวเอง)
// deploy: supabase functions deploy send-email --no-verify-jwt
// =============================================================

const RESEND_URL = "https://api.resend.com/emails";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "RESEND_API_KEY not set — run: supabase secrets set RESEND_API_KEY=..." }, 500);

  try {
    const { to, subject, html } = await req.json();
    if (!Array.isArray(to) || !to.length || !subject) return json({ error: "to[] and subject required" }, 400);
    if (to.length > 50) return json({ error: "max 50 recipients per call" }, 400);

    const r = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ?? "iBud <onboarding@resend.dev>",
        to, subject, html,
      }),
    });
    const data = await r.json();
    return json(data, r.ok ? 200 : r.status);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

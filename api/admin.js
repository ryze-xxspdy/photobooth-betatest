/* POST /api/admin  { "pass": "..." }  →  { ok: true }

   The strip-manager passcode is checked here instead of in app.js, where
   anyone could read it with View Source. Set ADMIN_PASS in Vercel.

   Be aware of what this protects: the strip manager only edits layouts
   stored in the visitor's own browser, so this is a courtesy gate, not
   a vault. */

import { json, sameOrigin, clientIp, rateLimited, safeEqual } from "./_guard.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
  if (!sameOrigin(req))      return json({ ok: false, error: "Forbidden" }, 403);

  const secret = process.env.ADMIN_PASS;
  if (!secret) return json({ ok: false, error: "ADMIN_PASS is not set on the server" }, 501);

  if (rateLimited("admin:" + clientIp(req), 6, 10 * 60_000))
    return json({ ok: false, error: "Too many tries. Wait a few minutes." }, 429, { "retry-after": "600" });

  let pass = "";
  try {
    const body = await req.json();
    pass = typeof body.pass === "string" ? body.pass.slice(0, 200) : "";
  } catch {
    return json({ ok: false, error: "Bad request" }, 400);
  }

  const ok = await safeEqual(pass, secret);
  await new Promise(r => setTimeout(r, 350));     // blunt guessing speed
  return ok ? json({ ok: true }) : json({ ok: false, error: "Wrong passcode" }, 401);
}

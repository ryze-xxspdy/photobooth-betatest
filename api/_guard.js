/* Shared helpers for the /api functions. The leading underscore keeps
   Vercel from exposing this file as an endpoint of its own. */

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });
}

/* Blocks other websites from driving these endpoints from a visitor's
   browser. Browsers always send Sec-Fetch-Site (and Origin on POST), so
   a cross-site page cannot fake being us. A script run from a terminal
   can lie about headers — that is what the rate limit and short
   credential lifetimes are for. */
export function sameOrigin(req) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return false;
    } catch { return false; }
  }
  return true;
}

export function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0] : req.headers.get("x-real-ip") || "unknown").trim();
}

/* In-memory, per function instance. It slows down floods and brute
   force, but instances do not share memory, so treat it as a speed bump
   rather than a hard limit. For a hard limit use Vercel's WAF rate
   limiting (see SECURITY_AND_RELIABILITY.md). */
const buckets = new Map();
export function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }
    return false;
  }
  b.n++;
  return b.n > max;
}

/* Constant-time string comparison (hash first so lengths match). */
export async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b)))
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

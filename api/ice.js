/* GET /api/ice — hands the booth short-lived TURN credentials.

   TURN is the piece that stops the black screen: when two phones sit
   behind carrier-grade NAT (most mobile networks, including Globe and
   Smart in the Philippines) there is no direct path, so the video has to
   be relayed. The relay password lives in Vercel environment variables
   and is exchanged here for credentials that expire in an hour.

   Configure ONE provider (they are tried in this order):

     Cloudflare  CLOUDFLARE_TURN_KEY_ID  +  CLOUDFLARE_TURN_API_TOKEN
     Metered     METERED_APP  +  METERED_API_KEY      (app = the part before .metered.live)
     Twilio      TWILIO_ACCOUNT_SID  +  TWILIO_AUTH_TOKEN

   With none set, the function answers with public STUN plus a free
   community relay and flags the reply as degraded. That keeps the booth
   working, but it is not something to rely on. */

import { json, sameOrigin, clientIp, rateLimited } from "./_guard.js";

export const config = { runtime: "edge" };

const TTL = 3600;       // seconds a credential stays valid
const PROVIDER_MS = 3500;

const STUN = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
];

/* Last resort only. Public, rate limited, no uptime promise. */
const COMMUNITY_TURN = [
  { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"],
    username: "openrelayproject", credential: "openrelayproject" }
];

async function timedFetch(url, init = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PROVIDER_MS);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

/* Providers disagree on shape: sometimes an array, sometimes one object. */
const asList = v => (Array.isArray(v) ? v : v ? [v] : []);

async function cloudflare() {
  const id = process.env.CLOUDFLARE_TURN_KEY_ID, token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!id || !token) return null;
  const res = await timedFetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate`,
    { method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ttl: TTL }) });
  if (!res.ok) throw new Error(`cloudflare ${res.status}`);
  return asList((await res.json()).iceServers);
}

async function metered() {
  const app = process.env.METERED_APP, key = process.env.METERED_API_KEY;
  if (!app || !key) return null;
  const res = await timedFetch(
    `https://${encodeURIComponent(app)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`metered ${res.status}`);
  return asList(await res.json());
}

async function twilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return null;
  const res = await timedFetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Tokens.json`,
    { method: "POST",
      headers: { authorization: "Basic " + btoa(`${sid}:${tok}`), "content-type": "application/x-www-form-urlencoded" },
      body: `Ttl=${TTL}` });
  if (!res.ok) throw new Error(`twilio ${res.status}`);
  return asList((await res.json()).ice_servers).map(s => ({
    urls: s.urls || s.url, username: s.username, credential: s.credential
  }));
}

const PROVIDERS = [["cloudflare", cloudflare], ["metered", metered], ["twilio", twilio]];

export default async function handler(req) {
  if (req.method !== "GET") return json({ ok: false, error: "Use GET" }, 405);
  if (!sameOrigin(req))     return json({ ok: false, error: "Forbidden" }, 403);
  if (rateLimited("ice:" + clientIp(req), 40, 60_000))
    return json({ ok: false, error: "Slow down" }, 429, { "retry-after": "60" });

  for (const [name, fn] of PROVIDERS) {
    try {
      const list = await fn();
      if (list && list.length) {
        return json({ ok: true, provider: name, ttl: TTL, iceServers: [...STUN, ...list] });
      }
    } catch (err) {
      console.error("[ice]", name, err && err.message);   // keep trying the next provider
    }
  }

  return json({
    ok: true, provider: "public-fallback", degraded: true, ttl: 300,
    iceServers: [...STUN, ...COMMUNITY_TURN]
  });
}

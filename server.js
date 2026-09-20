/* Optional: your own signalling server.

   Signalling is the tiny handshake that lets two browsers find each
   other before video starts. By default the booth uses the free public
   PeerJS broker, which is shared by everyone and has no uptime promise.
   Running this yourself removes that single point of failure — and if
   you host it near your users (Singapore for the Philippines) the
   handshake is faster too.

   It needs a real, always-on Node host with WebSocket support (Render,
   Railway, Fly.io, a VPS). It CANNOT run on Vercel's serverless
   functions. Free tiers that sleep add a cold start of many seconds to
   the first call, so use an always-on plan if you can.

   Environment variables
     ALLOWED_ORIGIN   your booth URL(s), comma separated. Required.
                      e.g. https://ryzebooth.vercel.app
     PEER_KEY         shared key; must match `key` in CONFIG.peerServer.
                      Default "peerjs". Set your own.
     PORT             provided by the host.
*/
import { PeerServer } from "peer";

const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
if (!allowed.length) {
  console.error("Refusing to start: set ALLOWED_ORIGIN to your booth's URL.");
  process.exit(1);
}

const port = Number(process.env.PORT) || 9000;

PeerServer({
  port,
  path: "/ryzebooth",                 // must match CONFIG.peerServer.path
  key: process.env.PEER_KEY || "peerjs",
  proxied: true,                      // we sit behind the host's HTTPS proxy
  allow_discovery: false,             // nobody can list active room IDs
  concurrent_limit: 500,
  alive_timeout: 60000,
  corsOptions: { origin: allowed }
});

console.log(`RyzeBooth peer server listening on :${port}`);

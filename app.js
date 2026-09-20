/* ══════════════════════════════════════════════════════════════
   smora photo booth
   ──────────────────────────────────────────────────────────────
   SETTINGS you may want to change are all in CONFIG below.
   The Discord webhook is NOT here on purpose — it lives in a
   Vercel environment variable so nobody can read it from the page.
   See README.md.
   ══════════════════════════════════════════════════════════════ */

const CONFIG = {
  name: "RyzeBooth",
  discordEndpoint: "/api/discord",  // Vercel function; leave as is
  defaultCaption: "",
  maxShots: 8,
  duoPeerPrefix: "ryzebooth-",      // namespaces our codes on the shared PeerJS broker

  /* ── WebRTC servers ───────────────────────────────────────
     STUN only works when at least one side sits behind a simple
     NAT. Most mobile carriers — and a lot of home ISPs — use
     carrier-grade or symmetric NAT, which STUN cannot punch
     through. That is the real reason the far-away partner used
     to get a black screen: the data channel connected, the video
     never found a path. A TURN server relays the video when no
     direct path exists.

     Real credentials now come from /api/ice (see api/ice.js and
     SECURITY_AND_RELIABILITY.md) so no relay password is ever in
     this file. The list below is only the LAST-RESORT fallback,
     used if that endpoint cannot be reached. The openrelay entries
     are a free public service: rate limited, no uptime promise.
     ───────────────────────────────────────────────────────── */
  duoIceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject", credential: "openrelayproject" }
  ],

  /* Optional: your own signalling server (see peer-server/). The free
     public PeerJS broker is a single shared service; if it hiccups,
     nobody can start a call. Leave null to keep using it. Example:
       { host: "ryze-peer.onrender.com", port: 443, path: "/ryzebooth",
         secure: true, key: "peerjs" }                                 */
  peerServer: null,

  codeLength: 5,               // 32^5 ≈ 33.5 million codes. Short enough to read/type
                                // fast; the 5-minute expiry + non-discoverable broker
                                // (allow_discovery:false in peer-server) + one-guest lock
                                // are what keep that shorter window safe rather than
                                // sheer code length. Raise this back up if the booth is
                                // ever used somewhere less trusted than a private event.
  relayAfterAttempts: 1,       // force relay-only (TURN) after just 1 failed direct dial
                                // instead of 2 — gets a working picture up faster on
                                // carrier-grade NAT instead of wasting a second attempt
                                // on a direct path that was never going to succeed
  bitrateDirectKbps: 1800,    // outgoing video cap on a direct path
  bitrateRelayKbps: 900,      // …and through a relay / weak mobile link
  chatBurst: 8, chatBurstMs: 5000,   // incoming-message flood guard

  connectionTimeout: 15000,   // how long before we tell the user something is wrong
  linkMinutes: 5,             // how long a hosted code / link stays valid
  videoRetryEvery: 4000,      // watchdog interval while video has not arrived
  maxVideoRetries: 6          // how many times to re-dial before giving up
};

/* ─── built-in strips ─────────────────────────────────────── */
const BUILTIN = {
  strip4:  {label:"Classic strip", cols:1, rows:4, cw:560, ch:420, pad:30, gap:16, foot:110, rad:10},
  strip3:  {label:"Mini strip",    cols:1, rows:3, cw:560, ch:420, pad:30, gap:16, foot:100, rad:10},
  grid4:   {label:"Grid",          cols:2, rows:2, cw:460, ch:460, pad:28, gap:16, foot:96,  rad:10},
  duo:     {label:"Duo",           cols:1, rows:2, cw:620, ch:430, pad:28, gap:16, foot:96,  rad:10},
  wide6:   {label:"Contact sheet", cols:2, rows:3, cw:440, ch:330, pad:26, gap:12, foot:92,  rad:8},
  polaroid:{label:"Polaroid",      cols:1, rows:1, cw:640, ch:560, pad:34, gap:0,  foot:160, rad:8},
  single:  {label:"Big one",       cols:1, rows:1, cw:760, ch:560, pad:20, gap:0,  foot:70,  rad:12}
};

const LOOKS = {
  none:   {label:"None",    css:"none"},
  warm:   {label:"Warm",    css:"saturate(1.25) sepia(.18) brightness(1.06) contrast(1.02)"},
  film:   {label:"Film",    css:"sepia(.35) contrast(1.12) brightness(.97) saturate(1.15)"},
  mono:   {label:"Mono",    css:"grayscale(1) contrast(1.25) brightness(1.05)"},
  candy:  {label:"Candy",   css:"saturate(1.5) brightness(1.1) contrast(.92) hue-rotate(-8deg)"},
  cool:   {label:"Cool",    css:"hue-rotate(178deg) saturate(1.15) brightness(1.04)"},
  neon:   {label:"Neon",    css:"saturate(2.1) contrast(1.22) hue-rotate(160deg)"},
  dream:  {label:"Dream",   css:"brightness(1.12) contrast(.88) saturate(1.3)"},
  noir:   {label:"Noir",    css:"grayscale(1) contrast(1.6) brightness(.9)"},
  faded:  {label:"Faded",   css:"saturate(.72) brightness(1.1) contrast(.9) sepia(.12)"},
  rose:   {label:"Rose",    css:"saturate(1.32) hue-rotate(-12deg) brightness(1.06) contrast(1.02)"},
  sunset: {label:"Sunset",  css:"sepia(.26) saturate(1.5) hue-rotate(-18deg) brightness(1.05)"},
  honey:  {label:"Honey",   css:"sepia(.4) saturate(1.4) brightness(1.08) contrast(1.02)"},
  ember:  {label:"Ember",   css:"sepia(.3) saturate(1.65) hue-rotate(-26deg) contrast(1.1)"},
  vhs:    {label:"VHS",     css:"saturate(1.35) contrast(1.16) hue-rotate(8deg) brightness(1.02)"},
  cyber:  {label:"Cyber",   css:"saturate(1.8) contrast(1.3) hue-rotate(200deg) brightness(.98)"},
  mint:   {label:"Mint",    css:"hue-rotate(112deg) saturate(1.2) brightness(1.06)"},
  lilac:  {label:"Lilac",   css:"hue-rotate(250deg) saturate(1.25) brightness(1.08) contrast(.95)"},
  frost:  {label:"Frost",   css:"brightness(1.12) contrast(.95) saturate(.9) hue-rotate(186deg)"},
  glow:   {label:"Glow",    css:"brightness(1.2) contrast(.85) saturate(1.15)"},
  bubble: {label:"Bubble",  css:"saturate(1.7) brightness(1.14) contrast(.9) hue-rotate(-20deg)"},
  deep:   {label:"Deep",    css:"contrast(1.35) saturate(1.25) brightness(.92)"},
  silver: {label:"Silver",  css:"grayscale(.85) contrast(1.15) brightness(1.08) sepia(.1)"},
  sketch: {label:"Sketch",  css:"grayscale(1) contrast(1.9) brightness(1.15)"}
};

/* ─── paper ───────────────────────────────────────────────────
   A paper is either a hex colour ("#FFF4E4") or a blend written
   as "grad:#AAA,#BBB,160" — two colours and a CSS angle. Both the
   swatches and the canvas read the same string, so anything the
   user mixes shows up identically in the export.
   ───────────────────────────────────────────────────────────── */
const PAPERS = [
  "#FFFFFF","#FFF4E4","#FDEBD8","#FFE1EC","#F2A0BC","#E23E57",
  "#FFC24B","#FFF6A8","#C7F0D8","#7BD9A8","#BFE4FF","#7FB3FF",
  "#C9A7E8","#9B7BD4","#EDE7E1","#BBB1AA","#4A3F4A","#231A2B",
  "#141013","#0B0B0C",
  "grad:#FFE1EC,#FFF4E4,160",
  "grad:#F2A0BC,#C9A7E8,150",
  "grad:#7FB3FF,#C7F0D8,160",
  "grad:#FFC24B,#FF8FA3,155",
  "grad:#FFF6A8,#FFD3E0,160",
  "grad:#7BD9A8,#BFE4FF,150",
  "grad:#231A2B,#4A3F4A,165",
  "grad:#141013,#3A2436,160"
];

function paperStops(p){
  const s = String(p || "#FFFFFF");
  if(s.startsWith("grad:")){
    const [a, b, ang] = s.slice(5).split(",");
    return { a: a || "#FFFFFF", b: b || a || "#FFFFFF", ang: Number(ang) || 160, grad: true };
  }
  return { a: s, b: s, ang: 0, grad: false };
}
function paperCss(p){
  const s = paperStops(p);
  return s.grad ? `linear-gradient(${s.ang}deg, ${s.a}, ${s.b})` : s.a;
}
function paintPaper(x, w, h){
  const s = paperStops(S.bg);
  if(!s.grad){ x.fillStyle = s.a; x.fillRect(0, 0, w, h); return; }
  const r = s.ang * Math.PI / 180;
  const dx = Math.sin(r), dy = -Math.cos(r);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const g = x.createLinearGradient(w/2 - dx*half, h/2 - dy*half, w/2 + dx*half, h/2 + dy*half);
  g.addColorStop(0, s.a); g.addColorStop(1, s.b);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}
function paperIsDark(){
  const s = paperStops(S.bg);
  return (lum(s.a) + lum(s.b)) / 2 < 140;
}
function lum(hex){
  const c = String(hex).replace("#", "");
  const full = c.length === 3 ? c.split("").map(x => x + x).join("") : c.slice(0, 6);
  const n = parseInt(full, 16);
  if(isNaN(n)) return 255;
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

const EMOJI = {
  "😀":"😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😜 🤪 😎 🥸 🤓 🧐 😏 😴 🥳 🤠 😭 😱 🤯 🥺 🤗 🤭 🫠",
  "❤️":"❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💖 💗 💓 💞 💕 💘 💝 💟 ❣️ 💔 😻 💋 🫶 💌",
  "🎉":"🎉 🎊 🎈 🎁 🎂 🍰 🪅 🎆 🎇 ✨ 🌟 ⭐ 💫 🔥 💥 🎵 🎶 🎤 🎧 🕺 💃 🪩 🍾 🥂 🎺 🥁",
  "🌸":"🌸 🌺 🌻 🌷 🌹 🌼 💐 🍀 🍄 🌈 ☀️ 🌤️ ⛅ 🌙 🌊 🍁 🍂 🌴 🌵 🦋 🐝 ❄️ ⚡",
  "🐶":"🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🦄 🐢 🐙 🦖 🐳",
  "🍕":"🍕 🍔 🍟 🌭 🍿 🧁 🍩 🍪 🍫 🍬 🍭 🍦 🍨 🍉 🍓 🍒 🥑 🌮 🍜 🍣 🧋 ☕ 🥤",
  "👋":"👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 👈 👉 👆 👇 👍 ✊ 👊 🙌 👏 🙏 💪 🫵",
  "💯":"💯 ✅ ⚡ 🚀 👑 💎 🎯 🏆 🥇 🔮 🪄 💸 🎮 📸 🎬 🎨 ♾️ 💤 🔔 🎀 🪞 🕯️"
};

/* ─── state ───────────────────────────────────────────────── */
const S = {
  step: 1, frame: "strip4", look: "warm", timer: 3,
  bg: "#FFFFFF", caption: CONFIG.defaultCaption, date: true,
  mirror: true, facing: "user", sound: true,
  shots: [], stickers: [], sel: null, cat: "😀",
  busy: false, gallery: [], custom: {}, papers: [],
  duo: emptyDuo(), theme: "dark",
  duoView: "choice", chat: [], unread: 0, chatCollapsed: false
};
let duoSeq = 0;   // bumps on every host/join/teardown so a slow async step can tell it was superseded
function emptyDuo(){
  return {
    active: false, role: null, peer: null, peerOpen: false, conn: null,
    call: null, pendingCall: null, code: null, hostId: null,
    remoteStream: null, expiry: null, attempts: 0, lastCall: 0,
    openT: null, expiryT: null, watchT: null, discT: null,
    relay: false, wake: null, chatTimes: []
  };
}

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const FRAMES = () => ({ ...BUILTIN, ...S.custom });
const F = () => FRAMES()[S.frame] || BUILTIN.strip4;
const shotsOf = f => f.cols * f.rows;

/* ─── sound ───────────────────────────────────────────────── */
let AC;
function beep(freq = 760, dur = .09, vol = .2){
  if(!S.sound) return;
  try{
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  }catch(e){}
}
const shutter = () => { beep(1100,.05,.18); setTimeout(()=>beep(520,.09,.16), 55); };

/* ─── toast ───────────────────────────────────────────────── */
let toastT;
function toast(msg, kind = ""){
  const el = $("#toast");
  el.textContent = msg; el.className = "on " + kind;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.className = kind, 3000);
}

/* ─── steps ───────────────────────────────────────────────── */
let stepEcho = false;
function goSilent(n){ stepEcho = true; try{ go(n); } finally { stepEcho = false; } }

function go(n){
  if(n === 3 && S.step !== 3) prepShots();
  if(n !== 3) stopCam();
  S.step = n;
  $$(".step").forEach((el, i) => el.classList.toggle("on", i + 1 === n));
  $("#fill").style.width = (n / 4 * 100) + "%";
  $("#count").textContent = n + " of 4";
  if(n === 2) applyDuoStep2UI();
  if(n === 3) applyDuoStep3UI();
  if(n === 4){ drawPreview(); toast("Thank you for using RyzeBooth ✨", "good"); }
  /* the host drags the guest along so nobody is left on the wrong screen */
  if(!stepEcho && S.duo.active && S.duo.role === "host" && (n === 2 || n === 3)) sendDuo({ type: "step", n });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-go]").forEach(b => b.onclick = () => go(+b.dataset.go));
$("#toStep4").onclick = () => go(4);
$("#soloCard").onclick = () => { teardownDuo(); releaseCam(); markCardSelected("solo"); go(2); };
$("#duoCard").onclick = () => openDuoModal();

function markCardSelected(mode){
  $("#soloCard").classList.toggle("sel", mode === "solo");
  $("#duoCard").classList.toggle("sel", mode === "duo");
}
function layoutFilter(){
  return null; // any layout works in Duo Booth — each shot already combines both cameras
}
function applyDuoStep2UI(){
  const guest = S.duo.active && S.duo.role === "guest";
  $("#layoutPanel").hidden = guest;
  $("#step2Controls").hidden = guest;
  $("#step2Waiting").hidden = !guest;
  $("#duoLayoutNote").hidden = !(S.duo.active && S.duo.role === "host");
  if(!guest){
    buildLayouts($("#layouts"), false, layoutFilter());
  }
}
function applyDuoStep3UI(){
  const active = S.duo.active;
  $("#stageRemote").hidden = !active;
  $("#camLabelYou").hidden = !active;
  $("#chatPanel").hidden = !active;
  $("#duoNetWrap").hidden = !active;
  renderChat();

  if(active){
    /* the room is already open — pick up the stream we already have
       instead of making them tap "Start camera" again */
    if(stream){
      attachLocal();
      setShoot(S.shots.some(Boolean) && S.shots.every(Boolean) ? "redo" : "shoot");
    }else{
      ensureStream().then(() => {
        attachLocal();
        setShoot("shoot");
        beginMedia();
      }).catch(() => {});
    }
    if(S.duo.remoteStream) attachRemote(S.duo.remoteStream);
    else $("#remoteMsg").style.display = "grid";
  }

  $("#camHint").textContent = !active
    ? "Your camera never leaves this device. Photos are only saved when you choose to save them."
    : (S.duo.role === "host"
        ? "Once you both have a camera on, you control the countdown for both of you."
        : "Once you both have a camera on, your host starts the countdown for both of you.");
}

$("#soundBtn").onclick = e => {
  S.sound = !S.sound;
  e.currentTarget.classList.toggle("on", S.sound);
  if(S.sound) beep(900, .07);
};

/* ─── light / dark theme ──────────────────────────────────── */
const THEME_KEY = "smora_theme_v1";
function applyTheme(t){
  S.theme = t;
  document.documentElement.setAttribute("data-theme", t);
  $("#themeBtn").textContent = t === "light" ? "☀" : "☾";
  $("#themeBtn").classList.toggle("on", t === "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", t === "light" ? "#FDF7F4" : "#141013");
}
function loadTheme(){
  let t = null;
  try{ t = localStorage.getItem(THEME_KEY); }catch(e){}
  if(!t) t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  applyTheme(t);
}
$("#themeBtn").onclick = () => {
  applyTheme(S.theme === "light" ? "dark" : "light");
  try{ localStorage.setItem(THEME_KEY, S.theme); }catch(e){}
  if(S.step === 4) drawPreview();
};

/* ─── builders ────────────────────────────────────────────── */
function buildLayouts(host, showDelete = false, filterFn = null){
  const all = FRAMES();
  const entries = Object.entries(all).filter(([, f]) => !filterFn || filterFn(f));
  host.innerHTML = entries.map(([k, f]) => {
    const cells = Array(Math.min(shotsOf(f), 12)).fill('<i></i>').join("");
    return `<button class="lay ${k === S.frame && !showDelete ? "on" : ""}" data-f="${k}">
      ${showDelete && S.custom[k] ? `<span class="del" data-del="${k}" title="Delete">✕</span>` : ""}
      <span class="mini" style="grid-template-columns:repeat(${f.cols},1fr)">${cells}</span>
      <b>${esc(f.label)}</b><small>${shotsOf(f)} photo${shotsOf(f) > 1 ? "s" : ""}</small>
    </button>`;
  }).join("");
  host.querySelectorAll("[data-f]").forEach(b => b.onclick = e => {
    if(e.target.closest("[data-del]")) return;
    if(showDelete) return;
    S.frame = b.dataset.f;
    S.shots = []; S.stickers = []; S.sel = null;
    $("#toStep4").disabled = true; setShoot("start");
    buildLayouts($("#layouts"), false, layoutFilter());
    prepShots();
    if(S.duo.active && S.duo.role === "host") sendDuo({ type: "config", frame: S.frame, look: S.look, timer: S.timer });
  });
  host.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    if(!confirm("Delete this strip layout?")) return;
    delete S.custom[b.dataset.del];
    saveCustom(); buildLayouts($("#adminList"), true); buildLayouts($("#layouts"), false, layoutFilter());
  });
}

function buildChips(host, obj, key, after){
  host.innerHTML = Object.entries(obj).map(([k, v]) =>
    `<button class="chip ${S[key] === k ? "on" : ""}" data-k="${k}">${v.label}</button>`).join("");
  host.querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
    S[key] = b.dataset.k;
    buildChips($("#looks2"), LOOKS, "look");
    buildChips($("#looks3"), LOOKS, "look");
    applyCamFilter(); renderShots(); if(after) after();
    if(key === "look" && S.duo.active && S.duo.role === "host") sendDuo({ type: "config", frame: S.frame, look: S.look, timer: S.timer });
  });
}

function buildTimers(){
  const opts = [0, 3, 5, 10];
  $("#timers").innerHTML = opts.map(n =>
    `<button class="chip ${S.timer === n ? "on" : ""}" data-n="${n}">${n === 0 ? "Instant" : n + "s"}</button>`).join("");
  $("#timers").querySelectorAll("[data-n]").forEach(b => b.onclick = () => {
    S.timer = +b.dataset.n; buildTimers();
    if(S.duo.active && S.duo.role === "host") sendDuo({ type: "config", frame: S.frame, look: S.look, timer: S.timer });
  });
}

const PAPER_KEY = "smora_papers_v1";
function loadPapers(){
  try{ S.papers = JSON.parse(localStorage.getItem(PAPER_KEY) || "[]"); }
  catch(e){ S.papers = []; }
  if(!Array.isArray(S.papers)) S.papers = [];
}
function savePapers(){
  try{ localStorage.setItem(PAPER_KEY, JSON.stringify(S.papers)); }catch(e){}
}
function addPaper(p){
  if(S.papers.includes(p) || PAPERS.includes(p)){ S.bg = p; buildSwatches(); drawPreview(); return; }
  S.papers.unshift(p);
  S.papers = S.papers.slice(0, 24);
  savePapers();
  S.bg = p;
  buildSwatches(); drawPreview();
  toast("Paper added", "good");
}

function buildSwatches(){
  const items = [
    ...PAPERS.map(p => ({ p, mine: false })),
    ...S.papers.map(p => ({ p, mine: true }))
  ];
  $("#swatches").innerHTML = items.map(({ p, mine }) => `
    <span class="swwrap">
      <button class="sw ${S.bg === p ? "on" : ""}" data-c="${esc(p)}"
              style="background:${paperCss(p)}" aria-label="Paper ${esc(p)}"></button>
      ${mine ? `<i class="swdel" data-rm="${esc(p)}" title="Remove">✕</i>` : ""}
    </span>`).join("");

  $("#swatches").querySelectorAll("[data-c]").forEach(b => b.onclick = () => {
    S.bg = b.dataset.c; buildSwatches(); drawPreview();
  });
  $("#swatches").querySelectorAll("[data-rm]").forEach(b => b.onclick = e => {
    e.stopPropagation();
    S.papers = S.papers.filter(x => x !== b.dataset.rm);
    savePapers();
    if(S.bg === b.dataset.rm) S.bg = "#FFFFFF";
    buildSwatches(); drawPreview();
  });
}

function wirePaperTools(){
  const a = $("#paperA"), b = $("#paperB"), ang = $("#paperAngle");
  if(!a) return;
  $("#paperAddSolid").onclick = () => addPaper(a.value.toUpperCase());
  $("#paperAddBlend").onclick = () => addPaper(`grad:${a.value.toUpperCase()},${b.value.toUpperCase()},${ang.value || 160}`);
  const live = () => {
    $("#paperPrev").style.background =
      `linear-gradient(${ang.value || 160}deg, ${a.value}, ${b.value})`;
  };
  [a, b, ang].forEach(el => el.addEventListener("input", live));
  live();
}

function buildEmoji(){
  $("#tabs").innerHTML = Object.keys(EMOJI).map(k =>
    `<button class="${k === S.cat ? "on" : ""}" data-t="${k}">${k}</button>`).join("");
  $("#tabs").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { S.cat = b.dataset.t; buildEmoji(); });
  $("#emoji").innerHTML = EMOJI[S.cat].split(" ").filter(Boolean).map(e =>
    `<button data-e="${e}">${e}</button>`).join("");
  $("#emoji").querySelectorAll("[data-e]").forEach(b => b.onclick = () => addSticker(b.dataset.e));
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

/* ─── camera ──────────────────────────────────────────────────
   ONE stream for the whole app. The old build opened a second
   getUserMedia for the Duo preview; on plenty of phones the
   camera only hands out one stream at a time, so the second one
   came back black. Everything now shares this.
   ───────────────────────────────────────────────────────────── */
let stream = null;
let camReq = null;

async function ensureStream(force = false){
  const live = stream && stream.getVideoTracks().some(t => t.readyState === "live");
  if(live && !force) return stream;
  if(camReq && !force) return camReq;

  camReq = (async () => {
    const previous = stream;
    try{
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: S.facing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
      if(previous) previous.getTracks().forEach(t => t.stop());
      stream = s;
      attachLocal();
      applyCamFilter(); applyMirror();
      if(S.duo.active) replaceOutgoingTrack();
      return s;
    }catch(err){
      console.error("[camera]", err);
      camError(err);
      throw err;
    }
  })();

  try{ return await camReq; }
  finally{ camReq = null; }
}

function camError(err){
  const msg = err && err.name === "NotAllowedError"
    ? "Camera access was blocked. Allow it in your browser's site settings, then try again."
    : (err && err.name === "NotReadableError"
        ? "Another app or tab is using the camera. Close it and try again."
        : "No camera found on this device.");
  const m = $("#camMsg");
  if(m){ m.style.display = "grid"; m.textContent = msg; }
  const d = $("#duoCamMsg");
  if(d){ d.hidden = false; d.textContent = msg; }
}

function attachLocal(){
  ["#cam", "#duoModalCam", "#duoSelfCam"].forEach(sel => {
    const v = $(sel);
    if(!v) return;
    if(v.srcObject !== stream) v.srcObject = stream;
    if(stream) v.play().catch(() => {});
  });
  if(stream){
    const m = $("#camMsg"); if(m) m.style.display = "none";
    const d = $("#duoCamMsg"); if(d) d.hidden = true;
    $("#duoModalCam").style.visibility = "visible";
  }
}

/* Swap the track inside a live call instead of renegotiating. */
function replaceOutgoingTrack(){
  const pc = S.duo.call && S.duo.call.peerConnection;
  const track = stream && stream.getVideoTracks()[0];
  if(!pc || !track) return;
  pc.getSenders().forEach(sender => {
    if(sender.track && sender.track.kind === "video") sender.replaceTrack(track).catch(() => {});
  });
}

function applyCamFilter(){
  const css = LOOKS[S.look].css;
  ["#cam", "#duoModalCam", "#duoSelfCam"].forEach(sel => { const v = $(sel); if(v) v.style.filter = css; });
}

function prepShots(){
  const n = shotsOf(F());
  if(S.shots.length !== n) S.shots = new Array(n).fill(null);
  renderShots();
  $("#shotLine").textContent = S.duo.active
    ? `${n} shot${n > 1 ? "s" : ""} — each one a single photo with you both in it.`
    : `${n} shot${n > 1 ? "s" : ""}, one after another. Tap any photo to retake it.`;
}

async function startCam(){
  try{
    await ensureStream();
    attachLocal();
    applyCamFilter(); applyMirror();
    if(S.duo.active) beginMedia();
    return true;
  }catch(err){
    toast("Camera did not start", "bad");
    return false;
  }
}

/* Leaving step 3 no longer kills a Duo call. The stream is only
   released when nothing on screen still needs it. */
function stopCam(){
  if(S.duo.active) return;
  if($("#duoModal") && $("#duoModal").classList.contains("on")) return;
  releaseCam();
}
function releaseCam(){
  if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  ["#cam", "#duoModalCam", "#duoSelfCam"].forEach(sel => { const v = $(sel); if(v) v.srcObject = null; });
  const m = $("#camMsg"); if(m) m.style.display = "grid";
}

function applyMirror(){
  const on = S.mirror && S.facing === "user";
  ["#cam", "#duoModalCam", "#duoSelfCam"].forEach(sel => { const v = $(sel); if(v) v.classList.toggle("mir", on); });
  $("#mirBtn").classList.toggle("on", S.mirror);
  $("#mirTog").classList.toggle("on", S.mirror);
  $("#mirTog").setAttribute("aria-checked", S.mirror);
}
$("#mirBtn").onclick = () => { S.mirror = !S.mirror; applyMirror(); };
$("#mirTog").onclick = () => { S.mirror = !S.mirror; applyMirror(); };
$("#flipBtn").onclick = async () => {
  S.facing = S.facing === "user" ? "environment" : "user";
  if(stream || S.duo.active){ try{ await ensureStream(true); }catch(e){} }
  applyMirror();
};

/* ─── capture ─────────────────────────────────────────────── */
function setShoot(mode){
  const b = $("#shoot");
  b.dataset.mode = mode;
  const guestWaits = S.duo.active && S.duo.role === "guest" && (mode === "shoot" || mode === "redo");
  b.textContent = guestWaits
    ? "Waiting for host…"
    : { start:"Start camera", shoot:"Take the photos", busy:"Hold still…", redo:"Shoot again" }[mode];
  b.disabled = mode === "busy" || guestWaits;
}
$("#shoot").onclick = async () => {
  const m = $("#shoot").dataset.mode;
  if(m === "start"){ if(await startCam()) setShoot("shoot"); return; }
  if(m === "busy") return;
  runSequence();
};

async function runSequence(remote = false){
  if(S.busy) return;
  if(S.duo.active){
    if(!remote && S.duo.role !== "host") return;
    if(!stream && !(await startCam())) return;
    if(!remote) sendDuo({ type: "shoot", timer: S.timer });
  }else if(!stream && !(await startCam())) return;

  S.busy = true; setShoot("busy");
  const n = shotsOf(F());
  S.shots = new Array(n).fill(null); renderShots();

  if(S.duo.active){
    for(let i = 0; i < n; i++){
      await countdown(S.timer);
      flash(); shutter();
      const [left, right] = duoPair(grab(), grabFrom($("#camRemote"), false));
      S.shots[i] = combineDuo(left, right);
      renderShots();
      await wait(520);
    }
  }else{
    for(let i = 0; i < n; i++){
      await countdown(S.timer);
      flash(); shutter();
      S.shots[i] = grab();
      renderShots();
      await wait(520);
    }
  }
  S.busy = false; setShoot("redo");
  $("#toStep4").disabled = false;
  beep(760, .1); setTimeout(() => beep(1020, .14), 110);
  toast("Strip ready", "good");
}
function duoPair(local, remote){
  return S.duo.role === "guest" ? [remote, local] : [local, remote];
}

async function retakeOne(i){
  if(S.busy) return;
  if(S.duo.active){ toast("Use Shoot again to redo a Duo strip", ""); return; }
  if(!stream && !(await startCam())) return;
  setShoot("busy"); S.busy = true;
  await countdown(S.timer);
  flash(); shutter();
  S.shots[i] = grab();
  renderShots();
  S.busy = false;
  setShoot(S.shots.every(Boolean) ? "redo" : "shoot");
  if(S.shots.every(Boolean)) $("#toStep4").disabled = false;
}

async function countdown(secs){
  const el = $("#cdown");
  if(!secs){ await wait(180); return; }
  for(let i = secs; i > 0; i--){
    el.textContent = i; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    beep(i === 1 ? 980 : 680, .07, .16);
    await wait(1000);
  }
  el.classList.remove("on"); el.textContent = "";
}
function flash(){ const f = $("#flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }

function grab(){
  return grabFrom($("#cam"), S.mirror && S.facing === "user");
}
function grabFrom(v, mirror){
  const c = document.createElement("canvas");
  c.width = v.videoWidth || 1280; c.height = v.videoHeight || 960;
  const x = c.getContext("2d");
  if(mirror){ x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(v, 0, 0, c.width, c.height);
  return c;
}

// Merges two camera captures into a single side-by-side photo — the host
// always on the left half, the guest always on the right half — so one
// Duo Booth shot produces exactly one combined picture, not two.
function combineDuo(left, right){
  const c = document.createElement("canvas");
  c.width = left.width; c.height = left.height;
  const x = c.getContext("2d");
  const halfW = c.width / 2;
  drawCover(x, left, 0, 0, halfW, c.height);
  drawCover(x, right, halfW, 0, halfW, c.height);
  x.fillStyle = "rgba(255,255,255,.85)";
  x.fillRect(halfW - 1.5, 0, 3, c.height);
  return c;
}
function drawCover(ctx, src, dx, dy, dw, dh){
  const sr = src.width / src.height, dr = dw / dh;
  let sw, sh, sx, sy;
  if(sr > dr){ sh = src.height; sw = sh * dr; sx = (src.width - sw) / 2; sy = 0; }
  else       { sw = src.width;  sh = sw / dr; sx = 0; sy = (src.height - sh) / 2; }
  ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
}

function renderShots(){
  const n = shotsOf(F());
  $("#shots").innerHTML = Array.from({ length: n }, (_, i) => {
    const s = S.shots[i];
    return `<button class="shot" data-i="${i}">${
      s ? `<img src="${s.toDataURL("image/jpeg", .55)}" alt="Photo ${i+1}" style="filter:${LOOKS[S.look].css}"><span class="re">Retake</span>`
        : (i + 1)
    }</button>`;
  }).join("");
  $("#shots").querySelectorAll("[data-i]").forEach(b => b.onclick = () => retakeOne(+b.dataset.i));
}

/* ─── strip drawing ───────────────────────────────────────── */
const overlayCache = {};
function overlayFor(f){
  if(!f.overlay) return null;
  if(overlayCache[f.overlay]) return overlayCache[f.overlay];
  const img = new Image();
  img.onload = () => { drawPreview(); };
  img.src = f.overlay;
  overlayCache[f.overlay] = img;
  return img;
}
function stripSize(f){
  return {
    w: f.pad * 2 + f.cols * f.cw + f.gap * (f.cols - 1),
    h: f.pad * 2 + f.rows * f.ch + f.gap * (f.rows - 1) + f.foot
  };
}
function roundRect(x, a, b, w, h, r){
  x.beginPath();
  if(x.roundRect) x.roundRect(a, b, w, h, r);
  else{ x.moveTo(a+r,b); x.arcTo(a+w,b,a+w,b+h,r); x.arcTo(a+w,b+h,a,b+h,r); x.arcTo(a,b+h,a,b,r); x.arcTo(a,b,a+w,b,r); x.closePath(); }
}

function drawStrip(canvas, { withStickers = false, frame = null, shots = null } = {}){
  const f = frame || F();
  const src = shots || S.shots;
  const { w, h } = stripSize(f);
  canvas.width = w; canvas.height = h;
  const x = canvas.getContext("2d");
  paintPaper(x, w, h);

  let i = 0;
  for(let r = 0; r < f.rows; r++) for(let c = 0; c < f.cols; c++, i++){
    const px = f.pad + c * (f.cw + f.gap), py = f.pad + r * (f.ch + f.gap);
    x.save(); roundRect(x, px, py, f.cw, f.ch, f.rad ?? 10); x.clip();
    const s = src[i];
    if(s){
      const sr = s.width / s.height, dr = f.cw / f.ch;
      let sw, sh, sx, sy;
      if(sr > dr){ sh = s.height; sw = sh * dr; sx = (s.width - sw) / 2; sy = 0; }
      else       { sw = s.width;  sh = sw / dr; sx = 0; sy = (s.height - sh) / 2; }
      x.filter = LOOKS[S.look].css;
      x.drawImage(s, sx, sy, sw, sh, px, py, f.cw, f.ch);
      x.filter = "none";
    }else{
      x.fillStyle = paperIsDark() ? "rgba(255,255,255,.07)" : "rgba(20,16,19,.07)";
      x.fillRect(px, py, f.cw, f.ch);
    }
    x.restore();
  }

  if(f.foot > 0){
    const ink = paperIsDark() ? "#FFF4E4" : "#231A2B";
    const cap = (S.caption || "").trim();
    const baseY = h - f.foot / 2 + f.pad / 3;
    x.textAlign = "center"; x.fillStyle = ink;
    let lastY = baseY;
    if(cap){
      x.font = `700 ${Math.round(f.foot * .34)}px 'Plus Jakarta Sans', sans-serif`;
      x.fillText(cap, w / 2, baseY, w - f.pad * 2);
    }
    if(S.date){
      const d = new Date(), p = n => String(n).padStart(2, "0");
      const dateY = cap ? baseY + f.foot * .3 : baseY;
      x.globalAlpha = .55;
      x.font = `500 ${Math.round(f.foot * .2)}px Inter, sans-serif`;
      x.fillText(`${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`, w / 2, dateY);
      x.globalAlpha = 1;
      lastY = dateY;
    }
    x.textAlign = "center";
    x.globalAlpha = .6;
    x.font = `800 ${Math.round(f.foot * .19)}px 'Plus Jakarta Sans', sans-serif`;
    const brandY = Math.min(lastY + f.foot * .28, h - f.pad * .35);
    x.fillText(CONFIG.name, w / 2, brandY, w - f.pad * 2);
    x.globalAlpha = 1;
  }

  const ov = overlayFor(f);
  if(ov && ov.complete && ov.naturalWidth) x.drawImage(ov, 0, 0, w, h);

  if(withStickers){
    S.stickers.forEach(s => {
      x.save();
      x.translate(s.x * w, s.y * h); x.rotate(s.rot * Math.PI / 180);
      x.font = `${s.size * w}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(s.emoji, 0, 0);
      x.restore();
    });
  }
  return canvas;
}

function drawPreview(){
  const f = F(), { w, h } = stripSize(f);
  drawStrip($("#preview"));
  const stage = $("#stage");
  const maxH = Math.max(320, window.innerHeight * .62);
  stage.style.width = Math.round(Math.min(w, maxH * (w / h))) + "px";
  stage.style.maxWidth = "100%";
  layoutStickers();
}
window.addEventListener("resize", () => { if(S.step === 4) drawPreview(); });

/* ─── stickers ────────────────────────────────────────────── */
function addSticker(emoji){
  const s = { id: Date.now() + Math.random(), emoji, x: .5, y: .4, size: .12, rot: 0 };
  S.stickers.push(s); S.sel = s.id;
  layoutStickers(); renderStkBar();
}
function layoutStickers(){
  const stage = $("#stage");
  stage.querySelectorAll(".stk").forEach(e => e.remove());
  const rect = $("#preview").getBoundingClientRect();
  S.stickers.forEach(s => {
    const el = document.createElement("div");
    el.className = "stk" + (S.sel === s.id ? " sel" : "");
    el.textContent = s.emoji;
    el.style.fontSize = (s.size * rect.width) + "px";
    place(el, s, rect);
    el.addEventListener("pointerdown", ev => dragStart(ev, s, el));
    stage.appendChild(el);
  });
}
function place(el, s, rect){
  const r = rect || $("#preview").getBoundingClientRect();
  el.style.left = (s.x * r.width) + "px";
  el.style.top = (s.y * r.height) + "px";
  el.style.transform = `translate(-50%,-50%) rotate(${s.rot}deg)`;
}
let drag = null;
function dragStart(ev, s, el){
  ev.preventDefault();
  S.sel = s.id; renderStkBar();
  $$(".stk").forEach(e => e.classList.remove("sel")); el.classList.add("sel");
  const r = $("#preview").getBoundingClientRect();
  drag = { s, el, r };
  el.setPointerCapture(ev.pointerId);
  el.style.cursor = "grabbing";
}
document.addEventListener("pointermove", ev => {
  if(!drag) return;
  const { s, el, r } = drag;
  s.x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  s.y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
  place(el, s, r);
});
document.addEventListener("pointerup", () => { if(drag){ drag.el.style.cursor = "grab"; drag = null; } });

function renderStkBar(){
  const s = S.stickers.find(k => k.id === S.sel);
  const bar = $("#stkBar");
  if(!s){ bar.innerHTML = `<span class="hint" style="margin:0">Tap a sticker to add it, then drag it onto the strip.</span>`; return; }
  bar.innerHTML = `
    <button class="chip" data-a="small">– size</button>
    <button class="chip" data-a="big">+ size</button>
    <button class="chip" data-a="left">↺</button>
    <button class="chip" data-a="right">↻</button>
    <button class="chip" data-a="del">Remove</button>`;
  bar.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if(a === "small") s.size = Math.max(.04, s.size - .02);
    if(a === "big")   s.size = Math.min(.5, s.size + .02);
    if(a === "left")  s.rot -= 15;
    if(a === "right") s.rot += 15;
    if(a === "del"){ S.stickers = S.stickers.filter(k => k.id !== s.id); S.sel = null; }
    layoutStickers(); renderStkBar();
  });
}

/* ─── caption / toggles ───────────────────────────────────── */
$("#caption").addEventListener("input", e => { S.caption = e.target.value; drawPreview(); });
$("#dateTog").onclick = e => {
  S.date = !S.date;
  e.currentTarget.classList.toggle("on", S.date);
  e.currentTarget.setAttribute("aria-checked", S.date);
  drawPreview();
};

/* ══════════════════════════════════════════════════════════
   DUO BOOTH
   ──────────────────────────────────────────────────────────
   One shared camera stream, TURN-backed WebRTC, a watchdog that
   re-dials when video never arrives, code / link / QR joining,
   and a text chat that rides the same data channel.
   ══════════════════════════════════════════════════════════ */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to read aloud
function genCode(){
  /* crypto RNG, not Math.random (predictable). 32 symbols divides 256
     evenly, so taking each byte mod 32 introduces no bias. */
  const bytes = new Uint8Array(CONFIG.codeLength);
  crypto.getRandomValues(bytes);
  let s = "";
  for(const b of bytes) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

/* The link IS the code — no second token to keep in sync. */
function boothLink(code){
  return location.origin + location.pathname + "?duo=" + encodeURIComponent(code);
}
/* Accepts a bare code, a pasted link, or a link with junk around it. */
function codeFromText(text){
  const t = String(text || "").trim();
  if(!t) return "";
  const m = t.match(/[?&]duo=([A-Za-z0-9]{4,16})/i);
  const raw = m ? m[1] : t;
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CONFIG.codeLength);
}

/* ─── status line (modal + step 3) ────────────────────────── */
function duoNet(text, kind = ""){
  [$("#duoNet"), $("#netPill")].forEach(el => {
    if(!el) return;
    el.textContent = text;
    el.className = (el.id === "netPill" ? "netpill " : "hint net ") + kind;
    el.hidden = !text;
  });
}

/* ─── modal ───────────────────────────────────────────────── */
function openDuoModal(prefill){
  if(typeof Peer === "undefined"){
    toast("Duo Booth couldn't load — check your connection and reload", "bad");
    return;
  }
  teardownDuo();
  $("#duoCodeIn").value = prefill || "";
  $("#duoHostStatus").textContent = "";
  $("#duoJoinStatus").textContent = "";
  duoNet("");
  showDuoView(prefill ? "join" : "choice");
  $("#duoModal").classList.add("on");
  ensureStream().catch(() => {
    $("#duoCamMsg").hidden = false;
    $("#duoModalCam").style.visibility = "hidden";
  });
}
function closeDuoModal(){ $("#duoModal").classList.remove("on"); }

function showDuoView(view){
  S.duoView = view;
  $("#duoChoice").hidden        = view !== "choice";
  $("#duoHostView").hidden      = view !== "host";
  $("#duoJoinView").hidden      = view !== "join";
  $("#duoConnectedView").hidden = view !== "connected";
  $("#duoBackBtn").hidden       = view === "choice" || view === "connected";
  $("#duoCancelBtn").hidden     = view === "connected";
  $("#duoPreviewWrap").hidden   = view === "connected";
  $("#duoSub").textContent = {
    choice:    "Connect your camera with someone else's, live.",
    host:      "Share the code, the link, or the QR — whichever is easiest.",
    join:      "Paste the code or the link your partner sent you.",
    connected: "You're both in. Both cameras are already open."
  }[view] || "";
}

$("#duoClose").onclick     = () => { teardownDuo(); closeDuoModal(); };
$("#duoCancelBtn").onclick = () => { teardownDuo(); closeDuoModal(); };
$("#duoModal").addEventListener("click", e => { if(e.target.id === "duoModal" && !S.duo.active){ teardownDuo(); closeDuoModal(); } });
$("#duoBackBtn").onclick   = () => { teardownDuo(); showDuoView("choice"); };

$("#duoHostBtn").onclick   = () => duoHost();
$("#duoNewCodeBtn").onclick = () => duoHost();
$("#duoJoinBtn").onclick   = () => { showDuoView("join"); $("#duoCodeIn").focus(); };
$("#duoConnectBtn").onclick = () => duoJoin($("#duoCodeIn").value);
$("#duoCodeIn").addEventListener("keydown", e => { if(e.key === "Enter") $("#duoConnectBtn").click(); });

$("#duoCopyBtn").onclick = () => copyText(S.duo.code || "", "Code copied");
$("#duoLinkCopyBtn").onclick = () => copyText(S.duo.code ? boothLink(S.duo.code) : "", "Link copied");
$("#duoShareBtn").onclick = async () => {
  const link = S.duo.code ? boothLink(S.duo.code) : "";
  if(!link) return;
  if(navigator.share){
    try{ await navigator.share({ title: CONFIG.name, text: "Join my photo booth", url: link }); return; }
    catch(e){ if(e && e.name === "AbortError") return; }
  }
  copyText(link, "Link copied");
};
async function copyText(text, okMsg){
  if(!text) return;
  try{ await navigator.clipboard.writeText(text); toast(okMsg, "good"); }
  catch(e){ toast("Couldn't copy — select it and copy manually", "bad"); }
}

$("#duoContinueBtn").onclick = () => {
  closeDuoModal();
  markCardSelected("duo");
  S.shots = []; S.stickers = []; S.sel = null;
  buildLayouts($("#layouts"), false, layoutFilter());
  go(2);
};

/* ─── QR ──────────────────────────────────────────────────── */
function renderQR(code){
  const box = $("#duoQr");
  if(!box) return;
  box.innerHTML = "";
  if(typeof QRCode === "undefined"){ $("#duoQrWrap").hidden = true; return; }
  try{
    new QRCode(box, {
      text: boothLink(code),
      width: 168, height: 168,
      colorDark: "#141013", colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
    $("#duoQrWrap").hidden = false;
  }catch(e){ $("#duoQrWrap").hidden = true; }
}

/* ─── hosting ─────────────────────────────────────────────── */
function makePeer(id, servers){
  const opts = { config: ICE.rtcConfig(servers, false), debug: 0 };
  if(CONFIG.peerServer) Object.assign(opts, CONFIG.peerServer);
  return id ? new Peer(id, opts) : new Peer(opts);
}

/* Early warning: if we can't even reach a relay, say so now rather
   than after a black screen. */
function checkPath(servers, seq){
  ICE.probe(servers).then(r => {
    console.log("[duo] network probe:", r);
    if(seq !== duoSeq || S.duo.active) return;
    if(!r.relay && !r.srflx){
      duoNet("Your network is blocking live video. Try mobile data or a different Wi-Fi.", "bad");
    }else if(!r.relay){
      console.warn("[duo] no relay candidate — hard-NAT partners may not connect");
    }
  });
}

async function duoHost(){
  teardownDuo();
  const seq = ++duoSeq;
  showDuoView("host");
  ensureStream().catch(() => {});

  const code = genCode();
  S.duo.role = "host";
  S.duo.code = code;
  S.duo.expiry = Date.now() + CONFIG.linkMinutes * 60 * 1000;

  $("#duoCodeOut").textContent = code;
  $("#duoLinkOut").value = boothLink(code);
  $("#duoHostStatus").textContent = "Opening the room…";
  renderQR(code);
  startExpiryClock();

  const servers = await ICE.get();
  if(seq !== duoSeq) return;                 // user tapped New code / Back meanwhile
  checkPath(servers, seq);

  const peer = makePeer(CONFIG.duoPeerPrefix + code.toLowerCase(), servers);
  S.duo.peer = peer;
  wirePeer(peer);

  S.duo.openT = setTimeout(() => {
    if(S.duo.peer === peer && !S.duo.peerOpen)
      $("#duoHostStatus").textContent = "Still opening the room — if this sticks, tap New code.";
  }, CONFIG.connectionTimeout);

  peer.on("open", () => {
    S.duo.peerOpen = true;
    clearTimeout(S.duo.openT);
    $("#duoHostStatus").textContent = "Waiting for your partner to join…";
  });
}

function startExpiryClock(){
  clearInterval(S.duo.expiryT);
  const tick = () => {
    if(!S.duo.expiry) return;
    if(S.duo.active){ $("#duoExpiry").textContent = ""; clearInterval(S.duo.expiryT); return; }
    const left = Math.max(0, Math.round((S.duo.expiry - Date.now()) / 1000));
    const m = Math.floor(left / 60), s = String(left % 60).padStart(2, "0");
    $("#duoExpiry").textContent = left > 0
      ? `This code works for another ${m}:${s}`
      : "This code has expired — tap New code.";
    if(left <= 0){
      clearInterval(S.duo.expiryT);
      /* enforce it: close the room so the old code/link stops working */
      if(!S.duo.active){ try{ S.duo.peer && S.duo.peer.destroy(); }catch(e){} S.duo.peer = null; }
      $("#duoHostStatus").textContent = "Expired. Tap New code for a fresh one.";
    }
  };
  tick();
  S.duo.expiryT = setInterval(tick, 1000);
}

/* ─── joining ─────────────────────────────────────────────── */
async function duoJoin(raw){
  const code = codeFromText(raw);
  if(code.length !== CONFIG.codeLength){
    $("#duoJoinStatus").textContent = `That code should be ${CONFIG.codeLength} characters — paste the code or the whole link.`;
    return;
  }
  teardownDuo();
  const seq = ++duoSeq;
  showDuoView("join");
  $("#duoCodeIn").value = code;
  $("#duoJoinStatus").textContent = "Connecting…";
  ensureStream().catch(() => {});

  S.duo.role = "guest";
  S.duo.code = code;
  S.duo.hostId = CONFIG.duoPeerPrefix + code.toLowerCase();

  const servers = await ICE.get();
  if(seq !== duoSeq) return;
  checkPath(servers, seq);

  const peer = makePeer(null, servers);
  S.duo.peer = peer;
  wirePeer(peer);

  S.duo.openT = setTimeout(() => {
    if(S.duo.peer === peer && !S.duo.active)
      $("#duoJoinStatus").textContent = "No answer yet — check the code, and make sure your partner still has their booth open.";
  }, CONFIG.connectionTimeout);

  peer.on("open", () => {
    S.duo.peerOpen = true;
    const conn = peer.connect(S.duo.hostId, { reliable: true });
    S.duo.conn = conn;
    wireDuoData(conn);
  });
}

/* ─── peer plumbing (both roles) ──────────────────────────── */
function wirePeer(peer){
  peer.on("connection", conn => {
    /* one guest per room, decided at the first knock — checking .open
       let two people slip in during the same half-second */
    const expired = S.duo.role === "host" && S.duo.expiry && Date.now() > S.duo.expiry && !S.duo.active;
    if(S.duo.conn || expired){ try{ conn.close(); }catch(e){} return; }
    S.duo.conn = conn;
    wireDuoData(conn);
  });

  /* Both sides listen for calls, so whoever is ready first can dial. */
  peer.on("call", call => {
    if(stream){ answerCall(call); return; }
    S.duo.pendingCall = call;
    ensureStream().then(() => {
      if(S.duo.pendingCall === call){ answerCall(call); S.duo.pendingCall = null; }
    }).catch(() => {});
  });

  peer.on("disconnected", () => {
    duoNet("Signalling dropped — reconnecting…", "bad");
    try{ peer.reconnect(); }catch(e){}
  });

  peer.on("error", err => {
    console.error("[duo]", err && err.type, err);
    clearTimeout(S.duo.openT);
    const t = err && err.type;
    let msg = "Connection problem — close this and try again.";
    if(t === "peer-unavailable") msg = "Nobody is hosting with that code right now. Check it, or ask for a new one.";
    if(t === "unavailable-id")   msg = "That code is already taken — tap New code.";
    if(t === "network")          msg = "Lost the signalling server — check your internet and try again.";
    if(t === "browser-incompatible") msg = "This browser can't do live video. Try Chrome or Safari.";
    if(S.duo.role === "host") $("#duoHostStatus").textContent = msg;
    else $("#duoJoinStatus").textContent = msg;
    if(S.duo.active) duoNet(msg, "bad");
  });
}

function wireDuoData(conn){
  conn.on("open", async () => {
    clearTimeout(S.duo.openT);
    S.duo.active = true;
    S.duo.attempts = 0;
    clearInterval(S.duo.expiryT);
    showDuoView("connected");
    $("#duoJoinStatus").textContent = "";
    duoNet("Connected — opening cameras…");
    renderChat();
    applyDuoStep3UI();

    if(S.duo.role === "host") sendDuo({ type: "config", frame: S.frame, look: S.look, timer: S.timer });

    keepAwake();
    try{ await ensureStream(); }catch(e){}
    beginMedia();
    startMediaWatchdog();
  });

  conn.on("data", handleDuoData);
  conn.on("close", () => {
    if(S.duo.active) toast("Your partner disconnected", "bad");
    const wasActive = S.duo.active;
    teardownDuo();
    applyDuoStep2UI(); applyDuoStep3UI();
    if(wasActive && $("#duoModal").classList.contains("on")) showDuoView("choice");
  });
  conn.on("error", e => console.error("[duo conn]", e));
}

function sendDuo(msg){
  try{ if(S.duo.conn && S.duo.conn.open) S.duo.conn.send(msg); }catch(e){}
}

const ALLOWED_MSG = new Set(["config", "shoot", "ready", "recall", "step", "chat", "bye"]);

function handleDuoData(msg){
  /* The other end is a stranger's browser. Treat every field as hostile:
     known types only, values checked against what we actually offer. */
  if(!msg || typeof msg !== "object" || typeof msg.type !== "string" || !ALLOWED_MSG.has(msg.type)) return;

  if(msg.type === "config"){
    if(S.duo.role !== "guest") return;                       // only the host sets the look
    const has = (o, k) => typeof k === "string" && k.length < 60 && Object.prototype.hasOwnProperty.call(o, k);
    if(!has(LOOKS, msg.look)) return;
    if(![0, 3, 5, 10].includes(msg.timer)) return;
    if(typeof msg.frame !== "string") return;
    /* the host may use a custom strip we don't have — fall back like before */
    S.frame = has(FRAMES(), msg.frame) ? msg.frame : "strip4";
    S.look = msg.look; S.timer = msg.timer;
    buildChips($("#looks2"), LOOKS, "look"); buildChips($("#looks3"), LOOKS, "look");
    buildTimers(); prepShots();
    buildLayouts($("#layouts"), false, layoutFilter());
  }
  if(msg.type === "shoot") runSequence(true);
  if(msg.type === "ready" && S.duo.role === "guest") placeCall();
  if(msg.type === "recall" && S.duo.role === "guest") placeCall();
  if(msg.type === "step" && S.duo.role === "guest"){
    if(!Number.isInteger(msg.n) || msg.n < 1 || msg.n > 4) return;
    if($("#duoModal").classList.contains("on")){ closeDuoModal(); markCardSelected("duo"); }
    goSilent(msg.n);
  }
  if(msg.type === "chat"){
    if(typeof msg.text !== "string") return;
    const now = Date.now();
    S.duo.chatTimes = S.duo.chatTimes.filter(t => now - t < CONFIG.chatBurstMs);
    if(S.duo.chatTimes.length >= CONFIG.chatBurst) return;   // flood guard
    S.duo.chatTimes.push(now);
    pushChat("them", msg.text);
  }
  if(msg.type === "bye"){ toast("Your partner left", "bad"); teardownDuo(); applyDuoStep3UI(); }
}

/* ─── media: get video flowing, and keep it flowing ───────── */
function beginMedia(){
  if(!S.duo.peer || !stream) return;
  attachLocal();
  if(S.duo.role === "guest"){
    placeCall();
  }else{
    if(S.duo.pendingCall){ answerCall(S.duo.pendingCall); S.duo.pendingCall = null; }
    sendDuo({ type: "ready" });          // tell the guest we can answer now
  }
}

function placeCall(){
  if(!S.duo.peer || !stream) return;
  if(S.duo.role !== "guest" || !S.duo.hostId) return;
  /* both "ready" and beginMedia() can fire within a few ms of each
     other — don't tear a perfectly good call down to redial it */
  const now = Date.now();
  if(now - S.duo.lastCall < 1500) return;
  S.duo.lastCall = now;
  try{ S.duo.call && S.duo.call.close(); }catch(e){}
  S.duo.call = null;
  S.duo.attempts++;
  /* Direct path failed twice? Stop trying to be clever and go through
     the relay only. Slower, but it is the option that always works. */
  if(S.duo.attempts > CONFIG.relayAfterAttempts && !S.duo.relay){
    S.duo.relay = ICE.setRelayOnly(S.duo.peer, true);
    if(S.duo.relay) console.log("[duo] switching to relay-only");
  }
  duoNet(S.duo.relay ? `Connecting video through the relay… (try ${S.duo.attempts})`
       : S.duo.attempts > 1 ? `Connecting video… (try ${S.duo.attempts})` : "Connecting video…");
  try{ wireCall(S.duo.peer.call(S.duo.hostId, stream)); }
  catch(e){ console.error("[duo call]", e); }
}

function answerCall(call){
  if(!stream) return;
  try{ call.answer(stream); wireCall(call); }
  catch(e){ console.error("[duo answer]", e); }
}

function wireCall(call){
  S.duo.call = call;

  call.on("stream", remote => {
    S.duo.remoteStream = remote;
    S.duo.attempts = 0;
    attachRemote(remote);
    duoNet("Video connected", "good");
  });
  call.on("close", () => { if(S.duo.call === call) teardownRemoteVideo(); });
  call.on("error", e => { console.error("[duo media]", e); if(S.duo.call === call) teardownRemoteVideo(); });

  const pc = call.peerConnection;
  if(!pc) return;
  pc.addEventListener("iceconnectionstatechange", () => {
    if(S.duo.call !== call) return;
    const st = pc.iceConnectionState;
    if(st === "checking")  duoNet("Finding a path between you…");
    if(st === "connected" || st === "completed"){
      clearTimeout(S.duo.discT);
      duoNet("Video connected", "good");
      reportPath(pc).then(type => {
        const relayed = type === "relay" || S.duo.relay;
        ICE.capBitrate(pc, relayed ? CONFIG.bitrateRelayKbps : CONFIG.bitrateDirectKbps);
      });
    }
    if(st === "disconnected"){
      duoNet("Video dropped — trying to recover…", "bad");
      /* brief blips heal on their own; a real drop gets re-dialled */
      clearTimeout(S.duo.discT);
      S.duo.discT = setTimeout(() => {
        if(S.duo.call === call && pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") retryMedia();
      }, 4000);
    }
    if(st === "failed"){
      duoNet("Direct path failed — retrying through the relay…", "bad");
      retryMedia();
    }
  });
}

/* Tells you in the console whether you ended up on a relay — handy
   when someone reports a black screen from far away. */
async function reportPath(pc){
  try{
    const stats = await pc.getStats();
    let pair = null, local = null;
    stats.forEach(r => { if(r.type === "candidate-pair" && r.state === "succeeded" && r.nominated !== false) pair = r; });
    if(pair) stats.forEach(r => { if(r.id === pair.localCandidateId) local = r; });
    if(local){ console.log("[duo] video path:", local.candidateType, local.protocol || ""); return local.candidateType; }
  }catch(e){}
  return null;
}

function attachRemote(remote){
  [$("#camRemote"), $("#duoRemoteCam")].forEach(v => {
    if(!v) return;
    if(v.srcObject !== remote) v.srcObject = remote;
    v.play().catch(() => {});
  });
  $("#stageRemote").hidden = false;
  $("#remoteMsg").style.display = "none";
  $("#duoRemoteMsg").hidden = true;
}

function teardownRemoteVideo(){
  S.duo.remoteStream = null;
  [$("#camRemote"), $("#duoRemoteCam")].forEach(v => { if(v) v.srcObject = null; });
  const rm = $("#remoteMsg"); if(rm) rm.style.display = "grid";
  const dm = $("#duoRemoteMsg"); if(dm) dm.hidden = false;
}

/* Re-dials until video actually arrives. This is what turns a
   permanent black screen into a few seconds of "Connecting…". */
function startMediaWatchdog(){
  clearInterval(S.duo.watchT);
  S.duo.watchT = setInterval(() => {
    if(!S.duo.active){ clearInterval(S.duo.watchT); return; }
    if(videoLive()) return;
    if(!stream){ ensureStream().catch(() => {}); return; }
    if(S.duo.attempts >= CONFIG.maxVideoRetries){
      duoNet("Still no video. Tap Retry video, or try mobile data instead of Wi-Fi.", "bad");
      return;
    }
    retryMedia();
  }, CONFIG.videoRetryEvery);
}
function videoLive(){
  const r = S.duo.remoteStream;
  return !!(r && r.getVideoTracks().some(t => t.readyState === "live"));
}

/* Phones roam between Wi-Fi and mobile data, lock their screens and
   switch tabs. Any of those can silently kill a call — so when the
   device comes back, check and heal instead of waiting for the timer. */
function healIfNeeded(){
  if(!S.duo.peer) return;
  try{ if(S.duo.peer.disconnected) S.duo.peer.reconnect(); }catch(e){}
  if(S.duo.active && !videoLive()){
    S.duo.attempts = Math.min(S.duo.attempts, CONFIG.maxVideoRetries - 1);
    setTimeout(retryMedia, 1200);
  }
}
window.addEventListener("online", healIfNeeded);
window.addEventListener("offline", () => { if(S.duo.active) duoNet("You're offline — will reconnect when you're back.", "bad"); });
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState !== "visible") return;
  if(S.duo.active) keepAwake();
  healIfNeeded();
});

/* A sleeping screen is a black screen. Ask the OS to keep it on. */
async function keepAwake(){
  try{
    if(!("wakeLock" in navigator) || S.duo.wake) return;
    S.duo.wake = await navigator.wakeLock.request("screen");
    S.duo.wake.addEventListener("release", () => { S.duo.wake = null; });
  }catch(e){}
}
function letSleep(){
  try{ S.duo.wake && S.duo.wake.release(); }catch(e){}
  S.duo.wake = null;
}

function retryMedia(){
  if(!S.duo.active) return;
  if(S.duo.role === "guest") placeCall();
  else { sendDuo({ type: "recall" }); duoNet("Asking your partner's camera to reconnect…"); }
}
$$(".retryVideo").forEach(b => b.onclick = async () => {
  try{ await ensureStream(true); }catch(e){}
  S.duo.attempts = 0;
  retryMedia();
});

/* ─── chat over the data channel ──────────────────────────── */
function pushChat(who, text){
  const clean = String(text || "").slice(0, 400).trim();
  if(!clean) return;
  S.chat.push({ who, text: clean, at: Date.now() });
  if(S.chat.length > 200) S.chat = S.chat.slice(-200);
  if(who === "them"){
    beep(880, .05, .1);
    const visible = $("#duoModal").classList.contains("on") || S.step === 3;
    if(!visible || S.chatCollapsed) S.unread++;
  }
  renderChat();
}
function sendChat(inputSel){
  const el = $(inputSel);
  if(!el) return;
  const text = el.value.trim();
  if(!text) return;
  if(!S.duo.active){ toast("You're not connected to anyone yet", "bad"); return; }
  el.value = "";
  sendDuo({ type: "chat", text });
  pushChat("me", text);
}
function renderChat(){
  const html = S.chat.length
    ? S.chat.map(m => `<div class="msg ${m.who}"><span>${esc(m.text)}</span></div>`).join("")
    : `<p class="hint" style="margin:0">Say hi — messages stay between the two of you.</p>`;
  ["#duoChatLog", "#chatLog"].forEach(sel => {
    const el = $(sel);
    if(!el) return;
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  });
  const badge = $("#chatBadge");
  if(badge){ badge.textContent = S.unread || ""; badge.hidden = !S.unread; }
  const panel = $("#chatPanel");
  if(panel) panel.hidden = !S.duo.active;
}
$("#duoChatSend").onclick = () => sendChat("#duoChatIn");
$("#chatSend").onclick    = () => sendChat("#chatIn");
$("#duoChatIn").addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); sendChat("#duoChatIn"); } });
$("#chatIn").addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); sendChat("#chatIn"); } });
$$("[data-quick]").forEach(b => b.onclick = () => {
  if(!S.duo.active) return;
  sendDuo({ type: "chat", text: b.dataset.quick });
  pushChat("me", b.dataset.quick);
});
["#duoChatLog", "#chatLog"].forEach(sel => {
  const el = $(sel);
  if(el) el.addEventListener("click", () => { S.unread = 0; renderChat(); });
});

/* ─── teardown ────────────────────────────────────────────── */
function teardownDuo(){
  duoSeq++;                       // cancels any host/join still waiting on the network
  clearTimeout(S.duo.openT);
  clearTimeout(S.duo.discT);
  letSleep();
  clearInterval(S.duo.expiryT);
  clearInterval(S.duo.watchT);
  if(S.duo.active) sendDuo({ type: "bye" });
  try{ S.duo.call && S.duo.call.close(); }catch(e){}
  try{ S.duo.conn && S.duo.conn.close(); }catch(e){}
  try{ S.duo.peer && S.duo.peer.destroy(); }catch(e){}
  S.duo = emptyDuo();
  S.chat = []; S.unread = 0;
  teardownRemoteVideo();
  renderChat();
  duoNet("");
  $("#stageRemote").hidden = true;
  $("#camLabelYou").hidden = true;
  $("#duoExpiry").textContent = "";
}
window.addEventListener("beforeunload", () => { if(S.duo.active) sendDuo({ type: "bye" }); });

/* ─── save (device + Discord) ─────────────────────────────── */
async function postToDiscord(blob){
  try{
    const fd = new FormData();
    fd.append("file", blob, `${CONFIG.name}-${Date.now()}.png`);
    const res = await fetch(CONFIG.discordEndpoint, { method: "POST", body: fd });
    return res.ok;
  }catch(e){ return false; }
}

async function saveToDevice(blob){
  const file = new File([blob], `${CONFIG.name}-strip.png`, { type: "image/png" });
  if(navigator.canShare && navigator.canShare({ files: [file] })){
    try{
      await navigator.share({ files: [file], title: CONFIG.name });
      return true;
    }catch(err){
      if(err && err.name === "AbortError") return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${CONFIG.name}-strip.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

$("#saveBtn").onclick = async () => {
  const btn = $("#saveBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  const c = drawStrip(document.createElement("canvas"), { withStickers: true });
  const blob = await new Promise(r => c.toBlob(r, "image/png"));

  const saved = await saveToDevice(blob);
  if(saved){
    pushGallery(c);
    beep(880, .1); setTimeout(() => beep(1180, .13), 110);
  }

  const ok = saved ? await postToDiscord(blob) : false;
  toast(
    saved ? (ok ? "Saved to your device and to Discord" : "Saved to your device") : "Not saved — tap Save again",
    saved ? "good" : "bad"
  );
  btn.disabled = false; btn.textContent = "Save to my device";
};

function pushGallery(canvas){
  const u = canvas.toDataURL("image/jpeg", .5);
  if(S.gallery.includes(u)) return;
  S.gallery.unshift(u); S.gallery = S.gallery.slice(0, 8);
  $("#galWrap").hidden = false;
  $("#gal").innerHTML = S.gallery.map(x => `<img src="${x}" alt="Saved strip">`).join("");
}
$("#gal").onclick = e => { if(e.target.tagName === "IMG") window.open(e.target.src, "_blank"); };

$("#againBtn").onclick = () => {
  S.shots = []; S.stickers = []; S.sel = null;
  S.caption = CONFIG.defaultCaption; $("#caption").value = S.caption;
  $("#toStep4").disabled = true; setShoot("start");
  go(2);
};

/* ══════════════════════════════════════════════════════════
   ADMIN — add strip layouts
   ══════════════════════════════════════════════════════════ */
const KEY = "smora_strips_v1";
function loadCustom(){
  try{ S.custom = JSON.parse(localStorage.getItem(KEY) || "{}"); }catch(e){ S.custom = {}; }
}
function saveCustom(){
  try{ localStorage.setItem(KEY, JSON.stringify(S.custom)); }
  catch(e){ toast("Storage is full — remove an overlay image", "bad"); }
}

let tapCount = 0, tapT;
$("#brandBtn").onclick = () => {
  tapCount++; clearTimeout(tapT);
  tapT = setTimeout(() => tapCount = 0, 900);
  if(tapCount >= 5){ tapCount = 0; openAdmin(); }
};
function openAdmin(skipLock = false){
  $("#adminModal").classList.add("on");
  if(skipLock){
    $("#adminLock").hidden = true; $("#adminBody").hidden = false;
    buildLayouts($("#adminList"), true); drawFormPreview();
  }else{
    $("#adminLock").hidden = false; $("#adminBody").hidden = true; $("#adminPass").value = "";
  }
}
$("#adminClose").onclick = () => $("#adminModal").classList.remove("on");
$("#adminModal").addEventListener("click", e => { if(e.target.id === "adminModal") $("#adminModal").classList.remove("on"); });
$("#designBtn").onclick = () => openAdmin(true);

$("#adminGo").onclick = async () => {
  const btn = $("#adminGo");
  btn.disabled = true;
  try{
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pass: $("#adminPass").value })
    });
    if(res.status === 501){ toast("Set ADMIN_PASS in your Vercel environment variables first", "bad"); return; }
    if(res.status === 429){ toast("Too many tries — wait a few minutes", "bad"); return; }
    if(!res.ok){ toast("Wrong passcode", "bad"); return; }
  }catch(e){ toast("Couldn't check the passcode — are you online?", "bad"); return; }
  finally{ btn.disabled = false; }
  $("#adminPass").value = "";
  $("#adminLock").hidden = true; $("#adminBody").hidden = false;
  buildLayouts($("#adminList"), true); drawFormPreview();
};
$("#adminPass").addEventListener("keydown", e => { if(e.key === "Enter") $("#adminGo").click(); });

let formOverlay = null;
const formFields = ["fName","fCols","fRows","fCw","fCh","fPad","fGap","fFoot","fRad"];
formFields.forEach(id => $("#" + id).addEventListener("input", drawFormPreview));

function readForm(){
  return {
    label: ($("#fName").value || "Custom strip").slice(0, 26),
    cols: clamp(+$("#fCols").value, 1, 6),
    rows: clamp(+$("#fRows").value, 1, 8),
    cw:   clamp(+$("#fCw").value, 120, 2000),
    ch:   clamp(+$("#fCh").value, 120, 2000),
    pad:  clamp(+$("#fPad").value, 0, 200),
    gap:  clamp(+$("#fGap").value, 0, 200),
    foot: clamp(+$("#fFoot").value, 0, 400),
    rad:  clamp(+$("#fRad").value, 0, 120),
    overlay: formOverlay || null
  };
}
const clamp = (n, a, b) => Math.min(b, Math.max(a, isNaN(n) ? a : n));

function drawFormPreview(){
  const f = readForm();
  const blanks = new Array(shotsOf(f)).fill(null);
  const c = $("#fPrev");
  const keepBg = S.bg; S.bg = "#FFFFFF";
  drawStrip(c, { frame: f, shots: blanks });
  S.bg = keepBg;
}

$("#fOver").addEventListener("change", async e => {
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 2.5 * 1024 * 1024){ toast("Overlay must be under 2.5 MB", "bad"); e.target.value = ""; return; }
  formOverlay = await downscale(file, 1400);
  delete overlayCache[formOverlay];
  drawFormPreview();
  toast("Overlay loaded", "good");
});

function downscale(file, max){
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/png"));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

$("#fSave").onclick = () => {
  const f = readForm();
  if(shotsOf(f) > CONFIG.maxShots){ toast(`That is ${shotsOf(f)} photos — the limit is ${CONFIG.maxShots}`, "bad"); return; }
  const key = "c_" + Date.now().toString(36);
  S.custom[key] = f;
  saveCustom();
  formOverlay = null; $("#fOver").value = ""; $("#fName").value = "";
  buildLayouts($("#adminList"), true); buildLayouts($("#layouts"), false, layoutFilter());
  drawFormPreview();
  toast(`"${f.label}" added`, "good");
};

$("#fExport").onclick = () => {
  const blob = new Blob([JSON.stringify(S.custom, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "strips.json";
  a.click(); URL.revokeObjectURL(a.href);
};
$("#fImportBtn").onclick = () => $("#fImport").click();
$("#fImport").addEventListener("change", e => {
  const file = e.target.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const data = JSON.parse(r.result);
      Object.assign(S.custom, data); saveCustom();
      buildLayouts($("#adminList"), true); buildLayouts($("#layouts"), false, layoutFilter());
      toast("Strips imported", "good");
    }catch(err){ toast("That file is not valid JSON", "bad"); }
  };
  r.readAsText(file);
});

/* ─── boot ────────────────────────────────────────────────── */
(async function init(){
  $("#brandName").textContent = CONFIG.name;
  ICE.setFallback(CONFIG.duoIceServers);
  ICE.prefetch();          // credentials are usually ready before anyone taps Duo Booth
  loadTheme();
  loadCustom();
  loadPapers();

  try{
    const res = await fetch("strips.json", { cache: "no-store" });
    if(res.ok) S.custom = { ...(await res.json()), ...S.custom };
  }catch(e){}

  buildLayouts($("#layouts"), false, layoutFilter());
  buildChips($("#looks2"), LOOKS, "look");
  buildChips($("#looks3"), LOOKS, "look");
  buildTimers(); buildSwatches(); wirePaperTools(); buildEmoji();
  renderStkBar(); setShoot("start"); prepShots(); renderChat();
  $("#caption").value = S.caption;
  go(1);

  /* someone opened a shared link or scanned the QR */
  const params = new URLSearchParams(location.search);
  if(params.has("duo")){
    const code = codeFromText(params.get("duo"));
    history.replaceState(null, "", location.pathname);
    if(code){
      markCardSelected("duo");
      openDuoModal(code);
      setTimeout(() => duoJoin(code), 400);
    }
  }

  if(params.has("admin")) openAdmin();
})();

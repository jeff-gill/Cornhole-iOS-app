// ───────────────────────── Bullseye Bags: a daily challenge at a giant cornhole board with a bullseye round the hole
// Everyone gets the same challenge each day (the scene, wind, weather, board and the bags already lying on the board all
// come from the date), and everyone throws the same Golden Bag. The board is laid out like a real one, just bigger: the
// hole sits near the back, and four coloured rings circle it, running off the back and sides of the board. Each ring and
// the hole is a prize; only a bag resting on the board counts. Win a ring and it's gone (plain wood) for the rest of the
// day, so later throws go after what's left. The hole is the top prize (a can that opens on the spot). Knock the star bag
// into the hole for double. Easier and Harder (tighter rings, farther, windier, more bags in the way). One free throw a day;
// more can be bought (1, 3 or 5). The board is a regulation 2 x 4 ft board.
const BB_BOARD = { W: 2, L: 4, FH: 0.25, BH: 1, HR: 0.25, HOLE_Y: 3.25 }; // a regulation 2 x 4 board, hole 9" from the back
// The day's court: one of the regular courts (a standard 27 ft court on level ground, you in a pitcher's box), with
// the bullseye board where the far board would be.
const bbCourts = () => VENUES; // any of the 12 regular courts (the view only; the court is always a standard 27 ft court)
// Weather changes the throw, not just the look. mu: board friction (lower slides farther); r: how much a landing keeps.
const BB_WEATHER = [
  { id: "sunny", name: "Sunny", icon: "☀️", w: 40, note: "" },
  { id: "cloudy", name: "Cloudy", icon: "☁️", w: 18, note: "" },
  { id: "rain", name: "Rain", icon: "🌧️", w: 16, note: "Wet board: bags slide farther", mu: 0.72, r: 0.06 },
  { id: "snow", name: "Snow", icon: "🌨️", w: 10, note: "Snowy board: bags stop short", mu: 1.35, r: -0.14, only: ["lodge"] },
  { id: "fog", name: "Fog", icon: "🌫️", w: 16, note: "Hard to see the board" },
];
// The five prizes for each level: the four rings from the outside in, then the hole. Colours never change. Coins are in
// buy-ins of your best court.
const BB_PRIZES = {
  easy: [{ name: "Blue ring", c: "#2f86ff", coins: 0.04 }, { name: "Green ring", c: "#2fbf71", caps: 2 }, { name: "Red ring", c: "#ff3b30", coins: 0.1 },
    { name: "Orange ring", c: "#ff8a1f", can: { bronze: 60, silver: 40 } }, { name: "The hole", c: "#ffc93a", hole: true, can: { silver: 50, gold: 40, purple: 10 } }],
  hard: [{ name: "Purple ring", c: "#8a4dff", coins: 0.12 }, { name: "Pink ring", c: "#ff2e88", caps: 6 }, { name: "Teal ring", c: "#00c2d1", coins: 0.3 },
    { name: "Red ring", c: "#e8231a", can: { gold: 60, purple: 40 } }, { name: "The hole", c: "#b6f000", hole: true, can: { purple: 50, platinum: 35, diamond: 15 } }],
};
// Ring edges (ft from the middle of the hole), outer to inner: prize 0 is the outer ring, prize 3 the one round the hole.
// The outer rings run off the back and sides of the board; only the part on the board counts.
const BB_RINGS = { easy: [1.35, 1.05, 0.78, 0.52], hard: [1.0, 0.78, 0.58, 0.4] };
// Plain words for the day's board (what it does to a landing bag).
const BB_SURF_WORDS = { "-2": "Sticky: bags stop short", "-1": "Grippy: bags stop a bit short", "0": "Normal: bags slide a normal amount", "1": "Fast: bags slide farther", "2": "Slick: bags slide a long way" };
// Everyone throws the Golden Bag (a neutral bag with good stats), so nobody needs to know the shop's bags.
const BB_GOLDEN = { id: "bb_golden", name: "Golden Bag", c: "#ffc93a", pattern: "diamond", acc: 3, ctrl: 3, spin: 3, feel: "neutral" };
const BB_LOOKS = { grey: { id: "bb_grey", name: "Grey", c: "#9aa0aa", pattern: "plain" }, star: { id: "bb_star", name: "Star", c: "#8a4dff", pattern: "star" } };
const BB_STORE = ["bullseye.1", "bullseye.3", "bullseye.5"].map(PID);
const BB = { active: null, mesh: null, precip: null, starTag: null };

// ── The day's challenge
const bbDay = (d = homeDate()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
function bbToday() {
  const key = bbDay();
  if (bbToday.cache && bbToday.cache.key === key && bbToday.cache.sunday === (homeDate().getUTCDay() === 0)) return bbToday.cache;
  let h = 2166136261; for (const ch of "bullseye:" + key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = rng(h >>> 0), pick = a => a[Math.floor(r() * a.length)];
  const v = pick(bbCourts()), scene = { id: v.id, name: v.name, sub: v.sub, surf: ["beach", "island", "lakeside"].includes(v.id) }, side = r() < 0.5 ? -1 : 1;
  const ws = BB_WEATHER.filter(w => !w.only || w.only.includes(scene.id));
  let x = r() * ws.reduce((t, w) => t + w.w, 0), weather = ws[0];
  for (const w of ws) { x -= w.w; if (x <= 0) { weather = w; break; } }
  const board = pick(BOARDS).id, windDir = r() * Math.PI * 2, gust = r();
  const modes = {};
  for (const m of ["easy", "hard"]) {
    const hard = m === "hard", L = BB_BOARD.L, HWb = BB_BOARD.W / 2, hole = { x: 0, y: BB_BOARD.HOLE_Y };
    // the star bag sits near the hole (knock it in for double); grey bags are scattered, never on the hole
    // Bags already on the board: 0-3 on Easier, 4-9 on Harder, spread over the whole board (about 60% on the front two
    // thirds) but never on the bullseye (the hole and the ring round it). Plus the star bag beside the hole (x2).
    const bull = BB_RINGS[m][3] + 0.2, bags = [];
    const clear = (p, gap = 0.52) => Math.hypot(p.x - hole.x, p.y - hole.y) > bull && Math.abs(p.x) < HWb - 0.27 && p.y > 0.28 && p.y < L - 0.28 && bags.every(b => Math.hypot(b.x - p.x, b.y - p.y) > gap);
    for (let tries = 0; tries < 200; tries++) { const sa = Math.PI * (0.6 + r() * 0.8), sd = BB_BOARD.HR + 0.3 + r() * 0.15, p = { x: Math.sin(sa) * sd, y: hole.y + Math.cos(sa) * sd, star: true, angle: r() * 6 }; if (Math.abs(p.x) < HWb - 0.27 && bags.every(b => Math.hypot(b.x - p.x, b.y - p.y) > 0.52)) { bags.push(p); break; } }
    const n = hard ? 4 + Math.floor(r() * 6) : Math.floor(r() * 4);
    for (let k = 0, tries = 0; k < n && tries < 3000; tries++) {
      const front = r() < 0.6, y = front ? 0.28 + r() * (L * 2 / 3 - 0.28) : L * 2 / 3 + r() * (L / 3 - 0.28);
      const p = { x: (r() * 2 - 1) * (HWb - 0.27), y, angle: r() * 6 };
      if (clear(p)) { bags.push(p); k++; }
    }
    modes[m] = { dist: 27, wind: Math.round(hard ? 3 + gust * 2 : gust * 2), bags };
  }
  const sunday = homeDate().getUTCDay() === 0; // Hole-in-One Sunday: the hole also wins the exclusive bag
  return (bbToday.cache = { key, scene, side, weather, board, windDir, modes, sunday });
}

// ── Throws: one free a day (resets at midnight), plus any you've bought. Prizes won today, per level.
const bbState = () => (career.bb ||= { day: "", extra: 0 });
const bbFreeReady = () => bbState().day !== bbDay();
const bbCanPlay = () => bbFreeReady() || bbState().extra > 0;
function bbWon(mode) { // indexes 0-4 (4 is the hole) won today on this level
  const s = bbState();
  if (!s.won || s.won.day !== bbDay()) s.won = { day: bbDay(), easy: [], hard: [] };
  return s.won[mode];
}
// Labels floating over each ring (and the hole) saying what it's worth; a won ring has none (it's plain wood now).
function bbShowRingLabels(on) {
  for (const sp of BB.labels || []) { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }
  BB.labels = [];
  if (!on || !BB.active) return;
  const mode = BB.active.mode, won = bbWon(mode), R = BB_RINGS[mode], P = BB_PRIZES[mode];
  const ang = [0, 0.9, -0.9, 2.3]; // where on each ring its label sits (radians round from the front), spread so they don't overlap
  for (let i = 0; i < 5; i++) {
    if (won.includes(i)) continue;
    const p = P[i], sun = i === 4 && BB.active.day.sunday, text = sun ? "⛳ + exclusive bag" : p.can ? `${Object.keys(p.can).map(k => canById(k).name.split(" ")[0]).filter((v, j, a) => j === 0 || j === a.length - 1).join("–")} can` : p.caps ? `${p.caps} caps` : `${short(bbCoins(p.coins))} coins`;
    let x = -0.5, y = HOLE.y + 0.55; // the hole's label just behind it, to the left
    if (i < 4) { const mid = (R[i] + (R[i + 1] || HR)) / 2, a = ang[i]; x = Math.sin(a) * mid; y = HOLE.y - Math.cos(a) * mid; if (i === 3) x = Math.max(x, 0.45); }
    x = clamp(x, -HW + 0.4, HW - 0.4);
    const tex = canvasTex(320, 96, (c, w, h) => {
      c.fillStyle = p.c; c.strokeStyle = "#ffffff"; c.lineWidth = 7;
      c.beginPath(); c.roundRect(5, 5, w - 10, h - 10, 34); c.fill(); c.stroke();
      c.fillStyle = "#ffffff"; c.font = `900 ${text.length > 14 ? 30 : 40}px Arial Black, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      c.lineWidth = 6; c.strokeStyle = "rgba(0,0,0,.35)"; c.strokeText(text, w / 2, h / 2 + 2); c.fillText(text, w / 2, h / 2 + 2);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(0.8, 0.24, 1); sp.renderOrder = 10; sp.position.copy(W(x, y, plane(y) + 0.22)); scene.add(sp); BB.labels.push(sp);
  }
}
const bbCleared = mode => bbWon(mode).length >= 5;
function bbUseThrow() {
  const s = bbState();
  if (s.day !== bbDay()) { s.day = bbDay(); s.used = "free"; }
  else if (s.extra > 0) { s.extra--; s.used = "extra"; }
  else return false;
  save(); return true;
}
function bbRefundThrow() { // a throw that never happened (quit before throwing, or something went wrong)
  const s = bbState();
  if (s.used === "free") s.day = ""; else if (s.used === "extra") s.extra++;
  s.used = null; save();
}
const bbUntilMidnight = () => { const n = homeDate(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime(); };
function renderBBBtn() {
  const b = $("bbBtn"); if (!b) return;
  const free = bbFreeReady(), extra = bbState().extra, done = bbCleared("easy") && bbCleared("hard");
  $("bbSub").textContent = done ? "All prizes won today!" : free ? "Free throw today!" : extra ? `${extra} throw${extra > 1 ? "s" : ""} left` : `Next free in ${timeText(bbUntilMidnight())}`;
  b.classList.toggle("ready", !done && (free || extra > 0));
}

// ── Prizes
const bbFee = () => VENUES[topCourt()].fee;
const bbCoins = k => Math.max(5, Math.round(bbFee() * k / 5) * 5);
function bbPrizeText(p) {
  if (p.can) { const ids = Object.keys(p.can); return `${canById(ids[0]).name.split(" ")[0]}–${canById(ids[ids.length - 1]).name.split(" ")[0]} can`; }
  if (p.caps) return `<i class="bcap"></i> ${p.caps}`;
  return `<i class="coin"></i> ${short(bbCoins(p.coins))}`;
}
// Where the thrown bag finished: a prize index (0-3 a ring from the outside in, 4 the hole), "board" or "miss".
// Only a bag resting on the board counts; a ring already won today is plain wood.
function bbHit(b, mode) {
  const won = bbWon(mode), R = BB_RINGS[mode];
  if (!b) return "miss";
  if (b.state === "inHole") return won.includes(4) ? "board" : 4;
  if (!onSurface(b) || !onBoard(b)) return "miss";
  const d = dist(b, HOLE);
  for (let i = 3; i >= 0; i--) if (d < R[i] && (i === 0 || d >= R[i + 1] || i === 3)) return won.includes(i) ? "board" : i;
  return "board";
}

// ── Starting a throw
function bbLevel() { // meters for the level, like a match (the Golden Bag is a good, steady bag)
  const hard = BB.active && BB.active.mode === "hard", g = S.gear[0];
  const zone = hard ? 0.034 : 0.052, wob = hard ? 0.047 : 0.018;
  return { freq: 0.55 * (1 - 0.06 * (g.acc - 1)) * (hard ? 1.15 : 1), zone: SWEET * zone * (1 + 0.15 * (g.acc - 1)), powZone: SWEET * zone * (1 + 0.15 * (g.ctrl - 1)),
    wobble: wob * (1 - 0.15 * (g.ctrl - 1)), cpu: 0.25, preview: true, scatter: hard ? 1.6 : 1.1 };
}
// preview: look at the court and the board first (no throw used); PLAY from there, or go back.
function bbStart(mode, preview = false) {
  if (bbCleared(mode) || (!preview && !bbCanPlay())) return;
  const day = bbToday(), M = day.modes[mode], sc = day.scene, L = BB_BOARD.L;
  if (!preview && !bbUseThrow()) return;
  initAudio(); musicScene(preview ? "hub" : null);
  $("bbSheet").hidden = true; $("hub").hidden = true; document.body.classList.remove("inhub", "looking");
  BB.active = { mode, day, M, done: false, preview };
  setCourt({ FY: M.dist, BY: M.dist + L, HW: BB_BOARD.W / 2, FH: BB_BOARD.FH, BH: BB_BOARD.BH, HR: BB_BOARD.HR, hole: { x: 0, y: M.dist + BB_BOARD.HOLE_Y }, rel: { h: 3, y: 0.5, x: 1.8 } }); // a standard court: level ground, regulation distance
  SIDES[0] = day.side; // your pitcher's box for the day
  S.kind = "bullseye"; S.practice = null; S.online = null; S.opponent = null; S.names = [myHandle(), ""];
  S.gear = [BB_GOLDEN, { ...BB_LOOKS.grey, acc: 1, ctrl: 1, spin: 1, feel: "neutral" }];
  S.teamC = [BB_GOLDEN.c, "#9aa0aa"]; setTeamColors();
  S.board = day.board; S.boardMine = false;
  const d = boardById(day.board), w = day.weather;
  T.mu = 0.34 * (1 - 0.09 * (d.surf || 0)) * (w.mu || 1); T.rBase = BASE_R + 0.06 * (d.bounce || 0) + (w.r || 0);
  S.wind = { mph: M.wind, dir: day.windDir };
  S.world = new World(); clearBagMeshes();
  for (const p of M.bags) {
    const y = FY + p.y;
    S.world.bags.push({ id: S.world.nextId++, owner: 1, state: "resting", x: p.x, y, z: plane(y), vx: 0, vy: 0, angle: p.angle, spin: 0, curve: 0, t: null, ft: 0, c: null, trail: [], star: !!p.star, look: p.star ? BB_LOOKS.star : BB_LOOKS.grey });
  }
  S.scores = [0, 0]; S.inning = 1; S.thrown = [0, 4]; S.lost = [[], []]; S.player = 0; S.leader = 0; S.saved = {}; S.history = []; S.feedback = [];
  S.lastId = null; S.fourBagger = [false, false]; S.result = null; S.winner = null; S.tut = { dragged: true, thrown: false }; S.clock = null; S.pauses = 0; S.awayDebt = 0; S.awayAt = null;
  S.end = null; S.landD = null; S.landPhi = 0;
  targetBoard.visible = false; teamCoolers.visible = false; // the bullseye board stands in for the far board; yours stays at your feet
  buildVenue(sc.id); setBoardDesign(day.board);
  bbBuildBoard(d, mode, M); bbWeather(w);
  venueAmbience(sc.id, M.wind);
  if (preview) { S.phase = "bbpreview"; bbShowRingLabels(true); showBanner(mode === "hard" ? "Preview · HARDER" : "Preview · EASIER", 0); ui(); return; }
  bbBeginThrow();
}
// Like Golf Clash: first a close look at the board with what each ring is worth (it stays until you tap), then the
// camera pulls back to aim.
function bbBeginThrow() {
  const mode = BB.active.mode;
  showBanner(mode === "hard" ? "Bullseye Bags · HARDER" : "Bullseye Bags · EASIER", 0);
  bbShowRingLabels(true); BB.introT = 0; S.phase = "bbintro"; ui();
}
function bbEndIntro() {
  if (S.phase !== "bbintro") return;
  const mode = BB.active.mode;
  bbShowRingLabels(false);
  beginTurn();
  // aimed at the best prize still on the board to start, so the throw's path shows right away
  const won = bbWon(mode), R = BB_RINGS[mode], k = [3, 2, 1, 0].find(i => !won.includes(i)) ?? 3;
  const aim = !won.includes(4) ? { x: 0, y: HOLE.y } : { x: 0, y: HOLE.y - (R[k] + (R[k + 1] || BB_BOARD.HR)) / 2 }; // the front of the best ring left
  S.end = aim; refreshPlan(); ui();
}
// From the preview: use a throw and play this level, or go back to the Bullseye sheet.
function bbPreviewPlay() {
  const A = BB.active; if (!A || !A.preview) return;
  if (!bbUseThrow()) { bbPreviewBack(); return; }
  A.preview = false; musicScene(null); bbShowRingLabels(true); S.phase = "bbintro"; bbEndIntro(); // already seen the prizes: straight to aiming
}
function bbPreviewBack() { openHub(); renderBBSheet(); }
function bbPreviewPanel() {
  const A = BB.active, can = bbCanPlay();
  return `<div class="center"><div class="big">${A.mode === "hard" ? "Harder" : "Easier"}</div>
    <div class="muted">${A.M.dist} ft · ${A.M.wind} mph wind · ${A.M.bags.length} bag${A.M.bags.length > 1 ? "s" : ""} on the board. Looking doesn't use a throw.</div></div>
    <div class="btns" style="grid-template-columns:1fr 1.6fr"><button class="btn" id="bbPrevBack">BACK</button>
    <button class="btn go ${A.mode === "hard" ? "red" : "green"}" id="bbPrevPlay" ${can ? "" : "disabled"}>${can ? `PLAY ${A.mode === "hard" ? "HARDER" : "EASIER"}` : "NO THROWS LEFT"}</button></div>`;
}
// Today's prizes for a level: a colour dot, the prize, and a tick once won.
function bbPrizeRows(mode) {
  const won = bbWon(mode);
  return BB_PRIZES[mode].map((p, i) => `<div class="${won.includes(i) ? "won" : ""}"><i class="${p.hole ? "hole" : ""}" style="--c:${p.c}"></i><span>${p.name}</span><b>${won.includes(i) ? "✓ Won" : bbPrizeText(p)}</b></div>`).join("");
}
// The prize key: shown on the board screen while you pick your spot, gone once you start the throw.
function bbRenderLegend() {
  const el = $("bbLegend"), show = false; // (replaced by the labels on the board during the zoom-in)
  el.hidden = !show; if (!show) return;
  const mode = BB.active.mode;
  el.innerHTML = `<h4>Today's prizes <small>${5 - bbWon(mode).length} left</small></h4>${bbPrizeRows(mode)}<p>⭐ Star bag in the hole: <b>x2</b></p>`;
}
const markerScale = () => 1;
const bbPanelTag = () => BB.active ? `Bullseye · ${BB.active.mode === "hard" ? "Harder" : "Easier"} <button class="btn small blue" id="bbMoreBtn" onclick="bbBuyPopup()">+ THROWS</button>` : ""; // (no court name: it's just a standard court with a different view each day)

// Back to the regular court (on the way back to the clubhouse, or before any match).
function bbExit() {
  if (BB.active && !BB.active.done && !BB.active.preview && S.lastId == null) bbRefundThrow(); // never thrown: you keep the throw
  BB.active = null;
  if (BB.mesh) { scene.remove(BB.mesh); BB.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); }); BB.mesh = null; }
  if (BB.precip) { scene.remove(BB.precip.o); BB.precip.o.geometry.dispose(); BB.precip = null; }
  if (BB.starTag) { scene.remove(BB.starTag); BB.starTag = null; }
  bbShowRingLabels(false);
  if (S.kind !== "bullseye") return;
  setCourt(); S.kind = "career";
  targetBoard.visible = ownBoard.visible = true; teamCoolers.visible = true;
}

// ── The giant board: wood with the bullseye rings round the hole (won ones are plain wood), a frame and legs.
function bbPaintBoard(c, w, h, d, mode, M) {
  const s = w / BB_BOARD.W, r = rng(9), won = bbWon(mode), P = BB_PRIZES[mode];
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#f0d29c"); g.addColorStop(0.5, "#e6c086"); g.addColorStop(1, "#ddb37a");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const x0 = r() * w, amp = 2 + r() * 8, f = 2 + r() * 4, ph = r() * 6;
    c.strokeStyle = `rgba(140,90,40,${0.06 + r() * 0.12})`; c.lineWidth = 1 + r() * 3;
    c.beginPath(); for (let k = 0; k <= 40; k++) { const y = h * k / 40, x = x0 + Math.sin(k / 40 * f + ph) * amp; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  }
  const edge = d.a === "#ffffff" ? "#1f3a6e" : d.a; // a border in the board design's colour
  c.strokeStyle = edge; c.lineWidth = 0.08 * s; c.strokeRect(0.04 * s, 0.04 * s, w - 0.08 * s, h - 0.08 * s);
  const X = x => w / 2 + x * s, Y = y => h - y * s; // board feet (x across from the middle, y up from the front) to pixels
  const glyph = (p, x, y, rad) => {
    c.fillStyle = "#ffffff"; c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = rad * 0.06;
    if (p.can) { const cw = rad * 0.62, ch = rad * 1.0; c.beginPath(); c.roundRect(x - cw / 2, y - ch / 2, cw, ch, cw * 0.22); c.fill(); c.stroke(); c.fillStyle = p.c; c.fillRect(x - cw / 2, y - ch * 0.12, cw, ch * 0.24); }
    else { c.font = `900 ${Math.round(rad * (p.caps ? 1.1 : 1.2))}px Arial Black, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(p.caps ? "★" : "$", x, y + rad * 0.06); }
  };
  const hx = X(0), hy = Y(BB_BOARD.HOLE_Y), RR = BB_RINGS[mode];
  for (let i = 0; i < 4; i++) { // outer ring first; each is an annulus out to its edge (in to the next ring)
    if (won.includes(i)) continue; // won: plain wood for the rest of the day
    const p = P[i], ro = RR[i] * s, ri = (RR[i + 1] || 0) * s;
    const gr = c.createRadialGradient(hx, hy - ro * 0.3, ri, hx, hy, ro); gr.addColorStop(0, shade(p.c, 0.3)); gr.addColorStop(1, p.c);
    c.fillStyle = gr; c.beginPath(); c.arc(hx, hy, ro, 0, 7); if (ri) c.arc(hx, hy, ri, 7, 0, true); c.fill("evenodd");
  }
  c.strokeStyle = "#ffffff"; c.lineWidth = 0.03 * s;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(hx, hy, RR[i] * s, 0, 7); c.stroke(); }
  for (let i = 0; i < 4; i++) { // each ring's prize symbol on its front edge, where you can see it from the throw
    if (won.includes(i)) continue;
    glyph(P[i], hx, hy + (RR[i] + (RR[i + 1] || BB_BOARD.HR)) / 2 * s, (RR[i] - (RR[i + 1] || BB_BOARD.HR)) * 0.42 * s);
  }
  if (!won.includes(4)) { // the hole: the top prize, ringed in its colour
    const hr = BB_BOARD.HR * s;
    c.fillStyle = "#ffffff"; c.beginPath(); c.arc(hx, hy, hr + 0.09 * s, 0, 7); c.fill();
    c.fillStyle = P[4].c; c.beginPath(); c.arc(hx, hy, hr + 0.065 * s, 0, 7); c.fill();
  }
  // the border on top of the rings, so the board's edge stays crisp where they run off it
  c.strokeStyle = edge; c.lineWidth = 0.08 * s; c.strokeRect(0.04 * s, 0.04 * s, w - 0.08 * s, h - 0.08 * s);
  c.fillStyle = edge; for (const [x, y] of [[0.15, 0.15], [BB_BOARD.W - 0.15, 0.15], [0.15, BB_BOARD.L - 0.15], [BB_BOARD.W - 0.15, BB_BOARD.L - 0.15]]) { c.beginPath(); c.arc(x * s, y * s, 0.05 * s, 0, 7); c.fill(); }
}
function bbBuildBoard(d, mode, M) {
  if (BB.mesh) { scene.remove(BB.mesh); BB.mesh = null; }
  const L = BY - FY, g = new THREE.Group(), tilt = new THREE.Group();
  tilt.position.y = FH - 0.095; tilt.rotation.x = SLOPE; tilt.scale.z = 1 / SC; g.add(tilt); // its top is the plane the bags and targets sit on
  const shape = new THREE.Shape();
  shape.moveTo(-HW, 0); shape.lineTo(HW, 0); shape.lineTo(HW, L); shape.lineTo(-HW, L); shape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, HOLE.y - FY, HR, 0, Math.PI * 2, true); shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2, curveSegments: 64 });
  geo.rotateX(-Math.PI / 2);
  const tex = canvasTex(800, Math.round(800 * L / (2 * HW)), (c, w, h) => bbPaintBoard(c, w, h, d, mode, M));
  tex.repeat.set(1 / (2 * HW), 1 / L); tex.offset.set(0.5, 0); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // the top is matte and a touch darker so the rings stay bold in bright sun
  const top = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, color: 0xd8d8d8, envMapIntensity: 0.35 }), new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.7 })]);
  top.castShadow = top.receiveShadow = true; tilt.add(top);
  const frame = std(d.a === "#ffffff" ? 0x1f3a6e : d.a);
  for (const [w, dd, x, z] of [[0.1, L, HW - 0.05, -L / 2], [0.1, L, -HW + 0.05, -L / 2], [2 * HW, 0.1, 0, -0.05], [2 * HW, 0.1, 0, -L + 0.05]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, dd), frame); m.position.set(x, -0.15, z); m.castShadow = true; tilt.add(m);
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(HR, HR, 0.5, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x120c08, side: THREE.BackSide }));
  tube.position.set(0, -0.2, -(HOLE.y - FY)); tilt.add(tube);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(HR, 40), new THREE.MeshBasicMaterial({ color: 0x050302 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.42, -(HOLE.y - FY)); tilt.add(floor);
  const wood = std(0x9c6f3d);
  for (const x of [-HW + 0.12, HW - 0.12]) add(g, box(0.12, BH - 0.2, 0.28), x, (BH - 0.2) / 2, -(L - 0.4)).material = wood;
  g.position.z = -FY; scene.add(g); BB.mesh = g;
}

// ── Weather: the sky, the fog and rain or snow falling between you and the board
function bbWeather(w) {
  const grey = (k, top, mid, hor) => { skyU.top.value.set(...top); skyU.mid.value.set(...mid); skyU.horizon.value.set(...hor); skyU.sunGlow.value *= k; sun.intensity *= k; };
  if (w.id === "cloudy") grey(0.6, [0.52, 0.58, 0.66], [0.70, 0.74, 0.80], [0.84, 0.86, 0.88]);
  if (w.id === "rain") { grey(0.45, [0.38, 0.42, 0.48], [0.55, 0.58, 0.63], [0.68, 0.70, 0.73]); renderer.toneMappingExposure *= 0.92; scene.fog.color.setHex(0x9aa2ac); scene.fog.near = 60; scene.fog.far = 420; }
  if (w.id === "snow") { grey(0.6, [0.62, 0.66, 0.72], [0.78, 0.81, 0.86], [0.90, 0.92, 0.95]); scene.fog.color.setHex(0xdfe4ea); scene.fog.near = 60; scene.fog.far = 380; }
  if (w.id === "fog") { grey(0.55, [0.72, 0.75, 0.78], [0.82, 0.84, 0.86], [0.88, 0.89, 0.90]); scene.fog.color.setHex(0xd8dcdf); scene.fog.near = 25; scene.fog.far = FY + 110; }
  if (w.id === "rain" || w.id === "snow") {
    const rain = w.id === "rain", n = rain ? 1400 : 1600, top = REL_H + 30, pos = new Float32Array(n * (rain ? 6 : 3)), sp = [];
    const spawn = () => [(Math.random() - 0.5) * 70, Math.random() * top, 12 - Math.random() * (BY + 40)];
    for (let i = 0; i < n; i++) { const [x, y, z] = spawn(); if (rain) pos.set([x, y, z, x, y + 1.1, z], i * 6); else pos.set([x, y, z], i * 3); sp.push(rain ? 38 + Math.random() * 10 : 2.5 + Math.random() * 2.5); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const o = rain ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfd8e4, transparent: true, opacity: 0.45 }))
      : new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: 0xffffff, size: 0.35, transparent: true, depthWrite: false }));
    o.frustumCulled = false; scene.add(o); BB.precip = { o, rain, sp, top, spawn };
  }
}
function bbTick(dt) {
  if (BB.precip) {
    const P = BB.precip, a = P.o.geometry.attributes.position, wv = S.wind || { mph: 0, dir: 0 };
    const wx = Math.sin(wv.dir) * wv.mph * (P.rain ? 0.6 : 0.35), wz = -Math.cos(wv.dir) * wv.mph * (P.rain ? 0.6 : 0.35);
    for (let i = 0; i < P.sp.length; i++) {
      const k = P.rain ? i * 2 : i; let x = a.getX(k) + wx * dt + (P.rain ? 0 : Math.sin(S.time + i) * 0.5 * dt), y = a.getY(k) - P.sp[i] * dt, z = a.getZ(k) + wz * dt;
      if (y < 0) [x, y, z] = P.spawn().map((v, j) => (j === 1 ? P.top : v));
      a.setXYZ(k, x, y, z); if (P.rain) a.setXYZ(k + 1, x - wx * 0.03, y + 1.1, z - wz * 0.03);
    }
    a.needsUpdate = true;
  }
  // a little "⭐ x2" tag floats over the star bag until it's in the hole or off the board
  if (S.kind === "bullseye") {
    const st = S.world.bags.find(b => b.star);
    if (st && onSurface(st) && onBoard(st) && S.phase !== "bbintro" && S.phase !== "bbpreview") {
      if (!BB.starTag) BB.starTag = bbLabel("⭐ x2");
      BB.starTag.visible = true; BB.starTag.position.copy(W(st.x, st.y, plane(st.y) + 0.5 + 0.05 * Math.sin(S.time * 3)));
    } else if (BB.starTag) BB.starTag.visible = false;
    bbSpotTick();
  }
}
// Once the bag stops, it turns see-through with a bottle cap on its middle: whichever ring the cap sits in is the prize.
function bbSpotTick() {
  const b = S.phase === "bbdone" && S.world.bags.find(x => x.id === S.lastId);
  const show = !!b && b.state !== "inHole" && onSurface(b) && onBoard(b);
  for (const [id, v] of bagMeshes) { // the see-through bag (and back to solid otherwise)
    const fade = show && id === b.id;
    if (fade && !v.ghost) { v.solid = v.mesh.material; v.ghost = v.mesh.material.clone(); v.ghost.transparent = true; v.ghost.opacity = 0.5; v.ghost.depthWrite = false; }
    if (v.ghost) v.mesh.material = fade ? v.ghost : v.solid;
  }
  if (!show) { if (BB.spot) BB.spot.visible = false; return; }
  if (!BB.spot) {
    BB.spot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 40), new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }));
    BB.spot.rotation.x = -Math.PI / 2; BB.spot.renderOrder = 10; scene.add(BB.spot); BB.capTex = {};
  }
  const hit = BB.active && BB.active.result ? BB.active.result.hit : bbHit(b, BB.active ? BB.active.mode : "easy");
  const col = typeof hit === "number" ? BB_PRIZES[BB.active.mode][hit].c : "#8a94a6";
  BB.spot.material.map = BB.capTex[col] ||= bbCapTex(col); BB.spot.material.needsUpdate = true;
  BB.spot.visible = true;
  BB.spot.position.copy(W(b.x, b.y, plane(b.y) + 0.05));
  BB.spot.scale.setScalar(1 + 0.08 * Math.sin(S.time * 5));
}
// A bottle cap, seen from above: a crimped silver edge round a cap in the prize ring's colour.
function bbCapTex(col) {
  return canvasTex(128, 128, (c, w, h) => {
    const cx = w / 2, cy = h / 2;
    c.beginPath();
    for (let i = 0; i <= 42; i++) { const a = i / 42 * Math.PI * 2, r = i % 2 ? 56 : 63; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    c.fillStyle = "#c8ccd4"; c.fill(); c.lineWidth = 3; c.strokeStyle = "rgba(0,0,0,.45)"; c.stroke();
    const g = c.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, 50);
    g.addColorStop(0, "#ffffffaa"); g.addColorStop(0.25, col); g.addColorStop(1, col);
    c.beginPath(); c.arc(cx, cy, 47, 0, Math.PI * 2); c.fillStyle = g; c.fill(); c.strokeStyle = "rgba(0,0,0,.4)"; c.stroke();
    c.beginPath(); c.arc(cx, cy, 36, 0, Math.PI * 2); c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 2.5; c.stroke();
  });
}
function bbLabel(text) {
  const tex = canvasTex(256, 96, (c, w, h) => {
    c.fillStyle = "rgba(10,20,38,.82)"; c.strokeStyle = "#ffc93a"; c.lineWidth = 6;
    c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 36); c.fill(); c.stroke();
    c.fillStyle = "#ffc93a"; c.font = "900 52px Arial Black, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, w / 2, h / 2 + 3);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(0.9, 0.34, 1); sp.renderOrder = 9; scene.add(sp); return sp;
}

// ── Cameras: a view over the board for aiming and watching, and one behind the thrower for the throw.
function bbCamera(mode, narrow) {
  const r = release(0), top = plane(HOLE.y);
  if (mode === "throw" || mode === "cpu") {
    // Like a match: the arrow and power ring near the bottom, the board up the screen. Up high (a roof, a cliff, a pier)
    // the camera sits over your head at the edge, looking down past the arrow to the board below.
    const high = handFloor() > 0, gz = handFloor();
    if (high) {
      const cy = r.z + 10, cz = r.y - 2; // well up over your head, a couple of feet behind you (court y of the camera)
      // look between the arrow and the board, but never so steeply that the board leaves the top of the screen
      const aB = Math.atan2(cy - top, HOLE.y - cz), aR = Math.atan2(cy - gz, r.y + 1.2 - cz), a = Math.min(lerp(aB, aR, 0.5), aB + 0.33);
      tPos.set(r.x, cy, -cz); tLook.set(HOLE.x * 0.2, cy - 10 * Math.sin(a), -(cz + 10 * Math.cos(a)));
    } else { tPos.set(r.x, r.z + 3.4, -(r.y - 5.5)); tLook.set(lerp(r.x, HOLE.x, 0.45), lerp(gz, top, 0.45), -lerp(r.y, HOLE.y, 0.45)); }
    return { fov: narrow ? 50 : 42, k: 3 };
  }
  if (mode === "follow") {
    const b = S.world.bags.find(x => x.id === S.lastId);
    if (b) { tPos.set(b.x * 0.6, Math.max(top + 3.2, b.z * 0.7 + 2.6), -b.y + 7.5); tLook.set(b.x * 0.5, Math.max(0, b.z * 0.4), -b.y - 6); return { fov: narrow ? 50 : 42, k: 5 }; }
  }
  const mid = plane(FY + (BY - FY) * 0.62); // the whole board in view, the hole near the back
  tPos.set(0, mid + (narrow ? 7.6 : 6.6), -(FY - (narrow ? 3 : 3.6)));
  tLook.set(0, mid - 0.3, -(FY + (BY - FY) * 0.62));
  return { fov: narrow ? 50 : 42, k: 3 };
}

// ── After the throw: what it won
function bbFinish() {
  const A = BB.active; if (!A || A.done) return;
  A.done = true; bbState().used = null;
  if (!A.preview && typeof chProgress === "function") chProgress("bb", 1);
  const b = S.world.bags.find(x => x.id === S.lastId), hit = S.lastId == null ? "time" : bbHit(b, A.mode); // "time": the clock ran out
  const star = S.world.bags.find(x => x.star), doubled = !!star && star.state === "inHole";
  const times = doubled ? 2 : 1, got = [];
  const p = typeof hit === "number" ? BB_PRIZES[A.mode][hit] : {}; // no ring, no prize
  if (typeof hit === "number") { const wl = bbWon(A.mode); wl.push(hit); } // gone for the day
  if (p.can) for (let k = 0; k < times; k++) { // the first can opens on the spot; a doubled second one goes in the cooler, locked
    const id = earnedCan(rollCan(p.can));
    if (k === 0) career.cans.push({ id, court: topCourt(), instant: true }); else stashCan({ id, court: topCourt() });
    got.push({ can: id, later: k > 0 });
  }
  else if (p.caps) { career.caps += p.caps * times; got.push({ caps: p.caps * times }); }
  else if (p.coins) { const n = bbCoins(p.coins) * times; career.coins += n; got.push({ coins: n }); }
  // Hole-in-One Sunday: sinking the hole also wins the exclusive Hole-in-One bag (a bonus Gold can once you have it)
  if (hit === 4 && A.day.sunday) {
    if (!career.bags.includes("holeinone")) { career.bags.push("holeinone"); (career.newCards ||= {})["bag:holeinone"] = { unlocked: true }; got.push({ bag: "holeinone" }); }
    else { const gid = earnedCan("gold"); stashCan({ id: gid, court: topCourt() }); got.push({ can: gid, later: true }); }
  }
  save(); S.phase = "bbdone"; ui();
  if (hit === "miss") sfx.thud();
  A.result = { hit, doubled, got };
  setTimeout(() => { if (BB.active === A) renderBBResult(); }, 1800); // time to see the dot on the board first
}
// The win, shown like a can's prize: the light rays in the prize's colour, the prize card popping up, then COLLECT
// (or OPEN IT for a can, which goes straight to the can opening).
function renderBBResult() {
  const A = BB.active, R = A.result, can = R.got.find(g => g.can && !g.later), won = typeof R.hit === "number", P = won ? BB_PRIZES[A.mode][R.hit] : null;
  const g0 = R.got[0], left = 5 - bbWon(A.mode).length, level = A.mode === "hard" ? "Harder" : "Easier";
  const ck = g0 && g0.can ? canById(g0.can) : null; // a can prize shows the can itself, like the can opening does
  const pic = !g0 ? "💨" : ck ? canPic(ck.id, "big") : g0.caps ? `<i class="bcap big"></i>` : `<i class="coin big"></i>`;
  const what = !g0 ? (R.hit === "time" ? "The throw ran out of time" : "Nothing this time") : g0.can ? canById(g0.can).name : g0.caps ? `${g0.caps} caps` : `${short(g0.coins)} coins`;
  const extra = R.got.slice(1).map(g => g.bag ? `<small class="new">⛳ + the exclusive ${esc(bagById(g.bag).name)} bag!</small>` : g.can ? `<small class="new">+ a ${esc(canById(g.can).name)} in your cooler</small>` : "").join("");
  $("bbRays").style.setProperty("--ray", won ? P.c : "#8899aa"); $("bbRays").hidden = !won;
  $("bbRevTitle").innerHTML = won ? (P.hole ? (A.day.sunday ? "Hole in one! ⛳" : "In the hole!") : `${P.name}!`) : R.hit === "time" ? "Out of time" : R.hit === "miss" ? "Off the board" : "On the board";
  const card = $("bbRevPrize"); card.className = "prize";
  card.innerHTML = `<div class="pic">${pic}</div><b>${what}</b>${R.doubled ? `<small class="new">⭐ Star bag in: DOUBLE!</small>` : ""}${extra}
    <small>${won ? (can ? "Open it now!" : "That prize is gone for today.") : R.hit === "time" ? `You have ${BB_THROW_TIME} seconds for each throw.` : R.hit === "miss" ? "Only bags on the board count." : "No ring this time. Only the rings and the hole win."}</small>`;
  $("bbRevFoot").innerHTML = `<div class="bbrevleft">${left ? `${left} of 5 ${level} prizes left today` : `Every ${level} prize won today! 🎉`}</div>
    <button class="btn green go" id="bbCollect">${can ? "OPEN IT!" : won ? "COLLECT" : "OK"}</button>`;
  $("bbReveal").hidden = false;
  requestAnimationFrame(() => card.classList.add("show"));
  if (won) { sfx.win(); haptic("success"); }
  $("bbCollect").onclick = () => {
    openHub(); // (behind the reveal, which stays up until the can opening covers it: no flash of the clubhouse)
    if (can) { const i = career.cans.findIndex(c => c.instant && c.id === can.can); if (i >= 0) openCanSheet(i); }
    else renderBBSheet(); // back to Bullseye: what's left, throw again or buy more
    $("bbReveal").hidden = true;
  };
}

// More throws: 1, 3 or 5 (in-app purchases). Shown on the Bullseye sheet and after every throw.
function bbBuyRow() {
  const price = id => storePrices[id] || STORE.find(x => x.id === id).price;
  return `<div class="bbbuy">${BB_STORE.map(id => { const it = STORE.find(x => x.id === id); return `<button class="btn blue" data-bbbuy="${id}" ${pendingBuy === id ? "disabled" : ""}><b>${it.throws}</b> throw${it.throws > 1 ? "s" : ""}<small>${pendingBuy === id ? "…" : price(id)}</small></button>`; }).join("")}</div>`;
}
function bbBuyPopup(msg = "") {
  const extra = bbState().extra || 0;
  showInfo(`<h2>🎯 More throws</h2><div class="muted">${extra ? `You have ${extra} extra throw${extra > 1 ? "s" : ""}.` : "Buy extra Bullseye throws for today's challenge."}</div>${bbBuyRow()}${msg ? `<div class="muted center">${esc(msg)}</div>` : ""}`);
  for (const b of $("livesBody").querySelectorAll("[data-bbbuy]")) b.onclick = () => {
    if (!canBuy()) { bbBuyPopup("Purchases are available in the iPhone app."); return; }
    pendingBuy = b.dataset.bbbuy; postNative("purchase", pendingBuy); bbBuyPopup();
  };
}
window.bbBuyPopup = bbBuyPopup; // (the throw screen's button)
function bbWireBuy(rerender) {
  for (const b of $("bbBody").querySelectorAll("[data-bbbuy]")) b.onclick = () => {
    if (!canBuy()) { rerender("Purchases are available in the iPhone app."); return; }
    pendingBuy = b.dataset.bbbuy; postNative("purchase", pendingBuy); rerender("");
  };
}

// ── The Bullseye Bags sheet: today's challenge, Easy or Hard (with what's left to win), and more throws
function renderBBSheet(msg = "") {
  const day = bbToday(), free = bbFreeReady(), extra = bbState().extra, can = bbCanPlay(), d = boardById(day.board), w = day.weather;
  const card = mode => {
    const M = day.modes[mode], won = bbWon(mode), done = won.length >= 5;
    // the whole tile is the button: tap it to see that level's board zoomed in, then BACK or PLAY
    return `<button class="bbmode ${mode}" ${done ? "disabled" : `data-bbpreview="${mode}"`}>
      <h3>${mode === "hard" ? "HARDER" : "EASIER"}</h3>
      <div class="bbfacts"><span>🌬️ ${M.wind} mph</span><span>👝 ${M.bags.length} on the board</span><span>🎯 ${mode === "hard" ? "Tighter rings" : "Wider rings"}</span></div>
      <div class="bbtap">${done ? "CLEARED ✓" : "TAP TO LOOK 👀"}</div></button>`;
  };
  $("bbBody").innerHTML = `<h2>🎯 Bullseye Bags</h2>
    <div class="bbday"><small>A standard 27 ft court · a new view every day · the same for everyone</small></div>
    <div class="bbconds"><span>${w.icon} ${w.name}<small>${w.note || "No effect on the board"}</small></span><span>🪵 The board<small>${BB_SURF_WORDS[d.surf || 0]}</small></span><span>🟡 Golden Bag<small>Everyone throws the same bag</small></span></div>
    ${day.sunday ? `<div class="bbsunday">⛳ <b>HOLE-IN-ONE SUNDAY</b><small>${career.bags.includes("holeinone") ? "Sink the hole today for a bonus Golden Pop can too." : "Sink the hole today to win the exclusive Hole-in-One bag. You can't get it anywhere else."}</small></div>` : ""}
    <div class="bbstar">Finish in a ring to win it; the hole is the top prize. Only bags on the board count, and won rings are gone for the day. ⭐ Knock the <b>star bag</b> in for <b>double</b>.</div>
    <div class="bbmodes">${card("easy")}${card("hard")}</div>
    <div class="bbthrows">${free ? "🎁 Your free throw for today is ready." : extra ? `You have <b>${extra}</b> throw${extra > 1 ? "s" : ""} left.` : `Next free throw in <b id="bbCount">${timeText(bbUntilMidnight())}</b>`}</div>
    <div class="label center">${can ? "More throws" : "Buy more throws"}</div>
    ${bbBuyRow()}
    ${msg ? `<div class="muted center">${esc(msg)}</div>` : ""}
    <button class="btn" id="bbClose">CLOSE</button>`;
  for (const b of $("bbBody").querySelectorAll("[data-bbpreview]")) b.onclick = () => bbStart(b.dataset.bbpreview, true);
  bbWireBuy(m => renderBBSheet(m));
  $("bbClose").onclick = () => { $("bbSheet").hidden = true; renderBBBtn(); };
  $("bbSheet").hidden = false;
}
$("bbBtn").onclick = () => { initAudio(); renderBBSheet(); };
setInterval(() => { const c = $("bbCount"); if (c && !$("bbSheet").hidden) { if (bbCanPlay()) renderBBSheet(); else c.textContent = timeText(bbUntilMidnight()); } }, 1000);


// ───────────────────────── Bullseye Bags: a daily challenge at a giant cornhole board with a bullseye round the hole
// Everyone gets the same challenge each day (the scene, wind, weather, board and the bags already lying on the board all
// come from the date), and everyone throws the same Golden Bag. The board is laid out like a real one, just bigger: the
// hole sits near the back, and four coloured rings circle it, running off the back and sides of the board. Each ring and
// the hole is a prize; only a bag resting on the board counts. Win a ring and it's gone (plain wood) for the rest of the
// day, so later throws go after what's left. The hole is the top prize (a can that opens on the spot). Knock the star bag
// into the hole for double. Easy and Hard (tighter rings, farther, windier, more bags in the way). One free throw a day;
// more can be bought (1, 3 or 5). The board is a giant 5 x 10 ft board, a real board's 1:2 shape.
const BB_BOARD = { W: 5, L: 10, FH: 0.35, BH: 1.75, HR: 0.42, HOLE_Y: 8.125 }; // hole 9" from the back on a real board, scaled
const BB_SCENES = [
  { id: "bb_roof", name: "Rooftop Drop", sub: "Down from a roof to the plaza", dist: [20, 30], height: 30, surf: false },
  { id: "bb_field", name: "Long Bomb", sub: "All the way down the park", dist: [40, 58], height: 0, surf: false },
  { id: "bb_dock", name: "Dock Drop", sub: "Off the pier to a raft on the lake", dist: [24, 34], height: 10, surf: true },
  { id: "bb_cliff", name: "Cliff Toss", sub: "From the bluff down to the beach", dist: [26, 38], height: 40, surf: true },
];
// Weather changes the throw, not just the look. mu: board friction (lower slides farther); r: how much a landing keeps.
const BB_WEATHER = [
  { id: "sunny", name: "Sunny", icon: "☀️", w: 40, note: "" },
  { id: "cloudy", name: "Cloudy", icon: "☁️", w: 18, note: "" },
  { id: "rain", name: "Rain", icon: "🌧️", w: 16, note: "Wet board: bags slide farther", mu: 0.72, r: 0.06 },
  { id: "snow", name: "Snow", icon: "🌨️", w: 10, note: "Snowy board: bags stop short", mu: 1.35, r: -0.14, only: ["bb_roof", "bb_field"] },
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
const BB_RINGS = { easy: [3.1, 2.35, 1.65, 1.05], hard: [2.3, 1.75, 1.25, 0.82] };
const BB_CONSOLATION = { easy: 0.02, hard: 0.06 }; // on the board but in no ring (or a ring already won); off the board wins nothing
// Plain words for the day's board (what it does to a landing bag).
const BB_SURF_WORDS = { "-2": "Sticky: bags stop short", "-1": "Grippy: bags stop a bit short", "0": "Normal: bags slide a normal amount", "1": "Fast: bags slide farther", "2": "Slick: bags slide a long way" };
// Everyone throws the Golden Bag (a neutral bag with good stats), so nobody needs to know the shop's bags.
const BB_GOLDEN = { id: "bb_golden", name: "Golden Bag", c: "#ffc93a", pattern: "diamond", acc: 3, ctrl: 3, spin: 3, feel: "neutral" };
const BB_LOOKS = { grey: { id: "bb_grey", name: "Grey", c: "#9aa0aa", pattern: "plain" }, star: { id: "bb_star", name: "Star", c: "#8a4dff", pattern: "star" } };
const BB_STORE = ["bullseye.1", "bullseye.3", "bullseye.5"].map(PID);
const BB = { active: null, mesh: null, precip: null, starTag: null };

// ── The day's challenge
const bbDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function bbToday() {
  const key = bbDay();
  if (bbToday.cache && bbToday.cache.key === key) return bbToday.cache;
  let h = 2166136261; for (const ch of "bullseye:" + key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = rng(h >>> 0), pick = a => a[Math.floor(r() * a.length)];
  const scene = pick(BB_SCENES);
  const ws = BB_WEATHER.filter(w => !w.only || w.only.includes(scene.id));
  let x = r() * ws.reduce((t, w) => t + w.w, 0), weather = ws[0];
  for (const w of ws) { x -= w.w; if (x <= 0) { weather = w; break; } }
  const board = pick(BOARDS).id, windDir = r() * Math.PI * 2, gust = r();
  const modes = {};
  for (const m of ["easy", "hard"]) {
    const hard = m === "hard", L = BB_BOARD.L, HWb = BB_BOARD.W / 2, hole = { x: 0, y: BB_BOARD.HOLE_Y };
    // the star bag sits near the hole (knock it in for double); grey bags are scattered, never on the hole
    const bags = [], clear = p => Math.hypot(p.x - hole.x, p.y - hole.y) > 0.75 && p.y < L - 0.4 && bags.every(b => Math.hypot(b.x - p.x, b.y - p.y) > 0.7);
    for (let tries = 0; tries < 200; tries++) { const sa = Math.PI * (0.55 + r() * 0.9), sd = 0.75 + r() * 0.55, p = { x: Math.sin(sa) * sd, y: hole.y + Math.cos(sa) * sd, star: true, angle: r() * 6 }; if (clear(p)) { bags.push(p); break; } }
    for (let k = 0, tries = 0; k < (hard ? 4 : 1) && tries < 400; tries++) {
      const p = { x: (r() * 2 - 1) * (HWb - 0.45), y: 2 + r() * (L - 2.6), angle: r() * 6 };
      if (clear(p)) { bags.push(p); k++; }
    }
    modes[m] = { dist: Math.round(hard ? scene.dist[1] : scene.dist[0]), wind: Math.round(hard ? 4 + gust * 8 : gust * 5), bags };
  }
  return (bbToday.cache = { key, scene, weather, board, windDir, modes });
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
const bbUntilMidnight = () => { const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); return m - n; };
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
function bbStart(mode) {
  if (!bbCanPlay() || bbCleared(mode)) return;
  const day = bbToday(), M = day.modes[mode], sc = day.scene, L = BB_BOARD.L;
  if (!bbUseThrow()) return;
  initAudio();
  $("bbSheet").hidden = true; $("hub").hidden = true; document.body.classList.remove("inhub", "looking");
  BB.active = { mode, day, M, done: false };
  setCourt({ FY: M.dist, BY: M.dist + L, HW: BB_BOARD.W / 2, FH: BB_BOARD.FH, BH: BB_BOARD.BH, HR: BB_BOARD.HR, hole: { x: 0, y: M.dist + BB_BOARD.HOLE_Y }, rel: { h: sc.height + 3, y: 0.5, x: 0 } });
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
  targetBoard.visible = ownBoard.visible = false; teamCoolers.visible = false;
  buildVenue(sc.id);
  bbBuildBoard(d, mode, M); bbWeather(w);
  sun.target.position.set(0, 0, -HOLE.y); sun.position.z += 27 - HOLE.y; // shadows around the giant board
  setAmbience({ wind: M.wind, surf: sc.surf, crowd: false, night: false, fire: false });
  showBanner(mode === "hard" ? "Bullseye Bags · HARD" : "Bullseye Bags", 0);
  beginTurn();
  // aimed at the best prize still on the board to start, so the throw's path shows right away
  const won = bbWon(mode), R = BB_RINGS[mode], k = [3, 2, 1, 0].find(i => !won.includes(i)) ?? 3;
  const aim = !won.includes(4) ? { x: 0, y: HOLE.y } : { x: 0, y: HOLE.y - (R[k] + (R[k + 1] || BB_BOARD.HR)) / 2 }; // the front of the best ring left
  S.end = aim; refreshPlan(); ui();
}
// Today's prizes for a level: a colour dot, the prize, and a tick once won.
function bbPrizeRows(mode) {
  const won = bbWon(mode);
  return BB_PRIZES[mode].map((p, i) => `<div class="${won.includes(i) ? "won" : ""}"><i class="${p.hole ? "hole" : ""}" style="--c:${p.c}"></i><span>${p.name}</span><b>${won.includes(i) ? "✓ Won" : bbPrizeText(p)}</b></div>`).join("");
}
// The prize key: shown on the board screen while you pick your spot, gone once you start the throw.
function bbRenderLegend() {
  const el = $("bbLegend"), show = S.kind === "bullseye" && S.phase === "aiming" && !!BB.active;
  el.hidden = !show; if (!show) return;
  const mode = BB.active.mode;
  el.innerHTML = `<h4>Today's prizes <small>${5 - bbWon(mode).length} left</small></h4>${bbPrizeRows(mode)}<p>⭐ Star bag in the hole: <b>x2</b></p>`;
}
const markerScale = () => (S.kind === "bullseye" ? 2.2 : 1);
const bbPanelTag = () => BB.active ? `${esc(BB.active.day.scene.name)} · ${BB.active.mode === "hard" ? "Hard" : "Easy"}` : "";

// Back to the regular court (on the way back to the clubhouse, or before any match).
function bbExit() {
  if (BB.active && !BB.active.done && S.lastId == null) bbRefundThrow(); // never thrown: you keep the throw
  BB.active = null;
  if (BB.mesh) { scene.remove(BB.mesh); BB.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); }); BB.mesh = null; }
  if (BB.precip) { scene.remove(BB.precip.o); BB.precip.o.geometry.dispose(); BB.precip = null; }
  if (BB.starTag) { scene.remove(BB.starTag); BB.starTag = null; }
  if (S.kind !== "bullseye") return;
  setCourt(); S.kind = "career";
  targetBoard.visible = ownBoard.visible = true; teamCoolers.visible = true;
  sun.target.position.set(0, 0, -27);
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
  c.strokeStyle = edge; c.lineWidth = 0.22 * s; c.strokeRect(0.11 * s, 0.11 * s, w - 0.22 * s, h - 0.22 * s);
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
  c.strokeStyle = "#ffffff"; c.lineWidth = 0.07 * s;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(hx, hy, RR[i] * s, 0, 7); c.stroke(); }
  for (let i = 0; i < 4; i++) { // each ring's prize symbol on its front edge, where you can see it from the throw
    if (won.includes(i)) continue;
    glyph(P[i], hx, hy + (RR[i] + (RR[i + 1] || BB_BOARD.HR)) / 2 * s, Math.min(0.32, (RR[i] - (RR[i + 1] || BB_BOARD.HR)) * 0.45) * s);
  }
  if (!won.includes(4)) { // the hole: the top prize, ringed in its colour
    const hr = BB_BOARD.HR * s;
    c.fillStyle = "#ffffff"; c.beginPath(); c.arc(hx, hy, hr + 0.2 * s, 0, 7); c.fill();
    c.fillStyle = P[4].c; c.beginPath(); c.arc(hx, hy, hr + 0.15 * s, 0, 7); c.fill();
  }
  // the border on top of the rings, so the board's edge stays crisp where they run off it
  c.strokeStyle = edge; c.lineWidth = 0.22 * s; c.strokeRect(0.11 * s, 0.11 * s, w - 0.22 * s, h - 0.22 * s);
  c.fillStyle = edge; for (const [x, y] of [[0.4, 0.4], [BB_BOARD.W - 0.4, 0.4], [0.4, BB_BOARD.L - 0.4], [BB_BOARD.W - 0.4, BB_BOARD.L - 0.4]]) { c.beginPath(); c.arc(x * s, y * s, 0.16 * s, 0, 7); c.fill(); }
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
  const top = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.7 })]);
  top.castShadow = top.receiveShadow = true; tilt.add(top);
  const frame = std(d.a === "#ffffff" ? 0x1f3a6e : d.a);
  for (const [w, dd, x, z] of [[0.14, L, HW - 0.07, -L / 2], [0.14, L, -HW + 0.07, -L / 2], [2 * HW, 0.14, 0, -0.07], [2 * HW, 0.14, 0, -L + 0.07]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45, dd), frame); m.position.set(x, -0.22, z); m.castShadow = true; tilt.add(m);
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(HR, HR, 0.5, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x120c08, side: THREE.BackSide }));
  tube.position.set(0, -0.2, -(HOLE.y - FY)); tilt.add(tube);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(HR, 40), new THREE.MeshBasicMaterial({ color: 0x050302 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.42, -(HOLE.y - FY)); tilt.add(floor);
  const wood = std(0x9c6f3d);
  for (const x of [-HW + 0.3, HW - 0.3, 0]) add(g, box(0.25, BH - 0.25, 0.35), x, (BH - 0.25) / 2, -(L - 0.5)).material = wood;
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
    if (st && onSurface(st) && onBoard(st)) {
      if (!BB.starTag) BB.starTag = bbLabel("⭐ x2");
      BB.starTag.visible = true; BB.starTag.position.copy(W(st.x, st.y, plane(st.y) + 0.9 + 0.08 * Math.sin(S.time * 3)));
    } else if (BB.starTag) BB.starTag.visible = false;
  }
}
function bbLabel(text) {
  const tex = canvasTex(256, 96, (c, w, h) => {
    c.fillStyle = "rgba(10,20,38,.82)"; c.strokeStyle = "#ffc93a"; c.lineWidth = 6;
    c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 36); c.fill(); c.stroke();
    c.fillStyle = "#ffc93a"; c.font = "900 52px Arial Black, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, w / 2, h / 2 + 3);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.6, 0.6, 1); sp.renderOrder = 9; scene.add(sp); return sp;
}

// ── Cameras: a view over the board for aiming and watching, and one behind the thrower for the throw.
function bbCamera(mode, narrow) {
  const r = release(0), top = plane(HOLE.y);
  if (mode === "throw" || mode === "cpu") {
    // Like a match: the arrow and power ring near the bottom, the board up the screen. Up high (a roof, a cliff, a pier)
    // the camera sits over your head at the edge, looking down past the arrow to the board below.
    const high = handFloor() > 0, gz = handFloor();
    if (high) {
      const cy = r.z + 6, cz = r.y - 0.5; // court y of the camera
      const aB = Math.atan2(cy - top, HOLE.y - cz), aR = Math.atan2(cy - gz, r.y + 1 - cz), a = lerp(aB, aR, 0.42);
      tPos.set(r.x, cy, -cz); tLook.set(HOLE.x * 0.2, cy - 10 * Math.sin(a), -(cz + 10 * Math.cos(a)));
    } else { tPos.set(r.x, r.z + 3.4, -(r.y - 5.5)); tLook.set(lerp(r.x, HOLE.x, 0.45), lerp(gz, top, 0.45), -lerp(r.y, HOLE.y, 0.45)); }
    return { fov: narrow ? 50 : 42, k: 3 };
  }
  if (mode === "follow") {
    const b = S.world.bags.find(x => x.id === S.lastId);
    if (b) { tPos.set(b.x * 0.6, Math.max(top + 3.2, b.z * 0.7 + 2.6), -b.y + 7.5); tLook.set(b.x * 0.5, Math.max(0, b.z * 0.4), -b.y - 6); return { fov: narrow ? 50 : 42, k: 5 }; }
  }
  const mid = plane(FY + (BY - FY) * 0.62); // the whole board in view, the hole near the back
  tPos.set(0, mid + (narrow ? 17 : 13.5), -(FY - (narrow ? 4 : 3)));
  tLook.set(0, mid - 0.8, -(FY + (BY - FY) * 0.62));
  return { fov: narrow ? 56 : 46, k: 3 };
}

// ── After the throw: what it won
function bbFinish() {
  const A = BB.active; if (!A || A.done) return;
  A.done = true; bbState().used = null;
  const b = S.world.bags.find(x => x.id === S.lastId), hit = bbHit(b, A.mode);
  const star = S.world.bags.find(x => x.star), doubled = !!star && star.state === "inHole";
  const times = doubled ? 2 : 1, got = [];
  const p = typeof hit === "number" ? BB_PRIZES[A.mode][hit] : hit === "board" ? { coins: BB_CONSOLATION[A.mode] } : {};
  if (typeof hit === "number") bbWon(A.mode).push(hit); // that prize is gone for the rest of the day
  if (p.can) for (let k = 0; k < times; k++) { // the first can opens on the spot; a doubled second one goes in the cooler, locked
    const id = rollCan(p.can);
    if (k === 0) career.cans.push({ id, court: topCourt(), instant: true }); else stashCan({ id, court: topCourt() });
    got.push({ can: id, later: k > 0 });
  }
  else if (p.caps) { career.caps += p.caps * times; got.push({ caps: p.caps * times }); }
  else if (p.coins) { const n = bbCoins(p.coins) * times; career.coins += n; got.push({ coins: n }); }
  save(); S.phase = "bbdone"; ui();
  if (typeof hit === "number") { sfx.win(); haptic("success"); } else if (hit === "miss") sfx.thud();
  A.result = { hit, doubled, got };
  setTimeout(() => { if (BB.active === A) renderBBResult(); }, 900);
}
function renderBBResult() {
  const A = BB.active, R = A.result, can = R.got.find(g => g.can && !g.later), won = typeof R.hit === "number", P = won ? BB_PRIZES[A.mode][R.hit] : null;
  const prize = R.got.map(g => g.can ? `<div class="bbprize">🥫 <b>${esc(canById(g.can).name)}</b>${g.later ? "<small>In your cooler</small>" : ""}</div>` : g.caps ? `<div class="bbprize"><i class="bcap big"></i><b>${g.caps} caps</b></div>` : `<div class="bbprize"><i class="coin big"></i><b>${short(g.coins)}</b></div>`).join("");
  const left = 5 - bbWon(A.mode).length, level = A.mode === "hard" ? "Hard" : "Easy";
  $("bbBody").innerHTML = `<div class="lifebig">${won ? (P.hole ? "🎯" : "🏆") : R.hit === "miss" ? "💨" : "🙂"}</div>
    <h2>${won ? (P.hole ? "In the hole!" : `${P.name}!`) : R.hit === "miss" ? "Off the board" : "On the board"}</h2>
    ${R.doubled ? `<div class="bbdouble">⭐ You knocked the star bag in: <b>DOUBLE!</b></div>` : ""}
    <div class="bbprizes">${prize}</div>
    <div class="muted center">${can ? "Your can opens right now." : won ? "That prize is gone for today." : R.hit === "miss" ? "Only bags on the board count." : "A little something for landing on the board."}</div>
    <div class="bbstrip">${bbPrizeRows(A.mode)}</div>
    <div class="bbthrows">${left ? `${left} of 5 ${level} prizes left today.` : `You've won every ${level} prize today! 🎉`}</div>
    <button class="btn green go" id="bbCollect">${can ? "OPEN IT!" : "COLLECT"}</button>
    <div class="bbthrows">${bbCanPlay() ? `You have <b>${bbState().extra}</b> more throw${bbState().extra === 1 ? "" : "s"}. Collect, then tap Bullseye Bags to throw again.` : "Want another throw?"}</div>
    ${bbBuyRow()}`;
  $("bbSheet").hidden = false;
  bbWireBuy(() => renderBBResult());
  $("bbCollect").onclick = () => {
    $("bbSheet").hidden = true; openHub();
    if (can) { const i = career.cans.findIndex(c => c.instant && c.id === can.can); if (i >= 0) setTimeout(() => openCanSheet(i), 350); }
  };
}

// More throws: 1, 3 or 5 (in-app purchases). Shown on the Bullseye sheet and after every throw.
function bbBuyRow() {
  const price = id => storePrices[id] || STORE.find(x => x.id === id).price;
  return `<div class="bbbuy">${BB_STORE.map(id => { const it = STORE.find(x => x.id === id); return `<button class="btn blue" data-bbbuy="${id}" ${pendingBuy === id ? "disabled" : ""}><b>${it.throws}</b> throw${it.throws > 1 ? "s" : ""}<small>${pendingBuy === id ? "…" : price(id)}</small></button>`; }).join("")}</div>`;
}
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
    return `<div class="bbmode ${mode}">
      <h3>${mode === "hard" ? "HARD" : "EASY"}</h3>
      <div class="bbfacts"><span>📏 ${M.dist} ft</span><span>🌬️ ${M.wind} mph</span><span>🎯 ${mode === "hard" ? "Tight rings" : "Wide rings"}</span></div>
      <div class="bbdots">${BB_PRIZES[mode].map((p, i) => `<i class="${p.hole ? "hole" : ""} ${won.includes(i) ? "won" : ""}" style="--c:${p.c}"></i>`).join("")}</div>
      <div class="bbleft">${done ? "All 5 won today ✓" : `${5 - won.length} of 5 prizes left`}</div>
      <button class="btn ${mode === "hard" ? "red" : "green"}" data-bbmode="${mode}" ${can && !done ? "" : "disabled"}>${done ? "CLEARED ✓" : `PLAY ${mode === "hard" ? "HARD" : "EASY"}`}</button></div>`;
  };
  $("bbBody").innerHTML = `<h2>🎯 Bullseye Bags</h2>
    <div class="bbday"><b>${esc(day.scene.name)}</b><small>${esc(day.scene.sub)}${day.scene.height ? ` · ${day.scene.height} ft up` : ""}</small></div>
    <div class="bbconds"><span>${w.icon} ${w.name}<small>${w.note || "No effect on the board"}</small></span><span>🪵 The board<small>${BB_SURF_WORDS[d.surf || 0]}</small></span><span>🟡 Golden Bag<small>Everyone throws the same bag</small></span></div>
    <div class="bbstar">Finish in a ring to win it; the hole is the top prize. Only bags on the board count, and won rings are gone for the day. ⭐ Knock the <b>star bag</b> in for <b>double</b>.</div>
    <div class="bbmodes">${card("easy")}${card("hard")}</div>
    <div class="bbthrows">${free ? "🎁 Your free throw for today is ready." : extra ? `You have <b>${extra}</b> throw${extra > 1 ? "s" : ""} left.` : `Next free throw in <b id="bbCount">${timeText(bbUntilMidnight())}</b>`}</div>
    <div class="label center">${can ? "More throws" : "Buy more throws"}</div>
    ${bbBuyRow()}
    ${msg ? `<div class="muted center">${esc(msg)}</div>` : ""}
    ${testing() ? `<button class="linkbtn" id="bbTest">🧪 +5 throws</button>` : ""}
    <button class="btn" id="bbClose">CLOSE</button>`;
  for (const b of $("bbBody").querySelectorAll("[data-bbmode]")) b.onclick = () => bbStart(b.dataset.bbmode);
  bbWireBuy(m => renderBBSheet(m));
  if ($("bbTest")) $("bbTest").onclick = () => { bbState().extra += 5; save(); renderBBSheet(); renderBBBtn(); };
  $("bbClose").onclick = () => { $("bbSheet").hidden = true; renderBBBtn(); };
  $("bbSheet").hidden = false;
}
$("bbBtn").onclick = () => { initAudio(); renderBBSheet(); };
setInterval(() => { const c = $("bbCount"); if (c && !$("bbSheet").hidden) { if (bbCanPlay()) renderBBSheet(); else c.textContent = timeText(bbUntilMidnight()); } }, 1000);

// ── Scenes (court feet → three.js: x across, y up, -z down-range; you throw from z ≈ 0 toward -z)
function bbScene(id, g) {
  const r = rng(id.length * 977 + 13);
  if (id === "bb_roof") {
    // You're on a roof 30 ft up; the giant board is down in a paved plaza, with the street and towers around it.
    const facade = dayWindowTex(); facade.wrapS = facade.wrapT = THREE.RepeatWrapping; facade.repeat.set(8, 3);
    add(g, box(70, 30, 56, new THREE.MeshLambertMaterial({ map: facade, color: 0xe8e2d6 })), 0, 15, 26.5, false); // its front edge is right at your toes
    const deckTex = groundTexture("roof"); deckTex.repeat.set(70 / 14, 56 / 14);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(70, 56), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.9, color: 0xe8e8ec })); deck.rotation.x = -Math.PI / 2; deck.position.set(0, 30.02, 26.5); deck.receiveShadow = true; g.add(deck);
    const ledge = std(0x8a8c94);
    for (const [x, z, w, d, h] of [[0, -1.3, 70, 0.4, 0.35], [-34.6, 26.5, 0.8, 56, 3], [34.6, 26.5, 0.8, 56, 3]]) add(g, box(w, h, d, ledge), x, 30 + h / 2, z);
    add(g, box(6, 5, 6, std(0x6a6e78)), -20, 32.5, 12); add(g, box(4, 3, 8, std(0x9aa0aa)), 18, 31.5, 20); // stair hut, AC unit
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), lam(0xd8d0c2)); plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0, -45); plaza.receiveShadow = true; g.add(plaza);
    for (let z = -5; z > -115; z -= 7) { const l = new THREE.Mesh(new THREE.PlaneGeometry(140, 0.25), lam(0xc4bcae)); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.01, z); g.add(l); } // paving joints
    const road = new THREE.Mesh(new THREE.PlaneGeometry(600, 40), lam(0x4a4c52)); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, -135); g.add(road);
    for (let x = -280; x < 280; x += 16) { const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.5), lam(0xffffff)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, -135); g.add(m); }
    const CC = [0xc8102e, 0x1f3a6e, 0xf2f2f2, 0x222222, 0x9aa4b2, 0x2f86ff, 0xffc93a];
    for (let x = -200; x < 200; x += 18 + r() * 30) car(g, x, -135 + (r() < 0.5 ? -9 : 9), Math.PI / 2 * (r() < 0.5 ? 1 : -1), CC[Math.floor(r() * CC.length)], r() < 0.3 ? "suv" : "sedan");
    for (const [x, z] of [[-30, -20], [30, -20], [-30, -60], [30, -60], [-30, -95], [30, -95]]) { add(g, box(6, 2, 6, std(0x9a8f80)), x, 1, z); loadBlender("tree_maple").then(src => { if (!src || venueGroup !== g) return; const t = src.clone(); t.position.set(x, 2, z); t.scale.setScalar(0.7); g.add(t); }); }
    for (let k = 0; k < 8; k++) person(g, (r() < 0.5 ? -1 : 1) * (14 + r() * 12), -15 - r() * 80, r() * 6.28, 9100 + k, r() < 0.3 ? "cheer" : "stand");
    for (let k = 0; k < 14; k++) { const sx = k % 2 ? 1 : -1; dayTower(g, sx * (75 + r() * 40), 20 - Math.floor(k / 2) * 38, 30 + r() * 16, 40 + r() * 90, 9200 + k); }
    for (let k = 0; k < 9; k++) dayTower(g, -160 + k * 40 + r() * 10, -175 - r() * 30, 30 + r() * 14, 50 + r() * 140, 9300 + k);
    for (const sx of [-1, 1]) dayTower(g, sx * 50, 28, 30, 42, 9400 + sx); // the neighbours either side of your roof
  } else if (id === "bb_field") {
    // A long park lawn: mowing stripes, yard lines every 10 ft, a little stand behind the board, trees all round.
    stylizedLawn(g, 700, 4401);
    for (let z = 10; z > -120; z -= 10) { const st = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), lam(0x86cc68, { transparent: true, opacity: 0.35 })); st.rotation.x = -Math.PI / 2; st.position.set(0, 0.02, z); g.add(st); }
    for (let d = 10; d <= 70; d += 10) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(26, 0.3), lam(0xffffff)); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.03, -d); g.add(l);
      const tag = canvasTex(128, 64, (c, w, h) => { c.fillStyle = "#fff"; c.font = "900 44px Arial Black, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(d), w / 2, h / 2); });
      for (const sx of [-1, 1]) { const n = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: tag, transparent: true })); n.rotation.x = -Math.PI / 2; n.position.set(sx * 10, 0.04, -d + 1.2); g.add(n); }
    }
    bleachers(g, 0, -96, 0, 50, 6, 4402);
    for (let k = 0; k < 10; k++) person(g, -20 + k * 4.4 + r(), -92 - (k % 3) * 2.5, 0, 4410 + k, k % 3 === 0 ? "cheer" : "sit");
    for (const sx of [-1, 1]) { const goal = std(0xffffff); add(g, box(0.3, 8, 0.3, goal), sx * 12, 4, -118); } add(g, box(24.3, 0.3, 0.3, std(0xffffff)), 0, 8, -118);
    for (const [x, z] of [[-26, -30], [26, -45], [-28, -70], [27, -15]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 8), std(0x2f86ff)); add(g, t, x, 1.5, z); }
    treeRing(g, 4403, 75, 220, 110, ["tree_oak", "tree_maple", "pine", "tree_oak"], (x, z) => Math.abs(x) < 34 && z > -150 && z < 40);
    for (let z = 20; z > -140; z -= 14 + r() * 8) for (const sx of [-1, 1]) loadBlender(r() < 0.5 ? "tree_oak" : "tree_maple").then(src => { if (!src || venueGroup !== g) return; const t = src.clone(); t.position.set(sx * (38 + r() * 14), 0, z); t.scale.setScalar(1.1 + r() * 0.5); g.add(t); });
  } else if (id === "bb_dock") {
    // A long pier 10 ft over a lake; the board floats on a raft out on the water. Pines and cabins on the far shore.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x3a8fb8, roughness: 0.18, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.05, -300); water.receiveShadow = true; g.add(water);
    const wood = std(0x8a6a48), dark = std(0x5a4430);
    add(g, box(9, 0.6, 42.5, wood), 0, 9.7, 19.75); // the end of the pier is right at your toes
    for (let z = -1; z <= 40; z += 6) for (const sx of [-4, 4]) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 11, 8), dark), sx, 4.5, z);
    for (const sx of [-4.3, 4.3]) { add(g, box(0.2, 0.2, 42, wood), sx, 12.6, 20); for (let z = 0; z <= 40; z += 4) add(g, box(0.25, 3, 0.25, wood), sx, 11.3, z); }
    add(g, box(14, 0.9, 13, std(0x9a7550)), 0, -0.4, -(FY + 3.5)); // the raft under the board
    for (const [x, z] of [[-6, -1], [6, -1], [-6, -6], [6, -6]]) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 12), std(0xe8e8ee)), x, -0.4, -(FY + 3.5) + z + 3);
    const land = new THREE.Mesh(new THREE.PlaneGeometry(1600, 400), lam(0x5f9a48)); land.rotation.x = -Math.PI / 2; land.position.set(0, 0.2, 120); g.add(land); // the shore behind you
    for (let k = 0; k < 120; k++) { const a = -Math.PI / 2 + r() * Math.PI, d = 230 + r() * 120; pine(g, Math.sin(a) * d * 1.4, -60 - Math.abs(Math.cos(a)) * d, 2 + r() * 1.5, false); }
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(1600, 300), lam(0x5a8f44)); shore.rotation.x = -Math.PI / 2; shore.position.set(0, 0.1, -420); g.add(shore);
    for (let k = 0; k < 40; k++) pine(g, (r() - 0.5) * 300, 40 + r() * 80, 1.6 + r() * 1.4, false);
    for (let k = 0; k < 3; k++) person(g, (r() < 0.5 ? -2 : 2.5), 8 + k * 7, Math.PI, 9500 + k, "cheer").position.y = 10;
  } else if (id === "bb_cliff") {
    // A sandstone bluff 40 ft over a beach; the board is on the sand, the sea beyond it, palms along the sides.
    const rock = lam(0xb98a5e), rock2 = lam(0xa0744c);
    add(g, box(120, 40, 70, rock), 0, 20, 33.5, false); // the edge of the bluff is right at your toes
    for (let k = 0; k < 16; k++) { const h = 6 + r() * 16; add(g, box(6 + r() * 10, h, 4 + r() * 4, k % 2 ? rock : rock2), -60 + k * 8 + r() * 3, h / 2, -2.5 - r() * 2, false); } // rocks piled at the foot
    const topsoil = new THREE.Mesh(new THREE.PlaneGeometry(120, 70), lam(0x8aa860)); topsoil.rotation.x = -Math.PI / 2; topsoil.position.set(0, 40.03, 33.5); g.add(topsoil);
    const sandTex = groundTexture("sand"); sandTex.repeat.set(40, 40);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(600, 200), new THREE.MeshStandardMaterial({ map: sandTex, color: 0xf2e2bc, roughness: 1 })); sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, -60); sand.receiveShadow = true; g.add(sand);
    ocean(g);
    for (let k = 0; k < 18; k++) { const sx = k % 2 ? 1 : -1; blenderPalm(g, sx * (22 + r() * 30), 0, -10 - Math.floor(k / 2) * 9 - r() * 4, 9600 + k, 0.9 + r() * 0.4); }
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) add(g, box(14 + r() * 10, 20 + r() * 25, 30, k % 2 ? rock : rock2), sx * (64 + k * 6), 15, 5 - k * 22, false);
    for (let k = 0; k < 6; k++) person(g, (r() < 0.5 ? -1 : 1) * (12 + r() * 10), -18 - r() * 40, r() * 6.28, 9700 + k, r() < 0.4 ? "cheer" : "stand");
    // a busy beach below: umbrellas and loungers down both sides, towels, surfboards, a lifeguard tower by the water
    const SETS = [["#ff4b3a", "#ffffff"], ["#2f86ff", "#ffffff"], ["#ffc93a", "#ff6a3d"], ["#2fbf71", "#ffffff"]];
    for (const [sx, si] of [[-1, 0], [1, 1], [-1, 2], [1, 3]]) {
      const x0 = sx * (si < 2 ? 14 : 24), ums = [], lng = [];
      for (let z = -8; z > -76; z -= 10) { if (r() < 0.15) continue; ums.push([x0, z, r() * 6]); lng.push([x0 + sx * 2.6, z + 1.8, sx < 0 ? Math.PI / 2 : -Math.PI / 2]); }
      umbrellaRow(g, ums, SETS[si]); loungerRow(g, lng, [0x2f86ff, 0xffffff, 0xffc93a, 0x2fbf71][si]);
    }
    for (let k = 0; k < 8; k++) towel(g, (r() < 0.5 ? -1 : 1) * (9 + r() * 4), -12 - r() * 58, r() * 0.6 - 0.3, [SETS[k % 4][0], "#ffffff"]);
    surfboard(g, 10, -60, 0.4, 0xff6a3d, 0xffffff); surfboard(g, -11, -66, -0.3, 0x2fd0c8, 0xffc93a);
    lifeguardTower(g, 18, -74, Math.PI); lifeguardTower(g, -130, -76, Math.PI);
    for (let k = 0; k < 8; k++) person(g, (r() < 0.5 ? -1 : 1) * (16 + r() * 14), -20 - r() * 50, r() * 6.28, 9720 + k, ["sit", "stand", "cheer"][k % 3]);
    for (let k = 0; k < 6; k++) { const p = person(g, -40 + r() * 80, -88 - r() * 14, r() * 6.28, 9740 + k, "stand"); p.position.y = -2.5; } // out in the waves
  }
}
Object.assign(VENUE_LOOK, {
  bb_roof: VENUE_LOOK.tailgate, bb_field: VENUE_LOOK.bonfire, bb_dock: VENUE_LOOK.lakeside || VENUE_LOOK.island, bb_cliff: VENUE_LOOK.beach,
});

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// ───────────────────────── Helpers
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
// Court feet (x lateral, y down-range, z up) -> three.js world (y up, down-range is -z).
const W = (x, y, z) => new THREE.Vector3(x, z, -y);
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shade(hex, amt) { // lighten (amt > 0) or darken (amt < 0) a #rrggbb colour
  const n = parseInt(hex.slice(1), 16), f = c => Math.round(clamp(amt > 0 ? c + (255 - c) * amt : c * (1 + amt), 0, 255));
  return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, "0")).join("");
}

// ───────────────────────── Career content
// Every venue is a new location. Higher venues: stronger steady wind, faster arrow, smaller sweet spot, slicker boards, better opponents.
const VENUES = [
  { id: "backyard", name: "Backyard", sub: "Where it all starts", stars: 0, fee: 0, prize: 60, swing: 0.35, zone: 0.14, cpu: [0.42, 0.30], mu: 0.35, wind: [0, 3], speed: "Normal boards" },
  { id: "tailgate", name: "Tailgate Lot", sub: "Game-day parking lot", stars: 12, fee: 150, prize: 350, swing: 0.45, zone: 0.115, cpu: [0.32, 0.21], mu: 0.33, wind: [2, 6], speed: "Normal boards" },
  { id: "beach", name: "Beach Bar", sub: "Sea breeze and sandy boards", stars: 30, fee: 500, prize: 1100, swing: 0.55, zone: 0.095, cpu: [0.23, 0.15], mu: 0.40, wind: [4, 10], speed: "Grippy boards" },
  { id: "brewery", name: "Brewery Patio", sub: "League night under the lights", stars: 60, fee: 1400, prize: 3000, swing: 0.66, zone: 0.078, cpu: [0.16, 0.10], mu: 0.30, wind: [6, 13], speed: "Slick boards" },
  { id: "stadium", name: "Stadium Finals", sub: "The big show", stars: 100, fee: 4000, prize: 9000, swing: 0.8, zone: 0.062, cpu: [0.11, 0.06], mu: 0.28, wind: [8, 16], speed: "Fast pro boards" },
];
const BAGS = [
  { id: "starter", name: "Duck Cloth", price: 0, acc: 1, ctrl: 1, spin: 1, feel: "neutral", c: "#ff4b3a", pattern: "plain" },
  { id: "backyard", name: "Backyard Pro", price: 300, acc: 2, ctrl: 2, spin: 1, feel: "neutral", c: "#ff8a1f", pattern: "stripe" },
  { id: "sticky", name: "Sticky Fingers", price: 800, acc: 2, ctrl: 3, spin: 2, feel: "sticky", c: "#2fbf71", pattern: "dots" },
  { id: "slick", name: "Slick Rick", price: 800, acc: 3, ctrl: 2, spin: 2, feel: "fast", c: "#a24bff", pattern: "chevron" },
  { id: "twister", name: "Twister", price: 2200, acc: 3, ctrl: 3, spin: 5, feel: "neutral", c: "#00b8c8", pattern: "swirl" },
  { id: "laser", name: "Laser", price: 5000, acc: 5, ctrl: 4, spin: 3, feel: "fast", c: "#ff2e88", pattern: "bolt" },
  { id: "gold", name: "Gold Standard", price: 12000, acc: 5, ctrl: 5, spin: 5, feel: "neutral", c: "#f2b705", pattern: "star" },
];
// Opponents and the second local player use these.
const RIVAL_BAGS = [
  { id: "rival", name: "Blue Duck", acc: 1, ctrl: 1, spin: 1, feel: "neutral", c: "#2f86ff", pattern: "plain" },
  { id: "rival2", name: "Navy Stripe", acc: 2, ctrl: 2, spin: 2, feel: "neutral", c: "#2456c9", pattern: "stripe" },
  { id: "rival3", name: "Teal Twist", acc: 3, ctrl: 3, spin: 3, feel: "fast", c: "#0f9fb5", pattern: "swirl" },
];
const BOARDS = [
  { id: "classic", name: "Classic Navy", price: 0, paint: "band", a: "#1f3a6e", b: "#ffc93a" },
  { id: "stripes", name: "Stars & Stripes", price: 400, paint: "stripes", a: "#c8102e", b: "#ffffff", c: "#1f3a6e" },
  { id: "sunset", name: "Sunset Fade", price: 900, paint: "fade", a: "#ff7a3a", b: "#a83279" },
  { id: "checker", name: "Checkered Flag", price: 1600, paint: "checker", a: "#111111", b: "#ffffff" },
  { id: "waves", name: "Ocean Waves", price: 2500, paint: "waves", a: "#0b74c9", b: "#7fd8ff" },
  { id: "goldpro", name: "Gold Pro", price: 8000, paint: "gold", a: "#151515", b: "#ffd84a" },
];
const OPPONENTS = ["Backyard Bob", "Dirt Bag Dave", "Tailgate Tina", "Sandy Shores", "Big Earl", "Hops Hannah", "Slider Sam", "Airmail Annie",
  "The Professor", "Lefty Lou", "Swish Rodriguez", "Cornelius", "Four-Bag Fran", "Kernel Sanders", "Woody", "Blocker Betty"];
const FEEL = { sticky: { label: "Sticky", slide: 0.86 }, neutral: { label: "Neutral", slide: 1 }, fast: { label: "Fast", slide: 1.14 } };

// ───────────────────────── Saved career (this device only)
const SAVE_KEY = "backyard-cornhole.career.v1";
const fresh = () => ({ coins: 250, stars: 0, unlocked: ["backyard"], bags: ["starter"], bag: "starter", boards: ["classic"], board: "classic", venue: 0, wins: 0, losses: 0 });
// Inside the iPhone app, the native side injects the saved career and stores updates; in a browser, localStorage does.
const nativeBridge = (() => { try { return window.webkit && window.webkit.messageHandlers; } catch (e) { return null; } })();
function postNative(name, body) { try { if (nativeBridge && nativeBridge[name]) nativeBridge[name].postMessage(body); } catch (e) { /* not in the app */ } }
const haptic = kind => postNative("haptic", kind);
let career = fresh();
try {
  const raw = window.__nativeCareer || localStorage.getItem(SAVE_KEY);
  if (raw) career = { ...fresh(), ...(typeof raw === "string" ? JSON.parse(raw) : raw) };
} catch (e) { /* storage unavailable: play without saving */ }
function save() {
  const json = JSON.stringify(career);
  postNative("save", json);
  try { localStorage.setItem(SAVE_KEY, json); } catch (e) { /* ignore */ }
}
const bagById = id => BAGS.find(b => b.id === id) || RIVAL_BAGS.find(b => b.id === id) || BAGS[0];
const boardById = id => BOARDS.find(b => b.id === id) || BOARDS[0];
const venueUnlocked = i => career.unlocked.includes(VENUES[i].id);

// ───────────────────────── Game state
const S = {
  kind: "career", venue: 0, opponent: null, names: ["You", "CPU"], gear: [BAGS[0], RIVAL_BAGS[0]], cpuSide: 1,
  world: new World(), scores: [0, 0], inning: 1, thrown: [0, 0], player: 0, leader: 0, phase: "hub",
  landing: null, end: null, landD: null, landPhi: 0, plan: null, ideal: null, prev: null,
  errors: { dir: 0, pow: 0, ht: 0 }, feedback: [], perfect: false, overdrive: false, lastId: null, cpuT: 0, cpuPlan: null,
  saved: {}, settleT: 0, acc: 0, push: null, time: 0, relT: 99, banner: null, bannerT: 0, lastInning: null, winner: null,
  pull: { active: false, startY: 0, fill: 0, raw: 0, phase: 0, swing: 0 }, planVersion: 0, wind: { mph: 0, dir: 0 }, fourBagger: [false, false],
  result: null, introT: 0,
};
globalThis.S = S; // the engine's what-if simulation reads the board from here
const isCPU = p => S.kind === "career" && p === 1;
const canEdit = () => S.phase === "aiming" && !isCPU(S.player);
const venue = () => VENUES[S.venue];
const POWER_TARGET = 0.75;
const COL = { p: ["#ff4b3a", "#2f86ff"], pd: [], pl: [], gold: "#ffc93a", go: "#3ee07a" };
function setTeamColors() {
  COL.p = [S.gear[0].c, S.gear[1].c];
  COL.pd = COL.p.map(c => shade(c, -0.35));
  COL.pl = COL.p.map(c => shade(c, 0.35));
  for (const p of [0, 1]) {
    const card = $("card" + p);
    card.style.background = `linear-gradient(${COL.pl[p]}, ${COL.p[p]} 55%, ${COL.pd[p]})`;
  }
}
// Difficulty for whoever is throwing: venue sets the base, their bag improves it.
function lv() {
  const v = venue(), g = S.gear[S.player];
  return {
    freq: v.swing * (1 - 0.06 * (g.acc - 1)),
    zone: v.zone * (1 + 0.15 * (g.acc - 1)),
    powZone: v.zone * 2 * (1 + 0.15 * (g.ctrl - 1)),
    wobble: (0.012 + 0.009 * S.venue) * (1 - 0.15 * (g.ctrl - 1)),
    cpu: S.opponent ? S.opponent.skill : 0.25,
    preview: true,
  };
}
function setGear(pl) {
  const g = S.gear[pl];
  CUR.spinMul = 0.8 + 0.15 * (g.spin - 1);
  CUR.slideMul = FEEL[g.feel].slide;
}

// ───────────────────────── Match flow
function newWind() {
  const [lo, hi] = venue().wind;
  S.wind = { mph: Math.round(rand(lo, hi)), dir: rand(0, Math.PI * 2) }; // steady for the whole inning, any direction
}
function windAccel() {
  const a = S.wind.mph * WIND_ACCEL_PER_MPH;
  return { x: Math.sin(S.wind.dir) * a, y: Math.cos(S.wind.dir) * a };
}
function startMatch(kind, vi) {
  const v = VENUES[vi];
  if (kind === "career") {
    if (career.coins < v.fee) return;
    career.coins -= v.fee; career.venue = vi; save();
    const [hi, lo] = v.cpu, skill = rand(lo, hi);
    S.opponent = { name: OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)], skill, rating: 1 + Math.round((hi - skill) / Math.max(1e-6, hi - lo) * 2) };
    S.names = ["You", S.opponent.name];
    S.gear = [bagById(career.bag), RIVAL_BAGS[Math.min(2, Math.floor(vi / 2))]];
  } else {
    S.opponent = null;
    S.names = ["Player 1", "Player 2"];
    S.gear = [bagById(career.bag), RIVAL_BAGS[0]];
  }
  S.kind = kind; S.venue = vi;
  // Coin flip for pitcher's boxes: who throws from the left and who from the right.
  const flip = Math.random() < 0.5 ? 1 : -1;
  SIDES[0] = -flip; SIDES[1] = flip;
  T.mu = v.mu;
  S.world = new World(); S.scores = [0, 0]; S.inning = 1; S.thrown = [0, 0]; S.leader = Math.random() < 0.5 ? 0 : 1; S.player = S.leader;
  S.saved = {}; S.lastInning = null; S.winner = null; S.feedback = []; S.lastId = null; S.relT = 99; S.result = null; S.fourBagger = [false, false];
  setTeamColors(); clearBagMeshes(); setBoardDesign(career.board); buildVenue(v.id); newWind();
  $("hub").hidden = true; document.body.classList.remove("inhub");
  showBanner(`${S.names[S.leader] === "You" ? "You throw" : esc(S.names[S.leader]) + " throws"} first`, S.leader);
  S.introT = 0;
  beginTurn();
  const side = SIDES[0] < 0 ? "LEFT" : "RIGHT";
  setTimeout(() => { if (S.phase !== "hub") showBanner(`${S.kind === "career" ? "You're" : "Player 1 is"} in the ${side} box`, 0); }, 1700);
}
const DEFAULT_SLIDE = 1.5;
function refreshPlan() {
  setGear(S.player);
  S.plan = S.end ? planThrow(S.player, S.end, S.landD ?? DEFAULT_SLIDE, S.landPhi || 0) : null;
  S.planVersion++;
  if (!S.plan) { S.landing = S.ideal = S.prev = null; S.push = null; return; }
  S.landD = S.plan.D; S.landPhi = S.plan.phi;
  S.landing = S.plan.landing; S.ideal = S.plan.ideal;
  S.prev = simulate(S.ideal, S.player);
  S.push = null;
  if (S.prev.own && S.landD > 0.1) {
    const base = S.ideal, t = solvePush(base, S.landing, S.end, S.player, S.prev.own, false);
    if (t) { S.push = { extra: t.speed / base.speed - 1 }; S.ideal = t; S.prev = simulate(t, S.player); }
  }
}
let dragging = null, pendingDrag = null;
function moveMarker(kind, p) {
  if (!canEdit()) return;
  if (kind === "end") {
    S.end = { x: clamp(p.x, -1.8, 1.8), y: clamp(p.y, FY + 0.2, BY + 0.25) };
  } else if (S.plan) {
    const v = { x: p.x - S.end.x, y: p.y - S.end.y };
    S.landD = Math.hypot(v.x, v.y); S.landPhi = wrap(heading(v) - heading(S.plan.z.back));
  }
  refreshPlan(); ui();
}
function grabsLanding(p) {
  if (!S.plan || !S.landing || dist(p, S.end) <= 0.3) return false;
  if (dist(p, S.landing) < 0.55) return true;
  const z = S.plan.z, v = { x: p.x - S.end.x, y: p.y - S.end.y }, D = Math.hypot(v.x, v.y);
  return D >= z.Dmin - 0.25 && D <= z.Dmax + 0.3 && Math.abs(wrap(heading(v) - heading(z.back))) <= maxPhi(D) + 0.12;
}
function beginTurn() {
  S.cpuPlan = null;
  setGear(S.player);
  if (isCPU(S.player)) { S.landing = S.end = S.ideal = S.prev = S.plan = null; S.planVersion++; S.cpuT = 0; S.phase = "cpu"; }
  else {
    const s = S.saved[S.player]; S.end = s ? s[0] : null; S.landD = s ? s[1] : null; S.landPhi = s ? s[2] : 0;
    S.phase = "aiming"; refreshPlan();
  }
  ui();
}
function beginThrow() {
  if (!canEdit() || !S.ideal) return;
  S.saved[S.player] = [S.end, S.landD, S.landPhi];
  S.errors = { dir: 0, pow: 0, ht: 0 };
  S.pull = { active: false, startY: 0, fill: 0, raw: 0, phase: 0, swing: 0 };
  S.phase = "throw"; sfx.tick(); haptic("tap"); ui();
}
// One move: the pull sets the power, the swinging arrow sets the direction; overdrive makes both wild.
function updatePull(dt) {
  const p = S.pull, L = lv();
  if (!p.active) return;
  p.fill = clamp(p.raw + Math.sin(S.time * 11) * L.wobble * Math.min(1, p.raw * 4), 0, 1.25);
  const over = p.fill > 1;
  const speed = (0.35 + 0.65 * Math.min(p.fill / POWER_TARGET, 1.6)) * (over ? 1.9 : 1);
  p.phase += dt * L.freq * speed; // cycles
  const ph = p.phase % 1; // triangle wave: steady sweep left and right
  p.swing = ph < 0.25 ? ph * 4 : ph < 0.75 ? 2 - ph * 4 : ph * 4 - 4;
  if (over) p.swing *= 1.3;
}
function releasePull() {
  const p = S.pull, L = lv();
  p.active = false;
  if (p.fill < 0.1) { updateHUD(); return; } // a tap, not a pull
  const over = p.fill > 1;
  const pow = clamp((p.fill - POWER_TARGET) / 0.5, -1, 1);
  S.errors = {
    dir: clamp(p.swing, -1.3, 1.3),
    pow: Math.abs(pow) <= L.powZone ? 0 : pow,
    ht: over ? rand(-0.9, 0.9) : 0,
  };
  S.overdrive = over;
  releaseBag(S.errors);
}
function releaseBag(e) {
  if (!S.ideal) return;
  setGear(S.player);
  const actual = applyErrors(e, S.ideal, lv());
  if (S.overdrive) actual.az += (e.dir - clamp(e.dir, -1, 1)) * MAX_DIR; // overdrive can swing past the normal limit
  actual.wind = windAccel();
  S.feedback = [
    { title: "Direction", text: grade(e.dir, METERS[0], lv()) },
    { title: "Strength", text: grade(e.pow, METERS[1], lv()) },
  ];
  if (S.overdrive) S.feedback.push({ title: "Overdrive", text: "Wild!" });
  S.perfect = !S.overdrive && S.feedback.every(f => f.text === "Perfect");
  S.lastId = S.world.launch(actual, S.player);
  S.thrown[S.player]++; S.settleT = 0; S.acc = 0; S.relT = 0; S.phase = "flight"; sfx.whoosh(); haptic("release");
  if (S.overdrive) showBanner("OVERDRIVE!", S.player); else if (S.perfect) showBanner("PERFECT!", S.player);
  ui();
}
function endTurn() {
  if (S.thrown[0] >= 4 && S.thrown[1] >= 4) { finishInning(); return; }
  const other = 1 - S.player; if (S.thrown[other] < 4) S.player = other;
  beginTurn();
}
function inningResult() {
  const hole = [0, 0], on = [0, 0];
  for (const b of S.world.bags) { const p = bagPoints(b); if (p === 3) hole[b.owner]++; else if (p === 1) on[b.owner]++; }
  const raw = [hole[0] * 3 + on[0], hole[1] * 3 + on[1]];
  const winner = raw[0] === raw[1] ? null : (raw[0] > raw[1] ? 0 : 1);
  return { hole, on, raw, winner, awarded: Math.abs(raw[0] - raw[1]) };
}
function finishInning() {
  const r = inningResult(); S.lastInning = r;
  if (r.winner !== null) { S.scores[r.winner] += r.awarded; S.leader = r.winner; }
  const best = S.scores[0] >= S.scores[1] ? 0 : 1;
  if (S.scores[best] >= 21) { S.winner = best; S.phase = "over"; finishMatch(); } else S.phase = "inning";
  ui();
}
function finishMatch() {
  sfx.hole();
  if (S.kind !== "career") { S.result = null; return; }
  const v = venue(), won = S.winner === 0, before = career.stars;
  const starDelta = won ? 3 + S.venue : -(1 + S.venue);
  const coins = won ? v.prize : 0;
  career.stars = Math.max(0, career.stars + starDelta);
  career.coins += coins;
  if (won) career.wins++; else career.losses++;
  const newly = VENUES.filter(x => career.stars >= x.stars && !career.unlocked.includes(x.id));
  for (const x of newly) career.unlocked.push(x.id);
  save();
  S.result = { won, starDelta: career.stars - before, coins, newly: newly.map(x => x.name) };
}
function nextInning() {
  S.world.clear(); clearBagMeshes(); S.inning++; S.thrown = [0, 0]; S.player = S.leader; S.feedback = []; S.fourBagger = [false, false];
  newWind(); beginTurn();
}
function showBanner(text, pl) { S.banner = { text, pl }; S.bannerT = 1.7; renderBanner(); }
function checkFourBagger() {
  for (const p of [0, 1]) {
    if (S.fourBagger[p]) continue;
    const inHole = S.world.bags.filter(b => b.owner === p && b.state === "inHole").length;
    if (inHole >= 4) {
      S.fourBagger[p] = true;
      fourBagger(p);
      if (S.kind === "career" && p === 0) { career.coins += 100; save(); }
    }
  }
}
function handleEvents(evts) {
  for (const e of evts) {
    if (e.type === "swish") { showBanner("SWISH!", e.bag.owner); sfx.hole(); haptic("success"); confetti(e.bag.owner); }
    else if (e.type === "drop") { showBanner(e.bag.id === S.lastId ? "CORNHOLE!" : "KNOCKED IN!", e.bag.owner); sfx.hole(); haptic("success"); confetti(e.bag.owner); }
    else if (e.type === "land") { sfx.thud(); haptic("thud"); dust(e.bag, groundDust()); squash(e.bag.id); }
    else if (e.type === "hit") { sfx.thud(); haptic("light"); }
    else if (e.type === "ground") { dust(e.bag, groundDust()); if (e.bag.id === S.lastId) showBanner("Off the board", e.bag.owner); }
    else if (e.type === "off") showBanner(e.bag.id === S.lastId ? "Slid off" : "Knocked off!", e.bag.owner);
  }
  if (evts.some(e => e.type === "swish" || e.type === "drop")) checkFourBagger();
}
// Computer: plans like a decent player, partly allows for the wind (better players allow for more), then throws with skill-based error.
function cpuTurn() {
  S.cpuPlan = cpuPlan(S.player, S.world.bags);
  S.end = { ...S.cpuPlan.end };
  S.landD = dist(S.cpuPlan.landing, S.cpuPlan.end); S.landPhi = 0;
  refreshPlan();
  if (S.ideal && S.wind.mph > 0) {
    const c = contact(S.ideal), a = windAccel(), tt = c.time;
    const read = clamp(1 - S.opponent.skill * 2.2 + rand(-0.15, 0.15), 0.2, 1.05); // how well they read the wind
    S.end = { x: clamp(S.end.x - 0.5 * a.x * tt * tt * read, -1.8, 1.8), y: clamp(S.end.y - 0.5 * a.y * tt * tt * read, FY + 0.2, BY + 0.25) };
    refreshPlan();
  }
  ui();
}

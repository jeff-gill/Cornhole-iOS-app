// ───────────────────────── Court (feet). y = down-range, x = lateral (right +), z = height.
const G = 32.17, FY = 27, BY = 31, HW = 1, FH = 0.25, BH = 1;
const HOLE = { x: 0, y: BY - 0.75 }, HR = 0.25, BAG = 0.5, BR = 0.25;
const REL_H = 3, REL_Y = 0.5, REL_X = 1.8;
// Which pitcher's box each player throws from this match (-1 = left, +1 = right). Randomized per match.
const SIDES = [-1, 1];
const SLOPE = Math.atan2(BH - FH, BY - FY), SS = Math.sin(SLOPE), SC = Math.cos(SLOPE);
const T = { mu: 0.35, rBase: 0.75, rSteep: 0.6, rest: 0.35, luckSpeed: 0.08, luckDir: 0.07, grab: 0.08, stop: 0.08, dt: 1 / 240, carry: 1,
  minEl: 10 * Math.PI / 180, maxEl: 65 * Math.PI / 180, defEl: 32 * Math.PI / 180 };
// Gear for the throw being planned: bag spin strength and how far the bag slides.
const CUR = { spinMul: 1, slideMul: 1 };
// Wind pushes a bag in flight: acceleration in ft/s^2 (x lateral, y down-range). Planning ignores it.
const WIND_ACCEL_PER_MPH = 0.16;
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const onBoard = p => Math.abs(p.x) <= HW && p.y >= FY && p.y <= BY;
const plane = y => FH + (y - FY) * (BH - FH) / (BY - FY);
const surf = p => onBoard(p) ? plane(p.y) : 0;
const overHole = (p, r = HR) => dist(p, HOLE) < r;
// How much of a bag (a BAG-wide square, turned by its angle) is over the hole, 0..1. More than half and it falls in.
const COVER_N = 12;
function holeCover(b) {
  const dx = b.x - HOLE.x, dy = b.y - HOLE.y;
  if (Math.hypot(dx, dy) > HR + BAG * 0.71) return 0;
  const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0);
  let n = 0;
  for (let i = 0; i < COVER_N; i++) for (let j = 0; j < COVER_N; j++) {
    const u = ((i + 0.5) / COVER_N - 0.5) * BAG, v = ((j + 0.5) / COVER_N - 0.5) * BAG;
    const x = dx + u * c - v * s, y = dy + u * s + v * c;
    if (x * x + y * y < HR * HR) n++;
  }
  return n / (COVER_N * COVER_N);
}
const release = pl => ({ x: SIDES[pl] * REL_X, y: REL_Y, z: REL_H });

// ───────────────────────── Flight
function v0(t) { const h = t.speed * Math.cos(t.el); return { x: h * Math.sin(t.az), y: h * Math.cos(t.az), z: t.speed * Math.sin(t.el) }; }
function posAt(t, tt) { const v = v0(t), w = t.wind || { x: 0, y: 0 }; return { x: t.o.x + v.x * tt + 0.5 * w.x * tt * tt, y: t.o.y + v.y * tt + 0.5 * w.y * tt * tt, z: t.o.z + v.z * tt - 0.5 * G * tt * tt }; }
function velAt(t, tt) { const v = v0(t), w = t.wind || { x: 0, y: 0 }; return { x: v.x + w.x * tt, y: v.y + w.y * tt, z: v.z - G * tt }; }
function contact(t, ignoreHole = false) {
  const clr = tt => { const p = posAt(t, tt); return p.z - surf(p); };
  let prev = 0, tm = T.dt;
  while (tm < 12) {
    if (clr(tm) <= 0) {
      let lo = prev, hi = tm;
      for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (clr(m) > 0) lo = m; else hi = m; }
      return classify(t, hi, ignoreHole);
    }
    prev = tm; tm += T.dt;
  }
  return classify(t, tm, ignoreHole);
}
function classify(t, tm, ignoreHole) {
  const p = posAt(t, tm), v = velAt(t, tm);
  if (onBoard(p) && p.z >= plane(p.y) - 0.03) {
    p.z = plane(p.y);
    return { time: tm, p, v, kind: (!ignoreHole && overHole(p)) ? "hole" : "board" };
  }
  const g = { x: p.x, y: p.y, z: 0 };
  if (onBoard(g)) { // clipped the board's front or side face
    if (g.y - FY <= HW - Math.abs(g.x)) g.y = FY - BR; else g.x = Math.sign(g.x || 1) * (HW + BR);
  }
  return { time: tm, p: g, v, kind: "ground" };
}
function landingVel(v, slideMul = 1) {
  const n = { x: 0, y: -SS, z: SC };
  const vn = v.x * n.x + v.y * n.y + v.z * n.z;
  const sp = Math.max(Math.hypot(v.x, v.y, v.z), 1e-6);
  const steep = clamp(-vn / sp, 0, 1);
  const r = Math.max(0, T.rBase * slideMul - T.rSteep * steep);
  return { x: (v.x - n.x * vn) * r, y: (v.y - n.y * vn) * r };
}
// Spin: a spinning bag kicks sideways when it lands, then keeps hooking a little as it slides.
const SPIN_KICK = rad(9), SPIN_CURVE = 0.05; // radians at landing, radians per foot of slide (at full spin)
function rot(v, a) { const c = Math.cos(a), s = Math.sin(a); return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c }; }
const heading = v => Math.atan2(v.x, v.y);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function slideStep(b, dt) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp < T.stop) { b.vx = b.vy = 0; return false; }
  const f = T.mu * G * SC / sp;
  const nvx = b.vx - b.vx * f * dt, nvy = b.vy - b.vy * f * dt - G * SS * SC * dt;
  if (nvx * b.vx + nvy * b.vy <= 0) { b.vx = b.vy = 0; return false; }
  b.vx = nvx; b.vy = nvy;
  if (b.curve) { const v = rot({ x: nvx, y: nvy }, b.curve * Math.hypot(nvx, nvy) * dt); b.vx = v.x; b.vy = v.y; }
  b.x += b.vx * dt; b.y += b.vy * dt;
  return true;
}

// ───────────────────────── World
class World {
  constructor(random = true) { this.bags = []; this.events = []; this.nextId = 0; this.random = random; this.rand = Math.random; }
  // Online play: both phones seed the same throw so they get exactly the same luck.
  seed(n) { let a = n >>> 0; this.rand = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  clear() { this.bags = []; this.events = []; }
  get settled() { return this.bags.every(b => b.state !== "flying" && b.state !== "sliding"); }
  launch(t, owner) {
    const b = { id: this.nextId++, owner, state: "flying", x: t.o.x, y: t.o.y, z: t.o.z, vx: 0, vy: 0,
      angle: t.az, spin: (t.spin || 0) * 7 + (this.random ? (this.rand() * 2 - 1) : 0), curve: 0, t, ft: 0, c: contact(t), trail: [{ ...t.o }] };
    this.bags.push(b); return b.id;
  }
  step(dt) {
    for (const b of this.bags) {
      if (b.state === "flying") this.fly(b, dt);
      else if (b.state === "sliding") this.slide(b, dt);
    }
    this.collide();
  }
  fly(b, dt) {
    b.ft += dt; b.angle += b.spin * dt;
    if (b.ft >= b.c.time) { this.land(b, b.c); return; }
    const p = posAt(b.t, b.ft);
    b.x = p.x; b.y = p.y; b.z = p.z;
    if (Math.round(b.ft / dt) % 2 === 0) b.trail.push(p);
    if (onBoard(p) && p.z - plane(p.y) < 0.18) {
      const other = this.bags.find(o => o !== b && onSurface(o) && dist(o, p) < BAG * 0.9);
      if (other) {
        this.land(b, { time: b.ft, p: { x: p.x, y: p.y, z: plane(p.y) }, v: velAt(b.t, b.ft), kind: "board" });
        this.events.push({ type: "hit", a: b, b: other });
      }
    }
  }
  land(b, c) {
    b.x = c.p.x; b.y = c.p.y; b.z = c.p.z; b.trail.push({ ...c.p });
    if (c.kind === "hole") { b.state = "inHole"; b.vx = b.vy = 0; this.events.push({ type: "swish", bag: b }); }
    else if (c.kind === "ground") { b.state = "ground"; b.z = 0; b.vx = b.vy = 0; b.spin = 0; this.events.push({ type: "ground", bag: b }); }
    else {
      const sm = b.t.spinMul || 1;
      let lv = rot(landingVel(c.v, b.t.slideMul || 1), (b.t.spin || 0) * SPIN_KICK * sm);
      if (this.random) { // real bags: a little luck in every landing, and now and then one grabs the wood
        const k = Math.max(0.2, 1 + gaussRand(this.rand) * T.luckSpeed) * (this.rand() < T.grab ? 0.35 : 1);
        lv = rot({ x: lv.x * k, y: lv.y * k }, gaussRand(this.rand) * T.luckDir);
      }
      b.state = "sliding"; b.vx = lv.x; b.vy = lv.y;
      b.curve = (b.t.spin || 0) * SPIN_CURVE * sm; b.spin *= 0.6;
      this.events.push({ type: "land", bag: b }); this.bounds(b);
    }
  }
  slide(b, dt) {
    const moving = slideStep(b, dt);
    b.z = plane(b.y); b.angle += b.spin * dt; b.spin *= Math.max(0, 1 - 2.5 * dt);
    if (!moving) { b.state = "resting"; b.spin = 0; }
    this.bounds(b);
  }
  bounds(b) {
    if (!onSurface(b)) return;
    // more than half of the bag over the hole: in it goes
    if (holeCover(b) > 0.5) { b.state = "inHole"; b.vx = b.vy = 0; b.spin = 0; this.events.push({ type: "drop", bag: b }); }
    else if (!onBoard(b)) {
      if (b.y > BY) b.y += BR; if (b.y < FY) b.y -= BR; if (Math.abs(b.x) > HW) b.x += Math.sign(b.x) * BR;
      b.state = "ground"; b.z = 0; b.vx = b.vy = 0; b.spin = 0; this.events.push({ type: "off", bag: b });
    }
  }
  collide() {
    const a = this.bags.filter(onSurface), md = 2 * BR;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const p = a[i], q = a[j];
      if (!onSurface(p) || !onSurface(q)) continue;
      let dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d >= md) continue;
      if (d < 1e-6) { dx = 0.01; dy = 0; d = 0.01; }
      const nx = dx / d, ny = dy / d;
      // Flat bags don't glance off like balls: a sliding bag carries a resting one along its own line of travel.
      let ex = nx, ey = ny, carried = false;
      const pm = Math.hypot(p.vx, p.vy), qm = Math.hypot(q.vx, q.vy), vm = Math.max(pm, qm);
      if (vm > 0.3 && Math.min(pm, qm) < 0.35 * vm) {
        const mv = pm >= qm ? p : q, sg = mv === p ? 1 : -1, hx = sg * mv.vx / vm, hy = sg * mv.vy / vm;
        if (hx * nx + hy * ny > 0) { const k = T.carry; ex = k * hx + (1 - k) * nx; ey = k * hy + (1 - k) * ny; const el = Math.hypot(ex, ey); ex /= el; ey /= el; carried = true; }
      }
      const closing = (q.vx - p.vx) * ex + (q.vy - p.vy) * ey;
      if (closing < 0) {
        const imp = -(1 + T.rest) * closing / 2;
        p.vx -= ex * imp; p.vy -= ey * imp; q.vx += ex * imp; q.vy += ey * imp; p.curve = q.curve = 0;
        if (closing < -0.5) {
          const tw = this.random ? this.rand() * 6 - 3 : 1.5; p.spin += tw; q.spin -= tw;
          this.events.push({ type: "hit", a: p, b: q });
        }
      }
      const push = (md - d) / 2;
      if (carried) { const f = push / Math.max(ex * nx + ey * ny, 0.35); p.x -= ex * f; p.y -= ey * f; q.x += ex * f; q.y += ey * f; }
      else { p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push; }
      for (const k of [p, q]) { if (Math.hypot(k.vx, k.vy) > T.stop) k.state = "sliding"; this.bounds(k); }
    }
  }
}
function gaussRand(r = Math.random) { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function onSurface(b) { return b.state === "sliding" || b.state === "resting"; }
function bagPoints(b) {
  if (b.state === "inHole") return 3;
  if (onSurface(b) && onBoard(b)) return 1;
  return 0;
}

// ───────────────────────── Solver: landing + finish spots → perfect release
function throwFor(o, L, el) {
  const dx = L.x - o.x, dy = L.y - o.y, D = Math.hypot(dx, dy);
  if (D < 1) return null;
  const c = Math.cos(el), den = 2 * c * c * (D * Math.tan(el) + o.z - surf(L));
  if (den <= 0) return null;
  return { o, speed: Math.sqrt(G * D * D / den), el, az: Math.atan2(dx, dy), spin: 0, spinMul: CUR.spinMul, slideMul: CUR.slideMul };
}
function freeSlideEnd(t) {
  const c = contact(t, true);
  if (c.kind !== "board") return c.p;
  const s = t.spin || 0, sm = t.spinMul || 1, lv = rot(landingVel(c.v, t.slideMul || 1), s * SPIN_KICK * sm), b = { x: c.p.x, y: c.p.y, vx: lv.x, vy: lv.y, curve: s * SPIN_CURVE * sm };
  for (let i = 0; i < 4800 && slideStep(b, T.dt); i++);
  return b;
}
// Arc (elevation) so the bag travels `D` feet toward unit direction `u` after landing at L, with spin s.
function solveEl(o, L, u, D, s) {
  const mk = el => { const t = throwFor(o, L, el); if (t) t.spin = s; return t; };
  const slide = el => { const t = mk(el); if (!t) return null; const e = freeSlideEnd(t); return (e.x - L.x) * u.x + (e.y - L.y) * u.y; };
  let lo = T.minEl, hi = T.maxEl;
  const sLo = slide(lo), sHi = slide(hi);
  if (sLo === null || sHi === null) return mk(T.defEl);
  if (D >= sLo) return mk(lo);
  if (D <= sHi) return mk(hi);
  for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2, v = slide(m); if (v === null) break; if (v > D) lo = m; else hi = m; }
  return mk((lo + hi) / 2);
}
// Perfect release that lands on L and finishes on E: arc sets the distance, spin bends the slide toward E.
function solveSpin(o, L, E) {
  const D = dist(L, E), base = throwFor(o, L, T.maxEl);
  if (!base) return null;
  if (D < 0.08) return base;
  const u = { x: (E.x - L.x) / D, y: (E.y - L.y) / D }, gain = (SPIN_KICK + SPIN_CURVE * D * 0.5) * CUR.spinMul;
  let s = clamp(wrap(heading(u) - base.az) / gain, -1, 1);
  for (let k = 0; k < 6; k++) {
    const t = solveEl(o, L, u, D, s); if (!t) return null;
    const e = freeSlideEnd(t), err = wrap(heading(u) - heading({ x: e.x - L.x, y: e.y - L.y }));
    if (Math.abs(err) < 2e-4) return t;
    s = clamp(s + err / gain, -1, 1);
  }
  return solveEl(o, L, u, D, s);
}
// Plays a throw out against the bags already on the board (without touching the real game).
// Reports the thrown bag's path and the first bag it runs into.
function simulate(t, pl, track = true) {
  const w = new World(false);
  for (const b of S.world.bags) if (onSurface(b)) w.bags.push({ ...b, vx: 0, vy: 0, state: "resting", spin: 0, curve: 0, trail: [] });
  w.nextId = 1e6; w.launch(t, pl);
  const me = w.bags[w.bags.length - 1];
  const flight = [{ ...t.o }], slide = [], pushPath = [];
  let hit = null;
  for (let k = 1; k < 6000 && !w.settled; k++) {
    w.step(T.dt);
    if (!hit) for (const e of w.events) if (e.type === "hit" && (e.a === me || e.b === me)) { hit = e.a === me ? e.b : e.a; break; }
    w.events.length = 0;
    if (track && (k % 3 === 0 || w.settled)) {
      if (me.state === "flying") flight.push({ x: me.x, y: me.y, z: me.z });
      else if (onSurface(me)) slide.push({ x: me.x, y: me.y });
      if (hit && (onSurface(hit) || pushPath.length === 0)) pushPath.push({ x: hit.x, y: hit.y });
    }
  }
  flight.push({ ...me.c.p });
  if (slide.length) slide.unshift({ x: me.c.p.x, y: me.c.p.y });
  if (hit && hit.state === "inHole") pushPath.push({ ...HOLE });
  return { flight, slide, outcome: me.state, end: { x: me.x, y: me.y }, hit,
    own: hit && hit.owner === pl ? hit : null, pushPath, pushOutcome: hit ? hit.state : null, pushEnd: hit ? (hit.state === "inHole" ? { ...HOLE } : { x: hit.x, y: hit.y }) : null };
}
const preview = t => simulate(t, S.player);
// Push shot: one of your own bags is in the way, so throw harder until it is pushed onto the finish spot.
// The distance comes from the arc (flatter = harder); with `aim`, spin is also tuned so the bag
// strikes the blocker at the angle that sends it toward the finish (like aiming a pool shot).
function solvePush(base, L, E, pl, own, aim) {
  const D = dist(L, E); if (D < 0.05) return null;
  const u = { x: (E.x - L.x) / D, y: (E.y - L.y) / D }, B = { x: own.x, y: own.y };
  const sunk = r => r.pushOutcome === "inHole" && dist(E, HOLE) < HR;
  const mk = (el, spin) => { const t = throwFor(base.o, L, el); if (t) t.spin = spin; return t; };
  const run = (el, spin) => { const t = mk(el, spin); if (!t) return null; const r = simulate(t, pl, false); return r.hit && r.hit.id === own.id ? r : null; };
  const reach = r => sunk(r) ? D + 0.01 : (r.pushEnd.x - L.x) * u.x + (r.pushEnd.y - L.y) * u.y;
  const forSpin = spin => {
    let lo = T.minEl, hi = base.el;
    const rLo = run(lo, spin); if (!rLo) return null;
    if (reach(rLo) <= D) return { t: mk(lo, spin), r: rLo };
    let best = { t: mk(lo, spin), r: rLo };
    for (let k = 0; k < (aim ? 14 : 20); k++) {
      const m = (lo + hi) / 2, r = run(m, spin);
      if (!r || reach(r) < D) hi = m; else { lo = m; best = { t: mk(m, spin), r }; }
    }
    return best;
  };
  const side = r => sunk(r) ? 0 : wrap(heading({ x: E.x - B.x, y: E.y - B.y }) - heading({ x: r.pushEnd.x - B.x, y: r.pushEnd.y - B.y }));
  let a = forSpin(base.spin); if (!a) return null;
  if (!aim) return a.t;
  let ea = side(a.r);
  if (Math.abs(ea) < 0.01) return a.t;
  let sb = clamp(base.spin + (ea > 0 ? 0.15 : -0.15), -1, 1), b = forSpin(sb), best = a, bestErr = Math.abs(ea);
  for (let k = 0; k < 5 && b; k++) {
    const eb = side(b.r);
    if (Math.abs(eb) < bestErr) { best = b; bestErr = Math.abs(eb); }
    if (bestErr < 0.01 || eb === ea) break;
    const sn = clamp(sb - eb * (sb - a.t.spin) / (eb - ea), -1, 1);
    a = b; ea = eb; sb = sn; b = forSpin(sb);
  }
  return best.t;
}

// ───────────────────────── Aiming: finish spot + landing distance along the throwing line
// A bag slides the way it was thrown, so the landing spot must sit on the line from the hand to the finish.
function aimLine(pl, E) {
  const o = release(pl), R = Math.hypot(E.x - o.x, E.y - o.y);
  return { o, R, dir: { x: (E.x - o.x) / R, y: (E.y - o.y) / R } };
}
const along = (g, d) => ({ x: g.o.x + g.dir.x * d, y: g.o.y + g.dir.y * d });
function slideAt(g, d, el) {
  const L = along(g, d), t = throwFor(g.o, L, el);
  if (!t) return 0;
  const e = freeSlideEnd(t);
  return (e.x - L.x) * g.dir.x + (e.y - L.y) * g.dir.y;
}
// Landing distances (from the hand) whose perfect throw can finish exactly on E.
function landingRange(g) {
  const max = g.R - Math.max(0, slideAt(g, g.R, T.maxEl));          // highest arc still slides a hair
  const onBoardFrom = g.dir.y > 0 ? (FY + 0.05 - g.o.y) / g.dir.y : g.R; // never plan to land on the grass
  let lo = Math.min(onBoardFrom, max), hi = max;
  if (slideAt(g, lo, T.minEl) >= g.R - lo) return { min: lo, max };
  for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (slideAt(g, m, T.minEl) >= g.R - m) hi = m; else lo = m; }
  return { min: hi, max };
}
// Landing zone: a fan behind the finish spot. Straight back needs no spin; off to the side needs spin,
// and a longer slide has more room to hook, so the fan widens with distance.
const maxPhi = D => 0.85 * (SPIN_KICK + SPIN_CURVE * D * 0.5) * CUR.spinMul;
function aimZone(pl, E) {
  const g = aimLine(pl, E), r = landingRange(g);
  return { g, back: { x: -g.dir.x, y: -g.dir.y }, Dmin: Math.max(0, g.R - r.max), Dmax: Math.max(0, g.R - r.min) };
}
function landingFrom(z, E, D, phi) { const v = rot(z.back, phi); return { x: E.x + v.x * D, y: E.y + v.y * D }; }
function planThrow(pl, E, D, phi) {
  const z = aimZone(pl, E);
  D = clamp(D, z.Dmin, z.Dmax); phi = clamp(phi, -maxPhi(D), maxPhi(D));
  let L = landingFrom(z, E, D, phi);
  for (let i = 0; i < 80 && !onBoard(L) && D > z.Dmin; i++) { // keep the landing on the wood
    if (Math.abs(phi) > 0.005) phi *= 0.85; else D = Math.max(z.Dmin, D - 0.05);
    L = landingFrom(z, E, D, phi);
  }
  const t = solveSpin(z.g.o, L, E);
  return t ? { z, D, phi, landing: L, ideal: t } : null;
}

// ───────────────────────── Difficulty & meters
const LEVELS = {
  easy:   { title: "Backyard", sub: "Slow meters, full trajectory preview", freq: 0.42, zone: 0.08, cpu: 0.42, preview: true },
  medium: { title: "Tailgate", sub: "Quicker meters, full trajectory preview", freq: 0.62, zone: 0.06, cpu: 0.26, preview: true },
  hard:   { title: "League", sub: "Fast meters, landing spot only", freq: 0.85, zone: 0.045, cpu: 0.15, preview: false },
  pro:    { title: "Pro", sub: "Very fast meters, tiny sweet spot", freq: 1.15, zone: 0.03, cpu: 0.08, preview: false },
};
const METERS = [
  { key: "dir", title: "Direction", lo: "Left", hi: "Right" },
  { key: "pow", title: "Strength", lo: "Short", hi: "Long" },
  { key: "ht", title: "Height", lo: "Flat", hi: "High" },
];
const MAX_DIR = rad(6), MAX_POW = 0.14, MAX_HT = rad(9);
const needleAt = (time, lv) => -Math.cos(2 * Math.PI * lv.freq * time);
const eff = (e, lv) => Math.abs(e) <= lv.zone ? 0 : clamp(e, -1, 1);
function applyErrors(e, ideal, lv) {
  return { ...ideal, az: ideal.az + eff(e.dir, lv) * MAX_DIR, speed: ideal.speed * (1 + eff(e.pow, lv) * MAX_POW),
    spin: clamp((ideal.spin || 0) + eff(e.dir, lv) * 0.35, -1, 1),
    el: clamp(ideal.el + eff(e.ht, lv) * MAX_HT, rad(4), rad(78)) };
}
function grade(e, m, lv) {
  const x = eff(e, lv); if (x === 0) return "Perfect";
  const side = x < 0 ? m.lo : m.hi, a = Math.abs(x);
  return a < 0.2 ? "Slightly " + side.toLowerCase() : a < 0.5 ? side : "Way " + side.toLowerCase();
}

// ───────────────────────── CPU
function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, l2 = Math.max(abx * abx + aby * aby, 1e-9);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}
function cpuPlan(pl, bags) {
  const o = release(pl), D = Math.hypot(HOLE.x - o.x, HOLE.y - o.y), dir = { x: (HOLE.x - o.x) / D, y: (HOLE.y - o.y) / D };
  const landing = { x: HOLE.x - dir.x * 1.7, y: HOLE.y - dir.y * 1.7 }, end = { x: HOLE.x + dir.x * 0.1, y: HOLE.y + dir.y * 0.1 };
  const blocker = bags.filter(onSurface).find(b => segDist(b, landing, HOLE) < 0.42);
  if (!blocker) return { landing, end, label: "Slide it in" };
  if (blocker.owner === pl && dist(blocker, HOLE) < 1.6 && dist(blocker, landing) > 0.5) return { landing, end: { ...HOLE }, label: "Push it in" };
  if (blocker.owner !== pl && dist(blocker, HOLE) < 0.9 && Math.random() < 0.5)
    return { landing: { x: blocker.x - dir.x * 0.9, y: blocker.y - dir.y * 0.9 }, end: { x: HOLE.x + dir.x * 0.4, y: HOLE.y + dir.y * 0.4 }, label: "Push through" };
  return { landing: { ...HOLE }, end: { ...HOLE }, label: "Airmail" };
}
function gauss(s) { const u = Math.max(1e-9, Math.random()), v = Math.random(); return clamp(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * s, -1, 1); }



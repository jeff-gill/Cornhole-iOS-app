
// ───────────────────────── Cornhole celebrations (shop "Effects" tab)
// Each effect plays at the hole when your bag drops in; the 2/3/4-bagger build-up layers on top.
const EFFECTS = [
  { id: "confetti", name: "Confetti", price: 0, icon: "🎉", blurb: "The classic burst" },
  { id: "streamers", name: "Streamers", price: 500, icon: "🎏", blurb: "Long ribbons in your colours" },
  { id: "bubbles", name: "Bubbles", price: 2000, icon: "🫧", blurb: "Bubbles float up out of the hole" },
  { id: "hearts", name: "Hearts", price: 8000, icon: "💖", blurb: "A shower of hearts" },
  { id: "coins", name: "Gold Coins", price: 25000, icon: "💰", blurb: "A jackpot spray that bounces on the board" },
  { id: "stars", name: "Stars", price: 80000, icon: "⭐", blurb: "Twinkling stars burst out" },
  { id: "blizzard", name: "Blizzard", price: 250000, icon: "❄️", blurb: "A frosty snowburst" },
  { id: "lightning", name: "Lightning", price: 800000, icon: "⚡", blurb: "A bolt strikes the hole" },
  { id: "flames", name: "Flames", price: 2500000, icon: "🔥", blurb: "Fire erupts from the hole" },
  { id: "galaxy", name: "Galaxy Swirl", price: 8000000, icon: "🌌", blurb: "A whirl of stardust" },
  { id: "fireworks", name: "Mini Fireworks", price: 25000000, icon: "🎆", blurb: "A firework pops over the board" },
  { id: "rainbow", name: "Rainbow Burst", price: 80000000, icon: "🌈", blurb: "Shimmering rainbow sparkle" },
];
const fxTex = {
  star: canvasTex(64, 64, (c) => { c.fillStyle = "#fff"; c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 12 : 30; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } c.fill(); }),
  coin: canvasTex(64, 64, (c) => { const g = c.createRadialGradient(24, 22, 4, 32, 32, 30); g.addColorStop(0, "#fff6b0"); g.addColorStop(0.5, "#ffc93a"); g.addColorStop(1, "#b07a00"); c.fillStyle = g; c.beginPath(); c.arc(32, 32, 28, 0, 7); c.fill(); c.strokeStyle = "#8a5a00"; c.lineWidth = 4; c.stroke(); c.fillStyle = "#b07a00"; c.font = "bold 30px sans-serif"; c.textAlign = "center"; c.fillText("$", 32, 43); }),
  heart: canvasTex(64, 64, (c) => { c.fillStyle = "#fff"; c.beginPath(); c.moveTo(32, 54); c.bezierCurveTo(4, 36, 6, 10, 22, 10); c.bezierCurveTo(28, 10, 32, 16, 32, 20); c.bezierCurveTo(32, 16, 36, 10, 42, 10); c.bezierCurveTo(58, 10, 60, 36, 32, 54); c.fill(); }),
  bubble: canvasTex(64, 64, (c) => { c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 26, 0, 7); c.stroke(); c.fillStyle = "rgba(160,220,255,.25)"; c.fill(); c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.ellipse(22, 20, 7, 4, -0.6, 0, 7); c.fill(); }),
};
// A burst of sprite particles: n of them, launched upward in a cone, with gravity and a fade.
function spriteBurst({ n = 40, tex = dotTex, colors = [0xffffff], speed = [3, 7], up = [5, 9], spread = 0.7, gravity = 12, life = [1, 1.6], size = [0.12, 0.22], additive = false, drag = 0.4, bounce = false, rise = 0, swirl = 0 }) {
  const base = W(HOLE.x, HOLE.y, plane(HOLE.y) + 0.1);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: colors[i % colors.length], transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    const a = Math.random() * Math.PI * 2, v = rand(speed[0], speed[1]) * spread;
    s.position.copy(base); s.scale.setScalar(rand(size[0], size[1])); scene.add(s);
    const L = rand(life[0], life[1]);
    fx.push({ o: s, kind: "sprite", vel: new THREE.Vector3(Math.cos(a) * v, rand(up[0], up[1]), Math.sin(a) * v), gravity, drag, bounce, rise, swirl, base, life: L, max: L, s0: s.scale.x });
  }
}
function lightningStrike(color = 0xbfe6ff) {
  const pts = [], top = W(HOLE.x + rand(-2, 2), HOLE.y + rand(-1, 1), 26), end = W(HOLE.x, HOLE.y, plane(HOLE.y));
  for (let k = 0; k <= 14; k++) {
    const t = k / 14, p = top.clone().lerp(end, t);
    if (k > 0 && k < 14) p.add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8)).multiplyScalar(1 - t * 0.6));
    pts.push(p);
  }
  for (const [w, op] of [[1, 1], [1, 0.5]]) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => p.clone().add(new THREE.Vector3(rand(-0.05, 0.05) * w, 0, 0)))),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(line); fx.push({ o: line, kind: "flicker", life: 0.6, max: 0.6 });
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  flash.position.copy(end).add(new THREE.Vector3(0, 0.4, 0)); flash.scale.setScalar(5); scene.add(flash);
  fx.push({ o: flash, life: 0.5, max: 0.5, kind: "flash" });
  spriteBurst({ n: 30, colors: [0xffffff, 0xbfe6ff], additive: true, speed: [3, 8], up: [1, 4], life: [0.4, 0.8], size: [0.08, 0.16] });
  shake = Math.max(shake, 0.35);
}
function celebrate(owner, forced) {
  const id = forced || (owner === 0 ? career.effect : (S.online && S.online.effect) || "confetti");
  const team = [COL.p[owner], COL.pl[owner], "#ffffff"];
  switch (id) {
    case "streamers": confetti(owner); spriteBurst({ n: 30, colors: team, speed: [2, 4], up: [7, 11], gravity: 5, life: [1.6, 2.2], size: [0.1, 0.18], drag: 0.6 }); break;
    case "bubbles": spriteBurst({ n: 34, tex: fxTex.bubble, speed: [0.5, 1.6], up: [1, 2.5], gravity: -0.6, life: [2, 3], size: [0.2, 0.45], drag: 0.7 }); break;
    case "coins": spriteBurst({ n: 36, tex: fxTex.coin, speed: [2, 5], up: [6, 10], gravity: 16, life: [1.6, 2.2], size: [0.18, 0.26], bounce: true }); sfx.tick(); break;
    case "stars": spriteBurst({ n: 40, tex: fxTex.star, colors: [0xffe27a, 0xffffff, 0xffc93a], additive: true, speed: [3, 7], up: [4, 8], gravity: 6, life: [1, 1.6], size: [0.15, 0.3] }); break;
    case "hearts": spriteBurst({ n: 36, tex: fxTex.heart, colors: [0xff3a7a, 0xff7aa8, 0xffffff, 0xe8264f], speed: [2, 5], up: [5, 9], gravity: 7, life: [1.4, 2], size: [0.16, 0.3], drag: 0.5 }); break;
    case "blizzard":
      spriteBurst({ n: 60, colors: [0xffffff, 0xd8f0ff], speed: [3, 7], up: [3, 7], gravity: 3, life: [1.2, 1.8], size: [0.06, 0.14], drag: 0.4 });
      spriteBurst({ n: 18, tex: fxTex.star, colors: [0xbfe6ff, 0xffffff], additive: true, speed: [2, 5], up: [4, 8], gravity: 4, life: [1, 1.5], size: [0.16, 0.28] }); break;
    case "galaxy":
      spriteBurst({ n: 50, colors: [0x7a4bff, 0x2f86ff, 0xff4bd8, 0xffffff], additive: true, speed: [1, 3], up: [3, 6], gravity: 2, life: [1.4, 2], size: [0.1, 0.22], drag: 0.6, swirl: 5 });
      spriteBurst({ n: 20, tex: fxTex.star, colors: [0xffffff, 0xd8c8ff], additive: true, speed: [2, 5], up: [4, 7], gravity: 4, life: [1, 1.6], size: [0.14, 0.26] }); break;
    case "lightning": lightningStrike(); break;
    case "flames": // tongues of fire: a hot core plus embers thrown wide
      spriteBurst({ n: 60, colors: [0xff3a1a, 0xff6a1a, 0xff8a1f], additive: true, speed: [1, 3], up: [3, 7], gravity: -0.5, life: [0.5, 1], size: [0.14, 0.3], drag: 0.35 });
      spriteBurst({ n: 30, colors: [0xffc93a, 0xfff27a], additive: true, speed: [0.3, 1], up: [4, 8], gravity: 2, life: [0.4, 0.8], size: [0.1, 0.2], drag: 0.5 });
      spriteBurst({ n: 24, colors: [0xffb347], additive: true, speed: [4, 8], up: [5, 9], gravity: 10, life: [1, 1.5], size: [0.04, 0.08] }); break;
    case "fireworks": fireworkBurst(W(HOLE.x, HOLE.y, 5.5).clone(), new THREE.Color(COL.p[owner]), 120); fireworkBurst(W(HOLE.x + 0.8, HOLE.y - 0.5, 6.5).clone(), new THREE.Color(0xffc93a), 90); sfx.boom(); break;
    case "rainbow": spriteBurst({ n: 70, colors: [0xff3a3a, 0xff9a1f, 0xfff23a, 0x3ee07a, 0x2f86ff, 0xa24bff], additive: true, speed: [3, 8], up: [4, 9], gravity: 7, life: [1.2, 1.8], size: [0.1, 0.2] }); break;
    default: confetti(owner);
  }
}
// The per-frame update for the particle kinds above (called from updateFx).
function updateCelebrationFx(f, dt, a) {
  if (f.kind === "sprite") {
    f.vel.y -= f.gravity * dt; f.vel.multiplyScalar(Math.pow(f.drag, dt));
    if (f.swirl) { const dx = f.o.position.x - f.base.x, dz = f.o.position.z - f.base.z; f.vel.x += -dz * f.swirl * dt; f.vel.z += dx * f.swirl * dt; }
    f.o.position.addScaledVector(f.vel, dt);
    const floor = surf({ x: f.o.position.x, y: -f.o.position.z }) + 0.05;
    if (f.o.position.y < floor) { f.o.position.y = floor; if (f.bounce && Math.abs(f.vel.y) > 1) f.vel.y *= -0.45; else f.vel.set(0, 0, 0); }
    f.o.material.opacity = Math.min(1, a * 2.5);
    f.o.material.rotation += dt * 3;
    return true;
  }
  if (f.kind === "flicker") { f.o.material.opacity = a * (Math.random() < 0.6 ? 1 : 0.2); return true; }
  return false;
}

// ───────────────────────── Wind you can see
// Faint white streaks drift across the court with the wind: more of them, longer and quicker as it gets stronger,
// none at all in still air. Each one fades in upwind, slides along with a gentle wave, and fades out again.
const windStreakTex = canvasTex(256, 16, (c, w, h) => {
  // soft at both ends and along both edges: a wisp, not a bar
  const img = c.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = Math.abs(y / (h - 1) - 0.5) * 2;
    const a = Math.min(1, u / 0.3, (1 - u) / 0.25) * (1 - v * v), i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.max(0, a) * 255;
  }
  c.putImageData(img, 0, 0);
});
const windStreaks = [], WIND_MAX_STREAKS = 34;
const windGroup = new THREE.Group(); scene.add(windGroup);
for (let i = 0; i < WIND_MAX_STREAKS; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), new THREE.MeshBasicMaterial({ map: windStreakTex, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide, fog: false }));
  m.visible = false; m.renderOrder = 5; windGroup.add(m);
  windStreaks.push({ m, life: 0, age: 0, pos: new THREE.Vector3(), phase: Math.random() * 6.28 });
}
const _wx = new THREE.Vector3(), _wy = new THREE.Vector3(), _wz = new THREE.Vector3(), _wm = new THREE.Matrix4();
function spawnStreak(s, d, first) {
  // around whatever the camera is looking at, below eye level, starting upwind so it drifts across the view
  const fx = camLook.x, fz = camLook.z, reach = Math.max(10, camera.position.distanceTo(camLook) * 0.55);
  const along = (Math.random() - 0.65) * reach * 1.8; // mostly upwind of the middle, so they drift into view
  const side = (Math.random() - 0.5) * reach * 1.1;
  const top = Math.max(2.5, camera.position.y - 0.8);
  s.pos.set(fx + d.x * along - d.z * side, 0.6 + Math.random() * (top - 0.6), fz + d.z * along + d.x * side);
  s.age = first ? Math.random() * 1.2 : 0; s.life = 1.4 + Math.random() * 1.1; s.len = 2.5 + Math.random() * 3.5;
}
function updateWindStreaks(dt) {
  const w = S.wind, show = w && w.mph > 0 && S.phase !== "hub";
  const want = show ? Math.min(WIND_MAX_STREAKS, 6 + Math.round(w.mph * 2.8)) : 0;
  const d = show ? _wz.set(Math.sin(w.dir), 0, -Math.cos(w.dir)).normalize().clone() : null;
  const speed = show ? 4 + w.mph * 2.2 : 0; // ft/s on screen: a touch faster than real so it reads at a glance
  windStreaks.forEach((s, i) => {
    if (i >= want) { s.m.visible = false; s.life = 0; return; }
    if (s.life <= 0 || s.age >= s.life) spawnStreak(s, d, s.life <= 0);
    s.age += dt;
    s.pos.addScaledVector(d, speed * dt);
    const k = s.age / s.life, fade = Math.sin(Math.PI * Math.min(1, k)); // in, then out
    s.m.visible = true; s.m.material.opacity = 0.8 * fade;
    // lie along the wind, turned to face the camera, with a slow wave
    _wx.copy(d); _wy.copy(camera.position).sub(s.pos); _wy.addScaledVector(_wx, -_wy.dot(_wx)).normalize();
    _wz.crossVectors(_wy, _wx);
    _wm.makeBasis(_wx, _wz, _wy).setPosition(s.pos.x, s.pos.y + Math.sin(S.time * 2 + s.phase) * 0.35, s.pos.z);
    s.m.matrixAutoUpdate = false; s.m.matrix.copy(_wm).multiply(new THREE.Matrix4().makeScale(s.len * (0.6 + 0.4 * fade), 1, 1));
    s.m.matrixWorldNeedsUpdate = true;
  });
}

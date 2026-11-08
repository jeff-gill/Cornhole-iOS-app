
// ───────────────────────── The can opening, in 3D
// A glossy metal can (lathe-shaped body, printed label, lid and pull tab) spins in front of light rays in its rarity
// colour. Tap: it shakes harder and harder, the tab snaps up and a burst of fizz sprays out with a flash.
const RARITY_GLOW = { black: "#9aa4b2", white: "#e8f0ff", bronze: "#ffb070", silver: "#d8e8ff", gold: "#ffd84a", purple: "#c48cff", platinum: "#ffffff", diamond: "#7fe8ff", express: "#ff7ac0" };
const C3 = { r: null, scene: null, cam: null, can: null, tab: null, glow: null, flash: null, fizz: null, sparkle: null, state: "off", t: 0, last: 0, raf: 0 };
function can3dInit() {
  if (C3.r) return;
  const cv = $("can3d");
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(), pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
  const rimL = new THREE.DirectionalLight(0x9fd0ff, 1.4); rimL.position.set(-4, 2, -3); scene.add(rimL);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0, 1.7, 14.5); cam.lookAt(0, 1.4, 0);
  Object.assign(C3, { r, scene, cam });
}
function canLabelTex(can) {
  return canvasTex(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, can.color); g.addColorStop(0.5, can.rim); g.addColorStop(1, can.color);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(255,255,255,.18)"; for (let x = -h; x < w; x += 90) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 40, h); c.lineTo(x + 40 + h, 0); c.lineTo(x + h, 0); c.fill(); }
    const dark = ["white", "platinum", "silver"].includes(can.id), ink = dark ? "#16233f" : "#ffffff";
    for (const cx of [w * 0.25, w * 0.75]) { // the label wraps around, so print it twice
      c.fillStyle = dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(cx, h / 2, 210, 170, 0, 0, 7); c.fill();
      c.fillStyle = ink; c.textAlign = "center"; c.font = "bold 74px 'Lilita One', Arial Black, sans-serif";
      const words = can.name.split(" "); words.forEach((wd, i) => c.fillText(wd.toUpperCase(), cx, h / 2 - 22 + (i - (words.length - 1) / 2) * 78));
      const rank = can.express ? 0 : CANS.indexOf(can) + 1;
      c.font = "bold 34px Arial, sans-serif"; c.fillText(can.express ? "⚡ EXPRESS ⚡" : "★".repeat(Math.min(rank, 8)), cx, h / 2 + 108);
      c.font = "bold 22px Arial, sans-serif"; c.fillText("PRIZE CAN", cx, h / 2 - 118);
    }
  });
}
function can3dBuild(can) {
  can3dInit();
  if (C3.can) { C3.scene.remove(C3.can); C3.can.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
  const g = new THREE.Group();
  const prof = [[0, 0], [0.72, 0], [0.9, 0.05], [0.98, 0.22], [1, 0.4], [1, 3.05], [0.9, 3.38], [0.84, 3.5], [0.86, 3.58], [0.8, 3.62], [0.02, 3.56]].map(([x, y]) => new THREE.Vector2(x, y));
  const metal = new THREE.MeshPhysicalMaterial({ color: can.rim, metalness: 0.95, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true });
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 72), metal));
  const label = new THREE.Mesh(new THREE.CylinderGeometry(1.006, 1.006, 2.5, 72, 1, true),
    new THREE.MeshPhysicalMaterial({ map: canLabelTex(can), metalness: 0.45, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true }));
  label.position.y = 1.75; g.add(label);
  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.3, transparent: true }));
  lid.rotation.x = -Math.PI / 2; lid.position.y = 3.57; g.add(lid);
  const tab = new THREE.Group(); tab.position.set(0, 3.6, 0.12);
  const tabMat = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 1, roughness: 0.25, transparent: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 10, 24), tabMat); ring.rotation.x = Math.PI / 2; ring.position.z = 0.22; tab.add(ring);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.26), tabMat); plate.position.z = 0.06; tab.add(plate);
  g.add(tab);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: RARITY_GLOW[can.id] || "#fff", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  glow.position.set(0, 1.8, -1.2); glow.scale.setScalar(7.5); C3.scene.add(glow);
  if (C3.glow) C3.scene.remove(C3.glow);
  g.rotation.x = 0.08;
  C3.scene.add(g);
  Object.assign(C3, { can: g, tab, glow, mats: [metal, label.material, lid.material, tabMat], state: "idle", t: 0, shake: 0, popT: 0, kind: can });
  $("canRays").style.setProperty("--ray", RARITY_GLOW[can.id] || "#fff");
  can3dStart();
}
function can3dStart() {
  can3dResize();
  if (!C3.raf) { C3.last = performance.now(); C3.raf = requestAnimationFrame(can3dFrame); }
}
function can3dResize() {
  const cv = $("can3d"), w = cv.clientWidth || 390, h = cv.clientHeight || 700;
  C3.r.setSize(w, h, false); C3.cam.aspect = w / h; C3.cam.updateProjectionMatrix();
}
function can3dShake() { C3.state = "shake"; }
// The pop: the tab snaps up, a flash, and fizz sprays out of the top; then the can drops away.
function can3dPop() {
  C3.state = "pop"; C3.popT = 0;
  const can = C3.kind, rank = Math.max(0, CANS.indexOf(can));
  // Liquid: a gusher that keeps spraying out of the opening for a second or so, tinted droplets plus white foam.
  const spray = (n, size, color, opacity, speed, life) => {
    const pos = new Float32Array(n * 3).fill(0), vel = [];
    for (let i = 0; i < n; i++) { pos[i * 3 + 1] = -99; vel.push([0, 0, 0, -1]); } // [vx, vy, vz, born-at] (-1 = not yet out)
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color, size, transparent: true, depthWrite: false, opacity }));
    p.userData = { vel, speed, life, next: 0, n }; p.frustumCulled = false; C3.scene.add(p); return p;
  };
  for (const p of [C3.drops, C3.foam]) if (p) { C3.scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
  C3.drops = spray(1400 + rank * 160, 0.24, new THREE.Color(can.rim).lerp(new THREE.Color(0xffffff), 0.35), 1, 1, 1.6);
  C3.foam = spray(500 + rank * 50, 0.5, 0xffffff, 0.85, 0.75, 1.3);
  C3.fizz = null; C3.sparkle = null;
  if (can.pulls >= 5) { // rare cans: sparkles too
    const m = 70, sp = new Float32Array(m * 3), sv = [];
    for (let i = 0; i < m; i++) { sp[i * 3 + 1] = 3.6; const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3; sv.push([Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s]); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const sparkle = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTex, color: RARITY_GLOW[can.id], size: 0.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparkle.userData = { vel: sv, life: 1.8 }; C3.can.add(sparkle); C3.sparkle = sparkle;
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: RARITY_GLOW[can.id] || "#fff", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.position.set(0, 3.8, 0.3); flash.scale.setScalar(1); C3.can.add(flash); C3.flash = flash;
}
const SPRAY_SECS = 1.5;
// Release droplets from the opening (strongest at the pop, easing off), then let gravity pull them down in arcs.
const sprayFrom = new THREE.Vector3();
function stepSpray(p, dt, k) {
  if (!p) return;
  sprayFrom.set(0.05, 3.65, 0.3); C3.can.localToWorld(sprayFrom);
  const u = p.userData, pos = p.geometry.attributes.position.array, v = u.vel;
  const want = k < SPRAY_SECS ? Math.floor(u.n * Math.min(1, Math.pow(k / SPRAY_SECS, 0.6))) : u.n;
  const power = Math.max(0.35, 1 - k / SPRAY_SECS);
  for (; u.next < want; u.next++) {
    const i = u.next, a = (Math.random() - 0.5) * 1.7, sp = (6.5 + Math.random() * 5) * power * u.speed;
    pos[i * 3] = sprayFrom.x + (Math.random() - 0.5) * 0.12; pos[i * 3 + 1] = sprayFrom.y; pos[i * 3 + 2] = sprayFrom.z + (Math.random() - 0.5) * 0.12;
    // mostly up, fanning out, a little toward you
    v[i] = [Math.sin(a) * sp * 0.7 + (Math.random() - 0.5) * 2.2, Math.cos(a) * sp, 0.8 + Math.random() * 1.6 * power, k];
  }
  for (let i = 0; i < u.next; i++) {
    const d = v[i]; if (k - d[3] > u.life) { pos[i * 3 + 1] = -99; continue; }
    d[1] -= 14 * dt; d[0] *= Math.pow(0.7, dt); d[2] *= Math.pow(0.7, dt);
    pos[i * 3] += d[0] * dt; pos[i * 3 + 1] += d[1] * dt; pos[i * 3 + 2] += d[2] * dt;
  }
  p.geometry.attributes.position.needsUpdate = true;
  p.material.opacity = Math.min(p.material.opacity, Math.max(0, (SPRAY_SECS + u.life - k) / 0.6));
}
function stepPoints(p, dt) {
  if (!p) return;
  const pos = p.geometry.attributes.position, v = p.userData.vel;
  for (let i = 0; i < v.length; i++) { v[i][1] -= 9 * dt; v[i][0] *= Math.pow(0.6, dt); v[i][2] *= Math.pow(0.6, dt); pos.array[i * 3] += v[i][0] * dt; pos.array[i * 3 + 1] += v[i][1] * dt; pos.array[i * 3 + 2] += v[i][2] * dt; }
  pos.needsUpdate = true; p.userData.life -= dt; p.material.opacity = Math.max(0, Math.min(1, p.userData.life));
}
function can3dFrame(now) {
  C3.raf = 0;
  if ($("canSheet").hidden || !C3.can) return;
  const dt = Math.min(0.05, (now - C3.last) / 1000) * (window.__canSlow || 1); C3.last = now; C3.t += dt; // __canSlow: slow motion for tests
  const g = C3.can;
  if (C3.state === "idle") { g.rotation.y += dt * 0.9; g.position.y = Math.sin(C3.t * 2) * 0.08; g.rotation.z = 0; }
  else if (C3.state === "shake") { C3.shake = Math.min(1, C3.shake + dt * 1.6); g.rotation.y += dt * 2; g.rotation.z = Math.sin(C3.t * 45) * 0.13 * C3.shake; g.position.y = Math.abs(Math.sin(C3.t * 22)) * 0.14 * C3.shake; g.position.x = Math.sin(C3.t * 37) * 0.06 * C3.shake; }
  else if (C3.state === "pop") {
    C3.popT += dt; const k = C3.popT;
    g.rotation.z *= Math.pow(0.02, dt); g.rotation.y = Math.round(g.rotation.y / (Math.PI * 2)) * Math.PI * 2 * 0 + g.rotation.y * Math.pow(0.4, dt);
    C3.tab.rotation.x = -Math.min(1, k / 0.12) * 1.9;
    if (C3.flash) { C3.flash.scale.setScalar(1 + k * 14); C3.flash.material.opacity = Math.max(0, 1 - k * 2.2); }
    g.position.x *= Math.pow(0.02, dt);
    // it starts spraying where it is, then falls away down the screen, still gushing
    g.position.y = -9 * Math.pow(Math.min(k, 1.8) / 1.8, 2);
    // the push of the spray makes the can jitter while it gushes
    if (k < SPRAY_SECS) { const j = (1 - k / SPRAY_SECS) * 0.05; g.position.x += (Math.random() - 0.5) * j; g.rotation.z += (Math.random() - 0.5) * j; }
    stepSpray(C3.drops, dt, k); stepSpray(C3.foam, dt, k); stepPoints(C3.sparkle, dt);
    if (k > 1.5) { const d = Math.min(1, (k - 1.5) / 0.4); for (const m of C3.mats) m.opacity = 1 - d; C3.glow.material.opacity = 0.55 * (1 - d); }
  }
  C3.r.render(C3.scene, C3.cam);
  C3.raf = requestAnimationFrame(can3dFrame);
}
window.addEventListener("resize", () => { if (C3.r) can3dResize(); });

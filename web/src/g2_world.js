
// ───────────────────────── Renderer, sky, lights
const canvas = $("gl"), stage = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap; // soft-edged shadows (blur set by sun.shadow.radius)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(w, h, paint, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  paint(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2cfa0, 90, 260);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2200);
// Glow: a soft bloom over bright things (string lights, fire, effects), then tone mapping.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let glowOn = true;
function renderScene() { if (glowOn) composer.render(); else renderer.render(scene, camera); }
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloom.setSize(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const skyU = {
  top: { value: new THREE.Vector3() }, mid: { value: new THREE.Vector3() }, horizon: { value: new THREE.Vector3() },
  sunDir: { value: new THREE.Vector3(-0.55, 0.32, 0.2).normalize() }, sunGlow: { value: 1 }, night: { value: 0 },
};
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `varying vec3 vDir; uniform vec3 top, mid, horizon, sunDir; uniform float sunGlow, night;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
    void main(){
      float h = vDir.y;
      vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
      col = mix(col, top, smoothstep(0.22, 0.85, h));
      float s = max(dot(normalize(vDir), sunDir), 0.0);
      col += sunGlow * (vec3(1.0, 0.75, 0.45) * pow(s, 8.0) * 0.35 + vec3(1.0, 0.95, 0.8) * pow(s, 300.0) * 1.5);
      if (night > 0.5) { vec3 q = floor(vDir * 260.0); float st = step(0.9975, hash(q)) * smoothstep(0.05, 0.4, h); col += vec3(st); }
      gl_FragColor = vec4(col, 1.0);
    }`,
}));
scene.add(skyMesh);
const hemi = new THREE.HemisphereLight(0xd6ecff, 0x557a2c, 1.25);
const sun = new THREE.DirectionalLight(0xffe3b8, 2.9);
sun.target.position.set(0, 0, -27);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 7; sun.shadow.blurSamples = 16;
scene.add(hemi, sun, sun.target);

// ───────────────────────── Venue scenery
let venueGroup = null, venueId = "", glowSprites = [], venueDust = 0xf1dcb0;
const groundDust = () => venueDust;
const glowTex = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,236,170,1)"); g.addColorStop(1, "rgba(255,210,120,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
function add(g, mesh, x, y, z, shadow = true) { mesh.position.set(x, y, z); if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; } g.add(mesh); return mesh; }
function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }

function groundTexture(kind) {
  const r = rng(4);
  const noise = (c, w, h, n, hue, sat, light, len) => {
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, l = len[0] + r() * len[1];
      c.strokeStyle = `hsla(${hue[0] + r() * hue[1]},${sat[0] + r() * sat[1]}%,${light[0] + r() * light[1]}%,${0.3 + r() * 0.4})`;
      c.lineWidth = 1 + r(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 2, y - l); c.stroke();
    }
  };
  if (kind === "grass") return canvasTex(512, 512, (c, w, h) => { c.fillStyle = "#5fae3e"; c.fillRect(0, 0, w, h / 2); c.fillStyle = "#4f9a33"; c.fillRect(0, h / 2, w, h / 2); noise(c, w, h, 9000, [92, 24], [45, 25], [28, 26], [2, 5]); }, [1, 1]);
  if (kind === "turf") return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#3fa64a"; c.fillRect(0, 0, w, h / 2); c.fillStyle = "#349a3f"; c.fillRect(0, h / 2, w, h / 2);
    noise(c, w, h, 6000, [110, 15], [50, 20], [30, 18], [1, 3]);
    c.fillStyle = "rgba(255,255,255,.85)"; c.fillRect(0, 0, w, 6);
  }, [1, 1]);
  if (kind === "asphalt") return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#4a4d52"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) { const g = 50 + r() * 60; c.fillStyle = `rgba(${g},${g},${g + 4},${0.3 + r() * 0.5})`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
    c.fillStyle = "rgba(245,245,235,.85)"; c.fillRect(w * 0.02, 0, 7, h); // parking stripe
  }, [1, 1]);
  if (kind === "sand") return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#ead39c"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) { const l = 60 + r() * 25; c.fillStyle = `hsla(40,55%,${l}%,${0.25 + r() * 0.4})`; c.fillRect(r() * w, r() * h, 2, 2); }
    c.strokeStyle = "rgba(180,140,80,.25)"; c.lineWidth = 3;
    for (let y = 20; y < h; y += 46) { c.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x / 40 + y) * 6; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke(); }
  }, [1, 1]);
  if (kind === "roof") return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#7d7f86"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) { const g = 90 + r() * 70; c.fillStyle = `rgba(${g},${g},${g + 6},${0.3 + r() * 0.5})`; c.fillRect(r() * w, r() * h, 2, 2); }
    c.strokeStyle = "rgba(40,40,46,.5)"; c.lineWidth = 2; for (let x = 0; x <= w; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); c.beginPath(); c.moveTo(0, x); c.lineTo(w, x); c.stroke(); }
  }, [1, 1]);
  if (kind === "desert") return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#d9935a"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) { const l = 45 + r() * 25; c.fillStyle = `hsla(${20 + r() * 12},55%,${l}%,${0.25 + r() * 0.4})`; c.fillRect(r() * w, r() * h, 2, 2); }
    c.fillStyle = "rgba(120,70,40,.35)"; for (let i = 0; i < 160; i++) { c.beginPath(); c.arc(r() * w, r() * h, 1.5 + r() * 3, 0, 7); c.fill(); }
  }, [1, 1]);
  if (kind === "dirt") return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#4f7a34"; c.fillRect(0, 0, w, h); noise(c, w, h, 7000, [85, 25], [40, 20], [24, 20], [2, 4]);
    for (let i = 0; i < 30; i++) { const g = c.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 30 + r() * 50); g.addColorStop(0, "rgba(140,105,70,.6)"); g.addColorStop(1, "rgba(140,105,70,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  }, [1, 1]);
  if (kind === "snow") return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#eef3f9"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const g = c.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 40 + r() * 80); g.addColorStop(0, "rgba(190,210,235,.35)"); g.addColorStop(1, "rgba(190,210,235,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
    for (let i = 0; i < 9000; i++) { const l = 82 + r() * 16; c.fillStyle = `hsla(212,40%,${l}%,${0.3 + r() * 0.5})`; c.fillRect(r() * w, r() * h, 1.6, 1.6); }
    c.fillStyle = "rgba(255,255,255,.9)"; for (let i = 0; i < 900; i++) c.fillRect(r() * w, r() * h, 1, 1); // glints
  }, [1, 1]);
  // brick pavers
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#5a4636"; c.fillRect(0, 0, w, h);
    const bw = 64, bh = 32;
    for (let row = 0; row < h / bh; row++) for (let col = -1; col < w / bw + 1; col++) {
      const x = col * bw + (row % 2) * bw / 2, y = row * bh, l = 22 + r() * 10;
      c.fillStyle = `hsl(${10 + r() * 10},${30 + r() * 12}%,${l}%)`; c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }, [1, 1]);
}
function setGround(g, kind, tile) {
  const tex = groundTexture(kind), size = 520;
  tex.repeat.set(size / tile, size / tile);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.z = -30; ground.receiveShadow = true;
  g.add(ground);
}
// Trees made in Blender (web/tools/blender/trees.py): low-poly with baked soft shading. `kinds` picks the mix.
const BLENDER = "assets/blender/";
const blenderCache = new Map();
function loadBlender(name) {
  if (!blenderCache.has(name)) blenderCache.set(name, gltfLoader.loadAsync(`${BLENDER}${name}.json`).then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g.scene;
  }).catch(() => null));
  return blenderCache.get(name);
}
function blenderTrees(g, seed, kinds, opts = {}) {
  const r = rng(seed), spots = [];
  const place = (x, z, s) => spots.push([x, z, s, kinds[Math.floor(r() * kinds.length)], r() * 6.28]);
  const back = opts.back ?? -60;
  for (let x = -75; x <= 75; x += 7 + r() * 6) place(x, back - r() * 22, 0.9 + r() * 0.6);
  if (opts.front) for (let x = -75; x <= 75; x += 7 + r() * 6) place(x, opts.front + r() * 22, 0.9 + r() * 0.6);
  if (opts.sides !== false) for (let z = -52; z <= 20; z += 8 + r() * 6) { place(-50 - r() * 14, z, 0.8 + r() * 0.5); place(50 + r() * 14, z, 0.8 + r() * 0.5); }
  for (const [x, z, sc, kind, rot] of spots) loadBlender(kind).then(src => {
    if (!src || venueGroup !== g) return;
    const t = src.clone(); t.position.set(x, 0, z); t.rotation.y = rot; t.scale.setScalar(sc); g.add(t);
  });
}
function trees(g, seed, palette, opts = {}) {
  const r = rng(seed);
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 7), trunkMat = lam(0x7a5232), blobGeo = new THREE.IcosahedronGeometry(1, 1);
  const mats = palette.map(c => lam(c, { flatShading: true }));
  const place = (x, z, s) => {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.position.y = 3; t.add(tr);
    const n = 2 + Math.floor(r() * 3), mat = mats[Math.floor(r() * mats.length)];
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(blobGeo, mat), bs = 3.6 + r() * 2.2;
      b.scale.set(bs, bs * (0.85 + r() * 0.3), bs); b.position.set((r() - 0.5) * 3, 7 + k * 2.2 + r(), (r() - 0.5) * 3); b.rotation.set(r() * 3, r() * 3, r() * 3);
      t.add(b);
    }
    t.position.set(x, 0, z); t.scale.setScalar(s); g.add(t);
  };
  const back = opts.back ?? -60;
  for (let x = -75; x <= 75; x += 7 + r() * 6) place(x, back - r() * 22, 0.9 + r() * 0.6);
  if (opts.front) for (let x = -75; x <= 75; x += 7 + r() * 6) place(x, opts.front + r() * 22, 0.9 + r() * 0.6);
  if (opts.sides !== false) for (let z = -52; z <= 20; z += 8 + r() * 6) { place(-50 - r() * 14, z, 0.8 + r() * 0.5); place(50 + r() * 14, z, 0.8 + r() * 0.5); }
}
function fence(g, seed, color = [0.075, 0.45, 0.5]) {
  const r = rng(seed), plank = new THREE.BoxGeometry(0.5, 5.2, 0.12), spots = [];
  for (let x = -26; x <= 26; x += 0.52) spots.push([x, -46, 0]);
  for (let z = -46; z <= 10; z += 0.52) { spots.push([-26, z, Math.PI / 2]); spots.push([26, z, Math.PI / 2]); }
  const mesh = new THREE.InstancedMesh(plank, lam(0xffffff), spots.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  spots.forEach(([x, z, a], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); m.compose(new THREE.Vector3(x, 2.6 + (i % 2) * 0.08, z), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.setHSL(color[0] + r() * 0.015, color[1], color[2] + r() * 0.08));
  });
  g.add(mesh);
}
function stringLights(g, poles, spans, height = 10.6, density = 2, bright = 0.55) {
  const poleMat = lam(0x3b2a1c);
  for (const [x, z] of poles) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, height + 0.4, 6), poleMat), x, (height + 0.4) / 2, z, false);
  const bulbGeo = new THREE.SphereGeometry(0.16, 10, 8), bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: bright });
  for (const [a, b] of spans) {
    const pts = [];
    for (let k = 0; k <= 24; k++) { const t = k / 24; pts.push(new THREE.Vector3(lerp(a[0], b[0], t), height - 1.6 * 4 * t * (1 - t), lerp(a[1], b[1], t))); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2018 })));
    for (let k = 2; k < 24; k += density) {
      const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.copy(pts[k]).add(new THREE.Vector3(0, -0.25, 0)); g.add(bulb);
      const s = new THREE.Sprite(glowMat); s.position.copy(bulb.position); s.scale.setScalar(1.6); g.add(s); glowSprites.push(s);
    }
  }
}
function chair(g, x, z, faceAngle, color) {
  // A folding lawn chair; faceAngle 0 faces the thrower (+z).
  const ch = new THREE.Group(), cloth = std(color, { roughness: 0.8 }), legMat = std(0xdddddd, { metalness: 0.6, roughness: 0.3 });
  const seat = box(1.8, 0.12, 1.6, cloth); seat.position.y = 1.2; seat.rotation.x = 0.12;
  const back = box(1.8, 2, 0.12, cloth); back.position.set(0, 2.1, -0.85); back.rotation.x = 0.25;
  ch.add(seat, back);
  for (const lx of [-0.85, 0.85]) for (const lz of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), legMat); l.position.set(lx, 0.6, lz); ch.add(l); }
  ch.traverse(o => { if (o.isMesh) o.castShadow = true; });
  ch.position.set(x, 0, z); ch.rotation.y = faceAngle; g.add(ch);
}
function cooler(g, x, z, rotY, color = 0xe8392b) {
  const c = new THREE.Group();
  add(c, new THREE.Mesh(new RoundedBoxGeometry(2.1, 1.3, 1.3, 3, 0.15), std(color, { roughness: 0.5 })), 0, 0.65, 0);
  add(c, new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.3, 1.4, 3, 0.12), std(0xffffff, { roughness: 0.4 })), 0, 1.4, 0);
  c.position.set(x, 0, z); c.rotation.y = rotY; g.add(c);
}
// Two coolers by the far board, one on each side of the lane, in each side's team colour (outside the venue group so
// they can be repainted for every match).
const teamCoolers = new THREE.Group(); scene.add(teamCoolers);
function showTeamCoolers(colors) {
  teamCoolers.traverse(o => { if (o.material) o.material.dispose(); });
  teamCoolers.clear();
  for (const p of [0, 1]) cooler(teamCoolers, SIDES[p] * 5.5, -22.5, SIDES[p] * 0.35, colors[p]);
}
function truck(g, x, z, rotY, color) {
  const t = new THREE.Group(), paint = std(color, { roughness: 0.35, metalness: 0.3 }), dark = std(0x1c1f24), glass = std(0x9fc4e0, { roughness: 0.1, metalness: 0.5 });
  add(t, new THREE.Mesh(new RoundedBoxGeometry(6.5, 2.2, 16, 3, 0.4), paint), 0, 2.4, 0);
  add(t, new THREE.Mesh(new RoundedBoxGeometry(6.2, 2.4, 6, 3, 0.5), paint), 0, 4.4, -3);
  add(t, box(5.8, 1.5, 0.2, glass), 0, 4.6, -6.05, false);
  add(t, box(6.0, 0.5, 9.4, dark), 0, 3.5, 3.6, false);
  for (const wx of [-3.1, 3.1]) for (const wz of [-5, 5]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.1, 18), dark); w.rotation.z = Math.PI / 2; add(t, w, wx, 1.4, wz); }
  t.position.set(x, 0, z); t.rotation.y = rotY; g.add(t);
}
function tent(g, x, z, color) {
  const t = new THREE.Group(), legMat = std(0xcccccc, { metalness: 0.5 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 3, 4, 1), std(color, { roughness: 0.8 })); roof.rotation.y = Math.PI / 4; add(t, roof, 0, 8.5, 0);
  add(t, box(10.2, 0.6, 10.2, std(color)), 0, 6.9, 0);
  for (const lx of [-5, 5]) for (const lz of [-5, 5]) add(t, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 7, 6), legMat), lx, 3.5, lz);
  t.position.set(x, 0, z); g.add(t);
}
function palm(g, x, z, h, lean) {
  const p = new THREE.Group(), bark = lam(0x9b7a52), leaf = lam(0x2f9a3e, { side: THREE.DoubleSide, flatShading: true });
  let px = 0, py = 0;
  for (let k = 0; k < 8; k++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.45 - k * 0.03, 0.5 - k * 0.03, h / 8 + 0.1, 7), bark);
    px += lean * k * 0.08; py += h / 8;
    seg.position.set(px, py - h / 16, 0); seg.rotation.z = -lean * 0.25; p.add(seg);
  }
  for (let k = 0; k < 7; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 7, 1, 4), leaf);
    const pos = f.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const yy = pos.getY(i); pos.setZ(i, -0.06 * (yy + 3.5) * (yy + 3.5)); }
    f.geometry.translate(0, 3.5, 0); f.geometry.computeVertexNormals();
    f.position.set(px, py, 0); f.rotation.set(-1.1, k * Math.PI * 2 / 7, 0, "YXZ"); p.add(f);
  }
  p.position.set(x, 0, z); g.add(p);
}
function umbrella(g, x, z, color) {
  const u = new THREE.Group();
  add(u, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), std(0xffffff)), 0, 3.5, 0);
  const top = new THREE.Mesh(new THREE.ConeGeometry(4.5, 1.6, 10, 1, true), std(color, { side: THREE.DoubleSide, roughness: 0.8 })); add(u, top, 0, 7, 0);
  u.position.set(x, 0, z); u.rotation.z = 0.08; g.add(u);
}
function barrel(g, x, z) {
  const b = new THREE.Group(), wood = std(0x8a5a2b), band = std(0x333333, { metalness: 0.6 });
  add(b, new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3, 16), wood), 0, 1.5, 0);
  for (const y of [0.5, 2.5]) add(b, new THREE.Mesh(new THREE.CylinderGeometry(1.13, 1.13, 0.18, 16), band), 0, y, 0, false);
  b.position.set(x, 0, z); g.add(b);
}
function picnicTable(g, x, z, rotY) {
  const t = new THREE.Group(), wood = std(0x9c6a3a);
  add(t, box(3, 0.2, 7, wood), 0, 2.5, 0);
  for (const sx of [-2.1, 2.1]) add(t, box(1, 0.18, 7, wood), sx, 1.5, 0);
  for (const sz of [-2.8, 2.8]) add(t, box(4.6, 2.5, 0.3, wood), 0, 1.25, sz);
  t.position.set(x, 0, z); t.rotation.y = rotY; g.add(t);
}
function wallTexture(kind) {
  const r = rng(12);
  return canvasTex(512, 256, (c, w, h) => {
    if (kind === "brick") {
      c.fillStyle = "#6e3b2a"; c.fillRect(0, 0, w, h);
      for (let row = 0; row < h / 16; row++) for (let col = -1; col < w / 40 + 1; col++) { c.fillStyle = `hsl(${8 + r() * 10},${45 + r() * 15}%,${28 + r() * 12}%)`; c.fillRect(col * 40 + (row % 2) * 20 + 1, row * 16 + 1, 38, 14); }
    } else { // crowd
      c.fillStyle = "#1c2236"; c.fillRect(0, 0, w, h);
      const cols = ["#ff4b3a", "#2f86ff", "#ffc93a", "#ffffff", "#3ee07a", "#ff8a1f", "#a24bff"];
      for (let y = 6; y < h; y += 12) for (let x = 4; x < w; x += 10) { c.fillStyle = cols[Math.floor(r() * cols.length)]; c.beginPath(); c.arc(x + r() * 3, y + r() * 3, 3.2, 0, 7); c.fill(); }
    }
  }, [1, 1]);
}
function stands(g, z, width, rows, rotY = 0, x = 0) {
  const s = new THREE.Group(), tex = wallTexture("crowd"), concrete = std(0x8a8f99);
  tex.repeat.set(width / 30, 1);
  for (let k = 0; k < rows; k++) {
    add(s, box(width, 2.2, 3.2, concrete), 0, 1.1 + k * 2.2, -k * 3.2, false);
    const crowd = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.2), new THREE.MeshLambertMaterial({ map: tex }));
    crowd.position.set(0, 3.3 + k * 2.2, -k * 3.2 + 1.61); s.add(crowd);
  }
  s.position.set(x, 0, z); s.rotation.y = rotY; g.add(s);
}
function floodlight(g, x, z) {
  const f = new THREE.Group();
  add(f, new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 60, 8), std(0x7d838c)), 0, 30, 0, false);
  const panel = box(9, 6, 0.6, new THREE.MeshBasicMaterial({ color: 0xfffbe6 })); panel.position.set(0, 62, 0); panel.lookAt(new THREE.Vector3(0, 0, -27).sub(new THREE.Vector3(x, 0, z)).add(new THREE.Vector3(0, 62, 0))); f.add(panel);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, fog: false }));
  glow.position.set(0, 62, 0); glow.scale.setScalar(30); f.add(glow);
  f.position.set(x, 0, z); g.add(f);
}
function jumbotron(g) {
  const tex = canvasTex(512, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#14306b"); gr.addColorStop(1, "#071634"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffc93a"; c.font = "bold 64px Arial Black, sans-serif"; c.textAlign = "center"; c.fillText("CORNHOLE", w / 2, h / 2 + 4);
    c.fillStyle = "#ffffff"; c.font = "bold 30px Arial, sans-serif"; c.fillText("STADIUM FINALS", w / 2, h / 2 + 52);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
  screen.position.set(0, 42, -94); g.add(screen);
  add(g, box(42, 22, 2, std(0x222222)), 0, 42, -95.2, false);
}
function ocean(g) {
  const tex = canvasTex(256, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#1e88c9"); gr.addColorStop(1, "#38b6e0"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2; for (let y = 10; y < h; y += 22) { c.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x / 18 + y) * 3; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke(); }
  }, [30, 6]);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 300), new THREE.MeshLambertMaterial({ map: tex }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.05, -230); g.add(sea);
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(1200, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  surf.rotation.x = -Math.PI / 2; surf.position.set(0, 0.07, -81); g.add(surf);
}

// Things that move with the scenery: falling snow, fire, lapping water. venueTick runs every frame.
let venueAnim = [];
function venueTick(dt, t) {
  for (const a of venueAnim) {
    if (a.kind === "snow") {
      const pos = a.o.geometry.attributes.position, w = S.wind || { mph: 0, dir: 0 };
      const wx = Math.sin(w.dir) * w.mph * 0.35, wz = -Math.cos(w.dir) * w.mph * 0.35; // flakes drift with the wind
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i) + (wx + Math.sin(t * 0.7 + i) * 0.6) * dt, y = pos.getY(i) - a.speed[i] * dt, z = pos.getZ(i) + wz * dt;
        if (y < 0) { y += 34; x = (Math.random() - 0.5) * 90; z = -70 + Math.random() * 100; }
        if (x < -45) x += 90; else if (x > 45) x -= 90;
        if (z < -70) z += 100; else if (z > 30) z -= 100;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    } else if (a.kind === "flame") {
      const f = 0.75 + 0.25 * Math.sin(t * a.rate + a.phase) + (Math.random() - 0.5) * 0.18;
      a.o.scale.set(a.size * (0.8 + 0.2 * f), a.size * (1.1 + 0.5 * f), 1);
      a.o.position.y = a.y + 0.15 * f;
    } else if (a.kind === "firelight") {
      a.o.intensity = a.base * (0.8 + 0.2 * Math.sin(t * 9) + (Math.random() - 0.5) * 0.25);
    } else if (a.kind === "person") {
      const k = t * 1.6 + a.phase;
      a.o.position.y = (a.y0 || 0) + Math.abs(Math.sin(k)) * 0.04; a.o.rotation.y = a.base + Math.sin(k * 0.37) * 0.12;
      a.head.rotation.y = Math.sin(k * 0.5) * 0.35;
      if (a.pose === "cheer") for (const arm of a.arms) arm.rotation.x = Math.PI * 0.9 + Math.sin(k * 3) * 0.25;
      else if (a.pose === "drink") a.arms[1].rotation.x = -1.9 + Math.max(0, Math.sin(k * 0.6)) * -0.5;
    } else if (a.kind === "smoke") {
      const w = S.wind || { mph: 0, dir: 0 };
      for (const pf of a.puffs) {
        pf.t = (pf.t + dt / a.life) % 1;
        const u = pf.t;
        pf.s.position.set(a.x + Math.sin(w.dir) * w.mph * 0.25 * u * 6 + Math.sin(u * 9 + pf.t) * 0.3, (a.y0 || 3.4) + u * 11, a.z - Math.cos(w.dir) * w.mph * 0.25 * u * 6);
        pf.s.scale.setScalar(0.8 + u * 4.5); pf.s.material.opacity = Math.sin(Math.PI * u) * 0.55;
      }
    } else if (a.kind === "flag") {
      a.o.rotation.y = Math.sin(t * 3 + a.phase) * 0.35;
    } else if (a.kind === "wheel") {
      a.o.rotation.z += dt * 0.12; for (const c of a.cars) c.rotation.z = -a.o.rotation.z;
    } else if (a.kind === "sea") { // two layers of ripples drifting different ways
      a.n1.offset.set((t * 0.004) % 1, (t * 0.009) % 1); a.n2.offset.set((-t * 0.006) % 1, (t * 0.005) % 1);
    } else if (a.kind === "surf") { // a crest rolls in and breaks, then the foam runs up the sand, thins out and fades
      for (const w of a.waves) {
        w.t = (w.t + dt / 7.5) % 1; const u = w.t;
        const roll = Math.min(1, u / 0.45); // 0..0.45: the crest comes in; after that the foam washes up
        w.crest.position.x = SHORE_X + 34 - roll * 30; w.crest.scale.set(1, 1, 0.4 + Math.sin(roll * Math.PI) * 1.1);
        w.crest.position.y = -0.3 + Math.sin(roll * Math.PI) * 0.4; w.crest.material.opacity = u < 0.45 ? Math.sin(roll * Math.PI * 0.95) * 0.85 : 0;
        const v = Math.max(0, (u - 0.38) / 0.62);
        w.o.position.x = SHORE_X + 4 - v * 13; w.o.scale.x = 0.6 + v * 2.2;
        w.o.material.opacity = Math.min(1, v * 6) * Math.pow(1 - v, 1.3) * 0.95;
      }
    } else if (a.kind === "bob") {
      const amp = a.slow ? 0.15 : 1; a.o.position.y = a.y + Math.sin(t * 1.1 + a.phase) * 0.35 * amp; a.o.rotation.z = Math.sin(t * 0.9 + a.phase) * 0.06 * amp; a.o.rotation.x = Math.sin(t * 0.7 + a.phase) * 0.04 * amp;
    } else if (a.kind === "gull") {
      const ang = a.phase + t * a.speed;
      a.o.position.set(a.cx + Math.cos(ang) * a.rad, a.h + Math.sin(t * 0.5 + a.phase) * 2, a.cz + Math.sin(ang) * a.rad);
      a.o.rotation.y = -ang + (a.speed > 0 ? 0 : Math.PI); a.o.rotation.z = Math.sign(a.speed) * 0.25;
      const f = Math.sin(t * 7 + a.phase) * 0.5; a.wings[0].rotation.z = f; a.wings[1].rotation.z = -f;
    } else if (a.kind === "skier") { // carving down the slope to the left, then back to the top
      a.t = (a.t + dt * a.speed) % 1;
      const x = SLOPE_X - 6 - a.t * 260, z = a.z0 + Math.sin(a.t * 18 + a.ph) * a.wig, dz = Math.cos(a.t * 18 + a.ph) * a.wig * 18 * a.speed;
      a.o.position.set(x, slopeY(x), z); a.o.rotation.set(0, Math.atan2(-260 * a.speed, dz), -dz * 0.02);
      a.o.visible = a.t > 0.02;
    } else if (a.kind === "lift") { // chairs go up one side and come down the other
      const L = a.A.distanceTo(a.B);
      for (const c of a.chairs) {
        c.t = (c.t + dt * 0.012) % 1;
        const up = c.t < 0.5, u = up ? c.t * 2 : 2 - c.t * 2;
        const p = a.A.clone().addScaledVector(a.dir, L * u).addScaledVector(a.side, up ? 4.5 : -4.5);
        c.o.position.set(p.x, p.y + a.H + 1 - 7, p.z); c.o.rotation.y = Math.atan2(a.dir.x, a.dir.z) + (up ? 0 : Math.PI);
      }
    } else if (a.kind === "cruise") { // a boat crossing far out, round and round
      a.x0 += a.speed * dt; if (a.x0 > 600) a.x0 = -600; if (a.x0 < -600) a.x0 = 600;
      a.o.position.set(a.x0, Math.sin(t * 1.2 + a.z) * 0.2, a.z); a.o.rotation.y = a.speed > 0 ? 0 : Math.PI;
    } else if (a.kind === "mixer") { a.mixer.update(dt);
    } else if (a.kind === "dance") { // bouncing to the beat, arms pumping
      const k = t * a.rate + a.phase; a.o.position.y = Math.abs(Math.sin(k)) * 0.5; a.o.rotation.y = a.base + Math.sin(k * 0.5) * 0.6;
      for (const [i, arm] of a.arms.entries()) arm.rotation.x = Math.PI * 0.8 + Math.sin(k * 2 + i * Math.PI) * 0.5;
    } else if (a.kind === "led") { a.tex.offset.x = (t * 0.2) % 1;
    } else if (a.kind === "sweep") { const k = t * a.speed + a.phase; a.o.position.set(a.cx + Math.cos(k) * a.rad, 9 + Math.sin(k * 1.7) * 2, a.cz + Math.sin(k) * a.rad);
    } else if (a.kind === "blink") { a.o.material.opacity = Math.sin(t * 2.5 + a.phase) > 0.2 ? 1 : 0.1;
    } else if (a.kind === "water") {
      a.o.offset.x = (a.o.offset.x + dt * 0.006) % 1; a.o.offset.y = Math.sin(t * 0.4) * 0.02;
    }
  }
}
function house(g, x, z, rotY, color = 0xf2e6d0, roofColor = 0x5a3a2a) {
  const h = new THREE.Group(), wall = std(color), win = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  add(h, box(20, 10, 14, wall), 0, 5, 0);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 22, 3, 1), std(roofColor, { flatShading: true }));
  roof.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); roof.scale.set(1, 1, 0.6); // a triangular prism along x, ridge up
  add(h, roof, 0, 12.7, 0);
  for (const wx of [-6, 6]) add(h, box(3, 3, 0.2, win), wx, 5.5, -7.05, false);
  add(h, box(3, 6, 0.2, std(0x6a3f2a)), 0, 3, -7.05, false);
  h.position.set(x, 0, z); h.rotation.y = rotY; g.add(h);
}
function pine(g, x, z, s, snowy) {
  const p = new THREE.Group(), needles = lam(0x1f5a3a, { flatShading: true }), cap = lam(0xffffff, { flatShading: true });
  add(p, new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3, 6), lam(0x5a3a22)), 0, 1.5, 0);
  for (let k = 0; k < 3; k++) {
    const r = 3.6 - k * 0.95, hh = 4.4 - k * 0.6, y = 3 + k * 2.6;
    add(p, new THREE.Mesh(new THREE.ConeGeometry(r, hh, 8), needles), 0, y + hh / 2, 0);
    if (snowy) add(p, new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, hh * 0.45, 8), cap), 0, y + hh * 0.8, 0, false);
  }
  p.position.set(x, 0, z); p.scale.setScalar(s); g.add(p);
}
function mountains(g, seed, snowy, color = 0x7d8fa8) {
  const r = rng(seed), rock = lam(color, { flatShading: true }), snow = lam(0xf4f8ff, { flatShading: true });
  for (let k = 0; k < 22; k++) {
    const a = k / 22 * Math.PI * 2 + r() * 0.2, d = 230 + r() * 70, hgt = 50 + r() * 70, rad = 45 + r() * 40;
    const m = new THREE.Group();
    add(m, new THREE.Mesh(new THREE.ConeGeometry(rad, hgt, 7), rock), 0, hgt / 2 - 2, 0, false);
    if (snowy) add(m, new THREE.Mesh(new THREE.ConeGeometry(rad * 0.4, hgt * 0.4, 7), snow), 0, hgt * 0.8 - 2, 0, false);
    m.position.set(Math.sin(a) * d, 0, -15 + Math.cos(a) * d); m.rotation.y = r() * 3; g.add(m);
  }
}
function cabin(g, x, z, rotY) {
  const c = new THREE.Group();
  const logs = canvasTex(256, 256, (cx, w, h) => { for (let y = 0; y < h; y += 32) { const gr = cx.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, "#9a6438"); gr.addColorStop(0.5, "#7a4a26"); gr.addColorStop(1, "#4a2a14"); cx.fillStyle = gr; cx.fillRect(0, y, w, 32); } }, [2, 1]);
  const wall = new THREE.MeshStandardMaterial({ map: logs, roughness: 0.9 }), win = new THREE.MeshBasicMaterial({ color: 0xffcf7a });
  add(c, box(18, 9, 12, wall), 0, 4.5, 0);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 20, 3, 1), lam(0xf6f9ff, { flatShading: true }));
  roof.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); roof.scale.set(1, 1, 0.55); add(c, roof, 0, 11.3, 0);
  add(c, box(2, 6, 2, std(0x6a6a70)), 5, 15, 2);
  for (const wx of [-5, 5]) add(c, box(3.2, 3, 0.2, win), wx, 5, 6.05, false);
  add(c, box(3, 6, 0.2, std(0x4a2a14)), 0, 3, 6.05, false);
  const pl = new THREE.PointLight(0xffb060, 14, 18, 1.6); pl.position.set(0, 4, 8.5); c.add(pl);
  c.position.set(x, 0, z); c.rotation.y = rotY; g.add(c);
}
function snowman(g, x, z, rotY) {
  const m = new THREE.Group(), white = std(0xf8fbff, { roughness: 0.9 });
  add(m, new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), white), 0, 1.4, 0);
  add(m, new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), white), 0, 3.6, 0);
  add(m, new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), white), 0, 5.2, 0);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), std(0xff7a1a)); nose.rotation.x = Math.PI / 2; add(m, nose, 0, 5.2, 0.95);
  for (const ex of [-0.28, 0.28]) add(m, new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), std(0x111111)), ex, 5.45, 0.72, false);
  add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.35, 16), std(0xd62828)), 0, 4.45, 0, false); // scarf
  add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 16), std(0x1c1c22)), 0, 6.2, 0);
  add(m, new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.1, 16), std(0x1c1c22)), 0, 5.75, 0, false);
  m.position.set(x, 0, z); m.rotation.y = rotY; g.add(m);
}
function snowfall(g, n = 1600) {
  const pos = new Float32Array(n * 3), speed = [];
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 90; pos[i * 3 + 1] = Math.random() * 34; pos[i * 3 + 2] = -70 + Math.random() * 100; speed.push(2 + Math.random() * 2.5); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: 0xffffff, size: 0.35, transparent: true, depthWrite: false, opacity: 0.95 }));
  pts.frustumCulled = false; g.add(pts);
  venueAnim.push({ kind: "snow", o: pts, speed });
}
const flameTex = canvasTex(64, 128, (c) => { const g = c.createRadialGradient(32, 92, 2, 32, 80, 60); g.addColorStop(0, "rgba(255,250,210,1)"); g.addColorStop(0.3, "rgba(255,190,70,.95)"); g.addColorStop(0.7, "rgba(255,90,20,.5)"); g.addColorStop(1, "rgba(255,60,0,0)"); c.fillStyle = g; c.beginPath(); c.moveTo(32, 0); c.quadraticCurveTo(64, 70, 50, 110); c.quadraticCurveTo(32, 128, 14, 110); c.quadraticCurveTo(0, 70, 32, 0); c.fill(); });
function flame(g, x, y, z, size) {
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  f.center.set(0.5, 0.1); f.position.set(x, y, z); f.scale.set(size, size * 1.4, 1); g.add(f);
  venueAnim.push({ kind: "flame", o: f, y, size, rate: 6 + Math.random() * 5, phase: Math.random() * 6 });
}
function bonfire(g, x, z) {
  const b = new THREE.Group(), stone = lam(0x6b6b70, { flatShading: true }), wood = std(0x5a3418);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), stone); add(b, s, Math.cos(a) * 2.4, 0.3, Math.sin(a) * 2.4); }
  for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.6, 7), wood); l.rotation.set(0.9, k / 5 * Math.PI * 2, 0, "YXZ"); add(b, l, 0, 1.1, 0); }
  b.position.set(x, 0, z); g.add(b);
  flame(g, x, 0.4, z, 2.6); flame(g, x - 0.5, 0.4, z + 0.3, 1.8); flame(g, x + 0.6, 0.4, z - 0.2, 1.9); flame(g, x, 0.6, z, 1.3);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
  glow.position.set(x, 2.5, z); glow.scale.setScalar(12); g.add(glow);
  const pl = new THREE.PointLight(0xff8a3a, 60, 40, 1.5); pl.position.set(x, 4, z); g.add(pl);
  venueAnim.push({ kind: "firelight", o: pl, base: 60 });
  for (const [lx, lz, ry] of [[x - 5, z, 0], [x + 5, z, 0], [x, z + 5, Math.PI / 2]]) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 10), wood); log.rotation.set(Math.PI / 2, ry, 0, "YXZ"); add(g, log, lx, 0.6, lz); }
}
function tiki(g, x, z) {
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lam(0x7a5232)), x, 3, z);
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.8, 8), lam(0x3b2a1c)), x, 6.2, z);
  flame(g, x, 6.5, z, 0.9);
}
function waterTexture(deep = "#0f7fb8", shallow = "#22b8d8") {
  return canvasTex(256, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, deep); gr.addColorStop(1, shallow); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(255,255,255,.28)"; c.lineWidth = 2;
    for (let y = 8; y < h; y += 18) { c.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x / 16 + y) * 3; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke(); }
  }, [1, 1]);
}
function island(g, x, z, rad, sandTex) {
  const shallow = new THREE.Mesh(new THREE.CircleGeometry(rad * 1.7, 48), new THREE.MeshBasicMaterial({ color: 0x5fe0e6, transparent: true, opacity: 0.45, depthWrite: false }));
  shallow.rotation.x = -Math.PI / 2; shallow.position.set(x, 0.03, z); g.add(shallow);
  const wet = new THREE.Mesh(new THREE.CircleGeometry(rad * 1.12, 48), lam(0xc9b27a)); wet.rotation.x = -Math.PI / 2; wet.position.set(x, 0.035, z); wet.receiveShadow = true; g.add(wet);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 })); sand.rotation.x = -Math.PI / 2; sand.position.set(x, 0.04, z); sand.receiveShadow = true; g.add(sand);
}
function farIsland(g, x, z, s, r) {
  const m = new THREE.Group();
  const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x2f8a46, { flatShading: true })); hill.scale.set(s, s * (0.35 + r() * 0.3), s * 0.8); m.add(hill);
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.12, s * 1.18, 0.6, 20), lam(0xead39c)); beach.scale.z = 0.8; beach.position.y = 0.1; m.add(beach);
  m.position.set(x, 0, z); g.add(m);
}
function rowboat(g, x, z, rotY) {
  const b = new THREE.Group(), hull = std(0xd62828, { roughness: 0.5 }), wood = std(0xb08050);
  const shape = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.9, 7, 12, 1, true, 0, Math.PI), hull); shape.rotation.set(Math.PI / 2, 0, Math.PI); shape.scale.set(1, 1, 0.6); add(b, shape, 0, 0.6, 0);
  add(b, box(2.4, 0.15, 0.6, wood), 0, 0.6, 0.6); add(b, box(2.4, 0.15, 0.6, wood), 0, 0.6, -1.6);
  b.position.set(x, 0, z); b.rotation.y = rotY; g.add(b);
}

function windowTex(seed, lit = 0.55) {
  const r = rng(seed);
  return canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = "#1b2233"; c.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) { c.fillStyle = r() < lit ? `hsl(${40 + r() * 20},90%,${60 + r() * 25}%)` : "#0e1420"; c.fillRect(x, y, 8, 9); }
  }, [1, 1]);
}
function skyline(g, seed) {
  const r = rng(seed), texs = [windowTex(seed), windowTex(seed + 1, 0.4), windowTex(seed + 2, 0.7)];
  for (let k = 0; k < 46; k++) {
    const a = k / 46 * Math.PI * 2 + r() * 0.1, d = 90 + r() * 130, w = 14 + r() * 22, hgt = 30 + r() * 110;
    const t = texs[k % 3].clone(); t.needsUpdate = true; t.repeat.set(Math.round(w / 10), Math.round(hgt / 20));
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w), new THREE.MeshBasicMaterial({ map: t, fog: true }));
    b.position.set(Math.sin(a) * d, hgt / 2 - 20, -15 + Math.cos(a) * d); b.rotation.y = r() * 3; g.add(b);
    if (r() < 0.3) { const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); l.position.set(b.position.x, hgt - 19, b.position.z); l.scale.setScalar(4); g.add(l); }
  }
}
function waterTower(g, x, z) {
  const t = new THREE.Group(), wood = std(0x7a5232), metal = std(0x555a60, { metalness: 0.5 });
  for (const lx of [-2, 2]) for (const lz of [-2, 2]) add(t, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), metal), lx, 4, lz);
  add(t, new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 6, 16), wood), 0, 11, 0);
  add(t, new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 16), metal), 0, 15.2, 0);
  t.position.set(x, 0, z); g.add(t);
}
function acUnit(g, x, z) { const u = new THREE.Group(); add(u, box(4, 2.6, 3, std(0xb8bcc4, { metalness: 0.3 })), 0, 1.3, 0); add(u, new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 16), std(0x333333)), 0, 2.7, 0); u.position.set(x, 0, z); g.add(u); }
function cactus(g, x, z, s) {
  const c = new THREE.Group(), m = lam(0x3f8a3c, { flatShading: true });
  add(c, new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 8, 8), m), 0, 4, 0);
  add(c, new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), m), 0, 8, 0, false);
  for (const [sx, y, hgt] of [[-1, 3.5, 3], [1, 5, 2.4]]) {
    add(c, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 8), m).rotateZ(Math.PI / 2), sx * 1.1, y, 0);
    add(c, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, hgt, 8), m), sx * 1.8, y + hgt / 2, 0);
  }
  c.position.set(x, 0, z); c.scale.setScalar(s); c.rotation.y = Math.random() * 3; g.add(c);
}
function mesas(g, seed) {
  const r = rng(seed), rock = [lam(0xb5562f, { flatShading: true }), lam(0xc8703a, { flatShading: true }), lam(0x9a4426, { flatShading: true })];
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2 + r() * 0.2, d = 160 + r() * 120, rad = 18 + r() * 30, hgt = 25 + r() * 45;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad, hgt, 7 + Math.floor(r() * 3)), rock[k % 3]);
    m.position.set(Math.sin(a) * d, hgt / 2, -15 + Math.cos(a) * d); m.rotation.y = r() * 3; g.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.86, rad * 0.86, 2, 8), rock[(k + 1) % 3]); cap.position.set(m.position.x, hgt + 0.5, m.position.z); g.add(cap);
  }
  const rocks = lam(0xa0502c, { flatShading: true });
  for (let k = 0; k < 24; k++) { const a = r() * Math.PI * 2, d = 40 + r() * 60, s = 1 + r() * 3; const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rocks); b.position.set(Math.sin(a) * d, s * 0.4, -15 + Math.cos(a) * d); b.rotation.set(r() * 3, r() * 3, 0); g.add(b); }
}
function ferrisWheel(g, x, z) {
  const w = new THREE.Group(), frame = std(0xe8e8f0, { metalness: 0.4 }), R = 22;
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.4, 8, 64), frame));
  const bulbs = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd36a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const cars = [];
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, R, 6), frame); sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
    const b = new THREE.Sprite(bulbs); b.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.5); b.scale.setScalar(3); wheel.add(b);
    const car = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2), std(new THREE.Color().setHSL(k / 16, 0.8, 0.55))); car.position.set(Math.cos(a) * R, Math.sin(a) * R - 1.4, 0); wheel.add(car); cars.push(car);
  }
  wheel.position.y = R + 3; w.add(wheel);
  for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, R + 6, 8), frame); leg.position.set(sx * 6, (R + 3) / 2, 0); leg.rotation.z = sx * 0.25; w.add(leg); }
  w.position.set(x, 0, z); w.rotation.y = Math.atan2(-x, -15 - z); // face the court g.add(w);
  venueAnim.push({ kind: "wheel", o: wheel, cars });
}
function stripedTent(g, x, z, r, colors) {
  const tex = canvasTex(256, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = colors[i % 2]; c.fillRect(i * w / 8, 0, w / 8, h); } });
  const t = new THREE.Group();
  add(t, new THREE.Mesh(new THREE.CylinderGeometry(r, r, 5, 16, 1, true), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 })), 0, 2.5, 0);
  add(t, new THREE.Mesh(new THREE.ConeGeometry(r * 1.1, r * 0.9, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })), 0, 5 + r * 0.45, 0);
  add(t, new THREE.Mesh(new THREE.ConeGeometry(0.3, 2, 6), std(colors[0])), 0, 5 + r * 0.9 + 1, 0, false);
  t.position.set(x, 0, z); g.add(t);
}
function dock(g, x, z, len, rotY) {
  const d = new THREE.Group(), wood = std(0x8a6a48);
  add(d, box(5, 0.4, len, wood), 0, 1.4, -len / 2);
  for (let k = 0; k <= len; k += 6) for (const sx of [-2.3, 2.3]) add(d, new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 6), wood), sx, 0.5, -k);
  d.position.set(x, 0, z); d.rotation.y = rotY; g.add(d);
}

// ───────────────────────── Photo-real assets (Poly Haven, CC0): sky lighting, photo textures and 3D models.
// Files live in web/assets/polyhaven/ (packed to .json/.jpg by web/tools/pack_assets.py; copied flat into the iPhone app). Anything that fails to load just
// leaves the simpler built-in look in place.
const ASSETS = "assets/polyhaven/", FT = 3.2808; // models are in metres; the court is in feet
const gltfLoader = new GLTFLoader(), modelCache = new Map(), texLoader = new THREE.TextureLoader();
function loadModel(name) {
  if (!modelCache.has(name)) modelCache.set(name, gltfLoader.loadAsync(`${ASSETS}${name}/${name}_1k.json`).then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g.scene;
  }).catch(() => null));
  return modelCache.get(name);
}
// Drop a model into venue group g once it has loaded (skipped if the venue changed meanwhile).
function placeModel(g, name, x, z, rotY = 0, scale = 1) {
  loadModel(name).then(src => {
    if (!src || venueGroup !== g) return;
    const m = src.clone(); m.position.set(x, 0, z); m.rotation.y = rotY; m.scale.setScalar(FT * scale); g.add(m);
  });
}
// A photo material: colour, normal and roughness maps, tiled `rx` by `ry` times. It starts as a plain colour and
// swaps in the photo maps once they've all loaded, so a missing file never leaves a black surface.
function photoMat(name, rx, ry, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color: extra.fallback ?? 0x888888, roughness: 0.95 });
  const load = k => texLoader.loadAsync(`${ASSETS}tex/${name}_${k}_1k.jpg`).then(tx => {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(rx, ry); tx.anisotropy = maxAniso;
    if (extra.rotate) { tx.center.set(0.5, 0.5); tx.rotation = extra.rotate; }
    return tx;
  });
  Promise.all([load("diff"), load("nor"), load("rough")]).then(([map, nor, rough]) => {
    map.colorSpace = THREE.SRGBColorSpace;
    Object.assign(m, { map, normalMap: nor, roughnessMap: rough, roughness: 1 });
    m.color.set(extra.tint ?? 0xffffff); m.normalScale.set(extra.bump ?? 1, extra.bump ?? 1); m.needsUpdate = true;
    if (extra.onReady) extra.onReady(m);
  }).catch(() => { /* keep the plain colour */ });
  return m;
}
// Real sky: an HDR photo of the sky lights the scene (reflections, soft fill) and is the backdrop.
const skyCache = new Map();
function loadSky(file) {
  if (skyCache.has(file)) return skyCache.get(file);
  // The HDR file is stored base64 in a .json (web hosts serve that); decode it back to bytes for the loader.
  const hdrUrl = fetch(`${ASSETS}${file}.json`).then(r => r.json()).then(j => {
    const bin = atob(j.b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes]));
  });
  const p = (hdrUrl.then(url => new RGBELoader().loadAsync(url)).then(t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer), env = pm.fromEquirectangular(t).texture; pm.dispose();
    return { bg: t, env };
  }).catch(() => null));
  skyCache.set(file, p); return p;
}
function clearPhotoSky() { scene.environment = null; scene.background = null; skyMesh.visible = true; scene.environmentIntensity = 1; scene.backgroundIntensity = 1; }
function plankFence(g) {
  const post = std(0x4a3420, { roughness: 0.9 });
  const wall = (len, x, z, rot) => {
    const m = photoMat("weathered_brown_planks", 1, len / 5, { rotate: Math.PI / 2, fallback: 0x8a6a4a }); // boards run up and down
    const w = new THREE.Mesh(new THREE.BoxGeometry(len, 5.4, 0.3), m); w.position.set(x, 2.7, z); w.rotation.y = rot; w.castShadow = w.receiveShadow = true; g.add(w);
    for (let k = 0; k <= len; k += 8) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 6, 0.45), post); p.position.set(x + Math.cos(rot) * (k - len / 2), 3, z - Math.sin(rot) * (k - len / 2)); p.castShadow = true; g.add(p); }
  };
  wall(52, 0, -46, 0); wall(56, -26, -18, Math.PI / 2); wall(56, 26, -18, Math.PI / 2);
}

// ── Tailgate dressing: people, a smoking grill, parked cars, parking lot lights and the stadium next door.
const SKIN = [0xf1c7a5, 0xe0ac86, 0xc68e62, 0x8d5a3b, 0x5e3a25];
const SHIRTS = [0xc8102e, 0x1f3a6e, 0xffc93a, 0xffffff, 0x2fbf71, 0xff8a1f, 0x2f86ff, 0x6a2c91, 0x222222];
const PANTS = [0x2a3550, 0x3a3a40, 0x6a5a40, 0x1f2a44, 0x8a7a60];
// A simple low-poly person, about 5.5-6 ft tall, facing +z before rotY. pose: "stand", "drink" (arm raised) or "cheer".
function person(g, x, z, rotY, seed, pose = "stand") {
  const r = rng(seed), p = new THREE.Group();
  const skin = lam(SKIN[Math.floor(r() * SKIN.length)]), shirt = lam(SHIRTS[Math.floor(r() * SHIRTS.length)]), pants = lam(PANTS[Math.floor(r() * PANTS.length)]);
  const h = 0.92 + r() * 0.16, sit = pose === "sit", dy = sit ? -1.05 : 0; // sitting: hips at bench height, knees forward
  if (sit) for (const sx of [-0.22, 0.22]) {
    add(p, new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 1.3, 8), pants).rotateX(Math.PI / 2), sx, 1.6, 0.6); // thigh
    add(p, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 1.55, 8), pants), sx, 0.8, 1.2);                       // shin
    add(p, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.55), lam(0x222222)), sx, 0.09, 1.3);
  } else {
    for (const sx of [-0.22, 0.22]) add(p, new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 2.6, 8), pants), sx, 1.3, 0);
    for (const sx of [-0.22, 0.22]) add(p, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.55), lam(0x222222)), sx, 0.09, 0.08);
  }
  add(p, new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.3, 4, 10), shirt), 0, 3.35 + dy, 0);
  const head = add(p, new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), skin), 0, 4.75 + dy, 0);
  if (r() < 0.55) { // a ball cap
    const cap = lam(SHIRTS[Math.floor(r() * SHIRTS.length)]);
    add(p, new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap), 0, 4.82 + dy, 0, false);
    add(p, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), cap), 0, 4.84 + dy, 0.4, false);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.62, 4.0 + dy, 0);
    add(arm, new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 1.3, 3, 8), shirt), 0, -0.75, 0);
    add(arm, new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skin), 0, -1.55, 0, false);
    arm.rotation.z = sx * 0.12;
    if (sit) arm.rotation.x = -0.9; // forearms toward the table
    if ((pose === "drink" && sx === 1) || pose === "cheer") arm.rotation.x = pose === "cheer" ? Math.PI * 0.9 : -1.9;
    if (pose === "drink" && sx === 1) add(arm, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.38, 10), lam(0xd62828)), 0, -1.6, 0.18, false); // a soda cup
    p.add(arm); arms.push(arm);
  }
  p.position.set(x, 0, z); p.rotation.y = rotY; p.scale.setScalar(h); g.add(p);
  venueAnim.push({ kind: "person", o: p, head, arms, pose, phase: r() * 6, base: rotY });
  return p;
}
// A crowd of people, scattered around a spot and loosely facing a point.
function crowd(g, cx, cz, n, rad, seed, faceX, faceZ) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 0.8 + r() * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const face = Math.atan2(faceX - x, faceZ - z) + (r() - 0.5) * 0.9;
    person(g, x, z, face, seed * 31 + i, r() < 0.3 ? "drink" : r() < 0.12 ? "cheer" : "stand");
  }
}
const smokeTex = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(235,235,235,.85)"); gr.addColorStop(0.6, "rgba(210,210,210,.35)"); gr.addColorStop(1, "rgba(200,200,200,0)"); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
function grill(g, x, z, rotY) {
  const k = new THREE.Group(), black = std(0x1c1c1e, { metalness: 0.6, roughness: 0.4 });
  add(k, new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), black), 0, 3.0, 0);
  const lid = add(k, new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), black), 0, 3.0, 0);
  lid.rotation.x = -1.1; lid.position.set(0, 3.45, -0.9); // propped open
  add(k, new THREE.Mesh(new THREE.CircleGeometry(1.0, 20), new THREE.MeshBasicMaterial({ color: 0x3a3a3a })).rotateX(-Math.PI / 2), 0, 2.98, 0, false);
  for (const a of [0, 2.1, 4.2]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), std(0x777777, { metalness: 0.7 })); leg.position.set(Math.cos(a) * 0.65, 1.3, Math.sin(a) * 0.65); leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18); k.add(leg); }
  for (let i = 0; i < 5; i++) add(k, new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.45, 3, 8), lam(0x8a3a1a)).rotateZ(Math.PI / 2), -0.5 + i * 0.25, 3.08, (i % 2) * 0.3 - 0.15, false); // hot dogs
  const coals = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  coals.position.set(0, 3.1, 0); coals.scale.setScalar(2.4); k.add(coals);
  k.position.set(x, 0, z); k.rotation.y = rotY; g.add(k);
  // Smoke: puffs rise, drift and fade, then start again at the grill.
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.position.set(x, 3.4, z); g.add(s); puffs.push({ s, t: i / 14 });
  }
  venueAnim.push({ kind: "smoke", puffs, x, z, life: 4.5 });
}
function car(g, x, z, rotY, color, kind = "sedan") {
  const c = new THREE.Group(), paint = std(color, { roughness: 0.3, metalness: 0.35 }), dark = std(0x1c1f24), glass = std(0x8fb4d0, { roughness: 0.1, metalness: 0.5 });
  const L = kind === "suv" ? 15 : 14, H = kind === "suv" ? 2.4 : 1.8, roofH = kind === "suv" ? 2.2 : 1.7;
  add(c, new THREE.Mesh(new RoundedBoxGeometry(6, H, L, 3, 0.45), paint), 0, 1.0 + H / 2, 0);
  add(c, new THREE.Mesh(new RoundedBoxGeometry(5.4, roofH, kind === "suv" ? L * 0.62 : L * 0.5, 3, 0.5), glass), 0, 1.0 + H + roofH / 2 - 0.1, kind === "suv" ? -0.8 : 0.2);
  add(c, new THREE.Mesh(new RoundedBoxGeometry(5.5, 0.25, kind === "suv" ? L * 0.6 : L * 0.48, 2, 0.1), paint), 0, 1.0 + H + roofH - 0.15, kind === "suv" ? -0.8 : 0.2, false);
  for (const wx of [-2.9, 2.9]) for (const wz of [-L * 0.32, L * 0.32]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.9, 16), dark); w.rotation.z = Math.PI / 2; add(c, w, wx, 1.15, wz); }
  c.position.set(x, 0, z); c.rotation.y = rotY; g.add(c);
}
function lotLight(g, x, z) {
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 30, 8), std(0x8a8f99, { metalness: 0.5 })), x, 15, z, false);
  add(g, box(4, 0.6, 1.4, std(0x555a60)), x, 30, z, false);
}
// The stadium across the lot: a big oval bowl with banded concrete, a crowd-coloured rim, light towers and flags.
function stadiumNextDoor(g, cx, cz) {
  const st = new THREE.Group();
  const bands = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = "#b8b4ac"; c.fillRect(0, 0, w, h);
    for (let y = 18; y < h; y += 34) { c.fillStyle = "rgba(60,60,70,.55)"; c.fillRect(0, y, w, 8); }
    for (let x = 0; x < w; x += 32) { c.fillStyle = "rgba(255,255,255,.18)"; c.fillRect(x, 0, 3, h); }
    c.fillStyle = "#1f3a6e"; c.fillRect(0, h - 40, w, 40);
  }, [10, 1]);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(95, 100, 46, 64, 1, true), new THREE.MeshLambertMaterial({ map: bands, side: THREE.DoubleSide }));
  wall.scale.z = 0.62; wall.position.y = 23; st.add(wall);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(95, 2.2, 8, 64), lam(0xc8102e)); rim.rotation.x = Math.PI / 2; rim.scale.y = 0.62; rim.position.y = 46; st.add(rim);
  const crowdTex = wallTexture("crowd"); crowdTex.repeat.set(16, 1);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(93, 70, 22, 64, 1, true), new THREE.MeshLambertMaterial({ map: crowdTex, side: THREE.BackSide }));
  inner.scale.z = 0.62; inner.position.y = 36; st.add(inner);
  for (const [a, d] of [[0.5, 1], [2.6, 1], [3.7, 1], [5.8, 1]]) {
    const tx = Math.cos(a) * 104, tz = Math.sin(a) * 66;
    add(st, new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 70, 8), std(0x7d838c)), tx, 35, tz, false);
    add(st, box(12, 7, 1, new THREE.MeshBasicMaterial({ color: 0xfffbe6 })), tx, 72, tz, false);
  }
  for (let k = 0; k < 10; k++) { // flags around the rim
    const a = k / 10 * Math.PI * 2, fx = Math.cos(a) * 95, fz = Math.sin(a) * 59;
    add(st, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 10, 6), std(0xdddddd)), fx, 51, fz, false);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), lam(k % 2 ? 0xc8102e : 0x1f3a6e, { side: THREE.DoubleSide })); fl.position.set(fx + 2, 54.5, fz); st.add(fl);
    venueAnim.push({ kind: "flag", o: fl, phase: k });
  }
  const sign = canvasTex(512, 128, (c, w, h) => { c.fillStyle = "#1f3a6e"; c.fillRect(0, 0, w, h); c.fillStyle = "#ffc93a"; c.font = "bold 70px Arial Black, sans-serif"; c.textAlign = "center"; c.fillText("GAME DAY", w / 2, h / 2 + 24); });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(44, 11), new THREE.MeshBasicMaterial({ map: sign })); sg.position.set(0, 34, 62.5); st.add(sg);
  st.position.set(cx, 0, cz); g.add(st);
}

// A whole lot of parked cars, drawn as a few instanced meshes (one per part) so hundreds of them stay cheap on a phone.
// Each car is [x, z, rotY, color, "sedan" | "suv"].
function carLot(g, cars) {
  const m4 = new THREE.Matrix4(), part = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  for (const kind of ["sedan", "suv"]) {
    const list = cars.filter(c => c[4] === kind); if (!list.length) continue;
    const L = kind === "suv" ? 15 : 14, H = kind === "suv" ? 2.4 : 1.8, roofH = kind === "suv" ? 2.2 : 1.7, cabZ = kind === "suv" ? -0.8 : 0.2, cabL = kind === "suv" ? L * 0.62 : L * 0.5;
    const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.35 });
    const parts = [ // geometry, material, offset, painted
      [new RoundedBoxGeometry(6, H, L, 3, 0.45), paint, [[0, 1.0 + H / 2, 0]], true],
      [new RoundedBoxGeometry(5.4, roofH, cabL, 3, 0.5), std(0x8fb4d0, { roughness: 0.1, metalness: 0.5 }), [[0, 1.0 + H + roofH / 2 - 0.1, cabZ]], false],
      [new RoundedBoxGeometry(5.5, 0.25, cabL * 0.97, 2, 0.1), paint, [[0, 1.0 + H + roofH - 0.15, cabZ]], true],
      [new THREE.CylinderGeometry(1.15, 1.15, 0.9, 14).rotateZ(Math.PI / 2), std(0x1c1f24), [[-2.9, 1.15, -L * 0.32], [2.9, 1.15, -L * 0.32], [-2.9, 1.15, L * 0.32], [2.9, 1.15, L * 0.32]], false],
    ];
    for (const [geo, mat, offs, painted] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, list.length * offs.length); let i = 0;
      for (const [x, z, rot, color] of list) {
        m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(1, 1, 1));
        for (const o of offs) {
          im.setMatrixAt(i, part.copy(m4).multiply(new THREE.Matrix4().makeTranslation(...o)));
          if (painted) im.setColorAt(i, col.setHex(color));
          i++;
        }
      }
      im.castShadow = im.receiveShadow = true; g.add(im);
    }
  }
}
// The university around the stadium: red-brick halls with white trim and rows of windows, a clock tower,
// a domed library and a chapel spire, with big leafy trees between them.
function campus(g) {
  const brickTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#a34f36"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = (y / 4 % 2) * 4; x < w; x += 8) { c.fillStyle = `rgba(${90 + Math.random() * 60},${30 + Math.random() * 25},20,.25)`; c.fillRect(x, y, 7, 3); }
    c.fillStyle = "#f2efe6"; c.fillRect(0, 0, w, 6); // trim band between floors
    for (const x of [24, 88, 152, 216]) { // two windows per tile, white frame, glass with a sky glint
      c.fillStyle = "#f2efe6"; c.fillRect(x - 4, 60, 28, 140);
      const gr = c.createLinearGradient(0, 64, 0, 196); gr.addColorStop(0, "#9cc2e0"); gr.addColorStop(1, "#33495e");
      c.fillStyle = gr; c.fillRect(x, 64, 20, 132);
      c.fillStyle = "#f2efe6"; c.fillRect(x, 126, 20, 4); c.fillRect(x + 8, 64, 4, 132);
    }
  });
  const stone = std(0xeee8da), slate = std(0x4a5560, { flatShading: true }), copper = std(0x5fa58a, { roughness: 0.5, metalness: 0.2 });
  const brickFor = (w, h, d) => { // brick that keeps its scale on every face
    const front = brickTex.clone(), side = brickTex.clone();
    for (const [t, a] of [[front, w], [side, d]]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(a / 16)), Math.max(1, Math.round(h / 11))); t.needsUpdate = true; }
    const f = new THREE.MeshLambertMaterial({ map: front }), s = new THREE.MeshLambertMaterial({ map: side });
    return [s, s, stone, stone, f, f];
  };
  const hall = (x, z, w, h, d, rotY, roof = "gable") => {
    const b = new THREE.Group();
    add(b, box(w, h, d, brickFor(w, h, d)), 0, h / 2, 0, false);
    add(b, box(w + 1.2, 1.6, d + 1.2, stone), 0, h + 0.8, 0, false); // cornice
    if (roof === "gable") {
      const rad = d * 0.64, r = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, w + 1, 3, 1), slate);
      r.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); r.scale.set(1, 1, 0.6); // a triangular prism along x, ridge up
      add(b, r, 0, h + 1.6 + rad * 0.3, 0, false);
    } else if (roof === "cupola") {
      add(b, box(8, 6, 8, stone), 0, h + 4.6, 0, false);
      add(b, new THREE.Mesh(new THREE.ConeGeometry(6, 10, 8), copper), 0, h + 12.6, 0, false);
    }
    b.position.set(x, 0, z); b.rotation.y = rotY; g.add(b);
  };
  const clockTex = canvasTex(128, 128, (c, w) => {
    c.fillStyle = "#f6f2e6"; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill();
    c.strokeStyle = "#222"; c.lineWidth = 5; c.stroke();
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.fillStyle = "#222"; c.fillRect(64 + Math.cos(a) * 48 - 3, 64 + Math.sin(a) * 48 - 3, 6, 6); }
    c.lineWidth = 6; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 26); c.moveTo(64, 64); c.lineTo(92, 64); c.stroke();
  });
  const tower = (x, z, h, w = 14) => {
    const t = new THREE.Group();
    add(t, box(w, h, w, brickFor(w, h, w)), 0, h / 2, 0, false);
    add(t, box(w + 1.5, 2, w + 1.5, stone), 0, h + 1, 0, false);
    add(t, box(w - 2, 12, w - 2, stone), 0, h + 8, 0, false); // belfry
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.CircleGeometry(w * 0.34, 32), new THREE.MeshBasicMaterial({ map: clockTex })); const a = k * Math.PI / 2; f.position.set(Math.sin(a) * (w / 2 - 0.9), h + 8, Math.cos(a) * (w / 2 - 0.9)); f.rotation.y = a; t.add(f); }
    add(t, new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 30, 4), copper).rotateY(Math.PI / 4), 0, h + 29, 0, false);
    t.position.set(x, 0, z); g.add(t);
  };
  const library = (x, z, rotY) => {
    const l = new THREE.Group();
    add(l, box(70, 26, 34, brickFor(70, 26, 34)), 0, 13, 0, false);
    add(l, box(30, 3, 8, stone), 0, 27.5, 18, false); // portico roof
    for (let k = -3; k <= 3; k++) add(l, new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 26, 10), stone), k * 4.4, 13, 20, false);
    add(l, new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 8, 24), stone), 0, 30, 0, false);
    add(l, new THREE.Mesh(new THREE.SphereGeometry(13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), copper), 0, 34, 0, false);
    add(l, new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 10), stone), 0, 49, 0, false);
    l.position.set(x, 0, z); l.rotation.y = rotY; g.add(l);
  };
  // Far side, behind the stadium: the towers and dome rise over its rim.
  const H = Math.PI / 2; // side halls run along the lot
  tower(-62, -390, 92); library(95, -410, 0.15); tower(165, -330, 70, 12);
  for (const [x, z, w, h, d, rot, roof] of [
    [-250, -360, 80, 34, 30, 0.2, "gable"], [-170, -400, 60, 40, 30, 0.05, "cupola"], [-120, -330, 50, 28, 24, 0, "gable"],
    [10, -430, 90, 36, 30, 0, "gable"], [190, -400, 70, 32, 28, -0.1, "gable"], [270, -340, 60, 30, 26, -0.3, "cupola"],
    // left and right of the lot, past the parked cars
    [-205, -230, 70, 30, 34, H, "gable"], [-215, -140, 60, 26, 30, H, "cupola"], [-210, -40, 74, 32, 32, H, "gable"], [-230, 60, 60, 28, 30, H, "gable"],
    [205, -230, 70, 32, 34, H, "cupola"], [215, -130, 62, 26, 30, H, "gable"], [210, -30, 70, 30, 32, H, "gable"], [225, 70, 60, 28, 30, H, "cupola"],
  ]) hall(x, z, w, h, d, rot, roof);
  tower(-200, 10, 60, 11);
  // Big trees: a row along each side between the lot and the halls, and clumps around the far buildings.
  const r = rng(51), kinds = ["tree_oak", "tree_maple", "tree_oak", "tree_pine"], spots = [];
  for (let z = -300; z <= 90; z += 11 + r() * 8) for (const sx of [-1, 1]) spots.push([sx * (162 + r() * 14), z, 1.5 + r() * 0.7]);
  for (let x = -330; x <= 330; x += 14 + r() * 12) { const z = -290 - r() * 30; if (Math.abs(x) > 105 || r() < 0.5) spots.push([x, z, 1.6 + r() * 0.9]); }
  for (let x = -330; x <= 330; x += 20 + r() * 16) spots.push([x, -450 - r() * 30, 2 + r()]);
  for (const [x, z, s] of spots) {
    const kind = kinds[Math.floor(r() * kinds.length)], rot = r() * 6.28;
    loadBlender(kind).then(src => { if (!src || venueGroup !== g) return; const t = src.clone(); t.position.set(x, 0, z); t.rotation.y = rot; t.scale.setScalar(s); g.add(t); });
  }
  // Grass and walks around the halls, beyond the asphalt.
  const lawn = lam(0x5e9a40);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), lawn); field.rotation.x = -Math.PI / 2; field.position.set(0, -0.2, -200); g.add(field);
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(110, 520), lawn); m.rotation.x = -Math.PI / 2; m.position.set(sx * 220, 0.15, -30); m.receiveShadow = true; g.add(m); }
}

// ── Beach Shack dressing: a moving sea that reflects the sky, surf rolling in, a thatched shack and a busy beach.
// Tileable wave normals, built from sine waves with whole-number frequencies so the texture repeats seamlessly.
function waveNormalTex(seed) {
  const N = 256, r = rng(seed), waves = [];
  for (let k = 0; k < 9; k++) waves.push([Math.floor(1 + r() * 6) * (r() < 0.5 ? -1 : 1), Math.floor(1 + r() * 6), r() * 6.28, 1 / (1 + k * 0.6)]);
  const t = canvasTex(N, N, (c) => {
    const img = c.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let dx = 0, dy = 0;
      for (const [fx, fy, ph, a] of waves) { const s = Math.cos((fx * x + fy * y) / N * 6.283 + ph) * a; dx += s * fx; dy += s * fy; }
      const nx = -dx * 0.06, ny = -dy * 0.06, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const SHORE_X = 19; // the sea runs alongside the court, off to the right
function sea(g) {
  const n1 = waveNormalTex(5), n2 = waveNormalTex(9); n1.repeat.set(90, 160); n2.repeat.set(37, 61);
  const W = 1400, geo = new THREE.PlaneGeometry(W, 2400, 60, 1), col = [], c = new THREE.Color();
  const shallow = new THREE.Color(0x3fc6c4), mid = new THREE.Color(0x1590b8), deep = new THREE.Color(0x0b4f86);
  for (let i = 0; i < geo.attributes.position.count; i++) { // shallow turquoise at the shore, deep blue further out
    const d = geo.attributes.position.getX(i) + W / 2;
    c.copy(d < 45 ? shallow.clone().lerp(mid, d / 45) : mid.clone().lerp(deep, Math.min(1, (d - 45) / 260))); col.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const water = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, normalMap: n1, normalScale: new THREE.Vector2(0.28, 0.28),
    clearcoat: 1, clearcoatRoughness: 0.05, clearcoatNormalMap: n2, clearcoatNormalScale: new THREE.Vector2(0.2, 0.2), envMapIntensity: 1.1 });
  const m = new THREE.Mesh(geo, water); m.rotation.x = -Math.PI / 2; m.position.set(SHORE_X + W / 2, 0.12, -600); m.receiveShadow = true; g.add(m);
  venueAnim.push({ kind: "sea", n1, n2 });
  // Waves: a white crest builds out past the shallows, breaks, and its foam washes up the sand and thins out.
  const foamTex = canvasTex(64, 512, (cx, w, h) => {
    const r = rng(3);
    for (let i = 0; i < 900; i++) { const y = r() * h, x = w * (0.25 + 0.5 * r() ** 1.5), s = 2 + r() * 7; cx.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`; cx.beginPath(); cx.arc(x, y, s, 0, 7); cx.fill(); }
  }, [1, 8]);
  const waves = [];
  for (let k = 0; k < 3; k++) {
    const mat = new THREE.MeshBasicMaterial({ map: foamTex.clone(), transparent: true, depthWrite: false, opacity: 0 });
    mat.map.repeat.set(1, 60 + k * 9); mat.map.offset.y = k * 0.37;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(6, 2400), mat); f.rotation.x = -Math.PI / 2; f.position.set(SHORE_X, 0.2, -600); g.add(f);
    // the breaking crest: a low rounded roll of water with a white top
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2400, 10, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe9fbff, roughness: 0.3, transparent: true, opacity: 0 }));
    crest.rotation.x = Math.PI / 2; crest.position.set(SHORE_X + 30, 0, -600); g.add(crest);
    waves.push({ o: f, crest, t: k / 3 });
  }
  venueAnim.push({ kind: "surf", waves });
}
function stripeTex(colors, n = 12, w = 512, h = 64) {
  return canvasTex(w, h, (c) => { for (let i = 0; i < n; i++) { c.fillStyle = colors[i % colors.length]; c.fillRect(i * w / n, 0, w / n + 1, h); } });
}
function beachUmbrella(g, x, z, colors, tilt = 0.1, seed = 1) {
  const u = new THREE.Group();
  add(u, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 8.4, 6), std(0xf2f2f2, { metalness: 0.3 })), 0, 4.2, 0);
  const top = new THREE.Mesh(new THREE.ConeGeometry(4.8, 1.5, 16, 1, true), std(0xffffff, { map: stripeTex(colors, 16), side: THREE.DoubleSide, roughness: 0.85 }));
  add(u, top, 0, 8.2, 0);
  add(u, new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), std(0xffffff)), 0, 9.0, 0, false);
  u.position.set(x, 0, z); u.rotation.set(tilt * 0.5, seed, tilt); g.add(u);
}
function towel(g, x, z, rotY, colors) {
  const t = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), std(0xffffff, { map: stripeTex(colors, 7, 64, 256), roughness: 1 }));
  t.rotation.set(-Math.PI / 2, 0, rotY); t.position.set(x, 0.06, z); t.receiveShadow = true; g.add(t);
}
function lounger(g, x, z, rotY, color) {
  const l = new THREE.Group(), frame = std(0xf4f4f4, { metalness: 0.4, roughness: 0.4 }), cloth = std(color, { roughness: 0.9 });
  add(l, box(2.4, 0.2, 4.4, cloth), 0, 1.2, 0.9);
  const back = add(l, box(2.4, 0.2, 2.6, cloth), 0, 2.0, -2.0); back.rotation.x = 0.75;
  for (const sx of [-1.15, 1.15]) for (const sz of [-1.6, 2.9]) add(l, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5), frame), sx, 0.6, sz, false);
  l.position.set(x, 0, z); l.rotation.y = rotY; g.add(l);
}
function surfboard(g, x, z, rotY, color, stripe) {
  const b = new THREE.Group();
  const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 5.2, 6, 14), std(color, { roughness: 0.35 })); board.scale.set(1, 1, 0.16); add(b, board, 0, 3.4, 0);
  const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 5.6, 4, 8), std(stripe, { roughness: 0.35 })); s.scale.set(1, 1, 1); s.position.set(0, 3.4, 0.16); b.add(s);
  b.position.set(x, 0, z); b.rotation.set(0.12, rotY, 0.08); g.add(b);
}
function lifeguardTower(g, x, z, rotY) {
  const t = new THREE.Group(), wood = std(0xf4efe6), red = std(0xd62828);
  for (const sx of [-2.6, 2.6]) for (const sz of [-2.6, 2.6]) { const leg = add(t, new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 8.6, 8), wood), sx * 1.08, 4.3, sz * 1.08); leg.rotation.set(sz * -0.02, 0, sx * 0.02); }
  add(t, box(7, 0.4, 7, wood), 0, 8.6, 0);
  add(t, box(6.4, 5, 6.4, red), 0, 11.3, -0.4);
  add(t, box(5.6, 2.2, 0.15, std(0x2a3a4a, { roughness: 0.2, metalness: 0.4 })), 0, 12.0, 2.85, false);
  const roof = add(t, new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.4, 4), wood), 0, 15, -0.4); roof.rotation.y = Math.PI / 4;
  add(t, box(7.2, 0.2, 0.2, wood), 0, 10.0, 3.4, false);
  const ramp = add(t, box(2.6, 0.25, 11, wood), 0, 4.2, 8.4); ramp.rotation.x = 0.85;
  add(t, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 5), std(0xdddddd)), 2.8, 17.5, -0.4, false);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), lam(0xffc93a, { side: THREE.DoubleSide })); fl.position.set(4.0, 19.6, -0.4); t.add(fl);
  venueAnim.push({ kind: "flag", o: fl, phase: 2 });
  const sign = canvasTex(256, 64, (c, w, h) => { c.fillStyle = "#fff"; c.fillRect(0, 0, w, h); c.fillStyle = "#d62828"; c.font = "bold 40px Arial Black, sans-serif"; c.textAlign = "center"; c.fillText("LIFEGUARD", w / 2, 47); });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshBasicMaterial({ map: sign })); sg.position.set(0, 14.1, 2.8); t.add(sg);
  t.position.set(x, 0, z); t.rotation.y = rotY; g.add(t);
}
function volleyNet(g, x, z, rotY) {
  const v = new THREE.Group(), pole = std(0x2a2a2a, { metalness: 0.5 });
  for (const sx of [-16, 16]) add(v, new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 9, 8), pole), sx, 4.5, 0);
  const netTex = canvasTex(256, 32, (c, w, h) => { c.strokeStyle = "rgba(20,20,20,.85)"; c.lineWidth = 2; for (let x = 0; x < w; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.fillStyle = "#fff"; c.fillRect(0, 0, w, 4); });
  netTex.wrapS = THREE.RepeatWrapping; netTex.repeat.set(4, 1);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(32, 3.2), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })); net.position.set(0, 7.3, 0); v.add(net);
  add(v, new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), std(0xffffff, { map: stripeTex(["#ffffff", "#ffd23a", "#2f86ff"], 6, 128, 32) })), 4, 0.75, 6);
  v.position.set(x, 0, z); v.rotation.y = rotY; g.add(v);
}
function beachShack(g, x, z, rotY) {
  const s = new THREE.Group(), planks = photoMat("weathered_brown_planks", 3, 1, { rotate: Math.PI / 2, fallback: 0x8a6a4a });
  const deck = photoMat("weathered_brown_planks", 4, 3, { fallback: 0x8a6a4a, tint: 0xd8c8b0 });
  add(s, box(20, 0.8, 15, deck), 0, 0.4, 0);
  add(s, box(18, 9, 0.5, planks), 0, 5.3, -6.5); // back wall
  for (const sx of [-9, 9]) add(s, box(0.5, 9, 13, planks), sx, 5.3, 0); // sides
  add(s, box(17.5, 3.8, 1.4, planks), 0, 2.7, 5.2); // the counter
  add(s, box(18.4, 0.35, 2.4, std(0xc89a5a, { roughness: 0.5 })), 0, 4.75, 5.4);
  for (const sx of [-9, 9]) for (const sz of [-6.6, 6.6]) add(s, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 12, 10), std(0x8a6038, { roughness: 0.9 })), sx, 6, sz);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(16.5, 7, 4, 1), photoMat("thatch_roof_angled", 3, 2, { fallback: 0xc9a868, tint: 0xf2e2b0 }));
  roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.82); add(s, roof, 0, 15.2, 0);
  // the menu boards and the big sign
  const signTex = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = "#1b8a9a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#fff6e0"; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = "#fff6e0"; c.font = "bold 72px 'Lilita One', Arial Black, sans-serif"; c.textAlign = "center"; c.fillText("SURF SHACK", w / 2, 92);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set(0, 12.2, 6.9); s.add(sign);
  const menuTex = canvasTex(256, 192, (c, w, h) => {
    c.fillStyle = "#1e2a24"; c.fillRect(0, 0, w, h); c.fillStyle = "#ffe08a"; c.font = "bold 26px Arial, sans-serif"; c.textAlign = "center"; c.fillText("TODAY", w / 2, 34);
    c.fillStyle = "#ffffff"; c.font = "bold 22px Arial, sans-serif"; ["Shaved Ice", "Smoothies", "Fish Tacos", "Lemonade"].forEach((t, i) => c.fillText(t, w / 2, 72 + i * 32));
  });
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.75), new THREE.MeshBasicMaterial({ map: menuTex })); menu.position.set(-4.5, 7.6, -6.2); s.add(menu);
  // shelves of cups and fruit behind the counter
  add(s, box(9, 0.3, 1.2, std(0xc89a5a)), 4, 6.5, -5.8, false);
  for (let k = 0; k < 7; k++) add(s, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.8, 10), std([0xffc93a, 0xff6a3d, 0x2fbf71, 0xff7ac0][k % 4])), 0.4 + k * 1.2, 7.05, -5.8, false);
  s.position.set(x, 0, z); s.rotation.y = rotY; g.add(s);
  // bar stools along the counter (Poly Haven), and surfboards leaning on the side
  const fwd = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)), side = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
  for (const k of [-5.5, -1.8, 1.8, 5.5]) placeModel(g, "bar_chair_round_01", x + fwd.x * 8.6 + side.x * k, z + fwd.z * 8.6 + side.z * k, rotY + Math.PI, 1.1);
  return s;
}
function sailboat(g, x, z, color, seed) {
  const b = new THREE.Group(), white = std(0xffffff, { roughness: 0.4 });
  // hull: a boat-shaped outline extruded upward, sitting up on the water
  const outline = new THREE.Shape(); outline.moveTo(-6, -1.6); outline.lineTo(3, -1.7); outline.quadraticCurveTo(6.5, -1.2, 7.5, 0); outline.quadraticCurveTo(6.5, 1.2, 3, 1.7); outline.lineTo(-6, 1.6); outline.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 2.2, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2 }), white);
  hull.rotation.x = -Math.PI / 2; add(b, hull, 0, 0.1, 0, false);
  add(b, box(13, 0.35, 3.6, std(0x1f3a6e)), 0.4, 0.45, 0, false); // waterline stripe
  add(b, box(4, 1.2, 2.2, white), -1.5, 3.0, 0, false); // cabin
  add(b, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 18, 6), std(0xdddddd)), 0.5, 11.4, 0, false);
  const sail = new THREE.BufferGeometry(); sail.setAttribute("position", new THREE.Float32BufferAttribute([0.6, 3.4, 0, 0.6, 20, 0, -6.5, 3.4, 0, 0.6, 18, 0, 0.6, 3.4, 0, 6.2, 3.0, 0], 3)); sail.computeVertexNormals();
  b.add(new THREE.Mesh(sail, std(color, { side: THREE.DoubleSide })));
  b.position.set(x, 0, z); b.rotation.y = seed; g.add(b);
  venueAnim.push({ kind: "bob", o: b, phase: seed, y: 0.3 });
}
// Far off down the beach: a pier, a green headland with a lighthouse, and hills across the end of the bay.
function beachDistance(g) {
  // the pier
  const deck = photoMat("weathered_brown_planks", 2, 40, { fallback: 0x8a6a4a });
  add(g, box(150, 1, 12, deck), SHORE_X + 70, 4.5, -430, false);
  const piles = [], m = new THREE.Matrix4();
  for (let x = SHORE_X; x <= SHORE_X + 145; x += 10) for (const dz of [-5.5, 5.5]) piles.push(m.clone().makeTranslation(x, 2, -430 + dz));
  const pim = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 8, 6), std(0x5a4632), piles.length); piles.forEach((p, i) => pim.setMatrixAt(i, p)); g.add(pim);
  for (const dz of [-6, 6]) add(g, box(150, 1.4, 0.3, std(0xf2efe6)), SHORE_X + 70, 6, -430 + dz, false);
  add(g, box(20, 9, 14, lam(0xf2f2ea)), SHORE_X + 140, 9.5, -430, false);
  add(g, new THREE.Mesh(new THREE.ConeGeometry(14, 6, 4), lam(0xd62828)).rotateY(Math.PI / 4), SHORE_X + 140, 17, -430, false);
  for (let i = 0; i < 6; i++) { person(g, SHORE_X + 20 + i * 20, -430 + (i % 2 ? 3 : -3), i, 90 + i, "stand"); venueAnim[venueAnim.length - 1].y0 = 5; } // up on the pier
  // the headland: soft green hills where the beach curves round, and a lighthouse on the point
  const grass = lam(0x6f9a4e, { flatShading: true }), rock = lam(0x9a8a74, { flatShading: true });
  const r = rng(77);
  for (let k = 0; k < 16; k++) {
    const x = -420 + k * 60 + r() * 30, z = -1150 - r() * 120 + (x > 100 ? -(x - 100) * 0.15 : 0), rad = 70 + r() * 60;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 1), k > 9 ? rock : grass); hill.scale.set(1, 0.32 + r() * 0.2, 0.7); hill.position.set(x, -rad * 0.08, z); g.add(hill);
  }
  for (let k = 0; k < 5; k++) { const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(60 + r() * 40, 1), grass); hill.scale.set(1, 0.4, 0.8); hill.position.set(330 + k * 70, -5, -1050 - k * 50); g.add(hill); }
  const lh = new THREE.Group();
  for (let i = 0; i < 6; i++) add(lh, new THREE.Mesh(new THREE.CylinderGeometry(4.6 - i * 0.35, 5 - i * 0.35, 8, 14), lam(i % 2 ? 0xd62828 : 0xffffff)), 0, 4 + i * 8, 0, false);
  add(lh, new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d0 })), 0, 50.5, 0, false);
  add(lh, new THREE.Mesh(new THREE.ConeGeometry(3.8, 5, 12), lam(0x222222)), 0, 55.5, 0, false);
  lh.position.set(360, 18, -1060); g.add(lh);
}
function gulls(g, n, cx, cz, seed) {
  const r = rng(seed), wing = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group(), wings = [];
    add(b, new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 3, 6), wing).rotateX(Math.PI / 2), 0, 0, 0, false);
    for (const sx of [-1, 1]) { const w = new THREE.Group(), m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.6), wing); m.position.x = sx * 0.9; m.rotation.x = -Math.PI / 2; w.add(m); b.add(w); wings.push(w); }
    g.add(b);
    venueAnim.push({ kind: "gull", o: b, wings, cx: cx + (r() - 0.5) * 30, cz: cz + (r() - 0.5) * 30, rad: 12 + r() * 20, h: 26 + r() * 16, speed: (0.15 + r() * 0.12) * (r() < 0.5 ? -1 : 1), phase: r() * 6.28 });
  }
}

// Resort hotels along the back of the beach: tall towers with rows of balconies, in sunny pastel colours.
function hotelTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h);
    for (const x of [8, 136]) {
      const gr = c.createLinearGradient(0, 30, 0, 200); gr.addColorStop(0, "#9ccbe8"); gr.addColorStop(1, "#3c6a8a");
      c.fillStyle = gr; c.fillRect(x, 40, 112, 150); // sliding glass doors
      c.fillStyle = "rgba(255,255,255,.7)"; c.fillRect(x + 54, 40, 4, 150);
      c.fillStyle = "#f4f4f4"; c.fillRect(x - 6, 190, 124, 22); // balcony slab
      c.fillStyle = "rgba(220,240,255,.75)"; c.fillRect(x - 6, 150, 124, 40); // glass rail
      c.fillStyle = "#e8e8e8"; c.fillRect(x - 6, 148, 124, 4);
    }
  });
}
function hotel(g, x, z, w, h, d, color, tex) {
  const front = tex.clone(), side = tex.clone();
  for (const [t, a] of [[front, w], [side, d]]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(a / 14)), Math.max(1, Math.round(h / 10))); t.needsUpdate = true; }
  const tint = new THREE.Color(color), f = new THREE.MeshLambertMaterial({ map: front, color: tint }), sm = new THREE.MeshLambertMaterial({ map: side, color: tint }), top = lam(0xe8e2d6);
  // the balconies face the sea (+x)
  const b = add(g, box(d, h, w, [f, sm, top, top, sm, sm]), x, h / 2, z, false);
  add(g, box(d + 2, 3, w + 2, lam(0xf6f2ea)), x, h + 1.5, z, false); // roof cap
  add(g, box(6, 4, 8, lam(0xcfd6dc)), x - d * 0.2, h + 5, z + w * 0.2, false); // rooftop plant room
  return b;
}
// A row of identical things (umbrellas, loungers) as one instanced mesh per part: hundreds of them at little cost.
function kitRow(g, parts, spots) {
  const m = new THREE.Matrix4();
  for (const [geo, mat, local] of parts) {
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach(([x, z, r], i) => im.setMatrixAt(i, m.makeRotationY(r).setPosition(x, 0, z).multiply(local)));
    im.castShadow = im.receiveShadow = true; g.add(im);
  }
}
const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z); // (not "T": that's the physics settings)
function umbrellaRow(g, spots, colors) {
  kitRow(g, [
    [new THREE.CylinderGeometry(0.09, 0.09, 8.4, 6), std(0xf2f2f2, { metalness: 0.3 }), at(0, 4.2, 0)],
    [new THREE.ConeGeometry(4.6, 1.5, 16, 1, true), std(0xffffff, { map: stripeTex(colors, 16), side: THREE.DoubleSide, roughness: 0.85 }), at(0, 8.2, 0)],
  ], spots);
}
function loungerRow(g, spots, color) { // facing +z before rotY
  const cloth = std(color, { roughness: 0.9 }), frame = std(0xf4f4f4, { metalness: 0.4, roughness: 0.4 });
  const back = new THREE.Matrix4().makeRotationX(0.75).premultiply(at(0, 2.0, -2.0));
  kitRow(g, [
    [new THREE.BoxGeometry(2.4, 0.2, 4.4), cloth, at(0, 1.2, 0.9)],
    [new THREE.BoxGeometry(2.4, 0.2, 2.6), cloth, back],
    [new THREE.BoxGeometry(2.2, 1.1, 0.12), frame, at(0, 0.6, 2.9)],
    [new THREE.BoxGeometry(2.2, 1.1, 0.12), frame, at(0, 0.6, -1.4)],
  ], spots);
}
// A big cruise ship, broadside, far out on the water.
function cruiseShip(g, x, z, len) {
  const s = new THREE.Group(), white = lam(0xf8f8f8), navy = lam(0x1f3a6e);
  const winTex = canvasTex(256, 64, (c, w, h) => { c.fillStyle = "#f8f8f8"; c.fillRect(0, 0, w, h); c.fillStyle = "#2a4a6a"; for (let k = 0; k < 16; k++) c.fillRect(k * 16 + 3, 22, 10, 20); });
  const deck = (y, h, l, inset) => { const t = winTex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(Math.round(l / 16), 1); t.needsUpdate = true; return add(s, box(l, h, 30 - inset, [white, white, white, white, new THREE.MeshLambertMaterial({ map: t }), new THREE.MeshLambertMaterial({ map: t })]), -inset * 0.6, y + h / 2, 0, false); };
  add(s, box(len, 16, 30, navy), 0, 5, 0, false); // hull, mostly above the waterline
  const bow = new THREE.Shape([new THREE.Vector2(0, -15), new THREE.Vector2(34, 0), new THREE.Vector2(0, 15)].map(v => v));
  const bowMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(bow, { depth: 16, bevelEnabled: false }), navy); bowMesh.rotation.x = -Math.PI / 2; add(s, bowMesh, len / 2, -3, 0, false);
  add(s, box(len + 2, 1.6, 31, lam(0xffffff)), 0, 13.4, 0, false); // white band at the deck line
  for (let k = 0; k < 6; k++) deck(14 + k * 7, 7, len * (0.95 - k * 0.08), k * 2);
  add(s, new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 18, 14), lam(0xd62828)), -len * 0.2, 67, 0, false); // funnel
  add(s, new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 3, 14), lam(0x1f3a6e)), -len * 0.2, 75, 0, false);
  s.position.set(x, 0, z); s.rotation.y = Math.PI / 2; g.add(s); // runs parallel to the shore
  venueAnim.push({ kind: "bob", o: s, phase: 0.5, y: 0, slow: true });
}

// Beachside homes: 2-3 floors of pastel lap siding, white trim, a deck on every floor facing the sea, gabled roofs.
function sidingTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) { c.fillStyle = "rgba(0,0,0,.10)"; c.fillRect(0, y + 8, w, 2); }
    for (const x of [40, 152]) { // a window with white frame and shutters
      c.fillStyle = "#ffffff"; c.fillRect(x - 6, 70, 76, 116);
      const gr = c.createLinearGradient(0, 76, 0, 180); gr.addColorStop(0, "#a8d4ee"); gr.addColorStop(1, "#46708e");
      c.fillStyle = gr; c.fillRect(x, 76, 64, 104); c.fillStyle = "#ffffff"; c.fillRect(x + 30, 76, 4, 104); c.fillRect(x, 126, 64, 4);
    }
  });
}
function beachHouse(g, x, z, w, floors, color, roofColor, tex) {
  const h = floors * 11, d = 30, front = tex.clone(), side = tex.clone();
  for (const [t, a] of [[front, w], [side, d]]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(a / 13)), floors); t.needsUpdate = true; }
  const tint = new THREE.Color(color), f = new THREE.MeshLambertMaterial({ map: front, color: tint }), sm = new THREE.MeshLambertMaterial({ map: side, color: tint }), trim = lam(0xffffff);
  const hs = new THREE.Group();
  add(hs, box(d, h, w, [f, sm, trim, trim, sm, sm]), 0, h / 2 + 1, 0, false);
  add(hs, box(d + 1, 1, w + 1, trim), 0, 1, 0, false);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.62, d * 0.62, w + 3, 3, 1), lam(roofColor, { flatShading: true }));
  roof.rotation.set(Math.PI / 2, Math.PI / 2, 0); roof.rotation.order = "YXZ"; roof.rotation.set(Math.PI / 2, 0, 0); roof.scale.set(1, 1, 1);
  const rg = new THREE.Group(); roof.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); roof.scale.set(1, 1, 0.55); rg.add(roof); rg.rotation.y = Math.PI / 2; rg.position.y = h + 1 + d * 0.62 * 0.3; hs.add(rg);
  for (let k = 0; k < floors; k++) { // decks facing the water
    const y = 1 + k * 11;
    add(hs, box(8, 0.6, w - 4, lam(0xdcc7a4)), d / 2 + 4, y + (k ? 0 : 1.5), 0, false);
    add(hs, box(0.3, 3.4, w - 4, trim), d / 2 + 7.8, y + 2 + (k ? 0 : 1.5), 0, false);
    if (k === 0) for (const sz of [-1, 1]) add(hs, box(0.6, 2.5, 0.6, trim), d / 2 + 7.6, 1.2, sz * (w / 2 - 2.5), false);
  }
  hs.position.set(x, 0, z); g.add(hs);
}

// ── Pizza Patio: a brick courtyard behind a corner pizzeria at lunchtime.
// Windows lit from inside: warm glass with a hint of what's in the room.
function dayWindowTex() { // glass in daylight: sky reflected at the top, the room dim behind it
  return canvasTex(128, 192, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#cfe6f6"); g.addColorStop(0.45, "#7ea6c4"); g.addColorStop(1, "#3a4c5c");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); c.moveTo(14, 0); c.lineTo(46, 0); c.lineTo(14, 70); c.closePath(); c.fill();
    c.strokeStyle = "#f2efe6"; c.lineWidth = 7; c.strokeRect(3, 3, w - 6, h - 6); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h * 0.45); c.lineTo(w, h * 0.45); c.stroke();
  });
}
function litWindowTex(kind) {
  return canvasTex(128, 192, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#ffd890"); g.addColorStop(0.6, "#ffb05a"); g.addColorStop(1, "#c8642a");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (kind === "shop") { c.fillStyle = "rgba(80,40,20,.35)"; for (let k = 0; k < 4; k++) c.fillRect(8 + k * 30, 120, 22, 60); } // shelves and people inside
    c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(10, 8, 18, h - 16);
    c.strokeStyle = "#2a1a10"; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h * 0.45); c.lineTo(w, h * 0.45); c.stroke();
  });
}
function pizzeria(g, x, z) {
  const b = new THREE.Group(), W = 76, D = 26;
  const brick = photoMat("red_brick_03", W / 10, 1.4, { fallback: 0x8a3a2a }), stucco = photoMat("white_stucco", W / 12, 1.4, { fallback: 0xf0e4cc, tint: 0xfff0d8 });
  add(b, box(W, 13, D, brick), 0, 6.5, 0, false);
  add(b, box(W, 12, D, stucco), 0, 19, 0, false);
  add(b, box(W + 2, 1.4, D + 2, lam(0xe8dcc4)), 0, 13.4, 0, false); // ledge between floors
  add(b, box(W + 3, 2, D + 3, lam(0x5a3020)), 0, 26, 0, false);      // cornice
  const glass = std(0xffffff, { map: dayWindowTex(), roughness: 0.15, metalness: 0.2 }), shop = glass, room = glass;
  for (const wx of [-28, -18, 18, 28]) add(b, box(7, 8.5, 0.3, shop), wx, 6, D / 2 + 0.05, false);   // big ground-floor windows
  for (let wx = -30; wx <= 30; wx += 10) { add(b, box(4.4, 6.4, 0.3, room), wx, 19.5, D / 2 + 0.05, false); for (const sx of [-1, 1]) add(b, box(1.6, 6.8, 0.25, lam(0x2f6a3a)), wx + sx * 3.1, 19.5, D / 2 + 0.2, false); } // shuttered upstairs
  // the oven window: a brick dome with the wood fire glowing in its mouth, seen through the glass
  const ovenTex = canvasTex(256, 168, (c, w, h) => {
    c.fillStyle = "#3a1e10"; c.fillRect(0, 0, w, h);
    const back = c.createRadialGradient(w / 2, h * 0.75, 10, w / 2, h * 0.75, w * 0.6); back.addColorStop(0, "rgba(255,150,60,.55)"); back.addColorStop(1, "rgba(255,120,40,0)");
    c.fillStyle = back; c.fillRect(0, 0, w, h);
    c.fillStyle = "#8a5a3a"; c.beginPath(); c.ellipse(w / 2, h * 0.9, w * 0.38, h * 0.62, 0, Math.PI, 0); c.fill(); // the dome
    c.strokeStyle = "#5a3424"; c.lineWidth = 3; for (let k = 1; k < 6; k++) { c.beginPath(); c.ellipse(w / 2, h * 0.9, w * 0.38, h * 0.62 * k / 6, 0, Math.PI, 0); c.stroke(); }
    const fire = c.createRadialGradient(w / 2, h * 0.86, 4, w / 2, h * 0.86, 44); fire.addColorStop(0, "#fff2b0"); fire.addColorStop(0.4, "#ffa030"); fire.addColorStop(1, "#7a2a08");
    c.fillStyle = fire; c.beginPath(); c.ellipse(w / 2, h * 0.9, 46, 34, 0, Math.PI, 0); c.fill(); // the glowing mouth
    c.fillStyle = "#2a1408"; c.fillRect(0, h * 0.9, w, h * 0.1);
    c.strokeStyle = "#2a1a10"; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
  });
  add(b, box(14, 9.2, 0.3, new THREE.MeshBasicMaterial({ map: ovenTex })), 0, 6.2, D / 2 + 0.05, false);
  flame(b, -0.8, 2.3, D / 2 + 0.25, 1.2); flame(b, 0.6, 2.3, D / 2 + 0.25, 1.0);
  // awning over the door, and the sign
  const awn = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 5), std(0xffffff, { map: stripeTex(["#1f7a3a", "#ffffff", "#c8202a", "#ffffff"], 12) })); awn.rotation.x = 0.35; add(b, awn, 0, 11.2, D / 2 + 2.2, false);
  const signTex = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = "#1a0e08"; c.fillRect(0, 0, w, h); c.strokeStyle = "#ffcf7a"; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = "#ffe2a8"; c.font = "bold 76px Georgia, serif"; c.textAlign = "center"; c.fillText("Nonna's Pizza", w / 2, 92);
  });
  add(b, new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: signTex })), 0, 15.8, D / 2 + 0.6, false);
  add(b, box(5, 1.2, 4, lam(0x8a8a8a)), 0, 30, -2, false); // chimney
  add(b, new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 8, 10), lam(0x6a3a2a)), 0, 30, -6, false);
  b.position.set(x, 0, z); g.add(b);
}
// Two-storey shop buildings along the street, each a different colour, with lit windows.
function shopRow(g, x, z0, z1, side) {
  const r = rng(Math.abs(x) * 7), COLS = [0xe8c8a0, 0xd8a890, 0xc8d8c0, 0xf0e0b0, 0xb8c8d8, 0xe0b8b8];
  const lit = std(0xffffff, { map: dayWindowTex(), roughness: 0.15, metalness: 0.2 }), dark = lit;
  for (let z = z0; z > z1;) {
    const w = 22 + r() * 10, h = 22 + r() * 10, c = lam(COLS[Math.floor(r() * COLS.length)]);
    add(g, box(20, h, w - 0.6, c), x, h / 2, z - w / 2, false);
    add(g, box(21, 1.2, w, lam(0x4a3426)), x, h + 0.6, z - w / 2, false);
    for (const fz of [-w * 0.27, w * 0.27]) for (const fy of [6, 16]) if (fy < h - 4) add(g, box(0.3, 6, 5, r() < 0.7 ? lit : dark), x - side * 10.1, fy, z - w / 2 + fz, false);
    z -= w;
  }
}
function patioHeater(g, x, z) {
  const h = new THREE.Group(), steel = std(0x9aa0a8, { metalness: 0.8, roughness: 0.3 });
  add(h, new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 0.5, 14), steel), 0, 0.25, 0, false);
  add(h, new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7.5, 8), steel), 0, 4, 0, false);
  add(h, new THREE.Mesh(new THREE.ConeGeometry(2.2, 1, 16, 1, true), steel), 0, 8.3, 0, false);
  add(h, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 12), std(0x3a3a3a, { metalness: 0.6 })), 0, 7.3, 0, false); // off: it's lunchtime
  h.position.set(x, 0, z); g.add(h);
}
function pizzaBox(g, x, y, z, rot) {
  const t = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#f4ecdc"; c.fillRect(0, 0, w, h); c.fillStyle = "#c8202a"; c.beginPath(); c.arc(32, 32, 16, 0, 7); c.fill(); c.fillStyle = "#fff"; c.font = "bold 14px Arial"; c.textAlign = "center"; c.fillText("PIZZA", 32, 37); });
  const m = add(g, box(1.6, 0.25, 1.6, [lam(0xe8dcc4), lam(0xe8dcc4), new THREE.MeshLambertMaterial({ map: t }), lam(0xe8dcc4), lam(0xe8dcc4), lam(0xe8dcc4)]), x, y, z, false);
  m.rotation.y = rot;
}
function chalkboard(g, x, z, rotY) {
  const t = canvasTex(256, 320, (c, w, h) => {
    c.fillStyle = "#24302a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#8a6038"; c.lineWidth = 14; c.strokeRect(0, 0, w, h);
    c.fillStyle = "#fff6e0"; c.textAlign = "center"; c.font = "bold 34px Georgia, serif"; c.fillText("LUNCH", w / 2, 60); c.fillText("LEAGUE", w / 2, 98);
    c.font = "24px Georgia, serif"; ["Cornhole at noon", "Slice + soda $5", "Garlic knots", "Cannoli"].forEach((s, i) => c.fillText(s, w / 2, 150 + i * 38));
  });
  const a = new THREE.Group(), face = new THREE.MeshLambertMaterial({ map: t });
  for (const sgn of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.6, 0.12), [lam(0x8a6038), lam(0x8a6038), lam(0x8a6038), lam(0x8a6038), face, face]); p.position.set(0, 1.75, sgn * 0.55); p.rotation.x = sgn * 0.28; a.add(p); }
  a.position.set(x, 0, z); a.rotation.y = rotY; g.add(a);
}

// ── Mountain Lodge: the top of the ski slope, outside a big timber lodge.
const SKI_COLS = [0xd62828, 0x2f86ff, 0xffc93a, 0x2fbf71, 0xff7ac0, 0x222222, 0xff8a1f, 0xffffff];
const skiGeo = new THREE.BoxGeometry(0.28, 0.1, 5.6), poleGeo = new THREE.CylinderGeometry(0.05, 0.04, 3.9, 5);
// skis on a person's feet (and poles in their hands); p is the group person() returns, facing +z
function wearSkis(p, color) {
  const m = lam(color), pm = std(0xcccccc, { metalness: 0.6 });
  for (const sx of [-0.25, 0.25]) { const s = new THREE.Mesh(skiGeo, m); s.position.set(sx, 0.05, 0.5); p.add(s); }
  for (const sx of [-0.85, 0.85]) { const pl = new THREE.Mesh(poleGeo, pm); pl.position.set(sx, 1.9, -0.2); pl.rotation.x = -0.25; p.add(pl); }
}
// a pair of skis held upright beside someone, tails on the snow
function heldSkis(g, x, z, rotY, color) {
  const s = new THREE.Group(), m = lam(color);
  for (const dx of [-0.12, 0.12]) { const k = new THREE.Mesh(skiGeo, m); k.rotation.x = Math.PI / 2; k.position.set(dx, 2.8, 0); s.add(k); }
  s.position.set(x, 0, z); s.rotation.set(0, rotY, 0.06); g.add(s);
}
function skiRack(g, x, z, rotY, seed) {
  const r = rng(seed), rk = new THREE.Group(), wood = lam(0x6a4628);
  for (const dx of [-5, 5]) add(rk, box(0.4, 3.6, 0.4, wood), dx, 1.8, 0, false);
  add(rk, box(10.6, 0.35, 0.5, wood), 0, 3.4, 0, false);
  for (let k = 0; k < 7; k++) { // pairs leaning against the bar
    const pair = new THREE.Group(), m = lam(SKI_COLS[Math.floor(r() * SKI_COLS.length)]);
    for (const dx of [-0.12, 0.12]) { const s = new THREE.Mesh(skiGeo, m); s.rotation.x = Math.PI / 2; s.position.set(dx, 2.75, 0); pair.add(s); }
    pair.position.set(-4.3 + k * 1.4, 0, 0.75); pair.rotation.x = -0.24; rk.add(pair);
  }
  rk.position.set(x, 0, z); rk.rotation.y = rotY; g.add(rk);
}
// the slope falls away to the left of the court (x < SLOPE_X)
const SLOPE_X = -40, SKI_GRADE = 0.3; // (not "SLOPE": that's the board's tilt)
const slopeY = x => (x < SLOPE_X ? (x - SLOPE_X) * SKI_GRADE : 0);
function skiers(g, n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const p = person(g, 0, 0, 0, 500 + i, "stand"); venueAnim.pop(); // they move along the slope instead
    wearSkis(p, SKI_COLS[Math.floor(r() * SKI_COLS.length)]);
    venueAnim.push({ kind: "skier", o: p, t: r(), z0: -150 + r() * 200, speed: 0.045 + r() * 0.04, wig: 6 + r() * 10, ph: r() * 6 });
  }
}
function lodgeBuilding(g, x, z) {
  const b = new THREE.Group(), W = 100, D = 40, H = 30;
  const wood = photoMat("weathered_brown_planks", W / 6, 2, { rotate: Math.PI / 2, fallback: 0x7a5232, tint: 0xd8b890 });
  const stone = lam(0x8a8a90, { flatShading: true }), snow = lam(0xf6f9ff, { flatShading: true }), glass = std(0xffffff, { map: dayWindowTex(), roughness: 0.15, metalness: 0.2 });
  add(b, box(W + 2, 6, D + 2, stone), 0, 3, 0, false);
  add(b, box(W, H - 6, D, wood), 0, 6 + (H - 6) / 2, 0, false);
  for (let wx = -40; wx <= 40; wx += 10) { add(b, box(6, 9, 0.3, glass), wx, 13, D / 2 + 0.05, false); add(b, box(6, 7, 0.3, glass), wx, 24, D / 2 + 0.05, false); }
  add(b, box(W + 4, 0.6, 7, lam(0x5a3a22)), 0, 18.5, D / 2 + 3.5, false); // balcony
  add(b, box(W + 4, 2.6, 0.3, lam(0x5a3a22)), 0, 20, D / 2 + 6.8, false);
  // steep gable roof running along the front, with snow on it
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.75, D * 0.75, W + 8, 3, 1), lam(0x4a2e1c, { flatShading: true }));
  roof.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); roof.scale.set(1, 1, 1.1); add(b, roof, 0, H + D * 0.75 * 0.55, 0, false);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.77, D * 0.77, W + 8.5, 3, 1), snow);
  cap.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); cap.scale.set(1, 1, 1.1); add(b, cap, 0, H + D * 0.75 * 0.55 + 1.2, 0, false);
  // big front gable (A-frame entrance) with a glass wall
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 8, 3, 1), wood); gable.rotation.set(-Math.PI / 2, 0, 0); add(b, gable, 0, H + 3, D / 2 + 2, false);
  add(b, box(14, 20, 0.3, glass), 0, 16, D / 2 + 6.2, false);
  add(b, box(7, 22, 7, stone), 30, H + 6, -6, false); // stone chimney
  const sign = canvasTex(512, 128, (c, w, h) => { c.fillStyle = "#3a2414"; c.fillRect(0, 0, w, h); c.strokeStyle = "#f2d9a0"; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16); c.fillStyle = "#fff4dc"; c.textAlign = "center"; let fs = 66; do { c.font = `bold ${fs}px Georgia, serif`; fs -= 2; } while (c.measureText("SUMMIT LODGE").width > w - 50); c.fillText("SUMMIT LODGE", w / 2, 86); }); // shrinks to fit
  add(b, new THREE.Mesh(new THREE.PlaneGeometry(28, 7), new THREE.MeshBasicMaterial({ map: sign })), 0, 8.5, D / 2 + 6.4, false);
  b.position.set(x, 0, z); g.add(b);
}
function chairLift(g) {
  // from the bottom of the slope up to the top station beside the lodge
  const A = new THREE.Vector3(-300, slopeY(-300) - 2, -230), B = new THREE.Vector3(-58, 0, -70), dir = B.clone().sub(A), L = dir.length(); dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize(), steel = std(0x7a8290, { metalness: 0.6 }), H = 30;
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const p = A.clone().addScaledVector(dir, L * i / n);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, H + 2, 8), steel), p.x, p.y + H / 2, p.z, false);
    const arm = add(g, box(9, 0.6, 0.6, steel), p.x, p.y + H + 1, p.z, false); arm.rotation.y = Math.atan2(side.x, side.z) + Math.PI / 2;
  }
  // top station: a shed and the big wheel
  add(g, box(14, 10, 14, lam(0x6a4a30)), B.x - 6, 5, B.z, false);
  const wheel = add(g, new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.4, 8, 24), steel), B.x, H + 1, B.z, false); wheel.rotation.x = Math.PI / 2;
  const cable = new THREE.LineBasicMaterial({ color: 0x222222 });
  for (const s of [-1, 1]) {
    const a = A.clone().addScaledVector(side, s * 4.5), b2 = B.clone().addScaledVector(side, s * 4.5);
    a.y += H + 1; b2.y += H + 1;
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b2]), cable));
  }
  const chairs = [], r = rng(41), seatMat = lam(0x2a3a5a);
  for (let k = 0; k < 18; k++) {
    const c = new THREE.Group();
    add(c, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 5), steel), 0, 3.5, 0, false);
    add(c, box(4.6, 0.3, 1.8, seatMat), 0, 0, 0.4, false); add(c, box(4.6, 2.2, 0.25, seatMat), 0, 1.1, -0.5, false);
    if (r() < 0.75) for (const dx of r() < 0.5 ? [-1.1] : [-1.1, 1.1]) { // riders, skis dangling
      const p = person(c, dx, 0.35, 0, 600 + k * 3 + (dx > 0 ? 1 : 0), "sit"); venueAnim.pop();
      p.position.y = -1.45; wearSkis(p, SKI_COLS[Math.floor(r() * SKI_COLS.length)]);
      p.children.slice(-4, -2).forEach(s => { s.position.set(s.position.x, 0.2, 1.4); s.rotation.x = 0.5; });
    }
    g.add(c); chairs.push({ o: c, t: k / 18 });
  }
  venueAnim.push({ kind: "lift", chairs, A, B, side, dir, H });
}
function deckTable(g, x, z, seed, styled = false) { // a round table with chairs, people sitting on most
  const r = rng(seed), wood = std(0x8a5a34, { roughness: 0.8 }), dark = std(0x3a2a1c);
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.2, 18), wood), x, 2.9, z);
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 2.8, 8), dark), x, 1.5, z, false);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.3, cx = x + Math.sin(a) * 2.7, cz = z + Math.cos(a) * 2.7, face = a + Math.PI;
    const ch = new THREE.Group(); add(ch, box(1.4, 0.2, 1.4, wood), 0, 1.5, 0); add(ch, box(1.4, 1.8, 0.2, wood), 0, 2.4, -0.65);
    for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) add(ch, box(0.15, 1.5, 0.15, dark), lx, 0.75, lz, false);
    ch.position.set(cx, 0, cz); ch.rotation.y = face; g.add(ch);
    if (r() < 0.7) { if (styled) animPerson(g, cx - Math.sin(face) * 0.15, cz - Math.cos(face) * 0.15, face, seed * 7 + k, "Sit", 0.35); else person(g, cx - Math.sin(face) * 0.25, cz - Math.cos(face) * 0.25, face, seed * 7 + k, "sit"); }
  }
  if (r() < 0.6) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.5, 10), lam(0xffffff)), x + 0.4, 3.25, z - 0.3, false); // hot cocoa
}

// ── Golf Club: the 18th green at a country club in the late afternoon.
function clubhouse(g, x, z) {
  const b = new THREE.Group(), W = 110, D = 44, white = lam(0xf6f4ee), trim = lam(0xffffff), roofM = lam(0x3a4656, { flatShading: true });
  const glass = std(0xffffff, { map: dayWindowTex(), roughness: 0.15, metalness: 0.2 });
  add(b, box(W, 26, D, white), 0, 13, 0, false);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.66, D * 0.66, W + 6, 3, 1), roofM);
  roof.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); roof.scale.set(1, 1, 0.5); add(b, roof, 0, 26 + D * 0.66 * 0.25, 0, false);
  for (let wx = -48; wx <= 48; wx += 12) { if (Math.abs(wx) < 14) continue; add(b, box(6, 9, 0.3, glass), wx, 7, D / 2 + 0.05, false); add(b, box(6, 7, 0.3, glass), wx, 19, D / 2 + 0.05, false);
    for (const sx of [-1, 1]) add(b, box(1.4, 9, 0.25, lam(0x1f4a2e)), wx + sx * 3.8, 7, D / 2 + 0.2, false); }
  // the portico: a pediment on white columns over the doors
  for (let k = -2; k <= 2; k++) add(b, new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 22, 12), trim), k * 6, 11, D / 2 + 8, false);
  add(b, box(32, 2, 12, trim), 0, 23, D / 2 + 6, false);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 12, 3, 1), trim); ped.rotation.set(-Math.PI / 2, 0, 0); ped.scale.set(1, 1, 0.42); add(b, ped, 0, 27, D / 2 + 6, false);
  add(b, box(10, 14, 0.3, glass), 0, 7, D / 2 + 0.05, false);
  const sign = canvasTex(512, 128, (c, w, h) => { c.fillStyle = "#1f4a2e"; c.fillRect(0, 0, w, h); c.strokeStyle = "#e8d39a"; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16); c.fillStyle = "#fff8e6"; c.textAlign = "center"; let fs = 62; do { c.font = `bold ${fs}px Georgia, serif`; fs -= 2; } while (c.measureText("OAK HOLLOW CLUB").width > w - 50); c.fillText("OAK HOLLOW CLUB", w / 2, 84); });
  add(b, new THREE.Mesh(new THREE.PlaneGeometry(24, 6), new THREE.MeshBasicMaterial({ map: sign })), 0, 23, D / 2 + 12.1, false);
  b.position.set(x, 0, z); g.add(b);
}
function golfCart(g, x, z, rotY) {
  const c = new THREE.Group(), body = std(0xf4f4f0, { roughness: 0.4 }), dark = std(0x222222), seat = lam(0x6a4a30);
  add(c, box(4, 1.6, 8, body), 0, 1.6, 0);
  add(c, box(3.6, 1.2, 2, seat), 0, 2.8, -0.6);
  add(c, box(3.6, 2.2, 0.4, seat), 0, 3.4, -1.6);
  for (const sx of [-1.8, 1.8]) for (const sz of [-3, 3]) add(c, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 5), dark), sx, 4.4, sz * 0.7, false);
  add(c, box(4.4, 0.2, 7, body), 0, 6.4, 0, false); // canopy
  add(c, box(1.4, 2.4, 1.4, std(0x2a2a2a)), 0, 2.6, -3.4, false); // golf bag on the back
  for (const sx of [-2, 2]) for (const sz of [-2.6, 2.6]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 12), dark); w.rotation.z = Math.PI / 2; add(c, w, sx, 0.7, sz); }
  c.position.set(x, 0, z); c.rotation.y = rotY; g.add(c);
}
function puttingGreen(g, x, z, r) {
  const green = new THREE.Mesh(new THREE.CircleGeometry(r, 40), lam(0x5fbf4a)); green.rotation.x = -Math.PI / 2; green.position.set(x, 0.06, z); green.scale.set(1, 0.8, 1); g.add(green);
  const fringe = new THREE.Mesh(new THREE.RingGeometry(r, r + 2, 40), lam(0x4a9a3a)); fringe.rotation.x = -Math.PI / 2; fringe.position.set(x, 0.05, z); fringe.scale.set(1, 0.8, 1); g.add(fringe);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: 0x111111 })); hole.rotation.x = -Math.PI / 2; hole.position.set(x + r * 0.2, 0.08, z - r * 0.1); g.add(hole);
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 5), lam(0xf2f2f2)), x + r * 0.2, 4, z - r * 0.1, false);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), lam(0xd62828, { side: THREE.DoubleSide })); fl.position.set(x + r * 0.2 + 1.1, 7.3, z - r * 0.1); g.add(fl);
  venueAnim.push({ kind: "flag", o: fl, phase: 1 });
  const sign = canvasTex(64, 64, (c) => { c.fillStyle = "#fff"; c.font = "bold 40px Arial"; c.textAlign = "center"; c.fillText("18", 32, 46); });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: sign, transparent: true })); s.position.set(x + r * 0.2 + 1.1, 7.3, z - r * 0.1 + 0.02); g.add(s);
}
function bunker(g, x, z, w, d, rot) {
  const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 28), lam(0xe8d8a8)); sand.rotation.x = -Math.PI / 2; sand.rotation.z = rot; sand.scale.set(w, d, 1); sand.position.set(x, 0.07, z); g.add(sand);
}
function pond(g, x, z, w, d) {
  const n1 = waveNormalTex(7); n1.repeat.set(6, 6);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshPhysicalMaterial({ color: 0x2a7aa0, roughness: 0.1, normalMap: n1, normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 1 }));
  water.rotation.x = -Math.PI / 2; water.scale.set(w, d, 1); water.position.set(x, 0.09, z); g.add(water);
  venueAnim.push({ kind: "sea", n1, n2: n1 });
  // a fountain in the middle
  const jet = new THREE.Mesh(new THREE.ConeGeometry(1.2, 9, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  jet.position.set(x, 4.5, z); g.add(jet);
}
function putter(p) { // a putter in a golfer's hand, head on the grass
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), std(0xbfc4cc, { metalness: 0.7 })); s.position.set(0.35, 1.6, 0.6); s.rotation.x = 0.25; p.add(s);
  add(p, box(0.25, 0.2, 0.8, std(0x333333)), 0.35, 0.1, 1.05, false);
}

// An offset barrel smoker: the long cooking chamber, a firebox on the end, a stack puffing smoke.
function smoker(g, x, z, rotY) {
  const k = new THREE.Group(), black = std(0x1e1e20, { metalness: 0.6, roughness: 0.45 }), steel = std(0x8a8f99, { metalness: 0.7 });
  add(k, new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 18).rotateZ(Math.PI / 2), black), 0, 3.0, 0);
  add(k, box(1.8, 1.8, 1.8, black), 2.9, 2.6, 0);
  add(k, new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 10), black), -1.8, 4.9, 0, false);
  for (const sx of [-1.6, 1.6]) for (const sz of [-0.7, 0.7]) add(k, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), steel), sx, 1.1, sz, false);
  for (const sx of [-1.6, 1.6]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 12), black); w.rotation.x = Math.PI / 2; add(k, w, sx, 0.4, 0.8, false); }
  add(k, box(4, 0.1, 1.2, steel), 0, 1.9, 0, false); // the shelf below
  k.position.set(x, 0, z); k.rotation.y = rotY; g.add(k);
  // smoke from the stack
  const puffs = [], sx = x + Math.cos(rotY) * -1.8, sz = z - Math.sin(rotY) * -1.8;
  for (let i = 0; i < 12; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); g.add(s); puffs.push({ s, t: i / 12 }); }
  venueAnim.push({ kind: "smoke", puffs, x: sx, z: sz, life: 5, y0: 6.3 });
}
// An apron on someone (person() group): a bib down the front of the shirt, with ties.
function apron(p, color) {
  const m = lam(color);
  add(p, box(0.85, 1.9, 0.08, m), 0, 2.9, 0.52, false);
  add(p, box(0.6, 0.45, 0.08, m), 0, 4.0, 0.47, false);
  for (const sx of [-0.28, 0.28]) add(p, box(0.06, 0.5, 0.06, m), sx, 4.35, 0.4, false);
}
// Scatter trees across a ring around the court so every direction ends in trees, not empty sky.
function treeRing(g, seed, rMin, rMax, count, kinds, avoid = () => false) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = rMin + r() * (rMax - rMin), x = Math.sin(a) * d, z = -20 + Math.cos(a) * d;
    if (avoid(x, z)) continue;
    const kind = kinds[Math.floor(r() * kinds.length)], rot = r() * 6.28, sc = 1.3 + r() * 1.0;
    if (kind === "pine") { pine(g, x, z, 1.6 + r() * 1.2, false); continue; }
    loadBlender(kind).then(src => { if (!src || venueGroup !== g) return; const t = src.clone(); t.position.set(x, 0, z); t.rotation.y = rot; t.scale.setScalar(sc); g.add(t); });
  }
}
// A group of golfers out on the course: two carts and up to four players.
function golfGroup(g, x, z, rot, seed) {
  const r = rng(seed), n = 2 + Math.floor(r() * 3);
  golfCart(g, x - Math.cos(rot) * 3.5, z + Math.sin(rot) * 3.5, rot); golfCart(g, x + Math.cos(rot) * 3.5, z - Math.sin(rot) * 3.5, rot);
  for (let k = 0; k < n; k++) {
    const a = r() * 6.28, px = x + Math.sin(rot) * 8 + Math.cos(a) * 3, pz = z + Math.cos(rot) * 8 + Math.sin(a) * 3;
    const p = person(g, px, pz, r() * 6.28, seed * 10 + k, r() < 0.15 ? "cheer" : "stand"); if (r() < 0.6) putter(p);
  }
}

// The back of a two-storey family house, facing the yard: sliding glass doors onto a stone patio, windows, a back
// door with a little roof, siding and a shingled roof. (The front door is round the other side, on the street.)
function backOfHouse(g, x, z, color = 0xf2e6d0, roofColor = 0x4a4f58) {
  const h = new THREE.Group(), W = 64, D = 34, H = 22, wall = std(color, { roughness: 0.9 }), trim = lam(0xffffff);
  const glass = std(0xffffff, { map: dayWindowTex(), roughness: 0.15, metalness: 0.2 });
  add(h, box(W, H, D, wall), 0, H / 2, 0);
  for (let y = 1.5; y < H; y += 1.1) add(h, box(W + 0.05, 0.08, D + 0.05, lam(0xd8ccb4)), 0, y, 0, false); // siding lines
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.66, D * 0.66, W + 3, 3, 1), std(roofColor, { flatShading: true, roughness: 0.9 }));
  roof.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); roof.scale.set(1, 1, 0.5); add(h, roof, 0, H + D * 0.66 * 0.25, 0);
  add(h, box(4, 10, 4, lam(0x8a4a3a)), W * 0.3, H + 8, 4, false); // brick chimney
  const back = -D / 2 - 0.05; // the side facing the yard
  add(h, box(14, 8, 0.3, glass), -6, 4.4, back, false); add(h, box(14.8, 0.6, 0.4, trim), -6, 8.6, back, false); // sliding doors
  add(h, box(4, 7.5, 0.3, lam(0x2f4a6a)), 14, 3.9, back, false); // back door
  add(h, box(7, 0.4, 4, trim), 14, 8.6, back - 2, false); // its little roof
  for (const wx of [-24, 24]) add(h, box(6, 5, 0.3, glass), wx, 5, back, false);
  for (let wx = -24; wx <= 24; wx += 12) { add(h, box(5, 5, 0.3, glass), wx, 15.5, back, false); for (const sx of [-1, 1]) add(h, box(1.2, 5.4, 0.25, lam(0x3a4f6a)), wx + sx * 3.2, 15.5, back - 0.1, false); }
  // the stone patio off the back, with a table and an umbrella
  const pav = new THREE.Mesh(new THREE.PlaneGeometry(36, 14), lam(0xb8aea0)); pav.rotation.x = -Math.PI / 2; pav.position.set(-2, 0.04, -D / 2 - 7); h.add(pav);
  for (let k = -16; k <= 16; k += 4) add(h, box(0.15, 0.02, 14, lam(0x9a9080)), k - 2, 0.06, -D / 2 - 7, false);
  h.position.set(x, 0, z); g.add(h);
  deckTable(g, x - 8, z - D / 2 - 7, 77); beachUmbrella(g, x - 8, z - D / 2 - 7, ["#2f86ff", "#ffffff"], 0, 1);
}

// ── Island Hop: throwing from one little island to another, with spectators all over the water.
// An irregular island: a wobbly outline (not a circle) for the sand, a wet rim and turquoise shallows around it.
function islandShape(g, x, z, rad, seed, sandTex) {
  const r = rng(seed), n = 40, wob = [];
  for (let k = 0; k < 5; k++) wob.push([1 + Math.floor(r() * 4), r() * 6.28, 0.04 + r() * 0.06]);
  const outline = s => { const sh = new THREE.Shape(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; let k = 1; for (const [f, p, amp] of wob) k += Math.sin(a * f + p) * amp; const px = Math.cos(a) * rad * s * k, pz = Math.sin(a) * rad * s * k * 1.15; i ? sh.lineTo(px, pz) : sh.moveTo(px, pz); } return sh; };
  const layer = (s, mat, y) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(outline(s), 2), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };
  layer(1.8, new THREE.MeshBasicMaterial({ color: 0x5fe0e6, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }), 0.14);
  layer(1.12, lam(0xc9b27a, { side: THREE.DoubleSide }), 0.16);
  layer(1, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, side: THREE.DoubleSide }), 0.18);
}
// Small craft for the spectators. Each floats and bobs; riders sit or stand in them.
function hullGeo(len, w) {
  const s = new THREE.Shape(); s.moveTo(-len / 2, -w / 2); s.lineTo(len * 0.25, -w / 2); s.quadraticCurveTo(len / 2, -w * 0.3, len / 2 + 0.6, 0); s.quadraticCurveTo(len / 2, w * 0.3, len * 0.25, w / 2); s.lineTo(-len / 2, w / 2); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 }).rotateX(-Math.PI / 2);
}
function rider(b, x, z, rotY, seed, pose = "sit") {
  const p = person(b, x, z, rotY, seed, pose); venueAnim.pop(); // moves with the boat
  if (pose === "sit") p.position.y = -0.6; return p;
}
function paddle(b, x, y, z, rot, double) {
  const m = std(0xdedede), blade = lam(0xffc93a);
  const pg = new THREE.Group(); add(pg, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, double ? 7 : 4.5, 5), m), 0, 0, 0, false);
  add(pg, box(0.5, 1.1, 0.08, blade), 0, double ? 3.5 : 2.4, 0, false); if (double) add(pg, box(0.5, 1.1, 0.08, blade), 0, -3.5, 0, false);
  pg.position.set(x, y, z); pg.rotation.set(0, 0, rot); b.add(pg);
}
function craft(g, kind, x, z, rotY, seed) {
  const b = new THREE.Group(), r = rng(seed), C = [0xd62828, 0xffc93a, 0x2f86ff, 0x2fbf71, 0xff8a1f, 0xff7ac0][Math.floor(r() * 6)];
  if (kind === "canoe") { add(b, new THREE.Mesh(hullGeo(12, 2.4), std(C, { roughness: 0.5 })), 0, 0.2, 0, false); rider(b, -2.5, 0, Math.PI / 2, seed); rider(b, 2.5, 0, Math.PI / 2, seed + 1); paddle(b, -2.2, 2, 1.1, 0.6); }
  else if (kind === "kayak") { add(b, new THREE.Mesh(hullGeo(10, 1.6), std(C, { roughness: 0.4 })), 0, 0.2, 0, false); rider(b, 0, 0, Math.PI / 2, seed); paddle(b, 0, 2.5, 0, 1.3, true); }
  else if (kind === "paddle") { add(b, box(10, 0.3, 2.4, std(C, { roughness: 0.4 })), 0, 0.3, 0, false); rider(b, 0, 0, Math.PI / 2, seed, "stand").position.y = 0.4; paddle(b, 0.6, 3.4, 0.9, 0.25); }
  else if (kind === "row") { add(b, new THREE.Mesh(hullGeo(10, 3.4), std(C, { roughness: 0.5 })), 0, 0.2, 0, false); add(b, box(0.6, 0.15, 3, std(0xb08050)), 0, 1.0, 0, false); rider(b, -1.5, 0, Math.PI / 2, seed); rider(b, 2, 0, -Math.PI / 2, seed + 1); }
  else if (kind === "motor") { add(b, new THREE.Mesh(hullGeo(13, 4.4), std(0xf6f6f6, { roughness: 0.3 })), 0, 0.2, 0, false); add(b, box(13, 0.35, 4.6, std(C)), -0.4, 0.6, 0, false); add(b, box(1.2, 1.8, 1, std(0x222222)), -7, 1.4, 0, false); add(b, box(2.4, 1.6, 0.15, std(0x9fd0f0, { roughness: 0.1 })), 2.5, 2.4, 0, false); rider(b, -2, -0.9, Math.PI / 2, seed); rider(b, -2, 0.9, Math.PI / 2, seed + 1); rider(b, 1.5, 0, Math.PI / 2, seed + 2); }
  else if (kind === "raft") { add(b, new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.6, 10, 20).rotateX(Math.PI / 2), lam(C)), 0, 0.3, 0, false); rider(b, 0, -0.6, 0, seed).position.y = -0.9; }
  b.position.set(x, 0, z); b.rotation.y = rotY; g.add(b);
  venueAnim.push({ kind: "bob", o: b, phase: seed, y: 0 });
}
// Boats crossing far out, each trailing a white wake; they loop round and come again.
function cruisers(g, n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group(), C = [0xffffff, 0xd62828, 0x1f3a6e, 0xffc93a][i % 4];
    add(b, new THREE.Mesh(hullGeo(22, 7), std(0xf6f6f6, { roughness: 0.3 })), 0, 0.3, 0, false); add(b, box(22, 0.6, 7.2, std(C)), -0.4, 1.2, 0, false); add(b, box(8, 3, 5.5, std(0xf2f2f2)), -2, 3.2, 0, false); add(b, box(4, 2, 0.2, std(0x7fb4d8, { roughness: 0.1 })), 2.2, 3.8, 0, false);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(60, 9), new THREE.MeshBasicMaterial({ map: smokeTex, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })); wake.rotation.x = -Math.PI / 2; wake.position.set(-38, 0.25, 0); b.add(wake);
    g.add(b);
    venueAnim.push({ kind: "cruise", o: b, z: -170 - r() * 110 + (i % 2 ? 300 : 0), x0: -500 + r() * 1000, speed: (30 + r() * 25) * (r() < 0.5 ? 1 : -1) });
  }
}
// A big island across the water: a beach, palms along it, green hills and a few huts.
function bigIsland(g, z) {
  const r = rng(33);
  const hgt = islandHill(g, 0, z - 60, 980, 190, 42, 5); // a long island with ridges, sand along its edge
  for (let x = -440; x <= 440; x += 12 + r() * 14) { const pz = z - 10 - r() * 22, y = Math.max(0, hgt(x, pz)); if (y < 14) blenderPalm(g, x, y, pz, 300 + x, 1.15); }
  for (let k = 0; k < 70; k++) { const x = (r() - 0.5) * 880, pz = z - 40 - r() * 100, y = hgt(x, pz); if (y > 6) blenderPalm(g, x, y - 1, pz, 500 + k, 1.4); }
  for (const hx of [-160, -40, 90, 230]) { const hut = new THREE.Group(); add(hut, box(14, 7, 10, lam(0xc8a878)), 0, 3.5, 0, false); const roof = new THREE.Mesh(new THREE.ConeGeometry(12, 7, 4), lam(0xb8924a, { flatShading: true })); roof.rotation.y = Math.PI / 4; add(hut, roof, 0, 10.5, 0, false); hut.position.set(hx, Math.max(0, hgt(hx, z - 18)), z - 18); g.add(hut); }
}

// Natural island terrain: a heightfield with an uneven outline and ridges (not a dome), sand at the waterline and
// jungle greens above. Returns a height function for placing things on it.
function islandHill(g, x, z, w, d, h, seed) {
  const r = rng(seed), waves = [];
  for (let k = 0; k < 6; k++) waves.push([0.5 + r() * 2.5, 0.5 + r() * 2.5, r() * 6.28, 0.5 / (1 + k * 0.5)]);
  const height = (u, v) => { // u, v in -1..1 across the island
    let e = 1 - Math.pow(Math.hypot(u, v), 2.2);
    let n = 0; for (const [fu, fv, p, a] of waves) n += Math.sin(u * fu * 3 + p) * Math.cos(v * fv * 3 - p) * a;
    e += n * 0.35; return Math.max(-0.2, e) * h;
  };
  const geo = new THREE.PlaneGeometry(w, d, 48, 48); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = [], c = new THREE.Color(), sand = new THREE.Color(0xe8d49a), lo = new THREE.Color(0x3f8f3a), hi = new THREE.Color(0x2a6a2c);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / (w / 2), v = pos.getZ(i) / (d / 2), y = height(u, v); pos.setY(i, y);
    const t = y / h; c.copy(t < 0.06 ? sand : lo.clone().lerp(hi, Math.min(1, t * 1.4))).offsetHSL(0, 0, (r() - 0.5) * 0.04); col.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); m.position.set(x, 0, z); m.receiveShadow = true; g.add(m);
  return (px, pz) => height((px - x) / (w / 2), (pz - z) / (d / 2));
}
function blenderPalm(g, x, y, z, seed, scale = 1) {
  const r = rng(seed), kind = ["palm_a", "palm_b", "palm_c"][Math.floor(r() * 3)], rot = r() * 6.28, sc = scale * (0.9 + r() * 0.3);
  loadBlender(kind).then(src => { if (!src || venueGroup !== g) return; const t = src.clone(); t.position.set(x, y, z); t.rotation.y = rot; t.scale.setScalar(sc); g.add(t); });
}

// ── City Rooftop at night: a floodlit roof court with a lounge bar, and a varied city skyline around it.
// Night windows in different styles: office grid, glass curtain wall (bands), apartment (warm, uneven).
function nightWindows(style, seed) {
  const r = rng(seed);
  return canvasTex(128, 256, (c, w, h) => {
    if (style === "glass") {
      const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#1a3550"); g.addColorStop(1, "#0d1a2a"); c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let y = 4; y < h; y += 10) if (r() < 0.7) { c.fillStyle = `rgba(160,210,255,${0.25 + r() * 0.45})`; c.fillRect(0, y, w, 5); }
      c.fillStyle = "rgba(0,0,0,.35)"; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 2, h);
    } else if (style === "brick") {
      c.fillStyle = "#3a2420"; c.fillRect(0, 0, w, h);
      for (let y = 10; y < h; y += 26) for (let x = 10; x < w; x += 28) { c.fillStyle = r() < 0.6 ? `hsl(${35 + r() * 15},85%,${55 + r() * 20}%)` : "#120c0a"; c.fillRect(x, y, 12, 16); }
    } else {
      c.fillStyle = "#1b2233"; c.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) { c.fillStyle = r() < 0.5 ? `hsl(${45 + r() * 15},70%,${70 + r() * 20}%)` : "#0e1420"; c.fillRect(x, y, 8, 9); }
    }
  }, [1, 1]);
}
function cityTower(g, x, z, w, hgt, style, seed) {
  const r = rng(seed), tex = nightWindows(style, seed), mats = [];
  const tiers = style === "brick" ? 1 : 1 + Math.floor(r() * 3);
  let y = -20, tw = w, th = hgt;
  for (let k = 0; k < tiers; k++) { // setbacks: each tier narrower and shorter
    const h = k === tiers - 1 ? th : th * (0.5 + r() * 0.2), t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(tw / 12)), Math.max(1, Math.round(h / 22)));
    const b = new THREE.Mesh(new THREE.BoxGeometry(tw, h, tw * (0.7 + r() * 0.3)), new THREE.MeshBasicMaterial({ map: t })); b.position.set(x, y + h / 2, z); g.add(b);
    y += h; th -= h; tw *= 0.72; if (th < 10) break;
  }
  if (style !== "brick" && r() < 0.5) { // a spire or antenna with a blinking red light on top
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.2, 18 + r() * 20, 6), new THREE.MeshBasicMaterial({ color: 0x8890a0 })), x, y + 12, z, false);
    const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); l.position.set(x, y + 24, z); l.scale.setScalar(6); g.add(l);
    venueAnim.push({ kind: "blink", o: l, phase: r() * 6 });
  } else if (r() < 0.5) add(g, box(tw * 0.8, 1.2, tw * 0.6, new THREE.MeshBasicMaterial({ color: 0x9ad0ff })), x, y + 0.6, z, false); // a lit crown
}
function citySkyline(g, seed) {
  const r = rng(seed), styles = ["glass", "office", "brick", "glass", "office"];
  // about 18 distinct buildings in loose groups with gaps between them
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2 + (r() - 0.5) * 0.25, d = 150 + r() * 170, style = styles[Math.floor(r() * styles.length)];
    const hgt = style === "brick" ? 30 + r() * 30 : 70 + r() * 150, w = style === "brick" ? 40 + r() * 30 : 22 + r() * 22;
    cityTower(g, Math.sin(a) * d, -15 + Math.cos(a) * d, w, hgt, style, seed * 100 + k);
  }
  // a low, far ring of city lights so the horizon is never empty
  const far = nightWindows("office", seed + 9); far.repeat.set(60, 1);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(560, 560, 40, 64, 1, true), new THREE.MeshBasicMaterial({ map: far, side: THREE.BackSide, fog: false }));
  ring.position.set(0, 0, -15); g.add(ring);
}
function roofFlood(g, x, z, aimX, aimZ) {
  const pole = std(0x6a6e78, { metalness: 0.6 });
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 24, 8), pole), x, 12, z, false);
  const head = add(g, box(4, 2.4, 1.2, new THREE.MeshBasicMaterial({ color: 0xfffbe6 })), x, 24, z, false); head.lookAt(aimX, 0, aimZ);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff6d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 })); s.position.set(x, 24, z); s.scale.setScalar(10); g.add(s); glowSprites.push(s);
  const l = new THREE.SpotLight(0xfff6e6, 900, 120, 0.7, 0.5, 1.4); l.position.set(x, 24, z); l.target.position.set(aimX, 0, aimZ); g.add(l); g.add(l.target);
}
function skyBar(g, x, z, rotY) {
  const b = new THREE.Group(), wood = std(0x3a2a1c), top = std(0x1c1c1c, { roughness: 0.3, metalness: 0.4 });
  add(b, box(20, 3.6, 3, wood), 0, 1.8, 0); add(b, box(21, 0.3, 3.6, top), 0, 3.75, 0);
  add(b, box(20, 0.25, 0.3, new THREE.MeshBasicMaterial({ color: 0x5fd8ff })), 0, 0.3, 1.6, false); // glow strip
  const sign = canvasTex(512, 128, (c, w, h) => { c.fillStyle = "#0b0f1a"; c.fillRect(0, 0, w, h); c.shadowColor = "#5fd8ff"; c.shadowBlur = 26; c.fillStyle = "#c8f2ff"; c.font = "bold 80px Arial Black, sans-serif"; c.textAlign = "center"; c.fillText("SKY BAR", w / 2, 92); });
  add(b, new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: sign })), 0, 9, -1.4, false);
  add(b, box(20, 0.4, 1, wood), 0, 6.6, -1.6, false); for (const sx of [-9.5, 9.5]) add(b, box(0.4, 7, 0.4, wood), sx, 3.5, -1.6, false);
  for (let k = -3; k <= 3; k++) { const st = new THREE.Group(); add(st, new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.2, 12), top), 0, 2.8, 0, false); add(st, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 6), std(0xaaaaaa, { metalness: 0.7 })), 0, 1.4, 0, false); st.position.set(k * 2.8, 0, 3.2); b.add(st); }
  b.position.set(x, 0, z); b.rotation.y = rotY; g.add(b);
}
function sofa(g, x, z, rotY, color) {
  const s = new THREE.Group(), m = std(color, { roughness: 0.9 });
  add(s, box(7, 1.4, 3, m), 0, 0.9, 0); add(s, box(7, 2, 0.8, m), 0, 2, -1.1); for (const sx of [-3.3, 3.3]) add(s, box(0.6, 1.8, 3, m), sx, 1.4, 0);
  s.position.set(x, 0, z); s.rotation.y = rotY; g.add(s);
}

// The party: a DJ booth with speakers and a light wall, people dancing, high bistro tables, coloured party lights.
function djBooth(g, x, z, rotY) {
  const b = new THREE.Group(), black = std(0x141418, { roughness: 0.6 });
  add(b, box(9, 3.4, 3, black), 0, 1.7, 0); add(b, box(9.2, 0.25, 3.2, std(0x2a2a30)), 0, 3.5, 0);
  add(b, box(8.6, 0.25, 0.2, new THREE.MeshBasicMaterial({ color: 0xff2e88 })), 0, 0.8, 1.55, false);
  for (const sx of [-2.2, 2.2]) add(b, new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.15, 20), std(0x333333)), sx, 3.7, 0, false); // the decks
  for (const sx of [-6.5, 6.5]) { add(b, box(2.6, 6, 2.4, black), sx, 3, 0); for (const y of [1.6, 4.2]) add(b, new THREE.Mesh(new THREE.CircleGeometry(0.85, 20), std(0x222222)), sx, y, 1.22, false); }
  const wall = canvasTex(256, 128, (c, w, h) => { for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { c.fillStyle = `hsl(${(x + y) * 1.4 % 360},90%,60%)`; c.fillRect(x + 1, y + 1, 6, 6); } });
  const led = add(b, new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.MeshBasicMaterial({ map: wall })), 0, 7.5, -1.6, false);
  venueAnim.push({ kind: "led", tex: wall });
  const dj = person(b, 0, -0.9, 0, 77, "cheer"); // hands up behind the decks
  b.position.set(x, 0, z); b.rotation.y = rotY; g.add(b);
}
function dancers(g, cx, cz, n, rad, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 0.8 + r() * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const p = person(g, x, z, r() * 6.28, seed * 10 + i, r() < 0.5 ? "cheer" : "stand"); const an = venueAnim[venueAnim.length - 1]; an.kind = "dance"; an.rate = 4 + r() * 2;
  }
  const floor = canvasTex(256, 256, (c, w, h) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = `hsl(${(x * 47 + y * 83) % 360},80%,${(x + y) % 2 ? 35 : 55}%)`; c.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(rad * 2 + 4, rad * 2 + 4), new THREE.MeshBasicMaterial({ map: floor })); f.rotation.x = -Math.PI / 2; f.position.set(cx, 0.03, cz); g.add(f);
}
function bistroTable(g, x, z, seed) {
  const r = rng(seed), top = std(0x1c1c1c, { roughness: 0.3, metalness: 0.4 }), steel = std(0xb0b4bc, { metalness: 0.8, roughness: 0.3 });
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.15, 18), top), x, 3.6, z);
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.5, 8), steel), x, 1.8, z, false);
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.12, 14), steel), x, 0.06, z, false);
  for (let k = 0; k < 2; k++) {
    const a = r() * 6.28, sx = x + Math.cos(a) * 2, sz = z + Math.sin(a) * 2;
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 12), top), sx, 2.9, sz); add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), steel), sx, 1.4, sz, false);
    if (r() < 0.6) person(g, sx + Math.cos(a) * 0.5, sz + Math.sin(a) * 0.5, Math.atan2(x - sx, z - sz), seed * 3 + k, r() < 0.4 ? "drink" : "stand");
  }
}
function partyLights(g, n, seed) { // coloured beams sweeping over the crowd
  const r = rng(seed), cols = [0xff2e88, 0x5fd8ff, 0xffc93a, 0x8a4dff, 0x3ee07a];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: cols[i % cols.length], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    s.scale.setScalar(5); s.material.opacity = 0.4; g.add(s); glowSprites.push(s);
    venueAnim.push({ kind: "sweep", o: s, cx: 22 + (r() - 0.5) * 4, cz: -32 + (r() - 0.5) * 6, rad: 2 + r() * 4, speed: 0.6 + r() * 0.8, phase: r() * 6 });
  }
}

// ───────────────────────── Stylized art test (Quaternius CC0 packs): nature models and animated people
const NATURE = "assets/nature/", PEOPLE = "assets/people/", natureCache = new Map(), peopleCache = new Map();
function loadNature(name) {
  if (!natureCache.has(name)) natureCache.set(name, gltfLoader.loadAsync(`${NATURE}${name}.json`).then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material.side = THREE.DoubleSide; } });
    return g.scene;
  }).catch(() => null));
  return natureCache.get(name);
}
function plant(g, name, x, z, scale, rot) { // models are in metres; the court is in feet
  loadNature(name).then(src => { if (!src || venueGroup !== g) return; const m = src.clone(); m.position.set(x, 0, z); m.rotation.y = rot ?? Math.random() * 6.28; m.scale.setScalar(FT * scale); g.add(m); });
}
const PEOPLE_MODELS = ["male_casual", "male_longsleeve", "male_shirt", "female_casual", "female_tanktop", "female_alternative", "female_dress"];
function loadPeople(name) {
  if (!peopleCache.has(name)) peopleCache.set(name, gltfLoader.loadAsync(`${PEOPLE}${name}.json`).then(gl => {
    gl.scene.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(gl.scene); gl.tall = (bb.max.y - bb.min.y) || 1; gl.base = bb.min.y; return gl; // measured, so any export scale works
  }).catch(() => null));
  return peopleCache.get(name);
}
const P_SKIN = ["#f6d2b8", "#eab894", "#d29a6c", "#a8714a", "#7a4e30", "#5a3620"], P_HAIR = ["#2a1c14", "#4a2e1a", "#8a5a2e", "#d9a94e", "#b03a1c", "#1c1c22", "#9aa0a8"];
const P_SHIRT = ["#d62828", "#2f86ff", "#ffc93a", "#2fbf71", "#ff8a1f", "#8a4dff", "#ff7ac0", "#f2f2f2", "#1f3a6e"], P_PANTS = ["#2a3550", "#3a3a40", "#6a5a40", "#1f2a44", "#8a7a60", "#d8ccb4"];
// An animated person: anim is Idle, Clap, Jump, Sit or Walk. Height in feet (about 5.3 to 6.2).
function animPerson(g, x, z, rotY, seed, anim = "Idle", y = 0) {
  const r = rng(seed), name = PEOPLE_MODELS[Math.floor(r() * PEOPLE_MODELS.length)];
  const look = { Skin: P_SKIN[Math.floor(r() * P_SKIN.length)], Hair: P_HAIR[Math.floor(r() * P_HAIR.length)], Shirt: P_SHIRT[Math.floor(r() * P_SHIRT.length)], Pants: P_PANTS[Math.floor(r() * P_PANTS.length)] };
  const h = 5.3 + r() * 0.9, phase = r() * 3;
  loadPeople(name).then(gl => {
    if (!gl || venueGroup !== g) return;
    const m = SkeletonUtils.clone(gl.scene);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (look[o.material.name]) { o.material = o.material.clone(); o.material.color.set(look[o.material.name]); } } });
    const k = h / gl.tall; m.position.set(x, y - gl.base * k, z); m.rotation.y = rotY; m.scale.setScalar(k); g.add(m);
    const mixer = new THREE.AnimationMixer(m), clip = gl.animations.find(c => c.name === anim) || gl.animations[0];
    const act = mixer.clipAction(clip); act.play(); act.time = phase * clip.duration / 3;
    venueAnim.push({ kind: "mixer", mixer });
  });
}
// A low-poly lawn: flat green with gentle patches of light and dark, no photo texture.
function stylizedLawn(g, size, seed) {
  const geo = new THREE.PlaneGeometry(size, size, 60, 60); geo.rotateX(-Math.PI / 2);
  const r = rng(seed), pos = geo.attributes.position, col = [], c = new THREE.Color(), a = new THREE.Color(0x76c05a), b = new THREE.Color(0x5aa646);
  for (let i = 0; i < pos.count; i++) { const k = 0.5 + 0.5 * Math.sin(pos.getX(i) * 0.07 + Math.sin(pos.getZ(i) * 0.05) * 2) * Math.cos(pos.getZ(i) * 0.06); c.copy(a).lerp(b, k * 0.8 + r() * 0.15); col.push(c.r, c.g, c.b); }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); m.position.z = -30; m.receiveShadow = true; g.add(m);
}
function styledFence(g) { // painted wooden fence: posts, rails and boards in two warm tones
  const board = lam(0xb98a5a), post = lam(0x8a6038);
  const run = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0), n = Math.round(len / 0.75);
    for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t); const bd = add(g, box(0.62, 5.2 + (i % 2) * 0.15, 0.18, i % 9 ? board : post), x, 2.6, z); bd.rotation.y = rot + Math.PI / 2; }
    for (let i = 0; i <= Math.round(len / 8); i++) { const t = i / Math.round(len / 8); add(g, box(0.5, 6, 0.5, post), lerp(x0, x1, t), 3, lerp(z0, z1, t)); }
  };
  run(-26, -46, 26, -46); run(-26, -46, -26, 10); run(26, -46, 26, 10);
}
function styledBackyard(g) {
  stylizedLawn(g, 700, 3);
  styledFence(g);
  backOfHouse(g, 2, 66);
  // trees all the way round: a mix of leafy, birch and pine, bigger the further out
  const r = rng(91), leafy = ["commontree_1", "commontree_2", "commontree_3", "commontree_4", "commontree_5"], others = ["birchtree_1", "birchtree_3", "pinetree_1", "pinetree_3", "pinetree_5"];
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = 55 + r() * 140, x = Math.sin(a) * d, z = -15 + Math.cos(a) * d;
    if (z > 40 && Math.abs(x) < 50) continue; // the house
    const kind = r() < 0.6 ? leafy[Math.floor(r() * leafy.length)] : others[Math.floor(r() * others.length)];
    plant(g, kind, x, z, 3.2 + r() * 1.6);
  }
  for (const [x, z] of [[-21, -40], [21, -38], [-22, 4]]) plant(g, leafy[Math.floor(r() * 5)], x, z, 3.4);
  // shrubs and flowers along the fence, grass tufts and a few rocks on the lawn
  for (let x = -24; x <= 24; x += 3 + r() * 2.5) plant(g, r() < 0.35 ? "flowers" : r() < 0.6 ? "bushberries_1" : "bush_1", x, -44.3, 1.0 + r() * 0.4);
  for (let z = -40; z <= 6; z += 4 + r() * 3) for (const sx of [-1, 1]) plant(g, r() < 0.3 ? "flowers" : r() < 0.6 ? "bush_2" : "plant_3", sx * 24.2, z, 1.0 + r() * 0.4);
  for (let i = 0; i < 60; i++) { const x = (r() - 0.5) * 46, z = -44 + r() * 54; if (Math.abs(x) < 5 && z > -32 && z < 2) continue; plant(g, r() < 0.7 ? "grass_short" : "grass", x, z, 0.35 + r() * 0.3); }
  plant(g, "rock_1", -18, -20, 1.6); plant(g, "rock_moss_2", 19, -28, 1.4); plant(g, "treestump", -20, 18, 2);
  // the cookout: grill and smoker, tables, string lights
  grill(g, 15, 4, -0.5); smoker(g, 19.5, 9, -0.6);
  deckTable(g, -15, -4, 41, true); deckTable(g, 18, -10, 43, true); deckTable(g, -17, 24, 45, true); picnicTable(g, -15, 14, 0.3);
  stringLights(g, [[-9, -38], [9, -38], [-9, -14], [9, -14]], [[[-9, -38], [9, -38]], [[-9, -38], [-9, -14]], [[9, -38], [9, -14]], [[-9, -14], [9, -26]], [[9, -14], [-9, -26]]], 10.6, 2, 0.35);
  // people: the cook, friends at the tables, a few watching (some clapping)
  animPerson(g, 15.5, 8.2, Math.PI - 0.5, 33, "Idle");
  for (const [x, z, f, s] of [[-13, 12, 2.6, 1], [-17, 16, -0.6, 2], [-12, 16, 3.6, 3], [22, -2, -2.2, 4], [24, 0, -2.6, 5]]) animPerson(g, x, z, f, 200 + s, "Idle");
  for (const [x, z, f, s] of [[-11, -30, 0.9, 6], [-12.5, -27, 1.2, 7], [11.5, -24, -1.1, 8], [12, -32, -0.8, 9]]) animPerson(g, x, z, f, 300 + s, s % 2 ? "Clap" : "Idle");
  loadSky("garden_nook_2k.hdr").then(sky => { if (!sky || venueId !== "backyard") return; scene.environment = sky.env; scene.environmentIntensity = 0.6; }); // soft light only; the sky behind stays the game's blue
  renderer.toneMappingExposure = 1.12;
}

const VENUE_LOOK = {
  backyard: { top: [0.19, 0.44, 0.80], mid: [0.56, 0.78, 0.95], horizon: [1.0, 0.83, 0.62], sunGlow: 1, night: 0, fog: [0xf2cfa0, 90, 260],
    hemi: [0xd6ecff, 0x557a2c, 1.25], sun: [0xffe3b8, 2.9, [-26, 20, -18]], exposure: 1.08, dust: 0xf1dcb0 },
  tailgate: { top: [0.10, 0.38, 0.82], mid: [0.48, 0.70, 0.94], horizon: [0.84, 0.91, 0.98], sunGlow: 0.6, night: 0, fog: [0xd4e3f2, 260, 690],
    hemi: [0xe6f2ff, 0x5a5c58, 1.3], sun: [0xfff4e2, 3.1, [-20, 38, -6]], exposure: 1.02, dust: 0xbfbcb4 },
  beach: { top: [0.10, 0.48, 0.88], mid: [0.45, 0.78, 0.98], horizon: [0.88, 0.95, 1.0], sunGlow: 0.8, night: 0, fog: [0xd6e6f2, 350, 1900],
    hemi: [0xe6f6ff, 0xd8c08a, 1.35], sun: [0xfff4dc, 3.3, [-14, 34, -6]], exposure: 1.0, dust: 0xf0dca8 },
  brewery: { top: [0.16, 0.42, 0.80], mid: [0.52, 0.74, 0.94], horizon: [0.92, 0.88, 0.80], sunGlow: 0.8, night: 0, fog: [0xd2e2f0, 200, 700],
    hemi: [0xdcecff, 0x7a5a48, 1.2], sun: [0xfff0d8, 3.0, [-22, 34, 6]], exposure: 1.05, dust: 0xd8c0a0 },
  lodge: { top: [0.42, 0.52, 0.66], mid: [0.70, 0.77, 0.86], horizon: [0.88, 0.91, 0.95], sunGlow: 0.25, night: 0, fog: [0xdfe6ef, 70, 330],
    hemi: [0xeef4ff, 0xb8c8dc, 1.4], sun: [0xf4f6ff, 2.2, [-18, 30, -10]], exposure: 1.0, dust: 0xffffff },
  bonfire: { top: [0.16, 0.42, 0.80], mid: [0.52, 0.74, 0.94], horizon: [0.92, 0.90, 0.86], sunGlow: 0.8, night: 0, fog: [0xd8e6f0, 250, 800],
    hemi: [0xe6f2ff, 0x4a6a3a, 1.25], sun: [0xfff2dc, 3.0, [-24, 36, -10]], exposure: 1.05, dust: 0xe0e8c0 },
  island: { top: [0.08, 0.42, 0.86], mid: [0.40, 0.74, 0.97], horizon: [0.85, 0.95, 1.0], sunGlow: 0.9, night: 0, fog: [0xc8ecff, 140, 460],
    hemi: [0xe6f6ff, 0x3aa8c8, 1.35], sun: [0xfff2d6, 3.3, [16, 34, -4]], exposure: 1.0, dust: 0xe8f8ff },
  rooftop: { top: [0.02, 0.04, 0.14], mid: [0.06, 0.10, 0.26], horizon: [0.20, 0.22, 0.40], sunGlow: 0, night: 1, fog: [0x141a30, 200, 700],
    hemi: [0xcfdcff, 0x3a3a48, 1.0], sun: [0xfff6e6, 2.4, [-6, 40, 4]], exposure: 1.1, dust: 0xd8d8e0 },
  lakeside: { top: [0.30, 0.50, 0.78], mid: [0.62, 0.76, 0.90], horizon: [0.95, 0.88, 0.78], sunGlow: 0.9, night: 0, fog: [0xd8e2ea, 70, 340],
    hemi: [0xe0eeff, 0x4a6a3a, 1.25], sun: [0xffe6c0, 2.7, [-20, 18, -30]], exposure: 1.05, dust: 0xd8e6d0 },
  canyon: { top: [0.18, 0.40, 0.75], mid: [0.55, 0.68, 0.85], horizon: [1.0, 0.78, 0.55], sunGlow: 1.2, night: 0, fog: [0xf0c898, 120, 420],
    hemi: [0xfff0d8, 0x9a5a30, 1.2], sun: [0xfff0d0, 3.4, [-10, 40, -8]], exposure: 1.02, dust: 0xe0a870 },
  carnival: { top: [0.14, 0.42, 0.82], mid: [0.50, 0.73, 0.95], horizon: [0.90, 0.92, 0.94], sunGlow: 0.8, night: 0, fog: [0xd2e2f0, 160, 520],
    hemi: [0xe6f2ff, 0x5a6a3a, 1.25], sun: [0xfff4e2, 3.1, [-20, 38, -8]], exposure: 1.04, dust: 0xd8d8d0 },
  stadium: { top: [0.14, 0.42, 0.82], mid: [0.50, 0.73, 0.95], horizon: [0.90, 0.92, 0.94], sunGlow: 0.8, night: 0, fog: [0xd8e4f0, 180, 560],
    hemi: [0xe6f2ff, 0x2d5a2f, 1.25], sun: [0xfff4e2, 3.1, [-20, 38, -8]], exposure: 1.04, dust: 0xd8d8d0, wall: [12, 32] },
};
function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); const m = n.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); }); }
function buildVenue(id) {
  if (id === venueId) return;
  if (venueGroup) { scene.remove(venueGroup); disposeTree(venueGroup); }
  venueId = id; glowSprites = []; venueAnim = []; clearPhotoSky();
  // Glow (bloom) only where there are real lights at night; in daylight it hazes the whole picture.
  glowOn = VENUE_LOOK[id].night >= 0.5;
  const g = new THREE.Group(), L = VENUE_LOOK[id];
  skyU.top.value.set(...L.top); skyU.mid.value.set(...L.mid); skyU.horizon.value.set(...L.horizon); skyU.sunGlow.value = L.sunGlow; skyU.night.value = L.night;
  scene.fog.color.setHex(L.fog[0]); scene.fog.near = L.fog[1]; scene.fog.far = L.fog[2];
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1]; sun.position.set(...L.sun[2]);
  skyU.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();
  renderer.toneMappingExposure = L.exposure; venueDust = L.dust;

  if (id === "backyard" && career.artTest) { styledBackyard(g); // the stylized art test (🧪 switch in the clubhouse)
  } else if (id === "backyard") {
    // Photo-real backyard: real sky light, a photo lawn and plank fence, and scanned chairs, table and shrubs.
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), photoMat("sparse_grass", 520 / 9, 520 / 9, { tint: 0xb4ff6a, bump: 0.8, fallback: 0x5fae3e }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.z = -30; lawn.receiveShadow = true; g.add(lawn);
    blenderTrees(g, 21, ["tree_oak", "tree_maple", "tree_oak", "tree_pine"], { front: 62 });
    backOfHouse(g, 2, 66); // the back of the house, behind you: we're in the backyard
    plankFence(g);
    stringLights(g, [[-9, -38], [9, -38], [-9, -14], [9, -14]], [[[-9, -38], [9, -38]], [[-9, -38], [-9, -14]], [[9, -38], [9, -14]], [[-9, -14], [9, -26]], [[9, -14], [-9, -26]]]);
    placeModel(g, "plastic_monobloc_chair_01", -7.5, -36, 0.35); // set back from the board, facing the players
    placeModel(g, "plastic_monobloc_chair_01", 7.8, -37, -0.35);
    placeModel(g, "wooden_picnic_table", -15, 14, 0.3 + Math.PI / 2);
    const r = rng(77);
    for (let x = -22; x <= 22; x += 5.5 + r() * 2) placeModel(g, r() < 0.5 ? "shrub_02" : "shrub_04", x, -43.5 - r(), r() * 6, 0.9 + r() * 0.5);
    for (let z = -38; z <= 4; z += 7 + r() * 3) for (const sx of [-1, 1]) placeModel(g, r() < 0.5 ? "shrub_02" : "shrub_04", sx * (23.5 - r()), z, r() * 6, 0.8 + r() * 0.5);
    placeModel(g, "planter_box_01", -9, 34, 0); placeModel(g, "planter_box_01", 17, 34, 0);
    // a backyard party: friends by the picnic table and the grill, a couple watching the game from the side
    grill(g, 15, 4, -0.5);
    smoker(g, 19.5, 9, -0.6);
    { const cook = person(g, 15.5, 8.2, Math.PI - 0.5, 33, "stand"); apron(cook, 0xd62828); } // the cook, between the grill and the smoker
    deckTable(g, -15, -4, 41); deckTable(g, 18, -10, 43); deckTable(g, -17, 24, 45);
    crowd(g, -14, 10, 4, 2.6, 21, -15, 14);
    crowd(g, 22, -3, 3, 2.2, 23, 15, 4); // chatting a few steps from the grill
    person(g, -11, -30, 0.9, 25, "drink"); person(g, -12.5, -27, 1.2, 27, "stand");
    person(g, 11.5, -24, -1.1, 29, "cheer");
    loadSky("garden_nook_2k.hdr").then(sky => {
      if (!sky || venueId !== "backyard") return;
      scene.environment = sky.env; scene.background = sky.bg; skyMesh.visible = false;
      hemi.intensity = 0.85; renderer.toneMappingExposure = 1.12;
      scene.fog.color.setHex(0xc9dcef); scene.fog.near = 220; scene.fog.far = 640; // light sky-coloured, far off
    });
  } else if (id === "tailgate") {
    // Game day: a packed lot right outside the stadium, with fans, grills and tailgates down.
    setGround(g, "asphalt", 18);
    stadiumNextDoor(g, 0, -205);
    campus(g);
    truck(g, -16, -24, 0.15, 0xc8102e); truck(g, 17, -30, -0.2, 0x2f6fd9); truck(g, -18, -52, 0.1, 0xf2f2f2); truck(g, 16, -2, -0.1, 0x222222); truck(g, -17, 20, -0.1, 0xffc93a); truck(g, 15, 26, 0.15, 0x2fbf71);
    // a packed lot: rows of parked cars out to both sides, behind the boards and around the stadium
    const r = rng(19), CARS = [0xc8102e, 0x1f3a6e, 0xf2f2f2, 0x222222, 0x9aa4b2, 0x2f86ff, 0x6a6a70, 0x8a1020, 0x2fbf71, 0xb8b8bc, 0xffc93a], lot = [];
    const park = (x, z, rot) => lot.push([x, z, rot + (r() - 0.5) * 0.08, CARS[Math.floor(r() * CARS.length)], r() < 0.4 ? "suv" : "sedan"]);
    for (const sx of [-1, 1]) for (let row = 0; row < 7; row++) for (let z = -150; z <= 120; z += 7.4 + r() * 0.8) {
      if (r() < 0.06) continue;
      park(sx * (34 + row * 17 + r() * 0.8), z, Math.PI / 2 + (row % 2 ? Math.PI : 0));
    }
    for (const zr of [-104, -121, -138]) for (let x = -64; x <= 64; x += 7.4 + r() * 0.8) if (Math.abs(x) > 14 && r() > 0.06) park(x, zr - r(), zr % 2 ? Math.PI : 0);
    for (const zr of [56, 73, 90]) for (let x = -26; x <= 26; x += 7.4 + r() * 0.8) if (r() > 0.1) park(x, zr, zr === 73 ? Math.PI : 0);
    for (const sx of [-1, 1]) for (let row = 0; row < 3; row++) for (let z = -270; z <= -160; z += 7.4 + r() * 0.8) if (r() > 0.08) park(sx * (118 + row * 15), z, Math.PI / 2 + (row % 2 ? Math.PI : 0));
    carLot(g, lot);
    for (const [x, z] of [[-30, -70], [30, -70], [-30, 0], [30, 0], [-30, 50], [30, 50]]) lotLight(g, x, z);
    tent(g, 0, 34, 0xd62828); tent(g, -10, -50, 0xff8a1f); tent(g, 11, -52, 0x2f86ff); tent(g, -24, 34, 0x1f3a6e);
    // grills with smoke, and fans gathered around them and the tents
    grill(g, -10, -14, 0.4); grill(g, 12, -44, -0.6);
    crowd(g, -13, -16, 4, 2.5, 3, -10, -14);
    crowd(g, 14, -42, 3, 2.2, 5, 12, -44);
    crowd(g, -10, -50, 5, 3.5, 7, 0, -27);
    crowd(g, 11, -52, 4, 3, 9, 0, -27);
    crowd(g, 0, 34, 5, 4, 11, 0, 0);
    crowd(g, -21, 8, 3, 2, 13, -17, 20);
    crowd(g, 20, -16, 3, 2, 15, 0, -15); // watching the game chair(g, -7, -38, 0.3, 0xffc93a); chair(g, 7.5, -39, -0.3, 0x2fbf71);
    picnicTable(g, -18, -32, 0.1);
  } else if (id === "beach") {
    // A resort beach: the sea and its surf alongside the court, rows of umbrellas and loungers, palms where the sand
    // ends, hotel towers behind them, a surf shack, lifeguard towers, and a cruise ship out on the water.
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(260, 1400), photoMat("coast_sand_01", 260 / 14, 1400 / 14, { fallback: 0xe8d4a8, tint: 0xfff2dc, bump: 0.7 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(SHORE_X + 6 - 130, 0, -500); sand.receiveShadow = true; g.add(sand);
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(9, 1400), photoMat("coast_sand_01", 1, 1400 / 14, { fallback: 0xc0ae88, tint: 0xc4b498, bump: 0.4 }));
    wet.material.roughness = 0.35; wet.rotation.x = -Math.PI / 2; wet.position.set(SHORE_X - 3, 0.04, -500); wet.receiveShadow = true; g.add(wet);
    sea(g);
    // the promenade, palms where the sand ends, and the hotels behind them
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(10, 1400), lam(0xd8cdb8)); walk.rotation.x = -Math.PI / 2; walk.position.set(-52, 0.06, -500); g.add(walk);
    const pr = rng(31), kinds = ["palm_a", "palm_b", "palm_c"];
    for (let z = 60; z > -1000; z -= 9 + pr() * 9) blenderPalm(g, -36 - pr() * 30, 0, z + pr() * 6, 2000 + Math.round(-z), 0.85 + pr() * 0.45); // scattered between the beach and the buildings
    for (let z = 60; z > -1000; z -= 13 + pr() * 3) for (const px of [-45, -59]) {
      const kind = kinds[Math.floor(pr() * 3)], rot = pr() * 6.28, sc = 0.95 + pr() * 0.3, pz = z + (px < -50 ? 6 : 0);
      loadBlender(kind).then(src => { if (!src || venueGroup !== g) return; const t = src.clone(); t.position.set(px, 0, pz); t.rotation.y = rot; t.scale.setScalar(sc); g.add(t); });
    }
    // beach homes along the front, with a resort tower every so often
    const ht = hotelTex(), st = sidingTex(), HCOL = [0xffffff, 0xffe2c8, 0xd8f0ec, 0xfff1c4, 0xf6d6d6, 0xe2ecff];
    const HOUSE = [0x9fd8e8, 0xffd7a8, 0xc8e8c0, 0xfff0a8, 0xf4c2c8, 0xd6d0f4, 0xffffff, 0xa8c8f0], ROOF = [0x5a6470, 0x8a4a3a, 0x3f5f7a, 0x6a6a60];
    let hz = 70;
    for (let i = 0; hz > -1000; i++) {
      if (i % 6 === 5) { const w = 50 + pr() * 30, h = 70 + pr() * 70, d = 38; hotel(g, -100 - pr() * 8, hz - w / 2, w, h, d, HCOL[i % HCOL.length], ht); hz -= w + 12; }
      else { const w = 26 + pr() * 10; beachHouse(g, -84, hz - w / 2, w, 2 + Math.floor(pr() * 2), HOUSE[Math.floor(pr() * HOUSE.length)], ROOF[Math.floor(pr() * ROOF.length)], st); hz -= w + 7 + pr() * 5; }
    }
    // rows of umbrellas with a pair of loungers each, facing the water (kept clear of the court and the shack)
    const SETS = [["#ff4b3a", "#ffffff"], ["#2f86ff", "#ffffff"], ["#ffc93a", "#ff6a3d"], ["#2fbf71", "#ffffff"]];
    const rowsAt = [[-15, 1], [-27, 2], [-38, 3]], ur = rng(71); // the water side stays open so you can watch the waves
    for (const [rx, si] of rowsAt) {
      const ums = [], lng = [];
      for (let z = 40; z > -620; z -= 11) {
        if (rx < -20 && z > -62 && z < -18) continue; // the surf shack
        if (rx > 0 && z > -82 && z < -40) continue;   // the lifeguard tower
        if (ur() < 0.08) continue;
        ums.push([rx, z, ur() * 6]); for (const dz of [-2.4, 2.4]) lng.push([rx - 2.5, z + dz, Math.PI / 2]);
      }
      umbrellaRow(g, ums, SETS[si]); loungerRow(g, lng, [0x2f86ff, 0xffffff, 0xffc93a, 0x2fbf71][si]);
    }
    beachShack(g, -31, -40, Math.PI / 2);
    surfboard(g, -24, -55, 1.2, 0xff6a3d, 0xffffff); surfboard(g, -23, -57.5, 1.5, 0x2fd0c8, 0xffc93a);
    lifeguardTower(g, 12, -95, Math.PI / 2); lifeguardTower(g, 11, -330, Math.PI / 2); // one close by, one down the beach
    towel(g, 8, -6, 0.1, ["#ff7ac0", "#ffffff"]); towel(g, -9, -14, -0.2, ["#2f86ff", "#ffffff", "#ffc93a"]);
    // people: at the shack, playing volleyball, sunbathing, watching the game and out in the waves
    crowd(g, -21, -36, 4, 2.6, 41, -31, -40);
    person(g, 9, -36, -1.2, 45, "stand"); person(g, -10, -42, 1.0, 46, "cheer"); person(g, 10, 10, 2.6, 47, "drink"); person(g, 13, -80, 1.6, 48, "stand");
    const wr = rng(53);
    for (let i = 0; i < 10; i++) { const p = person(g, SHORE_X + 8 + wr() * 22, 20 - wr() * 220, wr() * 6.28, 60 + i, wr() < 0.4 ? "cheer" : "stand"); venueAnim[venueAnim.length - 1].y0 = -2.9 - wr() * 0.6; p.position.y = -3; }
    // out on the water: the cruise ship far off, a sailboat nearer in and clear of it; gulls overhead
    cruiseShip(g, 760, -900, 300); // way out on the horizon
    sailboat(g, 200, -380, 0xffffff, 0.4); sailboat(g, 380, -640, 0xff6a3d, 2.1); // well offshore, clear of the ship from the court
    beachDistance(g);
    gulls(g, 6, 10, -60, 7);
    loadSky("kloofendal_48d_partly_cloudy_puresky_2k.hdr").then(sky => {
      if (!sky || venueId !== "beach") return;
      scene.environment = sky.env; scene.background = sky.bg; skyMesh.visible = false;
      hemi.intensity = 0.9; renderer.toneMappingExposure = 1.05;
      scene.fog.color.setHex(0xd6e6f2); scene.fog.near = 350; scene.fog.far = 1900;
    });
  } else if (id === "brewery") {
    // Lunchtime on the brick patio behind Nonna's Pizza: the wood fire glowing through the window, café tables under
    // market umbrellas, planters, string lights, and the shops along the street on both sides.
    const street = new THREE.Mesh(new THREE.PlaneGeometry(150, 230), lam(0x3a3a3e)); street.rotation.x = -Math.PI / 2; street.position.set(0, -0.05, -30); g.add(street);
    const patio = new THREE.Mesh(new THREE.PlaneGeometry(56, 104), photoMat("herringbone_brick", 56 / 8, 104 / 8, { fallback: 0x8a4a34, bump: 0.8 }));
    patio.rotation.x = -Math.PI / 2; patio.position.set(0, 0.02, -14); patio.receiveShadow = true; g.add(patio);
    for (const sx of [-1, 1]) { // sidewalks
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(14, 140), lam(0x8c8a84)); walk.rotation.x = -Math.PI / 2; walk.position.set(sx * 35, 0.01, -14); g.add(walk);
    }
    pizzeria(g, 0, -80);
    // a tree line all the way round, with low hedges in front of it, so the view always ends in green, not sky
    const trr = rng(97), tk = ["tree_oak", "tree_maple", "tree_oak"], tspots = [];
    for (let x = -130; x <= 130; x += 8 + trr() * 5) { tspots.push([x, 112 + trr() * 8]); tspots.push([x, -150 - trr() * 8]); }
    for (const sx of [-1, 1]) for (let z = 110; z > -150; z -= 8 + trr() * 5) tspots.push([sx * (122 + trr() * 8), z]);
    for (const [x, z] of tspots) { const kind = tk[Math.floor(trr() * tk.length)], rot = trr() * 6.28, sc = 1.7 + trr() * 0.7; loadBlender(kind).then(src => { if (!src || venueGroup !== g) return; const t = src.clone(); t.position.set(x, 0, z); t.rotation.y = rot; t.scale.setScalar(sc); g.add(t); }); }
    const hedge = lam(0x3f6e2e, { flatShading: true });
    for (const [x, z, w, d] of [[0, 104, 250, 5], [0, -142, 250, 5], [-114, -20, 5, 250], [114, -20, 5, 250]]) add(g, box(w, 4.5, d, hedge), x, 2.25, z, false);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lam(0x6a8a48)); grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.12, -30); g.add(grass);
    shopRow(g, -56, 60, -110, -1); shopRow(g, 56, 60, -110, 1);
    // a low brick wall with planters around the patio, open at the back toward the pizzeria
    const wallMat = photoMat("red_brick_03", 10, 0.4, { fallback: 0x8a3a2a });
    for (const sx of [-1, 1]) { add(g, box(1.4, 3, 96, wallMat), sx * 28, 1.5, -10, false); add(g, box(2, 0.4, 96, lam(0xd8ccb4)), sx * 28, 3.2, -10, false); }
    for (const sx of [-1, 1]) for (let z = 30; z > -56; z -= 18) placeModel(g, "potted_plant_02", sx * 25.5, z, z, 1.4);
    // picnic tables down both sides, set across the lane, with groups of 2 to 4 sitting at most of them
    const tr = rng(17), wood = std(0x9c6a3a, { roughness: 0.8 });
    for (const sx of [-1, 1]) for (let z = 22; z > -56; z -= 12.5) {
      if (sx < 0 && z < -36 && z > -46) continue; // room for the chalkboard
      const tx = sx * 18.5, tab = new THREE.Group();
      add(tab, box(3.4, 0.25, 8, wood), 0, 2.5, 0);
      for (const bx of [-2.4, 2.4]) add(tab, box(1.1, 0.2, 8, wood), bx, 1.5, 0);
      for (const lz of [-3.2, 3.2]) { add(tab, box(5.6, 0.3, 0.3, wood), 0, 1.3, lz, false); for (const lx of [-1, 1]) { const leg = add(tab, box(0.3, 2.6, 0.3, wood), lx * 1.2, 1.25, lz); leg.rotation.z = lx * 0.35; } }
      tab.position.set(tx, 0, z); tab.rotation.y = Math.PI / 2; g.add(tab); // turned across the lane
      if (tr() < 0.4) pizzaBox(g, tx, 2.75, z + (tr() - 0.5) * 3, tr() * 3);
      if (tr() < 0.35) beachUmbrella(g, tx, z, tr() < 0.5 ? ["#1f7a3a", "#ffffff"] : ["#c8202a", "#ffffff"], 0, tr() * 6);
      if (tr() < 0.15) continue; // the odd empty table
      const n = 2 + Math.floor(tr() * 3); // a group of 2 to 4
      for (let k = 0; k < n; k++) {
        const side = k % 2 ? 1 : -1, px = tx + (k < 2 ? -1.8 : 1.8) + (tr() - 0.5) * 0.6;
        // on the bench, knees under the table, facing across it
        person(g, px, z + side * 2.75, side > 0 ? Math.PI : 0, 300 + Math.round(z * 7) + k * 13 + sx, "sit");
      }
    }
    for (const [x, z] of [[-23, 16], [23, 3], [-23, -22], [23, -34], [-12, -60], [12, -60]]) patioHeater(g, x, z); // between the tables
    chalkboard(g, -10, -40, 0.5);
    crowd(g, -9, -62, 5, 3, 211, 0, -27); crowd(g, 9, -62, 5, 3, 213, 0, -27); // watching from by the door
    for (const [x, z, r] of [[-24, 30, 0.4], [24, 30, -0.4], [-24, -66, 2.6], [24, -66, -2.6]]) placeModel(g, "street_lamp_01", x, z, r, 1);
    // string lights criss-crossing the patio
    const poles = [[-24, -50], [24, -50], [-24, -26], [24, -26], [-24, -2], [24, -2], [-24, 22], [24, 22]];
    stringLights(g, poles, [[[-24, -50], [24, -26]], [[24, -50], [-24, -26]], [[-24, -26], [24, -2]], [[24, -26], [-24, -2]], [[-24, -2], [24, 22]], [[24, -2], [-24, 22]], [[-24, -50], [24, -50]], [[-24, 22], [24, 22]]], 13, 2, 0.06);
    loadSky("kloofendal_48d_partly_cloudy_puresky_2k.hdr").then(sky => {
      if (!sky || venueId !== "brewery") return;
      scene.environment = sky.env; scene.background = sky.bg; skyMesh.visible = false;
      hemi.intensity = 0.85; renderer.toneMappingExposure = 1.05;
      scene.fog.color.setHex(0xd2e2f0); scene.fog.near = 200; scene.fog.far = 700;
    });
  } else if (id === "lodge") {
    // The top of the ski slope outside Summit Lodge: a deck beside the lane, skiers heading down the slope to the
    // left, a chairlift bringing people up, ski racks, and light snow the whole time.
    // the snowfield: flat around the court and the lodge, falling away down the slope to the left
    const stex = groundTexture("snow"); stex.repeat.set(760 / 12, 700 / 12);
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(760, 700, 80, 1), new THREE.MeshStandardMaterial({ map: stex, roughness: 1 }));
    slope.rotation.x = -Math.PI / 2;
    const sp = slope.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i) - 80; sp.setX(i, x); sp.setZ(i, slopeY(x)); }
    slope.geometry.computeVertexNormals(); slope.position.set(0, -0.05, -100); slope.receiveShadow = true; g.add(slope);
    mountains(g, 8, true);
    lodgeBuilding(g, 6, -100);
    // the deck beside the lane, with tables, a railing and a ski rack
    const deck = photoMat("weathered_brown_planks", 4, 10, { fallback: 0x8a6a4a, tint: 0xd8c4a8 });
    add(g, box(22, 0.8, 70, deck), 25, 0.4, -24, false);
    for (const [x, z, w, d] of [[14.2, -24, 0.3, 70], [25, 11, 22, 0.3]]) add(g, box(w, 3, d, lam(0x5a3a22)), x, 2.4, z, false);
    let seed = 71;
    for (const z of [2, -12, -26, -40, -54]) deckTable(g, 26 + (seed % 2 ? 2 : -1), z, seed++);
    patioHeater(g, 33, -5); patioHeater(g, 33, -33);
    skiRack(g, 10, -64, 0.15, 3); skiRack(g, -16, -70, -0.2, 5);
    // people standing around, some holding their skis upright
    const pr = rng(77);
    for (const [x, z] of [[-14, -58], [-10, -62], [8, -70], [12, -58], [-20, -30], [-22, -12], [-18, 6], [-24, -44]]) {
      const face = Math.atan2(-x, -15 - z) + (pr() - 0.5) * 0.6;
      person(g, x, z, face, 700 + Math.round(x * 3 - z), pr() < 0.2 ? "cheer" : "stand");
      if (pr() < 0.6) heldSkis(g, x + Math.cos(face) * 0.9, z - Math.sin(face) * 0.9, face, SKI_COLS[Math.floor(pr() * SKI_COLS.length)]);
    }
    for (const [x, z] of [[-30, -20], [-31, 4], [-29, -52]]) { const p = person(g, x, z, -Math.PI / 2 + (pr() - 0.5) * 0.5, 800 + Math.round(z), "stand"); wearSkis(p, SKI_COLS[Math.floor(pr() * SKI_COLS.length)]); } // ready to go
    skiers(g, 9, 13);
    chairLift(g);
    // snowy pines down the slope and around the back
    const r = rng(17);
    for (let k = 0; k < 90; k++) {
      const a = r(), x = k < 45 ? -60 - r() * 200 : (r() - 0.5) * 300, z = k < 45 ? (r() < 0.5 ? 40 + r() * 60 : -180 - r() * 120) : -140 - r() * 120;
      if (k >= 45 && Math.abs(x) < 70 && z > -150) continue;
      pine(g, x, z, 1.1 + r() * 0.9, true); g.children[g.children.length - 1].position.y = slopeY(x);
    }
    for (let k = 0; k < 16; k++) pine(g, 40 + r() * 60, 30 - r() * 160, 1 + r() * 0.8, true);
    snowman(g, -9, 12, Math.PI + 0.4);
    snowfall(g, 1300);
  } else if (id === "bonfire") { // (the id is kept from the old court so saves carry over): the Golf Club
    // The 18th at Oak Hollow Club late in the afternoon: the clubhouse and its patio, the putting green beside the lane,
    // bunkers, a pond with a fountain, carts parked by the clubhouse, and fairways lined with trees.
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), photoMat("sparse_grass", 900 / 9, 900 / 9, { tint: 0xa8f070, bump: 0.6, fallback: 0x5fae3e }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.z = -60; lawn.receiveShadow = true; g.add(lawn);
    clubhouse(g, 0, -110);
    puttingGreen(g, 30, -40, 14);
    bunker(g, 46, -22, 8, 4, 0.4); bunker(g, -34, -64, 10, 5, -0.3); bunker(g, -90, -160, 14, 6, 0.2);
    pond(g, -58, -20, 22, 14);
    for (let k = 0; k < 6; k++) golfCart(g, -66 + k * 6.5, -92, 0.05); // parked beside the clubhouse
    // the patio in front of the clubhouse: tables under umbrellas, people sitting and watching
    const deck = photoMat("weathered_brown_planks", 6, 3, { fallback: 0x9a7a5a, tint: 0xe8d8c0 });
    add(g, box(60, 0.6, 18, deck), 20, 0.3, -78, false);
    let seed = 91;
    for (const x of [0, 13, 26, 39]) { deckTable(g, x, -78, seed++); beachUmbrella(g, x, -78, seed % 2 ? ["#1f4a2e", "#ffffff"] : ["#e8d39a", "#ffffff"], 0, seed); }
    // golfers: a few on the putting green, some by the carts, some watching the game
    const pr = rng(19);
    for (const [x, z, f] of [[26, -36, 2.6], [36, -44, -2.2], [22, -48, 0.6]]) putter(person(g, x, z, f, 900 + Math.round(x + z), "stand"));
    for (const [x, z] of [[-26, -72], [-12, -73], [-20, -84], [14, -14], [16, 6], [-16, -6], [-18, 14]]) person(g, x, z, Math.atan2(-x, -15 - z) + (pr() - 0.5) * 0.5, 950 + Math.round(x * 3 + z), pr() < 0.2 ? "cheer" : "stand");
    // trees down both sides and behind the clubhouse
    const tk = ["tree_oak", "tree_maple", "tree_oak", "tree_pine"], spots = [];
    for (let z = 40; z > -320; z -= 14 + pr() * 8) { spots.push([-110 - pr() * 30, z]); spots.push([70 + pr() * 30, z]); }
    for (let x = -100; x <= 100; x += 16 + pr() * 10) spots.push([x, -160 - pr() * 20]);
    for (const [x, z] of spots) { const kind = tk[Math.floor(pr() * tk.length)], rot = pr() * 6.28, sc = 1.4 + pr() * 0.8; loadBlender(kind).then(src => { if (!src || venueGroup !== g) return; const t = src.clone(); t.position.set(x, 0, z); t.rotation.y = rot; t.scale.setScalar(sc); g.add(t); }); }
    // the rest of the course, all the way round: fairways, more greens and flags, groups out playing, trees everywhere
    const fairway = lam(0x74cc56);
    for (const [x, z, w, d, rz] of [[-200, -40, 60, 360, 0.2], [190, -60, 60, 360, -0.15], [0, 200, 320, 60, 0.05], [-60, -300, 300, 60, -0.1], [200, 180, 60, 220, 0.3]]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fairway); f.rotation.x = -Math.PI / 2; f.rotation.z = rz; f.position.set(x, 0.03, z); g.add(f);
    }
    for (const [x, z, r] of [[-210, -180, 12], [200, -200, 11], [-90, 210, 12], [120, 210, 10], [-230, 120, 11], [240, 60, 12]]) puttingGreen(g, x, z, r);
    for (const [x, z, s2] of [[-200, -150, 3], [-190, 60, 5], [190, -170, 7], [210, 20, 9], [-60, 190, 11], [90, 180, 13], [-230, 150, 15], [250, 100, 17]]) golfGroup(g, x, z, (s2 % 4) * 1.4, s2);
    bunker(g, -180, -120, 10, 5, 0.3); bunker(g, 170, -150, 9, 4, -0.4); bunker(g, -40, 180, 12, 5, 0.1); bunker(g, 230, 90, 8, 4, 0.6);
    // scattered evergreen and leafy trees in every direction, then a fuller ring further out so the view always ends in green
    const keepClear = (x, z) => (Math.abs(x) < 70 && z > -140 && z < 70) || (Math.abs(x) < 64 && z < -60 && z > -140);
    treeRing(g, 61, 90, 260, 120, ["tree_oak", "tree_maple", "pine", "tree_oak", "pine"], keepClear);
    treeRing(g, 67, 300, 380, 90, ["tree_oak", "tree_maple", "pine", "pine"]);
    loadSky("kloofendal_48d_partly_cloudy_puresky_2k.hdr").then(sky => {
      if (!sky || venueId !== "bonfire") return;
      scene.environment = sky.env; scene.background = sky.bg; skyMesh.visible = false;
      hemi.intensity = 0.85; renderer.toneMappingExposure = 1.08;
      scene.fog.color.setHex(0xd8e6f0); scene.fog.near = 250; scene.fog.far = 800;
    });
  } else if (id === "island") {
    // Throwing from one little island to the next, a big island's beach across the water, smaller islands all round,
    // and spectators everywhere on the water: canoes, kayaks, paddle boards, rowboats, motorboats, rafts and waders.
    const n1 = waveNormalTex(5), n2 = waveNormalTex(9); n1.repeat.set(120, 120); n2.repeat.set(47, 47);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.MeshPhysicalMaterial({ color: 0x1fa0c0, roughness: 0.1, normalMap: n1, normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 1, clearcoatRoughness: 0.05, clearcoatNormalMap: n2, clearcoatNormalScale: new THREE.Vector2(0.2, 0.2) }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.1, -15); water.receiveShadow = true; g.add(water);
    venueAnim.push({ kind: "sea", n1, n2 });
    const sandTex = groundTexture("sand"); sandTex.repeat.set(2, 2);
    islandShape(g, 0, 4, 10.5, 11, sandTex); islandShape(g, 0, -30, 9.5, 23, sandTex); // yours, and the board's island across the water
    blenderPalm(g, -7.5, 0, 7, 1, 0.95); blenderPalm(g, 7, 0, 9, 2, 0.85); blenderPalm(g, -6, 0, -35, 3, 1); blenderPalm(g, 6.5, 0, -34, 4, 0.9);
    umbrella(g, 7, 0, 0xff4b3a); chair(g, 5.5, -25, -0.5, 0xffc93a);
    // spectators on the water, all keeping clear of the throwing lane
    const spots = [["canoe", -22, -6, 0.3], ["kayak", 20, -10, -0.4], ["paddle", -18, -40, 0.9], ["row", 24, -36, -0.6], ["motor", -32, -24, 1.4], ["raft", 15, 6, 0], ["raft", -14, 12, 0], ["kayak", 30, 14, 2.2],
      ["canoe", 34, -52, -1.0], ["paddle", -30, -58, 0.4], ["motor", 40, -18, -1.6], ["raft", 17, -22, 0], ["row", -40, 6, 2.6], ["kayak", -26, -76, 1.2], ["raft", -12, -48, 0]];
    spots.forEach(([k, x, z, rot], i) => craft(g, k, x, z, rot, 1000 + i * 7));
    // people wading in the shallows by both islands
    const wr = rng(71);
    for (const [x, z] of [[-11, -4], [12, -2], [-10, -22], [11, -38], [-9, 16], [10, -44]]) { person(g, x, z, Math.atan2(-x, -13 - z), 1100 + Math.round(x * 5 + z), wr() < 0.3 ? "cheer" : "stand"); venueAnim[venueAnim.length - 1].y0 = -2.2; }
    // the big island's shoreline across the water, smaller islands round the other sides, and boats crossing
    bigIsland(g, -270);
    const r = rng(29);
    for (let k = 0; k < 16; k++) {
      const a = r() * Math.PI * 2, d = 170 + r() * 280, fx = Math.sin(a) * d, fz = -15 + Math.cos(a) * d; if (fz < -150) continue;
      const w = 50 + r() * 90, hf = islandHill(g, fx, fz, w, w * (0.6 + r() * 0.4), 10 + r() * 22, 40 + k);
      for (let p = 0; p < 4; p++) { const px = fx + (r() - 0.5) * w * 0.5, pz = fz + (r() - 0.5) * w * 0.3, y = hf(px, pz); if (y > 1) blenderPalm(g, px, y - 0.5, pz, 700 + k * 9 + p, 1.2); }
    }
    cruisers(g, 5, 7);
    loadSky("kloofendal_48d_partly_cloudy_puresky_2k.hdr").then(sky => {
      if (!sky || venueId !== "island") return;
      scene.environment = sky.env; // the photo sky only for reflections: the game's own deep-blue sky stays behind
      hemi.intensity = 0.9; renderer.toneMappingExposure = 1.05;
      scene.fog.color.setHex(0xd6e6f2); scene.fog.near = 300; scene.fog.far = 1300;
    });
  } else if (id === "rooftop") {
    // A floodlit court on a city roof at night: four light towers keep the court bright, a lounge bar and sofas along
    // the side, and a varied skyline (glass towers, setbacks, spires, brick low-rises) with a ring of far city lights.
    const deckTex = groundTexture("roof"); deckTex.repeat.set(70 / 14, 90 / 14);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(70, 90), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.9, color: 0xe8e8ec }));
    deck.rotation.x = -Math.PI / 2; deck.position.z = -14; deck.receiveShadow = true; g.add(deck);
    const ledge = std(0x5a5c64), glassRail = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.25, roughness: 0.05 });
    for (const [x, z, w, d] of [[0, -59, 70, 1.2], [0, 31, 70, 1.2], [-35, -14, 1.2, 90], [35, -14, 1.2, 90]]) { add(g, box(w, 2, d, ledge), x, 1, z); add(g, box(w, 3, d * 0.3 + (d > 1.2 ? 0 : 0), glassRail), x, 3.5, z, false); }
    const below = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: 0x0b1020 })); below.rotation.x = -Math.PI / 2; below.position.set(0, -20, -15); g.add(below);
    citySkyline(g, 41);
    for (const [x, z] of [[-26, -50], [26, -50], [-26, 18], [26, 18]]) roofFlood(g, x, z, 0, -14);
    stringLights(g, [[-12, -44], [12, -44], [-12, -4], [12, -4]], [[[-12, -44], [12, -44]], [[-12, -44], [-12, -4]], [[12, -44], [12, -4]], [[-12, -4], [12, -4]]], 10, 2, 0.5);
    skyBar(g, -27, -2, Math.PI / 2);
    djBooth(g, 22, -44, -Math.PI / 2 + 0.4);
    dancers(g, 22, -30, 12, 5, 61);
    for (const [x, z, k] of [[-22, -40, 1], [-24, -28, 2], [-18, 14, 3], [-8, 22, 4], [10, 22, 5], [24, 10, 6], [-26, -52, 7], [14, -54, 8]]) bistroTable(g, x, z, 300 + k);
    partyLights(g, 6, 5); // over the dance floor
    sofa(g, 28, -8, -Math.PI / 2, 0x2f4a8a); sofa(g, 28, 4, -Math.PI / 2, 0x8a2f4a);
    for (const [x, z] of [[-30, -52], [30, -52], [-30, 24], [30, 24], [30, -42], [-30, 6]]) { add(g, box(4, 3, 4, std(0x4a4f58)), x, 1.5, z); pine(g, x, z, 0.45, false); g.children[g.children.length - 1].position.y = 3; }
    waterTower(g, -22, -54); acUnit(g, 18, -54);
    crowd(g, -22, -2, 5, 3, 51, -27, -2); crowd(g, -16, 8, 3, 2, 55, 0, -14);
    for (const [x, z, f] of [[26, -8, -Math.PI / 2], [26, 4, -Math.PI / 2]]) person(g, x, z, f, 60 + x + z, "sit");
  } else if (id === "lakeside") {
    // The court is a long wooden dock running out into the lake; the shore (and the cabin) is behind you.
    const wt = waterTexture("#2a6a8a", "#4a9ab8"); wt.repeat.set(90, 90);
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.2, metalness: 0.15 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(0, -1.4, -15); lake.receiveShadow = true; g.add(lake); venueAnim.push({ kind: "water", o: wt });
    const shoreTex = groundTexture("grass"); shoreTex.repeat.set(900 / 6, 260 / 6);
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), new THREE.MeshStandardMaterial({ map: shoreTex, roughness: 1 }));
    shore.rotation.x = -Math.PI / 2; shore.position.set(0, 0, 18 + 130); shore.receiveShadow = true; g.add(shore);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(900, 6), lam(0xc8b88a)); sand.rotation.x = -Math.PI / 2; sand.position.set(0, -0.6, 15); g.add(sand);
    const planks = canvasTex(256, 512, (c, w, h) => {
      const r = rng(9), bw = w / 8;
      for (let k = 0; k < 8; k++) { c.fillStyle = `hsl(${26 + r() * 8},${38 + r() * 10}%,${42 + r() * 10}%)`; c.fillRect(k * bw, 0, bw, h); }
      c.strokeStyle = "rgba(40,24,12,.55)"; c.lineWidth = 3; for (let k = 0; k <= 8; k++) { c.beginPath(); c.moveTo(k * bw, 0); c.lineTo(k * bw, h); c.stroke(); }
      for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(60,36,18,${r() * 0.18})`; c.fillRect(r() * w, r() * h, 1, 6 + r() * 14); }
      for (let k = 0; k < 8; k++) { const y = r() * h; c.fillStyle = "rgba(30,18,8,.6)"; c.fillRect(k * bw + 3, y, bw - 6, 3); }
    }, [1, 1]);
    planks.repeat.set(2, 64 / 16);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(16, 64), new THREE.MeshStandardMaterial({ map: planks, roughness: 0.9 }));
    deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0, -15); deck.receiveShadow = true; g.add(deck);
    const wood = std(0x6a4a2a);
    add(g, box(16.6, 1.2, 64, wood), 0, -0.62, -15); // the deck's edge, down toward the water
    for (const sx of [-8.2, 8.2]) { add(g, box(0.5, 0.35, 64, std(0x5a3a1e)), sx, 0.17, -15); for (let z = 16; z >= -46; z -= 6.2) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 4.5, 8), wood), sx, -1.6, z); }
    add(g, box(16.6, 0.35, 0.5, std(0x5a3a1e)), 0, 0.17, -47);
    rowboat(g, 16, -30, 0.5); rowboat(g, -20, -60, -0.3);
    const r = rng(23);
    for (let k = 0; k < 60; k++) { const x = (r() - 0.5) * 220, z = 26 + r() * 90; if (Math.abs(x) < 10 && z < 40) continue; pine(g, x, z, 0.9 + r() * 0.6, false); }
    for (let k = 0; k < 40; k++) { const a = r() * Math.PI - Math.PI / 2, d = 230 + r() * 40; pine(g, Math.sin(a) * d, -15 - Math.cos(a) * d, 2 + r(), false); } // the far shore
    mountains(g, 31, false, 0x5a7a6a);
    cabin(g, -22, 40, Math.PI + 0.4); picnicTable(g, 16, 28, 0.2);
    for (const [x, z] of [[-6, -36], [6, -37]]) chair(g, x, z, x < 0 ? 0.35 : -0.35, x < 0 ? 0x2fbf71 : 0xff8a1f);
  } else if (id === "canyon") {
    setGround(g, "desert", 12);
    mesas(g, 13);
    const r = rng(7);
    for (let k = 0; k < 26; k++) { const a = r() * Math.PI * 2, d = 30 + r() * 70; cactus(g, Math.sin(a) * d, -15 + Math.cos(a) * d, 0.7 + r() * 0.6); }
    umbrella(g, -9, -34, 0xffc93a); chair(g, 8, -37, -0.35, 0xe8392b);
    truck(g, -18, 16, 0.4, 0xd9a05a);
  } else if (id === "carnival") {
    setGround(g, "dirt", 8);
    ferrisWheel(g, -40, -80);
    stripedTent(g, 28, -50, 8, ["#e8392b", "#ffffff"]); stripedTent(g, -30, -30, 6, ["#2f86ff", "#ffffff"]); stripedTent(g, 32, 10, 7, ["#ffc93a", "#e8392b"]); stripedTent(g, -28, 22, 6, ["#2fbf71", "#ffffff"]);
    const poles = [[-12, -44], [12, -44], [-12, -14], [12, -14], [-12, 16], [12, 16]];
    stringLights(g, poles, [[[-12, -44], [12, -44]], [[-12, -44], [-12, -14]], [[12, -44], [12, -14]], [[-12, -14], [12, -14]], [[-12, -14], [-12, 16]], [[12, -14], [12, 16]], [[-12, 16], [12, 16]], [[-12, -44], [12, -14]], [[12, -44], [-12, -14]]], 11, 2, 0.85);
    for (const [x, z] of [[-6, -27], [6, -27], [0, 6]]) { const pl = new THREE.PointLight(0xffc27a, 26, 26, 1.6); pl.position.set(x, 9, z); g.add(pl); } chair(g, -8, -36, 0.35, 0xa24bff);
  } else if (id === "stadium") {
    // A tight arena: a long rectangle of grass for the court, the crowd right on top of it on all four sides.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -30; floor.receiveShadow = true; g.add(floor);
    const turf = groundTexture("turf"); turf.repeat.set(26 / 6, 72 / 6);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(26, 72), new THREE.MeshStandardMaterial({ map: turf, roughness: 1 }));
    field.rotation.x = -Math.PI / 2; field.position.set(0, 0.01, -14); field.receiveShadow = true; g.add(field);
    stands(g, -52, 34, 12); stands(g, -14, 76, 10, Math.PI / 2, -16); stands(g, -14, 76, 10, -Math.PI / 2, 16); stands(g, 24, 34, 10, Math.PI);
    const pad = std(0x1f3a6e);
    add(g, box(30, 3, 0.6, pad), 0, 1.5, -50); add(g, box(30, 3, 0.6, pad), 0, 1.5, 22);
    add(g, box(0.6, 3, 72, pad), -14.5, 1.5, -14); add(g, box(0.6, 3, 72, pad), 14.5, 1.5, -14);
    for (const [x, z] of [[-40, -80], [40, -80], [-40, 45], [40, 45]]) floodlight(g, x, z);
    jumbotron(g);
    const pl = new THREE.PointLight(0xffffff, 40, 40, 1.4); pl.position.set(0, 18, -24); g.add(pl);
  }
  scene.add(g); venueGroup = g;
}

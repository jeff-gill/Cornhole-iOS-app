
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
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
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
    } else if (a.kind === "wheel") {
      a.o.rotation.z += dt * 0.12; for (const c of a.cars) c.rotation.z = -a.o.rotation.z;
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
let skyPromise = null;
function loadSky(file) {
  // The HDR file is stored base64 in a .json (web hosts serve that); decode it back to bytes for the loader.
  const hdrUrl = fetch(`${ASSETS}${file}.json`).then(r => r.json()).then(j => {
    const bin = atob(j.b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes]));
  });
  return (skyPromise ||= hdrUrl.then(url => new RGBELoader().loadAsync(url)).then(t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer), env = pm.fromEquirectangular(t).texture; pm.dispose();
    return { bg: t, env };
  }).catch(() => null));
}
function clearPhotoSky() { scene.environment = null; scene.background = null; skyMesh.visible = true; }
function plankFence(g) {
  const post = std(0x4a3420, { roughness: 0.9 });
  const wall = (len, x, z, rot) => {
    const m = photoMat("weathered_brown_planks", 1, len / 5, { rotate: Math.PI / 2, fallback: 0x8a6a4a }); // boards run up and down
    const w = new THREE.Mesh(new THREE.BoxGeometry(len, 5.4, 0.3), m); w.position.set(x, 2.7, z); w.rotation.y = rot; w.castShadow = w.receiveShadow = true; g.add(w);
    for (let k = 0; k <= len; k += 8) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 6, 0.45), post); p.position.set(x + Math.cos(rot) * (k - len / 2), 3, z - Math.sin(rot) * (k - len / 2)); p.castShadow = true; g.add(p); }
  };
  wall(52, 0, -46, 0); wall(56, -26, -18, Math.PI / 2); wall(56, 26, -18, Math.PI / 2);
}

const VENUE_LOOK = {
  backyard: { top: [0.19, 0.44, 0.80], mid: [0.56, 0.78, 0.95], horizon: [1.0, 0.83, 0.62], sunGlow: 1, night: 0, fog: [0xf2cfa0, 90, 260],
    hemi: [0xd6ecff, 0x557a2c, 1.25], sun: [0xffe3b8, 2.9, [-26, 20, -18]], exposure: 1.08, dust: 0xf1dcb0 },
  tailgate: { top: [0.20, 0.30, 0.62], mid: [0.75, 0.55, 0.62], horizon: [1.0, 0.62, 0.38], sunGlow: 1.3, night: 0, fog: [0xe8a878, 80, 240],
    hemi: [0xffd9c0, 0x4d4a48, 1.1], sun: [0xffb070, 3.0, [-30, 14, -10]], exposure: 1.05, dust: 0xbfbcb4 },
  beach: { top: [0.10, 0.48, 0.88], mid: [0.45, 0.78, 0.98], horizon: [0.88, 0.95, 1.0], sunGlow: 0.8, night: 0, fog: [0xcfeaff, 120, 400],
    hemi: [0xe6f6ff, 0xd8c08a, 1.35], sun: [0xfff4dc, 3.3, [-14, 34, -6]], exposure: 1.0, dust: 0xf0dca8 },
  brewery: { top: [0.02, 0.03, 0.10], mid: [0.06, 0.08, 0.22], horizon: [0.25, 0.18, 0.30], sunGlow: 0, night: 1, fog: [0x1a1530, 60, 200],
    hemi: [0x5466a8, 0x2a1a12, 0.45], sun: [0xffcf8a, 1.5, [-8, 30, -16]], exposure: 1.0, dust: 0xc8a888 },
  lodge: { top: [0.42, 0.52, 0.66], mid: [0.70, 0.77, 0.86], horizon: [0.88, 0.91, 0.95], sunGlow: 0.25, night: 0, fog: [0xdfe6ef, 70, 330],
    hemi: [0xeef4ff, 0xb8c8dc, 1.4], sun: [0xf4f6ff, 2.2, [-18, 30, -10]], exposure: 1.0, dust: 0xffffff },
  bonfire: { top: [0.16, 0.10, 0.34], mid: [0.62, 0.30, 0.42], horizon: [1.0, 0.55, 0.25], sunGlow: 1.8, night: 0.6, fog: [0x8a4a5a, 90, 360],
    hemi: [0xffb8a0, 0x6a4a3a, 0.75], sun: [0xff9a50, 2.4, [0, 7, -110]], exposure: 1.05, dust: 0xe0c890 },
  island: { top: [0.08, 0.42, 0.86], mid: [0.40, 0.74, 0.97], horizon: [0.85, 0.95, 1.0], sunGlow: 0.9, night: 0, fog: [0xc8ecff, 140, 460],
    hemi: [0xe6f6ff, 0x3aa8c8, 1.35], sun: [0xfff2d6, 3.3, [16, 34, -4]], exposure: 1.0, dust: 0xe8f8ff },
  rooftop: { top: [0.06, 0.06, 0.20], mid: [0.30, 0.20, 0.42], horizon: [0.95, 0.50, 0.35], sunGlow: 0.6, night: 0.6, fog: [0x3a2a4a, 120, 380],
    hemi: [0x8a8ac8, 0x3a3a40, 0.8], sun: [0xffb070, 2.0, [-30, 12, -40]], exposure: 1.05, dust: 0xb8b8c0 },
  lakeside: { top: [0.30, 0.50, 0.78], mid: [0.62, 0.76, 0.90], horizon: [0.95, 0.88, 0.78], sunGlow: 0.9, night: 0, fog: [0xd8e2ea, 70, 340],
    hemi: [0xe0eeff, 0x4a6a3a, 1.25], sun: [0xffe6c0, 2.7, [-20, 18, -30]], exposure: 1.05, dust: 0xd8e6d0 },
  canyon: { top: [0.18, 0.40, 0.75], mid: [0.55, 0.68, 0.85], horizon: [1.0, 0.78, 0.55], sunGlow: 1.2, night: 0, fog: [0xf0c898, 120, 420],
    hemi: [0xfff0d8, 0x9a5a30, 1.2], sun: [0xfff0d0, 3.4, [-10, 40, -8]], exposure: 1.02, dust: 0xe0a870 },
  carnival: { top: [0.02, 0.02, 0.09], mid: [0.08, 0.06, 0.22], horizon: [0.40, 0.20, 0.38], sunGlow: 0, night: 1, fog: [0x1a1030, 90, 300],
    hemi: [0x7a6ac8, 0x2a2a18, 0.6], sun: [0xffd8a0, 1.6, [-8, 30, -16]], exposure: 1.05, dust: 0xb89a70 },
  stadium: { top: [0.01, 0.02, 0.07], mid: [0.04, 0.07, 0.18], horizon: [0.18, 0.22, 0.38], sunGlow: 0, night: 1, fog: [0x10162a, 140, 420],
    hemi: [0xbfd4ff, 0x1d3a1f, 0.8], sun: [0xf2f6ff, 3.4, [10, 40, -8]], exposure: 1.1, dust: 0xd8e8d0, wall: [12, 32] },
};
function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); const m = n.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); }); }
function buildVenue(id) {
  if (id === venueId) return;
  if (venueGroup) { scene.remove(venueGroup); disposeTree(venueGroup); }
  venueId = id; glowSprites = []; venueAnim = []; clearPhotoSky();
  const g = new THREE.Group(), L = VENUE_LOOK[id];
  skyU.top.value.set(...L.top); skyU.mid.value.set(...L.mid); skyU.horizon.value.set(...L.horizon); skyU.sunGlow.value = L.sunGlow; skyU.night.value = L.night;
  scene.fog.color.setHex(L.fog[0]); scene.fog.near = L.fog[1]; scene.fog.far = L.fog[2];
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1]; sun.position.set(...L.sun[2]);
  skyU.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();
  renderer.toneMappingExposure = L.exposure; venueDust = L.dust;

  if (id === "backyard") {
    // Photo-real backyard: real sky light, a photo lawn and plank fence, and scanned chairs, table and shrubs.
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), photoMat("sparse_grass", 520 / 9, 520 / 9, { tint: 0xb4ff6a, bump: 0.8, fallback: 0x5fae3e }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.z = -30; lawn.receiveShadow = true; g.add(lawn);
    blenderTrees(g, 21, ["tree_oak", "tree_maple", "tree_oak", "tree_pine"], { front: 62 });
    house(g, 4, 40, Math.PI, 0xf2e6d0, 0x4a5a6a); // the house behind you
    plankFence(g);
    stringLights(g, [[-9, -38], [9, -38], [-9, -14], [9, -14]], [[[-9, -38], [9, -38]], [[-9, -38], [-9, -14]], [[9, -38], [9, -14]], [[-9, -14], [9, -26]], [[9, -14], [-9, -26]]]);
    cooler(g, 5, -22, 0.4);
    placeModel(g, "plastic_monobloc_chair_01", -7.5, -36, 0.35); // set back from the board, facing the players
    placeModel(g, "plastic_monobloc_chair_01", 7.8, -37, -0.35);
    placeModel(g, "wooden_picnic_table", -15, 14, 0.3 + Math.PI / 2);
    const r = rng(77);
    for (let x = -22; x <= 22; x += 5.5 + r() * 2) placeModel(g, r() < 0.5 ? "shrub_02" : "shrub_04", x, -43.5 - r(), r() * 6, 0.9 + r() * 0.5);
    for (let z = -38; z <= 4; z += 7 + r() * 3) for (const sx of [-1, 1]) placeModel(g, r() < 0.5 ? "shrub_02" : "shrub_04", sx * (23.5 - r()), z, r() * 6, 0.8 + r() * 0.5);
    placeModel(g, "planter_box_01", -9, 34, 0); placeModel(g, "planter_box_01", 17, 34, 0);
    loadSky("garden_nook_2k.hdr").then(sky => {
      if (!sky || venueId !== "backyard") return;
      scene.environment = sky.env; scene.background = sky.bg; skyMesh.visible = false;
      hemi.intensity = 0.95; renderer.toneMappingExposure = 1.4; scene.fog.near = 140; scene.fog.far = 420;
    });
  } else if (id === "tailgate") {
    setGround(g, "asphalt", 18);
    trees(g, 5, [0x3c7a3a, 0x4c8a3a], { back: -150, sides: false });
    truck(g, -16, -24, 0.15, 0xc8102e); truck(g, 17, -30, -0.2, 0x2f6fd9); truck(g, -18, -52, 0.1, 0xf2f2f2); truck(g, 16, -2, -0.1, 0x222222); truck(g, -17, 20, -0.1, 0xffc93a); truck(g, 15, 26, 0.15, 0x2fbf71);
    tent(g, 0, 34, 0xd62828);
    tent(g, -9, -48, 0xff8a1f); tent(g, 10, -50, 0x2f86ff);
    cooler(g, 5, -22, -0.3, 0x2f86ff); chair(g, -7, -38, 0.3, 0xffc93a); chair(g, 7.5, -39, -0.3, 0x2fbf71);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(70, 80, 40, 40, 1, true), lam(0x9a8f88, { side: THREE.DoubleSide }));
    ring.position.set(0, 20, -260); g.add(ring);
  } else if (id === "beach") {
    setGround(g, "sand", 10);
    ocean(g);
    for (const [x, z, h, l] of [[-14, -40, 22, 1], [13, -44, 26, -1], [-20, -10, 20, 0.6], [19, -14, 24, -0.8], [-6, -70, 28, 0.5], [24, -66, 22, -1]]) palm(g, x, z, h, l);
    umbrella(g, -8, -34, 0xff4b3a); umbrella(g, 9, -36, 0x2f86ff); umbrella(g, 15, -22, 0xffc93a);
    const hut = new THREE.Group();
    add(hut, box(10, 4, 4, std(0x9b7a52)), 0, 2, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(9, 4, 4, 1), lam(0xd9b56a, { flatShading: true })); roof.rotation.y = Math.PI / 4; add(hut, roof, 0, 8.5, 0);
    for (const x of [-4.5, 4.5]) add(hut, new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 6), lam(0x7a5232)), x, 3.5, 1.5);
    hut.position.set(-18, 0, -28); hut.rotation.y = 0.7; g.add(hut);
    cooler(g, 5, -22, 0.5, 0x00b8c8);
    for (const [x, z, h, l] of [[-16, 22, 24, 0.8], [14, 28, 22, -0.7], [-4, 40, 26, 0.4], [26, 14, 20, -1]]) palm(g, x, z, h, l);
    umbrella(g, -10, 12, 0x2fbf71); umbrella(g, 12, 16, 0xff8a1f); chair(g, -12, 8, Math.PI + 0.3, 0xffc93a);
  } else if (id === "brewery") {
    setGround(g, "brick", 8);
    const bricks = wallTexture("brick"); bricks.repeat.set(4, 1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), new THREE.MeshLambertMaterial({ map: bricks })); wall.position.set(0, 8, -48); g.add(wall);
    for (const x of [-24, 24]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), new THREE.MeshLambertMaterial({ map: bricks })); sw.position.set(x, 8, -18); sw.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(sw); }
    const signTex = canvasTex(512, 128, (c, w, h) => { c.fillStyle = "#1a0f08"; c.fillRect(0, 0, w, h); c.fillStyle = "#ffb347"; c.font = "bold 58px Georgia, serif"; c.textAlign = "center"; c.fillText("PIZZERIA", w / 2, h / 2 + 20); });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set(0, 12, -47.8); g.add(sign);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(70, 16), new THREE.MeshLambertMaterial({ map: bricks })); front.position.set(0, 8, 32); front.rotation.y = Math.PI; g.add(front); // the brewhouse behind you
    for (const wx of [-16, 16]) add(g, box(7, 4, 0.2, new THREE.MeshBasicMaterial({ color: 0xffc27a })), wx, 6, 31.8, false);
    add(g, box(5, 8, 0.2, std(0x3a2414)), 0, 4, 31.8, false);
    for (const x of [-24, 24]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), new THREE.MeshLambertMaterial({ map: bricks })); sw.position.set(x, 8, 21); sw.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(sw); }
    const poles = [[-10, -40], [10, -40], [-10, -24], [10, -24], [-10, -8], [10, -8]];
    stringLights(g, poles, [[[-10, -40], [10, -40]], [[-10, -24], [10, -24]], [[-10, -8], [10, -8]], [[-10, -40], [-10, -8]], [[10, -40], [10, -8]], [[-10, -40], [10, -24]], [[10, -40], [-10, -24]], [[-10, -24], [10, -8]], [[10, -24], [-10, -8]]], 11.5, 2, 0.8);
    barrel(g, -7, -38); barrel(g, -9.5, -36); barrel(g, 8, -40);
    picnicTable(g, 12, -26, 0.1); picnicTable(g, -13, -20, -0.1);
    for (const [x, z] of [[-6, -27], [6, -27]]) { const pl = new THREE.PointLight(0xffc27a, 30, 26, 1.6); pl.position.set(x, 9, z); g.add(pl); }
  } else if (id === "lodge") {
    setGround(g, "snow", 12);
    mountains(g, 8, true);
    const r = rng(17);
    for (let k = 0; k < 70; k++) { const a = r() * Math.PI * 2, d = 46 + r() * 60; pine(g, Math.sin(a) * d, -15 + Math.cos(a) * d, 0.9 + r() * 0.7, true); }
    cabin(g, -26, -62, 0.5); cabin(g, 30, 30, Math.PI + 0.6);
    snowman(g, 9, -38, -0.3); snowman(g, -11, 10, Math.PI + 0.4);
    stringLights(g, [[-9, -38], [9, -38], [-9, -14], [9, -14]], [[[-9, -38], [9, -38]], [[-9, -38], [-9, -14]], [[9, -38], [9, -14]]], 10.6, 2, 0.5);
    cooler(g, 5, -22, 0.4, 0x2f86ff); chair(g, -7.5, -36, 0.35, 0xd62828);
    snowfall(g);
  } else if (id === "bonfire") {
    setGround(g, "sand", 10);
    ocean(g);
    for (const [x, z, h, l] of [[-15, -42, 24, 1], [14, -46, 26, -1], [-30, -8, 20, 0.6], [30, -12, 24, -0.8], [-24, 30, 24, 0.7], [20, 40, 22, -0.8], [0, 52, 26, 0.4]]) palm(g, x, z, h, l);
    bonfire(g, -14, -22);
    for (const [x, z] of [[-7, -6], [7, -6], [-7, -20], [7, -20], [-7, -36], [7, -36]]) tiki(g, x, z);
    stringLights(g, [[-11, 8], [11, 8]], [[[-11, 8], [11, 8]]], 9, 2, 0.6);
    const hut = new THREE.Group();
    add(hut, box(10, 4, 4, std(0x9b7a52)), 0, 2, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(9, 4, 4, 1), lam(0xd9b56a, { flatShading: true })); roof.rotation.y = Math.PI / 4; add(hut, roof, 0, 8.5, 0);
    hut.position.set(18, 0, 16); hut.rotation.y = -0.6; g.add(hut);
    cooler(g, 5, -22, 0.5, 0xff8a1f); chair(g, 9, -30, -0.6, 0x2f86ff);
  } else if (id === "island") {
    const wt = waterTexture(); wt.repeat.set(70, 70);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(620, 64), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.25, metalness: 0.1 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.0, -15); sea.receiveShadow = true; g.add(sea);
    venueAnim.push({ kind: "water", o: wt });
    const sandTex = groundTexture("sand"); sandTex.repeat.set(2, 2);
    island(g, 0, 3, 8.5, sandTex); island(g, 0, -29.5, 7.5, sandTex);   // yours, and the board's island across the water
    palm(g, -6.5, 6, 18, 0.9); palm(g, 6, 8, 16, -0.8); palm(g, -5, -34, 20, 0.8); palm(g, 5.5, -33, 17, -0.9);
    umbrella(g, 6, 0, 0xff4b3a); cooler(g, -5, 2, 0.4, 0x00b8c8); chair(g, 5, -24.5, -0.5, 0xffc93a);
    rowboat(g, 9, -15, 0.4);
    const r = rng(29);
    for (let k = 0; k < 14; k++) { const a = r() * Math.PI * 2, d = 110 + r() * 200; farIsland(g, Math.sin(a) * d, -15 + Math.cos(a) * d, 12 + r() * 22, r); }
  } else if (id === "rooftop") {
    const deckTex = groundTexture("roof"); deckTex.repeat.set(56 / 14, 72 / 14);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(56, 72), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 1 }));
    deck.rotation.x = -Math.PI / 2; deck.position.z = -14; deck.receiveShadow = true; g.add(deck);
    skyline(g, 41);
    const ledge = std(0x5a5c64);
    add(g, box(56, 3.2, 1.2, ledge), 0, 1.6, -50); add(g, box(56, 3.2, 1.2, ledge), 0, 1.6, 22);
    add(g, box(1.2, 3.2, 72, ledge), -28, 1.6, -14); add(g, box(1.2, 3.2, 72, ledge), 28, 1.6, -14);
    // beyond the ledge the street is far below
    const below = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ color: 0x141a28 })); below.rotation.x = -Math.PI / 2; below.position.set(0, -20, -15); g.add(below);
    waterTower(g, -20, -42); acUnit(g, 18, -44); acUnit(g, 21, -38); acUnit(g, -20, 12);
    stringLights(g, [[-11, -40], [11, -40], [-11, -8], [11, -8]], [[[-11, -40], [11, -40]], [[-11, -40], [-11, -8]], [[11, -40], [11, -8]], [[-11, -8], [11, -8]]], 10, 2, 0.7);
    cooler(g, 5, -22, 0.4, 0xff2e88); chair(g, -8, -36, 0.35, 0x2f86ff); chair(g, 8, -37, -0.35, 0xffc93a);
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
    cooler(g, 5, -22, 0.4, 0x2f86ff);
  } else if (id === "canyon") {
    setGround(g, "desert", 12);
    mesas(g, 13);
    const r = rng(7);
    for (let k = 0; k < 26; k++) { const a = r() * Math.PI * 2, d = 30 + r() * 70; cactus(g, Math.sin(a) * d, -15 + Math.cos(a) * d, 0.7 + r() * 0.6); }
    umbrella(g, -9, -34, 0xffc93a); cooler(g, 5, -22, 0.4, 0x0fb5a5); chair(g, 8, -37, -0.35, 0xe8392b);
    truck(g, -18, 16, 0.4, 0xd9a05a);
  } else if (id === "carnival") {
    setGround(g, "dirt", 8);
    ferrisWheel(g, -40, -80);
    stripedTent(g, 28, -50, 8, ["#e8392b", "#ffffff"]); stripedTent(g, -30, -30, 6, ["#2f86ff", "#ffffff"]); stripedTent(g, 32, 10, 7, ["#ffc93a", "#e8392b"]); stripedTent(g, -28, 22, 6, ["#2fbf71", "#ffffff"]);
    const poles = [[-12, -44], [12, -44], [-12, -14], [12, -14], [-12, 16], [12, 16]];
    stringLights(g, poles, [[[-12, -44], [12, -44]], [[-12, -44], [-12, -14]], [[12, -44], [12, -14]], [[-12, -14], [12, -14]], [[-12, -14], [-12, 16]], [[12, -14], [12, 16]], [[-12, 16], [12, 16]], [[-12, -44], [12, -14]], [[12, -44], [-12, -14]]], 11, 2, 0.85);
    for (const [x, z] of [[-6, -27], [6, -27], [0, 6]]) { const pl = new THREE.PointLight(0xffc27a, 26, 26, 1.6); pl.position.set(x, 9, z); g.add(pl); }
    cooler(g, 5, -22, 0.4, 0xff2e88); chair(g, -8, -36, 0.35, 0xa24bff);
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

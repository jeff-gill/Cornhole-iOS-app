
// ───────────────────────── Renderer, sky, lights
const canvas = $("gl"), stage = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const skyU = {
  top: { value: new THREE.Vector3() }, mid: { value: new THREE.Vector3() }, horizon: { value: new THREE.Vector3() },
  sunDir: { value: new THREE.Vector3(-0.55, 0.32, 0.2).normalize() }, sunGlow: { value: 1 }, night: { value: 0 },
};
scene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
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
})));
const hemi = new THREE.HemisphereLight(0xd6ecff, 0x557a2c, 1.25);
const sun = new THREE.DirectionalLight(0xffe3b8, 2.9);
sun.target.position.set(0, 0, -27);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
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
  if (opts.sides !== false) for (let z = -52; z <= 20; z += 8 + r() * 6) { place(-32 - r() * 14, z, 0.8 + r() * 0.5); place(32 + r() * 14, z, 0.8 + r() * 0.5); }
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
  screen.position.set(0, 38, -118); g.add(screen);
  add(g, box(42, 22, 2, std(0x222222)), 0, 38, -119.2, false);
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

const VENUE_LOOK = {
  backyard: { top: [0.19, 0.44, 0.80], mid: [0.56, 0.78, 0.95], horizon: [1.0, 0.83, 0.62], sunGlow: 1, night: 0, fog: [0xf2cfa0, 90, 260],
    hemi: [0xd6ecff, 0x557a2c, 1.25], sun: [0xffe3b8, 2.9, [-26, 20, -18]], exposure: 1.08, dust: 0xf1dcb0 },
  tailgate: { top: [0.20, 0.30, 0.62], mid: [0.75, 0.55, 0.62], horizon: [1.0, 0.62, 0.38], sunGlow: 1.3, night: 0, fog: [0xe8a878, 80, 240],
    hemi: [0xffd9c0, 0x4d4a48, 1.1], sun: [0xffb070, 3.0, [-30, 14, -10]], exposure: 1.05, dust: 0xbfbcb4 },
  beach: { top: [0.10, 0.48, 0.88], mid: [0.45, 0.78, 0.98], horizon: [0.88, 0.95, 1.0], sunGlow: 0.8, night: 0, fog: [0xcfeaff, 120, 400],
    hemi: [0xe6f6ff, 0xd8c08a, 1.35], sun: [0xfff4dc, 3.3, [-14, 34, -6]], exposure: 1.0, dust: 0xf0dca8 },
  brewery: { top: [0.02, 0.03, 0.10], mid: [0.06, 0.08, 0.22], horizon: [0.25, 0.18, 0.30], sunGlow: 0, night: 1, fog: [0x1a1530, 60, 200],
    hemi: [0x5466a8, 0x2a1a12, 0.45], sun: [0xffcf8a, 1.5, [-8, 30, -16]], exposure: 1.0, dust: 0xc8a888 },
  stadium: { top: [0.01, 0.02, 0.07], mid: [0.04, 0.07, 0.18], horizon: [0.18, 0.22, 0.38], sunGlow: 0, night: 1, fog: [0x10162a, 140, 420],
    hemi: [0xbfd4ff, 0x1d3a1f, 0.8], sun: [0xf2f6ff, 3.4, [10, 40, -8]], exposure: 1.1, dust: 0xd8e8d0 },
};
function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); const m = n.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); }); }
function buildVenue(id) {
  if (id === venueId) return;
  if (venueGroup) { scene.remove(venueGroup); disposeTree(venueGroup); }
  venueId = id; glowSprites = [];
  const g = new THREE.Group(), L = VENUE_LOOK[id];
  skyU.top.value.set(...L.top); skyU.mid.value.set(...L.mid); skyU.horizon.value.set(...L.horizon); skyU.sunGlow.value = L.sunGlow; skyU.night.value = L.night;
  scene.fog.color.setHex(L.fog[0]); scene.fog.near = L.fog[1]; scene.fog.far = L.fog[2];
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1]; sun.position.set(...L.sun[2]);
  skyU.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();
  renderer.toneMappingExposure = L.exposure; venueDust = L.dust;

  if (id === "backyard") {
    setGround(g, "grass", 6);
    trees(g, 21, [0x3f9a3c, 0x2f8a46, 0x58b043, 0x2b7a3a, 0x6cbf4a]);
    fence(g, 33);
    stringLights(g, [[-9, -38], [9, -38], [-9, -14], [9, -14]], [[[-9, -38], [9, -38]], [[-9, -38], [-9, -14]], [[9, -38], [9, -14]], [[-9, -14], [9, -26]], [[9, -14], [-9, -26]]]);
    cooler(g, 5, -22, 0.4);
    chair(g, -7.5, -36, 0.35, 0x2f86ff); // set back from the board, facing the players
    chair(g, 7.8, -37, -0.35, 0xff4b3a);
  } else if (id === "tailgate") {
    setGround(g, "asphalt", 18);
    trees(g, 5, [0x3c7a3a, 0x4c8a3a], { back: -150, sides: false });
    truck(g, -16, -24, 0.15, 0xc8102e); truck(g, 17, -30, -0.2, 0x2f6fd9); truck(g, -18, -52, 0.1, 0xf2f2f2); truck(g, 16, -2, -0.1, 0x222222);
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
  } else if (id === "brewery") {
    setGround(g, "brick", 8);
    const bricks = wallTexture("brick"); bricks.repeat.set(4, 1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), new THREE.MeshLambertMaterial({ map: bricks })); wall.position.set(0, 8, -48); g.add(wall);
    for (const x of [-24, 24]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), new THREE.MeshLambertMaterial({ map: bricks })); sw.position.set(x, 8, -18); sw.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(sw); }
    const signTex = canvasTex(512, 128, (c, w, h) => { c.fillStyle = "#1a0f08"; c.fillRect(0, 0, w, h); c.fillStyle = "#ffb347"; c.font = "bold 58px Georgia, serif"; c.textAlign = "center"; c.fillText("TAPROOM", w / 2, h / 2 + 20); });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set(0, 12, -47.8); g.add(sign);
    const poles = [[-10, -40], [10, -40], [-10, -24], [10, -24], [-10, -8], [10, -8]];
    stringLights(g, poles, [[[-10, -40], [10, -40]], [[-10, -24], [10, -24]], [[-10, -8], [10, -8]], [[-10, -40], [-10, -8]], [[10, -40], [10, -8]], [[-10, -40], [10, -24]], [[10, -40], [-10, -24]], [[-10, -24], [10, -8]], [[10, -24], [-10, -8]]], 11.5, 2, 0.8);
    barrel(g, -7, -38); barrel(g, -9.5, -36); barrel(g, 8, -40);
    picnicTable(g, 12, -26, 0.1); picnicTable(g, -13, -20, -0.1);
    for (const [x, z] of [[-6, -27], [6, -27]]) { const pl = new THREE.PointLight(0xffc27a, 30, 26, 1.6); pl.position.set(x, 9, z); g.add(pl); }
  } else if (id === "stadium") {
    setGround(g, "turf", 6);
    stands(g, -95, 180, 12); stands(g, -40, 140, 10, Math.PI / 2, -70); stands(g, -40, 140, 10, -Math.PI / 2, 70);
    for (const [x, z] of [[-60, -100], [60, -100], [-70, 10], [70, 10]]) floodlight(g, x, z);
    jumbotron(g);
    const pl = new THREE.PointLight(0xffffff, 40, 40, 1.4); pl.position.set(0, 18, -24); g.add(pl);
  }
  scene.add(g); venueGroup = g;
}

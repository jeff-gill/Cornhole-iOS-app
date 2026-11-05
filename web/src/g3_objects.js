
// ───────────────────────── Boards
function paintBoard(c, w, h, design) {
  const r = rng(5), s = w / 2; // pixels per foot
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#f0d29c"); g.addColorStop(0.35, "#e6c086"); g.addColorStop(0.7, "#eecd97"); g.addColorStop(1, "#ddb37a");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const grain = (n, rgb, alpha) => {
    for (let i = 0; i < n; i++) {
      const x0 = r() * w, amp = 1 + r() * 5, f = 2 + r() * 4, ph = r() * 6;
      c.strokeStyle = `rgba(${rgb},${alpha * (0.4 + r() * 0.8)})`; c.lineWidth = 0.8 + r() * 2.2;
      c.beginPath(); for (let k = 0; k <= 30; k++) { const y = h * k / 30, x = x0 + Math.sin(k / 30 * f + ph) * amp; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    }
  };
  grain(90, "140,90,40", 0.17);
  const d = design, hx = w / 2, hy = 0.75 * s;
  c.save(); c.globalAlpha = 0.95;
  const band = (y0, y1, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(-5, h * y0 + 0.5 * s); c.lineTo(w + 5, h * y0 - 0.5 * s); c.lineTo(w + 5, h * y1 - 0.5 * s); c.lineTo(-5, h * y1 + 0.5 * s); c.closePath(); c.fill(); };
  if (d.paint === "band") {
    band(0.585, 0.6, d.b); band(0.61, 0.76, d.a); band(0.77, 0.785, d.b);
  } else if (d.paint === "stripes") {
    const top = h * 0.42, n = 7, sh = (h - top) / n;
    for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? d.b : d.a; c.fillRect(0, top + i * sh, w, sh); }
    c.fillStyle = d.c; c.fillRect(0, top, w * 0.45, sh * 3);
    c.fillStyle = "#fff"; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(18 + (i % 4) * 50, top + 22 + Math.floor(i / 4) * 40, 6, 0, 7); c.fill(); }
  } else if (d.paint === "fade") {
    const gg = c.createLinearGradient(0, h * 0.35, 0, h); gg.addColorStop(0, "rgba(0,0,0,0)"); gg.addColorStop(0.25, d.a); gg.addColorStop(1, d.b);
    c.fillStyle = gg; c.fillRect(0, h * 0.35, w, h * 0.65);
    c.fillStyle = "rgba(255,240,160,.9)"; c.beginPath(); c.arc(w / 2, h * 0.86, w * 0.18, Math.PI, 0); c.fill();
  } else if (d.paint === "checker") {
    const sq = w / 8;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) { c.fillStyle = (row + col) % 2 ? d.a : d.b; c.fillRect(col * sq, h * 0.6 + row * sq, sq, sq); }
  } else if (d.paint === "waves") {
    const gg = c.createLinearGradient(0, h * 0.4, 0, h); gg.addColorStop(0, d.b); gg.addColorStop(1, d.a); c.fillStyle = gg; c.fillRect(0, h * 0.42, w, h * 0.58);
    c.strokeStyle = "rgba(255,255,255,.8)"; c.lineWidth = 6;
    for (let y = h * 0.5; y < h; y += 70) { c.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x / 30) * 12; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke(); }
  } else if (d.paint === "gold") {
    c.fillStyle = d.a; c.fillRect(0, 0, w, h);
    c.strokeStyle = d.b; c.lineWidth = 5; for (let k = -h; k < w + h; k += 90) { c.beginPath(); c.moveTo(k, h); c.lineTo(k + h * 0.5, h * 0.5); c.stroke(); }
  }
  c.strokeStyle = d.a === "#151515" ? d.b : d.a; c.lineWidth = 0.04 * s; c.strokeRect(0.1 * s, 0.1 * s, w - 0.2 * s, h - 0.2 * s);
  c.strokeStyle = d.b === "#ffffff" ? "#ffc93a" : d.b; c.lineWidth = 0.06 * s; c.beginPath(); c.arc(hx, hy, (HR + 0.1) * s, 0, 7); c.stroke();
  c.strokeStyle = d.a; c.lineWidth = 0.03 * s; c.beginPath(); c.arc(hx, hy, (HR + 0.17) * s, 0, 7); c.stroke();
  c.restore();
  if (d.paint !== "gold") grain(40, "90,55,20", 0.07);
  const sh = c.createLinearGradient(0, 0, w * 0.8, h * 0.6);
  sh.addColorStop(0, "rgba(255,255,255,.18)"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,.05)");
  c.fillStyle = sh; c.fillRect(0, 0, w, h);
}
const boardTopMat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f3a6e, roughness: 0.55 });
const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffc93a, roughness: 0.4 });
let boardDesignId = "";
function setBoardDesign(id) {
  if (id === boardDesignId) return;
  boardDesignId = id;
  const d = boardById(id), tex = canvasTex(512, 1024, (c, w, h) => paintBoard(c, w, h, d));
  tex.repeat.set(0.5, 0.25); tex.offset.set(0.5, 0);
  if (boardTopMat.map) boardTopMat.map.dispose();
  boardTopMat.map = tex; boardTopMat.needsUpdate = true;
  frameMat.color.set(d.a === "#151515" ? "#151515" : d.a); stripeMat.color.set(d.b === "#ffffff" ? "#ffc93a" : d.b);
}
function makeBoard() {
  const g = new THREE.Group(), tilt = new THREE.Group();
  tilt.position.y = FH - 0.06; tilt.rotation.x = SLOPE; tilt.scale.z = 1 / SC;
  g.add(tilt);
  const shape = new THREE.Shape();
  shape.moveTo(-HW, 0); shape.lineTo(HW, 0); shape.lineTo(HW, BY - FY); shape.lineTo(-HW, BY - FY); shape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, HOLE.y - FY, HR, 0, Math.PI * 2, true); shape.holes.push(hole);
  const topGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2, curveSegments: 48 });
  topGeo.rotateX(-Math.PI / 2);
  const top = new THREE.Mesh(topGeo, [boardTopMat, new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.7 })]);
  top.castShadow = true; top.receiveShadow = true; tilt.add(top);
  const L = BY - FY;
  for (const [geo, x, z] of [[new THREE.BoxGeometry(0.08, 0.3, L), HW - 0.04, -L / 2], [new THREE.BoxGeometry(0.08, 0.3, L), -HW + 0.04, -L / 2],
    [new THREE.BoxGeometry(2 * HW, 0.3, 0.08), 0, -0.04], [new THREE.BoxGeometry(2 * HW, 0.3, 0.08), 0, -L + 0.04]]) {
    const m = new THREE.Mesh(geo, frameMat); m.position.set(x, -0.15, z); m.castShadow = true; m.receiveShadow = true; tilt.add(m);
  }
  for (const x of [HW + 0.002, -HW - 0.002]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.035, L - 0.3), stripeMat); s.position.set(x, -0.1, -L / 2); tilt.add(s); }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(HR, HR, 0.4, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x120c08, side: THREE.BackSide }));
  tube.position.set(0, -0.15, -(HOLE.y - FY)); tilt.add(tube);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(HR, 32), new THREE.MeshBasicMaterial({ color: 0x050302 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.32, -(HOLE.y - FY)); tilt.add(floor);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x9c6f3d, roughness: 0.8 });
  for (const x of [-HW + 0.12, HW - 0.12]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, BH - 0.2, 0.28), legMat); leg.position.set(x, (BH - 0.2) / 2, -(L - 0.4)); leg.castShadow = true; g.add(leg); }
  return g;
}
const targetBoard = makeBoard(); targetBoard.position.z = -FY; scene.add(targetBoard);
const ownBoard = makeBoard(); ownBoard.rotation.y = Math.PI; scene.add(ownBoard);

// ───────────────────────── Bags
function paintBag(c, w, h, bag) {
  const base = bag.c, light = shade(base, 0.35), dark = shade(base, -0.4);
  const g = c.createRadialGradient(w * 0.38, h * 0.35, 10, w / 2, h / 2, w * 0.75);
  g.addColorStop(0, light); g.addColorStop(0.55, base); g.addColorStop(1, dark);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.save(); c.fillStyle = "rgba(255,255,255,.85)"; c.strokeStyle = "rgba(255,255,255,.85)";
  if (bag.pattern === "stripe") { c.fillRect(0, h * 0.42, w, h * 0.16); c.fillStyle = dark; c.fillRect(0, h * 0.47, w, h * 0.06); }
  else if (bag.pattern === "dots") { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.beginPath(); c.arc(w * (0.2 + x * 0.2), h * (0.2 + y * 0.2), w * 0.04, 0, 7); c.fill(); } }
  else if (bag.pattern === "chevron") { c.lineWidth = w * 0.07; for (const y of [0.35, 0.6]) { c.beginPath(); c.moveTo(w * 0.15, h * (y + 0.12)); c.lineTo(w * 0.5, h * y); c.lineTo(w * 0.85, h * (y + 0.12)); c.stroke(); } }
  else if (bag.pattern === "swirl") { c.lineWidth = w * 0.05; c.beginPath(); for (let a = 0; a < 14; a += 0.1) { const rr = a * w * 0.025; const x = w / 2 + Math.cos(a) * rr, y = h / 2 + Math.sin(a) * rr; a ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  else if (bag.pattern === "bolt") { c.beginPath(); c.moveTo(w * 0.58, h * 0.12); c.lineTo(w * 0.3, h * 0.55); c.lineTo(w * 0.5, h * 0.55); c.lineTo(w * 0.4, h * 0.88); c.lineTo(w * 0.72, h * 0.42); c.lineTo(w * 0.52, h * 0.42); c.closePath(); c.fill(); }
  else if (bag.pattern === "star") { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? w * 0.13 : w * 0.3; c.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); } c.closePath(); c.fill(); }
  c.restore();
  c.strokeStyle = "rgba(255,255,255,.07)"; c.lineWidth = 1;
  for (let k = -w; k < w; k += 4) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + w, h); c.stroke(); c.beginPath(); c.moveTo(k + w, 0); c.lineTo(k, h); c.stroke(); }
  c.setLineDash([7, 6]); c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 3;
  c.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8); c.setLineDash([]);
}
const bagGeo = (() => {
  const g = new RoundedBoxGeometry(BAG * 0.98, 0.14, BAG * 0.98, 4, 0.06);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (BAG / 2), z = p.getZ(i) / (BAG / 2), k = Math.min(1, (x * x + z * z) / 2); p.setY(i, p.getY(i) * (1.15 - 0.55 * k)); }
  g.computeVertexNormals();
  return g;
})();
const bagMatCache = new Map();
function bagMaterial(bag) {
  if (!bagMatCache.has(bag.id)) bagMatCache.set(bag.id, new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => paintBag(c, w, h, bag)), roughness: 0.92 }));
  return bagMatCache.get(bag.id);
}
const bagMeshes = new Map();
function clearBagMeshes() { for (const v of bagMeshes.values()) scene.remove(v.mesh); bagMeshes.clear(); }
function bagMesh(b) {
  let v = bagMeshes.get(b.id);
  if (!v) {
    const mesh = new THREE.Mesh(bagGeo, bagMaterial(S.gear[b.owner]));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.rotation.order = "XYZ";
    scene.add(mesh); v = { mesh, dropT: 0, squashT: 9 }; bagMeshes.set(b.id, v);
  }
  return v;
}
function squash(id) { const v = bagMeshes.get(id); if (v) v.squashT = 0; }
function updateBags(dt) {
  for (const b of S.world.bags) {
    const v = bagMesh(b), m = v.mesh;
    m.visible = true; v.squashT += dt;
    const sq = v.squashT < 0.3 ? Math.sin(v.squashT / 0.3 * Math.PI) * Math.exp(-v.squashT * 6) : 0;
    m.scale.set(1 + 0.25 * sq, 1 - 0.45 * sq, 1 + 0.25 * sq);
    if (b.state === "flying") {
      m.position.copy(W(b.x, b.y, b.z));
      m.rotation.set(0.2 * Math.sin(b.angle * 1.7), -b.angle, 0.15 * Math.cos(b.angle * 1.3));
    } else if (b.state === "inHole") {
      v.dropT += dt;
      const k = Math.min(1, v.dropT * 6);
      m.position.copy(W(lerp(b.x, HOLE.x, k), lerp(b.y, HOLE.y, k), plane(HOLE.y) - v.dropT * 2.2));
      m.visible = v.dropT < 0.5;
    } else {
      const ground = b.state === "ground";
      m.position.copy(W(b.x, b.y, (ground ? 0 : plane(b.y)) + 0.075));
      m.rotation.set(ground ? 0 : SLOPE, -b.angle, 0);
    }
  }
}

// ───────────────────────── Aiming guides (3D)
const guides = new THREE.Group(); scene.add(guides);
const lift = 0.012;
const surfaceAt = p => surf(p) + lift;
function flatOnBoard(obj, p) { obj.position.copy(W(p.x, p.y, surfaceAt(p))); obj.rotation.set(-Math.PI / 2 + (onBoard(p) ? SLOPE : 0), 0, 0); }
const finishMarker = new THREE.Group();
{
  const outline = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.26, 48), new THREE.MeshBasicMaterial({ color: 0x0a1426, transparent: true, opacity: 0.45, depthWrite: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.24, 48), new THREE.MeshBasicMaterial({ color: 0x3ee07a }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), new THREE.MeshBasicMaterial({ color: 0x3ee07a }));
  ring.position.z = 0.002; dot.position.z = 0.002; finishMarker.add(outline, ring, dot);
}
const landingMarker = new THREE.Group();
{
  const outline = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.31, 48), new THREE.MeshBasicMaterial({ color: 0x0a1426, transparent: true, opacity: 0.45, depthWrite: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.29, 48), new THREE.MeshBasicMaterial({ color: 0xffc93a }));
  ring.position.z = 0.002; landingMarker.add(outline, ring);
  for (let k = 0; k < 4; k++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.035), new THREE.MeshBasicMaterial({ color: 0xffc93a }));
    const a = k * Math.PI / 2; tick.position.set(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.002); tick.rotation.z = a; landingMarker.add(tick);
  }
}
for (const m of [finishMarker, landingMarker]) m.traverse(o => { if (o.isMesh) o.renderOrder = 5; });
scene.add(finishMarker, landingMarker);
const dotTex = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
const arcGeo = new THREE.BufferGeometry();
arcGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3));
arcGeo.setDrawRange(0, 0);
const arcDots = new THREE.Points(arcGeo, new THREE.PointsMaterial({ map: dotTex, color: 0xffffff, size: 11, sizeAttenuation: false, transparent: true, depthWrite: false }));
arcDots.renderOrder = 7; arcDots.frustumCulled = false; scene.add(arcDots);
let zoneMesh = null, zoneLine = null, slideLine = null, pushLine = null, ghostA = null, ghostB = null;
function disposeGuide(o) { if (!o) return; guides.remove(o); o.geometry.dispose(); }
function dashedLine(points, color, dash, gap) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: gap, transparent: true, opacity: 0.95, depthTest: false }));
  l.computeLineDistances(); l.renderOrder = 6; return l;
}
function ghostSquare(p, color) {
  const h = BAG / 2, pts = [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]].map(([dx, dy]) => { const q = { x: p.x + dx, y: p.y + dy }; return W(q.x, q.y, surfaceAt(q) + 0.005); });
  return dashedLine(pts, color, 0.06, 0.05);
}
let shownPlan = -1, shownPhase = "";
function rebuildGuides() {
  shownPlan = S.planVersion; shownPhase = S.phase;
  for (const o of [zoneMesh, zoneLine, slideLine, pushLine, ghostA, ghostB]) disposeGuide(o);
  zoneMesh = zoneLine = slideLine = pushLine = ghostA = ghostB = null;
  arcGeo.setDrawRange(0, 0);
  const visible = S.plan && ["aiming", "throw", "cpu"].includes(S.phase);
  finishMarker.visible = !!(visible && S.end);
  landingMarker.visible = !!(visible && S.landing);
  if (!visible) return;
  flatOnBoard(finishMarker, S.end); flatOnBoard(landingMarker, S.landing);
  setGear(S.player);
  const z = S.plan.z, E = S.end;
  if (canEdit() && z.Dmax - z.Dmin > 0.02) {
    const N = 18, pos = [], idx = [], outline = [];
    for (let i = 0; i <= N; i++) {
      const D = z.Dmin + (z.Dmax - z.Dmin) * i / N, a = maxPhi(D);
      for (const s of [-1, 1]) { const q = landingFrom(z, E, D, s * a); const w = W(q.x, q.y, surfaceAt(q)); pos.push(w.x, w.y, w.z); }
      if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    for (let i = 0; i <= N; i++) outline.push(new THREE.Vector3(pos[i * 6], pos[i * 6 + 1], pos[i * 6 + 2]));
    for (let i = N; i >= 0; i--) outline.push(new THREE.Vector3(pos[i * 6 + 3], pos[i * 6 + 4], pos[i * 6 + 5]));
    outline.push(outline[0].clone());
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    zoneMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffc93a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    zoneMesh.renderOrder = 4;
    zoneLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), new THREE.LineBasicMaterial({ color: 0xffc93a })); zoneLine.renderOrder = 4;
    guides.add(zoneMesh, zoneLine);
  }
  if (!S.prev) return;
  const pv = S.prev;
  if (pv.slide.length > 1) {
    slideLine = dashedLine(pv.slide.map(p => W(p.x, p.y, surfaceAt(p) + 0.01)), 0xffffff, 0.12, 0.09); guides.add(slideLine);
    if (pv.outcome !== "inHole") { ghostA = ghostSquare(pv.end, 0xffffff); guides.add(ghostA); }
  }
  if (pv.pushPath.length > 1) {
    pushLine = dashedLine(pv.pushPath.map(p => W(p.x, p.y, surfaceAt(p) + 0.01)), 0xffc93a, 0.08, 0.08); guides.add(pushLine);
    if (pv.pushOutcome !== "inHole") { ghostB = ghostSquare(pv.pushEnd, 0xffc93a); guides.add(ghostB); }
  }
  const arr = arcGeo.attributes.position.array;
  let last = null, n = 0;
  for (const p of pv.flight) {
    const w = W(p.x, p.y, p.z);
    if (last && w.distanceTo(last) < 0.9) continue;
    last = w; arr[n * 3] = w.x; arr[n * 3 + 1] = w.y; arr[n * 3 + 2] = w.z; n++;
    if (n >= 90) break;
  }
  arcGeo.attributes.position.needsUpdate = true; arcGeo.setDrawRange(0, n); arcGeo.computeBoundingSphere();
}

// ───────────────────────── Effects
const fx = [];
let shake = 0;
function dust(b, color) {
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, transparent: true, opacity: 0.8, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 1.2;
    s.position.copy(W(b.x, b.y, surf(b) + 0.08)); s.scale.setScalar(0.12); scene.add(s);
    fx.push({ o: s, vel: new THREE.Vector3(Math.cos(a) * v, 0.6 + Math.random() * 0.8, Math.sin(a) * v), life: 0.6 + Math.random() * 0.3, max: 0.9, grow: 0.5, kind: "dust" });
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  flatOnBoard(ring, b); ring.position.y += 0.01; scene.add(ring);
  fx.push({ o: ring, life: 0.45, max: 0.45, kind: "ring" });
}
const confettiGeo = new THREE.PlaneGeometry(0.09, 0.05);
function confetti(owner) {
  const cols = [COL.p[owner], COL.gold, "#ffffff", COL.pl[owner], COL.go];
  const n = 90, mesh = new THREE.InstancedMesh(confettiGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }), n);
  const parts = [], col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
    parts.push({ p: W(HOLE.x, HOLE.y, plane(HOLE.y) + 0.1), v: new THREE.Vector3(Math.cos(a) * v * 0.6, 5 + Math.random() * 7, Math.sin(a) * v * 0.6), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: (Math.random() - 0.5) * 18 });
    mesh.setColorAt(i, col.set(cols[i % cols.length]));
  }
  scene.add(mesh);
  fx.push({ o: mesh, parts, life: 2.2, max: 2.2, kind: "confetti" });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffd76a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  glow.position.copy(W(HOLE.x, HOLE.y, plane(HOLE.y) + 0.2)); glow.scale.setScalar(0.8); scene.add(glow);
  fx.push({ o: glow, life: 0.9, max: 0.9, kind: "glow" });
  shake = Math.max(shake, 0.45);
}
// 4-BAGGER: a big fireworks show over the board plus the title across the screen.
function fireworkBurst(center, color, n = 140) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), sp = 6 + Math.random() * 3;
    vel.push(new THREE.Vector3(Math.cos(a) * s * sp, u * sp, Math.sin(a) * s * sp));
    pos[i * 3] = center.x; pos[i * 3 + 1] = center.y; pos[i * 3 + 2] = center.z;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex, color, size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pts.frustumCulled = false; scene.add(pts);
  fx.push({ o: pts, vel, life: 2.0, max: 2.0, kind: "firework" });
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  flash.position.copy(center); flash.scale.setScalar(4); scene.add(flash);
  fx.push({ o: flash, life: 0.5, max: 0.5, kind: "flash" });
}
function fourBagger(owner) {
  const cols = [COL.p[owner], 0xffc93a, 0xffffff, COL.pl[owner], 0x3ee07a, 0xff2e88];
  for (let k = 0; k < 9; k++) {
    setTimeout(() => {
      const c = new THREE.Vector3(rand(-9, 9), rand(6, 13), -FY - rand(3, 14));
      fireworkBurst(c, new THREE.Color(cols[k % cols.length]));
      sfx.hole();
    }, k * 260);
  }
  shake = 0.8;
  haptic("big");
  const el = $("fourbag");
  el.textContent = "4-BAGGER!";
  el.style.setProperty("--c1", COL.pl[owner]); el.style.setProperty("--c2", COL.p[owner]);
  el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt; const a = Math.max(0, f.life / f.max);
    if (f.kind === "dust") { f.o.position.addScaledVector(f.vel, dt); f.vel.multiplyScalar(Math.pow(0.05, dt)); f.o.scale.setScalar(0.12 + (1 - a) * f.grow); f.o.material.opacity = 0.75 * a; }
    else if (f.kind === "ring") { const s = 1 + (1 - a) * 2.6; f.o.scale.set(s, s, s); f.o.material.opacity = 0.7 * a; }
    else if (f.kind === "glow") { f.o.scale.setScalar(0.8 + (1 - a) * 3); f.o.material.opacity = a; }
    else if (f.kind === "flash") { f.o.scale.setScalar(4 + (1 - a) * 10); f.o.material.opacity = a; }
    else if (f.kind === "firework") {
      const pos = f.o.geometry.attributes.position;
      f.vel.forEach((v, k) => { v.y -= 6 * dt; v.multiplyScalar(Math.pow(0.4, dt)); pos.array[k * 3] += v.x * dt; pos.array[k * 3 + 1] += v.y * dt; pos.array[k * 3 + 2] += v.z * dt; });
      pos.needsUpdate = true; f.o.material.opacity = Math.min(1, a * 1.6); f.o.material.size = 0.9 * (0.5 + a * 0.5);
    }
    else if (f.kind === "confetti") {
      f.parts.forEach((p, k) => {
        p.v.y -= 14 * dt; p.v.multiplyScalar(Math.pow(0.35, dt)); p.p.addScaledVector(p.v, dt);
        if (p.p.y < 0.03) { p.p.y = 0.03; p.v.set(0, 0, 0); }
        p.r.x += p.w * dt; p.r.y += p.w * 0.7 * dt;
        tmpM.compose(p.p, tmpQ.setFromEuler(p.r), one); f.o.setMatrixAt(k, tmpM);
      });
      f.o.instanceMatrix.needsUpdate = true; f.o.material.opacity = Math.min(1, a * 2);
    }
    if (f.life <= 0) { scene.remove(f.o); if (f.o.geometry && f.kind !== "confetti") f.o.geometry.dispose(); if (f.o.material) f.o.material.dispose(); fx.splice(i, 1); }
  }
  shake = Math.max(0, shake - dt);
}

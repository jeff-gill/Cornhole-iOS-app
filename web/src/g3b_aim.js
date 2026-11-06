
// ───────────────────────── Throw aim: a glowing arrow and power ring lying on the lane
// Rig layout: rig (on the ground in front of the thrower) > base (turned toward the landing spot)
//   > wedge (perfect zone) and ring (power), and swing (follows the aim needle) > arrow (shaft + head).
const AIM_VIS = 16 * Math.PI / 180;      // on-screen swing for a full-scale direction miss (exaggerated so it reads)
const RING_IN = 1.05, RING_OUT = 1.45, FILL_MAX = 1.25;
const aimRig = new THREE.Group(), aimBase = new THREE.Group(), aimSwing = new THREE.Group(), aimFlat = new THREE.Group();
aimRig.visible = false;
aimRig.add(aimBase); aimBase.add(aimSwing); aimSwing.add(aimFlat);
aimFlat.rotation.x = -Math.PI / 2; // local +Y points down-range, +Z points up
scene.add(aimRig);
const arrowMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color("#3ee07a") }, uB: { value: new THREE.Color("#ffffff") }, uAlpha: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `varying vec2 vUv; uniform float uTime, uAlpha; uniform vec3 uA, uB;
    void main(){
      vec3 col = mix(uA, uB, smoothstep(0.0, 1.0, vUv.y) * 0.55);
      float chev = fract(vUv.y * 5.0 - abs(vUv.x - 0.5) * 1.8 - uTime * 1.7);   // chevrons flowing toward the tip
      float stripe = smoothstep(0.0, 0.1, chev) * (1.0 - smoothstep(0.3, 0.42, chev));
      col = mix(col, vec3(1.0), stripe * 0.5);
      float edge = min(vUv.x, 1.0 - vUv.x);
      col = mix(vec3(1.0), col, smoothstep(0.0, 0.14, edge));                 // bright rim
      gl_FragColor = vec4(col, uAlpha * (0.78 + 0.22 * vUv.y));
    }`,
});
arrowMat.toneMapped = false;
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a1426, transparent: true, opacity: 0.55, depthWrite: false });
// Shaft: unit length along +Y, stretched each frame. Head: fixed size, sits at the tip.
const shaftGeo = new THREE.PlaneGeometry(0.62, 1).translate(0, 0.5, 0);
const headGeo = (() => {
  const s = new THREE.Shape(); s.moveTo(-0.95, 0); s.lineTo(0.95, 0); s.lineTo(0, 1.35); s.closePath();
  const g = new THREE.ShapeGeometry(s), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 0.95) / 1.9, 0.86 + p.getY(i) / 1.35 * 0.14);
  return g;
})();
const shaft = new THREE.Mesh(shaftGeo, arrowMat), head = new THREE.Mesh(headGeo, arrowMat);
const shaftLine = new THREE.Mesh(shaftGeo, outlineMat), headLine = new THREE.Mesh(headGeo, outlineMat);
shaftLine.scale.x = 1.35; headLine.scale.set(1.18, 1.18, 1);
shaftLine.position.z = headLine.position.z = -0.01;
for (const m of [shaftLine, headLine, shaft, head]) { m.renderOrder = 8; aimFlat.add(m); }
const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0x3ee07a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
tipGlow.renderOrder = 9; aimSwing.add(tipGlow);
// Perfect-direction wedge (doesn't swing).
const wedgeMat = new THREE.MeshBasicMaterial({ color: 0x3ee07a, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
let wedge = null;
// Power ring pieces, rebuilt as the pull changes.
const ringFlat = new THREE.Group(); ringFlat.rotation.x = -Math.PI / 2; aimBase.add(ringFlat);
const ringMats = {
  back: new THREE.MeshBasicMaterial({ color: 0x0a1426, transparent: true, opacity: 0.6, depthWrite: false }),
  gold: new THREE.MeshBasicMaterial({ color: 0xffc93a, transparent: true, opacity: 0.85, depthWrite: false }),
  red: new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.55, depthWrite: false }),
  fill: new THREE.MeshBasicMaterial({ color: 0x3ee07a, transparent: true, depthWrite: false }),
  edge: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
};
for (const m of Object.values(ringMats)) m.toneMapped = false;
const ringParts = {};
// Angles: the ring fills clockwise starting from the down-range side (local +Y).
const ang = f => Math.PI / 2 - (f / FILL_MAX) * Math.PI * 2;
function ringArc(name, f0, f1, r0, r1, mat, order) {
  if (ringParts[name]) { ringFlat.remove(ringParts[name]); ringParts[name].geometry.dispose(); ringParts[name] = null; }
  if (f1 - f0 < 0.002) return;
  const a1 = ang(f0), a0 = ang(f1);
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72, 1, a0, a1 - a0), mat);
  m.renderOrder = order; ringFlat.add(m); ringParts[name] = m;
}
let aimFireT = 0, aimBandShown = -1, aimWedgeZone = -1;
function aimColor(fill, band) {
  if (fill > 1) return "#ff3a2a";
  if (Math.abs(fill - POWER_TARGET) <= band) return "#3ee07a";
  return fill < POWER_TARGET ? "#ffe14a" : "#ff8a1f";
}
function updateAimRig(dt) {
  const throwing = S.phase === "throw" && S.ideal;
  if (!throwing && aimFireT <= 0) { aimRig.visible = false; return; }
  aimRig.visible = true;
  const L = lv(), p = S.pull, fill = throwing ? p.fill : Math.max(p.fill, 0.2), band = L.powZone * 0.5;
  // Place the rig a few feet in front of the hand, on the line toward the landing spot.
  const rel = release(S.player), to = S.landing || HOLE, d = Math.hypot(to.x - rel.x, to.y - rel.y);
  const dir = { x: (to.x - rel.x) / d, y: (to.y - rel.y) / d };
  aimRig.position.copy(W(rel.x + dir.x * 4.2, rel.y + dir.y * 4.2, 0.06));
  aimBase.rotation.y = -Math.atan2(dir.x, dir.y);
  // Perfect-direction wedge.
  if (aimWedgeZone !== L.zone) {
    aimWedgeZone = L.zone;
    if (wedge) { aimBase.remove(wedge); wedge.geometry.dispose(); }
    const za = Math.max(0.006, L.zone * AIM_VIS);
    wedge = new THREE.Mesh(new THREE.CircleGeometry(19, 24, Math.PI / 2 - za, 2 * za), wedgeMat);
    wedge.rotation.x = -Math.PI / 2; wedge.position.y = -0.01; wedge.renderOrder = 7; aimBase.add(wedge);
  }
  // Arrow: longer with more pull, swinging with the aim needle.
  arrowMat.uniforms.uTime.value = S.time;
  const col = aimColor(fill, band);
  arrowMat.uniforms.uA.value.set(col);
  tipGlow.material.color.set(col);
  let len = 2 + Math.min(fill, FILL_MAX) * 12, alpha = p.active || !throwing ? 1 : 0.7;
  if (!throwing) { // launch: the arrow shoots out and fades
    const k = 1 - aimFireT / 0.4;
    len *= 1 + k * 1.6; alpha = 1 - k;
    aimFireT -= dt;
  }
  arrowMat.uniforms.uAlpha.value = alpha; outlineMat.opacity = 0.55 * alpha;
  aimSwing.rotation.y = -clamp(p.swing, -1.3, 1.3) * AIM_VIS;
  shaft.scale.y = shaftLine.scale.y = len;
  head.position.y = headLine.position.y = len - 0.05;
  const tip = len + 1.2;
  tipGlow.position.set(0, 0.25, -tip);
  const perfect = p.active && Math.abs(fill - POWER_TARGET) <= band && Math.abs(p.swing) <= L.zone;
  tipGlow.scale.setScalar((perfect ? 3.6 : 2.4) + Math.sin(S.time * 14) * (perfect ? 0.8 : 0.2));
  tipGlow.material.opacity = alpha * (perfect ? 1 : 0.7);
  // Power ring: dark track, red overdrive, gold target, the live fill and a white edge.
  if (aimBandShown !== band) {
    aimBandShown = band;
    ringArc("back", 0, FILL_MAX, RING_IN - 0.08, RING_OUT + 0.08, ringMats.back, 6);
    ringArc("red", 1, FILL_MAX, RING_IN, RING_OUT, ringMats.red, 7);
    ringArc("gold", POWER_TARGET - band, POWER_TARGET + band, RING_IN - 0.06, RING_OUT + 0.06, ringMats.gold, 7);
  }
  ringMats.fill.color.set(col);
  ringMats.fill.opacity = alpha;
  ringArc("fill", 0, Math.min(fill, FILL_MAX), RING_IN + 0.06, RING_OUT - 0.06, ringMats.fill, 8);
  const pulse = fill > 1 ? 1 + 0.06 * Math.sin(S.time * 20) : 1;
  ringFlat.scale.setScalar(pulse);
  for (const m of [ringMats.back, ringMats.red, ringMats.gold]) m.opacity = (m === ringMats.back ? 0.6 : m === ringMats.gold ? 0.85 : 0.55) * alpha;
}
function fireAim() {
  aimFireT = 0.4;
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  g.position.copy(aimRig.position).add(new THREE.Vector3(0, 0.3, 0)); g.scale.setScalar(3); scene.add(g);
  fx.push({ o: g, life: 0.35, max: 0.35, kind: "flash" });
}

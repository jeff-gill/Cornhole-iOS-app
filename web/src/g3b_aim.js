
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
  fragmentShader: `varying vec2 vUv; uniform float uTime, uAlpha; uniform vec3 uA;
    void main(){
      vec3 col = uA;
      col *= 0.82 + 0.18 * smoothstep(0.0, 0.35, vUv.x) * (1.0 - 0.35 * smoothstep(0.6, 1.0, vUv.x));   // rounded, slightly darker right edge
      float shine = smoothstep(0.18, 0.3, vUv.x) * (1.0 - smoothstep(0.38, 0.5, vUv.x));               // glossy streak like the score cards
      col = mix(col, vec3(1.0), shine * 0.45);
      float chev = fract(vUv.y * 4.0 - abs(vUv.x - 0.5) * 1.6 - uTime * 1.5);
      col = mix(col, vec3(1.0), (smoothstep(0.0, 0.1, chev) * (1.0 - smoothstep(0.22, 0.32, chev))) * 0.22);
      gl_FragColor = vec4(col, uAlpha);
    }`,
});
arrowMat.toneMapped = false;
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a1426, transparent: true, opacity: 0.6, depthWrite: false });
const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
whiteMat.toneMapped = false;
// A rounded, bubbly arrow: base at y = y0, shaft half-width w, head half-width hw and length hl, corner radius r.
function arrowShape(len, w, hw, hl, r, y0 = 0) {
  const sh = new THREE.Shape(), top = len, tipY = len + hl;
  sh.moveTo(-w + r, y0);
  sh.lineTo(w - r, y0); sh.quadraticCurveTo(w, y0, w, y0 + r);
  sh.lineTo(w, top - r * 0.4); sh.quadraticCurveTo(w, top, w + r * 0.6, top);
  sh.lineTo(hw - r, top); sh.quadraticCurveTo(hw + r * 0.5, top, hw - r * 0.3, top + r * 0.75);
  sh.lineTo(r * 0.55, tipY - r * 0.75); sh.quadraticCurveTo(0, tipY + r * 0.1, -r * 0.55, tipY - r * 0.75);
  sh.lineTo(-hw + r * 0.3, top + r * 0.75); sh.quadraticCurveTo(-hw - r * 0.5, top, -hw + r, top);
  sh.lineTo(-w - r * 0.6, top); sh.quadraticCurveTo(-w, top, -w, top - r * 0.4);
  sh.lineTo(-w, y0 + r); sh.quadraticCurveTo(-w, y0, -w + r, y0);
  return sh;
}
const ARROW = { w: 0.36, hw: 0.95, hl: 1.35, r: 0.22 };
const arrowLayers = [ // drawn back to front
  { mat: shadowMat, pad: 0.2, dx: 0.22, dy: -0.12, order: 7 },
  { mat: outlineMat, pad: 0.24, dx: 0, dy: 0, order: 8 },
  { mat: whiteMat, pad: 0.14, dx: 0, dy: 0, order: 8.1 },
  { mat: arrowMat, pad: 0, dx: 0, dy: 0, order: 8.2 },
].map(l => { const m = new THREE.Mesh(new THREE.BufferGeometry(), l.mat); m.position.set(l.dx, l.dy, 0); m.renderOrder = l.order; aimFlat.add(m); return { ...l, mesh: m }; });
let arrowLen = -1;
function setArrowLength(len) {
  if (Math.abs(len - arrowLen) < 0.03) return;
  arrowLen = len;
  for (const l of arrowLayers) {
    const p = l.pad, g = new THREE.ShapeGeometry(arrowShape(len, ARROW.w + p, ARROW.hw + p * 1.6, ARROW.hl + p * 1.3, ARROW.r + p * 0.5, -p), 6);
    if (l.mat === arrowMat) { // UVs across (x) and along (y) the arrow for the gloss and chevrons
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + ARROW.hw) / (2 * ARROW.hw), pos.getY(i) / (len + ARROW.hl));
    }
    l.mesh.geometry.dispose(); l.mesh.geometry = g;
  }
}
const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0x3ee07a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
tipGlow.renderOrder = 9; aimSwing.add(tipGlow);
// Perfect-direction wedge (doesn't swing).
const wedgeMat = new THREE.MeshBasicMaterial({ color: 0x3ee07a, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
let wedge = null;
// Power ring, read like a clock seen from behind the thrower: 12 o'clock is toward the board (where the arrow leaves the
// ring), and it fills clockwise. White blends to bright green up to the sweet spot, which ends exactly at 6 o'clock between
// two lines; past it the ring goes light yellow, orange, then red (overdrive) back at 12.
const ringFlat = new THREE.Group(); ringFlat.rotation.x = -Math.PI / 2; aimBase.add(ringFlat);
const ringMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uFill: { value: 0 }, uB0: { value: 0.47 }, uB1: { value: 0.5 }, uOD: { value: 0.75 }, uAlpha: { value: 1 }, uTime: { value: 0 } },
  vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `varying vec2 vP; uniform float uFill, uB0, uB1, uOD, uAlpha, uTime;
    vec3 ramp(float a){
      vec3 white = vec3(1.0), green = vec3(0.55, 0.92, 0.55), bright = vec3(0.1, 1.0, 0.35);
      vec3 lemon = vec3(1.0, 0.96, 0.55), orange = vec3(1.0, 0.58, 0.12), red = vec3(1.0, 0.13, 0.1);
      if (a < 0.5) return a < 0.25 ? mix(white, green, a / 0.25) : mix(green, bright, (a - 0.25) / 0.25);
      return a < 0.75 ? mix(lemon, orange, (a - 0.5) / 0.25) : mix(orange, red, (a - 0.75) / 0.25);
    }
    void main(){
      float r = length(vP);
      float a = fract(atan(vP.x, vP.y) / 6.2831853);          // 0 at 12 o'clock, clockwise
      vec3 col = ramp(a);
      bool lit = a <= uFill;
      float alpha = lit ? 0.97 : 0.3;
      if (!lit) col = mix(col, vec3(0.04, 0.08, 0.15), 0.35);
      if (lit && a > uOD) col *= 0.85 + 0.15 * sin(uTime * 20.0);    // overdrive throbs
      float px = 0.035 / (6.2831853 * max(r, 0.5));           // ~0.035 ft, as a fraction of the circle
      float line = max(1.0 - smoothstep(px * 0.6, px * 1.6, abs(a - uB0)), 1.0 - smoothstep(px * 0.6, px * 1.6, abs(a - uB1)));
      col = mix(col, vec3(1.0), line); alpha = max(alpha, line);
      float tick = 1.0 - smoothstep(px * 1.2, px * 2.6, abs(a - uFill));    // where the pull is right now
      col = mix(col, vec3(1.0), tick * step(0.001, uFill)); alpha = max(alpha, tick * step(0.001, uFill));
      float t = clamp((r - 1.08) / 0.34, 0.0, 1.0);
      col = mix(col, vec3(1.0), 0.32 * smoothstep(0.55, 0.95, t) * (lit ? 1.0 : 0.4));  // glossy outer half, like the cards
      col *= 0.88 + 0.12 * t;
      gl_FragColor = vec4(col, alpha * uAlpha);
      if ((r > 1.0 && r < 1.08) || (r > 1.42 && r < 1.5)) gl_FragColor = vec4(1.0, 1.0, 1.0, uAlpha);   // white rims
      if (r <= 1.0 || r >= 1.5) gl_FragColor = vec4(0.04, 0.08, 0.15, 0.6 * uAlpha);              // dark edge
    }`,
});
ringMat.toneMapped = false;
const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.57, 128, 2), ringMat);
ringMesh.renderOrder = 7; ringFlat.add(ringMesh);
const ringShadow = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.6, 96, 1), shadowMat);
ringShadow.position.set(0.18, -0.12, -0.005); ringShadow.renderOrder = 6; ringFlat.add(ringShadow);
// Fill -> fraction of the circle. The sweet spot (target ± band) ends exactly at 6 o'clock (0.5).
function ringFrac(f, band) {
  const top = POWER_TARGET + band;
  return f <= top ? 0.5 * f / top : 0.5 + 0.5 * (f - top) / (FILL_MAX - top);
}
// Same colour ramp as the ring, for the arrow.
const RAMP = [[0, "#ffffff"], [0.25, "#8ceb8c"], [0.5, "#1aff59"], [0.5001, "#fff58c"], [0.75, "#ff941f"], [1, "#ff211a"]];
const tmpC1 = new THREE.Color(), tmpC2 = new THREE.Color();
function rampColor(a, out) {
  for (let k = 1; k < RAMP.length; k++) if (a <= RAMP[k][0]) {
    const [a0, c0] = RAMP[k - 1], [a1, c1] = RAMP[k];
    return out.copy(tmpC1.set(c0)).lerp(tmpC2.set(c1), (a - a0) / Math.max(1e-6, a1 - a0));
  }
  return out.set(RAMP[RAMP.length - 1][1]);
}
let aimFireT = 0, aimWedgeZone = -1;
function updateAimRig(dt) {
  const throwing = S.phase === "throw" && S.ideal;
  if (!throwing && aimFireT <= 0) { aimRig.visible = false; return; }
  aimRig.visible = true;
  const L = lv(), p = S.pull, fill = throwing ? p.fill : Math.max(p.fill, 0.2), band = L.powZone * 0.5;
  // Place the rig a few feet in front of the hand, on the line toward the landing spot.
  const rel = release(S.player), to = S.landing || HOLE, d = Math.hypot(to.x - rel.x, to.y - rel.y);
  const dir = { x: (to.x - rel.x) / d, y: (to.y - rel.y) / d };
  const ahead = handFloor() > 0 ? 9 : 4.2; // up high (Bullseye Bags), farther out so it sits above the board on screen
  aimRig.position.copy(W(rel.x + dir.x * ahead, rel.y + dir.y * ahead, handFloor() + 0.06));
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
  const frac = ringFrac(Math.min(fill, FILL_MAX), band);
  rampColor(frac, arrowMat.uniforms.uA.value);
  tipGlow.material.color.copy(arrowMat.uniforms.uA.value);
  let len = 2 + Math.min(fill, FILL_MAX) * 12, alpha = p.active || !throwing ? 1 : 0.7;
  if (!throwing) { // launch: the arrow shoots out and fades
    const k = 1 - aimFireT / 0.4;
    len *= 1 + k * 1.6; alpha = 1 - k;
    aimFireT -= dt;
  }
  arrowMat.uniforms.uAlpha.value = alpha; outlineMat.opacity = 0.6 * alpha; whiteMat.opacity = alpha; shadowMat.opacity = 0.28 * alpha;
  aimSwing.rotation.y = -clamp(p.swing, -1.3, 1.3) * AIM_VIS;
  setArrowLength(len);
  const tip = len + ARROW.hl;
  tipGlow.position.set(0, 0.25, -tip);
  const perfect = p.active && Math.abs(fill - POWER_TARGET) <= band && Math.abs(p.swing) <= L.zone;
  tipGlow.scale.setScalar((perfect ? 3.6 : 2.4) + Math.sin(S.time * 14) * (perfect ? 0.8 : 0.2));
  tipGlow.material.opacity = alpha * (perfect ? 1 : 0.7);
  // Power ring.
  const u = ringMat.uniforms;
  u.uFill.value = fill > 0.005 ? frac : 0;
  u.uB0.value = ringFrac(POWER_TARGET - band, band); u.uB1.value = 0.5;
  u.uOD.value = ringFrac(1, band);
  u.uAlpha.value = alpha; u.uTime.value = S.time;
}
function fireAim() {
  aimFireT = 0.4;
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  g.position.copy(aimRig.position).add(new THREE.Vector3(0, 0.3, 0)); g.scale.setScalar(3); scene.add(g);
  fx.push({ o: g, life: 0.35, max: 0.35, kind: "flash" });
}

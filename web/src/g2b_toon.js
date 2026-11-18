
// ───────────────────────── Cartoon look (the Backyard first; add a court's id to TOON_VENUES to give it the look)
// Flat cartoon shading (three tones of light), ink outlines around every shape, a bright sky with puffy clouds
// and punchier colour. Models load in over time, so their materials are swapped as they appear, and swapped
// back on a court without the look. `var` (not const/let) so buildVenue can call setToon() while the game starts.
var TOON_VENUES = new Set(["backyard", "tailgate", "beach", "brewery", "lodge", "bonfire", "island", "rooftop", "lakeside", "canyon", "carnival", "stadium"]);
var toonState = null;
var toonOrig = new WeakMap();   // cartoon material -> the original it replaced

function toonInit() {
  if (toonState) return toonState;
  const ramp = new THREE.DataTexture(new Uint8Array([78, 78, 78, 255, 140, 140, 140, 255, 196, 196, 196, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const ink = makeInkPass();
  composer.insertPass(ink, 1); // straight after the scene is drawn, before glow and the final colour pass
  ink.enabled = false;
  toonState = { on: false, ramp, ink, cache: new Map(), frame: 0, clouds: null };
  return toonState;
}

function toonMaterial(m) {
  const st = toonState;
  if (m && m.isMeshToonMaterial && toonOrig.has(m)) return toonSync(m, toonOrig.get(m));
  if (!m || m.isMeshToonMaterial || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return m;
  let t = st.cache.get(m);
  if (!t) {
    t = new THREE.MeshToonMaterial({
      color: m.color.clone(), map: m.map || null, vertexColors: m.vertexColors, side: m.side, transparent: m.transparent,
      opacity: m.opacity, alphaTest: m.alphaTest, alphaMap: m.alphaMap || null, gradientMap: st.ramp, fog: m.fog,
      emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0), emissiveMap: m.emissiveMap || null,
      emissiveIntensity: m.emissiveIntensity ?? 1, depthWrite: m.depthWrite,
    });
    st.cache.set(m, t); toonOrig.set(t, m);
  }
  return toonSync(t, m);
}
// The original may have been recoloured or repainted since (a board design, a team colour).
function toonSync(t, m) {
  t.color.copy(m.color);
  if (t.map !== (m.map || null)) { t.map = m.map || null; t.needsUpdate = true; }
  return t;
}

// Swap in cartoon materials on everything currently in the scene (or put the originals back).
function toonSweep(on) {
  scene.traverse(o => {
    if (!o.isMesh || o === skyMesh) return;
    if (Array.isArray(o.material)) o.material = o.material.map(m => on ? toonMaterial(m) : (toonOrig.get(m) || m));
    else o.material = on ? toonMaterial(o.material) : (toonOrig.get(o.material) || o.material);
  });
}

// Called at the end of buildVenue.
function setToon(id) {
  const st = toonInit(), on = TOON_VENUES.has(id);
  if (st.clouds) { scene.remove(st.clouds); disposeTree(st.clouds); st.clouds = null; }
  st.on = on; st.ink.enabled = on;
  toonSweep(on);
  if (!on) return;
  // cartoon shading lights flat faces fully, so the lights come down a little
  sun.intensity *= 0.55; hemi.intensity *= 0.85;
  if (id === "backyard") { // a brighter cartoon sky (other courts keep their own: sunset, snow, night...)
    skyU.top.value.set(0.12, 0.42, 0.95); skyU.mid.value.set(0.42, 0.72, 1.0); skyU.horizon.value.set(0.82, 0.93, 1.0); skyU.sunGlow.value = 0.6;
    scene.fog.color.setHex(0xcfe6ff); scene.fog.near = 420; scene.fog.far = 1500;
  }
  if (VENUE_LOOK[id].night < 0.5) { st.clouds = toonClouds(); scene.add(st.clouds); } // puffy clouds by day
}

// Big puffy clouds in a ring around the court.
function toonClouds() {
  const g = new THREE.Group(), r = rng(1234);
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0x6a7a96, gradientMap: toonState.ramp, fog: false });
  const geo = new THREE.IcosahedronGeometry(1, 3);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + r() * 0.3, d = 420 + r() * 120, c = new THREE.Group();
    c.position.set(Math.sin(a) * d, 70 + r() * 70, -15 + Math.cos(a) * d); c.rotation.y = a;
    const n = 4 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const s = 14 + r() * 14, m = new THREE.Mesh(geo, mat);
      m.position.set((k - n / 2) * 17 + r() * 6, (r() - 0.3) * 8, (r() - 0.5) * 10); m.scale.set(s * 1.25, s * 0.9, s);
      c.add(m);
    }
    g.add(c);
  }
  return g;
}

// Ink outlines: the scene is drawn once more with each surface's direction as its colour (plus depth), and an
// outline goes wherever depth jumps or the surface turns sharply. Lines fade out in the distance.
function makeInkPass() { // (a function, so the class exists whenever the game first asks for it)
return new (class InkPass extends Pass {
  constructor() {
    super();
    this.normalMat = new THREE.MeshNormalMaterial();
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.target.depthTexture.type = THREE.UnsignedIntType;
    this.hidden = [];
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tNormal: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() },
        cameraNear: { value: 0.1 }, cameraFar: { value: 2200 }, width: { value: 1 }, strength: { value: 0.85 },
        ink: { value: new THREE.Color(0x141a2a) }, sat: { value: 1.0 },
      },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `#include <packing>
        uniform sampler2D tDiffuse, tNormal, tDepth; uniform vec2 texel; uniform float cameraNear, cameraFar, width, strength, sat; uniform vec3 ink;
        varying vec2 vUv;
        float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
        void main() {
          vec4 col = texture2D(tDiffuse, vUv);
          float l = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
          col.rgb = max(mix(vec3(l), col.rgb, sat), 0.0);
          float raw = texture2D(tDepth, vUv).x;
          if (raw < 0.99999) {
            float d0 = viewZ(vUv);
            vec3 n0 = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
            float e = 0.0;
            for (int k = 0; k < 4; k++) {
              vec2 o = k == 0 ? vec2(texel.x, 0.0) : k == 1 ? vec2(-texel.x, 0.0) : k == 2 ? vec2(0.0, texel.y) : vec2(0.0, -texel.y);
              vec2 uv = vUv + o * width;
              float d = viewZ(uv);
              vec3 n = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
              e = max(e, clamp(((d - d0) / d0 - 0.035) * 14.0, 0.0, 1.0));
              e = max(e, clamp((1.0 - dot(n, n0) - 0.35) * 3.0, 0.0, 1.0));
            }
            e *= 1.0 - smoothstep(70.0, 230.0, d0);
            col.rgb = mix(col.rgb, ink, e * strength);
          }
          gl_FragColor = col;
        }`,
    }));
  }
  setSize(w, h) { this.target.setSize(w, h); this.quad.material.uniforms.texel.value.set(1 / w, 1 / h); }
  render(renderer, writeBuffer, readBuffer) {
    // Draw only solid surfaces into the outline pass: no sky, glows, sparkles, lines or see-through guides.
    const hide = this.hidden; hide.length = 0;
    scene.traverseVisible(o => {
      if (o === skyMesh || o.isSprite || o.isPoints || o.isLine) { hide.push(o); return; }
      if (o.isMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && (m.transparent || m.isShaderMaterial || m.isMeshBasicMaterial)) hide.push(o); }
    });
    for (const o of hide) o.visible = false;
    const bg = scene.background, ov = scene.overrideMaterial, auto = renderer.shadowMap.autoUpdate, fog = scene.fog;
    scene.background = null; scene.overrideMaterial = this.normalMat; renderer.shadowMap.autoUpdate = false; scene.fog = null;
    renderer.setRenderTarget(this.target); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, camera);
    scene.background = bg; scene.overrideMaterial = ov; renderer.shadowMap.autoUpdate = auto; scene.fog = fog;
    for (const o of hide) o.visible = true;
    const u = this.quad.material.uniforms;
    u.tDiffuse.value = readBuffer.texture; u.tNormal.value = this.target.texture; u.tDepth.value = this.target.depthTexture;
    u.cameraNear.value = camera.near; u.cameraFar.value = camera.far; u.width.value = Math.max(1, renderer.getPixelRatio());
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
})();
}

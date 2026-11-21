
// ───────────────────────── Sound: effects and venue ambience (Web Audio, starts after the first tap)
// Two volume buses: effects (sfx + venue ambience) and music, each with its own on/off setting.
let audio = null, master = null, musicBus = null, noiseBuf = null, amb = null, wantAmb = null;
const pref = (k, d) => { try { const v = localStorage.getItem("backyard-cornhole." + k); return v === null ? d : v === "1"; } catch (e) { return d; } };
let sfxOn = pref("sfx", !pref("muted", false)), musicOn = pref("music", true);
// Volumes (0–1) from the Settings tab, on top of the on/off switches.
const vol = (k, d) => { try { const v = parseFloat(localStorage.getItem("backyard-cornhole." + k)); return isNaN(v) ? d : clamp(v, 0, 1); } catch (e) { return d; } };
let sfxVol = vol("sfxVol", 1), musicVol = vol("musicVol", 1);
function setVolume(kind, v) {
  v = clamp(v, 0, 1);
  if (kind === "music") musicVol = v; else sfxVol = v;
  try { localStorage.setItem("backyard-cornhole." + (kind === "music" ? "musicVol" : "sfxVol"), String(v)); } catch (e) { /* ignore */ }
  if (audio) { master.gain.setTargetAtTime(sfxOn ? 0.9 * sfxVol : 0, audio.currentTime, 0.05); musicBus.gain.setTargetAtTime(musicOn ? 0.55 * musicVol : 0, audio.currentTime, 0.05); }
}
function initAudio() {
  try {
    if (!audio) {
      try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) { /* ignore */ } // muted by the silent switch (or Silent Mode on the Action button), mixes with the player's own music
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.gain.value = sfxOn ? 0.9 * sfxVol : 0; master.connect(audio.destination);
      musicBus = audio.createGain(); musicBus.gain.value = musicOn ? 0.55 * musicVol : 0; musicBus.connect(audio.destination);
    }
    audio.resume(); loadSfx();
    if (wantAmb && !amb) startAmbience(wantAmb);
    if (musicOn) startMusic();
  } catch (e) { audio = null; }
}
function setSfx(on) {
  sfxOn = on;
  try { localStorage.setItem("backyard-cornhole.sfx", on ? "1" : "0"); } catch (e) { /* ignore */ }
  if (master) master.gain.setTargetAtTime(on ? 0.9 * sfxVol : 0, audio.currentTime, 0.05);
}
function setMusic(on) {
  musicOn = on;
  try { localStorage.setItem("backyard-cornhole.music", on ? "1" : "0"); } catch (e) { /* ignore */ }
  if (!musicBus) return;
  musicBus.gain.setTargetAtTime(on ? 0.55 * musicVol : 0, audio.currentTime, 0.1);
  if (on) startMusic(); else setTimeout(() => { if (!musicOn) stopMusic(); }, 400);
}
// ── Music: real recorded tracks (web/assets/music, from Pixabay), looped. The menus play the clubhouse song; it fades
// out when a match starts and back in on the clubhouse.
const MUSIC_FILES = { hub: "assets/music/hub-music.mp3" };
const MUSIC_LEVEL = 0.75;
let musicWant = "hub", musicPlaying = null;
const musicBufs = {}, musicLoading = {};
function loadMusic(k) {
  if (!audio || musicBufs[k] || musicLoading[k] || !MUSIC_FILES[k]) return;
  musicLoading[k] = true;
  fetch(MUSIC_FILES[k]).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(b => new Promise((res, rej) => audio.decodeAudioData(b, res, rej)))
    .then(buf => { musicBufs[k] = buf; if (musicWant === k) startMusic(); })
    .catch(() => { musicLoading[k] = false; });
}
function startMusic() {
  if (!audio || !musicOn || musicPlaying || !musicWant) return;
  const buf = musicBufs[musicWant];
  if (!buf) { loadMusic(musicWant); return; }
  const src = audio.createBufferSource(), g = audio.createGain(), t = audio.currentTime;
  src.buffer = buf; src.loop = true;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, t + 1.2);
  src.connect(g).connect(musicBus); src.start();
  musicPlaying = { src, g };
}
function stopMusic(fade = 0.4) {
  if (!musicPlaying) return;
  const { src, g } = musicPlaying, t = audio.currentTime; musicPlaying = null;
  try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(0.0001, t + fade); src.stop(t + fade + 0.05); } catch (e) { /* ignore */ }
}
// Which song should be playing now: "hub" in the menus, null (fade out) once a match starts.
function musicScene(k) {
  if (musicWant === k) return;
  musicWant = k; stopMusic(k ? 0.5 : 2.5);
  if (k) startMusic();
}
function noise() {
  if (!noiseBuf) {
    const n = audio.sampleRate * 2; noiseBuf = audio.createBuffer(1, n, audio.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
// Filtered noise burst: thumps, whooshes, cheers, crackles.
function burst({ dur, freq, q = 0.8, vol, type = "lowpass", when = 0, attack = 0.004, sweep = 0 }) {
  if (!audio) return;
  const t0 = audio.currentTime + when, src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = noise(); src.loop = true;
  f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master); src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
}
function tone(freq, dur, type = "sine", vol = 0.25, when = 0, slideTo = 0) {
  if (!audio) return;
  const t0 = audio.currentTime + when, o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
// Recorded effects (web/assets/sfx, from Pixabay). Each falls back to its made-up sound until it has loaded.
const SFX_FILES = { thudHard: "assets/sfx/thud-hard.mp3", soft1: "assets/sfx/thud-soft1.mp3", soft2: "assets/sfx/thud-soft2.mp3", soft3: "assets/sfx/thud-soft3.mp3", soft4: "assets/sfx/thud-soft4.mp3", scrape: "assets/sfx/scrape.mp3", ground: "assets/sfx/ground.mp3", cheer: "assets/sfx/cheer.mp3" };
const sfxBufs = {}, sfxLoading = {};
function loadSfx() {
  if (!audio) return;
  for (const k in SFX_FILES) {
    if (sfxBufs[k] || sfxLoading[k]) continue;
    sfxLoading[k] = true;
    fetch(SFX_FILES[k]).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => new Promise((res, rej) => audio.decodeAudioData(b, res, rej)))
      .then(buf => { sfxBufs[k] = buf; }).catch(() => { sfxLoading[k] = false; });
  }
}
function playSample(k, vol = 1, rate = 1, when = 0, fadeOver = 0, attack = 0) {
  if (!audio || !sfxBufs[k]) return false;
  const src = audio.createBufferSource(), g = audio.createGain(), t = audio.currentTime + when;
  src.buffer = sfxBufs[k]; src.playbackRate.value = rate;
  if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); } else g.gain.setValueAtTime(vol, t);
  if (fadeOver) { g.gain.setValueAtTime(vol, t + fadeOver * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + fadeOver); }
  src.connect(g).connect(master); src.start(t); if (fadeOver) src.stop(t + fadeOver + 0.05);
  return true;
}
const sfx = {
  // a lob that comes down steep hits the wood hard: the recorded thud, louder the faster it drops
  // an ordinary landing (or one bag bumping another): one of four soft thuds, so repeats don't sound the same
  softThud: (vol = 0.8) => { if (!playSample("soft" + (1 + Math.floor(Math.random() * 4)), vol, 0.95 + Math.random() * 0.1)) sfx.thud(); },
  // the bag sliding along the wood: louder and longer the faster it slides (silent when it barely moves)
  scrape: speed => { if (speed < 2.5) return; const secs = clamp(speed / 11, 0.3, 1.1); playSample("scrape", clamp(speed / 14, 0.2, 0.7), clamp(0.55 / secs, 0.75, 1.15), 0.04, secs); },
  hardThud: (down = 20) => { if (!playSample("thudHard", clamp(0.55 + down / 60, 0.55, 1), 0.94 + Math.random() * 0.12)) sfx.thud(); },
  tick: () => tone(1250, 0.035, "square", 0.04),
  whoosh: () => burst({ dur: 0.38, freq: 900, q: 0.7, vol: 0.22, type: "bandpass", attack: 0.12, sweep: 2.4 }),
  thud: () => { burst({ dur: 0.16, freq: 520, vol: 0.9, sweep: 0.4 }); tone(95, 0.14, "sine", 0.55, 0, 50); },   // canvas bag on plywood
  grass: () => playSample("ground", 0.7, 0.95 + Math.random() * 0.1) || burst({ dur: 0.14, freq: 1400, vol: 0.35, sweep: 0.5 }),
  // the recorded crowd: bigger moments cheer louder and longer
  cheer: (len = 1.6, vol = 0.3) => playSample("cheer", clamp(vol * 2.4, 0.4, 1), 0.97 + Math.random() * 0.06, 0, len + 3.4, 0.35) || (burst({ dur: len, freq: 1200, q: 0.5, vol, type: "bandpass", attack: 0.25 }), burst({ dur: len * 0.8, freq: 2600, q: 0.6, vol: vol * 0.5, type: "bandpass", attack: 0.2, when: 0.05 })),
  hole: () => { burst({ dur: 0.22, freq: 260, vol: 0.7, sweep: 0.3 }); sfx.cheer(1.5, 0.22); },
  boom: () => { burst({ dur: 0.9, freq: 160, vol: 0.9, sweep: 0.35 }); for (let k = 0; k < 7; k++) burst({ dur: 0.05, freq: 3000 + Math.random() * 3000, vol: 0.12, type: "highpass", when: 0.25 + Math.random() * 0.6 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, "triangle", 0.2, i * 0.12)); sfx.cheer(2.2, 0.3); },
};
// Looping background for each venue: wind that matches its speed, surf at the beach, a crowd at the stadium.
function setAmbience(opts) {
  wantAmb = opts;
  if (amb) { const old = amb; amb = null; try { old.gain.gain.setTargetAtTime(0.0001, audio.currentTime, 0.3); setTimeout(() => old.nodes.forEach(n => { try { n.stop ? n.stop() : 0; n.disconnect(); } catch (e) { /* ignore */ } }), 1500); } catch (e) { /* ignore */ } }
  if (audio && opts) startAmbience(opts);
}
function startAmbience({ wind = 0, surf = false, crowd = false, night = false, fire = false }) {
  const out = audio.createGain(); out.gain.value = 0.0001; out.connect(master);
  const nodes = [out];
  const layer = (type, freq, q, vol, lfoRate, lfoDepth) => {
    const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = noise(); src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    src.connect(f).connect(g).connect(out); src.start(0, Math.random() * 2);
    nodes.push(src, f, g);
    if (lfoRate) { const l = audio.createOscillator(), lg = audio.createGain(); l.frequency.value = lfoRate; lg.gain.value = lfoDepth; l.connect(lg).connect(g.gain); l.start(); nodes.push(l, lg); }
  };
  // (The hissy wind and crowd layers sounded like waves and heavy rain, so they're gone until real recordings replace them.)
  if (surf) layer("lowpass", 600, 0.5, 0.07, 0.11, 0.06);
  if (night) layer("highpass", 5200, 3, 0.012, 3.2, 0.01); // crickets-ish shimmer
  if (fire) { layer("lowpass", 240, 0.7, 0.05, 0.4, 0.02); layer("bandpass", 3200, 1.5, 0.018, 7.3, 0.016); } // crackling fire
  out.gain.setTargetAtTime(1, audio.currentTime, 0.8);
  amb = { gain: out, nodes };
}

// Start the sound on the very first touch anywhere (phones only allow audio after a tap), and right away if allowed.
["pointerdown", "touchstart", "keydown"].forEach(ev => window.addEventListener(ev, function first() { initAudio(); ["pointerdown", "touchstart", "keydown"].forEach(e => window.removeEventListener(e, first, true)); }, true));
try { initAudio(); } catch (e) { /* ignore */ }
document.addEventListener("visibilitychange", () => { if (!document.hidden && audio) audio.resume(); });

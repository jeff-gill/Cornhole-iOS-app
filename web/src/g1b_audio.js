
// ───────────────────────── Sound: effects and venue ambience (Web Audio, starts after the first tap)
// Two volume buses: effects (sfx + venue ambience) and music, each with its own on/off setting.
let audio = null, master = null, musicBus = null, noiseBuf = null, amb = null, wantAmb = null;
const pref = (k, d) => { try { const v = localStorage.getItem("backyard-cornhole." + k); return v === null ? d : v === "1"; } catch (e) { return d; } };
let sfxOn = pref("sfx", !pref("muted", false)), musicOn = pref("music", true);
function initAudio() {
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.gain.value = sfxOn ? 0.9 : 0; master.connect(audio.destination);
      musicBus = audio.createGain(); musicBus.gain.value = musicOn ? 0.55 : 0; musicBus.connect(audio.destination);
    }
    audio.resume();
    if (wantAmb && !amb) startAmbience(wantAmb);
    if (musicOn) startMusic();
  } catch (e) { audio = null; }
}
function setSfx(on) {
  sfxOn = on;
  try { localStorage.setItem("backyard-cornhole.sfx", on ? "1" : "0"); } catch (e) { /* ignore */ }
  if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, audio.currentTime, 0.05);
}
function setMusic(on) {
  musicOn = on;
  try { localStorage.setItem("backyard-cornhole.music", on ? "1" : "0"); } catch (e) { /* ignore */ }
  if (!musicBus) return;
  musicBus.gain.setTargetAtTime(on ? 0.55 : 0, audio.currentTime, 0.1);
  if (on) startMusic(); else setTimeout(() => { if (!musicOn) stopMusic(); }, 400);
}
// ── Music: a light, sunny backyard loop (C, G, Am, F) scheduled a little ahead of time.
let musicTimer = null, musicStep = 0, musicNext = 0;
const BPM = 100, EIGHTH = 60 / BPM / 2;
const PROG = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
function mnote(freq, dur, type, vol, t, attack = 0.01) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
}
function mhat(t, vol) {
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = noise(); f.type = "highpass"; f.frequency.value = 7000;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(f).connect(g).connect(musicBus); src.start(t, Math.random()); src.stop(t + 0.07);
}
const MELODY = [0, null, 2, 1, null, 2, 0, null]; // chord-tone pattern for the plucky lead
function musicStepAt(i, t) {
  const bar = Math.floor(i / 8) % 4, beat = i % 8, ch = PROG[bar];
  if (beat === 0) ch.forEach(n => mnote(hz(n), EIGHTH * 7.6, "triangle", 0.035, t, 0.08));          // soft pad
  if (beat % 2 === 0) mnote(hz(ch[0] - 12 + (beat === 4 ? 7 : 0)), EIGHTH * 1.7, "sine", 0.16, t);  // bouncy bass
  const m = MELODY[beat];
  if (m !== null && Math.floor(i / 32) % 2 === 1) mnote(hz(ch[m] + 12), EIGHTH * 0.9, "square", 0.018, t); // lead on alternate passes
  mhat(t, beat % 2 ? 0.025 : 0.012);
  if (beat === 4) { const s2 = audio.createBufferSource(), f2 = audio.createBiquadFilter(), g2 = audio.createGain(); // clap
    s2.buffer = noise(); f2.type = "bandpass"; f2.frequency.value = 1600; g2.gain.setValueAtTime(0.06, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s2.connect(f2).connect(g2).connect(musicBus); s2.start(t, Math.random()); s2.stop(t + 0.15); }
}
function startMusic() {
  if (!audio || musicTimer) return;
  musicNext = audio.currentTime + 0.12;
  musicTimer = setInterval(() => {
    while (musicNext < audio.currentTime + 0.3) { musicStepAt(musicStep, musicNext); musicNext += EIGHTH; musicStep = (musicStep + 1) % 64; }
  }, 60);
}
function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
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
const sfx = {
  tick: () => tone(1250, 0.035, "square", 0.04),
  whoosh: () => burst({ dur: 0.38, freq: 900, q: 0.7, vol: 0.22, type: "bandpass", attack: 0.12, sweep: 2.4 }),
  thud: () => { burst({ dur: 0.16, freq: 520, vol: 0.9, sweep: 0.4 }); tone(95, 0.14, "sine", 0.55, 0, 50); },   // canvas bag on plywood
  grass: () => burst({ dur: 0.14, freq: 1400, vol: 0.35, sweep: 0.5 }),
  cheer: (len = 1.6, vol = 0.3) => { burst({ dur: len, freq: 1200, q: 0.5, vol, type: "bandpass", attack: 0.25 }); burst({ dur: len * 0.8, freq: 2600, q: 0.6, vol: vol * 0.5, type: "bandpass", attack: 0.2, when: 0.05 }); },
  hole: () => { burst({ dur: 0.22, freq: 260, vol: 0.7, sweep: 0.3 }); tone(523, 0.14, "triangle", 0.22, 0.06); tone(784, 0.32, "triangle", 0.22, 0.18); sfx.cheer(1.5, 0.22); },
  boom: () => { burst({ dur: 0.9, freq: 160, vol: 0.9, sweep: 0.35 }); for (let k = 0; k < 7; k++) burst({ dur: 0.05, freq: 3000 + Math.random() * 3000, vol: 0.12, type: "highpass", when: 0.25 + Math.random() * 0.6 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, "triangle", 0.2, i * 0.12)); sfx.cheer(2.2, 0.3); },
};
// Looping background for each venue: wind that matches its speed, surf at the beach, a crowd at the stadium.
function setAmbience(opts) {
  wantAmb = opts;
  if (amb) { const old = amb; amb = null; try { old.gain.gain.setTargetAtTime(0.0001, audio.currentTime, 0.3); setTimeout(() => old.nodes.forEach(n => { try { n.stop ? n.stop() : 0; n.disconnect(); } catch (e) { /* ignore */ } }), 1500); } catch (e) { /* ignore */ } }
  if (audio && opts) startAmbience(opts);
}
function startAmbience({ wind = 0, surf = false, crowd = false, night = false }) {
  const out = audio.createGain(); out.gain.value = 0.0001; out.connect(master);
  const nodes = [out];
  const layer = (type, freq, q, vol, lfoRate, lfoDepth) => {
    const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = noise(); src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    src.connect(f).connect(g).connect(out); src.start(0, Math.random() * 2);
    nodes.push(src, f, g);
    if (lfoRate) { const l = audio.createOscillator(), lg = audio.createGain(); l.frequency.value = lfoRate; lg.gain.value = lfoDepth; l.connect(lg).connect(g.gain); l.start(); nodes.push(l, lg); }
  };
  if (wind > 0) layer("lowpass", 300 + wind * 40, 0.6, 0.05 + wind * 0.012, 0.13, 0.02 + wind * 0.006);
  if (surf) layer("lowpass", 700, 0.5, 0.12, 0.11, 0.1);
  if (crowd) { layer("bandpass", 900, 0.6, 0.07, 0.07, 0.025); layer("bandpass", 2200, 0.8, 0.025, 0.05, 0.01); }
  if (night) layer("highpass", 5200, 3, 0.012, 3.2, 0.01); // crickets-ish shimmer
  out.gain.setTargetAtTime(1, audio.currentTime, 0.8);
  amb = { gain: out, nodes };
}

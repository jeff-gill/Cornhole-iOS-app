
// ───────────────────────── Sound: effects and venue ambience (Web Audio, starts after the first tap)
let audio = null, master = null, noiseBuf = null, amb = null, wantAmb = null;
let muted = false;
try { muted = localStorage.getItem("backyard-cornhole.muted") === "1"; } catch (e) { /* ignore */ }
function initAudio() {
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(audio.destination);
    }
    audio.resume();
    if (wantAmb && !amb) startAmbience(wantAmb);
  } catch (e) { audio = null; }
}
function setMuted(m) {
  muted = m;
  try { localStorage.setItem("backyard-cornhole.muted", m ? "1" : "0"); } catch (e) { /* ignore */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, audio.currentTime, 0.05);
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

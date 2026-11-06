import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// ───────────────────────── Helpers
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
// Court feet (x lateral, y down-range, z up) -> three.js world (y up, down-range is -z).
const W = (x, y, z) => new THREE.Vector3(x, z, -y);
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shade(hex, amt) { // lighten (amt > 0) or darken (amt < 0) a #rrggbb colour
  const n = parseInt(hex.slice(1), 16), f = c => Math.round(clamp(amt > 0 ? c + (255 - c) * amt : c * (1 + amt), 0, 255));
  return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, "0")).join("");
}

// ───────────────────────── Career content
// Twelve courts, each a new location. Higher courts: stronger steady wind, faster arrow, smaller sweet spot, slicker boards,
// better opponents. Each court has its own star track: win stars there until it's full (max) to open the next court.
// A win pays the pot (both buy-ins). Tuned with simulated throws: a good player sinks about 40% at the Backyard and
// about 20% on the last courts with the starter bag.
const VENUES = [
  { id: "backyard", name: "Backyard", sub: "Where it all starts", max: 20, fee: 50, win: 3, loss: 2, swing: 0.55, zone: 0.06, wob: 0.012, cpu: [0.22, 0.13], mu: 0.35, wind: [0, 3], speed: "Normal boards" },
  { id: "tailgate", name: "Tailgate Lot", sub: "Game-day parking lot", max: 50, fee: 200, win: 6, loss: 4, swing: 0.62, zone: 0.052, wob: 0.018, cpu: [0.17, 0.105], mu: 0.33, wind: [2, 6], speed: "Normal boards" },
  { id: "beach", name: "Beach Shack", sub: "Sea breeze and sandy boards", max: 100, fee: 800, win: 9, loss: 6, swing: 0.70, zone: 0.047, wob: 0.024, cpu: [0.13, 0.085], mu: 0.40, wind: [4, 10], speed: "Grippy boards" },
  { id: "brewery", name: "Pizza Patio", sub: "League night under the lights", max: 200, fee: 3000, win: 12, loss: 8, swing: 0.77, zone: 0.043, wob: 0.030, cpu: [0.11, 0.07], mu: 0.30, wind: [5, 11], speed: "Slick boards" },
  { id: "lodge", name: "Mountain Lodge", sub: "Snowfall and frozen fingers", max: 300, fee: 10000, win: 15, loss: 10, swing: 0.83, zone: 0.040, wob: 0.035, cpu: [0.10, 0.062], mu: 0.26, wind: [6, 13], speed: "Icy boards" },
  { id: "bonfire", name: "Bonfire Beach", sub: "Sunset tournament by the fire", max: 500, fee: 30000, win: 18, loss: 13, swing: 0.88, zone: 0.038, wob: 0.039, cpu: [0.09, 0.056], mu: 0.36, wind: [7, 14], speed: "Damp boards" },
  { id: "island", name: "Island Hop", sub: "Throw across the water to the next island", max: 600, fee: 100000, win: 20, loss: 16, swing: 0.92, zone: 0.036, wob: 0.042, cpu: [0.085, 0.052], mu: 0.31, wind: [9, 18], speed: "Sandy boards" },
  { id: "rooftop", name: "City Rooftop", sub: "Skyline lights and swirling wind", max: 700, fee: 300000, win: 22, loss: 19, swing: 0.96, zone: 0.035, wob: 0.045, cpu: [0.08, 0.048], mu: 0.29, wind: [9, 17], speed: "Slick boards" },
  { id: "lakeside", name: "Lakeside Dock", sub: "Morning mist on the lake", max: 800, fee: 1000000, win: 25, loss: 25, swing: 1.0, zone: 0.034, wob: 0.047, cpu: [0.076, 0.045], mu: 0.33, wind: [8, 15], speed: "Dewy boards" },
  { id: "canyon", name: "Desert Canyon", sub: "Red rock, hot gusts", max: 900, fee: 3000000, win: 30, loss: 32, swing: 1.03, zone: 0.033, wob: 0.049, cpu: [0.072, 0.042], mu: 0.37, wind: [10, 19], speed: "Dusty boards" },
  { id: "carnival", name: "County Fair", sub: "Ferris wheel and midway lights", max: 1000, fee: 10000000, win: 38, loss: 42, swing: 1.06, zone: 0.032, wob: 0.051, cpu: [0.068, 0.039], mu: 0.28, wind: [9, 17], speed: "Fast boards" },
  { id: "stadium", name: "Stadium Finals", sub: "The big show", max: 1100, fee: 30000000, win: 48, loss: 54, swing: 1.09, zone: 0.031, wob: 0.053, cpu: [0.064, 0.036], mu: 0.27, wind: [10, 18], speed: "Fast pro boards" },
];
const pot = v => v.fee * 2;
const starsForWin = vi => VENUES[vi].win, starsForLoss = vi => VENUES[vi].loss;
// Stars needed in total (all courts so far) to open court vi: the "Total to advance" column.
const starsToReach = vi => VENUES.slice(0, vi).reduce((t, v) => t + v.max, 0);
// The house covers your Backyard buy-in if you're short, so you can never get stuck.
const houseCovers = vi => vi === 0 && career.coins < VENUES[0].fee;
// Twenty coin bags. Prices about double each step (100 coins to 100 million), so each court's winnings buy the next tier
// or two; the Gold Standard takes a few wins at the last court. Stats rise gradually; a few mid-price bags are specialists.
const BAGS = [
  { id: "starter", name: "Duck Cloth", price: 0, acc: 1, ctrl: 1, spin: 1, feel: "neutral", c: "#ff4b3a", pattern: "plain" },
  { id: "backyard", name: "Backyard Pro", price: 100, acc: 2, ctrl: 1, spin: 1, feel: "neutral", c: "#ff8a1f", pattern: "stripe" },
  { id: "picnic", name: "Picnic Plaid", price: 220, acc: 1, ctrl: 2, spin: 2, feel: "sticky", c: "#d62828", pattern: "plaid" },
  { id: "lemonade", name: "Lemonade", price: 460, acc: 2, ctrl: 2, spin: 1, feel: "neutral", c: "#f2c230", pattern: "dots" },
  { id: "camo", name: "Camo Crew", price: 1000, acc: 2, ctrl: 2, spin: 2, feel: "sticky", c: "#5b7a3a", pattern: "camo" },
  { id: "skychev", name: "Sky Chevron", price: 2200, acc: 2, ctrl: 3, spin: 2, feel: "neutral", c: "#2f86ff", pattern: "chevron" },
  { id: "zigzag", name: "Zigzag", price: 4600, acc: 3, ctrl: 2, spin: 2, feel: "fast", c: "#0fb5a5", pattern: "zigzag" },
  { id: "twotone", name: "Two-Tone", price: 10000, acc: 3, ctrl: 3, spin: 2, feel: "neutral", c: "#8a3ffc", pattern: "split" },
  { id: "bullseye", name: "Bullseye", price: 22000, acc: 3, ctrl: 2, spin: 3, feel: "neutral", c: "#e8392b", pattern: "target" },
  { id: "slick", name: "Slick Rick", price: 46000, acc: 3, ctrl: 3, spin: 3, feel: "fast", c: "#a24bff", pattern: "chevron" },
  { id: "sticky", name: "Sticky Fingers", price: 100000, acc: 3, ctrl: 4, spin: 3, feel: "sticky", c: "#2fbf71", pattern: "dots" },
  { id: "diamond", name: "Diamond Back", price: 220000, acc: 4, ctrl: 3, spin: 3, feel: "neutral", c: "#1f3a6e", pattern: "diamond" },
  { id: "twister", name: "Twister", price: 460000, acc: 3, ctrl: 3, spin: 5, feel: "neutral", c: "#00b8c8", pattern: "swirl" },
  { id: "thunder", name: "Thunder", price: 1000000, acc: 4, ctrl: 4, spin: 3, feel: "fast", c: "#f2b705", pattern: "bolt" },
  { id: "royal", name: "Royal", price: 2200000, acc: 4, ctrl: 4, spin: 4, feel: "neutral", c: "#6a2c91", pattern: "diamond" },
  { id: "laser", name: "Laser", price: 4600000, acc: 5, ctrl: 4, spin: 3, feel: "fast", c: "#ff2e88", pattern: "bolt" },
  { id: "midnight", name: "Midnight", price: 10000000, acc: 4, ctrl: 5, spin: 4, feel: "sticky", c: "#14214a", pattern: "star" },
  { id: "champion", name: "Champion", price: 22000000, acc: 5, ctrl: 4, spin: 5, feel: "neutral", c: "#c8102e", pattern: "star" },
  { id: "platinum", name: "Platinum", price: 46000000, acc: 5, ctrl: 5, spin: 4, feel: "neutral", c: "#9aa4b2", pattern: "diamond" },
  { id: "gold", name: "Gold Standard", price: 100000000, acc: 5, ctrl: 5, spin: 5, feel: "neutral", c: "#f2b705", pattern: "star" },
];
// Premium items come only from the Store (real money). Exclusive looks; stats are good but never better than the
// best coin bag, so nobody can buy wins.
const PID = s => "com.jeffgill.cornhole." + s;
BAGS.push(
  { id: "firecracker", name: "Firecracker", premium: PID("starterpack"), acc: 3, ctrl: 3, spin: 3, feel: "fast", c: "#e8392b", pattern: "flame" },
  { id: "galaxy", name: "Galaxy", premium: PID("set.galaxy"), acc: 4, ctrl: 4, spin: 4, feel: "neutral", c: "#5b3bd6", pattern: "galaxy" },
  { id: "inferno", name: "Inferno", premium: PID("set.inferno"), acc: 4, ctrl: 4, spin: 4, feel: "fast", c: "#ff5a00", pattern: "flame" },
);
// Store products (prices are placeholders until the App Store reports the real, local ones).
const STORE = [
  { id: PID("coins.small"), kind: "coins", coins: 20000, price: "$0.99", title: "Handful of Coins", icon: "💵" },
  { id: PID("coins.medium"), kind: "coins", coins: 150000, price: "$4.99", title: "Bag of Coins", icon: "💰", tag: "BEST VALUE" },
  { id: PID("coins.large"), kind: "coins", coins: 500000, price: "$9.99", title: "Cooler of Coins", icon: "🧊" },
  { id: PID("coins.huge"), kind: "coins", coins: 2000000, price: "$19.99", title: "Truckload of Coins", icon: "🛻" },
  { id: PID("starterpack"), kind: "once", price: "$2.99", title: "Starter Pack", coins: 25000, grants: ["bag:firecracker", "board:neon"], tag: "ONE TIME ONLY", blurb: "25,000 coins + Firecracker bags + Neon Nights board" },
  { id: PID("set.galaxy"), kind: "once", price: "$3.99", title: "Galaxy Set", grants: ["bag:galaxy", "board:galaxyb", "trail:galaxy"], blurb: "Exclusive Galaxy bags and board, plus the Galaxy trail" },
  { id: PID("set.inferno"), kind: "once", price: "$3.99", title: "Inferno Set", grants: ["bag:inferno", "board:infernob", "trail:fire"], blurb: "Exclusive Inferno bags and board, plus the Fire trail" },
  { id: PID("caps.80"), kind: "caps", caps: 80, price: "$0.99", title: "Handful of Caps" },
  { id: PID("caps.450"), kind: "caps", caps: 450, price: "$4.99", title: "Bucket of Caps", tag: "BEST VALUE" },
  { id: PID("caps.1000"), kind: "caps", caps: 1000, price: "$9.99", title: "Crate of Caps" },
  { id: PID("caps.2200"), kind: "caps", caps: 2200, price: "$19.99", title: "Mountain of Caps" },
  { id: PID("lives5"), kind: "lives", lives: 5, price: "$1.99", title: "Book of Tickets", icon: "🎟️", blurb: "+5 lives, even past the usual 5" },
  { id: PID("can.gold"), kind: "can", can: "gold", price: "$2.99", title: "Golden Pop can", icon: "🥫", blurb: "5 prizes: coins and cards" },
  { id: PID("can.platinum"), kind: "can", can: "platinum", price: "$7.99", title: "Platinum Sparkle can", icon: "🥫", blurb: "7 prizes: coins and lots of cards" },
  { id: PID("trails"), kind: "once", price: "$1.99", title: "Trail Pack", grants: ["trail:sparkle", "trail:ice", "trail:stars", "trail:rainbow"], blurb: "Sparkle, Ice, Stars and Rainbow throw trails" },
];
// Throw effects: a trail behind your bag in flight (shop "Throw" tab).
const TRAILS = [
  { id: "none", name: "No Trail", price: 0, icon: "➖", blurb: "Just the bag" },
  { id: "smoke", name: "Smoke", price: 250, icon: "💨", blurb: "A puff of smoke behind the bag" },
  { id: "sparkle", name: "Sparkle", price: 800, icon: "✨", blurb: "Glittering sparks" },
  { id: "bubbles", name: "Bubbles", price: 2500, icon: "🫧", blurb: "A stream of bubbles" },
  { id: "confetti", name: "Confetti", price: 6000, icon: "🎊", blurb: "Party bits in your colours" },
  { id: "hearts", name: "Hearts", price: 15000, icon: "💖", blurb: "Love every throw" },
  { id: "fire", name: "Fire", price: 40000, icon: "🔥", blurb: "A flaming tail" },
  { id: "ice", name: "Ice", price: 100000, icon: "❄️", blurb: "Frosty crystals" },
  { id: "stars", name: "Stars", price: 250000, icon: "⭐", blurb: "Shooting stars" },
  { id: "lightning", name: "Lightning", price: 600000, icon: "⚡", blurb: "Crackling electricity" },
  { id: "neon", name: "Neon", price: 1500000, icon: "💡", blurb: "A glowing ribbon in your colour" },
  { id: "rainbow", name: "Rainbow", price: 4000000, icon: "🌈", blurb: "Every colour, all the way" },
  { id: "galaxy", name: "Galaxy", price: 10000000, icon: "🌌", blurb: "Stardust and nebula" },
  { id: "gold", name: "Gold Rush", price: 25000000, icon: "💰", blurb: "Spills gold coins" },
  { id: "comet", name: "Comet", price: 60000000, icon: "☄️", blurb: "A blazing comet tail" },
];
// Opponents and the second local player use these.
const RIVAL_BAGS = [
  { id: "rival", name: "Blue Duck", acc: 1, ctrl: 1, spin: 1, feel: "neutral", c: "#2f86ff", pattern: "plain" },
  { id: "rival2", name: "Navy Stripe", acc: 2, ctrl: 2, spin: 2, feel: "neutral", c: "#2456c9", pattern: "stripe" },
  { id: "rival3", name: "Teal Twist", acc: 3, ctrl: 3, spin: 3, feel: "fast", c: "#0f9fb5", pattern: "swirl" },
];
// Twenty coin boards (looks only), on a similar but gentler climb, plus the exclusive Store boards.
const BOARDS = [
  { id: "classic", name: "Classic Navy", price: 0, paint: "band", a: "#1f3a6e", b: "#ffc93a" },
  { id: "redband", name: "Red Band", price: 80, paint: "band", a: "#c8102e", b: "#ffffff" },
  { id: "lake", name: "Lake Blue", price: 180, paint: "fade", a: "#2f86ff", b: "#0fb5a5" },
  { id: "polka", name: "Polka Party", price: 380, paint: "polka", a: "#ff2e88", b: "#ffffff" },
  { id: "sunburst", name: "Sunburst", price: 800, paint: "sunburst", a: "#ff8a1f", b: "#ffd84a" },
  { id: "stripes", name: "Stars & Stripes", price: 1700, paint: "stripes", a: "#c8102e", b: "#ffffff", c: "#1f3a6e" },
  { id: "diag", name: "Diagonal Rush", price: 3600, paint: "diag", a: "#2f86ff", b: "#ffffff" },
  { id: "plaid", name: "Picnic Plaid", price: 8000, paint: "plaid", a: "#c8102e", b: "#1f3a6e" },
  { id: "sunset", name: "Sunset Fade", price: 17000, paint: "fade", a: "#ff7a3a", b: "#a83279" },
  { id: "camo", name: "Camo", price: 36000, paint: "camo", a: "#5b7a3a", b: "#3d5229" },
  { id: "checker", name: "Checkered Flag", price: 80000, paint: "checker", a: "#111111", b: "#ffffff" },
  { id: "chev", name: "Chevron Charge", price: 170000, paint: "chev", a: "#ffc93a", b: "#1f3a6e" },
  { id: "waves", name: "Ocean Waves", price: 360000, paint: "waves", a: "#0b74c9", b: "#7fd8ff" },
  { id: "target", name: "Bullseye", price: 800000, paint: "target", a: "#e8392b", b: "#ffffff" },
  { id: "split", name: "Split Decision", price: 1700000, paint: "split", a: "#8a3ffc", b: "#ffc93a" },
  { id: "retro", name: "Retro Rays", price: 3600000, paint: "sunburst", a: "#a83279", b: "#ff7a3a" },
  { id: "midband", name: "Midnight Band", price: 8000000, paint: "band", a: "#0d1430", b: "#9aa4b2" },
  { id: "tropic", name: "Tropical", price: 17000000, paint: "waves", a: "#ff2e88", b: "#ffd84a" },
  { id: "racing", name: "Racing Checker", price: 36000000, paint: "checker", a: "#c8102e", b: "#111111" },
  { id: "goldpro", name: "Gold Pro", price: 80000000, paint: "gold", a: "#151515", b: "#ffd84a" },
  { id: "neon", name: "Neon Nights", premium: PID("starterpack"), paint: "neon", a: "#0d0d1a", b: "#2ef2ff" },
  { id: "galaxyb", name: "Galaxy", premium: PID("set.galaxy"), paint: "galaxy", a: "#140a3a", b: "#b48cff" },
  { id: "infernob", name: "Inferno", premium: PID("set.inferno"), paint: "flames", a: "#1a0a05", b: "#ff7a1a" },
];
// Computer opponents go by player-style handles.
const OPPONENTS = ["SliderSam22", "airmail_annie", "BagBoss_Bob", "TailgateTina", "SandyShores7", "BigEarl88", "HoopsHannah", "the_professor",
  "LeftyLou", "SwishRod", "Cornelius_9", "FourBagFran", "KernelKing", "WoodyBoards", "BlockerBetty", "dirtbag_dave", "CornStar21",
  "PushShotPete", "AceHoleAmy", "Sir_Slides", "DropZoneDan", "Bagzilla", "HoleyMoly", "CornDog_77", "TossBoss", "ringer_rae",
  "BackyardBeast", "Kernel_Kate", "SlideRule", "LuckyLobs", "CornFlake_5", "ThrowdownTom"];
const FEEL = { sticky: { label: "Sticky", slide: 0.86 }, neutral: { label: "Neutral", slide: 1 }, fast: { label: "Fast", slide: 1.14 } };

// ───────────────────────── Saved career (this device only)
const SAVE_KEY = "backyard-cornhole.career.v1";
const fresh = () => ({ coins: 250, stars: 0, courtStars: {}, unlocked: ["backyard"], bags: ["starter"], bag: "starter", boards: ["classic"], board: "classic", venue: 0, wins: 0, losses: 0, tutorialDone: false, lastDaily: "", purchases: [], trails: ["none"], trail: "none", effects: ["confetti"], effect: "confetti", caps: 20, cans: [], cards: {}, lives: 5, livesAt: 0, alerts: false, avatar: "a0" });
// Inside the iPhone app, the native side injects the saved career and stores updates; in a browser, localStorage does.
const nativeBridge = (() => { try { return window.webkit && window.webkit.messageHandlers; } catch (e) { return null; } })();
function postNative(name, body) { try { if (nativeBridge && nativeBridge[name]) nativeBridge[name].postMessage(body); } catch (e) { /* not in the app */ } }
const haptic = kind => { if (career.haptics !== false) postNative("haptic", kind); };
let career = fresh();
try {
  const raw = window.__nativeCareer || localStorage.getItem(SAVE_KEY);
  if (raw) {
    const old = typeof raw === "string" ? JSON.parse(raw) : raw;
    career = { ...fresh(), ...old };
    if (old.tutorialDone === undefined && (old.wins || old.losses)) career.tutorialDone = true; // veterans skip the coach
    if (!old.courtStars) { // older saves had one star count: pour it into the courts in order
      let left = old.stars || 0;
      for (const v of VENUES) { const n = Math.min(v.max, left); if (n > 0) career.courtStars[v.id] = n; left -= n; }
      career.venue = 0;
    }
    career.courtStars = { ...career.courtStars };
    updateUnlocks();
  }
} catch (e) { /* storage unavailable: play without saving */ }
// Game Center leaderboards (in the iPhone app): total stars, wins and 4-baggers.
const postScores = () => postNative("score", JSON.stringify({ stars: career.stars, wins: career.wins, fourBaggers: career.fourBaggers || 0 }));
// Your handle: your own choice, else your Game Center name, else "guest-" and ten digits.
function myHandle() {
  if (!career.handle) { career.handle = "guest-" + String(Math.floor(Math.random() * 1e10)).padStart(10, "0"); save(); }
  return career.handle;
}
const HANDLE_RE = /^[A-Za-z0-9_.-]{3,16}$/;
function setHandle(h) { if (!HANDLE_RE.test(h)) return false; career.handle = h; career.handleSet = true; save(); return true; }
function save() {
  career.savedAt = Date.now(); // the iPhone app keeps whichever copy (device or iCloud) is newest
  const json = JSON.stringify(career);
  postNative("save", json);
  try { localStorage.setItem(SAVE_KEY, json); } catch (e) { /* ignore */ }
}
const bagById = id => BAGS.find(b => b.id === id) || RIVAL_BAGS.find(b => b.id === id) || BAGS[0];
const boardById = id => BOARDS.find(b => b.id === id) || BOARDS[0];
const venueUnlocked = i => career.unlocked.includes(VENUES[i].id);
function courtStars(i) { return career.courtStars[VENUES[i].id] || 0; }
// Filling a court's star track opens the next one (and it stays open).
function updateUnlocks() {
  const newly = [];
  career.stars = VENUES.reduce((t, v) => t + (career.courtStars[v.id] || 0), 0);
  VENUES.forEach((v, i) => { if (i && !career.unlocked.includes(v.id) && courtStars(i - 1) >= VENUES[i - 1].max) { career.unlocked.push(v.id); newly.push(v); } });
  return newly;
}
// Deliver a store purchase. Coin packs can be bought again; one-time items (and restores) never pay out twice.
function grantPurchase(id, restored) {
  const item = STORE.find(x => x.id === id);
  if (!item) return null;
  if (item.kind === "coins") { if (!restored) career.coins += item.coins; save(); return item; }
  if (item.kind === "caps") { if (!restored) career.caps += item.caps; save(); return item; }
  if (item.kind === "lives") { if (!restored) { career.lives += item.lives; scheduleLivesAlert(); } save(); return item; }
  if (item.kind === "can") { // bought cans skip the cooler limit
    if (!restored) career.cans.push({ id: item.can, court: VENUES.reduce((m, v, i) => (venueUnlocked(i) ? i : m), 0) });
    save(); return item;
  }
  if (career.purchases.includes(id)) return item;
  career.purchases.push(id);
  if (item.coins && !restored) career.coins += item.coins;
  for (const g of item.grants || []) {
    const [type, key] = g.split(":"), list = type === "bag" ? career.bags : type === "board" ? career.boards : career.trails;
    if (!list.includes(key)) list.push(key);
  }
  save();
  return item;
}

// ───────────────────────── Game state
const S = {
  kind: "career", venue: 0, opponent: null, names: ["You", "CPU"], gear: [BAGS[0], RIVAL_BAGS[0]], cpuSide: 1,
  world: new World(), scores: [0, 0], inning: 1, thrown: [0, 0], player: 0, leader: 0, phase: "hub",
  landing: null, end: null, landD: null, landPhi: 0, plan: null, ideal: null, prev: null,
  errors: { dir: 0, pow: 0, ht: 0 }, feedback: [], perfect: false, overdrive: false, lastId: null, cpuT: 0, cpuPlan: null,
  saved: {}, settleT: 0, acc: 0, push: null, time: 0, relT: 99, banner: null, bannerT: 0, lastInning: null, winner: null, history: [],
  pull: { active: false, startY: 0, fill: 0, raw: 0, phase: 0, swing: 0 }, planVersion: 0, wind: { mph: 0, dir: 0 }, fourBagger: [false, false],
  result: null, introT: 0, tut: { dragged: false, thrown: false },
};
globalThis.S = S; // the engine's what-if simulation reads the board from here
const isCPU = p => S.kind === "career" && p === 1 && !S.online;
const isRemote = p => !!S.online && p === 1; // the live opponent's throws arrive over the network
const canEdit = () => S.phase === "aiming" && !isCPU(S.player) && !isRemote(S.player);
// Throw clock: career and online turns (not Pass & Play, not the tutorial match) must throw within this many seconds.
const THROW_TIME = 25;
const timedTurn = () => S.kind === "career" && career.tutorialDone && !isCPU(S.player) && !isRemote(S.player);
const venue = () => VENUES[S.venue];
const POWER_TARGET = 0.75;
const COL = { p: ["#ff4b3a", "#2f86ff"], pd: [], pl: [], gold: "#ffc93a", go: "#3ee07a" };
function setTeamColors() {
  COL.p = [S.gear[0].c, S.gear[1].c];
  COL.pd = COL.p.map(c => shade(c, -0.35));
  COL.pl = COL.p.map(c => shade(c, 0.35));
  for (const p of [0, 1]) {
    const card = $("card" + p);
    card.style.background = `linear-gradient(${COL.pl[p]}, ${COL.p[p]} 55%, ${COL.pd[p]})`;
  }
}
// Difficulty for whoever is throwing: venue sets the base, their bag improves it.
function lv() {
  const v = venue(), g = S.gear[S.player];
  return {
    freq: v.swing * (1 - 0.06 * (g.acc - 1)),
    zone: v.zone * (1 + 0.15 * (g.acc - 1)),
    powZone: v.zone * (1 + 0.15 * (g.ctrl - 1)),
    wobble: v.wob * (1 - 0.15 * (g.ctrl - 1)),
    cpu: S.opponent ? S.opponent.skill : 0.25,
    preview: true,
  };
}
function setGear(pl) {
  const g = S.gear[pl];
  CUR.spinMul = 0.8 + 0.15 * (g.spin - 1);
  CUR.slideMul = FEEL[g.feel].slide;
}

// ───────────────────────── Match flow
function newWind() {
  const [lo, hi] = venue().wind;
  const r = S.online ? rng(S.online.seed + S.inning * 7919) : Math.random; // online: both phones get the same wind
  S.wind = { mph: Math.round(lo + r() * (hi - lo)), dir: r() * Math.PI * 2 }; // steady for the whole inning, any direction
}
function venueAmbience(id = venue().id, mph = S.wind.mph) {
  setAmbience({ wind: mph, surf: ["beach", "bonfire", "island", "lakeside"].includes(id), crowd: ["stadium", "tailgate", "carnival"].includes(id), night: ["brewery", "bonfire", "carnival"].includes(id), fire: id === "bonfire" || id === "lodge" });
}
function windAccel() {
  const a = S.wind.mph * WIND_ACCEL_PER_MPH;
  return { x: Math.sin(S.wind.dir) * a, y: Math.cos(S.wind.dir) * a };
}
// online (optional): { seed, flip, lead, name, bag, trail, effect } agreed with the live opponent; flip and lead are
// already from this phone's point of view (you are always player 0 on your own phone).
function startMatch(kind, vi, online = null, pick = null) {
  const v = VENUES[vi];
  S.online = null;
  if (kind === "career") {
    if (career.coins < v.fee && !houseCovers(vi)) return;
    if (!useLife()) return;
    if (!houseCovers(vi)) career.coins -= v.fee;
    career.venue = vi; career.venueId = v.id; save();
    if (online) {
      S.online = { ...online, queue: [], waitT: 0, rematch: { me: false, them: false, setup: null } };
      S.opponent = { name: online.name, live: true, skill: 0, rating: 0, avatar: online.avatar || "a0" };
      S.gear = [bagById(career.bag), bagById(online.bag)];
    } else {
      const [hi, lo] = v.cpu, skill = rand(lo, hi);
      S.opponent = { avatar: pick ? pick.avatar : AVATARS[Math.floor(Math.random() * AVATARS.length)].id, name: pick ? pick.name : OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)], skill, rating: 1 + Math.round((hi - skill) / Math.max(1e-6, hi - lo) * 2) };
      S.gear = [bagById(career.bag), RIVAL_BAGS[Math.min(2, Math.floor(vi / 4))]];
    }
    S.names = [myHandle(), S.opponent.name];
  } else {
    S.opponent = null;
    S.names = ["Player 1", "Player 2"];
    S.gear = [bagById(career.bag), RIVAL_BAGS[0]];
  }
  S.kind = kind; S.venue = vi; S.botRematch = null;
  // Coin flip for pitcher's boxes: who throws from the left and who from the right.
  const flip = online ? online.flip : Math.random() < 0.5 ? 1 : -1;
  SIDES[0] = -flip; SIDES[1] = flip;
  T.mu = v.mu;
  S.world = new World(); S.scores = [0, 0]; S.inning = 1; S.thrown = [0, 0]; S.leader = online ? online.lead : Math.random() < 0.5 ? 0 : 1; S.player = S.leader;
  S.saved = {}; S.lastInning = null; S.history = []; S.winner = null; S.feedback = []; S.lastId = null; S.relT = 99; S.result = null; S.fourBagger = [false, false];
  setTeamColors(); clearBagMeshes(); setHoleHalo(0); setBoardDesign(career.board); buildVenue(v.id); newWind(); venueAmbience();
  S.tut = { dragged: false, thrown: false };
  $("hub").hidden = true; document.body.classList.remove("inhub", "looking");
  showBanner(`${S.kind === "career" && S.leader === 0 ? "You throw" : esc(S.names[S.leader]) + " throws"} first`, S.leader);
  S.introT = 0;
  beginTurn();
  const side = SIDES[0] < 0 ? "LEFT" : "RIGHT";
  setTimeout(() => { if (S.phase !== "hub") showBanner(S.kind === "career" ? `You're in the ${side} box` : `Player 1: ${side} box`, 0); }, 1700);
}
const DEFAULT_SLIDE = 1.5;
function refreshPlan() {
  setGear(S.player);
  S.plan = S.end ? planThrow(S.player, S.end, S.landD ?? DEFAULT_SLIDE, S.landPhi || 0) : null;
  S.planVersion++;
  if (!S.plan) { S.landing = S.ideal = S.prev = null; S.push = null; return; }
  S.landD = S.plan.D; S.landPhi = S.plan.phi;
  S.landing = S.plan.landing; S.ideal = S.plan.ideal;
  S.prev = simulate(S.ideal, S.player);
  S.push = null;
  if (S.prev.own && S.landD > 0.1) {
    const base = S.ideal, t = solvePush(base, S.landing, S.end, S.player, S.prev.own, false);
    if (t) { S.push = { extra: t.speed / base.speed - 1 }; S.ideal = t; S.prev = simulate(t, S.player); }
  }
}
let dragging = null, pendingDrag = null;
function moveMarker(kind, p) {
  if (!canEdit()) return;
  if (kind === "end") {
    S.end = { x: clamp(p.x, -1.8, 1.8), y: clamp(p.y, FY + 0.2, BY + 0.25) };
  } else if (S.plan) {
    const v = { x: p.x - S.end.x, y: p.y - S.end.y };
    S.landD = Math.hypot(v.x, v.y); S.landPhi = wrap(heading(v) - heading(S.plan.z.back));
    S.tut.dragged = true;
  }
  refreshPlan(); ui();
}
function grabsLanding(p) {
  if (!S.plan || !S.landing || dist(p, S.end) <= 0.3) return false;
  if (dist(p, S.landing) < 0.55) return true;
  const z = S.plan.z, v = { x: p.x - S.end.x, y: p.y - S.end.y }, D = Math.hypot(v.x, v.y);
  return D >= z.Dmin - 0.25 && D <= z.Dmax + 0.3 && Math.abs(wrap(heading(v) - heading(z.back))) <= maxPhi(D) + 0.12;
}
function beginTurn() {
  S.cpuPlan = null;
  setGear(S.player);
  S.clock = timedTurn() ? THROW_TIME : null;
  if (isCPU(S.player)) { S.landing = S.end = S.ideal = S.prev = S.plan = null; S.planVersion++; S.cpuT = 0; S.phase = "cpu"; }
  else if (isRemote(S.player)) { S.landing = S.end = S.ideal = S.prev = S.plan = null; S.planVersion++; S.online.waitT = 0; S.phase = "remote"; }
  else {
    const s = S.saved[S.player]; S.end = s ? s[0] : null; S.landD = s ? s[1] : null; S.landPhi = s ? s[2] : 0;
    S.phase = "aiming"; refreshPlan();
  }
  ui();
}
function beginThrow() {
  if (!canEdit() || !S.ideal) return;
  S.saved[S.player] = [S.end, S.landD, S.landPhi];
  S.errors = { dir: 0, pow: 0, ht: 0 };
  S.pull = { active: false, startY: 0, fill: 0, raw: 0, phase: 0, swing: 0 };
  S.phase = "throw"; sfx.tick(); haptic("tap"); ui();
}
// One move: the pull sets the power, the swinging arrow sets the direction; overdrive makes both wild.
function updatePull(dt) {
  const p = S.pull, L = lv();
  if (!p.active) return;
  p.fill = clamp(p.raw + Math.sin(S.time * 11) * L.wobble * Math.min(1, p.raw * 4), 0, 1.25);
  const over = p.fill > 1;
  const speed = (0.35 + 0.65 * Math.min(p.fill / POWER_TARGET, 1.6)) * (over ? 1.9 : 1);
  p.phase += dt * L.freq * speed; // cycles
  const ph = p.phase % 1; // triangle wave: steady sweep left and right
  p.swing = ph < 0.25 ? ph * 4 : ph < 0.75 ? 2 - ph * 4 : ph * 4 - 4;
  if (over) p.swing *= 1.3;
}
function releasePull() {
  const p = S.pull, L = lv();
  p.active = false;
  if (p.fill < 0.1) { updateHUD(); return; } // a tap, not a pull
  const over = p.fill > 1;
  const pow = clamp((p.fill - POWER_TARGET) / 0.5, -1, 1);
  S.errors = {
    dir: clamp(p.swing, -1.3, 1.3),
    pow: Math.abs(pow) <= L.powZone ? 0 : pow,
    ht: over ? rand(-0.9, 0.9) : 0,
  };
  S.overdrive = over;
  fireAim();
  releaseBag(S.errors);
}
function releaseBag(e) {
  if (!S.ideal) return;
  setGear(S.player);
  const actual = applyErrors(e, S.ideal, lv());
  if (S.overdrive) actual.az += (e.dir - clamp(e.dir, -1, 1)) * MAX_DIR; // overdrive can swing past the normal limit
  actual.wind = windAccel();
  S.feedback = [
    { title: "Direction", text: grade(e.dir, METERS[0], lv()) },
    { title: "Strength", text: grade(e.pow, METERS[1], lv()) },
  ];
  if (S.overdrive) S.feedback.push({ title: "Overdrive", text: "Wild!" });
  S.perfect = !S.overdrive && S.feedback.every(f => f.text === "Perfect");
  if (S.online) { // send the throw; both phones play it with the same luck
    const seed = Math.floor(Math.random() * 2 ** 31);
    S.world.seed(seed);
    netSend({ t: "throw", actual, seed, feedback: S.feedback, overdrive: !!S.overdrive, perfect: S.perfect });
  }
  launchBag(actual);
}
// The live opponent's throw, exactly as their phone threw it.
function remoteThrow(m) {
  setGear(1); S.player = 1; S.online.waitT = 0;
  S.world.seed(m.seed);
  S.feedback = m.feedback || []; S.overdrive = !!m.overdrive; S.perfect = !!m.perfect;
  launchBag(m.actual);
}
function launchBag(actual) {
  S.clock = null;
  S.lastId = S.world.launch(actual, S.player);
  S.thrown[S.player]++; S.settleT = 0; S.acc = 0; S.relT = 0; S.phase = "flight"; sfx.whoosh(); haptic("release");
  if (S.player === 0) S.tut.thrown = true;
  if (S.overdrive) showBanner("OVERDRIVE!", S.player); else if (S.perfect) showBanner("PERFECT!", S.player);
  ui();
}
// Out of time: that bag is lost.
function timeUp() {
  S.clock = null; S.pull.active = false; S.feedback = [];
  S.thrown[S.player]++; S.settleT = 0; S.acc = 0; S.phase = "flight"; S.lastId = null;
  showBanner("Time's up! Bag lost", S.player); sfx.thud(); haptic("thud");
  if (S.online && S.player === 0) netSend({ t: "timeout" });
  ui();
}
function endTurn() {
  if (S.kind === "career" && !career.tutorialDone && S.tut.thrown) { career.tutorialDone = true; save(); }
  if (S.thrown[0] >= 4 && S.thrown[1] >= 4) { finishInning(); return; }
  const other = 1 - S.player; if (S.thrown[other] < 4) S.player = other;
  beginTurn();
}
function inningResult() {
  const hole = [0, 0], on = [0, 0];
  for (const b of S.world.bags) { const p = bagPoints(b); if (p === 3) hole[b.owner]++; else if (p === 1) on[b.owner]++; }
  const raw = [hole[0] * 3 + on[0], hole[1] * 3 + on[1]];
  const winner = raw[0] === raw[1] ? null : (raw[0] > raw[1] ? 0 : 1);
  return { hole, on, raw, winner, awarded: Math.abs(raw[0] - raw[1]) };
}
function finishInning() {
  const r = inningResult(); S.lastInning = r;
  if (r.winner !== null) { S.scores[r.winner] += r.awarded; S.leader = r.winner; }
  S.history.push({ ...r, inning: S.inning, totals: [...S.scores] });
  const best = S.scores[0] >= S.scores[1] ? 0 : 1;
  if (S.scores[best] >= 21) { S.winner = best; S.phase = "over"; finishMatch(); } else S.phase = "inning";
  ui();
}
function finishMatch() {
  if (S.kind !== "career" || S.winner === 0) sfx.win(); else sfx.thud();
  if (S.kind !== "career") { S.result = null; return; }
  const v = venue(), won = S.winner === 0, before = courtStars(S.venue);
  const coins = won ? pot(v) : 0;
  let can = null, coolerFull = false;
  const holes = S.history.reduce((t, h) => t + h.hole[0], 0); // your cornholes this match improve the can
  if (won) { refundLife(); can = rollCan(null, holes); coolerFull = !giveCan(can, S.venue); }
  addCourtStars(S.venue, won ? starsForWin(S.venue) : -starsForLoss(S.venue));
  career.coins += coins;
  if (won) career.wins++; else career.losses++;
  const newly = updateUnlocks();
  save();
  addSeasonPoints(won ? starsForWin(S.venue) : 1);
  S.result = { won, starDelta: courtStars(S.venue) - before, coins, newly: newly.map(x => x.name), can, coolerFull, holes, lifeLost: !won, season: won ? starsForWin(S.venue) : 1 };
  postScores();
}
// A court's stars stay between 0 and its max.
function addCourtStars(vi, n) { const v = VENUES[vi]; career.courtStars[v.id] = clamp(courtStars(vi) + n, 0, v.max); updateUnlocks(); }
function nextInning() {
  S.world.clear(); clearBagMeshes(); setHoleHalo(0); S.inning++; S.thrown = [0, 0]; S.player = S.leader; S.feedback = []; S.fourBagger = [false, false];
  newWind(); venueAmbience(); beginTurn();
}
function showBanner(text, pl) { S.banner = { text, pl }; S.bannerT = 1.7; renderBanner(); }
function checkFourBagger() {
  for (const p of [0, 1]) {
    if (S.fourBagger[p]) continue;
    const inHole = S.world.bags.filter(b => b.owner === p && b.state === "inHole").length;
    if (inHole >= 4) {
      S.fourBagger[p] = true;
      fourBagger(p);
      if (S.kind === "career" && p === 0) { career.caps += 3; career.coins += Math.max(50, Math.round(venue().fee / 2)); career.fourBaggers = (career.fourBaggers || 0) + 1; save(); postScores(); }
    }
  }
}
function handleEvents(evts) {
  for (const e of evts) {
    if (e.type === "swish" || e.type === "drop") {
      const p = e.bag.owner, n = S.world.bags.filter(b => b.owner === p && b.state === "inHole").length;
      const name = n === 2 ? "2-BAGGER!" : n === 3 ? "3-BAGGER!" : e.type === "swish" ? "SWISH!" : e.bag.id === S.lastId ? "CORNHOLE!" : "KNOCKED IN!";
      if (n < 4) showBanner(name, p);
      sfx.hole(); haptic(n >= 3 ? "big" : "success"); celebrate(p); holeStreak(p, n);
    }
    else if (e.type === "land") { sfx.thud(); haptic("thud"); dust(e.bag, groundDust()); squash(e.bag.id); }
    else if (e.type === "hit") { sfx.thud(); haptic("light"); }
    else if (e.type === "ground") { sfx.grass(); dust(e.bag, groundDust()); if (e.bag.id === S.lastId) showBanner("Off the board", e.bag.owner); }
    else if (e.type === "off") showBanner(e.bag.id === S.lastId ? "Slid off" : "Knocked off!", e.bag.owner);
  }
  if (evts.some(e => e.type === "swish" || e.type === "drop")) checkFourBagger();
}
// Computer: plans like a decent player, partly allows for the wind (better players allow for more), then throws with skill-based error.
function cpuTurn() {
  S.cpuPlan = cpuPlan(S.player, S.world.bags);
  S.end = { ...S.cpuPlan.end };
  S.landD = dist(S.cpuPlan.landing, S.cpuPlan.end); S.landPhi = 0;
  refreshPlan();
  if (S.ideal && S.wind.mph > 0) {
    const c = contact(S.ideal), a = windAccel(), tt = c.time;
    const read = clamp(1 - S.opponent.skill * 2.2 + rand(-0.15, 0.15), 0.2, 1.05); // how well they read the wind
    S.end = { x: clamp(S.end.x - 0.5 * a.x * tt * tt * read, -1.8, 1.8), y: clamp(S.end.y - 0.5 * a.y * tt * tt * read, FY + 0.2, BY + 0.25) };
    refreshPlan();
  }
  ui();
}

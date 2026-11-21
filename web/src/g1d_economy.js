
// ───────────────────────── Economy: cans, cards, Daily Drop spins, avatars
// The money loop is deliberately tight. A win pays the pot (net +1 buy-in) and a can; a loss costs the buy-in and a
// life. At an even win rate coins barely grow, so moving up takes real skill, and a court's winnings buy the shop tier
// or two that match it. Cans are the treat: mostly small, now and then big. See README "Economy" for the numbers.

// ── Cans (the game's chests). Rarer cans hold more prizes and better ones, but any can can be a dud.
// pulls: how many prizes pop out; coins: range in buy-ins of the court the can came from (kept close together, so even
// the best can pays only about a win's worth); cards: total item cards;
// bias: how far up the rarity ladder its cards reach (higher = rarer items); life: chance per prize of a 🎟️ life.
const CANS = [
  { id: "white", name: "Picnic White", color: "#f2f2f6", rim: "#b8b8c4", odds: 40, pulls: 2, coins: [0.05, 0.15], cards: [2, 4], bias: 5, life: 0.01 },
  { id: "black", name: "Backyard Black", color: "#1c1c22", rim: "#5a5a66", odds: 25, pulls: 3, coins: [0.08, 0.2], cards: [4, 7], bias: 4.5, life: 0.015 },
  { id: "bronze", name: "Bronze Fizz", color: "#b06a32", rim: "#e0a070", odds: 15, pulls: 3, coins: [0.12, 0.3], cards: [6, 10], bias: 4, life: 0.02 },
  { id: "silver", name: "Silver Splash", color: "#a8b0bc", rim: "#eef2f8", odds: 10.5, pulls: 4, coins: [0.2, 0.4], cards: [10, 16], bias: 3.4, life: 0.03 },
  { id: "gold", name: "Golden Pop", color: "#e8b020", rim: "#fff0a0", odds: 6, pulls: 5, coins: [0.3, 0.6], cards: [16, 26], bias: 2.8, life: 0.04 },
  { id: "purple", name: "Royal Purple", color: "#7a3ad6", rim: "#d8b8ff", odds: 2.4, pulls: 6, coins: [0.45, 0.8], cards: [26, 40], bias: 2.3, life: 0.05 },
  { id: "platinum", name: "Platinum Sparkle", color: "#d8e4ec", rim: "#ffffff", odds: 0.9, pulls: 7, coins: [0.6, 1.1], cards: [40, 60], bias: 1.8, life: 0.06 },
  { id: "diamond", name: "Diamond Dazzle", color: "#5ad8ff", rim: "#e8fbff", odds: 0.2, pulls: 8, coins: [0.8, 1.5], cards: [60, 90], bias: 1.3, life: 0.08 },
  // Express: rare, middling contents, but it opens right away.
  { id: "express", name: "Express Pop", color: "#ff2e88", rim: "#ffd0e8", odds: 3, pulls: 3, coins: [0.12, 0.3], cards: [6, 12], bias: 3.6, life: 0.03, express: true },
];
// How long a can takes to open once you start it (several can unlock at once). The better the can, the longer the wait.
const OPEN_MIN = { white: 15, black: 60, bronze: 120, silver: 180, gold: 300, purple: 480, platinum: 720, diamond: 1440, express: 0 };
const openMs = id => OPEN_MIN[id] * 60000;
const durText = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`; };
const timeText = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
// A can's state: "ready" to open, "ticking" while it opens, or "idle" (waiting for you to start it).
function canState(slot) {
  if (canById(slot.id).express || slot.instant) return "ready";
  if (!slot.start) return "idle";
  return clockNow() >= slot.start + openMs(slot.id) ? "ready" : "ticking";
}
const canLeft = slot => (slot.start ? Math.max(0, slot.start + openMs(slot.id) - clockNow()) : openMs(slot.id));
// Bottle caps open a can right now: 1 cap per 10 minutes still to wait (at least 1).
const skipCost = slot => Math.max(1, Math.ceil(canLeft(slot) / 600000));
function skipCan(i) {
  const slot = career.cans[i]; if (!slot || canState(slot) === "ready") return true;
  const cost = skipCost(slot); if (career.caps < cost) return false;
  career.caps -= cost; slot.start = clockNow() - openMs(slot.id); save();
  return true;
}
const anyTicking = () => career.cans.some(c => canState(c) === "ticking");
function startCan(i) {
  const slot = career.cans[i];
  if (!slot || canState(slot) !== "idle") return false; // (any number can unlock at the same time)
  slot.start = clockNow(); save();
  if (career.alerts) postNative("notify", JSON.stringify({ op: "schedule", id: "can.ready", at: slot.start + openMs(slot.id), title: `Your ${canById(slot.id).name} is ready! 🥫`, body: "Crack it open and see what's inside." }));
  return true;
}
const COOLER_SIZE = 4;
// The Daily Drop's own can: red with grey trim. It isn't one of the cans you win; it holds that drop's one prize.
const DAILY_CAN = { id: "daily", name: "Daily Drop", color: "#c8102e", rim: "#9aa0aa", odds: 0, pulls: 1, coins: [0, 0], cards: [0, 0], bias: 5, life: 0, daily: true };
const canById = id => (id === "daily" ? DAILY_CAN : CANS.find(c => c.id === id) || CANS[0]);
// boost: your cornholes in the match. Each one tilts the odds toward the rarer cans (capped at 30).
function rollCan(odds, boost = 0) {
  const k = 1 + Math.min(30, boost) * 0.012, rank = c => CANS.indexOf(c);
  const list = odds ? CANS.filter(c => odds[c.id]) : CANS, w = c => (odds ? odds[c.id] : c.express ? c.odds : c.odds * k ** rank(c));
  let x = Math.random() * list.reduce((t, c) => t + w(c), 0);
  for (const c of list) { x -= w(c); if (x <= 0) return c.id; }
  return list[0].id;
}
// The cooler never holds more than COOLER_SIZE cans. Cans you're owed while it's full (a store purchase, a season prize)
// wait in career.canBacklog and drop in as soon as a slot opens.
// Beginners only ever earn the lowest can (bought cans stay what was paid for).
const earnedCan = id => (isBeginner() ? "white" : id);
function stashCan(can) { if (career.cans.length < COOLER_SIZE) career.cans.push(can); else (career.canBacklog ||= []).push(can); }
function fillCooler() { const b = career.canBacklog; while (b && b.length && career.cans.length < COOLER_SIZE) career.cans.push(b.shift()); }
const coolerFull = () => career.cans.length >= COOLER_SIZE;
// Won cans that arrive while the cooler is full wait in line, up to WIN_QUEUE of them.
const WIN_QUEUE = 2;
const winQueueFull = () => (career.canBacklog || []).filter(c => c.won).length >= WIN_QUEUE;
// Put a can in the cooler; returns false if the cooler is full.
function giveCan(id, court, instant = false) {
  if (career.cans.length >= COOLER_SIZE) return false;
  career.cans.push(instant ? { id, court, instant: true } : { id, court }); save();
  return true;
}

// ── Cards: every coin item in the shop can also be earned by collecting its cards. Pricier items need more.
const CARD_CATS = [
  { key: "bag", list: () => BAGS, owned: () => career.bags, weight: 30 },
  { key: "board", list: () => BOARDS, owned: () => career.boards, weight: 25 },
  { key: "trail", list: () => TRAILS, owned: () => career.trails, weight: 25 },
  { key: "fx", list: () => EFFECTS, owned: () => career.effects, weight: 20 },
];
// Collectable items in a category: the coin items past the free one, cheapest first.
const cardItems = cat => cat.list().filter(it => !it.premium && it.price > 0);
// Cards needed: 3 for the cheapest item up to 90 for the most expensive, climbing faster near the top.
function cardsNeeded(cat, it) {
  const items = cardItems(cat), r = items.length > 1 ? items.indexOf(it) / (items.length - 1) : 0;
  return Math.round(3 + 87 * r ** 1.6);
}
const cardKey = (cat, it) => `${cat.key}:${it.id}`;
const catByKey = k => CARD_CATS.find(c => c.key === k);
// A duplicate card (the item is already yours) pays a little: 0.1% of the item's price.
const dupCoins = it => Math.max(1, Math.round(it.price * 0.001));
// Cards only come for the part of each list that matches how far you've got: the cheapest 30% at the first court,
// growing with every court you open, the whole list from the last one. So nobody on an early court collects toward
// the best items. (Items stay in their list order, cheapest first, so this also keeps the costliest out of reach.)
function cardReach(items) {
  const k = Math.min(1, 0.3 + 0.7 * topCourt() / (VENUES.length - 1));
  return items.slice(0, Math.max(1, Math.ceil(items.length * k)));
}
// Pick an item for a card stack: cheap items are common; a can's bias decides how often rare ones show up.
function pickCardItem(bias) {
  let x = Math.random() * CARD_CATS.reduce((t, c) => t + c.weight, 0), cat = CARD_CATS[0];
  for (const c of CARD_CATS) { x -= c.weight; if (x <= 0) { cat = c; break; } }
  const items = cardReach(cardItems(cat)), w = items.map((_, i) => Math.exp(-bias * i / Math.max(1, items.length - 1)));
  let y = Math.random() * w.reduce((t, v) => t + v, 0);
  for (let i = 0; i < items.length; i++) { y -= w[i]; if (y <= 0) return { cat, it: items[i] }; }
  return { cat, it: items[0] };
}
// Add cards; returns what happened so the can reveal can show it.
function addCards(cat, it, n) {
  const owned = cat.owned().includes(it.id);
  if (owned) { const c = dupCoins(it) * n; career.coins += c; return { owned: true, coins: c }; }
  const k = cardKey(cat, it), need = cardsNeeded(cat, it);
  career.cards[k] = (career.cards[k] || 0) + n;
  // Badges: remember items your cards just unlocked (newly available to use) until you've seen them in the shop.
  if (career.cards[k] >= need) {
    delete career.cards[k]; cat.owned().push(it.id);
    (career.newCards ||= {})[k] = { unlocked: true };
    return { unlocked: true, have: need, need };
  }
  return { have: career.cards[k], need };
}
// Cards you've collected toward an item knock a little off its coin price, at most 30% and growing slowly at first
// (squared), so the house stays well ahead: half the cards is only 7.5% off.
function cardPrice(cat, it) {
  if (!it.price || it.premium) return it.price || 0;
  const have = career.cards[cardKey(cat, it)] || 0, need = cardsNeeded(cat, it);
  return Math.round(it.price * (1 - 0.3 * Math.min(1, have / need) ** 2));
}
// Badge counts: newly unlocked items, overall or for one card category (bag, board, trail, fx).
const newCount = catKey => Object.keys(career.newCards || {}).filter(k => !catKey || k.startsWith(catKey + ":")).length;

// ── Opening a can: decide every prize up front, then the reveal plays them one by one.
const MAX_CAN_PRIZES = 9;
function openCan(index) {
  const slot = career.cans[index]; if (!slot) return null;
  const can = canById(slot.id), fee = VENUES[clamp(slot.court | 0, 0, VENUES.length - 1)].fee;
  career.cans.splice(index, 1);
  if (slot.drop) { // a Daily Drop can: its one prize was picked when it dropped; it's paid as it opens
    const d = slot.drop, prizes = [];
    if (d.coins) { career.coins += d.coins; prizes.push({ kind: "coins", n: d.coins }); }
    else if (d.caps) { career.caps += d.caps; prizes.push({ kind: "caps", n: d.caps }); }
    else if (d.card) { const cat = catByKey(d.card.cat), it = cat.list().find(x => x.id === d.card.id); prizes.push({ kind: "cards", cat: cat.key, id: it.id, name: it.name, n: 1, ...addCards(cat, it, 1) }); }
    save(); return { can, prizes, streak: slot.streak };
  }
  const prizes = [];
  // Coins: one pile, anywhere in the can's range (often near the bottom).
  const coinRoll = can.coins[0] + (can.coins[1] - can.coins[0]) * Math.random() ** 1.8;
  const coins = Math.max(5, Math.round(fee * coinRoll / 5) * 5);
  career.coins += coins; prizes.push({ kind: "coins", n: coins });
  if (isBeginner()) { save(); return { can, prizes, streak: slot.streak }; } // Beginners: just coins (cards and caps start at Rookie)
  // Bottle caps: sometimes, more likely (and more of them) in rarer cans.
  const rank = Math.max(0, CANS.indexOf(can));
  if (!can.express && Math.random() < 0.08 + rank * 0.07) { const n = 1 + rank * 2 + Math.floor(Math.random() * (rank * 2 + 1)); career.caps += n; prizes.push({ kind: "caps", n }); }
  // Cards: the can's total split into stacks over its remaining prizes.
  let cards = Math.round((can.cards[0] + (can.cards[1] - can.cards[0]) * Math.random() ** 1.5) * titleCardBonus());
  const stacks = Math.min(can.pulls - 1, MAX_CAN_PRIZES - prizes.length); // never more than 9 prizes in all (they fit one screen)
  for (let k = 0; k < stacks; k++) {
    if (Math.random() < can.life) { const n = 2 + Math.floor(Math.random() * 2); career.caps += n; prizes.push({ kind: "caps", n }); continue; } // (used to be a ticket)
    const n = k === stacks - 1 ? Math.max(1, cards) : Math.max(1, Math.round(cards * (0.2 + Math.random() * 0.5)));
    cards = Math.max(0, cards - n);
    const { cat, it } = pickCardItem(can.bias), res = addCards(cat, it, n);
    prizes.push({ kind: "cards", cat: cat.key, id: it.id, name: it.name, n, ...res });
  }
  save();
  return { can, prizes, streak: slot.streak };
}

// ── No more lives (tickets). Matches are limited only by coins; the Free Gift (below) keeps everyone able to play the
// first court (the Daily Drop wheel's free spins keep it in reach). These stubs keep the old call sites harmless (a match never uses up anything but its buy-in).
const MAX_LIVES = 5;
function tickLives() { if (!(career.lives >= 1)) career.lives = MAX_LIVES; }
const nextLifeIn = () => 0;
function useLife() { return true; }
function refundLife() {}
tickLives(); // an old save that ran out of tickets is never blocked

// ── Daily Drop free spins: one every 4 hours, and up to 2 wait for you (like Golf Clash's free chest). Open 4 in a row
// for a bonus can; letting 2 pile up resets the streak (g.streak, 0-3). The wheel itself
// is in g4b_extras.js. (Kept as career.gift so saves carry over.)
const GIFT_MS = 4 * 60 * 60 * 1000, GIFT_MAX = 2;
function giftState() {
  const g = (career.gift ||= { n: 1, at: clockNow() }); // a first free spin waiting on a fresh game
  const now = clockNow();
  while (g.n < GIFT_MAX && now >= g.at + GIFT_MS) { g.n++; g.at += GIFT_MS; if (g.n >= GIFT_MAX) g.streak = 0; } // both waiting: the streak resets
  if (g.n >= GIFT_MAX) g.at = now; // full: the clock waits until one is used
  return g;
}
const giftNextIn = () => { const g = giftState(); return g.n >= GIFT_MAX ? 0 : Math.max(0, g.at + GIFT_MS - clockNow()); };
function useFreeSpin() {
  const g = giftState(); if (g.n <= 0) return false;
  if (g.n >= GIFT_MAX) g.at = clockNow(); // the next one starts coming now
  g.n--; save(); scheduleGiftAlert();
  return true;
}
// iPhone app: a local notification when both free spins are waiting (if the player turned alerts on).
function scheduleGiftAlert() {
  if (!career.alerts) { postNative("notify", JSON.stringify({ op: "cancel" })); return; }
  const g = giftState();
  if (g.n >= GIFT_MAX) postNative("notify", JSON.stringify({ op: "cancel" }));
  else postNative("notify", JSON.stringify({ op: "schedule", at: g.at + (GIFT_MAX - g.n) * GIFT_MS, title: "Your Daily Drops are ready! 🎁", body: "Two free prizes are waiting for you." }));
}
const scheduleLivesAlert = scheduleGiftAlert; // (old name, still called in a few places)

// ── Glitch protection. A career match is remembered (career.activeMatch) from the buy-in until it ends.
// If it never ends properly while the game was on screen (it crashed or froze), the buy-in comes back and
// no stars are lost. If the app had gone to the background (career.activeMatch.bg) and never came back, that's treated
// as a quit: a loss, like quitting from the pause menu.
const QUIT_WARNINGS = 3;
function refundMatch() {
  const m = career.activeMatch; if (!m) return null;
  career.activeMatch = null;
  if (m.bg && m.vi === 0 && (career.quitWarnings || 0) < QUIT_WARNINGS) { // the Backyard forgives it 3 times, with a warning
    career.quitWarnings = (career.quitWarnings || 0) + 1;
    career.coins += m.fee; refundLife(); save();
    return { refunded: true, warning: career.quitWarnings, fee: m.fee, court: VENUES[m.vi].name };
  }
  if (m.bg) { // left the app mid-match and it was closed
    addCourtStars(m.vi, -starsForLoss(m.vi)); career.losses++; updateUnlocks(); save();
    return { refunded: false, stars: starsForLoss(m.vi), court: VENUES[m.vi].name };
  }
  career.coins += m.fee; refundLife(); save();
  return { refunded: true, fee: m.fee, court: VENUES[m.vi].name };
}
// Going to the background mid-match marks it; coming back clears the mark.
document.addEventListener("visibilitychange", () => {
  if (!career.activeMatch) return;
  career.activeMatch.bg = document.hidden; save();
});

// ── Avatars: 4 to start, 2 more with every court you open.
// Headgear avatars made in Blender (web/tools/blender/hats.py): 4 to start, 3 more with each court you open, the
// rarest (crown, astronaut, beret) at Court 8. Each tile colour avoids the hat's own colours and their opposites. Ids stay a0..a24 so saves carry over.
const AVATARS = [
  ["ballcap", "#ffe38a", 0], ["devil", "#d6c8f5", 0], ["beanie", "#ffd2b0", 0], ["sunhat", "#c9d4ff", 0],
  ["cowboy", "#c6efd6", 1], ["police", "#c6efd6", 1], ["bucket", "#d6c8f5", 1],
  ["catears", "#ffe38a", 2], ["trucker", "#ffe38a", 2], ["pinkberet", "#bfe3ff", 2],
  ["fireman", "#bfe3ff", 3], ["party", "#bfe3ff", 3], ["hardhat", "#ffc2b0", 3],
  ["tiara", "#ffe38a", 4], ["chef", "#6f8fb8", 4], ["cowgirl", "#d6c8f5", 4],
  ["tophat", "#ffe38a", 5], ["propeller", "#d6c8f5", 5], ["fedora", "#ffd2b0", 5],
  ["viking", "#ffb8a8", 6], ["grad", "#bfe3ff", 6], ["wizard", "#c6efd6", 6],
  ["crown", "#ffd2b0", 7], ["astronaut", "#e98a74", 7], ["beret", "#ffe38a", 7],
].map(([name, bg, court], i) => ({ id: "a" + i, name, bg, court }));
const avatarById = id => AVATARS.find(a => a.id === id) || AVATARS[0];
const avatarOpen = a => venueUnlocked(a.court);
// "gc" is your Game Center photo (the default when you have one and haven't picked another avatar).
let gcPhoto = null;
const avatarHTML = (id, cls = "") => {
  if (id === "gc") return gcPhoto ? `<span class="avatar ${cls}" style="background:#fff"><img src="${gcPhoto}" alt=""></span>` : avatarHTML("a0", cls);
  const a = avatarById(id); return `<span class="avatar ${cls}" style="background:${a.bg}"><img src="assets/hats/${a.name}.png" alt="${a.name}"></span>`;
};

// ── Seasons: a calendar month (UTC). Each title is a worldwide league (a Game Center leaderboard per title), split
// into groups of 100 or fewer. Win a match for that court's win stars in season points, or 1 point just for playing.
// When the month ends you move by where you finished in your group, and it gets harder the higher you go: promotion
// shrinks from the top 20% (Rookie) to the top 2% (Champion), demotion grows from 20% to 30%. Promotion needs at least
// 10 matches that month. Not playing only costs you a title in the top three titles. Every finisher in the top 20
// gets a can (better at higher titles), and each title adds 5% more cards to every can you open. The groups need no server: every phone loads the whole league and shuffles it into groups the same way,
// using a hash of each player's ID and the season, so everyone agrees on who is in which group.
const TITLES = ["Rookie", "Weekend Warrior", "Backyard Hero", "Local Legend", "Semi-Pro", "Pro", "All-Star", "Champion", "Hall of Famer"];
const TITLE_ICONS = ["🥉", "🎒", "🏡", "📣", "🎯", "🔥", "⭐", "🏆", "👑"];
//                Rookie WkndW BkydH LocalL SemiP  Pro  AllSt Champ HallF
const PROMOTE =  [0.20, 0.20, 0.15, 0.15, 0.10, 0.10, 0.05, 0.02, 0];
const DEMOTE  =  [0,    0.20, 0.20, 0.15, 0.15, 0.10, 0.10, 0.05, 0.02]; // balanced: as many come down into each title as go up out of it, so groups stay full
const MIN_MATCHES_TO_PROMOTE = 10, INACTIVE_FROM = 6; // All-Star and up: not playing costs a title
const promoteCount = (t, size) => (PROMOTE[t] ? Math.max(1, Math.round(size * PROMOTE[t])) : 0);
const demoteCount = (t, size) => (DEMOTE[t] ? Math.max(1, Math.round(size * DEMOTE[t])) : 0);
// End-of-season can by place in your group: 1st Platinum, 2nd Gold, 3rd Silver, the rest of the top 20 Picnic White.
// Each title above Rookie moves every reward up one can (up to Diamond).
const SEASON_CANS = ["white", "black", "bronze", "silver", "gold", "purple", "platinum", "diamond"];
function seasonRewardCan(title, rank, size) {
  if (!rank || rank > Math.min(20, size)) return null;
  const base = rank === 1 ? 6 : rank === 2 ? 4 : rank === 3 ? 3 : 0; // platinum, gold, silver, black
  return SEASON_CANS[Math.min(SEASON_CANS.length - 1, base + title)];
}
// Title perk: +5% cards in every can for each title above Rookie.
const titleCardBonus = () => 1 + 0.05 * (career.season ? career.season.title : 0);
const seasonId = (d = new Date(clockNow())) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const seasonEnds = () => { const d = new Date(clockNow()); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
// Without Game Center (the browser preview), a season is judged against fixed point lines for your title instead.
const offlinePromoteAt = t => 2000 * 3 ** t, offlineDemoteBelow = t => 200 * 3 ** t; // (coins won in the month)
function seasonState() {
  career.season ||= { id: seasonId(), title: 0, points: 0, played: 0, last: null };
  return career.season;
}
const secondsIntoSeason = () => Math.max(1, Math.floor((clockNow() - Date.UTC(new Date(clockNow()).getUTCFullYear(), new Date(clockNow()).getUTCMonth(), 1)) / 1000));
// Every player at a title is in a group: you join this month's league as soon as you open the game (or become a
// Rookie), with 0 coins until you win, by posting your score (0 is fine) with your join time to Game Center.
function joinSeason() {
  if (isBeginner()) return;
  const s = seasonState(); rollSeason();
  if (!s.joined) { s.joined = secondsIntoSeason(); save(); }
  postNative("season", JSON.stringify({ op: "submit", title: s.title, points: s.points, joined: s.joined }));
}
function addSeasonPoints(n) {
  const s = seasonState(); rollSeason();
  if (!s.joined) s.joined = secondsIntoSeason();
  s.points += n; s.played++; save();
  postNative("season", JSON.stringify({ op: "submit", title: s.title, points: s.points, joined: s.joined }));
}
// Called on launch and in the clubhouse: if the month has turned, settle last season. The iPhone app asks Game Center
// where you finished in your group in last month's league (window.__seasonEntries); otherwise the offline lines decide.
function rollSeason() {
  const s = seasonState(), now = seasonId();
  if (s.id === now || s.pending) return;
  s.pending = { id: s.id, title: s.title, points: s.points, played: s.played };
  if (nativeBridge && nativeBridge.season) { postNative("season", JSON.stringify({ op: "result", title: s.title })); setTimeout(() => settleSeason(0, 0), 20000); }
  else settleSeason(0, 0);
}
const GROUP_MAX = 100;
// FNV-1a hash of player + season: decides each player's group the same way on every phone.
function hashStr(t) { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
// entries: [[playerId, score, name, joined], ...] for a whole league (joined: seconds into the season of their first
// score). Groups fill in the order players join: the first 100 are group 1, the next 100 group 2, and so on, so groups
// never reshuffle during the month and every phone works them out the same way. The newest, unfilled group is topped
// up with computer players (see BOT_FILL); each new player who joins takes a computer player's place.
function groupFor(entries, me, season, title) {
  const order = [...entries].sort((a, b) => (+a[3] || 0) - (+b[3] || 0) || (String(a[0]) < String(b[0]) ? -1 : 1));
  const at = Math.max(0, order.findIndex(e => e[0] === me)), g = Math.floor(at / GROUP_MAX);
  let list = order.slice(g * GROUP_MAX, g * GROUP_MAX + GROUP_MAX);
  const fill = (BOT_FILL[title] || 0) - list.length;
  if (fill > 0) list = list.concat(makeBots(fill, season, title, g));
  list.sort((a, b) => b[1] - a[1] || (String(a[0]) < String(b[0]) ? -1 : 1));
  // computer players (names with made-up points) can never be promoted: the move-up places go to real players only,
  // so "realRank" is your place among the real players; relegation uses your overall place (they can fill the bottom)
  const real = list.filter(e => !isBot(e)), rank = list.findIndex(e => e[0] === me) + 1;
  return { list, rank, size: list.length, realRank: real.findIndex(e => e[0] === me) + 1 };
}
// CPU players fill the first two titles while they're short on people: Rookie groups up to 100, Weekend Warrior up to
// 50, none above that, and none at all once a league has that many real players. They're made the same way on every
// phone (from the season and title), and their points build up over the month.
const BOT_FILL = [100, 50];
const BOT_FIRST = ["Sam", "Jess", "Rico", "Maya", "Dale", "Tess", "Bo", "Lena", "Gus", "Ivy", "Hank", "Kit", "Moe", "Nia", "Ray", "Pip", "Cal", "Dot", "Jax", "Flo"];
const BOT_LAST = ["Slider", "Airmail", "Blocker", "Woody", "Swish", "Kernel", "Duck", "Drop", "Hooks", "Push"];
// A player-style handle, the same on every phone for the same hash: e.g. "IvyDrop42", "rico_push", "CalHooks7".
function botHandle(h) {
  const a = BOT_FIRST[h % 20], b = BOT_LAST[(h >>> 8) % 10], n = (h >>> 12) % 100, style = (h >>> 20) % 3;
  return style === 0 ? `${a}${b}${n}` : style === 1 ? `${a.toLowerCase()}_${b.toLowerCase()}` : `${b}${a}${n % 10}`;
}
const isBot = e => String(e[0]).startsWith("cpu:");
function makeBots(n, season, title, group) {
  const d = new Date(clockNow()), start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const progress = season === seasonId() ? clamp((clockNow() - start) / (seasonEnds() - start), 0, 1) : 1;
  const mean = title === 0 ? 1500 : 6000, bots = []; // a month of match winnings, in coins
  for (let i = 0; i < n; i++) {
    const h = hashStr(`bot|${season}|${title}|${group}|${i}`), u = (h % 100000) / 100000;
    const final = Math.round(-Math.log(1 - u * 0.995) * mean);
    bots.push([`cpu:${group}:${i}`, Math.round(final * progress), botHandle(h)]);
  }
  return bots;
}
window.__seasonEntries = msg => {
  if (!msg || !Array.isArray(msg.entries)) return;
  const s = seasonState();
  if (msg.op === "result") {
    if (!s.pending) return;
    const G = groupFor(msg.entries, msg.me, s.pending.id, s.pending.title);
    settleSeason(G.rank, G.size, G.realRank);
  } else if (msg.op === "standings") {
    // you're always in your own group, even before your first score reaches Game Center
    const me = msg.me || "me", entries = msg.entries.some(e => e[0] === me) ? msg.entries : msg.entries.concat([[me, s.points, myHandle(), s.joined || 9e9]]);
    S.groupStandings = { ...groupFor(entries, me, s.id, s.title), me }; if (typeof openSeason === "function" && !$("rankSheet").hidden) openSeason(); }
};
// rank/size: your place in your group last season (0 if unknown: no Game Center and no CPU group to compare with).
function settleSeason(rank, size, realRank = rank) {
  const s = seasonState(), p = s.pending; if (!p) return;
  if (!rank && BOT_FILL[p.title]) { const G = groupFor([["me", p.points, "You", 1]], "me", p.id, p.title); rank = G.rank; size = G.size; realRank = G.realRank; }
  let move = 0;
  if (!p.played) move = p.title >= INACTIVE_FROM ? -1 : 0;                      // only the top three titles punish sitting out
  else if (rank && size) {
    if (realRank <= promoteCount(p.title, size) && p.played >= MIN_MATCHES_TO_PROMOTE) move = 1; // (computer players never take a promotion place)
    else if (rank > size - demoteCount(p.title, size)) move = -1;
  } else move = p.points >= offlinePromoteAt(p.title) && p.played >= MIN_MATCHES_TO_PROMOTE ? 1 : p.points < offlineDemoteBelow(p.title) ? -1 : 0;
  const title = clamp(p.title + move, 0, TITLES.length - 1);
  const reward = p.played && rank && size ? seasonRewardCan(p.title, rank, size) : null;
  if (reward) stashCan({ id: reward, court: VENUES.reduce((m, v, i) => (venueUnlocked(i) ? i : m), 0) }); // waits if the cooler is full
  Object.assign(s, { id: seasonId(), title, points: 0, played: 0, joined: 0, pending: null, last: { id: p.id, from: p.title, to: title, points: p.points, rank, size, reward } });
  save();
  if (typeof joinSeason === "function") joinSeason(); // straight into a group at your new title
  if (typeof showSeasonResult === "function") showSeasonResult();
}

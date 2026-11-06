
// ───────────────────────── Economy: cans, cards, lives, avatars
// The money loop is deliberately tight. A win pays the pot (net +1 buy-in) and a can; a loss costs the buy-in and a
// life. At an even win rate coins barely grow, so moving up takes real skill, and a court's winnings buy the shop tier
// or two that match it. Cans are the treat: mostly small, now and then big. See README "Economy" for the numbers.

// ── Cans (the game's chests). Rarer cans hold more prizes and better ones, but any can can be a dud.
// pulls: how many prizes pop out; coins: range in buy-ins of the court the can came from; cards: total item cards;
// bias: how far up the rarity ladder its cards reach (higher = rarer items); life: chance per prize of a 🎟️ life.
const CANS = [
  { id: "black", name: "Backyard Black", color: "#1c1c22", rim: "#5a5a66", odds: 40, pulls: 2, coins: [0.2, 0.5], cards: [2, 4], bias: 5, life: 0.01 },
  { id: "white", name: "Picnic White", color: "#f2f2f6", rim: "#b8b8c4", odds: 25, pulls: 3, coins: [0.3, 0.8], cards: [4, 7], bias: 4.5, life: 0.015 },
  { id: "bronze", name: "Bronze Fizz", color: "#b06a32", rim: "#e0a070", odds: 15, pulls: 3, coins: [0.5, 1.2], cards: [6, 10], bias: 4, life: 0.02 },
  { id: "silver", name: "Silver Splash", color: "#a8b0bc", rim: "#eef2f8", odds: 10.5, pulls: 4, coins: [0.8, 2], cards: [10, 16], bias: 3.4, life: 0.03 },
  { id: "gold", name: "Golden Pop", color: "#e8b020", rim: "#fff0a0", odds: 6, pulls: 5, coins: [1.5, 3.5], cards: [16, 26], bias: 2.8, life: 0.04 },
  { id: "purple", name: "Royal Purple", color: "#7a3ad6", rim: "#d8b8ff", odds: 2.4, pulls: 6, coins: [2.5, 5], cards: [26, 40], bias: 2.3, life: 0.05 },
  { id: "platinum", name: "Platinum Sparkle", color: "#d8e4ec", rim: "#ffffff", odds: 0.9, pulls: 7, coins: [4, 8], cards: [40, 60], bias: 1.8, life: 0.06 },
  { id: "diamond", name: "Diamond Dazzle", color: "#5ad8ff", rim: "#e8fbff", odds: 0.2, pulls: 8, coins: [6, 12], cards: [60, 90], bias: 1.3, life: 0.08 },
  // Express: rare, middling contents, but it opens right away.
  { id: "express", name: "Express Pop", color: "#ff2e88", rim: "#ffd0e8", odds: 3, pulls: 3, coins: [0.5, 1.5], cards: [6, 12], bias: 3.6, life: 0.03, express: true },
];
// How long a can takes to open once you start it (one at a time). The better the can, the longer the wait.
const OPEN_MIN = { black: 15, white: 60, bronze: 120, silver: 180, gold: 300, purple: 480, platinum: 720, diamond: 1440, express: 0 };
const openMs = id => OPEN_MIN[id] * 60000;
const durText = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`; };
const timeText = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
// A can's state: "ready" to open, "ticking" while it opens, or "idle" (waiting for you to start it).
function canState(slot) {
  if (canById(slot.id).express || slot.instant) return "ready";
  if (!slot.start) return "idle";
  return Date.now() >= slot.start + openMs(slot.id) ? "ready" : "ticking";
}
const canLeft = slot => (slot.start ? Math.max(0, slot.start + openMs(slot.id) - Date.now()) : openMs(slot.id));
// Bottle caps open a can right now: 1 cap per 10 minutes still to wait (at least 1).
const skipCost = slot => Math.max(1, Math.ceil(canLeft(slot) / 600000));
function skipCan(i) {
  const slot = career.cans[i]; if (!slot || canState(slot) === "ready") return true;
  const cost = skipCost(slot); if (career.caps < cost) return false;
  career.caps -= cost; slot.start = Date.now() - openMs(slot.id); save();
  return true;
}
const anyTicking = () => career.cans.some(c => canState(c) === "ticking");
function startCan(i) {
  const slot = career.cans[i];
  if (!slot || anyTicking() || canState(slot) !== "idle") return false;
  slot.start = Date.now(); save();
  if (career.alerts) postNative("notify", JSON.stringify({ op: "schedule", id: "can.ready", at: slot.start + openMs(slot.id), title: `Your ${canById(slot.id).name} is ready! 🥫`, body: "Crack it open and see what's inside." }));
  return true;
}
const COOLER_SIZE = 4;
const canById = id => CANS.find(c => c.id === id) || CANS[0];
// Daily free can: mostly the low tiers.
const DAILY_ODDS = { black: 70, white: 24, bronze: 5, silver: 1 }; // the daily can opens instantly and leans low
// boost: your cornholes in the match. Each one tilts the odds toward the rarer cans (capped at 30).
function rollCan(odds, boost = 0) {
  const k = 1 + Math.min(30, boost) * 0.012, rank = c => CANS.indexOf(c);
  const list = odds ? CANS.filter(c => odds[c.id]) : CANS, w = c => (odds ? odds[c.id] : c.express ? c.odds : c.odds * k ** rank(c));
  let x = Math.random() * list.reduce((t, c) => t + w(c), 0);
  for (const c of list) { x -= w(c); if (x <= 0) return c.id; }
  return list[0].id;
}
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
// A duplicate card (the item is already yours) pays a little: 0.25% of the item's price.
const dupCoins = it => Math.max(2, Math.round(it.price * 0.0025));
// Pick an item for a card stack: cheap items are common; a can's bias decides how often rare ones show up.
function pickCardItem(bias) {
  let x = Math.random() * CARD_CATS.reduce((t, c) => t + c.weight, 0), cat = CARD_CATS[0];
  for (const c of CARD_CATS) { x -= c.weight; if (x <= 0) { cat = c; break; } }
  const items = cardItems(cat), w = items.map((_, i) => Math.exp(-bias * i / Math.max(1, items.length - 1)));
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
  // Badges: remember which items got new cards (or were unlocked) until you've seen them in the shop.
  career.newCards ||= {};
  const nb = career.newCards[k] ||= { n: 0, unlocked: false }; nb.n += n;
  if (career.cards[k] >= need) { delete career.cards[k]; cat.owned().push(it.id); nb.unlocked = true; return { unlocked: true, have: need, need }; }
  return { have: career.cards[k], need };
}
// Badge counts: items with news, overall or for one card category (bag, board, trail, fx).
const newCount = catKey => Object.keys(career.newCards || {}).filter(k => !catKey || k.startsWith(catKey + ":")).length;

// ── Opening a can: decide every prize up front, then the reveal plays them one by one.
function openCan(index) {
  const slot = career.cans[index]; if (!slot) return null;
  const can = canById(slot.id), fee = VENUES[clamp(slot.court | 0, 0, VENUES.length - 1)].fee;
  career.cans.splice(index, 1);
  const prizes = [];
  // Coins: one pile, anywhere in the can's range (often near the bottom).
  const coinRoll = can.coins[0] + (can.coins[1] - can.coins[0]) * Math.random() ** 1.8;
  const coins = Math.max(5, Math.round(fee * coinRoll / 5) * 5);
  career.coins += coins; prizes.push({ kind: "coins", n: coins });
  // Bottle caps: sometimes, more likely (and more of them) in rarer cans.
  const rank = Math.max(0, CANS.indexOf(can));
  if (!can.express && Math.random() < 0.08 + rank * 0.07) { const n = 1 + rank * 2 + Math.floor(Math.random() * (rank * 2 + 1)); career.caps += n; prizes.push({ kind: "caps", n }); }
  // Cards: the can's total split into stacks over its remaining prizes.
  let cards = Math.round((can.cards[0] + (can.cards[1] - can.cards[0]) * Math.random() ** 1.5) * titleCardBonus());
  const stacks = can.pulls - 1;
  for (let k = 0; k < stacks; k++) {
    if (Math.random() < can.life) { career.lives += 1; prizes.push({ kind: "life", n: 1 }); continue; }
    const n = k === stacks - 1 ? Math.max(1, cards) : Math.max(1, Math.round(cards * (0.2 + Math.random() * 0.5)));
    cards = Math.max(0, cards - n);
    const { cat, it } = pickCardItem(can.bias), res = addCards(cat, it, n);
    prizes.push({ kind: "cards", cat: cat.key, id: it.id, name: it.name, n, ...res });
  }
  save();
  return { can, prizes };
}

// ── Lives: you hold up to 5 raffle tickets; one refills every hour. A match takes one up front and gives it back if
// you win, so closing the app mid-match can't dodge a loss. Bought lives can go past 5.
const MAX_LIVES = 5, LIFE_MS = 60 * 60 * 1000;
function tickLives() {
  const now = Date.now();
  if (career.lives >= MAX_LIVES) { career.livesAt = now; return; }
  const gained = Math.floor((now - (career.livesAt || now)) / LIFE_MS);
  if (gained > 0) {
    career.lives = Math.min(MAX_LIVES, career.lives + gained);
    career.livesAt = career.lives >= MAX_LIVES ? now : career.livesAt + gained * LIFE_MS;
    save(); scheduleLivesAlert();
  }
}
const nextLifeIn = () => (career.lives >= MAX_LIVES ? 0 : Math.max(0, career.livesAt + LIFE_MS - Date.now()));
const fullLivesAt = () => career.livesAt + (MAX_LIVES - career.lives) * LIFE_MS;
function useLife() {
  tickLives();
  if (career.lives <= 0) return false;
  if (career.lives >= MAX_LIVES) career.livesAt = Date.now(); // the refill clock starts when you drop below full
  career.lives--; save(); scheduleLivesAlert();
  return true;
}
function refundLife() { career.lives++; if (career.lives >= MAX_LIVES) career.livesAt = Date.now(); save(); scheduleLivesAlert(); }
// A life for coins costs 3 buy-ins at your highest open court: possible, never cheap.
const lifePrice = () => 3 * VENUES.reduce((m, v, i) => (venueUnlocked(i) ? v : m), VENUES[0]).fee;
// iPhone app: a local notification when the lives are full again (if the player turned alerts on).
function scheduleLivesAlert() {
  if (!career.alerts) { postNative("notify", JSON.stringify({ op: "cancel" })); return; }
  if (career.lives >= MAX_LIVES) postNative("notify", JSON.stringify({ op: "cancel" }));
  else postNative("notify", JSON.stringify({ op: "schedule", at: fullLivesAt(), title: "Your tickets are full! 🎟️", body: "5 lives ready. Time to throw some bags." }));
}

// ── Avatars: 4 to start, 2 more with every court you open.
const AVATARS = [
  ["😎", "#2f86ff", 0], ["🤠", "#ff8a1f", 0], ["🥳", "#ff2e88", 0], ["🙂", "#2fbf71", 0],
  ["😺", "#ffc93a", 1], ["🐶", "#8a5a32", 1], ["🦊", "#ff6a1a", 2], ["🐻", "#6a4a2a", 2],
  ["🐼", "#3a3a44", 3], ["🐨", "#8a9aa8", 3], ["🐯", "#ff9a1f", 4], ["🦁", "#e8a020", 4],
  ["🐸", "#3fae4a", 5], ["🐵", "#a0704a", 5], ["🦄", "#c86aff", 6], ["🐲", "#2fbf71", 6],
  ["👽", "#5ad86a", 7], ["🤖", "#7a8aa8", 7], ["🧙", "#5b3bd6", 8], ["🧛", "#8a1020", 8],
  ["🥷", "#1c1c22", 9], ["🧑‍🚀", "#2a4a8a", 9], ["🦸", "#c8102e", 10], ["🧜", "#0fb5a5", 10],
  ["👑", "#f2b705", 11], ["🏆", "#e8b020", 11],
].map(([e, bg, court], i) => ({ id: "a" + i, e, bg, court }));
const avatarById = id => AVATARS.find(a => a.id === id) || AVATARS[0];
const avatarOpen = a => venueUnlocked(a.court);
const avatarHTML = (id, cls = "") => { const a = avatarById(id); return `<span class="avatar ${cls}" style="background:${a.bg}">${a.e}</span>`; };

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
const DEMOTE  =  [0,    0.20, 0.20, 0.20, 0.20, 0.25, 0.25, 0.30, 0.30];
const MIN_MATCHES_TO_PROMOTE = 10, INACTIVE_FROM = 6; // All-Star and up: not playing costs a title
const promoteCount = (t, size) => (PROMOTE[t] ? Math.max(1, Math.round(size * PROMOTE[t])) : 0);
const demoteCount = (t, size) => (DEMOTE[t] ? Math.max(1, Math.round(size * DEMOTE[t])) : 0);
// End-of-season can by place in your group: 1st Platinum, 2nd Gold, 3rd Silver, the rest of the top 20 Backyard Black.
// Each title above Rookie moves every reward up one can (up to Diamond).
const SEASON_CANS = ["black", "white", "bronze", "silver", "gold", "purple", "platinum", "diamond"];
function seasonRewardCan(title, rank, size) {
  if (!rank || rank > Math.min(20, size)) return null;
  const base = rank === 1 ? 6 : rank === 2 ? 4 : rank === 3 ? 3 : 0; // platinum, gold, silver, black
  return SEASON_CANS[Math.min(SEASON_CANS.length - 1, base + title)];
}
// Title perk: +5% cards in every can for each title above Rookie.
const titleCardBonus = () => 1 + 0.05 * (career.season ? career.season.title : 0);
const seasonId = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const seasonEnds = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
// Without Game Center (the browser preview), a season is judged against fixed point lines for your title instead.
const offlinePromoteAt = t => 40 + t * 35, offlineDemoteBelow = t => 5 + t * 6;
function seasonState() {
  career.season ||= { id: seasonId(), title: 0, points: 0, played: 0, last: null };
  return career.season;
}
function addSeasonPoints(n) {
  const s = seasonState(); rollSeason();
  s.points += n; s.played++; save();
  postNative("season", JSON.stringify({ op: "submit", title: s.title, points: s.points }));
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
// entries: [[playerId, score, name], ...] for a whole league. Players are ordered by a hash of their ID and the season,
// then cut into even groups of at most 100, so every phone gets exactly the same groups whatever order the list
// arrived in. Returns your group (best first, ties broken by ID) and your place in it.
function myGroup(entries, me, season) {
  const n = entries.length, groups = Math.max(1, Math.ceil(n / GROUP_MAX)), per = Math.ceil(n / groups) || 1;
  const key = e => hashStr(String(e[0]) + "|" + season);
  const order = [...entries].sort((a, b) => key(a) - key(b) || (String(a[0]) < String(b[0]) ? -1 : 1));
  const at = order.findIndex(e => e[0] === me), g = at < 0 ? 0 : Math.floor(at / per);
  const list = order.slice(g * per, g * per + per).sort((a, b) => b[1] - a[1] || (String(a[0]) < String(b[0]) ? -1 : 1));
  return { list, rank: list.findIndex(e => e[0] === me) + 1, size: list.length };
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
function withBots(entries, title, season) {
  const want = (BOT_FILL[title] || 0) - entries.length;
  if (want <= 0) return entries;
  const d = new Date(), start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const progress = season === seasonId() ? clamp((Date.now() - start) / (seasonEnds() - start), 0, 1) : 1;
  const mean = title === 0 ? 35 : 60, bots = [];
  for (let i = 0; i < want; i++) {
    const h = hashStr(`bot|${season}|${title}|${i}`), u = (h % 100000) / 100000;
    const final = Math.round(-Math.log(1 - u * 0.995) * mean);
    bots.push([`cpu:${i}`, Math.round(final * progress), botHandle(h)]);
  }
  return entries.concat(bots);
}
window.__seasonEntries = msg => {
  if (!msg || !Array.isArray(msg.entries)) return;
  const s = seasonState();
  if (msg.op === "result") {
    if (!s.pending) return;
    const G = myGroup(withBots(msg.entries, s.pending.title, s.pending.id), msg.me, s.pending.id);
    settleSeason(G.rank, G.size);
  } else if (msg.op === "standings") { S.groupStandings = { ...myGroup(withBots(msg.entries, s.title, s.id), msg.me, s.id), me: msg.me }; if (typeof openSeason === "function" && !$("livesSheet").hidden) openSeason(); }
};
// rank/size: your place in your group last season (0 if unknown: no Game Center and no CPU group to compare with).
function settleSeason(rank, size) {
  const s = seasonState(), p = s.pending; if (!p) return;
  if (!rank && BOT_FILL[p.title]) { const G = myGroup(withBots([["me", p.points, "You"]], p.title, p.id), "me", p.id); rank = G.rank; size = G.size; }
  let move = 0;
  if (!p.played) move = p.title >= INACTIVE_FROM ? -1 : 0;                      // only the top three titles punish sitting out
  else if (rank && size) {
    if (rank <= promoteCount(p.title, size) && p.played >= MIN_MATCHES_TO_PROMOTE) move = 1;
    else if (rank > size - demoteCount(p.title, size)) move = -1;
  } else move = p.points >= offlinePromoteAt(p.title) && p.played >= MIN_MATCHES_TO_PROMOTE ? 1 : p.points < offlineDemoteBelow(p.title) ? -1 : 0;
  const title = clamp(p.title + move, 0, TITLES.length - 1);
  const reward = p.played && rank && size ? seasonRewardCan(p.title, rank, size) : null;
  if (reward) career.cans.push({ id: reward, court: VENUES.reduce((m, v, i) => (venueUnlocked(i) ? i : m), 0) }); // skips the cooler limit
  Object.assign(s, { id: seasonId(), title, points: 0, played: 0, pending: null, last: { id: p.id, from: p.title, to: title, points: p.points, rank, size, reward } });
  save();
  if (typeof showSeasonResult === "function") showSeasonResult();
}

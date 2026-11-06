
// ───────────────────────── Economy: cans, cards, lives, avatars
// The money loop is deliberately tight. A win pays the pot (net +1 buy-in) and a can; a loss costs the buy-in and a
// life. At an even win rate coins barely grow, so moving up takes real skill, and a court's winnings buy the shop tier
// or two that match it. Cans are the treat: mostly small, now and then big. See README "Economy" for the numbers.

// ── Cans (the game's chests). Rarer cans hold more prizes and better ones, but any can can be a dud.
// pulls: how many prizes pop out; coins: range in buy-ins of the court the can came from; cards: total item cards;
// bias: how far up the rarity ladder its cards reach (higher = rarer items); life: chance per prize of a 🍹 life.
const CANS = [
  { id: "black", name: "Backyard Black", color: "#1c1c22", rim: "#5a5a66", odds: 40, pulls: 2, coins: [0.2, 0.5], cards: [2, 4], bias: 5, life: 0.01 },
  { id: "white", name: "Picnic White", color: "#f2f2f6", rim: "#b8b8c4", odds: 25, pulls: 3, coins: [0.3, 0.8], cards: [4, 7], bias: 4.5, life: 0.015 },
  { id: "bronze", name: "Bronze Lager", color: "#b06a32", rim: "#e0a070", odds: 15, pulls: 3, coins: [0.5, 1.2], cards: [6, 10], bias: 4, life: 0.02 },
  { id: "silver", name: "Silver Stout", color: "#a8b0bc", rim: "#eef2f8", odds: 10.5, pulls: 4, coins: [0.8, 2], cards: [10, 16], bias: 3.4, life: 0.03 },
  { id: "gold", name: "Golden Ale", color: "#e8b020", rim: "#fff0a0", odds: 6, pulls: 5, coins: [1.5, 3.5], cards: [16, 26], bias: 2.8, life: 0.04 },
  { id: "purple", name: "Royal Purple", color: "#7a3ad6", rim: "#d8b8ff", odds: 2.4, pulls: 6, coins: [2.5, 5], cards: [26, 40], bias: 2.3, life: 0.05 },
  { id: "platinum", name: "Platinum Pils", color: "#d8e4ec", rim: "#ffffff", odds: 0.9, pulls: 7, coins: [4, 8], cards: [40, 60], bias: 1.8, life: 0.06 },
  { id: "diamond", name: "Diamond Reserve", color: "#5ad8ff", rim: "#e8fbff", odds: 0.2, pulls: 8, coins: [6, 12], cards: [60, 90], bias: 1.3, life: 0.08 },
];
const COOLER_SIZE = 4;
const canById = id => CANS.find(c => c.id === id) || CANS[0];
// Daily free can: mostly the low tiers.
const DAILY_ODDS = { black: 60, white: 30, bronze: 9, silver: 1 };
function rollCan(odds) {
  const list = odds ? CANS.filter(c => odds[c.id]) : CANS, w = c => (odds ? odds[c.id] : c.odds);
  let x = Math.random() * list.reduce((t, c) => t + w(c), 0);
  for (const c of list) { x -= w(c); if (x <= 0) return c.id; }
  return list[0].id;
}
// Put a can in the cooler; returns false if the cooler is full.
function giveCan(id, court) {
  if (career.cans.length >= COOLER_SIZE) return false;
  career.cans.push({ id, court }); save();
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
  if (career.cards[k] >= need) { delete career.cards[k]; cat.owned().push(it.id); return { unlocked: true, have: need, need }; }
  return { have: career.cards[k], need };
}

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
  // Cards: the can's total split into stacks over its remaining prizes.
  let cards = Math.round(can.cards[0] + (can.cards[1] - can.cards[0]) * Math.random() ** 1.5);
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

// ── Lives: you hold up to 5 cocktails; one refills every hour. A match takes one up front and gives it back if
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
  else postNative("notify", JSON.stringify({ op: "schedule", at: fullLivesAt(), title: "Your cocktails are full! 🍹", body: "5 lives ready. Time to throw some bags." }));
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

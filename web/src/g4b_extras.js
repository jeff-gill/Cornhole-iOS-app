
// ───────────────────────── Clubhouse extras: avatar, lives, the cooler of cans, and opening a can
// Coin and cap totals: exact up to 999, then 1.0K, 1.00M, 1.00B, 1.00T (rounded down, so it never shows more than you
// have). Tapping a total shows the exact number.
function bigNum(n) {
  n = Math.max(0, Math.floor(n));
  if (n < 1000) return String(n);
  const units = [[1e12, "T", 2], [1e9, "B", 2], [1e6, "M", 2], [1e3, "K", 1]];
  for (const [v, u, d] of units) if (n >= v) { const f = 10 ** d; return (Math.floor(n / v * f) / f).toFixed(d) + u; }
  return String(n);
}
function showExact(el, n, what) {
  document.querySelectorAll(".exacttip").forEach(t => t.remove());
  const r = el.getBoundingClientRect(), t = document.createElement("div");
  t.className = "exacttip"; t.textContent = `${Math.floor(n).toLocaleString()} ${what}`;
  t.style.left = `${Math.min(window.innerWidth - 90, Math.max(90, r.left + r.width / 2))}px`; t.style.top = `${r.bottom}px`;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
const clockText = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const topCourt = () => VENUES.reduce((m, v, i) => (venueUnlocked(i) ? i : m), 0);

function renderHubExtras() {
  tickLives(); testerTopUp();
  $("avatarBtn").innerHTML = avatarHTML(career.avatar);
  $("lives").textContent = career.lives;
  $("caps").textContent = bigNum(career.caps);
  $("livesTimer").textContent = career.lives < MAX_LIVES ? ` · ${clockText(nextLifeIn())}` : "";
  const cooler = $("cooler"); cooler.innerHTML = "";
  const slots = Math.max(COOLER_SIZE, career.cans.length);
  for (let i = 0; i < slots; i++) {
    const c = career.cans[i], b = document.createElement("button");
    if (c) {
      const k = canById(c.id), st = canState(c);
      b.className = `cslot full ${st}`;
      b.setAttribute("aria-label", `${k.name}: ${st === "ready" ? "ready to open" : st === "ticking" ? "opening" : "tap to start opening"}`);
      b.innerHTML = `<span class="cname">${k.name}</span><span class="crow"><i class="minican" style="background:linear-gradient(90deg, ${k.color}, ${k.rim} 40%, ${k.color})"></i><small>${st === "ready" ? "OPEN!" : st === "ticking" ? timeText(canLeft(c)) : durText(openMs(c.id))}</small></span>`;
      b.onclick = () => canTapped(i);
    } else { b.className = "cslot"; b.setAttribute("aria-label", "Empty cooler slot"); b.onclick = () => showInfo(cansInfoHTML()); }
    cooler.appendChild(b);
  }
}

// ── Lives sheet
function openLives() { renderLives(); $("livesSheet").hidden = false; }
function renderLives() {
  tickLives();
  const price = lifePrice(), full = career.lives >= MAX_LIVES;
  $("livesBody").innerHTML = `<div class="lifebig"><i class="tkt big"></i></div><h2>Lives: ${career.lives}</h2>
    <div class="liferow">${Array.from({ length: Math.max(MAX_LIVES, career.lives) }, (_, i) => `<span class="${i < career.lives ? "" : "gone"}"><i class="tkt"></i></span>`).join("")}</div>
    <div class="muted">Each match uses a ticket. Win and you get it back. One refills every hour, up to ${MAX_LIVES}.</div>
    <div class="big">${full ? "Full!" : `Next one in ${clockText(nextLifeIn())}`}</div>
    <button class="btn green" id="lifeBuy" ${career.coins >= price ? "" : "disabled"}>+1 <i class="tkt"></i> · <i class="coin"></i> ${short(price)}</button>
    <button class="btn green" id="lifeCaps" ${career.caps >= LIFE_CAPS ? "" : "disabled"}>+1 <i class="tkt"></i> · <i class="bcap"></i> ${LIFE_CAPS}</button>
    <button class="btn blue" id="lifeStore">MORE IN THE STORE</button>
    <button class="btn ghost" id="alertsBtn">🔔 Tell me when they're full: ${career.alerts ? "ON" : "OFF"}</button>
    <button class="btn" id="livesClose">DONE</button>`;
  $("lifeBuy").onclick = () => { if (career.coins < price) return; career.coins -= price; career.lives++; save(); scheduleLivesAlert(); sfx.tick(); renderLives(); renderHub(); };
  $("lifeCaps").onclick = () => { if (career.caps < LIFE_CAPS) return; career.caps -= LIFE_CAPS; career.lives++; save(); scheduleLivesAlert(); sfx.tick(); renderLives(); renderHub(); };
  $("lifeStore").onclick = () => { $("livesSheet").hidden = true; shopTab = "store"; shopMsg = ""; renderShop(); $("shop").hidden = false; };
  $("alertsBtn").onclick = () => {
    career.alerts = !career.alerts; save();
    if (career.alerts) postNative("notify", JSON.stringify({ op: "permission" }));
    scheduleLivesAlert(); renderLives();
  };
  $("livesClose").onclick = () => { $("livesSheet").hidden = true; };
}
$("livesBtn").onclick = openLives;
$("coinsBtn").onclick = e => showExact(e.currentTarget, career.coins, "coins");
$("shopCoinsBtn").onclick = e => showExact(e.currentTarget, career.coins, "coins");
$("shopCapsBtn").onclick = e => showExact(e.currentTarget, career.caps, "bottle caps");
$("capsBtn").onclick = e => showExact(e.currentTarget, career.caps, "bottle caps");
const LIFE_CAPS = 15;

// Tapping a can: open it if it's ready, start it if nothing else is opening, or show how long is left.
function canTapped(i) {
  const c = career.cans[i], k = canById(c.id), st = canState(c);
  if (st === "ready") { openCanSheet(i); return; }
  const cost = skipCost(c), afford = career.caps >= cost;
  const nowBtn = `<button class="btn ${afford ? "blue" : ""}" id="openNow">${afford ? "OPEN NOW" : "NEED"} · <i class="bcap"></i> ${cost}</button>`;
  if (st === "ticking") { showInfo(`<div class="lifebig">🥫</div><h2>${k.name}</h2><div class="big">Opens in ${timeText(canLeft(c))}</div>${nowBtn}<div class="muted">You have <i class="bcap"></i> ${career.caps}. Win matches while you wait.</div>`); }
  else {
    const busy = anyTicking();
    showInfo(`<div class="lifebig">🥫</div><h2>${k.name}</h2><div class="muted">${k.pulls} prizes inside. It takes ${durText(openMs(c.id))} to open${busy ? ", and another can is opening right now. One at a time." : "."}</div>
      ${busy ? "" : `<button class="btn green" id="startCan">START OPENING · ${durText(openMs(c.id))}</button>`}${nowBtn}<div class="muted">You have <i class="bcap"></i> ${career.caps}.</div>`);
    if (!busy) $("startCan").onclick = () => { startCan(i); $("livesSheet").hidden = true; renderHubExtras(); sfx.tick(); };
  }
  $("openNow").onclick = () => {
    if (!afford) { $("livesSheet").hidden = true; shopTab = "store"; shopMsg = ""; renderShop(); $("shop").hidden = false; return; }
    skipCan(i); $("livesSheet").hidden = true; openCanSheet(i);
  };
}
// ── A small info sheet (can odds), reusing the lives sheet frame
function showInfo(html) { $("livesBody").innerHTML = html + `<button class="btn" id="infoClose">DONE</button>`; $("infoClose").onclick = () => { $("livesSheet").hidden = true; }; $("livesSheet").hidden = false; }
function cansInfoHTML() {
  return `<h2>🥫 Cans</h2><div class="muted">Win a match to get a can, and there's a free one every day. Your cooler holds ${COOLER_SIZE}. Open one at a time: the better the can, the longer it takes, and Express cans open right away. Sink more cornholes in a match for a better shot at a rare can.</div>
    <div class="cangrid">${CANS.map(c => `<div><i class="minican" style="background:linear-gradient(90deg, ${c.color}, ${c.rim} 40%, ${c.color})"></i><span>${c.name}</span></div>`).join("")}</div>`;
}



// ── Your profile (tap your avatar): Avatar, Profile (handle and stats) and Settings (volume, haptics, alerts).
let ptab = "avatar";
function openAvatars(tab) { if (tab) ptab = tab; renderProfile(); $("avatarSheet").hidden = false; }
function renderProfile() {
  for (const b of document.querySelectorAll(".ptabs button")) b.classList.toggle("on", b.dataset.ptab === ptab);
  $("ptabAvatar").hidden = ptab !== "avatar"; $("ptabProfile").hidden = ptab !== "profile"; $("ptabSettings").hidden = ptab !== "settings";
  if (ptab === "avatar") {
    const grid = $("avatarGrid"); grid.innerHTML = "";
    for (const a of AVATARS) {
      const open = avatarOpen(a), b = document.createElement("button");
      b.className = "avpick" + (career.avatar === a.id ? " on" : "") + (open ? "" : " avlock");
      b.innerHTML = avatarHTML(a.id) + (open ? "" : `<small>🔒 Court ${a.court + 1}</small>`);
      b.onclick = () => { if (!open) return; career.avatar = a.id; save(); renderProfile(); renderHubExtras(); };
      grid.appendChild(b);
    }
  } else if (ptab === "profile") {
    const s = seasonState(), opened = VENUES.filter((_, i) => venueUnlocked(i)).length;
    $("ptabProfile").innerHTML = `<div class="profilehead">${avatarHTML(career.avatar)}<div><h2 style="margin:0;text-align:left;font-size:24px;overflow-wrap:anywhere">${esc(myHandle())}</h2><div class="muted">${TITLE_ICONS[s.title]} ${TITLES[s.title]}</div></div></div>
      <div class="handlebox"><div class="label">Your handle</div><input id="handleIn" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(myHandle())}">
        <div class="err" id="handleErr"></div><button class="btn green" id="handleSave">SAVE HANDLE</button>
        <div class="muted">3 to 16 letters, numbers, dots, dashes or underscores. Other players see this in Throwdowns.</div></div>
      <div class="pstats"><div><b>${career.wins}</b><small>Wins</small></div><div><b>${career.losses}</b><small>Losses</small></div><div><b>${career.stars}</b><small>Stars</small></div>
        <div><b>${opened}/${VENUES.length}</b><small>Courts</small></div><div><b>${career.fourBaggers || 0}</b><small>4-baggers</small></div><div><b>${career.wins + career.losses ? Math.round(career.wins / (career.wins + career.losses) * 100) : 0}%</b><small>Win rate</small></div></div>`;
    $("handleSave").onclick = () => {
      const v = $("handleIn").value.trim();
      if (!setHandle(v)) { $("handleErr").textContent = "Use 3–16 letters, numbers, dots, dashes or underscores."; return; }
      $("handleErr").textContent = ""; sfx.tick(); renderProfile();
    };
  } else {
    $("ptabSettings").innerHTML = `<h2>Settings</h2>
      <div class="setrow"><span>🎵 Music</span><button class="btn small" id="setMusic">${musicOn ? "ON" : "OFF"}</button></div>
      <div class="setrow"><span>Music volume</span><input type="range" id="musicVolIn" min="0" max="100" value="${Math.round(musicVol * 100)}"></div>
      <div class="setrow"><span>🔊 Sound effects</span><button class="btn small" id="setSfx">${sfxOn ? "ON" : "OFF"}</button></div>
      <div class="setrow"><span>Effects volume</span><input type="range" id="sfxVolIn" min="0" max="100" value="${Math.round(sfxVol * 100)}"></div>
      <div class="setrow"><span>📳 Haptics</span><button class="btn small" id="setHaptics">${career.haptics !== false ? "ON" : "OFF"}</button></div>
      <div class="setrow"><span>🔔 Alerts (tickets full, cans ready)</span><button class="btn small" id="setAlerts">${career.alerts ? "ON" : "OFF"}</button></div>`;
    $("setMusic").onclick = () => { toggleMusic(); renderProfile(); };
    $("setSfx").onclick = () => { toggleSfx(); renderProfile(); };
    $("musicVolIn").oninput = e => { initAudio(); setVolume("music", e.target.value / 100); };
    $("sfxVolIn").oninput = e => { initAudio(); setVolume("sfx", e.target.value / 100); };
    $("sfxVolIn").onchange = () => sfx.tick();
    $("setHaptics").onclick = () => { career.haptics = career.haptics === false; save(); haptic("tap"); renderProfile(); };
    $("setAlerts").onclick = () => { career.alerts = !career.alerts; save(); if (career.alerts) postNative("notify", JSON.stringify({ op: "permission" })); scheduleLivesAlert(); renderProfile(); };
  }
}
for (const b of document.querySelectorAll(".ptabs button")) b.onclick = () => { ptab = b.dataset.ptab; renderProfile(); };
$("avatarBtn").onclick = () => openAvatars();
$("avatarClose").onclick = () => { $("avatarSheet").hidden = true; renderHub(); };

// ── Opening a can: tap, it shakes, the tab pops, a mist sprays out and the prizes come out one at a time.
let canRun = null;
function openCanSheet(i) {
  const res = openCan(i); if (!res) return;
  const { can } = res;
  canRun = { ...res, step: "closed", shown: 0, mist: [] };
  const body = $("canBody");
  body.className = "can"; body.style.background = `linear-gradient(90deg, ${can.color}, ${can.rim} 35%, ${can.color} 70%)`;
  body.style.setProperty("--rim", can.rim);
  $("canLabel").innerHTML = can.name.replace(" ", "<br>");
  $("canLabel").style.color = can.id === "white" || can.id === "platinum" ? "#1c2a44" : "#fff";
  $("canTitle").textContent = can.name;
  $("prize").className = "prize"; $("prizeList").innerHTML = "";
  $("canHint").hidden = false; $("canHint").textContent = "Tap to open";
  $("canDone").hidden = true;
  $("canSheet").hidden = false;
  renderHub();
}
$("canStage").onclick = e => {
  if (!canRun || e.target.closest("button")) return;
  initAudio();
  if (canRun.step === "closed") {
    canRun.step = "shaking"; $("canBody").classList.add("shake"); $("canHint").hidden = true; sfx.tick(); haptic("light");
    setTimeout(popCan, 900);
  } else if (canRun.step === "prizes") nextPrize();
};
function popCan() {
  const R = canRun; if (!R) return;
  const body = $("canBody"); body.classList.remove("shake"); body.classList.add("open");
  sfx.whoosh(); haptic("big"); if (R.can.pulls >= 5) sfx.boom();
  // The spray: more mist from rarer cans, tinted with the can's colour.
  const cv = $("mist"), r = cv.getBoundingClientRect(); cv.width = r.width; cv.height = r.height;
  const top = body.getBoundingClientRect(), x0 = top.left + top.width / 2 - r.left, y0 = top.top - r.top;
  const n = 120 + R.can.pulls * 40;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = 200 + Math.random() * 520;
    R.mist.push({ x: x0 + (Math.random() - 0.5) * 30, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 6, life: 1 + Math.random() * 1.2, max: 2.2, tint: Math.random() < 0.35 });
  }
  if (!R.anim) { R.last = performance.now(); R.anim = requestAnimationFrame(mistFrame); }
  setTimeout(() => { body.classList.add("gone"); R.step = "prizes"; nextPrize(); }, 650);
}
function mistFrame(now) {
  const R = canRun; if (!R) return;
  const dt = Math.min(0.05, (now - R.last) / 1000); R.last = now;
  const cv = $("mist"), c = cv.getContext("2d"); c.clearRect(0, 0, cv.width, cv.height);
  for (const p of R.mist) {
    p.vy += 260 * dt; p.vx *= Math.pow(0.35, dt); p.vy *= Math.pow(0.5, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.r += dt * 6;
    if (p.life <= 0) continue;
    c.globalAlpha = Math.min(1, p.life) * 0.55; c.fillStyle = p.tint ? R.can.rim : "#ffffff";
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
  }
  R.mist = R.mist.filter(p => p.life > 0);
  R.anim = R.mist.length ? requestAnimationFrame(mistFrame) : 0;
}
function prizeHTML(p) {
  if (p.kind === "coins") return { pic: `<div class="pic"><i class="coin big"></i></div>`, line: `<b>+${p.n.toLocaleString()} coins</b>`, chip: `<i class="coin"></i> ${short(p.n)}` };
  if (p.kind === "caps") return { pic: `<div class="pic"><i class="bcap big"></i></div>`, line: `<b>+${p.n} bottle caps</b><small>Open cans early with these</small>`, chip: `<i class="bcap"></i> ${p.n}` };
  if (p.kind === "life") return { pic: `<div class="pic"><i class="tkt big"></i></div>`, line: `<b>+1 life!</b><small>A bonus ticket</small>`, chip: '<i class="tkt"></i> +1' };
  const icon = p.cat === "trail" ? (TRAILS.find(t => t.id === p.id) || {}).icon : p.cat === "fx" ? (EFFECTS.find(t => t.id === p.id) || {}).icon : "";
  const kind = { bag: "Bag", board: "Board", trail: "Throw effect", fx: "Cornhole effect" }[p.cat];
  const status = p.unlocked ? `<small class="new">UNLOCKED!</small>` : p.owned ? `<small>Already yours: +${p.coins.toLocaleString()} coins</small>` : `<small>${p.have} / ${p.need} cards</small>`;
  return { pic: icon ? `<div class="pic">${icon}</div>` : `<canvas data-cat="${p.cat}" data-id="${p.id}" width="96" height="96"></canvas>`, line: `<b>${p.n} × ${esc(p.name)}</b><small>${kind} cards</small>${status}`, chip: `${icon || "🃏"} ${p.n}× ${esc(p.name)}${p.unlocked ? " ✨" : ""}` };
}
function nextPrize() {
  const R = canRun; if (!R) return;
  if (R.shown > 0) { const prev = R.prizes[R.shown - 1]; $("prizeList").insertAdjacentHTML("beforeend", `<span>${prizeHTML(prev).chip}</span>`); }
  if (R.shown >= R.prizes.length) { $("prize").className = "prize"; $("canDone").hidden = false; R.step = "done"; return; }
  const p = R.prizes[R.shown++], h = prizeHTML(p), el = $("prize");
  el.className = "prize"; void el.offsetWidth;
  el.innerHTML = h.pic + h.line; el.className = "prize show";
  const cv = el.querySelector("canvas");
  if (cv) {
    const ctx = cv.getContext("2d");
    if (cv.dataset.cat === "bag") paintBag(ctx, 96, 96, bagById(cv.dataset.id));
    else { const tmp = document.createElement("canvas"); tmp.width = 96; tmp.height = 192; paintBoard(tmp.getContext("2d"), 96, 192, boardById(cv.dataset.id)); ctx.drawImage(tmp, 24, 0, 48, 96); }
  }
  if (p.unlocked || p.kind === "life") { sfx.win(); haptic("success"); } else { sfx.tick(); haptic("light"); }
  $("canHint").hidden = false; $("canHint").textContent = R.shown < R.prizes.length ? `Tap for the next prize (${R.prizes.length - R.shown} left)` : "Tap to finish";
}
$("canDone").onclick = () => { $("canSheet").hidden = true; canRun = null; renderHub(); };

// ── Testing tools: the browser preview and Xcode debug builds (the app sets window.__debugBuild), never the App Store.
// Tester mode keeps coins and bottle caps topped up so everything can be tried; it's on until switched off.
const TEST_BANK = 99999999;
const testing = () => !nativeBridge || !!window.__debugBuild;
function testerTopUp() { if (testing() && career.tester !== false) { career.coins = TEST_BANK; career.caps = TEST_BANK; } }
if (testing()) {
  const b = $("testerBtn"); b.hidden = false;
  const label = () => { b.textContent = `🧪 Tester mode: ${career.tester !== false ? "on" : "off"}`; };
  b.onclick = () => { career.tester = career.tester === false; if (career.tester) testerTopUp(); save(); label(); renderHub(); };
  label(); testerTopUp();
}
// Browser preview only (never in the iPhone app): fill the cooler with cans that are ready to open, for testing.
if (!nativeBridge) {
  // An empty cooler in the preview gets a demo set: one opening, one ready (Express) and two waiting to start.
  if (!career.cans.length) {
    const c = topCourt();
    career.cans = [{ id: "gold", court: c, start: Date.now() - 3600000 }, { id: "express", court: c }, { id: "silver", court: c }, { id: "purple", court: c }];
    save();
  }
}
if (testing()) { // Test cans: also in Xcode debug builds
  $("testCans").hidden = false;
  $("testCans").onclick = () => {
    const pick = ["silver", "gold", "purple", "platinum", "diamond", "express"].sort(() => Math.random() - 0.5).slice(0, COOLER_SIZE);
    career.cans = pick.map(id => ({ id, court: topCourt(), start: Date.now() - 2 * 86400000 }));
    save(); renderHub();
  };
}

// ── Season badge and ladder
function renderSeasonBadge() {
  const s = seasonState(), days = Math.max(1, Math.ceil((seasonEnds() - Date.now()) / 86400000));
  $("seasonBtn").innerHTML = `${TITLE_ICONS[s.title]} <b>${TITLES[s.title]}</b> · ${s.points} pts · ${days} day${days > 1 ? "s" : ""} left`;
}
function openSeason() {
  const s = seasonState(), days = Math.max(1, Math.ceil((seasonEnds() - Date.now()) / 86400000));
  const rows = TITLES.map((t, i) => `<div class="${i === s.title ? "me" : i > s.title ? "locked2" : ""}"><span>${TITLE_ICONS[i]}</span><span>${t}${i === s.title ? " <small>YOU</small>" : ""}</span><small>${i === TITLES.length - 1 ? "Top title" : `Top ${Math.round(PROMOTE[i] * 100)}% up`}${i ? ` · +${i * 5}% cards` : ""}</small></div>`).reverse().join("");
  // In the browser preview there's no Game Center, so the first two titles show your group of CPU players.
  if (!(nativeBridge && nativeBridge.season) && BOT_FILL[s.title]) S.groupStandings = { ...myGroup(withBots([["me", s.points, myHandle()]], s.title, s.id), "me", s.id), me: "me" };
  const G = S.groupStandings;
  if (!G && nativeBridge && nativeBridge.season && !openSeason.asked) { openSeason.asked = true; postNative("season", JSON.stringify({ op: "standings", title: s.title })); }
  let group = "";
  if (G && G.size) {
    const up = promoteCount(s.title, G.size), down = demoteCount(s.title, G.size);
    const zone = r => (r <= up ? " up" : r > G.size - down ? " down" : "");
    const row = (e, r) => `<div class="${e[0] === G.me ? "me" : ""}${zone(r)}"><span>${r}</span><span>${esc(String(e[2] || "Player"))}</span><small>${e[1]} pts</small></div>`;
    const where = zone(G.rank) === " up" ? (s.played >= MIN_MATCHES_TO_PROMOTE ? "You're in the promotion zone!" : `You're in the promotion zone. Play ${MIN_MATCHES_TO_PROMOTE - s.played} more match${MIN_MATCHES_TO_PROMOTE - s.played > 1 ? "es" : ""} to qualify.`) : zone(G.rank) === " down" ? "You're in the demotion zone." : "";
    group = `<div class="label">Your group (${G.size} players)</div><div class="ladder">${G.list.slice(0, 10).map((e, i) => row(e, i + 1)).join("")}${G.rank > 10 ? row([G.me, s.points, myHandle()], G.rank) : ""}</div>
      <div class="muted">${up ? `Top ${up} move up` : "The top title"}${down ? ` · bottom ${down} move down` : ""}. ${where}</div>`;
  }
  showInfo(`<h2>Season ladder</h2><div class="muted">Each season is a calendar month, and every title is a league split into groups of up to 100. The higher the title, the harder it is to move up (top 20% at Rookie down to the top 2% at Champion) and the more players move down. Play at least ${MIN_MATCHES_TO_PROMOTE} matches to be promoted. The top 20 in each group win a can: Platinum for 1st, Gold for 2nd, Silver for 3rd, Backyard Black for the rest, one can better for every title above Rookie. Each title also adds 5% more cards to every can you open.</div>${group}
    <div class="big">${TITLE_ICONS[s.title]} ${TITLES[s.title]} · ${s.points} points</div><div class="muted">Win: the court's win stars in points. Loss: 1 point for playing. ${days} day${days > 1 ? "s" : ""} left this season.</div>
    <div class="ladder">${rows}</div>`);
}
function showSeasonResult() {
  const L = seasonState().last; if (!L || L.shown) return;
  L.shown = true; save(); renderSeasonBadge();
  const up = L.to > L.from, down = L.to < L.from;
  showInfo(`<div class="lifebig">${TITLE_ICONS[L.to]}</div><h2>${up ? "Promoted!" : down ? "Moved down" : "Season over"}</h2>
    <div class="big">${up ? `You're now a ${TITLES[L.to]}` : down ? `You're back to ${TITLES[L.to]}` : `You stay a ${TITLES[L.to]}`}</div>
    <div class="muted">Last season you scored ${L.points} points${L.rank ? ` and finished #${L.rank} of ${L.size} in your group` : ""}. A new season has started.</div>
    ${L.reward ? `<div class="big" style="color:${COL.gold}">🥫 Season prize: ${canById(L.reward).name} can (in your cooler)</div>` : ""}`);
  if (up) { sfx.win(); haptic("success"); }
}
$("seasonBtn").onclick = openSeason;

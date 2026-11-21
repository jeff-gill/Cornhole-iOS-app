
// ───────────────────────── Clubhouse extras: avatar, lives, the cooler of cans, and opening a can
// Coin and cap totals: exact up to 999, then 1.0K, 1.00M, 1.00B, 1.00T (rounded down, so it never shows more than you
// have). Tapping a total shows the exact number.
function bigNum(n) {
  n = Math.max(0, Math.floor(n));
  if (n < 1000) return String(n);
  const units = [[1e12, "T", 1], [1e9, "B", 1], [1e6, "M", 1], [1e3, "K", 1]];
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
  $("avatarBtn").innerHTML = avatarHTML(career.avatar);
  $("caps").textContent = bigNum(career.caps);
  fillCooler();
  const cooler = $("cooler"); cooler.innerHTML = "";
  const slots = COOLER_SIZE;
  const waiting = career.canBacklog?.length || 0;
  $("coolerHead").innerHTML = waiting ? `PRIZE COOLER<span class="qbadge">+${waiting} waiting in line</span>` : "PRIZE COOLER";
  for (let i = 0; i < slots; i++) {
    const c = career.cans[i], b = document.createElement("button");
    if (c) {
      const k = canById(c.id), st = canState(c);
      b.className = `cslot full ${st}`;
      b.setAttribute("aria-label", `${k.name}: ${st === "ready" ? "ready to open" : st === "ticking" ? "opening" : "locked, tap to unlock"}`);
      // just the can, big and centred; what it's doing in a bar along the bottom (locked shows how long it takes)
      b.innerHTML = `${canPic(c.id)}<span class="cbar">${st === "ready" ? "OPEN!" : st === "ticking" ? `⏱ ${timeText(canLeft(c))}` : `🔒 ${durText(openMs(c.id))}`}</span>`;
      b.onclick = () => canTapped(i);
    } else { b.className = "cslot"; b.setAttribute("aria-label", "Empty cooler slot"); b.onclick = () => showInfo(cansInfoHTML()); }
    cooler.appendChild(b);
  }
}

// (The lives sheet is gone: there are no lives any more. #livesSheet is still the frame for showInfo / showChoice.)
$("coinsBtn").onclick = e => showExact(e.currentTarget, career.coins, "coins");
$("shopCoinsBtn").onclick = e => showExact(e.currentTarget, career.coins, "coins");
$("shopCapsBtn").onclick = e => showExact(e.currentTarget, career.caps, "bottle caps");
$("capsBtn").onclick = e => showExact(e.currentTarget, career.caps, "bottle caps");

// Tapping a can: open it if it's ready, start it if nothing else is opening, or show how long is left.
function canTapped(i) {
  const c = career.cans[i], k = canById(c.id), st = canState(c);
  if (st === "ready") { openCanSheet(i); return; }
  const cost = skipCost(c), afford = career.caps >= cost;
  const nowBtn = `<button class="btn ${afford ? "blue" : ""}" id="openNow">${afford ? "OPEN NOW" : "NEED"} · <i class="bcap"></i> ${cost}</button>`;
  if (st === "ticking") { showInfo(`<div class="lifebig">🥫</div><h2>${k.name}</h2><div class="big">Opens in ${timeText(canLeft(c))}</div>${nowBtn}<div class="muted">You have <i class="bcap"></i> ${career.caps}. Win matches while you wait.</div>`); }
  else {
    const busy = anyTicking();
    showInfo(`<div class="lifebig">🔒</div><h2>${k.name}</h2><div class="muted">${k.pulls} prizes inside. It's locked: unlocking it takes ${durText(openMs(c.id))}${busy ? ", and another can is unlocking right now. One at a time." : "."}</div>
      ${busy ? "" : `<button class="btn green" id="startCan">🔓 UNLOCK · ${durText(openMs(c.id))}</button>`}${nowBtn}<div class="muted">You have <i class="bcap"></i> ${career.caps}.</div>`);
    if (!busy) $("startCan").onclick = () => { startCan(i); $("livesSheet").hidden = true; renderHubExtras(); sfx.tick(); };
  }
  $("openNow").onclick = () => {
    if (!afford) { $("livesSheet").hidden = true; closePages(); shopMode("store"); shopTab = "store"; shopMsg = ""; renderShop(); $("shop").hidden = false; $("shop").classList.add("noback"); return; }
    skipCan(i); $("livesSheet").hidden = true; openCanSheet(i);
  };
}
// ── A small info sheet (can odds), reusing the lives sheet frame
// The How to Play / Game Rules sheet: two tabs.
function showHelpTab(tab) {
  for (const b of document.querySelectorAll(".htabs button")) b.classList.toggle("on", b.dataset.htab === tab);
  $("helpPlay").hidden = tab !== "play"; $("helpRules").hidden = tab !== "rules"; $("helpRegs").hidden = tab !== "regs";
  if (tab === "regs") $("helpRegs").innerHTML = rulesHTML().replace("<h2>Rules & Regulations</h2>", "<h2>App rules</h2><p class=\"muted\">How matches work in this game: the clock, pausing, leaving the app and refunds.</p>");
}
for (const b of document.querySelectorAll(".htabs button")) b.onclick = () => showHelpTab(b.dataset.htab);
// ── Rules & Regulations: everything about how matches are scored, timed and settled, in one place.
function rulesHTML() {
  const sec = (icon, title, items) => `<div class="rulesec"><h3>${icon} ${title}</h3><ul>${items.map(i => `<li>${i}</li>`).join("")}</ul></div>`;
  return `<h2>Rules & Regulations</h2><div class="rules">
  ${sec("⏱", "The throw clock", [
    `You have ${THROW_TIME} seconds for each throw. If time runs out, that bag is lost (a red ✕ by your score).`,
    "Lose all four of your bags to the clock in one inning and you lose the match.",
  ])}
  ${sec("⏸", "Pausing", [
    "The first pause of a match stops your throw clock for 5 seconds. After that it keeps running.",
    "Later pauses don't stop the clock, and the pause screen shows how long you have left.",
    "Quitting from the pause menu counts as a loss.",
  ])}
  ${sec("📱", "Leaving the app", [
    "Switching to another app, taking a call or locking your phone doesn't end the match.",
    "The throw clock keeps counting while you're away. When you come back, that time comes off your turns, and each turn that runs out loses that bag.",
    "If the app is closed while you're away (you close it, your iPhone closes it to save memory, or the phone turns off), the match counts as a loss.",
    `At the Backyard BBQ, the first ${QUIT_WARNINGS} times this happens you get a warning and a refund instead.`,
  ])}
  ${sec("🛟", "Glitches and refunds", [
    "If the game freezes or crashes while it's on your screen, the match is stopped and refunded: your buy-in comes back and no stars are lost.",
    "If you were out of the app when it closed, there's no refund (see Leaving the app).",
  ])}
  ${sec("🌬️", "Wind", [
    "The wind is set at the start of each match and stays the same for the whole match.",
    "There's no wind at the Backyard BBQ. It builds a little at every court after that, from a light 0–1 mph at the Tailgate Lot up to 5–7 mph at the Stadium.",
    "Faint streaks drift across the court in the wind's direction. The aiming guide doesn't allow for wind.",
  ])}
  ${sec("⭐", "Stars and courts", [
    "A win earns stars at that court and the buy-in prize. A loss costs some stars.",
    "Fill a court's star track to open the next court.",
  ])}
  ${sec("🎯", "Bullseye Bags", [
    "One free throw a day at a giant bullseye board. It resets at midnight. You can buy more throws (1, 3 or 5).",
    "Everyone gets the same challenge each day: the scene, the wind, the weather, the board and where the prizes and other bags are. Everyone throws the Golden Bag.",
    "Tap PREVIEW to look at a level's court before using a throw. The board is a real 2 x 4 board: the hole near the back, with four coloured rings around it that run off the back and sides of the board.",
    "Easier and Harder each have five prizes: the four rings and the hole. Finish in a ring to win it; then it's plain wood for the rest of the day. The hole is the top prize: a can that opens right away.",
    "Only bags resting on the board count. Off the board wins nothing.",
    `You have ${BB_THROW_TIME} seconds for the throw. If time runs out, the throw is used up.`,
    "Every Sunday is Hole-in-One Sunday: sinking the hole also wins the exclusive Hole-in-One bag (a bonus can once you have it). It can't be bought.",
    "Harder has tighter rings, farther away, in more wind, with more bags in the way, but its prizes are much bigger.",
    "Knock the star bag into the hole and your prize is doubled.",
    "If you leave before throwing, you keep the throw. Once the bag is in the air, the throw counts.",
  ])}
  ${sec("🎡", "Daily Drop", [
    "A free Daily Drop every 4 hours, and up to 2 wait for you. Tap it for coins, bottle caps, bag and board cards, and now and then a can.",
    "Open 4 Daily Drops in a row for a bonus can. If 2 are left waiting, the streak starts over.",
    "There are no lives: you can play as long as you can afford the buy-in, and the Daily Drops keep the first court in reach.",
  ])}
  ${sec("🥫", "Prize cans", [
    `Win a match to get a prize can. Your Prize Cooler holds ${COOLER_SIZE}.`,
    `If your cooler is full, a win doesn't give a new can, and you're warned before the match starts.`,
    "Cans you buy, or win at the end of a season, wait outside the cooler until a slot opens.",
  ])}
  ${sec("🏆", "Seasons", [
    "Each season is a calendar month. Every title is a league split into groups of up to 100.",
    "The top of your group moves up and the bottom moves down (the lines in your group show where).",
    `You need at least ${MIN_MATCHES_TO_PROMOTE} matches in a season to be promoted.`,
  ])}
  </div>`;
}
// A yes/no sheet: the main button runs onYes; the second just closes it.
function showChoice(html, yes, onYes, no = "CANCEL", onNo = null, yesClass = "green") {
  $("livesBody").innerHTML = html + `<div class="row" style="gap:10px;justify-content:center;margin-top:14px"><button class="btn ghost" id="choiceNo" style="font-size:17px;padding:12px 18px">${no}</button><button class="btn ${yesClass}" id="choiceYes">${yes}</button></div>`;
  $("choiceNo").onclick = () => { $("livesSheet").hidden = true; if (onNo) onNo(); };
  $("choiceYes").onclick = () => { $("livesSheet").hidden = true; onYes(); };
  $("livesSheet").hidden = false;
}
// The rough-patch offer: the only way to swap stars for coins. Stars come from the court you were playing first, then
// your highest other courts (courts you've opened stay open). Yes or no, the count starts over.
// The Welcome Pack: offered after a match in your first 3 days, at most once a day, until you buy it or it ends.
const WELCOME_MS = 3 * 86400000;
function welcomeLeft() { if (career.firstSeen == null) { career.firstSeen = clockNow(); save(); } return career.firstSeen + WELCOME_MS - clockNow(); }
function offerWelcome() {
  const it = STORE.find(x => x.id === PID("starterpack"));
  if (S.phase !== "hub" || $("hub").hidden || !it || career.purchases.includes(it.id) || welcomeLeft() <= 0 || career.welcomeDay === bbDay() || !(career.wins + career.losses) || !$("livesSheet").hidden) return;
  career.welcomeDay = bbDay(); save();
  showChoice(`<div class="lifebig">🎁</div><h2>Welcome Pack</h2><div class="muted"><b>${it.blurb}</b></div>
    <div class="big center" style="margin-top:8px"><s style="opacity:.6">${it.value}</s> <b style="color:var(--gold)">${storePrices[it.id] || it.price}</b> · ${it.off}% OFF</div><div class="muted center">Only for new players · ends in ${timeText(welcomeLeft())}</div>`,
    "GET IT", () => { closePages(); shopMode("store"); shopTab = "store"; shopMsg = ""; renderShop(); $("shop").hidden = false; $("shop").classList.add("noback"); buy(it.id); }, "NOT NOW");
}
function offerStarTrade() {
  const vi = career.roughOffer; if (vi == null || !$("livesSheet").hidden || S.phase !== "hub" || $("hub").hidden) return;
  // coins: 4 buy-ins of the middle court you have open (rounded down), a nudge toward easier courts
  const open = VENUES.filter((_, i) => venueUnlocked(i)).length, mid = VENUES[Math.max(0, Math.floor((open + 1) / 2) - 1)];
  const v = VENUES[vi], want = 3 * v.loss, stars = Math.min(want, career.stars), coins = Math.round(4 * mid.fee * stars / want);
  const reset = (took = false) => { career.roughOffer = null; career.roughLosses = 0; career.recent = []; if (took) career.roughAt = clockNow(); save(); renderHub(); }; // only taking it starts the week
  if (stars < 1) { reset(); return; }
  showChoice(`<div class="lifebig">🤝</div><h2>Rough patch?</h2><div class="muted">It happens to everyone. Trade <b>${stars} ⭐</b> for <b><i class="coin"></i> ${short(coins)}</b> to keep playing. An easier court like <b>${mid.name}</b> might be a good place to get back on track.</div>`,
    "TRADE", () => {
      let left = stars;
      for (const i of [vi, ...VENUES.map((_, k) => k).reverse()]) { const id = VENUES[i].id, have = career.courtStars[id] || 0, take = Math.min(have, left); if (take > 0) { career.courtStars[id] = have - take; left -= take; } if (!left) break; }
      updateUnlocks(); career.coins += coins; sfx.win(); haptic("success"); reset(true);
    }, "NO THANKS", () => reset());
}
function showInfo(html) { $("livesBody").innerHTML = html + `<button class="btn" id="infoClose">DONE</button>`; $("infoClose").onclick = () => { $("livesSheet").hidden = true; }; $("livesSheet").hidden = false; }
function cansInfoHTML() {
  return `<h2>🥫 Cans</h2><div class="muted">Win a match to get a can, and there's a free one every day. Your cooler holds ${COOLER_SIZE}. Open one at a time: the better the can, the longer it takes, and Express cans open right away. Sink more cornholes in a match for a better shot at a rare can.</div>
    <div class="cangrid">${CANS.map(c => `<div>${canPic(c.id)}<span>${c.name}</span></div>`).join("")}</div>`;
}



// ── Your profile (tap your avatar): Avatar, Profile (handle and stats) and Settings (volume, haptics, alerts).
let ptab = "settings";
function openAvatars(tab) { if (tab) ptab = tab; renderProfile(); $("avatarSheet").hidden = false; }
function renderProfile() {
  for (const b of document.querySelectorAll(".ptabs button")) b.classList.toggle("on", b.dataset.ptab === ptab);
  $("ptabAvatar").hidden = ptab !== "avatar"; $("ptabProfile").hidden = ptab !== "profile"; $("ptabSettings").hidden = ptab !== "settings";
  if (ptab === "avatar") {
    const grid = $("avatarGrid"); grid.innerHTML = "";
    $("useGcPhoto").hidden = true;
    if (gcPhoto) { // your Game Center picture first, so you can always go back to it
      const b = document.createElement("button");
      b.className = "avpick" + (career.avatar === "gc" ? " on" : "");
      b.innerHTML = avatarHTML("gc") + `<small>Game Center</small>`;
      b.onclick = () => { career.avatar = "gc"; career.avatarSet = true; save(); renderProfile(); renderHubExtras(); };
      grid.appendChild(b);
    }
    for (const a of AVATARS) {
      const open = avatarOpen(a), b = document.createElement("button");
      b.className = "avpick" + (career.avatar === a.id ? " on" : "") + (open ? "" : " avlock");
      b.innerHTML = avatarHTML(a.id) + (open ? "" : `<small>🔒 Court ${a.court + 1}</small>`);
      b.onclick = () => { if (!open) return; career.avatar = a.id; career.avatarSet = true; save(); renderProfile(); renderHubExtras(); };
      grid.appendChild(b);
    }
  } else if (ptab === "profile") {
    const s = seasonState(), opened = VENUES.filter((_, i) => venueUnlocked(i)).length;
    $("ptabProfile").innerHTML = `<div class="profilehead">${avatarHTML(career.avatar)}<div><h2 style="margin:0;text-align:left;font-size:24px;overflow-wrap:anywhere">${esc(myHandle())}</h2><div class="muted">${TITLE_ICONS[s.title]} ${TITLES[s.title]}</div></div></div>
      <div class="handlebox"><div class="label">Your handle</div><input id="handleIn" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(myHandle())}">
        <div class="err" id="handleErr"></div><button class="btn green" id="handleSave">SAVE HANDLE</button>
        <div class="muted">3 to 16 letters, numbers, dots, dashes or underscores. Other players see this in Throwdowns.</div></div>
      <div class="pstats"><div><b>${bigNum(career.stars)}</b><small>Stars</small></div><div><b>${opened}/${VENUES.length}</b><small>Courts</small></div><div><b>${career.fourBaggers || 0}</b><small>4-baggers</small></div>
        <div><b>${career.wins}</b><small>Wins</small></div><div><b>${career.losses}</b><small>Losses</small></div><div><b>${career.wins + career.losses ? Math.round(career.wins / (career.wins + career.losses) * 100) : 0}%</b><small>Win rate</small></div></div>`;
    $("handleSave").onclick = () => {
      const v = $("handleIn").value.trim();
      if (!setHandle(v)) { $("handleErr").textContent = rudeName(v) ? "That name isn't allowed. Please pick another." : "Use 3–16 letters, numbers, dots, dashes or underscores."; return; }
      $("handleErr").textContent = ""; sfx.tick(); renderProfile();
    };
  } else {
    $("ptabSettings").innerHTML = `<h2>Settings</h2>
      <div class="setrow vol"><span>🎵 Music</span><input type="range" id="musicVolIn" min="0" max="100" value="${Math.round(musicVol * 100)}" aria-label="Music volume"><button class="btn small" id="setMusic">${musicOn ? "ON" : "OFF"}</button></div>
      <div class="setrow vol"><span>🔊 Effects</span><input type="range" id="sfxVolIn" min="0" max="100" value="${Math.round(sfxVol * 100)}" aria-label="Effects volume"><button class="btn small" id="setSfx">${sfxOn ? "ON" : "OFF"}</button></div>
      <div class="setrow"><span>📳 Haptics</span><button class="btn small" id="setHaptics">${career.haptics !== false ? "ON" : "OFF"}</button></div>
      <div class="setrow"><span>🔔 Alerts (Daily Drops, cans ready)</span><button class="btn small" id="setAlerts">${career.alerts ? "ON" : "OFF"}</button></div>
      ${nativeBridge && nativeBridge.gamecenter ? `<div class="setrow"><span>🎮 Game Center<br><small class="muted">${gcSignedIn ? `Signed in as ${esc(gcSignedIn)}` : "Not signed in: needed for Rankings and online play"}</small></span>${gcSignedIn ? "" : `<button class="btn small" id="setGc">SIGN IN</button>`}</div>` : ""}
      <button class="btn ghost" id="setHelp" style="width:100%;margin-top:12px;font-size:17px;padding:12px">❓ How to Play &amp; Rules</button>
      <button class="btn ghost" id="setTour" style="width:100%;margin-top:8px;font-size:17px;padding:12px">🧭 Clubhouse tour</button>
      <div class="row" style="justify-content:center;gap:4px 18px;flex-wrap:wrap;margin-top:12px;font-size:14px"><button class="linkbtn" id="setPrivacy">Privacy Policy</button><button class="linkbtn" id="setTerms">Terms of Service</button></div>
      <button class="linkbtn" id="setReset" style="display:block;margin:14px auto 0;font-size:13px;color:#ff8a7a">Start over (erase my progress)</button>`;
    $("setReset").onclick = () => showChoice(`<div class="lifebig">⚠️</div><h2>Start over?</h2><div class="muted">This erases your coins, bottle caps, stars, courts, cans and items on every device signed in to your Game Center / iCloud account. It can't be undone.<br><br>Things you bought with real money come back with <b>Restore purchases</b> in the Store.</div>`,
      "ERASE", () => showChoice(`<h2>Are you sure?</h2><div class="muted">Everything goes back to a brand-new game.</div>`, "YES, START OVER", () => {
        // a brand-new player (new guest name too), but without the tutorial and tour
        career = { ...fresh(), tourDone: true, tutorialDone: true, tourGift: true }; save(); // saved now, so it's the newest copy everywhere
        // start over in place (a reload in the iPhone app would bring back the copy the app handed the game at launch)
        updateUnlocks(); hubVenue = 0; closePages(); showHubPage("home"); renderHub();
      }, "CANCEL", null, "red"), "CANCEL", null, "red");
    $("setPrivacy").onclick = () => openLink(LEGAL_URL + "privacy.html");
    $("setTerms").onclick = () => openLink(LEGAL_URL + "terms.html");
    if ($("setGc")) $("setGc").onclick = () => postNative("gamecenter", "signin-now");
    $("setTour").onclick = () => { $("avatarSheet").hidden = true; startTour(true); };
    $("setHelp").onclick = () => { $("avatarSheet").hidden = true; $("helpSheet").hidden = false; };
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
$("avatarBtn").onclick = () => { closePages(); openAvatars("profile"); $("avatarSheet").classList.remove("noback"); }; // your profile and stats
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
  $("canDone").hidden = true; $("canNav").hidden = true; $("prizeGrid").hidden = true; $("prizeGrid").innerHTML = "";
  $("canSheet").hidden = false;
  can3dBuild(can);
  renderHub();
}
$("canStage").onclick = e => {
  if (!canRun || e.target.closest("button")) return;
  initAudio();
  if (canRun.step === "closed") {
    canRun.step = "shaking"; $("canBody").classList.add("shake"); can3dShake(); $("canHint").hidden = true; sfx.tick(); haptic("light");
    setTimeout(popCan, 900 / (window.__canSlow || 1));
  } else if (canRun.step === "prizes") nextPrize();
};
function popCan() {
  const R = canRun; if (!R) return;
  const body = $("canBody"); body.classList.remove("shake"); body.classList.add("open"); can3dPop();
  sfx.whoosh(); haptic("big"); if (R.can.pulls >= 5) sfx.boom();
  // The spray is the 3D fizz (g4c_can3d.js); prizes start once it has burst.
  setTimeout(() => { body.classList.add("gone"); R.step = "prizes"; nextPrize(); }, 1800 / (window.__canSlow || 1));
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
  if (p.kind === "caps") return { pic: `<div class="pic"><i class="bcap big"></i></div>`, line: `<b>+${p.n} bottle cap${p.n === 1 ? "" : "s"}</b><small>Open cans early with these</small>`, chip: `<i class="bcap"></i> ${p.n}` };
  if (p.kind === "life") return { pic: `<div class="pic"><i class="tkt big"></i></div>`, line: `<b>+1 life!</b><small>A bonus ticket</small>`, chip: '<i class="tkt"></i> +1' };
  const icon = p.cat === "trail" ? (TRAILS.find(t => t.id === p.id) || {}).icon : p.cat === "fx" ? (EFFECTS.find(t => t.id === p.id) || {}).icon : "";
  const kind = { bag: "Bag", board: "Board", trail: "Throw effect", fx: "Cornhole effect" }[p.cat];
  const status = p.unlocked ? `<small class="new">UNLOCKED!</small>` : p.owned ? `<small>Already yours: +${p.coins.toLocaleString()} coins</small>` : `<small>${p.have} / ${p.need} cards</small>`;
  return { pic: icon ? `<div class="pic">${icon}</div>` : `<canvas data-cat="${p.cat}" data-id="${p.id}" width="96" height="96"></canvas>`, line: `<b>${p.n} × ${esc(p.name)}</b><small>${kind} cards</small>${status}`, chip: `${icon || "🃏"} ${p.n}× ${esc(p.name)}${p.unlocked ? " ✨" : ""}` };
}
// Every prize as a tile on one screen: after the last prize, or straight away with COLLECT ALL.
function showPrizeSummary() {
  const R = canRun; if (!R || R.step === "done") return;
  R.step = "done"; R.shown = R.prizes.length;
  $("prize").className = "prize"; $("canHint").hidden = true; $("canNav").hidden = true; $("prizeList").innerHTML = "";
  const grid = $("prizeGrid"); grid.innerHTML = "";
  // Rows as even as possible: 4 → 2+2, 5 → 3+2, 6 → 3+3, 7 → 3+2+2, 8 → 3+3+2, 10 → 4+3+3 ...
  const n = R.prizes.length, rows = n === 4 ? 2 : Math.ceil(n / (n > 9 ? 4 : 3)), cols = Math.ceil(n / rows);
  grid.style.setProperty("--cols", cols);
  const rowEls = [];
  for (let k = 0; k < rows; k++) { const row = document.createElement("div"); row.className = "prow"; grid.appendChild(row); rowEls.push(row); }
  const rowOf = i => { let start = 0; for (let k = 0; k < rows; k++) { const c = Math.floor(n / rows) + (k < n % rows ? 1 : 0); if (i < start + c) return rowEls[k]; start += c; } return rowEls[rows - 1]; };
  R.prizes.forEach((p, i) => {
    const t = document.createElement("div"); t.className = "ptile" + (p.unlocked ? " new" : ""); t.style.animationDelay = `${i * 0.06}s`;
    if (p.kind === "coins") t.innerHTML = `<div class="pic"><i class="coin big"></i></div><b>+${short(p.n)}</b><small>coins</small>`;
    else if (p.kind === "caps") t.innerHTML = `<div class="pic"><i class="bcap big"></i></div><b>+${p.n}</b><small>bottle caps</small>`;
    else if (p.kind === "life") t.innerHTML = `<div class="pic"><i class="tkt big"></i></div><b>+1</b><small>ticket</small>`;
    else {
      const h = prizeHTML(p);
      t.innerHTML = `${h.pic}<b>${p.n} × ${esc(p.name)}</b><small class="${p.unlocked ? "new" : ""}">${p.unlocked ? "UNLOCKED!" : p.owned ? `+${short(p.coins)} coins` : `${p.have}/${p.need} cards`}</small>`;
      const cv = t.querySelector("canvas");
      if (cv) { const ctx = cv.getContext("2d"); if (cv.dataset.cat === "bag") paintBag(ctx, 96, 96, bagById(cv.dataset.id)); else { const tmp = document.createElement("canvas"); tmp.width = 96; tmp.height = 192; paintBoard(tmp.getContext("2d"), 96, 192, boardById(cv.dataset.id)); ctx.drawImage(tmp, 24, 0, 48, 96); } }
    }
    rowOf(i).appendChild(t);
  });
  grid.hidden = false; $("canDone").hidden = false; $("canTitle").textContent = `${R.prizes.length} prize${R.prizes.length === 1 ? "" : "s"}!`;
  if (R.streak) grid.insertAdjacentHTML("beforeend", streakNote(R));
  sfx.win(); haptic("success");
}
$("canSkip").onclick = e => { e.stopPropagation(); showPrizeSummary(); };
$("canNext").onclick = e => { e.stopPropagation(); nextPrize(); };
function nextPrize() {
  const R = canRun; if (!R) return;
  if (R.shown >= R.prizes.length) { showPrizeSummary(); return; }
  const p = R.prizes[R.shown++], h = prizeHTML(p), el = $("prize");
  el.className = "prize"; void el.offsetWidth;
  el.innerHTML = h.pic + h.line + streakNote(R); el.className = "prize show";
  const cv = el.querySelector("canvas");
  if (cv) {
    const ctx = cv.getContext("2d");
    if (cv.dataset.cat === "bag") paintBag(ctx, 96, 96, bagById(cv.dataset.id));
    else { const tmp = document.createElement("canvas"); tmp.width = 96; tmp.height = 192; paintBoard(tmp.getContext("2d"), 96, 192, boardById(cv.dataset.id)); ctx.drawImage(tmp, 24, 0, 48, 96); }
  }
  if (p.unlocked || p.kind === "life") { sfx.win(); haptic("success"); } else { sfx.tick(); haptic("light"); }
  // NEXT (and COLLECT ALL while more are left) under the prize; the last one finishes
  const more = R.shown < R.prizes.length;
  $("canNav").hidden = false; $("canSkip").hidden = !more; $("canNext").textContent = more ? `NEXT · ${R.prizes.length - R.shown} LEFT` : "FINISH";
}
// A Daily Drop's streak, under its prize: how many in a row so far, and what 4 in a row gets you.
function streakNote(R) {
  if (!R.streak) return "";
  const st = R.streak, dots = [1, 2, 3, 4].map(k => k <= st ? "🔥" : "⚪").join("");
  return `<div class="streaknote">${dots}<br>${st >= 4 ? "<b>4 in a row!</b> A bonus can is next." : `<b>${st} of 4 in a row.</b> Open 4 Daily Drops in a row for a bonus can. Letting 2 pile up starts it over.`}</div>`;
}
// After the prizes: a pop-up for every item your cards just unlocked.
function showUnlocks(prizes) {
  const got = prizes.filter(p => p.kind === "cards" && p.unlocked);
  if (!got.length) return false;
  const kind = { bag: "Bag", board: "Board", trail: "Throw effect", fx: "Cornhole effect" };
  const pic = p => {
    if (p.cat === "trail" || p.cat === "fx") return `<div class="unlockpic">${((p.cat === "trail" ? TRAILS : EFFECTS).find(t => t.id === p.id) || {}).icon || "🎁"}</div>`;
    const c = document.createElement("canvas"); c.width = 96; c.height = 96; const ctx = c.getContext("2d");
    if (p.cat === "bag") paintBag(ctx, 96, 96, bagById(p.id));
    else { const tmp = document.createElement("canvas"); tmp.width = 96; tmp.height = 192; paintBoard(tmp.getContext("2d"), 96, 192, boardById(p.id)); ctx.drawImage(tmp, 24, 0, 48, 96); }
    return `<img class="unlockpic" src="${c.toDataURL()}" alt="">`;
  };
  showInfo(`<div class="unlockbig">🎉</div><h2>Unlocked!</h2><div class="muted">You collected all the cards, so ${got.length === 1 ? "this is" : "these are"} yours now. Pick ${got.length === 1 ? "it" : "them"} in the Shop.</div>
    <div class="unlocklist">${got.map(p => `<div>${pic(p)}<b>${esc(p.name)}</b><small>${kind[p.cat]}</small></div>`).join("")}</div>`);
  sfx.win(); haptic("success");
  return true;
}
$("canDone").onclick = () => {
  const prizes = canRun ? canRun.prizes : [];
  $("canSheet").hidden = true; $("prizeGrid").hidden = true; canRun = null; renderHub();
  showUnlocks(prizes);
  const i = career.cans.findIndex(c => c.bonus); // a Daily Drop streak bonus waiting: open it next
  if (i >= 0) { delete career.cans[i].bonus; save(); const t = document.createElement("div"); t.className = "toast"; t.textContent = "4 in a row! Here's a bonus can 🎉"; $("hub").appendChild(t); setTimeout(() => t.remove(), 2600); setTimeout(() => openCanSheet(i), 700); }
};

let gcSignedIn = ""; // the Game Center name once the iPhone app reports a signed-in player
// The privacy policy and terms of service (published from the repository's docs/ folder with GitHub Pages).
const LEGAL_URL = "https://jeff-gill.github.io/Cornhole-iOS-app/";
function openLink(url) { if (nativeBridge && nativeBridge.open) postNative("open", url); else window.open(url, "_blank", "noopener"); }

// ── Season badge and ladder
function beginnerHTML() {
  const w = career.wins || 0;
  return w < BEGINNER_WINS ? `${w} of ${BEGINNER_WINS} wins to Rookie` : `Win 2 in a row for Rookie`;
}
function renderSeasonBadge() {
  if (isBeginner()) { $("seasonBtn").innerHTML = `🌱 <b>Beginner</b> · ${beginnerHTML()}`; return; }
  const s = seasonState(), days = Math.max(1, Math.ceil((seasonEnds() - clockNow()) / 86400000));
  $("seasonBtn").innerHTML = `${TITLE_ICONS[s.title]} <b>${TITLES[s.title]}</b> · ${days} day${days > 1 ? "s" : ""} left`;
}
let rankTab = "group";
function openSeason(tab) {
  if (tab) rankTab = tab;
  const s = seasonState(), days = Math.max(1, Math.ceil((seasonEnds() - clockNow()) / 86400000));
  const rows = TITLES.map((t, i) => `<div class="${i === s.title ? "me" : i > s.title ? "locked2" : ""}"><span>${TITLE_ICONS[i]}</span><span>${t}${i === s.title ? " <small>YOU</small>" : ""}</span><small>${i === TITLES.length - 1 ? "Top title" : `Top ${Math.round(PROMOTE[i] * 100)}% up`}${i ? ` · +${i * 5}% cards` : ""}</small></div>`).reverse().join("");
  // In the browser preview there's no Game Center, so the first two titles show your group of CPU players.
  if (!(nativeBridge && nativeBridge.season) && BOT_FILL[s.title]) S.groupStandings = { ...groupFor([["me", s.points, myHandle(), 1]], "me", s.id, s.title), me: "me" };
  const G = S.groupStandings;
  if (!G && nativeBridge && nativeBridge.season && !openSeason.asked) { openSeason.asked = true; postNative("season", JSON.stringify({ op: "standings", title: s.title })); }
  let group = `<div class="muted center" style="margin-top:20px">Your group shows here once Game Center has the season's scores.</div>`;
  if (G && G.size) {
    const up = promoteCount(s.title, G.size), down = demoteCount(s.title, G.size);
    // promotion places go to real players only (computer players can't move up); relegation counts everyone
    let rr = 0; const realAt = G.list.map(e => (isBot(e) ? 0 : ++rr)), lastUp = realAt.findIndex(n => n === up);
    const zone = (r, i) => (realAt[i] && realAt[i] <= up ? " up" : r > G.size - down ? " down" : "");
    const row = (e, r) => `<div class="${e[0] === G.me ? "me" : ""}${zone(r, r - 1)}"><span>${r}</span><span>${esc(String(e[2] || "Player"))}</span><small><i class="coin" style="width:13px;height:13px;vertical-align:-2px"></i> ${short(e[1])}</small></div>`;
    const myZone = zone(G.rank, G.rank - 1), where = myZone === " up" ? (s.played >= MIN_MATCHES_TO_PROMOTE ? "You're in the promotion zone!" : `You're in the promotion zone. Play ${MIN_MATCHES_TO_PROMOTE - s.played} more match${MIN_MATCHES_TO_PROMOTE - s.played > 1 ? "es" : ""} to qualify.`) : myZone === " down" ? "You're in the demotion zone." : "";
    const list = G.list.map((e, i) => (i === G.size - down && down ? `<div class="zoneline down">▼ RELEGATION LINE ▼</div>` : "") + row(e, i + 1) + (i === lastUp ? `<div class="zoneline up">▲ PROMOTION LINE ▲</div>` : "")).join("");
    group = `<div class="label">Your group (${G.size} players)</div><div class="gwrap"><div class="ladder group" id="groupList">${list}</div><div class="gbar" id="groupBar"><i></i></div></div>
      <div class="muted">${up ? `Top ${up} move up` : "The top title"}${down ? ` · bottom ${down} move down` : ""}. ${where}</div>`;
  }
  const head = `<div class="big">${TITLE_ICONS[s.title]} ${TITLES[s.title]} · <i class="coin" style="width:20px;height:20px;vertical-align:-3px"></i> ${short(s.points)} won</div><div class="muted">${days} day${days > 1 ? "s" : ""} left this season.</div>`;
  const learner = `<div class="lifebig">🌱</div><h2>You're a Beginner</h2><div class="muted center">${beginnerHTML()}. Win ${BEGINNER_WINS} matches, the last two in a row, to become a <b>Rookie</b> and start climbing the season titles.</div>`;
  const body = isBeginner() && rankTab !== "gc" ? learner : rankTab === "group" ? head + group
    : rankTab === "ladder" ? `${head}<div class="muted infotext">Your season score is the coins you win from matches this month. Each season is a calendar month, and every title is a league split into groups of up to 100. The higher the title, the harder it is to move up. As many players drop into each title as move up out of it, so groups stay full. Play at least ${MIN_MATCHES_TO_PROMOTE} matches to be promoted. The top 20 in each group win a can (Platinum for 1st, Gold for 2nd, Silver for 3rd, Backyard Black for the rest, one better for every title above Rookie), and each title adds 5% more cards to every can you open.</div><div class="ladder">${rows}</div>`
    : `<div class="muted">The worldwide Game Center leaderboards.</div>
      <button class="btn lbbtn" data-lb="stars"><span>⭐</span>Most stars</button><button class="btn lbbtn" data-lb="wins"><span>🏆</span>Most wins</button><button class="btn lbbtn" data-lb="fourBaggers"><span>🎯</span>Most 4-baggers</button>`;
  $("rankBody").innerHTML = `<div class="tabs">${[["group", "MY GROUP"], ["ladder", "TITLES"], ["gc", "GAME CENTER"]].map(([k, l]) => `<button data-rt="${k}" class="${rankTab === k ? "on" : ""}">${l}</button>`).join("")}</div>${body}`;
  for (const b of $("rankBody").querySelectorAll("[data-rt]")) b.onclick = () => openSeason(b.dataset.rt);
  for (const b of $("rankBody").querySelectorAll("[data-lb]")) b.onclick = () => openRankings();
  closePages(); $("rankSheet").hidden = false; $("rankSheet").classList.add("noback");
  const gl = $("groupList");
  if (gl) {
    const me = gl.querySelector(".me"); // start the list at your own row
    if (me) gl.scrollTop = me.offsetTop - gl.clientHeight / 2 + me.clientHeight / 2;
    const bar = $("groupBar").firstElementChild, sync = () => { // the white scroll indicator
      const h = gl.clientHeight, H = gl.scrollHeight, track = $("groupBar").clientHeight, th = Math.max(28, track * h / Math.max(h, H));
      bar.style.height = th + "px"; bar.style.top = ((track - th) * (gl.scrollTop / Math.max(1, H - h))) + "px";
    };
    gl.onscroll = sync; requestAnimationFrame(sync);
  }
}
function showSeasonResult() {
  const L = seasonState().last; if (!L || L.shown) return;
  L.shown = true; save(); renderSeasonBadge();
  const up = L.to > L.from, down = L.to < L.from;
  showInfo(`<div class="lifebig">${TITLE_ICONS[L.to]}</div><h2>${up ? "Promoted!" : down ? "Moved down" : "Season over"}</h2>
    <div class="big">${up ? `You're now a ${TITLES[L.to]}` : down ? `You're back to ${TITLES[L.to]}` : `You stay a ${TITLES[L.to]}`}</div>
    <div class="muted">Last season you won ${short(L.points)} coins${L.rank ? ` and finished #${L.rank} of ${L.size} in your group` : ""}. A new season has started.</div>
    ${L.reward ? `<div class="big" style="color:${COL.gold}">🥫 Season prize: ${canById(L.reward).name} can (in your cooler)</div>` : ""}`);
  if (up) { sfx.win(); haptic("success"); }
}
$("seasonBtn").onclick = () => openSeason("group");

// ── Daily Drop (Golf Clash's free chest): a free prize every 4 hours, up to 2 waiting, given straight away. These are its prizes.
// Small, steady prizes: opening all six a day comes to about 150-200 coins, 1-2 bottle caps and 1-2 bag or board cards
// (enough to keep playing the first court), with a rare can. Common prizes have big slices, the best thin ones. Coins
// grow with your season title, and the can
// slices move up a tier every four titles (Rookie: Black, Bronze and Gold cans; Hall of Famer: Bronze, Silver and Purple).
// Extra spins can be bought (1 / 3 / 5, like Bullseye throws). A spin is always worth less than its price in the store's
// own coins, caps and cans (about 10% at Rookie, about 60% at Hall of Famer), so buying spins never beats buying outright.
const DAILY_COINS_BY_TITLE = [100, 200, 350, 600, 1000, 1600, 2500, 4000, 6000];
const dailyTitle = () => clamp(seasonState().title | 0, 0, DAILY_COINS_BY_TITLE.length - 1);
const dailyCoins = () => Math.round(DAILY_COINS_BY_TITLE[dailyTitle()] * Math.max(1, VENUES[topCourt()].fee / 100)); // bigger as you move up the courts
const CAN_LADDER = ["black", "white", "bronze", "silver", "gold", "purple", "platinum", "diamond"];
function wheelSlices() {
  const t = dailyTitle(), f = dailyCoins() / 100, up = Math.min(2, t >> 2), can = k => CAN_LADDER[Math.min(CAN_LADDER.length - 1, k + up)];
  const co = n => Math.round(n * f / 5) * 5;
  // round the wheel in this order (big and small slices mixed); w is the slice's share of the wheel
  return [
    { w: 26, coins: co(25), col: "#2f86ff" },
    { w: 13, caps: 1, col: "#2fbf71" },
    { w: 20, coins: co(40), col: "#00c2d1" },
    { w: 18, card: true, col: "#8a4dff" },
    { w: 9, coins: co(75), col: "#ff8a1f" },
    { w: 5, caps: 2, col: "#e8392b" },
    { w: 4, can: can(0), col: "#ff2e88" },
    { w: 1, can: can(2), col: "#ffc93a", jackpot: true },
  ];
}
// a bag or board card from the wheel, mostly the cheaper ones
function wheelCard() { // which card (paid when the Daily Drop can opens)
  const key = Math.random() < 0.5 ? "bag" : "board", cat = CARD_CATS.find(c => c.key === key); // (pick once, then look it up)
  const items = cardReach(cardItems(cat)), w = items.map((_, i) => Math.exp(-5 * i / Math.max(1, items.length - 1)));
  let y = Math.random() * w.reduce((t, v) => t + v, 0), it = items[0];
  for (let i = 0; i < items.length; i++) { y -= w[i]; if (y <= 0) { it = items[i]; break; } }
  return { cat: cat.key, id: it.id };
}
const dailyFree = () => giftState().n > 0; // a free Daily Drop waiting (never more than 2)
const dailyReady = () => dailyFree() || (career.spins || 0) > 0; // the free spin, or bought ones
function renderDaily() { // always there: bobbing when it's ready, still (with a countdown to midnight) once spun
  const ready = dailyReady(); $("dailyBtn").classList.toggle("ready", ready);
  const n = giftState().n;
  $("dailySub").innerHTML = dailyFree() ? (n > 1 ? "2 ready to open!" : "Ready to open!") : ready ? `${career.spins} extra left` : `Next in ${timeText(giftNextIn())}`;
}
let wheelSpin = null; // (kept for the purchase handler: there's no spinning any more)
// Tapping Daily Drop: if a drop is ready (a free one every 4 hours, up to 2 waiting, or a bought one), the prize comes
// straight away, picked by the prize table's weights. If not, a sheet shows when the next free one comes and offers more.
function takeDrop() {
  const segs = wheelSlices(), total = segs.reduce((t, x) => t + x.w, 0);
  let x = Math.random() * total, pick = segs[0];
  for (const sg of segs) { x -= sg.w; if (x <= 0) { pick = sg; break; } }
  if (!useFreeSpin()) career.spins--; // a free drop first, then bought ones
  // A can drops and you open it, like every other prize: the red Daily Drop can holding its one prize, or (now and then)
  // the prize can itself.
  // Streak: every 4th Daily Drop in a row also drops a bonus can (opened right after); letting 2 pile up resets it.
  // The drop remembers where the streak stands, so its prize reveal can say so.
  const g = giftState(); g.streak = (g.streak || 0) + 1;
  const bonus = g.streak >= 4, streak = bonus ? 4 : g.streak;
  if (pick.can) career.cans.push({ id: pick.can, court: topCourt(), instant: true, streak });
  else career.cans.push({ id: "daily", court: topCourt(), instant: true, streak, drop: pick.card ? { card: wheelCard() } : { coins: pick.coins, caps: pick.caps } });
  if (bonus) { g.streak = 0; career.cans.push({ id: rollCan({ bronze: 55, silver: 35, gold: 10 }), court: topCourt(), instant: true, bonus: true }); }
  save(); renderHub();
  openCanSheet(career.cans.findIndex(c => c.instant && !c.bonus && (c.id === "daily" || c.id === pick.can)));
}
const WHEEL_STORE = ["wheel.1", "wheel.3", "wheel.5"].map(PID); // extra Daily Drops
function wheelBuyRow() {
  const price = id => storePrices[id] || STORE.find(x => x.id === id).price;
  return `<div class="bbbuy">${WHEEL_STORE.map(id => { const it = STORE.find(x => x.id === id); return `<button class="btn blue" data-wbuy="${id}" ${pendingBuy === id ? "disabled" : ""}><b>${it.spins}</b> drop${it.spins > 1 ? "s" : ""}<small>${pendingBuy === id ? "…" : price(id)}</small></button>`; }).join("")}</div>`;
}
function openWheel(msg = "") {
  if (!msg && dailyReady()) { takeDrop(); return; }
  $("wheelBody").innerHTML = `<h2>🎁 Daily Drop</h2><div class="muted">A free Daily Drop every 4 hours, and up to 2 wait for you: coins, bottle caps, bag and board cards, and now and then a can.</div>
    <div class="big">${dailyReady() ? "A Daily Drop is ready!" : `Next free one in ${timeText(giftNextIn())}`}</div>
    ${dailyReady() ? `<button class="btn green go" id="wheelGo">OPEN IT</button>` : ""}
    <div class="label center">More Daily Drops</div>${wheelBuyRow()}
    ${msg ? `<div class="muted center">${esc(msg)}</div>` : ""}
    <button class="btn" id="wheelClose">CLOSE</button>`;
  $("wheelSheet").hidden = false;
  $("wheelClose").onclick = () => { $("wheelSheet").hidden = true; renderHub(); };
  if ($("wheelGo")) $("wheelGo").onclick = () => { $("wheelSheet").hidden = true; takeDrop(); };
  for (const b of $("wheelBody").querySelectorAll("[data-wbuy]")) b.onclick = () => {
    if (!canBuy()) { openWheel("Purchases are available in the iPhone app."); return; }
    pendingBuy = b.dataset.wbuy; postNative("purchase", pendingBuy); openWheel(" ");
  };
}
$("dailyBtn").onclick = () => { initAudio(); openWheel(); };

// ── Practice setup: how many players, their names, and the wind.
function practiceCfg() {
  const P = (career.practiceCfg ||= { players: 2, names: [], wind: null });
  const defaults = [myHandle(), "Player 2", "Player 3", "Player 4"];
  for (let i = 0; i < 4; i++) if (!P.names[i]) P.names[i] = defaults[i];
  return P;
}
function openPractice() { renderPractice(); $("practiceSheet").hidden = false; }
function renderPractice() {
  const P = practiceCfg(), v = VENUES[hubVenue];
  const slots = P.players === 1 ? [["You", 0]] : P.players === 2 ? [["Player 1", 0], ["Player 2", 1]] : [["Team 1 · A", 0], ["Team 2 · A", 1], ["Team 1 · B", 0], ["Team 2 · B", 1]];
  $("practiceBody").innerHTML = `<h2>Practice</h2><div class="muted">${esc(v.name)} · no buy-in or stars</div>
    <div class="label">Players</div>
    <div class="seg" id="pPlayers">${[1, 2, 4].map(n => `<button data-n="${n}" class="${P.players === n ? "on" : ""}">${n}</button>`).join("")}</div>
    <div class="label">Names</div>
    <div class="pnames">${slots.map(([lbl, team], i) => `<label><span><i style="background:${COL.p[team]}"></i>${lbl}</span><input data-i="${i}" maxlength="16" value="${esc(P.names[i])}" autocomplete="off" spellcheck="false"></label>`).join("")}</div>
    ${P.players === 4 ? `<div class="muted">Throws go Team 1 A, Team 2 A, Team 1 B, Team 2 B, then repeat.</div>` : ""}
    <div class="label">Wind</div>
    <div class="windset"><input type="range" id="pWind" min="0" max="20" value="${P.wind ?? 5}" ${P.wind == null ? "disabled" : ""}><button class="btn small" id="pWindMode">${P.wind == null ? "RANDOM" : `${P.wind} MPH`}</button></div>
    <button class="btn green go" id="pStart">START PRACTICE</button>`;
  for (const b of document.querySelectorAll("#pPlayers button")) b.onclick = () => { P.players = +b.dataset.n; save(); renderPractice(); };
  for (const inp of document.querySelectorAll(".pnames input")) inp.oninput = () => { P.names[+inp.dataset.i] = inp.value.slice(0, 16); save(); };
  $("pWind").oninput = e => { P.wind = +e.target.value; $("pWindMode").textContent = `${P.wind} MPH`; save(); };
  $("pWindMode").onclick = () => { P.wind = P.wind == null ? 5 : null; save(); renderPractice(); };
  $("pStart").onclick = () => {
    const names = P.names.map((n, i) => (n || "").trim() || ["Player 1", "Player 2", "Player 3", "Player 4"][i]);
    S.practice = { players: P.players, names, wind: P.wind };
    $("practiceSheet").hidden = true; initAudio(); startMatch("pass", hubVenue);
  };
}

// ───────────────────────── Clubhouse tour
// Runs once, the first time someone opens the game: a spotlight on each part of the clubhouse with a line about it.
// It can be skipped at any step; either way it ends by saying where to find How to Play & Rules and the tour again.
const TOUR = [
  [null, "👋 Welcome!", "Here's a quick look around the clubhouse. You can skip it any time."],
  ["#avatarBtn", "You", "Tap your avatar for your profile and stats. Your stars are underneath: win matches to earn them, and fill a court's stars to open the next court."],
  ["#coinsBtn", "Coins", "Coins pay a court's buy-in, and the winner takes the pot."],
  ["#capsBtn", "Bottle caps", "Use bottle caps to open a prize can right away."],
  ["#seasonBtn", "Your rank", "Your title and the coins you've won this month. Tap it to see your group and the promotion line."],
  ["#dailyBtn", "Daily Drop", "A free prize every 4 hours (up to 2 wait): coins, caps, cards, sometimes a can."],
  ["#bbBtn", "Bullseye Bags", "One free throw a day at a giant bullseye. The closer to the hole, the better the prize."],
  ["#cooler", "Prize Cooler", "Cans you win go here, 4 at most, and open one at a time. Here are two to try: the first is <b>ready</b>, so tap it to open. The second is opening, and we've given you <b>bottle caps</b> to open it right now."],
  ["#throwBagsBtn", "Throw bags", "Pick a court and find an opponent. Practice, free, is the first card."],
  ["#navbar", "Menu", "Settings (with How to Play), your bags and boards, home, the rankings and the Store are always down here."],
];
let tourAt = -1;
function startTour(again) {
  if (!again && career.tourDone) return;
  tourAt = 0; $("tour").hidden = false; showTourStep();
}
function endTour() {
  career.tourDone = true; save(); tourAt = -1;
  $("tourSpot").style.display = "none"; $("tour").classList.add("dim");
  const card = $("tourCard"); card.style.left = card.style.top = ""; card.classList.add("mid");
  card.innerHTML = `<h3>You're all set!</h3><p>You can find <b>How to Play & Rules</b> and this tour any time in <b>Settings</b>, at the bottom right.</p><button class="btn green" id="tourDone">LET'S PLAY</button>`;
  $("tourDone").onclick = () => { $("tour").hidden = true; };
}
function showTourStep() {
  // skip anything that isn't on screen right now (e.g. the daily reward when it's already been claimed)
  while (tourAt < TOUR.length && TOUR[tourAt][0] && !visibleEl(TOUR[tourAt][0])) tourAt++;
  if (tourAt >= TOUR.length) { endTour(); return; }
  const [sel, title, text] = TOUR[tourAt], spot = $("tourSpot"), card = $("tourCard");
  if (sel === "#cooler" && !career.tourGift) { // only for players who take the tour this far
    career.tourGift = true;
    career.cans.push({ id: "black", court: 0, instant: true }, { id: "black", court: 0, start: clockNow() });
    career.caps += skipCost(career.cans[career.cans.length - 1]);
    save(); renderHub();
  }
  const n = TOUR.filter(t => !t[0] || visibleEl(t[0])).length, k = TOUR.slice(0, tourAt + 1).filter(t => !t[0] || visibleEl(t[0])).length;
  card.classList.toggle("mid", !sel);
  card.innerHTML = `<div class="tstep">${k} of ${n}</div><h3>${title}</h3><p>${text}</p>
    <div class="row" style="gap:10px;justify-content:space-between"><button class="btn ghost" id="tourSkip">SKIP</button><button class="btn green" id="tourNext">${k === n ? "DONE" : "NEXT"}</button></div>`;
  $("tourSkip").onclick = endTour;
  $("tourNext").onclick = () => { tourAt++; showTourStep(); };
  $("tour").classList.toggle("dim", !sel);
  if (!sel) { spot.style.display = "none"; card.style.left = card.style.top = ""; return; }
  const el = document.querySelector(sel); el.scrollIntoView({ block: "nearest" });
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(spot.style, { display: "block", left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
  const cw = Math.min(320, innerWidth - 32), below = r.top + r.height / 2 < innerHeight / 2;
  card.style.left = Math.max(16, Math.min(innerWidth - cw - 16, r.left + r.width / 2 - cw / 2)) + "px";
  card.style.top = below ? r.bottom + 16 + "px" : Math.max(16, r.top - 16 - card.offsetHeight) + "px";
}
function visibleEl(sel) { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest("[hidden]"); }

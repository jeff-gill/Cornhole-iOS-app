
// ───────────────────────── Clubhouse extras: avatar, lives, the cooler of cans, and opening a can
const clockText = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const topCourt = () => VENUES.reduce((m, v, i) => (venueUnlocked(i) ? i : m), 0);

function renderHubExtras() {
  tickLives();
  $("avatarBtn").innerHTML = avatarHTML(career.avatar);
  $("lives").textContent = career.lives;
  $("livesTimer").textContent = career.lives < MAX_LIVES ? ` +1 in ${clockText(nextLifeIn())}` : career.lives === MAX_LIVES ? " FULL" : "";
  const cooler = $("cooler"); cooler.innerHTML = "";
  const slots = Math.max(COOLER_SIZE, career.cans.length);
  for (let i = 0; i < slots; i++) {
    const c = career.cans[i], b = document.createElement("button");
    b.className = "cslot" + (c ? " full" : "");
    b.setAttribute("aria-label", c ? `Open ${canById(c.id).name}` : "Empty cooler slot");
    if (c) { const k = canById(c.id); b.innerHTML = `<i class="minican" style="background:linear-gradient(90deg, ${k.color}, ${k.rim} 40%, ${k.color})"></i>`; b.onclick = () => openCanSheet(i); }
    else b.onclick = () => showInfo(cansInfoHTML());
    cooler.appendChild(b);
  }
}

// ── Lives sheet
function openLives() { renderLives(); $("livesSheet").hidden = false; }
function renderLives() {
  tickLives();
  const price = lifePrice(), full = career.lives >= MAX_LIVES;
  $("livesBody").innerHTML = `<div class="lifebig">🍹</div><h2>Lives: ${career.lives}</h2>
    <div class="liferow">${Array.from({ length: Math.max(MAX_LIVES, career.lives) }, (_, i) => `<span class="${i < career.lives ? "" : "gone"}">🍹</span>`).join("")}</div>
    <div class="muted">Each match uses a cocktail. Win and you get it back. One refills every hour, up to ${MAX_LIVES}.</div>
    <div class="big">${full ? "Full!" : `Next one in ${clockText(nextLifeIn())}`}</div>
    <button class="btn green" id="lifeBuy" ${career.coins >= price ? "" : "disabled"}>+1 🍹 · 🪙 ${short(price)}</button>
    <button class="btn blue" id="lifeStore">MORE IN THE STORE</button>
    <button class="btn ghost" id="alertsBtn">🔔 Tell me when they're full: ${career.alerts ? "ON" : "OFF"}</button>
    <button class="btn" id="livesClose">DONE</button>`;
  $("lifeBuy").onclick = () => { if (career.coins < price) return; career.coins -= price; career.lives++; save(); scheduleLivesAlert(); sfx.tick(); renderLives(); renderHub(); };
  $("lifeStore").onclick = () => { $("livesSheet").hidden = true; shopTab = "store"; shopMsg = ""; renderShop(); $("shop").hidden = false; };
  $("alertsBtn").onclick = () => {
    career.alerts = !career.alerts; save();
    if (career.alerts) postNative("notify", JSON.stringify({ op: "permission" }));
    scheduleLivesAlert(); renderLives();
  };
  $("livesClose").onclick = () => { $("livesSheet").hidden = true; };
}
$("livesBtn").onclick = openLives;

// ── A small info sheet (can odds), reusing the lives sheet frame
function showInfo(html) { $("livesBody").innerHTML = html + `<button class="btn" id="infoClose">DONE</button>`; $("infoClose").onclick = () => { $("livesSheet").hidden = true; }; $("livesSheet").hidden = false; }
function cansInfoHTML() {
  const total = CANS.reduce((t, c) => t + c.odds, 0);
  return `<h2>🥫 Cans</h2><div class="muted">Win a match to get a can (your cooler holds ${COOLER_SIZE}). There's a free can every day too. Rarer cans hold more prizes and better cards, but every can is a gamble.</div>
    <div class="label">Chance per win</div>
    ${CANS.map(c => `<div class="oddsrow"><i class="minican" style="background:linear-gradient(90deg, ${c.color}, ${c.rim} 40%, ${c.color})"></i><span>${c.name} · ${c.pulls} prizes</span><b>${(c.odds / total * 100).toFixed(c.odds < 1 ? 1 : 0)}%</b></div>`).join("")}`;
}

// ── Avatar picker
function openAvatars() {
  const grid = $("avatarGrid"); grid.innerHTML = "";
  for (const a of AVATARS) {
    const open = avatarOpen(a), b = document.createElement("button");
    b.className = "avpick" + (career.avatar === a.id ? " on" : "") + (open ? "" : " avlock");
    b.innerHTML = avatarHTML(a.id) + (open ? "" : `<small>🔒 Court ${a.court + 1}</small>`);
    b.onclick = () => { if (!open) return; career.avatar = a.id; save(); openAvatars(); renderHubExtras(); };
    grid.appendChild(b);
  }
  $("avatarSheet").hidden = false;
}
$("avatarBtn").onclick = openAvatars;
$("avatarClose").onclick = () => { $("avatarSheet").hidden = true; };

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
  if (p.kind === "coins") return { pic: `<div class="pic">🪙</div>`, line: `<b>+${p.n.toLocaleString()} coins</b>`, chip: `🪙 ${short(p.n)}` };
  if (p.kind === "life") return { pic: `<div class="pic">🍹</div>`, line: `<b>+1 life!</b><small>A bonus cocktail</small>`, chip: "🍹 +1" };
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

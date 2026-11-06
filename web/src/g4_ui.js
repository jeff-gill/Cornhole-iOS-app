
// ───────────────────────── Cameras
const camPos = new THREE.Vector3(0, 9, 10), camLook = new THREE.Vector3(0, 0, -27);
const tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
function camMode() {
  if (S.phase === "hub") return "intro";
  if (S.phase === "aiming") return "aim";
  if (S.phase === "throw") return "throw";
  if (S.phase === "cpu") return S.cpuT < 0.6 ? "aim" : "throw";
  if (S.phase === "flight") {
    const b = S.world.bags.find(x => x.id === S.lastId);
    if (b && b.state === "flying" && b.y < FY - 7) return "follow";
    return "watch";
  }
  return "watch";
}
function updateCamera(dt) {
  const mode = camMode(), rel = release(S.player), narrow = camera.aspect < 0.7;
  let k = 3, fov = narrow ? 50 : 42;
  if (mode === "intro") {
    // Slow orbit; looking a little below the board keeps it in the top half, above the clubhouse card.
    const a = S.time * 0.1;
    tPos.set(Math.sin(a) * 9.5, 5.2, -FY - 2 + Math.cos(a) * 9.5); tLook.set(0, -2.6, -FY - 2);
  } else if (mode === "aim") {
    tPos.set(rel.x * 0.25, narrow ? 7.4 : 6.6, -(FY - (narrow ? 3.0 : 3.6))); tLook.set(0, 0.3, -(FY + 2.15));
  } else if (mode === "throw") {
    // Behind the thrower's hand in their pitcher's box, looking down their real line to the board.
    tPos.set(rel.x * 1.25, 5.0, 2.8); tLook.set(rel.x * 0.1, 2.6, -FY - 1);
    fov = narrow ? 38 : 32;
  } else if (mode === "follow") {
    const b = S.world.bags.find(x => x.id === S.lastId);
    tPos.set(lerp(rel.x, b.x, 0.6), Math.max(3.2, b.z * 0.7 + 2.6), -b.y + 7.5); tLook.set(b.x * 0.5, b.z * 0.4, -b.y - 6);
    k = 5;
  } else {
    tPos.set(rel.x * 0.4, narrow ? 6.3 : 5.6, -(FY - (narrow ? 3.8 : 4.4))); tLook.set(0, 0.3, -(FY + 2.0));
  }
  const t = 1 - Math.exp(-dt * k);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = lerp(camera.fov, fov, t); camera.updateProjectionMatrix(); }
  camPos.lerp(tPos, t); camLook.lerp(tLook, t);
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(shake * 0.3));
  camera.lookAt(camLook);
}

// ───────────────────────── Input
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function courtPoint(e) { // where a screen point hits the (extended) board plane, in court feet
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction, k = (BH - FH) / (BY - FY), denom = d.y + k * d.z;
  if (Math.abs(denom) < 1e-6) return null;
  const t = (FH - k * FY - k * o.z - o.y) / denom;
  if (t <= 0) return null;
  const p = o.clone().addScaledVector(d, t);
  return { x: p.x, y: -p.z };
}
function startPull(e, el) {
  el.setPointerCapture(e.pointerId);
  S.pull = { active: true, startY: e.clientY, fill: 0, raw: 0, phase: 0, swing: 0 };
}
const pullScale = () => Math.max(170, stage.clientHeight * 0.5);
stage.addEventListener("pointerdown", e => {
  initAudio();
  if (S.phase === "aiming" && canEdit()) {
    const p = courtPoint(e); if (!p) return;
    stage.setPointerCapture(e.pointerId);
    dragging = grabsLanding(p) ? "landing" : "end";
    moveMarker(dragging, p);
  } else if (S.phase === "throw") startPull(e, stage);
});
stage.addEventListener("pointermove", e => {
  if (dragging) { const p = courtPoint(e); if (p) pendingDrag = p; }
  else if (S.phase === "throw" && S.pull.active) S.pull.raw = Math.max(0, (e.clientY - S.pull.startY) / pullScale());
});
const endPointer = () => {
  if (dragging) { if (pendingDrag) { moveMarker(dragging, pendingDrag); pendingDrag = null; } dragging = null; }
  else if (S.phase === "throw" && S.pull.active) releasePull();
};
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);
const panelEl = $("panel");
panelEl.addEventListener("pointerdown", e => { if (S.phase === "throw" && !e.target.closest("button")) { initAudio(); startPull(e, panelEl); } });
panelEl.addEventListener("pointermove", e => { if (S.phase === "throw" && S.pull.active) S.pull.raw = Math.max(0, (e.clientY - S.pull.startY) / pullScale()); });
panelEl.addEventListener("pointerup", () => { if (S.phase === "throw" && S.pull.active) releasePull(); });

// ───────────────────────── HUD: pull gauge, swinging arrow, wind, opponent
function updateHUD() {
  const throwing = S.phase === "throw", L = lv();
  $("gauge").hidden = !throwing; $("aim").hidden = !throwing;
  const inMatch = !["hub"].includes(S.phase);
  $("wind").hidden = !inMatch;
  $("opp").hidden = !(inMatch && S.opponent);
  if (inMatch) {
    $("windMph").textContent = `${S.wind.mph} mph`;
    // Screen up is down-range, so the arrow points the way the wind blows across the lane.
    $("windArrow").setAttribute("transform", `rotate(${(S.wind.dir * 180 / Math.PI).toFixed(1)})`);
  }
  if (!throwing) return;
  const p = S.pull, f = p.fill, scale = 1.25;
  $("gaugeFill").style.height = (Math.min(f, scale) / scale * 100) + "%";
  const band = L.powZone * 0.5;
  const tgt = $("gaugeTarget");
  tgt.style.bottom = `calc(${(POWER_TARGET - band) / scale * 100}% - 4px)`;
  tgt.style.height = `calc(${band * 2 / scale * 100}% + 8px)`;
  const over = f > 1, inBand = Math.abs(f - POWER_TARGET) <= band;
  const len = 60 + Math.min(f, 1.25) * 230, ang = p.swing * 38, zoneAng = L.zone * 38;
  const col = over ? "#ff3a2a" : inBand ? "#3ee07a" : p.active ? "#ffc93a" : "#ffffff";
  $("aim").innerHTML = `<svg viewBox="-120 -330 240 340" preserveAspectRatio="xMidYMax meet">
    <path d="M0,0 L${-Math.sin(zoneAng * Math.PI / 180) * 300},${-Math.cos(zoneAng * Math.PI / 180) * 300} L${Math.sin(zoneAng * Math.PI / 180) * 300},${-Math.cos(zoneAng * Math.PI / 180) * 300} Z" fill="#3ee07a" fill-opacity=".16"/>
    <line x1="0" y1="0" x2="0" y2="-300" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-dasharray="6 8"/>
    <g transform="rotate(${ang.toFixed(2)})">
      <path d="M-11,0 L-11,${-len + 34} L-26,${-len + 34} L0,${-len} L26,${-len + 34} L11,${-len + 34} L11,0 Z" fill="${col}" stroke="#0a1426" stroke-width="6" stroke-linejoin="round" paint-order="stroke"/>
    </g>
    <circle r="18" fill="${COL.p[S.player]}" stroke="#fff" stroke-width="5"/>
  </svg>`;
}

// ───────────────────────── Panel and scoreboard
const panel = $("panel");
function renderScore() {
  const ir = inningResult();
  for (const p of [0, 1]) {
    $("name" + p).textContent = S.names[p];
    $("pts" + p).textContent = S.scores[p];
    $("live" + p).textContent = ir.winner === p ? `Inning +${ir.awarded}` : "";
    $("dots" + p).innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < 4 - S.thrown[p] ? "on" : ""}"></i>`).join("");
    $("card" + p).classList.toggle("active", S.player === p && !["inning", "over", "hub"].includes(S.phase));
  }
  $("inningNum").textContent = S.inning;
  if (S.opponent) $("opp").innerHTML = `<b>${esc(S.opponent.name)}</b>${"★".repeat(S.opponent.rating)}${"☆".repeat(3 - S.opponent.rating)} · ${esc(venue().name)}`;
}
function renderBanner() {
  const el = $("banner");
  if (S.banner) { el.textContent = S.banner.text; el.style.background = `linear-gradient(${COL.pl[S.banner.pl] || "#666"}, ${COL.p[S.banner.pl] || "#333"})`; el.classList.add("show"); }
  else el.classList.remove("show");
}
function outcomeText(p) {
  if (p.own) {
    if (p.pushOutcome === "inHole") return "Pushes yours in";
    return onSurface({ state: p.pushOutcome }) && onBoard(p.pushEnd) ? "Pushes yours" : "Pushes yours off";
  }
  if (p.outcome === "inHole") return "Cornhole";
  if (onSurface({ state: p.outcome }) && onBoard(p.end)) return "On the board";
  return "Off the board";
}
const chip = (label, value, cls = "") => `<div class="chip ${cls}"><small>${label}</small><b>${value}</b></div>`;
const whoName = p => S.names[p] === "You" ? "Your" : esc(S.names[p]) + "'s";
function ui() {
  renderScore();
  const hint = $("hint");
  if (canEdit() && !S.end) { hint.textContent = "Tap where you want the bag to end up"; hint.hidden = false; }
  else if (canEdit() && S.landing) { hint.textContent = "Drag the yellow ring around the gold zone"; hint.hidden = false; }
  else hint.hidden = true;
  renderCoach();
  const side = SIDES[S.player] < 0 ? "Left box" : "Right box";
  const who = `<div class="who"><i style="background:${COL.p[S.player]}"></i>${whoName(S.player)} throw</div>`;
  if (S.phase === "aiming") {
    let plan = `<div class="muted">Tap the board where you want your bag to end up, then drag the yellow ring to pick where it lands first. The guide ignores wind.</div>`;
    if (S.ideal) {
      const spin = Math.abs(S.ideal.spin) < 0.05 ? "None" : (S.ideal.spin > 0 ? "Right " : "Left ") + Math.round(Math.abs(S.ideal.spin) * 100) + "%";
      plan = `<div class="chips">
        ${chip("Arc", deg(S.ideal.el).toFixed(0) + "°")}
        ${chip("Slide", S.landD < 0.15 ? "Sticks" : S.landD.toFixed(1) + " ft")}
        ${chip("Spin", spin)}
        ${S.push ? chip("Push shot", "+" + Math.round(S.push.extra * 100) + "%", "gold") : ""}
        ${S.prev ? chip("No wind", outcomeText(S.prev)) : ""}
      </div>`;
    }
    panel.innerHTML = `<div class="row">${who}<span class="spacer"></span><span class="muted">${side} · Bag ${S.thrown[S.player] + 1} of 4</span></div>
      <div style="min-height:50px">${plan}</div>
      <div class="btns">
        <button class="btn" id="clearBtn" ${S.end ? "" : "disabled"}>CLEAR</button>
        <button class="btn" id="stickBtn" ${S.end ? "" : "disabled"}>STICK IT</button>
        <button class="btn go red" id="throwBtn" style="background:linear-gradient(${COL.pl[S.player]}, ${COL.p[S.player]} 50%, ${COL.pd[S.player]})" ${S.ideal ? "" : "disabled"}>THROW</button>
      </div>`;
    $("clearBtn").onclick = () => { S.end = null; S.landD = null; S.landPhi = 0; refreshPlan(); ui(); };
    $("stickBtn").onclick = () => { if (S.end) { S.landD = 0; S.landPhi = 0; refreshPlan(); ui(); } };
    $("throwBtn").onclick = () => { initAudio(); beginThrow(); };
  } else if (S.phase === "throw") {
    panel.innerHTML = `<div class="row">${who}<span class="spacer"></span><button class="linkbtn" id="backBtn">Back to aiming</button></div>
      <div class="pullpad"><div class="bag" style="background:linear-gradient(${COL.pl[S.player]}, ${COL.p[S.player]})">↓</div>
      <div><div class="big">Pull back and let go</div><div class="muted">More pull = more power and a faster arrow. Past the gold band into the red is OVERDRIVE.</div></div></div>`;
    $("backBtn").onclick = () => { S.phase = "aiming"; ui(); };
  } else if (S.phase === "cpu") {
    panel.innerHTML = `<div class="center" style="margin:auto"><div class="big">${esc(S.names[S.player])} is ${S.cpuPlan ? "going for: " + esc(S.cpuPlan.label) : "lining up…"}</div><div class="muted">${side} · ${S.wind.mph} mph wind</div></div>`;
  } else if (["flight", "inning", "over"].includes(S.phase)) {
    panel.innerHTML = S.feedback.length ? `<div class="center big" style="color:${S.perfect ? COL.gold : S.overdrive ? "#ff6a5a" : "inherit"}">${S.perfect ? "Perfect throw!" : S.overdrive ? "Overdrive!" : "Release"}</div>
      <div class="feedback" style="grid-template-columns:repeat(${S.feedback.length},1fr)">${S.feedback.map(f => `<div class="fb"><small>${f.title}</small><b class="${f.text === "Perfect" ? "perfect" : ""}">${f.text}</b></div>`).join("")}</div>` : "";
  } else panel.innerHTML = "";
  updateHUD();
  renderInningSheet();
}
// First career match only: one step at a time, following what the player is doing.
function coachText() {
  if (S.kind !== "career" || career.tutorialDone || isCPU(S.player)) return "";
  if (S.phase === "aiming" && !S.end) return "👆 <b>Tap the board</b> where you want your bag to finish.";
  if (S.phase === "aiming" && !S.tut.dragged) return "👉 <b>Drag the yellow ring</b> to pick where it lands first. Close to the green spot sticks, farther back slides.";
  if (S.phase === "aiming") return "👇 Happy with it? <b>Tap THROW.</b>";
  if (S.phase === "throw" && !S.pull.active) return "⬇️ <b>Pull down anywhere</b> and watch the power bar fill.";
  if (S.phase === "throw") return "Let go in the <b>gold band</b> with the <b>arrow pointing straight</b>. Too far is OVERDRIVE!";
  if (S.phase === "flight" && S.tut.thrown) return "🌬️ The <b>wind</b> (top left) pushes your bag. Aim a little into it next time.";
  return "";
}
function renderCoach() {
  const el = $("coach"), text = coachText();
  el.hidden = !text;
  el.classList.toggle("top", S.phase === "throw"); // keep the arrow clear while pulling
  if (text && el.innerHTML !== text) el.innerHTML = text;
  if (text) $("hint").hidden = true;
}
function renderInningSheet() {
  const sheet = $("inningSheet");
  if (!((S.phase === "inning" || S.phase === "over") && S.lastInning)) { sheet.hidden = true; return; }
  const r = S.lastInning;
  const col = p => `<div class="col" style="background:linear-gradient(${COL.pl[p]}, ${COL.p[p]} 55%, ${COL.pd[p]})"><div class="who" style="font-size:18px">${esc(S.names[p])}</div><div class="big2">${r.raw[p]}</div><small>${r.hole[p]} in · ${r.on[p]} on</small></div>`;
  const line = r.winner === null ? `${r.raw[0]} − ${r.raw[1]} cancels out. No points this inning.`
    : `${r.raw[r.winner]} − ${r.raw[1 - r.winner]} → ${esc(S.names[r.winner])} ${S.names[r.winner] === "You" ? "score" : "scores"} ${r.awarded}`;
  let body;
  if (S.phase === "over") {
    const res = S.result, youWon = S.kind === "career" ? res.won : true;
    const head = S.kind === "career" ? (res.won ? `<div class="big3" style="color:${COL.gold}">YOU WIN!</div>` : `<div class="big3">YOU LOSE</div>`)
      : `<div class="big3" style="color:${COL.gold}">${esc(S.names[S.winner])} WINS!</div>`;
    const rewards = S.kind === "career" ? `<div class="rewards">
        <div class="pill"><span class="ico" style="background:#2f86ff">⭐</span><b>${res.starDelta >= 0 ? "+" : ""}${res.starDelta}</b></div>
        <div class="pill"><span class="ico" style="background:#ffc93a">🪙</span><b>+${res.coins}</b></div></div>
        ${res.newly.length ? `<div class="center big" style="color:${COL.gold}">Unlocked: ${res.newly.map(esc).join(", ")}!</div>` : ""}` : "";
    const fee = S.kind === "career" ? venue().fee : 0, canAgain = career.coins >= fee;
    body = `${head}<div class="center muted">Final: ${esc(S.names[0])} ${S.scores[0]} – ${S.scores[1]} ${esc(S.names[1])}</div>${rewards}
      <button class="btn go green" id="againBtn" ${canAgain ? "" : "disabled"}>${canAgain ? "PLAY AGAIN" + (fee ? ` · 🪙 ${fee.toLocaleString()}` : "") : "NOT ENOUGH COINS"}</button>
      <button class="btn" id="nextBtn">CLUBHOUSE</button>`;
    void youWon;
  } else {
    body = `<h2>Inning ${S.inning}</h2><div class="cols">${col(0)}${col(1)}</div><div class="center" style="font-size:17px">${line}</div>
      <div class="center muted">Game: ${esc(S.names[0])} ${S.scores[0]}, ${esc(S.names[1])} ${S.scores[1]}</div>
      <button class="btn go green" id="nextBtn">NEXT INNING</button>`;
  }
  $("inningBody").innerHTML = body;
  $("nextBtn").onclick = () => { sheet.hidden = true; if (S.phase === "over") openHub(); else nextInning(); };
  if ($("againBtn")) $("againBtn").onclick = () => { sheet.hidden = true; const k = S.kind, v = S.venue; openHub(); startMatch(k, v); };
  sheet.hidden = false;
}

// ───────────────────────── Clubhouse (career hub) and shop
let hubVenue = career.venue || 0;
function openHub() {
  S.phase = "hub"; S.world = new World(); clearBagMeshes(); S.end = null; S.plan = null; S.planVersion++;
  $("inningSheet").hidden = true; $("pause").hidden = true;
  if (!venueUnlocked(hubVenue)) hubVenue = 0;
  renderHub(); $("hub").hidden = false; document.body.classList.add("inhub"); ui();
  const today = new Date().toDateString();
  if (career.lastDaily !== today) {
    career.lastDaily = today; career.coins += 100; save(); renderHub();
    const t = document.createElement("div"); t.className = "toast"; t.textContent = "Daily bonus 🪙 +100";
    $("hub").appendChild(t); setTimeout(() => t.remove(), 3400);
  }
}
function renderHub() {
  $("coins").textContent = career.coins.toLocaleString();
  $("stars").textContent = career.stars;
  const v = VENUES[hubVenue], open = venueUnlocked(hubVenue), nextV = VENUES.find(x => x.stars > career.stars);
  buildVenue(v.id); setBoardDesign(career.board);
  venueAmbience(v.id, Math.round((v.wind[0] + v.wind[1]) / 2));
  const prog = nextV ? `<div class="muted" style="margin-top:8px">Next venue: ${esc(nextV.name)} at ${nextV.stars} ⭐</div><div class="progress"><i style="width:${Math.min(100, career.stars / nextV.stars * 100)}%"></i></div>` : "";
  $("venueCard").innerHTML = `<button class="nav prev" id="vPrev" ${hubVenue === 0 ? "disabled" : ""} aria-label="Previous venue">‹</button>
    <button class="nav next" id="vNext" ${hubVenue === VENUES.length - 1 ? "disabled" : ""} aria-label="Next venue">›</button>
    <div class="lvlno">Level ${hubVenue + 1} of ${VENUES.length}</div><h3>${esc(v.name)}</h3><div class="muted">${esc(v.sub)}</div>
    <div class="facts">${chip("Entry", v.fee ? "🪙 " + v.fee.toLocaleString() : "Free")}${chip("Win", "🪙 " + v.prize.toLocaleString())}${chip("Wind", `${v.wind[0]}–${v.wind[1]} mph`)}${chip("Boards", v.speed.replace(" boards", ""))}</div>
    ${prog}
    ${open ? "" : `<div class="locked">🔒 ${v.stars} ⭐ to unlock</div>`}`;
  $("vPrev").onclick = () => { hubVenue = Math.max(0, hubVenue - 1); renderHub(); };
  $("vNext").onclick = () => { hubVenue = Math.min(VENUES.length - 1, hubVenue + 1); renderHub(); };
  const play = $("playBtn"), afford = career.coins >= v.fee;
  play.disabled = !open || !afford;
  play.textContent = !open ? "LOCKED" : !afford ? "NOT ENOUGH COINS" : v.fee ? `PLAY · 🪙 ${v.fee.toLocaleString()}` : "PLAY";
  $("passBtn").disabled = !open;
}
$("playBtn").onclick = () => { initAudio(); startMatch("career", hubVenue); };
$("passBtn").onclick = () => { initAudio(); startMatch("pass", hubVenue); };
let shopTab = "bags";
function swatch(item, kind) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");
  if (kind === "bags") paintBag(ctx, 128, 128, item);
  else { ctx.save(); ctx.scale(0.5, 0.5); ctx.translate(64, 0); const tmp = document.createElement("canvas"); tmp.width = 128; tmp.height = 256; paintBoard(tmp.getContext("2d"), 128, 256, item); ctx.drawImage(tmp, 0, 0); ctx.restore(); }
  return c;
}
function renderShop() {
  $("shopCoins").textContent = career.coins.toLocaleString();
  for (const b of document.querySelectorAll("#shop .tabs button")) b.classList.toggle("on", b.dataset.tab === shopTab);
  const list = $("shopItems"); list.innerHTML = "";
  const items = shopTab === "bags" ? BAGS : BOARDS;
  for (const it of items) {
    const owned = (shopTab === "bags" ? career.bags : career.boards).includes(it.id), equipped = (shopTab === "bags" ? career.bag : career.board) === it.id;
    const row = document.createElement("div"); row.className = "item" + (equipped ? " eq" : "");
    row.appendChild(swatch(it, shopTab));
    const stats = shopTab === "bags" ? ["acc", "ctrl", "spin"].map((k, i) => `<div class="stat"><span>${["Accuracy", "Control", "Spin"][i]}</span>${[1, 2, 3, 4, 5].map(n => `<i class="${n <= it[k] ? "on" : ""}"></i>`).join("")}</div>`).join("") + `<span class="tagfeel">${FEEL[it.feel].label} slide</span>` : `<div class="muted">Board design</div>`;
    const info = document.createElement("div"); info.innerHTML = `<h4>${esc(it.name)}</h4>${stats}`;
    row.appendChild(info);
    const btn = document.createElement("button"); btn.className = "btn " + (equipped ? "" : owned ? "blue" : "green");
    btn.textContent = equipped ? "EQUIPPED" : owned ? "EQUIP" : it.price ? `🪙 ${it.price.toLocaleString()}` : "FREE";
    btn.disabled = equipped || (!owned && career.coins < it.price);
    btn.onclick = () => {
      if (!owned) { career.coins -= it.price; (shopTab === "bags" ? career.bags : career.boards).push(it.id); }
      if (shopTab === "bags") career.bag = it.id; else { career.board = it.id; setBoardDesign(it.id); }
      save(); renderShop(); renderHub();
    };
    row.appendChild(btn); list.appendChild(row);
  }
}
$("shopBtn").onclick = () => { renderShop(); $("shop").hidden = false; };
$("shopClose").onclick = () => { $("shop").hidden = true; renderHub(); };
for (const b of document.querySelectorAll("#shop .tabs button")) b.onclick = () => { shopTab = b.dataset.tab; renderShop(); };
let pausedPhase = null;
$("menuBtn").onclick = () => {
  if (S.phase === "hub") return;
  pausedPhase = S.phase; S.phase = "paused";
  $("forfeitNote").textContent = S.kind === "career" ? "Quitting counts as a loss and keeps the entry fee." : "";
  $("pause").hidden = false;
};
$("resumeBtn").onclick = () => { $("pause").hidden = true; S.phase = pausedPhase || "aiming"; ui(); };
$("forfeitBtn").onclick = () => {
  if (S.kind === "career") { career.stars = Math.max(0, career.stars - (1 + S.venue)); career.losses++; save(); }
  openHub();
};
function renderSoundButtons() { $("soundBtn").textContent = `Sound: ${muted ? "off" : "on"}`; $("pauseSound").textContent = `SOUND: ${muted ? "OFF" : "ON"}`; }
$("soundBtn").onclick = () => { initAudio(); setMuted(!muted); renderSoundButtons(); };
$("pauseSound").onclick = () => { initAudio(); setMuted(!muted); renderSoundButtons(); };
$("replayTut").onclick = () => { career.tutorialDone = false; save(); $("replayTut").textContent = "Tutorial will show in your next match"; };
renderSoundButtons();
$("helpBtn").onclick = () => { $("helpSheet").hidden = false; };
$("menuHelp").onclick = () => { $("helpSheet").hidden = false; };
$("helpClose").onclick = () => { $("helpSheet").hidden = true; };

// ───────────────────────── Loop
let lastT = 0;
function frame(now) {
  // __timeScale / __skipRender are test hooks for automated playthroughs; unused in normal play.
  const dt = (lastT ? Math.min((now - lastT) / 1000, 0.05) : 1 / 60) * (window.__timeScale || 1); lastT = now;
  S.time += dt; S.relT += dt;
  if (S.banner) { S.bannerT -= dt; if (S.bannerT <= 0) { S.banner = null; renderBanner(); } }
  if (pendingDrag && dragging) { moveMarker(dragging, pendingDrag); pendingDrag = null; }
  if (S.phase === "throw") { const was = S.pull.active; updatePull(dt); updateHUD(); if (was !== S.pull.active || (S.pull.active && !career.tutorialDone)) renderCoach(); }
  else if (S.phase === "cpu") {
    S.cpuT += dt;
    if (!S.cpuPlan && S.cpuT > 0.6) cpuTurn();
    if (S.cpuT > 2.6 && S.ideal) {
      const sk = S.opponent.skill;
      S.overdrive = false;
      releaseBag({ dir: gauss(sk), pow: gauss(sk), ht: 0 });
    }
  } else if (S.phase === "flight") {
    S.acc += dt;
    while (S.acc >= T.dt) { S.world.step(T.dt); S.acc -= T.dt; }
    const ev = S.world.events; S.world.events = []; handleEvents(ev);
    if (ev.length) renderScore();
    if (S.world.settled) { S.settleT += dt; if (S.settleT > 1.3) endTurn(); }
  }
  if (S.planVersion !== shownPlan || S.phase !== shownPhase) rebuildGuides();
  if (finishMarker.visible) finishMarker.scale.setScalar(1 + 0.08 * Math.sin(S.time * 4));
  updateBags(dt);
  updateFx(dt);
  updateCamera(dt);
  if (!window.__skipRender) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize(); openHub();
$("loading").hidden = true;
requestAnimationFrame(frame);
window.__cornhole = { S, career, startMatch, beginThrow, releaseBag, moveMarker, refreshPlan, openHub, fourBagger, buildVenue, VENUES, save, renderHub };

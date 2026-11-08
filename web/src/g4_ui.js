
// ───────────────────────── Cameras
const camPos = new THREE.Vector3(0, 9, 10), camLook = new THREE.Vector3(0, 0, -27);
const tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
let tFov = 50;
// Clubhouse: hubYaw is where the venue orbit camera is.
let hubYaw = 0;
function camMode() {
  if (S.preview) return "preview";
  if (S.phase === "hub") return "intro";
  if (S.phase === "aiming") return "aim";
  if (S.phase === "throw") return "throw";
  if (S.phase === "cpu") return S.cpuT < 0.6 ? "aim" : "throw";
  if (S.phase === "remote") return "aim";
  if (S.phase === "flight") {
    const b = S.world.bags.find(x => x.id === S.lastId);
    if (b && b.state === "flying" && b.y < FY - 7) return "follow";
    return "watch";
  }
  return "watch";
}
function updateCamera(dt) {
  if (window.__freeze) { camera.position.set(...window.__freeze.pos); camera.lookAt(...window.__freeze.look); return; } // test hook: hold a set view
  const mode = camMode(), rel = release(S.player), narrow = camera.aspect < 0.7;
  let k = 3, fov = narrow ? 50 : 42;
  if (mode === "preview") {
    // Shop previews: a close look at the hole, or a side-on look at a throw.
    if (S.preview.kind === "hole") { tPos.set(1.6, 4.2, -(FY - 5.5)); tLook.set(0, 0.6, -(HOLE.y + 0.5)); }
    else { tPos.set(2.5, 7.5, 9); tLook.set(0, 1.2, -17); } // behind the thrower: the whole flight and its trail
    fov = narrow ? 58 : 46; k = 4;
  } else if (mode === "intro") {
    // A slow orbit outside the court looking in: both boards stay in view while the scenery turns behind them. The
    // camera stays low enough to see the surroundings, pulls back and widens over the sides (a phone is narrow and the
    // court is 31 ft long), and aims so the court rides above the clubhouse card.
    hubYaw += dt * 0.12;
    const a = hubYaw, side = Math.sin(a) ** 2, cz = -FY / 2 - 1;
    let d = narrow ? 38 + 16 * side : 30 + 6 * side;
    const wall = VENUE_LOOK[venueId]?.wall; // stay inside the stands
    if (wall) d = Math.min(d, wall[0] / Math.max(Math.abs(Math.sin(a)), 0.01), wall[1] / Math.max(Math.abs(Math.cos(a)), 0.01));
    const h = Math.min(narrow ? 8 + 4 * side : 9, d * 0.2); // closer in (inside the stands) means lower, so the crowd shows
    fov = narrow ? 50 + 20 * side : 44;
    tPos.set(Math.sin(a) * d, h, cz + Math.cos(a) * d);
    const below = (narrow ? (wall ? 0.3 : 0.55) : 0.2) * fov / 2 * Math.PI / 180; // put the court centre this far above the screen centre
    const drop = d * Math.tan(Math.atan2(h, d) + below) - h;
    tLook.set(0, -drop, cz);
    k = 1.5;
  } else if (mode === "aim") {
    tPos.set(rel.x * 0.25, narrow ? 7.4 : 6.6, -(FY - (narrow ? 3.0 : 3.6))); tLook.set(0, 0.3, -(FY + 2.15));
  } else if (mode === "throw") {
    // Behind the thrower's hand in their pitcher's box, looking down their real line to the board.
    tPos.set(rel.x * 1.1, 6.2, 5.2); tLook.set(rel.x * 0.15, 0, -14); // arrow and ring near the bottom, board up the lane
    fov = narrow ? 46 : 40;
  } else if (mode === "follow") {
    const b = S.world.bags.find(x => x.id === S.lastId);
    tPos.set(lerp(rel.x, b.x, 0.6), Math.max(3.2, b.z * 0.7 + 2.6), -b.y + 7.5); tLook.set(b.x * 0.5, b.z * 0.4, -b.y - 6);
    k = 5;
  } else {
    tPos.set(rel.x * 0.4, narrow ? 6.3 : 5.6, -(FY - (narrow ? 3.8 : 4.4))); tLook.set(0, 0.3, -(FY + 2.0));
  }
  const t = 1 - Math.exp(-dt * k); tFov = fov;
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
  // The pull-back arrow and power ring live in the 3D scene (updateAimRig); the old flat overlays stay hidden.
  $("gauge").hidden = true; $("aim").hidden = true;
  const inMatch = S.phase !== "hub";
  $("wind").hidden = !inMatch;
  $("opp").hidden = !(inMatch && S.opponent);
  if (inMatch) {
    $("windMph").textContent = `${S.wind.mph} mph`;
    // Screen up is down-range, so the arrow points the way the wind blows across the lane.
    $("windArrow").setAttribute("transform", `rotate(${(S.wind.dir * 180 / Math.PI).toFixed(1)})`);
  }
}

// ───────────────────────── Panel and scoreboard
const panel = $("panel");
function renderScore() {
  const ir = inningResult();
  for (const p of [0, 1]) {
    const av = p === 0 ? career.avatar : S.opponent ? S.opponent.avatar : "a3";
    $("name" + p).innerHTML = (S.kind === "career" ? avatarHTML(av, "sm") : "") + esc(S.names[p]);
    $("pts" + p).textContent = S.scores[p];
    $("live" + p).innerHTML = S.phase === "hub" ? "" : `Inning <b>${ir.raw[p]}</b>`;
    const lost = (S.lost || [[], []])[p]; // bag k (0-based) empties dot 3-k
    $("dots" + p).innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < 4 - S.thrown[p] ? "on" : lost.includes(3 - i) ? "x" : ""}"></i>`).join("");
    $("card" + p).classList.toggle("active", S.player === p && !["inning", "over", "hub"].includes(S.phase));
  }
  $("inningNum").textContent = S.inning;
  if (S.opponent) $("opp").innerHTML = S.opponent.live
    ? `<b>${esc(S.opponent.name)}<span class="live">⚡ THROWDOWN</span></b>⭐ ${bigNum(S.opponent.stars || 0)}`
    : `<b>${esc(S.opponent.name)}</b>⭐ ${bigNum(S.opponent.stars || 0)}`;
  const words = venue().name.split(" "); // "Pizza Patio" → PIZZA over a gold PATIO, like the title
  $("courtName").innerHTML = words.length > 1 ? `${esc(words[0])}<span>${esc(words.slice(1).join(" "))}</span>` : `<span>${esc(words[0])}</span>`;
  renderInOn();
}
// The bottom-corner tables: how many bags each side has in the hole and on the board this inning.
function renderInOn() {
  const show = S.world && !["hub"].includes(S.phase) && $("hub").hidden;
  for (const p of [0, 1]) {
    const el = $("io" + p); el.hidden = !show; if (!show) continue;
    let hole = 0, on = 0;
    for (const b of S.world.bags) if (b.owner === p) { const pts = bagPoints(b); if (pts === 3) hole++; else if (pts === 1) on++; }
    el.style.borderColor = COL.p[p]; el.style.setProperty("--line", COL.p[p]);
    el.innerHTML = `<table><tr><th>IN</th><th>ON</th></tr><tr><td>${hole}</td><td>${on}</td></tr></table>`;
  }
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
const whoName = p => S.kind === "career" && p === 0 ? "Your" : esc(throwerName(p)) + "'s";
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
      <div><div class="big">Pull back and let go</div><div class="muted">The ring fills with power and the arrow swings, faster the harder you pull. Let go in the gold with the arrow straight. Red is OVERDRIVE.</div></div></div>`;
    $("backBtn").onclick = () => { S.phase = "aiming"; ui(); };
  } else if (S.phase === "remote") {
    panel.innerHTML = `<div class="center" style="margin:auto"><div class="big">${esc(S.names[1])} is lining up…</div><div class="muted">${side} · ${S.wind.mph} mph wind</div></div>`;
  } else if (S.phase === "cpu") {
    panel.innerHTML = `<div class="center" style="margin:auto"><div class="big">${esc(S.names[S.player])} is ${S.cpuPlan ? "going for: " + esc(S.cpuPlan.label) : "lining up…"}</div><div class="muted">${side} · ${S.wind.mph} mph wind</div></div>`;
  } else if (["flight", "inning", "over"].includes(S.phase)) {
    panel.innerHTML = S.feedback.length ? `<div class="center big" style="color:${S.perfect ? COL.gold : S.overdrive ? "#ff6a5a" : "inherit"}">${S.perfect ? "Perfect throw!" : S.overdrive ? "Overdrive!" : "Release"}</div>
      <div class="feedback" style="grid-template-columns:repeat(${S.feedback.length},1fr)">${S.feedback.map(f => `<div class="fb"><small>${f.title}</small><b class="${f.text === "Perfect" ? "perfect" : ""}">${f.text}</b></div>`).join("")}</div>` : "";
  } else panel.innerHTML = "";
  updateHUD(); renderClock();
  renderInningSheet();
}
// First career match only: one step at a time, following what the player is doing.
function coachText() {
  if (S.kind !== "career" || career.tutorialDone || isCPU(S.player)) return "";
  if (S.phase === "aiming" && !S.end) return "👆 <b>Tap the board</b> where you want your bag to finish.";
  if (S.phase === "aiming" && !S.tut.dragged) return "👉 <b>Drag the yellow ring</b> to pick where it lands first. Close to the green spot sticks, farther back slides.";
  if (S.phase === "aiming") return "👇 Happy with it? <b>Tap THROW.</b>";
  if (S.phase === "throw" && !S.pull.active) return "⬇️ <b>Pull down anywhere</b> and watch the ring fill.";
  if (S.phase === "throw") return "Let go when the ring is in the <b>gold</b> and the <b>arrow points straight</b>. Red is OVERDRIVE!";
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
// Between innings: a highlight card for the inning just played (inning scores, On | In, the points that counted and the
// game totals counting up), then the innings played so far with each player's running total.
const ROW_COLORS = ["#ffc93a", "#3ee07a", "#ff8a1f", "#a24bff", "#00c2d1", "#ff2e88", "#7ab4ff", "#c7f03a"];
function scorecardHTML() {
  const h = S.history[S.history.length - 1];
  if (!h) return "";
  const k = S.history.length - 1, c = ROW_COLORS[k % ROW_COLORS.length];
  const before = [h.totals[0] - (h.winner === 0 ? h.awarded : 0), h.totals[1] - (h.winner === 1 ? h.awarded : 0)];
  const side = p => `<div class="hp ${h.winner === p ? "won" : ""}" style="--pc:${COL.p[p]};--pl:${COL.pl[p]};--pd:${COL.pd[p]}">
      <div class="hn">${esc(S.names[p])}</div>
      <div class="hs">${h.raw[p]}</div>
      <div class="oi"><span>On <b>${h.on[p]}</b></span><i></i><span>In <b>${h.hole[p]}</b></span></div>
      <div class="ht" data-from="${before[p]}" data-to="${h.totals[p]}">${before[p]}</div>
    </div>`;
  // The points bubble sits on the bottom inside corner of the winner's tile (it drops in; see head.html).
  const badge = h.winner === null ? `<div class="vs wash">WASH</div>`
    : `<div class="vs ${h.winner === 0 ? "left" : "right"}" style="--c:${COL.bubble}"><span class="flipin">+${h.awarded}</span></div>`; // always green: no player tile is ever green
  const rows = S.history.slice(0, -1).map((r, n) => {
    const rc = ROW_COLORS[n % ROW_COLORS.length];
    const cell = p => `<td class="rs" style="color:${COL.pl[p]}"><b>${r.raw[p]}</b><small>${r.on[p]} | ${r.hole[p]}</small></td>`;
    const pts = r.winner === null ? `<span class="pts wash">–</span>` : `<span class="pts" style="--c:${rc}">${r.winner === 0 ? "◀" : ""}+${r.awarded}${r.winner === 1 ? "▶" : ""}</span>`;
    return `<tr><td class="no">${r.inning}</td>${cell(0)}<td>${pts}</td>${cell(1)}<td class="tt"><span style="color:${COL.pl[0]}">${r.totals[0]}</span>–<span style="color:${COL.pl[1]}">${r.totals[1]}</span></td></tr>`;
  }).reverse().join("");
  return `<div class="hero">${side(0)}${side(1)}${badge}</div>
    ${rows ? `<div class="hist"><div class="histh"><span>Earlier innings</span><span>On | In under each score</span></div>
      <table class="mini"><tbody>${rows}</tbody></table></div>` : ""}`;
}
// Totals count up for whoever scored.
function animateTotals() {
  for (const el of document.querySelectorAll("#inningBody .ht")) {
    const from = +el.dataset.from, to = +el.dataset.to;
    if (from === to) continue;
    const t0 = performance.now() + 450;
    const step = now => {
      const k = clamp((now - t0) / 700, 0, 1);
      el.textContent = Math.round(lerp(from, to, k));
      if (k < 1) requestAnimationFrame(step); else el.classList.add("bump");
    };
    requestAnimationFrame(step);
  }
}
const INNING_CARD_SECS = 5;
function renderInningSheet() {
  const sheet = $("inningSheet");
  if (!((S.phase === "inning" || S.phase === "over") && S.lastInning)) { sheet.hidden = true; return; }
  const r = S.lastInning;
  const line = r.winner === null ? `${r.raw[0]} − ${r.raw[1]} cancels out: no points`
    : `${r.raw[r.winner]} − ${r.raw[1 - r.winner]} = ${esc(S.names[r.winner])} +${r.awarded}`;
  let body;
  if (S.phase === "over") {
    const res = S.result;
    const head = S.online ? (res.won ? `<div class="big3" style="color:${COL.gold};font-size:30px">You won the Throwdown!</div>` : `<div class="big3" style="font-size:30px">You lost the Throwdown</div>`)
      : S.kind === "career" ? (res.won ? `<div class="big3" style="color:${COL.gold}">YOU WIN!</div>` : `<div class="big3">YOU LOSE</div>`)
      : `<div class="big3" style="color:${COL.gold}">${esc(S.names[S.winner])} WINS!</div>`;
    const rewards = S.kind === "career" ? `<div class="rewards">
        <div class="pill"><span class="ico" style="background:#2f86ff">⭐</span><b>${res.starDelta >= 0 ? "+" : ""}${res.starDelta}</b></div>
        <div class="pill"><i class="coin"></i><b>+${short(res.coins)}</b></div>
        <div class="pill"><span class="ico" style="background:#ffc93a">🏅</span><b>+${res.season}</b></div>
        ${res.lifeLost ? `<div class="pill"><i class="tkt"></i><b>−1</b></div>` : ""}</div>
        ${res.can ? `<div class="center big" style="color:${COL.gold}">${res.coolerFull ? "Cooler full, so no can this time" : `🥫 You won a ${esc(canById(res.can).name)} can!`}</div>${res.holes && !res.coolerFull ? `<div class="center muted">🎯 ${res.holes} cornhole${res.holes > 1 ? "s" : ""} boosted your can</div>` : ""}` : ""}
        ${res.newly.length ? `<div class="center big" style="color:${COL.gold}">Unlocked: ${res.newly.map(esc).join(", ")}!</div>` : ""}` : "";
    const fee = S.kind === "career" ? venue().fee : 0, canAgain = career.coins >= fee || (S.kind === "career" && houseCovers(S.venue));
    const O = S.online, R = O && O.rematch, who = esc(S.names[1]), bot = S.kind === "career" && !O;
    const again = !canAgain ? "NOT ENOUGH COINS"
      : bot && S.botRematch === "asking" ? `WAITING FOR ${who}…`
      : bot && S.botRematch === "declined" ? `${who} declined · FIND A NEW MATCH`
      : bot ? `REMATCH · <i class="coin"></i> ${short(fee)}`
      : !O ? "PLAY AGAIN" + (fee ? ` · <i class="coin"></i> ${short(fee)}` : "")
      : O.gone ? `${who} left`
      : R.me ? `WAITING FOR ${who}…`
      : R.them ? `${who} WANTS A THROWDOWN REMATCH! · <i class="coin"></i> ${short(fee)}`
      : `THROWDOWN REMATCH · <i class="coin"></i> ${short(fee)}`;
    body = `${head}${scorecardHTML()}${rewards}
      <button class="btn go green" id="againBtn" ${O || bot ? 'style="font-size:19px"' : ""} ${canAgain && !(O && (O.gone || R.me)) && S.botRematch !== "asking" ? "" : "disabled"}>${again}</button>
      <button class="btn" id="nextBtn">CLUBHOUSE</button>`;
  } else {
    body = `<div class="ribbon">INNING ${S.inning}</div>${scorecardHTML()}<div class="center" style="font-size:15px">${line}</div>
      <button class="swipehint" id="nextBtn">Inning ${S.inning + 1} in <b id="innCount">${INNING_CARD_SECS}</b>… tap or swipe up <span>⇡</span></button>`;
  }
  $("inningBody").innerHTML = body;
  const wrap = $("inningBody").querySelector(".card-wrap");
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
  animateTotals();
  // The bubble's landing: a thud, a little shake.
  const hero = $("inningBody").querySelector(".hero");
  if (hero && hero.querySelector(".vs.left, .vs.right")) setTimeout(() => { if (!sheet.hidden) { sfx.thud(); haptic("thud"); hero.classList.add("landed"); } }, 900);
  $("nextBtn").onclick = () => { if (S.phase === "over") { sheet.hidden = true; openHub(); } else dismissScorecard(0, -1); };
  if ($("againBtn")) $("againBtn").onclick = () => {
    if (S.online) { wantRematch(); return; }
    if (S.kind === "career" && !S.botRematch) { // a CPU opponent mulls it over, then says no
      S.botRematch = "asking"; renderInningSheet();
      setTimeout(() => { if (S.phase === "over" && S.botRematch === "asking") { S.botRematch = "declined"; renderInningSheet(); } }, 2000 + Math.random() * 5000);
      return;
    }
    sheet.hidden = true; const k = S.kind, v = S.venue; openHub();
    if (k === "career") playCourt(v); else startMatch(k, v);
  };
  const body0 = $("inningBody");
  body0.style.transition = "none"; body0.style.transform = ""; body0.style.opacity = "";
  sheet.hidden = false;
}
// The between-innings scorecard stays up until it is tapped or swiped away.
function dismissScorecard(dx, dy) {
  const el = $("inningBody"), sheet = $("inningSheet");
  const len = Math.hypot(dx, dy) || 1;
  el.style.transition = "transform .28s ease-in, opacity .28s ease-in";
  el.style.transform = `translate(${dx / len * 700}px, ${dy / len * 900}px) rotate(${dx / len * 10}deg)`;
  el.style.opacity = "0";
  setTimeout(() => { sheet.hidden = true; el.style.transition = "none"; el.style.transform = ""; el.style.opacity = ""; nextInning(); }, 260);
}
{
  let start = null;
  const sheet = $("inningSheet"), el = $("inningBody");
  sheet.addEventListener("pointerdown", e => {
    if (S.phase !== "inning" || e.target.closest("button")) return;
    start = { x: e.clientX, y: e.clientY }; el.style.transition = "none";
  });
  sheet.addEventListener("pointermove", e => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.02}deg)`;
    el.style.opacity = String(Math.max(0.3, 1 - Math.hypot(dx, dy) / 500));
  });
  const end = e => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
    if (Math.hypot(dx, dy) > 70) dismissScorecard(dx, dy);
    else if (Math.hypot(dx, dy) < 12) dismissScorecard(0, -1); // a tap sends it up and away
    else { el.style.transition = "transform .2s, opacity .2s"; el.style.transform = ""; el.style.opacity = ""; }
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
}

// ───────────────────────── Clubhouse (career hub) and shop
let hubVenue = career.venue || 0;
function openHub() {
  $("timeupMsg").hidden = true;
  $("io0").hidden = $("io1").hidden = true;
  if (career.activeMatch && S.kind === "career" && S.phase !== "hub" && !glitching) { glitchOut(); return; } // left a match some way we didn't plan for
  leaveOnline(); S.online = null;
  S.phase = "hub"; S.world = new World(); clearBagMeshes(); S.end = null; S.plan = null; S.planVersion++;
  $("inningSheet").hidden = true; $("pause").hidden = true;
  if (!venueUnlocked(hubVenue)) hubVenue = 0;
  renderHub(); $("hub").hidden = false; document.body.classList.add("inhub"); ui();

}
// 1,500 → 1.5K, 2,000,000 → 2M
// Shrink a number in a court-card bubble until it fits (big buy-ins on narrow phones).
function fitChips(root) {
  const bs = [...root.querySelectorAll(".venue.cur .facts .chip b")]; let min = 99;
  for (const b of bs) {
    b.style.fontSize = ""; let size = parseFloat(getComputedStyle(b).fontSize);
    while (b.getBoundingClientRect().width > b.parentElement.clientWidth - 10 && size > 9) b.style.fontSize = (size -= 0.5) + "px";
    min = Math.min(min, size);
  }
  for (const b of bs) b.style.fontSize = min + "px"; // the whole row at one size
}
function short(n) { return bigNum(n); } // 1.5K, 2.3M ... one decimal
function renderHub() {
  $("coins").textContent = bigNum(career.coins);
  $("stars").textContent = bigNum(career.stars);
  const v = VENUES[hubVenue], open = venueUnlocked(hubVenue), have = courtStars(hubVenue), full = have >= v.max;
  buildVenue(v.id); setBoardDesign(career.board);
  venueAmbience(v.id, Math.round((v.wind[0] + v.wind[1]) / 2));
  const prev = hubVenue ? VENUES[hubVenue - 1] : null;
  const track = `<div class="courtstars"><span>⭐ ${have.toLocaleString()} / ${v.max.toLocaleString()}</span><div class="progress"><i style="width:${Math.min(100, have / v.max * 100)}%"></i></div><span class="muted">${full ? "Complete!" : hubVenue < VENUES.length - 1 ? (VENUES[hubVenue + 1].soon ? "Court " + (hubVenue + 2) + " coming soon" : "to open Court " + (hubVenue + 2)) : "to finish the tour"}</span></div>`;
  // A carousel: this court in the middle, the previous and next ones peeking in at the sides. Swipe to move.
  const peek = (i, cls) => i < 0 || i >= VENUES.length ? "" : `<div class="venue side ${cls}" data-go="${i}"><div class="lvlno">Court ${i + 1} of ${VENUES.length}</div><h3>${venueUnlocked(i) ? "" : "🔒 "}${esc(VENUES[i].name)}</h3><div class="muted">${VENUES[i].soon ? "Coming soon" : esc(VENUES[i].sub)}</div></div>`;
  $("venueCard").innerHTML = `${peek(hubVenue - 1, "prev")}<div class="venue cur"><div class="lvlno">Court ${hubVenue + 1} of ${VENUES.length}</div><h3>${esc(v.name)}</h3><div class="muted">${esc(v.sub)}</div>
    <div class="facts">${chip("Buy-in", houseCovers(hubVenue) ? "Free" : '<i class="coin"></i> ' + short(v.fee))}${chip("Payout", '<i class="coin"></i> ' + short(pot(v)))}${chip("Stars", `+${starsForWin(hubVenue)}/−${starsForLoss(hubVenue)}`)}${chip("Wind", `${v.wind[0]}–${v.wind[1]}`)}</div>
    ${open ? track : ""}
    ${open ? "" : v.soon ? `<div class="locked">🚧 Coming soon</div>` : `<div class="locked">🔒 Earn all ${prev.max} ⭐<br>at ${esc(prev.name)}</div>`}<button class="btn green go" id="playBtn"></button></div>${peek(hubVenue + 1, "next")}
    <div class="vdots">${VENUES.map((_, i) => `<i class="${i === hubVenue ? "on" : ""}"></i>`).join("")}</div>`;
  for (const el of $("venueCard").querySelectorAll("[data-go]")) el.onclick = () => { hubVenue = +el.dataset.go; renderHub(); };
  fitChips($("venueCard")); document.fonts?.ready.then(() => fitChips($("venueCard")));
  $("playBtn").onclick = () => { initAudio(); tickLives(); if (career.lives <= 0) { openLives(); return; } playCourt(hubVenue); };
    const play = $("playBtn"), afford = career.coins >= v.fee || houseCovers(hubVenue);
  renderHubExtras(); rollSeason(); renderSeasonBadge(); renderDaily();
  const nb = newCount(); $("shopBadge").hidden = !nb; $("shopBadge").textContent = nb;
  const noLives = career.lives <= 0;
  play.disabled = !open || (!afford && !noLives);
  play.innerHTML = !open ? (v.soon ? "COMING SOON" : "LOCKED") : noLives ? `NO LIVES · <i class="tkt"></i> IN ${clockText(nextLifeIn())}` : !afford ? "NOT ENOUGH COINS" : houseCovers(hubVenue) ? "PLAY · ON THE HOUSE" : `PLAY · <i class="coin"></i> ${short(v.fee)}`;
  $("passBtn").disabled = !open;
}
// Game Center: the iPhone app signs the player in and opens Apple's leaderboards.
// Game Center: your handle defaults to your Game Center name until you choose your own.
window.__gcPlayer = p => {
  if (p && p.name && !career.handleSet) { career.handle = String(p.name).slice(0, 24); save(); }
  if (p) postScores();
};
window.__gcPhoto = url => {
  if (typeof url !== "string" || !url.startsWith("data:image/png;base64,")) return;
  gcPhoto = url;
  if (!career.avatarSet) { career.avatar = "gc"; save(); } // default to your Game Center picture
  renderHubExtras();
};
window.__gcMessage = m => { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; $("hub").appendChild(t); setTimeout(() => t.remove(), 3400); };
$("rankBtn").onclick = () => { if (nativeBridge && nativeBridge.leaderboards) postNative("leaderboards", ""); else window.__gcMessage("Rankings are in the iPhone app"); };
// Swiping the court card left or right moves to the next or previous court.
{
  const car = $("venueCard"); let sw = null;
  car.addEventListener("pointerdown", e => { sw = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId }; });
  car.addEventListener("pointermove", e => {
    if (!sw) return;
    sw.dx = e.clientX - sw.x;
    if (!sw.on && Math.abs(sw.dx) > 8 && Math.abs(sw.dx) > Math.abs(e.clientY - sw.y)) { sw.on = true; car.classList.add("dragging"); car.setPointerCapture(sw.id); }
    if (!sw.on) return;
    const edge = (sw.dx > 0 && hubVenue === 0) || (sw.dx < 0 && hubVenue === VENUES.length - 1);
    const dx = edge ? sw.dx * 0.3 : sw.dx; // resist past the first and last court
    for (const c of car.querySelectorAll(".venue")) c.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (!sw) return;
    const s0 = sw; sw = null; car.classList.remove("dragging");
    if (!s0.on) return;
    const dir = s0.dx < -50 ? 1 : s0.dx > 50 ? -1 : 0, to = hubVenue + dir;
    const w = (car.querySelector(".venue.cur") || car).offsetWidth + 8;
    if (dir && to >= 0 && to < VENUES.length) {
      for (const c of car.querySelectorAll(".venue")) c.style.transform = `translateX(${-dir * w}px)`;
      sfx.tick(); haptic("light");
      setTimeout(() => { hubVenue = to; renderHub(); }, 260);
    } else for (const c of car.querySelectorAll(".venue")) c.style.transform = "";
  };
  car.addEventListener("pointerup", end); car.addEventListener("pointercancel", end);
  // a click right after a swipe shouldn't also open a side court
  car.addEventListener("click", e => { if (car.classList.contains("dragging")) e.stopPropagation(); }, true);
}
$("passBtn").onclick = () => { initAudio(); openPractice(); };
let shopTab = "bags";
function swatch(item, kind) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");
  if (kind === "bags") paintBag(ctx, 128, 128, item);
  else { ctx.save(); ctx.scale(0.5, 0.5); ctx.translate(64, 0); const tmp = document.createElement("canvas"); tmp.width = 128; tmp.height = 256; paintBoard(tmp.getContext("2d"), 128, 256, item); ctx.drawImage(tmp, 0, 0); ctx.restore(); }
  return c;
}
// ── Real-money store. Inside the iPhone app purchases go through Apple (StoreKit, via the native bridge); in a browser
// the buttons explain that.
const storePrices = {};
let pendingBuy = null, shopMsg = "";
const canBuy = () => !!(nativeBridge && nativeBridge.purchase);
window.__storePrices = prices => { Object.assign(storePrices, prices || {}); if (!$("shop").hidden) renderShop(); };
window.__purchaseComplete = (id, ok, message, restored) => {
  if (pendingBuy === id) pendingBuy = null;
  if (ok) {
    const item = grantPurchase(id, !!restored);
    if (item && !restored) { shopMsg = item.kind === "coins" ? `+${item.coins.toLocaleString()} coins!` : item.kind === "caps" ? `+${item.caps} bottle caps!` : item.kind === "lives" ? "+5 tickets!" : item.kind === "can" ? (career.canBacklog?.length ? `${item.title} will go in your cooler when a slot opens.` : `${item.title} is in your cooler!`) : `${item.title} unlocked!`; sfx.win(); haptic("success"); }
  } else if (message) shopMsg = message;
  renderShop(); renderHub();
};
window.__restoreDone = count => { shopMsg = count ? "Purchases restored" : "Nothing to restore"; renderShop(); renderHub(); };
function buy(id) {
  if (!canBuy()) { shopMsg = "Purchases are available in the iPhone app."; renderShop(); return; }
  pendingBuy = id; shopMsg = ""; postNative("purchase", id); renderShop();
}
// Cards collected toward an item (from cans).
function cardProgress(cat, it) {
  if (it.premium || !it.price) return "";
  const have = career.cards[cardKey(cat, it)] || 0, need = cardsNeeded(cat, it);
  return `<div class="cardprog">🃏 ${have}/${need}<div class="progress"><i style="width:${have / need * 100}%"></i></div></div>`;
}
function storeHTML() {
  const price = it => storePrices[it.id] || it.price;
  const btn = it => {
    const owned = it.kind === "once" && career.purchases.includes(it.id);
    if (owned) return `<button class="btn" disabled>OWNED</button>`;
    if (pendingBuy === it.id) return `<button class="btn" disabled>…</button>`;
    return `<button class="btn green" data-buy="${it.id}">${price(it)}</button>`;
  };
  const sw = keys => `<div class="swrow">${keys.filter(k => !k.startsWith("trail")).map(k => `<canvas data-sw="${k}" width="80" height="80"></canvas>`).join("")}</div>`;
  const starter = STORE.find(x => x.id === PID("starterpack"));
  const parts = [];
  if (!career.purchases.includes(starter.id)) parts.push(`<div class="storeitem hero"><span class="tag">${starter.tag}</span><div><h4>${starter.title}</h4><div class="sub">${starter.blurb}</div>${sw(starter.grants)}</div>${btn(starter)}</div>`);
  parts.push(`<div class="label">Coins</div>`);
  for (const it of STORE.filter(x => x.kind === "coins")) parts.push(`<div class="storeitem">${it.tag ? `<span class="tag">${it.tag}</span>` : ""}<div class="ic">${it.icon}</div><div><h4>${short(it.coins)} coins</h4><div class="sub">${it.title}</div></div>${btn(it)}</div>`);
  parts.push(`<div class="label">Bottle caps</div>`);
  for (const it of STORE.filter(x => x.kind === "caps")) parts.push(`<div class="storeitem">${it.tag ? `<span class="tag">${it.tag}</span>` : ""}<div class="ic"><i class="bcap" style="width:40px;height:40px"></i></div><div><h4>${it.caps.toLocaleString()} caps</h4><div class="sub">${it.title}</div></div>${btn(it)}</div>`);
  parts.push(`<div class="label">Lives and cans</div>`);
  for (const it of STORE.filter(x => x.kind === "lives" || x.kind === "can")) {
    const ic = it.kind === "can" ? `<i class="minican" style="width:30px;height:46px;background:linear-gradient(90deg, ${canById(it.can).color}, ${canById(it.can).rim} 40%, ${canById(it.can).color})"></i>` : it.kind === "lives" ? `<i class="tkt" style="width:46px;height:34px"></i>` : it.icon;
    parts.push(`<div class="storeitem"><div class="ic">${ic}</div><div><h4>${it.title}</h4><div class="sub">${it.blurb}</div></div>${btn(it)}</div>`);
  }
  parts.push(`<div class="storenote"><button class="linkbtn" id="oddsBtn">What's in a can?</button></div>`);
  parts.push(`<div class="label">Exclusive sets</div>`);
  for (const it of STORE.filter(x => x.kind === "once" && x.id !== starter.id)) {
    parts.push(`<div class="storeitem"><div class="ic">${it.id === PID("trails") ? "✨" : "🎁"}</div><div><h4>${it.title}</h4><div class="sub">${it.blurb}</div>${it.id === PID("trails") ? "" : sw(it.grants)}</div>${btn(it)}</div>`);
  }
  if (career.purchases.includes(starter.id)) parts.push(`<div class="storeitem"><div class="ic">⭐</div><div><h4>${starter.title}</h4><div class="sub">${starter.blurb}</div></div>${btn(starter)}</div>`);
  parts.push(`<div class="storenote">No ads, ever. Coins and items stay on this device.<br><button class="linkbtn" id="restoreBtn">Restore purchases</button></div>`);
  if (shopMsg) parts.push(`<div class="shoptoast">${esc(shopMsg)}</div>`);
  return parts.join("");
}
function renderShop() {
  testerTopUp();
  $("shopCoins").textContent = bigNum(career.coins); $("shopCaps").textContent = bigNum(career.caps);
  const TAB_CAT = { bags: "bag", boards: "board", throw: "trail", hole: "fx" };
  for (const b of document.querySelectorAll("#shop .tabs button")) {
    b.classList.toggle("on", b.dataset.tab === shopTab);
    const n = TAB_CAT[b.dataset.tab] ? newCount(TAB_CAT[b.dataset.tab]) : 0;
    b.querySelector(".nbadge")?.remove();
    if (n) b.insertAdjacentHTML("beforeend", `<i class="nbadge">${n}</i>`);
  }
  // An item's badge: NEW! when cards have just unlocked it (it's now yours to equip).
  const itemBadge = (catKey, id) => { const nb = (career.newCards || {})[`${catKey}:${id}`]; return nb && nb.unlocked ? `<i class="nbadge item-badge">NEW!</i>` : ""; };
  const list = $("shopItems"); list.innerHTML = "";
  if (shopTab === "store") {
    list.innerHTML = storeHTML();
    for (const c of list.querySelectorAll("canvas[data-sw]")) {
      const [type, key] = c.dataset.sw.split(":"), ctx = c.getContext("2d");
      if (type === "bag") paintBag(ctx, 80, 80, bagById(key));
      else { const tmp = document.createElement("canvas"); tmp.width = 80; tmp.height = 160; paintBoard(tmp.getContext("2d"), 80, 160, boardById(key)); ctx.drawImage(tmp, 20, 0, 40, 80); }
    }
    for (const b of list.querySelectorAll("[data-buy]")) b.onclick = () => buy(b.dataset.buy);
    $("oddsBtn").onclick = () => showInfo(cansInfoHTML());
    $("restoreBtn").onclick = () => { if (!canBuy()) { shopMsg = "Restore works in the iPhone app."; renderShop(); return; } shopMsg = "Restoring…"; postNative("restore", ""); renderShop(); };
    return;
  }
  if (shopTab === "throw" || shopTab === "hole") {
    const isThrow = shopTab === "throw", all = isThrow ? TRAILS : EFFECTS, mine = isThrow ? career.trails : career.effects;
    list.insertAdjacentHTML("beforeend", `<div class="label">${isThrow ? "Throw effects: a trail behind your bag" : "Cornhole effects: when your bag drops in"}</div>`);
    for (const it of all) {
      const owned = mine.includes(it.id), equipped = (isThrow ? career.trail : career.effect) === it.id;
      const row = document.createElement("div"); row.className = "item" + (equipped ? " eq" : "");
      row.innerHTML = `${itemBadge(isThrow ? "trail" : "fx", it.id)}<div class="fxicon">${it.icon}</div><div><h4>${esc(it.name)}</h4><div class="muted">${esc(it.blurb)}</div>${owned ? "" : cardProgress(catByKey(isThrow ? "trail" : "fx"), it)}</div>`;
      const btns = document.createElement("div"); btns.className = "fxbtns";
      const main = document.createElement("button");
      main.className = "btn " + (equipped ? "" : owned ? "blue" : "green");
      const cost = cardPrice(catByKey(isThrow ? "trail" : "fx"), it), off = cost < it.price;
      main.innerHTML = equipped ? "EQUIPPED" : owned ? "EQUIP" : it.price ? `${off ? `<s class="was">${short(it.price)}</s> ` : ""}<i class="coin"></i> ${short(cost)}` : "FREE";
      main.disabled = equipped || (!owned && career.coins < cost);
      main.onclick = () => {
        if (!owned) { career.coins -= cost; mine.push(it.id); delete career.cards[cardKey(catByKey(isThrow ? "trail" : "fx"), it)]; }
        if (isThrow) career.trail = it.id; else career.effect = it.id;
        save(); renderShop(); renderHub();
      };
      btns.appendChild(main);
      if (it.id !== "none") {
        const prev = document.createElement("button"); prev.className = "btn ghost"; prev.textContent = "▶ Preview";
        prev.onclick = () => previewEffect(isThrow ? "throw" : "hole", it.id);
        btns.appendChild(prev);
      }
      row.appendChild(btns); list.appendChild(row);
    }
    return;
  }
  const items = shopTab === "bags" ? BAGS : BOARDS;
  for (const it of items) {
    const owned = (shopTab === "bags" ? career.bags : career.boards).includes(it.id), equipped = (shopTab === "bags" ? career.bag : career.board) === it.id;
    const row = document.createElement("div"); row.className = "item" + (equipped ? " eq" : "");
    row.insertAdjacentHTML("beforeend", itemBadge(shopTab === "bags" ? "bag" : "board", it.id));
    row.appendChild(swatch(it, shopTab));
    const stats = shopTab === "bags" ? ["acc", "ctrl", "spin"].map((k, i) => `<div class="stat"><span>${["Accuracy", "Control", "Spin"][i]}</span>${[1, 2, 3, 4, 5].map(n => `<i class="${n <= it[k] ? "on" : ""}"></i>`).join("")}</div>`).join("") + `<span class="tagfeel">${FEEL[it.feel].label} slide</span>` : `<div class="muted">Board design</div>`;
    const info = document.createElement("div"); info.innerHTML = `<h4>${esc(it.name)}${it.premium ? ' <span class="tagfeel" style="background:#ff2e88">EXCLUSIVE</span>' : ""}</h4>${stats}${owned ? "" : cardProgress(catByKey(shopTab === "bags" ? "bag" : "board"), it)}`;
    row.appendChild(info);
    const btn = document.createElement("button");
    if (it.premium && !owned) {
      btn.className = "btn"; btn.textContent = "IN STORE";
      btn.onclick = () => { shopTab = "store"; renderShop(); };
    } else {
      btn.className = "btn " + (equipped ? "" : owned ? "blue" : "green");
      const cat = catByKey(shopTab === "bags" ? "bag" : "board"), cost = cardPrice(cat, it), off = cost < it.price;
      btn.innerHTML = equipped ? "EQUIPPED" : owned ? "EQUIP" : it.price ? `${off ? `<s class="was">${short(it.price)}</s> ` : ""}<i class="coin"></i> ${short(cost)}` : "FREE";
      btn.disabled = equipped || (!owned && career.coins < cost);
      btn.onclick = () => {
        if (!owned) { career.coins -= cost; (shopTab === "bags" ? career.bags : career.boards).push(it.id); delete career.cards[cardKey(cat, it)]; }
        if (shopTab === "bags") career.bag = it.id; else { career.board = it.id; setBoardDesign(it.id); }
        save(); renderShop(); renderHub();
      };
    }
    row.appendChild(btn); list.appendChild(row);
  }
}
// Shop previews: hide the shop, play the effect where you can see it, then come back.
function previewEffect(kind, id) {
  initAudio();
  $("shop").hidden = true; $("hub").hidden = true; clearBagMeshes();
  S.preview = { kind, id, t: 0, mesh: null };
  if (kind === "hole") setTimeout(() => { sfx.hole(); celebrate(0, id); }, 450);
  else {
    const m = new THREE.Mesh(bagGeo, bagMaterial(bagById(career.bag))); m.castShadow = true; scene.add(m);
    S.preview.mesh = m; sfx.whoosh();
  }
}
function updatePreview(dt) {
  const P = S.preview; if (!P) return;
  P.t += dt;
  if (P.mesh) { // a lob from the left box into the hole, trailing the effect
    const k = Math.min(1, Math.max(0, (P.t - 0.35) / 1.3)), o = release(0);
    const x = lerp(o.x, HOLE.x, k), y = lerp(o.y, HOLE.y, k), z = lerp(o.z, plane(HOLE.y), k) + 7 * k * (1 - k);
    P.mesh.position.copy(W(x, y, z + 0.1)); P.mesh.rotation.set(0.2, -k * 6, 0.1);
    P.mesh.visible = k < 1;
    if (k > 0 && k < 1) trailPuff(P.mesh.position, P.id, 0);
    if (k >= 1 && !P.landed) { P.landed = true; sfx.hole(); }
  }
  if (P.t > (P.mesh ? 2.4 : 3)) {
    if (P.mesh) { scene.remove(P.mesh); P.mesh.material.dispose(); }
    S.preview = null;
    if (S.phase === "hub") $("hub").hidden = false;
    $("shop").hidden = false;
  }
}
$("shopBtn").onclick = () => {
  shopMsg = "";
  const withNews = [["bags", "bag"], ["boards", "board"], ["throw", "trail"], ["hole", "fx"]].find(([, c]) => newCount(c));
  if (withNews) shopTab = withNews[0]; // open where the new cards are
  renderShop(); $("shop").hidden = false;
};
// Leaving a tab (or closing the shop) marks its new cards as seen.
function seenTab(tab) {
  const cat = { bags: "bag", boards: "board", throw: "trail", hole: "fx" }[tab]; if (!cat || !career.newCards) return;
  for (const k of Object.keys(career.newCards)) if (k.startsWith(cat + ":")) delete career.newCards[k];
  save();
}
$("shopClose").onclick = () => { seenTab(shopTab); $("shop").hidden = true; renderHub(); };
for (const b of document.querySelectorAll("#shop .tabs button")) b.onclick = () => { if (b.dataset.tab !== shopTab) seenTab(shopTab); shopTab = b.dataset.tab; renderShop(); };
let pausedPhase = null;
// Pausing during your throw: the first pause of a match stops the throw clock for 5 seconds, then it runs again; any
// later pause leaves the clock running, with a warning. (Pausing when no clock is running stops the game as before.)
const PAUSE_GRACE = 5;
$("menuBtn").onclick = () => {
  if (S.phase === "hub") return;
  const clocked = S.clock != null && (S.phase === "aiming" || S.phase === "throw");
  S.pauseGrace = clocked ? (S.pauses ? 0 : PAUSE_GRACE) : 0;
  if (clocked) S.pauses = (S.pauses || 0) + 1;
  S.pauseClocked = clocked;
  pausedPhase = S.phase; S.phase = "paused"; renderPauseClock();
  renderSoundButtons();
  $("forfeitNote").textContent = S.kind === "career" ? `Quitting counts as a loss: −${starsForLoss(S.venue)} ⭐ and your opponent keeps the pot.` : "";
  $("pause").hidden = false;
};
$("resumeBtn").onclick = () => { $("pause").hidden = true; S.phase = pausedPhase || "aiming"; S.pauseClocked = false; ui(); };
function renderPauseClock() {
  const el = $("pauseClock"); el.hidden = !S.pauseClocked; if (!S.pauseClocked) return;
  const left = Math.max(0, Math.ceil(S.clock));
  if (S.pauseGrace > 0) { el.className = "pauseclock"; el.textContent = `⏸ Throw clock stopped for ${Math.ceil(S.pauseGrace)}s (${left}s left)`; }
  else { el.className = "pauseclock running"; el.textContent = `⚠️ The throw clock is still running: ${left}s left`; }
}
// While paused on your throw: use up the grace, then keep the clock counting; at zero the bag is lost as usual.
function tickPausedClock(dt) {
  if (S.phase !== "paused" || !S.pauseClocked) return;
  const before = [Math.ceil(S.pauseGrace), Math.ceil(S.clock)];
  if (S.pauseGrace > 0) S.pauseGrace = Math.max(0, S.pauseGrace - dt); else S.clock -= dt + takeAwayTime(S.clock - dt);
  if (before[0] !== Math.ceil(S.pauseGrace) || before[1] !== Math.ceil(S.clock)) { renderPauseClock(); renderClock(); }
  if (S.clock <= 0) { $("pause").hidden = true; S.pauseClocked = false; S.phase = pausedPhase; timeUp(); }
}
$("forfeitBtn").onclick = () => {
  if (S.kind === "career") { career.activeMatch = null; addCourtStars(S.venue, -starsForLoss(S.venue)); career.losses++; save(); }
  openHub();
};
function renderSoundButtons() {
  $("pauseMusic").classList.toggle("on", musicOn); $("pauseSound").classList.toggle("on", sfxOn);
}
const toggleMusic = () => { initAudio(); setMusic(!musicOn); renderSoundButtons(); };
const toggleSfx = () => { initAudio(); setSfx(!sfxOn); renderSoundButtons(); };
$("pauseMusic").onclick = toggleMusic;
$("pauseSound").onclick = toggleSfx;
$("replayTut").onclick = () => { career.tutorialDone = false; save(); $("replayTut").textContent = "Tutorial will show in your next match"; };
renderSoundButtons();
$("helpBtn").onclick = () => { $("helpSheet").hidden = false; };
$("helpClose").onclick = () => { $("helpSheet").hidden = true; };

// Popups close when you tap outside them (on the dimmed background), the same as their DONE button.
// The clubhouse, can opening, matchmaking and between-innings screens keep their own taps.
for (const [id, close] of [
  ["livesSheet", () => { $("livesSheet").hidden = true; }],
  ["avatarSheet", () => { $("avatarSheet").hidden = true; }],
  ["shop", () => $("shopClose").click()],
  ["helpSheet", () => $("helpClose").click()],
  ["practiceSheet", () => { $("practiceSheet").hidden = true; }],
  ["pause", () => $("resumeBtn").click()],
]) {
  const el = $(id); let downOnBackdrop = false;
  el.addEventListener("pointerdown", e => { downOnBackdrop = e.target === el; });
  el.addEventListener("click", e => { if (e.target === el && downOnBackdrop) close(); downOnBackdrop = false; });
}

// ───────────────────────── Loop
let lastT = 0, lastFrameAt = performance.now(), frameErrors = 0;
function frame(now) {
  lastFrameAt = performance.now();
  try { step(now); frameErrors = 0; }
  catch (err) { // one bad frame shouldn't freeze the game; a run of them means it's stuck
    console.error(err);
    if (++frameErrors >= 30 && inMatch()) { frameErrors = 0; glitchOut(); }
  }
  requestAnimationFrame(frame);
}
function step(now) {
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
    if (S.world.settled) { S.settleT += dt; if (S.settleT > 1.3 && flightSettled()) endTurn(); }
  }
  if (S.planVersion !== shownPlan || S.phase !== shownPhase) rebuildGuides();
  if (finishMarker.visible) finishMarker.scale.setScalar(1 + 0.08 * Math.sin(S.time * 4));
  updateBags(dt);
  updateAimRig(dt);
  updateOnline(dt);
  tickPausedClock(dt);
  // The between-innings card moves on by itself after a few seconds (in live play the other player is waiting).
  if (S.phase === "inning" && !$("inningSheet").hidden) {
    const before = Math.ceil(INNING_CARD_SECS - S.innT); S.innT += dt;
    const left = Math.ceil(INNING_CARD_SECS - S.innT);
    if (left !== before && $("innCount")) $("innCount").textContent = Math.max(0, left);
    if (S.innT >= INNING_CARD_SECS) { S.innT = 0; dismissScorecard(0, -1); }
  } else S.innT = 0;
  if (S.phase === "hub" && Math.floor(S.time) !== Math.floor(S.time - dt)) { renderHubExtras(); if (career.lives <= 0) renderHub(); }
  updatePreview(dt);
  updateFx(dt);
  updateWindStreaks(dt);
  venueTick(dt, S.time);
  updateCamera(dt);
  if (!window.__skipRender) renderScene();
}

// ───────────────────────── Glitch watchdog
// Notices when a match has stopped moving: a bag that never lands, a throw clock that stopped counting, a CPU that
// never throws, or the game loop dying. Then it ends the match and refunds it (refundMatch) rather than leave you stuck.
const inMatch = () => S.kind && !["hub", "over", "paused"].includes(S.phase) && $("hub").hidden;
const STALL = { flight: 15, cpu: 14, clock: 6 };
const watch = { phase: null, since: 0, clock: null, clockAt: 0 };
document.addEventListener("visibilitychange", () => { lastFrameAt = performance.now(); watch.phase = null; watch.clock = null; }); // back from the background: start counting afresh
setInterval(() => {
  const now = performance.now();
  if (document.hidden || !inMatch() || window.__timeScale) { watch.phase = null; watch.clock = null; return; } // paused or in the background: not a glitch
  if (now - lastFrameAt > 6000) { lastFrameAt = now; glitchOut(); requestAnimationFrame(frame); return; } // the loop died
  // Measured in game time (S.time), so a slow phone never looks stuck: only a game that's running but not moving does.
  if (S.phase !== watch.phase) { watch.phase = S.phase; watch.since = S.time; }
  const stuck = S.time - watch.since;
  if ((S.phase === "flight" && stuck > STALL.flight) || (S.phase === "cpu" && stuck > STALL.cpu)) { glitchOut(); return; }
  if (S.clock != null && (S.phase === "aiming" || S.phase === "throw")) {
    if (watch.clock !== S.clock) { watch.clock = S.clock; watch.clockAt = S.time; }
    else if (S.time - watch.clockAt > STALL.clock) { glitchOut(); return; }
  } else watch.clock = null;
}, 1000);
let glitching = false;
function glitchOut() {
  watch.phase = null; watch.clock = null;
  const career_ = S.kind === "career", r = career_ ? refundMatch() : null;
  glitching = true; try { openHub(); } finally { glitching = false; }
  showInfo(`<div class="lifebig">🛠️</div><h2>Sorry about that!</h2><div class="muted">Something went wrong and the ${career_ ? "match" : "game"} got stuck, so we stopped it.${
    r ? ` Your ${r.fee ? `buy-in (<i class="coin"></i> ${short(r.fee)}) and ` : ""}ticket are back, and no stars were lost.` : ""}</div>`);
}
// A match that never finished last time (the app was closed or crashed in the middle of it).
function settleInterruptedMatch() {
  const r = refundMatch(); if (!r) return;
  showInfo(r.refunded
    ? r.warning
      ? `<div class="lifebig">⚠️</div><h2>Warning ${r.warning} of ${QUIT_WARNINGS}</h2><div class="muted">Your last match at ${esc(r.court)} was closed while you were out of the app. This time your ${r.fee ? `buy-in (<i class="coin"></i> ${short(r.fee)}) and ` : ""}ticket are back and no stars were lost, but closing the app mid-match counts as a quit${r.warning < QUIT_WARNINGS ? "" : " from now on"}.</div>`
      : `<div class="lifebig">🛟</div><h2>Match refunded</h2><div class="muted">Your last match at ${esc(r.court)} was cut off by a problem on our end. Your ${r.fee ? `buy-in (<i class="coin"></i> ${short(r.fee)}) and ` : ""}ticket are back, and no stars were lost.</div>`
    : `<div class="lifebig">🚪</div><h2>Match counted as a quit</h2><div class="muted">Your last match at ${esc(r.court)} was closed while you were out of the app, so it counts as a loss (−${r.stars} ⭐).</div>`);
}

resize(); openHub(); settleInterruptedMatch();
postNative("store", "load"); // ask the iPhone app for real, local prices
postNative("gamecenter", "signin"); // sign in to Game Center (iOS shows its own sheet if needed)
// Splash: hold the title for a few seconds, then fade into the clubhouse.
setTimeout(() => { $("splash").classList.add("out"); setTimeout(() => $("splash").remove(), 600); }, Math.max(0, 2800 - performance.now()));

requestAnimationFrame(frame);
window.__cornhole = { setGlow: v => { glowOn = v; }, ui, finishMatch, finishInning, setYaw: v => { hubYaw = v; }, camera, snapCam: () => { camPos.copy(tPos); camLook.copy(tLook); camera.fov = tFov; camera.updateProjectionMatrix(); }, holeStreak, celebrate, S, career, startMatch, beginThrow, releaseBag, moveMarker, refreshPlan, openHub, fourBagger, buildVenue, VENUES, save, renderHub };

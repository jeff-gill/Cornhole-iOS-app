
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
    $("dots" + p).innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < 4 - S.thrown[p] ? "on" : ""}"></i>`).join("");
    $("card" + p).classList.toggle("active", S.player === p && !["inning", "over", "hub"].includes(S.phase));
  }
  $("inningNum").textContent = S.inning;
  if (S.opponent) $("opp").innerHTML = S.opponent.live
    ? `<b>${esc(S.opponent.name)}<span class="live">⚡ THROWDOWN</span></b>Live · ${esc(venue().name)}`
    : `<b>${esc(S.opponent.name)}<span class="cpu">CPU</span></b>${"★".repeat(S.opponent.rating)}${"☆".repeat(3 - S.opponent.rating)} · ${esc(venue().name)}`;
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
    : `<div class="vs ${h.winner === 0 ? "left" : "right"}" style="--c:${c}"><span class="flipin">+${h.awarded}</span></div>`;
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
        ${res.lifeLost ? `<div class="pill"><span class="ico" style="background:#c3c9d3">🎟️</span><b>−1</b></div>` : ""}</div>
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
      <button class="swipehint" id="nextBtn">Tap or swipe up for inning ${S.inning + 1} <span>⇡</span></button>`;
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
  leaveOnline(); S.online = null;
  S.phase = "hub"; S.world = new World(); clearBagMeshes(); S.end = null; S.plan = null; S.planVersion++;
  $("inningSheet").hidden = true; $("pause").hidden = true;
  if (!venueUnlocked(hubVenue)) hubVenue = 0;
  renderHub(); $("hub").hidden = false; document.body.classList.add("inhub"); ui();
  const today = new Date().toDateString();
  if (career.lastDaily !== today) {
    // Daily: a free can (mostly the low tiers), if there's room in the cooler.
    const id = rollCan(DAILY_ODDS), t = document.createElement("div"); t.className = "toast";
    if (giveCan(id, topCourt())) { career.lastDaily = today; save(); renderHub(); t.textContent = `Free daily can: ${canById(id).name} 🥫`; }
    else t.textContent = "Cooler full! Open a can for today's free one";
    $("hub").appendChild(t); setTimeout(() => t.remove(), 3400);
  }
}
// The clubhouse title fills the width of the screen.
function fitTitle() {
  const el = $("hubTitle"), w = el.parentElement.clientWidth; if (!w) return;
  el.style.fontSize = "40px"; el.style.fontSize = Math.min(72, 40 * w / el.scrollWidth) + "px";
}
// 1,500 → 1.5K, 2,000,000 → 2M
function short(n) { if (n >= 1e6) return +(n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M"; if (n >= 1e4) return +(n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "K"; return n.toLocaleString(); }
function renderHub() {
  $("coins").textContent = career.coins.toLocaleString();
  $("stars").textContent = career.stars;
  const v = VENUES[hubVenue], open = venueUnlocked(hubVenue), have = courtStars(hubVenue), full = have >= v.max;
  buildVenue(v.id); setBoardDesign(career.board);
  venueAmbience(v.id, Math.round((v.wind[0] + v.wind[1]) / 2));
  const prev = hubVenue ? VENUES[hubVenue - 1] : null;
  const track = `<div class="courtstars"><span>⭐ ${have.toLocaleString()} / ${v.max.toLocaleString()}</span><div class="progress"><i style="width:${Math.min(100, have / v.max * 100)}%"></i></div><span class="muted">${full ? "Complete!" : hubVenue < VENUES.length - 1 ? "to open Court " + (hubVenue + 2) : "to finish the tour"}</span></div>`;
  $("venueCard").innerHTML = `<button class="nav prev" id="vPrev" ${hubVenue === 0 ? "disabled" : ""} aria-label="Previous court">‹</button>
    <button class="nav next" id="vNext" ${hubVenue === VENUES.length - 1 ? "disabled" : ""} aria-label="Next court">›</button>
    <div class="lvlno">Court ${hubVenue + 1} of ${VENUES.length}</div><h3>${esc(v.name)}</h3><div class="muted">${esc(v.sub)}</div>
    <div class="facts">${chip("Buy-in", houseCovers(hubVenue) ? "Free" : '<i class="coin"></i> ' + short(v.fee))}${chip("Payout", '<i class="coin"></i> ' + short(pot(v)))}${chip("Stars", `+${starsForWin(hubVenue)} / −${starsForLoss(hubVenue)}`)}${chip("Wind", `${v.wind[0]}–${v.wind[1]}`)}</div>
    ${open ? track : ""}
    ${open ? "" : `<div class="locked">🔒 Earn all ${prev.max} ⭐<br>at ${esc(prev.name)}</div>`}`;
  $("vPrev").onclick = () => { hubVenue = Math.max(0, hubVenue - 1); renderHub(); };
  $("vNext").onclick = () => { hubVenue = Math.min(VENUES.length - 1, hubVenue + 1); renderHub(); };
  const play = $("playBtn"), afford = career.coins >= v.fee || houseCovers(hubVenue);
  renderHubExtras();
  const noLives = career.lives <= 0;
  play.disabled = !open || (!afford && !noLives);
  play.innerHTML = !open ? "LOCKED" : noLives ? `NO LIVES · 🎟️ IN ${clockText(nextLifeIn())}` : !afford ? "NOT ENOUGH COINS" : houseCovers(hubVenue) ? "PLAY · ON THE HOUSE" : `PLAY · <i class="coin"></i> ${short(v.fee)}`;
  $("passBtn").disabled = !open;
}
// Game Center: the iPhone app signs the player in and opens Apple's leaderboards.
window.__gcPlayer = p => { const el = $("gcName"); el.hidden = !p; if (p) el.textContent = "👤 " + p.name; if (p) postScores(); };
window.__gcMessage = m => { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; $("hub").appendChild(t); setTimeout(() => t.remove(), 3400); };
$("rankBtn").onclick = () => { if (nativeBridge && nativeBridge.leaderboards) postNative("leaderboards", ""); else window.__gcMessage("Rankings are in the iPhone app"); };
$("playBtn").onclick = () => { initAudio(); tickLives(); if (career.lives <= 0) { openLives(); return; } playCourt(hubVenue); };
$("passBtn").onclick = () => { initAudio(); startMatch("pass", hubVenue); };
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
    if (item && !restored) { shopMsg = item.kind === "coins" ? `+${item.coins.toLocaleString()} coins!` : item.kind === "caps" ? `+${item.caps} bottle caps!` : item.kind === "lives" ? "+5 lives! 🎟️" : item.kind === "can" ? `${item.title} is in your cooler!` : `${item.title} unlocked!`; sfx.win(); haptic("success"); }
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
    const ic = it.kind === "can" ? `<i class="minican" style="width:30px;height:46px;background:linear-gradient(90deg, ${canById(it.can).color}, ${canById(it.can).rim} 40%, ${canById(it.can).color})"></i>` : it.icon;
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
  $("shopCoins").textContent = career.coins.toLocaleString(); $("shopCaps").textContent = career.caps.toLocaleString();
  for (const b of document.querySelectorAll("#shop .tabs button")) b.classList.toggle("on", b.dataset.tab === shopTab);
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
      row.innerHTML = `<div class="fxicon">${it.icon}</div><div><h4>${esc(it.name)}</h4><div class="muted">${esc(it.blurb)}</div>${owned ? "" : cardProgress(catByKey(isThrow ? "trail" : "fx"), it)}</div>`;
      const btns = document.createElement("div"); btns.className = "fxbtns";
      const main = document.createElement("button");
      main.className = "btn " + (equipped ? "" : owned ? "blue" : "green");
      main.innerHTML = equipped ? "EQUIPPED" : owned ? "EQUIP" : it.price ? `<i class="coin"></i> ${short(it.price)}` : "FREE";
      main.disabled = equipped || (!owned && career.coins < it.price);
      main.onclick = () => {
        if (!owned) { career.coins -= it.price; mine.push(it.id); }
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
      btn.innerHTML = equipped ? "EQUIPPED" : owned ? "EQUIP" : it.price ? `<i class="coin"></i> ${short(it.price)}` : "FREE";
      btn.disabled = equipped || (!owned && career.coins < it.price);
      btn.onclick = () => {
        if (!owned) { career.coins -= it.price; (shopTab === "bags" ? career.bags : career.boards).push(it.id); }
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
$("shopBtn").onclick = () => { shopMsg = ""; renderShop(); $("shop").hidden = false; };
$("shopClose").onclick = () => { $("shop").hidden = true; renderHub(); };
for (const b of document.querySelectorAll("#shop .tabs button")) b.onclick = () => { shopTab = b.dataset.tab; renderShop(); };
let pausedPhase = null;
$("menuBtn").onclick = () => {
  if (S.phase === "hub") return;
  pausedPhase = S.phase; S.phase = "paused";
  renderSoundButtons();
  $("forfeitNote").textContent = S.kind === "career" ? `Quitting counts as a loss: −${starsForLoss(S.venue)} ⭐ and your opponent keeps the pot.` : "";
  $("pause").hidden = false;
};
$("resumeBtn").onclick = () => { $("pause").hidden = true; S.phase = pausedPhase || "aiming"; ui(); };
$("forfeitBtn").onclick = () => {
  if (S.kind === "career") { addCourtStars(S.venue, -starsForLoss(S.venue)); career.losses++; save(); }
  openHub();
};
function renderSoundButtons() {
  $("musicBtn").textContent = `Music: ${musicOn ? "on" : "off"}`; $("soundBtn").textContent = `Effects: ${sfxOn ? "on" : "off"}`;
  $("pauseMusic").classList.toggle("on", musicOn); $("pauseSound").classList.toggle("on", sfxOn);
}
const toggleMusic = () => { initAudio(); setMusic(!musicOn); renderSoundButtons(); };
const toggleSfx = () => { initAudio(); setSfx(!sfxOn); renderSoundButtons(); };
$("musicBtn").onclick = toggleMusic; $("pauseMusic").onclick = toggleMusic;
$("soundBtn").onclick = toggleSfx; $("pauseSound").onclick = toggleSfx;
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
    if (S.world.settled) { S.settleT += dt; if (S.settleT > 1.3 && flightSettled()) endTurn(); }
  }
  if (S.planVersion !== shownPlan || S.phase !== shownPhase) rebuildGuides();
  if (finishMarker.visible) finishMarker.scale.setScalar(1 + 0.08 * Math.sin(S.time * 4));
  updateBags(dt);
  updateAimRig(dt);
  updateOnline(dt);
  if (S.phase === "hub" && Math.floor(S.time) !== Math.floor(S.time - dt)) { renderHubExtras(); if (career.lives <= 0) renderHub(); }
  updatePreview(dt);
  updateFx(dt);
  venueTick(dt, S.time);
  updateCamera(dt);
  if (!window.__skipRender) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize(); openHub();
postNative("store", "load"); // ask the iPhone app for real, local prices
postNative("gamecenter", "signin"); // sign in to Game Center (iOS shows its own sheet if needed)
// Splash: hold the title for a few seconds, then fade into the clubhouse.
setTimeout(() => { $("splash").classList.add("out"); setTimeout(() => $("splash").remove(), 600); }, Math.max(0, 2800 - performance.now()));
fitTitle(); window.addEventListener("resize", fitTitle);
requestAnimationFrame(frame);
window.__cornhole = { ui, finishMatch, setYaw: v => { hubYaw = v; }, camera, snapCam: () => { camPos.copy(tPos); camLook.copy(tLook); camera.fov = tFov; camera.updateProjectionMatrix(); }, holeStreak, celebrate, S, career, startMatch, beginThrow, releaseBag, moveMarker, refreshPlan, openHub, fourBagger, buildVenue, VENUES, save, renderHub };

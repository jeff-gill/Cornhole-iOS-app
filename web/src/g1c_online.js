
// ───────────────────────── Online play (Game Center live matches)
// PLAY looks for a live player at the same court for a few seconds; if nobody turns up you play a computer opponent
// instead (labelled CPU). In a live match each phone is "player 0" to itself. The thrower's phone sends the throw and a
// luck seed, both phones play it the same way, and the thrower then sends where every bag ended up so they never drift.
const SEARCH_TIME = 15;
const netSend = obj => postNative("net", JSON.stringify({ op: "send", data: JSON.stringify(obj) }));
let search = null; // { vi, t, host, name, hello, setup }
const canGoOnline = () => !!(nativeBridge && nativeBridge.net) && career.tutorialDone;

// Throwdown brackets: players meet only others at the same court who have opened the same highest court, so a
// player who has reached the Stadium never meets a beginner, even back at the Backyard.
const bracket = vi => (vi + 1) * 100 + VENUES.reduce((m, v, i) => (venueUnlocked(i) ? i : m), 0);
const randomPick = () => ({ name: OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)], avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)].id });
function playCourt(vi, confirmed = false) {
  tickLives(); if (career.lives <= 0) { openLives(); return; }
  const v = VENUES[vi];
  if (career.coins < v.fee && !houseCovers(vi)) return;
  if (coolerFull() && !confirmed) { // a full cooler means a win can't drop a new can: say so first
    showChoice(`<h2>Prize Cooler full</h2><div class="muted">Your Prize Cooler already has ${COOLER_SIZE} cans, so you won't get a new Prize Can if you win this match. Open a can first to make room.</div>`,
      "PROCEED", () => playCourt(vi, true), "CANCEL");
    return;
  }
  const online = canGoOnline();
  search = { vi, t: 0, online, limit: online ? SEARCH_TIME : REEL_SPIN, reel: buildReel() };
  if (online) postNative("net", JSON.stringify({ op: "find", group: bracket(vi) }));
  renderSearch();
}
// No live opponent: land the reel on a CPU opponent, then play.
function cancelSearch(playCPU) {
  if (!search) return;
  if (search.online) postNative("net", JSON.stringify({ op: "cancel" }));
  search.online = false;
  if (!playCPU) { search = null; $("searching").hidden = true; return; }
  const pick = randomPick(), vi = search.vi;
  settleReel(pick, () => { search = null; $("searching").hidden = true; startMatch("career", vi, null, pick); });
}
// ── The opponent reel: names and avatars spin past, then slow down and land on your opponent (like a slot machine).
const ROW = 68; // one reel row = the window's inner height
const REEL_SPIN = 3, REEL_SLOW = 2; // seconds spinning at full speed, then seconds slowing down to land
function buildReel() {
  const reel = $("oppReel"); reel.innerHTML = "";
  const rows = Array.from({ length: 80 }, randomPick);
  for (const r of rows) reel.insertAdjacentHTML("beforeend", `<div>${avatarHTML(r.avatar)}<span>${esc(r.name)}</span></div>`);
  $("oppSpin").classList.remove("done"); $("oppSpin").hidden = false; $("searchSpin").hidden = true;
  return { pos: 0, speed: 900, rows: rows.length }; // about 13 names a second
}
function settleReel(pick, done) {
  const R = search && search.reel; if (!R || R.settle) return;
  // a steady slow-down: at full speed it would cover speed × dur / 2 while braking evenly to a stop
  const reel = $("oppReel"), at = Math.ceil((R.pos + R.speed * REEL_SLOW / 2) / ROW);
  while (reel.children.length <= at) reel.insertAdjacentHTML("beforeend", `<div>${avatarHTML(randomPick().avatar)}<span>${esc(randomPick().name)}</span></div>`);
  reel.children[at].innerHTML = `${avatarHTML(pick.avatar)}<span>${esc(pick.name)}</span>`;
  R.settle = { from: R.pos, to: at * ROW, t: 0, dur: REEL_SLOW, done };
}
function updateReel(dt) {
  const R = search && search.reel; if (!R) return;
  if (R.settle) {
    const S2 = R.settle; S2.t += dt;
    const k = Math.min(1, S2.t / S2.dur), e = 1 - Math.pow(1 - k, 2); // brakes evenly from full speed to a stop
    R.pos = S2.from + (S2.to - S2.from) * e;
    if (k >= 1 && !S2.landed) { S2.landed = true; $("oppSpin").classList.add("done"); sfx.thud(); haptic("thud"); setTimeout(S2.done, 900); }
  } else {
    R.pos += R.speed * dt;
    const reel = $("oppReel"); // keep the reel long enough
    if (R.pos > (reel.children.length - 6) * ROW) for (let k = 0; k < 20; k++) { const r = randomPick(); reel.insertAdjacentHTML("beforeend", `<div>${avatarHTML(r.avatar)}<span>${esc(r.name)}</span></div>`); }
  }
  $("oppReel").style.transform = `translateY(${-R.pos}px)`;
}
function renderSearch() {
  const el = $("searching");
  el.hidden = !search;
  if (!search) return;
  const v = VENUES[search.vi];
  const landing = search.reel && search.reel.settle;
  $("searchText").textContent = search.name ? `Throwdown with ${search.name}!` : landing ? "Opponent found!" : search.online ? `Looking for a Throwdown at ${v.name}…` : `Finding an opponent at ${v.name}…`;
  $("searchSub").textContent = search.name ? "Getting the boards ready" : landing ? v.name : search.online ? `${Math.max(0, Math.ceil(search.limit - search.t))}s, then you'll play a CPU opponent` : "";
}
// Messages from the iPhone app: matched / left, and the opponent's own messages (already parsed JSON objects).
window.__net = m => {
  if (!m || typeof m !== "object" || typeof m.t !== "string") return;
  if (m.t === "matched") {
    if (!search) { postNative("net", JSON.stringify({ op: "leave" })); return; }
    search.host = !!m.host; search.name = String(m.name || "Opponent").slice(0, 24);
    settleReel({ name: search.name, avatar: "a0" }, () => { if (search) { search.landed = true; tryStartOnline(); } });
    netSend({ t: "hello", stars: career.stars | 0, board: career.board, bag: career.bag, trail: career.trail, effect: career.effect, avatar: career.avatar === "gc" ? "a0" : career.avatar, handle: myHandle() });
    if (search.host) {
      search.setup = { seed: Math.floor(Math.random() * 2 ** 31), flip: Math.random() < 0.5 ? 1 : -1, lead: Math.random() < 0.5 ? 0 : 1 };
      netSend({ t: "setup", ...search.setup });
    }
    renderSearch(); tryStartOnline();
  } else if (m.t === "bag" && S.online && typeof m.bag === "string" && BAGS.some(b => b.id === m.bag)) { S.gear[1] = bagById(m.bag); setTeamColors(); renderScore();
  } else if (m.t === "hello" && search) { search.hello = m; tryStartOnline(); }
  else if (m.t === "setup" && search && !search.host) {
    // The host's view, flipped to ours: their box is our opponent's, and their "player 0" is our player 1.
    search.setup = { seed: m.seed | 0, flip: m.flip === 1 ? -1 : 1, lead: m.lead === 0 ? 1 : 0 };
    tryStartOnline();
  }
  else if (m.t === "nomatch") { if (search && !search.name && !(search.reel && search.reel.settle)) cancelSearch(true); }
  else if (m.t === "left" || m.t === "quit") opponentLeft();
  else if (m.t === "rematch" && S.online) { S.online.rematch.them = true; tryRematch(); }
  else if (m.t === "resetup" && S.online && !S.online.host) {
    S.online.rematch.setup = { seed: m.seed | 0, flip: m.flip === 1 ? -1 : 1, lead: m.lead === 0 ? 1 : 0 };
    tryRematch();
  }
  else if (S.online) S.online.queue.push(m);
};
function tryStartOnline() {
  if (!search || !search.name || !search.hello || !search.setup || !search.landed) return; // messages can arrive in any order
  const s = search, h = s.hello; search = null;
  $("searching").hidden = true;
  const known = (list, id, fallback) => (list.some(x => x.id === id) ? id : fallback);
  const handle = typeof h.handle === "string" && /^[A-Za-z0-9_.-]{3,24}$/.test(h.handle) ? h.handle : s.name; // their chosen handle
  startMatch("career", s.vi, {
    ...s.setup, name: handle, host: s.host, board: typeof h.board === "string" ? h.board : "classic", stars: Math.max(0, Math.min(1e7, h.stars | 0)),
    bag: known(BAGS, h.bag, "starter"), trail: known(TRAILS, h.trail, "none"), effect: known(EFFECTS, h.effect, "confetti"), avatar: known(AVATARS, h.avatar, "a0"),
  });
}
function opponentLeft() {
  if (search) { cancelSearch(true); return; }
  if (S.online && S.phase === "over") { S.online.gone = true; renderInningSheet(); return; } // no rematch now
  if (!S.online || S.phase === "over" || S.phase === "hub") return;
  S.online.gone = true;
  S.winner = 0; S.phase = "over"; finishMatch();
  showBanner(`${S.names[1]} left. You win!`, 0);
  ui();
}
// Rematch: both players tap REMATCH, the host deals a fresh coin flip and seed, and a new match starts at the same
// court with the same buy-in.
function wantRematch() {
  const O = S.online; if (!O || O.gone || O.rematch.me) return;
  if (career.coins < venue().fee && !houseCovers(S.venue)) return;
  if (career.lives <= 0) { openLives(); return; }
  O.rematch.me = true; netSend({ t: "rematch" }); renderInningSheet(); tryRematch();
}
function tryRematch() {
  const O = S.online; if (!O || S.phase !== "over") return;
  const R = O.rematch;
  if (!R.me || !R.them) { renderInningSheet(); return; }
  if (O.host && !R.setup) {
    R.setup = { seed: Math.floor(Math.random() * 2 ** 31), flip: Math.random() < 0.5 ? 1 : -1, lead: Math.random() < 0.5 ? 0 : 1 };
    netSend({ t: "resetup", ...R.setup });
  }
  if (!R.setup) return;
  if (career.lives <= 0) { O.gone = true; renderInningSheet(); return; }
  const { name, bag, trail, effect, host, avatar } = O;
  $("inningSheet").hidden = true;
  startMatch("career", S.venue, { ...R.setup, name, bag, trail, effect, host, avatar });
}
function leaveOnline() { if (S.online) { netSend({ t: "quit" }); postNative("net", JSON.stringify({ op: "leave" })); } }

// Per frame: the search countdown, the throw clock, and the opponent's queued messages.
// Time spent out of the app during a match still runs your throw clock: when you come back it's taken off your turns,
// one after another (each turn that runs out loses that bag), as if the game had kept going while you were away.
function takeAwayTime(left) {
  if (!(S.awayDebt > 0) || left <= 0) return 0;
  const t = Math.min(S.awayDebt, left); S.awayDebt -= t; return t;
}
document.addEventListener("visibilitychange", () => {
  const live = S.kind && !["hub", "over"].includes(S.phase);
  if (document.hidden) { if (live) S.awayAt = Date.now(); return; }
  if (S.awayAt && live) S.awayDebt = (S.awayDebt || 0) + (Date.now() - S.awayAt) / 1000;
  S.awayAt = null;
});
function updateOnline(dt) {
  if (search) {
    updateReel(dt);
    if (!search.name && !search.reel.settle) { search.t += dt; if (search.t >= search.limit) cancelSearch(true); }
    if (search) renderSearch();
  }
  if (S.clock != null && (S.phase === "aiming" || S.phase === "throw")) {
    const before = Math.ceil(S.clock);
    S.clock -= dt + takeAwayTime(S.clock - dt);
    if (Math.ceil(S.clock) !== before) { renderClock(); if (S.clock <= 5 && S.clock > 0) sfx.tick(); }
    if (S.clock <= 0) timeUp();
  }
  const O = S.online; if (!O) return;
  if (S.phase === "remote") {
    O.waitT += dt;
    const i = O.queue.findIndex(m => m.t === "throw" || m.t === "timeout");
    if (i >= 0) {
      const m = O.queue.splice(i, 1)[0];
      if (m.t === "throw" && m.actual && m.actual.o) remoteThrow(m);
      else { S.player = 1; timeUp(); }
    } else if (O.waitT > THROW_TIME + 20) opponentLeft(); // they've stopped answering
  }
}
// When the bags stop: the thrower shares the final spots; the other phone waits for them before moving on.
function flightSettled() {
  const O = S.online;
  if (!O) return true;
  if (S.player === 0) {
    netSend({ t: "snap", bags: S.world.bags.map(b => ({ id: b.id, owner: 1 - b.owner, state: b.state, x: b.x, y: b.y, z: b.z, angle: b.angle })) });
    return true;
  }
  const i = O.queue.findIndex(m => m.t === "snap");
  if (i < 0) { O.waitT += 1 / 60; if (O.waitT > 45) opponentLeft(); return false; }
  const m = O.queue.splice(i, 1)[0];
  for (const q of m.bags || []) {
    const b = S.world.bags.find(x => x.id === q.id);
    if (b && typeof q.x === "number") Object.assign(b, { owner: q.owner, state: q.state, x: q.x, y: q.y, z: q.z, angle: q.angle, vx: 0, vy: 0 });
  }
  renderScore();
  return true;
}
function renderClock() {
  const el = $("clock"), on = S.clock != null && (S.phase === "aiming" || S.phase === "throw");
  el.hidden = !on;
  if (on) {
    el.querySelector("b").textContent = Math.max(0, Math.ceil(S.clock));
    el.classList.toggle("hurry", S.clock <= 5); el.classList.toggle("warn", S.clock > 5 && S.clock <= 10); // yellow and bigger at 10, red and bigger still at 5
  }
}
$("searchCancel").onclick = () => { if (!search) return; if (search.online) postNative("net", JSON.stringify({ op: "cancel" })); search = null; $("searching").hidden = true; renderHub(); };

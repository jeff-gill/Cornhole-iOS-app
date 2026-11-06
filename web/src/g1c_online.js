
// ───────────────────────── Online play (Game Center live matches)
// PLAY looks for a live player at the same court for a few seconds; if nobody turns up you play a computer opponent
// instead (labelled CPU). In a live match each phone is "player 0" to itself. The thrower's phone sends the throw and a
// luck seed, both phones play it the same way, and the thrower then sends where every bag ended up so they never drift.
const SEARCH_TIME = 15;
const netSend = obj => postNative("net", JSON.stringify({ op: "send", data: JSON.stringify(obj) }));
let search = null; // { vi, t, host, name, hello, setup }
const canGoOnline = () => !!(nativeBridge && nativeBridge.net) && career.tutorialDone;

function playCourt(vi) {
  if (!canGoOnline()) { startMatch("career", vi); return; }
  const v = VENUES[vi];
  if (career.coins < v.fee && !houseCovers(vi)) return;
  search = { vi, t: 0 };
  postNative("net", JSON.stringify({ op: "find", group: vi + 1 }));
  renderSearch();
}
function cancelSearch(playCPU) {
  if (!search) return;
  const vi = search.vi; search = null;
  postNative("net", JSON.stringify({ op: "cancel" }));
  $("searching").hidden = true;
  if (playCPU) startMatch("career", vi);
}
function renderSearch() {
  const el = $("searching");
  el.hidden = !search;
  if (!search) return;
  const v = VENUES[search.vi];
  $("searchText").textContent = search.name ? `Matched with ${search.name}!` : `Looking for a player at ${v.name}…`;
  $("searchSub").textContent = search.name ? "Getting the boards ready" : `${Math.max(0, Math.ceil(SEARCH_TIME - search.t))}s, then you'll play a CPU opponent`;
}
// Messages from the iPhone app: matched / left, and the opponent's own messages (already parsed JSON objects).
window.__net = m => {
  if (!m || typeof m !== "object" || typeof m.t !== "string") return;
  if (m.t === "matched") {
    if (!search) { postNative("net", JSON.stringify({ op: "leave" })); return; }
    search.host = !!m.host; search.name = String(m.name || "Opponent").slice(0, 24);
    netSend({ t: "hello", bag: career.bag, trail: career.trail, effect: career.effect });
    if (search.host) {
      search.setup = { seed: Math.floor(Math.random() * 2 ** 31), flip: Math.random() < 0.5 ? 1 : -1, lead: Math.random() < 0.5 ? 0 : 1 };
      netSend({ t: "setup", ...search.setup });
    }
    renderSearch(); tryStartOnline();
  } else if (m.t === "hello" && search) { search.hello = m; tryStartOnline(); }
  else if (m.t === "setup" && search && !search.host) {
    // The host's view, flipped to ours: their box is our opponent's, and their "player 0" is our player 1.
    search.setup = { seed: m.seed | 0, flip: m.flip === 1 ? -1 : 1, lead: m.lead === 0 ? 1 : 0 };
    tryStartOnline();
  }
  else if (m.t === "nomatch") { if (search && !search.name) cancelSearch(true); }
  else if (m.t === "left" || m.t === "quit") opponentLeft();
  else if (m.t === "rematch" && S.online) { S.online.rematch.them = true; tryRematch(); }
  else if (m.t === "resetup" && S.online && !S.online.host) {
    S.online.rematch.setup = { seed: m.seed | 0, flip: m.flip === 1 ? -1 : 1, lead: m.lead === 0 ? 1 : 0 };
    tryRematch();
  }
  else if (S.online) S.online.queue.push(m);
};
function tryStartOnline() {
  if (!search || !search.name || !search.hello || !search.setup) return; // messages can arrive in any order
  const s = search, h = s.hello; search = null;
  $("searching").hidden = true;
  const known = (list, id, fallback) => (list.some(x => x.id === id) ? id : fallback);
  startMatch("career", s.vi, {
    ...s.setup, name: s.name, host: s.host,
    bag: known(BAGS, h.bag, "starter"), trail: known(TRAILS, h.trail, "none"), effect: known(EFFECTS, h.effect, "confetti"),
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
  const { name, bag, trail, effect, host } = O;
  $("inningSheet").hidden = true;
  startMatch("career", S.venue, { ...R.setup, name, bag, trail, effect, host });
}
function leaveOnline() { if (S.online) { netSend({ t: "quit" }); postNative("net", JSON.stringify({ op: "leave" })); } }

// Per frame: the search countdown, the throw clock, and the opponent's queued messages.
function updateOnline(dt) {
  if (search && !search.name) { search.t += dt; if (search.t >= SEARCH_TIME) cancelSearch(true); else renderSearch(); }
  if (S.clock != null && (S.phase === "aiming" || S.phase === "throw")) {
    const before = Math.ceil(S.clock);
    S.clock -= dt;
    if (Math.ceil(S.clock) !== before) { renderClock(); if (S.clock <= 5 && S.clock > 0) sfx.tick(); }
    if (S.clock <= 0) timeUp();
  }
  const O = S.online; if (!O) return;
  // Live matches don't wait forever on the between-innings card.
  if (S.phase === "inning") { O.innT = (O.innT || 0) + dt; if (O.innT > 10) { O.innT = 0; dismissScorecard(0, -1); } } else O.innT = 0;
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
  if (on) { el.querySelector("b").textContent = Math.max(0, Math.ceil(S.clock)); el.classList.toggle("hurry", S.clock <= 5); }
}
$("searchCancel").onclick = () => { if (!search) return; const vi = search.vi; search = null; postNative("net", JSON.stringify({ op: "cancel" })); $("searching").hidden = true; renderHub(); void vi; };

'use strict';
/* Pitchford Fight — app flow: home, lobby, match loop (host or client), results, input. */

const $ = id => document.getElementById(id);
const store = { get(k, d) { try { return localStorage.getItem('pf_' + k) || d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('pf_' + k, v); } catch (e) {} } };
const App = { role: null, pid: 'H', room: null, W: null, V: null, me: null, outbox: [], lastSnap: 0, lastSend: 0, lastTick: 0, acc: 0, ended: false, portraits: {}, offline: false };
let myChar = ORDER.includes(store.get('char')) ? store.get('char') : 'jason';

/* ---------- screens ---------- */
function show(id) { for (const s of ['home', 'lobby', 'results']) $(s).classList.toggle('hidden', s !== id); document.body.classList.toggle('ingame', id === 'game'); }
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
const nick = () => ($('nick').value.trim() || ROSTER[myChar].name).slice(0, 12);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- lobby ---------- */
function renderLobby() {
  const r = App.room; if (!r) return;
  const host = App.role === 'host', mine = r.players.find(p => p.pid === App.pid);
  $('roomCode').textContent = r.code;
  $('shareRow').classList.toggle('hidden', App.offline);
  $('offlineNote').classList.toggle('hidden', !App.offline);
  $('modes').innerHTML = Object.keys(MODES).map(k => `<div class="mode ${r.mode === k ? 'sel' : ''} ${host ? '' : 'ro'}" data-mode="${k}"><b>${MODES[k].name}</b><i>${MODES[k].tag}</i><small>${MODES[k].desc}</small></div>`).join('');
  const row = p => `<div class="prow ${p.pid === App.pid ? 'me' : ''}"><img src="${App.portraits[p.char] || ''}" style="background:${ROSTER[p.char].look.bg}"><span><b>${esc(p.name)}</b><small>${ROSTER[p.char].name} · ${ROSTER[p.char].role}${p.pid === 'H' ? ' · host' : ''}</small></span>${r.mode === 'ball' ? `<em class="team t${p.team}" ${p.pid === App.pid ? 'data-switch="1" title="Switch team"' : ''}>${p.team ? 'RED' : 'BLUE'}${p.pid === App.pid ? ' ⇄' : ''}</em>` : ''}</div>`;
  $('players').innerHTML = r.players.map(row).join('') + `<div class="hint">${r.mode === 'ball' ? 'Empty spots on each team are filled with bots.' : r.fill ? 'Empty spots are filled with bots (10 fighters).' : 'No bots — humans only.'}</div>`;
  $('fillRow').classList.toggle('hidden', !(host && r.mode === 'showdown'));
  $('fill').checked = r.fill;
  $('start').classList.toggle('hidden', !host);
  $('waiting').classList.toggle('hidden', host);
  $('waiting').textContent = r.playing ? 'Match in progress — you’ll be in the next one.' : 'Waiting for the host to start…';
  const sel = mine ? mine.char : myChar, H = ROSTER[sel];
  for (const c of document.querySelectorAll('#chars .char')) c.classList.toggle('sel', c.dataset.char === sel);
  $('charInfo').innerHTML = `<b>${H.name}</b> <i>${H.role}</i><span>❤ ${H.hp}</span><p><u>${H.atk}</u> ${H.atkDesc}</p><p><u class="s">${H.sup}</u> ${H.supDesc}</p>`;
}
function buildCharGrid() {
  $('chars').innerHTML = ORDER.map(k => `<div class="char" data-char="${k}" style="--bg:${ROSTER[k].look.bg}"><img src="${App.portraits[k] || ''}" alt=""><b>${ROSTER[k].name}</b></div>`).join('')
    + COMING_SOON.map(n => `<div class="char soon"><div class="q">?</div><b>${n}</b><small>coming soon</small></div>`).join('');
}
function pushLobby() { if (App.role === 'host') { Net.broadcast({ k: 'lobby', room: App.room }); } renderLobby(); }
function pickChar(k) {
  myChar = k; store.set('char', k);
  if (App.role === 'host') { const p = App.room.players.find(p => p.pid === 'H'); p.char = k; p.name = nick(); pushLobby(); }
  else { Net.send({ k: 'pick', char: k, name: nick() }); const p = App.room && App.room.players.find(p => p.pid === App.pid); if (p) p.char = k; renderLobby(); }
}
function smallerTeam() { const n = [0, 0]; App.room.players.forEach(p => n[p.team]++); return n[1] < n[0] ? 1 : 0; }
function switchTeam(pid) {
  const r = App.room, p = r.players.find(p => p.pid === pid); if (!p) return;
  if (r.players.filter(q => q.team === 1 - p.team).length >= 3) { if (pid === App.pid) toast('That team is full.'); return; }
  p.team = 1 - p.team; pushLobby();
}

/* ---------- hosting ---------- */
function randomCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function createRoom(tries = 0) {
  SFX.unlock(); store.set('nick', $('nick').value.trim());
  const code = randomCode();
  $('homeStatus').textContent = 'Creating room…';
  const begin = offline => {
    App.role = 'host'; App.pid = 'H'; App.offline = offline;
    App.room = { code: offline ? 'SOLO' : code, mode: 'showdown', fill: true, playing: false, players: [{ pid: 'H', name: nick(), char: myChar, team: 0 }] };
    $('homeStatus').textContent = ''; show('lobby'); renderLobby();
    if (offline) toast('Could not reach the room server — playing offline with bots.');
  };
  Net.host(code, {
    open: () => begin(false),
    error: t => { if (t === 'taken' && tries < 5) createRoom(tries + 1); else begin(true); },
    join: () => {},
    data: (pid, m) => hostData(pid, m),
    leave: pid => {
      const r = App.room; r.players = r.players.filter(p => p.pid !== pid);
      if (App.W) { const f = App.W.fighters.find(f => f.pid === pid); if (f) { f.bot = true; f.pid = null; } }
      pushLobby();
    },
  });
}
function hostData(pid, m) {
  const r = App.room; if (!r || !m) return;
  const p = r.players.find(p => p.pid === pid);
  if (m.k === 'hello' && !p) {
    if (r.players.length >= 10) { Net.sendTo(pid, { k: 'full' }); return; }
    r.players.push({ pid, name: String(m.name || 'Guest').slice(0, 12), char: ORDER.includes(m.char) ? m.char : 'jason', team: smallerTeam() });
    pushLobby();
  } else if (!p) return;
  else if (m.k === 'pick' && ORDER.includes(m.char)) { p.char = m.char; if (m.name) p.name = String(m.name).slice(0, 12); pushLobby(); }
  else if (m.k === 'team') switchTeam(pid);
  else if (m.k === 'i' && App.W) { const f = App.W.fighters.find(f => f.pid === pid); if (f) feedInput(f, m); }
}
function buildSlots() {
  const r = App.room, used = new Set(r.players.map(p => p.char));
  const bot = team => { const free = ORDER.filter(c => !used.has(c)), c = pick(free.length ? free : ORDER); used.add(c); return { char: c, name: ROSTER[c].name, bot: true, team }; };
  const human = p => ({ pid: p.pid, name: p.name, char: p.char, team: p.team });
  if (r.mode === 'showdown') {
    const s = r.players.slice(0, 10).map(human), n = r.fill ? 10 : Math.max(2, s.length);
    while (s.length < n) s.push(bot(0));
    return s;
  }
  const s = [];
  for (const t of [0, 1]) { const h = r.players.filter(p => p.team === t).slice(0, 3).map(human); while (h.length < 3) h.push(bot(t)); s.push(...h); }
  return s;
}
function startMatch() {
  SFX.unlock();
  const r = App.room, W = App.W = mkWorld(r.mode, buildSlots());
  App.V = W; App.me = W.fighters.find(f => f.pid === 'H') || null; App.outbox = []; App.acc = 0; App.ended = false; App.lastTick = performance.now();
  r.playing = true; Net.broadcast({ k: 'lobby', room: r });
  const init = initPayload(W);
  for (const pid of Net.peers) { const f = W.fighters.find(f => f.pid === pid); Net.sendTo(pid, { k: 'start', init, you: f ? f.id : -1 }); }
  G3.startMatch(W, App.me); show('game');
}
function hostTick(now) {
  const W = App.W; if (!W || App.ended) return;
  let dt = Math.min(.25, (now - App.lastTick) / 1000); App.lastTick = now;
  App.acc += dt;
  if (App.me) feedInput(App.me, Input.sample(W, App.me));
  while (App.acc >= 1 / 60) { step(W, 1 / 60); App.acc -= 1 / 60; }
  if (W.ev.length) { for (const e of W.ev) { G3.fx(e); App.outbox.push(e); } W.ev.length = 0; }
  if (now - App.lastSnap >= 33) {
    App.lastSnap = now;
    if (Net.peers.length) { const s = snapshot(W, now); s.e = App.outbox; Net.broadcast(s); }
    App.outbox = [];
  }
  if (W.phase === 'over') {
    App.ended = true; App.room.playing = false;
    Net.broadcast({ k: 'end', over: W.over });
    setTimeout(() => { showResults(W.over); Net.broadcast({ k: 'lobby', room: App.room }); }, 400);
  }
}

/* ---------- joining ---------- */
function joinRoom() {
  SFX.unlock(); store.set('nick', $('nick').value.trim());
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) { toast('Enter the 4-letter room code.'); return; }
  $('homeStatus').textContent = 'Joining ' + code + '…';
  Net.join(code, {
    open: id => { App.role = 'client'; App.pid = id; App.offline = false; App.room = null; Net.send({ k: 'hello', name: nick(), char: myChar }); },
    error: msg => { $('homeStatus').textContent = ''; toast(msg); },
    data: m => clientData(m),
    close: () => { G3.stopMatch(); App.V = App.me = null; App.role = null; show('home'); toast('Disconnected — the host closed the room.'); },
  });
}
function clientData(m) {
  if (!m) return;
  if (m.k === 'lobby') { App.room = m.room; $('homeStatus').textContent = ''; if (!App.V && $('results').classList.contains('hidden')) show('lobby'); renderLobby(); }
  else if (m.k === 'full') { toast('That room is full.'); Net.close(); }
  else if (m.k === 'start') { App.V = mkView(m.init); App.me = App.V.fighters[m.you] || null; App.ended = false; G3.startMatch(App.V, App.me); show('game'); }
  else if (m.k === 's' && App.V) viewSnap(App.V, m, performance.now(), G3.fx);
  else if (m.k === 'end' && App.V) { App.ended = true; setTimeout(() => showResults(m.over), 400); }
}
function clientTick(now, dt) {
  const V = App.V; if (!V) return;
  const inp = App.me ? Input.sample(V, App.me) : null;
  viewTick(V, now, dt, App.me, inp);
  if (inp && now - App.lastSend >= 33) { App.lastSend = now; Net.send(inp); }
}

/* ---------- results ---------- */
function showResults(over) {
  const V = App.V; if (!V) return;
  const me = App.me, F = id => V.fighters[id];
  const line = (r, extra) => { const f = F(r.id); return `<div class="rrow ${f === me ? 'me' : ''} ${V.mode === 'ball' ? 't' + f.team : ''}"><em>${extra}</em><img src="${App.portraits[f.char]}" style="background:${f.h.look.bg}"><span><b>${esc(f.name)}</b><small>${f.h.name}${f.bot ? ' · bot' : ''}</small></span><i>${r.kills} KO${V.mode === 'ball' ? ' · ' + r.goals + ' goal' + (r.goals === 1 ? '' : 's') : ''}</i></div>`; };
  if (over.mode === 'showdown') {
    const ranks = over.ranks.slice().sort((a, b) => a.place - b.place), mine = me && over.ranks.find(r => r.id === me.id);
    $('resTitle').textContent = mine ? (mine.place === 1 ? 'LAST ONE STANDING!' : `YOU PLACED #${mine.place}`) : `${F(ranks[0].id).name} WINS!`;
    $('resSub').textContent = `${F(ranks[0].id).name} takes the showdown`;
    $('resList').innerHTML = ranks.map(r => line(r, '#' + r.place)).join('');
  } else {
    const t = me ? me.team : 0, a = over.score[t], b = over.score[1 - t];
    $('resTitle').textContent = over.win < 0 ? 'DRAW' : over.win === t ? 'VICTORY!' : 'DEFEAT';
    $('resSub').textContent = `Final score ${a} – ${b}`;
    $('resList').innerHTML = over.ranks.slice().sort((x, y) => F(x.id).team - F(y.id).team || y.kills - x.kills).map(r => line(r, F(r.id).team === t ? 'ALLY' : 'FOE')).join('');
  }
  show('results');
}
function backToLobby() { G3.stopMatch(); App.V = App.me = null; if (App.role === 'host') App.W = null; show(App.room ? 'lobby' : 'home'); renderLobby(); }

/* ---------- input ---------- */
const Input = {
  K: {}, mouse: { x: 0, y: 0, down: false }, touch: false, move: null, aim: null, fc: 0, s: 0, tap: false, supTap: false, lastA: 0, lastD: 200, supBtn: null, hold: 0,
  autoAim(V, me) { // nearest shootable thing in range: enemy fighter, enemy pet/rover, or a gift box
    const R = me.h.range * T; let bx = 0, by = 0, bd = 1e9;
    const consider = (x, y, max) => { const d = Math.hypot(x - me.x, y - me.y); if (d < max && d < bd) { bd = d; bx = x; by = y; } };
    for (const o of V.fighters) if (o.alive && o.team !== me.team && visibleTo(V, o, me)) consider(o.x, o.y, R * 1.3);
    for (const un of V.units) if (un.team !== me.team) consider(un.x, un.y, R * 1.2);
    for (const k of V.crates.keys()) consider((k % V.W + .5) * T, (((k / V.W) | 0) + .5) * T, R);
    if (bd > 1e8) return false;
    this.lastA = Math.atan2(by - me.y, bx - me.x); this.lastD = bd; return true;
  },
  sample(V, me) {
    const K = this.K;
    let mx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0), my = (K.KeyS || K.ArrowDown ? 1 : 0) - (K.KeyW || K.ArrowUp ? 1 : 0), f = 0;
    if (this.move) { mx = this.move.dx; my = this.move.dy; }
    if (!this.touch) {
      const w = G3.screenToWorld(this.mouse.x, this.mouse.y);
      this.lastA = Math.atan2(w.y - me.y, w.x - me.x); this.lastD = Math.hypot(w.x - me.x, w.y - me.y); f = this.mouse.down ? 1 : 0;
    } else {
      if (this.aim && this.aim.drag) { this.lastA = this.aim.ang; this.lastD = this.aim.mag * me.h.range * T; }
      else if (this.tap || this.supTap) { if (!this.autoAim(V, me)) this.lastD = me.h.range * T * .6; this.hold = performance.now() + 450; }
      else if (Math.hypot(mx, my) > .15 && performance.now() > this.hold) this.lastA = Math.atan2(my, mx); // keep the shot's aim briefly so it isn't overwritten by walking
      if (this.tap) this.fc++;
      if (this.supTap) this.s++;
      this.tap = this.supTap = false;
    }
    me.aimDist = this.lastD;
    return { k: 'i', mx: +mx.toFixed(2), my: +my.toFixed(2), a: +this.lastA.toFixed(3), d: Math.round(this.lastD), f, fc: this.fc, s: this.s };
  },
};
function wireInput() {
  const I = Input, hud = $('hud');
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    I.K[e.code] = true;
    if ((e.code === 'Space' || e.code === 'KeyE') && G3.active) { if (!e.repeat) I.s++; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { I.K[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in I.K) I.K[k] = false; I.mouse.down = false; });
  hud.addEventListener('mousemove', e => { I.mouse.x = e.clientX; I.mouse.y = e.clientY; });
  hud.addEventListener('mousedown', e => { I.touch = false; I.mouse.x = e.clientX; I.mouse.y = e.clientY; if (e.button === 0) I.mouse.down = true; else if (e.button === 2) I.s++; });
  window.addEventListener('mouseup', e => { if (e.button === 0) I.mouse.down = false; });
  hud.addEventListener('contextmenu', e => e.preventDefault());
  const stick = (st, t) => {
    const dx = t.clientX - st.ox, dy = t.clientY - st.oy, d = Math.hypot(dx, dy), m = Math.min(d, 54);
    st.dx = d ? dx / d * m / 54 : 0; st.dy = d ? dy / d * m / 54 : 0; st.cx = st.ox + st.dx * 54; st.cy = st.oy + st.dy * 54; st.mag = m / 54;
    if (d > 20) { st.drag = true; st.ang = Math.atan2(dy, dx); }
  };
  hud.addEventListener('touchstart', e => {
    e.preventDefault(); I.touch = true;
    for (const t of e.changedTouches) {
      const b = I.supBtn;
      if (b && Math.hypot(t.clientX - b.x, t.clientY - b.y) < b.r) { I.supTap = true; continue; }
      const st = { id: t.identifier, ox: t.clientX, oy: t.clientY, cx: t.clientX, cy: t.clientY, dx: 0, dy: 0, drag: false, ang: 0, mag: 0, t0: performance.now() };
      if (t.clientX < window.innerWidth / 2) { if (!I.move) I.move = st; } else if (!I.aim) I.aim = st;
    }
  }, { passive: false });
  hud.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) for (const st of [I.move, I.aim]) if (st && st.id === t.identifier) stick(st, t); }, { passive: false });
  const end = e => {
    for (const t of e.changedTouches) {
      if (I.move && I.move.id === t.identifier) { if (!I.move.drag && performance.now() - I.move.t0 < 260) I.tap = true; I.move = null; } // a quick tap anywhere shoots
      if (I.aim && I.aim.id === t.identifier) { if (I.aim.drag) { I.lastA = I.aim.ang; I.lastD = I.aim.mag * (App.me ? App.me.h.range * T : 300); I.fc++; I.hold = performance.now() + 450; } else I.tap = true; I.aim = null; }
    }
  };
  hud.addEventListener('touchend', end); hud.addEventListener('touchcancel', end);
}

/* ---------- boot ---------- */
let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);          // schedule first so one bad frame can never stop the loop
  const dt = Math.min(.05, (now - lastFrame) / 1000 || 0); lastFrame = now;
  try {
    if (App.role === 'host') hostTick(now); else if (App.role === 'client') clientTick(now, dt);
  } catch (e) { console.error('tick', e); }
  try {
    if (G3.active) { const ui = { touch: Input.touch, sticks: [Input.move, Input.aim], supBtn: null }; G3.frame(dt, now, ui); Input.supBtn = ui.supBtn; }
  } catch (e) { console.error('render', e); }
}
function boot() {
  G3.init($('game'), $('hud'));
  try { App.portraits = G3.portraits(); } catch (e) { console.error(e); }
  buildCharGrid();
  $('nick').value = store.get('nick', '');
  const q = new URLSearchParams(location.search).get('room');
  if (q) { $('code').value = q.toUpperCase().slice(0, 4); $('homeStatus').textContent = 'Enter your name and hit JOIN to enter room ' + $('code').value; }
  $('create').addEventListener('click', () => createRoom());
  $('join').addEventListener('click', joinRoom);
  $('code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  $('start').addEventListener('click', startMatch);
  $('leave').addEventListener('click', () => { Net.close(); App.role = null; App.room = null; App.W = null; show('home'); });
  $('again').addEventListener('click', backToLobby);
  $('fill').addEventListener('change', e => { App.room.fill = e.target.checked; pushLobby(); });
  $('copy').addEventListener('click', () => {
    const url = location.origin + location.pathname + '?room=' + App.room.code;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Invite link copied!'), () => toast(url));
  });
  $('modes').addEventListener('click', e => { const m = e.target.closest('.mode'); if (m && App.role === 'host') { App.room.mode = m.dataset.mode; pushLobby(); } });
  $('chars').addEventListener('click', e => { const c = e.target.closest('.char'); if (c && c.dataset.char) pickChar(c.dataset.char); });
  $('players').addEventListener('click', e => { if (e.target.closest('[data-switch]')) { if (App.role === 'host') switchTeam('H'); else Net.send({ k: 'team' }); } });
  wireInput();
  try { Input.touch = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
  // keep the simulation ticking if the host's tab is in the background (rAF stops there)
  setInterval(() => { if (document.hidden && App.role === 'host') hostTick(performance.now()); }, 50);
  window.addEventListener('beforeunload', () => Net.close());
  show('home');
  requestAnimationFrame(frame);
}
boot();

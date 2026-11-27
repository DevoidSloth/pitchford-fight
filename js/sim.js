'use strict';
/* Pitchford Fight — authoritative game simulation (runs on the room host). No DOM in here. */

const SOLID = { '#': 1, X: 1, c: 1, '~': 1, g: 1 }, OPAQUE = { '#': 1, X: 1, c: 1 }, BALLBLOCK = { '#': 1, X: 1, c: 1, '~': 1 };
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const rint = n => Math.floor(Math.random() * n);
const pick = a => a[rint(a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- map ---------- */
const STAMPS = [
  ['.....', '.....', '.....', '.....', '.....'],
  ['.....', '.###.', '.....', '.bbb.', '.....'],
  ['.#...', '.#.b.', '.#.b.', '...b.', '.....'],
  ['.....', '.bbb.', '.bbb.', '.bbb.', '.....'],
  ['.....', '.##..', '.#...', '...c.', '.....'],
  ['.....', '.~~..', '.~~~.', '..~~.', '.....'],
  ['bb...', 'b.#..', '..#..', '..#.b', '...bb'],
  ['.....', '..#..', '.###.', '..#..', '.....'],
  ['.b.b.', '.b.b.', '.....', '.###.', '.....'],
  ['.....', '.#.#.', '..c..', '.#.#.', '.....'],
  ['bbb..', 'b....', '..c..', '....b', '..bbb'],
  ['.....', '.##b.', '.##b.', '..bb.', '.....'],
  ['.....', '.bb..', '.bb#.', '...#.', '.....'],
];
function tile(W, tx, ty) { return (tx < 0 || ty < 0 || tx >= W.W || ty >= W.H) ? 'X' : W.map[ty][tx]; }
function tileAt(W, x, y) { return tile(W, Math.floor(x / T), Math.floor(y / T)); }
function setTile(W, tx, ty, c) { W.map[ty][tx] = c; W.ev.push(['t', tx, ty, c]); }
function blankMap(W, w, h) {
  W.W = w; W.H = h;
  W.map = [...Array(h)].map((_, y) => [...Array(w)].map((_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 'X' : '.'));
}
function setSym(W, x, y, c) {
  for (const [a, b] of [[x, y], [W.W - 1 - x, y], [x, W.H - 1 - y], [W.W - 1 - x, W.H - 1 - y]])
    if (a > 0 && b > 0 && a < W.W - 1 && b < W.H - 1) W.map[b][a] = c;
}
function stamp(W, ox, oy, noCrate, maxX, maxY) {
  let s = pick(STAMPS).map(r => r.split(''));
  if (Math.random() < .5) s = s[0].map((_, i) => s.map(r => r[i]));
  if (Math.random() < .5) s.reverse();
  if (Math.random() < .5) s.forEach(r => r.reverse());
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    let c = s[y][x]; if (c === 'c' && noCrate) c = '.';
    if (c !== '.' && ox + x <= maxX && oy + y <= maxY) setSym(W, ox + x, oy + y, c);
  }
}
function clearArea(W, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (x > 0 && y > 0 && x < W.W - 1 && y < W.H - 1) W.map[y][x] = '.';
}
function ensureReach(W, cx, cy, pts) {
  for (const [px, py] of pts) {
    const seen = new Uint8Array(W.W * W.H), q = [cy * W.W + cx]; seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % W.W, y = (q[i] / W.W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (y + dy) * W.W + x + dx;
        if (!seen[n] && !SOLID[tile(W, x + dx, y + dy)]) { seen[n] = 1; q.push(n); }
      }
    }
    if (seen[py * W.W + px]) continue;
    let x = px, y = py;
    while (x !== cx || y !== cy) {
      if (x > 0 && y > 0 && x < W.W - 1 && y < W.H - 1 && SOLID[W.map[y][x]]) W.map[y][x] = '.';
      if (Math.abs(cx - x) > Math.abs(cy - y)) x += Math.sign(cx - x); else y += Math.sign(cy - y);
    }
  }
}
function genShowdown(W) {
  blankMap(W, 41, 41);
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) stamp(W, 1 + cx * 5, 1 + cy * 5, false, 20, 20);
  let n = 0;
  for (let y = 1; y <= 20; y++) for (let x = 1; x <= 20; x++) if (W.map[y][x] === 'c') n++;
  for (let tries = 0; n < 9 && tries < 200; tries++) {
    const x = 2 + rint(18), y = 2 + rint(18);
    if (W.map[y][x] === '.' || W.map[y][x] === 'b') { setSym(W, x, y, 'c'); n++; }
  }
  clearArea(W, 18, 18, 22, 22); setSym(W, 18, 18, 'c'); setSym(W, 20, 17, 'b'); setSym(W, 17, 20, 'b');
  W.spawns = [];
  for (let i = 0; i < 10; i++) {
    const a = (i + .5) / 10 * TAU, x = Math.round(20 + Math.cos(a) * 15.5), y = Math.round(20 + Math.sin(a) * 15.5);
    clearArea(W, x - 1, y - 1, x + 1, y + 1); W.spawns.push([x, y]);
  }
  ensureReach(W, 20, 20, W.spawns);
  for (let y = 0; y < W.H; y++) for (let x = 0; x < W.W; x++) if (W.map[y][x] === 'c') W.crates.set(y * W.W + x, 2000);
}
function genBall(W) {
  blankMap(W, 35, 21);
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) stamp(W, 5 + cx * 6, 1 + cy * 5, true, 16, 10);
  clearArea(W, 1, 6, 4, 14); clearArea(W, 30, 6, 33, 14); clearArea(W, 15, 8, 19, 12);
  const left = [[4, 10], [6, 7], [6, 13]];
  W.spawns = [left, left.map(([x, y]) => [34 - x, y])];
  for (const [x, y] of [...W.spawns[0], ...W.spawns[1]]) clearArea(W, x - 1, y - 1, x + 1, y + 1);
  ensureReach(W, 17, 10, [...W.spawns[0], ...W.spawns[1]]);
  for (let y = 8; y <= 12; y++) { W.map[y][0] = 'g'; W.map[y][34] = 'g'; }
}

/* ---------- collision / pathing ---------- */
function circHits(W, x, y, r, blocks) {
  const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T), y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!blocks[tile(W, tx, ty)]) continue;
    const cx = clamp(x, tx * T, tx * T + T), cy = clamp(y, ty * T, ty * T + T);
    if (Math.hypot(x - cx, y - cy) < r) return true;
  }
  return false;
}
function pushOut(W, e) {
  const r = e.r;
  const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T), y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!SOLID[tile(W, tx, ty)]) continue;
    const L = tx * T, U = ty * T, cx = clamp(e.x, L, L + T), cy = clamp(e.y, U, U + T);
    const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
    if (d >= r) continue;
    if (d < .001) {
      const pl = e.x - L, pr = L + T - e.x, pu = e.y - U, pd = U + T - e.y, m = Math.min(pl, pr, pu, pd);
      if (m === pl) e.x = L - r; else if (m === pr) e.x = L + T + r; else if (m === pu) e.y = U - r; else e.y = U + T + r;
    } else { e.x += dx / d * (r - d); e.y += dy / d * (r - d); }
  }
}
function moveEnt(W, e, dx, dy) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
  for (let i = 0; i < n; i++) { e.x += dx / n; e.y += dy / n; pushOut(W, e); }
}
function los(W, x1, y1, x2, y2, ignoreKey = -1) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 12);
  for (let i = 1; i < n; i++) {
    const tx = Math.floor((x1 + (x2 - x1) * i / n) / T), ty = Math.floor((y1 + (y2 - y1) * i / n) / T);
    if (OPAQUE[tile(W, tx, ty)] && ty * W.W + tx !== ignoreKey) return false;
  }
  return true;
}
function route(W, f, gx, gy) {
  const w = W.W, h = W.H, D = W.bfs;
  const sx = clamp(Math.floor(f.x / T), 0, w - 1), sy = clamp(Math.floor(f.y / T), 0, h - 1);
  const tx = clamp(Math.floor(gx / T), 0, w - 1), ty = clamp(Math.floor(gy / T), 0, h - 1);
  if (sx === tx && sy === ty) return { x: gx, y: gy };
  const start = sy * w + sx, goal = ty * w + tx;
  D.fill(-1); D[goal] = 0;
  const q = [goal];
  for (let i = 0; i < q.length; i++) {
    const c = q[i]; if (c === start) break;
    const x = c % w, y = (c / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (D[n] !== -1 || (SOLID[W.map[ny][nx]] && n !== start)) continue;
      if (dx && dy && (SOLID[tile(W, x + dx, y)] || SOLID[tile(W, x, y + dy)])) continue;
      D[n] = D[c] + 1; q.push(n);
    }
  }
  if (D[start] < 0) return null;
  let best = -1, bd = D[start], bdiag = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = sx + dx, ny = sy + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const n = ny * w + nx, diag = !!(dx && dy);
    if (D[n] < 0) continue;
    if (diag && (SOLID[tile(W, sx + dx, sy)] || SOLID[tile(W, sx, sy + dy)])) continue;
    if (D[n] < bd || (D[n] === bd && best >= 0 && bdiag && !diag)) { bd = D[n]; best = n; bdiag = diag; }
  }
  if (best < 0 || best === goal) return { x: gx, y: gy };
  return { x: (best % w + .5) * T, y: (((best / w) | 0) + .5) * T };
}
function updSafe(W) {
  const inset = W.mode === 'showdown' ? clamp((W.t - 18) * .2, 0, W.W / 2 - 3) * T : 0;
  W.safe = { x0: inset, y0: inset, x1: W.W * T - inset, y1: W.H * T - inset };
}
function inBush(W, f) { return tileAt(W, f.x, f.y) === 'b'; }
function visibleTo(W, f, v) { return f.team === v.team || !inBush(W, f) || dist(f, v) < 2.2 * T || f.revealed; }

/* ---------- world ---------- */
function mkWorld(mode, slots) {
  const W = { mode, t: 0, phase: 'count', cd: 3.5, fighters: [], units: [], shots: [], lobs: [], picks: [], zones: [], crates: new Map(),
              ev: [], nid: 1, score: [0, 0], clock: 150, ot: false, over: null, endT: -1, ball: null, banner: '', pt: 0, safe: null,
              hadHumans: slots.some(s => !s.bot) };
  if (mode === 'showdown') {
    genShowdown(W);
    const sp = shuffle(W.spawns.slice());
    slots.forEach((s, i) => mkFighter(W, s, i, sp[i][0], sp[i][1]));
  } else {
    genBall(W);
    const cnt = [0, 0];
    slots.forEach(s => {
      const sp = W.spawns[s.team][cnt[s.team]++ % 3], f = mkFighter(W, s, s.team, sp[0], sp[1]);
      f.aim = s.team ? Math.PI : 0;
    });
    for (const t of [0, 1]) { const b = W.fighters.filter(f => f.team === t && f.bot); if (b[0]) b[0].ai.role = 'def'; }
    W.ball = { x: W.W * T / 2, y: W.H * T / 2, vx: 0, vy: 0, r: 11, owner: null, noPick: null, noT: 0 };
  }
  W.bfs = new Int16Array(W.W * W.H);
  updSafe(W);
  return W;
}
function mkFighter(W, s, team, tx, ty) {
  const h = ROSTER[s.char];
  const f = {
    id: W.fighters.length, pid: s.pid || null, char: s.char, h, team, name: s.name, bot: !!s.bot,
    x: (tx + .5) * T, y: (ty + .5) * T, spawn: [tx, ty], r: 17,
    hp: h.hp, maxhp: h.hp, ammo: 3, sup: 0, cores: 0, kills: 0, goals: 0, aim: 0, alive: true, place: 0,
    mx: 0, my: 0, vx: 0, vy: 0, kx: 0, ky: 0, inv: 0, stun: 0, buff: 0, atkCd: 0, lastCombat: -9, revealT: -9, revealed: false,
    respawnT: 0, stormT: 0, burst: null, dash: null,
    inp: { mx: 0, my: 0, a: 0, d: 200, f: 0 }, fq: 0, supQ: false, lfc: undefined, ls: undefined,
    ai: { think: rnd(.3), fireCd: rnd(.5), side: Math.random() < .5 ? 1 : -1, ox: rnd(-2, 2) * T, oy: rnd(-2, 2) * T, role: 'att', wp: null, ignore: new Set(), crate: -1 },
  };
  W.fighters.push(f); return f;
}
function feedInput(f, m) {
  const i = f.inp;
  i.mx = clamp(+m.mx || 0, -1, 1); i.my = clamp(+m.my || 0, -1, 1); i.a = +m.a || 0; i.d = clamp(+m.d || 0, 0, 2000); i.f = m.f ? 1 : 0;
  if (f.lfc !== undefined && m.fc !== f.lfc) f.fq = .25;
  if (f.ls !== undefined && m.s !== f.ls) f.supQ = true;
  f.lfc = m.fc; f.ls = m.s;
}

/* ---------- combat ---------- */
function canAct(W, f) { return f.alive && !f.dash && f.stun <= 0 && W.phase === 'play'; }
function shot(W, f, ang, o) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const sh = Object.assign({ id: W.nid++, x: f.x + c * f.r * .8, y: f.y + s * f.r * .8, dx: c, dy: s, ang, owner: f.unit ? f.owner : f, team: f.team, hit: new Set() }, o, { life: o.range });
  W.shots.push(sh);
  W.ev.push(['s', sh.id, SHOTK.indexOf(sh.k), Math.round(sh.x), Math.round(sh.y), +ang.toFixed(3), sh.sp, sh.r, Math.round(sh.life), sh.team]);
}
function lob(W, f, tx, ty, o) {
  const L = Object.assign({ id: W.nid++, x0: f.x, y0: f.y, x1: tx, y1: ty, t: 0, owner: f, team: f.team }, o);
  W.lobs.push(L);
  W.ev.push(['l', L.id, Math.round(L.x0), Math.round(L.y0), Math.round(tx), Math.round(ty), L.dur, L.team]);
}
function kick(W, f, ang, power) {
  const b = W.ball;
  b.owner = null; b.x = f.x; b.y = f.y; b.vx = Math.cos(ang) * power; b.vy = Math.sin(ang) * power; b.noPick = f; b.noT = .4; b.last = f;
  W.ev.push(['kick', f.x | 0, f.y | 0]);
}
function fire(W, f, ang, d) {
  if (!canAct(W, f) || f.ammo < 1 || f.atkCd > 0) return false;
  f.ammo -= 1; f.revealT = W.t; f.lastCombat = W.t; f.aim = ang;
  if (W.ball && W.ball.owner === f) { kick(W, f, ang, 880); f.atkCd = .3; return true; }
  const m = 1 + .1 * f.cores;
  W.ev.push(['a', f.id]);
  switch (f.char) {
    case 'soren': f.burst = { n: 2, t: 0, gap: .1, ang, o: { sp: 820, range: 7.5 * T, dmg: 620 * m, r: 6, k: 'pebble' } }; f.atkCd = .35; break;
    case 'jason': f.burst = { n: 3, t: 0, gap: .09, ang, o: { sp: 760, range: 8 * T, dmg: 430 * m, r: 6, k: 'zap' } }; f.atkCd = .45; break;
    case 'tyler': for (let i = -1; i <= 1; i++) shot(W, f, ang + i * .3, { sp: 700, range: 2.6 * T, dmg: 540 * m, r: 12, k: 'punch' }); f.atkCd = .3; break;
    case 'dylan': for (let i = -2; i <= 2; i++) shot(W, f, ang + i * .11, { sp: 640, range: 6 * T, dmg: 310 * m, r: 6, k: 'pellet' }); f.atkCd = .35; break;
    case 'scott': { const L = clamp(d || 5 * T, 2 * T, 7.5 * T); lob(W, f, f.x + Math.cos(ang) * L, f.y + Math.sin(ang) * L, { dmg: 900 * m, R: 1.25 * T, dur: .75 }); f.atkCd = .45; break; }
    case 'bea': shot(W, f, ang, { sp: 1150, range: 10.5 * T, dmg: 1040 * m, r: 6, k: 'petal' }); f.atkCd = .4; break;
    case 'harper': shot(W, f, ang, { sp: 700, range: 8.5 * T, dmg: 780 * m, r: 9, k: 'yarn', bounce: 2 }); f.atkCd = .35; break;
    case 'sandy': shot(W, f, ang, { sp: 560, range: 5.5 * T, dmg: 760 * m, r: 20, k: 'wave', pierce: 1 }); f.atkCd = .4; break;
    case 'gary': shot(W, f, ang, { sp: 800, range: 8 * T, dmg: 720 * m, r: 8, k: 'fork', pierce: 1 }); f.atkCd = .4; break;
    case 'terry': for (let i = -1; i <= 1; i++) shot(W, f, ang + i * .16, { sp: 700, range: 7.5 * T, dmg: 450 * m, r: 8, k: 'book' }); f.atkCd = .4; break;
  }
  return true;
}
function freeSpot(W, f, ang, L, r) {
  let tx, ty;
  for (;;) { tx = f.x + Math.cos(ang) * L; ty = f.y + Math.sin(ang) * L; if (L <= 0 || !circHits(W, tx, ty, r, SOLID)) break; L -= 8; }
  return L <= 0 ? { x: f.x, y: f.y } : { x: tx, y: ty };
}
function useSuper(W, f, ang, d) {
  if (!canAct(W, f) || f.sup < 1) return;
  f.sup = 0; f.revealT = W.t; f.lastCombat = W.t; f.aim = ang;
  if (W.ball && W.ball.owner === f) { kick(W, f, ang, 1300); return; }
  const m = 1 + .1 * f.cores;
  W.ev.push(['sup', f.id]);
  switch (f.char) {
    case 'soren': f.buff = 4.5; break;
    case 'tyler': f.dash = { t: .45, ang, hit: new Set(), dmg: 900 * m, sp: 6 * T / .45, smash: true, stun: .8 }; break;
    case 'jason': {
      W.units = W.units.filter(u => { if (u.owner === f && u.kind === 'rover') { W.ev.push(['u-', u.id, u.x | 0, u.y | 0]); return false; } return true; });
      const p = freeSpot(W, f, ang, clamp(d || 2 * T, T, 4 * T), 16);
      W.units.push({ unit: true, id: W.nid++, kind: 'rover', owner: f, team: f.team, x: p.x, y: p.y, r: 16, hp: 2800, maxhp: 2800, life: 20, cd: .6, aim: ang, dmg: 300 * m });
      break;
    }
    case 'dylan': for (let i = -4; i <= 4; i++) shot(W, f, ang + i * .09, { sp: 700, range: 6.5 * T, dmg: 380 * m, r: 8, k: 'blast', breaks: 1, kb: 220 }); break;
    case 'scott': {
      const L = clamp(d || 5 * T, 2 * T, 7.5 * T), cx = f.x + Math.cos(ang) * L, cy = f.y + Math.sin(ang) * L;
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, o = i ? 1.5 * T : 0; lob(W, f, cx + Math.cos(a) * o, cy + Math.sin(a) * o, { dmg: 800 * m, R: 1.25 * T, dur: .7 + i * .12 }); }
      break;
    }
    case 'bea': for (let i = -1; i <= 1; i++) shot(W, f, ang + i * .1, { sp: 1000, range: 11 * T, dmg: 950 * m, r: 9, k: 'bigpetal', pierce: 1 }); break;
    case 'harper':
      W.units = W.units.filter(u => { if (u.owner === f && u.kind === 'cat') { W.ev.push(['u-', u.id, u.x | 0, u.y | 0]); return false; } return true; });
      W.units.push({ unit: true, id: W.nid++, kind: 'cat', owner: f, team: f.team, x: f.x, y: f.y, r: 13, hp: 2400, maxhp: 2400, life: 14, cd: 0, aim: ang, dmg: 380 * m, think: 0, wp: null });
      break;
    case 'sandy': { const z = { id: W.nid++, x: f.x, y: f.y, R: 2.6 * T, t: 8, team: f.team, owner: f }; W.zones.push(z); W.ev.push(['z', z.id, z.x | 0, z.y | 0, z.R, z.t, z.team]); break; }
    case 'gary': for (let i = 0; i < 12; i++) shot(W, f, ang + i / 12 * TAU, { sp: 760, range: 6.5 * T, dmg: 640 * m, r: 8, k: 'fork', pierce: 1 }); break;
    case 'terry': aoe(W, f.x, f.y, 3.2 * T, 800 * m, f, 200, 1, 1.5); break;
  }
}
function hurt(W, t, dmg, src) {
  if (W.phase !== 'play') return;
  dmg = Math.round(dmg);
  if (src) { src.lastCombat = W.t; src.sup = Math.min(1, src.sup + dmg / src.h.supNeed * (t.unit ? .5 : 1)); }
  if (t.unit) {
    if (t.dead) return;
    t.hp -= dmg; W.ev.push(['hu', t.id, dmg, t.x | 0, t.y | 0]);
    if (t.hp <= 0) { t.dead = true; W.ev.push(['u-', t.id, t.x | 0, t.y | 0]); }
    return;
  }
  if (!t.alive || t.inv > 0) return;
  t.hp -= dmg; t.lastCombat = W.t; t.revealT = W.t;
  W.ev.push(['h', t.id, dmg, t.x | 0, t.y | 0]);
  if (t.hp <= 0) kill(W, t, src);
}
function aoe(W, x, y, R, dmg, src, kb, kind = 0, stun = 0) {
  W.ev.push(['boom', x | 0, y | 0, Math.round(R), kind]);
  for (const o of [...W.fighters, ...W.units]) {
    if (o.team === src.team || (o.unit ? o.dead : !o.alive)) continue;
    if (Math.hypot(o.x - x, o.y - y) >= R + o.r) continue;
    hurt(W, o, dmg, src);
    if (!o.unit && o.alive && o.inv <= 0) {
      const a = Math.atan2(o.y - y, o.x - x); o.kx += Math.cos(a) * kb; o.ky += Math.sin(a) * kb;
      if (stun) { o.stun = Math.max(o.stun, stun); o.dash = null; }
    }
  }
}
function hitCrate(W, tx, ty, dmg) {
  const k = ty * W.W + tx, hp = (W.crates.get(k) || 0) - dmg;
  if (hp > 0) { W.crates.set(k, hp); W.ev.push(['c', k, Math.round(hp)]); return; }
  W.crates.delete(k); setTile(W, tx, ty, '.'); dropCore(W, (tx + .5) * T, (ty + .5) * T, 0);
}
function dropCore(W, x, y, sp) {
  const a = rnd(TAU), p = { id: W.nid++, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 10, t: 0 };
  W.picks.push(p); W.ev.push(['p+', p.id, x | 0, y | 0, Math.round(p.vx), Math.round(p.vy)]);
}
function kill(W, t, src) {
  t.alive = false; t.hp = 0; t.burst = t.dash = null; t.stun = t.buff = 0;
  if (src) src.kills++;
  if (W.mode === 'ball') {
    t.respawnT = 4;
    if (W.ball.owner === t) { W.ball.owner = null; W.ball.vx = W.ball.vy = 0; }
    W.ev.push(['k', t.id, src ? src.id : -1, 0]);
    return;
  }
  const alive = W.fighters.filter(f => f.alive);
  t.place = alive.length + 1;
  W.ev.push(['k', t.id, src ? src.id : -1, t.place]);
  for (let i = Math.min(5, 1 + t.cores); i > 0; i--) dropCore(W, t.x, t.y, rnd(60, 200));
  if (alive.length <= 1) { if (W.endT < 0 || W.endT > 1.8) W.endT = 1.8; }
  else if (W.hadHumans && W.endT < 0 && !alive.some(f => !f.bot)) W.endT = 3;
}
function respawn(W, f, inv = 2) {
  f.x = (f.spawn[0] + .5) * T; f.y = (f.spawn[1] + .5) * T; f.hp = f.maxhp; f.alive = true; f.ammo = 3; f.inv = inv;
  f.kx = f.ky = 0; f.burst = f.dash = null; f.stun = f.buff = 0; f.aim = f.team ? Math.PI : 0; f.ai.wp = null;
  W.ev.push(['rs', f.id]);
}
function resetRound(W) {
  for (const f of W.fighters) respawn(W, f, 0);
  for (const u of W.units) W.ev.push(['u-', u.id, u.x | 0, u.y | 0]);
  for (const s of W.shots) W.ev.push(['x', s.id, s.x | 0, s.y | 0, 2]);
  W.units.length = 0; W.shots.length = 0; W.lobs.length = 0; W.zones.forEach(z => z.t = 0);
  Object.assign(W.ball, { x: W.W * T / 2, y: W.H * T / 2, vx: 0, vy: 0, owner: null, noPick: null });
  W.phase = 'count'; W.cd = 3;
}
function finish(W) {
  if (W.mode === 'showdown') {
    const alive = W.fighters.filter(f => f.alive).sort((a, b) => b.hp / b.maxhp - a.hp / a.maxhp);
    alive.forEach((f, i) => f.place = i + 1);
  }
  W.over = {
    mode: W.mode, score: W.score.slice(), win: W.score[0] > W.score[1] ? 0 : W.score[1] > W.score[0] ? 1 : -1,
    ranks: W.fighters.map(f => ({ id: f.id, place: f.place, kills: f.kills, goals: f.goals })),
  };
  W.phase = 'over';
}
function scoreGoal(W, team) {
  const b = W.ball;
  W.score[team]++; W.phase = 'goal'; W.pt = 2.4; W.banner = 'g' + team;
  if (b.last && b.last.team === team) b.last.goals++;
  W.ev.push(['goal', team, b.x | 0, b.y | 0]);
  if (W.score[team] >= 2 || W.ot) W.endT = 0;
}

/* ---------- bots ---------- */
function nearestEnemy(W, f) {
  let en = null, ed = 1e9;
  for (const o of W.fighters) {
    if (!o.alive || o.team === f.team || !visibleTo(W, o, f)) continue;
    const d = dist(f, o); if (d < ed) { ed = d; en = o; }
  }
  return [en, ed];
}
function fightPos(W, f, en, ed) {
  const ai = f.ai, range = f.h.range * T;
  if (f.hp < f.maxhp * .3 && ed < range * 1.4) { const a = Math.atan2(f.y - en.y, f.x - en.x); return { x: f.x + Math.cos(a) * 4 * T, y: f.y + Math.sin(a) * 4 * T }; }
  if (ed > range * .7 || (!f.h.lob && !los(W, f.x, f.y, en.x, en.y))) return { x: en.x, y: en.y };
  if (Math.random() < .12) ai.side *= -1;
  const a = Math.atan2(en.y - f.y, en.x - f.x) + Math.PI / 2 * ai.side;
  return { x: f.x + Math.cos(a) * T * 1.5, y: f.y + Math.sin(a) * T * 1.5 };
}
function showdownGoal(W, f, en, ed) {
  const ai = f.ai, s = W.safe, m = T * 1.5, range = f.h.range * T;
  const inSafe = (x, y, k = 0) => x > s.x0 + k && x < s.x1 - k && y > s.y0 + k && y < s.y1 - k;
  const centre = { x: W.W * T / 2 + ai.ox, y: W.H * T / 2 + ai.oy };
  if (!inSafe(f.x, f.y, m)) return centre;
  if (en && ed < (W.t - f.lastCombat < 2.5 || W.t > 45 ? 9.5 : 5.5) * T) return fightPos(W, f, en, ed);
  let best = null, bd = 8 * T;
  for (const p of W.picks) { const d = dist(f, p); if (d < bd && inSafe(p.x, p.y)) { bd = d; best = p; } }
  if (best) return { x: best.x, y: best.y };
  let ck = -1; bd = 14 * T;
  for (const k of W.crates.keys()) {
    if (ai.ignore.has(k)) continue;
    const x = (k % W.W + .5) * T, y = (((k / W.W) | 0) + .5) * T, d = Math.hypot(x - f.x, y - f.y);
    if (d < bd && inSafe(x, y, T)) { bd = d; ck = k; }
  }
  if (ck >= 0) {
    const x = (ck % W.W + .5) * T, y = (((ck / W.W) | 0) + .5) * T;
    if (bd < clamp(range * .7, 2 * T, 4 * T) && (f.h.lob || los(W, f.x, f.y, x, y, ck))) {
      f.aim = Math.atan2(y - f.y, x - f.x);
      if (ai.fireCd <= 0 && f.ammo >= 1) { fire(W, f, f.aim, bd); ai.fireCd = rnd(.3, .6); }
      return null;
    }
    ai.crate = ck; return { x, y };
  }
  return centre;
}
function ballGoal(W, f, en, ed) {
  const b = W.ball, ai = f.ai, dir = f.team === 0 ? 1 : -1, midY = W.H * T / 2, range = f.h.range * T;
  const goalX = f.team === 0 ? (W.W - .5) * T : T * .5, ownX = f.team === 0 ? T * 2.5 : (W.W - 2.5) * T;
  if (b.owner === f) {
    const gd = Math.abs(goalX - f.x), ty = midY + clamp(f.y - midY, -T * 1.6, T * 1.6);
    if (gd < 7.5 * T && los(W, f.x, f.y, goalX, ty) && f.atkCd <= 0) {
      const a = Math.atan2(ty - f.y, goalX - f.x);
      if (f.sup >= 1) useSuper(W, f, a, 0); else if (f.ammo >= 1) fire(W, f, a, 0);
    } else if (en && ed < 2.4 * T && f.ammo >= 1) {
      let mate = null, md = 9 * T;
      for (const o of W.fighters) if (o !== f && o.alive && o.team === f.team && (o.x - f.x) * dir > T) {
        const d = dist(f, o); if (d < md && los(W, f.x, f.y, o.x, o.y)) { md = d; mate = o; }
      }
      if (mate) fire(W, f, Math.atan2(mate.y - f.y, mate.x - f.x), 0);
      else if (f.hp < f.maxhp * .4) fire(W, f, Math.atan2(midY - f.y, goalX - f.x), 0);
    }
    return { x: goalX - dir * T * .9, y: midY };
  }
  if (!b.owner) {
    let ch = null, cd = 1e9;
    for (const o of W.fighters) if (o.alive && o.bot && o.team === f.team) { const d = dist(o, b); if (d < cd) { cd = d; ch = o; } }
    if (ch === f) return { x: b.x, y: b.y };
    if (en && ed < range * 1.1) return fightPos(W, f, en, ed);
    return ai.role === 'def' ? { x: (b.x + ownX) / 2, y: (b.y + midY) / 2 } : { x: b.x - dir * 2 * T, y: b.y + ai.side * 3 * T };
  }
  if (b.owner.team === f.team) {
    if (en && ed < 8 * T) return fightPos(W, f, en, ed);
    return { x: b.owner.x + dir * 2 * T, y: b.owner.y + ai.side * 3 * T };
  }
  const od = dist(f, b.owner);
  if (ai.role === 'def' && od > 6 * T) return { x: (b.owner.x + ownX) / 2, y: (b.owner.y + midY) / 2 };
  if (od < range * .6 && los(W, f.x, f.y, b.owner.x, b.owner.y)) return fightPos(W, f, b.owner, od);
  return { x: b.owner.x, y: b.owner.y };
}
function botSuperOk(f, ed) {
  switch (f.char) {
    case 'tyler': return ed < 5 * T;
    case 'dylan': return ed < 4.5 * T;
    case 'terry': return ed < 2.8 * T;
    case 'gary': return ed < 5 * T;
    case 'sandy': return f.hp < f.maxhp * .6;
    default: return true;
  }
}
function botThink(W, f) {
  const ai = f.ai, h = f.h, range = h.range * T, b = W.ball;
  let [en, ed] = nearestEnemy(W, f);
  if (b && b.owner && b.owner.team !== f.team && b.owner.alive && visibleTo(W, b.owner, f) && dist(f, b.owner) < range) { en = b.owner; ed = dist(f, en); }
  ai.crate = -1;
  const goal = W.mode === 'ball' ? ballGoal(W, f, en, ed) : showdownGoal(W, f, en, ed);
  const holding = b && b.owner === f;
  const calm = W.mode === 'showdown' && W.t < 40 && W.t - f.lastCombat > 2.5;
  if (en && !holding && ed < (calm ? Math.min(range * .95, 5.5 * T) : range * .95) && (h.lob || los(W, f.x, f.y, en.x, en.y))) {
    const lead = h.lob ? .6 : ed / h.shotSp * .7, tx = en.x + en.vx * lead, ty = en.y + en.vy * lead;
    f.aim = Math.atan2(ty - f.y, tx - f.x) + rnd(-.15, .15);
    if (ai.fireCd <= 0) {
      if (f.sup >= 1 && botSuperOk(f, ed)) { useSuper(W, f, f.aim, ed); ai.fireCd = .5; }
      else if (f.ammo >= 1 && fire(W, f, f.aim, Math.hypot(tx - f.x, ty - f.y))) ai.fireCd = rnd(.45, 1.0);
    }
  } else if (f.mx || f.my) f.aim = Math.atan2(f.my, f.mx);
  if (goal) {
    ai.wp = route(W, f, goal.x, goal.y);
    if (!ai.wp && ai.crate >= 0) ai.ignore.add(ai.crate);
  } else ai.wp = null;
}
function botUpdate(W, f, dt) {
  const ai = f.ai; ai.think -= dt; ai.fireCd -= dt;
  if (ai.think <= 0) { ai.think = rnd(.16, .26); botThink(W, f); }
  f.mx = f.my = 0;
  if (ai.wp) { const dx = ai.wp.x - f.x, dy = ai.wp.y - f.y, d = Math.hypot(dx, dy); if (d > 5) { f.mx = dx / d; f.my = dy / d; } }
}
function humanUpdate(W, f, dt) {
  const i = f.inp; let mx = i.mx, my = i.my; const d = Math.hypot(mx, my);
  if (d > 1) { mx /= d; my /= d; }
  f.mx = mx; f.my = my; f.aim = i.a;
  if (f.supQ) { f.supQ = false; useSuper(W, f, i.a, i.d); }
  if (f.fq > 0) f.fq -= dt;
  if (i.f || f.fq > 0) { if (fire(W, f, i.a, i.d)) f.fq = 0; }
}

/* ---------- step ---------- */
function updFighter(W, f, dt) {
  if (!f.alive) {
    if (W.mode === 'ball') { f.respawnT -= dt; if (f.respawnT <= 0) respawn(W, f); }
    return;
  }
  f.inv = Math.max(0, f.inv - dt); f.atkCd -= dt; f.buff = Math.max(0, f.buff - dt);
  f.revealed = W.t - f.revealT < .8;
  if (f.ammo < 3) f.ammo = Math.min(3, f.ammo + dt / f.h.reload * (f.buff > 0 ? 2.5 : 1));
  if (W.t - f.lastCombat > 3 && f.hp < f.maxhp) f.hp = Math.min(f.maxhp, f.hp + f.maxhp * .14 * dt);
  const ox = f.x, oy = f.y;
  if (f.stun > 0) {
    f.stun -= dt; f.mx = f.my = 0; f.supQ = false;
    moveEnt(W, f, f.kx * dt, f.ky * dt);
  } else if (f.dash) {
    const D = f.dash, c = Math.cos(D.ang), s = Math.sin(D.ang);
    if (D.smash) {
      const tx0 = Math.floor((f.x + c * 20 - 20) / T), tx1 = Math.floor((f.x + c * 20 + 20) / T), ty0 = Math.floor((f.y + s * 20 - 20) / T), ty1 = Math.floor((f.y + s * 20 + 20) / T);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const t = tile(W, tx, ty);
        if (t === '#') setTile(W, tx, ty, '.'); else if (t === 'c') hitCrate(W, tx, ty, 9999);
      }
    }
    moveEnt(W, f, c * D.sp * dt, s * D.sp * dt);
    for (const o of [...W.fighters, ...W.units]) {
      if (o.team === f.team || (o.unit ? o.dead : !o.alive) || D.hit.has(o) || dist(f, o) > f.r + o.r + 8) continue;
      D.hit.add(o); hurt(W, o, D.dmg, f);
      if (!o.unit && o.alive && o.inv <= 0) { o.kx += c * 320; o.ky += s * 320; o.stun = Math.max(o.stun, D.stun); o.dash = null; }
    }
    D.t -= dt; if (D.t <= 0) f.dash = null;
  } else {
    if (f.bot) botUpdate(W, f, dt); else humanUpdate(W, f, dt);
    const sp = f.h.speed * (W.ball && W.ball.owner === f ? CARRY_SPEED : 1) * (f.buff > 0 ? BUFF_SPEED : 1);
    moveEnt(W, f, (f.mx * sp + f.kx) * dt, (f.my * sp + f.ky) * dt);
  }
  f.vx = (f.x - ox) / dt; f.vy = (f.y - oy) / dt;
  const k = Math.exp(-7 * dt); f.kx *= k; f.ky *= k;
  if (f.burst) {
    const B = f.burst; B.t -= dt;
    while (B.n > 0 && B.t <= 0) { shot(W, f, B.ang + rnd(-.03, .03), B.o); B.n--; B.t += B.gap; }
    if (B.n <= 0) f.burst = null;
  }
  if (W.mode === 'showdown') {
    const s = W.safe;
    if (f.x < s.x0 || f.x > s.x1 || f.y < s.y0 || f.y > s.y1) { f.stormT += dt; if (f.stormT > .8) { f.stormT = 0; hurt(W, f, 500, null); } }
    else f.stormT = Math.min(f.stormT, .4);
  }
}
function updShots(W, dt) {
  for (const s of W.shots) {
    const step = s.sp * dt, n = Math.max(1, Math.ceil(step / 10));
    for (let i = 0; i < n && !s.dead; i++) {
      const px = s.x, py = s.y;
      s.x += s.dx * step / n; s.y += s.dy * step / n; s.life -= step / n;
      const tx = Math.floor(s.x / T), ty = Math.floor(s.y / T), c = tile(W, tx, ty);
      if (OPAQUE[c]) {
        if (c === 'c') { hitCrate(W, tx, ty, s.dmg); s.dead = true; W.ev.push(['x', s.id, s.x | 0, s.y | 0, 0]); break; }
        if (s.breaks && c === '#') { setTile(W, tx, ty, '.'); s.dead = true; W.ev.push(['x', s.id, s.x | 0, s.y | 0, 0]); break; }
        if (s.bounce > 0) {
          const hx = OPAQUE[tile(W, tx, Math.floor(py / T))], hy = OPAQUE[tile(W, Math.floor(px / T), ty)];
          if (hx || !hy) s.dx = -s.dx; if (hy || !hx) s.dy = -s.dy;
          s.x = px; s.y = py; s.bounce--; s.ang = Math.atan2(s.dy, s.dx);
          W.ev.push(['b', s.id, s.x | 0, s.y | 0, +s.ang.toFixed(3), Math.round(s.life)]);
          continue;
        }
        s.dead = true; W.ev.push(['x', s.id, s.x | 0, s.y | 0, 0]); break;
      }
      for (const o of [...W.fighters, ...W.units]) {
        if (o.team === s.team || (o.unit ? o.dead : !o.alive) || s.hit.has(o)) continue;
        if (Math.hypot(o.x - s.x, o.y - s.y) >= o.r + s.r) continue;
        hurt(W, o, s.dmg, s.owner);
        if (s.kb && !o.unit) { o.kx += s.dx * s.kb; o.ky += s.dy * s.kb; }
        if (s.pierce) { s.hit.add(o); W.ev.push(['x', -1, s.x | 0, s.y | 0, 1]); }
        else { s.dead = true; W.ev.push(['x', s.id, s.x | 0, s.y | 0, 1]); break; }
      }
      if (!s.dead && s.life <= 0) { s.dead = true; W.ev.push(['x', s.id, s.x | 0, s.y | 0, 2]); }
    }
  }
  W.shots = W.shots.filter(s => !s.dead);
}
function updUnits(W, dt) {
  for (const u of W.units) {
    if (u.dead) continue;
    u.life -= dt; u.cd -= dt;
    if (u.life <= 0) { u.dead = true; W.ev.push(['u-', u.id, u.x | 0, u.y | 0]); continue; }
    let en = null, ed = 1e9;
    for (const o of W.fighters) { if (!o.alive || o.team === u.team || !visibleTo(W, o, u)) continue; const d = dist(u, o); if (d < ed) { ed = d; en = o; } }
    if (u.kind === 'rover') {
      if (en && ed < 6.5 * T && los(W, u.x, u.y, en.x, en.y)) {
        u.aim = Math.atan2(en.y - u.y, en.x - u.x);
        if (u.cd <= 0) { u.cd = .6; shot(W, u, u.aim, { sp: 700, range: 7 * T, dmg: u.dmg, r: 5, k: 'rover' }); }
      }
    } else {
      u.think -= dt;
      const tgt = en && ed < 12 * T ? en : u.owner.alive ? u.owner : null;
      if (u.think <= 0) { u.think = .25; u.wp = tgt && dist(u, tgt) > 30 ? route(W, u, tgt.x, tgt.y) : null; }
      if (u.wp) {
        const dx = u.wp.x - u.x, dy = u.wp.y - u.y, d = Math.hypot(dx, dy);
        if (d > 4) { u.aim = Math.atan2(dy, dx); moveEnt(W, u, dx / d * 235 * dt, dy / d * 235 * dt); }
      }
      if (en && ed < u.r + en.r + 10 && u.cd <= 0) { u.cd = .5; hurt(W, en, u.dmg, u.owner); }
    }
  }
  W.units = W.units.filter(u => !u.dead);
}
function updBall(W, dt) {
  const b = W.ball;
  b.noT -= dt;
  if (b.owner) {
    const f = b.owner; b.x = f.x + Math.cos(f.aim) * 20; b.y = f.y + Math.sin(f.aim) * 20; b.last = f;
  } else {
    for (let i = 0; i < 3; i++) {
      const h = dt / 3;
      b.x += b.vx * h; if (circHits(W, b.x, b.y, b.r, BALLBLOCK)) { b.x -= b.vx * h; b.vx *= -.72; }
      b.y += b.vy * h; if (circHits(W, b.x, b.y, b.r, BALLBLOCK)) { b.y -= b.vy * h; b.vy *= -.72; }
    }
    const k = Math.exp(-2 * dt); b.vx *= k; b.vy *= k;
    for (const f of W.fighters) {
      if (!f.alive || f.stun > 0 || (b.noPick === f && b.noT > 0)) continue;
      if (dist(f, b) < f.r + b.r + 3) { b.owner = f; b.vx = b.vy = 0; break; }
    }
  }
  if (tileAt(W, b.x, b.y) === 'g') scoreGoal(W, b.x < W.W * T / 2 ? 1 : 0);
}
function step(W, dt) {
  if (W.phase === 'over') return;
  if (W.phase === 'count') { W.cd -= dt; if (W.cd <= 0) W.phase = 'play'; return; }
  if (W.phase === 'goal') { W.pt -= dt; if (W.pt <= 0) { if (W.endT >= 0) finish(W); else resetRound(W); } return; }
  W.t += dt;
  if (W.endT >= 0) { W.endT -= dt; if (W.endT <= 0) { finish(W); return; } }
  if (W.mode === 'showdown') updSafe(W);
  else if (W.endT < 0) {
    W.clock -= dt;
    if (W.clock <= 0) {
      if (W.score[0] === W.score[1] && !W.ot) { W.ot = true; W.clock = 60; W.ev.push(['ot']); }
      else { W.clock = 0; W.endT = 0.01; }
    }
  }
  for (const f of W.fighters) updFighter(W, f, dt);
  updShots(W, dt);
  updUnits(W, dt);
  for (const L of W.lobs) { L.t += dt; if (L.t >= L.dur) { L.dead = true; aoe(W, L.x1, L.y1, L.R, L.dmg, L.owner, 120, 2); const tx = Math.floor(L.x1 / T), ty = Math.floor(L.y1 / T); if (tile(W, tx, ty) === 'c') hitCrate(W, tx, ty, L.dmg); } }
  W.lobs = W.lobs.filter(L => !L.dead);
  for (const z of W.zones) {
    z.t -= dt;
    for (const f of W.fighters) if (f.alive && f.team === z.team && f.hp < f.maxhp && dist(f, z) < z.R) f.hp = Math.min(f.maxhp, f.hp + 520 * dt);
  }
  W.zones = W.zones.filter(z => z.t > 0);
  for (const p of W.picks) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .9; p.vy *= .9;
    if (circHits(W, p.x, p.y, 6, SOLID)) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.vx = p.vy = 0; }
    if (p.t < .3) continue;
    for (const f of W.fighters) if (f.alive && dist(f, p) < f.r + p.r + 4) {
      p.dead = true; f.cores++; f.maxhp += 400; f.hp += 400; W.ev.push(['p-', p.id, f.id]); break;
    }
  }
  W.picks = W.picks.filter(p => !p.dead);
  if (W.ball && W.phase === 'play') updBall(W, dt);
}

/* ---------- network payloads ---------- */
function initPayload(W) {
  return { mode: W.mode, W: W.W, H: W.H, map: W.map.map(r => r.join('')), crates: [...W.crates],
           f: W.fighters.map(f => ({ id: f.id, pid: f.pid, name: f.name, char: f.char, team: f.team, bot: f.bot, x: f.x, y: f.y })) };
}
function snapshot(W, now) {
  return {
    k: 's', t: Math.round(now), ph: W.phase, cd: +W.cd.toFixed(2), ck: Math.ceil(W.clock), sc: W.score, st: +W.t.toFixed(2), bn: W.banner, ot: W.ot ? 1 : 0,
    f: W.fighters.map(f => [Math.round(f.x), Math.round(f.y), Math.max(0, Math.ceil(f.hp)), f.maxhp, Math.round(f.aim * 100), Math.round(f.ammo * 10), Math.round(f.sup * 100),
      (f.alive ? 1 : 0) | (f.inv > 0 ? 2 : 0) | (f.stun > 0 ? 4 : 0) | (f.buff > 0 ? 8 : 0) | (f.dash ? 16 : 0) | ((f.mx || f.my) ? 32 : 0) | (f.revealed ? 64 : 0),
      f.cores, f.kills, Math.max(0, Math.ceil(f.respawnT))]),
    u: W.units.map(u => [u.id, u.kind === 'cat' ? 1 : 0, u.team, Math.round(u.x), Math.round(u.y), Math.max(0, Math.ceil(u.hp)), u.maxhp, Math.round(u.aim * 100)]),
    b: W.ball ? [Math.round(W.ball.x), Math.round(W.ball.y), W.ball.owner ? W.ball.owner.id : -1] : null,
  };
}

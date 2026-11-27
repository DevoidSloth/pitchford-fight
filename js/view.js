'use strict';
/* Pitchford Fight — client-side mirror of the host's world: snapshot interpolation, local projectile
   playback and movement prediction for your own fighter. No DOM in here. */

const INTERP_MS = 100;

function mkView(init) {
  const V = {
    mode: init.mode, W: init.W, H: init.H, map: init.map.map(r => r.split('')), crates: new Map(init.crates),
    fighters: init.f.map(s => ({
      id: s.id, pid: s.pid, name: s.name, char: s.char, h: ROSTER[s.char], team: s.team, bot: s.bot, r: 17,
      x: s.x, y: s.y, px: s.x, py: s.y, hp: ROSTER[s.char].hp, maxhp: ROSTER[s.char].hp, aim: s.team && init.mode === 'ball' ? Math.PI : 0,
      ammo: 3, sup: 0, alive: true, inv: 0, stun: 0, buff: 0, dash: null, mx: 0, my: 0, revealed: false, cores: 0, kills: 0, respawnT: 0,
    })),
    units: [], shots: [], lobs: [], picks: [], zones: [], ev: [],
    ball: init.mode === 'ball' ? { x: init.W * T / 2, y: init.H * T / 2, r: 11, owner: null } : null,
    phase: 'count', cd: 3.5, clock: 150, score: [0, 0], t: 0, banner: '', ot: false, safe: null,
    snaps: [], off: null, mapDirty: true,
  };
  updSafe(V);
  return V;
}

/* Apply a host event to mirrored state. Visual effects are handled separately by the renderer. */
function viewEvent(V, e) {
  switch (e[0]) {
    case 's': { const a = e[5]; V.shots.push({ id: e[1], k: SHOTK[e[2]], x: e[3], y: e[4], dx: Math.cos(a), dy: Math.sin(a), ang: a, sp: e[6], r: e[7], life: e[8], team: e[9] }); break; }
    case 'b': { const s = V.shots.find(s => s.id === e[1]); if (s) { s.x = e[2]; s.y = e[3]; s.ang = e[4]; s.dx = Math.cos(e[4]); s.dy = Math.sin(e[4]); s.life = e[5]; } break; }
    case 'x': V.shots = V.shots.filter(s => s.id !== e[1]); break;
    case 'l': V.lobs.push({ id: e[1], x0: e[2], y0: e[3], x1: e[4], y1: e[5], dur: e[6], team: e[7], t: 0 }); break;
    case 't': V.map[e[2]][e[1]] = e[3]; V.crates.delete(e[2] * V.W + e[1]); V.mapDirty = true; break;
    case 'c': V.crates.set(e[1], e[2]); break;
    case 'p+': V.picks.push({ id: e[1], x: e[2], y: e[3], vx: e[4], vy: e[5], r: 10, t: 0 }); break;
    case 'p-': V.picks = V.picks.filter(p => p.id !== e[1]); break;
    case 'z': V.zones.push({ id: e[1], x: e[2], y: e[3], R: e[4], t: e[5], team: e[6] }); break;
  }
}

/* Take in a snapshot: discrete state applies immediately, positions are interpolated in viewTick. */
function viewSnap(V, s, recvNow, onEvent) {
  V.snaps.push(s); if (V.snaps.length > 40) V.snaps.shift();
  const o = recvNow - s.t;
  V.off = V.off === null ? o : Math.min(V.off + .05, o);
  V.phase = s.ph; V.cd = s.cd; V.clock = s.ck; V.score = s.sc; V.t = s.st; V.banner = s.bn; V.ot = !!s.ot;
  s.f.forEach((a, i) => {
    const f = V.fighters[i]; if (!f) return;
    f.hp = a[2]; f.maxhp = a[3]; f.ammo = a[5] / 10; f.sup = a[6] / 100;
    const fl = a[7];
    f.alive = !!(fl & 1); f.inv = fl & 2 ? 1 : 0; f.stun = fl & 4 ? 1 : 0; f.buff = fl & 8 ? 1 : 0; f.dash = fl & 16 ? true : null;
    f.moving = !!(fl & 32); f.revealed = !!(fl & 64); f.cores = a[8]; f.kills = a[9]; f.respawnT = a[10];
  });
  if (s.e) for (const e of s.e) { viewEvent(V, e); if (onEvent) onEvent(e); }
  updSafe(V);
}

function lerpAng(a, b, t) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; }

/* Advance the mirror by one rendered frame. `me` is your fighter (or null), `inp` your current input. */
function viewTick(V, now, dt, me, inp) {
  const S = V.snaps;
  if (S.length) {
    const rt = now - V.off - INTERP_MS;
    let i = S.length - 1;
    while (i > 0 && S[i].t > rt) i--;
    const A = S[i], B = S[Math.min(i + 1, S.length - 1)];
    const k = B.t > A.t ? clamp((rt - A.t) / (B.t - A.t), 0, 1) : 1;
    V.fighters.forEach((f, j) => {
      const a = A.f[j], b = B.f[j]; if (!a || !b) return;
      const jump = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 220;
      f.ix = jump ? b[0] : a[0] + (b[0] - a[0]) * k; f.iy = jump ? b[1] : a[1] + (b[1] - a[1]) * k;
      if (f !== me) { f.x = f.ix; f.y = f.iy; f.aim = lerpAng(a[4] / 100, b[4] / 100, k); f.mx = f.moving ? 1 : 0; f.my = 0; }
    });
    const prev = new Map(A.u.map(u => [u[0], u])), old = new Map(V.units.map(u => [u.id, u]));
    V.units = B.u.map(b => {
      const a = prev.get(b[0]) || b, u = old.get(b[0]) || { id: b[0], kind: b[1] ? 'cat' : 'rover', team: b[2], r: b[1] ? 13 : 16, unit: true };
      const nx = a[3] + (b[3] - a[3]) * k, ny = a[4] + (b[4] - a[4]) * k;
      u.moving = Math.abs(b[3] - a[3]) + Math.abs(b[4] - a[4]) > 1;
      u.x = nx; u.y = ny; u.hp = b[5]; u.maxhp = b[6]; u.aim = lerpAng(a[7] / 100, b[7] / 100, k);
      return u;
    });
    if (V.ball && B.b) {
      const a = A.b || B.b, b = B.b, jump = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 300;
      V.ball.x = jump ? b[0] : a[0] + (b[0] - a[0]) * k; V.ball.y = jump ? b[1] : a[1] + (b[1] - a[1]) * k;
      V.ball.owner = b[2] >= 0 ? V.fighters[b[2]] : null;
    }
    if (me) predictSelf(V, me, inp, dt, S[S.length - 1].f[me.id]);
    if (V.ball && V.ball.owner) { const f = V.ball.owner; V.ball.x = f.x + Math.cos(f.aim) * 20; V.ball.y = f.y + Math.sin(f.aim) * 20; }
  }
  // local playback of things the host only announces once
  for (const s of V.shots) {
    const d = s.sp * dt; s.x += s.dx * d; s.y += s.dy * d; s.life -= d;
    if (s.life <= -40 || (s.k !== 'yarn' && s.life < 0)) s.dead = true;
  }
  V.shots = V.shots.filter(s => !s.dead);
  for (const L of V.lobs) L.t += dt;
  V.lobs = V.lobs.filter(L => L.t < L.dur + .05);
  for (const z of V.zones) z.t -= dt;
  V.zones = V.zones.filter(z => z.t > 0);
  for (const p of V.picks) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.9, dt * 60); p.vy *= Math.pow(.9, dt * 60);
    if (circHits(V, p.x, p.y, 6, SOLID)) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.vx = p.vy = 0; }
  }
}

/* Move your own fighter immediately from local input, then ease towards what the host says. */
function predictSelf(V, me, inp, dt, sv) {
  const free = me.alive && !me.dash && !me.stun && V.phase === 'play';
  if (!free || !inp) { me.px = me.ix; me.py = me.iy; me.x = me.px; me.y = me.py; if (!me.alive || V.phase !== 'play') me.aim = sv[4] / 100; me.mx = me.my = 0; if (inp && me.alive) me.aim = inp.a; return; }
  let mx = inp.mx, my = inp.my; const d = Math.hypot(mx, my); if (d > 1) { mx /= d; my /= d; }
  const sp = me.h.speed * (me.buff ? BUFF_SPEED : 1) * (V.ball && V.ball.owner === me ? CARRY_SPEED : 1);
  const P = { x: me.px, y: me.py, r: me.r };
  moveEnt(V, P, mx * sp * dt, my * sp * dt);
  const ex = sv[0] - P.x, ey = sv[1] - P.y, err = Math.hypot(ex, ey);
  if (err > 130) { P.x = sv[0]; P.y = sv[1]; }
  else if (d < .05) { const k = Math.min(1, dt * 10); P.x += ex * k; P.y += ey * k; }
  else if (err > 55) { const k = Math.min(1, dt * 3); P.x += ex * k; P.y += ey * k; }
  me.px = me.x = P.x; me.py = me.y = P.y; me.aim = inp.a; me.mx = mx; me.my = my;
}

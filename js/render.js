'use strict';
/* Pitchford Fight — 3D cel-shaded renderer (Three.js toon materials + inverted-hull ink outlines) and 2D HUD overlay. */

const SFX = (() => {
  let ac = null;
  function tone(f, d = .08, type = 'square', v = .04, slide = 0) {
    if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
    } catch (e) {}
  }
  const S = {
    shoot: () => tone(620, .07, 'square', .03, -220), punch: () => tone(120, .1, 'square', .05, -50), lob: () => tone(300, .25, 'sine', .05, 260),
    hit: () => tone(150, .05, 'square', .03), ko: () => tone(420, .35, 'sawtooth', .06, -360), boom: () => tone(90, .3, 'sawtooth', .07, -50),
    power: () => tone(700, .14, 'triangle', .06, 520), sup: () => tone(300, .3, 'sawtooth', .05, 520), kick: () => tone(180, .12, 'triangle', .07, -90),
    crack: () => tone(220, .12, 'square', .04, -140), goal: () => { tone(520, .15, 'square', .06); setTimeout(() => tone(780, .32, 'square', .06), 150); },
    tick: () => tone(440, .1, 'square', .04), go: () => tone(880, .3, 'square', .05),
  };
  return { unlock() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } else if (ac.state === 'suspended') ac.resume(); }, play(n) { if (S[n]) S[n](); } };
})();

const G3 = (() => {
  const INK = 0x1c1b2e, OT = .022;
  let renderer, scene, cam, sun, hud, hx, V = null, me = null, DPR = 1, frameN = 0, timeU = { value: 0 };
  let grad, olMat, staticG = null, tileG = null, dynG = null, models = [], ballM = null, stormM = [], aimM = null, aimRing = null, partM = null, rings = [];
  const parts = [], texts = [], feed = [], live = [];
  let shake = 0, specId = -1, lastCd = 9, theme = null;
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v2 = new THREE.Vector2(), v3 = new THREE.Vector3(), dummy = new THREE.Object3D(), col = new THREE.Color();
  const camT = new THREE.Vector3();
  const THEMES = {
    showdown: { g1: '#9ad65a', g2: '#8fcc50', outer: 0x3c9a4a, sky: 0x2f8a40, wall: ['#9aa6c8', '#a8b3d2', '#8f9bc0'], border: '#2f8f4e', bush: ['#2a9d4c', '#35b05a', '#238a42'] },
    ball: { g1: '#f7dc93', g2: '#f2d286', outer: 0x39b7e6, sky: 0x2fa3d4, wall: ['#4fc4d6', '#63d0e0', '#45b7ca'], border: '#b9773f', bush: ['#22a884', '#2fc09a', '#1b9474'] },
  };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  /* ---- materials & primitives ---- */
  const SPH = new THREE.SphereGeometry(1, 20, 14), BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 16), CONE = new THREE.ConeGeometry(1, 1, 7);
  const CAPA = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI * .5), CAPB = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI * .62), CAPC = new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, Math.PI * .31);
  SPH.userData.h = [1, 1, 1]; BOX.userData.h = [.5, .5, .5]; CYL.userData.h = [1, .5, 1]; CONE.userData.h = [1, .5, 1];
  CAPA.userData.h = CAPB.userData.h = CAPC.userData.h = [1, 1, 1];
  function toon(color, o) { return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad }, o)); }
  function basic(color, o) { return new THREE.MeshBasicMaterial(Object.assign({ color }, o)); }
  function part(parent, geom, mat, s, p, ol) {
    const m = new THREE.Mesh(geom, mat); m.scale.set(s[0], s[1], s[2]); m.position.set(p[0], p[1], p[2]); m.castShadow = true;
    if (ol && gfx < 2) { const h = geom.userData.h || [1, 1, 1], o = new THREE.Mesh(geom, ol); o.scale.set(1 + OT / (s[0] * h[0]), 1 + OT / (s[1] * h[1]), 1 + OT / (s[2] * h[2])); m.add(o); }
    parent.add(m); return m;
  }
  function tex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); return t;
  }
  function topTexture(L) {
    if (!['stripes', 'floral', 'jacket', 'button', 'band'].includes(L.pattern)) return null;
    return tex(128, 64, (c, w, h) => {
      c.fillStyle = L.top; c.fillRect(0, 0, w, h);
      const fx = w * .25; // front of a sphere's UV wrap
      if (L.pattern === 'stripes') { c.fillStyle = '#27324f'; for (let y = 4; y < h; y += 9) c.fillRect(0, y, w, 4); }
      else if (L.pattern === 'floral') { for (let i = 0; i < 46; i++) { c.fillStyle = ['#7fb2e6', '#f4f1ea', '#5b8fd1'][i % 3]; c.beginPath(); c.arc(hash(i, 1) * w, hash(i, 2) * h, 2.5 + hash(i, 3) * 2.5, 0, TAU); c.fill(); } }
      else if (L.pattern === 'jacket') { c.fillStyle = L.inner; c.fillRect(fx - 9, 0, 18, h); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(fx - 11, 0, 2, h); c.fillRect(fx + 9, 0, 2, h); }
      else if (L.pattern === 'button') { c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(fx - 1, 0, 2, h); c.fillStyle = 'rgba(0,0,0,.3)'; for (let y = 14; y < h; y += 11) { c.beginPath(); c.arc(fx, y, 1.8, 0, TAU); c.fill(); } }
      else if (L.pattern === 'band') { c.fillStyle = '#ffffff'; c.fillRect(fx - 22, 22, 44, 9); c.fillStyle = '#1c1b2e'; c.fillRect(fx - 22, 31, 44, 3); }
    });
  }

  /* ---- character models ---- */
  function buildCat(ol) {
    const g = new THREE.Group(), cream = toon('#e9d8bd'), dark = toon('#5a4336');
    part(g, SPH, cream, [.16, .14, .26], [0, .2, 0], ol);
    part(g, SPH, cream, [.15, .14, .14], [0, .34, .22], ol);
    for (const s of [-1, 1]) { part(g, CONE, dark, [.06, .12, .06], [s * .09, .49, .2], ol); part(g, SPH, dark, [.05, .05, .07], [s * .1, .06, .16], null); part(g, SPH, dark, [.05, .05, .07], [s * .1, .06, -.16], null); part(g, SPH, basic(0x4aa3ff), [.025, .03, .02], [s * .06, .37, .345], null); }
    part(g, SPH, dark, [.075, .06, .05], [0, .31, .34], null);
    const tail = part(g, CYL, dark, [.03, .26, .03], [0, .36, -.27], ol); tail.rotation.x = -.5;
    g.userData.tail = tail; return g;
  }
  function buildRover(ol) {
    const g = new THREE.Group(), body = toon('#e8ecf3'), dark = toon('#3a3d4d'), blue = toon('#3f7fe0');
    part(g, BOX, body, [.5, .16, .62], [0, .24, 0], ol);
    for (const s of [-1, 1]) for (const z of [-.22, 0, .22]) { const w = part(g, CYL, dark, [.1, .09, .1], [s * .3, .1, z], ol); w.rotation.z = Math.PI / 2; }
    part(g, BOX, blue, [.34, .03, .3], [0, .34, -.12], ol);
    part(g, CYL, dark, [.025, .3, .025], [0, .47, .14], null);
    part(g, BOX, body, [.22, .12, .14], [0, .65, .14], ol);
    const b = part(g, CYL, dark, [.035, .22, .035], [0, .65, .3], ol); b.rotation.x = Math.PI / 2;
    part(g, SPH, basic(0x7df9ff), [.035, .035, .02], [.05, .66, .215], null);
    return g;
  }
  function buildPerson(L) {
    const ol = basic(INK, { side: THREE.BackSide }), mats = [ol];
    const M = (c, o) => { const m = toon(c, o); mats.push(m); return m; };
    const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
    const skin = M(L.skin), hair = M(L.hair), topT = topTexture(L), top = M(topT ? '#ffffff' : L.top, topT ? { map: topT } : {}), sleeve = M(L.pattern === 'stripes' ? L.skin : L.top), bottom = M(L.bottom), shoes = M(L.shoes);
    const footL = part(g, SPH, shoes, [.11, .075, .16], [-.12, .075, .03], ol), footR = part(g, SPH, shoes, [.11, .075, .16], [.12, .075, .03], ol);
    if (L.dress) { part(rig, CONE, top, [.36, .46, .32], [0, .36, 0], ol); part(rig, SPH, top, [.22, .2, .19], [0, .6, 0], ol); }
    else { part(rig, CYL, bottom, [.215, .2, .19], [0, .24, 0], ol); const t = part(rig, SPH, top, [.265, .27, .225], [0, .5, 0], ol); t.rotation.y = 0; }
    // arms: left hangs, right holds the weapon out front
    const armL = new THREE.Group(); armL.position.set(-.28, .62, 0); rig.add(armL);
    part(armL, SPH, sleeve, [.075, .13, .075], [-.01, -.09, 0], ol);
    const glove = L.weapon === 'fist' ? M('#e03b3b') : null;
    part(armL, SPH, glove || skin, glove ? [.11, .11, .11] : [.07, .07, .07], [-.03, -.24, .05], ol);
    const eyes = [];
    const armR = new THREE.Group(); armR.position.set(.28, .62, 0); rig.add(armR);
    part(armR, SPH, sleeve, [.075, .14, .075], [0, -.1, 0], ol);
    part(armR, SPH, glove || skin, glove ? [.13, .13, .13] : [.07, .07, .07], [0, -.26, 0], ol);
    const wp = (geom, c, s, y, extra) => { const m = part(armR, geom, c, s, [0, y, 0], ol); if (extra) extra(m); return m; };
    switch (L.weapon) {
      case 'sling': wp(CYL, M('#8a5a34'), [.022, .16, .022], -.36); for (const s of [-1, 1]) { const p = part(armR, CYL, M('#8a5a34'), [.02, .1, .02], [s * .04, -.47, 0], ol); p.rotation.z = s * .45; } break;
      case 'blaster': wp(BOX, M('#b9c0cf'), [.1, .28, .12], -.38); part(armR, SPH, basic(0x7df9ff), [.05, .05, .05], [0, -.54, 0], null); break;
      case 'scatter': wp(CYL, M('#3a3d4d'), [.055, .36, .055], -.42); wp(CYL, M('#ff9f43'), [.065, .05, .065], -.5); break;
      case 'balloon': wp(SPH, M('#3fa9f5'), [.12, .13, .12], -.38); break;
      case 'flower': wp(CYL, M('#3aa845'), [.016, .2, .016], -.36); part(armR, SPH, M('#ff7eb6'), [.08, .05, .08], [0, -.48, 0], ol); part(armR, SPH, M('#ffd23f'), [.035, .04, .035], [0, -.51, 0], null); break;
      case 'yarn': wp(SPH, M('#e8413c'), [.11, .11, .11], -.38); break;
      case 'hose': wp(CYL, M('#3aa845'), [.04, .22, .04], -.38); wp(CYL, M('#ffd23f'), [.05, .06, .05], -.51); break;
      case 'book': wp(BOX, M('#3f6fd8'), [.18, .22, .06], -.38); break;
      case 'fork': { const wood = M('#9a6a3c'), steel = M('#d9dee6'); wp(CYL, wood, [.022, .62, .022], -.3); part(armR, BOX, steel, [.2, .03, .03], [0, -.62, 0], ol); for (const sx of [-.09, 0, .09]) part(armR, CYL, steel, [.016, .16, .016], [sx, -.7, 0], ol); break; }
    }
    // head
    const head = new THREE.Group(); head.position.set(0, .98, 0); rig.add(head);
    part(head, SPH, skin, [.3, .3, .3], [0, 0, 0], ol);
    const eyeM = basic(0x1c1b2e), white = basic(0xffffff);
    for (const s of [-1, 1]) {
      eyes.push(part(head, SPH, eyeM, [.045, .062, .03], [s * .11, 0, .277], null));
      part(head, SPH, white, [.016, .018, .012], [s * .11 - .012, .022, .303], null);
      part(head, SPH, basic(0xff8f8f, { transparent: true, opacity: .55 }), [.05, .032, .02], [s * .185, -.085, .228], null);
    }
    const hasBeard = !!L.beard;
    const smile = new THREE.Mesh(new THREE.TorusGeometry(.06, .013, 6, 12, Math.PI), eyeM); smile.rotation.z = Math.PI; smile.position.set(0, -.085, hasBeard ? .305 : .283); head.add(smile);
    if (hasBeard) {
      const c1 = new THREE.Color(L.skin), bm = M(L.beardCol ? L.beardCol : L.beard === 'full' ? L.hair : '#' + c1.lerp(new THREE.Color(L.hair), .45).getHexString());
      const b = part(head, CAPC, bm, [.31, .31, .31], [0, 0, 0], null); b.rotation.x = Math.PI - .42;
    }
    if (L.glasses) {
      const gm = basic(0x2a2a35), tg = new THREE.TorusGeometry(.078, .014, 6, 18);
      for (const s of [-1, 1]) { const r = new THREE.Mesh(tg, gm); r.position.set(s * .115, .005, .29); head.add(r); }
      part(head, BOX, gm, [.07, .016, .016], [0, .01, .3], null);
    }
    const cap = (geom, sc, tilt, rz = 0) => { const c = part(head, geom, hair, [sc, sc, sc], [0, .01, 0], ol); c.rotation.set(tilt, 0, rz); return c; };
    switch (L.style) {
      case 'short': cap(CAPA, .325, -.5); break;
      case 'swept': cap(CAPA, .324, -.56); part(head, SPH, hair, [.27, .2, .16], [0, .02, -.2], ol); { const t = part(head, SPH, hair, [.07, .17, .07], [0, -.16, -.31], ol); t.rotation.x = -.35; } break;
      case 'side': cap(CAPA, .325, -.45, .12); part(head, SPH, hair, [.17, .09, .15], [-.07, .27, .15], ol); break;
      case 'kid': cap(CAPB, .328, -.3); part(head, SPH, hair, [.2, .07, .08], [0, .2, .24], ol); break;
      case 'curly': cap(CAPA, .32, -.45); for (let i = 0; i < 11; i++) { const a = i / 11 * TAU, rr = i % 2 ? .2 : .26; part(head, SPH, hair, [.115, .115, .115], [Math.cos(a) * rr, .22 + (i % 2 ? .08 : -.02), Math.sin(a) * rr - .03], ol); } part(head, SPH, hair, [.13, .12, .13], [0, .33, -.02], ol); break;
      case 'bald': part(head, SPH, basic(0xffffff, { transparent: true, opacity: .35 }), [.07, .03, .05], [-.08, .27, .08], null); break;
      case 'long': cap(CAPB, .328, -.5); part(head, SPH, hair, [.31, .44, .2], [0, -.24, -.15], ol); for (const s of [-1, 1]) part(head, SPH, hair, [.09, .3, .11], [s * .27, -.17, .0], ol); break;
      case 'bob': cap(CAPB, .33, -.3); part(head, SPH, hair, [.3, .3, .18], [0, -.1, -.15], ol); for (const s of [-1, 1]) part(head, SPH, hair, [.11, .22, .19], [s * .25, -.09, -.02], ol); break;
      case 'pony': cap(CAPA, .322, -.62); { const t = part(head, SPH, hair, [.09, .22, .09], [0, .02, -.4], ol); t.rotation.x = -.5; part(head, SPH, M('#ff6b81'), [.06, .06, .06], [0, .15, -.3], null); } break;
      case 'shoulder': cap(CAPB, .33, -.45, -.08); part(head, SPH, hair, [.3, .34, .18], [0, -.13, -.15], ol); for (const s of [-1, 1]) part(head, SPH, hair, [.1, .27, .15], [s * .265, -.13, 0], ol); break;
    }
    if (L.pattern === 'chain') { const ch = new THREE.Mesh(new THREE.TorusGeometry(.17, .013, 6, 20), M('#dfe6ee')); ch.rotation.x = Math.PI / 2 + .35; ch.position.set(0, .7, .03); rig.add(ch); }
    let pet = null;
    if (L.cat) { pet = buildCat(ol); pet.scale.setScalar(.5); pet.position.set(-.3, .6, .04); pet.rotation.y = .5; rig.add(pet); }
    const baseS = (L.h || 1) * 1.3; g.scale.setScalar(baseS);
    return { g, rig, armR, armL, footL, footR, head, eyes, pet, mats, ol, baseS, weapon: L.weapon, ph: Math.random() * 9, walk: 0, mv: 0, rec: 0, flash: 0, hitT: 0, supT: 0, popT: 0, dieT: 0, wasAlive: true, blink: 1 + Math.random() * 3, faded: false };
  }
  function addRing(m) {
    if (gfx >= 1) { const bl = new THREE.Mesh(DISC_G, shared('blob', () => basic(0x000000, { transparent: true, opacity: .22, depthWrite: false }))); bl.rotation.x = -Math.PI / 2; bl.position.y = .02; bl.scale.setScalar(.36); m.g.add(bl); }
    const r = new THREE.Mesh(new THREE.RingGeometry(.4, .52, 28), basic(0xffffff, { transparent: true, opacity: .9, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.y = .03; m.g.add(r); m.ring = r;
    const s = new THREE.Mesh(new THREE.RingGeometry(.56, .66, 28), basic(0xffd23f, { transparent: true, opacity: .9, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.position.y = .035; m.g.add(s); m.supRing = s;
    const st = new THREE.Group(); for (let i = 0; i < 3; i++) part(st, SPH, basic(0xffd23f), [.07, .07, .07], [Math.cos(i / 3 * TAU) * .3, 0, Math.sin(i / 3 * TAU) * .3], null); st.position.y = 1.45; m.g.add(st); m.stars = st;
    const b = new THREE.Mesh(SPH, basic(0xffffff, { transparent: true, opacity: .25, depthWrite: false })); b.scale.setScalar(.75); b.position.y = .65; m.g.add(b); m.bubble = b;
  }

  /* ---- setup ---- */
  /* Graphics levels: 0 full · 1 safe (no shadow maps, no MSAA, no custom grass shader) · 2 minimal (also no outlines)
     · 3 no WebGL at all — the match is drawn on the 2D overlay instead. Each lost context steps down a level. */
  let LOW = false, lostAt = 0, lastRecover = 0, gfx = 0, glOK = true, glCanvas = null, gpuName = '';
  function setGfx(n) { gfx = Math.max(0, Math.min(3, n)); try { localStorage.setItem('pf_gfx', String(gfx)); } catch (e) {} }
  function makeRenderer(canvas) {
    glCanvas = canvas; renderer = null; glOK = false;
    if (gfx >= 3) return;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: gfx < 1, alpha: true, powerPreference: 'high-performance' }); }
    catch (e) { renderer = null; setGfx(3); return; }
    glOK = true;
    renderer.shadowMap.enabled = gfx < 1; renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lostAt = performance.now(); });
    canvas.addEventListener('webglcontextrestored', () => { lostAt = 0; });
  }
  /* The phone's GPU can drop our context (driver crash, memory pressure, app switch). If the browser doesn't hand it
     back quickly, step the graphics level down, swap in a fresh canvas + renderer and rebuild from the game state. */
  function recover(now) {
    lostAt = 0; lastRecover = now; setGfx(gfx + 1);
    const old = glCanvas, fresh = old.cloneNode(false);
    try { if (renderer) renderer.dispose(); } catch (e) {}
    old.parentNode.replaceChild(fresh, old);
    makeRenderer(fresh); resize();
    if (V) startMatch(V, me, true);
  }
  function init(canvas, hudCanvas) {
    try { LOW = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    try { gfx = Math.max(0, Math.min(3, parseInt(localStorage.getItem('pf_gfx') || '0', 10) || 0)); } catch (e) {}
    try { // some phone GPU drivers crash on the full effect set: start those on the safe level
      const pc = document.createElement('canvas'), gl = pc.getContext('webgl2') || pc.getContext('webgl');
      if (!gl) gfx = 3; else { const d = gl.getExtension('WEBGL_debug_renderer_info'); gpuName = d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : ''; if (/powervr|imagination|img /i.test(gpuName)) gfx = Math.max(gfx, 1); }
    } catch (e) {}
    try { const q = new URLSearchParams(location.search).get('gfx'); if (q !== null && /^[0-3]$/.test(q)) setGfx(+q); } catch (e) {}
    makeRenderer(canvas);
    grad = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 178, 178, 178, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
    olMat = basic(INK, { side: THREE.BackSide });
    cam = new THREE.PerspectiveCamera(38, 1, .5, 200);
    hud = hudCanvas; hx = hud.getContext('2d');
    resize(); window.addEventListener('resize', resize);
  }
  function resize() {
    DPR = Math.min(gfx >= 2 ? 1 : gfx >= 1 ? 1.25 : LOW ? 1.5 : 2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (renderer) { renderer.setPixelRatio(DPR); renderer.setSize(w, h, false); }
    hud.width = Math.floor(w * DPR); hud.height = Math.floor(h * DPR);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  function lights(sc) {
    sc.add(new THREE.AmbientLight(0xffffff, .46));
    const d = new THREE.DirectionalLight(0xffffff, .6); d.position.set(-6, 14, 8); sc.add(d); return d;
  }
  function portraits() {
    const out = {};
    if (!renderer) { // no WebGL: simple drawn avatars so cards and lists still show a face
      for (const k of ORDER) {
        const L = ROSTER[k].look, c = document.createElement('canvas'); c.width = 220; c.height = 260; const x = c.getContext('2d');
        x.lineWidth = 7; x.strokeStyle = '#1c1b2e'; x.lineJoin = 'round';
        x.fillStyle = L.top; x.beginPath(); x.ellipse(110, 215, 62, 58, 0, 0, TAU); x.fill(); x.stroke();
        if (L.style !== 'bald') { x.fillStyle = L.hair; x.beginPath(); x.arc(110, 108, 70, 0, TAU); x.fill(); x.stroke(); }
        x.fillStyle = L.skin; x.beginPath(); x.arc(110, 118, 60, 0, TAU); x.fill(); x.stroke();
        if (L.style !== 'bald') { x.fillStyle = L.hair; x.beginPath(); x.arc(110, 118, 60, Math.PI * 1.08, Math.PI * 1.92); x.closePath(); x.fill(); x.stroke(); }
        if (L.beard) { x.fillStyle = L.beardCol || L.hair; x.globalAlpha = L.beard === 'full' ? 1 : .45; x.beginPath(); x.arc(110, 118, 60, Math.PI * .12, Math.PI * .88); x.closePath(); x.fill(); x.globalAlpha = 1; }
        x.fillStyle = '#1c1b2e'; for (const sx of [-22, 22]) { x.beginPath(); x.ellipse(110 + sx, 118, 8, 11, 0, 0, TAU); x.fill(); }
        x.lineWidth = 5; x.strokeStyle = L.beard ? '#ffffff' : '#1c1b2e'; x.beginPath(); x.arc(110, 136, 15, Math.PI * .15, Math.PI * .85); x.stroke();
        if (L.glasses) { x.strokeStyle = '#2a2a35'; x.lineWidth = 5; for (const sx of [-22, 22]) { x.beginPath(); x.arc(110 + sx, 118, 17, 0, TAU); x.stroke(); } }
        out[k] = c.toDataURL('image/png');
      }
      return out;
    }
    const sc = new THREE.Scene(), c = new THREE.PerspectiveCamera(30, 220 / 260, .1, 50);
    lights(sc); c.position.set(.9, 1.35, 3.6); c.lookAt(0, .72, 0);
    renderer.setPixelRatio(1); renderer.setSize(220, 260, false); renderer.setClearColor(0, 0);
    for (const k of ORDER) {
      const m = buildPerson(ROSTER[k].look); m.g.rotation.y = .25; m.armR.rotation.x = -1.1; m.armR.rotation.z = .25; sc.add(m.g);
      renderer.render(sc, c); out[k] = renderer.domElement.toDataURL('image/png'); sc.remove(m.g);
    }
    resize(); return out;
  }

  function startMatch(view, meF, keep) {
    V = view; me = meF; lastCd = 9; shake = 0; parts.length = 0;
    if (!keep) { specId = -1; texts.length = feed.length = 0; }
    for (const o of live) o._m = null;
    live.length = 0;
    theme = THEMES[V.mode];
    scene = new THREE.Scene(); scene.background = new THREE.Color(theme.sky);
    sun = lights(scene); sun.castShadow = gfx < 1; sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
    const sc = sun.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 60; sc.updateProjectionMatrix(); sun.shadow.bias = -.0006;
    scene.add(sun); scene.add(sun.target);
    staticG = new THREE.Group(); dynG = new THREE.Group(); scene.add(staticG); scene.add(dynG); tileG = null; builtMap = null;
    // ground
    const px = 32, gt = tex(V.W * px, V.H * px, (c, w, h) => {
      for (let y = 0; y < V.H; y++) for (let x = 0; x < V.W; x++) {
        c.fillStyle = (x + y) % 2 ? theme.g1 : theme.g2; c.fillRect(x * px, y * px, px, px);
        const r = hash(x, y);
        if (r < .16) { c.fillStyle = V.mode === 'ball' ? '#e8c574' : '#74bd3f'; c.beginPath(); c.arc(x * px + 8 + r * 90, y * px + 10 + r * 60, 3, 0, TAU); c.fill(); }
        else if (r > .9 && V.mode !== 'ball') { c.fillStyle = r > .95 ? '#fff6c9' : '#ffffff'; c.beginPath(); c.arc(x * px + 16, y * px + 14, 2.6, 0, TAU); c.fill(); c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x * px + 16, y * px + 14, 1.1, 0, TAU); c.fill(); }
      }
      if (V.mode === 'ball') {
        c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(w / 2, px); c.lineTo(w / 2, h - px); c.stroke(); c.beginPath(); c.arc(w / 2, h / 2, px * 2.3, 0, TAU); c.stroke();
        c.strokeRect(px, 6.5 * px, 3.5 * px, 8 * px); c.strokeRect(w - 4.5 * px, 6.5 * px, 3.5 * px, 8 * px);
      }
    });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(V.W, V.H), new THREE.MeshToonMaterial({ map: gt, gradientMap: grad })); gm.rotation.x = -Math.PI / 2; gm.position.set(V.W / 2, 0, V.H / 2); gm.receiveShadow = true; staticG.add(gm);
    const om = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), basic(theme.outer)); om.rotation.x = -Math.PI / 2; om.position.set(V.W / 2, -.05, V.H / 2); staticG.add(om);
    if (V.mode === 'ball') for (const side of [0, 1]) {
      const mine = me ? (me.team === 0) === (side === 0) : side === 0, c = mine ? 0x3aa0ff : 0xff4d5a, gx = side ? V.W - .5 : .5, pm = toon(0xffffff);
      for (const z of [8, 13]) part(staticG, CYL, pm, [.09, 1.3, .09], [side ? V.W - 1 : 1, .65, z], olMat);
      const bar = part(staticG, CYL, pm, [.08, 5, .08], [side ? V.W - 1 : 1, 1.3, 10.5], olMat); bar.rotation.x = Math.PI / 2;
      const net = new THREE.Mesh(new THREE.BoxGeometry(1, 1.3, 5), basic(c, { transparent: true, opacity: .45, depthWrite: false })); net.position.set(gx, .65, 10.5); staticG.add(net);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, 5), basic(c)); fl.rotation.x = -Math.PI / 2; fl.position.set(gx, .01, 10.5); staticG.add(fl);
    }
    // fighters
    models = V.fighters.map(f => { const m = buildPerson(f.h.look); addRing(m); m.popT = .45; dynG.add(m.g); return m; });
    // ball
    ballM = null;
    if (V.ball) {
      const bt = tex(64, 32, (c, w, h) => { const cs = ['#ff5d5d', '#ffffff', '#ffd23f', '#ffffff', '#3fa9f5', '#ffffff']; cs.forEach((k, i) => { c.fillStyle = k; c.fillRect(i * w / 6, 0, w / 6 + 1, h); }); });
      ballM = part(dynG, SPH, new THREE.MeshToonMaterial({ map: bt, gradientMap: grad }), [.25, .25, .25], [0, .25, 0], olMat);
    }
    // storm
    stormM = [];
    if (V.mode === 'showdown') for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(BOX, basic(0x5b2a9e, { transparent: true, opacity: .46, depthWrite: false })); m.renderOrder = 5; scene.add(m); stormM.push(m); }
    // aim guide
    aimM = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basic(0xffffff, { transparent: true, opacity: .22, depthWrite: false })); aimM.rotation.order = 'YXZ'; scene.add(aimM);
    aimRing = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 36), basic(0xffffff, { transparent: true, opacity: .5, depthWrite: false })); aimRing.rotation.x = -Math.PI / 2; scene.add(aimRing);
    // particles & shock rings
    partM = new THREE.InstancedMesh(BOX, basic(0xffffff), 500); partM.count = 0; partM.frustumCulled = false; scene.add(partM);
    rings = []; for (let i = 0; i < 14; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 40), basic(0xffffff, { transparent: true, opacity: 0, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.visible = false; r.life = 0; scene.add(r); rings.push(r); }
    V.mapDirty = true;
    if (me) camT.set(me.x / T, 0, me.y / T); else camT.set(V.W / 2, 0, V.H / 2);
  }
  function stopMatch() { V = null; me = null; scene = null; hx.clearRect(0, 0, hud.width, hud.height); if (renderer) { try { renderer.setClearColor(0, 0); renderer.clear(); } catch (e) {} } }

  const WATER_G = new THREE.PlaneGeometry(1, 1); WATER_G.rotateX(-Math.PI / 2);
  const PICK_G = new THREE.CylinderGeometry(.15, .1, .16, 12), RING_UNIT_G = new THREE.RingGeometry(.34, .43, 24), RING_LOB_G = new THREE.RingGeometry(1.05, 1.25, 36), DISC_G = new THREE.CircleGeometry(1, 40), RING_ZONE_G = new THREE.RingGeometry(.94, 1, 40);
  const cache = new Map();
  const shared = (k, make) => { let m = cache.get(k); if (!m) { m = make(); cache.set(k, m); } return m; };
  let tileMats = [], tileIdx = new Map(), builtMap = null;
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function updateTiles() {
    if (!tileG || !builtMap) { rebuildTiles(); return; }
    V.mapDirty = false;
    const touched = new Set();
    for (let y = 0; y < V.H; y++) for (let x = 0; x < V.W; x++) {
      if (V.map[y][x] === builtMap[y][x]) continue;
      builtMap[y][x] = V.map[y][x];
      const k = y * V.W + x, arr = tileIdx.get(k);
      if (arr) { for (const [m, i] of arr) { m.setMatrixAt(i, ZERO); touched.add(m); } tileIdx.delete(k); }
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }
  function rebuildTiles() {
    V.mapDirty = false; tileIdx = new Map(); builtMap = V.map.map(r => r.slice());
    if (tileG) { scene.remove(tileG); tileG.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); for (const m of tileMats) m.dispose(); }
    tileMats = [];
    tileG = new THREE.Group(); scene.add(tileG);
    const L = { '#': [], X: [], c: [], b: [], '~': [] };
    for (let y = 0; y < V.H; y++) for (let x = 0; x < V.W; x++) { const t = V.map[y][x]; if (L[t]) L[t].push([x, y]); }
    const inst = (geom, mat, list, fn, shadow = true, n = 1) => {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geom, mat, list.length * n); let i = 0;
      for (const [x, y] of list) for (let k = 0; k < n; k++) { dummy.rotation.set(0, 0, 0); const c = fn(x, y, k); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (c) m.setColorAt(i, col.set(c)); const key = y * V.W + x; let a = tileIdx.get(key); if (!a) tileIdx.set(key, a = []); a.push([m, i]); i++; }
      m.castShadow = shadow; m.frustumCulled = false; tileG.add(m); return m;
    };
    const wm = toon(0xffffff); tileMats.push(wm); const box = (h, s = 1, grow = 0) => (x, y) => { dummy.position.set(x + .5, h / 2, y + .5); dummy.scale.set(s + grow, h + grow, s + grow); };
    inst(BOX, wm, L['#'], (x, y) => { box(.74)(x, y); return theme.wall[Math.floor(hash(x, y) * 3)]; });
    const OL = gfx < 2;
    if (OL) inst(BOX, olMat, L['#'], box(.74, 1, .05), false);
    const bh = y => y === V.H - 1 ? .3 : 1.05; // keep the camera-side edge low so it never hides fighters
    inst(BOX, wm, L.X, (x, y) => { box(bh(y))(x, y); return theme.border; });
    if (OL) inst(BOX, olMat, L.X, (x, y) => box(bh(y), 1, .05)(x, y), false);
    const giftC = ['#ff5d8f', '#7c5cff', '#3fa9f5', '#ff9f43'];
    inst(BOX, wm, L.c, (x, y) => { box(.6, .76)(x, y); return giftC[Math.floor(hash(x, y) * 4)]; });
    if (OL) inst(BOX, olMat, L.c, box(.6, .76, .05), false);
    inst(BOX, wm, L.c, (x, y) => { dummy.position.set(x + .5, .31, y + .5); dummy.scale.set(.79, .63, .16); return '#ffd23f'; }, false);
    inst(BOX, wm, L.c, (x, y) => { dummy.position.set(x + .5, .31, y + .5); dummy.scale.set(.16, .63, .79); return '#ffd23f'; }, false);
    inst(SPH, wm, L.c, (x, y, k) => { dummy.position.set(x + .5 + (k ? .1 : -.1), .68, y + .5); dummy.scale.set(.11, .09, .08); return '#ffd23f'; }, false, 2);
    const bm = toon(0xffffff), bo = basic(INK, { side: THREE.BackSide }); tileMats.push(bm, bo);
    if (gfx < 1) for (const m of [bm, bo]) m.onBeforeCompile = sh => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat sw = sin(uTime*2.2 + instanceMatrix[3][0]*1.9 + instanceMatrix[3][2]*1.3);\ntransformed.x += sw*0.3*(position.y+0.5); transformed.z += sw*0.16*(position.y+0.5);\n#endif');
    };
    const blade = grow => (x, y, k) => {
      const a = hash(x * 7 + k, y * 3 + k * 5) * TAU, r = k ? .12 + hash(x + k * 13, y + k) * .26 : 0, h = .72 + hash(x + k, y * 2 + k) * .4;
      dummy.position.set(x + .5 + Math.cos(a) * r, h / 2, y + .5 + Math.sin(a) * r); dummy.scale.set(.2 + grow, h + grow, .2 + grow); dummy.rotation.set(0, a, 0);
      return theme.bush[(k + Math.floor(hash(x, y) * 3)) % 3];
    };
    inst(CONE, bm, L.b, blade(0), true, 7);
    if (OL) inst(CONE, bo, L.b, blade(.045), false, 7);
    if (!rebuildTiles.wt) rebuildTiles.wt = tex(64, 64, (c) => { c.fillStyle = '#3fb4ee'; c.fillRect(0, 0, 64, 64); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3; c.lineCap = 'round'; for (const [x, y] of [[8, 14], [36, 30], [14, 48]]) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 8, y - 6, x + 16, y); c.stroke(); } });
    const wt = rebuildTiles.wt; wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    const wmat = basic(0xffffff, { map: wt }); tileMats.push(wmat);
    inst(WATER_G, wmat, L['~'], (x, y) => { dummy.position.set(x + .5, .012, y + .5); dummy.scale.set(1, 1, 1); }, false);
  }

  /* ---- effects ---- */
  function burst(x, y, z, color, n = 10, sp = 3, size = .09) {
    for (let i = 0; i < n && parts.length < 480; i++) { const a = rnd(TAU), v = rnd(sp * .3, sp); parts.push({ x, y, z, vx: Math.cos(a) * v, vy: rnd(1.5, 4.5), vz: Math.sin(a) * v, life: rnd(.3, .65), max: .65, c: color, s: rnd(size * .6, size * 1.4) }); }
  }
  function ring(x, z, R, color, dur = .35) {
    const r = rings.find(r => r.life <= 0) || rings[0]; r.position.set(x, .06, z); r.R = R; r.life = r.max = dur; r.material.color.set(color); r.visible = true;
  }
  function text(x, y, txt, color, size = 16) { texts.push({ x: x / T, z: y / T, h: 1.5, txt, life: .8, c: color, size }); }
  function near(x, y, d = 13) { const c = camT; return Math.hypot(x / T - c.x, y / T - c.z) < d; }
  function fx(e) {
    if (!V) return;
    const F = id => V.fighters[id];
    switch (e[0]) {
      case 'a': { const f = F(e[1]); if (f) { models[f.id].rec = 1; models[f.id].blink = Math.max(models[f.id].blink, .3); if (near(f.x, f.y)) SFX.play(f.char === 'tyler' ? 'punch' : f.char === 'scott' ? 'lob' : 'shoot'); } break; }
      case 'x': if (e[4] !== 2) burst(e[2] / T, .55, e[3] / T, e[4] ? '#ffffff' : '#ffe9a8', 4, 2, .06); break;
      case 'h': { const f = F(e[1]); if (!f) break; models[f.id].flash = .12; models[f.id].hitT = .22; text(e[3], e[4], e[2], f === me ? '#ff6b6b' : '#ffffff'); if (f === me) shake = Math.max(shake, .18); if (near(e[3], e[4])) SFX.play('hit'); break; }
      case 'hu': text(e[3], e[4], e[2], '#dddddd', 13); break;
      case 'k': {
        const f = F(e[1]), k = F(e[2]); if (!f) break;
        burst(f.x / T, .6, f.y / T, f.h.look.bg, 26, 5, .12); ring(f.x / T, f.y / T, 1.4, '#ffffff', .4); text(f.x, f.y, 'KO!', '#ffd23f', 24);
        feed.push({ txt: `${k ? k.name : V.mode === 'showdown' ? 'The storm' : '—'}  ➜  ${f.name}`, t: 4.5 });
        if (f === me) { specId = k ? k.id : -1; shake = .35; }
        if (near(f.x, f.y, 20)) SFX.play('ko'); break;
      }
      case 'boom': { const c = ['#ffb347', '#c084fc', '#7cd4ff'][e[4]] || '#ffb347'; ring(e[1] / T, e[2] / T, e[3] / T, c); burst(e[1] / T, .4, e[2] / T, c, 16, 5, .11); if (near(e[1], e[2], 8)) shake = Math.max(shake, .22); if (near(e[1], e[2])) SFX.play('boom'); break; }
      case 't': V.mapDirty = true; burst(e[1] + .5, .5, e[2] + .5, e[3] === '.' ? '#d8dcea' : '#ffffff', 10, 3.5, .12); if (near(e[1] * T, e[2] * T)) SFX.play('crack'); break;
      case 'c': burst((e[1] % V.W) + .5, .5, ((e[1] / V.W) | 0) + .5, '#ffd23f', 3, 2, .07); break;
      case 'p-': { const f = F(e[2]); if (f) { text(f.x, f.y, '+POWER', '#7dffb0', 15); if (f === me) SFX.play('power'); } break; }
      case 'goal': for (let i = 0; i < 4; i++) burst(e[2] / T, 1, e[3] / T, ['#ffd23f', '#ff5d8f', '#3fa9f5', '#7dffb0'][i], 22, 7, .13); shake = .4; SFX.play('goal'); break;
      case 'sup': { const f = F(e[1]); if (f) { models[f.id].supT = .5; ring(f.x / T, f.y / T, 1.6, '#ffd23f', .45); text(f.x, f.y, f.h.sup + '!', '#ffd23f', 17); if (near(f.x, f.y)) SFX.play('sup'); } break; }
      case 'kick': if (near(e[1], e[2])) SFX.play('kick'); break;
      case 'u-': burst(e[2] / T, .4, e[3] / T, '#e8ecf3', 12, 3, .1); break;
      case 'rs': { const f = F(e[1]); if (f) { models[f.id].popT = .45; ring(f.x / T, f.y / T, 1.2, '#ffffff', .4); } break; }
      case 'ot': feed.push({ txt: 'OVERTIME — next goal wins!', t: 5 }); break;
    }
  }

  /* ---- per-frame sync ---- */
  const SHOT = {
    pebble: ['#b8bcc8', [.09, .09, .09], 1], zap: ['#7df9ff', [.07, .07, .24], 0], punch: ['#fff3c4', [.26, .14, .14], 0], pellet: ['#ffb347', [.08, .08, .1], 0],
    petal: ['#ff8fc0', [.08, .04, .22], 1], yarn: ['#e8413c', [.17, .17, .17], 1], wave: ['#6cc9ff', [.42, .16, .14], 0], book: ['#3f6fd8', [.2, .06, .26], 1],
    blast: ['#ffd23f', [.15, .15, .18], 0], rover: ['#ffe066', [.07, .07, .1], 0], bigpetal: ['#ff4fa3', [.14, .07, .32], 1], fork: ['#e3c16f', [.07, .05, .34], 1],
  };
  function track(obj, make) {
    if (!obj._m) { obj._m = make(); dynG.add(obj._m); live.push(obj); }
    obj._f = frameN; return obj._m;
  }
  const teamMat = ally => shared(ally ? 'tmA' : 'tmE', () => basic(ally ? 0x3aa0ff : 0xff4d5a, { transparent: true, opacity: .85, depthWrite: false }));
  function mkPick() {
    const g = new THREE.Group();
    part(g, PICK_G, shared('pk1', () => toon('#f2c078')), [1, 1, 1], [0, .12, 0], olMat);
    part(g, SPH, shared('pk2', () => toon('#ff7eb6')), [.17, .13, .17], [0, .26, 0], olMat);
    part(g, SPH, shared('pk3', () => toon('#e8413c')), [.05, .05, .05], [0, .41, 0], olMat);
    return g;
  }
  function sync(dt, now) {
    frameN++; timeU.value = now / 1000;
    if (V.mapDirty) updateTiles();
    if (rebuildTiles.wt) rebuildTiles.wt.offset.set(now * .00004, now * .00002);
    const viewer = me || V.fighters[0];
    V.fighters.forEach(f => {
      const m = models[f.id], t = now / 1000 + m.ph;
      // knock-out: topple backwards and shrink away instead of just vanishing
      if (m.wasAlive && !f.alive) m.dieT = .55;
      m.wasAlive = f.alive;
      if (!f.alive) {
        if (m.dieT > 0) {
          m.dieT -= dt; const k = 1 - Math.max(0, m.dieT) / .55;
          m.g.visible = true; m.rig.rotation.set(-k * 1.5, k * 5, 0); m.rig.position.set(0, Math.sin(k * Math.PI) * .5, 0);
          m.g.scale.setScalar(m.baseS * (1 - k * k)); m.ring.visible = m.supRing.visible = m.stars.visible = m.bubble.visible = false;
        } else m.g.visible = false;
        return;
      }
      const seen = f === viewer || visibleTo(V, f, viewer);
      m.g.visible = seen; if (!seen) return;
      m.ring.visible = true;
      m.g.rotation.y = Math.PI / 2 - f.aim;
      const moving = (f.mx || f.my) && !f.stun ? 1 : 0;
      m.mv += (moving - m.mv) * Math.min(1, dt * 12);                      // smooth blend between idle and run
      const mv = m.mv, idle = 1 - mv, fast = f.buff ? 1.4 : 1;
      m.walk += dt * 13 * fast * (.25 + mv * .75);
      const s = Math.sin(m.walk) * mv, c2 = Math.abs(Math.cos(m.walk)) * mv, br = Math.sin(t * 2.6);
      // timers
      m.rec = Math.max(0, m.rec - dt * 5); m.hitT = Math.max(0, m.hitT - dt); m.supT = Math.max(0, m.supT - dt); m.popT = Math.max(0, m.popT - dt);
      const atk = Math.sin(m.rec * Math.PI), hit = m.hitT / .22, sup = m.supT > 0 ? 1 - m.supT / .5 : 0, hop = V.phase === 'count' ? Math.abs(Math.sin(t * 6)) * .1 : 0;
      // spawn pop with overshoot, hit squash, breathing
      const pk = 1 - m.popT / .45, pop = m.popT > 0 ? Math.max(.05, 1 + Math.sin(pk * Math.PI) * .25 - (1 - pk) * (1 - pk)) : 1;
      m.g.scale.setScalar(m.baseS * pop);
      m.g.position.set(f.x / T, (m.supT > 0 ? Math.sin(sup * Math.PI) * .55 : 0) + hop, f.y / T);
      const sq = hit * .2 - (m.supT > 0 ? Math.sin(sup * Math.PI) * .12 : 0);
      m.rig.scale.set(1 + sq + br * .012 * idle, 1 - sq + br * .025 * idle + c2 * .03, 1 + sq + br * .012 * idle);
      // feet
      m.footL.position.z = .03 + s * .17; m.footR.position.z = .03 - s * .17;
      m.footL.position.y = .075 + Math.max(0, s) * .1; m.footR.position.y = .075 + Math.max(0, -s) * .1;
      m.footL.rotation.x = -Math.max(0, s) * .5; m.footR.rotation.x = -Math.max(0, -s) * .5;
      // body: bob, lean into the run, sway, lunge on attack, flinch when hit, wobble when stunned, spin on super
      m.rig.position.set(0, c2 * .07 + br * .012 * idle, atk * .12 - hit * .06);
      m.rig.rotation.set(mv * .17 + (f.dash ? .4 : 0) + atk * .12 - hit * .3, m.supT > 0 ? sup * TAU : s * .1, s * .07 + (f.stun ? Math.sin(t * 18) * .16 : 0));
      // head: look-around when idle, counter-bob when running
      m.head.rotation.set(-mv * .08 + c2 * .06 + (f.stun ? .25 : 0) - hit * .2, Math.sin(t * .9) * .18 * idle, Math.sin(t * 1.3) * .05 * idle + (f.stun ? Math.sin(t * 12) * .2 : 0));
      m.head.position.y = .98 + c2 * .02 + br * .008 * idle;
      // arms: free arm swings against the stride, weapon arm thrusts / throws / punches
      m.armL.rotation.set(-s * .9 + br * .05 * idle - atk * .4, 0, -.08 - mv * .12 - (m.supT > 0 ? Math.sin(sup * Math.PI) * 1.6 : 0));
      if (m.weapon === 'balloon' || m.weapon === 'book' || m.weapon === 'yarn') m.armR.rotation.set(-1.35 - Math.sin(Math.min(1, m.rec * 1.4) * Math.PI) * 1.5, 0, .12);
      else if (m.weapon === 'fist') { m.armR.rotation.set(-1.35 + s * .25, 0, .12 - atk * .2); m.armR.scale.setScalar(1 + atk * .55); }
      else m.armR.rotation.set(-1.35 + m.rec * .65 + s * .12 + br * .03 * idle, 0, .12);
      if (m.supT > 0) m.armR.rotation.x = -1.35 - Math.sin(sup * Math.PI) * 1.5;
      // blinking
      m.blink -= dt; if (m.blink < -.11) m.blink = 1.5 + Math.random() * 3.5;
      const ey = m.blink < 0 || f.stun ? .12 : hit > .2 ? .5 : 1; for (const e of m.eyes) e.scale.y = .062 * ey;
      if (m.pet) { m.pet.userData.tail.rotation.z = Math.sin(t * 5) * .5; m.pet.position.y = .6 + c2 * .04; m.pet.rotation.z = Math.sin(t * 2) * .06; }
      if (m.flash > 0 || m.wasFlash) { m.flash -= dt; const v = m.flash > 0 ? .8 : 0; m.wasFlash = v > 0; for (const k of m.mats) if (k.emissive) k.emissive.setScalar(v); }
      const fade = inBush(V, f);
      if (fade !== m.faded) { m.faded = fade; for (const k of m.mats) { k.transparent = fade; k.opacity = fade ? .55 : 1; k.needsUpdate = true; } }
      const ally = f.team === viewer.team;
      m.ring.material.color.set(f === me ? 0x7dffb0 : ally ? 0x3aa0ff : 0xff4d5a);
      m.supRing.visible = f.sup >= 1; m.supRing.material.opacity = .6 + .4 * Math.sin(now / 90);
      m.stars.visible = !!f.stun; m.stars.rotation.y = now / 150;
      m.bubble.visible = !!f.inv;
      if (f.buff && Math.random() < .5) parts.push({ x: f.x / T, y: .2, z: f.y / T, vx: rnd(-.5, .5), vy: rnd(.5, 1.5), vz: rnd(-.5, .5), life: .35, max: .35, c: '#ffd23f', s: .08 });
      if (f.dash && Math.random() < .8) parts.push({ x: f.x / T, y: .3, z: f.y / T, vx: rnd(-1, 1), vy: rnd(.5, 2), vz: rnd(-1, 1), life: .4, max: .4, c: '#ffffff', s: .12 });
    });
    for (const u of V.units) {
      const g = track(u, () => { const g = u.kind === 'cat' ? buildCat(olMat) : buildRover(olMat); if (u.kind === 'cat') g.scale.setScalar(1.25); const r = new THREE.Mesh(RING_UNIT_G, teamMat(true)); r.rotation.x = -Math.PI / 2; r.position.y = .03; g.add(r); g.userData.ring = r; return g; });
      g.position.set(u.x / T, u.kind === 'cat' && (u.moving || u.wp) ? Math.abs(Math.sin(now / 70)) * .08 : 0, u.y / T); g.rotation.y = Math.PI / 2 - u.aim;
      g.userData.ring.material = teamMat(u.team === viewer.team);
      if (g.userData.tail) { g.userData.tail.rotation.z = Math.sin(now / 90) * .6; g.rotation.z = Math.sin(now / 80) * .08; }
      else g.rotation.z = Math.sin(now / 60) * .02;
    }
    for (const s of V.shots) {
      const d = SHOT[s.k] || SHOT.pebble;
      const m = track(s, () => { const g = new THREE.Group(); const mm = part(g, s.k === 'book' ? BOX : SPH, shared('shot' + s.k, () => d[2] ? toon(d[0]) : basic(d[0], s.k === 'wave' || s.k === 'punch' ? { transparent: true, opacity: .8 } : {})), s.k === 'book' ? d[1].map(v => v * 2) : d[1], [0, 0, 0], d[2] ? olMat : null); mm.castShadow = false; g.userData.m = mm; return g; });
      m.position.set(s.x / T, .58, s.y / T); m.rotation.y = Math.PI / 2 - s.ang;
      if (s.k === 'book' || s.k === 'yarn') m.userData.m.rotation.y += dt * 14;
    }
    for (const L of V.lobs) {
      const g = track(L, () => { const g = new THREE.Group(); g.userData.b = part(g, SPH, shared('lobB', () => toon('#3fa9f5')), [.17, .19, .17], [0, 0, 0], olMat); const r = new THREE.Mesh(RING_LOB_G, teamMat(L.team === viewer.team)); r.rotation.x = -Math.PI / 2; g.add(r); g.userData.r = r; return g; });
      const p = clamp(L.t / L.dur, 0, 1), b = g.userData.b;
      g.position.set(L.x1 / T, .04, L.y1 / T);
      b.position.set((L.x0 + (L.x1 - L.x0) * p - L.x1) / T, .6 + Math.sin(p * Math.PI) * 2.6, (L.y0 + (L.y1 - L.y0) * p - L.y1) / T);
      g.userData.r.scale.setScalar(.6 + p * .4);
    }
    for (const p of V.picks) { const g = track(p, mkPick); g.position.set(p.x / T, .12 + Math.sin(now / 240 + p.id) * .07, p.y / T); g.rotation.y = now / 500; }
    for (const z of V.zones) {
      const g = track(z, () => { const g = new THREE.Group(), c = new THREE.Mesh(DISC_G, shared('zoneD', () => basic(0x7dffb0, { transparent: true, opacity: .28, depthWrite: false }))); c.rotation.x = -Math.PI / 2; g.add(c); const r = new THREE.Mesh(RING_ZONE_G, shared('zoneR', () => basic(0x2fd67a, { transparent: true, opacity: .9, depthWrite: false }))); r.rotation.x = -Math.PI / 2; r.position.y = .01; g.add(r); return g; });
      g.position.set(z.x / T, .03, z.y / T); g.scale.setScalar(z.R / T * (1 + Math.sin(now / 200) * .02));
      if (Math.random() < .2) parts.push({ x: z.x / T + rnd(-1, 1) * z.R / T * .7, y: .1, z: z.y / T + rnd(-1, 1) * z.R / T * .7, vx: 0, vy: 1.6, vz: 0, life: .7, max: .7, c: '#7dffb0', s: .09 });
    }
    for (let i = live.length - 1; i >= 0; i--) if (live[i]._f !== frameN) { dynG.remove(live[i]._m); live[i]._m = null; live.splice(i, 1); }
    if (ballM) {
      const b = V.ball, nx = b.x / T, nz = b.y / T, dx = nx - ballM.position.x, dz = nz - ballM.position.z;
      ballM.rotation.z -= dx / .25; ballM.rotation.x += dz / .25; ballM.position.set(nx, .25, nz);
    }
    if (stormM.length) {
      const s = V.safe, x0 = s.x0 / T, x1 = s.x1 / T, y0 = s.y0 / T, y1 = s.y1 / T, B = 60, hgt = 1.5;
      const set = (m, ax, az, bx, bz) => { m.visible = bx - ax > .01 && bz - az > .01; m.position.set((ax + bx) / 2, hgt / 2, (az + bz) / 2); m.scale.set(Math.max(.01, bx - ax), hgt, Math.max(.01, bz - az)); };
      set(stormM[0], -B, -B, V.W + B, y0); set(stormM[1], -B, y1, V.W + B, V.H + B); set(stormM[2], -B, y0, x0, y1); set(stormM[3], x1, y0, V.W + B, y1);
      for (const m of stormM) m.material.opacity = .44 + .05 * Math.sin(now / 300);
    }
    // aim guide for your own fighter
    const showAim = me && me.alive && V.phase === 'play' && !me.dash && !me.stun;
    aimM.visible = aimRing.visible = false;
    if (showAim) {
      const lobber = me.h.lob && !(V.ball && V.ball.owner === me), R = me.h.range, a = me.aim;
      if (lobber) { const L = clamp((me.aimDist || 5 * T) / T, 2, 7.5); aimRing.visible = true; aimRing.position.set(me.x / T + Math.cos(a) * L, .05, me.y / T + Math.sin(a) * L); aimRing.scale.setScalar(1.25); }
      else { const w = me.char === 'tyler' ? 1.3 : me.char === 'sandy' ? .85 : me.char === 'dylan' ? .9 : .32; aimM.visible = true; aimM.position.set(me.x / T + Math.cos(a) * (R / 2 + .3), .05, me.y / T + Math.sin(a) * (R / 2 + .3)); aimM.rotation.set(-Math.PI / 2, Math.PI / 2 - a, 0); aimM.scale.set(w, R - .5, 1); }
    }
    // particles
    let n = 0;
    for (const p of parts) {
      p.life -= dt; if (p.life <= 0) continue;
      p.vy -= 9 * dt; p.x += p.vx * dt; p.y = Math.max(.04, p.y + p.vy * dt); p.z += p.vz * dt;
      const s = p.s * Math.min(1, p.life / p.max * 2);
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.life * 9, p.life * 7, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      partM.setMatrixAt(n, dummy.matrix); partM.setColorAt(n, col.set(p.c)); n++;
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    partM.count = n; partM.instanceMatrix.needsUpdate = true; if (partM.instanceColor) partM.instanceColor.needsUpdate = true;
    for (const r of rings) { if (r.life <= 0) { r.visible = false; continue; } r.life -= dt; const k = 1 - r.life / r.max; r.scale.setScalar(Math.max(.01, r.R * (.25 + .75 * k))); r.material.opacity = Math.max(0, 1 - k); }
    // camera
    let tgt = me;
    if (!me || (!me.alive && V.mode === 'showdown')) tgt = (V.fighters[specId] && V.fighters[specId].alive && V.fighters[specId]) || V.fighters.find(f => f.alive) || me || V.fighters[0];
    const k = Math.min(1, dt * 9);
    camT.x += (tgt.x / T - camT.x) * k; camT.z += (tgt.y / T - camT.z) * k;
    const tilt = 54 * Math.PI / 180, vf = cam.fov * Math.PI / 360, hf = Math.atan(Math.tan(vf) * cam.aspect);
    const D = Math.max(5.5 / Math.tan(vf), 5.2 / Math.tan(hf));
    shake = Math.max(0, shake - dt * 1.4);
    const sx = rnd(-1, 1) * shake * .5, sz = rnd(-1, 1) * shake * .5;
    cam.position.set(camT.x + sx, D * Math.sin(tilt), camT.z + .6 + D * Math.cos(tilt) + sz); cam.lookAt(camT.x + sx, 0, camT.z + .6 + sz); cam.updateMatrixWorld();
    sun.position.set(camT.x - 6, 14, camT.z + 8); sun.target.position.set(camT.x, 0, camT.z);
  }

  function toScreen(x, h, z) { v3.set(x, h, z).project(cam); return [(v3.x + 1) / 2 * hud.width, (1 - v3.y) / 2 * hud.height]; }
  function screenToWorld(sx, sy) {
    if (!V) return { x: 0, y: 0 };
    v2.set(sx / window.innerWidth * 2 - 1, -(sy / window.innerHeight) * 2 + 1); ray.setFromCamera(v2, cam);
    return ray.ray.intersectPlane(ground, v3) ? { x: v3.x * T, y: v3.z * T } : { x: 0, y: 0 };
  }

  /* ---- HUD ---- */
  function label(txt, x, y, size, color = '#fff', align = 'center') {
    hx.font = `700 ${size}px Fredoka, "Trebuchet MS", system-ui, sans-serif`; hx.textAlign = align; hx.lineJoin = 'round';
    hx.lineWidth = Math.max(3, size / 5); hx.strokeStyle = '#1c1b2e'; hx.strokeText(txt, x, y); hx.fillStyle = color; hx.fillText(txt, x, y);
  }
  function rr(x, y, w, h, r) { hx.beginPath(); hx.moveTo(x + r, y); hx.arcTo(x + w, y, x + w, y + h, r); hx.arcTo(x + w, y + h, x, y + h, r); hx.arcTo(x, y + h, x, y, r); hx.arcTo(x, y, x + w, y, r); hx.closePath(); }
  /* Last-resort renderer: draws the match on the 2D overlay using the same camera maths, for devices where WebGL is unavailable. */
  function poly(pts, fill) { hx.beginPath(); for (let i = 0; i < pts.length; i++) { const p = toScreen(pts[i][0], pts[i][1], pts[i][2]); if (i) hx.lineTo(p[0], p[1]); else hx.moveTo(p[0], p[1]); } hx.closePath(); hx.fillStyle = fill; hx.fill(); }
  const flat = (x0, z0, x1, z1, h, fill) => poly([[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], fill);
  function dot(x, h, z, r, fill, stroke) { const p = toScreen(x, h, z); hx.beginPath(); hx.arc(p[0], p[1], Math.max(1, r), 0, TAU); hx.fillStyle = fill; hx.fill(); if (stroke) { hx.lineWidth = Math.max(1.5, r * .16); hx.strokeStyle = stroke; hx.stroke(); } return p; }
  function draw2D(viewer) {
    const w = hud.width, h = hud.height, ink = '#1c1b2e', hexc = n => '#' + col.set(n).getHexString();
    hx.fillStyle = hexc(theme.outer); hx.fillRect(0, 0, w, h);
    flat(0, 0, V.W, V.H, 0, theme.g1);
    const cx = Math.floor(camT.x), cz = Math.floor(camT.z), x0 = Math.max(0, cx - 17), x1 = Math.min(V.W - 1, cx + 17), y0 = Math.max(0, cz - 13), y1 = Math.min(V.H - 1, cz + 9);
    const a0 = toScreen(camT.x, 0, camT.z), a1 = toScreen(camT.x + 1, 0, camT.z), u = Math.abs(a1[0] - a0[0]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = V.map[y][x];
      if (t === '~') flat(x, y, x + 1, y + 1, 0, '#3fb4ee');
      else if (t === 'g') flat(x, y, x + 1, y + 1, 0, (viewer.team === 0) === (x === 0) ? '#3aa0ff' : '#ff4d5a');
      else if ((x + y) % 2 === 0) flat(x, y, x + 1, y + 1, 0, theme.g2);
    }
    for (const z of V.zones) { const p = toScreen(z.x / T, 0, z.y / T); hx.beginPath(); hx.ellipse(p[0], p[1], z.R / T * u, z.R / T * u * .8, 0, 0, TAU); hx.fillStyle = 'rgba(125,255,176,.35)'; hx.fill(); }
    for (const L of V.lobs) { const p = toScreen(L.x1 / T, 0, L.y1 / T); hx.beginPath(); hx.ellipse(p[0], p[1], 1.2 * u, u, 0, 0, TAU); hx.lineWidth = 4; hx.strokeStyle = L.team === viewer.team ? '#3aa0ff' : '#ff4d5a'; hx.stroke(); }
    const rows = new Map(), put = (o, kind) => { const r = Math.floor(o.y / T); let a = rows.get(r); if (!a) rows.set(r, a = []); a.push([kind, o]); };
    for (const p of V.picks) put(p, 'p'); for (const un of V.units) put(un, 'u'); if (V.ball) put(V.ball, 'b');
    for (const f of V.fighters) if (models[f.id].g.visible && f.alive) put(f, 'f');
    const shade = (c, k) => '#' + col.set(c).multiplyScalar(k).getHexString();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = V.map[y][x]; let hg = 0, c = null;
        if (t === '#') { hg = .74; c = theme.wall[Math.floor(hash(x, y) * 3)]; } else if (t === 'X') { hg = y === V.H - 1 ? .3 : 1.05; c = theme.border; }
        else if (t === 'c') { hg = .6; c = ['#ff5d8f', '#7c5cff', '#3fa9f5', '#ff9f43'][Math.floor(hash(x, y) * 4)]; } else if (t === 'b') { hg = .55; c = theme.bush[Math.floor(hash(x, y) * 3)]; }
        if (!c) continue;
        if (t === 'b') hx.globalAlpha = .82;
        poly([[x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, hg, y + 1], [x, hg, y + 1]], shade(c, .72));
        flat(x, y, x + 1, y + 1, hg, c); hx.globalAlpha = 1;
      }
      for (const [kind, o] of rows.get(y) || []) {
        const X = o.x / T, Z = o.y / T;
        if (kind === 'p') dot(X, .25, Z, .2 * u, '#ff7eb6', ink);
        else if (kind === 'b') dot(X, .25, Z, .25 * u, '#fff7e0', ink);
        else if (kind === 'u') { dot(X, 0, Z, .4 * u, o.team === viewer.team ? 'rgba(58,160,255,.45)' : 'rgba(255,77,90,.45)'); dot(X, .3, Z, .28 * u, o.kind === 'cat' ? '#e9d8bd' : '#e8ecf3', ink); }
        else {
          const L = o.h.look, k = L.h || 1;
          hx.globalAlpha = inBush(V, o) ? .6 : 1;
          const g = toScreen(X, 0, Z); hx.beginPath(); hx.ellipse(g[0], g[1], .5 * u, .34 * u, 0, 0, TAU); hx.lineWidth = Math.max(2, .09 * u); hx.strokeStyle = o === me ? '#7dffb0' : o.team === viewer.team ? '#3aa0ff' : '#ff4d5a'; hx.stroke();
          const b = toScreen(X, .55 * k, Z), wp = toScreen(X + Math.cos(o.aim) * .7, .55 * k, Z + Math.sin(o.aim) * .7);
          hx.beginPath(); hx.moveTo(b[0], b[1]); hx.lineTo(wp[0], wp[1]); hx.lineWidth = Math.max(3, .16 * u); hx.strokeStyle = ink; hx.lineCap = 'round'; hx.stroke();
          dot(X, .5 * k, Z, .3 * u * k, L.top, ink);
          const hd = dot(X, 1.15 * k, Z, .34 * u * k, L.skin, ink);
          if (L.style !== 'bald') { hx.beginPath(); hx.arc(hd[0], hd[1], .34 * u * k, Math.PI * 1.05, Math.PI * 1.95); hx.closePath(); hx.fillStyle = L.hair; hx.fill(); hx.stroke(); }
          hx.globalAlpha = 1;
        }
      }
    }
    for (const s of V.shots) dot(s.x / T, .58, s.y / T, Math.max(.07, s.r / T) * u, (SHOT[s.k] || SHOT.pebble)[0], ink);
    for (const L of V.lobs) { const p = clamp(L.t / L.dur, 0, 1); dot((L.x0 + (L.x1 - L.x0) * p) / T, .6 + Math.sin(p * Math.PI) * 2.6, (L.y0 + (L.y1 - L.y0) * p) / T, .18 * u, '#3fa9f5', ink); }
    if (V.mode === 'showdown') {
      const s = V.safe, a = s.x0 / T, b = s.x1 / T, c = s.y0 / T, d = s.y1 / T, B = 8, st = 'rgba(91,42,158,.5)';
      if (c > 0) flat(-B, -B, V.W + B, c, 0, st); if (d < V.H) flat(-B, d, V.W + B, V.H + B, 0, st);
      if (a > 0) flat(-B, c, a, d, 0, st); if (b < V.W) flat(b, c, V.W + B, d, 0, st);
    }
  }
  function drawHud(dt, now, ui) {
    const w = hud.width, h = hud.height, u = DPR, viewer = me || V.fighters[0];
    hx.clearRect(0, 0, w, h);
    if (!glOK || lostAt) draw2D(viewer);
    // name plates
    for (const f of V.fighters) {
      if (!models[f.id].g.visible) continue;
      const [sx, sy] = toScreen(f.x / T, 1.95 * (f.h.look.h || 1), f.y / T), ally = f.team === viewer.team, bw = 58 * u, bx = sx - bw / 2, by = sy - 8 * u;
      label(f.name, sx, by - 6 * u, 13 * u, f === me ? '#7dffb0' : ally ? '#bfe0ff' : '#ffc2c7');
      hx.fillStyle = '#1c1b2e'; rr(bx - 2 * u, by - 2 * u, bw + 4 * u, 13 * u, 5 * u); hx.fill();
      hx.fillStyle = f === me ? '#4ade80' : ally ? '#3aa0ff' : '#ff4d5a'; rr(bx, by, Math.max(4 * u, bw * clamp(f.hp / f.maxhp, 0, 1)), 9 * u, 3 * u); hx.fill();
      hx.font = `700 ${9 * u}px Fredoka, system-ui, sans-serif`; hx.textAlign = 'center'; hx.fillStyle = '#fff'; hx.fillText(Math.ceil(f.hp), sx, by + 8 * u);
      if (f === me) for (let i = 0; i < 3; i++) { hx.fillStyle = '#1c1b2e'; rr(bx - u + i * 20 * u, by + 12 * u, 19 * u, 7 * u, 3 * u); hx.fill(); hx.fillStyle = '#ff9f1c'; hx.fillRect(bx + i * 20 * u, by + 13 * u, 17 * u * clamp(f.ammo - i, 0, 1), 5 * u); }
      if (f.cores) { hx.fillStyle = '#1c1b2e'; rr(bx + bw + 5 * u, by - 3 * u, 24 * u, 15 * u, 5 * u); hx.fill(); hx.fillStyle = '#ff7eb6'; hx.font = `700 ${11 * u}px Fredoka, system-ui, sans-serif`; hx.fillText(f.cores, bx + bw + 17 * u, by + 8.5 * u); }
    }
    for (const un of V.units) { const [sx, sy] = toScreen(un.x / T, .95, un.y / T), bw = 36 * u; hx.fillStyle = '#1c1b2e'; rr(sx - bw / 2 - 2 * u, sy - 2 * u, bw + 4 * u, 9 * u, 4 * u); hx.fill(); hx.fillStyle = un.team === viewer.team ? '#3aa0ff' : '#ff4d5a'; hx.fillRect(sx - bw / 2, sy, bw * clamp(un.hp / un.maxhp, 0, 1), 5 * u); }
    for (const [k, hp] of V.crates) if (hp < 2000) { const [sx, sy] = toScreen((k % V.W) + .5, .95, ((k / V.W) | 0) + .5), bw = 36 * u; hx.fillStyle = '#1c1b2e'; rr(sx - bw / 2 - 2 * u, sy - 2 * u, bw + 4 * u, 9 * u, 4 * u); hx.fill(); hx.fillStyle = '#ffd23f'; hx.fillRect(sx - bw / 2, sy, bw * hp / 2000, 5 * u); }
    for (const t of texts) { t.life -= dt; t.h += dt * 1.1; if (t.life <= 0) continue; const [sx, sy] = toScreen(t.x, t.h, t.z); hx.globalAlpha = clamp(t.life * 3, 0, 1); label(t.txt, sx, sy, t.size * u, t.c); }
    hx.globalAlpha = 1;
    for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life <= 0) texts.splice(i, 1);
    // top bar
    if (V.mode === 'showdown') {
      const left = V.fighters.filter(f => f.alive).length;
      hx.fillStyle = 'rgba(28,27,46,.8)'; rr(w / 2 - 95 * u, 10 * u, 190 * u, 40 * u, 14 * u); hx.fill();
      label(`${left} LEFT`, w / 2, 38 * u, 22 * u);
      const s = V.safe;
      if (me && me.alive && (me.x < s.x0 || me.x > s.x1 || me.y < s.y0 || me.y > s.y1)) label('GET OUT OF THE STORM!', w / 2, h * .24, 26 * u, '#e3a6ff');
      if (me && !me.alive) label(V.fighters.filter(f => f.alive).length > 0 ? 'KNOCKED OUT — spectating' : '', w / 2, h * .2, 24 * u, '#ffd23f');
    } else {
      const mine = me ? me.team : 0, m = Math.floor(V.clock / 60), sec = Math.floor(V.clock % 60);
      hx.fillStyle = '#3aa0ff'; rr(w / 2 - 140 * u, 10 * u, 70 * u, 44 * u, 14 * u); hx.fill(); hx.fillStyle = '#ff4d5a'; rr(w / 2 + 70 * u, 10 * u, 70 * u, 44 * u, 14 * u); hx.fill();
      hx.fillStyle = 'rgba(28,27,46,.8)'; rr(w / 2 - 62 * u, 10 * u, 124 * u, 44 * u, 14 * u); hx.fill();
      label(V.score[mine], w / 2 - 105 * u, 43 * u, 30 * u); label(V.score[1 - mine], w / 2 + 105 * u, 43 * u, 30 * u);
      label(`${m}:${String(sec).padStart(2, '0')}`, w / 2, 41 * u, 24 * u, V.ot ? '#ffd23f' : '#fff');
      if (V.ot) label('OVERTIME', w / 2, 74 * u, 14 * u, '#ffd23f');
      if (me && !me.alive) label(`Back in ${Math.max(1, me.respawnT || 1)}…`, w / 2, h * .36, 30 * u);
      if (V.phase === 'goal') label(V.banner === 'g' + mine ? 'GOAL!' : 'THEY SCORE!', w / 2, h * .38, 76 * u, '#ffd23f');
      if (V.ball) { const [sx, sy] = toScreen(V.ball.x / T, .3, V.ball.y / T); if (sx < 0 || sx > w || sy < 0 || sy > h) { const a = Math.atan2(sy - h / 2, sx - w / 2), px = clamp(sx, 44 * u, w - 44 * u), py = clamp(sy, 90 * u, h - 44 * u); hx.save(); hx.translate(px, py); hx.rotate(a); hx.fillStyle = '#ffd23f'; hx.strokeStyle = '#1c1b2e'; hx.lineWidth = 3 * u; hx.beginPath(); hx.moveTo(18 * u, 0); hx.lineTo(-10 * u, -12 * u); hx.lineTo(-10 * u, 12 * u); hx.closePath(); hx.fill(); hx.stroke(); hx.restore(); } }
    }
    feed.forEach(f => f.t -= dt); for (let i = feed.length - 1; i >= 0; i--) if (feed[i].t <= 0) feed.splice(i, 1);
    feed.slice(-5).forEach((f, i) => { hx.globalAlpha = clamp(f.t, 0, 1); label(f.txt, w - 16 * u, (34 + i * 22) * u, 14 * u, '#fff', 'right'); }); hx.globalAlpha = 1;
    if (V.phase === 'count') {
      const n = Math.ceil(V.cd); if (n !== lastCd) { lastCd = n; SFX.play(n >= 1 && V.cd > .5 ? 'tick' : 'go'); }
      const fr = V.cd - Math.floor(V.cd), sc = 1 + fr * .5;
      label(V.cd > .5 ? Math.min(3, n) : 'FIGHT!', w / 2, h * .42, 96 * u * sc, '#ffd23f');
    } else lastCd = 9;
    // super button
    if (me) {
      const R = (ui.touch ? 38 : 46) * u, x = w - (ui.touch ? 62 : 84) * u, y = h - (ui.touch ? 236 : 150) * u, ready = me.sup >= 1;
      ui.supBtn = { x: x / u, y: y / u, r: R / u + 10 };
      hx.beginPath(); hx.arc(x, y, R, 0, TAU); hx.fillStyle = 'rgba(28,27,46,.75)'; hx.fill();
      hx.beginPath(); hx.moveTo(x, y); hx.arc(x, y, R - 5 * u, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(me.sup, 0, 1)); hx.closePath(); hx.fillStyle = ready ? '#ffd23f' : '#8a7a2e'; hx.fill();
      hx.beginPath(); hx.arc(x, y, R, 0, TAU); hx.lineWidth = 4 * u; hx.strokeStyle = ready ? '#fff' : '#1c1b2e'; hx.stroke();
      label('SUPER', x, y + 5 * u, 15 * u, ready ? '#1c1b2e' : '#fff');
      if (!ui.touch) label(ready ? 'SPACE' : '', x, y - R - 8 * u, 12 * u, '#ffd23f');
      if (ui.touch) { // always-visible sticks: left = move, right = aim (drag any direction, release to shoot; tap = shoot nearest target)
        const base = (st, bx, by, aim) => {
          const on = !!st, ox = (on ? st.ox : bx) * u, oy = (on ? st.oy : by) * u, kx = (on ? st.cx : bx) * u, ky = (on ? st.cy : by) * u, has = me.ammo >= 1;
          hx.globalAlpha = on ? .5 : .32; hx.beginPath(); hx.arc(ox, oy, 58 * u, 0, TAU); hx.fillStyle = aim ? '#ff4d5a' : '#ffffff'; hx.fill(); hx.lineWidth = 3 * u; hx.strokeStyle = '#1c1b2e'; hx.stroke();
          hx.globalAlpha = on ? .95 : .8; hx.beginPath(); hx.arc(kx, ky, 28 * u, 0, TAU); hx.fillStyle = aim ? (has ? '#ff4d5a' : '#8a4750') : '#ffffff'; hx.fill(); hx.stroke();
          if (aim) { hx.strokeStyle = '#fff'; hx.lineWidth = 3 * u; hx.beginPath(); hx.arc(kx, ky, 11 * u, 0, TAU); hx.moveTo(kx - 18 * u, ky); hx.lineTo(kx + 18 * u, ky); hx.moveTo(kx, ky - 18 * u); hx.lineTo(kx, ky + 18 * u); hx.stroke(); }
          hx.globalAlpha = 1;
        };
        const W2 = w / u, H2 = h / u;
        base(ui.sticks[0], 112, H2 - 118, false); base(ui.sticks[1], W2 - 118, H2 - 118, true);
        if (!ui.sticks[1]) label('TAP: auto-aim  ·  DRAG: aim', w - 118 * u, h - 40 * u, 11 * u);
      }
    }
  }
  function frame(dt, now, ui) {
    if (!V || !scene) return;
    if (lostAt && now - lostAt > 1200 && now - lastRecover > 4000) recover(now);
    sync(dt, now);
    if (glOK && renderer && !lostAt) { try { renderer.render(scene, cam); } catch (e) { lostAt = lostAt || now; } }
    drawHud(dt, now, ui);
  }
  return { init, portraits, startMatch, stopMatch, frame, fx, screenToWorld, get active() { return !!V; } };
})();

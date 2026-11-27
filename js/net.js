'use strict';
/* Pitchford Fight — room networking. The room creator is the host and runs the match.
   Two transports behind one interface:
   - Relay (preferred): every device opens a plain WebSocket to the room relay (see /relay), which forwards
     frames between host and players. Works on any network that can load the site.
   - PeerJS fallback (used only if RELAY_URL is empty): direct WebRTC links. These fail between many
     home / mobile networks because there is no dependable free TURN relay. */
const RELAY_URL = 'wss://pitchford-fight-relay.topple.workers.dev';   // e.g. 'wss://pitchford-fight-relay.<your-subdomain>.workers.dev' — set after deploying /relay

const Net = (() => {
  let relay = RELAY_URL;
  try { const q = new URLSearchParams(location.search).get('relay'); if (q && /^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(q)) relay = q; } catch (e) {}
  const useRelay = () => !!relay;

  /* ---------- relay transport ---------- */
  let ws = null, peers = new Set(), ping = 0, gen = 0;
  const key = (() => { try { let k = sessionStorage.getItem('pf_hostkey'); if (!k) { k = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('pf_hostkey', k); } return k; } catch (e) { return Math.random().toString(36).slice(2); } })();
  function wsClose() { gen++; clearInterval(ping); try { if (ws) ws.close(); } catch (e) {} ws = null; peers = new Set(); }
  function keepAlive(sock) { clearInterval(ping); ping = setInterval(() => { if (sock.readyState === 1) sock.send('~'); }, 25000); }
  function rHost(code, cb, retry = 0) {
    const my = retry ? gen : (wsClose(), gen);
    let ok = false;
    const sock = ws = new WebSocket(`${relay}/room/${code}?role=host&key=${key}`);
    sock.onmessage = e => {
      const m = e.data; if (my !== gen || m === '~') return;
      if (m === '!ok') { ok = true; keepAlive(sock); if (!retry) cb.open(); return; }
      if (m[0] === '+') { const id = m.slice(1); if (!peers.has(id)) { peers.add(id); cb.join(id); } return; }
      if (m[0] === '-') { const id = m.slice(1); if (peers.delete(id)) cb.leave(id); return; }
      const i = m.indexOf('|'); if (i < 0) return;
      let d; try { d = JSON.parse(m.slice(i + 1)); } catch (err) { return; }
      cb.data(m.slice(0, i), d);
    };
    sock.onclose = e => {
      if (my !== gen) return;
      if (!ok && !retry) { cb.error(e.code === 4001 ? 'taken' : 'offline'); return; }
      if (e.code === 4001 || e.code === 4002) return;
      // dropped (phone slept, switched apps to share the link, wifi blip): quietly reconnect, players stay in the room
      if (retry < 20) setTimeout(() => { if (my === gen) rHost(code, cb, retry + 1); }, 1200);
    };
  }
  function rJoin(code, cb) {
    wsClose(); const my = gen; let ok = false, done = false;
    const fail = m => { if (!done) { done = true; cb.error(m); } };
    const sock = ws = new WebSocket(`${relay}/room/${code}?role=join`);
    sock.onmessage = e => {
      const m = e.data; if (my !== gen || m === '~') return;
      if (m.startsWith('!ok:')) { ok = done = true; keepAlive(sock); cb.open(m.slice(4)); return; }
      let d; try { d = JSON.parse(m); } catch (err) { return; }
      cb.data(d);
    };
    sock.onclose = e => {
      if (my !== gen) return;
      if (ok) cb.close();
      else fail(e.code === 4004 ? 'No room with that code. Check the code and try again.' : e.code === 4005 ? 'That room is full.' : 'Could not reach the game server. Check your connection and try again.');
    };
    setTimeout(() => { if (my === gen && !ok) { fail('Timed out connecting. Try again.'); try { sock.close(); } catch (e) {} } }, 12000);
  }

  /* ---------- PeerJS fallback ---------- */
  const PREFIX = 'pitchford-fight-v1-';
  let peer = null, conns = new Map(), hostConn = null;
  function pClose() { try { if (peer) peer.destroy(); } catch (e) {} peer = null; conns = new Map(); hostConn = null; }
  function pHost(code, cb) {
    pClose();
    if (typeof Peer === 'undefined') { cb.error('offline'); return; }
    let opened = false;
    peer = new Peer(PREFIX + code);
    peer.on('open', () => { opened = true; cb.open(); });
    peer.on('error', e => { if (!opened) cb.error(e.type === 'unavailable-id' ? 'taken' : 'offline'); });
    peer.on('disconnected', () => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch (e) {} });
    peer.on('connection', c => {
      c.on('open', () => { conns.set(c.peer, c); cb.join(c.peer); });
      c.on('data', d => cb.data(c.peer, d));
      const bye = () => { if (conns.get(c.peer) === c) { conns.delete(c.peer); cb.leave(c.peer); } };
      c.on('close', bye); c.on('error', bye);
    });
  }
  function pJoin(code, cb) {
    pClose();
    if (typeof Peer === 'undefined') { cb.error('Could not load the networking library. Check your connection and reload.'); return; }
    let done = false;
    const fail = m => { if (!done) { done = true; cb.error(m); } };
    peer = new Peer();
    peer.on('open', id => {
      const c = hostConn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      c.on('open', () => { done = true; cb.open(id); });
      c.on('data', d => cb.data(d));
      c.on('close', () => { if (done) cb.close(); else fail('Could not connect to that room.'); });
      c.on('error', () => fail('Could not connect to that room.'));
      setTimeout(() => fail('Could not connect — your network and the host’s network can’t reach each other directly.'), 15000);
    });
    peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'No room with that code. Check the code and try again.' : 'Connection problem (' + e.type + ').'));
  }

  /* ---------- shared interface ---------- */
  /* host cb: { open(), error(type), join(pid), data(pid, msg), leave(pid) }   join cb: { open(myId), error(msg), data(msg), close() } */
  return {
    host(code, cb) { if (useRelay()) rHost(code, cb); else pHost(code, cb); },
    join(code, cb) { if (useRelay()) rJoin(code, cb); else pJoin(code, cb); },
    send(msg) { if (useRelay()) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); } else if (hostConn && hostConn.open) hostConn.send(msg); },
    sendTo(pid, msg) { if (useRelay()) { if (ws && ws.readyState === 1) ws.send('@' + pid + '|' + JSON.stringify(msg)); } else { const c = conns.get(pid); if (c && c.open) c.send(msg); } },
    broadcast(msg) { if (useRelay()) { if (ws && ws.readyState === 1 && peers.size) ws.send('*' + JSON.stringify(msg)); } else for (const c of conns.values()) if (c.open) c.send(msg); },
    close() { wsClose(); pClose(); },
    get peers() { return useRelay() ? [...peers] : [...conns.keys()]; },
    get mode() { return useRelay() ? 'relay' : 'p2p'; },
  };
})();

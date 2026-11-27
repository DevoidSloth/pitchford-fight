// Pitchford Fight — room relay. One Durable Object per 4-letter room code. It only forwards text frames
// between the room's host and its players; it never looks inside the game messages.
//   host  -> relay:  "*<json>" broadcast to all players, "@<id>|<json>" to one player
//   relay -> host:   "!ok", then "+<id>" joined, "-<id>" left, "<id>|<json>" message from a player
//   relay -> player: "!ok:<id>" on join, then the host's json frames
import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("~", "~")); // keep-alive without waking
  }
  async fetch(req) {
    const url = new URL(req.url), role = url.searchParams.get("role"), key = url.searchParams.get("key") || "";
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    const reject = (code, why) => { server.accept(); server.close(code, why); return new Response(null, { status: 101, webSocket: client }); };
    const hosts = this.ctx.getWebSockets("host"), joiners = this.ctx.getWebSockets("join");
    if (role === "host") {
      const saved = await this.ctx.storage.get("key");
      if (saved && saved !== key && (hosts.length || joiners.length)) return reject(4001, "taken");
      for (const h of hosts) { try { h.close(4002, "replaced"); } catch {} }   // same host reconnecting
      await this.ctx.storage.put("key", key);
      await this.ctx.storage.deleteAlarm();
      this.ctx.acceptWebSocket(server, ["host"]);
      server.serializeAttachment({ role: "host" });
      server.send("!ok");
      for (const c of joiners) server.send("+" + c.deserializeAttachment().id);
    } else {
      if (!hosts.length) return reject(4004, "no room");
      if (joiners.length >= 12) return reject(4005, "full");
      const id = crypto.randomUUID().slice(0, 8);
      this.ctx.acceptWebSocket(server, ["join", "c:" + id]);
      server.serializeAttachment({ role: "join", id });
      server.send("!ok:" + id);
      hosts[hosts.length - 1].send("+" + id);
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, msg) {
    if (typeof msg !== "string") return;
    const att = ws.deserializeAttachment();
    if (att.role === "host") {
      if (msg[0] === "*") { const m = msg.slice(1); for (const c of this.ctx.getWebSockets("join")) { try { c.send(m); } catch {} } }
      else if (msg[0] === "@") { const i = msg.indexOf("|"); for (const c of this.ctx.getWebSockets("c:" + msg.slice(1, i))) { try { c.send(msg.slice(i + 1)); } catch {} } }
    } else {
      const hosts = this.ctx.getWebSockets("host");
      if (hosts.length) { try { hosts[hosts.length - 1].send(att.id + "|" + msg); } catch {} }
    }
  }
  async gone(ws) {
    const att = ws.deserializeAttachment() || {};
    try { ws.close(1000, "bye"); } catch {}
    const hosts = this.ctx.getWebSockets("host").filter(h => h !== ws);
    if (att.role === "join") { for (const h of hosts) { try { h.send("-" + att.id); } catch {} } }
    else if (!hosts.length) await this.ctx.storage.setAlarm(Date.now() + 25000); // give the host time to come back
  }
  async webSocketClose(ws) { await this.gone(ws); }
  async webSocketError(ws) { await this.gone(ws); }
  async alarm() {
    if (this.ctx.getWebSockets("host").length) return;
    for (const c of this.ctx.getWebSockets("join")) { try { c.close(4000, "host left"); } catch {} }
    await this.ctx.storage.deleteAll();
  }
}

export default {
  async fetch(req, env) {
    const m = /^\/room\/([A-Z]{4})$/.exec(new URL(req.url).pathname);
    if (!m) return new Response("Pitchford Fight relay", { status: 200 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
  },
};

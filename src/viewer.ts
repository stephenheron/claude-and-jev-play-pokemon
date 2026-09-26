import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type { Game, GameEvent } from './game.js';

/** Snapshot of the game for the viewer (and anything else that wants a quick summary). */
export function status(game: Game, extra: () => Record<string, unknown> = () => ({})) {
  const gs = game.state;
  return {
    type: 'status', map: gs.mapName, x: gs.x, y: gs.y, badges: gs.badgeCount, money: gs.money,
    party: gs.party().map((p) => ({ name: p.nickname, species: p.species, level: p.level, hp: p.hp, maxHp: p.maxHp, status: p.status })),
    paused: game.paused, frames: game.frames, ...extra(),
  };
}

const WEB_DIR = path.resolve('web');

/**
 * Local browser viewer: live screen, status and events over a WebSocket.
 * Listens on 127.0.0.1 only. The page's buttons pause/resume and save a state.
 */
export function serveViewer(game: Game, opts: { port?: number; extra?: () => Record<string, unknown> } = {}) {
  const port = opts.port ?? +(process.env.PORT ?? 8787);
  const snap = () => status(game, opts.extra);
  const sockets = new Set<WebSocket>();
  const events: GameEvent[] = [];
  const broadcast = (obj: unknown) => {
    const s = JSON.stringify(obj);
    for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(s);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = path.join(WEB_DIR, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!p.startsWith(WEB_DIR + path.sep) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'text/plain' });
    fs.createReadStream(p).pipe(res);
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.send(JSON.stringify({ type: 'history', events }));
    ws.send(JSON.stringify(snap()));
    ws.on('message', (d) => {
      let m: { cmd?: string };
      try { m = JSON.parse(String(d)); } catch { return; }
      if (m.cmd === 'pause') { game.paused = !game.paused; broadcast(snap()); }
      if (m.cmd === 'save') game.save(`manual-${Date.now()}`);
    });
    ws.on('close', () => sockets.delete(ws));
  });

  const offEvent = game.onEvent((e) => {
    events.push(e); if (events.length > 300) events.shift();
    broadcast({ type: 'event', e });
  });

  // screen at most every 50 ms, status about twice a second
  let lastScreen = 0, lastStatus = 0;
  const offFrame = game.onFrame((screen) => {
    if (!sockets.size) return;
    const now = Date.now();
    if (now - lastScreen >= 50) {
      lastScreen = now;
      const buf = Buffer.from(Uint8Array.from(screen));
      for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(buf);
    }
    if (now - lastStatus >= 500) { lastStatus = now; broadcast(snap()); }
  });

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.error(`viewer: port ${port} is already in use (another copy running?). Set PORT or stop the other one.`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => console.log(`viewer: http://localhost:${port}`));
  return { close() { offEvent(); offFrame(); wss.close(); server.close(); } };
}

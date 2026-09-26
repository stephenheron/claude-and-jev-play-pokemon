import http from 'node:http';
import crypto from 'node:crypto';

/**
 * Lets the improver container call Jev without seeing the OpenRouter key: the container sends
 * `Authorization: Bearer <token>` to this relay, which forwards the request with the real key.
 * Only POST /api/alpha/decisions is forwarded (not key management or other OpenRouter endpoints).
 * Listens on 127.0.0.1 only; Docker containers reach it at host.docker.internal.
 */
export function startJevRelay(opts: { key: string; port?: number; upstream?: string }) {
  const token = `relay-${crypto.randomBytes(24).toString('hex')}`;
  const upstream = opts.upstream ?? process.env.JEV_BASE_URL ?? 'https://openrouter.ai';
  const MAX_BODY = 200_000;

  const server = http.createServer((req, res) => {
    const deny = (code: number, message: string) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code, message } })); };
    if (req.method !== 'POST' || req.url !== '/api/alpha/decisions') return deny(404, 'only POST /api/alpha/decisions is relayed');
    const auth = req.headers.authorization ?? '';
    const given = Buffer.from(auth.replace(/^Bearer /, ''));
    if (given.length !== token.length || !crypto.timingSafeEqual(given, Buffer.from(token))) return deny(401, 'bad relay token');
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { deny(413, 'request too large'); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', async () => {
      if (res.headersSent) return;
      try {
        const r = await fetch(`${upstream}/api/alpha/decisions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${opts.key}`, 'content-type': 'application/json' },
          body: Buffer.concat(chunks),
          signal: AbortSignal.timeout(30_000),
        });
        res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/json' });
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch (e) {
        deny(502, `relay: ${(e as Error).message}`);
      }
    });
  });

  return new Promise<{ port: number; token: string; close: () => void }>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, token, close: () => server.close() });
    });
  });
}

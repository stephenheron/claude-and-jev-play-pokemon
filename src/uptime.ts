import fs from 'node:fs';
import path from 'node:path';

// How long the host has been running in total, across stops and restarts.
// Kept in logs/uptime.json and flushed every 30 seconds, so a crash loses at most that much.
// Delete the file to start counting from zero again.

export interface Uptime {
  /** When the counter was first started (ISO). */
  firstStarted: string;
  /** How many times the host has been started. */
  starts: number;
  /** Total running time across all starts, in milliseconds. */
  totalMs: number;
  /** Running time of the current start, in milliseconds. */
  thisRunMs: number;
}

interface Stored { firstStarted: string; starts: number; totalMs: number; lastFlushed: string }

export function trackUptime(file = path.join('logs', 'uptime.json'), flushMs = 30_000) {
  const startedAt = Date.now();
  let stored: Stored = { firstStarted: new Date(startedAt).toISOString(), starts: 0, totalMs: 0, lastFlushed: '' };
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof j.totalMs === 'number' && typeof j.firstStarted === 'string') stored = { ...stored, ...j };
  } catch { /* first start, or an unreadable file: start from zero */ }
  stored.starts += 1;
  const base = stored.totalMs;

  const status = (): Uptime => ({ firstStarted: stored.firstStarted, starts: stored.starts, totalMs: base + (Date.now() - startedAt), thisRunMs: Date.now() - startedAt });
  const flush = () => {
    const s = status();
    const out: Stored = { firstStarted: s.firstStarted, starts: s.starts, totalMs: s.totalMs, lastFlushed: new Date().toISOString() };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(out, null, 2));
      fs.renameSync(`${file}.tmp`, file);   // atomic: a crash mid-write can't leave a half file
    } catch { /* not fatal: the counter just loses this flush */ }
  };
  flush();
  const timer = setInterval(flush, flushMs);
  timer.unref();
  return { status, flush, stop() { clearInterval(timer); flush(); } };
}

/** "3d 4h 05m" style, for logs and the viewer. */
export function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const mm = String(m % 60).padStart(2, '0');
  return d ? `${d}d ${h % 24}h ${mm}m` : h ? `${h}h ${mm}m` : `${m}m`;
}

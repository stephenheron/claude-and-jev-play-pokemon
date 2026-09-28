import fs from 'node:fs';
import path from 'node:path';

// `npm start -- --fresh`: a clean slate, not just a new game. Everything the previous game left behind is moved
// (never deleted) into logs/old-<timestamp>/: run logs, improver sessions, the bot and its notes, save states and
// the running-time counter. The bot is then reset to the starter bot, so the improver rebuilds it from scratch.

export interface FreshDirs { botsDir: string; saveDir: string; logsDir: string; starterDir: string }

const SKIP = (name: string) => name.startsWith('.') || name === 'node_modules';

/** Moves `from` to `to` (rename, or copy+delete across filesystems). Returns false when `from` doesn't exist. */
function moveInto(from: string, to: string): boolean {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); }
  catch { fs.cpSync(from, to, { recursive: true }); fs.rmSync(from, { recursive: true, force: true }); }
  return true;
}

/**
 * Archives the previous game's state into logs/old-<stamp>/ and restores the starter bot.
 * Returns what was archived (empty when there was nothing) and where.
 */
export function freshStart(dirs: FreshDirs): { archive: string; moved: string[] } {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const archive = path.join(dirs.logsDir, `old-${stamp}`);
  const moved: string[] = [];
  const move = (from: string, label: string, to = path.join(archive, label)) => { if (moveInto(from, to)) moved.push(label); };

  move(path.join(dirs.logsDir, 'runs'), 'runs');
  move(path.join(dirs.logsDir, 'sessions'), 'sessions');
  move(path.join(dirs.logsDir, 'uptime.json'), 'uptime.json');
  move(path.join(dirs.logsDir, 'champion.json'), 'champion.json');
  // save states: the autosave and the bot's own saves (saves/bot-*)
  if (fs.existsSync(dirs.saveDir)) {
    for (const f of fs.readdirSync(dirs.saveDir)) {
      if (f.endsWith('.state.json')) move(path.join(dirs.saveDir, f), `saves/${f}`);
    }
  }
  // the bot and its notes, then the starter bot in their place
  if (fs.existsSync(dirs.botsDir)) {
    for (const e of fs.readdirSync(dirs.botsDir, { withFileTypes: true })) {
      if (SKIP(e.name)) continue;
      move(path.join(dirs.botsDir, e.name), `bots/${e.name}`);
    }
  }
  fs.mkdirSync(dirs.botsDir, { recursive: true });
  for (const f of fs.readdirSync(dirs.starterDir)) {
    if (/\.m?js$/.test(f)) fs.copyFileSync(path.join(dirs.starterDir, f), path.join(dirs.botsDir, f));
  }
  return { archive, moved };
}

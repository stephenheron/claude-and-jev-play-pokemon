// Headless bot test: run bots/bot.js from a save state for a while, at max speed, and print the run summary.
// The run is logged like any other (run.jsonl, jev.jsonl, screenshots) under --out.
// usage: tsx src/testrun.ts --load <state file | save name> [--frames 20000] [--seconds 120] [--bots bots] [--out logs/test-runs]
import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from './game.js';
import { startBot } from './sandbox.js';
import { JevClient } from './jev.js';

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const num = (n: string, d: number) => { const v = Number(opt(n)); return Number.isFinite(v) && v > 0 ? v : d; };

const botsDir = path.resolve(opt('bots', process.env.BOTS_DIR ?? 'bots')!);
process.env.RUNS_DIR = path.resolve(opt('out', 'logs/test-runs')!);
const maxFrames = num('frames', 20_000);   // ~2.7 minutes of game time
const maxSeconds = num('seconds', 120);    // wall clock, in case the bot mostly waits on Jev

const game = new Game({ speed: 0, saveDir: opt('saves', 'saves') });
const load = opt('load');
if (load) {
  if (fs.existsSync(load)) game.loadFile(load);
  else game.load(load);
}
game.onEvent((e) => { if (e.kind === 'bot' || e.kind === 'error') console.log(`[${e.kind}] ${e.msg}`); });

const startFrame = game.frames;
let reason = '';
const run = startBot(game, botsDir, (r, error) => { reason = error ? `${r}: ${error}` : r; }, new JevClient());
const t0 = Date.now();
const watchdog = setInterval(() => {
  if (game.frames - startFrame >= maxFrames) { reason = `limit: ${maxFrames} frames`; run.stop('limit'); }
  else if (Date.now() - t0 >= maxSeconds * 1000) { reason = `limit: ${maxSeconds} seconds`; run.stop('limit'); }
}, 50);

await run.done.catch(() => {});
clearInterval(watchdog);
const summary = JSON.parse(fs.readFileSync(path.join(run.log.dir, 'summary.json'), 'utf8'));
console.log(`\nended: ${reason}`);
console.log(`log: ${run.log.dir}`);
console.log(JSON.stringify(summary, null, 2));
process.exit(0);

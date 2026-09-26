// The bot host: runs the game, viewer and stream, and runs bots/bot.js in a sandbox.
// Saving any .js file in bots/ restarts the bot with the new code; the game carries on where it is.
// usage: npm start [-- --speed 1] [--load <save>] [--fresh] [--headless]
import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from './game.js';
import { serveViewer } from './viewer.js';
import { startStream } from './stream/streamer.js';
import { startBot, type BotRun } from './sandbox.js';
import { JevClient } from './jev.js';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const BOTS_DIR = path.resolve(opt('bots', process.env.BOTS_DIR ?? 'bots')!);
const AUTOSAVE = 'autosave';
fs.mkdirSync(BOTS_DIR, { recursive: true });

const jev = new JevClient();
const game = new Game({ speed: +(opt('speed', process.env.SPEED ?? '1')!) });
game.onEvent((e) => console.log(`[${e.kind}] ${e.msg}`));

const bot: { status: 'waiting' | 'running' | 'finished' | 'error'; run?: string; error?: string; startedAt?: number } = { status: 'waiting' };
const jevStatus = () => ({ available: jev.available, model: jev.model, calls: jev.calls, costUsd: +jev.usd.toFixed(4) });
if (!flag('headless')) serveViewer(game, { extra: () => ({ bot, jev: jevStatus() }) });
if (process.env.STREAM_URL || process.env.YOUTUBE_STREAM_KEY) startStream(game);

const load = opt('load') ?? (!flag('fresh') && fs.existsSync(path.join(game.saveDir, `${AUTOSAVE}.state.json`)) ? AUTOSAVE : undefined);
if (load) game.load(load);

let current: BotRun | null = null;

function start() {
  current?.stop('reload');
  current = null;
  if (!fs.existsSync(path.join(BOTS_DIR, 'bot.js'))) {
    Object.assign(bot, { status: 'waiting', run: undefined, error: undefined });
    game.log('bot', `waiting for ${path.relative('.', BOTS_DIR)}/bot.js`);
    return;
  }
  try {
    const run = startBot(game, BOTS_DIR, (reason, error) => {
      if (current !== run) return; // an older run being replaced
      if (reason === 'finished') { bot.status = 'finished'; game.log('bot', `run ${run.log.id} finished`); }
      if (reason === 'error') { bot.status = 'error'; bot.error = error; game.log('error', `run ${run.log.id} crashed: ${error}`); }
    }, jev);
    current = run;
    Object.assign(bot, { status: 'running', run: run.log.id, error: undefined, startedAt: Date.now() });
    game.log('bot', `run ${run.log.id} started (log: ${run.log.dir})`);
  } catch (e) {
    Object.assign(bot, { status: 'error', run: undefined, error: (e as Error).message });
    game.log('error', `could not start the bot: ${(e as Error).message}`);
  }
}

// reload on any .js change in bots/ (debounced: editors write files in several steps)
let debounce: NodeJS.Timeout | undefined;
fs.watch(BOTS_DIR, { recursive: true }, (_ev, file) => {
  if (file && !/\.m?js$/.test(String(file))) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => { game.log('bot', `change in ${file ?? 'bots/'}: reloading`); start(); }, 200);
});

// While no bot is running, keep the game going in real time so the viewer and stream show it.
// While one is, the game only advances when the bot presses buttons or waits.
const idle = setInterval(() => {
  if (bot.status === 'running' || game.paused) return;
  for (let i = 0; i < 2; i++) game.frame(); // ~125 frames/s at a 16 ms interval
}, 16);

const autosave = setInterval(() => game.save(AUTOSAVE), 5 * 60_000);

function shutdown() {
  clearInterval(idle); clearInterval(autosave);
  current?.stop('shutdown');
  game.save(AUTOSAVE);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

game.log('jev', jev.available ? `Jev: ${jev.model} via OpenRouter` : 'Jev: off (set OPENROUTER_API_KEY to let bots call it)');
start();

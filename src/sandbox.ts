import fs from 'node:fs';
import path from 'node:path';
import ivm from 'isolated-vm';
import type { Game } from './game.js';
import type { Button } from './emu/emulator.js';
import { sym } from './game/symbols.js';
import { RunLog, type EndReason } from './runlog.js';
import { JevError, type JevClient, type JevQuestion } from './jev.js';
import { mapGrid } from './mapview.js';
import { watchGame } from './gamewatch.js';

// Runs untrusted bot code in its own V8 isolate (isolated-vm): no Node APIs, capped memory, killable at any time.
// The bot's only way out is one host function, `call(name, argsJson)`, and every argument is validated here.

const MEMORY_MB = 128;
const MAX_FRAMES = 600;            // per wait/hold call, so one call can't stall the host for long
const MAX_FILES = 200, MAX_BYTES = 5 * 1024 * 1024;
const LOG_RATE = 20, LOG_BURST = 50, LOG_CHARS = 500;
// Stuck-bot watchdog: the game only advances when the bot presses buttons or waits. A bot that keeps asking Jev,
// or keeps reading, or goes quiet, without ever advancing the game is stuck in a loop and is stopped.
const STALL_JEV = 20, STALL_CALLS = 20_000, STALL_SECONDS = 120;
const BUTTONS = new Set<Button>(['A', 'B', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
const NAME = /^[A-Za-z0-9_-]{1,40}$/;

// A mistake in the bot's call (bad argument, limit hit): reported to the bot without host stack frames.
class BotError extends Error {
  constructor(message: string) { super(message); this.stack = `Error: ${message}`; }
}

const int = (v: unknown, lo: number, hi: number, what: string, dflt?: number) => {
  if ((v === undefined || v === null) && dflt !== undefined) return dflt; // JSON turns missing arguments into null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw new BotError(`${what} must be a whole number from ${lo} to ${hi}`);
  return v;
};
const button = (v: unknown) => {
  if (!BUTTONS.has(v as Button)) throw new BotError(`unknown button ${JSON.stringify(v)} (use ${[...BUTTONS].join(', ')})`);
  return v as Button;
};
const saveName = (v: unknown) => {
  if (typeof v !== 'string' || !NAME.test(v)) throw new BotError('save names are 1-40 letters, digits, - or _');
  return v;
};

/** Shape check before a Jev call leaves the host (the API validates the rest). */
function checkJevQuestions(q: unknown): asserts q is Record<string, JevQuestion> {
  if (!q || typeof q !== 'object' || Array.isArray(q)) throw new BotError('jev(state, questions): questions is an object like { pick: { type: "choice", instructions, criteria } }');
  const entries = Object.entries(q);
  if (entries.length < 1 || entries.length > 20) throw new BotError('jev(): 1 to 20 questions per call');
  for (const [k, v] of entries) {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(k)) throw new BotError(`jev(): question names are letters, digits and _ (got ${JSON.stringify(k)})`);
    const t = (v as { type?: unknown })?.type;
    if (t !== 'choice' && t !== 'noul' && t !== 'score') throw new BotError(`jev(): question "${k}" needs type "choice", "noul" or "score"`);
    if ((v as { instructions?: unknown }).instructions === undefined) throw new BotError(`jev(): question "${k}" needs instructions`);
  }
}

/** Read every .js/.mjs file under the bots folder (relative path -> source). */
export function snapshotBots(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  let bytes = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith('.') && e.name !== 'node_modules') walk(p); continue; }
      if (!/\.m?js$/.test(e.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      bytes += src.length;
      if (files.size >= MAX_FILES || bytes > MAX_BYTES) throw new Error(`bots folder is too big (max ${MAX_FILES} files, ${MAX_BYTES / 1024 / 1024} MB)`);
      files.set(path.relative(dir, p).split(path.sep).join('/'), src);
    }
  };
  walk(dir);
  return files;
}

/** Static ROM data handed to the bot once (species, moves, items, type chart, maps, ...). */
function romData(game: Game) {
  const r = game.rom;
  return {
    species: Object.fromEntries([...r.species].map(([id, s]) => [id, {
      id, dex: s.dex, name: s.name, types: s.types, base: s.base, catchRate: s.catchRate,
      evolutions: r.evolutions(id), machines: [...r.items.keys()].filter((it) => it >= 0xc4 && r.canLearnMachine(id, it)),
    }])),
    moves: Object.fromEntries(r.moves),
    items: Object.fromEntries(r.items),
    typeChart: Object.fromEntries(r.typeChart),
    maps: Object.fromEntries([...r.maps].map(([id, m]) => [id, {
      id, name: m.name, width: m.width, height: m.height, connections: m.connections, warps: m.warps, signs: m.signs, objects: m.objects,
    }])),
    trainerNames: r.trainerNames,
    tmMoves: r.tmMoves,
  };
}

// Runs inside the isolate before the bot: builds the API on top of the single host call, then hides that call.
const BOOTSTRAP = `
const $call = globalThis.$call; delete globalThis.$call;
const rom = globalThis.$rom; delete globalThis.$rom;
const call = (name, ...args) => { const r = $call.applySyncPromise(undefined, [name, JSON.stringify(args)]); return r === undefined ? undefined : JSON.parse(r); };
const fmt = (v) => { if (typeof v === 'string') return v; try { return JSON.stringify(v); } catch { return String(v); } };
rom.effectiveness = (moveType, defTypes) => defTypes.reduce((m, t) => m * (rom.typeChart[moveType + '>' + t] ?? 1), 1);
rom.speciesByName = (name) => Object.values(rom.species).find((s) => s.name === name);
rom.mapByName = (name) => Object.values(rom.maps).find((m) => m.name === name);
Object.freeze(rom);
const api = Object.freeze({
  press: (button, hold, release) => call('press', button, hold, release),
  hold: (button, frames) => call('hold', button, frames),
  wait: (frames) => call('wait', frames),
  frame: (buttons = []) => call('frame', buttons),
  state: () => call('state'), party: () => call('party'), box: () => call('box'), bag: () => call('bag'),
  battle: () => call('battle'), sprites: () => call('sprites'), screen: () => call('screen'), menu: () => call('menu'),
  event: (name) => call('event', name), read: (addr, length = 1) => call('read', addr, length), sym: (name) => call('sym', name),
  grid: () => call('grid'),
  save: (name) => call('save', name), load: (name) => call('load', name), snapshot: (label = '') => call('snapshot', label),
  jev: (state, questions) => call('jev', state, questions),
  log: (...a) => call('log', a.map(fmt).join(' ')),
  rom,
});
globalThis.console = Object.freeze({ log: api.log, info: api.log, warn: api.log, error: api.log, debug: api.log });
Object.assign(globalThis, api);
globalThis.api = api;
`;

// The real entry point: bot.js either exports a default function (called with the API) or just runs at top level.
const ENTRY = `import * as bot from './bot.js';
export async function run() { if (typeof bot.default === 'function') await bot.default(globalThis.api); }`;

export interface BotRun {
  log: RunLog;
  /** Settles when the bot finishes, crashes, or is stopped. */
  done: Promise<void>;
  stop(reason: EndReason): void;
}

/** Start bots/bot.js in a fresh isolate. The game carries on from wherever it is. */
export function startBot(game: Game, botsDir: string, onEnd: (reason: EndReason, error?: string) => void, jev?: JevClient): BotRun {
  const files = snapshotBots(botsDir);
  if (!files.has('bot.js')) throw new Error(`no ${path.join(botsDir, 'bot.js')}`);
  const log = new RunLog(game, files);
  const stopWatch = watchGame(game, (what, data) => log.gameEvent(what, data)); // what the game really did, for checking the bot
  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_MB });
  let alive = true;
  let tokens = LOG_BURST, lastRefill = Date.now(), dropped = 0, lastSave = 0;

  // watchdog state: calls made (and Jev calls among them) since the game last advanced
  let stallFrame = game.frames, stallSince = Date.now(), stallCalls = 0, stallJev = 0;
  const stuck = (why: string) => {
    const msg = `stuck: ${why} without advancing the game (the game only moves when the bot presses a button or waits)`;
    setImmediate(() => finish('error', msg)); // stop after this call returns, so the isolate isn't disposed mid-call
    return new BotError(msg);
  };
  const noteCall = (isJev: boolean) => {
    if (game.frames !== stallFrame || game.paused) { stallFrame = game.frames; stallSince = Date.now(); stallCalls = 0; stallJev = 0; }
    stallCalls++;
    if (isJev) stallJev++;
    if (stallJev > STALL_JEV) throw stuck(`asked Jev ${stallJev} times`);
    if (stallCalls > STALL_CALLS) throw stuck(`made ${stallCalls} calls`);
  };
  // also catches a bot spinning in plain JavaScript without calling anything
  const stallTimer = setInterval(() => {
    if (game.frames !== stallFrame || game.paused) { stallFrame = game.frames; stallSince = Date.now(); stallCalls = 0; stallJev = 0; return; }
    if (Date.now() - stallSince > STALL_SECONDS * 1000) finish('error', `stuck: ${STALL_SECONDS} seconds without advancing the game (the game only moves when the bot presses a button or waits)`);
  }, 5000);

  const finish = (reason: EndReason, error?: string) => {
    if (!alive) return;
    alive = false;
    clearInterval(stallTimer);
    stopWatch();
    if (!isolate.isDisposed) isolate.dispose();
    log.end(reason, { error, droppedLogLines: dropped || undefined });
    onEnd(reason, error);
  };

  // each action validates its arguments, acts, and returns the arguments it actually used (for the run log)
  const actions: Record<string, (...a: unknown[]) => unknown[]> = {
    press: (b, h, r) => { const a = [button(b), int(h, 1, 60, 'hold', 4), int(r, 0, 120, 'release', 8)] as const; game.press(...a); return [...a]; },
    hold: (b, n) => { const a = [button(b), int(n, 1, MAX_FRAMES, 'frames')] as const; game.hold(...a); return [...a]; },
    wait: (n) => { const f = int(n, 1, MAX_FRAMES, 'frames'); game.wait(f); return [f]; },
    frame: (bs) => {
      if (!Array.isArray(bs) || bs.length > 8) throw new BotError('frame() takes an array of buttons');
      const held = bs.map(button);
      game.frame(held);
      return [held];
    },
    save: (n) => {
      if (Date.now() - lastSave < 2000) throw new BotError('save() at most once every 2 seconds');
      lastSave = Date.now();
      game.save(`bot-${saveName(n)}`);
      return [n];
    },
    load: (n) => {
      const name = `bot-${saveName(n)}`;
      if (!fs.existsSync(path.join(game.saveDir, `${name}.state.json`))) throw new BotError(`no save named ${JSON.stringify(n)}`);
      game.load(name);
      return [n];
    },
  };

  const reads: Record<string, (...a: unknown[]) => unknown> = {
    state: () => {
      const g = game.state;
      return { map: g.mapName, mapId: g.mapId, x: g.x, y: g.y, facing: g.facing, mapWidth: g.mapWidth, mapHeight: g.mapHeight,
        inBattle: g.inBattle, badges: g.badges, badgeCount: g.badgeCount, money: g.money, walkState: g.walkState,
        joyIgnore: g.joyIgnore, playerName: g.playerName, frames: game.frames };
    },
    party: () => game.state.party(), box: () => game.state.box(), bag: () => game.state.bag(),
    battle: () => game.state.battle(), sprites: () => game.state.sprites(), screen: () => game.state.screen(), menu: () => game.state.menu(),
    event: (name) => {
      if (typeof name !== 'string') throw new BotError('event() takes an event name like EVENT_GOT_STARTER');
      try { return game.state.event(name); } catch (e) { throw new BotError((e as Error).message); }
    },
    sym: (name) => {
      if (typeof name !== 'string') throw new BotError('sym() takes a symbol name like wPartyMons');
      try { return sym(name); } catch (e) { throw new BotError((e as Error).message); }
    },
    grid: () => {
      try { return mapGrid(game); } catch (e) { throw new BotError(`grid(): no map loaded yet (${(e as Error).message})`); }
    },
    read: (addr, len) => {
      let a: number;
      if (typeof addr === 'string') { try { a = sym(addr); } catch (e) { throw new BotError((e as Error).message); } }
      else a = int(addr, 0, 0xffff, 'address');
      const n = int(len, 1, 4096, 'length', 1);
      if (a + n > 0x10000) throw new BotError('read past the end of memory (0xFFFF)');
      return Array.from(game.mem.subarray(a, a + n));
    },
  };

  const host = async (name: string, argsJson: string): Promise<string | undefined> => {
    if (!alive) throw new Error('bot stopped');
    noteCall(name === 'jev');
    let args: unknown[];
    try { args = JSON.parse(argsJson); } catch { throw new BotError('bad arguments'); }
    if (!Array.isArray(args)) throw new BotError('bad arguments');
    if (name === 'log') {
      const now = Date.now();
      tokens = Math.min(LOG_BURST, tokens + ((now - lastRefill) / 1000) * LOG_RATE); lastRefill = now;
      if (tokens < 1) { dropped++; return undefined; }
      tokens--;
      const msg = String(args[0]).slice(0, LOG_CHARS);
      log.log(msg);
      game.log('bot', dropped ? `${msg}  (${dropped} earlier lines dropped: too many logs)` : msg);
      return undefined;
    }
    if (name === 'jev') {
      const [state, questions] = args as [unknown, Record<string, JevQuestion>];
      checkJevQuestions(questions);
      const req = { state: state ?? {}, questions };
      // an oversized request is refused before sending: log only its size, so a bot can't fill the disk with it
      const bytes = JSON.stringify(req).length;
      const logged = jev && bytes > jev.maxRequestBytes ? { state: `(${bytes} bytes, not logged)`, questions: Object.fromEntries(Object.keys(questions).map((k) => [k, '(not logged)'])) } : req;
      const t0 = Date.now();
      try {
        if (!jev) throw new JevError('Jev is not available on this host');
        const res = await jev.decide(req.state, questions, `bot-run-${log.id}`);
        log.jev(logged, Date.now() - t0, res);
        return JSON.stringify({ answers: res.answers, usage: res.usage, model: res.model, id: res.id });
      } catch (e) {
        const msg = (e as Error).message;
        log.jev(logged, Date.now() - t0, undefined, msg);
        throw new BotError(msg);
      }
    }
    if (name === 'snapshot') {
      const label = args[0] === '' || args[0] === undefined ? '' : saveName(args[0]);
      if (!log.snapshot(label)) throw new BotError('snapshot limit reached (500 per run)');
      return undefined;
    }
    if (actions[name]) {
      while (game.paused && alive) await new Promise((r) => setTimeout(r, 100));
      if (!alive) throw new Error('bot stopped');
      log.action(name, actions[name](...args));
      return undefined;
    }
    if (reads[name]) {
      log.read(name);
      return JSON.stringify(reads[name](...args));
    }
    throw new BotError(`unknown call ${name}`);
  };

  const done = (async () => {
    try {
      const context = await isolate.createContext();
      await context.global.set('$call', new ivm.Reference(host));
      await context.global.set('$rom', new ivm.ExternalCopy(romData(game)).copyInto());
      await context.eval(BOOTSTRAP);
      const modules = new Map<ivm.Module, string>();
      const cache = new Map<string, ivm.Module>();
      const compile = async (rel: string, src: string) => {
        const m = await isolate.compileModule(src, { filename: `bots/${rel}` });
        modules.set(m, rel); cache.set(rel, m);
        return m;
      };
      const resolve = async (spec: string, referrer: ivm.Module) => {
        if (!spec.startsWith('./') && !spec.startsWith('../')) throw new BotError(`import "${spec}": only relative imports of files in bots/ are allowed`);
        const from = path.posix.dirname(modules.get(referrer) ?? 'bot.js');
        const rel = path.posix.normalize(path.posix.join(from, spec));
        if (rel.startsWith('../') || rel.startsWith('/') || !files.has(rel)) throw new BotError(`import "${spec}": no such file in bots/`);
        return cache.get(rel) ?? compile(rel, files.get(rel)!);
      };
      const entry = await compile('__entry__.js', ENTRY);
      await entry.instantiate(context, resolve);
      await entry.evaluate();
      const run = await entry.namespace.get('run', { reference: true });
      await run.apply(undefined, [], { result: { promise: true } });
      finish('finished');
    } catch (e) {
      if (!alive) return; // stopped on purpose (reload/shutdown): the isolate's error is expected
      const err = e as Error;
      const why = isolate.isDisposed && /memory/i.test(err.message) ? `out of memory (limit ${MEMORY_MB} MB)` : err.stack || err.message;
      finish('error', why);
    }
  })();

  return { log, done, stop: (reason) => finish(reason) };
}

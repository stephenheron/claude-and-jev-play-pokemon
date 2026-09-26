import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import type { Game } from './game.js';
import { progress } from './progress.js';
import { startJevRelay } from './jevrelay.js';

// The bot improver: on start-up and every few minutes, a Claude Code session in a Docker container
// reads the recent run logs, edits a copy of bots/, tests it against the game, and hands it back.
// The host copies the result into bots/ (which hot-reloads the bot). Everything is kept in logs/sessions/<id>/.

export interface ImproverStatus {
  status: 'off' | 'building' | 'idle' | 'running';
  reason?: string;
  session?: string;
  last?: { id: string; applied: boolean; note: string };
  nextAt?: number;
  /** Recent sessions, newest first (shown in the viewer). */
  history?: SessionInfo[];
}

export interface SessionInfo {
  id: string; ended?: string; applied: boolean; note: string;
  /** Claude's closing 2-4 sentences. */
  summary?: string;
  filesChanged?: string[]; costUsd?: number; durationMs?: number;
  /** A long root-cause session, run after several sessions without game progress. */
  deep?: boolean;
}

const sessionInfo = (r: Record<string, any>): SessionInfo => ({
  id: r.id, ended: r.ended, applied: !!r.applied, note: String(r.note ?? ''),
  summary: typeof r.claudeSummary === 'string' ? r.claudeSummary.slice(0, 2000) : undefined,
  filesChanged: r.filesChanged, costUsd: r.costUsd, durationMs: r.durationMs, deep: r.deep ? true : undefined,
});

/**
 * What counts as game progress between sessions: badges, story events, Pokémon owned, and maps ever visited.
 * Levels and money are left out on purpose: grinding wild Pokémon in a loop is not progress.
 */
export const progressSignature = (p: ReturnType<typeof progress>, mapsEverVisited: number) =>
  `badges=${p.badges} events=${p.storyEvents} owned=${p.pokedexOwned} maps=${mapsEverVisited}`;

/** Every map any live run has visited (from the run summaries), plus where the game is now. */
function mapsEverVisited(runsDir: string, currentMap: string): Set<string> {
  const maps = new Set<string>([currentMap]);
  if (!fs.existsSync(runsDir)) return maps;
  for (const f of fs.readdirSync(runsDir)) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(runsDir, f, 'summary.json'), 'utf8'));
      for (const m of s.mapsVisited ?? []) maps.add(String(m));
    } catch { /* no summary yet, or unreadable */ }
  }
  return maps;
}

/** How many sessions in a row (newest first, stopping at the last deep session) started with this same progress. */
export function stagnantSessions(sessionsDir: string, signature: string): number {
  let n = 0;
  for (const s of recent(sessionsDir, 100).reverse()) {
    if (s.deep) break;                          // a deep session resets the count, whatever it achieved
    if (s.signature !== signature) break;       // progress was made (or an older session without a signature)
    n++;
  }
  return n;
}

const env = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };

export function startImprover(game: Game, botsDir: string, status: ImproverStatus) {
  const intervalMs = env('IMPROVER_INTERVAL_MIN', 5) * 60_000;
  const timeoutMs = env('IMPROVER_TIMEOUT_MIN', 10) * 60_000;
  // After this many sessions without game progress, the next session is a deep one: a longer, root-cause session.
  const stallSessions = env('IMPROVER_STALL_SESSIONS', 4);
  const deepTimeoutMs = env('IMPROVER_DEEP_TIMEOUT_MIN', 30) * 60_000;
  const root = path.resolve('.');
  const sessionsDir = path.join(root, 'logs', 'sessions');
  const runsDir = path.join(root, 'logs', 'runs');
  let running: { id: string; container: string } | null = null;
  status.history = recent(sessionsDir, 10).reverse().map(sessionInfo);
  let relay: { port: number; token: string } | null = null;
  let image = '';

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    Object.assign(status, { status: 'off', reason: 'no CLAUDE_CODE_OAUTH_TOKEN (run `claude setup-token`)' });
    game.log('improver', `off: ${status.reason}`);
    return { stop() {} };
  }
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    Object.assign(status, { status: 'off', reason: 'Docker is not running' });
    game.log('improver', `off: ${status.reason}`);
    return { stop() {} };
  }

  /** Build the image if its inputs changed (tagged by their hash). */
  const ensureImage = () => new Promise<void>((resolve, reject) => {
    const inputs = ['docker/improver/Dockerfile', 'docker/improver/pokered-test', 'package.json', 'package-lock.json'];
    const hash = crypto.createHash('sha1');
    for (const f of inputs) hash.update(fs.readFileSync(path.join(root, f)));
    image = `pokered-improver:${hash.digest('hex').slice(0, 12)}`;
    if (spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status === 0) return resolve();
    Object.assign(status, { status: 'building' });
    game.log('improver', `building Docker image ${image} (a few minutes the first time)`);
    const p = spawn('docker', ['build', '-f', 'docker/improver/Dockerfile', '-t', image, '.'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`docker build failed: ${err.trim().split('\n').pop()}`))));
  });

  async function session() {
    if (running) { game.log('improver', `skipped: session ${running.id} is still running`); return; }
    const id = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const dir = path.join(sessionsDir, id);
    const container = `pokered-improver-${id}`;
    running = { id, container };
    Object.assign(status, { status: 'running', session: id });
    const t0 = Date.now();
    const result: Record<string, unknown> = { id, started: new Date(t0).toISOString() };
    // Stagnation check: the same progress signature at the start of the last N sessions means the usual short
    // sessions aren't working, so this one gets more time and is told to look for the root cause.
    const now = progress(game);
    const signature = progressSignature(now, mapsEverVisited(runsDir, now.map).size);
    const stagnant = stagnantSessions(sessionsDir, signature);
    const deep = stagnant >= stallSessions;
    const limitMs = deep ? deepTimeoutMs : timeoutMs;
    Object.assign(result, { signature, stagnantSessions: stagnant, deep });
    game.log('improver', `session ${id} started${deep ? ` (deep: no progress for ${stagnant} sessions, ${Math.round(limitMs / 60_000)} minutes)` : ''}`);
    try {
      await ensureImage();
      fs.mkdirSync(path.join(dir, 'workspace'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'scratch'), { recursive: true });
      fs.mkdirSync(runsDir, { recursive: true });
      copyDir(botsDir, path.join(dir, 'before'));
      copyDir(botsDir, path.join(dir, 'workspace', 'bots'));
      game.emu.saveState(path.join(dir, 'live.state.json'));
      const prompt = buildPrompt(game, runsDir, sessionsDir, id, limitMs, deep ? { stagnant, normalMs: timeoutMs, intervalMs } : undefined);
      fs.writeFileSync(path.join(dir, 'prompt.md'), prompt);

      const mounts = [
        `${root}/src:/work/app/src:ro`, `${root}/README.md:/work/app/README.md:ro`, `${root}/roms/red.gb:/work/app/roms/red.gb:ro`,
        `${runsDir}:/work/runs:ro`, `${dir}/live.state.json:/work/live.state.json:ro`,
        `${dir}/workspace/bots:/work/bots`, `${dir}/scratch:/work/scratch`,
      ];
      const childEnv: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN };
      const envArgs = ['-e', 'CLAUDE_CODE_OAUTH_TOKEN']; // passed by name so the token isn't in the process list
      if (relay) { childEnv.OPENROUTER_API_KEY = relay.token; envArgs.push('-e', 'OPENROUTER_API_KEY', '-e', `JEV_BASE_URL=http://host.docker.internal:${relay.port}`); }
      const args = [
        'run', '--rm', '--name', container, '--init',
        '--cpus', '4', '--memory', '6g', '--pids-limit', '1024', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--add-host', 'host.docker.internal:host-gateway',
        ...envArgs, ...mounts.flatMap((m) => ['-v', m]),
        image,
        'claude', '-p', prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions',
        '--model', process.env.IMPROVER_MODEL || 'claude-opus-5-5',
      ];
      const transcript = fs.createWriteStream(path.join(dir, 'transcript.jsonl'));
      const stderr = fs.createWriteStream(path.join(dir, 'stderr.log'));
      let timedOut = false;
      const code = await new Promise<number | null>((resolve) => {
        const p = spawn('docker', args, { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
        p.stdout.pipe(transcript); p.stderr.pipe(stderr);
        // live activity for the viewer: one short line per step Claude takes
        let buf = '';
        p.stdout.on('data', (d: Buffer) => {
          buf += d.toString('utf8');
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i); buf = buf.slice(i + 1);
            for (const a of activity(line)) game.log('claude', a);
          }
        });
        const timer = setTimeout(() => { timedOut = true; spawnSync('docker', ['kill', container], { stdio: 'ignore' }); }, limitMs);
        p.on('close', (c) => { clearTimeout(timer); resolve(c); });
      });
      transcript.end(); stderr.end();

      const final = lastResult(path.join(dir, 'transcript.jsonl'));
      Object.assign(result, { exitCode: code, timedOut, costUsd: final?.total_cost_usd, turns: final?.num_turns, claudeSummary: final?.result });
      if (timedOut) throw new Error(`timed out after ${limitMs / 60_000} minutes: changes discarded`);
      if (code !== 0 || !final || final.is_error) throw new Error(`Claude Code failed (exit ${code}${final?.subtype ? `, ${final.subtype}` : ''}): see stderr.log / transcript.jsonl`);

      // hand the new bot back, unless someone changed bots/ by hand while the session ran
      const before = readTree(path.join(dir, 'before')), now = readTree(botsDir), after = readTree(path.join(dir, 'workspace', 'bots'));
      if (!sameTree(before, now)) throw new Error('bots/ was changed during the session: not applied (see workspace/ and diff.patch)');
      if (!after.has('bot.js')) throw new Error('the session deleted bot.js: not applied');
      checkTested(dir, after);
      const changed = [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f));
      result.filesChanged = changed;
      writeDiff(dir);
      if (!changed.length) { result.applied = false; result.note = 'no changes'; }
      else {
        for (const f of changed) {
          const dest = path.join(botsDir, f);
          if (after.has(f)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, after.get(f)!); }
          else fs.rmSync(dest, { force: true });
        }
        result.applied = true;
        result.note = `applied ${changed.length} file(s): ${changed.join(', ')}`;
      }
    } catch (e) {
      result.applied = false;
      result.note = (e as Error).message;
      writeDiff(dir);
    } finally {
      Object.assign(result, { ended: new Date().toISOString(), durationMs: Date.now() - t0 });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(result, null, 2));
      running = null;
      Object.assign(status, { status: 'idle', session: undefined, last: { id, applied: !!result.applied, note: String(result.note) }, nextAt: nextAt() });
      status.history = [sessionInfo(result), ...(status.history ?? [])].slice(0, 10);
      game.log('improver', `${deep ? 'deep ' : ''}session ${id}: ${result.note}${result.costUsd !== undefined ? ` ($${Number(result.costUsd).toFixed(2)})` : ''}`);
      if (typeof result.claudeSummary === 'string') game.log('improver', `Claude: ${result.claudeSummary.replace(/\s+/g, ' ').slice(0, 600)}`);
    }
  }

  let started = Date.now();
  const nextAt = () => started + Math.ceil((Date.now() - started + 1) / intervalMs) * intervalMs;
  let timer: NodeJS.Timeout | undefined;
  (async () => {
    try {
      if (process.env.OPENROUTER_API_KEY) relay = await startJevRelay({ key: process.env.OPENROUTER_API_KEY });
      await ensureImage();
      Object.assign(status, { status: 'idle' });
      started = Date.now();
      timer = setInterval(() => { status.nextAt = nextAt(); void session(); }, intervalMs);
      void session();
    } catch (e) {
      Object.assign(status, { status: 'off', reason: (e as Error).message });
      game.log('error', `improver: ${(e as Error).message}`);
    }
  })();

  return {
    stop() {
      clearInterval(timer);
      if (running) spawnSync('docker', ['kill', running.container], { stdio: 'ignore' });
    },
  };
}

// --- helpers ------------------------------------------------------------------

const SKIP = (name: string) => name.startsWith('.') || name === 'node_modules';

function copyDir(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else if (e.isFile()) fs.copyFileSync(a, b);
  }
}

/** Relative path -> contents for every regular file (bots/ is small: capped at 5 MB). */
export function readTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  let bytes = 0;
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const s = fs.readFileSync(p, 'utf8');
        bytes += s.length;
        if (bytes > 5 * 1024 * 1024) throw new Error('bots/ is over 5 MB: not applied');
        out.set(path.relative(dir, p).split(path.sep).join('/'), s);
      }
    }
  };
  walk(dir);
  return out;
}

const sameTree = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

/**
 * The session's final bot code must have been tested (a pokered-test run whose code/ matches it exactly),
 * and in that test Jev must have answered at least one question.
 */
export function checkTested(dir: string, after: Map<string, string>) {
  const js = (t: Map<string, string>) => new Map([...t].filter(([f]) => /\.m?js$/.test(f)));
  const finalCode = js(after);
  const testsDir = path.join(dir, 'scratch', 'test-runs');
  const tests = fs.existsSync(testsDir) ? fs.readdirSync(testsDir).sort().reverse() : [];
  const tested = tests.find((t) => fs.existsSync(path.join(testsDir, t, 'summary.json')) && sameTree(js(readTree(path.join(testsDir, t, 'code'))), finalCode));
  if (!tested) throw new Error('the final bot code was never run with pokered-test: not applied');
  const sum = JSON.parse(fs.readFileSync(path.join(testsDir, tested, 'summary.json'), 'utf8'));
  const answered = (sum.jev?.calls ?? 0) - (sum.jev?.errors ?? 0);
  if (answered < 1) throw new Error(`in its test (${tested}), the bot never got an answer from Jev: not applied (Jev has to make the decisions)`);
}

function writeDiff(dir: string) {
  const r = spawnSync('git', ['diff', '--no-index', '--no-color', 'before', 'workspace/bots'], { cwd: dir, encoding: 'utf8' });
  if (r.stdout) fs.writeFileSync(path.join(dir, 'diff.patch'), r.stdout);
}

/** Turn one stream-json line from Claude Code into short, readable activity lines. */
export function activity(line: string): string[] {
  let j: any;
  try { j = JSON.parse(line); } catch { return []; }
  const clip = (t: unknown, n = 300) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };
  const out: string[] = [];
  if (j.type === 'system' && j.subtype === 'init') out.push(`started (${j.model ?? 'default model'})`);
  if (j.type === 'assistant') {
    for (const c of j.message?.content ?? []) {
      if (c.type === 'text' && c.text?.trim()) out.push(`says: ${clip(c.text, 500)}`);
      if (c.type === 'tool_use') {
        const x = c.input ?? {};
        const what = x.command ?? x.file_path ?? x.path ?? x.pattern ?? x.description ?? JSON.stringify(x);
        out.push(`${c.name}: ${clip(String(what).replace(/^\/work\//, ''))}`);
      }
    }
  }
  if (j.type === 'user') {
    for (const c of j.message?.content ?? []) {
      if (c.type === 'tool_result' && c.is_error) out.push(`error: ${clip(Array.isArray(c.content) ? c.content.map((x: any) => x.text ?? '').join(' ') : c.content, 200)}`);
    }
  }
  if (j.type === 'result') out.push(`finished in ${j.num_turns ?? '?'} turns${j.total_cost_usd !== undefined ? `, $${Number(j.total_cost_usd).toFixed(2)}` : ''}`);
  return out;
}

function lastResult(file: string): { type: string; subtype?: string; is_error?: boolean; result?: string; total_cost_usd?: number; num_turns?: number } | undefined {
  if (!fs.existsSync(file)) return undefined;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').reverse();
  for (const l of lines) { try { const j = JSON.parse(l); if (j.type === 'result') return j; } catch { /* partial line */ } }
  return undefined;
}

function recent(dir: string, n: number) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => fs.existsSync(path.join(dir, f, 'summary.json'))).sort().slice(-n)
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f, 'summary.json'), 'utf8')); } catch { return null; } })
    .filter(Boolean);
}

function buildPrompt(game: Game, runsDir: string, sessionsDir: string, id: string, timeoutMs: number, deep?: { stagnant: number; normalMs: number; intervalMs: number }) {
  const runs = recent(runsDir, 8).map((r) => ({
    id: r.id, reason: r.reason, error: r.error?.split('\n')[0], durationMs: r.durationMs, actions: r.actions, jevCalls: r.jev?.calls,
    start: r.progress?.start, end: r.progress?.end,
  }));
  const sessions = recent(sessionsDir, 4).filter((s) => s.id !== id).map((s) => ({ id: s.id, applied: s.applied, deep: s.deep || undefined, note: s.note, claudeSummary: s.claudeSummary }));
  const minutes = (ms: number) => Math.round(ms / 60_000);
  const deepSection = deep ? `
## This is a DEEP session: find the root cause
The game has made no real progress (no new badge, story event, Pokémon owned or map visited) for the last ${deep.stagnant} sessions, about ${minutes(deep.stagnant * deep.intervalMs)} minutes of play. The usual short sessions have been adding small patches without getting past the block, so this one has ${minutes(timeoutMs)} minutes instead of ${minutes(deep.normalMs)}. Spend them on diagnosis before touching code:
- Re-read NOTES.md critically. Its diagnoses and "facts" may be wrong; check each one that matters against evidence before building on it.
- Trace the live runs step by step. In run.jsonl, follow the bot's map and position around the point where progress stops and compare what it pressed with what the game did (the "fn": "game" lines). A position that stays the same while a direction is pressed means the bot's picture of the map is wrong or incomplete, not that Jev chose badly.
- Read the harness source in /work/app/src for what the API really returns: grid() (rows, warps, blockedMoves), state() and sprites() right after a warp, and how frames and waits relate to game time.
- Work out the real route through the current area from data, not memory: rom.maps has every warp and its destination, grid() has walls and blocked moves. Then check whether the bot's mechanics can physically follow that route, and whether it needs an interaction it has no mechanic for (talking to an object, taking an item, a scripted NPC).
- Test for long enough to see the whole traversal: \`pokered-test --frames 60000 --seconds 900\` is about 9 minutes of game time. Start from the live state and from earlier states in /work/runs to reproduce the loop.
- Finish with the mechanics fix that gets past the block, verified in a test that actually passes it, and write the root cause in NOTES.md so the next sessions don't relitigate it. Facts for Jev are still welcome, but a new fact will not fix a walk that hits an invisible wall.
` : '';
  return `You are building a bot that plays Pokémon Red, and the decisions in it are made by Jev. The goal is to beat the game: become Champion. Every session should move the bot closer, judged by the game's real progress: badges, story events, Pokédex, levels, new maps, and fewer runs that get stuck or crash.

## How the bot must work: Jev decides, code carries it out
Jev is a decision model, called with jev() (see "Asking Jev" in the README). It takes some state and typed questions, and returns picks with probabilities. The bot is a decision-making system built around it:
- **Code handles mechanics:** reading the game state, walking to a tile, working menus, advancing text, recovering when stuck.
- **Jev makes every strategic decision:** what to do next (progress, heal, train, catch, shop), where to go, who to talk to, what to do in a battle (which move, switch, item, run), which Pokémon to catch or keep, and how to answer menus and questions.
- **The pattern at each decision point:** collect the options that are actually possible right now, attach useful facts to each one (type matchups, damage estimates, HP, distance, whether it has been tried already and failed), give Jev the relevant state, ask a choice, noul or score question, then carry out its pick. Record what happened, so the next question can include it.
- **Replace hard-coded strategy:** if/else logic that decides what to do, or a fixed route, is a decision Jev should be making. Replace it as you go. Hard-coded logic is fine for mechanics (how to get somewhere), not for strategy (where to go).
- **Write good questions:** give each option a plain description with facts, not just a label. Keep the state to what matters for the decision. Use the probabilities and confidence: if Jev isn't confident, the bot can gather more information or try its second choice after the first one fails.
- **Stay in budget:** call Jev when there's a real choice to make, not on every frame or step. Don't ask again while the situation hasn't changed; cache the answer.

The host checks this: your final code must have been run with pokered-test, and in that test Jev must have answered at least one question. Otherwise the session is not applied.

This session is session ${id}. You have about ${Math.round(timeoutMs / 60_000) - 1} minutes. At ${Math.round(timeoutMs / 60_000)} minutes the session is killed and its changes are thrown away, so leave time to finish.
${deepSection}
## Where things are
- /work/bots: the bot. Edit it here. The entry point is bot.js, and other .js files are helpers it imports with relative paths. When you finish, these files replace the live bot, which restarts with them. The live game carries on from wherever it is, so the bot has to cope with starting at any point in the game.
- /work/bots/NOTES.md: notes that carry over between sessions. Nothing else is remembered. Read it first. Before you finish, update it with what you changed, what you learned, and what to try next.
- /work/app/README.md: the full bot API. Read "Writing a bot", "Getting around" and "Asking Jev". /work/app/src has the harness source, read-only.
- /work/runs/<id>/: logs of the live bot's recent runs, newest last. Each has summary.json (why it ended, and progress at start and end), run.jsonl (every action, plus "fn": "game" lines for what the game itself did: text shown, moves actually used, battles and their results, map changes), jev.jsonl, start.png/end.png, shots/ and code/ (the code that ran).
- /work/live.state.json: the live game as it was when this session started.

## Testing
Run \`pokered-test\` to try the bot in /work/bots against the real game, headless and at maximum speed, starting from the live game. It prints the run summary, and the full log goes to /work/scratch/test-runs/<id>/.
- \`pokered-test --frames 20000 --seconds 120\` controls how long it runs. 20,000 frames is about 3 minutes of game time.
- \`pokered-test --load /work/runs/<id>/end.state.json\` starts from another state.
Always test before you finish. A change that hasn't been tested isn't done. The test summary's jev.calls must be above 0; check jev.jsonl in the test run to see what Jev was asked and what it picked, and whether those questions made sense.

## Rules
- Only change files in /work/bots.
- Bots run in a sandbox: no Node APIs, no npm packages, no timers, and only relative imports within bots/. Everything goes through the API in the README.
- Don't make the live bot call load(). It would undo real progress.
- The bot must not crash. Catch errors and keep playing, because a crash stops the live game until the next session.
- If jev() throws (a bad request or a network error), fall back to a safe default for that decision and keep playing.
- Make one focused, evidence-based improvement per session, rather than a rewrite. Early sessions should build the decision system itself: a reusable way to ask Jev with options and facts, used for the next thing the game needs.

## The live game right now
${JSON.stringify(progress(game), null, 2)}

## Recent live runs (oldest first)
${runs.length ? JSON.stringify(runs, null, 2) : 'none yet'}

## Recent sessions
${sessions.length ? JSON.stringify(sessions, null, 2) : 'none yet: this is the first session'}

When you're done, reply with 2 to 4 sentences: what you changed, which decisions Jev now makes, how the test went, and what should come next.`;
}

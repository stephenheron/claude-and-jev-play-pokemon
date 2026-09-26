import fs from 'node:fs';
import path from 'node:path';
import type { Game } from './game.js';

export type EndReason = 'reload' | 'finished' | 'error' | 'shutdown';

/**
 * Everything one bot run did, in logs/runs/<id>/:
 *   run.jsonl     one line per action (press/hold/wait/frame/save/load/snapshot/log), with the frame, map and
 *                 position after it and a count of the reads (state/screen/...) the bot made since the last action
 *   code/         the bot files exactly as they were when the run started (the code that actually ran)
 *   start.*, end.*  save state + screenshot at both ends (start state + code = a replayable run)
 *   jev.jsonl     every Jev call in full: the state and questions sent, the answers, cost and time taken
 *   shots/        screenshots the bot asked for with snapshot()
 *   summary.json  totals and why the run ended
 */
export class RunLog {
  readonly id: string;
  readonly dir: string;
  private t0 = Date.now();
  private startFrame: number;
  private reads = new Map<string, number>();
  private readsTotal = 0;
  private actions = 0;
  private logLines = 0;
  private maps = new Set<string>();
  private buf: string[] = [];
  private flushTimer: NodeJS.Timeout;
  private shots = 0;
  jevCalls = 0;
  jevErrors = 0;
  jevUsd = 0;
  ended = false;

  constructor(private game: Game, files: Map<string, string>, root = 'logs/runs') {
    const d = new Date(this.t0);
    const pad = (n: number) => String(n).padStart(2, '0');
    this.id = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`;
    this.dir = path.join(root, this.id);
    fs.mkdirSync(path.join(this.dir, 'code'), { recursive: true });
    for (const [rel, src] of files) {
      const out = path.join(this.dir, 'code', rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, src);
    }
    this.startFrame = game.frames;
    game.emu.saveState(path.join(this.dir, 'start.state.json'));
    game.screenshot(path.join(this.dir, 'start.png'));
    this.maps.add(game.state.mapName);
    this.write({ fn: 'start', files: [...files.keys()], map: game.state.mapName, x: game.state.x, y: game.state.y });
    this.flushTimer = setInterval(() => this.flush(), 250);
  }

  /** A read-only call: counted, and attached to the next action. */
  read(fn: string) {
    this.reads.set(fn, (this.reads.get(fn) ?? 0) + 1);
    this.readsTotal++;
  }

  /** Something that advanced the game or had a side effect. */
  action(fn: string, args: unknown[]) {
    const gs = this.game.state;
    this.maps.add(gs.mapName);
    this.actions++;
    const rec: Record<string, unknown> = { fn, args, map: gs.mapName, x: gs.x, y: gs.y };
    if (this.reads.size) { rec.reads = Object.fromEntries(this.reads); this.reads.clear(); }
    this.write(rec);
  }

  log(msg: string) { this.logLines++; this.write({ fn: 'log', msg }); }

  /** A Jev call: the answers (plus cost and time) in run.jsonl, the full request and response in jev.jsonl. */
  jev(req: { state: unknown; questions: Record<string, unknown> }, ms: number, res?: { answers: Record<string, unknown>; usage?: { cost?: number; input_tokens?: number }; model?: string; id?: string }, error?: string) {
    const n = ++this.jevCalls;
    const cost = res?.usage?.cost ?? 0;
    this.jevUsd += cost;
    if (error) this.jevErrors++;
    // the picks only: choice -> option, noul -> probability of yes, score -> position
    const picks = res && Object.fromEntries(Object.entries(res.answers).map(([k, a]) => {
      const x = a as { type: string; choice?: string; noul?: number; score?: number };
      return [k, x.type === 'choice' ? x.choice : x.type === 'noul' ? x.noul : x.score];
    }));
    const rec: Record<string, unknown> = { fn: 'jev', n, questions: Object.keys(req.questions), ms };
    if (picks) Object.assign(rec, { answers: picks, cost, inputTokens: res!.usage?.input_tokens });
    if (error) rec.error = error;
    if (this.reads.size) { rec.reads = Object.fromEntries(this.reads); this.reads.clear(); }
    this.write(rec);
    fs.appendFileSync(path.join(this.dir, 'jev.jsonl'), JSON.stringify({ n, t: Date.now() - this.t0, frame: this.game.frames, ms, request: req, response: res, error }) + '\n');
  }

  /** Screenshot into shots/ (the bot's snapshot()). Returns false once the per-run cap is hit. */
  snapshot(label: string): boolean {
    if (this.shots >= 500) return false;
    this.shots++;
    const name = `${String(this.shots).padStart(4, '0')}${label ? `-${label}` : ''}.png`;
    this.game.screenshot(path.join(this.dir, 'shots', name));
    this.action('snapshot', [name]);
    return true;
  }

  end(reason: EndReason, extra: { error?: string; droppedLogLines?: number } = {}) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.flushTimer);
    const gs = this.game.state;
    this.write({ fn: 'end', reason, ...extra, map: gs.mapName, x: gs.x, y: gs.y });
    this.flush();
    this.game.emu.saveState(path.join(this.dir, 'end.state.json'));
    this.game.screenshot(path.join(this.dir, 'end.png'));
    const summary = {
      id: this.id, reason, ...extra,
      started: new Date(this.t0).toISOString(), ended: new Date().toISOString(), durationMs: Date.now() - this.t0,
      actions: this.actions, reads: this.readsTotal, logLines: this.logLines, screenshots: this.shots,
      jev: { calls: this.jevCalls, errors: this.jevErrors, costUsd: +this.jevUsd.toFixed(6) },
      framesAdvanced: this.game.frames - this.startFrame, mapsVisited: [...this.maps],
    };
    fs.writeFileSync(path.join(this.dir, 'summary.json'), JSON.stringify(summary, null, 2));
  }

  private write(rec: Record<string, unknown>) {
    this.buf.push(JSON.stringify({ t: Date.now() - this.t0, frame: this.game.frames, ...rec }));
  }

  private flush() {
    if (!this.buf.length) return;
    fs.appendFileSync(path.join(this.dir, 'run.jsonl'), this.buf.join('\n') + '\n');
    this.buf = [];
  }
}

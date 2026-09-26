import fs from 'node:fs';
import path from 'node:path';
import { Emulator, type Button } from './emu/emulator.js';
import { Rom } from './game/rom.js';
import { GameState } from './game/state.js';
import { toPng } from './emu/png.js';

export interface GameOptions {
  /** Path to the ROM, or its bytes (default: ROM_PATH or roms/red.gb). */
  rom?: string | Buffer;
  /** 0 = as fast as possible (default), 1 = real time, 2 = double speed, ... */
  speed?: number;
  /** Where save states go (default: saves/). */
  saveDir?: string;
}

export interface GameEvent { t: number; frame: number; kind: string; msg: string }

type FrameListener = (screen: ArrayLike<number>, frame: number) => void;
type EventListener = (e: GameEvent) => void;

/**
 * Pokémon Red in an emulator: raw button hooks plus read-only game state.
 * Button methods run the emulator synchronously. Long-running scripts should
 * `await game.yield()` between actions so the viewer/stream stay responsive and pause works.
 */
export class Game {
  readonly emu: Emulator;
  readonly rom: Rom;
  /** Live game state read from memory (map, position, party, bag, battle, screen text, ...). */
  readonly state: GameState;
  readonly saveDir: string;
  speed: number;
  /** Set by the viewer's pause button (or by you): `yield()` waits while it's true. */
  paused = false;

  private frameListeners = new Set<FrameListener>();
  private eventListeners = new Set<EventListener>();
  private sleepCell = new Int32Array(new SharedArrayBuffer(4));
  private paceStart = Date.now();
  private paceFrames = 0;
  private slicesPerSec: number;

  constructor(opts: GameOptions = {}) {
    const romBuf = Buffer.isBuffer(opts.rom) ? opts.rom : fs.readFileSync(opts.rom ?? process.env.ROM_PATH ?? 'roms/red.gb');
    this.emu = new Emulator(romBuf);
    this.rom = new Rom(romBuf);
    this.state = new GameState(this.emu, this.rom);
    this.saveDir = opts.saveDir ?? 'saves';
    this.speed = opts.speed ?? 0;
    // serverboy's doFrame is one CPU slice (~0.48 Game Boy frames): real time ≈ 125 slices/s
    this.slicesPerSec = 4194304 / (this.emu.core.baseCPUCyclesPerIteration || 33554.432);
    this.emu.onFrame = (screen, frame) => {
      for (const l of this.frameListeners) l(screen, frame);
      this.pace(frame);
    };
  }

  // --- raw hooks -----------------------------------------------------------

  /** Advance one frame, optionally holding buttons during it. */
  frame(hold: Button[] = []) { this.emu.frame(hold); }
  /** Advance n frames with no buttons held. */
  wait(frames: number) { this.emu.wait(frames); }
  /** Tap a button: hold it for `hold` frames, then release for `release` frames. */
  press(button: Button, hold = 4, release = 8) { this.emu.press(button, hold, release); }
  /** Hold a button for n frames. */
  hold(button: Button, frames: number) { this.emu.hold(button, frames); }

  /** Work RAM, readable at CPU addresses. Look addresses up with `sym()`. */
  get mem(): Uint8Array { return this.emu.mem; }
  get frames() { return this.emu.frames; }
  /** The current screen as 160x144 RGBA. */
  screen(): ArrayLike<number> { return this.emu.screen(); }
  /** The current screen as a PNG (written to `file` when given). */
  screenshot(file?: string): Buffer {
    const png = toPng(this.emu.screen());
    if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, png); }
    return png;
  }

  // --- save states ---------------------------------------------------------

  save(name: string) {
    fs.mkdirSync(this.saveDir, { recursive: true });
    this.emu.saveState(`${this.saveDir}/${name}.state.json`);
    this.log('save', `saved ${name}`);
  }

  load(name: string) {
    this.emu.loadState(`${this.saveDir}/${name}.state.json`);
    this.log('save', `loaded ${name}`);
  }

  // --- scheduling and listeners ---------------------------------------------

  /** Let the event loop run (viewer, stream, sockets) and wait here while paused. */
  async yield() {
    do await new Promise((r) => setImmediate(r));
    while (this.paused);
  }

  onFrame(fn: FrameListener) { this.frameListeners.add(fn); return () => { this.frameListeners.delete(fn); }; }
  onEvent(fn: EventListener) { this.eventListeners.add(fn); return () => { this.eventListeners.delete(fn); }; }

  log(kind: string, msg: string) {
    const e = { t: Date.now(), frame: this.emu.frames, kind, msg };
    for (const l of this.eventListeners) l(e);
  }

  /** Sleep to hold `speed` on a fixed timeline (catches up after slow code instead of drifting). */
  private pace(frame: number) {
    if (this.speed <= 0 || frame % 4 !== 0) return;
    this.paceFrames += 4;
    const target = this.paceStart + (this.paceFrames * 1000) / (this.slicesPerSec * this.speed);
    const now = Date.now();
    if (target > now) Atomics.wait(this.sleepCell, 0, 0, target - now); // real sleep, no CPU burn
    else if (now - target > 250) { this.paceStart = now; this.paceFrames = 0; } // far behind: resync
  }
}

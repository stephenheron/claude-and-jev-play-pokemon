import type { Game } from '../game.js';
import { Worker } from 'node:worker_threads';
import { PanelRenderer, PANEL_W, PANEL_H } from './panel.js';

const AUDIO_RING = 44100 * 4; // 4 seconds

/** Headless live stream: game screen + side panel → ffmpeg → RTMP (YouTube/Twitch) or a local file. */
export class Streamer {
  private frame = new SharedArrayBuffer(160 * 144 * 4);
  private panel = new SharedArrayBuffer(PANEL_W * PANEL_H * 4);
  private frameView = new Uint8Array(this.frame);
  private panelView = new Uint8Array(this.panel);
  private renderer: PanelRenderer;
  // audio ring: interleaved stereo float32, written by the main thread, read by the worker
  private audio = new SharedArrayBuffer(AUDIO_RING * 2 * 4);
  private audioView = new Float32Array(this.audio);
  private audioPos = new SharedArrayBuffer(4);
  private audioPosView = new Int32Array(this.audioPos);
  private wpos = 0;
  private worker: Worker;

  constructor(url: string, rom: Uint8Array, onLog: (msg: string) => void, fps = 30) {
    this.renderer = new PanelRenderer(rom);
    this.setPanel(['# POKEMON RED', '', 'starting...']);
    this.worker = new Worker(new URL('./worker.mjs', import.meta.url), {
      workerData: { frameBuf: this.frame, panelBuf: this.panel, panelW: PANEL_W, panelH: PANEL_H, url, fps, audioBuf: this.audio, audioPosBuf: this.audioPos, audioRing: AUDIO_RING },
    });
    this.worker.on('message', (m) => m.type === 'log' && onLog(m.msg));
    this.worker.on('error', (e: Error) => onLog(`stream worker error: ${e.message}`));
  }

  get cols() { return this.renderer.cols; }

  pushAudio(l: number, r: number) {
    const i = this.wpos % AUDIO_RING;
    this.audioView[i * 2] = l; this.audioView[i * 2 + 1] = r;
    this.wpos++;
    if ((this.wpos & 255) === 0) Atomics.store(this.audioPosView, 0, this.wpos);
  }

  pushFrame(rgba: ArrayLike<number>) {
    this.frameView.set(rgba as ArrayLike<number>);
  }

  setPanel(lines: string[]) {
    this.panelView.set(this.renderer.render(lines));
  }

  stop() { this.worker.postMessage('stop'); }
}

/** Word-wrap for the monospace panel. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      if ((line + ' ' + w).trim().length > width) { if (line) out.push(line); line = w; } else line = (line + ' ' + w).trim();
    }
    out.push(line);
  }
  return out;
}

/**
 * Stream the game (video, audio, and a side panel with location and team) to `url`:
 * an rtmp:// address (YouTube/Twitch) or a local file such as test.mkv. Needs ffmpeg on the PATH.
 * Default url: STREAM_URL, or YouTube when YOUTUBE_STREAM_KEY is set.
 */
export function startStream(game: Game, url = process.env.STREAM_URL ?? (process.env.YOUTUBE_STREAM_KEY ? `rtmp://a.rtmp.youtube.com/live2/${process.env.YOUTUBE_STREAM_KEY}` : undefined)) {
  if (!url) throw new Error('startStream: no url (set STREAM_URL or YOUTUBE_STREAM_KEY)');
  const streamer = new Streamer(url, game.rom.b, (m) => game.log('stream', m));
  game.emu.onAudio = (l, r) => streamer.pushAudio(l, r);
  game.emu.enableAudioTap();
  const panel = () => {
    const gs = game.state, W = streamer.cols;
    const lines = ['# POKEMON RED', `~ ${gs.badgeCount} badges | ¥${gs.money.toLocaleString('en-US')}`, '', '# WHERE', gs.mapName.replace(/_/g, ' '), '', '# TEAM'];
    // "SPECIES (NICK)" when it has a nickname; stats right-aligned so the columns line up
    for (const p of gs.party()) {
      const nm = p.nickname && p.nickname !== p.species ? `${p.species} (${p.nickname})` : p.species;
      const stats = `Lv${String(p.level).padEnd(3)}${String(p.hp).padStart(3)}/${String(p.maxHp).padEnd(3)}`;
      const w = Math.max(10, W - stats.length - 1);
      lines.push(`${nm.slice(0, w).padEnd(w)} ${stats}`);
    }
    if (game.paused) lines.push('', '~ paused');
    streamer.setPanel(lines);
  };
  let lastPanel = 0;
  const off = game.onFrame((screen, frame) => {
    if (frame % 2 === 0) streamer.pushFrame(screen);
    const now = Date.now();
    if (now - lastPanel >= 1000) { lastPanel = now; panel(); }
  });
  return { stop() { off(); game.emu.onAudio = undefined; streamer.stop(); } };
}

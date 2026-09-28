import fs from 'node:fs';
import path from 'node:path';
import type { Game } from './game.js';
import { progress } from './progress.js';

// The end of the game: EVENT_BEAT_CHAMPION_RIVAL is set only by the Champion's room script, after the battle is won
// (vendor/pokered/scripts/ChampionsRoom.asm). The flag is in RAM and the game resets to the title screen after the
// Hall of Fame, so the moment it is seen it is written to logs/champion.json, which then stays the record of it.
// While that file exists the improver starts no more sessions. Delete it (or `npm start -- --fresh`) to undo.

export const CHAMPION_FILE = path.join('logs', 'champion.json');

export const championBeaten = () => fs.existsSync(CHAMPION_FILE);

/** Check the flag every few seconds; on first sight write logs/champion.json. */
export function watchChampion(game: Game, everyMs = 2000) {
  const timer = setInterval(() => {
    if (championBeaten()) return clearInterval(timer);
    let beaten = false;
    try { beaten = game.state.event('EVENT_BEAT_CHAMPION_RIVAL'); } catch { return; }
    if (!beaten) return;
    try {
      fs.mkdirSync(path.dirname(CHAMPION_FILE), { recursive: true });
      fs.writeFileSync(CHAMPION_FILE, JSON.stringify({ at: new Date().toISOString(), ...progress(game) }, null, 2));
    } catch (e) { game.log('error', `could not write ${CHAMPION_FILE}: ${(e as Error).message}`); return; }
    clearInterval(timer);
    game.log('info', `Champion beaten! Wrote ${CHAMPION_FILE}; the improver starts no more sessions`);
  }, everyMs);
  return { stop: () => clearInterval(timer) };
}

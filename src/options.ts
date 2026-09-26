import type { Game } from './game.js';

// House rules, as in the original project: before a new game starts, the host opens OPTION from the title menu
// and sets text speed FAST and battle animations OFF. Only button presses: the harness never writes memory.

const FAST_NO_ANIMATIONS = 0x81; // wOptions: text delay 1 (fast) + bit 7 (battle animations off)
export const optionsSet = (game: Game) => (game.state.u8('wOptions') & 0x8f) === FAST_NO_ANIMATIONS;

/** Row of the first screen line containing `text`, or -1. */
const rowOf = (game: Game, text: string) => game.state.screen().rows.findIndex((r) => r.includes(text));

/**
 * From a freshly booted game (title screen), set the options and come back to the title menu with the cursor
 * on NEW GAME. Returns false if the menus didn't look as expected (the bot then just plays with the defaults).
 */
export function setupOptions(game: Game): boolean {
  const tap = (b: 'A' | 'B' | 'START' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', wait = 20) => game.press(b, 4, wait);
  // press START through the intro and title screen until the NEW GAME / OPTION menu is up
  for (let i = 0; i < 120 && !(rowOf(game, 'NEW GAME') >= 0 && rowOf(game, 'OPTION') >= 0 && game.state.screen().cursor); i++) tap('START', 30);
  if (rowOf(game, 'OPTION') < 0) return false;
  const moveTo = (text: string) => {
    for (let i = 0; i < 8; i++) {
      const cur = game.state.screen().cursor, row = rowOf(game, text);
      if (!cur || row < 0) return false;
      if (cur.y === row) return true;
      tap(cur.y < row ? 'DOWN' : 'UP', 12);
    }
    return false;
  };
  if (!optionsSet(game)) {
    if (!moveTo('OPTION')) return false;
    tap('A', 40);
    if (rowOf(game, 'TEXT SPEED') < 0) return false;
    // cursor starts on TEXT SPEED: left twice reaches FAST; then down to BATTLE ANIMATION and right for OFF
    for (const b of ['LEFT', 'LEFT', 'DOWN', 'RIGHT'] as const) tap(b, 12);
    tap('B', 40);
    game.log('info', optionsSet(game) ? 'options set: text speed FAST, battle animations OFF' : `options: unexpected value ${game.state.u8('wOptions').toString(16)}`);
  }
  // leave the cursor on NEW GAME, so a bot pressing A starts the game rather than reopening OPTION
  if (rowOf(game, 'NEW GAME') >= 0) moveTo('NEW GAME');
  return optionsSet(game);
}

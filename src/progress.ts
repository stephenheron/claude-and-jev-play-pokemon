import type { Game } from './game.js';
import { sym } from './game/symbols.js';

const bits = (mem: Uint8Array, from: number, to: number) => {
  let n = 0;
  for (let a = from; a < to; a++) for (let b = mem[a]; b; b &= b - 1) n++;
  return n;
};

/** How far along the game is, from memory: for comparing runs (did a change help?). */
export function progress(game: Game) {
  const gs = game.state, mem = game.mem;
  const party = gs.party();
  return {
    map: gs.mapName,
    badges: gs.badgeCount,
    storyEvents: bits(mem, sym('wEventFlags'), sym('wEventFlags') + 0x140), // story/trainer event flags set so far
    pokedexOwned: bits(mem, sym('wPokedexOwned'), sym('wPokedexOwnedEnd')),
    pokedexSeen: bits(mem, sym('wPokedexSeen'), sym('wPokedexSeenEnd')),
    party: party.map((p) => `${p.species} Lv${p.level}`),
    maxLevel: Math.max(0, ...party.map((p) => p.level)),
    money: gs.money,
  };
}

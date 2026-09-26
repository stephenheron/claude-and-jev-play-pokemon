import type { Game } from './game.js';
import { buildGrid, DIRS, type Dir } from './game/world.js';

// What bots see of the current map: which squares can be walked on (pathfinding is the bot's job).
// Coordinates are the same squares as state().x / state().y (one step of the player).

export const LEGEND: Record<string, string> = {
  '.': 'walkable', '#': 'wall or obstacle', ',': 'tall grass (walkable, wild Pokémon)', '~': 'water (needs SURF)',
  T: 'cuttable tree (needs CUT)', C: 'counter (talk across it)', v: 'ledge: jump down over it', '<': 'ledge: jump left over it',
  '>': 'ledge: jump right over it', '^': 'ledge: jump up over it', D: 'door, stairs or warp', N: 'NPC or object', '@': 'you',
};
const LEDGE_CHAR: Record<Dir, string> = { down: 'v', left: '<', right: '>', up: '^' };

/** The current map as rows of characters (see LEGEND), plus warps and NPCs with coordinates. */
export function mapGrid(game: Game) {
  const gs = game.state;
  const g = buildGrid(game.emu, game.rom, gs);
  const cells: string[][] = [];
  for (let y = 0; y < g.h; y++) {
    const row: string[] = [];
    for (let x = 0; x < g.w; x++) {
      row.push(g.water(x, y) ? '~' : g.cuttable(x, y) ? 'T' : g.counter(x, y) ? 'C' : !g.walkable(x, y) ? '#' : g.grass(x, y) ? ',' : '.');
    }
    cells.push(row);
  }
  // a ledge square shows the direction you jump over it
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    for (const d of Object.keys(DIRS) as Dir[]) {
      if (!g.ledge(x, y, d)) continue;
      const [dx, dy] = DIRS[d];
      if (cells[y + dy]?.[x + dx] !== undefined) cells[y + dy][x + dx] = LEDGE_CHAR[d];
    }
  }
  const md = game.rom.maps.get(gs.mapId);
  const warps = (md?.warps ?? []).map((w) => ({ x: w.x, y: w.y, to: game.rom.maps.get(w.destMap)?.name ?? (w.destMap === 0xff ? 'the previous map' : `map ${w.destMap}`) }));
  const npcs = gs.sprites().filter((s) => !s.hidden).map((s) => ({ index: s.index, x: s.x, y: s.y }));
  const put = (x: number, y: number, c: string) => { if (cells[y]?.[x] !== undefined) cells[y][x] = c; };
  for (const w of warps) put(w.x, w.y, 'D');
  for (const n of npcs) put(n.x, n.y, 'N');
  put(gs.x, gs.y, '@');
  return {
    map: gs.mapName, width: g.w, height: g.h, player: { x: gs.x, y: gs.y },
    rows: cells.map((r) => r.join('')),
    legend: LEGEND,
    warps, npcs,
    exits: (md?.connections ?? []).map((c) => ({ side: c.dir, to: game.rom.maps.get(c.map)?.name ?? `map ${c.map}` })),
  };
}

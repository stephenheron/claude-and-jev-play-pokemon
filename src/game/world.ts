import type { Emulator } from '../emu/emulator.js';
import type { Rom } from './rom.js';
import type { GameState } from './state.js';
import { sym, mapName } from './symbols.js';

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const FACING_TO_DIR: Record<number, Dir> = { 0x0: 'down', 0x4: 'up', 0x8: 'left', 0xc: 'right' };

export interface Grid {
  mapId: number; w: number; h: number; tileset: number;
  tile: (x: number, y: number) => number;       // collision tile (bottom-left of 16x16 square)
  walkable: (x: number, y: number) => boolean;
  grass: (x: number, y: number) => boolean;
  water: (x: number, y: number) => boolean;
  cuttable: (x: number, y: number) => boolean;
  counter: (x: number, y: number) => boolean;
  ledge: (x: number, y: number, d: Dir) => boolean; // can jump from (x,y) moving d
  pairBlocked: (a: number, b: number) => boolean;
  spinners?: Map<string, { x: number; y: number }>;
}

const WATER_TILESETS = new Set([0, 3, 5, 7, 13, 14, 17, 22, 23]);

/** Builds a walkability grid for the CURRENT map from live WRAM + ROM tileset data. */
export function buildGrid(emu: Emulator, rom: Rom, gs: GameState): Grid {
  const m = emu.mem, r = rom.b;
  const W = gs.mapWidth, H = gs.mapHeight, tileset = gs.u8('wCurMapTileset');
  const bank = gs.u8('wTilesetBank');
  const blocksPtr = rom.flat(bank, m[sym('wTilesetBlocksPtr')] | (m[sym('wTilesetBlocksPtr') + 1] << 8));
  const collPtr = m[sym('wTilesetCollisionPtr')] | (m[sym('wTilesetCollisionPtr') + 1] << 8);
  const passable = new Set<number>();
  for (let a = rom.flat(bank, collPtr); r[a] !== 0xff; a++) passable.add(r[a]);
  const grassTile = gs.u8('wGrassTile');
  const tsHeader = sym('Tilesets') + tileset * 12;
  const counters = new Set([r[tsHeader + 7], r[tsHeader + 8], r[tsHeader + 9]].filter((t) => t !== 0xff));
  const ow = sym('wOverworldMap');

  const tile = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W * 2 || y >= H * 2) return -1;
    const block = m[ow + ((y >> 1) + 3) * (W + 6) + (x >> 1) + 3];
    return r[blocksPtr + block * 16 + ((y & 1) * 2 + 1) * 4 + (x & 1) * 2];
  };

  // ledges: (facing, standing tile, ledge tile, input)
  const ledges: { dir: Dir; stand: number; ledge: number }[] = [];
  if (tileset === 0) {
    for (let a = sym('LedgeTiles'); r[a] !== 0xff; a += 4) ledges.push({ dir: FACING_TO_DIR[r[a]], stand: r[a + 1], ledge: r[a + 2] });
  }
  const pairs: [number, number][] = [];
  for (let a = sym('TilePairCollisionsLand'); r[a] !== 0xff; a += 3) if (r[a] === tileset) pairs.push([r[a + 1], r[a + 2]]);

  return {
    mapId: gs.mapId, w: W * 2, h: H * 2, tileset, tile,
    walkable: (x, y) => passable.has(tile(x, y)),
    grass: (x, y) => grassTile !== 0xff && tile(x, y) === grassTile,
    water: (x, y) => WATER_TILESETS.has(tileset) && tile(x, y) === 0x14,
    cuttable: (x, y) => (tileset === 0 && tile(x, y) === 0x3d) || (tileset === 7 && tile(x, y) === 0x50),
    counter: (x, y) => counters.has(tile(x, y)),
    ledge: (x, y, d) => {
      const [dx, dy] = DIRS[d];
      const s = tile(x, y), l = tile(x + dx, y + dy);
      return ledges.some((e) => e.dir === d && e.stand === s && e.ledge === l);
    },
    pairBlocked: (a, b) => pairs.some(([p, q]) => (p === a && q === b) || (p === b && q === a)),
    spinners: rom.spinners.get(gs.mapId),
  };
}

export { mapName };

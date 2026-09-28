let cardKeyOffers = 0;
const talkMiss = {}; // map|x,y -> walk/talk attempts that never reached the target (NOT reset by movement, unlike destFail)
// Bot: intro -> walk to Oak -> Jev picks the starter -> fight rival (mechanics fallback).
import { isNamePrompt, askChoice, askChoiceP } from './helpers.js';

// state().badges is the badge BITMASK (Boulder=1, Cascade=2 -> 3 after Misty); keep the bitmask as badgeBits and make badges a count.
// PP facts for the gym-leader option: the lead's damaging moves and whether its strong ones are empty (heal first?)
function leaderPpFact() {
  try {
    const lead = party()[0]; if (!lead) return '';
    const dm = (lead.moves || []).filter(x => x && (x.power || 0) > 0);
    if (!dm.length) return '';
    const typed = dm.filter(x => x.type !== 'NORMAL'); const strong = typed.length ? typed : dm.filter(x => (x.power || 0) >= 60);
    const txt = dm.map(x => `${x.name} ${x.type} pow ${x.power} PP ${x.pp}/${x.maxPp}`).join(', ');
    const empty = strong.length > 0 && strong.every(x => (x.pp || 0) === 0);
    const low = strong.length > 0 && strong.reduce((a, x) => a + (x.pp || 0), 0) <= 5;
    return `. Lead ${lead.species}'s attacks: ${txt}` + (empty ? `. ALL its strong attacks are at 0 PP: vs the leader it could only use weak moves; HEAL FIRST (leave the gym, Pokemon Center restores PP) then come back` : low ? `. Its strong attacks are almost out of PP: consider healing at the Pokemon Center first` : '');
  } catch (e) { return ''; }
}
function gstate() { const r = state(); if (!r || typeof r.badges !== 'number') return r; const s = Object.assign({}, r); s.badgeBits = r.badges; let n = 0; for (let b = r.badges; b; b >>= 1) n += b & 1; s.badges = n; return s; }
const DIRS = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
// 'D' (warp) tiles are NOT walkable unless they are the target: stepping on another ladder/door warps you away (Mt Moon B1F -> back to 1F).
const WALK = new Set(['.', ',', '@']);
const LEDGE = { v: 'DOWN', '<': 'LEFT', '>': 'RIGHT', '^': 'UP' };

function intro() {
  for (let i = 0; i < 400; i++) {
    const s = screen(), st = gstate();
    if (st.playerName === 'RED' && st.map === 'REDS_HOUSE_2F' && s.nonMapTiles === 0) break;
    if (isNamePrompt(s)) { press('DOWN'); press('A', 4, 20); continue; }
    press(s.hasTextBox || s.cursor ? 'A' : 'START', 4, 20);
  }
  wait(60);
}

// Session 20260927-040725 ROOT CAUSE of the B3F stall: arrow (spinner) tiles look like plain floor '.' in gridX().rows, and
// gridX() has no spinner data, so pathDir routed B3F (18,15)->(19,18) over (18,16), an arrow that throws you back to (18,15).
// Table dumped from the ROM (harness rom.ts loadSpinners: RocketHideout2/3ArrowTilePlayerMovement, ViridianGym...):
// "x,y" of an arrow tile -> where the forced movement stops. pathDir treats stepping onto one as a jump there.
const SPIN_RAW = {
  ROCKET_HIDEOUT_B2F: '4,9>2,9 4,11>8,11 4,15>8,11 4,16>8,11 4,19>2,19 4,22>2,19 5,14>9,16 6,22>6,20 6,24>6,20 8,9>2,9 8,12>8,11 8,15>8,11 8,19>2,19 8,23>2,19 9,14>9,16 9,22>9,24 10,9>2,9 10,10>2,9 10,15>2,9 10,17>14,15 10,19>14,15 10,25>14,25 11,14>15,18 11,16>15,18 11,18>11,20 12,9>2,9 12,11>2,9 12,13>2,9 12,17>14,15 13,10>14,12 13,12>14,12 13,16>15,18 13,18>11,20 13,19>14,15 13,22>9,24 13,23>2,19 14,17>14,15 15,16>15,18 16,14>16,13 16,16>16,13 16,18>16,13 17,10>14,12 17,11>2,9',
  ROCKET_HIDEOUT_B3F: '10,13>14,13 10,19>18,15 11,18>15,22 12,11>10,11 12,17>18,15 12,20>18,15 13,16>17,16 14,11>16,11 14,15>18,15 14,17>18,15 14,19>18,15 15,16>17,16 15,18>15,22 16,13>16,11 17,12>17,16 18,16>18,15',
  VIRIDIAN_GYM: '19,11>19,2 19,1>11,1 18,2>18,11 11,2>17,2 16,10>16,12 4,6>4,13 5,13>13,13 4,14>13,14 0,15>0,7 1,15>1,9 13,16>7,16 13,17>1,17',
};
const SPINNERS = {};
for (const [m, s] of Object.entries(SPIN_RAW)) { SPINNERS[m] = {}; for (const e of s.split(' ')) { const [a, b] = e.split('>'); SPINNERS[m][a] = b.split(',').map(Number); } }

// Session 20260927-145511 ROOT CAUSE (Route 20 / Cinnabar): the harness marks only tile 0x14 as water '~'. The game (pokered
// CollisionCheckOnWater) also keeps you surfing over tile 0x32, the "eastern coastline" tile, outside the ship-port tileset.
// Route 20's x=62 column is that tile: it shows as '#' but the bot surfed through (62,4) in run 151833. So the sea east of x=62
// DOES connect to rows 14-16 west -> CINNABAR without Seafoam. Outdoors, a '#' with water on both horizontal sides is treated as
// water; if the game refuses the step, walkTo's LEARNED_BLOCKS handles it.
function gridX() {
  const g = grid();
  try {
    if (g && g.rows && /^(ROUTE_|CINNABAR|PALLET|FUCHSIA|VERMILION|CERULEAN)/.test(g.map || '')) {
      let changed = false; const rows = g.rows.map(r => r.split(''));
      // Session 20260927-200016 ROOT CAUSE (Route 23 heal trip, live 205616): the player's own tile reads '@', not '~', so the '#'
      // next to a SURFING player was never converted while the same '#' one step away was -> pathDir flipped UP/DOWN between (9,78)
      // and (9,79) for minutes. While surfing, '@' counts as water here so the picture of the map doesn't change as we move.
      let surf = false; try { surf = state().walkState === 2; } catch (e) {}
      // ROUTE_23 is excluded: test 200214 bumped every converted '#' there ((8,79) (7,95) (9,103)); they are real rocks in the water.
      const isW = c => c === '~' || (surf && c === '@');
      for (let y = 0; y < rows.length; y++) for (let x = 1; x < rows[y].length - 1; x++)
        if ((g.map !== 'ROUTE_20' || y <= 4) && g.map !== 'ROUTE_23' && g.rows[y][x] === '#' && isW(g.rows[y][x - 1]) && isW(g.rows[y][x + 1])) { rows[y][x] = '~'; changed = true; }
      // Session 20260927-153012 (CONFIRMED by probe): the Route 20 pocket west of Seafoam (water x=44-54 y=2-12 + island land x=46-61
      // y=2-9, doors (48,5)) is SEALED: LEFT refused at x=43 (rows 2,12), DOWN refused on row 12 at every x=44..54, RIGHT at (54,12).
      // Its only sea exit is the coastline tile (62,4) (bot surfed (63,4)->(62,4)->(61,4) in run 151833). It shows '#' with LAND to
      // its left, so the rule above never converted it and walkEdge east just held RIGHT at (61,4) forever. Mark it water so walkTo SURFs.
      if (g.map === 'ROUTE_20' && rows[4] && rows[4][62] === '#') { rows[4][62] = '~'; changed = true; }
      if (changed) g.rows = rows.map(r => r.join(''));
    }
  } catch (e) {}
  return g;
}
// BFS over grid() to a target tile; returns the first direction or null.
// Steps the game refused although gridX() called them walkable (session 20260927-104730: 5F (21,14) DOWN). Key "MAP:x,y,DIR".
const LEARNED_BLOCKS = new Set();
const MANSION_DUMPED = new Set();
function pathDir(g, tx, ty) {
  const { width: w, height: h } = g, sx = g.player.x, sy = g.player.y;
  const spin = SPINNERS[g.map] || null;
  const blocked = new Set((g.blockedMoves || []).map(b => `${b.x},${b.y},${b.dir.toUpperCase()}`));
  for (const k of LEARNED_BLOCKS) if (k.startsWith(g.map + ':')) blocked.add(k.slice(g.map.length + 1));
  const ok = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (WALK.has(g.rows[y][x]) || (x === tx && y === ty));
  const prev = new Map([[`${sx},${sy}`, null]]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) {
      let k = `${x},${y}`, d = null;
      while (prev.get(k)) { const p = prev.get(k); d = p.d; k = p.k; }
      return d;
    }
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      let nx = x + dx, ny = y + dy;
      // ledges are one-way: stepping onto a ledge in its direction jumps over it (lands 2 tiles away)
      const lc = ny >= 0 && ny < h && nx >= 0 && nx < w ? g.rows[ny][nx] : '#';
      if (LEDGE[lc]) { if (LEDGE[lc] !== d) continue; nx += dx; ny += dy; }
      if (spin && spin[`${nx},${ny}`] && !(nx === tx && ny === ty)) { if (!ok(nx, ny) || blocked.has(`${x},${y},${d}`)) continue; [nx, ny] = spin[`${nx},${ny}`]; }
      const nk = `${nx},${ny}`;
      if (prev.has(nk) || !ok(nx, ny) || blocked.has(`${x},${y},${d}`)) continue;
      prev.set(nk, { k: `${x},${y}`, d }); q.push([nx, ny]);
    }
  }
  return null;
}

function isStartMenu(s) { const sig = ((s && s.rows) || []).join('|'); return !!(s && s.cursor && !s.waitingForA && /EXIT/.test(sig) && /ITEM|SAVE|OPTION|POK.DEX/.test(sig)); }
// Session 20260927-173513: Cinnabar Gym quiz machines ask YES/NO questions; they were A-mashed (always YES). Now Jev answers
// (a right answer opens the door without a battle). Mechanics only: detect the YES/NO box, press DOWN for NO, then A.
const QUIZ_CACHE = {};
// Session 20260927-175514: live 185114 vs BLAINE: Gastly Lv23 fought PONYTA Lv40 with NIGHT SHADE while trapped by FIRE SPIN; Jev
// was never told how the bench member itself fares (level gap, type damage taken, HP ratio). Add those facts to outleveled switches.
function outLevelFacts(q, b) {
  try {
    let res = 1; try { res = Math.max(...(b.enemy.types || []).map(t => rom.effectiveness(t, q.types || []))); } catch (z) {}
    const gap = (q.level || 0) - (b.enemy.level || 0);
    const hpPct = Math.round(100 * (q.hp || 0) / Math.max(1, q.maxHp || 1));
    const trapped = /FIRE SPIN|WRAP|BIND|CLAMP/.test((lastTexts || []).slice(-6).join(' ')) ? ' Our lead is currently caught in a trapping move, losing HP each turn.' : '';
    return ` Facts: ${q.species} is ${(q.types || []).join('/') || '?'}, takes x${res} from the enemy's ${(b.enemy.types || []).join('/')} type; level ${gap >= 0 ? '+' : ''}${gap} vs the enemy (${gap >= 15 ? 'big level advantage, likely wins even vs a type disadvantage' : gap >= 0 ? 'even-ish' : 'also outleveled'}); HP ${hpPct}%.${trapped}`;
  } catch (e) { return ''; }
}
function quizAnswer() {
  try {
    if (gstate().map !== 'CINNABAR_GYM') return false;
    const s = screen(), rows = s.rows || [], txt = rows.join(' ');
    if (!/\bYES\b/.test(txt) || !/\bNO\b/.test(txt) || !s.cursor) return false;
    const q = (lastTexts.slice(-4).join(' ') + ' ' + rows.join(' ').replace(/\b(YES|NO)\b/g, '')).replace(/[▶►]/g, '').replace(/\s+/g, ' ').trim().slice(-300);
    let a = QUIZ_CACHE[q];
    if (!a) {
      a = askChoice({ where: 'Cinnabar Gym quiz machine (Pokemon Red, Gen 1 facts)', question: q, note: 'A right answer opens the next door with no battle; a wrong answer starts a trainer battle.' },
        'Answer the quiz question on screen with YES or NO (Pokemon Red Gen 1 knowledge).',
        { YES: 'Answer YES: the statement/question is true', NO: 'Answer NO: the statement/question is false' }, 'YES');
      QUIZ_CACHE[q] = a;
    }
    log(`quiz: "${q.slice(-120)}" -> ${a}`);
    if (a === 'NO') { press('DOWN', 4, 10); }
    press('A', 4, 20);
    return true;
  } catch (e) { log(`quiz failed: ${e}`); return false; }
}

// Walk toward (tx,ty) up to n steps; handles text boxes along the way. Returns true when there.
function walkTo(tx, ty, n = 60) {
  let miss = 0, stuck = 0, lastPos = '', engageWaits = 0;
  for (let i = 0; i < n; i++) {
    const s = screen(), st = gstate();
    if (st.inBattle) return false;
    // Session 20260927-140511: an open START menu counts as a text box; A-spam here opened the trainer card (RED) over and over
    // (live 150116: 30k frames frozen at ROUTE_19 9,9 after a failed SURF). Close menus with B instead.
    if (isStartMenu(s) || (s.cursor && !s.waitingForA && /CANCEL/.test((s.rows || []).join('|')) && /[×x] ?\d/.test((s.rows || []).join('|')))) { log('walkTo: START menu / bag list open -> B'); press('B', 4, 16); wait(8); continue; }
    if (s.hasTextBox || s.waitingForA) { if (!quizAnswer()) press('A', 4, 12); continue; }
    if (st.x === tx && st.y === ty) return true;
    const d = pathDir(gridX(), tx, ty);
    if (!d) {
      // No path: nudge only onto plain walkable tiles (never a warp/ladder, which would teleport us away), give up soon.
      if (++miss > 14) return false;
      if (miss === 1 && /SEAFOAM/.test(st.map || '')) try { const gd = gridX(); log(`walkTo: no path ${st.x},${st.y}->${tx},${ty} on ${gd.map} ${gd.width}x${gd.height} player ${gd.player.x},${gd.player.y} rows4-6: ${gd.rows.slice(4, 7).join('|')} learned ${[...LEARNED_BLOCKS].filter(k => k.startsWith(gd.map)).join(' ')}`); } catch (e) {}
      // A wandering NPC often blocks a cave corridor for a moment (live run 232417: path to B2F (5,7) vanished): wait first.
      if (miss <= 6) { wait(30); continue; }
      const g = gridX(), px = g.player.x, py = g.player.y, warps = new Set((g.warps || []).map(w => `${w.x},${w.y}`));
      const opts = Object.entries(DIRS).filter(([, [dx, dy]]) => { const x = px + dx, y = py + dy; return y >= 0 && y < g.height && x >= 0 && x < g.width && WALK.has(g.rows[y][x]) && !warps.has(`${x},${y}`); });
      if (opts.length) press(opts[i % opts.length][0], 16, 4); else wait(8);
      continue;
    }
    // Session 20260927-104230: live 113836 held DOWN ~100x at SILPH_CO_5F (21,14) toward the CARD KEY: the grid called the next
    // tile walkable but the game never moved us. Bail after 10 bumps in place so talkTo tries the target's other sides.
    const pos = `${st.x},${st.y}`; if (pos === lastPos) { if (++stuck >= 10 && !SPINNERS[st.map]) {
      // Session 20260927-135511: a trainer who spotted us freezes input while walking over (Route 19/20 swimmers, ~600 frames);
      // that is not a wall. If an NPC is in line within 6 tiles, wait for the battle instead of learning a fake blocked step.
      try { const gn = gridX(); if (engageWaits < 4 && (gn.npcs || []).some(n => (n.x === st.x && Math.abs(n.y - st.y) <= 6) || (n.y === st.y && Math.abs(n.x - st.x) <= 6))) {
        engageWaits++; log(`walkTo: frozen at ${pos} next to an NPC in line (trainer approach?) -> waiting, not learning a wall`); press('A', 4, 12); wait(90); stuck = 0; lastPos = ''; if (gstate().inBattle) return false; continue; } } catch (e) {}
      log(`walkTo: stuck at ${pos} -> ${tx},${ty} (dir ${d}); learning blocked step`);
      LEARNED_BLOCKS.add(`${st.map}:${st.x},${st.y},${d}`);
      try { const g = gridX(), rows = []; for (let y = Math.max(0, st.y - 3); y <= Math.min(g.height - 1, st.y + 3); y++) rows.push(`${y}:${g.rows[y].slice(Math.max(0, st.x - 4), st.x + 5)}`);
        log(`walkTo: grid near ${pos}: ${rows.join(' | ')} npcs ${JSON.stringify((g.npcs || []).filter(n => Math.abs(n.x - st.x) <= 3 && Math.abs(n.y - st.y) <= 3))}`); } catch (e) {}
      // re-plan once around the learned wall instead of giving up
      if (stuck < 11 && pathDir(gridX(), tx, ty)) { stuck = 0; lastPos = ''; continue; }
      return false; } } else { stuck = 0; lastPos = pos; }
    // Session 20260927-135511: SURF. '~' is in WALK once LAPRAS knows SURF (surfOK); the first water step needs the SURF field move.
    { const [dx, dy] = DIRS[d]; const g1 = gridX(), nr = g1.rows[st.y + dy];
      if (nr && nr[st.x + dx] === '~' && st.walkState !== 2) { if (!startSurf(d)) { LEARNED_BLOCKS.add(`${st.map}:${st.x},${st.y},${d}`); } continue; } }
    hold(d, 16); wait(4);
    // arrow floors: the forced slide takes many frames and ignores input; wait until the position settles before re-planning
    if (SPINNERS[st.map]) { let a = gstate(); for (let k = 0; k < 12; k++) { wait(20); const b = gstate(); if (b.x === a.x && b.y === a.y) break; a = b; } }
  }
  return false;
}

// gridX() stays STALE for 60+ frames after a warp (new map id, but the OLD floor's size/tiles/NPCs; live run 234334: Jev chose a
// B1F ladder from options computed on 1F's tiles). Wait until the grid's size and NPC count match the ROM data for the new map.
function mapSettled(map) {
  try {
    const m = rom.mapByName(map), g = gridX();
    if (!m || !g) return true;
    if (g.width !== m.width * 2 || g.height !== m.height * 2) return false;
    return (g.npcs || []).length <= (m.objects || m.npcs || []).length;
  } catch (e) { return true; }
}
const gridCache = {}; // map -> settled grid (to know, on other floors, what a ladder's landing spot connects to)
let lastOutdoor = null; // "the previous map" warps (destMap 255) lead to the last OUTDOOR map, not the last map
function settleMap(map) {
  for (let i = 0; i < 30 && !mapSettled(map); i++) wait(15);
  wait(30);
  if (!mapSettled(map)) { log(`map ${map} did not settle`); return; }
  // Session 20260927-142011: same-size floors (Seafoam 1F/B1F/B2F are all 30x18) pass mapSettled while gridX() still shows the
  // PREVIOUS floor's tiles (test: the "B1F" dump was 1F's tiles exactly). Wait until the tiles differ from the last floor's.
  try { const norm = r => r.map(x => x.replace(/[DN@]/g, '.')).join('|'); const pg = lastSettled && lastSettled !== map ? gridCache[lastSettled] : null;
    if (pg && pg.width === gridX().width && pg.height === gridX().height) { let k = 0; for (; k < 40 && norm(gridX().rows) === norm(pg.rows); k++) wait(15); log(`settle ${map}: tiles ${k >= 40 ? 'STILL identical to' : 'differ from'} ${lastSettled} after ${k * 15} extra frames`); } } catch (e) {}
  lastSettled = map;
  // gridX() lags ~20 frames behind the tiles even after mapSettled: read until two reads 20 frames apart agree (max 10 tries).
  try { let prev = gridX().rows.join('|'); for (let k = 0; k < 10; k++) { wait(20); const cur = gridX().rows.join('|'); if (cur === prev) break; prev = cur; } } catch (e) {}
  try { const g = gridX(); gridCache[map] = g; if ((g.exits || []).length) lastOutdoor = map;
    // Session 20260927-140511: one full grid dump per map per process (one row per log line: long lines get cut) so the
    // next session can plan routes (e.g. ROUTE_20 west of Seafoam) from data instead of memory.
    if (!mapDumped[map]) { mapDumped[map] = 1; log(`mapdump ${map} ${g.width}x${g.height} warps=${JSON.stringify((g.warps || []).map(w => [w.x, w.y, w.to]))} exits=${JSON.stringify(g.exits || [])}`);
      g.rows.forEach((r, y) => log(`mapdump ${map} ${y}: ${r}`));
      log(`mapdump ${map} blockedMoves=${(g.blockedMoves || []).map(b => `${b.x},${b.y},${b.dir}`).join(' ')}`); } } catch (e) {}
}
const mapDumped = {};
let lastSettled = null; const diagDone = {};
// BFS reachability from (sx,sy) on grid g; ignoreN: treat people/objects ('N') as passable.
function reachable(g, sx, sy, tx, ty, ignoreN) {
  const rows = ignoreN ? g.rows.map(r => r.replace(/N/g, '.')) : g.rows;
  return !!pathDir({ ...g, rows, player: { x: sx, y: sy } }, tx, ty) || (sx === tx && sy === ty);
}
// Mt Moon's "previous map" warps all lead outside to Route 4 (ROM destMap 255 = last outdoor map).
// Session 20260927-163012: a bot restarted INSIDE a forest/cave has no lastOutdoor/prevMap, so gate warps stayed "the previous map" and
// Jev (no facts) bounced VIRIDIAN_FOREST <-> SOUTH_GATE 30x. The game itself stores the destination of destMap-255 warps in wLastMap.
function ramLastMap() { try { const m = rom.maps[read(sym('wLastMap'))[0]]; return m && m.name ? m.name : null; } catch (e) { return null; } }
const warpName = (to) => /previous/i.test(to) ? (ramLastMap() || lastOutdoor || (/MT_MOON/.test(loopMap || '') ? 'ROUTE_4' : null) || prevMap || to) : to;
const isExitName = n => !/MT_MOON|_B\dF|_\dF$/.test(n || '');
// ROM: where a ladder lands on the other floor; if we have seen that floor, which of its warps are walkable from the landing spot.
function landingFacts(map, w) {
  try {
    const rw = ((rom.mapByName(map) || {}).warps || []).find(r => r.x === w.x && r.y === w.y);
    const to = w.to || '';
    if (!rw || rw.destMap === 255 || /previous/i.test(to)) return '';
    const dw = ((rom.mapByName(to) || {}).warps || [])[rw.destWarp];
    if (!dw) return '';
    let f = `; lands at ${to} (${dw.x},${dw.y})`;
    const g = gridCache[to];
    if (!g) return f + ' (that floor not mapped yet)';
    const others = (g.warps || []).filter(o => !(o.x === dw.x && o.y === dw.y));
    const ok = others.filter(o => reachable(g, dw.x, dw.y, o.x, o.y, false));
    const viaN = others.filter(o => !ok.includes(o) && reachable(g, dw.x, dw.y, o.x, o.y, true));
    const nm = o => `${warpName(o.to)}@${o.x},${o.y}${isExitName(warpName(o.to)) ? ' (CAVE EXIT)' : ''}`;
    if (ok.some(o => isExitName(warpName(o.to)))) f += '; THE CAVE EXIT IS WALKABLE FROM WHERE THIS LADDER LANDS';
    f += ok.length ? `; from there you can walk to: ${ok.map(nm).join(', ')}` : '; from there NO other ladder/exit is walkable (dead-end pocket)';
    if (viaN.length) f += `; only past a person/object blocking the way: ${viaN.map(nm).join(', ')}`;
    return f;
  } catch (e) { return ''; }
}

function nerdBeaten() { try { return !!event('EVENT_BEAT_MT_MOON_EXIT_SUPER_NERD'); } catch (e) { return lastTexts.some(t => /each take one|No being greedy/i.test(t)); } }
const warpUsed = {};
let lastWarpTaken = null; const deadEnd = {};
// Session 20260927-121509: same-map teleport pads (SAFFRON_GYM maze): where each pad landed us, 'MAP|x,y' -> 'x,y'.
// Seeded with SAFFRON_GYM landings seen in live runs (padLand resets on restart); new jumps overwrite these.
const padLand = { 'SAFFRON_GYM|1,9': '19,11', 'SAFFRON_GYM|11,15': '19,17', 'SAFFRON_GYM|15,11': '0,8', 'SAFFRON_GYM|15,15': '3,15', 'SAFFRON_GYM|15,17': '11,17', 'SAFFRON_GYM|15,9': '9,1', 'SAFFRON_GYM|19,11': '17,15', 'SAFFRON_GYM|19,17': '17,9', 'SAFFRON_GYM|19,3': '15,15', 'SAFFRON_GYM|19,9': '19,15', 'SAFFRON_GYM|5,17': '17,17' };
function padJumped(m0, w) { const q = gstate(); if (q.map !== m0 || (w.to || w.map || w.dest) !== m0) return false; if (Math.abs(q.x - w.x) + Math.abs(q.y - w.y) <= 2) return false; let onPad = true; try { onPad = (gridX().warps || []).some(o => o.x === q.x && o.y === q.y); } catch (e) {} if (onPad) { padLand[`${m0}|${w.x},${w.y}`] = `${q.x},${q.y}`; log(`pad ${m0} (${w.x},${w.y}) -> landed (${q.x},${q.y})`); } else log(`pad ${m0} (${w.x},${w.y}): moved to (${q.x},${q.y}) which is not a pad, landing NOT recorded`); return true; }
// Session 20260927-034725: hideout arrow (spinner) floors break walkTo; on a failed warp walk in a new direction so the
// spinners carry us somewhere new, then retry from there (fail count reset while we keep moving). Mechanics only.
let shuffleN = 0;
// Session 20260927-035224: learned spinner model. Every single press on B2F/B3F records (pos,dir)->result, so we explore
// untried presses first (toward the target warp), then presses whose known result lands closest to the target. Mechanics only.
const spinSeen = {}, spinVisit = {};
function spinPlan(start, T, dist) {
  const dirs = ['DOWN', 'RIGHT', 'UP', 'LEFT'], prev = { [start]: null }, q = [start]; let best = null, bestS = 1e9;
  const xy = k => k.split(':')[1].split(',').map(Number);
  for (let i = 0; i < q.length && i < 400; i++) {
    const k = q[i]; const [x, y] = xy(k); let depth = 0; for (let c = k; prev[c]; c = prev[c].from) depth++;
    if (x === T.x && y === T.y) { best = k; bestS = -1e9; break; }
    for (const d of dirs) { const r = spinSeen[`${k}:${d}`];
      if (!r) { const [dx, dy] = DIRS[d]; const sc = dist(x + dx, y + dy) + 0.7 * depth; if (sc < bestS) { bestS = sc; best = { node: k, d }; } continue; }
      if (r === k || r.split(':')[0] !== k.split(':')[0] || r in prev) continue;
      prev[r] = { from: k, d }; q.push(r); }
  }
  if (!best) return null;
  let node = typeof best === 'string' ? best : best.node, step = typeof best === 'string' ? null : best.d;
  while (prev[node]) { step = prev[node].d; node = prev[node].from; }
  return step;
}
function hideoutShuffle(st, fk, tgt) {
  if (!/ROCKET_HIDEOUT_B[23]F/.test(st.map || '')) return;
  const p0 = gstate(); const dirs = ['DOWN', 'RIGHT', 'UP', 'LEFT'];
  const T = tgt || { x: p0.x, y: p0.y };
  const dist = (x, y) => Math.abs(x - T.x) + Math.abs(y - T.y);
  for (let k = 0; k < 10; k++) {
    const p = gstate(); if (p.map !== st.map || p.inBattle) break;
    const pk = `${p.map}:${p.x},${p.y}`; spinVisit[pk] = (spinVisit[pk] || 0) + 1;
    const score = d => { const [dx, dy] = DIRS[d]; const r = spinSeen[`${pk}:${d}`];
      if (!r) return dist(p.x + dx, p.y + dy) - 100; // untried first, nearest-to-target first
      if (r === pk) return 1000; // blocked
      const [rx, ry] = r.split(':')[1].split(',').map(Number); return dist(rx, ry) + 3 * (spinVisit[r] || 0) + Math.random() * 2; };
    let d = dirs.slice().sort((u, v) => score(u) - score(v))[0];
    // Session 20260927-040225: BFS over learned presses; walk the known path to the best frontier (untried press near target)
    // instead of only looking one press ahead. Mechanics only.
    try { const first = spinPlan(pk, T, dist); if (first) d = first; } catch (e) {}
    press(d, 16, 4); wait(40);
    const q = gstate(); if (q.map !== st.map) break;
    spinSeen[`${pk}:${d}`] = `${q.map}:${q.x},${q.y}`;
    if (tgt && q.x === T.x && q.y === T.y) break;
  }
  shuffleN++;
  const p1 = gstate();
  if (p1.map === st.map && (p1.x !== p0.x || p1.y !== p0.y) && shuffleN % 12) destFail[fk] = 0;
  log(`hideout spin-explore ${shuffleN}: ${p0.x},${p0.y} -> ${p1.x},${p1.y} target ${T.x},${T.y} known ${Object.keys(spinSeen).length}`);
}
function goWarp(dest, at) {
  const g = gridX(), all = g.warps || [];
  let ws = all.filter(w => (w.to || w.map || w.dest || '').includes(dest));
  if (at) ws = ws.filter(w => w.x === at.x && w.y === at.y);
  const matched = ws.length > 0; // fallback (no warp named dest, e.g. stale state right after a map change): never step off + re-enter it
  if (!ws.length) ws = all.slice(0, 1);
  if (!ws.length) { wait(10); return false; }
  const m0 = gstate().map;
  // Session 20260927-131510: in a pad maze (SAFFRON_GYM) the target (exit door or a pad in another room) may be walled off: ride the pad chain first.
  try { const w0 = ws[0]; if (matched && w0 && padDests(m0) && !pathDir(g, w0.x, w0.y) && !(w0.x === g.player.x && w0.y === g.player.y) && padRoute(g, new Set([`${w0.x},${w0.y}`]))) { log(`goWarp: ${dest}@${w0.x},${w0.y} walled off, riding pads`); padsToward(w0, () => new Set([`${w0.x},${w0.y}`])); if (gstate().map !== m0 || gstate().inBattle) return true; return goWarpNoPads(dest, at); } else if (padDests(m0)) { const w0 = ws[0]; log(`goWarp pads skipped: matched=${!!matched} w0=${w0 ? w0.x + ',' + w0.y : 'none'} pathDir=${w0 ? !!pathDir(g, w0.x, w0.y) : '-'} route=${w0 ? JSON.stringify(padRoute(g, new Set([`${w0.x},${w0.y}`]))) : '-'}`); } } catch (e) { log(`goWarp pads ${e}`); }
  return goWarpNoPads(dest, at);
}
function goWarpNoPads(dest, at) {
  const g = gridX(), all = g.warps || [];
  let ws = all.filter(w => (w.to || w.map || w.dest || '').includes(dest));
  if (at) ws = ws.filter(w => w.x === at.x && w.y === at.y);
  const matched = ws.length > 0;
  if (!ws.length) ws = all.slice(0, 1);
  if (!ws.length) { wait(10); return false; }
  const m0 = gstate().map;
  // Reachable warps first (Mt Moon floors are split into disconnected sections).
  ws = ws.filter(w => pathDir(g, w.x, w.y) || (w.x === g.player.x && w.y === g.player.y)).concat(ws.filter(w => !pathDir(g, w.x, w.y)));
  try { const w0 = ws[0]; if (w0 && !pathDir(g, w0.x, w0.y) && !(w0.x === g.player.x && w0.y === g.player.y) && cutTreeToward(w0.x, w0.y)) log(`cutTree: tree cut, walking on to ${dest} before it regrows`); } catch (e) { log(`cutTree ${e}`); }
  // Try every warp tile leading to dest (the forest gate's (4,0) looks walkable but only (5,0) is the real doorway).
  for (const w of ws) {
    const dir = w.y === 0 ? 'UP' : w.x === 0 ? 'LEFT' : w.x === g.width - 1 ? 'RIGHT' : 'DOWN';
    // Standing ON the warp (we arrived on these stairs, live run 015815 ROUTE_11_GATE_2F (7,7)): stairs only fire when stepped onto,
    // so step off to a free neighbour first, then walk back on.
    const s0 = gstate();
    if (matched && s0.x === w.x && s0.y === w.y) {
      const wset = new Set(all.map(o => `${o.x},${o.y}`));
      const off = Object.entries(DIRS).find(([, [dx, dy]]) => { const x = w.x + dx, y = w.y + dy; return y >= 0 && y < g.height && x >= 0 && x < g.width && WALK.has(g.rows[y][x]) && !wset.has(`${x},${y}`); });
      if (off) { hold(off[0], 16); wait(8); log(`goWarp: on the warp ${w.x},${w.y}, stepped ${off[0]} to ${gstate().x},${gstate().y} to re-enter`); }
      // Session 20260927-125510: live "goWarp SAFFRON_GYM failed at 1,11" while standing on pad (1,11): the grid showed no free
      // non-warp neighbour. Probe each direction physically and keep the first step that leaves the pad without warping.
      else for (const d of Object.keys(DIRS)) {
        const b = gstate(); hold(d, 16); wait(8); const a = gstate();
        if (a.map !== m0 || a.inBattle) return true;
        if (a.x !== b.x || a.y !== b.y) { if (wset.has(`${a.x},${a.y}`)) { log(`goWarp: probe ${d} from pad landed on pad ${a.x},${a.y}`); return true; } log(`goWarp: on pad ${w.x},${w.y}, probe stepped ${d} to ${a.x},${a.y}`); break; }
      }
      if (gstate().map !== m0) return true;
    }
    if (walkTo(w.x, w.y, 150) || padJumped(m0, w)) { if (padJumped(m0, w)) return true; hold(dir, 16); wait(10); }
    if (gstate().map !== m0 || gstate().inBattle || padJumped(m0, w)) return true; // battle interrupted: main loop fights, then retries
    // Session 20260927-155512: standing ON a side door (ROUTE_8 (8,9), wall to the west) and pushing DOWN never warps; push into each wall side.
    if (gstate().x === w.x && gstate().y === w.y) for (const [d3, [ex, ey]] of Object.entries(DIRS)) {
      const nx = w.x + ex, ny = w.y + ey; const oob = ny < 0 || ny >= g.height || nx < 0 || nx >= g.width; if (!oob && g.rows[ny][nx] !== '#') continue; // Session 20260927-195015: VR_1F exit (8,17) sits on the map edge: push off-map too
      hold(d3, 16); wait(10); if (gstate().map !== m0 || gstate().inBattle) { log(`goWarp: pushed ${d3} from door ${w.x},${w.y} into wall -> ${gstate().map}`); return true; }
    }
    // Session 20260927-091728: side doors (ROUTE_7_GATE west door (11,9)) are entered by walking INTO them from the side; walkTo stops
    // next to the door tile and the old code pushed DOWN (test: "goWarp ROUTE_7_GATE failed at 10,9"). Push toward the door instead.
    // The harness lists one tile of a 2-tile doorway ((11,9)); the game may only open the other ((11,10)). Try both 'D' tiles.
    { const p0 = gstate(), ddx0 = w.x - p0.x, ddy0 = w.y - p0.y;
      if (Math.abs(ddx0) + Math.abs(ddy0) === 1) {
        const d2 = ddx0 === 1 ? 'RIGHT' : ddx0 === -1 ? 'LEFT' : ddy0 === 1 ? 'DOWN' : 'UP';
        const along = ddx0 ? [[0, 0], [0, 1], [0, -1]] : [[0, 0], [1, 0], [-1, 0]];
        for (const [ax, ay] of along) {
          const tx = w.x + ax, ty = w.y + ay; if (ty < 0 || ty >= g.height || tx < 0 || tx >= g.width || g.rows[ty][tx] !== 'D') continue;
          const sx = tx - ddx0, sy = ty - ddy0;
          if (!(gstate().x === sx && gstate().y === sy) && !walkTo(sx, sy, 20)) continue;
          for (let i = 0; i < 3 && gstate().map === m0 && !gstate().inBattle; i++) { hold(d2, 16); wait(10); }
          const q = gstate(); log(`goWarp: pushed ${d2} into door tile ${tx},${ty} from ${sx},${sy}: now ${q.map} ${q.x},${q.y}`);
          if (gstate().map !== m0 || gstate().inBattle) return true;
        } } }

    if (w.y === 0) {
      // top-edge doorway: stand below each candidate column and push UP
      for (const x of [w.x, w.x + 1, w.x - 1]) {
        if (!walkTo(x, 1, 20)) continue;
        hold('UP', 16); wait(4); hold('UP', 16); wait(10);
        if (gstate().map !== m0) return true;
      }
    }
  }
  log(`goWarp ${dest} failed from ${m0} at ${gstate().x},${gstate().y}; warps ${JSON.stringify(ws)}`);
  wait(10);
  return false;
}

const STARTERS = { CHARMANDER: [6, 3], SQUIRTLE: [7, 3], BULBASAUR: [8, 3] };
let starterPick = null;
function pickStarter() {
  if (starterPick) return starterPick;
  const opts = {
    BULBASAUR: 'Grass/Poison. Strong vs Brock (Rock) and Misty (Water) gyms; rival gets Charmander (fire beats it).',
    CHARMANDER: 'Fire. Weak vs Brock (Rock) and Misty (Water), the first two gyms; rival gets Squirtle.',
    SQUIRTLE: 'Water. Strong vs Brock (Rock), neutral vs Misty; rival gets Bulbasaur (grass beats it).',
  };
  starterPick = askChoice({ goal: 'Beat Pokemon Red and become Champion', map: gstate().map },
    'Which starter Pokemon should the player take to beat the game most reliably?', opts, 'SQUIRTLE');
  log(`starter pick: ${starterPick}`);
  return starterPick;
}

// Battle: when the move menu is open, Jev picks the move from options with damage facts.
const moveCache = new Map();
const e4LeadAsked = new Set(); // Session 20260927-215348: E4 rooms where the lead choice was already offered (reset in the lobby)
let lastUserEnemy = false;
let uselessMoves = {}; // Session 20260927-082228: move -> times the game answered "Nothing happened!"/"But it failed!" this battle
let disabledMoves = new Set(), lastPickedMove = null; // enemy DISABLE: the game refuses the move, so stop offering it this battle
let repeatHits = 0, lastMoveKey = null;
const catchFails = {}; let catchTries = 0;
const statusUsed = { enemy: null, n: {} };
const swFrom = { ekey: null, slots: new Set() };
let etherPlan = null, etherFails = 0;
const FIXED_DMG = /^(NIGHT SHADE|SEISMIC TOSS|SONIC BOOM|DRAGON RAGE)$/;
// Session 20260927-231231 (DEEP): live 233308 -> 235310 spent SOLARBEAM on HITMONCHAN/HITMONLEE/MACHAMP/GENGAR, all 10 MEGA DRAIN on
// AGATHA and all DOUBLE-EDGE before the CHAMPION, used CUT (30 PP) once, then met RHYDON with only CUT/0-PP moves and lost the whole
// fight. Give Jev an estimated damage / hits-to-KO per move (Gen 1 formula, enemy stats from base stats) and, inside the Elite Four,
// the PP budget: no PP restore until the Champion is beaten, and which later enemies need which move type.
const SPECIAL_T = new Set(['FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'ICE', 'PSYCHIC', 'DRAGON']);
function hitsFact(b, m, eff, stab) {
  try {
    if (!(m.power > 0) || !(eff > 0)) return '';
    const me = party().find(q => q.slot === b.player.slot && q.species === b.player.species) || party().find(q => q.species === b.player.species && q.level === b.player.level);
    const es = rom.speciesByName(b.enemy.species); if (!me || !me.stats || !es || !es.base) return '';
    const sp = SPECIAL_T.has(m.type), L = b.enemy.level, st = x => Math.floor((x + 8) * 2 * L / 100) + 5;
    const A = sp ? me.stats.spc : me.stats.atk, D = sp ? st(es.base.spc) : st(es.base.def);
    const dmg = Math.max(1, Math.floor((Math.floor(Math.floor(2 * b.player.level / 5 + 2) * m.power * A / Math.max(1, D)) / 50 + 2) * stab * eff * 0.92));
    const hits = Math.ceil(b.enemy.hp / dmg), turns = m.name === 'SOLARBEAM' ? 2 * hits : hits;
    return `; est. ~${dmg} damage per hit -> about ${hits} hit${hits > 1 ? 's' : ''} to KO (enemy HP ${b.enemy.hp})${m.name === 'SOLARBEAM' ? `, ${turns} turns (charges 1 turn first)` : ''}` + survivalFact(b, m, dmg, hits);
  } catch (e) { return ''; }
}
// Session 20260928-000731 (DEEP): live 010040 CHAMPION fight: VENUSAUR PAR at 35/263 then 14/263 vs a full-HP EXEGGUTOR, MAX POTION x2
// in the bag; HEAL_ITEM was offered but every attack option only said "about 2 hits to KO" and Jev picked DOUBLE-EDGE (0.57, heal 0.07)
// -> fainted, bench lost, blackout. Nothing told Jev it would faint first. Track the HP we lose per enemy turn and state survival.
const hpSeen = { ekey: null, hp: null, drops: {}, battleMax: 0 };
const parLog = { rooms: new Set(), bigHit: null };
function trackHp(b) {
  try {
    const ek = `${b.enemy.species}|${b.enemy.level}|${b.enemy.maxHp}`, pk = `${b.player.species}|${b.player.level}`;
    if (hpSeen.ekey === ek && hpSeen.pk === pk && hpSeen.hp != null && b.player.hp < hpSeen.hp) {
      const d = hpSeen.hp - b.player.hp; hpSeen.drops[ek] = Math.max(hpSeen.drops[ek] || 0, d); hpSeen.battleMax = Math.max(hpSeen.battleMax, d);
      if (/PAR/i.test(String(b.player.status || '')) && (!parLog.bigHit || d > parLog.bigHit.d)) parLog.bigHit = { d, enemy: b.enemy.species, who: b.player.species };
    }
    hpSeen.ekey = ek; hpSeen.pk = pk; hpSeen.hp = b.player.hp;
    try { const mp = gstate().map; if (/PAR/i.test(String(b.player.status || '')) && E4_ORDER.includes(mp)) parLog.rooms.add(`${b.player.species} in ${mp}`); } catch (e) {}
  } catch (e) {}
}
function enemyHitEst(b) {
  try {
    const ek = `${b.enemy.species}|${b.enemy.level}|${b.enemy.maxHp}`;
    if (hpSeen.drops[ek]) return { d: hpSeen.drops[ek], how: `observed: we lost up to ${hpSeen.drops[ek]} HP in one turn vs this ${b.enemy.species}` };
    const me = party().find(q => q.species === b.player.species && q.level === b.player.level); const es = rom.speciesByName(b.enemy.species);
    if (!me || !me.stats || !es || !es.base) return null;
    const L = b.enemy.level, st = x => Math.floor((x + 8) * 2 * L / 100) + 5;
    const A = Math.max(st(es.base.atk), st(es.base.spc)), D = Math.min(me.stats.def, me.stats.spc);
    // Session 20260928-002731: live 012547 used battleMax (a JYNX CRIT of 112) as LAPRAS's hit and the formula had no type/STAB factor
    // (JYNX estimate was ~28, real ~112), so HEAL_ITEM read "2 attacks now vs 2 after healing". Now: power-90 STAB hit x best type factor.
    let tm = 1; try { const myT = me.types || b.player.types || [], eT = b.enemy.types || es.types || []; tm = Math.max(1, ...eT.map(t => 1.5 * rom.effectiveness(t, myT))); } catch (e) {}
    const d = Math.floor((Math.floor(Math.floor(2 * L / 5 + 2) * 90 * A / Math.max(1, D)) / 50 + 2) * tm);
    return { d, how: `rough estimate (${b.enemy.species} Lv${L}, power-90 ${tm > 1 ? `STAB x${tm / 1.5} type` : 'neutral'} hit, not a crit${hpSeen.battleMax ? `; biggest turn loss vs any enemy this battle ${hpSeen.battleMax}` : ''})` };
  } catch (e) { return null; }
}
function enemyFirst(b) {
  try { if (/PAR/i.test(String(b.player.status || ''))) return true;
    const me = party().find(q => q.species === b.player.species && q.level === b.player.level); const es = rom.speciesByName(b.enemy.species);
    const L = b.enemy.level; return !!(me && me.stats && es && es.base) && Math.floor((es.base.spd + 8) * 2 * L / 100) + 5 > me.stats.spd; } catch (e) { return false; }
}
// Attacks we get in before fainting, given our HP and the per-turn loss (recoil adds to it).
function attacksBeforeFaint(b, hp, perTurn) { const k = Math.ceil(hp / Math.max(1, perTurn)); return enemyFirst(b) ? k - 1 : k; }
function survivalFact(b, m, dmg, hitsNeeded) {
  try {
    const eh = enemyHitEst(b); if (!eh || !(b.player.hp > 0) || !(hitsNeeded > 0)) return '';
    const recoil = m && /DOUBLE-EDGE|TAKE DOWN|SUBMISSION/.test(m.name) ? Math.floor(Math.min(dmg, b.enemy.hp) / 4) : 0;
    const turnsNeeded = m && m.name === 'SOLARBEAM' ? 2 * hitsNeeded : hitsNeeded;
    const k = attacksBeforeFaint(b, b.player.hp, eh.d + recoil);
    const who = `${b.player.species} (${b.player.hp} HP, ${enemyFirst(b) ? `${/PAR/i.test(String(b.player.status || '')) ? 'PARALYZED so ' : ''}the enemy moves FIRST` : 'we move first'})`;
    if (recoil && recoil >= b.player.hp) return `. SURVIVAL: RECOIL ~${recoil} >= our ${b.player.hp} HP: this move KNOCKS OUT ${b.player.species} ITSELF`;
    if (k < turnsNeeded) return `. SURVIVAL: ${who} takes ~${eh.d}${recoil ? ` + ${recoil} recoil` : ''} per turn (${eh.how}) -> only ${Math.max(0, k)} more attack turn(s) before fainting, this move needs ${turnsNeeded}: WE LIKELY FAINT BEFORE IT KOs`;
    // Session 20260928-002731: HP carries between E4 rooms; CUT (2 hits, takes a hit) vs DOUBLE-EDGE (1 hit, recoil) looked the same to Jev.
    const nHits = Math.max(0, turnsNeeded - (enemyFirst(b) ? 0 : 1)), cost = nHits * eh.d + recoil * hitsNeeded;
    const costTxt = `. HP COST to finish it: ~${cost} (${nHits} enemy attack(s) taken${recoil ? ` + recoil` : ''})${b.kind === 'trainer' ? '; lost HP carries into the next battles' : ''}`;
    return `. SURVIVAL: ${who} takes ~${eh.d}${recoil ? ` + ${recoil} recoil` : ''} per turn (${eh.how}) -> about ${k} attack turn(s) before fainting, this move needs ${turnsNeeded}: should KO first` + costTxt + critRiskFact(b, eh.d, recoil, turnsNeeded);
  } catch (e) { return ''; }
}
// Session 20260928-002731: live 012547 (LORELEI, first E4 room): VENUSAUR 117/266 vs LAPRAS (~112 per turn). SOLARBEAM was labelled
// "should KO first" with a 5 HP margin and no HEAL_ITEM was offered (only when one hit >= HP); a critical BLIZZARD knocked it out and the
// whole pass was lost in room 1 (JYNX's ICE PUNCH had crit it the turn before). Gen 1 crits ~double damage; chance = enemy base speed/512.
function critChance(b) { try { const es = rom.speciesByName(b.enemy.species); return Math.min(0.5, Math.max(0.02, (es && es.base ? es.base.spd : 60) / 512)); } catch (e) { return 0.1; } }
function critRiskFact(b, d, recoil, turnsNeeded) {
  try {
    const n = turnsNeeded - (enemyFirst(b) ? 0 : 1); if (n <= 0) return '';
    const crit = Math.floor(1.9 * d), worst = (n - 1) * (d + recoil) + crit + recoil;
    if (worst < b.player.hp) return '';
    const p = critChance(b), pAny = Math.round(100 * (1 - Math.pow(1 - p, n)));
    return `. CRIT RISK: the enemy attacks ${n} time(s) before this move lands; margin only ~${Math.max(0, b.player.hp - n * (d + recoil))} HP, and ONE critical hit (~${crit}, ~${pAny}% chance) KNOCKS OUT ${b.player.species} before it KOs`;
  } catch (e) { return ''; }
}
const E4_ORDER = ['LORELEIS_ROOM', 'BRUNOS_ROOM', 'AGATHAS_ROOM', 'LANCES_ROOM', 'CHAMPIONS_ROOM'];
const E4_NEEDS = { LORELEIS_ROOM: { GRASS: 'LORELEI DEWGONG/CLOYSTER/SLOWBRO/LAPRAS (Water, Grass x2)' },
  BRUNOS_ROOM: { GRASS: 'BRUNO ONIX x2 (Rock/Ground, Grass x4; Normal x0.5)' },
  // Test 231634 (from 233308 start): with only type-level needs Jev spent MEGA DRAIN on LORELEI/BRUNO, reached AGATHA with 1 MEGA DRAIN,
  // and lost twice: GENGAR/GOLBAT CONFUSE RAY + switching waste SOLARBEAM's charge turn. MEGA DRAIN is reserved for AGATHA by name.
  AGATHAS_ROOM: { 'MEGA DRAIN': 'AGATHA GENGAR x2/HAUNTER/GOLBAT/ARBOK: Normal moves do NOTHING to her Ghosts and MEGA DRAIN is our only 1-turn Grass hit (SOLARBEAM charge turns get wasted by their CONFUSE RAY/HYPNOSIS and switching; we lost to AGATHA twice with MEGA DRAIN spent) - use SOLARBEAM on LORELEI/BRUNO instead', SOLARBEAM: 'AGATHA only as a backup (its charge turn is often wasted there)', NORMAL: 'AGATHA GOLBAT/ARBOK (x1)' },
  LANCES_ROOM: { NORMAL: 'LANCE GYARADOS/DRAGONAIR x2/AERODACTYL/DRAGONITE (Grass x0.5 or worse vs them)' },
  CHAMPIONS_ROOM: { GRASS: 'CHAMPION RHYDON Lv61 (Grass x4, Normal x0.5; it beat us when Grass PP was 0) + GYARADOS', NORMAL: 'CHAMPION PIDGEOT/ALAKAZAM/EXEGGUTOR/CHARIZARD (Grass is resisted by all four)' } };
function e4PPFact(m, eff) {
  try {
    const mp = gstate().map, i = E4_ORDER.indexOf(mp); if (i < 0 || !(m.power > 0)) return '';
    if (m.maxPp >= 25) return `. PP: plenty (${m.pp}), spend it freely when it KOs in a similar number of hits (see ppBudget)`;
    if (m.name === 'MEGA DRAIN' && i < 2) return `. PP: ${m.pp} left - SAVE FOR AGATHA (see ppBudget); SOLARBEAM/CUT should do this job here`;
    if (m.name === 'SOLARBEAM' && i < 2 && eff >= 2) return `. PP: ${m.pp} left - this Water/Rock enemy is what SOLARBEAM is for (see ppBudget)`;
    const later = E4_ORDER.slice(i + 1).map(r => (E4_NEEDS[r] || {})[m.name] || (E4_NEEDS[r] || {})[m.type]).filter(Boolean);
    return `. PP: only ${m.pp} left, no restore until the Champion${later.length ? `; still needed later for: ${later.join('; ')}` : ''}${eff <= 1 ? `; NOT super effective here (x${eff})` : ''}`;
  } catch (e) { return ''; }
}
function e4Budget() {
  const i = E4_ORDER.indexOf(gstate().map); if (i < 0) return null;
  return `Elite Four: NO PP restore until the Champion is beaten (${E4_ORDER.length - 1 - i} room(s) after this one; last run VENUSAUR reached the Champion with 0 Grass PP and lost to RHYDON). Plan: MEGA DRAIN (1-turn Grass) is for AGATHA's GENGAR/HAUNTER/GOLBAT/ARBOK (Normal moves do nothing to Ghosts; SOLARBEAM's charge turn gets wasted by her CONFUSE RAY/HYPNOSIS/switching; we lost to AGATHA twice with MEGA DRAIN spent). SOLARBEAM is for LORELEI's Water mons, BRUNO's ONIX and the CHAMPION's RHYDON. DOUBLE-EDGE is for LANCE and the CHAMPION's PIDGEOT/ALAKAZAM/EXEGGUTOR/CHARIZARD. CUT (30 PP) and HAUNTER NIGHT SHADE can be spent freely.`;
}
function pickMove(b) {
  const moves = b.player.moves.filter(m => m.pp > 0 && !disabledMoves.has(m.name));
  if (!moves.length) return null;
  trackHp(b);
  let curSlotG = -1; const swKey = `${b.enemy.species}|${b.enemy.level}|${b.enemy.maxHp}`;
  if (swFrom.ekey !== swKey) { swFrom.ekey = swKey; swFrom.slots = new Set(); swFrom.tries = {}; }
  const key = `${b.kind}|${b.enemy.species}|${b.enemy.level}|${Math.round(4 * b.enemy.hp / Math.max(1, b.enemy.maxHp))}|${b.player.hp}|${moves.map(m => m.pp).join(',')}`;
  if (moveCache.has(key)) {
    // Same situation re-asked many times = our pick isn't doing anything (e.g. silently disabled): exclude it and re-ask Jev.
    repeatHits = key === lastMoveKey ? repeatHits + 1 : 0; lastMoveKey = key;
    const ci = moveCache.get(key);
    if (repeatHits >= 4 && ci >= 0) { disabledMoves.add(b.player.moves[ci].name); moveCache.clear(); repeatHits = 0; log(`battle: ${b.player.moves[ci].name} repeated with no effect, excluding it`); return pickMove(b); }
    return ci;
  }
  const STATUS_NOTES = {
    'LEECH SEED': x => x.enemy.types.includes('GRASS') ? 'FAILS: enemy is GRASS type (immune)' : 'seeds the enemy: drains 1/8 of its max HP every turn and heals us; lasts until it switches; useful when our damaging moves are resisted',
    'POISONPOWDER': x => x.enemy.types.includes('POISON') ? 'FAILS: enemy is POISON type (immune)' : (x.enemy.status && !/^(OK|NONE)?$/i.test(String(x.enemy.status))) ? `FAILS: enemy already has a status (${x.enemy.status}); does nothing` : 'poisons: 1/16 max HP per turn, lasts after battle for wild mons',
    'GROWL': () => 'lowers enemy ATTACK one stage; rarely worth a turn',
    'GROWTH': () => 'raises our SPECIAL one stage; deals NO damage; after a few uses the stat is maxed and it shows "Nothing happened!" (wasted turn)',
  };
  // Remember status moves already used on THIS enemy (the game doesn't expose seeded/poisoned-by-us reliably).
  const ekey = `${b.enemy.species}|${b.enemy.level}|${b.enemy.maxHp}`;
  if (statusUsed.enemy !== ekey) { statusUsed.enemy = ekey; statusUsed.n = {}; }
  const opts = {}; let dreamFails = false;
  // Test 045225: Jev picked LEECH SEED 6x in a row vs GASTLY despite the ALREADY USED note. A status move already used on this
  // enemy is dropped from the options when a damaging move that actually hits (eff>0) is still available.
  const hitsLeft = moves.some(m => { if (m.name === 'DREAM EATER' && !/SLEEP|SLP/i.test(String(b.enemy.status || ''))) return false; if (['NIGHT SHADE','SEISMIC TOSS','SONIC BOOM','DRAGON RAGE'].includes(m.name)) return m.pp > 0; if (!(m.power > 0) || !(m.pp > 0)) return false; let e = 1; try { e = rom.effectiveness(m.type, b.enemy.types); } catch (x) {} return e > 0; });
  // Session 20260927-064727: live run 074322 listed NIGHT SHADE as "status move (no damage)", so Gastly Lv19 used LICK (~5 dmg)
  // instead of NIGHT SHADE (19 fixed dmg). Fixed-damage moves have power 0 in the ROM; describe their real damage.
  const FIXED = { 'NIGHT SHADE': b.player.level, 'SEISMIC TOSS': b.player.level, 'SONIC BOOM': 20, 'DRAGON RAGE': 40 };
  for (const m of moves) {
    if (FIXED[m.name] && m.pp > 0) { opts[m.name] = `${m.type} DAMAGING move: always deals exactly ${FIXED[m.name]} damage (= fixed, ignores type effectiveness and stats), accuracy ${m.accuracy || 100}, PP ${m.pp}/${m.maxPp}; enemy has ${b.enemy.hp} HP left (${Math.ceil(b.enemy.hp / FIXED[m.name])} hits to KO). Usually stronger than a weak power-20 move.` + survivalFact(b, m, FIXED[m.name], Math.ceil(b.enemy.hp / FIXED[m.name])); continue; }
    if (!(m.power > 0) && statusUsed.n[m.name] && hitsLeft) { if (!moveCache.has('drop:' + ekey + m.name)) { moveCache.set('drop:' + ekey + m.name, 1); log(`battle: dropping ${m.name} (already used ${statusUsed.n[m.name]}x on ${b.enemy.species})`); } continue; }
    // Live run 125143: vs rival's EXEGGCUTE (GRASS) Jev picked LEECH SEED despite "FAILS: immune" in its note. Drop moves known to fail.
    if (!(m.power > 0) && hitsLeft && STATUS_NOTES[m.name] && /^FAILS/.test(STATUS_NOTES[m.name](b))) { if (!moveCache.has('fail:' + ekey + m.name)) { moveCache.set('fail:' + ekey + m.name, 1); log(`battle: dropping ${m.name} (fails vs ${b.enemy.species})`); } continue; }
    // Session 20260927-234231: live 004052 (LANCES_ROOM) HAUNTER used DREAM EATER 14x on an AWAKE DRAGONITE ("attack missed!" every
    // time; it was the only option offered). DREAM EATER only hits a SLEEPING target. Mark it FAILS and drop it if anything else is left.
    if (m.name === 'DREAM EATER' && !/SLEEP|SLP/i.test(String(b.enemy.status || ''))) { opts[m.name] = `FAILS: DREAM EATER only hits a SLEEPING enemy (${b.enemy.species} is ${b.enemy.status || 'awake'}), otherwise it ALWAYS misses; put it to sleep first (HYPNOSIS/SING) or use another move. PP ${m.pp}/${m.maxPp}`; dreamFails = true; continue; }
    if (uselessMoves[m.name]) { opts[m.name] = `USELESS: the game answered "Nothing happened!"/"But it failed!" the last ${uselessMoves[m.name]}x we used it this battle (stat already maxed / no effect). Picking it again WASTES the turn; PP ${m.pp}/${m.maxPp}`; continue; }
    let eff = 1; try { eff = rom.effectiveness(m.type, b.enemy.types); } catch (e) {}
    const stab = b.player.types.includes(m.type) ? 1.5 : 1;
    const score = Math.round(m.power * eff * stab * (m.accuracy || 100) / 100);
    opts[m.name] = m.power > 0
      ? `${m.type} move, power ${m.power}, accuracy ${m.accuracy}, PP ${m.pp}/${m.maxPp}, type effectiveness x${eff} vs ${b.enemy.types.join('/')}${stab > 1 ? ', STAB x1.5' : ''}, expected-damage score ${score}${hitsFact(b, m, eff, stab)}${e4PPFact(m, eff)}`
      : `${m.type} status move (no damage), accuracy ${m.accuracy}, PP ${m.pp}/${m.maxPp}` + (STATUS_NOTES[m.name] ? `. ${STATUS_NOTES[m.name](b)}` : '') + (statusUsed.n[m.name] ? `. ALREADY USED ${statusUsed.n[m.name]}x on this enemy this battle: its effect is already active (or it keeps missing); using it again likely WASTES the turn - attack instead` : '');
  }
  if (dreamFails && Object.keys(opts).length > 1) delete opts['DREAM EATER'];
  if (b.kind === 'wild') opts.RUN = `Flee from this wild battle (usually succeeds vs weaker/slower wild Pokemon). Our HP ${b.player.hp}/${b.player.maxHp}; fainting costs half our money (${gstate().money}) and sends us back to heal. No EXP gained.${/MT_MOON/.test(gstate().map) ? ` We are trying to CROSS Mt. Moon: every HP point lost here may force another heal trip back out of the cave (we have repeated that many times). Enemy is Lv${b.enemy.level} vs our Lv${b.player.level}${b.player.level - b.enemy.level >= 8 ? ' (tiny EXP, not worth the HP)' : ''}; our HP is ${Math.round(100 * b.player.hp / b.player.maxHp)}%.` : ''}${/ROCK_TUNNEL|ROUTE_10/.test(gstate().map) ? ` SAVE PP: our lead's damaging moves have ${b.player.moves.filter(m => m.power > 0).map(m => `${m.name} ${m.pp}/${m.maxPp}`).join(', ')} PP left, and the nearest refill is Lavender's Pokemon Center AFTER the tunnel and the Route 10 south trainers. Tests blacked out twice on Route 10 south because the lead had 0 attack PP left from wild fights in the tunnel. Enemy Lv${b.enemy.level} vs our Lv${b.player.level}${b.player.level - b.enemy.level >= 15 ? ' (tiny EXP, not worth the PP)' : ''}.` : ''}`;
  // Session 20260927-064227: ROUTE_13 test - Venusaur with no damaging PP spammed GROWTH ("Nothing happened!"). When the lead
  // cannot hurt the enemy, offer Jev a switch to each healthy bench member (its damaging moves listed).
  const switchIdx = {}, ctx0 = {};
  // Session 20260927-083728: vs KOGA (Lv37-43) a Gastly Lv20 could still "damage" (Night Shade) so Jev was never offered VENUSAUR Lv50.
  // In trainer battles where the lead is badly outleveled, also offer switches (Jev decides; the bench member's facts are listed).
  const outLeveled = b.kind !== 'wild' && hitsLeft && (b.player.level || 0) + 8 <= (b.enemy.level || 0);
  // Session 20260927-174513: vs Blaine's gym, Fire enemies (PONYTA FIRE SPIN) beat our Grass/Ghost leads while LAPRAS/GEODUDE sat
  // on the bench. In trainer battles where the enemy's own type is super-effective vs our lead, offer switches to bench members
  // with a super-effective move (Jev decides; facts listed).
  let weakLead = false;
  try { const lt = b.player.types || (party().find(q => q.species === b.player.species && q.level === b.player.level) || {}).types || []; weakLead = b.kind !== 'wild' && hitsLeft && !outLeveled && lt.length > 0 && (b.enemy.types || []).some(t => rom.effectiveness(t, lt) >= 2); } catch (e) {}
  // Session 20260927-215348: lead choice at the start of each E4 room (overdue 5 sessions). On the first turn of the first E4
  // battle in a room, offer Jev every bench member (matchup facts + the room's roster) so it can pick who leads this room.
  const E4R = { LORELEIS_ROOM: 'LORELEI: DEWGONG, CLOYSTER, SLOWBRO, JYNX, LAPRAS (Water/Ice/Psychic Lv53-56): Ice hits Grass VENUSAUR x2; HAUNTER NIGHT SHADE does fixed damage', BRUNOS_ROOM: 'BRUNO: ONIX x2, HITMONCHAN, HITMONLEE, MACHAMP (Rock/Fighting Lv53-58): VENUSAUR Grass hits ONIX x4; Fighting cannot touch Ghosts', AGATHAS_ROOM: 'AGATHA: GENGAR x2, GOLBAT, HAUNTER, ARBOK (Ghost/Poison Lv54-60): Normal moves cannot hit Ghosts; Poison resists Grass', LANCES_ROOM: 'LANCE: GYARADOS, DRAGONAIR x2, AERODACTYL, DRAGONITE (Lv56-62)', CHAMPIONS_ROOM: 'CHAMPION rival: mixed team Lv59-65' };
  let e4Lead = false;
  try { const mp = gstate().map; e4Lead = b.kind !== 'wild' && !!E4R[mp] && !outLeveled && !weakLead && !e4LeadAsked.has(mp); if (e4Lead) { e4LeadAsked.add(mp); ctx0.leadChoice = `FIRST TURN of this Elite Four room: choose who leads it (keep attacking with the current lead, or switch). Room roster: ${E4R[mp]}. Our lead ${b.player.species} has ${b.player.hp}/${b.player.maxHp} HP${b.player.hp * 3 < b.player.maxHp ? ' - LOW HP: it will likely faint soon; consider switching to a healthy member and saving it' : ''}`; log(`battle: e4 lead choice offered in ${mp}`); } } catch (e) {}
  if (!hitsLeft || outLeveled || weakLead || e4Lead) {
    try {
      const pl = party();
      // Session 20260927-081228: b.player.slot is often missing -> cur defaulted to 0, so VENUSAUR (slot 0) was never offered while a
      // paralysed HAUNTER that can't touch a NORMAL DODRIO fought on (live 090808: fainted). Find the active member by species/level/hp.
      let cur = (b.player && typeof b.player.slot === 'number') ? b.player.slot : -1;
      if (cur < 0) cur = pl.findIndex(q => q.species === b.player.species && q.level === b.player.level && q.hp === b.player.hp);
      if (cur < 0) cur = pl.findIndex(q => q.species === b.player.species && q.level === b.player.level);
      curSlotG = cur;
      pl.forEach((q, i) => {
        if (i === cur || !(q.hp > 0)) return;
        // Session 20260928-000731: test 000952 (LANCE, AERODACTYL) ping-ponged HAUNTER -> VENUSAUR -> HAUNTER 8x; every switch was a free
        // enemy hit on paralyzed VENUSAUR (75 -> 36 -> 17 HP). Never offer switching back to a member we already left vs this enemy.
        if (swFrom.slots.has(i)) return;
        if (swFrom.tries && swFrom.tries[i] >= 3) return; // Session 20260928-002731: a switch that never happens (test 003826 looped SWITCH_0 8x)
        const atk = (q.moves || []).filter(x => x && (x.power || 0) > 0 && (x.pp || 0) > 0).map(x => { let e = 1; try { e = rom.effectiveness(x.type, b.enemy.types); } catch (z) {} return `${x.name} ${x.type} pow ${x.power} x${e} PP ${x.pp}`; }).join('; ') || 'no damaging move with PP';
        // Session 20260927-070227: live 075809 ping-ponged SWITCH_0/SWITCH_5 between members that also can't hurt the enemy; skip them.
        const canHit = (q.moves || []).some(x => { if (!x || !((x.pp || 0) > 0)) return false; if (!((x.power || 0) > 0) && !FIXED_DMG.test(x.name)) return false; let e = 1; try { e = rom.effectiveness(x.type, b.enemy.types); } catch (z) {} return e > 0 || /SEISMIC|SONIC|DRAGON RAGE/.test(x.name); });
        if (!canHit) return;
        const k = `SWITCH_${i}`; switchIdx[k] = i;
        if (outLeveled && !((q.level || 0) > (b.player.level || 0))) return;
        if (e4Lead) {
          let res = 1; try { res = Math.max(...b.enemy.types.map(t => rom.effectiveness(t, q.types || []))); } catch (z) {}
          opts[k] = `Switch our lead ${b.player.species} Lv${b.player.level} out for ${q.species} Lv${q.level} HP ${q.hp}/${q.maxHp} (${(q.types || []).join('/')}, takes x${res} from this ${b.enemy.types.join('/')} enemy's type): ${atk}. Costs one free enemy hit; Lv${q.level} vs enemy Lv${b.enemy.level}.`;
          return;
        }
        if (weakLead) {
          const se = (q.moves || []).some(x => { if (!x || !((x.pp || 0) > 0) || !((x.power || 0) > 0)) return false; try { return rom.effectiveness(x.type, b.enemy.types) >= 2; } catch (z) { return false; } });
          let res = 1; try { res = Math.max(...b.enemy.types.map(t => rom.effectiveness(t, q.types || []))); } catch (z) {}
          // Session 20260927-214516: vs LORELEI (Water/Ice) VENUSAUR was never offered a switch because HAUNTER's NIGHT SHADE (fixed
          // damage = its level) isn't "super-effective". Also offer members with a fixed-damage move that don't take x2 from the enemy.
          const fixed = (q.moves || []).find(x => x && (x.pp || 0) > 0 && FIXED_DMG.test(x.name));
          if (!se && !(fixed && res <= 1)) { delete switchIdx[k]; return; }
          if (!se) { opts[k] = `Switch our lead (${b.player.species} Lv${b.player.level}, WEAK to this ${b.enemy.types.join('/')} enemy's own type: its STAB moves hit x2) for ${q.species} Lv${q.level} HP ${q.hp}/${q.maxHp} (${(q.types || []).join('/')}, takes only x${res} from the enemy's type): ${fixed.name} deals fixed damage = its level (${q.level}) every hit regardless of type, PP ${fixed.pp}; ${atk}. The switch costs a free enemy hit on ${q.species}; Lv${q.level} vs enemy Lv${b.enemy.level}.`; return; }
          opts[k] = `Switch our lead (${b.player.species} Lv${b.player.level}, WEAK to this ${b.enemy.types.join('/')} enemy's own type: its STAB moves hit x2; fire/trap moves like FIRE SPIN can lock it in) for ${q.species} Lv${q.level} HP ${q.hp}/${q.maxHp} (${(q.types || []).join('/')}, takes x${res} from the enemy's type): ${atk}. The switch costs a free enemy hit on ${q.species}; Lv${q.level} vs enemy Lv${b.enemy.level}.`;
          return;
        }
        opts[k] = `Switch our lead (${outLeveled ? `${b.player.species} Lv${b.player.level}, OUTLEVELED by this Lv${b.enemy.level} enemy` : 'which has NO damaging move with PP left vs this enemy'}) for ${q.species} Lv${q.level} HP ${q.hp}/${q.maxHp}: ${atk}. The switch costs a free enemy hit on ${q.species}.${outLeveled ? outLevelFacts(q, b) : ''}`;
      });
      // Session 20260927-070727: when nobody can hurt the enemy (live 075809: Gastlys vs NORMAL PIDGEY, Venusaur 0 attack PP), a
      // member with few total PP left burns them and then must STRUGGLE (Normal-type damage). Offer that as a switch; Jev decides.
      if (!outLeveled && !weakLead && !Object.keys(switchIdx).length) {
        // Session 20260927-230230: live 235310 (Champion, EXEGGUTOR) ping-ponged HAUNTER(26 PP) <-> HAUNTER(60 PP) forever, each
        // switch costing a free hit and resetting the PP burn. Only offer members with FEWER total PP than the lead; else burn our own.
        const curQ = pl[cur] || {};
        // Session 20260927-230731: live 235816 still ping-ponged: pl[cur] had no moves (two HAUNTER Lv36 HP 43) -> curTot 0 -> no
        // filter. Use the battle's own lead moves first.
        const curTot = ((b.player.moves && b.player.moves.length) ? b.player.moves : (curQ.moves || [])).reduce((a, x) => a + ((x && x.pp) || 0), 0);
        if (curTot > 0) ctx0.strugglePlan = `${b.player.species} has ${curTot} PP left in total; using its status moves burns them, then it auto-uses STRUGGLE (Normal damage). Switching to a member with more PP only delays that and costs a free enemy hit.`;
        pl.forEach((q, i) => {
          if (i === cur || !(q.hp > 0)) return;
          const tot = (q.moves || []).reduce((a, x) => a + ((x && x.pp) || 0), 0);
          let imm = false; try { imm = rom.effectiveness('NORMAL', b.enemy.types) === 0; } catch (z) {}
          if (imm || tot > 60 || (curTot > 0 && tot >= curTot)) return; // Session 20260927-074727: was tot>40 + GHOST excluded -> no option at all, Venusaur spammed GROWTH to 2 HP (live 084304)
          const k = `SWITCH_${i}`; switchIdx[k] = i;
          opts[k] = `STRUGGLE PLAN: nobody in our party has a damaging move with PP that hits ${b.enemy.species}. Switch to ${q.species} Lv${q.level} HP ${q.hp}/${q.maxHp}, whose moves have only ${tot} PP in total left (${(q.moves || []).filter(Boolean).map(x => x.name + ' ' + x.pp).join(', ')}); once all are used it automatically uses STRUGGLE, a Normal-type attack that CAN damage ${b.enemy.species} (recoil 1/2 of damage). The only way to win this fight without items.`;
        });
      }
      // Session 20260927-183514: was `!outLeveled` -> also set when weakLead (live 193121: 'no damaging move' vs CHARIZARD although CUT x1 had 29 PP).
      if (!hitsLeft) ctx0.leadCannotDamage = `${b.player.species} has no damaging move with PP that can hit ${b.enemy.species}; status moves only (heal at a Pokemon Center restores PP)`;
    } catch (e) {}
  }
  const best = (moves.filter(m => opts[m.name]).sort((a, c) => c.power - a.power)[0] || moves[0]).name;
  const ctx = { battleKind: b.kind, enemy: `${b.enemy.species} Lv${b.enemy.level} (${b.enemy.types.join('/')}) HP ${b.enemy.hp}/${b.enemy.maxHp} ${b.enemy.status || ''}`,
    player: `${b.player.species} Lv${b.player.level} (${b.player.types.join('/')}) HP ${b.player.hp}/${b.player.maxHp} ${b.player.status || ''}`,
    enemiesLeft: b.enemyPartyCount, ...ctx0 };
  try { const pb = b.kind === 'trainer' ? e4Budget() : null; if (pb) ctx.ppBudget = pb; } catch (e) {}
  if (disabledMoves.size) ctx.disabledByEnemy = [...disabledMoves].join(', ');
  let balls = 0; try { balls = bag().filter(i => /BALL/i.test(i.name)).reduce((a, i) => a + i.qty, 0); } catch (e) {}
  let psize = 1; try { psize = party().length; } catch (e) {}
  if (b.kind === 'wild' && !moveCache.has('catchlog:' + b.enemy.species)) { moveCache.set('catchlog:' + b.enemy.species, 1); log(`battle: wild ${b.enemy.species} catch check balls=${balls} psize=${psize} fails=${catchFails[b.enemy.species] || 0}`); }
  if (b.kind === 'wild' && balls > 0 && psize < 6 && (catchFails[b.enemy.species] || 0) < 3) {
    let owned = false; try { owned = party().some(q => q.species === b.enemy.species); } catch (e) {}
    let partyDesc = ''; try { partyDesc = party().map(q => `${q.species} Lv${q.level}`).join(', '); } catch (e) {}
    const ehp = b.enemy.maxHp ? Math.round(100 * b.enemy.hp / b.enemy.maxHp) : null;
    opts.CATCH = `Throw a Poke Ball (${balls} left) to try to CATCH this wild ${b.enemy.species} Lv${b.enemy.level} (types ${(b.enemy.types || []).join('/')}). Our party has only ${psize} Pokemon (${partyDesc}). ${psize < 3 ? 'More members with different types add coverage vs Grass weaknesses (Fire/Ice/Flying/Psychic) and a backup when the lead runs out of PP' : 'more members add coverage'}${!owned ? '; a NEW species also fills the Pokedex' : ''}.${owned ? ' We ALREADY own this species.' : ''} ${(() => { try { const pl = party(); const top = Math.max(...pl.map(q => q.level)); const weak = pl.filter(q => q.level < top - 15); return weak.length ? ` PARTY WEAKNESS: only our lead is a real fighter; ${weak.map(q => q.species + ' Lv' + q.level).join(', ')} ${weak.length > 1 ? 'are' : 'is'} far too weak to help (Lv${top} lead). ${b.enemy.level > Math.max(...weak.map(q => q.level)) ? `This Lv${b.enemy.level} ${b.enemy.species} would immediately be STRONGER than them and a real backup for gyms/rival/Elite Four.` : ''}` : ''; } catch (e) { return ''; } })()} Enemy HP ${ehp != null ? ehp + '%' : 'unknown'}: catch chance is much higher at low HP; at full HP it often breaks free (ball wasted).${catchFails[b.enemy.species] ? ` Already failed ${catchFails[b.enemy.species]}x on this species.` : ''}`;
  }
  // Session 20260927-051226: ETHER/ELIXER in battle (listed as a next step 6+ sessions). Offered when the lead's strongest damaging move is low on PP.
  let pots = []; try { pots = bag().filter(i => /ETHER|ELIXER/i.test(i.name || '')); } catch (e) {}
  const dm = b.player.moves.filter(m => m.power > 0).sort((x, y) => y.power - x.power)[0];
  if (pots.length && dm && dm.pp <= 3 && (etherFails < 2)) {
    etherPlan = { item: pots[0].name, moveIdx: b.player.moves.indexOf(dm), move: dm.name };
    opts.USE_ETHER = `Use ${pots[0].name} (${pots.map(i => i.name + ' x' + (i.qty || 1)).join(', ')} in bag) on ${b.player.species} to restore PP of ${dm.name} (now ${dm.pp}/${dm.maxPp} PP; our strongest attack). Costs this turn (enemy attacks freely). Worth it if the battle or the next ones need this move; otherwise we would fall back to weaker moves or STRUGGLE.`;
  }
  // Session 20260927-220848: healing items in battle (HP carries between E4 rooms). Offered when the lead is below 40% HP; reuses the ETHER flow.
  let heals = []; try { heals = bag().filter(i => /^(POTION|SUPER POTION|HYPER POTION|MAX POTION|FULL RESTORE)$/i.test(i.name || '')); } catch (e) {}
  let ehNow = null; try { ehNow = b.kind === 'trainer' ? enemyHitEst(b) : null; } catch (e) {}
  if (!opts.USE_ETHER && heals.length && b.player.maxHp && b.player.hp > 0 && (b.player.hp < 0.4 * b.player.maxHp || (ehNow && ehNow.d >= b.player.hp && b.player.hp < 0.7 * b.player.maxHp) || (ehNow && Math.floor(1.9 * ehNow.d) >= b.player.hp && b.player.hp < 0.6 * b.player.maxHp)) && etherFails < 2) {
    const best = heals[heals.length - 1];
    etherPlan = { item: best.name, moveIdx: 0, move: 'HP', heal: true };
    opts.USE_ETHER = `Use ${best.name} (${heals.map(i => i.name + ' x' + (i.qty || 1)).join(', ')} in bag) on ${b.player.species} to restore HP (now ${b.player.hp}/${b.player.maxHp}; POTION +20, SUPER +50, HYPER +200, MAX/FULL RESTORE = full). Costs this turn (enemy attacks freely). HP does NOT come back between Elite Four rooms, so healing the strong lead can save the run; not worth it if the enemy would knock us out again right away or the enemy is almost fainted.`;
  }
  // Session 20260927-225730: live 235310 (CHAMPIONS_ROOM) lead kept falling asleep to EXEGGUTOR HYPNOSIS. Offer a status cure (reuses the item flow).
  try {
    const stt = String(b.player.status || '');
    const cureRe = /SLP|SLEEP/i.test(stt) ? /^(AWAKENING|FULL HEAL|FULL RESTORE)$/i : /PAR/i.test(stt) ? /^(PARLYZ HEAL|FULL HEAL|FULL RESTORE)$/i : /FRZ|FROZ/i.test(stt) ? /^(ICE HEAL|FULL HEAL|FULL RESTORE)$/i : null;
    const cures = cureRe ? bag().filter(i => cureRe.test(i.name || '')) : [];
    if (!opts.USE_ETHER && cures.length && b.player.hp > 0 && etherFails < 2) {
      const c = cures.find(i => !/FULL RESTORE/i.test(i.name)) || cures[0];
      etherPlan = { item: c.name, moveIdx: 0, move: 'STATUS', heal: true };
      opts.USE_ETHER = `Use ${c.name} (${cures.map(i => i.name + ' x' + (i.qty || i.count || 1)).join(', ')} in bag) on ${b.player.species} to cure its ${stt} status${/FULL RESTORE/i.test(c.name) ? ' and restore all HP' : ''}. While ${stt} it cannot attack (sleep lasts 1-7 turns, the enemy may put it back to sleep). Costs this turn; switching instead keeps the status on it.`;
    }
  } catch (e) {}
  // Session 20260928-002731: test 003155 (CHAMPION): VENUSAUR fainted vs EXEGGUTOR, a HAUNTER came in and the bench lost with a REVIVE
  // unused in the bag (in-battle items only covered the active member). Offer reviving the fainted carry from the bench.
  let reviveOpt = null;
  try {
    const rv = bag().find(i => /^(REVIVE|MAX REVIVE)$/i.test(i.name || ''));
    const pt = party(); const ci = pt.findIndex(q => q && q.hp === 0 && (q.level || 0) >= (b.player.level || 0) + 15);
    if (rv && ci >= 0 && b.kind === 'trainer' && !opts.USE_ETHER && etherFails < 2 && b.player.hp > 0) {
      const c = pt[ci], back = /MAX/i.test(rv.name) ? c.maxHp : Math.floor(c.maxHp / 2);
      etherPlan = { item: rv.name, moveIdx: 0, move: 'REVIVE', heal: true, slot: ci };
      reviveOpt = `Use ${rv.name} (x${rv.qty || rv.count || 1}) on FAINTED ${c.species} Lv${c.level} (party slot ${ci}): it comes back with ~${back}/${c.maxHp} HP but stays on the bench; switching it in next turn costs another free enemy hit. ${c.species} is our only strong member (current fighter ${b.player.species} Lv${b.player.level}); without it the bench has to win this battle alone. Costs this turn (the enemy attacks ${b.player.species}). If the bench can still win this battle, reviving AFTER the battle (between rooms) costs no turn; use it now only when the bench is likely to lose (${pt.filter(q => q && q.hp > 0).length} member(s) still standing).`;
    }
  } catch (e) {}
  // Session 20260927-051726: the ghost MAROWAK on POKEMON_TOWER_6F blocks the stairs to 7F; fleeing just retriggers it (live run looped RUN
  // ~every 18s). It can't be caught either. Drop RUN/CATCH and tell Jev it must be knocked out to progress.
  try {
    if (b.kind === 'wild' && b.enemy.species === 'MAROWAK' && gstate().map === 'POKEMON_TOWER_6F') {
      const dmg = Object.keys(opts).filter(k => k !== 'RUN' && k !== 'CATCH');
      if (dmg.length) { delete opts.RUN; delete opts.CATCH; ctx.storyBlocker = 'This MAROWAK is the ghost of Cubone\'s mother blocking the stairs to 7F. Running away only makes it block us again and it cannot be caught: it must be KNOCKED OUT to continue the story (Mr. Fuji on 7F).'; if (!moveCache.has('marowaklog')) { moveCache.set('marowaklog', 1); log('battle: ghost MAROWAK - RUN/CATCH removed, must fight'); } }
    }
    // Session 20260927-054726: the Route 12/16 SNORLAX blocks the road; running leaves it there. Keep CATCH (Jev's call), drop RUN.
    if (b.kind === 'wild' && b.enemy.species === 'SNORLAX' && Object.keys(opts).some(k => k !== 'RUN' && k !== 'CATCH')) {
      delete opts.RUN; ctx.storyBlocker = 'This SNORLAX was blocking the road. Running away leaves it blocking the road again: KNOCK IT OUT or CATCH it (a strong Normal-type team member) to open the way south to FUCHSIA CITY.';
      if (!moveCache.has('snorlaxlog')) { moveCache.set('snorlaxlog', 1); log('battle: SNORLAX - RUN removed'); }
    }
  } catch (e) {}
  // Session 20260927-232731: tests 233137/233543 (CHAMPION): VENUSAUR at 15/256 vs GYARADOS with MAX POTION x2 in the bag was offered
  // the heal under the key "USE_ETHER" and Jev picked CUT twice; it fainted and the bench lost. Give heals/cures their own key + the
  // fact that the bench cannot carry the fight.
  try { if (opts.USE_ETHER && etherPlan && etherPlan.heal) { let other = 0; try { other = Math.max(0, ...party().filter(q => q.species !== b.player.species || q.level !== b.player.level).map(q => q.level || 0)); } catch (e) {}
    let surv = ''; try { const eh = enemyHitEst(b); if (eh && etherPlan.move === 'HP') { const it = etherPlan.item.toUpperCase(); const after = Math.min(b.player.maxHp, /MAX|FULL/.test(it) ? b.player.maxHp : b.player.hp + (/HYPER/.test(it) ? 200 : /SUPER/.test(it) ? 50 : 20)); const k = attacksBeforeFaint(b, Math.max(1, after - eh.d), eh.d); surv = ` SURVIVAL: now ${b.player.hp} HP vs ~${eh.d} lost per enemy turn (${eh.how}); after ${etherPlan.item} (~${after} HP, minus the free enemy hit this turn) ${b.player.species} could attack about ${Math.max(0, k)} more time(s) before fainting, compared with ${Math.max(0, attacksBeforeFaint(b, b.player.hp, eh.d))} now.`; const cr = Math.floor(1.9 * eh.d); surv += ` CRITS: a critical hit does ~${cr}; now ${b.player.hp} HP ${cr >= b.player.hp ? 'DIES to one crit' : 'survives one crit'}; after ${etherPlan.item} (~${after} HP) it ${after - eh.d - cr > 0 ? 'survives the free hit AND a crit' : after - cr > 0 ? 'survives one crit' : 'still dies to one crit'}.`; } } catch (e) {}
    opts.HEAL_ITEM = opts.USE_ETHER + surv + (b.kind === 'trainer' && b.player.level - other >= 20 ? ` ${b.player.species} Lv${b.player.level} is our only strong member (next best Lv${other}); if it faints the bench cannot win this battle.` : ''); delete opts.USE_ETHER; } } catch (e) {}
  if (reviveOpt && !opts.HEAL_ITEM && !opts.USE_ETHER) opts.REVIVE_CARRY = reviveOpt; else if (etherPlan && etherPlan.move === 'REVIVE') etherPlan = null;
  // Session 20260928-000731: test 001448 (CHAMPION, EXEGGUTOR): every attack said "WE LIKELY FAINT BEFORE IT KOs" at the END of a long text,
  // HEAL_ITEM said 2 -> 4 attack turns, Jev still picked DOUBLE-EDGE (0.6) and VENUSAUR fainted. Put the verdict first + a state summary.
  try {
    const doomed = Object.keys(opts).filter(k => /WE LIKELY FAINT BEFORE IT KOs|KNOCKS OUT .* ITSELF/.test(opts[k]));
    doomed.forEach(k => { opts[k] = `WE FAINT FIRST (see SURVIVAL at the end). ${opts[k]}`; });
    const risky = Object.keys(opts).filter(k => !doomed.includes(k) && /CRIT RISK:/.test(opts[k]));
    risky.forEach(k => { opts[k] = `CRIT RISK (see the end). ${opts[k]}`; });
    if (opts.HEAL_ITEM && risky.length) { const pc = Math.round(100 * critChance(b)); opts.HEAL_ITEM += ` Each ${b.enemy.species} attack has ~${pc}% crit chance (~2x damage).`; }
    const attacks = Object.keys(opts).filter(k => /SURVIVAL:/.test(opts[k]) && k !== 'HEAL_ITEM');
    if (opts.HEAL_ITEM && attacks.length && doomed.length === attacks.length) ctx.danger = `Every attack option is predicted to leave ${b.player.species} (${b.player.hp}/${b.player.maxHp} HP) FAINTED before it knocks out ${b.enemy.species} (${b.enemy.hp}/${b.enemy.maxHp} HP); HEAL_ITEM is the only option that keeps it alive to finish this enemy.`;
  } catch (e) {}
  let pick = askChoice(ctx, b.kind === 'wild' ? (opts.CATCH ? 'Wild battle: which action this turn best serves the overall goal of beating the game (a stronger, more varied team; keep enough HP to keep exploring)? Attack with a move (weakens it for a catch or gains EXP), CATCH it with a Poke Ball, or RUN away.' : 'Wild battle: which action this turn best serves the overall goal (keep enough HP to keep exploring, gain EXP only when worth it)? Attack with a move, or RUN away.') : 'Which move should the player use this turn to win the battle efficiently (knock out the enemy while keeping our HP)?', opts, best);
  if (pick && switchIdx[pick] != null) { if (curSlotG >= 0) swFrom.slots.add(curSlotG); swFrom.tries = swFrom.tries || {}; swFrom.tries[switchIdx[pick]] = (swFrom.tries[switchIdx[pick]] || 0) + 1; wantSwitch = switchIdx[pick]; log(`battle: Jev chose ${pick}`); moveCache.set(key, -5); return -5; }
  // Session 20260927-120009: a pick outside the offered options (jev error/null) fell through to findIndex -> -1 / a dropped move.
  if (!pick || !(pick in opts)) { log(`battle: pick ${pick} not in options, using ${best}`); pick = best; }
  const idx = pick === 'USE_ETHER' || pick === 'HEAL_ITEM' || pick === 'REVIVE_CARRY' ? -4 : pick === 'CATCH' ? -3 : pick === 'RUN' ? -2 : b.player.moves.findIndex(m => m.name === pick);
  if (idx >= 0 && !(b.player.moves[idx].power > 0) && !/^(NIGHT SHADE|SEISMIC TOSS|SONIC BOOM|DRAGON RAGE)$/.test(b.player.moves[idx].name)) statusUsed.n[pick] = (statusUsed.n[pick] || 0) + 1;
  moveCache.set(key, idx);
  return idx;
}

// Battle memory: remember who we fought and whether we lost (money halves / party fainted), so goal() can tell Jev.
let curBattle = null; const battleHistory = [];
function noteBattleEnd() {
  if (!curBattle) return;
  const curKind = curBattle.kind;
  const st = gstate(), p = party(), lost = st.money < curBattle.money * 0.8 || (p.length && p.every(m => m.hp === 0));
  const r = `${lost ? 'LOST to' : 'beat/escaped'} ${curBattle.kind} ${curBattle.enemy} with our lead at Lv${curBattle.lv}`;
  battleHistory.push(r); if (battleHistory.length > 6) battleHistory.shift();
  log(`battle result: ${r}`); curBattle = null; goalCache.clear();
  // Session 20260927-205516 (DEEP): after a battle the game reloads the map blocks and the map script re-applies switch tiles
  // (VR 3F (7,10), VR 2F (6-7,8-9)) only on a later overworld frame. grid() read right at battle end showed those walls CLOSED, the
  // boulder solver found no route and the goal picker walked off the map (live 215451 looped 3F<->2F). Wait until grid() is stable.
  try { postBattleSettle(); } catch (e) {}
  // Session 20260927-223730 (DEEP): beating a trainer can OPEN the map (E4 rooms: the exit door is a wall until the member is beaten).
  // The bot walked into the closed door first, learned (4,1,UP)/(5,1,UP) as blocked + destFail, and after the win the door read
  // "NO walking path" forever (live 233308 bounced in BRUNOS_ROOM after beating Bruno; only a reload cleared it). Forget them.
  try { if (!lost && curKind === 'trainer') { const m = st.map; let n = 0;
    for (const k of [...LEARNED_BLOCKS]) if (k.startsWith(m + ':')) { LEARNED_BLOCKS.delete(k); n++; }
    for (const k of Object.keys(destFail)) if (k.startsWith(m + '|') || k.startsWith(m + '#')) { delete destFail[k]; n++; }
    try { destCache.clear(); } catch (e) {} destState.pick = null; destState.ticks = 0;
    log(`battle won on ${m}: forgot ${n} learned blocks/dest failures (the map may have opened)`); } } catch (e) { log(`forget blocks ${e}`); }
  if (disabledMoves.size) { disabledMoves = new Set(); moveCache.clear(); }
  uselessMoves = {}; uselessSeen = '';
}
let uselessSeen = '';

let partyDbg = 0;
// Trainer "Will RED change POKeMON?" prompt: Jev decides keep the lead vs switch in a bench member (EXP for Onix/Geodude, matchups).
let lastSentTi = -1, outIdx = -1; // party slot last sent from the party menu / the one the game said is already out
let wantSwitch = null; const switchCache = new Map();
function askSwitch(forcedFrom = null) {
  try {
    const b = battle(), pp = party();
    if (!pp || pp.length < 2) return 0;
    const et = (b.enemy && b.enemy.types) || [];
    const key = `${b.enemy.species}|${b.enemy.level}|${pp.map(m => m.hp).join(',')}`;
    if (switchCache.has(key)) return switchCache.get(key);
    const mv = m => (m.moves || []).filter(x => x && x.name && (x.power || 0) > 0 && (x.pp || 0) > 0);
    const eff = (t) => { try { return rom.effectiveness(t, et); } catch (e) { return 1; } };
    const desc = (m) => {
      const atk = mv(m).map(x => `${x.name} ${x.type} pow ${x.power} x${eff(x.type)} PP ${x.pp}`).join('; ') || 'NO damaging move with PP left';
      let def = 1; try { def = Math.max(1, ...(b.enemy.moves || []).filter(x => x && x.power > 0).map(x => rom.effectiveness(x.type, m.types || []))); } catch (e) {}
      return `${m.species} Lv${m.level} (${(m.types || []).join('/')}) HP ${m.hp}/${m.maxHp}; attacks: ${atk}; level gap vs enemy ${m.level - b.enemy.level}; enemy's known moves hit it x${def}${(m.level - b.enemy.level) <= -15 ? '; FAR UNDERLEVELED: likely fainted in 1-2 hits without doing real damage' : ''}`;
    };
    if (forcedFrom != null) { // Session 20260927-214016: forced replacement after a faint (was: first living slot, hard-coded)
      const ro = {}; pp.forEach((m, i) => { if (m.hp > 0 && i !== forcedFrom) { let st = 1; try { st = Math.max(...et.map(t => rom.effectiveness(t, m.types || []))); } catch (e) {} ro[`send${i}`] = `send out ${desc(m)}; the enemy's own ${et.join('/')} type hits it x${st}. It comes in safely (no free enemy hit after a faint).`; } });
      const ks = Object.keys(ro); if (!ks.length) return -1; if (ks.length === 1) return parseInt(ks[0].slice(4), 10);
      const fk = `F|${key}`; if (switchCache.has(fk)) return switchCache.get(fk);
      const pick = askChoice({ enemy: `${b.enemy.species} Lv${b.enemy.level} (${et.join('/')}) HP ${b.enemy.hp}/${b.enemy.maxHp}`, battleKind: b.kind, map: gstate().map },
        'Our Pokemon fainted. Which member do we send out next vs this enemy? Prefer one that resists the enemy and hits it super-effectively; a far underleveled member just faints for nothing.', ro, ks[0]);
      const ti = parseInt(String(pick || ks[0]).slice(4), 10); const r = Number.isFinite(ti) && pp[ti] && pp[ti].hp > 0 ? ti : parseInt(ks[0].slice(4), 10);
      switchCache.set(fk, r); return r;
    }
    const opts = { keep: `keep ${desc(pp[0])} in battle (the current lead)` };
    pp.forEach((m, i) => { if (i > 0 && m.hp > 0) opts[`switch${i}`] = `switch to ${desc(m)}. A switch costs a free enemy hit on the incoming Pokemon. Low-level members need EXP (EXP is shared by all who took part).`; });
    if (Object.keys(opts).length < 2) return 0;
    // Session 20260927-214848: tell Jev who the E4 member in this room fields next, so its keep/switch choice can plan the lead.
    const E4 = { LORELEIS_ROOM: 'LORELEI: DEWGONG, CLOYSTER, SLOWBRO, JYNX, LAPRAS (Water/Ice/Psychic Lv53-56): Ice hits Grass VENUSAUR x2; HAUNTER NIGHT SHADE does fixed damage', BRUNOS_ROOM: 'BRUNO: ONIX x2, HITMONCHAN, HITMONLEE, MACHAMP (Rock/Fighting Lv53-58): VENUSAUR Grass hits ONIX x4; Fighting cannot touch Ghosts', AGATHAS_ROOM: 'AGATHA: GENGAR x2, GOLBAT, HAUNTER, ARBOK (Ghost/Poison Lv54-60): Normal moves cannot hit Ghosts; Poison resists Grass', LANCES_ROOM: 'LANCE: GYARADOS, DRAGONAIR x2, AERODACTYL, DRAGONITE (Lv56-62)', CHAMPIONS_ROOM: 'CHAMPION rival: mixed team Lv59-65' };
    const pick = askChoice({ enemy: `${b.enemy.species} Lv${b.enemy.level} (${et.join('/')})`, battleKind: b.kind, ...(E4[gstate().map] ? { eliteFourTeam: E4[gstate().map] } : {}) },
      'The trainer is about to send out this enemy. Keep the current Pokemon or switch? Switch only if the incoming member can survive and win, or to protect a weakened lead.', opts, 'keep');
    const ti = pick === 'keep' ? 0 : parseInt(pick.replace('switch', ''), 10) || 0;
    switchCache.set(key, ti); return ti;
  } catch (e) { log(`askSwitch failed: ${e}`); return 0; }
}
function battleStep() {
  try { if (!curBattle) { const b = battle(); curBattle = { kind: b.kind, enemy: `${b.enemy.species} Lv${b.enemy.level}`, lv: b.player.level, money: gstate().money }; } } catch (e) {}
  const s = screen();
  try {
    const t0 = (s.rows || []).join('|');
    // Session 20260927-225230: live 234946 marked our LICK USELESS after "Enemy DRAGONITE used BARRIER!" -> "Nothing happened!".
    // Only blame our move when the last "used" line on screen was ours, not the enemy's.
    if (/Enemy [^|]* used /i.test(t0) || /^Enemy /i.test((s.rows || []).find(r => / used /.test(r)) || '')) lastUserEnemy = true;
    else if (/ used [A-Z]/.test(t0)) lastUserEnemy = false;
    if (lastPickedMove && !lastUserEnemy && /Nothing happened|But it failed/i.test(t0) && uselessSeen !== lastPickedMove + '#' + (uselessMoves[lastPickedMove] || 0)) {
      uselessMoves[lastPickedMove] = (uselessMoves[lastPickedMove] || 0) + 1; uselessSeen = lastPickedMove + '#' + uselessMoves[lastPickedMove]; moveCache.clear();
      log(`battle: ${lastPickedMove} -> "Nothing happened/failed" (${uselessMoves[lastPickedMove]}x), marking USELESS`);
    }
  } catch (e) {}
  if (lastPickedMove && s.rows.some(r => /move is\s*disabled|is disabled!/i.test(r) && !/no more/i.test(r)) && !disabledMoves.has(lastPickedMove)) {
    disabledMoves.add(lastPickedMove); moveCache.clear(); log(`battle: ${lastPickedMove} is disabled, excluding it`);
  }
  // Party-menu mechanics (party >= 2 since Rock Tunnel). Live run 030826 froze: trainer "Will RED change POKeMON?" -> A (YES)
  // -> party menu -> A on the active mon -> "is already out!" -> same menu, forever. Decline the voluntary switch; when our
  // lead fainted ("Bring out which" / "no will to fight") send out the first healthy member instead.
  const txt = (s.rows || []).join('|');
  if (s.cursor && /change\s*POK/i.test(txt) && !/Bring out|no will/i.test(txt)) {
    const ti = askSwitch();
    if (ti > 0) { wantSwitch = ti; press('A', 4, 20); log(`battle: switch prompt YES -> member ${ti}`); return; }
    press('B', 4, 12); log('battle: declined the switch prompt (NO)'); return;
  }
  let bAct = null; try { const bt = battle(); if (bt && bt.player && typeof bt.player.slot === 'number') bAct = bt.player; } catch (e) {}
  if (/already out/i.test(txt)) { wantSwitch = null; outIdx = bAct ? bAct.slot : lastSentTi; }
  if (/Choose a POK|Bring out which|already out|no will to fight/i.test(txt)) {
    let pp = []; try { pp = party(); } catch (e) {}
    // Test 20260927-041524: slot 0 FNT made every party-menu visit "forced"; the bot re-sent slot 1 (ONIX, already out) 160x.
    // A member the game says is "already out" is skipped; if nobody else can go, leave the menu and fight on.
    if (/already out/i.test(txt) && !pp.some((m, i) => m.hp > 0 && i !== outIdx)) { press('B', 4, 12); press('B', 4, 12); log('battle: only the member already out can fight; back to the battle menu'); return; }
    // the ACTIVE battler (battle().player.slot), not party slot 0, decides whether a replacement is forced
    const forced = /Bring out which|no will to fight/i.test(txt) || (bAct ? bAct.hp === 0 : (pp[0] && pp[0].hp === 0 && !/already out/i.test(txt)));
    if (bAct && bAct.hp > 0) outIdx = bAct.slot;
    const chosen = wantSwitch; wantSwitch = null;
    if (!forced && chosen == null) { press('B', 4, 12); press('B', 4, 12); log('battle: left the party menu (no switch)'); return; }
    let ti = !forced && chosen != null && pp[chosen] && pp[chosen].hp > 0 ? chosen : (pp[0] && pp[0].hp > 0 ? (askSwitch() || pp.findIndex((m, i) => i > 0 && m.hp > 0)) : pp.findIndex(m => m.hp > 0));
    if (ti === outIdx) ti = pp.findIndex((m, i) => m.hp > 0 && i !== outIdx);
    // Test 20260927-114521 (rival on 7F): only slot 0 alive, the active slot 5 fainted -> ti was -1 and the bot pressed B at
    // "Bring out which POKeMON?" for 22k frames. A forced replacement must be ANY living member (slot 0 included).
    if (forced) { const fs = bAct ? bAct.slot : (pp[0] && pp[0].hp === 0 ? 0 : outIdx); const jt = askSwitch(fs == null ? -1 : fs); if (jt >= 0 && pp[jt] && pp[jt].hp > 0) { ti = jt; log(`battle: Jev picked replacement ${ti} (${pp[ti].species})`); } }
    if (forced && (ti < 0 || !pp[ti] || !(pp[ti].hp > 0))) ti = pp.findIndex(m => m.hp > 0);
    if (ti < 0 && !forced) { press('B', 4, 12); press('B', 4, 12); log('battle: nobody else to send; back to the battle menu'); return; }
    lastSentTi = ti; // lead alive but menu won't close (live freeze 030826): Jev picks a bench member
    if (ti < 0) { press('B', 4, 12); return; }
    for (let k = 0; k < 10; k++) { const sc = screen(); if (!sc.cursor || /no will to fight/i.test(sc.rows.join('|'))) { press('B', 4, 12); continue; } const cy = sc.cursor.y; // Test 022030: every nickname is "AAAAAAAAAA", so match rows by ANY party name and take the ti-th (one name row per member).
      const nms = pp.map(m => (m.nickname || m.species || '').toString().trim()).filter(Boolean);
      const rowsWith = sc.rows.map((r, i) => nms.some(n => r.includes(n)) ? i : -1).filter(i => i >= 0); const tr = rowsWith.length >= pp.length ? rowsWith[ti] : null;
      if (partyDbg++ < 3) log(`partymenu: cy=${cy} cx=${sc.cursor.x} tr=${tr} rows=${JSON.stringify(rowsWith)} r=${JSON.stringify(sc.rows.slice(0, 7))}`); if (tr == null) { press('DOWN', 4, 10); break; } if (cy === tr || cy === tr + 1) break; press(cy < tr ? 'DOWN' : 'UP', 4, 10); } // cursor sits on the HP row (name row + 1)
    press('A', 4, 20); for (let w = 0; w < 4; w++) { if (/SWITCH|SEND OUT/i.test(screen().rows.join('|'))) { press('A', 4, 20); break; } wait(6); }
    log(`battle: lead fainted, sent out party member ${ti}`); return;
  }
  if (s.cursor) {
    const b = battle(), row = s.rows[s.cursor.y] || '';
    const names = b.player.moves.map(m => m.name);
    const inMoveMenu = names.some(n => n && row.includes(n)) || s.rows.some(r => r.includes('TYPE/'));
    if (inMoveMenu) {
      const idx = pickMove(b);
      if (idx === -4 && etherPlan) { // ETHER: main menu -> ITEM -> scroll to the ether -> A -> pick lead -> (ETHER only) pick the move
        let out = false;
        for (let k = 0; k < 4 && !out; k++) { press('B', 4, 20); const sr = screen(); out = !sr.rows.some(r => r.includes('TYPE/')) && sr.rows.some(r => /\bRUN\b/.test(r)); }
        if (!out) { etherFails++; moveCache.clear(); log('battle: ETHER - could not leave move menu'); return; }
        // Session 20260928-000731: test 001129 (CHAMPION, VENUSAUR 27/263 PAR): Jev picked HEAL_ITEM, the scan pressed DOWN 25x and never
        // matched MAX POTION -> etherFails=9, no more heals, VENUSAUR fainted. Make sure the bag list (CANCEL / "x N" rows) is really open
        // before scanning (re-press A on ITEM if the FIGHT/RUN menu is still showing), and dump the screen when the scan fails.
        press('UP', 4, 12); press('LEFT', 4, 12); press('DOWN', 4, 12); press('A', 4, 30);
        const listOpen = () => { const t = screen().rows.join('|'); return /CANCEL|[x×] ?\d/.test(t) && !(/FIGHT/.test(t) && /\bRUN\b/.test(t) && !/CANCEL/.test(t)); };
        for (let k = 0; k < 4 && !listOpen(); k++) { wait(10); if (!listOpen()) { const t = screen().rows.join('|'); if (/FIGHT/.test(t) && /\bRUN\b/.test(t)) { press('UP', 4, 12); press('LEFT', 4, 12); press('DOWN', 4, 12); press('A', 4, 30); } } }
        let ok = false; const re = new RegExp(etherPlan.item.replace(/[^A-Z ]/gi, '.'), 'i'); const seen = [];
        for (let k = 0; k < 60; k++) { const sc = screen(); if (!sc.cursor) { seen.push('nocursor'); wait(8); continue; } const row = sc.rows[sc.cursor.y] || ''; if (seen.length < 30) seen.push(row.trim()); if (re.test(row)) { ok = true; break; } if (/CANCEL/.test(row)) break; press('DOWN', 4, 10); } // 25 was too few: ~40% of DOWN presses don't register in this list (rows read twice), MAX POTION is item 18
        if (!ok) { try { log(`battle: item scan rows=${JSON.stringify(seen.slice(0, 30))} screen=${JSON.stringify(screen().rows)}`); } catch (e) {} }
        if (!ok) { for (let k = 0; k < 3; k++) press('B', 4, 12); press('UP', 4, 12); press('LEFT', 4, 12); etherFails++; moveCache.clear(); log('battle: ETHER - item not found in list'); return; }
        if (etherPlan.slot != null) { press('A', 4, 40); wait(20); partyCursorTo(etherPlan.slot); press('A', 4, 40); } // REVIVE on a benched member
        else { press('A', 4, 40); press('A', 4, 40); } // use -> lead (party cursor starts on the active mon's slot 0)
        if (!etherPlan.heal && (/ETHER/i.test(etherPlan.item) || /technique|which/i.test(screen().rows.join('|')))) {
          for (let k = 0; k < etherPlan.moveIdx; k++) press('DOWN', 4, 10);
          press('A', 4, 40);
        }
        for (let k = 0; k < 6; k++) { const t = screen().rows.join('|'); if (/FIGHT/.test(t) && /RUN/.test(t)) break; press('A', 4, 20); }
        moveCache.clear(); log(`battle: Jev chose ${etherPlan.item} for ${etherPlan.move} -> PP now ${JSON.stringify((battle().player.moves || []).map(m => m.name + ':' + m.pp))}`); etherPlan = null; return;
      }
      if (idx === -3) { // CATCH: back out to main menu, ITEM (bottom-left), move bag cursor onto a BALL, A throws it
        let out = false;
        for (let k = 0; k < 4 && !out; k++) { press('B', 4, 20); const sr = screen(); out = !sr.rows.some(r => r.includes('TYPE/')) && sr.rows.some(r => /\bRUN\b/.test(r)); }
        const sp = (curBattle && curBattle.enemy || '').split(' ')[0];
        if (!out) { catchFails[sp] = (catchFails[sp] || 0) + 1; moveCache.clear(); log('battle: CATCH - could not leave move menu'); return; }
        press('UP', 4, 12); press('LEFT', 4, 12); press('DOWN', 4, 12); press('A', 4, 30);
        let ok = false;
        for (let k = 0; k < 20; k++) {
          const sc = screen(); if (!sc.cursor) break;
          if (/BALL/.test(sc.rows[sc.cursor.y] || '')) { ok = true; break; }
          press('DOWN', 4, 10);
        }
        if (!ok) { for (let k = 0; k < 3; k++) press('B', 4, 12); press('UP', 4, 12); press('LEFT', 4, 12); catchFails[sp] = 3; moveCache.clear(); log('battle: CATCH - no ball found in list'); return; }
        press('A', 4, 60); catchTries++;
        for (let k = 0; k < 12; k++) { const t = screen().rows.join('|'); if (/caught|Gotcha/i.test(t)) { log(`battle: CAUGHT ${sp}`); break; } if (/broke free|missed|Darn|Aww|Shoot/i.test(t)) { catchFails[sp] = (catchFails[sp] || 0) + 1; moveCache.clear(); break; } press('A', 4, 20); }
        log(`battle: Jev chose CATCH (${sp})`); return;
      }
      if (idx === -5) { // SWITCH: back out to the main battle menu, PKMN is top-right; the party menu handler sends wantSwitch
        if (wantSwitch == null) { moveCache.clear(); press('B', 4, 12); return; } // slot 0 is valid when a bench mon is active (live 074815: SWITCH_0 re-asked 585x)
        let out = false;
        for (let k = 0; k < 4 && !out; k++) { press('B', 4, 20); const sr = screen(); out = !sr.rows.some(r => r.includes('TYPE/')) && sr.rows.some(r => /\bRUN\b/.test(r)); }
        if (!out) { log('battle: SWITCH - could not leave the move menu, retrying next step'); return; }
        press('UP', 4, 12); press('RIGHT', 4, 12); press('A', 4, 30); moveCache.clear();
        log(`battle: opened party menu to switch to member ${wantSwitch}`); return;
      }
      if (idx === -2 && b.kind !== 'wild') { moveCache.clear(); log('battle: RUN picked in a non-wild battle, ignoring'); press('A', 4, 12); return; }
      if (idx === -2) { // RUN: back out to the main battle menu, move cursor to RUN (bottom-right), confirm
        let out = false;
        for (let k = 0; k < 4 && !out; k++) { press('B', 4, 20); const sr = screen(); out = !sr.rows.some(r => r.includes('TYPE/')) && sr.rows.some(r => /\bRUN\b/.test(r)); }
        if (!out) { log('battle: RUN - could not leave the move menu, retrying next step'); return; }
        press('UP', 4, 12); press('LEFT', 4, 12); press('DOWN', 4, 12); press('RIGHT', 4, 12); press('A', 4, 30);
        const r2 = screen().rows.join('|'); if (/already out|PKMN|POKéMON/i.test(r2) && !/Got away/i.test(r2)) { press('B', 4, 12); press('B', 4, 12); press('UP', 4, 12); press('LEFT', 4, 12); }
        log('battle: Jev chose RUN'); return;
      }
      if (idx != null && idx >= 0) {
        lastPickedMove = names[idx];
        for (let i = 0; i < 6; i++) {
          const sc = screen(), top = sc.rows.findIndex(r => r.includes(names[0]));
          if (!sc.cursor || top < 0) break;
          const cur = sc.cursor.y - top;
          if (cur === idx) break;
          press(cur < idx ? 'DOWN' : 'UP', 4, 8);
        }
      }
      press('A', 4, 12);
      // A disabled move shows "The move is disabled!" briefly and returns to the menu: check right after the pick.
      for (let i = 0; i < 3 && lastPickedMove; i++) {
        const sc = screen();
        if (sc.rows.some(r => /move is\s*disabled|is disabled!/i.test(r) && !/no more/i.test(r))) {
          if (!disabledMoves.has(lastPickedMove)) { disabledMoves.add(lastPickedMove); moveCache.clear(); log(`battle: ${lastPickedMove} is disabled (after pick), excluding it`); }
          break;
        }
        wait(6);
      }
      return;
    }
  }
  // Live run 063813 froze: a cached RUN pick (key lacked battle kind) was replayed in a trainer battle, the main-menu cursor stayed on RUN
  // and every later A re-tried RUN ("No! There's no running from a trainer battle!"). Put the cursor back on FIGHT before pressing A.
  try { if (s.cursor) { const rows = s.rows, fy = rows.findIndex(r => /FIGHT/.test(r)); if (fy >= 0 && rows.some(r => /\bRUN\b/.test(r))) { const fx = rows[fy].indexOf('FIGHT'); if (s.cursor.y !== fy) press('UP', 4, 8); if (s.cursor.x > fx + 2) press('LEFT', 4, 8); } } } catch (e) {}
  // Session 20260927-205016: live state started in a wild battle with the BAG open (cursor on TM34); A-spam looped "This isn't the
  // time to use that!" for 30k frames (test 205253, 0 Jev calls). A bag list (item rows, no FIGHT) with nothing chosen -> back out.
  try { const sig = (s.rows || []).join('|'); if (s.cursor && !/FIGHT/.test(sig) && /CANCEL|TM\d\d|S\.S\.TICKET|FOSSIL|POK. FLUTE/.test(sig)) { press('B', 4, 12); press('B', 4, 12); return; } } catch (e) {}
  press('A', 4, 12); // FIGHT / advance text
}

const hpFrac = p => p.reduce((a, m) => a + m.hp, 0) / Math.max(1, p.reduce((a, m) => a + m.maxHp, 0));
// Story stage from storyEvents (facts for Jev's context; Jev still decides): <7 fetch parcel, 7-10 deliver it, >=11 Pokedex in hand -> north.
let lastStory = null, hasBadge1 = false, seenCeladon = false, seenSouth = false; // gstate() sometimes omits storyEvents outdoors; keep the last known value
function stage(st) { if (/CERULEAN/.test(st.map || '')) seenCerulean = true;
  if (st.storyEvents != null) lastStory = st.storyEvents;
  // Unknown at start on a map only reachable after the Pokedex (old man blocks Route 2 before) -> assume errand done.
  if (lastStory == null && /^(ROUTE_2|VIRIDIAN_FOREST|PEWTER|ROUTE_3|MT_MOON|DIGLETTS)/.test(st.map || '')) lastStory = 11;
  const e = lastStory;
  hasBadge1 = (st.badges || 0) >= 1 || hasBadge1;
  if (/CELADON|GAME_CORNER/.test(st.map || '')) seenCeladon = true;
  // Session 20260927-042225: after Giovanni (SILPH SCOPE in bag) the goal text moves on to Lavender / Pokemon Tower.
  // Session 20260927-052726: after Mr. Fuji (POKE FLUTE in bag) the goal moves on to Snorlax (Route 12) -> Fuchsia / Koga.
  // Session 20260927-075728: once south of Snorlax (Route 13/14/15/Fuchsia seen) the Snorlax/Lavender text misleads Jev.
  if (/^(ROUTE_13|ROUTE_14|ROUTE_15|FUCHSIA|SAFARI|WARDENS)/.test(st.map || '')) seenSouth = true;
  // Session 20260927-084228: bag-aware badge-5 goal (SURF / GOLD TEETH / STRENGTH).
  // Session 20260927-170513: on Cinnabar / in the Mansion the "walk to Pallet" text misleads Jev; bag-aware SECRET KEY goal.
  if ((st.badges || 0) === 6 && /^(CINNABAR|POKEMON_MANSION)/.test(st.map || '')) { let b = []; try { b = bag().map(i => String(i.name || '')); } catch (e) {}
    const key = b.some(n => /SECRET KEY/i.test(n));
    // Session 20260927-172513: live bot is INSIDE CINNABAR_GYM; the "leave the mansion" goal text no longer fits.
    if (st.map === 'CINNABAR_GYM') return { goal: 'Become Champion; 6 badges DONE. We are INSIDE the CINNABAR_GYM now (badge 7 not won yet): beat BLAINE (Fire type; Water/Rock/Ground moves are strong) at the back of the gym. The gym is split into rooms by locked doors; each QUIZ MACHINE (talk to it) asks a question: a right answer opens the next door, a wrong one starts a trainer battle (also fine, beating the trainer lets us pass). Work through the machines/trainers toward BLAINE; do NOT leave the gym unless the team badly needs healing (Cinnabar Pokemon Center is next door).' };
    return { goal: key ? 'Become Champion; 6 badges DONE. SECRET KEY is in the bag: leave the POKEMON MANSION (stairs up to 1F, exit to CINNABAR_ISLAND), heal at the Cinnabar Pokemon Center if hurt, then enter the CINNABAR_GYM (now unlocked) and beat BLAINE (Fire type; Water/Rock/Ground moves are strong) for badge 7. Do NOT wander the Mansion any more.'
      : 'Become Champion; 6 badges DONE; we are on CINNABAR ISLAND. Next: find the SECRET KEY in the POKEMON MANSION basement (B1F): it is an item ball on B1F; pick up item balls there, pressing SECRET SWITCH statues toggles walls when the way is blocked. ' + (st.map === 'POKEMON_MANSION_B1F' ? 'We are ON B1F now: explore B1F and pick up its items (the SECRET KEY is here); do not go back upstairs until it is in the bag. ' : '') + 'Then BLAINE in CINNABAR_GYM (Fire type) for badge 7. Heal at the Cinnabar Pokemon Center if the team is hurt.' }; }
  // Session 20260927-173013: live bot LOST to Blaine (blacked out CINNABAR_GYM -> Pewter) and wandered in Viridian Forest under the
  // old "walk from Fuchsia" text. With the SECRET KEY already in the bag, give the route back to Cinnabar from the Kanto west side.
  if ((st.badges || 0) === 6 && !/^(CINNABAR|POKEMON_MANSION)/.test(st.map || '') && checkSecretKey()) return { goal: 'Become Champion; 6 badges DONE; the SECRET KEY is ALREADY in the bag (mansion done, do NOT search for it again) and the CINNABAR_GYM is unlocked. We blacked out (lost) in Blaine\'s gym and woke up far away. Next: get back to CINNABAR ISLAND: go SOUTH (Pewter City -> Route 2 -> Viridian Forest (exit at its south end) -> Route 2 -> Viridian City -> Route 1 -> PALLET TOWN), then surf south down Route 21 to Cinnabar. ' + (surfOK ? 'LAPRAS knows SURF, so water is travelable (the bot surfs automatically when a path crosses water). ' : '') + 'Heal at a Pokemon Center on the way and at Cinnabar before the gym; avoid long wild battles (run). Then beat BLAINE (Fire type; Water/Rock/Ground moves are strong; VENUSAUR is weak to Fire, so its HP must be full).' };
  // Session 20260927-180014: live bot WON badge 7 (Blaine) but wandered back into POKEMON_MANSION_3F under the old "badge 7 from
  // BLAINE" text. Badge-7 and badge-8 goals so Jev heads to Viridian (Giovanni) and then Route 22/23 -> Victory Road -> Indigo.
  if ((st.badges || 0) >= 8) return { goal: 'Become Champion; ALL 8 badges DONE (Giovanni beaten in the Viridian Gym; do NOT go back into any gym). Next: from VIRIDIAN CITY go WEST to ROUTE_22, then NORTH through the ROUTE_22_GATE (badge check) up ROUTE_23 (guards check badges; SURF across water), through VICTORY_ROAD (STRENGTH boulders onto switches) to INDIGO_PLATEAU; heal and stock up at the Indigo Pokemon Center/Mart, then beat the Elite Four (Lorelei, Bruno, Agatha, Lance) and the Champion (rival BLUE).', done: false };
  if ((st.badges || 0) === 7 && /^VIRIDIAN_(CITY|GYM|POKECENTER|MART)$/.test(st.map || '')) return { goal: 'Become Champion; 7 badges DONE (Blaine beaten; Cinnabar is finished). Now badge 8: ' + (st.map === 'VIRIDIAN_GYM' ? 'we are INSIDE the VIRIDIAN GYM: beat the gym trainers and reach/talk to GIOVANNI at the back (Ground type: Rhyhorn/Dugtrio/Nidoqueen/Nidoking/Rhydon up to Lv50; Grass/Water/Ice moves are strong, VENUSAUR and LAPRAS are good; Electric moves do nothing). The gym floor has spinner arrow tiles. Stay in the gym unless the lead\'s strong moves are out of PP or HP is low, then heal at the Viridian Pokemon Center nearby and come back.' : 'we are in VIRIDIAN CITY: heal at the Pokemon Center if hurt or low on PP, then enter the VIRIDIAN GYM in the north of the city and beat GIOVANNI (Ground type). After that: Route 22 west -> Route 23 -> Victory Road -> Indigo Plateau.'), done: false };
  if ((st.badges || 0) === 7) return { goal: 'Become Champion; 7 badges DONE (BLAINE beaten, VOLCANO BADGE won; Cinnabar Island, its gym and the POKEMON MANSION are FINISHED: do NOT go into the mansion or the Cinnabar gym again). Next: badge 8 from GIOVANNI in the VIRIDIAN CITY gym (Ground type: Water/Grass/Ice moves are strong; VENUSAUR and LAPRAS are good). Route: ' + (/^POKEMON_MANSION/.test(st.map || '') ? 'FIRST leave the mansion (stairs/holes DOWN to 1F, exit south to CINNABAR_ISLAND), then ' : '') + 'heal at the Cinnabar Pokemon Center, SURF NORTH from Cinnabar over ROUTE_21 to PALLET_TOWN, walk NORTH up ROUTE_1 to VIRIDIAN_CITY; the gym is in the north part of Viridian City (now open). Map exits toward POKEMON_MANSION / CINNABAR_GYM / Seafoam / Route 20 are BACKWARDS; ROUTE_21 / PALLET_TOWN / ROUTE_1 / VIRIDIAN_CITY are the way forward.', done: false };
  if ((st.badges || 0) >= 6) return { goal: 'Become Champion; 6 badges DONE (SABRINA beaten, MARSH BADGE won; Silph Co. DONE; do NOT go back into SAFFRON_GYM or Silph). Next: badge 7 from BLAINE in the CINNABAR ISLAND gym (Fire type; Water/Rock/Ground moves are strong). Cinnabar is only reachable over water with SURF (HM03 is in the bag): south from PALLET TOWN down Route 21 (the Route 19/20 sea from Fuchsia is SEALED off from Cinnabar, tested; do NOT go there or into SEAFOAM ISLANDS). Current plan: walk overland to PALLET TOWN (Fuchsia -> Route 15 -> 14 -> 13 -> 12 -> Lavender -> Route 8 -> Saffron -> Route 6 -> Vermilion -> Route 11 -> Diglett\'s Cave -> Route 2 -> Viridian -> Route 1 -> Pallet), then surf south on Route 21. ' + (surfOK ? 'LAPRAS in the party knows SURF, so water is travelable now (the bot surfs automatically when a path crosses water).' : 'LAPRAS (can learn SURF) must be in the party and know SURF (PC box at a Pokemon Center, HM03 in the bag).') + ' Blaine\'s gym is locked until the SECRET KEY is found in the POKEMON MANSION on Cinnabar. Heal at a Pokemon Center first if the team is hurt.' };
  if ((st.badges || 0) === 5 || ((st.badges || 0) >= 5 && seenSouth)) { let b = []; try { b = bag().map(i => String(i.name || '')); } catch (e) {} const has = r => b.some(n => r.test(n));
    const surf = has(/HM03|SURF/i), teeth = has(/GOLD TEETH/i), str = has(/HM04|STRENGTH/i);
    // Session 20260927-085728: Saffron gate guards only let us in after we hand them a drink (FRESH WATER / SODA POP / LEMONADE,
    // vending machine on the Celadon Mart roof). Without one the Route 8 gate is a dead end, so send Jev to Celadon first.
    const drink = has(/FRESH WATER|SODA POP|LEMONADE/i) || guardsOk();
    if (surf && str && !drink) return { goal: 'Become Champion; 5 badges DONE, SURF and STRENGTH in bag. Next: SAFFRON CITY, but its gate guards are thirsty and block us until we give them a DRINK. We have NO drink: go north Route 15 -> 14 -> 13 -> 12 -> Lavender Town -> Route 8 -> Underground Path (building on Route 8) -> Route 7 -> CELADON CITY, enter the CELADON MART (dept store), take the stairs/elevator up to the ROOF and buy FRESH WATER from the vending machine (200 money). Then go to any Saffron gate (Route 7 gate is right next to Celadon) and talk to the guard.' };
    // Session 20260927-093729: Silph Co. goal (put off 3+ sessions). CARD KEY on 5F opens the locked shutter doors; teleport pads link floors.
    const card = has(/CARD KEY/i);
    // Session 20260927-094229: after Giovanni on 11F the president gives the MASTER BALL -> Silph is DONE, Sabrina's gym opens.
    const master = has(/MASTER BALL/i);
    if (surf && str && drink && master) return { goal: 'Become Champion; 5 badges DONE and SILPH CO. is DONE (Giovanni beaten, MASTER BALL in bag; do NOT climb Silph again). Next: leave Silph Co. (stairs/elevator down to 1F, exit south to SAFFRON CITY), heal at the Saffron Pokemon Center, then enter the SAFFRON GYM (Fighting Dojo is the building next to it, NOT the gym) and beat SABRINA (Psychic; Kadabra/Mr.Mime/Venomoth/Alakazam up to Lv50, weak to Bug; Ghost moves do nothing useful in Gen 1) for the MARSH BADGE. The gym is a maze of TELEPORT PADS: try untried pads.' };
    if (surf && str && drink && /^SILPH_CO/.test(st.map || '') && silphDone()) return { goal: 'Become Champion; 5 badges DONE, GIOVANNI is BEATEN in Silph Co. (done here). Next: leave Silph Co. (from Giovanni\'s side of 11F take the teleport pad to 7F, 7F\'s other pad to 3F, then the elevator or stairs down to 1F), out to SAFFRON CITY, heal at the Pokemon Center, then beat SABRINA in the SAFFRON GYM (Psychic; the gym is a teleport-pad maze) for badge 6.' };
    if (surf && str && drink && /^SILPH_CO/.test(st.map || '')) return { goal: card ? 'Become Champion; 5 badges DONE, we are INSIDE SILPH CO. and HAVE THE CARD KEY: facing a locked grey door (shutter) and pressing A opens it (the bot does this when a picked target is behind one). Next: go UP to 7F (rival fight) and 11F, using stairs, the elevator and the TELEPORT PADS (warp tiles that jump to another spot/floor; try untried ones), beat the Rockets and GIOVANNI on 11F (the president\'s office). Heal at the Saffron Pokemon Center if the team is weak. Then SABRINA\'s gym in Saffron for badge 6.' : 'Become Champion; 5 badges DONE, we are INSIDE SILPH CO. (Team Rocket took over; Saffron Gym/Sabrina stays blocked until Giovanni is beaten here). Next: find the CARD KEY lying on the floor of 5F (take the stairs up floor by floor; teleport pads = warp tiles jump around a floor; locked grey doors cannot be passed yet). Pick it up (item ball), then it opens the locked doors; head up to 11F and beat GIOVANNI. Beat the Rocket grunts on the way; heal at the Saffron Pokemon Center if the team is weak.' };
    // Session 20260927-124509: after Silph (MASTER BALL may be used up) the goal still said "enter Saffron" while in Sabrina's gym.
    if (surf && str && (silphDone() || st.map === 'SAFFRON_GYM')) return { goal: 'Become Champion; 5 badges DONE and SILPH CO. is DONE. Next: badge 6 from SABRINA in SAFFRON_GYM (Saffron City). Inside the gym, hop TELEPORT PADS toward SABRINA at (9,8) (prefer pads whose landing is closer to her), beat the psychic trainers on the way, then talk to SABRINA. Her team is Lv38-43 psychics (KADABRA, MR.MIME, VENOMOTH, ALAKAZAM): lead with VENUSAUR, heal at the SAFFRON_POKECENTER when low. Do not go back into Silph Co.' + (b.filter(n => /^(TM|HM)/i.test(n)).length ? ' TMs/HMs in bag: ' + b.filter(n => /^(TM|HM)/i.test(n)).join(', ') + '.' : '') };
    if (surf && str) return { goal: 'Become Champion; 5 badges DONE, HM03 SURF and HM04 STRENGTH in bag, and we HAVE A DRINK for the Saffron gate guards. Next: enter SAFFRON CITY through a gate (Route 7 gate from Celadon, or Route 8 gate from Lavender; give the guard the drink), then Silph Co. (Team Rocket) and the SABRINA gym for badge 6. Do not re-enter the Safari Zone.' };
    if (surf && teeth) return { goal: 'Become Champion; 5 badges DONE, SURF and GOLD TEETH in bag. Next: LEAVE the Safari Zone (back through the areas to the SAFARI_ZONE_GATE, south into FUCHSIA CITY) and give the GOLD TEETH to the WARDEN (Warden\'s house in Fuchsia) for HM04 STRENGTH.' };
    if (surf) return { goal: 'Become Champion; 5 badges DONE, HM03 SURF already in bag (do NOT go back to the secret house). Next: pick up the GOLD TEETH item lying on the ground in SAFARI_ZONE_WEST, then leave the Safari Zone and give the teeth to the WARDEN in Fuchsia City for HM04 STRENGTH.' }; }
  if ((st.badges || 0) >= 5 && seenSouth) return { goal: 'Become Champion; 5 badges DONE (KOGA beaten; do NOT fight in the Fuchsia gym again). Next: in FUCHSIA CITY heal, enter the SAFARI ZONE (gate north of the city, 500 money), find the SECRET HOUSE deep inside for HM03 SURF and pick up the GOLD TEETH; give the teeth to the WARDEN in Fuchsia for HM04 STRENGTH. Then head to SAFFRON CITY (Silph Co.) and the SABRINA gym.' };
  if ((st.badges || 0) === 4 && /^FUCHSIA/.test(st.map || '')) return { goal: st.map === 'FUCHSIA_GYM' ? 'Become Champion; 4 badges DONE. We are INSIDE the FUCHSIA GYM: beat the gym trainers (jugglers/tamers, Psychic and Poison Pokemon) and reach KOGA at the back (Poison: Koffing/Muk/Weezing up to Lv43; weak to Psychic/Ground; Ghost moves hit hard), talk to him for the SOUL BADGE (badge 5). The gym has invisible walls, so paths wind around. Only leave to heal at the Fuchsia Pokemon Center if the team is hurt or low on attack PP.' : 'Become Champion; 4 badges DONE and we are in FUCHSIA CITY (do NOT go back east to Route 15). Next: heal at the Fuchsia Pokemon Center if hurt or low on attack PP, then enter the FUCHSIA GYM and beat KOGA (Poison) for the SOUL BADGE (badge 5).' };
  if ((st.badges || 0) === 4 && seenSouth && checkFlute()) return { goal: 'Become Champion; 4 badges DONE, SNORLAX on Route 12 is DONE and we are already SOUTH of it (do NOT go back north to Route 12 / Lavender). Next: go SOUTH down ROUTE_14 (beat the trainers on the way; heal at a Pokemon Center if the lead is low on HP or attack PP), exit WEST at the south end onto ROUTE_15, walk WEST along Route 15 to FUCHSIA CITY, heal at the Fuchsia Pokemon Center, then beat KOGA (Poison gym) for the SOUL BADGE.' };
  if ((st.badges || 0) >= 4 && checkFlute()) return { goal: 'Become Champion; 4 badges DONE, SILPH SCOPE and POKE FLUTE in the bag (Pokemon Tower and Mr. Fuji are DONE; do NOT go back into the tower). Next: heal at the Lavender Pokemon Center if hurt, then go SOUTH from LAVENDER TOWN onto ROUTE_12; a sleeping SNORLAX blocks the road: walk up to it and talk (A) - the bot plays the POKE FLUTE, it wakes and fights (knock it out or catch it; running away is pointless). Continue south along ROUTE_12 -> ROUTE_13 -> ROUTE_14 -> ROUTE_15 west to FUCHSIA CITY and beat KOGA (Poison gym) for the SOUL BADGE.', done: true };
  // Session 20260927-053726: Fuji rescued (flag) but no flute yet -> his house in Lavender.
  if ((st.badges || 0) >= 4 && checkFuji()) return { goal: 'Become Champion; 4 badges DONE, SILPH SCOPE in the bag, Mr. Fuji RESCUED from Pokemon Tower (the tower is DONE; do NOT climb it again). Next: go down the tower stairs to 1F, out to LAVENDER TOWN, enter MR_FUJIS_HOUSE and TALK to Mr. Fuji (old man) to get the POKE FLUTE. Then Route 12 south (Snorlax) -> Fuchsia.', done: true };
  if ((st.badges || 0) >= 4 && checkScope()) return { goal: 'Become Champion; BOULDER, CASCADE, THUNDER and RAINBOW badges DONE and the Rocket hideout is DONE (Giovanni beaten, SILPH SCOPE in the bag; do NOT go back into the hideout). Next: leave the hideout (elevator/stairs up to B1F -> Game Corner -> Celadon), go east: ROUTE_7 -> UNDERGROUND_PATH_ROUTE_7 -> underground path west-east -> UNDERGROUND_PATH_ROUTE_8 -> ROUTE_8 -> LAVENDER TOWN. Heal at the Lavender Pokemon Center, then climb POKEMON TOWER to 7F (the Scope reveals the ghost Marowak on 6F; Rockets on 7F) and rescue Mr. Fuji, who gives the POKE FLUTE. The party is weak besides the lead: catching/training more Pokemon helps.', done: true };
  if ((st.badges || 0) >= 4) return { goal: 'Become Champion; BOULDER, CASCADE, THUNDER and RAINBOW badges DONE (Erika beaten; do NOT fight in the Celadon Gym again). Next: in CELADON CITY go into the GAME CORNER; beat the Rocket guarding the poster at the back, the poster hides a switch that opens the stairs to the ROCKET HIDEOUT; go down to B4F, beat Giovanni and get the SILPH SCOPE. Then go east to LAVENDER TOWN and climb POKEMON TOWER (the Scope reveals the ghosts) to rescue Mr. Fuji (gives the Poke Flute). Heal at the Celadon Pokemon Center first if hurt. The party is weak besides the lead: catching/training more Pokemon helps.', done: true };
  if ((st.badges || 0) === 3 && seenCeladon) return { goal: 'Become Champion; BOULDER, CASCADE and THUNDER badges DONE; we have REACHED CELADON CITY (do not go back east to Route 7/8, Lavender or Rock Tunnel). Next: heal at the Celadon Pokemon Center if hurt, then beat ERIKA in the CELADON GYM (south-west part of the city; a small CUT tree blocks the path, the bot cuts it) for the RAINBOW BADGE. Erika uses Grass types (Victreebel Lv29, Tangela Lv24, Vileplume Lv29): Grass moves are weak against them, so use strong neutral moves or Geodude/Onix Rock moves carefully (they are weak to Grass). Catching more Pokemon would also help.', done: true };
  if ((st.badges || 0) >= 3) return { goal: 'Become Champion; BOULDER, CASCADE and THUNDER badges DONE (Lt. Surge beaten, Vermilion finished; do NOT go back into the Vermilion Gym, S.S. Anne or Diglett\'s Cave). Next: go NORTH from Vermilion (Route 6, Underground Path, Route 5) to Cerulean City, then EAST onto Route 9 (a small CUT tree blocks it), Route 10, through ROCK TUNNEL (heal at the Route 10 Pokemon Center first) to LAVENDER TOWN, then west via Route 8 and the Underground Path to CELADON CITY (Erika, Grass gym). Catch a 2nd Pokemon when possible.', done: true };
  if ((st.badges || 0) >= 2 && checkCut()) return { goal: 'Become Champion; BOULDER and CASCADE badges DONE, S.S. Anne DONE (HM01 CUT in bag, the ship has sailed; do NOT go back to the dock). Next: heal at the Vermilion Pokemon Center, then go to Lt. Surge\'s gym in Vermilion City (the bot cuts the small tree in front of it automatically; Venusaur knows CUT). Inside, search the trash cans for the 2 hidden door switches, then beat Lt. Surge (Electric; Venusaur\'s Grass type resists Electric and beat him at full HP in a test). Diglett\'s Cave is a side trip, not needed.', done: true };
  if ((st.badges || 0) >= 2 && checkTicket()) return { goal: 'Become Champion; BOULDER and CASCADE badges are DONE and Bill is DONE (S.S. Ticket is in the bag; do NOT go back to Bill\'s house). Next: go back west along Route 25, south over Route 24 / Nugget Bridge to Cerulean City, then SOUTH via Route 5 (Underground Path, Route 6) to Vermilion City: board the S.S. Anne, then Lt. Surge (Electric type, 3rd badge). Catching more Pokemon would help (only one in the party).', done: true };
  if ((st.badges || 0) >= 2) return { goal: 'Become Champion; BOULDER and CASCADE badges are DONE (Brock and Misty beaten, Cerulean Gym finished). Next: go NORTH from Cerulean City over Nugget Bridge (Route 24, rival + 5 trainers) and Route 25 to Bill\'s house (talk to Bill, get the S.S. Ticket), then back through Cerulean south (Route 5/6) to Vermilion City (Lt. Surge, Electric type, 3rd badge). Catching more Pokemon would help (only one in the party).', done: true };
  if (hasBadge1 && seenCerulean) return { goal: 'Become Champion; BOULDER BADGE is DONE and Mt. Moon is CROSSED (do not go back west to Route 4 / Mt. Moon). We are in the Cerulean City area. Next: beat Misty in the Cerulean Gym (Water type: Starmie Lv21, Staryu Lv18; Grass/Poison moves and LEECH SEED work well, heal at the Cerulean Pokemon Center first if HP is not full) for the CASCADE BADGE. Catching a second Pokemon (e.g. on Route 24/25 north) would also help.', done: true };
  if (hasBadge1) return { goal: 'Become Champion; BOULDER BADGE from Brock is DONE (Pewter gym finished, nothing left there). Next: go EAST from Pewter City along Route 3 (trainers, grass) to the Mt. Moon Pokemon Center and through Mt. Moon, then Route 4 east to Cerulean City (Misty, Water type, 2nd badge; Grass moves are super effective). Catching a second Pokemon on the way would help.', done: true };
  if (e == null) return { goal: 'Become Champion; next: Oak\'s parcel errand if not done yet, then north via Route 2 / Viridian Forest to Pewter City (Brock, first badge)', done: false };
  if (e >= 11) return { goal: 'Become Champion; Oak\'s parcel is DELIVERED and the Pokedex received (errand finished, Pallet/Oak\'s lab/Viridian Mart have nothing more for us). Next: go NORTH: Viridian City -> Route 2 -> Viridian Forest -> Pewter City, beat Brock (Rock type, Lv12-14) for the first badge', done: true };
  if (e >= 7) return { goal: 'Become Champion; next: carry Oak\'s parcel SOUTH (Route 1 -> Pallet Town -> Oak\'s lab) and talk to Oak; then go north via Route 2 to Pewter City (Brock)', done: false };
  return { goal: 'Become Champion; next: pick up Oak\'s parcel at the Viridian Mart, bring it to Prof. Oak in Pallet Town, then Route 2 north -> Viridian Forest -> Pewter City (Brock)', done: false };
}
const goalCache = new Map(), healFails = {};
let pendingHeal = false;
let healTrip = null; // Jev chose heal: keep heading to the PC across map changes until healed (no re-asking each map)
// Session 20260927-043225: per-move PP of the lead so Jev sees when the best STAB move is empty (Venusaur fought Giovanni with CUT).
function leadPPFact(p) {
  try {
    const ld = (p || []).find(m => m.hp > 0) || (p || [])[0]; if (!ld) return '';
    const ts = ld.types || [];
    const dm = (ld.moves || []).filter(x => x && x.power > 0 && x.maxPp);
    if (!dm.length) return '';
    const best = dm.slice().sort((a, b) => b.power * (ts.includes(b.type) ? 1.5 : 1) - a.power * (ts.includes(a.type) ? 1.5 : 1))[0];
    return ` Lead ${ld.species} damaging moves: ${dm.map(x => `${x.name} ${x.pp}/${x.maxPp}${ts.includes(x.type) ? ' STAB' : ''}`).join(', ')}.` +
      (best.pp === 0 ? ` Its STRONGEST move ${best.name} has 0 PP: in hard fights (boss/leader) it must use weak moves; healing at a Pokemon Center restores all PP.` : best.pp <= 5 ? ` Its STRONGEST move ${best.name} is almost empty (${best.pp} PP).` : '');
  } catch (e) { return ''; }
}
// Session 20260927-043725: true when the lead's strongest damaging move has <=5 PP (heal must be offered even at full HP).
function leadBestLow(p) {
  try {
    const ld = (p || []).find(m => m.hp > 0) || (p || [])[0]; if (!ld) return false;
    const ts = ld.types || [], dm = (ld.moves || []).filter(x => x && x.power > 0 && x.maxPp);
    if (!dm.length) return false;
    const best = dm.slice().sort((a, b) => b.power * (ts.includes(b.type) ? 1.5 : 1) - a.power * (ts.includes(a.type) ? 1.5 : 1))[0];
    return best.pp <= 5;
  } catch (e) { return false; }
}
// Fraction of attack-move PP left across the party (status moves ignored); 1 if unknown.
function ppFrac(p) {
  let pp = 0, max = 0;
  for (const m of p) for (const x of (m.moves || [])) if (x && x.power > 0 && x.maxPp) { pp += x.pp; max += x.maxPp; }
  // Test 022254: the party average (61%) hid the lead's 0 attack PP (Onix/Geodude never fight); the lead does the fighting.
  let lp = 0, lm = 0; const ld = p.find(m => m.hp > 0) || p[0];
  for (const x of ((ld && ld.moves) || [])) if (x && x.power > 0 && x.maxPp) { lp += x.pp; lm += x.maxPp; }
  return Math.min(max ? pp / max : 1, lm ? lp / lm : 1);
}
let caveHealTrips = 0;
function goal(st, p) {
  stage(st); // sets hasBadge1 before the option texts are built
  const pf = ppFrac(p), pb = Math.round(pf * 4);
  const bl = leadBestLow(p), hb = Math.min(Math.round(hpFrac(p) * 4), pb < 2 || bl ? 3 : 4), key = `${st.map}|${pb}|${bl ? 'L' : ''}|${st.storyEvents}|${hb}|${healFails.REDS_HOUSE_1F || 0}|${healFails['PC|' + gstate().map] || 0}|${p.map(m => m.level).join(',')}`;
  if (goalCache.has(key)) return goalCache.get(key);
  const lead = p[0], opts = {};
  const healWhere = { PALLET_TOWN: "Mom in Red's house (a few steps away) heals the party for free",
    REDS_HOUSE_1F: 'Mom is in this room and heals the party for free',
    ROUTE_1: 'walk back south to Pallet Town and let Mom heal the party (free)',
    PEWTER_CITY: 'the Pewter Pokemon Center in this city (nurse heals for free)', VIRIDIAN_CITY: 'the Viridian Pokemon Center in this city (nurse heals for free)',
    PEWTER_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free', VIRIDIAN_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free',
    ROUTE_3: 'walk back WEST along Route 3 to the Pewter Pokemon Center (free)',
    ROUTE_4: 'the Mt. Moon Pokemon Center right here at the foot of Mt. Moon (free)', MT_MOON_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free',
    CERULEAN_CITY: 'the Cerulean Pokemon Center in this city (nurse heals for free)', CERULEAN_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free',
    CERULEAN_GYM: 'walk out of the gym to the Cerulean Pokemon Center (free); losing here sends us all the way back to the Mt. Moon Pokemon Center',
    MT_MOON_B1F: 'climb the ladder back UP to 1F, walk out the entrance to Route 4 and heal at the Mt. Moon Pokemon Center (free); fainting here costs half our money',
    MT_MOON_B2F: 'climb back UP toward 1F and out to the Mt. Moon Pokemon Center on Route 4 (free); fainting here costs half our money',
    MT_MOON_1F: 'walk back out of the cave entrance to Route 4 and heal at the Mt. Moon Pokemon Center right next to it (free)',
    ROUTE_24: 'walk back SOUTH over Nugget Bridge to the Cerulean Pokemon Center (free, a short walk)',
    ROUTE_25: 'walk back WEST to Route 24 and south to the Cerulean Pokemon Center (free); trainers already beaten stay beaten',
    BILLS_HOUSE: 'leave Bill\'s house and walk back west/south to the Cerulean Pokemon Center (free)',
    PEWTER_GYM: 'leave the gym and heal at the Pewter Pokemon Center nearby (free) before fighting Brock',
    VERMILION_CITY: 'the Vermilion Pokemon Center in this city (nurse heals for free); do this BEFORE boarding the S.S. Anne (rival BLUE waits on the ship; we blacked out to him once at 28/85 HP PARALYZED)', VERMILION_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free',
    VERMILION_DOCK: 'walk back north into Vermilion City to its Pokemon Center (free, short walk) before the S.S. Anne rival fight',
    SS_ANNE_1F: 'leave the ship (exit south to the dock) and heal at the Vermilion Pokemon Center (free); the rival BLUE on 2F beat us once when we were low/paralyzed',
    SS_ANNE_3F: 'go down to 2F, 1F, off the ship and heal at the Vermilion Pokemon Center (free)', SS_ANNE_BOW: 'go back through 3F, 2F, 1F, off the ship to the Vermilion Pokemon Center (free, long walk)',
    SS_ANNE_2F: 'go back down to 1F, off the ship and heal at the Vermilion Pokemon Center (free); the rival BLUE here beat us once when we were low/paralyzed',
    ROUTE_6: 'walk SOUTH to Vermilion City and its Pokemon Center (free)',
    VERMILION_GYM: 'walk out of the gym to the Vermilion Pokemon Center (free, short walk; the Cut tree must be cut again and the trash-can door switches reset). Fighting LT.SURGE hurt/burned lost once: we blacked out and were sent back to CERULEAN',
    ROUTE_11: 'walk back WEST into Vermilion City to its Pokemon Center (free)',
    ROUTE_9: 'walk EAST to Route 10: the Rock Tunnel Pokemon Center is right at its north end (free)',
    ROUTE_10: st.y > 40 ? 'walk SOUTH off this map into Lavender Town (just south, we are past Rock Tunnel) and heal at the Lavender Pokemon Center (free); the Route 10 Pokemon Center is on the other side of the tunnel' : 'the Rock Tunnel Pokemon Center right here on Route 10, next to the tunnel entrance (free); heal BEFORE entering the dark Rock Tunnel',
    LAVENDER_TOWN: 'the Lavender Pokemon Center in this town (nurse heals for free)',
    // Session 20260927-065227: Venusaur ran out of attack PP on Route 13 with no heal option at all.
    ROUTE_12: 'walk NORTH along Route 12 back to Lavender Town and its Pokemon Center (free)', ROUTE_13: 'keep going: WEST along Route 13 -> Route 14 -> Route 15 into FUCHSIA CITY and heal at the Fuchsia Pokemon Center (free; roughly as far as walking back north to Lavender)',
    ROUTE_14: 'continue SOUTH along Route 14 -> WEST along Route 15 into FUCHSIA CITY and heal at its Pokemon Center (free)', ROUTE_15: 'continue WEST along Route 15 into FUCHSIA CITY and heal at its Pokemon Center (free)',
    // Session 20260927-151512: live 160055 surfed Route 20 with VENUSAUR 0 attack PP and no heal option.
    ROUTE_19: 'surf/walk NORTH up Route 19 into FUCHSIA CITY and heal at its Pokemon Center (free, restores HP AND all PP)', ROUTE_20: 'surf EAST along Route 20 to Route 19, then NORTH into FUCHSIA CITY and its Pokemon Center (free, restores all PP)',
    ...(/^SEAFOAM_ISLANDS/.test(st.map) ? { [st.map]: 'climb the ladders up and out of Seafoam to Route 20, surf EAST -> Route 19 -> NORTH to the Fuchsia Pokemon Center (free, restores all PP; a long trip)' } : {}),
    FUCHSIA_CITY: 'the Fuchsia Pokemon Center in this city (nurse heals for free)', FUCHSIA_GYM: 'leave the gym (exit south) and heal at the Fuchsia Pokemon Center nearby (free, restores HP AND all move PP); gym trainers stay beaten, KOGA waits', FUCHSIA_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free',
    ROCK_TUNNEL_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free',
    // Session 20260927-040725: test 041358 walked into Giovanni's guards with 0 attack PP (only GROWTH left) and no heal option.
    ROCKET_HIDEOUT_B1F: 'stairs up to the Game Corner, then the Celadon Pokemon Center (free); the poster stairs stay open',
    ROCKET_HIDEOUT_B2F: 'with the LIFT KEY: elevator up to B1F, then Game Corner -> Celadon Pokemon Center (free); otherwise the stairs up',
    ROCKET_HIDEOUT_B3F: 'stairs up to B2F (arrow floors), elevator (LIFT KEY) to B1F, Game Corner -> Celadon Pokemon Center (free); a long walk',
    ROCKET_HIDEOUT_B4F: 'the elevator (LIFT KEY) up to B1F, then Game Corner -> Celadon Pokemon Center (free); fainting here costs half our money',
    ROCKET_HIDEOUT_ELEVATOR: 'ride up to B1F, then Game Corner -> Celadon Pokemon Center (free)',
    GAME_CORNER: 'walk out to Celadon City and its Pokemon Center (free, short walk)', CELADON_CITY: 'the Celadon Pokemon Center in this city (nurse heals for free)',
    CELADON_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free',
    // Session 20260927-052226: live run 061817 fought 7F Rockets with VENUSAUR 13/142 PARALYZED (no heal option in the tower) and got wiped.
    // Session 20260927-095229: live 105125 fought SILPH_CO_9F Rockets with VENUSAUR 0 attack PP and 3 fainted members: no heal option in Silph.
    SAFFRON_CITY: 'the Saffron Pokemon Center in this city (nurse heals for free, restores HP AND all move PP)', SAFFRON_POKECENTER: 'the nurse at the counter in this Pokemon Center heals for free',
    ...(/^SILPH_CO_([1-9]|1[01])F$/.test(st.map) ? { [st.map]: `walk down the Silph stairs floor by floor (${st.map.slice(9)} -> 1F; beaten Rockets stay beaten, a picked-up CARD KEY stays in the bag), out to Saffron City and its Pokemon Center (free, restores HP and all PP); then come back up` } : {}),
    // Session 20260927-193515: Jev picked progress with VENUSAUR 16/215 on VR 1F because no heal option existed on the League road.
    VICTORY_ROAD_1F: 'walk back out the Victory Road entrance to Route 23, south through the ROUTE_22_GATE, Route 22 east to the Viridian Pokemon Center (free, long walk). COST: the 1F boulder switch' + (vrSw1F() ? ' we just pressed' : '') + ' RESETS when we leave 1F (game script) and the whole 1F puzzle must be redone; live runs lost 5 sessions redoing Victory Road puzzles this way. Healing FORWARD at the Indigo Plateau Pokemon Center (past 2F/3F) keeps the progress, and SOLARBEAM PP alone is not worth it while other attacks have PP. Victory Road trainers have Lv40+ Pokemon (a CHARIZARD Lv42 made us black out once at low HP)',
    // Session 20260927-205516: tests showed the VR boulder switches RESET after a blackout/leaving (2F switch1 had to be redone), and
    // once 2F switch2 (9,16) is pressed the Indigo Plateau Pokemon Center past the exit is much closer than Viridian.
    VICTORY_ROAD_2F: vrSw2() ? 'FORWARD is closer: 2F ladder (25,14) -> 3F east pocket -> 3F ladder (26,8) -> 2F (27,7) -> exit (29,7) -> Indigo Plateau lobby Pokemon Center (free). Going back to Viridian means redoing every boulder switch (they reset) past Lv40+ trainers' : 'ladder down to 1F, out to Route 23, south through the gate, Route 22 east to the Viridian Pokemon Center (free, long walk; the boulder switches RESET when we leave, so the puzzle must be redone)',
    VICTORY_ROAD_3F: vrSw2() ? 'FORWARD is closer: 3F ladder (26,8) (or via 2F ladder (25,14) -> 3F (27,15) -> 26,8) -> 2F (27,7) -> exit (29,7) -> Indigo Plateau lobby Pokemon Center (free)' : 'down to 2F, 1F, out to Route 23 and back to the Viridian Pokemon Center (long walk; boulder switches RESET when we leave)',
    ROUTE_23: (gstate().x >= 10 && gstate().y < 40) ? 'walk NORTH to the Indigo Plateau lobby Pokemon Center (close; this part of Route 23 beside the Victory Road exit has no way south)' : 'walk SOUTH through the ROUTE_22_GATE, then Route 22 east to the Viridian Pokemon Center (free)', ROUTE_22_GATE: 'exit south to Route 22, then east to the Viridian Pokemon Center (free)',
    ROUTE_22: 'walk EAST into Viridian City and its Pokemon Center (free)',
    // Session 20260927-212516 (test 213057): losing to AGATHA respawned us in VIRIDIAN CITY (last center used) -> all of Victory Road again.
    ...(lobbyHealFails < 2 ? { INDIGO_PLATEAU_LOBBY: 'talk to the nurse at the lobby counter (free: restores all HP and ALL move PP). It also makes this lobby our RESPAWN point: if we lose to the Elite Four we wake up here instead of in Viridian City (a test lost to AGATHA without healing here and had to redo all of Victory Road)' } : {}),
    INDIGO_PLATEAU: 'the Indigo Plateau lobby just north has a Pokemon Center nurse (free full HP/PP heal; also sets our respawn point next to the Elite Four)',
    ...(/^POKEMON_TOWER_[1-7]F$/.test(st.map) ? { [st.map]: `walk back down the tower stairs (${st.map.slice(14)} -> 1F, trainers already beaten stay beaten) and out to the Lavender Pokemon Center next door (free)` } : {}) }[st.map];
  opts.progress = `Continue the story (${(st.badges || 0) >= 8 ? 'ALL 8 badges DONE: Route 22 -> Route 23 (badge gates) -> VICTORY ROAD -> INDIGO PLATEAU, Elite Four and the Champion' : (st.badges || 0) === 7 ? (st.map === 'VIRIDIAN_GYM' ? 'we are INSIDE the VIRIDIAN GYM (badge 8): beat its trainers and reach/talk to GIOVANNI (Ground: Rhyhorn/Dugtrio/Nidoqueen/Nidoking/Rhydon up to Lv50, weak to Grass/Water/Ice); do NOT leave unless the party needs healing (Viridian Pokemon Center is close)' : 'VOLCANO BADGE done (7 badges, Blaine BEATEN; Cinnabar is finished): badge 8 is GIOVANNI in the VIRIDIAN CITY gym (Pallet -> Route 1 north -> Viridian)') : (st.badges || 0) >= 6 ? 'MARSH BADGE done (6 badges, Sabrina BEATEN; do NOT go back to SAFFRON_GYM or Silph): badge 7 is BLAINE on CINNABAR ISLAND, reached over water with SURF (Fuchsia -> Route 19/20, or Pallet -> Route 21); LAPRAS (can learn SURF) is in the PC box at a Pokemon Center' : (st.badges || 0) >= 5 && (checkMaster() || silphDone()) ? 'Giovanni BEATEN, Silph Co. DONE: go down/out to SAFFRON CITY, enter the SAFFRON GYM (not the Fighting Dojo) and beat SABRINA (Psychic) for badge 6; the gym is a teleport-pad maze' : (st.badges || 0) >= 5 && /^SILPH_CO/.test(st.map || '') ? (hasCardKey() ? 'we are INSIDE SILPH CO. with the CARD KEY: locked doors open now; go UP to 7F (rival) and 11F, beat GIOVANNI in the president\'s office (stairs, elevator, teleport pads)' : 'we are INSIDE SILPH CO.: climb floor by floor to 5F and pick up the CARD KEY (opens locked doors), then up to 11F and GIOVANNI') : (st.badges || 0) >= 5 && seenSouth ? 'SOUL BADGE done (5 badges): in Fuchsia get SURF (Safari Zone secret house) and STRENGTH (Gold Teeth to the Warden), then Saffron City and Sabrina' : (st.badges || 0) === 4 && st.map === 'FUCHSIA_GYM' ? 'we are INSIDE the Fuchsia Gym: beat the gym trainers and reach/talk to KOGA at the back for the 5th badge; do NOT leave unless the party needs healing' : (st.badges || 0) === 4 && seenSouth && checkFlute() ? 'Snorlax DONE, we are south of it: west along Route 15 into FUCHSIA CITY, then beat KOGA (Poison gym) for the 5th badge' : (st.badges || 0) >= 4 ? (checkScope() ? 'hideout DONE, SILPH SCOPE in bag: out to Celadon -> Route 7 -> Underground Path -> Route 8 -> Lavender Town -> climb Pokemon Tower to 7F, rescue Mr. Fuji (Poke Flute)' : st.map === 'CELADON_GYM' ? 'Erika is BEATEN (4 badges): leave the gym, go to the Game Corner in Celadon and find the Rocket hideout (Silph Scope)' : 'Rainbow Badge done (4 badges): Game Corner in Celadon -> Rocket hideout (beat the poster guard, switch behind the poster, stairs down, Giovanni on B4F, SILPH SCOPE) -> Pokemon Tower in Lavender') : (st.badges || 0) === 3 && seenCeladon ? (st.map === 'CELADON_GYM' ? 'we are INSIDE the Celadon Gym: beat the gym trainers and reach/talk to Erika (Grass leader, Victreebel/Tangela/Vileplume up to Lv29, weak to Fire/Flying/Ice/Poison) at the back of the gym for the 4th badge; do NOT leave the gym unless the party needs healing' : 'we are in CELADON CITY: beat Erika in the Celadon Gym (south-west, behind a CUT tree) for the 4th badge') : (st.badges || 0) >= 3 ? 'Thunder Badge done (3 badges): go north through Route 6 + Underground Path to Cerulean, then east Route 9 -> Route 10 -> Rock Tunnel -> Lavender Town' : (st.badges || 0) >= 2 ? 'Boulder and Cascade badges done (Misty beaten): go north from Cerulean City over Nugget Bridge (Route 24) and Route 25 to Bill\'s house, then south to Vermilion' : hasBadge1 && seenCerulean && (st.badges || 0) < 2 ? 'Boulder Badge done and Mt. Moon already crossed; we are around Cerulean City: beat Misty in the Cerulean Gym (Water type, weak to Grass) for the 2nd badge' : hasBadge1 ? 'Boulder Badge done; cross Mt. Moon cave (wild Zubat/Geodude, trainers) and Route 4 to Cerulean City and Misty' : stage(st).done ? 'parcel delivered; head north through Viridian City, Route 2 and Viridian Forest to Pewter City and Brock' : 'finish Oak\'s parcel errand, then Route 2 north toward Brock'}). Wild Pokemon and trainers on the way; losing a battle costs half our money (now ${st.money}).${(st.badges || 0) >= 8 ? ` Ahead: rival (Lv53-65 incl. CHARIZARD Fire, x2 vs Grass) on Route 22, Victory Road trainers Lv40s, Elite Four Lv53-65; no healing between Elite Four fights except items${leaderPpFact().replace('vs the leader','vs the rival/Elite Four').replace('(leave the gym, ','(')}` : ''}`;
  const hf = /POKECENTER|PEWTER|VIRIDIAN|CERULEAN|VERMILION|LAVENDER|SS_ANNE|ROCKET_HIDEOUT|GAME_CORNER|CELADON|FUCHSIA|ROUTE_(3|4|6|9|10|11|12|13|14|15|19|20|24|25)$|SEAFOAM|MT_MOON|BILLS_HOUSE|POKEMON_TOWER|SILPH_CO|SAFFRON|VICTORY_ROAD|ROUTE_2[23]/.test(st.map) ? (healFails['PC|' + gstate().map] || 0) : (healFails.REDS_HOUSE_1F || 0); // talking to Mom failed this many times: only offer heal while it can still work
  // Session 20260927-075228: live 084304 walked into Route 14 trainers with 0 lead attack PP and blacked out; flag it on progress.
  try { const ld0 = p.find(m => m.hp > 0) || p[0], dm0 = ((ld0 && ld0.moves) || []).filter(x => x && x.power > 0 && x.maxPp);
    if (opts.progress && dm0.length && dm0.every(x => x.pp === 0)) opts.progress += ` WARNING: lead ${ld0.species} has 0 PP on EVERY damaging move; trainers ahead cannot be beaten this way (we blacked out on Route 14 like this and lost half our money). Healing first restores PP.`;
  } catch (e) {}
  // Session 20260927-211516 (CONFIRMED, test 211737 switch log): entering VR 2F RESETS the 1F switch (10000 -> 01000), so from 2F/3F the
  // way back to the entrance is walled off until 2F switch2 opens the forward route: a heal trip there only ping-pongs 1F<->2F.
  const vrNoBack = /^VICTORY_ROAD_[23]F$/.test(st.map) && !vrSw2();
  if (healWhere && hb < 4 && hf < 2 && !vrNoBack) opts.heal = `Restore HP first: ${healWhere}. Party HP is ${Math.round(hpFrac(p) * 100)}%, attack-move PP left ${Math.round(pf * 100)}% (out of PP = only weak/status moves left). Strongest member ${lead.species} Lv${lead.level} is at ${lead.hp}/${lead.maxHp} HP${lead.status ? ' ' + lead.status : ''} (the others are much weaker).${leadPPFact(p)}${hf ? ` Walking there from this map already FAILED ${hf}x.` : ''}${/MT_MOON_B/.test(st.map) ? ` COST: going back up throws away the progress made down here; we already made ${caveHealTrips} heal trips out of Mt. Moon and still have not crossed it.` : ''}${/MT_MOON/.test(st.map) ? ` A wild fight in this cave (Zubat/Geodude Lv7-10) costs our Lv${lead.level} lead about 20-40% HP (attack PP runs low, so fights drag on), so at ${Math.round(hpFrac(p) * 100)}% HP we can take about ${Math.max(0, Math.floor((hpFrac(p) * 100 - 20) / 25))} more fights before dropping to the danger zone (RUNning from wild fights saves HP) (below 30% HP one more fight can make us faint: half our money lost and we restart from the Pokemon Center anyway).` : ''}`;
  const balls = ballCount();
  if (/_MART$/.test(st.map) && balls < 3 && (st.money || 0) >= 700 && shopFails < 2) opts.shop = `Buy POKE BALLs from the clerk here (200 each; we have ${balls}, money ${st.money}). Only ${p.length} Pokemon in the party: balls let us CATCH a second Pokemon in wild battles (more types = coverage and a backup when the lead faints or runs out of PP).`;
  const townMart = { CERULEAN_CITY: 'CERULEAN_MART', VERMILION_CITY: 'VERMILION_MART', LAVENDER_TOWN: 'LAVENDER_MART', CELADON_CITY: 'CELADON_MART_1F', PEWTER_CITY: 'PEWTER_MART', VIRIDIAN_CITY: 'VIRIDIAN_MART' }[st.map];
  if (townMart && p.length < 3 && balls < 3 && (st.money || 0) >= 700 && shopFails < 2 && (martWalkFails[st.map] || 0) < 2) opts.shop = `Walk into the Poke Mart in this town (${townMart}) and buy POKE BALLs (200 each; we have ${balls} balls, money ${st.money}). We have only ${p.length} Pokemon (${p.map(m => m.species + ' Lv' + m.level).join(', ')}): with balls we can CATCH a second Pokemon in the next wild battles for type coverage and a backup. Costs a short detour.`;
  const losses = battleHistory.filter(r => r.startsWith('LOST'));
  if (/PEWTER/.test(st.map) && !hasBadge1) opts.train = `Go south to Route 2's tall grass (a short walk from Pewter) and fight wild Pokemon to gain levels before challenging Brock. Lead is Lv${lead.level}; Brock has Geodude Lv12 and Onix Lv14 (Rock/Ground, weak to Grass: Bulbasaur learns Vine Whip at Lv13).${losses.length ? ` We already ${losses.join('; ')}.` : ''}`;
  else if (/^SILPH_CO/.test(st.map || '')) opts.train = `Train here: there is NO tall grass inside Silph Co.; EXP only comes from the Rocket grunts/scientists on each floor (Lv25-33; Giovanni on 11F has Nidorino/Kangaskhan/Rhyhorn/Nidoqueen up to Lv41). Lead is Lv${lead.level}; the other members are Lv${Math.min(...p.map(q => q.level))}-${Math.max(...p.filter(q => q !== lead).map(q => q.level))}, far weaker. Wandering without a target gives nothing.`;
  else if (st.map === 'VIRIDIAN_GYM') opts.train = `Train here: there is NO tall grass inside the Viridian Gym; EXP only comes from its trainers (Ground types Lv39-45) and GIOVANNI. Lead is Lv${lead.level}. Wandering without a target gives nothing.`;
  // Session 20260927-223230: E4 rooms have no grass and no exit back (trainStep finds no ',' tiles) - 'train' there was a dead option.
  else if (/^(LORELEIS|BRUNOS|AGATHAS|LANCES|CHAMPIONS)_ROOM$/.test(st.map)) {}
  else if (st.map !== 'REDS_HOUSE_1F') opts.train = `Walk in the tall grass here to fight wild Pokemon and gain levels (lead is Lv${lead.level}; ${(st.badges || 0) >= 7 ? 'Viridian Gym trainers are Ground types Lv39-45, GIOVANNI up to Lv50; the Elite Four after that are Lv53-65' : (st.badges || 0) >= 4 ? 'Rocket hideout grunts are Lv17-29, Giovanni has Onix/Rhyhorn/Kangaskhan up to Lv29; next leader Koga (Poison) up to Lv43' : (st.badges || 0) >= 3 ? 'next leader Erika (Celadon) has Grass Pokemon up to Lv29' : (st.badges || 0) >= 2 ? 'Nugget Bridge trainers are Lv14-18; next leader Lt. Surge (Vermilion) has Voltorb/Pikachu/Raichu up to Lv24' : hasBadge1 ? 'next leader Misty has Staryu Lv18 and Starmie Lv21' : "Brock's Pokemon are Lv12-14"}). Risky if HP is low.`;
  const ctx = { goal: stage(st).goal, storyEvents: st.storyEvents, map: st.map, badges: st.badges, money: st.money,
    party: p.map(m => `${m.species} Lv${m.level} HP ${m.hp}/${m.maxHp} ${m.status || ''} moves: ${(m.moves || []).map(x => x.name || x).join(',')}`), recentBattles: battleHistory.slice(-4), healFailedHere: !!(healFails[st.map] || healFails.REDS_HOUSE_1F) };
  if (healTrip && hpFrac(p) >= 0.99 && pf >= 0.99) healTrip = null;
  if (healTrip && opts.heal) return 'heal'; // committed heal trip (Jev already chose it on "+healTrip+")
  if (/VICTORY_ROAD|ROUTE_2[23]/.test(st.map)) log(`vr switches (1F,2F1,2F2,3F1,3F2) on ${st.map}: ${vrSwLog()}`);
  const pick = askChoice(ctx, 'What should the player do next to progress toward beating the game without losing battles?', opts, hb <= 1 && opts.heal ? 'heal' : 'progress');
  if (pick === 'heal' && /MT_MOON_B/.test(st.map)) caveHealTrips++;
  if (pick === 'heal') healTrip = st.map;
  goalCache.set(key, pick);
  return pick;
}

// Session 20260927-084728: live run 094357 spent minutes re-talking to Oak's AIDE (ROUTE_15_GATE_2F): once the dialog ends,
// the next A re-opens it because we still face the NPC. After a text loop, step away (mechanics only) and drop cached decisions
// so Jev re-decides with 'talked N times already / last SAID' facts.
let textLoops = 0; const textSeen = {};
function unstickTalk() {
  try {
    textLoops++; const st0 = gstate();
    for (const d of ['DOWN', 'LEFT', 'RIGHT', 'UP']) { if (screen().hasTextBox) press('B', 4, 12); hold(d, 2); wait(8); const st1 = gstate(); if (st1.x !== st0.x || st1.y !== st0.y || st1.map !== st0.map) break; }
    try { destCache.clear(); } catch (e) {}
    log(`unstickTalk: stepped away after a text loop (${textLoops}x)`);
  } catch (e) { log('unstickTalk err ' + e); }
}
// Walk next to an NPC, face it and press A through its dialog. Returns true if we got adjacent and talked.
// Session 20260927-131510 (DEEP): ROOT CAUSE of the SAFFRON_GYM loop: SABRINA (9,8) sits in a room walled off on all sides; the only way
// in is a chain of teleport pads. talkTo() only walks (pads are not walkable in pathDir), so "talk to SABRINA" always failed
// ("no reachable side") and got hidden, and Jev was left with pads one hop at a time. padRoute() is mechanics: BFS over the grid where
// stepping onto a same-map pad jumps to its ROM destination (warps[destWarp]); returns the pads to take, in order, to reach a goal tile.
function padDests(map) {
  const m = rom.mapByName(map); if (!m || !m.warps) return null;
  const out = {};
  for (const w of m.warps) if (w.destMap === m.id) { const d = m.warps[w.destWarp]; if (d) out[`${w.x},${w.y}`] = [d.x, d.y]; }
  return Object.keys(out).length ? out : null;
}
function padRoute(g, goals) {
  const pads = padDests(g.map); if (!pads) return null;
  const { width: w, height: h } = g;
  const blocked = new Set((g.blockedMoves || []).map(b => `${b.x},${b.y},${b.dir.toUpperCase()}`));
  const start = `${g.player.x},${g.player.y}`, prev = new Map([[start, null]]), q = [[g.player.x, g.player.y]];
  while (q.length) {
    const [x, y] = q.shift(), k = `${x},${y}`;
    if (goals.has(k)) { const hops = []; for (let c = k; prev.get(c); c = prev.get(c).k) if (prev.get(c).pad) hops.unshift(prev.get(c).pad); return hops; }
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      let nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked.has(`${x},${y},${d}`)) continue;
      let pad = null; const pk = `${nx},${ny}`;
      if (goals.has(pk)) { if (!prev.has(pk)) { prev.set(pk, { k, pad: null }); q.push([nx, ny]); } continue; }
      if (pads[pk]) { pad = { x: nx, y: ny }; [nx, ny] = pads[pk]; }
      else if (!WALK.has(g.rows[ny][nx])) continue;
      const nk = `${nx},${ny}`; if (prev.has(nk)) continue;
      prev.set(nk, { k, pad }); q.push([nx, ny]);
    }
  }
  return null;
}
function npcSides(g, n) { const s = new Set(); for (const [dx, dy] of Object.values(DIRS)) { const x = n.x - dx, y = n.y - dy; if (g.rows[y] && WALK.has(g.rows[y][x])) s.add(`${x},${y}`); } return s; }
// Follow the pad chain toward person n (max 8 hops); returns true if we ended next to them (or a battle started).
function padsToward(n, goalsFn) {
  for (let i = 0; i < 8; i++) {
    const g = gridX(), st = gstate(); if (st.inBattle) return true;
    const hops = padRoute(g, goalsFn ? goalsFn(g) : npcSides(g, n));
    if (!hops) { log(`padsToward: no pad route to ${n.x},${n.y} from ${st.x},${st.y}`); return false; }
    if (!hops.length) return true;
    const p = hops[0], dest = (padDests(g.map) || {})[`${p.x},${p.y}`];
    log(`padsToward (${n.x},${n.y}): ${hops.length} pad(s) left: ${hops.map(h => `${h.x},${h.y}`).join(' > ')}; taking ${p.x},${p.y} (ROM lands ${dest})`);
    goWarp(g.map, p); wait(20);
    const a = gstate(); if (a.inBattle) return true;
    if (a.map !== g.map) return false;
    if (dest && !(a.x === dest[0] && a.y === dest[1])) { log(`padsToward: expected to land ${dest}, now at ${a.x},${a.y}`); }
  }
  return false;
}
function talkTo(m) {
  const g = gridX();
  for (const [d, [dx, dy]] of Object.entries(DIRS)) {
    const x = m.x - dx, y = m.y - dy;
    // pathDir treats its target as walkable, so a wall tile beside the target looked reachable (5F CARD KEY: (21,15) is '#').
    if (!(x === g.player.x && y === g.player.y) && (!(g.rows[y] && WALK.has(g.rows[y][x])) || !pathDir(g, x, y))) continue;
    if (!walkTo(x, y, /MT_MOON|ROCK_TUNNEL|SILPH_CO|ROCKET_HIDEOUT|POKEMON_MANSION|SEAFOAM|VICTORY_ROAD/.test(gstate().map) ? 150 : 30)) { if (gstate().inBattle) return true; const p = gstate(); if (p.x === x - dx && p.y === y - dy) { hold(d, 2); for (let i = 0; i < 4; i++) press('A', 4, 20); log(`talkTo: blocked 2 tiles short, pressed A facing ${d}`); } continue; }
    hold(d, 2); wait(8);
    for (let i = 0; i < 12; i++) { if (gstate().inBattle) break; try { const d = (screen().dialog || '').toString().slice(0, 80); if (d && lastTexts[lastTexts.length - 1] !== d) { lastTexts.push(d); if (lastTexts.length > 8) lastTexts.shift(); } } catch (e) {} if (quizAnswer()) continue; press('A', 4, 20); } // a trainer battle: Jev picks the moves
    return true;
  }
  return false;
}
// Session 20260927-055726: Gen 1 needs the POKE FLUTE USED from the bag next to SNORLAX (talking only says it sleeps). Mechanics only.
function curItem() { try { return read(sym('wCurrentMenuItem'))[0]; } catch (e) { return -1; } }
function curRowText() { try { const s = screen(); if (!s.cursor) return ''; return (s.rows[s.cursor.y] || '').slice(s.cursor.x + 1).trim(); } catch (e) { return ''; } }
// Session 20260927-063226: screen-driven menu nav (index/cursor-register nav never reached the flute: live 071323 opened the bag
// and ended on CANCEL, then the main loop's A-spam toggled bag<->start menu forever). Pick rows by the text beside the ▶ cursor.
function menuSelect(re, dir, n) { for (let i = 0; i < n; i++) { if (re.test(curRowText())) return true; press(dir, 4, 10); } return re.test(curRowText()); }
function useFlute() {
  try {
    const idx = bag().findIndex(i => /FLUTE/i.test(i.name || '')); if (idx < 0) return false;
    for (let i = 0; i < 12; i++) { const s0 = screen(); if (!s0.hasTextBox && !s0.waitingForA && !s0.cursor && i >= 2) break; press('B', 4, 16); }
    wait(20); press('START', 4, 30);
    { const s1 = screen(); log(`flute: after START cursor=${JSON.stringify(s1.cursor)} box=${s1.hasTextBox} rows=${JSON.stringify((s1.rows || []).slice(0, 16))}`); }
    const okItem = menuSelect(/^ITEM/, 'DOWN', 8);
    log(`flute: start menu cursor='${curRowText()}' ok=${okItem}`);
    if (!okItem) { for (let i = 0; i < 3; i++) press('B', 4, 12); return false; }
    press('A', 4, 30);
    // the bag list keeps its old cursor (live state: on CANCEL at the bottom) and does not wrap: search UP, then DOWN.
    if (/^ITEM/.test(curRowText())) { wait(20); press('A', 4, 30); }
    const okFl = /^(ITEM|SAVE|EXIT|OPTION|POK)/.test(curRowText()) ? false : (menuSelect(/FLUTE/i, 'UP', 30) || menuSelect(/FLUTE/i, 'DOWN', 30));
    log(`flute: bag cursor='${curRowText()}' ok=${okFl}`);
    if (!okFl) { for (let i = 0; i < 4; i++) press('B', 4, 12); return false; }
    press('A', 4, 24); // USE/TOSS submenu
    log(`flute: submenu cursor='${curRowText()}' rows=${JSON.stringify((screen().rows || []).slice(8, 14))}`);
    if (/TOSS/.test(curRowText())) press('UP', 4, 10);
    press('A', 4, 30); // USE
    const said = [];
    for (let i = 0; i < 14; i++) { if (gstate().inBattle) break; const d = (screen().dialog || '').toString(); if (d && said[said.length - 1] !== d) said.push(d.slice(0, 50)); press('A', 4, 20); }
    log(`used POKE FLUTE (bag idx ${idx}); inBattle=${gstate().inBattle} text=${JSON.stringify(said)}`);
    if (!gstate().inBattle) for (let i = 0; i < 4; i++) press('B', 4, 12);
    return true;
  } catch (e) { log('useFlute err ' + e); return false; }
}
const talked = {};
const talkedAt = {}; // map|x,y -> successful talks (a beaten Gen 1 trainer never moves out of a corridor)
// Session 20260927-055226: what each person said last time (live run 064909 looped on PSYDUCK/girl in MR_FUJIS_HOUSE).
const saidBy = {};
let billPcTries = 0;

function talkToMom() {
  const g = gridX(), m = (g.npcs || [])[0];
  if (!m) { healFails.REDS_HOUSE_1F = (healFails.REDS_HOUSE_1F || 0) + 1; return false; }
  for (const [d, [dx, dy]] of Object.entries(DIRS)) {
    const x = m.x - dx, y = m.y - dy;
    // pathDir treats its target as walkable, so a wall tile beside the target looked reachable (5F CARD KEY: (21,15) is '#').
    if (!(x === g.player.x && y === g.player.y) && (!(g.rows[y] && WALK.has(g.rows[y][x])) || !pathDir(g, x, y))) continue;
    if (!walkTo(x, y, /MT_MOON|ROCK_TUNNEL|SILPH_CO|ROCKET_HIDEOUT|POKEMON_MANSION|SEAFOAM|VICTORY_ROAD/.test(gstate().map) ? 150 : 30)) { if (gstate().inBattle) return true; continue; }
    hold(d, 2); wait(8);
    for (let i = 0; i < 12; i++) { if (gstate().inBattle) break; try { const d = (screen().dialog || '').toString().slice(0, 80); if (d && lastTexts[lastTexts.length - 1] !== d) { lastTexts.push(d); if (lastTexts.length > 8) lastTexts.shift(); } } catch (e) {} press('A', 4, 20); } // a trainer battle: Jev picks the moves
    if (hpFrac(party()) >= 1) return true;
  }
  healFails.REDS_HOUSE_1F = (healFails.REDS_HOUSE_1F || 0) + 1; goalCache.clear();
  return false;
}

let shopFails = 0;
const martWalkFails = {};
function ballCount() { try { return bag().filter(i => /BALL/i.test(i.name || '')).reduce((n, i) => n + (i.count || i.qty || 1), 0); } catch (e) { return 0; } }
// Poke Mart clerk: find the NPC with a counter tile ('C') next to it, stand across the counter, face it, then drive the
// BUY menu by reading screen text (logged as "shop screen:" so the flow can be debugged from run.jsonl).
// pokered wStatusFlags1 bit 6 = BIT_GAVE_SAFFRON_GUARDS_DRINK (all 4 Saffron gates open for good once one guard drank).
let guardsDrank = false;
function guardsOk() {
  if (guardsDrank) return true;
  try { if (read(sym('wStatusFlags1'))[0] & 0x40) guardsDrank = true; } catch (e) {}
  try { if (lastTexts.some(t => /You can go on through|thanks for the cool drinks/i.test(t))) guardsDrank = true; } catch (e) {}
  return guardsDrank;
}
let vendTries = 0;
const hasDrink = () => { try { return bag().some(i => /FRESH WATER|SODA POP|LEMONADE/i.test(i.name || '')); } catch (e) { return false; } };
// Session 20260927-091728: the bag was FULL (20/20) -> vending machine said "There's no more room for stuff!". Jev picks an item to toss.
const KEEP_RE = /^(HM|S\.S\.|LIFT KEY|SILPH SCOPE|POK. FLUTE|BICYCLE|CARD KEY|GOLD TEETH|SECRET KEY|OAK|TOWN MAP|COIN CASE|ITEMFINDER|EXP\.ALL|OLD ROD|GOOD ROD|SUPER ROD|.*FOSSIL|OLD AMBER|FRESH WATER|SODA POP|LEMONADE|BIKE VOUCHER)/i;
let roomTosses = 0;
function tossForRoom(why) {
  try {
    const b = bag(); if (b.length < 20) return true;
    const opts = {};
    for (const it of b) { const nm = it.name || ''; if (!nm || KEEP_RE.test(nm) || opts[nm]) continue;
      opts[nm] = /^TM/.test(nm) ? `${nm}: a single-use technical machine (teaches one move); throw it away` : /NUGGET/.test(nm) ? 'NUGGET: only worth money when sold (5000); throw it away' : /RARE CANDY/.test(nm) ? `RARE CANDY x${it.count || it.qty || 1}: +1 level each; throw ALL of them away` : /BALL/.test(nm) ? `${nm} x${it.count || it.qty || 1}: needed to catch Pokemon; throw ALL away` : `${nm} x${it.count || it.qty || 1}: throw it away`; }
    const ids = Object.keys(opts); if (!ids.length) return false;
    const fb = ids.find(i => /NUGGET/.test(i)) || ids.find(i => /^TM/.test(i)) || ids[0];
    const pick = askChoice({ map: gstate().map, goal: why || 'The bag is FULL (20 kinds of items). We must buy FRESH WATER for the Saffron gate guards, so one item kind must be thrown away to make room.', bag: b.map(i => i.name) }, 'Which item should we throw away to make room in the full bag?', opts, fb);
    log(`toss: Jev picked ${pick}`);
    for (let i = 0; i < 6; i++) press('B', 4, 12);
    for (let i = 0; i < 10 && screen().hasTextBox; i++) press('B', 4, 20); // "No more room for items!" may still be printing
    let inItem = false;
    for (let t = 0; t < 2 && !inItem; t++) { wait(20); press('START', 4, 30); inItem = menuSelect(/^ITEM/, 'DOWN', 8); if (!inItem) { log(`toss: no ITEM row in START menu (try ${t + 1}), cursor='${curRowText()}'`); for (let i = 0; i < 3; i++) press('B', 4, 12); } }
    if (!inItem) return false;
    press('A', 4, 30);
    const esc = new RegExp('^' + pick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!(menuSelect(esc, 'UP', 30) || menuSelect(esc, 'DOWN', 30))) { log(`toss: '${pick}' not found, cursor='${curRowText()}'`); for (let i = 0; i < 4; i++) press('B', 4, 12); return false; }
    press('A', 4, 24); // USE/TOSS submenu (test 221421: read before it was drawn -> cursor still on the item)
    // Session 20260927-221730 (CONFIRMED test): the first 4-frame A on the item is often ignored (screen unchanged after 96 frames);
    // a 10-frame A then opens USE/TOSS. Retry by screen text.
    for (let k = 0; k < 3 && !/USE|TOSS/.test(curRowText()); k++) { press('A', 10, 40); log(`toss: A retry ${k + 1}, cursor='${curRowText()}'`); }
    for (let k = 0; k < 12 && !/USE|TOSS/.test(curRowText()); k++) wait(6);
    if (/USE/.test(curRowText())) press('DOWN', 4, 10);
    log(`toss: submenu cursor='${curRowText()}'`);
    if (!/TOSS/.test(curRowText())) { for (let i = 0; i < 4; i++) press('B', 4, 12); return false; }
    press('A', 4, 30); // How many? -> for a stack, go to the max by pressing DOWN once (wraps 1 -> max)
    const n = (b.find(i => i.name === pick) || {}).count || (b.find(i => i.name === pick) || {}).qty || 1;
    if (n > 1) press('DOWN', 4, 10);
    for (let i = 0; i < 8; i++) { const s2 = screen(); log(`toss screen: ${((s2.rows || []).join('|')).replace(/\s+/g, ' ').slice(-110)}`); if (bag().length < b.length) break; press('A', 4, 24); }
    for (let i = 0; i < 6; i++) press('B', 4, 12);
    log(`toss: bag ${b.length} -> ${bag().length}`);
    return bag().length < 20;
  } catch (e) { log(`tossForRoom ${e}`); return false; }
}
function vendDrink() {
  try {
    const st = gstate(), m = rom.mapByName(st.map), signs = (m && m.signs) || [];
    try { const b = bag(); log(`vend: money ${st.money} bag(${b.length}) ${b.map(i => `${i.name}x${i.count || i.qty || ''}`).join(',')}`); } catch (e) {}
    if (!tossForRoom()) { log('vend: bag full and nothing tossed'); return false; }
    const D = [['UP', 0, 1], ['LEFT', 1, 0], ['RIGHT', -1, 0], ['DOWN', 0, -1]]; // face, stand offset from the machine
    for (const sg of signs) for (const [face, dx, dy] of D) {
      const g = gridX(), x = sg.x + dx, y = sg.y + dy, c = ((g.rows || [])[y] || '')[x];
      if (!(x === g.player.x && y === g.player.y) && !(WALK.has(c) && pathDir(g, x, y))) continue;
      if (!(x === gstate().x && y === gstate().y) && !walkTo(x, y, 40)) continue;
      hold(face, 2); wait(8); press('A', 4, 30);
      let picked = false;
      for (let i = 0; i < 20; i++) {
        const s = screen(), t = (s.rows || []).join('|');
        if (i < 10) log(`vend screen: ${t.replace(/\s+/g, ' ').slice(-120)}`);
        if (hasDrink()) break;
        if (!picked && /FRESH WATER/.test(t) && s.cursor) { press('A', 4, 30); picked = true; continue; }
        if (!(s.hasTextBox || s.waitingForA || s.cursor)) break;
        press('A', 4, 20);
      }
      for (let i = 0; i < 6; i++) press('B', 4, 15);
      if (hasDrink()) return true;
    }
  } catch (e) { log(`vendDrink ${e}`); }
  return hasDrink();
}
function buyBalls(st) {
  const before = ballCount(), n = Math.max(1, Math.min(5, Math.floor(((st.money || 0) - 500) / 200)));
  try {
    const g = gridX(), at = (x, y) => ((g.rows || [])[y] || '')[x] || '#';
    const D = [['LEFT', -1, 0], ['RIGHT', 1, 0], ['UP', 0, -1], ['DOWN', 0, 1]];
    let spot = null;
    for (const c of (g.npcs || [])) for (const [face, dx, dy] of D) {
      if (spot) break;
      if (at(c.x - dx, c.y - dy) === 'C') spot = { x: c.x - 2 * dx, y: c.y - 2 * dy, face };
    }
    if (!spot) { const c = (g.npcs || []).slice().sort((a, b) => a.x - b.x)[0]; if (c) spot = { x: c.x + 2, y: c.y, face: 'LEFT' }; }
    log(`shop: spot ${JSON.stringify(spot)} npcs ${JSON.stringify(g.npcs)}`);
    if (!spot || !walkTo(spot.x, spot.y, 40)) throw 'no path to clerk';
    hold(spot.face, 2); wait(8); press('A', 4, 30);
    let qtyDone = false, bought = false;
    for (let i = 0; i < 25; i++) {
      const s = screen(), t = ((s.rows || s.text || []).join ? (s.rows || s.text).join('|') : String(s.text || s.dialog || ''));
      if (i < 12) log(`shop screen: ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
      if (/How many/i.test(t) && !qtyDone) { for (let k = 1; k < n; k++) press('UP', 4, 10); press('A', 4, 30); qtyDone = true; continue; }
      if (/SELL/.test(t) && /BUY/.test(t) && bought) { press('B', 4, 20); break; }
      // After the quantity: confirm YES + "Here you are!" once, then back out (repeated A re-buys; live lost 5400 that way).
      if (qtyDone) { press('A', 4, 30); press('A', 4, 30); bought = true; break; }
      press('A', 4, 30);
    }
    for (let i = 0; i < 8; i++) press('B', 4, 20);
  } catch (e) { log(`buyBalls ${e}`); }
  const after = ballCount(); log(`shop: balls ${before} -> ${after}`);
  if (after <= before) shopFails++; goalCache.clear();
}
// Pokemon Center nurse: stand in front of the counter (3,3), face UP, mash A through "heal your Pokemon?" (YES is default).
// Indigo Plateau lobby: its nurse is not at the usual (3,1) and the map name has no _POKECENTER (healAtCenter never ran there).
let lobbyHealFails = 0;
function lobbyHeal() {
  e4LeadAsked.clear();
  // rom.mapByName('INDIGO_PLATEAU_LOBBY').npcs is EMPTY (test 213209). pokered IndigoPlateauLobby objects: NURSE (7,5), COOLTRAINER_F
  // (5,1) (matches the grid's N at 5,1), so stand at (7,7) and talk UP across the counter (like (3,3) -> nurse (3,1) in centers).
  let ok = false; try { ok = healAtCenter(7, 7); } catch (e) { log(`lobbyHeal ${e}`); }
  if (!ok) { lobbyHealFails++; wait(30); } // always advance the game (a no-op failure path hit the harness 'stuck' limit)
  log(`lobbyHeal: ok=${ok} fails=${lobbyHealFails} at ${gstate().x},${gstate().y}`);
  return ok;
}
// Session 20260927-221230 (DEEP) ROOT CAUSE of the E4 loop (live 225454/230429/230941): HP/faints carry between E4 rooms and the bag
// has NO healing items, so every run beats LORELEI + BRUNO, enters AGATHA's room with VENUSAUR/LAPRAS fainted and blacks out
// (GOLBAT Lv56 'lost', all 0 HP) -> lobby -> Lorelei again. Fix: Jev buys REVIVE/MAX POTION/FULL RESTORE at the lobby mart
// (clerk N at (0,5) behind counter C (1,5): stand at (2,5) facing LEFT), and uses them outside battle in E4 rooms.
const LOBBY_MART = [
  { name: 'REVIVE', price: 1500, fact: 'brings a FAINTED member back with half HP (the only way to get a fainted member back between Elite Four rooms)' },
  { name: 'MAX POTION', price: 2500, fact: 'restores ALL HP of one member (not fainted ones)' },
  { name: 'FULL RESTORE', price: 3000, fact: 'restores ALL HP and cures status of one member (not fainted ones)' },
  // Session 20260928-000231: live 005451 VENUSAUR won AGATHA's room PARALYZED, got a MAX POTION (HP only) and walked into LANCE still PAR.
  { name: 'FULL HEAL', price: 600, fact: 'cures any status (PARALYZED/SLEEP/POISON/BURN/FREEZE) of one member; does not restore HP. A paralyzed member has 1/4 speed (every enemy moves first) and loses 1 turn in 4. EVIDENCE: live run 005451 and test 000439: VENUSAUR was PARALYZED in AGATHA\'s room and stayed PARALYZED through LANCE and the CHAMPION ("fully paralyzed!" 3x there); MAX POTION/REVIVE do not cure it and there is no nurse until the run ends. 1 FULL HEAL lets us cure it between rooms' },
];
const statusBad = m => !!(m && m.hp > 0 && m.status && !/^(OK|NONE)?$/i.test(String(m.status)));
const curesStatus = (item, status) => /^(FULL HEAL|FULL RESTORE)$/i.test(item) || ({ 'PARLYZ HEAL': /PAR/i, AWAKENING: /SLEEP|SLP/i, 'ICE HEAL': /FREEZE|FRZ/i, 'BURN HEAL': /BURN|BRN/i, ANTIDOTE: /POIS|PSN/i }[String(item).toUpperCase()] || /^$/).test(String(status || ''));
const isCureOnly = item => /^(FULL HEAL|PARLYZ HEAL|AWAKENING|ICE HEAL|BURN HEAL|ANTIDOTE)$/i.test(String(item));
let shopVisit = 0, shopBuys = 0, shopFailsE4 = 0, shopLeftLobby = false; const shopAsked = {};
const healItems = () => { try { return bag().filter(i => /^(REVIVE|MAX REVIVE|MAX POTION|FULL RESTORE|HYPER POTION|SUPER POTION|FULL HEAL|PARLYZ HEAL|AWAKENING|ICE HEAL|BURN HEAL|ANTIDOTE)$/i.test(String(i.name || ''))); } catch (e) { return []; } };
function maybeLobbyShop(st) {
  // Session 20260928-002231 (DEEP): live 010616 lost the CHAMPION, the one lobby buy failed ("item list not shown": A pressed while not
  // facing the clerk), shopAsked kept the same sig so it was never retried, and the bot entered the E4 with 13216 money unspent and only
  // MAX POTION x2 (no REVIVE/FULL HEAL) -> VENUSAUR slept + fainted in AGATHA's room. Counters were also per RUN, not per lobby visit.
  if (shopLeftLobby) { shopLeftLobby = false; shopBuys = 0; shopFailsE4 = 0; for (const k in shopAsked) delete shopAsked[k]; }
  if (shopBuys >= 4 || shopFailsE4 >= 3 || (st.money || 0) < 1500) return false;
  const p = party(); if (hpFrac(p) < 1) return false; // heal at the nurse first (free)
  const have = healItems(), haveTxt = have.map(i => `${i.name} x${i.qty || i.count || 1}`).join(', ') || 'none';
  const sig = `${st.money}|${haveTxt}`; if (shopAsked[sig]) return false;
  // Session 20260927-223730: live 232323 bought only REVIVEs, then VENUSAUR (the only strong member) entered AGATHA's room at 40/242 HP
  // after beating Bruno and fainted at once; a REVIVE cannot be used on a member that has not fainted yet.
  let carryFact = ''; try { const top = [...p].sort((a, b) => b.level - a.level); if (top.length > 1 && top[0].level - top[1].level >= 20) carryFact = ` NOTE: ${top[0].species} Lv${top[0].level} is our only strong member (next best Lv${top[1].level}); it wins most E4 fights alone but usually ends them at LOW HP (e.g. 40/242 entering Agatha's room, then lost), and a REVIVE does nothing until it faints`; } catch (e) {}
  // Session 20260927-235731 (DEEP): the shop kept 2000 back and needed 3500 to open, so 13069 money bought MAX POTION x4 and nothing
  // else. Live 002711 and 004052: VENUSAUR fainted in LANCE's room with only MAX POTIONs in the bag (they cannot revive), so fieldHeal
  // had no option, it entered the CHAMPION fainted and the pass was lost. Offer potion counts that leave room for a REVIVE.
  const noRevive = !have.some(i => /REVIVE/i.test(String(i.name || '')));
  const spend = (st.money || 0), opts = { skip: `Buy nothing more; keep the money (${st.money}). Kept money is USELESS for this pass: the only shop is this lobby and we only come back here after LOSING, which halves it (so ${st.money} kept = ${Math.floor((st.money || 0) / 2)} next time); winning the Champion ends the game. Live 014030 entered the CHAMPION with 26015 unspendable money and no healing item and lost at its last Pokemon (CHARIZARD).` };
  // Test 235934: offered REVIVE x5, Jev bought 5 (7500) and fewer MAX POTIONs; a REVIVE is a reserve, so offer exactly 1.
  for (const it of LOBBY_MART) { const n = it.name === 'REVIVE' || it.name === 'FULL HEAL' ? Math.min(1, Math.floor(spend / it.price)) : Math.min(5, Math.floor(spend / it.price)); for (const k of [n, n - 1]) { if (k < 1) continue; const left = spend - k * it.price;
    const cnt = re => have.filter(i => re.test(String(i.name || ''))).reduce((a, i) => a + (i.qty || i.count || 1), 0);
    // Only for LEFTOVER money (test 010224: firing with 11685 money bought REVIVE x5 and only 1 MAX POTION): exactly 1 REVIVE, FULL HEAL first,
    // and either no MAX POTION is affordable or 4+ are already in the bag.
    const rv = it.name === 'REVIVE' ? (cnt(/^REVIVE$/i) === 1 && (cnt(/FULL HEAL/i) > 0 || spend < 2100) && (spend < 2500 || cnt(/MAX POTION|FULL RESTORE/i) >= 4) ? ` We already have a REVIVE; this would be a SECOND one, bought with money that is otherwise wasted. EVIDENCE: live 014030 kept 1507 (exactly one REVIVE) unspent, then VENUSAUR fainted at the CHAMPION's LAST Pokemon (CHARIZARD, 32/273 HP, no item left) and the pass was lost; test 005748 kept 3121, VENUSAUR fainted in AGATHA's room, the one REVIVE was already used, it could not be brought back and LANCE beat the bench. In battle a REVIVE on a fainted VENUSAUR (half HP, Lv80+) beats any bench member.` : '') + (noRevive ? ' We have NO REVIVE now: in live runs 002711 and 004052 VENUSAUR fainted in LANCE\'s room, the bag held only MAX POTIONs (useless on a fainted member), it entered the CHAMPION fainted and we lost the whole run. One REVIVE + one MAX POTION brings it back to full.' : '')
      : (noRevive && /POTION|RESTORE/.test(it.name) ? (left >= 1500 ? ` Leaves ${left}: enough for 1 REVIVE afterwards (we have none).` : ` Leaves ${left}: NOT enough for a REVIVE (we have none; a fainted VENUSAUR then ends the run).`) : '');
    // Session 20260928-000731: tests 001129/001258 (CHAMPION): PARALYZED VENUSAUR (since AGATHA) was healed 27 -> 263 by a MAX POTION and
    // still fainted to ALAKAZAM (97 HP per turn, enemy always first, "fully paralyzed!" turns). Jev rated FULL HEAL 0-1% at the lobby.
    const parTxt = it.name === 'FULL HEAL' ? ` Costs 600 = less than a quarter of one MAX POTION. TESTS 001129/001258: VENUSAUR stayed PARALYZED from AGATHA to the CHAMPION; even after a MAX POTION to full HP, ALAKAZAM moved first every turn and hit it for ~97, VENUSAUR lost turns to "fully paralyzed!" and fainted, and the pass was lost. Buying 1 FULL HEAL lets us cure it between rooms (the heal step offers it automatically).${parLog.rooms.size ? ` THIS RUN: PARALYZED ${[...parLog.rooms].join(', ')}${parLog.bigHit ? `; while paralyzed ${parLog.bigHit.who} took up to ${parLog.bigHit.d} HP in one ${parLog.bigHit.enemy} turn` : ''}.` : ''}` : '';
    opts['buy_' + it.name.replace(/ /g, '_') + '_x' + k] = `Buy ${k} ${it.name} for ${k * it.price} (${it.price} each): ${it.fact}. Used by us between Elite Four rooms (no nurse there).${/POTION|RESTORE/.test(it.name) ? carryFact : ''}${rv}${parTxt}`; if (it.name === 'REVIVE') break; } }
  if (Object.keys(opts).length < 2) return false;
  const ctx = { map: st.map, money: st.money, healingItemsInBag: haveTxt,
    team: p.map(m => `${m.species} Lv${m.level}`).join(', '),
    why: 'The Elite Four + Champion is 5 battles in a row with NO healing between rooms except items. VENUSAUR (our only strong member) wins most fights alone but loses ~150-250 HP per room (LORELEI alone took it to 4/256), so it needs about one MAX POTION per room, and if it FAINTS (LANCE\'s DRAGONITE/AERODACTYL did this twice) only a REVIVE brings it back. Best mix so far: MAX POTIONs plus 1 REVIVE kept in reserve, plus 1 FULL HEAL (600) because VENUSAUR gets PARALYZED in AGATHA\'s room and a paralyzed carry lost the CHAMPION fight even at full HP.' };
  const c = askChoice(ctx, 'We are in the Indigo Plateau lobby next to the shop. What should we buy before the Elite Four?', opts, (noRevive && Object.keys(opts).find(k => /REVIVE/.test(k))) || Object.keys(opts).find(k => /MAX_POTION/.test(k)) || Object.keys(opts).find(k => /REVIVE/.test(k)) || 'skip');
  shopAsked[sig] = c; log(`lobbyShop: Jev chose ${c} (money ${st.money}, have ${haveTxt})`);
  const m = /^buy_(.+)_x(\d+)$/.exec(c || ''); if (!m) return false;
  const item = m[1].replace(/_/g, ' '), n = +m[2], before = healItems().reduce((a, i) => a + (/^/.test(i.name) && i.name === item ? (i.qty || i.count || 1) : 0), 0);
  shopBuys++;
  // Test 221421: the mart answered "You can't carry any more items" - the bag holds 20 kinds (full), so nothing was ever bought.
  try { if (bag().length >= 20 && !bag().some(i => i.name === item) && !tossForRoom(`The bag is FULL (20 kinds of items) so the Indigo Plateau shop refuses to sell us ${item} ("You can't carry any more items"). Healing items are the only way to heal between Elite Four rooms (we have lost to AGATHA every time without them). Throw away one item kind that is useless for the Elite Four (e.g. fossils, sold-able valuables, used-up keys, TMs no one can use).`)) { shopFailsE4++; log('lobbyShop: bag full, toss failed'); return true; } } catch (e) { log(`lobbyShop toss ${e}`); }
  try {
    // Test 221906: walkTo(2,5) returned but a queued UP step left us on (2,4) -> A faced nothing ("item list not shown"). Re-check the tile.
    for (let k = 0; k < 4; k++) { wait(12); const g = gstate(); if (g.x === 2 && g.y === 5) break; log(`lobbyShop: at (${g.x},${g.y}), re-walk to (2,5)`); if (!walkTo(2, 5, 40)) throw 'no path to clerk (2,5)'; }
    { const g = gstate(); if (g.x !== 2 || g.y !== 5) throw `not at clerk tile (${g.x},${g.y})`; }
    // Face the counter for real before A (state().facing), and re-face if no dialog appears.
    let inList = false, talked = false;
    for (let f = 0; f < 4 && !talked; f++) {
      for (let k = 0; k < 4 && gstate().facing !== 'left'; k++) { hold('LEFT', 2 + k); wait(8); }
      const g = gstate(); log(`lobbyShop: face try ${f} at (${g.x},${g.y}) facing ${g.facing}`);
      if (g.x !== 2 || g.y !== 5) { if (!walkTo(2, 5, 40)) throw 'lost clerk tile'; continue; }
      press('A', 4, 30);
      for (let k = 0; k < 3 && !talked; k++) { const s = screen(); if (s.hasTextBox || s.waitingForA || s.cursor) talked = true; else wait(15); }
    }
    for (let i = 0; i < 12 && !inList; i++) { const s = screen(), t = (s.rows || []).join('|'); if (i < 8) log(`lobbyShop screen: ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
      if (s.cursor && /BUY/.test(t) && /SELL/.test(t) && /BUY/.test(curRowText())) { press('A', 4, 40); continue; }
      if (s.cursor && /MAX|REVIVE|ULTRA|RESTORE/.test(t) && !/SELL/.test(t)) { inList = true; break; }
      press('A', 4, 30); }
    if (!inList) throw 'item list not shown';
    const re = new RegExp('^' + item.replace(/[^A-Z ]/g, '.'));
    for (let k = 0; k < 8; k++) press('UP', 4, 8);
    if (!menuSelect(re, 'DOWN', 9)) throw `${item} not in list (row '${curRowText()}')`;
    const sl = w => log(`lobbyShop ${w}: ${screen().rows.join('|').replace(/\s+/g, ' ').slice(-150)}`);
    press('A', 4, 40); wait(20); sl('qty');
    for (let k = 1; k < n; k++) press('UP', 4, 10);
    sl('qty set'); press('A', 4, 30); // -> "REVIVE? That will be X. OK?" then YES/NO (YES default)
    for (let k = 0; k < 12 && !/YES/.test(screen().rows.join('|')); k++) wait(10);
    sl('confirm'); press('A', 4, 40); wait(20); // YES
    for (let k = 0; k < 4; k++) { sl('after'); if (/Here you are|Thank you/i.test(screen().rows.join('|'))) { press('A', 4, 30); break; } press('A', 4, 20); }
  } catch (e) { log(`lobbyShop ${e}`); }
  closeMenus(); for (let k = 0; k < 4; k++) press('B', 4, 16);
  const after = healItems().reduce((a, i) => a + (i.name === item ? (i.qty || i.count || 1) : 0), 0);
  log(`lobbyShop: ${item} ${before} -> ${after}, money ${gstate().money}`);
  if (after <= before) { shopFailsE4++; shopBuys--; delete shopAsked[sig]; } // failed: allow a retry (same Jev answer is re-asked)
  return true;
}
// Use a healing item from the bag OUTSIDE battle in an E4 room (START > ITEM > item > USE > member). Jev picks item+member or skip.
const fieldHealAsked = {}; let fieldHealFails = 0, fieldHealRoom = '';
function maybeFieldHeal(st) {
  // Test 232833: 4 misses after AGATHA (2x 'ITEM not found', 2x wrong member) disabled healing for the rest of the run, so VENUSAUR
  // walked into the CHAMPION at 38/256 with MAX POTIONs in the bag. Count failures per room.
  if (fieldHealRoom !== st.map) { fieldHealRoom = st.map; fieldHealFails = 0; }
  if (fieldHealFails >= 4) return false;
  const have = healItems(); if (!have.length) return false;
  const p = party(); const hurt = p.map((m, i) => ({ m, i })).filter(({ m, i }) => m.maxHp && (m.hp < (i === 0 || m.level >= 60 ? 0.75 : 0.5) * m.maxHp || statusBad(m))); // carry offered below 75% (test 232833: VENUSAUR 128/256 was never offered) if (!hurt.length) return false;
  const sig = `${st.map}|${p.map(m => m.hp).join(',')}|${have.map(i => i.name + (i.qty || i.count)).join(',')}`; if (fieldHealAsked[sig]) return false;
  const opts = { skip: 'Use nothing now; save the items' };
  // Session 20260927-234231: live 002711 after AGATHA spent 2 MAX POTIONs on HAUNTER Lv38 while VENUSAUR (revived, 128/256) got none,
  // then VENUSAUR fainted in LANCE's room and the Haunters lost. Tell Jev which member carries the team.
  let carry = -1, next = 0; try { const byLv = p.map((m, i) => ({ l: m.level, i })).sort((a, b) => b.l - a.l); if (byLv.length > 1 && byLv[0].l - byLv[1].l >= 20) { carry = byLv[0].i; next = byLv[1].l; } } catch (e) {}
  const carryTag = i => carry < 0 ? '' : i === carry ? `. OUR ONLY STRONG MEMBER (next best Lv${next}): it must win the remaining rooms almost alone, so it needs the HP most` : `. Bench member: it cannot beat the Lv53-65 Elite Four/Champion teams itself; an item used here is one fewer for ${p[carry].species}`;
  for (const { m, i } of hurt) for (const it of have) {
    const nm = String(it.name), rev = /REVIVE/.test(nm);
    if (rev !== (m.hp === 0)) continue;
    // Session 20260928-000231: status cures (live 005451: VENUSAUR entered LANCE's room PARALYZED after a MAX POTION).
    const lowHp = m.hp < (i === 0 || m.level >= 60 ? 0.75 : 0.5) * m.maxHp, cure = statusBad(m) && curesStatus(nm, m.status);
    if (isCureOnly(nm) ? !cure : (!rev && !lowHp && !cure)) continue;
    opts[`use_${i}_${nm.replace(/ /g, '_')}`] = `Use ${nm} on ${m.species} Lv${m.level} (${m.hp === 0 ? 'FAINTED' : `HP ${m.hp}/${m.maxHp}`}${statusBad(m) ? `, status ${m.status}${/PAR/i.test(m.status) ? ': speed x1/4 so every enemy moves first, and 1 turn in 4 lost to full paralysis' : /SLEEP/i.test(m.status) ? ': cannot act until it wakes' : ''}` : ''}${cure ? ` -> ${nm} CURES the ${m.status}` : statusBad(m) && !rev ? ` -> ${nm} does NOT cure ${m.status}` : ''}; attacks ${(m.moves || []).filter(Boolean).map(x => (x.name || x) + (x.pp != null ? ' ' + x.pp + 'PP' : '')).join(', ')}) -> ${rev ? (/MAX/.test(nm) ? 'full HP' : `${Math.floor(m.maxHp / 2)} HP`) : /MAX|FULL/.test(nm) ? 'full HP' : nm}${carryTag(i)}`;
  }
  if (Object.keys(opts).length < 2) { fieldHealAsked[sig] = 'none'; return false; }
  const room = { LORELEIS_ROOM: 'LORELEI (Ice/Water: DEWGONG, CLOYSTER, SLOWBRO, JYNX, LAPRAS Lv53-56)', BRUNOS_ROOM: 'BRUNO (Fighting/Rock: ONIX x2, HITMONCHAN, HITMONLEE, MACHAMP Lv53-58)', AGATHAS_ROOM: 'AGATHA (Ghost/Poison: GENGAR x2, GOLBAT, HAUNTER, ARBOK Lv54-60; our Grass moves are weak vs Poison, Normal moves cannot hit Ghosts)', LANCES_ROOM: 'LANCE (Dragon/Flying: GYARADOS, DRAGONAIR x2, AERODACTYL, DRAGONITE Lv56-62)', CHAMPIONS_ROOM: 'the CHAMPION (rival, mixed team Lv61-65)' }[st.map] || st.map;
  const NEXT = { LORELEIS_ROOM: 'BRUNOS_ROOM', BRUNOS_ROOM: 'AGATHAS_ROOM', AGATHAS_ROOM: 'LANCES_ROOM', LANCES_ROOM: 'CHAMPIONS_ROOM' };
  const nextRoom = NEXT[st.map] ? ({ BRUNOS_ROOM: 'BRUNO (Fighting/Rock Lv53-58)', AGATHAS_ROOM: 'AGATHA (Ghost/Poison Lv54-60)', LANCES_ROOM: 'LANCE (GYARADOS, DRAGONAIR x2, AERODACTYL, DRAGONITE Lv56-62)', CHAMPIONS_ROOM: 'the CHAMPION (PIDGEOT, ALAKAZAM, RHYDON, EXEGGUTOR, GYARADOS, CHARIZARD Lv61-65)' })[NEXT[st.map]] : '';
  const c = askChoice({ map: st.map, thisRoom: room, nextRoomAfterThisOneIsWon: nextRoom || 'none (this is the last)', roomsLeftIncludingThis: { LORELEIS_ROOM: 5, BRUNOS_ROOM: 4, AGATHAS_ROOM: 3, LANCES_ROOM: 2, CHAMPIONS_ROOM: 1 }[st.map] || '?', team: p.map(m => `${m.species} Lv${m.level} ${m.hp}/${m.maxHp}`).join(', '), bag: have.map(i => `${i.name} x${i.qty || i.count || 1}`).join(', '),
    note: 'Out of battle, using an item costs no turn. There is no nurse until we win or lose the whole Elite Four; if the whole party faints we start over from LORELEI.',
    // Session 20260928-004732: live 012547 used a MAX POTION on VENUSAUR 133/266 in LORELEI's room (room 1 of 5) and live 014030
    // entered the CHAMPION (last, hardest room) at 194/273 with NO item left and lost at CHARIZARD, its last Pokemon.
    itemBudget: `${have.filter(i => /POTION|RESTORE|REVIVE/.test(String(i.name))).reduce((a, i) => a + (i.qty || i.count || 1), 0)} HP items for ${{ LORELEIS_ROOM: 5, BRUNOS_ROOM: 4, AGATHAS_ROOM: 3, LANCES_ROOM: 2, CHAMPIONS_ROOM: 1 }[st.map] || '?'} rooms (incl. this one). The CHAMPION (last room: 6 Pokemon Lv61-65; PIDGEOT, ALAKAZAM and CHARIZARD all hit VENUSAUR super-effectively) is the hardest: live 014030 reached it at 194/273 with NO item left and lost at its LAST Pokemon. An item used at half HP wastes half its value; in-battle healing (HEAL_ITEM) is also possible when HP gets low.` },
    'Before the next Elite Four battle: use a healing item on a member now? (We will be asked again after each use.)', opts, Object.keys(opts).find(k => k !== 'skip') || 'skip');
  fieldHealAsked[sig] = c; log(`fieldHeal: Jev chose ${c}`);
  const m = /^use_(\d+)_(.+)$/.exec(c || ''); if (!m) return false;
  const li = +m[1], item = m[2].replace(/_/g, ' '), hp0 = p[li].hp, st0 = p[li].status;
  try {
    for (let i = 0; i < 6; i++) { const s0 = screen(); if (!s0.hasTextBox && !s0.waitingForA && !s0.cursor) break; press('B', 4, 16); }
    // Live 231603: START pressed while a step was still queued (LANCES_ROOM x 22->18) never opened the menu -> 'ITEM not found';
    // and in AGATHAS_ROOM the A on ITEM was missed (same intermittent missed A as tossForRoom), so the UP/DOWN search ran on the
    // start menu -> 'MAX REVIVE not found in bag'. Retry START until the menu shows, retry A until the cursor leaves ITEM.
    wait(24);
    // Tests 233137/233319: the first try right after an E4 win never opened START (screen() rows blank = no menu; the room's
    // post-battle script still holds input), the retry a few hundred frames later worked. Keep retrying START with longer waits.
    for (let t = 0; t < 7; t++) {
      if (/CANCEL/.test((screen().rows || []).join('|')) && screen().cursor && !/^(POK|ITEM|SAVE|OPTION|EXIT)/.test(curRowText())) break; // bag list still open from the last use
      press('START', 4, 30);
      let open = false; for (let k = 0; k < 10; k++) { const s = screen(); if (s.cursor && /EXIT/.test((s.rows || []).join('|'))) { open = true; break; } wait(8); }
      if (open) break; for (let k = 0; k < 3; k++) press('B', 4, 12); wait(t < 2 ? 20 : 90);
    }
    // Test 233137: the 2nd heal found the BAG LIST still open (cursor on CANCEL) -> go straight to the item search.
    const bagOpen = /CANCEL/.test((screen().rows || []).join('|')) && !!screen().cursor && !/^(POK|ITEM|SAVE|OPTION|EXIT)/.test(curRowText());
    if (!bagOpen && !menuSelect(/^ITEM/, 'DOWN', 8)) { const sx = screen(); throw `ITEM not found (cursor ${JSON.stringify(sx.cursor)} rows ${JSON.stringify((sx.rows || []).slice(0, 12))})`; }
    if (!bagOpen) press('A', 4, 30);
    for (let k = 0; k < 3 && /^(ITEM|SAVE|EXIT|OPTION|POK)/.test(curRowText()); k++) { wait(20); press('A', 10, 40); }
    if (/^(ITEM|SAVE|EXIT|OPTION|POK)/.test(curRowText())) throw `bag did not open (cursor '${curRowText()}')`;
    const itRe = new RegExp('^' + item.replace(/[^A-Z ]/g, '.'));
    if (!(menuSelect(itRe, 'UP', 30) || menuSelect(itRe, 'DOWN', 30))) { log(`fieldHeal bag rows=${JSON.stringify((screen().rows || []).slice(0, 12))}`); throw `${item} not found in bag`; }
    // Same missed-A as tossForRoom (test 221746): open USE/TOSS by screen text, then A on USE.
    press('A', 4, 24);
    for (let k = 0; k < 3 && !/USE|TOSS/.test(curRowText()); k++) press('A', 10, 40);
    if (/TOSS/.test(curRowText())) press('UP', 4, 10);
    if (!/USE/.test(curRowText())) throw `USE/TOSS not shown (cursor '${curRowText()}')`;
    press('A', 4, 30); // USE
    for (let k = 0; k < 12; k++) { const s = screen(); if (s.cursor && /which|POK/i.test((s.rows || []).join('|'))) break; wait(6); }
    partyCursorTo(li); press('A', 4, 40);
    for (let k = 0; k < 4; k++) { log(`fieldHeal screen: ${screen().rows.join('|').replace(/\s+/g, ' ').slice(0, 140)}`); press('A', 4, 20); }
  } catch (e) { log(`fieldHeal ${e}`); }
  // Test 233319: "recovered by 90!" was still printing when closeMenus saw a clear screen and returned; the bag + START menu stayed
  // open and walkTo's A presses used items ("It won't have any effect." x16, ~20k frames lost). Close until clear 3 reads in a row.
  for (let k = 0, clear = 0; k < 30 && clear < 3; k++) { const s = screen(); if (!s.cursor && !s.hasTextBox && !s.waitingForA) { clear++; wait(10); } else { clear = 0; press('B', 4, 16); wait(6); } }
  const q1 = party()[li] || {}, hp1 = q1.hp; log(`fieldHeal: ${item} on member ${li} HP ${hp0} -> ${hp1} status ${st0} -> ${q1.status}`); if (!(hp1 > hp0) && !(statusBad({ hp: 1, status: st0 }) && !statusBad(q1))) { fieldHealFails++; delete fieldHealAsked[sig]; }
  return true;
}
function healAtCenter(hx = 3, hy = 3) {
  try {
    if (!walkTo(hx, hy, 40)) { const g = gridX(), m = (g.npcs || []).find(n => n.y <= 2); if (!m || !walkTo(m.x, m.y + 2, 30)) throw 'no path'; }
    hold('UP', 2); wait(8);
    // Session 20260927-162012 ROOT CAUSE of the Pewter PC loop (live 171605): this loop only ran while HP < 100%, so at full HP with
    // MEGA DRAIN 0/10 PP the nurse was never talked to, PP stayed 45%, healTrip never cleared and goWarp went straight back in.
    const full = () => { const pp = party(); return hpFrac(pp) >= 1 && ppFrac(pp) >= 0.99; };
    for (let i = 0; i < 20 && (i < 3 || !full()); i++) press('A', 4, 30);
    for (let i = 0; i < 8; i++) press('B', 4, 20);
    if (full()) { log(`healed at Pokemon Center (HP ${Math.round(hpFrac(party()) * 100)}%, PP ${Math.round(ppFrac(party()) * 100)}%)`); healTrip = null; for (const k in healFails) if (k.startsWith('PC|')) delete healFails[k]; goalCache.clear(); return true; }
    log(`healAtCenter: nurse did not restore (HP ${Math.round(hpFrac(party()) * 100)}%, PP ${Math.round(ppFrac(party()) * 100)}%)`); healTrip = null;
  } catch (e) { log(`healAtCenter ${e}`); }
  healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); log('healAtCenter failed');
  return false;
}

const edgeDump = {};
let lastEdge = null; // last map-edge push: { map, side, b } (b = coordinate along that edge)
// Tiles reachable from the player on foot (NPCs are walls). pocket = tiny area with no warp, ledge, water or other edge:
// Session 20260927-073727 ROOT CAUSE of the Route 13/14 loop: Route 13's west edge row 6 lands on Route 14 (19,6), a 4-tile
// corridor sealed by a BIRD KEEPER standing at (15,6); the real way is Route 13 row 4 -> Route 14 row 4 -> down x=5 -> row 6 -> (14,7).
function reachInfo(g, entrySide) {
  const { width: w, height: h } = g, seen = new Set([`${g.player.x},${g.player.y}`]), q = [[g.player.x, g.player.y]];
  let other = false, exitish = false;
  while (q.length) {
    const [x, y] = q.pop();
    if ((x === 0 && entrySide !== 'west') || (x === w - 1 && entrySide !== 'east') || (y === 0 && entrySide !== 'north') || (y === h - 1 && entrySide !== 'south')) other = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = g.rows[ny][nx];
      if (c === 'D' || c === '~' || c === 'T' || c === 'C' || LEDGE[c]) exitish = true;
      if (!WALK.has(c) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`); q.push([nx, ny]);
    }
  }
  return { n: seen.size, pocket: seen.size < 16 && !other && !exitish };
}
// Session 20260927-091728 ROOT CAUSE (ROUTE_12 <-> ROUTE_12_GATE_1F endless bounce): failures were keyed by MAP only, but ROUTE_12 is
// cut in two by its gate building. walkEdge north failed from the SOUTH part (+3, hidden), so after walking through the gate into the
// NORTH part, edge:north (the real way to Lavender) was still hidden and Jev could only pick edge:south (back into the gate).
// edgeBad was also keyed by the coordinate ALONG the edge only, so pushes at inner rows (y=22,26,61) blacklisted every x of the north edge.
// Fix: destFail keys use rk(map) = map + id of the walkable component the player stands in; edgeBad keys include the row/column.
const regionCache = {};
function rk(map) {
  try {
    const s = gstate(); if (!s || s.map !== map) return map;
    const ck = `${map}|${s.x},${s.y}`; if (regionCache[ck] !== undefined) return regionCache[ck];
    const g = gridX(); if (!g || !g.rows || g.map && g.map !== map) return map;
    const w = g.width, h = g.height; let best = s.y * w + s.x; const seen = new Set([best]), q = [[s.x, s.y]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const c = g.rows[ny][nx]; if (!(WALK.has(c) || c === 'N')) continue;
        const id = ny * w + nx; if (seen.has(id)) continue; seen.add(id); if (id < best) best = id; q.push([nx, ny]);
      }
    }
    const r = seen.size > 1 ? `${map}#${best}` : map;
    if (Object.keys(regionCache).length > 4000) for (const k in regionCache) delete regionCache[k];
    regionCache[ck] = r; return r;
  } catch (e) { return map; }
}
const OPP_SIDE = { north: 'south', south: 'north', west: 'east', east: 'west' };
const edgeBad = {}; // map|side|x,y -> edge tiles where stepping off did NOT change the map (blocked on the other side)
// When the reachable part of the map ends short of the real edge (Route 2 east strip: rows beyond 21 behind a CUT tree), cut toward
// the outermost walkable tile we cannot reach yet. Once per map+side.
const edgeCutDone = {};
function edgeCutTry(g, st, side, outer, m, vert) {
  if (edgeCutDone[st.map + side]) return false; edgeCutDone[st.map + side] = 1;
  try {
    for (const a of outer) for (const b of [...Array(m).keys()]) {
      const c = vert ? (g.rows[a] || '')[b] : (g.rows[b] || '')[a]; if (!WALK.has(c)) continue;
      const [x, y] = vert ? [b, a] : [a, b]; if (pathDir(g, x, y)) return false; // outermost tile already reachable: no tree to cut
      if (cutTreeToward(x, y)) { log(`walkEdge ${side}: cut a tree toward unreachable (${x},${y})`); return true; }
      return false;
    }
  } catch (e) { log(`edgeCut ${e}`); }
  return false;
}
function walkEdge(side) {
  const g = gridX(), st = gstate();
  const vert = side === 'north' || side === 'south';
  const n = vert ? g.height : g.width, m = vert ? g.width : g.height;
  const outer = side === 'south' || side === 'east' ? [...Array(n).keys()].reverse() : [...Array(n).keys()];
  const cur = vert ? st.x : st.y;
  const key = { north: 'UP', south: 'DOWN', west: 'LEFT', east: 'RIGHT' }[side] || 'UP';
  if (!edgeDump[st.map + side]) { edgeDump[st.map + side] = 1; log(`walkEdge ${side}: from (${st.x},${st.y}) exits=${JSON.stringify(g.exits)}\n${g.rows.slice(Math.max(0, st.y - 4)).map((r, i) => `${Math.max(0, st.y - 4) + i}:${r}`).join("|")}`); }
  // Try several edge-most tiles: the neighbouring map's connection may only be open on some of them
  // (e.g. LAVENDER_TOWN west row 4 faces Route 8 trees). Tiles where stepping off failed are remembered.
  for (let attempt = 0; attempt < 12; attempt++) {
    let tgt = null;
    for (const a of outer) {
      const bs = [...Array(m).keys()].filter(b => WALK.has(vert ? g.rows[a][b] : g.rows[b][a]))
        .filter(b => !edgeBad[`${st.map}|${side}|${a}|${b}`]).sort((p, q) => Math.abs(p - cur) - Math.abs(q - cur));
      for (const b of bs) { const [x, y] = vert ? [b, a] : [a, b];
        const s2 = gstate(); if ((x === s2.x && y === s2.y) || pathDir(g, x, y)) { tgt = [x, y, b, a]; break; } }
      if (tgt) break;
    }
    if (!tgt) { log(`walkEdge ${side}: no reachable edge tile left on ${st.map}`); if (edgeCutTry(g, st, side, outer, m, vert)) continue; return 'unreachable'; }
    const s1 = gstate();
    if (!(s1.x === tgt[0] && s1.y === tgt[1]) && !walkTo(tgt[0], tgt[1], 60)) return;
    lastEdge = { map: st.map, side, b: tgt[2], a: tgt[3] };
    for (let i = 0; i < 4 && gstate().map === st.map && !gstate().inBattle && !screen().hasTextBox; i++) { hold(key, 16); wait(4); }
    const s3 = gstate();
    if (s3.map !== st.map || s3.inBattle || screen().hasTextBox) return;
    if (s3.x === tgt[0] && s3.y === tgt[1]) { // stood on the edge, pushed off, nothing happened: blocked beyond
      log(`walkEdge ${side}: edge tile (${tgt[0]},${tgt[1]}) is blocked beyond, trying another`);
      if (!edgeDump['bb' + st.map + side]) { edgeDump['bb' + st.map + side] = 1; const g2 = gridX(); log(`walkEdge ${side} near-edge rows: ${(vert ? g2.rows.slice(side === 'south' ? -6 : 0, side === 'south' ? undefined : 6) : g2.rows).join('|')} blocked=${JSON.stringify((g2.blockedMoves || []).filter(b => Math.abs(b.x - tgt[0]) + Math.abs(b.y - tgt[1]) < 6))} legend=${JSON.stringify(g2.legend)} surfing=${JSON.stringify(gstate().surfing)}`); }
      if (attempt === 2 && edgeCutTry(g, st, side, outer, m, vert)) return;
      edgeBad[`${st.map}|${side}|${tgt[3]}|${tgt[2]}`] = 1; // exact tile only: marking +-1 skipped every other row (Lavender west never tried its open row)
    } else return;
  }
}

// Destination decision: Jev picks among doors and map edges on this map, with facts; failures are remembered.
const destCache = new Map(), destFail = {}, visits = {}, noGain = {};
let noGainProg = -1;
let prevMap = null;
let destState = { map: null, pick: null, ticks: 0 };
// Plain world facts about where each map leads (mechanics/geography knowledge, not strategy; Jev still decides).
const MAP_FACTS = {
  ROUTE_1: 'Route 1 connects Viridian City (north) and Pallet Town (south, where Prof. Oak\'s lab is)',
  PALLET_TOWN: 'Pallet Town: home town, Prof. Oak\'s lab (Oak wants his parcel delivered here)',
  OAKS_LAB: 'Prof. Oak\'s lab: talk to Oak to deliver his parcel',
  ROUTE_2: 'Route 2 leads north to Viridian Forest and Pewter City (Brock, first badge); in Viridian the old man blocks this until the parcel is delivered to Oak',
  VIRIDIAN_CITY: 'Viridian City: Pokemon Center (heal), Mart (Oak\'s parcel pickup), gym closed for now',
  VIRIDIAN_MART: 'Viridian Mart: where Oak\'s parcel is picked up (only once); shop items',
  VIRIDIAN_POKECENTER: 'Pokemon Center: heal party for free',
  ROUTE_22: 'Route 22 (west of Viridian): leads to the Pokemon League gate, not useful early (rival fight possible)',
};
const MAP_FACTS_DONE = { // after the parcel is delivered (storyEvents >= 11)
  ROUTE_1: 'Route 1 connects Viridian City (north, the way forward) and Pallet Town (south, errand there is finished)',
  PALLET_TOWN: 'Pallet Town: home town; nothing left to do there now',
  OAKS_LAB: 'Prof. Oak\'s lab: parcel already delivered, nothing more to do',
  ROUTE_2: 'Route 2 leads north to Viridian Forest and Pewter City (Brock, first badge); open now that the parcel is delivered',
  VIRIDIAN_FOREST_SOUTH_GATE: 'THE WAY FORWARD from Route 2: gate into Viridian Forest; go through the forest to reach Pewter City (Brock)',
  VIRIDIAN_FOREST: 'Viridian Forest: walk through it (north) to reach Pewter City and Brock',
  VIRIDIAN_FOREST_NORTH_GATE: 'gate at the north exit of Viridian Forest, leads to northern Route 2 and Pewter City',
  PEWTER_CITY: 'Pewter City: Brock\'s gym (first badge), Pokemon Center; from southern Route 2 it is only reachable through Viridian Forest',
  DIGLETTS_CAVE_ROUTE_2: 'Diglett\'s Cave entrance: long optional side cave, not on the way to Brock',
  ROUTE_2_TRADE_HOUSE: 'trade house, optional, no progress',
  ROUTE_2_GATE: 'side gate (needs Cut for the east path), not the way to Brock',
  VIRIDIAN_CITY: 'Viridian City: Pokemon Center (heal), Mart (shop), north exit to Route 2 (the way forward)',
  VIRIDIAN_MART: 'Viridian Mart: shop items only (parcel already delivered)',
  VIRIDIAN_FOREST: 'Viridian Forest: maze of trees and bug trainers; its north exit leads to Pewter City (Brock)',
  PEWTER_CITY: 'Pewter City: Brock\'s gym (first badge, Rock type), Pokemon Center',
};
let factsDone = false;
let factsFrom = null; // current map, for facts that depend on direction of travel
const BACK_FACTS = { 'VIRIDIAN_FOREST_SOUTH_GATE>ROUTE_2': 'BACKWARDS: returns south to Route 2 / Viridian; the forest (the way to Brock) is the OTHER door',
  'VIRIDIAN_FOREST>VIRIDIAN_FOREST_SOUTH_GATE': 'BACKWARDS: south exit of the forest, back toward Route 2',
  'VIRIDIAN_FOREST_NORTH_GATE>VIRIDIAN_FOREST': 'BACKWARDS: back into the forest we already crossed',
  'VIRIDIAN_FOREST_NORTH_GATE>ROUTE_2': 'THE WAY FORWARD: north part of Route 2, a short walk north to Pewter City (Brock)',
  // on Route 2 after coming out of the north gate we are in the northern part: Pewter is straight north
  'ROUTE_2<VIRIDIAN_FOREST_NORTH_GATE>VIRIDIAN_FOREST_NORTH_GATE': 'BACKWARDS: the gate we just came out of, back into the forest',
  'ROUTE_2<VIRIDIAN_FOREST_NORTH_GATE>VIRIDIAN_FOREST_SOUTH_GATE': 'BACKWARDS: far south, behind the forest',
  'ROUTE_2<VIRIDIAN_FOREST_NORTH_GATE>PEWTER_CITY': 'THE WAY FORWARD: we are on northern Route 2 (just left the forest); Pewter City and Brock are straight north',
  'ROUTE_2<VIRIDIAN_FOREST_NORTH_GATE>VIRIDIAN_CITY': 'BACKWARDS: far south, behind the forest',
  'PEWTER_CITY>ROUTE_2': 'BACKWARDS: south, back toward the forest; Brock\'s gym is HERE in Pewter City',
  'ROUTE_2<PEWTER_CITY>PEWTER_CITY': 'THE WAY FORWARD: back north to Pewter City (Brock\'s gym)',
  'ROUTE_2<PEWTER_CITY>VIRIDIAN_FOREST_SOUTH_GATE': 'BACKWARDS: far south, behind the forest',
  'ROUTE_2<PEWTER_CITY>VIRIDIAN_FOREST_NORTH_GATE': 'BACKWARDS: back into the forest',
  'PEWTER_GYM>PEWTER_CITY': 'BACKWARDS unless the party is hurt and needs the Pokemon Center: leaves the gym; Brock (the BOULDER BADGE, the way forward) is inside THIS gym',
  'SAFFRON_GYM>SAFFRON_CITY': 'BACKWARDS unless the party is hurt and needs the Pokemon Center: leaves the gym; SABRINA (the MARSH BADGE, the way forward) is inside THIS gym, reached by stepping on the TELEPORT PADS',
  'PEWTER_CITY>PEWTER_GYM': 'THE WAY FORWARD: Brock\'s gym (rock types; grass moves like Vine Whip are super effective), first badge' };
const BADGE1_FACTS = { 'PEWTER_GYM>PEWTER_CITY': 'THE WAY FORWARD: leave the gym (Brock already beaten), then head east out of Pewter to Route 3',
  'PEWTER_CITY>PEWTER_GYM': 'BACKWARDS: Brock is already beaten, nothing left in the gym',
  'PEWTER_CITY>ROUTE_3': 'THE WAY FORWARD: Route 3 east toward Mt. Moon and Cerulean City (Misty, 2nd badge)',
  'PEWTER_CITY>ROUTE_2': 'BACKWARDS: south toward the forest and Viridian (already done)',
  'PEWTER_CITY>PEWTER_MUSEUM_1F': 'optional museum (costs money), no progress',
  'ROUTE_3>PEWTER_CITY': 'BACKWARDS: west, back to Pewter (only useful to heal)',
  'ROUTE_3>ROUTE_4': 'THE WAY FORWARD: east/north toward Mt. Moon',
  'ROUTE_3>MT_MOON_POKECENTER': 'Pokemon Center at the foot of Mt. Moon (heal here before the cave)',
  'ROUTE_4>MT_MOON_1F': 'THE WAY FORWARD: Mt. Moon cave; cross it to reach Cerulean City',
  'ROUTE_4>MT_MOON_POKECENTER': 'Pokemon Center at the foot of Mt. Moon (heal here before the cave)',
  'ROUTE_4>ROUTE_3': 'BACKWARDS: west toward Pewter',
  'ROUTE_4>CERULEAN_CITY': 'THE WAY FORWARD: Cerulean City (Misty, 2nd badge)',
  'MT_MOON_POKECENTER>ROUTE_4': 'back outside; the Mt. Moon cave entrance is nearby (the way forward)',
  'MT_MOON_1F>MT_MOON_B1F': 'ladder DOWN into the cave (the way forward is down to B1F, then B2F; try ladders not visited yet, some lead to dead-end pockets)',
  'MT_MOON_1F>ROUTE_4': 'BACKWARDS: out the entrance (only useful to heal at the Pokemon Center)',
  'MT_MOON_B1F>MT_MOON_B2F': 'ladder DOWN to B2F (the fossils and the exit path are through B2F; check where it lands)',
  'MT_MOON_B1F>MT_MOON_1F': 'BACKWARDS: ladder back UP to 1F',
  'MT_MOON_B1F>ROUTE_4': 'THE WAY FORWARD: cave EXIT to eastern Route 4 and Cerulean City',
  'MT_MOON_B2F>MT_MOON_B1F': 'ladder UP to B1F (see where it lands and what is walkable from there)' };
// After crossing Mt. Moon (seen Cerulean): Route 4 / cave are behind us; Misty's gym is the way forward (Session 20260926-230738).
let seenCerulean = false, badgeCount = 0;
const CERULEAN_FACTS = { 'ROUTE_4>MT_MOON_B1F': 'BACKWARDS: back into Mt. Moon (already crossed)',
  'ROUTE_4>MT_MOON_1F': 'BACKWARDS: Mt. Moon is already crossed',
  'ROUTE_4>ROUTE_3': 'BACKWARDS: far west toward Pewter',
  'ROUTE_4>CERULEAN_CITY': 'THE WAY FORWARD: east to Cerulean City (Misty\'s gym, Pokemon Center)',
  'CERULEAN_CITY>ROUTE_4': 'BACKWARDS: west toward Mt. Moon (already crossed); nothing useful there',
  'CERULEAN_CITY>CERULEAN_GYM': 'THE WAY FORWARD: Misty\'s gym (Water type; Grass moves like Vine Whip/Razor Leaf are super effective), 2nd badge. Heal at the Pokemon Center first if HP is low',
  'CERULEAN_CITY>CERULEAN_POKECENTER': 'Pokemon Center (free heal); useful before the gym',
  'CERULEAN_CITY>ROUTE_24': 'north: Nugget Bridge (5 trainers + rival) toward Bill; usually done after Misty',
  'CERULEAN_GYM>CERULEAN_CITY': 'BACKWARDS unless the party is hurt: Misty (2nd badge, the way forward) is inside THIS gym',
  'CERULEAN_POKECENTER>CERULEAN_CITY': 'back outside; Misty\'s gym is in this city (the way forward)' };
// After Misty (badges>=2): gym is done, Nugget Bridge north is forward (Session 20260926-231738).
const BADGE2_FACTS = { 'CERULEAN_CITY>CERULEAN_GYM': 'DONE: Misty already beaten (Cascade Badge); nothing left to do in the gym',
  'CERULEAN_GYM>CERULEAN_CITY': 'THE WAY FORWARD: out of the finished gym, then north to Nugget Bridge',
  'CERULEAN_CITY>ROUTE_24': 'THE WAY FORWARD: north over Nugget Bridge (rival + 5 trainers, heal first if hurt) to Route 25 and Bill',
  'CERULEAN_CITY>ROUTE_4': 'BACKWARDS: west toward Mt. Moon (already crossed)',
  'CERULEAN_CITY>CERULEAN_POKECENTER': 'Pokemon Center (free heal); useful before Nugget Bridge',
  'CERULEAN_POKECENTER>CERULEAN_CITY': 'back outside; the way forward is north to Nugget Bridge (Route 24)',
  'ROUTE_24>CERULEAN_CITY': 'BACKWARDS: south to Cerulean (only to heal)', 'ROUTE_24>ROUTE_25': 'THE WAY FORWARD: east along Route 25 to Bill\'s house',
  'ROUTE_25>ROUTE_24': 'BACKWARDS: back toward Nugget Bridge', 'ROUTE_25>BILLS_HOUSE': 'THE WAY FORWARD: Bill\'s house (talk to Bill, get the S.S. Ticket)',
  'ROUTE_4>CERULEAN_CITY': 'east to Cerulean City (then north to Nugget Bridge)', 'ROUTE_4>MT_MOON_B1F': 'BACKWARDS: Mt. Moon already crossed' };
// With the S.S. Ticket (Session 20260926-235722): Bill is done; the way forward is back south through Cerulean to Route 5 / Vermilion.
const TICKET_FACTS = { 'BILLS_HOUSE>ROUTE_25': 'THE WAY FORWARD: leave; Bill is DONE (S.S. Ticket in bag), head back west/south to Cerulean',
  'ROUTE_25>BILLS_HOUSE': 'DONE: S.S. Ticket already received, nothing left here', 'ROUTE_25>ROUTE_24': 'THE WAY FORWARD: west to Route 24 then south to Cerulean',
  'ROUTE_24>ROUTE_25': 'BACKWARDS: Bill already visited (S.S. Ticket held)', 'ROUTE_24>CERULEAN_CITY': 'THE WAY FORWARD: south over Nugget Bridge back to Cerulean, then Route 5 south',
  'CERULEAN_CITY>ROUTE_24': 'BACKWARDS: Bill already done (S.S. Ticket held)', 'CERULEAN_CITY>CERULEAN_TRASHED_HOUSE': 'THE WAY FORWARD: the south path out of the city is blocked by a CUT tree; the robbed house has a hole in its back wall: go in, walk out the back hole, beat the Team Rocket grunt behind it, then follow the east side of the city south to Route 5', 'CERULEAN_TRASHED_HOUSE>CERULEAN_CITY': 'leave through the hole in the BACK (north) wall, not the front door, then go south along the east side to Route 5', 'CERULEAN_CITY>ROUTE_5': 'south toward Underground Path to Vermilion; if FAILED, the direct path is blocked by a CUT tree: go through CERULEAN_TRASHED_HOUSE (hole in back wall) instead; THE WAY FORWARD: south toward Saffron gate / Underground Path to Vermilion (S.S. Anne, Lt. Surge)',
  'CERULEAN_POKECENTER>CERULEAN_CITY': 'back outside; the way forward is SOUTH (Route 5) toward Vermilion',
  // Session 20260927-000722: Route 5 -> Underground Path -> Route 6 -> Vermilion -> S.S. Anne (Cut from the captain) -> Lt. Surge.
  'ROUTE_5>UNDERGROUND_PATH_ROUTE_5': 'THE WAY FORWARD: Underground Path entrance (the Saffron gate is closed); walk through it south to Route 6',
  'ROUTE_5>ROUTE_5_GATE': 'Saffron gate: guard blocks it (thirsty), not the way', 'ROUTE_5>CERULEAN_CITY': 'BACKWARDS: north to Cerulean',
  'UNDERGROUND_PATH_ROUTE_5>UNDERGROUND_PATH_NORTH_SOUTH': 'THE WAY FORWARD: the tunnel south to Route 6',
  'UNDERGROUND_PATH_NORTH_SOUTH>UNDERGROUND_PATH_ROUTE_6': 'THE WAY FORWARD: south end of the tunnel, exits onto Route 6',
  'UNDERGROUND_PATH_NORTH_SOUTH>UNDERGROUND_PATH_ROUTE_5': 'BACKWARDS: north end (Route 5)',
  'UNDERGROUND_PATH_ROUTE_6>ROUTE_6': 'THE WAY FORWARD: out onto Route 6, then south to Vermilion City',
  'ROUTE_6>VERMILION_CITY': 'THE WAY FORWARD: south to Vermilion City (S.S. Anne at the dock, Lt. Surge gym, Poke Mart for Poke Balls)',
  'ROUTE_6>UNDERGROUND_PATH_ROUTE_6': 'BACKWARDS: tunnel back north to Cerulean', 'ROUTE_6>ROUTE_6_GATE': 'Saffron gate: guard blocks it, not the way',
  'VERMILION_CITY>ROUTE_6': 'BACKWARDS: north toward Cerulean',
  'VERMILION_CITY>VERMILION_DOCK': 'THE WAY FORWARD: the dock at the south of town; board the S.S. Anne with the ticket, find the captain (gives HM01 CUT)',
  'VERMILION_CITY>VERMILION_POKECENTER': 'Pokemon Center (free heal, sets respawn)', 'VERMILION_CITY>VERMILION_MART': 'Poke Mart: buy POKE BALLs to catch a 2nd Pokemon',
  'VERMILION_CITY>VERMILION_GYM': 'Lt. Surge gym: entrance blocked by a CUT tree until we have HM01 Cut from the S.S. Anne captain',
  'VERMILION_DOCK>SS_ANNE_1F': 'THE WAY FORWARD: board the S.S. Anne; the captain is at the top (2F -> captain\'s room) and gives HM01 CUT',
  'SS_ANNE_1F>SS_ANNE_2F': 'THE WAY FORWARD: stairs up toward the captain\'s room', 'SS_ANNE_2F>SS_ANNE_CAPTAINS_ROOM': 'THE WAY FORWARD: the captain (rub his back, get HM01 CUT)',
  'SS_ANNE_2F>SS_ANNE_3F': 'leads only to the bow deck (dead end, a couple of sailors); the captain\'s room is reached from 2F itself',
  'SS_ANNE_3F>SS_ANNE_BOW': 'the bow deck: a dead end with sailor trainers, nothing needed there',
  'SS_ANNE_3F>SS_ANNE_2F': 'THE WAY FORWARD: back down to 2F, where the captain\'s room door is (captain gives HM01 CUT)',
  'SS_ANNE_BOW>SS_ANNE_3F': 'THE WAY FORWARD: leave the dead-end bow deck, go back through 3F down to 2F and into the captain\'s room (HM01 CUT)' };
let hasTicket = false;
let hasCut = false;
function checkCut() { if (hasCut) return true; try { hasCut = bag().some(i => /HM01|CUT/i.test(i.name || '')); } catch (e) {} return hasCut; }
const CUT_FACTS = { 'VERMILION_CITY>VERMILION_DOCK': 'DONE: the S.S. Anne has SAILED away, HM01 Cut is in the bag; nothing left at the dock',
  'VERMILION_DOCK>VERMILION_CITY': 'THE WAY FORWARD: back into Vermilion City (the ship is gone)',
  'VERMILION_CITY>VERMILION_GYM': 'Lt. Surge gym (3rd badge): THE WAY FORWARD: Venusaur KNOWS CUT now, the bot cuts the tree in front automatically; Electric type, Ground moves are best',
  'VERMILION_CITY>VERMILION_MART': 'Poke Mart: buy POKE BALLs to catch a 2nd Pokemon (a Ground type like Diglett from Diglett\'s Cave east of town beats Surge)',
  'VERMILION_CITY>ROUTE_11': 'east: Route 11 side route (gates, Diglett\'s Cave); NOT needed for Lt. Surge: Venusaur (Grass, resists Electric) beat his team in a test at full HP',
  'ROUTE_11>DIGLETTS_CAVE_ROUTE_11': 'side cave: Diglett\'s Cave only leads far BACK WEST to Route 2 (Pewter/Viridian area) = BACKWARDS',
  'DIGLETTS_CAVE_ROUTE_11>DIGLETTS_CAVE': 'BACKWARDS: the cave leads to Route 2 far back west',
  'DIGLETTS_CAVE>DIGLETTS_CAVE_ROUTE_2': 'BACKWARDS: exit to Route 2 near Viridian/Pewter, far from Vermilion',
  'DIGLETTS_CAVE>DIGLETTS_CAVE_ROUTE_11': 'THE WAY BACK to Route 11 -> Vermilion City (Lt. Surge gym)',
  'DIGLETTS_CAVE_ROUTE_2>ROUTE_2': 'BACKWARDS: Route 2 (old area); go back into the cave toward Vermilion',
  'DIGLETTS_CAVE_ROUTE_2>DIGLETTS_CAVE': 'THE WAY BACK toward Vermilion (through the cave to Route 11)',
  'ROUTE_11>VERMILION_CITY': 'THE WAY FORWARD: back west to Vermilion City and Lt. Surge\'s gym',
  'VERMILION_CITY>ROUTE_6': 'BACKWARDS: north toward Saffron gates/Cerulean' };
function checkTicket() { if (hasTicket) return true; try { hasTicket = bag().some(i => /TICKET/i.test(i.name || '')); } catch (e) {} return hasTicket; }
const BADGE3_FACTS = { 'VERMILION_CITY>VERMILION_GYM': 'DONE: Lt. Surge is beaten (Thunder Badge); nothing left in the gym',
  'VERMILION_CITY>ROUTE_6': 'THE WAY FORWARD: north via Route 6 and the Underground Path back to Cerulean, then east (Route 9) to Rock Tunnel / Lavender',
  'VERMILION_CITY>ROUTE_11': 'side route east (Diglett\'s Cave, gates); not the main way forward now',
  'ROUTE_11>DIGLETTS_CAVE_ROUTE_11': 'side cave (wild Diglett); not the way forward',
  // Session 20260927-012723: after badge 3 the Underground Path is walked NORTH (the badge-2 facts said the opposite).
  'ROUTE_6>UNDERGROUND_PATH_ROUTE_6': 'THE WAY FORWARD: Underground Path north to Route 5 / Cerulean', 'ROUTE_6>VERMILION_CITY': 'BACKWARDS: Vermilion is finished (heal only)',
  'UNDERGROUND_PATH_ROUTE_6>UNDERGROUND_PATH_NORTH_SOUTH': 'THE WAY FORWARD: the tunnel north to Route 5 / Cerulean', 'UNDERGROUND_PATH_ROUTE_6>ROUTE_6': 'BACKWARDS: south to Vermilion (finished)',
  'UNDERGROUND_PATH_NORTH_SOUTH>UNDERGROUND_PATH_ROUTE_5': 'THE WAY FORWARD: north end of the tunnel, exits to Route 5 then Cerulean', 'UNDERGROUND_PATH_NORTH_SOUTH>UNDERGROUND_PATH_ROUTE_6': 'BACKWARDS: south end (Route 6 / Vermilion)',
  'UNDERGROUND_PATH_ROUTE_5>ROUTE_5': 'THE WAY FORWARD: out onto Route 5, then north to Cerulean', 'UNDERGROUND_PATH_ROUTE_5>UNDERGROUND_PATH_NORTH_SOUTH': 'BACKWARDS: tunnel south to Vermilion',
  'ROUTE_5>CERULEAN_CITY': 'THE WAY FORWARD: north to Cerulean, then EAST onto Route 9', 'ROUTE_5>UNDERGROUND_PATH_ROUTE_5': 'BACKWARDS: tunnel south to Vermilion (finished)',
  'CERULEAN_CITY>ROUTE_9': 'THE WAY FORWARD: east to Route 9 (small CUT tree), Route 10, Rock Tunnel, Lavender', 'CERULEAN_CITY>ROUTE_5': 'BACKWARDS: south to Vermilion (finished)',
  'CERULEAN_CITY>ROUTE_24': 'BACKWARDS: Bill already done', 'ROUTE_9>ROUTE_10': 'THE WAY FORWARD: east/south to Route 10 and Rock Tunnel', 'ROUTE_9>CERULEAN_CITY': 'BACKWARDS: west to Cerulean',
  // Session 20260927-013723: Rock Tunnel facts (listed as next step for 3+ sessions). Path: Route 10 north entrance -> 1F -> B1F -> 1F -> south exit -> Route 10 south -> Lavender.
  'ROUTE_10>ROCK_TUNNEL_1F': 'THE WAY FORWARD: Rock Tunnel (dark cave); cross it north->south to reach Lavender Town', 'ROUTE_10>ROCK_TUNNEL_POKECENTER': 'Pokemon Center right by the tunnel (free heal)',
  'ROCK_TUNNEL_POKECENTER>ROUTE_10': 'back outside; the Rock Tunnel entrance is next door (the way forward)',
  'ROCK_TUNNEL_1F>ROCK_TUNNEL_B1F': 'ladder DOWN to B1F (the route through the tunnel alternates 1F and B1F; prefer ladders not visited yet, check where each lands)',
  'ROCK_TUNNEL_B1F>ROCK_TUNNEL_1F': 'ladder UP to 1F (the south part of 1F holds the exit to Lavender; check where it lands)',
  // Session 20260927-023724: Lavender facts (put off 4 sessions). Pokemon Tower needs the SILPH SCOPE (Celadon Game Corner) first.
  'LAVENDER_TOWN>POKEMON_TOWER_1F': 'LATER, NOT NOW: Pokemon Tower cannot be finished without the SILPH SCOPE (get it in Celadon); the ghosts on 6F block the way and our lead fainted there',
  'LAVENDER_TOWN>ROUTE_8': 'THE WAY FORWARD: west on Route 8, through the Underground Path gate, to CELADON CITY (Erika, Grass gym; Silph Scope)',
  'LAVENDER_TOWN>ROUTE_10': 'BACKWARDS: north to Rock Tunnel (already crossed)', 'LAVENDER_TOWN>ROUTE_12': 'NOT YET: south route is blocked by a sleeping Snorlax (needs the Poke Flute)',
  // Session 20260927-025224: Lavender houses have nothing to do before the Silph Scope; Jev wandered into Mr. Fuji's house.
  'LAVENDER_TOWN>MR_FUJIS_HOUSE': 'NOT NOW: Mr. Fuji is missing (he is in Pokemon Tower, needs the Silph Scope); nothing to do inside', 'MR_FUJIS_HOUSE>LAVENDER_TOWN': 'THE WAY FORWARD: leave the house, then go west via Route 8 to Celadon',
  'LAVENDER_TOWN>LAVENDER_CUBONE_HOUSE': 'NOT NOW: just a house with a Cubone, no progress inside', 'LAVENDER_CUBONE_HOUSE>LAVENDER_TOWN': 'THE WAY FORWARD: leave, then west via Route 8 to Celadon',
  'LAVENDER_TOWN>NAME_RATERS_HOUSE': 'NOT NOW: Name Rater (renames Pokemon), no progress inside', 'NAME_RATERS_HOUSE>LAVENDER_TOWN': 'THE WAY FORWARD: leave, then west via Route 8 to Celadon',
  'LAVENDER_TOWN>LAVENDER_MART': 'shop (Poke Balls, potions) - only if we need items', 'LAVENDER_MART>LAVENDER_TOWN': 'THE WAY FORWARD: leave, then west via Route 8 to Celadon',
  'LAVENDER_TOWN>LAVENDER_POKECENTER': 'Pokemon Center (free heal) - go here if the party is hurt',
  'POKEMON_TOWER_1F>LAVENDER_TOWN': 'THE WAY FORWARD: leave the tower (needs the Silph Scope first), then go west via Route 8 to Celadon',
  'POKEMON_TOWER_2F>POKEMON_TOWER_1F': 'THE WAY FORWARD: go back down and leave the tower (Silph Scope needed first)', 'POKEMON_TOWER_1F>POKEMON_TOWER_2F': 'LATER: upstairs needs the Silph Scope',
  'ROUTE_10>LAVENDER_TOWN': 'THE WAY FORWARD: Lavender Town (heal there, then west via Route 8 to Celadon)',
  'ROUTE_8>LAVENDER_TOWN': 'BACKWARDS: east to Lavender (only to heal)', 'ROUTE_8>ROUTE_8_GATE': 'Saffron gate: the guard blocks it (thirsty), NOT the way; use the Underground Path building instead',
  'ROUTE_8>UNDERGROUND_PATH_ROUTE_8': 'THE WAY FORWARD: Underground Path west to Route 7 / Celadon', 'ROUTE_7>CELADON_CITY': 'THE WAY FORWARD: Celadon City (Erika, Grass gym)',
  'UNDERGROUND_PATH_ROUTE_8>UNDERGROUND_PATH_WEST_EAST': 'THE WAY FORWARD: the tunnel west to Route 7 / Celadon', 'UNDERGROUND_PATH_ROUTE_8>ROUTE_8': 'BACKWARDS: back out to Route 8 / Lavender',
  'UNDERGROUND_PATH_WEST_EAST>UNDERGROUND_PATH_ROUTE_7': 'THE WAY FORWARD: west end of the tunnel, exits to Route 7 then Celadon', 'UNDERGROUND_PATH_WEST_EAST>UNDERGROUND_PATH_ROUTE_8': 'BACKWARDS: east end (Route 8 / Lavender)',
  'UNDERGROUND_PATH_ROUTE_7>ROUTE_7': 'THE WAY FORWARD: out onto Route 7, then west to Celadon', 'UNDERGROUND_PATH_ROUTE_7>UNDERGROUND_PATH_WEST_EAST': 'BACKWARDS: tunnel east to Lavender',
  'CELADON_CITY>CELADON_GYM': 'THE WAY FORWARD: Erika\'s Grass gym (4th badge); heal first if hurt', 'CELADON_CITY>CELADON_POKECENTER': 'Pokemon Center (free heal) - go if the party is hurt, then to the gym',
  'CELADON_CITY>ROUTE_7': 'BACKWARDS: east to Route 7 / Lavender (already done)', 'CELADON_CITY>CELADON_MART_1F': 'department store: only if we need items (Poke Balls, potions)',
  'CELADON_CITY>GAME_CORNER': 'LATER: Game Corner / Team Rocket hideout (Silph Scope) - after the gym badge', 'CELADON_CITY>CELADON_MANSION_1F': 'NOT NOW: apartment building, no progress', 'CELADON_CITY>CELADON_HOTEL': 'NOT NOW: hotel, nothing to do', 'CELADON_CITY>CELADON_DINER': 'NOT NOW: diner, nothing to do', 'CELADON_CITY>CELADON_CHIEF_HOUSE': 'NOT NOW: house, nothing to do', 'CELADON_CITY>ROUTE_16': 'NOT YET: west route (Snorlax blocks it later)',
  'CELADON_POKECENTER>CELADON_CITY': 'THE WAY FORWARD: back out, then to the Celadon Gym (south-west)', 'CELADON_MART_1F>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Celadon Gym', 'CELADON_MANSION_1F>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Celadon Gym', 'CELADON_HOTEL>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Celadon Gym', 'CELADON_DINER>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Celadon Gym', 'CELADON_CHIEF_HOUSE>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Celadon Gym', 'GAME_CORNER>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Celadon Gym',
  'ROUTE_7>ROUTE_7_GATE': 'Saffron gate: guard blocks it, not the way', 'ROUTE_7>UNDERGROUND_PATH_ROUTE_7': 'BACKWARDS: tunnel east to Lavender' };
// Rock Tunnel 1F has two exits to Route 10: north = where we came in, south = toward Lavender.
const rockExitFact = (map, w, to) => map === 'ROCK_TUNNEL_1F' && /ROUTE_10|previous/i.test(to || '') ? (w.y < 12 ? ' [BACKWARDS: the NORTH entrance we came in by (only to heal)]' : ' [THE WAY FORWARD: the SOUTH exit of Rock Tunnel, Lavender Town is just south]') : '';
// Session 20260927-033224: after Erika (4 badges) the way forward is the Rocket hideout under the Game Corner (Silph Scope), then Pokemon Tower.
const BADGE4_FACTS = { 'CELADON_GYM>CELADON_CITY': 'THE WAY FORWARD: leave the gym (Erika beaten, 4th badge done), then to the GAME CORNER (Team Rocket hideout)',
  'CELADON_CITY>GAME_CORNER': 'THE WAY FORWARD: Game Corner; a Rocket guards a poster at the back: beat him, the poster hides the switch to the ROCKET HIDEOUT stairs (Silph Scope)',
  'CELADON_CITY>CELADON_GYM': 'BACKWARDS: Erika already beaten (4th badge done)', 'CELADON_CITY>CELADON_POKECENTER': 'Pokemon Center (free heal) - go if the party is hurt, then to the Game Corner',
  'CELADON_CITY>ROUTE_7': 'NOT YET: east to Lavender - only after getting the Silph Scope from the Rocket hideout', 'CELADON_CITY>CELADON_MART_1F': 'department store: only if we need items (Poke Balls, potions)',
  'GAME_CORNER>CELADON_CITY': 'leave the Game Corner (only to heal; the hideout entrance is inside here)', 'GAME_CORNER>ROCKET_HIDEOUT_B1F': 'THE WAY FORWARD: stairs down into the Rocket hideout (Silph Scope, Giovanni on B4F)',
  'CELADON_POKECENTER>CELADON_CITY': 'THE WAY FORWARD: back out, then to the Game Corner (Rocket hideout)', 'CELADON_MART_1F>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Game Corner',
  'CELADON_MANSION_1F>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Game Corner', 'CELADON_HOTEL>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Game Corner', 'CELADON_DINER>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Game Corner', 'CELADON_CHIEF_HOUSE>CELADON_CITY': 'THE WAY FORWARD: leave, then to the Game Corner',
  // Session 20260927-034725: hideout stairs chain B1F->B2F->B3F->B4F (Giovanni + Silph Scope on B4F; LIFT KEY dropped by a B4F grunt).
  'ROCKET_HIDEOUT_B1F>GAME_CORNER': 'BACKWARDS: up to the Game Corner (only to heal)', 'ROCKET_HIDEOUT_B1F>ROCKET_HIDEOUT_B2F': 'THE WAY FORWARD: stairs down to B2F (toward Giovanni on B4F)',
  'ROCKET_HIDEOUT_B2F>ROCKET_HIDEOUT_B1F': 'BACKWARDS: up to B1F', 'ROCKET_HIDEOUT_B2F>ROCKET_HIDEOUT_B3F': 'THE WAY FORWARD: stairs down to B3F (arrow floor tiles spin you around)',
  'ROCKET_HIDEOUT_B3F>ROCKET_HIDEOUT_B2F': 'BACKWARDS: up to B2F', 'ROCKET_HIDEOUT_B3F>ROCKET_HIDEOUT_B4F': 'THE WAY FORWARD: stairs down to B4F (Giovanni, Silph Scope, LIFT KEY grunt)',
  'ROCKET_HIDEOUT_B4F>ROCKET_HIDEOUT_B3F': 'BACKWARDS: up to B3F (only if B4F is fully done)',
  'ROCKET_HIDEOUT_B1F>ROCKET_HIDEOUT_ELEVATOR': 'NOT YET: elevator needs the LIFT KEY (from a B4F grunt); take the stairs down instead', 'ROCKET_HIDEOUT_B2F>ROCKET_HIDEOUT_ELEVATOR': 'NOT YET: elevator needs the LIFT KEY; take the stairs down to B3F', 'ROCKET_HIDEOUT_B4F>ROCKET_HIDEOUT_ELEVATOR': 'elevator (only useful with the LIFT KEY)' };
// Session 20260927-040725: once the LIFT KEY is in the bag, Giovanni's side of B4F is reached ONLY by the elevator (B4F stairs side is walled off).
let hasLiftKey = false;
function checkLiftKey() { if (hasLiftKey) return true; try { hasLiftKey = bag().some(i => /LIFT KEY/i.test(i.name || '')); } catch (e) {} return hasLiftKey; }
const LIFTKEY_FACTS = { 'ROCKET_HIDEOUT_B4F>ROCKET_HIDEOUT_B3F': 'THE WAY FORWARD: LIFT KEY in the bag; this side of B4F is walled off from Giovanni: go back up to B3F, then up to B2F and ride the ELEVATOR down to B4F',
  'ROCKET_HIDEOUT_B3F>ROCKET_HIDEOUT_B2F': 'THE WAY FORWARD: up to B2F to ride the ELEVATOR (LIFT KEY in bag) down to Giovanni on B4F',
  'ROCKET_HIDEOUT_B3F>ROCKET_HIDEOUT_B4F': 'BACKWARDS: the stairs side of B4F is a dead end (LIFT KEY already taken); use the elevator from B2F',
  'ROCKET_HIDEOUT_B2F>ROCKET_HIDEOUT_ELEVATOR': 'THE WAY FORWARD: the ELEVATOR (LIFT KEY in bag): ride it down to B4F, Giovanni',
  'ROCKET_HIDEOUT_B1F>ROCKET_HIDEOUT_ELEVATOR': 'THE WAY FORWARD: the ELEVATOR (LIFT KEY in bag): ride it down to B4F, Giovanni',
  'ROCKET_HIDEOUT_B2F>ROCKET_HIDEOUT_B3F': 'BACKWARDS: B3F only leads to the walled-off stairs side of B4F; use the elevator here instead',
  'ROCKET_HIDEOUT_B4F>ROCKET_HIDEOUT_ELEVATOR': 'the ELEVATOR (back up; only after Giovanni)' };
// After Giovanni: SILPH SCOPE in bag -> leave the hideout (elevator to B1F), Celadon -> east (Route 7) toward Lavender / Pokemon Tower.
let hasScope = false;
let hasFlute = false;
let hasFuji = false;
function checkFuji() { if (hasFuji) return true; try { hasFuji = !!event('EVENT_RESCUED_MR_FUJI'); } catch (e) {} return hasFuji; }
const FUJI_FACTS = { 'POKEMON_TOWER_7F>POKEMON_TOWER_6F': 'THE WAY FORWARD: Fuji rescued, go down and leave the tower', 'POKEMON_TOWER_6F>POKEMON_TOWER_5F': 'THE WAY FORWARD: down', 'POKEMON_TOWER_5F>POKEMON_TOWER_4F': 'THE WAY FORWARD: down', 'POKEMON_TOWER_4F>POKEMON_TOWER_3F': 'THE WAY FORWARD: down', 'POKEMON_TOWER_3F>POKEMON_TOWER_2F': 'THE WAY FORWARD: down', 'POKEMON_TOWER_2F>POKEMON_TOWER_1F': 'THE WAY FORWARD: down', 'POKEMON_TOWER_1F>LAVENDER_TOWN': 'THE WAY FORWARD: out, then to MR_FUJIS_HOUSE',
  'POKEMON_TOWER_6F>POKEMON_TOWER_7F': 'DONE: Fuji already rescued', 'POKEMON_TOWER_5F>POKEMON_TOWER_6F': 'DONE: going up is backwards', 'POKEMON_TOWER_4F>POKEMON_TOWER_5F': 'backwards (up)', 'POKEMON_TOWER_3F>POKEMON_TOWER_4F': 'backwards (up)', 'POKEMON_TOWER_2F>POKEMON_TOWER_3F': 'backwards (up)', 'POKEMON_TOWER_1F>POKEMON_TOWER_2F': 'backwards (up)',
  'LAVENDER_TOWN>MR_FUJIS_HOUSE': 'THE WAY FORWARD: Mr. Fuji is home; talk to him for the POKE FLUTE', 'LAVENDER_TOWN>POKEMON_TOWER_1F': 'DONE: Fuji rescued, nothing more in the tower', 'MR_FUJIS_HOUSE>LAVENDER_TOWN': 'NOT YET: talk to Mr. Fuji inside first (POKE FLUTE)' };
function checkFlute() { if (hasFlute) return true; try { hasFlute = bag().some(i => /FLUTE/i.test(i.name || '')); } catch (e) {} try { if (!hasFlute && /Has my FLUTE helped/i.test(lastTexts.join(" "))) hasFlute = true; } catch (e) {} return hasFlute; }
const FLUTE_FACTS = { 'LAVENDER_TOWN>ROUTE_12': 'THE WAY FORWARD: south to the sleeping SNORLAX (we have the POKE FLUTE to wake it), then on to FUCHSIA CITY',
  'LAVENDER_TOWN>POKEMON_TOWER_1F': 'DONE: Mr. Fuji rescued, POKE FLUTE in bag; nothing more in the tower', 'LAVENDER_TOWN>ROUTE_8': 'BACKWARDS: west to Celadon; the way forward is SOUTH (Route 12)',
  'LAVENDER_TOWN>ROUTE_10': 'BACKWARDS: north to Rock Tunnel', 'LAVENDER_TOWN>MR_FUJIS_HOUSE': 'DONE: Mr. Fuji already gave us the POKE FLUTE',
  'MR_FUJIS_HOUSE>LAVENDER_TOWN': 'THE WAY FORWARD: leave the house, then go SOUTH to Route 12 (Snorlax)',
  'POKEMON_TOWER_7F>POKEMON_TOWER_6F': 'THE WAY OUT: Fuji done, go down and leave the tower', 'POKEMON_TOWER_6F>POKEMON_TOWER_5F': 'THE WAY OUT: down', 'POKEMON_TOWER_5F>POKEMON_TOWER_4F': 'THE WAY OUT: down',
  'POKEMON_TOWER_4F>POKEMON_TOWER_3F': 'THE WAY OUT: down', 'POKEMON_TOWER_3F>POKEMON_TOWER_2F': 'THE WAY OUT: down', 'POKEMON_TOWER_2F>POKEMON_TOWER_1F': 'THE WAY OUT: down', 'POKEMON_TOWER_1F>LAVENDER_TOWN': 'THE WAY OUT: leave the tower, then south to Route 12',
  'ROUTE_12>LAVENDER_TOWN': 'BACKWARDS: north to Lavender (heal only)',
  // Session 20260927-071727: forward/backward facts for the Route 13 -> 14 -> 15 -> Fuchsia leg (bot was looping on ROUTE_13/14)
  'ROUTE_12>ROUTE_13': 'THE WAY FORWARD: west onto Route 13 toward Fuchsia', 'ROUTE_13>ROUTE_12': 'BACKWARDS: east back to Route 12',
  'ROUTE_13>ROUTE_14': 'THE WAY FORWARD: west end of Route 13 onto Route 14 (then south, then Route 15 west to FUCHSIA CITY)',
  'ROUTE_14>ROUTE_13': 'BACKWARDS: north-east back onto Route 13', 'ROUTE_14>ROUTE_15': 'THE WAY FORWARD: south-west end of Route 14 onto Route 15, then west to FUCHSIA CITY',
  'ROUTE_15>ROUTE_14': 'BACKWARDS: east back to Route 14', 'ROUTE_15>FUCHSIA_CITY': 'THE WAY FORWARD: FUCHSIA CITY (Pokemon Center, KOGA gym for badge 5)',
  'ROUTE_15>ROUTE_15_GATE_1F': 'THE WAY FORWARD: gate on Route 15; walk through it west toward FUCHSIA CITY', 'ROUTE_15_GATE_1F>ROUTE_15': 'continue WEST through the gate toward FUCHSIA CITY',
  // Session 20260927-080228: Fuchsia City door facts (bot is on Route 15, about to arrive)
  'FUCHSIA_CITY>FUCHSIA_GYM': 'THE WAY FORWARD if badge 5 is not yet won: KOGA gym (Poison type; Psychic/Ground moves are strong, Grass moves are weak) for badge 5; heal first if the team is hurt',
  'FUCHSIA_CITY>FUCHSIA_POKECENTER': 'Pokemon Center: free full heal (do this before the gym if hurt or low on PP)',
  'FUCHSIA_CITY>ROUTE_15': 'BACKWARDS: east back to Route 15', 'FUCHSIA_CITY>SAFARI_ZONE_GATE': 'Safari Zone (costs 500; after KOGA: SURF HM and GOLD TEETH inside)',
  'FUCHSIA_CITY>FUCHSIA_MART': 'shop (potions, balls)', 'FUCHSIA_GYM>FUCHSIA_CITY': 'leave the gym (only after KOGA is beaten or to heal)' };
// Session 20260927-094729: after Giovanni (MASTER BALL in bag) Saffron's doors get labels so Jev picks the gym, not the Dojo/Silph again.
let hasMaster = false;
function hasCardKey() { try { return bag().some(i => /CARD KEY/i.test(i.name || '')); } catch (e) { return false; } }
let silphBeat = false;
function silphDone() { if (silphBeat) return true; try { silphBeat = !!event('EVENT_BEAT_SILPH_CO_GIOVANNI'); } catch (e) {} return silphBeat; }
function checkMaster() { if (hasMaster) return true; try { hasMaster = bag().some(i => /MASTER BALL/i.test(i.name || '')); } catch (e) {} return hasMaster; }
const MASTER_FACTS = { 'SAFFRON_CITY>SAFFRON_GYM': 'THE WAY FORWARD: Sabrina\'s gym (Psychic, 6th badge); heal first if HP is low',
  'SAFFRON_CITY>FIGHTING_DOJO': 'NOT NOW: the Fighting Dojo is NOT the gym (Sabrina\'s gym is the other big building)',
  'SAFFRON_CITY>SILPH_CO_1F': 'DONE: Silph Co. is finished (Giovanni beaten, MASTER BALL received); do not go back in',
  'SAFFRON_CITY>SAFFRON_POKECENTER': 'heal here before Sabrina if the party is hurt',
  'SILPH_CO_1F>SAFFRON_CITY': 'THE WAY FORWARD: out of Silph (done) to Saffron, then the SAFFRON_GYM' };
for (let n = 2; n <= 11; n++) MASTER_FACTS[`SILPH_CO_${n}F>SILPH_CO_${n - 1}F`] = 'THE WAY FORWARD: stairs DOWN (Silph is done, leave for Sabrina\'s gym)';
function checkScope() { if (hasScope) return true; try { hasScope = bag().some(i => /SILPH SCOPE/i.test(i.name || '')); } catch (e) {} return hasScope; }
const SCOPE_FACTS = { 'ROCKET_HIDEOUT_B4F>ROCKET_HIDEOUT_ELEVATOR': 'THE WAY FORWARD: SILPH SCOPE in the bag, Giovanni beaten: ride the elevator UP to B1F and leave the hideout',
  'ROCKET_HIDEOUT_B4F>ROCKET_HIDEOUT_B3F': 'BACKWARDS: arrow floors; use the ELEVATOR to B1F instead', 'ROCKET_HIDEOUT_B2F>ROCKET_HIDEOUT_ELEVATOR': 'THE WAY FORWARD: elevator up to B1F (hideout done)',
  'ROCKET_HIDEOUT_B2F>ROCKET_HIDEOUT_B1F': 'THE WAY FORWARD: up to B1F, out to the Game Corner', 'ROCKET_HIDEOUT_B2F>ROCKET_HIDEOUT_B3F': 'BACKWARDS: hideout is DONE',
  'ROCKET_HIDEOUT_B1F>GAME_CORNER': 'THE WAY FORWARD: stairs up to the Game Corner (hideout DONE, SILPH SCOPE in bag)', 'ROCKET_HIDEOUT_B1F>ROCKET_HIDEOUT_B2F': 'BACKWARDS: hideout is DONE',
  'ROCKET_HIDEOUT_B1F>ROCKET_HIDEOUT_ELEVATOR': 'BACKWARDS: hideout is DONE; take the stairs up to the Game Corner', 'GAME_CORNER>ROCKET_HIDEOUT_B1F': 'BACKWARDS: hideout is DONE (SILPH SCOPE in bag)',
  'GAME_CORNER>CELADON_CITY': 'THE WAY FORWARD: out to Celadon City, then EAST (Route 7) toward LAVENDER TOWN and the POKEMON TOWER (the Scope reveals the ghosts)',
  'CELADON_CITY>GAME_CORNER': 'DONE: the Rocket hideout is cleared (SILPH SCOPE in bag)', 'CELADON_CITY>ROUTE_7': 'THE WAY FORWARD: east to Route 7, then the Underground Path / Route 8 east to LAVENDER TOWN (Pokemon Tower)',
  'ROUTE_7>UNDERGROUND_PATH_ROUTE_7': 'THE WAY FORWARD: underground path entrance; walk through it east to Route 8 (Lavender)', 'ROUTE_7>UNDERGROUND_PATH_ROUTE_7_COPY': 'THE WAY FORWARD: underground path entrance; walk through it east to Route 8 (Lavender)',
  'ROUTE_7>ROUTE_7_GATE': 'gate to Saffron (guard is thirsty, blocks us); take the UNDERGROUND PATH instead', 'ROUTE_7>CELADON_CITY': 'BACKWARDS: Celadon (heal only)',
  'UNDERGROUND_PATH_ROUTE_7>UNDERGROUND_PATH_WEST_EAST': 'THE WAY FORWARD: the long tunnel east to Route 8', 'UNDERGROUND_PATH_ROUTE_7_COPY>UNDERGROUND_PATH_WEST_EAST': 'THE WAY FORWARD: the long tunnel east to Route 8',
  'UNDERGROUND_PATH_WEST_EAST>UNDERGROUND_PATH_ROUTE_8': 'THE WAY FORWARD: east end of the tunnel, up to Route 8 (Lavender)', 'UNDERGROUND_PATH_ROUTE_8>ROUTE_8': 'THE WAY FORWARD: out onto Route 8; go east to LAVENDER TOWN',
  'ROUTE_8>LAVENDER_TOWN': 'THE WAY FORWARD: Lavender Town (Pokemon Tower, Pokemon Center)', 'ROUTE_8>ROUTE_8_GATE': 'gate to Saffron (guard blocks us); go EAST to Lavender instead',
  'LAVENDER_TOWN>POKEMON_TOWER_1F': 'THE WAY FORWARD: Pokemon Tower; with the SILPH SCOPE the ghosts can be fought; climb to 7F and rescue Mr. Fuji (heal first if hurt)',
  'POKEMON_TOWER_1F>POKEMON_TOWER_2F': 'THE WAY FORWARD: up', 'POKEMON_TOWER_2F>POKEMON_TOWER_3F': 'THE WAY FORWARD: up', 'POKEMON_TOWER_3F>POKEMON_TOWER_4F': 'THE WAY FORWARD: up', 'POKEMON_TOWER_4F>POKEMON_TOWER_5F': 'THE WAY FORWARD: up (5F has a healing circle)', 'POKEMON_TOWER_5F>POKEMON_TOWER_6F': 'THE WAY FORWARD: up (ghost Marowak blocks 6F; the Scope reveals it)', 'POKEMON_TOWER_6F>POKEMON_TOWER_7F': 'THE WAY FORWARD: up to 7F: Rockets holding Mr. Fuji',
  'POKEMON_TOWER_1F>LAVENDER_TOWN': 'BACK: leaves the tower; only to heal at the Lavender Pokecenter, otherwise go up', 'POKEMON_TOWER_2F>POKEMON_TOWER_1F': 'BACK down (only to heal)', 'POKEMON_TOWER_3F>POKEMON_TOWER_2F': 'BACK down (only to heal)', 'POKEMON_TOWER_4F>POKEMON_TOWER_3F': 'BACK down (only to heal)', 'POKEMON_TOWER_5F>POKEMON_TOWER_4F': 'BACK down (only to heal)', 'POKEMON_TOWER_6F>POKEMON_TOWER_5F': 'BACK down (5F healing circle)', 'POKEMON_TOWER_7F>POKEMON_TOWER_6F': 'BACK down: only after rescuing Mr. Fuji' };
// Session 20260927-090228: gate upstairs floors (ROUTE_*_GATE_2F) only hold Oak's Aides / binoculars; the bot kept climbing them (Route 15 trap).
const gateFact = to => { const a = factsFrom || '', b = to || ''; if (/_GATE(_1F)?$/.test(a) && /_GATE_2F$/.test(b)) return 'DEAD END upstairs: only an Oak\'s Aide lecture, nothing needed; walk THROUGH the gate on this floor instead'; if (/_GATE_2F$/.test(a) && /_GATE(_1F)?$/.test(b)) return 'THE WAY OUT: back down, then walk through the gate'; return ''; };
// Silph 11F: the elevator/stairs side is cut off from GIOVANNI's office; the only way in is the 9F teleport pad that lands at 11F (5,5).
// Game data (pokered SilphCo7F/11F warps): 7F teleport pad <-> 11F (3,2), the ONLY walk-in to Giovanni's office; the rival waits on 7F.
// Session 20260927-114009 (DEEP, CONFIRMED from the full 7F grid): 7F's west room (x1-5,y1-7) holding the pads (5,3)<->3F and
// (5,7)<->11F is walled on all sides with NO card-key door; its only entrance is 3F's pad. So this starts true (was set only after a 7F visit).
let silph7Blocked = true;
const silphElFacts = (fl) => {
  if (silphDone()) { if (fl['1F']) fl['1F'] += ': BEST now: Giovanni is BEATEN; go out to Saffron City (heal, then Sabrina\'s gym)'; return fl; }
  if (!hasCardKey()) return fl;
  if (silph7Blocked) {
    if (fl['3F']) fl['3F'] += ": BEST now: 7F's pad to 11F had NO walking path from the 7F elevator side; 3F's teleport pad (behind a card-key door) lands in 7F's rival room right next to that pad";
    if (fl['7F']) fl['7F'] += `: from the 7F elevator side the pad to 11F was NOT walkable; go via 3F's teleport pad instead`;
    if (fl['11F']) fl['11F'] += `: elevator side of 11F is a DEAD END for Giovanni; visited ${visits.SILPH_CO_11F || 0}x with no progress`;
    return fl;
  }
  if (fl['11F']) fl['11F'] += `: elevator side of 11F is a DEAD END for Giovanni (walled off); visited ${visits.SILPH_CO_11F || 0}x with no progress`;
  if (fl['7F']) fl['7F'] += ": BEST with the CARD KEY: open 7F's locked doors, beat the rival there, then step on 7F's teleport pad that leads to SILPH_CO_11F (Giovanni's office side)";
  if (fl['9F']) fl['9F'] += ': its pads lead to 3F/5F, not to Giovanni';
  return fl;
};
const silphFact = (map, to, reach) => {
  if (silphDone()) return /SILPH_CO_1F/.test(to) ? ' (toward the exit: Giovanni is beaten, leave for Saffron/Sabrina)' : '';
  if (hasCardKey() && map === 'SILPH_CO_7F' && to === 'SILPH_CO_11F' && !reach) { silph7Blocked = true; return " (this pad is in 7F's sealed west room (x1-5,y1-7: walls on all sides, no card-key door); its ONLY entrance is 3F's teleport pad, which lands at 7F (5,3). Take the ELEVATOR to 3F)"; }
  if (hasCardKey() && silph7Blocked && /SILPH_CO_\d+F/.test(map) && map !== 'SILPH_CO_3F' && to === 'SILPH_CO_ELEVATOR') return " (BEST now: ride the elevator to 3F; 3F's teleport pad is the only way into 7F's west room with the pad to Giovanni)";
  if (hasCardKey() && map === 'SILPH_CO_3F' && to === 'SILPH_CO_7F') return " (BEST: 3F's teleport pad lands in 7F's rival room next to the pad to Giovanni's office on 11F)";
  if (hasCardKey() && silph7Blocked && /SILPH_CO_[0-9]+F|ELEVATOR/.test(map) && map !== 'SILPH_CO_3F' && to === 'SILPH_CO_3F') return ' (toward 3F: its teleport pad leads into the 7F rival room -> pad to Giovanni)';
  if (hasCardKey() && map === 'SILPH_CO_7F' && to === 'SILPH_CO_11F') return " (BEST: this teleport pad lands on GIOVANNI's side of 11F, the ONLY way into his office)";
  if (hasCardKey() && map === 'SILPH_CO_11F' && /SILPH_CO_[0-9]+F/.test(to) && to !== 'SILPH_CO_10F' && !reach) return " (pad on GIOVANNI's side; reach it by taking SILPH_CO_7F's teleport pad to 11F)";
  if (hasCardKey() && /SILPH_CO_(9|10)F|ELEVATOR/.test(map) && to === 'SILPH_CO_7F') return ' (toward 7F: its teleport pad is the way to Giovanni on 11F)';
  if (map === 'SILPH_CO_11F' && to === 'SILPH_CO_ELEVATOR') return ' (the elevator side of 11F is a DEAD END for Giovanni: going elevator<->11F again gives no progress; instead go to 7F (elevator) and take its teleport pad to 11F)';
  if (map === 'SILPH_CO_11F' && to === 'SILPH_CO_9F' && !reach) return " (this pad is on GIOVANNI's side of 11F; to get there, go to SILPH_CO_9F (via stairs 10F->9F or the elevator) and step on 9F's teleport pad that leads to SILPH_CO_11F)";
  if (map === 'SILPH_CO_ELEVATOR' && to === 'SILPH_CO_11F') return ' (11F from the elevator is a dead end for Giovanni; take 7F and its teleport pad to 11F instead)';
  return '';
};
// Session 20260927-131510: after SABRINA (badge 6) the gym/Silph texts pointed back into the gym. Next: BLAINE on CINNABAR (needs SURF).
const BADGE6_FACTS = { 'POKEMON_MANSION_1F>POKEMON_MANSION_B1F': 'THE WAY FORWARD: stairs down to B1F, where the SECRET KEY (opens Blaine\'s gym) lies', 'POKEMON_MANSION_1F>CINNABAR_ISLAND': 'leaves the mansion: NOT the way (the SECRET KEY is on B1F) unless the party must heal', 'SAFFRON_GYM>SAFFRON_CITY': 'THE WAY FORWARD: leave the gym; SABRINA is BEATEN (MARSH BADGE won), nothing more here',
  'SAFFRON_CITY>SAFFRON_GYM': 'BACKWARDS: SABRINA already beaten (MARSH BADGE won)', 'SAFFRON_CITY>SILPH_CO_1F': 'BACKWARDS: Silph Co. is DONE',
  'SAFFRON_CITY>SAFFRON_POKECENTER': 'Pokemon Center: heal, and its PC holds our boxed POKEMON (LAPRAS can learn SURF)',
  'ROUTE_6>UNDERGROUND_PATH_ROUTE_6': 'BACKWARDS: tunnel north to Cerulean (nothing left there)', 'UNDERGROUND_PATH_ROUTE_6>UNDERGROUND_PATH_NORTH_SOUTH': 'BACKWARDS: tunnel north to Cerulean (nothing left there)',
  'UNDERGROUND_PATH_NORTH_SOUTH>UNDERGROUND_PATH_ROUTE_5': 'BACKWARDS: north end, Cerulean (nothing left there)', 'UNDERGROUND_PATH_NORTH_SOUTH>UNDERGROUND_PATH_ROUTE_6': 'south end: Route 6 / Vermilion',
  'UNDERGROUND_PATH_ROUTE_5>ROUTE_5': 'BACKWARDS: Route 5 / Cerulean (nothing left there)', 'ROUTE_5>CERULEAN_CITY': 'BACKWARDS: Cerulean (nothing left there)',
  'VERMILION_CITY>ROUTE_11': 'THE WAY FORWARD: east along Route 11 to Route 12, then south (Routes 12-15) to FUCHSIA CITY; the sea south of Fuchsia (Route 19) leads to Cinnabar (SURF)',
  'VERMILION_CITY>ROUTE_6': 'BACKWARDS: north to Saffron (done)', 'ROUTE_6>SAFFRON_CITY': 'BACKWARDS: Saffron is done', 'ROUTE_6>ROUTE_6_GATE': 'BACKWARDS: gate north to Saffron (done)',
  'ROUTE_11>VERMILION_CITY': 'BACKWARDS: west to Vermilion (heal only)', 'ROUTE_11>ROUTE_12': 'THE WAY FORWARD: then south along Route 12 to Fuchsia', 'ROUTE_12>ROUTE_11': 'BACKWARDS: west to Vermilion',
  'VERMILION_CITY>VERMILION_DOCK': 'BACKWARDS: the S.S. Anne is gone',
  'FUCHSIA_CITY>FUCHSIA_POKECENTER': 'Pokemon Center: heal, and its PC holds LAPRAS (can learn SURF): entering swaps LAPRAS into the party',
  'FUCHSIA_CITY>ROUTE_19': 'NOT YET: Route 19 is open sea after a short beach; crossing needs a party POKEMON that knows SURF, and none does (LAPRAS is in the PC box); the bot cannot surf yet, so going there only bounces on the beach',
  'ROUTE_19>FUCHSIA_CITY': 'back north to Fuchsia (the sea south needs SURF, which nobody in the party knows)',
  'ROUTE_6>VERMILION_CITY': 'THE WAY FORWARD: south to Vermilion (Pokemon Center; Route 11 east -> Route 12 south -> Fuchsia, whose Route 19 sea leads to Cinnabar with SURF)' };
// Session 20260927-154012: after healing, live bounced Fuchsia <-> Route 19 because this said Route 19 was THE WAY FORWARD. The sea route is
// sealed (see NOTES); facts now describe the overland trip to PALLET TOWN -> Route 21: Fuchsia -> Route 15 -> 14 -> 13 -> 12 -> Lavender
// -> Route 8 -> Saffron -> Route 6 -> Vermilion -> Diglett's Cave -> Route 2 -> Viridian -> Route 1 -> Pallet.
const PALLET_WAY = ' (overland trip to PALLET TOWN, then SURF south down Route 21 to CINNABAR: Fuchsia -> Route 15 -> 14 -> 13 -> 12 -> Lavender -> Route 8 -> Saffron -> Route 6 -> Vermilion -> Diglett\'s Cave -> Route 2 -> Viridian -> Route 1 -> Pallet)';
const SURF_FACTS = { 'FUCHSIA_CITY>ROUTE_19': 'NOT the way: Route 19/20 sea is a dead end (west half sealed off by Seafoam, CONFIRMED). The way to Cinnabar is over land to PALLET TOWN, starting EAST on Route 15',
  'FUCHSIA_CITY>ROUTE_15': 'THE WAY FORWARD: east onto Route 15' + PALLET_WAY, 'FUCHSIA_CITY>ROUTE_18': 'west to Route 18 / Cycling Road (needs a BICYCLE); not the planned way',
  'ROUTE_15>ROUTE_14': 'THE WAY FORWARD: east/north onto Route 14' + PALLET_WAY, 'ROUTE_15>FUCHSIA_CITY': 'BACKWARDS: west back to Fuchsia',
  'ROUTE_14>ROUTE_13': 'THE WAY FORWARD: north onto Route 13' + PALLET_WAY, 'ROUTE_14>ROUTE_15': 'BACKWARDS: toward Fuchsia',
  'ROUTE_13>ROUTE_12': 'THE WAY FORWARD: east/north onto Route 12 toward Lavender' + PALLET_WAY, 'ROUTE_13>ROUTE_14': 'BACKWARDS: toward Fuchsia',
  'ROUTE_12>LAVENDER_TOWN': 'THE WAY FORWARD: north into LAVENDER TOWN' + PALLET_WAY, 'ROUTE_12>ROUTE_13': 'BACKWARDS: toward Fuchsia',
  'LAVENDER_TOWN>ROUTE_8': 'THE WAY FORWARD: west along Route 8 to SAFFRON CITY' + PALLET_WAY, 'LAVENDER_TOWN>ROUTE_12': 'BACKWARDS: south toward Fuchsia',
  'ROUTE_8>SAFFRON_CITY': 'THE WAY FORWARD: west into SAFFRON CITY' + PALLET_WAY,
  // Session 20260927-155012: live 164617 on Route 8 picked edge:east (0.93) back to Lavender because old facts called Lavender the way and the gate "blocked".
  'ROUTE_8>ROUTE_8_GATE': 'THE WAY FORWARD: the gate building west to SAFFRON CITY (the guard lets us through now, we already beat Sabrina in Saffron)' + PALLET_WAY,
  'ROUTE_8>LAVENDER_TOWN': 'BACKWARDS: east to Lavender (we just came from there; only to heal)', 'ROUTE_8>UNDERGROUND_PATH_ROUTE_8': 'NOT the way: tunnel to Celadon; the way is WEST through the Route 8 gate to Saffron',
  'ROUTE_8_GATE>SAFFRON_CITY': 'THE WAY FORWARD: west exit into SAFFRON CITY, then south through its gate to Route 6' + PALLET_WAY, 'ROUTE_8_GATE>ROUTE_8': 'BACKWARDS: east to Route 8 / Lavender',
  'SAFFRON_CITY>ROUTE_6_GATE': 'THE WAY FORWARD: south gate to Route 6 then VERMILION' + PALLET_WAY, 'ROUTE_6_GATE>ROUTE_6': 'THE WAY FORWARD: south exit onto Route 6 toward VERMILION' + PALLET_WAY, 'ROUTE_6_GATE>SAFFRON_CITY': 'BACKWARDS: north into Saffron',
  'SAFFRON_CITY>ROUTE_8_GATE': 'BACKWARDS: east toward Lavender', 'SAFFRON_CITY>ROUTE_7_GATE': 'NOT the way: west toward Celadon', 'SAFFRON_CITY>ROUTE_5_GATE': 'NOT the way: north toward Cerulean',
  'UNDERGROUND_PATH_ROUTE_8>ROUTE_8': 'THE WAY FORWARD: back out to Route 8, then WEST through the gate to Saffron', 'UNDERGROUND_PATH_ROUTE_8>UNDERGROUND_PATH_WEST_EAST': 'NOT the way: tunnel to Celadon',
  'UNDERGROUND_PATH_WEST_EAST>UNDERGROUND_PATH_ROUTE_8': 'THE WAY FORWARD: east end, back to Route 8 then the gate to Saffron', 'UNDERGROUND_PATH_WEST_EAST>UNDERGROUND_PATH_ROUTE_7': 'NOT the way: west end (Celadon); the plan goes through Saffron',
  'ROUTE_6>UNDERGROUND_PATH_ROUTE_6': 'NOT the way: tunnel north to Cerulean', 'ROUTE_6>ROUTE_6_GATE': 'BACKWARDS: north to Saffron', 'SAFFRON_CITY>ROUTE_6': 'THE WAY FORWARD: south gate onto Route 6 toward VERMILION' + PALLET_WAY,
  'ROUTE_6>VERMILION_CITY': 'THE WAY FORWARD: south into VERMILION CITY' + PALLET_WAY, 'VERMILION_CITY>ROUTE_11': 'THE WAY FORWARD: east onto Route 11; DIGLETT\'S CAVE entrance is at its west end' + PALLET_WAY,
  'ROUTE_11>DIGLETTS_CAVE_ROUTE_11': 'THE WAY FORWARD: Diglett\'s Cave, walk through it to Route 2' + PALLET_WAY, 'ROUTE_2>VIRIDIAN_CITY': 'THE WAY FORWARD: south to VIRIDIAN CITY' + PALLET_WAY, 'ROUTE_2>PEWTER_CITY': 'NOT the way unless the south path of this Route 2 strip is blocked: then go north to Pewter and come back south via the Viridian Forest gate', 'ROUTE_2>ROUTE_2_TRADE_HOUSE': 'side house (trade), no story progress', 'ROUTE_2>DIGLETTS_CAVE_ROUTE_2': 'BACKWARDS: back into Diglett\'s Cave toward Vermilion',
  'DIGLETTS_CAVE_ROUTE_11>DIGLETTS_CAVE': 'THE WAY FORWARD: down into Diglett\'s Cave, walk WEST through it to the Route 2 exit' + PALLET_WAY, 'DIGLETTS_CAVE_ROUTE_11>ROUTE_11': 'BACKWARDS: back out to Route 11 / Vermilion',
  'DIGLETTS_CAVE>DIGLETTS_CAVE_ROUTE_2': 'THE WAY FORWARD: exit to ROUTE 2, then south to VIRIDIAN' + PALLET_WAY, 'DIGLETTS_CAVE>DIGLETTS_CAVE_ROUTE_11': 'BACKWARDS: back east to Route 11 / Vermilion (we came from there)',
  'DIGLETTS_CAVE_ROUTE_2>ROUTE_2': 'THE WAY FORWARD: out onto ROUTE 2, then south to VIRIDIAN' + PALLET_WAY, 'DIGLETTS_CAVE_ROUTE_2>DIGLETTS_CAVE': 'BACKWARDS: back through the cave to Route 11 / Vermilion',
  'VIRIDIAN_CITY>ROUTE_1': 'THE WAY FORWARD: south down Route 1 to PALLET TOWN',
  'PEWTER_CITY>ROUTE_2': 'THE WAY FORWARD: south onto Route 2, then through VIRIDIAN FOREST (west side gate) to VIRIDIAN' + PALLET_WAY,
  'ROUTE_2>VIRIDIAN_FOREST_NORTH_GATE': 'THE WAY FORWARD: gate into VIRIDIAN FOREST; walk south through the forest to southern Route 2 and VIRIDIAN' + PALLET_WAY,
  'ROUTE_2>VIRIDIAN_FOREST_SOUTH_GATE': 'NOT the way: back north into Viridian Forest; VIRIDIAN CITY is south',
  'VIRIDIAN_FOREST_NORTH_GATE>VIRIDIAN_FOREST': 'THE WAY FORWARD: into Viridian Forest, walk SOUTH through it' + PALLET_WAY, 'VIRIDIAN_FOREST_NORTH_GATE>ROUTE_2': 'BACKWARDS: north to Pewter',
  'VIRIDIAN_FOREST>VIRIDIAN_FOREST_SOUTH_GATE': 'THE WAY FORWARD: south exit of the forest, then southern Route 2 to VIRIDIAN' + PALLET_WAY, 'VIRIDIAN_FOREST>VIRIDIAN_FOREST_NORTH_GATE': 'BACKWARDS: north to Pewter',
  'VIRIDIAN_FOREST_SOUTH_GATE>ROUTE_2': 'THE WAY FORWARD: out onto southern Route 2, then south to VIRIDIAN' + PALLET_WAY, 'VIRIDIAN_FOREST_SOUTH_GATE>VIRIDIAN_FOREST': 'BACKWARDS: back into the forest',
  'PEWTER_CITY>ROUTE_3': 'NOT the way: east toward Mt. Moon (old area)', 'PEWTER_CITY>PEWTER_GYM': 'DONE: Brock already beaten', 'ROUTE_1>PALLET_TOWN': 'THE WAY FORWARD: PALLET TOWN; then surf SOUTH down Route 21 to CINNABAR',
  'PALLET_TOWN>ROUTE_21': 'THE WAY FORWARD: surf SOUTH down Route 21 to CINNABAR ISLAND (BLAINE, badge 7)',
  'ROUTE_19>FUCHSIA_CITY': 'THE WAY FORWARD: north to Fuchsia, then overland to PALLET TOWN (the sea here is a dead end)', 'ROUTE_19>ROUTE_20': 'NOT the way to Cinnabar (Route 20 sea is split by Seafoam; the western half is unreachable from here without the STRENGTH puzzle). Cinnabar route: Fuchsia -> ... -> PALLET TOWN -> Route 21 south',
  'ROUTE_20>ROUTE_19': 'BACKWARDS: east to Route 19 / Fuchsia', 'ROUTE_20>CINNABAR_ISLAND': 'CINNABAR ISLAND (BLAINE badge 7) but NOT reachable by sea from east Route 20 or the pocket west of Seafoam (CONFIRMED sealed: x=43 wall, row 13 wall, x=62 wall rows 5-16). Only via Seafoam 1F east-bottom exit after the STRENGTH boulder/current puzzle, or from PALLET TOWN south down Route 21',
  // Session 20260927-140511 (from the ROUTE_20 grid dump): the eastern sea + middle islet (x 44-61) are walled off from the western
  // sea by rock (x=43 rows 2-13, x=55/62 ridges). The only link is THROUGH Seafoam: 1F exit (26,17)/(27,17) -> Route 20 door (58,9)
  // -> land x56-61 y10-11 -> surf south to rows 12-16 -> west to x=0 = CINNABAR. On 1F that exit area (x21-27,y12-15) is only reached
  // via the ladder (23,15) coming UP from B1F.
  'ROUTE_20>SEAFOAM_ISLANDS_1F': 'NOT the way: Seafoam is blocked by fast currents on B3F/B4F without STRENGTH (bot got stuck there many runs). The Route 20 west sea is NOT reachable around it (CONFIRMED: x=62 refused rows 12-16, pocket west of Seafoam sealed). Go to PALLET TOWN and surf south down Route 21 to Cinnabar instead',
  'SEAFOAM_ISLANDS_1F>SEAFOAM_ISLANDS_B1F': 'ladders at (7,5)/(25,3) go down to B1F; the 1F exit to Cinnabar (26,17) is walled off on 1F and only reached by coming back UP a B1F ladder that lands at 1F (23,15). The ladder AT (23,15) itself is where we arrive, not a way forward',
  'SEAFOAM_ISLANDS_B1F>SEAFOAM_ISLANDS_1F': 'ladder up to 1F: the one landing at 1F (23,15) is next to the exit to Cinnabar (26,17): THE WAY FORWARD; the others land back near the entrance we came from',
  'CINNABAR_ISLAND>ROUTE_20': 'BACKWARDS: east over the sea to Fuchsia' };
// Session 20260927-152012: during a heal trip the exit facts must point at the Pokemon Center (live 160055: Jev picked heal, then edge:west at 1.0).
const HEAL_FACTS = { 'ROUTE_20>ROUTE_19': 'HEAL TRIP: THE WAY TO THE POKEMON CENTER: east to Route 19, then north to FUCHSIA CITY Pokemon Center', 'ROUTE_20>CINNABAR_ISLAND': 'NOT reachable this way (blocked sea) and away from the Fuchsia Pokemon Center we are heading to',
  'ROUTE_20>SEAFOAM_ISLANDS_1F': 'away from the Pokemon Center (Seafoam cave, no healing)', 'ROUTE_19>FUCHSIA_CITY': 'HEAL TRIP: THE WAY TO THE POKEMON CENTER: north into FUCHSIA CITY', 'ROUTE_19>ROUTE_20': 'away from the Pokemon Center (heal trip goes north to Fuchsia)',
  'FUCHSIA_CITY>FUCHSIA_POKECENTER': 'HEAL TRIP GOAL: the Pokemon Center (restores all HP and PP)', 'FUCHSIA_CITY>ROUTE_19': 'away from the Pokemon Center (heal first)' };
// Session 20260927-172013: with the SECRET KEY in the bag the Mansion is DONE; BADGE6_FACTS still called 1F>B1F "THE WAY FORWARD" (live test went back down).
function checkSecretKey() { try { return bag().some(i => /SECRET KEY/i.test(i.name || '')); } catch (e) { return false; } }
// Session 20260927-180014: badge 7 won -> Cinnabar/mansion are backwards, head north to Pallet/Viridian (Giovanni).
const BADGE7_FACTS = { 'POKEMON_MANSION_3F>POKEMON_MANSION_2F': 'THE WAY OUT: down toward 1F and the exit (badge 7 done, mansion finished)', 'POKEMON_MANSION_2F>POKEMON_MANSION_1F': 'THE WAY OUT: down to 1F and the exit', 'POKEMON_MANSION_2F>POKEMON_MANSION_3F': 'BACKWARDS: mansion is finished', 'POKEMON_MANSION_1F>CINNABAR_ISLAND': 'THE WAY OUT: leave the mansion, then surf north to Pallet', 'POKEMON_MANSION_1F>POKEMON_MANSION_2F': 'BACKWARDS: mansion is finished', 'POKEMON_MANSION_1F>POKEMON_MANSION_B1F': 'BACKWARDS: mansion is finished', 'CINNABAR_ISLAND>POKEMON_MANSION_1F': 'BACKWARDS: mansion is finished', 'CINNABAR_ISLAND>CINNABAR_GYM': 'BACKWARDS: Blaine already beaten (badge 7)', 'CINNABAR_ISLAND>ROUTE_21': 'THE WAY FORWARD: surf north to Pallet Town -> Route 1 -> Viridian (Giovanni, badge 8)', 'CINNABAR_ISLAND>ROUTE_20': 'BACKWARDS: east toward Seafoam/Fuchsia', 'ROUTE_21>PALLET_TOWN': 'THE WAY FORWARD: then north up Route 1 to Viridian', 'ROUTE_21>CINNABAR_ISLAND': 'BACKWARDS', 'PALLET_TOWN>ROUTE_1': 'THE WAY FORWARD: north to Viridian City (Giovanni gym)', 'PALLET_TOWN>ROUTE_21': 'BACKWARDS: south to Cinnabar', 'ROUTE_1>VIRIDIAN_CITY': 'THE WAY FORWARD: Viridian Gym (Giovanni, badge 8) is in the north of the city', 'ROUTE_1>PALLET_TOWN': 'BACKWARDS', 'VIRIDIAN_CITY>VIRIDIAN_GYM': 'THE WAY FORWARD: GIOVANNI, badge 8', 'VIRIDIAN_CITY>ROUTE_1': 'BACKWARDS' };
const KEY_FACTS = { 'POKEMON_MANSION_1F>POKEMON_MANSION_B1F': 'BACKWARDS: the SECRET KEY is already in the bag; B1F has nothing left we need', 'POKEMON_MANSION_1F>CINNABAR_ISLAND': 'THE WAY FORWARD: leave the mansion (SECRET KEY in bag) and go to the CINNABAR_GYM for BLAINE (badge 7)',
  'POKEMON_MANSION_1F>POKEMON_MANSION_2F': 'BACKWARDS: upstairs, the SECRET KEY is already found', 'POKEMON_MANSION_B1F>POKEMON_MANSION_1F': 'THE WAY OUT: stairs up to 1F, then out to CINNABAR_ISLAND and Blaine\'s gym (SECRET KEY in bag)',
  'POKEMON_MANSION_2F>POKEMON_MANSION_1F': 'THE WAY OUT: down to 1F, then out to CINNABAR_ISLAND (SECRET KEY in bag)', 'POKEMON_MANSION_2F>POKEMON_MANSION_3F': 'BACKWARDS: upstairs, the SECRET KEY is already found',
  'POKEMON_MANSION_3F>POKEMON_MANSION_2F': 'THE WAY OUT: down toward 1F and the exit (SECRET KEY in bag)', 'CINNABAR_ISLAND>POKEMON_MANSION_1F': 'BACKWARDS: the mansion is done (SECRET KEY in bag)',
  'CINNABAR_GYM>CINNABAR_ISLAND': 'BACKWARDS: leaves Blaine\'s gym; only take it if the team must heal at the Pokemon Center', 'CINNABAR_ISLAND>CINNABAR_GYM': 'THE WAY FORWARD: Blaine\'s gym (unlocked with the SECRET KEY in the bag); Fire type, Water/Rock/Ground moves are strong; badge 7' };
const BADGE8_FACTS = { 'VIRIDIAN_POKECENTER>VIRIDIAN_CITY': 'THE WAY FORWARD: out to Viridian City, then WEST to Route 22 (Pokemon League)', 'VIRIDIAN_CITY>VIRIDIAN_GYM': 'BACKWARDS: Giovanni already beaten (badge 8)', 'VIRIDIAN_GYM>VIRIDIAN_CITY': 'THE WAY FORWARD: leave the finished gym, go WEST to Route 22', 'VIRIDIAN_CITY>ROUTE_22': 'THE WAY FORWARD: west to the Route 22 gate (badge check) and the Pokemon League', 'VIRIDIAN_CITY>ROUTE_1': 'BACKWARDS: south to Pallet', 'VIRIDIAN_CITY>ROUTE_2': 'BACKWARDS: north to Pewter', 'VIRIDIAN_CITY>VIRIDIAN_POKECENTER': 'Pokemon Center: heal only if the party is hurt or low on PP', 'VIRIDIAN_CITY>VIRIDIAN_MART': 'Mart: buy potions/revives only if needed', 'ROUTE_22>ROUTE_22_GATE': 'THE WAY FORWARD: badge-check gate, go through NORTH to Route 23', 'ROUTE_22>VIRIDIAN_CITY': 'BACKWARDS', 'ROUTE_22_GATE>ROUTE_23': 'THE WAY FORWARD: north up Route 23 (badge guards, surf) to Victory Road', 'ROUTE_22_GATE>ROUTE_22': 'BACKWARDS', 'ROUTE_23>VICTORY_ROAD_1F': 'THE WAY FORWARD: Victory Road cave (STRENGTH boulders onto switches)', 'ROUTE_23>ROUTE_22_GATE': 'BACKWARDS', 'ROUTE_23>INDIGO_PLATEAU': 'THE WAY FORWARD: Indigo Plateau, the Elite Four', 'VICTORY_ROAD_1F>VICTORY_ROAD_2F': 'THE WAY FORWARD: up through the cave', 'VICTORY_ROAD_1F>ROUTE_23': 'BACKWARDS (unless it is the north exit)', 'INDIGO_PLATEAU>INDIGO_PLATEAU_LOBBY': 'THE WAY FORWARD: lobby (heal, shop), then the Elite Four', 'INDIGO_PLATEAU_LOBBY>LORELEIS_ROOM': 'THE WAY FORWARD: the Elite Four (LORELEI first: Ice/Water DEWGONG, CLOYSTER, SLOWBRO, JYNX, LAPRAS Lv53-56), then Bruno, Agatha, Lance, Champion', 'INDIGO_PLATEAU_LOBBY>INDIGO_PLATEAU': 'BACKWARDS: outside (nothing left to do there)' };
const mapFact = to => { const f = (healTrip && HEAL_FACTS[`${factsFrom}>${to}`]) || gateFact(to) || (surfOK && SURF_FACTS[`${factsFrom}>${to}`]) || (badgeCount === 6 && /^(CINNABAR|POKEMON_MANSION)/.test(factsFrom || '') && checkSecretKey() && KEY_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 8 && BADGE8_FACTS[`${factsFrom}>${to}`]) || (badgeCount === 7 && BADGE7_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 6 && BADGE6_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 5 && (checkMaster() || silphDone()) && MASTER_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 4 && checkFlute() && FLUTE_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 4 && !checkFlute() && checkFuji() && FUJI_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 4 && checkScope() && SCOPE_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 4 && /ROCKET_HIDEOUT/.test(factsFrom || '') && checkLiftKey() && LIFTKEY_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 4 && BADGE4_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 3 && BADGE3_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 2 && checkCut() && CUT_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 2 && checkTicket() && TICKET_FACTS[`${factsFrom}>${to}`]) || (badgeCount >= 2 && BADGE2_FACTS[`${factsFrom}>${to}`]) || (seenCerulean && badgeCount < 2 && CERULEAN_FACTS[`${factsFrom}>${to}`]) || (factsDone && ((hasBadge1 && BADGE1_FACTS[`${factsFrom}>${to}`]) || BACK_FACTS[`${factsFrom}<${prevMap}>${to}`] || BACK_FACTS[`${factsFrom}>${to}`] || MAP_FACTS_DONE[to])) || MAP_FACTS[to]; return f ? ` [${f}]` : ''; };
function destOptions(st) {
  factsDone = stage(st).done;
  factsFrom = st.map;
  if (/CERULEAN/.test(st.map || '')) seenCerulean = true;
  badgeCount = st.badges || 0;
  const g = gridX(), opts = {}, act = {};
  for (const w of g.warps || []) {
    const raw = w.to || w.map || w.dest || '?';
    let to = /previous/i.test(raw) ? warpName(raw) : raw;
    // Session 20260927-020223: harness resolves 1F's LAST_MAP exits (15,0-3 north, 15,33-35 south) to the last map (B1F), so Jev
    // saw the north exit as an untried "ladder DOWN to B1F" and walked out to Route 10 (live run 025259). They lead to ROUTE_10.
    // Session 20260927-093229: generic fix for building exits. ROM destMap 255 = "last outdoor map", but the harness names it after
    // the last map visited (e.g. Mart 1F street doors shown as '2F'), so Jev never saw the way out. Gates excluded (two outdoor sides).
    try {
      const rw = ((rom.mapByName(st.map) || {}).warps || []).find(r => r.x === w.x && r.y === w.y);
      if (rw && rw.destMap === 255 && lastOutdoor && lastOutdoor !== st.map && !/GATE|MT_MOON|ROCK_TUNNEL/.test(st.map)) to = lastOutdoor;
    } catch (e) {}
    if (st.map === 'ROCK_TUNNEL_1F' && w.x === 15 && (w.y <= 3 || w.y >= 33)) to = 'ROUTE_10';
    // Several ladders to the same floor (Mt Moon B2F has 4 up to B1F, each into a different section): list each one separately,
    // otherwise Jev only ever sees one (the one we arrived on) and can never pick the ladder to the exit.
    // Session 20260927-060726: gates (ROUTE_12_GATE_1F) have a north AND a south exit to the same route; both collapsed into one
    // option (the one we stood on), so Jev could only go back north (live run 070305 looped gate<->Route 12). List every separate
    // exit (warps more than 1 tile apart; 2-tile-wide doors stay one option) with which side of the building it is on.
    const same = (g.warps || []).filter(o => (o.to || o.map || o.dest) === raw);
    const multi = same.length > 1 && (/MT_MOON|ROCK_TUNNEL/.test(st.map) || same.some(o => Math.abs(o.x - w.x) + Math.abs(o.y - w.y) > 1));
    if (multi && !/MT_MOON|ROCK_TUNNEL/.test(st.map) && same.some(o => (o.y < w.y || (o.y === w.y && o.x < w.x)) && Math.abs(o.x - w.x) + Math.abs(o.y - w.y) <= 1)) continue;
    const side = multi && !/MT_MOON|ROCK_TUNNEL/.test(st.map) ? (w.y <= 1 ? ' (exit on the NORTH side of this building)' : w.y >= g.height - 2 ? ' (exit on the SOUTH side of this building)' : w.x <= 1 ? ' (exit on the WEST side)' : w.x >= g.width - 2 ? ' (exit on the EAST side)' : '') : '';
    const id = multi ? `door:${to}@${w.x},${w.y}` : `door:${to}`;
    const d = Math.abs(w.x - st.x) + Math.abs(w.y - st.y);
    const reach = !!pathDir(g, w.x, w.y) || d === 0;
    const reachN = !reach && reachable(g, st.x, st.y, w.x, w.y, true);
    let blockers = '';
    if (reachN) try { // which single person/object tile, if gone, opens the path (e.g. Mt Moon B2F fossils)
      const bs = (g.npcs || []).filter(n => { const rows = g.rows.map((r, yy) => yy === n.y ? r.slice(0, n.x) + '.' + r.slice(n.x + 1) : r); return reachable({ ...g, rows }, st.x, st.y, w.x, w.y, false); });
      const beat = bs.length && bs.every(n => (talkedAt[`${st.map}|${n.x},${n.y}`] || 0) >= 2);
      if (bs.length) blockers = beat ? ` (blocked by the person/object at ${bs.map(n => `(${n.x},${n.y})`).join(' or ')}, ALREADY talked to/battled ${bs.map(n => talkedAt[`${st.map}|${n.x},${n.y}`]).join('/')}x: a beaten trainer never moves, so this path stays blocked for good; use another REACHABLE door/teleport pad instead)` : ` (blocked by the person/object at ${bs.map(n => `(${n.x},${n.y})`).join(' or ')}: deal with it via its talk option first)`;
    } catch (e) {}
    // Session 20260927-122509: SAFFRON_GYM offered ~30 pads, all but one unreachable; Jev never found the one real pad (11,15).
    // Only offer pads we can actually walk to (or stand on).
    if ((w.to || w.map || w.dest) === st.map && !reach && d !== 0) continue;
    if (act[id] && (act[id].reach || !reach)) continue;
    act[id] = { kind: 'warp', to: raw, reach: reach || reachN, at: multi ? { x: w.x, y: w.y } : null };
    const tried = multi ? (warpUsed[`${st.map}|${w.x},${w.y}`] || 0) : 0;
    if (raw === st.map) { const land = padLand[`${st.map}|${w.x},${w.y}`]; const d0 = Math.abs(w.x - st.x) + Math.abs(w.y - st.y);
      opts[id] = `Step on the TELEPORT PAD at (${w.x},${w.y}) (jumps elsewhere inside this gym); ${d0} tiles away${d0 === 0 ? ' (we are standing on it: it is the pad we just arrived on)' : ''}; ${land ? `last time it landed us at (${land})${st.map === 'SAFFRON_GYM' ? `, which is ${(([lx, ly]) => Math.abs(lx - 9) + Math.abs(ly - 8))(land.split(',').map(Number))} tiles from SABRINA at (9,8) (smaller = closer to the goal)` : ''}` : 'NOT tried yet (unknown destination)'}${tried ? `; used ${tried}x` : ''}${(reach || d0 === 0) ? '' : ' (NOT reachable from here)'}`; continue; }
    opts[id] = `Enter the door/stairs at (${w.x},${w.y}) leading to ${to}${side}${mapFact(to)}${rockExitFact(st.map, w, to)}${vrLadderFact(st.map, w)}${silphFact(st.map, to, reach)}; ${d} tiles away${d === 0 ? ' (we are STANDING on it: this is the ladder we just arrived by, it leads back where we came from)' : ''}${reach ? '' : (to === 'VERMILION_GYM' && knowsCut()) ? ' (reachable by cutting the tree)' : reachN ? ` but a person/object blocks the only path${blockers}` : ' but NO walking path from here (other section of the map)'}${multi ? `; taken ${tried} times before` : ''}${/MT_MOON|ROCK_TUNNEL_(1F|B1F)/.test(st.map) ? landingFacts(st.map, w) : ''}${deadEnd[`${st.map}|${w.x},${w.y}`] && !gridCache[raw] ? `; DEAD END: ${deadEnd[`${st.map}|${w.x},${w.y}`]} time(s) after taking this ladder, every way onward from where it lands was blocked/unreachable and we had to come back (it leads into a closed pocket; pick a different ladder)` : ''}; visited ${visits[to] || 0} times before${noGain[to] ? `; ${noGain[to]} earlier visit(s) there produced NO story progress (low value to go back)` : ''}${destFail[`${rk(st.map)}|${id}`] ? `; FAILED ${destFail[`${rk(st.map)}|${id}`]}x from here (blocked/unreachable)` : ''}.`;
  }
  // Session 20260927-014723: live bot looped 1F(37,3) <-> B1F(33,25) many times while an untried reachable ladder existed.
  // Tell Jev explicitly which ladder is a loop and which reachable ladder is still untried (facts only; Jev still picks).
  try {
    if (/MT_MOON|ROCK_TUNNEL/.test(st.map)) {
      const ladders = Object.keys(act).filter(k => act[k].kind === 'warp' && act[k].at && act[k].reach);
      const used = k => warpUsed[`${st.map}|${act[k].at.x},${act[k].at.y}`] || 0;
      const fresh = ladders.filter(k => used(k) === 0);
      if (fresh.length) for (const k of ladders) {
        if (used(k) >= 2) opts[k] += ` LOOP WARNING: taken ${used(k)} times already and it only brought us back here in a circle; the untried reachable ladder(s) ${fresh.map(f => f.replace('door:', '')).join(', ')} are the new way to explore.`;
        else if (used(k) === 0) opts[k] += ' NEVER TRIED yet and reachable: likely the way out of the loop.';
      }
    }
  } catch (e) {}
  // Session 20260927-015723: live bot still loops 1F(37,3)<->B1F(33,25). Known walkthrough route as facts (Jev still picks).
  try {
    // Session 20260927-020723: table corrected from the bot's own landing facts (1F 5,3 lands B1F 27,3 which only walks to 1F 33,25:
    // a loop). Real route: 1F 37,3 -> B1F 33,25 -> walk to B1F 27,3 -> 1F 5,3 -> walk to 1F 17,11 -> B1F 23,11 -> walk to B1F 3,3
    // -> 1F 37,17 (south part) -> walk to south exit 15,33.
    const RT = { 'ROCK_TUNNEL_1F@37,3': 'walkthrough: take this ONCE from the north entrance; after that it is the way BACK',
      'ROCK_TUNNEL_B1F@33,25': 'walkthrough: BACKWARDS, only returns to the north part of 1F',
      'ROCK_TUNNEL_B1F@27,3': 'walkthrough: the correct next step from the east part of B1F (leads to the 1F middle section)',
      'ROCK_TUNNEL_1F@5,3': 'walkthrough: BACKWARDS from the middle section (it lands in the east part of B1F we already crossed); take ladder (17,11) instead',
      'ROCK_TUNNEL_1F@17,11': 'walkthrough: THE WAY FORWARD from the 1F middle section (to the west part of B1F, toward the final ladder)',
      'ROCK_TUNNEL_B1F@23,11': 'walkthrough: BACKWARDS, returns to the 1F middle section; walk on to ladder (3,3) instead',
      'ROCK_TUNNEL_B1F@3,3': 'walkthrough: the FINAL ladder: leads to the south part of 1F next to the exit to Lavender',
      'ROCK_TUNNEL_1F@15,3': 'walkthrough: the NORTH entrance to Route 10 (BACKWARDS, only to heal at the Pokemon Center)',
      'ROCK_TUNNEL_1F@15,33': 'walkthrough: the SOUTH exit: Lavender Town is just south, THIS is the goal of the tunnel',
      'ROCK_TUNNEL_1F@37,17': 'walkthrough: from the south part this goes back into B1F (BACKWARDS); head for the south exit (15,33) instead' };
    for (const k of Object.keys(act)) { const r = act[k].at && RT[`${st.map}@${act[k].at.x},${act[k].at.y}`];
      if (r && /BACKWARDS/.test(r)) opts[k] = opts[k].replace(' NEVER TRIED yet and reachable: likely the way out of the loop.', ''); }
    for (const k of Object.keys(act)) if (act[k].at && RT[`${st.map}@${act[k].at.x},${act[k].at.y}`]) opts[k] += ` (${RT[`${st.map}@${act[k].at.x},${act[k].at.y}`]})`;
  } catch (e) {}
  // Session 20260927-072727: ROUTE_14's west exit (to Route 15) is only reachable from the SOUTH part of the map; offer a waypoint.
  try { if (st.map === 'ROUTE_14' && !act['wp:south']) { act['wp:south'] = { kind: 'wp', dir: 'south' };
    opts['wp:south'] = `Walk SOUTH down Route 14 to the lowest reachable tile (we are at y=${st.y} of ${g.height}); THE WAY FORWARD: the exit west to Route 15 / FUCHSIA CITY is at the south-west end and cannot be reached from the north part${destFail[`${rk(st.map)}|wp:south`] ? `; FAILED ${destFail[`${rk(st.map)}|wp:south`]}x` : ''}.`; } } catch (e) {}
  for (const e of g.exits || []) {
    const side = e.side || e.dir || e.direction, to = e.to || e.map || '?', id = `edge:${side}`;
    if (!side || act[id]) continue;
    act[id] = { kind: 'edge', side };
    opts[id] = `Walk off the ${side} edge of the map to ${to}${mapFact(to)}; visited ${visits[to] || 0} times before${noGain[to] ? `; ${noGain[to]} earlier visit(s) there produced NO story progress` : ''}${destFail[`${rk(st.map)}|${id}`] ? `; FAILED ${destFail[`${rk(st.map)}|${id}`]}x (blocked, e.g. someone said "You can't go through here")` : ''}.`;
  }
  // Route 10 SOUTH part (below Rock Tunnel, y > 40; tunnel south entrance at 8,53): test 021909 left the tunnel here and Jev went
  // straight back in because the door fact still said "THE WAY FORWARD: Rock Tunnel". Correct facts for this section.
  if (st.map === 'ROUTE_10' && st.y > 40 && badgeCount >= 3) {
    for (const k of Object.keys(opts)) {
      if (/^door:ROCK_TUNNEL_1F/.test(k)) opts[k] = opts[k].replace(/\[THE WAY FORWARD[^\]]*\]/, '[BACKWARDS: we just came OUT of Rock Tunnel here (its south exit); going in again means crossing the whole cave back north]');
      if (k === 'edge:south') opts[k] += ' (THE WAY FORWARD: we are through Rock Tunnel; Lavender Town is just south, next stop)';
    }
  }
  // Session 20260927-085228: after badge 5 the bot wandered WEST to Route 18 (Cycling Road needs a BICYCLE). Road to SAFFRON on foot:
  // Route 18 -> Fuchsia -> Route 15 -> 14 -> 13 -> 12 -> Lavender -> Route 8 -> Saffron. Mark the edge on that road for Jev.
  try {
    // Session 20260927-164512: the Route 12 gate facts below were badge-5 only; with 6 badges (overland trip to Pallet) Jev saw no
    // direction in ROUTE_12_GATE_1F and bounced north/south/2F (live run 164123). Same facts for badges >= 6.
    if (badgeCount >= 6) {
      if (st.map === 'ROUTE_12') for (const k of Object.keys(act)) {
        if (act[k].kind !== 'warp' || !/ROUTE_12_GATE_1F/.test(k)) continue;
        const ay = act[k].at ? act[k].at.y : 99;
        if (st.y > 18 && ay > 18) opts[k] += ' (THE WAY FORWARD: enter this gate and walk straight through it NORTH (not the stairs); north Route 12 leads to LAVENDER TOWN' + PALLET_WAY + ')';
        else if (st.y <= 18 && ay <= 18) opts[k] += ' (BACKWARDS: gate back south toward Route 13 / Fuchsia)';
      }
      if (st.map === 'ROUTE_12_GATE_1F') for (const k of Object.keys(act)) {
        if (act[k].kind !== 'warp' || /2F/.test(k) || !act[k].at) continue;
        opts[k] += act[k].at.y <= 2 ? ' (THE WAY FORWARD: NORTH exit of the gate, onto north Route 12 toward LAVENDER TOWN' + PALLET_WAY + ')' : ' (BACKWARDS: south exit, back toward Route 13 / Fuchsia)';
      }
    }
    if (badgeCount === 5) {
      const NEXT = { ROUTE_18: 'FUCHSIA_CITY', FUCHSIA_CITY: 'ROUTE_15', ROUTE_15: 'ROUTE_14', ROUTE_14: 'ROUTE_13', ROUTE_13: 'ROUTE_12', ROUTE_12: 'LAVENDER_TOWN', LAVENDER_TOWN: 'ROUTE_8', ROUTE_8: 'SAFFRON_CITY', ROUTE_17: 'ROUTE_18' };
      let drink = false; try { drink = bag().some(i => /FRESH WATER|SODA POP|LEMONADE/i.test(i.name || '')); } catch (e) {}
      if (guardsOk()) drink = true;
      if (!drink) Object.assign(NEXT, { ROUTE_8: 'none', ROUTE_7: 'CELADON_CITY' });
      const nx = NEXT[st.map];
      if (nx) for (const k of Object.keys(act)) {
        if (act[k].kind !== 'edge') continue;
        const e = (g.exits || []).find(x => (x.side || x.dir || x.direction) === act[k].side) || {};
        const to = String(e.to || e.map || '');
        if (to === nx) opts[k] += ` (THE WAY FORWARD toward SAFFRON on foot: ${st.map} -> ${nx}; full road Route 18 -> Fuchsia -> Route 15 -> 14 -> 13 -> 12 -> Lavender -> Route 8 -> Saffron)`;
        else if (/ROUTE_17|ROUTE_16|CYCLING/.test(to)) opts[k] += ' (AWAY from Saffron: Cycling Road, needs a BICYCLE we do not have)';
      }
      // Session 20260927-090728: the pre-badge-5 FLUTE_FACTS still called Route 12->13->14->15 "THE WAY FORWARD toward Fuchsia", so Jev
      // bounced Route 12 <-> 13 <-> 14 (live run 100309). With badge 5, rewrite those brackets: edges back toward Fuchsia are BACKWARDS.
      const PREV = {}; for (const a of Object.keys(NEXT)) if (NEXT[a] !== 'none') PREV[NEXT[a]] = PREV[NEXT[a]] || a;
      for (const k of Object.keys(act)) {
        if (act[k].kind !== 'edge') continue;
        const e = (g.exits || []).find(x => (x.side || x.dir || x.direction) === act[k].side) || {};
        const to = String(e.to || e.map || '');
        if (to && PREV[st.map] === to) opts[k] = opts[k].replace(/\[THE WAY FORWARD[^\]]*\]/, '[BACKWARDS: back toward Fuchsia; badge 5 is DONE, we are heading NORTH to Lavender]').replace(/ \(THE WAY FORWARD toward SAFFRON[^)]*\)/, '');
        else if (to && to === nx) opts[k] = opts[k].replace(/\[BACKWARDS[^\]]*\]/, '[north toward Lavender]');
      }
      // Route 12: Lavender is reached by walking NORTH through ROUTE_12_GATE_1F (its south door is at y=21, north door y=15).
      if (st.map === 'ROUTE_12') for (const k of Object.keys(act)) {
        if (act[k].kind !== 'warp' || !/ROUTE_12_GATE_1F/.test(k)) continue;
        const ay = act[k].at ? act[k].at.y : 99;
        if (st.y > 18 && ay > 18) opts[k] += ' (THE WAY FORWARD: enter this gate and walk straight through it NORTH (do not take the stairs); the north half of Route 12 leads to LAVENDER TOWN)';
        else if (st.y <= 18 && ay <= 18) opts[k] += ' (BACKWARDS: gate back south toward Route 13 / Fuchsia)';
      }
      if (st.map === 'ROUTE_12_GATE_1F') for (const k of Object.keys(act)) {
        if (act[k].kind !== 'warp' || /2F/.test(k) || !act[k].at) continue;
        opts[k] += act[k].at.y <= 2 ? ' (THE WAY FORWARD: NORTH exit of the gate, onto north Route 12 toward LAVENDER TOWN)' : ' (BACKWARDS: south exit, back toward Route 13 / Fuchsia)';
      }
      if (st.map === 'ROUTE_18') for (const k of Object.keys(act)) if (act[k].kind === 'warp' && /ROUTE_18_GATE/.test(k) && st.x < 40) opts[k] += ' (THE WAY FORWARD: pass through this gate EAST back to Fuchsia; then Route 15 east toward Saffron)';
      if (!drink) for (const k of Object.keys(act)) {
        if (act[k].kind !== 'warp') continue;
        if (st.map === 'ROUTE_8' && /UNDERGROUND/.test(k)) opts[k] += ' (THE WAY FORWARD: no drink yet, take the Underground Path west to Route 7 / CELADON to buy FRESH WATER on the Celadon Mart roof)';
        else if (/ROUTE_8_GATE|ROUTE_7_GATE/.test(k)) opts[k] += ' (Saffron gate: the guard blocks us until we have a drink; we have NONE yet)';
        else if (st.map === 'CELADON_CITY' && /CELADON_MART_1F/.test(k)) opts[k] += ' (THE WAY FORWARD: Celadon Mart; go up to the ROOF and buy FRESH WATER from the vending machine for the Saffron guards)';
        else if (/CELADON_MART_[1-5]F$/.test(st.map) && /CELADON_MART_([2-5]F|ROOF)|ELEVATOR/.test(k)) opts[k] += ' (UP toward the Celadon Mart ROOF vending machines: FRESH WATER)';
      }
      // Session 20260927-091728: with the drink bought on the roof, point the way back down/out and to the nearest Saffron gate (Route 7).
      if (drink) for (const k of Object.keys(act)) {
        const a = act[k], to = String((a.kind === 'edge' ? (a.to || '') : '') || k);
        const fl = m => m === 'CELADON_MART_ROOF' ? 6 : +((/CELADON_MART_([1-5])F/.exec(m) || [])[1] || 0);
        if (/CELADON_MART_(ROOF|[2-5]F)$/.test(st.map) && a.kind === 'warp' && /ELEVATOR/.test(k)) opts[k] += ' (elevator: NOT the way, it only returns us to this floor; take the STAIRS down)';
        else if (/CELADON_MART_(ROOF|[2-5]F)$/.test(st.map) && a.kind === 'warp' && fl(k.replace(/^door:/, '').split('@')[0]) && fl(k.replace(/^door:/, '').split('@')[0]) < fl(st.map)) opts[k] += ' (THE WAY FORWARD: DRINK BOUGHT, stairs DOWN toward 1F and out to Celadon City, then east to Route 7 and the Saffron gate)';
        // The street doors (y=7) are "previous map" warps; the bot labels them with the last map visited (2F/ELEVATOR). Name them.
        else if (st.map === 'CELADON_MART_1F' && a.kind === 'warp' && (/CELADON_CITY/.test(k) || (a.at && a.at.y >= 6))) opts[k] += ' (THIS IS THE STREET EXIT to CELADON CITY. THE WAY FORWARD: DRINK BOUGHT, leave the Mart, then east to Route 7 -> Saffron gate)';
        else if (st.map === 'CELADON_MART_1F' && a.kind === 'warp') opts[k] += ' (NOT the way: back up into the store; leave by the street exit at the bottom instead)';
        else if (st.map === 'CELADON_CITY' && a.kind === 'edge' && /east/.test(k)) opts[k] += ' (THE WAY FORWARD: east to Route 7, its gate leads into SAFFRON CITY; we HAVE a drink for the guard)';
        else if (a.kind === 'warp' && /ROUTE_[5-8]_GATE/.test(k)) opts[k] += ' (THE WAY FORWARD: Saffron gate; we HAVE a drink, the guard will take it and let us through into SAFFRON CITY)';
        else if (/ROUTE_[5-8]_GATE/.test(st.map) && a.kind === 'warp' && a.at) {
          // Gate exits are "previous map" warps (labelled with the last map). Saffron is EAST of Route 7, WEST of Route 8, SOUTH of Route 5, NORTH of Route 6.
          const gw = (gridX().width || 10), gh = (gridX().height || 8), side = st.map === 'ROUTE_7_GATE' ? (a.at.x >= gw / 2) : st.map === 'ROUTE_8_GATE' ? (a.at.x < gw / 2) : st.map === 'ROUTE_5_GATE' ? (a.at.y >= gh / 2) : (a.at.y < gh / 2);
          opts[k] += side ? ' (THIS EXIT LEADS INTO SAFFRON CITY: THE WAY FORWARD, the guard lets us through now)' : ' (this exit leads BACK out to the route, away from Saffron)';
        }
      }
      if (/ROUTE_18_GATE/.test(st.map)) for (const k of Object.keys(act)) if (act[k].kind === 'warp' && act[k].at && act[k].at.x >= 5 && !/2F|1F/.test(k)) opts[k] += ' (probably the EAST exit: toward Fuchsia / Saffron road)';
    }
  } catch (e) {}
  // Seafoam per-tile facts: must run at ANY badge count (they sat inside the badge-5 block above and never ran with 6 badges).
  try {
    // Session 20260927-140511: Seafoam 1F exits all resolve to ROUTE_20; which side they lead to depends on the tile (from the dumps).
    if (surfOK && st.map === 'SEAFOAM_ISLANDS_1F') for (const k of Object.keys(act)) {
      const a = act[k]; if (a.kind !== 'warp' || !a.at) continue;
      if (a.at.y >= 16 && a.at.x <= 5) opts[k] += ' (WAY OUT of Seafoam: back to the EAST side of Route 20 -> Route 19 -> Fuchsia, then surf WEST along the bottom rows (y 14-16) of Route 20 to Cinnabar; the way through Seafoam is blocked by currents on B3F/B4F)';
      else if (a.at.y >= 16 && a.at.x >= 26) opts[k] += ' (THE WAY FORWARD: exit to the SOUTH-WEST side of Route 20, open sea west to CINNABAR)';
    }
    // Session 20260927-142011: the no-STRENGTH way through Seafoam, from ROM warps + grid dumps (FACT, see NOTES): B1F's west and
    // east halves join at (21,4)-(21,5), so B1F ladder (25,11) is walkable from both 1F ladders' landings; it goes to B2F (25,11),
    // and stepping straight back on lands in B1F's walled-off SOUTH-EAST pocket (x21-27 y12-17), whose ladder (23,15) goes up to
    // 1F (23,15) beside the exit (26,17) -> Route 20 west sea -> Cinnabar. Generic floor facts replaced by per-tile ones.
    if (surfOK && /^SEAFOAM_ISLANDS_(1F|B1F|B2F|B3F|B4F)$/.test(st.map)) { let g0 = null; try { g0 = gridX(); } catch (e) {}
      const canReach = (x, y) => !!g0 && ((g0.player.x === x && g0.player.y === y) || !!pathDir(g0, x, y));
      const pocket = st.map === 'SEAFOAM_ISLANDS_B1F' && canReach(23, 15);
      for (const k of Object.keys(act)) { const a = act[k]; if (a.kind !== 'warp' || !a.at) continue;
        const at = `${a.at.x},${a.at.y}`; let note = '';
        if (st.map === 'SEAFOAM_ISLANDS_1F' && /B1F/.test(k)) note = at === '23,15' ? 'BACKWARDS: down into the B1F room we came up from; the exit to Cinnabar (26,17) is right here on this floor' : at === '25,3' ? 'DEAD END: lands in a small closed B1F pocket whose only exit is this same ladder back up' : 'NOT the way: deeper into Seafoam; the route through (B3F/B4F) is blocked by currents without STRENGTH. Leave by the 1F exit at the south-west (x<=5) instead';
        else if (st.map === 'SEAFOAM_ISLANDS_B1F') {
          if (at === '23,15') note = 'THE WAY FORWARD: up to 1F (23,15), right next to the exit (26,17) to the west sea and CINNABAR';
          else if (at === '25,11') note = pocket ? 'BACKWARDS: down to B2F again; we are in the right room, take ladder (23,15) up instead' : 'walled off from here (only reachable by coming UP from B2F (25,11))';
          else if (/B2F/.test(k)) note = at === '4,2' ? 'NOT the way: lands in B2F top-left, cut off by a rock ledge from B2F ladder (5,13)' : 'NOT the way: deeper into Seafoam (blocked by currents on B3F/B4F); go UP and out instead';
          else note = 'WAY OUT: up to 1F near the Route 20 entrance; Seafoam is blocked deeper down, leave to Route 20 and surf west along its bottom rows to Cinnabar';
        } else if (st.map === 'SEAFOAM_ISLANDS_B2F') {
          if (at === '25,11') note = 'THE WAY FORWARD (last step down here): up to B1F (25,11) = the walled-off SOUTH-EAST room with ladder (23,15) up to the 1F exit to Cinnabar';
          else if (at === '5,13') note = 'NOT the way: down to B3F, where the crossing to ladder (25,14) is blocked (No SURFing / currents); go UP and out instead';
          else if (/B1F/.test(k)) note = 'WAY OUT: up to B1F, then up to 1F and out to Route 20 (Seafoam is blocked deeper down; then surf west along the bottom of Route 20 to Cinnabar)';
          else note = 'down to B3F east part: only useful to come back up; the goal on this floor is ladder (25,11)';
        } else if (st.map === 'SEAFOAM_ISLANDS_B3F') {
          if (at === '25,14') note = 'THE WAY FORWARD (step 4): up to B2F south-east room, which has ladder (25,11) up to B1F south-east room -> (23,15) -> 1F exit to Cinnabar';
          else if (at === '25,3') note = 'NOT the way: lands in B2F north-east corner, cut off by a rock ledge from ladder (25,11); use (25,14)';
          else if (at === '5,12') note = canReach(25, 14) ? 'up to B2F west side (way out of Seafoam if (25,14) fails)' : 'WAY OUT: ladder (25,14) is NOT reachable from here (water blocked); go up to B2F, B1F, 1F and out, then PALLET TOWN -> Route 21 -> Cinnabar';
          else note = 'down to B4F: DEAD END (live run 154059: B4F water says "The current is much too fast!" - impassable without STRENGTH boulders)';
        } else if (st.map === 'SEAFOAM_ISLANDS_B4F') {
          // Session 20260927-144511: live run 154059 stuck on B4F: SURF refused ("The current is much too fast!", "No SURFing here").
          note = 'WAY OUT: up a floor. B4F is a dead end (currents too fast to surf without STRENGTH boulder puzzle); leave Seafoam and reach CINNABAR by surfing west along the bottom of Route 20';
        }
        if (note) opts[k] = opts[k].replace(/ ?\[[^\]]*\]/, '') + ` [${note}]`;
      } }
  } catch (e) { log(`seafoam facts ${e}`); }
  // indoors (no map edges): people can be talked to (e.g. Prof. Oak for the parcel)
  // Only offer what can actually be done: ladders in another (walled-off) section of the floor can't be walked to
  // (live run 234334: Jev kept picking B1F exit (27,3) / (17,11) from section A; every goWarp failed).
  const unreach = Object.keys(act).filter(id => act[id].kind === 'warp' && !act[id].reach);
  if (unreach.length && unreach.length < Object.keys(act).length && /MT_MOON|ROCK_TUNNEL/.test(st.map)) for (const id of unreach) { delete act[id]; delete opts[id]; }
  const objs = (() => { try { const m = rom.mapByName(st.map) || {}; return m.objects || m.npcs || []; } catch (e) { return []; } })();
  // Session 20260927-034224: GAME_CORNER has ~11 people; the poster ROCKET grunt (9,5) was cut off by slice(0,6) (live run 043313).
  // Trainers go first so they are always offered.
  const npcList = (g.npcs || []).map((n, i) => ({ n, i })).sort((a, b) => { const ta = objs[(a.n.index || 0) - 1], tb = objs[(b.n.index || 0) - 1]; return ((tb && tb.trainer) ? 1 : 0) - ((ta && ta.trainer) ? 1 : 0); });
  if (!(g.exits || []).length) npcList.slice(0, /MT_MOON|_GYM$|GAME_CORNER|ROCKET_HIDEOUT|SILPH_CO/.test(st.map) ? 12 : 6).forEach(({ n, i }) => {
    const nm = n.name || n.sprite || n.id || `person ${i}`, id = `talk:${i}`, tk = `${st.map}|${nm}`;
    const o = objs[(n.index || 0) - 1];
    let what = '';
    if (o) {
      if (o.sprite === 62) what = nerdBeaten() ? ' [a FOSSIL on the ground: the SUPER NERD is ALREADY BEATEN, so TAKE THIS FOSSIL NOW (talk + YES): the fossils are what blocks the passage north to the exit ladder (5,7)]' : ' [a FOSSIL on the ground: after beating the fossil-guarding SUPER NERD, take ONE fossil (talk + YES); the fossils block the passage north]';
      else if (o.item != null) { let iname = `item ${o.item}`; try { const it = rom.items[o.item]; if (it) iname = typeof it === 'string' ? it : (it.name || iname); } catch (e) {} what = ` [item ball on the ground: ${iname}; talk to pick it up]`; if (/SILPH SCOPE/i.test(iname)) what += ' [THE WAY FORWARD: the SILPH SCOPE (Giovanni drops it when beaten); needed to see the ghosts in Pokemon Tower. PICK IT UP]'; if (/CARD KEY/i.test(iname)) { cardKeyOffers = (cardKeyOffers || 0) + 1; what += ' [THE WAY FORWARD: the CARD KEY opens every locked door in Silph Co. PICK IT UP NOW]' + (cardKeyOffers > 2 ? ` (offered ${cardKeyOffers - 1}x before and still NOT in the bag: the direct walk may be blocked; if picking it keeps failing, try a door/teleport pad that lands closer to it, or another floor first)` : ''); } if (/LIFT KEY/i.test(iname)) what += ' [THE WAY FORWARD: the LIFT KEY the beaten grunt dropped; it runs the hideout ELEVATOR, the only way to Giovanni (Silph Scope). PICK IT UP NOW]'; }
      else if (o.trainer) what = ` [TRAINER${o.trainerClass ? ` ${o.trainerClass}` : ''}: talking starts a battle; beating trainers standing in a corridor clears the way${/NERD/i.test(o.trainerClass || '') && st.map === 'MT_MOON_B2F' ? `; ${nerdBeaten() ? 'this SUPER NERD is ALREADY BEATEN: talking again does nothing; take a fossil instead' : 'this SUPER NERD guards the fossils that block the way to the exit ladder'}` : ''}]`;
      else what = ' [person]';
      if (st.map === 'GAME_CORNER' && o.trainer && /ROCKET/i.test(o.trainerClass || '')) what += ` [THE WAY FORWARD: the ROCKET grunt guarding the POSTER that hides the hideout switch; beat him (talk), then press the poster${(talked[`${st.map}|${n.name || n.sprite || n.id || `person ${i}`}`] || 0) >= 1 ? '; ALREADY talked to him: probably beaten, now press the POSTER' : ''}]`;
    }
    const isLeader = o && o.trainerClass ? /BROCK|MISTY|SURGE|ERIKA|KOGA|SABRINA|BLAINE|GIOVANNI/i.test(o.trainerClass) : (n.index === 1 || n.y <= 2);
    const GYMBIT = { PEWTER_GYM: 1, CERULEAN_GYM: 2, VERMILION_GYM: 4, CELADON_GYM: 8, FUCHSIA_GYM: 16, SAFFRON_GYM: 32, CINNABAR_GYM: 64, VIRIDIAN_GYM: 128 };
    const gym = /_GYM$/.test(st.map) ? (isLeader && GYMBIT[st.map] && (st.badgeBits & GYMBIT[st.map]) ? ' [GYM LEADER ALREADY BEATEN: this gym\'s badge is WON; talking again does nothing; leave the gym]' : isLeader ? ` [THE WAY FORWARD: the GYM LEADER at the back of the gym; beat him for the badge. Our party HP now ${(() => { try { const pp = party(); return pp.map(m => `${m.species} ${m.hp}/${m.maxHp}${m.status ? ' ' + m.status : ''}`).join(', '); } catch (e) { return '?'; } })()}: challenge him only near full HP (losing = blackout to the last Pokemon Center, half our money)${leaderPpFact()}]` : (o && !o.trainer) || (!o && n.y >= g.height - 4) ? ' [not a trainer (gym guide / person): gives advice only]' : (talked[tk] || 0) >= 1 ? ' [gym trainer we ALREADY talked to: most likely ALREADY BEATEN, talking again gives no battle or EXP; go for the leader instead]' : ' [gym trainer: battle for EXP on the way to the leader]') : '';
    act[id] = { kind: 'talk', npc: n, tk };
    opts[id] = `Talk to ${nm} at (${n.x},${n.y})${gym}${what}${st.map === 'SAFFRON_GYM' && !isLeader ? ` (${Math.abs(n.x - 9) + Math.abs(n.y - 8)} tiles from SABRINA at (9,8); only the leader gives the badge)` : ''}; ${Math.abs(n.x - st.x) + Math.abs(n.y - st.y)} tiles away; talked to ${talked[tk] || 0} times already${((talkedAt[`${st.map}|${n.x},${n.y}`] || 0) >= 2 || (talked[tk] || 0) >= 3) ? ' (NOTHING NEW: talking again only repeats the same line; it will not move out of the way or give anything; pick something else)' : ''}${saidBy[tk] ? `; last time it SAID: "${saidBy[tk]}"${st.map === 'MR_FUJIS_HOUSE' && !checkFlute() && !/FLUTE|FUJI/i.test(saidBy[tk]) ? ' (NOT Mr. Fuji: try someone else)' : ''}` : (st.map === 'MR_FUJIS_HOUSE' && !checkFlute() ? ' (NOT talked to yet: could be Mr. Fuji)' : '')}${talkMiss[`${st.map}|${n.x},${n.y}`] ? `; earlier walks to it NEVER arrived ${talkMiss[`${st.map}|${n.x},${n.y}`]}x in total (path likely blocked from this side: a locked door/wall; try another door/teleport pad first)` : ''}${destFail[`${rk(st.map)}|${id}`] ? `; FAILED ${destFail[`${rk(st.map)}|${id}`]}x (could not reach)` : ''}.`;
    try { if (padDests(st.map)) { const hops = padRoute(g, npcSides(g, n)); if (hops && hops.length) opts[id] += ` [walled off from here, but REACHABLE through ${hops.length} teleport pad(s) (${hops.map(h => `${h.x},${h.y}`).join(' > ')}): picking this option makes the bot ride that pad chain automatically and then talk]`; else if (!hops) opts[id] += ' [NOT reachable from here even via teleport pads]'; } } catch (e) {}
  });
  // Session 20260927-061226: outdoors no talk options existed, so a blocker named by a door fact (SNORLAX at (10,62) on ROUTE_12,
  // live run 070821) could never be picked. Offer a talk option for each person/object that a door/edge fact says blocks the path.
  if ((g.exits || []).length) try {
    const txt = Object.values(opts).join(' ');
    (g.npcs || []).forEach((n, i) => {
      if (!txt.includes(`person/object at (${n.x},${n.y})`)) return;
      const nm = n.name || n.sprite || n.id || `person ${i}`, id = `talk:${i}`, tk = `${st.map}|${nm}`;
      const snor = /ROUTE_1[26]/.test(st.map) && !(st.x === n.x && st.y === n.y);
      act[id] = { kind: 'talk', npc: n, tk };
      opts[id] = `Talk to ${nm} at (${n.x},${n.y}); it BLOCKS the only path to a door further on${snor ? ' [probably the sleeping SNORLAX: talk, the bot then plays the POKE FLUTE and it wakes up to fight; THE WAY FORWARD south]' : ''}; ${Math.abs(n.x - st.x) + Math.abs(n.y - st.y)} tiles away; talked to ${talked[tk] || 0} times already${((talkedAt[`${st.map}|${n.x},${n.y}`] || 0) >= 2 || (talked[tk] || 0) >= 3) ? ' (NOTHING NEW: talking again only repeats the same line; it will not move out of the way or give anything; pick something else)' : ''}${saidBy[tk] ? `; last time it SAID: "${saidBy[tk]}"` : ''}${destFail[`${rk(st.map)}|${id}`] ? `; FAILED ${destFail[`${rk(st.map)}|${id}`]}x (could not reach)` : ''}.`;
    });
  } catch (e) { log(`blocker talk ${e}`); }
  if (st.map === 'VERMILION_GYM' && !gymEv('EVENT_2ND_LOCK_OPENED')) {
    const e1 = gymEv('EVENT_1ST_LOCK_OPENED');
    act['search:trash'] = { kind: 'trash' };
    opts['search:trash'] = `Search the gym's TRASH CANS for LT.SURGE's two hidden door switches (an electric door blocks the way to LT.SURGE until both locks are open; the 2nd switch is in a can right next to the 1st, a wrong 2nd guess resets both); ${e1 ? `the 1st lock is ALREADY OPEN (switch in can ${trash.first != null ? trash.first : '?'}), now check its neighbours` : 'no lock opened yet'}; ${trash.n} cans checked so far.`;
  }
  // Session 20260927-163012: POKEMON MANSION secret-switch statues (ROM hidden objects, fn Mansion*Script_Switches, face UP from the
  // tile below). Each press toggles EVENT_MANSION_SWITCH_ON, which swaps which doors are open on EVERY floor; the SECRET KEY is on B1F.
  if (mansionPress.just && mansionPress.just !== st.map) mansionPress.just = null;
  if (mansionPress.last && /POKEMON_MANSION/.test(st.map) && !mansionPress.last.since.includes(st.map) && st.map !== mansionPress.last.map) mansionPress.last.since.push(st.map);
  // Test 163316: with the switch always offered, Jev re-pressed it ~20x in a row (toggle ON/OFF/ON...). After a press, hide the
  // switches until we have left this floor, so the new doors get explored first.
  // Session 20260927-171013: live run 180554 had SECRET KEY on B1F but only 'talk:1' was offered (13 repeats): no door reachable and
  // the B1F switch hidden after a press. If no exit is reachable here, offer the switches again so Jev can reopen a way out.
  // Session 20260927-171513: live run 181114: door:POKEMON_MANSION_1F was listed (unwalkable) and Jev picked it ~20x, goWarp failing
  // every time, so noExit never fired. Count an exit only if it is walkable and has not failed twice from here.
  const noExit = /POKEMON_MANSION/.test(st.map) && !Object.keys(opts).some(k => /^(door|exit|warp|edge)/.test(k) && !/NO walking path/.test(opts[k]) && (destFail[`${rk(st.map)}|${k}`] || 0) < 2);
  // Session 20260927-174013: live run 183633 in CINNABAR_GYM: Jev only saw people/doors (quiz machines are ROM hidden objects), so it
  // re-talked to beaten trainers and the gym guide. Offer each reachable quiz machine (face UP from the tile below) as an option.
  if (st.map === 'CINNABAR_GYM') try {
    const g = gridX();
    CINNABAR_QUIZ.forEach(([qx, qy], i) => {
      const reach = (g.player.x === qx && g.player.y === qy + 1) || !!pathDir(g, qx, qy + 1);
      if (!reach) return;
      const id = `quiz:${i}`, n = quizUsed[id] || 0;
      // Session 20260927-175013: live run 184109 re-used all 6 machines (2 quiz prompts total) while BLAINE stayed sealed;
      // drop exhausted machines so Jev picks the gym's remaining trainers (beating one also opens a door).
      if (n >= 3) return;
      act[id] = { kind: 'quiz', x: qx, y: qy };
      opts[id] = `Answer QUIZ MACHINE ${i + 1} at (${qx},${qy}) (reachable now, ${Math.abs(g.player.x - qx) + Math.abs(g.player.y - qy)} tiles away): a right answer OPENS the next locked door toward BLAINE and skips that room's trainer; a wrong answer only starts a trainer battle. Used ${n} time(s) already${n >= 2 ? ' (ALREADY DONE: its door should be open, go through it / to the next machine)' : ''}.`;
    });
  } catch (e) { log('quiz opts err ' + e); }
  if (MANSION_SW[st.map] && (mansionPress.just !== st.map || noExit)) try {
    const g = gridX(), on = gymEv('EVENT_MANSION_SWITCH_ON');
    MANSION_SW[st.map].forEach(([sx, sy], i) => {
      const reach = (g.player.x === sx && g.player.y === sy + 1) || !!pathDir(g, sx, sy + 1);
      if (!reach) return;
      const id = `switch:${i}`, n = mansionPress[`${st.map}|${i}`] || 0;
      act[id] = { kind: 'mswitch', x: sx, y: sy };
      // Session 20260927-170013: 1F grid dump showed the B1F stairs (21,23) walled off from the main 1F area in the current state.
      const b1 = act['door:POKEMON_MANSION_B1F'];
      const exitFact = noExit ? ` NO exit/stairs off this floor is walkable right now (all walled off), so pressing a switch is the only way to reopen a path${(() => { try { return bag().some(i => /SECRET KEY/i.test(String(i.name || ''))); } catch (e) { return false; } })() ? ' back up to 1F and out to Cinnabar (the SECRET KEY is already in the bag)' : ''}.` : '';
      const b1Fact = exitFact + (st.map === 'POKEMON_MANSION_1F' && b1 && !pathDir(g, 21, 23) ? ` IMPORTANT: the stairs down to B1F (the way forward) at (21,23) are NOT walkable from here right now (walled off by the switch doors); pressing THIS 1F switch toggles those 1F walls and is how to open the path to the B1F stairs.` : '');
      opts[id] = `Press the SECRET SWITCH statue at (${sx},${sy}) (walkable from here, ${Math.abs(sx - st.x) + Math.abs(sy + 1 - st.y)} tiles away).${b1Fact} Pressing it toggles which doors are open on ALL mansion floors (switch is now ${on ? 'ON' : 'OFF'}), so it opens new paths to stairs/rooms that are closed off now; the SECRET KEY for Blaine's gym is on B1F. Pressed ${n}x here so far (${mansionPress.total} presses in total).${mansionPress.last ? ` The switch state is SHARED by all floors: the LAST press was on ${mansionPress.last.map.replace('POKEMON_MANSION_', '')} (set it ${mansionPress.last.on ? 'ON' : 'OFF'})${mansionPress.last.since.length ? `, floors visited since then: ${mansionPress.last.since.map(m => m.replace('POKEMON_MANSION_', '')).join(', ')}` : ''}. Pressing again now sets it back ${mansionPress.last.on ? 'OFF' : 'ON'} and RE-CLOSES the doors that press opened; only press if the current doors on this floor leave no unexplored way to the B1F stairs.` : ''}`;
    });
  } catch (e) { log(`mansion switch opts ${e}`); }
  // Session 20260927-164013: 3F floor holes (pokered PokemonMansion3F hole coords (16,14),(17,14) -> 1F, (19,14) -> 2F). The 1F B1F
  // stairs sit in a section cut off by switch doors; falling through a 3F hole is the classic way down into it. Jev picks.
  // Session 20260927-165013: dump each Mansion floor's walk grid once per run (with switch state + position) so the next session can
  // see where the switch doors / holes / B1F stairs are and which are reachable.
  if (/^POKEMON_MANSION/.test(st.map)) try {
    if (!MANSION_DUMPED.has(st.map)) {
      MANSION_DUMPED.add(st.map); const g0 = gridX();
      log(`MANSION GRID ${st.map} at (${st.x},${st.y}) switchLast=${JSON.stringify((typeof mansionPress !== 'undefined' && mansionPress.last) || null)}`);
      // Session 20260927-165513: log lines are truncated (~500 chars), so dump the grid in chunks of 8 rows.
      const rows0 = (g0 && g0.rows) || [];
      for (let y0 = 0; y0 < rows0.length; y0 += 8) log(`MGRID ${st.map} rows ${y0}+\n` + rows0.slice(y0, y0 + 8).map((r, k) => `${String(y0 + k).padStart(2)} ${r}`).join('\n'));
    }
  } catch (e) { log(`mansion dump ${e}`); }
  if (st.map === 'POKEMON_MANSION_3F') try {
    const g = gridX();
    [[16, 14, '1F'], [19, 14, '2F']].forEach(([hx, hy, to], i) => {
      // Session 20260927-164513: the hole tile itself may read as a wall in grid(); also accept a reachable neighbour and step in.
      const nb = [[hx, hy + 1, 'UP'], [hx - 1, hy, 'RIGHT'], [hx + 1, hy, 'LEFT'], [hx, hy - 1, 'DOWN']]
        .find(([nx, ny]) => (st.x === nx && st.y === ny) || !!pathDir(g, nx, ny));
      if (!pathDir(g, hx, hy) && !(st.x === hx && st.y === hy) && !nb) return;
      const id = `hole:${i}`, f = destFail[`${rk(st.map)}|${id}`] || 0;
      act[id] = { kind: 'mhole', x: hx, y: hy, nb };
      opts[id] = `Jump into the HOLE in the floor at (${hx},${hy}) (${Math.abs(hx - st.x) + Math.abs(hy - st.y)} tiles away): falls down to ${to}${to === '1F' ? ", landing in the part of 1F that is walled off by the switch doors and holds the STAIRS DOWN TO B1F (SECRET KEY); likely THE WAY FORWARD to B1F" : ' (not the B1F stairs section)'}${f ? `; FAILED ${f}x` : ''}.`;
    });
  } catch (e) { log(`mansion hole opts ${e}`); }
  // Session 20260927-091728: the Celadon Mart ROOF vending machines are background tiles (rom signs), not NPCs, so Jev had no way to
  // use them (test: roof <-> 5F bounce). Offer them as an option; vendDrink() walks next to one, faces it, A, picks the first item.
  // Test 3 (this session): Jev talked to the thirsty roof girl while holding FRESH WATER; she took it (gave TM13) -> drink gone, bag full.
  if (st.map === 'CELADON_MART_ROOF' && hasDrink()) for (const k of Object.keys(opts)) if (/^talk:/.test(k)) opts[k] += ' (WARNING: the thirsty girl here TAKES our drink in exchange for a TM; we need the drink for the Saffron gate guard, so do NOT talk to people here now; go downstairs)';
  if (st.map === 'CELADON_MART_ROOF' && !hasDrink() && !guardsOk()) try {
    const drinkN = bag().filter(i => /FRESH WATER|SODA POP|LEMONADE/i.test(i.name || '')).length;
    act['vend:drink'] = { kind: 'vend' };
    opts['vend:drink'] = `Use a VENDING MACHINE on the roof (walk up to it, face it, press A) and buy FRESH WATER for 200 money (we have ${st.money}); the Saffron gate guards let us through once we have a drink; drinks in bag now: ${drinkN}; tried ${vendTries} times already${destFail[`${rk(st.map)}|vend:drink`] ? `; FAILED ${destFail[`${rk(st.map)}|vend:drink`]}x` : ''}.`;
  } catch (e) { log(`vend opt ${e}`); }
  // Session 20260927-033724: the Rocket hideout switch is behind the poster on the Game Corner back wall (9,4); stand at (9,5), face UP, A.
  if (st.map === 'GAME_CORNER' && (st.badges || 0) >= 4) {
    act['switch:poster'] = { kind: 'poster' };
    opts['switch:poster'] = `Walk to the POSTER on the back wall (9,4), face it and press A: it hides the switch that opens the stairs to the ROCKET HIDEOUT. The Rocket grunt standing in front of it must be beaten first (talk to him). Pressed ${posterTries} time(s) so far${posterTries ? ' (no stairs appeared yet)' : ''}.`;
  }
  if (st.map === 'OAKS_LAB') {
    let oak = { x: 5, y: 2 };
    try { const rn = ((rom.mapByName('OAKS_LAB') || {}).npcs || []).find(n => /OAK/i.test(JSON.stringify(n))); if (rn && rn.x != null) oak = { x: rn.x, y: rn.y }; } catch (e) {}
    const tk = 'OAKS_LAB|PROF_OAK';
    act['talk:oak'] = { kind: 'talk', npc: oak, tk };
    opts['talk:oak'] = `Talk to PROF. OAK at (${oak.x},${oak.y}) (he stands at the top of the lab; he takes OAK's PARCEL and gives the POKEDEX); talked to ${talked[tk] || 0} times already${destFail[`${rk(st.map)}|talk:oak`] ? `; FAILED ${destFail[`${rk(st.map)}|talk:oak`]}x` : ''}.`;
  }
  return { opts, act };
}
// Session 20260927-040725: hideout elevator. Panel is the sign at (1,1); stand on (2,1) facing LEFT, press A, a floor list
// (B1F, B2F, B4F) opens. Jev picks the floor; code works the menu, then walks out through the door warp. Mechanics only.
const elevator = { rides: 0, floor: null, asked: null };
// Session 20260927-103730: Silph Co. elevator (put off 5+ sessions; live bot looped 11F<->elevator). Panel is the sign at (3,0):
// stand on (3,1) facing UP, press A, a scrolling list 1F..11F opens (cursor at top). Jev picks the floor; code works the menu.
const silpEl = { asked: null, floor: null, done: null, fails: 0 };
function silphElevatorStep(st) {
  const key = `${hasCardKey()}|${silphDone()}|${st.storyEvents}|${prevMap}|${Math.min(3, noGain[prevMap] || 0)}`;
  if (silpEl.asked !== key) {
    silpEl.asked = key; const fl = {};
    for (let i = 1; i <= 11; i++) { const m = `SILPH_CO_${i}F`; fl[`${i}F`] = `${i}F` + (i === 1 ? ': ground floor, exit to Saffron City (Pokemon Center to heal)' : i === 5 ? ': the CARD KEY item ball lies on this floor' + (hasCardKey() ? ' (already in the bag)' : ' (NOT in the bag yet)' + (!hasCardKey() && (noGain.SILPH_CO_5F || 0) >= 1 ? '; BUT from the elevator/stairs side the key corridor (row 16) was unreachable (walled off, column 28 blocked at 28,4): the key area is probably entered via a teleport pad from another floor (e.g. 3F/4F/9F pads) instead' : '')) : (i === 3 || i === 4 || i === 9) && !hasCardKey() ? ': has teleport pads/stairs that may lead into the otherwise walled-off 5F CARD KEY corridor' : i === 11 ? ': president\'s floor; GIOVANNI is behind a locked door (needs the CARD KEY)' : '') + (m === prevMap ? '; the floor we just came from' : '') + (noGain[m] ? `; ${noGain[m]} earlier visit(s) gave NO story progress` : ''); }
    // Session 20260927-113731: live 123327 rode elevator<->11F 19x (Jev picked 11F both times). Floors that already gave NO progress
    // 3+ times are dropped from the options (tried and failed), so Jev chooses among the rest.
    if (hasCardKey()) for (let i = 2; i <= 11; i++) if ((noGain[`SILPH_CO_${i}F`] || 0) >= (`SILPH_CO_${i}F` === prevMap ? 1 : 3) && Object.keys(fl).length > 2) { delete fl[`${i}F`]; log(`silph elevator: dropped ${i}F (no progress ${noGain[`SILPH_CO_${i}F`]}x)`); }
    // 11F from the elevator is a proven dead end with the key (live runs rode elevator<->11F 40+ times, Jev kept picking it): drop it.
    if (hasCardKey() && silph7Blocked && !silphDone() && fl['11F'] && Object.keys(fl).length > 2) { delete fl['11F']; log('silph elevator: dropped 11F (elevator side is a dead end; route is 3F pad -> 7F west room -> 11F)'); }
    silpEl.floor = askChoice({ goal: hasCardKey() ? 'In Silph Co. WITH the CARD KEY: reach GIOVANNI on 11F (locked doors open now)' : 'In Silph Co. WITHOUT the CARD KEY: it lies on 5F; then Giovanni on 11F', map: st.map, cameFrom: prevMap || '?', cardKey: hasCardKey() ? 'in bag' : 'not in bag' },
      'The Silph Co. elevator panel lists floors 1F-11F. Which floor should the elevator go to?', silphElFacts(fl), silphDone() ? '1F' : hasCardKey() ? (silph7Blocked ? '3F' : '7F') : '5F') || '5F';
    silpEl.done = null;
  }
  const idx = Math.max(0, Math.min(10, parseInt(silpEl.floor, 10) - 1));
  if (silpEl.done !== silpEl.floor) {
    if (!walkTo(3, 1, 20)) log(`silph elevator: could not reach 3,1 (at ${gstate().x},${gstate().y})`);
    if (gstate().map !== st.map) return true;
    let s = screen();
    for (let t = 0; t < 4 && !/11F|Which floor/.test((s.rows || []).join('|')); t++) {
      wait(24); hold('UP', 6); wait(12); press('A', 4, 10);
      for (let k = 0; k < 25; k++) { s = screen(); const j = (s.rows || []).join('|'); if (/\dF/.test(j)) break; if (s.waitingForA) press('A', 4, 8); else wait(10); }
      s = screen();
    }
    log(`silph elevator menu: ${JSON.stringify((s.rows || []).filter(r => /[A-Z]/.test(r)))} -> ${silpEl.floor}`);
    wait(30);
    for (let k = 0; k < idx; k++) { press('DOWN', 6, 14); wait(6); }
    press('A', 4, 30);
    for (let k = 0; k < 20; k++) { const s2 = screen(); if (!(s2.hasTextBox || s2.waitingForA)) break; press('A', 4, 16); }
    wait(60); silpEl.done = silpEl.floor;
  }
  const m0 = gstate().map;
  walkTo(2, 2, 10); hold('DOWN', 16); wait(30);
  if (gstate().map === m0) goWarp('SILPH_CO');
  if (gstate().map === m0 && ++silpEl.fails % 3 === 0) silpEl.done = null;
  log(`silph elevator: exit -> ${gstate().map} ${gstate().x},${gstate().y}`);
  return true;
}
function elevatorStep(st) {
  if (st.map === 'SILPH_CO_ELEVATOR') return silphElevatorStep(st);
  if (st.map !== 'ROCKET_HIDEOUT_ELEVATOR') return false;
  const key = `${checkLiftKey()}|${elevator.rides}|${pendingHeal}|${checkScope()}`;
  if (elevator.asked !== key) {
    elevator.asked = key; elevator.floor = 'B4F';
    elevator.floor = askChoice({ goal: 'Become Champion; now in the Team Rocket hideout under the Celadon Game Corner to beat GIOVANNI and get the SILPH SCOPE', map: st.map, liftKeyInBag: checkLiftKey() ? 'yes' : 'no', cameFrom: prevMap || '?', ridesSoFar: elevator.rides, silphScopeInBag: checkScope() ? 'YES: Giovanni is beaten, the hideout is DONE; leave via B1F -> Game Corner, then go to Lavender Town' : 'no', headingToHeal: pendingHeal ? 'YES: we chose to heal at the Celadon Pokemon Center (B1F -> Game Corner -> Celadon)' : 'no', party: (() => { try { const pp = party(); return `HP ${Math.round(hpFrac(pp) * 100)}%, lead attack-move PP ${Math.round(ppFrac(pp) * 100)}%: ${pp.map(m => `${m.species} Lv${m.level} ${m.hp}/${m.maxHp}`).join(', ')}`; } catch (e) { return '?'; } })() },
      'The elevator panel offers these floors. Which floor should the elevator go to?', {
        B1F: 'B1F: top floor of the hideout, stairs up to the Game Corner (the way OUT: to heal, or once the SILPH SCOPE is in the bag)',
        B2F: 'B2F: the arrow-tile floor (stairs to B3F); nothing left to do there',
        B4F: "B4F: the elevator stop on GIOVANNI's side of B4F (his room, the SILPH SCOPE); the stairs side of B4F is walled off from him" }, checkScope() ? 'B1F' : 'B4F');
  }
  const idx = { B1F: 0, B2F: 1, B4F: 2 }[elevator.floor] ?? 2;
  if (elevator.rides === 0 || elevator.ridesFloor !== elevator.floor) {
    // test 20260927-041117: walkTo(2,1) stepped onto the DOOR warp (2,1) and left the elevator. The panel is faced from below.
    if (!walkTo(1, 2, 20)) { const s = gstate(); log(`elevator: could not reach 1,2 (at ${s.x},${s.y})`); }
    if (gstate().map !== 'ROCKET_HIDEOUT_ELEVATOR') return true;
    // test 20260927-041238: UP+A pressed while the step onto (1,2) was still animating -> panel never opened. Settle, retry.
    // test 20260927-041205: extra A presses landed on the floor list before it was drawn. Only poll until the list shows.
    let s = screen();
    for (let t = 0; t < 4 && !/Which floor|B4F/.test((s.rows || []).join('|')); t++) {
      wait(24); hold('UP', 6); wait(12); press('A', 4, 10);
      for (let k = 0; k < 25; k++) { s = screen(); const j = (s.rows || []).join('|'); if (/B4F/.test(j)) break; if (s.waitingForA && !/Which floor/.test(j)) press('A', 4, 8); else wait(10); }
      s = screen();
    }
    log(`elevator menu: ${JSON.stringify((s.rows || []).filter(r => /[A-Z]/.test(r)))} cursor ${JSON.stringify(s.cursor || null)}`);
    const want = (s.rows || []).findIndex(r => r.includes(elevator.floor));
    wait(30); // test 20260927-041305: DOWN presses right after the text printed were ignored
    const cy = () => { const c = screen().cursor; return c && typeof c.y === 'number' ? c.y : null; };
    if (want >= 0 && cy() !== null) {
      for (let k = 0; k < 10 && cy() !== null && cy() !== want; k++) { press(cy() < want ? 'DOWN' : 'UP', 6, 14); wait(6); }
    } else for (let k = 0; k < idx; k++) { press('DOWN', 6, 14); wait(6); }
    log(`elevator: cursor ${JSON.stringify(screen().cursor || null)} want row ${want} (${elevator.floor})`);
    if (want >= 0 && cy() !== want) log(`elevator: cursor NOT on ${elevator.floor}; rows ${JSON.stringify(screen().rows)}`);
    press('A', 4, 30);
    for (let k = 0; k < 20; k++) { const s = screen(); if (!(s.hasTextBox || s.waitingForA)) break; press('A', 4, 16); }
    wait(60);
    elevator.rides++; elevator.ridesFloor = elevator.floor;
    log(`elevator: selected ${elevator.floor}, now at ${gstate().x},${gstate().y}`);
  }
  // leave through the door: step down, then walk back up onto the warp
  const m0 = gstate().map;
  walkTo(2, 2, 10); hold('UP', 16); wait(30);
  if (gstate().map === m0) { goWarp('ROCKET_HIDEOUT'); }
  if (gstate().map === m0) { elevator.fails = (elevator.fails || 0) + 1; if (elevator.fails % 3 === 0) elevator.ridesFloor = null; }
  log(`elevator: exit -> ${gstate().map} ${gstate().x},${gstate().y}`);
  return true;
}
// Session 20260927-110730 (ROOT CAUSE of the 5F CARD KEY loop): the key (21,16) sits in 5F's row-16 corridor, which the walkable part of
// the floor never touches: (7,16) is a wall, (8,16) a Rocket, column 28 is plugged by the Juggler at (28,4). Its only entry is the
// teleport pad (9,15): arriving ON a pad (coming back from the other floor) lets you step off it into the corridor. So when no side of a
// talk target is reachable, find a warp tile on this map from which it IS reachable, step onto it, and on the other floor step off and
// back onto the arrival pad (goWarp does that) to land on it, then walk to the target. Mechanics only: Jev still picks the target.
let bounce = null;
function startBounce(g, st, a) {
  if (bounce && bounce.map === st.map && bounce.tries >= 2) return false;
  const sides = Object.values(DIRS).map(([dx, dy]) => [a.npc.x - dx, a.npc.y - dy]).filter(([x, y]) => g.rows[y] && WALK.has(g.rows[y][x]));
  for (const w of g.warps || []) {
    if (!pathDir(g, w.x, w.y)) continue;
    if (!sides.some(([x, y]) => reachable(g, w.x, w.y, x, y))) continue;
    const to = w.to || w.map || w.dest || '';
    bounce = { map: st.map, w: { x: w.x, y: w.y }, to, npc: a.npc, tk: a.tk, tries: ((bounce && bounce.map === st.map) ? bounce.tries : 0) + 1, left: false };
    log(`bounce: ${a.tk} at ${a.npc.x},${a.npc.y} unreachable; reachable from warp ${w.x},${w.y} -> ${to}; stepping on it to come straight back`);
    goWarp(to, { x: w.x, y: w.y });
    return true;
  }
  return false;
}
function bounceStep(st) {
  if (!bounce) return false;
  if (st.map !== bounce.map) {
    if (bounce.left) { log(`bounce: ended up on ${st.map}, giving up`); bounce = null; return false; }
    log(`bounce: on ${st.map} ${st.x},${st.y}, re-entering the arrival pad back to ${bounce.map}`);
    goWarp(bounce.map, { x: st.x, y: st.y });
    if (gstate().map === bounce.map) bounce.left = true;
    else if (!gstate().inBattle) { bounce.fails = (bounce.fails || 0) + 1; if (bounce.fails > 3) { log('bounce: could not re-enter the pad'); bounce = null; } }
    return true;
  }
  if (!bounce.left) return false; // still on the start map (the step onto the pad was interrupted); normal flow retries
  const b = bounce; bounce = null;
  log(`bounce: back on ${st.map} at ${st.x},${st.y}; walking to ${b.tk} at ${b.npc.x},${b.npc.y}`);
  const ok = talkTo(b.npc);
  log(`bounce: talk ${b.tk} -> ${ok} ${lastTexts.slice(-1)}`);
  if (ok) { talked[b.tk] = (talked[b.tk] || 0) + 1; destCache.clear(); } else { b.left = false; bounce = b; bounce.tries = (bounce.tries || 0) + 1; if (bounce.tries > 2) bounce = null; }
  return true;
}
// Session 20260927-112731 (DEEP, ROOT CAUSE of the Silph 7F/11F loop): with the CARD KEY, Silph's locked shutters do NOT open by walking
// into them (the old goal text was wrong). pokered PrintCardKeyText runs only on an A press while FACING a door tile: screen tile $18/$24
// (and $5e on 11F) as the bottom-left tile of the square in front. gridX() shows closed doors as '#', so the 7F pad to 11F and 11F's
// Giovanni side read "NO walking path". Mechanics: find door squares on screen (wTileMap), walk next to one on the way to the target,
// face it and press A. Jev still picks the target.
const keyDoorTried = {};
function visKeyDoors(map) {
  const out = [];
  try {
    const st = gstate(), tm = read(sym('wTileMap'), 360);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 5; dx++) {
      const col = 8 + 2 * dx, row = 9 + 2 * dy; if (col < 0 || col > 19 || row < 0 || row > 17) continue;
      const t = tm[row * 20 + col];
      if (t === 0x18 || t === 0x24 || (map === 'SILPH_CO_11F' && t === 0x5e)) out.push([st.x + dx, st.y + dy]);
    }
  } catch (e) { log(`keydoor scan ${e}`); }
  return out;
}
// cheapest route to (tx,ty) where walls/NPCs cost 25: the squares on it that are not walkable are where a door must be
function wallPath(g, tx, ty) {
  const W = g.width, H = g.height, sx = g.player.x, sy = g.player.y, dist = new Map([[`${sx},${sy}`, 0]]), prev = new Map(), q = [[0, sx, sy]];
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]); const [c, x, y] = q.shift();
    if (x === tx && y === ty) { const p = []; let k = `${x},${y}`; while (k) { p.unshift(k.split(',').map(Number)); k = prev.get(k); } return p; }
    if (c > dist.get(`${x},${y}`)) continue;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ch = g.rows[ny][nx], cost = (nx === tx && ny === ty) || WALK.has(ch) ? 1 : 25, nk = `${nx},${ny}`;
      if (dist.has(nk) && dist.get(nk) <= c + cost) continue;
      dist.set(nk, c + cost); prev.set(nk, `${x},${y}`); q.push([c + cost, nx, ny]);
    }
  }
  return null;
}
function openKeyDoor(map, d) {
  const g = gridX();
  for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
    const nx = d[0] - dx, ny = d[1] - dy; // stand here, face dir
    if (!g.rows[ny] || !WALK.has(g.rows[ny][nx])) continue;
    if (!(nx === g.player.x && ny === g.player.y) && !pathDir(g, nx, ny)) continue;
    if (!walkTo(nx, ny, 60)) { log(`keydoor: could not reach ${nx},${ny}`); continue; }
    press(dir, 4, 10); wait(6); press('A', 4, 30);
    const texts = [];
    for (let k = 0; k < 10; k++) { const s = screen(); if (!(s.hasTextBox || s.waitingForA)) break; texts.push((s.rows || []).join(' ').replace(/\s+/g, ' ').trim().slice(0, 80)); press('A', 4, 20); }
    wait(20);
    const g2 = gridX(), opened = g2.rows[d[1]] && WALK.has(g2.rows[d[1]][d[0]]);
    log(`keydoor: ${map} door ${d.join(',')} from ${nx},${ny} facing ${dir}: opened=${opened} text=${JSON.stringify(texts.slice(0, 2))}`);
    return true;
  }
  return false;
}
function keyDoorToward(st, tx, ty) {
  const map = st.map;
  for (let pass = 0; pass < 2; pass++) {
    const g = gridX(), p = wallPath(g, tx, ty);
    if (!p) return false;
    const doors = visKeyDoors(map).filter(d => (keyDoorTried[`${map}|${d.join(',')}`] || 0) < 2);
    const onPath = new Set(p.map(q => q.join(',')));
    doors.sort((a, b) => (onPath.has(b.join(',')) - onPath.has(a.join(','))) || (Math.abs(a[0] - tx) + Math.abs(a[1] - ty)) - (Math.abs(b[0] - tx) + Math.abs(b[1] - ty)));
    // Test 20260927-114640 (11F): the $5e door at (6,13) was marked tried BEFORE the walk to (6,14), a trainer interrupted the walk,
    // and the door was never offered again. Count a door as tried only once A was pressed facing it (max 2 tries).
    for (const d of doors) { const dk2 = `${map}|${d.join(',')}`; if (openKeyDoor(map, d)) { keyDoorTried[dk2] = (keyDoorTried[dk2] || 0) + 1; return true; } }
    // no usable door on screen: walk to the last walkable square before the first wall on the cheapest route, then look again
    let last = null; for (let i = 1; i < p.length; i++) { const [x, y] = p[i]; if (!WALK.has(g.rows[y][x])) break; last = p[i]; }
    if (!last || pass) { log(`keydoor: no door found toward ${tx},${ty} (${doors.length} visible)`);
      try { const t = read(sym('wTileMap'), 360), st2 = gstate(), rows = []; for (let dy = -3; dy <= 3; dy++) { const r = []; for (let dx = -3; dx <= 3; dx++) { const c = 8 + 2 * dx, rw = 9 + 2 * dy; r.push(rw >= 0 && rw < 18 && c >= 0 ? t[rw * 20 + c].toString(16) : '--'); } rows.push(r.join(' ')); }
        log(`keydoor tiles @${st2.x},${st2.y}: ${rows.join(' | ')} grid ${g.rows.slice(Math.max(0, st2.y - 3), st2.y + 4).map(r => r.slice(Math.max(0, st2.x - 3), st2.x + 4)).join(' | ')}`); } catch (e) {}
      return false; }
    log(`keydoor: walking to ${last.join(',')} (wall route toward ${tx},${ty}) to look for a locked door`);
    if (!walkTo(last[0], last[1], 80)) return false;
  }
  return false;
}
function goDest(st) {
  try { if (bounceStep(st)) return; } catch (e) { log(`bounce ${e}`); bounce = null; }
  if (destState.map !== st.map) {
    // storyEvents is often missing outdoors: compare using the last known value (lastStory, kept by stage()).
    const story = (st.storyEvents != null ? st.storyEvents : lastStory) || 0, prog = story + (st.badges || 0) * 100;
    // New story progress/badge makes old "no progress" marks stale (e.g. Viridian City after the Pokedex): reset them.
    if (prog > noGainProg) { for (const k in noGain) delete noGain[k]; noGainProg = prog; }
    if (destState.map) { prevMap = destState.map; if (destState.prog === prog) noGain[destState.map] = (noGain[destState.map] || 0) + 1; }
    // Arrived through a map edge into a sealed pocket: mark that stretch of the old map's edge as bad and step back,
    // so the next crossing (still Jev's pick) uses another edge tile. Mechanics only.
    const le = lastEdge; lastEdge = null;
    if (le && destState.map && le.map === destState.map) try {
      const ri = reachInfo(gridX(), OPP_SIDE[le.side]);
      if (ri.pocket) {
        log(`pocket: ${le.map} ${le.side} edge at ${le.b} leads into a sealed ${ri.n}-tile pocket of ${st.map} (${st.x},${st.y}); going back, avoiding it`);
        for (let d = -1; d <= 1; d++) edgeBad[`${le.map}|${le.side}|${le.a}|${le.b + d}`] = 1;
        walkEdge(OPP_SIDE[le.side]); return;
      }
    } catch (e) { log(`pocket check failed: ${e}`); }
    // Started (or reloaded) inside a pocket at a map edge: step back out through that edge; the check above then marks it.
    if (!le && !destState.map) try {
      const g = gridX(), side = st.x === 0 ? 'west' : st.x === g.width - 1 ? 'east' : st.y === 0 ? 'north' : st.y === g.height - 1 ? 'south' : null;
      if (side && (g.exits || []).some(e => e.side === side) && reachInfo(g, side).pocket) { log(`pocket: started in a sealed pocket of ${st.map}; leaving ${side}`); walkEdge(side); return; }
    } catch (e) { log(`pocket check failed: ${e}`); }
    if (/SILPH_CO_(7|11)F/.test(st.map) && !visits[st.map]) try { const g = gridX(); g.rows.forEach((r, i) => log(`row ${st.map} ${i}: ${r}`)); } catch (e) {}
    if (/MT_MOON_B/.test(st.map) && !visits[st.map]) try { const g = gridX(); log(`grid ${st.map} @${st.x},${st.y} warps ${JSON.stringify(g.warps)} blocked ${(g.blockedMoves || []).length}\n${g.rows.slice(Math.max(0, st.y - 4)).map((r, i) => `${Math.max(0, st.y - 4) + i}:${r}`).join("|")}`); } catch (e) {}
    visits[st.map] = (visits[st.map] || 0) + 1; destState = { map: st.map, pick: null, ticks: 0, story: st.storyEvents, prog };
  }
  const { opts, act } = destOptions(st);
  const ids = Object.keys(opts);
  if (!ids.length) { walkEdge('north'); return; }
  const key = `${rk(st.map)}|${healTrip ? 'H' : ''}${st.storyEvents}|${ids.map(i => `${i}:${destFail[`${rk(st.map)}|${i}`] || 0}`).join(',')}|${JSON.stringify(noGain)}|${JSON.stringify(deadEnd)}`;
  let pick = destCache.get(key);
  // Keep the current target after an interruption (wild battle, NPC list changing) instead of re-asking Jev,
  // unless it has failed since it was chosen (live run 233320: a Zubat fight made Jev switch from B2F->(5,7) to the dead-end ladder).
  if (!pick && destState.pick && act[destState.pick] && (destFail[`${rk(st.map)}|${destState.pick}`] || 0) === (destState.pickFails || 0)) pick = destState.pick;
  if (!pick) {
    const fb = ids.find(i => i === 'edge:north' && !destFail[`${rk(st.map)}|${i}`]) || ids.find(i => !destFail[`${rk(st.map)}|${i}`]) || ids[0];
    const ctx = { goal: healTrip ? `HEAL FIRST (we chose to heal on ${healTrip}: attack PP/HP are low): go to the nearest Pokemon Center; after healing: ${stage(st).goal}` : stage(st).goal,
      parcelInBag: stage(st).done ? 'no: already delivered to Oak (Pokedex received)' : st.storyEvents >= 7 ? 'probably yes: Oak\'s parcel was picked up at the Mart; now carry it SOUTH (Route 1 -> Pallet Town -> Oak\'s lab) and talk to Oak' : 'unknown', map: st.map, badges: st.badges, storyEvents: st.storyEvents, money: st.money, recentText: lastTexts.slice(-4) };
    // Drop options that already failed 3+ times from here (live run 014832: Jev kept re-picking the unreachable Mart/Gym).
    let qopts = opts;
    const okIds = Object.keys(opts).filter(i => (destFail[`${rk(st.map)}|${i}`] || 0) < 3);
    if (okIds.length >= 1 && okIds.length < Object.keys(opts).length) { qopts = {}; for (const i of okIds) qopts[i] = opts[i]; log(`dest: hid ${Object.keys(opts).length - okIds.length} option(s) failed 3+x`); }
    pick = askChoice(ctx, 'Where should the player go next on this map to make story progress? Avoid options that already FAILED.', qopts, qopts[fb] ? fb : okIds[0] || fb);
    if (!act[pick]) pick = fb;
    destCache.set(key, pick);
    log(`dest: ${st.map} -> ${pick}`);
  }
  if (destState.pick !== pick) { destState.pick = pick; destState.ticks = 0; destState.pos = null; destState.pickFails = destFail[`${rk(st.map)}|${pick}`] || 0; }
  // Only ticks where the player did not move count as "stuck" (a long walk takes many ticks but is not a failure).
  const pos = `${st.x},${st.y}`;
  if (destState.pos === pos) destState.ticks++; else { destState.pos = pos; destState.ticks = 0; }
  if (destState.ticks > 4) { // not reached after many attempts -> mark failed so Jev reconsiders
    const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; if (lastWarpTaken && !lastWarpTaken.startsWith(st.map + '|')) deadEnd[lastWarpTaken] = (deadEnd[lastWarpTaken] || 0) + 1; destState.ticks = 0; destCache.clear(); log(`dest failed: ${fk}`); wait(10);
    return;
  }
  const a = act[pick];
  if (/^SILPH_CO_\d+F$/.test(st.map) && hasCardKey() && (a.kind === 'warp' || a.kind === 'talk')) try {
    const g = gridX(); let t = null, reach = true;
    if (a.kind === 'warp') { const w = a.at || (g.warps || []).find(w => (w.to || '').includes(a.to)); if (w) { t = [w.x, w.y]; reach = !!pathDir(g, w.x, w.y) || (w.x === g.player.x && w.y === g.player.y); } }
    else if (a.npc) { t = [a.npc.x, a.npc.y]; reach = Object.values(DIRS).some(([dx, dy]) => { const x = a.npc.x - dx, y = a.npc.y - dy; return g.rows[y] && WALK.has(g.rows[y][x]) && ((x === g.player.x && y === g.player.y) || pathDir(g, x, y)); }); }
    const dk = `${st.map}|${pick}`;
    if (t && !reach && (keyDoorTried[dk] || 0) < 6) { keyDoorTried[dk] = (keyDoorTried[dk] || 0) + 1; if (keyDoorToward(st, t[0], t[1])) { destCache.clear(); destState.pos = null; return; } }
  } catch (e) { log(`keydoor ${e}`); }
  if (a.kind === 'talk') {
    let ok = talkTo(a.npc);
    if (!ok && !gstate().inBattle) { try { if (padDests(st.map) && padsToward(a.npc)) ok = gstate().inBattle || talkTo(a.npc); } catch (e) { log(`padsToward ${e}`); } }
    // Mechanics: the person is walled off by Cut trees (Erika in CELADON_GYM, live runs 031724-041803) -> cut toward them, retry.
    if (!ok && !gstate().inBattle) { try { if (cutTreeToward(a.npc.x, a.npc.y)) { log(`talk: cut a tree toward ${a.tk}`); ok = talkTo(a.npc); } } catch (e) { log(`talk cut ${e}`); } }
    if (ok) { talked[a.tk] = (talked[a.tk] || 0) + 1; talkedAt[`${st.map}|${a.npc.x},${a.npc.y}`] = (talkedAt[`${st.map}|${a.npc.x},${a.npc.y}`] || 0) + 1; try { saidBy[a.tk] = (lastTexts.slice(-1)[0] || '').slice(0, 60); } catch (e) {} destCache.clear(); log(`talked: ${a.tk} -> ${lastTexts.slice(-1)}`);
      // Session 20260927-190515: Victory Road boulders say "This requires STRENGTH to move!" -> use STRENGTH (field move) then push
      // by walking into the boulder a few times (Jev already chose to go to this boulder).
      try { if (/requires STRENGTH/i.test(lastTexts.slice(-1)[0] || '') && gstate().map !== 'VICTORY_ROAD_1F') pushBoulder(a.npc); } catch (e) { log(`pushBoulder ${e}`); }
      // Session 20260927-162012: POKEMON_MANSION_3F item ball said "No more room for items!" (bag 20/20); the SECRET KEY (Blaine's gym)
      // is an item ball in the Mansion, so make room (Jev picks what to throw away) and let the next pick retry the ball.
      try { if (roomTosses < 6 && /No more room for items/i.test(lastTexts.slice(-1).join(' ')) && !gstate().inBattle) { roomTosses++; if (tossForRoom('The bag is FULL (20 kinds of items): an item ball here could not be picked up. Items on the floor may be important (the SECRET KEY that opens the Cinnabar gym is an item ball in the Pokemon Mansion), so one item kind must be thrown away to make room.')) { talked[a.tk] = 0; destCache.clear(); } } } catch (e) { log(`roomToss ${e}`); }
      try { if (/^ROUTE_1[26]$/.test(gstate().map) && checkFlute() && !gstate().inBattle && /sleep|blocks? the way/i.test(lastTexts.slice(-3).join(' '))) useFlute(); } catch (e) {} }
    else { try { const mk = `${st.map}|${a.npc.x},${a.npc.y}`; talkMiss[mk] = (talkMiss[mk] || 0) + 1; } catch (e) {} const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1;
      // Session 20260927-105230: live 114854 re-picked the walled-off 5F CARD KEY (talk:7) every tick. If no side of the target is a
      // reachable open tile, count it as 3 failures (Jev sees the fail count) and dump a wide grid once so the entry route can be found.
      try { const g = gridX(); const reach = Object.values(DIRS).some(([dx, dy]) => { const x = a.npc.x - dx, y = a.npc.y - dy; return g.rows[y] && WALK.has(g.rows[y][x]) && ((x === g.player.x && y === g.player.y) || pathDir(g, x, y)); });
        if (!reach && startBounce(g, st, a)) return;
        if (!reach) { destFail[fk] += 2; const dk = `dump|${st.map}|${a.npc.x},${a.npc.y}`; if (!talkMiss[dk]) { talkMiss[dk] = 1; const y0 = Math.max(0, a.npc.y - 8), y1 = Math.min(g.height - 1, a.npc.y + 4); const rows = []; for (let y = y0; y <= y1; y++) rows.push(`${y}:${g.rows[y]}`); log(`talk: no reachable side of ${a.tk} at ${a.npc.x},${a.npc.y}; player ${g.player.x},${g.player.y}; grid ${rows.join(' | ')}`); } } } catch (e) { log(`talk dump ${e}`); } if (lastWarpTaken && !lastWarpTaken.startsWith(st.map + '|')) deadEnd[lastWarpTaken] = (deadEnd[lastWarpTaken] || 0) + 1; }
    return;
  }
  if (a.kind === 'vend') {
    vendTries++; const ok = vendDrink(); destCache.clear(); log(`vend: bought=${ok}`);
    if (!ok && !gstate().inBattle) { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; }
    return;
  }
  if (a.kind === 'mhole') {
    let ok = false;
    try {
      walkTo(a.x, a.y, 150); wait(60); ok = gstate().map !== st.map;
      if (!ok && a.nb && !gstate().inBattle) {
        walkTo(a.nb[0], a.nb[1], 150);
        for (let k = 0; k < 4 && gstate().map === st.map && !gstate().inBattle; k++) { press(a.nb[2], 16, 8); wait(30); }
        wait(60); ok = gstate().map !== st.map;
      }
    } catch (e) { log(`mhole ${e}`); }
    log(`mansion hole (${a.x},${a.y}): fell=${ok} now ${gstate().map} (${gstate().x},${gstate().y})`); destCache.clear();
    if (!ok && !gstate().inBattle) { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; }
    return;
  }
  if (a.kind === 'mswitch') {
    let ok = false; const before = gymEv('EVENT_MANSION_SWITCH_ON'), seen = [];
    try { if (walkTo(a.x, a.y + 1, 150)) { press('UP', 4, 12); wait(10); press('A', 4, 30);
      for (let k = 0; k < 12; k++) { const s2 = screen(); if (!(s2.hasTextBox || s2.waitingForA)) break; const t = (s2.rows || []).slice(12).join(' ').replace(/\s+/g, ' ').trim(); if (t && seen[seen.length - 1] !== t) seen.push(t); press('A', 4, 20); } } } catch (e) { log(`mswitch ${e}`); }
    ok = gymEv('EVENT_MANSION_SWITCH_ON') !== before;
    const key = `${st.map}|${pick.split(':')[1]}`; mansionPress[key] = (mansionPress[key] || 0) + 1; mansionPress.total++; if (ok) { mansionPress.just = st.map; mansionPress.last = { map: st.map, on: !!gymEv('EVENT_MANSION_SWITCH_ON'), since: [] }; }
    log(`mansion switch (${a.x},${a.y}) on ${st.map}: toggled=${ok} now=${gymEv('EVENT_MANSION_SWITCH_ON')} text: ${seen.join(' / ').slice(0, 120)}`);
    wait(20); try { gridCache[st.map] = gridX(); } catch (e) {} destCache.clear();
    if (!ok && !gstate().inBattle) { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; }
    return;
  }
  if (a.kind === 'quiz') {
    let ok = false; const s0 = gstate().storyEvents;
    try { if (walkTo(a.x, a.y + 1, 150)) { press('UP', 4, 12); wait(10); press('A', 4, 30); ok = true;
      for (let k = 0; k < 20; k++) { if (gstate().inBattle) break; const s2 = screen(); if (!(s2.hasTextBox || s2.waitingForA)) break; try { const d = (s2.dialog || '').toString().slice(0, 80); if (d && lastTexts[lastTexts.length - 1] !== d) { lastTexts.push(d); if (lastTexts.length > 8) lastTexts.shift(); } } catch (e) {} if (!quizAnswer()) press('A', 4, 20); } } } catch (e) { log('quiz machine err ' + e); }
    quizUsed[pick] = (quizUsed[pick] || 0) + 1; destCache.clear(); try { gridCache[st.map] = gridX(); } catch (e) {}
    log(`quiz machine ${pick} (${a.x},${a.y}): reached=${ok} story ${s0}->${gstate().storyEvents}`);
    if (!ok && !gstate().inBattle) { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; }
    return;
  }
  if (a.kind === 'poster') {
    let ok = false;
    try { if (walkTo(9, 5, 40)) { press('UP', 4, 12); wait(10); press('A', 4, 30); for (let k = 0; k < 10; k++) { const s2 = screen(); if (!(s2.hasTextBox || s2.waitingForA)) break; press('A', 4, 20); } ok = true; } } catch (e) { log(`poster ${e}`); }
    posterTries++; destCache.clear(); log(`poster: pressed=${ok} story=${gstate().storyEvents}`);
    if (!ok && !gstate().inBattle) { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; }
    return;
  }
  if (a.kind === 'trash') { if (!trashStep()) { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; log(`dest failed: ${fk}`); } destState.pos = null; return; }
  if (a.kind === 'wp') { let ok = false;
    try { const g2 = gridX(); let best = null;
      for (let y = g2.height - 1; y > gstate().y && !best; y--) for (let x = 0; x < g2.width; x++) if (WALK.has(g2.rows[y][x]) && pathDir(g2, x, y)) { best = [x, y]; break; }
      // Session 20260927-073227: NPCs/trainers ('N') may stand in Route 14's narrow passages; if nothing is reachable, plan through them
      // (walking up to a trainer starts its battle, which clears the way). Also log what blocks the rows below.
      let gp = g2;
      if (!best) { gp = Object.assign({}, g2, { rows: g2.rows.map(r => (typeof r === 'string' ? r : r.join('')).replace(/N/g, '.')) });
        for (let y = gp.height - 1; y > gstate().y && !best; y--) for (let x = 0; x < gp.width; x++) if (WALK.has(gp.rows[y][x]) && pathDir(gp, x, y)) { best = [x, y]; break; }
        log(`wp south via NPCs: ${best ? best.join(',') : 'none'}; rows below: ${g2.rows.slice(gstate().y + 1, gstate().y + 4).map(r => typeof r === 'string' ? r : r.join('')).join('|')}`); }
      if (best && gp !== g2) { let n = 0; while (n++ < 40 && !gstate().inBattle && gstate().map === st.map) { const d = pathDir(gp, best[0], best[1]); if (!d) break; press(d); } ok = gstate().y > st.y || gstate().map !== st.map || gstate().inBattle; best = null; }
      if (best) { log(`wp south -> (${best[0]},${best[1]})`); walkTo(best[0], best[1], 120); ok = gstate().y > st.y || gstate().map !== st.map || gstate().inBattle; }
    } catch (e) { log(`wp ${e}`); }
    destCache.clear(); destState.pick = null;
    if (!ok) { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; log(`dest failed (wp): ${fk}`); wait(30); }
    else { try { delete destFail[`${rk(st.map)}|edge:west`]; } catch (e) {} }
    return;
  }
  if (a.kind === 'edge') { try { cutOutOfPocket(); } catch (e) { log(`cutOutOfPocket ${e}`); } }
  if (a.kind === 'warp') { if (a.at) lastWarpTaken = `${st.map}|${a.at.x},${a.at.y}`; if (a.at) warpUsed[`${st.map}|${a.at.x},${a.at.y}`] = (warpUsed[`${st.map}|${a.at.x},${a.at.y}`] || 0) + 1; if (!goWarp(a.to, a.at) && gstate().map === st.map) { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 1; log(`dest failed (goWarp): ${fk}`); const tgt = a.at || ((gridX().warps || []).find(w => (w.to || w.map || w.dest || '').includes(a.to)));
      // Session 20260927-035725: keep exploring the spinner floor for many rounds (retry the warp after each) instead of 1 shuffle per Jev pick.
      for (let r = 0; r < (/ROCKET_HIDEOUT_B[23]F/.test(st.map) ? 8 : 1); r++) { hideoutShuffle(st, fk, tgt); const q = gstate(); if (q.map !== st.map || q.inBattle) break; if (r > 0 && r % 2 === 0 && goWarp(a.to, a.at)) break; if (gstate().map !== st.map || gstate().inBattle) break; } } } else { let r = null; try { r = walkEdge(a.side); } catch (e) { log(`walkEdge ${e}`); }
    // Live run 081809: ROUTE_14 edge:west unreachable -> nothing pressed, cached pick re-run forever (20001-call stuck). Mark it failed 3x (hidden from Jev), re-ask, let frames pass.
    if (r === 'unreachable') { const fk = `${rk(st.map)}|${pick}`; destFail[fk] = (destFail[fk] || 0) + 3; destCache.clear(); destState.pick = null; log(`dest failed (edge unreachable): ${fk}`); wait(30); } }
}
const lastTexts = [];
let aSpam = 0, aSpamSig = '', aRun = 0; // aRun: consecutive main-loop A presses (reset when the loop gets past the text/menu check)
// Vermilion Gym trash-can switch puzzle (mechanics). pokered hidden objects: 15 cans at x=1,3,5,7,9 / y=7,9,11, index = col*3+row.
// Face a can + A. The 1st switch is random; the 2nd is in a neighbouring can; a wrong 2nd guess resets the locks AND re-randomizes the 1st.
// State comes from the story flags EVENT_1ST_LOCK_OPENED / EVENT_2ND_LOCK_OPENED.
const CINNABAR_QUIZ = [[15, 7], [10, 1], [9, 7], [9, 13], [1, 13], [1, 7]]; const quizUsed = {};
const MANSION_SW = { POKEMON_MANSION_1F: [[2, 5]], POKEMON_MANSION_2F: [[2, 11]], POKEMON_MANSION_3F: [[10, 5]], POKEMON_MANSION_B1F: [[20, 3], [18, 25]] };
const mansionPress = { total: 0 };
function gymEv(n) { try { return !!event(n); } catch (e) { return false; } }
const trash = { bad: {}, first: null, tried: new Set(), tried2: new Set(), n: 0, cycles: 0 };
const canXY = i => [1 + 2 * Math.floor(i / 3), 7 + 2 * (i % 3)];
function canNeighbours(i) { const c = Math.floor(i / 3), r = i % 3, o = []; if (r > 0) o.push(i - 1); if (r < 2) o.push(i + 1); if (c > 0) o.push(i - 3); if (c < 4) o.push(i + 3); return o; }
function checkCan(i) {
  const [cx, cy] = canXY(i), g = gridX();
  const spots = Object.entries(DIRS).map(([d, [dx, dy]]) => ({ d, x: cx - dx, y: cy - dy }))
    .filter(p => p.y >= 0 && p.y < g.height && p.x >= 0 && p.x < g.width && (WALK.has(g.rows[p.y][p.x]) || (p.x === g.player.x && p.y === g.player.y)))
    .sort((a, b) => (Math.abs(a.x - g.player.x) + Math.abs(a.y - g.player.y)) - (Math.abs(b.x - g.player.x) + Math.abs(b.y - g.player.y)));
  for (const p of spots) {
    if (!(g.player.x === p.x && g.player.y === p.y) && !pathDir(g, p.x, p.y)) continue;
    if (!walkTo(p.x, p.y, 40)) { if (gstate().inBattle) return null; continue; }
    press(p.d, 4, 12);
    const seen = [];
    for (let a = 0; a < 3 && !seen.length; a++) { // the A sometimes doesn't register (live test: empty text, can wrongly counted as checked)
      wait(10); press('A', 4, 30);
      for (let k = 0; k < 12; k++) { const s = screen(); if (!(s.hasTextBox || s.waitingForA)) break; const t = (s.rows || []).slice(12).join(' ').replace(/\s+/g, ' ').trim(); if (t && seen[seen.length - 1] !== t) seen.push(t); press('A', 4, 20); }
    }
    if (!seen.length) { log(`trash: can ${i} gave no text`); return false; }
    trash.n++;
    log(`trash: can ${i} (${cx},${cy}) from (${p.x},${p.y}) ${p.d}: ${seen.join(' / ').slice(0, 160)} | locks ${gymEv('EVENT_1ST_LOCK_OPENED')}/${gymEv('EVENT_2ND_LOCK_OPENED')}`);
    return true;
  }
  log(`trash: can ${i} (${cx},${cy}) has no reachable side`);
  return false;
}
// One search step (checks up to 3 cans). Returns false if nothing could be checked.
let posterTries = 0;
function trashStep() {
  let did = false;
  for (let k = 0; k < 3 && !gymEv('EVENT_2ND_LOCK_OPENED') && trash.n < 150; k++) {
    if (gstate().inBattle) return true;
    const e1 = gymEv('EVENT_1ST_LOCK_OPENED');
    let i;
    if (!e1) {
      if (trash.first != null) { trash.first = null; trash.tried = new Set(); trash.cycles++; log(`trash: locks reset (cycle ${trash.cycles}), searching again`); }
      const p = gstate(), left = [...Array(15).keys()].filter(j => !trash.tried.has(j));
      if (!left.length) { trash.tried = new Set(); continue; }
      left.sort((a, b) => { const [ax, ay] = canXY(a), [bx, by] = canXY(b); return (Math.abs(ax - p.x) + Math.abs(ay - p.y)) - (Math.abs(bx - p.x) + Math.abs(by - p.y)); });
      i = left[0];
      const r = checkCan(i); if (r === null) return true; if (r || (trash.bad[i] = (trash.bad[i] || 0) + 1) >= 2) trash.tried.add(i); if (!r) continue; did = true;
      if (gymEv('EVENT_1ST_LOCK_OPENED')) { trash.first = i; trash.tried2 = new Set(); log(`trash: 1st lock opened at can ${i}`); }
    } else {
      // 1st lock open (maybe from an earlier run: which can is unknown -> the game keeps it in wFirstLockTrashCanIndex, but search honestly: all cans)
      const nb = trash.first != null ? canNeighbours(trash.first) : [...Array(15).keys()];
      const left = nb.filter(j => !trash.tried2.has(j) && j !== trash.first);
      if (!left.length) { trash.tried2 = new Set(); trash.first = null; continue; }
      i = left[0];
      const r = checkCan(i); if (r === null) return true; if (r || (trash.bad[i] = (trash.bad[i] || 0) + 1) >= 2) trash.tried2.add(i); if (!r) continue; did = true;
      if (gymEv('EVENT_2ND_LOCK_OPENED')) { log(`trash: 2nd lock opened at can ${i}: door to LT.SURGE is open`); destCache.clear(); }
    }
  }
  return did;
}

// Train: pace inside tall grass (',' tiles) until a wild battle starts.
function trainStep() {
  const g = gridX(), st = gstate(); let best = null, bd = 1e9;
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (g.rows[y][x] === ',') {
    const d = Math.abs(x - st.x) + Math.abs(y - st.y); if (d < bd) { bd = d; best = [x, y]; } }
  if (!best) return false;
  if (bd > 0) { walkTo(best[0], best[1], 40); return true; }
  for (let i = 0; i < 8 && !gstate().inBattle; i++) { hold(i % 2 ? 'DOWN' : 'UP', 16); wait(4); }
  return true;
}

// Move learning (Session 20260926-232738): Ivysaur lost VINE WHIP to A-mashing. Jev now decides which move to forget (or skip).
function moveLearnStep() {
  const s = screen(), txt = s.rows.join(' ');
  if (!/older move|make room|forgotten|which move|can't be deleted/i.test(txt) || !s.cursor) return false;
  const m = /room for\s*([A-Z][A-Z .\-]+?)[?!]/i.exec(txt) || /learn\s*([A-Z][A-Z .\-]+?)!/i.exec(txt), nm0 = m ? m[1].trim() : 'the new move', LV_MOVES = { 'HAUNTER:38': 'DREAM EATER', 'GASTLY:38': 'DREAM EATER', 'VENUSAUR:65': 'SOLARBEAM', 'VENUSAUR:55': 'SLEEP POWDER', 'VENUSAUR:43': 'GROWTH' };
  // Session 20260927-231231 (test 232051): a HAUNTER learning DREAM EATER in BRUNOS_ROOM was asked about VENUSAUR's moves (party()[0]);
  // the pick didn't match the game's list and A-mashing deleted the HAUNTER's LICK. In battle the learner is the active battler.
  let lead = party()[pendingTmMove ? pendingTmTarget : 0] || party()[0] || {};
  try { if (gstate().inBattle) { const bp = battle().player, q = party()[bp.slot]; if (q && q.species === bp.species) lead = q; } } catch (e) {}
  const tmNm = pendingTmMove;
  const nm = nm0 !== 'the new move' ? nm0 : (pendingTmMove || LV_MOVES[`${lead.species}:${lead.level}`] || nm0);
  const mv = (lead.moves || []).map(x => (x && (x.name || x.move)) || String(x)).filter(Boolean);
  const opts = { keep: `Do not learn ${nm}; keep current moves (${mv.join(', ')})` };
  const mf = i => { const x = (lead.moves || [])[i] || {}; return x.type ? ` (${x.type}${x.power ? ' pow ' + x.power : ' status move'}${x.pp != null ? ', PP ' + x.pp : ''})` : ''; };
  // Session 20260927-183514: HM moves are not offered at all (Jev picked 'forget CUT' at 0.41 even with the "refuses" note).
  mv.forEach((n, i) => { if (!/^(CUT|FLY|SURF|STRENGTH|FLASH)$/i.test(n)) opts['forget_' + i] = `Forget ${n}${mf(i)} and learn ${nm}`; });
  // Test 235058: a bench TM question made a HAUNTER forget NIGHT SHADE (its only reliable attack) and LAPRAS forget the THUNDERBOLT it had just
  // learned. For a bench learner, only moves that are not its real attacks can be replaced.
  if (pendingTmMove && pendingTmTarget > 0) mv.forEach((n, i) => { const x = (lead.moves || [])[i] || {}; if (/^(NIGHT SHADE|SEISMIC TOSS|THUNDERBOLT|BUBBLEBEAM|ICE BEAM|SURF)$/.test(n) || (x.power >= 60 && !/DREAM EATER/.test(n))) delete opts['forget_' + i]; });
  // Session 20260927-183514: a TM we chose to teach gets its own neutral question with coverage facts per option (the level-up wording
  // "own-type moves are very valuable" made Jev keep 4 Grass/status moves vs the Fire/Flying CHARIZARD that beat us 3x).
  if (nm0 === 'the new move' && nm === tmNm && mv.length === 4) {
    const grassDmg = (lead.moves || []).filter(x => x && x.type === 'GRASS' && x.power > 0).length;
    mv.forEach((n, i) => { const x = (lead.moves || [])[i] || {}; if (opts['forget_' + i]) opts['forget_' + i] += x.power > 0 ? (x.type === 'GRASS' && grassDmg > 1 ? '. We have another Grass attack, so Grass coverage stays' : x.type === 'GRASS' && grassDmg === 1 ? '. It is our ONLY Grass attack (our strongest STAB move)' : '') + (/DREAM EATER/.test(n) ? '. Only hits a SLEEPING target (misses otherwise)' : '')
      : /^(NIGHT SHADE|SEISMIC TOSS|DRAGON RAGE|SONICBOOM|SUPER FANG|PSYWAVE)$/.test(n) ? `. NOT a status move: a fixed-damage ATTACK (${/NIGHT SHADE|SEISMIC/.test(n) ? `damage = user's level, ${lead.level} per hit, hits every type except Normal` : 'fixed damage'})${/NIGHT SHADE/.test(n) ? '; it is this Pokemon\'s main attack now' : ''}` : '. It is a status move (no direct damage)'; });
    opts.keep = pendingTmTarget > 0 ? `Do not learn ${nm}: keep ${mv.join(', ')}. The TM stays in the bag.` : `Do not learn ${nm}: keep ${mv.join(', ')}; vs Fire/Flying/Dragon enemies our only neutral attack stays CUT (power 50). The TM stays in the bag.`;
  }
  // Jev already decided to teach the TM; "keep" competes with 3 split forget options, so compare keep with the SUM of forget
  // probabilities (live-state test: keep 0.35 vs forget 0.24+0.27+0.14) and then take Jev's most likely forget.
  const tmPick = () => { const r = askChoiceP({ pokemon: `${lead.species} Lv${lead.level}`, moves: mv, newMove: nm, why: 'we chose to teach this TM to fix a coverage gap' },
    `${lead.species} is learning ${nm} from a TM we chose to use. Which move should it replace (or keep all and not learn it)? ${nm === 'DOUBLE-EDGE' ? 'DOUBLE-EDGE: NORMAL power 100, x1 vs FIRE/FLYING (rival CHARIZARD Lv53 beat us 3 times; every Grass move is x0.25 vs it); recoil 1/4 of damage dealt.' : ''}`, opts, 'keep');
    const p = r.probabilities || {}, fk = Object.keys(opts).filter(k => k !== 'keep').sort((a, b) => (p[b] || 0) - (p[a] || 0));
    const fsum = fk.reduce((a, k) => a + (p[k] || 0), 0);
    if (r.choice === 'keep' && fk.length && fsum > (p.keep || 0)) { log(`move learn: keep ${p.keep} < forget total ${fsum.toFixed(2)} -> ${fk[0]}`); return fk[0]; }
    return r.choice; };
  const c = mv.length === 4 && nm === tmNm && nm0 === 'the new move' ? tmPick()
    : mv.length === 4 ? askChoice({ pokemon: `${lead.species} Lv${lead.level}`, moves: mv, newMove: nm }, `${lead.species} wants to learn ${nm}. Which option is best for winning future battles? Damaging moves of our own type (e.g. VINE WHIP, RAZOR LEAF for Grass) are very valuable; this Pokemon is our only one.${nm === 'SOLARBEAM' ? ' SOLARBEAM: GRASS STAB power 120 (strongest Grass move; charges 1 turn), PP 10 - far better than GROWTH (no damage) or CUT; very useful vs Water/Ground/Rock Elite Four Pokemon.' : ''}${nm === 'DOUBLE-EDGE' ? ' DOUBLE-EDGE (taught from TM10 on purpose; keep = TM wasted): NORMAL power 100, hits FIRE/FLYING (rival CHARIZARD Lv53, who beat us 3 times) x1, where every Grass move is x0.25; recoil 1/4 of the damage dealt.' : ''}`, opts, 'keep') : 'keep';
  pendingTmMove = null;
  if (c === 'keep' && tmNm && nm === tmNm && nm0 === 'the new move') { for (const k in leadTmAsked) leadTmAsked[k] = 'skip'; } // Jev declined the TM move: don't re-teach
  if (c === 'keep') { press('B', 4, 20); for (let i = 0; i < 6; i++) { const r = screen().rows.join(' '); if (/Abandon/i.test(r) && screen().cursor) { press('A', 4, 20); break; } press('A', 4, 12); } return true; }
  const idx = +c.split('_')[1];
  if (!screen().rows.join('|').match(new RegExp(mv.slice(0, 3).join('|')))) press('A', 4, 20);
  // Session 20260927-183014: pressing A while waiting for the move list selected move 0 (CUT, "HM techniques can't be deleted",
  // live run 192545 lost SOLARBEAM). Wait for the list instead; only press A if still on the yes/no text.
  const onList = () => { const r = screen().rows.join('|'); return mv.filter(n => r.includes(n)).length >= 3; };
  for (let i = 0; i < 20 && !onList(); i++) { wait(8); if (i === 10 && !onList()) press('A', 4, 12); }
  if (!onList()) { log(`move learn: move list not found, skipping; screen=${screen().rows.join('|').replace(/\s+/g, ' ').slice(0, 200)}`); return true; }
  for (let k = 0; k < idx; k++) press('DOWN', 4, 10);
  press('A', 4, 20); log(`move learn: forgot ${mv[idx]} for ${nm}`); return true;
}

let loopMap = null;
function s0Busy() { const s = screen(); return s.hasTextBox || s.waitingForA; }
// Teach HM01 CUT (mechanics): START > ITEM > HM01 > USE > YES > first Pokemon. If the lead has 4 moves the
// "delete an older move" prompt is left to moveLearnStep(), where Jev picks which move to forget.
let cutTeachTries = 0;
let cutKnown = false;
function knowsCut() { if (cutKnown) return true; try { cutKnown = party().some(q => /CUT/i.test(JSON.stringify(q.moves || []))) || /knows CUT|learned CUT/i.test(screen().rows.join('|')); } catch (e) {} return cutKnown; }
// Mechanics: a door Jev picked is unreachable but a cuttable tree 'T' is in the way -> stand next to the tree
// nearest the door, face it, START > POKEMON > first mon > CUT. Returns true if the tree tile changed.
let cutFieldTries = 0;
// Walled into a small pocket whose only way out is a Cut tree (Vermilion Gym door after the tree regrew, live test 011408: gym<->city
// bounce on edge:north). Flood the walkable area; if it is small and touches a 'T', cut that tree.
function cutOutOfPocket() {
  if (!(checkCut() && knowsCut())) return false;
  const g = gridX(), seen = new Set([`${g.player.x},${g.player.y}`]), q = [[g.player.x, g.player.y]], trees = [];
  while (q.length && seen.size < 80) {
    const [x, y] = q.shift();
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (ny < 0 || ny >= g.height || nx < 0 || nx >= g.width || seen.has(k)) continue;
      const c = g.rows[ny][nx];
      if (c === 'T') { trees.push([nx, ny]); continue; }
      if (!WALK.has(c)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  if (seen.size >= 80 || !trees.length) return false;
  log(`cutOutOfPocket: pocket of ${seen.size} tiles, cutting tree at ${trees[0]}`);
  return cutTreeToward(trees[0][0], trees[0][1]);
}
function cutTreeToward(tx, ty) {
  if (cutFieldTries >= 12 || !(checkCut() && knowsCut())) return false;
  const g = gridX(), trees = [];
  g.rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'T') trees.push([x, y]); }));
  if (!trees.length) return false;
  trees.sort((a, b) => (Math.abs(a[0] - tx) + Math.abs(a[1] - ty)) - (Math.abs(b[0] - tx) + Math.abs(b[1] - ty)));
  cutFieldTries++;
  for (const [x, y] of trees.slice(0, 3)) for (const [d, [dx, dy]] of Object.entries(DIRS)) {
    const sx = x - dx, sy = y - dy;
    if (sy < 0 || sy >= g.height || sx < 0 || sx >= g.width || !WALK.has(g.rows[sy][sx])) continue;
    if (!(g.player.x === sx && g.player.y === sy) && !pathDir(g, sx, sy)) continue;
    if (!walkTo(sx, sy, 60)) continue;
    press(d, 4, 12);
    press('START', 4, 20);
    for (let k = 0; k < 8; k++) { const s = screen(); if (s.cursor && /POK.MON/.test(s.rows[s.cursor.y] || '') && !/POK.DEX/.test(s.rows[s.cursor.y] || '')) break; press('DOWN', 4, 10); }
    press('A', 4, 30); press('A', 4, 20); // first Pokemon -> field-move submenu
    for (let k = 0; k < 6; k++) { const s = screen(); if (s.cursor && /CUT/.test(s.rows[s.cursor.y] || '')) break; press('UP', 4, 10); }
    press('A', 4, 40);
    for (let k = 0; k < 8; k++) { const s = screen(); if (!(s.hasTextBox || s.waitingForA)) break; press('A', 4, 20); }
    const after = gridX().rows[y][x];
    log(`cutTree: (${x},${y}) from (${sx},${sy}) facing ${d} -> tile '${after}'`);
    if (after !== 'T') return true;
    for (let k = 0; k < 4; k++) press('B', 4, 12);
    return false;
  }
  return false;
}
function teachCut() {
  cutTeachTries++;
  try {
    const items = bag(), idx = items.findIndex(i => /HM01|^CUT/i.test(i.name || ''));
    if (idx < 0) return false;
    press('START', 4, 20);
    for (let k = 0; k < 8; k++) { const s = screen(); if (s.cursor && /ITEM/.test(s.rows[s.cursor.y] || '')) break; press('DOWN', 4, 10); }
    press('A', 4, 30);
    for (let k = 0; k < 25; k++) press('UP', 4, 6);
    for (let k = 0; k < 30; k++) { const c = screen(); if (c.cursor && /HM01|CUT/.test(c.rows[c.cursor.y] || '')) break; press('DOWN', 4, 16); }
    const sel = screen(); log(`teachCut: list row ${JSON.stringify(sel.cursor && sel.rows[sel.cursor.y])}`);
    press('A', 4, 20); // item -> USE/TOSS
    press('A', 4, 30); // USE
    for (let k = 0; k < 20; k++) {
      const s = screen(), t = s.rows.join('|');
      if (k < 8) log(`teachCut screen: ${t.replace(/\s+/g, ' ').slice(0, 120)}`);
      if (/older move|make room/i.test(t) && s.cursor) return true; // moveLearnStep asks Jev
      if (/learned|knows CUT/i.test(t)) { cutKnown = true; press('A', 4, 30); break; }
      press('A', 4, 30);
    }
    for (let k = 0; k < 4; k++) press('B', 4, 12);
    log(`teachCut: try ${cutTeachTries} knowsCut=${knowsCut()}`);
    return true;
  } catch (e) { log(`teachCut ${e}`); for (let k = 0; k < 4; k++) press('B', 4, 12); return false; }
}

// Session 20260927-131010: teach TM21 MEGA DRAIN to the lead (VENUSAUR has no Grass damage move). Jev decides whether to do it now;
// mechanics = START > ITEM > TM21 > USE > first Pokemon; the "delete an older move" prompt goes to moveLearnStep (Jev picks).
let tmTeachTries = 0, tmTeachAsked = false;
// Session 20260927-134010: SURF step (a) — PC swap for LAPRAS. Jev picks who to deposit; code works the PC menus.
// Mechanics guess (verify in logs): PC is the hidden object at (13,3) in every Pokemon Center; stand (13,4) facing UP.
let pcSwapTries = 0, pcSwapAsked = null;
function pcRow(re, n) { for (let k = 0; k < n; k++) { if (re.test(curRowText())) return true; press('DOWN', 4, 12); } return re.test(curRowText()); }
function maybePcSwap(st) {
  if (pcSwapTries >= 2 || (st.badges || 0) < 6 || !/_POKECENTER$/.test(st.map || '')) return false;
  try {
    const p = party(), bx = box() || [];
    if (p.some(q => /LAPRAS/i.test(q.species || ''))) return false;
    if (!bx.some(q => /LAPRAS/i.test(JSON.stringify(q)))) return false;
    if (!pcSwapAsked) {
      const opts = {};
      p.forEach((q, i) => { if (i > 0) opts['deposit_' + i] = `Deposit ${q.species} Lv${q.level} (HP ${q.hp}/${q.maxHp}; moves ${JSON.stringify((q.moves || []).map(m => (m && (m.name || m.move)) || m))}) to make room for LAPRAS`; });
      opts.skip = 'Do not swap now (no SURF user; Cinnabar/badge 7 stays unreachable)';
      pcSwapAsked = askChoice({ map: st.map, badges: st.badges, party: p.map(q => `${q.species} Lv${q.level}`) },
        'Badge 7 (Blaine, Cinnabar) needs SURF over the sea. HM03 SURF is in the bag but nobody in the party can learn it; LAPRAS in the PC box can. The party is full (6), so one member must be deposited in the PC before withdrawing LAPRAS. Which one?',
        opts, p.length > 1 ? 'deposit_1' : 'skip') || 'skip';
      log(`pc swap decision: ${pcSwapAsked}`);
    }
    if (pcSwapAsked === 'skip') { pcSwapTries = 99; return false; }
    const di = +String(pcSwapAsked).split('_')[1] || 1, who = (p[di] || {}).species || '';
    pcSwapTries++;
    if (!walkTo(13, 4, 40)) { log('pc swap: cannot reach (13,4)'); return false; }
    hold('UP', 2); wait(8); press('A', 4, 40);
    for (let k = 0; k < 6 && !screen().cursor; k++) press('A', 4, 30);
    const dump = () => log(`pc screen: ${screen().rows.join('|').replace(/\s+/g, ' ').slice(0, 160)} cur=${curRowText()}`);
    dump();
    if (!pcRow(/BILL|SOMEONE/, 4)) { dump(); for (let k = 0; k < 6; k++) press('B', 4, 15); return false; }
    press('A', 4, 40); for (let k = 0; k < 6 && !/WITHDRAW|DEPOSIT/.test(screen().rows.join('')); k++) press('A', 4, 30);
    // Session 20260927-134510: hollow '▷' = text box still waiting; wait alone never activated it (live 144136). Tap A to advance it;
    // if A overshoots into WITHDRAW's box list, B returns to the menu.
    for (let k = 0; k < 12 && !/WITHDRAW|DEPOSIT/.test(curRowText()); k++) { wait(20); if (!/WITHDRAW|DEPOSIT/.test(curRowText())) press('A', 2, 30); }
    if (!/WITHDRAW|DEPOSIT/.test(curRowText())) { press('B', 4, 30); }
    dump();
    // deposit
    if (pcRow(/DEPOSIT/, 5)) {
      press('A', 4, 40);
      // lists show NICKNAMES (e.g. AAAAAAAAAA), so select by position: top, then DOWN di times.
      for (let k = 0; k < 8; k++) press('UP', 4, 8);
      for (let k = 0; k < di; k++) press('DOWN', 4, 12);
      dump();
      if (who && !/CANCEL/.test(curRowText())) { press('A', 4, 20); press('A', 4, 60); for (let k = 0; k < 4; k++) press('A', 4, 30); }
      else press('B', 4, 20);
    }
    for (let k = 0; k < 20 && !/WITHDRAW/.test(screen().rows.join('')); k++) press('B', 4, 15);
    // withdraw
    for (let k = 0; k < 5; k++) { if (/WITHDRAW/.test(curRowText())) break; press('UP', 4, 12); }
    if (/WITHDRAW/.test(curRowText())) {
      press('A', 4, 40);
      const li = (box() || []).findIndex(q => /LAPRAS/i.test(JSON.stringify(q)));
      for (let k = 0; k < 25; k++) press('UP', 4, 6);
      for (let k = 0; k < li; k++) press('DOWN', 4, 12);
      dump();
      if (li >= 0 && !/CANCEL/.test(curRowText())) { press('A', 4, 20); press('A', 4, 60); for (let k = 0; k < 4; k++) press('A', 4, 30); }
    }
    for (let k = 0; k < 12; k++) press('B', 4, 15);
    const ok = party().some(q => /LAPRAS/i.test(q.species || ''));
    log(`pc swap: try ${pcSwapTries} deposit ${who} -> lapras in party=${ok}`);
    if (ok) goalCache.clear();
    return true;
  } catch (e) { log(`pc swap err ${e}`); for (let k = 0; k < 6; k++) try { press('B', 4, 15); } catch (e2) {} return false; }
}

function maybeTeachTM() {
  if (tmTeachTries >= 2) return false;
  try {
    const items = bag(); if (!items.some(i => /TM21/i.test(i.name || ''))) return false;
    const lead = party()[0] || {}, mv = (lead.moves || []).map(x => (x && (x.name || x.move)) || String(x)).filter(Boolean);
    if (!/VENUSAUR|IVYSAUR|BULBASAUR/i.test(lead.species || '') || mv.some(m => /MEGA DRAIN/i.test(m))) return false;
    if (!tmTeachAsked) {
      tmTeachAsked = true;
      const c = askChoice({ lead: `${lead.species} Lv${lead.level}`, moves: mv, map: gstate().map, badges: gstate().badges },
        `Our lead ${lead.species} has no Grass-type damaging move. The bag has TM21 (MEGA DRAIN: Grass, 40 power, heals half the damage dealt, STAB for ${lead.species}). Teach it now?`,
        { teach: `Teach TM21 MEGA DRAIN to ${lead.species} now (you then pick which of ${mv.join(', ')} to forget; CUT is an HM and cannot be forgotten)`,
          skip: 'Do not teach it; keep current moves' }, 'teach');
      log(`TM21 decision: ${c}`);
      if (c !== 'teach') { tmTeachTries = 99; return false; }
    }
    tmTeachTries++;
    press('START', 4, 20);
    for (let k = 0; k < 8; k++) { const s = screen(); if (s.cursor && /ITEM/.test(s.rows[s.cursor.y] || '')) break; press('DOWN', 4, 10); }
    press('A', 4, 30);
    for (let k = 0; k < 25; k++) press('UP', 4, 6);
    for (let k = 0; k < 30; k++) { const c = screen(); if (c.cursor && /TM21/.test(c.rows[c.cursor.y] || '')) break; press('DOWN', 4, 16); }
    const sel = screen(); log(`teachTM: list row ${JSON.stringify(sel.cursor && sel.rows[sel.cursor.y])}`);
    if (!(sel.cursor && /TM21/.test(sel.rows[sel.cursor.y] || ''))) { for (let k = 0; k < 4; k++) press('B', 4, 12); return false; }
    press('A', 4, 20); press('A', 4, 30); // USE
    for (let k = 0; k < 20; k++) {
      const s = screen(), t = s.rows.join('|');
      if (k < 10) log(`teachTM screen: ${t.replace(/\s+/g, ' ').slice(0, 140)}`);
      if (/older move|make room/i.test(t) && s.cursor) { moveLearnStep(); continue; }
      if (/learned/i.test(t)) { press('A', 4, 30); break; }
      if (/Booted up|contains|Teach/i.test(t) && s.cursor) { press('A', 4, 30); continue; }
      press('A', 4, 30);
    }
    for (let k = 0; k < 6; k++) press('B', 4, 12);
    log(`teachTM: try ${tmTeachTries} moves now ${JSON.stringify(((party()[0] || {}).moves || []).map(x => (x && (x.name || x.move)) || String(x)))}`);
    return true;
  } catch (e) { log(`teachTM ${e}`); for (let k = 0; k < 4; k++) press('B', 4, 12); return false; }
}

// Session 20260927-183514: live runs 192049/192545/193121 blacked out 3x to the Route 22 rival's CHARIZARD Lv53 (FIRE/FLYING): all of
// VENUSAUR's Grass moves are x0.25 and CUT (50) was its only neutral attack; the bench is Lv15-29 and the bag has no healing items.
// The bag holds HM04 STRENGTH and TM10 DOUBLE-EDGE (Normal 80/100) that VENUSAUR can learn. Jev decides whether/which to teach;
// code works START > ITEM > machine > USE > YES > first Pokemon; "delete an older move" goes to moveLearnStep (Jev picks).
const LEAD_TMS = [
  { re: /^TM10$/, item: 'TM10', move: 'DOUBLE-EDGE', fact: 'NORMAL 100 power, accuracy 100, 15 PP; hits FIRE/FLYING/WATER/PSYCHIC/DRAGON enemies x1 (all our Grass moves are x0.25-0.5 vs fire/flying); user takes 1/4 of the damage dealt as recoil. The TM is used up.' },
  { re: /^HM04$/, item: 'HM04', move: 'STRENGTH', fact: 'NORMAL 80 power, accuracy 100, 15 PP, no recoil; hits FIRE/FLYING enemies x1. Also needed OUTSIDE battle to push the boulders in VICTORY ROAD (on the way to the League). HM moves can never be forgotten later.' },
];
let leadTmTries = 0, pendingTmMove = null, pendingTmTarget = 0; const leadTmAsked = {};
function maybeTeachLeadTM(st) {
  if (leadTmTries >= 6 || (st.badges || 0) < 8) return false;
  try {
    // Session 20260927-234731: the E4 loop always ends at the CHAMPION's GYARADOS/CHARIZARD once VENUSAUR is spent; the bench only has
    // NIGHT SHADE (37) / LAPRAS SURF (~5). Offer every (party member, machine) pair the ROM says is learnable, not only the lead's.
    const pty = party(), inE4 = /^(LORELEIS|BRUNOS|AGATHAS|LANCES|CHAMPIONS)_ROOM$|^INDIGO_PLATEAU/.test(st.map || '');
    const cands = [];
    for (let pi = 0; pi < pty.length; pi++) {
      const mem = pty[pi] || {}; if (!mem.species) continue;
      const mmv = (mem.moves || []).map(x => (x && (x.name || x.move)) || String(x)).filter(Boolean);
      const sp = rom.speciesByName(mem.species) || {}, can = new Set(sp.machines || []);
      for (const it of bag()) {
        const id = it.id, nm = String(it.name || '');
        if (!can.has(id) || !/^(TM|HM)\d\d$/.test(nm)) continue;
        const idx = id >= 0xc9 ? id - 0xc9 : 50 + id - 0xc4, md = (rom.moves || {})[(rom.tmMoves || [])[idx]] || {};
        if (!md.name || !(md.power > 1) || mmv.includes(md.name)) continue;
        if (pi > 0 && !inE4) continue; // bench teaching only matters for the League teams
        // Test 235058: offering every learnable machine made Jev teach 5 in a row (LAPRAS lost its new THUNDERBOLT for SOLARBEAM, a
        // HAUNTER lost NIGHT SHADE). Bench options: only attacks that hit the CHAMPION's GYARADOS or CHARIZARD super-effectively.
        if (pi > 0) { let se = 0; try { se = Math.max(rom.effectiveness(md.type, ['WATER', 'FLYING']), rom.effectiveness(md.type, ['FIRE', 'FLYING'])); } catch (e) {} if (!(se >= 2 && md.power >= 60)) continue; }
        const known = LEAD_TMS.find(t => t.item === nm);
        let eff = ''; try { eff = inE4 ? ` vs CHAMPION GYARADOS (WATER/FLYING) x${rom.effectiveness(md.type, ['WATER', 'FLYING'])}, vs CHARIZARD (FIRE/FLYING) x${rom.effectiveness(md.type, ['FIRE', 'FLYING'])}, vs PIDGEOT (NORMAL/FLYING) x${rom.effectiveness(md.type, ['NORMAL', 'FLYING'])}, vs LANCE's DRAGONITE/AERODACTYL (Flying) x${rom.effectiveness(md.type, ['FLYING'])}` : ` vs FIRE/FLYING (rival CHARIZARD) x${rom.effectiveness(md.type, ['FIRE', 'FLYING'])}`; } catch (e) {}
        const stab = (mem.types || []).includes(md.type) ? ' (same type as the user: x1.5)' : '';
        const repl = mmv.length < 4 ? ' It has a free move slot.' : ` Current moves: ${(mem.moves || []).filter(Boolean).map(x => `${x.name || x}${x.power ? ' pow ' + x.power : x.type ? ' (status)' : ''}`).join(', ')}.`;
        cands.push({ pi, item: nm, move: md.name, key: `teach_${nm}_to_${pi}`, who: `${mem.species} Lv${mem.level}`,
          fact: (known && pi === 0 && !inE4 ? known.fact : `${md.type} ${md.power} power${stab}, accuracy ${md.accuracy}, ${md.pp} PP${eff}.${/^TM/.test(nm) ? ' The TM is used up.' : ' HM moves can never be forgotten later.'}`) + repl });
      }
    }
    const lead = pty[0] || {}, mv = (lead.moves || []).map(x => (x && (x.name || x.move)) || String(x)).filter(Boolean);
    if (!moveCache.has('leadtmlog:' + cands.map(t => t.key).join(','))) { moveCache.set('leadtmlog:' + cands.map(t => t.key).join(','), 1); log(`TM teach: learnable from bag: ${cands.map(t => t.item + ' ' + t.move + '->' + t.pi).join(', ') || 'nothing'}`); }
    if (!cands.length) return false;
    const sig = cands.map(t => t.key).join(',') + '|' + pty.map(m => (m.moves || []).map(x => (x && x.name) || String(x)).join('/')).join(',');
    if (leadTmAsked[sig] === 'skip') return false;
    const opts = { skip: `Do not teach anything now; keep everyone's current moves` };
    for (const t of cands) opts[t.key] = `Teach ${t.item} ${t.move} to ${t.who} (party slot ${t.pi}) now: ${t.fact} You then pick which current move to forget.`;
    const c = leadTmAsked[sig] || askChoice(inE4 ? { team: pty.map(m => `${m.species} Lv${m.level} (${(m.types || []).join('/')}) moves ${(m.moves || []).filter(Boolean).map(x => x.name || x).join(',')}`).join('; '), map: st.map,
      recentLosses: 'Several Elite Four passes ended at the CHAMPION (PIDGEOT Lv61, ALAKAZAM, RHYDON, EXEGGUTOR, GYARADOS Lv63, CHARIZARD Lv65): VENUSAUR beats the first four, then runs out of HP/PP and nobody else can hurt GYARADOS or CHARIZARD (HAUNTER NIGHT SHADE does a fixed 37-38, LAPRAS Lv18 SURF ~5).' }
      : { lead: `${lead.species} Lv${lead.level} (${(lead.types || []).join('/')})`, currentMoves: mv.join(', '), map: st.map, badges: st.badges,
      recentLosses: 'lost to the rival on ROUTE_22 3 times: his last Pokemon CHARIZARD Lv53 (FIRE/FLYING, FLAMETHROWER) resists every Grass move x0.25; CUT (50) was our only neutral attack; the bench (Lv15-29) is one-shot; no healing items in the bag',
      ahead: 'rival CHARIZARD Lv53, Victory Road (STRENGTH boulders), Elite Four Lv53-65 (LORELEI water/ice, AGATHA ghosts, LANCE dragons/flying)' },
      inE4 ? 'Teach a move from a TM/HM in the bag to one of our Pokemon now (out of battle, costs no turn)? Pick the pair that best helps beat the Champion.' : `Our lead ${lead.species} has only Grass moves plus CUT. Teach it a strong Normal-type attack from the bag now?`, opts, cands[0].key);
    // cache Jev's answer per bag+moves; a failed menu attempt (e.g. a scripted NPC walk-up ignores START) retries without re-asking
    if (!leadTmAsked[sig]) log(`lead TM decision: ${c} (options ${Object.keys(opts).join(',')})`); leadTmAsked[sig] = c;
    const t = cands.find(x => x.key === c); if (!t) return false;
    leadTmTries++;
    if ((leadTmTries & 1) === 0) wait(300); // let a scripted walk-up finish before retrying
    for (let i = 0; i < 6; i++) { const s0 = screen(); if (!s0.hasTextBox && !s0.waitingForA && !s0.cursor) break; press('B', 4, 16); }
    wait(20); press('START', 4, 30);
    for (let k = 0; k < 8; k++) { const s = screen(); if (s.cursor && /ITEM/.test(s.rows[s.cursor.y] || '')) break; press('DOWN', 4, 10); }
    { const s = screen(); if (!(s.cursor && /ITEM/.test(s.rows[s.cursor.y] || ''))) { log(`lead TM: ITEM not found rows=${JSON.stringify((s.rows || []).slice(0, 12))} cursor=${JSON.stringify(s.cursor)}`); for (let k = 0; k < 3; k++) press('B', 4, 12); return false; } }
    press('A', 4, 30);
    const want = new RegExp(t.item);
    for (let k = 0; k < 25; k++) press('UP', 4, 6);
    let ok = false; for (let k = 0; k < 30; k++) { const c = screen(); if (c.cursor && want.test(c.rows[c.cursor.y] || '')) { ok = true; break; } press('DOWN', 4, 16); }
    log(`lead TM: bag cursor='${curRowText()}' ok=${ok}`);
    if (!ok) { for (let k = 0; k < 4; k++) press('B', 4, 12); return false; }
    press('A', 4, 20); press('A', 4, 30); // USE
    pendingTmMove = t.move; pendingTmTarget = t.pi; let picked = false;
    // 24 A-presses ran out exactly at "Delete an older move to make room" and the B presses below answered NO (test 18:43).
    for (let k = 0; k < 45; k++) {
      const s = screen(), tx = s.rows.join('|');
      if (k < 12) log(`lead TM screen: ${tx.replace(/\s+/g, ' ').slice(0, 140)}`);
      // The TM party list marks each member ABLE / NOT ABLE; move the cursor to the chosen member (row 1 + 2*slot) before A.
      if (!picked && s.cursor && /ABLE/.test(tx)) {
        if (/NOT ABLE/.test(s.rows[1 + 2 * t.pi] || '')) { leadTmAsked[sig] = 'skip'; log(`lead TM: party screen says slot ${t.pi} NOT ABLE, giving up on ${t.item}`); break; }
        partyCursorTo(t.pi); log(`lead TM: party cursor y=${(screen().cursor || {}).y} for slot ${t.pi}`); picked = true; press('A', 4, 30); continue;
      }
      if (/older move|make room|which move|forgotten/i.test(tx)) {
        for (let w = 0; w < 12 && !screen().cursor; w++) wait(10);
        if (screen().cursor) { moveLearnStep(); continue; }
      }
      if (/did not learn|learned/i.test(tx) && k > 4) { press('A', 4, 30); break; }
      if (/learned/i.test(tx)) { press('A', 4, 30); break; }
      press('A', 4, 30);
    }
    for (let k = 0; k < 6; k++) press('B', 4, 12);
    pendingTmTarget = 0;
    log(`lead TM: ${t.item} moves now ${JSON.stringify(((party()[t.pi] || {}).moves || []).map(x => (x && (x.name || x.move)) || String(x)))}`);
    return true;
  } catch (e) { log(`lead TM err ${e}`); for (let k = 0; k < 4; k++) try { press('B', 4, 12); } catch (e2) {} return false; }
}

// Session 20260927-135011: SURF step (b) — teach HM03 SURF to LAPRAS. Jev decides whether/now; code works START > ITEM > HM03 > USE >
// LAPRAS (picked by party index: list shows nicknames). A "delete an older move" prompt goes to moveLearnStep (Jev picks).
let surfTeachTries = 0, surfTeachAsked = false;
function mvNames(m) { return ((m && m.moves) || []).map(x => (x && (x.name || x.move)) || String(x)).filter(Boolean); }
function knowsSurf() { return party().some(m => /LAPRAS/i.test(m.species || '') && mvNames(m).some(n => /SURF/i.test(n))); }
let surfOK = false, surfFails = 0;
// Gen 1 has no 'A facing water' prompt: face the water, START > POKEMON > LAPRAS > SURF. Needs the SOUL BADGE (Koga, bit 16).
// Session 20260927-144011: surfFails was never reset except by a success, so 10 failures on one floor disabled SURF (and turned
// every later shore step into a LEARNED_BLOCK) for the rest of the process. Reset it when the map changes.
let surfFailMap = '';
function startSurf(d) {
  try { const m = gstate().map; if (m !== surfFailMap) { surfFailMap = m; surfFails = 0; } } catch (e) {}
  if (surfFails >= 10) return false;
  try {
    const li = party().findIndex(m => /LAPRAS/i.test(m.species || '') && mvNames(m).some(n => /SURF/i.test(n))); if (li < 0) return false;
    hold(d, 3); wait(10); // turn to face the water (water blocks, so this only turns)
    press('START', 4, 20);
    // the START menu remembers its cursor and draws over several frames: wait until EXIT is drawn before reading the cursor row
    for (let k = 0; k < 15; k++) { const s = screen(); if (s.cursor && /EXIT/.test((s.rows || []).join('|'))) break; wait(8); }
    let onPk = false; for (let k = 0; k < 9; k++) { wait(6); const s = screen(); if (s.cursor && /POK.MON/.test(s.rows[s.cursor.y] || '')) { onPk = true; break; } press('DOWN', 4, 14); }
    if (!onPk) { log('surf: POKeMON row not found in START menu'); surfFails++; for (let k = 0; k < 4; k++) press('B', 4, 12); return false; }
    press('A', 4, 40); wait(20);
    for (let k = 0; k < 12; k++) { const s = screen(); if (s.cursor && /Choose a POK/i.test((s.rows || []).join('|'))) break; wait(6); }
    partyCursorTo(li);
    press('A', 4, 30);
    // Session 20260927-140511: live 150116 read the field-move submenu before it was drawn and walked DOWN onto CANCEL.
    // Wait for STATS (always in that submenu), then search UP first (SURF is the top row), then DOWN.
    for (let k = 0; k < 12; k++) { const s = screen(); if (s.cursor && /STATS/.test((s.rows || []).join('|'))) break; wait(6); }
    const ok = menuSelect(/SURF/, 'UP', 4) || menuSelect(/SURF/, 'DOWN', 4);
    log(`surf: submenu row ${JSON.stringify(curRowText())} ok=${ok} screen ${(screen().rows || []).join('|').replace(/\s+/g, ' ').slice(0, 160)}`);
    if (!ok) { surfFails++; closeMenus(); return false; }
    press('A', 4, 30);
    for (let k = 0; k < 10; k++) { const s = screen(); if (gstate().walkState === 2 && !s.hasTextBox && !s.waitingForA) break; if (k < 4) log(`surf screen: ${(s.rows || []).join('|').replace(/\s+/g, ' ').slice(0, 120)}`); press('A', 4, 20); }
    const on = gstate().walkState === 2; log(`surf: start facing ${d} at ${gstate().x},${gstate().y} -> surfing=${on}`);
    if (!on) { surfFails++; closeMenus(); } else surfFails = 0;
    return on;
  } catch (e) { log(`surf error ${e}`); surfFails++; closeMenus(); return false; }
}
// Session 20260927-190515: STRENGTH field move (same menu path as startSurf). Once used it stays on until the map changes.
let strengthMap = '', strengthFails = 0; const gridDumped = {};
function startStrength() {
  const m0 = gstate().map; if (strengthMap === m0) return true; if (strengthFails >= 8) return false;
  try {
    const li = party().findIndex(m => mvNames(m).some(n => /STRENGTH/i.test(n))); if (li < 0) { log('strength: nobody knows STRENGTH'); strengthFails++; return false; }
    press('START', 4, 20);
    for (let k = 0; k < 15; k++) { const s = screen(); if (s.cursor && /EXIT/.test((s.rows || []).join('|'))) break; wait(8); }
    let onPk = false; for (let k = 0; k < 9; k++) { wait(6); const s = screen(); if (s.cursor && /POK/.test(s.rows[s.cursor.y] || '') && !/DEX/.test(s.rows[s.cursor.y] || '')) { onPk = true; break; } press('DOWN', 4, 14); }
    if (!onPk) { log(`strength: POKEMON row not found ${(screen().rows || []).join('|').replace(/\s+/g, ' ').slice(0, 120)}`); strengthFails++; closeMenus(); return false; }
    press('A', 4, 40); wait(20);
    // Session 20260927-191515: submenu search ended on "QUIT" -> the party list probably wasn't open yet. Wait for it longer and
    // re-press A on the member until the field-move submenu (STATS) appears; log the screen at every step.
    let inParty = false; for (let k = 0; k < 20; k++) { const s = screen(); if (/Choose a POK/i.test((s.rows || []).join('|'))) { inParty = true; break; } wait(8); }
    log(`strength: party list open=${inParty} ${(screen().rows || []).join('|').replace(/\s+/g, ' ').slice(0, 160)}`);
    if (!inParty) { strengthFails++; closeMenus(); return false; }
    wait(20); partyCursorTo(li);
    let sub = false; for (let t = 0; t < 3 && !sub; t++) { press('A', 4, 30); for (let k = 0; k < 12; k++) { const s = screen(); if (s.cursor && /STATS/.test((s.rows || []).join('|'))) { sub = true; break; } wait(6); } }
    log(`strength: submenu open=${sub} ${(screen().rows || []).join('|').replace(/\s+/g, ' ').slice(0, 200)}`);
    const ok = sub && (menuSelect(/STRENGTH/, 'UP', 4) || menuSelect(/STRENGTH/, 'DOWN', 4));
    log(`strength: submenu row ${JSON.stringify(curRowText())} ok=${ok}`);
    if (!ok) { strengthFails++; closeMenus(); return false; }
    press('A', 4, 30);
    for (let k = 0; k < 10; k++) { const s = screen(); if (!s.cursor && !s.hasTextBox && !s.waitingForA) break; press('A', 4, 20); wait(6); }
    closeMenus();
    strengthMap = m0; log(`strength: activated on ${m0}; texts ${JSON.stringify(lastTexts.slice(-2))}`);
    return true;
  } catch (e) { log(`strength error ${e}`); strengthFails++; closeMenus(); return false; }
}
function pushBoulder(npc) {
  log(`strength: pushBoulder npc ${npc && npc.x},${npc && npc.y} fails=${strengthFails} map=${strengthMap}`);
  for (let k = 0; k < 10; k++) { const s = screen(); if (!s.cursor && !s.hasTextBox && !s.waitingForA) break; press('B', 4, 16); wait(8); }
  if (!npc || !startStrength()) return false;
  const g = gstate(), dx = npc.x - g.x, dy = npc.y - g.y;
  const d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP');
  for (let k = 0; k < 4; k++) { hold(d, 16); wait(20); }
  log(`strength: pushed ${d} from ${g.x},${g.y} -> now ${gstate().x},${gstate().y}`);
  destCache.clear(); return true;
}
// Session 20260927-192015 (DEEP): VICTORY_ROAD_1F root cause. The ROM script (VictoryRoad1FDefaultScript .SwitchCoords) puts the
// floor switch at (17,13); it opens the wall block at tiles (8-9,12-13), joining row 14 to the corridor north. The only boulder that
// can reach it is sprite 5 at (5,15). pushBoulder() walked into it from below -> boulder to (5,14), a dead end (can't go further
// up, can't go sideways) = puzzle unsolvable until the map reloads. Route (Sokoban, checked on grid()): DOWN 1 -> RIGHT along row
// 16 to (9,16) -> UP from the entrance tile (9,17) to (9,14) -> RIGHT along row 14 to (16,14) -> UP to (16,12) -> RIGHT to (17,12)
// -> DOWN onto (17,13). Each call does the one segment that the boulder's CURRENT position calls for (resumes after battles).
let vr1Tries = 0, vr1Plan = '', vr1Log = '';
let vrBIdx = 5; // boulder sprite index that pushSeg/vr1Boulder track (5 on 1F; set by solveVRBoulder on 2F/3F)
function vr1Boulder() { try { return (grid().npcs || []).find(n => n.index === vrBIdx) || null; } catch (e) { return null; } }
function pushSeg(dir, n) {
  if (!startStrength()) return false;
  // One tile at a time with short holds, checking the boulder sprite: 16-frame holds that start mid-step carried on after the
  // player arrived and pushed an extra tile (test 192800: boulder 16,12 -> 16,11 off-route). No follow step after the last push.
  const g0 = gstate(), [dx, dy] = DIRS[dir], b0 = vr1Boulder(); if (!b0) return false;
  let done = 0;
  for (let i = 0; i < n; i++) {
    const ex = b0.x + (i + 1) * dx, ey = b0.y + (i + 1) * dy;
    for (let k = 0; k < 14; k++) {
      const st = gstate(); if (st.inBattle || st.map !== g0.map) break;
      const b = vr1Boulder(); if (b && b.x === ex && b.y === ey) break;
      const s = screen(); if (s.hasTextBox || s.waitingForA) { press('B', 4, 12); continue; }
      hold(dir, 8); wait(4);
    }
    wait(30); const b = vr1Boulder(); if (!(b && b.x === ex && b.y === ey)) break;
    done++;
    if (i < n - 1) { const px = ex - 2 * dx, py = ey - 2 * dy; for (let k = 0; k < 6; k++) { const st = gstate(); if (st.inBattle || (st.x === px && st.y === py)) break; hold(dir, 2); wait(20); } }
  }
  const g1 = gstate(), b = vr1Boulder(); log(`vr1: push ${dir}x${n} from ${g0.x},${g0.y} -> ${done} pushed, player ${g1.x},${g1.y} boulder ${b && b.x},${b && b.y}`);
  // Session 20260927-202516: 0-tile pushes (live 212119: LEFTx4 at 6,2) -> re-activate STRENGTH next try (battles may reset it)
  if (done === 0) strengthMap = null;
  return done === n;
}
// BFS walk that treats the boulder (and warps) as walls: walkTo() walked straight through the boulder at (16,12) with STRENGTH on
// and shoved it to (16,11), off the route (test 192716).
// Session 20260927-205016 (DEEP): ROOT CAUSE of the 3F boulder drifting off-plan. walkAvoid read the position while the player was
// still mid-step (step start lagged the 16-frame hold, esp. during the ~140-frame input lock right after a STRENGTH push), so each
// direction was picked for the PREVIOUS tile: live 213601 went 7,1 -> LEFT -> 6,1 -> DOWN and shoved the boulder 6,2 -> 6,3.
// settle() waits until wWalkCounter (step in progress) and wJoyIgnore (input locked) are both 0 before the next decision.
function postBattleSettle() {
  for (let i = 0; i < 30 && gstate().inBattle; i++) wait(8);
  wait(30); let prev = '';
  for (let k = 0; k < 10; k++) { const cur = gridX().rows.join('|'); if (cur === prev) break; prev = cur; wait(20); }
  const st = gstate(); if (gridCache[st.map]) gridCache[st.map] = gridX();
}
function settle(max = 90) {
  for (let f = 0; f < max; f += 4) {
    let busy = false; try { busy = (read(sym('wWalkCounter'))[0] | 0) !== 0 || (read(sym('wJoyIgnore'))[0] | 0) !== 0; } catch (e) { wait(8); return; }
    if (!busy) return; wait(4);
  }
}
// Session 20260927-212516 (DEEP): the 3F hole walk from switch (3,5) to push tile (21,15) is ~70 steps (east along row 1, down the
// middle, west through (7,10), south, east along row 16). The old 40-step cap ended each walk half way (live 222026 try 15 at (9,5), no
// battle) and counted it as a failed plan; 5 in a row drop the pair -> "no solvable" -> 3F<->2F ping-pong. Now: up to 120 steps, stop
// early only when stuck (same tile 4 decisions in a row); walkMoved tells the caller a short walk still made progress.
let walkMoved = false;
function walkAvoid(tx, ty, bx, by) {
  walkMoved = false; let st0 = gstate(), lastP = `${st0.x},${st0.y}`, same = 0;
  for (let i = 0; i < 120; i++) {
    settle();
    const st = gstate(); if (st.inBattle || !/^VICTORY_ROAD/.test(st.map)) return false; if (st.x === tx && st.y === ty) return true;
    const pk = `${st.x},${st.y}`; if (pk !== lastP) { walkMoved = true; lastP = pk; same = 0; } else if (i > 0 && ++same >= 4) { log(`vr1: walkAvoid stuck at ${pk} -> ${tx},${ty}`); return false; }
    const s = screen(); if (s.hasTextBox || s.waitingForA) { press('B', 4, 12); continue; }
    const g = grid(), W = g.width, H = g.height, warps = new Set((g.warps || []).map(w => `${w.x},${w.y}`));
    const blk = new Set((g.blockedMoves || []).map(m => `${m.x},${m.y},${m.dir}`));
    const ok = (x, y) => (x === st.x && y === st.y) || x >= 0 && y >= 0 && x < W && y < H && !(x === bx && y === by) && !warps.has(`${x},${y}`) && (g.rows[y][x] === '.' || g.rows[y][x] === '@' || g.rows[y][x] === ',');
    const prev = new Map(), q = [[tx, ty]]; prev.set(`${tx},${ty}`, null); // BFS from the target back to us
    while (q.length) { const [x, y] = q.shift(); if (x === st.x && y === st.y) break;
      for (const [d, [dx, dy]] of Object.entries(DIRS)) { const nx = x + dx, ny = y + dy, k = `${nx},${ny}`; if (prev.has(k) || !ok(nx, ny)) continue;
        const back = { UP: 'down', DOWN: 'up', LEFT: 'right', RIGHT: 'left' }[d]; if (blk.has(`${nx},${ny},${back}`)) continue; prev.set(k, [x, y]); q.push([nx, ny]); } }
    const nxt = prev.get(`${st.x},${st.y}`); if (!nxt) { log(`vr1: walkAvoid no path ${st.x},${st.y}->${tx},${ty} (boulder ${bx},${by})`); return false; }
    const d = Object.keys(DIRS).find(k => DIRS[k][0] === nxt[0] - st.x && DIRS[k][1] === nxt[1] - st.y);
    const p0 = `${st.x},${st.y}`; hold(d, 16); wait(4);
    for (let k = 0; k < 8 && `${gstate().x},${gstate().y}` === p0; k++) { settle(); if (`${gstate().x},${gstate().y}` !== p0) break; hold(d, 8); wait(4); }
  }
  return false;
}
function solveVR1F(st) {
  if (st.map !== 'VICTORY_ROAD_1F' || vr1Tries >= 60) return false;
  try { if (event('EVENT_VICTORY_ROAD_1_BOULDER_ON_SWITCH')) return false; } catch (e) {}
  const b = vr1Boulder(); if (!b) return false;
  if (!vr1Plan) {
    vr1Plan = askChoice({ map: st.map, boulder: `${b.x},${b.y}`, player: `${st.x},${st.y}`, strengthKnown: party().some(m => mvNames(m).some(n => /STRENGTH/i.test(n))) },
      'Victory Road 1F: the way north is closed by a rock wall that opens only when a boulder sits on the floor switch at (17,13). Earlier runs pushed the boulder UP into a dead end and looped for 15+ minutes. How do we get through?',
      { switch_route: 'Use STRENGTH and push the boulder near the entrance along the checked route (down, right along row 16, up from the entrance, right along row 14, up, right, down onto the switch at 17,13). If it gets stuck, leave and re-enter the cave to reset it.',
        explore: 'Ignore the boulder and keep exploring/talking with the normal goal picker (this has failed for 3 sessions: every forward option failed)' }, 'switch_route') || 'switch_route';
    log(`vr1: Jev plan ${vr1Plan}`);
  }
  if (vr1Plan !== 'switch_route') return false;
  vr1Tries++; vrBIdx = 5;
  const bx = b.x, by = b.y; let r;
  if (bx === 5 && by === 15) { r = walkAvoid(5, 14, bx, by) && pushSeg('DOWN', 1); }
  else if (by === 16 && bx >= 5 && bx <= 8) { r = walkAvoid(bx - 1, 16, bx, by) && pushSeg('RIGHT', 9 - bx); }
  else if (bx === 9 && (by === 16 || by === 15)) {
    if (by === 16) { // stand on the entrance tile (9,17), entered sideways from (7,17) so the exit warp does not fire
      r = walkAvoid(7, 17, bx, by);
      for (let k = 0; r && k < 8; k++) { const g = gstate(); if (g.map !== st.map) { log('vr1: warped out from the entrance tile'); r = false; break; } if (g.x === 9 && g.y === 17) break; hold('RIGHT', 16); wait(6); }
      const g = gstate(); log(`vr1: at entrance tile? ${g.map} ${g.x},${g.y}`); r = r && g.map === st.map && g.x === 9 && g.y === 17 && pushSeg('UP', 2);
    } else r = walkAvoid(9, 16, bx, by) && pushSeg('UP', 1);
  }
  else if (by === 14 && bx >= 9 && bx <= 15) { r = walkAvoid(bx - 1, 14, bx, by) && pushSeg('RIGHT', 16 - bx); }
  else if (bx === 16 && (by === 14 || by === 13)) { r = walkAvoid(16, by + 1, bx, by) && pushSeg('UP', by - 12); }
  else if (bx === 16 && by === 12) { r = walkAvoid(15, 12, bx, by) && pushSeg('RIGHT', 1); }
  else if (bx === 17 && by === 12) { r = walkAvoid(17, 11, bx, by) && pushSeg('DOWN', 1); }
  else { // off-route (e.g. 5,14 dead end): leave through the entrance so the boulder resets, the goal picker walks back in
    log(`vr1: boulder off-route at ${bx},${by} -> leaving to reset it`);
    r = walkAvoid(9, 16, bx, by); if (r) for (let k = 0; k < 6 && gstate().map === st.map; k++) { hold('DOWN', 16); wait(10); }
  }
  let sw = false; try { sw = !!event('EVENT_VICTORY_ROAD_1_BOULDER_ON_SWITCH'); } catch (e) {}
  const b2 = vr1Boulder(); log(`vr1: try ${vr1Tries} boulder ${bx},${by} -> ${b2 && b2.x},${b2 && b2.y} ok=${!!r} switch=${sw}`);
  if (sw) destCache.clear();
  return true;
}
// Session 20260927-200516 (DEEP): Victory Road 2F block. ROOT CAUSE: no mechanic for the 2F boulder switches, so every run reached
// 2F at (0,8) and ping-ponged 2F<->1F: the only way on (east) is the wall at (6-7,8-9), opened by a boulder on switch (1,16)
// (VictoryRoad2F_Script). The exit pocket to Route 23 north (25-28,7-9) is only reachable via the 3F ladder (27,7).
// Generic single-boulder Sokoban solver over grid(): state = boulder + player tile, pushes need the player to reach the tile behind
// the boulder (flood fill with the boulder as a wall), respect blockedMoves (ledges), and the boulder may not enter walls/NPCs/warps.
const VR_SWITCHES = {
  VICTORY_ROAD_2F: [{ x: 1, y: 16, ev: 'EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH1', opens: 'opens the rock wall at (6-7,8-9) right next to the 1F ladder = the way east to the 3F ladder (23,7)' },
    { x: 9, y: 16, ev: 'EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH2', opens: 'opens the rock wall at (22-23,14-15) in the south-east' }],
  // Session 20260927-201516: 3F coords from memory of pokered VictoryRoad3F_Script (.SwitchOrHoleCoords 3,5 / 23,15) - UNVERIFIED.
  VICTORY_ROAD_3F: [{ x: 3, y: 5, ev: 'EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH1', opens: 'floor switch: opens the 3F rock barrier (way on to 4F)' },
    { x: 23, y: 15, ev: 'EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH2', opens: 'hole: drops the boulder to 2F onto switch (9,16) opening the 2F south-east wall' }],
};
// Session 20260927-205516 (DEEP): VR route verified from grid() in tests: 3F switch (3,5) opens 3F (7,10) to the south half; the 3F
// hole (23,15) drops a boulder to 2F (23,16); that boulder on 2F switch (9,16) opens 2F (23,14) -> 2F ladder (25,14) -> 3F east pocket
// (27,15) -> 3F ladder (26,8) -> 2F (27,7) -> exit (29,7)/(29,8) north to Indigo Plateau.
function vrSw1F() { try { return !!event('EVENT_VICTORY_ROAD_1_BOULDER_ON_SWITCH'); } catch (e) { return false; } }
function vrSwLog() { try { return ['EVENT_VICTORY_ROAD_1_BOULDER_ON_SWITCH', 'EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH1', 'EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH2', 'EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH1', 'EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH2'].map(e => event(e) ? 1 : 0).join(''); } catch (e) { return '?'; } }
function vrSw2() { try { return !!event('EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH2'); } catch (e) { return false; } }
function vrLadderFact(map, w) {
  const k = `${map}@${w.x},${w.y}`, sw2 = vrSw2();
  const f = { 'VICTORY_ROAD_2F@25,14': sw2 ? 'THE WAY FORWARD (2F switch 9,16 is pressed): up to the 3F east pocket, then 3F ladder (26,8) down to 2F (27,7) beside the EXIT' : 'walled off until a boulder sits on 2F switch (9,16)',
    'VICTORY_ROAD_3F@26,8': 'THE WAY FORWARD: down to 2F (27,7), right next to the Victory Road EXIT (29,7) to Indigo Plateau',
    'VICTORY_ROAD_2F@29,7': 'THE EXIT: north to Indigo Plateau (Pokemon Center, Elite Four)', 'VICTORY_ROAD_2F@29,8': 'THE EXIT: north to Indigo Plateau (Pokemon Center, Elite Four)',
    'VICTORY_ROAD_3F@2,0': 'leads into a closed pocket on 2F (1,1): only way out is back up this ladder',
    'VICTORY_ROAD_2F@0,8': sw2 ? 'BACKWARDS to 1F and the entrance (boulder switches reset if we leave the cave)' : '',
    'VICTORY_ROAD_3F@27,15': 'down to 2F (25,14) south-east area' }[k];
  return f ? ` [${f}]` : '';
}
function boulderPlan(g, bi, tx, ty, px0, py0) {
  const W = g.width, H = g.height, b0 = (g.npcs || []).find(n => n.index === bi); if (!b0) return null;
  const others = new Set((g.npcs || []).filter(n => n.index !== bi).map(n => `${n.x},${n.y}`));
  const warps = new Set((g.warps || []).map(w => `${w.x},${w.y}`));
  const blk = new Set((g.blockedMoves || []).map(m => `${m.x},${m.y},${String(m.dir).toLowerCase()}`));
  const floor = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !others.has(`${x},${y}`) && !warps.has(`${x},${y}`) && '.,@N'.includes(g.rows[y][x]);
  const can = (x, y, d) => !blk.has(`${x},${y},${d.toLowerCase()}`);
  const reach = (bx, by, px, py) => { const seen = new Set([`${px},${py}`]), q = [[px, py]];
    while (q.length) { const [x, y] = q.pop(); for (const [d, [dx, dy]] of Object.entries(DIRS)) { const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || (nx === bx && ny === by) || !floor(nx, ny) || !can(x, y, d)) continue; seen.add(k); q.push([nx, ny]); } }
    return seen; };
  const start = `${b0.x},${b0.y},${px0},${py0}`, prev = new Map([[start, null]]), q = [[b0.x, b0.y, px0, py0]];
  let n = 0;
  while (q.length && n++ < 6000) {
    const [bx, by, px, py] = q.shift();
    if (bx === tx && by === ty) { const path = []; let k = `${bx},${by},${px},${py}`; while (prev.get(k)) { const [pk, d, fx, fy] = prev.get(k); path.unshift({ d, bx: fx, by: fy }); k = pk; } return path; }
    const r = reach(bx, by, px, py);
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const sx = bx - dx, sy = by - dy, nx = bx + dx, ny = by + dy;
      if (!r.has(`${sx},${sy}`) || !can(sx, sy, d) || !can(bx, by, d) || !floor(nx, ny)) continue;
      const k = `${nx},${ny},${bx},${by}`; if (prev.has(k)) continue;
      prev.set(k, [`${bx},${by},${px},${py}`, d, bx, by]); q.push([nx, ny, bx, by]);
    }
  }
  return null;
}
let vrbPick = {}, vrbTries = 0, vrbFail = {}, vrbRetry = 0;
function solveVRBoulder(st) {
  const sws = VR_SWITCHES[st.map]; if (!sws || vrbTries >= 80) return false;
  const open = sws.filter(w => { try { return !event(w.ev); } catch (e) { return false; } });
  if (!open.length) return false;
  let g; try { g = grid(); } catch (e) { return false; }
  let rn = []; try { rn = (rom.mapByName(st.map) || {}).npcs || []; } catch (e) {}
  let bould = (g.npcs || []).filter(n => /BOULDER/i.test(JSON.stringify(rn[n.index - 1] || {})));
  if (!bould.length) {
    // Session 20260927-202016: boulders share one sprite picture; learn it from 2F (index 11/12) else take any repeated picture.
    let sp = []; try { sp = sprites() || []; } catch (e) {}
    const pic = {}; for (const s of sp) if (!s.hidden) pic[s.index] = s.picture;
    const cnt = {}; for (const k in pic) cnt[pic[k]] = (cnt[pic[k]] || 0) + 1;
    const bp = Object.values(pic).includes(63) ? 63 : (st.map === 'VICTORY_ROAD_2F' ? pic[11] : null); // 63 = boulder picture (seen on 3F)
    bould = (g.npcs || []).filter(n => bp != null ? pic[n.index] === bp : (n.index >= 11 || (cnt[pic[n.index]] || 0) >= 2));
    if (!vrbFail['romlog' + st.map]) { vrbFail['romlog' + st.map] = 1; log(`vrb: no BOULDER in rom npcs; sprites ${JSON.stringify(sp.map(s => [s.index, s.x, s.y, s.picture, s.hidden ? 1 : 0]))} cand ${bould.map(n => n.index).join(',')}`); }
  }
  // options: every (boulder, open switch) pair the solver can actually do from here
  const opts = {}, plans = {};
  for (const w of open) for (const n of bould) {
    if ((vrbFail[`${st.map}:${n.index}:${w.x},${w.y}`] || 0) >= 5) continue;
    const pl = boulderPlan(g, n.index, w.x, w.y, st.x, st.y); if (!pl || !pl.length) continue;
    const key = `push:${n.index}:${w.x},${w.y}`; plans[key] = { pl, n, w };
    opts[key] = `Push the boulder at (${n.x},${n.y}) onto the floor switch at (${w.x},${w.y}) with STRENGTH: ${pl.length} pushes (path checked on the map). This ${w.opens}.`;
  }
  if (!Object.keys(opts).length && !vrbRetry) { wait(40); const st2 = gstate(); if (!st2.inBattle && st2.map === st.map) { vrbRetry = 1; try { return solveVRBoulder(st2); } finally { vrbRetry = 0; } } }
  if (!Object.keys(opts).length) { log(`vrbdiag ${st.map} p=${st.x},${st.y} open=${open.map(w => w.x + ',' + w.y)} bould=${JSON.stringify(bould.map(n => [n.index, n.x, n.y]))} fails=${JSON.stringify(vrbFail).slice(0, 200)}`); if (!vrbFail[st.map + ':none']) { vrbFail[st.map + ':none'] = 1; log(`vrb: no solvable boulder/switch on ${st.map} from ${st.x},${st.y}`); try { const g = grid(); log(`vrb: grid rows0-8 cols0-10 ${g.rows.slice(0, 9).map(r => r.slice(0, 11)).join('|')}`); } catch (e) {} } return false; }
  const ck = `${st.map}:${Object.keys(opts).sort().join('|')}`;
  if (!vrbPick[ck]) {
    opts.explore = 'Ignore the boulders and let the normal goal picker choose a door/ladder (earlier runs did this on 2F and only ping-ponged back to 1F)';
    const fb = Object.keys(plans).sort((a, b) => plans[a].pl.length - plans[b].pl.length)[0];
    vrbPick[ck] = askChoice({ map: st.map, player: `${st.x},${st.y}`, switchesOpen: open.map(w => `${w.x},${w.y}`), strengthKnown: party().some(m => mvNames(m).some(x => /STRENGTH/i.test(x))) },
      `${st.map}: the way on is closed by rock walls that open only when a boulder sits on a floor switch. Which boulder should we push, or skip?`, opts, fb) || fb;
    log(`vrb: Jev picked ${vrbPick[ck]} from ${Object.keys(opts).join(',')}`);
  }
  const pk = vrbPick[ck]; if (!plans[pk]) return false;
  const { pl, n, w } = plans[pk]; vrBIdx = n.index; vrbTries++;
  const d = pl[0].d; let cnt = 0; while (cnt < pl.length && pl[cnt].d === d) cnt++;
  const [dx, dy] = DIRS[d];
  const r = walkAvoid(n.x - dx, n.y - dy, n.x, n.y) && pushSeg(d, cnt);
  const b2 = vr1Boulder(); let sw = false; try { sw = !!event(w.ev); } catch (e) {}
  log(`vrb: try ${vrbTries} ${pk} ${d}x${cnt} from boulder ${n.x},${n.y} -> ${b2 && b2.x},${b2 && b2.y} ok=${!!r} switch=${sw}`);
  // Session 20260927-203016: live 212613 got the 3F boulder to (2,5), one push from switch (3,5), but 5 scattered zero-move tries
  // over the whole plan hit the cap. Count only CONSECUTIVE zero-move failures: any boulder movement resets the counter.
  { const fk = `${st.map}:${n.index}:${w.x},${w.y}`; if (b2 && (b2.x !== n.x || b2.y !== n.y)) vrbFail[fk] = 0; else if (!r && !gstate().inBattle && !walkMoved) vrbFail[fk] = (vrbFail[fk] || 0) + 1; } // a wild battle cutting the walk short is not a failed plan
  if (sw) { destCache.clear(); goalCache.clear(); healTrip = null; } // re-ask heal/progress: a pressed switch changes what is closest (live/test: a stale heal goal walked back to 1F)
  return true;
}
// Session 20260927-140511: blind UP x6 / DOWN x li in the party list lost presses (test 140852: cursor ended on member 3, 2, 1
// instead of LAPRAS at 6 -> CUT/CANCEL submenu). Move by reading cursor.y: each member is 2 screen rows.
function partyCursorTo(li) {
  // Session 20260927-232731 (DEEP): "UP until the cursor stops moving" mis-read the top when a press registered late (test 232833:
  // y0=5 / y0=11 -> MAX POTION went to LAPRAS/GEODUDE instead of the HAUNTER; live logs: every correct pick had y0=1). The Gen 1
  // party list is fixed: member i's cursor row is 1 + 2*i. Step toward that row one press at a time, waiting for each to register.
  const target = 1 + 2 * li; let y0 = -1;
  for (let k = 0; k < 16; k++) {
    const s = screen(); const y = s.cursor ? s.cursor.y : -1; if (k === 0) y0 = y;
    if (y === target) break;
    press(y >= 0 && y > target ? 'UP' : 'DOWN', 4, 12);
    for (let w = 0; w < 6; w++) { const s2 = screen(); if (!s2.cursor || s2.cursor.y !== y) break; wait(4); }
  }
  const s = screen(); log(`surf: party cursor y0=${y0} now=${s.cursor && s.cursor.y} want member ${li} row ${JSON.stringify(s.cursor && s.rows[s.cursor.y])}`);
}
// back out of party submenu / party list / START menu until the overworld shows no menu (B presses can be eaten while a menu redraws)
function closeMenus() { for (let k = 0; k < 10; k++) { const s = screen(); if (!s.cursor && !s.hasTextBox && !s.waitingForA) return; press('B', 4, 16); wait(6); } }
function maybeTeachSurf(st) {
  if (surfTeachTries >= 2 || (st.badges || 0) < 6) return false;
  try {
    if (!bag().some(i => /HM03/i.test(i.name || ''))) return false;
    const p = party(), li = p.findIndex(m => /LAPRAS/i.test(m.species || ''));
    if (li < 0 || knowsSurf()) return false;
    const mon = p[li], mv = mvNames(mon);
    if (!surfTeachAsked) {
      surfTeachAsked = true;
      const c = askChoice({ lapras: `LAPRAS Lv${mon.level}`, moves: mv, map: st.map, badges: st.badges },
        `Badge 7 (BLAINE, Cinnabar Island) is only reachable over water (Route 19/20 south of Fuchsia). LAPRAS is in the party and the bag has HM03 (SURF: Water, 90 power; also lets us ride on water outside battle). Teach it now?`,
        { teach: `Teach HM03 SURF to LAPRAS now (it knows ${mv.join(', ') || 'few moves'}; HMs cannot be forgotten later)`,
          skip: 'Do not teach it (then Cinnabar stays unreachable)' }, 'teach');
      log(`HM03 decision: ${c}`);
      if (c !== 'teach') { surfTeachTries = 99; return false; }
    }
    surfTeachTries++;
    press('START', 4, 20);
    for (let k = 0; k < 8; k++) { const s = screen(); if (s.cursor && /ITEM/.test(s.rows[s.cursor.y] || '')) break; press('DOWN', 4, 10); }
    press('A', 4, 30);
    for (let k = 0; k < 25; k++) press('UP', 4, 6);
    for (let k = 0; k < 30; k++) { const c = screen(); if (c.cursor && /HM03/.test(c.rows[c.cursor.y] || '')) break; press('DOWN', 4, 16); }
    const sel = screen(); log(`teachSurf: list row ${JSON.stringify(sel.cursor && sel.rows[sel.cursor.y])}`);
    if (!(sel.cursor && /HM03/.test(sel.rows[sel.cursor.y] || ''))) { for (let k = 0; k < 4; k++) press('B', 4, 12); return false; }
    press('A', 4, 20); press('A', 4, 30); // USE
    let picked = false;
    for (let k = 0; k < 24; k++) {
      const s = screen(), t = s.rows.join('|');
      if (k < 12) log(`teachSurf screen: ${t.replace(/\s+/g, ' ').slice(0, 140)}`);
      if (/older move|make room/i.test(t) && s.cursor) { moveLearnStep(); continue; }
      if (/learned/i.test(t)) { press('A', 4, 30); break; }
      if (!picked && /on which|which POK/i.test(t)) { // party list: cursor starts on the first member
        for (let j = 0; j < 6; j++) press('UP', 4, 8);
        for (let j = 0; j < li; j++) press('DOWN', 4, 10);
        picked = true; press('A', 4, 30); continue;
      }
      press('A', 4, 30);
    }
    for (let k = 0; k < 6; k++) press('B', 4, 12);
    log(`teachSurf: try ${surfTeachTries} knowsSurf=${knowsSurf()}`);
    return true;
  } catch (e) { log(`teachSurf ${e}`); for (let k = 0; k < 4; k++) press('B', 4, 12); return false; }
}

// Session 20260927-190015: teach HM04 STRENGTH to a member the ROM says can learn it (VENUSAUR can't; GEODUDE can) for the Victory Road
// boulders. Jev decides teach/skip; mechanics copy maybeTeachSurf but WAIT for the party list to be drawn before moving the cursor.
let strTeachTries = 0, strTeachAsked = '';
function maybeTeachStrength(st) {
  if (strTeachTries >= 3 || (st.badges || 0) < 8) return false;
  try {
    const hm = bag().find(i => /HM04/i.test(i.name || '')); if (!hm) return false;
    const p = party(); if (p.some(m => mvNames(m).some(n => /STRENGTH/i.test(n)))) return false;
    const li = p.findIndex(m => { try { return new Set((rom.speciesByName(m.species) || {}).machines || []).has(hm.id); } catch (e) { return false; } });
    if (li < 0) return false;
    const mon = p[li], mv = mvNames(mon);
    if (strTeachAsked !== 'teach') {
      if (strTeachAsked === 'skip') return false;
      strTeachAsked = askChoice({ member: `${mon.species} Lv${mon.level} (party slot ${li + 1})`, moves: mv, map: st.map, badges: st.badges },
        `Victory Road is blocked by boulders that can only be pushed with STRENGTH (field move). Only ${mon.species} in the party can learn HM04 STRENGTH. Teach it now?`,
        { teach: `Teach HM04 STRENGTH (Normal, 80 power) to ${mon.species} now (knows ${mv.join(', ') || 'few moves'}; HMs cannot be forgotten)`,
          skip: 'Do not teach it (Victory Road stays blocked; we ping-pong between ROUTE_23 and VICTORY_ROAD_1F)' }, 'teach');
      log(`HM04 decision: ${strTeachAsked} for ${mon.species}`);
      if (strTeachAsked !== 'teach') return false;
    }
    strTeachTries++;
    for (let i = 0; i < 6; i++) { const s0 = screen(); if (!s0.hasTextBox && !s0.waitingForA && !s0.cursor) break; press('B', 4, 16); }
    press('START', 4, 20);
    for (let k = 0; k < 15; k++) { const s = screen(); if (s.cursor && /EXIT/.test((s.rows || []).join('|'))) break; wait(8); }
    for (let k = 0; k < 8; k++) { const s = screen(); if (s.cursor && /ITEM/.test(s.rows[s.cursor.y] || '')) break; press('DOWN', 4, 10); }
    press('A', 4, 30);
    for (let k = 0; k < 25; k++) press('UP', 4, 6);
    for (let k = 0; k < 30; k++) { const c = screen(); if (c.cursor && /HM04/.test(c.rows[c.cursor.y] || '')) break; press('DOWN', 4, 16); }
    const sel = screen();
    if (!(sel.cursor && /HM04/.test(sel.rows[sel.cursor.y] || ''))) { log('teachStrength: HM04 not found'); for (let k = 0; k < 4; k++) press('B', 4, 12); return false; }
    press('A', 4, 20); press('A', 4, 30); // USE
    let picked = false;
    for (let k = 0; k < 30; k++) {
      const s = screen(), t = s.rows.join('|');
      if (k < 10) log(`teachStrength screen: ${t.replace(/\s+/g, ' ').slice(0, 140)}`);
      if (/older move|make room|which move|forgotten/i.test(t)) { for (let w = 0; w < 12 && !screen().cursor; w++) wait(10); if (screen().cursor) { pendingTmMove = 'STRENGTH'; moveLearnStep(); continue; } }
      if (/learned/i.test(t)) { press('A', 4, 30); break; }
      if (!picked && (/ABLE/.test(t) || /on which|which POK/i.test(t))) {
        for (let w = 0; w < 20 && !screen().cursor; w++) wait(8); wait(20); // party list draws over several frames
        partyCursorTo(li); wait(10);
        picked = true; press('A', 4, 30); continue;
      }
      if (picked || k > 3) press('A', 4, 30); else wait(15);
    }
    for (let k = 0; k < 6; k++) press('B', 4, 12);
    log(`teachStrength: try ${strTeachTries} moves ${JSON.stringify(mvNames(party()[li] || {}))}`);
    return true;
  } catch (e) { log(`teachStrength ${e}`); for (let k = 0; k < 4; k++) try { press('B', 4, 12); } catch (e2) {} return false; }
}

export default function play() {
  try { if (gstate().playerName !== 'RED') intro(); } catch (e) { log(`intro error ${e}`); }
  // Session 20260927-130510: log bag once so later sessions know which TMs are available for VENUSAUR.
  // Session 20260927-142011: dump the Seafoam ladder graph from ROM (warp -> dest map + dest tile) once per process.
  try { const all = rom.maps && typeof rom.maps.values === 'function' ? [...rom.maps.values()] : Object.values(rom.maps || {});
    const byId = {}; all.forEach(m => { byId[m.id] = m; });
    all.filter(m => /SEAFOAM|ROUTE_20$/.test(m.name || '')).forEach(m => log(`romwarps ${m.name}: ${(m.warps || []).map(w => { const d = byId[w.destMap]; const dw = d && (d.warps || [])[w.destWarp]; return `(${w.x},${w.y})->${d ? d.name : w.destMap}${dw ? `(${dw.x},${dw.y})` : ''}`; }).join(' ')}`));
  } catch (e) { log(`romwarps error ${e}`); }
  try { log(`bag at start: ${bag().map(i => `${i.name}x${i.qty || i.count || 1}`).join(', ')}`); } catch (e) { log(`bag log error ${e}`); }
  for (let tick = 0; tick < 100000; tick++) {
    try {
      const st = gstate(), s = screen(), p = party();
      { const ok = !!((st.badgeBits & 16) && p.some(m => /LAPRAS/i.test(m.species || '') && mvNames(m).some(n => /SURF/i.test(n))));
        if (ok !== surfOK) { surfOK = ok; log(`surfOK=${ok} badgeBits=${st.badgeBits}`); } if (ok) WALK.add('~'); else WALK.delete('~'); }
      if (moveLearnStep()) continue;
      if (st.inBattle) { battleStep(); continue; }
      if (curBattle && !s0Busy()) noteBattleEnd();
      // gridX() is stale for a few frames after a warp (new map id, old size/tiles): let the map load first
      if (st.map !== loopMap) { loopMap = st.map; settleMap(st.map); continue; }
      if ((s.rows || []).join('|').match(/QUIT|Take your time|How many/)) { press('B', 4, 20); continue; } // leave Mart menus (A re-buys)
      // HM/TM party menu loop ('Use TM on which POKeMON?' -> A -> 'knows CUT!' -> same menu): A never escapes it, back out with B.
      if ((s.rows || []).join('|').match(/Use TM on|Use item on|on which POK|knows CUT|already knows|NOT ABLE| ABLE$|HM01/i)) { cutKnown = true; log('menu: backing out of HM/TM party menu'); for (let k = 0; k < 10; k++) press('B', 4, 16); continue; }
      // Session 20260927-063226: an open START menu / bag (cursor, no text box, EXIT or CANCEL on screen) is never a question:
      // A-spam toggled bag<->start menu for a whole live run (071815). Close it with B.
      { const sig = (s.rows || []).join('|');
        if (s.cursor && !s.waitingForA && /EXIT|CANCEL/.test(sig)) { log('menu: closing start menu/bag with B'); for (let k = 0; k < 4; k++) press('B', 4, 12); aSpam = 0; continue; }
        if (s.hasTextBox || s.waitingForA || s.cursor) { aSpam = sig === aSpamSig ? aSpam + 1 : 0; aSpamSig = sig; aRun++; if (aSpam > 12 || aRun > 80) { aRun = 0; log('menu: same screen after 12 A presses, backing out with B'); for (let k = 0; k < 4; k++) press('B', 4, 12); aSpam = 0; unstickTalk(); continue; } } }
      if (s.hasTextBox || s.waitingForA || s.cursor) {
        const t = (s.dialog || '').toString().slice(0, 80); if (t && lastTexts[lastTexts.length - 1] !== t) { lastTexts.push(t); if (lastTexts.length > 8) lastTexts.shift(); textSeen[t] = (textSeen[t] || 0) + 1; if (textSeen[t] > 4) { for (const k in textSeen) delete textSeen[k]; log(`text loop: "${t}" shown 5x`); unstickTalk(); continue; } }
        press('A', 4, 12); continue; }
      for (const k in textSeen) delete textSeen[k];
      aRun = 0;
      if (st.map === 'REDS_HOUSE_2F') { goWarp('REDS_HOUSE_1F'); continue; }
      if (st.map === 'REDS_HOUSE_1F') {
        if (p.length && hpFrac(p) < 1 && goal(st, p) === 'heal' && talkToMom()) continue;
        goWarp('previous'); continue;
      }
      if (p.length === 0) {
        if (st.map === 'PALLET_TOWN') { walkTo(10, 1, 30); press('A'); continue; }
        if (st.map === 'OAKS_LAB') {
          const [bx, by] = STARTERS[pickStarter()];
          if (walkTo(bx, by + 1, 40)) { hold('UP', 2); wait(8); press('A', 4, 20); }
          continue;
        }
      }
      // Bill's Cell Separator (mechanics of the story event): after Bill says 'run the Cell Separation System', wait for him to walk
      // into the teleporter, then use his PC at (1,4) facing UP. Tried at most 3x per session.
      if (st.map === 'BILLS_HOUSE' && billPcTries < 3 && lastTexts.slice(-6).some(t => /Cell Separation/.test(t))) {
        billPcTries++; wait(240);
        const ok = walkTo(1, 5, 40);
        if (ok) { hold('UP', 2); wait(8); for (let i = 0; i < 20; i++) press('A', 4, 20); }
        log(`bill pc: try ${billPcTries} walk=${ok} text=${JSON.stringify(lastTexts.slice(-3))}`);
        continue;
      }
      if (tmTeachTries < 2 && !st.inBattle && !s0Busy() && maybeTeachTM()) continue;
      if (leadTmTries < 6 && !st.inBattle && !s0Busy() && maybeTeachLeadTM(st)) continue;
      if (pcSwapTries < 2 && !st.inBattle && !s0Busy() && maybePcSwap(st)) continue;
      if (surfTeachTries < 2 && !st.inBattle && !s0Busy() && maybeTeachSurf(st)) continue;
      if (strTeachTries < 3 && !st.inBattle && !s0Busy() && maybeTeachStrength(st)) continue;
      if (strengthMap && st.map !== strengthMap) strengthMap = ''; // STRENGTH switches off on every map change
      if (st.map === 'VICTORY_ROAD_1F' && !st.inBattle && !s0Busy() && solveVR1F(st)) continue;
      if (VR_SWITCHES[st.map] && !st.inBattle && !s0Busy() && solveVRBoulder(st)) continue;
      if (/VICTORY_ROAD/.test(st.map) && !gridDumped[st.map] && !st.inBattle) { gridDumped[st.map] = 1; try { const gg = grid(); log(`griddump ${st.map} ${gg.width}x${gg.height} npcs=${JSON.stringify(gg.npcs).slice(0, 600)} warps=${JSON.stringify(gg.warps).slice(0, 400)}`); gg.rows.forEach((r, i) => log(`griddump ${st.map} r${i} ${r}`)); log(`griddump ${st.map} blocked=${JSON.stringify(gg.blockedMoves).slice(0, 800)}`); } catch (e) { log(`griddump err ${e}`); } }
      if (cutTeachTries < 2 && (st.badges || 0) >= 2 && checkCut() && !knowsCut() && !/_POKECENTER|_MART/.test(st.map)) { teachCut(); continue; }
      // Jev decides the overworld goal (progress / heal / train); code carries it out.
      // Carry out a heal decision made outside: once inside the Pokemon Center, heal before asking Jev again (live 034318 looped
      // Lavender town -> center -> 'progress' -> town -> 'heal' because the center's own question never offered heal).
      if (pendingHeal && st.map === 'INDIGO_PLATEAU_LOBBY' && lobbyHealFails < 2) { pendingHeal = false; lobbyHeal(); continue; }
      if (pendingHeal && /_POKECENTER$/.test(st.map) && (healFails['PC|' + st.map] || 0) < 2) { pendingHeal = false; log('pendingHeal: healing in ' + st.map); healAtCenter(); continue; }
      // Session 20260927-221230: E4 healing items (Jev decides what to buy in the lobby and whom to heal between rooms).
      if (st.map !== 'INDIGO_PLATEAU_LOBBY') shopLeftLobby = true;
      try { if (!st.inBattle && st.map === 'INDIGO_PLATEAU_LOBBY' && !s0Busy() && maybeLobbyShop(st)) continue; } catch (e) { log(`lobbyShop err ${e}`); }
      try { if (!st.inBattle && /^(LORELEIS|BRUNOS|AGATHAS|LANCES|CHAMPIONS)_ROOM$/.test(st.map) && !s0Busy() && maybeFieldHeal(st)) continue; } catch (e) { log(`fieldHeal err ${e}`); }
      const gl = goal(st, p);
      if (gl === 'heal') pendingHeal = true; else if (!/_POKECENTER$/.test(st.map)) pendingHeal = false;
      if (gl === 'heal') {
        if (st.map === 'PALLET_TOWN') { goWarp('REDS_HOUSE_1F'); continue; }
        if (st.map === 'ROUTE_1') { walkEdge('south'); continue; }
        if (st.map === 'VERMILION_GYM') { goWarp('previous'); continue; }
        const lg = (/^VICTORY_ROAD_[23]F$/.test(st.map) && vrSw2()) ? null : { VICTORY_ROAD_1F: () => goWarp('ROUTE_23'), VICTORY_ROAD_2F: () => goWarp('VICTORY_ROAD_1F'), ROUTE_23: () => { if (st.x >= 10 && st.y < 40) return walkEdge('north'); const r = goWarp('ROUTE_22_GATE') || walkEdge('south'); if (!r && !edgeDump.r23full) { edgeDump.r23full = 1; try { const g = gridX(); log(`r23dump surf=${JSON.stringify(gstate().surfing)} npcs=${JSON.stringify(g.npcs)} rows ${g.rows.map((x, i) => i + ':' + x).slice(76).join('|')}`); } catch (e) {} } return r; }, ROUTE_22_GATE: () => goWarp('ROUTE_22') || walkEdge('south'), ROUTE_22: () => walkEdge('east') }[st.map];
        // Session 20260927-212516: test 212806: Jev picked heal after 2F switch2; the VR 2F exit lands on Route 23 (14,32), a pocket walled
        // off from the south ("walkEdge south: edge tile blocked beyond" x5, "goWarp ROUTE_22_GATE failed") -> bot wandered back into 2F.
        // The nearest Pokemon Center from there is the Indigo Plateau lobby, north.
        if (st.map === 'INDIGO_PLATEAU') { if (!goWarp('INDIGO_PLATEAU_LOBBY')) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'INDIGO_PLATEAU_LOBBY') { if (lobbyHealFails < 2) lobbyHeal(); else { pendingHeal = false; healTrip = null; goalCache.clear(); wait(10); } continue; }
        if (lg) { let ok = false; try { ok = lg(); } catch (e) { log('leagueHeal ' + e); } if (!ok && gstate().map === st.map) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); } continue; }
        // Route 10 south part (past Rock Tunnel): the nearest Pokemon Center is Lavender's, just south (the Route 10 PC is unreachable).
        if (st.map === 'ROUTE_10' && st.y > 40) { if (!walkEdge('south')) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'LAVENDER_TOWN') { goWarp('LAVENDER_POKECENTER'); if (gstate().map === st.map) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'ROUTE_10') { if (!goWarp('ROCK_TUNNEL_POKECENTER')) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'ROUTE_9') { if (!walkEdge('east')) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'ROUTE_11') { if (!walkEdge('west')) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        const sw = /^SILPH_CO_(\d+)F$/.exec(st.map);
        if (sw) { // Session 20260927-095229: Silph heal route: stairs down floor by floor, then out to Saffron
          const ok = sw[1] === '1' ? (goWarp('SAFFRON_CITY') || goWarp('previous')) : goWarp('SILPH_CO_' + (sw[1] - 1) + 'F');
          if (!ok && gstate().map === st.map) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); }
          continue;
        }
        if (st.map === 'SAFFRON_CITY') { goWarp('SAFFRON_POKECENTER'); if (gstate().map === st.map) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); } continue; }
        const tw = /^POKEMON_TOWER_([1-7])F$/.exec(st.map);
        if (tw) { // Session 20260927-052226: tower heal route: stairs down floor by floor, then out to Lavender
          const ok = goWarp(tw[1] === '1' ? 'LAVENDER_TOWN' : 'POKEMON_TOWER_' + (tw[1] - 1) + 'F');
          if (!ok && gstate().map === st.map) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); }
          continue;
        }
        if (/ROCKET_HIDEOUT_B[2-4]F/.test(st.map)) { // Session 20260927-040725: hideout heal route (elevator with LIFT KEY, else stairs up)
          const g = gridX(), el = (g.warps || []).find(w => /ELEVATOR/.test(w.to || ''));
          const up = { ROCKET_HIDEOUT_B2F: 'ROCKET_HIDEOUT_B1F', ROCKET_HIDEOUT_B3F: 'ROCKET_HIDEOUT_B2F', ROCKET_HIDEOUT_B4F: 'ROCKET_HIDEOUT_B3F' }[st.map];
          const ok = checkLiftKey() && el && pathDir(g, el.x, el.y) ? goWarp('ROCKET_HIDEOUT_ELEVATOR') : goWarp(up);
          if (!ok && gstate().map === st.map) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); }
          continue;
        }
        if (st.map === 'ROCKET_HIDEOUT_B1F') { if (!goWarp('GAME_CORNER') && gstate().map === st.map) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'GAME_CORNER') { goWarp('previous'); if (gstate().map === st.map) { healFails['PC|' + st.map] = (healFails['PC|' + st.map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'PEWTER_CITY' || st.map === 'CELADON_CITY' || st.map === 'VIRIDIAN_CITY' || st.map === 'CERULEAN_CITY' || st.map === 'VERMILION_CITY') { goWarp(st.map.replace('_CITY', '_POKECENTER')); continue; }
        if (st.map === 'CERULEAN_GYM') { goWarp('previous'); continue; }
        // Session 20260927-083228: heal trips from the Fuchsia gym/city (no branch existed; Koga fights used Lv20 Gastly with a low-PP lead).
        if (st.map === 'FUCHSIA_GYM') { goWarp('previous'); continue; }
        if (st.map === 'FUCHSIA_CITY') { if (!goWarp('FUCHSIA_POKECENTER')) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'PEWTER_GYM') { goWarp('previous'); continue; }
        if (st.map === 'ROUTE_24' || st.map === 'ROUTE_25') { if (!walkEdge(st.map === 'ROUTE_24' ? 'south' : 'west')) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'BILLS_HOUSE') { goWarp('previous'); continue; }
        if (st.map === 'ROUTE_3') { if (!walkEdge('west')) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'ROUTE_4') { if (!goWarp('MT_MOON_POKECENTER')) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'MT_MOON_1F') { goWarp('previous'); if (gstate().map === 'MT_MOON_1F') { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (st.map === 'MT_MOON_B1F' || st.map === 'MT_MOON_B2F') { const up = st.map === 'MT_MOON_B1F' ? 'MT_MOON_1F' : 'MT_MOON_B1F'; goWarp(up); if (gstate().map === st.map) { healFails['PC|' + gstate().map] = (healFails['PC|' + gstate().map] || 0) + 1; goalCache.clear(); } continue; }
        if (/_POKECENTER$/.test(st.map)) { if (healAtCenter()) goWarp('previous'); continue; }
      }
      if (gl === 'shop') {
        if (/_MART$/.test(st.map)) { buyBalls(st); continue; }
        const tm = { CERULEAN_CITY: 'CERULEAN_MART', VERMILION_CITY: 'VERMILION_MART', LAVENDER_TOWN: 'LAVENDER_MART', CELADON_CITY: 'CELADON_MART_1F', PEWTER_CITY: 'PEWTER_MART', VIRIDIAN_CITY: 'VIRIDIAN_MART' }[st.map];
        if (tm) { log(`shop: walking to ${tm}`); goWarp(tm); if (gstate().map === st.map) { martWalkFails[st.map] = (martWalkFails[st.map] || 0) + 1; goalCache.clear(); } else goalCache.clear(); continue; }
      }
      try { if (elevatorStep(st)) continue; } catch (e) { log(`elevator ${e}`); }
      if (gl === 'train' && trainStep()) continue;
      if (gl === 'train' && st.map === 'PEWTER_GYM') { goWarp('previous'); continue; }
      if (gl === 'train' && st.map === 'PEWTER_CITY' && !hasBadge1) { walkEdge('south'); continue; }
      // Jev picks a destination (door or map edge); code walks there. Stuck -> mark failed, ask again.
      goDest(st);
    } catch (e) { log(`loop error ${e}`); wait(30); }
  }
}

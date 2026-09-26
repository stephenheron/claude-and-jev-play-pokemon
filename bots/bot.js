// Session 1 bot: intro -> explore with Jev choosing destinations -> Jev picks starter.
import { isNamePrompt, choose } from './helpers.js';

const DIRS = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
const WALK = new Set(['.', ',', 'D', '@']);
const memory = { tried: {}, cache: {}, failed: {} }; // tried[map|target] = count of failed/visited

function nearestCenter(st) {
  const m = st.map + '', x = st.x || 0;
  if (/CERULEAN|ROUTE_24|ROUTE_25|ROUTE_5|ROUTE_9/.test(m) || (m === 'ROUTE_4' && x >= 22)) return 'nearest is CERULEAN_POKECENTER in CERULEAN_CITY (east along ROUTE_4); going back west through Mt Moon is much farther';
  if (/MT_MOON|ROUTE_4|ROUTE_3/.test(m)) return 'nearest is MT_MOON_POKECENTER on ROUTE_4 at the Mt Moon (west) entrance; from inside MT_MOON, leave via the 1F entrance toward ROUTE_4 west - but if you are already past the B2F (5,7) ladder / on B1F east, pushing on to ROUTE_4 east then CERULEAN_POKECENTER is closer';
  if (/VIRIDIAN_FOREST|PEWTER/.test(m)) return 'nearest is PEWTER_POKECENTER in PEWTER_CITY';
  return 'nearest is VIRIDIAN_POKECENTER in VIRIDIAN_CITY';
}
function safeChoose(ctx, q, opts, fallback) {
  try { const r = choose(ctx, q, opts); log(`jev: ${q} -> ${r.choice} (${(r.confidence ?? 0).toFixed?.(2)})`); return r.choice; }
  catch (e) { log(`jev failed: ${e && e.message}`); return fallback; }
}

function advanceText(s) {
  if (isNamePrompt(s)) { press('DOWN'); press('A', 4, 20); return true; }
  const d = (s.dialog || '').toLowerCase();
  if (d.includes('nickname') && s.cursor) { press('B', 4, 20); return true; }
  if (s.waitingForA || s.hasTextBox || s.cursor) { press('A', 4, 20); return true; }
  return false;
}

function bfs(g, tx, ty, adjacentOk, ignoreNpcs) {
  const rows = g.rows, W = g.width, H = g.height;
  const blocked = new Set(ignoreNpcs ? [] : (g.npcs || []).map(n => `${n.x},${n.y}`));
  // grid().blockedMoves: steps the game refuses between two walkable squares (cave/forest elevation). Invisible in rows.
  const noGo = new Set((g.blockedMoves || []).map(b => `${b.x},${b.y},${String(b.dir).toUpperCase()}`));
  const sx = g.player.x, sy = g.player.y;
  const prev = new Map([[`${sx},${sy}`, null]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    const atGoal = (x === tx && y === ty) || (adjacentOk && Math.abs(x - tx) + Math.abs(y - ty) === 1);
    if (atGoal) {
      const path = []; let k = `${x},${y}`;
      while (prev.get(k)) { const [d, pk] = prev.get(k); path.unshift(d); k = pk; }
      return path;
    }
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(k)) continue;
      if (noGo.has(`${x},${y},${d}`)) continue;
      const c = rows[ny][nx];
      // ledge: one hop in its direction lands two tiles on (one-way); was treated as a wall, so ROUTE_4 east looked unreachable
      const LEDGE = { v: 'DOWN', '<': 'LEFT', '>': 'RIGHT', '^': 'UP' };
      if (LEDGE[c]) {
        if (LEDGE[c] !== d) continue;
        const lx = nx + dx, ly = ny + dy, lk = `${lx},${ly}`;
        if (lx < 0 || ly < 0 || lx >= W || ly >= H || prev.has(lk) || blocked.has(lk) || !WALK.has(rows[ly][lx])) continue;
        prev.set(lk, [d, `${x},${y}`]); q.push([lx, ly]); continue;
      }
      if (blocked.has(k) || !WALK.has(c)) {
        if (!(nx === tx && ny === ty && c !== '#')) continue;
      }
      prev.set(k, [d, `${x},${y}`]); q.push([nx, ny]);
    }
  }
  return null;
}

// Walk to a target; returns true if reached. Interrupts on text/battle/map change.
function walkTo(tx, ty, opts = {}) {
  const startMap = state().map;
  let lastPos = '', stall = 0;
  for (let step = 0; step < 120; step++) {
    const st = state(), s = screen();
    // give up if pushing into an invisible wall (e.g. gate door tile that is really wall) - was 120 UP presses in a row
    const pos = `${st.x},${st.y}`; stall = pos === lastPos ? stall + 1 : 0; lastPos = pos;
    if (stall >= 6) return false;
    if (st.map !== startMap || st.inBattle) return true;
    if (s.hasTextBox || s.waitingForA) { advanceText(s); continue; }
    if (st.x === tx && st.y === ty) return true;
    if (opts.adjacent && Math.abs(st.x - tx) + Math.abs(st.y - ty) === 1) return true;
    const path = bfs(grid(), tx, ty, opts.adjacent);
    if (!path) return false;
    if (!path.length) return true;
    hold(path[0], 16); wait(4);
  }
  return false;
}

function stepOffEdge(dir) { for (let i = 0; i < 4; i++) { hold(dir, 16); wait(4); } }

// Mechanics only: describe the current story stage from game flags so Jev knows what "progress" means now.
function ev(n) { try { return !!event(n); } catch (e) { return false; } }
function hasItem(name) { try { return (bag() || []).some(i => ((i.name || i.item || '') + '').toUpperCase().includes(name)); } catch (e) { return false; } }
function storyGoal(st, pty) {
  const base = 'Beat Pokemon Red (become Champion). ';
  if (!pty.length) return base + 'Now: get a starter from Professor Oak in OAKS_LAB (Oak stops you at the north edge of Pallet Town if you have no Pokemon).';
  if (hasItem('PARCEL')) return base + "Now: you carry OAK's PARCEL. Deliver it to Professor Oak in OAKS_LAB, Pallet Town (south from Viridian City via ROUTE_1).";
  if (!ev('EVENT_OAK_GOT_PARCEL') && !ev('EVENT_GOT_OAKS_PARCEL')) return base + "Now: go north via ROUTE_1 to VIRIDIAN_CITY and enter the Poke Mart (VIRIDIAN_MART door) to receive OAK's PARCEL. ROUTE_22 (west of Viridian) is a detour - avoid it for now.";
  if (!ev('EVENT_GOT_POKEDEX')) return base + 'Now: talk to Professor Oak in OAKS_LAB to get the Pokedex.';
  const lead = pty[0] || {}, lv = lead.level || 0, hpPct = Math.round(100 * (lead.hp || 0) / (lead.maxHp || 1));
  const ready = (st.badges || 0) < 1 ? ` Status for Brock: lead ${lead.species || '?'} is Lv${lv} at ${hpPct}% HP. Brock has Geodude Lv12 and Onix Lv14; a lone Lv10 Squirtle already lost to him. ${lv < 13 ? 'Level is TOO LOW: train first by walking in tall grass (ROUTE_2, VIRIDIAN_FOREST, ROUTE_1) and fighting wild Pokemon until ~Lv13-14.' : (hpPct >= 90 ? 'READY for Brock: level OK and HP full - head straight to PEWTER_GYM now; no more training needed.' : 'Level is OK for Brock.')} ${hpPct < 90 ? 'HP not full: heal at the nearest *POKECENTER* (talk to the nurse) before entering PEWTER_GYM.' : ''}` : '';
  const lowHp = hpPct < 50 && !/POKECENTER/.test(st.map + '') ? ` HP IS LOW (${hpPct}%) and you have no Potions: STOP training and walk to the nearest Pokemon Center NOW (${nearestCenter(st)}), then talk to the nurse. Fainting costs half your money.` : '';
  if (lowHp) return base + lowHp + ready;
  if ((st.badges || 0) < 1 && /GYM/.test(st.map + '')) return base + ready + (lv < 13 || hpPct < 90 ? ' Since you are under-leveled or hurt, LEAVING the gym (exit door) to heal/train is the right move now unless Brock is already mid-fight.' : '') + ' Now: you are INSIDE PEWTER_GYM. Progress = battle the gym trainer(s) and then Brock (the gym leader at the back/top of the gym) by walking up and talking to them. Leaving the gym only makes sense if the party needs healing at PEWTER_POKECENTER first. Squirtle Water moves (Bubble/Water Gun) are super effective vs his Rock Pokemon.';
  if ((st.badges || 0) < 1) return base + ready + ' Now: go north from VIRIDIAN_CITY through ROUTE_2 and VIRIDIAN_FOREST to PEWTER_CITY and beat Brock at PEWTER_GYM (Rock type; Water/Grass moves are strong). Train on the way if levels are low (~Lv12+).';
  if ((st.badges || 0) === 1) {
    const m = st.map + '';
    const hp = hpPct < 90 ? ` Lead ${lead.species || '?'} is Lv${lv} at ${hpPct}% HP: heal at the nearest *POKECENTER* before long routes (PEWTER_POKECENTER in Pewter, MT_MOON_POKECENTER at the Route 3/Mt Moon entrance, CERULEAN_POKECENTER after).` : '';
    let where = ' Next target: Misty (Water) at CERULEAN_GYM for badge 2. Route: from PEWTER_CITY take the EAST exit to ROUTE_3 (trainers + grass; train there), go east/north along ROUTE_3 to ROUTE_4 and the MT_MOON entrance (MT_MOON_POKECENTER is next to it), cross MT_MOON (floors 1F/B1F/B2F; path: 1F ladder down -> B1F -> ladder down to B2F -> the right B2F ladder up to the B1F east part -> exit to ROUTE_4 east; leaving 1F by its entrance is backwards), then ROUTE_4 east to CERULEAN_CITY. Do NOT go back south to VIRIDIAN/ROUTE_2 - that is backwards.';
    if (/PEWTER_GYM/.test(m)) where = ' You already beat Brock (Boulder Badge). LEAVE PEWTER_GYM via its exit door; nothing more to do here.' + where;
    if (/MT_MOON/.test(m) && !/POKECENTER/.test(m)) where += ' You are in MT_MOON: explore toward unvisited ladders/exits; trainers and wild Zubat/Geodude appear.';
    if (/CERULEAN_GYM/.test(m)) where = ` You are INSIDE CERULEAN_GYM. Lead is Lv${lv} - well above Misty (Staryu Lv18, Starmie Lv21), so battle her now: talk to the GYM LEADER at the top. Gym trainers already beaten need no second talk. Only leave to heal at CERULEAN_POKECENTER (restores HP and move PP) if HP is under ~60% or your best neutral move (BITE) is nearly out of PP.`;
    else if (/CERULEAN/.test(m)) where = ' You are in Cerulean. Heal at CERULEAN_POKECENTER, train to ~Lv21+ (Misty has Starmie Lv21) then beat Misty at CERULEAN_GYM. Water moves are weak vs her; Normal moves (Bite/Tackle) are neutral.';
    return base + where + hp + ' Status moves waste turns; prefer damaging moves.';
  }
  return base + 'Now: collect the next gym badge; follow the story route.';
}

// Mechanics: name NPCs by their sprite picture id (pokered SPRITE_* order) so Jev knows who it would talk to.
const SPRITE_NAMES_BASE = ['?', 'the player', 'your rival', 'Professor Oak', 'a boy', 'a slowpoke', 'a bug catcher', 'a girl', 'a little girl', 'a fisher', 'a cooltrainer', 'a girl', 'a lass', 'a guard', 'a scientist', 'a gambler', 'a Rocket grunt', 'a woman', 'a biker', 'a gym guide', 'a Poke Mart clerk', 'a fisher', 'a gentleman', 'Nurse Joy / nurse', 'a man', 'a clerk', 'a cooltrainer', 'a monster', 'a little boy', 'a boy', 'a gym leader'];
const SPRITE_NAMES = SPRITE_NAMES_BASE.slice(); SPRITE_NAMES[12] = 'a Super Nerd [PROGRESS on Mt Moon B2F: battle him first, he guards the fossils]'; SPRITE_NAMES[14] = 'a Hiker'; SPRITE_NAMES[24] = 'a Rocket grunt (optional trainer battle, not needed for progress)'; SPRITE_NAMES[61] = 'a Poke Ball item (pick it up)'; SPRITE_NAMES[62] = 'a FOSSIL [PROGRESS on Mt Moon B2F after the Super Nerd is beaten: take one (answer YES), then use ladder (5,7)]';
function npcWho(n) {
  try { const sp = (sprites() || []).find(s => s.index === n.index); if (sp && sp.picture != null) { const nm = SPRITE_NAMES[sp.picture]; return (nm && nm !== '?' ? nm : 'an NPC/object') + ` (sprite ${sp.picture})`; } } catch (e) {}
  return 'the NPC/object';
}

// in gyms: the NPC nearest the top is the leader; the one at the entrance (bottom) is the advice guy; others are gym trainers.
function gymWho(g, n) {
  const ns = g.npcs || [];
  const minY = Math.min(...ns.map(o => o.y)), maxY = Math.max(...ns.map(o => o.y));
  if (n.y === minY) return /CERULEAN/.test(g.map + '') ? 'the GYM LEADER Misty (Staryu Lv18, Starmie Lv21, Water; beat her for the Cascade Badge = badge 2, main progress)' : 'the GYM LEADER (Brock in PEWTER_GYM; beat him for the Boulder Badge)';
  if (ns.length > 2 && n.y === maxY && n.y >= g.height - 4) return 'the gym guide near the entrance (gives advice only, no battle)';
  return 'a gym trainer (battle for EXP and money; blocks the path to the leader)';
}

// Map knowledge (not strategy): which Mt Moon warps go forward vs back, so Jev can judge ladders.
function moonNote(from, to, w) {
  from = from + ''; to = to + ''; const at = w ? `${w.x},${w.y}` : '';
  // Ground truth from the ROM map data (operator note after session 183819).
  if (from === 'MT_MOON_1F' && to === 'ROUTE_4') return ' [BACKWARDS: Mt Moon WEST entrance, leads back out toward ROUTE_3]';
  if (from === 'MT_MOON_1F' && to === 'MT_MOON_B1F') return at === '5,5' ? ' [PROGRESS: the ONLY 1F ladder on the route through Mt Moon (top-left, Hiker below it)]' : ' [DEAD END: this ladder leads to a sealed side pocket, not the way through; use the (5,5) ladder]';
  if (from === 'MT_MOON_B1F' && to === 'MT_MOON_1F') return ' [ladder back UP to 1F (backwards)]';
  if (from === 'MT_MOON_B1F' && to === 'MT_MOON_B2F') return at === '21,17' ? ' [PROGRESS: ladder down to the B2F main area (route: battle Super Nerd, take a fossil, then B2F ladder (5,7))]' : ' [DEAD END: leads to a sealed/raised side area of B2F (Rockets, items), not the way through]';
  // Live run 20260926-200517-813: the B1F exit warp reports its destination as 'the previous map', so match it by coordinate too.
  if (from === 'MT_MOON_B1F' && (at === '27,3' || at === '26,3') && to !== 'MT_MOON_B2F' && to !== 'MT_MOON_1F') return ' [PROGRESS: Mt Moon EAST exit -> ROUTE_4 east toward CERULEAN (the goal side); only reachable from the east part of B1F (arrive via the B2F ladder (5,7))]';
  if (from === 'MT_MOON_B1F' && to === 'ROUTE_4') return ' [PROGRESS: Mt Moon EAST exit -> ROUTE_4 east toward CERULEAN (the goal side)]';
  if (from === 'MT_MOON_B2F' && to === 'MT_MOON_B1F') return at === '5,7' ? ' [PROGRESS: leads to the east part of B1F with the exit to ROUTE_4 east/Cerulean; only reachable after battling the Super Nerd near (12,8) and taking a fossil at (12,6)/(13,6)]' : ' [ladder back up to B1F (backwards/side area)]';
  if (from === 'ROUTE_4' && to === 'MT_MOON_1F' && w && w.x >= 18 && (state().x || 0) >= 22) return ' [BACKWARDS: you are already on the EAST side of Mt Moon; go east (exit_east, jump ledges down) to CERULEAN_CITY]';
  if (from === 'ROUTE_4' && to === 'MT_MOON_1F') return ' [PROGRESS: Mt Moon entrance - the only way east to Cerulean from here]';
  return '';
}

function explore() {
  // Mechanics: right after a warp the map/NPC data can still be the previous map's (e.g. PEWTER_POKECENTER at Pewter's door coords,
  // no nurse option). Let the new map settle before building options.
  let st0 = state();
  if (st0.map !== memory.lastExploreMap) { for (let i = 0; i < 3; i++) { wait(60); const s1 = state(); if (s1.map === st0.map && s1.x === st0.x && s1.y === st0.y) break; st0 = s1; } memory.lastExploreMap = state().map; memory.visitedMaps = memory.visitedMaps || {}; memory.visitedMaps[memory.lastExploreMap] = (memory.visitedMaps[memory.lastExploreMap] || 0) + 1; memory.mapHistory = (memory.mapHistory || []).concat([memory.lastExploreMap]).slice(-30); }
  let g = grid(), st = state();
  if (g && (g.map !== st.map || st.x >= g.width || st.y >= g.height)) { wait(90); g = grid(); st = state(); }
  const pty = party() || [];
  const opts = {}, actions = {};
  // Fact for Jev: detect ping-pong between two maps (live run 20260926-190408-337 bounced ROUTE_3 <-> ROUTE_4 ~10 times).
  const hist = memory.mapHistory || [];
  let curW = null;
  const backNote = (to) => {
    let bounces = 0;
    for (let i = 1; i < hist.length; i++) if ((hist[i - 1] === to && hist[i] === g.map) || (hist[i - 1] === g.map && hist[i] === to)) bounces++;
    const cameFrom = hist.length >= 2 && hist[hist.length - 2] === to;
    if (!cameFrom && bounces < 4) return '';
    return `; ${cameFrom ? `you JUST CAME FROM ${to} (going there is backtracking)` : ''}${bounces >= 4 ? `${cameFrom ? ', ' : ''}moved between here and ${to} ${bounces} times recently - a LOOP${/\[PROGRESS/.test(moonNote(g.map, to, curW)) ? ' (but this is the marked route; go there and do the next route step instead of turning back)' : ', not progress; pick something else'}` : ''}`;
  };
  for (const w of g.warps || []) {
    const name = `door_${w.x}_${w.y}`;
    curW = w;
    const tried = memory.tried[`${g.map}|${name}`] || 0;
    const to = (w.to || w.map || w.dest || '?') + '';
    const gymExit = /GYM/.test(g.map + '') ? ' (EXITS the gym back to the city - no progress unless you must heal at the Pokemon Center or restore move PP first)' : '';
    let noPath = false; try { noPath = !bfs(g, w.x, w.y) && !bfs(g, w.x, w.y, true); } catch (e) {}
    // Fact for Jev: live run 20260926-192931-238 looped B1F<->B2F because the B2F ladder (5,7) was 'unreachable' only because NPCs/fossils stand in the path.
    let npcBlock = '';
    if (noPath) { try { const p2 = bfs(g, w.x, w.y, false, true) || bfs(g, w.x, w.y, true, true); if (p2) { noPath = false; let x = g.player.x, y = g.player.y; const on = new Set((g.npcs || []).map(n => `${n.x},${n.y}`)); for (const d of p2) { x += DIRS[d][0]; y += DIRS[d][1]; if (on.has(`${x},${y}`)) { const n = g.npcs.find(n => n.x === x && n.y === y); npcBlock = ` [BLOCKED BY A PERSON/OBJECT at (${x},${y})${n && n.name ? ' ' + n.name : ''}: the only path passes it - talk to / battle it (or take the item) first, then this becomes reachable]`; break; } } } } catch (e) {} }
    const edgeDoor = w.y === 0 || w.y === g.height - 1 || w.x === 0 || w.x === g.width - 1;
    if (noPath && !edgeDoor && (Math.abs(w.x - st.x) + Math.abs(w.y - st.y)) > 1) noPath = true; else noPath = false;
    opts[name] = `Door/stairs at (${w.x},${w.y}) leading to ${to}${gymExit}${moonNote(g.map, to, w)} (${(memory.visitedMaps || {})[to] ? `already visited ${to} ${memory.visitedMaps[to]} times` : 'NOT visited yet this run - new area'}); ${Math.abs(w.x - st.x) + Math.abs(w.y - st.y)} tiles away; used ${tried} times already, ${memory.failed[`${g.map}|${name}`] || 0} of them failed to go through${backNote(to)}${noPath ? ' [UNREACHABLE: no walkable path from where you stand in this part of the map - pick a reachable ladder/door instead]' : ''}${npcBlock}`;
    actions[name] = () => {
      const m = state().map;
      // mechanics: no path -> don't mash directions (live: on MT_MOON_B1F that stepped back onto the arrival ladder to 1F every time)
      if (noPath) { memory.failed[`${g.map}|${name}`] = (memory.failed[`${g.map}|${name}`] || 0) + 1; return; }
      if (!walkTo(w.x, w.y)) walkTo(w.x, w.y, { adjacent: true });
      wait(30);
      if (state().map !== m) return;
      // edge doors: the warp tile may be drawn one tile off; try standing below/above each neighbour column and pushing out.
      if (w.y === 0 || w.y === g.height - 1) {
        const inY = w.y === 0 ? 1 : w.y - 1, D = w.y === 0 ? 'UP' : 'DOWN';
        for (const xx of [w.x, w.x + 1, w.x - 1]) {
          if (state().map !== m) return;
          if (walkTo(xx, inY)) { hold(D, 16); wait(30); hold(D, 16); wait(30); }
        }
        if (state().map !== m) return;
      }
      // step INTO the door first: toward it if adjacent, else off the map edge it sits on (gate doors at y=0 need UP).
      // Old order pressed DOWN first, which walked away from edge doors and looped forever in VIRIDIAN_FOREST_SOUTH_GATE.
      const p = state(), order = [];
      const dx = w.x - p.x, dy = w.y - p.y;
      if (dx || dy) order.push(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP'));
      if (w.y === 0) order.push('UP'); if (w.y === g.height - 1) order.push('DOWN');
      if (w.x === 0) order.push('LEFT'); if (w.x === g.width - 1) order.push('RIGHT');
      for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT']) if (!order.includes(d)) order.push(d);
      for (const d of order) {
        if (state().map !== m) break;
        hold(d, 16); wait(30);
        const q = state();
        if (q.map === m && (q.x !== w.x || q.y !== w.y) && (Math.abs(q.x - w.x) + Math.abs(q.y - w.y)) > 1) { walkTo(w.x, w.y) || walkTo(w.x, w.y, { adjacent: true }); }
      }
    };
  }
  const ex = g.exits || {};
  const exList = Array.isArray(ex) ? ex.map(e => [e.side || e.dir, e]) : Object.entries(ex);
  for (const [dir, info] of exList) {
    if (!info || !dir) continue;
    const name = `exit_${dir}`;
    const tried = memory.tried[`${g.map}|${name}`] || 0;
    const to = typeof info === 'string' ? info : (info.to || info.map || JSON.stringify(info).slice(0, 60));
    opts[name] = `Leave the map to the ${dir}, towards ${to}; used ${tried} times already, ${memory.failed[`${g.map}|${name}`] || 0} of them failed to leave the map${backNote(to)}`;
    const D = { north: 'UP', south: 'DOWN', west: 'LEFT', east: 'RIGHT' }[dir];
    actions[name] = () => {
      // walk to the furthest walkable tile on that edge, then step off
      // candidates sorted by distance; use the nearest one BFS can actually reach (closest may be walled off / behind ledges)
      const cands = [];
      for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
        const onEdge = (dir === 'north' && y === 0) || (dir === 'south' && y === g.height - 1) || (dir === 'west' && x === 0) || (dir === 'east' && x === g.width - 1);
        if (onEdge && WALK.has(g.rows[y][x])) cands.push({ x, y, d: Math.abs(x - st.x) + Math.abs(y - st.y) });
      }
      cands.sort((a, b) => a.d - b.d);
      const best = cands.find(c => bfs(g, c.x, c.y)) || cands[0];
      if (best) { walkTo(best.x, best.y); stepOffEdge(D); }
    };
  }
  (g.npcs || []).slice(0, 10).forEach((n, i) => {
    const name = `talk_${i}`;
    const tried = memory.tried[`${g.map}|${name}`] || 0;
    const isNurse = /POKECENTER/.test(g.map + '') && n.y <= 2 && Math.abs(n.x - 3) <= 1;
    opts[name] = isNurse
      ? `Talk to the Pokemon Center nurse at (${n.x},${n.y}) across the counter: fully heals the whole party (HP and poison) for free; talked ${tried} times already`
      : /GYM/.test(g.map + '') ? `Talk to ${gymWho(g, n)} at (${n.x},${n.y}) to start a battle (this is how you progress in a gym); talked ${tried} times already`
      : `Talk to ${npcWho(n)} at (${n.x},${n.y}); talked ${tried} times already`;
    actions[name] = () => {
      // counter NPCs (nurse, shop clerk) can't be stood next to: stand 2 tiles away across the counter and face them.
      let ok = walkTo(n.x, n.y, { adjacent: true });
      if (!ok) {
        for (const [ox, oy] of [[0, 2], [2, 0], [-2, 0], [0, -2]]) {
          if (bfs(g, n.x + ox, n.y + oy) && walkTo(n.x + ox, n.y + oy)) { ok = true; break; }
        }
      }
      if (!ok) return;
      const p = state(); const dx = n.x - p.x, dy = n.y - p.y;
      hold(Math.abs(dx) >= Math.abs(dy) && dx ? (dx > 0 ? 'RIGHT' : 'LEFT') : dy > 0 ? 'DOWN' : 'UP', 6); press('A', 4, 20);
      if (isNurse) { for (let i = 0; i < 12; i++) press('A', 4, 30); log('nurse heal attempted'); }
    };
  });
  // options that failed every time (>=3 tries) are unreachable from here: drop them so Jev can't loop on them (e.g. ROUTE_4 exit_east from the Mt Moon side)
  const blocked = [];
  for (const k of Object.keys(opts)) {
    const t = memory.tried[`${g.map}|${k}`] || 0, f = memory.failed[`${g.map}|${k}`] || 0;
    if (t >= 3 && f >= t && !k.startsWith('talk_')) blocked.push(k);
  }
  if (blocked.length < Object.keys(opts).length) for (const k of blocked) delete opts[k];
  // map facts: when a known PROGRESS warp is available, drop options known to go BACKWARDS or that are an in-and-out LOOP (live: Jev re-took Mt Moon's entrance 5x)
  const backward = [];
  if (Object.values(opts).some(v => typeof v === 'string' && v.includes('[PROGRESS') && !v.includes('[UNREACHABLE'))) {
    for (const k of Object.keys(opts)) { const v = opts[k]; if (typeof v === 'string' && !v.includes('[PROGRESS') && (v.includes('[BACKWARDS') || v.includes('a LOOP, not progress'))) backward.push(k); } // never drop the PROGRESS warp itself (live 20260926-193424-036: Mt Moon entrance tagged PROGRESS+LOOP got removed, leaving only talk options)
    if (backward.length < Object.keys(opts).length) for (const k of backward) delete opts[k];
  }
  const keys = Object.keys(opts);
  if (!keys.length) { hold(['UP', 'DOWN', 'LEFT', 'RIGHT'][Math.floor(Math.random() * 4)], 16); return; }
  const ctx = {
    goal: storyGoal(st, pty),
    map: g.map, position: [st.x, st.y], party: pty.map(p => `${p.species || p.name} L${p.level} ${p.hp}/${p.maxHp} HP${p.status && p.status !== 'OK' ? ' status ' + p.status : ''}`),
    health: (() => { const hp = pty.reduce((a, p) => a + (p.hp || 0), 0), mx = pty.reduce((a, p) => a + (p.maxHp || 0), 0) || 1, bad = pty.some(p => p.status && p.status !== 'OK'); return `party at ${Math.round(100 * hp / mx)}% HP${bad ? ', has a status problem (poison drains HP while walking)' : ''}. Fainting everyone sends you back to the last Pokemon Center and loses half your money; a Pokemon Center (door named *POKECENTER*) heals for free.`; })(),
    badges: st.badges, recentMaps: memory.recent || [],
  };
  if (blocked.length && keys.length) ctx.unreachable = `These were tried repeatedly and could not be reached from this side of the map (blocked by walls/ledges/cave): ${blocked.join(', ')}. Another route (often a cave/door) is needed.`;
  if (backward.length && keys.length) ctx.removedBackwards = `Removed because they lead backwards / loop while a forward path exists: ${backward.join(', ')}.`;
  // re-ask Jev only every 3 explore steps on the same map/options (budget), or when options change
  const mapTries = Object.entries(memory.tried).filter(([k]) => k.startsWith(g.map + '|')).reduce((a, [, v]) => a + v, 0);
  const key = `${g.map}|${keys.join(',')}|${pty.length}|${Math.floor(mapTries / 3)}`;
  let pick = memory.cache[key];
  if (!pick) {
    pick = safeChoose(ctx, 'Where should the player go next to make progress in the game? Prefer options not tried yet; avoid options that keep failing. If party health is low or poisoned, heading back to a Pokemon Center first may be wiser than pushing on.', opts, keys[0]);
    if (!actions[pick]) pick = keys[0];
    memory.cache[key] = pick;
  }
  const tk = `${g.map}|${pick}`; memory.tried[tk] = (memory.tried[tk] || 0) + 1;
  log(`explore ${g.map}: ${pick} = ${opts[pick]}`);
  const f0 = state().frames, m0 = g.map;
  try { actions[pick](); } catch (e) { log(`explore action error: ${e && e.message}`); }
  // a wild encounter/trainer battle interrupting the walk is not a failure of the route (Mt Moon: frequent Zubat/Geodude)
  const s1 = state();
  if (s1.map === m0 && s1.inBattle) { memory.tried[tk] = Math.max(0, memory.tried[tk] - 1); delete memory.cache[key]; log(`explore ${pick}: interrupted by battle, not counted as failed`); }
  else if (s1.map === m0) memory.failed[tk] = (memory.failed[tk] || 0) + 1;
  // never leave the game frozen: if the action advanced no frames, nudge and drop the cached pick
  if (state().frames === f0) {
    delete memory.cache[key];
    hold(['UP', 'DOWN', 'LEFT', 'RIGHT'][Math.floor(Math.random() * 4)], 16); wait(20);
  }
}

function pickStarter() {
  const balls = { charmander: [6, 3], squirtle: [7, 3], bulbasaur: [8, 3] };
  const choice = safeChoose({ map: 'OAKS_LAB', note: 'Choosing the first Pokemon. First gym is Brock (Rock/Ground), second is Misty (Water). Rival takes the starter strong against yours.' },
    'Which starter Pokemon should the player choose?', {
      bulbasaur: 'Bulbasaur (Grass/Poison): strong vs Brock and Misty, the easiest early game',
      charmander: 'Charmander (Fire): weak vs the first two gyms, strong later',
      squirtle: 'Squirtle (Water): strong vs Brock, neutral vs Misty, bulky',
    }, 'bulbasaur');
  const [bx, by] = balls[choice] || balls.bulbasaur;
  walkTo(bx, by + 1);
  hold('UP', 6); press('A', 4, 20);
  for (let i = 0; i < 60 && !(party() || []).length; i++) { const s = screen(); if (!advanceText(s)) wait(10); }
}

// Battle: code works the menus; Jev picks which move to use (facts: type, power, effectiveness, PP, est. damage).
function isDisabled(m) { return !!(memory.disabledMove && m && m.name && m.name.split(' ').pop() === memory.disabledMove); }

function moveFacts(b) {
  const out = {};
  (b.player.moves || []).forEach((m, i) => {
    let eff = 1; try { eff = rom.effectiveness(m.type, b.enemy.types || []); } catch (e) {}
    const stab = (b.player.types || []).includes(m.type) ? 1.5 : 1;
    const score = (m.power || 0) * eff * stab * ((m.accuracy || 100) / 100);
    out[`move_${i}`] = `${m.name} (${m.type}, power ${m.power || 0}${m.power ? '' : ' - status move, no damage'}, accuracy ${m.accuracy}, ` +
      `${eff}x vs ${(b.enemy.types || []).join('/')}${stab > 1 ? ', STAB' : ''}, PP ${m.pp}/${m.maxPp}, expected damage score ${Math.round(score)})` +
      (m.pp ? '' : ' OUT OF PP') + (isDisabled(m) ? ' DISABLED by the enemy - cannot be used right now' : '');
  });
  return out;
}

function pickMove(b) {
  const opts = moveFacts(b);
  const key = `${b.player.species}|${b.enemy.species}|${Math.round(4 * b.enemy.hp / Math.max(1, b.enemy.maxHp))}|${Math.round(4 * b.player.hp / Math.max(1, b.player.maxHp))}|${(b.player.moves || []).map(m => m.pp).join(',')}|${memory.disabledMove || ''}`;
  if (memory.cache['battle|' + key] != null) return memory.cache['battle|' + key];
  let best = 0, bestS = -1;
  (b.player.moves || []).forEach((m, i) => { const sc = (m.pp && !isDisabled(m)) ? (m.power || 1) : -1; if (sc > bestS) { bestS = sc; best = i; } });
  const ctx = { kind: b.kind, enemy: b.enemy, player: { species: b.player.species, level: b.player.level, hp: b.player.hp, maxHp: b.player.maxHp, status: b.player.status, types: b.player.types },
    enemyPartyCount: b.enemyPartyCount, lastTurns: (memory.battleLog || []).slice(-4) };
  const c = safeChoose(ctx, 'Pokemon Red battle: which move should the player use this turn to win the battle? Prefer moves that deal the most damage; stat-lowering moves are only worth it early against a much healthier foe.', opts, `move_${best}`);
  let idx = Math.max(0, parseInt(String(c).split('_')[1]) || 0);
  if (isDisabled((b.player.moves || [])[idx])) idx = best;
  memory.cache['battle|' + key] = idx;
  return idx;
}

// Wild battles: Jev decides whether to fight (XP) or run (save HP), with HP/level/matchup facts. Cached per HP bucket.
function fightOrRun() {
  let b = null; try { b = battle(); } catch (e) {}
  if (!b || b.kind !== 'wild' || !b.player || !b.enemy) return 'fight';
  const myPct = Math.round(100 * b.player.hp / Math.max(1, b.player.maxHp));
  const enPct = Math.round(100 * b.enemy.hp / Math.max(1, b.enemy.maxHp));
  const key = `run|${b.enemy.species}|${Math.round(myPct / 20)}|${Math.round(enPct / 25)}|${b.player.status || ''}`;
  if (memory.cache[key]) return memory.cache[key];
  const mf = moveFacts(b);
  const bestMove = Object.values(mf).join('; ');
  const ctx = { goal: memory.goal || 'Beat Pokemon Red: next badge is Misty at CERULEAN_GYM', you: `${b.player.species} Lv${b.player.level} ${b.player.hp}/${b.player.maxHp} HP (${myPct}%) ${b.player.status || ''}`,
    wildPokemon: `${b.enemy.species} Lv${b.enemy.level} ${enPct}% HP, types ${(b.enemy.types || []).join('/')}`,
    note: (myPct < 50 ? 'Your HP is under half and there is no healing item - running avoids more damage on the way to a Pokemon Center. ' : '') + 'Fainting (all party fainted) sends you back to the last Pokemon Center and costs half your money. Running from wild battles usually works when your level is higher. No Poke Balls are assumed.',
    lastTurns: (memory.battleLog || []).slice(-4) };
  const opts = { fight: `Fight ${b.enemy.species} for experience (your moves: ${bestMove})`,
    run: `Run away to save HP (you have ${myPct}% HP${b.player.status ? ', status ' + b.player.status : ''})` };
  const fb = myPct < 35 ? 'run' : 'fight';
  const c = safeChoose(ctx, 'Pokemon Red wild battle: fight this wild Pokemon for experience, or run away to preserve HP?', opts, fb);
  const r = c === 'run' ? 'run' : 'fight';
  memory.cache[key] = r;
  return r;
}

function battleStep() {
  const s = screen();
  const text = (s.rows || []).join('\n');
  try {
    const dm = text.replace(/\n/g, ' ').match(/([A-Z][A-Z .\-']+?) was disabled/);
    if (dm) memory.disabledMove = dm[1].trim().split(' ').pop();
    if (/no longer disabled|disabled no more/i.test(text)) memory.disabledMove = null;
  } catch (e) {}
  if (s.cursor && text.includes('FIGHT') && text.includes('RUN')) {
    // main battle menu: FIGHT is top-left, RUN bottom-right. In wild battles Jev decides fight vs run.
    if (fightOrRun() === 'run') {
      press('UP', 2, 6); press('LEFT', 2, 6); press('DOWN', 2, 6); press('RIGHT', 2, 6);
      log('battle: run'); press('A', 4, 20);
      return;
    }
    if (!(s.cursor.y === 14 && s.cursor.x === 8) && s.rows[s.cursor.y].indexOf('FIGHT') < 0) { press('UP', 2, 6); press('LEFT', 2, 6); }
    press('A', 4, 20);
    return;
  }
  let b = null; try { b = battle(); } catch (e) {}
  const moves = b && b.player && b.player.moves || [];
  const inMoveMenu = s.cursor && moves.length && moves.some(m => s.rows[s.cursor.y].includes(m.name)) && text.includes('TYPE');
  if (inMoveMenu) {
    let idx = pickMove(b);
    if (!moves[idx] || !moves[idx].pp) idx = moves.findIndex(m => m.pp > 0);
    if (idx < 0) idx = 0;
    // Navigate by the visible cursor row (menu().current proved unreliable: Jev picked BUBBLE but TAIL WHIP was used vs Brock).
    for (let i = 0; i < 8; i++) {
      const sc = screen(); if (!sc.cursor) break;
      const cur = sc.rows[sc.cursor.y] || '';
      if (cur.includes(moves[idx].name)) break;
      const target = sc.rows.findIndex(r => r.includes(moves[idx].name));
      press(target >= 0 && target < sc.cursor.y ? 'UP' : 'DOWN', 2, 6);
    }
    memory.battleLog = memory.battleLog || [];
    memory.battleLog.push(`used ${moves[idx].name} vs ${b.enemy.species} (enemy hp ${b.enemy.hp}/${b.enemy.maxHp}, mine ${b.player.hp}/${b.player.maxHp})`);
    if (memory.battleLog.length > 10) memory.battleLog.shift();
    log(`battle: ${moves[idx].name} vs ${b.enemy.species}`);
    press('A', 4, 20);
    return;
  }
  press('A', 4, 20);
}

export default function play() {
  memory.recent = [];
  for (let tick = 0; ; tick++) {
    try {
      const st = state(), s = screen();
      if (st.map !== memory.recent[memory.recent.length - 1]) { memory.recent.push(st.map); if (memory.recent.length > 8) memory.recent.shift(); }
      if (st.inBattle) { battleStep(); continue; }
      memory.disabledMove = null;
      if (s.hasTextBox || s.waitingForA || s.cursor || isNamePrompt(s) || !st.playerName || s.nonMapTiles > 0) {
        if (!advanceText(s)) press(st.playerName ? 'A' : 'START', 4, 20);
        continue;
      }
      if (st.map === 'OAKS_LAB' && !(party() || []).length && event('EVENT_OAK_ASKED_TO_CHOOSE_MON')) { pickStarter(); continue; }
      explore();
    } catch (e) {
      log(`error: ${e && e.message}`); wait(30);
    }
  }
}

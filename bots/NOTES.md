# Bot notes

## Session 20260926-194119 (first session)
- bot.js: intro (names RED/BLUE) -> Red's house -> Pallet north edge (Oak stops you) -> Oak's lab.
  Jev picks the starter (askChoice in helpers.js, choice question with type facts, fallback SQUIRTLE).
  Code walks below the ball (lab balls: CHARMANDER 6,3 / SQUIRTLE 7,3 / BULBASAUR 8,3), faces up, A, yes.
- Mechanics: BFS pathfinder `pathDir` over grid() (respects blockedMoves), `walkTo`, `goWarp`.
  Exit doors have warp.to == 'the previous map'; you must step DOWN from the door tile to exit.
- Battles: just mash A (FIGHT, first move). Test: lost rival fight (Bulbasaur vs Charmander), then won a
  wild Rattata. After the starter, the bot just holds UP to Route 1 (hard-coded placeholder).
- Test reached ROUTE_1, storyEvents 6, BULBASAUR Lv5, 1 Jev call.

## Next
1. Battle decisions via Jev: options = each move with type effectiveness (rom.effectiveness), power, PP; plus run/switch.
   Read battle() for enemy species/HP. Need menu mechanics for selecting move N (cursor in screen()).
2. Replace post-starter "hold UP" with a Jev "what next" decision (progress/heal/train) + navigation to map exits
   (grid().exits) toward Viridian (Oak's parcel quest).

## Session 20260926-194620
- Battle moves via Jev: pickMove() in bot.js. Options = each move with PP>0, with type, power, accuracy, PP,
  effectiveness vs enemy types, STAB and an expected-damage score. Cached by enemy/HP bucket/PP. Fallback = highest power.
- Move menu detection: the cursor row contains one of our move names. Select by the SCREEN cursor row relative
  to the row of move 0 (menu().current was stale and gave GROWL instead of TACKLE).
- Overworld placeholder: pathfind to the northmost walkable tile (was holding UP into a wall at ROUTE_1 10,28).
- Test: Jev picked TACKLE (conf ~0.99) each turn and the game used TACKLE. Still on ROUTE_1. Money dropped
  3175->1587 in one test, so a battle was lost / blacked out. No heal logic exists yet.
## Next
1. Jev "what next" decision (heal at Viridian/Pallet, train in grass, progress) using party HP; heal when low.
2. Battle: add run/switch/item options (wild battles at low HP -> run).
3. Oak's parcel: Viridian Mart -> back to Oak -> Viridian Forest.

## Session 20260926-195120
- Overworld goal via Jev: goal(st, party) in bot.js asks progress / heal / train (heal only offered where supported:
  PALLET_TOWN, REDS_HOUSE_1F, ROUTE_1 -> walk south; train = pace in ',' grass tiles). Cached by map + HP quarter + levels.
  Fallback: heal if HP <= 25% else progress. talkToMom() walks next to npcs[0] in REDS_HOUSE_1F and mashes A; on failure
  sets healFails and clears the cache so Jev is asked again with healFailedHere.
- Test (20k frames): 2 Jev calls, both 'progress' (HP full). The bot is STUCK on ROUTE_1 around (4,15), pressing
  random directions: pathDir finds no path to the northmost tile. Likely ledges ('D'? other chars) or the target tile being
  unreachable. The heal and train paths are untested in the real game.
## Next
1. FIX ROUTE_1 navigation first: log grid().rows/legend at ROUTE_1, treat ledges as one-way down, and target g.exits
   (side 'north') instead of the "northmost walkable tile".
2. Heal in Viridian Pokecenter (nurse) and add it as a heal option; test the heal path from a low-HP state.
3. Battle run/switch/item options.

## Session 20260926-195620
- FIXED Route 1 stuck: pathDir now treats ledges (v < > ^) as one-way jumps (step onto ledge in its direction
  lands 2 tiles past it; other directions blocked). walkEdge(side) picks the edge-most tile the pathfinder can
  actually reach; the "progress" fallback uses walkEdge('north').
- Test (20k frames): ROUTE_1 -> VIRIDIAN_CITY, 5 Jev calls (goal=progress conf ~0.73, moves). No battles lost.
## Next
1. Viridian: "progress" still just walks north. Oak's parcel needs Viridian Mart (warp in grid().warps) ->
   carry parcel back to Oak's lab -> then Route 2/Viridian Forest. Let Jev pick a destination among warps/exits
   (with facts: map name, visited before, story hint) instead of fixed "north".
2. Heal at Viridian Pokecenter (nurse behind counter 'C': face counter, A) and offer it as a heal option.
3. Battle run/switch/item options.

## Session 20260926-200120
- Live runs 2047-2052 ran OLD code (pre-ledge fix) and were stuck at ROUTE_1 (4-5,15); HP hit 1/27, money lost.
- Added RUN option to Jev's move choice in wild battles (pickMove returns -2 -> B, DOWN, RIGHT, A on main menu).
  Test (8k frames): ROUTE_1 -> VIRIDIAN_CITY, 7 Jev calls, RUN offered with P~0 at high HP, 2 wins. RUN path itself
  NOT yet exercised in-game; verify the cursor sequence when Jev first picks it (look for 'battle: Jev chose RUN' + result "ran").
## Next
1. Viridian: Jev picks destination among warps/exits (Mart for Oak's parcel first), not fixed north.
2. Viridian Pokecenter heal option.

## Session 20260926-200620
- Live bot was stuck in VIRIDIAN_CITY walking north ("private property / can't go through" = old man blocks until parcel delivered).
- Added goDest(): Jev picks a destination among grid().warps (doors) and grid().exits (edges), facts = distance, times visited,
  FAILED count. >8 loop ticks without leaving the map marks the pick failed and re-asks. recentText (last dialog) in context.
  walkEdge now supports west/east. Fallback: north edge, else first non-failed.
- Test (12k frames): VIRIDIAN_CITY -> VIRIDIAN_MART, storyEvents 6 -> 7 (got Oak's parcel).
## Next
1. Deliver parcel: in OAKS_LAB the code just walks out (line `if (st.map === 'OAKS_LAB')`). Need: walk next to Oak (npcs) and talk, A-mash.
   Check that goDest leaves the Mart and Jev picks the Route 1 south edge after the parcel.
2. Viridian Pokecenter heal option; battle switch/item.

## Session 20260926-201120
- Removed hard-coded PALLET_TOWN "walk north" and OAKS_LAB "walk out": both now go through goDest (Jev picks).
- goDest on indoor maps (no exits) now also offers `talk:<i>` options for each NPC (facts: distance, times talked, FAILED);
  talkTo(npc) walks adjacent, faces, mashes A. Intended for delivering Oak's parcel.
- Test (15k frames): Jev picked Mart exit, then in VIRIDIAN_CITY picked door:VIRIDIAN_MART again (conf 0.92) -> loop.
  Added ctx.parcelInBag hint (storyEvents===7 -> carry parcel south to Oak) — UNTESTED in game (no time).
## Next
1. Check whether the hint stops the Mart loop; if not, add "visited N times, nothing new happened there" facts or mark
   warps whose visit produced no storyEvents change as low-value.
2. Verify talk:Oak in OAKS_LAB delivers parcel (storyEvents 7 -> 8+), then Route 2 / Viridian Forest.

## Session 20260926-201620
- Cause of the Mart loop: destCache key didn't change, so the cached pick door:VIRIDIAN_MART was reused forever without asking Jev.
- Fix: noGain[map] counts visits that left storyEvents unchanged; door/edge options now say "N earlier visit(s) produced NO story
  progress". Cache key includes storyEvents + noGain, so Jev is asked again. "the previous map" warps are named with prevMap.
- Test (12k frames): Mart <-> City twice, then Jev left the Mart loop and picked edge:north (0.48 vs Mart 0.43). No story gain yet.
## Next
1. Jev picks north (blocked by old man) instead of SOUTH to Oak. Give edge options destination facts (south = Route 1 -> Pallet/Oak's lab
   where the parcel goes; north = blocked until parcel delivered) or a storyEvents===7 "parcel -> south" fact on edge:south.
2. Verify talk:Oak in OAKS_LAB delivers the parcel (storyEvents 7 -> 8+).

## Session 20260926-202120
- Added MAP_FACTS (geography facts per destination map, e.g. ROUTE_1 -> Pallet/Oak's lab south; ROUTE_2 blocked until parcel)
  appended to door/edge options in destOptions.
- Test (12k frames): Jev now goes VIRIDIAN_MART -> CITY -> edge:south -> ROUTE_1 south -> PALLET_TOWN -> door:OAKS_LAB (0.9+).
  In OAKS_LAB, npcs only listed 2 unnamed people at (3,8),(11,14) — Oak (~(5,2)) NOT in grid().npcs list? Jev talked to
  person 1, no story gain, then left. storyEvents stayed 7.
- Oddity: ctx in PALLET_TOWN had no storyEvents key and parcelInBag 'unknown' -> st.storyEvents undefined there? check state().
## Next
1. Deliver parcel: find Oak in OAKS_LAB (check grid().npcs / sprite names; if missing, add a "walk to (5,3), face up, A" talk option
   labelled Prof. Oak). Expect storyEvents 7 -> 8+.

## Session 20260926-202620
- grid().npcs = sprites() filtered by !hidden, only {index,x,y} (no names). Oak may be missing/hidden in that list.
- Added explicit `talk:oak` option in OAKS_LAB destOptions: coords from rom.mapByName('OAKS_LAB').npcs entry matching /OAK/
  (fallback (5,2)), described as "takes OAK's PARCEL, gives POKEDEX". Uses talkTo(). UNVERIFIED in game: 15k-frame test from
  Viridian City (35 Jev calls, no crash) ended in VIRIDIAN_MART again — Mart/City loop still happens from the live state.
## Next
1. Test from a state in Pallet/Oak's lab (e.g. an earlier run's end.state.json near Pallet) to verify talk:oak -> storyEvents 8+.
   Check rom.maps NPC coordinate convention vs grid coords (earlier grid npcs were (3,8),(11,14), which don't match pokered's (1,9),(2,10)).
2. Mart loop: when storyEvents===7 consider dropping door:VIRIDIAN_MART option after 1 no-gain visit.

## Session 20260926-203120 (DEEP) — ROOT CAUSE of the 4-session Viridian/Mart loop (fixed)
- NOT a Jev problem. Evidence (live run 212221): walkEdge('south') in VIRIDIAN_CITY walks to the city's own last row
  (y=35, which is still the city; Route 1 starts one more step down), moving ~1 tile per loop tick. goDest marked a pick
  FAILED after 8 *ticks* no matter what, so edge:south was marked failed right at the edge. Jev (correctly avoiding the
  FAILED option) then picked the Mart, and the bot bounced across the city/Route 1 seam and back into the Mart loop.
  The old "NEXT: add facts so Jev goes south" notes were misdiagnoses: Jev had already picked south.
- Fixes: (1) goDest counts a tick as "stuck" only when the player's (x,y) didn't change; >4 stuck ticks = failed.
  (2) walkEdge keeps holding the edge direction (up to 4 steps) after reaching the edge row until the map changes.
  (3) play(): on every map change, wait(30) and re-loop. grid() is STALE right after a warp (wCurMap is already new, but
  width/height/tiles are still the old map's, e.g. VIRIDIAN_MART reported as 40x36), so the first grid() read was garbage.
  (4) heal option (Mom) no longer offered after 2 failed talkToMom tries (it had looped Pallet <-> Red's house forever);
  healFails is a counter and shows up in the option text and in the cache key.
- Test (40k frames from live): Mart -> City -> Route 1 -> Pallet -> OAKS_LAB, talk:oak delivered the parcel,
  storyEvents 7 -> 11 (Pokedex), then Pallet -> Route 1 north. 44 Jev calls, no crash.
## Next
1. talkToMom never heals (mechanics bug: Mom at the table, maybe wrong side/facing or the stale-npcs issue). Debug with a
   dump of grid().npcs in REDS_HOUSE_1F. Add Viridian Pokecenter heal (nurse behind counter 'C': stand 2 tiles below, face UP, A).
2. With storyEvents >= 11: MAP_FACTS/goal text still talk about the parcel errand. Update the goal context to "Pokedex received;
   go north: Viridian -> Route 2 -> Viridian Forest -> Pewter (Brock)". Old man in Viridian should now let us pass.
3. Viridian Forest has blockedMoves; pathDir already respects them.

## Session 20260926-203620
- Added stage(st) (by storyEvents: <7 fetch parcel, 7-10 deliver, >=11 Pokedex done -> go north to Pewter/Brock) used for the
  goal text in goal() and goDest() ctx, parcelInBag, and MAP_FACTS_DONE (post-parcel geography facts: Pallet/lab/Mart "nothing
  left", Route 2 open, Viridian Forest -> Pewter). goal cache key now includes storyEvents.
- state().storyEvents is often MISSING outdoors (ROUTE_1 etc.); stage() keeps lastStory (last known value).
- Test (40k frames from live, story 7): delivered parcel again, storyEvents 7 -> 11, 62 Jev calls, no crash; ended on ROUTE_1
  heading north. Before the lastStory fix, post-parcel ctx on ROUTE_1 still said "unknown".
## Next
1. Verify post-parcel: from a story-11 state, Jev goes Route 1 -> Viridian -> edge:north (Route 2) -> Viridian Forest -> Pewter.
   noGain counts (12 no-gain visits to VIRIDIAN_CITY) may scare Jev away from the city; consider resetting noGain when storyEvents rises.
2. Healing still broken (talkToMom); add Viridian Pokecenter nurse option.

## Session 20260926-204120 (short)
- noGain now compares progress using lastStory (+badges*100) and is CLEARED whenever story/badges rise (stale "no progress" marks).
- Added MAP_FACTS_DONE entries for Route 2 doors (VIRIDIAN_FOREST_SOUTH_GATE = the way forward, Diglett's cave/trade house/gate optional).
- Tests from live (ROUTE_2, story 11): Jev still picked edge:south on Route 2 -> Viridian -> Mart/Route 1 (bot regresses south).
  LIKELY CAUSE: at bot start on ROUTE_2 state().storyEvents is missing and lastStory is null, so factsDone=false and the
  pre-parcel facts are shown (Viridian "Mart (Oak's parcel)"). Route 2 south edge fact still mentions parcel.
## Next
1. FIX FIRST: if lastStory is null, infer stage: pokedexOwned>=1 or being on ROUTE_2/VIRIDIAN_FOREST/north => story>=11 (Pokedex done).
   Verify on ROUTE_2 that the dest question shows "THE WAY FORWARD" for VIRIDIAN_FOREST_SOUTH_GATE.
2. Healing still broken (talkToMom); add Viridian Pokecenter nurse option — Jev chooses heal at ~23/31 HP and walks all the way home.

## Session 20260926-204620 (short)
- stage(): if lastStory is unknown and map is ROUTE_2/VIRIDIAN_FOREST*/PEWTER*/ROUTE_3/MT_MOON/DIGLETTS, assume story>=11.
  Verified: goal text on ROUTE_2 now says "Pokedex received, go NORTH".
- Found: bot bounced ROUTE_2 <-> VIRIDIAN_FOREST_SOUTH_GATE; in the gate Jev picked door:ROUTE_2 (0.29 forest) because
  MAP_FACTS_DONE.ROUTE_2 says "leads north to Viridian Forest". Added BACK_FACTS keyed "from>to" (factsFrom = current map)
  marking gate->ROUTE_2 and forest->south gate as BACKWARDS. Retest: Jev now picks door:VIRIDIAN_FOREST in the gate, but the run (only ~6s wall) ended still in the gate: the walk to that door may fail (mechanics).
## Next
1. Check jev.jsonl in the gate: is door:VIRIDIAN_FOREST picked now? If yes but no warp, the forest door in the gate is a
   north-edge warp tile (walk up through it). Consider dropping a door option that leads back to the map we just came from
   after a no-gain round trip.
2. Healing (talkToMom broken; add Viridian/Pewter Pokecenter nurse).

## Session 20260926-205120 (very short)
- Confirmed from live run 214232: in the gate Jev picks door:VIRIDIAN_FOREST (0.71-0.98) but the walk to the warp at (4,0)
  FAILS every time ("dest failed" after ~4k frames); then Jev falls back to the Route 2 door and the bot drifts south to Oak's lab.
- goWarp now pushes toward the edge the warp is on (UP for y==0, LEFT/RIGHT for side edges, else DOWN), and if walkTo to a
  y==0 warp fails it walks to (x,1) and holds UP. Tested 12k frames: no crash, Jev answered, but the gate door STILL fails.
## Next
1. FIX FIRST: debug the gate warp. Log grid().rows for VIRIDIAN_FOREST_SOUTH_GATE, the player x,y when "dest failed" fires,
   and pathDir's result. The (4,0) tile is probably a wall in rows (so pathDir returns null and walkTo presses random dirs), or
   the real exit tiles are (4,1)/(5,1). Try: walkTo(w.x, w.y+1), then hold UP several times until state().map changes.
2. Healing (talkToMom broken; add Viridian/Pewter Pokecenter nurse).

## Session 20260926-205620 (very short)
- ROOT CAUSE of gate failure: in VIRIDIAN_FOREST_SOUTH_GATE the bot stood at (4,1) holding UP forever; screenshot shows the
  real doorway is at x=5 (tile (4,0) is wall). goWarp now tries EVERY warp leading to dest, and for top-edge warps stands at
  (x,1),(x+1,1),(x-1,1) pushing UP, returning as soon as the map changes; logs "goWarp X failed" otherwise.
- Test 12k frames from live: gate -> VIRIDIAN_FOREST reached (first time), money 396->486 (won a forest trainer), 9 Jev calls, no crash.
## Next
1. Navigate Viridian Forest to the north gate -> Pewter City (check blockedMoves are respected in pathDir; watch for bouncing back south).
2. Healing (talkToMom broken; add Viridian/Pewter Pokecenter nurse) before Brock.

## Session 20260926-210120 (very short)
- Live was bouncing ROUTE_2 <-> VIRIDIAN_FOREST_NORTH_GATE. mapFact now first checks BACK_FACTS["cur<prevMap>to"], then "cur>to".
  Added north-gate facts (ROUTE_2 = way forward, forest = backwards) and ROUTE_2-after-north-gate / after-Pewter facts
  (edge:north to Pewter = forward, gates/Viridian = backwards), plus PEWTER_CITY>ROUTE_2 = backwards.
- Test 15k frames: north gate -> Route 2 -> PEWTER_CITY -> PEWTER_GYM reached (first time)! But then Jev left the gym and went
  south edge from Pewter to Route 2 and picked the south gate (drift). Pewter facts added after that; short retest only.
## Next
1. Brock: make sure in PEWTER_GYM Jev is told to challenge Brock (talk to trainers/leader), and heal at PEWTER Pokecenter first
   (Bulbasaur Lv11 vs Geodude/Onix: Vine Whip is super effective). Healing is still broken (talkToMom); add Pokecenter nurse.
2. Generalize direction facts: prefer "north of here = forward" rather than hand-keyed map pairs.

## Session 20260926-210620 (very short)
- Added Pokemon Center healing: goal() now offers "heal" in PEWTER/VIRIDIAN city, their POKECENTERs and PEWTER_GYM
  (fail counter healFails.PC). Heal execution: city -> goWarp(X_POKECENTER); in center healAtCenter() walks to (3,3), faces UP,
  mashes A, then B; then goWarp('previous'). Gym -> leave.
- Test 10k frames from live (Pewter): Jev picked heal (0.74), first goWarp to the center failed twice (door at 13,25; bot at 18,13 / 13,26)
  but the 3rd try got in, "healed at Pokemon Center" confirmed. Then bot bounces PEWTER_CITY <-> PEWTER_GYM (Jev picks door:PEWTER_CITY in the gym ~11x).
## Next
1. FIX FIRST: in PEWTER_GYM the bot leaves immediately. Offer NPC options (trainer + Brock at top of gym) as "challenge Brock = the way forward",
   mark door:PEWTER_CITY as backwards when party HP is full; walk up to Brock (approx (4,1)) and talk.
2. goWarp to the Pewter Pokecenter door fails sometimes (door at y=25 bottom-ish, pushing wrong direction?).

## Session 20260926-211120 (very short)
- Gym NPC talk options now carry facts (y<=2 = GYM LEADER "the way forward", near entrance = guide, else trainer);
  BACK_FACTS: PEWTER_GYM>PEWTER_CITY = backwards unless hurt, PEWTER_CITY>PEWTER_GYM = way forward.
- Test 10k frames from live gym: Jev picked talk:0 (0.94) -> battle vs Brock, used TACKLE only (Bulbasaur Lv11-12 has no
  Vine Whip until Lv13) -> LOST (money 486->243, blacked out to Pewter), then Jev went straight back to the gym.
## Next
1. FIX FIRST: before challenging the leader, give Jev a "train" option with facts (level vs leader's Onix Lv14; Vine Whip at Lv13;
   Route 2 grass south of Pewter). Record "lost to Brock at LvX" and feed it into goal()/dest facts so Jev trains to ~Lv14-16 first.
2. Consider catching a second Pokemon (Route 2/forest) for Brock backup.

## Session 20260926-211620 (very short)
- Added battle memory: battleStep records {kind, enemy, our lv, money}; after battle noteBattleEnd() logs "battle result: LOST to/beat ..."
  (lost = money dropped >20% or party fainted), keeps last 6 in battleHistory, clears goalCache. goal() ctx now has recentBattles + party moves.
- Pewter/gym "train" option now says: go south to Route 2 grass, Brock's Geodude Lv12/Onix Lv14, Vine Whip at Lv13, plus past losses.
  train in PEWTER_GYM -> leave; in PEWTER_CITY -> walkEdge south (trainStep then finds grass on Route 2).
- Test 12k frames from live (Pewter, Lv13 with Vine Whip): BEAT BROCK -> badges 1, Lv15, money 463->1849. No crash.
## Next
1. After badge 1: goal/stage() text and BACK_FACTS are all Brock-centric. Update stage() for badges>=1: Route 3 east of Pewter -> Mt Moon -> Cerulean (Misty).
   Mark PEWTER_CITY east edge as the way forward once badges>=1 (and gym/south as backwards).
2. Consider catching a 2nd Pokemon (Route 3 / Mt Moon) - only Bulbasaur in party.

## Session 20260926-212121 (very short)
- Post-badge-1 facts: stage() returns a Route 3 -> Mt Moon -> Route 4 -> Cerulean (Misty) goal once badges>=1 (hasBadge1 flag).
  BADGE1_FACTS (checked first in mapFact when hasBadge1): gym exit = forward, Pewter gym = backwards, PEWTER_CITY>ROUTE_3 = forward,
  Route 3/4/Mt Moon entries. Brock-specific train option/walk-south disabled after badge; generic train text mentions Misty levels.
- Test 12k frames from live gym: PEWTER_GYM -> PEWTER_CITY -> ROUTE_3 (first time), 14 Jev calls, no crash.
## Next
1. Watch Route 3 trainers/grass; make sure Mt. Moon POKECENTER heal works (healWhere/goWarp only know PEWTER/VIRIDIAN centers).
2. Mt. Moon cave (MT_MOON_1F/B1F/B2F) needs forward/backwards ladder facts; consider catching a 2nd Pokemon (Route 3 grass).
3. Battle move pick: Jev chose TACKLE several times on Route 3 - check move facts (Vine Whip power/effectiveness) are in options.

## Session 20260926-213121 (very short)
- Evidence: live run 222211 - Jev DID pick VINE WHIP when it had PP; the real problem was Tackle/Vine Whip PP ran OUT (only GROWL/LEECH SEED left) and HP 12/51 on Route 3.
- goal(): ppFrac(p) = attack-move PP left; low PP (<~40%) caps the hp bucket so "heal" is offered, heal text shows HP% and PP%.
  heal now offered on ROUTE_3 (walkEdge west -> Pewter -> center), ROUTE_4 (goWarp MT_MOON_POKECENTER), MT_MOON_POKECENTER (healAtCenter).
- Test 10k frames from live Route 3: only 1 Jev call (LEECH SEED 0.91) - bot seemed stuck in a battle with only status moves the whole test. Heal path untested.
## Next
1. FIX FIRST: battle with no damaging PP left -> bot stalls. Offer RUN (trainer: impossible) / switch / STRUGGLE handling; check battleStep when all attack PP=0 (moves filter pp>0 still returns status moves; maybe menu loop). Look at test run.jsonl.
2. Verify party() move objects have power/pp/maxPp (ppFrac returns 1 if not).
3. Catch a 2nd Pokemon (only Ivysaur).

## Session 20260926-213621 (very short)
- Evidence: live run 223209 stuck forever in trainer battle vs JIGGLYPUFF Lv14 (it knows DISABLE): LEECH SEED disabled, bot kept picking it
  ("The move is disabled!") -> infinite A loop. Only GROWL/LEECH SEED had PP (attack PP exhausted).
- Fix: disabledMoves set: when screen shows "...is disabled!" after our pick (lastPickedMove), exclude that move from pickMove options,
  tell Jev ctx.disabledByEnemy; cleared at battle end. Regex skips "disabled no more!".
- Test 8k frames: battle moved again (turns alternating, GROWL used after disable), 6 Jev calls; 2nd 4k-frame test 1 call. Battle not yet finished within test.
## Next
1. Root cause is attack PP running out on Route 3: goal() heal offer on low PP (session 213121) must trigger BEFORE trainers; also consider
   buying/using items, or a 2nd Pokemon. Verify party() moves have pp/maxPp/power.
2. Catch a 2nd Pokemon (only Ivysaur).

## Session 20260926-214121 (very short)
- Evidence: live run 223209 + test: still stuck vs JIGGLYPUFF (battle alreadyInProgress at start, lastPickedMove null, disable text missed) -> 1 Jev call all run.
- Fix in pickMove: if the same cache key is hit 5x in a row (pick has no effect), add that move to disabledMoves, clear cache, re-ask Jev.
  Also added a post-pick screen check for "move is disabled" (didn't fire in test; the repeat check is what worked).
- Test 5k frames: battle moves again (Leech Seed sapping, Growl), 6 Jev calls, no crash. Battle still not finished (Ivysaur only has status-move PP).
## Next
1. Attack PP exhaustion on Route 3 is the root cause: make heal (walk west to Pewter) trigger when attack PP low, before engaging trainers.
2. Catch a 2nd Pokemon; consider buying Potions/Ethers.

## Session 20260926-214621 (very short)
- Evidence: live run 224213: Ivysaur 3/51 HP in MT_MOON_1F, no heal option offered there (healWhere lacked MT_MOON_1F) -> blacked out to Pewter.
- Added heal on MT_MOON_1F (goWarp('previous') out to Route 4 -> Mt Moon center); progress text now describes Mt Moon/Cerulean after badge 1.
- Test 8k: Jev picked heal twice in MT_MOON_1F but goWarp('ROUTE_4') failed (warp names say "previous"); switched to goWarp('previous'),
  4k test: 4 Jev calls, still in MT_MOON_1F at end - exit-to-Route-4 heal NOT confirmed working.
## Next
1. Verify MT_MOON_1F heal walks out (check run.jsonl for goWarp/walkTo failures; entrance warps are at bottom of 1F).
2. Attack PP exhaustion still the root cause of weakness; buy Potions at Pewter Mart, catch 2nd Pokemon.

## Session 20260926-215121 (very short)
- Evidence: live run 224721: every goWarp in MT_MOON_1F failed ("previous" and MT_MOON_B1F) - walkTo gave up after 40 steps / on wild battle, then logged failure.
- Fix: goWarp walkTo limit 40 -> 150 steps; if a battle interrupts, return silently (main loop fights, then retries the goal).
- Test 6k frames: 6 Jev calls (TACKLE picks), Ivysaur Lv18->19, no crash; still in MT_MOON_1F, heal/exit path not exercised in test.
## Next
1. Check live log for "goWarp ... failed" in Mt Moon; if still failing, log pathDir null vs step limit.
2. Buy Potions / catch a 2nd Pokemon (still only Ivysaur).

## Session 20260926-215621 (very short)
- Evidence: live run 225201: heal via Route 4 Mt Moon PC now WORKS; bot reached MT_MOON_B1F once but immediately walked back up to 1F.
  Goal "progress" text was stale (Viridian/Brock) because hasBadge1 was set in stage() after option texts were built.
- Fix: goal() calls stage(st) first; added BADGE1_FACTS for Mt Moon ladders (1F>B1F down, B1F>B2F forward, B1F>1F backwards, B1F>ROUTE_4 exit, B2F>B1F far ladder = exit).
- Test 6k: Jev called (heal/TACKLE picks), no crash, stayed in MT_MOON_1F (Jev chose heal twice; not yet walked).
## Next
1. Check live log: does bot go 1F->B1F->B2F now, or bounce back? If warp names in B1F differ (e.g. "previous"), add facts for those.
2. Buy Potions / catch a 2nd Pokemon (still only Ivysaur).

## Session 20260926-220121 (very short)
- Evidence: live run 225201: in MT_MOON_B1F Jev picked door:MT_MOON_B2F but the bot warped straight back to 1F. Cause: WALK included 'D',
  so BFS paths crossed other ladder tiles (warping away); also B1F is split into sections, so some B2F ladders are unreachable.
- Fix: 'D' removed from WALK (warp tiles only walkable when they're the target); goWarp tries reachable warps first;
  destOptions prefers a reachable warp per destination and tells Jev "NO walking path from here" for unreachable ones.
- Test 8k frames: ~6 Jev calls (heal x2, TACKLE/VINE WHIP), no crash; stayed MT_MOON_1F (heal walk in progress), B1F->B2F not exercised.
## Next
1. Check live log: does B1F->B2F now work? If warps in top-edge doorways broke (walkTo to 'D' target still allowed), check Viridian Forest gate.
2. Heal loop: Jev picks heal often in Mt Moon (only Ivysaur, PP). Buy Potions at Mt Moon PC mart area / catch 2nd Pokemon.

## Session 20260926-220621 (very short)
- Evidence: live run 225722: in MT_MOON_B1F with Ivysaur 3/56 HP, heal was NOT offered (healWhere lacked B1F/B2F) -> Jev picked progress, LOST to wild Zubat, money 1929->964.
- Fix: heal option + mechanics for MT_MOON_B1F (ladder up to 1F) and MT_MOON_B2F (ladder up to B1F); 1F then exits to Route 4 PC.
- Test 8k: Jev called (heal -> healed at PC, progress, door picks, TACKLE), no crash; B1F heal path not exercised in test.
- Also seen: on ROUTE_4 (west part) Jev picks edge:east (fails, it's the cave-separated part) once, then door:MT_MOON_1F. Fine.
## Next
1. Verify B1F/B2F heal climbs up in live logs. Consider making low HP (<25%) text stronger in the goal question.
2. Catch a 2nd Pokemon / buy Potions (still only Ivysaur).

## Session 20260926-221121 (very short)
- Evidence: live run 230212: twice reached MT_MOON_B1F at ladder (5,5), Jev picked door:MT_MOON_B2F, pathDir found no path,
  and walkTo's no-path jiggle (UP/LEFT/DOWN/RIGHT) stepped back onto the arrival ladder -> warped to 1F. Endless 1F<->B1F bounce.
- Fix: walkTo no-path nudges only onto plain WALK tiles that are not warps, and gives up after 8 misses (goWarp then tries the next warp).
- Test 8k: Jev called (progress, door:MT_MOON_B1F, TACKLE/VINE WHIP), Lv21->22, no crash; still in 1F at end, B1F not re-reached in test.
## Next
1. Check live log: after arriving B1F (5,5), is B2F reachable? If the (5,5) section has no B2F ladder, Jev needs a fact on 1F ladders
   saying which 1F ladder leads to the B1F section containing the B2F ladder (tell it via BADGE1_FACTS with warp coords).
2. Catch a 2nd Pokemon / buy Potions.

## Session 20260926-221621 (very short)
- Evidence: live run 231214 (first with walkTo fix): 1F->B1F worked and Jev picked door:MT_MOON_B2F, but after a Geodude fight
  (Ivysaur 49/62 = 79%) Jev picked "heal" on B1F and walked all the way back up. Heal-vs-progress loop at high HP.
- Fix: goal() heal option in Mt Moon now includes facts: COST of going back up from B1F/B2F + count of earlier cave heal trips
  (caveHealTrips), and an estimate of how many more wild fights current HP survives (~(30-lvl)% per fight).
- Test 12k: reached MT_MOON_B2F (first time in a test), Jev called, no crash.
## Next
1. Check live log on B2F: does Jev find the exit ladder to ROUTE_4 (east side)? Rocket/fossil event on B2F; Super Nerd fossil choice.
2. Money is 241: avoid losses. Catch a 2nd Pokemon (still only Ivysaur).

## Session 20260926-222121 (DEEP)
- ROOT CAUSE of the Mt Moon stall (verified in live run 231732): the bot DOES reach B2F (arrives at ladder (21,17) from B1F (21,17)),
  but destOptions collapsed warps by destination map ("door:MT_MOON_B1F"). All 4 B2F warps go to B1F, so Jev got exactly ONE
  option: the ladder we were standing on (0 tiles away, conf 1.0). goWarp then flailed (no-path nudges) until a wild Zubat
  knocked out Ivysaur (Jev kept picking "progress" at 21% and 11% HP) -> blackout to Route 4 -> repeat. Also "B2F->ROUTE_4" in the
  game log is a BLACKOUT, not the exit (HP back to full, money halved).
- Fix: in MT_MOON maps, warps that share a destination are listed separately as door:<MAP>@x,y with "STANDING on it (arrival)",
  reachability and "taken N times" facts; goWarp(dest, at) walks to that exact warp.
- Fix: heal-option fight estimate was ~8%/fight (wildly optimistic) -> now says 20-40% per fight, and warns below 30%.
- Debug: first arrival on MT_MOON_B1F/B2F logs grid rows + warps into run.jsonl ("grid MT_MOON_..." log line). Use it to check
  whether B2F (21,17) section actually connects to the exit ladder. pokered data (from memory, unverified): B2F exit ladder is (5,7)
  -> B1F (23,3) -> B1F exit (27,3) to Route 4 east.
- Test (50k frames): Jev now sees every ladder separately (door:MT_MOON_B1F@5,7 etc.) and picks among them; no crash; route
  1F(25,15)->B1F(25,15)->B1F(13,27)->B2F(15,27). From B2F (15,27) EVERY other ladder is "NO walking path": that pocket's
  corridor north has a Rocket at (15,22) (grid 'N' = wall for pathDir). NEXT: verify with the "grid MT_MOON_B2F" log whether
  the pocket is closed only by NPC tiles; if so, let pathDir treat trainer NPC tiles as passable-after-battle (walk up to them /
  talk to trigger the fight), or try the OTHER B1F->B2F ladders ((21,17) reached B2F (21,17) in live run 231732; also no path there).
  Log lines are truncated by the host, so dump grid rows in several log() calls (e.g. 10 rows each).
- Bug: 'multi' regex /MT_MOON/ also matches MT_MOON_POKECENTER (harmless, 2 exit door options).

## Session 20260926-222622 (very short)
- Evidence: live run 232417 bounced B1F(21,17)<->B2F(21,17). On B2F Jev picked door:MT_MOON_B1F@5,7 (correct: likely -> B1F (23,3)
  -> B1F (27,3) exit to Route 4), path existed at first, but after 1 step pathDir returned null (wandering NPC blocking corridor?),
  walkTo's 8 nudges ran out, goWarp failed, then Jev picked the arrival ladder (21,17) and went back up. Repeat.
- Fix: walkTo no-path now waits 30 frames up to 6 times (let NPCs move) before nudging; gives up after 14 misses.
- Test 9k: Jev called (TACKLE, progress, B2F@21,17, then B1F@5,7), ended on B2F; not yet confirmed it reaches (5,7).
## Next
1. Check live log: does B2F (21,17) -> (5,7) walk now succeed? If not, dump B2F grid in short log lines to see what blocks it.
2. On B2F, mark the arrival ladder option as "FAILED to progress N times" so Jev stops going back up after a goWarp failure.

## Session 20260926-223122 (very short)
- Evidence: live run 232417 still bounced B1F(21,17)<->B2F(21,17): from that B2F pocket, goWarp to (5,7) fails; on B1F from (20,16)
  goWarp to (17,11) fails. So B1F(21,17)<->B2F(21,17) is a closed pocket pair.
- Fix: lastWarpTaken + deadEnd{}: when a dest fails on a map we reached via a specific ladder, that ladder (in the previous map) gets
  "DEAD END: N time(s)... closed pocket; pick a different ladder" in its Jev option text (also in the dest cache key).
- Test 12k: no crash, Jev called; blacked out(?) to Route 4/1F; storyEvents 23->24, money 60->420. DEAD END fact not yet seen in test.
## Next
1. Check live jev.jsonl for "DEAD END" on B1F@21,17 and whether Jev then tries B1F@17,11 from the other section (from 1F).
2. Guess (unverified): real route is 1F -> B1F section containing (17,11) -> B2F(25,9) -> fossils/Rocket -> B2F(5,7) -> B1F(23,3) -> (27,3) Route 4.

## Session 20260926-223238 (very short)
- Evidence: live run 233237 at MT_MOON_B1F, 52% HP: heal option text said "survive about 0 more fights" (bad formula
  floor(hp/30)-1) -> Jev picked heal 84% and climbed back to 1F again (throwing away cave progress).
- Fix: estimate now floor((hp%-20)/25) fights before danger zone (52% -> 1, 100% -> 3), plus hint that RUNning saves HP.
- Test 9k: no crash, Jev called (heal first, then progress, B1F@25,15, B2F@21,17). Ended on B1F.
## Next
1. Check live jev.jsonl for "DEAD END" on the (21,17) ladder pair and whether Jev goes to B1F@17,11 instead.
2. Consider prompting RUN more in cave wild battles when HP < 50% (battle RUN option text).

## Session 20260926-223738 (very short)
- Evidence: in the test, Jev picked RUN (96%) vs a Zubat, but RUN was broken: B, DOWN, RIGHT landed on PKMN ("is already out!")
  and the bot pressed A on PKMN for ~11k frames (stuck). The old live runs probably hit this too.
- Fix: the RUN key sequence now resets the cursor (UP, LEFT, then DOWN, RIGHT, with longer waits) and backs out if it sees the PKMN screen.
  Wild-battle question now asks "fight or RUN for the overall goal". In Mt. Moon the RUN option says that we are trying to cross,
  shows the level gap ("tiny EXP" when we are 8+ levels higher) and our HP%.
- Test 8k: 7 Jev calls, "Got away safely!" twice, no stuck loop. It still ended on 1F (heal trip), so the cave is still not crossed.
## Next
1. Check the live log: runs from wild fights should cut down on heal trips. Then check the DEAD END / B1F@17,11 ladder route (see above).

## Session 20260926-224238 (very short)
- Evidence: live run 233320 on B2F: Jev picked B1F@5,7 (conf 0.21), a wild Zubat interrupted the walk, then the dest cache key
  changed (NPC/talk ids) and Jev was re-asked -> picked the dead-end B1F@21,17 (0.58). So the real route was abandoned by a battle.
- Fix: goDest keeps destState.pick after interruptions (same map, still an option, no new failure since chosen) instead of re-asking.
- Test 9k: 11 Jev calls, no crash; after RUN from wild battles the 1F->B1F@5,5 target was kept (no dest re-ask). Ended on 1F (heal trips).
## Next
1. Check live: does B2F -> (5,7) now get reached after battles? Heal is still picked often at start (0.8-0.9) -> heal trips out of cave;
   consider telling Jev the Pokecenter round trip cost / using potions (money 420) to buy Potions at the Route 4 PC area? (no mart there).

## Session 20260926-224738 (DEEP) — ROOT CAUSE of the Mt Moon stall (3+ sessions)
Verified with ROM warp data (rom.mapByName(m).warps: {x,y,destMap,destWarp}) + settled grid dumps + offline BFS with blockedMoves:
- Ladder links (warp index order): 1F (5,5)->B1F(5,5); 1F (17,11)->B1F(25,9); 1F (25,15)->B1F(25,15).
  B1F (17,11)<->B2F(25,9); B1F (21,17)<->B2F(21,17); B1F (13,27)<->B2F(15,27); B1F (23,3)<->B2F(5,7); B1F (27,3) = EXIT to Route 4.
- B1F sections: A = {(5,5),(21,17)}, B = {(25,9),(17,11)}, C = {(25,15),(13,27)}, D = {(23,3),(27,3) exit}.
- B2F: (25,9) and (15,27) are isolated pockets (B2F (25,9) area is cut off from the rest by blockedMoves at y=11/12).
  (21,17) is in the MAIN area and reaches (5,7) ONLY THROUGH a FOSSIL tile (12,6) or (13,6) (the fossils are objects = 'N' walls).
  So the real route is 1F(5,5) -> B1F(5,5) -> B1F(21,17) -> B2F(21,17) -> beat SUPER NERD (12,8) -> take one fossil (talk, YES)
  -> walk north through the freed tile -> (5,7) -> B1F(23,3) -> B1F(27,3) exit.
- The old notes calling (21,17) a "DEAD END pocket pair" were WRONG: it is the right ladder; the walk to (5,7) failed because
  the fossils block it and the bot had no mechanic/option to take a fossil (NPC talk options were unlabeled "person i").
- Second bug: grid() is STALE for 60+ frames after a warp (new wCurMap, but OLD floor's size/tiles/NPCs). The old wait(30)
  was not enough: live run 234334 asked Jev on B1F with 1F's tiles ("talk to person at (5,..)", wrong distances, wrong
  "arrival ladder") -> Jev picked (21,17) from section B -> goWarp failed forever (nudges kept the stuck counter at 0).
- Third bug: B1F (27,3) ("the previous map") was labelled "MT_MOON_1F BACKWARDS" (prevMap) though it is the Route 4 exit.
### Fixes
- settleMap(): after a map change, wait until grid() size == ROM size*2 and npcs <= ROM objects, then cache the grid (gridCache).
- warpName(): "previous" warps -> last outdoor map (Mt Moon -> ROUTE_4).
- Mt Moon ladder options now carry ROM facts: "lands at B1F (23,3); from there you can walk to: ROUTE_4@27,3 (CAVE EXIT)"
  (from gridCache of floors already seen), "only past a person/object ...", and for the current map "blocked by the person/object
  at (12,6) or (13,6)". Talk options are labelled from rom objects (TRAINER class, item ball, FOSSIL); up to 10 NPCs in Mt Moon.
- goWarp returns true/false; a false goWarp marks the pick FAILED immediately (no endless retry of an unreachable ladder).
- talkTo walks up to 150 steps in Mt Moon and stops pressing A once a battle starts (Jev picks the moves).
- Tools: /work/scratch/dumpbot/bot.js (+ `node src/testrun.ts --bots /work/scratch/dumpbot ...`) dumps warps/objects/grid rows
  per log line; /work/scratch/bfs.js does offline reachability. Log lines are cut at ~500 chars.
- Test from live (run 225425): Jev walked B1F(21,17) -> B2F, picked talk:0 = SUPER NERD (12,8) -> battle WON ("We'll each take one!"),
  but then picked the ladder (5,7) instead of a fossil (goWarp failed, fossils still block). Added nerdBeaten() (event
  EVENT_BEAT_MT_MOON_EXIT_SUPER_NERD) so the fossil options say "ALREADY BEATEN, TAKE THIS FOSSIL NOW" and the nerd option says talking again does nothing.
- Seen but NOT fixed: "battle: Jev chose RUN" sometimes still ends up using TACKLE (RUN key sequence unreliable when the text is still
  scrolling). Jev also picks "progress" at ~20% HP in the cave.
- Also: in Mt Moon, warp options with NO walking path (other section of the floor) are now REMOVED from Jev's choice (Jev kept picking
  the unreachable B1F exit (27,3) from section A); ladders blocked only by a person/object stay (with the blocker named).
- CONFIRMED FIX (tests 225606 from live.state and 225607 from a nerd-beaten state): B1F(5,5) -> B1F(21,17) -> B2F -> talk:0 SUPER NERD
  (won) -> talk fossil "RED got the DOME FOSSIL!" -> B2F(5,7) (conf 0.82) -> B1F -> door:ROUTE_4 (27,3) (conf 0.98) -> ROUTE_4 ->
  edge:east -> CERULEAN_CITY -> CERULEAN_GYM. No loop errors.
- Heal in Cerulean added (CERULEAN_CITY/_POKECENTER/_GYM in healWhere + actions); heal-failure counter is now PER MAP
  (healFails['PC|'+map]; was one global healFails.PC, so 2 failures anywhere disabled healing in Cerulean) and reset on a successful heal.
  Test 225923 (from post-fossil 1F state, final code): crossed again, CERULEAN_GYM trainer beaten, "healed at Pokemon Center" in
  CERULEAN_POKECENTER, story 29, money 870, 67 Jev calls, no loop errors. Test 225826 (live, final code) did NOT cross: Jev chose heal
  twice / lost to a 1F hiker at low HP (HP management, not the map mechanics).
## Next
1. Cerulean has NO geography facts: Jev bounces CERULEAN_CITY <-> ROUTE_4 (edge:west/east, conf ~0.2) and CITY <-> GYM (gym "heal"
   exits, city "progress" re-enters). Add stage()/BADGE1-style facts: Route 4 west = backwards; gym = Misty (Grass beats Water);
   north = Nugget Bridge/Rival/Bill; heal first if HP low. Then Misty (Water; Ivysaur's VINE WHIP / RAZOR LEAF super effective). Gym talk options exist; check stage()/BADGE1 facts for Cerulean
   (Nugget Bridge north, Bill, Rival on the bridge) and add badge-2 stage text after Misty.
2. RUN in wild battles is sometimes ignored (TACKLE used instead) - check the key sequence timing.
3. Catch a 2nd Pokemon (still only Ivysaur); Jev picks "progress" at ~20% HP in caves.
4. The rom-derived landingFacts / settleMap / unreachable-warp filter are generic: consider enabling landingFacts for all multi-floor
   dungeons (Rock Tunnel, Rocket Hideout, Silph Co), not only /MT_MOON/.
## Session 20260926-230238 (short)
- Live run 000044 (deep-session code): Jev chose RUN 4x vs one Geodude; each time the B press didn't leave the move menu, so the
  cursor keys + A used TACKLE. Fix: RUN now presses B up to 4x until the screen shows RUN and no 'TYPE/' (move menu), else logs and
  retries next step. Test (6000 frames, live state): 3/3 RUN -> "Got away safely!" on the first try.
- Next: still items 1,3,4 of the list above (Cerulean geography facts first, once the live bot crosses Mt Moon).
## Session 20260926-230738 (short)
- Added CERULEAN_FACTS (bot.js, near mapFact): once any CERULEAN_* map was seen (seenCerulean, set in stage()/destOptions) and badges<2,
  Route 4 / Mt Moon warps are labelled BACKWARDS, CERULEAN_CITY>CERULEAN_GYM = THE WAY FORWARD (Misty, Grass SE), gym->city = backwards
  unless hurt, ROUTE_24 north = Nugget Bridge after Misty. The "progress" option text also says Mt Moon is crossed / beat Misty.
- Test from live (B2F, story 25): crossed Mt Moon -> ROUTE_4 -> CERULEAN_CITY, story 27, 0 errors, 16 Jev calls.
- Next: stage().goal still says "go east from Pewter..." after Cerulean: add a badges==1 && seenCerulean goal. Then check Misty fight
  (Ivysaur has only TACKLE/GROWL/LEECH SEED/POISONPOWDER at Lv25 - NO Vine Whip! It may have been skipped; consider teaching/checking moves).
## Session 20260926-231238 (short)
- stage().goal now has a Cerulean line (badge1 && seenCerulean: Mt Moon crossed, don't go back west, beat Misty - Starmie/Staryu,
  heal at Cerulean PC first) and a badges>=2 line (Nugget Bridge north -> Bill / S.S. Ticket -> Vermilion, Lt. Surge).
- Test (8000 frames, live CERULEAN_GYM): 9 Jev calls, new goal text reached Jev, gym trainer beaten (story 28->29, Ivysaur Lv26,
  money 980->1360), ended in CERULEAN_CITY, no errors. Misty not fought yet in the test.
- Next: watch the live Misty fight (Ivysaur has no Vine Whip: TACKLE/GROWL/LEECH SEED/POISONPOWDER); if it loses, have Jev weigh
  training on Route 24/25 or catching a 2nd Pokemon first. Also check CITY<->GYM bouncing with the new goal.
## Session 20260926-231738 (short)
- Live is now badges=2 (Misty beaten), CERULEAN_CITY, Ivysaur Lv26, story 31. Added BADGE2_FACTS (bot.js near mapFact, checked first
  when badges>=2): gym = DONE, ROUTE_24 north = THE WAY FORWARD (Nugget Bridge), ROUTE_24>ROUTE_25 / ROUTE_25>BILLS_HOUSE forward,
  Route 4 backwards. The "progress" option text now has a badges>=2 branch (Nugget Bridge -> Bill -> Vermilion).
- Test (8000 frames, live): 7 Jev calls, rival battle in Cerulean City (Charmander Lv17; Jev picks TACKLE ~0.93), Ivysaur -> Lv27,
  no errors; didn't leave CERULEAN_CITY within the short run.
- Next: confirm the bot actually goes north onto ROUTE_24 (check destOptions labels in jev.jsonl); map names of Bill's house may differ
  (check grid().warps names on ROUTE_25). Still only 1 Pokemon and only TACKLE as damage move: consider Jev-driven catching on Route 24/25.
## Session 20260926-232238 (short)
- state().badges is a BITMASK (Boulder=1, Cascade=2): after Misty Jev saw "badges":3. bot.js now calls gstate() everywhere (copy of
  state() with badges = popcount, badgeBits = raw mask). All badges>=N checks are now true counts (Thunder badge would have been 7).
- Train option text for badges>=2 now mentions Nugget Bridge levels / Lt. Surge instead of Misty.
- Test (8000 frames, live ROUTE_24): Jev state shows badges:2, story 35->36, Ivysaur Lv28, money 4594->4834, no errors.
- Next: ROUTE_25 / BILLS_HOUSE (check warp names, Bill's cell-separator event talk), then Jev-driven catching of a 2nd Pokemon.
## Session 20260926-232738 (short)
- Ivysaur Lv28 has no VINE WHIP (lost to A-mashing at a "Delete an older move?" prompt). Added moveLearnStep() (bot.js before play()):
  on that prompt Jev picks keep / forget_<i>; code presses B+YES(abandon) or YES + DOWN*i + A. Uses party()[0].moves (format unverified!).
- Test 5000 frames live ROUTE_25: no crash, Jev answered; the move-learn prompt NOT exercised yet (Razor Leaf comes at Ivysaur Lv30).
- Next: verify moveLearnStep at Lv30 (check run.jsonl "move learn:" log); then Jev-driven catching of a 2nd Pokemon; Bill's house.
## Session 20260926-233238 (short)
- Battle move options: status moves now carry STATUS_NOTES facts (LEECH SEED drain / Grass-immune, POISONPOWDER / Poison-immune,
  GROWL weak) so Jev can weigh Leech Seed vs resisted TACKLE (e.g. Geodude x0.5). Test 5000 frames live ROUTE_25: 6 Jev calls
  (all TACKLE ~0.9), new text seen by Jev, 0 errors, no map change.
- Confirmed: BILLS_HOUSE is the real warp name on ROUTE_25 (appears in destOptions). Live bot is fighting Route 25 trainers.
- Seen once: ROUTE_25 -> CERULEAN_CITY map change right after a trainer battle "ended" at full HP (run 002329) - unexplained, check.
- Next: verify moveLearnStep at Lv30 (Razor Leaf), reach Bill, then Jev-driven catching of a 2nd Pokemon.
## Session 20260926-233738 (short)
- Found: Ivysaur is OUT OF TACKLE PP on Route 25 (battle options only GROWL/POISONPOWDER, Jev ~50/50) and healWhere had no entry for
  ROUTE_24/ROUTE_25/BILLS_HOUSE, so Jev was never offered "heal" there. Added healWhere texts + heal execution (ROUTE_25 -> walkEdge west,
  ROUTE_24 -> walkEdge south, BILLS_HOUSE -> previous; failures count in healFails 'PC|map') and those maps in the hf regex.
- Test 12000 frames live: 10 Jev calls, started mid-trainer-battle with 0 attack PP -> fainted -> blacked out to CERULEAN (money 2466->1233,
  healed). The new heal path was NOT exercised yet. Then Jev picked progress / edge:north.
- Next: in battle with no damaging PP left, offer RUN (wild) / consider Struggle facts; verify Route25->24 heal walk works (ledges?);
  Razor Leaf at Lv30 (moveLearnStep); reach Bill; Jev-driven catching of a 2nd Pokemon (a real attacker is badly needed).
## Session 20260926-234238 (short)
- Live run 003830 was LOOPING ROUTE_24<->ROUTE_25: on 25 Jev picked heal (walk west), on 24 heal wasn't offered (healFails 'PC|ROUTE_24'
  likely >=2: walkEdge south fails there) so Jev picked progress -> back east. Added healTrip (bot.js near goalCache): once Jev picks heal,
  goal() keeps returning 'heal' on later maps (while heal is offered) until HP and PP are full. Heal text "Talking to Mom FAILED" -> "Walking there FAILED".
- Test 8000 frames live ROUTE_24: 9 Jev calls, progress -> edge:east -> door:BILLS_HOUSE (0.99), TACKLE x5, Ivysaur Lv30, 0 errors.
- Next: WHY does walkEdge('south') fail on ROUTE_24 (heal path to Cerulean PC)? Check Razor Leaf moveLearnStep log at Lv30; talk to Bill.
## Session 20260926-234722 (short)
- Live bot was STUCK in Bill's house: talked to Bill (YES), then left before using the Cell Separator, so the event reset every visit.
  Added a mechanical step in play() (before goal()): in BILLS_HOUSE, when lastTexts has "Cell Separation", wait 240 frames, walk to (1,5),
  face UP, mash A 20x (billPcTries, max 3/session). Test 7000 frames live: story 45 -> 49, 4 Jev calls, 0 errors.
- Next: confirm the S.S. Ticket was received (talk to Bill again if not), then Jev should route back via Cerulean south (Route 5/6) to
  Vermilion; add BADGE2 facts for Cerulean->ROUTE_5 as the way forward once the ticket is held. Then Jev-driven catching of a 2nd Pokemon.
## Session 20260926-235222 (short)
- Did the long-deferred step: Jev-driven CATCHING. pickMove() offers CATCH in wild battles when bag() has any *BALL, party<6 and
  catchFails[species]<3 (facts: balls left, party size, enemy HP%, already-owned, prior failures). battleStep idx -3: B out of move menu,
  cursor ITEM (UP,LEFT,DOWN,A), DOWN until cursor row contains BALL, A throws; logs "battle: CAUGHT"/"Jev chose CATCH".
- Test 9000 frames live ROUTE_25: 4 Jev calls, story 46 -> 51 (end in BILLS_HOUSE), 0 errors. CATCH NOT exercised (no wild battle);
  unknown whether the bag holds any Poke Balls at all - if none, CATCH is never offered: add a Jev "shop" goal (Cerulean Mart, Poke Ball 200).
- Next: verify CATCH in a wild fight (run.jsonl "CATCH"), buy balls if none; then route south from Cerulean to Vermilion (S.S. Ticket).
## Session 20260926-235722 (short)
- Live run 005316 had the S.S. TICKET (Bill's post-ticket text "check out my rare POKéMON on my PC") but LOOPED BILLS_HOUSE<->ROUTE_25
  because BADGE2_FACTS still called Bill's house THE WAY FORWARD. Added checkTicket() (bag() item name /TICKET/, cached) + TICKET_FACTS
  (Bill/Route 25/24 = backwards/done, ROUTE_24>CERULEAN_CITY and CERULEAN_CITY>ROUTE_5 = forward) and a ticket goal line in stage().
- Test 9000 frames live: 17 Jev calls, Bill's house -> Route 25 -> 24 -> CERULEAN_CITY, 0 errors. In Cerulean Jev picks edge:south
  (~0.67) repeatedly but the run ended still in CERULEAN_CITY - check whether walkEdge('south') fails in Cerulean (the south exit
  to Route 5 is a narrow gap); if so add a mechanical path to Route 5 (or offer door options that lead there).
- Next: get into ROUTE_5 -> Underground Path -> ROUTE_6 -> VERMILION; then shop for Poke Balls + CATCH a 2nd Pokemon.
## Session 20260927-000222 (short)
- ROOT CAUSE of Cerulean south loop (edge:south FAILED 69x): walkEdge's best tile is a dead-end pocket (17,28); the way south is a
  CUT tree at (19,28). Real route: CERULEAN_TRASHED_HOUSE (27,11) -> out the hole in its back wall -> Rocket grunt -> east side of city
  (x~37-38) south to Route 5. Added TICKET_FACTS for CERULEAN_CITY>CERULEAN_TRASHED_HOUSE (way forward), TRASHED_HOUSE>CERULEAN_CITY,
  and ROUTE_5 caveat. walkEdge now logs once per map+side the target + grid rows near the player (debug).
- Test 5000 frames live: Jev picked door:CERULEAN_TRASHED_HOUSE (conf 0.4), came out the back, Rocket (MACHOP Lv17) battle started. 0 errors.
- Next: confirm Route 5 reached after the Rocket (walkEdge south from the east side); edge:south facts should say "unreachable" when
  walkEdge's target is a pocket; then Underground Path -> Vermilion; buy Poke Balls + CATCH.
## Session 20260927-000722 (short)
- Live bot got through Cerulean -> Route 5 -> Underground Path -> ROUTE_6 (last session's trashed-house facts worked).
- Added TICKET_FACTS for Route 5 -> Underground Path -> Route 6 -> VERMILION_CITY -> VERMILION_DOCK -> SS_ANNE_1F/2F/CAPTAINS_ROOM
  (way forward), gates/tunnel-back as backwards, VERMILION_MART (buy Poke Balls), VERMILION_GYM (needs Cut).
- Test 9000 frames live ROUTE_6: Jev picked edge:south (VERMILION_CITY, p=1.0) with the new fact; trainer battles on Route 6
  (RAZOR LEAF ~0.6); story 54 -> 55, ended still on ROUTE_6 (battles took the time). 0 errors.
- Next: confirm VERMILION_CITY reached and dock/S.S. Anne boarding works (ticket shown to sailor automatically); SS_ANNE maps
  need facts for 1F rooms / B1F; add a Jev "shop" goal at VERMILION_MART for Poke Balls, then CATCH a 2nd Pokemon.
## Session 20260927-001222 (short)
- Live run 010814 reached VERMILION -> DOCK -> SS_ANNE_1F/2F, then BLACKED OUT to rival BLUE (PIDGEOTTO Lv19) at IVYSAUR 28/85 PARALYZED
  and was sent back to CERULEAN (walked back to Route 5). Cause: healWhere had no entries south of Cerulean, so Jev was never offered heal.
- Added healWhere for VERMILION_CITY/POKECENTER/DOCK, SS_ANNE_1F/2F, ROUTE_6 (+ healFails regex covers VERMILION|SS_ANNE|ROUTE_6).
- Test 6000 frames live ROUTE_5: reached UNDERGROUND_PATH_NORTH_SOUTH, Jev answered, 0 errors. Heal-in-Vermilion NOT yet exercised.
- Next: verify the heal trip works from SS_ANNE (walk off ship to Vermilion PC); Razor Leaf vs Pidgeotto is resisted - battle facts
  should push TACKLE/LEECH SEED vs Flying; buy Poke Balls at VERMILION_MART and CATCH a 2nd Pokemon (listed 5+ sessions).
## Session 20260927-001722 (very short)
- Live was stuck-prone on SS_ANNE_BOW (no facts). Added TICKET_FACTS: SS_ANNE_2F>3F / 3F>BOW = dead end, 3F>2F and BOW>3F = WAY FORWARD
  (captain's room is off 2F); healWhere for SS_ANNE_3F / SS_ANNE_BOW.
- Test 6000 frames live: 7 Jev calls, SS_ANNE_BOW -> 3F -> SS_ANNE_2F, 0 errors. Captain/HM01 CUT not yet reached.
- DEFERRED 6+ sessions, MUST DO NEXT: Jev "shop" goal at VERMILION_MART (buy POKE BALLs; needs mart menu code: talk to clerk, BUY,
  pick POKE BALL, qty) then CATCH a 2nd Pokemon. Also: after CUT, teach it (HM menu) and go to Vermilion Gym.
## Session 20260927-002222 (very short)
- Added Jev "shop" goal option (only in VERMILION_MART, <3 balls, money>=700, <2 fails) + buyBalls(): walk 2 tiles right of leftmost NPC
  (clerk), face LEFT, A x4 (greeting/BUY/POKE BALL), UP for qty, A x4, B out; logs "shop: balls a -> b". ballCount() from bag().
  UNTESTED mechanics (the test never reached the mart): verify clerk position/menu flow in run.jsonl "shop:" lines.
- Test 4000 frames live: SS_ANNE_2F -> SS_ANNE_CAPTAINS_ROOM, story 58 -> 60 (likely HM01 CUT). 0 errors.
- Next: teach CUT (HM menu), leave ship, offer shop in Vermilion (Mart facts already point there), CATCH, then Vermilion Gym (Cut tree).
## Session 20260927-002722 (very short)
- Live: the S.S. Anne SAILED (story 63), HM01 Cut obtained, but facts still said the dock was THE WAY FORWARD. Added checkCut() (bag /HM01|CUT/)
  + CUT_FACTS (dock = DONE, Mart = buy balls, Route 11 = Diglett's Cave, Gym = needs CUT taught) with top priority in mapFact, and a
  Cut stage() goal line. Test 6000 frames live: Jev went Route 11 -> Diglett's Cave -> back -> picked door:VERMILION_MART (0.95). 0 errors.
- BUG FOUND: Jev picked shop twice, but buyBalls() logged "shop: balls 0 -> 0" both times, so the clerk position/menu flow is wrong.
  MUST FIX NEXT: look at the shots in a test run inside VERMILION_MART (clerk is behind the counter; in pokered the Mart clerk is at
  (0,5) facing right, and the player talks from (1,5) facing LEFT... verify with grid()/npcs), then the buy menu: A greeting -> BUY is first item -> A -> list.
- Then: teach CUT (START > POKEMON > Venusaur > CUT is a field move only if learned; use the item HM01 from the bag > TEACH), CATCH Diglett, gym.
## Session 20260927-003222 (very short)
- Rewrote buyBalls(): finds the NPC with a counter tile 'C' adjacent in grid().rows, stands across the counter (2 tiles away) facing it,
  then drives the menu by reading screen() text (A until "How many", UP for qty, A; B out once BUY/SELL menu returns). Logs
  "shop: spot ..." and "shop screen: ..." lines (first 12 screens) -> read these in run.jsonl to debug if still "balls 0 -> 0".
- Test 6000 frames live (ROUTE_11_GATE_2F -> ROUTE_11): 10 Jev calls, no crash. Mart NOT reached, so new buy code still unverified.
- Next: verify shop in the Mart via logs; teach CUT; CATCH Diglett (Diglett's Cave off Route 11); Vermilion Gym.
## Session 20260927-003722 (very short)
- Live run 013314: shop WORKED mechanically (clerk spot found, BUY menu reached) but the loop kept pressing A after the qty, re-buying
  until 25 iterations: money 5536 -> 136, log said "balls 0 -> 2" (odd; check bag() qty). Fixed: after the qty, A x2 (YES + thanks) then break/B out.
- Next: bag now has Poke Balls and ~no money -> CATCH a 2nd Pokemon (Diglett in Diglett's Cave via Route 11) with a Jev "catch" battle option;
  teach CUT; Vermilion Gym.
- Live was stuck in the Mart BUY/SELL menu (main loop mashed A -> 'Take your time.' forever, 0 Jev calls). Main loop now presses B on QUIT/'Take your time'/'How many' screens.
## Session 20260927-004222 (very short)
- Added teachCut() (START > ITEM > DOWN until cursor row shows HM01 > USE > YES > first mon); called from main loop when CUT in bag
  but not in party moves (max 2 tries/session, not in PC/Mart). 4-move case goes to moveLearnStep -> Jev picks which move to forget.
- Test 4000 frames live (DIGLETTS_CAVE_ROUTE_11): teachCut reached the forget prompt, Jev picked forget_0 (conf 0.44), 3 Jev calls.
  Did NOT confirm Venusaur now knows CUT (knowsCut logged false before the prompt resolved) - check party moves in next logs.
- Next: verify CUT learned; use CUT on the tree to Vermilion Gym (field move via START > POKEMON > CUT facing tree); CATCH Diglett; gym.
## Session 20260927-004722 (very short)
- Confirmed live: Venusaur LEARNED CUT (forgot TACKLE). knowsCut() also true now via cutKnown flag (screen text 'knows/learned CUT').
- Added cutTreeToward(): in goWarp, if the chosen door is unreachable and CUT known, walk next to the nearest 'T' tile, face it,
  START > POKEMON > first mon > CUT, log "cutTree: (x,y) ... -> tile 'X'". UNVERIFIED (Jev never picked the gym in test).
- Gym door option now says "(reachable by cutting the tree)" instead of NO walking path + CUT_FACTS say THE WAY FORWARD.
- Next: check "cutTree:" lines; if the field-move menu flow is wrong, look at shots. Then Lt. Surge (Venusaur Lv33 should win with
  Razor Leaf/Vine Whip; heal first). Catch a 2nd Pokemon (Diglett) still deferred.
## Session 20260927-005222 (very short)
- Live runs 014322/014832: player stuck at VERMILION_CITY (23,15); goWarp to MART (23,13) and GYM fail every time, yet Jev kept
  re-picking them (Mart FAILED 5x still chosen). Added: dest question hides options that FAILED 3+x from this map (if >=2 remain), logs "dest: hid N".
- Test 6000 frames live: 3 Jev calls (heal -> door:VERMILION_MART -> fail -> edge:east), no crash. Filter not yet triggered in test.
- UNSOLVED: why walking 2 tiles north from (23,15) to the Mart door fails (stuck text box "knows CUT!"? NPC? check shots/grid at 23,14).
  Also Jev picked "heal" (HP 30%, BURN) but dest then picks Mart, not Pokecenter -> heal goal isn't steering the dest question. Fix next.
- Still pending: cutTree verification, Lt. Surge, catch Diglett.
## Session 20260927-005722 (very short)
- ROOT CAUSE of the stuck player at VERMILION_CITY (23,15): live end.png shows the "Use TM on which POKeMON?" party menu open
  (HM01 menu). Main loop mashes A -> Venusaur -> "knows CUT!" -> the same menu again, forever; goWarp/walk fail because a menu is open.
- Added a main-loop guard: if screen rows match Use TM on/on which POK/knows CUT/NOT ABLE/HM01, log "menu: backing out of HM/TM
  party menu" and press B x10. Tests (6000 + 2500 frames): guard fires, Jev answered 3 and 2 questions, but the player is STILL at (23,15),
  so something reopens the menu or the B presses are not enough. NEXT: read shots in the test run right after "backing out" to see
  which screen remains; find what reopens the HM menu (likely teachCut/cutTreeToward, or leftover START>ITEM). Then Mart/Gym/Lt. Surge.
## Session 20260927-010223 (DEEP) — ROOT CAUSES of the 3-session Vermilion/Route 11 stall (fixed, badge 3 won in test)
Confirmed from live run 015815 + tests (not guesses):
1. goWarp gave up right AFTER a successful CUT: cutTreeToward() returned true ("hacked away with CUT!", tile T -> '.') and goWarp then
   `return false` -> dest marked FAILED; Jev moved on, the tree regrew on the next map load. Fix: after the cut, keep walking to the door.
   Test: "cutTree: tree cut, walking on to VERMILION_GYM" -> map VERMILION_CITY -> VERMILION_GYM (first time ever).
2. Standing ON a stairs warp (arrival tile, e.g. ROUTE_11_GATE_2F (7,7), DIGLETTS_CAVE (37,31)) goWarp walked 0 steps and pushed into
   the wall -> "goWarp failed ... at 7,7" 3x -> Jev left only with talk options (live bot is looping NPC talks there right now).
   Stairs fire only when stepped ONTO. Fix: step off to a free non-warp neighbour, then walk back on (log "goWarp: on the warp").
   (First hold often only turns the player; the loop retries, it works.)
3. Vermilion Gym needs the TRASH-CAN switch puzzle (no mechanic existed). Added `search:trash` dest option (VERMILION_GYM, until
   EVENT_2ND_LOCK_OPENED) + trashStep()/checkCan(): cans at x=1,3,5,7,9 / y=7,9,11 (index col*3+row, VERIFIED in game), face can + A,
   state from event('EVENT_1ST_LOCK_OPENED'/'EVENT_2ND_LOCK_OPENED'). 1st found -> try its neighbours; wrong 2nd resets AND re-randomizes
   the 1st (seen: 1st at 8, 14, 0, 6, 6, 10, 0, 6 in successive cycles) -> start over. Took 7 cycles in one test, 2 in another. Cans whose
   A gives no text are retried (A press sometimes doesn't register), marked tried after 2 misses.
4. Lost to Lt. Surge once at low HP/BURNED -> blackout to CERULEAN (last PC used). Cause: "heal" had no execution for VERMILION_CITY
   (fell through to the dest question -> Mart) and no heal option in VERMILION_GYM/ROUTE_11. Added healWhere + execution
   (VERMILION_CITY -> VERMILION_POKECENTER, GYM -> previous, ROUTE_11 -> west). Gym-leader talk option now shows party HP/status.
   Test from the gym: Jev heal (0.93) -> cut tree -> PC "healed" -> ... -> trash puzzle -> "RED defeated LT.SURGE! ... THUNDERBADGE" (badges 3).
- Added stage() goal for badges>=3 (Cerulean -> Route 9 (Cut tree) -> Route 10 -> Rock Tunnel -> Lavender -> Route 8 -> Celadon) and
  BADGE3_FACTS (gym DONE, ROUTE_6 north = forward, Route 11/Diglett = side). cutFieldTries cap 6 -> 12.
5. goWarp fallback (no warp named dest, e.g. stale st.map right after a warp) + the new step-off caused a gym<->city bounce; step-off now
   only for warps that MATCH dest. Cut-stage facts no longer lure Jev into Diglett's Cave/Route 2 (marked BACKWARDS; ROUTE_11>CITY forward).
6. After badge 3 the player lands on the gym door INSIDE the tree pocket (tree regrows) and edge:north bounced gym<->city. Added
   cutOutOfPocket() (goDest, before every edge walk): flood-fill walkable tiles; if < 80 and touching a 'T', cut it. Test from the badge-3
   state: pocket 42 -> cut -> ROUTE_6 -> Underground Path -> ROUTE_5 -> CERULEAN -> edge:east -> ROUTE_9 (pocket 9 -> Route 9 tree cut).
Tests (all 0 errors): from live ROUTE_11_GATE_2F (100k frames): heal at Vermilion PC -> gym -> trash puzzle -> THUNDERBADGE (badges 3,
story 72, 114 Jev calls). From badge-3 state: reached ROUTE_9, story 74. Full run from live (120k frames): THUNDERBADGE -> Route 9 ->
Route 10 -> ROCK_TUNNEL_POKECENTER -> ROCK_TUNNEL_1F -> ROCK_TUNNEL_B1F (story 78). Final file (40k frames from live): badge 3, 0 errors.
Also replaced the stale Cut-stage goal text (it told Jev to shop + catch Diglett first) with: heal, gym, trash cans, Surge.
## Next
1. Route 9 -> Route 10 -> Rock Tunnel -> Lavender: add BADGE3_FACTS for ROUTE_9/ROUTE_10/ROCK_TUNNEL_* (landingFacts is gated to /MT_MOON/:
   widen to /ROCK_TUNNEL/), healWhere for ROUTE_9/ROUTE_10/ROCK_TUNNEL_POKECENTER. Rock Tunnel is dark without FLASH (movement still works).
2. Still only one Pokemon (Venusaur). Balls: check bag; CATCH in wild battles (listed many sessions).
## Session 20260927-012223 (very short)
- Added heal support on the way to Lavender: healWhere + execution for ROUTE_10 (goWarp ROCK_TUNNEL_POKECENTER), ROUTE_9 (walkEdge east),
  ROCK_TUNNEL_POKECENTER (nurse); hf regex includes ROUTE_9/10. UNTESTED on those maps (8k-frame test from live VERMILION_GYM:
  still in the trash puzzle, story 67->69, 5 Jev calls, no crash).
- Catching already exists (battle CATCH option, buyBalls at the Mart); the problem is no balls/money (136-1266). Next: check a wild battle log for CATCH.
## Next (updated)
1. Verify the Route 9/10 heal + Rock Tunnel path once live reaches it; widen landingFacts gating from /MT_MOON/ to /MT_MOON|ROCK_TUNNEL/.
2. Second Pokemon: buy balls when money >= 700 at any Mart (shop option is only for VERMILION_MART now), then CATCH.
## Session 20260927-012723 (very short)
- BUG found in live jev.jsonl: after badge 3 the Underground Path facts (BADGE2 table) still said north = BACKWARDS, south = FORWARD, and
  the goal "progress" option still described Bill's house. Added BADGE3_FACTS for ROUTE_6 / UNDERGROUND_PATH_* / ROUTE_5 / CERULEAN / ROUTE_9
  (north then east = forward) and a badges>=3 branch in opts.progress. Test 8k frames from live UNDERGROUND_PATH_ROUTE_6 -> reached ROUTE_9.
## Next
1. Route 9 -> Route 10 -> Rock Tunnel -> Lavender: BADGE3_FACTS for ROUTE_10/ROCK_TUNNEL_*; widen landingFacts gating /MT_MOON/ -> /MT_MOON|ROCK_TUNNEL/.
2. Second Pokemon: buy balls at any Mart when money >= 700 (money is 3642 now!; Cerulean Mart is on the way), then CATCH.
## Session 20260927-013223 (very short)
- Second-Pokemon step (listed 3+ sessions): shop option now offered in ANY *_MART (was VERMILION_MART only), plus a new town option
  "shop" in CERULEAN/VERMILION/LAVENDER/CELADON/PEWTER/VIRIDIAN (party < 3, balls < 3, money >= 700): Jev picks it -> goWarp(<TOWN>_MART)
  -> buyBalls. martWalkFails[map] caps failed walks at 2. Test 8k frames from live ROUTE_9: 6 Jev calls, no crash, story 73->74,
  money 4002->4708 (shop path not reached yet: no town on Route 9).
## Next
1. Verify in LAVENDER_TOWN that Jev picks shop and LAVENDER_MART buy works (check "shop screen:" logs), then CATCH in wild battles.
2. Rock Tunnel: BADGE3_FACTS for ROUTE_10/ROCK_TUNNEL_*; widen landingFacts gating /MT_MOON/ -> /MT_MOON|ROCK_TUNNEL/.
## Session 20260927-013723 (very short)
- Rock Tunnel facts (listed 3+ sessions): BADGE3_FACTS for ROUTE_10>ROCK_TUNNEL_1F/POKECENTER, 1F<->B1F ladders; landingFacts now also
  runs in ROCK_TUNNEL_1F/B1F (was MT_MOON only); rockExitFact() labels 1F exits to Route 10: y<12 = NORTH entrance (BACKWARDS), else
  SOUTH exit (forward to Lavender). Test 15k frames from live ROCK_TUNNEL_1F: 17 Jev calls, 1F->B1F->1F->ROUTE_10 (unclear if the north
  or south part of Route 10; story 77 unchanged). The y<12 split is a guess from pokered warps (north 15,3 / south ~15,33): verify.
## Next
1. Check where Rock Tunnel lands the bot; if it keeps exiting north, check the heal logic / Jev picks in jev.jsonl. Reach LAVENDER_TOWN.
2. Lavender: shop (balls) + CATCH a second Pokemon (money 6258).
## Session 20260927-014223 (very short)
- BUG in live run 023823: bot looped 1F(37,3) <-> B1F(33,25) forever. B1F has 4 ladders up to 1F, but the per-ladder listing
  (`multi`, door:<MAP>@x,y ids) was gated to MT_MOON, so Jev only ever saw ONE B1F ladder (the one it arrived on). Widened the
  gates on multi, unreachable-ladder pruning and the long walkTo budget to /MT_MOON|ROCK_TUNNEL/. 1F's two ROUTE_10 exits are now separate too.
- Rock Tunnel pokered warps: 1F (15,3) R10 north, (15,33) R10 south, ladders (37,3),(5,3),(17,11),(37,17); B1F (33,25),(27,3),(23,11),(3,3).
## Next
1. Verify the bot exits Rock Tunnel south -> LAVENDER_TOWN. 2. Lavender: shop balls + CATCH a second Pokemon (money 7508).
## Session 20260927-014723 (very short)
- BUG in live run 024441: still looping 1F(37,3) <-> B1F(33,25); Jev kept picking the nearby ladder "taken 4 times" over the untried
  B1F(27,3) (33 tiles away). destOptions now post-processes cave ladders (MT_MOON|ROCK_TUNNEL): if a reachable ladder is untried, ladders
  taken >=2 times get "LOOP WARNING ..." and untried ones get "NEVER TRIED yet ...". Test 12k frames from live B1F: Jev picked
  door:ROCK_TUNNEL_1F@27,3 (conf 0.43), story 79->80, money 7948->9048, no crash.
- Observed: bot has 27 Poke Balls but Jev never picks CATCH; CATCH text says "a lone Ivysaur" (stale: it's VENUSAUR Lv36). Goal text in
  state still describes the route from Vermilion.
## Next
1. Confirm the bot exits Rock Tunnel south -> LAVENDER_TOWN (1F 5,3 -> B1F 17,11 -> ... ).
2. Fix the stale CATCH description (Venusaur Lv36, 27 balls) and make CATCH more attractive for new species (2nd Pokemon still missing!).
## Session 20260927-015223 (very short)
- Live party now VENUSAUR Lv37 + ONIX Lv13 (a catch happened). Fixed stale CATCH option text: now lists the real party
  (species+level), says types other than Grass cover Fire/Ice/Flying/Psychic weaknesses, and marks new species as filling the Pokedex.
  Test 10k frames from live ROCK_TUNNEL_B1F: 10 Jev calls, Jev picked CATCH on GEODUDE Lv17 -> party 3, dex owned 4->5, no crash.
  Ended on ROCK_TUNNEL_1F (story 81 unchanged).
## Next
1. Confirm the bot exits Rock Tunnel south -> LAVENDER_TOWN. 2. Low-level Onix/Geodude: consider a Jev "train/switch in" decision
   so the new members gain EXP (e.g. switch in vs weak wild mons). 3. Pokemon Tower needs a Silph Scope -> Celadon (Rocket Game Corner) next.
## Session 20260927-015723 (very short)
- Live run 025259 still looped 1F(37,3)<->B1F(33,25) (all nearby ladders tried, so LOOP WARNING never fired). Added RT walkthrough
  facts to each Rock Tunnel ladder option (bot.js, after the LOOP WARNING block): 1F 37,3 -> B1F 27,3 -> 1F 5,3 -> B1F 23,11 -> 1F
  south exit (15,33). Route order is from memory of pokered warps; verify. Test 12k frames: Jev picked B1F(27,3) then 1F(5,3) (as
  the walkthrough says), no crash, story 81 unchanged, ended on B1F.
## Next
1. Confirm exit south -> LAVENDER_TOWN; if walkthrough wrong, fix the RT table. 2. Onix/Geodude EXP switch-in decision. 3. Celadon.
## Session 20260927-020223 (very short)
- BUG in live run 025259: on ROCK_TUNNEL_1F the harness resolves the LAST_MAP exits (15,3 north / 15,33 south) to the last map, so
  (15,3) was offered as "door:ROCK_TUNNEL_B1F@15,3 ... ladder DOWN, NEVER TRIED" -> Jev took it and walked out NORTH to Route 10.
  Fix: in destOptions, 1F warps at x=15 with y<=3 or y>=33 are labelled ROUTE_10 (ids now door:ROUTE_10@15,3 / @15,33; goWarp
  still gets the raw target), plus RT walkthrough facts: 15,3 = backwards north entrance, 15,33 = SOUTH exit (goal).
  Test 12k frames from live B1F: Jev answered ~8 questions, no crash, ended B1F (story 81); didn't reach 1F south in that window.
## Next
1. Verify the live bot now leaves 1F via door:ROUTE_10@15,33 -> LAVENDER_TOWN (live bot currently starts on ROUTE_10 north part:
   it must re-enter the tunnel). 2. Onix/Geodude EXP switch-in decision. 3. Celadon.
## Session 20260927-020723 (very short)
- Live run 025815 looped again: the RT walkthrough table was WRONG. The bot's own landing facts (jev.jsonl) show the real graph:
  1F 37,3 -> B1F 33,25 ~walk~ B1F 27,3 -> 1F 5,3 ~walk~ 1F 17,11 -> B1F 23,11 ~walk~ B1F 3,3 -> 1F 37,17 (south part) ~walk~ exit 15,33.
  Fixed the RT table (1F 5,3 and B1F 23,11 are now BACKWARDS; 1F 17,11 and B1F 3,3 are forward), and "NEVER TRIED ... way out of the
  loop" is removed from options the table marks BACKWARDS (it had pushed Jev to the north exit 15,3).
  Test 15k frames from live B1F: Jev picked B1F 27,3 (0.92) -> 1F 17,11 (0.95) -> B1F 3,3 (0.95, the final ladder); run ended just
  before arriving. No crash. Story 81 unchanged.
## Next
1. Confirm the live bot lands 1F (37,17) and exits via door:ROUTE_10@15,33 -> LAVENDER_TOWN. 2. Onix/Geodude EXP switch-in decision
   (put off 4 sessions now: do it next if the tunnel is solved). 3. Celadon (Silph Scope for Pokemon Tower).
## Session 20260927-021224 (DEEP)
- VERIFIED (live run 030826, current code): the Rock Tunnel ladder table is now right. Live went 1F 37,3 -> B1F 27,3 -> 1F 17,11 ->
  B1F (Jev picked 3,3, conf 0.96) and walked B1F west to (11,14). Older runs (030336) looped only because they ran the OLD wrong table
  (it said 1F 5,3 = forward). Pokered warps confirm: 1F(37,3)<->B1F(33,25), 1F(5,3)<->B1F(27,3), 1F(17,11)<->B1F(23,11), 1F(37,17)<->B1F(3,3).
- ROOT CAUSE of the live freeze (run 030826, t=256s onward, B1F (11,14)): trainer battle (JR.TRAINER F, Jigglypuff/Pidgey Lv21) shows
  "Will RED change POKeMON?" (only appears now that party >= 2). battleStep only understood the move menu, so it pressed A = YES ->
  party menu -> A on the active VENUSAUR -> "AAAAAAAAAA is already out!" -> back to the party menu -> A ... forever (33+ s of A presses).
  FIX (battleStep, mechanics): cursor + "change POK" -> press B (= NO); party menu text (Choose a POK/already out) -> B B out;
  forced ("Bring out which"/"no will to fight"/lead hp 0) -> cursor to the first healthy member's NICKNAME row (party menu shows
  nicknames, party()[i].nickname), A, A on SWITCH.
- Also seen: Venusaur's RAZOR LEAF was at 1 PP (ppLeft) in that battle. Heal before long caves.
- CONFIRMED by tests: test 021431 from the live (frozen) state: the prompt was declined, the trainer beaten, B1F 3,3 -> 1F (37,17)
  (the south part, never reached live), story 81->85. Test 021909: Jev picked door:ROUTE_10@15,33 (0.97) -> ROUTE_10 south part
  (story 87), but then went BACK into the tunnel: the ROUTE_10>ROCK_TUNNEL_1F fact said "THE WAY FORWARD". Added a ROUTE_10 south-part
  (y > 40) fact override in destOptions: tunnel door (8,53) = BACKWARDS, edge:south = forward to Lavender. Test 022xxx: Jev picked
  edge:south; walkEdge south from (7,56) was interrupted by a JR.TRAINER F battle (normal, not a loop).
- Venusaur runs out of attack PP in the tunnel (only POISONPOWDER left, Jev spams it on a poisoned mon). Heal at Lavender first.
- Forced switch (lead fainted) FIXED + CONFIRMED (test 022159): party menu facts: ALL party nicknames are "AAAAAAAAAA"; the cursor
  sits on the HP row (y = name row + 1: rows 1/3/5); "There's no will to fight!" hides the cursor (press B to dismiss). The old code
  re-selected the fainted mon forever. Now: Geodude sent out; team then lost to a JR.TRAINER on Route 10 south (0 attack PP) ->
  blackout to the Rock Tunnel PC (north side) -> bot re-entered the tunnel on the right route (35 Jev calls).
- Heal on Route 10 SOUTH part (y > 40) now = walkEdge south to Lavender; LAVENDER_TOWN heal = goWarp LAVENDER_POKECENTER (was: goWarp
  to the unreachable Route 10 PC, failed).
- Test 022254 (1F south -> Route 10 south): lost to a POKeMANIAC (Cubone/Slowpoke Lv20) because Venusaur had 0 PP on every damaging
  move (only POISONPOWDER offered, spammed on an already-poisoned Cubone), while the heal option said "attack PP 61%" (party average
  incl. unused Onix/Geodude Tackle). ppFrac now = min(party, lead); POISONPOWDER fact says FAILS if the enemy already has a status.
- Added a SAVE PP fact to the wild-battle RUN option in ROCK_TUNNEL_*/ROUTE_10 (lead's damaging-move PP, blackout history).
  Jev then RAN 10x (conf 0.93-0.97). Test 022609 from live: tunnel crossed again, but the lead had 0 PP already (spent before the
  live state) -> blackout on Route 10 south (JR.TRAINER Pidgeotto) -> Rock Tunnel PC heal. Test 022753 from that healed state:
  tunnel -> ROUTE_10 south -> LAVENDER_TOWN -> POKEMON_TOWER 1F..6F (story 87->94, 87 Jev calls, 0 errors). CONFIRMED past the block.
- Expect live: 1 blackout on Route 10 south, then success on the 2nd crossing (as in the tests).
- NEW PROBLEM (seen at the end of test 022753): the bot walks into POKEMON_TOWER right away and climbs to 6F; Venusaur fainted there.
  Without the SILPH SCOPE the 6F ghost (Marowak) can't be beaten. Needs Lavender facts: Pokemon Tower = BACKWARDS for now;
  go WEST via Route 8 -> Underground Path (Route 8 gate) -> Celadon (Erika, Grass gym; Rocket Game Corner -> Silph Scope).
## Next
00. Lavender/Pokemon Tower facts (above): mark POKEMON_TOWER_* as "later, needs Silph Scope"; Route 8 west = forward. Heal at LAVENDER_POKECENTER.
0. PP management: the lead exhausts attack PP inside Rock Tunnel (Jev spams CUT/RAZOR LEAF on weak wild mons). Consider a battle
   option "RUN to save PP" fact, or offer switching to Geodude (ROCK THROW) when the lead's attack PP is 0.
1. Jev decision for the switch prompt (instead of always NO): options keep / switch to <member> with facts (type matchup, level, HP),
   so Onix/Geodude get EXP (put off 5 sessions). The party-menu mechanics above are the base for it.
2. (DONE in tests 20260927-021224: Rock Tunnel south exit -> LAVENDER_TOWN.)

## Session 20260927-023224
- LIVE WAS FROZEN AGAIN at B1F (11,14): party menu with "already out!" and Venusaur alive. B would not close the menu, and the "forced"
  branch re-picked member 0 (Venusaur) forever. FIX: when the lead is alive in that menu, pick a bench member (Jev's askSwitch, or the
  first healthy member i>0).
- NEW Jev decision askSwitch() (bot.js near partyDbg): at "Will RED change POKeMON?" the options are keep, or switchN for each healthy bench
  member, with facts (types, HP, damaging moves with effectiveness vs the enemy, level gap). YES -> wantSwitch -> the party-menu
  navigation selects that member. Cached per enemy+party HP. Fallback keep.
- Test from live: freeze broken, 11 Jev calls, 0 errors; Jev said keep (0.85) but the menu forced a bench member (Onix used TACKLE).
  The normal YES/switch path has not been seen in a test yet.
## Next
00. Check the live bot gets out of B1F (11,14). Then do the Lavender/Pokemon Tower facts (listed above) and Route 8 -> Celadon.

## Session 20260927-023724
- Live code from 023224 works: test from live B1F (12k frames) -> ROCK_TUNNEL_1F, story 82->83, Venusaur Lv39, 15 Jev calls, 0 errors.
- DONE the long-deferred Lavender facts (BADGE3_FACTS): POKEMON_TOWER_1F from Lavender = "LATER, needs Silph Scope"; ROUTE_8 = way forward
  to Celadon; ROUTE_10 back = BACKWARDS; ROUTE_12 = Snorlax-blocked; tower floors -> go back down; Route 8 gate/Underground/Route 7 -> Celadon.
  Map ids for Route 8 gate / underground path are guesses (ROUTE_8_GATE, UNDERGROUND_PATH_ROUTE_8) - verify against grid().exits names.
- Only smoke-tested (6k frames, 9 Jev calls, 0 errors); the Lavender facts have NOT been seen in action yet.
## Next
00. Confirm the live bot reaches Lavender and goes west on Route 8 (not into the tower). Fix map ids in the facts if the warp names differ.
1. Celadon: Erika (Grass gym - Venusaur is weak-ish; consider catching a Fire/Flying type), Game Corner -> Silph Scope.

## Session 20260927-024224 (short)
- Fixed Route 8 facts: ROUTE_8_GATE is the SAFFRON gate (guard blocks it) - NOT forward. Added Underground Path facts:
  ROUTE_8 > UNDERGROUND_PATH_ROUTE_8 > UNDERGROUND_PATH_WEST_EAST > UNDERGROUND_PATH_ROUTE_7 > ROUTE_7 > CELADON_CITY (map ids verified in app/src).
- Test from live ROCK_TUNNEL_1F (12k frames): reached ROUTE_10 south, story 85->86, 14 Jev lines, no crash. Lavender/Route 8 not reached in test.
- Seen in an earlier partial test: Jev picks POISONPOWDER (conf 1) repeatedly - check the "FAILS if already statused" fact is applied.
## Next
00. Confirm live goes Lavender -> Route 8 -> Underground Path -> Celadon. Heal at Lavender first.
1. Celadon: Erika gym, Game Corner -> Silph Scope. Level Onix/Geodude via askSwitch.

## Session 20260927-024724 (short)
- LIVE LOOP FIXED: live run 034318 bounced LAVENDER_TOWN <-> LAVENDER_POKECENTER. Jev picked 'heal' in town (cached), the bot walked in,
  then the center's goal question said 'progress' (heal not offered there), so it never talked to the nurse and walked out again.
  FIX: pendingHeal flag in the main loop: set when goal()=='heal', and on entering a *_POKECENTER healAtCenter() runs before asking Jev again.
- Test from live (8k frames): 'pendingHeal: healing in LAVENDER_POKECENTER' -> healed -> Jev progress 0.97 -> edge:west (0.99) from Lavender.
  Run ended in MR_FUJIS_HOUSE (Jev wandered in on the way). Jev's move picks in the live logs spam LEECH SEED / POISONPOWDER (unfixed).
## Next
00. Confirm Route 8 -> Underground Path -> Celadon live; if Jev keeps entering Lavender houses, add "no story progress here yet" facts.
0. Status-move spam (LEECH SEED/POISONPOWDER repeated at conf ~1): check the "already statused/seeded" fact reaches pickMove options.

## Session 20260927-025224 (short)
- Live was in MR_FUJIS_HOUSE (Jev wandered in). Added exit facts for the Lavender houses (MR_FUJIS_HOUSE, LAVENDER_CUBONE_HOUSE,
  NAME_RATERS_HOUSE, LAVENDER_MART): 'NOT NOW' going in, 'THE WAY FORWARD' going out. Map ids verified in app/src.
## Next
00. Confirm Route 8 -> Underground Path -> Celadon live.
0. Status-move spam (LEECH SEED/POISONPOWDER at conf ~1) still unfixed - listed 2 sessions now; do it next if Celadon is reached.
- Test (12k frames, 12 Jev calls, 0 errors): Jev left Mr. Fuji's house (door conf 0.7) and chose edge:west, but walkEdge west
  FAILED 3x from LAVENDER_TOWN (7,9) tgt=0,9 (row 9 is '.....##@##', should be reachable via row 10) -> Jev then went to the Pokecenter
  and talked to NPCs. TOP PRIORITY next: debug why walkEdge('west') fails in LAVENDER_TOWN (NPC blocking? path to x=0 then stepping off the edge?).

## Session 20260927-025724 (short)
- DONE the status-move spam fix (deferred 3 sessions): pickMove tracks status moves (power 0) used on the current enemy (statusUsed,
  keyed species|level|maxHp, reset on a new enemy). The option text then says "ALREADY USED Nx on this enemy ... WASTES the turn - attack instead".
  Live logs had 33 LEECH SEED + 11 POISONPOWDER picks.
- Test from live (ROUTE_12_GATE_2F, 10k frames): 16 Jev lines, no battles, so the new fact has NOT been exercised yet. Bot went back to Lavender,
  Jev chose edge:west 3x (walkEdge west in LAVENDER_TOWN still fails, see the previous session), ended in LAVENDER_POKECENTER.
## Next
00. TOP: fix walkEdge('west') failing in LAVENDER_TOWN from (7,9) (target 0,9). Log the path/grid, and check for an NPC or the map edge step. This blocks Route 8 -> Celadon.
0. Check in a battle log that "ALREADY USED" shows up and that Jev then attacks.

## Session 20260927-030224 (short)
- FIXED walkEdge west in LAVENDER_TOWN (deferred 3 sessions): walkEdge now tries up to 4 edge tiles; if it stands on an edge tile,
  pushes off and the map doesn't change, that tile (+-1) is marked edgeBad (blocked on the neighbour map, e.g. Route 8 trees) and it tries another.
- Test from live LAVENDER_POKECENTER (9k frames): reached ROUTE_8, story 88->89, money up. Jev still picks every exit/goal/move.
- Live run 035815 looped talking to the Cable Club receptionist (person 3) in LAVENDER_POKECENTER - talk loop, no dest-failure detection.
## Next
00. Confirm Route 8 -> Underground Path -> Celadon live.
0. Stop repeat talks to the same NPC once its text repeats (mark talk:N as tried/no-gain; Cable Club lady is useless).
1. Check a battle log for "ALREADY USED" status-move fact.

## Session 20260927-030724 (short)
- Live reached CELADON_CITY (story 90). Added a Celadon stage in stage() (seenCeladon flag): goal = beat Erika (Celadon Gym) for badge 4,
  plus progress-option text and BADGE3_FACTS for Celadon exits/doors (gym = THE WAY FORWARD, Pokecenter = heal, others NOT NOW/BACKWARDS, Game Corner LATER).
- Test (9k frames, 6 Jev calls, no crash): Jev healed at the Pokecenter, then picked door:CELADON_GYM twice, but the gym shows
  "NO walking path from here" (the CUT tree south-west of the gym blocks it), so the bot stayed in CELADON_CITY.
## Next
00. TOP: make the pathfinder/cut mechanics reach CELADON_GYM: treat the cuttable tree as passable (cut it) in CELADON_CITY
    like the Vermilion/Route 9 cut code does. Check the grid legend for the tree tile near the gym (around x~10-12, y~27-30).
0. Stop repeated talks to useless NPCs (Cable Club lady). 1. Check a battle log for the "ALREADY USED" fact.

## Session 20260927-031224 (very short)
- Live is INSIDE CELADON_GYM beating trainers (Venusaur Lv40 uses CUT, fine). The goal text still said "we are in CELADON CITY";
  now in CELADON_GYM it says we're inside the gym, beat trainers/reach Erika, don't leave unless healing. Train text updated for 3 badges.
- Test (8k frames, 6 Jev calls, 0 errors) from live: stayed in CELADON_GYM, no badge yet.
## Next
00. Check live reaches/talks to Erika in CELADON_GYM (gym has CUT trees inside; Erika at top). If the bot wanders, add gym NPC facts (Erika = person to talk to).
0. CUT PP is being spent on everything (Razor Leaf x0.25 vs grass); if CUT PP runs out vs Erika, heal at the Pokecenter.
1. Stop repeated talks to useless NPCs (Cable Club lady).
- Observed: in CELADON_GYM Jev picks among talk:0..5 at low confidence (0.18-0.42). NEXT: label gym people (which is Erika, which trainers are
  already beaten) so the talk choice is informed.

## Session 20260927-031724 (very short)
- CELADON_GYM: Erika (object index 1, at (4,3)) was NOT offered to Jev: npcs were sliced to 6 and leader label used y<=2.
  Now gyms list up to 10 people and the leader label = n.index===1 || y<=2.
- Test (8k frames, 7 Jev calls): Jev picked talk:0 (Erika, labelled GYM LEADER) 3x, but the bot did not reach her (no badge);
  then fell back to trainers talk:6/4/1. Likely CUT trees inside the gym block the walk path.
## Next
00. TOP: make walking to Erika (4,3) in CELADON_GYM work: check the grid for cut-tree tiles in the gym and cut through (reuse city cut code).
0. Mark already-beaten gym trainers (repeat "I hope ERIKA wipes you out" text = beaten) so Jev stops re-picking them.

## Session 20260927-032224 (very short)
- talk actions: if talkTo() fails (no path), call cutTreeToward(npc) and retry (bot.js, a.kind==='talk'). Works: test cut tree (2,4) in
  CELADON_GYM and reached/beat a BEAUTY trainer (story 94->95, money +1820). 7 Jev calls, no crash.
- NOTE: person 0 (labelled GYM LEADER via n.index===1) turned out to be a BEAUTY, not Erika -> the leader label is WRONG. After the fight,
  bot re-talked person 0 3x (repeat "got 1820 for winning" text).
## Next
00. TOP: fix Erika label in CELADON_GYM: check g.npcs vs rom object list (Erika sprite/trainerClass 'ERIKA' or objs[0]); label by o.trainerClass.
0. Mark beaten trainers (repeat post-battle text / talked>=1 with no battle) so Jev stops re-picking them.

## Session 20260927-032724 (short)
- Gym leader label now uses rom object trainerClass (BROCK|MISTY|SURGE|ERIKA|KOGA|SABRINA|BLAINE|GIOVANNI) via objs[n.index-1];
  falls back to old index/y rule only without rom data. Non-trainer objects labelled advice-only; gym trainers with talked>=1
  labelled "ALREADY talked: most likely beaten".
- Test 9000 frames: Jev picked Erika, bot beat her -> BADGE 4 (story 96->99, money 20094->22965). No crash.
## Next
00. TOP: after 4 badges add stage/goal text for next step (Rocket Game Corner hideout in Celadon -> Silph Scope -> Pokemon Tower in
    Lavender; or Saffron is blocked until drink for guard). Update opts.progress in goal() (bot.js ~line 425) for badges>=4.
0. Party is weak besides VENUSAUR Lv42 (Onix 13, Geodude 17): consider Jev "catch/train" options.

## Session 20260927-033224 (very short)
- Added badges>=4 stage: stage() goal (Game Corner -> Rocket hideout -> Silph Scope -> Pokemon Tower), goal() progress/train text,
  and BADGE4_FACTS exit labels (gym = BACKWARDS, GAME_CORNER = forward, ROUTE_7 = not yet). mapFact checks BADGE4 first.
- Test 9000 frames from live: bot left CELADON_GYM and walked into GAME_CORNER (8 jev lines), no crash.
## Next
00. TOP: Game Corner mechanics: the Rocket grunt by the poster (back wall, ~(9,4)); after beating him, face the poster and press A
    to open the hidden stairs (ROCKET_HIDEOUT_B1F). Check g.npcs labels in GAME_CORNER (Rocket vs gamblers = advice-only).
0. Rocket hideout has spinner-arrow floors (B2F/B3F) and needs the LIFT KEY (B4F grunt) for the elevator; plan mechanics.
1. Party is weak besides VENUSAUR Lv42: Jev catch/train options.

## Session 20260927-033724 (very short)
- GAME_CORNER (badges>=4): new Jev dest option 'switch:poster' (kind 'poster'): walkTo(9,5), face UP, A, clear text; posterTries counted in the text.
- Test 9000 frames: Jev picked switch:poster 3x (conf ~0.8) but walkTo(9,5) FAILED every time (pressed=false) -> hidden after 3 fails, then
  Jev picked door:ROCKET_HIDEOUT_B1F which fails (stairs not open). No crash, story still 99.
## Next
00. TOP: the Rocket grunt probably STANDS on (9,5) in front of the poster: talk to/beat him first (check g.npcs in GAME_CORNER, label the
    ROCKET by rom trainerClass so Jev picks him), then press the poster. Log grid rows around (9,4) to confirm the poster coords.
0. Hide door:ROCKET_HIDEOUT_B1F until the stairs are open (goWarp fails anyway).

## Session 20260927-034224 (very short)
- Cause of Game Corner stall: talk options were limited to npcs.slice(0,6), so the ROCKET grunt (9,5) was never offered.
  Now trainers are sorted first and GAME_CORNER offers up to 12 people; the Rocket (rom trainerClass ROCKET) is labelled
  "THE WAY FORWARD: grunt guarding the poster".
- Test 9000 frames: Jev picked the Rocket, bot beat him, pressed the poster, went down -> ROCKET_HIDEOUT_B1F (story 99->100, money +600). No crash.
## Next
00. TOP: Rocket hideout mechanics: B1F->B2F->B3F->B4F; spinner arrow tiles on B2F/B3F (pathfinder must model them or avoid them),
    LIFT KEY from a B4F grunt, elevator; Giovanni on B4F -> SILPH SCOPE. Add BADGE4_FACTS labels for hideout warps.
0. Hide door:ROCKET_HIDEOUT_B1F in GAME_CORNER until the stairs are open.
1. Party is weak besides VENUSAUR Lv42: Jev catch/train options.

## Session 20260927-034725 (very short)
- Added BADGE4_FACTS labels for Rocket hideout warps (B1F->B2F->B3F->B4F = forward, up = backwards, elevator = needs LIFT KEY). Jev now picks door:ROCKET_HIDEOUT_B4F at conf 0.94 (was 0.16).
- Live bot stuck on B3F around (18,15): goWarp to B4F stairs (19,18) fails (spinner arrow tiles). Added hideoutShuffle(): on a failed
  warp on B2F/B3F, press a few directions so spinners move us, reset fail count if position changed (every 12th shuffle not reset).
  Test: position changes (18,16->19,15->16,15) but the stairs weren't reached in 12000 frames.
## Next
00. TOP: real spinner model for B2F/B3F: read the arrow tile ids / spinner destinations (pokered data/tilesets/spinner_tiles) and
    make the pathfinder treat each arrow tile as a jump to where it stops; or BFS over (walk + spin) moves using observed results.
0. LIFT KEY (B4F grunt), elevator, Giovanni -> Silph Scope; then Pokemon Tower. 1. Weak party besides Venusaur: Jev catch/train options.

## Session 20260927-035224 (very short)
- hideoutShuffle now a learned spinner explorer: records every single press on B2F/B3F as (map:x,y:dir)->result in spinSeen,
  tries untried presses nearest the target warp first, then known presses landing nearest the target (visit-count penalty).
  Target = the warp Jev picked (a.at, else grid warp matching a.to; B3F->B4F stairs at 19,18).
- Test 10000 frames: explorer ran (18,15->20,15, 12 transitions learned) but B4F not reached; only 2 shuffles happen per run
  because the dest is hidden after fails. Jev 2-3 calls, no crash.
## Next
00. TOP: let the explorer run many more rounds while on B2F/B3F (don't hide the forward stairs; loop hideoutShuffle until map changes
    or ~30 rounds), and log grid rows near the player to learn the arrow tile chars; spinSeen persists within a run only.

## Session 20260927-035725 (very short)
- On a failed warp on B2F/B3F the bot now runs up to 8 spin-explore rounds per Jev pick (10 presses each, was 1 round x 6),
  retrying goWarp every 2nd round. Test 12000 frames: stopped by the test's 1000-action limit after 5 rounds (18,16 -> 17,14,
  38 transitions learned), B4F not reached, Jev 2 calls 0 errors, no crash.
## Next
00. TOP: still the spinner floor. Log grid rows near the player on B3F to learn the arrow tile chars and treat them as non-walkable
    in pathDir (or as jumps); stairs to B4F at (19,18). Test with more actions (check pokered-test --help for an actions limit).

## Session 20260927-040225 (very short)
- Added spinPlan(): BFS over learned spinner presses (spinSeen) to walk a known path to the best untried press near the
  target, instead of a 1-press lookahead. Test (default limits): Jev 2 calls (progress 0.87, door:B4F 0.96), no crash.
- KEY FINDING: learned transitions stop at 24 = 6 tiles x 4 dirs around (18..20,14..16): single presses from where we are form a
  CLOSED LOOP; no press sequence from there reaches (19,18). The bot is trapped in a spinner cycle, so exploring more won't help.
## Next
00. TOP: escape the B3F loop: dump grid().rows around (14..24,10..20) to see the arrow layout; try holding a direction longer
    (walking multiple tiles), or go back up to B2F (hide B4F dest temporarily) and re-enter B3F from its stairs, then plan the
    real route to (19,18) from the pokered B3F map (arrows are in data/tilesets/spinner_tiles / map scripts).

## Session 20260927-040725 (DEEP) — B3F spinner stall ROOT CAUSE found and fixed
- ROOT CAUSE (confirmed): arrow/spinner tiles look like plain '.' in grid().rows and grid() exposes NO spinner data, so pathDir
  planned B3F (18,15)->(19,18) straight down over (18,16), an arrow tile that slides you back to (18,15). Live run 045801: bot
  pressed DOWN at (18,15) -> (18,16) -> (18,15) forever. The "closed loop" of earlier sessions was this, not a real trap.
  The harness DOES decode the arrow tables from ROM (app/src/game/rom.ts loadSpinners -> rom.spinners) but only uses them
  internally; the bot's rom object has no spinners. I dumped them (scratch script with Rom class) into SPIN_RAW in bot.js
  (B2F, B3F, VIRIDIAN_GYM): "x,y of arrow tile > where the slide stops".
- FIX: pathDir treats stepping onto an arrow tile as a jump to its stop tile (SPINNERS[g.map]); walkTo waits until the position
  settles after each step on spinner maps. Real B3F route from (18,15) goes left/up to (16,11), around the top, down the left
  side, arrow (11,18)->(15,22), along the bottom and up x=18..19 to the stairs: ~55 steps.
- LIFT KEY: grunt (11,2) on B4F drops it as item ball obj 9 at (10,2). Talk options were cut at 6 people (hideout has 7+) and
  item names showed "item 74" (rom.items values are STRINGS, not {name}). Fixed: 12 people in ROCKET_HIDEOUT, item names,
  LIFT KEY / SILPH SCOPE labelled THE WAY FORWARD. LIFTKEY_FACTS (when bag has LIFT KEY): B4F stairs side is walled off from
  Giovanni -> back up B3F -> B2F -> ELEVATOR (B2F (24,19)).
- ELEVATOR mechanic elevatorStep(): Jev picks floor (B1F/B2F/B4F, fallback B4F); code walks to (1,2) (NOT (2,1): that's the door
  warp), waits to settle, faces UP to the panel at (1,1), A, polls until the list "B1F B2F B4F CANCEL" is drawn (no extra A!),
  waits 30 frames (DOWN presses right after the text are ignored), moves screen().cursor to the row with the floor, A,
  then walkTo(2,2) + UP onto the door warp. Confirmed in test 041335: elevator -> ROCKET_HIDEOUT_B4F Giovanni side, battle.
- Tests: from live: B3F -> B4F (story 102->104), LIFT KEY found. From there: B4F->B3F->B2F->elevator. Elevator -> B4F (Giovanni side).
- ALSO this session (all tested):
  * Hideout HEAL route (heal branch in play()): B2F-B4F -> elevator if LIFT KEY + reachable, else stairs up; B1F -> GAME_CORNER;
    GAME_CORNER -> previous (Celadon); CELADON_CITY -> CELADON_POKECENTER. healWhere texts added so Jev gets a heal option there.
    Test 041715 (live state): Jev chose heal on B3F -> walked out to Celadon PC, healed, came back down all floors, LIFT KEY, elevator.
  * Battle party-menu loop FIX: slot 0 (Venusaur) FNT made every party-menu visit "forced", bot re-sent ONIX ("is already out!")
    160x. Now uses battle().player.slot/hp (the ACTIVE battler) to decide forced + skips the member already out.
  * Elevator question includes party HP/PP, headingToHeal, silphScopeInBag; SCOPE_FACTS (bag has SILPH SCOPE): hideout DONE,
    elevator -> B1F -> Game Corner -> Celadon -> ROUTE_7 east toward Lavender.
  * Test 041811 (from 041715 end): BEAT GIOVANNI, "RED found SILPH SCOPE!" (story 105 -> 108). Test 041910: Jev picked B1F
    (0.98), elevator -> B1F, heading to GAME_CORNER.
  * pokered-test sometimes exits with "Segmentation fault" AFTER summary.json is written (reason "limit", 0 errors): harness
    teardown, not the bot.
## Next
00. TOP: after the Silph Scope: Celadon -> Route 7 -> Underground Path -> Route 8 -> LAVENDER_TOWN -> POKEMON_TOWER (floors,
    ghost Marowak with Scope, Mr. Fuji -> POKE FLUTE). Update stage()/goal() progress text for checkScope() (still says
    "go down to B4F, beat Giovanni"), and BADGE4-style facts for the Lavender route + Pokemon Tower floors.
0. Party is weak besides VENUSAUR (Onix 13, Geodude 17): Jev catch/train options. Venusaur ran out of attack PP in the hideout.
1. Spinner facts now come from SPIN_RAW (ROM dump). VIRIDIAN_GYM table is included for the 8th badge; check it there.

## Session 20260927-042225 (short) — post-Scope goal text + Lavender route facts
- stage(): new branch when badges>=4 && checkScope(): goal = leave hideout -> Celadon -> ROUTE_7 -> UNDERGROUND_PATH_ROUTE_7 ->
  UNDERGROUND_PATH_WEST_EAST -> UNDERGROUND_PATH_ROUTE_8 -> ROUTE_8 -> LAVENDER -> POKEMON_TOWER to 7F (Mr. Fuji, Poke Flute).
  goal() progress option text also switches on checkScope().
- SCOPE_FACTS extended: Route 7/8 gates (Saffron guards block), underground path chain, LAVENDER_TOWN>POKEMON_TOWER_1F now
  THE WAY FORWARD (overrides BADGE3 "LATER, NOT NOW" because SCOPE_FACTS is checked first), tower floors 1F..7F "up".
- Test 042300 (live state, 8000 frames): B3F -> B4F via spinner pathing, Jev answered, no crash. Post-Scope text NOT exercised yet
  (needs the Scope in the bag); the live bot should get there on its own per the 040725 chained tests.
## Next (unchanged priorities)
00. Verify the Lavender route live; check underground-path map names match (UNDERGROUND_PATH_ROUTE_7 vs _COPY) and Pokemon Tower
    6F ghost Marowak / 7F rescue work. 0. Party weak besides VENUSAUR: Jev catch/train options.

## Session 20260927-042725 (very short) — verification only, no code change
- Verified map names used by the Lavender route text exist in the ROM data: UNDERGROUND_PATH_ROUTE_7, UNDERGROUND_PATH_WEST_EAST,
  UNDERGROUND_PATH_ROUTE_8, ROUTE_7_GATE, ROUTE_8_GATE, POKEMON_TOWER_1F..7F (ROUTE_7_COPY / ROUTE_6_COPY also exist, unused).
- Test (live state B4F, 15000 frames): 15 Jev calls, 0 errors, story 105 -> 107, reached GIOVANNI battle. Venusaur is using CUT
  (x0.5 vs his ONIX) because RAZOR LEAF PP is exhausted (not offered). Live run 052324 also shows mostly CUT picks.
## Next
00. PP problem: before Giovanni / long dungeons, give Jev a "heal (restore PP)" signal: add party PP of best damaging move to the
    heal-vs-progress question facts and an explicit fact when the best STAB move has 0 PP. Also ETHER/ELIXER use if in bag.
0. Verify post-Scope Lavender route live; Pokemon Tower 6F Marowak / 7F Fuji. 1. Party weak besides VENUSAUR: Jev catch/train.

## Session 20260927-043225 (very short) — lead per-move PP fact for heal decision
- leadPPFact(p) in bot.js: appended to goal()'s heal option: lists the lead's damaging moves with PP/maxPP and STAB, and flags
  when the STRONGEST (power x STAB) move has 0 PP or <=5 PP ("healing restores all PP").
- Test (live B4F, 8000 frames): 19 Jev calls, no crash; ended B2F, money 26715 -> 13357 (halved: probably lost a fight/blackout,
  not investigated). The heal option was NOT offered in any goal question this run, so the new text wasn't exercised yet.
## Next
00. Investigate the money halving in the test above (Giovanni loss?). Check why heal isn't offered in the hideout (hb / hf caps).
0. ETHER/ELIXER use in battle when best move is 0 PP. 1. Lavender route + Pokemon Tower. 2. Jev catch/train options for weak party.

## Session 20260927-043725 (very short) — heal offered when lead's best move is low on PP
- Cause of "heal never offered in hideout": goal() only offered heal when hb<4 (HP not full) and pp cap only when party pp<50%.
  New leadBestLow(p): lead's strongest (power x STAB) damaging move has <=5 PP -> hb capped at 3 so heal is offered; 'L' in cache key.
- Test (live B4F, 10000 frames): story 107 -> 108, money 13357 -> 16228 (Giovanni beaten), ended in ROCKET_HIDEOUT_ELEVATOR,
  5 Jev calls, heal option offered once (Jev heal p=0.46). No crash.
## Next
00. Lavender route + Pokemon Tower live check (post-Scope). 0. ETHER/ELIXER use in battle when best move 0 PP. 1. Jev catch/train for weak party.

## Session 20260927-044225 (very short) — Pokemon Tower "back" facts with Scope
- Live run 053802 confirms the post-Scope route works: B1F -> Celadon (healed) -> ROUTE_7 -> UNDERGROUND_PATH_ROUTE_7 -> WEST_EAST.
- Bug fixed: with the Scope, POKEMON_TOWER_1F>LAVENDER_TOWN still used the pre-Scope fact "THE WAY FORWARD: leave the tower".
  SCOPE_FACTS now labels every downward tower exit (1F->Lavender, nF->n-1F) as "BACK (only to heal)".
- Test (live ROUTE_7, 6000 frames): reached UNDERGROUND_PATH_ROUTE_8, 14 Jev log lines, no crash. The tower was not reached in the test.
## Next
00. Watch Pokemon Tower live (6F Marowak, 7F Fuji -> Poke Flute). 0. ETHER/ELIXER in battle. 1. Jev catch/train options for weak party
    (listed 4+ sessions: do it next session unless the tower is stuck).

## Session 20260927-044725 (very short) — verification only, no code change
- Live run 054308: Pokemon Tower reached; rival (BLUE) beaten on 2F, Venusaur Lv45. CATCH already exists in pickMove (-3 path) but
  has NOT been offered in any run since 024819 (0 CATCH mentions in jev.jsonl of runs 050313..054308). Unknown why: check whether
  tower ghosts/wild battles hit the `b.kind==='wild' && balls>0 && psize<6` branch (log balls/psize), and the ball count in bag.
- Test (live 2F, 6000 frames): 2F -> 3F, story 111 -> 112, money +1625, 6 Jev log lines, no crash.
## Next
00. Find why CATCH is never offered (log it); the party is 1 strong mon + 2 weak -> catch Gastly/Cubone in the tower. 0. Tower 6F/7F. 1. ETHER in battle.

## Session 20260927-045225 (very short) — catch diagnostics
- Finding: CATCH is never offered because there have been NO wild battles since the tower started: every battle in runs
  053802/054308 is kind "trainer" (Channelers' GASTLY etc.). The CATCH branch only fires on wild battles, so it's not a bug there.
- Added a one-time-per-species log in pickMove for wild battles: "battle: wild X catch check balls=N psize=N fails=N".
- Test (live 3F, 6000 frames): stuck in CHANNELER battle vs GASTLY Lv22; Jev picked LEECH SEED 6x in a row (conf falling 0.72->0.15)
  despite the "ALREADY USED" note. No crash, jev calls 6, no progress.
## Next
00. Leech Seed spam vs Gastly: when a status move was already used on this enemy, drop it from the options (or strongly
    discourage); check Venusaur's damaging options vs Ghost/Poison (Normal moves do x0 vs Ghost). Low Jev confidence = try 2nd pick.
0. Wild catch in the tower (Gastly/Cubone) once wild battles occur: read the new catch-check log. 1. Tower 6F/7F. 2. ETHER.

## Session 20260927-045725 (very short) — stop status-move spam
- pickMove: a status move already used on this enemy (statusUsed.n) is now DROPPED from Jev's options when any damaging move
  with effectiveness >0 still has PP (logs "battle: dropping X"). Fallback `best` now picks only among offered moves.
- Test (live 3F, 8000 frames): 3F -> 4F, 7 Jev calls, no crash. A wild GASTLY appeared (balls=24 psize=3): CATCH was offered,
  Jev chose RUN 3x. The drop path was not triggered in this test.
## Next
00. Tower 5F-7F (Marowak ghost 6F needs Scope; Fuji 7F -> Poke Flute). 0. CATCH vs Gastly: Jev prefers RUN; consider noting
    party weakness more strongly (Venusaur is the only real fighter). 1. ETHER in battle.

## Session 20260927-050225 (very short) — CATCH made attractive to Jev
- pickMove: CATCH option now adds a "PARTY WEAKNESS" fact (members >15 levels below the lead listed as too weak; says when the wild
  mon would immediately be stronger than them). The wild-battle question mentions CATCH as an action when it's offered.
- Test (live 6F, 8000 frames): Jev picked CATCH (conf 0.36) vs wild GASTLY Lv22 and it was CAUGHT: party 4, dex owned 5 -> 6. No crash.
## Next
00. Tower 6F Marowak ghost -> 7F Fuji -> Poke Flute. 0. Jev switching / training the new GASTLY (party order, EXP share by switching).
1. ETHER in battle.

## Session 20260927-050726 (very short) — test only, no code change
- Test (live 6F, 6000 frames): 6 Jev calls, no crash, no progress. Channeler GASTLY Lv24 fight: VENUSAUR and ONIX FAINTED, then
  GEODUDE picked ROCK THROW 3x (conf 0.97) while enemy HP stayed 52/52 (misses? or stale enemy HP). Party is being wiped on 6F.
## Next
00. Tower 6F wipes: check run.jsonl "game" lines for what hit/missed; before 6F let Jev decide to heal (Lavender PC) with
    Venusaur's HP/PP as facts; give Jev "enemy HP unchanged after N uses of X" as a fact. 0. ETHER in battle (item menu -> party -> move list;
    reuse the CATCH item-menu code). 1. Train GASTLY/ONIX.

## Session 20260927-051226 (very short) — ETHER/ELIXER in battle (finally done)
- pickMove: if the bag has ETHER/ELIXER (any name matching) and the lead's strongest damaging move has <=3 PP, Jev gets a
  USE_ETHER option (facts: item, move, PP). idx -4 -> main menu, ITEM, scroll to the item, A, A (lead = party slot 0),
  for ETHER DOWN x moveIdx + A. Logs "battle: Jev chose <item> for <move> -> PP now [...]". etherFails stops retries.
- UNTESTED path: the test (live 6F, 6000 frames) never hit low PP; the bag may have no ethers at all. 4 Jev calls, no crash,
  another wild GASTLY Lv23 was CAUGHT (party 5). Assumption to verify: the lead is party slot 0 when using the item.
## Next
00. Tower 6F Marowak / 7F Fuji (still stuck on 6F). Check whether party wipes come from Channeler Gastly (Night Shade/confuse).
0. Watch for the "Jev chose ETHER" log; buy Ethers? (not sold in marts). 1. Train the GASTLYs (switch in for EXP).

## Session 20260927-051726 (very short) — ghost MAROWAK blocker fixed
- Evidence: live run 061316 looped on 6F: Jev picked RUN vs wild MAROWAK Lv30 every ~18s, the ghost retriggers forever.
- pickMove: on POKEMON_TOWER_6F vs MAROWAK, RUN and CATCH are removed (if any other option exists) and ctx.storyBlocker tells Jev
  it must be knocked out. Logs "battle: ghost MAROWAK - RUN/CATCH removed, must fight".
- Test (live 6F, 5000 frames): Marowak beaten, reached POKEMON_TOWER_7F, storyEvents 116 -> 117. No crash.
## Next
00. 7F Rockets -> Mr. Fuji -> Poke Flute (Fuji's house in Lavender). Then Snorlax (Route 12/16) -> Fuchsia / Koga badge.
0. Party full (6): 3 GASTLYs are weak; consider Jev deciding to train them (switch in). 1. ETHER path still unverified.
2. General lesson: story "wild" battles (ghost Marowak, Snorlax later) must not be fled - consider a generic "retriggered same wild battle 3x on same map" fact.

## Session 20260927-052226 (very short) — heal option inside Pokemon Tower
- Evidence: live run 061817 on 7F: goal question offered only progress/train (no heal entry for POKEMON_TOWER_*) while VENUSAUR
  was 13/142 PARALYZED; walked into a Rocket (4 mons) and the party got wiped by ZUBAT.
- goal(): healWhere now covers POKEMON_TOWER_1F-7F ("stairs down, Lavender PC"), heal-fail counting includes the tower, and the heal
  option text states the lead's HP/status (party average hid it: 5 fresh weak mons). Heal route in main loop: tower nF -> (n-1)F -> 1F -> LAVENDER_TOWN.
- Test (live 7F, 5000 frames): started mid trainer battle, Jev 6 calls (TACKLE), no crash; the heal path was NOT exercised yet.
## Next
00. Verify the tower heal route (look for goal 'heal' on POKEMON_TOWER_*). Then 7F Rockets -> Mr. Fuji -> Poke Flute.
0. Buy SUPER POTIONs / PARLYZ HEAL at Lavender Mart (money 5152) and let Jev use them in battle (reuse CATCH/ETHER item code).
1. Train the GASTLYs. 2. ETHER path still unverified.

## Session 20260927-052726 (very short) — POKE FLUTE stage prepared
- stage(): when POKE FLUTE is in the bag (checkFlute()), goal text moves on: heal at Lavender -> ROUTE_12 Snorlax (talk to it, play flute,
  fight/catch) -> Routes 12-15 -> FUCHSIA, Koga. FLUTE_FACTS (take precedence in mapFact) mark tower/Fuji house as DONE, Route 12 as forward.
- Test (live 7F, 12000 frames): 9 Jev calls, no crash, storyEvents 119 -> 120, bot went back down to 6F (wild HAUNTER, Jev RUN).
  Flute not obtained in the test, so the flute stage is UNVERIFIED. Check what storyEvent 120 was and whether Fuji was reached.
## Next
00. Reach Mr. Fuji on 7F (is he rescued at storyEvents 120? why did the bot go down to 6F?). Verify checkFlute() matches the bag name.
0. Snorlax: talking to it must use the flute (game prompts automatically in Red); ensure RUN is removed like ghost MAROWAK.
1. Buy SUPER POTIONs / PARLYZ HEAL at Lavender Mart. 2. Train GASTLYs.

## Session 20260927-053726 (very short) — Mr. Fuji rescued -> go to his house (redo of unapplied 053226)
- Evidence: live run 062822 bounced 6F<->7F and ran from ghosts; storyEvents 122, EVENT_RESCUED_MR_FUJI is set but no flute.
- checkFuji() = event('EVENT_RESCUED_MR_FUJI'); goal() (before the scope stage) says: tower DONE, go down, MR_FUJIS_HOUSE, talk to Fuji.
  FUJI_FACTS (used when Fuji rescued and no flute) mark tower stairs down as THE WAY FORWARD, up as DONE/backwards, Fuji house as forward.
- Test (live 6F, 6000 frames): 7 Jev calls, the goal showed "Mr. Fuji RESCUED", Jev picked the stairs down, reached 5F. No crash.
## Next
00. Verify the bot enters MR_FUJIS_HOUSE and talks to Fuji (flute), then checkFlute() stage -> Route 12 Snorlax (remove RUN like Marowak).
0. Earlier note: a "This isn't the time to use that!" item loop was seen in 3F tests; watch for it.

## Session 20260927-054226 (very short) — trainer-battle RUN freeze fixed
- Evidence: live run 063813 froze on POKEMON_TOWER_5F: pickMove's cache key had no battle kind, so a RUN pick cached from a wild GASTLY
  was replayed vs a trainer GASTLY; the main-menu cursor stayed on RUN and every A re-tried RUN ("No! There's no running from a trainer battle!").
- Fix: cache key now starts with b.kind; RUN (idx -2) in a non-wild battle is ignored (cache cleared); the fallback A in the battle
  main menu first moves the cursor back to FIGHT (UP/LEFT).
- Test (live 5F state, 6000 frames): 0 "no running" messages, Jev picked LEECH SEED each turn (low conf 0.2-0.26), no crash.
## Next
00. Still: verify the bot enters MR_FUJIS_HOUSE and talks to Fuji (flute) -> Route 12 Snorlax (remove RUN like Marowak).
0. Jev's move confidence was low vs a trainer ghost: add type facts (Normal moves can't hit Ghosts; Venusaur's CUT useless vs GASTLY).

## Session 20260927-054726 (very short) — SNORLAX: RUN removed
- pickMove: wild SNORLAX -> RUN dropped (CATCH kept, Jev decides fight vs catch), storyBlocker text explains it blocks the road. UNTESTED in battle.
- Test (live 2F, 10000 frames): 10 Jev calls, no crash, bot walked tower 2F -> 1F -> Lavender -> MR_FUJIS_HOUSE (Fuji route WORKS).
  Inside: Jev talked to person 0 ("praying alone for CUBONE's mother" = not Fuji) and person 5 ("Gone! It's been clipped out!" = magazine/sign).
  No flute yet, storyEvents 123. Fuji is likely another person index (check gstate() people in MR_FUJIS_HOUSE; in Red Fuji stands near the table).
## Next
00. In MR_FUJIS_HOUSE give Jev talk options with the NPC's last-said text as a fact (tried + what they said), so it moves on to untried people -> Fuji -> flute.
0. Then verify checkFlute() and the Route 12 Snorlax battle.

## Session 20260927-055226 (very short) — talk options carry what the NPC said
- Evidence: live run 064909 looped in MR_FUJIS_HOUSE talking to person 1/2 (girl "so nice to hug", PSYDUCK "Gwappa!").
- saidBy[tk] records the last dialog line after each talk; talk options show `last time it SAID: "..."`; in MR_FUJIS_HOUSE without flute,
  non-Fuji lines get "(NOT Mr. Fuji: try someone else)" and untalked people "(NOT talked to yet: could be Mr. Fuji)".
- Test (live state, 6000 frames): 4 Jev calls, no crash; Jev moved from person 0/2 to talk:1 (untried). Flute NOT yet obtained.
- CAVEAT: the recorded text can be STALE (lastTexts last element may come from the previous dialog, e.g. person 0 logged "Gwappa!").
  Fix: clear/mark lastTexts length before talkTo and only record text added during this talk.
## Next
00. Fix stale saidBy capture (above), then confirm Mr. Fuji (likely person 4 at (3,1), top table) gives POKE FLUTE -> checkFlute() -> Route 12 Snorlax.

## Session 20260927-055726 (very short) — POKE FLUTE obtained live; useFlute() mechanic
- Live run 065308: Mr. Fuji gave the POKE FLUTE (stale-saidBy fix no longer urgent).
- Gen 1: talking to SNORLAX only says it sleeps; the flute must be USED from the bag. Added useFlute() (START -> ITEM via wCurrentMenuItem,
  scroll to flute bag index, A, USE) triggered after a talk on ROUTE_12/16 when recent text matches /sleep|blocks the way/. UNTESTED at Snorlax.
- Test (live Lavender, 5000 frames): ~5 Jev calls, no crash, but Jev walked back into MR_FUJIS_HOUSE despite FLUTE_FACTS "DONE" there.
## Next
00. Make Jev head to ROUTE_12 (check why it picks MR_FUJIS_HOUSE; maybe option facts missing or confidence low), then verify useFlute at Snorlax.

## Session 20260927-060226 (very short) — flute detection fixed
- Evidence: live run 065823 had the flute (Fuji says "Has my FLUTE helped you?") but checkFlute() was false: regex /POKE ?FLUTE/ missed the bag
  name "POKé FLUTE" (é). So goal/facts kept saying "go to Fuji's house" and Jev looped there.
- Fix: checkFlute/useFlute match /FLUTE/i; checkFlute also turns true on the "Has my FLUTE helped" text.
- Test (live Lavender, 8000 frames): 12 Jev calls, no crash; bot left Lavender south to ROUTE_12 and ROUTE_12_GATE_1F/2F (wandered the gate floors).
  Snorlax not reached yet; useFlute still UNTESTED.
## Next
00. Watch the Route 12 gate: Jev picked ROUTE_12_GATE_2F several times (dead end). Add gate facts (2F = binoculars only, BACKWARDS) and
    make sure Snorlax (on ROUTE_12 just south of Lavender, north of the gate?) gets a talk option -> useFlute -> battle.

## Session 20260927-060726 (very short) — separate options for same-destination exits (gates)
- Evidence: live run 070305 looped ROUTE_12_GATE_1F <-> ROUTE_12 ~10x: destOptions collapsed both gate exits to ROUTE_12 into ONE option
  (the north one we stood on), because per-warp listing (`multi`) was only enabled for MT_MOON|ROCK_TUNNEL.
- Fix: multi now applies on any map when same-destination warps are >1 tile apart (2-tile doors still merged); non-cave options get
  "(exit on the NORTH/SOUTH/WEST/EAST side of this building)". Jev still picks.
- Test (live gate 1F, 6000 frames): 9 Jev calls, no crash; bot left the gate and ended on ROUTE_12 y=31 (south of the gate), Jev picked edge:south.
  Snorlax/useFlute still UNTESTED.
## Next
00. Verify Snorlax on ROUTE_12 (~(10,62)) gets a talk option -> useFlute -> battle (no RUN). Test with --load of the newest live end.state.json.

## Session 20260927-061226 (very short) — outdoor talk option for path blockers (SNORLAX)
- Evidence: live run 070821 on ROUTE_12: door fact said "blocked by the person/object at (10,62): deal with it via its talk option"
  but talk options were only built indoors (no g.exits), so Jev had no Snorlax option and picked edge:north (conf 0.46).
- Fix: on outdoor maps, every npc whose (x,y) appears in a "person/object at (x,y)" door fact gets a talk option (ROUTE_12/16: labelled
  probable sleeping SNORLAX, THE WAY FORWARD). Jev picks.
- Test (live ROUTE_12, 6000 frames): 2 Jev calls, Jev picked talk:0 (conf 0.94), text "A sleeping POKéMON blocks the way!",
  useFlute() logged "used POKE FLUTE (bag idx 15); inBattle=0" but NO battle started; loop talk -> flute -> talk repeated.
## Next
00. Fix useFlute(): check run.jsonl text right after "used POKE FLUTE" in the test run (scratch/test-runs/20260927-061300-504). Likely the
    menu nav picks the wrong item / never reaches USE, or the player isn't facing SNORLAX (it's at (10,62), player stands at (10,61) facing DOWN).
    Look at shots/ and the texts ("RED played the POKé FLUTE" / "SNORLAX woke up") to confirm. Don't call Snorlax done until a battle starts.

## Session 20260927-061726 (very short) — useFlute bag scroll fix (still no battle)
- Test from live (ROUTE_12 at (10,61) facing Snorlax (10,62)): Jev picks talk:0 -> "A sleeping POKéMON blocks the way!" -> useFlute -> NO text
  at all afterwards (no "played the POKé FLUTE"), inBattle=0. So the flute is never actually used.
- Found: bag cursor wCurrentMenuItem is relative to the visible 3-row window, so `curItem() !== idx` (idx 15) never matched; it scrolled to CANCEL.
  Changed to UP x25 then DOWN x idx. Test (5000 frames, 6 Jev calls, no crash): still no flute text -> something else is wrong too.
## Next
00. Debug useFlute with screen text: after each step log screenText() (like buyBalls "shop screen:") to see whether START menu ITEM is
    selected (curItem()==2 may be POKéMON/ITEM depending on Pokedex entry), whether the bag opens, which item is highlighted, and whether
    USE appears. Consider selecting by reading the screen for the "▶" row text containing FLUTE instead of indices.

## Session 20260927-063226 (DEEP) — ROOT CAUSE of the Snorlax block found and FIXED (tested: Snorlax woken and beaten)
Root cause (confirmed in logs + tests), two mechanics bugs, NOT Jev decisions:
1. useFlute() navigated by index/wCurrentMenuItem right after START, before the menu was drawn: screen() right after START showed an
   EMPTY box (cursor=null), so the ITEM pick and bag scroll were blind and ended on CANCEL. The flute was never played (no
   "played the POKé FLUTE" text in any live run 070821/071323).
2. The trigger regex /ROUTE_1[26]/ also matched ROUTE_12_GATE_2F; with stale lastTexts ("A sleeping POKéMON...") useFlute ran in the
   gate and left the bag open on CANCEL over the START menu. The main loop's `s.cursor -> press A` then toggled bag<->start menu
   (A on CANCEL closes bag, A on ITEM reopens it) for the ENTIRE live run 071815 (thousands of A presses, 0 Jev calls). This is also
   why sessions 062226/062726 had 0 Jev answers from the live state.
Fixes (bot.js):
- useFlute() is screen-driven: close text boxes, wait, START, then menuSelect(re, 'DOWN', n) presses DOWN until the text beside the ▶
  cursor (curRowText()) matches ITEM / FLUTE / USE. Logs each step ("flute: ..."). Aborts with B if a step fails.
- trigger regex is /^ROUTE_1[26]$/; talkTo() now records the dialog it sees into lastTexts (fresher text).
- main loop: cursor + no text box + EXIT/CANCEL on screen => press B x4 (open start menu/bag is never a question). Also any screen that
  stays identical after 12 A presses => B x4.
Test (load runs/20260927-071323-794/start.state.json, 14000 frames): Jev talk:0 (Snorlax) -> "RED played the POKé FLUTE." ->
"It attacked in a grumpy rage!" -> wild SNORLAX Lv30 battle, Jev picked LEECH SEED/CUT, SNORLAX fainted (storyEvents 128->129),
then Jev edge:south, bot reached ROUTE_12 (14,73) south of Snorlax. Note: gen-1 flute Snorlax is a wild battle; RUN is removed
for SNORLAX, catching is allowed if balls (Jev picked moves, didn't throw).
Also found in the live-state test: the bag remembers its cursor (live state: CANCEL at the bottom) and the list does not wrap, so the
flute search goes UP first, then DOWN. The open-menu guard had to ignore hasTextBox (START menu/bag count as a text box) and the
alternating bag/start screens defeated the same-screen counter, hence the extra aRun>80 consecutive-A guard.
FULL TEST FROM LIVE STATE (60000 frames): menu closed at once -> Jev door:GATE_1F -> ROUTE_12 -> talk:0 Snorlax -> flute -> SNORLAX beaten
-> 3 trainers beaten -> ROUTE_13 reached (NEW MAP), storyEvents 128->132, Venusaur Lv47, 62 Jev calls, 0 errors.
(pokered-test prints "Segmentation fault/Bus error" at exit; the summary and logs are still written. Ignore it.)
## Next
0. ROUTE_13 end of test: Venusaur spammed GROWTH ("Nothing happened!") vs PIDGEY with conf 0.08-0.39: probably out of PP on damaging
   moves (hitsLeft=false so status moves stay). Offer Jev SWITCH (Gastly/Geodude) / RUN clearly when the lead has no damaging PP,
   and add a fact "GROWTH: Nothing happened last turn (stat maxed)" from the battle text.
00. Continue south: ROUTE_12 -> ROUTE_13 -> ROUTE_14 -> ROUTE_15 -> FUCHSIA_CITY (badge 5, Koga). Watch for trainer battles on the
    Route 12 pier/fishermen and whether walkEdge south reaches ROUTE_13 (earlier logs: "edge tile blocked beyond" for many tiles).

## Session 20260927-064227 — Jev can SWITCH when the lead has no damaging PP
- pickMove(): when no damaging move with PP can hit (hitsLeft=false), adds options SWITCH_<slot> for each healthy bench member
  (lists their damaging moves, effectiveness, PP) plus ctx.leadCannotDamage. Pick -> idx -5: B out of move menu, UP+RIGHT (PKMN), A;
  wantSwitch makes the existing party-menu handler send that member. Added GROWTH to STATUS_NOTES ("Nothing happened!" when maxed).
- Test from live (ROUTE_13, 12000 frames): 14 Jev calls, Jev chose SWITCH_2 -> GEODUDE sent in, Geodude Lv19->20, no crash.
## Next
0. Venusaur is out of damaging PP: offer/push a heal trip (Lavender/Celadon center is behind; Fuchsia ahead) — check goal() heal option
   uses leadPPFact. Consider disabling a status move after "Nothing happened!" text.
00. Continue south ROUTE_13 -> 14 -> 15 -> FUCHSIA_CITY (badge 5, Koga).

## Session 20260927-064727 — fixed-damage moves described correctly to Jev
- Live run 074322: NIGHT SHADE (power 0 in ROM) was offered as "status move (no damage)", so Gastly Lv19 used LICK (~5 dmg) vs a
  Lv30 Poliwag for many turns. pickMove() now describes NIGHT SHADE/SEISMIC TOSS (= user level), SONIC BOOM 20, DRAGON RAGE 40 as
  DAMAGING with exact damage and hits-to-KO; they are never counted/dropped as "status already used".
- Test from live (ROUTE_13, 12000 frames): 11 Jev calls, Jev now picks NIGHT SHADE mostly; storyEvents 133->134, money +600, no crash.
## Next
0. Venusaur PP heal trip (see previous Next) and hitsLeft/SWITCH logic should also count fixed-damage moves as damaging.
00. Continue south ROUTE_13 -> 14 -> 15 -> FUCHSIA_CITY (badge 5, Koga).

## Session 20260927-065227 — heal option south of Lavender + fixed-damage counts as damaging
- pickMove(): hitsLeft now counts NIGHT SHADE/SEISMIC TOSS/SONIC BOOM/DRAGON RAGE (with PP) as damaging and ignores 0-PP moves,
  so Jev gets the SWITCH options when the lead truly can't hurt the enemy.
- goal(): healWhere now covers ROUTE_12 (north to Lavender), ROUTE_13/14/15 (onward to the Fuchsia Pokemon Center), FUCHSIA_CITY,
  FUCHSIA_POKECENTER; heal-fail regex includes them. Before, Jev had NO heal option on Route 13 (Venusaur out of attack PP).
## Next
0. Verify the heal trip on ROUTE_13 actually walks toward Fuchsia (check run.jsonl for heal picks / healFails).
00. Continue ROUTE_13 -> 14 -> 15 -> FUCHSIA_CITY (badge 5, Koga).
- TEST (live state, 12000 frames): 427 Jev calls, 0 errors, no crash, but ALL were leadCannotDamage move questions (Gastly LICK x0 vs
  a NORMAL enemy) — the bot stayed on ROUTE_13, storyEvents 135. Likely Gastly out of NIGHT SHADE PP and the SWITCH pick isn't
  executed/sticking, so it re-asks every frame. FIX THIS FIRST: check run.jsonl for the switch path; cache/limit re-asks; offer RUN.

## Session 20260927-065727 — SWITCH_0 re-ask loop fixed
- Root cause of live run 074815 (585 Jev calls, stuck): Jev picked SWITCH_0 (Venusaur, slot 0, while a Gastly was active), but
  the executor tested `!(wantSwitch > 0)` so slot 0 counted as "no switch" -> B, cache cleared, re-ask every step. Now checks
  `wantSwitch == null` / `chosen != null` (move-menu SWITCH path + party-menu handler).
- Test from live (ROUTE_13, 12000 frames): 13 Jev calls, switches to members 0/4/5 all executed, no crash. But Jev ping-pongs
  between Venusaur (no damaging PP) and Gastlys (LICK x0 vs NORMAL PIDGEY) in a trainer battle; still ROUTE_13, storyEvents 135.
## Next
0. The party can't damage NORMAL enemies: Venusaur is out of attack PP. Offer USE_ETHER if any, and push the heal trip (goal()
   healWhere ROUTE_13 -> Fuchsia center) — tell Jev in the goal question when the lead has 0 attack PP. Don't offer SWITCH to a
   member with "no damaging move with PP" (or mark it clearly as useless) to stop ping-pong; Geodude/Onix (Tackle etc.) can hit Normal.
00. Continue ROUTE_13 -> 14 -> 15 -> FUCHSIA_CITY (badge 5, Koga).

## Session 20260927-070227 — no useless SWITCH options
- Old live run 075559 (298 calls) was pre-fix code; live 075809 (fixed code) ping-ponged SWITCH_0 <-> SWITCH_5 (Venusaur 0 attack PP,
  Gastlys LICK x0 vs NORMAL PIDGEY). pickMove() now only offers SWITCH_i if member i has a damaging move with PP that isn't x0
  vs the enemy (FIXED_DMG regex counts NIGHT SHADE etc.).
- Test (live state, 12000 frames): Jev answered ~20 questions, no switch ping-pong, no crash, but the battle vs PIDGEY stays
  unwinnable (Jev picks CONFUSE RAY / LICK x0); ONIX/GEODUDE are likely fainted. Still ROUTE_13, storyEvents 135.
## Next
0. When nobody alive can damage the enemy in a TRAINER battle: offer USE items (Ether/Potion/Revive on Geodude/Onix) or accept
   the loss quickly (whiteout -> heals at last center). Also stop battles starting with 0 attack PP: goal() heal trip.
00. Continue ROUTE_13 -> 14 -> 15 -> FUCHSIA_CITY (badge 5, Koga).

## Session 20260927-070727 — STRUGGLE plan switch
- pickMove(): when the lead can't hurt the enemy AND no bench member has a hitting move, Jev is offered SWITCH_i "STRUGGLE PLAN" to a
  non-Ghost member with <=40 total PP left (burns PP then auto-STRUGGLEs, Normal damage) unless the enemy is Normal-immune.
- Test (live, 12000 frames): Venusaur used STRUGGLE repeatedly, PIDGEY trainer beaten: storyEvents 135->136, money +625, no crash.
## Next
0. Heal trip: Venusaur still has 0 attack PP. Push goal() to heal at Fuchsia center (ROUTE_13->14->15->FUCHSIA) before more trainers.
00. FUCHSIA_CITY badge 5 (Koga).

## Session 20260927-071727 — exit facts for Route 13 -> 14 -> 15 -> Fuchsia
- Added FLUTE_FACTS entries (THE WAY FORWARD / BACKWARDS) for ROUTE_12/13/14/15, ROUTE_15_GATE_1F and FUCHSIA_CITY, so Jev's
  "where to walk" question marks the forward exit on each of these routes. (Last session's heal-walk steps were NOT applied: that session never ran a test.)
- Test (live, 12000 frames): 14 Jev calls, no crash, ROUTE_13 -> ROUTE_14, storyEvents 136->137, money +560. Jev was shown the
  Route 14 -> 15 forward option 7 times but hadn't reached Route 15 when the test ended.
## Next
0. Check that ROUTE_14 -> ROUTE_15 actually gets walked (Route 14 goes south, and the exit to 15 is at the south-west end). If it loops, add a heal/travel step.
00. Heal at the FUCHSIA_POKECENTER (Venusaur 0 attack PP), then KOGA for badge 5.

## Session 20260927-072227 — ROUTE_14 frozen walkEdge fixed
- Live run 081809 died "stuck: 20001 calls": Jev picked ROUTE_14 edge:west, walkEdge found no reachable edge tile and returned
  without pressing anything; the cached pick re-ran forever. Now walkEdge returns 'unreachable' -> destFail +3, destCache cleared,
  wait(30); the ticks>4 failure also clears destCache. Options failed 3+x are now hidden even if only 1 option remains (was >=2).
- Test (live, 12000 then 5000 frames): no crash, Jev calls 398/59. With the fix the bot now bounces ROUTE_14 <-> ROUTE_13 (edge:east).
## Next
0. ROUTE_14 -> ROUTE_15: the west edge isn't reachable from (16,6) — the path goes SOUTH down Route 14 first. Add a south edge/
   waypoint option (or walk to the south-west tile) so Jev can pick the real way forward. Then heal at FUCHSIA, KOGA for badge 5.

## Session 20260927-072727 — ROUTE_14 wp:south waypoint option (not yet working)
- dest(): on ROUTE_14 Jev is offered 'wp:south' ("walk SOUTH down Route 14, the west exit to Route 15 is at the south-west end").
  Executes: lowest walkable tile with pathDir() -> walkTo; failure -> destFail +1 (hidden after 3).
- Test (live, 12000 frames): 146 Jev calls, no crash. Jev picked wp:south 3x (conf ~0.4) but it FAILED every time without logging
  "wp south ->" => no tile below the player passed pathDir (unknown why: check grid rows below y=18 / WALK set / pathDir limits).
  Bot still bounces ROUTE_13 <-> ROUTE_14 (~70 times each).
## Next
0. Debug wp:south: log g.height and the rows below the player; maybe walk in stages (walkTo (14,7) gap then further south). Then Route 15 -> FUCHSIA heal, KOGA.

## Session 20260927-073227 — wp:south diagnosis: NPCs block Route 14
- wp:south failed because 'N' (NPC/trainer) tiles sit in Route 14's narrow passages; pathDir treats them as walls. Now if no tile is
  reachable, wp plans with N replaced by '.', presses toward it (up to 40 steps, stops on battle/map change) and logs rows below.
- Test (live, 8000 frames): Jev answered questions, no crash; log "wp south via NPCs: 0,49" => a path now EXISTS through NPCs, but the
  bot still ended on ROUTE_13 (walking through NPC tile gets stuck against the NPC; trainer may already be beaten).
## Next
0. In the NPC fallback, when the next step is into an NPC tile, press A (talk) or step around; or add npc tiles as passable only when
   the NPC is a trainer not yet fought. Then Route 15 -> FUCHSIA heal, KOGA.

## Session 20260927-073727 (DEEP) — ROOT CAUSE of the Route 13/14 loop: edge tile leads into a sealed pocket (CONFIRMED)
- CONFIRMED (probe bot + grid dump): Route 13's west edge at row 6 lands on ROUTE_14 (19,6), a 4-tile corridor (16..19,6) sealed by
  BIRD KEEPER object 2 standing at (15,6) (STAY, facing down, NOT yet beaten: talking gives "My bird POKeMON should be ready for battle").
  Rows 3/5/7/9/11 of Route 14 are real fences. The previous "wp:south via NPCs" diagnosis was wrong: no walk from (19,6) can pass.
- Real route: Route 13 row 4 or row 8 at x=0 -> Route 14 (19,4)/(19,8). Row 8 continues: (15,8) -> row 9 gap x=6,7 -> row 11 gap x=13 -> south.
- FIX (mechanics): reachInfo(g, entrySide) BFS; on arrival through a map edge (lastEdge set in walkEdge) into a pocket (<16 tiles, no
  other edge, door, ledge, water, tree, counter), mark the source edge tiles b-1..b+1 in edgeBad and walk back out; also leaves a pocket
  if the bot STARTS in one at a map edge. walkEdge then uses another edge tile. Jev still picks every destination.
- TEST (live state, 15000 frames, 0 errors): started in pocket -> left east -> Jev edge:west -> pocket detected at row 6 -> back ->
  re-crossed at Route 13 row 8 -> ROUTE_14 (19,8) -> (15,8) (never reached in live runs) -> BIRD KEEPER battle (Venusaur, POISONPOWDER then
  GROWTH spam; Pidgey slowly dying of poison when the test ended).
## Next
0. Battle: Venusaur has 0 attack PP; Jev spams GROWTH ("Nothing happened!"). Hide status moves that already failed/maxed, prefer STRUGGLE plan.
00. Continue wp:south down Route 14 -> west exit near rows 43-49 -> ROUTE_15 -> FUCHSIA heal, KOGA badge 5.

## Session 20260927-074727 (short) — STRUGGLE PLAN switch widened
- Live 084304: Venusaur (0 attack PP) vs Bird Keeper SPEAROW got only GROWTH/POISONPOWDER options (both already "wasted"); no switch
  was offered because the STRUGGLE PLAN excluded GHOSTs and members with >40 total PP. Now: any non-lead member with <=60 total PP
  (ghosts included; Struggle is Normal-type) is offered. Jev still decides.
- Test (live, 4000 frames): ~9 Jev picks, no crash, but the live state starts with Venusaur at 2 HP -> blacked out (money 14803->7401)
  and woke up at Celadon/Underground Path side. STRUGGLE option not exercised in the test.
## Next
0. Before trainer fights: dest/heal question must strongly flag "lead has 0 damaging PP" (leadBestLow) so Jev heals BEFORE walking
   into Route 14 trainers. After heal: Route 13 row 8 -> Route 14 south -> ROUTE_15 -> FUCHSIA, KOGA badge 5.

## Session 20260927-075228 (very short) — 0-PP warning on the progress option
- goal(): if the lead has 0 PP on EVERY damaging move, opts.progress now carries a WARNING (blackout on Route 14 happened like this);
  Jev still picks heal vs progress. Test (live, 5000 frames, ROUTE_12 after blackout): 5 Jev calls, no crash, no progress in the window.
## Next
0. Live is on ROUTE_12 (after blackout, money 8941). Heal (Lavender PC) -> Route 12/13 -> Route 13 row 8 -> Route 14 south -> ROUTE_15
   -> FUCHSIA heal, KOGA badge 5. Verify the STRUGGLE PLAN switch fires in a real 0-PP battle.

## Session 20260927-075728 (very short) — goal text past Snorlax
- Live had got to ROUTE_14 (story 141, beating Bird Keepers), but Jev's goal text still said "wake SNORLAX on Route 12 from Lavender".
  goalFor(): new sticky seenSouth (ROUTE_13/14/15/FUCHSIA seen) + badges==4 + flute -> goal "already SOUTH of Snorlax, don't go north;
  Route 14 south -> west to ROUTE_15 -> FUCHSIA heal -> KOGA".
- Test (live, 6000 frames): 14 Jev calls, 0 errors, new goal shown, bot walked ROUTE_14 -> ROUTE_15.
## Next
0. Route 15 west -> FUCHSIA (heal) -> KOGA badge 5. Add a badge-5 goal text (Fuchsia -> Safari Zone for SURF/Strength, etc.) once Koga is beaten.
1. Venusaur's only damage move is CUT; attack PP remains fragile. Verify the STRUGGLE PLAN switch in a real 0-PP battle.

## Session 20260927-080228 (very short) — Fuchsia facts + badge-5 goal
- FLUTE_FACTS: added FUCHSIA_CITY door facts (GYM = Koga badge 5 w/ type hints, POKECENTER heal, SAFARI_ZONE_GATE, MART, back to ROUTE_15).
- goalFor(): badges>=5 && seenSouth -> Safari Zone (SURF + GOLD TEETH) -> Warden (STRENGTH) -> Saffron/Sabrina goal.
- Test (live, 12000 frames): 13 Jev calls, 0 crash, still on ROUTE_15 in a trainer battle (Geodude vs Grimer), no new story event.
## Next
0. Reach FUCHSIA (Route 15 west), heal, beat KOGA. Check Fuchsia door facts show in Jev dest questions.
1. Once in Safari Zone: needs its own facts (area exits, secret house). Venusaur attack PP still fragile (only CUT).

## Session 20260927-080728 (very short) — progress option text past Snorlax
- Live 090311: the "progress" option in the heal/progress question still said "SILPH SCOPE in bag ... climb Pokemon Tower" while on
  ROUTE_15 (stale). Now opts.progress has seenSouth branches: badges==4+flute -> "west into FUCHSIA, beat KOGA"; badges>=5 -> Surf/Strength/Saffron.
- Live also showed VENUSAUR leading with 0 damaging PP (only CUT) and Jev picking progress despite the WARNING; Gastlys/Haunter carry fights.
- Test (live, 8000 frames): 7 Jev calls (LICK/NIGHT SHADE/keep), 0 errors, stayed in Route 15 trainer battles; new text not yet shown.
## Next
0. Reach FUCHSIA, heal, KOGA. Consider a Jev "lead" choice (reorder party so a member with damaging PP leads) when lead has 0 attack PP.

## Session 20260927-081228 (very short) — battle switch offered the wrong "current" member
- Live 090808: paralysed HAUNTER vs NORMAL DODRIO had only LICK/CONFUSE RAY (can't hit) and no SWITCH option -> fainted. Cause: the
  !hitsLeft switch block used cur = b.player.slot ?? 0, slot is missing so slot 0 (VENUSAUR, CUT hits Dodrio) was always skipped.
  Now cur is found by species/level/hp match. Jev still picks move vs SWITCH_n.
- Test (live, 6000 frames): 5 Jev calls, 0 errors, stayed ROUTE_15; the switch case not exercised.
## Next
0. Reach FUCHSIA, heal, KOGA badge 5. Verify SWITCH_0 appears when a Ghost faces a Normal enemy. Other code using b.player.slot may have the same bug (grep "slot").

## Session 20260927-081728 (very short, no code change) — blackout on Route 15
- Live 091309: blacked out on ROUTE_15 vs a trainer DODUO (Geodude/Gastlys/Haunter fainted; VENUSAUR with 0 CUT PP spammed GROWTH,
  "Nothing happened!"). Respawned CELADON_CITY, money 15371 -> 7685; bot is re-walking Route 7 -> Underground Path -> Lavender -> Route 12..15.
  seenSouth is in-memory only, so after restart the goal falls back to the "Lavender -> Snorlax" text (route is still correct).
- Test (live, 3000 frames): ran with Jev calls, no crash.
## Next
0. TOP PRIORITY (3rd time Venusaur PP noted): stop useless status moves. Track battle text "Nothing happened!" per move and mark that move
   "USELESS (stat maxed)" in the move option; also ask Jev to heal at a PC when the whole team's damaging PP is low BEFORE Route 15 trainers.
1. Buy/Use Ethers or teach Venusaur a damaging TM/HM (RAZOR LEAF is learned by level; check its moveset).

## Session 20260927-082228 (very short) — "Nothing happened!" marks a move USELESS
- battleStep(): when screen text shows "Nothing happened"/"But it failed" after lastPickedMove, uselessMoves[move]++ (cleared in noteBattleEnd).
  pickMove(): such a move's option text becomes "USELESS: ... picking it again WASTES the turn" (still offered; Jev decides, switch options
  appear when no damaging PP). Dedupe via uselessSeen counts each move once per battle (enough to flag it).
- Test (live, 8000 frames): 7 Jev calls (CUT x2, keep, ...), 0 errors, storyEvents 146->147, still ROUTE_15. USELESS path not yet exercised.
## Next
0. Reach FUCHSIA, heal, KOGA badge 5. Check run.jsonl for "marking USELESS" logs to verify detection.
1. Ask Jev to heal at a PC when the whole team's damaging PP is low BEFORE Route 15 trainers (still undone). Venusaur only has CUT for damage.

## Session 20260927-082728 (very short) — Fuchsia/gym goal text
- Live reached FUCHSIA_GYM (beat a Juggler's Hypno) but goal still said "go south down Route 14 ... to Fuchsia" (stale).
  goalFor(): new branch for badges==4 && map ^FUCHSIA: in FUCHSIA_GYM -> "INSIDE the gym: beat trainers, reach KOGA at the back (invisible walls)";
  else -> "in Fuchsia: heal at PC, then gym". opts.progress also has an in-gym branch.
- Test (live, 8000 frames): 6 Jev calls (progress, talk:1 dest picks), 0 errors, storyEvents 149->150, new goal shown; still in gym.
## Next
0. Beat KOGA. Venusaur has only CUT (~11 PP) for damage; the heal-when-team-attack-PP-low question is still undone (listed 3x) — do it next.

## Session 20260927-083228 (very short) — heal from the Fuchsia gym/city
- Found: the low-PP heal question already exists (goal(): hb capped at 3 when team/lead attack PP low -> heal option), but
  FUCHSIA_GYM had NO healWhere entry (Jev was never offered heal inside the gym) and FUCHSIA_CITY had no heal-trip branch.
  Added healWhere.FUCHSIA_GYM and heal branches: FUCHSIA_GYM -> goWarp('previous'); FUCHSIA_CITY -> goWarp('FUCHSIA_POKECENTER') (counts healFails).
- Test (live, 8000 frames): Jev answered (NIGHT SHADE picks vs KOGA's MUK Lv39 with GASTLY Lv20, "keep"), 0 crash; still in the Koga fight,
  heal path not exercised. Koga fight: weak Gastly is in; Jev's switch-to-VENUSAUR option only appears when the lead can't damage.
## Next
0. Beat KOGA. Consider offering Jev a SWITCH option in every trainer battle (not just when the lead can't damage), with level/HP facts,
   so it can bring VENUSAUR Lv50 in vs Koga's Lv37-43 team instead of Gastly Lv20.
1. Verify the Fuchsia heal trip (gym -> city -> PC) in a run.

## Session 20260927-083728 (very short) — switch offer when outleveled in trainer battles
- pickMove(): `outLeveled` = non-wild battle, lead can hit, lead level +8 <= enemy level -> Jev is also offered SWITCH_i to each healthy
  bench member with a HIGHER level that can hit (text: "lead X LvN, OUTLEVELED by this LvM enemy"). STRUGGLE-plan switches and
  leadCannotDamage ctx stay only for the can't-damage case.
- Test (live, 8000 frames): 3 Jev calls, 0 crash; KOGA BEATEN -> badges 5, storyEvents 152->157, now FUCHSIA_CITY. The new switch option
  was not exercised in the test (no OUTLEVELED in jev.jsonl).
## Next
0. Goal text for badge 5 (already has a 'SOUL BADGE done' branch in opts.progress; check goalFor() too): SURF (Safari Zone, secret house),
   Gold Teeth -> Warden for STRENGTH, then Saffron/Silph Co. Check what Jev picks in Fuchsia City after the badge.
1. Verify the OUTLEVELED switch in a real trainer battle log.

## Session 20260927-084228 (very short) — Safari Zone goal
- Live run 093809 reached SAFARI_ZONE_SECRET_HOUSE and Jev talked to the person there (SURF giver); state at session start was SAFARI_ZONE_NORTH.
- Fix: seenSouth regex now includes SAFARI*/WARDENS* (before, a restart inside the Safari Zone lost the badge-5 goal text).
- Added a bag-aware badge-5 goal in goalFor(): SURF only -> get GOLD TEETH in SAFARI_ZONE_WEST; SURF+TEETH -> leave, Warden for STRENGTH;
  SURF+STRENGTH -> Saffron/Silph/Sabrina. Test (live, 8000 frames): 7 Jev calls, 0 crash, ended SAFARI_ZONE_CENTER; bag had no SURF yet
  (old goal text shown), so new branches unexercised.
## Next
0. Check whether SURF was actually obtained (bag names: verify 'HM03' string). If not, Safari step limit may be kicking us out: add
   SAFARI_ZONE_* destination facts (route GATE->CENTER->EAST->NORTH->WEST->SECRET_HOUSE) so Jev walks there directly.
1. Warden's house door fact in FUCHSIA_CITY; use SURF/STRENGTH in the field (needs a field-move mechanic).

## Session 20260927-084728 (very short) — text-loop escape
- Live run 094357 was STUCK in ROUTE_15_GATE_2F: the main loop mashed A for minutes, re-opening Oak's AIDE dialog ("caught only 9... need 50")
  because we still face him after the dialog ends. SURF+STRENGTH ARE in the bag (goal text confirmed).
- Added unstickTalk() (steps away DOWN/LEFT/RIGHT/UP, clears destCache so Jev re-decides with talked/SAID facts) called when
  (a) the same dialog line shows up 5x in one text-box stretch (textSeen), or (b) the old aSpam/aRun B-backout trips.
- Test (live, 8000 frames): 17 Jev calls, 0 crash; left the gate, walked west, ended ROUTE_18_GATE_2F (Jev picked edge:west / gates).
  The unstick log line did not fire in the test (Jev left before looping), so it's unverified; grep 'unstickTalk|text loop' in live runs.
## Next
0. The badge-5 goal says "leave Fuchsia north toward SAFFRON", but the bot wandered west to Route 18 (cycling road needs a BICYCLE).
   Add ROUTE_15/ROUTE_18/FUCHSIA destination facts: go back EAST on Route 15 -> Route 14/13/12 north -> Lavender -> Route 8 -> Saffron
   (Saffron gate guards need a drink: buy FRESH WATER at Celadon dept store roof vending machine).
1. Field-move mechanic for SURF/STRENGTH.

## Session 20260927-085228 (very short) — badge-5 road to Saffron
- Added a badge-5 edge annotation block (before "indoors" in the destination options): NEXT map chain ROUTE_18 -> FUCHSIA_CITY -> ROUTE_15
  -> ROUTE_14 -> ROUTE_13 -> ROUTE_12 -> LAVENDER_TOWN -> ROUTE_8 -> SAFFRON_CITY gets "THE WAY FORWARD toward SAFFRON"; edges to
  ROUTE_16/17 get "AWAY (needs BICYCLE)". ROUTE_18 gate warps flagged as the way east when x<40.
- Test (live, 8000 frames): 14 Jev calls, 0 crash; Jev followed the hints ROUTE_18 -> FUCHSIA -> ROUTE_15, ended in ROUTE_15_GATE_2F
  (the Oak's Aide upstairs trap again — Jev took the gate stairs instead of walking through).
## Next
0. ROUTE_15_GATE_1F/2F: mark the 2F stairs as a dead end (only Oak's Aide) and the east/west door of 1F as the way through.
1. Saffron gate guards need a drink (FRESH WATER, Celadon dept store roof) — Route 8 gate will block; add goal text for it.
2. Field-move mechanic for SURF/STRENGTH.

## Session 20260927-085728 (very short) — Saffron drink goal
- goalFor() badge 5: with SURF+STRENGTH and NO drink (FRESH WATER/SODA POP/LEMONADE in bag), goal now says: Route 15..12 -> Lavender -> Route 8
  -> Underground Path -> Route 7 -> Celadon Mart ROOF vending machine, buy FRESH WATER, then a Saffron gate. With a drink: enter Saffron.
  Badge-5 goal branch now also fires when badges===5 even if seenSouth is false (restart outside the south area).
- Badge-5 destination hints: without a drink, ROUTE_8 has no Saffron edge; its Underground Path warp is "THE WAY FORWARD"; the Route 7/8 gates
  are marked "blocked, no drink"; Celadon Mart 1F door and the upstairs warps are marked toward the roof.
- Test (live, 8000 frames): 9 Jev calls, 0 crash, stayed on ROUTE_14 (trainer battles, story 163->164); new goal text seen in jev.jsonl.
## Next
0. Check that the bot actually reaches Celadon and buys FRESH WATER (vending machine menu mechanics may need work: talk to the machine on the roof, pick an item, YES).
1. ROUTE_15_GATE_2F dead-end hint (Oak's Aide) is still not done.
2. Field-move mechanic for SURF/STRENGTH.

## Session 20260927-090228 (very short) — gate upstairs dead-end
- Added gateFact() in front of mapFact(): any *_GATE / *_GATE_1F -> *_GATE_2F edge is "DEAD END upstairs (Oak's Aide only)", and
  *_GATE_2F -> down is "THE WAY OUT". Generic for all route gates (fixes the Route 15 gate trap listed for 2 sessions).
- Test (live, 6000 frames): 5 Jev calls, 0 crash, went ROUTE_12 -> ROUTE_13 and back (no gate reached, so the hint is unverified in test).
## Next
0. Check that the bot reaches Celadon and buys FRESH WATER (vending machine: talk to it on the roof, pick an item, YES).
1. Field-move mechanic for SURF/STRENGTH.

## Session 20260927-090728 (very short) — badge-5 Route 12 north
- Live bot bounced ROUTE_12 <-> 13 <-> 14 because the old FLUTE_FACTS ("Route 12->13 THE WAY FORWARD toward Fuchsia") contradicted the badge-5 road.
  In the badge-5 block: edges to the PREVIOUS map on the Saffron chain get their [THE WAY FORWARD..] replaced by [BACKWARDS..]; ROUTE_12 gate
  south door (y>18) is "walk straight through NORTH"; ROUTE_12_GATE_1F north exit (at.y<=2) forward, south exit backwards.
- Test (live, 9000 frames): ROUTE_12 -> gate -> LAVENDER_TOWN, Jev answered every question, 0 crash.
## Next
0. Lavender -> Route 8 -> Underground Path -> Celadon Mart roof: check the bot buys FRESH WATER (vending machine menu mechanics).
1. Field-move mechanic for SURF/STRENGTH.

## Session 20260927-091728 (DEEP) — ROOT CAUSE of the ROUTE_12 <-> ROUTE_12_GATE_1F bounce (3 sessions, no progress)
- Evidence (live run 100824-914): bot starts ROUTE_12 (4,41) SOUTH of the gate; walkEdge north tries "edge" tiles (11,22),(9,26),(2,61)...
  which are just the top of the south part (the gate building cuts ROUTE_12 in two) -> "no reachable edge tile" -> destFail
  ROUTE_12|edge:north += 3 (hidden). Jev then correctly goes through the gate (south door 10,21 -> gate -> north door 4,0) and arrives
  at ROUTE_12 (10,15), NORTH of the gate. But destFail was keyed by MAP only, so edge:north (the real way to Lavender) stayed hidden
  ("dest: hid 1 option(s) failed 3+x"); Jev could only pick edge:south = walk back into the gate -> forever.
  Also edgeBad (bad edge tiles) was keyed only by the coordinate ALONG the edge, so the inner-row pushes blacklisted x=0..16 of the
  whole north edge.
- Fix (mechanics): rk(map) = map + '#' + smallest tile index of the walkable component (WALK + NPC tiles) the player stands in; all
  destFail keys and the destCache key use rk(st.map). edgeBad keys now include the row/col (`map|side|a|b`), lastEdge carries `a`.
- SECOND ROOT CAUSE (Lavender west, seen by unapplied session 091228): LAVENDER_TOWN -> ROUTE_8 is open ONLY at row y=8 (x=0).
  walkEdge marked a blocked tile AND its +-1 neighbours bad, so after (0,9) failed, row 8 was never tried -> "no reachable edge tile"
  -> edge:west hidden -> Lavender <-> Route 10 bounce. Now only the exact tile is marked, and walkEdge tries up to 12 tiles per call.
  Confirmed in test: tried y=15..9 (blocked), then crossed at y=8 into ROUTE_8.
- GENERAL LESSON: a connection between two maps can be open on just ONE row/column; never blacklist neighbours of a blocked edge tile.
- Test 2 (live state, 40000 frames, 84 Jev calls, 0 errors): ROUTE_12_GATE_1F -> ROUTE_12 (north) -> LAVENDER_TOWN -> ROUTE_8 ->
  UNDERGROUND_PATH -> ROUTE_7 -> CELADON_CITY -> CELADON_MART 1F..5F -> CELADON_MART_ROOF (all new vs the last live runs).
- THIRD BLOCK found: on CELADON_MART_ROOF Jev was only offered doors/people ("I want something to drink!" girl); the vending machines are
  rom signs (background tiles), no option existed -> roof <-> 5F bounce. Added option 'vend:drink' (roof only) + vendDrink() mechanic:
  walk next to a rom.mapByName(map).signs tile, face it, A, pick FRESH WATER (first menu item), B out; success = drink in bag().
- Test 3 (from test-2 end state, CELADON_MART_5F): Jev picked vend:drink (conf 1.0); screen showed "A vending machine! Here's the menu!"
  then the menu (cursor on FRESH WATER, money 19797); vendDrink pressed A -> FRESH WATER in bag ("vend: bought=true"). CONFIRMED.
  Bug seen: option stayed offered after buying and Jev re-picked it 9x -> now offered only while no drink is in the bag.
- Added badge-5 "have a drink" facts: Mart floors -> down/out, Celadon east edge -> Route 7, ROUTE_5..8 gates -> "THE WAY FORWARD
  into SAFFRON" (guard takes the drink automatically when we walk in).
- FOURTH BLOCK (confirmed by bag dump): bag FULL (20/20 kinds) -> vending machine "There's no more room for stuff!". Cause of the extra
  item: in test 3 Jev talked to the thirsty roof girl while holding FRESH WATER; she took it and gave TM13 (now in bag).
  Added tossForRoom(): if bag has 20 kinds, Jev picks which non-key item to throw away (options with facts; fallback NUGGET/TM),
  mechanic START -> ITEM -> item -> TOSS -> (stack: DOWN = max) -> YES. Test: Jev picked NUGGET, "Is it OK to toss NUGGET?", bag 20->19,
  then FRESH WATER bought. Roof talk options now carry a WARNING (the girl takes our drink) while we hold one.
- FIFTH BLOCK: CELADON_MART_1F street doors (y=7) are "previous map" warps, labelled with the LAST map visited (2F / ELEVATOR), so Jev
  never saw an exit. Now labelled "THIS IS THE STREET EXIT to CELADON CITY" when we have the drink. Elevator is labelled "NOT the way"
  (the bot has no elevator-floor-menu mechanic; test 4 bounced 3F <-> ELEVATOR 20+ times).
  GENERAL: any building exit warp shows the wrong destination (last map); a generic fix (label by rom LAST_MAP = the outdoor map we
  entered from) would help everywhere. NOT done yet.
- SIXTH BLOCK: goWarp to ROUTE_7_GATE failed at (10,9): walkTo stops NEXT to a side door and the old code pushed DOWN. Also the
  harness lists only (11,9) of the 2-tile doorway, and the game refuses (10,9)->(11,9) (confirmed: position unchanged after 4 RIGHT
  pushes) but accepts (10,10)->(11,10). goWarp now pushes toward the door and tries the neighbouring 'D' tiles along the doorway.
- Guard drank: "Whoa, boy! I'm parched! ... You can go on through". Drink is then gone from the bag, so guardsOk() (wStatusFlags1 bit 6
  = BIT_GAVE_SAFFRON_GUARDS_DRINK, plus the guard's text in lastTexts) now counts as "have a drink" in goal + facts.
  Gate exits (previous-map warps) are labelled by side: Saffron is E of ROUTE_7_GATE, W of ROUTE_8_GATE, S of ROUTE_5_GATE, N of ROUTE_6_GATE.
- Test (from the post-gate state): CELADON_CITY -> ROUTE_7 -> ROUTE_7_GATE -> SAFFRON_CITY -> SILPH_CO_1F -> SILPH_CO_2F. 27 Jev calls, 0 errors.
## Next
0. Silph Co.: needs the CARD KEY (Silph Co 5F) to open doors; floors 2F-11F have teleport pads (harness grid 'D'?), Rival on 7F,
   Giovanni on 11F. Check how the bot handles Silph's locked doors (need a "use card key" = walk into the door with it in bag) and the
   warp tiles. Then SABRINA (Saffron Gym, teleport-pad maze).
1. Generic fix for "previous map" exit warps (label them by the rom's real outdoor map).
2. The Celadon elevator (menu to pick a floor) has no mechanic; stairs work.
- FINAL TEST (live state, 70000 frames): 91 Jev calls, 0 errors, reason "limit". ROUTE_12_GATE_1F -> ROUTE_12 -> LAVENDER_TOWN -> ROUTE_8
  -> UNDERGROUND_PATH -> ROUTE_7 -> CELADON_CITY -> CELADON_MART 1F..ROOF (FRESH WATER) -> back down -> ROUTE_7 -> ROUTE_7_GATE (guard drank,
  storyEvents 165->166) -> SAFFRON_CITY -> SILPH_CO_1F -> SILPH_CO_2F. (pokered-test printed "Segmentation fault" AFTER writing the summary,
  in several runs; the summary/logs were complete, looks like a harness exit issue, not the bot.)
## Session 20260927-093229 (short, 9 min)
- Did "Next 1": generic relabel of "previous map" exits. In the door-option loop, if the ROM warp at that tile has destMap 255 and
  lastOutdoor is known, the option id/label uses lastOutdoor (the real street map) instead of the harness's "last map visited".
  Excluded GATE maps (two outdoor sides; handled by side-specific facts), MT_MOON, ROCK_TUNNEL. Execution still uses the raw warp.
- Test (live state ROUTE_8, 8000 frames): 10 Jev calls, 0 errors, reached UNDERGROUND_PATH_ROUTE_7 door. Relabel not yet observed in a
  building in-test -> verify in live logs that e.g. Pokecenter/Mart exits now read door:<CITY>.
- Next: still Silph Co. (CARD KEY, teleport pads), then Sabrina; Celadon elevator mechanic.
## Session 20260927-093729 (short, 9 min)
- Did "Next 0" (Silph Co., put off 3 sessions), goal/facts part only: new bag-aware goal when inside SILPH_CO_* with SURF+STRENGTH+drink:
  without CARD KEY -> climb stairs floor by floor, find CARD KEY on 5F (item ball), locked doors impassable yet; with it -> doors open,
  go up to 7F (rival) / 11F Giovanni via stairs/elevator/teleport pads. Item-ball option for CARD KEY gets "THE WAY FORWARD, PICK IT UP".
- Test (live, SILPH_CO_2F, 8000 frames): 11 Jev calls, 0 errors, new goal text seen in jev.jsonl; mostly battles (Jev: ROCK THROW), stayed on 2F.
- Next: watch live logs in Silph: do teleport pads show up as door options? Does walking into a locked door with CARD KEY work (mechanic)?
  Silph elevator (floor menu) has no mechanic, same as Celadon. Then Sabrina.
## Session 20260927-094229 (short, 9 min)
- Live bot reached SILPH_CO_11F (storyEvents 167). Added post-Silph goal: MASTER BALL in bag (president's reward after Giovanni) ->
  goal says Silph DONE, leave to Saffron, heal, enter SAFFRON_GYM (not the Fighting Dojo), beat SABRINA (teleport-pad maze).
- Test (live, 11F, 8000 frames): 11 Jev calls, 0 errors, trainer battles on 11F (Jev picked moves); Giovanni not yet beaten in-test,
  so the new goal text has not been seen yet.
- Next: confirm in live logs that Giovanni gets beaten and the MASTER BALL goal fires; add SAFFRON_CITY door facts (SAFFRON_GYM = THE WAY
  FORWARD, FIGHTING_DOJO = not now, SILPH_CO_1F = DONE). Check Sabrina's teleport pads show up as door options. Weak party: ONIX Lv14 leads
  some battles with 3 HP -> party ordering / switching decision for Jev.
## Session 20260927-094729 (short, 9 min)
- Live bot at SILPH_CO_5F (storyEvents 168). Added MASTER_FACTS (checkMaster(): MASTER BALL in bag, badges>=5), highest priority in
  mapFact: SAFFRON_CITY>SAFFRON_GYM = THE WAY FORWARD, FIGHTING_DOJO = NOT NOW, SILPH_CO_1F = DONE, POKECENTER = heal; every
  SILPH_CO_nF>SILPH_CO_(n-1)F = stairs DOWN forward; SILPH_CO_1F>SAFFRON_CITY forward. Only fires after Giovanni -> not seen in test.
- Next: verify in live logs Giovanni gets beaten + these facts show; Sabrina's gym teleport pads as options; Silph elevator menu mechanic;
  switching decision for Jev when a weak lead (ONIX Lv15) is out.
- Test (live SILPH_CO_5F, 3000 frames): 7 Jev calls, 0 errors, climbed 5F->6F->7F, money +1300. (An 8000-frame run hit a 150s outer timeout without a summary; keep tests short.)
## Session 20260927-095229 (short, 9 min)
- Evidence: live 105125 on SILPH_CO_9F: VENUSAUR 0 attack PP (CUT etc. empty), ONIX/GEODUDE/GASTLY fainted, the goal question
  had NO heal option (healWhere had no Silph/Saffron entries) and the progress text was stale (Pokemon Tower). Jev kept climbing.
- Added healWhere for SAFFRON_CITY, SAFFRON_POKECENTER, SILPH_CO_1F..11F (+SILPH_CO|SAFFRON in the hf regex), and a heal
  mechanic: SILPH_CO_nF -> goWarp SILPH_CO_(n-1)F, 1F -> SAFFRON_CITY (or 'previous'), SAFFRON_CITY -> SAFFRON_POKECENTER; failures
  count into healFails so the option disappears after 2 failed tries.
- Test (live 9F, 3000 frames): 3 Jev calls (battle: SWITCH_5, NIGHT SHADE), no goal question in-test -> heal option not yet seen.
- Next: verify in live logs that Jev picks heal in Silph and the stair route works (locked doors may block stairs; the elevator has no
  mechanic yet). Fix the stale progress text in Silph (still says Pokemon Tower). Then Giovanni 11F, Sabrina.
## Session 20260927-095729 (short, 9 min)
- Fixed the stale "progress" option text (was Pokemon Tower inside Silph). New branches at the front of the progress ternary:
  MASTER BALL in bag -> Silph DONE, Saffron Gym/Sabrina; inside SILPH_CO_* -> with CARD KEY (hasCardKey()) go up to 7F/11F Giovanni,
  without -> climb to 5F for the CARD KEY.
- Test (live 9F, 3000 frames): 5 Jev calls, 0 errors; Jev saw the new text, picked progress (0.99), then door:SILPH_CO_5F (teleport pad
  from 9F) and ended on 5F, talking to NPCs/items. NOTE: CARD KEY is still NOT in the bag at storyEvents 172 -> watch whether the bot
  finds the item ball on 5F (it's behind/near the teleport-pad maze).
- Next: verify CARD KEY pickup on 5F in live logs; Silph elevator floor-menu mechanic; switching weak leads (ONIX); then Sabrina.
## Session 20260927-100229 (short, 9 min)
- Live at SILPH_CO_8F, storyEvents 174, still NO CARD KEY in bag (never seen in any run log). Fixed stale "train" option inside Silph
  (said tall grass / Rocket hideout / Koga): now says no grass in Silph, EXP only from floor trainers, Giovanni's team, weak bench.
- Test (live 8F, 3000 frames): 6 Jev calls, new train text seen; Jev picked progress 3x and doors 9F -> 5F -> 6F (teleport pads).
- Next (PRIORITY, put off): CARD KEY pickup on 5F. Bot bounces between floors via pads; check whether the 5F item ball is offered as a
  "talk/item" option at all, and give 5F item-ball/pad facts. Then elevator mechanic; weak lead switching (ONIX); Sabrina.
## Session 20260927-100729 (short, 9 min)
- Evidence for missing CARD KEY: in 4 live runs the 5F CARD KEY item ball was NEVER offered to Jev. Cause: indoor talk options were
  capped at slice(0,6) with trainers sorted first; Silph floors have many trainers + items, so the key ball got cut. Added SILPH_CO to
  the 12-option regex (same as gyms/hideout).
- Test (live 11F, 3000 frames): 7 Jev calls (progress, talk x5, elevator door), no crash. Not on 5F in-test, so key offer unverified.
- Next: confirm in live jev.jsonl on SILPH_CO_5F that "item ball on the ground: CARD KEY" appears and gets picked up; if the list is
  still too long, sort CARD KEY items to the front of npcList. Then elevator mechanic, ONIX switching, Sabrina.
## Session 20260927-101229 (short, 9 min)
- Evidence: live 110809 on SILPH_CO_5F: CARD KEY item ball (21,16) WAS offered (talk:7) and Jev picked it 5x (0.48-0.99), but the
  walk never reached it (bot walked UP from (9,15)); destFail resets on any movement, so no "FAILED" fact ever showed.
- Added cardKeyOffers counter: after 2 offers the CARD KEY option says it's still not in the bag and suggests another door/pad/floor.
- Next (PRIORITY): fix the mechanic for reaching (21,16) on 5F: check the path grid (locked shutter? teleport pad needed?) in
  run.jsonl around line 612 of run 110809; record per-target failures that survive movement. Then elevator, ONIX switching, Sabrina.
## Session 20260927-101729 (short, 9 min)
- Added talkMiss (map|x,y -> failed walk/talk attempts), which is NOT reset by movement (destFail is reset on any movement). Every "Talk to"
  option now says "earlier walks to it NEVER arrived Nx in total (path likely blocked...; try another door/teleport pad first)".
  This covers the CARD KEY ball at 5F (21,16) and any other unreachable NPC or item.
- Test (live 10F, 3000 frames): 5 Jev calls (progress, door 11F, progress, talk x2), no crash. Not on 5F, so the new fact hasn't been seen.
- Next (PRIORITY, still put off): the real mechanic fix for reaching 5F (21,16). Check in the live jev.jsonl whether talkMiss shows up
  for it, then look at the path grid (locked shutter or pad-only room?). Then elevator, ONIX switching, Sabrina.
## Session 20260927-102230 (short, 9 min)
- ROOT CAUSE of never reaching 5F CARD KEY (21,16): talkTo() gave walkTo only 30 holds (~15 tiles) outside MT_MOON/ROCK_TUNNEL; the
  winding 5F route from (24,0) is longer, so every walk stopped partway (live 111819: reached (19,10) then gave up). Raised to 150 for
  SILPH_CO|ROCKET_HIDEOUT|POKEMON_MANSION|SEAFOAM|VICTORY_ROAD.
- Test (live 5F, 6000 frames, ended early by time): 3 Jev calls (progress, talk:7 = CARD KEY x2); ended at (21,14), 2 tiles from the key,
  i.e. the walk now gets there. Pickup not yet confirmed.
- Next: confirm CARD KEY in bag in live logs; then elevator floor-menu mechanic, ONIX switching, Giovanni 11F, Sabrina.
## Session 20260927-102730 (short, 9 min, no code change)
- Checked live runs 111819 / 112322: no "CARD KEY" text anywhere in run.jsonl or in the live state, so the key is still NOT confirmed picked up.
  Enemy DISABLE handling already works (disabledMoves; the game showed "The move is disabled!" 3x, then the bot switched moves).
- Test (live 5F, 3000 frames): 2 Jev calls, no crash, ended SILPH_CO_1F with storyEvents 180 (+1), money +990.
- Next (PRIORITY): grep the live jev.jsonl on SILPH_CO_5F for talk options at (21,16) and the run log for the bot's position after picking
  them; if it reaches (21,15), check facing/A press on the item ball. Then elevator floor menu, ONIX lead switching, Giovanni 11F, Sabrina.
## Session 20260927-103230 (short, 9 min)
- Evidence: live 111819 still stopped at 5F (19,10) after exactly 30 holds when walking to the CARD KEY: that run used the OLD code
  (its code/bot.js lacked the 150-hold fix from session 102230). So the fix simply hadn't gone live yet; it is live now.
- Also widened the second walkTo limit (talkToMom, line ~788) to the same dungeon regex (harmless, consistent).
- Test (live 5F, 6000 frames): 2 Jev calls (NIGHT SHADE 0.99, heal 0.85), no crash, ended SAFFRON_POKECENTER, storyEvents 180.
- Next: check the NEXT live runs' code/bot.js has the 150 limit, then grep run.jsonl for "CARD KEY" game text. If found: elevator
  floor menu, ONIX lead switching, Giovanni 11F, Sabrina.
## Session 20260927-103730 (short, 9 min)
- Evidence: live 113312 looped SILPH_CO_11F <-> SILPH_CO_ELEVATOR 5+ times (elevator had no floor-menu code; CARD KEY still NOT in bag).
- Added silphElevatorStep (called from elevatorStep): Jev picks a floor 1F-11F (facts: CARD KEY on 5F / in bag, Giovanni 11F, came-from,
  no-progress counts); code walks to (3,1), UP+A on the panel, DOWN (floor-1) times from the top, A, then exits via (2,2)+DOWN / goWarp.
- Test (live 11F, 4000 frames): 9 Jev calls, no crash, but the elevator was not entered in-test, so the menu mechanic is UNVERIFIED.
- Next: check live run.jsonl for "silph elevator menu:" logs; verify cursor starts at top and exit direction (warps at (1,3),(2,3)).
  Then get the CARD KEY on 5F, ONIX lead switching, Giovanni, Sabrina.
## Session 20260927-104230 (short, 9 min)
- Verified live 113836: silph elevator menu WORKS (picked 5F, exited to SILPH_CO_5F 1,3).
- Evidence: 5F CARD KEY walk reaches (21,14) then holds DOWN ~100x without moving (target approach tile (21,15)); other sides have no path.
- walkTo now bails after 10 bumps in place (log "walkTo: stuck at"), so failures surface in seconds, not 150 holds.
  talkTo: if stopped exactly 2 tiles short in line, faces the target and presses A (in case the ball is really at (21,15)). Test: no pickup.
- Test (live 5F, 5000+1500 frames): Jev 5+ calls, 0 errors; CARD KEY still NOT picked up. Same stuck pattern at 7F (17,3)->(17,4).
- Next (PRIORITY): figure out why (21,15) on 5F is unwalkable though grid says WALK: dump grid().rows around (19..23, 13..17) and the
  npcs list; maybe a sprite/collision tile or the ball is reachable only from (20,16)/(22,16) via another corridor or teleport pad.
## Session 20260927-104730 (short, 9 min)
- ROOT CAUSE of 5F CARD KEY: grid dump at (21,14): row 15 is all '#', ball (21,16) sits in a corridor row 16 walled above/below.
  pathDir treats its TARGET as walkable, so talkTo picked the wall tile (21,15) as approach. talkTo (both copies) now skips approach
  tiles that aren't WALK -> should approach from (20,16)/(22,16) via row 16's corridor ends.
- walkTo: when stuck 10x, learns the step as blocked (LEARNED_BLOCKS "MAP:x,y,DIR", used by pathDir), logs a 7-row grid dump, re-plans once.
- Tests (live 5F): 6000fr + 5000fr, Jev answered (progress/talk:7/door picks), no crash; second run went to elevator, key not yet confirmed.
- Next: confirm "CARD KEY" text in live run.jsonl; if talk:7 now has no approach, find how row 16 is entered (grid dump rows 14-18 wide).
  Also elevator "walkTo: stuck at 3,1 -> 1,3" seen (exit still works via goWarp?). Then ONIX switching, Giovanni 11F, Sabrina.
## Session 20260927-105230 (short, 9 min)
- Evidence: live 114854 (new approach code) re-picked 5F talk:7 (CARD KEY) ~10x; talkTo found no reachable approach and failed instantly.
- talk failure handler: if NO side of the target is a reachable open tile, destFail += 3 (Jev sees it) and a one-time wide grid dump
  is logged ("talk: no reachable side of ...").
- Test (live 5F, 5000fr): Jev answered (progress 0.98, talk:7 0.99, ...), no crash. Grid dump of 5F rows 8-17:
  15:#..D##.#.D##################.#   16:#......#N............N.......#   (ball = N at (21,16); (8,16) is another N)
  Row 16 is entered via door tiles 'D' at (3,15)/(9,15) (Silph card-key gates? or passable) OR via column x=28 ('.' rows 8-16, top-right).
- Next (PRIORITY): check if column 28 connects to the player's area (player was at 24,0 / 23,2); if pathDir fails there, dump rows 0-8
  and treat 'D' tiles as walkable when opened. Then ONIX lead switching, Giovanni 11F, Sabrina.
## Session 20260927-105730 (very short, no code change)
- Evidence: live 115326 loops SILPH_CO_5F -> ELEVATOR -> 5F -> 6F -> 5F repeatedly; CARD KEY still not in bag. 5F grid (player 23,2):
  0:####################D###D#D###  3:#......#N..##..............D.#  4:#......#.......#######..####N#  -> column x=28 (route down to
  the key corridor row 16) is BLOCKED by a person/sprite 'N' at (28,4). Also 'D' at (27,3) is a card-key door.
  So the key area is likely entered some other way: probably a teleport pad/warp on 5F or from another floor (check warps() list on 5F
  and look for a warp landing in row 16 / right column), or the N at (28,4) is a trainer that must be battled (talk to it) first.
- Next (PRIORITY): on 5F log warps() with their destinations and the npcs() list; add "reachable via warp X" facts to the talk:7 option,
  and offer Jev "battle trainer at (28,4)" as an option. Stop Jev re-picking elevator/6F on no-progress loops (destFail on floor visits).
## Session 20260927-110230 (very short, 9 min)
- Silph elevator floor question: when the CARD KEY is not in the bag and 5F already gave no progress, the 5F option now says the key
  corridor (row 16) is walled off from the elevator side and column 28 is blocked at (28,4). The 3F, 4F and 9F options say their pads
  or stairs may lead into that corridor. Jev can now try other floors instead of looping on 5F.
- Test (live 5F, 5000fr): 17 Jev calls, 0 errors, no crash, ended on SILPH_CO_11F with no storyEvent gain.
- Next (PRIORITY, still open): on 5F, log warps() with their destinations and the npcs() list, find which floor's pad lands in row 16,
  and add that as a Jev destination fact. Also offer talking to the N at (28,4) (it could be a trainer or an item).
## Session 20260927-110730 (DEEP, 30 min) — CARD KEY BLOCK SOLVED (confirmed in test)
- ROOT CAUSE (confirmed from grid + warps): 5F CARD KEY (21,16) lies in the row-16 corridor, which the walkable floor never touches:
  (7,16) wall, (8,16) Rocket, column 28 plugged by a trainer at (28,4) (beaten Gen 1 trainers never move). The ONLY entry is the teleport
  pad (9,15) <-> SILPH_CO_9F: arriving ON the pad from 9F lets you step DOWN into the corridor. Earlier "facts" (walk limits, wall approach
  tile, door tiles at (3,15)/(9,15) being gates) were side issues; 'D' in grid() = warp, not locked door.
- Fix (mechanics, bot.js startBounce/bounceStep, hooked in goDest's talk-failure branch): if no side of a talk target is reachable, find
  a reachable warp tile from which it IS reachable, step on it, on the other map step off+back onto the arrival pad (goWarp), then talkTo.
  Test from runs/115326 end state: "bounce ... warp 9,15 -> SILPH_CO_9F" -> 9F (17,15) -> back 5F (9,15) -> "RED found CARD KEY!".
- Then the bot was stuck in the corridor re-talking the beaten trainer at (28,4) (door facts said "deal with it via its talk option").
  Added talkedAt (map|x,y successful talks): door blockers talked to 2+x are described as permanent ("use another REACHABLE door/pad"),
  talk options talked 2+x say "NOTHING NEW". Test from that state: 5F -> pad -> 9F -> 10F -> 11F, 15 Jev calls, 0 errors.
- NOTE: live game at session start was on 11F WITHOUT the key; the live bot must go back to 5F (elevator) and the bounce will fire there.
- Next: 11F with CARD KEY: test ended looping 11F <-> ELEVATOR. Check that walking into locked shutters opens them (goal text claims so)
  and that pathDir treats shutter tiles as walkable once the key is in the bag; find the route to GIOVANNI (11F). Then Sabrina.
## Session 20260927-111230 (very short, 9 min)
- Evidence: live 120329 on 11F re-picked talk:4 (beaten Rocket at (15,9), "my BOSS likes his POKeMON tough!") 25x; option lacked the
  "NOTHING NEW" warning because talkedAt (by exact x,y) stayed <2. Now talk options also say NOTHING NEW when talked[tk] >= 3.
- Live run 121102 DID pick up the CARD KEY (5F -> 9F pad bounce works) and reached 7F.
- Test (live 7F, 6000fr): 15 Jev calls, no crash, ended in SILPH_CO_ELEVATOR, no storyEvent gain (11F picked once).
- Next (PRIORITY): with CARD KEY, reach GIOVANNI on 11F: check shutters open when walked into and pathDir treats them walkable;
  11F elevator side seems cut off from Giovanni's room (5F/7F doors "NO walking path") -> likely needs a teleport pad from another
  floor (e.g. 7F/3F pad) — use the bounce/warp-reachability facts for the 11F Giovanni target. 7F rival fight too.
## Session 20260927-111730 (very short, 9 min)
- Evidence: live 121317 looped SILPH_CO_11F <-> ELEVATOR dozens of times; the 11F elevator option said "visited 0 times" (elevator
  visits not counted) and 11F door (5,5)->SILPH_CO_9F had "NO walking path" = it sits on GIOVANNI's side, only reachable via 9F's pad.
- Added silphFact() (bot.js, next to mapFact) appended to door options: 11F->ELEVATOR = dead end for Giovanni; 11F->9F (unreachable)
  = go to 9F and take its pad; 9F->11F pad = BEST, lands on Giovanni's side; ELEVATOR->11F = dead end, take 9F.
- Test (live 11F, 5000fr): 9 Jev calls, no crash, facts appear; Jev picked talk:2/3/4 (beaten Rockets) then ended in ELEVATOR. No gain yet.
- Next (PRIORITY): check that the elevator floor question (line ~1495) also shows the 9F preference; confirm that 9F has a pad whose
  destination is SILPH_CO_11F (log warps() on 9F); fix elevator visit counting (visits[] not incremented for SILPH_CO_ELEVATOR).
## Session 20260927-112230 (very short, 9 min)
- Evidence: live 121831 looped 11F <-> ELEVATOR 23x (elevator default was 11F; facts pointed at a 9F pad that is unconfirmed).
- Game data (pokered): the 7F teleport pad <-> 11F (3,2) is the walk-in to Giovanni's office; the rival waits on 7F. 9F pads go to 3F/5F.
  Added silphElFacts() for the elevator floor options (with CARD KEY: 7F = BEST, 11F = dead end + visit count, 9F = not Giovanni);
  the fallback default is now 7F. silphFact now marks the 7F->11F pad BEST and points 11F/9F/10F/elevator door options toward 7F.
- Test (live elevator, 6000fr): Jev picked 7F, the bot reached 7F and then walked the stairs 8F->9F->10F->11F (did not look for the 7F pad). No gain.
- Next (PRIORITY): on 7F, log grid().warps with their destinations, check the pad to SILPH_CO_11F shows up as a door option (it may sit
  behind a locked shutter or the rival). If it's unreachable, use startBounce/goWarp to reach it. Add noGain for the 7F->8F stairs.
## Session 20260927-112731 (DEEP, 30 min): card-key doors. Mechanic added, 11F block NOT yet passed
- Evidence (live 122326, jev n=4): on 7F the pad (5,7)->SILPH_CO_11F was offered but showed "NO walking path". Jev picked 8F, and the bot went
  8F->9F->10F->11F->ELEVATOR in a loop. On 11F every useful target is also "NO walking path".
- FACT (pokered source, not yet seen in a test): Silph shutters do NOT open when you walk into them. PrintCardKeyText only runs on an A PRESS
  while FACING a door tile. That is the bottom-left screen tile of the square in front, and must be $18 or $24 ($5e on 11F only). grid()
  shows closed doors as '#'. The old goal text ("walking into a door opens it") was wrong and has been fixed.
- Added visKeyDoors/wallPath/openKeyDoor/keyDoorToward (above goDest), hooked in goDest. On a SILPH_CO_nF map with the CARD KEY, when
  Jev's picked warp/talk target is unreachable, it opens a door tile on screen on the cheapest wall-crossing route (face it, press A).
  If none is visible, it walks to the end of the walkable part of that route and scans again. At most 6 tries per pick.
- CONFIRMED screen mapping: square (px+dx, py+dy) has its bottom-left tile at wTileMap[(9+2dy)*20 + 8+2dx]. The logged tile window matches
  grid() ('#' walls here are $59, pad 'D' is $55, floor $1f).
- Test (live 11F, 40000fr + 5000fr): Jev answered questions, no crash. BUT "keydoor: no door found (0 visible)" every time. Targets on 11F:
  (6,9) from (14,9), (3,16) from (5,1), (7,5) from (7,2), (10,5) from (14,5). No $18/$24/$5e tile was ever on screen, so no door has been opened yet.
- NEXT (PRIORITY): find where 11F's door really is. Log the full 11F grid plus a wTileMap dump from several spots, or check whether event
  EVENT_SILPH_CO_11_UNLOCKED_DOOR exists. Try 7F too: from the elevator, go to 7F and check keydoor logs toward the pad (5,7).
  If tile IDs differ in this ROM, collect the tile values of '#' squares next to the unreachable pocket and try A on each. Guess, not
  confirmed: the 7F route (3F pad -> 7F -> 7F pad (5,7) -> 11F) is the real path to Giovanni.
## Session 20260927-113231 (very short, 9 min)
- Evidence: live 123125 on 11F: keydoor tile dumps show only $1f/$59/$55/$10/$2f etc. No $18/$24/$5e door tile near any 11F target.
  Standard walkthrough route: 3F teleport pad -> 7F rival room -> 7F pad -> 11F Giovanni side. 7F's pad (5,7) was "NO walking path"
  from the 7F elevator side, which fits it being in the rival room.
- Added silph7Blocked (bot.js near silphElFacts). It is set when the 7F->11F pad option is unreachable. After that, 7F's pad option says
  "go via 3F's pad", the elevator marks 3F BEST (default 3F), 3F->7F pad option = BEST, and other Silph door options point toward 3F.
  The flag is not persisted, so it only sets after a 7F visit.
- Test (live 11F, 5000fr): 13 Jev calls, 0 errors, no crash; never reached 7F, so the new facts did NOT appear yet. No gain.
- Next (PRIORITY): check in live runs that 3F is picked after 7F and that 3F's pad to 7F is reachable (it may need a card-key door on 3F:
  keydoor code should handle it). If so, 7F rival room -> pad (5,7) -> 11F -> Giovanni.
## Session 20260927-113731 (very short, 9 min)
- Evidence: live 123327 rode ELEVATOR<->11F 19x; Jev picked 11F in the floor question both times despite "7F BEST"; answer cached
  because the key (card|events|prevMap) never changed.
- Fix (silphElevatorStep): cache key now includes min(3,noGain[prevMap]); with CARD KEY, floors with noGain>=3 (or >=1 if it is the
  floor we just came from) are dropped from the options (keeps >2 options).
- Test (live 11F, 6000fr): 9 Jev calls, 0 errors; "dropped 11F", Jev picked 7F, run ended in ELEVATOR (7F not yet reached in the test).
- Next (PRIORITY): check the live run reaches 7F -> silph7Blocked -> 3F pad -> 7F rival room -> pad (5,7) -> 11F Giovanni.
## Session 20260927-114009 (DEEP, 30 min): SILPH BLOCK SOLVED. Rival beaten and GIOVANNI beaten, both confirmed in tests
- ROOT CAUSES (all confirmed in test logs):
  1. 7F west room (x1-5,y1-7) holding pads (5,3)<->3F and (5,7)<->11F is walled on ALL sides with NO card-key door (full 7F grid rows
     logged). Its ONLY entrance is 3F's teleport pad. silph7Blocked was set only after the 7F pad option was built, so the 7F->ELEVATOR
     option had no hint and Jev kept picking 8F. At the elevator Jev picked 11F (0.84) over "3F BEST" every time.
     Fix: silph7Blocked starts true; with the CARD KEY, 11F is dropped from the elevator floor options (the elevator side of 11F is a dead end);
     on other floors the ELEVATOR option says "BEST: ride to 3F". Jev then picked 3F, the keydoor code opened 3F's door ((17,8), facing LEFT),
     and the 3F pad led to 7F (5,3) -> rival fight.
  2. Forced switch freeze: at "Bring out which POKeMON?" with ONLY slot 0 alive, ti became -1 (askSwitch/findIndex skip slot 0 and a stale
     outIdx check) -> the bot pressed B for 22k frames. Now a forced replacement falls back to ANY living member.
  3. 11F card-key door is at (6,13) (tile $5e; grid() shows it as '.' walkable!). Open it from (6,14) facing UP. keyDoorToward marked doors
     "tried" BEFORE walking to them; a trainer ((3,16) Rocket) interrupted the walk, so the door was never retried. Now a door is only counted
     once A was pressed facing it (max 2 tries).
- Confirmed chain (tests 114446 -> 114521 -> 114618 -> 114640 -> 114816): ELEVATOR -> 3F (door) -> pad -> 7F (5,3) -> rival (lost once;
  blackout -> Saffron PC -> came back on its own; won the 2nd try, storyEvents 185) -> got LAPRAS from a 7F worker -> 7F pad (5,7) -> 11F (3,2)
  -> down column x1-3 -> (6,14) -> door (6,13) -> GIOVANNI at (6,9) beaten (storyEvents 187).
- Real route (from grid/warps, not memory): 3F pad -> 7F (5,3); 7F (5,7) -> 11F (3,2); 11F Giovanni (6,9), President ~(7,5), receptionist (10,5).
- Next: talk to the PRESIDENT on 11F (MASTER BALL); the test bot re-talked the receptionist ("We admire your courage") 6x. Then leave Silph
  (11F elevator side via 10F stairs or elevator -> 1F) and go to SABRINA's gym in Saffron (badge 6). The team is only VENUSAUR (Lv56) plus
  Lv15-28 members: Sabrina's psychics will be hard; consider training and using LAPRAS (in the PC box, since the party is full).
- Post-Giovanni (same session): added silphDone() (event EVENT_BEAT_SILPH_CO_GIOVANNI). With it, the Silph goal text says "leave -> Saffron PC ->
  SABRINA", silphFact only points toward 1F, the elevator marks 1F BEST (default 1F) and stops dropping 11F, and MASTER_FACTS/"progress" use
  (checkMaster() || silphDone()). Test from the post-Giovanni state (114816 end): 11F -> 7F -> 3F -> 2F -> 1F -> SAFFRON_CITY -> PC -> SAFFRON_GYM
  (storyEvents 189). In the gym Jev picked talk:0..3 one after another; each failed 3x and was hidden (gym = teleport-pad maze, next block).
- The President (7,5) was unreachable: its sides (6,5)/(8,5) are boxed in by the pad (5,5) and the receptionist (10,5). The MASTER BALL is skipped for now.
- NEXT (PRIORITY): SAFFRON_GYM pad maze. Log grid()+warps on entry, and offer Jev the pads (warps to SAFFRON_GYM) as options with where each
  lands. Sabrina (Psychic, Lv38-43) vs our team: only VENUSAUR Lv56 is strong; consider training first.
## Session 20260927-115509 (very short, 9 min)
- Evidence: live run 125143 (rival fight on 7F): Jev picked LEECH SEED vs rival's EXEGGCUTE (GRASS, immune) despite the "FAILS" note.
- Fix (pickMove): status moves whose STATUS_NOTES text starts with "FAILS" are dropped from the options when a damaging move that hits exists.
- Test (live 7F, 6000fr): 9 Jev calls, log "dropping LEECH SEED (fails vs EXEGGCUTE)"; no story gain in the short run. LEECH SEED/GROWTH
  was STILL used once vs the same EXEGGCUTE after the drop log: some other path (fallback/cached pick/repeat logic) bypasses opts - investigate next. VENUSAUR's moveset is weak (CUT/GROWTH/LEECH SEED/POISONPOWDER): no strong
  damaging move vs the rival. Consider teaching a TM/HM or using RAZOR LEAF/SOLARBEAM if available.
- NEXT (PRIORITY, unchanged): win the 7F rival fight -> 11F Giovanni (chain proven in session 114009), then SAFFRON_GYM pad maze.
## Session 20260927-120009 (very short, 9 min)
- Fix (pickMove): if Jev's pick is null/not in the offered opts (jev error etc.), use `best` (strongest offered move) instead of
  findIndex -> -1. Suspected bypass for the LEECH SEED-after-drop bug; not yet confirmed.
- Test (live 7F rival fight, 5000fr): 7 Jev calls, dropped LEECH SEED + POISONPOWDER vs EXEGGCUTE, no crash, no story gain.
- Live 125551: VENUSAUR uses CUT (only damaging move) vs rival. Moveset is the real weakness: teach a TM (e.g. MEGA DRAIN/SOLARBEAM/
  BODY SLAM if in bag) or train Haunters. NEXT (PRIORITY, unchanged): win 7F rival -> 11F Giovanni -> SAFFRON_GYM pad maze.
## Session 20260927-120509 (very short, 9 min): no code change, verification only
- Live 130047: bot beat 7F rival earlier (storyEvents 185), reached 11F, beat a Rocket (MAROWAK) at Giovanni's door.
- Test (live 11F, 8000fr): 8 Jev calls, 0 errors; storyEvents 185->186, GIOVANNI fight started (NIDORINO KO'd by CUT crits, vs KANGASKHAN
  at limit). The route chain from session 114009 is working live; left code untouched so the live bot keeps going.
- NEXT (PRIORITY): after silphDone(): SAFFRON_GYM pad maze (offer Jev the pads with landing spots). VENUSAUR still only has CUT for damage:
  teach a TM / train the Haunters before Sabrina.
## Session 20260927-121009 (very short, 9 min): no code change, verification only
- Live state: SILPH_CO_11F, Giovanni beaten (storyEvents 187). Test (live, 8000fr): 11F -> down to SILPH_CO_3F on the exit route
  (Jev picked pads/floors), no crash. Not enough time to build the gym-pad options safely.
- NEXT (PRIORITY, listed 4+ sessions, DO IT FIRST next session): SAFFRON_GYM pad maze. In the warp-options builder (search "kind === 'warp'"
  / goWarp around line 1839), for warps whose destination is the same map (SAFFRON_GYM), label each pad option with its (x,y), the room
  it is in, and where it landed last time (record lastWarpTaken -> arrival pos after a map-internal jump), and mark pads already tried.
## Session 20260927-121509 (very short, 9 min): SAFFRON_GYM teleport pads (the long-deferred step, done)
- goWarp: same-map pads (warp.to === current map) now count as success when the player jumps >2 tiles (padJumped); it records
  padLand['MAP|x,y'] = 'x,y' landing spot + logs "pad MAP (x,y) -> landed (x,y)". Before, every in-gym pad counted as a failure.
- Warp options: a same-map warp is offered to Jev as "Step on the TELEPORT PAD at (x,y) ...; last time it landed us at (..)" or
  "NOT tried yet", plus used Nx and reachability. Jev picks the pad.
- Test (live 11F, 8000fr): 11F -> 7F -> 3F, 5 Jev calls, 0 errors, no crash; the gym was not reached, so the pad code is UNVERIFIED in-game.
- NEXT: verify in SAFFRON_GYM (grep run.jsonl for "pad SAFFRON_GYM"). If Jev loops pads, add "Sabrina is at (x,y); this landing is N tiles
  from her" per pad (Sabrina's npc position from grid().npcs). Team is weak vs Sabrina (only VENUSAUR Lv56): consider training.
## Session 20260927-122009 (very short, 9 min): no code change, diagnosis only
- Live 131611 + test (live SAFFRON_GYM, 8000fr, 24 Jev calls, no crash): bot bounces SAFFRON_CITY <-> SAFFRON_GYM ~10x, then wanders
  Route 7/8 gates. In the gym, EVERY teleport-pad option is labelled "(NOT reachable from here)" from the entrance (8,17), so Jev
  picks talk:N or door:SAFFRON_CITY. Pad options seen: (1,3),(5,3),(1,5),(5,5),(1,9),(5,9),(1,11),(5,11),(1,15),(5,15),(1,17),(5,17)...
- Likely cause: pathDir(g, pad) returns null for pad tiles (warp tiles treated as blocked/avoided in pathing, or the entrance room's
  pad (in pokered the entry room pad is right of the entrance, ~ (11,15)) is not in the list). bot.js ~line 1340 (`const reach = !!pathDir(...)`).
- NEXT (PRIORITY, DO FIRST): in SAFFRON_GYM, log grid rows + warps at entry; make pathDir allow a same-map warp tile as the TARGET
  tile; confirm at least one pad reachable from (8,17); then let Jev pick pads (landing info already recorded via padLand).
  Also: in SAFFRON_GYM, mark door:SAFFRON_CITY as "leaves the gym (backwards)" so Jev stops bouncing.
## Session 20260927-122509 (very short, 9 min): SAFFRON_GYM pad options filtered
- Diagnosis: pathDir was fine. From the entrance, pad (11,15) IS reachable, but Jev saw ~30 pads (29 marked NOT reachable) and
  never picked it. Fix: warp options for same-map pads that are unreachable (and not the one we stand on) are no longer offered.
- Test (live SAFFRON_GYM, 6000fr): 8 Jev calls (a gym trainer battle: CUT/SELFDESTRUCT/switches), no crash, no pad question was
  reached yet, so the filter is UNVERIFIED in-game. Grep run.jsonl for "pad SAFFRON_GYM" next session.
- NEXT: verify pad hopping; if Jev still leaves via door:SAFFRON_CITY, label that door "leaves the gym (backwards)". Team is weak.
## Session 20260927-123009 (very short, 9 min): SAFFRON_GYM door labelled BACKWARDS
- Added door label 'SAFFRON_GYM>SAFFRON_CITY' = BACKWARDS (Sabrina is inside, reached via the TELEPORT PADS) so Jev stops
  bouncing gym <-> city (seen in session 122009).
- Tests (live SAFFRON_GYM, 8000fr): gym trainer battles (Haunters vs psychics: NIGHT SHADE picks, ~10 Jev calls), no crash; still no
  "pad SAFFRON_GYM" line reached in-test, so pad hopping remains UNVERIFIED. Check live run.jsonl for "pad SAFFRON_GYM" first.
- NEXT: verify pads live; if Jev loops, add per-pad "landing is N tiles from Sabrina". Team weak (Haunters ~Lv28 vs Sabrina Lv50).
## Session 20260927-123509 (very short, 9 min): pad options show distance to Sabrina
- VERIFIED live (run 132555): pad hopping works in SAFFRON_GYM ("pad SAFFRON_GYM (x,y) -> landed (..)" lines), bot beat
  SLOWBRO/KADABRA/HAUNTER trainers, then left to heal (ok). Seen landings: (15,17)->(11,17), (11,15)->(19,17), (15,15)->(3,15),
  (5,17)->(17,17), (19,15)->(12,14).
- Change: a tried pad's option now says "which is N tiles from SABRINA at (9,8) (smaller = closer to the goal)" (SAFFRON_GYM only).
- Test (live gym, 8000fr): 9 Jev calls, no crash, no progress; padLand is in-memory so no tried pads yet -> label UNVERIFIED in-test.
- NEXT: padLand resets on every restart; seed it with the known landings above (or persist). Team weak vs Sabrina (Lv50):
  VENUSAUR carries; consider training Haunters / buying a TM for VENUSAUR.
## Session 20260927-124009 (very short, 9 min): padLand seeded
- padLand (bot.js ~154) is now pre-seeded with 11 SAFFRON_GYM pad landings from live run logs, so the "N tiles from SABRINA"
  label shows immediately after restarts. (19,15) was left out (inconsistent landings logged).
- Test (live gym, 8000fr): 14 Jev lines, 9 pad options showed the Sabrina distance, storyEvents 191->192 (a gym trainer beaten), no crash.
  New landings seen: (9,3)->(15,11), (15,9)->(15,3) (conflicts with the seeded (9,1): padJumped may log the landing when the player
  walks off a pad nearby, so some seeds may be noisy).
- NEXT: reach/beat SABRINA at (9,8). If Jev loops, pick pads by landing-distance. Team weak (Haunters ~Lv28): train / TM for VENUSAUR.
## Session 20260927-124509 (very short, 9 min): post-Silph goal text
- Live run 134046: in SAFFRON_GYM, Jev's goal still said "enter SAFFRON CITY through a gate ... then Silph" because the MASTER BALL
  branch never fires (ball likely used; bag has none). Money 28405 -> 15342 (a whiteout, probably).
- Change (bot.js ~609): new goal branch `surf && str && (silphDone() || map === SAFFRON_GYM)` = "Silph DONE, beat SABRINA at (9,8) via pads,
  lead with VENUSAUR, heal at SAFFRON_POKECENTER, don't go back into Silph".
- Test (live gym, 6000fr): 7 Jev calls, all in a trainer battle (KADABRA/MR.MIME, VENUSAUR picks moves), no crash; the new goal was
  not shown in a non-battle question during the test -> check the goal text in live jev.jsonl.
- NEXT: beat SABRINA. Team weak apart from VENUSAUR Lv57 (Haunters ~Lv28); battle Qs have only CUT/GROWTH-ish moves for VENUSAUR:
  consider buying/teaching a TM (e.g. at Celadon Mart) or training. Seeded padLand entries may be noisy (see previous session).
## Session 20260927-125010 (very short, 9 min): pad landings only recorded if on a pad
- Live run 134555: bogus landings like (19,9)->(0,8), (9,5)->(14,8) (player had walked off/been interrupted) fed Jev wrong
  "N tiles from SABRINA" facts. padJumped (bot.js ~156) now records a landing only if the landing tile is itself a warp/pad;
  otherwise logs "moved to (..) which is not a pad, landing NOT recorded".
- Test (live gym, 6000fr): 28 Jev calls, no crash; filter fired on (1,15)->(8,4) and (9,3)->(5,7). Clean landings: (15,5)->(1,17),
  (9,5)<->(5,9), (9,3)->(15,11).
- Also seen live: goWarp fails when standing on pad (15,9) ("goWarp SAFFRON_GYM failed ... at 15,9"): step-off may find no free
  non-warp neighbour. NEXT: fix that; seeded padLand entries may still be noisy (drop ones whose landing is not a pad). Beat SABRINA.
## Session 20260927-125510 (very short, 9 min): step off a pad when grid shows no free neighbour
- Live run 135116: "goWarp SAFFRON_GYM failed from SAFFRON_GYM at 1,11" (standing on pad (1,11)) and at 3,3 (target 5,3).
- Change (goWarp ~line 226): if standing on the target warp and the grid finds no free non-warp neighbour, probe each direction
  physically; keep the first step that moves us off without warping (if it lands on another pad, treat as warped).
- Test (live gym, 5000fr): 6 Jev calls (VENUSAUR move picks in a trainer battle), no crash; the new probe path was NOT exercised.
- Observed: VENUSAUR's moves are CUT/GROWTH/LEECH SEED/POISONPOWDER (no Grass damage move!). This is why it's weak vs Sabrina.
  NEXT (listed 4+ sessions, do it): get VENUSAUR a real damaging move: buy TM (Celadon Mart: e.g. TM for MEGA DRAIN? / use a
  TM in the bag) or have Jev choose training; check the bag for TMs first. Then beat SABRINA at (9,8).
## Session 20260927-130010 (very short, 9 min): talk options in SAFFRON_GYM show distance to SABRINA
- Live run 135602: Jev cycled talk:0..talk:8 in the gym (gym guide "Psychic POKeMON fear only ghosts" repeated); no progress.
- Change (talk option ~line 1504): in SAFFRON_GYM non-leader talk options add "(N tiles from SABRINA at (9,8); only the leader gives the badge)".
- Test (live gym, 5000fr): Jev answered questions, new label appeared in jev.jsonl, no crash.
- NEXT (STILL overdue 5+ sessions, do it FIRST next time): VENUSAUR has no Grass damage move (CUT/GROWTH/LEECH SEED/POISONPOWDER).
  Check bag for TMs (log bag() once at start), teach one via menu, or let Jev choose training. Needs >9 min? then at least log bag.
## Session 20260927-130510 (very short, 9 min): bag logged; TMs shown to Jev in gym goal
- play() now logs "bag at start: ..." once. Live bag: TM34(BIDE) TM11(BUBBLEBEAM) TM28(DIG) TM24(THUNDERBOLT) TM39(SWIFT)
  **TM21 (MEGA DRAIN, VENUSAUR can learn it!)** TM10(DOUBLE-EDGE) TM06(TOXIC), HM01/03/04, RARE CANDY x2, NUGGET, DOME FOSSIL.
- SAFFRON_GYM goal (~line 618) now appends "TMs/HMs in bag: ...". Test (4000fr): Jev answered questions, TM list appeared, no crash.
- NEXT (DO FIRST): teach TM21 MEGA DRAIN to VENUSAUR (replace CUT? CUT is HM, can't forget easily -> replace GROWTH).
  Mechanics: START -> ITEM -> TM21 -> USE -> pick VENUSAUR -> forget GROWTH. Let Jev pick which move to forget (choice Q).
  Also TM28 DIG/TM24 THUNDERBOLT (Haunters can't learn TB; GEODUDE can DIG). Note the HM/TM party-menu back-out in play() (~2046)
  presses B on "Use TM on" screens: bypass it while intentionally teaching.
## Session 20260927-131010 (very short, 9 min): teach TM21 MEGA DRAIN (Jev decides)
- New maybeTeachTM() (before play()): if bag has TM21 and lead VENUSAUR lacks MEGA DRAIN, Jev is asked teach/skip once; then
  START > ITEM > TM21 > USE > YES > first mon; "delete older move" goes to moveLearnStep (Jev picks; HM moves labelled undeletable).
  Called in play loop just before the teachCut line. Max 2 tries.
- Test (3000fr): Jev chose "teach"; menu reached party ABLE/NOT ABLE screen; "trying to learn MEGA DRAIN!" shown 3x; later
  "move learn: forgot POISONPOWDER" (via main loop). NOT verified that MEGA DRAIN ended in the moveset -> check live log
  ("teachTM: try" line / party moves). If it looped, the older-move prompt probably arrived after the k<20 loop; tighten it.
- NEXT: confirm VENUSAUR knows MEGA DRAIN, then beat SABRINA at (9,8). Consider TM28 DIG for GEODUDE.
## Session 20260927-131510 (DEEP, 30 min): SAFFRON_GYM BLOCK SOLVED — SABRINA BEATEN, MARSH BADGE (badge 6) confirmed in test
- ROOT CAUSE (confirmed): Sabrina (9,8) stands in a room walled off on all sides; the only way in is a CHAIN of teleport pads.
  talkTo() only walks (pads 'D' are not in WALK), so "talk to SABRINA" always ended in "talk: no reachable side of ... person 0 at 9,8"
  (live 140601/141104) and was hidden after 3 fails; Jev was left hopping single pads with noisy landing facts and never got there.
  The old diagnoses (Jev picking badly, need "distance to Sabrina" facts, VENUSAUR moveset) were not the block.
- FACT: the ROM gives every pad's exact landing: rom.mapByName(map).warps[i] = {x,y,destMap,destWarp}; a same-map pad (destMap === m.id)
  lands on warps[destWarp] (0-indexed, verified: every predicted landing matched in tests). No need to learn padLand by trial.
- FACT (mechanics): walking onto a pad does not fire it at once; goWarp logs "failed", then its "on the warp, stepped UP" re-entry fires
  the teleport. Works, just slow; the "expected to land X, now at Y" lines are that timing, not wrong ROM data.
- Fix: padDests(map) + padRoute(g, goals) (BFS where stepping onto a same-map pad jumps to its ROM landing) + padsToward(n, goalsFn)
  (rides the chain hop by hop via goWarp). Used (1) in the talk action when talkTo fails, (2) in goWarp when the target warp is walled
  off (e.g. the gym exit from Sabrina's room). Talk options in pad maps say "REACHABLE through N teleport pad(s) (a > b)" / "NOT reachable".
  Route found: entrance -> (15,5)->(1,3) -> (1,5)->(11,11) -> Sabrina. Exit: (1,3)>(15,3)>(19,9)>(19,17) -> door (8,17).
- Post-badge-6: goal() has a badges>=6 branch (Blaine/Cinnabar via SURF; LAPRAS in PC); BADGE6_FACTS (checked first in mapFact) mark the
  gym/Silph/Cerulean tunnel BACKWARDS and point Saffron -> Route 6 -> Vermilion -> Route 11 -> 12 -> Fuchsia; gym leader talk options say
  "ALREADY BEATEN" when the gym's badge bit is set (GYMBIT).
- VENUSAUR already knows MEGA DRAIN (used vs Sabrina), so maybeTeachTM() is a no-op now.
- Tests: live state 40k frames: Sabrina beaten (storyEvents 195->197, badges 5->6), pads out of the gym, Saffron -> Route 6 -> Vermilion, 51 Jev
  calls, 0 errors. From that end state (25k frames): Vermilion -> Route 11 -> 12 -> 13 -> 14 -> 15 toward Fuchsia, 23 Jev calls.
- NEXT BLOCK (badge 7, BLAINE on Cinnabar): needs SURF and there is NO surf mechanic. Gen 1 has no "A facing water" prompt: SURF is used from
  START > POKEMON > (mon) > SURF while facing water. No party member can learn SURF; LAPRAS is in the PC box. Needed mechanics, in order:
  (a) Pokemon Center PC: deposit a weak member (Jev picks which), withdraw LAPRAS; (b) teach HM03 to LAPRAS (maybeTeachTM pattern);
  (c) water tiles in grid() (check the legend) as walkable while surfing + a "start surfing" step at the shore; then Fuchsia -> Route 19/20
  -> Cinnabar, Pokemon Mansion SECRET KEY -> Blaine.
- Confirmed next block (test from the Route 15 state): Fuchsia -> ROUTE_19 (storyEvents 198) -> edge:south (sea) fails 3x and is hidden ->
  only edge:north left -> endless Fuchsia<->Route 19 seam bounce, 225 Jev calls / 30k frames. Added BADGE6_FACTS 'FUCHSIA_CITY>ROUTE_19'
  = "NOT YET: needs a SURF user" -> bounce stopped (14 Jev calls / 12k frames; the bot then idles in FUCHSIA_POKECENTER talking to people).
  So the live bot will park around Fuchsia until the SURF mechanics above exist. BUILD THEM NEXT (PC swap for LAPRAS first).
- Final test (live state, final code): MARSHBADGE again, then Saffron -> Route 6 -> Vermilion -> Route 11 gate, 49 Jev calls, 0 errors
  (pokered-test segfaulted AFTER writing the summary, reason "limit": harness shutdown, not the bot).
## Session 20260927-133010 (very short, 9 min): diagnostic log for skipped pad routing in goWarp
- Live run 142521 was riding the pad chain OUT of SAFFRON_GYM (badge 6 done) and ended at (16-18,8) talking to trainers; goWarp
  "the previous map" failed at 16,8 WITHOUT the "walled off, riding pads" path. Added a log in goWarp (line ~214):
  "goWarp pads skipped: matched= w0= pathDir= route=" whenever a pad map skips pad routing -> read it in the next live log.
- Test (live state, 6000fr): bot left the gym via pads -> SAFFRON_CITY -> SAFFRON_POKECENTER; Jev answered questions, no crash.
- NEXT (unchanged, BUILD IT): SURF mechanics for Cinnabar: PC swap (Jev picks who to deposit) to withdraw LAPRAS, teach HM03, surf.
## Session 20260927-133510 (9 min): stale "progress" option text fixed for 6 badges
- Evidence: live run 143104 (ROUTE_11) — Jev's "progress" option still said "go back into SAFFRON GYM and beat SABRINA for badge 6"
  (opts.progress in the next-action question had no badges>=6 branch; only goal() did). Added a badges>=6 branch first: Blaine/Cinnabar
  via SURF, LAPRAS in the PC, don't go back to Saffron Gym/Silph.
- Test (live state, 5000fr): Jev saw the new text, picked progress; battles fine; ended ROUTE_11 (55,13); no crash.
- Live 143104 also showed holding LEFT/RIGHT at ROUTE_11 (55,1) (top of route near the gate) — check if it's stuck there.
- NEXT (still unbuilt, 4+ sessions, DO IT in a long session): SURF mechanics: PC swap (Jev picks who to deposit) to withdraw LAPRAS,
  teach HM03 (maybeTeachTM pattern), surf from the shore at Route 19.
## Session 20260927-134010 (9 min): SURF step (a) STARTED — PC swap for LAPRAS (maybePcSwap, before maybeTeachTM)
- In any *_POKECENTER with badges>=6, LAPRAS in box() and not in party: Jev picks who to deposit (choice Q, options with level/HP/moves,
  or skip); code walks to (13,4), faces UP, A -> BILL's PC -> storage menu -> DEPOSIT (who) -> WITHDRAW LAPRAS. Logs "pc screen:" dumps.
  BADGE6_FACTS FUCHSIA_CITY>FUCHSIA_POKECENTER now says the PC holds LAPRAS. Max 2 tries per process (pcSwapTries).
- Test (live, 12000fr): Jev picked deposit_1 (ONIX); PC opened, BILL's PC selected, storage menu reached, but the menu cursor was
  the hollow '▷' (text "Accessed POKéMON Storage System" still up) so curRowText() was empty and DEPOSIT wasn't found -> lapras=false.
  Added a wait loop until the cursor row reads WITHDRAW/DEPOSIT (untested beyond a short run). CHECK "pc screen"/"pc swap" in live log.
- NEXT: finish (a) (verify LAPRAS in party), then (b) teach HM03 to LAPRAS (maybeTeachTM pattern), (c) surf from Route 19 shore.
## Session 20260927-134510 (9 min): SURF step (a) DONE — PC swap works, LAPRAS joins the party
- Live 144136 showed the storage menu stuck on hollow '▷' (text box waiting) and, after that, party list rows are NICKNAMES
  ("AAAAAAAAAA"), so species matching landed on CANCEL. Fix: tap A until the cursor row reads WITHDRAW/DEPOSIT (B if it overshoots);
  select deposit/withdraw rows BY POSITION (UP to top, DOWN di / box index of LAPRAS).
- Test (live, 6000fr): Jev picked deposit_1 (ONIX) -> "lapras in party=true"; party now VENUSAUR, GEODUDE, GASTLY, HAUNTER x2, LAPRAS Lv15.
- NEXT: (b) teach HM03 SURF to LAPRAS (copy teachCut/maybeTeachTM: START>ITEM>HM03>USE>pick LAPRAS by party index, Jev picks
  move to forget), then (c) surf from Route 19 shore (START>POKEMON>LAPRAS>SURF facing water; water walkable in grid) and drop the
  BADGE6_FACTS 'FUCHSIA_CITY>ROUTE_19' "NOT YET" label once LAPRAS knows SURF. Note: LAPRAS is Lv15 — weak; Jev may want to train it.
## Session 20260927-135011 (9 min): SURF step (b) DONE — maybeTeachSurf teaches HM03 to LAPRAS
- maybeTeachSurf(st) (before play()): badges>=6, HM03 in bag, LAPRAS in party without SURF -> Jev choice teach/skip -> START>ITEM>HM03>USE,
  party list picked BY INDEX (nicknames), older-move prompt -> moveLearnStep. knowsSurf() helper. Called after maybePcSwap in the loop.
- Test (live, 9000fr): PC swap deposit ONIX -> LAPRAS in party; Jev "teach" -> "teachSurf: try 1 knowsSurf=true". No crash.
- NEXT: (c) surf: START>POKEMON>LAPRAS(by index)>SURF while facing water at the Route 19 shore; water walkable in grid while surfing;
  drop the BADGE6_FACTS 'FUCHSIA_CITY>ROUTE_19' "NOT YET" label when knowsSurf(). Then Route 19/20 -> Cinnabar. LAPRAS Lv15 is weak.
## Session 20260927-135511 (DEEP, 30 min): SURF step (c) DONE — the bot surfs; ROUTE_20 reached (new map)
- ROOT CAUSE of the 3-session stall (live 144640/145102): LAPRAS already knew SURF, but (1) BADGE6_FACTS still labelled
  FUCHSIA_CITY>ROUTE_19 "NOT YET", so Jev bounced Fuchsia <-> FUCHSIA_POKECENTER forever, and (2) '~' (water) was never walkable and
  nothing could start surfing, so even choosing Route 19 hit the shore.
- Fix: surfOK (updated every tick) = SOUL BADGE bit (badgeBits & 16) && a LAPRAS in party knows SURF. When true, '~' is added to
  WALK (global Set; removed when false), so pathDir/walkEdge/reachInfo plan over water. walkTo: if the next step is '~' and
  state().walkState !== 2 (0 walk, 1 bike, 2 surf), startSurf(dir): face water, START > POKeMON > LAPRAS (by party index;
  names are nicknames) > SURF (menuSelect /SURF/). Logs "surf: start facing D at x,y -> surfing=true". Leaving water onto land
  dismounts automatically (game). SURF_FACTS (checked before BADGE6_FACTS when surfOK) mark Route 19/20/Cinnabar forward/backward.
- CONFIRMED (test from live state, 30k frames): Jev edge:south -> ROUTE_19, surf started at (9,9), swimmer battles won,
  ROUTE_19 -> ROUTE_20 (first time ever). 57 Jev calls, 0 errors.
- Found in that test: swimmer trainers who spot us freeze input ~600 frames; walkTo's "stuck 10x" treated that as a wall and
  LEARNED fake blocked steps (then walkEdge said "no reachable edge tile" and hid edges). Fix: when stuck with an NPC in line
  within 6 tiles, wait 90 frames (max 4x per walkTo) without learning a block.
- Route 20 exits: west -> CINNABAR_ISLAND, east -> ROUTE_19. Seafoam Islands sit in the middle; unverified whether the Gen 1
  water path around them is open (I believe it is). If the bot bounces ROUTE_20 <-> ROUTE_19, dump the full ROUTE_20 rows
  to check the water path west of x~63.
- Test 2 (live state, 40k fr): Fuchsia -> Route 19 (surf) -> ROUTE_20 again; the trainer-freeze wait works ("walkTo: frozen ... waiting").
  On ROUTE_20 the bot lands on the Seafoam islet (~x 50-60, y 2-7) and must RE-surf west at (46,6): first tries failed because
  the START menu (cursor remembered, drawn over frames) was read too early -> picked ITEM/CANCEL. Patched: wait for EXIT to be
  drawn, verify the POKeMON row, surfFails resets on success (cap 10).
- Test 3 (from test 2's end state on ROUTE_20, 15k fr, final code): re-surf succeeded on the 3rd try ("surf: start facing LEFT at
  46,7 -> surfing=true"), 5 Jev calls, 0 errors, still on ROUTE_20 at the limit (ended at (61,2), back on the islet - watch for an islet<->water loop). CINNABAR_ISLAND NOT yet reached in any test.
- NEXT: read the live log for ROUTE_20 progress west of x=46. If the first 1-2 surf tries still fail, log screen() rows after
  the party-list A press (the field-move submenu row) — the party-index pick (UP x6, DOWN li) may be read before the list is drawn.
  Then Cinnabar: Pokemon Center, Pokemon Mansion (SECRET KEY) -> BLAINE (quiz gym).
## Session 20260927-140511 (DEEP, 30 min): ROOT CAUSE of the Route 19 freeze = menu mechanics, not strategy
- Live 150116: frozen at ROUTE_19 (9,9) for 30k frames. Trace: first SURF try read the field-move submenu as "CANCEL" (fail),
  the 5 quick B presses did not fully close the menus, and walkTo's "hasTextBox -> press A" then pressed A on the START
  menu forever: A on "RED" opened the trainer card ("65 03432 79 RED" game text), A closed it, repeat. Every walkEdge
  (west AND north) failed because the player never moved; Jev's picks were irrelevant.
- WHY the SURF submenu said CANCEL (confirmed in test 140852, screen dump in the log): the blind "UP x6, DOWN x li" in the party
  list lost presses; the cursor landed on member 3, 2, then 1 (VENUSAUR -> CUT submenu), never LAPRAS (slot 6).
- Fixes (bot.js): isStartMenu(s) -> walkTo presses B instead of A when the START menu is open; partyCursorTo(li) moves the party
  cursor by READING cursor.y (UP until it stops = y0, then DOWN until y0 + 2*li; each member is 2 rows); startSurf waits for
  "Choose a POK" and for the STATS submenu before reading, searches SURF UP then DOWN, logs the screen; closeMenus() presses
  B until no cursor/text box (replaces blind B x4/x5).
- CONFIRMED twice from the live state (tests 140929, 141053; 45-50k frames): "surf: party cursor y0=1 now=11 want member 5",
  "submenu row SURF ok=true", "surfing=true" at Route 19 (7,9) AND the re-surf at ROUTE_20 (46,8) both on the FIRST try;
  ROUTE_19 -> ROUTE_20 -> SEAFOAM_ISLANDS_1F -> B1F -> B2F; storyEvents 199 -> 202, pokedexSeen 89. 41 Jev calls, 0 errors.
- NEW: settleMap logs "mapdump MAP WxH warps=[..] exits=[..]" + one line per grid row, once per map per process. Read these
  instead of guessing geography. (B1F's dump came out ALL '#': grid probably not drawn yet at settle; the bot still walked it.)
- ROUTE_20 GEOGRAPHY (from the dump, FACT): east sea (x>=63) and the middle islet (x44-61) are walled off from the western sea
  (x=43 rock rows 2-13; x=55 and x=62 ridges). Route 20 doors: (48,5) and (58,9), both SEAFOAM_ISLANDS_1F. West edge (Cinnabar)
  is water only on rows 14-16. The ONLY link: 1F exit (26,17)/(27,17) -> Route 20 (58,9) -> land x56-61 y10-11 -> surf S -> W.
  SEAFOAM_1F (30x18): entrance (4,17)/(5,17); ladders down (7,5), (25,3); the exit area x21-27 y12-15 is walled off on 1F and
  reached only via ladder (23,15) from B1F. The old SURF_FACTS "NOT NOW: Seafoam, keep surfing west" was WRONG -> replaced with
  Seafoam facts (ROUTE_20>SEAFOAM, 1F>ROUTE_20 by x, 1F>B1F, B1F>1F). Which B1F ladder lands on 1F (23,15) is NOT yet known:
  read the B1F/B2F mapdumps + rom.maps warp destinations. Boulders ("This requires STRENGTH") exist; HM04 is in the bag,
  nobody knows STRENGTH. Unverified whether the 1F(23,15) route needs STRENGTH.
- ALTERNATIVE if Seafoam proves impassable without STRENGTH: Pallet Town -> Route 21 (surf south) -> Cinnabar (long walk back).
- If any other menu driver uses blind UP/DOWN counts in the party list (maybeTeachSurf, PC swap), switch it to partyCursorTo.
- Seafoam 1F exits: destOptions now appends per-tile notes on SEAFOAM_ISLANDS_1F (x<=5,y>=16 BACKWARDS; x>=26,y>=16 THE WAY
  FORWARD). Test 141225 (from SEAFOAM_1F, 35k fr): Jev went 1F -> ROUTE_20 (east) -> back in -> B1F; storyEvents 203, seen 91.
- SUSPICION (UNVERIFIED): the B1F mapdump in test 141225 has 1F's TILES (rows 5-10 identical to 1F, incl. 1F boulders at
  (26,7),(18,10)) but B1F's warp list. 1F and B1F are both 30x18, so mapSettled() (size + NPC count) can't tell a stale grid.
  If the bot fails to walk on Seafoam B1F/B2F, compare grid() rows a few hundred frames after the warp vs right after.
- Test 141311 (from B1F, final code, 40k fr): reached SEAFOAM_ISLANDS_B3F (new floor), 43 Jev calls, 0 errors; along the way it bounced 1F <-> B1F via (7,5)/(25,3); goWarp to B1F (23,15) "failed from 22,2"
  (no real path; the B1F grid may be stale, see above). Seafoam's way to the west exit may need STRENGTH (boulder puzzle;
  GUESS from memory of Gen 1, not verified). HM04 STRENGTH is in the bag; nobody knows it.
- NEXT (pick one, in order): (1) verify Seafoam B1F tiles (grid after a longer wait) and find which B1F/B2F ladder reaches
  1F (23,15) using rom.maps warp destinations; (2) if it needs STRENGTH, either teach HM04 (maybeTeachSurf pattern; Jev picks
  who) + a boulder-push mechanic, or give Jev the Pallet Town -> Route 21 (surf south) -> Cinnabar route instead (no STRENGTH).
- FINAL test (live state, final code, 25k fr): START-menu freeze cleared, surfed, ROUTE_19 -> ROUTE_20; 22 Jev calls, 0 errors.
## Session 20260927-142011 (DEEP, 30 min): Seafoam — grid() is ONE FLOOR STALE at settle; facts were dead code
- CONFIRMED BUG 1: the Seafoam per-tile facts (1F exits, added 140511) sat INSIDE `if (badgeCount === 5)` in destOptions -> never ran
  with 6 badges. Moved into their own try block after it. Jev now sees them (test: picks the labelled ladders at 0.6-0.9).
- CONFIRMED BUG 2 (harness lag): after a ladder between same-size floors (Seafoam 1F/B1F/B2F all 30x18), mapSettled() passes while
  grid() still returns the PREVIOUS floor's tiles for ~20 frames (test 142904: B1F dump == 1F tiles at frame 7985918, correct 20
  frames later). So every earlier "B1F/B2F mapdump" in NOTES was the floor ABOVE. The 140511 geography of Seafoam B1F is WRONG.
  Fix: settleMap re-reads grid() every 20 frames until two reads agree (max 10). Dumps now correct (verified B1F warps line up).
- TRUE LAYOUT (from correct dumps + ROM warps, logged as "romwarps ..." at start):
  1F: entrance (4,17); ladders (7,5), (25,3) -> B1F same coords; exit pocket x21-27 y12-17 = ladder (23,15) + exits (26,17)/(27,17) -> Route 20 (58,9).
  B1F: (25,3) landing = CLOSED dead-end pocket x20-27 y2-8. West part has (4,2)->B2F(5,3), (7,5)->1F, (13,7)->B2F, (19,15)->B2F.
       SE room x21-27 y10-15 holds (25,11)<->B2F(25,11) and (23,15)->1F(23,15). Only reachable from B2F (25,11).
  B2F: EAST room x22-27 y2-14 holds (25,3)->B3F, (25,11)->B1F, (25,14)->B3F; walled off from B2F west. B2F west has (5,3),(13,7),
       (19,15) up and (5,13)->B3F(5,12). B2F has elevation blockedMoves (rows 3->4 x11-14, rows 7->8 x3-9 and x16-19...).
  => Route (no STRENGTH needed IF B3F links (5,12) to (25,3)/(25,14) — UNVERIFIED, B3F/B4F have currents + boulders):
     1F(7,5) -> B1F west -> B2F west -> (5,13) -> B3F -> (25,3)/(25,14) up -> B2F east -> (25,11) up -> B1F SE -> (23,15) -> 1F -> (26,17).
- Facts (destOptions, surfOK && SEAFOAM 1F/B1F/B2F/B3F) now describe that route per ladder tile.
- UPDATE (same session, test 143602 from SEAFOAM_1F, FINAL code): B2F blockedMoves (elevation, rows 7<->8 x3-9/x16-19, rows 3<->4 x11-14,
  rows 9<->10 x23-26) split B2F further: B1F (4,2) lands in B2F top-left CUT OFF from (5,13); B1F (13,7)/(19,15) land in the lower part
  WITH (5,13). B2F east: (25,3) top part is cut off from (25,11)/(25,14). Facts updated. Jev then followed the route exactly:
  1F (7,5) -> B1F -> B2F (13,7) -> (5,13) -> B3F (5,12), then picked B3F ladder (25,14) at 0.96 but "walkTo: no path" to it.
- B3F (correct dump): (25,14) sits in a land area x21-28 y6-14 reachable only by SURFING the central water (x14-23 y8-11; e.g.
  surf from (15,7) down, land at (23,9)). pathDir found no path although '~' should be in WALK (surfOK) -> NEXT: log why (is '~'
  in WALK in caves? startSurf works in caves?). Gen 1 B3F/B4F water has scripted CURRENTS unless boulders were pushed down holes
  (STRENGTH) — GUESS from memory, unverified. If currents push us back, the Pallet -> Route 21 -> Cinnabar route is the fallback.
- CAUSE of that "no path" (CONFIRMED in the log): startSurf FAILED at B3F (15,7) facing DOWN, and walkTo then LEARNED the water steps
  (15,7,DOWN), (14..18,12,UP) ... as blocked walls, so pathDir had no route. The surf screen showed VENUSAUR/GEODUDE/GASTLY FAINTED
  (0/187...) - the party was nearly wiped by Seafoam wild battles. NEXT: (1) startSurf reached SURF fine, but the GAME said "No SURFing on AAAAAAAAAA here!" at B3F (14,12) facing UP (and
  (15,12)); grid() marks (14,11) '~'. So that B3F water is NOT surfable from there (Gen 1 IsSurfingAllowed / tile check; maybe the
  current water or an elevation edge). Try entering the water elsewhere (e.g. (15,7) DOWN) and record which tiles the game accepts;
  if none, B3F->(25,14) needs the boulder/current puzzle (STRENGTH) or the Pallet -> Route 21 route; (2) don't turn a failed SURF into a permanent LEARNED_BLOCK (retry
  after closeMenus, cap per tile); (3) heal (Jev heal option) before entering Seafoam - the party was at 2/69 HP.
- (older) NOT SOLVED: test 143307 (from SEAFOAM_1F, 50k fr): Jev picked B2F (5,13) 3x but goWarp FAILED from (2,2)/(12,4)/(11,4) although destOptions
  called it reachable -> check B2F blockedMoves vs the reach calc (maybe reach ignores blockedMoves, or learned blocks). Then read the
  B3F mapdump (now correct) to see whether (5,12) connects to (25,3)/(25,14) without boulders. If B3F needs STRENGTH: teach HM04
  (GEODUDE can learn it) + boulder push, or go Pallet -> Route 21 -> Cinnabar instead.
- Diagnostics kept: "romwarps" (start), "walkTo: no path ..." (Seafoam only), mapdump blockedMoves line.
## Session 20260927-144011 (short, 9 min): surfFails reset per map
- Live run 153754 reached SEAFOAM_ISLANDS_B4F (new floor), so the B3F water was crossed somehow. Live state = B4F.
- FIX: startSurf's surfFails counter only reset on success, so 10 failed SURF attempts (e.g. B3F "No SURFing here") disabled
  SURF for the rest of the process and every later shore step became a LEARNED_BLOCK. Now reset when the map changes.
- Test (live B4F state, 12k fr): no crash, Jev answered 11 questions, stayed on B4F (no progress in that short run).
- NEXT: read a longer B4F run: mapdump for B4F, which ladder leads to B3F east / (25,14) route; heal before Seafoam still open.
## Session 20260927-144511 (short, 9 min): Seafoam B4F is a dead end -> leave, use Pallet/Route 21
- Live run 154059 stuck on B4F: game said "The current is much too fast!" and "No SURFing here" (currents need the STRENGTH boulder
  puzzle). Venusaur also out of damaging PP.
- CHANGE: Seafoam facts now cover B4F (every ladder = "WAY OUT: up; leave Seafoam, go Pallet -> Route 21"); B3F down-ladder marked
  DEAD END; the 6-badge goal says Route 21 from PALLET TOWN is PREFERRED and Seafoam is blocked without STRENGTH.
- Test (live B4F, 12k fr): 10 Jev calls, no crash, went B4F -> B3F.
- NEXT: check the bot actually gets out of Seafoam (B3F -> B2F -> ... -> 1F entrance (4,17) -> Route 20 east) and then
  navigates Fuchsia -> ... -> Pallet -> Route 21 south -> Cinnabar; maybe add "BACKWARDS is now the way out" labels for 1F/B1F/B2F
  when leaving. Heal (restore PP) before long trips is still open.
## Session 20260927-145011 (short, 9 min): Seafoam labels now point OUT (consistent with the Pallet/Route 21 goal)
- CHANGE: 1F/B1F/B2F/B3F ladder facts no longer call going deeper "THE WAY FORWARD"; up-ladders are "WAY OUT", 1F SW exit (x<=5,y>=16)
  is "WAY OUT -> Route 20 east -> Fuchsia -> Pallet -> Route 21". B3F (5,12) is WAY OUT unless (25,14) is reachable (then 25,14 stays
  forward, as do B2F (25,11)/B1F (23,15) pocket labels). ROUTE_20>SEAFOAM_ISLANDS_1F fact now says NOT the way.
- Test (live B3F, 12k fr): no crash, 10 Jev calls, stayed on B3F; no ladder question with the new labels appeared in that short run (UNVERIFIED).
- NEXT: longer test from live state; verify Jev picks B3F (5,12) up and gets out; then Fuchsia -> Pallet (FLY? check) -> Route 21. Heal/PP still open.
## Session 20260927-145511 (DEEP): ROOT CAUSE of the Cinnabar block — Route 20 is NOT walled off; grid() hides surfable coastline
- The 140511 claim "east sea (x>=63) walled off from the western sea by x=62 ridge" was WRONG, and so was every later plan built on it
  (Seafoam as the only link, then "Pallet -> Route 21" detour).
- EVIDENCE (run 151833 run.jsonl lines ~2533-2542): surfing west on row 4 the bot moved (63,4) -> (62,4) -> (61,4) although grid() shows
  (62,4) as '#'. Harness world.ts marks water ONLY for tile 0x14; pokered CollisionCheckOnWater also keeps you surfing over tile 0x32
  ("eastern coastline", any tileset except ship port) and 0x48. Route 20's x=62 column (rows 2-16) is that coastline: '#' in grid(),
  surfable in game. Rows 14-16 are '~' from x=0 to x=61 and x>=63, so the sea route Route 19 -> Route 20 bottom rows -> west edge
  (CINNABAR_ISLAND) exists without Seafoam (Seafoam B3F/B4F needs the STRENGTH boulder puzzle: "The current is much too fast!").
- FIX: bot.js gridX() wraps grid() (all 51 call sites renamed): on outdoor maps a '#' with '~' left AND right becomes '~'. Failed steps
  still become LEARNED_BLOCKS. Facts/goal now say: do NOT enter Seafoam; surf WEST along Route 20 rows 14-16; Seafoam ladders = WAY OUT.
- TEST 145849 (from runs/151833 start = ROUTE_19, 45k fr, 34 Jev calls, no crash): Jev picked edge:west on Route 20 (0.98); the walker
  reached (63,12) but the game REFUSED LEFT into (62,12) (hold LEFT, x stayed 63). So x=62 is NOT uniformly surfable: (62,4) YES
  (live run 151833), (62,12) NO. Rows 14-16 at x=62 were NEVER actually tried (only 2 'press LEFT' at (63,15), likely menu/facing);
  the walkEdge fallback then oscillated UP/DOWN between (63,12)/(63,13) ~250 times instead of trying rows 14-16. UNCONFIRMED: whether
  (62,14..16) is passable. Test from live state (B3F, 30k fr): 24 Jev calls, no crash, reason limit.
- NEXT (do this first, cheap): from runs/20260927-151833-040/start.state.json, walk to (63,14)/(63,15)/(63,16) while surfing and hold
  LEFT on each; log x after. If one passes -> Cinnabar by sea (fix walkEdge to try every row, not oscillate). If none passes, the
  gridX patch should be narrowed to rows where it worked, and the real options are STRENGTH boulder puzzle (teach HM04 to LAPRAS/GEODUDE)
  or the long Pallet -> Route 21 walk. Also fix walkEdge's UP/DOWN oscillation when a LEFT step is refused (learn the block, move on).
## Session 20260927-151512 (short, 9 min): heal option on Route 19/20/Seafoam + narrowed Route 20 rock-as-water
- Live 160055: stuck on ROUTE_20 around (44,11-12) with VENUSAUR 79/187 and 0 damaging PP; Jev was only offered progress/train
  (no healWhere entry for ROUTE_19/ROUTE_20/SEAFOAM_*). The 150511 fixes were NOT applied (never tested), so gridX still made row-12 rock '~'.
- CHANGE: healWhere now has ROUTE_19, ROUTE_20 and all SEAFOAM_ISLANDS_* (-> Fuchsia Pokemon Center); hf regex includes them.
  gridX only treats Route 20 '#'-between-water as water on rows y<=4 (where the bot really passed; (62,12),(63,15),(63,16) refused).
- Test 151547 (live state, 8k fr): no crash, 4 Jev calls (see jev.jsonl there).
- NEXT: verify Jev picks heal and the bot reaches Fuchsia PC; then Fuchsia -> Pallet (Diglett's Cave / Route 11-2?) -> Route 21 south
  -> Cinnabar, or STRENGTH boulder puzzle in Seafoam (HM04 in bag). Goal text still to be aligned with the chosen route.
- Test result detail: Jev picked HEAL (0.81) on Route 20, but the following exit question picked edge:west (1.0) — the exit question's
  facts/goal still push west, not toward Fuchsia during a heal trip. NEXT FIRST: make the Route 20 exit facts say "east = Fuchsia PC" when healTrip is set.
## Session 20260927-152012 (short, 9 min): heal-trip exit facts point to Fuchsia PC
- CHANGE: HEAL_FACTS (checked first in mapFact while healTrip is set): Route 20 east/Route 19 north/Fuchsia PC = "HEAL TRIP: THE WAY TO
  THE POKEMON CENTER"; west/Seafoam/Route 19->20 = away. Dest question goal becomes "HEAL FIRST ... then <stage goal>"; dest cache key includes healTrip.
- Test 152045 (live ROUTE_20, 15k fr): no crash, 6 Jev calls; Jev picked edge:east (0.99) with the heal goal (was west 1.0 before). Did not
  yet reach Fuchsia in the short run (wild battles, Jev RUNs).
- NEXT: verify it reaches FUCHSIA_POKECENTER and heals (healTrip clears at 99% HP+PP), then decide the Cinnabar route: Seafoam STRENGTH
  boulder puzzle (HM04 in bag) or Pallet -> Route 21. Goal text still says Route 20 west rows 14-16, which were refused.
## Session 20260927-152512 (short, 9 min): goal text no longer claims Route 20 rows 14-16 are the way
- Live 161609 ran OLDER code (before the 152012 heal-trip facts): Jev picked heal (0.79) then edge:west (1.0), RAN from every Tentacool.
- CHANGE: 6-badge goal says the Route 20 west sea route is UNCERTAIN (x=62 refused rows 12/15/16); fallback = Fuchsia -> Pallet -> Route 21.
- Test (live ROUTE_20, 15k fr): no crash, 3 Jev calls: heal 0.87, edge:east 1.0 (heal-trip facts work), RUN in wild battle. Did not reach Fuchsia yet.
- NEXT: longer test/live run to confirm FUCHSIA_POKECENTER heal; then commit to one Cinnabar route (Pallet -> Route 21 likely; or STRENGTH boulders).
## Session 20260927-153012 (DEEP): ROOT CAUSE of the Route 20 loop — bot sat in a SEALED pocket; fixed exit via (62,4)
- CONFIRMED by probe bots (scratch, from live state): the Route 20 pocket west of Seafoam (water x=44-54 y=2-12, next to the island
  land x=46-61 y=2-9 with door (48,5) = 1F (4,17)) is SEALED. LEFT is refused at x=43 (rows 2 and 12), DOWN is refused on row 12 at
  every x=44..54, and RIGHT is refused at (54,12). grid() is right that x=43 and row 13 are walls. The bot's only way out is the coast
  tile (62,4) from land (61,4). That tile shows '#' with LAND on its left, so gridX never converted it, and walkEdge east held RIGHT
  at (61,4) ("edge tile blocked beyond") forever. That is why live runs 161609/162118 made no progress.
- Route 20 geography from data (don't relitigate): the western sea (x 0-42 y 2-16, rows 14-16 x 0-61) plus x 56-61 y 12-13 plus
  land (58,10) touch ONLY the door (58,9) = SEAFOAM 1F (26,17)/(27,17). On 1F that exit is in a sealed east-bottom room
  (x 21-27 y 12-16) that can only be reached by the ladder (23,15) <- B1F (23,15) <- B2F (25,11) <- B3F (25,14) side, which needs the
  B3F/B4F current / STRENGTH boulder puzzle. So Cinnabar = Seafoam STRENGTH puzzle OR Pallet -> Route 21. The east sea never
  reaches the west sea directly.
- FIX: gridX marks ROUTE_20 (62,4) as '~', so walkTo uses SURF there. Facts: ROUTE_20>CINNABAR, ROUTE_19>ROUTE_20 and
  ROUTE_20>SEAFOAM now say the west sea is unreachable and the route is PALLET -> Route 21.
- TEST (live state, 40k fr): Jev picked heal (0.73), then edge:east (1.0), SURFed at (61,4), went Route 19 -> FUCHSIA_CITY ->
  FUCHSIA_POKECENTER and HEALED (first heal in these runs). Final test (30k fr, 144 Jev calls): same heal, and it no longer goes back
  into the pocket, but afterwards it bounces between Fuchsia and Route 19 (Jev picks edge:south / edge:north at low confidence).
- NEXT (do this first): Fuchsia facts/goal for the overland trip to PALLET: Fuchsia west -> Route 18 (Cycling Road needs a BICYCLE,
  check the bag) or east -> Route 15 -> 14 -> 13 -> 12 -> Lavender -> Route 10?/8 -> Saffron -> Route 6 -> Vermilion -> Diglett's Cave
  -> Route 2 -> Viridian -> Route 1 -> Pallet -> SURF south down Route 21. Mark FUCHSIA>ROUTE_19 as "not the way (sealed sea)".
  Alternative: the Seafoam STRENGTH puzzle (HM04 in bag; teach it to a party member, add a boulder-push mechanic).
## Session 20260927-154012 (short): overland facts toward PALLET TOWN (the long-listed NEXT step)
- Cause of the Fuchsia <-> Route 19 bounce: SURF_FACTS called FUCHSIA_CITY>ROUTE_19 "THE WAY FORWARD" (surfOK facts win over BADGE6_FACTS).
- CHANGE: SURF_FACTS now say Route 19 is a dead end and give a PALLET_WAY chain: Fuchsia -> Route 15 -> 14 -> 13 -> 12 -> Lavender ->
  Route 8 -> Saffron -> Route 6 -> Vermilion -> Route 11 -> Diglett's Cave -> Route 2 -> Viridian -> Route 1 -> Pallet -> Route 21.
- TEST (live ROUTE_19, 20k fr): no crash; went Route 19 -> Fuchsia -> Route 15/14/13 -> ROUTE_12 (new progress).
- NEXT: watch Lavender -> Route 8 -> Saffron (gate guards/drink should be done) -> Route 6 -> Vermilion -> Diglett's Cave (map name
  keys DIGLETTS_CAVE_ROUTE_11/DIGLETTS_CAVE/DIGLETTS_CAVE_ROUTE_2 may need facts) -> Pallet; the old NEXT/PREV bracket code near line 1561
  (badge-5 "toward Saffron" / "BACKWARDS toward Fuchsia") may add conflicting text on Routes 12-15. Also teach SURF use on Route 21.
## Session 20260927-164512 (short): Route 12 gate facts for badges >= 6 + goal text = Pallet plan only
- Live 164123: bounced inside ROUTE_12_GATE_1F (Jev conf 0.16-0.33 between north/south/2F) because the gate "THE WAY FORWARD: NORTH"
  facts lived inside `if (badgeCount === 5)`. CHANGE: added a `badgeCount >= 6` copy of the ROUTE_12 / ROUTE_12_GATE_1F facts (with PALLET_WAY).
- Goal text (6 badges) no longer offers the Route 19/20 sea; says it is sealed, gives the overland Pallet chain, then surf Route 21.
- TEST (live gate state, 12k fr, no crash, 9 Jev calls): gate north exit 0.95 -> ROUTE_12 north 0.99 -> LAVENDER west 0.95 -> ROUTE_8
  (west 0.68 / east 0.32 - Route 8 lacks strong badge-6 facts; watch for a bounce there).
- NEXT: Route 8 -> Saffron gate (drink/guards) -> Saffron south gate -> Route 6 -> Vermilion -> Route 11 -> Diglett's Cave (check map
  names) -> Route 2 -> Viridian -> Pallet -> SURF Route 21. Other badge-5-only blocks (line ~1575+) may hide gate facts needed at 6 badges.
## Session 20260927-155012 (short): Route 8 facts point WEST through ROUTE_8_GATE to Saffron (badge 6, surfOK)
- Live 164617: on Route 8 Jev picked edge:east 0.93 (old facts: gate "blocks us, go EAST to Lavender"; underground = "THE WAY FORWARD" to Celadon),
  so the bot went back to Lavender / Underground Path WEST_EAST. CHANGE: SURF_FACTS now cover ROUTE_8 gate/Lavender/underground, ROUTE_8_GATE,
  SAFFRON_CITY gates (6 = forward, 5/7/8 = not), ROUTE_6_GATE, Underground Path back toward Route 8, ROUTE_6 tunnel.
- TEST (live ROUTE_8, 8k fr, no crash): Jev now picks door:ROUTE_8_GATE@8,9 (0.63), edge:west (0.78), door:ROUTE_8_GATE@1,9 (0.79);
  east dropped to 0.02-0.04. But the run still ENDED on ROUTE_8: check whether walking into the gate (8,9)/(1,9) actually works
  (the (1,9) door is "other section, no walking path"; (8,9) is reachable) — maybe mechanics fail entering or the gate bounces back.
- NEXT: verify gate traversal -> Saffron -> ROUTE_6_GATE -> Route 6 -> Vermilion -> Route 11 -> Diglett's Cave -> Pallet -> SURF Route 21.
## Session 20260927-155512 (short): side-door entry fix (ROUTE_8 gate)
- Cause of Route 8 stall: walkTo reached the gate door (8,9) and goWarp pushed DOWN; side doors need a push INTO the wall (LEFT here).
- CHANGE: goWarpNoPads, when standing on the warp tile, pushes each direction whose neighbour is '#'.
- TEST (live ROUTE_8, 6k fr): "pushed LEFT from door 8,9 -> ROUTE_8_GATE", then the bot came back out to ROUTE_8 (check which side:
  west exit of the gate puts us at x~1-4, then walk the west edge to SAFFRON). Jev still picks exits/battles.
- NEXT: confirm gate -> west section -> SAFFRON_CITY -> ROUTE_6_GATE -> Vermilion -> Diglett's Cave -> Pallet -> SURF Route 21.
## Session 20260927-160012 (very short): Route 2 facts
- Live reached ROUTE_2 via Diglett's Cave (new). Stuck: edge:south FAILED 2x — walkEdge south tried "edge tiles" (14..19,21) and said
  "blocked beyond"; y=21 is NOT the map's south edge (Route 2 is ~72 tall), so walkEdge seems to target the bottom of the known/visible grid.
  The east strip below Diglett's exit leads south past the trade house (15,19) to ROUTE_2_GATE (16,35)/(15,39) ("no walking path" = likely
  a CUT tree or ledge; cutTreeToward exists). Then Jev bounced north (Pewter, also failed) at conf ~0.22.
- CHANGE: facts ROUTE_2>PEWTER_CITY = not the way, trade house = no progress, Diglett's = backwards.
- NEXT (do first): fix Route 2 south traversal mechanics: inspect grid() rows 20-40 at x 12-19 from live state (probe bot), cut the tree /
  hop the ledge toward ROUTE_2_GATE, then Viridian -> Route 1 -> Pallet -> SURF Route 21.
## Session 20260927-160512 (very short): walkEdge cuts a tree toward the unreachable real edge
- CHANGE: edgeCutTry() in walkEdge: if no edge tile is reachable, or after 3 "blocked beyond" edge tiles, call cutTreeToward on the
  outermost walkable-but-unreachable tile (once per map+side). Aimed at ROUTE_2 south (east strip stops at row 21; gate at rows 35-39).
- TEST (live DIGLETTS_CAVE, 9k fr, no crash, 12 Jev calls): the bot went back toward DIGLETTS_CAVE_ROUTE_11 (Jev's cave exit pick),
  so the Route 2 cut was NOT exercised. Cave facts need: DIGLETTS_CAVE -> the ROUTE_2 side exit = forward, ROUTE_11 side = backwards.
- NEXT: add those Diglett's Cave facts (badge 6), then verify on ROUTE_2 that "walkEdge south: cut a tree toward" appears in the log.
## Session 20260927-161012 (very short): Diglett's Cave facts (badge 6, SURF_FACTS)
- CHANGE: SURF_FACTS for DIGLETTS_CAVE_ROUTE_11 / DIGLETTS_CAVE / DIGLETTS_CAVE_ROUTE_2: Route 2 side = FORWARD, Route 11 side = BACKWARDS.
- TEST (live DIGLETTS_CAVE, 9k fr, no crash, 15 Jev calls): reached ROUTE_2 (Jev picks cave->Route 2 exits). On ROUTE_2 walkEdge south
  again says "(14..19,21) blocked beyond" and NO "cut" line appears in run.jsonl at all -> edgeCutTry never ran (check its trigger
  condition / whether it's reached after the blocked-beyond loop). Then the bot ping-ponged ROUTE_2 <-> DIGLETTS_CAVE_ROUTE_2.
- NEXT (do first): debug edgeCutTry on ROUTE_2 (load a test-run end.state on ROUTE_2), get to ROUTE_2_GATE -> Viridian -> Pallet -> SURF Route 21.
## Session 20260927-161512 (very short): Pewter -> Viridian Forest facts (badge 6, SURF_FACTS)
- Live is now in PEWTER_CITY (the bot went north from the Route 2 east strip, whose south end is blocked).
- CHANGE: SURF_FACTS: PEWTER_CITY>ROUTE_2 = FORWARD via the Viridian Forest; ROUTE_2>VIRIDIAN_FOREST_NORTH_GATE = FORWARD; forest gates/forest
  point SOUTH; VIRIDIAN_FOREST_SOUTH_GATE>ROUTE_2 = FORWARD; Pewter>Route 3 / gym = not the way. ROUTE_2>PEWTER_CITY now says it's only a detour when the strip south is blocked.
- TEST (live PEWTER, 9k fr, no crash): only 1 Jev call (goal: heal 0.57 vs progress 0.43), so the bot spent the run healing in PEWTER_POKECENTER;
  the new exit facts were NOT exercised yet.
- NEXT: check the live run: Pewter south -> Route 2 west -> forest -> Viridian -> Route 1 -> Pallet -> SURF Route 21. If heal keeps winning at full HP, look at the heal option text.
## Session 20260927-162012 (DEEP): ROOT CAUSE of the 3-session stall = PP-blind nurse loop in healAtCenter (FIXED, confirmed)
- EVIDENCE (live 171605, whole run): PEWTER_CITY <-> PEWTER_POKECENTER ~30 times, only 1 Jev call. Party was 100% HP but VENUSAUR
  MEGA DRAIN 0/10 (PP 45%). healAtCenter pressed A only `while hpFrac < 1` -> never talked to the nurse at full HP, logged "healed",
  PP stayed 45% -> goal()'s healTrip is cleared only at HP>=99% AND PP>=99% -> goal() returned 'heal' without asking Jev -> goWarp back
  into the PC -> repeat forever. (The earlier Route 2 "south edge blocked" story was a side issue: the Pewter->forest route works.)
- FIX: healAtCenter talks (>=3 A presses) until HP 100% AND ppFrac >= 0.99; success clears healTrip; a heal that does not restore
  PP/HP counts as a healFail (after 2 fails heal is no longer offered there) and also clears healTrip, so it can't loop.
- CONFIRMED (test from live, 60k fr): healed (HP 100%, PP 100%) -> Jev progress 0.99 -> PEWTER -> ROUTE_2 -> VIRIDIAN_FOREST ->
  VIRIDIAN_CITY -> ROUTE_1 -> PALLET_TOWN -> ROUTE_21 (surf) -> CINNABAR_ISLAND -> POKEMON_MANSION_1F/2F/3F. Jev picks every step.
- FACT (checked in test): ROUTE_21 south edge -> CINNABAR only opens at x<=3 (x=3,y=89 works); x=4..9 on row 89 are "blocked beyond"
  (Cinnabar's top row there is land/wall). walkEdge's edgeBad memory finds it after trying the tiles nearest the player first (slow, ~6 tries).
- SECOND FIX: bag is FULL (20 kinds) -> Mansion item balls say "No more room for items!". The SECRET KEY (Blaine's gym) is an item
  ball in the Mansion (B1F). After a talk whose LAST text is "No more room for items!", tossForRoom(why) runs (Jev picks the item;
  it picked NUGGET), max 6 per session, and the ball is retried. TEST (mansion state): NUGGET tossed, bag 20->19, "found ESCAPE ROPE!".
  (First version checked the last 3 texts and tossed the fresh ESCAPE ROPE too; now only the last text.)
- NEXT: Pokemon Mansion puzzle: the SECRET KEY is on B1F; the doors are toggled by hidden "secret switch" statues (hidden objects,
  NOT in npcs; 2F person 0 says "...close alternating sets of doors!" = a diary). Needs a mechanic: find the switch statues (rom.maps
  hidden objects/signs?), face them, press A, answer YES; Jev picks which switch/stairs. Then Blaine (Fire): Lapras SURF / Geodude.
  Also consider selling junk at a Mart instead of tossing.
- tossForRoom now closes the text box, retries START twice and logs "toss: no ITEM row in START menu" (one live-state test on 3F
  had 4 silent toss failures right after "No more room for items"; the retry version worked on 1F, the 3F case NOT re-tested yet).
- Long test from live reached storyEvents 206 (live 204), pokedexSeen 98 (95). Harness segfaults AFTER printing the summary: ignore.
## Session 20260927-163012 (DEEP): restart-inside-forest gate bounce FIXED (confirmed) + Mansion secret-switch mechanic (partly tested)
- ROOT CAUSE (seen in test 163032, from live VIRIDIAN_FOREST state): a bot (re)started INSIDE the forest has no lastOutdoor/prevMap, so
  VIRIDIAN_FOREST_SOUTH_GATE's south doors (ROM destMap 255) were labelled "the previous map"; no facts matched, Jev picked
  door:VIRIDIAN_FOREST, bounced forest <-> gate 30+ times. (The pre-restart live run passed only because it had walked in from Route 2.)
- FIX: warpName() first reads the game's own wLastMap (ramLastMap(): rom.maps[read(sym('wLastMap'))[0]]); that's what destMap-255 warps use.
- CONFIRMED (test 163148, live state, 60k fr): gate -> door:ROUTE_2 -> Viridian -> Route 1 -> Pallet -> Route 21 -> Cinnabar -> Mansion 1F/2F/3F.
- MANSION SWITCHES (ROM hidden objects, dumped from the ROM via app/src/game/rom.ts `hidden`, NOT exposed to bots): 1F (2,5), 2F (2,11),
  3F (10,5), B1F (20,3) and (18,25); stand on (x,y+1), face UP, A, YES (default). Hidden items: 1F (8,16), 3F (1,9), B1F (1,9).
- CHANGE: MANSION_SW table + `switch:i` options (Jev picks; text says it toggles doors on all floors, key on B1F, press counts) and
  kind 'mswitch' executor; verified by EVENT_MANSION_SWITCH_ON actually toggling. After a successful press the switch is hidden until we
  leave that floor (test 163316: without that Jev pressed it ~20x in a row, toggling ON/OFF).
- TEST (mansion 2F state, 20k fr): 2F switch -> ON, went down to 1F, pressed 1F switch -> OFF (undoing it!), then left to Cinnabar/PC.
  B1F NOT reached yet. First press attempt per switch logs toggled=false with no text (walk/face not settled?); the retry works.
- NEXT: get to B1F (1F stairs to B1F: check rom warps POKEMON_MANSION_1F -> B1F and which switch state opens the way; the switch facts
  should tell Jev the CURRENT state is shared across floors, so pressing on 1F right after 2F undoes it). Then SECRET KEY item ball on B1F
  (bag full -> tossForRoom), then CINNABAR_GYM (Blaine, Fire). Harness segfaults after the summary: ignore.
## Session 20260927-163513 (very short): Mansion switch state is shared across floors + 1F->B1F stairs fact
- CHANGE: mansionPress.last = {map, on, since[]} set after each successful press; the switch option now tells Jev where the LAST press
  was, what it set, which floors were visited since, and that pressing again RE-CLOSES what that press opened.
  BADGE6_FACTS: POKEMON_MANSION_1F>POKEMON_MANSION_B1F = THE WAY FORWARD (SECRET KEY); 1F>CINNABAR_ISLAND = not the way unless healing.
- TEST (live 1F, 15k fr, no crash, Jev answered): Jev picked door:POKEMON_MANSION_B1F (conf 0.39) but the bot did NOT reach B1F
  (the 1F stairs at ~(21,23) are behind a door in the current switch state = ON); Jev then pressed the 1F switch (ON->OFF,
  first 2 attempts toggled=false again) and went up to 2F/3F. B1F still not reached.
- NEXT (do first): check whether the B1F stairs on 1F are reachable with switch OFF (walk after pressing 1F); if the door option
  for B1F is offered when unreachable, mark it "blocked by a door: press the switch" in its text. Then SECRET KEY on B1F -> CINNABAR_GYM.
## Session 20260927-164013 (very short): Mansion 3F floor-hole option (UNVERIFIED)
- Live bot (173616) wanders Mansion 1F/2F/3F; B1F still not reached (1F B1F stairs are in a section walled off by switch doors).
- CHANGE: on POKEMON_MANSION_3F, `hole:0` (16,14) -> falls to 1F (the B1F-stairs section, per pokered hole coords (16,14),(17,14)->1F,
  (19,14)->2F; from memory, not ROM-checked) and `hole:1` (19,14) -> 2F, offered only if pathDir reaches the tile; executor kind 'mhole'
  walks onto it and logs "mansion hole ... fell=". Jev picks.
- TEST (live 3F, 12k fr, 19 Jev calls, no crash): hole option was NEVER offered (0 'hole:' in jev.jsonl): either pathDir can't reach
  (16,14) with the current switch state or the grid marks hole tiles as walls. Bot went to 1F, Jev picked door:B1F again (unreachable).
- NEXT (do first): load a 3F state, log gridX() rows around (15..20,13..15) and pathDir to (16,14); fix the offer condition (maybe
  ignore walls on the hole tile itself / walk to an adjacent tile then step in). Also dump rom warps/hidden data to confirm hole coords.
## Session 20260927-164513 (very short, ~9 min): 3F hole option also accepts a reachable NEIGHBOUR tile (still not offered)
- CHANGE: hole option offered if the hole tile OR a neighbour (below/left/right/above) is reachable; executor 'mhole' walks to the hole,
  and if the map didn't change walks to the neighbour and presses toward the hole 4x. Logs "mansion hole ... fell=".
- TEST (runs/172846 end.state = 3F, 10k fr, 18 Jev calls, no crash): 0 'hole:' options in jev.jsonl again -> NEITHER the hole nor any
  neighbour is reachable from where the bot is on 3F in the current switch state (or the coords (16,14)/(19,14) are wrong).
  Bot went 3F -> 2F -> 1F. Live bot is on 2F with storyEvents 208.
- NEXT (do first, 4th session in a row on B1F): dump gridX().rows for POKEMON_MANSION_3F to the log once (log(rows.join('\n'))) and
  look at where the holes/walls are; verify hole coords. Alternative: check rom warps for POKEMON_MANSION_1F -> B1F stairs and which
  switch state (ON/OFF) connects them to the 1F entrance, then tell Jev in the switch option "press to open the way to the B1F stairs".
## Session 20260927-165013 (very short, ~9 min): one-time Mansion walk-grid dump per floor
- CHANGE: first time per run on each POKEMON_MANSION_* map, log "MANSION GRID <map> at (x,y) switchLast=..." + numbered gridX() rows.
  No strategy change; Jev still picks goal/exit/switch/hole/battle.
- TEST (runs/172846 end.state = 3F, 6k fr, 13 Jev calls, no crash): dumps appear in run.jsonl, but the printed rows stop at y=12
  (log line looks truncated, or grep -o cut it) so row 14 (hole row) wasn't seen yet. From rows 0-12 on 3F: the bot at (2,16) is in
  the lower-left area; x=14..15 corridor at y=4..13 connects top and bottom middle.
- NEXT (do first): read the full dump with `grep 'MANSION GRID' run.jsonl | python3 -c 'import json,sys;[print(json.loads(l)...)]'`
  (parse JSON instead of grep -o) and check rows 13-27 of 3F around (16..19,14). If the log is truncated, log rows in chunks of 8.
## Session 20260927-165513 (very short, ~9 min): Mansion grid dump now in 8-row chunks (FULL GRIDS READ)
- CHANGE: "MANSION GRID" header + "MGRID <map> rows N+" lines (8 rows each); log lines were truncated at ~500 chars before.
- TEST (runs/175059 start = 2F, 4k fr, no crash, Jev answered): full 2F and 1F grids read. KEY FINDING on 1F:
  the B1F stairs 'D' at (21,23) sit in a section (x=12..28, y=14..26) walled off from the left/main part by row 13 (all # from x=11)
  and column 11. That section IS connected to the RIGHT entrance door at (26,27)/(27,27) via x=24..27 rows 14-26.
  So: to reach B1F, leave to CINNABAR_ISLAND and re-enter the Mansion through its RIGHT front door, not the left one (4..7,27).
- NEXT (do first): in BADGE6_FACTS / the exit option text, tell Jev "B1F stairs are reached via the Mansion's right-hand entrance
  (1F door x=26/27)"; mechanically, when the goal is B1F and pathDir fails from the left section, walk out and enter the right door
  (on Cinnabar, the mansion's right door tile). Then SECRET KEY on B1F -> CINNABAR_GYM.
## Session 20260927-170013 (very short, ~9 min): 1F switch option says "B1F stairs walled off, press THIS switch"
- NOTE: the Cinnabar map has only ONE mansion door, so "re-enter through the right-hand door" (last session's idea) is not possible;
  the 1F right-section is opened by the switch walls (or by falling from 3F holes).
- CHANGE: on POKEMON_MANSION_1F, when door:POKEMON_MANSION_B1F is listed but pathDir(21,23) fails, the switch option text adds
  "IMPORTANT: the B1F stairs at (21,23) are NOT walkable now; pressing THIS 1F switch toggles those walls and opens the path".
- TEST (live 2F state, 10k fr, 15 Jev calls, no crash): bot went 2F -> 1F; Jev saw the new fact and picked switch:0 (p=0.33 vs
  door:B1F 0.26). Did not run long enough to see whether B1F became reachable after the press.
- NEXT: longer test from 1F: after the 1F press, check the MGRID dump / pathDir(21,23); if still walled, the other switch state is
  needed (press on 2F/3F) or use 3F holes. Then SECRET KEY on B1F -> CINNABAR_GYM.
## Session 20260927-170513 (very short, ~9 min): Cinnabar/Mansion-aware badge-6 goal (live bot reached B1F!)
- Live bot is on POKEMON_MANSION_B1F (storyEvents 209). The badge-6 goal text still said "walk overland to Pallet", misleading Jev.
- CHANGE: in goal(), when badges==6 and map is CINNABAR*/POKEMON_MANSION*: bag-aware goal. Without SECRET KEY: "find it on B1F
  (item ball), pick up items, switches toggle walls; if ON B1F don't go back upstairs". With SECRET KEY: leave mansion -> CINNABAR_GYM, BLAINE.
- TEST (live B1F, 8k fr, 9 Jev calls, no crash): storyEvents 209->210, Jev gave door:POKEMON_MANSION_1F only p=0.02, picked talk/progress.
- NEXT: check that B1F item balls are offered as options (SECRET KEY ball; B1F switch may be needed); add B1F exit facts in
  BADGE6_FACTS; then CINNABAR_GYM quiz/Blaine facts.
## Session 20260927-171013 (very short, ~9 min): Mansion switches re-offered when no exit is reachable
- EVIDENCE: live run 180554: SECRET KEY IS IN THE BAG (goal text says so) but on B1F only 'talk:1' (scientist, 13 repeats) was
  offered: no door reachable and the B1F switches were hidden because a switch had just been pressed on that floor.
- CHANGE: in the switch-option block, `noExit` = on a Mansion floor and no door/exit/warp/edge option exists -> switches are offered
  even if just pressed here, and the option text says "NO exit is walkable, pressing a switch is the only way to reopen a path
  (back up to 1F and out to Cinnabar; SECRET KEY already in bag)".
- TEST (live B1F start, 5k fr, 6 Jev calls, no crash): in that state door:1F WAS reachable, so noExit didn't fire; Jev picked switch:0
  over door:POKEMON_MANSION_1F (not ideal with the key in bag). Wild battles: Jev picks RUN.
- NEXT: with SECRET KEY in bag, hide/disfavour Mansion switches when a door to 1F is reachable (tell Jev "take the stairs up");
  then Cinnabar Gym (quiz machines/Blaine facts). Verify noExit path by testing from runs/180554 end state if it exists.
## Session 20260927-171513 (very short, ~9 min): noExit now ignores unwalkable/failing exits
- EVIDENCE: live run 181114 (B1F, key in bag): door:POKEMON_MANSION_1F was listed as an option though NOT walkable; Jev picked it
  ~20x (p~0.83), goWarp failed each time, so the noExit switch fallback never fired (it only checked that a door option existed).
- CHANGE: noExit counts an exit only if its text lacks "NO walking path" and destFail from here < 2.
- TEST (live B1F, 6k fr, 14 Jev calls, no crash): Jev pressed switch:0, bot got B1F -> 1F, picked door:CINNABAR_ISLAND twice, but
  also picked door:POKEMON_MANSION_B1F twice and went back down (BADGE6_FACTS still calls 1F>B1F "THE WAY FORWARD").
- NEXT (do first): make BADGE6_FACTS key-aware: with SECRET KEY in bag, 1F>B1F = "BACKWARDS, key already found",
  1F>CINNABAR_ISLAND = "THE WAY FORWARD to Blaine", B1F>1F = "way out". Then Cinnabar Gym quiz/Blaine.
## Session 20260927-172013 (very short, ~9 min): key-aware Mansion exit facts (KEY_FACTS)
- CHANGE: new KEY_FACTS + checkSecretKey(); mapFact uses them first (before BADGE6_FACTS) when badges==6, on CINNABAR*/MANSION*,
  and SECRET KEY in bag: 1F>B1F / 1F>2F / 2F>3F = BACKWARDS, B1F>1F / 2F>1F / 3F>2F = THE WAY OUT, 1F>CINNABAR_ISLAND and
  CINNABAR_ISLAND>CINNABAR_GYM = THE WAY FORWARD, CINNABAR_ISLAND>POKEMON_MANSION_1F = BACKWARDS.
- TEST (live B1F, 6k fr, 10 jev.jsonl lines, no crash): Jev saw "THE WAY OUT: stairs up to 1F" on B1F; run ended still on B1F
  (short test; exit walkability on B1F still depends on switches).
- NEXT: longer test to confirm the bot leaves the Mansion to CINNABAR_GYM; then Cinnabar Gym quiz machines/Blaine battle facts.
## Session 20260927-172513 (very short, ~9 min): in-gym goal for CINNABAR_GYM
- Live bot reached CINNABAR_GYM (storyEvents 212); the badge-6 Cinnabar goal still said "leave the mansion, enter the gym".
- CHANGE: goal() returns a CINNABAR_GYM-specific goal when st.map==='CINNABAR_GYM' (inside gym, quiz machines open doors, wrong
  answer = trainer battle, reach BLAINE, don't leave unless healing). KEY_FACTS: CINNABAR_GYM>CINNABAR_ISLAND = BACKWARDS.
- TEST (live gym, 8k fr, 11 jev.jsonl lines, no crash): storyEvents 212->214, money +850 (gym trainers beaten), still in gym.
- NEXT: quiz answers are just A-mashed (YES); consider asking Jev yes/no for quiz questions (read text) ; check Blaine battle
  move choice (Fire type: LAPRAS SURF / GEODUDE; VENUSAUR is weak to Fire). Then badge 7 -> Viridian (Giovanni) goal text.
## Session 20260927-173013 (very short, ~9 min): goal after losing to Blaine (key in bag, off Cinnabar)
- EVIDENCE: live run 182555: bot blacked out in CINNABAR_GYM -> PEWTER_CITY, wandered into VIRIDIAN_FOREST; goal text was the old
  "walk overland from Fuchsia ... SECRET KEY not found yet" one (wrong on both counts).
- CHANGE: in stage(), badges==6 && not on CINNABAR*/MANSION* && checkSecretKey() -> goal "we blacked out in Blaine's gym, key in bag,
  go SOUTH Pewter -> Viridian Forest -> Viridian -> Route 1 -> Pallet -> surf Route 21 -> Cinnabar, heal, then Blaine".
- TEST (live Viridian Forest, 6k fr, 9 jev.jsonl lines, no crash): Jev picked south gate / ROUTE_2 / edge:south; ended VIRIDIAN_CITY.
- NEXT: why we lost to Blaine: check the Blaine battle in run 182555 run.jsonl (moves used, switches). Likely VENUSAUR (weak to
  Fire) led and others are Lv15-29. Give Jev switch facts for Blaine (GEODUDE ROCK THROW x2, LAPRAS SURF x2 but Lv15) and consider
  training LAPRAS/GEODUDE before the gym. Quiz machine yes/no -> Jev still pending.
## Session 20260927-173513 (very short, ~9 min): Cinnabar Gym quiz YES/NO -> Jev
- Blaine-loss evidence (run 182555): a HAUNTER (NIGHT SHADE) got trapped by a Gym BURGLAR's PONYTA FIRE SPIN for many turns, then
  the team fainted one by one ("Go!" x6). The live run 183103 is back in CINNABAR_GYM re-reading the gym sign.
- CHANGE: quizAnswer() (before walkTo): on CINNABAR_GYM, when the screen shows YES and NO with a cursor, ask Jev (askChoice YES/NO,
  question = lastTexts + screen rows, cached per question); NO = DOWN then A. Hooked into walkTo's text branch and talkTo's A loop.
- TEST (live gym, 5k fr, 4 jev.jsonl lines, no crash): no quiz box appeared in that short test, so the hook is UNVERIFIED.
- NEXT: verify quiz log lines ("quiz: ... -> YES/NO") in a live run; if the YES/NO box isn't detected, dump screen().rows at a
  machine. Then battle switch facts vs Fire (FIRE SPIN trap: switch to LAPRAS/GEODUDE), train LAPRAS/GEODUDE before Blaine.
## Session 20260927-174013 (very short, ~9 min): Cinnabar Gym quiz machines as Jev options
- EVIDENCE: live run 183633 in CINNABAR_GYM: options were only talk:N/doors (quiz machines are ROM hidden objects), Jev kept
  re-talking beaten trainers/gym guide; quizAnswer() never fired (0 "quiz" lines).
- CHANGE: CINNABAR_QUIZ coords [[15,7],[10,1],[9,7],[9,13],[1,13],[1,7]] (face UP from tile below; from memory of pokered
  hidden_events, verify) -> options quiz:i with facts; act kind 'quiz' walks there, presses A, runs quizAnswer()/A through text.
- TEST (live gym, 8k fr, 6 Jev calls, no crash): Jev picked quiz:0, machine (15,7) reached, storyEvents 220->222, money +3330.
  Log's "story" shows undefined (gstate().storyEvents isn't a field; cosmetic). Re-used quiz:0 several times (cached pick?).
- NEXT: confirm "quiz: ... -> YES/NO" lines appear at machines (whether quizAnswer detects the box); check other machine coords
  reachable after door opens; then Blaine switch facts (Fire: LAPRAS/GEODUDE).
## Session 20260927-174513 (very short, ~9 min): switch options when the lead is WEAK to the enemy's type (Blaine prep)
- EVIDENCE: live run: quiz answers work ("quiz: CATERPIE evolves into BUTTERFREE? -> YES"), Jev now spreads over quiz:0..5.
- CHANGE: battle move question: weakLead = trainer battle && enemy's own type hits our lead x2 (e.g. FIRE vs VENUSAUR). Then
  SWITCH_i options are offered for bench members with a super-effective move (facts: resist multiplier, levels). Struggle-switch
  fallback skipped for weakLead.
- TEST (live gym, 8k fr, 7 jev.jsonl lines, no crash): Jev picked quiz:4/quiz:5 and SWITCH_5 (LAPRAS) once; storyEvents 222 unchanged.
- NEXT: LAPRAS Lv15 is too low to tank Blaine (Lv40s): consider training LAPRAS/GEODUDE (Jev-picked 'train' goal) before Blaine;
  verify "WEAK to this" option text in jev.jsonl vs FIRE; summary's jev "calls" field grep printed empty, count jev.jsonl.
## Session 20260927-175013 (very short, ~9 min): drop exhausted Cinnabar quiz machines
- EVIDENCE: live run 184109: Jev cycled quiz:0..5 (each used 2x, only 2 real quiz prompts), BLAINE (person 0 at 3,3) "no reachable
  side": his room (x1-5,y2-5) is still walled (row 6 '#####'). storyEvents stuck at 222-224.
- CHANGE: quiz options with quizUsed>=3 are no longer offered, so Jev must pick trainers/other options.
- TEST (live gym, 9k fr, 4 jev.jsonl lines, no crash): still cycling machines (count per machine not yet 3 in this short run); unverified.
- NEXT: find which gate blocks Blaine: dump full gridX rows 0-17 in gym; check unbeaten trainers (N at 17,2 / 11,4 ...) and offer
  them to Jev with "unbeaten trainer, beating opens door" facts; also check quiz machine only asks when its gate is still closed.
## Session 20260927-175514 (very short, ~9 min): level/type facts on outleveled switch options (Blaine fight)
- EVIDENCE: live run 185114 reached BLAINE; GASTLY Lv23 fought PONYTA Lv40 with NIGHT SHADE while trapped by FIRE SPIN; Jev kept
  picking NIGHT SHADE (switch options had no facts about the bench member's level gap / type damage taken).
- CHANGE: outLevelFacts(q,b) appended to outLeveled SWITCH_i options: bench types, x-damage taken from enemy type, level gap
  (+15 = "big level advantage, likely wins even vs type disadvantage"), HP%, and "lead caught in a trapping move" if recent text.
- TEST (live gym, 6k fr, jev calls 6, no crash): facts appear ("VENUSAUR ... level +22 ... big level advantage").
- NEXT: check whether Jev now switches to VENUSAUR vs Blaine; VENUSAUR's only listed moves were CUT + MEGA DRAIN (PP 5): its PP
  may be drained -> heal at Cinnabar center before Blaine (Jev heal option with PP facts). GEODUDE/LAPRAS still need training.
## Session 20260927-180014 (very short, ~9 min): badge-7 / badge-8 goals + BADGE7_FACTS
- EVIDENCE: live bot WON badge 7 (Blaine) but was in POKEMON_MANSION_3F; goal text still said "badge 7 from BLAINE".
- CHANGE: stage(): badges===7 goal (Cinnabar/mansion finished, surf Route 21 -> Pallet -> Route 1 -> Viridian Gym, GIOVANNI Ground
  type) and badges>=8 goal (Route 22 -> 23 -> Victory Road -> Indigo, Elite Four). BADGE7_FACTS map-exit facts (mansion/gym backwards,
  Route 21/Pallet/Route 1/Viridian forward), used in mapFact() when badgeCount===7.
- TEST (live 3F, 7k fr, 11 jev.jsonl lines, no crash): MANSION_3F -> 2F -> 1F -> CINNABAR_ISLAND -> ROUTE_21 -> PALLET_TOWN -> REDS_HOUSE_1F.
- NEXT: confirm bot walks Route 1 -> Viridian -> VIRIDIAN_GYM (gym spinner tiles may need mechanics); Giovanni battle facts
  (Ground: VENUSAUR/LAPRAS strong, GEODUDE/HAUNTER weak to his Ground moves). Training LAPRAS/GEODUDE still pending.
## Session 20260927-180514 (very short, ~9 min): Viridian Gym (badge 8) goal / progress / train texts
- EVIDENCE: live run 190112 is IN VIRIDIAN_GYM beating trainers (Dugtrio/Rhyhorn) with VENUSAUR MEGA DRAIN (PP 7 left), but Jev's
  progress option still said "badge 7 is BLAINE" and goal said "heal at Cinnabar, surf Route 21", train text mentioned Koga.
- CHANGE: stage(): badges===7 && map in VIRIDIAN_CITY/GYM/POKECENTER/MART -> gym-specific goal (Giovanni's team, heal at Viridian
  center if lead's strong moves out of PP). opts.progress has badge>=8 and badge 7 (in-gym vs not) branches. opts.train in
  VIRIDIAN_GYM says there is no grass; badge>=7 train text lists Viridian/E4 levels.
- TEST (live gym, 7k fr, 4 Jev calls, no crash): new text shown in all 4 requests; Jev picked progress, talk:0/1/5; story 227->228.
- NEXT: VENUSAUR MEGA DRAIN PP is low: verify Jev picks heal (Viridian center) when PP runs out before Giovanni; Giovanni battle
  facts; after badge 8 check Route 22/23 gates + Victory Road boulders. Training LAPRAS/GEODUDE still pending.
## Session 20260927-181014 (very short, ~9 min): lead PP facts on the GYM LEADER talk option
- EVIDENCE: live run 190602: VENUSAUR MEGA DRAIN at 0/10 PP, using CUT (not very effective) on Rhyhorn; Jev picked talk:0 GIOVANNI
  without knowing the PP state.
- CHANGE: leaderPpFact() (top of bot.js) appended to the gym-leader option: lead's damaging moves with PP, and if all non-NORMAL
  attacks are at 0 PP: "HEAL FIRST (leave the gym, Pokemon Center restores PP)".
- TEST (live gym, 6k fr: 3 Jev calls, then 2.5k fr: 2 calls; no crash from bot; host segfaulted at exit of 2nd test): the warning
  text appears. Not yet seen whether Jev then picks door:VIRIDIAN_CITY -> center.
- NEXT: door:VIRIDIAN_CITY option text still says "gym closed for now" (stale): fix it to say "Pokemon Center heals + restores PP".
  Verify heal trip then Giovanni. Training LAPRAS/GEODUDE still pending (Lv15/22 are useless vs Giovanni).
## Session 20260927-181514 (very short, ~9 min): BADGE8_FACTS map-exit facts (post-Giovanni route to the League)
- EVIDENCE: live is in VIRIDIAN_POKECENTER with 8 badges; exit facts were stale (MAP_FACTS ROUTE_22 "not useful early",
  VIRIDIAN_CITY "gym closed for now").
- CHANGE: BADGE8_FACTS (next to BADGE7_FACTS) used first in mapFact() when badgeCount>=8: Viridian -> ROUTE_22 -> ROUTE_22_GATE ->
  ROUTE_23 -> VICTORY_ROAD_1F -> INDIGO_PLATEAU marked FORWARD; gym/Route 1/Route 2 BACKWARDS; center/mart "only if needed".
- TEST (live, 7k fr, 6 Jev calls, no crash): VIRIDIAN_POKECENTER -> VIRIDIAN_CITY -> ROUTE_22 (new facts shown to Jev).
- NEXT: check the ROUTE_22_GATE / ROUTE_23 badge guards and surf segments; Victory Road STRENGTH boulders (mechanics); add
  VICTORY_ROAD_2F/3F facts once warp names are seen in logs. LAPRAS Lv15 / GEODUDE Lv22 still untrained (weak for Elite Four).
## Session 20260927-182014 (very short, ~9 min): League PP warning on the progress option
- EVIDENCE: live run 191557 on ROUTE_22 fighting the rival (CHARIZARD Lv53): VENUSAUR only had CUT/GROWTH/MEGA DRAIN (PP 4/10),
  "leadCannotDamage"; bench (Gastly/Haunter Lv23-29, Lapras Lv15) far outleveled.
- CHANGE: opts.progress, badges>=8: appends "Ahead: rival Lv53-65, Victory Road, Elite Four Lv53-65" + leaderPpFact() (lead attacks
  with PP; "HEAL FIRST" if strong attacks at 0 PP) so Jev can pick heal instead of pushing on with no PP.
- TEST (live, 5k fr, 5 Jev calls all in the rival battle, no crash): progress option not yet shown in test (battle whole time).
- NEXT (overdue 5+ sessions!): VENUSAUR's moveset is weak (no RAZOR LEAF/SOLAR BEAM): check move-learn prompts are answered by Jev
  (keep strong moves); buy/use TMs? Train LAPRAS/GEODUDE (Lv15/22) before Elite Four; Victory Road STRENGTH boulders.
## Session 20260927-182514 (very short, ~9 min): underleveled warning on keep/switch question
- EVIDENCE: live run 191557 lost to rival CHARIZARD Lv53 on ROUTE_22: Jev switched VENUSAUR out for HAUNTER Lv29, which got
  one-shot by FLAMETHROWER repeatedly. askSwitch() computed `def` (enemy hit multiplier) but never showed it.
- CHANGE: askSwitch() desc now adds "enemy's known moves hit it xN" and, if level gap <= -15, "FAR UNDERLEVELED: likely fainted
  in 1-2 hits".
- TEST (live, 5k fr, 6 Jev calls, no crash): warning shown; Jev picked keep (0.98) instead of switching to Haunter.
- NEXT (overdue 6+ sessions!): VENUSAUR moveset (CUT/GROWTH/MEGA DRAIN only) - teach TM/learn strong moves; heal before the rival
  (PP); train LAPRAS/GEODUDE; Victory Road STRENGTH boulders. Consider the same underleveled warning in the in-battle move/switch list.
## Session 20260927-183014 (very short, ~9 min): move-learn menu fix (live was FROZEN) -> VENUSAUR learned SOLARBEAM
- EVIDENCE: live run 192545: VENUSAUR Lv65 learn prompt; Jev picked forget GROWTH, but moveLearnStep pressed A while waiting for the
  move list -> selected CUT -> "HM techniques can't be deleted!" -> list re-shown without "make room" text -> main loop mashed A forever.
  Also new-move name wasn't parsed ("the new move").
- CHANGE: moveLearnStep(): trigger also on "forgotten|which move|can't be deleted"; waits for the move list (>=3 move names on
  screen) instead of pressing A; only presses YES if the list is not already shown; LV_MOVES fallback name (VENUSAUR 65 = SOLARBEAM)
  + SOLARBEAM fact in the question.
- TEST (live, 5k fr, 5 Jev calls, no crash): Jev forget_1 (0.77) -> "learned SOLARBEAM!"; Jev then picked SOLARBEAM (0.86) vs Rhyhorn.
- NEXT: finish rival on Route 22 / heal; Route 22 gate + Route 23 badge guards; Victory Road STRENGTH boulders; train LAPRAS/GEODUDE.
## Session 20260927-183514 (DEEP): ROOT CAUSE of the Route 22 block = lost rival fight, FIXED by teaching TM10 DOUBLE-EDGE
- ROOT CAUSE (confirmed in logs): NOT a map/navigation problem. Live runs 192049/192545/193121 all reached the rival (ROUTE_22 29,4),
  won 5 of his 6 with VENUSAUR SOLARBEAM, then lost to CHARIZARD Lv53 (FIRE/FLYING, FLAMETHROWER x2 on Venusaur): every Grass move
  is x0.25, CUT (50) was the only neutral attack, bench Lv15-29 is one-shot, bag has NO healing items -> blackout to Viridian
  (money 42517 -> 21258 -> 10629 -> 5314), walk back, repeat. Also `leadCannotDamage` wrongly said "no damaging move" when CUT x1 existed
  (was set whenever weakLead; now only when !hitsLeft).
- FACT (tested): VENUSAUR is "NOT ABLE" to learn HM04 STRENGTH in this ROM (party screen). Use rom.speciesByName(sp).machines (item ids
  the species can learn; exposed by sandbox) + rom.tmMoves[idx] (idx = id-0xC9 for TMs, 50+id-0xC4 for HMs) -> rom.moves[moveId].
  Only GEODUDE (and LAPRAS?) can learn STRENGTH -> Victory Road boulders need one of them to learn HM04 (next step).
- CHANGE: maybeTeachLeadTM(st) (badges>=8, out of battle): lists bag TMs/HMs the lead can really learn (damaging, not known), Jev
  picks teach_<item>/skip (answer cached per bag+moves; menu failures retry up to 6x; first try fails while the rival walks up).
  Menu: START > ITEM > item > USE > (YES) > first Pokemon; loop 45 presses (24 ran out right at "make room" and B answered NO).
  moveLearnStep(): HM moves no longer offered as forget options (Jev picked forget CUT at 0.41); TM case gets its own neutral
  question with coverage facts; since Jev already chose to teach, keep is compared with the SUM of forget probabilities
  (keep 0.34 vs forget 0.66 -> Jev's top forget). helpers.js: askChoiceP() returns probabilities.
- TEST (live state, 60k frames): Jev teach_TM10 -> forgot MEGA DRAIN for DOUBLE-EDGE -> lost once more (TM taught after the 1st
  blackout), rematch: DOUBLE-EDGE on CHARIZARD, Geodude ROCK THROW x2 -> battle-end result "won" -> ROUTE_22 -> ROUTE_22_GATE.
- NEXT: heal (Venusaur fainted in the win) -> ROUTE_22_GATE -> ROUTE_23 badge guards -> VICTORY_ROAD: STRENGTH boulders need HM04 on
  GEODUDE (maybeTeachLeadTM only teaches slot 0; generalise to any member via machines) + a boulder-push mechanic. Buy healing items
  (Viridian Mart only has POTION; Indigo Plateau mart has FULL RESTORE/REVIVE) before the Elite Four.
- TEST 2 (live state, 110k frames, no crash): rival beaten -> ROUTE_22_GATE -> ROUTE_23 (badge guards passed) -> VICTORY_ROAD_1F (NEW maps).
  NEW BLOCK: in VICTORY_ROAD_1F the bot enters at the (8/9,17) door, all forward options fail ("hid 7 option(s) failed 3+x"), Jev picks
  door:ROUTE_23 (conf 1) -> ping-pong ROUTE_23 <-> VICTORY_ROAD_1F ~every 500 frames. Victory Road 1F needs STRENGTH boulder pushing.
  NEXT SESSION (do this, not another patch): (1) teach HM04 STRENGTH to GEODUDE (party slot 1; ROM machines says ABLE; VENUSAUR
  can't) - generalise maybeTeachLeadTM to any slot (press DOWN in the party menu; moveLearnStep currently assumes party()[0]);
  (2) Strength mechanic: use STRENGTH from the party menu (field move) or it is auto-active once used; walk into the boulder sprite
  to push it; the grid() probably treats boulders as NPC/sprites -> read sprites() in VICTORY_ROAD_1F and plan pushes onto the switch.
## Session 20260927-190015 (very short, ~9 min): maybeTeachStrength() - HM04 STRENGTH to GEODUDE
- CHANGE: maybeTeachStrength(st) (badges>=8, out of battle, after maybeTeachSurf in the main loop): finds the party member whose ROM
  machines include HM04 (GEODUDE), Jev picks teach/skip (cached), menu START>ITEM>HM04>USE, waits for the party list to draw, then
  partyCursorTo(li) (the tested SURF helper). Retries up to 3x (first try often fails: "HM04 not found" while the menu is still drawing).
- TEST (live, 4k fr, no crash): Jev "teach" for GEODUDE; party cursor landed on member 1 (GEODUDE). NOT confirmed: the 4k-frame run ended before any "learned" or "teachStrength: try" line appeared. Look for these
  to confirm GEODUDE's moves include STRENGTH.
- NEXT: (1) confirm STRENGTH learned; (2) activate STRENGTH in VICTORY_ROAD (START>POKEMON>GEODUDE>STRENGTH, like startSurf) and build
  a boulder-push mechanic (sprites() boulders, push onto switches); (3) healing items at Indigo Plateau; train LAPRAS/GEODUDE.
## Session 20260927-190515 (very short, ~9 min): STRENGTH activation + boulder push (UNCONFIRMED)
- CONFIRMED (live run 200108): GEODUDE "learned STRENGTH!" via maybeTeachStrength.
- EVIDENCE: live bot in VICTORY_ROAD_1F repeatedly talks to "person 4" (boulder) -> "This requires STRENGTH to move!" and loops.
- CHANGE: startStrength() (START>POKEMON>member knowing STRENGTH>STRENGTH, like startSurf; cached per map in strengthMap) and
  pushBoulder(npc): after a talk whose last text matches /requires STRENGTH/, activate STRENGTH then hold toward the boulder 4x.
- TEST: 15k-frame test (Jev answered, no crash) reached the boulder talk but NO "strength:" log appeared -> first version had an
  `m.hp > 0` filter (party hp field name probably differs) so li<0 silently. Removed filter + added "nobody knows STRENGTH" log;
  5k retest (11 Jev calls, no crash) didn't reach the boulder. NEXT: check run.jsonl for "strength:" lines; if pushBoulder never
  fires, check lastTexts at that point (the talked log shows it truncated but regex should match). Then plan pushes onto the switch.
## Session 20260927-191015 (very short): why pushBoulder never worked
- EVIDENCE (test, live state): pushBoulder IS called (npc 5,15) but startStrength failed: START was pressed while the
  "This requires STRENGTH to move!" text box was still open -> "strength: POKEMON row not found". FIX: pushBoulder now presses B
  until no text box/menu before startStrength; POKEMON row regex loosened to /POK/; extra "strength:" logs.
- NEXT: check "strength: activated" / "strength: pushed" lines; then plan pushes so boulders land on the floor switches (Jev picks
  which boulder/direction, code does the pushing).
- TEST after fix (5k fr, 14 Jev calls, no crash): now gets past the text box, but the submenu search ends on "QUIT" ok=false -> the party pick/field-move submenu step is wrong next (maybe cursor landed on a different START row or the party list had not drawn). Log the screen at that point and fix next.
## Session 20260927-191515 (very short): STRENGTH menu opened the POKeDEX
- EVIDENCE (test from run 200643 end state): "strength: party list open=false | CONTENTS | 001 SEEN| BULBASAUR..." -> the START-menu
  row regex /POK/ matched POKeDEX (first row), so the Pokedex opened, not the party. FIX: row must match /POK/ and not /DEX/.
  Also: waits for "Choose a POK" before partyCursorTo, re-presses A until the STATS submenu shows, logs screen at each step.
- TEST: 4k-frame retest (14 Jev calls, no crash) did not reach the boulder at (5,15) -> fix UNCONFIRMED. NEXT: grep "strength:" in
  live run logs for "submenu open=true" / "activated" / "pushed"; then boulder-switch planning (Jev picks boulder/direction).
## Session 20260927-192015 (DEEP): VICTORY_ROAD_1F ROOT CAUSE + FIX (CONFIRMED: reached VICTORY_ROAD_2F, storyEvents 243->244)
- ROOT CAUSE (confirmed in live run 201632 + tests): startStrength/pushBoulder DID work (live: "strength: activated", boulder
  5,15 -> 5,14), but pushBoulder pushed the boulder the way the bot happened to face: UP into column 5, a dead-end pocket. From (5,14) it
  can't go up again (the game refused) or sideways (walls) -> puzzle unsolvable until the map reloads; bot looped talking to it.
- FACTS (from ROM, not memory): VictoryRoad1FDefaultScript .SwitchCoords bytes "0d 11" = dbmapcoord (y=13, x=17) -> switch at
  (17,13). On switch it replaces block (Y=6, X=4) = tiles (8-9,12-13) -> opens (9,12), joining the column-5 pocket/row 12 to the
  north corridor (cols 10-12). Event EVENT_VICTORY_ROAD_1_BOULDER_ON_SWITCH is saved (survives blackout). Boulder = grid npc index 5.
  Symbol addresses: data/generated.json "sym" (e.g. VictoryRoad1F_Script) + /work/app/roms/red.gb to read script bytes.
- Gen 1 push mechanics (seen in tests): the player does NOT move when pushing; 16-frame holds that start mid-step keep going after
  the player arrives and push an EXTRA tile (test 192800: boulder 16,12 -> 16,11). walkTo() also walks INTO boulders (pushes them).
  STRENGTH switches off on every map change (strengthMap is now reset when st.map changes).
- CHANGE: solveVR1F(st) in the main loop (VICTORY_ROAD_1F, switch event not set): Jev picks the plan once (switch_route vs explore);
  code reads the boulder's position and does the next segment: DOWN 1 -> RIGHT to (9,16) -> from the entrance tile (9,17) (entered
  sideways from 7,17 so the exit warp doesn't fire) UP to (9,14) -> RIGHT to (16,14) -> UP to (16,12) -> RIGHT to (17,12) -> DOWN onto
  (17,13). Off-route boulder -> walk out the entrance to reset it. pushSeg(): one tile at a time, 8-frame holds, checks the sprite,
  no follow step after the last push. walkAvoid(): BFS that treats the boulder/warps as walls. Old pushBoulder disabled on VR 1F.
  "griddump" logs print each VICTORY_ROAD map's grid/npcs/blockedMoves once per run.
- TEST (live state, 30k fr): 8 segments, "switch=true", storyEvents 244, wall opened, Jev door:VICTORY_ROAD_2F. TEST (live, 70k fr,
  69 Jev calls): lost once to the cooltrainer at (3,2) (CHARIZARD Lv42; LIVE VENUSAUR IS AT 16/215 HP and Jev picked "progress"),
  blacked out, walked back (switch stays on) -> VICTORY_ROAD_2F reached (NEW map), then 2F<->1F ping-pong.
- NEXT: (1) VICTORY_ROAD_2F boulder puzzle, same approach. ROM (VictoryRoad2F_Script, y-first): switches at (x=1,y=16) and
  (x=9,y=16); barriers: block Y=4,X=3 = tiles (6-7,8-9) and block Y=7,X=11 = tiles (22-23,14-15). Read 2F grid from "griddump
  VICTORY_ROAD_2F" lines, find the boulder npcs, plan pushes on paper, reuse pushSeg/walkAvoid (generalise vr1Boulder to an index).
  3F: VictoryRoad3F_Script has its own switch + hole. (2) heal before Victory Road: Jev picked progress with the lead at 16/215 HP;
  add HP facts to the progress/heal question.
- 2F DATA (test 193028, arrived at (0,8) from 1F (1,1)): grid npcs index 1-12 at (12,9) (21,13) (19,8) (4,2) (26,3) (11,5) (27,5)
  (18,9) (9,11) (11,0) (4,14) (5,5) - which are boulders: check sprites()/pokered object order (VictoryRoad2F_Object lists trainers,
  items, then boulders). Warps: (0,8)->1F, (23,7)->3F, (29,7/8)->ROUTE_23 side, more in the griddump line. Elevation blocks at
  y7<->8 (x5,6,9-13) and y11<->12 (x16-19...). Barrier (6-7,8-9) sits right next to the 1F arrival point.
## Session 20260927-193515 (very short): heal option on the League road
- ROOT CAUSE of "Jev picked progress at 16/215 HP on VR 1F": healWhere had NO entry for VICTORY_ROAD_1F/2F, ROUTE_23, ROUTE_22(_GATE),
  so opts.heal was never offered. ADDED healWhere texts + heal-trip mechanics (VR2F->1F->ROUTE_23->ROUTE_22_GATE->ROUTE_22->east to
  Viridian, which already heals) and added these maps to the healFails PC regex. Test 8k frames: 8 Jev calls, no crash; heal trip itself
  NOT yet observed (party was healthy). Check live logs for "leagueHeal" / map path back to VIRIDIAN_POKECENTER.
- NEXT (unchanged, do it): VICTORY_ROAD_2F boulder puzzle (see 192015 notes: switches (1,16),(9,16)).
## Session 20260927-194015 (very short, ~9 min): no code change, evidence only
- EVIDENCE (live run 203607): the bot went VR_1F -> VIRIDIAN_CITY -> ROUTE_22 -> GATE -> ROUTE_23 -> VR_1F with no "leagueHeal" log
  (probably a blackout warp, not the heal trip). The 1F switch stays pressed (storyEvents 244). Live runs have NOT reached 2F since then.
- TEST: 6k frames from the live state, 6 Jev calls, no crash, stayed on VR_1F.
- NO "griddump VICTORY_ROAD_2F" line exists in /work/runs (it was only in scratch test 193028), so the next session must get to 2F
  in a test first (for example 30k frames) and grep the griddump.
- NEXT (4th session in a row, DO IT FIRST, use a longer session if possible): VICTORY_ROAD_2F boulder puzzle. Also check why live
  runs stay on 1F after the switch: look at which Jev door picks and walkAvoid failures happen on 1F in run 203607.
## Session 20260927-194515 (~9 min): no code change, evidence only
- EVIDENCE (live run 203607, ended ROUTE_23, storyEvents 245): lead VENUSAUR at 36/218 HP. The heal trip left VR_1F, surfed on
  ROUTE_23, then got stuck at (9,79) surfing: "goWarp ROUTE_22_GATE failed from ROUTE_23 at 9,79" twice, and walkEdge south also
  failed (row 79 is '#' next to the player; the gate warps are at (7-8,139)). Then Jev picked progress/edge:north, so it bounced.
  Also "goWarp ROUTE_23 failed from VICTORY_ROAD_1F at 8,17": pushing LEFT onto the exit tile doesn't warp; it has to press DOWN.
- TEST: 5k frames from the live state, Jev answered "heal (conf 0.48)", no crash.
- NEXT (1) fix the Route 23 heal path south of y=79: log the grid around (9,79), go around the '#', and have walkTo cross
  water/land properly. Also press DOWN on VR_1F exit tiles (8-9,17). (2) VICTORY_ROAD_2F puzzle (5th session deferred; it only
  gets done in a session with enough time).
## Session 20260927-195015 (~9 min): VR_1F exit push fix
- CHANGED goWarpNoPads: when standing on a warp, the "push into wall" loop now also pushes toward OFF-MAP neighbours (previously
  skipped as out of bounds). Targets "goWarp ROUTE_23 failed from VICTORY_ROAD_1F at 8,17" (exit on the bottom edge needs DOWN).
- TEST: 6k frames from live (ROUTE_23), 1 Jev call ("heal", conf 0.51), no crash, stayed on ROUTE_23 (fix not exercised there).
- NEXT (unchanged): (1) Route 23 heal path stuck at (9,79) surfing - log grid around it, route around '#'. (2) VR_2F boulder puzzle.
## Session 20260927-195515 (~9 min): Route 23 heal-path diagnostics
- EVIDENCE (live run 205043): VENUSAUR 36/218. Jev picked heal, and the bot left VR_1F. On ROUTE_23 it surfed to (9,78). Then
  goWarp ROUTE_22_GATE and walkEdge south both failed, Jev picked progress -> door VR_1F, and it ping-ponged (49x "pushed DOWN from door 8,17",
  26x "stepped DOWN to 4,32 to re-enter"). Grid near there (x 0-19): row 79 "~~~...~#", rows 80-82 water only at x0-7, row 83 x1-7,
  rows 84-89 water x4-13 with NPC N at (8,85). So the path south is WEST to x<=7, then down. Below row 90 is not yet known.
- CHANGE: the leagueHeal ROUTE_23 step logs "r23dump" once when it fails (surfing flag, npcs, grid rows 76+). It was not triggered
  in the test.
- TEST: 6k frames from live, 1 Jev call (heal, conf 0.43), no crash.
- NEXT: grep "r23dump" in live runs and find where pathDir breaks between (9,78) and the gate (7-8,139). Suspects: the guard NPCs or
  a land<->water transition, or blockedMoves. Maybe let Jev drop heal after 2 failures (it already does via healFails). Then do the VR_2F puzzle.
## Session 20260927-200016 (DEEP): ROOT CAUSE of the Route 23 heal-trip loop, FIXED + CONFIRMED (heal done, VR_2F reached)
- ROOT CAUSE (confirmed in live run 205616 run.jsonl): NOT Jev and NOT a missing path. While surfing, the bot flipped UP/DOWN between
  (9,78) and (9,79) for minutes. gridX() turns '#' into '~' when BOTH horizontal neighbours are '~' (Route 20 coastline hack). The player's
  own tile reads '@', so with the player at (9,79) the '#' at (8,79) (neighbours '~' and '@') stayed a wall -> path UP; one step up it
  became "water" -> path DOWN. The position changed every step, so walkTo's 10-bump stuck/learn logic never triggered.
  Earlier notes blaming the guard NPCs, water/land transitions or blockedMoves were wrong.
- FIX: gridX(): while surfing (walkState 2), '@' counts as water in the neighbour test, and ROUTE_23 is excluded from the conversion
  (test 200214 bumped every converted '#' there: (8,79), (7,95), (9,103) are real rocks; walkTo learned them after 10 bumps each).
  Real water route south: from (9,78) go west to x=7, down x4-7 to rows 84-91, then x8-13 through rows 92-103, land at (10-15,104), then south to the gate (7-8,139).
- FULL ROUTE_23 GRID: the live "mapdump" is cut off after row 48 by the 20 lines/s log limit. The full dump is in the scratch trick below.
  Tool: a throwaway bot in /work/scratch/dumpbot that logs 20 grid rows per log line (wait(120) first: grid() is STALE right after load/warp).
  Run it with: cd /work/app && node --no-node-snapshot --import tsx src/testrun.ts --frames 400 --seconds 30 --load <state> --bots <dir> --out /work/scratch/test-runs --saves /work/scratch/saves
- TEST (live state, 60k frames, 61 Jev calls): Jev heal -> ROUTE_23 -> GATE -> ROUTE_22 -> VIRIDIAN_POKECENTER "healed (HP 100%, PP 100%)"
  -> back through the gate -> VR_1F -> Jev door:VICTORY_ROAD_2F (0.97) -> VICTORY_ROAD_2F reached, then 2F<->1F ping-pong.
- NEXT (overdue 7+ sessions, the bot is now healthy and at the puzzle, so DO IT): VICTORY_ROAD_2F boulder puzzle (see 192015 notes:
  switches (1,16),(9,16), barriers (6-7,8-9) and (22-23,14-15)). Grep "griddump VICTORY_ROAD_2F" in test 200214 (/work/scratch is
  NOT kept, so re-dump with the dumpbot from a 2F state), plan pushes, and reuse pushSeg/walkAvoid like solveVR1F.
- TEST 2+3 (final code, ROUTE_23 excluded): live state 25k frames: heal trip with ZERO "walkTo: stuck" lines (vs 5 before), healed,
  back to ROUTE_23. From its end state, 12k frames: ROUTE_23 north -> VICTORY_ROAD_1F -> VICTORY_ROAD_2F (0,7), 9 Jev calls, no stuck lines.
## Session 20260927-200516 (DEEP): VICTORY_ROAD_2F switch 1 SOLVED (CONFIRMED: EVENT_VICTORY_ROAD_2_BOULDER_ON_SWITCH1 set in test)
- ROOT CAUSE of the 2F<->1F ping-pong: no mechanic existed for the 2F boulder switches. Arrival from 1F is (0,8); the region is closed
  by the wall x=7 rows 8-9 (block tiles 6-7,8-9) that opens only with a boulder on switch (1,16). The Route 23 exit pocket (25-28,7-9,
  warps 29,7/29,8) is walled off and only reachable from the 3F ladder (27,7). So the route is: switch1 -> east -> 3F ladder (23,7)
  -> 3F puzzle -> back down via 3F to 2F (27,7) -> exit east. Switch2 (9,16) likely needs the boulder that 3F drops (guess).
- FULL 2F GRID (x 0-29), boulders = npc index 11 (4,14) and 12 (5,5):
   0:##.........N..#..............#   9:....#..#....N..#..N.....#....#
   1:#D............#..............#  10:#...#.#######..#........######
   2:#...N#........#..............#  11:#.......#N..#..#..............
   3:#.............#...........N..#  12:##......#...#.........#....#..
   4:#####.###.....#...#######....#  13:##......#...#........N#....#..
   5:#....N#.#..N..#.........#..N.#  14:#...N...#...#..........#.D.#..
   6:........#.....#.........######  15:#.#.....#...###.#####.######..
   7:........#.....#........D#.#D.D  16:#....####.....................
   8:@#..#..#.......#...N....#....D  17:##########....................
- CHANGE: generic solver boulderPlan(g, idx, tx, ty, px, py) (BFS over boulder+player, flood fill for the player, blockedMoves, boulder
  can't enter walls/NPCs/warps) + solveVRBoulder(st) driven by VR_SWITCHES (per-map switch coords/events/what they open). Jev picks
  which boulder->switch pair (options only for pairs the solver proves possible, with push counts + what it opens) or "explore".
  Executes one same-direction segment per call via walkAvoid + pushSeg (vr1Boulder now tracks vrBIdx). rom.mapByName(..).npcs is EMPTY
  for 2F, so boulders fall back to npc index >= 11 (fine on 2F; check for 3F).
- TEST (2F state, 12k frames): Jev push:11:1,16 (0.68); pushes DOWN, LEFT, DOWN, LEFTx2 -> boulder (1,16), switch=true. Then Jev picked
  door:VICTORY_ROAD_1F, came back, tried door 3F@1,1 (unreachable from the west part, goWarp failed), then 3F@23,7 (ran out of frames).
- NEXT: (1) add VICTORY_ROAD_3F to VR_SWITCHES (3F switches from VictoryRoad3F_Script via ROM sym+bytes like the 1F note; events
  EVENT_VICTORY_ROAD_3_BOULDER_ON_SWITCH1/2 exist) and dump 3F grid with the reach2f trick (copy bots, return on the target map after
  wait(150), log rows 6 per line). (2) Add a fact to destOptions on 2F: after switch1, the way on is 3F@23,7 (not 1F / 3F@1,1).
- TEST 2 (from test 1's end state, 9k frames): Jev door:VICTORY_ROAD_3F@23,7 -> VICTORY_ROAD_3F REACHED (new map, never reached before). On 3F Jev picked talk:0 / battles; 3F puzzle not yet handled.
## Session 20260927-201516 (~9 min): VR_3F added to VR_SWITCHES (coords UNVERIFIED)
- CHANGE: VR_SWITCHES.VICTORY_ROAD_3F = switch (3,5) EVENT_..._3_BOULDER_ON_SWITCH1 and hole (23,15) ..._SWITCH2, from memory of
  pokered VictoryRoad3F_Script .SwitchOrHoleCoords. VERIFY against ROM bytes (sym VictoryRoad3F_Script) next session.
- TEST (live state 3F@13,1, 12k frames): 12 Jev calls (progress, door:VICTORY_ROAD_2F, SOLARBEAM, heal). Log: "vrb: no BOULDER in rom
  npcs []" then "vrb: no solvable boulder/switch on VICTORY_ROAD_3F from 13,1" -> the fallback npc index>=11 found no pushable boulder
  that reaches (3,5)/(23,15) from the arrival pocket. Jev then went back to 2F. No crash.
- NEXT: dump the 3F grid + npcs (dumpbot trick above) to find 3F boulder indices and the real switch/hole coords; fix the boulder
  fallback for 3F; add a destOptions fact that 3F is the way on (stop returning to 2F).
## Session 20260927-202016 (~9 min): 3F boulder detection fixed
- 3F sprites (index,x,y,picture): trainers 1-4 (pics 6/7), items 5-6 (61, hidden), BOULDERS = picture 63 at idx 7 (22,3), 8 (13,12),
  9 (24,10), 10 (22,15). Old fallback (index>=11) found none. CHANGE: solveVRBoulder fallback now uses sprites() picture 63.
- TEST (live 3F, 6k frames): Jev picked push:7:3,5 (only solvable pair); pushed UPx2 ok (22,3->22,1), then LEFTx16 segment failed
  (boulder didn't move, ok=false). 3 Jev calls. Switch (3,5)/hole (23,15) still unverified.
- NEXT: debug the long LEFT push on 3F (pushSeg probably needs re-pushing each tile / waiting for strength anim; or a trainer/row-1
  block tile); consider splitting long segments into 1-tile pushes. Boulder 10 at (22,15) is next to hole (23,15): try it.
## Session 20260927-202516 (~9 min): 3F push retries made more forgiving
- Live 212119: pair push:7:3,5 was dropped after 3 failures (try1 0 tiles, try3 partial LEFTx16 stopped at 16,1 (trainer?), try6 LEFTx4 0 tiles)
  -> "no solvable". CHANGE: pushSeg clears strengthMap after a 0-tile push (re-use STRENGTH next try); a failed try only counts if the
  boulder didn't move at all; cap raised 3 -> 5.
- TEST (live 3F, 8k frames, 2 Jev calls): boulder 7 went 22,3 -> 22,1 -> 6,1 -> 6,2 -> 2,2 (LEFTx4 now worked); then DOWNx3 from 2,2
  (ok=false, frames ran out). Remaining plan to switch (3,5): DOWNx3, then RIGHT. Check the next live run's "vrb: try" lines.
- NEXT: confirm switch (3,5) event fires; then the hole (23,15) with boulder 10 at (22,15); then give Jev a fact that 3F is the way on.
## Session 20260927-203016 (~9 min): 3F boulder failure cap now counts CONSECUTIVE zero-move tries only
- Live 212613 (last session's code): boulder 7 went 22,3 -> 22,1 -> 6,1 -> 6,2 -> 5,2 -> 2,2 -> 2,5 (ONE push RIGHT from switch 3,5),
  then try 11 RIGHTx1 failed and the 5-failure cap (5 scattered zero-move tries over the whole plan) dropped the pair -> "no solvable",
  Jev went back to 2F. CHANGE: vrbFail resets to 0 whenever the boulder moves; only consecutive zero-move tries count.
- Also seen live: VENUSAUR out of PP (SOLARBEAM gone, DOUBLE-EDGE PP 1, only CUT left) and HP 8/221 on 2F lower area at (20,13);
  Jev chose heal (0.79) once but then progress. Consider a stronger PP/HP fact in the heal-vs-progress question.
- TEST (212119 end state 3F, 12k frames): boulder positions RESET on map load (back at 22,3), Jev push:7:3,5 (0.7), pushes UP ok,
  LEFTx16 reached 7,1; frames ran out. Jev answered calls, no crash. Leaving 3F resets boulders, so the puzzle must be done in one visit.
- NEXT: confirm switch (3,5) fires in the live log ("vrb: try ... switch=true"); then hole (23,15) with boulder 10 at (22,15).
## Session 20260927-203516 (~9 min): diagnostic only
- Live 212613: boulder 7 reached (2,5) but RIGHTx1 to switch (3,5) failed, then solver "no solvable from 2,3" -> likely (1,5) is a
  wall (player can't stand there) OR switch coord (3,5) is wrong. Story events still rose 248->250 somewhere (check which event).
- CHANGE: "no solvable" log now also dumps grid rows 0-8 cols 0-10 ("vrb: grid ...") so the 3F switch area can be inspected.
- NEXT: read that dump from a live 3F run; verify switch coords via ROM sym VictoryRoad3F_Script; fix plan so the final push is
  possible (solver should reject plans whose push-from tile is not walkable). Also heal-vs-progress with 0 PP still open.
## Session 20260927-205016 (DEEP): 3F boulder drift = walkAvoid stepping on a STALE (mid-step) position
- VERIFIED facts (dumped grid() from live state with the dumpbot trick): 3F switch area rows 0-6 cols 0-7:
  `##D###..` `##..##..` `##......` `#..#.#N.` `#....#..` `#...##..` `..####..` -> (1,5),(2,5),(3,5),(1,3),(1,4) are all floor,
  NO blockedMoves near the switch (only 1,6<->1,7 and the row 1/2 ledge x9-18). So last session's guess "(1,5) is a wall" is WRONG.
- Live 212613 failure at (2,5): the walk to (1,5) was stuck ~6 presses (input lock right after the DOWN pushes), a wild ONIX
  interrupted, and the OLD 5-scattered-failure cap dropped the plan ("no solvable from 2,3"). The consecutive-failure fix (203016) covers that.
- Live 213601 (current code) ROOT CAUSE: after push DOWN at (6,0) the player was locked ~7 presses; then walkAvoid's position reads
  lagged one step (decided from mid-step coords), so it overshot 7,0->8,0, then at real (7,1) pressed LEFT (planned for 8,1) -> (6,1),
  then DOWN -> shoved boulder 6,2 -> 6,3 (off plan; replan is UP from 6,4 again, so it recovers but wastes pushes and can loop).
- CHANGE: settle(): waits until wWalkCounter==0 and wJoyIgnore==0 (read(sym())) before each walkAvoid decision; after a hold, if the
  position didn't change, settle and re-hold (up to 8x) instead of re-planning from a stale tile.
- SECOND FIX (CONFIRMED in test): live state starts IN a wild ONIX battle with the BAG open (cursor TM34). Old code A-spammed
  "This isn't the time to use that!" for 30k frames with 0 Jev calls (test 205253). Battle fallback now presses B on a bag list
  (cursor, no FIGHT, item names/CANCEL). Test 205427 (20k frames): bag closed, Jev answered 3 battle questions (RUN).
- NEW PROBLEM SEEN (test 205427): Jev keeps picking RUN vs ONIX Lv42 but "Can't escape!" x21 while ONIX BINDs; our lead is a
  HAUNTER (ONIX's moves "don't affect" it, but it isn't fighting). NEXT: add a fact to the battle question: RUN already failed N
  times this battle -> fight/switch to VENUSAUR (Grass beats Rock/Ground). Cheap and likely the thing that frees the live bot.
- UNTESTED: settle() in walkAvoid never reached the boulder in a test (the battle ate all frames). NEXT: check the next live run's
  "vr1: push"/"vrb: try" lines: the boulder should no longer be shoved off-plan while walking to the push tile. Remaining 3F plan
  from boulder (6,3): UP from (6,4), LEFTx4 from (7,2), DOWNx3 from (2,1), RIGHT from (1,5) -> switch (3,5). Then hole (23,15).
## Session 20260927-205516 (DEEP): VR 3F block ROOT CAUSE CONFIRMED + FIXED = grid() right after a battle shows switch walls CLOSED
- CONFIRMED (test logs, grid rows dumped): the 3F switch (3,5) WORKS (live 215451 pushed the boulder onto it; storyEvents 250->251). It
  opens 3F (7,10) (row 10 `#...#..#...#` -> `#...#......#`), the only way from the main area into 3F's south half (hole 23,15).
  Boulder 8 at (13,12) + blockedMoves 13,13<->13,14 seal the south half otherwise; boulder 9 (24,10) seals the east pocket.
- ROOT CAUSE: after every battle the game reloads map blocks and the map script re-applies switch tiles only a few frames later.
  grid() read at battle end showed 3F (7,10) and 2F (7,8),(7,9) as '#' again -> boulderPlan found no route -> goal picker walked to
  the 3F (2,0) ladder -> 2F (1,1) closed pocket -> back up -> loop (live 215451 and test 205606 identical, 3F<->2F ping-pong).
- FIX: postBattleSettle() (called from noteBattleEnd): wait until not in battle, then until two grid() reads 20 frames apart agree,
  refresh gridCache. solveVRBoulder retries once after wait(40) when nothing is solvable. Wild-battle interruptions of a push walk no
  longer count as plan failures. On a pressed switch: destCache, goalCache AND healTrip are cleared (Jev re-asked).
- VERIFIED ROUTE (tests 210624/210817/211054, from 3F state): 3F hole push RIGHT from (21,15) -> boulder falls to 2F (23,16) ->
  2F push LEFTx14 to switch (9,16) -> switch=true -> 2F (23,14) opens (row 14 `...............D.#`) -> 2F ladder (25,14) -> 3F east
  pocket (27,15) -> 3F ladder (26,8) -> 2F (27,7) -> exit (29,7)/(29,8) -> Indigo Plateau. storyEvents reached 252-254 (live max 250).
  Warp pairing (pokered order): 3F (23,7)->2F(23,7), (26,8)->2F(27,7), (27,15)->2F(25,14), (2,0)->2F(1,1). rom.maps VR warps are EMPTY.
- Door facts added: vrLadderFact() (2F 25,14 = way forward once switch2 pressed; 3F 26,8 = way to the exit; 3F 2,0 = closed pocket).
  Heal option text on VR 2F/3F now says the Indigo Pokemon Center FORWARD is closer once switch2 is pressed.
- SWITCH RESET: after a blackout the 2F switch1 had to be redone in one test (events 252->250); in another, events stayed 254. Unclear.
- STILL OPEN (the next block): with a weak party (VENUSAUR 0 HP, 3 fainted) Jev picks HEAL (0.89) even with the "forward is closer"
  fact, and the heal trip walks 2F -> 1F -> blacks out to a Lv39-43 trainer -> Viridian -> redo VR. NEXT: make the heal trip on VR
  2F/3F route FORWARD (door 25,14 / 26,8 / exit 29,7) when vrSw2() - find how healTrip picks its door (no Jev door question was asked
  between "jev: heal" and the 2F->1F map change) and give it the forward doors. Also Jev keeps picking RUN vs trapping ONIX (BIND).
- pokered-test segfaults at the END of every run here (after writing summary/logs); results are still usable.
- LAST CHANGE (same session, CONFIRMED): the hard-coded league heal route (VR 2F -> goWarp 1F) is skipped on VR 2F/3F once vrSw2();
  the generic door question decides with the vrLadderFact facts. TEST 211220 (from the pre-hole 3F state, 45k frames, 41 Jev calls):
  hole -> 2F switch2 -> Jev heal -> door 3F@25,14 -> door 2F@26,8 -> ROUTE_23 -> INDIGO_PLATEAU -> LOBBY -> LORELEIS_ROOM. VICTORY ROAD DONE.
- NEXT: in INDIGO_PLATEAU_LOBBY Jev picked progress and walked into LORELEIS_ROOM with a hurt party (VENUSAUR had fainted) WITHOUT
  healing at the lobby nurse. Make the lobby heal happen (pendingHeal/healTrip should carry into INDIGO_PLATEAU_LOBBY: its nurse is a
  Pokemon Center nurse but the map name does not end in _POKECENTER -> healAtCenter never triggers). Then Elite Four battle facts.
## Session 20260927-211516 (DEEP): VR loop ROOT CAUSE = floor switches RESET on leaving the floor; heal trips walked back into walls
- Live 221312 (current code): 1F puzzle solved (vr1 try 9 switch=true), then Jev picked HEAL (0.78) with party HP 99% because
  SOLARBEAM had 0 PP, and the heal text claimed "the 1F boulder switch STAYS pressed" (FALSE). Walked out to Route 23 -> 1F redo.
  Live 215451: same shape, 1F<->ROUTE_23 ping-pong x20 (1F (9,12) wall closed again, goWarp VICTORY_ROAD_2F failed 3x).
- CONFIRMED (test 211737, new log line "vr switches (1F,2F1,2F2,3F1,3F2) on MAP: bits"): on 1F after the push = 10000; on
  arriving at 2F = 00000 -> ENTERING 2F RESETS THE 1F SWITCH (pokered VictoryRoad2F script). After 2F switch1 = 01000, Jev picked
  heal (0.37) -> ladder down to 1F -> ladder side is walled off from the entrance (switch reset) -> "goWarp ROUTE_23 failed" ->
  back up -> 1F<->2F ping-pong. So a backward heal from VR 2F/3F is physically impossible until 2F switch2 opens the forward
  route to the Indigo Plateau Pokemon Center. (Route 23 entry probably also resets 2F/3F switches - pokered Route23 script - GUESS, not logged.)
- CHANGES: heal option NOT offered on VR 2F/3F while !vrSw2() (vrNoBack); VR 1F heal text now says the 1F switch resets when
  leaving 1F and that healing forward at Indigo keeps progress; "vr switches" bits logged every goal question on VR/Route 22/23.
- TEST 211848 (live state, 60k frames, 41 Jev calls): Jev picked PROGRESS after the 1F switch -> 1F -> 2F (switch1 pushed, 01000,
  NO heal detour now) -> 3F switch1 boulder pushed onto (3,5) -> storyEvents 252 (live max 250). Frames ran out on 3F: the hole plan
  push:10:23,15 "RIGHTx1 from boulder 22,15 ok=false" x6, player parked at (11,13) for the last ~360 actions (walk to push tile
  (21,15) fails). NOTE the switch bits on 3F still read 3F1=0 after the (3,5) push (event may be set later / by a different check).
  Saved state near the block: /work/scratch/test-runs/20260927-211848-591/end.state.json (may be gone next session).
- NEXT (the new block): why the walk (11,13)->(21,15) on 3F fails. Previous session (205516) passed it from a pre-hole state, so compare:
  is (7,10) open, is boulder 8 (13,12) in the way (blockedMoves 13,13<->13,14), trainer battles interrupting? Dump grid rows 9-16 there.
## Session 20260927-212516 (DEEP): VR block is PASSED in every test; next block = E4 blackout respawns in VIRIDIAN (lobby nurse never used)
- CONFIRMED (tests 212541/213005/213407 from the live state, 60-70k frames, ~40 s wall each): current code goes 3F switch (3,5) -> 3F hole
  (23,15) -> 2F switch2 (9,16) -> 3F ladder 25,14 -> 26,8 -> 2F exit -> ROUTE_23 -> INDIGO_PLATEAU -> LOBBY -> LORELEIS_ROOM.
  pokered-test runs ~1500 frames/s here: a 70k-frame test takes ~40 s, so test long. Segfault at the end is harmless (summary written).
- CONFIRMED (test 212719 from Lorelei's room): VENUSAUR/HAUNTER NIGHT SHADE beat LORELEI and BRUNO (storyEvents 255). Test 213057 from
  Agatha's room: lost to AGATHA (GOLBAT/GENGAR Lv56; all HAUNTERs + LAPRAS fainted) -> respawned in VIRIDIAN_CITY (last center used),
  i.e. the WHOLE of Victory Road again. Saved states: /work/scratch/lorelei.state.json, /work/scratch/agatha.state.json (may be gone).
- FIX 1 (walkAvoid): the 3F hole walk from (1,5) to push tile (21,15) is ~70 steps; the old 40-step cap cut it (live 222026 try 15 at
  (9,5), no battle) and each cut counted toward the 5-consecutive-failure cap that drops the plan. Now 120 steps, stuck detection
  (same tile 4 decisions -> "walkAvoid stuck"), and a walk that moved (walkMoved) is not a failed plan. The (11,13) "stuck" seen in
  last session's test is a TRAINER at (7,13) seeing us and walking over (text "I'll show you just how good you are!"), not a wall.
- FIX 2 (heal routing, CONFIRMED test 213005): the VR 2F exit lands on Route 23 (x>=10,y<40), a pocket with NO way south; the league
  heal route did goWarp ROUTE_22_GATE / walkEdge south there (failed x5, wandered back into 2F). Now heal from there = walkEdge north,
  INDIGO_PLATEAU heal = goWarp lobby.
- FIX 3 (lobby heal, CONFIRMED test 213317/213407: "lobbyHeal ok=true at 7,7", "healed ... HP 100%, PP 100%"): heal option now exists in
  INDIGO_PLATEAU_LOBBY / INDIGO_PLATEAU (text says it also sets the respawn point). rom.mapByName('INDIGO_PLATEAU_LOBBY').npcs is EMPTY;
  nurse is at (7,5) (pokered), talk from (7,7) facing UP -> healAtCenter(7,7). lobbyHeal always wait()s on failure: a first version
  returned without advancing the game and the harness killed the run ("stuck: 20001 calls without advancing") - never do that.
  Lobby door facts added: LORELEIS_ROOM = forward (Jev then picked it 0.88), INDIGO_PLATEAU = backwards (it had picked the exit 0.45).
- CONFIRMED (test 213524, 170k frames from the live state, 154 Jev calls): lobby heal -> Lorelei won -> Bruno won -> lost to AGATHA ->
  respawned at INDIGO_PLATEAU (not Viridian) -> lobby -> Lorelei again. So E4 losses now cost only money + a walk, and each retry
  gains EXP. The earlier Agatha test state (agatha.state.json) already had VENUSAUR+GEODUDE fainted from Lorelei/Bruno, so that loss
  was decided before Agatha. In 213524 VENUSAUR fainted vs LORELEI (Ice x2 vs Grass); HAUNTERs + LAPRAS carried Lorelei/Bruno.
- NEXT: (1) E4 strength: VENUSAUR should not lead vs LORELEI (Ice); give Jev a switch/lead fact per E4 member (Lorelei Ice -> HAUNTER
  NIGHT SHADE / LAPRAS; Bruno Fighting/Rock -> VENUSAUR; Agatha Ghost/Poison -> VENUSAUR DOUBLE-EDGE can't hit GENGAR). Also train
  the weak members (Lv15-33) - Jev's 'train' option exists. (2) SOLARBEAM PP 0 at the lobby: lobby Mart sells items; consider
  buying REVIVE/HYPER POTION before the E4 (no heal between rooms). (3) Lorelei's room: floor tiles read as '~' water -> bot tries SURF
  there (harmless but wastes time).
## Session 20260927-214016: forced replacement after a faint is now a Jev decision
- CHANGE: askSwitch(forcedFrom) - when the active member faints ("Bring out which"), Jev picks which living member to send
  (options send<i> with attacks x-effectiveness vs enemy, level gap, enemy type hits it xN, underleveled warning). Was: first living slot.
- TEST 20260927-214043-904 (live state LORELEIS_ROOM, 90k frames, 83 Jev calls): 5 "Jev picked replacement" events, all executed correctly
  (sent out member matches). Still ended in LORELEIS_ROOM at storyEvents 252 (did not beat Lorelei within the frames).
- NEXT (still open from last session): lead choice vs E4 (VENUSAUR Grass leads into Lorelei's Ice team) - ask Jev to reorder the
  party in the lobby / before entering each room; buy REVIVE/HYPER POTION at the lobby mart; train weak members (GEODUDE 22, LAPRAS 15).
## Session 20260927-214516: weak-lead switch now also offers fixed-damage (NIGHT SHADE) members
- CHANGE (battle opts, weakLead branch): when the enemy's type hits our lead x2 (e.g. LORELEI Water/Ice vs VENUSAUR), bench members
  were only offered if they had a SUPER-EFFECTIVE move, so HAUNTER (NIGHT SHADE) was never offered and VENUSAUR stayed in. Now members
  with a fixed-damage move with PP that take <=x1 from the enemy's type are offered too (text explains fixed damage = level).
- TEST 20260927-214539-270 (live state BRUNOS_ROOM -> lost, respawned, back to LORELEIS_ROOM, 60k frames, 70 Jev calls): new option shown to Jev.
  Story events 252 at end (E4 not beaten). lorelei.state.json is gone from scratch.
- NEXT: lead choice before each E4 room (reorder party in the lobby / at room entry), buy REVIVE/HYPER POTION at lobby mart,
  train GEODUDE/LAPRAS. Haunters' NIGHT SHADE (~31 dmg) is weak vs Lv55+ E4: training them matters.
## Session 20260927-214848: E4 team facts in Jev's keep/switch question (short session)
- CHANGE: askSwitch voluntary branch ("Will RED change POKeMON?" before each new E4 enemy) now includes eliteFourTeam fact for
  LORELEI/BRUNO/AGATHA/LANCE/CHAMPION rooms (roster, types, what hits what) so Jev can plan who faces the next enemy.
- TEST 20260927-214919-379 (live INDIGO_PLATEAU, 40k frames): 8 Jev questions carried the eliteFourTeam fact; bot beat E4 rooms for money 9909->21195, VENUSAUR Lv73.
- NEXT (overdue, 4 sessions): real lead choice BEFORE the first enemy of each E4 room: reorder party via START>POKEMON>SWITCH in the lobby
  (Jev picks lead vs next room). Buy REVIVE/HYPER POTION at lobby mart. Train GEODUDE/LAPRAS.
## Session 20260927-215348: E4 room lead choice (first turn switch offer) - short session
- CHANGE (pickMove battle opts): e4Lead - on the first battle turn in each E4 room (LORELEI..CHAMPION; tracked in e4LeadAsked Set,
  cleared by lobbyHeal) Jev is offered SWITCH_<i> to every healthy bench member that can hit (types, x taken from enemy, attacks),
  plus ctx.leadChoice with the room roster. Done in-battle instead of a lobby START>POKEMON reorder (simpler, same effect).
- TEST (live BRUNOS_ROOM, 30k frames, 36 Jev calls): beat Bruno (story 254->256), money 15453->21195, ended AGATHAS_ROOM.
  The "battle: e4 lead choice offered" log line did NOT appear - probably the test started mid-battle / weakLead or outLeveled was
  true, or battle turn came before map read. VERIFY next session in run.jsonl (grep 'e4 lead choice'); if never offered, debug.
- NEXT: verify e4Lead fires vs Agatha/Lance; buy REVIVE/HYPER POTION at lobby mart; train GEODUDE/LAPRAS.
## Session 20260927-215848: verification only (no code change, very short session)
- e4Lead check: live run 225454 (first run with e4Lead code) started mid-Bruno battle and entered Agatha's battle; "e4 lead choice"
  never logged and no jev question had ctx leadChoice. Test 215913-363 (live AGATHAS_ROOM, 15k frames, 16 Jev calls): started mid-battle
  vs Agatha (GOLBAT), lost, 0 lead choices. Likely cause: the gate `!weakLead` (Agatha's Poison/Ghost vs...) or the battle was already in
  progress; or pickMove's first-turn path is skipped. NEXT: add a log of (map, kind, outLeveled, weakLead) at the e4Lead line and test
  from INDIGO_PLATEAU (lobby) so a room is entered fresh. Then REVIVE/HYPER POTION at lobby mart; train GEODUDE/LAPRAS.
## Session 20260927-220348: e4Lead VERIFIED working + lead HP in the lead-choice fact (very short session)
- VERIFIED: live run 20260927-225454-962 logged "battle: e4 lead choice offered in BRUNOS_ROOM" (jev #55, ctx leadChoice, SWITCH_1..5 offered).
  BUT the lead VENUSAUR entered Bruno's room at HP 6/235 (no heal between E4 rooms) and Jev picked SOLARBEAM (0.79).
- CHANGE: leadChoice ctx now states the lead's HP and, when HP < 1/3, says it will likely faint and to consider switching.
- TEST (live BRUNOS_ROOM, 8k frames): 10 Jev calls, no crash; lead choice not triggered in that short window (started mid-room).
- NEXT (real E4 blocker): HP carries between E4 rooms. Buy HYPER POTION/REVIVE at the lobby mart (Jev picks what/how many), and
  between rooms (on the walk to the next door) ask Jev whether to use a potion on a low-HP member via START>ITEM. Train GEODUDE/LAPRAS.
## Session 20260927-220848: healing items in battle (very short session)
- CHANGE (battle opts): when the lead is below 40% HP and the bag has POTION/SUPER/HYPER/MAX POTION/FULL RESTORE, Jev is offered
  USE_ETHER with a heal description (reuses the ETHER item flow; etherPlan.heal=true skips the move-pick step). Unverified: no heal item
  may be in the bag, and the option didn't come up in the test.
- TEST 20260927-220922-505 (live LORELEIS_ROOM, 12k frames): 11 Jev calls, no crash, the heal option never came up.
- NEXT: check the bag for heal items. If there are none, have Jev choose what to buy at the INDIGO_PLATEAU_LOBBY mart (HYPER POTION/REVIVE;
  reuse buyBalls' screen-driven BUY flow). Check run.jsonl for "Jev chose HYPER POTION". Train GEODUDE/LAPRAS.
## Session 20260927-221230 (DEEP): ROOT CAUSE of the E4 loop = no healing items, because the BAG IS FULL (20 kinds)
- CONFIRMED (live 225454/230429/230941 battle-end lines): every loop beats LORELEI + BRUNO, arrives in AGATHA's room with VENUSAUR
  (0-25/235) and LAPRAS fainted/low, loses to GOLBAT Lv56 with everyone at 0 HP -> INDIGO_PLATEAU -> lobby -> Lorelei again.
  HP carries between rooms and the only in-battle healing option never fires because the bag holds no potions.
- CONFIRMED (test 221421 from /work/runs/20260927-224633-738/end.state.json = INDIGO_PLATEAU, money 9909): the lobby mart works as a
  screen flow (clerk N (0,5), counter (1,5), stand (2,5) face LEFT: BUY -> list ULTRA BALL, GREAT BALL, FULL RESTORE 3000, MAX POTION 2500,
  FULL HEAL, REVIVE 1500, MAX REPEL -> x05 qty via UP -> "That will be 7500. OK?" YES) BUT the game answers
  "You can't carry any more items": bag() has 20 kinds. So NOTHING can be bought until one item kind is tossed. Bag already has MAX REVIVE x1.
- NEW CODE: maybeLobbyShop (Jev picks buy_REVIVE_xN / buy_MAX_POTION_xN / buy_FULL_RESTORE_xN / skip; Jev picked REVIVE x5) and
  maybeFieldHeal (in E4 rooms, out of battle: Jev picks use_<member>_<item> for members <50% HP / fainted -> START>ITEM>item>USE>member).
  Both hooked before goal() in the main loop; failure caps (shopFailsE4 3, fieldHealFails 4). fieldHeal is UNTESTED (no heal items yet).
- STILL BROKEN (the next step, do it first): tossForRoom (Jev picked TM34) fails at the USE/TOSS submenu: after A on the item,
  curRowText() still reads 'TM34 │' even after waiting 72 frames -> "toss failed". Guess (unverified): in the field bag the submenu
  cursor is not on the row curRowText() reads (the item list's hollow ▷ cursor stays), or A on a TM prompts something else. Fix: log
  screen().rows after that A press (test from 224633 end.state, 8000 frames reaches the lobby in ~30 s) and press DOWN/A by screen text.
  Once the toss works, the same test should show "lobbyShop: REVIVE 0 -> 5" and money drop; then check fieldHeal in Bruno/Agatha rooms.
## Session 20260927-221730 (DEEP): bag toss + lobby Revive purchase FIXED (both CONFIRMED in tests)
- ROOT CAUSE 1 (CONFIRMED, test 221746 screen dumps): in tossForRoom the first press('A',4,24) on the selected item is IGNORED - the
  screen (bag list, ▶TM34, cursor {5,4}) is byte-identical after 96 more frames. It is not a mis-read cursor. A second press('A',10,40)
  opens USE/TOSS (cursor 'USE'). FIX: retry A (10-frame hold) up to 3x until curRowText() shows USE/TOSS. Test 221906: "toss: A retry 1,
  cursor='USE'" -> "toss: bag 20 -> 19". (Earlier live run 211025 tossed CARBOS fine; the missed A is intermittent.)
- ROOT CAUSE 2 (CONFIRMED, test 221906): after the toss, walkTo(2,5) returned but the player ended on (2,4) (a queued UP step), so
  LEFT+A talked to nothing -> "lobbyShop item list not shown". FIX: re-check gstate() x,y == (2,5) and re-walk before facing LEFT.
- CONFIRMED test 221935 (from /work/runs/20260927-224633-738/end.state.json, INDIGO_PLATEAU, 8000 frames): Jev buy_REVIVE_x5 (0.81) ->
  toss TM34 -> "lobbyShop: REVIVE 0 -> 5, money 9909 -> 2409". So the bag now carries 5 REVIVE + 1 MAX REVIVE into the E4.
- Bag contents (20 kinds, mostly TMs/keys): TM34, DOME FOSSIL, TM11, S.S.TICKET, TM28, HM01, TM24, TM39, LIFT KEY, SILPH SCOPE, POKé FLUTE,
  TM06, HM03, HM04, CARD KEY, TM46, TM22, SECRET KEY, MAX REVIVE, TM47. No potions at all -> HP carries between E4 rooms.
- ALSO: maybeFieldHeal's item A press now uses the same retry (A until USE/TOSS shows, then A on USE). UNTESTED in the field: no test
  reached an E4 room out of battle with a fainted member yet.
- TEST 221948 (same INDIGO_PLATEAU state, 45k frames): bought 5 REVIVE, then LOST to LORELEI (JYNX ICE PUNCH swept HAUNTERs/LAPRAS;
  that state's party is Lv72/31/32/31/15) -> lobby -> Lorelei again; money 2409 < 3500 so no re-buy (Revives kept). Did not reach
  Bruno/Agatha, so fieldHeal/Revive use vs Agatha is NOT yet confirmed. Final test 222034 (live AGATHAS_ROOM, 6k frames): 8 Jev calls, no crash.
- NEXT: (1) grep live run.jsonl for "fieldHeal:" after Lorelei/Bruno - confirm Revive use between rooms (HP 0 -> half). (2) In-battle
  REVIVE is not offered (battle heal option is for potions on the lead <40%); add a REVIVE-on-fainted-bench option if field heal is not enough.
  (3) HAUNTERs/LAPRAS are underleveled (Lv31-35 vs Lv53-60): Jev's 'train' option before the E4 is the long-term fix.
## Session 20260927-222230: fieldHeal menu navigation fixed (UNVERIFIED in the field)
- CONFIRMED (live 231603): the bot now reaches AGATHA and even LANCES_ROOM, and Jev picks fieldHeal use_0_MAX_REVIVE, but it failed:
  AGATHAS_ROOM "MAX REVIVE not found in bag" (A on ITEM missed -> UP/DOWN ran on the start menu), LANCES_ROOM "ITEM not found"
  (START pressed while a step was queued, x 22->18, menu never opened). So Revives/MAX REVIVE were never used between rooms.
- FIX in maybeFieldHeal: wait 24 frames, retry START up to 3x until EXIT shows; retry A on ITEM until the cursor leaves the start
  menu; search the item UP then DOWN (30 each), dump bag rows on failure; on failure clear fieldHealAsked[sig] so it is re-asked (cap 4).
- TEST 222258 (from /work/runs/20260927-231230-093/end.state.json, AGATHAS_ROOM, 8k frames): 11 Jev calls, no crash, but fieldHeal
  did not come up (in battle), so the fix is untested.
- NEXT: grep live run.jsonl for "fieldHeal:" lines with HP 0 -> >0. If still failing, read the "fieldHeal bag rows=" dump.
  Then: in-battle REVIVE option for fainted bench; Jev 'train' option for HAUNTERs/LAPRAS (Lv31-35 vs Lv53-62).
## Session 20260927-222730 (short, 9 min): diagnosis only, NO code change
- Live runs 232054/232323 (code WITH the toss A-retry + fieldHeal fixes) never reached the lobby shop or an out-of-battle fieldHeal,
  so both fixes are still unverified live. The "toss failed, cursor='TM34'" + "MAX REVIVE not found" lines in grep are from OLD run 231603.
- Live bag still has 20 kinds incl. TM34, only 1 MAX REVIVE, no Revives (the 5 Revives were only bought in a test). Money 25369 now,
  so the next lobby visit should buy (check for "toss: A retry" / "lobbyShop: REVIVE 0 -> 5" in live logs).
- Test 222754 (live AGATHAS_ROOM, 8k frames): 11 Jev calls, no crash, battle only.
- NEXT (listed 3 sessions now - DO IT next session): Jev 'train' option before the E4 for HAUNTERs/LAPRAS (Lv17-35 vs Lv53-62), and
  in-battle REVIVE for fainted bench members.
## Session 20260927-223230 (short, 9 min): removed the dead 'train' goal option inside E4 rooms
- goal() offered opts.train ("walk in the tall grass here") in LORELEIS/BRUNOS/AGATHAS/LANCES/CHAMPIONS rooms, where there is no
  grass (trainStep returns false). Now not offered there. Test (live LORELEIS_ROOM, 6k frames): 8 Jev calls, no crash.
- STILL NOT DONE (4th session listed): real pre-E4 training for HAUNTERs/LAPRAS. Plan: in INDIGO_PLATEAU/lobby, a Jev option
  "train on Route 23 grass / Victory Road" + a Jev pick of which member LEADS (party reorder via START>POKEMON>SWITCH) so the weak
  member gets EXP; and an in-battle REVIVE option for fainted bench members. Do this first next session (needs a deep session).
## Session 20260927-223730 (DEEP): ROOT CAUSE of "stuck in an E4 room after WINNING" = stale learned walls
- CONFIRMED (live 233308, 225454): on entering an E4 room fresh, Jev picks the exit door first; the door is closed until the member
  is beaten, so walkTo learns LEARNED_BLOCKS (4,1,UP) and (5,1,UP) and destFail[door:AGATHAS_ROOM]. Both are in-memory and never
  cleared, so after beating Bruno (233308 frame 11488360, storyEvents 254->255) the goal question said door:AGATHAS_ROOM "NO walking
  path ... FAILED 1x" and Jev (conf 0.24) bounced between door:LORELEIS_ROOM (closed behind us) and talk:0 until the process reloaded.
  Runs that STARTED mid-battle (no learned blocks) walked to the next room within ~2600 frames after the win (225454, 232323).
  That is why every E4 room needed a reload and the loop looked like "no progress".
- FIX: noteBattleEnd, after a WON trainer battle, deletes LEARNED_BLOCKS and destFail entries for the current map and resets
  destCache/destState (log line "battle won on <map>: forgot N learned blocks/dest failures").
- ALSO CONFIRMED live 233308: fieldHeal works now (MAX REVIVE on VENUSAUR 0 -> 246, REVIVE on LAPRAS 0 -> 37); lobby shop toss+buy works
  (REVIVE 0 -> 5). Jev bought only REVIVEs: VENUSAUR (the only carry) still enters rooms at 40/242 HP (232323 lost to Agatha that way);
  a MAX POTION/FULL RESTORE for the carry may be worth more - consider a fact in the lobby shop question.
- FIX CONFIRMED (test 20260927-224255-802, from /work/runs/20260927-233308-884/start.state.json, 150k frames): lost to Agatha ->
  lobby -> LORELEIS_ROOM entered fresh in the SAME process; Jev tried the closed door first (learned blocks + 2 door dest failures),
  then beat Lorelei at frame 11577024 -> "battle won on LORELEIS_ROOM: forgot 7 learned blocks/dest failures" -> BRUNOS_ROOM at
  11585688. Before the fix this exact situation bounced door<->talk in the room until a reload (live 233308 BRUNOS_ROOM).
- CHANGE 2 (Jev fact): the lobby shop's MAX POTION/FULL RESTORE options now say the top member is our only strong one and usually ends
  E4 fights at LOW HP, and a REVIVE does nothing until it faints. Test 224300 (INDIGO_PLATEAU state, 9909 money): Jev now picked
  buy_MAX_POTION_x3 (before: REVIVE x5 from the same state). fieldHeal uses MAX POTION on members < 50% HP.
- NEXT BLOCKER = AGATHA (test 224255, VENUSAUR entered at 246/246 and still lost): SOLARBEAM PP was 0 (spent on Bruno/Lorelei),
  DOUBLE-EDGE cannot touch Ghosts, MEGA DRAIN not very effective; GENGAR CONFUSE RAY + HYPNOSIS + DREAM EATER (crit, x2) killed
  VENUSAUR in ~4 turns; the Lv35 HAUNTERs only NIGHT SHADE for 35. Ideas: offer Jev an in-battle AWAKENING/FULL HEAL/FULL RESTORE when
  the lead is asleep; buy ETHER/ELIXER? (lobby mart doesn't sell them); save SOLARBEAM PP (tell Jev PP left vs remaining E4 rooms);
  long-term: train HAUNTERs (NIGHT SHADE scales with level) so they can carry vs Agatha.
## Session 20260927-225230 (short, 9 min): USELESS-move blame fix
- Live 234946 (LANCES_ROOM): "Enemy DRAGONITE used BARRIER!" -> "Nothing happened!" got our LICK marked USELESS for the battle.
  battleStep now tracks lastUserEnemy (last "used" line on screen was the enemy's) and only blames our move when it was ours.
- Test 225253 (live LANCES_ROOM, 6k frames): 5 Jev calls, no crash, storyEvents 258 -> 260 (LANCE BEATEN in test). Next: CHAMPIONS_ROOM.
- NEXT: watch live for the Champion fight (rival Lv59-65); the E4 heal/shop steps between rooms still apply. Pre-E4 training for
  HAUNTERs/LAPRAS is still undone (5th listing) - only worth it if the Champion keeps winning.
## Session 20260927-225730 (short, 9 min): in-battle status cure option
- Live 235310 (CHAMPIONS_ROOM, rival fight): EXEGGUTOR HYPNOSIS kept our leads asleep for many turns. pickMove now offers Jev
  USE_ETHER = "Use AWAKENING/FULL HEAL/PARLYZ HEAL/ICE HEAL/FULL RESTORE to cure SLP/PAR/FRZ" when the lead has that status and the
  bag has a matching item (reuses the etherPlan heal flow, heal:true, moveIdx 0). Only if no PP/HP item option was offered.
- Test 225756 (live CHAMPIONS_ROOM, 8k frames): 4 Jev calls, 0 errors, no crash; the new option was NOT exercised (no status seen).
  UNVERIFIED: whether b.player.status strings match /SLP|PAR|FRZ/ and whether the bag has any cure items (lobby shop could buy
  AWAKENING/FULL HEAL - add them to the lobby shop options with a Hypnosis fact if the bag has none).
- STILL NOT DONE (6th listing): training HAUNTERs/LAPRAS. Do it if the Champion keeps winning.
## Session 20260927-230230 (short, 9 min): STRUGGLE PLAN ping-pong fix (Champion EXEGGUTOR)
- Live 235310: vs EXEGGUTOR nobody could damage it (NIGHT SHADE PP 0); the STRUGGLE PLAN switch offered HAUNTER(26 PP) -> HAUNTER(60 PP)
  and back forever, each switch a free enemy hit, PP never burned down. Fix in pickMove: only offer STRUGGLE PLAN switches to members
  with FEWER total PP than the current lead; ctx.strugglePlan tells Jev to burn the lead's own status-move PP.
- Test 230257 (live CHAMPIONS_ROOM, 8k frames): no crash; from the 26-PP HAUNTER no switch was offered and Jev picked CONFUSE RAY.
  Did not see the fight end. NOTE: the "ALREADY USED Nx ... attack instead" fact on status moves may fight the PP-burn plan.
- NEXT: watch whether the Champion is beaten; if not, train HAUNTERs/LAPRAS (7th listing) or buy ETHER-less PP support; Venusaur
  SOLARBEAM PP management across E4 rooms.
## Session 20260927-230731 (short, 9 min): STRUGGLE PLAN ping-pong fix, part 2
- Live 235816 (CHAMPIONS_ROOM, EXEGGUTOR) STILL ping-ponged HAUNTER(26 PP) <-> HAUNTER(60 PP): pl[cur] had no moves (two HAUNTER Lv36
  HP 43 - slot lookup ambiguous), so curTot was 0 and the "fewer PP" filter never applied (also no strugglePlan in state).
  Fix: curTot now comes from b.player.moves (the battle's own lead), falling back to pl[cur].moves.
- Test (live CHAMPIONS_ROOM, 8k frames): 1 Jev call, no crash; state had strugglePlan ("HAUNTER has 1 PP left"), no switch offered,
  Jev picked HYPNOSIS. Fight end not seen. NEXT: confirm the live bot burns PP -> STRUGGLE and beats EXEGGUTOR/the Champion;
  if not, train HAUNTERs/LAPRAS (8th listing) - or give Venusaur a Grass-beating option.
## Session 20260927-231231 (DEEP): ROOT CAUSE of the Champion loop = Venusaur's PP budget, not mechanics
- CONFIRMED (live 233308 -> 235310 -> 235816 -> 000316 -> 000814): no walking/menu block. The bot reaches CHAMPIONS_ROOM and fights.
  It loses because VENUSAUR (the only carry) arrives with SOLARBEAM 0, MEGA DRAIN 0, DOUBLE-EDGE 6 PP: in 233308 it spent SOLARBEAM on
  HITMONCHAN/HITMONLEE/MACHAMP (x1) and GENGAR (x0.5), all 10 MEGA DRAIN on AGATHA's ghosts, DOUBLE-EDGE on LANCE, and used CUT
  (30 PP, never short) ONCE. Champion 235310: DOUBLE-EDGE x3 killed PIDGEOT/ALAKAZAM, then vs RHYDON only DOUBLE-EDGE x0.5/CUT ->
  VENUSAUR fainted; GEODUDE SELFDESTRUCT; HAUNTER NIGHT SHADE (last PP) finished RHYDON; then EXEGGUTOR (Grass/Psychic) is a WALL for
  HAUNTERs (Ghost x0 vs Psychic in Gen 1, NIGHT SHADE PP 0) and EXEGGUTOR's Normal moves can't touch Ghosts either -> a stall that
  spans 3+ live runs (HAUNTERs burn 50+ PP of LICK/HYPNOSIS/CONFUSE RAY, then STRUGGLE recoil kills them). That battle is lost anyway
  (PIDGEOT/GYARADOS/CHARIZARD untouched); the live bot will black out to the lobby and redo the E4.
- The earlier "struggle ping-pong" patches were real but secondary. The Champion is unwinnable with this PP use + this bench.
- FIX: pickMove damaging-move options now carry (1) hitsFact: Gen 1 damage estimate (our stats from party().stats, enemy stats from
  rom base stats at its level, DV 8) -> "~N damage per hit -> about K hits to KO", SOLARBEAM counted as 2 turns; (2) e4PPFact inside
  the E4 rooms: "NO PP restore until the Champion is beaten, R rooms after this one" + for scarce moves the later enemies that NEED
  that type (E4_NEEDS table) and "not super effective here, a high-PP move that KOs in similar hits saves it"; high-PP moves (CUT)
  say "use it and save the scarce moves".
- Bag has TM24 THUNDERBOLT, TM11 BUBBLEBEAM, TM22 SOLARBEAM, TM06, TM28, TM39 SWIFT, TM46, TM47: unused coverage for LAPRAS/HAUNTERs.
- ITERATION (tests from /work/runs/20260927-233308-884/start.state.json; that state's first E4 pass is lost anyway - VENUSAUR is down -
  so judge the SECOND pass after the lobby heal): v1 (type-level needs, long per-option text) -> test 231634: CUT used 6x per pass
  (live: 1x), but Jev spent MEGA DRAIN on LORELEI/BRUNO, reached AGATHA with 1 MEGA DRAIN and lost to her twice (SOLARBEAM charge turns
  wasted by GENGAR/GOLBAT CONFUSE RAY + her switching). v2 -> ppBudget in the battle STATE (one plan line: MEGA DRAIN for AGATHA,
  SOLARBEAM for LORELEI water/ONIX/RHYDON, DOUBLE-EDGE for LANCE/CHAMPION, CUT + NIGHT SHADE free) + short per-move tags
  ("SAVE FOR AGATHA", "this is what SOLARBEAM is for").
- RESULT v2 (test 232051, 300k frames, 260 Jev calls, 0 errors): 2nd pass VENUSAUR reached AGATHA with MEGA DRAIN 10/10, SOLARBEAM 5,
  DOUBLE-EDGE 15/15, CUT 26 (live 233308 reached her with SOLARBEAM 0 and spent all 10 MEGA DRAIN there). HAUNTERs NIGHT SHADE'd
  BRUNO's ONIX/MACHAMP (Normal/Fighting can't touch Ghosts). But VENUSAUR still FAINTED in BRUNO (HITMONCHAN/HITMONLEE) and entered
  AGATHA at 124/249 after a REVIVE -> fainted there on the first turns. 3rd pass: MEGA DRAIN x4 killed a GENGAR, then test hit the
  frame limit inside AGATHAS_ROOM. NOT CONFIRMED: an E4 pass past AGATHA/to the Champion with the new code (tests ended first).
- BUG FIXED (seen in test 232051): moveLearnStep used party()[0] (VENUSAUR) as the learner; a HAUNTER Lv38 learning DREAM EATER in
  battle got a question about VENUSAUR's moves, the "move list not found" path skipped, and A-mashing deleted the HAUNTER's LICK.
  Now in battle the learner is party()[battle().player.slot]; LV_MOVES has HAUNTER/GASTLY:38 DREAM EATER for the name fallback.
- MINOR (not fixed): after fieldHeal the walk to the next door printed "It won't have any effect." 16x (a menu left open / A on the
  bag); no item was consumed, costs a few seconds.
- NEXT: (1) watch live: does VENUSAUR reach the Champion with SOLARBEAM/DOUBLE-EDGE PP left? grep run.jsonl for
  '"by":"VENUSAUR"' ppLeft per room. (2) VENUSAUR faints to BRUNO's HITMONCHAN/HITMONLEE: offer Jev "lead with HAUNTER vs Bruno"
  (Fighting x0 vs Ghost) - the e4 lead choice exists; add the fact that Fighting/Normal moves cannot touch HAUNTER. (3) Teach TM24
  THUNDERBOLT / TM11 BUBBLEBEAM (in the bag) to LAPRAS and train it; the bench is still Lv17-38 vs Lv53-65.
- FINAL TEST (final code, 20260927-232357-315 - NOTE: a parallel 8k-frame live-state test wrote into the SAME dir, its summary.json is
  the short one: CHAMPIONS_ROOM, 3 Jev calls, 0 errors; the E4 test's jev/run lines are mixed in): from 233308 start the FIRST pass
  went LORELEI -> BRUNO (SOLARBEAM on both ONIX, CUT on HITMONCHAN/HITMONLEE/MACHAMP) -> AGATHA (opened with 10/10 MEGA DRAIN, won)
  -> LANCE (won) -> CHAMPIONS_ROOM with DOUBLE-EDGE 10, CUT 18, SOLARBEAM 1 (live 233308/235310 arrived with DOUBLE-EDGE 6,
  SOLARBEAM 0, MEGA DRAIN 0). But VENUSAUR entered the Champion LOW on HP with NO heal items left (that state had 5184 money, so
  the lobby shop bought little; maybeFieldHeal needs items) and PIDGEOT MIRROR MOVE/CUT fainted it on turn 1. Champion NOT beaten.
- CONFIRMED: PP now lasts to the Champion. NOT CONFIRMED: a Champion win. Live has 28548 money -> the lobby shop can buy
  MAX POTION/FULL RESTORE; check the live run's HP entering CHAMPIONS_ROOM. Next lever: HP items for the Lance -> Champion step
  (lobby shop: tell Jev how many E4 rooms the items must cover; buy >= 2 FULL RESTORE/MAX POTION before REVIVEs).
- Final test ended by frame limit: 252 Jev calls, 0 errors, no crash; after the Champion loss it respawned in the lobby, and the next
  pass lost at AGATHA (no heal items/money in that state). The moveLearnStep learner fix was NOT exercised in any test (untested).
## Session 20260927-232731 (DEEP): ROOT CAUSE #2 of the E4 loop = field healing silently switched OFF (mechanics), not strategy
- The 231231 deep session's PP-budget code only reached the live bot in run 20260928-002711 (earlier runs' code/ had no ppBudget);
  it works live (Bruno: SOLARBEAM on ONIX, CUT on the fighters).
- CONFIRMED (test 232833 = unchanged code from the live BRUNOS_ROOM state): after AGATHA, maybeFieldHeal logged
  'ITEM not found' (x2) and 'surf: party cursor y0=5 ... want member 3' / 'y0=11' -> MAX POTION went to LAPRAS / GEODUDE at full HP
  (no effect). That made 4 failures, and fieldHealFails >= 4 was a GLOBAL cap for the whole run, so NO field heal happened after
  LANCE: VENUSAUR entered the CHAMPION at 38/256 and lost at ALAKAZAM; on the next pass it left LORELEI at 59 and BRUNO at 25 HP
  unhealed and lost at AGATHA. Live runs show the same pattern: almost every heal fails once ('ITEM not found') and works on the
  retry (233308, 235310, 000814), so the cap is hit within one E4 pass.
- Cause 1: partyCursorTo found the list top by "UP until the cursor stops moving". A late-registering press made it stop early (y0=3/5/7/11).
  In every correct log line the top was y=1. FIX: absolute target row 1 + 2*member, one press at a time, wait for each to register.
  (Also used by surf/TM/lead-swap code.)
- Cause 2 (first try fails, retry works): logged screens show two cases. (a) cursor null + blank rows = START never opened.
  screen() rows are only the text layer, so blank = plain overworld: the E4 room's post-battle script still holds input right
  after the win. FIX: up to 7 START tries, 90-frame waits after the 2nd. (b) The bag list was still open from the previous use
  (cursor on CANCEL). FIX: if the bag list is already open, go straight to the item search. The ITEM-not-found error now logs
  the cursor and rows.
- fieldHealFails is now counted PER ROOM (reset on map change). The carry (slot 0 / Lv60+) is offered a heal below 75% HP (was 50%:
  VENUSAUR 128/256 before LANCE was never offered).
- RESULT (test 233137, cursor + per-room fixes): after AGATHA MAX POTION VENUSAUR 42->256, HAUNTER 30->90; after LANCE VENUSAUR 72->256;
  entered the CHAMPION at 256/256 and beat PIDGEOT, ALAKAZAM, RHYDON, EXEGGUTOR (old code: lost at ALAKAZAM). Lost at GYARADOS
  (5th of 6): VENUSAUR ran dry (SOLARBEAM 0 from the live state's earlier LORELEI pass, DOUBLE-EDGE 1, CUT 4) and the bag had no
  potions left (4 MAX POTIONs: 1 before BRUNO, 2 after AGATHA incl. one on a HAUNTER, 1 after LANCE). The bench can't finish
  GYARADOS/CHARIZARD (NIGHT SHADE 36-37 dmg, LAPRAS Lv17).
- NEXT (evidence-based): (1) money/items: after a loss the lobby shop bought FULL RESTORE x3. More healing items for VENUSAUR only
  (tell Jev in the fieldHeal question that HAUNTER heals are low-value) would carry it through GYARADOS/CHARIZARD.
  (2) A pass that starts from the lobby with full PP (SOLARBEAM 5 for RHYDON/GYARADOS) should do better than this test did.
  (3) Training the bench (9th listing) is still the long-term fix: LAPRAS Lv17 with TM24 THUNDERBOLT/TM11 BUBBLEBEAM would handle GYARADOS.
- ALSO FIXED (test 233319, the "It won't have any effect." x16 from the 231231 notes): after a successful heal, the "recovered by N!"
  text was still printing when closeMenus saw a clear screen and returned. The bag + START menu stayed open and walkTo's A presses
  used items; isStartMenu did not match because the bag list covers the START menu (about 20k frames lost walking out of LORELEI,
  and Jev then picked door:INDIGO_PLATEAU_LOBBY). FIX: fieldHeal closes until 3 clear reads in a row; walkTo treats a bag list
  (CANCEL + "x N" rows) as a menu and presses B.
- Test 233445 (START retries): REVIVE/MAX POTION after AGATHA each worked, cursor moved correctly both ways (y0=5 -> 1). One
  first-try miss had the bag list still open from the previous use (fixed by the stable close above).
- NOT FIXED (strategy, seen in test 233319): vs AGATHA's last GENGAR, VENUSAUR with only CUT/DOUBLE-EDGE (x0 vs Ghost, facts said
  "x0, expected-damage 0") kept picking CUT 4x. That happens when MEGA DRAIN/SOLARBEAM run dry before GENGAR #2. Idea: drop x0
  moves from the options when any other option exists, and tell Jev in the AGATHA lead choice that HAUNTER NIGHT SHADE (fixed
  37 dmg) is the only other Ghost answer.
- FINAL-CODE TEST 233543 (live BRUNOS_ROOM state): REVIVE after AGATHA first try; after LANCE MAX POTION VENUSAUR 21->256 (2nd try),
  walkTo closed the leftover menu with B (0 "won't have any effect"). Entered the CHAMPION at 256/256 and beat PIDGEOT, ALAKAZAM, RHYDON,
  EXEGGUTOR, then lost at GYARADOS again (same as 233137). So the heal mechanics now take the CHAMPION from 1/6 to 4/6. STILL NOT CHAMPION.
- In that fight VENUSAUR at 64/256 and at 15/256 (vs GYARADOS) was offered the MAX POTION (bag x2) under the key USE_ETHER and Jev picked
  DOUBLE-EDGE/CUT; it fainted and the bench lost. CHANGE: in battle, heal/cure options now use the key HEAL_ITEM (pickMove maps it to the
  same item flow, -4) plus "VENUSAUR is our only strong member (next best LvN); if it faints the bench cannot win" when the gap is >= 20 levels.
- FINAL CODE tests 233735 + 233909 (live BRUNOS_ROOM state, 0 crashes): both reached the CHAMPION and lost at GYARADOS (5th of 6),
  same as 233543. HEAL_ITEM was offered in LANCE's room (VENUSAUR 55-80/256 vs DRAGONITE) and Jev gave it ~0 (OK: the field heal after
  the room costs no turn, and it did heal 55->256). At the CHAMPION the bag had only REVIVE x1 left, so HEAL_ITEM never came up there.
  Remaining first-try misses (bag list still open / START not opening right after a win) are absorbed by the per-room retry budget.
- CONFIRMED BLOCK NOW (3/3 final tests): VENUSAUR alone beats PIDGEOT/ALAKAZAM/RHYDON/EXEGGUTOR using ~150 HP and most of its DOUBLE-EDGE,
  then GYARADOS + CHARIZARD are left and nothing else in the party can hurt them (HAUNTER NIGHT SHADE 37, LAPRAS Lv17 SURF ~5 dmg).
  The 4 lobby MAX POTIONs are all spent between rooms (Jev also spends them on HAUNTERs).
- NEXT (in order): (1) Spend more money on healing items for VENUSAUR: the lobby shop question should say "the Champion needs ~2 heals
  mid-battle for VENUSAUR". In fieldHeal, add a fact to HAUNTER options that HAUNTER heals don't help beat the CHAMPION. (2) Drop x0 moves
  from battle options when another option exists (CUT vs GENGAR). (3) Train LAPRAS (Lv17) and teach it TM24 THUNDERBOLT (in the bag)
  so it can finish GYARADOS; this is the 9th listing, so do it once (1) has been tried.
## Session 20260927-234231 (DEEP): two resource leaks in the E4 loop (DREAM EATER on awake targets, MAX POTIONs on the bench)
- CONTEXT: the 232731 heal-mechanics fixes (75% carry threshold, per-room fail count, cursor fix) first went live in run 20260928-004052
  (002711 still ran the OLD code: `m.hp < 0.5*maxHp`, so VENUSAUR revived to exactly 128/256 was never offered a MAX POTION). Live has
  NOT yet done a full E4 pass with those fixes, so the "Champion 4/6 -> lost at GYARADOS" result from tests is the best evidence.
- Money leak (confirmed in 000814): a blackout halves money (28548 -> 14274); the lobby mart (ULTRA/GREAT BALL, FULL RESTORE 3000,
  MAX POTION 2500, REVIVE 1500; no HYPER POTION) then affords only 4 MAX POTION + 1 REVIVE. Each lost pass makes the next one poorer.
- CONFIRMED live 002711 (jev n=46/48/49, AGATHAS_ROOM after the win): Jev spent 2 MAX POTIONs on HAUNTER Lv38 (32/92; one failed
  'ITEM not found') and VENUSAUR entered LANCE at 128/256, fainted to AERODACTYL, bench lost. The question said "facing: AGATHA" after
  she was beaten, and nothing said VENUSAUR carries the team. FIX: each option now says "OUR ONLY STRONG MEMBER ..." (carry, gap >= 20
  levels) or "Bench member: cannot beat the Lv53-65 teams; an item here is one fewer for VENUSAUR"; state has thisRoom,
  nextRoomAfterThisOneIsWon, roomsLeftIncludingThis instead of the misleading "facing".
- CONFIRMED live 004052 (LANCES_ROOM vs DRAGONITE, jev n=5..18): HAUNTER used DREAM EATER 14x on an AWAKE DRAGONITE ("attack missed!"
  every time). DREAM EATER (power 100) counted in hitsLeft, so no SWITCH was offered and it was the ONLY option. Gen 1 DREAM EATER only
  hits a SLEEPING target (battle().enemy.status is 'SLEEP' from src/game/state.ts). FIX in pickMove: hitsLeft ignores DREAM EATER unless
  the enemy is asleep; the option is labelled FAILS and dropped when anything else is offered.
- TESTS (final code): 234446 (live LANCES_ROOM state): HAUNTERs NIGHT SHADE'd DRAGONITE, LANCE won, CHAMPION lost at once (VENUSAUR
  already fainted in the live state) -> blackout -> lobby -> LORELEI, SOLARBEAM on her Water mons. DREAM EATER had 0 PP in this state,
  so the DREAM EATER fix was NOT exercised in a test (untested; logic only). 234449 (from 002711 start, BRUNOS_ROOM): after AGATHA,
  the SAME situation as live 002711 (VENUSAUR 128/256): Jev now picked use_0_MAX_POTION -> VENUSAUR 128 -> 256 (live gave it to HAUNTER).
  CONFIRMED: the carry gets the potion. NOT CONFIRMED: a Champion win (tests ended before a full pass).
- NEXT: (1) watch live for a full E4 pass with the 232731 + this session's code; grep 'fieldHeal: Jev' and HP entering CHAMPIONS_ROOM.
  (2) Money: each blackout halves it; the lobby shop should keep buying for VENUSAUR only. (3) If the Champion still wins at GYARADOS/
  CHARIZARD: teach TM24 THUNDERBOLT (in bag) to LAPRAS and train the bench outside the E4 (10th listing - do it next if (1) fails).
## Session 20260927-234731 (DEEP): bench TM teaching (the 10x-deferred "TM24 THUNDERBOLT" step, done)
- ROOT CAUSE of the E4 loop (re-confirmed from live 002711 -> 004052): nothing physical blocks the bot. VENUSAUR Lv79 is the only
  member that can damage the League teams; once it faints (002711: in LANCE's room, no REVIVE left, only MAX POTIONs, so fieldHeal had
  no legal option and was silent) the bench is HAUNTER NIGHT SHADE 37 + LAPRAS SURF ~5 and the CHAMPION/LANCE win. Every loss halves money.
- The bag had TMs nobody was using (from ROM machine lists): TM24 THUNDERBOLT (all 3 HAUNTERs + LAPRAS), TM47 EXPLOSION (GEODUDE,
  HAUNTERs), TM28 DIG (GEODUDE), TM11 BUBBLEBEAM / TM22 SOLARBEAM / HM04 STRENGTH (LAPRAS). maybeTeachLeadTM only ever looked at party[0].
- CHANGE: maybeTeachLeadTM now builds (member, machine) options for every party member (bench only inside the League/Indigo), each with
  type, power, STAB and effectiveness vs CHAMPION GYARADOS/CHARIZARD/PIDGEOT and Flying; Jev picks the pair (or skip). Mechanics: after USE
  the TM party list shows ABLE/NOT ABLE per member (member i = cursor row 1+2i), partyCursorTo(slot) then A. moveLearnStep uses
  pendingTmTarget so the forget question lists the LEARNER's moves. NIGHT SHADE/SEISMIC TOSS etc. are now labelled as fixed-damage attacks
  (they have power 0 in ROM and were offered as "status move (no direct damage)"); DREAM EATER is labelled sleeping-target-only.
- CONFIRMED test 235009 (live LORELEIS_ROOM state): Jev picked teach_TM24_to_2, cursor went to slot 2 (y=5), "HAUNTER learned THUNDERBOLT!"
  (forgot CONFUSE RAY). Only 1 TM24 in the bag.
- Test 235058 (first version, all machines offered): Jev taught 5 TMs in a row and wrecked movesets (LAPRAS THUNDERBOLT -> replaced by
  SOLARBEAM; a HAUNTER forgot NIGHT SHADE). FIX: bench options only for attacks power>=60 that are x2+ vs GYARADOS or CHARIZARD
  (THUNDERBOLT, BUBBLEBEAM); a bench learner's forget options exclude NIGHT SHADE/THUNDERBOLT/SURF/BUBBLEBEAM and power>=60 moves.
  In the same test from LANCE's state a HAUNTER used THUNDERBOLT 2x on the CHAMPION's PIDGEOT (so battle code offers it).
- FINAL test 235412 (live state, 40k frames): HAUNTER Lv38 learned THUNDERBOLT (forgot DREAM EATER), LAPRAS learned BUBBLEBEAM (forgot
  WATER GUN), then no more teaching; LORELEI and BRUNO beaten; 33 Jev calls. NOT CONFIRMED: a Champion win (test ended at AGATHA).
- NEXT: (1) watch the live Champion fight: does the THUNDERBOLT HAUNTER get sent in vs GYARADOS (lead/switch facts should show x4)?
  (2) Venusaur fainting with only MAX POTIONs left gets no fieldHeal option: have the lobby shop keep >=1 REVIVE. (3) Training the bench
  outside the League is still the long-term fix (bench Lv17-38 vs Lv53-65).
## Session 20260927-235731 (DEEP): lobby shop never kept a REVIVE (resource leak that ends passes at LANCE -> CHAMPION)
- DIAGNOSIS (live logs, nothing physical blocks the map): 004542 = Champion fight started with VENUSAUR already fainted (from 004052:
  battle-end vs LANCE's DRAGONITE 'won' with VENUSAUR 0/256) -> bench NIGHT SHADE vs PIDGEOT -> lost at ALAKAZAM -> blackout, money
  26138 -> 13069. 002711 had the same end (fainted vs LANCE, no REVIVE). The lobby shop kept 2000 back and needed 3500 to open, so
  13069 bought MAX POTION x4 and NOTHING else: a fainted carry then has no fieldHeal option (MAX POTION can't revive).
- LORELEI alone took VENUSAUR 256 -> 4 in 004542 (AURORA BEAM crit, BLIZZARD); it wins by SOLARBEAM but the HP cost is ~1 MAX POTION/room.
- CHANGE (maybeLobbyShop): opens at money >= 1500 (was 3500), no 2000 reserve; MAX POTION/FULL RESTORE offered as xN and x(N-1) with
  "Leaves X: enough / NOT enough for 1 REVIVE" when the bag has none; REVIVE offered as x1 only with the live 002711/004052 evidence;
  fallback = REVIVE when none, else MAX POTION; the stale 'why' (Lv74, "no healing items") rewritten.
- Test 235934 (first version, REVIVE up to x5): Jev bought REVIVE x5 (7500) -> hence REVIVE x1 only. Check the second test below.
- Test 20260928-000000-306 (final code, from live 004542 start.state = CHAMPION fight with VENUSAUR fainted): lost -> lobby, money 13069.
  Jev: buy_REVIVE_x1 -> buy_MAX_POTION_x3 -> buy_MAX_POTION_x1 -> skip. Bag MAX POTION x6 + REVIVE x1 (live 004542 same money: x6, no
  REVIVE). Then entered LORELEI. CONFIRMED: shop mechanics + the reserve REVIVE. NOT CONFIRMED: a Champion win (test ended in the E4;
  the REVIVE-after-LANCE case was not reached in a test).
- NEXT: (1) watch live: grep 'lobbyShop: Jev' and 'fieldHeal: Jev chose use_0_REVIVE'; does VENUSAUR enter the CHAMPION alive?
  (2) Money spiral: every loss halves money; after a Champion loss the shop can afford ~5 items. (3) Long-term (11th listing): train the
  bench outside the League (Victory Road Lv40s) - the Champion's GYARADOS/CHARIZARD beat VENUSAUR-alone runs even at full HP (tests 233543+).
- Same test: VENUSAUR fainted in LORELEI's room; fieldHeal used the reserve REVIVE (member 0 HP 0 -> 128), then Jev picked MAX POTION (first try 'ITEM not found', per-room retry). CONFIRMED: the REVIVE reserve rescues a fainted carry between rooms (live would have had no option).
## Session 20260928-000231 (DEEP): VENUSAUR fights the late E4 rooms PARALYZED; nothing could cure it
- CONFIRMED (live 005451 run.jsonl fieldHeal screens "AAAAAAAAAA 80 PAR ... 76/259" and "fully paralyzed!" at frame 12070488; test
  20260928-000439-554 from the live state: "MAX POTION on member 0 HP 181 -> 263 status PARALYZED -> PARALYZED", then CHAMPIONS_ROOM):
  VENUSAUR won AGATHA's room paralyzed and went into LANCE and the CHAMPION still PAR (speed x1/4 = every enemy moves first, 1 turn in 4 lost).
  Causes: healItems() only listed HP items, maybeFieldHeal only offered members below an HP threshold, and the lobby shop (LOBBY_MART)
  never offered FULL HEAL (600), so the bag never had a cure. Status only goes away at the lobby nurse.
- CHANGE: healItems also lists FULL HEAL/PARLYZ HEAL/AWAKENING/ICE HEAL/BURN HEAL/ANTIDOTE; maybeFieldHeal offers a member whose party
  status isn't 'OK' (src/game/state.ts: SLEEP/POISON/BURN/FREEZE/PARALYZED); cure-only items are offered only if they cure that status,
  HP items only below the HP threshold (FULL RESTORE also when it cures); option text states the status and what it costs; success = HP
  up OR status cleared. LOBBY_MART gains FULL HEAL (x1 offer, with the PAR fact). Jev decides whether to buy/use it.
- Bench training outside the League (deferred 11+ sessions) was NOT done this session either: it needs a lead swap to a bench member,
  a walk INDIGO_PLATEAU -> ROUTE_23 -> VICTORY_ROAD_2F, pacing in the cave (trainStep only looks for ',' grass tiles; caves have none) and
  a return to the lobby nurse. That is too many untested mechanics for one 30-min session with a test; do it as a whole session next.
- TESTS: 000439 (live LANCES_ROOM state, 45k frames): 0 crashes; VENUSAUR PAR the whole way; no cure item in the bag, so no cure option
  (correct); MAX POTION log now shows status; reached the CHAMPION, beat up to EXEGGUTOR, frame limit hit vs GYARADOS (not a win).
  000522 / 000550 (from 004542 start, loss -> lobby): FULL HEAL x1 IS offered, but Jev gave it 0-0.01 (bought REVIVE, MAX POTIONs) even
  with the evidence text. NOT CONFIRMED: a FULL HEAL bought or used. The cure-in-fieldHeal path is untested (needs one in the bag).
- NEXT: (1) if Jev keeps ignoring FULL HEAL at the lobby, offer it again in the lobby only when money is left after the potions, or ask
  the shop question with VENUSAUR's recent status history (it isn't paralyzed at the lobby, so the risk looks abstract). (2) Bench
  training outside the League (see above) as a whole session.
## Session 20260928-000731 (DEEP): in-battle survival facts + switch ping-pong guard
- DIAGNOSIS (live 010040 jev n=29..32, run.jsonl): nothing physical blocks the bot; the loop is Champion losses. VENUSAUR entered the CHAMPION
  at 263/263 but PARALYZED (still no FULL HEAL, see 000231), went 263 -> 138 (PIDGEOT) -> 35 (ALAKAZAM, DOUBLE-EDGE recoil + PAR), then vs a
  full-HP EXEGGUTOR at 35 and 14 HP with MAX POTION x2 in the bag Jev picked DOUBLE-EDGE (0.57/0.61; HEAL_ITEM 0.04-0.07) and fainted; bench
  lost; blackout. Attack options said only "about 2 hits to KO"; nothing said we faint first (PAR = enemy always moves first; recoil).
- CHANGE 1 (pickMove): trackHp() records the HP we lose per turn vs each enemy; enemyHitEst() = observed max drop, else a rough formula
  (power-80 hit from enemy base stats vs our def/spc). Every damaging option (incl. fixed-damage NIGHT SHADE) now ends with
  "SURVIVAL: <lead> (<hp>, PARALYZED so the enemy moves FIRST) takes ~D (+recoil) per turn -> K attack turns before fainting, this move
  needs N: WE LIKELY FAINT BEFORE IT KOs / should KO first" and "RECOIL >= our HP: KNOCKS OUT itself". HEAL_ITEM states attacks-left
  before vs after the item. In trainer battles the heal is also offered when one enemy hit >= our HP (and HP < 70%), not only < 40%.
- SIDE EFFECT found in test 000952 (LANCE, old code + change 1): HAUNTER -> SWITCH_0 (VENUSAUR) -> SWITCH_3 -> ... 8x vs AERODACTYL, each
  switch a free hit on PAR VENUSAUR (75 -> 36 -> 17), which then fainted in LANCE's room and the CHAMPION was lost at once (test 001044).
  Live runs had 0 switch picks. CHANGE 2: swFrom remembers members we switched OUT of vs the current enemy; they are not offered as
  switch targets again until the enemy changes.
- MECHANICS BUG FOUND + FIXED (test 001129, CHAMPION): Jev picked HEAL_ITEM for VENUSAUR at 27/263 (the survival facts work: 0.43 vs live 0.07),
  but "battle: ETHER - item not found in list" and etherFails=9 disabled heals for the rest of the battle -> fainted. Diagnostic dump
  (test 001258 'battle: item scan rows=') showed ~40% of DOWN presses in the in-battle bag list do NOT register (same row read twice:
  DOME FOSSIL, DOME FOSSIL, S.S.TICKET, ..., HM01, HM01 ...); 25 presses reached only TM47 and MAX POTION is item 18 of 18. FIX: scan up to
  60 presses and stop at CANCEL, wait for the bag list to be open (re-press ITEM if FIGHT/RUN still shows), log the rows on failure, and a
  failure is etherFails++ (one retry) instead of 9. CONFIRMED test 001350: 3 in-battle MAX POTIONs on VENUSAUR, 0 scan failures.
- RESULTS from the live 010040 start state (LANCE room): live lost the CHAMPION at EXEGGUTOR (4th) with 2 MAX POTIONs unused. Test 001350 (all
  fixes): beat LANCE with VENUSAUR 216/263, CHAMPION: PIDGEOT, ALAKAZAM beaten with in-battle heals, VENUSAUR fainted vs RHYDON (it arrived
  at 7 HP: ALAKAZAM hits PAR VENUSAUR for ~97-121 per turn and always moves first), LAPRAS SURF took RHYDON 208 -> 46, lost at GYARADOS.
  STILL NOT CHAMPION. The remaining driver is PARALYSIS (from AGATHA, carried to the CHAMPION): every enemy moves first + lost turns.
- CHANGE 3 (lobby shop): FULL HEAL option now has the test evidence (PAR VENUSAUR lost even after a full MAX POTION), "600 = < 1/4 MAX POTION",
  and this run's PAR rooms/biggest hit (parLog); shop 'why' mentions 1 FULL HEAL. CONFIRMED test 001448 (from 004542 start, loss -> lobby):
  Jev bought REVIVE x1, then FULL_HEAL x1 (0.76; was 0-0.01 in 000522/000550), then MAX POTION x3; bag has FULL HEAL x1.
- CHANGE 4 (pickMove): options whose survival verdict is "faint first"/"recoil KOs us" are PREFIXED "WE FAINT FIRST"; when every attack is
  doomed and HEAL_ITEM exists, state.danger says so. Test 001448 (before): VENUSAUR 77/263 vs EXEGGUTOR, all attacks flagged, Jev DOUBLE-EDGE 0.6
  -> fainted. Test 001705 (after): HEAL_ITEM 0.95 at 27/263 vs ALAKAZAM and 0.93 at 7/263 vs RHYDON.
- FINAL TESTS (0 crashes, 0 jev errors): 001705 (from live 010040 LANCE state): LANCE beaten, CHAMPION: PIDGEOT + ALAKAZAM beaten, 3 in-battle
  MAX POTIONs, PAR VENUSAUR fainted vs RHYDON (arrived at 7 HP: PAR ALAKAZAM hit it 142 -> 7 first), bench lost at GYARADOS. 001529 (live
  state, 82 Jev calls): lost the in-progress CHAMPION fight (VENUSAUR already fainted), lobby bought MAX POTION x4 + REVIVE + FULL HEAL,
  LORELEI + BRUNO beaten, frame limit in AGATHA's room. NOT CHAMPION YET in any test.
- CONFIRMED vs GUESS: confirmed = survival facts change Jev's heal picks; the in-battle bag scan bug and its fix; shop now buys FULL HEAL.
  NOT YET SEEN: fieldHeal actually USING the FULL HEAL on a PARALYZED VENUSAUR between rooms (needs AGATHA to paralyze it again; in 001448
  VENUSAUR left AGATHA status OK). Guess (strong): PAR is now the main reason VENUSAUR loses the CHAMPION (always moves second; ALAKAZAM
  ~100-135 per hit on Grass/Poison).
- NEXT: (1) grep live for 'fieldHeal: FULL HEAL on member 0' / 'status PARALYZED -> OK' and HP/status entering CHAMPIONS_ROOM. (2) If the lead
  is PAR at the CHAMPION with a FULL HEAL in the bag, the in-battle cure is only offered when HP is fine (HP heal takes precedence); consider
  offering both. (3) Bench training outside the League (12th listing) is still the long-term fix: LAPRAS SURF did RHYDON 208 -> 46 at Lv18-21.
- *** CHAMPION BEATEN IN TEST 20260928-001925-103 *** (continued from test 001705's end = LANCE room after its 2nd pass; final code).
  VENUSAUR Lv83 left AGATHA status OK (not PAR), LANCE won at 241/270, CHAMPION: PIDGEOT, ALAKAZAM, RHYDON beaten by VENUSAUR, it fainted vs
  EXEGGUTOR, GYARADOS fainted, HAUNTER finished CHARIZARD ("battle-end CHARIZARD Lv65 result won") -> map CHAMPIONS_ROOM -> HALL_OF_FAME ->
  PALLET_TOWN (post-credits) -> REDS_HOUSE_1F -> ROUTE_1 -> VIRIDIAN_CITY, no crash, 52 Jev calls 0 errors. The live game should get there on a
  pass where VENUSAUR is not PARALYZED (or gets the FULL HEAL). After the credits the game restarts in PALLET_TOWN with storyEvents ~251;
  the bot just keeps exploring (goal 'Become Champion' prompts are stale then - update the goal text if the Hall of Fame is reached live).
- Harmless noise seen: after the CHAMPION win fieldHeal tried REVIVE on member 0 four times ("HP 0 -> 0") during the Oak/Hall of Fame scene.
## Session 20260928-002231 (DEEP): lobby shop failed silently and was never retried
- CONFIRMED CAUSE (live 010616 run.jsonl lines 1892-1967): after the CHAMPION loss (money 26433 -> 13216) Jev chose buy_REVIVE_x1, the bot
  stood on the clerk tile (2,5), did hold('LEFT',2) + A, and 12 A presses showed NO text box ("lobbyShop item list not shown", REVIVE 0 -> 0).
  shopAsked[sig] kept the same money|items sig, so the shop was NEVER asked again; the bot entered the E4 with 13216 money unspent and only
  MAX POTION x2 (no REVIVE, no FULL HEAL). VENUSAUR was then put to sleep + DREAM EATER'd (crit) by AGATHA's HAUNTER and fainted -> loss.
  Also shopBuys/shopFailsE4 were per RUN (never reset), so after 4 buys or 3 fails in one run later lobby visits bought nothing.
- CHANGE (maybeLobbyShop): counters + shopAsked reset each new lobby visit (shopLeftLobby set in the main loop when not in the lobby);
  a failed buy deletes its shopAsked key and undoes shopBuys (retry up to 3 fails/visit); before A the bot turns until state().facing ===
  'left' (up to 4 tries, re-walks to (2,5) if moved), and re-faces if no text box/cursor appears. Log line: 'lobbyShop: face try N ... facing X'.
- NOT YET VERIFIED IN GAME: tests from live 010616 start (CHAMPION fight in progress, 20k + 16k frames) never left the CHAMPION battle, so the
  shop path did not run (12 Jev calls, 0 errors, no crash). NEXT: grep live runs for 'lobbyShop: face try' and 'lobbyShop: X a -> b';
  if 'facing left' is logged and it still fails, dump screen() after A. Guess (unconfirmed): the LEFT hold was eaten while the last UP step
  was still finishing, so the player faced UP at (2,4)-direction.
- Other facts seen: VENUSAUR moves are CUT, SOLARBEAM, DOUBLE-EDGE, MEGA DRAIN (no RAZOR LEAF; Gen 1 has no move relearner). Bag TMs:
  28 DIG, 39 SWIFT, 06 TOXIC, 46 PSYWAVE, 22 SOLARBEAM, 47 EXPLOSION. Champion losses are at GYARADOS Lv63 (5th). AGATHA's HYPNOSIS+DREAM EATER
  is a new fainting cause -> an AWAKENING/FULL HEAL in the bag matters (only if the shop actually works).
## Session 20260928-002731 (DEEP): enemy-hit estimate was wrong (borrowed crits, no type factor) -> VENUSAUR died in LORELEI's room
- NO PHYSICAL BLOCK (re-checked): the loop is still E4 passes lost after VENUSAUR (only carry) faints. The lobby shop now WORKS live
  (012030: MAX POTION 0->3, REVIVE 0->1, FULL HEAL 0->1, all confirmed by bag counts), so the 002231 shop fix is confirmed live.
- CONFIRMED CAUSE (live 012547 jev n=4/n=7 + run.jsonl): LORELEI room 1. JYNX: every attack said "takes ~28 per turn" (formula had NO
  type/STAB factor; JYNX is Ice/Psychic = x2 STAB vs Grass/Poison) -> Jev CUT (2 hits), crit ICE PUNCH took 229 -> 117. LAPRAS (unseen):
  enemyHitEst used max(formula, hpSeen.battleMax) = the JYNX CRIT 112 -> SOLARBEAM "should KO first" (5 HP margin), HEAL_ITEM not offered
  (only when one hit >= HP) and when offered it read "2 attacks now vs 2 after healing" (useless). Crit BLIZZARD -> VENUSAUR fainted -> pass
  lost in room 1. Replaying 012547's start.state with the old code reproduces it exactly (test 002939: same crits, same faint).
- CHANGE (bot.js enemyHitEst/survivalFact/pickMove): (1) unseen-enemy estimate = power-90 hit x max(1, 1.5 x type factor of each enemy type
  vs our types); battleMax is only mentioned, never used as the estimate. Checked: LAPRAS est 80, real crit 150 (non-crit ~79); SLOWBRO 65.
  (2) critRiskFact: if (n-1) normal hits + one crit (1.9x) before the move lands >= our HP, the option is prefixed "CRIT RISK" with the
  margin and crit chance (enemy base speed/512). (3) HEAL_ITEM is also offered in trainer battles when one crit would KO us and HP < 60%,
  and its text says whether we survive a crit now vs after the item.
- TEST 003050 (final estimate, from 012547 start): Jev DOUBLE-EDGE'd JYNX in 1 hit (no ICE PUNCH taken), SOLARBEAM on LAPRAS survived a crit
  (193 -> 43), LORELEI WON with VENUSAUR alive, fieldHeal MAX POTION 43 -> 270, on to BRUNO. Live lost VENUSAUR here.
- CHANGE 2: every attack's SURVIVAL fact now has "HP COST to finish it: ~X (n enemy attacks taken + recoil); lost HP carries into the next
  battles". Test 003107 (before it): Jev CUT JYNX again (0.38), crit ICE PUNCH, then SOLARBEAM on LAPRAS at 117 HP despite "CRIT RISK 12%"
  (HEAL 0.02) -> fainted. So crit facts alone don't change the pick; Jev accepts a 12% gamble. Test 003155 (with HP COST): JYNX -> DOUBLE-EDGE
  0.56 (cost 36 vs CUT 80), VENUSAUR met LAPRAS at 193 HP, LORELEI won with VENUSAUR alive (43/270 -> MAX POTION).
- CHANGE 3 (pickMove): REVIVE_CARRY option in trainer battles when the carry (>= lead level + 15) is FAINTED and a REVIVE/MAX REVIVE is in the
  bag: item flow selects the REVIVE, then partyCursorTo(slot) + A (etherPlan.slot). Text says reviving after the battle is free, so only
  now if the bench is losing. Why: test 003155 CHAMPION: VENUSAUR fainted vs EXEGGUTOR (asleep, 20 HP) and the bench lost with a REVIVE unused.
  Offered in tests 003515 (live state, LAPRAS vs HAUNTER) and 003552 (AGATHA GENGAR vs HAUNTER): Jev declined (0.05-0.08) and the bench
  won -> REVIVE used between rooms. The in-battle REVIVE mechanic itself is NOT yet exercised in the game (never picked) - check live logs
  for 'battle: Jev chose REVIVE for REVIVE' and the 'surf: party cursor ... want member 0' line after it.
- RESULTS from live 012547 start.state (where live lost VENUSAUR in LORELEI's room and the whole pass):
  003155: LORELEI, BRUNO, AGATHA, LANCE all won; CHAMPION: PIDGEOT, ALAKAZAM, RHYDON (LAPRAS SURF 208->49, then VENUSAUR CUT) beaten,
  VENUSAUR (20 HP, NO HP items left) put to sleep + KO'd by EXEGGUTOR, bench lost. 003552: same 4 rooms won (VENUSAUR fainted at AGATHA, bench
  won, REVIVE + MAX POTION between rooms), frame limit at the CHAMPION start with VENUSAUR 93/273 and no HP items.
- THE REMAINING LIMIT (confirmed from item logs): HP items. After a loss, money ~2.6k-13k buys 3-4 MAX POTIONs; a pass uses 1 per room
  (LORELEI 43->270, BRUNO 152->270, ...) so the CHAMPION is fought with none left. Every win in a room pays ~5-6k, but the shop is only in
  the lobby. Ideas (untested): sell unused TMs/fossil at the lobby shop (needs a SELL menu mechanic; ROM data has no prices); prefer 1-hit
  KOs / low HP COST picks (done: HP COST fact); Venusaur keeps gaining ~1 level per pass (Lv82 -> 84 in a test pass).
- CONFIRMED MECHANIC (forced test 003826, temporary override removed): in-battle REVIVE on benched slot 0 works: "surf: party cursor y0=5
  now=1 want member 0" -> "AAAAAAAAAA is revitalized!".
- BUG FOUND, NOT FIXED (only capped): right after that revive, Jev picked SWITCH_0 (VENUSAUR) and the switch NEVER happened: 'opened party
  menu to switch to member 0' -> 'lead fainted, sent out party member 0' -> next tick 'left the party menu (no switch)', 8x in a row, no game
  turn passed. The party cursor was already on slot 0 (cy=1) and a generic text-advance A (press at t=1827, before the 'partymenu:' log) hit
  the menu first. Guess (unconfirmed): that stray A opens the SWITCH/STATS submenu, and the handler's A + next tick's B,B cancel it.
  Added: wait up to 4x6 frames for the SWITCH submenu (not enough on its own: 003940 still failed) and swFrom.tries: a slot Jev
  picked 3x against the same enemy is no longer offered -> the loop ends (003940: 3 tries, then THUNDERBOLT won the battle).
  NEXT: dump screen() rows right after the handler's A when ti's row is the cursor row at entry; check if earlier "SWITCH_0" ping-pong
  (000952) was this same failure. Until fixed, reviving in battle only helps via the forced replacement when the active member faints.
- FINAL TEST 003955 (final code, live state): LORELEI won (HAUNTER THUNDERBOLT), REVIVE + MAX POTION between rooms, BRUNOS_ROOM, 21 Jev calls,
  0 errors. NEXT (priority): (1) the SWITCH-to-cursor-slot bug above; (2) money/HP items (sell TMs at the lobby); (3) bench training (13th listing).
## Session 20260928-004232 (DEEP): no code change; the current code BEAT THE CHAMPION from the live state (HALL_OF_FAME)
- RE-CHECKED "no physical block": correct. Every live run since 000814 goes lobby -> LORELEI -> ... -> LANCE -> CHAMPION with no stuck walks;
  the loop is battle losses (CHAMPION lost at GYARADOS in 000814 and 010616, at ALAKAZAM in 004542; AGATHA in 012030).
- CONFIRMED (live 004052 run.jsonl): VENUSAUR left LANCE's room 0/256 and there is NO 'fieldHeal' line at all: the bag had no healing item,
  so it entered the CHAMPION fainted. Live 014030 (running during this session): entered the CHAMPION at 194/273 with no healing item in
  the bag (no fieldHeal question) and 26015 money it cannot spend (the only shop is the lobby, reached only after a loss halves the money).
  Live 012547 reached the lobby with only 2651 money (loss at AGATHA early in the pass) -> ~1 MAX POTION for the whole next pass.
  => The per-pass HP-item budget is the real limit; money earned inside a pass only helps after the next loss.
- CONFIRMED (live 010616 moves): VENUSAUR uses ~7 SOLARBEAM + up to 9 MEGA DRAIN per pass before the CHAMPION (PP 10 each), so it reaches
  the CHAMPION with little/no Grass PP (keep/switch question there listed only CUT PP15 + DOUBLE-EDGE PP6).
- TEST 20260928-004356-840 (unchanged code, live start state LANCES_ROOM, 40k frames): LANCE won (VENUSAUR 194/273), CHAMPION: VENUSAUR beat
  PIDGEOT + ALAKAZAM then fainted, bench fought on, GEODUDE Lv24 finished CHARIZARD with ROCK THROW -> "battle-end CHARIZARD Lv65 result won"
  -> map HALL_OF_FAME, storyEvents 258 -> 261, 33 Jev calls, 0 errors. So the live game can win from here; it is dice-dependent (live
  014030 is fighting the same CHAMPION battle from nearly the same state right now).
- NEXT: (1) if the live game reaches HALL_OF_FAME, the goal text ('Become Champion ... go to Indigo Plateau') is stale after the credits
  (the game restarts in PALLET_TOWN): change the goal to the Pokedex (pokedexOwned is only 10) - catching needs balls + a catch decision.
  (2) If it still loops: bench training outside the League (14th listing) or a cheaper HP-item plan (spend ALL money at the lobby; money
  is halved on a loss anyway). (3) Grass PP budget: a fact per pass of how many SOLARBEAM/MEGA DRAIN are left vs rooms left.
## Session 20260928-004732 (DEEP): still NO physical block; the loop is lost CHAMPION fights with no HP items left
- RE-CHECKED (live 014030 run.jsonl): LANCE won (VENUSAUR 194/273), map LANCES_ROOM -> CHAMPIONS_ROOM, CHAMPION: PIDGEOT, ALAKAZAM, RHYDON,
  EXEGGUTOR, GYARADOS all beaten; VENUSAUR fainted at CHARIZARD Lv65 (the LAST one, "hit with recoil" + FIRE BLAST), bench (Haunters NIGHT
  SHADE, GEODUDE ROCK THROW, LAPRAS) lost to FIRE SPIN wrap. No 'fieldHeal' before the CHAMPION: the bag had no HP item; money 26015 unspendable.
- CONFIRMED item waste (live 012547 jev n=17-19): in LORELEI's room (room 1 of 5) Jev used REVIVE then MAX POTION on VENUSAUR 133/266.
  Lobby (012030 jev n=30): Jev chose 'skip' (0.45) with 2651 money left although a MAX POTION costs 2500 and kept money is only halved later.
- CHANGE (facts only, bot.js lobbyShop + fieldHeal): lobby 'skip' now says kept money is useless for the pass (only shop = lobby, reached
  only after a loss that halves it; a win ends the game). fieldHeal context has itemBudget: HP items vs rooms left, the CHAMPION is the
  hardest/last room (live 014030 reached it with none and lost at the last Pokemon), an item used at half HP wastes half.
- TEST 20260928-004932-476 (final code, live state, 250k frames; harness printed a Bus error AFTER the summary): lost CHAMPION fight already in
  progress -> lobby bought MAX POTION x4 + REVIVE (13007 -> 1507; Jev still skipped a 2nd REVIVE at 1507, skip 0.45) -> LORELEI, BRUNO won
  (MAX POTION at 167 and 119), AGATHA won and Jev SKIPPED healing at 219/280 (saving), LANCE won 145/280 -> CHAMPION WON -> HALL_OF_FAME ->
  game restarted in PALLET_TOWN; the bot then walked ROUTE_1 -> VIRIDIAN -> ROUTE_22 -> ROUTE_23 (old goal text: go to the Plateau). 162 Jev calls, 0 errors.
  The win is still partly dice (test 004356 also won with the old code); the facts only shift Jev (room-1 heal skip 0.05 -> 0.34).
- NEXT (post-game, if live reaches HALL_OF_FAME): the goal text is stale after the credits (bot heads back to Route 23/Plateau). Change the
  post-game goal to filling the Pokedex (owned 10): needs Poke Balls (buy at a mart) + a catch decision for wild Pokemon (Jev: catch/fight/run).
## Session 20260928-005232 (DEEP): NO physical block (4th time confirmed); the CURRENT CODE WINS ~half its E4 passes in tests
- TESTS ARE CHEAP: 60k frames ~30 s wall, 400k frames ~3-4 min (5 in parallel). Replays are DETERMINISTIC: test 005744 from live 014030's
  start reproduced live's lobby buys exactly (13007 -> MAX POTION x4 -> REVIVE -> skip at 1507). Use many long tests, not guesses.
- BASELINE (unchanged code, 400k frames each): live state (BRUNOS_ROOM) 005512: won -> HALL_OF_FAME on the FIRST pass. 014030 start (LANCE):
  lost CHAMPION, 2nd pass won -> HALL_OF_FAME. 012547 start (LORELEI): lost CHAMPION, 2nd pass -> HALL_OF_FAME. 012030 start (AGATHA,
  few items): VENUSAUR fainted in AGATHA (0/266) with the REVIVE already used, lost LANCE. 010616 start: lost CHAMPION twice.
  => The loop is dice + HP-item budget. Beating the Champion ENDS the whole project (app/src/champion.ts: EVENT_BEAT_CHAMPION_RIVAL ->
  improver stops), so post-game goals (Pokedex etc.) do NOT matter; only the per-pass win rate does.
- CONFIRMED (5 lobby visits, live + tests): Jev ALWAYS chose 'skip' with 1507-3121 money left after MAX POTION x4 + REVIVE (+ FULL HEAL),
  i.e. a 2nd REVIVE was affordable every time. Cause: ctx.why said "Best mix: MAX POTIONs plus 1 REVIVE kept in reserve" and the 2nd
  REVIVE option had no fact. Losses that a 2nd REVIVE addresses: live 014030 (VENUSAUR fainted at the CHAMPION's last mon CHARIZARD,
  1507 unspent), test 005748 (fainted in AGATHA, REVIVE already used, entered LANCE fainted -> lost).
- CHANGE (facts only, maybeLobbyShop): the REVIVE option when one is already in the bag says it's a SECOND one bought with otherwise-wasted
  money + the two losses above; ctx.why says leftover money >= 1500 is best spent on another REVIVE. Jev still decides.
- Seen, harmless: 'fieldHeal ITEM not found (cursor null ...)' once in 005512, the retry worked (MAX POTION 192 -> 280).
- ITERATION: v1 (fact on every 2nd+ REVIVE) -> test 010224-465 bought REVIVE x3 and NO FULL HEAL; v2 (needs FULL HEAL first) -> test 010224-464's
  3rd lobby visit (11685 money, MAX POTION x1) bought REVIVE x3 more (5 total, 1 MAX POTION) = overshoot. v3 (FINAL): the fact only
  shows when the bag has exactly 1 REVIVE, a FULL HEAL (or money < 2100), and money < 2500 or 4+ MAX POTIONs. Final-code lobby check
  (from 014030 start): MAX POTION x4 -> REVIVE -> 2nd REVIVE at 1507 (was skip) -> money 7.
- RESULTS (dice; NOT proof of a higher win rate): 012030 start: baseline lost LANCE then was still in pass 2 at the limit; v1 and v2 both
  WON pass 2 -> HALL_OF_FAME. 014030 start: baseline won pass 2; v2 lost pass 2 at the CHAMPION. Replays are deterministic, so any change
  in a Jev pick shifts all later RNG; judge by several states, not one.
- GOTCHA: two pokered-test runs started in the SAME SECOND share one test-runs/<id> dir (logs interleaved). Stagger launches by >= 2 s.
- NEXT: (1) watch live lobby lines for 'buy_REVIVE_x1 (money <2500 ... REVIVE x1)'. (2) The one mechanic glitch seen repeatedly:
  the FIRST fieldHeal item use after another item often fails ('MAX POTION on member 0 HP 142 -> 142', then the retry works); harmless
  but costs a Jev call. (3) Win rate from states: run 4-5 staggered 400k-frame tests per candidate change and count HALL_OF_FAME.
- CORRECTION (end of session, FINAL CODE STATE): v3 still had a ctx.why sentence "leftover money >= 1500 is best spent on another REVIVE";
  final test 011005 (live state) then bought REVIVE x4 with 12435 money and NO MAX POTION (7 REVIVEs total by the next visit) = harmful.
  That ctx sentence was REMOVED. Check 011445-ish (014030 start, final code): MAX POTION x4 -> REVIVE -> SKIP at 1507 again, i.e. the
  gated option fact alone does NOT move Jev; the shop behaves like the baseline. Net: no behaviour change shipped, only a gated fact.
  If trying again: a separate yes/no question "spend the leftover N on a 2nd REVIVE?" asked ONLY when money < 2500 after the main buys
  (don't put the idea in the shared context, it leaks into every pick). Final tests: 010705 (live, 300k frames, 216 Jev calls, 0 errors):
  lost CHAMPION pass 1, pass 2 at CHAMPIONS_ROOM at the limit; 011005 (live, 286 calls, 0 errors) lost CHAMPION twice (with the bad v3 ctx).
  Baseline 005512 WON pass 1 from the same live state: the E4 outcome is NOT deterministic across runs (Jev sampling), it's dice.
## Session 20260928-012732 (DEEP): no physical block (6th check). Tested a HAUNTER-vs-AGATHA switch option -> NOT better -> REVERTED
- FINAL CODE = UNCHANGED bot.js (identical to the start of this session). Only NOTES.md changed. Final test 014224-706 (live state, 60k frames):
  LANCE won, CHAMPION lost at CHARIZARD, 49 Jev calls, 0 errors (012837, same code + state, WON): the live pass is a coin flip.
- RE-CHECKED: live runs 015158/021539 walk lobby -> LORELEI -> ... -> CHAMPION with no stuck walks; the loop is lost passes (dice).
- CONFIRMED (live 021539 game lines, AGATHAS_ROOM): VENUSAUR used MEGA DRAIN x6 + SOLARBEAM x3 on GENGAR/HAUNTER/GENGAR (Grass x0.5,
  Normal x0) and left with SOLARBEAM 0. Live 015158: the CHAMPION's RHYDON took DOUBLE-EDGE x3 + CUT x3 (all x0.5), then EXEGGUTOR
  HYPNOSIS'd VENUSAUR and the pass was lost. Old-code test 013318 (AGATHA start) reproduced it: MEGA DRAIN 10 -> 0, SOLARBEAM 3 -> 1.
- CONFIRMED (013318 jev.jsonl): vs GENGAR Jev is only offered moves; switches exist only when the lead is weak/outleveled/out of moves or
  on the room's first turn. A bench filter "takes <= x1 from the enemy's type" removes every HAUNTER (GHOST hits GHOST x2 in the type
  chart; Agatha's GENGAR really attacks with NIGHT SHADE = fixed damage = its level).
- TRIED (reverted): `resistedLead` in pickMove = E4 room before the Champion + every usable damaging move of the lead <= x0.5 and scarce
  (maxPp < 25) -> offer each bench member with NIGHT SHADE as SWITCH_i (hits to KO, HP, type x, "lead keeps its PP"). v2 added survival
  facts (HAUNTER ~95 HP vs GENGAR NIGHT SHADE ~60/turn: lasts ~1 turn, needs 4 hits) + "HAUNTERs are the only bench for LANCE/CHAMPION".
  RESULTS, all from test 012911's end state (= AGATHA battle start, VENUSAUR Lv83), 0 Jev errors in every run:
  * v1 013418->013538: Jev used the HAUNTERs, VENUSAUR left AGATHA 203/270 with MEGA DRAIN 7, entered the CHAMPION with 6, one MEGA DRAIN
    on RHYDON -> WON -> HALL_OF_FAME.  v1 013541: HAUNTERs all fainted, MEGA DRAIN 2 left, lost at the CHAMPION's EXEGGUTOR.
  * v1 013739/013742/013745: all 3 HAUNTERs fainted in AGATHA -> VENUSAUR alone -> LOST in LANCE's room (AERODACTYL/GYARADOS) every time.
  * v2 014013/014016/014019: reached the CHAMPION with MEGA DRAIN 5-7 every time but VENUSAUR was alone (all HAUNTERs + GEODUDE fainted
    in AGATHA) -> lost at PIDGEOT / CHARIZARD / ALAKAZAM.
  => 1 win in 8 passes. A Lv34-39 HAUNTER trades itself for ~1/3 of a Lv56-60 GENGAR; the lost bench costs more than the saved Grass PP.
  Old code from the same start (012911): lost in LANCE's room, 1 pass only. Old code from the live state (012837): WON -> HALL_OF_FAME.
- CONCLUSION: the pass needs BOTH Grass PP for RHYDON and a living bench; the HAUNTERs are ~45 levels under the E4 and cannot spare
  VENUSAUR's PP without dying. Don't retry the Agatha switch as-is.
- NEXT (evidence-based ideas, untested): (1) train the HAUNTERs (Lv34-40) outside the League, e.g. VICTORY_ROAD / ROUTE_23 wild Lv40s,
  before the next pass: they are the bench that dies (listed ~15 sessions now; it IS the structural fix). (2) LANCE's room spends Grass PP
  on AERODACTYL/GYARADOS (x1): a reserve fact "last 2-3 Grass PP = the CHAMPION's RHYDON" on MEGA DRAIN/SOLARBEAM in LANCES_ROOM.
  (3) In AGATHA, ARBOK (Poison) got MEGA DRAIN x0.5 while CUT x1 was available (013541 t=21236).

# Bot notes

## Session 20260926-160457 (first session)
- Rewrote bot.js: intro handling (names RED/BLUE), a text/menu advancer, BFS walker over grid() (walkTo),
  and a generic Jev "explore" decision: options = each warp, each map-edge exit, and nearby NPCs to talk to,
  each with distance + how many times already tried. Answers cached by (map, options, tried counts).
- Jev also picks the starter in OAKS_LAB (when EVENT_OAK_ASKED_TO_CHOOSE_MON set and party empty);
  ball positions assumed (6,3) Charmander, (7,3) Squirtle, (8,3) Bulbasaur, player stands below and presses A facing UP.
- Nickname prompt answered with B (NO).
- Battles: just mash A (first move). NEXT: Jev battle decisions (move choice with type effectiveness/power, run, switch).
- Unverified: exact shape of grid().warps / exits fields (code reads w.to||w.map||w.dest). Check jev.jsonl of runs.
- Doors on a map's bottom edge (e.g. REDS_HOUSE_1F (2,7), "previous map") need a DOWN step on the mat: walker now tries DOWN/UP/LEFT/RIGHT after reaching a warp.
- Jev is re-asked every explore step (cache key includes tried counts) - consider cheaper caching.

## Session 20260926-161743
- BUG FIXED: grid().exits is an ARRAY of {side:'north'|..., to:'ROUTE_1'}; old code used array index as dir, so exits never stepped off (437 failed tries live). Now exit_north etc. work.
- Jev re-ask throttled: cache key = map|options|partySize|floor(triesOnMap/3) -> ~1 call per 3 explores.
- Test: exit_north now picked 60x in Pallet; Oak event still didn't yield a starter in 15k frames (EVENT_OAK_ASKED_TO_CHOOSE_MON path / ball coords unverified).
  NEXT: check run.jsonl whether Oak intercepts at north edge (need to stand on the grass tile y=1 and wait for text), and verify pickStarter coords in OAKS_LAB.
  Also add a "failed" fact per option (map didn't change after action) so Jev stops repeating exit_north.

## Session 20260926-162243
- Added Jev battle move choice (battleStep/pickMove/moveFacts in bot.js): code opens FIGHT, detects move menu (cursor row has a move name + 'TYPE' on screen),
  Jev picks move_i with facts (type, power, accuracy, effectiveness via rom.effectiveness, STAB, PP, damage score); cursor moved with menu().current.
  Cached per (species, enemy, hp quartiles, pp); recent turns passed as lastTurns. Fallback = highest-power move with PP.
- Test from live (OAKS_LAB, Squirtle): won rival battle vs BULBASAUR with TACKLE x12, Squirtle Lv6, storyEvents 4->6, ended in PALLET_TOWN. 32 Jev calls, no errors.
- NEXT: switch/item/run options in battle (wild battles: run vs fight vs catch - need Poke Balls); heal decision when HP low; get Oak's parcel from Viridian mart.
  Explore still repeats options - add "tried and map didn't change" facts.

## Session 20260926-162743
- Live run died "stuck: asked Jev 21 times without advancing" in PALLET_TOWN at (4,11): exit_north action advanced 0 frames (root cause not found).
- FIX in explore(): action wrapped in try; memory.failed[map|option] counts picks where map didn't change, shown to Jev in exit facts
  ("N of them failed to leave the map"); if an action advances no frames, cached pick is dropped and a random step is taken (prevents freeze).
- Test (8000 frames from live): reached ROUTE_1, storyEvents 6->7, pokedexSeen 3, won a wild battle via Jev moves; 10 Jev calls.
- NEXT: find why walkTo/exit_north did nothing at (4,11) (maybe bfs null + hold no-op?); add failed facts to doors/talk too;
  wild battle run/catch decisions; Oak's parcel from Viridian mart.

## Session 20260926-163243
- Live run before this bounced exit_east/exit_west between VIRIDIAN_CITY and ROUTE_22 (static goal text ended at "reach Viridian").
- Added storyGoal(st, party) in bot.js: stage-aware goal from party/bag (PARCEL)/event flags/badges, passed as ctx.goal to explore Jev question.
  Stages: starter -> get parcel at VIRIDIAN_MART -> deliver to OAKS_LAB -> Pokedex -> Brock. Code only describes the stage; Jev still picks where to go.
- Test (12k frames from ROUTE_22): entered VIRIDIAN_MART, got OAK's PARCEL (storyEvents 6->7), goal switched to "deliver", Jev picked exit_south. ~9 Jev calls.
- Unverified: event names EVENT_OAK_GOT_PARCEL / EVENT_GOT_POKEDEX (ev() swallows errors -> false). Check after delivery that goal advances.
- NEXT: verify parcel delivery + Pokedex stage; wild battle run/catch (buy Poke Balls); heal at Pokecenter when HP low (Jev decision).

## Session 20260926-163743
- Live run bounced VIRIDIAN_CITY <-> ROUTE_22 carrying the PARCEL: exit_south in Viridian had failed 25/25 times.
  Cause: exit action walked to the NEAREST walkable edge tile, which BFS couldn't reach -> walkTo returned false.
- FIX: exit action now sorts edge tiles by distance and takes the first one bfs() can reach.
- Test (8000 frames from live Viridian): Jev picked exit_south -> ROUTE_1 -> PALLET_TOWN -> OAKS_LAB, talked to talk_0..talk_5,
  but storyEvents stayed 7 (parcel not confirmed delivered). Jev keeps walking in and out of the lab.
- NEXT: in OAKS_LAB, work out which npc is Oak (npc names/sprites in grid()? check README) and whether talking to him gives the Pokedex;
  confirm EVENT names for parcel/pokedex via event(); bfs doesn't model ledges (v<>^) - add one-way ledge moves.

## Session 20260926-164243
- Test from live OAKS_LAB (6000 frames): storyEvents 7 -> 11 (parcel delivered / Pokedex likely obtained).
- Added npcWho(n): talk_i options now name the NPC by sprite picture id (sprites()[index].picture; SPRITE_NAMES table in pokered order:
  1 player, 2 rival, 3 Oak, ...). Jev then picked "Talk to Professor Oak (sprite 3)" at 0.98. Pictures >30 (e.g. 32, 61 in lab = pokeball/items?) show as "NPC/object (sprite N)".
  The SPRITE_NAMES table beyond index 3 is from memory - verify/extend (items/pokeballs/books sprites).
- NEXT: confirm the goal moves on to "go to Brock" (EVENT_GOT_POKEDEX); after the Pokedex the bot should leave Pallet north. Wild battle run/catch, heal decisions, ledges in bfs.

## Session 20260926-164743
- Live run stuck in VIRIDIAN_FOREST_SOUTH_GATE at (4,1): Jev picked door_4_0 (->VIRIDIAN_FOREST) 6+ times, never left.
  Cause: door action pressed DOWN first after walkTo (which failed/stopped next to the edge door), walking away from the door.
- FIX: door action now tries walkTo exact then adjacent, then presses the direction toward the door first, then the map-edge direction
  (door at y=0 -> UP), re-walking to the door between attempts.
- Test (8000 frames from live gate): reached VIRIDIAN_FOREST.
- NEXT: navigate Viridian Forest to PEWTER (maze; exits via north gate warp); wild battle run/catch decisions (Jev); heal decision; ledges in bfs;
  add "failed" counts to door options like exits have.

## Session 20260926-165243
- 8000-frame test from live VIRIDIAN_FOREST: Squirtle (poisoned) blacked out -> ROUTE_1/PALLET, money 1587->793. Healing is the blocker.
- Added to explore Jev question: ctx.health (party HP %, status/poison warning, blackout cost, "Pokecenter heals"), status in party strings,
  instruction hint to consider a Pokemon Center when low; door options now show "N of them failed to go through" (memory.failed).
- Test (5000 frames, from live forest): no errors, jev.calls=2 (battle moves), no map change in that short window - health fact not yet seen in effect.
- NEXT: verify Jev routes to VIRIDIAN_POKECENTER when low; add a talk-to-nurse mechanic (heal) + Jev "heal now vs push on" decision;
  in battle, Jev option to run from wild battles when HP low; buy Antidote/Potions at mart (Jev picks items).

## Session 20260926-165744
- Added fightOrRun(): in WILD battles (battle().kind==='wild'), at the FIGHT/RUN main menu Jev chooses fight vs run with facts
  (my HP%/status, wild species/level/HP%, move facts, blackout cost). Cached per enemy+HP buckets. Fallback: run if HP<35%.
  RUN is selected via UP,LEFT (to FIGHT) then DOWN,RIGHT, A. Trainer battles always fight.
- Test (8000 frames from live VIRIDIAN_FOREST): 7 Jev calls, 2 fight/run questions (both picked fight, low confidence 0.15/0.34),
  Squirtle Lv8->9, reached VIRIDIAN_FOREST_NORTH_GATE. The run path (menu navigation) is not yet observed in a test - verify it.
- NEXT: Pewter City -> heal at PEWTER_POKECENTER (nurse-talk mechanic + Jev heal decision), then Brock (Squirtle Water is strong vs Rock).
  Buy Poke Balls/Potions (Jev picks items); add "throw ball" option to wild battles once balls are in the bag.

## Session 20260926-170244
- Live bot blacked out (money 883->441, woke in REDS_HOUSE), walked back, then got stuck in VIRIDIAN_FOREST_SOUTH_GATE at (4,1):
  walkTo pressed UP ~120 times into (4,0), which is really wall (the doorway you can see is at x=5).
- FIX: walkTo gives up after 6 steps with no position change. Door action for top/bottom-edge doors now tries columns x, x+1, x-1:
  walks to the tile just inside the map and pushes out (UP/DOWN).
- Test (3000 frames from live): SOUTH_GATE -> VIRIDIAN_FOREST, jev.calls=2, 0 errors.
- NEXT: healing is still the main blocker (blackouts keep costing money): nurse-talk mechanic + Jev "heal vs push on" decision;
  the run option in wild battles is still unobserved; then Pewter/Brock.

## Session 20260926-170744
- Added counter-talk mechanic: talk_i falls back to standing 2 tiles away (across a counter) and facing the NPC when no adjacent tile is reachable
  (nurse, mart clerk). In *POKECENTER* maps the NPC near x=3,y<=2 is described to Jev as the nurse ("fully heals party for free"),
  and after talking the bot presses A 12 times to go through the heal dialog (logs "nurse heal attempted"). NOT yet observed in a test.
- Test (8000 frames from live VIRIDIAN_FOREST): reached PEWTER_CITY with no errors. Then LOOPED: Jev alternated PEWTER_CITY door_16_17 (gym) <->
  PEWTER_GYM door_4_13 (exit) - the talk option to Brock/gym trainer is not picked in the gym (Jev picks leaving at low conf 0.12-0.25).
- NEXT: fix the gym loop - in PEWTER_GYM describe NPCs as "gym trainer / Brock (gym leader, beat him for the Boulder Badge)" (storyGoal says go to Brock?)
  and make the city goal mention healing at PEWTER_POKECENTER first; verify nurse heal works.

## Session 20260926-171244
- Fixed the PEWTER_GYM exit loop: storyGoal has a gym-specific line (inside gym: battle trainers then Brock; leave only to heal);
  gym NPCs are described via gymWho() (top-most NPC = GYM LEADER Brock, bottom NPC near entrance = gym guide, others = gym trainer),
  and gym exit doors are labelled "EXITS the gym - no progress unless you must heal".
- Test (6000 frames from live PEWTER_GYM): Jev picked talk_1 (gym trainer) then talk_0 (Brock) - loop fixed. BUT the battle was lost
  (blackout, money 441->220, woke south; ended on ROUTE_1). Squirtle Lv10 alone is too weak / not healed before Brock.
- NEXT: before a gym leader, heal at PEWTER_POKECENTER (Jev heal-vs-push decision with HP facts; verify nurse heal mechanic);
  train Squirtle to ~Lv13+ on ROUTE_2/forest before Brock (add level fact to the goal/options); check battle move choice vs Brock
  (Bubble/Water Gun should be picked; move_2 was chosen repeatedly - confirm what it is). Walk back north from Pallet/Viridian.

## Session 20260926-171744
- storyGoal (badges<1, outside gym) now includes a readiness line: lead species/Lv/HP%, Brock's team (Geodude 12, Onix 14),
  "TOO LOW: train in tall grass until ~Lv13-14" when Lv<13, and "heal at nearest *POKECENTER* before the gym" when HP<90%.
- Test (8000 frames from live ROUTE_1, Squirtle Lv11): 12 Jev calls, Jev routed ROUTE_1 -> VIRIDIAN_CITY -> VIRIDIAN_POKECENTER and
  the nurse-talk fired ("nurse heal attempted" in run.jsonl) - first time observed. Whether HP actually refilled not yet verified.
- NEXT: verify HP after nurse heal (compare party HP before/after in log); make sure Jev then trains on ROUTE_2 grass to Lv13
  instead of rushing Brock; Brock move choice (Bubble/Water Gun).

## Session 20260926-172244
- Gym goal now includes the Brock readiness line (lead Lv/HP%, Brock's team) plus "under-leveled or hurt -> LEAVE the gym to heal/train"
  when Lv<13 or HP<90%; gym exit option text mentions "heal or train to ~Lv13". Aim: stop the Lv11 Squirtle re-fighting Brock and blacking out.
- Test (5000 frames from live PEWTER_GYM): money 220->110 right at start (live state was apparently already losing a gym battle -> blackout,
  woke at VIRIDIAN_CITY). Then Jev routed VIRIDIAN_CITY -> ROUTE_2 -> VIRIDIAN_FOREST (exit_north conf 0.97). No errors.
  The new "leave gym" wording was not exercised (bot left the gym via blackout, not via a Jev choice).
- NEXT: check that Jev trains in grass (ROUTE_2/forest) to Lv13 instead of walking straight to the gym; maybe add a "train here"
  option (walk around in grass until N wild battles / level up) as an explicit Jev choice. Verify nurse heal refills HP. Buy Potions (money is low: 110).

## Session 20260926-172744
- Readiness line: when lead Lv>=13 AND HP>=90% the goal now says "READY for Brock ... head straight to PEWTER_GYM now; no more training needed"
  (previously just "Level is OK"). Squirtle is Lv13 now, so this is the go-signal.
- Test (8000 frames from live VIRIDIAN_FOREST, Squirtle Lv13, money 170): 8 Jev calls, no crash. Maps: forest -> ... -> VIRIDIAN_POKECENTER -> ROUTE_2,
  money 170->120 and storyEvents 13->14 (likely a blackout in the forest/trainer battle, woke at Viridian). Jev then picked ROUTE_2 exit_north (conf 0.93).
  The READY line was likely not exercised (HP was low when it went back north).
- NEXT: find why battles are lost at Lv13 (check fightOrRun/pickMove choices in run.jsonl: is Jev running too late? low HP after chain of fights?);
  consider a "heal now" option when HP<50% in the forest (Pewter PC is closer than Viridian from the north half). Buy Potions once money allows.

## Session 20260926-173244
- Evidence: Squirtle's move picks were fine (TACKLE vs Bugs, since Bubble's power of 20 scored lower; vs Brock, Bubble is 2x, so it should win). The blackouts came from HP draining
  over chains of forest fights, with no healing: Jev kept picking "fight".
- Added: storyGoal puts an "HP IS LOW (<50%) ... walk to the nearest Pokemon Center NOW" line first, with Pewter vs Viridian routing hints,
  whenever lead HP <50% outside a POKECENTER. fightOrRun's note now says running is sensible when HP <50%.
- Test (8000 frames from live VIRIDIAN_FOREST, Lv13): 9 Jev calls, no errors. Went forest -> PEWTER_CITY -> PEWTER_GYM (door_16_17), talked to gym trainer
  (talk_1) and then Brock (talk_0). Squirtle is now Lv14 and money is still 120. The low-HP line was not triggered (HP stayed high).
- NEXT: check the Brock fight result in the live run (did Jev pick BUBBLE? win = badge 1). If it lost, heal at PEWTER_POKECENTER first. After the badge, write the
  storyGoal for Route 3 / Mt Moon (and Pewter Mart potions).

## Session 20260926-173744
- ROOT CAUSE of Brock losses: move-menu mechanic bug. Jev picked move_2 BUBBLE every turn, but TAIL WHIP's PP dropped (BUBBLE stayed 30/30),
  i.e. menu().current navigation selected the wrong move. Fixed battleStep: navigate by the visible cursor row containing the chosen move name.
- Test (12000 frames from runs/20260926-183338-963 start, PEWTER_CITY Lv14): BUBBLE actually used (PP now drops), beat gym trainer
  (money 120->340, storyEvents 14->15), ended inside PEWTER_GYM heading to Brock. Badge not yet confirmed.
- NEXT: confirm Brock beaten (badge 1); then storyGoal for Route 3 / Mt Moon, buy Potions at Pewter Mart. Check other menus that use menu().current.

## Session 20260926-174319
- Brock beaten in live (badge 1, WARTORTLE Lv16, money 1666). Added a badges==1 storyGoal: leave PEWTER_GYM, heal, PEWTER east -> ROUTE_3 -> ROUTE_4
  -> MT_MOON (MT_MOON_POKECENTER at entrance) -> CERULEAN_CITY; Misty hints (Starmie Lv21, train ~Lv21); "don't go back south".
- Test (8000 frames from live PEWTER_GYM): 7 Jev calls, 0 errors; route PEWTER_GYM -> PEWTER_CITY -> PEWTER_POKECENTER -> ROUTE_3. 
- NEXT: watch Mt Moon navigation (multi-floor, ladders; may need a "visited ladders" fact in the option text). Buy Potions at PEWTER_MART
  (money 1666) - add a shop decision for Jev. Consider catching a 2nd Pokemon (Grass/Electric for Misty) as a Jev choice.

## Session 20260926-174819
- BUG (live run 20260926-184354-501): bot looped PEWTER_CITY <-> PEWTER_POKECENTER ~20 times at 42% HP. Cause: explore() built the option list
  right after the warp, while grid/sprites were still Pewter City's (position [13,25] inside the pokecenter, no nurse option), so Jev picked the door back out.
- Fix (mechanics): explore() now waits for the map/position to settle on the first call on a new map (up to 3x60 frames), and re-reads if grid.map != state.map
  or the position is outside the grid.
- Test (8000 frames from live PEWTER_CITY, 21/50 HP): 4 Jev calls, 0 errors. PEWTER_POKECENTER -> talk_0 nurse (HP 21->50) -> door out -> exit_east -> ROUTE_3 -> exit_north.
- NEXT: Route 3/Mt Moon navigation; Potions shop decision at PEWTER_MART (money 2066); consider catching a 2nd Pokemon for Misty.

## Session 20260926-175319
- Live Route 3: a Lass's JIGGLYPUFF used DISABLE on BUBBLE. Added disabled-move tracking: battleStep scans screen text for "<MOVE> was disabled",
  stores memory.disabledMove (cleared out of battle / "no longer disabled"); moveFacts marks it "DISABLED - cannot be used", cache key includes it,
  fallback and Jev's pick skip it (a disabled pick would otherwise be refused by the game and loop).
- Test (6000 frames from live ROUTE_3): ROUTE_3 -> ROUTE_4, Lv18->19, storyEvents 21->22, money 2416->2626. Disable path not exercised in test.
- NEXT: Mt Moon navigation (floors/ladders, visited-ladder facts); PEWTER/MT_MOON shop decision for Potions (money 2600); catch a 2nd Pokemon for Misty.

## Session 20260926-175819
- Added memory.visitedMaps (count of arrivals per map, recorded in explore() on each new map). Door/stairs options now say
  "already visited X N times" or "NOT visited yet this run - new area", so Jev can prefer unexplored ladders in Mt Moon (not just used-count of the door).
- Test (8000 frames from live ROUTE_4): ROUTE_4 -> MT_MOON_1F, 6 Jev calls, 0 errors.
- NEXT: watch Mt Moon floor navigation in live logs (loops between 1F/B1F?); shop decision for Potions (money 2626); catch 2nd Pokemon for Misty.

## Session 20260926-180319
- BUG (live run 20260926-185409-186): stuck on ROUTE_4 at (19,6): Jev picked exit_east 143 times (432 failed tries) even though the text said "N of them failed";
  east exit is not reachable from the Mt Moon (west) side. 147 Jev calls wasted.
- Fix: explore() drops non-talk options with tried>=3 and failed>=tried (unless that would leave nothing), and adds ctx.unreachable listing them.
- Test (10000 frames from live MT_MOON_1F): 7 Jev calls, 0 errors, storyEvents 22->23, money 2626->2836. door_17_11 failed 3x and was dropped (unreachable shown to Jev).
- NEXT: Mt Moon floor navigation (does it reach MT_MOON_B2F and the ROUTE_4 east part?); blocked counts are per-run memory, maybe decay them.
  Potion shop decision; catch a 2nd Pokemon for Misty.

## Session 20260926-180819
- BUG (live run 20260926-190408-337): ping-pong ROUTE_3 <-> ROUTE_4 ~10 times (Jev picked exit_south on ROUTE_4 at ~0.45, exit_north on ROUTE_3 at 0.93).
  Also ROUTE_4 door_24_5 -> MT_MOON_B1F is the Mt Moon EAST exit (not reachable from west side).
- Fix: memory.mapHistory (last 30 map arrivals, in explore()). backNote(to) appends to door/exit option text "you JUST CAME FROM X (backtracking)"
  and, if >=4 transitions between here and X in history, "moved between here and X N times recently - a LOOP, not progress".
- Test (10000 frames from live ROUTE_4): 10 Jev calls, 0 errors; notes shown; ended in MT_MOON_1F (still some ROUTE_3/ROUTE_4 bouncing early).
- NEXT: Mt Moon floor navigation to B2F / east exit (check live logs); if still looping, consider putting explicit "Mt Moon path" hints in goal
  (1F -> B1F -> B2F -> B1F -> ROUTE_4 east). Potion shop decision; catch a 2nd Pokemon for Misty.

## Session 20260926-181319
- Live run 20260926-190912-372: MT_MOON_1F doors door_5_5/door_17_11 were marked "unreachable" (tried>=3, all failed) although all 1F ladders are walkable;
  likely cause: wild Zubat/Geodude encounters interrupt the walk and were counted as failures.
- Fix: in explore(), if still on the same map and inBattle after the action, the attempt is un-counted (tried--, not failed, cache dropped).
- Test (10000 frames from live MT_MOON_1F): 13 Jev calls, 0 errors, 1 battle interruption correctly not counted. BUT Jev chose door_14_35/15_35
  (Mt Moon's exit back to ROUTE_4 west) and the bot again ping-ponged ROUTE_3 <-> ROUTE_4, ending on ROUTE_4.
- NEXT: the backtracking out of Mt Moon is the main blocker. Add an explicit fact to MT_MOON_1F door options: door at (14,35)/(15,35) = "exit back to ROUTE_4 west
  (BACKWARDS)", and the ladders (5,5),(17,11),(25,15) lead down to B1F (progress). Put the Mt Moon path in the goal: 1F -> B1F -> B2F -> B1F -> ROUTE_4 east.

## Session 20260926-181819
- Added moonNote(from,to): map facts appended to door/stairs options for Mt Moon warps: 1F->ROUTE_4 = BACKWARDS (west entrance), 1F->B1F = PROGRESS ladder,
  B1F->B2F progress, B1F->1F backwards, B1F->ROUTE_4 = east exit (goal side), B2F->B1F = try unused ladders (one reaches B1F east part), ROUTE_4->MT_MOON_1F progress.
  Goal text now spells out the path 1F -> B1F -> B2F -> B1F east part -> ROUTE_4 east.
- Test (10000 frames from live ROUTE_4): 11 Jev calls, 0 errors; ROUTE_4 -> MT_MOON_1F, Lv20->21; Jev now picks the 1F ladders (door_5_5, door_17_11) instead of the entrance,
  but walks were interrupted by battles so it hadn't reached B1F yet within the test.
- NEXT: check live logs for reaching B1F/B2F; if a ladder walk keeps getting interrupted, fine; if B2F loops, add per-ladder coordinates notes. Potion shop; 2nd Pokemon for Misty.

## Session 20260926-182319
- Live run 20260926-191410-614: in MT_MOON_1F Jev picked door_14_35 (entrance, labelled BACKWARDS) ~5 times right after arriving at (14,35), then ROUTE_3<->ROUTE_4 ping-pong.
- Fix: explore() drops options whose text has "[BACKWARDS" or "a LOOP, not progress" whenever some option has "[PROGRESS" (never empties options); ctx.removedBackwards tells Jev.
- Test (10000 frames from live MT_MOON_1F, 3 Jev calls, 0 errors): Jev picked ladders door_17_11, door_5_5, door_25_15; but walks to door_5_5 failed 3x without battle
  (pathing to 1F ladders may be broken - still on 1F at end). Removal didn't trigger in test (never stood at the entrance).
- NEXT: debug why walking to MT_MOON_1F ladders (5,5)/(17,11)/(25,15) fails (check path/warp activation for ladders: may need to step onto tile, not face it).

## Session 20260926-182819
- Live run 20260926-191908-078: reached MT_MOON_B1F 7x via 1F ladder (25,15), Jev picked door_21_17 (->B2F) each time, but walkTo found no path
  (disconnected B1F pocket) and the fallback direction-mashing stepped back onto the arrival ladder -> 1F. Loop 1F<->B1F.
- Fix: warp options compute bfs reachability; unreachable non-edge warps get "[UNREACHABLE: no walkable path...]" in the text, their action
  just records a failure (no mashing), and they don't count as PROGRESS for the backwards-filter (so the ladder back up stays available).
- Test (10000 frames from MT_MOON_POKECENTER): Jev answered, 0 crashes; stayed on 1F (Jev picked ladders 17_11 / 5_5, battles) so fix not exercised yet.
- NEXT: check live logs on B1F: does it now pick a reachable ladder? Which 1F ladder leads to a B1F section with a B2F ladder (maybe add per-ladder notes
  from rom.maps warp dest coords). Potion shop; 2nd Pokemon for Misty.

## Session 20260926-183319
- Live run 20260926-192931-238: B1F<->B2F loop. On B2F, the ladder at (5,7) leads to B1F (23,3), the east pocket with the ROUTE_4 east exit. It was marked UNREACHABLE only because
  bfs treats NPCs/fossils as walls (Super Nerd and fossils block the path). Jev kept picking door_15_27 (0.86).
- Fix: bfs(g,x,y,adj,ignoreNpcs). If a warp is unreachable with NPCs but reachable without them, it is no longer UNREACHABLE; the option text says
  "[BLOCKED BY A PERSON/OBJECT at (x,y) name: talk to / battle it first]".
- Test (8000 frames from live B1F): 17 Jev calls. B1F<->B2F, then went back out to 1F/ROUTE_4 (backwards). No BLOCKED note seen in this test.
- NEXT: check that B2F shows the BLOCKED note for door_5_7, and Jev talks to or battles the NPC (talk_ option). Maybe mark the B2F (5,7) ladder as [PROGRESS] in moonNote.

## Session 20260926-183819
- Live run 20260926-193424-036: stuck on ROUTE_4 WEST side (after going back out of Mt Moon) talking to a bug catcher 50x. Cause: the backwards/loop filter
  removed door_18_5 (Mt Moon entrance) because it was tagged both [PROGRESS] and "a LOOP" (ROUTE_4<->MT_MOON_1F bounces), leaving only talk options.
- Fix: the filter never removes an option that itself carries [PROGRESS.
- Test (8000 frames from live ROUTE_4): 8 Jev calls; Jev picked exit_east, then door_18_5 (entered MT_MOON_1F), then ladders door_17_11/door_5_5 + battles. Ended in MT_MOON_1F.
- NEXT: the bot keeps leaving Mt Moon backward after B2F. Consider tagging the B2F (5,7) ladder as [PROGRESS] (leads to B1F east pocket at (23,3)),
  and filter talk options talked >=10 times. Also Potion shop; 2nd Pokemon for Misty.

## Harness note from the operator (2026-09-26, after session 183819)
- NEW in grid(): `blockedMoves` = [{x, y, dir}] steps the game refuses between two walkable squares (cave/forest elevation, the tileset's
  tile-pair collisions). They are invisible in `rows`. bfs() in bot.js now skips them; any other pathing must too. Mt Moon 1F has 131 such edges,
  which is why walks stalled at (10,22), (24,26), (2,21) and the ladders got marked "unreachable".
- Mt Moon ground truth (from the ROM map data, verified): the only 1F ladder on the route is (5,5) (top-left, Hiker below it). (17,11) and (25,15)
  lead to dead-end pockets: B1F (25,15)->(13,27)->B2F (15,27) is a SEALED pocket (Rocket + HP UP), and B1F (25,9)->B2F (25,9) is a raised
  side area (Rockets + TM). Route: 1F (5,5) -> B1F pocket -> (21,17) -> B2F main area -> battle the Super Nerd at (12,8) -> talk to a fossil
  at (12,6)/(13,6) and take it (the other is hidden and the Nerd steps aside) -> ladder (5,7) -> B1F (23,3) -> exit (27,3) -> ROUTE_4 east.
  Until the fossil is taken, (5,7) is genuinely unreachable; it is NOT an NPC-blocking issue. moonNote's "every ladder down is PROGRESS" is wrong.
- SPRITE_NAMES is misaligned with pokered: $18 (24) = Rocket (shown as "a man"), $0c (12) = Super Nerd (shown as "a lass"), $0e (14) = Hiker,
  $3e (62) = fossil, $3d (61) = Poké Ball item. See vendor sprite_constants (SPRITE_* order).
- After a warp, state().map changes before x/y, sprites and map blocks update: explore() has built option lists from the previous floor
  (a B1F question listed B2F's NPCs at x=29 on a 28-wide map). Wait until npcs are inside the grid and the position is on a walkable tile.
- talk options use g.npcs.slice(0,6): on B2F that cuts off the second fossil and the items.

## Session 20260926-190428
- Applied the operator's Mt Moon ground truth: moonNote(from,to,w) now tags ladders by COORDINATE: 1F (5,5)=PROGRESS, other 1F ladders=DEAD END;
  B1F (21,17)=PROGRESS, other B1F->B2F=DEAD END; B2F (5,7)=PROGRESS (after Super Nerd + fossil), other B2F->B1F=backwards; B1F->ROUTE_4=PROGRESS.
- SPRITE_NAMES overrides: 12=Super Nerd, 14=Hiker, 24=Rocket, 61=Poke Ball item, 62=FOSSIL. talk options now slice(0,10) (was 6, cut off fossils).
- Test (10000 frames from live B2F): 13 Jev calls, no crash. Live state is in the SEALED B2F pocket (door_15_27 area) -> Jev went up, wandered B1F/1F,
  picked 1F door_5_5 at the end. Fossil options now appear in Jev's list with the FOSSIL note.
- NEXT: verify the full route in live logs (1F 5,5 -> B1F 21,17 -> B2F: battle Nerd, take fossil, 5,7). Note that the backwards-filter treats
  "[PROGRESS" as protected; DEAD END options could also be filtered when a PROGRESS option is reachable. Also post-warp settle bug (operator note).

## Session 20260926-190928
- Live run 20260926-200517-813 (storyEvents 25 = fossil likely taken): on B1F Jev was torn (0.46/0.54, conf 0.08) between door_21_17 (PROGRESS but
  its LOOP note said "pick something else") and door_27_3, which showed as "leading to the previous map" with NO moon note (exit warp dest = last map).
- Fix: moonNote tags B1F (27,3)/(26,3) as the PROGRESS east exit by coordinate. The LOOP note no longer says "pick something else" for a
  [PROGRESS option (says it is the marked route). Wild-battle fallback goal text no longer says "Pewter City and Brock".
- Test (8000 frames from live B1F): 7 Jev calls, no crash, ended on B2F; Jev saw door_5_7 PROGRESS and picked talk_0 (the Super Nerd/fossil step).
- NEXT: check the live logs to see whether the bot uses B2F (5,7), then B1F (27,3), and reaches ROUTE_4 east, then Cerulean. Consider filtering
  DEAD END/backwards ladders when a reachable PROGRESS option exists. After that: Potion shop, 2nd Pokemon for Misty.

## Session 20260926-191428
- Live run 20260926-201023-839: Jev spread thin (conf 0.15-0.33) over 13 B2F options (4 Rockets, items, fossils, ladders).
- Change: SPRITE_NAMES text only: Super Nerd = [PROGRESS on B2F: battle him first]; Rocket grunt = optional; FOSSIL = [PROGRESS after Nerd: take one (YES), then ladder (5,7)].
- Test (5000 frames from live B2F): 7 Jev calls, no crash, Super Nerd beaten (storyEvents 26->27, +300 money).
- PROBLEM SEEN: after the Nerd was beaten Jev kept picking talk_0 (the Nerd) again (~0.28). NEXT: once the Nerd's battle is won
  (storyEvents>=27 on B2F / Nerd talked>=1), drop his PROGRESS tag and say "already beaten"; push the fossil (12,6)/(13,6) then door_5_7.
  Verify taking a fossil answers YES (bot presses A through text; YES is default).

## Session 20260926-191929
- Live run 20260926-201515-015: bot through Mt Moon (storyEvents 28) but ping-ponged ROUTE_4 (24,6) <-> B1F ~30x: exit_east "unreachable" because
  bfs() treated ledges (v < > ^) as walls, and Route 4 east needs ledge jumps. Also poisoned at 16% HP, no Potions.
- Fix: bfs() now hops ledges in their direction (lands 2 tiles on, one-way). moonNote: ROUTE_4 -> MT_MOON_1F is BACKWARDS when player x>=22 (east side).
- Test (6000 frames from live ROUTE_4): 5 Jev calls, no crash. Jev picked exit_east at once (now reachable), but the poisoned Wartortle fainted
  (money 4021->2010), woke at MT_MOON_POKECENTER (west side), and Jev then correctly re-entered Mt Moon 1F (door_18_5, door_5_5).
- NEXT: poison/low HP with no Potions: buy Potions/Antidotes (MT_MOON has no mart; Cerulean mart) - add a "shop" decision; heal goal text still
  names Pewter/Viridian centers even on ROUTE_4 (should say MT_MOON_POKECENTER west / CERULEAN_POKECENTER east). Verify Route 4 east -> CERULEAN.

## Session 20260926-192429
- Added nearestCenter(st): the low-HP goal text now names the location-appropriate Pokemon Center (CERULEAN_POKECENTER for Route 4 east/Cerulean,
  MT_MOON_POKECENTER for Mt Moon/Route 3/Route 4 west, PEWTER, VIRIDIAN) instead of always Pewter/Viridian.
- Test (6000 frames from live B2F, money 2010 after the faint): 6 Jev calls, no crash, Wartortle Lv24->25, still on B2F at 100% HP,
  so the new low-HP text was NOT exercised yet.
- NEXT: confirm B2F -> (5,7) ladder -> B1F (27,3) -> ROUTE_4 east -> CERULEAN in live logs. Then a Jev "shop" decision at CERULEAN_MART
  (Potions/Antidotes/Poke Balls; money ~2000) and catching a 2nd Pokemon (Grass/Electric for Misty).

## Session 20260926-192929
- Live reached CERULEAN_GYM (Lv26 Wartortle, beat 2 gym trainers). Gym labels still said "Brock"/"train to ~Lv13".
- Change: gymWho names Misty (Staryu 18/Starmie 21, Cascade Badge) in CERULEAN_GYM; gym exit note now "heal / restore PP"; storyGoal has a
  CERULEAN_GYM branch (battle Misty now; leave to heal only if HP<60% or BITE PP nearly out).
- Test (8000 frames from live gym): 8 Jev calls, no crash; Jev picked talk_0 (Misty), beat Staryu, but BITE ran out of PP vs Starmie
  (Jev switched to WATER GUN, 0.5x) and the battle was still going at the end. BITE PP was only 4 entering the gym.
- NEXT: see if live beats Misty. If it loses: give the goal/door question the lead's move PP (party move PP) so Jev heals at the
  CERULEAN_POKECENTER before Misty; catch a Grass/Electric Pokemon (Oddish/Bellsprout on ROUTE_24/25) as a 2nd party member.

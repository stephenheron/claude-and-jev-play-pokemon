# Pokémon Red harness

Pokémon Red running in a Game Boy emulator in Node. Drop a bot into `bots/bot.js` and it plays the game in a sandbox. Save the file and it reloads with the new code, and every run is logged for review.

- **Sandboxed bots:** each bot runs in its own V8 isolate, with no Node APIs and a memory cap.
- **Jev decisions:** bots can ask Jev, TypeSafe's decision model, through OpenRouter. The API key stays in the host.
- **Run logs:** every action, the exact code that ran, and save states plus screenshots at both ends.
- **Raw hooks:** press, hold and wait on buttons, one frame at a time.
- **Game state:** map, position, party, box, bag, money, badges, battle, event flags, sprites and on-screen text, read straight from the game's memory. It never writes to memory.
- **Save states:** save and load the whole emulator.
- **Viewer:** a local browser page with the live screen, party and events.
- **Streaming:** video, audio and a side panel drawn in the game's own font, sent through ffmpeg to YouTube, Twitch or a file.

There's no built-in decision logic. The bot you write is what plays.

> You need your own legally obtained copy of Pokémon Red. No ROM is included or distributed here. See [Legal](#legal).

## Setup

Requirements: macOS or Linux, Node 24+, git, and Homebrew (for `rgbds`). Streaming also needs `ffmpeg`.

```bash
npm install
npm run setup                 # installs rgbds, clones + builds pret/pokered, generates src/data/generated.json
cp /path/to/your/pokered.gb roms/red.gb   # your own dump of Pokémon Red (US/EU)
cp .env.example .env          # optional
```

The ROM must be the US/EU release, with SHA-1 `ea9bcae617fdf159b045185467ae58b2e4a48b9a`. Memory addresses come from the [pret/pokered](https://github.com/pret/pokered) disassembly of that exact build, so other versions won't work.

## Running bots

```bash
npm start                              # viewer at http://localhost:8787, real time, resumes the autosave
npm start -- --fresh                   # boot a new game instead of resuming
npm start -- --load <save>             # start from saves/<save>.state.json
npm start -- --speed 0                 # as fast as possible (--speed 2 = double speed)
npm start -- --headless                # no viewer
```

- **The bot:** the host runs `bots/bot.js`. Other `.js` files in `bots/` can be helpers it imports with relative paths.
- **Reloading:** saving any `.js` file in `bots/` stops the running bot and starts the new code. The game carries on from where it is.
- **Game timing:** while a bot runs, the game only advances when the bot presses a button or waits. When the bot finishes or crashes, the game idles in real time until the next save.
- **New games:** before the bot starts a new game, the host opens OPTION from the title menu and sets text speed FAST and battle animations OFF, using button presses only. It then leaves the game on the title screen for the bot.
- **Saving:** the host autosaves every 5 minutes and on Ctrl+C.
- **Running time:** the total time the host has been running, across stops and restarts, is kept in `logs/uptime.json` (flushed every 30 seconds) and shown in the viewer and on the stream panel. Delete the file to start counting from zero.
- **Streaming:** the host streams if `STREAM_URL` or `YOUTUBE_STREAM_KEY` is set.

The included [`bots/bot.js`](bots/bot.js) presses through Oak's intro and stops in Red's bedroom.

## Writing a bot

```js
export default function play({ press, hold, wait, screen, state, party, log }) {
  while (true) {
    const s = screen();
    if (s.waitingForA) press('A');
    else hold('UP', 16);
  }
}
```

The API is passed in as an argument, and is also available as globals. Every call is synchronous, with no `await` needed. A bot can also skip the default export and run its code at the top level.

| Group | Calls |
|---|---|
| Input | `press(button, hold = 4, release = 8)`, `hold(button, frames)`, `wait(frames)`, `frame([buttons])`. Buttons are `A B START SELECT UP DOWN LEFT RIGHT`. Up to 600 frames per call. |
| State | `state()` (map, x, y, facing, money, badges, inBattle, playerName, frames, ...), `party()`, `box()`, `bag()`, `battle()`, `sprites()`, `screen()` (text rows, dialog, `waitingForA`, cursor), `menu()`, `event('EVENT_…')` |
| Map | `grid()`: the current map's walls, grass, water, ledges, doors, NPCs and blocked moves (elevation). See [Getting around](#getting-around). |
| Memory | `read(symbolOrAddress, length = 1)` returns bytes (read-only). `sym(name)` returns an address. |
| ROM data | `rom.species`, `rom.moves`, `rom.items`, `rom.maps` (warps, signs, NPCs), `rom.typeChart`, `rom.effectiveness(type, [types])`, `rom.speciesByName(name)`, `rom.mapByName(name)` |
| Jev | `jev(state, questions)` returns `{ answers, usage }`. Needs `OPENROUTER_API_KEY` on the host. See [Asking Jev](#asking-jev). |
| Other | `save(name)` / `load(name)` (the bot's own saves, as `saves/bot-<name>`), `snapshot(label)` (a screenshot into the run log), `log(...)` / `console.log(...)` |

**Sandbox limits.** Bots are treated as untrusted code:
- **No Node APIs.** There's no `require`, `process`, `fs`, network or timers.
- **Imports:** only relative imports of files inside `bots/` work.
- **Memory:** 128 MB. A bot that goes over is stopped, and the reason is logged.
- **Stuck bots:** a bot stuck in a loop doesn't block the host, and saving new code replaces it.
- **Checked arguments:** every argument is checked. Save names can only use letters, numbers, `-` and `_`.
- **Rate limits:** logs are limited to 20 lines a second, 500 characters each. Saves are limited to one every 2 seconds, and screenshots to 500 per run.

## Getting around

`grid()` describes the current map. Coordinates are the same squares as `state().x` / `state().y`, with (0, 0) at the top left.

```
PALLET_TOWN 20x18
 ##########,,########      .  walkable            ,  tall grass (walkable)
 #..........@.......#      #  wall or obstacle    ~  water (needs SURF)
 #...####....####...#      T  cuttable tree       C  counter (talk across it)
 #..##D##...##D##...#      v < > ^  ledge: jump over it that way
 #..N...............#      D  door, stairs or warp   N  NPC or object   @  you
```

It returns `{ map, width, height, player, rows, legend, warps, npcs, exits, blockedMoves }`:
- `warps`: each door and staircase, with its coordinates and the map it leads to.
- `npcs`: where each NPC or object is right now.
- `exits`: the map edges that lead to other maps (north, south, west, east).
- `blockedMoves`: steps the game refuses between two squares that both look walkable, as `{ x, y, dir }` (`dir` is `up`, `down`, `left` or `right`; both directions of a blocked pair are listed). These are elevation differences in caves and forests (Mt Moon, Rock Tunnel, Viridian Forest, ...). They're invisible in `rows`, so a pathfinder that ignores them walks into a wall it can't see. Treat `{ x, y, dir }` as a wall between those two squares.

## Asking Jev

[Jev](https://openrouter.ai/docs/guides/community/jev) is a decision model. You send it some state and typed questions, and it returns picks with probabilities, not text. Bots call it through the host with OpenRouter's [Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request):

```js
const { answers, usage } = jev(
  { map: state().map, party: party(), dialog: screen().dialog },
  {
    next:  { type: 'choice', instructions: 'What should the player do next?', criteria: { heal: 'Go to the Pokémon Center', train: 'Fight in tall grass', explore: 'Look for the next town' } },
    risky: { type: 'noul',   instructions: 'Is the team too weak for the next gym?', criteria: { true: 'Yes', false: 'No' } },
    hp:    { type: 'score',  instructions: 'How healthy is the team?', criteria: ['Nearly fainted', 'Hurt', 'Fine'] },
  },
);
answers.next.choice;         // 'heal', with answers.next.probabilities and answers.next.confidence
answers.risky.noul;          // probability of yes, 0-1
answers.hp.score;            // position on the scale, 0-2
```

`bots/helpers.js` includes `choose(context, instructions, options)` for a single choice question.

**Setup:** put `OPENROUTER_API_KEY=sk-or-...` in `.env`. The key stays in the host and is never visible to bot code. Calls block the bot, and the game doesn't advance while Jev is answering.

**Spending:** every call is billed to your OpenRouter account, and bots are untrusted. Set a credit limit on the API key in OpenRouter. The host doesn't enforce its own spending or rate limits.

| Setting | Default | What |
|---|---|---|
| `JEV_MODEL` | `typesafe/jev-1.13` | Or `~typesafe/jev-latest` |
| `JEV_ZDR` | off | `1` routes only to zero-data-retention endpoints |
| `JEV_TIMEOUT_MS` | 15000 | Per request. Rate limits (429), 5xx errors and timeouts are retried twice. |

- **Refused calls:** a malformed request, one over 100 KB, or an error from OpenRouter makes `jev()` throw an error the bot can catch. Jev's context is 32k tokens, so OpenRouter would reject a bigger request anyway.
- **Viewer:** shows the number of calls and their cost since the host started.

## Run logs

Each code refresh gets its own folder, `logs/runs/<date>-<time>/`:

| File | What |
|---|---|
| `run.jsonl` | One line per action (`press`, `hold`, `wait`, `frame`, `save`, `load`, `snapshot`, `log`), with the time, frame, map and position afterwards. Each action also counts the reads (`screen`, `state`, ...) made since the one before. The first line is `start` and the last is `end`. Lines with `"fn": "game"` are **what the game itself did**, recorded by the host rather than reported by the bot: `text` (each finished text box, like "SQUIRTLE used BUBBLE!"), `move` (the move actually used, from its PP going down), `battle-start`, `enemy` (each opponent as it appears), `battle-end` (with `won`, `lost`, `caught` or `ran`) and `map` (each map change). Use them to check what the bot says it did. |
| `code/` | The bot files exactly as they were when the run started |
| `start.state.json`, `start.png` | The game when the run started. Load it, run `code/` again, and the run replays. |
| `end.state.json`, `end.png` | The game when the run ended |
| `jev.jsonl` | Every Jev call in full: the state and questions sent, the full response, and the time it took. `run.jsonl` also gets a short `jev` line with the picks and the cost. |
| `shots/` | Screenshots the bot took with `snapshot()` |
| `summary.json` | Duration, number of actions, reads, frames and logs, Jev calls and cost, the maps visited, and why the run ended (`finished`, `error` with the message, `reload` or `shutdown`) |

## Library API

The same pieces can also be used directly from TypeScript, without the host or sandbox:

```ts
import { Game, serveViewer, startStream, sym } from './src/index.js';

const game = new Game({ speed: 1 });   // rom: 'roms/red.gb', saveDir: 'saves'
serveViewer(game);                     // http://localhost:8787 (127.0.0.1 only)

game.press('START');                   // tap: hold 4 frames, release 8
game.hold('UP', 16);
game.wait(60);
game.frame(['A', 'RIGHT']);            // one frame with buttons held

const gs = game.state;
gs.mapName; gs.x; gs.y; gs.money; gs.badgeCount;
gs.party();                            // species, nickname, level, HP, status, types, moves, stats
gs.bag(); gs.box(); gs.battle(); gs.sprites();
gs.screen();                           // decoded text rows, dialog, ▼ prompt, cursor position
gs.event('EVENT_GOT_STARTER');         // story flags by pokered name
game.mem[sym('wPlayerMoney')];         // any address by pokered symbol name

game.save('before-gym'); game.load('before-gym');
game.screenshot('logs/now.png');
await game.yield();                    // let the viewer/stream run; waits here while paused
```

- **Frames:** button methods run the emulator synchronously. One `frame()` is one serverboy CPU slice, about half a Game Boy frame.
- **Speed:** `speed` sets the pace. 0 runs as fast as possible and 1 is real time.
- **Yielding:** in long scripts, `await game.yield()` between actions. It lets the viewer and stream update, and it's where the viewer's pause button takes effect.
- **Listening:** `game.onFrame(fn)` and `game.onEvent(fn)` let you hook in. `game.log(kind, msg)` sends an event to the viewer.
- **ROM data:** `game.rom` has species, moves, items, the type chart and evolutions, all read from your ROM.

## Project layout

| Path | What |
|---|---|
| `src/host.ts` | `npm start`: game, viewer, stream, autosave, and the bot reloader |
| `src/sandbox.ts` | runs `bots/bot.js` in an isolate and bridges the API |
| `src/runlog.ts` | the per-run log in `logs/runs/` |
| `src/jev.ts` | the Jev client for OpenRouter, with its spending limits |
| `bots/` | the bot (`bot.js`) and its helpers |
| `src/game.ts` | `Game`: emulator + state + pacing + save states |
| `src/emu/` | serverboy (GameBoy-Online core) wrapper, PNG encoder |
| `src/game/` | ROM tables, live state reader, pokered symbols, text decoding |
| `src/viewer.ts`, `web/` | local browser viewer |
| `src/stream/` | ffmpeg live stream and side panel |
| `scripts/` | setup, data generation, debug tools |

## Legal

- **No ROM included.** This repo doesn't contain or link to Pokémon Red, and you need your own legally obtained copy. `roms/` is gitignored.
- **No Nintendo assets.** Game data (symbols, names, maps, font) is read at runtime from *your* ROM. The symbol file is generated locally from the [pret/pokered](https://github.com/pret/pokered) disassembly during `npm run setup`, which clones it into `vendor/`. That disassembly isn't redistributed here, and `vendor/` and `src/data/generated.json` are gitignored.
- **Not affiliated.** Pokémon is a trademark of Nintendo, Creatures Inc. and GAME FREAK inc. This is a fan project, not affiliated with or endorsed by any of them.
- **License.** GPL-2.0-or-later (see [`LICENSE`](LICENSE)), because it builds on the GPL-licensed [serverboy](https://gitlab.com/piglet-plays/serverboy.js) / GameBoy-Online emulator core.

Based on [jev-pokemon](https://github.com/christianmat/jev-pokemon) by [Christian Mathiesen](https://github.com/christianmat), with its built-in Jev bot replaced by a sandbox for your own bots, which can call Jev through OpenRouter.

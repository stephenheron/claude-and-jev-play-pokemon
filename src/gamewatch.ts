import type { Game } from './game.js';
import { sym } from './game/symbols.js';

// What the game actually did during a bot run, observed by the host (not reported by the bot):
// finished text boxes, the move used each turn (from its PP dropping), battle start/end and map changes.
// Written to run.jsonl as { fn: 'game', what: ... } so it can be checked against what the bot says it did.

const EVERY = 4;       // sample every 4 frames
const STABLE = 3;      // a text box counts as finished once unchanged for 3 samples (it's no longer being typed)

export function watchGame(game: Game, record: (what: string, data: Record<string, unknown>) => void) {
  const gs = game.state;
  let text = '', textSeen = 0, lastText = '';
  let map = gs.mapName;
  let inBattle = gs.inBattle;
  let battle: { kind: string; enemy: string; owned: number; lastEnemyHp: number } | null = null;
  let pp: { species: string; moves: { name: string; pp: number }[] } | null = null;

  const ownedCount = () => {
    let n = 0;
    for (let a = sym('wPokedexOwned'); a < sym('wPokedexOwnedEnd'); a++) for (let b = game.mem[a]; b; b &= b - 1) n++;
    return n;
  };
  const activeMoves = () => {
    const b = gs.battle();
    return { species: b.player.species, moves: b.player.moves.map((m) => ({ name: m.name, pp: m.pp })) };
  };

  if (inBattle) {
    const b = gs.battle();
    battle = { kind: b.kind, enemy: `${b.enemy.species} Lv${b.enemy.level}`, owned: ownedCount(), lastEnemyHp: b.enemy.hp };
    pp = activeMoves();
    record('battle-start', { kind: b.kind, alreadyInProgress: true });
    record('enemy', { enemy: battle.enemy, hp: `${b.enemy.hp}/${b.enemy.maxHp}` });
  }

  return game.onFrame((_screen, frame) => {
    if (frame % EVERY) return;

    // map changes
    if (gs.mapName !== map && !gs.inBattle) { record('map', { from: map, to: gs.mapName }); map = gs.mapName; }

    // battles
    const nowIn = gs.inBattle;
    if (nowIn && !inBattle) {
      // the battlers aren't loaded yet (memory still holds the last battle's): each opponent is recorded as it appears
      battle = { kind: gs.battle().kind, enemy: '', owned: ownedCount(), lastEnemyHp: -1 };
      pp = null;
      record('battle-start', { kind: battle.kind });
    }
    if (nowIn && battle) {
      const b = gs.battle();
      // a new opponent (the first, or a trainer's next): a different species, or the same species back from 0 HP.
      // Skips leftovers from the last battle (fainted, 0 HP). Not keyed on level: during an attack the game briefly
      // puts the player's level in the enemy's slot.
      const species = battle.enemy.split(' Lv')[0];
      if (b.enemy.species !== '?' && b.enemy.hp > 0 && (b.enemy.species !== species || battle.lastEnemyHp === 0)) {
        battle.enemy = `${b.enemy.species} Lv${b.enemy.level}`;
        record('enemy', { enemy: battle.enemy, hp: `${b.enemy.hp}/${b.enemy.maxHp}` });
      }
      if (battle.enemy) battle.lastEnemyHp = b.enemy.hp;
      // the move actually used: its PP dropped by one (same Pokémon, same move list)
      const now = activeMoves();
      if (pp && pp.species === now.species && pp.moves.length === now.moves.length) {
        now.moves.forEach((m, i) => {
          if (pp!.moves[i].name === m.name && m.pp === pp!.moves[i].pp - 1) record('move', { by: now.species, move: m.name, ppLeft: m.pp });
        });
      }
      pp = now;
    }
    if (!nowIn && inBattle && battle) {
      const party = gs.party();
      const result = party.length && party.every((p) => p.hp === 0) ? 'lost'
        : ownedCount() > battle.owned ? 'caught'
        : battle.lastEnemyHp === 0 ? 'won'
        : battle.kind === 'wild' ? 'ran' : 'ended';
      record('battle-end', { kind: battle.kind, enemy: battle.enemy, result, team: party.map((p) => `${p.species} Lv${p.level} ${p.hp}/${p.maxHp}`) });
      battle = null; pp = null;
    }
    inBattle = nowIn;

    // finished text: the box stopped changing (typed out), and it's not what we recorded last (menus, with a cursor, are skipped)
    const s = gs.screen();
    const t = s.hasTextBox && !s.cursor ? s.dialog.replace(/[▼▶]/g, '').replace(/\s+/g, ' ').trim() : '';
    if (t !== text) { text = t; textSeen = 0; return; }
    if (!t || ++textSeen !== STABLE || t === lastText) return;
    lastText = t;
    record('text', { text: t });
  });
}

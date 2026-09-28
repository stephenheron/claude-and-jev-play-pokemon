// Helpers can live in their own files in bots/ and be imported with relative paths.

/** The "NEW NAME / RED / ASH / JACK" menu, with the cursor on NEW NAME. */
export function isNamePrompt(s) {
  return !!s.cursor && s.rows[s.cursor.y].includes('NEW NAME');
}

/**
 * Ask Jev to pick one option. `options` maps each option name to a description of it.
 * Returns { choice, confidence, probabilities }. Throws if Jev is off on this host or the request is refused.
 *   const { choice } = choose(state(), 'Where should the player go next?', { north: 'Route 1', lab: "Oak's lab" });
 */
export function choose(context, instructions, options) {
  const { answers } = jev(context, { pick: { type: 'choice', instructions, criteria: options } });
  return answers.pick;
}

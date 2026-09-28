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

/** choose() with a safe fallback: never throws, returns the option name. */
export function askChoice(context, instructions, options, fallback) {
  try {
    const a = choose(context, instructions, options);
    log(`jev: ${a.choice} (conf ${a.confidence})`);
    return a.choice in options ? a.choice : fallback;
  } catch (e) { log(`jev failed: ${e}`); return fallback; }
}

/** Like askChoice, but also returns Jev's probabilities: { choice, probabilities, confidence }. Never throws. */
export function askChoiceP(context, instructions, options, fallback) {
  try {
    const a = choose(context, instructions, options);
    log(`jev: ${a.choice} (conf ${a.confidence})`);
    return { choice: a.choice in options ? a.choice : fallback, probabilities: a.probabilities || {}, confidence: a.confidence };
  } catch (e) { log(`jev failed: ${e}`); return { choice: fallback, probabilities: {}, confidence: 0 }; }
}


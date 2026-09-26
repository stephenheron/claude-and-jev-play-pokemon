// Example bot: presses through Oak's intro (names: RED and BLUE) and stops in Red's bedroom.
// Save this file (or any .js file in bots/) and the host restarts the bot with the new code.
// The API is passed in, and is also available as globals: press, hold, wait, screen, state, party, ...
import { isNamePrompt } from './helpers.js';

export default function play({ press, wait, screen, state, log, snapshot }) {
  if (state().playerName === 'RED') { log('already past the intro: nothing to do'); return; }
  let lastText = '';
  for (let i = 0; i < 400; i++) {
    const s = screen(), st = state();
    // done once we're named and standing in Red's bedroom (map tiles only: no text, menus or intro screens)
    if (st.playerName === 'RED' && st.map === 'REDS_HOUSE_2F' && s.nonMapTiles === 0) break;
    // log each finished line of text once (the ▼ prompt means it's done typing)
    if (s.waitingForA && s.dialog !== lastText) { lastText = s.dialog; log(`text: ${s.dialog.replace(/▼/g, '').trim()}`); }
    // name prompts: move from NEW NAME down to the first preset name (RED, then BLUE for the rival)
    if (isNamePrompt(s)) { press('DOWN'); press('A', 4, 20); continue; }
    // the title screen needs START; speech and menus advance with A
    press(s.hasTextBox || s.cursor ? 'A' : 'START', 4, 20);
  }
  wait(60); // let the screen fade in from white
  snapshot('bedroom');
  const st = state();
  log(`done: ${st.playerName} is in ${st.map} at (${st.x}, ${st.y}) with ¥${st.money}`);
}

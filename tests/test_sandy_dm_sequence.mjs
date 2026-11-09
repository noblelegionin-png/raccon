import assert from 'node:assert';
import { browserPlanner } from './src/browser/browserPlanner.js';

console.log('🧪 Simulating Sandy Direct Discord DM Test Sequence...\n');

const turns = [
  { input: 'YouTube', expectAction: 'tab_open' },
  { input: 'Play rock roll song', expectAction: 'tab_open', expectClick: true },
  { input: 'Play any Indian music love song in youtube', expectAction: 'tab_open', expectClick: true },
  { input: 'open the third result', expectAction: 'page_click', ordinal: 3 },
  { input: 'pause', expectAction: 'page_click' },
  { input: 'zoom in', expectAction: 'zoom_in' },
  { input: 'clean tabs', expectAction: 'tabs_clean' },
];

for (let i = 0; i < turns.length; i++) {
  const turn = turns[i];
  console.log(`Step ${i + 1}: Sandy sends "${turn.input}"`);

  // Check instruction recognition
  const isBrowser = browserPlanner.isBrowserInstruction(turn.input, { hasRecentBrowserContext: true });
  assert.strictEqual(isBrowser, true, `Step ${i + 1} must be recognized as browser instruction!`);

  // Check fast-path plan
  const plan = browserPlanner.parseFastPath(turn.input);
  assert(plan && plan.length > 0, `Step ${i + 1} must produce a valid plan!`);

  assert.strictEqual(plan[0].action, turn.expectAction);

  if (turn.expectClick) {
    assert(plan.length >= 2, 'Playback plan must have at least 2 steps (open + click)');
    assert.strictEqual(plan[1].action, 'page_click');
  }

  if (turn.ordinal) {
    assert(plan[0].params.selector.includes(`:nth-of-type(${turn.ordinal})`));
  }

  console.log(`  ✅ Successfully planned: [${plan.map(p => p.action).join(' -> ')}]\n`);
}

console.log('🎉 Boss Sandy DM sequence verified with 100% precision!');

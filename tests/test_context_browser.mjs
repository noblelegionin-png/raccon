import assert from 'node:assert';
import { browserPlanner } from './src/browser/browserPlanner.js';
import { detectOffTopic } from './src/discord/topicGuard.js';
import { detectHostilityOrAbuse } from './src/discord/abuseGuard.js';

console.log('🧪 Starting Rocket Browser & Context Comprehensive Test Suite...\n');

// ---------------------------------------------------------------------------
// Suite 1: Browser Instruction Recognition (Zero Missed Commands)
// ---------------------------------------------------------------------------
console.log('--- Suite 1: Browser Instruction Recognition ---');

const browserPrompts = [
  'Play rock roll song',
  'Play any Indian music love song in youtube',
  'play rick roll',
  'watch lofi hip hop',
  'listen to classical piano',
  'stream lofi beats',
  'open the third result',
  'click on the first video',
  'open 2nd result',
  'play 3rd video',
  'pause',
  'pause video',
  'resume',
  'unpause',
  'mute',
  'unmute',
  'zoom in',
  'zoom out',
  'zoom reset',
  'clean tabs',
  'close tab',
  'duplicate tab',
  'search for best mechanical keyboard',
  'google nodejs sqlite tutorial',
  'open github.com',
  'youtube',
  'https://www.youtube.com',
];

for (const p of browserPrompts) {
  const isB = browserPlanner.isBrowserInstruction(p);
  assert.strictEqual(isB, true, `Expected "${p}" to be recognized as browser instruction!`);
  console.log(`  ✅ Recognized: "${p}"`);
}

// Multi-turn context test
const followUpWithContext = browserPlanner.isBrowserInstruction('third one', { hasRecentBrowserContext: true });
assert.strictEqual(followUpWithContext, true, 'Expected "third one" with recent browser context to be recognized!');
console.log('  ✅ Recognized multi-turn: "third one" (with browser context)');

// Non-browser chat messages should NOT be browser instructions
const nonBrowserPrompts = [
  'Hello Rocket how are you doing today?',
  'What is the meaning of life?',
  'Who created you?',
  'Can we discuss the server plan for next week?',
];

for (const p of nonBrowserPrompts) {
  const isB = browserPlanner.isBrowserInstruction(p);
  assert.strictEqual(isB, false, `Expected "${p}" NOT to be recognized as browser instruction!`);
  console.log(`  ✅ Non-browser conversational correctly identified: "${p}"`);
}

// ---------------------------------------------------------------------------
// Suite 2: Fast-Path Deterministic Plans
// ---------------------------------------------------------------------------
console.log('\n--- Suite 2: Fast-Path Deterministic Plans ---');

// 1. Play rock roll song
const planRock = browserPlanner.parseFastPath('Play rock roll song');
assert(planRock, 'Plan for "Play rock roll song" should not be null');
assert.strictEqual(planRock.length, 2);
assert.strictEqual(planRock[0].action, 'tab_open');
assert(planRock[0].params.url.includes('search_query=rock%20roll%20song'), 'URL should include search_query');
assert.strictEqual(planRock[1].action, 'page_click');
console.log('  ✅ "Play rock roll song" -> [tab_open, page_click]');

// 2. Play any Indian music love song in youtube
const planIndian = browserPlanner.parseFastPath('Play any Indian music love song in youtube');
assert(planIndian, 'Plan for Indian music should not be null');
assert.strictEqual(planIndian.length, 2);
assert.strictEqual(planIndian[0].action, 'tab_open');
assert(planIndian[0].params.url.includes('any%20Indian%20music%20love%20song'));
assert(!planIndian[0].params.url.includes('in%20youtube'), 'Should strip "in youtube" from query');
assert.strictEqual(planIndian[1].action, 'page_click');
console.log('  ✅ "Play any Indian music love song in youtube" -> [tab_open, page_click]');

// 3. Open third result
const planThird = browserPlanner.parseFastPath('open the third result');
assert(planThird, 'Plan for third result should not be null');
assert.strictEqual(planThird.length, 1);
assert.strictEqual(planThird[0].action, 'page_click');
assert(planThird[0].params.selector.includes(':nth-of-type(3)'), 'Selector must target 3rd item');
console.log('  ✅ "open the third result" -> [page_click (3rd)]');

// 4. Click 1st video
const plan1st = browserPlanner.parseFastPath('click 1st video');
assert(plan1st, 'Plan for 1st video should not be null');
assert.strictEqual(plan1st.length, 1);
assert.strictEqual(plan1st[0].action, 'page_click');
assert(plan1st[0].params.selector.includes(':nth-of-type(1)'), 'Selector must target 1st item');
console.log('  ✅ "click 1st video" -> [page_click (1st)]');

// 5. Media controls: pause / resume
const planPause = browserPlanner.parseFastPath('pause');
assert.strictEqual(planPause[0].action, 'page_click');
console.log('  ✅ "pause" -> [page_click (play button)]');

const planResume = browserPlanner.parseFastPath('resume');
assert.strictEqual(planResume[0].action, 'page_click');
console.log('  ✅ "resume" -> [page_click (play button)]');

// 6. Search
const planSearch = browserPlanner.parseFastPath('search for best laptop');
assert.strictEqual(planSearch[0].action, 'tab_open');
assert(planSearch[0].params.url.includes('google.com/search?q=best%20laptop'));
console.log('  ✅ "search for best laptop" -> [tab_open (Google)]');

// ---------------------------------------------------------------------------
// Suite 3: Topic Respect & Channel Hygiene Guard
// ---------------------------------------------------------------------------
console.log('\n--- Suite 3: Topic Respect & Channel Hygiene Guard ---');

const generalChannel = { name: 'general', id: '1000' };

// Coding question in #general
const offTopicCoding = detectOffTopic({ content: 'hey can someone help me write a python script for my bot' }, generalChannel);
assert(offTopicCoding, 'Should detect off-topic coding request in #general');
assert.strictEqual(offTopicCoding.topicKey, 'coding');
console.log(`  ✅ Coding in #general detected -> redirect to #${offTopicCoding.fallbackChannel}`);

// Payment question in #general (including Sandy's exact test phrase "where are payemnts guys")
const offTopicPayments = detectOffTopic({ content: 'where are payemnts guys' }, generalChannel);
assert(offTopicPayments, 'Should detect off-topic payment inquiry in #general');
assert.strictEqual(offTopicPayments.topicKey, 'payments');
console.log(`  ✅ Payments in #general detected -> redirect to #${offTopicPayments.fallbackChannel}`);

// Casual chat in #general should be allowed
const casualInGeneral = detectOffTopic({ content: 'Good morning everyone! How is your day going?' }, generalChannel);
assert.strictEqual(casualInGeneral, null, 'Casual chat should be allowed in #general');
console.log('  ✅ Casual chat allowed in #general');

// ---------------------------------------------------------------------------
// Suite 4: Abuse Guard
// ---------------------------------------------------------------------------
console.log('\n--- Suite 4: Abuse Guard ---');

const abuse1 = detectHostilityOrAbuse('fuck you rocket you are trash');
assert.strictEqual(abuse1.isAbuse, true);
assert.strictEqual(abuse1.target, 'rocket');
console.log('  ✅ Hostility to Rocket detected');

const abuse2 = detectHostilityOrAbuse('sandy is an idiot');
assert.strictEqual(abuse2.isAbuse, true);
assert.strictEqual(abuse2.target, 'sandy');
console.log('  ✅ Hostility to Sandy detected');

const normalText = detectHostilityOrAbuse('Rocket please show me the server stats');
assert.strictEqual(normalText.isAbuse, false);
console.log('  ✅ Normal polite request passed without false positive');

console.log('\n🎉 ALL 4 TEST SUITES PASSED FLAWLESSLY! 100% OPERATIONAL.');

import assert from 'node:assert';

console.log('🧪 Testing Moderation Mentions & Administrative Directives Extraction...\n');

const botId = '1567226191864402003';
const sampleTargetId = '1477589102110183477';

function parseCommand(text) {
  let cleanCmd = text.toLowerCase().trim();
  cleanCmd = cleanCmd.replace(new RegExp(`^<@!?${botId}>\\s*`, 'i'), '').trim();
  cleanCmd = cleanCmd.replace(/^(?:(?:hey\s+|yo\s+)?rocket[,:\s]+|please\s+|can\s+you\s+)+/i, '').trim();

  const kickMatch = cleanCmd.match(/^(?:kick|boot)\s+(?:<@!?(\d+)>|(\d{17,20}))\s*(.*)/i);
  const banMatch = cleanCmd.match(/^(?:ban|perma\s*ban)\s+(?:<@!?(\d+)>|(\d{17,20}))\s*(.*)/i);
  const muteMatch = cleanCmd.match(/^(?:timeout|mute)\s+(?:<@!?(\d+)>|(\d{17,20}))(?:\s+(?:for\s+)?(\d+)([mhsd]))?\s*(.*)/i);
  const purgeMatch = cleanCmd.match(/^(?:purge|clear|clean|delete)\s+(\d+)\s*(?:messages?|msgs?)?/i);

  return { cleanCmd, kickMatch, banMatch, muteMatch, purgeMatch };
}

// 1. Kick with bot mention
const test1 = parseCommand(`<@${botId}> kick <@${sampleTargetId}> spamming in chat`);
assert(test1.kickMatch, 'Should match kick command with bot mention');
assert.strictEqual(test1.kickMatch[1], sampleTargetId);
assert.strictEqual(test1.kickMatch[3].trim(), 'spamming in chat');
console.log('  ✅ "@Rocket kick @user reason" -> correctly extracted target and reason');

// 2. Direct kick without bot mention
const test2 = parseCommand(`kick <@!${sampleTargetId}>`);
assert(test2.kickMatch, 'Should match direct kick command');
assert.strictEqual(test2.kickMatch[1], sampleTargetId);
console.log('  ✅ "kick @user" -> correctly extracted target');

// 3. Ban with bot mention
const test3 = parseCommand(`<@!${botId}> ban <@${sampleTargetId}> severe violation`);
assert(test3.banMatch, 'Should match ban command');
assert.strictEqual(test3.banMatch[1], sampleTargetId);
console.log('  ✅ "@Rocket ban @user reason" -> correctly extracted target');

// 4. Mute with duration
const test4 = parseCommand(`mute <@${sampleTargetId}> 10m spam`);
assert(test4.muteMatch, 'Should match mute command');
assert.strictEqual(test4.muteMatch[1], sampleTargetId);
assert.strictEqual(test4.muteMatch[3], '10');
assert.strictEqual(test4.muteMatch[4], 'm');
console.log('  ✅ "mute @user 10m spam" -> correctly extracted target and duration');

// 5. Purge
const test5 = parseCommand(`<@${botId}> purge 50`);
assert(test5.purgeMatch, 'Should match purge command');
assert.strictEqual(test5.purgeMatch[1], '50');
console.log('  ✅ "@Rocket purge 50" -> correctly extracted count');

console.log('\n🎉 ALL MODERATION MENTION TESTS PASSED FLAWLESSLY!');

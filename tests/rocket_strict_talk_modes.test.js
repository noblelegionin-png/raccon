import test from 'node:test';
import assert from 'node:assert';
import { buildRocketDirective } from '../src/rocket/persona.js';
import { initDiscordDb, updateGuildSettings, getGuildSettings } from '../src/discord/discordDb.js';

test('Persona Directive: Only Sandy is Boss & Person Knowledge', () => {
  // 1. Sandy (Boss)
  const sandyDirective = buildRocketDirective({
    senderName: 'Sandy',
    isSandy: true,
    userRole: 'owner',
    channelName: 'chat',
    recentChat: 'Sandy: Rocket are you ready?',
  });
  assert.ok(sandyDirective.includes('YES, THIS IS BOSS SANDY!'), 'Sandy must be identified as Boss');
  assert.ok(sandyDirective.includes('Call him Boss'), 'Sandy should be called Boss');

  // 2. Another Member (e.g. Alex)
  const alexDirective = buildRocketDirective({
    senderName: 'Alex',
    isSandy: false,
    userRole: 'member',
    userProfile: {
      wwe_rank: 'INTERCONTINENTAL CHAMPION',
      interests: ['Gaming', 'Coding'],
    },
    isGroup: true,
    channelName: 'chat',
    recentChat: 'Alex: Hey guys, who wants to play Minecraft?',
  });
  assert.ok(alexDirective.includes('CRITICAL MANDATE: DO NOT CALL THEM BOSS!'), 'Non-Sandy must not be called Boss');
  assert.ok(alexDirective.includes('Call them "Alex"'), 'Must mandate calling them Alex');
  assert.ok(alexDirective.includes('INTERCONTINENTAL CHAMPION'), 'Must include person knowledge (WWE rank)');
  assert.ok(alexDirective.includes('Gaming, Coding'), 'Must include person knowledge (interests)');
  assert.ok(alexDirective.includes('who wants to play Minecraft'), 'Must include recent chat flow');
});

test('Guild Settings: is_muted and chat_mode persistence', () => {
  initDiscordDb();
  const testGuildId = 'test_guild_99999';

  // 1. Set to mention_only and mute
  updateGuildSettings(testGuildId, {
    guild_name: 'Test Sanctuary',
    chat_mode: 'mention_only',
    is_muted: 1,
  });

  let settings = getGuildSettings(testGuildId);
  assert.strictEqual(settings.chat_mode, 'mention_only');
  assert.strictEqual(settings.is_muted, 1);

  // 2. Unmute and switch to constant
  updateGuildSettings(testGuildId, {
    chat_mode: 'constant',
    is_muted: 0,
  });

  settings = getGuildSettings(testGuildId);
  assert.strictEqual(settings.chat_mode, 'constant');
  assert.strictEqual(settings.is_muted, 0);
});

import test from 'node:test';
import assert from 'node:assert';
import {
  getGroupModerationRules,
  updateGroupModerationRules,
  addWarning,
  resetWarnings,
  inspectMessageForModeration,
} from '../src/groups/moderation.js';
import { setConfig } from '../src/db/index.js';

test('Group Moderation & Safety Controls', async (t) => {
  const testGroupId = `-100998877${Date.now()}`;
  const testUserId = '123456789';

  await t.test('defaults to safe, disabled moderation rules', () => {
    const rules = getGroupModerationRules(testGroupId);
    assert.strictEqual(rules.enabled, false);
    assert.strictEqual(rules.spamFilter, false);
    assert.strictEqual(rules.linkFilter, false);
    assert.strictEqual(rules.maxWarnings, 3);
  });

  await t.test('tracks and increments warnings accurately', () => {
    resetWarnings(testGroupId, testUserId);
    const w1 = addWarning(testGroupId, testUserId, 'First spam notice');
    assert.strictEqual(w1.warnCount, 1);

    const w2 = addWarning(testGroupId, testUserId, 'Second spam notice');
    assert.strictEqual(w2.warnCount, 2);

    resetWarnings(testGroupId, testUserId);
  });

  await t.test('inspectMessageForModeration remains silent when moderation is disabled', () => {
    setConfig('group_moderation_enabled', 'false');
    const result = inspectMessageForModeration(testGroupId, 'https://spam-link.xyz', testUserId);
    assert.strictEqual(result.flag, false);
  });

  await t.test('detects unauthorized links and repeated characters when enabled', () => {
    setConfig('group_moderation_enabled', 'true');
    updateGroupModerationRules(testGroupId, { enabled: true, linkFilter: true, spamFilter: true });

    // Link test
    const linkRes = inspectMessageForModeration(testGroupId, 'Check this out: https://t.me/spamchannel', testUserId);
    assert.strictEqual(linkRes.flag, true);
    assert.strictEqual(linkRes.action, 'link_detected');

    // Spam repetition test
    const spamRes = inspectMessageForModeration(testGroupId, 'heyyyyyyyyyyyyyyyyyyy', testUserId);
    assert.strictEqual(spamRes.flag, true);
    assert.strictEqual(spamRes.action, 'spam_detected');

    // Clean message test
    const cleanRes = inspectMessageForModeration(testGroupId, 'Hello everyone, how are you today?', testUserId);
    assert.strictEqual(cleanRes.flag, false);
  });
});

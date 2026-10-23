import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  initDatabase,
  getConfig,
  setConfig,
  getAllConfig,
  addConversationMessage,
  getRecentConversation,
  clearConversation,
  registerOrUpdateGroup,
  getKnownGroups,
  setGroupBotEnabled,
  isGroupBotEnabled,
  recordTokenUsage,
  getTokenUsageStats,
  isUpdateProcessed,
  markUpdateProcessed,
} from '../src/db/index.js';
import { config } from '../src/config.js';

test('Database Layer — Persistent SQLite Operations', async (t) => {
  // Use isolated test DB path
  config.databasePath = './data/test_nerolabs.db';
  initDatabase();

  await t.test('initializes default config rows', () => {
    assert.strictEqual(getConfig('master_switch'), 'true');
    assert.strictEqual(getConfig('group_participation_enabled'), 'false');
    assert.strictEqual(getConfig('active_model_id'), 'gpt-6-luna');
  });

  await t.test('persists runtime configuration switch changes', () => {
    setConfig('master_switch', 'false');
    assert.strictEqual(getConfig('master_switch'), 'false');

    setConfig('active_model_id', 'claude-3-7-sonnet');
    assert.strictEqual(getConfig('active_model_id'), 'claude-3-7-sonnet');

    // Reset back
    setConfig('master_switch', 'true');
    setConfig('active_model_id', 'gpt-6-luna');
  });

  await t.test('stores and windows conversation history', () => {
    const testChatId = 'test_chat_99';
    clearConversation(testChatId);

    // Insert 15 messages
    for (let i = 1; i <= 15; i++) {
      addConversationMessage(testChatId, i % 2 === 1 ? 'user' : 'assistant', `Message ${i}`, 10, 'gpt-6-luna');
    }

    // Retrieve last 10
    const history = getRecentConversation(testChatId, 10);
    assert.strictEqual(history.length, 10);
    assert.strictEqual(history[0].content, 'Message 6'); // Chronological order
    assert.strictEqual(history[9].content, 'Message 15');

    // Clear history
    clearConversation(testChatId);
    assert.strictEqual(getRecentConversation(testChatId, 10).length, 0);
  });

  await t.test('registers and manages known groups', () => {
    const groupId = '-1001234567890';
    registerOrUpdateGroup(groupId, 'Alpha Testers', 'supergroup', false);

    assert.strictEqual(isGroupBotEnabled(groupId), false);

    setGroupBotEnabled(groupId, true);
    assert.strictEqual(isGroupBotEnabled(groupId), true);

    const groups = getKnownGroups();
    const found = groups.find((g) => g.group_id === groupId);
    assert.ok(found);
    assert.strictEqual(found.group_title, 'Alpha Testers');
    assert.strictEqual(found.bot_enabled, 1);
  });

  await t.test('records and aggregates token usage', () => {
    recordTokenUsage('chat_1', 'gpt-6-luna', 150, 50, 420);
    recordTokenUsage('chat_1', 'gpt-6-luna', 200, 100, 380);

    const stats = getTokenUsageStats();
    assert.ok(stats.totals.total_requests >= 2);
    assert.ok(stats.totals.total_tokens >= 500);
    assert.ok(stats.totals.avg_latency_ms > 0);
  });

  await t.test('deduplicates Telegram updates', () => {
    const updateId = Date.now() + Math.floor(Math.random() * 10000);
    assert.strictEqual(isUpdateProcessed(updateId), false);
    markUpdateProcessed(updateId);
    assert.strictEqual(isUpdateProcessed(updateId), true);
  });
});

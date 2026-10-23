import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initDatabase,
  getDb,
  addNote,
  getUserNotes,
  deleteNote,
  clearUserNotes,
  setCustomMemory,
  getCustomMemory,
  deleteCustomMemory,
  listCustomMemories,
  addBlacklistWord,
  removeBlacklistWord,
  getBlacklistWords,
  setGroupSetting,
  getGroupSetting,
} from '../src/db/index.js';
import { getAgentRouting } from '../src/models/modelRouter.js';
import { NERO_SYSTEM_DIRECTIVE } from '../src/conversation/identityRulebook.js';

test('Advanced Ultra-Intelligence & Command Suite Verification', async (t) => {
  initDatabase();
  getDb().prepare("DELETE FROM app_config WHERE key LIKE 'agent_%'").run();
  const testUserId = 'test_user_999';
  const testChatId = 'test_chat_888';

  await t.test('Uncapped Token Routing & Reasoning', () => {
    const routing = getAgentRouting('chat');
    assert.equal(routing.model, 'gemini-3.5-flash-lite');
    assert.equal(routing.reasoning, 'high');
    assert.ok(routing.maxInputTokens >= 16000);
    assert.ok(routing.maxOutputTokens >= 8000);
  });

  await t.test('Ultra-Intelligence System Directive', () => {
    assert.ok(NERO_SYSTEM_DIRECTIVE.includes('1000x reasoning capability'));
    assert.ok(NERO_SYSTEM_DIRECTIVE.includes('Gemini 3.5 Flash Lite'));
  });

  await t.test('Personal Notes API (CRUD)', () => {
    clearUserNotes(testUserId);
    addNote(testUserId, testChatId, 'Deploying AI neural network');
    addNote(testUserId, testChatId, 'Meeting Sandy at 4 PM');

    const notes = getUserNotes(testUserId);
    assert.equal(notes.length, 2);
    assert.equal(notes[0].note_text, 'Meeting Sandy at 4 PM');

    deleteNote(notes[0].id, testUserId);
    assert.equal(getUserNotes(testUserId).length, 1);

    clearUserNotes(testUserId);
    assert.equal(getUserNotes(testUserId).length, 0);
  });

  await t.test('Custom Durable Memories API', () => {
    setCustomMemory(testChatId, 'rules', 'No spam, keep it friendly', 'Sandy');
    setCustomMemory(testChatId, 'server', 'play.nerolabs.net', 'Sandy');

    const mem = getCustomMemory(testChatId, 'rules');
    assert.ok(mem);
    assert.equal(mem.value, 'No spam, keep it friendly');

    const all = listCustomMemories(testChatId);
    assert.equal(all.length, 2);

    deleteCustomMemory(testChatId, 'rules');
    assert.equal(getCustomMemory(testChatId, 'rules'), null);
  });

  await t.test('Group Blacklist & Settings API', () => {
    addBlacklistWord(testChatId, 'crypto_scam', 'Sandy');
    addBlacklistWord(testChatId, 'phishing_link', 'Sandy');

    const words = getBlacklistWords(testChatId);
    assert.ok(words.includes('crypto_scam'));
    assert.ok(words.includes('phishing_link'));

    removeBlacklistWord(testChatId, 'crypto_scam');
    assert.equal(getBlacklistWords(testChatId).includes('crypto_scam'), false);

    setGroupSetting(testChatId, 'antiraid_mode', 'true');
    assert.equal(getGroupSetting(testChatId, 'antiraid_mode'), 'true');
  });
});

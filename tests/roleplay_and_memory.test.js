import test from 'node:test';
import assert from 'node:assert';
import {
  ROLEPLAY_ROLES,
  normalizeRole,
  getRoleDefinition,
  buildRoleSelectionKeyboard,
  formatRoleplayDirective,
} from '../src/conversation/roleplayManager.js';
import {
  initDatabase,
  setUserCustomName,
  setUserRelationshipRole,
  getActiveUserIdentity,
  insertRawMessage,
  getLatestChatMessages,
  addDurableMemory,
  getRecentDurableMemory,
} from '../src/db/index.js';
import { buildChatContext } from '../src/conversation/manager.js';
import { messageArchiver } from '../src/memory/archiver.js';

test('Roleplay & Custom Identity — Normalization and Definition', async (t) => {
  await t.test('normalizes sibling and parental role inputs', () => {
    assert.strictEqual(normalizeRole('brother'), 'brother');
    assert.strictEqual(normalizeRole('bro'), 'brother');
    assert.strictEqual(normalizeRole('bhaiya'), 'brother');
    assert.strictEqual(normalizeRole('setrolebrother'), 'brother');
    assert.strictEqual(normalizeRole('sister'), 'sister');
    assert.strictEqual(normalizeRole('didi'), 'sister');
    assert.strictEqual(normalizeRole('mother'), 'mother');
    assert.strictEqual(normalizeRole('mom'), 'mother');
    assert.strictEqual(normalizeRole('maa'), 'mother');
    assert.strictEqual(normalizeRole('father'), 'father');
    assert.strictEqual(normalizeRole('dad'), 'father');
  });

  await t.test('supports all 10 core roles and custom roles', () => {
    const expectedRoles = ['brother', 'sister', 'friend', 'bestie', 'mother', 'father', 'daughter', 'son', 'mentor', 'partner'];
    for (const r of expectedRoles) {
      assert.ok(ROLEPLAY_ROLES[r], `Missing core role: ${r}`);
      const def = getRoleDefinition(r);
      assert.strictEqual(def.id, r);
      assert.ok(def.description.length > 10);
    }

    // Custom role fallback
    const customDef = getRoleDefinition('cousin');
    assert.strictEqual(customDef.id, 'cousin');
    assert.ok(customDef.description.includes('cousin'));
  });

  await t.test('builds interactive role selection keyboard with buttons', () => {
    const kb = buildRoleSelectionKeyboard();
    assert.ok(kb);
    const rows = kb.inline_keyboard;
    assert.ok(Array.isArray(rows) && rows.length >= 5);
  });
});

test('User Profile & Database Persistence', async (t) => {
  initDatabase();
  const testUserId = 'test_user_998877';
  const testChatId = '-10099887766';

  await t.test('stores and retrieves custom name and relationship role', () => {
    setUserCustomName(testUserId, 'Alexander');
    setUserRelationshipRole(testUserId, 'brother');

    const identity = getActiveUserIdentity(testChatId, testUserId);
    assert.strictEqual(identity.customName, 'Alexander');
    assert.strictEqual(identity.relationshipRole, 'brother');
  });

  await t.test('generates roleplay prompt directive for model', () => {
    const directive = formatRoleplayDirective(testUserId, 'Alexander', 'brother', 'Alex', false);
    assert.ok(directive.includes('Alexander'));
    assert.ok(directive.includes('Brother'));
    assert.ok(directive.includes('bhaiya'));
  });

  await t.test('messageArchiver uses custom name as speaker label', () => {
    const customSpeakerId = 'custom_user_777';
    setUserCustomName(customSpeakerId, 'ShadowBlade');
    const label = messageArchiver.getSpeakerLabel(testChatId, customSpeakerId, 'DefaultName', false);
    assert.strictEqual(label, 'ShadowBlade');
  });
});

test('Live Group Chat Stream & Persistent Memory Injection in Context', async (t) => {
  initDatabase();
  const testChatId = '-10077665544';

  // Seed raw messages into group chat stream
  insertRawMessage({
    platformMessageId: 501,
    chatId: testChatId,
    senderId: '111',
    senderName: 'Sandy',
    rawContent: 'Hey team, we are meeting at 6 PM today',
  });
  insertRawMessage({
    platformMessageId: 502,
    chatId: testChatId,
    senderId: '222',
    senderName: 'Rahul',
    rawContent: 'Will we discuss the project launch?',
  });

  // Seed durable memory
  addDurableMemory(testChatId, 'decision', 'Project Launch', 'Launch scheduled for next Friday at 9 PM');

  await t.test('retrieves latest group chat stream in chronological order', () => {
    const recent = getLatestChatMessages(testChatId, 5);
    assert.ok(recent.length >= 2);
    const lastMsg = recent[recent.length - 1];
    assert.strictEqual(lastMsg.platform_message_id, 502);
    assert.ok(lastMsg.raw_content.includes('discuss the project launch'));
  });

  await t.test('retrieves recent durable memory facts', () => {
    const mems = getRecentDurableMemory(testChatId, 5);
    assert.ok(mems.length >= 1);
    assert.strictEqual(mems[0].topic, 'Project Launch');
  });

  await t.test('buildChatContext injects live chat stream and memory facts into system prompt', () => {
    setUserCustomName('111', 'Sandy');
    setUserRelationshipRole('111', 'father');

    const messages = buildChatContext(testChatId, 'What did Rahul ask about?', {
      senderId: '111',
      senderName: 'Sandy',
      userIsOwner: true,
      replyContext: { sender: 'Rahul', text: 'Will we discuss the project launch?' },
    });

    const systemPrompt = messages[0].content;

    // Check Live Group Chat Stream is present
    assert.ok(systemPrompt.includes('[ACTIVE LIVE GROUP CHAT STREAM]'));
    assert.ok(systemPrompt.includes('Rahul: "Will we discuss the project launch?"'));

    // Check Persistent Memory is present
    assert.ok(systemPrompt.includes('[PERSISTENT GROUP MEMORY & RETRIEVED FACTS]'));
    assert.ok(systemPrompt.includes('Project Launch'));

    // Check Roleplay Directive is present
    assert.ok(systemPrompt.includes('[ACTIVE SPEAKER IDENTITY & ROLEPLAY RELATIONSHIP]'));
    assert.ok(systemPrompt.includes('Sandy'));
    assert.ok(systemPrompt.includes('Father'));

    // Check Replied-to message context is present
    assert.ok(systemPrompt.includes('[REPLIED-TO MESSAGE CONTEXT]'));
    assert.ok(systemPrompt.includes('Rahul'));
  });
});

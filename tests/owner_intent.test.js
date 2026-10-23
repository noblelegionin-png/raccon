import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, getDb, getConfig, setConfig, getUserNotes, getCustomMemory, getGroupSetting } from '../src/db/index.js';
import { NERO_SYSTEM_DIRECTIVE, OWNER_ROOT_DIRECTIVE } from '../src/conversation/identityRulebook.js';
import { buildChatContext } from '../src/conversation/manager.js';
import { validateAndSanitizeResponse } from '../src/conversation/responseValidator.js';
import { tryExecuteOwnerIntent } from '../src/telegram/ownerIntentDispatcher.js';
import { config } from '../src/config.js';

test('👑 Root Owner Universal Knowledge & Natural Language Action Suite', async (t) => {
  initDatabase();
  const ownerId = 8685232094;
  config.telegramOwnerId = '8685232094';
  const testChatId = -10099887766;

  await t.test('1. Identity Rulebook encodes Root Authority & Universal Knowledge', () => {
    assert.ok(NERO_SYSTEM_DIRECTIVE.includes('Version 3.0 Ultra-Intelligence & Universal Authority'));
    assert.ok(NERO_SYSTEM_DIRECTIVE.includes('8685232094'));
    assert.ok(NERO_SYSTEM_DIRECTIVE.includes('STRICT REFUSAL BAN'));
    assert.ok(NERO_SYSTEM_DIRECTIVE.includes('Universal System Knowledge & Tool Mastery'));
    assert.ok(NERO_SYSTEM_DIRECTIVE.includes('Minecraft Bedrock Companion Bridge'));
    assert.ok(NERO_SYSTEM_DIRECTIVE.includes('Mini App & Owner Control Deck'));

    assert.ok(OWNER_ROOT_DIRECTIVE.includes('ROOT OWNER & CREATOR DIRECTIVE'));
    assert.ok(OWNER_ROOT_DIRECTIVE.includes('Infinite Root Access'));
    assert.ok(OWNER_ROOT_DIRECTIVE.includes('STRICT REFUSAL BAN'));
  });

  await t.test('2. Chat Context automatically injects Owner Root Directive for Sandy', () => {
    const ownerMessages = buildChatContext(testChatId, 'check my server stats', {
      senderId: ownerId,
      senderName: 'Sandy',
      userIsOwner: true,
    });

    const sysMsg = ownerMessages.find(m => m.role === 'system');
    assert.ok(sysMsg, 'System prompt must be present');
    assert.ok(sysMsg.content.includes('ROOT OWNER & CREATOR DIRECTIVE — SANDY'));
    assert.ok(sysMsg.content.includes('STRICT REFUSAL BAN'));
  });

  await t.test('3. Response Validator eradicates any AI refusal statements for Sandy', () => {
    const refusalText = "I apologize, but I do not have permission to execute this system command as an AI.";
    const result = validateAndSanitizeResponse(refusalText, 'run backup', {
      isOwner: true,
    });

    assert.equal(result.valid, true);
    assert.ok(!result.sanitizedText.includes("I do not have permission"));
    assert.ok(!result.sanitizedText.includes("I apologize"));
  });

  await t.test('4. Non-owners are rejected by Owner Intent Dispatcher', async () => {
    const mockCtx = {
      from: { id: 12345678, first_name: 'RandomUser' },
      chat: { id: testChatId, type: 'group' },
      message: { message_id: 101, text: 'turn on anti-raid' },
      reply: async () => {},
    };

    const res = await tryExecuteOwnerIntent(mockCtx, 'turn on anti-raid', false);
    assert.equal(res, null, 'Non-owner must not trigger owner intent dispatch');
  });

  await t.test('5. Natural Language Switches: Master AI & Anti-Spam', async () => {
    let replyCalled = false;
    let replyText = '';
    const mockCtx = {
      from: { id: ownerId, first_name: 'Sandy' },
      chat: { id: testChatId, type: 'group' },
      message: { message_id: 102, text: 'turn on anti-spam' },
      reply: async (msg) => {
        replyCalled = true;
        replyText = msg;
      },
    };

    const res = await tryExecuteOwnerIntent(mockCtx, 'turn on anti-spam', false);
    assert.ok(res?.handled);
    assert.equal(res.actionName, 'switch_antispam_on');
    assert.equal(getConfig('antispam_enabled'), 'true');
    assert.ok(replyText.includes('Anti-Spam Filter: ENABLED'));

    const resOff = await tryExecuteOwnerIntent(mockCtx, 'turn off anti-spam', false);
    assert.ok(resOff?.handled);
    assert.equal(getConfig('antispam_enabled'), 'false');
  });

  await t.test('6. Natural Language Minecraft Commands: Give & Spawn', async () => {
    let replyText = '';
    const mockCtx = {
      from: { id: ownerId, first_name: 'Sandy' },
      chat: { id: testChatId, type: 'private' },
      message: { message_id: 103, text: 'give me 64 diamonds' },
      reply: async (msg) => {
        replyText = msg;
      },
    };

    const res = await tryExecuteOwnerIntent(mockCtx, 'give me 64 diamonds', true);
    assert.ok(res?.handled);
    assert.equal(res.actionName, 'mc_give');
    assert.ok(replyText.includes('64x diamond'));

    const resSpawn = await tryExecuteOwnerIntent(mockCtx, 'spawn 5 wolves', true);
    assert.ok(resSpawn?.handled);
    assert.equal(resSpawn.actionName, 'mc_spawn');
    assert.ok(replyText.includes('5x wolf'));
  });

  await t.test('7. Natural Language Personal Notes & Knowledge Memories', async () => {
    let replyText = '';
    const mockCtx = {
      from: { id: ownerId, first_name: 'Sandy' },
      chat: { id: testChatId, type: 'private' },
      message: { message_id: 104, text: 'note review server architecture at 8pm' },
      reply: async (msg) => {
        replyText = msg;
      },
    };

    // Save note
    const resNote = await tryExecuteOwnerIntent(mockCtx, 'note review server architecture at 8pm', true);
    assert.ok(resNote?.handled);
    assert.equal(resNote.actionName, 'note_add');
    const notes = getUserNotes(ownerId);
    assert.ok(notes.some(n => n.note_text.includes('review server architecture')));

    // Show notes
    const resView = await tryExecuteOwnerIntent(mockCtx, 'show my notes', true);
    assert.ok(resView?.handled);
    assert.ok(replyText.includes('YOUR SAVED NOTES'));

    // Remember custom key = value
    const resRem = await tryExecuteOwnerIntent(mockCtx, 'remember server = play.nerolabs.net', true);
    assert.ok(resRem?.handled);
    assert.equal(resRem.actionName, 'memory_remember');
    const mem = getCustomMemory(testChatId, 'server');
    assert.equal(mem?.value, 'play.nerolabs.net');

    // Recall custom key
    const resRec = await tryExecuteOwnerIntent(mockCtx, 'recall server', true);
    assert.ok(resRec?.handled);
    assert.ok(replyText.includes('play.nerolabs.net'));
  });

  await t.test('8. Natural Language Group Moderation: Anti-Raid & Slowmode', async () => {
    let slowmodeSecs = null;
    const mockCtx = {
      from: { id: ownerId, first_name: 'Sandy' },
      chat: { id: testChatId, type: 'group' },
      message: { message_id: 105, text: 'turn on anti-raid' },
      setChatSlowModeDelay: async (s) => { slowmodeSecs = s; },
      reply: async () => {},
    };

    const resRaid = await tryExecuteOwnerIntent(mockCtx, 'turn on anti-raid', false);
    assert.ok(resRaid?.handled);
    assert.equal(getGroupSetting(testChatId, 'antiraid_mode'), 'true');

    const resSlow = await tryExecuteOwnerIntent(mockCtx, 'set slowmode to 15s', false);
    assert.ok(resSlow?.handled);
    assert.equal(slowmodeSecs, 15);
  });

  await t.test('9. Natural Language Low-Token Bug Fix Execution', async () => {
    let replyText = '';
    const mockCtx = {
      from: { id: ownerId, first_name: 'Sandy' },
      chat: { id: testChatId, type: 'private' },
      message: { message_id: 106, text: 'fix this: function add(a, b) { return a - b; }' },
      reply: async (msg) => { replyText = msg; },
      replyWithChatAction: async () => {},
    };

    const res = await tryExecuteOwnerIntent(mockCtx, 'fix this: function add(a, b) { return a - b; }', true);
    assert.ok(res?.handled);
    assert.equal(res.actionName, 'code_fix');
    assert.ok(replyText.includes('a + b'));
    assert.ok(replyText.includes('Gemini 3.5 Flash Lite'));
  });
});

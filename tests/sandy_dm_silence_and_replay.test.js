import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsAppService, isMuteTrigger, isUnmuteTrigger } from '../src/whatsapp/whatsappService.js';
import { isWhatsAppMessageProcessed, recordWhatsAppMessageProcessed } from '../src/db/index.js';
import { clearConversation } from '../src/conversation/manager.js';
import { unmuteChat, isChatMuted } from '../src/maintenance/maintenanceService.js';

test('🛡️ Sandy DM Silence, /mute and Replay Prevention Verification', async (t) => {
  const contactJid = '917777788888@s.whatsapp.net';
  const ownerNumber = '919317741936';

  let sentMessages = [];
  const originalSafeSend = whatsAppService.safeSendMessage;
  whatsAppService.safeSendMessage = async (jid, content, options) => {
    const sent = { jid, text: content.text || '', quoted: options?.quoted, poll: content.poll };
    sentMessages.push(sent);
    return { key: { id: `bot_sent_${Date.now()}` } };
  };

  t.after(() => {
    whatsAppService.safeSendMessage = originalSafeSend;
    clearConversation(`wa_${contactJid}`);
    unmuteChat(contactJid);
  });

  await t.test('1. Mute trigger detects /mute, !mute, mute, and unmute triggers', () => {
    assert.strictEqual(isMuteTrigger('/mute'), true);
    assert.strictEqual(isMuteTrigger('!mute'), true);
    assert.strictEqual(isMuteTrigger('mute'), true);
    assert.strictEqual(isMuteTrigger('chup hoja'), true);
    assert.strictEqual(isMuteTrigger('shut up'), true);
    assert.strictEqual(isMuteTrigger('hello'), false);

    assert.strictEqual(isUnmuteTrigger('/unmute'), true);
    assert.strictEqual(isUnmuteTrigger('!unmute'), true);
    assert.strictEqual(isUnmuteTrigger('unmute'), true);
    assert.strictEqual(isUnmuteTrigger('bol'), true);
  });

  await t.test('2. Sandy sending normal text in a DM with someone else -> Bot stays 100% silent', async () => {
    sentMessages = [];
    const msg = {
      key: { id: `sandy_dm_${Date.now()}`, remoteJid: contactJid, fromMe: true },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: 'Hey bro, are we playing Minecraft today?' },
    };

    await whatsAppService.handleIncomingMessage(msg);
    assert.strictEqual(sentMessages.length, 0, 'Bot must stay silent when Sandy texts in a DM without tagging bot');
  });

  await t.test('3. Sandy sending a voice note in a DM with someone else -> Bot stays 100% silent', async () => {
    sentMessages = [];
    const msg = {
      key: { id: `sandy_vn_${Date.now()}`, remoteJid: contactJid, fromMe: true },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: {
        audioMessage: {
          seconds: 10,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true,
        },
      },
    };

    await whatsAppService.handleIncomingMessage(msg);
    assert.strictEqual(sentMessages.length, 0, 'Bot must never send follow-up or reply to Sandy voice notes in DMs');
  });

  await t.test('4. Sandy saying /mute in a DM -> Bot mutes chat and confirms', async () => {
    sentMessages = [];
    unmuteChat(contactJid);
    const msg = {
      key: { id: `sandy_mute_${Date.now()}`, remoteJid: contactJid, fromMe: true },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: '/mute' },
    };

    await whatsAppService.handleIncomingMessage(msg);
    assert.strictEqual(sentMessages.length, 1, 'Bot must confirm mute command');
    assert.match(sentMessages[0].text, /chup ho gaya hoon/i);
    assert.strictEqual(isChatMuted(contactJid), true, 'Chat must be recorded as muted');
  });

  await t.test('5. Sandy tagging @bot or @nero in a DM -> Bot responds', async () => {
    sentMessages = [];
    unmuteChat(contactJid);
    const msg = {
      key: { id: `sandy_tag_${Date.now()}`, remoteJid: contactJid, fromMe: true },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: '@nero what is your current status?' },
    };

    await whatsAppService.handleIncomingMessage(msg);
    const sentForChat = sentMessages.filter(m => m.jid === contactJid);
    assert.strictEqual(sentForChat.length, 1, 'Bot must respond when Sandy explicitly tags @nero');
    assert.match(sentForChat[0].text, /available|online|assist|Nero/i);
  });

  await t.test('6. Stale/old messages from WhatsApp sync (>3 min old) -> Dropped immediately', async () => {
    sentMessages = [];
    const staleMsg = {
      key: { id: `stale_msg_${Date.now()}`, remoteJid: contactJid, fromMe: false },
      messageTimestamp: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
      message: { conversation: 'Hello is Sandy there?' },
    };

    await whatsAppService.handleIncomingMessage(staleMsg);
    assert.strictEqual(sentMessages.length, 0, 'Stale message must be dropped without reply');
  });

  await t.test('7. Persistent SQLite deduplication -> Duplicate message dropped across sessions', async () => {
    sentMessages = [];
    const testId = `dedup_sqlite_test_${Date.now()}`;
    recordWhatsAppMessageProcessed(testId, contactJid);
    assert.strictEqual(isWhatsAppMessageProcessed(testId), true, 'Must record in SQLite');

    const dupMsg = {
      key: { id: testId, remoteJid: contactJid, fromMe: false },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: 'Hello Nero' },
    };

    await whatsAppService.handleIncomingMessage(dupMsg);
    assert.strictEqual(sentMessages.length, 0, 'Message already in SQLite wa_processed_messages must be dropped');
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceNoteService } from '../src/whatsapp/voiceNoteService.js';
import { stickerService } from '../src/whatsapp/stickerService.js';
import { buildOutreachMessage } from '../src/whatsapp/whatsappPersona.js';
import { sandyStatusService } from '../src/whatsapp/sandyStatusService.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { recordUserMessage, recordAssistantMessage } from '../src/conversation/manager.js';
import { getDb } from '../src/db/index.js';

test('▶ WhatsApp Advanced Features Suite', async (t) => {
  await t.test('1. VoiceNoteService — Fallback & Mock Transcription/Reply Generation', async () => {
    // Test fallback when offline or error
    const fallbackRes = voiceNoteService._fallbackResponse('Aman', 15, false);
    assert.ok(fallbackRes.transcription.includes('Voice Note'));
    assert.ok(fallbackRes.reply.includes('voice message') || fallbackRes.reply.includes('voice note'));

    // Test Sandy fallback
    const sandyFallback = voiceNoteService._fallbackResponse('Sandy', 30, true);
    assert.ok(sandyFallback.reply.includes('Sandy'));
  });

  await t.test('2. StickerService — Generates Valid 512x512 WebP Stickers with Sharp', async () => {
    const preset = await stickerService.getPresetSticker('nero_cyber');
    assert.ok(Buffer.isBuffer(preset));
    assert.ok(preset.length > 100);
    // Check WebP magic bytes: RIFF....WEBP
    const riff = preset.toString('ascii', 0, 4);
    const webp = preset.toString('ascii', 8, 12);
    assert.equal(riff, 'RIFF');
    assert.equal(webp, 'WEBP');

    const broSticker = await stickerService.getPresetSticker('bro_fist');
    assert.equal(broSticker.toString('ascii', 8, 12), 'WEBP');

    const fireSticker = await stickerService.getPresetSticker('fire');
    assert.equal(fireSticker.toString('ascii', 8, 12), 'WEBP');
  });

  await t.test('3. StickerService — Request Detection & Type Picker', () => {
    assert.equal(stickerService.isStickerRequest('send a sticker'), true);
    assert.equal(stickerService.isStickerRequest('sticker please'), true);
    assert.equal(stickerService.isStickerRequest('sticker'), true);
    assert.equal(stickerService.isStickerRequest('random text here'), false);

    assert.equal(stickerService.pickStickerType('bhai sticker bhej', 'friend'), 'bro_fist');
    assert.equal(stickerService.pickStickerType('aag laga di', 'friend'), 'fire');
    assert.equal(stickerService.pickStickerType('sandy chill', 'friend'), 'sandy_chill');
    assert.equal(stickerService.pickStickerType('hello', 'friend'), 'wave');
  });

  await t.test('4. Outreach Message Formatter — Decorative, Spaced & Professional', () => {
    const formatted = buildOutreachMessage({
      contactName: 'Rahul',
      messageText: 'Please send over the project files by 5 PM.',
      senderTitle: 'Sandy',
    });

    assert.ok(formatted.includes('Message from Sandy'));
    assert.ok(formatted.includes('Hello Rahul,') || formatted.includes('Rahul'));
    assert.ok(formatted.includes('Please send over the project files by 5 PM.'));
    assert.ok(formatted.includes('Nero'));
  });

  await t.test('5. SandyStatusService — Find Contact by Name or Number', () => {
    const testNum = '919876540001';
    sandyStatusService.recordContactInteraction(testNum, 'Karan Sharma', 'Hey Sandy what is up');
    
    // Find by exact digits
    const byDigits = sandyStatusService.findContactByNameOrNumber(testNum);
    assert.ok(byDigits);
    assert.equal(byDigits.sender_number, testNum);

    // Find by Name (case-insensitive substring)
    const byName = sandyStatusService.findContactByNameOrNumber('Karan');
    assert.ok(byName);
    assert.equal(byName.sender_number, testNum);

    // Synthetic fallback for unknown digits
    const unknownDigits = sandyStatusService.findContactByNameOrNumber('919999999999');
    assert.ok(unknownDigits);
    assert.equal(unknownDigits.sender_number, '919999999999');

    // Unknown string name returns null
    const unknownName = sandyStatusService.findContactByNameOrNumber('NonExistentPerson123');
    assert.equal(unknownName, null);
  });

  await t.test('6. Universal Cross-Chat Context — Aggregates Messages & History', () => {
    const testNum = '919876540002';
    const targetChatId = `wa_${testNum}@s.whatsapp.net`;
    recordUserMessage(targetChatId, 'Hey Sandy, is the server running today?');
    recordAssistantMessage(targetChatId, 'Yes, server is active on Hypixel! ⚡', 20, 'gemini-3.5-flash-lite');

    const summary = sandyStatusService.getRecentChatsSummary(5);
    assert.ok(summary.count > 0);
    assert.ok(summary.summary.includes('UNIVERSAL WHATSAPP CHAT CONTEXT'));

    const history = sandyStatusService.getContactChatHistory(testNum, 5);
    assert.equal(history.found, true);
    assert.ok(history.text.includes('is the server running today?'));
  });

  await t.test('7. Interactive Contact Action Buttons — 4 Options & Call Back Request', async () => {
    const sentMessages = [];
    whatsAppService.safeSendMessage = async (jid, content) => {
      sentMessages.push({ jid, content });
      return { key: { id: 'mock-msg-' + Math.random() } };
    };

    // Trigger option 3: Leave note
    await whatsAppService.handleSandyContactAction('3', 'test_jid_3', null, '919876540003', 'Rohan');
    const notePrompt = sentMessages.find(m => m.content.text?.includes('Leave a Note') || m.content.text?.includes('note:'));
    assert.ok(notePrompt);

    // Trigger option 4: Call back
    await whatsAppService.handleSandyContactAction('call', 'test_jid_4', null, '919876540004', 'Simran');
    const callAck = sentMessages.find(m => m.content.text?.includes('Call Back Request Delivered'));
    assert.ok(callAck);

    const urgentInbox = sandyStatusService.getUrgentRequests(5);
    const callEntry = urgentInbox.find(u => u.sender_number === '919876540004');
    assert.ok(callEntry);
  });

  await t.test('8. MasterBot Owner Menu — 10 Buttons & Cross-Chat / Sticker Action', async () => {
    const sentMessages = [];
    whatsAppService.safeSendMessage = async (jid, content) => {
      sentMessages.push({ jid, content });
      return { key: { id: 'mock-owner-' + Math.random() } };
    };

    // Trigger action 9: Universal Cross-Chat Context
    await whatsAppService.executeOwnerAction('9', 'sandy_master_jid', null);
    const chatContextMsg = sentMessages.find(m => m.content.text?.includes('UNIVERSAL WHATSAPP CHAT CONTEXT'));
    assert.ok(chatContextMsg);

    // Trigger action 10: Cyber Sticker
    await whatsAppService.executeOwnerAction('10', 'sandy_master_jid', null);
    const stickerMsg = sentMessages.find(m => m.content.sticker);
    assert.ok(stickerMsg);
    assert.equal(stickerMsg.content.sticker.toString('ascii', 8, 12), 'WEBP');
  });
});

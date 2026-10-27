import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../src/web/server.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { initDatabase, getDb, getRecentConversation } from '../src/db/index.js';
import {
  recordUserMessage,
  recordAssistantMessage,
  clearConversation,
} from '../src/conversation/manager.js';

test('WhatsApp 24/7 Live Bridge — Comprehensive Suite', async (t) => {
  initDatabase();

  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  t.after(() => {
    server.close();
  });

  await t.test('1. WhatsApp Service — Status Reporting & Defaults', async () => {
    const status = whatsAppService.getStatus();
    assert.ok(status);
    assert.ok(typeof status.status === 'string');
    assert.ok(typeof status.messageCount === 'number');
    assert.ok(['all', 'owner_only'].includes(status.mode));
    assert.equal(typeof status.autoReply, 'boolean');
    assert.equal(typeof status.notifyTelegram, 'boolean');
  });

  await t.test('2. REST API — GET /api/whatsapp/status', async () => {
    const res = await fetch(`${baseUrl}/api/whatsapp/status`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.ok(data.status);
    assert.ok(data.mode);
  });

  await t.test('3. REST API — GET /api/whatsapp/qr', async () => {
    const res = await fetch(`${baseUrl}/api/whatsapp/qr`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.ok('qrRaw' in data);
    assert.ok('qrDataUrl' in data);
  });

  await t.test('4. REST API — POST /api/whatsapp/pair requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/whatsapp/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '919876543210' }),
    });
    // Unauthorized without owner key or Telegram initData
    assert.equal(res.status, 401);
  });

  await t.test('5. REST API — POST /api/whatsapp/pair with access key validates phone number', async () => {
    const res = await fetch(`${baseUrl}/api/whatsapp/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-access-key': 'nero_labs_secret_key_2026',
      },
      body: JSON.stringify({ phoneNumber: '' }),
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.ok, false);
    assert.match(data.error, /Phone number is required/i);
  });

  await t.test('6. REST API — POST /api/whatsapp/send requires destination and text', async () => {
    const res = await fetch(`${baseUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-access-key': 'nero_labs_secret_key_2026',
      },
      body: JSON.stringify({ to: '' }),
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.ok, false);
  });

  await t.test('7. REST API — POST /api/whatsapp/send returns error when bridge is disconnected', async () => {
    const res = await fetch(`${baseUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-access-key': 'nero_labs_secret_key_2026',
      },
      body: JSON.stringify({ to: '919876543210', text: 'Hello' }),
    });
    const data = await res.json();
    assert.equal(res.status, 500);
    assert.equal(data.ok, false);
    assert.match(data.error, /not currently connected/i);
  });

  await t.test('8. REST API — POST /api/whatsapp/disconnect resets state safely', async () => {
    // Preserve active session directory during automated tests
    const origDisconnect = whatsAppService.disconnectSession;
    whatsAppService.disconnectSession = async () => {
      whatsAppService.status = 'disconnected';
      return { ok: true, message: 'WhatsApp session disconnected and storage reset.' };
    };

    const res = await fetch(`${baseUrl}/api/whatsapp/disconnect`, {
      method: 'POST',
      headers: {
        'x-dashboard-access-key': 'nero_labs_secret_key_2026',
      },
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(whatsAppService.status, 'disconnected');

    whatsAppService.disconnectSession = origDisconnect;
  });

  await t.test('9. Conversation Engine — WhatsApp Prefix "wa_" integrates with SQLite memory', async () => {
    const waChatId = 'wa_919876543210@s.whatsapp.net';
    clearConversation(waChatId);

    recordUserMessage(waChatId, 'Hello Nero on WhatsApp!');
    recordAssistantMessage(waChatId, 'Hello Sandy! I am live on WhatsApp.', 25, 'gemini-3.5-flash-lite');

    const history = getRecentConversation(waChatId, 10);
    assert.equal(history.length, 2);
    assert.equal(history[0].role, 'user');
    assert.equal(history[0].content, 'Hello Nero on WhatsApp!');
    assert.equal(history[1].role, 'assistant');
    assert.equal(history[1].content, 'Hello Sandy! I am live on WhatsApp.');

    clearConversation(waChatId);
    const cleared = getRecentConversation(waChatId, 10);
    assert.equal(cleared.length, 0);
  });

  await t.test('10. REST API — GET /qr serves dedicated live QR page', async () => {
    const res = await fetch(`${baseUrl}/qr`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Scan to Connect WhatsApp/i);
    assert.match(html, /checkStatus/i);
  });

  await t.test('11. Dynamic Length Intelligence & Word Limit Extraction', async () => {
    const { detectUserIntent, extractExplicitWordLimit } = await import('../src/conversation/intentDetector.js');
    
    // Greeting detection ("Hy to Hy")
    assert.equal(detectUserIntent('hy'), 'greeting');
    assert.equal(detectUserIntent('hi!'), 'greeting');
    assert.equal(detectUserIntent('kaisa hai bhai'), 'greeting');
    assert.equal(detectUserIntent('sup'), 'greeting');

    // Explicit 500 word explanation detection
    const limit500 = extractExplicitWordLimit('write a 500 word explanation about black holes');
    assert.equal(limit500, 500);

    const limit200 = extractExplicitWordLimit('explain in 200 words what photosynthesis is');
    assert.equal(limit200, 200);

    // Standard question has no explicit limit (defaults to 10-500 in pipeline)
    const noLimit = extractExplicitWordLimit('what is the speed of light?');
    assert.equal(noLimit, null);
  });

  await t.test('12. Dedicated Gemini 3.8 Flash & High Reasoning Verification', async () => {
    const { getActiveModelId } = await import('../src/models/catalogue.js');
    const { getAgentRouting } = await import('../src/models/modelRouter.js');
    const { getConfig } = await import('../src/db/index.js');

    assert.equal(getActiveModelId(), 'gemini-3.8-flash');
    assert.equal(getConfig('reasoning_effort'), 'high');

    const chatRouting = getAgentRouting('chat');
    assert.equal(chatRouting.model, 'gemini-3.8-flash');
    assert.equal(chatRouting.reasoning, 'high');
  });

  await t.test('13. Sandy Status Service — Natural Language Live Routine Updates', async () => {
    const { sandyStatusService } = await import('../src/whatsapp/sandyStatusService.js');

    // Gaming / Minecraft update
    const gameResult = sandyStatusService.parseNaturalLanguageUpdate('I am playing Minecraft on Hypixel realm: mc.hypixel.net');
    assert.equal(gameResult.updated, true);
    assert.equal(gameResult.type, 'gaming');
    assert.match(gameResult.summary, /Gaming/i);

    const statusAfterGame = sandyStatusService.getStatus();
    assert.match(statusAfterGame.activity, /Minecraft/i);
    assert.match(statusAfterGame.game_info, /mc\.hypixel\.net/i);

    // Sleeping update
    const sleepResult = sandyStatusService.parseNaturalLanguageUpdate('Abhi so raha hu wake me at 7');
    assert.equal(sleepResult.updated, true);
    assert.equal(sleepResult.type, 'sleeping');

    const statusAfterSleep = sandyStatusService.getStatus();
    assert.match(statusAfterSleep.activity, /Resting/i);
    assert.equal(statusAfterSleep.availability, 'sleeping');

    // Directive formatting contains live activity
    const directive = sandyStatusService.formatSandyStatusDirective();
    assert.match(directive, /Resting/i);
    assert.match(directive, /mc\.hypixel\.net/i);
  });

  await t.test('14. Urgent Talk Request Inbox — Priority Logging & Retrieval', async () => {
    const { sandyStatusService } = await import('../src/whatsapp/sandyStatusService.js');

    const id = sandyStatusService.addUrgentRequest({
      senderNumber: '919876543210',
      senderName: 'Vikas',
      messageText: 'Sandy bhai urgent kaam hai call back karna please!',
      urgency: 'high',
    });
    assert.ok(id);

    const urgentInbox = sandyStatusService.getUrgentRequests(5);
    assert.ok(urgentInbox.length > 0);
    const latest = urgentInbox[0];
    assert.equal(latest.sender_number, '919876543210');
    assert.equal(latest.sender_name, 'Vikas');
    assert.match(latest.message_text, /urgent kaam hai/i);
  });

  await t.test('15. Media Vault — Dedicated Per-User Folders & File Archiving', async () => {
    const { mediaManager } = await import('../src/whatsapp/mediaManager.js');

    const sampleImageBuffer = Buffer.from('FAKE_IMAGE_BYTES_12345');
    const imageRecord = await mediaManager.saveMediaBuffer({
      buffer: sampleImageBuffer,
      senderNumber: '919876543210',
      senderName: 'Alice',
      fileType: 'image',
      mimeType: 'image/jpeg',
      caption: 'Look at this diagram',
    });
    assert.ok(imageRecord.id);
    assert.ok(imageRecord.filePath.includes('whatsapp_media'));
    assert.ok(imageRecord.filePath.includes('919876543210'));
    assert.ok(imageRecord.filePath.includes('images'));

    const sampleVideoBuffer = Buffer.from('FAKE_VIDEO_BYTES_67890');
    const videoRecord = await mediaManager.saveMediaBuffer({
      buffer: sampleVideoBuffer,
      senderNumber: '919876543210',
      senderName: 'Alice',
      fileType: 'video',
      mimeType: 'video/mp4',
      caption: 'Screen recording',
    });
    assert.ok(videoRecord.id);
    assert.ok(videoRecord.filePath.includes('videos'));

    const mediaHistory = mediaManager.getMediaHistory('919876543210', 10);
    assert.ok(mediaHistory.length >= 2);
    assert.ok(mediaHistory.some((m) => m.file_type === 'image'));
    assert.ok(mediaHistory.some((m) => m.file_type === 'video'));
  });

  await t.test('16. WhatsApp Independence — 100% Zero Telegram References', async () => {
    const { buildWhatsAppDirective } = await import('../src/whatsapp/whatsappPersona.js');

    const contactDirective = buildWhatsAppDirective({
      senderNumber: '919876543210',
      senderName: 'Client',
      isSandy: false,
      userPrompt: 'Hello who are you?',
    });

    const masterBotDirective = buildWhatsAppDirective({
      senderNumber: '919999999999',
      senderName: 'Sandy',
      isSandy: true,
      userPrompt: 'What is your status?',
    });

    // Both directives must be 100% free of Telegram mentions
    assert.doesNotMatch(contactDirective, /telegram/i);
    assert.doesNotMatch(contactDirective, /botfather/i);
    assert.doesNotMatch(contactDirective, /grammy/i);

    assert.doesNotMatch(masterBotDirective, /telegram/i);
    assert.doesNotMatch(masterBotDirective, /botfather/i);
    assert.doesNotMatch(masterBotDirective, /grammy/i);
  });

  await t.test('17. WhatsApp Context Memory — Segregated Per-Sender Chat History', async () => {
    const { buildWhatsAppChatContext } = await import('../src/whatsapp/whatsappPersona.js');

    const user1Jid = '919111111111@s.whatsapp.net';
    const user2Jid = '919222222222@s.whatsapp.net';

    clearConversation(`wa_${user1Jid}`);
    clearConversation(`wa_${user2Jid}`);
    clearConversation('wa_sandy_master');

    recordUserMessage(`wa_${user1Jid}`, 'My secret is Apples');
    recordAssistantMessage(`wa_${user1Jid}`, 'Noted Apples', 10, 'gemini-3.8-flash');

    recordUserMessage(`wa_${user2Jid}`, 'My secret is Oranges');
    recordAssistantMessage(`wa_${user2Jid}`, 'Noted Oranges', 10, 'gemini-3.8-flash');

    const ctx1 = buildWhatsAppChatContext({
      chatId: `wa_${user1Jid}`,
      promptText: 'What is my secret?',
      senderNumber: '919111111111',
      senderName: 'User1',
      isSandy: false,
    });

    const ctx2 = buildWhatsAppChatContext({
      chatId: `wa_${user2Jid}`,
      promptText: 'What is my secret?',
      senderNumber: '919222222222',
      senderName: 'User2',
      isSandy: false,
    });

    // User1 history contains Apples and NOT Oranges
    const user1HistoryText = ctx1.messages.map((m) => m.content).join(' ');
    assert.match(user1HistoryText, /Apples/i);
    assert.doesNotMatch(user1HistoryText, /Oranges/i);

    // User2 history contains Oranges and NOT Apples
    const user2HistoryText = ctx2.messages.map((m) => m.content).join(' ');
    assert.match(user2HistoryText, /Oranges/i);
    assert.doesNotMatch(user2HistoryText, /Apples/i);
  });

  await t.test('18. Dual-Engine Architecture & MasterBot Manager/Coder Role', async () => {
    const { buildWhatsAppDirective } = await import('../src/whatsapp/whatsappPersona.js');

    const contactDirective = buildWhatsAppDirective({
      senderNumber: '919876543210',
      senderName: 'Friend',
      isSandy: false,
      userPrompt: 'Tell me about quantum computing',
    });

    const masterDirective = buildWhatsAppDirective({
      senderNumber: '919999999999',
      senderName: 'Sandy',
      isSandy: true,
      userPrompt: 'Inspect the bot status',
    });

    // Contact directive emphasizes fast talk & low latency
    assert.match(contactDirective, /Gemini 3\.5 Flash/i);
    assert.match(contactDirective, /lowest latency/i);

    // MasterBot directive emphasizes supreme senior coder, manager & caretaker
    assert.match(masterDirective, /MASTERBOT/i);
    assert.match(masterDirective, /Autonomous Senior Coder/i);
    assert.match(masterDirective, /Gemini 3\.8 Flash/i);
    assert.match(masterDirective, /MAXIMUM \(HIGH\) reasoning/i);
  });

  await t.test('19. Owner Chat Buttons & Quick Action Execution', async () => {
    assert.ok(typeof whatsAppService.sendMasterBotMenu === 'function');
    assert.ok(typeof whatsAppService.executeOwnerAction === 'function');

    // Test executeOwnerAction for diagnostics
    let sentDiagnostic = '';
    const originalSafeSend = whatsAppService.safeSendMessage;
    whatsAppService.safeSendMessage = async (jid, payload) => {
      sentDiagnostic = payload.text || '';
      return { key: { id: 'test_msg_id' } };
    };

    try {
      await whatsAppService.executeOwnerAction('2', 'wa_sandy_master');
      assert.match(sentDiagnostic, /SYSTEM DIAGNOSTICS/i);
      assert.match(sentDiagnostic, /gemini-3.8-flash/i);

      // Test executeOwnerAction for routine
      await whatsAppService.executeOwnerAction('3', 'wa_sandy_master');
      assert.match(sentDiagnostic, /ROUTINE & GAMING/i);

      // Test executeOwnerAction for ping
      await whatsAppService.executeOwnerAction('6', 'wa_sandy_master');
      assert.match(sentDiagnostic, /Pong!/i);
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
    }
  });
});

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
});

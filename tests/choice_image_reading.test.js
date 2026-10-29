import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { visionService } from '../src/vision/visionService.js';
import { visualShoppingEngine } from '../src/shopping/visualShoppingEngine.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { initDatabase } from '../src/db/index.js';

describe('🎯 Choice Image Reading & Visual Selection Engine Suite', () => {

  before(() => {
    initDatabase();
    visualShoppingEngine.init();
  });

  // -------------------------------------------------------------------------
  // 1. Detection of Visual Choice Queries (English & Roman Hinglish)
  // -------------------------------------------------------------------------
  test('1. Accurately detects visual choice & comparison queries', () => {
    // English choice phrases
    assert.strictEqual(visionService.isVisualChoiceQuery('choose between 2'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('choose between two'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('choose between these two outfits'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('choose between them'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('choose 1 or 2'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('help me choose'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('pick one for me'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('which one is better?'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('which looks better?'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('which one suits me best'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('which one should I wear tonight?'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('which one should I buy?'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('1 or 2'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('1 or 2?'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('option 1 or option 2'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('left or right?'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('which one do you like more'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('which one do you prefer'), true);

    // Roman Hinglish / Urdu choice phrases
    assert.strictEqual(visionService.isVisualChoiceQuery('konsa lu?'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('konsi lu'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('kaunsa better hai dono me se'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('konsi achhi hai'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('konsi achi lag rahi hai'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('dono me se kaunsa lu'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('dono mein se choose karo'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('kya choose karu'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('kisko select karu'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('pehle wala ya dusra'), true);
    assert.strictEqual(visionService.isVisualChoiceQuery('compare these two and tell me which to choose'), true);
  });

  // -------------------------------------------------------------------------
  // 2. Rejection of Non-Choice Queries
  // -------------------------------------------------------------------------
  test('2. Rejects general queries and explicit shopping searches', () => {
    assert.strictEqual(visionService.isVisualChoiceQuery('Find me best price for Sony WH-1000XM5'), false);
    assert.strictEqual(visionService.isVisualChoiceQuery('Banarasi silk saree under 3000'), false);
    assert.strictEqual(visionService.isVisualChoiceQuery('Blinkit milk price'), false);
    assert.strictEqual(visionService.isVisualChoiceQuery('Tell me a funny joke'), false);
    assert.strictEqual(visionService.isVisualChoiceQuery('What is the weather today?'), false);
    assert.strictEqual(visionService.isVisualChoiceQuery('Write a quick sort algorithm in python'), false);
  });

  // -------------------------------------------------------------------------
  // 3. Shopping Engine Does NOT Hijack Choice Queries
  // -------------------------------------------------------------------------
  test('3. VisualShoppingEngine does not classify choice queries as shopping', () => {
    // When someone says "choose between 2", it must NOT be handled as shopping
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('choose between 2'), false);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('which one should i buy 1 or 2?'), false);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('konsa lu dono me se'), false);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('help me choose which looks better'), false);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('compare both and choose'), false);
  });

  // -------------------------------------------------------------------------
  // 4. Multi-Image Recent Image Sliding Cache
  // -------------------------------------------------------------------------
  test('4. Sliding window cache stores multiple recent images for follow-up comparison', () => {
    const testChat = 'test_choice_chat_99';
    const fakeBuffer1 = Buffer.from('FAKE_IMAGE_1_DATA');
    const fakeBuffer2 = Buffer.from('FAKE_IMAGE_2_DATA');

    visionService.pushRecentImage(testChat, {
      buffer: fakeBuffer1,
      mimeType: 'image/jpeg',
      timestamp: Date.now(),
      caption: 'Option 1: Black leather jacket',
    });

    visionService.pushRecentImage(testChat, {
      buffer: fakeBuffer2,
      mimeType: 'image/jpeg',
      timestamp: Date.now(),
      caption: 'Option 2: Denim jacket',
    });

    const recent = visionService.getRecentImages(testChat, 2);
    assert.strictEqual(recent.length, 2, 'Must retrieve both recently sent images');
    assert.strictEqual(recent[0].buffer.toString(), 'FAKE_IMAGE_1_DATA');
    assert.strictEqual(recent[1].buffer.toString(), 'FAKE_IMAGE_2_DATA');

    // Single image backward compatibility
    const single = visionService.getRecentImage(testChat);
    assert.strictEqual(single.buffer.toString(), 'FAKE_IMAGE_2_DATA');
  });

  // -------------------------------------------------------------------------
  // 5. evaluateVisualChoice Handles Both Persona Paths & Rejects Shopping Cards
  // -------------------------------------------------------------------------
  test('5. evaluateVisualChoice handles Sandy (Rebecca) and Contact (Nero) personas cleanly', async () => {
    const dummyImg = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=', 'base64');

    // Test with Sandy (Rebecca wife persona)
    const sandyRes = await visionService.evaluateVisualChoice({
      images: [{ buffer: dummyImg, mimeType: 'image/png' }],
      textPrompt: 'choose between 2',
      isSandy: true,
      userLanguage: 'English',
    });

    assert.ok(sandyRes, 'Must return a result');
    assert.ok(typeof sandyRes.description === 'string');
    // Ensure no shopping cards or store price comparisons are generated
    assert.strictEqual(sandyRes.description.includes('🛍️ *Product Overview:*'), false);
    assert.strictEqual(sandyRes.description.includes('🏷️ *Best Store Price Comparison:*'), false);

    // Test with general contact (Nero persona)
    const contactRes = await visionService.evaluateVisualChoice({
      images: [{ buffer: dummyImg, mimeType: 'image/png' }],
      textPrompt: 'choose between two options',
      isSandy: false,
      userLanguage: 'English',
    });

    assert.ok(contactRes, 'Must return a result');
    assert.ok(typeof contactRes.description === 'string');
    assert.strictEqual(contactRes.description.includes('🛍️ *Product Overview:*'), false);
    assert.strictEqual(contactRes.description.includes('🏷️ *Best Store Price Comparison:*'), false);
  });

  // -------------------------------------------------------------------------
  // 6. visualShoppingEngine.processShoppingRequest delegates to choice engine
  // -------------------------------------------------------------------------
  test('6. visualShoppingEngine.processShoppingRequest delegates to choice engine on choice queries', async () => {
    const dummyImg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const res = await visualShoppingEngine.processShoppingRequest({
      buffer: dummyImg,
      mimeType: 'image/jpeg',
      text: 'choose between 2',
      isSandy: true,
    });

    assert.ok(res.ok);
    assert.strictEqual(res.isChoice, true, 'Result must be flagged as choice instead of shopping');
    assert.ok(res.replyText, 'Must have reply text');
    assert.strictEqual(res.replyText.includes('Best Store Price Comparison'), false);
  });

  // -------------------------------------------------------------------------
  // 7. Empty Image Graceful Handling
  // -------------------------------------------------------------------------
  test('7. evaluateVisualChoice gracefully asks for images if none provided', async () => {
    const sandyEmpty = await visionService.evaluateVisualChoice({
      images: [],
      textPrompt: 'choose between 2',
      isSandy: true,
    });
    assert.match(sandyEmpty.description, /Babeee|photos|options/i, 'Rebecca asks Sandy for photos lovingly');

    const contactEmpty = await visionService.evaluateVisualChoice({
      images: [],
      textPrompt: 'choose between 2',
      isSandy: false,
    });
    assert.match(contactEmpty.description, /share the images|options/i, 'Nero asks contact to share images');
  });

  // -------------------------------------------------------------------------
  // 8. WhatsApp Service Direct Image Choice Flow
  // -------------------------------------------------------------------------
  test('8. WhatsApp Service handles incoming image with choice query without store prices', async () => {
    let sentPayload = null;
    const mockSock = {
      sendPresenceUpdate: async () => {},
      sendMessage: async (jid, payload) => {
        sentPayload = payload;
        return { key: { id: 'CHOICE_MSG_001' } };
      },
    };

    whatsAppService.sock = mockSock;

    // Simulate incoming image message with "choose between 2"
    const uniqueId1 = 'IMG_CHOICE_TEST_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const fakeMsg = {
      key: {
        remoteJid: '919876543210@s.whatsapp.net',
        id: uniqueId1,
        fromMe: false,
      },
      message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          caption: 'choose between 2',
        },
      },
    };

    await whatsAppService.handleIncomingMessage(fakeMsg);

    assert.ok(sentPayload, 'Response message must be sent');
    assert.ok(typeof sentPayload.text === 'string');
    // Verify it is a visual choice and NOT an e-commerce price comparison
    assert.strictEqual(sentPayload.text.includes('🛍️ *Product Overview:*'), false);
    assert.strictEqual(sentPayload.text.includes('🏷️ *Best Store Price Comparison:*'), false);
  });

  // -------------------------------------------------------------------------
  // 9. WhatsApp Service Follow-up Text Choice Flow
  // -------------------------------------------------------------------------
  test('9. WhatsApp Service handles follow-up text "choose between 2" using cached recent images', async () => {
    const testJid = '919876543210@s.whatsapp.net';
    const testChatId = `wa_${testJid}`;

    // Push a recent image into cache
    visionService.pushRecentImage(testChatId, {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
      mimeType: 'image/jpeg',
      timestamp: Date.now(),
      caption: 'Side by side sneakers',
    });

    let sentPayload = null;
    const mockSock = {
      sendPresenceUpdate: async () => {},
      sendMessage: async (jid, payload) => {
        sentPayload = payload;
        return { key: { id: 'FOLLOWUP_CHOICE_' + Date.now() } };
      },
    };

    whatsAppService.sock = mockSock;

    const uniqueId2 = 'TXT_CHOICE_TEST_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    // User sends follow-up text asking to choose
    const followUpMsg = {
      key: {
        remoteJid: testJid,
        id: uniqueId2,
        fromMe: false,
      },
      message: {
        conversation: 'Which one is better? Choose between 2',
      },
    };

    await whatsAppService.handleIncomingMessage(followUpMsg);

    assert.ok(sentPayload, 'Response message must be sent');
    assert.ok(typeof sentPayload.text === 'string');
    // Verify it evaluated the choice on the cached image and avoided shopping cards
    assert.strictEqual(sentPayload.text.includes('🛍️ *Product Overview:*'), false);
    assert.strictEqual(sentPayload.text.includes('🏷️ *Best Store Price Comparison:*'), false);
  });
});

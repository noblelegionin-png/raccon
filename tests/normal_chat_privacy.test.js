import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { sandyStatusService } from '../src/whatsapp/sandyStatusService.js';
import { scaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';
import { clearConversation } from '../src/conversation/manager.js';
import { buildWhatsAppChatContext, buildWhatsAppDirective } from '../src/whatsapp/whatsappPersona.js';
import { clearProcessedWhatsAppMessages } from '../src/db/index.js';

describe('🔒 WhatsApp Normal Chat Privacy & Owner Boundary Verification', () => {
  before(() => {
    sandyStatusService.init();
    clearProcessedWhatsAppMessages();
  });

  beforeEach(() => {
    clearProcessedWhatsAppMessages();
  });

  // --------------------------------------------------------------------------
  // 1. External contact LIDs are NOT recognized as Owner Sandy
  // --------------------------------------------------------------------------
  test('1. Purged contact numbers (105107177869409, 99897382551743) are NOT recognized as owner', () => {
    assert.strictEqual(sandyStatusService.isOwnerNumber('105107177869409'), false);
    assert.strictEqual(sandyStatusService.isOwnerNumber('99897382551743'), false);
    assert.strictEqual(sandyStatusService.isOwnerNumber('918888877777'), false);

    // True owners remain authorized
    assert.strictEqual(sandyStatusService.isOwnerNumber('214293836493051'), true);
    assert.strictEqual(sandyStatusService.isOwnerNumber('919317741936'), true);
    assert.strictEqual(sandyStatusService.isOwnerNumber('918091785996'), true);
    assert.strictEqual(sandyStatusService.isOwnerNumber('1452084875482'), true);
  });

  // --------------------------------------------------------------------------
  // 2. Incoming message from contact (105107177869409) is classified as external contact
  // --------------------------------------------------------------------------
  test('2. Incoming message from contact 105107177869409 uses gemini-3.5-flash-lite and does not access wa_sandy_master', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const originalChat = scaleMaxAdapter.createChatCompletion;

    let capturedChatId = null;
    let capturedModel = null;
    let capturedSystemDirective = null;

    scaleMaxAdapter.createChatCompletion = async ({ model, messages, chatId }) => {
      capturedModel = model;
      capturedChatId = chatId;
      capturedSystemDirective = messages.find(m => m.role === 'system')?.content || '';
      return {
        text: 'Sandy is currently away and unavailable right now. I have noted your message for his review!',
        tokensUsed: 25,
      };
    };

    const sent = [];
    whatsAppService.safeSendMessage = async (jid, content, options) => {
      sent.push({ jid, text: content.text || '', quoted: options?.quoted });
      return { jid, content };
    };

    const contactLid = '105107177869409@lid';
    clearConversation(`wa_${contactLid}`);
    clearConversation('wa_sandy_master');

    try {
      const incomingMsg = {
        key: { id: `contact_test_${Date.now()}`, remoteJid: contactLid, fromMe: false },
        message: { conversation: 'What is sandy doing right now' },
      };

      await whatsAppService.handleIncomingMessage(incomingMsg);

      // Verify model and isolation
      assert.strictEqual(capturedModel, 'gemini-3.5-flash-lite', 'Normal contacts must use gemini-3.5-flash-lite');
      assert.strictEqual(capturedChatId, `wa_${contactLid}`, 'Normal contacts must be isolated to their own chat ID, never wa_sandy_master');
      assert.notStrictEqual(capturedChatId, 'wa_sandy_master');

      // Verify privacy directive
      assert.match(capturedSystemDirective, /ABSOLUTELY NEVER TALK ABOUT PERSONAL THINGS IN NORMAL CHAT/i);
      assert.match(capturedSystemDirective, /Sandy's personal activities, private life, gaming habits/i);
      assert.doesNotMatch(capturedSystemDirective, /WHATSAPP MASTER CONSOLE & EXECUTIVE MANAGEMENT/i);

      // Verify reply was delivered to contact
      const contactReply = sent.find(m => m.jid === contactLid && m.text.includes('Sandy is currently away'));
      assert.ok(contactReply, 'Must deliver AI reply to contact');
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
      scaleMaxAdapter.createChatCompletion = originalChat;
      clearConversation(`wa_${contactLid}`);
      clearConversation('wa_sandy_master');
    }
  });

  // --------------------------------------------------------------------------
  // 3. Sandy status directive for external contacts strips private schedule descriptions
  // --------------------------------------------------------------------------
  test('3. Status directive for contacts strips private notes (e.g. Gaming Minecraft) and enforces privacy', () => {
    // Set a status with a private note
    sandyStatusService.setAvailabilitySchedule({
      status: 'gaming',
      description: 'Gaming (Minecraft Realm with friends)',
      startTime: new Date().toISOString(),
    });

    const directive = sandyStatusService.formatSandyStatusDirective();

    // Must NOT leak "Gaming (Minecraft Realm with friends)"
    assert.doesNotMatch(directive, /Gaming \(Minecraft Realm with friends\)/i, 'Private schedule description must not be in contact directive');
    assert.match(directive, /STRICT PRIVACY: In normal chats with contacts, NEVER share Sandy's private personal life/i);
    assert.match(directive, /Answer professionally and neutrally that Sandy is currently occupied\/away/i);
  });

  // --------------------------------------------------------------------------
  // 4. Contact sending /help receives clean public menu without internal masterbot details
  // --------------------------------------------------------------------------
  test('4. Contact sending /help receives public assistant menu without masterbot console details', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const sent = [];
    whatsAppService.safeSendMessage = async (jid, content, options) => {
      sent.push({ jid, text: content.text || '', quoted: options?.quoted });
      return { jid, content };
    };

    const contactJid = '99897382551743@lid';

    try {
      const incomingMsg = {
        key: { id: `help_contact_${Date.now()}`, remoteJid: contactJid, fromMe: false },
        message: { conversation: '/help' },
      };

      await whatsAppService.handleIncomingMessage(incomingMsg);

      assert.strictEqual(sent.length, 1);
      assert.strictEqual(sent[0].jid, contactJid);
      // Public assistant menu
      assert.match(sent[0].text, /EXECUTIVE AI ASSISTANT/i);
      assert.doesNotMatch(sent[0].text, /WHATSAPP MASTER CONSOLE/i);
      assert.doesNotMatch(sent[0].text, /code fixes/i);
      assert.doesNotMatch(sent[0].text, /gaming status/i);
      assert.doesNotMatch(sent[0].text, /When Sandy texts himself/i);
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
    }
  });

  // --------------------------------------------------------------------------
  // 5. Sandy in master console retains full access to high reasoning and master console
  // --------------------------------------------------------------------------
  test('5. Sandy in owner console (214293836493051) retains gemini-3.8-flash and master console directive', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const originalChat = scaleMaxAdapter.createChatCompletion;

    let capturedChatId = null;
    let capturedModel = null;
    let capturedSystemDirective = null;

    scaleMaxAdapter.createChatCompletion = async ({ model, messages, chatId }) => {
      capturedModel = model;
      capturedChatId = chatId;
      capturedSystemDirective = messages.find(m => m.role === 'system')?.content || '';
      return {
        text: 'Understood, Boss Sandy! Master console updated.',
        tokensUsed: 40,
      };
    };

    const sent = [];
    whatsAppService.safeSendMessage = async (jid, content, options) => {
      sent.push({ jid, text: content.text || '', quoted: options?.quoted });
      return { jid, content };
    };

    const ownerJid = '214293836493051@lid';
    clearConversation('wa_sandy_master');

    try {
      const incomingMsg = {
        key: { id: `owner_console_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: 'How is the system running?' },
      };

      await whatsAppService.handleIncomingMessage(incomingMsg);

      assert.strictEqual(capturedModel, 'gemini-3.8-flash', 'Owner console must use gemini-3.8-flash');
      assert.strictEqual(capturedChatId, 'wa_sandy_master', 'Owner console must use wa_sandy_master');
      assert.match(capturedSystemDirective, /WHATSAPP MASTER CONSOLE & EXECUTIVE MANAGEMENT/i);
      assert.match(capturedSystemDirective, /Creator and Owner/i);
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
      scaleMaxAdapter.createChatCompletion = originalChat;
      clearConversation('wa_sandy_master');
    }
  });
});

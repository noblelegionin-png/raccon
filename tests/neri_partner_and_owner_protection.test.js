import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { sandyStatusService } from '../src/whatsapp/sandyStatusService.js';
import { scaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';
import { buildWhatsAppDirective, buildWhatsAppChatContext } from '../src/whatsapp/whatsappPersona.js';
import {
  detectOwnerDisrespect,
  generateCaringRespectWarning,
  isHindiOrUrduText,
} from '../src/whatsapp/ownerProtectionService.js';
import { clearProcessedWhatsAppMessages, getDb } from '../src/db/index.js';

describe('❤️ Neri Extreme Lovely Partner Mode & 🛡️ Owner Respect Protection Suite', () => {
  before(() => {
    sandyStatusService.init();
    clearProcessedWhatsAppMessages();
  });

  beforeEach(() => {
    clearProcessedWhatsAppMessages();
  });

  // --------------------------------------------------------------------------
  // 1. Extreme Lovely Partner Mode (Rebecca / Neri) Directive Verification for Sandy
  // --------------------------------------------------------------------------
  test('1. Sandy personal chat directive activates Rebecca Autonomous Wife Persona', () => {
    const directive = buildWhatsAppDirective({
      isSandy: true,
      senderName: 'Sandy',
      senderNumber: '919317741936',
      userPrompt: 'Hy Rebecca, how are you today?',
    });

    // Check MYRA Persona & Identity
    assert.match(directive, /MYRA AI/i, 'Directive must explicitly state MYRA AI');
    assert.match(directive, /MYRA/i, 'Directive must identify persona as MYRA in personal chats with Sandy');
    assert.match(directive, /Sandy/i, 'Directive must recognize Sandy as Creator and Owner');
    assert.match(directive, /GPT-6 Luna/i, 'Must run on GPT-6 Luna');

    // Decoupled from Telegram
    assert.doesNotMatch(directive, /telegram/i);
    assert.doesNotMatch(directive, /botfather/i);
    assert.doesNotMatch(directive, /grammy/i);
  });

  // --------------------------------------------------------------------------
  // 2. Public Contact Directive includes Owner Identity & Respect Protection
  // --------------------------------------------------------------------------
  test('2. Public contact directive includes Owner Identity & Respect Protection section', () => {
    const directive = buildWhatsAppDirective({
      isSandy: false,
      senderName: 'External Client',
      senderNumber: '919988776655',
      userPrompt: 'Tell me about Sandy',
    });

    assert.match(directive, /OWNER IDENTITY & RESPECT PROTECTION/i, 'Directive must have dedicated Respect Protection section');
    assert.match(directive, /CARING & SUPPORTIVE/i, 'Protection style must be caring and supportive');
    assert.match(directive, /NEVER accept, validate, or ignore disrespect/i, 'Must not tolerate disrespect');
    assert.match(directive, /NEVER insult or curse back/i, 'Must never insult back or escalate toxicity');
  });

  // --------------------------------------------------------------------------
  // 3. Disrespect and Threat Detection Unit Tests
  // --------------------------------------------------------------------------
  test('3. detectOwnerDisrespect detects threats and abusive language against Sandy', () => {
    // Threats
    const threat1 = detectOwnerDisrespect('I will beat Sandy next time I see him');
    assert.strictEqual(threat1.isDisrespect, true);
    assert.strictEqual(threat1.isThreat, true);

    const threat2 = detectOwnerDisrespect('Sandy ko dekh lunga aane do use');
    assert.strictEqual(threat2.isDisrespect, true);
    assert.strictEqual(threat2.isThreat, true);

    const threat3 = detectOwnerDisrespect('Sandy ko maar dunga');
    assert.strictEqual(threat3.isDisrespect, true);
    assert.strictEqual(threat3.isThreat, true);

    // Abuse / Insults
    const abuse1 = detectOwnerDisrespect('Sandy is a loser and a fraud');
    assert.strictEqual(abuse1.isDisrespect, true);
    assert.strictEqual(abuse1.isAbuse, true);

    const abuse2 = detectOwnerDisrespect('Sandy chutiya hai');
    assert.strictEqual(abuse2.isDisrespect, true);
    assert.strictEqual(abuse2.isAbuse, true);

    const abuse3 = detectOwnerDisrespect('tell Sandy he is an idiot');
    assert.strictEqual(abuse3.isDisrespect, true);
    assert.strictEqual(abuse3.isAbuse, true);

    // Direct hostility in external DM
    const dmHostility = detectOwnerDisrespect('teri maa ki fuck off', { isExternalDm: true });
    assert.strictEqual(dmHostility.isDisrespect, true);

    // Legitimate messages must NOT be flagged
    assert.strictEqual(detectOwnerDisrespect('Hello Sandy, are you free?').isDisrespect, false);
    assert.strictEqual(detectOwnerDisrespect('What is Sandy doing today?').isDisrespect, false);
    assert.strictEqual(detectOwnerDisrespect('Can you let Sandy know I messaged him?').isDisrespect, false);
    assert.strictEqual(detectOwnerDisrespect('Thanks a lot!').isDisrespect, false);
  });

  // --------------------------------------------------------------------------
  // 4. Caring & Supportive Warning Generation
  // --------------------------------------------------------------------------
  test('4. generateCaringRespectWarning crafts dignified, caring, and protective responses', () => {
    // English warning
    const warnEn = generateCaringRespectWarning({
      senderName: 'John',
      isThreat: false,
      isUrduOrHindi: false,
    });
    assert.match(warnEn, /John/);
    assert.match(warnEn, /respectful, kind, and positive/i);
    assert.match(warnEn, /Sandy is someone very dear and deeply respected/i);
    assert.match(warnEn, /dignity and care/i);
    assert.doesNotMatch(warnEn, /fuck|idiot|loser|shut up/i, 'Must never contain retaliatory vulgarity');

    // Threat in English
    const warnThreatEn = generateCaringRespectWarning({
      senderName: 'Mark',
      isThreat: true,
      isUrduOrHindi: false,
    });
    assert.match(warnThreatEn, /pause for a moment and take a calm breath/i);
    assert.match(warnThreatEn, /threatening words or hostility have no place here/i);

    // Hindi / Urdu warning
    const warnHi = generateCaringRespectWarning({
      senderName: 'Rahul',
      isThreat: false,
      isUrduOrHindi: true,
    });
    assert.match(warnHi, /Rahul/);
    assert.match(warnHi, /respectful aur kind tareeqe se baat karein/i);
    assert.match(warnHi, /Sandy hum sab ke liye bohot respected aur dear hain/i);

    // Threat in Hindi / Urdu
    const warnThreatHi = generateCaringRespectWarning({
      senderName: 'Vikas',
      isThreat: true,
      isUrduOrHindi: true,
    });
    assert.match(warnThreatHi, /calm ho jaiye/i);
    assert.match(warnThreatHi, /threatening ya gusse bhari baatein bilkul theek nahi hain/i);
  });

  // --------------------------------------------------------------------------
  // 5. Intercept in WhatsApp Service for External Contact (DM)
  // --------------------------------------------------------------------------
  test('5. WhatsApp service intercepts disrespect from contact and issues caring warning + logs alert', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const sent = [];

    whatsAppService.safeSendMessage = async (jid, content, options) => {
      sent.push({ jid, text: content.text || '', quoted: options?.quoted });
      return { jid, content };
    };

    const abusiveMsg = {
      key: { id: 'm_abuse_test_01', remoteJid: '919876000001@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Sandy is an idiot and a fraud!' },
    };

    try {
      await whatsAppService.handleIncomingMessage(abusiveMsg);

      assert.strictEqual(sent.length, 1, 'Must send exactly one protective caring warning');
      assert.strictEqual(sent[0].jid, '919876000001@s.whatsapp.net');
      assert.match(sent[0].text, /Sandy is someone very dear and deeply respected/i);
      assert.match(sent[0].text, /dignity and care/i);

      // Verify urgent inbox received alert for Sandy
      const urgent = sandyStatusService.getUrgentRequests(10);
      const alert = urgent.find(u => u.sender_number === '919876000001');
      assert.ok(alert, 'Sandy urgent inbox must record alert for intercepted disrespect');
      assert.match(alert.message_text, /RESPECT DEFENSE ACTIVE/i);
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
    }
  });

  // --------------------------------------------------------------------------
  // 6. Intercept in Group Chat even without @nero tag
  // --------------------------------------------------------------------------
  test('6. WhatsApp service intercepts threat against Sandy in Group Chat without @nero tag', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const sent = [];

    whatsAppService.safeSendMessage = async (jid, content, options) => {
      sent.push({ jid, text: content.text || '', quoted: options?.quoted });
      return { jid, content };
    };

    const groupThreatMsg = {
      key: {
        id: 'm_group_threat_01',
        remoteJid: '1234567890-group@g.us',
        participant: '919876000002@s.whatsapp.net',
        fromMe: false,
      },
      message: { conversation: 'Sandy ko dekh lunga main kal' },
    };

    try {
      await whatsAppService.handleIncomingMessage(groupThreatMsg);

      assert.strictEqual(sent.length, 1, 'Must intervene in group to protect Sandy');
      assert.strictEqual(sent[0].jid, '1234567890-group@g.us');
      assert.match(sent[0].text, /calm ho jaiye|shant ho jaiye|Sandy hum sab ke liye bohot pyare/i);

      // Verify urgent inbox alert
      const urgent = sandyStatusService.getUrgentRequests(10);
      const alert = urgent.find(u => u.sender_number === '919876000002');
      assert.ok(alert, 'Group threat must trigger alert to Sandy urgent inbox');
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
    }
  });

  // --------------------------------------------------------------------------
  // 7. Sandy Personal Console Latency Ping reflects Extreme Lovely Partner Mode
  // --------------------------------------------------------------------------
  test('7. Sandy in personal console /ping confirms Extreme Lovely Partner Mode (Neri)', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const sent = [];

    whatsAppService.safeSendMessage = async (jid, content, options) => {
      sent.push({ jid, text: content.text || '', quoted: options?.quoted });
      return { jid, content };
    };

    const pingMsg = {
      key: { id: 'm_ping_sandy_01', remoteJid: '214293836493051@lid', fromMe: false },
      message: { conversation: '/ping' },
    };

    try {
      await whatsAppService.handleIncomingMessage(pingMsg);

      assert.strictEqual(sent.length, 1);
      assert.match(sent[0].text, /gpt-6-luna/i);
      assert.match(sent[0].text, /Extreme Lovely Partner Mode \(Neri\) active & devoted for Sandy/i);
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
    }
  });
});

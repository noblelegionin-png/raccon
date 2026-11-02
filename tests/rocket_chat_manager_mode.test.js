import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInvocationPolicy } from '../src/groups/invocationPolicy.js';
import { getConfig, setConfig } from '../src/db/index.js';
import { ROCKET_SYSTEM_DIRECTIVE } from '../src/conversation/identityRulebook.js';
import { buildWhatsAppDirective } from '../src/whatsapp/whatsappPersona.js';

test('🎛️ Chat Manager Mode — Telegram Invocation & Stop Feature Integration', () => {
  const fakeChatId = -1009988776655;

  // 1. Default Chat Manager Mode is Active: Rocket participates and blends in group
  setConfig('chat_manager_mode', 'true');
  setConfig(`text_mode_${fakeChatId}`, null);
  setConfig(`chatmode_${fakeChatId}`, null);

  const mockCtx = {
    chat: { id: fakeChatId, type: 'supergroup', title: 'Test Gaming Community' },
    message: { text: 'Yo what game are we playing tonight?', caption: null },
    from: { id: 123456789, first_name: 'Alex' },
    me: { id: 8283843309, username: 'RocketAIBot' },
  };

  const decision1 = evaluateInvocationPolicy(mockCtx);
  assert.equal(decision1.shouldRespond, true);
  assert.equal(decision1.reason, 'chat_manager_active');

  // 2. Stop Feature Honored: When text_mode is explicitly turned off (/chat stop or chup)
  setConfig(`text_mode_${fakeChatId}`, 'off');
  const decision2 = evaluateInvocationPolicy(mockCtx);
  assert.equal(decision2.shouldRespond, false);
  assert.equal(decision2.reason, 'text_mode_off_stop_feature');

  // 3. Resumed when turned back on
  setConfig(`text_mode_${fakeChatId}`, 'on');
  const decision3 = evaluateInvocationPolicy(mockCtx);
  assert.equal(decision3.shouldRespond, true);

  // Clean up test config
  setConfig('chat_manager_mode', 'false');
  setConfig(`text_mode_${fakeChatId}`, null);
});

test('🎛️ Chat Manager Directive Verification across WhatsApp & Telegram', () => {
  // Telegram ROCKET_SYSTEM_DIRECTIVE
  assert.ok(ROCKET_SYSTEM_DIRECTIVE.includes('CHAT MANAGER & CONVERSATION WINGMAN'));
  assert.ok(ROCKET_SYSTEM_DIRECTIVE.includes('READ CHAT & RELATE'));
  assert.ok(ROCKET_SYSTEM_DIRECTIVE.includes('BLEND IN NATURALLY'));

  // WhatsApp buildWhatsAppDirective
  const waDirective = buildWhatsAppDirective({
    senderNumber: '919876543210',
    senderName: 'Rohan',
    isSandy: false,
    userPrompt: 'Haan bhai kab chal rahe ho?',
    preferredLanguage: 'hinglish',
    preferredTone: 'warm',
    isGroup: false,
  });

  assert.ok(waDirective.includes('ACTIVE CHAT MANAGER & CONVERSATION WINGMAN'));
  assert.ok(waDirective.includes('READ CHAT & RELATE'));
  assert.ok(waDirective.includes('BLEND IN NATURALLY'));
  assert.ok(waDirective.includes('Talk and reply to BOTH Sandy and the person he is talking to'));
});

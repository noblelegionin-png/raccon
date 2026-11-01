import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { isMuteTrigger, isUnmuteTrigger, parseTargetedBlockCommand } from '../src/whatsapp/whatsappService.js';
import { outreachService } from '../src/whatsapp/outreachService.js';
import { delegationService } from '../src/whatsapp/delegationService.js';
import { buildWhatsAppDirective, buildWhatsAppChatContext } from '../src/whatsapp/whatsappPersona.js';

test('🤫 In-Chat Mute & Unmute Triggers Recognition', () => {
  // Mute triggers
  assert.equal(isMuteTrigger('chup'), true);
  assert.equal(isMuteTrigger('chup hoja'), true);
  assert.equal(isMuteTrigger('rocket chup hoja'), true);
  assert.equal(isMuteTrigger('shut up'), true);
  assert.equal(isMuteTrigger('rocket shut up'), true);
  assert.equal(isMuteTrigger('be quiet'), true);
  assert.equal(isMuteTrigger('/mute'), true);
  assert.equal(isMuteTrigger('bakwaas band kar'), true);
  assert.equal(isMuteTrigger('khamosh'), true);
  assert.equal(isMuteTrigger('silent'), true);

  // Commands targeting other numbers MUST NOT trigger in-chat mute!
  assert.equal(isMuteTrigger('block chat for 9876543210'), false);
  assert.equal(isMuteTrigger('mute chat for 9876543210'), false);
  assert.equal(isMuteTrigger('mute 9876543210'), false);

  // Unmute triggers
  assert.equal(isUnmuteTrigger('bol'), true);
  assert.equal(isUnmuteTrigger('ab bol'), true);
  assert.equal(isUnmuteTrigger('rocket bol'), true);
  assert.equal(isUnmuteTrigger('unmute'), true);
  assert.equal(isUnmuteTrigger('/unmute'), true);
  assert.equal(isUnmuteTrigger('chalu hoja'), true);
  assert.equal(isUnmuteTrigger('speak up'), true);
  assert.equal(isUnmuteTrigger('awaaz nikal'), true);
});

test('🔒 Targeted Block & Mute Command Parsing', () => {
  // Block / Mute patterns
  const b1 = parseTargetedBlockCommand('block chat for 9876543210');
  assert.equal(b1.isBlockCommand, true);
  assert.equal(b1.action, 'block');
  assert.equal(b1.directNumber, '919876543210');

  const b2 = parseTargetedBlockCommand('mute chat for +91 98765 43210');
  assert.equal(b2.isBlockCommand, true);
  assert.equal(b2.action, 'block');
  assert.equal(b2.directNumber, '919876543210');

  const b3 = parseTargetedBlockCommand('block 9876543210');
  assert.equal(b3.isBlockCommand, true);
  assert.equal(b3.action, 'block');

  const b4 = parseTargetedBlockCommand('9876543210 ko block karo');
  assert.equal(b4.isBlockCommand, true);
  assert.equal(b4.action, 'block');

  // Unblock / Unmute patterns
  const u1 = parseTargetedBlockCommand('unblock chat for 9876543210');
  assert.equal(u1.isBlockCommand, true);
  assert.equal(u1.action, 'unblock');
  assert.equal(u1.directNumber, '919876543210');

  const u2 = parseTargetedBlockCommand('unmute 9876543210');
  assert.equal(u2.isBlockCommand, true);
  assert.equal(u2.action, 'unblock');

  // Negative tests
  assert.equal(parseTargetedBlockCommand('hello how are you').isBlockCommand, false);
  assert.equal(parseTargetedBlockCommand('chup hoja').isBlockCommand, false);
});

test('📱 Outreach Command Parsing — "TEXT ----- NO HY"', () => {
  // Test Sandy's specific pattern: "text 9876543210 no hy"
  const o1 = outreachService.parseOutreachCommand('text 9876543210 no hy');
  assert.equal(o1.isOutreach, true);
  assert.equal(o1.directNumber, '919876543210');
  assert.equal(o1.instruction, 'hy');

  // "text 9876543210 hy"
  const o2 = outreachService.parseOutreachCommand('text 9876543210 hy');
  assert.equal(o2.isOutreach, true);
  assert.equal(o2.directNumber, '919876543210');
  assert.equal(o2.instruction, 'hy');

  // "text 9876543210: hy"
  const o3 = outreachService.parseOutreachCommand('text 9876543210: hy');
  assert.equal(o3.isOutreach, true);
  assert.equal(o3.instruction, 'hy');

  // "text no 9876543210 hy"
  const o4 = outreachService.parseOutreachCommand('text no 9876543210 hy');
  assert.equal(o4.isOutreach, true);
  assert.equal(o4.directNumber, '919876543210');
  assert.equal(o4.instruction, 'hy');

  // Hindi pattern: "9876543210 ko text karo ki main 5 baje aaunga"
  const o5 = outreachService.parseOutreachCommand('9876543210 ko text karo ki main 5 baje aaunga');
  assert.equal(o5.isOutreach, true);
  assert.equal(o5.instruction, 'main 5 baje aaunga');
});

test('🤝 Behalf-Of Delegation Command Parsing & Lifecycle', () => {
  // 1. Parsing: "I am busy, talk with 9876543210 on behalf of me"
  const d1 = delegationService.parseBehalfOfCommand('I am busy, talk with 9876543210 on behalf of me');
  assert.equal(d1.isBehalf, true);
  assert.equal(d1.action, 'start');
  assert.equal(d1.directNumber, '919876543210');

  // "i am busy talk with 9876543210 behalf of me"
  const d2 = delegationService.parseBehalfOfCommand('i am busy talk with 9876543210 behalf of me');
  assert.equal(d2.isBehalf, true);
  assert.equal(d2.action, 'start');
  assert.equal(d2.directNumber, '919876543210');

  // "handle chat for 9876543210"
  const d3 = delegationService.parseBehalfOfCommand('handle chat for 9876543210');
  assert.equal(d3.isBehalf, true);
  assert.equal(d3.action, 'start');
  assert.equal(d3.directNumber, '919876543210');

  // "9876543210 se meri taraf se baat kar main busy hoon"
  const d4 = delegationService.parseBehalfOfCommand('9876543210 se meri taraf se baat kar main busy hoon');
  assert.equal(d4.isBehalf, true);
  assert.equal(d4.action, 'start');

  // Stop delegation: "stop talking on behalf of 9876543210", "i am free now"
  const s1 = delegationService.parseBehalfOfCommand('stop talking on behalf of 9876543210');
  assert.equal(s1.isBehalf, true);
  assert.equal(s1.action, 'stop');

  const s2 = delegationService.parseBehalfOfCommand('i am free now');
  assert.equal(s2.isBehalf, true);
  assert.equal(s2.action, 'stop');

  // 2. Lifecycle testing: Start -> Message Log -> IsDelegated -> Stop -> Summary
  const start = delegationService.startDelegation({
    targetNumber: '919876543210',
    targetName: 'Investor Rahul',
    customNotes: 'Take detailed notes about series A deck.',
  });
  assert.equal(start.ok, true);
  assert.equal(delegationService.isDelegated('919876543210@s.whatsapp.net'), true);

  // Log turns
  delegationService.logMessage('919876543210@s.whatsapp.net', '919876543210', 'Rahul', 'user', 'Hey Sandy, do you have the revised valuation?');
  delegationService.logMessage('919876543210@s.whatsapp.net', 'rocket', 'Rocket', 'assistant', 'Hello Rahul! Rocket here for Sandy. Sandy is tied up right now, but I have noted this down for him.');

  // Stop delegation and get summary
  const stop = delegationService.stopDelegation('919876543210@s.whatsapp.net');
  assert.equal(stop.ok, true);
  assert.equal(stop.stopped, true);
  assert.ok(stop.summary && stop.summary.includes('valuation'));
  assert.equal(delegationService.isDelegated('919876543210@s.whatsapp.net'), false);
});

test('🎭 Dynamic Directive Generation — Blend Nicely & Behalf-Of Mode', () => {
  // Sandy Directive
  const sandyDir = buildWhatsAppDirective({
    senderNumber: '919317741936',
    senderName: 'Sandy',
    isSandy: true,
    userPrompt: 'yo rocket kya haal hai',
  });
  assert.ok(sandyDir.includes('ROCKET AI'));
  assert.ok(sandyDir.includes('Sandy is your BOSS'));

  // Contact Directive with Behalf-Of Mode Active
  const delegatedDir = buildWhatsAppDirective({
    senderNumber: '919876543210',
    senderName: 'Client Alex',
    isSandy: false,
    userPrompt: 'Can we schedule a call today?',
    isDelegated: true,
    delegationInfo: { custom_notes: 'Discuss Q3 deliverables.' },
  });
  assert.ok(delegatedDir.includes('ACTIVE BEHALF-OF DELEGATION MODE'));
  assert.ok(delegatedDir.includes('Discuss Q3 deliverables.'));
  assert.ok(delegatedDir.includes('BLEND NICELY IN THE TALK DIFFERENT EVERY CHAT'));
});

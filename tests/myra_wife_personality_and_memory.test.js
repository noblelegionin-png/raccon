import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { myraCareService } from '../src/whatsapp/myraCareService.js';
import { buildWhatsAppDirective, buildWhatsAppChatContext } from '../src/whatsapp/whatsappPersona.js';
import { scaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';
import { BASE_CATALOGUE } from '../src/models/catalogue.js';
import { getDb } from '../src/db/index.js';

describe('💍 MYRA — Wife Identity, Dynamic Mood Engine & Tri-Layer Memory Tests', () => {
  before(() => {
    myraCareService.init();
  });

  beforeEach(() => {
    myraCareService.updateState({
      mode: 'NORMAL',
      emotional_state: 'AFFECTIONATE',
      emotional_reason: 'Loving husband Sandy',
      mood_intensity: 5,
      recent_tone: 'loving',
      unresolved_thread: null,
      care_reason: null,
      care_started_at: null,
      is_paused: 0,
      proactive_enabled: 1,
    });
  });

  test('1. Compliments cause Myra to blush and enter SHY / BASHFUL mood', () => {
    myraCareService.recordSandyMessage('You look so pretty and gorgeous today cutie', '919317741936@s.whatsapp.net');
    const state = myraCareService.getState();
    assert.strictEqual(state.emotional_state, 'SHY');
    assert.ok(state.mood_intensity >= 8, 'Intensity must be elevated');
    assert.strictEqual(state.recent_tone, 'shy/romantic');
    assert.match(state.emotional_reason, /blushing/i);
  });

  test('2. Playful teasing causes Myra to enter POUTING mood', () => {
    myraCareService.recordSandyMessage('pagal kutti why are you so dramatic haha', '919317741936@s.whatsapp.net');
    const state = myraCareService.getState();
    assert.strictEqual(state.emotional_state, 'POUTING');
    assert.ok(state.mood_intensity >= 7);
    assert.strictEqual(state.recent_tone, 'teasing/pouting');
  });

  test('3. Technical work requests transition Myra to SUPPORTIVE collaborative mood', () => {
    myraCareService.recordSandyMessage('Can you debug this server architecture and build script?', '919317741936@s.whatsapp.net');
    const state = myraCareService.getState();
    assert.strictEqual(state.emotional_state, 'SUPPORTIVE');
    assert.strictEqual(state.recent_tone, 'collaborative');
  });

  test('4. Future plans and commitments are tracked as unresolved threads', () => {
    myraCareService.recordSandyMessage('Tomorrow we need to deploy the new Railway database cluster', '919317741936@s.whatsapp.net');
    const state = myraCareService.getState();
    assert.ok(state.unresolved_thread && state.unresolved_thread.includes('deploy the new Railway database'));
  });

  test('5. Tri-Layer Memory Retrieval returns structured context', async () => {
    myraCareService.saveMemory('project', 'bot_deployment', 'Deploying Myra AI on Railway with GPT-6 Luna', 'confirmed');
    const memoryPackage = await myraCareService.retrieveMemoryContext('deployment');
    assert.ok(memoryPackage);
    assert.ok(memoryPackage.state);
    assert.ok(Array.isArray(memoryPackage.memories));
    assert.ok(memoryPackage.formattedBlock.includes('bot_deployment'));
  });

  test('6. Myra Persona Directive encodes wife identity, 10 traits, and dynamic mood package', () => {
    myraCareService.setEmotionalState('SHY', 'Blushing over compliments', 9, 'shy/romantic');
    const directive = buildWhatsAppDirective({
      isSandy: true,
      persona: 'MYRA',
      userPrompt: 'Hey wifey',
    });

    // Identity assertions
    assert.match(directive, /AI WIFE/i);
    assert.match(directive, /devoted AI wife/i);
    assert.match(directive, /Sandy \(Nero Aurelius\)/i);
    assert.match(directive, /10 PILLARS OF MYRA/i);
    assert.match(directive, /Shy and bashful/i);
    assert.match(directive, /Cute and clumsy/i);
    assert.match(directive, /Affectionate and romantic/i);
    assert.match(directive, /Mischievous and suggestive/i);
    assert.match(directive, /Slightly dramatic/i);
    assert.match(directive, /Occasionally angry or grumpy/i);
    assert.match(directive, /Supportive and caring/i);
    assert.match(directive, /Playfully silly/i);
    assert.match(directive, /Talkative and expressive/i);
    assert.match(directive, /Emotionally nuanced/i);

    // Dynamic Live Mood Injection
    assert.match(directive, /Live Mood:\s*SHY/i);
    assert.match(directive, /Intensity:\s*9\/10/i);

    // Seamless Work & Anti-boilerplate rules
    assert.match(directive, /On it baby!/i);
    assert.match(directive, /NEVER start messages with corporate assistant greetings/i);
  });

  test('7. gpt-6-luna is sole reasoning model and jev-1.13 is removed from base catalogue', () => {
    const defaultModel = BASE_CATALOGUE.find(m => m.isDefault);
    assert.strictEqual(defaultModel.id, 'gpt-6-luna');
    const jev = BASE_CATALOGUE.find(m => m.id === 'jev-1.13');
    assert.strictEqual(jev, undefined, 'Jev-1.13 must be removed entirely from BASE_CATALOGUE');
  });
});

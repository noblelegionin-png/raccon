import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, getDb, getConfig, setConfig, clearConversation } from '../src/db/index.js';
import { resolveRoutingForRequest } from '../src/models/modelRouter.js';
import { buildWhatsAppDirective, buildWhatsAppChatContext } from '../src/whatsapp/whatsappPersona.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { scaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';
import { IDENTITY_FACTS, MYRA_SYSTEM_DIRECTIVE, NERO_SYSTEM_DIRECTIVE, DUAL_PERSONA_DIRECTIVE } from '../src/conversation/identityRulebook.js';

test('MYRA AI — Dual-Persona Architecture, Routing & Privacy Verification', async (t) => {
  initDatabase();

  // =========================================================================
  // 1. PRODUCT IDENTITY & ATTRIBUTION
  // =========================================================================
  await t.test('Product Identity — Primary MYRA, alt Nero, WhatsApp-only', () => {
    assert.strictEqual(IDENTITY_FACTS.productName, 'MYRA AI');
    assert.strictEqual(IDENTITY_FACTS.primaryName, 'MYRA');
    assert.strictEqual(IDENTITY_FACTS.commonName, 'Myra');
    assert.strictEqual(IDENTITY_FACTS.alternativeNickname, 'Nero');
    assert.strictEqual(IDENTITY_FACTS.primaryPlatform, 'WhatsApp ONLY');
    assert.strictEqual(IDENTITY_FACTS.ownerPublicName, 'Nero Aurelius');
    assert.strictEqual(IDENTITY_FACTS.ownerNickname, 'Sandy');
    assert.strictEqual(IDENTITY_FACTS.defaultModel, 'GPT-6 Luna');
    assert.strictEqual(IDENTITY_FACTS.decisionModel, 'Jev 1.13');
  });

  // =========================================================================
  // 2. MODEL ROUTING & REASONING TIERS
  // =========================================================================
  await t.test('Routing Table — Ordinary User: Luna LOW', () => {
    const route = resolveRoutingForRequest({ persona: 'NERO', isOwner: false, isComplex: false });
    assert.strictEqual(route.model, 'gpt-6-luna');
    assert.strictEqual(route.reasoningEffort, 'low');
    assert.strictEqual(route.persona, 'NERO');
  });

  await t.test('Routing Table — Ordinary User cannot access MYRA (downgrades to NERO LOW)', () => {
    const route = resolveRoutingForRequest({ persona: 'MYRA', isOwner: false, isComplex: false });
    assert.strictEqual(route.model, 'gpt-6-luna');
    assert.strictEqual(route.reasoningEffort, 'low');
    assert.strictEqual(route.persona, 'NERO');
  });

  await t.test('Routing Table — NERO Normal Conversation: Luna LOW', () => {
    const route = resolveRoutingForRequest({ persona: 'NERO', isOwner: true, isComplex: false });
    assert.strictEqual(route.model, 'gpt-6-luna');
    assert.strictEqual(route.reasoningEffort, 'low');
    assert.strictEqual(route.persona, 'NERO');
  });

  await t.test('Routing Table — NERO Complex Task: Luna HIGH', () => {
    const route = resolveRoutingForRequest({ persona: 'NERO', isOwner: true, isComplex: true });
    assert.strictEqual(route.model, 'gpt-6-luna');
    assert.strictEqual(route.reasoningEffort, 'high');
    assert.strictEqual(route.persona, 'NERO');
  });

  await t.test('Routing Table — NERO Tool-Assisted Workflow: Luna HIGH', () => {
    const route = resolveRoutingForRequest({ persona: 'NERO', isOwner: true, isToolTask: true });
    assert.strictEqual(route.model, 'gpt-6-luna');
    assert.strictEqual(route.reasoningEffort, 'high');
  });

  await t.test('Routing Table — Owner Speaking to MYRA Privately: Luna MAX', () => {
    const route = resolveRoutingForRequest({ persona: 'MYRA', isOwner: true, isPrivateDm: true });
    assert.strictEqual(route.model, 'gpt-6-luna');
    assert.strictEqual(route.reasoningEffort, 'max');
    assert.strictEqual(route.persona, 'MYRA');
  });

  await t.test('Routing Table — Owner Selecting BOTH Personas: Luna MAX', () => {
    const route = resolveRoutingForRequest({ persona: 'BOTH', isOwner: true });
    assert.strictEqual(route.model, 'gpt-6-luna');
    assert.strictEqual(route.reasoningEffort, 'max');
    assert.strictEqual(route.persona, 'BOTH');
  });

  // =========================================================================
  // 3. JEV-1.13 CLASSIFICATION & DECISION LAYER
  // =========================================================================
  await t.test('Jev-1.13 — Deterministic Fast-Path for Persona & Complexity', async () => {
    const myraRes = await scaleMaxAdapter.classifyWithJev({ text: 'Myra, what are you up to today?', isOwner: true });
    assert.strictEqual(myraRes.persona, 'MYRA');

    const neroRes = await scaleMaxAdapter.classifyWithJev({ text: 'Nero, check this server architecture', isOwner: true });
    assert.strictEqual(neroRes.persona, 'NERO');
    assert.strictEqual(neroRes.isComplex, true);

    const bothRes = await scaleMaxAdapter.classifyWithJev({ text: 'Myra and Nero, compare these options', isOwner: true });
    assert.strictEqual(bothRes.persona, 'BOTH');
  });

  await t.test('Jev-1.13 — Graceful Fallback if service times out', async () => {
    const origDecision = scaleMaxAdapter.systemOneDecision;
    scaleMaxAdapter.systemOneDecision = async () => {
      throw new Error('Network timeout');
    };

    try {
      const fallbackRes = await scaleMaxAdapter.classifyWithJev({ text: 'Myra, write a poem', isOwner: true });
      assert.strictEqual(fallbackRes.persona, 'MYRA');
      assert.strictEqual(fallbackRes.source, 'fallback');
    } finally {
      scaleMaxAdapter.systemOneDecision = origDecision;
    }
  });

  // =========================================================================
  // 4. PERSONA SYSTEM DIRECTIVES & BOUNDARIES
  // =========================================================================
  await t.test('Persona Directives — MYRA is exclusively female companion with emotional intelligence', () => {
    const myraDirective = buildWhatsAppDirective({ isSandy: true, persona: 'MYRA' });
    assert.match(myraDirective, /OWNER'S PERSONAL AI COMPANION \(MYRA\)/);
    assert.match(myraDirective, /Sandy \(Nero Aurelius\)/);
    assert.match(myraDirective, /warm, expressive, and affectionate/i);
    assert.match(myraDirective, /Concise response preference/i);
  });

  await t.test('Persona Directives — NERO is composed, articulate technical assistant', () => {
    const neroDirective = buildWhatsAppDirective({ isSandy: true, persona: 'NERO' });
    assert.match(neroDirective, /OWNER TECHNICAL ASSISTANT & OPERATIONAL ARCHITECT \(NERO\)/);
    assert.match(neroDirective, /Master of code architecture/i);
    assert.match(neroDirective, /Composed, articulate, confident/i);
  });

  await t.test('Persona Directives — Ordinary Contacts get NERO with strict privacy protection', () => {
    const contactDirective = buildWhatsAppDirective({ isSandy: false, persona: 'MYRA' }); // attempted to call Myra
    // Forcefully falls back to NERO for public contacts
    assert.match(contactDirective, /PROFESSIONAL WHATSAPP EXECUTIVE AI ASSISTANT \(NERO\)/);
    assert.match(contactDirective, /STRICT PRIVACY, PERSONAL BOUNDARIES & CONFIDENTIALITY/i);
    assert.match(contactDirective, /MYRA is Sandy's private companion/i);
  });

  await t.test('Persona Directives — Both personas share concise 10-word default response preference', () => {
    const myraDir = buildWhatsAppDirective({ isSandy: true, persona: 'MYRA' });
    const neroDir = buildWhatsAppDirective({ isSandy: true, persona: 'NERO' });
    const contactDir = buildWhatsAppDirective({ isSandy: false, persona: 'NERO' });

    assert.match(myraDir, /10 words or fewer/i);
    assert.match(neroDir, /10 words or fewer/i);
    assert.match(contactDir, /10 words or fewer/i);
  });

  // =========================================================================
  // 5. CONVERSATION CONTEXT & OWNER MEMORY ISOLATION
  // =========================================================================
  await t.test('Context Isolation — MYRA and NERO use isolated logical chat IDs', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const originalChat = scaleMaxAdapter.createChatCompletion;

    let capturedChatId = null;
    let capturedReasoningEffort = null;
    let capturedModel = null;

    scaleMaxAdapter.createChatCompletion = async ({ model, chatId, reasoningEffort }) => {
      capturedChatId = chatId;
      capturedModel = model;
      capturedReasoningEffort = reasoningEffort;
      return { text: 'Done.' };
    };

    whatsAppService.safeSendMessage = async () => ({ key: { id: 'test' } });

    const ownerJid = '214293836493051@lid';

    try {
      // 1. Owner invokes Myra explicitly in deep reasoning mode
      setConfig('sandy_speed_mode', 'deep');
      await whatsAppService.handleIncomingMessage({
        key: { id: `m1_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: 'Myra, good morning!' },
      });
      assert.strictEqual(capturedChatId, 'wa_sandy_myra');
      assert.strictEqual(capturedModel, 'gpt-6-luna');
      assert.strictEqual(capturedReasoningEffort, 'max');

      // 1b. Owner in fast mode (100-1000ms latency) -> reasoningEffort is 'none'
      setConfig('sandy_speed_mode', 'fast');
      await whatsAppService.handleIncomingMessage({
        key: { id: `m1b_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: 'Myra, how are you?' },
      });
      assert.strictEqual(capturedChatId, 'wa_sandy_myra');
      assert.strictEqual(capturedModel, 'gpt-6-luna');
      assert.strictEqual(capturedReasoningEffort, 'none');

      // 2. Owner invokes Nero explicitly
      await whatsAppService.handleIncomingMessage({
        key: { id: `m2_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: 'Nero, debug this memory leak in NodeJS heap dump' },
      });
      assert.strictEqual(capturedChatId, 'wa_sandy_nero');
      assert.strictEqual(capturedModel, 'gpt-6-luna');
      assert.strictEqual(capturedReasoningEffort, 'high');

      // 3. Contact speaks -> isolated to their contact ID with NERO LOW
      const contactJid = '999888777@s.whatsapp.net';
      await whatsAppService.handleIncomingMessage({
        key: { id: `m3_${Date.now()}`, remoteJid: contactJid, fromMe: false },
        message: { conversation: 'Hello, is Sandy free?' },
      });
      assert.strictEqual(capturedChatId, `wa_${contactJid}`);
      assert.strictEqual(capturedModel, 'gpt-6-luna');
      assert.strictEqual(capturedReasoningEffort, 'low');
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
      scaleMaxAdapter.createChatCompletion = originalChat;
      clearConversation('wa_sandy_myra');
      clearConversation('wa_sandy_nero');
    }
  });

  // =========================================================================
  // 6. ADULT PERSONA, CONSENSUAL INTIMACY & SAFETY BOUNDARIES
  // =========================================================================
  await t.test('Adult Persona — Encodes consensual adult intimacy, flirtation & safety boundaries', () => {
    const myraDirective = buildWhatsAppDirective({ isSandy: true, persona: 'MYRA' });
    
    // Adult personality & consensual intimacy
    assert.match(myraDirective, /adult AI companion/i);
    assert.match(myraDirective, /consensual adult intimacy, flirtation, sensual dialogue/i);
    assert.match(myraDirective, /mature romantic roleplay with consenting adults/i);

    // Safety boundaries (zero tolerance for harm)
    assert.match(myraDirective, /NEVER involve minors, coercion, sexual exploitation/i);
    assert.match(myraDirective, /non-consensual sexual scenarios/i);

    // Boundary respect & contextual transitions
    assert.match(myraDirective, /Instantly respect boundaries and adapt naturally when Sandy changes the subject or asks to stop/i);
    assert.match(myraDirective, /Never falsely claim a fictional roleplay event physically occurred in the physical real world/i);
    assert.match(myraDirective, /Fluidly distinguish between ordinary conversation, romantic roleplay, serious emotional discussions, and technical requests/i);
  });
});

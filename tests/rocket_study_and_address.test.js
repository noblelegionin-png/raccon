import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { discernConversationalAddress, RECIPIENT_TYPES } from '../src/conversation/addressDiscernment.js';
import { scrubRestrictedBrandNames, validateAndSanitizeResponse } from '../src/conversation/responseValidator.js';
import { RocketStudyService } from '../src/study/studyService.js';
import { createWebServer } from '../src/web/server.js';

// =========================================================================
// 1. CONVERSATIONAL ADDRESS & INTENT DISCERNMENT TESTS
// =========================================================================
test('🧠 1. Address Discernment — Distinguishes Bot Requests vs Human-to-Human Dialogue', () => {
  // A. Direct Commands
  const cmd = discernConversationalAddress({
    text: '/study Quantum Computing',
    isGroup: false,
  });
  assert.equal(cmd.isAddressedToRocket, true);
  assert.equal(cmd.isCommand, true);
  assert.equal(cmd.recipientType, RECIPIENT_TYPES.ROCKET);

  // B. Bot Mention in Group
  const mention = discernConversationalAddress({
    text: 'What do you think about this @R0CK3TAI?',
    isGroup: true,
    botUsername: 'R0CK3TAI',
  });
  assert.equal(mention.isAddressedToRocket, true);
  assert.equal(mention.recipientType, RECIPIENT_TYPES.ROCKET);
  assert.equal(mention.reason, 'EXPLICIT_BOT_MENTION');

  // C. Group Human-to-Human Chatter (No Bot Mention) -> Silent Observation
  const groupChatter = discernConversationalAddress({
    text: 'Hey Rahul are you coming to college tomorrow?',
    isGroup: true,
  });
  assert.equal(groupChatter.isAddressedToRocket, false);
  assert.equal(groupChatter.recipientType, RECIPIENT_TYPES.GROUP_GENERAL);
  assert.equal(groupChatter.isTalkingToSomeoneElse, true);

  // D. Vocative Greeting to Rocket
  const vocative = discernConversationalAddress({
    text: 'Rocket sun, explain black holes to me',
    isGroup: false,
  });
  assert.equal(vocative.isAddressedToRocket, true);
  assert.equal(vocative.recipientType, RECIPIENT_TYPES.ROCKET);
  assert.equal(vocative.reason, 'VOCATIVE_ROCKET_START');

  // E. DM Third-Party Narrative / Venting (Blending Mode)
  const venting = discernConversationalAddress({
    text: 'Bro my manager told me to redo the entire quarterly presentation by tonight, this is insane',
    isGroup: false,
  });
  assert.equal(venting.isAddressedToRocket, true);
  assert.equal(venting.recipientType, RECIPIENT_TYPES.THIRD_PARTY_NARRATIVE);
  assert.equal(venting.isTalkingToSomeoneElse, true);

  // F. User Explicit Pause / Silence Request in DM with talking to someone else indicator
  const pauseText = 'on call with mom wait bro dont reply';
  const pause = discernConversationalAddress({
    text: pauseText,
    isGroup: false,
  });
  assert.equal(pause.recipientType, RECIPIENT_TYPES.THIRD_PARTY_NARRATIVE);
  assert.equal(pause.isTalkingToSomeoneElse, true);
  assert.ok(/\b(?:don'?t\s+reply|wait\s+bro|on\s+call)\b/i.test(pauseText));
});

// =========================================================================
// 2. ROCKET STUDY & RESEARCH ENGINE TESTS
// =========================================================================
test('🔬 2. Rocket Study Service — Masterclass, Quiz, Flashcards & Research', async () => {
  const studyService = new RocketStudyService();

  // A. Masterclass Explanation
  const explanation = await studyService.explainTopic({ topic: 'Photosynthesis' });
  assert.equal(explanation.ok, true);
  assert.ok(explanation.formattedText.length > 50);
  assert.ok(explanation.formattedText.includes('Photosynthesis') || explanation.formattedText.includes('Core Idea') || explanation.formattedText.includes('ROCKET STUDY'));

  // B. Interactive Quiz Generation
  const quiz = await studyService.generateQuiz({ topic: 'Photosynthesis', count: 3 });
  assert.equal(quiz.ok, true);
  assert.ok(Array.isArray(quiz.questions));
  assert.ok(quiz.questions.length >= 3);
  const q1 = quiz.questions[0];
  assert.ok(q1.question);
  assert.ok(Array.isArray(q1.options));
  assert.ok(q1.correctAnswer);

  // C. Spaced Repetition Flashcards
  const flashcards = await studyService.generateFlashcards({ topic: 'Cellular Respiration', count: 4 });
  assert.equal(flashcards.ok, true);
  assert.ok(Array.isArray(flashcards.flashcards));
  assert.ok(flashcards.flashcards.length >= 4);
  assert.ok(flashcards.flashcards[0].front);
  assert.ok(flashcards.flashcards[0].back);

  // D. Academic Deep Research
  const research = await studyService.deepResearch({ topic: 'CRISPR Cas9' });
  assert.equal(research.ok, true);
  assert.ok(research.formattedText.length > 50);
});

// =========================================================================
// 3. ROCK3T WEB OS REST API ENDPOINTS
// =========================================================================
test('🌐 3. ROCK3T Web OS Study APIs — REST Endpoints', async () => {
  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const testUserId = 'test_study_user_42';

    // A. Explain Endpoint
    const explainRes = await fetch(`${baseUrl}/api/rock3t/study/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ topic: 'Transformer Neural Networks' }),
    });
    const explainData = await explainRes.json();
    assert.equal(explainData.ok, true);
    assert.ok(explainData.formattedText.length > 50);

    // B. Quiz Endpoint
    const quizRes = await fetch(`${baseUrl}/api/rock3t/study/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ topic: 'Calculus', count: 3 }),
    });
    const quizData = await quizRes.json();
    assert.equal(quizData.ok, true);
    assert.ok(quizData.questions.length >= 3);

    // C. Flashcards Endpoint
    const flashRes = await fetch(`${baseUrl}/api/rock3t/study/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ topic: 'Sorting Algorithms', count: 3 }),
    });
    const flashData = await flashRes.json();
    assert.equal(flashData.ok, true);
    assert.ok(flashData.flashcards.length >= 3);

    // D. Research Endpoint
    const researchRes = await fetch(`${baseUrl}/api/rock3t/study/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ topic: 'Superconductivity' }),
    });
    const researchData = await researchRes.json();
    assert.equal(researchData.ok, true);
    assert.ok(researchData.formattedText.length > 50);
  } finally {
    server.close();
  }
});

// =========================================================================
// 4. ZERO BRAND LEAKAGE TEST (GPT-6 LUNA & SCALEMAX ERADICATION)
// =========================================================================
test('🔒 4. Zero Brand Leakage Guard — Purges GPT-6 Luna and ScaleMax', () => {
  const sample1 = 'This document is powered by GPT-6 Luna and accelerated via ScaleMax.';
  const scrubbed1 = scrubRestrictedBrandNames(sample1);
  assert.equal(scrubbed1.includes('GPT-6 Luna'), false);
  assert.equal(scrubbed1.includes('ScaleMax'), false);
  assert.ok(scrubbed1.includes('Rocket Neural Core') || scrubbed1.includes('Nero Labs'));

  const sample2 = 'You are chatting with GPT-6 Luna, an official ScaleMax model available for this key.';
  const res2 = validateAndSanitizeResponse(sample2, 'hello');
  assert.equal(res2.sanitizedText.includes('ScaleMax'), false);
  assert.equal(res2.sanitizedText.includes('GPT-6 Luna'), false);
  assert.ok(res2.sanitizedText.includes('Rocket AI'));
});

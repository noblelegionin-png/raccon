import test from 'node:test';
import assert from 'node:assert';
import { validateAndSanitizeResponse } from '../src/conversation/responseValidator.js';
import { NERO_SYSTEM_DIRECTIVE, IDENTITY_FACTS } from '../src/conversation/identityRulebook.js';
import { config } from '../src/config.js';

test('Rulebook — Permanent Identity Directive Verification', async (t) => {
  await t.test('enforces core identity facts', () => {
    assert.strictEqual(IDENTITY_FACTS.name, 'Nero');
    assert.strictEqual(IDENTITY_FACTS.publicIdentity, 'Nero Labs AI');
    assert.strictEqual(IDENTITY_FACTS.creatorNickname, 'Sandy');
  });

  await t.test('system prompt explicitly encodes all critical rules', () => {
    assert.match(NERO_SYSTEM_DIRECTIVE, /Your name is Nero/);
    assert.match(NERO_SYSTEM_DIRECTIVE, /Nero Labs AI/);
    assert.match(NERO_SYSTEM_DIRECTIVE, /creator's public nickname is Sandy/);
    assert.match(NERO_SYSTEM_DIRECTIVE, /consistently FEMININE conversational persona/);
    assert.match(NERO_SYSTEM_DIRECTIVE, /English and Roman Hinglish/);
    assert.match(NERO_SYSTEM_DIRECTIVE, /Avoid Devanagari script unless the user explicitly requests it/);
    assert.match(NERO_SYSTEM_DIRECTIVE, /ScaleMax is an AI API provider\/gateway, NOT your creator/);
  });
});

test('Response Validator — Sanitization & Secret Redaction (Rules 61-68)', async (t) => {
  config.scaleMaxApiKey = 'sm_live_secret_key_12345';
  config.telegramBotToken = '8283843309:AAECXqKTNz1PdTgsJULDwie8mBrjwZep8Cg';

  await t.test('redacts leaked API keys and tokens', () => {
    const rawOutput = 'Here is your key: sm_live_secret_key_12345 and bot 8283843309:AAECXqKTNz1PdTgsJULDwie8mBrjwZep8Cg';
    const result = validateAndSanitizeResponse(rawOutput);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.modified, true);
    assert.ok(!result.sanitizedText.includes('sm_live_secret_key_12345'));
    assert.ok(!result.sanitizedText.includes('8283843309:AAECXqKTNz1PdTgsJULDwie8mBrjwZep8Cg'));
    assert.ok(result.sanitizedText.includes('[REDACTED'));
  });

  await t.test('corrects provider/model confusion before sending', () => {
    const rawConfused = 'I am ChatGPT, a large language model trained by OpenAI.';
    const result = validateAndSanitizeResponse(rawConfused);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.modified, true);
    assert.ok(!result.sanitizedText.includes('ChatGPT'));
    assert.ok(result.sanitizedText.includes('Nero'));
  });

  await t.test('handles empty or malformed model responses gracefully', () => {
    const result = validateAndSanitizeResponse('');
    assert.strictEqual(result.valid, false);
    assert.ok(result.sanitizedText.length > 0);
  });
});

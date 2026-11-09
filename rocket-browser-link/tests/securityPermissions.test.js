import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateActionRisk, sanitizeExtractedContent, SENSITIVE_SELECTORS } from '../browser-extension/permissions.js';

test('1. Sensitive Input Selector Identification', () => {
  assert.ok(SENSITIVE_SELECTORS.includes('input[type="password"]'));
  assert.ok(SENSITIVE_SELECTORS.some((s) => s.includes('cvv')));
  assert.ok(SENSITIVE_SELECTORS.some((s) => s.includes('cc-number')));
});

test('2. Action Risk Evaluator', () => {
  // Low-risk operations
  assert.equal(evaluateActionRisk('tab_open', { url: 'https://youtube.com' }).isHighRisk, false);
  assert.equal(evaluateActionRisk('zoom_out', {}).isHighRisk, false);
  assert.equal(evaluateActionRisk('page_scroll', {}).isHighRisk, false);

  // High-risk operations requiring explicit confirmation
  assert.equal(evaluateActionRisk('logout_request', {}).isHighRisk, true);
  assert.equal(evaluateActionRisk('consequential_action', { description: 'Delete profile' }).isHighRisk, true);
  assert.equal(evaluateActionRisk('page_click', { text: 'Confirm Purchase and Pay Now' }).isHighRisk, true);
  assert.equal(evaluateActionRisk('page_click', { text: 'Log out of Account' }).isHighRisk, true);
});

test('3. Data Redaction & Sanitization Guard', () => {
  const sensitiveText = 'Order receipt: Card 4111 2222 3333 4444 approved. Secret token: ghp_1234567890abcdef1234567890';
  const clean = sanitizeExtractedContent(sensitiveText);

  assert.ok(!clean.includes('4111 2222 3333 4444'), 'Credit card numbers must be redacted');
  assert.ok(clean.includes('[REDACTED CARD]'), 'Redaction placeholder must be present');
  assert.ok(!clean.includes('ghp_1234567890abcdef1234567890'), 'Secret tokens must be redacted');
  assert.ok(clean.includes('[REDACTED TOKEN]'), 'Token redaction placeholder must be present');
});

import test from 'node:test';
import assert from 'node:assert';
import { estimateTokens } from '../src/models/costEstimator.js';

test('Cost & Token Estimator', async (t) => {
  await t.test('calculates standard 10-word test prompt tokens', () => {
    const est = estimateTokens({ wordCount: 10, reasoningEffort: 'none' });
    assert.strictEqual(est.wordCount, 10);
    assert.strictEqual(est.isEstimate, true);
    assert.strictEqual(est.breakdown.systemPromptTokens, 450);
    assert.strictEqual(est.breakdown.userPromptTokens, 13);
    assert.strictEqual(est.breakdown.reasoningTokens, 0);
    assert.strictEqual(est.breakdown.totalTokens, 450 + 13 + 120);
    assert.strictEqual(est.pricing.rate, 'Unknown — verify provider pricing');
  });

  await t.test('scales reasoning tokens based on effort level', () => {
    const low = estimateTokens({ wordCount: 10, reasoningEffort: 'low' });
    assert.strictEqual(low.breakdown.reasoningTokens, 150);

    const med = estimateTokens({ wordCount: 10, reasoningEffort: 'medium' });
    assert.strictEqual(med.breakdown.reasoningTokens, 350);

    const high = estimateTokens({ wordCount: 10, reasoningEffort: 'high' });
    assert.strictEqual(high.breakdown.reasoningTokens, 750);
  });

  await t.test('truthfully labels provider pricing as unknown', () => {
    const est = estimateTokens({ wordCount: 50 });
    assert.strictEqual(est.pricing.estimatedCostUsd, 'Unknown — verify provider pricing');
    assert.match(est.pricing.note, /token-pack/i);
  });
});

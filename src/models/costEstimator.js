/**
 * Cost & Token Estimator for Nero Labs AI
 * Provides standardized token and cost estimates based on prompt word count and reasoning effort.
 * Adheres strictly to the rule: Label estimates vs measured, and use 'Unknown — verify provider pricing'
 * when provider token rates are not published via API.
 */

export function estimateTokens({
  wordCount = 10,
  reasoningEffort = 'none',
  includeSystemPrompt = true,
  expectedResponseLength = 'normal', // 'short', 'normal', 'detailed'
}) {
  // 1. System Prompt Token Estimate (Nero Labs 100-rule system prompt is ~450 tokens)
  const systemPromptTokens = includeSystemPrompt ? 450 : 0;

  // 2. User Prompt Token Estimate (~1.33 tokens per English / Hinglish word)
  const userPromptTokens = Math.max(1, Math.round(wordCount * 1.33));
  const totalInputTokens = systemPromptTokens + userPromptTokens;

  // 3. Output Completion Token Estimate
  let outputTokens = 120;
  if (expectedResponseLength === 'short') outputTokens = 50;
  if (expectedResponseLength === 'detailed') outputTokens = 350;

  // 4. Reasoning Token Estimate (based on reasoning_effort mode)
  let reasoningTokens = 0;
  const effort = (reasoningEffort || 'none').toLowerCase();
  switch (effort) {
    case 'low':
      reasoningTokens = 150;
      break;
    case 'medium':
      reasoningTokens = 350;
      break;
    case 'high':
      reasoningTokens = 750;
      break;
    case 'xhigh':
    case 'max':
      reasoningTokens = 1500;
      break;
    case 'none':
    default:
      reasoningTokens = 0;
      break;
  }

  const totalTokens = totalInputTokens + outputTokens + reasoningTokens;

  return {
    wordCount,
    reasoningEffort: effort,
    isEstimate: true,
    breakdown: {
      systemPromptTokens,
      userPromptTokens,
      totalInputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens,
    },
    // Strict adherence: ScaleMax Token-pack does not return public per-token USD rates via API
    pricing: {
      rate: 'Unknown — verify provider pricing',
      billingUnit: 'ScaleMax Token-Pack Units',
      estimatedCostUsd: 'Unknown — verify provider pricing',
      note: 'Deducted from prepaid ScaleMax token-pack balance. Check dashboard for pack balance.',
    },
  };
}

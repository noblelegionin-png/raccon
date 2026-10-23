import { getConfig, setConfig } from '../db/index.js';
import { config } from '../config.js';

export const SUPPORTED_REASONING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

export const DEFAULT_ROUTING = {
  chat: {
    model: 'gemini-3.1-flash-lite-preview',
    reasoning: 'low',
    targetTokens: 2000,
    maxInputTokens: 16000,
    maxOutputTokens: 8000,
  },
  management: {
    model: 'gemini-3.5-flash-lite',
    reasoning: 'high',
    targetTokens: 4000,
    maxInputTokens: 16000,
    maxOutputTokens: 8000,
  },
  coding: {
    model: 'gemini-3.5-flash-lite',
    reasoning: 'high',
    targetTokens: 4000,
    maxInputTokens: 16000,
    maxOutputTokens: 8000,
  },
  security: {
    model: 'gemini-3.5-flash-lite',
    reasoning: 'high',
    targetTokens: 4000,
    maxInputTokens: 16000,
    maxOutputTokens: 8000,
  },
  media: {
    model: 'gemini-3.8-flash',
    reasoning: 'high',
    targetTokens: 4000,
    maxInputTokens: 16000,
    maxOutputTokens: 8000,
  },
  research: {
    model: 'gemini-3.8-flash',
    reasoning: 'high',
    targetTokens: 4000,
    maxInputTokens: 32000,
    maxOutputTokens: 8000,
  },
  browsing: {
    model: 'gemini-3.8-flash',
    reasoning: 'high',
    targetTokens: 4000,
    maxInputTokens: 32000,
    maxOutputTokens: 8000,
  },
};

/**
 * Estimate token count for a text string or structured messages array
 */
export function estimateTokenCount(input) {
  if (!input) return 0;
  if (typeof input === 'string') {
    // Standard rule of thumb: ~3.8 chars per token for Latin/code
    return Math.max(1, Math.ceil(input.length / 3.8));
  }
  if (Array.isArray(input)) {
    let count = 0;
    for (const msg of input) {
      count += 4; // per-message formatting overhead
      if (typeof msg.content === 'string') {
        count += estimateTokenCount(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            count += estimateTokenCount(part.text);
          } else if (part.type === 'image_url') {
            count += 85; // fixed low-res token cost
          }
        }
      }
    }
    return count + 2; // priming tokens
  }
  return 0;
}

/**
 * Get current routing configuration for an agent category
 * @param {'chat' | 'security' | 'media'} category
 */
export function getAgentRouting(category = 'chat') {
  const fallback = DEFAULT_ROUTING[category] || DEFAULT_ROUTING.chat;
  const model = getConfig(`agent_model_${category}`, fallback.model);
  const reasoning = getConfig(`agent_reasoning_${category}`, fallback.reasoning);
  const maxInputTokens = parseInt(getConfig(`agent_max_input_${category}`, String(fallback.maxInputTokens)), 10);
  const maxOutputTokens = parseInt(getConfig(`agent_max_output_${category}`, String(fallback.maxOutputTokens)), 10);
  const targetTokens = parseInt(getConfig(`agent_target_tokens_${category}`, String(fallback.targetTokens)), 10);

  return {
    category,
    model,
    reasoning: SUPPORTED_REASONING_LEVELS.includes(reasoning.toLowerCase()) ? reasoning.toLowerCase() : fallback.reasoning,
    targetTokens,
    maxInputTokens,
    maxOutputTokens,
  };
}

/**
 * Update routing configuration for an agent category
 */
export function updateAgentRouting(category, { model, reasoning, maxInputTokens, maxOutputTokens, targetTokens } = {}) {
  if (!DEFAULT_ROUTING[category]) {
    throw new Error(`Unknown agent category: ${category}`);
  }
  if (model) {
    setConfig(`agent_model_${category}`, String(model).trim());
  }
  if (reasoning) {
    const r = String(reasoning).toLowerCase().trim();
    if (!SUPPORTED_REASONING_LEVELS.includes(r)) {
      throw new Error(`Unsupported reasoning level: ${reasoning}. Supported: ${SUPPORTED_REASONING_LEVELS.join(', ')}`);
    }
    setConfig(`agent_reasoning_${category}`, r);
  }
  if (maxInputTokens !== undefined) {
    setConfig(`agent_max_input_${category}`, String(Math.max(100, Math.min(4000, Number(maxInputTokens)))));
  }
  if (maxOutputTokens !== undefined) {
    setConfig(`agent_max_output_${category}`, String(Math.max(100, Math.min(4000, Number(maxOutputTokens)))));
  }
  if (targetTokens !== undefined) {
    setConfig(`agent_target_tokens_${category}`, String(Math.max(100, Math.min(2000, Number(targetTokens)))));
  }
  return getAgentRouting(category);
}

/**
 * Enforces the hard input token budget (1,500 tokens default) by safely compressing context
 * or raising a descriptive budget error if compression cannot meet the ceiling.
 */
export function compressToTokenBudget(messages, maxAllowedTokens = 1500) {
  if (!Array.isArray(messages)) return messages;
  let currentTokens = estimateTokenCount(messages);
  if (currentTokens <= maxAllowedTokens) {
    return { messages, tokens: currentTokens, compressed: false };
  }

  // Clone messages
  const working = messages.map((m) => ({ ...m }));

  // Step 1: Truncate conversation history turns older than the latest 2 turns
  if (working.length > 3) {
    for (let i = 1; i < working.length - 2; i++) {
      if (typeof working[i].content === 'string' && working[i].content.length > 140) {
        working[i].content = working[i].content.slice(0, 140) + '... [compressed]';
      }
    }
    currentTokens = estimateTokenCount(working);
    if (currentTokens <= maxAllowedTokens) {
      return { messages: working, tokens: currentTokens, compressed: true };
    }
  }

  // Step 2: Remove oldest conversation history items (preserving system prompt at index 0 and latest prompt at last index)
  while (working.length > 2 && currentTokens > maxAllowedTokens) {
    working.splice(1, 1);
    currentTokens = estimateTokenCount(working);
  }

  if (currentTokens <= maxAllowedTokens) {
    return { messages: working, tokens: currentTokens, compressed: true };
  }

  // Step 3: Compress system prompt background notes if still exceeding
  if (working[0] && typeof working[0].content === 'string' && currentTokens > maxAllowedTokens) {
    const sys = working[0].content;
    const coreRuleEnd = sys.indexOf('[ACTIVE LIVE GROUP CHAT STREAM]');
    if (coreRuleEnd > 200) {
      working[0].content = sys.slice(0, coreRuleEnd) + '\n\n[Context pruned to fit 1,500 token ceiling.]';
      currentTokens = estimateTokenCount(working);
    }
  }

  if (currentTokens <= maxAllowedTokens) {
    return { messages: working, tokens: currentTokens, compressed: true };
  }

  // Hard ceiling reached: task cannot fit safely
  throw new Error(
    `Token budget ceiling exceeded (${currentTokens} est. tokens > hard ceiling of ${maxAllowedTokens} tokens). Request cannot be completed safely without exceeding configured ceiling.`
  );
}

/**
 * Truncate response text safely if it exceeds max output tokens
 */
export function truncateOutputSafely(text, maxOutputTokens = 1500) {
  if (!text) return '';
  const tokens = estimateTokenCount(text);
  if (tokens <= maxOutputTokens) {
    return text;
  }
  const suffix = '\n\n... [Output safely truncated to respect token budget ceiling.]';
  const suffixTokens = estimateTokenCount(suffix);
  const targetChars = Math.max(20, Math.floor((maxOutputTokens - suffixTokens - 5) * 3.8));
  return text.slice(0, targetChars) + suffix;
}

/**
 * 🧠 NERO LABS — INTENT DETECTION & CONSTRAINT EXTRACTION ENGINE
 * 
 * Detects user intent (explanation, code, summary, prompt, action)
 * and extracts explicit word limit constraints (e.g. "in 300 words", "under 50 words")
 * to ensure strict instruction-following and precision responses.
 */

export const SUPPORTED_INTENTS = ['explanation', 'code', 'summary', 'prompt', 'action', 'general'];

/**
 * Detect user intent from prompt text
 * @param {string} text - Cleaned user prompt
 * @returns {'explanation' | 'code' | 'summary' | 'prompt' | 'action' | 'general'}
 */
export function detectUserIntent(text) {
  if (!text || typeof text !== 'string') return 'general';
  const clean = text.trim().toLowerCase();

  // 1. Code intent
  if (/\b(?:write|create|implement|fix|refactor|show|give\s+me)?\s*(?:code|script|function|class|program|algorithm|sql|python|javascript|typescript|c\+\+|html|css|regex|query|endpoint|api)\b/i.test(clean) ||
      /\b(?:how\s+to\s+code|how\s+to\s+implement|write\s+a\s+program|debug\s+this)\b/i.test(clean)) {
    return 'code';
  }

  // 2. Summary intent
  if (/\b(?:summarize|summary|tldr|tl;dr|brief\s+overview|recap|condense|in\s+a\s+nutshell)\b/i.test(clean)) {
    return 'summary';
  }

  // 3. Prompt engineering intent
  if (/\b(?:give\s+me\s+a\s+prompt|craft\s+a\s+prompt|system\s+prompt|prompt\s+for|image\s+prompt|midjourney\s+prompt)\b/i.test(clean)) {
    return 'prompt';
  }

  // 4. Executable action intent
  if (/\b(?:enable|disable|turn\s+on|turn\s+off|broadcast|mute|ban|unmute|teleport|switch\s+model|edit\s+mode|maintenance)\b/i.test(clean)) {
    return 'action';
  }

  // 5. Explanation intent
  if (/\b(?:explain|what\s+is|what\s+are|how\s+does|how\s+do|why\s+does|why\s+is|describe|teach\s+me|elaborate|walk\s+me\s+through)\b/i.test(clean)) {
    return 'explanation';
  }

  return 'general';
}

/**
 * Extract explicit word count limits from prompt
 * Matches phrases like:
 * - "in 300 words"
 * - "under 50 words"
 * - "max 150 words"
 * - "within 200 words"
 * - "around 400 words"
 * - "at most 100 words"
 * - "word limit: 250"
 * - "limit of 500 words"
 * - "300 words"
 * 
 * @param {string} text - User prompt
 * @returns {number|null} Explicit word limit or null if not specified
 */
export function extractExplicitWordLimit(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  // Patterns for explicit word count constraints
  const patterns = [
    /\b(?:in|under|max|maximum|at\s+most|around|within|up\s+to|strictly)\s+(\d{1,4})\s*words?\b/i,
    /\b(?:word\s+limit|length\s+limit|limit\s+of)\s*[:=]?\s*(\d{1,4})\b/i,
    /\b(\d{1,4})\s*words?\s*(?:max|maximum|or\s+less|limit)\b/i,
    /\b(?:in|about|exactly)\s+(\d{1,4})\s*words?\b/i,
    /\((\d{1,4})\s*words?\)/i,
    /\b(\d{1,4})\s*words?\b/i,
  ];

  for (const regex of patterns) {
    const match = clean.match(regex);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (parsed >= 5 && parsed <= 5000) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Format dynamic system prompt directive for intent & explicit constraints
 * @param {string} intent - Detected intent
 * @param {number|null} explicitWordLimit - Explicit requested word count
 * @returns {string} Directive text for system prompt
 */
export function formatIntentDirective(intent, explicitWordLimit = null) {
  const parts = [];

  if (intent === 'code') {
    parts.push(`[INTENT: CODE GENERATION / DEBUGGING]
• Provide clean, working, idiomatic code with minimal fluff.
• Include a concise 1-2 sentence explanation of how the code works.
• Use appropriate syntax highlighting markdown tags.`);
  } else if (intent === 'summary') {
    parts.push(`[INTENT: SUMMARY / TL;DR]
• Structure the response with clear key takeaways or concise bullet points.
• Omit filler and conversational pleasantries to maximize density.`);
  } else if (intent === 'prompt') {
    parts.push(`[INTENT: PROMPT DESIGN]
• Deliver a well-structured, production-ready system or generative prompt.
• Include specific constraints, format rules, and role definitions.`);
  } else if (intent === 'explanation') {
    parts.push(`[INTENT: EXPLANATION]
• Explain clearly, starting with the core intuition followed by necessary depth.
• Maintain an engaging, friendly, yet technically precise tone.`);
  }

  if (explicitWordLimit) {
    parts.push(`[CRITICAL CONSTRAINT: EXPLICIT WORD LIMIT]
• The user explicitly requested approximately ${explicitWordLimit} words.
• You MUST respect this length constraint: craft your response to be around ${explicitWordLimit} words (neither truncating abruptly nor ignoring the limit).`);
  }

  return parts.join('\n\n');
}

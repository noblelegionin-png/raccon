/**
 * 🧠 NERO LABS — INTENT DETECTION & CONSTRAINT EXTRACTION ENGINE
 * 
 * Detects user intent (explanation, code, summary, prompt, action)
 * and extracts explicit word limit constraints (e.g. "in 300 words", "under 50 words")
 * to ensure strict instruction-following and precision responses.
 */

export const SUPPORTED_INTENTS = ['greeting', 'explanation', 'code', 'summary', 'prompt', 'action', 'general'];

/**
 * Detect user intent from prompt text
 * @param {string} text - Cleaned user prompt
 * @returns {'greeting' | 'explanation' | 'code' | 'summary' | 'prompt' | 'action' | 'general'}
 */
export function detectUserIntent(text) {
  if (!text || typeof text !== 'string') return 'general';
  const clean = text.trim().toLowerCase();

  // 0. Greeting intent ("Hy to Hy" rule)
  if (/\b(?:hi|hy|hello|hey|yo|sup|hlo|hii|heyy|heya|hola|kaisa\s+hai|kaise\s+ho|kya\s+haal|namaste|good\s+morning|good\s+evening|good\s+afternoon|wassup|whats\s+up)\b/i.test(clean) &&
      clean.split(/\s+/).length <= 6 &&
      !/\b(?:what|why|how|explain|describe|write|show|tell\s+me\s+about)\b/i.test(clean)) {
    return 'greeting';
  }

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
    /\b(?:write|give|provide)?\s*(?:a|an)?\s*(\d{1,4})\s*word\s*(?:explanation|summary|essay|reply|answer|note|post|article)\b/i,
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

  if (intent === 'greeting') {
    parts.push(`[INTENT: CASUAL GREETING ("HY TO HY" RULE)]
• The user sent a casual greeting or brief hello.
• MATCH THEIR LENGTH & VIBE: Reply with a warm, stylish, concise 1 to 2 sentence greeting.
• STRICTLY FORBIDDEN: Do not write paragraphs or lecture on a simple greeting.`);
  } else if (intent === 'code') {
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
    parts.push(`[INTENT: RESEARCH & EXPLANATION (10 TO 500 WORDS)]
• Provide an engaging, deep, and intuitive explanation strictly under 10 to 500 words.
• Focus on substance, clarity, and insight without unnecessary filler.`);
  } else {
    parts.push(`[INTENT: RESEARCH & CONVERSATIONAL CHAT (10 TO 500 WORDS)]
• Answer with high intelligence and clarity strictly between 10 to 500 words.`);
  }

  if (explicitWordLimit) {
    parts.push(`[CRITICAL CONSTRAINT: EXPLICIT WORD LIMIT]
• The user explicitly requested approximately ${explicitWordLimit} words (e.g. "${explicitWordLimit} word explanation").
• You MUST respect this length constraint: craft your response to be around ${explicitWordLimit} words (neither truncating abruptly nor ignoring the limit).`);
  }

  return parts.join('\n\n');
}

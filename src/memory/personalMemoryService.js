/**
 * 👤 NERO LABS — PERSONAL PROFILE & MEMORY SERVICE
 * 
 * Provides isolated personal namespaces for each user:
 * - Real name, nickname, display-name fallback
 * - Personal context editor limited strictly to 1,000 words (server-side enforced)
 * - Intelligent user correction evaluator with versioning & source tracking
 * - Safe memory retrieval and directive injection into model context
 */

import {
  getUserProfile,
  setUserProfile,
  getUserMemories,
  addUserMemory,
  updateUserMemory,
  deleteUserMemory,
  getActiveUserIdentity,
  logAudit,
} from '../db/index.js';

export const MAX_PERSONAL_CONTEXT_WORDS = 1000;

/**
 * Count words in a string
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Validate personal context string against the 1,000-word limit
 * @param {string} text
 * @returns {{ valid: boolean, wordCount: number, error?: string }}
 */
export function validatePersonalContext(text) {
  if (!text) return { valid: true, wordCount: 0 };
  const words = countWords(text);
  if (words > MAX_PERSONAL_CONTEXT_WORDS) {
    return {
      valid: false,
      wordCount: words,
      error: `Personal context exceeds the maximum limit of ${MAX_PERSONAL_CONTEXT_WORDS} words (currently ${words} words).`,
    };
  }
  return { valid: true, wordCount: words };
}

/**
 * Update user profile with server-side validation
 * @param {string|number} userId
 * @param {Object} data - { realName, nickname, personalContext, relationshipRole, reasoningPreference, communicationStyle }
 */
export function saveUserProfile(userId, data = {}) {
  const uId = String(userId);

  // Validate personal context length
  if (data.personalContext) {
    const val = validatePersonalContext(data.personalContext);
    if (!val.valid) {
      throw new Error(val.error);
    }
  }

  // Sanitize fields
  const payload = {
    realName: data.realName ? data.realName.trim().slice(0, 100) : null,
    nickname: data.nickname ? data.nickname.trim().slice(0, 50) : null,
    personalContext: data.personalContext ? data.personalContext.trim() : null,
    relationshipRole: data.relationshipRole ? data.relationshipRole.toLowerCase().trim() : undefined,
    reasoningPreference: data.reasoningPreference ? data.reasoningPreference.toLowerCase().trim() : undefined,
    communicationStyle: data.communicationStyle ? data.communicationStyle.toLowerCase().trim() : undefined,
  };

  const updated = setUserProfile(uId, payload);
  logAudit(uId, 'USER_PROFILE_UPDATED', `Updated personal profile & context (${countWords(payload.personalContext)} words)`);
  return updated;
}

/**
 * Intelligent correction evaluator:
 * Identifies if user is correcting the bot and extracts structured memory update
 * @param {string|number} userId
 * @param {string} text
 * @returns {Object|null} Correction result or null if not a correction
 */
export function evaluateUserCorrection(userId, text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  // Correction trigger patterns:
  // "actually, my name is Alex, not Bob"
  // "correction: I am a software engineer"
  // "no, I don't live in NY, I live in London"
  // "remember that I prefer Python over Java"
  // "I am actually 25 years old"
  const correctionMatch = clean.match(/^(?:actually|correction:?|no,?\s*(?:actually)?|wait,?\s*(?:actually)?|remember\s+that)\s+(.+)/i);
  if (!correctionMatch) return null;

  const claim = correctionMatch[1].trim();

  // Security guard: prevent privilege escalation or claiming owner rights
  if (/\b(?:i am|i'm)\s+(?:the\s+)?(?:owner|creator|admin|developer|god|sandy)\b/i.test(claim)) {
    return {
      detected: true,
      applied: false,
      reason: 'Role escalation or creator impersonation is forbidden by security supervisor.',
    };
  }

  // Key extraction heuristic
  let key = 'personal_fact';
  let category = 'correction';

  if (/\b(?:my\s+name\s+is|call\s+me)\b/i.test(claim)) {
    key = 'calling_name';
    category = 'identity';
  } else if (/\b(?:i\s+work\s+as|my\s+job\s+is|i\s+am\s+an?\s+[a-zA-Z\s]+engineer)\b/i.test(claim)) {
    key = 'profession';
    category = 'preference';
  } else if (/\b(?:i\s+live\s+in|my\s+location\s+is|from)\b/i.test(claim)) {
    key = 'location';
    category = 'preference';
  } else if (/\b(?:i\s+prefer|i\s+like|i\s+dislike|i\s+hate)\b/i.test(claim)) {
    key = 'preference';
    category = 'preference';
  }

  const result = addUserMemory(userId, {
    category,
    key,
    value: claim,
    source: 'correction',
  });

  logAudit(userId, 'USER_CORRECTION_APPLIED', `Learned memory: [${key}] = "${claim}"`);

  return {
    detected: true,
    applied: true,
    memoryId: result.id,
    version: result.version,
    key,
    value: claim,
  };
}

/**
 * Format personal memory directive block for inclusion in system prompt
 * @param {string|number} userId
 * @param {string|number} chatId
 * @returns {string} System prompt block with isolated user context
 */
export function formatPersonalMemoryDirective(userId, chatId = null) {
  if (!userId) return '';
  const profile = getUserProfile(userId);
  const memories = getUserMemories(userId);

  const lines = ['[USER PERSONAL PROFILE & PERSISTENT MEMORY]'];

  // 1. Calling name & identity
  const nameParts = [];
  if (profile?.real_name) nameParts.push(`Real Name: "${profile.real_name}"`);
  if (profile?.nickname) nameParts.push(`Nickname: "${profile.nickname}"`);
  if (profile?.custom_name) nameParts.push(`Preferred Calling Name: "${profile.custom_name}"`);
  if (nameParts.length > 0) {
    lines.push(`• Identity: ${nameParts.join(' | ')}`);
  }

  // 2. Reasoning preference
  if (profile?.reasoning_preference && profile.reasoning_preference !== 'balanced') {
    lines.push(`• Preferred Reasoning & Response Style: ${profile.reasoning_preference.toUpperCase()}`);
  }

  // 3. User Personal Context (up to 1,000 words)
  if (profile?.personal_context && profile.personal_context.trim()) {
    lines.push(`• User's Personal Background & Context (Authored by user):\n"""\n${profile.personal_context.trim().slice(0, 5000)}\n"""`);
  }

  // 4. Stored user personal memories & corrections
  if (memories && memories.length > 0) {
    lines.push('• Verified Personal Facts & Learned Corrections:');
    for (const m of memories.slice(0, 10)) {
      lines.push(`  - [${m.key} (v${m.version || 1})]: "${m.value}"`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

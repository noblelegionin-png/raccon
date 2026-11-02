import { config } from '../config.js';
import {
  addConversationMessage,
  getRecentConversation,
  clearConversation as dbClearConversation,
  getLatestChatMessages,
  searchDurableMemory,
  getRecentDurableMemory,
  getArchiveBatches,
  getGroupParticipants,
  getActiveUserIdentity,
} from '../db/index.js';
import { ROCKET_SYSTEM_DIRECTIVE, OWNER_ROOT_DIRECTIVE } from './identityRulebook.js';
import { formatRoleplayDirective } from './roleplayManager.js';
import {
  detectUserIntent,
  extractExplicitWordLimit,
  formatIntentDirective,
} from './intentDetector.js';
import { formatPersonalMemoryDirective } from '../memory/personalMemoryService.js';

/**
 * Message-Processing Pipeline (Rule 61)
 * Normalizes incoming user prompts to prevent provider-gateway pattern intercepts
 * while preserving the user's authentic intent.
 */
export function preprocessUserPrompt(rawPrompt) {
  let text = (rawPrompt || '').trim();

  // Normalize ScaleMax trigger patterns that cause gateway filter hijacking
  text = text.replace(/\bwho\s+(?:made|built|created)\s+(?:u|you)\b/gi, 'who is your creator and developer');
  text = text.replace(/\bwho\s+are\s+u\b/gi, 'who are you');
  text = text.replace(/\bkisse\s+(?:banaya|bana)\s+hai\b/gi, 'aapke creator kaun hain');

  return text;
}

/**
 * Build dynamic group context, persistent memory payload, and roleplay identity
 */
export function buildGroupMemoryContext(chatId, latestUserPrompt, options = {}) {
  const parts = [];
  const { senderId, senderName, replyContext, userIsOwner } = options;

  // 1. User Identity & Roleplay Relationship
  if (senderId) {
    try {
      const identity = getActiveUserIdentity(chatId, senderId);
      const isOwner = Boolean(userIsOwner || (config.telegramOwnerId && String(senderId) === String(config.telegramOwnerId)));
      const directive = formatRoleplayDirective(
        senderId,
        identity.customName,
        identity.relationshipRole,
        senderName || identity.displayName,
        isOwner
      );
      parts.push(directive);
    } catch (err) {
      // Graceful fallback
    }
  }

  // 2. Specific Reply Target Context
  if (replyContext && replyContext.text) {
    parts.push(`[REPLIED-TO MESSAGE CONTEXT]\nThe user is explicitly replying to this message by ${replyContext.sender || 'a group member'}:\n"${replyContext.text.slice(0, 250)}"`);
  }

  // 3. Live Group Chat Stream (latest 5 messages from raw_messages)
  try {
    const rawMsgs = getLatestChatMessages(chatId, 5);
    if (rawMsgs && rawMsgs.length > 0) {
      const chatLines = rawMsgs.map((m) => {
        const sender = m.sender_name || (m.sender_username ? `@${m.sender_username}` : 'Member');
        const content = m.raw_content || m.caption || `[${m.message_type || 'message'}]`;
        const replyTag = m.reply_to_message_id ? ` (replying to #${m.reply_to_message_id})` : '';
        return `• [msg#${m.platform_message_id}] ${sender}${replyTag}: "${content.replace(/\n+/g, ' ').slice(0, 200)}"`;
      });
      parts.push(`[ACTIVE LIVE GROUP CHAT STREAM]\n(Real-time stream of what members recently discussed in this group. Use this exact transcript to know what is happening right now, quote accurately, and respond in-context):\n${chatLines.join('\n')}`);
    }
  } catch (err) {
    // Graceful fallback
  }

  // 4. Persistent Group Memory (Durable Facts & Summaries)
  try {
    const memoryFacts = [];
    const seenFacts = new Set();

    // A. Keywords matching user prompt
    const keywords = (latestUserPrompt || '')
      .replace(/[^\w\s]/gi, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(the|and|for|that|this|with|what|when|where|which|from|nero|tell|about)$/i.test(w))
      .slice(0, 3);

    for (const kw of keywords) {
      const matches = searchDurableMemory(chatId, kw, 3);
      for (const m of matches) {
        const key = `${m.category}:${m.topic}:${m.content}`;
        if (!seenFacts.has(key)) {
          seenFacts.add(key);
          memoryFacts.push(`• [${m.category.toUpperCase()}] ${m.topic}: ${m.content}`);
        }
      }
    }

    // B. Recent durable memories
    const recentMems = getRecentDurableMemory(chatId, 5);
    for (const m of recentMems) {
      const key = `${m.category}:${m.topic}:${m.content}`;
      if (!seenFacts.has(key)) {
        seenFacts.add(key);
        memoryFacts.push(`• [${m.category.toUpperCase()}] ${m.topic}: ${m.content}`);
      }
    }

    // C. Recent Archive Batch Summaries
    const batches = getArchiveBatches(chatId, 2);
    for (const b of batches) {
      if (b.summary_content) {
        const cleanSummary = b.summary_content.slice(0, 250).replace(/\n+/g, ' ');
        memoryFacts.push(`• [PAST DISCUSSION SUMMARY]: ${cleanSummary}`);
      }
    }

    if (memoryFacts.length > 0) {
      parts.push(`[PERSISTENT GROUP MEMORY & RETRIEVED FACTS]\n(Verified memories, decisions, user preferences, and archive summaries stored for this group. Naturally reference these whenever relevant):\n${memoryFacts.join('\n')}`);
    }
  } catch (err) {
    // Graceful fallback
  }

  // 5. Known Group Participants
  try {
    const participants = getGroupParticipants(chatId);
    if (participants && participants.length > 0) {
      const pList = participants
        .slice(0, 10)
        .map((p) => `${p.display_name} (${p.role || 'member'}${p.gender_label && p.gender_label !== 'unknown' ? ', ' + p.gender_label : ''})`)
        .join(', ');
      parts.push(`[KNOWN GROUP MEMBERS]: ${pList}`);
    }
  } catch (err) {
    // Graceful fallback
  }

  return parts.join('\n\n');
}

/**
 * Build context messages array for ScaleMax chat completions
 * Injects the permanent Version 1.0 Identity Rulebook (Rules 71-74)
 * and dynamic group context, live chat stream, persistent memory, and custom roleplay identity.
 */
export function buildChatContext(chatId, latestUserPrompt, options = {}) {
  const history = getRecentConversation(chatId, config.maxContextMessages);
  const processedPrompt = preprocessUserPrompt(latestUserPrompt);

  const groupMemoryContext = buildGroupMemoryContext(chatId, processedPrompt, options);

  let fullSystemDirective = ROCKET_SYSTEM_DIRECTIVE;
  if (options.userIsOwner || (config.telegramOwnerId && String(options.senderId) === String(config.telegramOwnerId))) {
    fullSystemDirective += `\n\n${OWNER_ROOT_DIRECTIVE}`;
  }
  if (groupMemoryContext) {
    fullSystemDirective += `\n\n${groupMemoryContext}`;
  }

  // 2b. Isolated Personal Memory & Context (up to 1,000 words)
  if (options.senderId) {
    const personalDirective = formatPersonalMemoryDirective(options.senderId, chatId);
    if (personalDirective) {
      fullSystemDirective += `\n\n${personalDirective}`;
    }
  }

  // 3. User Intent & Explicit Word Limit Constraints
  const explicitWordLimit = options.explicitWordLimit !== undefined
    ? options.explicitWordLimit
    : extractExplicitWordLimit(latestUserPrompt);
  const detectedIntent = options.intent || detectUserIntent(latestUserPrompt);
  const intentDirective = formatIntentDirective(detectedIntent, explicitWordLimit);
  if (intentDirective) {
    fullSystemDirective += `\n\n${intentDirective}`;
  }

  const messages = [{ role: 'system', content: fullSystemDirective }];

  for (const item of history) {
    if (item.role === 'user' || item.role === 'assistant') {
      const content =
        item.role === 'assistant' && item.content.length > 350
          ? item.content.slice(0, 350) + '...'
          : item.content;
      messages.push({
        role: item.role,
        content,
      });
    }
  }

  // Inject user prompt with reinforced identity guard
  messages.push({
    role: 'user',
    content: processedPrompt,
  });

  return messages;
}

/**
 * Record a user prompt in conversation memory
 */
export function recordUserMessage(chatId, content) {
  addConversationMessage(chatId, 'user', content, 0);
}

/**
 * Record assistant response in conversation memory
 */
export function recordAssistantMessage(chatId, content, tokensUsed, modelUsed) {
  addConversationMessage(chatId, 'assistant', content, tokensUsed, modelUsed);
}

/**
 * Clear conversation memory for a chat
 */
export function clearConversation(chatId) {
  dbClearConversation(chatId);
}

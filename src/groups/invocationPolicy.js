import { config } from '../config.js';
import { canBotRespondInGroup } from './groupService.js';
import { isOwner } from '../auth/accessControl.js';
import { getConfig } from '../db/index.js';

/**
 * Intelligent Group Invocation & Silence Policy
 * 
 * Nero acts like a quiet group member by default:
 * - Continuously listens and archives conversation context
 * - When /text on is active: reads and replies to all incoming texts
 * - When /text off is active: only responds when explicitly addressed or invoked
 * - In ambiguous cases, prefers silence
 */
export function evaluateInvocationPolicy(ctx) {
  if (!ctx.chat || !ctx.message) {
    return { shouldRespond: false, reason: 'no_message' };
  }

  const isPrivate = ctx.chat.type === 'private';
  const text = (ctx.message.text || ctx.message.caption || '').trim();
  const userId = ctx.from?.id;
  const userIsOwner = isOwner(userId);
  const botId = ctx.me?.id;
  const botUsername = ctx.me?.username || 'N3ROL4BSBOT';

  // 1. In private chat, always respond unless master switch or text mode is explicitly turned off
  if (isPrivate) {
    const textMode = getConfig(`text_mode_${ctx.chat.id}`, 'on');
    if (textMode === 'off' || textMode === 'false') {
      const mentionRegex = new RegExp(`@?${botUsername}\\b`, 'i');
      const isDirectReplyToBot = ctx.message.reply_to_message?.from?.id === botId;
      const nameInvocationRegex = /^(?:hey\s+|hi\s+|ok\s+)?(?:rocket|raccon|nero)[\s,:]+/i;
      if (mentionRegex.test(text) || isDirectReplyToBot || nameInvocationRegex.test(text)) {
        return {
          shouldRespond: true,
          reason: 'private_chat_explicit',
          isPrivate: true,
        };
      }
      return {
        shouldRespond: false,
        reason: 'private_text_mode_off',
        isPrivate: true,
      };
    }
    return {
      shouldRespond: true,
      reason: 'private_chat',
      isPrivate: true,
    };
  }

  // 2. Explicit Bot Mention: @N3ROL4BSBOT or @n3rol4bsbot - ALWAYS RESPOND
  const mentionRegex = new RegExp(`@?${botUsername}\\b`, 'i');
  if (mentionRegex.test(text)) {
    return {
      shouldRespond: true,
      reason: 'explicit_mention',
      cleanText: text.replace(mentionRegex, '').trim(),
      isPrivate: false,
    };
  }

  // 3. Direct Reply to Bot message - ALWAYS RESPOND
  const isDirectReplyToBot = ctx.message.reply_to_message?.from?.id === botId;
  if (isDirectReplyToBot) {
    return {
      shouldRespond: true,
      reason: 'direct_reply_to_bot',
      cleanText: text,
      isPrivate: false,
    };
  }

  // 4. Explicit Name Invocation: contains "Rocket" or "Nero" as a word anywhere in message - ALWAYS RESPOND
  const nameInvocationRegex = /\b(?:rocket|raccon|nero)\b/i;
  if (nameInvocationRegex.test(text)) {
    return {
      shouldRespond: true,
      reason: 'name_invocation',
      cleanText: text.replace(/\b(?:rocket|raccon|nero)\b/gi, '').trim() || text,
      isPrivate: false,
    };
  }

  // 5. Bot Owner (Sandy) Direct Command in Group - ALWAYS RESPOND
  if (userIsOwner) {
    return {
      shouldRespond: true,
      reason: 'owner_direct_group_invocation',
      cleanText: text,
      isPrivate: false,
    };
  }

  // 6. Explicit Direct Command for Nero (e.g. "save this image", "explain this screenshot")
  const directCommands = [
    /^save\s+(?:this\s+)?image/i,
    /^explain\s+this\s+screenshot/i,
    /^read\s+(?:the\s+)?text/i,
    /^find\s+(?:the\s+)?(?:picture|image)/i,
    /^send\s+that\s+saved\s+image/i,
    /^draw\s+/i,
    /^(?:generate|create|make)\s+an?\s+image/i,
  ];

  for (const cmd of directCommands) {
    if (cmd.test(text)) {
      if (ctx.message.photo || ctx.message.reply_to_message?.photo) {
        return {
          shouldRespond: true,
          reason: 'media_command',
          cleanText: text,
          isPrivate: false,
        };
      }
    }
  }

  // 7. General Group Participation Check (for unprovoked conversation / text mode)
  if (!canBotRespondInGroup(ctx.chat.id)) {
    return {
      shouldRespond: false,
      reason: 'group_bot_disabled',
      isPrivate: false,
    };
  }

  // 7.5 Text Reply Mode & Chat Manager Mode
  const textMode = getConfig(`text_mode_${ctx.chat.id}`, null) || getConfig(`chatmode_${ctx.chat.id}`, null);
  const chatManagerMode = getConfig('chat_manager_mode', 'false') === 'true';

  // If text mode was explicitly turned off by owner or group admin (/text off or /chat stop or chup), honor stop!
  if (textMode === 'off' || textMode === 'false' || textMode === 'mention') {
    return {
      shouldRespond: false,
      reason: 'text_mode_off_stop_feature',
      isPrivate: false,
    };
  }

  // If /text on is active: participate and blend into conversation!
  if (textMode === 'on' || textMode === 'true' || textMode === 'all') {
    return {
      shouldRespond: true,
      reason: 'text_mode_on',
      cleanText: text,
      isPrivate: false,
    };
  }

  // If Chat Manager mode is active: participate
  if (chatManagerMode) {
    return {
      shouldRespond: true,
      reason: 'chat_manager_active',
      cleanText: text,
      isPrivate: false,
    };
  }

  // 8. Ordinary member banter without invoking Rocket:
  return {
    shouldRespond: false,
    reason: 'ordinary_member_conversation_silent',
    isPrivate: false,
  };
}

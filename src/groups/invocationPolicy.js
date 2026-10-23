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
      const nameInvocationRegex = /^(?:hey\s+|hi\s+|ok\s+)?nero[\s,:]+/i;
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

  // 2. In groups, check if participation is enabled for this chat
  if (!canBotRespondInGroup(ctx.chat.id)) {
    return {
      shouldRespond: false,
      reason: 'group_bot_disabled',
      isPrivate: false,
    };
  }

  // 2.5 Text Reply Mode (/text on | /text off): If text mode is explicitly ON for this chat, Nero reads & replies to all texts!
  const textMode = getConfig(`text_mode_${ctx.chat.id}`, null) || getConfig(`chatmode_${ctx.chat.id}`, 'off');
  if (textMode === 'on' || textMode === 'true' || textMode === 'all') {
    return {
      shouldRespond: true,
      reason: 'text_mode_on',
      cleanText: text,
      isPrivate: false,
    };
  }

  // 3. Explicit Bot Mention: @N3ROL4BSBOT or @n3rol4bsbot
  const mentionRegex = new RegExp(`@?${botUsername}\\b`, 'i');
  if (mentionRegex.test(text)) {
    return {
      shouldRespond: true,
      reason: 'explicit_mention',
      cleanText: text.replace(mentionRegex, '').trim(),
    };
  }

  // 4. Direct Reply to Nero's message
  const isDirectReplyToBot = ctx.message.reply_to_message?.from?.id === botId;
  if (isDirectReplyToBot) {
    return {
      shouldRespond: true,
      reason: 'direct_reply_to_bot',
      cleanText: text,
    };
  }

  // 5. Explicit Name Invocation: contains "Nero" as a word anywhere in message, or starts with "Nero"
  const nameInvocationRegex = /\bnero\b/i;
  if (nameInvocationRegex.test(text)) {
    return {
      shouldRespond: true,
      reason: 'name_invocation',
      cleanText: text.replace(/\bnero\b/gi, '').trim() || text,
    };
  }

  // 6. Explicit Direct Command for Nero (e.g. "Nero save this image", "save this image to drive")
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
      // If replying to a photo or has a photo attached, this is directed to Nero
      if (ctx.message.photo || ctx.message.reply_to_message?.photo) {
        return {
          shouldRespond: true,
          reason: 'media_command',
          cleanText: text,
        };
      }
    }
  }

  // 7. Ambiguous or Ordinary conversation between members:
  // PREFER SILENCE! Even if message has a question mark or casual banter.
  return {
    shouldRespond: false,
    reason: 'ordinary_member_conversation_silent',
  };
}

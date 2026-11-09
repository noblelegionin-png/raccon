/**
 * 🦝 ROCKET AI — TOPIC RESPECT & CHANNEL RELEVANCE GUARD
 * 
 * Enforces server channel topic hygiene ("Strict, but not too strict"):
 * - Rocket understands what belongs in each channel (#general, #dev-workstation, #ai-studio, #gaming-hub, #wallet-hub, #help-desk, etc.)
 * - Substantive off-topic requests (e.g. asking to write code in #general, asking "where are payments guys" in #general)
 *   are caught cleanly.
 * - Rocket NEVER replies to the off-topic request directly in the wrong channel.
 * - 1st Offense: Rocket issues a 1-time warning tagging the correct <#channel> and notes 5m timeout policy.
 * - Repeated Offense (2nd within window): Rocket applies a 5-MINUTE TIMEOUT (mute) for spam.
 * - Full immunity for Boss Sandy (Sandy can discuss anything anywhere).
 */

import { EmbedBuilder } from 'discord.js';
import { recordModLog, getGuildSettings } from './discordDb.js';

// Cache: `${guildId}_${userId}` -> { count: number, lastOffenseTimestamp: number, lastTopic: string, channelId: string }
const topicViolationCache = new Map();

// 15-minute sliding window for repeated violations
const VIOLATION_WINDOW_MS = 15 * 60 * 1000;
const TIMEOUT_MINUTES = 5;

export const DOMAIN_TOPICS = {
  PAYMENTS: {
    key: 'payments',
    name: 'Payments, Pricing & Wallet Hub',
    targetChannels: ['wallet-hub', 'payments', 'billing', 'pricing', 'store'],
    fallbackChannel: 'wallet-hub',
    patterns: [
      /\bwhere\s+(?:are|is)\s+(?:the\s+)?payments?\b/i,
      /\bwhere\s+are\s+payemnts\b/i, // typo resilience
      /\b(?:where\s+can\s+i\s+pay|how\s+to\s+pay|how\s+do\s+i\s+pay|how\s+can\s+i\s+pay)\b/i,
      /\b(?:payment\s+methods?|pay\s+for\s+(?:bot|order|service|code|ticket))\b/i,
      /\b(?:check\s+(?:my\s+)?balance|wallet\s+balance|add\s+funds\s+to\s+wallet)\b/i,
      /\b(?:pricing\s+details|how\s+much\s+(?:does\s+it\s+cost|is\s+this|for\s+a\s+bot))\b/i,
      /\b(?:refund\s+request|can\s+i\s+get\s+a\s+refund|request\s+refund)\b/i,
    ],
  },

  CODING: {
    key: 'coding',
    name: 'Coding & Full-Stack Development',
    targetChannels: ['dev-workstation', 'coding-orders', 'coding-chat', 'coding', 'dev', 'web-dev'],
    fallbackChannel: 'dev-workstation',
    patterns: [
      /\b(?:write\s+(?:a\s+)?code|write\s+(?:some\s+)?code|help\s+me\s+write\s+(?:a\s+)?code)\b/i,
      /\b(?:write\s+(?:me\s+)?a\s+script|create\s+(?:me\s+)?a\s+script|code\s+(?:me\s+)?a\s+bot)\b/i,
      /\b(?:write\s+(?:a\s+)?python\s+script|write\s+(?:a\s+)?javascript\s+code|write\s+(?:a\s+)?discord\.js\s+bot)\b/i,
      /\b(?:fix\s+(?:this|my)\s+code|debug\s+(?:this|my)\s+code|how\s+to\s+fix\s+this\s+syntax\s+error)\b/i,
      /\b(?:how\s+to\s+code\s+a|can\s+someone\s+code|generate\s+code\s+for)\b/i,
    ],
  },

  SUPPORT: {
    key: 'support',
    name: 'Help Desk & Support Tickets',
    targetChannels: ['help-desk', 'support', 'tickets', 'help'],
    fallbackChannel: 'help-desk',
    patterns: [
      /\b(?:how\s+to\s+open\s+a\s+ticket|where\s+do\s+i\s+open\s+a\s+ticket|create\s+a\s+ticket)\b/i,
      /\b(?:i\s+need\s+help\s+from\s+staff|contact\s+(?:an?\s+)?admin|talk\s+to\s+(?:a\s+)?(?:mod|admin|staff))\b/i,
      /\b(?:report\s+(?:a\s+)?(?:user|scammer|bug|glitch)|dispute\s+(?:an?\s+)?order)\b/i,
      /\b(?:verification\s+is\s+broken|cant\s+get\s+verified|help\s+with\s+verification)\b/i,
    ],
  },

  GAMING: {
    key: 'gaming',
    name: 'Gaming Hub & Squad Matchmaking',
    targetChannels: ['gaming-hub', 'gaming-orders', 'gaming', 'games'],
    fallbackChannel: 'gaming-hub',
    patterns: [
      /\b(?:who\s+(?:wants\s+to|wanna)\s+play|anyone\s+(?:wanna|want\s+to)\s+play)\s+(?:roblox|minecraft|fortnite|valorant|cs2|gta|apex)\b/i,
      /\b(?:squad\s+up\s+for|duo\s+partner\s+for)\s+(?:roblox|fortnite|valorant|minecraft)\b/i,
      /\b(?:join\s+my\s+minecraft\s+server|what\s+is\s+the\s+server\s+ip|roblox\s+build\s+orders?)\b/i,
    ],
  },

  AI: {
    key: 'ai',
    name: 'AI Studio & Neural Models',
    targetChannels: ['ai-studio', 'ai-orders', 'ai-tools'],
    fallbackChannel: 'ai-studio',
    patterns: [
      /\b(?:train\s+(?:a\s+)?(?:neural\s+model|llm)|fine-tuning\s+(?:a\s+)?model)\b/i,
      /\b(?:write\s+(?:a\s+)?system\s+prompt|prompt\s+engineering\s+pipeline)\b/i,
      /\b(?:stable\s+diffusion\s+prompt|midjourney\s+prompt|rag\s+pipeline\s+architecture)\b/i,
    ],
  },
};

/**
 * Determine the primary domain of a channel
 */
export function getChannelDomain(channelName = '') {
  const clean = channelName.toLowerCase().trim();

  if (clean === 'general' || clean === 'general-chat') {
    return {
      domain: 'general',
      title: 'Community Lounge (#general)',
      purpose: 'General social conversation, arrivals welcome, rank celebrations & community hangout',
      allowedTopics: ['general', 'casual', 'banter'],
      forbiddenTopics: ['coding', 'payments', 'support', 'gaming', 'ai'],
    };
  }

  if (clean.includes('ai-studio') || clean.includes('ai-tools') || clean.includes('ai-orders')) {
    return {
      domain: 'ai',
      title: 'AI Studio & Neural Hub',
      purpose: 'AI and neural technology discussions, prompt pipelines, and model engineering',
      allowedTopics: ['ai', 'general'],
      forbiddenTopics: ['gaming', 'payments'],
    };
  }

  if (clean.includes('gaming') || clean.includes('games')) {
    return {
      domain: 'gaming',
      title: 'Gaming Hub',
      purpose: 'Gaming matchmaking, squad coordination, Roblox, Minecraft, and game configs',
      allowedTopics: ['gaming', 'general'],
      forbiddenTopics: ['coding', 'ai', 'payments'],
    };
  }

  if (clean.includes('dev') || clean.includes('coding') || clean.includes('web-dev')) {
    return {
      domain: 'coding',
      title: 'Dev & Engineering Workstation',
      purpose: 'Full-stack engineering, programming, scripts, architecture, and code reviews',
      allowedTopics: ['coding', 'general'],
      forbiddenTopics: ['gaming', 'payments'],
    };
  }

  if (clean.includes('wallet') || clean.includes('billing') || clean.includes('payment')) {
    return {
      domain: 'payments',
      title: 'Wallet & Payments Hub',
      purpose: 'Nero Labs Pizza Wallet, billing management, balance checks, and refunds',
      allowedTopics: ['payments', 'general'],
      forbiddenTopics: ['coding', 'gaming'],
    };
  }

  if (clean.includes('help') || clean.includes('support') || clean.includes('tickets')) {
    return {
      domain: 'support',
      title: 'Support & Help Desk',
      purpose: 'Confidential member support, staff assistance & issue escalation',
      allowedTopics: ['support', 'general'],
      forbiddenTopics: ['gaming', 'coding'],
    };
  }

  if (clean === 'chat') {
    return {
      domain: 'chat',
      title: 'Rocket AI Neural Hub',
      purpose: 'High-power conversational AI companion, witty banter, and community discussions',
      allowedTopics: ['chat', 'general', 'ai', 'coding', 'gaming'],
      forbiddenTopics: [], // Rocket can talk about anything in #chat, but redirects payments
    };
  }

  return {
    domain: 'other',
    title: `#${channelName}`,
    purpose: 'Designated server channel',
    allowedTopics: ['general'],
    forbiddenTopics: [],
  };
}

/**
 * Detect if message contains substantive inquiry that belongs in another channel
 * Returns violation info if off-topic, or null if permissible
 */
export function detectOffTopic(message, channel) {
  const content = message.content || '';
  if (!content || content.length < 5) return null;

  const channelDomain = getChannelDomain(channel.name);

  // Check each domain topic
  for (const [topicKey, topicDef] of Object.entries(DOMAIN_TOPICS)) {
    // Is this topic forbidden in the current channel?
    // In #chat, we only redirect payments inquiries to #wallet-hub
    const isForbidden = channelDomain.domain === 'chat'
      ? topicDef.key === 'payments'
      : channelDomain.forbiddenTopics.includes(topicDef.key);

    if (!isForbidden) continue;

    // Check if message matches substantive inquiry patterns for this forbidden topic
    const matched = topicDef.patterns.some((regex) => regex.test(content));
    if (matched) {
      return {
        isOffTopic: true,
        topicKey: topicDef.key,
        topicName: topicDef.name,
        targetChannels: topicDef.targetChannels,
        fallbackChannel: topicDef.fallbackChannel,
        channelDomain,
      };
    }
  }

  return null;
}

/**
 * Handle topic violation:
 * - 1st Offense: 1-time warning with clickable target channel link and 5m timeout warning
 * - Repeated Offense: 5-minute timeout for spam + notification + audit log
 */
export async function handleTopicViolation(message, violation) {
  const { guild, channel, author, member } = message;
  if (!guild || !member) return false;

  const cacheKey = `${guild.id}_${author.id}`;
  const now = Date.now();
  const existing = topicViolationCache.get(cacheKey);

  // Resolve target channel in Discord guild
  let targetChannel = null;
  for (const chName of violation.targetChannels) {
    const found = guild.channels.cache.find((c) => c.name.toLowerCase() === chName);
    if (found && found.isTextBased()) {
      targetChannel = found;
      break;
    }
  }

  const targetMention = targetChannel ? `<#${targetChannel.id}>` : `#${violation.fallbackChannel}`;

  const isRecentRepeated =
    existing &&
    now - existing.lastOffenseTimestamp < VIOLATION_WINDOW_MS;

  if (isRecentRepeated) {
    // -----------------------------------------------------------------------
    // REPEATED OFFENSE: Apply 5-Minute Timeout for Spam
    // -----------------------------------------------------------------------
    topicViolationCache.delete(cacheKey); // Reset after action

    let timeoutApplied = false;
    if (member.moderatable) {
      try {
        await member.timeout(
          TIMEOUT_MINUTES * 60 * 1000,
          `Off-topic spam in #${channel.name}: repeated ${violation.topicName} after warning`
        );
        timeoutApplied = true;
      } catch (tmErr) {
        console.warn(`[TopicGuard] Failed to timeout member ${author.tag}:`, tmErr.message);
      }
    }

    // Try deleting the repeat message to keep channel tidy
    await message.delete().catch(() => null);

    const alertMsg = await channel.send(
      `🚨 <@${author.id}> has been timed out for **${TIMEOUT_MINUTES} minutes** for repeated off-topic spam in #${channel.name}.\n` +
      `Please respect channel topics and discuss **${violation.topicName}** in ${targetMention}. 🦝⏱️`
    ).catch(() => null);

    if (alertMsg) {
      setTimeout(() => alertMsg.delete().catch(() => null), 12000);
    }

    recordModLog(guild.id, {
      action: 'topic_spam_timeout_5m',
      userId: author.id,
      userTag: author.tag,
      moderatorId: 'system',
      moderatorTag: 'Rocket Topic Guard',
      reason: `Repeated off-topic posting in #${channel.name} (${violation.topicName})`,
      details: message.content.slice(0, 100),
    });

    return { handled: true, action: 'timeout' };
  }

  // -------------------------------------------------------------------------
  // 1ST OFFENSE: 1-Time Polite Warning & Channel Redirection
  // -------------------------------------------------------------------------
  topicViolationCache.set(cacheKey, {
    count: 1,
    lastOffenseTimestamp: now,
    lastTopic: violation.topicKey,
    channelId: channel.id,
  });

  const warningMsg = await message.reply(
    `⚠️ <@${author.id}>, this channel (**#${channel.name}**) is dedicated to **${violation.channelDomain.purpose}**.\n\n` +
    `• **Proper Channel:** Please head over to ${targetMention} for **${violation.topicName}**!\n` +
    `• **Notice:** *This is your 1-time notice. Repeated off-topic inquiries in the wrong channel will result in a **5-minute timeout** for spam.* 🦝🐾`
  ).catch(() => null);

  if (warningMsg) {
    // Keep warning visible for 15s so user reads it, then clean up
    setTimeout(() => warningMsg.delete().catch(() => null), 15000);
  }

  return { handled: true, action: 'warn' };
}

/**
 * Get Channel Topic Knowledge for AI System Prompt
 */
export function getChannelTopicKnowledge(channel) {
  const domain = getChannelDomain(channel?.name || '');
  return (
    `CHANNEL TOPIC KNOWLEDGE & RESPECT:\n` +
    `- You are currently stationed inside #${channel?.name || 'chat'}.\n` +
    `- Channel Domain: ${domain.title}\n` +
    `- Designated Purpose: "${domain.purpose}"\n` +
    `- Primary Focus: ${domain.allowedTopics.join(', ')}\n` +
    `- TOPIC RESPECT MANDATE: Strictly respect the channel focus. If members in #${channel?.name || 'general'} ask for payments or out-of-scope tasks, guide them to the proper channel with executive poise.`
  );
}

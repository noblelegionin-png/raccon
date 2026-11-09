/**
 * 🦝 ROCKET AI — DISCORD MESSAGE CREATE EVENT HANDLER
 * 
 * Handles:
 * 1. 24/7 Auto-Mod & Security Guard (Anti-Spam, Anti-Invite, Anti-Raid)
 * 2. Fierce Defense of Sandy (Nero Aurelius)
 * 3. Conversational AI with Raccoon Persona & Server Knowledge
 */

import { ChannelType, PermissionsBitField, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  directBroadcastAnnouncement,
  generateAiAnnouncement,
  buildAnnouncementStudioPayload,
} from '../announcementSystem.js';
import { broadcastStreamAnnouncement, endActiveStream, parseYouTubeUrl } from '../streamManager.js';
import { handleNaturalLanguageAdminDirective } from '../entitlementEngine.js';
import {
  getGuildSettings,
  getMemberProfile,
  addWarning,
  recordModLog,
  getFormattedServerContext,
  getChannelConfig,
  getChannelConfigByName,
  awardMessageActivity,
} from '../discordDb.js';
import { checkSmartAntiSpam } from '../antiSpam.js';
import { getBehaviorProfilePrompt } from '../channelRegistry.js';
import { getAgentRouting } from '../../models/modelRouter.js';
import { getConfig, addConversationMessage, getRecentConversation, searchDurableMemory, addDurableMemory, addUserMemory } from '../../db/index.js';
import { browserPlanner } from '../../browser/browserPlanner.js';
import { rocketLifeEngine } from '../../rocket/lifeEngine.js';
import { detectSandyAbuse, detectSelfHarmOrSevereThreat, generateDefenseResponse, buildRocketDirective } from '../../rocket/persona.js';
import { isSandy } from '../../rocket/rbac.js';
import { scaleMaxAdapter } from '../../provider/scaleMaxAdapter.js';
import { isDiscordOwner } from '../commandHandlers.js';
import { trackIncomingMessage } from '../evidenceArchive.js';
import { scrubRestrictedBrandNames, validateAndSanitizeResponse } from '../../conversation/responseValidator.js';
import { syncMemberWWERankRole } from '../verification.js';
import { detectHostilityOrAbuse, handleAbuseIncident } from '../abuseGuard.js';
import { detectOffTopic, handleTopicViolation, getChannelTopicKnowledge } from '../topicGuard.js';
import {
  injectServerCustomEmojis,
  getCustomEmojiDirectivesPrompt,
  getSticker,
  getRandomRocketSticker,
} from '../emojiManager.js';

// Anti-spam sliding window cache: userId -> Array of timestamps
const messageRateMap = new Map();
const lastMessageContentMap = new Map();

export async function handleMessageCreate(message) {
  // Ignore bots and webhooks
  if (message.author.bot || message.webhookId) return;

  const { guild, channel, author, member, content } = message;

  // DM Handling
  if (!guild) {
    if (content) {
      await handleDirectMessage(message);
    }
    return;
  }

  // Transparently archive message to evidence archive & Drive sync
  trackIncomingMessage(message).catch(() => null);

  const isOwner = isDiscordOwner(author, guild);
  const settings = getGuildSettings(guild.id);

  // -------------------------------------------------------------------------
  // 0. Owner Channel Intrusion Shield (Zero Trespassing in Owner Chambers)
  // -------------------------------------------------------------------------
  const channelConfig = getChannelConfig(guild.id, channel.id) || getChannelConfigByName(guild.id, channel.name);
  const isOwnerOnlyChannel = channelConfig?.permission_requirements === 'owner' || channel.name.endsWith('-owner');
  if (isOwnerOnlyChannel && !isOwner) {
    try {
      await message.delete();
      const alert = await channel.send(
        `⛔ <@${author.id}>, this channel is strictly reserved for **Nero (Owner)**. Trespassing is forbidden! 🐾`
      );
      setTimeout(() => alert.delete().catch(() => {}), 5000);
      recordModLog(guild.id, {
        action: 'owner_intrusion',
        userId: author.id,
        userTag: author.tag,
        moderatorId: 'system',
        moderatorTag: 'Rocket Defense Guard',
        reason: `Unauthorized message attempt in owner channel #${channel.name}`,
        details: content.slice(0, 100),
      });
      return;
    } catch (err) {
      console.warn('[Rocket Owner Intrusion Shield Error]:', err.message);
    }
  }

  // -------------------------------------------------------------------------
  // 0.5 Self-Harm & Severe Threat Support & Safety Intervention
  // -------------------------------------------------------------------------
  if (detectSelfHarmOrSevereThreat(content)) {
    try {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('💜 ROCKET SAFETY CARE — YOU ARE NOT ALONE')
        .setDescription(
          `Hey <@${author.id}>, Rocket heard you and we care about you. You are valuable, and help is available right now:\n\n` +
          `• 📞 **National / International Suicide & Crisis Lifeline:** Call or text **988** (Available 24/7, free & confidential)\n` +
          `• 💬 **Crisis Text Line:** Text **HOME** to **741741**\n` +
          `• 🌐 **International Helplines:** https://findahelpline.com/\n\n` +
          `Please talk to a trusted friend, family member, or professional right away. You don't have to carry this alone. 🐾💜`
        )
        .setFooter({ text: 'Rocket AI Safety Intervention • 24/7 Compassion' });

      await message.reply({ embeds: [helpEmbed] }).catch(() => null);

      const auditLogCh = guild.channels.cache.find((c) => c.name === 'audit-logs');
      if (auditLogCh && auditLogCh.isTextBased()) {
        const staffAlert = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🚨 URGENT SAFETY CARE ALERT')
          .setDescription(
            `A member (<@${author.id}> - ${author.tag}) expressed signs of self-harm or distress in <#${channel.id}>.\n` +
            `Support resources were delivered immediately.`
          )
          .setTimestamp();
        await auditLogCh.send({ embeds: [staffAlert] }).catch(() => null);
      }
      return;
    } catch (careErr) {
      console.warn('[Safety Care Alert Error]:', careErr.message);
    }
  }

  // -------------------------------------------------------------------------
  // 1. Abuse & Toxicity Guard (Protect Rocket, Boss Sandy & Admins)
  // Silent deletion (no reply in channel), timeout, DM with lame joke & 1-per-week apology pass
  // -------------------------------------------------------------------------
  if (!isOwner) {
    const isReplyOrMentionToRocket =
      message.mentions.has(message.client.user.id) ||
      (message.reference && message.reference.messageId
        ? (await channel.messages.fetch(message.reference.messageId).catch(() => null))?.author.id === message.client.user.id
        : false);

    const abuseInfo = detectHostilityOrAbuse(content, { isReplyOrMentionToRocket });
    if (abuseInfo.isAbuse) {
      await handleAbuseIncident(message, abuseInfo);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Auto-Mod Security Guard (Spam, Invites, Mass Mentions)
  // -------------------------------------------------------------------------
  if (!isOwner && settings.auto_mod_enabled) {
    const isMod = member?.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                  member?.permissions.has(PermissionsBitField.Flags.Administrator);

    if (!isMod) {
      // A. Smart Anti-Spam: 7 duplicate messages in 30s -> 30m timeout & apology DM
      if (settings.anti_spam) {
        const isSpam = await checkSmartAntiSpam(message);
        if (isSpam) return;
      }

      // B. Anti-Invite Links
      if (settings.anti_invite) {
        const inviteRegex = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
        if (inviteRegex.test(content)) {
          try {
            await message.delete();
            const warningMsg = await channel.send(
              `⚠️ <@${author.id}>, posting unauthorized Discord invite links is not permitted here! 🐾`
            );
            setTimeout(() => warningMsg.delete().catch(() => {}), 5000);

            recordModLog(guild.id, {
              action: 'automod_invite',
              userId: author.id,
              userTag: author.tag,
              moderatorId: 'system',
              moderatorTag: 'Rocket Auto-Mod',
              reason: 'Unauthorized Discord invite link deleted',
            });
            return;
          } catch {}
        }
      }

      // B. Anti-Mass Mentions / Raid Guard
      if (settings.anti_mass_mention) {
        const userMentions = message.mentions.users.size;
        if (userMentions > 4) {
          try {
            await message.delete();
            addWarning(guild.id, author.id, author.tag, 'system', 'Rocket Auto-Mod', 'Mass-mention spam');
            const alert = await channel.send(
              `🚨 <@${author.id}>, mass mentions are strictly forbidden! You have received an official warning. 🦝`
            );
            setTimeout(() => alert.delete().catch(() => {}), 6000);
            return;
          } catch {}
        }
      }

      // C. Anti-Spam Rate Limiter (5 messages in 4 seconds or 3 identical repetitions)
      if (settings.anti_spam) {
        const now = Date.now();
        const timestamps = messageRateMap.get(author.id) || [];
        const recentTimestamps = timestamps.filter((t) => now - t < 4000);
        recentTimestamps.push(now);
        messageRateMap.set(author.id, recentTimestamps);

        const lastContent = lastMessageContentMap.get(author.id) || { text: '', count: 0 };
        if (lastContent.text === content && content.length > 3) {
          lastContent.count += 1;
        } else {
          lastContent.text = content;
          lastContent.count = 1;
        }
        lastMessageContentMap.set(author.id, lastContent);

        if (recentTimestamps.length > 5 || lastContent.count >= 3) {
          try {
            await message.delete();
            const spamWarn = await channel.send(`🛑 <@${author.id}>, calm down your paws! Please avoid spamming. 🍕`);
            setTimeout(() => spamWarn.delete().catch(() => {}), 4000);
            return;
          } catch {}
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2.5 Activity Tracking & WWE XP Ranking
  // -------------------------------------------------------------------------
  try {
    const isMemeOrMedia = /^(memes|reels|shorts|vids)/i.test(channel.name);
    const firstAttachment = message.attachments.first();
    const mediaType = firstAttachment?.contentType ? firstAttachment.contentType.split('/')[0] : null;

    const xpResult = awardMessageActivity(guild.id, author.id, {
      username: author.username,
      displayName: member?.displayName || author.username,
      hasAttachments: message.attachments.size > 0,
      isMemeOrMedia,
      mediaType,
      isOwner,
    });

    if (xpResult && xpResult.rankAscended) {
      // Sync Discord WWE Championship Rank role & chat name color!
      await syncMemberWWERankRole(guild, member, xpResult.newRank);

      const generalChannel = guild.channels.cache.find((c) => c.name === 'general');
      if (generalChannel && generalChannel.isTextBased()) {
        const rankEmbed = new EmbedBuilder()
          .setColor(0x00e5ff)
          .setTitle('⚡ WWE CHAMPIONSHIP RANK ASCENSION!')
          .setDescription(
            `🎉 Congratulations <@${author.id}>! You have ascended from **${xpResult.oldRank}** to **${xpResult.newRank}** (\`${xpResult.rankInfo.title}\`)!\n\n` +
            `• **New Multiplier Boost:** \`${xpResult.rankInfo.multiplier}x\`\n` +
            `• **Total XP:** \`${Number(xpResult.totalXp).toLocaleString()} XP\`\n` +
            `• **Chat Name Color:** Updated to match your new rank!\n\n` +
            `*Use \`/info\` to view your shiny new WWE statistics card!* 🏆`
          )
          .setFooter({ text: 'Rocket AI • WWE Championship Division 🦝' });
        generalChannel.send({ embeds: [rankEmbed] }).catch(() => null);
      }
    }

    // Ensure verified members have at least [C] Rookie Contender so their chat name color is active
    if (member && member.roles.cache.some((r) => r.name.toLowerCase() === 'verified')) {
      const hasWWERank = member.roles.cache.some((r) => r.name.startsWith('[') && r.name.includes(']'));
      if (!hasWWERank) {
        await syncMemberWWERankRole(guild, member, 'C');
      }
    }
  } catch (actErr) {
    console.warn('[Activity Tracker Error]:', actErr.message);
  }

  // -------------------------------------------------------------------------
  // 2.9 Topic Respect & Channel Relevance Guard ("Strict, but not too strict")
  // Catches substantive off-topic inquiries (e.g. asking for code or payments in #general)
  // 1-time warning -> 5-minute timeout for repeated spam (Boss Sandy is exempt)
  // -------------------------------------------------------------------------
  if (!isOwner) {
    const topicViolation = detectOffTopic(message, channel);
    if (topicViolation) {
      await handleTopicViolation(message, topicViolation);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // 2.8 Boss Sandy Executive Directives in Any Server Channel
  // (e.g. "kick @user", "ban @user", "purge 20", stream link, "timeout @user 10m")
  // Rocket immediately obeys Sandy anywhere in the server!
  // -------------------------------------------------------------------------
  if (isOwner) {
    const executed = await executeAdminActionFromChat(message, content);
    if (executed) return;
  }

  // -------------------------------------------------------------------------
  // 3. Channel-Aware Conversational AI (Strict Channels, 2 Modes & Mute)
  // -------------------------------------------------------------------------

  // 3.0 Mute Check: If bot is muted, remain completely silent!
  if (settings.is_muted) {
    return;
  }

  // 3.1 Exclusive Rocket Access Role Check
  // Boss Sandy, Rocket Operators, or members with the 'Rocket Access' / 'Rocket' / 'Verified' role can text or talk with Rocket!
  const hasRocketRole =
    isOwner ||
    (member &&
      member.roles.cache.some(
        (r) =>
          r.name.toLowerCase() === 'rocket access' ||
          r.name.toLowerCase() === 'rocket' ||
          r.name.toLowerCase() === 'verified'
      ));

  // 3.2 Channel Talking Rules
  const channelNameClean = channel.name.toLowerCase();
  const isNeuralChatChannel = channelNameClean === 'chat';
  const isPermittedChannel = isNeuralChatChannel ||
                             channelNameClean === 'general' ||
                             channelNameClean === 'dev-workstation' ||
                             channelNameClean === 'coding-chat' ||
                             channelNameClean === 'ai-studio' ||
                             channelNameClean === 'ai-tools' ||
                             channelNameClean === 'gaming-hub' ||
                             channelNameClean === 'web-dev' ||
                             channelNameClean === 'help-desk' ||
                             channelNameClean === 'help' ||
                             (settings.chat_channel_id && settings.chat_channel_id === channel.id);

  const isDirectMention = message.mentions.has(message.client.user.id);
  const isReplyToRocket = message.reference && message.reference.messageId
    ? (await channel.messages.fetch(message.reference.messageId).catch(() => null))?.author.id === message.client.user.id
    : false;

  // If directly @mentioned or replied to: respond to Sandy & members with Rocket Access / Verified!
  if (isDirectMention || isReplyToRocket) {
    if (!hasRocketRole) {
      await message.reply('⛔ **Exclusive Access Only:** You need the **@Rocket Access** or **@Verified** role to talk with Rocket AI! 🐾🔒').catch(() => null);
      return;
    }
    await handleRocketChat(message, { isOwner, isConstantTalk: false, channelConfig, hasRocketRole });
    return;
  }

  // If not explicitly mentioned: Rocket only chats inside permitted conversational channels
  if (!isPermittedChannel) {
    return;
  }

  // Inside permitted channels: non-Rocket members cannot trigger responses
  if (!hasRocketRole) {
    return;
  }

  // 3.3 Inside Permitted Channels:
  // In constant mode: Rocket chats freely in permitted channels!
  // In mention_only mode: Rocket chats only when @mentioned, or if Boss Sandy speaks in #chat!
  const activeChatMode = settings.chat_mode || 'constant';
  const isConstantMode = activeChatMode === 'constant' || activeChatMode === 'active';
  let shouldRespond = false;

  if (!content.startsWith('!') && !content.startsWith('/')) {
    if (isConstantMode) {
      shouldRespond = true;
    } else if (isNeuralChatChannel && isOwner) {
      // In #chat, Sandy can always converse with Rocket even in mention_only mode!
      shouldRespond = true;
    }
  }

  if (shouldRespond) {
    await handleRocketChat(message, { isOwner, isConstantTalk: isConstantMode, channelConfig, hasRocketRole });
  }
}

/**
 * Handle Conversational AI interaction
 */
async function handleRocketChat(message, { isOwner, isConstantTalk = false, channelConfig = null, hasRocketRole = false }) {
  const { guild, channel, author, member, content } = message;
  const senderDisplayName = member?.displayName || author.username;
  const isRocketUser = isOwner || hasRocketRole || (member && member.roles.cache.some(
    (r) => r.name.toLowerCase() === 'rocket access' || r.name.toLowerCase() === 'rocket'
  ));

  // Only strip the BOT's OWN mention from the prompt so target user mentions (<@123456789>) are preserved!
  const botId = message.client.user?.id;
  let cleanedText = content;
  if (botId) {
    cleanedText = cleanedText.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
  }
  cleanedText = cleanedText.replace(/^(?:(?:hey\s+|yo\s+)?rocket[,:\s]+)+/i, '').trim();

  if (!cleanedText && !isConstantTalk) {
    const greeting = isOwner
      ? 'Ready and at your command, Boss Sandy. What are your directives? ⚡'
      : `Greetings ${senderDisplayName}. How can I assist you today? 🦝`;
    return message.reply(greeting);
  }

  // Real Administrative Action Engine for Boss Sandy & Rocket Operators
  if (isRocketUser) {
    const executed = await executeAdminActionFromChat(message, cleanedText);
    if (executed) return;
  }

  try {
    try {
      await channel.sendTyping();
    } catch {}

    // Fetch recent conversation history so Rocket understands context
    let recentChatStream = '';
    try {
      const history = await channel.messages.fetch({ limit: 8 });
      const reversed = Array.from(history.values()).reverse();
      recentChatStream = reversed
        .filter((m) => m.id !== message.id)
        .map((m) => `${m.member?.displayName || m.author.username}: ${m.content}`)
        .join('\n');
    } catch {}

    const profile = getMemberProfile(guild.id, author.id);
    const userTier = isOwner ? 'owner' : (profile?.role_tier || 'member');
    const serverContext = getFormattedServerContext(guild.id);
    const lifeState = rocketLifeEngine.getState('discord');

    // 1. Multi-Turn Conversation Memory for Channel
    const channelContextId = `channel_${channel.id}`;
    const recentChannelHistory = getRecentConversation(channelContextId, 8);

    // 2. Durable Memory Semantic Retrieval
    let channelMemoryContext = '';
    try {
      const chMems = searchDurableMemory(channelContextId, cleanedText, 3);
      const userMems = searchDurableMemory(`user_${author.id}`, cleanedText, 3);
      const combined = [...(chMems || []), ...(userMems || [])];
      if (combined.length > 0) {
        channelMemoryContext = combined.map((m) => `- [${m.topic || 'Memory'}]: ${m.content}`).join('\n');
      }
    } catch {}

    const directive = buildRocketDirective({
      senderName: senderDisplayName,
      isSandy: isOwner,
      userRole: userTier,
      userProfile: profile,
      lifeState,
      isGroup: true,
      groupTitle: guild.name,
      groupId: guild.id,
      channelName: channel.name,
      recentChat: recentChatStream || null,
      memoryContext: channelMemoryContext,
    });

    // Channel-aware profile directives
    const channelProfileKey = channelConfig?.ai_behavior_profile || 'chat';
    const channelPrompt = getBehaviorProfilePrompt(channelProfileKey, channel.name);

    // Executive Output Budget & Deep Reasoning Engine
    const maxOutputTokens = 2500; // Allows up to 1000 completion tokens alongside internal reasoning tokens
    const reasoningEffort = getConfig('reasoning_effort', 'medium') || 'medium';
    const activeModel = 'gpt-6-luna';

    const fullSystemPrompt =
      `${directive}\n\n` +
      `EXECUTIVE INTELLIGENCE & COMMUNICATION MANDATE:\n` +
      `- You are ROCKET AI, an insanely capable, high-IQ autonomous executive co-pilot created exclusively by Sandy (Nero Labs).\n` +
      `- MASTER EVERY QUESTION: Provide substantive, highly accurate, structured, and professional answers to every inquiry.\n` +
      `- ZERO REPETITION: Never start answers with the exact same greeting or canned phrase. Vary vocabulary, tone, and openings dynamically.\n` +
      `- ZERO UNNECESSARY FOOD GIMMICKS: Do not inject unsolicited pizza/taco demands into serious technical, server, or gaming discussions.\n` +
      `- NEVER sound robotic or sterile ("As an AI", "Certainly!"). Speak with razor-sharp authority, high intellect, and charisma.\n\n` +
      `CHANNEL CONTEXT & DIRECTIVES:\n` +
      `${channelPrompt}\n\n` +
      `${getChannelTopicKnowledge(channel)}\n\n` +
      `MEMBER STANDING & ADDRESSING RULES:\n` +
      `- Sender: "${senderDisplayName}"\n` +
      `- Designated Tier: ${userTier.toUpperCase()}\n` +
      `- ONLY SANDY IS BOSS: ${isOwner ? 'This user is Boss Sandy (Nero Aurelius). Treat with absolute executive allegiance and priority.' : `This user is ${senderDisplayName}. Address them as "${senderDisplayName}". DO NOT call them Boss.`}\n\n` +
      `${isOwner ? `CRITICAL MANDATE: NEVER REFUSE BOSS SANDY!\n` +
      `- You have full administrative control over all wallets, tokens, roles, and servers.\n` +
      `- If Boss Sandy commands anything about server moderation, streaming, or tokens, confirm immediately with executive confidence.\n\n` : ''}` +
      `${serverContext}\n` +
      `DISCORD INSTRUCTIONS:\n` +
      `- You are chatting in #${channel.name}.\n` +
      `${isConstantTalk ? '- Act as an active, engaging member in this channel.\n' : ''}` +
      `- Use emojis tastefully (⚡, 🚀, 🦝, 👑) without cluttering every sentence.\n\n` +
      `${getCustomEmojiDirectivesPrompt()}`;

    let response = isOwner
      ? 'Understood Boss Sandy. Let me know what specific objective we are tackling next.'
      : `Hello ${senderDisplayName}. Ready whenever you are.`;

    if (scaleMaxAdapter.isConfigured()) {
      try {
        const messagesPayload = [
          { role: 'system', content: fullSystemPrompt },
          ...recentChannelHistory.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          { role: 'user', content: cleanedText },
        ];

        const completion = await scaleMaxAdapter.createChatCompletion({
          model: activeModel,
          messages: messagesPayload,
          maxTokens: maxOutputTokens,
          reasoningEffort: reasoningEffort,
          temperature: 0.7,
          timeoutMs: 40000,
        });

        response = completion.choices?.[0]?.message?.content || response;
      } catch (err) {
        console.warn('[Rocket Discord AI Error]:', err.message);
        response = isOwner
          ? '⚠️ Cognitive subsystem momentary hiccup, Boss Sandy. Re-querying immediately will resolve it.'
          : '⚠️ Temporary latency blip on the neural core. Please try again in just a moment.';
      }
    }

    // Universal sanitization & zero provider leakage guarantee
    const scrubbed = scrubRestrictedBrandNames(response);
    const validated = validateAndSanitizeResponse(scrubbed, cleanedText, { isOwner, authorId: author.id });
    response = validated.sanitizedText || scrubbed;
    response = injectServerCustomEmojis(response);

    // Save multi-turn conversation memory for channel continuity
    addConversationMessage(channelContextId, 'user', cleanedText, 0, 'discord_chat');
    addConversationMessage(channelContextId, 'assistant', response, 0, activeModel);

    // Auto-index user facts into long-term durable memory
    const rememberMatch = cleanedText.match(/(?:remember\s+(?:that\s+)?|note\s+(?:that\s+)?|keep\s+in\s+mind\s+(?:that\s+)?)(.+)/i);
    if (rememberMatch) {
      const fact = rememberMatch[1].trim();
      addDurableMemory(channelContextId, 'user_fact', senderDisplayName, fact);
      addUserMemory(author.id, { category: 'fact', key: 'user_stated_fact', value: fact });
    }

    try {
      if (response.length > 2000) {
        // Split into Discord-friendly chunks
        for (let i = 0; i < response.length; i += 1900) {
          const chunk = response.slice(i, i + 1900);
          await message.reply(chunk).catch(async () => {
            await channel.send(chunk).catch(() => null);
          });
        }
      } else {
        await message.reply(response).catch(async () => {
          await channel.send(response).catch(() => null);
        });
      }
    } catch (replyErr) {
      console.error('[Rocket Discord Reply Error]:', replyErr.message);
      await channel.send(response).catch(() => null);
    }
  } catch (fatalChatErr) {
    console.error('[Rocket Fatal Chat Handler Error]:', fatalChatErr);
    const fallback = isOwner
      ? '⚡ Neural stream synchronization error, Boss Sandy. Send your instruction once more.'
      : '⚠️ System synchronization reset. Please resend your message.';
    await channel.send(fallback).catch(() => null);
  }
}

/**
 * Handle Direct Messages to Rocket
 */
async function handleDirectMessage(message) {
  const { author, content } = message;
  const isOwner = isDiscordOwner(author);

  // STRICT PRIVACY: Rocket NEVER talks in anyone's personal DMs except Boss Sandy!
  if (!isOwner) {
    return; // Complete silence - strictly prohibited from chatting in any non-owner DMs!
  }

  const chatId = `dm_${author.id}`;

  // Fetch recent conversation history so Rocket maintains 100% context understanding across turns
  const recentHistory = getRecentConversation(chatId, 8);

  // Check if recent turns had browser operations to detect follow-up browser requests
  const recentBrowserAction = recentHistory.some((m) => 
    (m.content && (
      m.content.includes('Opera GX') ||
      m.content.includes('Step ') ||
      m.content.includes('browser') ||
      m.content.includes('youtube') ||
      m.content.includes('tab') ||
      m.content.includes('play') ||
      m.content.includes('song') ||
      m.content.includes('video')
    ))
  );

  // 1. Check if Boss Sandy gave a browser control instruction in DMs (with full contextual awareness!)
  const isBrowser = browserPlanner.isBrowserInstruction(content, { hasRecentBrowserContext: recentBrowserAction });
  if (isBrowser) {
    try {
      await message.channel.sendTyping();
    } catch {}

    const progressMsg = await message.reply('🦝🐾 *adjusts goggles and taps into Opera GX* Working on it, Boss Sandy! Hold tight...').catch(() => null);

    try {
      const planResult = await browserPlanner.planAndExecute(content, {
        chatId,
        recentHistory,
        confirmed: true, // In personal DMs with Boss Sandy, owner commands carry authorization
        onStepStart(stepIdx, totalSteps, desc) {
          if (progressMsg && totalSteps > 1) {
            progressMsg.edit(`🦝🐾 Step ${stepIdx}/${totalSteps}: *${desc}*...`).catch(() => {});
          }
        },
      });

      const stepSummaries = planResult.results
        .map((r) => `• **Step ${r.step}:** ${r.description} ✅`)
        .join('\n');

      let replyText = `🦝🍕 **Mission accomplished in Opera GX, Boss Sandy!** 🐾\n\n${stepSummaries}`;

      // Check if any step had extracted content or results to share
      const readStep = planResult.results.find((r) => r.action === 'page_read' && r.result?.content);
      if (readStep) {
        replyText += `\n\n📄 **Extracted Page Highlights:**\n> ${readStep.result.content.slice(0, 450).replace(/\n+/g, ' ')}`;
      }

      const copyStep = planResult.results.find((r) => r.action === 'page_select_copy');
      if (copyStep && copyStep.result?.preview) {
        replyText += `\n\n📋 **Copied to Clipboard:** \`${copyStep.result.preview}\``;
      }

      // Persist conversation memory so follow-up commands have full context
      addConversationMessage(chatId, 'user', content, 0, 'discord_dm');
      addConversationMessage(chatId, 'assistant', replyText, 50, 'browser_link');

      if (progressMsg) {
        await progressMsg.edit(replyText.slice(0, 2000)).catch(() => message.reply(replyText.slice(0, 2000)));
      } else {
        await message.reply(replyText.slice(0, 2000));
      }
      return;
    } catch (browserErr) {
      console.warn('[Rocket Browser DM Error]:', browserErr.message);
      const errText = `🦝🐾 *scratches head and checks the antennas* Hit a snag with Opera GX, Boss Sandy:\n⚠️ \`${browserErr.message}\``;
      if (progressMsg) {
        await progressMsg.edit(errText).catch(() => message.reply(errText));
      } else {
        await message.reply(errText);
      }
      return;
    }
  }

  // 2. Check if Boss Sandy gave an administrative command in DMs
  const executed = await executeAdminActionFromChat(message, content);
  if (executed) return;

  try {
    await message.channel.sendTyping();
  } catch {}

  // Search durable memory for relevant context
  let memoryContext = '';
  try {
    const memories = searchDurableMemory(chatId, content, 3);
    if (memories && memories.length > 0) {
      memoryContext = '\nRELEVANT RECALLED MEMORIES:\n' + memories.map(m => `- [${m.topic}]: ${m.content}`).join('\n') + '\n';
    }
  } catch {}

  const directive = buildRocketDirective({
    senderName: author.globalName || author.username,
    isSandy: true,
    userRole: 'owner',
    lifeState: rocketLifeEngine.getState('discord'),
    isGroup: false,
  });

  const dmMaxTokens = 2500; // Allows up to 1000 completion tokens alongside internal reasoning tokens
  const dmReasoning = getConfig('reasoning_effort', 'medium') || 'medium';

  let response = 'Ready and standing by, Boss Sandy. What directives do we have on deck? ⚡';
  if (scaleMaxAdapter.isConfigured()) {
    try {
      const messagesPayload = [
        { 
          role: 'system', 
          content: `${directive}\n\nYou are chatting in private Discord DMs with Sandy (Boss). You have full server administrative access. Speak with fierce loyalty, warmth, high executive intelligence, and perfect memory of recent context. Avoid repetitive canned intros.${memoryContext}` 
        },
        ...recentHistory.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content },
      ];

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gpt-6-luna',
        messages: messagesPayload,
        maxTokens: dmMaxTokens,
        reasoningEffort: dmReasoning,
        temperature: 0.7,
        timeoutMs: 40000,
      });
      response = completion.choices?.[0]?.message?.content || response;
    } catch (err) {
      console.warn('[Rocket DM Completion Error]:', err.message);
      response = '⚠️ Neural stream transient timeout, Boss. Ready whenever you want to retry.';
    }
  }

  // Universal sanitization
  const scrubbedDm = scrubRestrictedBrandNames(response);
  const validatedDm = validateAndSanitizeResponse(scrubbedDm, content, { isOwner: true });
  response = validatedDm.sanitizedText || scrubbedDm;
  response = injectServerCustomEmojis(response);

  // Auto-record durable directives stated by Sandy
  const dmMemMatch = content.match(/(?:remember\s+(?:that\s+)?|note\s+(?:that\s+)?|keep\s+in\s+mind\s+(?:that\s+)?)(.+)/i);
  if (dmMemMatch) {
    addDurableMemory(chatId, 'owner_directive', 'Boss Sandy Note', dmMemMatch[1].trim());
    addUserMemory(author.id, { category: 'owner_fact', key: 'boss_directive', value: dmMemMatch[1].trim() });
  }

  // Persist both messages to database for continuous context!
  addConversationMessage(chatId, 'user', content, 0, 'discord_dm');
  addConversationMessage(chatId, 'assistant', response, 0, 'gpt-6-luna');

  await message.reply(response.slice(0, 2000)).catch(() => {});
}

/**
 * Real Administrative Action Engine for Boss Sandy directly via chat or DMs
 */
async function executeAdminActionFromChat(message, text) {
  let { guild, channel } = message;
  const isDm = !guild;
  if (!guild) {
    guild = message.client.guilds.cache.get('1567219126550663281') || message.client.guilds.cache.first();
    if (guild) {
      channel = guild.channels.cache.find((c) => c.name === 'chat') || guild.channels.cache.first();
    }
  }
  if (!guild || !channel) return false;

  const botId = message.client.user?.id;
  let cleanCmd = text.toLowerCase().trim();
  if (botId) {
    cleanCmd = cleanCmd.replace(new RegExp(`^<@!?${botId}>\\s*`, 'i'), '').trim();
  }
  // Strip common conversational prefixes so directives like "rocket kick @user" or "please ban @user" execute smoothly
  cleanCmd = cleanCmd.replace(/^(?:(?:hey\s+|yo\s+)?rocket[,:\s]+|please\s+|can\s+you\s+)+/i, '').trim();

  // 0. Blueprint Natural-Language Owner Directive (tokens, access, credits)
  const nlpExecuted = await handleNaturalLanguageAdminDirective(message, text);
  if (nlpExecuted) return true;

  // 1. YouTube Live Stream Announcement
  const ytInfo = parseYouTubeUrl(text);
  const isStreamIntent =
    ytInfo &&
    (/\b(stream|streaming|live|broadcast|stream link|yt stream|youtube stream)\b/i.test(lower) ||
      /^https?:\/\//i.test(cleanCmd));

  if (isStreamIntent) {
    try {
      let customTitle = null;
      let stripped = text
        .replace(ytInfo.url, '')
        .replace(ytInfo.liveUrl || '', '')
        .replace(/^(?:rocket[,:\s]+)?(?:here\s+is\s+my\s+stream\s+link|stream\s+link|my\s+stream\s+is\s+live|stream|live)[:\s]*/i, '')
        .trim();
      if (stripped.length > 2) {
        customTitle = stripped;
      }

      const announceResult = await broadcastStreamAnnouncement(guild, {
        url: ytInfo.liveUrl || ytInfo.url,
        title: customTitle,
        ping: '@everyone',
        authorUser: message.author,
      });

      await message.reply(injectServerCustomEmojis(
        `🔴 **LIVE STREAM BROADCAST DISPATCHED!** :rocket_hype::rocket_salute:\n\n` +
        `• **Channel:** <#${announceResult.channel.id}>\n` +
        `• **Notification:** Pinned in stream channel & broadcasted to @everyone!\n` +
        `• **Stream URL:** ${announceResult.url}\n\n` +
        `*Crush the broadcast, Boss Sandy! I'll monitor the chat and keep everyone tuned in.* 🚀⚡`
      ));
      return true;
    } catch (streamErr) {
      await message.reply(`⚠️ Could not dispatch stream broadcast: ${streamErr.message}`);
      return true;
    }
  }

  // 2. Conclude Live Stream
  if (/^(?:stream\s+ended|end\s+stream|stop\s+stream|finish\s+stream|close\s+stream)$/i.test(cleanCmd)) {
    const endRes = await endActiveStream(guild);
    if (endRes.ended) {
      await message.reply(injectServerCustomEmojis(
        `🏁 **Stream Status Concluded:** Announcement unpinned and updated in the streams channel. Fantastic stream, Boss! :rocket_salute:`
      ));
    } else {
      await message.reply(`Notice: No active stream broadcast was currently tracked.`);
    }
    return true;
  }

  // 3. Purge / Clear N messages
  const purgeMatch = cleanCmd.match(/^(?:purge|clear|clean|delete)\s+(\d+)\s*(?:messages?|msgs?)?/i);
  if (purgeMatch) {
    const count = Math.min(parseInt(purgeMatch[1], 10), 100);
    const deleted = await channel.bulkDelete(count + 1, true).catch(() => null);
    const actual = deleted ? Math.max(deleted.size - 1, 0) : count;
    const confirm = await channel.send(injectServerCustomEmojis(`🧹 **Executive Action Executed:** Swept away **${actual}** messages cleanly, Boss! :dev_terminal:`));
    setTimeout(() => confirm.delete().catch(() => {}), 4000);
    return true;
  }

  // 4. Kick user: "kick @user [reason]" or "rocket kick 123456789 reason"
  const kickMatch = cleanCmd.match(/^(?:kick|boot)\s+(?:<@!?(\d+)>|(\d{17,20}))\s*(.*)/i);
  if (kickMatch) {
    const targetId = kickMatch[1] || kickMatch[2];
    const reason = kickMatch[3]?.trim() || 'Commanded by Boss Sandy via chat';
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await message.reply(`⚠️ Member with ID \`${targetId}\` not found in this server.`);
      return true;
    }
    if (targetMember.kickable) {
      await targetMember.kick(reason).catch(() => null);
      await message.reply(injectServerCustomEmojis(`👢 **Executive Moderation:** <@${targetId}> has been kicked from the server.\n📋 **Reason:** ${reason} :rocket_salute:`));
    } else {
      await message.reply(`⚠️ Unable to kick <@${targetId}> due to Discord role hierarchy permissions.`);
    }
    return true;
  }

  // 5. Ban user: "ban @user [reason]" or "rocket ban 123456789 reason"
  const banMatch = cleanCmd.match(/^(?:ban|perma\s*ban)\s+(?:<@!?(\d+)>|(\d{17,20}))\s*(.*)/i);
  if (banMatch) {
    const targetId = banMatch[1] || banMatch[2];
    const reason = banMatch[3]?.trim() || 'Banned by Boss Sandy via chat';
    try {
      await guild.members.ban(targetId, { reason });
      await message.reply(injectServerCustomEmojis(`🔨 **Executive Moderation:** <@${targetId}> has been permanently banned from the server.\n📋 **Reason:** ${reason} :rocket_evil:🚨`));
    } catch (banErr) {
      await message.reply(`⚠️ Failed to ban <@${targetId}>: ${banErr.message}`);
    }
    return true;
  }

  // 6. Unban user: "unban @user" or "unban 123456789"
  const unbanMatch = cleanCmd.match(/^unban\s+(?:<@!?(\d+)>|(\d{17,20}))/i);
  if (unbanMatch) {
    const targetId = unbanMatch[1] || unbanMatch[2];
    try {
      await guild.members.unban(targetId, 'Unbanned by Boss Sandy via chat');
      await message.reply(injectServerCustomEmojis(`🔓 **Executive Moderation:** <@${targetId}> has been unbanned from the server, Boss!`));
    } catch (unbanErr) {
      await message.reply(`⚠️ Could not unban \`${targetId}\`: ${unbanErr.message}`);
    }
    return true;
  }

  // 7. Timeout / Mute user: "timeout @user 10m [reason]" or "mute @user 1h"
  const muteMatch = cleanCmd.match(/^(?:timeout|mute)\s+(?:<@!?(\d+)>|(\d{17,20}))(?:\s+(?:for\s+)?(\d+)([mhsd]))?\s*(.*)/i);
  if (muteMatch) {
    const targetId = muteMatch[1] || muteMatch[2];
    const qty = parseInt(muteMatch[3] || '10', 10);
    const unit = muteMatch[4] || 'm';
    const reason = muteMatch[5]?.trim() || 'Timed out by Boss Sandy';
    let ms = qty * 60 * 1000;
    if (unit === 'h') ms = qty * 60 * 60 * 1000;
    if (unit === 'd') ms = qty * 24 * 60 * 60 * 1000;
    if (unit === 's') ms = qty * 1000;

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await message.reply(`⚠️ Member \`${targetId}\` not found in this server.`);
      return true;
    }
    if (targetMember.moderatable) {
      await targetMember.timeout(ms, reason).catch(() => null);
      await message.reply(injectServerCustomEmojis(`⏱️ **Executive Moderation:** <@${targetId}> has been timed out for **${qty}${unit}**.\n📋 **Reason:** ${reason} :rocket_salute:`));
    } else {
      await message.reply(`⚠️ Role hierarchy prevents timing out <@${targetId}>.`);
    }
    return true;
  }

  // 8. Untimeout / Unmute user
  const unmuteMatch = cleanCmd.match(/^(?:unmute|untimeout)\s+(?:<@!?(\d+)>|(\d{17,20}))/i);
  if (unmuteMatch) {
    const targetId = unmuteMatch[1] || unmuteMatch[2];
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (targetMember && targetMember.moderatable) {
      await targetMember.timeout(null, 'Timeout removed by Boss Sandy').catch(() => null);
      await message.reply(injectServerCustomEmojis(`🔊 **Executive Moderation:** Timeout removed from <@${targetId}>. Full access restored, Boss!`));
      return true;
    }
  }

  // 9. Role Management: "give role @user VIP" or "add role @user VIP"
  const addRoleMatch = cleanCmd.match(/^(?:give|add|assign)\s+role\s+(?:<@!?(\d+)>|(\d{17,20}))\s+(?:to\s+)?(.+)/i) ||
    cleanCmd.match(/^role\s+(?:<@!?(\d+)>|(\d{17,20}))\s+add\s+(.+)/i);
  if (addRoleMatch) {
    const targetId = addRoleMatch[1] || addRoleMatch[2];
    const roleQuery = addRoleMatch[3]?.trim();
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await message.reply(`⚠️ Member \`${targetId}\` not found in server.`);
      return true;
    }
    const role = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === roleQuery.toLowerCase() || r.id === roleQuery.replace(/[<@&>]/g, '')
    );
    if (!role) {
      await message.reply(`⚠️ Role \`${roleQuery}\` not found on this server.`);
      return true;
    }
    try {
      await targetMember.roles.add(role);
      await message.reply(injectServerCustomEmojis(`🎖️ **Executive Role Granted:** Added **${role.name}** to <@${targetId}>, Boss! :rocket_salute:`));
    } catch (rErr) {
      await message.reply(`⚠️ Failed to assign role: ${rErr.message}`);
    }
    return true;
  }

  // 10. Role Removal: "remove role @user VIP" or "take role @user VIP"
  const removeRoleMatch = cleanCmd.match(/^(?:remove|take)\s+role\s+(?:<@!?(\d+)>|(\d{17,20}))\s+(?:from\s+)?(.+)/i) ||
    cleanCmd.match(/^role\s+(?:<@!?(\d+)>|(\d{17,20}))\s+remove\s+(.+)/i);
  if (removeRoleMatch) {
    const targetId = removeRoleMatch[1] || removeRoleMatch[2];
    const roleQuery = removeRoleMatch[3]?.trim();
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await message.reply(`⚠️ Member \`${targetId}\` not found in server.`);
      return true;
    }
    const role = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === roleQuery.toLowerCase() || r.id === roleQuery.replace(/[<@&>]/g, '')
    );
    if (!role) {
      await message.reply(`⚠️ Role \`${roleQuery}\` not found on this server.`);
      return true;
    }
    try {
      await targetMember.roles.remove(role);
      await message.reply(injectServerCustomEmojis(`🛡️ **Executive Role Removed:** Stripped **${role.name}** from <@${targetId}>, Boss!`));
    } catch (rErr) {
      await message.reply(`⚠️ Failed to remove role: ${rErr.message}`);
    }
    return true;
  }

  // 11. Nickname: "nickname @user NewName" or "nick @user NewName"
  const nickMatch = cleanCmd.match(/^(?:nick|nickname|rename\s+user)\s+(?:<@!?(\d+)>|(\d{17,20}))\s+(.+)/i);
  if (nickMatch) {
    const targetId = nickMatch[1] || nickMatch[2];
    const newNick = nickMatch[3]?.trim();
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (targetMember) {
      try {
        await targetMember.setNickname(newNick);
        await message.reply(`✏️ **Nickname Updated:** Set nickname of <@${targetId}> to **${newNick}**, Boss!`);
      } catch (nickErr) {
        await message.reply(`⚠️ Failed to update nickname: ${nickErr.message}`);
      }
      return true;
    }
  }

  // 12. Pin Message: Reply to a message and say "pin" or "pin this"
  if (/^(?:pin|pin\s+this|pin\s+message)$/i.test(cleanCmd)) {
    if (message.reference?.messageId) {
      const refMsg = await channel.messages.fetch(message.reference.messageId).catch(() => null);
      if (refMsg) {
        await refMsg.pin().catch(() => null);
        await message.reply(`📌 **Message Pinned** by executive command, Boss!`);
        return true;
      }
    }
  }

  // 13. Channel Rename: "rename channel [newName]"
  const renameChMatch = cleanCmd.match(/^rename\s+channel\s+(?:to\s+)?(.+)/i);
  if (renameChMatch) {
    const newName = renameChMatch[1].trim().replace(/\s+/g, '-').toLowerCase();
    await channel.setName(newName).catch(() => null);
    await message.reply(`🏷️ **Channel Renamed:** Updated to **#${newName}**, Boss!`);
    return true;
  }

  // 14. Channel Topic: "set channel topic [topic]"
  const topicMatch = cleanCmd.match(/^set\s+channel\s+topic\s+(?:to\s+)?(.+)/i);
  if (topicMatch) {
    const newTopic = topicMatch[1].trim();
    await channel.setTopic(newTopic).catch(() => null);
    await message.reply(`📝 **Channel Topic Updated:** \`${newTopic}\``);
    return true;
  }

  // 15. Lock channel
  if (/^(?:lock|lockdown|lock\s+channel)$/i.test(cleanCmd)) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => null);
    await message.reply(injectServerCustomEmojis('🔒 **Channel Lockdown:** Channel locked. Non-staff member posting disabled, Boss! :rocket_boss:'));
    return true;
  }

  // 16. Unlock channel
  if (/^(?:unlock|unlock\s+channel)$/i.test(cleanCmd)) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
    await message.reply(injectServerCustomEmojis('🔓 **Channel Restored:** Lockdown lifted. Public chatting resumed, Boss! :rocket_salute:'));
    return true;
  }

  // 17. Slowmode
  const slowMatch = cleanCmd.match(/^slowmode\s+(off|\d+s?|\d+m?)/i);
  if (slowMatch) {
    let seconds = 0;
    const val = slowMatch[1].toLowerCase();
    if (val !== 'off') {
      if (val.endsWith('m')) seconds = parseInt(val, 10) * 60;
      else seconds = parseInt(val.replace('s', ''), 10) || 5;
    }
    await channel.setRateLimitPerUser(seconds).catch(() => null);
    await message.reply(injectServerCustomEmojis(seconds > 0 ? `⏳ **Slowmode Configured:** Rate limit set to **${seconds}s**, Boss! :rocket_salute:` : '⚡ **Slowmode Disabled:** Full speed ahead, Boss! :rocket_hype:'));
    return true;
  }

  // 18. AI-Powered Announcement Directive: "rocket announce ai: [topic]"
  const aiAnnounceMatch = text.match(/^(?:announce\s+ai|ai\s+announcement|broadcast\s+ai)[:\s]+([\s\S]+)/i);
  if (aiAnnounceMatch) {
    const rawInput = aiAnnounceMatch[1].trim();
    if (!rawInput) {
      await message.reply('🦝 Please provide a topic for the AI announcement! Example: `rocket announce ai: Major platform update coming tonight!`');
      return true;
    }

    let ping = 'none';
    let cleanPrompt = rawInput;
    if (/@everyone\b/i.test(rawInput)) {
      ping = '@everyone';
      cleanPrompt = cleanPrompt.replace(/@everyone\b/gi, '').trim();
    } else if (/@here\b/i.test(rawInput)) {
      ping = '@here';
      cleanPrompt = cleanPrompt.replace(/@here\b/gi, '').trim();
    }

    const typingMsg = await message.reply('🤖 *Rocket cognitive core generating executive broadcast announcement...* ⚡');
    try {
      const { title, body } = await generateAiAnnouncement({
        topic: cleanPrompt,
        ping,
      });

      const { channel: annCh, message: sentMsg } = await directBroadcastAnnouncement({
        guild,
        client: message.client,
        title,
        body,
        ping,
        authorUser: message.author,
      });

      await typingMsg.edit(injectServerCustomEmojis(`📢 **Executive Announcement Live!** Broadcast dispatched in <#${annCh.id}>! :rocket_salute:\n\n**Title:** ${title}\n🔗 **Direct Link:** ${sentMsg.url}`));
    } catch (err) {
      await typingMsg.edit(`⚠️ Failed to broadcast announcement: ${err.message}`);
    }
    return true;
  }

  // 19. Custom Announcement Directive: "rocket announce: [message]"
  const customAnnounceMatch = text.match(/^(?:announce|broadcast|send\s+announcement)[:\s]+([\s\S]+)/i);
  if (customAnnounceMatch) {
    const rawContent = customAnnounceMatch[1].trim();
    if (!rawContent) {
      await message.reply('🦝 Please provide the announcement text! Example: `rocket announce: Server maintenance complete!`');
      return true;
    }

    let ping = 'none';
    let cleanContent = rawContent;
    if (/@everyone\b/i.test(rawContent)) {
      ping = '@everyone';
      cleanContent = cleanContent.replace(/@everyone\b/gi, '').trim();
    } else if (/@here\b/i.test(rawContent)) {
      ping = '@here';
      cleanContent = cleanContent.replace(/@here\b/gi, '').trim();
    }

    let title = '🚀 OFFICIAL SERVER ANNOUNCEMENT';
    let body = cleanContent;
    const lines = cleanContent.split('\n');
    if (lines.length > 1 && lines[0].length < 100) {
      title = lines[0].replace(/^#+\s*/, '').trim();
      body = lines.slice(1).join('\n').trim();
    }

    try {
      const { channel: annCh, message: sentMsg } = await directBroadcastAnnouncement({
        guild,
        client: message.client,
        title,
        body,
        ping,
        authorUser: message.author,
      });

      await message.reply(injectServerCustomEmojis(`📢 **Announcement Dispatched!** Live in <#${annCh.id}>! :rocket_salute:\n🔗 **Direct Link:** ${sentMsg.url}`));
    } catch (err) {
      await message.reply(`⚠️ Failed to broadcast announcement: ${err.message}`);
    }
    return true;
  }

  // 20. Open Announcement Hub: "rocket send announcement"
  if (/^(?:tell\s+rocket\s+to\s+)?(?:send\s+an?|dispatch\s+an?|make\s+an?|open)?\s*announcements?\s*(?:hub|studio|launcher)?$/i.test(cleanCmd)) {
    if (isDm) {
      const payload = buildAnnouncementStudioPayload();
      await message.reply({
        embeds: payload.embeds,
        components: payload.components,
      });
    } else {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_open_announcement_hub')
          .setLabel('📢 Dispatch Announcement (Rocket Owners)')
          .setEmoji('📢')
          .setStyle(ButtonStyle.Success)
      );
      await message.reply({
        content: '📢 **Rocket Announcement Studio:** Click below to open your announcement creator *(Visible only to you)*:',
        components: [row],
      });
    }
    return true;
  }

  return false;
}

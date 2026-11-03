/**
 * 🦝 ROCKET AI — DISCORD MESSAGE CREATE EVENT HANDLER
 * 
 * Handles:
 * 1. 24/7 Auto-Mod & Security Guard (Anti-Spam, Anti-Invite, Anti-Raid)
 * 2. Fierce Defense of Sandy (Nero Aurelius)
 * 3. Conversational AI with Raccoon Persona & Server Knowledge
 */

import { ChannelType, PermissionsBitField, EmbedBuilder } from 'discord.js';
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
import { rocketLifeEngine } from '../../rocket/lifeEngine.js';
import { detectSandyAbuse, generateDefenseResponse, buildRocketDirective } from '../../rocket/persona.js';
import { isSandy } from '../../rocket/rbac.js';
import { scaleMaxAdapter } from '../../provider/scaleMaxAdapter.js';
import { isDiscordOwner } from '../commandHandlers.js';
import { trackIncomingMessage } from '../evidenceArchive.js';
import { scrubRestrictedBrandNames, validateAndSanitizeResponse } from '../../conversation/responseValidator.js';

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
  // 1. Defend Sandy (Supreme Boss Protection)
  // -------------------------------------------------------------------------
  if (!isOwner && detectSandyAbuse(content)) {
    try {
      const defense = generateDefenseResponse(member?.displayName || author.username);
      await message.reply(defense);
      addWarning(guild.id, author.id, author.tag, 'system', 'Rocket Security Guard', 'Hostility / abuse towards Sandy');
      recordModLog(guild.id, {
        action: 'warn',
        userId: author.id,
        userTag: author.tag,
        moderatorId: 'system',
        moderatorTag: 'Rocket Defense Guard',
        reason: 'Attempted abuse towards Sandy (Boss)',
        details: content.slice(0, 100),
      });
      return;
    } catch (e) {
      console.warn('[Rocket Defense Guard Error]:', e.message);
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
      const generalChannel = guild.channels.cache.find((c) => c.name === 'general');
      if (generalChannel && generalChannel.isTextBased()) {
        const rankEmbed = new EmbedBuilder()
          .setColor(0x00e5ff)
          .setTitle('⚡ WWE CHAMPIONSHIP RANK ASCENSION!')
          .setDescription(
            `🎉 Congratulations <@${author.id}>! You have ascended from **${xpResult.oldRank}** to **${xpResult.newRank}** (\`${xpResult.rankInfo.title}\`)!\n\n` +
            `• **New Multiplier Boost:** \`${xpResult.rankInfo.multiplier}x\`\n` +
            `• **Total XP:** \`${Number(xpResult.totalXp).toLocaleString()} XP\`\n\n` +
            `*Use \`/info\` to view your shiny new WWE statistics card!* 🏆`
          )
          .setFooter({ text: 'Rocket AI • WWE Championship Division 🦝' });
        generalChannel.send({ embeds: [rankEmbed] }).catch(() => null);
      }
    }
  } catch (actErr) {
    console.warn('[Activity Tracker Error]:', actErr.message);
  }

  // -------------------------------------------------------------------------
  // 3. Channel-Aware Conversational AI with Rocket Persona & Registry
  // -------------------------------------------------------------------------
  const isDirectMention = message.mentions.has(message.client.user.id);
  const isReplyToRocket = message.reference && message.reference.messageId
    ? (await channel.messages.fetch(message.reference.messageId).catch(() => null))?.author.id === message.client.user.id
    : false;
  const isRocketCalledByName = /\b(rocket|rocky|rakoon|raccoon)\b/i.test(content);
  const isChatChannel = /^(chat|general|general-ai|chit-chat|lounge|bot|ai)/i.test(channel.name);

  // Dedicated Intelligence Center channels (Research, Study, Study-Mode, Media, Downloading)
  const isSpecialistChannel = channelConfig && ['research', 'study', 'study_mode', 'media', 'downloading'].includes(channelConfig.ai_behavior_profile);

  // ALWAYS ACTIVE: Constant talk in #chat, #general, bot channels, and specialist channels!
  const isConstantTalk = settings.chat_mode === 'constant' || isChatChannel || (settings.chat_channel_id && settings.chat_channel_id === channel.id);

  let shouldRespond = false;
  if (isDirectMention || isReplyToRocket) {
    shouldRespond = true;
  } else if (!content.startsWith('!') && !content.startsWith('/')) {
    if (settings.chat_mode !== 'dimension_only') {
      if (isChatChannel || isConstantTalk || isRocketCalledByName) {
        shouldRespond = true;
      } else if (isSpecialistChannel && content.length > 3) {
        shouldRespond = true;
      }
    }
  }

  if (shouldRespond) {
    await handleRocketChat(message, { isOwner, isConstantTalk, channelConfig });
  }
}

/**
 * Handle Conversational AI interaction
 */
async function handleRocketChat(message, { isOwner, isConstantTalk = false, channelConfig = null }) {
  const { guild, channel, author, member, content } = message;

  // Clean prompt text
  let cleanedText = content.replace(/<@!?\d+>/g, '').trim();
  cleanedText = cleanedText.replace(/^(rocket|rocky|hey rocket|yo rocket)[,\s:]*/i, '').trim();

  if (!cleanedText && !isConstantTalk) {
    return message.reply('🦝 *peeks out from behind a pizza box with bright eyes* Haan Boss / Friend! You rang? What do you need? 🍕🐾');
  }

  try {
    await channel.sendTyping();
  } catch {}

  // Fetch recent conversation history so Rocket understands context
  let recentChatStream = '';
  try {
    const history = await channel.messages.fetch({ limit: 6 });
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

  const directive = buildRocketDirective({
    senderName: member?.displayName || author.username,
    isSandy: isOwner,
    userRole: userTier,
    lifeState,
    isGroup: true,
    groupTitle: guild.name,
    groupId: guild.id,
    recentChat: recentChatStream || null,
  });

  // Channel-aware profile directives
  const channelProfileKey = channelConfig?.ai_behavior_profile || 'chat';
  const channelPrompt = getBehaviorProfilePrompt(channelProfileKey, channel.name);

  // Model router integration: select optimal reasoning level and token budgeting
  let routingCategory = 'chat';
  let maxOutputTokens = 500;
  let reasoningEffort = 'none';

  if (channelProfileKey === 'research') {
    routingCategory = 'research';
    maxOutputTokens = 1500; // Deep analysis allowance
    reasoningEffort = 'high';
  } else if (channelProfileKey === 'media') {
    routingCategory = 'media';
    maxOutputTokens = 600;
  } else if (channelProfileKey === 'study') {
    maxOutputTokens = 450; // Optimized for fast response & low token usage
  } else if (channelProfileKey === 'study_mode') {
    maxOutputTokens = 500;
  }

  const agentRouting = getAgentRouting(routingCategory);
  const activeModel = agentRouting.model || 'gpt-6-luna';

  const fullSystemPrompt =
    `${directive}\n\n` +
    `CHANNEL CONTEXT & DIRECTIVES:\n` +
    `${channelPrompt}\n\n` +
    `MEMBER STANDING:\n` +
    `- Sender: "${member?.displayName || author.username}"\n` +
    `- Designated Tier: ${userTier.toUpperCase()} (Note: family gets warmth, friends get banter, team/employees get high-productivity coordination, Sandy/Nero is supreme Boss!)\n\n` +
    `${serverContext}\n` +
    `DISCORD INSTRUCTIONS:\n` +
    `- You are chatting on Discord in #${channel.name}!\n` +
    `${isConstantTalk ? '- CONSTANT TALK MODE IS ON: Converse naturally with the group on this message! Act like an active real friend/member in the chat.\n' : ''}` +
    `- Use raccoon emojis naturally: 🦝 🐾 🍕 🌮 ⚡ 😈.`;

  let response = '🦝 *scratches ears and adjusts bandana* Yo! Rocket is tuning the neural antennas. Ask me that one more time! 🍕🐾';
  if (scaleMaxAdapter.isConfigured()) {
    try {
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages: [
          { role: 'system', content: fullSystemPrompt },
          { role: 'user', content: cleanedText },
        ],
        maxTokens: maxOutputTokens,
        reasoningEffort: reasoningEffort !== 'none' ? reasoningEffort : undefined,
        timeoutMs: 40000,
      });

      response = completion.choices?.[0]?.message?.content || response;
    } catch (err) {
      console.warn('[Rocket Discord AI Error]:', err.message);
      response = '🦝🐾 *tail puffs* Whoa, neural flux glitch! Toss me another pizza slice and hit me with that again! 🍕';
    }
  }

  // Universal sanitization & zero provider leakage guarantee
  const scrubbed = scrubRestrictedBrandNames(response);
  const validated = validateAndSanitizeResponse(scrubbed, cleanedText, { isOwner });
  response = validated.sanitizedText || scrubbed;

  try {
    if (response.length > 2000) {
      // Split into Discord-friendly chunks
      for (let i = 0; i < response.length; i += 1900) {
        await message.reply(response.slice(i, i + 1900));
      }
    } else {
      await message.reply(response);
    }
  } catch (replyErr) {
    console.error('[Rocket Discord Reply Error]:', replyErr.message);
  }
}

/**
 * Handle Direct Messages to Rocket
 */
async function handleDirectMessage(message) {
  const { author, content } = message;
  const isOwner = isDiscordOwner(author);

  // STRICT PRIVACY: Only Sandy (Boss) can talk normally with Rocket in DMs!
  if (!isOwner) {
    return message.reply(
      '🔒 **Direct Messages Restricted:**\n' +
      'Rocket DMs are exclusively reserved for **Sandy (Owner)**. Normal conversational chat is disabled here.\n\n' +
      '• To chat with Rocket, head over to the server community in <#chat> or any channel!\n' +
      '• Need help or support? Open a confidential support ticket in the server `#help` channel. 🐾🔒'
    ).catch(() => {});
  }

  try {
    await message.channel.sendTyping();
  } catch {}

  const directive = buildRocketDirective({
    senderName: author.globalName || author.username,
    isSandy: true,
    userRole: 'owner',
    lifeState: rocketLifeEngine.getState('discord'),
    isGroup: false,
  });

  let response = '🦝 *whispers from the shadows* Haan Boss! Rocket here in DMs. What\'s the mission? 🐾🍕';
  if (scaleMaxAdapter.isConfigured()) {
    try {
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gpt-6-luna',
        messages: [
          { role: 'system', content: `${directive}\n\nYou are chatting in private Discord DMs with Sandy (Boss). Speak in character as Rocket.` },
          { role: 'user', content },
        ],
        maxTokens: 500,
        timeoutMs: 30000,
      });
      response = completion.choices?.[0]?.message?.content || response;
    } catch (err) {
      response = '🦝 *scratches head* Neural core glitch! Ask me again in a sec, Boss! 🍕';
    }
  }

  // Universal sanitization
  const scrubbedDm = scrubRestrictedBrandNames(response);
  const validatedDm = validateAndSanitizeResponse(scrubbedDm, content, { isOwner: true });
  response = validatedDm.sanitizedText || scrubbedDm;

  await message.reply(response.slice(0, 2000)).catch(() => {});
}

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
import { detectSandyAbuse, detectSelfHarmOrSevereThreat, generateDefenseResponse, buildRocketDirective } from '../../rocket/persona.js';
import { isSandy } from '../../rocket/rbac.js';
import { scaleMaxAdapter } from '../../provider/scaleMaxAdapter.js';
import { isDiscordOwner } from '../commandHandlers.js';
import { trackIncomingMessage } from '../evidenceArchive.js';
import { scrubRestrictedBrandNames, validateAndSanitizeResponse } from '../../conversation/responseValidator.js';
import { syncMemberWWERankRole } from '../verification.js';

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
  // 1. Defend Sandy (Supreme Boss Protection — Instant 1-Hour Timeout & Deletion)
  // -------------------------------------------------------------------------
  if (!isOwner && detectSandyAbuse(content)) {
    try {
      await message.delete().catch(() => null);

      let timeoutApplied = false;
      if (member && member.moderatable) {
        try {
          await member.timeout(60 * 60 * 1000, 'Zero tolerance: Hostility/disrespect towards Sandy (Owner)');
          timeoutApplied = true;
        } catch (tmErr) {
          console.warn('[Boss Protection Timeout Error]:', tmErr.message);
        }
      }

      const defense = generateDefenseResponse(member?.displayName || author.username);
      const actionNotice = timeoutApplied
        ? `\n\n🚨 **ENFORCEMENT:** <@${author.id}> has been placed in a **1-HOUR TIMEOUT** for disrespecting Boss Sandy! 🐾`
        : `\n\n🚨 **ENFORCEMENT:** Message purged and official warning recorded. Disrespect is strictly forbidden! 🐾`;

      await channel.send(`${defense}${actionNotice}`);
      addWarning(guild.id, author.id, author.tag, 'system', 'Rocket Defense Guard', 'Hostility / disrespect towards Sandy (Owner)');
      recordModLog(guild.id, {
        action: timeoutApplied ? 'timeout_1h' : 'warn',
        userId: author.id,
        userTag: author.tag,
        moderatorId: 'system',
        moderatorTag: 'Rocket Defense Guard',
        reason: 'Zero tolerance: Hostility / disrespect towards Sandy (Owner)',
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
  // 3. Channel-Aware Conversational AI (Strict Channels, 2 Modes & Mute)
  // -------------------------------------------------------------------------

  // 3.0 Mute Check: If bot is muted, remain completely silent!
  if (settings.is_muted) {
    return;
  }

  // 3.1 Exclusive Rocket Access Role Check
  // ONLY Boss Sandy or members with the 'Rocket Access' role can text or talk with Rocket!
  const hasRocketRole =
    isOwner ||
    (member &&
      member.roles.cache.some(
        (r) => r.name.toLowerCase() === 'rocket access' || r.name.toLowerCase() === 'rocket'
      ));

  // 3.2 Channel Talking Rules
  const channelNameClean = channel.name.toLowerCase();
  const isNeuralChatChannel = channelNameClean === 'chat';
  const isPermittedChannel = isNeuralChatChannel ||
                             channelNameClean === 'general' ||
                             channelNameClean === 'coding-chat' ||
                             channelNameClean === 'web-dev' ||
                             channelNameClean === 'gaming-hub' ||
                             channelNameClean === 'ai-tools' ||
                             channelNameClean === 'help-desk' ||
                             channelNameClean === 'help' ||
                             (settings.chat_channel_id && settings.chat_channel_id === channel.id);

  const isDirectMention = message.mentions.has(message.client.user.id);
  const isReplyToRocket = message.reference && message.reference.messageId
    ? (await channel.messages.fetch(message.reference.messageId).catch(() => null))?.author.id === message.client.user.id
    : false;

  // If directly @mentioned or replied to: ONLY members with Rocket Access or Sandy can chat!
  if (isDirectMention || isReplyToRocket) {
    if (!hasRocketRole) {
      await message.reply('⛔ **Exclusive Access Only:** You need the **@Rocket Access** role to text or talk with Rocket AI! 🐾🔒').catch(() => null);
      return;
    }
    await handleRocketChat(message, { isOwner, isConstantTalk: false, channelConfig });
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
  // In #chat (Neural Hub): Rocket ALWAYS chats with Sandy & Rocket Operators without needing an @mention!
  // In other permitted channels: respond if activeChatMode is constant/active or isOwner
  const activeChatMode = settings.chat_mode || 'active';
  const isConstantMode = activeChatMode === 'constant' || activeChatMode === 'active';
  let shouldRespond = false;

  if (!content.startsWith('!') && !content.startsWith('/')) {
    if (isNeuralChatChannel || isConstantMode || isOwner) {
      shouldRespond = true;
    }
  }

  if (shouldRespond) {
    await handleRocketChat(message, { isOwner, isConstantTalk: isConstantMode, channelConfig });
  }
}

/**
 * Handle Conversational AI interaction
 */
async function handleRocketChat(message, { isOwner, isConstantTalk = false, channelConfig = null }) {
  const { guild, channel, author, member, content } = message;
  const senderDisplayName = member?.displayName || author.username;

  // Clean prompt text
  let cleanedText = content.replace(/<@!?\d+>/g, '').trim();
  cleanedText = cleanedText.replace(/^(rocket|rocky|hey rocket|yo rocket)[,\s:]*/i, '').trim();

  if (!cleanedText && !isConstantTalk) {
    const greeting = isOwner
      ? '🦝 *peeks out from behind a pizza box* Haan Boss Sandy! You rang? What do you need? 🍕🐾'
      : `🦝 *peeks out from behind a pizza box* Hey ${senderDisplayName}! You rang? What do you need? 🍕🐾`;
    return message.reply(greeting);
  }

  // Real Administrative Action Engine for Boss Sandy & Rocket Operators
  if (hasRocketRole) {
    const executed = await executeAdminActionFromChat(message, cleanedText);
    if (executed) return;
  }

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
  });

  // Channel-aware profile directives
  const channelProfileKey = channelConfig?.ai_behavior_profile || 'chat';
  const channelPrompt = getBehaviorProfilePrompt(channelProfileKey, channel.name);

  // Model router integration: High-IQ witty companion with fast, smart responses
  let routingCategory = 'chat';
  let maxOutputTokens = 1200;
  let reasoningEffort = 'low';

  const agentRouting = getAgentRouting(routingCategory);
  const activeModel = agentRouting.model || 'gpt-6-luna';

  const fullSystemPrompt =
    `${directive}\n\n` +
    `SMART COMPANION & INTELLECT DIRECTIVES:\n` +
    `- You are an ultra-smart, witty raccoon created by Sandy under Nero Labs.\n` +
    `- You have elite knowledge in Coding, Web Development, and Gaming.\n` +
    `- NEVER sound dumb, slow, or corporate! Never output sterile disclaimers like "I'm just an AI" or "I am not infallible".\n` +
    `- Speak with high intelligence, razor-sharp wits, practical solutions, and raccoon swagger! 🦝⚡\n\n` +
    `CHANNEL CONTEXT & DIRECTIVES:\n` +
    `${channelPrompt}\n\n` +
    `MEMBER STANDING & CRITICAL ADDRESSING RULES:\n` +
    `- Sender: "${senderDisplayName}"\n` +
    `- Designated Tier: ${userTier.toUpperCase()}\n` +
    `- ONLY SANDY IS BOSS: ${isOwner ? 'This user is Boss Sandy (Nero Aurelius). Treat with absolute allegiance.' : `This user is ${senderDisplayName}. Address them as "${senderDisplayName}".`}\n\n` +
    `${serverContext}\n` +
    `DISCORD INSTRUCTIONS:\n` +
    `- You are chatting on Discord in #${channel.name}!\n` +
    `${isConstantTalk ? '- Act as an active, engaging member in this channel.\n' : ''}` +
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
        reasoningEffort: reasoningEffort,
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

  // Check if Boss Sandy gave an administrative command in DMs
  const executed = await executeAdminActionFromChat(message, content);
  if (executed) return;

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
          { role: 'system', content: `${directive}\n\nYou are chatting in private Discord DMs with Sandy (Boss). You have full reasoning power and full server administrative access. Speak with fierce loyalty, warmth, and high intelligence.` },
          { role: 'user', content },
        ],
        maxTokens: 2500,
        reasoningEffort: 'high',
        timeoutMs: 40000,
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

  const lower = text.toLowerCase().trim();

  // 1. Purge / Clear N messages
  const purgeMatch = lower.match(/^(?:purge|clear|clean|delete)\s+(\d+)\s*(?:messages?|msgs?)?/i);
  if (purgeMatch) {
    const count = Math.min(parseInt(purgeMatch[1], 10), 100);
    const deleted = await channel.bulkDelete(count + 1, true).catch(() => null);
    const actual = deleted ? Math.max(deleted.size - 1, 0) : count;
    const confirm = await channel.send(`🧹 *tail wags* Done Boss! Swept away **${actual}** messages cleanly! 🐾🍕`);
    setTimeout(() => confirm.delete().catch(() => {}), 4000);
    return true;
  }

  // 2. Lock channel
  if (/^(?:lock|lockdown|lock\s+channel)$/i.test(lower)) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => null);
    await message.reply('🔒 *clangs padlock shut* Channel locked down, Boss! Nobody can speak except you and staff. 🐾');
    return true;
  }

  // 3. Unlock channel
  if (/^(?:unlock|unlock\s+channel)$/i.test(lower)) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
    await message.reply('🔓 *turns brass key* Channel unlocked and open for chatting, Boss! 🍕✨');
    return true;
  }

  // 4. Slowmode
  const slowMatch = lower.match(/^slowmode\s+(off|\d+s?|\d+m?)/i);
  if (slowMatch) {
    let seconds = 0;
    const val = slowMatch[1].toLowerCase();
    if (val !== 'off') {
      if (val.endsWith('m')) seconds = parseInt(val, 10) * 60;
      else seconds = parseInt(val.replace('s', ''), 10) || 5;
    }
    await channel.setRateLimitPerUser(seconds).catch(() => null);
    await message.reply(seconds > 0 ? `⏳ Slowmode set to **${seconds}s**, Boss! 🐾` : '⚡ Slowmode disabled, full speed ahead, Boss! 🍕');
    return true;
  }

  // 5. Timeout user
  const timeoutMatch = lower.match(/^timeout\s+<@!?(\d+)>\s*(?:for\s*)?(\d+)?([mhsd])?/i);
  if (timeoutMatch) {
    const targetId = timeoutMatch[1];
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (targetMember && targetMember.moderatable) {
      const qty = parseInt(timeoutMatch[2] || '10', 10);
      const unit = timeoutMatch[3] || 'm';
      let ms = qty * 60 * 1000;
      if (unit === 'h') ms = qty * 60 * 60 * 1000;
      if (unit === 'd') ms = qty * 24 * 60 * 60 * 1000;
      if (unit === 's') ms = qty * 1000;
      await targetMember.timeout(ms, 'Timed out by Boss Sandy via chat').catch(() => null);
      await message.reply(`⏱️ *paws down gavel* <@${targetId}> has been timed out for **${qty}${unit}** on your command, Boss! 🐾🚨`);
      return true;
    }
  }

  // 6. Kick user
  const kickMatch = lower.match(/^kick\s+<@!?(\d+)>/i);
  if (kickMatch) {
    const targetId = kickMatch[1];
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (targetMember && targetMember.kickable) {
      await targetMember.kick('Kicked by Boss Sandy via chat').catch(() => null);
      await message.reply(`👢 *delivers raccoon kick* <@${targetId}> has been kicked from the server, Boss! 🐾`);
      return true;
    }
  }

  // 7. Ban user
  const banMatch = lower.match(/^ban\s+<@!?(\d+)>/i);
  if (banMatch) {
    const targetId = banMatch[1];
    await guild.members.ban(targetId, { reason: 'Banned by Boss Sandy via chat' }).catch(() => null);
    await message.reply(`🔨 *swings the ban hammer* <@${targetId}> has been permanently banned, Boss! 🐾🚨`);
    return true;
  }

  return false;
}

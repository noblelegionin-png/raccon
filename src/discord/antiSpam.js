/**
 * 🦝 ROCKET AI — SMART ANTI-SPAM & TIMEOUT PROTECTION ENGINE
 * 
 * Implements:
 * - 7 identical messages in 30 seconds sliding window
 * - Case-insensitive & whitespace normalization
 * - 30-minute native Discord communication timeout
 * - Audit logging in #audit-logs
 * - Apology/Warning DM with interactive un-timeout buttons:
 *   [ I WON'T DO IT AGAIN ] & [ KEEP MY COOLDOWN ]
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import {
  createSpamIncident,
  getSpamIncident,
  resolveSpamIncident,
  getGuildSettings,
} from './discordDb.js';

const SPAM_THRESHOLD = 7; // 7 identical messages
const SPAM_WINDOW_MS = 30 * 1000; // 30 seconds
const TIMEOUT_MINUTES = 30; // 30 minute timeout

const DANGER_COLOR = 0xe74c3c;
const SUCCESS_COLOR = 0x2ecc71;
const WARN_COLOR = 0xf39c12;

// Map: userId -> Array of { normText, timestamp }
const userSpamHistory = new Map();

/**
 * Normalize message content for duplicate detection
 */
function normalizeContent(message) {
  const text = (message.content || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (text.length > 0) return text;
  if (message.attachments && message.attachments.size > 0) {
    const urls = message.attachments.map((a) => a.url).sort().join(',');
    return `[attachment:${urls}]`;
  }
  return '';
}

/**
 * Check and process incoming message for smart duplicate spam
 * Returns true if message was spam and handled (caller should halt processing)
 */
export async function checkSmartAntiSpam(message) {
  const { guild, channel, author, member } = message;
  if (!guild || !member) return false;

  const norm = normalizeContent(message);
  if (!norm) return false;

  const now = Date.now();
  let history = userSpamHistory.get(author.id) || [];

  // Filter messages older than the sliding window
  history = history.filter((entry) => now - entry.timestamp < SPAM_WINDOW_MS);
  history.push({ normText: norm, timestamp: now });
  userSpamHistory.set(author.id, history);

  // Count identical repetitions within the window
  const duplicateCount = history.filter((entry) => entry.normText === norm).length;

  if (duplicateCount >= SPAM_THRESHOLD) {
    // Clear user history so it doesn't trigger multiple times in the same burst
    userSpamHistory.delete(author.id);

    try {
      // 1. Delete the triggering spam message
      await message.delete().catch(() => null);

      // 2. Apply 30-minute communication timeout
      const timeoutMs = TIMEOUT_MINUTES * 60 * 1000;
      await member.timeout(timeoutMs, `Smart Anti-Spam: ${SPAM_THRESHOLD} duplicate messages in 30s`).catch((err) => {
        console.warn(`[AntiSpam] Failed to timeout member ${author.tag}:`, err.message);
      });

      // 3. Record in SQLite database
      const incident = createSpamIncident(
        guild.id,
        author.id,
        author.tag,
        message.content || norm,
        TIMEOUT_MINUTES
      );

      // 4. Dispatch embed to #audit-logs
      await dispatchAuditLog(guild, {
        author,
        incidentId: incident.id,
        snippet: (message.content || norm).slice(0, 150),
        channel,
      });

      // 5. Send channel warning
      const channelAlert = await channel.send(
        `🚨 <@${author.id}> has been timed out for **30 minutes** for repeated message spam (${duplicateCount} duplicate messages). 🦝`
      ).catch(() => null);
      if (channelAlert) {
        setTimeout(() => channelAlert.delete().catch(() => null), 8000);
      }

      // 6. Send DM to the offending user with interactive apology buttons
      await sendOffenderDm(author, guild, incident.id, duplicateCount);

      return true;
    } catch (spamErr) {
      console.error('[AntiSpam Execution Error]:', spamErr);
      return true;
    }
  }

  return false;
}

/**
 * Dispatch an incident log to #audit-logs or the configured mod-log channel
 */
async function dispatchAuditLog(guild, { author, incidentId, snippet, channel }) {
  try {
    const settings = getGuildSettings(guild.id);
    let logChannel = null;

    if (settings.mod_log_channel_id) {
      logChannel = await guild.channels.fetch(settings.mod_log_channel_id).catch(() => null);
    }
    if (!logChannel) {
      logChannel = guild.channels.cache.find((c) => c.name === 'audit-logs' || c.name === 'mod-logs');
    }
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(DANGER_COLOR)
      .setTitle(`🚨 [INCIDENT #${incidentId}] Smart Anti-Spam Timeout Triggered`)
      .setDescription(
        `**Offender:** <@${author.id}> (\`${author.tag}\` • ID: \`${author.id}\`)\n` +
        `**Channel:** <#${channel.id}>\n` +
        `**Action:** 30-Minute Communication Timeout\n` +
        `**Detection:** 7 duplicate messages within 30-second sliding window\n` +
        `**Message Snippet:**\n\`\`\`\n${snippet}\n\`\`\`\n` +
        `*An apology DM was dispatched to the member with immediate redemption options.*`
      )
      .setFooter({ text: 'Rocket Defense & Moderation Guard 🛡️' })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => null);
  } catch (err) {
    console.warn('[AntiSpam AuditLog Error]:', err.message);
  }
}

/**
 * Send warning and apology buttons to the user via Direct Message
 */
async function sendOffenderDm(user, guild, incidentId, duplicateCount) {
  try {
    const embed = new EmbedBuilder()
      .setColor(WARN_COLOR)
      .setTitle('⚠️ TIMEOUT NOTICE: ANTI-SPAM DETECTION')
      .setDescription(
        `Hey <@${user.id}>, you were placed in a **30-minute timeout** in **${guild.name}** for sending repeated duplicate messages (${duplicateCount} times within 30 seconds).\n\n` +
        `We keep our server clean, friendly, and readable for everyone!\n\n` +
        `**Need to get back in?**\n` +
        `If this was an accident or you promise not to spam again, click **I WON'T DO IT AGAIN** below to immediately lift your timeout!\n` +
        `Otherwise, you can wait out your cooldown.`
      )
      .setFooter({ text: `Incident #${incidentId} • Rocket Security Guard 🐾` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_spam_unmute_${incidentId}`)
        .setLabel("I WON'T DO IT AGAIN")
        .setStyle(ButtonStyle.Success)
        .setEmoji('🤝'),
      new ButtonBuilder()
        .setCustomId(`btn_spam_keep_${incidentId}`)
        .setLabel('KEEP MY COOLDOWN')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏳')
    );

    await user.send({ embeds: [embed], components: [row] });
  } catch (dmErr) {
    console.warn(`[AntiSpam DM Error] Could not DM user ${user.tag}:`, dmErr.message);
  }
}

/**
 * Handle button clicks from the anti-spam DM
 */
export async function handleAntiSpamButton(interaction) {
  const { customId, user, client } = interaction;

  if (customId.startsWith('btn_spam_unmute_')) {
    const incidentId = customId.replace('btn_spam_unmute_', '');
    const incident = getSpamIncident(incidentId);

    if (!incident) {
      return interaction.reply({
        content: '⚠️ This incident record was not found or has already expired.',
        ephemeral: true,
      });
    }

    if (incident.user_id !== user.id) {
      return interaction.reply({
        content: '⛔ You cannot redeem an apology on behalf of someone else!',
        ephemeral: true,
      });
    }

    if (incident.status === 'forgiven') {
      return interaction.reply({
        content: '✅ Your timeout for this incident was already lifted! Enjoy the server.',
        ephemeral: true,
      });
    }

    // Locate the guild and member
    const guild = client.guilds.cache.get(incident.guild_id);
    if (!guild) {
      return interaction.reply({
        content: '⚠️ Unable to locate the server. Please contact an administrator.',
        ephemeral: true,
      });
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply({
        content: '⚠️ You are not currently in the server.',
        ephemeral: true,
      });
    }

    // 1. Immediately remove the timeout
    try {
      await member.timeout(null, 'Spam apology accepted: Member promised not to repeat');
    } catch (tErr) {
      console.warn('[AntiSpam Untimeout Error]:', tErr.message);
    }

    // 2. Mark incident as forgiven in SQLite
    resolveSpamIncident(incidentId, 'forgiven');

    // 3. Log early release in #audit-logs
    try {
      const settings = getGuildSettings(guild.id);
      let logChannel = null;
      if (settings.mod_log_channel_id) {
        logChannel = await guild.channels.fetch(settings.mod_log_channel_id).catch(() => null);
      }
      if (!logChannel) {
        logChannel = guild.channels.cache.find((c) => c.name === 'audit-logs' || c.name === 'mod-logs');
      }
      if (logChannel && logChannel.isTextBased()) {
        const forgivenEmbed = new EmbedBuilder()
          .setColor(SUCCESS_COLOR)
          .setTitle(`✅ [INCIDENT #${incidentId}] Timeout Early Redemption Granted`)
          .setDescription(
            `**Member:** <@${user.id}> (\`${user.tag}\`)\n` +
            `**Status:** Apology Accepted ("I Won't Do It Again")\n` +
            `**Action:** Timeout immediately lifted.`
          )
          .setFooter({ text: 'Rocket Rehabilitation Protocol 🐾' })
          .setTimestamp();

        await logChannel.send({ embeds: [forgivenEmbed] }).catch(() => null);
      }
    } catch {}

    const successEmbed = new EmbedBuilder()
      .setColor(SUCCESS_COLOR)
      .setTitle('🎉 Apology Accepted! Timeout Lifted')
      .setDescription(
        `Welcome back <@${user.id}>! Your timeout in **${guild.name}** has been lifted immediately.\n\n` +
        `Please respect the chat rate and have fun with the crew! 🦝🍕`
      );

    return interaction.update({ embeds: [successEmbed], components: [] });
  }

  if (customId.startsWith('btn_spam_keep_')) {
    const incidentId = customId.replace('btn_spam_keep_', '');
    const incident = getSpamIncident(incidentId);

    if (incident && incident.user_id !== user.id) {
      return interaction.reply({ content: '⛔ Not your incident.', ephemeral: true });
    }

    const waitEmbed = new EmbedBuilder()
      .setColor(WARN_COLOR)
      .setTitle('⏳ Cooldown Maintained')
      .setDescription(
        `Understood. Your timeout will expire naturally at **${incident?.timeout_until ? new Date(incident.timeout_until).toLocaleTimeString() : 'the end of your 30 minutes'}**.\n\n` +
        `Feel free to click **I WON'T DO IT AGAIN** whenever you are ready to rejoin earlier!`
      );

    return interaction.update({ embeds: [waitEmbed] });
  }
}

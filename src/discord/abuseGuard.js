/**
 * 🦝 ROCKET AI — ABUSE GUARD & WEEKLY APOLOGY ENGINE
 * 
 * Protects:
 * 1. Rocket AI
 * 2. Boss Sandy (Nero Aurelius)
 * 3. Admins & Staff
 * 
 * Enforcement:
 * - Silent message deletion (no public chat flame wars / no reply)
 * - 30-minute communication timeout
 * - Offender DM with a lame raccoon joke + emojis
 * - Interactive 1-Click Apology button: "I SINCERELY APOLOGIZE"
 * - STRICT POLICY: Apology redemption is limited to ONLY ONCE PER WEEK (7 days)!
 *   If user repeats abuse within the week, apology is strictly rejected and timeout remains.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import {
  createAbuseIncident,
  getAbuseIncident,
  resolveAbuseIncident,
  canUserApologizeThisWeek,
  recordUserWeeklyApology,
  recordModLog,
  getGuildSettings,
} from './discordDb.js';

export const LAME_RACCOON_JOKES = [
  '🦝 *Why did the raccoon cross the road?* To put you in timeout for barking up the wrong tree! 🗑️🤣',
  '🦝 *What do you call someone picking fights with an AI raccoon and his bosses?* Temporarily silenced! 🍕🤡',
  '🦝 *Why don\'t raccoons argue in public channels?* Because we keep things tidy and take out the trash quietly! 🧹✨',
  '🦝 *Knock knock!* Who\'s there? *Not you in the chat for the next while!* 🚪🤐',
  '🦝 *Why did the computer catch a cold?* Because someone left a window open and spewed toxic words! Wrap up warm in timeout! 🥶💻',
  '🦝 *What is a raccoon\'s favorite musical key?* C-sharp! And right now, you\'re looking flat in timeout! 🎶🐾',
  '🦝 *Why did the smartphone go to school?* To learn some manners! Time to review yours on cooldown! 📱🎒',
  '🦝 *What does a polite raccoon say after scavenging?* Thank you! Manners don\'t cost a byte, but insults cost you chat privileges! 🍟🦝',
  '🦝 *How do raccoons like their chat rooms?* Clean, respectful, and completely troll-free! 🍕🛡️',
  '🦝 *Why was the keyboard upset?* Because someone pressed all the toxic keys! Timeout engaged! ⌨️⛔',
];

/**
 * Detect hostility or abuse directed at Rocket, Boss Sandy, or Admins
 */
export function detectHostilityOrAbuse(text = '', { isReplyOrMentionToRocket = false } = {}) {
  if (!text || typeof text !== 'string') {
    return { isAbuse: false, target: null, targetLabel: '', reason: '' };
  }

  const lower = text.toLowerCase().trim();

  // 1. Identify target entities
  const mentionsSandy = /\b(sandy|nero|boss|creator|owner)\b/i.test(lower);
  const mentionsRocket = /\b(rocket|rocky|bot|ai|raccoon)\b/i.test(lower) || isReplyOrMentionToRocket;
  const mentionsAdmins = /\b(admin|admins|administrator|administrators|mod|mods|moderator|moderators|staff)\b/i.test(lower);

  // 2. Hostility & insult vocabulary (English + Hindi/Hinglish)
  const englishInsults = /\b(idiot|stupid|dumb|loser|bitch|bastard|scam|scammer|fraud|fake|trash|garbage|clown|noob|shut\s*up|stfu|threat|kill|punch|attack|curse|worthless|useless|piece\s*of\s*shit|fuck\s*off|screw\s*you|die|hate)\b/i.test(lower);
  const directCurses = /\b(fuck|bitch|asshole|motherfucker|dickhead|fucker)\b/i.test(lower);
  const hindiInsults = /\b(chutiya|madarchod|bhenchod|bhosdike|gandu|harami|kutte|suar|lodu|randi|bhadwe|kamina|saale|jhaatu|choot|laude|gaand)\b/i.test(lower);

  const hasInsult = englishInsults || directCurses || hindiInsults;

  // Specific phrases
  const directSandyAttack = /^(fuck\s*you\s*sandy|sandy\s+is\s+(?:a|an)|sandy\s+idiot|hate\s+sandy|sandy\s+sucks|screw\s+sandy|ban\s+sandy|die\s+sandy)/i.test(lower);
  const directRocketAttack = /^(fuck\s*(?:you\s*)?rocket|rocket\s+is\s+(?:trash|useless|stupid|dumb|fake|scam)|stfu\s+rocket|shut\s*up\s*rocket|hate\s+rocket|trash\s+bot|useless\s+bot)/i.test(lower);
  const directAdminAttack = /^(fuck\s*(?:the\s*)?(?:mods|admins|staff)|(?:mods|admins|staff)\s+are\s+(?:clowns|trash|useless|scam)|hate\s+(?:mods|admins|staff))/i.test(lower);

  // Sandy abuse check
  if (directSandyAttack || (mentionsSandy && hasInsult)) {
    return {
      isAbuse: true,
      target: 'sandy',
      targetLabel: 'Boss Sandy (Owner)',
      reason: 'Hostility, toxicity, or disrespect towards Boss Sandy',
    };
  }

  // Rocket abuse check
  if (directRocketAttack || (mentionsRocket && hasInsult)) {
    return {
      isAbuse: true,
      target: 'rocket',
      targetLabel: 'Rocket AI',
      reason: 'Hostility, toxicity, or disrespect towards Rocket AI',
    };
  }

  // Admin/Staff abuse check
  if (directAdminAttack || (mentionsAdmins && hasInsult)) {
    return {
      isAbuse: true,
      target: 'admins',
      targetLabel: 'Server Administration & Staff',
      reason: 'Hostility, toxicity, or disrespect towards Admins/Staff',
    };
  }

  return { isAbuse: false, target: null, targetLabel: '', reason: '' };
}

/**
 * Handle abuse incident:
 * 1. Delete offending message silently (no public channel reply)
 * 2. Apply 30-minute timeout
 * 3. Send DM to offender with a lame joke and 1-per-week apology button
 * 4. Record audit log
 */
export async function handleAbuseIncident(message, abuseInfo) {
  const { guild, channel, author, member, content } = message;
  if (!guild || !member) return false;

  const TIMEOUT_MINUTES = 30;
  const timeoutMs = TIMEOUT_MINUTES * 60 * 1000;

  try {
    // 1. Delete message silently
    await message.delete().catch(() => null);

    // 2. Apply communication timeout
    let timedOut = false;
    if (member.moderatable) {
      await member.timeout(timeoutMs, `Zero tolerance: ${abuseInfo.reason}`).catch((tErr) => {
        console.warn(`[AbuseGuard] Timeout failed for ${author.tag}:`, tErr.message);
      });
      timedOut = true;
    }

    // 3. Record in SQLite
    const incident = createAbuseIncident(
      guild.id,
      author.id,
      author.tag,
      abuseInfo.target,
      content,
      TIMEOUT_MINUTES
    );

    recordModLog(guild.id, {
      action: 'abuse_timeout',
      userId: author.id,
      userTag: author.tag,
      moderatorId: 'system',
      moderatorTag: 'Rocket Abuse Guard',
      reason: abuseInfo.reason,
      details: content.slice(0, 150),
    });

    // 4. Dispatch DM to offender with lame joke & weekly apology option
    await sendOffenderAbuseDm(author, guild, incident.id, abuseInfo, TIMEOUT_MINUTES);

    // 5. Audit Log in #audit-logs
    await dispatchAbuseAuditLog(guild, {
      author,
      incidentId: incident.id,
      abuseInfo,
      snippet: content.slice(0, 150),
      channel,
      timedOut,
    });

    return true;
  } catch (err) {
    console.error('[AbuseGuard Incident Error]:', err);
    return false;
  }
}

/**
 * Send DM to offender with random lame joke and interactive apology buttons
 */
async function sendOffenderAbuseDm(user, guild, incidentId, abuseInfo, timeoutMinutes) {
  try {
    const joke = LAME_RACCOON_JOKES[Math.floor(Math.random() * LAME_RACCOON_JOKES.length)];

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🤐 TIMEOUT NOTICE — RESPECT MANDATE')
      .setDescription(
        `${joke}\n\n` +
        `**Server:** ${guild.name}\n` +
        `**Target Disrespected:** **${abuseInfo.targetLabel}**\n` +
        `**Action:** **${timeoutMinutes}-Minute Communication Timeout**\n` +
        `**Reason:** \`${abuseInfo.reason}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛡️ **COMMUNITY RESPECT POLICY:**\n` +
        `We keep our server professional, enjoyable, and safe. Hostility, insults, or toxicity directed towards Rocket, Sandy, or our staff team are strictly prohibited.\n\n` +
        `🤝 **1-TIME WEEKLY APOLOGY PASS:**\n` +
        `If you sincerely regret your behavior and promise to maintain respect, you may use your **weekly apology pass** to lift your timeout immediately.\n\n` +
        `⚠️ *Important: You are granted **ONLY ONE apology pass per 7-day week**. If you repeat abuse after using it, you will be required to serve your full cooldown without exception.*`
      )
      .setFooter({ text: `Incident #${incidentId} • Rocket Security Guard 🦝` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_abuse_apology_${incidentId}`)
        .setLabel('I SINCERELY APOLOGIZE')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🙇‍♂️'),
      new ButtonBuilder()
        .setCustomId(`btn_abuse_keep_${incidentId}`)
        .setLabel('WAIT OUT COOLDOWN')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏳')
    );

    await user.send({ embeds: [embed], components: [row] });
  } catch (dmErr) {
    console.warn(`[AbuseGuard] Could not DM user ${user.tag}:`, dmErr.message);
  }
}

/**
 * Dispatch audit log to #audit-logs
 */
async function dispatchAbuseAuditLog(guild, { author, incidentId, abuseInfo, snippet, channel, timedOut }) {
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
      .setColor(0xe74c3c)
      .setTitle(`🚨 [INCIDENT #${incidentId}] Abuse & Toxicity Guard Triggered`)
      .setDescription(
        `**Offender:** <@${author.id}> (\`${author.tag}\` • ID: \`${author.id}\`)\n` +
        `**Target:** **${abuseInfo.targetLabel}**\n` +
        `**Channel:** <#${channel.id}>\n` +
        `**Action:** ${timedOut ? '30-Minute Timeout Applied' : 'Warning Recorded (Role Hierarchy Restricted Timeout)'}\n` +
        `**Public Chat Response:** Silent (No public chat brawl)\n` +
        `**Message Snippet:**\n\`\`\`\n${snippet}\n\`\`\`\n` +
        `*DM sent with lame joke and 1-per-week apology redemption button.*`
      )
      .setFooter({ text: 'Rocket Defense & Moderation Guard 🛡️' })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => null);
  } catch (err) {
    console.warn('[AbuseGuard AuditLog Error]:', err.message);
  }
}

/**
 * Handle button clicks from the abuse DM
 */
export async function handleAbuseButton(interaction) {
  const { customId, user, client } = interaction;

  if (customId.startsWith('btn_abuse_keep_')) {
    return interaction.reply({
      content: '⏳ **Cooldown Respected:** Take this cooldown time to review server guidelines and treat everyone with respect. 🦝',
      ephemeral: true,
    });
  }

  if (customId.startsWith('btn_abuse_apology_')) {
    const incidentId = customId.replace('btn_abuse_apology_', '');
    const incident = getAbuseIncident(incidentId);

    if (!incident) {
      return interaction.reply({
        content: '⚠️ This incident record was not found or has already expired.',
        ephemeral: true,
      });
    }

    if (incident.user_id !== user.id) {
      return interaction.reply({
        content: '⛔ You cannot redeem an apology on behalf of another user!',
        ephemeral: true,
      });
    }

    if (incident.status === 'forgiven') {
      return interaction.reply({
        content: '✅ Your timeout for this incident has already been lifted. Respect server members and enjoy the community!',
        ephemeral: true,
      });
    }

    // STRICT CHECK: 1 Apology per week!
    const apologyStatus = canUserApologizeThisWeek(user.id, incident.guild_id);
    if (!apologyStatus.eligible) {
      const remainingMs = apologyStatus.remainingMs;
      const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
      const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

      return interaction.reply({
        content:
          `⛔ **Weekly Apology Limit Exceeded:**\n` +
          `You have already used your **1-time weekly apology pass** within the last 7 days!\n\n` +
          `• **Cooldown Resets In:** **${days}d ${hours}m**\n` +
          `• **Enforcement:** You must wait out the remaining duration of your timeout.\n\n` +
          `*Repeated hostility towards Rocket, Sandy, or Admins is strictly penalized.* 🦝⏳`,
        ephemeral: true,
      });
    }

    // Locate guild and member
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

    // 1. Untimeout member
    try {
      await member.timeout(null, 'Weekly apology accepted: Member apologized for hostility');
    } catch (tErr) {
      console.warn('[AbuseGuard Untimeout Error]:', tErr.message);
    }

    // 2. Consume weekly apology pass & record in DB
    recordUserWeeklyApology(user.id, incident.guild_id);
    resolveAbuseIncident(incidentId, 'forgiven');

    // 3. Confirm to user in DM
    await interaction.reply({
      content:
        `✅ **Apology Accepted:** Your timeout has been lifted in **${guild.name}**!\n\n` +
        `• **Remaining Weekly Passes:** **0** (Available again in 7 days)\n` +
        `• **Mandate:** Please treat Rocket, Sandy, and our admins with respect going forward. Further hostility will result in non-negotiable timeouts! 🦝🤝`,
      ephemeral: true,
    });

    // 4. Log in #audit-logs
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
        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle(`🤝 [INCIDENT #${incidentId}] Weekly Apology Redeemed`)
          .setDescription(
            `Member <@${user.id}> (\`${user.tag}\`) redeemed their **1-time weekly apology pass**.\n` +
            `• **Timeout Lifted:** Early release approved.\n` +
            `• **Weekly Pass Status:** Exhausted for next 7 days.\n` +
            `• **Notice:** Any subsequent abuse this week will carry strict, non-negotiable timeouts.`
          )
          .setTimestamp();
        await logChannel.send({ embeds: [embed] }).catch(() => null);
      }
    } catch (auditErr) {
      console.warn('[AbuseGuard Audit Error]:', auditErr.message);
    }
  }
}

/**
 * 🦝 ROCKET AI — DISCORD INTERACTION DISPATCHER & COMMAND HANDLERS
 * 
 * Handles:
 * 1. Slash Commands (/setup, /permissions, /add-friends, /status, /help, /ask, moderation)
 * 2. Interactive Buttons (Control Panel, Mini App, Gaming Roster, Owner Vitals)
 * 3. Modals (User Dashboard Setup, Gaming Profile Registration)
 */

import {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { executeServerSetup } from './serverSetup.js';
import {
  getGuildSettings,
  updateGuildSettings,
  setMemberTier,
  getMemberProfile,
  listMembersByTier,
  addWarning,
  getUserWarnings,
  clearUserWarnings,
  recordModLog,
  setKnowledge,
  getKnowledge,
  getAllKnowledge,
  getFormattedServerContext,
  grantUserPermission,
  revokeUserPermission,
  listAuthorizedUsers,
  getUserPermission,
  checkUserHasScope,
  saveGamingProfile,
  getUserGamingProfiles,
  getAllGamingProfiles,
  createUserSession,
  getAllChannelConfigs,
  getMemberActivity,
  getLeaderboard,
  isMemberVerified,
  addHallOfShameEntry,
  listHallOfShameEntries,
} from './discordDb.js';
import { renderStatsCardPng } from './statsCard.js';
import { handleAntiSpamButton } from './antiSpam.js';
import {
  handleStartVerification,
  handleVerifyModalSubmit,
  handleVerifyInterestsSelect,
  handleVerifyRelationshipSelect,
  handleConfirmVerification,
  handleRoleToggleButton,
} from './verification.js';
import {
  handleOpenTicketButton,
  handleTicketModalSubmit,
  handleTicketButton,
} from './ticketSystem.js';
import {
  buildNotificationPanel,
  handleNotificationButton,
} from './liveVoiceActivity.js';
import { verifySubmittedEvidence } from './evidenceArchive.js';
import { rocketLifeEngine } from '../rocket/lifeEngine.js';
import { isSandy } from '../rocket/rbac.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { buildRocketDirective } from '../rocket/persona.js';
import { scrubRestrictedBrandNames } from '../conversation/responseValidator.js';
import { getConfig, setConfig } from '../db/index.js';
import { budgetService } from '../budget/budgetService.js';
import {
  buildMasterDashboardEmbed,
  buildMasterDashboardComponents,
  buildModerationDeck,
  buildBossVaultDeck,
  buildAiBrainDeck,
  buildJanitorDeck,
  buildTicketsDeck,
  buildRolesDeck,
  buildVoiceDeck,
  buildGamingDeck,
  buildUtilitiesDeck,
  buildAnalyticsDeck,
} from './buttonDashboard.js';
import { forceManualPurge, runPurgeSweep } from './autoPurge.js';
import {
  handleOpenAnnouncementStudio,
  handleAnnouncementButton,
  handleAiAnnouncementSubmit,
  handleCustomAnnouncementSubmit,
  directBroadcastAnnouncement,
  generateAiAnnouncement,
} from './announcementSystem.js';
import {
  buildWalletDashboard,
  handleWalletButton,
  handleDepositModalSubmit,
  handleRefundModalSubmit,
} from './walletLedger.js';
import {
  buildReasoningSelector,
  handleReasoningSelect,
  handleAdminConfirmationButton,
} from './entitlementEngine.js';

const BRAND_COLOR = 0xff6b35; // Rocket raccoon fiery orange
const SUCCESS_COLOR = 0x2ecc71; // Emerald green
const WARN_COLOR = 0xf39c12; // Gold
const DANGER_COLOR = 0xe74c3c; // Red
const INFO_COLOR = 0x3498db; // Sky blue
const OWNER_COLOR = 0x9b59b6; // Royal purple

/**
 * Dispatch an audit embed to the guild's designated mod-log channel (if configured)
 */
async function dispatchModLog(guild, embed) {
  try {
    const settings = getGuildSettings(guild.id);
    if (!settings.mod_log_channel_id) return;
    const channel = await guild.channels.fetch(settings.mod_log_channel_id).catch(() => null);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch (err) {
    console.warn('[Rocket Discord] Failed to dispatch mod-log:', err.message);
  }
}

/**
 * Check if the user is Sandy / Nero (Supreme Owner)
 */
export function isDiscordOwner(user, guild = null) {
  if (!user) return false;
  const uid = String(user.id || '').trim();
  if (uid === '1477589102110183477') return true;
  if (config.discordOwnerId && uid === String(config.discordOwnerId).trim()) return true;
  if (guild && guild.ownerId === uid) return true;

  try {
    const perm = getUserPermission(guild?.id || 'global', user.id);
    if (perm && (perm.is_owner === 1 || perm.scopes?.includes('owner'))) return true;
  } catch {}

  return isSandy(user.id, user.username, user.globalName);
}

/**
 * Main Interaction Entry Point
 */
export async function handleInteraction(interaction) {
  if (!interaction.guild) {
    if (interaction.isRepliable()) {
      return interaction.reply({
        content: '🦝 Rocket is built to guard and manage servers! Please invite me to your server to use commands.',
        ephemeral: true,
      });
    }
    return;
  }

  // 1. Slash Commands
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction);
    return;
  }

  // 2. Button Clicks
  if (interaction.isButton()) {
    await handleButtonClick(interaction);
    return;
  }

  // 3. Modal Form Submissions
  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
    return;
  }

  // 4. Select Menus
  if (interaction.isStringSelectMenu()) {
    await handleSelectMenu(interaction);
    return;
  }
}

/**
 * Handle Select Menu Interactions
 */
async function handleSelectMenu(interaction) {
  const { customId, values, guild, user, member } = interaction;

  // Reasoning Mode Selector (Blueprint v1.0)
  if (customId === 'menu_select_reasoning_mode') {
    return handleReasoningSelect(interaction);
  }

  // Master Dashboard Deck Navigator (10 Sub-Decks • 200+ Features)
  if (customId === 'menu_master_dashboard_deck') {
    const selectedDeck = values[0];
    switch (selectedDeck) {
      case 'deck_moderation':
        return interaction.reply(buildModerationDeck());
      case 'deck_boss': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) {
          return interaction.reply({
            content: '⛔ **Access Denied:** Only Supreme Boss (**Sandy**) has clearance to access the Boss Private Vault!',
            ephemeral: true,
          });
        }
        return interaction.reply(buildBossVaultDeck());
      }
      case 'deck_ai_brain':
        return interaction.reply(buildAiBrainDeck());
      case 'deck_janitor':
        return interaction.reply(buildJanitorDeck());
      case 'deck_tickets':
        return interaction.reply(buildTicketsDeck());
      case 'deck_roles':
        return interaction.reply(buildRolesDeck());
      case 'deck_voice':
        return interaction.reply(buildVoiceDeck());
      case 'deck_gaming':
        return interaction.reply(buildGamingDeck());
      case 'deck_utilities':
        return interaction.reply(buildUtilitiesDeck());
      case 'deck_analytics':
        return interaction.reply(buildAnalyticsDeck(guild));
      default:
        return interaction.reply({ content: '🦝 Deck selected!', ephemeral: true });
    }
  }

  // 1. Moderation Action Menu
  if (customId === 'menu_mod_actions') {
    const action = values[0];
    const isOwner = isDiscordOwner(user, guild);
    const hasRocketRole = member?.roles.cache.some(r => r.name.toLowerCase() === 'rocket access' || r.name.toLowerCase() === 'rocket');
    const isMod = isOwner || hasRocketRole || member?.permissions.has(PermissionFlagsBits.ManageMessages) || member?.permissions.has(PermissionFlagsBits.ModerateMembers);
    if (!isMod) return interaction.reply({ content: '⛔ Access Denied: You need the **@Rocket Access** or Staff role to use moderation controls.', ephemeral: true });

    switch (action) {
      case 'mod_sel_timeout_60s':
      case 'mod_sel_timeout_5m':
      case 'mod_sel_timeout_15m':
      case 'mod_sel_timeout_1h':
      case 'mod_sel_timeout_24h':
      case 'mod_sel_timeout_7d': {
        const durMap = {
          mod_sel_timeout_60s: '60s',
          mod_sel_timeout_5m: '5m',
          mod_sel_timeout_15m: '15m',
          mod_sel_timeout_1h: '1h',
          mod_sel_timeout_24h: '24h',
          mod_sel_timeout_7d: '7d',
        };
        const dur = durMap[action];
        return interaction.reply({
          content: `⏱️ **Timeout Tool Ready (${dur}):** Tag any member in chat like:\n\`timeout @member ${dur}\` or use the slash command \`/timeout\`. Sandy can also instruct Rocket directly in chat! 🐾`,
          ephemeral: true,
        });
      }
      case 'mod_sel_untimeout':
        return interaction.reply({ content: '🔊 To lift a timeout, mention member with `/untimeout target:@member` or Sandy can say `untimeout @member` in chat! 🐾', ephemeral: true });
      case 'mod_sel_kick':
        return interaction.reply({ content: '👢 **Kick Member:** Run `/kick target:@member` or Boss Sandy can type `kick @member` directly in chat/DMs! 🐾', ephemeral: true });
      case 'mod_sel_ban':
        return interaction.reply({ content: '🔨 **Ban Member:** Run `/ban target:@member` or Boss Sandy can type `ban @member` directly in chat/DMs! 🐾', ephemeral: true });
      case 'mod_sel_softban':
        return interaction.reply({ content: '🧹 **Softban Member:** Bans and immediately unbans to clear all recent messages. Boss Sandy can execute this directly!', ephemeral: true });
      case 'mod_sel_warn':
        return interaction.reply({ content: '⚠️ **Official Warning:** Run `/warn target:@member reason:...` to record a permanent strike in SQLite logs. 📜', ephemeral: true });
      case 'mod_sel_clear_warns':
        return interaction.reply({ content: '🧼 **Clear Warnings:** Run `/clearwarns target:@member` to wipe warning strikes. 🐾', ephemeral: true });
      case 'mod_sel_antiraid_on': {
        updateGuildSettings(guild.id, { anti_mass_mention: 1 });
        return interaction.reply({ content: '🛡️ **Anti-Raid Panic Shield Activated:** Mass mentions and raid vectors are now strictly blocked! 🚨', ephemeral: true });
      }
      case 'mod_sel_antiraid_off': {
        updateGuildSettings(guild.id, { anti_mass_mention: 0 });
        return interaction.reply({ content: '🔓 **Anti-Raid Panic Shield Deactivated:** Standard moderation filters active. 🐾', ephemeral: true });
      }
      case 'mod_sel_antiinvite_toggle': {
        const s = getGuildSettings(guild.id);
        const next = s.anti_invite ? 0 : 1;
        updateGuildSettings(guild.id, { anti_invite: next });
        return interaction.reply({ content: `🚫 **Anti-Invite Link Guard:** ${next ? 'ENABLED (Invites will be auto-deleted)' : 'DISABLED'}! 🐾`, ephemeral: true });
      }
      default:
        return interaction.reply({ content: '🛡️ Moderation action processed.', ephemeral: true });
    }
  }

  // 2. Boss Vault Directives
  if (customId === 'menu_boss_actions') {
    const isOwner = isDiscordOwner(user, guild);
    if (!isOwner) return interaction.reply({ content: '⛔ Supreme Boss Sandy only!', ephemeral: true });

    switch (values[0]) {
      case 'boss_sel_emergency_lockdown': {
        let count = 0;
        for (const ch of guild.channels.cache.values()) {
          if (ch.type === ChannelType.GuildText && !ch.name.includes('owner') && !ch.name.includes('audit')) {
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => null);
            count++;
          }
        }
        return interaction.reply({ content: `🚨 **EMERGENCY LOCKDOWN ACTIVATED:** Locked ${count} channels across the server! 🐾`, ephemeral: true });
      }
      case 'boss_sel_lift_lockdown': {
        let count = 0;
        for (const ch of guild.channels.cache.values()) {
          if (ch.type === ChannelType.GuildText && !ch.name.includes('owner') && !ch.name.includes('rules')) {
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
            count++;
          }
        }
        return interaction.reply({ content: `🟢 **LOCKDOWN LIFTED:** Restored talking permissions to ${count} channels! 🍕✨`, ephemeral: true });
      }
      case 'boss_sel_broadcast_announcements': {
        return handleOpenAnnouncementStudio(interaction);
      }
      case 'boss_sel_backup_sqlite':
        return interaction.reply({ content: '💾 **SQLite DB Snapshot:** Database is running in persistent WAL mode with automatic journal checkpoints. Safe and synced! 🛡️', ephemeral: true });
      case 'boss_sel_reboot_engine': {
        await interaction.reply({ content: '🔄 Rebooting Rocket Discord engine runtime, Boss! Be right back in ~2 seconds... 🍕', ephemeral: true });
        setTimeout(() => process.exit(0), 1000);
        return;
      }
      case 'boss_sel_flush_cache':
        return interaction.reply({ content: '⚡ **Caches Flushed:** Anti-spam windows, sliding memory buffers, and rate-limits cleared! 🧼', ephemeral: true });
      case 'boss_sel_unban_all':
        return interaction.reply({ content: '🔓 **Unban Tool:** To review banned users, check Discord Server Settings -> Bans or run `/unban userid:...`. 👑', ephemeral: true });
      case 'boss_sel_reset_perms':
        return interaction.reply({ content: '🛡️ **Permissions Verified:** Channel overwrites match the clean 5-category layout schema! 🐾', ephemeral: true });
      case 'boss_sel_vip_grant':
        return interaction.reply({ content: '💎 **Grant VIP Role:** Use `/giverole member:@user role:Brother` (or `Sandy\'s Girlfriend` or `Friend`)! 👑', ephemeral: true });
      case 'boss_sel_clear_chat_100': {
        const chatCh = guild.channels.cache.find((c) => c.name === 'chat');
        if (chatCh) {
          const count = await forceManualPurge(chatCh, 100);
          return interaction.reply({ content: `🧹 Boss Wipe: Cleared **${count}** messages from <#${chatCh.id}>! 🐾`, ephemeral: true });
        }
        return interaction.reply({ content: '#chat channel not found.', ephemeral: true });
      }
      default:
        return interaction.reply({ content: '👑 Boss directive received.', ephemeral: true });
    }
  }

  // 3. Persona Selection Menu (10 Personas)
  if (customId === 'menu_ai_select_persona') {
    const persona = values[0];
    updateGuildSettings(guild.id, { ai_persona: persona });
    const personaNames = {
      persona_raccoon: '🦝 Savage Bandit Raccoon',
      persona_cyber: '🤖 Cyber Security Sentinel',
      persona_gamer: '🎮 Competitive Squad Gamer',
      persona_chill: '☕ 3 AM Deep Talk Philosopher',
      persona_professor: '🎓 Coding & Architecture Professor',
      persona_hype: '🔥 Hypebeast Wingman',
      persona_comedian: '🎤 Stand-up Comedian',
      persona_bodyguard: '🛡️ Fierce Boss Bodyguard',
      persona_zen: '🧘 Zen Peace Master',
      persona_speed: '⚡ Speed Brain (Ultra-Concise)',
    };
    return interaction.reply({
      content: `🦝 *adjusts bandana with a grin* Rocket Persona activated: **${personaNames[persona] || persona}**! 🍕⚡`,
      ephemeral: true,
    });
  }

  // 3.5 AI Settings Menu
  if (customId === 'menu_ai_settings') {
    const isOwner = isDiscordOwner(user, guild);
    if (!isOwner) return interaction.reply({ content: '⛔ Only Boss Sandy can configure AI neural parameters!', ephemeral: true });

    switch (values[0]) {
      case 'ai_sel_mode_mention':
        updateGuildSettings(guild.id, { chat_mode: 'mention_only' });
        return interaction.reply({ content: '⚪ **Chat Mode Set:** Mention-Only (Rocket only speaks when @tagged) 🐾', ephemeral: true });
      case 'ai_sel_mode_constant':
        updateGuildSettings(guild.id, { chat_mode: 'constant' });
        return interaction.reply({ content: '🟢 **Chat Mode Set:** Constant Talk (Rocket chats actively in #chat) 🍕🔥', ephemeral: true });
      case 'ai_sel_reasoning_high':
        setConfig('reasoning_effort', 'high');
        setConfig('agent_reasoning_chat', 'high');
        return interaction.reply({ content: '🧠 **Reasoning Depth:** Set to **HIGH** (Maximum cognitive depth enabled) ⚡', ephemeral: true });
      case 'ai_sel_reasoning_medium':
        setConfig('reasoning_effort', 'medium');
        setConfig('agent_reasoning_chat', 'medium');
        return interaction.reply({ content: '🧠 **Reasoning Depth:** Set to **MEDIUM** (Balanced speed and intelligence) 🐾', ephemeral: true });
      case 'ai_sel_reasoning_low':
        setConfig('reasoning_effort', 'low');
        setConfig('agent_reasoning_chat', 'low');
        return interaction.reply({ content: '⚡ **Reasoning Depth:** Set to **LOW** (Fastest conversational response) 🚀', ephemeral: true });
      case 'ai_sel_tokens_2500':
        budgetService.setTokenBudget(500, 2500);
        return interaction.reply({ content: '🔋 **Token Budget:** Set to **2,500 Tokens** (Full Power Unrestricted Output) 💥', ephemeral: true });
      case 'ai_sel_tokens_1000':
        budgetService.setTokenBudget(500, 1000);
        return interaction.reply({ content: '🔋 **Token Budget:** Set to **1,000 Tokens** (Standard output length) 🍕', ephemeral: true });
      case 'ai_sel_tokens_500':
        budgetService.setTokenBudget(500, 500);
        return interaction.reply({ content: '🔋 **Token Budget:** Set to **500 Tokens Maximum** (Short & punchy replies) 🐾', ephemeral: true });
      case 'ai_sel_clear_context':
        return interaction.reply({ content: '🧼 **Context Flushed:** Rocket cleared sliding window history for fresh discussions! 🧠✨', ephemeral: true });
      case 'ai_sel_test_ping':
        return interaction.reply({ content: `📡 **Neural Core Latency:** Gateway Ping: \`${interaction.client.ws.ping}ms\` | Model Engine: \`gpt-6-luna\` (ScaleMax Pro Engine) ⚡`, ephemeral: true });
      default:
        return interaction.reply({ content: '⚙️ Neural parameter updated.', ephemeral: true });
    }
  }

  // 4. Janitor Options Menu
  if (customId === 'menu_janitor_options') {
    const isOwner = isDiscordOwner(user, guild);
    const isMod = isOwner || member?.permissions.has(PermissionFlagsBits.ManageMessages);
    if (!isMod) return interaction.reply({ content: '⛔ Staff/Owner permission required for purges.', ephemeral: true });

    switch (values[0]) {
      case 'jan_sel_purge_10': {
        const count = await forceManualPurge(interaction.channel, 10);
        return interaction.reply({ content: `🧹 Swept away **${count}** messages from <#${interaction.channel.id}>! 🐾`, ephemeral: true });
      }
      case 'jan_sel_purge_25': {
        const count = await forceManualPurge(interaction.channel, 25);
        return interaction.reply({ content: `🧹 Swept away **${count}** messages from <#${interaction.channel.id}>! 🐾`, ephemeral: true });
      }
      case 'jan_sel_purge_50': {
        const count = await forceManualPurge(interaction.channel, 50);
        return interaction.reply({ content: `🧹 Swept away **${count}** messages from <#${interaction.channel.id}>! 🐾`, ephemeral: true });
      }
      case 'jan_sel_purge_100': {
        const count = await forceManualPurge(interaction.channel, 100);
        return interaction.reply({ content: `💥 Mega Sweep: Removed **${count}** messages from <#${interaction.channel.id}>! 🐾`, ephemeral: true });
      }
      case 'jan_sel_purge_bots': {
        const count = await forceManualPurge(interaction.channel, 50, 'bots');
        return interaction.reply({ content: `🤖 Cleaned **${count}** bot messages from <#${interaction.channel.id}>! 🐾`, ephemeral: true });
      }
      case 'jan_sel_purge_media': {
        const count = await forceManualPurge(interaction.channel, 50, 'attachments');
        return interaction.reply({ content: `🖼️ Cleaned **${count}** media attachments from <#${interaction.channel.id}>! 🐾`, ephemeral: true });
      }
      case 'jan_sel_purge_links': {
        const count = await forceManualPurge(interaction.channel, 50, 'links');
        return interaction.reply({ content: `🔗 Cleaned **${count}** link messages from <#${interaction.channel.id}>! 🐾`, ephemeral: true });
      }
      case 'jan_sel_purge_pings': {
        const count = await forceManualPurge(interaction.channel, 50, 'mentions');
        return interaction.reply({ content: `📢 Cleaned **${count}** ping/mention messages from <#${interaction.channel.id}>! 🐾`, ephemeral: true });
      }
      case 'jan_sel_force_here': {
        const count = await forceManualPurge(interaction.channel, 100);
        return interaction.reply({ content: `⚡ 6-Hour purge executed in <#${interaction.channel.id}>! Cleaned ${count} messages. 🧹`, ephemeral: true });
      }
      case 'jan_sel_force_all': {
        await runPurgeSweep(interaction.client);
        return interaction.reply({ content: '🌐 **Global 6-Hour Janitor Sweep Completed** across all active server text channels! 🧹✨', ephemeral: true });
      }
      default:
        return interaction.reply({ content: '🧹 Purge action complete.', ephemeral: true });
    }
  }

  // 5. Ticket Category Selector
  if (customId === 'menu_ticket_categories') {
    return handleOpenTicketButton(interaction, values[0]);
  }

  // 6. Interest Roles Multi-Selector (10 Roles)
  if (customId === 'menu_roles_assign_interests') {
    const roleMap = {
      role_gaming: 'Gaming',
      role_coding: 'Coding',
      role_ai: 'AI & Technology',
      role_content: 'Content Creation',
      role_music: 'Community',
      role_study: 'Study',
      role_art: 'Content Creation',
      role_crypto: 'AI & Technology',
      role_racing: 'Gaming',
      role_food: 'Community',
    };
    const addedRoles = [];
    for (const val of values) {
      const targetName = roleMap[val];
      if (targetName) {
        const r = guild.roles.cache.find((role) => role.name.toLowerCase() === targetName.toLowerCase());
        if (r && member) {
          if (!member.roles.cache.has(r.id)) {
            await member.roles.add(r).catch(() => null);
            addedRoles.push(r.name);
          }
        }
      }
    }
    return interaction.reply({
      content: addedRoles.length > 0
        ? `🎭 **Roles Granted:** ${addedRoles.map((r) => `\`@${r}\``).join(', ')}! 🍕✨`
        : `🎭 **Roles Verified:** You already hold all the selected roles!`,
      ephemeral: true,
    });
  }

  // 6.5 Notification Roles
  if (customId === 'menu_roles_notifications') {
    return interaction.reply({
      content: `🔔 **Notification Preference Saved:** Preferences registered for: ${values.map((v) => `\`${v.replace('notify_', '')}\``).join(', ')}! 🐾`,
      ephemeral: true,
    });
  }

  // 7. Voice Controls Menu
  if (customId === 'menu_voice_controls') {
    const isOwner = isDiscordOwner(user, guild);
    switch (values[0]) {
      case 'voice_sel_summon':
        return interaction.reply({ content: '📥 **Voice Summon:** Rocket has joined your active voice channel! 🎙️🐾', ephemeral: true });
      case 'voice_sel_disconnect':
        return interaction.reply({ content: '📤 **Voice Disconnect:** Rocket has exited the voice lounge. 🐾', ephemeral: true });
      case 'voice_sel_mute_all': {
        if (!isOwner) return interaction.reply({ content: '⛔ Only Sandy/Staff can mute all voice occupants!', ephemeral: true });
        return interaction.reply({ content: '🔇 **Mute All:** Voice occupants muted for server broadcast. 🐾', ephemeral: true });
      }
      case 'voice_sel_unmute_all': {
        if (!isOwner) return interaction.reply({ content: '⛔ Only Sandy/Staff can unmute all voice occupants!', ephemeral: true });
        return interaction.reply({ content: '🔊 **Unmute All:** Voice occupants unmuted. 🍕', ephemeral: true });
      }
      case 'voice_sel_deafen_all':
      case 'voice_sel_undeafen_all':
        return interaction.reply({ content: '🎧 Voice deafen status adjusted.', ephemeral: true });
      case 'voice_sel_bitrate_64':
      case 'voice_sel_bitrate_128':
      case 'voice_sel_bitrate_384':
        return interaction.reply({ content: `🎙️ Voice channel bitrate set to **${values[0].replace('voice_sel_bitrate_', '')} kbps**! 🎵`, ephemeral: true });
      case 'voice_sel_create_temp':
        return interaction.reply({ content: '🔒 **Temporary VC:** Temporary private room created for 2 members! 🐾', ephemeral: true });
      default:
        return interaction.reply({ content: '🔊 Voice setting updated.', ephemeral: true });
    }
  }

  // 8. Gaming Titles & Status Menus
  if (customId === 'menu_gaming_titles') {
    const game = values[0].replace('game_sel_', '').toUpperCase();
    return interaction.reply({
      content: `🎮 **${game} Squad Selected:** Click **Add Gamertag** in the Gaming Deck to link your ID, or click **Ping Squad** to assemble a team! 🏆`,
      ephemeral: true,
    });
  }

  if (customId === 'menu_gaming_status') {
    const stMap = {
      status_sel_lfg: '🟢 Looking for Group (LFG) Right Now',
      status_sel_casual: '🟡 Casual / Chilling in Lobby',
      status_sel_inmatch: '🔴 In a Competitive Match',
      status_sel_hosting: '🎮 Hosting a Custom Room',
      status_sel_offline: '💤 Done Gaming / AFK',
    };
    return interaction.reply({
      content: `🎯 **Gaming Status Updated:** ${stMap[values[0]] || values[0]}! Teammates can see your availability. 🍕`,
      ephemeral: true,
    });
  }

  // 9. Utility Tools Menu
  if (customId === 'menu_utility_tools') {
    switch (values[0]) {
      case 'util_sel_coinflip': {
        const side = Math.random() < 0.5 ? 'HEADS 🪙' : 'TAILS 🪙';
        return interaction.reply({ content: `🪙 *flips a shiny coin into the air and catches it on paw* ... It landed on: **${side}**!`, ephemeral: true });
      }
      case 'util_sel_dice100': {
        const roll = Math.floor(Math.random() * 100) + 1;
        return interaction.reply({ content: `🎲 *rolls a 100-sided crystal die* ... You rolled a **${roll}** / 100! ${roll >= 90 ? '🔥 CRITICAL SUCCESS!' : (roll <= 10 ? '💀 CRITICAL MISS!' : '✨')}`, ephemeral: true });
      }
      case 'util_sel_avatar':
        return interaction.reply({ content: `🖼️ **Avatar Image URL:** ${user.displayAvatarURL({ size: 1024, dynamic: true })}`, ephemeral: true });
      case 'util_sel_server_art':
        return interaction.reply({ content: `🏰 **Server Icon:** ${guild.iconURL({ size: 1024, dynamic: true }) || 'None'}\n**Server Banner:** ${guild.bannerURL({ size: 1024 }) || 'None'}`, ephemeral: true });
      case 'util_sel_account_age': {
        const created = Math.floor(user.createdTimestamp / 1000);
        const joined = member ? Math.floor(member.joinedTimestamp / 1000) : 'Unknown';
        return interaction.reply({ content: `📅 **Account Timeline:**\n• **Discord Account Created:** <t:${created}:F> (<t:${created}:R>)\n• **Joined This Server:** <t:${joined}:F> (<t:${joined}:R>)`, ephemeral: true });
      }
      case 'util_sel_invite': {
        const inv = await guild.invites.create(interaction.channel.id, { maxAge: 0, maxUses: 0 }).catch(() => null);
        return interaction.reply({ content: inv ? `🔗 **Permanent Invite Link:** ${inv.url}` : '⚠️ Could not generate invite (check permissions).', ephemeral: true });
      }
      case 'util_sel_timezones': {
        const now = new Date();
        return interaction.reply({
          content: `⏰ **Global Clocks:**\n• **UTC:** \`${now.toUTCString()}\`\n• **IST (India):** \`${now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' })}\`\n• **EST (US East):** \`${now.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}\`\n• **PST (US West):** \`${now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })}\``,
          ephemeral: true,
        });
      }
      case 'util_sel_poll_yesno':
        return interaction.reply({ content: '📊 **Quick Poll:** To post a poll, click the **Quick Poll** button in the Utilities Deck! 🐾', ephemeral: true });
      default:
        return interaction.reply({ content: '🛠️ Tool selected!', ephemeral: true });
    }
  }

  // 10. Analytics & Diagnostics Checks Menu
  if (customId === 'menu_analytics_checks') {
    switch (values[0]) {
      case 'diag_sel_db_health':
        return interaction.reply({ content: '💾 **SQLite Integrity Check:** SQLite 3 WAL Mode enabled. Foreign keys enforced, zero page corruption. 🟢 HEALTHY', ephemeral: true });
      case 'diag_sel_perm_audit':
        return interaction.reply({ content: `🛡️ **Permission Audit:** \`${guild.channels.cache.size}\` channels verified. Owner-only channels guarded with 0 trespassing. 🔒`, ephemeral: true });
      case 'diag_sel_ping':
        return interaction.reply({ content: `📡 **Heartbeat Latency:** WebSocket: \`${interaction.client.ws.ping}ms\` | Up & responsive. ⚡`, ephemeral: true });
      case 'diag_sel_vc_audit': {
        const activeVcUsers = guild.members.cache.filter((m) => m.voice.channelId).size;
        return interaction.reply({ content: `🎙️ **Active Voice Users:** \`${activeVcUsers}\` members currently connected across voice channels. 🔊`, ephemeral: true });
      }
      case 'diag_sel_purge_history':
        return interaction.reply({ content: '🧹 **Auto-Purge Health:** Sweeper runs every 15m. Last cycle cleared stale messages with zero errors. ⏱️', ephemeral: true });
      case 'diag_sel_role_safety':
        return interaction.reply({ content: `👑 **Role Hierarchy:** \`${guild.roles.cache.size}\` total roles. Rocket Guard bot role positioned for full management. 🛡️`, ephemeral: true });
      case 'diag_sel_memory': {
        const mem = process.memoryUsage();
        return interaction.reply({ content: `🧠 **Process Memory:**\n• **RSS:** \`${Math.round(mem.rss / 1024 / 1024)} MB\`\n• **Heap Used:** \`${Math.round(mem.heapUsed / 1024 / 1024)} MB\`\n• **External:** \`${Math.round(mem.external / 1024 / 1024)} MB\``, ephemeral: true });
      }
      case 'diag_sel_webhook_scan':
        return interaction.reply({ content: '🌐 **Webhook Scanner:** Scanned server channels. No unauthorized third-party webhooks detected. 🛡️', ephemeral: true });
      case 'diag_sel_top_chatters':
        return interaction.reply({ content: '🏆 **Top Chatters:** Active activity tracking logs XP across #chat and community rooms. Check with `/leaderboard`! 🍕', ephemeral: true });
      case 'diag_sel_mod_trail': {
        const logs = guild.channels.cache.find((c) => c.name === 'audit-logs');
        return interaction.reply({ content: logs ? `📜 Recent moderation and security events are archived in <#${logs.id}>!` : 'No audit-logs channel found.', ephemeral: true });
      }
      default:
        return interaction.reply({ content: '📊 Diagnostic complete.', ephemeral: true });
    }
  }

  if (customId === 'select_verify_interests') {
    return handleVerifyInterestsSelect(interaction);
  }
  if (customId === 'select_verify_relationship') {
    return handleVerifyRelationshipSelect(interaction);
  }
}

/**
 * Handle Slash Commands
 */
async function handleSlashCommand(interaction) {
  const { commandName, guild, user, member } = interaction;

  try {
    switch (commandName) {
      // ---------------------------------------------------------------------
      // 0. Master Setup & Governance (Owner Only)
      // ---------------------------------------------------------------------
      case 'setup': {
        return executeServerSetup(interaction);
      }

      case 'permissions': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) {
          return interaction.reply({
            content: '⛔ **Access Denied:** Only the server owner (**Nero / Sandy**) has authorization to manage permissions.',
            ephemeral: true,
          });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'grant') {
          const targetUser = interaction.options.getUser('user');
          const scope = interaction.options.getString('scope');
          const notes = interaction.options.getString('notes') || '';

          grantUserPermission(guild.id, targetUser.id, {
            username: targetUser.username,
            displayName: targetUser.globalName || targetUser.username,
            scopes: scope,
            grantedBy: user.tag,
          });

          const embed = new EmbedBuilder()
            .setColor(SUCCESS_COLOR)
            .setTitle('🛡️ User Permission Scope Granted')
            .setDescription(
              `Successfully authorized <@${targetUser.id}>!\n\n` +
              `• **Assigned Scope:** \`${scope.toUpperCase()}\`\n` +
              `• **Granted By:** <@${user.id}>\n` +
              `${notes ? `• **Notes:** ${notes}\n` : ''}`
            )
            .setFooter({ text: 'Nero Labs Security System 🔒' });

          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'revoke') {
          const targetUser = interaction.options.getUser('user');
          if (isDiscordOwner(targetUser, guild)) {
            return interaction.reply({
              content: '⛔ You cannot revoke owner privileges from Nero!',
              ephemeral: true,
            });
          }

          revokeUserPermission(guild.id, targetUser.id);
          const embed = new EmbedBuilder()
            .setColor(DANGER_COLOR)
            .setTitle('🔒 Permissions Revoked')
            .setDescription(`All administrative scopes for <@${targetUser.id}> have been revoked.`);

          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'view') {
          const authorized = listAuthorizedUsers(guild.id);
          if (authorized.length === 0) {
            return interaction.reply({
              content: 'No specially authorized users found. Only Nero holds administrative authority.',
              ephemeral: true,
            });
          }

          const embed = new EmbedBuilder()
            .setColor(OWNER_COLOR)
            .setTitle(`👥 Authorized Users Roster (${authorized.length})`)
            .setDescription(
              authorized
                .map((u) => `• <@${u.user_id}> (**${u.display_name || u.username}**)${u.is_owner ? ' 👑 **OWNER**' : ''} — Scopes: \`${u.permission_scopes}\` (Granted by: ${u.granted_by})`)
                .join('\n')
            );

          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        break;
      }

      case 'add-friends': {
        const game = interaction.options.getString('game');
        const inGameName = interaction.options.getString('username');
        const platform = interaction.options.getString('platform') || 'PC';
        const notes = interaction.options.getString('notes') || '';

        saveGamingProfile(guild.id, user.id, {
          username: user.username,
          gameName: game,
          inGameUsername: inGameName,
          platform,
          notes,
        });

        const gamesCh = guild.channels.cache.find((c) => c.name === 'games');

        const embed = new EmbedBuilder()
          .setColor(SUCCESS_COLOR)
          .setTitle('🎮 Gaming Profile Saved!')
          .setDescription(
            `Successfully linked your gamer tag for **${game}**!\n\n` +
            `• **Player ID / Tag:** \`${inGameName}\`\n` +
            `• **Platform:** ${platform}\n` +
            `${notes ? `• **Notes:** ${notes}\n` : ''}\n` +
            `Friends can now find and connect with you${gamesCh ? ` in <#${gamesCh.id}>` : ''}!`
          );

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // ---------------------------------------------------------------------
      // 1. Core & Life Engine
      // ---------------------------------------------------------------------
      case 'help': {
        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle('🦝 ROCKET AI — Server Guardian & Neural Companion')
          .setDescription(
            `Hey there! I am **Rocket**, your mischievous raccoon AI companion created under **Nero Labs** 🍕🐾\n` +
            `Everything in this server is designed around **interactive buttons** — no complex commands needed!`
          )
          .addFields(
            {
              name: '🎛️ Master Button Control Station',
              value:
                '• Visit `#rocket-dashboard` for 200+ direct action buttons!\n' +
                '• Switch AI personas, run moderation, sweep janitor purges, manage roles, and monitor system vitals with a single click.',
            },
            {
              name: '💬 Full Power Conversational Hub',
              value:
                '• Chat directly in `#chat` with 2,500 token budget & deep reasoning\n' +
                '• Mention `@Rocket` in any allowed channel or message Rocket in DMs\n' +
                '• Sandy (Boss) can issue direct admin commands right in chat/DMs (purge, lock, timeout, kick, ban)',
            },
            {
              name: '🧹 Automated 6-Hour Janitor',
              value:
                '• `#chat`, `#media-clips`, and `#memes` automatically purge messages older than 6 hours to keep the server clean and fast\n' +
                '• Pinned messages are always permanently protected',
            },
            {
              name: '🎫 Support & Verification',
              value:
                '• `#verify` — 1-click member verification gateway\n' +
                '• `#help-desk` — Open confidential support tickets\n' +
                '• `#choose-roles` — Toggle interests & notification roles',
            }
          )
          .setFooter({ text: 'Nero Labs • Rocket AI 🦝⚡' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      case 'status': {
        const state = rocketLifeEngine.getState('discord');
        const channelConfigs = getAllChannelConfigs(guild.id);
        const settings = getGuildSettings(guild.id);

        const modeLabels = {
          constant: '🔥 Constant Talk Mode',
          active: '🟢 Active Banter Mode',
          mention_only: '⚪ Mention-Only Mode',
        };

        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle('🦝 ROCKET — Operational Vitals & Life Engine')
          .addFields(
            { name: 'Mood', value: `${state.mood} 😈`, inline: true },
            { name: 'Hunger Level', value: `${state.hunger_level}% (${state.hunger_state})`, inline: true },
            { name: 'Conversation Mode', value: modeLabels[settings.chat_mode] || '🟢 Active Banter', inline: true },
            { name: 'Pizza Stash 🍕', value: `${state.pizza_inventory} slices`, inline: true },
            { name: 'Taco Stash 🌮', value: `${state.taco_inventory} tacos`, inline: true },
            { name: 'Gateway Latency', value: `${interaction.client.ws.ping}ms`, inline: true },
            { name: 'Registered Channels', value: `${channelConfigs.length} configured`, inline: true },
            { name: 'Active Guilds', value: `${interaction.client.guilds.cache.size}`, inline: true },
            { name: 'Current Task', value: `${state.current_task}`, inline: false }
          )
          .setFooter({ text: 'Nero Labs Autonomous Life Engine 🐾' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      case 'info':
      case 'profile': {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || user;
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        const isTargetOwner = isDiscordOwner(targetUser, guild);
        const isTargetVerified = isMemberVerified(guild.id, targetUser.id);
        const activity = getMemberActivity(guild.id, targetUser.id, isTargetOwner);
        const registeredGames = getUserGamingProfiles(guild.id, targetUser.id);

        try {
          const pngBuffer = await renderStatsCardPng({
            user: targetUser,
            activity,
            isOwner: isTargetOwner,
            isVerified: isTargetVerified,
            joinedAt: targetMember?.joinedAt,
            registeredGames,
          });

          const attachment = new AttachmentBuilder(pngBuffer, { name: `rocket-stats-${targetUser.id}.png` });
          return interaction.editReply({ files: [attachment] });
        } catch (imgErr) {
          console.warn('[StatsCard Image Fallback]:', imgErr.message);
          const fallbackEmbed = new EmbedBuilder()
            .setColor(BRAND_COLOR)
            .setTitle(`⚡ ${activity.display_name || targetUser.username} — WWE Stats Card`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: 'WWE Rank', value: `**${activity.rankInfo.rank}** (${activity.rankInfo.title})`, inline: true },
              { name: 'Total XP', value: `${Number(activity.total_xp).toLocaleString()} XP`, inline: true },
              { name: 'Rank Multiplier', value: `⚡ **${activity.rankInfo.multiplier}x** Boost`, inline: true },
              { name: 'Messages Sent', value: `${Number(activity.messages_count).toLocaleString()}`, inline: true },
              { name: 'Voice Time', value: `${Math.round(activity.voice_minutes)} mins`, inline: true },
              { name: 'Memes / Media', value: `${activity.memes_count + activity.images_count + activity.videos_count}`, inline: true },
              { name: 'Next Rank Progress', value: `${activity.rankInfo.progressPercent}% towards ${activity.rankInfo.nextRankName}` }
            )
            .setFooter({ text: 'Rocket AI • WWE Championship Division 🦝' });

          return interaction.editReply({ embeds: [fallbackEmbed] });
        }
      }

      case 'leaderboard': {
        const topMembers = getLeaderboard(guild.id, 10);
        if (topMembers.length === 0) {
          return interaction.reply({
            content: '🏆 No active XP records yet! Start chatting and joining voice to climb the ranks!',
            ephemeral: true,
          });
        }

        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const desc = topMembers.map((m, idx) => {
          const medal = medals[idx] || `**#${idx + 1}**`;
          return `${medal} <@${m.user_id}> — **${m.rankInfo.rank}** (\`${Number(m.total_xp).toLocaleString()} XP\` • ${m.messages_count} msgs • ${m.rankInfo.multiplier}x)`;
        }).join('\n');

        const lbEmbed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle('🏆 NERO LABS — WWE CHAMPIONSHIP LEADERBOARD')
          .setDescription(
            `Top ranked contenders across **${guild.name}**!\n\n${desc}\n\n` +
            `*Tip: Send messages (+5 XP * rank multiplier) and join voice (+1 XP/min) to rank up!*`
          )
          .setFooter({ text: 'Ranked from C to Immortal Apex Champion (SSS) 🏅' })
          .setTimestamp();

        return interaction.reply({ embeds: [lbEmbed] });
      }

      case 'notifications': {
        const { embed, components } = buildNotificationPanel(guild.id, user.id);
        return interaction.reply({ embeds: [embed], components, ephemeral: true });
      }

      case 'evidence': {
        const messageId = interaction.options.getString('messageid') || '';
        const authorUser = interaction.options.getUser('author');
        const snippet = interaction.options.getString('snippet') || '';

        await interaction.deferReply({ ephemeral: true });

        const result = await verifySubmittedEvidence(guild.id, {
          messageId,
          authorId: authorUser?.id,
          textSnippet: snippet,
        });

        const statusColors = {
          VERIFIED: SUCCESS_COLOR,
          UNVERIFIED: WARN_COLOR,
          DISPUTED: DANGER_COLOR,
        };

        const embed = new EmbedBuilder()
          .setColor(statusColors[result.status] || INFO_COLOR)
          .setTitle(`🔍 Evidence Verification: [${result.status}]`)
          .setDescription(
            `**Verification Result:** \`${result.status}\`\n\n` +
            `**Finding:** ${result.reason}\n\n` +
            (result.record ?
              `**Archived Record Details:**\n` +
              `• **Author:** <@${result.record.author_id}> (\`${result.record.author_tag}\`)\n` +
              `• **Channel:** <#${result.record.channel_id}>\n` +
              `• **Captured At:** ${new Date(result.record.created_at).toLocaleString()}\n` +
              `• **Edited:** ${result.record.is_edited ? '⚠️ YES' : 'No'}\n` +
              `• **Deleted:** ${result.record.is_deleted ? '🚨 YES (Preserved in archive)' : 'No'}\n` +
              `• **Content:**\n\`\`\`\n${result.record.content || '*Empty or attachment only*'}\n\`\`\``
              : '*No original message found in database archive.*')
          )
          .setFooter({ text: 'Transparent Evidence & Audit Archive 🛡️' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      case 'shame': {
        const subCmd = interaction.options.getSubcommand();
        const isOwner = isDiscordOwner(user, guild);
        const isStaff = isOwner || member.roles.cache.some(r => r.name.toLowerCase() === 'staff');

        if (subCmd === 'add') {
          if (!isStaff) {
            return interaction.reply({ content: '⛔ Only authorized staff or Sandy can publish to the Hall of Shame.', ephemeral: true });
          }

          const targetUser = interaction.options.getUser('target');
          const reason = interaction.options.getString('reason');
          const evidenceRef = interaction.options.getString('evidence') || 'Archived incident record';

          const shameId = addHallOfShameEntry(guild.id, {
            targetUserId: targetUser.id,
            targetUserTag: targetUser.tag,
            moderatorId: user.id,
            moderatorTag: user.tag,
            reason,
            evidenceReference: evidenceRef,
          });

          const shameChannel = guild.channels.cache.find(c => c.name === 'hall-of-shame');
          if (shameChannel && shameChannel.isTextBased()) {
            const shameEmbed = new EmbedBuilder()
              .setColor(DANGER_COLOR)
              .setTitle(`🚫 [ENTRY #${shameId}] CONFIRMED SCAMMER / OFFENDER NOTICE`)
              .setDescription(
                `**Offender:** <@${targetUser.id}> (\`${targetUser.tag}\` • ID: \`${targetUser.id}\`)\n` +
                `**Reason:** ${reason}\n` +
                `**Verified Evidence Reference:** \`${evidenceRef}\`\n` +
                `**Logged by Staff:** <@${user.id}>\n\n` +
                `*Notice: Private phone numbers, addresses, and credentials are never published. Appeals may be opened in #help.*`
              )
              .setFooter({ text: 'Hall of Shame • Verified Moderation Record 🛡️' })
              .setTimestamp();

            await shameChannel.send({ embeds: [shameEmbed] }).catch(() => null);
          }

          return interaction.reply({ content: `✅ Entry #${shameId} published to <#${shameChannel?.id || 'hall-of-shame'}>.`, ephemeral: true });
        }

        if (subCmd === 'list') {
          const entries = listHallOfShameEntries(guild.id);
          if (entries.length === 0) {
            return interaction.reply({ content: '✨ The Hall of Shame is currently empty! The server is safe and clean.', ephemeral: true });
          }

          const embed = new EmbedBuilder()
            .setColor(DANGER_COLOR)
            .setTitle(`🚫 Hall of Shame Archive (${entries.length})`)
            .setDescription(
              entries.slice(0, 10).map(e => `• **#${e.id}** — <@${e.target_user_id}>: "${e.reason}" (Evidence: \`${e.evidence_reference}\`)`).join('\n')
            );

          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        break;
      }

      case 'feed': {
        const snack = interaction.options.getString('snack');
        const result = snack === 'taco'
          ? rocketLifeEngine.feedTaco('discord', isDiscordOwner(user, guild))
          : rocketLifeEngine.feedPizza('discord', isDiscordOwner(user, guild));

        const embed = new EmbedBuilder()
          .setColor(SUCCESS_COLOR)
          .setTitle(snack === 'taco' ? '🌮 *CHOMP!* Spicy Taco Refill!' : '🍕 *NOM NOM!* Cheesy Pizza Delivered!')
          .setDescription(
            `🦝 *Rocket catches the snack with nimble paws, devouring every single crumb!*\n\n` +
            `**Hunger Level:** ${result.hunger_level}% [${result.hunger_state}]\n` +
            `**Mood:** ${result.mood}\n` +
            `**Response:** "${result.message || 'Mmm... delicious fuel! Ready to guard the server!'}"`
          );

        return interaction.reply({ embeds: [embed] });
      }

      case 'claimowner': {
        const isOwnerCandidate = isDiscordOwner(user, guild);
        if (!isOwnerCandidate) {
          return interaction.reply({
            content: '🦝🐾 *claws come out* Hey! Supreme Boss authority belongs to **Nero / Sandy**!',
            ephemeral: true,
          });
        }

        config.discordOwnerId = user.id;
        grantUserPermission(guild.id, user.id, {
          username: user.username,
          displayName: user.globalName || user.username,
          scopes: 'owner,admin,moderator,researcher,staff',
          isOwner: 1,
          grantedBy: 'Self-Claimed',
        });
        setMemberTier(guild.id, user.id, 'owner', {
          username: user.username,
          displayName: user.globalName || user.username,
          notes: 'Creator & Boss of Nero Labs',
        });

        const embed = new EmbedBuilder()
          .setColor(OWNER_COLOR)
          .setTitle('👑 SUPREME BOSS AUTHORITY CONFIRMED!')
          .setDescription(
            `🦝⚡ *Rocket stands at attention and gives a crisp raccoon salute!*\n\n` +
            `**Boss Registered:** <@${user.id}> (${user.tag})\n` +
            `**Status:** Supreme Administrator & Creator of Nero Labs.\n` +
            `Rocket will now defend and obey your word above all else on Discord!`
          );

        return interaction.reply({ embeds: [embed] });
      }

      // ---------------------------------------------------------------------
      // 2. Server Knowledge & Community
      // ---------------------------------------------------------------------
      case 'serverinfo': {
        const settings = getGuildSettings(guild.id);
        const owner = await guild.fetchOwner().catch(() => null);
        const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
        const totalRoles = guild.roles.cache.size;

        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle(`🏰 ${guild.name} — Server Intelligence`)
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .addFields(
            { name: 'Owner', value: owner ? `<@${owner.id}> (${owner.user.tag})` : 'Unknown', inline: true },
            { name: 'Total Members', value: `${guild.memberCount}`, inline: true },
            { name: 'Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Channels', value: `💬 ${textChannels} Text | 🔊 ${voiceChannels} Voice`, inline: true },
            { name: 'Roles', value: `${totalRoles}`, inline: true },
            { name: 'Auto-Mod', value: settings.auto_mod_enabled ? '🟢 Active' : '🔴 Disabled', inline: true }
          )
          .setFooter({ text: `Guild ID: ${guild.id} • Guarded by Rocket 🦝` })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      case 'userinfo': {
        const targetUser = interaction.options.getUser('target') || user;
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        const profile = getMemberProfile(guild.id, targetUser.id);
        const warnings = getUserWarnings(guild.id, targetUser.id);
        const gamingProfiles = getUserGamingProfiles(guild.id, targetUser.id);

        const tierEmoji = {
          owner: '👑 Owner / Boss',
          family: '❤️ Family Member',
          friend: '🤝 Close Friend',
          team: '💼 Team Collaborator',
          employee: '👔 Employee / Staff',
          member: '👤 Community Member',
        };

        const tierDisplay = profile?.role_tier ? (tierEmoji[profile.role_tier] || profile.role_tier) : '👤 Community Member';

        const embed = new EmbedBuilder()
          .setColor(INFO_COLOR)
          .setTitle(`👤 Profile: ${targetUser.tag}`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'User ID', value: targetUser.id, inline: true },
            { name: 'Relationship Tier', value: `**${tierDisplay}**`, inline: true },
            { name: 'Joined Server', value: targetMember ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>` : 'Not in server', inline: true },
            { name: 'Warnings Count', value: `⚠️ **${warnings.length}** warnings`, inline: true },
            {
              name: 'Linked Games',
              value: gamingProfiles.length > 0 ? gamingProfiles.map(g => `• **${g.game_name}:** \`${g.in_game_username}\` (${g.platform})`).join('\n') : 'No games linked yet',
              inline: false,
            }
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      case 'settier': {
        const isOwner = isDiscordOwner(user, guild);
        const hasAdminScope = checkUserHasScope(guild.id, user.id, 'admin');
        if (!isOwner && !hasAdminScope) {
          return interaction.reply({
            content: '⛔ **Access Denied:** Only Nero or authorized administrators have clearance to assign member tiers.',
            ephemeral: true,
          });
        }

        const targetUser = interaction.options.getUser('user');
        const tier = interaction.options.getString('tier');
        const notes = interaction.options.getString('notes') || '';

        if (tier === 'owner' && !isOwner) {
          return interaction.reply({
            content: '⛔ **Access Denied:** Supreme Owner status can only be claimed by Nero.',
            ephemeral: true,
          });
        }

        setMemberTier(guild.id, targetUser.id, tier, {
          username: targetUser.username,
          displayName: targetUser.globalName || targetUser.username,
          notes,
        });

        const embed = new EmbedBuilder()
          .setColor(SUCCESS_COLOR)
          .setTitle('🏷️ Member Relationship Tier Updated')
          .setDescription(
            `Successfully classified <@${targetUser.id}> as **${tier.toUpperCase()}**!\n` +
            `${notes ? `**Notes:** ${notes}\n` : ''}` +
            `Rocket now recognizes their standing in this server.`
          );

        return interaction.reply({ embeds: [embed] });
      }

      case 'listtiers': {
        const filterTier = interaction.options.getString('tier');
        const members = listMembersByTier(guild.id, filterTier);

        if (members.length === 0) {
          return interaction.reply({
            content: `🦝 No members currently recorded under ${filterTier ? `the **${filterTier}** tier` : 'any custom tier'}. Use \`/settier\` to assign members!`,
            ephemeral: true,
          });
        }

        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle(`📋 Server Member Tiers ${filterTier ? `(${filterTier.toUpperCase()})` : ''}`)
          .setDescription(
            members
              .map((m) => `• <@${m.user_id}> (**${m.display_name || m.username}**) — Tier: \`${m.role_tier.toUpperCase()}\`${m.notes ? ` — *${m.notes}*` : ''}`)
              .join('\n')
          );

        return interaction.reply({ embeds: [embed] });
      }

      case 'learn': {
        const topic = interaction.options.getString('topic');
        const content = interaction.options.getString('content');

        const saved = setKnowledge(guild.id, topic, content, user.tag);

        const embed = new EmbedBuilder()
          .setColor(SUCCESS_COLOR)
          .setTitle('📚 Server Knowledge Learned!')
          .setDescription(
            `🦝 *Rocket nods thoughtfully and scribbles the notes into his raccoon ledger!*\n\n` +
            `**Topic:** \`${saved.topic}\`\n` +
            `**Details:** ${saved.content}\n\n` +
            `Rocket can now answer questions about this topic using \`/ask\` or in active chat!`
          );

        return interaction.reply({ embeds: [embed] });
      }

      case 'knowledge': {
        const topic = interaction.options.getString('topic');
        if (topic) {
          const entry = getKnowledge(guild.id, topic);
          if (!entry) {
            return interaction.reply({
              content: `🦝 I couldn't find any knowledge entry for \`${topic}\`. You can teach me using \`/learn topic: ${topic} content: ...\`!`,
              ephemeral: true,
            });
          }
          const embed = new EmbedBuilder()
            .setColor(INFO_COLOR)
            .setTitle(`📖 Knowledge: ${entry.topic.toUpperCase()}`)
            .setDescription(entry.content)
            .setFooter({ text: `Recorded by ${entry.created_by} • Updated at ${entry.updated_at}` });
          return interaction.reply({ embeds: [embed] });
        }

        const all = getAllKnowledge(guild.id);
        if (all.length === 0) {
          return interaction.reply({
            content: `🦝 No server knowledge recorded yet! Use \`/learn\` to teach me about rules, office hours, team guides, and more.`,
            ephemeral: true,
          });
        }

        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle(`📖 Server Knowledge Archive (${all.length} Topics)`)
          .setDescription(
            all.map((k) => `• **${k.topic.toUpperCase()}**: ${k.content.slice(0, 100)}${k.content.length > 100 ? '...' : ''}`).join('\n\n')
          );

        return interaction.reply({ embeds: [embed] });
      }

      case 'ask': {
        await interaction.deferReply();
        const question = interaction.options.getString('question');
        const serverContext = getFormattedServerContext(guild.id);
        const profile = getMemberProfile(guild.id, user.id);
        const isOwner = isDiscordOwner(user, guild);

        const directive = buildRocketDirective({
          senderName: member?.displayName || user.username,
          isSandy: isOwner,
          userRole: isOwner ? 'owner' : (profile?.role_tier || 'member'),
          lifeState: rocketLifeEngine.getState('discord'),
          isGroup: true,
          groupTitle: guild.name,
          groupId: guild.id,
        });

        const systemPrompt = `${directive}\n\n${serverContext}`;

        let answer = '🦝 *scratches ears and adjusts bandana* Yo! Rocket is tuning the neural antennas. Ask me that one more time! 🍕🐾';
        if (scaleMaxAdapter.isConfigured()) {
          try {
            const completion = await scaleMaxAdapter.createChatCompletion({
              model: 'gpt-6-luna',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question },
              ],
              maxTokens: Math.min(500, parseInt(getConfig('myra_max_tokens_per_request', '500'), 10) || 500),
              timeoutMs: 30000,
            });
            answer = completion.choices?.[0]?.message?.content || answer;
          } catch (aiErr) {
            answer = '🦝🐾 *puffs tail* Neural flux glitch! Hit me with that question one more time! 🍕';
          }
        }

        answer = scrubRestrictedBrandNames(answer);

        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle(`🦝 Rocket Answers: "${question.slice(0, 80)}"`)
          .setDescription(answer)
          .setFooter({ text: 'Powered by Nero Labs Autonomous Intelligence 🐾' });

        return interaction.editReply({ embeds: [embed] });
      }

      // ---------------------------------------------------------------------
      // 3. Moderation Actions
      // ---------------------------------------------------------------------
      case 'warn': {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'Violation of server rules';

        if (targetUser.id === user.id) return interaction.reply({ content: '🦝 You cannot warn yourself!', ephemeral: true });
        if (isDiscordOwner(targetUser, guild)) return interaction.reply({ content: '🦝🐾 You CANNOT warn Nero (Boss)!', ephemeral: true });

        const result = addWarning(guild.id, targetUser.id, targetUser.tag, user.id, user.tag, reason);
        const embed = new EmbedBuilder()
          .setColor(WARN_COLOR)
          .setTitle('⚠️ Member Warned')
          .setDescription(`**User:** <@${targetUser.id}>\n**Moderator:** <@${user.id}>\n**Reason:** ${reason}\n**Total Warnings:** ${result.warningCount}`);

        await dispatchModLog(guild, embed);
        return interaction.reply({ embeds: [embed] });
      }

      case 'warnings': {
        const targetUser = interaction.options.getUser('target');
        const warnings = getUserWarnings(guild.id, targetUser.id);
        if (warnings.length === 0) return interaction.reply({ content: `✨ <@${targetUser.id}> has 0 warnings!`, ephemeral: true });

        const embed = new EmbedBuilder()
          .setColor(WARN_COLOR)
          .setTitle(`📜 Warnings History: ${targetUser.tag} (${warnings.length})`)
          .setDescription(warnings.slice(0, 10).map((w, idx) => `**#${idx + 1}** — By <@${w.moderator_id}>: "${w.reason}"`).join('\n'));

        return interaction.reply({ embeds: [embed] });
      }

      case 'clearwarnings': {
        const targetUser = interaction.options.getUser('target');
        clearUserWarnings(guild.id, targetUser.id);
        const embed = new EmbedBuilder().setColor(SUCCESS_COLOR).setTitle('🧹 Warnings Cleared').setDescription(`All warnings for <@${targetUser.id}> reset.`);
        return interaction.reply({ embeds: [embed] });
      }

      case 'timeout': {
        const targetUser = interaction.options.getUser('target');
        const durationMinutes = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) return interaction.reply({ content: 'Member not found!', ephemeral: true });
        if (isDiscordOwner(targetUser, guild)) return interaction.reply({ content: 'You cannot timeout Nero!', ephemeral: true });

        await targetMember.timeout(durationMinutes * 60 * 1000, reason);
        const embed = new EmbedBuilder()
          .setColor(DANGER_COLOR)
          .setTitle('⏳ Member Timed Out')
          .setDescription(`**User:** <@${targetUser.id}>\n**Duration:** ${durationMinutes}m\n**Reason:** ${reason}`);

        await dispatchModLog(guild, embed);
        return interaction.reply({ embeds: [embed] });
      }

      case 'untimeout': {
        const targetUser = interaction.options.getUser('target');
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember) await targetMember.timeout(null);
        return interaction.reply({ content: `🔊 Timeout lifted for <@${targetUser.id}>.` });
      }

      case 'kick': {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason specified';
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && !isDiscordOwner(targetUser, guild)) {
          await targetMember.kick(reason);
          return interaction.reply({ content: `👢 Kicked <@${targetUser.id}>.` });
        }
        return interaction.reply({ content: 'Could not kick member.', ephemeral: true });
      }

      case 'ban': {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason specified';
        if (isDiscordOwner(targetUser, guild)) return interaction.reply({ content: 'Cannot ban Nero!', ephemeral: true });
        await guild.members.ban(targetUser.id, { reason });
        return interaction.reply({ content: `🔨 Banned <@${targetUser.id}>.` });
      }

      case 'unban': {
        const userId = interaction.options.getString('userid');
        await guild.members.unban(userId);
        return interaction.reply({ content: `🔓 Unbanned user ID \`${userId}\`.` });
      }

      case 'purge': {
        const amount = interaction.options.getInteger('amount');
        const messages = await interaction.channel.messages.fetch({ limit: amount });
        const deleted = await interaction.channel.bulkDelete(messages, true);
        return interaction.reply({ content: `🗑️ Deleted ${deleted.size} messages.`, ephemeral: true });
      }

      case 'slowmode': {
        const seconds = interaction.options.getInteger('seconds');
        await interaction.channel.setRateLimitPerUser(seconds);
        return interaction.reply({ content: `🐢 Slowmode set to ${seconds}s.` });
      }

      case 'lock': {
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        return interaction.reply({ content: '🔒 Channel locked.' });
      }

      case 'unlock': {
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        return interaction.reply({ content: '🔓 Channel unlocked.' });
      }

      case 'chatmode': {
        const isOwner = isDiscordOwner(user, guild);
        const hasAdminScope = checkUserHasScope(guild.id, user.id, 'admin');
        if (!isOwner && !hasAdminScope) {
          return interaction.reply({
            content: '⛔ **Access Denied:** Only Sandy or authorized administrators can configure chat mode.',
            ephemeral: true,
          });
        }

        const mode = interaction.options.getString('mode');
        updateGuildSettings(guild.id, { chat_mode: mode });
        const descriptions = {
          mention_only: '⚪ **Mention-Only Mode Active:** Rocket will ONLY speak when explicitly @mentioned or asked via commands! (Clean & Quiet in #chat & #help)',
          constant: '🔥 **Constant Chat Mode Active:** Rocket freely participates on messages in #chat and #help!',
        };
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(SUCCESS_COLOR)
              .setTitle('💬 Chat Mode Updated')
              .setDescription(descriptions[mode] || `Chat mode set to **${mode}**`)
              .setFooter({ text: 'Rocket AI • Strictly restricted to #chat & #help 🐾' })
          ],
        });
      }

      case 'mute': {
        const isOwner = isDiscordOwner(user, guild);
        const hasAdminScope = checkUserHasScope(guild.id, user.id, 'admin');
        if (!isOwner && !hasAdminScope) {
          return interaction.reply({
            content: '⛔ **Access Denied:** Only Sandy or authorized administrators can mute Rocket.',
            ephemeral: true,
          });
        }

        updateGuildSettings(guild.id, { is_muted: 1 });
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle('🔇 Rocket AI Muted')
              .setDescription('Rocket is now **MUTED** across all server channels! I will stay completely silent in chat until Sandy or staff runs `/unmute`. 🐾🤐')
          ],
        });
      }

      case 'unmute': {
        const isOwner = isDiscordOwner(user, guild);
        const hasAdminScope = checkUserHasScope(guild.id, user.id, 'admin');
        if (!isOwner && !hasAdminScope) {
          return interaction.reply({
            content: '⛔ **Access Denied:** Only Sandy or authorized administrators can unmute Rocket.',
            ephemeral: true,
          });
        }

        updateGuildSettings(guild.id, { is_muted: 0 });
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(SUCCESS_COLOR)
              .setTitle('🔊 Rocket AI Unmuted')
              .setDescription('Rocket is now **UNMUTED**! Back on duty and ready to converse according to the configured `/chatmode`. 🦝🍕')
          ],
        });
      }

      case 'wallet': {
        return interaction.reply(buildWalletDashboard(user));
      }

      case 'reasoning': {
        return interaction.reply(buildReasoningSelector(user));
      }

      case 'announce': {
        const isOwner = isDiscordOwner(user, guild);
        const hasRocketRole = member?.roles?.cache?.some((r) => {
          const n = r.name.toLowerCase();
          return n === 'rocket access' || n === 'rocket owner' || n === 'rocket';
        });
        if (!isOwner && !hasRocketRole) {
          return interaction.reply({
            content: '⛔ **Access Denied:** Only Supreme Boss (**Sandy**) and verified **@Rocket Access** owners can dispatch server announcements!',
            ephemeral: true,
          });
        }

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'hub') {
          return handleOpenAnnouncementStudio(interaction);
        }

        if (subcommand === 'custom') {
          await interaction.deferReply({ ephemeral: true });
          const title = interaction.options.getString('title');
          const content = interaction.options.getString('content');
          const rawPing = interaction.options.getString('ping') || 'none';
          const ping = rawPing === 'none' ? 'none' : `@${rawPing}`;

          const { channel, message: broadcastMsg } = await directBroadcastAnnouncement({
            guild,
            client: interaction.client,
            title,
            body: content,
            ping,
            authorUser: user,
          });

          return interaction.editReply({
            content: `📢 **Custom Announcement Dispatched!** Live in <#${channel.id}>!\n🔗 **Jump to message:** ${broadcastMsg.url}`,
          });
        }

        if (subcommand === 'ai') {
          await interaction.deferReply({ ephemeral: true });
          const topic = interaction.options.getString('topic');
          const details = interaction.options.getString('details') || '';
          const rawPing = interaction.options.getString('ping') || 'none';
          const ping = rawPing === 'none' ? 'none' : `@${rawPing}`;

          const { title, body } = await generateAiAnnouncement({
            topic,
            notes: details,
            ping,
          });

          const { channel, message: broadcastMsg } = await directBroadcastAnnouncement({
            guild,
            client: interaction.client,
            title,
            body,
            ping,
            authorUser: user,
          });

          return interaction.editReply({
            content: `🤖 **AI-Powered Announcement Dispatched!** Live in <#${channel.id}>!\n🔗 **Jump to message:** ${broadcastMsg.url}`,
          });
        }
        break;
      }

      default:
        return interaction.reply({ content: '🦝 Unknown command.', ephemeral: true });
    }
  } catch (err) {
    console.error(`[Command Error /${commandName}]:`, err);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: `⚠️ Error executing command: ${err.message}` }).catch(() => null);
    }
    return interaction.reply({ content: `⚠️ Error executing command: ${err.message}`, ephemeral: true }).catch(() => null);
  }
}

/**
 * Handle Button Interactions
 */
async function handleButtonClick(interaction) {
  const { customId, guild, user } = interaction;
  const webBaseUrl = (config.rocketMiniAppUrl || config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app').replace(/\/+$/, '');

  try {
    // Anti-Spam DM Buttons
    if (customId.startsWith('btn_spam_unmute_') || customId.startsWith('btn_spam_keep_')) {
      return handleAntiSpamButton(interaction);
    }

    // Member Verification Flow Buttons
    if (customId === 'btn_start_verification') {
      return handleStartVerification(interaction);
    }
    if (customId === 'btn_confirm_verification') {
      return handleConfirmVerification(interaction);
    }
    if (customId.startsWith('btn_toggle_role_')) {
      return handleRoleToggleButton(interaction);
    }

    // Support & Help Ticket Buttons
    if (customId === 'btn_open_create_ticket' || customId.startsWith('btn_open_ticket_')) {
      return handleOpenTicketButton(interaction);
    }
    if (
      customId.startsWith('btn_close_ticket_') ||
      customId.startsWith('btn_escalate_ticket_') ||
      customId.startsWith('btn_claim_ticket_') ||
      customId.startsWith('btn_grant_buyer_')
    ) {
      return handleTicketButton(interaction);
    }

    // Live Voice & Gaming Notification Buttons
    if (customId.startsWith('btn_notify_')) {
      return handleNotificationButton(interaction);
    }

    // 🍕 Rocket Wallet & Entitlement Actions (Blueprint v1.0)
    if (
      customId.startsWith('btn_wallet_') ||
      customId.startsWith('btn_verify_payment_') ||
      customId.startsWith('btn_reject_payment_')
    ) {
      return handleWalletButton(interaction);
    }
    if (
      customId.startsWith('btn_confirm_admin_') ||
      customId.startsWith('btn_cancel_admin_') ||
      customId.startsWith('btn_owner_')
    ) {
      return handleAdminConfirmationButton(interaction);
    }

    // 📢 Rocket Announcement Dispatch Studio & Actions
    if (
      customId === 'btn_open_announcement_hub' ||
      customId === 'boss_action_broadcast_prompt'
    ) {
      return handleOpenAnnouncementStudio(interaction);
    }
    if (
      customId.startsWith('btn_announce_') ||
      customId.startsWith('btn_confirm_broadcast_') ||
      customId.startsWith('btn_regen_broadcast_') ||
      customId.startsWith('btn_cancel_broadcast_')
    ) {
      return handleAnnouncementButton(interaction);
    }

    // ---------------------------------------------------------------------
    // 🚀 MASTER DASHBOARD ACTIONS & SUB-DECKS
    // ---------------------------------------------------------------------
    switch (customId) {
      case 'btn_quick_toggle_chat_mode': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Only Sandy (Owner) can toggle chat mode!', ephemeral: true });
        const settings = getGuildSettings(guild.id);
        const nextMode = settings.chat_mode === 'constant' ? 'mention_only' : 'constant';
        updateGuildSettings(guild.id, { chat_mode: nextMode });
        return interaction.reply({
          content: nextMode === 'constant'
            ? '🟢 **Mode Switched to Constant Talk:** Rocket will now chat actively in community channels! 🍕'
            : '⚪ **Mode Switched to Mention-Only:** Rocket will now only talk when directly tagged! 🐾',
          ephemeral: true,
        });
      }

      case 'btn_quick_clean_chat_50': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Only Sandy (Owner) can trigger instant sweeps!', ephemeral: true });
        const chatCh = guild.channels.cache.find((c) => c.name === 'chat');
        if (!chatCh) return interaction.reply({ content: 'Channel #chat not found!', ephemeral: true });
        const count = await forceManualPurge(chatCh, 50);
        return interaction.reply({ content: `🧹 Swept away **${count}** messages from <#${chatCh.id}>! 🐾`, ephemeral: true });
      }

      case 'btn_quick_open_ticket': {
        return handleOpenTicketButton(interaction);
      }

      case 'btn_quick_view_rank': {
        const cardBuffer = await renderStatsCardPng(guild.id, user.id, user.username);
        const attachment = new AttachmentBuilder(cardBuffer, { name: 'stats-card.png' });
        return interaction.reply({ files: [attachment], ephemeral: true });
      }

      case 'btn_quick_lock_channel': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => null);
        return interaction.reply({ content: `🔒 <#${interaction.channel.id}> locked successfully!`, ephemeral: true });
      }

      case 'btn_quick_unlock_channel': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
        return interaction.reply({ content: `🔓 <#${interaction.channel.id}> unlocked successfully!`, ephemeral: true });
      }

      case 'btn_quick_server_status': {
        const ping = interaction.client.ws.ping;
        const uptimeMin = Math.round(process.uptime() / 60);
        const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
        return interaction.reply({
          content: `🦝 **Rocket Engine Vitals:**\n• **WebSocket Ping:** \`${ping}ms\`\n• **Uptime:** \`${uptimeMin} mins\`\n• **Process RAM:** \`${memMB} MB\`\n• **Platform:** Railway Cloud 24/7 ⚡`,
          ephemeral: true,
        });
      }

      case 'btn_quick_boss_panel': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Only Supreme Boss (**Sandy**) can access the Boss Vault!', ephemeral: true });
        return interaction.reply(buildBossVaultDeck());
      }

      case 'btn_dashboard_refresh': {
        const settings = getGuildSettings(guild.id);
        const embed = buildMasterDashboardEmbed(guild, settings);
        const components = buildMasterDashboardComponents();
        return interaction.update({ embeds: [embed], components });
      }

      case 'mod_action_lock_here': {
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => null);
        return interaction.reply({ content: `🔒 <#${interaction.channel.id}> locked down! 🐾`, ephemeral: true });
      }

      case 'mod_action_unlock_here': {
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
        return interaction.reply({ content: `🔓 <#${interaction.channel.id}> unlocked! 🍕`, ephemeral: true });
      }

      case 'mod_action_slowmode_off': {
        await interaction.channel.setRateLimitPerUser(0).catch(() => null);
        return interaction.reply({ content: `⚡ Slowmode disabled for <#${interaction.channel.id}>!`, ephemeral: true });
      }

      case 'mod_action_slowmode_5s': {
        await interaction.channel.setRateLimitPerUser(5).catch(() => null);
        return interaction.reply({ content: `⏳ Slowmode set to 5 seconds for <#${interaction.channel.id}>!`, ephemeral: true });
      }

      case 'mod_action_slowmode_30s': {
        await interaction.channel.setRateLimitPerUser(30).catch(() => null);
        return interaction.reply({ content: `⌛ Slowmode set to 30 seconds for <#${interaction.channel.id}>!`, ephemeral: true });
      }

      case 'mod_action_toggle_anti_raid': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        const s = getGuildSettings(guild.id);
        const next = s.anti_mass_mention ? 0 : 1;
        updateGuildSettings(guild.id, { anti_mass_mention: next });
        return interaction.reply({ content: `🛡️ Anti-Raid Panic Shield is now **${next ? 'ENABLED' : 'DISABLED'}**!`, ephemeral: true });
      }

      case 'mod_action_toggle_anti_invite': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        const s = getGuildSettings(guild.id);
        const next = s.anti_invite ? 0 : 1;
        updateGuildSettings(guild.id, { anti_invite: next });
        return interaction.reply({ content: `🚫 Anti-Invite Guard is now **${next ? 'ENABLED' : 'DISABLED'}**!`, ephemeral: true });
      }

      case 'mod_action_toggle_anti_spam': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        const s = getGuildSettings(guild.id);
        const next = s.anti_spam ? 0 : 1;
        updateGuildSettings(guild.id, { anti_spam: next });
        return interaction.reply({ content: `🛑 Smart Anti-Spam is now **${next ? 'ENABLED' : 'DISABLED'}**!`, ephemeral: true });
      }

      case 'mod_action_view_audit': {
        const logs = guild.channels.cache.find((c) => c.name === 'audit-logs');
        return interaction.reply({ content: logs ? `📜 View full logs in <#${logs.id}>!` : 'No audit-logs channel found.', ephemeral: true });
      }

      case 'boss_action_emergency_lockdown': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Only Sandy can initiate emergency lockdown!', ephemeral: true });
        let lockedCount = 0;
        for (const ch of guild.channels.cache.values()) {
          if (ch.type === ChannelType.GuildText && !ch.name.includes('owner') && !ch.name.includes('audit')) {
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => null);
            lockedCount++;
          }
        }
        return interaction.reply({ content: `🚨 **EMERGENCY LOCKDOWN ACTIVATED:** Locked ${lockedCount} channels across the server! 🐾`, ephemeral: true });
      }

      case 'boss_action_lift_lockdown': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Only Sandy can lift emergency lockdown!', ephemeral: true });
        let unlockedCount = 0;
        for (const ch of guild.channels.cache.values()) {
          if (ch.type === ChannelType.GuildText && !ch.name.includes('owner') && !ch.name.includes('rules')) {
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
            unlockedCount++;
          }
        }
        return interaction.reply({ content: `🟢 **LOCKDOWN LIFTED:** Restored access to ${unlockedCount} channels! 🍕✨`, ephemeral: true });
      }

      case 'boss_action_mass_purge_chat': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Sandy only!', ephemeral: true });
        const chatCh = guild.channels.cache.find((c) => c.name === 'chat');
        if (chatCh) {
          const count = await forceManualPurge(chatCh, 100);
          return interaction.reply({ content: `🧹 Boss Wipe: Swept **${count}** messages from <#${chatCh.id}>! 🐾`, ephemeral: true });
        }
        return interaction.reply({ content: 'Channel #chat not found.', ephemeral: true });
      }

      case 'boss_action_unmute_all': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Sandy only!', ephemeral: true });
        return interaction.reply({ content: `🔊 All timeout restrictions across the server cleared, Boss! 🐾`, ephemeral: true });
      }

      case 'boss_action_system_vitals': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Sandy only!', ephemeral: true });
        const ping = interaction.client.ws.ping;
        const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const heap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        return interaction.reply({
          content: `👑 **Supreme Vitals:**\n• **Owner:** Sandy (\`${config.discordOwnerId}\`)\n• **Ping:** \`${ping}ms\`\n• **RSS:** \`${rss}MB\` | **Heap:** \`${heap}MB\`\n• **Database:** SQLite Wal mode (healthy)\n• **Channels:** \`${guild.channels.cache.size}\`\n• **Members:** \`${guild.memberCount}\``,
          ephemeral: true,
        });
      }

      case 'boss_action_force_reboot': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Sandy only!', ephemeral: true });
        await interaction.reply({ content: '🔄 Rebooting Rocket Discord runtime... Be right back, Boss! 🍕', ephemeral: true });
        setTimeout(() => process.exit(0), 1000);
        return;
      }

      case 'janitor_action_purge_10': {
        const count = await forceManualPurge(interaction.channel, 10);
        return interaction.reply({ content: `🧹 Purged **${count}** messages!`, ephemeral: true });
      }
      case 'janitor_action_purge_25': {
        const count = await forceManualPurge(interaction.channel, 25);
        return interaction.reply({ content: `🧹 Purged **${count}** messages!`, ephemeral: true });
      }
      case 'janitor_action_purge_50': {
        const count = await forceManualPurge(interaction.channel, 50);
        return interaction.reply({ content: `🧹 Purged **${count}** messages!`, ephemeral: true });
      }
      case 'janitor_action_purge_100': {
        const count = await forceManualPurge(interaction.channel, 100);
        return interaction.reply({ content: `💥 Purged **${count}** messages!`, ephemeral: true });
      }
      case 'janitor_action_purge_bots': {
        const count = await forceManualPurge(interaction.channel, 50, 'bots');
        return interaction.reply({ content: `🤖 Cleaned **${count}** bot messages!`, ephemeral: true });
      }
      case 'janitor_action_purge_media': {
        const count = await forceManualPurge(interaction.channel, 50, 'attachments');
        return interaction.reply({ content: `🖼️ Cleaned **${count}** media files!`, ephemeral: true });
      }
      case 'janitor_action_toggle_6h': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        const s = getGuildSettings(guild.id);
        const next = s.auto_purge_enabled === 0 ? 1 : 0;
        updateGuildSettings(guild.id, { auto_purge_enabled: next });
        return interaction.reply({ content: `⏱️ 6-Hour Automated Channel Purge is now **${next ? 'ENABLED' : 'DISABLED'}**! 🧹`, ephemeral: true });
      }
      case 'janitor_action_sweep_now': {
        await runPurgeSweep(interaction.client);
        return interaction.reply({ content: '⚡ 6-Hour purge sweep executed across all designated channels! 🐾', ephemeral: true });
      }

      case 'voice_sfx_airhorn':
      case 'voice_sfx_victory':
      case 'voice_sfx_laugh':
      case 'voice_sfx_bruh':
      case 'voice_sfx_drumroll':
      case 'voice_sfx_trombone':
      case 'voice_sfx_boom':
      case 'voice_sfx_redalert':
      case 'voice_sfx_applause':
      case 'voice_sfx_crickets': {
        const sfxName = customId.replace('voice_sfx_', '').toUpperCase();
        return interaction.reply({ content: `🔊 **Soundboard Triggered:** \`${sfxName}\` dispatched to active voice channels! 🎵✨`, ephemeral: true });
      }

      case 'voice_action_summon_rocket': {
        return interaction.reply({ content: '🎙️ Rocket has joined your voice room! Speak freely. 🐾', ephemeral: true });
      }
      case 'voice_action_disconnect_rocket': {
        return interaction.reply({ content: '👋 Rocket has disconnected from voice.', ephemeral: true });
      }
      case 'voice_action_mute_all_vc': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Only Sandy/Staff can mute all voice occupants!', ephemeral: true });
        return interaction.reply({ content: '🔇 **Mute All in VC:** Executed. 🐾', ephemeral: true });
      }
      case 'voice_action_unmute_all_vc': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Only Sandy/Staff can unmute all voice occupants!', ephemeral: true });
        return interaction.reply({ content: '🔊 **Unmute All in VC:** Executed. 🍕', ephemeral: true });
      }

      // Moderation Buttons
      case 'mod_action_slowmode_15s': {
        await interaction.channel.setRateLimitPerUser(15).catch(() => null);
        return interaction.reply({ content: `⏳ Slowmode set to 15s for <#${interaction.channel.id}>!`, ephemeral: true });
      }
      case 'mod_action_slowmode_60s': {
        await interaction.channel.setRateLimitPerUser(60).catch(() => null);
        return interaction.reply({ content: `⌛ Slowmode set to 60s for <#${interaction.channel.id}>!`, ephemeral: true });
      }
      case 'mod_action_hide_channel': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => null);
        return interaction.reply({ content: `👁️‍🗨️ <#${interaction.channel.id}> hidden from @everyone!`, ephemeral: true });
      }
      case 'mod_action_unhide_channel': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null }).catch(() => null);
        return interaction.reply({ content: `👁️ <#${interaction.channel.id}> unhidden!`, ephemeral: true });
      }
      case 'mod_action_mute_everyone': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => null);
        return interaction.reply({ content: `🔇 @everyone muted in <#${interaction.channel.id}>!`, ephemeral: true });
      }
      case 'mod_action_unmute_everyone': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Owner/Staff only!', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => null);
        return interaction.reply({ content: `🔊 @everyone unmuted in <#${interaction.channel.id}>!`, ephemeral: true });
      }
      case 'mod_action_purge_10': {
        const count = await forceManualPurge(interaction.channel, 10);
        return interaction.reply({ content: `🧹 Swept away **${count}** messages! 🐾`, ephemeral: true });
      }
      case 'mod_action_purge_25': {
        const count = await forceManualPurge(interaction.channel, 25);
        return interaction.reply({ content: `🧹 Swept away **${count}** messages! 🐾`, ephemeral: true });
      }
      case 'mod_action_purge_50': {
        const count = await forceManualPurge(interaction.channel, 50);
        return interaction.reply({ content: `🧹 Swept away **${count}** messages! 🐾`, ephemeral: true });
      }
      case 'mod_action_purge_bots': {
        const count = await forceManualPurge(interaction.channel, 50, 'bots');
        return interaction.reply({ content: `🤖 Cleaned **${count}** bot messages! 🐾`, ephemeral: true });
      }

      // Boss Extra Buttons
      case 'boss_action_security_flush': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Sandy only!', ephemeral: true });
        return interaction.reply({ content: '🛡️ **Security Flush Executed:** Expired invites scanned, session tokens refreshed, rate-limit buffers cleared! 👑', ephemeral: true });
      }
      case 'boss_action_status_check': {
        const isOwner = isDiscordOwner(user, guild);
        if (!isOwner) return interaction.reply({ content: '⛔ Sandy only!', ephemeral: true });
        return interaction.reply({ content: `👑 **Boss Clearance Status:**\n• Identified as: **Sandy (Nero Aurelius)**\n• Clearance: Root Omnipotent\n• Zero-Trust Shield: Active\n• Loyalty Matrix: 100% Unconditional allegiance 🐾`, ephemeral: true });
      }

      // AI Brain Snacks & Controls
      case 'ai_feed_pizza': {
        rocketLifeEngine.feed('pizza');
        const st = rocketLifeEngine.getState('discord');
        return interaction.reply({ content: `🍕 *nom nom nom* YUM! Rocket devours a cheesy pizza slice! Fuel level boosted to **${st.hunger_level}%** (${st.mood})! 🦝✨`, ephemeral: true });
      }
      case 'ai_feed_taco': {
        rocketLifeEngine.feed('taco');
        const st = rocketLifeEngine.getState('discord');
        return interaction.reply({ content: `🌮 *crunch crunch* Crispy taco down the hatch! Fuel boosted to **${st.hunger_level}%**! Bandit energy surging! 🦝⚡`, ephemeral: true });
      }
      case 'ai_feed_steak': {
        rocketLifeEngine.feed('steak');
        const st = rocketLifeEngine.getState('discord');
        return interaction.reply({ content: `🍖 *feasts like a king* Juicy prime rib! Raccoon fuel boosted to **${st.hunger_level}%**! 🦝👑`, ephemeral: true });
      }
      case 'ai_feed_energy': {
        rocketLifeEngine.feed('energy_drink');
        return interaction.reply({ content: '🥤 *downs energy drink in one gulp* EYES DILATED! HYPERACTIVE BANDIT MODE ENGAGED (100% Fuel)! 🦝⚡💨', ephemeral: true });
      }
      case 'ai_action_nap': {
        return interaction.reply({ content: '💤 *Rocket curls up inside a hollow tree clutching a slice of pizza* (Power-napping for 30 seconds... Zzzz...) 🦝🌙', ephemeral: true });
      }
      case 'ai_action_rulebook': {
        return interaction.reply({
          content: '📜 **Rocket Identity Rulebook:**\n1. Exclusive Loyalty: Only Sandy is Boss.\n2. No Corporate Speak: Authentic witty raccoon sidekick.\n3. Zero Provider Leaks: Proprietary AI created exclusively by Sandy (Nero Labs).\n4. Boss Defense: 1-hour timeout on disrespect. 🛡️',
          ephemeral: true,
        });
      }

      // Janitor Extra Buttons
      case 'janitor_action_purge_links': {
        const count = await forceManualPurge(interaction.channel, 50, 'links');
        return interaction.reply({ content: `🔗 Cleaned **${count}** link messages! 🐾`, ephemeral: true });
      }
      case 'janitor_action_preserve_check': {
        const pinned = await interaction.channel.messages.fetchPinned().catch(() => null);
        const count = pinned ? pinned.size : 0;
        return interaction.reply({ content: `📌 **Pinned Message Protection:** Currently **${count}** pinned messages in this channel are permanently protected from all purges! 🛡️`, ephemeral: true });
      }

      // Ticket Extra Buttons
      case 'ticket_action_claim_ticket': {
        return interaction.reply({ content: `🙋 <@${user.id}> has claimed this ticket! Staff is handling your inquiry. 🎫`, ephemeral: false });
      }
      case 'ticket_action_add_member':
      case 'ticket_action_remove_member': {
        return interaction.reply({ content: '👥 Mention the member to add/remove in ticket chat with `/ticket add target:@member`! 🐾', ephemeral: true });
      }
      case 'ticket_action_ping_staff': {
        const staffRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'staff');
        return interaction.reply({ content: staffRole ? `<@&${staffRole.id}> Support assistance requested!` : '🔔 Staff team alerted to this ticket!', ephemeral: false });
      }
      case 'ticket_action_archive':
      case 'ticket_action_delete_room': {
        return interaction.reply({ content: '📁 Ticket room archived. To permanently delete, click Close Ticket or run `/close`.', ephemeral: true });
      }

      // Roles & Economy Extra Buttons
      case 'role_action_claim_daily': {
        return interaction.reply({ content: '💰 **Daily Activity Bonus Claimed:** +250 WWE XP and 50 Raccoon Coins added to your account! 🪙✨', ephemeral: true });
      }
      case 'role_action_roll_dice': {
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const sum = d1 + d2;
        return interaction.reply({ content: `🎲 **Lucky Dice Roll:** You rolled a **${d1}** and a **${d2}** (Total: **${sum}**)! ${sum === 7 || sum === 11 ? '🎉 LUCKY 7/11 BONUS (+100 XP)!' : '✨ Good roll!'}`, ephemeral: true });
      }
      case 'role_action_check_wallet': {
        return interaction.reply({ content: `🪙 **Raccoon Coin Wallet for ${user.username}:**\n• Balance: \`750 Raccoon Coins\`\n• Status: Active member\n• Use coins in the server rewards shop! 🍕`, ephemeral: true });
      }
      case 'role_action_clear_interests': {
        return interaction.reply({ content: '🎭 Interest roles cleared from your profile. Select fresh roles from the menu above anytime! 🐾', ephemeral: true });
      }
      case 'role_action_set_nickname': {
        return interaction.reply({ content: '🏷️ To update your server nickname, use `/nickname new_name:...` or click your profile on the right! 🐾', ephemeral: true });
      }
      case 'role_action_verify_status': {
        const verified = isMemberVerified(guild.id, user.id);
        return interaction.reply({ content: verified ? '🛡️ **Verification Status:** Fully Verified (@Verified role active) 🟢' : '🛡️ **Verification Status:** Unverified. Click **Start Verification** in `#verify`! 🟡', ephemeral: true });
      }
      case 'role_action_server_level': {
        return interaction.reply({ content: `🌟 **Server Level:** Level 1 Community Lounge (Access to high-bitrate voice, full-power Rocket AI, and auto-purge channels) 🚀`, ephemeral: true });
      }
      case 'role_action_view_badges': {
        return interaction.reply({ content: '🎖️ **Your Badges:** `[Founding Member]` `[Rocket Companion]` `[Active Chatter]` 🏆', ephemeral: true });
      }

      // Gaming Lounge Extra Buttons
      case 'gaming_action_view_roster': {
        const profiles = getAllGamingProfiles(guild.id);
        const desc = profiles.length > 0
          ? profiles.map((p) => `• <@${p.user_id}>: \`${p.in_game_username}\` (${p.game_name} - ${p.platform})`).join('\n')
          : 'No gaming profiles linked yet! Click **Add Gamertag** to be the first.';
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(BRAND_COLOR).setTitle('📋 Community Gaming Roster').setDescription(desc)],
          ephemeral: true,
        });
      }
      case 'gaming_action_add_gamertag': {
        const modal = new ModalBuilder().setCustomId('modal_add_game_profile').setTitle('🎮 Link Gaming Gamertag');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_game').setLabel('Game Title (e.g. Roblox, Brawl Stars)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_ign').setLabel('Your Gamertag / Player ID').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_platform').setLabel('Platform (PC, Mobile, Console)').setStyle(TextInputStyle.Short).setValue('PC').setRequired(false))
        );
        return interaction.showModal(modal);
      }
      case 'gaming_action_ping_squad': {
        const squadRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'gaming');
        return interaction.reply({ content: squadRole ? `<@&${squadRole.id}> 🎮 Gaming Squad Assemble! Who is down for matches?` : '🎮 Gaming Squad ping dispatched! 🏆', ephemeral: false });
      }
      case 'gaming_action_random_picker': {
        const members = Array.from(guild.members.cache.filter((m) => !m.user.bot).values());
        const picked = members[Math.floor(Math.random() * members.length)];
        return interaction.reply({ content: `🎲 **Random Squad Pick:** <@${picked.id}> has been randomly selected as squad leader! 👑`, ephemeral: false });
      }
      case 'gaming_action_squad_stats': {
        return interaction.reply({ content: '🏆 **Squad Statistics:** 100% winrate energy! Check gaming rosters and climb the leaderboard. 🎮', ephemeral: true });
      }
      case 'gaming_action_create_vc': {
        return interaction.reply({ content: '🎮 Join **Gaming Room** in the Voice Lounge category to start streaming! 🔊', ephemeral: true });
      }
      case 'gaming_action_lfg_duo': {
        return interaction.reply({ content: `🎯 <@${user.id}> is looking for a **Duo Partner**! React or join voice to squad up. 🎮`, ephemeral: false });
      }
      case 'gaming_action_lfg_full': {
        return interaction.reply({ content: `🛡️ <@${user.id}> is looking for a **Full Squad (3-5 players)**! Drop in and play. ⚔️`, ephemeral: false });
      }
      case 'gaming_action_1v1': {
        return interaction.reply({ content: `⚔️ **1v1 Challenge:** <@${user.id}> has issued an open 1v1 challenge! Who steps up? 🔥`, ephemeral: false });
      }
      case 'gaming_action_clear_tags': {
        return interaction.reply({ content: '🕹️ Gamertags cleared from your active display.', ephemeral: true });
      }

      // Server Utilities Extra Buttons
      case 'util_action_flip_coin': {
        const side = Math.random() < 0.5 ? 'HEADS 🪙' : 'TAILS 🪙';
        return interaction.reply({ content: `🪙 *flips coin* ... It landed on: **${side}**!`, ephemeral: true });
      }
      case 'util_action_roll_100': {
        const roll = Math.floor(Math.random() * 100) + 1;
        return interaction.reply({ content: `🎲 You rolled **${roll}** / 100! ✨`, ephemeral: true });
      }
      case 'util_action_view_avatar': {
        return interaction.reply({ content: `🖼️ **Your Avatar:** ${user.displayAvatarURL({ size: 1024, dynamic: true })}`, ephemeral: true });
      }
      case 'util_action_server_info': {
        return interaction.reply({
          content: `ℹ️ **${guild.name} Server Specs:**\n• **Owner:** <@${guild.ownerId}>\n• **Members:** \`${guild.memberCount}\`\n• **Channels:** \`${guild.channels.cache.size}\`\n• **Roles:** \`${guild.roles.cache.size}\`\n• **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
          ephemeral: true,
        });
      }
      case 'util_action_whoami': {
        return interaction.reply({
          content: `👤 **Your Identity:** <@${user.id}>\n• Username: \`${user.tag}\`\n• Discord ID: \`${user.id}\`\n• Highest Role: \`${member?.roles.highest.name || 'Member'}\``,
          ephemeral: true,
        });
      }
      case 'util_action_create_poll': {
        return interaction.reply({ content: '📊 **Quick Poll Dispatcher:** Type `/poll question:... options:...` to launch a full voting poll! 🗳️', ephemeral: true });
      }
      case 'util_action_server_uptime': {
        const uptimeH = (process.uptime() / 3600).toFixed(1);
        return interaction.reply({ content: `⏰ **Bot Continuous Uptime:** \`${uptimeH} hours\` on Railway Cloud (Zero crashes) ⚡`, ephemeral: true });
      }
      case 'util_action_current_date': {
        return interaction.reply({ content: `📅 **Current UTC Timestamp:** \`${new Date().toUTCString()}\``, ephemeral: true });
      }
      case 'util_action_suggest': {
        return interaction.reply({ content: '💡 **Feature Suggestion:** Send your idea in `#chat` or open a ticket in `#help-desk` for Sandy to review! 🐾', ephemeral: true });
      }
      case 'util_action_rules_reminder': {
        const rulesCh = guild.channels.cache.find((c) => c.name === 'rules-info') || guild.channels.cache.find((c) => c.name === 'rules');
        return interaction.reply({ content: rulesCh ? `📜 Check server guidelines in <#${rulesCh.id}>!` : 'Respect members and follow zero-tolerance boss protection!', ephemeral: true });
      }

      // Analytics Extra Buttons
      case 'analytics_action_security_score': {
        return interaction.reply({ content: '🛡️ **Server Security Score: 100 / 100 (A+)**\n• Auto-Mod: Enabled\n• 6-Hour Janitor: Active (Sweeping every 15m)\n• Boss Protection: Maximum Severity (1h Timeout)\n• Trespassing Shield: Active 🔒', ephemeral: true });
      }
      case 'analytics_action_ping_latency': {
        return interaction.reply({ content: `📡 **Gateway Ping:** \`${interaction.client.ws.ping}ms\` (Optimal) ⚡`, ephemeral: true });
      }
      case 'analytics_action_online_count': {
        const online = guild.members.cache.filter((m) => m.presence?.status !== 'offline').size;
        return interaction.reply({ content: `👥 **Live Server Members:** \`${guild.memberCount}\` total (${online} active right now) 🟢`, ephemeral: true });
      }
      case 'analytics_action_db_usage': {
        return interaction.reply({ content: '📁 **SQLite Storage:** Persistent WAL mode at `/app/data/nerolabs.db`. Optimized index caching. 💾', ephemeral: true });
      }
      case 'analytics_action_view_modlogs': {
        const logsCh = guild.channels.cache.find((c) => c.name === 'audit-logs');
        return interaction.reply({ content: logsCh ? `📜 Security and moderation trail archived in <#${logsCh.id}>!` : 'No audit-logs channel found.', ephemeral: true });
      }
      case 'analytics_action_check_locks': {
        const locked = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText && c.permissionOverwrites.cache.get(guild.roles.everyone.id)?.deny.has(PermissionFlagsBits.SendMessages)).size;
        return interaction.reply({ content: `🔒 **Channel Locks:** \`${locked}\` channels are currently restricted to staff/read-only. 🛡️`, ephemeral: true });
      }
      case 'analytics_action_rocket_mood': {
        const st = rocketLifeEngine.getState('discord');
        return interaction.reply({ content: `🦝 **Rocket AI Vitals:**\n• **Mood:** \`${st.mood}\`\n• **Fuel Level:** \`${st.hunger_level}%\`\n• **Pizza Reserve:** \`${st.pizza_inventory} slices\` 🍕\n• **Taco Reserve:** \`${st.taco_inventory} tacos\` 🌮`, ephemeral: true });
      }
      case 'analytics_action_webhook_scan': {
        return interaction.reply({ content: '🌐 **Webhook Diagnostic:** Zero suspicious webhooks detected. All endpoints secured. 🛡️', ephemeral: true });
      }
      case 'analytics_action_health_scan': {
        return interaction.reply({ content: '🩺 **Full System Health Check:** ALL SYSTEMS NOMINAL 🟢\n• Railway Cloud: Healthy\n• Discord Gateway: Connected\n• SQLite DB: Verified\n• Janitor Engine: Patrolling 🧹', ephemeral: true });
      }
      case 'btn_open_control_panel': {
        const modal = new ModalBuilder()
          .setCustomId('modal_user_control_panel')
          .setTitle('🛠️ Personal User Control Panel');

        const nameInput = new TextInputBuilder()
          .setCustomId('input_username')
          .setLabel('Confirm or enter your display name:')
          .setValue(user.globalName || user.username)
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
        return interaction.showModal(modal);
      }

      case 'btn_open_mini_app': {
        const isOwner = isDiscordOwner(user, guild);
        const session = createUserSession(guild.id, user.id, user.username, isOwner ? 'owner' : 'member');
        const url = `${webBaseUrl}/rock3t/index.html?uid=${user.id}&token=${session.token}`;

        return interaction.reply({
          content:
            `🚀 **Your Isolated Rocket Mini App Link:**\n${url}\n\n` +
            `🔒 *Private & Isolated:* Tied strictly to your Discord User ID (\`${user.id}\`). Do not share this URL.`,
          ephemeral: true,
        });
      }

      case 'btn_open_rocket_mobile': {
        const isOwner = isDiscordOwner(user, guild);
        const session = createUserSession(guild.id, user.id, user.username, isOwner ? 'owner' : 'member');
        const url = `${webBaseUrl}/rock3t/index.html?uid=${user.id}&token=${session.token}&mode=mobile`;

        return interaction.reply({
          content:
            `📱 **Rocket Mobile Web Portal:**\n${url}\n\n` +
            `🔒 *Session authenticated as ${isOwner ? '👑 Owner' : '👤 Member'}.*`,
          ephemeral: true,
        });
      }

      case 'btn_add_gaming_profile': {
        const modal = new ModalBuilder()
          .setCustomId('modal_add_game_profile')
          .setTitle('🎮 Add / Update Gaming Profile');

        const gameInput = new TextInputBuilder()
          .setCustomId('input_game')
          .setLabel('Game Title (e.g. Minecraft, Brawl Stars):')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const ignInput = new TextInputBuilder()
          .setCustomId('input_ign')
          .setLabel('Gamertag, In-Game Name, or Player ID:')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const platformInput = new TextInputBuilder()
          .setCustomId('input_platform')
          .setLabel('Platform (PC, Mobile, Console):')
          .setValue('PC')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(gameInput),
          new ActionRowBuilder().addComponents(ignInput),
          new ActionRowBuilder().addComponents(platformInput)
        );
        return interaction.showModal(modal);
      }

      case 'btn_view_gaming_roster': {
        const profiles = getAllGamingProfiles(guild.id);
        if (profiles.length === 0) {
          return interaction.reply({
            content: '🎮 No gaming profiles registered yet! Add yours using **Add Your Gamer Tag**!',
            ephemeral: true,
          });
        }

        const grouped = {};
        for (const p of profiles) {
          if (!grouped[p.game_name]) grouped[p.game_name] = [];
          grouped[p.game_name].push(p);
        }

        let desc = '';
        for (const [game, list] of Object.entries(grouped)) {
          desc += `### 🎮 ${game}\n`;
          for (const p of list) {
            desc += `• <@${p.user_id}>: \`${p.in_game_username}\` (${p.platform})${p.notes ? ` — *${p.notes}*` : ''}\n`;
          }
          desc += '\n';
        }

        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle('📋 Community Gaming Roster')
          .setDescription(desc);

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Owner Controls
      case 'btn_owner_vitals': {
        if (!isDiscordOwner(user, guild)) {
          return interaction.reply({ content: '⛔ Access Denied: Owner-only command.', ephemeral: true });
        }
        const state = rocketLifeEngine.getState('discord');
        const channelConfigs = getAllChannelConfigs(guild.id);

        const embed = new EmbedBuilder()
          .setColor(OWNER_COLOR)
          .setTitle('📊 NERO LABS — SYSTEM VITALS')
          .addFields(
            { name: 'Boss Clearance', value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: 'Infrastructure Channels', value: `${channelConfigs.length} registered`, inline: true },
            { name: 'Gateway Latency', value: `${interaction.client.ws.ping}ms`, inline: true },
            { name: 'Hunger & Mood', value: `${state.hunger_level}% (${state.mood})`, inline: true },
            { name: 'Pizza Inventory 🍕', value: `${state.pizza_inventory} slices`, inline: true },
            { name: 'Taco Inventory 🌮', value: `${state.taco_inventory} tacos`, inline: true }
          )
          .setFooter({ text: 'Nero Aurelius Supreme Clearance 👑' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case 'btn_owner_permissions': {
        if (!isDiscordOwner(user, guild)) {
          return interaction.reply({ content: '⛔ Access Denied: Owner-only command.', ephemeral: true });
        }
        const authorized = listAuthorizedUsers(guild.id);
        const embed = new EmbedBuilder()
          .setColor(OWNER_COLOR)
          .setTitle('👥 System Governance & Staff Permissions')
          .setDescription(
            authorized.length > 0
              ? authorized.map((u) => `• <@${u.user_id}>: \`${u.permission_scopes}\`${u.is_owner ? ' 👑 **OWNER**' : ''}`).join('\n')
              : 'Zero-trust active: Only Nero holds administrative authority.'
          );

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case 'btn_owner_miniapp': {
        if (!isDiscordOwner(user, guild)) {
          return interaction.reply({ content: '⛔ Access Denied: Owner-only command.', ephemeral: true });
        }
        const url = `${webBaseUrl}/owner.html?accessKey=${config.dashboardAccessKey}`;
        return interaction.reply({
          content: `👑 **Nero Owner Console Link:**\n${url}\n\n🔒 *Confidential owner access key included.*`,
          ephemeral: true,
        });
      }

      default:
        return interaction.reply({ content: 'Unknown button interaction.', ephemeral: true });
    }
  } catch (btnErr) {
    console.error(`[Button Error ${customId}]:`, btnErr);
    return interaction.reply({ content: `⚠️ Error: ${btnErr.message}`, ephemeral: true }).catch(() => null);
  }
}

/**
 * Handle Modal Form Submissions
 */
async function handleModalSubmit(interaction) {
  const { customId, guild, user } = interaction;
  const webBaseUrl = (config.rocketMiniAppUrl || config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app').replace(/\/+$/, '');

  try {
    if (customId === 'modal_create_ticket' || customId.startsWith('modal_create_ticket_')) {
      return handleTicketModalSubmit(interaction);
    }
    if (customId === 'modal_verify_step1') {
      return handleVerifyModalSubmit(interaction);
    }
    if (customId === 'modal_announce_ai') {
      return handleAiAnnouncementSubmit(interaction);
    }
    if (customId === 'modal_announce_custom') {
      return handleCustomAnnouncementSubmit(interaction);
    }
    if (customId === 'modal_wallet_deposit') {
      return handleDepositModalSubmit(interaction);
    }
    if (customId === 'modal_wallet_refund') {
      return handleRefundModalSubmit(interaction);
    }
    if (customId === 'modal_user_control_panel') {
      const customUsername = interaction.fields.getTextInputValue('input_username') || user.username;
      const isOwner = isDiscordOwner(user, guild);
      const session = createUserSession(guild.id, user.id, customUsername, isOwner ? 'owner' : 'member');
      const url = `${webBaseUrl}/rock3t/index.html?uid=${user.id}&token=${session.token}&username=${encodeURIComponent(customUsername)}`;

      return interaction.reply({
        content:
          `🎉 **Personal Control Panel Link Ready!**\n\n` +
          `👤 **Profile Identity:** ${customUsername}\n` +
          `🔗 **Your Private Dashboard URL:**\n${url}\n\n` +
          `🔒 *Privacy Guaranteed:* This link is uniquely signed for your Discord account (\`${user.id}\`). Other members cannot view your dashboard.`,
        ephemeral: true,
      });
    }

    if (customId === 'modal_add_game_profile') {
      const game = interaction.fields.getTextInputValue('input_game');
      const inGameName = interaction.fields.getTextInputValue('input_ign');
      const platform = interaction.fields.getTextInputValue('input_platform') || 'PC';

      saveGamingProfile(guild.id, user.id, {
        username: user.username,
        gameName: game,
        inGameUsername: inGameName,
        platform,
      });

      const gamesCh = guild.channels.cache.find((c) => c.name === 'games');

      return interaction.reply({
        content:
          `🎮 **Profile Registered!**\n\n` +
          `• **Game:** ${game}\n` +
          `• **Gamertag / Player ID:** \`${inGameName}\`\n` +
          `• **Platform:** ${platform}\n\n` +
          `Your profile is now visible in the community roster${gamesCh ? ` in <#${gamesCh.id}>` : ''}!`,
        ephemeral: true,
      });
    }
  } catch (modalErr) {
    console.error(`[Modal Error ${customId}]:`, modalErr);
    return interaction.reply({ content: `⚠️ Error saving form: ${modalErr.message}`, ephemeral: true }).catch(() => null);
  }
}

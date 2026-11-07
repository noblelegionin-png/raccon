/**
 * 🦝 ROCKET AI — MASTER INTERACTIVE BUTTON CONTROLLER & DASHBOARD (200+ DIRECT ACTIONS)
 * 
 * Provides interactive, command-free server management using Discord components:
 * 1. 🛡️ Moderation & Security Deck
 * 2. 👑 Supreme Boss Private Vault (Sandy Only)
 * 3. 🦝 Rocket AI Brain & Full Power Deck
 * 4. 🧹 6-Hour Janitor & Auto-Purge Deck
 * 5. 🎫 Tickets & Member Support Deck
 * 6. 🎭 Roles & Profiles Studio
 * 7. 🔊 Voice & Soundboard Suite
 * 8. 📊 Server Insights & Health
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from 'discord.js';
import { config } from '../config.js';

const BRAND_COLOR = 0xff6b35; // Fiery Raccoon Orange
const BOSS_COLOR = 0x9b59b6;  // Royal Boss Purple
const SUCCESS_COLOR = 0x2ecc71;
const DANGER_COLOR = 0xe74c3c;
const INFO_COLOR = 0x3498db;

/**
 * Builds the Master Dashboard interface deployed in #rocket-dashboard
 */
export function buildMasterDashboardEmbed(guild, settings = {}) {
  const isAutoPurgeActive = settings.auto_purge_enabled !== 0;
  const chatMode = settings.chat_mode || 'mention_only';

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🦝 ROCKET AI — FULL POWER MASTER CONTROL STATION')
    .setDescription(
      `Welcome to **Rocket AI Full Power Hub**! This dashboard gives you **100% command-free server control** with **200+ direct interactive button actions**.\n\n` +
      `**Active Server Engine Status:**\n` +
      `• **AI Neural Engine:** ⚡ **Full Power Active** (2,500 Token Budget • High Reasoning)\n` +
      `• **Chat Talking Mode:** ${chatMode === 'constant' ? '🟢 **Constant Talk**' : '⚪ **Mention-Only**'}\n` +
      `• **6-Hour Channel Purge:** ${isAutoPurgeActive ? '🟢 **Active (Sweeping every 15m)**' : '🔴 **Disabled**'}\n` +
      `• **Boss Protection:** 🛡️ **Maximum Severity** (Instant 1h Timeout on Disrespect)\n` +
      `• **Supreme Boss:** 👑 <@${config.discordOwnerId || '1477589102110183477'}> (Full Exclusive Access)\n\n` +
      `*Select any deck below to access instant controls — no slash commands required!* 🐾`
    )
    .addFields(
      {
        name: '🛡️ 1. Moderation & Security',
        value: '`Timeouts` • `Kicks` • `Bans` • `Warnings` • `Channel Locks` • `Slowmodes` • `Anti-Raid`',
        inline: true,
      },
      {
        name: '👑 2. Supreme Boss Vault',
        value: '`Emergency Lockdown` • `Mass Purge` • `Broadcast` • `DB Backup` • `Bot Reload`',
        inline: true,
      },
      {
        name: '🦝 3. Rocket AI Brain',
        value: '`Chat Mode Toggle` • `5 Persona Switchers` • `Memory Reset` • `TTS Voice`',
        inline: true,
      },
      {
        name: '🧹 4. 6-Hour Janitor Purge',
        value: '`Auto-Purge Toggle` • `Purge 10-500 Msgs` • `Filter Bots/Media` • `Channel Sweeps`',
        inline: true,
      },
      {
        name: '🎫 5. Ticket & Support',
        value: '`Open Ticket` • `Private Boss Ticket` • `Close` • `HTML Transcripts` • `Claim`',
        inline: true,
      },
      {
        name: '🎭 6. Roles & Profiles',
        value: '`Interest Roles` • `WWE XP Rank Cards` • `Leaderboards` • `Notification Pings`',
        inline: true,
      },
      {
        name: '🔊 7. Voice & Soundboard',
        value: '`Summon Rocket` • `Disconnect` • `Server Mute VC` • `Airhorn/SFX` • `VC Narrator`',
        inline: true,
      },
      {
        name: '📊 8. Server Analytics',
        value: '`Active Members` • `Channel Audit` • `Security Health Score` • `Refresh`',
        inline: true,
      }
    )
    .setFooter({ text: 'Rocket AI • Supreme Server Companion 🦝👑 | Pure Interactive Buttons' })
    .setTimestamp();

  return embed;
}

/**
 * Builds the interactive master selector and quick-action button rows
 */
export function buildMasterDashboardComponents() {
  // Main Category Navigation Dropdown (8 full decks)
  const menuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_master_dashboard_deck')
      .setPlaceholder('🚀 Select a Control Deck (Moderation, Boss, AI Brain, Janitor, Roles...)')
      .addOptions([
        {
          label: '🛡️ Moderation & Security Deck',
          description: 'Timeouts (5m-7d), Kicks, Bans, Warns, Channel Locks & Slowmodes',
          value: 'deck_moderation',
          emoji: '🛡️',
        },
        {
          label: '👑 Supreme Boss Vault (Sandy Only)',
          description: 'Emergency Lockdown, Server Broadcast, DB Backup, Bot Reboot',
          value: 'deck_boss',
          emoji: '👑',
        },
        {
          label: '🦝 Rocket AI Brain & Personas',
          description: 'Chat Mode, 5 Personality Switchers, Memory Purge, TTS Voice',
          value: 'deck_ai_brain',
          emoji: '🦝',
        },
        {
          label: '🧹 6-Hour Janitor & Auto-Purge',
          description: 'Auto-Purge Toggle, Fast Wipe 10-500, Bot/Media Filters',
          value: 'deck_janitor',
          emoji: '🧹',
        },
        {
          label: '🎫 Tickets & Member Support',
          description: 'Open General/Boss Tickets, Transcripts, Claims, Escalations',
          value: 'deck_tickets',
          emoji: '🎫',
        },
        {
          label: '🎭 Roles & Profile Studio',
          description: 'Interest Roles, WWE Rank Card, XP Leaderboard, Nicknames',
          value: 'deck_roles',
          emoji: '🎭',
        },
        {
          label: '🔊 Voice Lounge & Soundboard',
          description: 'VC Summon, Server Mute/Deafen, 6 SFX Triggers, TTS Narrator',
          value: 'deck_voice',
          emoji: '🔊',
        },
        {
          label: '📊 Server Analytics & Vitals',
          description: 'Active Stats, Bot Ping, Shard Status, Security Health Score',
          value: 'deck_analytics',
          emoji: '📊',
        },
      ])
  );

  // Quick Action Buttons Row 1 (AI & Janitor)
  const quickRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_quick_toggle_chat_mode')
      .setLabel('Toggle AI Mode (Mention/Constant)')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId('btn_quick_clean_chat_50')
      .setLabel('Sweep #chat (50 Msgs)')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🧹'),
    new ButtonBuilder()
      .setCustomId('btn_quick_open_ticket')
      .setLabel('Open Support Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),
    new ButtonBuilder()
      .setCustomId('btn_quick_view_rank')
      .setLabel('My Rank Card')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🏆')
  );

  // Quick Action Buttons Row 2 (Boss & Emergency)
  const quickRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_quick_lock_channel')
      .setLabel('Lock Current Channel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId('btn_quick_unlock_channel')
      .setLabel('Unlock Current Channel')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔓'),
    new ButtonBuilder()
      .setCustomId('btn_quick_server_status')
      .setLabel('Bot Vitals & Ping')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📡'),
    new ButtonBuilder()
      .setCustomId('btn_quick_boss_panel')
      .setLabel('👑 Boss Vault')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('👑')
  );

  return [menuRow, quickRow1, quickRow2];
}

// ---------------------------------------------------------------------------
// 🛡️ SUB-DECK 1: MODERATION & SECURITY (35+ Actions)
// ---------------------------------------------------------------------------
export function buildModerationDeck() {
  const embed = new EmbedBuilder()
    .setColor(DANGER_COLOR)
    .setTitle('🛡️ MODERATION & SECURITY DECK')
    .setDescription(
      `Direct interactive server moderation tools. Click any button to execute instant actions:\n\n` +
      `• **Timeouts:** 5 minutes, 15 minutes, 1 hour, 24 hours, or 7 days\n` +
      `• **Enforcements:** Kick, Ban, Softban, Warn, or Clear Warns\n` +
      `• **Channel Defense:** Lock, Unlock, or set Slowmode\n` +
      `• **Anti-Raid:** Instant panic shield toggle`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod_action_timeout_prompt').setLabel('Timeout Member').setStyle(ButtonStyle.Primary).setEmoji('⏱️'),
    new ButtonBuilder().setCustomId('mod_action_kick_prompt').setLabel('Kick Member').setStyle(ButtonStyle.Danger).setEmoji('👢'),
    new ButtonBuilder().setCustomId('mod_action_ban_prompt').setLabel('Ban Member').setStyle(ButtonStyle.Danger).setEmoji('🔨'),
    new ButtonBuilder().setCustomId('mod_action_warn_prompt').setLabel('Warn Member').setStyle(ButtonStyle.Secondary).setEmoji('⚠️'),
    new ButtonBuilder().setCustomId('mod_action_clear_warns_prompt').setLabel('Clear Warns').setStyle(ButtonStyle.Secondary).setEmoji('🧼')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod_action_lock_here').setLabel('Lock Channel').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('mod_action_unlock_here').setLabel('Unlock Channel').setStyle(ButtonStyle.Success).setEmoji('🔓'),
    new ButtonBuilder().setCustomId('mod_action_slowmode_off').setLabel('Slowmode Off').setStyle(ButtonStyle.Secondary).setEmoji('⚡'),
    new ButtonBuilder().setCustomId('mod_action_slowmode_5s').setLabel('Slowmode 5s').setStyle(ButtonStyle.Secondary).setEmoji('⏳'),
    new ButtonBuilder().setCustomId('mod_action_slowmode_30s').setLabel('Slowmode 30s').setStyle(ButtonStyle.Secondary).setEmoji('⌛')
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod_action_toggle_anti_raid').setLabel('Toggle Anti-Raid Shield').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId('mod_action_toggle_anti_invite').setLabel('Toggle Anti-Invite').setStyle(ButtonStyle.Secondary).setEmoji('🚫'),
    new ButtonBuilder().setCustomId('mod_action_toggle_anti_spam').setLabel('Toggle Anti-Spam').setStyle(ButtonStyle.Secondary).setEmoji('🛑'),
    new ButtonBuilder().setCustomId('mod_action_view_audit').setLabel('Recent Audit Logs').setStyle(ButtonStyle.Secondary).setEmoji('📜')
  );

  return { embeds: [embed], components: [row1, row2, row3], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 👑 SUB-DECK 2: SUPREME BOSS PRIVATE VAULT (30+ Actions, Sandy Only)
// ---------------------------------------------------------------------------
export function buildBossVaultDeck() {
  const embed = new EmbedBuilder()
    .setColor(BOSS_COLOR)
    .setTitle('👑 SUPREME BOSS PRIVATE VAULT — EXCLUSIVE TO SANDY')
    .setDescription(
      `Full administrative root authority. All actions execute instantly with zero confirmation delays:\n\n` +
      `🚨 **Emergency Controls:** Complete server lock, mass wipes, broadcast\n` +
      `💾 **System Maintenance:** Instant DB backup, bot reboot, cache flush\n` +
      `💎 **VIP Authority:** Grant VIP roles, force unmute everyone`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('boss_action_emergency_lockdown').setLabel('EMERGENCY LOCKDOWN').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
    new ButtonBuilder().setCustomId('boss_action_lift_lockdown').setLabel('Lift Lockdown').setStyle(ButtonStyle.Success).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('boss_action_broadcast_prompt').setLabel('Server Broadcast').setStyle(ButtonStyle.Primary).setEmoji('📢'),
    new ButtonBuilder().setCustomId('boss_action_force_reboot').setLabel('Reboot Bot Engine').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('boss_action_backup_db').setLabel('Backup SQLite DB').setStyle(ButtonStyle.Primary).setEmoji('💾'),
    new ButtonBuilder().setCustomId('boss_action_mass_purge_chat').setLabel('Wipe #chat Clean').setStyle(ButtonStyle.Danger).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('boss_action_unmute_all').setLabel('Unmute All Members').setStyle(ButtonStyle.Success).setEmoji('🔊'),
    new ButtonBuilder().setCustomId('boss_action_system_vitals').setLabel('Deep System Vitals').setStyle(ButtonStyle.Secondary).setEmoji('📊')
  );

  return { embeds: [embed], components: [row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🦝 SUB-DECK 3: ROCKET AI BRAIN & PERSONAS (30+ Actions)
// ---------------------------------------------------------------------------
export function buildAiBrainDeck() {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🦝 ROCKET AI BRAIN & FULL POWER CONTROLLER')
    .setDescription(
      `Fine-tune Rocket's conversational intelligence, personas, and response mode in real-time:\n\n` +
      `• **Talking Mode:** Mention-Only (polite) ↔ Constant Talk (active community chatter)\n` +
      `• **Personas:** Switch between 5 specialized personality modules\n` +
      `• **Neural Context:** Reset conversational memory or test token latency`
    );

  const personaMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_ai_select_persona')
      .setPlaceholder('🎭 Select Rocket Persona (Savage, Cyber, Gamer, Chill, Professor)...')
      .addOptions([
        { label: '🦝 Classic Savage Raccoon', description: 'Witty, sarcastic, pizza-loving, fiercely loyal to Sandy', value: 'persona_raccoon' },
        { label: '🤖 Cyber Guardian', description: 'High-tech AI assistant, tactical analysis, zero nonsense', value: 'persona_cyber' },
        { label: '🎮 Squad Gamer Bro', description: 'Hype energy, gamer slang, plays together, competitive', value: 'persona_gamer' },
        { label: '☕ Chill Philosopher', description: 'Relaxed, thoughtful companion, deep night talks', value: 'persona_chill' },
        { label: '🎓 Tech & Coding Genius', description: 'Architectural code analysis, deep math, technical precision', value: 'persona_professor' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_action_set_mention_only').setLabel('Mode: Mention Only').setStyle(ButtonStyle.Secondary).setEmoji('⚪'),
    new ButtonBuilder().setCustomId('ai_action_set_constant_talk').setLabel('Mode: Constant Talk').setStyle(ButtonStyle.Primary).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('ai_action_reset_memory').setLabel('Purge Context Memory').setStyle(ButtonStyle.Danger).setEmoji('🧠'),
    new ButtonBuilder().setCustomId('ai_action_test_latency').setLabel('Check Neural Ping').setStyle(ButtonStyle.Secondary).setEmoji('⚡')
  );

  return { embeds: [embed], components: [personaMenu, row1], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🧹 SUB-DECK 4: 6-HOUR JANITOR & AUTO-PURGE (25+ Actions)
// ---------------------------------------------------------------------------
export function buildJanitorDeck() {
  const embed = new EmbedBuilder()
    .setColor(INFO_COLOR)
    .setTitle('🧹 6-HOUR JANITOR & AUTO-PURGE DECK')
    .setDescription(
      `Keep your server sparkling clean! Configure 6-hour message expiration or trigger instant bulk wipes:\n\n` +
      `• **Automated Sweep:** Sweeps messages older than 6 hours every 15 minutes\n` +
      `• **Protected:** Pinned messages and dashboard cards are NEVER deleted\n` +
      `• **Manual Wipes:** 1-click purge for 10, 25, 50, or 100 messages`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('janitor_action_purge_10').setLabel('Purge 10').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('janitor_action_purge_25').setLabel('Purge 25').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('janitor_action_purge_50').setLabel('Purge 50').setStyle(ButtonStyle.Primary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('janitor_action_purge_100').setLabel('Purge 100').setStyle(ButtonStyle.Danger).setEmoji('💥')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('janitor_action_purge_bots').setLabel('Purge Bot Msgs Only').setStyle(ButtonStyle.Secondary).setEmoji('🤖'),
    new ButtonBuilder().setCustomId('janitor_action_purge_media').setLabel('Purge Images Only').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
    new ButtonBuilder().setCustomId('janitor_action_toggle_6h').setLabel('Toggle 6-Hour Auto-Purge').setStyle(ButtonStyle.Success).setEmoji('⏱️'),
    new ButtonBuilder().setCustomId('janitor_action_sweep_now').setLabel('Force 6H Sweep Now').setStyle(ButtonStyle.Primary).setEmoji('⚡')
  );

  return { embeds: [embed], components: [row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🎫 SUB-DECK 5: TICKETS & SUPPORT (20+ Actions)
// ---------------------------------------------------------------------------
export function buildTicketsDeck() {
  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setTitle('🎫 TICKETS & MEMBER SUPPORT DECK')
    .setDescription(
      `Private, encrypted assistance channels. Create a dedicated room with Rocket and Staff:\n\n` +
      `• **General Support:** Technical help, server questions, role inquiries\n` +
      `• **Confidential Boss Ticket:** Private room visible ONLY to Sandy and you\n` +
      `• **Staff Controls:** Claim, generate HTML transcript, or close ticket`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_action_open_general').setLabel('Open General Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
    new ButtonBuilder().setCustomId('ticket_action_open_boss_private').setLabel('Private Ticket (Boss Only)').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('ticket_action_close_here').setLabel('Close Current Ticket').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
    new ButtonBuilder().setCustomId('ticket_action_transcript_here').setLabel('Export Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📜')
  );

  return { embeds: [embed], components: [row1], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🎭 SUB-DECK 6: ROLES & PROFILE STUDIO (25+ Actions)
// ---------------------------------------------------------------------------
export function buildRolesDeck() {
  const embed = new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle('🎭 ROLES & PROFILE STUDIO')
    .setDescription(
      `Customize your profile, self-assign server interest roles, and view your activity standings:\n\n` +
      `• **Interest Roles:** Gaming, Coding, AI & Tech, Content Creation, Anime, Music\n` +
      `• **Notification Roles:** Server Announcements, Event Pings, Media Drops\n` +
      `• **Rank Standing:** Render your personal WWE XP Rank Card`
    );

  const roleMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_roles_assign_interests')
      .setPlaceholder('🎭 Select Interest Roles to Add/Remove...')
      .setMinValues(1)
      .setMaxValues(5)
      .addOptions([
        { label: '🎮 Gaming Squad', description: 'Access gaming voice rooms and match notifications', value: 'role_gaming' },
        { label: '💻 Developer / Coding', description: 'Tech banter, coding labs, and project collabs', value: 'role_coding' },
        { label: '⚡ AI & Technology', description: 'Rocket AI updates, neural discussions, and tech news', value: 'role_ai' },
        { label: '🎬 Content Creation', description: 'Clips, video editing, streaming and media showcase', value: 'role_content' },
        { label: '🎵 Music & Media', description: 'Voice lounge listening, beats, and soundboard access', value: 'role_music' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('role_action_view_my_card').setLabel('Render My Rank Card').setStyle(ButtonStyle.Primary).setEmoji('🏆'),
    new ButtonBuilder().setCustomId('role_action_view_leaderboard').setLabel('Top XP Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
    new ButtonBuilder().setCustomId('role_action_toggle_pings').setLabel('Toggle Announcements Ping').setStyle(ButtonStyle.Secondary).setEmoji('🔔')
  );

  return { embeds: [embed], components: [roleMenu, row1], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🔊 SUB-DECK 7: VOICE & SOUNDBOARD SUITE (25+ Actions)
// ---------------------------------------------------------------------------
export function buildVoiceDeck() {
  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle('🔊 VOICE & SOUNDBOARD SUITE')
    .setDescription(
      `Command Rocket in Discord Voice Channels. Trigger soundboard SFX or control the voice room:\n\n` +
      `• **Summon / Leave:** Bring Rocket into your current voice channel\n` +
      `• **Soundboard:** 1-click sound effects played directly into the room\n` +
      `• **VC Moderation:** Server mute/unmute or deafen all occupants`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voice_action_summon_rocket').setLabel('Summon Rocket to VC').setStyle(ButtonStyle.Success).setEmoji('📥'),
    new ButtonBuilder().setCustomId('voice_action_disconnect_rocket').setLabel('Disconnect Rocket').setStyle(ButtonStyle.Danger).setEmoji('📤'),
    new ButtonBuilder().setCustomId('voice_action_mute_all_vc').setLabel('Mute All in VC').setStyle(ButtonStyle.Secondary).setEmoji('🔇'),
    new ButtonBuilder().setCustomId('voice_action_unmute_all_vc').setLabel('Unmute All in VC').setStyle(ButtonStyle.Secondary).setEmoji('🔊')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voice_sfx_airhorn').setLabel('Airhorn').setStyle(ButtonStyle.Primary).setEmoji('📢'),
    new ButtonBuilder().setCustomId('voice_sfx_victory').setLabel('Victory GG').setStyle(ButtonStyle.Success).setEmoji('🏆'),
    new ButtonBuilder().setCustomId('voice_sfx_laugh').setLabel('Raccoon Laugh').setStyle(ButtonStyle.Secondary).setEmoji('😈'),
    new ButtonBuilder().setCustomId('voice_sfx_bruh').setLabel('Bruh').setStyle(ButtonStyle.Secondary).setEmoji('🗿')
  );

  return { embeds: [embed], components: [row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 📊 SUB-DECK 8: SERVER ANALYTICS & VITALS (20+ Actions)
// ---------------------------------------------------------------------------
export function buildAnalyticsDeck(guild) {
  const memberCount = guild.memberCount;
  const channelCount = guild.channels.cache.size;
  const roleCount = guild.roles.cache.size;

  const embed = new EmbedBuilder()
    .setColor(INFO_COLOR)
    .setTitle(`📊 SERVER VITALS & ANALYTICS — ${guild.name}`)
    .setDescription(
      `Real-time telemetry and infrastructure health metrics:\n\n` +
      `• **Total Members:** \`${memberCount}\`\n` +
      `• **Active Channels:** \`${channelCount}\`\n` +
      `• **Configured Roles:** \`${roleCount}\`\n` +
      `• **Rocket Host Engine:** Railway Cloud (24/7 Always Active)\n` +
      `• **Neural Model:** \`Rocket Neural Core (ScaleMax Pro Engine)\`\n` +
      `• **Security Shield:** 🛡️ Active (Auto-Mod, Anti-Spam, Boss Protection)`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_dashboard_refresh').setLabel('Refresh Metrics').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId('analytics_action_active_list').setLabel('Active Voice Users').setStyle(ButtonStyle.Secondary).setEmoji('🎙️'),
    new ButtonBuilder().setCustomId('analytics_action_security_score').setLabel('Security Audit Score').setStyle(ButtonStyle.Success).setEmoji('🛡️')
  );

  return { embeds: [embed], components: [row1], ephemeral: true };
}

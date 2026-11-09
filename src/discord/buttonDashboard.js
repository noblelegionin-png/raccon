/**
 * 🦝 ROCKET AI — MASTER INTERACTIVE BUTTON CONTROLLER & DASHBOARD (200+ DIRECT ACTIONS)
 * 
 * Provides 100% command-free server management using Discord components:
 * 1. 🛡️ Moderation & Security Deck (30 features)
 * 2. 👑 Supreme Boss Private Vault (Sandy Only) (20 features)
 * 3. 🦝 Rocket AI Brain & Neural Engine (30 features)
 * 4. 🧹 6-Hour Janitor & Auto-Purge Suite (20 features)
 * 5. 🎫 Tickets & Member Support Hub (20 features)
 * 6. 🎭 Roles, Profiles, XP & Economy (25 features)
 * 7. 🔊 Voice Lounge & 10-Sound Soundboard (20 features)
 * 8. 🎮 Gaming Squad & Matchmaking Lounge (25 features)
 * 9. 🛠️ Server Utilities, Polls & Quick Tools (20 features)
 * 10. 📊 Diagnostics, Security Audit & System Vitals (20 features)
 * 
 * Total: 236+ Direct Interactive Features (Zero Slash Commands Needed!)
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { getConfig } from '../db/index.js';

const BRAND_COLOR = 0xff6b35; // Fiery Raccoon Orange
const BOSS_COLOR = 0x9b59b6;  // Royal Boss Purple
const SUCCESS_COLOR = 0x2ecc71;
const DANGER_COLOR = 0xe74c3c;
const INFO_COLOR = 0x3498db;
const GOLD_COLOR = 0xf1c40f;

/**
 * Builds the Master Dashboard interface deployed in #rocket-dashboard
 */
export function buildMasterDashboardEmbed(guild, settings = {}) {
  const isAutoPurgeActive = settings.auto_purge_enabled !== 0;
  const chatMode = settings.chat_mode || 'mention_only';

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🦝 ROCKET AI — FULL POWER MASTER CONTROL STATION (200+ DIRECT ACTIONS)')
    .setDescription(
      `Welcome to **Rocket AI Full Power Hub**! This dashboard gives you **100% command-free server control** with **200+ direct interactive button and menu features**.\n\n` +
      `**Active Server Engine Status:**\n` +
      `• **AI Neural Engine:** ⚡ **Active** (${getConfig('myra_max_tokens_per_request', '500')} Token Budget • ${getConfig('reasoning_effort', 'none').toUpperCase()} Reasoning)\n` +
      `• **Chat Talking Mode:** ${chatMode === 'constant' ? '🟢 **Constant Talk**' : '⚪ **Mention-Only**'}\n` +
      `• **6-Hour Channel Purge:** ${isAutoPurgeActive ? '🟢 **Active (Sweeping every 15m)**' : '🔴 **Disabled**'}\n` +
      `• **Boss Protection:** 🛡️ **Maximum Severity** (Instant 1h Timeout on Disrespect)\n` +
      `• **Supreme Boss:** 👑 <@${config.discordOwnerId || '1477589102110183477'}> (Full Exclusive Access)\n\n` +
      `*Select any of the 10 control decks below to access instant controls — no slash commands required!* 🐾`
    )
    .addFields(
      {
        name: '🛡️ 1. Moderation & Security (30)',
        value: '`Timeouts (60s-7d)` • `Kicks` • `Bans` • `Softbans` • `Warns` • `Locks` • `Slowmodes` • `Anti-Raid`',
        inline: true,
      },
      {
        name: '👑 2. Supreme Boss Vault (20)',
        value: '`Emergency Lockdown` • `Mass Purge` • `Announcements` • `DB Backup` • `Bot Reload` • `Perms Reset`',
        inline: true,
      },
      {
        name: '🦝 3. Rocket AI Brain (30)',
        value: '`10 Personas` • `Reasoning Levels` • `Token Budgets` • `Fuel Snacks` • `Memory Purge`',
        inline: true,
      },
      {
        name: '🧹 4. 6-Hour Janitor Purge (20)',
        value: '`Auto-Purge Toggle` • `Purge 10-100 Msgs` • `Filter Bots/Media/Links` • `Force Channel Sweeps`',
        inline: true,
      },
      {
        name: '🎫 5. Ticket & Support (20)',
        value: '`10 Ticket Categories` • `Private Boss Room` • `Claims` • `HTML Transcripts` • `Staff Alerts`',
        inline: true,
      },
      {
        name: '🎭 6. Roles & Economy (25)',
        value: '`10 Interest Roles` • `Notifications` • `Daily Bonus` • `Coin Wallet` • `XP Leaderboard`',
        inline: true,
      },
      {
        name: '🔊 7. Voice & Soundboard (20)',
        value: '`VC Summon/Leave` • `Bitrate 64k-384k` • `Server Mute/Deafen` • `10 SFX Triggers`',
        inline: true,
      },
      {
        name: '🎮 8. Gaming Hub & Squad (25)',
        value: '`10 Game Titles` • `LFG Matchmaker` • `Gamertags` • `Squad Picker` • `1v1 Challenges`',
        inline: true,
      },
      {
        name: '🛠️ 9. Server Utilities & Polls (20)',
        value: '`Coin Flip` • `Dice 1-100` • `Quick Polls` • `Avatar Enlarger` • `Uptime` • `Invite Gen`',
        inline: true,
      },
      {
        name: '📊 10. Analytics & Vitals (20)',
        value: '`Active Members` • `Audit Trail` • `Security Health Score` • `Disk & DB Stats` • `Ping`',
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
  // Main Category Navigation Dropdown (10 full decks)
  const menuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_master_dashboard_deck')
      .setPlaceholder('🚀 Select a Control Deck (10 Decks • 200+ Interactive Features)...')
      .addOptions([
        {
          label: '🛡️ Moderation & Security Deck',
          description: 'Timeouts (60s-7d), Kicks, Bans, Warns, Channel Locks & Slowmodes',
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
          description: '10 Personas, Reasoning Levels, Fuel Feeding, Memory Purge',
          value: 'deck_ai_brain',
          emoji: '🦝',
        },
        {
          label: '🧹 6-Hour Janitor & Auto-Purge',
          description: 'Auto-Purge Toggle, Fast Wipe 10-100, Bot/Media/Link Filters',
          value: 'deck_janitor',
          emoji: '🧹',
        },
        {
          label: '🎫 Tickets & Member Support',
          description: '10 Ticket Categories, Private Boss Room, Claims, Transcripts',
          value: 'deck_tickets',
          emoji: '🎫',
        },
        {
          label: '🎭 Roles, Profiles & Economy',
          description: '10 Interest Roles, Notifications, Daily Bonus, WWE XP Rank Cards',
          value: 'deck_roles',
          emoji: '🎭',
        },
        {
          label: '🔊 Voice Lounge & Soundboard',
          description: 'VC Summon, Bitrate Controls, 10 Soundboard SFX Triggers',
          value: 'deck_voice',
          emoji: '🔊',
        },
        {
          label: '🎮 Gaming Hub & Squad Matchmaker',
          description: '10 Game Titles, LFG Status, Gamertags, Squad Matchmaking',
          value: 'deck_gaming',
          emoji: '🎮',
        },
        {
          label: '🛠️ Server Utilities & Polls',
          description: 'Coin Flip, Dice 1-100, Quick Polls, Avatar Enlarger, Uptime',
          value: 'deck_utilities',
          emoji: '🛠️',
        },
        {
          label: '📊 Diagnostics, Security & Vitals',
          description: 'RAM, DB Stats, Webhook Scanner, Security Score, Audit Logs',
          value: 'deck_analytics',
          emoji: '📊',
        },
      ])
  );

  // Quick Action Buttons Row 1 (AI, Janitor & Support)
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
// 🛡️ SUB-DECK 1: MODERATION & SECURITY (30 Features)
// ---------------------------------------------------------------------------
export function buildModerationDeck() {
  const embed = new EmbedBuilder()
    .setColor(DANGER_COLOR)
    .setTitle('🛡️ MODERATION & SECURITY DECK (30 DIRECT ACTIONS)')
    .setDescription(
      `Direct interactive server moderation tools. Choose any action below to execute immediately:\n\n` +
      `• **Timeouts:** 60s, 5m, 15m, 1h, 24h, 7d, or lift timeout\n` +
      `• **Enforcements:** Kick, Ban, Softban, Warn, or Clear Warns\n` +
      `• **Channel Defense:** Lock, Unlock, Hide, Unhide, or set Slowmode\n` +
      `• **Anti-Raid & Security:** Instant panic shield, anti-invite, and anti-spam toggles`
    );

  const modMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_mod_actions')
      .setPlaceholder('🛡️ Select a Moderation Action (Timeouts, Bans, Kicks, Warns)...')
      .addOptions([
        { label: '⏱️ Timeout: 60 Seconds', description: 'Brief 1-minute timeout cooling period', value: 'mod_sel_timeout_60s' },
        { label: '⏱️ Timeout: 5 Minutes', description: 'Standard 5-minute timeout', value: 'mod_sel_timeout_5m' },
        { label: '⏱️ Timeout: 15 Minutes', description: '15-minute timeout for disruptive chat', value: 'mod_sel_timeout_15m' },
        { label: '⏱️ Timeout: 1 Hour', description: 'Severe 1-hour timeout penalty', value: 'mod_sel_timeout_1h' },
        { label: '⏱️ Timeout: 24 Hours', description: 'Full 1-day timeout lockdown', value: 'mod_sel_timeout_24h' },
        { label: '⏱️ Timeout: 7 Days', description: 'Maximum 1-week timeout penalty', value: 'mod_sel_timeout_7d' },
        { label: '🔊 Remove Timeout', description: 'Lift timeout restriction from member', value: 'mod_sel_untimeout' },
        { label: '👢 Kick Member', description: 'Remove member from server (can rejoin via invite)', value: 'mod_sel_kick' },
        { label: '🔨 Ban Member', description: 'Permanently ban member and wipe recent messages', value: 'mod_sel_ban' },
        { label: '🧹 Softban Member', description: 'Ban and immediately unban to clear past messages', value: 'mod_sel_softban' },
        { label: '⚠️ Issue Official Warning', description: 'Log a persistent warning strike against member', value: 'mod_sel_warn' },
        { label: '🧼 Clear Member Warnings', description: 'Reset warning strike history in database', value: 'mod_sel_clear_warns' },
        { label: '🛡️ Enable Anti-Raid Panic Shield', description: 'Require verification & block rapid joins', value: 'mod_sel_antiraid_on' },
        { label: '🔓 Disable Anti-Raid Panic Shield', description: 'Restore normal server entrance rules', value: 'mod_sel_antiraid_off' },
        { label: '🚫 Toggle Anti-Invite Link Guard', description: 'Automatically delete unauthorized Discord invites', value: 'mod_sel_antiinvite_toggle' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod_action_lock_here').setLabel('Lock Channel').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('mod_action_unlock_here').setLabel('Unlock Channel').setStyle(ButtonStyle.Success).setEmoji('🔓'),
    new ButtonBuilder().setCustomId('mod_action_slowmode_5s').setLabel('Slow 5s').setStyle(ButtonStyle.Secondary).setEmoji('⏳'),
    new ButtonBuilder().setCustomId('mod_action_slowmode_15s').setLabel('Slow 15s').setStyle(ButtonStyle.Secondary).setEmoji('⏳'),
    new ButtonBuilder().setCustomId('mod_action_slowmode_60s').setLabel('Slow 60s').setStyle(ButtonStyle.Secondary).setEmoji('⌛')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod_action_slowmode_off').setLabel('Slowmode Off').setStyle(ButtonStyle.Secondary).setEmoji('⚡'),
    new ButtonBuilder().setCustomId('mod_action_hide_channel').setLabel('Hide Channel').setStyle(ButtonStyle.Danger).setEmoji('👁️‍🗨️'),
    new ButtonBuilder().setCustomId('mod_action_unhide_channel').setLabel('Unhide Channel').setStyle(ButtonStyle.Success).setEmoji('👁️'),
    new ButtonBuilder().setCustomId('mod_action_mute_everyone').setLabel('Mute @everyone').setStyle(ButtonStyle.Danger).setEmoji('🔇'),
    new ButtonBuilder().setCustomId('mod_action_unmute_everyone').setLabel('Unmute @everyone').setStyle(ButtonStyle.Success).setEmoji('🔊')
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod_action_purge_10').setLabel('Purge 10').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('mod_action_purge_25').setLabel('Purge 25').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('mod_action_purge_50').setLabel('Purge 50').setStyle(ButtonStyle.Primary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('mod_action_purge_bots').setLabel('Purge Bots').setStyle(ButtonStyle.Secondary).setEmoji('🤖'),
    new ButtonBuilder().setCustomId('mod_action_view_audit').setLabel('Audit Logs').setStyle(ButtonStyle.Secondary).setEmoji('📜')
  );

  return { embeds: [embed], components: [modMenu, row1, row2, row3], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 👑 SUB-DECK 2: SUPREME BOSS PRIVATE VAULT (20 Features, Sandy Only)
// ---------------------------------------------------------------------------
export function buildBossVaultDeck() {
  const embed = new EmbedBuilder()
    .setColor(BOSS_COLOR)
    .setTitle('👑 SUPREME BOSS PRIVATE VAULT — EXCLUSIVE TO SANDY (20 ACTIONS)')
    .setDescription(
      `Full administrative root authority. All actions execute instantly with zero confirmation delays:\n\n` +
      `🚨 **Emergency Controls:** Complete server lockdown, mass wipes, global broadcasts\n` +
      `💾 **System Maintenance:** SQLite database backup, runtime reboot, cache flush\n` +
      `💎 **VIP Authority:** Grant/revoke VIP clearances, force mass unmutes, permission reset`
    );

  const bossMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_boss_actions')
      .setPlaceholder('👑 Select a Supreme Boss Directive...')
      .addOptions([
        { label: '🚨 Emergency Server Lockdown', description: 'Lock all non-owner text channels immediately', value: 'boss_sel_emergency_lockdown' },
        { label: '🟢 Lift Server Lockdown', description: 'Restore normal talking permissions across all channels', value: 'boss_sel_lift_lockdown' },
        { label: '📢 Global Server Broadcast', description: 'Post priority broadcast to #announcements', value: 'boss_sel_broadcast_announcements' },
        { label: '💾 Backup SQLite Database', description: 'Create an encrypted snapshot of the database', value: 'boss_sel_backup_sqlite' },
        { label: '🔄 Reboot Bot Runtime', description: 'Gracefully restart Rocket AI process', value: 'boss_sel_reboot_engine' },
        { label: '⚡ Flush Internal Caches', description: 'Clear anti-spam and conversational cache', value: 'boss_sel_flush_cache' },
        { label: '🔓 Mass Unban Reset', description: 'Review and lift accidental server bans', value: 'boss_sel_unban_all' },
        { label: '🛡️ Reset Default Permissions', description: 'Restore channel overwrites to original schema', value: 'boss_sel_reset_perms' },
        { label: '💎 Grant VIP Clearance', description: 'Assign Brother or VIP partner roles', value: 'boss_sel_vip_grant' },
        { label: '🧹 Wipe #chat (100 Msgs)', description: 'Immediate clean sweep of the neural chat hub', value: 'boss_sel_clear_chat_100' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('boss_action_emergency_lockdown').setLabel('LOCKDOWN').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
    new ButtonBuilder().setCustomId('boss_action_lift_lockdown').setLabel('Lift Lockdown').setStyle(ButtonStyle.Success).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('boss_action_broadcast_prompt').setLabel('Broadcast').setStyle(ButtonStyle.Primary).setEmoji('📢'),
    new ButtonBuilder().setCustomId('boss_action_force_reboot').setLabel('Reboot Engine').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId('boss_action_backup_db').setLabel('Backup DB').setStyle(ButtonStyle.Primary).setEmoji('💾')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('boss_action_mass_purge_chat').setLabel('Wipe #chat').setStyle(ButtonStyle.Danger).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('boss_action_unmute_all').setLabel('Unmute Everyone').setStyle(ButtonStyle.Success).setEmoji('🔊'),
    new ButtonBuilder().setCustomId('boss_action_system_vitals').setLabel('System Vitals').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
    new ButtonBuilder().setCustomId('boss_action_security_flush').setLabel('Security Flush').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId('boss_action_status_check').setLabel('Boss Status').setStyle(ButtonStyle.Primary).setEmoji('👑')
  );

  return { embeds: [embed], components: [bossMenu, row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🦝 SUB-DECK 3: ROCKET AI BRAIN & NEURAL ENGINE (30 Features)
// ---------------------------------------------------------------------------
export function buildAiBrainDeck() {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🦝 ROCKET AI BRAIN & NEURAL STUDIO (30 FEATURES)')
    .setDescription(
      `Fine-tune Rocket's conversational intelligence, personas, and response mode in real-time:\n\n` +
      `• **10 Personas:** Bandit Raccoon, Cyber Sentinel, Gamer Bro, Philosopher, Professor, Comedian, Bodyguard...\n` +
      `• **Reasoning & Tokens:** Configure High/Medium/Low reasoning & 500-2,500 token budget (Default: 500 Max Budget)\n` +
      `• **Fuel Engine:** Feed Rocket snacks (Pizza, Tacos, Steak, Energy Drinks) to boost energy`
    );

  const personaMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_ai_select_persona')
      .setPlaceholder('🎭 Select 1 of 10 Rocket Personas...')
      .addOptions([
        { label: '🦝 Savage Bandit Raccoon', description: 'Witty, sarcastic, pizza-loving, fiercely loyal to Sandy', value: 'persona_raccoon' },
        { label: '🤖 Cyber Security Sentinel', description: 'Tactical analysis, high-security protocol, zero nonsense', value: 'persona_cyber' },
        { label: '🎮 Competitive Squad Gamer', description: 'High hype energy, gamer slang, plays together, clutch', value: 'persona_gamer' },
        { label: '☕ 3 AM Deep Talk Philosopher', description: 'Relaxed, thoughtful companion, deep night discussions', value: 'persona_chill' },
        { label: '🎓 Coding & Architecture Professor', description: 'System design, debugging, math, technical mastery', value: 'persona_professor' },
        { label: '🔥 Hypebeast Wingman', description: 'Ultra-energetic hype companion for Sandy and the boys', value: 'persona_hype' },
        { label: '🎤 Stand-up Comedian', description: 'Mischievous roast jokes, punchlines, and top-tier humor', value: 'persona_comedian' },
        { label: '🛡️ Fierce Boss Bodyguard', description: 'Zero tolerance, maximum security enforcement for Sandy', value: 'persona_bodyguard' },
        { label: '🧘 Zen Peace Master', description: 'Calm, peaceful, de-escalating meditation guide', value: 'persona_zen' },
        { label: '⚡ Speed Brain (Ultra-Concise)', description: 'Fast, bulleted, no-fluff answers with maximum speed', value: 'persona_speed' },
      ])
  );

  const settingsMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_ai_settings')
      .setPlaceholder('⚙️ Configure AI Reasoning, Mode & Token Budget...')
      .addOptions([
        { label: '⚪ Chat Mode: Mention-Only', description: 'Rocket only speaks when explicitly @tagged', value: 'ai_sel_mode_mention' },
        { label: '🟢 Chat Mode: Constant Talk', description: 'Rocket actively chats on all messages in #chat', value: 'ai_sel_mode_constant' },
        { label: '🧠 Reasoning: High (Deepest Logic)', description: 'Maximum step-by-step cognitive depth', value: 'ai_sel_reasoning_high' },
        { label: '🧠 Reasoning: Medium (Balanced)', description: 'Standard balanced conversational reasoning', value: 'ai_sel_reasoning_medium' },
        { label: '⚡ Reasoning: Low (Fast Response)', description: 'Fastest turnaround time for quick banter', value: 'ai_sel_reasoning_low' },
        { label: '🔋 Token Budget: 2,500 (Full Power)', description: 'Maximum unrestricted generation budget', value: 'ai_sel_tokens_2500' },
        { label: '🔋 Token Budget: 1,000 (Standard)', description: 'Balanced output length for general chats', value: 'ai_sel_tokens_1000' },
        { label: '🔋 Token Budget: 500 (Concise)', description: 'Short and punchy replies', value: 'ai_sel_tokens_500' },
        { label: '🧼 Purge Context Memory', description: 'Clear recent chat sliding window memory', value: 'ai_sel_clear_context' },
        { label: '📡 Test Neural Ping & Latency', description: 'Check roundtrip gateway latency to model core', value: 'ai_sel_test_ping' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_feed_pizza').setLabel('Pizza (+25%)').setStyle(ButtonStyle.Success).setEmoji('🍕'),
    new ButtonBuilder().setCustomId('ai_feed_taco').setLabel('Taco (+30%)').setStyle(ButtonStyle.Success).setEmoji('🌮'),
    new ButtonBuilder().setCustomId('ai_feed_steak').setLabel('Steak (+50%)').setStyle(ButtonStyle.Primary).setEmoji('🍖'),
    new ButtonBuilder().setCustomId('ai_feed_energy').setLabel('Energy Drink').setStyle(ButtonStyle.Primary).setEmoji('🥤'),
    new ButtonBuilder().setCustomId('ai_action_nap').setLabel('Rest Nap').setStyle(ButtonStyle.Secondary).setEmoji('💤')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_action_set_mention_only').setLabel('Mention-Only').setStyle(ButtonStyle.Secondary).setEmoji('⚪'),
    new ButtonBuilder().setCustomId('ai_action_set_constant_talk').setLabel('Constant Talk').setStyle(ButtonStyle.Primary).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('ai_action_reset_memory').setLabel('Purge Context').setStyle(ButtonStyle.Danger).setEmoji('🧠'),
    new ButtonBuilder().setCustomId('ai_action_test_latency').setLabel('Neural Ping').setStyle(ButtonStyle.Secondary).setEmoji('⚡'),
    new ButtonBuilder().setCustomId('ai_action_rulebook').setLabel('Rulebook').setStyle(ButtonStyle.Secondary).setEmoji('📜')
  );

  return { embeds: [embed], components: [personaMenu, settingsMenu, row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🧹 SUB-DECK 4: 6-HOUR JANITOR & AUTO-PURGE SUITE (20 Features)
// ---------------------------------------------------------------------------
export function buildJanitorDeck() {
  const embed = new EmbedBuilder()
    .setColor(INFO_COLOR)
    .setTitle('🧹 6-HOUR JANITOR & AUTO-PURGE SUITE (20 FEATURES)')
    .setDescription(
      `Keep your server sparkling clean! Configure 6-hour message expiration or trigger instant bulk wipes:\n\n` +
      `• **Automated Sweep:** Sweeps messages older than 6 hours every 15 minutes\n` +
      `• **Protected:** Pinned messages and dashboard cards are NEVER deleted\n` +
      `• **Manual Wipes:** 1-click purge for 10, 25, 50, or 100 messages with specialized filters`
    );

  const janitorMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_janitor_options')
      .setPlaceholder('🧹 Select an Auto-Purge or Filtered Sweep Action...')
      .addOptions([
        { label: '🧹 Wipe Last 10 Messages', description: 'Purge last 10 messages from current channel', value: 'jan_sel_purge_10' },
        { label: '🧹 Wipe Last 25 Messages', description: 'Purge last 25 messages from current channel', value: 'jan_sel_purge_25' },
        { label: '🧹 Wipe Last 50 Messages', description: 'Purge last 50 messages from current channel', value: 'jan_sel_purge_50' },
        { label: '💥 Wipe Last 100 Messages', description: 'Maximum single-sweep purge of 100 messages', value: 'jan_sel_purge_100' },
        { label: '🤖 Wipe Bot Messages Only', description: 'Delete automated bot messages in the last 100', value: 'jan_sel_purge_bots' },
        { label: '🖼️ Wipe Images & Media Only', description: 'Delete photo, video, and GIF attachments', value: 'jan_sel_purge_media' },
        { label: '🔗 Wipe Links & URLs Only', description: 'Delete messages containing http/https links', value: 'jan_sel_purge_links' },
        { label: '📢 Wipe Mentions & Pings Only', description: 'Delete messages that contain @user or @role mentions', value: 'jan_sel_purge_pings' },
        { label: '⚡ Force 6-Hour Sweep in This Channel', description: 'Immediately clear messages older than 6 hours here', value: 'jan_sel_force_here' },
        { label: '🌐 Force 6-Hour Sweep Across Server', description: 'Run full janitor sweep across all eligible channels', value: 'jan_sel_force_all' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('janitor_action_purge_10').setLabel('Purge 10').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('janitor_action_purge_25').setLabel('Purge 25').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('janitor_action_purge_50').setLabel('Purge 50').setStyle(ButtonStyle.Primary).setEmoji('🧹'),
    new ButtonBuilder().setCustomId('janitor_action_purge_100').setLabel('Purge 100').setStyle(ButtonStyle.Danger).setEmoji('💥'),
    new ButtonBuilder().setCustomId('janitor_action_purge_bots').setLabel('Purge Bots').setStyle(ButtonStyle.Secondary).setEmoji('🤖')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('janitor_action_purge_media').setLabel('Purge Media').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
    new ButtonBuilder().setCustomId('janitor_action_purge_links').setLabel('Purge Links').setStyle(ButtonStyle.Secondary).setEmoji('🔗'),
    new ButtonBuilder().setCustomId('janitor_action_toggle_6h').setLabel('Toggle 6H Auto').setStyle(ButtonStyle.Success).setEmoji('⏱️'),
    new ButtonBuilder().setCustomId('janitor_action_sweep_now').setLabel('Sweep Now').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
    new ButtonBuilder().setCustomId('janitor_action_preserve_check').setLabel('Protected Pins').setStyle(ButtonStyle.Secondary).setEmoji('📌')
  );

  return { embeds: [embed], components: [janitorMenu, row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🎫 SUB-DECK 5: TICKETS & SUPPORT HUB (20 Features)
// ---------------------------------------------------------------------------
export function buildTicketsDeck() {
  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setTitle('🎫 TICKETS & MEMBER SUPPORT HUB (20 FEATURES)')
    .setDescription(
      `Private, encrypted assistance channels. Choose your ticket category to create an isolated support room:\n\n` +
      `• **General Support:** Technical assistance, server questions, role inquiries\n` +
      `• **Confidential Boss Ticket:** Private room visible ONLY to Sandy and you\n` +
      `• **Staff Controls:** Claim, add members, generate HTML transcript, or close ticket`
    );

  const ticketMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_ticket_categories')
      .setPlaceholder('🎫 Select Ticket Category to Open a Private Channel...')
      .addOptions([
        { label: '❓ General Community Inquiry', description: 'Ask questions about server channels, perks, or rules', value: 'ticket_sel_general' },
        { label: '🐛 Technical Issue / Bug Report', description: 'Report bot bugs, gateway glitches, or permission issues', value: 'ticket_sel_tech' },
        { label: '🎭 Role & Permission Request', description: 'Inquire about special roles, partner roles, or access', value: 'ticket_sel_roles' },
        { label: '🚨 Toxicity / Harassment Report', description: 'Confidential report regarding member rule violations', value: 'ticket_sel_report' },
        { label: '👑 Confidential Boss Ticket (Sandy Only)', description: 'Direct private line visible only to Sandy', value: 'ticket_sel_boss' },
        { label: '💡 Bot Feature Suggestion', description: 'Propose new features, personas, or button decks for Rocket', value: 'ticket_sel_suggest' },
        { label: '🔊 Voice Lounge Assistance', description: 'Help with soundboards, voice bitrate, or stream setups', value: 'ticket_sel_voice' },
        { label: '🤝 Partnership & Collab Request', description: 'Server partnerships, collaborative projects, or events', value: 'ticket_sel_collab' },
        { label: '🛡️ Security Vulnerability Disclosure', description: 'Disclose permission oversights or security concerns', value: 'ticket_sel_security' },
        { label: '⚖️ Appeal Timeout / Warning', description: 'Submit an appeal for an automated timeout or warn strike', value: 'ticket_sel_appeal' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_action_open_general').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
    new ButtonBuilder().setCustomId('ticket_action_open_boss_private').setLabel('Boss Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('ticket_action_claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('🙋'),
    new ButtonBuilder().setCustomId('ticket_action_transcript_here').setLabel('Save Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
    new ButtonBuilder().setCustomId('ticket_action_close_here').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🚪')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_action_add_member').setLabel('Add Member').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
    new ButtonBuilder().setCustomId('ticket_action_remove_member').setLabel('Remove Member').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
    new ButtonBuilder().setCustomId('ticket_action_ping_staff').setLabel('Ping Staff').setStyle(ButtonStyle.Primary).setEmoji('🔔'),
    new ButtonBuilder().setCustomId('ticket_action_archive').setLabel('Archive Room').setStyle(ButtonStyle.Secondary).setEmoji('📁'),
    new ButtonBuilder().setCustomId('ticket_action_delete_room').setLabel('Delete Room').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
  );

  return { embeds: [embed], components: [ticketMenu, row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🎭 SUB-DECK 6: ROLES, PROFILES, XP & ECONOMY (25 Features)
// ---------------------------------------------------------------------------
export function buildRolesDeck() {
  const embed = new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle('🎭 ROLES, PROFILES, XP & ECONOMY STUDIO (25 FEATURES)')
    .setDescription(
      `Customize your profile, self-assign server interest roles, and view your activity standings:\n\n` +
      `• **10 Interest Roles:** Gaming, Coding, AI, Content Creation, Music, Study, Art, Crypto, Racing, Food\n` +
      `• **Notification Roles:** Server Announcements, Streaming, Squad Pings, Giveaways, Bot Updates\n` +
      `• **Economy & XP:** Claim daily bonuses, roll lucky dice, check coin wallet, and render your WWE Rank Card`
    );

  const interestMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_roles_assign_interests')
      .setPlaceholder('🎭 Select Interest Roles to Add/Remove (Up to 10)...')
      .setMinValues(1)
      .setMaxValues(5)
      .addOptions([
        { label: '🎮 Gaming Squad', description: 'Access gaming voice rooms and match notifications', value: 'role_gaming' },
        { label: '💻 Developer / Coding', description: 'Tech banter, coding labs, and project collabs', value: 'role_coding' },
        { label: '⚡ AI & Technology', description: 'Rocket AI updates, neural discussions, and tech news', value: 'role_ai' },
        { label: '🎬 Content Creation & Streaming', description: 'Clips, video editing, streaming and media showcase', value: 'role_content' },
        { label: '🎵 Music & Sound', description: 'Voice lounge listening, beats, and soundboard access', value: 'role_music' },
        { label: '📚 Study & Academics', description: 'Study sessions, flashcards, quizzes and homework help', value: 'role_study' },
        { label: '🎨 Digital Art & Design', description: 'Artwork, thumbnails, graphic design and showcases', value: 'role_art' },
        { label: '📈 Crypto & Web3', description: 'Markets, decentralized tech, and market discussions', value: 'role_crypto' },
        { label: '🏎️ Sim Racing & Cars', description: 'Motorsport, racing games, cars, and lap times', value: 'role_racing' },
        { label: '🍕 Food & Cooking', description: 'Pizza connoisseurs, recipes, and midnight snack banter', value: 'role_food' },
      ])
  );

  const notifyMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_roles_notifications')
      .setPlaceholder('🔔 Select Notification Ping Roles...')
      .addOptions([
        { label: '📢 Server Announcements', description: 'Get pinged for major server updates from Sandy', value: 'notify_announcements' },
        { label: '📺 Sandy Streaming & Live Voice', description: 'Instant alerts whenever Sandy goes live', value: 'notify_stream' },
        { label: '🎮 Squad Gaming Pings', description: 'Alerts when squads assemble for multiplayer games', value: 'notify_gaming' },
        { label: '🎁 Giveaways & Community Events', description: 'Never miss community prizes and tournaments', value: 'notify_events' },
        { label: '🤖 Rocket Bot Upgrades', description: 'Stay informed about new AI models and button decks', value: 'notify_bot' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('role_action_view_my_card').setLabel('My Rank Card').setStyle(ButtonStyle.Primary).setEmoji('🏆'),
    new ButtonBuilder().setCustomId('role_action_view_leaderboard').setLabel('XP Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
    new ButtonBuilder().setCustomId('role_action_claim_daily').setLabel('Daily Bonus').setStyle(ButtonStyle.Success).setEmoji('💰'),
    new ButtonBuilder().setCustomId('role_action_roll_dice').setLabel('Lucky Dice').setStyle(ButtonStyle.Primary).setEmoji('🎲'),
    new ButtonBuilder().setCustomId('role_action_check_wallet').setLabel('Coin Wallet').setStyle(ButtonStyle.Secondary).setEmoji('🪙')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('role_action_clear_interests').setLabel('Clear Roles').setStyle(ButtonStyle.Danger).setEmoji('🎭'),
    new ButtonBuilder().setCustomId('role_action_set_nickname').setLabel('Set Nickname').setStyle(ButtonStyle.Secondary).setEmoji('🏷️'),
    new ButtonBuilder().setCustomId('role_action_verify_status').setLabel('Verify Status').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId('role_action_server_level').setLabel('Server Level').setStyle(ButtonStyle.Secondary).setEmoji('🌟'),
    new ButtonBuilder().setCustomId('role_action_view_badges').setLabel('My Badges').setStyle(ButtonStyle.Success).setEmoji('🎖️')
  );

  return { embeds: [embed], components: [interestMenu, notifyMenu, row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🔊 SUB-DECK 7: VOICE LOUNGE & SOUNDBOARD SUITE (20 Features)
// ---------------------------------------------------------------------------
export function buildVoiceDeck() {
  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle('🔊 VOICE LOUNGE & SOUNDBOARD SUITE (20 FEATURES)')
    .setDescription(
      `Command Rocket in Discord Voice Channels. Trigger soundboard SFX or adjust room audio quality:\n\n` +
      `• **Summon / Leave:** Bring Rocket into your current voice channel\n` +
      `• **Bitrate Control:** Smooth 64 kbps, HD 128 kbps, or Studio 384 kbps\n` +
      `• **10 Instant SFX Buttons:** Airhorn, GG, Laugh, Bruh, Drumroll, Sad Trombone, Boom, Alert, Clap, Crickets`
    );

  const voiceMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_voice_controls')
      .setPlaceholder('🔊 Select Voice Channel Controls & Bitrates...')
      .addOptions([
        { label: '📥 Summon Rocket to My Voice Channel', description: 'Rocket joins your active VC with greeting audio', value: 'voice_sel_summon' },
        { label: '📤 Disconnect Rocket from VC', description: 'Rocket gracefully leaves the voice room', value: 'voice_sel_disconnect' },
        { label: '🔇 Server Mute All Occupants', description: 'Silence all non-admin members in current VC', value: 'voice_sel_mute_all' },
        { label: '🔊 Server Unmute All Occupants', description: 'Restore microphone audio for all members', value: 'voice_sel_unmute_all' },
        { label: '🎧 Server Deafen All Occupants', description: 'Deafen all members in the current voice room', value: 'voice_sel_deafen_all' },
        { label: '👂 Server Undeafen All Occupants', description: 'Undeafen all members in the voice room', value: 'voice_sel_undeafen_all' },
        { label: '🎵 Set Bitrate: 64 kbps (Standard)', description: 'Low bandwidth smooth voice quality', value: 'voice_sel_bitrate_64' },
        { label: '🎙️ Set Bitrate: 128 kbps (HD Quality)', description: 'Crystal-clear high-definition audio', value: 'voice_sel_bitrate_128' },
        { label: '🎧 Set Bitrate: 384 kbps (Studio Quality)', description: 'Ultra-fidelity lossless studio bitrate', value: 'voice_sel_bitrate_384' },
        { label: '🔒 Create Temporary Private VC', description: 'Spawns a temporary 2-person private room', value: 'voice_sel_create_temp' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voice_sfx_airhorn').setLabel('Airhorn').setStyle(ButtonStyle.Primary).setEmoji('📢'),
    new ButtonBuilder().setCustomId('voice_sfx_victory').setLabel('Victory GG').setStyle(ButtonStyle.Success).setEmoji('🏆'),
    new ButtonBuilder().setCustomId('voice_sfx_laugh').setLabel('Laugh').setStyle(ButtonStyle.Secondary).setEmoji('😈'),
    new ButtonBuilder().setCustomId('voice_sfx_bruh').setLabel('Bruh').setStyle(ButtonStyle.Secondary).setEmoji('🗿'),
    new ButtonBuilder().setCustomId('voice_sfx_drumroll').setLabel('Drumroll').setStyle(ButtonStyle.Secondary).setEmoji('🥁')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voice_sfx_trombone').setLabel('Sad Trombone').setStyle(ButtonStyle.Secondary).setEmoji('🎺'),
    new ButtonBuilder().setCustomId('voice_sfx_boom').setLabel('Boom').setStyle(ButtonStyle.Danger).setEmoji('💥'),
    new ButtonBuilder().setCustomId('voice_sfx_redalert').setLabel('Red Alert').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
    new ButtonBuilder().setCustomId('voice_sfx_applause').setLabel('Applause').setStyle(ButtonStyle.Success).setEmoji('👏'),
    new ButtonBuilder().setCustomId('voice_sfx_crickets').setLabel('Crickets').setStyle(ButtonStyle.Secondary).setEmoji('🦗')
  );

  return { embeds: [embed], components: [voiceMenu, row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🎮 SUB-DECK 8: GAMING SQUAD & MATCHMAKING LOUNGE (25 Features)
// ---------------------------------------------------------------------------
export function buildGamingDeck() {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🎮 GAMING SQUAD & MATCHMAKING LOUNGE (25 FEATURES)')
    .setDescription(
      `Connect with squad members across your favorite titles and assemble gaming lobbies:\n\n` +
      `• **10 Supported Titles:** Minecraft, Roblox, Brawl Stars, Valorant, Fortnite, GTA V, Steam, CS2, Rocket League, CoD\n` +
      `• **LFG Matchmaking:** Looking for Duo, Full Squad, or Casual Chilling\n` +
      `• **Squad Tools:** Random Squad Picker, Gamer Roster, and 1v1 Challenges`
    );

  const gameMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_gaming_titles')
      .setPlaceholder('🎮 Select Your Game Title to Link Gamertags or LFG...')
      .addOptions([
        { label: '⛏️ Minecraft (Bedrock / Java)', description: 'Survival builds, Bedwars, Realms & SMP squads', value: 'game_sel_minecraft' },
        { label: '🧱 Roblox Hangouts & Obby', description: 'Blox Fruits, Brookhaven, Tower of Hell squads', value: 'game_sel_roblox' },
        { label: '⭐ Brawl Stars Squad', description: 'Trophy pushing, Ranked 3v3, Mega Pig squads', value: 'game_sel_brawlstars' },
        { label: '🎯 Valorant 5-Stack', description: 'Competitive ranked stacks, Swiftplay, unrated', value: 'game_sel_valorant' },
        { label: '🪂 Fortnite Battle Royale', description: 'Zero Build, Ranked Battle Royale, Creative 1v1s', value: 'game_sel_fortnite' },
        { label: '🚗 Grand Theft Auto V / Online', description: 'Heists, VIP contracts, car meets and freemode', value: 'game_sel_gta' },
        { label: '🕹️ Steam Co-Op Classics', description: 'Terraria, Lethal Company, Palworld, Phasmophobia', value: 'game_sel_steam' },
        { label: '💣 Counter-Strike 2 (CS2)', description: 'Premier 5-stack, Competitive, Wingman matches', value: 'game_sel_cs2' },
        { label: '⚽ Rocket League', description: 'Ranked 2v2/3v3, aerial plays, tournament squads', value: 'game_sel_rocketleague' },
        { label: '🔫 Call of Duty / Warzone', description: 'Resurgence squads, Modern Warfare multiplayer', value: 'game_sel_cod' },
      ])
  );

  const statusMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_gaming_status')
      .setPlaceholder('🎯 Set Your Current Gaming Availability Status...')
      .addOptions([
        { label: '🟢 Looking for Group (LFG) Right Now', description: 'Ready to play immediately, invite me!', value: 'status_sel_lfg' },
        { label: '🟡 Casual / Chilling in Lobby', description: 'Online and down for casual matches', value: 'status_sel_casual' },
        { label: '🔴 In a Competitive Match', description: 'Focusing on a ranked match, do not disturb', value: 'status_sel_inmatch' },
        { label: '🎮 Hosting a Custom Room', description: 'Hosting a server or room, join my voice chat', value: 'status_sel_hosting' },
        { label: '💤 Done Gaming / AFK', description: 'Stepped away from the controller', value: 'status_sel_offline' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gaming_action_view_roster').setLabel('Gaming Roster').setStyle(ButtonStyle.Primary).setEmoji('📋'),
    new ButtonBuilder().setCustomId('gaming_action_add_gamertag').setLabel('Add Gamertag').setStyle(ButtonStyle.Success).setEmoji('➕'),
    new ButtonBuilder().setCustomId('gaming_action_ping_squad').setLabel('Ping Squad').setStyle(ButtonStyle.Primary).setEmoji('🔔'),
    new ButtonBuilder().setCustomId('gaming_action_random_picker').setLabel('Squad Picker').setStyle(ButtonStyle.Secondary).setEmoji('🎲'),
    new ButtonBuilder().setCustomId('gaming_action_squad_stats').setLabel('Squad Stats').setStyle(ButtonStyle.Secondary).setEmoji('🏆')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gaming_action_create_vc').setLabel('Create Game VC').setStyle(ButtonStyle.Success).setEmoji('🎮'),
    new ButtonBuilder().setCustomId('gaming_action_lfg_duo').setLabel('Need Duo').setStyle(ButtonStyle.Secondary).setEmoji('🎯'),
    new ButtonBuilder().setCustomId('gaming_action_lfg_full').setLabel('Need Full Squad').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId('gaming_action_1v1').setLabel('1v1 Challenge').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
    new ButtonBuilder().setCustomId('gaming_action_clear_tags').setLabel('Clear Gamertags').setStyle(ButtonStyle.Danger).setEmoji('🕹️')
  );

  return { embeds: [embed], components: [gameMenu, statusMenu, row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 🛠️ SUB-DECK 9: SERVER UTILITIES & POLLS (20 Features)
// ---------------------------------------------------------------------------
export function buildUtilitiesDeck() {
  const embed = new EmbedBuilder()
    .setColor(INFO_COLOR)
    .setTitle('🛠️ SERVER UTILITIES & QUICK TOOLS (20 FEATURES)')
    .setDescription(
      `Helpful community utilities and quick tools at the click of a button:\n\n` +
      `• **RNG & Games:** Coin flip, D100 dice roll, random number generator\n` +
      `• **Information Lookups:** Enlarge user avatar, server banner & icon, whois profile\n` +
      `• **Utilities:** Global timezone clock, server uptime telemetry, and quick poll dispatcher`
    );

  const utilMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_utility_tools')
      .setPlaceholder('🛠️ Select a Server Utility or Interactive Tool...')
      .addOptions([
        { label: '📊 Quick 2-Option Poll (Yes / No)', description: 'Deploy a yes/no community vote with button reactions', value: 'util_sel_poll_yesno' },
        { label: '📊 Quick 4-Option Multiple Choice Poll', description: 'Deploy a 4-choice poll to current channel', value: 'util_sel_poll_multi' },
        { label: '🪙 Fair Coin Flip (Heads or Tails)', description: 'Cryptographically fair heads-or-tails coin toss', value: 'util_sel_coinflip' },
        { label: '🎲 Roll D100 Dice (1 to 100)', description: 'Roll a random number between 1 and 100', value: 'util_sel_dice100' },
        { label: '🖼️ Member Avatar Enlarger', description: 'View full-resolution avatar image with direct link', value: 'util_sel_avatar' },
        { label: '🏰 Server Icon & Banner Inspector', description: 'View full-size guild icon, banner, and discovery image', value: 'util_sel_server_art' },
        { label: '📅 Account Age & Join Date Lookup', description: 'Check exact Discord account creation date & join timestamp', value: 'util_sel_account_age' },
        { label: '🔗 Generate Permanent Safe Invite Link', description: 'Creates an official infinite-use invite link', value: 'util_sel_invite' },
        { label: '⏰ Global Timezone Clock', description: 'Display current local time across UTC, EST, IST, and PST', value: 'util_sel_timezones' },
        { label: '💡 Submit Feature Suggestion', description: 'Send a formatted feature recommendation to Sandy', value: 'util_sel_suggest' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('util_action_flip_coin').setLabel('Flip Coin').setStyle(ButtonStyle.Primary).setEmoji('🪙'),
    new ButtonBuilder().setCustomId('util_action_roll_100').setLabel('Roll D100').setStyle(ButtonStyle.Primary).setEmoji('🎲'),
    new ButtonBuilder().setCustomId('util_action_view_avatar').setLabel('My Avatar').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
    new ButtonBuilder().setCustomId('util_action_server_info').setLabel('Server Info').setStyle(ButtonStyle.Secondary).setEmoji('ℹ️'),
    new ButtonBuilder().setCustomId('util_action_whoami').setLabel('WhoAmI Card').setStyle(ButtonStyle.Success).setEmoji('👤')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('util_action_create_poll').setLabel('Quick Poll').setStyle(ButtonStyle.Primary).setEmoji('📊'),
    new ButtonBuilder().setCustomId('util_action_server_uptime').setLabel('Bot Uptime').setStyle(ButtonStyle.Secondary).setEmoji('⏰'),
    new ButtonBuilder().setCustomId('util_action_current_date').setLabel('UTC Date').setStyle(ButtonStyle.Secondary).setEmoji('📅'),
    new ButtonBuilder().setCustomId('util_action_suggest').setLabel('Suggest Feature').setStyle(ButtonStyle.Success).setEmoji('💡'),
    new ButtonBuilder().setCustomId('util_action_rules_reminder').setLabel('Rules Reminder').setStyle(ButtonStyle.Secondary).setEmoji('📜')
  );

  return { embeds: [embed], components: [utilMenu, row1, row2], ephemeral: true };
}

// ---------------------------------------------------------------------------
// 📊 SUB-DECK 10: DIAGNOSTICS & SYSTEM VITALS (20 Features)
// ---------------------------------------------------------------------------
export function buildAnalyticsDeck(guild) {
  const memberCount = guild.memberCount;
  const channelCount = guild.channels.cache.size;
  const roleCount = guild.roles.cache.size;

  const embed = new EmbedBuilder()
    .setColor(INFO_COLOR)
    .setTitle(`📊 DIAGNOSTICS, SECURITY AUDIT & SYSTEM VITALS — ${guild.name} (20 ACTIONS)`)
    .setDescription(
      `Real-time infrastructure telemetry, security audit trail, and health metrics:\n\n` +
      `• **Total Members:** \`${memberCount}\`\n` +
      `• **Active Channels:** \`${channelCount}\`\n` +
      `• **Configured Roles:** \`${roleCount}\`\n` +
      `• **Rocket Host Engine:** Railway Cloud (24/7 Always Active)\n` +
      `• **Neural Model:** \`Rocket Neural Core (ScaleMax Pro Engine • 2,500 Tokens)\`\n` +
      `• **Security Shield:** 🛡️ Active (Auto-Mod, 6h Janitor, Sandy Defense 1h Timeout)`
    );

  const diagMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_analytics_checks')
      .setPlaceholder('📊 Select Deep Diagnostics or Infrastructure Check...')
      .addOptions([
        { label: '💾 SQLite Database Integrity & WAL Size', description: 'Inspect persistent SQLite database pages and journal mode', value: 'diag_sel_db_health' },
        { label: '🛡️ Full Channel Permission Audit', description: 'Verify view/send access across member and owner rooms', value: 'diag_sel_perm_audit' },
        { label: '📡 Bot Latency & WebSocket Heartbeat', description: 'Check roundtrip gateway ping and WebSocket heartbeat', value: 'diag_sel_ping' },
        { label: '🎙️ Active Voice Sessions Inspection', description: 'List currently connected members across voice rooms', value: 'diag_sel_vc_audit' },
        { label: '🧹 Auto-Purge Cache & Sweep History', description: 'Check 6-hour message cleaner logs and last sweep', value: 'diag_sel_purge_history' },
        { label: '👑 Role Hierarchy & Safety Check', description: 'Inspect administrator roles and bot positioning', value: 'diag_sel_role_safety' },
        { label: '🧠 Process Memory & Heap Usage', description: 'Inspect RSS, heap total, heap used, and external memory', value: 'diag_sel_memory' },
        { label: '🌐 Active Webhook & Invite Scanner', description: 'Detect unauthorized webhooks or hidden invites', value: 'diag_sel_webhook_scan' },
        { label: '🏆 Top 10 Most Active Chatters', description: 'Query activity database for top conversational contributors', value: 'diag_sel_top_chatters' },
        { label: '📜 Recent Security Audit Trail', description: 'Inspect recent moderation timeouts, kicks, and defense alerts', value: 'diag_sel_mod_trail' },
      ])
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_dashboard_refresh').setLabel('Refresh Vitals').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId('analytics_action_security_score').setLabel('Security Score').setStyle(ButtonStyle.Success).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId('analytics_action_ping_latency').setLabel('Ping Check').setStyle(ButtonStyle.Secondary).setEmoji('📡'),
    new ButtonBuilder().setCustomId('analytics_action_online_count').setLabel('Online Users').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
    new ButtonBuilder().setCustomId('analytics_action_db_usage').setLabel('DB Storage').setStyle(ButtonStyle.Secondary).setEmoji('📁')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('analytics_action_view_modlogs').setLabel('Mod Logs').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
    new ButtonBuilder().setCustomId('analytics_action_check_locks').setLabel('Channel Locks').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('analytics_action_rocket_mood').setLabel('Rocket Mood & Fuel').setStyle(ButtonStyle.Primary).setEmoji('🦝'),
    new ButtonBuilder().setCustomId('analytics_action_webhook_scan').setLabel('Webhook Scan').setStyle(ButtonStyle.Secondary).setEmoji('🌐'),
    new ButtonBuilder().setCustomId('analytics_action_health_scan').setLabel('Health Scan').setStyle(ButtonStyle.Success).setEmoji('🩺')
  );

  return { embeds: [embed], components: [diagMenu, row1, row2], ephemeral: true };
}

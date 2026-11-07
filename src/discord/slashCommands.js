/**
 * 🦝 ROCKET AI — DISCORD APPLICATION COMMAND DEFINITIONS
 * 
 * Defines Slash Commands for:
 * - Full Moderation (Kick, Ban, Unban, Timeout, Purge, Warn, Lock, Slowmode)
 * - Server Knowledge & Community Hub (Learn, Knowledge, Sync, ServerInfo, UserInfo, Ask)
 * - Relationship & RBAC Management (Family, Friends, Team, Employees)
 * - Rocket Raccoon Life Engine (Status, Feed, Claim Owner)
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const slashCommands = [
  // -------------------------------------------------------------------------
  // 0. Master Server Setup & Governance (Owner Only)
  // -------------------------------------------------------------------------
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🚀 Automatically configure the complete Rocket Discord server infrastructure (Nero Only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('👥 Manage staff and user permission scopes (Nero Only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('grant')
        .setDescription('Grant permission scopes to a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to authorize').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('Select permission scope to grant')
            .setRequired(true)
            .addChoices(
              { name: '🛡️ Administrator (Full system access)', value: 'admin' },
              { name: '🔨 Moderator (Kick, ban, timeout, purge)', value: 'moderator' },
              { name: '🔬 Researcher (Advanced research tools)', value: 'researcher' },
              { name: '👔 Staff (Employee / internal operations)', value: 'staff' },
              { name: '🎮 Gamer (Gaming roster coordinator)', value: 'gamer' }
            )
        )
        .addStringOption((opt) => opt.setName('notes').setDescription('Optional authorization notes').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('revoke')
        .setDescription('Revoke all special permissions from a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to de-authorize').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View all currently authorized users and their assigned scopes')
    ),

  new SlashCommandBuilder()
    .setName('add-friends')
    .setDescription('🎮 Link your gaming profile (Minecraft, Roblox, Brawl Stars, Steam, etc.).')
    .addStringOption((opt) =>
      opt
        .setName('game')
        .setDescription('Game title (e.g., Minecraft, Roblox, Brawl Stars, Valorant, Steam)')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('username')
        .setDescription('Your in-game username, gamertag, or player ID')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('platform')
        .setDescription('Gaming platform (e.g., PC, Mobile, Console)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('notes')
        .setDescription('Optional notes (e.g. rank, realm code, server IP)')
        .setRequired(false)
    ),

  // -------------------------------------------------------------------------
  // 1. Core & Raccoon Life Engine
  // -------------------------------------------------------------------------
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('🦝 Discover everything Rocket can do for your server!'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('🐾 Inspect Rocket\'s mood, hunger level, pizza inventory, and server vitals.'),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('⚡ Generate and inspect a dynamic WWE-style championship stats card!')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to inspect (defaults to yourself)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('⚡ View your personal WWE-style statistics card and server rank.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to inspect (defaults to yourself)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 View the top-ranked members in the server by XP and WWE championship tiers.'),

  new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('🔔 Customize your personal DM alert preferences for voice, streaming & gaming!'),

  new SlashCommandBuilder()
    .setName('evidence')
    .setDescription('🔍 Verify claims or screenshots against server message archives.')
    .addSubcommand((sub) =>
      sub
        .setName('verify')
        .setDescription('Verify an archive record by message ID or search parameters')
        .addStringOption((opt) => opt.setName('messageid').setDescription('Discord Message ID to verify').setRequired(false))
        .addUserOption((opt) => opt.setName('author').setDescription('Author of the message').setRequired(false))
        .addStringOption((opt) => opt.setName('snippet').setDescription('Text snippet from the message').setRequired(false))
    ),

  new SlashCommandBuilder()
    .setName('shame')
    .setDescription('🚫 Hall of Shame management for confirmed scammers & severe violators (Staff Only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a confirmed offender to the Hall of Shame')
        .addUserOption((opt) => opt.setName('target').setDescription('The offender').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason and offense details').setRequired(true))
        .addStringOption((opt) => opt.setName('evidence').setDescription('Evidence reference ID or archive URL').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List current Hall of Shame entries')
    ),

  new SlashCommandBuilder()
    .setName('feed')
    .setDescription('🍕 Offer snacks to fuel Rocket\'s mischievous raccoon energy!')
    .addStringOption((opt) =>
      opt
        .setName('snack')
        .setDescription('Choose what to feed Rocket')
        .setRequired(true)
        .addChoices(
          { name: '🍕 Delicious Slice of Pizza', value: 'pizza' },
          { name: '🌮 Crunchy Spicy Taco', value: 'taco' }
        )
    ),

  new SlashCommandBuilder()
    .setName('claimowner')
    .setDescription('👑 Sandy\'s exclusive command to claim supreme Boss authority on Discord.'),

  // -------------------------------------------------------------------------
  // 2. Server Knowledge & Community Hub
  // -------------------------------------------------------------------------
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('📊 View deep server analytics, channels, roles, and Rocket integration.'),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('👤 Inspect a member\'s profile, server tier, join date, and warning history.')
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The user to inspect (defaults to yourself)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('🧠 Ask Rocket any question with full server knowledge, rules, and AI memory!')
    .addStringOption((opt) =>
      opt.setName('question').setDescription('Your question for Rocket').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('learn')
    .setDescription('📚 Teach Rocket a specific fact or rule about this server (Admin/Team/Owner).')
    .addStringOption((opt) =>
      opt.setName('topic').setDescription('Topic key (e.g., office_hours, server_rules, team_leads)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('content').setDescription('Information, description, or policy details').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('knowledge')
    .setDescription('📖 Explore or look up topics in Rocket\'s server knowledge archive.')
    .addStringOption((opt) =>
      opt.setName('topic').setDescription('Specific topic to look up (leave blank for all topics)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('sync')
    .setDescription('🔄 Auto-scan server channels, descriptions, and roles into Rocket\'s brain.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // -------------------------------------------------------------------------
  // 3. Member Tiers (Friends, Family, Team, Employees)
  // -------------------------------------------------------------------------
  new SlashCommandBuilder()
    .setName('settier')
    .setDescription('🏷️ Assign a member to a special relationship tier (Family, Friend, Team, Employee).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to categorize').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('tier')
        .setDescription('Select the relationship tier')
        .setRequired(true)
        .addChoices(
          { name: '👑 Owner / Sandy', value: 'owner' },
          { name: '❤️ Family Member', value: 'family' },
          { name: '🤝 Close Friend', value: 'friend' },
          { name: '💼 Team Member (Core Collaborator)', value: 'team' },
          { name: '👔 Employee / Staff', value: 'employee' },
          { name: '👤 Regular Community Member', value: 'member' }
        )
    )
    .addStringOption((opt) =>
      opt.setName('notes').setDescription('Optional notes regarding role or specialty').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('listtiers')
    .setDescription('📋 List members grouped by their designated relationship tier.')
    .addStringOption((opt) =>
      opt
        .setName('tier')
        .setDescription('Filter by tier')
        .setRequired(false)
        .addChoices(
          { name: '❤️ Family', value: 'family' },
          { name: '🤝 Friends', value: 'friend' },
          { name: '💼 Team', value: 'team' },
          { name: '👔 Employees', value: 'employee' }
        )
    ),

  // -------------------------------------------------------------------------
  // 4. Moderation Suite (Kick, Ban, Unban, Timeout, Purge, Warn, Lock)
  // -------------------------------------------------------------------------
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('👢 Kick a member from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The member to kick').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for kick').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Ban a user from the server permanently.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The member or user to ban').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for ban').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('deletedays')
        .setDescription('Number of days of messages to delete (0 to 7)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7)
    ),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('🔓 Lift a ban for a user ID.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((opt) =>
      opt.setName('userid').setDescription('Discord User ID of the banned user').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for unbanning').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('⏳ Mute/timeout a member temporarily.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The member to timeout').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('duration')
        .setDescription('Duration of timeout')
        .setRequired(true)
        .addChoices(
          { name: '60 Seconds (1 minute)', value: 1 },
          { name: '5 Minutes', value: 5 },
          { name: '10 Minutes', value: 10 },
          { name: '1 Hour', value: 60 },
          { name: '1 Day (24 hours)', value: 1440 },
          { name: '1 Week (7 days)', value: 10080 }
        )
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for timeout').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('🔊 Remove timeout from a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The member to untimeout').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('⚠️ Issue an official warning to a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The member to warn').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the warning').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('📜 View the warning history of a member.')
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The user whose warnings you want to see').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('🧹 Clear all warnings on a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('target').setDescription('The user whose warnings will be reset').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('🗑️ Bulk delete up to 100 messages from the channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Only delete messages from this specific user').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('🐢 Set the slowmode cooldown for this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((opt) =>
      opt
        .setName('seconds')
        .setDescription('Cooldown in seconds (0 to turn off, max 21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    ),

  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('🔒 Lock the current channel (prevent members from sending messages).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for lockdown').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('🔓 Unlock the current channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // -------------------------------------------------------------------------
  // 5. Server Configuration & Setup
  // -------------------------------------------------------------------------
  new SlashCommandBuilder()
    .setName('setmodlog')
    .setDescription('📝 Set the moderation audit log channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('Channel where mod actions will be recorded').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('👋 Set the channel where Rocket greets newcomers.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('Channel for greeting new members').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('automod')
    .setDescription('🛡️ Configure Rocket\'s Auto-Mod & Security Guard settings.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((opt) =>
      opt.setName('enabled').setDescription('Toggle Master Auto-Mod on/off').setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('antispam').setDescription('Block rapid message spamming').setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('antiinvite').setDescription('Block unauthorized discord invite links').setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('antimassmention').setDescription('Block raiding / mass pinging').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('chatmode')
    .setDescription('💬 Configure Rocket\'s chat mode (Mention-Only vs Constant Chat).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Select chat behavior')
        .setRequired(true)
        .addChoices(
          { name: '⚪ Mention Only (Only speaks when @mentioned or asked via commands — Clean & Quiet)', value: 'mention_only' },
          { name: '🔥 Constant Chat (Rocket talks freely on messages in #chat and #help)', value: 'constant' }
        )
    ),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('🔇 Mute Rocket AI (Rocket stops talking in chat completely until unmuted).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('🔊 Unmute Rocket AI (Rocket resumes talking according to current chatmode).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('setchatchannel')
    .setDescription('💬 Bind a specific channel where Rocket is ALWAYS in Constant Talk Mode.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('Channel where Rocket constantly chats on every message').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('📢 Dispatch official server announcements (Sandy & Rocket Owners).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('hub')
        .setDescription('Open the interactive Announcement Studio (Only visible to you).')
    )
    .addSubcommand((sub) =>
      sub
        .setName('custom')
        .setDescription('Directly dispatch a custom announcement to #announcements.')
        .addStringOption((opt) => opt.setName('title').setDescription('Announcement Title').setRequired(true))
        .addStringOption((opt) => opt.setName('content').setDescription('Announcement Content (Markdown supported)').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('ping')
            .setDescription('Mention Target')
            .setRequired(false)
            .addChoices(
              { name: 'None (Clean broadcast)', value: 'none' },
              { name: '@everyone (Global ping)', value: 'everyone' },
              { name: '@here (Online ping)', value: 'here' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('ai')
        .setDescription('Ask Rocket AI to generate and dispatch an announcement.')
        .addStringOption((opt) => opt.setName('topic').setDescription('Announcement Topic / Subject').setRequired(true))
        .addStringOption((opt) => opt.setName('details').setDescription('Key details, perks, links, or instructions').setRequired(false))
        .addStringOption((opt) =>
          opt
            .setName('ping')
            .setDescription('Mention Target')
            .setRequired(false)
            .addChoices(
              { name: 'None (Clean broadcast)', value: 'none' },
              { name: '@everyone (Global ping)', value: 'everyone' },
              { name: '@here (Online ping)', value: 'here' }
            )
        )
    ),
];

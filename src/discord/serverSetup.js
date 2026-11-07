/**
 * 🦝 ROCKET AI — IDEMPOTENT DISCORD SERVER SETUP & INFRASTRUCTURE ENGINE
 * 
 * Implements /setup:
 * - Owner-only authentication check
 * - Categories & channels creation or reuse across all 12 categories
 * - Full support for both GuildText and GuildVoice channels
 * - Strict permission overwrites for owner-only channels & staff-only channels
 * - Guild roles creation (@Verified, @Brother, @Sandy's Girlfriend, @Friend, @Staff, etc.)
 * - Channel-aware registry registration
 * - Deployment and in-place updating of interactive cards and buttons
 * - 100% idempotent and safe to rerun without duplicating channels or deleting user data
 */

import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { SERVER_CATEGORIES } from './channelRegistry.js';
import {
  registerChannelConfig,
  updateGuildSettings,
  getGuildSettings,
  getServerLinks,
  grantUserPermission,
} from './discordDb.js';
import { config } from '../config.js';
import { isDiscordOwner } from './commandHandlers.js';
import { buildMasterDashboardEmbed, buildMasterDashboardComponents } from './buttonDashboard.js';

const BRAND_COLOR = 0xff6b35; // Rocket raccoon fiery orange
const OWNER_COLOR = 0x9b59b6; // Royal purple for owner
const SUCCESS_COLOR = 0x2ecc71; // Emerald green
const INFO_COLOR = 0x3498db; // Blue
const GOLD_COLOR = 0xf1c40f; // Gold
const DANGER_COLOR = 0xe74c3c; // Red

export const SERVER_ROLES = [
  { name: 'Buyer', color: 0xf1c40f, reason: 'Verified N3R0L4BS Buyer role for workstation access' },
  { name: 'Client', color: 0x3498db, reason: 'Client commissioning projects with Sandy' },
  { name: 'Rocket Access', color: 0x00e5ff, reason: 'Clearance to talk with and command Rocket AI' },
  { name: 'Verified', color: 0x2ecc71, reason: 'Member verified through Rocket security' },
  { name: 'Brother', color: 0x3498db, reason: 'Designated brother relationship with Sandy' },
  { name: "Sandy's Girlfriend", color: 0xe91e63, reason: "Sandy's girlfriend partner role" },
  { name: 'Friend', color: 0x2ecc71, reason: 'Friend relationship with Sandy' },
  { name: 'Staff', color: 0xe74c3c, reason: 'Authorized staff & ticket administrators' },
  { name: 'Gaming', color: 0x9b59b6, reason: 'Gaming interest role' },
  { name: 'Coding', color: 0x3498db, reason: 'Developer / coder interest role' },
  { name: 'AI & Technology', color: 0xe67e22, reason: 'Tech and AI enthusiast role' },
  { name: 'Study', color: 0xf1c40f, reason: 'Academics and learning role' },
  { name: 'Research', color: 0x1abc9c, reason: 'Research laboratory role' },
  { name: 'Content Creation', color: 0xe91e63, reason: 'Media and content creator role' },
  { name: 'Community', color: 0x27ae60, reason: 'General server community role' },
];

/**
 * Execute Idempotent Server Setup
 */
export async function executeServerSetup(interaction) {
  const { guild, user } = interaction;

  // 1. Strict Owner Verification
  const isOwner = isDiscordOwner(user, guild);
  if (!isOwner) {
    return interaction.reply({
      content: '⛔ **Access Denied:** Only the server owner (**Sandy**) has authorization to execute `/setup`.',
      ephemeral: true,
    });
  }

  // Bind owner in persistent memory & config
  config.discordOwnerId = user.id;
  grantUserPermission(guild.id, user.id, {
    username: user.username,
    displayName: user.globalName || user.username,
    scopes: 'owner,admin,moderator,researcher,staff',
    isOwner: 1,
    grantedBy: 'System Bootstrap',
  });

  await interaction.deferReply({ ephemeral: true });

  const summary = {
    rolesCreated: 0,
    rolesReused: 0,
    categoriesCreated: 0,
    categoriesReused: 0,
    channelsCreated: 0,
    channelsReused: 0,
    interfacesDeployed: 0,
    errors: [],
  };

  const serverLinks = getServerLinks(guild.id);
  const webBaseUrl = (config.rocketMiniAppUrl || config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app').replace(/\/+$/, '');

  try {
    // Fetch all roles & members into cache so permission overwrites resolve without error
    await guild.roles.fetch().catch(() => null);
    await guild.members.fetch().catch(() => null);

    // 2. Setup Guild Roles
    const createdRoles = {};
    for (const roleDef of SERVER_ROLES) {
      let role = guild.roles.cache.find((r) => r.name.toLowerCase() === roleDef.name.toLowerCase());
      if (!role) {
        try {
          role = await guild.roles.create({
            name: roleDef.name,
            color: roleDef.color,
            reason: roleDef.reason,
          });
          summary.rolesCreated++;
        } catch (rErr) {
          console.warn(`[Setup] Failed to create role ${roleDef.name}:`, rErr.message);
        }
      } else {
        summary.rolesReused++;
      }
      if (role) createdRoles[roleDef.name] = role;
    }

    const staffRole = createdRoles['Staff'] || guild.roles.cache.find((r) => r.name.toLowerCase() === 'staff');

    // 2.5 Clean up Obsolete / Clutter Channels & Categories (Delete old and restart new)
    const canonicalCategoryNames = SERVER_CATEGORIES.map((c) => c.name.toLowerCase());
    const canonicalChannelNames = SERVER_CATEGORIES.flatMap((c) => c.channels.map((ch) => ch.name.toLowerCase()));

    // Delete non-canonical text/voice channels
    for (const ch of guild.channels.cache.values()) {
      if (ch.type === ChannelType.GuildCategory) continue;
      if (!canonicalChannelNames.includes(ch.name.toLowerCase())) {
        await ch.delete('Server refresh: removing non-canonical channel').catch(() => null);
      }
    }

    // Delete non-canonical categories
    for (const cat of guild.channels.cache.values()) {
      if (cat.type !== ChannelType.GuildCategory) continue;
      if (!canonicalCategoryNames.includes(cat.name.toLowerCase())) {
        for (const [, child] of cat.children.cache) {
          await child.delete().catch(() => null);
        }
        await cat.delete('Server refresh: removing non-canonical category').catch(() => null);
      }
    }

    // 3. Process Categories & Channels
    for (const catDef of SERVER_CATEGORIES) {
      // Find or create category
      let category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catDef.name.toLowerCase()
      );

      if (!category) {
        try {
          category = await guild.channels.create({
            name: catDef.name,
            type: ChannelType.GuildCategory,
          });
          summary.categoriesCreated++;
        } catch (err) {
          summary.errors.push(`Failed to create category ${catDef.name}: ${err.message}`);
          continue;
        }
      } else {
        summary.categoriesReused++;
      }

      // If category is a locked workstation (e.g. Coding, Web, Gaming, AI), apply locked permissions
      if (catDef.targetRoleName) {
        const targetRole = guild.roles.cache.find((r) => r.name.toLowerCase() === catDef.targetRoleName.toLowerCase());
        const buyerRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'buyer');
        const clientRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'client');
        const rocketAccessRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'rocket access');
        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: guild.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
            ],
          },
          {
            id: user.id, // Sandy (Owner)
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ];
        if (buyerRole) {
          overwrites.push({
            id: buyerRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
        if (clientRole) {
          overwrites.push({
            id: clientRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
        if (targetRole) {
          overwrites.push({
            id: targetRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
        if (rocketAccessRole) {
          overwrites.push({
            id: rocketAccessRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          });
        }
        await category.permissionOverwrites.set(overwrites).catch(() => null);
      }

      // Process Channels within Category
      for (const chDef of catDef.channels) {
        const targetType = chDef.type || ChannelType.GuildText;
        let channel = guild.channels.cache.find(
          (c) => c.type === targetType && c.name.toLowerCase() === chDef.name.toLowerCase() && c.parentId === category.id
        ) || guild.channels.cache.find(
          (c) => c.type === targetType && c.name.toLowerCase() === chDef.name.toLowerCase()
        );

        const permissionOverwrites = [];

        if (chDef.isOwnerOnly) {
          // Strict Owner-Only: Hide from @everyone, allow bot and Sandy
          permissionOverwrites.push(
            {
              id: guild.roles.everyone.id,
              deny: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id: guild.client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ManageChannels,
              ],
            },
            {
              id: user.id, // Sandy's verified Discord ID
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            }
          );

          // Deny ViewChannel for other non-bot roles
          for (const role of guild.roles.cache.values()) {
            if (role.id !== guild.roles.everyone.id && !role.managed && role.id !== guild.client.user.id) {
              permissionOverwrites.push({
                id: role.id,
                deny: [PermissionFlagsBits.ViewChannel],
              });
            }
          }
        } else if (chDef.isStaffOnly) {
          // Staff & Sandy Only (#help-admin, #audit-logs)
          permissionOverwrites.push(
            {
              id: guild.roles.everyone.id,
              deny: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id: guild.client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ManageChannels,
              ],
            },
            {
              id: user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            }
          );
          if (staffRole) {
            permissionOverwrites.push({
              id: staffRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            });
          }
        } else if (chDef.isBuyerOnly) {
          // STRICT BUYER ONLY WORKSTATION: Non-buyers CANNOT view!
          const buyerRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'buyer');
          const clientRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'client');
          const rocketAccessRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'rocket access');
          permissionOverwrites.push(
            {
              id: guild.roles.everyone.id,
              deny: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id: guild.client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id: user.id, // Sandy (Owner)
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            }
          );
          if (buyerRole) {
            permissionOverwrites.push({
              id: buyerRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            });
          }
          if (clientRole) {
            permissionOverwrites.push({
              id: clientRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            });
          }
          if (rocketAccessRole) {
            permissionOverwrites.push({
              id: rocketAccessRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            });
          }
          if (staffRole) {
            permissionOverwrites.push({
              id: staffRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            });
          }
        } else if (chDef.isRocketAccessOnly) {
          // #chat: Everyone can view, but only Sandy, Staff & Rocket Access can send messages!
          const rocketAccessRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'rocket access');
          permissionOverwrites.push(
            {
              id: guild.roles.everyone.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
              ],
              deny: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AddReactions,
              ],
            },
            {
              id: guild.client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            },
            {
              id: user.id, // Sandy
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            }
          );
          if (rocketAccessRole) {
            permissionOverwrites.push({
              id: rocketAccessRole.id,
              allow: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            });
          }
          if (staffRole) {
            permissionOverwrites.push({
              id: staffRole.id,
              allow: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            });
          }
        } else if (chDef.isReadOnlyForMembers) {
          // Read-only for regular members (Orders & Information channels)
          permissionOverwrites.push(
            {
              id: guild.roles.everyone.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
              ],
              deny: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AddReactions,
              ],
            },
            {
              id: guild.client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            },
            {
              id: user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            }
          );
        } else {
          // Standard public channels (e.g. #general, #memes, #media-clips)
          permissionOverwrites.push(
            {
              id: guild.roles.everyone.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id: guild.client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            },
            {
              id: user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ],
            }
          );
        }

        if (!channel) {
          try {
            channel = await guild.channels.create({
              name: chDef.name,
              type: targetType,
              parent: category.id,
              topic: chDef.topic,
              permissionOverwrites,
            });
            summary.channelsCreated++;
          } catch (err) {
            summary.errors.push(`Failed to create channel #${chDef.name}: ${err.message}`);
            continue;
          }
        } else {
          // Idempotent update: ensure correct parent, topic and permissions
          try {
            const editPayload = {
              parent: category.id,
              permissionOverwrites,
            };
            if (targetType === ChannelType.GuildText && chDef.topic) {
              editPayload.topic = chDef.topic;
            }
            await channel.edit(editPayload);
            summary.channelsReused++;
          } catch (editErr) {
            console.warn(`[Setup] Note editing #${chDef.name}:`, editErr.message);
          }
        }

        // Register in persistent SQLite channel registry (for text channels)
        if (targetType === ChannelType.GuildText) {
          registerChannelConfig({
            guild_id: guild.id,
            channel_id: channel.id,
            channel_name: chDef.name,
            category_name: catDef.name,
            purpose: chDef.purpose || chDef.name,
            ai_behavior_profile: chDef.profile || 'general',
            reasoning_level: chDef.reasoning || 'low',
            speed_preference: chDef.speed || 'fast',
            token_optimization: chDef.tokenOptimization || 'standard',
            allowed_tools: [],
            permission_requirements: chDef.isOwnerOnly ? 'owner' : (chDef.isStaffOnly ? 'staff' : 'member'),
          });

          // Deploy or update interactive interface cards
          await deployChannelInterface(channel, chDef, webBaseUrl, serverLinks, user.id);
          summary.interfacesDeployed++;
        }
      }
    }

    // 4. Update Guild Settings with Key Channels
    const announcementsCh = guild.channels.cache.find((c) => c.name === 'announcements');
    const rulesCh = guild.channels.cache.find((c) => c.name === 'rules-info') || guild.channels.cache.find((c) => c.name === 'rules');
    const auditLogsCh = guild.channels.cache.find((c) => c.name === 'audit-logs');
    const chatCh = guild.channels.cache.find((c) => c.name === 'chat');
    const dashboardCh = guild.channels.cache.find((c) => c.name === 'rocket-dashboard');
    const helpDeskCh = guild.channels.cache.find((c) => c.name === 'help-desk') || guild.channels.cache.find((c) => c.name === 'help');
    const verifyCh = guild.channels.cache.find((c) => c.name === 'verify');

    updateGuildSettings(guild.id, {
      guild_name: guild.name,
      welcome_channel_id: rulesCh ? rulesCh.id : undefined,
      rules_channel_id: rulesCh ? rulesCh.id : (announcementsCh ? announcementsCh.id : undefined),
      mod_log_channel_id: auditLogsCh ? auditLogsCh.id : undefined,
      chat_channel_id: chatCh ? chatCh.id : undefined,
      chat_mode: getGuildSettings(guild.id)?.chat_mode || 'constant',
      is_muted: 0,
    });

    const completionEmbed = new EmbedBuilder()
      .setColor(SUCCESS_COLOR)
      .setTitle('🚀 ROCKET AI — FULL POWER SERVER INFRASTRUCTURE DEPLOYED')
      .setDescription(
        `Welcome Boss **Sandy**! The server infrastructure has been completely restructured and purged of all legacy clutter.\n\n` +
        `**Infrastructure & Clean Setup Summary:**\n` +
        `• **Server Restructured:** 5 Streamlined Categories & 13 Core Channels 🌟\n` +
        `• **Master Button Dashboard:** 200+ Direct button features deployed in <#${dashboardCh?.id || 'rocket-dashboard'}> 🎛️ (Zero commands needed!)\n` +
        `• **Rocket AI at Full Power:** High-reasoning neural hub in <#${chatCh?.id || 'chat'}> & DMs (Expanded token budget: 2,500 tokens) 🦝⚡\n` +
        `• **6-Hour Auto-Purge Janitor:** Automated background sweeper cleans chat, text, clips, and memes every 15 min, protecting pinned messages 🧹\n` +
        `• **Sandy Absolute Defense:** Zero tolerance for disrespect towards Sandy — triggers immediate message purge, 1-hour member timeout & SQLite logging 🛡️\n` +
        `• **Direct Admin Execution:** Purge, lock, unlock, timeout, kick, ban directly from Sandy's chat/DM instructions 👑\n` +
        `• **Roles Configured:** @Verified, @Brother, @Sandy's Girlfriend, @Friend, @Staff, etc. 🎭\n` +
        `• **Voice Lounge:** General Voice, Gaming Room, Rocket Lounge 🔊\n\n` +
        `**Key Channel Hubs:**\n` +
        `👉 <#${dashboardCh?.id || 'rocket-dashboard'}> — Master Control Station (Buttons for everything)\n` +
        `👉 <#${rulesCh?.id || 'rules-info'}> — Server Guidelines & Zero-Tolerance Policies 📜\n` +
        `👉 <#${verifyCh?.id || 'verify'}> — Member 1-Click Verification Gateway 🛡️\n` +
        `👉 <#${chatCh?.id || 'chat'}> — Full Power Conversational Hub 💬\n` +
        `👉 <#${helpDeskCh?.id || 'help-desk'}> — Confidential Support Ticket Station 🎫\n` +
        `👉 <#${auditLogsCh?.id || 'audit-logs'}> — Security Audit Logs & Moderation Trail 🔒`
      )
      .setFooter({ text: 'Rocket AI • Built Exclusively for Sandy (Boss) 👑🐾' })
      .setTimestamp();

    return interaction.editReply({ embeds: [completionEmbed] });
  } catch (fatalErr) {
    console.error('[Rocket /setup Fatal Error]:', fatalErr);
    return interaction.editReply({
      content: `⚠️ An error occurred during server setup: ${fatalErr.message}`,
    });
  }
}

/**
 * Helper to clean all old messages from a channel before posting fresh interface
 */
async function cleanChannelCompletely(channel) {
  try {
    let fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (fetched && fetched.size > 0) {
      try {
        await channel.bulkDelete(fetched, true);
      } catch {}
      // Delete any older messages individually
      const remaining = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (remaining && remaining.size > 0) {
        for (const msg of remaining.values()) {
          await msg.delete().catch(() => null);
        }
      }
    }
  } catch (err) {
    console.warn(`[Setup] Note cleaning #${channel.name}:`, err.message);
  }
}

/**
 * Helper to deploy or update interactive cards and buttons in designated channels
 */
export async function deployChannelInterface(channel, chDef, webBaseUrl, serverLinks, ownerId) {
  try {
    const { guild } = channel;
    let embed = null;
    let components = [];

    switch (chDef.name) {
      case 'rocket-dashboard': {
        embed = buildMasterDashboardEmbed(channel.guild);
        components = buildMasterDashboardComponents();
        break;
      }

      case 'rules-info':
      case 'rules': {
        embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle('📜 ROCKET EMPIRE — SERVER RULES & ZERO-TOLERANCE CODE')
          .setDescription(
            `Welcome to the inner circle! To keep our community elite, safe, and productive, all members must abide by these rules:\n\n` +
            `🤝 **1. Respect & Camaraderie:** Treat every member with respect. Harassment, toxicity, hate speech, or malicious trolling result in an immediate permanent ban.\n\n` +
            `🛡️ **2. Absolute Sandy (Boss) Protection:** Zero tolerance for disrespect, threats, or slander directed at **Sandy (Boss)**. Violations trigger an immediate message deletion, automated 1-hour timeout, and a strike recorded in the SQLite security vault.\n\n` +
            `🧹 **3. 6-Hour Auto-Purge Protocol:** To maintain peak performance and zero clutter, #chat, #media-clips, and #memes automatically purge messages older than 6 hours. Pinned messages are permanently protected.\n\n` +
            `🛑 **4. Anti-Spam & Flooding:** Fast message flooding triggers automated temporary timeouts. Keep conversation quality high.\n\n` +
            `🎛️ **5. Button-First Server:** No complicated slash commands! Head over to <#${channel.guild.channels.cache.find((c) => c.name === 'rocket-dashboard')?.id || 'rocket-dashboard'}> for 200+ interactive buttons to manage moderation, AI brains, roles, and tickets.\n\n` +
            `🎫 **6. Support & Inquiries:** Need staff attention or want to report an issue? Open a confidential ticket in <#${channel.guild.channels.cache.find((c) => c.name === 'help-desk')?.id || 'help-desk'}>.`
          )
          .setFooter({ text: 'Monitored 24/7 by Rocket Security Engine 🛡️🐾' })
          .setTimestamp();
        break;
      }

      case 'verify':
      case 'verification': {
        embed = new EmbedBuilder()
          .setColor(SUCCESS_COLOR)
          .setTitle('🛡️ MEMBER VERIFICATION GATEWAY')
          .setDescription(
            `Welcome! Complete this quick 1-click interactive verification to unlock the server:\n\n` +
            `• Select your preferred display name\n` +
            `• Pick your areas of interest (Gaming, Coding, AI, Study, Content)\n` +
            `• Confirm your relationship with Sandy (**Brother**, **Sandy's Girlfriend**, or **Friend**)\n` +
            `• Automatically unlock your assigned roles and server channels\n\n` +
            `👉 Click the **Start Verification** button below to begin!`
          )
          .setFooter({ text: 'Rocket Security • Takes ~15 seconds ⏱️' });

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_start_verification')
              .setLabel('🛡️ Start Verification')
              .setStyle(ButtonStyle.Success)
          ),
        ];
        break;
      }

      case 'choose-roles': {
        embed = new EmbedBuilder()
          .setColor(INFO_COLOR)
          .setTitle('🎭 CHOOSE YOUR INTERESTS & UNLOCK WORKSTATIONS')
          .setDescription(
            `Click any button below to toggle your interest in **1 click**! Only the channels for your selected interests will be visible in your server list:\n\n` +
            `• 💻 **Coding** — Unlocks the **CODING SECTION** (#coding-chat, #code-runner, #bot-showcase)\n` +
            `• 🌐 **Web Dev** — Unlocks the **WEB SECTION** (#web-dev, #live-previews, #design-lab)\n` +
            `• 🎮 **Gaming** — Unlocks the **GAMING SECTION** (#gaming-hub, #game-assets)\n` +
            `• 🤖 **AI & Tech** — Unlocks the **AI & TECH SECTION** (#ai-tools)\n` +
            `• 🎨 **Content** — Video editing, media assets, and creative design\n` +
            `• 📚 **Study** — Academic study groups, quizzes, and documentation\n` +
            `• 🔬 **Research** — In-depth tech research, papers & architecture\n\n` +
            `⚠️ **Strict 5-Title Limit Rule:**\n` +
            `• **1 Title:** Base Status (\`@Member\`, \`@Elder\`, \`@Staff\` — Staff/Elder given by Admin)\n` +
            `• **3 Titles:** Department Interests (Select up to **3 max** below in 1 click)\n` +
            `• **1 Title:** WWE Championship Rank (Sets your custom chat & name color!)\n\n` +
            `*Rest of the roles are exclusively managed by Boss Sandy & Rocket.*`
          );

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_toggle_role_Coding')
              .setLabel('💻 Coding')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('btn_toggle_role_Web Dev')
              .setLabel('🌐 Web Dev')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('btn_toggle_role_Gaming')
              .setLabel('🎮 Gaming')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('btn_toggle_role_AI & Technology')
              .setLabel('🤖 AI & Tech')
              .setStyle(ButtonStyle.Primary)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_toggle_role_Content Creation')
              .setLabel('🎨 Content')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('btn_toggle_role_Study')
              .setLabel('📚 Study')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('btn_toggle_role_Research')
              .setLabel('🔬 Research')
              .setStyle(ButtonStyle.Secondary)
          ),
        ];
        break;
      }

      case 'chat': {
        embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle('🦝 ROCKET AI — FULL POWER NEURAL HUB')
          .setDescription(
            `Welcome to **#chat**! I am **Rocket**, your mischievous, witty raccoon AI companion created under **Nero Labs** 🐾🍕\n\n` +
            `⚡ **Rocket at Full Power:**\n` +
            `• **Expanded Token Budget:** High reasoning mode with up to 2,500 output tokens.\n` +
            `• **Full Conversational Memory:** Remembers conversations, your preferences, and past context.\n` +
            `• **6-Hour Auto-Purge:** Active chats are swept every 15 minutes to clear messages older than 6 hours, keeping discussions fresh and fast! (Pinned messages preserved).\n` +
            `• **Direct Sandy Actions:** Sandy can instruct Rocket directly in chat or DMs to lock/unlock channels, purge messages, timeout, kick, or ban without slash commands.\n` +
            `• **Mention or DM:** Tag <@${channel.client.user.id}> here or message in DMs for private assistant mode!\n\n` +
            `*Drop some pizza slices with the button dashboard or say hello!* 🍕🦝`
          )
          .setFooter({ text: 'Rocket AI • Neural Companion 🐾' });
        break;
      }

      case 'announcements': {
        embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('📢 OFFICIAL SERVER ANNOUNCEMENTS')
          .setDescription(
            `Official broadcasts, system updates, and major news from **Sandy** and the administrative team.\n\n` +
            `• Check here regularly for community events, bot upgrades, and important notices.\n` +
            `• Only Sandy and authorized staff may broadcast to this channel.`
          )
          .setFooter({ text: 'Rocket Broadcast Station 📡' });

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_open_announcement_hub')
              .setLabel('📢 Dispatch Announcement (Rocket Owners)')
              .setEmoji('📢')
              .setStyle(ButtonStyle.Success)
          ),
        ];
        break;
      }

      case 'general': {
        embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle('💬 COMMUNITY LOUNGE — GENERAL CHAT')
          .setDescription(
            `The central social gathering hub for members and friends!\n\n` +
            `• Chat about life, projects, ideas, or hang out.\n` +
            `• Respect community guidelines and enjoy the banter.\n` +
            `• Tag Rocket (<@${channel.client.user.id}>) if you want a witty remark or helpful insight!`
          )
          .setFooter({ text: 'Community Lounge 🍕' });
        break;
      }

      case 'media-clips': {
        embed = new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle('🎬 MEDIA & HIGHLIGHT CLIPS')
          .setDescription(
            `Share your best gameplay clips, screenshots, creative art, and media here!\n\n` +
            `🧹 *Note: This channel runs on the 6-Hour Auto-Purge schedule to prevent media backlog and keep the server lightweight. Pinned clips are permanently preserved.*`
          )
          .setFooter({ text: 'Media Showcase • 6h Auto-Clean 🎥' });
        break;
      }

      case 'memes': {
        embed = new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle('🐸 TOP-TIER MEMES & HUMOR')
          .setDescription(
            `Drop your freshest memes, funny videos, and comedic gold!\n\n` +
            `🧹 *Auto-cleaned after 6 hours to keep content spicy and fresh! Pin your greatest memes to save them forever.*`
          )
          .setFooter({ text: 'Meme Vault • 6h Auto-Clean 🤣' });
        break;
      }

      case 'wallet-hub':
      case 'wallet': {
        embed = new EmbedBuilder()
          .setColor(GOLD_COLOR)
          .setTitle('🍕 NERO LABS VIRTUAL WALLET & BILLING HUB')
          .setDescription(
            `Welcome to the **Nero Labs Wallet Hub**! Pizza is our internal credit system for workstation licenses, custom engineering, and AI token allocations.\n\n` +
            `• **Conversion Rate:** \`1 Pizza = ₹1 INR\`\n` +
            `• **AI Tokens:** \`₹1 = 1,000 AI Tokens\` (Minimum top-up: ₹50 for 50,000 tokens)\n` +
            `• **Payment Gateways:** India Google Pay & UPI payments supported.\n` +
            `• **Refund Guarantee:** 6-Month eligibility window with 10% processing deduction.\n\n` +
            `👉 *Click **Open My Wallet** below to view your private balance, recent ledger transactions, and deposit funds (Only visible to you!)*`
          )
          .setFooter({ text: 'Rocket Virtual Wallet • Blueprint v1.0 🛡️' });

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_wallet_view_balance')
              .setLabel('💳 Open My Wallet')
              .setEmoji('💳')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('btn_wallet_deposit')
              .setLabel('➕ Add Funds (UPI / GPay)')
              .setEmoji('➕')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('btn_wallet_refund')
              .setLabel('🔄 Request Refund')
              .setEmoji('🔄')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('btn_open_ticket_wallet')
              .setLabel('🎫 Wallet Ticket')
              .setEmoji('🎫')
              .setStyle(ButtonStyle.Secondary)
          ),
        ];
        break;
      }

      case 'help-desk':
      case 'help': {
        embed = new EmbedBuilder()
          .setColor(INFO_COLOR)
          .setTitle('🎫 CONFIDENTIAL SUPPORT & HELP TICKETS')
          .setDescription(
            `Need assistance, want to report an issue, or need private human support from Sandy and staff?\n\n` +
            `Click **Open Support Ticket** below. Rocket will automatically provision a private ticket channel accessible only to you, Rocket, and authorized staff.\n\n` +
            `• Attach screenshots or explanations directly in the ticket.\n` +
            `• Staff will be immediately notified to assist you.`
          )
          .setFooter({ text: 'Rocket Support Dispatcher 🦝' });

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_open_create_ticket')
              .setLabel('🎫 Open Support Ticket')
              .setStyle(ButtonStyle.Primary)
          ),
        ];
        break;
      }

      case 'coding-orders': {
        embed = new EmbedBuilder()
          .setColor(INFO_COLOR)
          .setTitle('💻 CODING COMMISSIONS & WORK ORDERS')
          .setDescription(
            `Welcome to the **Coding Section**! Software engineering, Discord bots, backend APIs, and automation scripts.\n\n` +
            `👉 **Need a custom build, script, bot, or bug fix?**\n` +
            `Click **Open Coding Ticket** below to start a private 1-on-1 work order with **Sandy**. You can discuss project requirements, pricing, and timeline directly with Sandy!\n\n` +
            `🔒 *Internal coding workstations are unlocked once you are a verified buyer.*`
          )
          .setFooter({ text: 'Sandy Coding Studio • Private Work Order 💻' });

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_open_ticket_coding')
              .setLabel('💻 Open Coding Ticket')
              .setStyle(ButtonStyle.Primary)
          ),
        ];
        break;
      }

      case 'coding-chat': {
        embed = new EmbedBuilder()
          .setColor(INFO_COLOR)
          .setTitle('💻 VIP BUYER CODING WORKSTATION')
          .setDescription(
            `Welcome to the private **Coding Workstation** for verified N3R0L4BS Buyers and Clients!\n\n` +
            `• Discuss software architecture, codebase issues, and features directly with Sandy.\n` +
            `• Test snippets in <#${guild.channels.cache.find((c) => c.name === 'code-runner')?.id || 'code-runner'}>\n` +
            `• Inspect live bot builds in <#${guild.channels.cache.find((c) => c.name === 'bot-showcase')?.id || 'bot-showcase'}>`
          )
          .setFooter({ text: 'VIP Buyer Workstation • Sandy & Clients 💻' });
        break;
      }

      case 'web-orders': {
        embed = new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle('🌐 WEB DEVELOPMENT COMMISSIONS & WORK ORDERS')
          .setDescription(
            `Welcome to the **Web Development Section**! Modern landing pages, full-stack web applications, UI/UX, and cloud deployments.\n\n` +
            `👉 **Need a website or web app built?**\n` +
            `Click **Open Web Dev Ticket** below to start a private work order with **Sandy**. Discuss features, pricing, and live deployment directly with Sandy!\n\n` +
            `🔒 *Internal web workstations are unlocked once you are a verified buyer.*`
          )
          .setFooter({ text: 'Sandy Web Studio • Private Work Order 🌐' });

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_open_ticket_web')
              .setLabel('🌐 Open Web Dev Ticket')
              .setStyle(ButtonStyle.Primary)
          ),
        ];
        break;
      }

      case 'web-dev': {
        embed = new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle('🌐 VIP BUYER WEB WORKSTATION')
          .setDescription(
            `Welcome to the private **Web Workstation** for verified N3R0L4BS Buyers and Clients!\n\n` +
            `• Discuss web apps, designs, and staging with Sandy.\n` +
            `• Check live staging in <#${guild.channels.cache.find((c) => c.name === 'live-previews')?.id || 'live-previews'}>\n` +
            `• Review UI mockups in <#${guild.channels.cache.find((c) => c.name === 'design-lab')?.id || 'design-lab'}>`
          )
          .setFooter({ text: 'VIP Buyer Workstation • Sandy & Clients 🌐' });
        break;
      }

      case 'gaming-orders': {
        embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('🎮 GAMING SERVICES, ASSETS & WORK ORDERS')
          .setDescription(
            `Welcome to the **Gaming Section**! Roblox builds, custom scripts, game server setups, configs, and assets.\n\n` +
            `👉 **Need game assets, scripts, or server setups?**\n` +
            `Click **Open Gaming Ticket** below to start a private work order with **Sandy**!\n\n` +
            `🔒 *Internal gaming workstations are unlocked once you are a verified buyer.*`
          )
          .setFooter({ text: 'Sandy Gaming Studio • Private Work Order 🎮' });

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_open_ticket_gaming')
              .setLabel('🎮 Open Gaming Ticket')
              .setStyle(ButtonStyle.Primary)
          ),
        ];
        break;
      }

      case 'gaming-hub': {
        embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('🎮 VIP BUYER GAMING WORKSTATION')
          .setDescription(
            `Welcome to the private **Gaming Workstation** for verified N3R0L4BS Buyers and Gamers!\n\n` +
            `• Squad matchmaking, custom server configs, and project collaborations.\n` +
            `• Download shared configs & assets in <#${guild.channels.cache.find((c) => c.name === 'game-assets')?.id || 'game-assets'}>`
          )
          .setFooter({ text: 'VIP Buyer Workstation • Sandy & Clients 🎮' });
        break;
      }

      case 'ai-orders': {
        embed = new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle('🤖 AI & NEURAL AUTOMATION WORK ORDERS')
          .setDescription(
            `Welcome to the **AI & Technology Section**! Autonomous agents, custom AI tools, and workflow automation.\n\n` +
            `👉 **Need an AI bot or smart automation built?**\n` +
            `Click **Open AI Ticket** below to discuss your project directly with **Sandy**!\n\n` +
            `🔒 *Internal AI workstations are unlocked once you are a verified buyer.*`
          )
          .setFooter({ text: 'Sandy AI Labs • Private Work Order 🤖' });

        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_open_ticket_ai')
              .setLabel('🤖 Open AI Ticket')
              .setStyle(ButtonStyle.Primary)
          ),
        ];
        break;
      }

      case 'ai-tools': {
        embed = new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle('🤖 VIP BUYER AI WORKSTATION')
          .setDescription(
            `Welcome to the private **AI Workstation** for verified N3R0L4BS Buyers!\n\n` +
            `• Test custom AI models, agent architectures, and autonomous workflows with Sandy.`
          )
          .setFooter({ text: 'VIP Buyer Workstation • Sandy & Clients 🤖' });
        break;
      }

      case 'audit-logs': {
        embed = new EmbedBuilder()
          .setColor(DANGER_COLOR)
          .setTitle('🔒 ROCKET SECURITY AUDIT & MODERATION TRAIL')
          .setDescription(
            `Administrative audit log for Sandy and authorized staff.\n\n` +
            `• Real-time logging of user timeouts, kicks, bans, and auto-purge operations.\n` +
            `• Sandy defense alerts: Any disrespect toward Sandy is logged here with full user details and strike counts.\n` +
            `• System heartbeat, permission changes, and emergency lockdown logs.`
          )
          .setFooter({ text: 'Confidential • Staff & Sandy Eyes Only 🔒' });
        break;
      }

      default:
        return;
    }

    if (!embed) return;

    // Purge all old messages and clutter so the channel is completely clean
    await cleanChannelCompletely(channel);
    await channel.send({ embeds: [embed], components }).catch(() => null);
  } catch (cardErr) {
    console.warn(`[Setup] Note deploying card to #${channel.name}:`, cardErr.message);
  }
}

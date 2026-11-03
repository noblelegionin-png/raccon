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
  if (config.discordOwnerId && user.id === config.discordOwnerId) return true;
  if (guild && guild.ownerId === user.id) return true;

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
  const { customId } = interaction;
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
          .setTitle('🦝 ROCKET AI — Server Guardian & Companion')
          .setDescription(
            `Hey there! I am **Rocket**, your mischievous raccoon AI companion created under **Nero Labs** 🍕🐾\n` +
            `Here are the user-facing tools and commands available to you:`
          )
          .addFields(
            {
              name: '💬 Conversational Intelligence',
              value:
                '`/ask <question>` — Ask Rocket anything with server context & rules\n' +
                '• Mention `@R0CK3T` or say *"Hey Rocket"* anywhere to chat\n' +
                '• Use dedicated channels like `#research` (deep analysis) & `#study` (tutorials & explanations)',
            },
            {
              name: '🎮 Gaming Hub',
              value:
                '`/add-friends` — Link your gamer tag (Minecraft, Brawl Stars, Roblox, Steam, etc.)\n' +
                '• Visit `#games` to check active server games and player rosters!',
            },
            {
              name: '🚀 Apps & Dashboards',
              value:
                '• Visit `#control-panel` to open your private isolated dashboard\n' +
                '• Visit `#mini-app` to open the Rocket Web OS\n' +
                '• Visit `#website` & `#linktree` for official links',
            },
            {
              name: '🍕 Raccoon Care & Fun',
              value:
                '`/feed <pizza|taco>` — Feed Rocket pizza or tacos to boost his mood!\n' +
                '`/status` — View Rocket\'s mood, hunger %, and latency',
            }
          )
          .setFooter({ text: 'Nero Labs • Rocket AI 🦝' })
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
              maxTokens: 600,
              timeoutMs: 30000,
            });
            answer = completion.choices?.[0]?.message?.content || answer;
          } catch (aiErr) {
            answer = `🦝 *puffs tail* Got a hiccup talking to AI brain: ${aiErr.message}`;
          }
        }

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
            content: '⛔ **Access Denied:** Only Nero or authorized administrators can configure chat mode.',
            ephemeral: true,
          });
        }

        const mode = interaction.options.getString('mode');
        updateGuildSettings(guild.id, { chat_mode: mode });
        const descriptions = {
          constant: '🔥 **Constant Talk Mode:** Rocket participates on **EVERY MESSAGE** in chat!',
          active: '🟢 **Active Banter Mode:** Rocket speaks when called by name, mentioned, or replied to.',
          mention_only: '⚪ **Mention-Only Mode:** Rocket speaks only when explicitly @mentioned.',
        };
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS_COLOR).setTitle('💬 Chat Mode Updated').setDescription(descriptions[mode] || mode)] });
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
    if (customId === 'btn_open_create_ticket') {
      return handleOpenTicketButton(interaction);
    }
    if (
      customId.startsWith('btn_close_ticket_') ||
      customId.startsWith('btn_escalate_ticket_') ||
      customId.startsWith('btn_claim_ticket_')
    ) {
      return handleTicketButton(interaction);
    }

    // Live Voice & Gaming Notification Buttons
    if (customId.startsWith('btn_notify_')) {
      return handleNotificationButton(interaction);
    }

    switch (customId) {
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
    if (customId === 'modal_create_ticket') {
      return handleTicketModalSubmit(interaction);
    }
    if (customId === 'modal_verify_step1') {
      return handleVerifyModalSubmit(interaction);
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

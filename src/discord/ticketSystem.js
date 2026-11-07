/**
 * 🦝 ROCKET AI — PRIVATE SUPPORT & HELP TICKET SYSTEM
 * 
 * Implements:
 * - Confidential ticket creation from #help
 * - Strict Discord permission overwrites (Only reporting member, Sandy, Staff & Rocket can view!)
 * - Private ticket channel provisioning (e.g., #ticket-1001-username)
 * - DM notification with direct channel link
 * - Staff escalation queue in #help-admin
 * - Interactive ticket controls: Close Ticket, Escalate to Sandy, Claim Ticket
 */

import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import {
  createTicket,
  getTicket,
  getTicketByChannel,
  updateTicketChannel,
  updateTicketStatus,
  getGuildSettings,
} from './discordDb.js';
import { config } from '../config.js';
import { isDiscordOwner } from './commandHandlers.js';

const BRAND_COLOR = 0xff6b35;
const SUCCESS_COLOR = 0x2ecc71;
const DANGER_COLOR = 0xe74c3c;
const OWNER_COLOR = 0x9b59b6;
const INFO_COLOR = 0x3498db;

/**
 * Handle "Open Support / Work Order Ticket" button click -> shows modal
 */
export async function handleOpenTicketButton(interaction, categoryKey = 'general') {
  let section = categoryKey;
  if (interaction.customId && interaction.customId.startsWith('btn_open_ticket_')) {
    section = interaction.customId.replace('btn_open_ticket_', '');
  } else if (interaction.customId === 'btn_open_create_ticket') {
    section = 'general';
  }

  const sectionTitles = {
    coding: '💻 Coding Work Order',
    web: '🌐 Web Dev Work Order',
    gaming: '🎮 Gaming Work Order',
    ai: '🤖 AI Automation Order',
    general: '🎫 Support Ticket',
  };

  const modal = new ModalBuilder()
    .setCustomId(`modal_create_ticket_${section}`)
    .setTitle((sectionTitles[section] || '🎫 Open Private Ticket').slice(0, 45));

  const subjectInput = new TextInputBuilder()
    .setCustomId('input_ticket_subject')
    .setLabel('Project Summary / What do you need?')
    .setPlaceholder('e.g. Discord bot, Portfolio web app, Roblox script')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const detailsInput = new TextInputBuilder()
    .setCustomId('input_ticket_details')
    .setLabel('Project details / timeline / budget:')
    .setPlaceholder('Explain your requirements, features needed, or budget...')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(subjectInput),
    new ActionRowBuilder().addComponents(detailsInput)
  );

  return interaction.showModal(modal);
}

/**
 * Handle Modal Submission -> Provisions Private Ticket Channel
 */
export async function handleTicketModalSubmit(interaction) {
  const { guild, user, fields, customId } = interaction;
  const section = customId.startsWith('modal_create_ticket_')
    ? customId.replace('modal_create_ticket_', '')
    : 'general';

  const subject = fields.getTextInputValue('input_ticket_subject');
  const details = fields.getTextInputValue('input_ticket_details');

  await interaction.deferReply({ ephemeral: true });

  try {
    // 1. Create ticket entry in SQLite to obtain ticket ID
    const ticket = createTicket(guild.id, user.id, {
      username: user.tag || user.username,
      subject: `[${section.toUpperCase()}] ${subject}`,
    });

    const ticketNumber = String(ticket.id).padStart(4, '0');
    const safeUsername = user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 15) || 'client';
    const channelName = `ticket-${section}-${safeUsername}`;

    // 2. Locate or create parent category (ACTIVE TICKETS or SUPPORT & AUDIT)
    let parentCategory = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket')
    ) || guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'support & audit'
    );

    if (!parentCategory) {
      parentCategory = await guild.channels.create({
        name: '📂 ACTIVE TICKETS',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: guild.client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
          },
        ],
      }).catch(() => null);
    }

    // 3. Configure STRICT PRIVACY permission overwrites
    // ZERO OTHER MEMBERS CAN VIEW THIS CHANNEL!
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: guild.client.user.id, // Rocket
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
        id: user.id, // The client
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    // Allow Sandy (Owner)
    const ownerId = config.discordOwnerId || '1477589102110183477';
    if (ownerId) {
      permissionOverwrites.push({
        id: ownerId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    // Allow Staff Role
    const staffRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'staff');
    if (staffRole) {
      permissionOverwrites.push({
        id: staffRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    // Allow Rocket Access Role
    const rocketAccessRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'rocket access');
    if (rocketAccessRole) {
      permissionOverwrites.push({
        id: rocketAccessRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    // 4. Create the private channel
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentCategory?.id,
      topic: `🔒 Private ${section.toUpperCase()} Work Order for ${user.tag} with Sandy`,
      permissionOverwrites,
    });

    // Update SQLite with the created channel ID
    updateTicketChannel(ticket.id, ticketChannel.id);

    // 5. Post Welcome & Workstation Controls in the Ticket Channel
    const ticketEmbed = new EmbedBuilder()
      .setColor(0x00e5ff)
      .setTitle(`🎫 ${section.toUpperCase()} WORK ORDER #${ticketNumber} — ${user.username.toUpperCase()}`)
      .setDescription(
        `👋 Welcome <@${user.id}>! This is your private workstation with Boss Sandy <@${ownerId}>.\n\n` +
        `• **Project / Need:** ${subject}\n` +
        `• **Details & Scope:** ${details}\n\n` +
        `👑 **Boss Sandy** will discuss the details, timeline, and pricing directly with you right here!\n\n` +
        `🔒 *This channel is 100% private between you, Sandy, and staff.*`
      )
      .setFooter({ text: 'Rocket AI • Secure Client Workstation 🦝' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_close_ticket_${ticket.id}`)
        .setLabel('🔒 Close & Archive Ticket')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`btn_escalate_ticket_${ticket.id}`)
        .setLabel('👑 Ping Sandy (Boss)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`btn_grant_buyer_${ticket.id}_${user.id}`)
        .setLabel('⭐ Grant Buyer Role')
        .setStyle(ButtonStyle.Success)
    );

    await ticketChannel.send({
      content: `<@${user.id}> <@${ownerId}>, your private workstation has been opened!`,
      embeds: [ticketEmbed],
      components: [row],
    });

    // 6. Direct alert to Sandy in DMs
    try {
      const ownerUser = await guild.client.users.fetch(ownerId).catch(() => null);
      if (ownerUser) {
        const ownerDmEmbed = new EmbedBuilder()
          .setColor(OWNER_COLOR)
          .setTitle(`👑 [NEW ${section.toUpperCase()} TICKET #${ticketNumber}]`)
          .setDescription(
            `A client has opened a new work ticket in **${guild.name}**!\n\n` +
            `• **Client:** <@${user.id}> (${user.tag})\n` +
            `• **Section:** ${section.toUpperCase()}\n` +
            `• **Subject:** ${subject}\n` +
            `• **Details:** ${details}\n\n` +
            `👉 **Go directly to the ticket:** <#${ticketChannel.id}>`
          );
        await ownerUser.send({ embeds: [ownerDmEmbed] }).catch(() => null);
      }
    } catch {}

    // 7. Ephemeral confirmation to the client
    const successEmbed = new EmbedBuilder()
      .setColor(SUCCESS_COLOR)
      .setTitle('✅ Private Work Ticket Created!')
      .setDescription(
        `Your private ticket has been provisioned:\n\n` +
        `👉 **Go to your ticket channel:** <#${ticketChannel.id}>\n\n` +
        `🔒 *Your ticket is completely private and invisible to all other members.*`
      );

    return interaction.editReply({ embeds: [successEmbed] });
  } catch (err) {
    console.error('[Ticket Creation Error]:', err);
    return interaction.editReply({
      content: `⚠️ Failed to create ticket channel: ${err.message}`,
    });
  }
}

/**
 * Dispatch Ticket Notification to #help-admin
 */
async function notifyHelpAdmin(guild, ticketId, user, subject, details, ticketChannelId) {
  try {
    const adminChannel = guild.channels.cache.find((c) => c.name === 'help-admin');
    if (!adminChannel || !adminChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(OWNER_COLOR)
      .setTitle(`📥 [NEW TICKET #${String(ticketId).padStart(4, '0')}] ${subject}`)
      .setDescription(
        `**Member:** <@${user.id}> (\`${user.tag}\`)\n` +
        `**Ticket Channel:** <#${ticketChannelId}>\n` +
        `**Details:**\n\`\`\`\n${details.slice(0, 400)}\n\`\`\``
      )
      .setFooter({ text: 'Staff Ticket Queue 🛡️' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('👉 Jump to Ticket')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guild.id}/${ticketChannelId}`),
      new ButtonBuilder()
        .setCustomId(`btn_claim_ticket_${ticketId}`)
        .setLabel('📌 Claim Ticket')
        .setStyle(ButtonStyle.Secondary)
    );

    await adminChannel.send({ embeds: [embed], components: [row] }).catch(() => null);
  } catch (adminErr) {
    console.warn('[Ticket Admin Notification Error]:', adminErr.message);
  }
}

/**
 * Handle Ticket Action Buttons (Close, Escalate, Claim)
 */
export async function handleTicketButton(interaction) {
  const { customId, guild, user, channel } = interaction;

  // 1. Close Ticket
  if (customId.startsWith('btn_close_ticket_')) {
    const ticketId = customId.replace('btn_close_ticket_', '');
    const ticket = getTicket(ticketId) || getTicketByChannel(channel.id);

    // Permission check: Author, Staff, or Sandy
    const isOwner = isDiscordOwner(user, guild);
    const isStaff = user.id === ticket?.user_id || isOwner || interaction.member.roles.cache.some(r => r.name.toLowerCase() === 'staff');

    if (!isStaff && user.id !== ticket?.user_id) {
      return interaction.reply({ content: '⛔ You do not have permission to close this ticket.', ephemeral: true });
    }

    await interaction.reply({ content: '🔒 **Closing ticket and archiving channel in 5 seconds...**' });

    updateTicketStatus(ticketId, 'closed');

    setTimeout(async () => {
      try {
        await channel.delete('Ticket closed by user or staff');
      } catch (delErr) {
        console.warn('[Ticket Delete Error]:', delErr.message);
      }
    }, 5000);
    return;
  }

  // 2. Escalate to Sandy
  if (customId.startsWith('btn_escalate_ticket_')) {
    const ticketId = customId.replace('btn_escalate_ticket_', '');
    updateTicketStatus(ticketId, 'in_progress', { staffNotes: `Escalated to Sandy by ${user.tag}` });

    const ownerId = config.discordOwnerId || guild.ownerId;
    const escalationEmbed = new EmbedBuilder()
      .setColor(OWNER_COLOR)
      .setTitle('⚡ TICKET ESCALATED TO SANDY')
      .setDescription(
        `This ticket has been flagged for direct review by **Sandy** <@${ownerId}>.\n\n` +
        `Sandy has supreme clearance and will inspect the logs and evidence shortly.`
      );

    await interaction.reply({ embeds: [escalationEmbed] });

    // Also alert Sandy via DM if possible
    if (ownerId && ownerId !== user.id) {
      try {
        const ownerUser = await guild.client.users.fetch(ownerId).catch(() => null);
        if (ownerUser) {
          await ownerUser.send({
            content: `👑 **Boss Sandy:** Ticket #${ticketId} in **${guild.name}** was escalated for your personal review!\nChannel: <#${channel.id}>`,
          }).catch(() => null);
        }
      } catch {}
    }
    return;
  }

  // 3. Claim Ticket
  if (customId.startsWith('btn_claim_ticket_')) {
    const ticketId = customId.replace('btn_claim_ticket_', '');
    updateTicketStatus(ticketId, 'in_progress', { assignedTo: user.tag });

    return interaction.reply({
      content: `📌 <@${user.id}> has claimed Ticket #${ticketId}!`,
    });
  }

  // 4. Grant Buyer Role (Boss Sandy & Staff Only)
  if (customId.startsWith('btn_grant_buyer_')) {
    const parts = customId.split('_');
    const ticketId = parts[3];
    const targetUserId = parts[4];

    const isOwner = isDiscordOwner(user, guild);
    const isStaff = isOwner || interaction.member.roles.cache.some(r => r.name.toLowerCase() === 'staff');

    if (!isStaff) {
      return interaction.reply({
        content: '⛔ Only **Boss Sandy** or authorized Staff can grant the Buyer role.',
        ephemeral: true,
      });
    }

    try {
      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      if (!targetMember) {
        return interaction.reply({ content: '❌ Target member not found in this server.', ephemeral: true });
      }

      const buyerRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'buyer');
      const clientRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'client');

      if (buyerRole) await targetMember.roles.add(buyerRole).catch(() => null);
      if (clientRole) await targetMember.roles.add(clientRole).catch(() => null);

      const grantEmbed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('⭐ OFFICIAL BUYER VERIFIED!')
        .setDescription(
          `👑 **Boss Sandy** has officially verified <@${targetUserId}> as a **N3R0L4BS Buyer**!\n\n` +
          `🔓 **Unlocked Workstation Channels:**\n` +
          `• 💻 **Coding:** <#${guild.channels.cache.find(c => c.name === 'coding-chat')?.id || 'coding-chat'}>, <#${guild.channels.cache.find(c => c.name === 'code-runner')?.id || 'code-runner'}>, <#${guild.channels.cache.find(c => c.name === 'bot-showcase')?.id || 'bot-showcase'}>\n` +
          `• 🌐 **Web:** <#${guild.channels.cache.find(c => c.name === 'web-dev')?.id || 'web-dev'}>, <#${guild.channels.cache.find(c => c.name === 'live-previews')?.id || 'live-previews'}>, <#${guild.channels.cache.find(c => c.name === 'design-lab')?.id || 'design-lab'}>\n` +
          `• 🎮 **Gaming:** <#${guild.channels.cache.find(c => c.name === 'gaming-hub')?.id || 'gaming-hub'}>, <#${guild.channels.cache.find(c => c.name === 'game-assets')?.id || 'game-assets'}>\n` +
          `• 🤖 **AI & Tech:** <#${guild.channels.cache.find(c => c.name === 'ai-tools')?.id || 'ai-tools'}>\n\n` +
          `Welcome aboard! Your workstation access is permanently unlocked.`
        )
        .setFooter({ text: 'Rocket AI • VIP Buyer Verification ⭐' })
        .setTimestamp();

      return interaction.reply({ embeds: [grantEmbed] });
    } catch (err) {
      console.error('[Grant Buyer Error]:', err);
      return interaction.reply({ content: `❌ Error granting role: ${err.message}`, ephemeral: true });
    }
  }
}

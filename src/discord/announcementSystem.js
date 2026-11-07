/**
 * 🦝 ROCKET ANNOUNCEMENT SYSTEM — DISPATCH HQ
 * 
 * Supports:
 * 1. Ephemeral Announcement Studio ("Only visible to you" message)
 * 2. 🤖 AI-Powered Announcement Generator (GPT-6 Luna / ScaleMax with Raccoon Persona)
 * 3. ✍️ Custom Announcement Creator (Markdown, custom pings, accent colors)
 * 4. Ephemeral Previews with 1-click Broadcast, Regenerate, or Discard
 * 5. Natural Language Directives ("rocket announce ai: ...", "rocket announce: ...")
 * 6. Slash Command `/announce` (hub, ai, custom)
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { isDiscordOwner } from './commandHandlers.js';
import { scrubRestrictedBrandNames } from '../conversation/responseValidator.js';

// In-memory cache for pending announcement drafts (ephemeral workflow)
const pendingDrafts = new Map();

const COLOR_MAP = {
  gold: 0xf1c40f,
  yellow: 0xf1c40f,
  cyan: 0x00e5ff,
  blue: 0x3498db,
  purple: 0x9b59b6,
  red: 0xe74c3c,
  crimson: 0xe74c3c,
  green: 0x2ecc71,
  emerald: 0x2ecc71,
  orange: 0xe67e22,
};

function resolveColor(input) {
  if (!input) return 0xf1c40f;
  const clean = String(input).toLowerCase().trim();
  if (COLOR_MAP[clean]) return COLOR_MAP[clean];
  if (/^#?[0-9a-f]{6}$/i.test(clean)) {
    return parseInt(clean.replace('#', ''), 16);
  }
  return 0xf1c40f;
}

/**
 * Check if the user is authorized to manage/dispatch announcements
 */
export function isAnnouncementAuthorized(user, member = null, guild = null) {
  if (!user) return false;
  if (user.id === '1477589102110183477') return true;
  if (isDiscordOwner(user, guild)) return true;
  if (member?.roles?.cache) {
    const roles = typeof member.roles.cache.some === 'function'
      ? member.roles.cache
      : Array.from(member.roles.cache.values());
    if (roles.some((r) => {
      const n = (r.name || '').toLowerCase();
      return n === 'rocket access' || n === 'rocket owner' || n === 'rocket' || n === 'admin' || n === 'staff';
    })) {
      return true;
    }
  }
  return false;
}

/**
 * Build the ephemeral Announcement Studio ("Only visible to you" message)
 */
export function buildAnnouncementStudioPayload() {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('📢 ROCKET DISPATCH HQ — ANNOUNCEMENT STUDIO')
    .setDescription(
      `👋 **Welcome Boss Sandy / Rocket Owner!** *(🔒 Only you can see this message)*\n\n` +
      `Choose how you would like Rocket to dispatch your announcement to **#announcements**:\n\n` +
      `• **🤖 AI-Powered Announcement:** Provide a brief topic or bullet points. Rocket's neural engine (ScaleMax / GPT-6 Luna) will craft an energetic, high-impact raccoon announcement with a private preview before sending.\n\n` +
      `• **✍️ Custom Announcement:** Write your exact title, markdown content, and choose mention targets (\`@everyone\`, \`@here\`, or \`none\`).\n\n` +
      `👇 **Click a button below to launch the announcement creator:**`
    )
    .setFooter({ text: 'Rocket Broadcast Station 📡 • Supreme Boss Clearance 👑' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_announce_mode_ai')
      .setLabel('🤖 AI-Powered Announcement')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🤖'),
    new ButtonBuilder()
      .setCustomId('btn_announce_mode_custom')
      .setLabel('✍️ Custom Announcement')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✍️'),
    new ButtonBuilder()
      .setCustomId('btn_announce_dismiss')
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

/**
 * Handle opening the Announcement Studio (triggered by button or command)
 */
export async function handleOpenAnnouncementStudio(interaction) {
  const { user, member, guild } = interaction;
  if (!isAnnouncementAuthorized(user, member, guild)) {
    return interaction.reply({
      content: '⛔ **Access Denied:** Only Supreme Boss (**Sandy**) and verified **@Rocket Access** owners can dispatch server announcements!',
      ephemeral: true,
    });
  }

  const payload = buildAnnouncementStudioPayload();
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

/**
 * Show the Modal for AI-Powered Announcement
 */
export async function showAiAnnouncementModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_announce_ai')
    .setTitle('🤖 AI-Powered Announcement');

  const topicInput = new TextInputBuilder()
    .setCustomId('input_ai_topic')
    .setLabel('Topic / Subject (Required)')
    .setPlaceholder('e.g. Major platform upgrade, 50% discount on web dev, game night...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(150);

  const notesInput = new TextInputBuilder()
    .setCustomId('input_ai_notes')
    .setLabel('Key Details, Links, or Bullet Points')
    .setPlaceholder('Enter rough notes, instructions, links, or perks for Rocket to format...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1500);

  const toneInput = new TextInputBuilder()
    .setCustomId('input_ai_tone')
    .setLabel('Tone / Vibe (Hype, Urgent, Chill, Official)')
    .setPlaceholder('Hype & energetic raccoon (default)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(60);

  const pingInput = new TextInputBuilder()
    .setCustomId('input_ai_ping')
    .setLabel('Mention Target (@everyone, @here, none)')
    .setPlaceholder('@everyone, @here, or none (default: none)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(topicInput),
    new ActionRowBuilder().addComponents(notesInput),
    new ActionRowBuilder().addComponents(toneInput),
    new ActionRowBuilder().addComponents(pingInput)
  );

  return interaction.showModal(modal);
}

/**
 * Show the Modal for Custom Announcement
 */
export async function showCustomAnnouncementModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_announce_custom')
    .setTitle('✍️ Custom Announcement');

  const titleInput = new TextInputBuilder()
    .setCustomId('input_custom_title')
    .setLabel('Announcement Title (Required)')
    .setPlaceholder('e.g. 🚀 N3R0L4BS MAJOR PLATFORM UPGRADE')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(150);

  const bodyInput = new TextInputBuilder()
    .setCustomId('input_custom_body')
    .setLabel('Announcement Message (Markdown Supported)')
    .setPlaceholder('Write your announcement body here... (Supports headers, bullet points, emojis)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(3000);

  const pingInput = new TextInputBuilder()
    .setCustomId('input_custom_ping')
    .setLabel('Mention Target (@everyone, @here, none)')
    .setPlaceholder('@everyone, @here, or none (default: none)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20);

  const colorInput = new TextInputBuilder()
    .setCustomId('input_custom_color')
    .setLabel('Accent Color (Gold, Cyan, Purple, Red, Green)')
    .setPlaceholder('Gold (default)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(30);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(bodyInput),
    new ActionRowBuilder().addComponents(pingInput),
    new ActionRowBuilder().addComponents(colorInput)
  );

  return interaction.showModal(modal);
}

/**
 * Generate AI-Powered Announcement using ScaleMax / GPT-6 Luna
 */
export async function generateAiAnnouncement({ topic, notes = '', tone = '', ping = 'none' }) {
  const toneDesc = tone.trim() || 'Hype, sharp, energetic, witty, loyal raccoon assistant';

  const systemPrompt = `You are Rocket, the razor-sharp, energetic raccoon AI guardian and master dispatcher for N3R0L4BS and Supreme Boss Sandy.
Your task is to craft a high-impact, beautifully styled Discord server announcement.
Format the announcement specifically for Discord markdown:
- Title must be punchy, hype, and exciting with 1-2 relevant emojis (e.g. 🚀, 📢, ⚡, 🍕, 👑).
- Body must be structured with Discord markdown: bold headers, clear bullet points, callout emojis, and a call-to-action.
- Tone/Vibe: ${toneDesc}
- Emphasize quality, speed, and premium service.
- If links or notes are given, format them cleanly.
- End with an energetic raccoon sign-off from Boss Sandy and Rocket AI (e.g. "— Boss Sandy & Rocket AI 🦝🍕").
- Return YOUR RESPONSE STRICTLY AS VALID JSON with this structure:
{
  "title": "Title here",
  "body": "Formatted markdown body here"
}`;

  const userPrompt = `Topic / Subject: ${topic}\nKey Details / Notes: ${notes || 'Highlight our capabilities and invite members to check out the workstations or open a ticket.'}`;

  let title = `🚀 ${topic.toUpperCase()}`;
  let body = `Hey everyone! Supreme Boss **Sandy** has dropped an official update:\n\n` +
             `### 📌 **Overview**\n${topic}\n\n` +
             (notes ? `### 🔍 **Details & Scope**\n${notes}\n\n` : '') +
             `• Direct any inquiries to <#help-desk> or open a private work order!\n` +
             `• Stay tuned for upcoming releases.\n\n` +
             `*— Dispatched by Sandy & Rocket AI 🦝🍕*`;

  if (scaleMaxAdapter.isConfigured()) {
    try {
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gpt-6-luna',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 1200,
        temperature: 0.75,
        timeoutMs: 35000,
      });

      const raw = completion.choices?.[0]?.message?.content || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.title) title = parsed.title;
          if (parsed.body) body = parsed.body;
        } catch {
          body = raw;
        }
      } else if (raw.trim()) {
        body = raw;
      }
    } catch (err) {
      console.warn('[Rocket AI Announcement Generation Error]:', err.message);
    }
  }

  title = scrubRestrictedBrandNames(title);
  body = scrubRestrictedBrandNames(body);

  return { title, body };
}

/**
 * Save draft into temporary memory cache
 */
function saveDraft(draft) {
  const id = `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  pendingDrafts.set(id, { ...draft, id, createdAt: Date.now() });

  // Cleanup drafts older than 30 minutes
  const expiry = Date.now() - 30 * 60 * 1000;
  for (const [key, val] of pendingDrafts.entries()) {
    if (val.createdAt < expiry) pendingDrafts.delete(key);
  }
  return id;
}

/**
 * Handle AI Announcement Modal Submission
 */
export async function handleAiAnnouncementSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const topic = interaction.fields.getTextInputValue('input_ai_topic');
  const notes = interaction.fields.getTextInputValue('input_ai_notes') || '';
  const tone = interaction.fields.getTextInputValue('input_ai_tone') || '';
  const rawPing = interaction.fields.getTextInputValue('input_ai_ping') || 'none';

  let cleanPing = rawPing.trim().toLowerCase();
  if (cleanPing !== '@everyone' && cleanPing !== '@here') {
    cleanPing = 'none';
  }

  const { title, body } = await generateAiAnnouncement({ topic, notes, tone, ping: cleanPing });

  const draftId = saveDraft({
    type: 'ai',
    title,
    body,
    topic,
    notes,
    tone,
    ping: cleanPing,
    authorId: interaction.user.id,
    guildId: interaction.guild?.id,
  });

  const previewEmbed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`👁️ [PREVIEW] ${title}`)
    .setDescription(body)
    .addFields(
      { name: '🎯 Target Channel', value: '#announcements', inline: true },
      { name: '🔔 Mention Ping', value: cleanPing !== 'none' ? `\`${cleanPing}\`` : 'None', inline: true },
      { name: '🤖 Neural Generator', value: 'Rocket AI (GPT-6 Luna)', inline: true }
    )
    .setFooter({ text: 'Preview Mode • Only you can see this message' });

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_confirm_broadcast_${draftId}`)
      .setLabel('🚀 Broadcast to #announcements')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(`btn_regen_broadcast_${draftId}`)
      .setLabel('🔄 Regenerate AI')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId(`btn_cancel_broadcast_${draftId}`)
      .setLabel('🗑️ Discard Draft')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.editReply({
    content: '✨ **Announcement Draft Ready!** Review your private preview below before broadcasting to the server:',
    embeds: [previewEmbed],
    components: [actionRow],
  });
}

/**
 * Handle Custom Announcement Modal Submission
 */
export async function handleCustomAnnouncementSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const title = interaction.fields.getTextInputValue('input_custom_title');
  const body = interaction.fields.getTextInputValue('input_custom_body');
  const rawPing = interaction.fields.getTextInputValue('input_custom_ping') || 'none';
  const colorInput = interaction.fields.getTextInputValue('input_custom_color') || 'gold';

  let cleanPing = rawPing.trim().toLowerCase();
  if (cleanPing !== '@everyone' && cleanPing !== '@here') {
    cleanPing = 'none';
  }

  const colorHex = resolveColor(colorInput);

  const draftId = saveDraft({
    type: 'custom',
    title,
    body,
    ping: cleanPing,
    color: colorHex,
    colorName: colorInput,
    authorId: interaction.user.id,
    guildId: interaction.guild?.id,
  });

  const previewEmbed = new EmbedBuilder()
    .setColor(colorHex)
    .setTitle(`👁️ [PREVIEW] ${title}`)
    .setDescription(body)
    .addFields(
      { name: '🎯 Target Channel', value: '#announcements', inline: true },
      { name: '🔔 Mention Ping', value: cleanPing !== 'none' ? `\`${cleanPing}\`` : 'None', inline: true },
      { name: '🎨 Accent Color', value: colorInput, inline: true }
    )
    .setFooter({ text: 'Preview Mode • Only you can see this message' });

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_confirm_broadcast_${draftId}`)
      .setLabel('🚀 Broadcast to #announcements')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(`btn_cancel_broadcast_${draftId}`)
      .setLabel('🗑️ Discard Draft')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.editReply({
    content: '📝 **Custom Announcement Draft Ready!** Review your private preview below before broadcasting to the server:',
    embeds: [previewEmbed],
    components: [actionRow],
  });
}

/**
 * Execute final broadcast to #announcements
 */
export async function executeBroadcast({ guild, draft, client, authorUser }) {
  const annCh = guild.channels.cache.find((c) => c.name === 'announcements') ||
                guild.systemChannel ||
                guild.channels.cache.find((c) => c.isTextBased() && c.name.includes('announcement')) ||
                guild.channels.cache.find((c) => c.isTextBased());

  if (!annCh) {
    throw new Error('Channel #announcements could not be found in this server.');
  }

  const embed = new EmbedBuilder()
    .setColor(draft.color || 0xf1c40f)
    .setTitle(draft.title.startsWith('📢') || draft.title.startsWith('🚀') ? draft.title : `📢 ${draft.title}`)
    .setDescription(draft.body)
    .setAuthor({
      name: 'N3R0L4BS OFFICIAL ANNOUNCEMENT',
      iconURL: guild.iconURL() || client.user.displayAvatarURL(),
    })
    .setFooter({
      text: `Dispatched by Sandy • Rocket Broadcast Station 📡`,
      iconURL: client.user.displayAvatarURL(),
    })
    .setTimestamp();

  const pingStr = String(draft.ping || '').trim().toLowerCase();
  let content = null;
  if (pingStr === '@everyone' || pingStr === 'everyone') {
    content = '@everyone';
  } else if (pingStr === '@here' || pingStr === 'here') {
    content = '@here';
  }

  const payload = { embeds: [embed] };
  if (content) {
    payload.content = content;
  }

  const sentMessage = await annCh.send(payload);
  return { channel: annCh, message: sentMessage };
}

/**
 * Handle Announcement Button Clicks (Broadcast Confirm, Regenerate, Discard)
 */
export async function handleAnnouncementButton(interaction) {
  const { customId, guild, user, client } = interaction;

  // Dismiss Studio
  if (customId === 'btn_announce_dismiss') {
    return interaction.update({
      content: '👋 **Announcement Studio closed.** Click the announcement button anytime you need to dispatch an update!',
      embeds: [],
      components: [],
    });
  }

  // Open AI Modal
  if (customId === 'btn_announce_mode_ai') {
    return showAiAnnouncementModal(interaction);
  }

  // Open Custom Modal
  if (customId === 'btn_announce_mode_custom') {
    return showCustomAnnouncementModal(interaction);
  }

  // Discard Draft
  if (customId.startsWith('btn_cancel_broadcast_')) {
    const draftId = customId.replace('btn_cancel_broadcast_', '');
    pendingDrafts.delete(draftId);
    return interaction.update({
      content: '🗑️ **Announcement draft discarded.** No message was sent.',
      embeds: [],
      components: [],
    });
  }

  // Regenerate AI Draft
  if (customId.startsWith('btn_regen_broadcast_')) {
    const draftId = customId.replace('btn_regen_broadcast_', '');
    const draft = pendingDrafts.get(draftId);
    if (!draft) {
      return interaction.reply({ content: '⚠️ Draft expired or not found. Please create a new announcement.', ephemeral: true });
    }

    await interaction.deferUpdate();
    const { title, body } = await generateAiAnnouncement({
      topic: draft.topic || draft.title,
      notes: draft.notes || '',
      tone: draft.tone || '',
      ping: draft.ping,
    });

    draft.title = title;
    draft.body = body;
    pendingDrafts.set(draftId, draft);

    const updatedEmbed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`👁️ [PREVIEW] ${title}`)
      .setDescription(body)
      .addFields(
        { name: '🎯 Target Channel', value: '#announcements', inline: true },
        { name: '🔔 Mention Ping', value: draft.ping !== 'none' ? `\`${draft.ping}\`` : 'None', inline: true },
        { name: '🤖 Neural Generator', value: 'Rocket AI (Regenerated)', inline: true }
      )
      .setFooter({ text: 'Preview Mode • Only you can see this message' });

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_confirm_broadcast_${draftId}`)
        .setLabel('🚀 Broadcast to #announcements')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId(`btn_regen_broadcast_${draftId}`)
        .setLabel('🔄 Regenerate AI')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`btn_cancel_broadcast_${draftId}`)
        .setLabel('🗑️ Discard Draft')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({
      content: '🔄 **Draft Regenerated!** Review your new preview below:',
      embeds: [updatedEmbed],
      components: [actionRow],
    });
  }

  // Confirm and Broadcast to #announcements
  if (customId.startsWith('btn_confirm_broadcast_')) {
    const draftId = customId.replace('btn_confirm_broadcast_', '');
    const draft = pendingDrafts.get(draftId);

    if (!draft) {
      return interaction.reply({
        content: '⚠️ This announcement draft has expired. Please launch a new one from the studio.',
        ephemeral: true,
      });
    }

    // Security check: Only author or owner can broadcast
    if (draft.authorId !== user.id && !isDiscordOwner(user, guild)) {
      return interaction.reply({
        content: '⛔ Only the creator of this draft or Supreme Boss Sandy can authorize the broadcast.',
        ephemeral: true,
      });
    }

    await interaction.deferUpdate();

    try {
      const { channel, message } = await executeBroadcast({
        guild,
        draft,
        client,
        authorUser: user,
      });

      pendingDrafts.delete(draftId);

      return interaction.editReply({
        content:
          `✅ **BOOM! Announcement Dispatched!** 🚀🦝\n\n` +
          `Your announcement is live in <#${channel.id}>!\n` +
          `🔗 **Jump to message:** ${message.url}`,
        embeds: [],
        components: [],
      });
    } catch (broadcastErr) {
      console.error('[Broadcast Error]:', broadcastErr);
      return interaction.editReply({
        content: `❌ **Broadcast Failed:** ${broadcastErr.message}`,
        components: [],
      });
    }
  }
}

/**
 * Direct Broadcast for Chat Directives or Slash Commands
 */
export async function directBroadcastAnnouncement({
  guild,
  client,
  title,
  body,
  ping = 'none',
  color = 0xf1c40f,
  authorUser = null,
}) {
  return executeBroadcast({
    guild,
    client,
    authorUser,
    draft: {
      title,
      body,
      ping,
      color,
    },
  });
}

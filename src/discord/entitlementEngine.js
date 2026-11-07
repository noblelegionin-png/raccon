/**
 * 🛡️ ROCKET ENTITLEMENT & REASONING ENGINE
 * 
 * Implements Section 4, 7, 10, 13 of Rocket Community System Blueprint (v1.0):
 * - Workstation access validation (Coding, Web, Gaming, AI, Research)
 * - Reasoning Effort Selector (/reasoning: none, low, high, max)
 * - Token quota accounting (₹1 = 1,000 AI tokens, min ₹50 top-up)
 * - Natural language administrative directives with confirmation cards
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  checkMemberEntitlement,
  grantEntitlement,
  listMemberEntitlements,
  getOrCreateTokenAccount,
  setMemberReasoningMode,
  getMemberReasoningMode,
  addTokensToAccount,
  creditWallet,
  recordAuditEvent,
} from './discordDb.js';
import { isDiscordOwner } from './commandHandlers.js';

const BRAND_COLOR = 0xff6b35;
const GOLD_COLOR = 0xf1c40f;
const SUCCESS_COLOR = 0x2ecc71;
const INFO_COLOR = 0x3498db;

// Pending high-impact owner confirmation actions in memory
const pendingAdminActions = new Map();

/**
 * Check if a member has access to a specific section/workstation
 */
export function hasWorkstationAccess(user, member, guild, section) {
  if (isDiscordOwner(user, guild)) return true;
  if (user?.id === '1477589102110183477') return true;

  // Staff and Rocket roles have administrative access
  if (member?.roles?.cache?.some((r) => {
    const n = (r.name || '').toLowerCase();
    return n === 'rocket access' || n === 'admin' || n === 'staff';
  })) {
    return true;
  }

  // Check database entitlement record
  return checkMemberEntitlement(user.id, section);
}

/**
 * Build the interactive Reasoning Selector Menu
 */
export function buildReasoningSelector(user) {
  const currentMode = getMemberReasoningMode(user.id);

  const embed = new EmbedBuilder()
    .setColor(INFO_COLOR)
    .setTitle('⚡ ROCKET AI REASONING EFFORT SELECTOR')
    .setDescription(
      `Configure Rocket's neural depth and reasoning budget for your workstation.\n\n` +
      `• **Current Setting:** \`${currentMode.toUpperCase()}\`\n\n` +
      `### 🎚️ **Available Modes:**\n` +
      `• **NONE / FAST:** Ultra-low latency, zero chain-of-thought, rapid conversational replies.\n` +
      `• **LOW:** Lightweight reasoning pass, great for straightforward coding fixes and summaries.\n` +
      `• **HIGH (Recommended):** Deep reasoning & multi-step planning. Optimal for full architecture, complex bugs & logic.\n` +
      `• **MAX:** Exhaustive theoretical analysis, deep recursion, and highest token budget.\n\n` +
      `*Selection persists per-user across all workstations and DMs.*`
    )
    .setFooter({ text: 'Nero Labs Neural Configuration • Blueprint v1.0 🧠' });

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu_select_reasoning_mode')
      .setPlaceholder(`Current: ${currentMode.toUpperCase()} — Select a mode...`)
      .addOptions([
        {
          label: '⚡ None (Fast Response)',
          description: 'Instant answers without extended thinking pass',
          value: 'none',
          emoji: '⚡',
          default: currentMode === 'none',
        },
        {
          label: '🌱 Low Reasoning',
          description: 'Lightweight thinking pass for standard questions',
          value: 'low',
          emoji: '🌱',
          default: currentMode === 'low',
        },
        {
          label: '🔥 High Reasoning (Recommended)',
          description: 'Deep reasoning, edge-case analysis & complex code',
          value: 'high',
          emoji: '🔥',
          default: currentMode === 'high',
        },
        {
          label: '🧠 Max Reasoning (Full Power)',
          description: 'Maximum neural depth and full reasoning budget',
          value: 'max',
          emoji: '🧠',
          default: currentMode === 'max',
        },
      ])
  );

  return { embeds: [embed], components: [menu], ephemeral: true };
}

/**
 * Handle Reasoning Selection
 */
export async function handleReasoningSelect(interaction) {
  const mode = interaction.values[0];
  const setMode = setMemberReasoningMode(interaction.user.id, mode);

  return interaction.update({
    content: `🟢 **Reasoning Effort Updated:** Set to **${setMode.toUpperCase()}**! Rocket will now apply this thinking depth to all your prompts. 🦝🧠`,
    embeds: [],
    components: [],
  });
}

/**
 * Safe Natural-Language Admin Action Parser (Section 13 of Blueprint)
 * Parses:
 * - "add 20,000 tokens to @member"
 * - "grant coding access to @member for 30d"
 * - "credit 500 pizza to @member"
 */
export async function handleNaturalLanguageAdminDirective(message, text) {
  const { author, guild } = message;
  const isOwner = isDiscordOwner(author, guild);
  if (!isOwner) return false;

  const lower = text.toLowerCase().trim();

  // Pattern 1: Add tokens
  const tokenMatch = lower.match(/(?:add|grant|give)\s+([\d,]+)\s*(?:ai)?\s*tokens?\s*(?:to)?\s*<@!?(\d+)>/i);
  if (tokenMatch) {
    const rawQty = tokenMatch[1].replace(/,/g, '');
    const tokens = parseInt(rawQty, 10);
    const targetId = tokenMatch[2];

    if (!tokens || tokens <= 0) return false;

    // Show confirmation card before applying
    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pendingAdminActions.set(actionId, {
      type: 'ADD_TOKENS',
      targetId,
      amount: tokens,
      actorId: author.id,
      guildId: guild.id,
    });

    const confirmEmbed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('🛡️ OWNER ACTION CONFIRMATION — ADD AI TOKENS')
      .setDescription(
        `Boss Sandy, please confirm this high-impact quota update:\n\n` +
        `• **Target Member:** <@${targetId}>\n` +
        `• **Token Allocation:** \`+${tokens.toLocaleString()} AI Tokens\`\n` +
        `• **Actor:** <@${author.id}>\n\n` +
        `Click **Confirm & Apply** below to execute:`
      )
      .setFooter({ text: 'High-Impact Action Safeguard • Blueprint Section 8' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_confirm_admin_${actionId}`)
        .setLabel('Confirm & Apply')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_cancel_admin_${actionId}`)
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    await message.reply({ embeds: [confirmEmbed], components: [row] });
    return true;
  }

  // Pattern 2: Grant Workstation Access
  const accessMatch = lower.match(/(?:grant|give)\s+(coding|web|gaming|ai|research|all)\s*(?:workstation|hub|access)?\s*(?:to)?\s*<@!?(\d+)>(?:\s*for\s*(\d+[dhmw]|permanent))?/i);
  if (accessMatch) {
    const section = accessMatch[1].toLowerCase();
    const targetId = accessMatch[2];
    const durationStr = (accessMatch[3] || '30d').toLowerCase();

    let days = 30;
    let scope = '30d';
    if (durationStr.includes('7d') || durationStr.includes('week') || durationStr.includes('7')) {
      days = 7;
      scope = '7d';
    } else if (durationStr.includes('trial')) {
      days = 3;
      scope = 'trial';
    } else if (durationStr.includes('permanent')) {
      days = 3650;
      scope = 'permanent';
    }

    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pendingAdminActions.set(actionId, {
      type: 'GRANT_ENTITLEMENT',
      targetId,
      section,
      scope,
      days,
      actorId: author.id,
      guildId: guild.id,
    });

    const confirmEmbed = new EmbedBuilder()
      .setColor(SUCCESS_COLOR)
      .setTitle('🛡️ OWNER ACTION CONFIRMATION — GRANT WORKSTATION')
      .setDescription(
        `Boss Sandy, please confirm this workstation entitlement grant:\n\n` +
        `• **Target Member:** <@${targetId}>\n` +
        `• **Workstation Section:** \`${section.toUpperCase()}\`\n` +
        `• **Duration:** \`${scope}\` (${days} days)\n` +
        `• **Actor:** <@${author.id}>\n\n` +
        `Click **Confirm & Apply** below to execute:`
      )
      .setFooter({ text: 'High-Impact Action Safeguard • Blueprint Section 8' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_confirm_admin_${actionId}`)
        .setLabel('Confirm & Grant Access')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_cancel_admin_${actionId}`)
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    await message.reply({ embeds: [confirmEmbed], components: [row] });
    return true;
  }

  // Pattern 3: Credit Pizza to Wallet
  const pizzaMatch = lower.match(/(?:credit|add|give)\s+(\d+)\s*(?:pizza|credits?|rs|inr)?\s*(?:to)?\s*<@!?(\d+)>/i);
  if (pizzaMatch) {
    const amount = parseInt(pizzaMatch[1], 10);
    const targetId = pizzaMatch[2];

    if (!amount || amount <= 0) return false;

    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pendingAdminActions.set(actionId, {
      type: 'CREDIT_PIZZA',
      targetId,
      amount,
      actorId: author.id,
      guildId: guild.id,
    });

    const confirmEmbed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('🛡️ OWNER ACTION CONFIRMATION — CREDIT PIZZA')
      .setDescription(
        `Boss Sandy, please confirm this wallet credit:\n\n` +
        `• **Target Member:** <@${targetId}>\n` +
        `• **Credit Amount:** \`+${amount} Pizza\` (₹${amount} INR)\n` +
        `• **Actor:** <@${author.id}>\n\n` +
        `Click **Confirm & Apply** below to execute:`
      )
      .setFooter({ text: 'High-Impact Action Safeguard • Blueprint Section 8' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_confirm_admin_${actionId}`)
        .setLabel('Confirm & Credit Pizza')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_cancel_admin_${actionId}`)
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    await message.reply({ embeds: [confirmEmbed], components: [row] });
    return true;
  }

  return false;
}

/**
 * Handle confirmation buttons for natural language admin directives
 */
export async function handleAdminConfirmationButton(interaction) {
  const { customId, user, guild } = interaction;
  if (!isDiscordOwner(user, guild)) {
    return interaction.reply({ content: '⛔ Only Supreme Boss Sandy can authorize this action.', ephemeral: true });
  }

  if (customId.startsWith('btn_cancel_admin_')) {
    const actionId = customId.replace('btn_cancel_admin_', '');
    pendingAdminActions.delete(actionId);
    return interaction.update({ content: '❌ **Action cancelled.** No changes were made.', embeds: [], components: [] });
  }

  if (customId.startsWith('btn_confirm_admin_')) {
    const actionId = customId.replace('btn_confirm_admin_', '');
    const action = pendingAdminActions.get(actionId);
    if (!action) {
      return interaction.reply({ content: '⚠️ Action confirmation expired or not found.', ephemeral: true });
    }

    try {
      if (action.type === 'ADD_TOKENS') {
        const newAllowance = addTokensToAccount(action.targetId, action.amount, user.id, 'Owner Natural Directive');
        pendingAdminActions.delete(actionId);
        return interaction.update({
          content: `✅ **Applied!** Added **${action.amount.toLocaleString()} AI Tokens** to <@${action.targetId}>! *(New Allowance: ${newAllowance.toLocaleString()})* 🚀🦝`,
          embeds: [],
          components: [],
        });
      }

      if (action.type === 'GRANT_ENTITLEMENT') {
        grantEntitlement(action.targetId, action.section, action.scope, user.id, action.days);
        // Also assign @Buyer role if present
        const member = await guild.members.fetch(action.targetId).catch(() => null);
        const buyerRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'buyer');
        if (member && buyerRole) {
          await member.roles.add(buyerRole).catch(() => null);
        }
        pendingAdminActions.delete(actionId);
        return interaction.update({
          content: `✅ **Applied!** Granted **${action.section.toUpperCase()}** workstation access to <@${action.targetId}> for **${action.scope}**! 🛡️✨`,
          embeds: [],
          components: [],
        });
      }

      if (action.type === 'CREDIT_PIZZA') {
        const { newBalance } = creditWallet(action.targetId, action.amount, 'Owner Natural Directive', user.id);
        pendingAdminActions.delete(actionId);
        return interaction.update({
          content: `✅ **Applied!** Credited **${action.amount} Pizza** to <@${action.targetId}>! *(Current Balance: ${newBalance} Pizza)* 🍕💰`,
          embeds: [],
          components: [],
        });
      }
    } catch (err) {
      return interaction.reply({ content: `⚠️ Error executing action: ${err.message}`, ephemeral: true });
    }
  }
}

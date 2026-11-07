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
  getOrCreateWallet,
  getOrCreateTokenAccount,
  setMemberReasoningMode,
  getMemberReasoningMode,
  addTokensToAccount,
  creditWallet,
  recordAuditEvent,
} from './discordDb.js';
import { isDiscordOwner } from './commandHandlers.js';
import { injectServerCustomEmojis, getEmoji } from './emojiManager.js';

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
 * Robust quantity parser supporting shorthand notation (999M, 50k, 1b, 1.5m, etc.)
 */
export function parseQuantity(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().toLowerCase().replace(/,/g, '');
  const match = cleaned.match(/^([\d.]+)\s*([kmb]|thousand|million|billion)?$/i);
  if (!match) {
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : Math.floor(num);
  }
  const val = parseFloat(match[1]);
  if (isNaN(val)) return null;
  const unit = match[2] ? match[2].toLowerCase() : '';
  if (unit === 'k' || unit === 'thousand') return Math.floor(val * 1_000);
  if (unit === 'm' || unit === 'million') return Math.floor(val * 1_000_000);
  if (unit === 'b' || unit === 'billion') return Math.floor(val * 1_000_000_000);
  return Math.floor(val);
}

/**
 * Flexible Token Directive Parser
 */
export function parseTokenDirective(cleanLower) {
  // Pattern 1: Verb + [me] + Amount + Tokens + [Target]
  let m = cleanLower.match(/(?:ad+|give+|grant+|credit+|send+|deposit+|put+|set+|load+|top\s*up)\s+(?:me\s+)?([\d.,]+\s*[kmb]?(?:illion)?)\s*(?:ai\s*)?tokens?(?:\s*(?:to\s*)?(<@!?\d+>|me|myself))?/i);
  if (m) return { tokens: parseQuantity(m[1]), target: m[2] };

  // Pattern 2: Give/Add/Credit me Amount Tokens
  m = cleanLower.match(/(?:give\s+me|credit\s+me|add\s+me|send\s+me)\s+([\d.,]+\s*[kmb]?(?:illion)?)\s*(?:ai\s*)?tokens?/i);
  if (m) return { tokens: parseQuantity(m[1]), target: 'me' };

  // Pattern 3: Tokens + Amount
  m = cleanLower.match(/^tokens?\s+([\d.,]+\s*[kmb]?(?:illion)?)(?:\s*(?:to\s*)?(<@!?\d+>|me|myself))?/i);
  if (m) return { tokens: parseQuantity(m[1]), target: m[2] };

  // Pattern 4: Amount Tokens to me
  m = cleanLower.match(/^([\d.,]+\s*[kmb]?(?:illion)?)\s*(?:ai\s*)?tokens?(?:\s*(?:to\s*)?(<@!?\d+>|me|myself))?/i);
  if (m) return { tokens: parseQuantity(m[1]), target: m[2] };

  // Pattern 5: General scan if token is present
  if (cleanLower.includes('token')) {
    const qtyMatch = cleanLower.match(/([\d.,]+\s*[kmb]?(?:illion)?)/i);
    const hasVerb = /(?:ad+|giv|grant|credit|send|deposit|put|load|top|need|want)/i.test(cleanLower);
    if (qtyMatch && hasVerb) {
      const targetMatch = cleanLower.match(/<@!?(\d+)>/);
      return { tokens: parseQuantity(qtyMatch[1]), target: targetMatch ? targetMatch[0] : 'me' };
    }
  }

  return null;
}

/**
 * Flexible Pizza Directive Parser
 */
export function parsePizzaDirective(cleanLower) {
  // Pattern 1: Verb + [me] + Amount + Pizza + [Target]
  let m = cleanLower.match(/(?:credit+|ad+|give+|grant+|send+|deposit+|put+|set+|load+)\s+(?:me\s+)?([\d.,]+\s*[kmb]?(?:illion)?)\s*(?:pizza|pizzas|credits?|rs|inr)?(?:\s*(?:to\s*)?(<@!?\d+>|me|myself))?/i);
  if (m && (cleanLower.includes('pizza') || cleanLower.includes('credit') || cleanLower.includes('rs') || cleanLower.includes('inr'))) {
    return { amount: parseQuantity(m[1]), target: m[2] };
  }

  // Pattern 2: Give/Add/Credit me Amount Pizza
  m = cleanLower.match(/(?:give\s+me|credit\s+me|add\s+me|send\s+me)\s+([\d.,]+\s*[kmb]?(?:illion)?)\s*(?:pizza|pizzas|credits?|rs|inr)?/i);
  if (m) return { amount: parseQuantity(m[1]), target: 'me' };

  // Pattern 3: Pizza + Amount
  m = cleanLower.match(/^pizzas?\s+([\d.,]+\s*[kmb]?(?:illion)?)(?:\s*(?:to\s*)?(<@!?\d+>|me|myself))?/i);
  if (m) return { amount: parseQuantity(m[1]), target: m[2] };

  // Pattern 4: Amount Pizza to me
  m = cleanLower.match(/^([\d.,]+\s*[kmb]?(?:illion)?)\s*(?:pizza|pizzas)(?:\s*(?:to\s*)?(<@!?\d+>|me|myself))?/i);
  if (m) return { amount: parseQuantity(m[1]), target: m[2] };

  return null;
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
  const cleanLower = lower
    .replace(/^(?:hey\s+|yo\s+)?(?:rocket|rocky)[,\s:]*/i, '')
    .trim();

  // Pattern 0: Direct Wallet & Token Controller / Menu Directive
  if (
    /^(?:modify\s+wallets?|manage\s+wallets?|wallet\s+admin|token\s+admin|admin\s+wallet|wallet\s+control)$/i.test(cleanLower) ||
    /^(?:modify\s+my\s+wallet|open\s+wallet\s+controls?|add\s+tokens?|add\s+funds?|wallet)$/i.test(cleanLower)
  ) {
    const wallet = getOrCreateWallet(author.id);
    const tokenAcc = getOrCreateTokenAccount(author.id);

    const embed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('🎛️ BOSS SANDY’S DIRECT WALLET & TOKEN CONTROLLER 🦝⚡')
      .setDescription(
        `Supreme Creator & Boss Sandy, your financial & token controls are active:\n\n` +
        `• 🍕 **Pizza Wallet Balance:** \`${wallet.balance_pizza.toLocaleString()} Pizza\` (₹${wallet.balance_pizza.toLocaleString()} INR)\n` +
        `• 🪙 **AI Token Allowance:** \`${tokenAcc.allowance_tokens.toLocaleString()} Tokens\` (Used: \`${tokenAcc.used_tokens.toLocaleString()}\`)\n` +
        `• 🛡️ **Workstations:** All 100% Unlocked & Controlled by You.\n\n` +
        `Click any button below to instantly top-up or modify your balances in **1 click**:`
      )
      .setFooter({ text: 'Supreme Boss Direct Controls • Instant Execution 🍕' });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_owner_add_10k_tokens')
        .setLabel('+10,000 Tokens')
        .setEmoji('🪙')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_owner_add_50k_tokens')
        .setLabel('+50,000 Tokens')
        .setEmoji('⚡')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('btn_owner_add_100_pizza')
        .setLabel('+100 Pizza (₹100)')
        .setEmoji('🍕')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_owner_add_500_pizza')
        .setLabel('+500 Pizza (₹500)')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('btn_owner_unlock_workstations')
        .setLabel('Unlock Workstations')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Secondary)
    );

    await message.reply({ embeds: [embed], components: [row1] });
    return true;
  }

  // Pattern 0.5: Fast Balance & Quota Inquiry
  if (
    /^(?:tokens?|my\s+tokens?|token\s+balance|check\s+tokens?|how\s+many\s+tokens)$/i.test(cleanLower) ||
    /^(?:pizza|my\s+pizza|my\s+wallet|check\s+balance|balance)$/i.test(cleanLower)
  ) {
    const wallet = getOrCreateWallet(author.id);
    const tokenAcc = getOrCreateTokenAccount(author.id);
    const reply = injectServerCustomEmojis(
      `🦝⚡ Boss Sandy, here are your current balances:\n\n` +
      `• 🪙 **AI Token Allowance:** \`${tokenAcc.allowance_tokens.toLocaleString()} Tokens\` (Used: \`${tokenAcc.used_tokens.toLocaleString()}\`)\n` +
      `• 🍕 **Pizza Balance:** \`${wallet.balance_pizza.toLocaleString()} Pizza\` (₹${wallet.balance_pizza.toLocaleString()} INR)\n` +
      `• 🧠 **Reasoning Effort:** \`${tokenAcc.reasoning_mode.toUpperCase()}\`\n\n` +
      `*Need more? Just tell me "add 100k tokens" or "give me 500 pizza"!* 🍕🐾`
    );
    await message.reply(reply);
    return true;
  }

  // Pattern 1: Add tokens
  // Supports: "add 10000 tokens", "add 10000 tokens to me", "give me 50000 tokens", "addd 999m token to me", "add 20000 tokens to @member"
  const tokenMatch = parseTokenDirective(cleanLower);
  if (tokenMatch && tokenMatch.tokens && tokenMatch.tokens > 0) {
    const tokens = tokenMatch.tokens;
    const targetMention = tokenMatch.target;
    const mentionIdMatch = targetMention ? targetMention.match(/<@!?(\d+)>/) : null;
    const targetId = mentionIdMatch ? mentionIdMatch[1] : author.id;

    // If target is Boss Sandy himself -> EXECUTE IMMEDIATELY!
    if (targetId === author.id) {
      const newAllowance = addTokensToAccount(author.id, tokens, author.id, 'Owner Natural Directive');
      await message.reply(injectServerCustomEmojis(`✅ *salutes with paw* **Done Boss Sandy!** Added **${tokens.toLocaleString()} AI Tokens** directly to your account! *(Total Allowance: ${newAllowance.toLocaleString()} tokens)* :rocket_salute::nero_pizza:`));
      return true;
    }

    // Show confirmation card for other members
    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pendingAdminActions.set(actionId, {
      type: 'ADD_TOKENS',
      targetId,
      amount: tokens,
      actorId: author.id,
      guildId: guild ? guild.id : 'dm',
    });

    const confirmEmbed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('🛡️ OWNER ACTION CONFIRMATION — ADD AI TOKENS')
      .setDescription(
        `Boss Sandy, please confirm this token allocation:\n\n` +
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

  // Pattern 2: Credit Pizza to Wallet
  // Supports: "add 500 pizza", "add 500 pizza to me", "give me 500 pizza", "addd 1k pizza", "credit 1000 pizza to @member"
  const pizzaMatch = parsePizzaDirective(cleanLower);
  if (pizzaMatch && pizzaMatch.amount && pizzaMatch.amount > 0) {
    const amount = pizzaMatch.amount;
    const targetMention = pizzaMatch.target;
    const mentionIdMatch = targetMention ? targetMention.match(/<@!?(\d+)>/) : null;
    const targetId = mentionIdMatch ? mentionIdMatch[1] : author.id;

    // If target is Boss Sandy himself -> EXECUTE IMMEDIATELY!
    if (targetId === author.id) {
      const { newBalance } = creditWallet(author.id, amount, 'Owner Natural Directive', author.id);
      await message.reply(injectServerCustomEmojis(`✅ *tail wags excitedly* **Done Boss Sandy!** Credited **${amount.toLocaleString()} Pizza** directly to your wallet! *(Current Balance: ${newBalance.toLocaleString()} Pizza / ₹${newBalance.toLocaleString()} INR)* :nero_pizza::nero_coin:`));
      return true;
    }

    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pendingAdminActions.set(actionId, {
      type: 'CREDIT_PIZZA',
      targetId,
      amount,
      actorId: author.id,
      guildId: guild ? guild.id : 'dm',
    });

    const confirmEmbed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('🛡️ OWNER ACTION CONFIRMATION — CREDIT PIZZA')
      .setDescription(
        `Boss Sandy, please confirm this wallet credit:\n\n` +
        `• **Target Member:** <@${targetId}>\n` +
        `• **Credit Amount:** \`+${amount.toLocaleString()} Pizza\` (₹${amount.toLocaleString()} INR)\n` +
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

  // Pattern 3: Instant Buyer Role & Workstation Unlock for Boss Sandy
  // Supports: "make me buyer", "give me buyer", "grant buyer to me", "unlock workstations"
  if (/^(?:make\s+me\s+buyer|give\s+me\s+buyer|grant\s+buyer|grant\s+me\s+buyer|unlock\s+workstations|give\s+buyer\s+to\s+me)$/i.test(lower)) {
    const buyerRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'buyer');
    if (buyerRole) {
      const member = await guild.members.fetch(author.id).catch(() => null);
      if (member) await member.roles.add(buyerRole).catch(() => null);
    }
    grantEntitlement(author.id, 'all', 'permanent', author.id, 3650);
    await message.reply(injectServerCustomEmojis('👑 *bows respectfully* **Done Boss Sandy!** All VIP workstations are 100% unlocked with permanent `@Buyer` clearance for you! :buyer_crown::dev_terminal::rocket_boss:'));
    return true;
  }

  // Pattern 4: Grant Workstation Access to Member
  const accessMatch = lower.match(/(?:grant|give)\s+(coding|web|gaming|ai|research|all)\s*(?:workstation|hub|access)?\s*(?:to)?\s*(<@!?\d+>|me|myself)(?:\s*for\s*(\d+[dhmw]|permanent))?/i);
  if (accessMatch) {
    const section = accessMatch[1].toLowerCase();
    const targetMention = accessMatch[2];
    const mentionIdMatch = targetMention ? targetMention.match(/<@!?(\d+)>/) : null;
    const targetId = mentionIdMatch ? mentionIdMatch[1] : author.id;
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

    // If target is Sandy himself -> execute immediately!
    if (targetId === author.id) {
      grantEntitlement(author.id, section, scope, author.id, days);
      const buyerRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'buyer');
      if (buyerRole) {
        const member = await guild.members.fetch(author.id).catch(() => null);
        if (member) await member.roles.add(buyerRole).catch(() => null);
      }
      await message.reply(injectServerCustomEmojis(`✅ *tail wags* **Done Boss Sandy!** Unlocked **${section.toUpperCase()}** access for you! :dev_terminal::rocket_salute:`));
      return true;
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

  // Boss Sandy 1-Click Direct Wallet Buttons
  if (customId === 'btn_owner_add_10k_tokens') {
    const newAllowance = addTokensToAccount(user.id, 10000, user.id, 'Boss Sandy 1-Click');
    return interaction.reply({ content: `🪙 **+10,000 AI Tokens added directly to your account!** Total: \`${newAllowance.toLocaleString()}\` 🦝⚡`, ephemeral: true });
  }

  if (customId === 'btn_owner_add_50k_tokens') {
    const newAllowance = addTokensToAccount(user.id, 50000, user.id, 'Boss Sandy 1-Click');
    return interaction.reply({ content: `⚡ **+50,000 AI Tokens added directly to your account!** Total: \`${newAllowance.toLocaleString()}\` 🦝🚀`, ephemeral: true });
  }

  if (customId === 'btn_owner_add_100_pizza') {
    const { newBalance } = creditWallet(user.id, 100, 'Boss Sandy 1-Click', user.id);
    return interaction.reply({ content: `🍕 **+100 Pizza (₹100) credited directly to your wallet!** Total: \`${newBalance} Pizza\` 💰🐾`, ephemeral: true });
  }

  if (customId === 'btn_owner_add_500_pizza') {
    const { newBalance } = creditWallet(user.id, 500, 'Boss Sandy 1-Click', user.id);
    return interaction.reply({ content: `🍕 **+500 Pizza (₹500) credited directly to your wallet!** Total: \`${newBalance} Pizza\` 💰👑`, ephemeral: true });
  }

  if (customId === 'btn_owner_unlock_workstations') {
    grantEntitlement(user.id, 'all', 'permanent', user.id, 3650);
    const member = await guild.members.fetch(user.id).catch(() => null);
    const buyerRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'buyer');
    if (member && buyerRole) await member.roles.add(buyerRole).catch(() => null);
    return interaction.reply({ content: `👑 **All VIP workstations unlocked permanently with @Buyer clearance for you, Boss Sandy!** 🛠️🎮✨`, ephemeral: true });
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

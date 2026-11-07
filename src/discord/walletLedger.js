/**
 * 🍕 ROCKET WALLET & PIZZA ECONOMY LEDGER
 * 
 * Implements Section 6 & Section 8 of Rocket Community System Blueprint (v1.0):
 * - Virtual Pizza Currency: 1 Pizza = ₹1
 * - Double-entry ledger (credit, debit, transaction history)
 * - India Google Pay / UPI payment deposit flow with UTR verification
 * - 6-Month Refund Policy engine with automatic 10% processing deduction calculation
 * - Owner balance management controls with audit logging
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  getOrCreateWallet,
  creditWallet,
  debitWallet,
  getWalletTransactions,
  createPaymentRecord,
  verifyPayment,
  listMemberEntitlements,
  getOrCreateTokenAccount,
  recordAuditEvent,
} from './discordDb.js';
import { isDiscordOwner } from './commandHandlers.js';
import { config } from '../config.js';

const BRAND_COLOR = 0xff6b35;
const GOLD_COLOR = 0xf1c40f;
const SUCCESS_COLOR = 0x2ecc71;
const DANGER_COLOR = 0xe74c3c;
const INFO_COLOR = 0x3498db;

// UPI VPA details for India Google Pay / PhonePe / Paytm
const UPI_ID = '9317741936@upi';
const UPI_NAME = 'Nero Labs';

/**
 * Build the Interactive Wallet Dashboard Embed & Components
 */
export function buildWalletDashboard(user) {
  const wallet = getOrCreateWallet(user.id);
  const tokenAcc = getOrCreateTokenAccount(user.id);
  const entitlements = listMemberEntitlements(user.id);
  const transactions = getWalletTransactions(user.id, 5);

  const activeSections = entitlements.length > 0
    ? entitlements.map((e) => `• **${e.section.toUpperCase()}** (\`${e.scope}\` - exp: ${e.expires_at ? new Date(e.expires_at).toLocaleDateString() : 'Permanent'})`).join('\n')
    : '• *No active paid workstation entitlements.*';

  const txHistory = transactions.length > 0
    ? transactions.map((t) => {
        const sign = t.direction === 'credit' ? '➕' : '➖';
        return `\`${new Date(t.timestamp).toLocaleDateString()}\` ${sign} **${t.amount_pizza} Pizza** — *${t.reason}*`;
      }).join('\n')
    : '• *No transaction records yet.*';

  const embed = new EmbedBuilder()
    .setColor(GOLD_COLOR)
    .setTitle(`🍕 NERO LABS WALLET — ${user.username.toUpperCase()}`)
    .setDescription(
      `Welcome to your private virtual wallet. Pizza is Nero Labs' internal credit system used for workstation access, custom development, and AI token refills.\n\n` +
      `💰 **Current Balance:** \`${wallet.balance_pizza} Pizza\` *(1 Pizza = ₹1 INR)*\n` +
      `🤖 **AI Token Quota:** \`${tokenAcc.allowance_tokens.toLocaleString()} Tokens\` *(₹1 = 1,000 tokens)*\n` +
      `⚡ **Active Reasoning Mode:** \`${(tokenAcc.reasoning_mode || 'high').toUpperCase()}\`\n\n` +
      `### 🛡️ **Active Workstation Entitlements**\n${activeSections}\n\n` +
      `### 📜 **Recent Ledger History**\n${txHistory}`
    )
    .setFooter({ text: 'Nero Labs Pizza Ledger • Private Virtual Account 🛡️' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_wallet_refresh')
      .setLabel('Refresh Balance')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_wallet_deposit')
      .setLabel('Add Funds (UPI / GPay)')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('btn_wallet_ticket')
      .setLabel('Wallet Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_wallet_refund')
      .setLabel('Request Refund')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_wallet_talk_owner')
      .setLabel('Talk to Sandy')
      .setEmoji('👑')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_wallet_help')
      .setLabel('Wallet Rules & FAQ')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2], ephemeral: true };
}

/**
 * Handle Deposit Modal Launcher
 */
export async function showDepositModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_wallet_deposit')
    .setTitle('➕ Add Pizza Funds (India UPI / GPay)');

  const amountInput = new TextInputBuilder()
    .setCustomId('input_deposit_amount')
    .setLabel('Amount in INR (₹1 = 1 Pizza, Min ₹50)')
    .setPlaceholder('e.g. 300 (Recommended Starter Pack) or 50')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(6);

  const utrInput = new TextInputBuilder()
    .setCustomId('input_deposit_utr')
    .setLabel('12-Digit UTR / Transaction Reference ID')
    .setPlaceholder('Enter UTR from Google Pay / PhonePe / Paytm receipt')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(25);

  modal.addComponents(
    new ActionRowBuilder().addComponents(amountInput),
    new ActionRowBuilder().addComponents(utrInput)
  );

  return interaction.showModal(modal);
}

/**
 * Handle Deposit Modal Submit
 */
export async function handleDepositModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const { user, guild, fields } = interaction;

  const rawAmount = fields.getTextInputValue('input_deposit_amount').trim();
  const utr = fields.getTextInputValue('input_deposit_utr').trim();

  const amount = parseInt(rawAmount, 10);
  if (isNaN(amount) || amount < 50) {
    return interaction.editReply({
      content: '⚠️ **Invalid Amount:** The minimum deposit is **₹50** (gives 50 Pizza or 50,000 AI tokens).',
    });
  }

  // Create payment audit record
  const paymentId = createPaymentRecord({
    payerId: user.id,
    payerTag: user.tag || user.username,
    amountInr: amount,
    providerRef: 'UPI_MANUAL',
    utrNumber: utr,
  });

  // Notify Owner Sandy in audit or admin channel
  const adminChannel = guild.channels.cache.find((c) => c.name === 'rocket-dashboard') ||
                       guild.channels.cache.find((c) => c.name === 'audit-logs');

  if (adminChannel && adminChannel.isTextBased()) {
    const adminEmbed = new EmbedBuilder()
      .setColor(GOLD_COLOR)
      .setTitle('📥 INBOUND UPI DEPOSIT PENDING VERIFICATION')
      .setDescription(
        `A member has submitted an India UPI / Google Pay deposit reference:\n\n` +
        `• **Member:** <@${user.id}> (\`${user.username}\`)\n` +
        `• **Amount:** \`₹${amount} INR\` (\`${amount} Pizza\`)\n` +
        `• **12-Digit UTR:** \`${utr}\`\n` +
        `• **Payment Record ID:** \`#${paymentId}\`\n\n` +
        `👉 Verify receipt in Google Pay / Bank Statement and click below to approve or reject:`
      )
      .setFooter({ text: 'Rocket Payment Verification Queue 🛡️' });

    const adminRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_verify_payment_${paymentId}`)
        .setLabel('Approve & Credit Pizza')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_reject_payment_${paymentId}`)
        .setLabel('Reject UTR')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    await adminChannel.send({ embeds: [adminEmbed], components: [adminRow] }).catch(() => null);
  }

  return interaction.editReply({
    content:
      `✅ **Deposit Request Logged Successfully!** (Receipt **#${paymentId}**)\n\n` +
      `• **Amount:** \`₹${amount} INR\` (\`${amount} Pizza\`)\n` +
      `• **Submitted UTR:** \`${utr}\`\n\n` +
      `Rocket has routed your UTR reference to **Sandy** for verification. Your Pizza balance will be credited immediately once the transaction reflects! 🐾🍕`,
  });
}

/**
 * Handle Refund Modal Launcher
 */
export async function showRefundModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_wallet_refund')
    .setTitle('🔄 Request Refund (6-Month Policy)');

  const purchaseInput = new TextInputBuilder()
    .setCustomId('input_refund_tx')
    .setLabel('Purchase / Payment ID or Reason')
    .setPlaceholder('Enter transaction ID or original payment details')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const amountInput = new TextInputBuilder()
    .setCustomId('input_refund_amount')
    .setLabel('Eligible Purchase Amount in ₹ (INR)')
    .setPlaceholder('e.g. 10000')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const reasonInput = new TextInputBuilder()
    .setCustomId('input_refund_reason')
    .setLabel('Reason for refund request')
    .setPlaceholder('Explain why you are requesting a refund...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(800);

  modal.addComponents(
    new ActionRowBuilder().addComponents(purchaseInput),
    new ActionRowBuilder().addComponents(amountInput),
    new ActionRowBuilder().addComponents(reasonInput)
  );

  return interaction.showModal(modal);
}

/**
 * Handle Refund Modal Submit — Applies Blueprint Section 8 (10% Processing Deduction)
 */
export async function handleRefundModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const { user, guild, fields } = interaction;

  const txDetails = fields.getTextInputValue('input_refund_tx').trim();
  const rawAmount = fields.getTextInputValue('input_refund_amount').trim();
  const reason = fields.getTextInputValue('input_refund_reason').trim();

  const purchaseAmount = parseFloat(rawAmount);
  if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
    return interaction.editReply({ content: '⚠️ Please enter a valid numerical purchase amount.' });
  }

  // Blueprint Section 8 Rule: 10% processing deduction applies
  const deduction = Math.round(purchaseAmount * 0.10);
  const netRefund = purchaseAmount - deduction;

  // Log refund audit ticket
  recordAuditEvent(user.id, 'REFUND_REQUESTED', null, `Purchase: ₹${purchaseAmount}`, `Net Payout: ₹${netRefund} (10% fee: ₹${deduction})`, reason);

  // Notify Owner Sandy
  const adminChannel = guild.channels.cache.find((c) => c.name === 'rocket-dashboard') ||
                       guild.channels.cache.find((c) => c.name === 'audit-logs');

  if (adminChannel && adminChannel.isTextBased()) {
    const refundEmbed = new EmbedBuilder()
      .setColor(DANGER_COLOR)
      .setTitle('🔄 FORMAL REFUND REQUEST SUBMITTED')
      .setDescription(
        `A member has submitted a refund claim under the **6-Month Nero Labs Refund Policy**:\n\n` +
        `• **Member:** <@${user.id}> (\`${user.username}\`)\n` +
        `• **Original Purchase:** \`₹${purchaseAmount.toLocaleString()} INR\`\n` +
        `• **10% Processing Deduction:** \`₹${deduction.toLocaleString()} INR\`\n` +
        `• **Calculated Refund Payout:** \`₹${netRefund.toLocaleString()} INR\` (90%)\n` +
        `• **Reference / ID:** \`${txDetails}\`\n` +
        `• **Reason Provided:** ${reason}\n\n` +
        `*Review eligibility and verify before payout approval.*`
      )
      .setFooter({ text: 'Nero Labs Refund Engine • 6-Month Policy 🛡️' });

    await adminChannel.send({ embeds: [refundEmbed] }).catch(() => null);
  }

  return interaction.editReply({
    content:
      `📋 **Refund Request Lodged Successfully!**\n\n` +
      `Under the official **Nero Labs Refund Policy**:\n` +
      `• **Original Purchase Claim:** \`₹${purchaseAmount.toLocaleString()} INR\`\n` +
      `• **10% Processing Deduction:** \`₹${deduction.toLocaleString()} INR\`\n` +
      `• **Estimated Refund Payout:** \`₹${netRefund.toLocaleString()} INR\` (90%)\n\n` +
      `Your request has been forwarded to **Sandy**. You will be notified in private DMs upon review! 🐾🛡️`,
  });
}

/**
 * Handle All Wallet Buttons
 */
export async function handleWalletButton(interaction) {
  const { customId, user, guild } = interaction;

  if (customId === 'btn_wallet_refresh' || customId === 'btn_wallet_view_balance') {
    return interaction.update(buildWalletDashboard(user));
  }

  if (customId === 'btn_wallet_deposit') {
    return showDepositModal(interaction);
  }

  if (customId === 'btn_wallet_refund') {
    return showRefundModal(interaction);
  }

  if (customId === 'btn_wallet_help') {
    return interaction.reply({
      content:
        `🍕 **NERO LABS WALLET & PIZZA ECONOMY RULES:**\n\n` +
        `• **What is Pizza?** Pizza is our official internal virtual wallet credit. 1 Pizza = ₹1 INR.\n` +
        `• **AI Tokens:** ₹1 INR = 1,000 AI Tokens. Minimum top-up is ₹50 (50,000 tokens).\n` +
        `• **Payment Methods:** We accept India Google Pay & UPI. Enter your 12-digit UTR after paying for instant review.\n` +
        `• **Refund Policy:** Refund requests are accepted within **6 months** of purchase. A **10% processing deduction** applies (90% net refund).\n` +
        `• **Security:** Every coin and token movement is immutably logged in the database ledger.`,
      ephemeral: true,
    });
  }

  if (customId === 'btn_wallet_talk_owner') {
    return interaction.reply({
      content: '👑 **Direct Boss Contact:** Sandy handles high-level project inquiries directly. Click **Open Coding Ticket** or **Open Web Dev Ticket** in order desks, or message Sandy directly!',
      ephemeral: true,
    });
  }

  // Owner verification buttons for deposits
  if (customId.startsWith('btn_verify_payment_')) {
    if (!isDiscordOwner(user, guild)) {
      return interaction.reply({ content: '⛔ Only Sandy (Owner) can approve payments.', ephemeral: true });
    }
    const paymentId = parseInt(customId.replace('btn_verify_payment_', ''), 10);
    try {
      const verified = verifyPayment(paymentId, user.id);
      return interaction.update({
        content: `✅ **Payment #${paymentId} Verified!** Credited **${Math.floor(verified.amount_inr)} Pizza** to <@${verified.payer_id}>! 🍕🎉`,
        components: [],
      });
    } catch (err) {
      return interaction.reply({ content: `⚠️ Error verifying payment: ${err.message}`, ephemeral: true });
    }
  }

  if (customId.startsWith('btn_reject_payment_')) {
    if (!isDiscordOwner(user, guild)) {
      return interaction.reply({ content: '⛔ Only Sandy (Owner) can reject payments.', ephemeral: true });
    }
    const paymentId = parseInt(customId.replace('btn_reject_payment_', ''), 10);
    return interaction.update({
      content: `❌ **Payment #${paymentId} Rejected** by <@${user.id}>.`,
      components: [],
    });
  }
}

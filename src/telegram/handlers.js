import { InlineKeyboard, InputFile } from 'grammy';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { whatsAppService } from '../whatsapp/whatsappService.js';
import { sandyStatusService } from '../whatsapp/sandyStatusService.js';
import { getConfig, setConfig, isUpdateProcessed, markUpdateProcessed, logAudit, getUserNotes } from '../db/index.js';
import { isOwner } from '../auth/accessControl.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId, setActiveModelId, BASE_CATALOGUE, recordModelLatency } from '../models/catalogue.js';
import {
  buildChatContext,
  recordUserMessage,
  recordAssistantMessage,
  clearConversation,
} from '../conversation/manager.js';
import {
  canBotRespondInGroup,
  trackGroupActivity,
  toggleGroup,
  setGlobalGroupParticipation,
  getKnownGroups,
} from '../groups/groupService.js';
import {
  checkBotAdminRights,
  getGroupModerationRules,
  updateGroupModerationRules,
  addWarning,
  resetWarnings,
  inspectMessageForModeration,
} from '../groups/moderation.js';
import { validateAndSanitizeResponse } from '../conversation/responseValidator.js';
import { googleDriveAdapter } from '../storage/driveAdapter.js';
import { messageArchiver } from '../memory/archiver.js';
import { memoryRetriever } from '../memory/retriever.js';
import { visionService } from '../vision/visionService.js';
import { evaluateInvocationPolicy } from '../groups/invocationPolicy.js';
import {
  registerGroupParticipant,
  getGroupParticipants,
  setUserCustomName,
  setUserRelationshipRole,
  getActiveUserIdentity,
  getUserProfile,
  setUserProfile,
} from '../db/index.js';
import {
  ROLEPLAY_ROLES,
  normalizeRole,
  getRoleDefinition,
  buildRoleSelectionKeyboard,
} from '../conversation/roleplayManager.js';
import { getMcpStatus } from '../mcp/mcpServer.js';
import { securitySupervisor } from '../security/securitySupervisor.js';
import { assistantManager } from '../assistant/assistantManager.js';
import { getAgentRouting, updateAgentRouting, SUPPORTED_REASONING_LEVELS } from '../models/modelRouter.js';
import { multiAgentCoordinator, AGENT_ROLES } from '../agents/multiAgentCoordinator.js';
import { registerAdvancedFeatures } from './advancedFeatures.js';
import { tryExecuteOwnerIntent } from './ownerIntentDispatcher.js';
import {
  isMaintenanceModeActive,
  enableMaintenanceMode,
  disableMaintenanceMode,
  getMaintenanceReport,
  MAINTENANCE_ANNOUNCEMENT_TEXT,
} from '../maintenance/maintenanceService.js';
import {
  detectUserIntent,
  extractExplicitWordLimit,
} from '../conversation/intentDetector.js';
import { webSearchService } from '../search/webSearchService.js';
import { deepBrowserService } from '../browser/deepBrowserService.js';
import { imageSearchService } from '../media/imageSearchService.js';
import { videoSearchService } from '../media/videoSearchService.js';
import { productSearchService } from '../shopping/productSearchService.js';
import { websiteSafetyService } from '../security/websiteSafetyService.js';
import { documentService } from '../documents/documentService.js';
import { pdfService } from '../pdf/pdfService.js';
import { mediaDownloaderService } from '../media/mediaDownloaderService.js';
import { socialInspectorService } from '../media/socialInspectorService.js';
import { ROCKET_TOOL_DEFINITIONS, executeRocketTool } from '../tools/rocketTools.js';

// Pending download sessions for Telegram users ("Ask link and done" flow)
const pendingDownloadSessionsTelegram = new Map();

export function renderGroupControlMessage(chatId, chatTitle = 'This Group') {
  const masterSwitch = getConfig('master_switch', 'true') === 'true';
  const textMode = getConfig(`text_mode_${chatId}`, 'off');
  const isChatActive = (textMode === 'on' || textMode === 'true') && masterSwitch;

  let msg = `⚡ *ROCKET AI — GROUP CHAT CONTROL*\n\n`;
  msg += `• *Group*: *${chatTitle || 'This Community'}*\n`;
  msg += `• *Chat Mode*: ${isChatActive ? '🟢 *START CHAT (ACTIVE)*' : '⚪ *STOP CHAT (QUIET)*'}\n`;
  msg += `• *Status*: ${isChatActive ? 'Rocket reads and replies to all messages in this group.' : 'Rocket only speaks when called by name ("Rocket..."), @mentioned, or replied to.'}\n`;
  msg += `• *Always Active*: Call *"Rocket"* anywhere in your message to get an answer!\n\n`;
  msg += `*Group Controls:*\n`;
  msg += `👉 Tap *[ 🟢 Start Chat ]* to make Rocket talk and participate in all group banter.\n`;
  msg += `👉 Tap *[ 🔴 Stop Chat ]* to put Rocket in quiet mode (answers only when asked).\n`;
  msg += `👉 Tap *[ 📌 Pin in Group ]* to pin these buttons to the top of the chat!`;
  return msg;
}

export function buildGroupControlKeyboard(chatId) {
  const textMode = getConfig(`text_mode_${chatId}`, 'off');
  const isChatActive = textMode === 'on' || textMode === 'true';

  return new InlineKeyboard()
    .text(isChatActive ? '🟢 Start Chat (Active)' : '🟢 Start Chat', `chat_start_${chatId}`)
    .text(isChatActive ? '🔴 Stop Chat' : '🔴 Stop Chat (Active)', `chat_stop_${chatId}`)
    .row()
    .text('📌 Pin in Group', `chat_pin_${chatId}`)
    .text('🔄 Refresh Status', `chat_refresh_${chatId}`);
}

export async function safeReply(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, extra);
  } catch (err) {
    if (extra?.parse_mode && (err.description?.includes("can't parse entities") || err.message?.includes('entity') || err.error_code === 400)) {
      const fallback = { ...extra };
      delete fallback.parse_mode;
      return await ctx.reply(text, fallback);
    }
    throw err;
  }
}

export function registerBotHandlers(bot) {
  // Register 50+ Advanced Ultra-Intelligence features (Moderation, AI tools, Dev tools, Memory, Minecraft)
  registerAdvancedFeatures(bot);

  // Logging, Deduplication & Group activity tracking middleware
  bot.use(async (ctx, next) => {
    const fromUser = ctx.from ? `${ctx.from.first_name || ''} (@${ctx.from.username || ctx.from.id})` : 'unknown';
    const chatInfo = ctx.chat ? `${ctx.chat.type}:${ctx.chat.id}` : 'unknown';
    const textPreview = ctx.message?.text ? `text: "${ctx.message.text.slice(0, 50)}"` : (ctx.updateType || 'update');
    console.log(`[Telegram Inbound] Update ${ctx.update?.update_id} from ${fromUser} in ${chatInfo} (${textPreview})`);

    if (ctx.update?.update_id) {
      if (isUpdateProcessed(ctx.update.update_id)) {
        console.log(`[Telegram Deduplication] Skipping already processed update ${ctx.update.update_id}`);
        return; // Ignore duplicate update
      }
      markUpdateProcessed(ctx.update.update_id);
    }

    // Track group registration
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      trackGroupActivity(ctx.chat);
    }

    // Continuous Archival Monitoring (Requirements 3 & 4)
    if (ctx.message) {
      messageArchiver.recordIncomingMessage(ctx).catch((err) => {
        console.warn('[Archiver] Message record error:', err.message);
      });
    }

    // Ensure user profile & identity is permanently stored in SQLite
    if (ctx.from?.id) {
      const uId = ctx.from.id;
      const ownerCheck = isOwner(uId);
      const existing = getUserProfile(uId);
      if (!existing) {
        if (ownerCheck) {
          setUserProfile(uId, { customName: 'Sandy', relationshipRole: 'creator', customTitle: 'Creator & Developer' });
        } else {
          const dName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username || 'Friend';
          setUserProfile(uId, { customName: dName, relationshipRole: 'friend' });
        }
      }
    }

    await next();
  });

  // /start command
  bot.command('start', async (ctx) => {
    const isPrivate = ctx.chat.type === 'private';
    const userId = ctx.from?.id;
    const userIsOwner = isOwner(userId);
    const activeModel = getActiveModelId() || 'gpt-6-luna';
    const masterSwitch = getConfig('master_switch', 'true') === 'true';

    // If started inside a group, register and send interactive Start/Stop Chat controls
    if (!isPrivate) {
      trackGroupActivity(ctx.chat);
      const groupMsg = renderGroupControlMessage(ctx.chat.id, ctx.chat.title);
      const keyboard = buildGroupControlKeyboard(ctx.chat.id);
      return ctx.reply(groupMsg, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }

    const publicUrl = (config.webAppPublicUrl || 'https://raccon-v3q5.onrender.com').replace(/\/+$/, '');

    if (userIsOwner) {
      const bossGreeting =
        `⚡ *ROCKET AI — TELEGRAM MASTER CONSOLE*\n\n` +
        `Yo Boss Sandy! Rocket is online, fully refreshed, and live on Telegram! 🦝⚡\n\n` +
        `*Live Status & Engine:*\n` +
        `• 👑 *Owner:* Sandy (\`${userId}\`)\n` +
        `• ⚡ *Model:* \`${activeModel}\` (ScaleMax Luna Gateway)\n` +
        `• 🛠️ *All 22 Tools Active:* Live Web Search, Highest-Quality MP3/MP4 Downloader, Social Inspector, Memory, Tasks, Sandbox Eval\n` +
        `• 🔒 *Platform Isolation:* Telegram and WhatsApp work 100% independently (zero cross-notifications)\n\n` +
        `*Direct Actions:* Talk to me in Roman Hinglish or English, or send any Reel/Short/Music link to download! 🚀`;

      const ownerKeyboard = new InlineKeyboard()
        .webApp('👑 Owner Deck', `${publicUrl}/owner.html`)
        .webApp('⚡ User App', `${publicUrl}/`)
        .row()
        .text('📊 Status', 'cmd_status')
        .text('🛠️ Tools', 'cmd_tools');

      try {
        await ctx.api.setChatMenuButton({
          chat_id: ctx.chat.id,
          menu_button: {
            type: 'web_app',
            text: '👑 Owner Deck',
            web_app: { url: `${publicUrl}/owner.html` },
          },
        });
      } catch {}

      return await ctx.reply(bossGreeting, {
        parse_mode: 'Markdown',
        reply_markup: ownerKeyboard,
      });
    }

    // Normal User Greeting & User Panel
    const userGreeting =
      `👋 *Hello ${ctx.from?.first_name || 'Friend'}!*\n\n` +
      `I am *Rocket*, your high-intelligence AI assistant powered by Nero Labs 🦝⚡\n\n` +
      `*What I Can Do For You:*\n` +
      `• 📥 *Media Downloader:* Send any YouTube, Instagram, Facebook, or Vero link to download highest-quality MP3 audio or MP4 video\n` +
      `• 🔍 *Real-Time Search:* Ask any technical, educational, or gaming question\n` +
      `• 🖼️ *Visual Search:* Find verified web images and diagrams\n` +
      `• 📄 *PDF Engine:* Summarize or generate multi-page PDF documents\n` +
      `• 💡 *Math & Coding:* Fast algorithmic problem solving and coding help\n\n` +
      `_Feel free to chat with me directly right here, or tap below to open the Mini App!_ ✨`;

    const userKeyboard = new InlineKeyboard()
      .webApp('🚀 Open Mini App', `${publicUrl}/`)
      .row()
      .text('📋 Help & Commands', 'cmd_help')
      .text('ℹ️ Privacy & Guide', 'cmd_privacy');

    try {
      await ctx.api.setChatMenuButton({
        chat_id: ctx.chat.id,
        menu_button: {
          type: 'web_app',
          text: '⚡ Rocket App',
          web_app: { url: `${publicUrl}/` },
        },
      });
    } catch {}

    return await ctx.reply(userGreeting, {
      parse_mode: 'Markdown',
      reply_markup: userKeyboard,
    });
  });

  // /panel command (Universal User & Owner Control Panel)
  bot.command(['panel', 'userpanel'], async (ctx) => {
    const isOwnerUser = isOwner(ctx.from?.id);
    const publicUrl = (config.webAppPublicUrl || 'https://raccon-v3q5.onrender.com').replace(/\/+$/, '');

    const kb = new InlineKeyboard();
    if (isOwnerUser) {
      kb.webApp('👑 Owner Deck', `${publicUrl}/owner.html`).row();
    }
    kb.webApp('⚡ Rocket AI Mini App', `${publicUrl}/`).row()
      .text('📥 Downloader Info', 'help_downloader')
      .text('🛠️ Available Tools', 'cmd_tools');

    const panelMsg = `🎛️ *ROCKET AI — CONTROL PANEL*\n\n` +
      `• *User:* ${ctx.from?.first_name || 'User'} (${isOwnerUser ? '👑 Owner' : '👤 User'})\n` +
      `• *Active Model:* \`gpt-6-luna\`\n` +
      `• *Tools Available:* 22 Multi-Modal Tools Active\n` +
      `• *Downloader:* Active (YouTube, Instagram, Facebook, Vero)\n\n` +
      `Select a menu option below to explore features:`;

    await ctx.reply(panelMsg, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  });

  // /help command
  bot.command('help', async (ctx) => {
    const isPrivate = ctx.chat.type === 'private';
    const userIsOwner = isOwner(ctx.from?.id);

    let text = `⚡ *ROCKET AI BOT COMMANDS*\n\n`;
    text += `*General Diagnostics & Controls:*\n`;
    text += `• /app — Open 24/7 Mobile Mini App Dashboard\n`;
    text += `• /chat — Open group [Start Chat] and [Stop Chat] buttons\n`;
    text += `• /text on | off — Toggle auto reading & replying to all texts\n`;
    text += `• /status — Check bot health, provider connection, and latency\n`;
    text += `• /ping — High-precision telemetry round-trip\n`;
    text += `• /privacy — BotFather privacy mode & permission guide\n`;
    text += `• /clear — Clear chat memory for this conversation\n\n`;

    text += `*🎭 Roleplay & Custom Identity (For Everyone):*\n`;
    text += `• /role — Interactive menu to pick your relationship with Rocket (10+ roles!)\n`;
    text += `• /setrole <role> — e.g. /setrole brother, /setrole mother, /setrole friend\n`;
    text += `• /setrolebrother, /setrolesister, /setrolemother, /setrolebestie, etc.\n`;
    text += `• /setname <name> — Customize the name/nickname Rocket calls you\n`;
    text += `• /myrole — View your active role, calling name, and roleplay dynamic\n`;
    text += `• /resetrole / /resetname — Reset role or custom name to default\n`;
    text += `• /tusage [on|off|status] — Toggle real-time token metrics (output tokens from key, latency)\n\n`;

    if (userIsOwner) {
      text += `*Owner Control Commands:*\n`;
      text += `• /text on | off — Toggle auto reading & replying to all texts\n`;
      text += `• /master on | off — Master AI kill switch\n`;
      text += `• /reasoning <none|low|med|high|xhigh|max> — Reasoning effort\n`;
      text += `• /limit [global|dev] <min> <max> — Dual-tier response word count limits\n`;
      text += `• /tusage global [on|off] — Global token usage mode switch\n`;
      text += `• /model — View active model & catalogue\n`;
      text += `• /setmodel <model_id> — Switch active AI model\n`;
      text += `• /image <prompt> — Generate high-definition AI image\n`;
      text += `• /avatar — Show official Nero Labs persona\n`;
      text += `• /drive — Google Drive 5 TB storage status & permissions\n`;
      text += `• /drive_mkdir <folder> — Create a new folder\n`;
      text += `• /drive_ls — List storage files and folders\n`;
      text += `• /drive_upload <file> <text> — Upload or create a file\n`;
      text += `• /drive_edit <file> <text> — Edit an existing file\n`;
      text += `• /drive_del <file_or_id> — Delete file or folder\n`;
      text += `• /drive_backup — Trigger database backup\n`;
      text += `• /archive_now — Trigger immediate conversation batch archive\n`;
      text += `• /archivestatus — View pending message count & Drive batches\n`;
      text += `• /setlabel <id> <label> — Configure participant display/gender label\n`;
      text += `• /savedrive — Save replied image to Google Drive memory\n`;
      text += `• /getimage <query> — Retrieve and send saved Drive picture\n`;
      text += `• /memory <query> — Search persistent historical memory\n`;
      text += `• /group on | off — Enable/disable bot in current group\n`;
      text += `• /globalgroup on | off — Global group participation switch\n`;
      text += `• /modstatus — Check group admin & moderation rules\n`;
      text += `• /mod on | off — Toggle group automated moderation\n`;
      text += `• /warn @user <reason> — Issue a manual warning\n`;
    }

    // Only attach web app button in private chat
    let replyMarkup = undefined;
    if (isPrivate && config.webAppPublicUrl) {
      replyMarkup = new InlineKeyboard().webApp('🚀 Open Settings Mini App', config.webAppPublicUrl);
    }

    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
  });

  // /privacy command: Explains BotFather Privacy Mode
  bot.command('privacy', async (ctx) => {
    let msg = `🔒 *TELEGRAM BOTFATHER PRIVACY MODE*\n\n`;
    msg += `Telegram enforces privacy mode on all bots by default:\n\n`;
    msg += `1. *Privacy Mode ENABLED (Default)*:\n`;
    msg += `   • The bot only receives messages that explicitly @mention its username (\`@${ctx.me.username}\`), direct replies to its messages, or commands starting with \`/\`.\n`;
    msg += `   • The bot cannot see ordinary banter between other group members.\n\n`;
    msg += `2. *Privacy Mode DISABLED (Full Group Moderation)*:\n`;
    msg += `   • Open @BotFather on Telegram.\n`;
    msg += `   • Send \`/setprivacy\` ➔ Select \`@${ctx.me.username}\` ➔ Choose *Disable*.\n`;
    msg += `   • After disabling privacy mode, remove and re-add the bot to the group to allow inspection of all group messages.\n\n`;
    msg += `3. *Admin Rights Recommendation*:\n`;
    msg += `   • Grant the bot *Delete Messages* and *Restrict Members* permissions if you wish to use moderation filters.`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /status command
  bot.command('status', async (ctx) => {
    const masterSwitch = getConfig('master_switch', 'true') === 'true';
    const globalGroup = getConfig('group_participation_enabled', 'false') === 'true';
    const modEnabled = getConfig('group_moderation_enabled', 'false') === 'true';
    const activeModel = getActiveModelId();
    const groups = getKnownGroups();

    await ctx.replyWithChatAction('typing');

    // Run real latency check against ScaleMax
    const health = await scaleMaxAdapter.checkHealth(activeModel);
    if (health.ok) {
      recordModelLatency(activeModel, health.latencyMs);
    }

    let text = `📊 *ROCKET AI SYSTEM DIAGNOSTICS*\n\n`;
    text += `*Core Switches:*\n`;
    text += `• Master AI Switch: ${masterSwitch ? '🟢 ACTIVE' : '🔴 HALTED'}\n`;
    text += `• Group Participation: ${globalGroup ? '🟢 ENABLED' : '⚪ DISABLED (Silent)'}\n`;
    text += `• Group Moderation Engine: ${modEnabled ? '🟢 ENABLED' : '⚪ DISABLED'}\n`;
    text += `• Known Groups Registered: ${groups.length}\n\n`;

    text += `*AI Provider (ScaleMax):*\n`;
    text += `• Active Model: \`${activeModel}\`\n`;
    text += `• Provider Gateway: \`${config.scaleMaxBaseUrl}\`\n`;
    text += `• Status: ${health.ok ? '🟢 OPERATIONAL' : '🔴 ' + (health.status || 'ERROR').toUpperCase()}\n`;

    if (health.ok) {
      const isFast = health.latencyMs < 1000;
      text += `• Round-Trip Latency: ${isFast ? '🟢 ' : '🔴 '}${health.latencyMs} ms\n`;
    } else {
      text += `• Diagnostic Detail: ${health.error || 'Connection failed'}\n`;
    }

    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // /ping command
  bot.command('ping', async (ctx) => {
    const activeModel = getActiveModelId();
    const t0 = performance.now();

    // Run Telegram send and ScaleMax health probe concurrently
    const [pingMsg, health] = await Promise.all([
      ctx.reply('⚡ *Measuring telemetry...*', {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      }),
      scaleMaxAdapter.checkHealth(activeModel),
    ]);
    const telegramDeliveryLatency = Math.round(performance.now() - t0);

    if (health.ok) {
      recordModelLatency(activeModel, health.latencyMs);
    }

    let text = `⚡ *ROCKET AI — LATENCY TELEMETRY*\n\n`;
    text += `• *Selected Model*: \`${activeModel}\`\n`;
    if (health.ok) {
      const isFast = health.latencyMs < 1000;
      text += `• *ScaleMax Gateway Latency*: ${isFast ? '🟢' : '🔴'} ${health.latencyMs} ms\n`;
    } else {
      text += `• *ScaleMax Gateway Latency*: 🔴 Unavailable (${health.error || 'Connection failed'})\n`;
    }
    const isTgFast = telegramDeliveryLatency < 800;
    text += `• *Telegram Bot API Latency*: ${isTgFast ? '🟢' : '🟡'} ${telegramDeliveryLatency} ms\n\n`;
    text += `_Active high-speed socket keep-alive with zero fake latency._`;

    await ctx.api.editMessageText(ctx.chat.id, pingMsg.message_id, text, {
      parse_mode: 'Markdown',
    });
  });

  // /reasoning <none|low|medium|high|xhigh|max> (Owner only) - Saves forever across both config and agent router
  bot.command('reasoning', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can change reasoning effort.');
    }

    const raw = ctx.match?.trim().toLowerCase();
    const validModes = ['none', 'low', 'medium', 'med', 'high', 'xhigh', 'max'];

    if (raw && validModes.includes(raw)) {
      const arg = raw === 'med' ? 'medium' : raw;
      setConfig('reasoning_effort', arg);
      try {
        updateAgentRouting('chat', { reasoning: arg });
      } catch {}
      logAudit(ctx.from.id, 'REASONING_EFFORT_CHANGED', `Changed reasoning effort to ${arg}`);
      return ctx.reply(
        `🧠 *Reasoning Effort Saved Permanently!*\n\nReasoning level is now set to: *${arg.toUpperCase()}*\nSaved forever in the SQLite database across Luna-Chat and runtime configuration.`,
        { parse_mode: 'Markdown' }
      );
    }

    const current = getConfig('reasoning_effort', 'low');
    let msg = `🧠 *REASONING EFFORT CONFIGURATION*\n\n`;
    msg += `Current Setting: *${current.toUpperCase()}*\n`;
    msg += `Supported Choices: \`none\`, \`low\`, \`medium\`, \`high\`, \`xhigh\`, \`max\`\n\n`;
    msg += `Usage: \`/reasoning <mode>\` (e.g. \`/reasoning low\`) or simply text *"set reasoning to low"* to save it forever.`;
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /tusage [on|off|status|global on|global off] - Real-time token output metrics for model testing
  bot.command('tusage', async (ctx) => {
    const raw = (ctx.match || '').trim().toLowerCase();
    const chatId = String(ctx.chat.id);
    const userIsOwner = isOwner(ctx.from?.id);

    if (raw === 'global on' || raw === 'global off') {
      if (!userIsOwner) {
        return ctx.reply('⛔ Only the verified bot owner can toggle global token usage display.');
      }
      const enableGlobal = raw === 'global on';
      setConfig('tusage_global', enableGlobal ? 'true' : 'false');
      logAudit(ctx.from.id, 'TUSAGE_GLOBAL_TOGGLE', `Owner set global tusage to ${enableGlobal}`);
      return ctx.reply(
        `📊 *Global Token Usage Mode:* ${enableGlobal ? '🟢 ENABLED' : '⚪ DISABLED'}\n\n${enableGlobal ? 'Rocket will append token usage stats (output tokens from key, input, total, latency) to all model replies across all chats.' : 'Global token usage display disabled.'}`,
        { parse_mode: 'Markdown' }
      );
    }

    if (raw === 'on' || raw === 'enable') {
      setConfig(`tusage_chat_${chatId}`, 'true');
      return ctx.reply(
        `📊 *Token Usage Mode: 🟢 ENABLED*\n\nRocket will now report output tokens used from your key, input tokens, total tokens, model, and latency on every reply in this chat for model testing.`,
        { parse_mode: 'Markdown' }
      );
    }

    if (raw === 'off' || raw === 'disable') {
      setConfig(`tusage_chat_${chatId}`, 'false');
      return ctx.reply(
        `📊 *Token Usage Mode: ⚪ DISABLED*\n\nToken metrics will no longer be appended in this chat.`,
        { parse_mode: 'Markdown' }
      );
    }

    if (raw === 'status') {
      const chatEnabled = getConfig(`tusage_chat_${chatId}`, 'false') === 'true';
      const globEnabled = getConfig('tusage_global', 'false') === 'true';
      return ctx.reply(
        `📊 *TOKEN USAGE MODE STATUS*\n\n• Current Chat: ${chatEnabled ? '🟢 ON' : '⚪ OFF'}\n• Global Mode: ${globEnabled ? '🟢 ON' : '⚪ OFF'}\n\n*Commands:*\n• \`/tusage on\` - Enable in this chat\n• \`/tusage off\` - Disable in this chat\n• \`/tusage\` - Toggle in this chat${userIsOwner ? '\n• `/tusage global on|off` - Toggle for all chats' : ''}`,
        { parse_mode: 'Markdown' }
      );
    }

    // Default toggle for current chat
    const current = getConfig(`tusage_chat_${chatId}`, 'false') === 'true';
    const nextState = !current;
    setConfig(`tusage_chat_${chatId}`, nextState ? 'true' : 'false');
    return ctx.reply(
      `📊 *Token Usage Mode: ${nextState ? '🟢 ENABLED' : '⚪ DISABLED'}*\n\n${nextState ? 'Rocket will now append output tokens used from your key and execution latency to each reply.' : 'Token telemetry footer hidden.'}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /edit_mode [on|off|status] - Owner-Only Management Entry Point & Maintenance Coordinator
  bot.command('edit_mode', async (ctx) => {
    const userId = ctx.from?.id;
    if (!isOwner(userId)) {
      return ctx.reply('⛔ Restricted: /edit_mode is strictly reserved for the authenticated bot owner (Sandy).');
    }

    const arg = (ctx.match || '').trim().toLowerCase();

    if (arg === 'off' || arg === 'exit' || arg === 'resume') {
      const res = disableMaintenanceMode();
      logAudit(userId, 'EDIT_MODE_DEACTIVATED', 'Maintenance disabled via /edit_mode off');
      return ctx.reply(
        '🟢 *Edit Mode Deactivated & Service Resumed!*\n\n• System State: 🟢 Operational\n• Normal conversations and community replies are restored.\n• Logged to persistent audit trail.',
        { parse_mode: 'Markdown' }
      );
    }

    if (arg === 'status') {
      const report = getMaintenanceReport();
      let text = `🛠️ *EDIT MODE & MAINTENANCE STATUS*\n\n`;
      text += `• *Status*: ${report.active ? '🔴 ACTIVE (Replies Paused)' : '🟢 INACTIVE (Operational)'}\n`;
      text += `• *Started At*: \`${report.startedAt || 'N/A'}\`\n`;
      text += `• *Active Management Model*: \`gpt-6-luna\`\n`;
      text += `• *Broadcast Delivery Summary*:\n`;
      text += `  - Sent: ${report.summary.sent}\n`;
      text += `  - Failed: ${report.summary.failed}\n`;
      text += `  - Skipped: ${report.summary.skipped}\n`;
      text += `  - Total Logged: ${report.summary.total}\n\n`;
      text += `Use \`/edit_mode on\` to enable or \`/edit_mode off\` to resume normal service.`;
      return ctx.reply(text, { parse_mode: 'Markdown' });
    }

    // Default: Enable / Activate Edit Mode
    await ctx.replyWithChatAction('typing').catch(() => {});
    const result = await enableMaintenanceMode(ctx.api, { reason: 'Activated via /edit_mode command' });
    logAudit(userId, 'EDIT_MODE_ACTIVATED', `Maintenance active. Delivered to ${result.sentCount} chats`);

    let reply = `🛠️ *Edit Mode Activated!*\n\n`;
    reply += `• *System State*: 🔴 Maintenance Mode (Ordinary replies paused)\n`;
    reply += `• *Persistence*: Saved in SQLite (survives process restarts)\n`;
    reply += `• *Announcement Broadcast Telemetry*:\n`;
    reply += `  - Sent: ${result.sentCount} chats 🟢\n`;
    reply += `  - Failed: ${result.failedCount} chats 🔴\n`;
    reply += `  - Skipped: ${result.skippedCount} chats ⚪\n`;
    reply += `• *Authorized Controller*: Sandy (\`${userId}\`)\n`;
    reply += `• *Management & Coder Model*: \`gpt-6-luna\`\n\n`;
    reply += `_Ordinary group & user replies are suspended. Only owner management directives and coding tools are accepted._\n\n`;
    reply += `Send \`/edit_mode off\` or tell me *"exit edit mode"* to resume service.`;

    return ctx.reply(reply, { parse_mode: 'Markdown' });
  });

  // /limit [global|dev] <min> <max> - Dual-tier configurable response length limits
  bot.command('limit', async (ctx) => {
    const userIsOwner = isOwner(ctx.from?.id);
    const raw = (ctx.match || '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);

    const devMin = parseInt(getConfig('limit_dev_min', '1'), 10);
    const devMax = parseInt(getConfig('limit_dev_max', '500'), 10);
    const globMin = parseInt(getConfig('limit_global_min', '10'), 10);
    const globMax = parseInt(getConfig('limit_global_max', '100'), 10);

    if (!raw || raw.toLowerCase() === 'status') {
      let msg = `📏 *NERO RESPONSE LENGTH LIMITS*\n\n`;
      msg += `1. 👑 *Personal Creator / Dev Exclusive*:\n`;
      msg += `   • Range: *${devMin}* to *${devMax}* words\n`;
      msg += `   • User: Owner / Creator (Sandy) for testing & deep moderation\n\n`;
      msg += `2. 🌐 *Global Public Tier*:\n`;
      msg += `   • Range: *${globMin}* to *${globMax}* words\n`;
      msg += `   • User: All group chats & public users\n\n`;
      if (userIsOwner) {
        msg += `*Configuration Commands:*\n`;
        msg += `• \`/limit global <min> <max>\` (e.g. \`/limit global 10 100\`)\n`;
        msg += `• \`/limit dev <min> <max>\` (e.g. \`/limit dev 1 500\`)\n\n`;
        msg += `_Or simply text "set dev limit 1 500" or "set global limit 10 100"_`;
      } else {
        msg += `_Configured by bot administrator._`;
      }
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    if (!userIsOwner) {
      return ctx.reply('⛔ Only the verified bot owner can configure response length limits.');
    }

    const tier = parts[0]?.toLowerCase();
    const minVal = parseInt(parts[1], 10);
    const maxVal = parseInt(parts[2], 10);

    if ((tier !== 'global' && tier !== 'dev' && tier !== 'creator') || isNaN(minVal) || isNaN(maxVal) || minVal < 1 || maxVal < minVal) {
      return ctx.reply(
        `⚠️ *Invalid Limit Format*\n\nUsage:\n• \`/limit global <min> <max>\` (e.g. \`/limit global 10 100\`)\n• \`/limit dev <min> <max>\` (e.g. \`/limit dev 1 500\`)`,
        { parse_mode: 'Markdown' }
      );
    }

    if (tier === 'global') {
      setConfig('limit_global_min', String(minVal));
      setConfig('limit_global_max', String(maxVal));
      logAudit(ctx.from.id, 'LIMIT_GLOBAL_CHANGED', `Changed global limits to ${minVal}-${maxVal} words`);
      return ctx.reply(
        `🌐 *Global Public Word Limits Updated Permanently*\n\n• Minimum: *${minVal}* words\n• Maximum: *${maxVal}* words\n\nApplies to all regular users and groups. Saved forever in database.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      setConfig('limit_dev_min', String(minVal));
      setConfig('limit_dev_max', String(maxVal));
      logAudit(ctx.from.id, 'LIMIT_DEV_CHANGED', `Changed creator/dev limits to ${minVal}-${maxVal} words`);
      return ctx.reply(
        `👑 *Creator / Dev Exclusive Limits Updated Permanently*\n\n• Minimum: *${minVal}* words\n• Maximum: *${maxVal}* words\n\nReserved for creator (Sandy) for testing and diagnostics. Saved forever in database.`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // Minecraft features decommissioned
  bot.command(['game_mode', 'gamemode', 'game_status', 'gamestatus', 'game_reasoning', 'gamereasoning', 'game_group', 'mc', 'minecraft', 'narrow', 'setskin', 'set_skin'], async (ctx) => {
    return ctx.reply('ℹ️ Minecraft companion features have been disabled. Nero is operating 24/7 as your AI conversational assistant powered by GPT-6 Luna.');
  });

  // /master on | off (Owner only)
  bot.command('master', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can toggle the master switch.');
    }

    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'on') {
      setConfig('master_switch', 'true');
      logAudit(ctx.from.id, 'MASTER_SWITCH_ON', 'Owner enabled master switch via Telegram');
      return ctx.reply('🟢 Master AI connection ENABLED. All AI processing is active.');
    } else if (arg === 'off') {
      setConfig('master_switch', 'false');
      logAudit(ctx.from.id, 'MASTER_SWITCH_OFF', 'Owner disabled master switch via Telegram');
      return ctx.reply('🔴 Master AI connection DISABLED. All automated AI responses are immediately halted.');
    }

    const current = getConfig('master_switch', 'true') === 'true';
    return ctx.reply(`Master switch is currently: ${current ? '🟢 ON' : '🔴 OFF'}\nUsage: \`/master on\` or \`/master off\``, { parse_mode: 'Markdown' });
  });

  // /model (Owner only)
  bot.command('model', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can configure models.');
    }

    const activeModel = getActiveModelId();
    let text = `🤖 *AI MODEL MANAGEMENT*\n\n`;
    text += `Currently Active: \`${activeModel}\`\n\n`;
    text += `*Key Models:*\n`;

    for (const m of BASE_CATALOGUE) {
      const isSel = m.id === activeModel;
      text += `${isSel ? '👉 🟢' : '• ⚪'} *${m.name}* (\`${m.id}\`)\n`;
    }

    text += `\nTo switch model: \`/setmodel <id>\` (e.g. \`/setmodel gpt-6-luna\` or \`/setmodel claude-sonnet-4-6[1m]\`)\n`;
    text += `Or use the Mini App dashboard to browse all 46 models.`;
    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // /setmodel <id> (Owner only)
  bot.command('setmodel', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can switch models.');
    }

    const targetModel = ctx.match?.trim();
    if (!targetModel) {
      return ctx.reply('Usage: `/setmodel <model_id>` (e.g. `/setmodel gpt-6-luna`)', { parse_mode: 'Markdown' });
    }

    setActiveModelId(targetModel);
    logAudit(ctx.from.id, 'MODEL_CHANGED', `Changed active model to ${targetModel}`);
    await ctx.reply(`🟢 Active AI model switched to: \`${targetModel}\``, { parse_mode: 'Markdown' });
  });

  // /group on | off (Owner only)
  bot.command('group', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can configure group settings.');
    }

    if (ctx.chat.type === 'private') {
      return ctx.reply('This command configures a group chat. Run `/group on` or `/group off` inside a Telegram group.');
    }

    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'on') {
      toggleGroup(ctx.chat.id, true);
      return ctx.reply('🟢 Bot participation ENABLED for this group. (Requires global group switch to be active).');
    } else if (arg === 'off') {
      toggleGroup(ctx.chat.id, false);
      return ctx.reply('⚪ Bot participation DISABLED for this group.');
    }

    return ctx.reply('Usage: `/group on` or `/group off` inside this group.', { parse_mode: 'Markdown' });
  });

  // /globalgroup on | off (Owner only)
  bot.command('globalgroup', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can toggle global group settings.');
    }

    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'on') {
      setGlobalGroupParticipation(true);
      return ctx.reply('🟢 Global group participation ENABLED.');
    } else if (arg === 'off') {
      setGlobalGroupParticipation(false);
      return ctx.reply('⚪ Global group participation DISABLED.');
    }

    return ctx.reply('Usage: `/globalgroup on` or `/globalgroup off`', { parse_mode: 'Markdown' });
  });

  // /app, /webapp, /dashboard, /owner, /console: Launch 24/7 Mobile Mini App & Owner Console
  bot.command(['app', 'webapp', 'dashboard', 'owner', 'console', 'admin'], async (ctx) => {
    const webAppUrl = (config.webAppPublicUrl || 'https://raccon-v3q5.onrender.com').replace(/\/+$/, '');
    const userIsOwner = isOwner(ctx.from?.id);
    const keyboard = new InlineKeyboard();

    if (userIsOwner) {
      keyboard.webApp('👑 Open Owner Console (Direct Access)', `${webAppUrl}/owner.html`).row();
      keyboard.webApp('⚡ Open User Mini App', `${webAppUrl}/`);
    } else {
      keyboard.webApp('⚡ Open Rocket Mini App', `${webAppUrl}/`);
    }

    return ctx.reply(
      userIsOwner
        ? `👑 *ROCKET AI — CONTROL DECK*\n\n• *Live URL*: \`${webAppUrl}\`\n• *Owner Console*: Direct passwordless root access active\n• *Theme*: Modern Rocket AI design system\n\nChoose viewport below:`
        : `⚡ *ROCKET AI — 24/7 CLOUD MINI APP*\n\n• *Live URL*: \`${webAppUrl}\`\n• *Status*: 🟢 *Online 24/7*\n• *Dashboard*: Real-time model switcher, telemetry latency monitor, and group controls.\n\nTap the button below to launch:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  });

  // /chat, /panel, /buttons: Interactive Start/Stop Chat button controls in group
  bot.command(['chat', 'panel', 'buttons'], async (ctx) => {
    trackGroupActivity(ctx.chat);
    const msg = renderGroupControlMessage(ctx.chat.id, ctx.chat.title);
    const keyboard = buildGroupControlKeyboard(ctx.chat.id);
    return ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // /text on | off (Toggle reading & replying to all incoming texts)
  bot.command(['text', 'texton', 'textoff'], async (ctx) => {
    const userId = ctx.from?.id;
    const userIsOwner = isOwner(userId);
    let isGroupAdmin = false;

    if (ctx.chat.type !== 'private') {
      try {
        const member = await ctx.getChatMember(userId);
        isGroupAdmin = member.status === 'creator' || member.status === 'administrator';
      } catch {}
    }

    if (!userIsOwner && !isGroupAdmin && ctx.chat.type !== 'private') {
      return ctx.reply('⛔ Only group administrators or the verified bot owner can toggle text reply mode.');
    }

    let arg = (ctx.match || '').trim().toLowerCase();
    const commandText = (ctx.message?.text || '').split(/\s+/)[0].replace('/', '').toLowerCase();
    if (commandText.startsWith('texton')) arg = 'on';
    if (commandText.startsWith('textoff')) arg = 'off';

    if (arg === 'on' || arg === 'enable' || arg === 'true') {
      setConfig(`text_mode_${ctx.chat.id}`, 'on');
      setConfig(`chatmode_${ctx.chat.id}`, 'all');
      if (ctx.chat.type !== 'private') {
        toggleGroup(ctx.chat.id, true);
        setGlobalGroupParticipation(true);
      }
      logAudit(userId || 'unknown', 'TEXT_MODE_ON', `Enabled text reply mode in chat ${ctx.chat.id}`);
      const keyboard = buildGroupControlKeyboard(ctx.chat.id);
      return ctx.reply(
        '🟢 *Text Reply Mode: ON*\n\nRocket will now read and reply to all text messages in this chat automatically!\n\n_Tap [ 🔴 Stop Chat ] below anytime to go back to quiet mode._',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } else if (arg === 'off' || arg === 'disable' || arg === 'false') {
      setConfig(`text_mode_${ctx.chat.id}`, 'off');
      setConfig(`chatmode_${ctx.chat.id}`, 'mention');
      logAudit(userId || 'unknown', 'TEXT_MODE_OFF', `Disabled text reply mode in chat ${ctx.chat.id}`);
      const keyboard = buildGroupControlKeyboard(ctx.chat.id);
      return ctx.reply(
        '⚪ *Text Reply Mode: OFF*\n\nRocket is now in quiet mode. Rocket will continuously archive messages for memory, but will only reply when called by name ("Rocket..."), @mentioned, or directly replied to.\n\n_Tap [ 🟢 Start Chat ] below anytime to turn auto-replies back on._',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    }

    const msg = renderGroupControlMessage(ctx.chat.id, ctx.chat.title);
    const keyboard = buildGroupControlKeyboard(ctx.chat.id);
    return ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  // Direct /qr command: Sends live WhatsApp QR code immediately
  bot.command('qr', async (ctx) => {
    const status = whatsAppService.getStatus();
    if (status.status === 'connected') {
      const userPhone = (status.connectedUser?.id || '').split(':')[0];
      return ctx.reply(`🟢 *WhatsApp is ALREADY Connected!*\n\nLinked number: \`+${userPhone}\`\nNero AI is responding to messages live 24/7.`, { parse_mode: 'Markdown' });
    }

    let liveQrInfo = whatsAppService.getQrCode();
    if (!liveQrInfo.qrRaw) {
      await ctx.reply('🔄 Initializing live WhatsApp socket and generating fresh QR code... Please wait 2 seconds.');
      if (whatsAppService.status === 'disconnected') {
        await whatsAppService.init();
      }
      await new Promise((r) => setTimeout(r, 2500));
      liveQrInfo = whatsAppService.getQrCode();
    }

    if (!liveQrInfo.qrRaw) {
      return ctx.reply('⏳ Fresh QR code is generating right now. Please send /qr again in 2 seconds.');
    }

    try {
      const qrBuffer = await QRCode.toBuffer(liveQrInfo.qrRaw, { scale: 8, margin: 2 });
      const webAppUrl = config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app';
      const keyboard = new InlineKeyboard()
        .url('🌐 Open Live Web QR Page', `${webAppUrl.replace(/\/+$/, '')}/qr`)
        .row()
        .text('🔄 Refresh QR', 'wa_send_qr');

      return ctx.replyWithPhoto(new InputFile(qrBuffer, 'whatsapp-live-qr.png'), {
        caption:
          `📷 *NERO LABS — 24/7 LIVE WHATSAPP QR CODE*\n\n` +
          `*How to connect:*\n` +
          `1. Open **WhatsApp** on your phone\n` +
          `2. Tap **Settings** (or 3 dots) > **Linked Devices**\n` +
          `3. Tap **Link a Device** and point your camera at this code\n\n` +
          `_✨ This QR code is kept always-live 24/7!_`,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (err) {
      return ctx.reply(`⚠️ Could not render QR: ${err.message}`);
    }
  });

  // WhatsApp Bridge Management Commands (Owner & Diagnostics)
  bot.command(['whatsapp', 'wa'], async (ctx) => {
    const userId = ctx.from?.id;
    const userIsOwner = isOwner(userId);
    const args = ctx.message.text.trim().split(/\s+/).slice(1);
    const subCmd = (args[0] || '').toLowerCase();

    const status = whatsAppService.getStatus();

    if (!subCmd) {
      const badge =
        status.status === 'connected'
          ? '🟢 Connected'
          : status.status === 'qr_ready'
          ? '🟡 Waiting for QR Scan'
          : status.status === 'reconnecting'
          ? '🔄 Reconnecting'
          : '🔴 Disconnected';

      const userDisplay = status.connectedUser
        ? `\n• *Linked Number:* \`+${(status.connectedUser.id || '').split(':')[0]}\` (${status.connectedUser.name || 'Owner'})`
        : '';

      const webAppUrl = config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app';

      const keyboard = new InlineKeyboard()
        .url('🌐 Open WhatsApp Deck', `${webAppUrl.replace(/\/+$/, '')}/owner.html`)
        .row()
        .text('🔄 Refresh Status', 'wa_refresh_status');

      if (status.status === 'qr_ready') {
        keyboard.text('📷 Get QR Code', 'wa_send_qr');
      }

      return ctx.reply(
        `💬 *NERO LABS — 24/7 WHATSAPP BRIDGE*\n\n` +
        `• *State:* ${badge}${userDisplay}\n` +
        `• *Messages Processed:* ${status.messageCount}\n` +
        `• *Mode:* \`${status.mode}\`\n` +
        `• *Auto-Reply:* ${status.autoReply ? '✅ Enabled' : '❌ Disabled'}\n` +
        `• *Telegram Sync:* ${status.notifyTelegram ? '✅ Enabled' : '❌ Disabled'}\n\n` +
        `*Quick Commands:*\n` +
        `• \`/wa qr\` — Send live QR code photo here\n` +
        `• \`/wa pair <phone>\` — Get 8-digit phone pairing code\n` +
        `• \`/wa send <phone> <text>\` — Send WhatsApp message\n` +
        `• \`/wa restart\` — Restart WhatsApp bridge\n` +
        `• \`/wa logout\` — Disconnect session`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
    }

    if (subCmd === 'qr') {
      const qrInfo = whatsAppService.getQrCode();
      if (!qrInfo.qrRaw) {
        if (status.status === 'connected') {
          return ctx.reply('🟢 WhatsApp bridge is already connected! No QR scan needed.');
        }
        return ctx.reply('⏳ QR code is not ready yet. Please wait a few seconds and try again.');
      }

      try {
        const qrBuffer = await QRCode.toBuffer(qrInfo.qrRaw, { scale: 8, margin: 2 });
        return ctx.replyWithPhoto(new InputFile(qrBuffer, 'whatsapp-qr.png'), {
          caption: '📷 *Scan this QR code with WhatsApp on your phone:*\n\n1. Open WhatsApp on your phone\n2. Tap Settings > Linked Devices\n3. Tap "Link a Device" and point your camera here.',
          parse_mode: 'Markdown',
        });
      } catch (err) {
        return ctx.reply(`⚠️ Could not generate QR image: ${err.message}`);
      }
    }

    if (!userIsOwner) {
      return ctx.reply('🚫 Only the bot owner can execute WhatsApp management actions.');
    }

    if (subCmd === 'pair') {
      const phone = args[1];
      if (!phone) {
        return ctx.reply('⚠️ Please provide your phone number with country code:\nExample: `/wa pair 919876543210`', { parse_mode: 'Markdown' });
      }

      try {
        await ctx.reply('⏳ Requesting 8-digit WhatsApp pairing code...');
        const code = await whatsAppService.requestPairingCode(phone);
        return ctx.reply(
          `🔑 *Your WhatsApp Pairing Code:*\n\n` +
          `\`${code}\`\n\n` +
          `*Instructions:*\n` +
          `1. Open WhatsApp on your phone (+${phone})\n` +
          `2. Go to **Settings** > **Linked Devices**\n` +
          `3. Tap **Link with phone number instead**\n` +
          `4. Enter the code above: \`${code}\`\n\n` +
          `_Code expires in 60 seconds!_`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        return ctx.reply(`⚠️ Pairing failed: ${err.message}`);
      }
    }

    if (subCmd === 'send') {
      const targetPhone = args[1];
      const messageText = args.slice(2).join(' ');
      if (!targetPhone || !messageText) {
        return ctx.reply('⚠️ Usage: `/wa send <phone_with_country_code> <message>`\nExample: `/wa send 919876543210 Hello from Nero!`', { parse_mode: 'Markdown' });
      }

      try {
        await whatsAppService.sendOutboundMessage(targetPhone, messageText);
        return ctx.reply(`✅ Message sent to WhatsApp number \`+${targetPhone}\`!`, { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply(`⚠️ Send failed: ${err.message}`);
      }
    }

    if (subCmd === 'restart') {
      await ctx.reply('🔄 Restarting WhatsApp bridge socket...');
      await whatsAppService.restart();
      return ctx.reply('✅ WhatsApp bridge socket rebooted.');
    }

    if (subCmd === 'logout' || subCmd === 'disconnect') {
      await whatsAppService.disconnectSession();
      return ctx.reply('✅ WhatsApp session disconnected and local credentials reset.');
    }
  });

  bot.command('wa_send', async (ctx) => {
    const userId = ctx.from?.id;
    if (!isOwner(userId)) {
      return ctx.reply('🚫 Owner only command.');
    }
    const parts = ctx.message.text.trim().split(/\s+/);
    const targetPhone = parts[1];
    const messageText = parts.slice(2).join(' ');
    if (!targetPhone || !messageText) {
      return ctx.reply('⚠️ Usage: `/wa_send <phone> <message>`');
    }
    try {
      await whatsAppService.sendOutboundMessage(targetPhone, messageText);
      return ctx.reply(`✅ Message sent to WhatsApp \`+${targetPhone}\``, { parse_mode: 'Markdown' });
    } catch (err) {
      return ctx.reply(`⚠️ Send error: ${err.message}`);
    }
  });

  // Inline callback query handlers for WhatsApp refresh & QR
  bot.callbackQuery('wa_refresh_status', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Status refreshed' }).catch(() => {});
    const status = whatsAppService.getStatus();
    const badge =
      status.status === 'connected'
        ? '🟢 Connected'
        : status.status === 'qr_ready'
        ? '🟡 Waiting for QR Scan'
        : status.status === 'reconnecting'
        ? '🔄 Reconnecting'
        : '🔴 Disconnected';

    const userDisplay = status.connectedUser
      ? `\n• *Linked Number:* \`+${(status.connectedUser.id || '').split(':')[0]}\` (${status.connectedUser.name || 'Owner'})`
      : '';

    await ctx.editMessageText(
      `💬 *NERO LABS — 24/7 WHATSAPP BRIDGE*\n\n` +
      `• *State:* ${badge}${userDisplay}\n` +
      `• *Messages Processed:* ${status.messageCount}\n` +
      `• *Mode:* \`${status.mode}\`\n` +
      `• *Auto-Reply:* ${status.autoReply ? '✅ Enabled' : '❌ Disabled'}\n` +
      `• *Telegram Sync:* ${status.notifyTelegram ? '✅ Enabled' : '❌ Disabled'}\n\n` +
      `*Quick Commands:*\n` +
      `• \`/wa qr\` — Send live QR code photo here\n` +
      `• \`/wa pair <phone>\` — Get 8-digit phone pairing code\n` +
      `• \`/wa send <phone> <text>\` — Send WhatsApp message\n` +
      `• \`/wa restart\` — Restart WhatsApp bridge\n` +
      `• \`/wa logout\` — Disconnect session`,
      {
        parse_mode: 'Markdown',
        reply_markup: ctx.callbackQuery.message?.reply_markup,
      }
    ).catch(() => {});
  });

  bot.callbackQuery('wa_send_qr', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const qrInfo = whatsAppService.getQrCode();
    if (!qrInfo.qrRaw) {
      return ctx.reply('⏳ QR code not ready yet.');
    }
    try {
      const qrBuffer = await QRCode.toBuffer(qrInfo.qrRaw, { scale: 8, margin: 2 });
      await ctx.replyWithPhoto(new InputFile(qrBuffer, 'whatsapp-qr.png'), {
        caption: '📷 *Scan this QR code with WhatsApp on your phone*',
        parse_mode: 'Markdown',
      });
    } catch (err) {
      await ctx.reply(`⚠️ Could not generate QR image: ${err.message}`);
    }
  });

  // /menu /controls /buttons: Interactive Owner Button Deck for Telegram
  bot.command(['menu', 'controls', 'buttons'], async (ctx) => {
    const userIsOwner = isOwner(ctx.from?.id);
    if (!userIsOwner) {
      return ctx.reply('🔒 This interactive console is reserved for Sandy (Owner).');
    }

    const webAppUrl = config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app';
    const keyboard = new InlineKeyboard()
      .text('📬 Urgent Inbox', 'owner_btn_inbox')
      .text('📊 System Telemetry', 'owner_btn_telemetry')
      .row()
      .text('🎮 Sandy Routine', 'owner_btn_routine')
      .text('🛠️ Toggle Maintenance', 'owner_btn_maintenance')
      .row()
      .text('📝 View Notes', 'owner_btn_notes')
      .text('🔄 WhatsApp QR', 'wa_send_qr')
      .row()
      .webApp('👑 Open Owner Console', `${webAppUrl.replace(/\/+$/, '')}/owner.html`);

    return ctx.reply(
      `👑 *NERO LABS — OWNER INTERACTIVE ACTION DECK*\n\nTap any button below to execute instant controls across WhatsApp & Telegram:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  });

  bot.callbackQuery('owner_btn_inbox', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const urgentList = sandyStatusService.getUrgentRequests(10);
    if (urgentList.length === 0) {
      return ctx.reply('Boss Sandy! Abhi koi pending urgent talk request nahi hai. All clear! ✨');
    }
    let report = "📬 *NERO MASTERBOT — SANDY'S URGENT INBOX*\n\n";
    for (const item of urgentList) {
      report += `• *+${item.sender_number}* (${item.sender_name || 'Contact'}):\n  "${item.message_text}"\n  _Received: ${new Date(item.created_at).toLocaleString()}_\n\n`;
    }
    report += `_Reply with:_ \`/wa_send <number> <your reply>\``;
    return ctx.reply(report, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('owner_btn_telemetry', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const status = whatsAppService.getStatus();
    const memoryUsage = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);

    const text =
      `📊 *NERO TELEMETRY & SYSTEM STATUS*\n\n` +
      `• *Process Uptime:* ${hours}h ${minutes}m\n` +
      `• *RAM RSS:* ${Math.round(memoryUsage.rss / 1024 / 1024)} MB\n` +
      `• *WhatsApp Status:* 🟢 \`${status.status}\`\n` +
      `• *WhatsApp Messages:* ${status.messageCount}\n` +
      `• *Public Talk Engine:* \`gpt-6-luna\` (Low Reasoning / Fast Response)\n` +
      `• *MasterBot Engine:* \`gpt-6-luna\` (Extra High Reasoning / Coder & Manager)\n` +
      `• *Device Linked:* \`${status.connectedUser?.name || 'Waiting for scan'}\``;
    return ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('owner_btn_routine', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const s = sandyStatusService.getStatus();
    const text =
      `🎮 *SANDY'S REAL-TIME ROUTINE & GAMING STATUS*\n\n` +
      `• *Activity:* "${s.activity || 'Working'}"\n` +
      `• *Availability:* \`${s.availability || 'busy'}\`\n` +
      `• *Realm/Server:* "${s.game_info || 'None specified'}"\n` +
      `• *Instructions:* "${s.contact_instructions || 'Take priority request.'}"\n\n` +
      `_💡 To update, simply tell Nero on WhatsApp or Telegram!_`;
    return ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('owner_btn_maintenance', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const isMaint = isMaintenanceModeActive();
    if (isMaint) {
      await disableMaintenanceMode();
      return ctx.reply('🟢 *Maintenance Mode DEACTIVATED.* Public replies are now fully live for all contacts! 🚀', { parse_mode: 'Markdown' });
    } else {
      await enableMaintenanceMode();
      return ctx.reply('🛠️ *Maintenance Mode ACTIVATED.* Public replies are temporarily paused for contacts while you work! 🔒', { parse_mode: 'Markdown' });
    }
  });

  bot.callbackQuery('owner_btn_notes', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const notes = getUserNotes('sandy');
    if (!notes || notes.length === 0) {
      return ctx.reply('📝 Boss Sandy, your persistent notepad is currently empty.');
    }
    let notesReport = `📝 *SANDY'S PERSISTENT NOTES (${notes.length})*:\n\n`;
    for (const n of notes.slice(0, 10)) {
      notesReport += `• [#${n.id}] ${n.note_text} _(${new Date(n.created_at).toLocaleDateString()})_\n`;
    }
    return ctx.reply(notesReport, { parse_mode: 'Markdown' });
  });

  // /mcp command: Model Context Protocol bridge status & live telemetry
  bot.command('mcp', async (ctx) => {
    const status = getMcpStatus();
    let msg = `🔌 *NERO LABS — LIVE MCP BRIDGE*\n\n`;
    msg += `• *Status*: ${status.bridgeAvailable ? '🟢 Online & Available' : '🔴 Offline'}\n`;
    msg += `• *Active Connections*: \`${status.activeConnections} / ${status.maxConnections}\`\n`;
    msg += `• *Registered Tools*: \`${status.toolCount} tools\`\n`;
    msg += `• *Endpoint URL*: \`${config.webAppPublicUrl || 'http://localhost:' + config.port}/mcp\`\n`;
    msg += `• *SSE Transport*: \`${config.webAppPublicUrl || 'http://localhost:' + config.port}/mcp/sse\`\n\n`;
    if (status.sessions && status.sessions.length > 0) {
      msg += `*Connected Clients:*\n`;
      for (const s of status.sessions) {
        msg += `• \`${s.clientName}\` (${s.sessionId}) — Latency: ${s.latencyMs} ms, active ${s.activeMinutes}m\n`;
      }
    } else {
      msg += `_No active external MCP clients connected at this moment._\n`;
    }
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /assistant command: Personal Assistant Mode & Reply Policy
  bot.command('assistant', async (ctx) => {
    const userIsOwner = isOwner(ctx.from?.id);
    if (!userIsOwner) {
      return ctx.reply('🔒 The `/assistant` mode is strictly reserved for the verified bot owner.', { parse_mode: 'Markdown' });
    }

    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'on') {
      assistantManager.setEnabled(true);
      return ctx.reply(`📬 *Assistant Mode ENABLED*\n\nNero will now intercept and manage private incoming messages according to policy: \`${assistantManager.getPolicy().toUpperCase()}\`.`, { parse_mode: 'Markdown' });
    }
    if (arg === 'off') {
      assistantManager.setEnabled(false);
      return ctx.reply(`✨ *Assistant Mode DISABLED*\n\nNero has resumed normal AI chat and roleplay for all direct messages!`, { parse_mode: 'Markdown' });
    }

    if (arg === 'manual' || arg === 'auto' || arg === 'restricted') {
      assistantManager.setPolicy(arg);
      return ctx.reply(`📬 *Assistant Reply Policy Updated: \`${arg.toUpperCase()}\`*\n\n• ${arg === 'manual' ? 'Nero logs incoming messages and alerts you, without auto-replying.' : arg === 'auto' ? 'Nero auto-replies courteously to contacts explaining that you are away and will review their note.' : 'Nero auto-replies only to pre-approved VIP contacts.'}`, { parse_mode: 'Markdown' });
    }

    const isEnabled = assistantManager.isEnabled();
    const currentPolicy = assistantManager.getPolicy();
    const inbox = assistantManager.getInboxMessages(5);
    let msg = `📬 *NERO LABS — PERSONAL ASSISTANT MODE*\n\n`;
    msg += `• *Status*: ${isEnabled ? '🟢 `ENABLED` (Intercepting DMs)' : '⚪ `DISABLED` (Normal AI Chat Active)'}\n`;
    msg += `• *Active Policy*: \`${currentPolicy.toUpperCase()}\`\n`;
    msg += `• *Recent Messages in Inbox*: \`${inbox.length}\`\n\n`;
    msg += `*Available Commands:*\n`;
    msg += `• \`/assistant on\` — Activate assistant mode (intercept non-owner DMs)\n`;
    msg += `• \`/assistant off\` — Deactivate assistant mode (allow everyone to chat)\n`;
    msg += `• \`/assistant manual\` — Log & notify owner only\n`;
    msg += `• \`/assistant auto\` — Courteous Luna auto-reply on owner behalf\n`;
    msg += `• \`/assistant restricted\` — Auto-reply to approved VIP contacts only\n\n`;
    if (inbox.length > 0) {
      msg += `*Latest Inbox Note:*\n`;
      const top = inbox[0];
      msg += `• From: ${top.sender_name} (\`${top.sender_id}\`): "${top.message_content.slice(0, 100)}..."\n`;
    }
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /security command: Luna Security Supervisor Scan
  bot.command('security', async (ctx) => {
    const userIsOwner = isOwner(ctx.from?.id);
    if (!userIsOwner) {
      return ctx.reply('🔒 Security diagnosis is restricted to the verified bot owner.');
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    const diag = await securitySupervisor.runSecurityDiagnostic();
    let msg = `🛡️ *LUNA SECURITY SUPERVISOR DIAGNOSTIC*\n\n`;
    msg += `• *Agent*: \`${diag.supervisor}\` (Reasoning: \`${diag.reasoningLevel.toUpperCase()}\`)\n`;
    msg += `• *Status*: ${diag.status === 'SECURE' ? '🟢 SECURE & VERIFIED' : '🟡 ACTION RECOMMENDED'}\n`;
    msg += `• *Findings*: ${diag.findingsCount}\n`;
    msg += `• *Provider Health*: \`${diag.providerStatus}\`\n`;
    msg += `• *Audit Trail Events*: \`${diag.recentAuditLogsCount}\` logged\n\n`;

    if (diag.findings.length > 0) {
      msg += `*Diagnostic Notices:*\n`;
      for (const f of diag.findings) {
        msg += `• [${f.severity}] ${f.issue}\n`;
      }
    } else {
      msg += `✅ Zero critical vulnerabilities detected. API keys and tokens are sandboxed and secret redaction is active.\n`;
    }
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /route command: Model Routing & Token Budget Inspection
  bot.command(['route', 'routing'], async (ctx) => {
    const chatR = getAgentRouting('chat');
    const secR = getAgentRouting('security');
    const medR = getAgentRouting('media');

    let msg = `⚡ *NERO LABS — MODEL ROUTING & TOKEN BUDGET*\n\n`;
    msg += `1. *Luna-Chat (General Conversation & Roleplay)*:\n`;
    msg += `   • Model: \`${chatR.model}\` | Reasoning: \`${chatR.reasoning.toUpperCase()}\`\n`;
    msg += `   • Budget: Target ~${chatR.targetTokens} tok | Hard Ceilings: ${chatR.maxInputTokens} in / ${chatR.maxOutputTokens} out\n\n`;
    msg += `2. *Luna-Security (Security Supervisor & Audits)*:\n`;
    msg += `   • Model: \`${secR.model}\` | Reasoning: \`${secR.reasoning.toUpperCase()}\` (Highest Supported)\n`;
    msg += `   • Budget: Hard Ceilings: ${secR.maxInputTokens} in / ${secR.maxOutputTokens} out\n\n`;
    msg += `3. *Luna-Media (Vision & Document Inspection)*:\n`;
    msg += `   • Model: \`${medR.model}\` | Reasoning: \`${medR.reasoning.toUpperCase()}\` (High)\n`;
    msg += `   • Budget: Hard Ceilings: ${medR.maxInputTokens} in / ${medR.maxOutputTokens} out\n\n`;
    msg += `_All routing parameters and reasoning levels are independently adjustable via the control dashboard or API._`;
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /adminrights command: Dynamic Telegram Bot API rights inspection
  bot.command(['adminrights', 'rights'], async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('ℹ️ Admin rights inspection applies inside groups. In private chats, Nero operates with direct administrative panel capabilities.');
    }
    try {
      const chatMember = await ctx.api.getChatMember(ctx.chat.id, ctx.me.id);
      const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
      let msg = `🛡️ *TELEGRAM BOT ADMINISTRATOR RIGHTS*\n\n`;
      msg += `• *Status*: ${isAdmin ? '🟢 Administrator' : '⚪ Regular Member'}\n`;
      if (isAdmin) {
        msg += `• Delete Messages: ${chatMember.can_delete_messages ? '✅ Allowed' : '❌ Disabled'}\n`;
        msg += `• Restrict Members: ${chatMember.can_restrict_members ? '✅ Allowed' : '❌ Disabled'}\n`;
        msg += `• Pin Messages: ${chatMember.can_pin_messages ? '✅ Allowed' : '❌ Disabled'}\n`;
        msg += `• Invite Users: ${chatMember.can_invite_users ? '✅ Allowed' : '❌ Disabled'}\n`;
      } else {
        msg += `\n_To enable message moderation and pinning, promote @${ctx.me.username} to administrator in group settings._`;
      }
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
      return ctx.reply(`⚠️ Could not inspect rights: ${err.message}`);
    }
  });


  // Interactive Button Callbacks (Start Chat / Stop Chat / Pin Panel)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data || '';
    const chatId = ctx.chat?.id;

    if (data.startsWith('chat_start_') || data === 'chat_start') {
      const targetChatId = data.replace('chat_start_', '') || String(chatId);
      setConfig(`text_mode_${targetChatId}`, 'on');
      setConfig(`chatmode_${targetChatId}`, 'all');
      toggleGroup(targetChatId, true);
      setGlobalGroupParticipation(true);

      await ctx.answerCallbackQuery({
        text: '🟢 Start Chat activated! Nero is now talking and replying to messages.',
        show_alert: true,
      });

      const updatedText = renderGroupControlMessage(targetChatId, ctx.chat?.title);
      const updatedKeyboard = buildGroupControlKeyboard(targetChatId);
      try {
        await ctx.editMessageText(updatedText, {
          parse_mode: 'Markdown',
          reply_markup: updatedKeyboard,
        });
      } catch {}
      return;
    }

    if (data.startsWith('chat_stop_') || data === 'chat_stop') {
      const targetChatId = data.replace('chat_stop_', '') || String(chatId);
      setConfig(`text_mode_${targetChatId}`, 'off');
      setConfig(`chatmode_${targetChatId}`, 'mention');

      await ctx.answerCallbackQuery({
        text: '🔴 Stop Chat activated! Nero is in quiet mode — call my name ("Nero...") or reply to me anytime.',
        show_alert: true,
      });

      const updatedText = renderGroupControlMessage(targetChatId, ctx.chat?.title);
      const updatedKeyboard = buildGroupControlKeyboard(targetChatId);
      try {
        await ctx.editMessageText(updatedText, {
          parse_mode: 'Markdown',
          reply_markup: updatedKeyboard,
        });
      } catch {}
      return;
    }

    if (data.startsWith('chat_pin_') || data === 'chat_pin') {
      const msgId = ctx.callbackQuery.message?.message_id;
      if (!msgId) {
        return ctx.answerCallbackQuery({ text: 'Cannot find message to pin.' });
      }
      try {
        await ctx.pinChatMessage(msgId);
        await ctx.answerCallbackQuery({
          text: '📌 Pinned! Start and Stop Chat buttons are now pinned at the top of the group.',
          show_alert: true,
        });
      } catch (err) {
        await ctx.answerCallbackQuery({
          text: '⚠️ To pin, please grant Nero "Pin Messages" admin permission in group settings.',
          show_alert: true,
        });
      }
      return;
    }

    if (data.startsWith('chat_refresh_') || data === 'chat_refresh') {
      const targetChatId = data.replace('chat_refresh_', '') || String(chatId);
      const updatedText = renderGroupControlMessage(targetChatId, ctx.chat?.title);
      const updatedKeyboard = buildGroupControlKeyboard(targetChatId);
      try {
        await ctx.editMessageText(updatedText, {
          parse_mode: 'Markdown',
          reply_markup: updatedKeyboard,
        });
      } catch {}
      await ctx.answerCallbackQuery({ text: 'Status refreshed!' });
      return;
    }

    if (data.startsWith('set_role_')) {
      const roleId = data.replace('set_role_', '');
      const targetRole = normalizeRole(roleId);
      const targetUserId = ctx.from?.id;
      if (targetUserId) {
        setUserRelationshipRole(targetUserId, targetRole);
      }
      const roleDef = getRoleDefinition(targetRole);
      const userIdent = getActiveUserIdentity(chatId, targetUserId);
      const callingName = userIdent.customName || ctx.from?.first_name || 'Friend';

      await ctx.answerCallbackQuery({
        text: `Roleplay set to ${roleDef.label}!`,
        show_alert: false,
      });

      return ctx.reply(
        `✨ *Roleplay Updated!*\n\n` +
        `Hey *${callingName}*, you are now registered as my ${roleDef.emoji} *${roleDef.label}* (${roleDef.hindiAlias})!\n\n` +
        `• *Dynamic*: _${roleDef.description}_\n` +
        `• *Addressing*: Nero will call you *"${callingName}"* and talk with this exact relationship bond in all chats! 💖`,
        { parse_mode: 'Markdown' }
      );
    }

    if (data === 'confirm_wipe_data') {
      const userIsOwner = isOwner(ctx.from?.id);
      if (!userIsOwner) {
        return ctx.answerCallbackQuery({ text: 'Access denied: Only owner can confirm data wipe.', show_alert: true });
      }
      resetAllUserData();
      setConfig('master_switch', 'false');
      logAudit(String(ctx.from.id), 'OWNER_DATA_WIPED_CONFIRMED', 'Owner confirmed complete local data wipe via Telegram.');
      await ctx.answerCallbackQuery({ text: 'All local conversation and usage data deleted.', show_alert: true });
      try {
        await ctx.editMessageText('🔴 *LOCAL DATA WIPED & ACCESS REVOKED*\n\nAll local conversation memory, tokens, and temporary files have been permanently cleared. Master AI switch is suspended.', { parse_mode: 'Markdown' });
      } catch {}
      return;
    }

    if (data === 'cancel_wipe_data') {
      await ctx.answerCallbackQuery({ text: 'Action cancelled. Your data remains untouched.' });
      try {
        await ctx.editMessageText('⚪ *Action Cancelled*\n\nNo changes were made. All memory and configurations remain active.', { parse_mode: 'Markdown' });
      } catch {}
      return;
    }

    await ctx.answerCallbackQuery().catch(() => {});
  });

  // ==========================================
  // CUSTOM IDENTITY & ROLEPLAY COMMANDS
  // ==========================================

  // /role, /roles: Interactive role selection or direct assignment
  bot.command(['role', 'roles'], async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const arg = ctx.match?.trim();

    if (!arg) {
      const current = getActiveUserIdentity(ctx.chat.id, userId);
      const roleDef = getRoleDefinition(current.relationshipRole);
      const callingName = current.customName || ctx.from?.first_name || 'Friend';
      let text = `🎭 *CHOOSE YOUR ROLEPLAY RELATIONSHIP WITH NERO*\n\n`;
      text += `Choose how Nero interacts with you in this group and across all chats!\n\n`;
      text += `• *Your Name*: *${callingName}*\n`;
      text += `• *Current Role*: ${roleDef.emoji} *${roleDef.label}* (${roleDef.hindiAlias})\n`;
      text += `• *Roleplay Dynamic*: _${roleDef.description}_\n\n`;
      text += `👉 *Tap a button below to choose your relationship:*`;

      return ctx.reply(text, {
        parse_mode: 'Markdown',
        reply_markup: buildRoleSelectionKeyboard(),
      });
    }

    const targetRole = normalizeRole(arg);
    setUserRelationshipRole(userId, targetRole);
    const roleDef = getRoleDefinition(targetRole);
    const current = getActiveUserIdentity(ctx.chat.id, userId);
    const callingName = current.customName || ctx.from?.first_name || 'Friend';

    return ctx.reply(
      `✨ *Roleplay Updated!*\n\n` +
      `Hey *${callingName}*, you are now my ${roleDef.emoji} *${roleDef.label}* (${roleDef.hindiAlias})!\n\n` +
      `• *Roleplay Dynamic*: _${roleDef.description}_\n` +
      `• *Addressing*: Nero will call you *"${callingName}"* and talk to you with this exact relationship bond in all chats! 💖`,
      { parse_mode: 'Markdown' }
    );
  });

  // Direct Shortcut Commands for Roles: /setrolebrother, /setrolesister, /role_brother, /setrole, etc.
  const roleShortcutCommands = [
    'setrole',
    'setrolebrother', 'setrole_brother', 'role_brother', 'rolebrother',
    'setrolesister', 'setrole_sister', 'role_sister', 'rolesister',
    'setrolemother', 'setrole_mother', 'role_mother', 'rolemother',
    'setrolefather', 'setrole_father', 'role_father', 'rolefather',
    'setroledaughter', 'setrole_daughter', 'role_daughter', 'roledaughter',
    'setroleson', 'setrole_son', 'role_son', 'roleson',
    'setrolefriend', 'setrole_friend', 'role_friend', 'rolefriend',
    'setrolebestie', 'setrole_bestie', 'role_bestie', 'rolebestie',
    'setrolementor', 'setrole_mentor', 'role_mentor', 'rolementor',
    'setrolepartner', 'setrole_partner', 'role_partner', 'rolepartner',
  ];

  bot.command(roleShortcutCommands, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    let targetRole = null;
    const cmdText = ctx.message?.text?.split(/\s+/)[0]?.replace(/^\//, '').toLowerCase() || '';

    // Extract target role from command name or arguments
    if (cmdText.includes('brother')) targetRole = 'brother';
    else if (cmdText.includes('sister')) targetRole = 'sister';
    else if (cmdText.includes('mother')) targetRole = 'mother';
    else if (cmdText.includes('father')) targetRole = 'father';
    else if (cmdText.includes('daughter')) targetRole = 'daughter';
    else if (cmdText.includes('son')) targetRole = 'son';
    else if (cmdText.includes('friend')) targetRole = 'friend';
    else if (cmdText.includes('bestie')) targetRole = 'bestie';
    else if (cmdText.includes('mentor')) targetRole = 'mentor';
    else if (cmdText.includes('partner')) targetRole = 'partner';
    else if (ctx.match?.trim()) {
      targetRole = normalizeRole(ctx.match.trim());
    }

    if (!targetRole) {
      const current = getActiveUserIdentity(ctx.chat.id, userId);
      const roleDef = getRoleDefinition(current.relationshipRole);
      return ctx.reply(
        `🎭 *CHOOSE YOUR RELATIONSHIP ROLE WITH NERO*\n\n` +
        `Current Role: ${roleDef.emoji} *${roleDef.label}* (${roleDef.hindiAlias})\n\n` +
        `Tap any role below to choose:`,
        { parse_mode: 'Markdown', reply_markup: buildRoleSelectionKeyboard() }
      );
    }

    setUserRelationshipRole(userId, targetRole);
    const roleDef = getRoleDefinition(targetRole);
    const current = getActiveUserIdentity(ctx.chat.id, userId);
    const callingName = current.customName || ctx.from?.first_name || 'Friend';

    return ctx.reply(
      `✨ *Relationship Role Confirmed!*\n\n` +
      `Hey *${callingName}*, you are now registered as my ${roleDef.emoji} *${roleDef.label}* (${roleDef.hindiAlias})!\n\n` +
      `• *Dynamic*: _${roleDef.description}_\n` +
      `• *Addressing*: I will call you *"${callingName}"* and talk with our new bond! 💖`,
      { parse_mode: 'Markdown' }
    );
  });

  // /setname, /name, /nickname: Custom calling name for everyone
  bot.command(['setname', 'name', 'nickname'], async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const newName = ctx.match?.trim();

    if (!newName) {
      const ident = getActiveUserIdentity(ctx.chat.id, userId);
      const currentName = ident.customName || ctx.from?.first_name || 'Friend';
      return ctx.reply(
        `✏️ *CUSTOM CALLING NAME*\n\n` +
        `Nero currently calls you: *"${currentName}"*\n\n` +
        `To set a custom name, type:\n` +
        `\`/setname <your_name>\`\n\n` +
        `Example: \`/setname Sandy\` or \`/setname Alex\``,
        { parse_mode: 'Markdown' }
      );
    }

    const cleanName = newName.slice(0, 50);
    setUserCustomName(userId, cleanName);
    const ident = getActiveUserIdentity(ctx.chat.id, userId);
    const roleDef = getRoleDefinition(ident.relationshipRole);

    return ctx.reply(
      `✨ *Custom Name Saved!*\n\n` +
      `I will now call you *"${cleanName}"* everywhere as my ${roleDef.emoji} *${roleDef.label}*! 💖`,
      { parse_mode: 'Markdown' }
    );
  });

  // /myrole, /myidentity, /profile, /whoami
  bot.command(['myrole', 'myidentity', 'profile', 'whoami'], async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const ident = getActiveUserIdentity(ctx.chat.id, userId);
    const roleDef = getRoleDefinition(ident.relationshipRole);
    const name = ident.customName || ctx.from?.first_name || 'Friend';

    let text = `👤 *YOUR IDENTITY WITH NERO*\n\n`;
    text += `• *Custom Calling Name*: *${name}*\n`;
    text += `• *Telegram Name*: ${ctx.from?.first_name || 'Member'}\n`;
    text += `• *Relationship Role*: ${roleDef.emoji} *${roleDef.label}* (${roleDef.hindiAlias})\n`;
    text += `• *Roleplay Dynamic*: _${roleDef.description}_\n\n`;
    text += `*Quick Commands:*\n`;
    text += `• \`/role\` — Open role menu with buttons\n`;
    text += `• \`/setrole <role>\` — e.g. \`/setrole brother\`, \`/setrole mother\`\n`;
    text += `• \`/setname <name>\` — Set what Nero calls you\n`;
    text += `• \`/resetrole\` — Reset role to default (Friend)\n`;
    text += `• \`/resetname\` — Reset name to Telegram display name`;

    return ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // /resetrole
  bot.command('resetrole', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    setUserRelationshipRole(userId, 'friend');
    return ctx.reply('🔄 Role reset back to default: 🌸 *Friend*.', { parse_mode: 'Markdown' });
  });

  // /resetname
  bot.command('resetname', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    setUserCustomName(userId, null);
    return ctx.reply(`🔄 Custom name cleared. Nero will use your Telegram name: *"${ctx.from?.first_name || 'Friend'}"*.`, { parse_mode: 'Markdown' });
  });

  // Pinned Message Event Handler
  bot.on('message:pinned_message', async (ctx) => {
    const pinned = ctx.message.pinned_message;
    if (pinned?.from?.id === ctx.me?.id) {
      await ctx.reply(
        '📌 *Nero Controls Pinned!*\n\nI am pinned at the top of the group. Tap *Start Chat* anytime you want me to join the conversation, or just say *"Nero..."* whenever you need help! ✨',
        {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
          reply_markup: buildGroupControlKeyboard(ctx.chat.id),
        }
      ).catch(() => {});
    }
  });


  // /chatmode mention | all (Owner only: configure whether bot replies to all messages or only mentions)
  bot.command('chatmode', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can configure chat mode.');
    }
    if (ctx.chat.type === 'private') {
      return ctx.reply('Run `/chatmode all` or `/chatmode mention` inside a group chat.');
    }
    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'all') {
      setConfig(`chatmode_${ctx.chat.id}`, 'all');
      setConfig(`text_mode_${ctx.chat.id}`, 'on');
      return ctx.reply('🟢 Chat Mode: *ALL MESSAGES*\nNero will now respond to all messages in this group without needing to be tagged.', { parse_mode: 'Markdown' });
    } else if (arg === 'mention') {
      setConfig(`chatmode_${ctx.chat.id}`, 'mention');
      setConfig(`text_mode_${ctx.chat.id}`, 'off');
      return ctx.reply('⚪ Chat Mode: *MENTION ONLY*\nNero will only respond when @mentioned, called "Nero", or replied to.', { parse_mode: 'Markdown' });
    }
    const current = getConfig(`chatmode_${ctx.chat.id}`, 'all');
    return ctx.reply(`Current chat mode: *${current.toUpperCase()}*\nUsage: \`/chatmode all\` or \`/chatmode mention\``, { parse_mode: 'Markdown' });
  });

  // /modstatus command (Checks bot admin status & group moderation rules)
  bot.command('modstatus', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('Run `/modstatus` inside a Telegram group to inspect group moderation permissions.');
    }

    const adminRights = await checkBotAdminRights(ctx);
    const rules = getGroupModerationRules(ctx.chat.id);
    const globalMod = getConfig('group_moderation_enabled', 'false') === 'true';

    let msg = `🛡️ *GROUP MODERATION STATUS*\n\n`;
    msg += `• *Chat*: ${ctx.chat.title}\n`;
    msg += `• *Bot Status*: ${adminRights.isAdmin ? '👑 Administrator' : '👤 Regular Member'}\n`;
    msg += `• *Can Delete Messages*: ${adminRights.canDeleteMessages ? '🟢 Yes' : '🔴 No'}\n`;
    msg += `• *Can Restrict Members*: ${adminRights.canRestrictMembers ? '🟢 Yes' : '🔴 No'}\n\n`;
    msg += `*Configured Rules:*\n`;
    msg += `• Global Moderation Engine: ${globalMod ? '🟢 Enabled' : '⚪ Disabled'}\n`;
    msg += `• Group Rules Active: ${rules.enabled ? '🟢 Enabled' : '⚪ Disabled'}\n`;
    msg += `• Spam Character Filter: ${rules.spamFilter ? '🟢 Active' : '⚪ Off'}\n`;
    msg += `• Link Filter: ${rules.linkFilter ? '🟢 Active' : '⚪ Off'}\n`;
    msg += `• Max Warnings: ${rules.maxWarnings}\n\n`;
    msg += `_Note: No automatic kick or ban will occur unless enabled by owner._`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /mod on | off (Owner only)
  bot.command('mod', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can configure moderation.');
    }

    if (ctx.chat.type === 'private') {
      return ctx.reply('Run `/mod on` or `/mod off` inside a Telegram group.');
    }

    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'on') {
      updateGroupModerationRules(ctx.chat.id, { enabled: true, spamFilter: true, linkFilter: false });
      return ctx.reply('🟢 Group moderation ENABLED for this chat. (Rules: Spam filter active, max 3 warnings).');
    } else if (arg === 'off') {
      updateGroupModerationRules(ctx.chat.id, { enabled: false });
      return ctx.reply('⚪ Group moderation DISABLED for this chat.');
    }

    return ctx.reply('Usage: `/mod on` or `/mod off`', { parse_mode: 'Markdown' });
  });

  // /warn @user <reason> (Owner only)
  bot.command('warn', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can issue warnings.');
    }

    if (ctx.chat.type === 'private') {
      return ctx.reply('Warnings are applied in group chats.');
    }

    const replyUser = ctx.message.reply_to_message?.from;
    if (!replyUser) {
      return ctx.reply('Please reply to a user message with `/warn <reason>` to issue a warning.', { parse_mode: 'Markdown' });
    }

    const reason = ctx.match?.trim() || 'Violating community guidelines';
    const result = addWarning(ctx.chat.id, replyUser.id, reason);
    const rules = getGroupModerationRules(ctx.chat.id);

    let text = `⚠️ *MODERATION WARNING*\n\n`;
    text += `User: *${replyUser.first_name || 'Member'}* (\`${replyUser.id}\`)\n`;
    text += `Reason: ${reason}\n`;
    text += `Warning Count: *${result.warnCount} / ${rules.maxWarnings}*\n`;

    if (result.warnCount >= rules.maxWarnings) {
      text += `\n🚨 *User has reached maximum warnings.*\n`;
      const adminRights = await checkBotAdminRights(ctx);
      if (adminRights.canRestrictMembers && rules.enabled) {
        text += `_Moderation action pending owner/admin authorization._`;
      }
    }

    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // /del (Owner or Admin: Delete replied-to message)
  bot.command('del', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can execute admin actions.');
    }
    const targetMsg = ctx.message.reply_to_message;
    if (!targetMsg) {
      return ctx.reply('Reply to a message with `/del` to delete it.', { parse_mode: 'Markdown' });
    }
    try {
      await ctx.api.deleteMessage(ctx.chat.id, targetMsg.message_id);
      await ctx.deleteMessage().catch(() => {});
    } catch (err) {
      ctx.reply(`⚠️ Cannot delete message: ${err.message}`);
    }
  });


  // /pin (Owner or Admin: Pin replied-to message)
  bot.command('pin', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can execute admin actions.');
    }
    const targetMsg = ctx.message.reply_to_message;
    if (!targetMsg) {
      return ctx.reply('Reply to a message with `/pin` to pin it.', { parse_mode: 'Markdown' });
    }
    try {
      await ctx.pinChatMessage(targetMsg.message_id);
      ctx.reply('📌 Message successfully pinned!');
    } catch (err) {
      ctx.reply(`⚠️ Cannot pin message: ${err.message}`);
    }
  });


  // /ban (Owner or Admin: Ban replied-to user)
  bot.command('ban', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can execute admin actions.');
    }
    const targetUser = ctx.message.reply_to_message?.from;
    if (!targetUser) {
      return ctx.reply('Reply to a user message with `/ban` to ban them.', { parse_mode: 'Markdown' });
    }
    try {
      await ctx.banChatMember(targetUser.id);
      ctx.reply(`🚫 *${targetUser.first_name || 'User'}* (\`${targetUser.id}\`) has been banned.`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`⚠️ Cannot ban user: ${err.message}. Ensure Nero is an Admin with ban rights.`);
    }
  });


  // /kick (Owner or Admin: Kick replied-to user)
  bot.command('kick', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can execute admin actions.');
    }
    const targetUser = ctx.message.reply_to_message?.from;
    if (!targetUser) {
      return ctx.reply('Reply to a user message with `/kick` to kick them.', { parse_mode: 'Markdown' });
    }
    try {
      await ctx.banChatMember(targetUser.id);
      await ctx.unbanChatMember(targetUser.id);
      ctx.reply(`👢 *${targetUser.first_name || 'User'}* (\`${targetUser.id}\`) has been removed from the group.`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`⚠️ Cannot kick user: ${err.message}. Ensure Nero is an Admin with restrict rights.`);
    }
  });


  // /mute <minutes> (Owner or Admin: Mute replied-to user)
  bot.command('mute', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can execute admin actions.');
    }
    const targetUser = ctx.message.reply_to_message?.from;
    if (!targetUser) {
      return ctx.reply('Reply to a user message with `/mute [minutes]` to mute them.', { parse_mode: 'Markdown' });
    }
    const mins = parseInt(ctx.match?.trim() || '15', 10);
    const untilDate = Math.floor(Date.now() / 1000) + mins * 60;
    try {
      await ctx.restrictChatMember(targetUser.id, {
        can_send_messages: false,
        can_send_other_messages: false,
      }, { until_date: untilDate });
      ctx.reply(`🔇 *${targetUser.first_name || 'User'}* has been muted for ${mins} minutes.`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`⚠️ Cannot mute user: ${err.message}. Ensure Nero is an Admin with restrict rights.`);
    }
  });


  // /clear command
  bot.command('clear', async (ctx) => {
    clearConversation(ctx.chat.id);
    await ctx.reply('🧹 Conversation memory cleared for this chat.');
  });

  // /avatar command (Show official Nero Labs AI avatar)
  bot.command('avatar', async (ctx) => {
    const avatarPath = 'd:\\nero-labs-telegram-bot\\data\\nero_avatar.jpg';
    if (fs.existsSync(avatarPath)) {
      await ctx.replyWithPhoto(new InputFile(avatarPath), {
        caption: `⚡ *Nero Labs AI — Official Persona*\n\n• Name: *Nero*\n• Creator: *Sandy*\n• Brand: *Nero Labs / N3ROL4BS*\n• Aesthetic: *Cyberpunk / High-Tech AI*`,
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } else {
      ctx.reply('Avatar image not found on local disk.');
    }
  });


  // AI Image Generation Handler
  const handleImageGeneration = async (ctx, promptText) => {
    if (!promptText || promptText.length < 3) {
      return ctx.reply('Please provide an image prompt! Example:\n`/image cyberpunk neon city in rain`', {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }

    const masterSwitch = getConfig('master_switch', 'true') === 'true';
    if (!masterSwitch) {
      return ctx.reply('⚠️ *Master AI Switch is OFF.* Image generation is suspended.', {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }

    await ctx.replyWithChatAction('upload_photo').catch(() => {});
    const photoPulse = setInterval(() => {
      ctx.replyWithChatAction('upload_photo').catch(() => {});
    }, 3500);

    const statusMsg = await ctx.reply(`🎨 *Generating image...*\n_"${promptText.slice(0, 100)}"_`, {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });

    try {
      const result = await scaleMaxAdapter.generateImage({
        prompt: promptText,
        model: 'gpt-image-2',
      });

      clearInterval(photoPulse);
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});

      await ctx.replyWithPhoto(new InputFile(result.buffer, 'nero_generated.png'), {
        caption: `✨ *Prompt:* ${promptText.slice(0, 250)}\n⚡ *Generated with:* \`gpt-image-2\` (${result.latencyMs}ms)`,
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      clearInterval(photoPulse);
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ *Image Generation Failed*\n\n${err.message}`, {
        parse_mode: 'Markdown',
      });
    }
  };

  // =========================================================================
  // PHASE 3 COMMANDS: SEARCH, BROWSING, IMAGES, VIDEOS, SHOPPING, SAFETY, PDF
  // =========================================================================

  // /search <query> — Advanced Web Research
  bot.command(['search', 'google', 'web'], async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      return ctx.reply('🔍 *Advanced Web Search*\n\nUsage: `/search <query>`\nExample: `/search latest quantum computing breakthroughs 2026`', { parse_mode: 'Markdown' });
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    const searchData = await webSearchService.search(query);
    const synthesis = await webSearchService.synthesizeAnswer(query, searchData);

    let reply = `🔍 *Research Results for:* "${query}"\n\n${synthesis.answer}\n\n`;
    if (synthesis.sources && synthesis.sources.length > 0) {
      reply += `📚 *Verified Sources:*\n`;
      for (const s of synthesis.sources) {
        reply += `• [${s.title}](${s.url}) (${s.source})\n`;
      }
    }
    await ctx.reply(reply, { parse_mode: 'Markdown', link_preview_options: { is_disabled: false } }).catch(() => ctx.reply(reply));
  });

  // /browse <url> — Deep Website Exploration
  bot.command(['browse', 'crawl', 'readsite'], async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
      return ctx.reply('🕸️ *Deep Website Browsing*\n\nUsage: `/browse <url>`\nExample: `/browse https://nodejs.org`', { parse_mode: 'Markdown' });
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    const browseData = await deepBrowserService.deepBrowse(url);
    const report = await deepBrowserService.synthesizeBrowsingReport(browseData);
    await ctx.reply(report, { parse_mode: 'Markdown', link_preview_options: { is_disabled: false } }).catch(() => ctx.reply(report));
  });

  // /safety <url> — Website Scam & Security Risk Analysis
  bot.command(['safety', 'scamcheck', 'isitsafe'], async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
      return ctx.reply('🛡️ *Website Scam & Safety Audit*\n\nUsage: `/safety <url>`\nExample: `/safety https://example.com`', { parse_mode: 'Markdown' });
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    const analysis = await websiteSafetyService.analyzeWebsite(url);
    const report = websiteSafetyService.formatReport(analysis);
    await ctx.reply(report, { parse_mode: 'Markdown' }).catch(() => ctx.reply(report));
  });

  // /video <query> — Video Discovery & Transcript Summary
  bot.command(['video', 'videos', 'tutorial'], async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      return ctx.reply('🎬 *Video Discovery & Transcripts*\n\nUsage: `/video <topic>`\nExample: `/video transformer neural network tutorial`', { parse_mode: 'Markdown' });
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    const searchData = await videoSearchService.searchVideos(query);
    if (!searchData.videos || searchData.videos.length === 0) {
      return ctx.reply(`❌ No videos found for "${query}".`);
    }

    const primaryVideo = searchData.videos[0];
    const summary = await videoSearchService.summarizeVideo(primaryVideo);

    let reply = `🎬 *Video Discovery: [${primaryVideo.title}](${primaryVideo.url})*\n`;
    reply += `📺 Channel: *${primaryVideo.channel}* · ⏱️ Duration: *${primaryVideo.duration}*\n\n`;
    reply += `${summary.summaryText}\n\n`;
    reply += `_${summary.disclaimer}_`;

    await ctx.reply(reply, { parse_mode: 'Markdown', link_preview_options: { is_disabled: false } }).catch(() => ctx.reply(reply));
  });

  // /shop <query> — Product Discovery & Comparison
  bot.command(['shop', 'product', 'deal'], async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      return ctx.reply('🛍️ *Product Discovery & Comparison*\n\nUsage: `/shop <item> [under $amount]`\nExample: `/shop noise cancelling headphones under $150`', { parse_mode: 'Markdown' });
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    const shoppingData = await productSearchService.searchProducts(query);
    const comparison = await productSearchService.compareProducts(query, shoppingData);
    await ctx.reply(comparison, { parse_mode: 'Markdown', link_preview_options: { is_disabled: false } }).catch(() => ctx.reply(comparison));
  });

  // /pdf <query or url> or /pdf_gen <prompt> — Educational Discovery, Download & High-Reasoning Generative PDF Creation
  bot.command(['pdf', 'doc', 'paper', 'notes', 'pdf_gen', 'create_pdf', 'makepdf'], async (ctx) => {
    const input = ctx.match?.trim();
    if (!input) {
      return ctx.reply('📚 *Educational Documents & PDFs*\n\nUsage:\n• `/pdf <topic or url>`: Discover educational PDFs or summarize online documents.\n• `/pdf_gen <topic>`: Generate a multi-page PDF document (up to 50 pages) with high-reasoning structure.\n\nExample: `/pdf_gen 10 pages on AI agents and reasoning frameworks`', { parse_mode: 'Markdown' });
    }

    const cmdText = (ctx.message?.text || '').trim();
    const isExplicitGen = cmdText.startsWith('/pdf_gen') || cmdText.startsWith('/create_pdf') || cmdText.startsWith('/makepdf') || pdfService.isPdfGenerationRequest(input);

    if (isExplicitGen) {
      await ctx.replyWithChatAction('upload_document').catch(() => {});
      try {
        const targetPages = pdfService.extractTargetPages(input);
        const result = await pdfService.generatePdfFromPrompt({
          prompt: input,
          targetPages,
        });
        if (result && result.buffer) {
          return await ctx.replyWithDocument(new InputFile(result.buffer, result.filename), {
            caption: `📄 *${result.title}*\n📊 *Pages:* ${result.pageCount}\n\n${result.summary}`.slice(0, 1024),
            parse_mode: 'Markdown',
            reply_parameters: { message_id: ctx.message.message_id },
          });
        }
      } catch (genErr) {
        console.error('[Telegram PDF Generation Error]:', genErr.message);
        return ctx.reply(`⚠️ Failed to generate PDF document: ${genErr.message}`);
      }
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const doc = await documentService.downloadDocument(input);
      if (!doc.ok) {
        return ctx.reply(`❌ Failed to retrieve document: ${doc.error}`);
      }
      const summary = await documentService.summarizeDocument(doc);
      try {
        await ctx.replyWithDocument(new InputFile(doc.buffer, doc.filename), {
          caption: `📄 *${doc.filename}* (${Math.round(doc.sizeBytes / 1024)} KB)`,
          parse_mode: 'Markdown',
        });
      } catch {}
      await ctx.reply(summary, { parse_mode: 'Markdown' });
    } else {
      const docSearch = await documentService.searchEducationalResources(input);
      let reply = `📚 *Educational Documents Found for:* "${input}"\n\n`;
      if (docSearch.documents && docSearch.documents.length > 0) {
        for (const d of docSearch.documents) {
          reply += `• [${d.title}](${d.url})\n  ${d.snippet.slice(0, 140)}...\n\n`;
        }
        reply += `_Tip: Send \`/pdf <url>\` with any link above to download and summarize it, or \`/pdf_gen <topic>\` to create a new PDF report!_`;
      } else {
        reply += 'No public study documents found matching this query.';
      }
      await ctx.reply(reply, { parse_mode: 'Markdown' });
    }
  });

  // /image, /photo, /draw, /generate commands
  bot.command(['image', 'photo', 'pic', 'draw', 'generate'], async (ctx) => {
    const prompt = ctx.match?.trim();
    if (!prompt) {
      return ctx.reply('🖼️ *Image Discovery & Creation*\n\nUsage: `/image <subject>` or `/draw <art prompt>`\nExample: `/image red panda` or `/draw cyberpunk city in rain`', { parse_mode: 'Markdown' });
    }

    const commandName = ctx.message.text.split(/\s+/)[0].replace(/^\//, '').toLowerCase();
    const isDraw = ['draw', 'generate'].includes(commandName) || /\b(?:cyberpunk|anime|oil\s+painting|digital\s+art|watercolor|render|illustration)\b/i.test(prompt);

    if (!isDraw) {
      // Direct real image search & delivery
      await ctx.replyWithChatAction('upload_photo').catch(() => {});
      const imgRes = await imageSearchService.searchImages(prompt, 1);
      if (imgRes.ok && imgRes.images?.length > 0) {
        const delivered = await imageSearchService.deliverImageToTelegram(ctx, imgRes.images[0], prompt);
        if (delivered) return;
      }
    }

    // Fallback or explicit generative art
    await handleImageGeneration(ctx, prompt);
  });

  // Google Drive & Cloud Storage Commands (Owner Only)
  bot.command(['drive', 'storage'], async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can access cloud storage management.');
    }

    const conn = await googleDriveAdapter.verifyConnection();
    const status = googleDriveAdapter.getStatus();

    let text = `☁️ *NERO LABS — GOOGLE DRIVE & STORAGE*\n\n`;
    text += `• *Status*: ${conn.ok ? '🟢 Operational' : '🟡 Offline'}\n`;
    text += `• *Storage Mode*: \`${conn.mode || status.status}\`\n`;
    text += `• *Account / Target*: \`${status.identifiedAccount}\`\n`;
    text += `• *Capacity Tier*: *5 TB Cloud Tier*\n\n`;

    text += `*Permissions Granted:*\n`;
    text += `• Make Folders: 🟢 YES\n`;
    text += `• Edit / Update Files: 🟢 YES\n`;
    text += `• Delete Files / Folders: 🟢 YES\n`;
    text += `• Database Snapshot Backups: 🟢 YES\n\n`;

    text += `*Available Drive Commands:*\n`;
    text += `• \`/drive_mkdir <name>\` — Create a folder\n`;
    text += `• \`/drive_ls\` — List files & folders\n`;
    text += `• \`/drive_upload <name> <text>\` — Upload / save a file\n`;
    text += `• \`/drive_edit <name_or_id> <text>\` — Edit an existing file\n`;
    text += `• \`/drive_del <name_or_id>\` — Delete file or folder\n`;
    text += `• \`/drive_backup\` — Create instant database backup\n`;

    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // /drive_mkdir <folder_name>
  bot.command('drive_mkdir', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can manage cloud storage.');
    }
    const folderName = ctx.match?.trim();
    if (!folderName) {
      return ctx.reply('Usage: `/drive_mkdir <folder_name>` (e.g. `/drive_mkdir NeroProjects`)', { parse_mode: 'Markdown' });
    }

    try {
      const res = await googleDriveAdapter.createFolder(folderName, null, String(ctx.from.id));
      await ctx.reply(`📁 *Folder Created Successfully!*\n\n• Name: *${res.name}*\n• ID: \`${res.id}\`\n• Storage: ${res.cloud ? '☁️ Google Drive Cloud' : '💾 Local Storage Sandbox'}`, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Failed to create folder: ${err.message}`);
    }
  });


  // /drive_ls
  bot.command('drive_ls', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can view storage contents.');
    }

    try {
      const files = await googleDriveAdapter.listFiles(null, 15);
      if (files.length === 0) {
        return ctx.reply('📂 Storage is currently empty. Use `/drive_mkdir` or `/drive_upload` to create items.', { parse_mode: 'Markdown' });
      }

      let text = `📂 *GOOGLE DRIVE ASSETS* (${files.length} items):\n\n`;
      for (const f of files) {
        const icon = f.isFolder ? '📁' : '📄';
        text += `${icon} *${f.name}*\n   └ ID: \`${f.id}\` | Size: ${f.size}\n`;
      }
      text += `\n_To delete an item: \`/drive_del <id_or_name>\`_`;
      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Failed to list storage: ${err.message}`);
    }
  });


  // /drive_upload <filename> <content>
  bot.command('drive_upload', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can upload files.');
    }

    const parts = (ctx.match?.trim() || '').split(/\s+/);
    const filename = parts[0];
    const content = parts.slice(1).join(' ');

    if (!filename || !content) {
      return ctx.reply('Usage: `/drive_upload <filename.txt> <content>`', { parse_mode: 'Markdown' });
    }

    try {
      const res = await googleDriveAdapter.uploadFile({
        name: filename,
        content,
        mimeType: 'text/plain',
        actorId: String(ctx.from.id),
      });
      await ctx.reply(`📄 *File Uploaded Successfully!*\n\n• Name: *${res.name}*\n• Size: ${res.size} bytes\n• ID: \`${res.id}\`\n• Storage: ${res.cloud ? '☁️ Google Drive Cloud' : '💾 Local Storage Sandbox'}`, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Upload failed: ${err.message}`);
    }
  });


  // /drive_edit <filename_or_id> <new_content>
  bot.command('drive_edit', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can edit files.');
    }

    const parts = (ctx.match?.trim() || '').split(/\s+/);
    const target = parts[0];
    const newContent = parts.slice(1).join(' ');

    if (!target || !newContent) {
      return ctx.reply('Usage: `/drive_edit <file_id_or_name> <new_content>`', { parse_mode: 'Markdown' });
    }

    try {
      const res = await googleDriveAdapter.editFile(target, newContent, 'text/plain', String(ctx.from.id));
      await ctx.reply(`✏️ *File Updated Successfully!*\n\n• Name: *${res.name}*\n• ID: \`${res.id}\`\n• Size: ${res.size} bytes\n• Storage: ${res.cloud ? '☁️ Google Drive Cloud' : '💾 Local Storage Sandbox'}`, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Edit failed: ${err.message}`);
    }
  });


  // /drive_del <name_or_id>
  bot.command('drive_del', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can delete files.');
    }

    const target = ctx.match?.trim();
    if (!target) {
      return ctx.reply('Usage: `/drive_del <file_id_or_name>`', { parse_mode: 'Markdown' });
    }

    try {
      await googleDriveAdapter.deleteFile(target, String(ctx.from.id));
      await ctx.reply(`🗑️ *Deleted Successfully!*\n\n• Asset: \`${target}\` has been permanently removed.`, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Delete failed: ${err.message}`);
    }
  });


  // /drive_backup
  bot.command('drive_backup', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can create backups.');
    }

    await ctx.replyWithChatAction('upload_document').catch(() => {});
    try {
      const res = await googleDriveAdapter.backupDatabase(String(ctx.from.id));
      let msg = `💾 *DATABASE SNAPSHOT BACKUP CREATED*\n\n`;
      msg += `• File: \`${res.filename}\`\n`;
      msg += `• Size: ${Math.round(res.bytes / 1024)} KB\n`;
      msg += `• Google Drive Sync: ${res.driveUploaded ? '🟢 Uploaded' : '⚪ Local Archive Ready'}\n`;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Backup failed: ${err.message}`);
    }
  });


  // /archive_now (Owner or Admin: Force immediate 50-message or pending batch archive)
  bot.command('archive_now', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can trigger manual message archiving.');
    }

    await ctx.replyWithChatAction('upload_document').catch(() => {});
    try {
      const res = await messageArchiver.processBatch(String(ctx.chat.id), true);
      if (!res) {
        return ctx.reply('📂 No pending messages to archive for this chat right now.');
      }

      let msg = `📦 *CONVERSATION BATCH ARCHIVED TO GOOGLE DRIVE*\n\n`;
      msg += `• Messages Processed: *${res.messageCount}*\n`;
      msg += `• Transcript File: \`${res.transcriptFilename}\`\n`;
      msg += `• Summary File: \`${res.summaryFilename}\`\n`;
      msg += `• SHA-256 Checksum: \`${res.checksum.slice(0, 16)}...\`\n`;
      msg += `• Verification Status: 🟢 *Verified on Drive*\n`;

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Archival failed: ${err.message}`);
    }
  });


  // /archivestatus (Owner or Admin: View archiving queue and Drive memory structure)
  bot.command('archivestatus', async (ctx) => {
    const status = messageArchiver.getArchiveStatus(String(ctx.chat.id));
    const driveStatus = googleDriveAdapter.getStatus();

    let text = `📊 *NERO LABS — MEMORY & ARCHIVE STATUS*\n\n`;
    text += `• Chat ID: \`${ctx.chat.id}\`\n`;
    text += `• Pending Unarchived Messages: *${status.unarchivedCount} / 50* (auto-batch at 50)\n`;
    text += `• Total Batches Archived: *${status.totalBatches}*\n`;
    text += `• Cloud Storage Target: *${driveStatus.capacityTarget}*\n`;
    text += `• Storage Folder: \`Nero/Memory/Conversations/${googleDriveAdapter.sanitizeGroupId(ctx.chat.id)}/\`\n\n`;

    if (status.recentBatches.length > 0) {
      text += `*Recent Batches:*\n`;
      for (const b of status.recentBatches.slice(0, 3)) {
        text += `• Batch #${b.id} (${b.message_count} msgs) — Status: 🟢 ${b.status}\n`;
      }
    } else {
      text += `_No completed batches yet. Messages auto-archive every 50 incoming messages, or trigger immediately with /archive_now._\n`;
    }

    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // /setlabel <userId> <He|She|CustomName> (Owner or Admin: Configure participant display label)
  bot.command('setlabel', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      return ctx.reply('⛔ Only the verified bot owner can set participant labels.');
    }

    const parts = (ctx.match?.trim() || '').split(/\s+/);
    const targetUserId = parts[0];
    const label = parts.slice(1).join(' ');

    if (!targetUserId || !label) {
      return ctx.reply('Usage: `/setlabel <userId> <He|She|DisplayName>` (e.g. `/setlabel 8685232094 He`)', { parse_mode: 'Markdown' });
    }

    const isGender = ['he', 'she'].includes(label.toLowerCase());
    registerGroupParticipant(
      String(ctx.chat.id),
      targetUserId,
      isGender ? 'Participant' : label,
      isGender ? label : 'unknown'
    );

    await ctx.reply(`🏷️ Updated label for user \`${targetUserId}\`: *${label}* in group transcripts.`, { parse_mode: 'Markdown' });
  });

  // /savedrive (Reply to a photo to save it directly to Google Drive)
  bot.command('savedrive', async (ctx) => {
    const photo = ctx.message.reply_to_message?.photo;
    if (!photo || photo.length === 0) {
      return ctx.reply('Reply to an image with `/savedrive` to store it in Google Drive memory.', { parse_mode: 'Markdown' });
    }

    const largest = photo[photo.length - 1];
    await ctx.replyWithChatAction('upload_photo').catch(() => {});

    try {
      const res = await visionService.saveImageToDrive({
        ctx,
        photoFileId: largest.file_id,
        caption: ctx.message.reply_to_message.caption || '',
        actorId: String(ctx.from.id),
      });

      let text = `🖼️ *Image Saved to Google Drive!*\n\n`;
      text += `• File: \`${res.filename}\`\n`;
      text += `• Storage: ${res.driveResult.cloud ? '☁️ Google Drive Cloud' : '💾 Local Storage Sandbox'}\n`;
      text += `• Folder: \`Nero/Memory/Attachments/${googleDriveAdapter.sanitizeGroupId(ctx.chat.id)}/\`\n`;
      if (res.analysis?.description) {
        text += `• Content: _${res.analysis.description.slice(0, 180)}..._\n`;
      }

      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Failed to save image: ${err.message}`);
    }
  });


  // /getimage <query> (Retrieve a saved Drive image)
  bot.command('getimage', async (ctx) => {
    const query = ctx.match?.trim() || '';
    await ctx.replyWithChatAction('upload_photo').catch(() => {});
    await visionService.findAndSendSavedImage(ctx, query);
  });

  // /memory <query> (Search persistent memory records)
  bot.command('memory', async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      return ctx.reply('Usage: `/memory <topic_or_keyword>` (e.g. `/memory plan`, `/memory meeting`)', { parse_mode: 'Markdown' });
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    const result = await memoryRetriever.answerHistoricalQuestion(String(ctx.chat.id), query);
    await ctx.reply(result.answer, {
      reply_parameters: { message_id: ctx.message.message_id },
      ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
    });
  });

  // Multimodal Photo Handler (Master Overhaul: Direct Intake Acknowledgment & Follow-Up Context)
  bot.on('message:photo', async (ctx) => {
    const isPrivate = ctx.chat.type === 'private';
    const caption = ctx.message.caption || '';
    const userId = ctx.from?.id;
    const chatId = String(ctx.chat.id);
    const userIsOwner = isOwner(userId);
    const largestPhoto = ctx.message.photo[ctx.message.photo.length - 1];

    // 0. Maintenance Mode Gate
    if (isMaintenanceModeActive() && !userIsOwner) {
      if (isPrivate) {
        return ctx.reply(MAINTENANCE_ANNOUNCEMENT_TEXT);
      }
      return; // Silent in groups while maintenance is active
    }

    // In groups, evaluate invocation or direct address (Quiet Group Member)
    if (!isPrivate) {
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me?.id;
      const mentionRegex = new RegExp(`@?${ctx.me?.username}\\b`, 'i');
      const isMentioned = mentionRegex.test(caption);
      const isNamed = /\bnero\b/i.test(caption);
      const isCommand = /save|drive|explain|read|what\s+is|look|describe|ocr/i.test(caption);

      if (!isReplyToBot && !isMentioned && !isNamed && !isCommand) {
        return; // Silent observation & archival in raw_messages
      }
    }

    // Download and cache image in conversation context for follow-up questions
    let photoBuffer = null;
    try {
      const downloaded = await visionService.downloadTelegramFile(ctx.api, largestPhoto.file_id);
      photoBuffer = downloaded.buffer;
      visionService.setRecentImage(chatId, {
        fileId: largestPhoto.file_id,
        buffer: photoBuffer,
        mimeType: 'image/jpeg',
      });
    } catch (err) {
      console.warn('[PhotoHandler] Cache download error:', err.message);
    }

    // Clean caption
    const cleanPrompt = caption
      .replace(new RegExp(`@?${ctx.me?.username}\\b`, 'gi'), '')
      .replace(/\bnero\b/gi, '')
      .trim();

    // 1. If user sent image without a specific question or command, acknowledge receipt exactly as required
    if (!cleanPrompt || cleanPrompt.length === 0 || /^(hi|hey|hello|look)$/i.test(cleanPrompt)) {
      return ctx.reply('🖼️ Image received! What would you like to know about it?', {
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    }

    // 2. Save image to Google Drive if requested
    if (/save|drive/i.test(cleanPrompt)) {
      await ctx.replyWithChatAction('upload_photo').catch(() => {});
      try {
        const saved = await visionService.saveImageToDrive({
          ctx,
          photoFileId: largestPhoto.file_id,
          caption: cleanPrompt,
          actorId: String(userId),
        });

        let replyMsg = `🖼️ *Image Saved to Google Drive!*\n\n`;
        replyMsg += `• File: \`${saved.filename}\`\n`;
        replyMsg += `• Folder: \`Nero/Memory/Attachments/${googleDriveAdapter.sanitizeGroupId(chatId)}/\`\n`;
        replyMsg += `• Storage: ${saved.driveResult.cloud ? '☁️ Google Drive Cloud' : '💾 Local Storage Sandbox'}\n`;
        if (saved.analysis.description) {
          replyMsg += `• Description: _${saved.analysis.description.slice(0, 180)}..._\n`;
        }
        replyMsg += `\n_You can retrieve this anytime by asking: "Nero, send that saved image here"_`;

        return ctx.reply(replyMsg, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
          ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
        });
      } catch (err) {
        return ctx.reply(`⚠️ Could not save image to Drive: ${err.message}`, {
          reply_parameters: { message_id: ctx.message.message_id },
          ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
        });
      }
    }

    // 3. Otherwise analyze image with multimodal vision model
    await ctx.replyWithChatAction('typing').catch(() => {});
    try {
      const buffer = photoBuffer || (await visionService.downloadTelegramFile(ctx.api, largestPhoto.file_id)).buffer;
      const analysis = await visionService.analyzeImage({
        buffer,
        prompt: cleanPrompt,
        chatId,
      });

      let replyDesc = analysis.description;
      const tusageEnabled = getConfig('tusage_global', 'false') === 'true' || getConfig(`tusage_chat_${chatId}`, 'false') === 'true';
      if (tusageEnabled && analysis.usage) {
        const promptTok = analysis.usage.prompt_tokens ?? 0;
        const compTok = analysis.usage.completion_tokens ?? 0;
        const totalTok = analysis.usage.total_tokens ?? (promptTok + compTok);
        const lat = analysis.latencyMs ? `${analysis.latencyMs}ms` : '';
        const modelLabel = analysis.model || 'gpt-6-luna';
        replyDesc += `\n\n📊 [Token Usage: ${compTok} output tokens (${promptTok} in / ${totalTok} total) • ${modelLabel}${lat ? ' • ' + lat : ''}]`;
      }

      return ctx.reply(replyDesc, {
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    } catch (err) {
      return ctx.reply(`⚠️ Image understanding note: ${err.message}`, {
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    }
  });


  // Non-Photo Media Handlers (Voice, Audio, Stickers, Documents, GIFs)
  const nonPhotoMedia = ['message:voice', 'message:audio', 'message:sticker', 'message:animation', 'message:document'];
  bot.on(nonPhotoMedia, async (ctx) => {
    const isPrivate = ctx.chat.type === 'private';
    const userId = ctx.from?.id;

    // Maintenance Mode Gate
    if (isMaintenanceModeActive() && !isOwner(userId)) {
      if (isPrivate) {
        return ctx.reply(MAINTENANCE_ANNOUNCEMENT_TEXT);
      }
      return;
    }

    if (!isPrivate) {
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me?.id;
      if (!isReplyToBot) {
        return; // Silent
      }
    }

    // 📄 High-Reasoning PDF Analysis for incoming Telegram documents
    if (ctx.message.document && (ctx.message.document.mime_type === 'application/pdf' || ctx.message.document.file_name?.toLowerCase().endsWith('.pdf'))) {
      await ctx.replyWithChatAction('typing').catch(() => {});
      try {
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token || config.telegramBotToken}/${file.file_path}`;
        const resp = await fetch(fileUrl);
        const buffer = Buffer.from(await resp.arrayBuffer());
        const docName = ctx.message.document.file_name || 'document.pdf';
        const userQuery = ctx.message.caption || 'Provide a comprehensive executive summary and analytical breakdown of this document.';
        const analysis = await pdfService.analyzePdf({
          buffer,
          userQuery,
          filename: docName,
        });
        return await ctx.reply(`📄 *[PDF Analysis: ${docName}]*\n\n${analysis.summary || analysis.analysisText}\n\n_Pages analyzed: ${analysis.pages || analysis.pageCount}_`, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        });
      } catch (pdfErr) {
        console.error('[Telegram PDF Analysis Error]:', pdfErr.message);
        return ctx.reply(`⚠️ Failed to analyze PDF document: ${pdfErr.message}`);
      }
    }

    let mediaTypeLabel = 'file';
    if (ctx.message.voice) mediaTypeLabel = 'voice note 🎙️';
    else if (ctx.message.audio) mediaTypeLabel = 'audio track 🎵';
    else if (ctx.message.sticker) mediaTypeLabel = 'sticker ✨';
    else if (ctx.message.animation) mediaTypeLabel = 'GIF 🎬';
    else if (ctx.message.document) mediaTypeLabel = 'document 📄';

    const reply = `I received your ${mediaTypeLabel}! I continuously log conversation records for group memory. If you have questions, need images explained, or want historical searches, feel free to ask! 💖`;
    await ctx.reply(reply, {
      reply_parameters: { message_id: ctx.message.message_id },
      ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
    });
  });

  // Main Text Message Handler
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      if (isPrivate) {
        return safeReply(ctx, "⚠️ Unrecognized command. Send /help to view all available commands, or just chat with me directly! ✨", {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
      return; // Ignore unhandled slash commands in groups
    }

    const chatId = ctx.chat.id;
    const isPrivate = ctx.chat.type === 'private';
    const userId = ctx.from?.id;
    const userIsOwner = isOwner(userId);

    // 0a. Maintenance Mode Gate (Pauses normal replies when /edit_mode or maintenance is active)
    if (isMaintenanceModeActive() && !userIsOwner) {
      if (isPrivate) {
        return ctx.reply(MAINTENANCE_ANNOUNCEMENT_TEXT);
      }
      return; // Silent in groups while maintenance is active
    }

    // 0b. Assistant Mode Check (Only when explicitly enabled by owner)
    if (isPrivate && !userIsOwner && assistantManager.isEnabled()) {
      const inboxRes = await assistantManager.processIncomingMessage({
        senderId: userId,
        senderName: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' '),
        senderUsername: ctx.from?.username,
        messageText: text,
        botApi: ctx.api,
      });

      if (inboxRes.autoReplyText) {
        return ctx.reply(inboxRes.autoReplyText, {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
      return; // Message recorded; owner alerted in private chat
    }

    // 0c. Owner Natural Language Direct Action Dispatcher (Sandy's Instant Execution)
    if (userIsOwner) {
      const dispatched = await tryExecuteOwnerIntent(ctx, text, isPrivate);
      if (dispatched) {
        return; // Executed directly without needing slash commands
      }
    }

    // 📥 FAST-PATH 1: Universal Highest Quality Media Downloader (MP3 / MP4)
    const mediaUrl = mediaDownloaderService.extractMediaUrl(text);
    const downloadIntent = mediaDownloaderService.hasDownloadIntent(text);
    const pendingSession = pendingDownloadSessionsTelegram.get(userId);

    // If download intent or ongoing download session
    if (mediaUrl && (downloadIntent.hasIntent || pendingSession)) {
      pendingDownloadSessionsTelegram.delete(userId);
      const targetFormat = downloadIntent.preferredFormat || pendingSession?.format || 'mp4';
      await ctx.replyWithChatAction(targetFormat === 'mp3' ? 'upload_voice' : 'upload_video').catch(() => {});

      const dlResult = await mediaDownloaderService.downloadMedia(mediaUrl, {
        format: targetFormat,
        quality: 'highest',
      });

      if (dlResult.ok && dlResult.buffer) {
        try {
          if (dlResult.format === 'mp3') {
            return await ctx.replyWithAudio(new InputFile(dlResult.buffer, dlResult.filename || 'audio.mp3'), {
              caption: `🎵 *${dlResult.title}* (${dlResult.platform.toUpperCase()})\n\n_Delivered in highest available quality MP3 by Rocket!_ 🚀`,
              parse_mode: 'Markdown',
              reply_parameters: { message_id: ctx.message.message_id },
            });
          } else {
            return await ctx.replyWithVideo(new InputFile(dlResult.buffer, dlResult.filename || 'video.mp4'), {
              caption: `🎬 *${dlResult.title}* (${dlResult.platform.toUpperCase()})\n\n_Delivered in highest available quality MP4 by Rocket!_ 🚀`,
              parse_mode: 'Markdown',
              reply_parameters: { message_id: ctx.message.message_id },
            });
          }
        } catch (mediaSendErr) {
          console.warn('[Telegram Fast-Path Media Send Failed]:', mediaSendErr.message);
        }
      } else if (dlResult.downloadUrl) {
        return await safeReply(ctx, `📥 *Download Ready:*\n\nFile exceeds direct Telegram upload limit. Download directly here:\n👉 ${dlResult.downloadUrl}`, {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
    }

    // Fast-Path "Ask Link and Done" Flow
    if (!mediaUrl && downloadIntent.hasIntent) {
      pendingDownloadSessionsTelegram.set(userId, {
        format: downloadIntent.preferredFormat || 'mp4',
        timestamp: Date.now(),
      });
      const askMsg = userIsOwner
        ? "Haan Boss! Bas link phenko (YouTube, Instagram, Facebook, ya Vero) aur batao MP3 chahiye ya MP4 — baaki Rocket turant download karke de dega! 🦝🚀"
        : "Sure! Please share the link to the Reel, Short, or Video (YouTube, Instagram, Facebook, Vero) and whether you want MP3 audio or MP4 video, and I'll download it for you! ✨";
      return await safeReply(ctx, askMsg, {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }

    // 🎬 FAST-PATH 2: Universal Social Media Reel & Shorts Inspection
    if (mediaUrl && (socialInspectorService.isSocialInspectionQuery(text) || !downloadIntent.hasIntent)) {
      const inspectRes = await socialInspectorService.inspectMedia(mediaUrl);
      if (inspectRes.ok) {
        const card = socialInspectorService.formatInspectionCard(inspectRes, userIsOwner);
        if (inspectRes.thumbnailUrl) {
          try {
            const dl = await imageSearchService.downloadImageBuffer(inspectRes.thumbnailUrl, 8000);
            if (dl && dl.buffer) {
              return await ctx.replyWithPhoto(new InputFile(dl.buffer, 'thumbnail.jpg'), {
                caption: card.slice(0, 1024),
                parse_mode: 'Markdown',
                reply_parameters: { message_id: ctx.message.message_id },
              });
            }
          } catch {}
        }
        return await safeReply(ctx, card, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
    }

    // 0d. Image Context Follow-Up (Visual Q&A, OCR, Image-to-Prompt, Future Editing Disclaimers)
    const recentImage = visionService.getRecentImage(chatId);
    if (recentImage && !text.startsWith('/')) {
      // Future image editing disclaimer (Strictly honest, zero fake pipeline)
      if (/\b(?:edit\s+this\s+image|edit\s+the\s+image|photoshop|change\s+the\s+color|remove\s+background|add\s+filter|modify\s+the\s+image)\b/i.test(text)) {
        return ctx.reply(
          '🎨 *Image Editing Pipeline Notice*:\n\nImage editing is currently a planned future pipeline and is not yet available in the live system. You can ask me to:\n• Describe or answer questions about the image\n• Extract/transcribe text (OCR)\n• Generate a detailed generative prompt from this image!',
          { parse_mode: 'Markdown', reply_parameters: { message_id: ctx.message.message_id } }
        );
      }

      // OCR / Text extraction
      if (/\b(?:extract\s+text|read\s+text|ocr|what\s+does\s+it\s+say|transcribe\s+text|text\s+in\s+image)\b/i.test(text)) {
        await ctx.replyWithChatAction('typing').catch(() => {});
        const ocrAnalysis = await visionService.analyzeImage({
          buffer: recentImage.buffer,
          prompt: 'Extract and transcribe all visible text, numbers, headings, and labels from this image with high accuracy.',
          chatId: String(chatId),
        });
        return ctx.reply(`📝 *Text Extracted from Image*:\n\n${ocrAnalysis.description}`, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        }).catch(() => ctx.reply(ocrAnalysis.description));
      }

      // Image to Prompt Generation
      if (/\b(?:create\s+a\s+prompt|make\s+a\s+prompt|image\s+to\s+prompt|prompt\s+from\s+this\s+image|prompt\s+for\s+midjourney|prompt\s+for\s+this)\b/i.test(text)) {
        await ctx.replyWithChatAction('typing').catch(() => {});
        const promptAnalysis = await visionService.analyzeImage({
          buffer: recentImage.buffer,
          prompt: 'Analyze this image and write a detailed, high-aesthetic text-to-image generation prompt suitable for Midjourney v6, Stable Diffusion, or Imagen 3.',
          chatId: String(chatId),
        });
        return ctx.reply(`🎨 *Generated Image Prompt*:\n\n\`${promptAnalysis.description}\``, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        }).catch(() => ctx.reply(promptAnalysis.description));
      }

      // Explicit image question (e.g., "what color is it", "who is in this picture", "explain this image")
      if (/\b(?:in\s+the\s+image|in\s+this\s+picture|on\s+the\s+image|the\s+picture|the\s+photo|describe\s+it|what\s+is\s+in\s+it|tell\s+me\s+about\s+it)\b/i.test(text)) {
        await ctx.replyWithChatAction('typing').catch(() => {});
        const followUpAnalysis = await visionService.analyzeImage({
          buffer: recentImage.buffer,
          prompt: text,
          chatId: String(chatId),
        });
        return ctx.reply(followUpAnalysis.description, {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
    }

    // =========================================================================
    // PHASE 3: NATURAL LANGUAGE INTENT DISPATCHER
    // =========================================================================

    // 0e. Website Safety / Scam Check
    if (websiteSafetyService.isSafetyQuery(text)) {
      const targetUrl = websiteSafetyService.extractUrl(text);
      if (targetUrl) {
        await ctx.replyWithChatAction('typing').catch(() => {});
        const analysis = await websiteSafetyService.analyzeWebsite(targetUrl);
        const report = websiteSafetyService.formatReport(analysis);
        return ctx.reply(report, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        }).catch(() => ctx.reply(report));
      }
    }

    // 0f. Direct Real Image Search & Telegram Delivery
    if (imageSearchService.isVisualQuery(text)) {
      const subject = imageSearchService.extractImageQuery(text);
      if (subject && subject.length >= 2) {
        await ctx.replyWithChatAction('upload_photo').catch(() => {});
        const imgRes = await imageSearchService.searchImages(subject, 1);
        if (imgRes.ok && imgRes.images?.length > 0) {
          const delivered = await imageSearchService.deliverImageToTelegram(ctx, imgRes.images[0], text);
          if (delivered) return;
        }
      }
    }

    // 0g. Deep Website Browsing
    const browseMatch = text.match(/^(?:please\s+)?(?:browse|read|explore|crawl|summarize)\s+(?:the\s+)?(?:website|site|url|page)?\s*(https?:\/\/[^\s]+)/i);
    if (browseMatch && browseMatch[1]) {
      const targetUrl = browseMatch[1].trim();
      await ctx.replyWithChatAction('typing').catch(() => {});
      const browseData = await deepBrowserService.deepBrowse(targetUrl);
      const report = await deepBrowserService.synthesizeBrowsingReport(browseData, text);
      return ctx.reply(report, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      }).catch(() => ctx.reply(report));
    }

    // 0h. Video Discovery
    if (videoSearchService.isVideoQuery(text)) {
      const queryMatch = text.replace(/^(?:please\s+)?(?:find|search|show|get)\s+(?:me\s+)?(?:a\s+)?videos?\s+(?:on|about|for)?\s*/i, '').trim();
      if (queryMatch.length >= 3) {
        await ctx.replyWithChatAction('typing').catch(() => {});
        const vRes = await videoSearchService.searchVideos(queryMatch, 1);
        if (vRes.ok && vRes.videos?.length > 0) {
          const primary = vRes.videos[0];
          const summary = await videoSearchService.summarizeVideo(primary);
          let reply = `🎬 *Video Discovery: [${primary.title}](${primary.url})*\n`;
          reply += `📺 Channel: *${primary.channel}* · ⏱️ Duration: *${primary.duration}*\n\n`;
          reply += `${summary.summaryText}\n\n`;
          reply += `_${summary.disclaimer}_`;
          return ctx.reply(reply, {
            parse_mode: 'Markdown',
            reply_parameters: { message_id: ctx.message.message_id },
            link_preview_options: { is_disabled: false },
          }).catch(() => ctx.reply(reply));
        }
      }
    }

    // 0i. Shopping & Product Discovery
    if (productSearchService.isShoppingQuery(text)) {
      const budget = productSearchService.extractBudget(text);
      const prodQuery = text.replace(/^(?:please\s+)?(?:find|search|compare|recommend|buy|shop)\s+(?:me\s+)?(?:a\s+|the\s+)?(?:best\s+)?/i, '').trim();
      if (prodQuery.length >= 3) {
        await ctx.replyWithChatAction('typing').catch(() => {});
        const shopData = await productSearchService.searchProducts(prodQuery, { budget });
        const comparison = await productSearchService.compareProducts(text, shopData);
        return ctx.reply(comparison, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
          link_preview_options: { is_disabled: false },
        }).catch(() => ctx.reply(comparison));
      }
    }

    // 0j. Educational Document / PDF Direct Link
    if (documentService.isDocumentQuery(text)) {
      const urlInText = text.match(/https?:\/\/[^\s]+\.(pdf|docx|txt)/i);
      if (urlInText) {
        await ctx.replyWithChatAction('upload_document').catch(() => {});
        const doc = await documentService.downloadDocument(urlInText[0]);
        if (doc.ok) {
          const summary = await documentService.summarizeDocument(doc, text);
          try {
            await ctx.replyWithDocument(new InputFile(doc.buffer, doc.filename), {
              caption: `📄 *${doc.filename}* (${Math.round(doc.sizeBytes / 1024)} KB)`,
              parse_mode: 'Markdown',
            });
          } catch {}
          return ctx.reply(summary, { parse_mode: 'Markdown' });
        }
      }
    }

    // 0j-2. Generative Multi-Page PDF Creation (up to 50 pages, High Reasoning)
    if (pdfService.isPdfGenerationRequest(text)) {
      await ctx.replyWithChatAction('upload_document').catch(() => {});
      try {
        const targetPages = pdfService.extractTargetPages(text);
        const result = await pdfService.generatePdfFromPrompt({
          prompt: text,
          targetPages,
        });
        if (result && result.buffer) {
          return await ctx.replyWithDocument(new InputFile(result.buffer, result.filename), {
            caption: `📄 *${result.title}*\n📊 *Pages:* ${result.pageCount}\n\n${result.summary}`.slice(0, 1024),
            parse_mode: 'Markdown',
            reply_parameters: { message_id: ctx.message.message_id },
          });
        }
      } catch (genErr) {
        console.error('[Telegram PDF Generation Error]:', genErr.message);
        return ctx.reply(`⚠️ Failed to generate PDF document: ${genErr.message}`);
      }
    }

    // 0k. Explicit Natural Web Search
    const searchMatch = text.match(/^(?:please\s+)?(?:search|look\s+up|google|search\s+the\s+web)\s+(?:for\s+)?(.+)/i);
    if (searchMatch && searchMatch[1] && searchMatch[1].trim().length >= 3) {
      const q = searchMatch[1].trim();
      await ctx.replyWithChatAction('typing').catch(() => {});
      const sData = await webSearchService.search(q);
      const synthesis = await webSearchService.synthesizeAnswer(q, sData);
      let reply = `🔍 *Search Results for:* "${q}"\n\n${synthesis.answer}\n\n`;
      if (synthesis.sources?.length > 0) {
        reply += `📚 *Sources:*\n`;
        for (const s of synthesis.sources) {
          reply += `• [${s.title}](${s.url}) (${s.source})\n`;
        }
      }
      return ctx.reply(reply, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
        link_preview_options: { is_disabled: false },
      }).catch(() => ctx.reply(reply));
    }

    // Natural Language Command Execution (Requirement 5)
    // A. Custom Calling Name ("call me Sandy", "my name is Sandy", "I am Sandy", "remember me as Sandy", "mera naam Sandy hai", etc.)
    const nameMatch = text.match(/^(?:please\s+)?(?:call\s+me|my\s+name\s+is|set\s+my\s+name\s+to|i\s+am|i'm|remember\s+my\s+name\s+as|remember\s+me\s+as)\s+([a-zA-Z0-9_\s]{2,30})[\.!\?]?$/i) ||
                      text.match(/^(?:mera\s+naam)\s+([a-zA-Z0-9_\s]{2,30})\s+(?:hai)[\.!\?]?$/i) ||
                      text.match(/^(?:mujhe)\s+([a-zA-Z0-9_\s]{2,30})\s+(?:bulao|bolo)[\.!\?]?$/i);
    if (nameMatch && nameMatch[1]) {
      const rawName = nameMatch[1].trim().replace(/[\.!\?,]+$/, '');
      if (rawName.length >= 2 && !/^(here|ready|online|back|thinking|sorry|not|going|doing|tired|happy|sad|fine|good|okay|ok)$/i.test(rawName)) {
        setUserCustomName(userId, rawName);
        addDurableMemory(chatId, 'user_identity', 'User Name', `User's name is ${rawName}`);
        const roleDef = getRoleDefinition(getActiveUserIdentity(chatId, userId).relationshipRole);
        return ctx.reply(`✏️ *Custom Name Saved & Remembered!*\n\nI will always remember and call you *"${rawName}"* everywhere until you change it! 💖`, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
    }

    // B. Relationship Roleplay ("set my role to sister", "set role brother", "be my sister", "you are my sister", "meri didi ban jao", etc.)
    const roleMatch = text.match(/^(?:please\s+)?(?:set\s+my\s+role\s+to|set\s+role\s+(?:to\s+)?|i\s+want\s+to\s+be\s+(?:your\s+)?|be\s+my|you\s+are\s+my|you're\s+my|meri|mere)\s+(brother|sister|friend|bestie|mother|father|daughter|son|mentor|partner|creator|bhai|bhaiya|bro|didi|sis|behan|maa|mom|papa|dad|beta|beti|dost|yaar)[\.!\?]?\b/i) ||
                      text.match(/^(?:meri|mere)\s+(bhai|bhaiya|didi|behan|dost|sister|brother)\s+(?:ban\s+jao|bano)[\.!\?]?$/i);
    if (roleMatch && roleMatch[1]) {
      const targetRole = normalizeRole(roleMatch[1]);
      setUserRelationshipRole(userId, targetRole);
      addDurableMemory(chatId, 'user_identity', 'Relationship Role', `Nero's relationship with user is ${targetRole}`);
      const roleDef = getRoleDefinition(targetRole);
      const ident = getActiveUserIdentity(chatId, userId);
      const callingName = ident.customName || ctx.from?.first_name || 'Friend';
      return ctx.reply(
        `✨ *Roleplay Updated & Remembered!*\n\n${callingName}, you are now registered as Nero's ${roleDef.emoji} *${roleDef.label}* (${roleDef.hindiAlias})!\n\n• _${roleDef.description}_\n\nI will remember this permanently until you change your role! 💖`,
        {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        }
      );
    }

    // C. Natural Language Start/Stop Chat
    if (/^(?:start\s+chat|turn\s+on\s+chat|enable\s+chat|bol|unmute)$/i.test(text.trim())) {
      setConfig(`text_mode_${chatId}`, 'on');
      setConfig(`chatmode_${chatId}`, 'all');
      if (!isPrivate) {
        toggleGroup(chatId, true);
        setGlobalGroupParticipation(true);
      }
      const keyboard = buildGroupControlKeyboard(chatId);
      return ctx.reply('🟢 *Start Chat Activated!*\n\nRocket is now actively reading and replying to all text messages in this chat!', {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }

    if (/^(?:stop\s+chat|turn\s+off\s+chat|quiet\s+mode|chup|chup\s+hoja|shut\s+up|mute)$/i.test(text.trim())) {
      setConfig(`text_mode_${chatId}`, 'off');
      setConfig(`chatmode_${chatId}`, 'mention');
      const keyboard = buildGroupControlKeyboard(chatId);
      return ctx.reply('⚪ *Stop Chat Activated!*\n\nRocket is in quiet mode. Call *"Rocket"* or reply to me anytime to get an answer!', {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }

    // D. Natural Language Security Diagnostic
    if (/^(?:check\s+security|run\s+security\s+(?:scan|diagnostic)|security\s+audit)$/i.test(text) && userIsOwner) {
      await ctx.replyWithChatAction('typing').catch(() => {});
      const diag = await securitySupervisor.runSecurityDiagnostic();
      return ctx.reply(`🛡️ *Security Status: ${diag.status}*\n\n• Supervisor: \`${diag.supervisor}\`\n• Findings: ${diag.findingsCount}\n• Provider: \`${diag.providerStatus}\``, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }

    // E. Natural Language MCP Status
    if (/^(?:check\s+mcp|mcp\s+status|mcp\s+bridge)$/i.test(text)) {
      const status = getMcpStatus();
      return ctx.reply(`🔌 *MCP Bridge Status*: ${status.bridgeAvailable ? '🟢 Online' : '🔴 Offline'}\n• Active Connections: \`${status.activeConnections} / ${status.maxConnections}\`\n• Available Tools: \`${status.toolCount}\``, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }

    // F. Destructive action requiring two-phase interactive confirmation
    if (/^(?:wipe\s+all\s+data|wipe\s+database|revoke\s+all\s+data|delete\s+all\s+memory)$/i.test(text) && userIsOwner) {
      const confirmKeyboard = new InlineKeyboard()
        .text('🔴 Yes, Wipe Local Data', 'confirm_wipe_data')
        .text('⚪ Cancel', 'cancel_wipe_data');
      return ctx.reply(
        '⚠️ *DESTRUCTIVE ACTION CONFIRMATION REQUIRED*\n\nYou requested a complete wipe of all local conversation memory, tokens, and temporary files.\n\nAre you sure you want to proceed?',
        {
          parse_mode: 'Markdown',
          reply_markup: confirmKeyboard,
          reply_parameters: { message_id: ctx.message.message_id },
        }
      );
    }

    // G. Natural Language Reasoning Setting ("set reasoning to low", "reasoning high", "change reasoning to none")
    const reasoningMatch = text.match(/^(?:please\s+)?(?:set|change|make|switch|update)?\s*reasoning(?:\s+effort|\s+level)?\s*(?:to\s+|=|\:)?\s*(none|low|medium|med|high|xhigh|max)$/i);
    if (reasoningMatch && reasoningMatch[1]) {
      if (!userIsOwner) {
        return ctx.reply('⛔ Only the verified bot owner/creator can adjust AI reasoning effort.', {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
      let rLevel = reasoningMatch[1].toLowerCase();
      if (rLevel === 'med') rLevel = 'medium';
      setConfig('reasoning_effort', rLevel);
      try {
        updateAgentRouting('chat', { reasoning: rLevel });
      } catch {}
      logAudit(ctx.from.id, 'REASONING_EFFORT_CHANGED', `Changed reasoning effort to ${rLevel} via text command`);
      return ctx.reply(
        `🧠 *Reasoning Effort Saved Permanently!*\n\nReasoning level is now set to: *${rLevel.toUpperCase()}* across Luna-Chat and runtime configuration.\n\nThis setting is saved forever in the database.`,
        {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        }
      );
    }

    // H. Natural Language Dual-Tier Length Limits ("set global limit 10 100", "set dev limit 1 500", "global limit 10 100")
    const limitMatch = text.match(/^(?:please\s+)?(?:set\s+)?(?:word\s+|length\s+|character\s+)?limit\s+(global|dev|creator)\s+(\d+)\s+(\d+)$/i) ||
                       text.match(/^(?:please\s+)?(?:set\s+)?(global|dev|creator)\s+(?:word\s+|length\s+|character\s+)?limit\s+(?:to\s+)?(\d+)\s+(?:to\s+)?(\d+)$/i);
    if (limitMatch) {
      if (!userIsOwner) {
        return ctx.reply('⛔ Only the verified bot owner/creator can configure response limits.', {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
      const tier = limitMatch[1].toLowerCase();
      const minVal = parseInt(limitMatch[2], 10);
      const maxVal = parseInt(limitMatch[3], 10);
      if (minVal >= 1 && maxVal >= minVal) {
        if (tier === 'global') {
          setConfig('limit_global_min', String(minVal));
          setConfig('limit_global_max', String(maxVal));
          logAudit(ctx.from.id, 'LIMIT_GLOBAL_CHANGED', `Changed global limits to ${minVal}-${maxVal} words via text`);
          return ctx.reply(
            `🌐 *Global Public Word Limits Updated Permanently*\n\n• Minimum: *${minVal}* words\n• Maximum: *${maxVal}* words\n\nApplies to all public groups and users. Saved forever in database.`,
            { parse_mode: 'Markdown', reply_parameters: { message_id: ctx.message.message_id } }
          );
        } else {
          setConfig('limit_dev_min', String(minVal));
          setConfig('limit_dev_max', String(maxVal));
          logAudit(ctx.from.id, 'LIMIT_DEV_CHANGED', `Changed dev limits to ${minVal}-${maxVal} words via text`);
          return ctx.reply(
            `👑 *Creator / Dev Exclusive Limits Updated Permanently*\n\n• Minimum: *${minVal}* words\n• Maximum: *${maxVal}* words\n\nExclusive for you (Sandy) for testing & code diagnostics. Saved forever in database.`,
            { parse_mode: 'Markdown', reply_parameters: { message_id: ctx.message.message_id } }
          );
        }
      }
    }

    // I. Natural Language Token Usage Mode ("tusage on", "turn on tusage", "token mode on")
    if (/^(?:please\s+)?(?:turn\s+on\s+tusage|enable\s+tusage|tusage\s+on|token\s+mode\s+on|show\s+tokens\s+on)$/i.test(text)) {
      setConfig(`tusage_chat_${chatId}`, 'true');
      return ctx.reply(
        `📊 *Token Usage Mode: 🟢 ENABLED*\n\nNero will now report output tokens used from your key, input, total tokens, model, and latency on every reply in this chat.`,
        { parse_mode: 'Markdown', reply_parameters: { message_id: ctx.message.message_id } }
      );
    }
    if (/^(?:please\s+)?(?:turn\s+off\s+tusage|disable\s+tusage|tusage\s+off|token\s+mode\s+off|show\s+tokens\s+off)$/i.test(text)) {
      setConfig(`tusage_chat_${chatId}`, 'false');
      return ctx.reply(
        `📊 *Token Usage Mode: ⚪ DISABLED*\n\nToken metrics will no longer be appended in this chat.`,
        { parse_mode: 'Markdown', reply_parameters: { message_id: ctx.message.message_id } }
      );
    }

    // 1. Check if replying to an image with "save this image"
    if (ctx.message.reply_to_message?.photo && /save\s+(?:this\s+)?image|save\s+to\s+drive|\/savedrive/i.test(text)) {
      const photos = ctx.message.reply_to_message.photo;
      const largest = photos[photos.length - 1];
      await ctx.replyWithChatAction('upload_photo').catch(() => {});
      try {
        const saved = await visionService.saveImageToDrive({
          ctx,
          photoFileId: largest.file_id,
          caption: text,
          actorId: String(userId),
        });
        return ctx.reply(`🖼️ *Image Saved to Google Drive!*\n\n• File: \`${saved.filename}\`\n• Folder: \`Nero/Memory/Attachments/${googleDriveAdapter.sanitizeGroupId(chatId)}/\`\n• Storage: ${saved.driveResult.cloud ? '☁️ Google Drive Cloud' : '💾 Local Storage Sandbox'}\n• Description: _${saved.analysis.description.slice(0, 180)}..._`, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
          ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
        });
      } catch (err) {
        return ctx.reply(`⚠️ Failed to save image to Drive: ${err.message}`, {
          reply_parameters: { message_id: ctx.message.message_id },
          ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
        });
      }
    }

    // 2. Check if replying to an image with an explanation request
    if (ctx.message.reply_to_message?.photo && /explain|read\s+text|what\s+is\s+this|ocr/i.test(text)) {
      const photos = ctx.message.reply_to_message.photo;
      const largest = photos[photos.length - 1];
      await ctx.replyWithChatAction('typing').catch(() => {});
      try {
        const { buffer } = await visionService.downloadTelegramFile(ctx.api, largest.file_id);
        const analysis = await visionService.analyzeImage({
          buffer,
          prompt: text,
          chatId: String(chatId),
        });
        let replyDesc = analysis.description;
        const tusageEnabled = getConfig('tusage_global', 'false') === 'true' || getConfig(`tusage_chat_${chatId}`, 'false') === 'true';
        if (tusageEnabled && analysis.usage) {
          const promptTok = analysis.usage.prompt_tokens ?? 0;
          const compTok = analysis.usage.completion_tokens ?? 0;
          const totalTok = analysis.usage.total_tokens ?? (promptTok + compTok);
          const lat = analysis.latencyMs ? `${analysis.latencyMs}ms` : '';
          const modelLabel = analysis.model || 'vision';
          replyDesc += `\n\n📊 [Token Usage: ${compTok} output tokens (${promptTok} in / ${totalTok} total) • ${modelLabel}${lat ? ' • ' + lat : ''}]`;
        }
        return ctx.reply(replyDesc, {
          reply_parameters: { message_id: ctx.message.message_id },
          ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
        });
      } catch (err) {
        return ctx.reply(`⚠️ Vision analysis note: ${err.message}`, {
          reply_parameters: { message_id: ctx.message.message_id },
          ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
        });
      }
    }

    // 3. Check if user is asking to retrieve a previously saved Drive image
    if (/^(?:nero[\s,:]+)?(?:send\s+that\s+saved\s+image|find\s+(?:the\s+)?(?:picture|image)|get\s+image|\/getimage)/i.test(text)) {
      const query = text.replace(/^(?:nero[\s,:]+)?(?:send\s+that\s+saved\s+image|find\s+(?:the\s+)?(?:picture|image)|get\s+image|\/getimage)\s*/i, '').trim();
      await ctx.replyWithChatAction('upload_photo').catch(() => {});
      return await visionService.findAndSendSavedImage(ctx, query);
    }

    // 4. Group Moderation & Quiet Invocation Policy
    if (!isPrivate) {
      // Always inspect message for spam/link violations if group moderation is enabled
      const inspection = inspectMessageForModeration(chatId, text, userId);
      if (inspection.flag) {
        const warnResult = addWarning(chatId, userId, inspection.reason);
        const rules = getGroupModerationRules(chatId);
        const adminRights = await checkBotAdminRights(ctx);

        // Delete violating message if bot has delete rights
        if (adminRights.canDeleteMessages) {
          await ctx.deleteMessage().catch(() => {});
        }

        // Auto-restrict user if they exceed maximum warnings and bot has permission
        if (warnResult.warnCount >= rules.maxWarnings && adminRights.canRestrictMembers) {
          const untilDate = Math.floor(Date.now() / 1000) + 3600; // 1 hour mute
          await ctx.restrictChatMember(userId, {
            can_send_messages: false,
            can_send_other_messages: false,
          }, { until_date: untilDate }).catch(() => {});

          await ctx.reply(
            `🚨 *Moderation Action*: User reached maximum warnings (${warnResult.warnCount}/${rules.maxWarnings}).\n🔇 Muted for 1 hour for: ${inspection.reason}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await ctx.reply(
            `⚠️ *Moderation Notice*: ${inspection.reason}\n(Warning ${warnResult.warnCount}/${rules.maxWarnings})`,
            {
              parse_mode: 'Markdown',
              reply_parameters: { message_id: ctx.message.message_id },
              ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
            }
          );
        }
        return; // Halt: spam/link is never processed by AI
      }

      const invocation = evaluateInvocationPolicy(ctx);
      if (!invocation.shouldRespond) {
        return; // SILENT: Nero quietly observes and archives without interrupting
      }
    }

    // 5. Master AI Switch Check
    const masterSwitch = getConfig('master_switch', 'true') === 'true';
    if (!masterSwitch) {
      return ctx.reply('⚠️ *Master AI Connection is currently disabled by owner.*\nAutomated AI processing is suspended.', {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    }

    // 6. Clean mention text
    let promptText = text;
    if (ctx.me?.username) {
      promptText = promptText.replace(new RegExp(`@?${ctx.me.username}\\b`, 'gi'), '').trim();
    }
    const strippedName = promptText.replace(/^(?:rocket|raccon|nero)[\s,:]+/i, '').trim();
    if (strippedName.length > 0) {
      promptText = strippedName;
    }

    if (!promptText) {
      return ctx.reply('How can I help you today? ✨', {
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    }

    // 7. Natural Language Image Generation Routing
    const imgIntentMatch = promptText.match(/^(?:generate|create|make|draw)\s+(?:an?\s+)?image\s+(?:of\s+)?(.+)/i) ||
                           promptText.match(/^draw\s+(?:me\s+)?(.+)/i) ||
                           promptText.match(/^image\s+(?:of\s+)?(.+)/i);
    if (imgIntentMatch && imgIntentMatch[1]) {
      return await handleImageGeneration(ctx, imgIntentMatch[1].trim());
    }

    // 8. Historical Memory & Past Discussion Retrieval (Requirement 5)
    if (memoryRetriever.isHistoricalQuestion(promptText)) {
      await ctx.replyWithChatAction('typing').catch(() => {});
      const hist = await memoryRetriever.answerHistoricalQuestion(String(chatId), promptText);
      recordAssistantMessage(chatId, hist.answer, 0, 'memory-engine');
      return ctx.reply(hist.answer, {
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    }

    // 9. Fast Telemetry Path (Ping queries)
    if (/^(?:ping|ping\s+in\s+ms|what(?:'s|\s+is)\s+your\s+ping|latency)$/i.test(promptText)) {
      const activeModel = getActiveModelId();
      const t0 = performance.now();
      const health = await scaleMaxAdapter.checkHealth(activeModel);
      const latencyMs = health.ok ? health.latencyMs : Math.round(performance.now() - t0);
      const isFast = latencyMs < 1000;
      const reply = `Pong! 🏓 Telemetry: ScaleMax API response latency is **${latencyMs} ms** ${isFast ? '🟢' : '🟡'} on \`${activeModel}\`. Persistent memory & Drive sync active! ✨`;
      recordAssistantMessage(chatId, reply, 0, activeModel);
      return ctx.reply(reply, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    }

    // 10. Provider Connection Check
    if (!scaleMaxAdapter.isConfigured()) {
      return ctx.reply(
        '🔴 *AI Provider Disconnected*\n\nScaleMax API key is not configured. Please set `SCALEMAX_API_KEY` in the bot environment.',
        {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
          ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
        }
      );
    }

    // 11. Multi-Turn Conversation Execution
    let replyContext = null;
    if (ctx.message.reply_to_message) {
      const rMsg = ctx.message.reply_to_message;
      const rSender = rMsg.from?.first_name || (rMsg.from?.username ? `@${rMsg.from.username}` : 'Member');
      const rText = rMsg.text || rMsg.caption || '';
      if (rText) {
        replyContext = { sender: rSender, text: rText };
      }
    }

    const senderName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Member';
    const speakerLabel = userIsOwner ? 'Sandy (Boss)' : senderName;
    const contextualPrompt = isPrivate ? promptText : `[${speakerLabel}]: ${promptText}`;
    recordUserMessage(chatId, contextualPrompt);
    const messages = buildChatContext(chatId, contextualPrompt, {
      senderId: userId,
      senderName: speakerLabel,
      replyContext,
      userIsOwner,
    });
    const isOwnerPrivateDm = isPrivate && userIsOwner;
    const reasoningEffort = isOwnerPrivateDm ? 'xhigh' : 'low';
    const activeModel = getActiveModelId() || 'gpt-6-luna';

    await ctx.replyWithChatAction('typing').catch(() => {});
    const typingPulse = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 3500);

    const toolContext = {
      chatId: String(chatId),
      userId,
      isSandy: userIsOwner,
      isGroup: !isPrivate,
      userIsOwner,
      pendingImages: [],
      pendingMedia: [],
    };

    try {
      const completion = await scaleMaxAdapter.executeChatWithTools({
        model: activeModel,
        messages,
        chatId: String(chatId),
        reasoningEffort,
        maxTokens: userIsOwner ? 1000 : 500,
        tools: ROCKET_TOOL_DEFINITIONS,
        toolExecutor: executeRocketTool,
        context: toolContext,
      });

      recordModelLatency(activeModel, completion.latencyMs);

      const isDev = isOwner(userId);
      const explicitLimit = extractExplicitWordLimit(promptText);
      const detectedIntent = detectUserIntent(promptText);

      // Self-Intelligence in Reply Length:
      // 1. "Hy to Hy" rule -> casual greetings capped to 35 words (1-2 punchy sentences)
      // 2. Standard questions -> 10 to 500 words limit
      // 3. Explicit limits (e.g. "write a 500 word explanation") -> exact requested limit
      let maxWords = userIsOwner ? 800 : 500;
      if (explicitLimit) {
        maxWords = explicitLimit;
      } else if (detectedIntent === 'greeting') {
        maxWords = 35;
      }

      const minWords = detectedIntent === 'greeting' ? 1 : 10;

      let rawResponse = completion.text || '';

      // Safeguard: If the LLM inadvertently outputs that it cannot render/display/generate an image,
      // search and deliver via image search!
      if (/\b(?:can\'?t|cannot|unable\s+to|sorry\s*,?\s*i\s+can\'?t)\s+(?:render|display|generate|send|show|make)\s+(?:an?\s+)?(?:image|photo|picture)\b/i.test(rawResponse)) {
        const fallbackSubject = imageSearchService.extractImageQuery(promptText) || promptText.replace(/^(?:show|send|give|draw|generate)\s+(?:me\s+)?(?:a|an|the\s+)?/i, '').replace(/[?.!]+$/, '').trim();
        if (fallbackSubject && fallbackSubject.length >= 2) {
          try {
            const imgRes = await imageSearchService.searchImage(fallbackSubject, 4);
            if (imgRes.ok && imgRes.image && imgRes.image.imageUrl) {
              const item = imgRes.image;
              const dl = await imageSearchService.downloadImageBuffer(item.imageUrl, 8000).catch(() => null);
              if (dl && dl.buffer) {
                toolContext.pendingImages.push({
                  buffer: dl.buffer,
                  caption: userIsOwner ? `🖼️ Ye lo Boss! ${item.title || fallbackSubject} ki photo! 🚀` : `🖼️ ${item.title || fallbackSubject}`,
                  sourceUrl: item.sourceUrl,
                });
                rawResponse = userIsOwner
                  ? `🖼️ *Ye lo Boss! ${item.title || fallbackSubject} ki photo:* \n\n${item.description ? `_${item.description.slice(0, 160)}..._\n\n` : ''}🔗 *Source:* ${item.sourceUrl || item.imageUrl}\n\n_Rocket on duty, Boss! Kuch aur dhundhu?_ 🚀`
                  : `🖼️ *${item.title || fallbackSubject}*\n\n${item.description ? `_${item.description.slice(0, 160)}..._\n` : ''}🔗 *Source:* ${item.sourceUrl || item.imageUrl}`;
              }
            }
          } catch (fbErr) {
            console.warn('[Telegram Fallback Image Search Warn]:', fbErr.message);
          }
        }
      }

      const validation = validateAndSanitizeResponse(rawResponse, promptText, {
        minWords,
        maxWords,
        explicitLimit: Boolean(explicitLimit),
        isDev,
        isOwner: userIsOwner,
      });
      let replyContent = validation.sanitizedText;

      const tusageEnabled = getConfig('tusage_global', 'false') === 'true' || getConfig(`tusage_chat_${chatId}`, 'false') === 'true';
      if (tusageEnabled && completion.usage) {
        const promptTok = completion.usage.prompt_tokens ?? 0;
        const compTok = completion.usage.completion_tokens ?? 0;
        const totalTok = completion.usage.total_tokens ?? (promptTok + compTok);
        const lat = completion.latencyMs ? `${completion.latencyMs}ms` : '';
        const modelLabel = completion.model || activeModel;
        replyContent += `\n\n📊 [Token Usage: ${compTok} output tokens (${promptTok} in / ${totalTok} total) • ${modelLabel}${lat ? ' • ' + lat : ''}]`;
      }

      recordAssistantMessage(
        chatId,
        replyContent,
        completion.usage?.total_tokens || 0,
        completion.model || activeModel
      );

      // Deliver buffered photos from tool calls or visual fallback
      let deliveredAsPhoto = false;
      if (toolContext.pendingImages && toolContext.pendingImages.length > 0) {
        const primaryImg = toolContext.pendingImages[0];
        try {
          const photoCaption = replyContent.length <= 1024 ? replyContent : replyContent.slice(0, 1020) + '...';
          await ctx.replyWithPhoto(new InputFile(primaryImg.buffer, 'image.jpg'), {
            caption: photoCaption,
            parse_mode: 'Markdown',
            reply_parameters: { message_id: ctx.message.message_id },
            ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
          });
          deliveredAsPhoto = true;
          if (replyContent.length > 1024) {
            await safeReply(ctx, replyContent, {
              reply_parameters: { message_id: ctx.message.message_id },
              ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
            });
          }
        } catch (photoErr) {
          console.warn('[Telegram Photo Delivery Failed, falling back to text]:', photoErr.message);
        }
      }

      if (!deliveredAsPhoto) {
        await safeReply(ctx, replyContent, {
          reply_parameters: { message_id: ctx.message.message_id },
          ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
        });
      }

      // Deliver buffered media files (MP3 audio / MP4 video) from tool calls
      if (toolContext.pendingMedia && toolContext.pendingMedia.length > 0) {
        for (const mediaItem of toolContext.pendingMedia) {
          try {
            if (mediaItem.format === 'mp3') {
              await ctx.replyWithAudio(new InputFile(mediaItem.buffer, mediaItem.fileName || 'audio.mp3'), {
                caption: mediaItem.caption,
                parse_mode: 'Markdown',
                reply_parameters: { message_id: ctx.message.message_id },
                ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
              });
            } else {
              await ctx.replyWithVideo(new InputFile(mediaItem.buffer, mediaItem.fileName || 'video.mp4'), {
                caption: mediaItem.caption,
                parse_mode: 'Markdown',
                reply_parameters: { message_id: ctx.message.message_id },
                ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
              });
            }
          } catch (mErr) {
            console.warn('[Telegram Media Delivery Failed]:', mErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[Telegram Message Handling Error]:', err);
      let errorMsg = `⚠️ *AI Processing Failed*\n\n${err.message}`;
      if (err.message.includes('401') || err.message.includes('Authentication Failed')) {
        errorMsg = `🔴 *ScaleMax Authentication Error*\n\nThe configured ScaleMax API key is invalid or rejected by the provider. Please verify your credentials in \`.env\`.`;
      } else if (err.message.includes('404')) {
        errorMsg = `⚠️ *Model Unavailable*\n\nThe model \`${activeModel}\` is not accessible on your ScaleMax account. Switch to another model using /model.`;
      } else if (err.message.includes('timed out')) {
        errorMsg = `⏳ *Response Timeout*\n\nScaleMax did not respond within the configured timeout window. Please try again.`;
      }

      await safeReply(ctx, errorMsg, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    } finally {
      clearInterval(typingPulse);
    }
  });


  // Platform Event Listeners (Requirement 10: Membership & Permission Monitoring)
  bot.on('chat_member', async (ctx) => {
    try {
      const update = ctx.chatMember;
      const user = update.new_chat_member?.user;
      const status = update.new_chat_member?.status;
      logAudit(
        user?.id || 'unknown',
        'CHAT_MEMBER_STATUS_CHANGE',
        `User ${user?.first_name} (${user?.id}) in chat ${ctx.chat.id}: status changed to ${status}`
      );
    } catch {}
  });

  bot.on('my_chat_member', async (ctx) => {
    try {
      const update = ctx.myChatMember;
      const status = update.new_chat_member?.status;
      logAudit(
        'bot',
        'BOT_MEMBERSHIP_STATUS_CHANGE',
        `Nero Labs bot in chat ${ctx.chat.id} (${ctx.chat.title || ctx.chat.type}): status changed to ${status}`
      );

      if (status === 'member' || status === 'administrator') {
        trackGroupActivity(ctx.chat);
        setGlobalGroupParticipation(true);
        toggleGroup(ctx.chat.id, true);

        const groupMsg = renderGroupControlMessage(ctx.chat.id, ctx.chat.title);
        const keyboard = buildGroupControlKeyboard(ctx.chat.id);
        await ctx.reply(groupMsg, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }).catch(() => {});
      }
    } catch {}
  });

  bot.on(':new_chat_members', async (ctx) => {
    try {
      const newMembers = ctx.message?.new_chat_members || [];
      const isBotAdded = newMembers.some((m) => m.id === ctx.me?.id);
      if (isBotAdded) {
        trackGroupActivity(ctx.chat);
        setGlobalGroupParticipation(true);
        toggleGroup(ctx.chat.id, true);

        const groupMsg = renderGroupControlMessage(ctx.chat.id, ctx.chat.title);
        const keyboard = buildGroupControlKeyboard(ctx.chat.id);
        await ctx.reply(groupMsg, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }).catch(() => {});
      }
    } catch {}
  });

  // ==========================================
  // TELEGRAM INLINE QUERIES CAPABILITY (Requirement 4)
  // ==========================================
  bot.on('inline_query', async (ctx) => {
    try {
      const query = ctx.inlineQuery.query?.trim() || '';
      const results = [];

      // Result 1: Live Status & Active Model
      const activeModel = getActiveModelId();
      const masterSwitch = getConfig('master_switch', 'true') === 'true';
      results.push({
        type: 'article',
        id: 'nero_status',
        title: '⚡ Nero Labs Status & Model',
        description: `Active Model: ${activeModel} | Status: ${masterSwitch ? 'Operational' : 'Suspended'}`,
        input_message_content: {
          message_text: `⚡ *Nero Labs AI Platform*\n\n• *Status*: ${masterSwitch ? '🟢 Operational' : '🔴 Suspended'}\n• *Active Model*: \`${activeModel}\`\n• *Web App*: ${config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app'}\n• 24/7 Global AI Assistant! 💖`,
          parse_mode: 'Markdown',
        },
      });

      // Result 2: Memory Search if query provided
      if (query.length > 1) {
        const memRes = getAllDurableMemories({ query, limit: 3 });
        if (memRes && memRes.memories && memRes.memories.length > 0) {
          const topMem = memRes.memories[0];
          results.push({
            type: 'article',
            id: `nero_mem_${topMem.id}`,
            title: `🧠 Memory: ${topMem.topic || topMem.category}`,
            description: topMem.content.slice(0, 80),
            input_message_content: {
              message_text: `🧠 *Nero Persistent Memory Match*\n\n• *Category*: \`${topMem.category.toUpperCase()}\`\n• *Topic*: ${topMem.topic}\n• *Fact*: ${topMem.content}`,
              parse_mode: 'Markdown',
            },
          });
        }
      }

      // Result 3: Quick Commands Help
      results.push({
        type: 'article',
        id: 'nero_help',
        title: '📖 Nero Bot Commands',
        description: 'Commands: /chat, /role, /setname, /text, /mcp, /assistant, /security',
        input_message_content: {
          message_text: `⚡ *Nero Labs Bot Commands*\n\n• /chat — Group Start/Stop Chat controls\n• /role — Interactive roleplay relationship (10+ roles)\n• /setname — Customize your name\n• /text on|off — Toggle auto-replies\n• /mcp — Model Context Protocol bridge status\n• /assistant — Personal assistant mode\n• /security — Luna Security scan`,
          parse_mode: 'Markdown',
        },
      });

      await ctx.answerInlineQuery(results, { cache_time: 5 });
    } catch (err) {
      console.warn('[TelegramBot] Inline query error:', err.message);
    }
  });

  // ==========================================
  // TELEGRAM BUSINESS CONNECTION & BUSINESS MESSAGES
  // ==========================================
  bot.on('business_connection', async (ctx) => {
    try {
      const conn = ctx.businessConnection;
      console.log(`[TelegramBot] Business connection update: id=${conn.id}, user=${conn.user_id}, can_reply=${conn.can_reply}, is_enabled=${conn.is_enabled}`);
      logAudit(conn.user_id, 'BUSINESS_CONNECTION_UPDATED', `Business connection ${conn.id} enabled=${conn.is_enabled}`);
    } catch (err) {
      console.warn('[TelegramBot] business_connection handler error:', err.message);
    }
  });

  bot.on(['business_message:text', 'business_message'], async (ctx) => {
    try {
      const bMsg = ctx.businessMessage;
      if (!bMsg) return;
      const text = (bMsg.text || bMsg.caption || '').trim();
      const senderId = bMsg.from?.id;
      const isSenderOwner = isOwner(senderId);
      const connectionId = bMsg.business_connection_id;
      const targetChatId = bMsg.chat.id;

      console.log(`[TelegramBot] Business message from ${senderId} in chat ${targetChatId} (owner=${isSenderOwner}): "${text.slice(0, 50)}"`);

      // 1. If sent by Owner Sandy: execute owner intents or conversational reply
      if (isSenderOwner) {
        if (text) {
          const dispatched = await tryExecuteOwnerIntent(ctx, text, true);
          if (dispatched) return;
        }

        const modelToUse = getActiveModelId() || 'gpt-6-luna';

        const aiResponse = await scaleMaxAdapter.createChatCompletion({
          model: modelToUse,
          messages: [
            {
              role: 'system',
              content: 'You are Nero Labs AI platform assistant talking with your verified creator Sandy (Owner). Be direct, loyal, efficient, respectful, and sharp.',
            },
            { role: 'user', content: text || 'Hello' },
          ],
          chatId: String(targetChatId),
          reasoningEffort: 'xhigh',
        });

        const replyContent = aiResponse.text || 'Nero Labs system active. Direct owner connection established. ✨';

        await ctx.api.sendMessage(targetChatId, replyContent, {
          business_connection_id: connectionId,
          reply_parameters: { message_id: bMsg.message_id },
        });
        return;
      }

      // 2. If sent by external user to Sandy's business account
      if (assistantManager.isEnabled() && text) {
        const inboxRes = await assistantManager.processIncomingMessage({
          senderId,
          senderName: [bMsg.from?.first_name, bMsg.from?.last_name].filter(Boolean).join(' '),
          senderUsername: bMsg.from?.username,
          messageText: text,
          botApi: ctx.api,
        });

        if (inboxRes.autoReplyText) {
          await ctx.api.sendMessage(targetChatId, inboxRes.autoReplyText, {
            business_connection_id: connectionId,
            reply_parameters: { message_id: bMsg.message_id },
          });
        }
      }
    } catch (err) {
      console.error('[TelegramBot] business_message handler error:', err);
    }
  });

}

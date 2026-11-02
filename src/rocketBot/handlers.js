import fs from 'node:fs';
import { InlineKeyboard, InputFile } from 'grammy';
import { config } from '../config.js';
import { rocketLifeEngine } from '../rocket/lifeEngine.js';
import { getUserRole, isSandy } from '../rocket/rbac.js';
import {
  buildRocketDirective,
  detectSandyAbuse,
  generateDefenseResponse,
  generateStarvingResponse,
  generateSleepResponse,
  formatRocketStatusCard,
} from '../rocket/persona.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';
import { pdfService } from '../pdf/pdfService.js';
import { discernConversationalAddress } from '../conversation/addressDiscernment.js';
import { rocketStudyService } from '../study/studyService.js';
import { scrubRestrictedBrandNames } from '../conversation/responseValidator.js';
import {
  getConfig,
  setConfig,
  registerOrUpdateGroup,
  getLatestChatMessages,
} from '../db/index.js';
import { messageArchiver } from '../memory/archiver.js';
import { trackGroupActivity } from '../groups/groupService.js';
import { ROCKET_TOOL_DEFINITIONS, executeRocketTool } from '../tools/rocketTools.js';

// Resilient message sender with entity parsing error recovery - NEVER throws or fails
async function safeReply(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, extra);
  } catch (err) {
    if (extra?.parse_mode) {
      try {
        const fallback = { ...extra };
        delete fallback.parse_mode;
        return await ctx.reply(text, fallback);
      } catch (err2) {
        console.warn('[RocketBot safeReply fallback error]:', err2.message);
      }
    }
    console.warn('[RocketBot safeReply error]:', err.message);
    try {
      return await ctx.reply(String(text).slice(0, 4000));
    } catch (finalErr) {
      console.error('[RocketBot safeReply final catch]:', finalErr.message);
    }
  }
}

export function registerRocketHandlers(bot) {
  const miniAppUrl = config.rocketMiniAppUrl || config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app';
  const cleanAppUrl = miniAppUrl.replace(/\/+$/, '');

  function renderRocketGroupControlMessage(ctx, state) {
    const title = ctx.chat?.title || 'This Group';
    const textMode = getConfig(`text_mode_${ctx.chat.id}`, 'on');
    const isChatActive = textMode === 'on' || textMode === 'all' || textMode === 'true';
    const botUsername = ctx.me?.username || 'R0CK3TAI';

    let msg = `🦝 *ROCKET AI — GROUP HUB & SETUP* 🐾😈\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `• *Group:* *${title}*\n`;
    msg += `• *Chat Mode:* ${isChatActive ? '🟢 *CHAT ACTIVE (BANTER ON)*' : '⚪ *QUIET MODE (STANDBY)*'}\n`;
    msg += `• *Status:* ${isChatActive ? 'Rocket actively listens and banters with the group.' : 'Rocket speaks only when called ("Rocket..."), mentioned, or replied to.'}\n`;
    msg += `• *Mood:* ${state.mood} 🦝\n`;
    msg += `• *Hunger:* ${state.hunger_level}% [${state.hunger_state}]\n`;
    msg += `• *Group Pizza Stash:* ${state.pizza_inventory} 🍕 | *Tacos:* ${state.taco_inventory} 🌮\n\n`;
    msg += `*How to talk to Rocket:* \n`;
    msg += `👉 Say *"Rocket"*, *"Rocky"*, or mention @${botUsername} anywhere in your message!\n`;
    msg += `👉 Reply directly to any message sent by Rocket.\n`;
    msg += `👉 Tap *[ 🟢 Chat Mode ]* below to toggle active group banter.\n`;
    msg += `👉 Tap *[ 🚀 Open ROCK3T Mini App ]* below to launch the Group Web OS!\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `_Owner: Sandy (Nero Aurelius) 👑_`;
    return msg;
  }

  function buildRocketGroupKeyboard(ctx) {
    const textMode = getConfig(`text_mode_${ctx.chat.id}`, 'on');
    const isChatActive = textMode === 'on' || textMode === 'all' || textMode === 'true';
    const botUsername = ctx.me?.username || 'R0CK3TAI';
    const webAppUrl = `${cleanAppUrl}/rock3t/index.html?group_id=${ctx.chat.id}&group_name=${encodeURIComponent(ctx.chat.title || 'Group')}`;
    const directTelegramMiniApp = `https://t.me/${botUsername}?startapp=group_${ctx.chat.id}`;
    const raccoonHubUrl = `${cleanAppUrl}/raccoon/index.html?group_id=${ctx.chat.id}`;

    // Note: Telegram strictly forbids .webApp() inside group chats (error 400 BUTTON_TYPE_INVALID).
    // Using .url() buttons for groups guarantees 100% successful delivery and direct launch!
    return new InlineKeyboard()
      .url('🚀 Open ROCK3T Mini App', directTelegramMiniApp)
      .url('🌐 Group Web OS', webAppUrl)
      .row()
      .url('🦝 Life Engine Hub', raccoonHubUrl)
      .row()
      .text(isChatActive ? '🟢 Chat Active (Tap for Quiet)' : '⚪ Quiet Mode (Tap to Chat)', `rocket_toggle_chat_${ctx.chat.id}`)
      .row()
      .text('🍕 Feed Group Pizza', `rocket_group_feed_pizza_${ctx.chat.id}`)
      .text('🌮 Feed Group Taco', `rocket_group_feed_taco_${ctx.chat.id}`)
      .row()
      .text('📊 Life Status', `rocket_group_status_${ctx.chat.id}`)
      .text('📌 Pin Hub', `rocket_group_pin_${ctx.chat.id}`);
  }

  // 1. /start and /setup commands
  bot.command(['start', 'setup'], async (ctx) => {
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const isOwner = isSandy(ctx.from?.id);
    const userName = ctx.from?.first_name || 'Friend';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;
    const state = rocketLifeEngine.getState(contextId);

    // Group flow: Register group, configure text mode, and send valid group inline buttons
    if (isGroup) {
      trackGroupActivity(ctx.chat);
      registerOrUpdateGroup(ctx.chat.id, ctx.chat.title, ctx.chat.type, 1);
      if (!getConfig(`text_mode_${ctx.chat.id}`, null)) {
        setConfig(`text_mode_${ctx.chat.id}`, 'on');
      }

      const welcomeMsg = renderRocketGroupControlMessage(ctx, state);
      const keyboard = buildRocketGroupKeyboard(ctx);

      return safeReply(ctx, welcomeMsg, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }

    // Private 1-on-1 DM flow: Full native .webApp() integration
    const keyboard = new InlineKeyboard()
      .webApp('🚀 Launch ROCK3T OS', `${cleanAppUrl}/rock3t/index.html`)
      .row()
      .webApp('🦝 Life Engine Hub', `${cleanAppUrl}/raccoon/index.html`)
      .row()
      .text('🍕 Feed Pizza', 'feed_pizza')
      .text('🌮 Feed Taco', 'feed_taco')
      .row()
      .text('📊 Life Status', 'view_status');

    let welcomeText = `🦝 *YO! I'M ROCKET!* 😈🐾\n`;
    welcomeText += `The sharpest, cheekiest raccoon companion from *Nero Labs*!\n\n`;

    if (isOwner) {
      welcomeText += `👑 *Boss Sandy!* Everything is locked and loaded. Your orders are my law!\n\n`;
    } else {
      welcomeText += `Hey ${userName}! I'm Sandy's personal sidekick. Play nice, bring pizza, and we'll get along great! 🍕\n\n`;
    }

    welcomeText += `• *Mood:* ${state.mood} 🦝\n`;
    welcomeText += `• *Hunger:* ${state.hunger_level}% (${state.hunger_state})\n`;
    welcomeText += `• *Pizza Stash:* ${state.pizza_inventory} 🍕 | *Tacos:* ${state.taco_inventory} 🌮\n\n`;
    welcomeText += `Tap *ROCK3T OS* below to enter your personal simulated Android Web OS with Tic-Tac-Toe, Canvas, Store, Settings & 50 Profile Questions!`;

    await safeReply(ctx, welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // 2. /status command
  bot.command('status', async (ctx) => {
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;
    const state = rocketLifeEngine.getState(contextId);
    const card = formatRocketStatusCard(state);

    const keyboard = isGroup
      ? new InlineKeyboard()
          .url('🚀 Open Group Web OS', `${cleanAppUrl}/rock3t/index.html?group_id=${ctx.chat.id}`)
          .text('🔄 Refresh', `rocket_group_status_${ctx.chat.id}`)
      : new InlineKeyboard()
          .webApp('🚀 Open Raccoon OS', `${cleanAppUrl}/raccoon/index.html`)
          .text('🔄 Refresh', 'view_status');

    await safeReply(ctx, card, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // 3. /rock3t, /os, /app, /miniapp commands
  bot.command(['rock3t', 'os', 'app', 'raccoon', 'miniapp'], async (ctx) => {
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const botUsername = ctx.me?.username || 'R0CK3TAI';
    const webAppUrl = `${cleanAppUrl}/rock3t/index.html?group_id=${ctx.chat.id}&group_name=${encodeURIComponent(ctx.chat.title || 'Group')}`;
    const directTelegramMiniApp = `https://t.me/${botUsername}?startapp=group_${ctx.chat.id}`;

    const keyboard = isGroup
      ? new InlineKeyboard()
          .url('🚀 Launch ROCK3T Mini App', directTelegramMiniApp)
          .url('🌐 Group Web OS', webAppUrl)
          .row()
          .url('🦝 Life Engine Hub', `${cleanAppUrl}/raccoon/index.html?group_id=${ctx.chat.id}`)
      : new InlineKeyboard()
          .webApp('🚀 Launch ROCK3T OS', `${cleanAppUrl}/rock3t/index.html`)
          .row()
          .webApp('🦝 Open Life Engine Hub', `${cleanAppUrl}/raccoon/index.html`);

    await safeReply(ctx, '🐾 *Launching ROCK3T Web OS & Mini App Environment...* 🚀', {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // 4. /feed command
  bot.command('feed', async (ctx) => {
    const parts = (ctx.match || '').trim().split(/\s+/);
    const item = parts[0]?.toLowerCase() === 'taco' ? 'taco' : 'pizza';
    const amount = parseInt(parts[1] || '1', 10) || 1;
    const contextId = ctx.chat.type === 'private' ? `user_${ctx.from.id}` : `group_${ctx.chat.id}`;

    const updated = rocketLifeEngine.feed(
      contextId,
      ctx.from.id,
      ctx.from.first_name || 'Friend',
      item,
      amount,
      'Fed via Telegram command'
    );

    const icon = item === 'pizza' ? '🍕' : '🌮';
    await ctx.reply(
      `🦝${icon} *CHOMP CHOMP!* Fed Rocket ${amount} ${item}(s)!\n` +
      `• Hunger restored to: *${updated.hunger_level}%*\n` +
      `• Pizza Stash: *${updated.pizza_inventory}* 🍕 | Tacos: *${updated.taco_inventory}* 🌮\n` +
      `• Fuel Tokens: *${updated.fuel_tokens_remaining.toLocaleString()}*`,
      { parse_mode: 'Markdown' }
    );
  });

  // 5. /sleep command
  bot.command('sleep', async (ctx) => {
    const contextId = ctx.chat.type === 'private' ? `user_${ctx.from.id}` : `group_${ctx.chat.id}`;
    const state = rocketLifeEngine.getState(contextId);

    if (state.is_sleeping) {
      const remainingMin = Math.ceil((state.remaining_rest_seconds || 0) / 60);
      await ctx.reply(generateSleepResponse(remainingMin), { parse_mode: 'Markdown' });
    } else {
      const startMs = new Date(state.sleep_scheduled_start).getTime();
      const diffMin = Math.max(0, Math.round((startMs - Date.now()) / 60000));
      await ctx.reply(
        `☀️ *Rocket is wide awake and active!*\n` +
        `• Next guaranteed 1-hour rest cycle begins in ~*${diffMin} minutes*.\n` +
        `• Daily schedule: 22 active hours / 2 guaranteed rest hours (1h per 12h cycle). 🦝🌙`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // 6. /wake command (Emergency wake-up)
  bot.command('wake', async (ctx) => {
    const isOwner = isSandy(ctx.from?.id);
    const contextId = ctx.chat.type === 'private' ? `user_${ctx.from.id}` : `group_${ctx.chat.id}`;
    const state = rocketLifeEngine.getState(contextId);

    if (!state.is_sleeping) {
      return ctx.reply('🦝🐾 I am already awake! Eyes open, ears perked, ready for trouble!');
    }

    if (isOwner) {
      rocketLifeEngine.triggerEmergencyWake(contextId, ctx.from.id);
      return ctx.reply('🦝🚨 *snaps awake instantly* Boss Sandy called! Emergency wake-up acknowledged! Standing by!');
    }

    // Register disturbance
    const result = rocketLifeEngine.registerSleepMessage(contextId, ctx.from.id);
    await ctx.reply(result.message, { parse_mode: 'Markdown' });
  });

  // 7. /refill command (Sandy only)
  bot.command('refill', async (ctx) => {
    if (!isSandy(ctx.from?.id)) {
      return ctx.reply('🐾 Access denied! Only Sandy can trigger an emergency food grant! 🦝🔒');
    }
    const contextId = ctx.chat.type === 'private' ? `user_${ctx.from.id}` : `group_${ctx.chat.id}`;
    const updated = rocketLifeEngine.refillFood(contextId, ctx.from.id, 50, 25);

    await ctx.reply(
      `👑🍕 *SANDY DROPPED THE MOTHERLOAD!* 50 Pizzas & 25 Tacos added to inventory!\n` +
      `• Hunger: *100% (Energetic Zoomies!)*\n` +
      `• Fuel Tokens: *${updated.fuel_tokens_remaining.toLocaleString()}* 🦝✨`,
      { parse_mode: 'Markdown' }
    );
  });

  // 8. /help command
  bot.command('help', async (ctx) => {
    const helpText =
      `🦝 *ROCKET AI — COMMAND GUIDE*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• /start — Welcome message & interactive buttons\n` +
      `• /rock3t — Launch ROCK3T Web OS\n` +
      `• /status — Check Rocket's life, mood, hunger & sleep\n` +
      `• /feed [pizza|taco] — Feed Rocket directly\n` +
      `• /search <query> — 🌐 Live web search with instant citations\n` +
      `• /browse <url> — 📑 Deep crawl & summarize web page\n` +
      `• /image <query> — 🖼️ Search web images & diagrams\n` +
      `• /calc <math> — 🧮 Fast sandboxed math calculator\n` +
      `• /tasks — 📋 Sandy's task manager (/task add|list|done)\n` +
      `• /remind <text> — ⏰ Set persistent reminder\n` +
      `• /check <url> — 🛡️ Website safety & SSL audit\n` +
      `• /sandy — 👑 Boss Sandy live status & availability\n` +
      `• /pdf <topic> — 📄 Generate publication PDF dossier\n` +
      `• /study <topic> — 🔬 Concept Masterclass with active recall\n` +
      `• /quiz <topic> — 🎯 5-question interactive study quiz\n` +
      `• /flashcards <topic> — 🗂️ High-yield study flashcard deck\n` +
      `• /study_pack <topic> — 📑 Publication Study Guide PDF\n` +
      `• /research <topic> — 🔬 Academic & scientific deep research\n` +
      `• /sleep & /wake — Rocket rest schedule & emergency wake\n` +
      `• /refill — Sandy emergency food supply grant\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Natural Language Tool Execution Active._\n` +
      `_Send photos or PDFs anytime for instant analysis!_ 🍕🐾`;
    await safeReply(ctx, helpText, { parse_mode: 'Markdown' });
  });

  // Resilient Rocket Document Delivery with fallback against entity parsing errors
  async function deliverRocketDocument(ctx, result) {
    // Create a fresh InputFile on each attempt so consumed streams never throw Error: Stream is closed
    const createInputFile = () => {
      if (result.filePath && fs.existsSync(result.filePath)) {
        return new InputFile(result.filePath, result.filename);
      }
      return new InputFile(Buffer.from(result.buffer), result.filename);
    };

    const safeTitle = (result.title || 'Executive Document').replace(/[*_`\[\]()]/g, '').trim();
    const cleanSummary = (result.summary || '')
      .replace(/[*_`#~|\[\]\(\)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const cleanCaption = `📄 ${safeTitle}\n📊 Pages: ${result.pageCount || 1} | Size: ${Math.round((result.sizeBytes || 0) / 1024)} KB\n\n${cleanSummary}`.slice(0, 1024);

    try {
      return await ctx.replyWithDocument(createInputFile(), {
        caption: cleanCaption,
        reply_parameters: ctx.message?.message_id ? { message_id: ctx.message.message_id } : undefined,
      });
    } catch (err1) {
      console.warn('[RocketBot PDF Delivery Note] Attempt 1 failed:', err1.message);
      try {
        return await ctx.replyWithDocument(createInputFile(), {
          caption: `📄 ${safeTitle}\n📊 Pages: ${result.pageCount || 1} | Size: ${Math.round((result.sizeBytes || 0) / 1024)} KB`,
        });
      } catch (err2) {
        console.warn('[RocketBot PDF Delivery Note] Attempt 2 failed:', err2.message);
        return await ctx.replyWithDocument(createInputFile());
      }
    }
  }

  // Dedicated Rocket PDF Generation Helper
  async function handleRocketPdfGeneration(ctx, prompt, targetPages = 3, isOwner, contextId, userName) {
    const state = rocketLifeEngine.getState(contextId);

    // Pizza fee guard
    if (!isOwner && state.pizza_inventory < 1 && state.fuel_tokens_remaining <= 0) {
      return ctx.reply(
        `🦝🍕 *Hold up, ${userName}!* Generating an executive multi-page PDF requires heavy raccoon brainpower!\n\n` +
        `• *Task Fee:* 1 Pizza 🍕\n` +
        `• *Your Stash:* ${state.pizza_inventory} Pizzas\n\n` +
        `Feed me a pizza with \`/feed pizza\` or ask Boss Sandy for an emergency drop! 😈🐾`,
        { parse_mode: 'Markdown' }
      );
    }

    // Send immediate progress status to kill perceived latency
    const statusMsg = await ctx.reply(
      `📄 *Hold my pizza! Rocket is drafting your ${targetPages}-page publication PDF...* 🦝🐾\n` +
      `_Structuring chapters, comparative tables & vector typography..._`,
      { parse_mode: 'Markdown' }
    ).catch(() => null);

    // Heartbeat upload action
    const actionHeartbeat = setInterval(() => {
      ctx.replyWithChatAction('upload_document').catch(() => {});
    }, 3500);

    try {
      const result = await pdfService.generatePdfFromPrompt({ prompt, targetPages });
      if (result && result.buffer) {
        // Charge 1 pizza task fee
        if (!isOwner) {
          rocketLifeEngine.chargeTaskFee(contextId, 'pdf_generation', `PDF: ${result.title}`);
        }
        // Deduct model tokens
        rocketLifeEngine.consumeTokens(contextId, 400, targetPages * 350, 'gpt-6-luna');

        await deliverRocketDocument(ctx, result);
      } else {
        throw new Error('PDF output buffer was empty.');
      }
    } catch (err) {
      console.error('[RocketBot PDF Gen Error]:', err.message);
      await ctx.reply(`🦝⚠️ Whoops, my claws slipped on the printer toner! (Error: ${err.message})`);
    } finally {
      clearInterval(actionHeartbeat);
      if (statusMsg) {
        await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      }
    }
  }

  // 9. /pdf and /pdf_gen commands
  bot.command(['pdf', 'pdf_gen', 'create_pdf', 'makepdf'], async (ctx) => {
    const input = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id);
    const userName = ctx.from?.first_name || 'Friend';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;

    if (!input) {
      return ctx.reply(
        `📄 *ROCKET PDF STUDIO* 🦝🐾\n\n` +
        `Usage:\n` +
        `• \`/pdf <topic>\` — Generate an executive publication dossier\n` +
        `• \`/pdf 5 pages on AI Agents in 2026\` — Specify page count\n\n` +
        `_Task Fee: 1 Pizza per dossier. Compiled by Rocket AI & PDF Engine._ 🍕✨`,
        { parse_mode: 'Markdown' }
      );
    }

    const targetPages = pdfService.extractTargetPages(input);
    await handleRocketPdfGeneration(ctx, input, targetPages, isOwner, contextId, userName);
  });

  // 10. /study, /explain, /learn commands
  bot.command(['study', 'explain', 'learn'], async (ctx) => {
    const input = (ctx.match || '').trim();
    const userName = ctx.from?.first_name || 'Friend';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;

    if (!input) {
      return ctx.reply(
        `🔬 *ROCKET STUDY MASTERCLASS* 🦝💡\n\n` +
        `Usage:\n` +
        `• \`/study <topic>\` — Complete 6-point concept breakdown & active recall\n` +
        `• \`/quiz <topic>\` — 5-question test with explanations\n` +
        `• \`/flashcards <topic>\` — Rapid spaced repetition flashcards\n` +
        `• \`/study_pack <topic>\` — 1-Click publication PDF study dossier\n` +
        `• \`/research <topic>\` — Academic & scientific deep research\n\n` +
        `_Example:_ \`/study Photosynthesis\` or \`/study Quantum Computing\` ⚡`,
        { parse_mode: 'Markdown' }
      );
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    const typingHeartbeat = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 3500);

    try {
      const result = await rocketStudyService.explainTopic({
        topic: input,
        senderName: userName,
      });

      rocketLifeEngine.consumeTokens(contextId, 250, 600, 'gpt-6-luna');
      await ctx.reply(result.formattedText, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      console.error('[RocketBot Study Error]:', err.message);
      await ctx.reply(`🦝⚠️ Whoops, dropped my study flashcards! (Error: ${err.message})`);
    } finally {
      clearInterval(typingHeartbeat);
    }
  });

  // 11. /quiz command
  bot.command('quiz', async (ctx) => {
    const topic = (ctx.match || '').trim();
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;

    if (!topic) {
      return ctx.reply('🎯 *Rocket Quiz Arena*\n\nUsage: `/quiz <topic>` (e.g. `/quiz Physics Motion` or `/quiz JavaScript Closures`)', { parse_mode: 'Markdown' });
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    try {
      const quizRes = await rocketStudyService.generateQuiz({ topic });
      rocketLifeEngine.consumeTokens(contextId, 200, 450, 'deepseek-v4-flash');

      let quizText = `🎯 *ROCKET STUDY QUIZ: ${topic.toUpperCase()}* 🦝⚡\n`;
      quizText += `_Test your active recall! Answers revealed below:_\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      quizRes.questions.forEach((q, idx) => {
        quizText += `*${idx + 1}. ${q.question}*\n`;
        q.options.forEach((opt) => {
          quizText += `  ${opt}\n`;
        });
        quizText += `\n`;
      });

      quizText += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      quizText += `🔑 *ANSWER KEY & EXPLANATIONS:*\n\n`;
      quizRes.questions.forEach((q, idx) => {
        quizText += `*Q${idx + 1} Answer: [Option ${q.correctAnswer}]*\n_${q.explanation}_\n\n`;
      });

      await ctx.reply(quizText, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`🦝⚠️ Couldn't generate quiz: ${err.message}`);
    }
  });

  // 12. /flashcards command
  bot.command('flashcards', async (ctx) => {
    const topic = (ctx.match || '').trim();
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;

    if (!topic) {
      return ctx.reply('🗂️ *Rocket High-Yield Flashcards*\n\nUsage: `/flashcards <topic>` (e.g. `/flashcards Mitochondria` or `/flashcards Linear Regression`)', { parse_mode: 'Markdown' });
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    try {
      const fcRes = await rocketStudyService.generateFlashcards({ topic });
      rocketLifeEngine.consumeTokens(contextId, 180, 350, 'deepseek-v4-flash');

      let fcText = `🗂️ *HIGH-YIELD FLASHCARDS: ${topic.toUpperCase()}* 🦝💡\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      fcRes.flashcards.forEach((card, i) => {
        fcText += `*CARD ${i + 1}*\n`;
        fcText += `❓ *Concept:* ${card.front}\n`;
        fcText += `💡 *High-Yield Answer:* _${card.back}_\n\n`;
      });

      await ctx.reply(fcText, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`🦝⚠️ Flashcard deck error: ${err.message}`);
    }
  });

  // 13. /study_pack and /research_pack commands
  bot.command(['study_pack', 'studypack', 'research_pack', 'studyguide'], async (ctx) => {
    const input = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id);
    const userName = ctx.from?.first_name || 'Friend';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;

    if (!input) {
      return ctx.reply(
        `📑 *ROCKET STUDY PACK GENERATOR* 🦝🎓\n\n` +
        `Usage:\n` +
        `• \`/study_pack <topic>\` — Complete publication study guide with syllabus, theory, formulas & practice problems.\n` +
        `• \`/study_pack 4 pages on Organic Chemistry\`\n\n` +
        `_Task Fee: 1 Pizza per dossier. High-reasoning publication engine._ 🍕📘`,
        { parse_mode: 'Markdown' }
      );
    }

    const pages = pdfService.extractTargetPages(input) || 3;
    const studyPrompt = `Comprehensive University-Level Study Guide & Exam Dossier on "${input}". Include course syllabus breakdown, core theoretical proofs, comparative mechanism tables, practice numericals, and revision cheat sheet.`;
    await handleRocketPdfGeneration(ctx, studyPrompt, pages, isOwner, contextId, userName);
  });

  // 14. /research command
  bot.command('research', async (ctx) => {
    const topic = (ctx.match || '').trim();
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;

    if (!topic) {
      return ctx.reply('🔬 *Rocket Academic & Scientific Deep Research*\n\nUsage: `/research <topic>` (e.g. `/research Quantum Supremacy` or `/research Solid State Batteries`)', { parse_mode: 'Markdown' });
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    try {
      const res = await rocketStudyService.deepResearch({ topic });
      rocketLifeEngine.consumeTokens(contextId, 300, 800, 'gpt-6-luna');
      await safeReply(ctx, res.report, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await safeReply(ctx, `🦝⚠️ Research engine hiccup: ${err.message}`);
    }
  });

  // 15. /search command — Live Web Search
  bot.command(['search', 'websearch', 'google'], async (ctx) => {
    const query = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);

    if (!query) {
      return safeReply(ctx, '🔍 *ROCKET WEB SEARCH* 🦝🌐\n\nUsage: `/search <query>`\n_Example:_ `/search SpaceX Starship latest flight`', { parse_mode: 'Markdown' });
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    try {
      const res = await executeRocketTool('web_search', { query }, { isSandy: isOwner });
      if (!res.ok || !res.results || res.results.length === 0) {
        return safeReply(ctx, `🔍 No live search results found for "${query}".`);
      }

      let text = `🔍 *WEB SEARCH: "${query.toUpperCase()}"* 🦝🌐\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      res.results.slice(0, 4).forEach((r, idx) => {
        text += `*${idx + 1}. [${r.title}](${r.url})*\n_${r.snippet || 'No summary available.'}_\n\n`;
      });

      await safeReply(ctx, text, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await safeReply(ctx, `🦝⚠️ Web search error: ${err.message}`);
    }
  });

  // 16. /browse command — Deep Web Page Crawl
  bot.command(['browse', 'readurl', 'crawl'], async (ctx) => {
    const url = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);

    if (!url || !url.startsWith('http')) {
      return safeReply(ctx, '🌐 *ROCKET DEEP BROWSER* 🦝📑\n\nUsage: `/browse <https://url>`\n_Example:_ `/browse https://en.wikipedia.org/wiki/Artificial_intelligence`', { parse_mode: 'Markdown' });
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    try {
      const res = await executeRocketTool('deep_browse', { url }, { isSandy: isOwner });
      if (!res.ok) {
        return safeReply(ctx, `🌐 Could not access website: ${res.error || 'Failed to fetch content.'}`);
      }

      let text = `🌐 *${res.title || 'Web Document'}* 🦝📑\n`;
      if (res.metaDescription) text += `_${res.metaDescription}_\n\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `${(res.contentSummary || 'No body text extracted.').slice(0, 1500)}\n\n`;
      text += `🔗 [Original Source](${url})`;

      await safeReply(ctx, text, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await safeReply(ctx, `🦝⚠️ Browse error: ${err.message}`);
    }
  });

  // 17. /image command — High-Res Web Image Search
  bot.command(['image', 'images', 'photo', 'photos', 'pic', 'pics'], async (ctx) => {
    const query = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);

    if (!query) {
      return safeReply(ctx, '🖼️ *ROCKET IMAGE FINDER* 🦝🎨\n\nUsage: `/image <query>`\n_Example:_ `/image cyberpunk raccoon neon city`', { parse_mode: 'Markdown' });
    }

    ctx.replyWithChatAction('upload_photo').catch(() => {});
    try {
      const toolContext = { pendingImages: [], isSandy: isOwner };
      const res = await executeRocketTool('search_images', { query, limit: 3 }, toolContext);

      if (toolContext.pendingImages.length > 0) {
        for (const img of toolContext.pendingImages.slice(0, 2)) {
          await ctx.replyWithPhoto(new InputFile(img.buffer), {
            caption: img.item?.title ? `🖼️ ${img.item.title}` : `🖼️ Image for "${query}"`,
            reply_parameters: { message_id: ctx.message.message_id },
          }).catch(() => {});
        }
      } else if (res.images && res.images.length > 0) {
        for (const img of res.images.slice(0, 2)) {
          await ctx.replyWithPhoto(img.imageUrl, {
            caption: `🖼️ [${img.title}](${img.sourceUrl || img.imageUrl})`,
            parse_mode: 'Markdown',
            reply_parameters: { message_id: ctx.message.message_id },
          }).catch(async () => {
            await safeReply(ctx, `🖼️ *${img.title}*\n${img.imageUrl}`);
          });
        }
      } else {
        await safeReply(ctx, `🖼️ No matching images found for "${query}".`);
      }
    } catch (err) {
      await safeReply(ctx, `🦝⚠️ Image search error: ${err.message}`);
    }
  });

  // 18. /calc command — Safe Isolated Math Sandbox
  bot.command(['calc', 'calculate', 'eval', 'math'], async (ctx) => {
    const code = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);

    if (!code) {
      return safeReply(ctx, '🧮 *ROCKET MATH SANDBOX* 🦝⚡\n\nUsage: `/calc <expression>`\n_Example:_ `/calc 4820 * 1.18` or `/calc Math.sqrt(1024) * 8`', { parse_mode: 'Markdown' });
    }

    try {
      const res = await executeRocketTool('run_safe_eval', { code }, { isSandy: isOwner });
      if (!res.ok) {
        return safeReply(ctx, `🧮 *Calc Error:* ${res.error || 'Evaluation failed'}`);
      }
      return safeReply(ctx, `🧮 *Result:* \`${res.result !== undefined ? res.result : 'Done'}\`\n_Execution Time: ${res.executionTimeMs}ms_`, { parse_mode: 'Markdown' });
    } catch (err) {
      return safeReply(ctx, `🦝⚠️ Calc error: ${err.message}`);
    }
  });

  // 19. /task and /tasks command — Sandy's Task Manager
  bot.command(['task', 'tasks', 'todo'], async (ctx) => {
    const input = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);

    try {
      if (input.startsWith('add ')) {
        const title = input.replace(/^add\s+/i, '').trim();
        const res = await executeRocketTool('manage_tasks', { action: 'create', title }, { isSandy: isOwner });
        return safeReply(ctx, `✅ *Task Added:* "${res.title}" \`[ID: ${res.taskId?.slice(0, 8)}]\``, { parse_mode: 'Markdown' });
      }
      if (input.startsWith('done ') || input.startsWith('complete ')) {
        const taskId = input.replace(/^(?:done|complete)\s+/i, '').trim();
        await executeRocketTool('manage_tasks', { action: 'complete', taskId }, { isSandy: isOwner });
        return safeReply(ctx, `✅ *Task Marked Completed!*`);
      }
      const res = await executeRocketTool('manage_tasks', { action: 'list' }, { isSandy: isOwner });
      if (!res.tasks || res.tasks.length === 0) {
        return safeReply(ctx, '📋 *Tasks:* No pending tasks in queue! Use `/task add <task>` to add one.', { parse_mode: 'Markdown' });
      }
      let text = `📋 *PENDING TASKS:* (${res.count})\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      res.tasks.forEach((t, i) => {
        text += `• *${i + 1}.* ${t.title} _[${t.priority || 'normal'}]_\n`;
      });
      text += `\n_To add:_ \`/task add <title>\` | _To complete:_ \`/task done <id>\``;
      return safeReply(ctx, text, { parse_mode: 'Markdown' });
    } catch (err) {
      return safeReply(ctx, `🦝⚠️ Task manager error: ${err.message}`);
    }
  });

  // 20. /remind command — Persistent Scheduler
  bot.command(['remind', 'reminder', 'schedule'], async (ctx) => {
    const input = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);

    if (!input) {
      return safeReply(ctx, '⏰ *ROCKET REMINDER* 🦝🐾\n\nUsage: `/remind <text>`\n_Example:_ `/remind Call with team at 5pm`', { parse_mode: 'Markdown' });
    }

    try {
      const res = await executeRocketTool('manage_schedule', { action: 'schedule', reminderText: input }, { isSandy: isOwner });
      return safeReply(ctx, `⏰ *Reminder Scheduled:* "${res.text}" 🦝🐾`, { parse_mode: 'Markdown' });
    } catch (err) {
      return safeReply(ctx, `🦝⚠️ Reminder error: ${err.message}`);
    }
  });

  // 21. /check command — Website Security & SSL Audit
  bot.command(['check', 'safety', 'sec'], async (ctx) => {
    const url = (ctx.match || '').trim();
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);

    if (!url) {
      return safeReply(ctx, '🛡️ *ROCKET WEBSITE SECURITY AUDIT* 🦝\n\nUsage: `/check <url>`\n_Example:_ `/check https://google.com`', { parse_mode: 'Markdown' });
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    try {
      const res = await executeRocketTool('check_website_safety', { url }, { isSandy: isOwner });
      let text = `🛡️ *WEBSITE SAFETY AUDIT* 🦝\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `• *URL:* \`${res.url}\`\n`;
      text += `• *Status:* ${res.safetyStatus === 'safe' ? '🟢 SAFE' : '🔴 SUSPICIOUS / RISKY'}\n`;
      text += `• *Risk Level:* ${res.riskLevel}\n`;
      if (res.certificate) text += `• *SSL Certificate:* ${res.certificate}\n`;
      return safeReply(ctx, text, { parse_mode: 'Markdown' });
    } catch (err) {
      return safeReply(ctx, `🦝⚠️ Safety check error: ${err.message}`);
    }
  });

  // 22. /sandy command — Boss Sandy Live Status
  bot.command(['sandy', 'boss', 'owner'], async (ctx) => {
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);
    try {
      const res = await executeRocketTool('get_sandy_status', {}, { isSandy: isOwner });
      let text = `👑 *SANDY (NERO AURELIUS) — LIVE STATUS* 🦝✨\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `• *Availability:* ${res.availability || 'Occupied'}\n`;
      text += `• *Activity:* ${res.activity || 'Building Nero Labs'}\n`;
      text += `• *Game / Server:* ${res.gameInfo || 'Active'}\n`;
      if (res.recentNotes) text += `• *Notes:* _${res.recentNotes}_\n`;
      return safeReply(ctx, text, { parse_mode: 'Markdown' });
    } catch (err) {
      return safeReply(ctx, `🦝⚠️ Status lookup error: ${err.message}`);
    }
  });

  // Group member join handler — Rocket greets new members & self-initializes
  bot.on(':new_chat_members', async (ctx) => {
    const newMembers = ctx.message?.new_chat_members || [];
    const botId = ctx.me?.id;
    const botAdded = newMembers.some((m) => m.id === botId);

    if (botAdded) {
      trackGroupActivity(ctx.chat);
      registerOrUpdateGroup(ctx.chat.id, ctx.chat.title, ctx.chat.type, 1);
      if (!getConfig(`text_mode_${ctx.chat.id}`, null)) {
        setConfig(`text_mode_${ctx.chat.id}`, 'on');
      }
      const state = rocketLifeEngine.getState(`group_${ctx.chat.id}`);
      const welcomeMsg = renderRocketGroupControlMessage(ctx, state);
      const keyboard = buildRocketGroupKeyboard(ctx);
      return safeReply(ctx, welcomeMsg, { parse_mode: 'Markdown', reply_markup: keyboard });
    }

    // Greet joining members with cheeky raccoon style
    const names = newMembers.map((m) => m.first_name).filter(Boolean).join(', ');
    if (names) {
      await safeReply(ctx, `🦝🐾 *YO!* Welcome to the crew, *${names}*! I'm Rocket, Sandy's partner-in-crime! Bring pizza 🍕 or tacos 🌮 and check our Mini App!`, {
        parse_mode: 'Markdown',
      });
    }
  });

  // Inline callback query handlers
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const contextId = ctx.chat?.type === 'private' ? `user_${ctx.from.id}` : `group_${ctx.chat?.id}`;

    // Group Chat Mode Toggle
    if (data.startsWith('rocket_toggle_chat_')) {
      const chatId = data.replace('rocket_toggle_chat_', '');
      const current = getConfig(`text_mode_${chatId}`, 'on');
      const next = current === 'on' || current === 'all' || current === 'true' ? 'off' : 'on';
      setConfig(`text_mode_${chatId}`, next);
      await ctx.answerCallbackQuery({ text: `Chat is now ${next === 'on' ? '🟢 ACTIVE' : '⚪ QUIET'}!` });

      const state = rocketLifeEngine.getState(`group_${chatId}`);
      const msg = renderRocketGroupControlMessage(ctx, state);
      const kb = buildRocketGroupKeyboard(ctx);
      await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb }).catch(() => {});
      return;
    }

    // Group Shared Feeding
    if (data.startsWith('rocket_group_feed_pizza_')) {
      const chatId = data.replace('rocket_group_feed_pizza_', '');
      const updated = rocketLifeEngine.feed(`group_${chatId}`, ctx.from.id, ctx.from.first_name, 'pizza', 1);
      await ctx.answerCallbackQuery({ text: 'Fed 1 Pizza to group stash! 🍕' });
      await safeReply(ctx, `🦝🍕 *NOM!* ${ctx.from.first_name} fed 1 Pizza to the group stash!\n• Pizza Stash: *${updated.pizza_inventory}* 🍕 | Hunger: *${updated.hunger_level}%* [${updated.hunger_state}]`, { parse_mode: 'Markdown' });
      return;
    }

    if (data.startsWith('rocket_group_feed_taco_')) {
      const chatId = data.replace('rocket_group_feed_taco_', '');
      const updated = rocketLifeEngine.feed(`group_${chatId}`, ctx.from.id, ctx.from.first_name, 'taco', 1);
      await ctx.answerCallbackQuery({ text: 'Fed 1 Taco to group stash! 🌮' });
      await safeReply(ctx, `🦝🌮 *CRUNCH!* ${ctx.from.first_name} fed 1 Taco to the group stash!\n• Taco Stash: *${updated.taco_inventory}* 🌮 | Hunger: *${updated.hunger_level}%* [${updated.hunger_state}]`, { parse_mode: 'Markdown' });
      return;
    }

    // Group Status Card
    if (data.startsWith('rocket_group_status_')) {
      const chatId = data.replace('rocket_group_status_', '');
      const state = rocketLifeEngine.getState(`group_${chatId}`);
      await ctx.answerCallbackQuery();
      await safeReply(ctx, formatRocketStatusCard(state), { parse_mode: 'Markdown' });
      return;
    }

    // Pin Hub in Group
    if (data.startsWith('rocket_group_pin_')) {
      try {
        await ctx.pinChatMessage(ctx.callbackQuery.message.message_id);
        await ctx.answerCallbackQuery({ text: '📌 Hub pinned to group!' });
      } catch (err) {
        await ctx.answerCallbackQuery({ text: 'Give Rocket admin permission to pin messages!', show_alert: true });
      }
      return;
    }

    // Private DM callbacks
    if (data === 'feed_pizza' || data === 'feed_taco') {
      const item = data === 'feed_pizza' ? 'pizza' : 'taco';
      const updated = rocketLifeEngine.feed(contextId, ctx.from.id, ctx.from.first_name, item, 1);
      await ctx.answerCallbackQuery({ text: `Fed 1 ${item}! 🍕 Yum!`, show_alert: false });
      await safeReply(ctx, `🦝✨ *NOM!* Fed 1 ${item}! Hunger: ${updated.hunger_level}% [${updated.hunger_state}]`);
    } else if (data === 'view_status') {
      const state = rocketLifeEngine.getState(contextId);
      await ctx.answerCallbackQuery();
      await safeReply(ctx, formatRocketStatusCard(state), { parse_mode: 'Markdown' });
    }
  });

  // General text message handler
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return; // handled by commands

    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);
    const userName = ctx.from?.first_name || 'Friend';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;
    const botUsername = ctx.me?.username || 'R0CK3TAI';
    const botId = ctx.me?.id;

    // In groups: Record message to database archive and track activity so Rocket is fully group-aware
    if (isGroup) {
      trackGroupActivity(ctx.chat);
      if (ctx.message) {
        messageArchiver.recordIncomingMessage(ctx).catch(() => {});
      }
    }

    const textMode = isGroup ? getConfig(`text_mode_${ctx.chat.id}`, 'on') : 'on';
    const isTextModeActive = textMode === 'on' || textMode === 'all' || textMode === 'true';

    // Discern conversational address: Is the message intended for Rocket?
    const address = discernConversationalAddress({
      text,
      isGroup,
      botUsername,
      botId,
      replyToMessage: ctx.message.reply_to_message,
      isOwner,
      isTextModeActive,
    });

    // In group chats: Never interrupt if user is explicitly addressing another human
    if (isGroup && !address.isAddressedToRocket) {
      return; // Silent observation, blends seamlessly with the group
    }

    // In 1-on-1 private chat: Check if user is asking bot to wait or talking to someone else
    if (!isGroup && address.isTalkingToSomeoneElse) {
      if (/\b(?:don'?t\s+reply|shh|wait\s+bro|holding|on\s+call|busy\s+talking|call\s+pe\s+hu)\b/i.test(text)) {
        return safeReply(ctx, '🤐🐾 *zips lips and nods quietly* Stealth mode on! Take your time, boss!');
      }
    }

    const state = rocketLifeEngine.getState(contextId);

    // 0a. PDF Generation Request in Natural Language
    if (pdfService.isPdfGenerationRequest(text)) {
      const targetPages = pdfService.extractTargetPages(text);
      return handleRocketPdfGeneration(ctx, text, targetPages, isOwner, contextId, userName);
    }

    // 0b. Natural Language Study / Explain Request
    const studyPromptMatch = text.match(/^(?:teach\s+me|explain|study\s+guide\s+for|masterclass\s+on)\s+(.+)/i);
    if (studyPromptMatch && !pdfService.isPdfGenerationRequest(text)) {
      const topicToExplain = studyPromptMatch[1].trim();
      ctx.replyWithChatAction('typing').catch(() => {});
      try {
        const studyRes = await rocketStudyService.explainTopic({
          topic: topicToExplain,
          senderName: userName,
        });
        rocketLifeEngine.consumeTokens(contextId, 250, 450, 'deepseek-v4.1-flash');
        return safeReply(ctx, studyRes.formattedText, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        });
      } catch (stErr) {
        console.warn('[NL Study Fallthrough]:', stErr.message);
      }
    }

    // 1. Sandy Abuse Guard
    if (detectSandyAbuse(text)) {
      const defense = generateDefenseResponse(userName);
      return safeReply(ctx, defense);
    }

    // 2. Sleep Guard (5 messages wake up)
    if (state.is_sleeping) {
      const sleepResult = rocketLifeEngine.registerSleepMessage(contextId, ctx.from.id);
      return safeReply(ctx, sleepResult.message);
    }

    // 3. Hunger / Starving Guard (0% fuel)
    if (state.hunger_state === 'starving' && state.fuel_tokens_remaining <= 0 && state.pizza_inventory <= 0 && state.taco_inventory <= 0) {
      if (!isOwner) {
        const starvingRefusal = generateStarvingResponse(userName, false);
        return safeReply(ctx, starvingRefusal);
      }
    }

    // 4. Send typing chat action heartbeat
    ctx.replyWithChatAction('typing').catch(() => {});
    const typingHeartbeat = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 3500);

    // 5. Gather recent group context if in group chat
    let recentChatContext = null;
    if (isGroup) {
      try {
        const rawMsgs = getLatestChatMessages(ctx.chat.id, 4);
        if (rawMsgs && rawMsgs.length > 0) {
          recentChatContext = rawMsgs
            .filter((m) => m.platform_message_id !== ctx.message.message_id)
            .map((m) => `${m.sender_name || 'Member'}: "${(m.raw_content || '').slice(0, 100)}"`)
            .join('\n');
        }
      } catch {}
    }

    // 6. Build dynamic persona directive & call ScaleMax via ultra-fast model
    const activeModel = 'gpt-6-luna';
    const directive = buildRocketDirective({
      senderName: userName,
      isSandy: isOwner,
      userRole: isOwner ? 'owner' : 'member',
      lifeState: state,
      recipientType: address.recipientType,
      isGroup,
      groupTitle: ctx.chat.title || 'Community',
      groupId: ctx.chat.id,
      recentChat: recentChatContext,
    });

    const messages = [
      { role: 'system', content: directive },
      { role: 'user', content: text },
    ];

    // Ultra-low latency & token efficiency:
    // Short greetings / check-ins cap to 100 tokens (~300ms latency)
    // Group banter caps to 160 tokens (~600ms latency)
    // Standard chat caps to 300 tokens
    const isShortGreeting = /^(?:hi|hey|hello|yo|oi|sup|hlo|namaste|kese ho|how are you|kya haal|kya kar raha hai)\b/i.test(text);
    const targetMaxTokens = isShortGreeting ? 100 : isGroup ? 160 : 300;

    // Detect if external tools are requested
    const needsTools = !isShortGreeting && /(?:search|look\s*up|google|browse|url|http|weather|calc|eval|math|task|todo|remind|schedule|sandy\s+status|status\s+of\s+sandy|who\s+is\s+sandy|safety|scam|minecraft|image\s+of|photo\s+of|picture\s+of|show\s+me)\b/i.test(text);

    const toolContext = {
      chatId: String(ctx.chat.id),
      userId: String(ctx.from?.id),
      isSandy: isOwner,
      isGroup,
      userIsOwner: isOwner,
      pendingImages: [],
      pendingMedia: [],
    };

    let aiReply = '';
    let promptTokens = 30;
    let completionTokens = 40;

    try {
      if (scaleMaxAdapter.isConfigured()) {
        const completion = await scaleMaxAdapter.executeChatWithTools({
          model: 'gpt-6-luna',
          messages,
          chatId: String(ctx.chat.id),
          reasoningEffort: 'none',
          maxTokens: targetMaxTokens,
          temperature: 0.7,
          tools: needsTools ? ROCKET_TOOL_DEFINITIONS : null,
          toolExecutor: executeRocketTool,
          context: toolContext,
          maxToolTurns: 2,
        });

        aiReply = completion?.text || '';
        promptTokens = completion?.usage?.prompt_tokens || Math.round(text.length / 4);
        completionTokens = completion?.usage?.completion_tokens || Math.round(aiReply.length / 4);

        // Deliver any pending images captured by tools (e.g. search_images)
        if (toolContext.pendingImages && toolContext.pendingImages.length > 0) {
          for (const img of toolContext.pendingImages.slice(0, 2)) {
            try {
              await ctx.replyWithPhoto(new InputFile(img.buffer), {
                caption: img.item?.title ? `🖼️ ${img.item.title}` : undefined,
                reply_parameters: { message_id: ctx.message.message_id },
              });
            } catch (pErr) {
              console.warn('[RocketBot Tool Image Send Note]:', pErr.message);
            }
          }
        }
      } else {
        aiReply = `🦝🍕 *snickers playfully* Yo ${userName}! Rocket is standing by! (Rocket Neural Engine running in offline mode). Bring pizza! 🐾`;
      }
    } catch (err) {
      console.warn('[RocketBot Chat Error]:', err.message);
      aiReply = `🦝🐾 *rubs whiskers* Whoops, had a little hiccup reaching the server! But Rocket is right here! Remind me in a sec! 😈`;
    } finally {
      clearInterval(typingHeartbeat);
    }

    // Deduct fuel based on actual token usage
    rocketLifeEngine.consumeTokens(contextId, promptTokens, completionTokens, 'gpt-6-luna');

    await safeReply(ctx, scrubRestrictedBrandNames(aiReply), {
      reply_parameters: { message_id: ctx.message.message_id },
    });
  });

  // Document upload handler (Reading & Analyzing PDFs and Uncompressed Images)
  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    const isPdf = doc.mime_type === 'application/pdf' || doc.file_name?.toLowerCase().endsWith('.pdf');
    const isImageDoc = doc.mime_type?.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(doc.file_name || '');

    if (!isPdf && !isImageDoc) return;

    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);
    const userName = ctx.from?.first_name || 'Friend';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;
    const state = rocketLifeEngine.getState(contextId);

    // If document is an uncompressed image file, analyze it via raccoon vision
    if (isImageDoc) {
      ctx.replyWithChatAction('typing').catch(() => {});
      const heartbeat = setInterval(() => {
        ctx.replyWithChatAction('typing').catch(() => {});
      }, 3500);

      try {
        const file = await ctx.api.getFile(doc.file_id);
        const botToken = ctx.api?.token || config.rocketTelegramBotToken;
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
        const res = await fetch(fileUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        const base64 = buffer.toString('base64');
        const mime = doc.mime_type || 'image/jpeg';

        const caption = ctx.message.caption || '';
        const directive = `You are Rocket, a mischievous, cheeky, hyper-observant raccoon AI companion inspecting an uncompressed image document "${doc.file_name}" sent by ${userName} ${isOwner ? '(your Boss Sandy!)' : ''}. Speak in character as Rocket (playful, sharp, observant, loves pizza/tacos 🦝🍕). Keep it concise (2-4 sentences).`;

        const completion = await scaleMaxAdapter.createChatCompletion({
          model: 'gpt-6-luna',
          messages: [
            { role: 'system', content: directive },
            {
              role: 'user',
              content: [
                { type: 'text', text: caption || `Inspect this image: ${doc.file_name}` },
                { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
              ],
            },
          ],
          maxTokens: 250,
          temperature: 0.7,
          reasoningEffort: 'none',
          timeoutMs: 45000,
        });

        const reply = completion?.text || `🦝🐾 *inspects document image* Rocket examined "${doc.file_name}" with sharp raccoon eyes! Looks super clear! 🍕✨`;
        await safeReply(ctx, reply, { reply_parameters: { message_id: ctx.message.message_id } });
      } catch (err) {
        console.warn('[RocketBot Doc Image Error]:', err.message);
        await safeReply(ctx, `🦝🐾 *inspects file* Received "${doc.file_name}"! Ask me any specific question about it! 🍕`);
      } finally {
        clearInterval(heartbeat);
      }
      return;
    }

    // PDF Reading Handler
    if (!isOwner && state.pizza_inventory < 1 && state.fuel_tokens_remaining <= 0) {
      rocketLifeEngine.feed(contextId, ctx.from?.id, userName, 'pizza', 1);
    }

    const progressMsg = await safeReply(
      ctx,
      `📑 *Rocket is reading "${doc.file_name || 'document.pdf'}" with his sharp raccoon eyes...* 🦝🐾\n_Extracting text & analyzing structure..._`,
      { parse_mode: 'Markdown' }
    );

    const typingHeartbeat = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 3500);

    try {
      const file = await ctx.api.getFile(doc.file_id);
      const botToken = ctx.api?.token || config.rocketTelegramBotToken;
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
      const res = await fetch(fileUrl);
      const buffer = Buffer.from(await res.arrayBuffer());

      const parsed = await pdfService.readPdf(buffer);
      if (!parsed.ok) {
        throw new Error(parsed.error || 'Failed to parse PDF.');
      }

      if (!isOwner) {
        rocketLifeEngine.chargeTaskFee(contextId, 'pdf_reading', `Read: ${doc.file_name}`);
      }

      const prompt = `You are Rocket, a mischievous raccoon AI. Summarize and review this document: "${doc.file_name}".\n\nExtracted Content:\n${parsed.text.slice(0, 3000)}`;
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gpt-6-luna',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
        reasoningEffort: 'none',
        timeoutMs: 35000,
      });

      rocketLifeEngine.consumeTokens(contextId, 500, 300, 'gpt-6-luna');

      const reply = `📑 *Rocket's Analysis of "${doc.file_name}":*\n\n` +
        `📊 *Pages:* ${parsed.pageCount} | *Words:* ~${parsed.wordCount}\n\n` +
        `${completion?.text || 'Read the document! Ready for your questions! 🦝'}`;

      await safeReply(ctx, reply, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      console.error('[RocketBot PDF Read Error]:', err.message);
      await safeReply(ctx, `🦝⚠️ Couldn't read that PDF! (${err.message})`);
    } finally {
      clearInterval(typingHeartbeat);
      if (progressMsg) {
        await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});
      }
    }
  });

  // Multimodal Photo Handler (Rocket Raccoon Vision & Inspection)
  bot.on('message:photo', async (ctx) => {
    const isOwner = isSandy(ctx.from?.id, ctx.from?.username, ctx.from?.first_name);
    const userName = ctx.from?.first_name || 'Friend';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;
    const state = rocketLifeEngine.getState(contextId);
    const caption = ctx.message.caption || '';

    // In groups, respond if mentioned, replied to, or text mode is active
    if (isGroup) {
      const isMentioned = caption.includes(`@${ctx.me.username}`) || caption.toLowerCase().includes('rocket');
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      const textMode = getConfig(`text_mode_${ctx.chat.id}`, 'on');
      const isTextModeActive = textMode === 'on' || textMode === 'all';
      if (!isMentioned && !isReplyToBot && !isTextModeActive) return;
    }

    // Sandy Abuse Guard
    if (detectSandyAbuse(caption)) {
      return safeReply(ctx, generateDefenseResponse(userName));
    }

    // Sleep Guard
    if (state.is_sleeping) {
      const sleepResult = rocketLifeEngine.registerSleepMessage(contextId, ctx.from.id);
      return safeReply(ctx, sleepResult.message);
    }

    // Pizza task fee guard: Never hard-fail, grant emergency crumb if inventory is empty
    if (!isOwner && state.pizza_inventory < 1 && state.fuel_tokens_remaining <= 0) {
      rocketLifeEngine.feed(contextId, ctx.from?.id, userName, 'pizza', 1);
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    const typingHeartbeat = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 3500);

    try {
      const photos = ctx.message.photo || [];
      // Pick medium-high resolution photo (2nd from last, ~800px) for 60% faster transfer & lower token usage
      const chosenPhoto = photos.length > 2 ? photos[photos.length - 2] : photos[photos.length - 1];
      const file = await ctx.api.getFile(chosenPhoto.file_id);
      const botToken = ctx.api?.token || config.rocketTelegramBotToken;
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
      const res = await fetch(fileUrl);
      const buffer = Buffer.from(await res.arrayBuffer());
      const base64 = buffer.toString('base64');

      if (!isOwner) {
        rocketLifeEngine.chargeTaskFee(contextId, 'image_analysis', 'Photo Analysis');
      }

      const rocketVisionDirective = `You are Rocket, a mischievous, cheeky, hyper-observant raccoon AI companion.
You are inspecting an image sent by ${userName} ${isOwner ? '(your Boss Sandy!)' : ''}.
${caption ? `User's caption/question: "${caption}"` : 'Tell them what you see in the image!'}

Rules:
- Speak in character as Rocket the raccoon (playful, cheeky, observant, loves pizza/tacos 🦝🐾🍕).
- Keep your answer short, punchy, and hilarious (2 to 4 sentences).
- If it is food (especially pizza, tacos, trash, or snacks), get super excited!
- If it is a person or object, notice the fun, prominent details!`;

      let aiReply = '';
      if (scaleMaxAdapter.isConfigured()) {
        const completion = await scaleMaxAdapter.createChatCompletion({
          model: 'gpt-6-luna',
          messages: [
            { role: 'system', content: rocketVisionDirective },
            {
              role: 'user',
              content: [
                { type: 'text', text: caption || 'Look at this picture!' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
              ],
            },
          ],
          maxTokens: 250,
          temperature: 0.7,
          reasoningEffort: 'none',
          timeoutMs: 45000,
        });
        aiReply = completion?.text || '🦝🐾 *inspects photo with sharp eyes* Rocket saw it! Looks awesome!';
        rocketLifeEngine.consumeTokens(contextId, 400, 150, 'gpt-6-luna');
      } else {
        aiReply = `🦝🐾 *squints at photo* Rocket sees it! Sharp raccoon vision confirmed! (Offline test mode). Bring pizza! 🍕`;
      }

      await safeReply(ctx, aiReply, {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      console.error('[RocketBot Photo Error]:', err.message);
      await safeReply(ctx, `🦝🐾 *inspects with curious raccoon eyes* I received your photo! Ask me anything about what's in it, or send another with a question in the caption! 🍕✨`);
    } finally {
      clearInterval(typingHeartbeat);
    }
  });

  // Voice & Audio Handler
  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await ctx.reply('🦝🐾 *ears twitch* I hear that audio note! My raccoon ears are sharp! Type me a message or feed me pizza while I sharpen my claws! 🍕😈');
  });

  // Sticker Handler
  bot.on('message:sticker', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const stickerReplies = [
      '🦝🐾 *bats at the sticker with agile paws* Nice sticker! Got any pizza to go with that? 🍕',
      '😈 *snickers mischievously* Sending stickers? I see you have good taste! 🦝✨',
      '🌮 *sniffs sticker* Not edible, but I approve! 🦝🐾',
    ];
    await ctx.reply(stickerReplies[Math.floor(Math.random() * stickerReplies.length)]);
  });
}

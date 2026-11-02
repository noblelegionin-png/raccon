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

export function registerRocketHandlers(bot) {
  const miniAppUrl = config.rocketMiniAppUrl || config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app';
  const cleanAppUrl = miniAppUrl.replace(/\/+$/, '');

  // 1. /start command
  bot.command('start', async (ctx) => {
    const isOwner = isSandy(ctx.from?.id);
    const userName = ctx.from?.first_name || 'Friend';
    const contextId = ctx.chat.type === 'private' ? `user_${ctx.from.id}` : `group_${ctx.chat.id}`;
    const state = rocketLifeEngine.getState(contextId);

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

    await ctx.reply(welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // 2. /status command
  bot.command('status', async (ctx) => {
    const contextId = ctx.chat.type === 'private' ? `user_${ctx.from.id}` : `group_${ctx.chat.id}`;
    const state = rocketLifeEngine.getState(contextId);
    const card = formatRocketStatusCard(state);

    const keyboard = new InlineKeyboard()
      .webApp('🚀 Open Raccoon OS', `${cleanAppUrl}/raccoon/index.html`)
      .text('🔄 Refresh', 'view_status');

    await ctx.reply(card, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // 3. /rock3t, /os, /app commands
  bot.command(['rock3t', 'os', 'app', 'raccoon'], async (ctx) => {
    const keyboard = new InlineKeyboard()
      .webApp('🚀 Launch ROCK3T OS', `${cleanAppUrl}/rock3t/index.html`)
      .row()
      .webApp('🦝 Open Life Engine Hub', `${cleanAppUrl}/raccoon/index.html`);

    await ctx.reply('🐾 Launching the *ROCK3T Web OS* & Personal Environment...', {
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
      `• /rock3t — Launch ROCK3T Simulated Web OS\n` +
      `• /raccoon — Launch Raccoon OS Mini App\n` +
      `• /status — Check Rocket's life, mood, hunger & sleep\n` +
      `• /feed [pizza|taco] — Feed Rocket directly\n` +
      `• /pdf <topic> — Generate executive publication PDF\n` +
      `• /sleep — View current sleep schedule & rest timer\n` +
      `• /wake — Emergency wake-up trigger\n` +
      `• /refill — Sandy only food supply grant\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Base Fuel Rule: 1 Pizza = 5,000 model tokens._\n` +
      `_Task Fee: 1 Pizza for PDF Generation / Reading._\n` +
      `_1h guaranteed rest in every 12h cycle._ 🍕🐾`;
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  });

  // Resilient Rocket Document Delivery with fallback against entity parsing errors
  async function deliverRocketDocument(ctx, result) {
    const inputFile = result.filePath && fs.existsSync(result.filePath)
      ? new InputFile(result.filePath, result.filename)
      : new InputFile(result.buffer, result.filename);

    const cleanCaption = `📄 ${result.title}\n📊 Pages: ${result.pageCount} | Size: ${Math.round(result.sizeBytes / 1024)} KB\n\n${result.summary}`.slice(0, 1024);

    try {
      return await ctx.replyWithDocument(inputFile, {
        caption: `📄 *${result.title}*\n📊 *Pages:* ${result.pageCount} | *Size:* ${Math.round(result.sizeBytes / 1024)} KB\n\n${result.summary}`.slice(0, 1024),
        parse_mode: 'Markdown',
        reply_parameters: ctx.message?.message_id ? { message_id: ctx.message.message_id } : undefined,
      });
    } catch (err1) {
      console.warn('[RocketBot PDF Delivery Note] Attempt 1 failed:', err1.message);
      try {
        return await ctx.replyWithDocument(inputFile, {
          caption: cleanCaption,
          reply_parameters: ctx.message?.message_id ? { message_id: ctx.message.message_id } : undefined,
        });
      } catch (err2) {
        console.warn('[RocketBot PDF Delivery Note] Attempt 2 failed:', err2.message);
        return await ctx.replyWithDocument(inputFile);
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
        `_Task Fee: 1 Pizza per dossier. Powered by GPT-6 Luna & PDFKit._ 🍕✨`,
        { parse_mode: 'Markdown' }
      );
    }

    const targetPages = pdfService.extractTargetPages(input);
    await handleRocketPdfGeneration(ctx, input, targetPages, isOwner, contextId, userName);
  });

  // Inline callback query handlers
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const contextId = ctx.chat?.type === 'private' ? `user_${ctx.from.id}` : `group_${ctx.chat?.id}`;

    if (data === 'feed_pizza' || data === 'feed_taco') {
      const item = data === 'feed_pizza' ? 'pizza' : 'taco';
      const updated = rocketLifeEngine.feed(contextId, ctx.from.id, ctx.from.first_name, item, 1);
      await ctx.answerCallbackQuery({ text: `Fed 1 ${item}! 🍕 Yum!`, show_alert: false });
      await ctx.reply(`🦝✨ *NOM!* Fed 1 ${item}! Hunger: ${updated.hunger_level}% [${updated.hunger_state}]`);
    } else if (data === 'view_status') {
      const state = rocketLifeEngine.getState(contextId);
      await ctx.answerCallbackQuery();
      await ctx.reply(formatRocketStatusCard(state), { parse_mode: 'Markdown' });
    }
  });

  // General text message handler
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return; // handled by commands

    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const botUsername = ctx.me.username;

    // In groups, only respond if mentioned, replied to, or name mentioned
    if (isGroup) {
      const isMentioned = text.includes(`@${botUsername}`) || text.toLowerCase().includes('rocket');
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      if (!isMentioned && !isReplyToBot) {
        return; // ignore non-directed chat in groups
      }
    }

    const isOwner = isSandy(ctx.from.id);
    const userName = ctx.from.first_name || 'Friend';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;
    const state = rocketLifeEngine.getState(contextId);

    // 0. PDF Generation Request in Natural Language
    if (pdfService.isPdfGenerationRequest(text)) {
      const targetPages = pdfService.extractTargetPages(text);
      return handleRocketPdfGeneration(ctx, text, targetPages, isOwner, contextId, userName);
    }

    // 1. Sandy Abuse Guard
    if (detectSandyAbuse(text)) {
      const defense = generateDefenseResponse(userName);
      return ctx.reply(defense);
    }

    // 2. Sleep Guard (5 messages wake up)
    if (state.is_sleeping) {
      const sleepResult = rocketLifeEngine.registerSleepMessage(contextId, ctx.from.id);
      return ctx.reply(sleepResult.message);
    }

    // 3. Hunger / Starving Guard (0% fuel)
    if (state.hunger_state === 'starving' && state.fuel_tokens_remaining <= 0 && state.pizza_inventory <= 0 && state.taco_inventory <= 0) {
      if (!isOwner) {
        const starvingRefusal = generateStarvingResponse(userName, false);
        return ctx.reply(starvingRefusal);
      }
    }

    // 4. Send typing chat action heartbeat to eliminate perceived latency
    ctx.replyWithChatAction('typing').catch(() => {});
    const typingHeartbeat = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 3500);

    // 5. Build dynamic persona directive & call ScaleMax via optimized adapter
    const activeModel = getActiveModelId();
    const directive = buildRocketDirective({
      senderName: userName,
      isSandy: isOwner,
      userRole: isOwner ? 'owner' : 'member',
      lifeState: state,
    });

    const messages = [
      { role: 'system', content: directive },
      { role: 'user', content: text },
    ];

    let aiReply = '';
    let promptTokens = 30;
    let completionTokens = 40;

    try {
      if (scaleMaxAdapter.isConfigured()) {
        const completion = await scaleMaxAdapter.createChatCompletion({
          model: activeModel || 'gpt-6-luna',
          messages,
          maxTokens: 650,
          temperature: 0.75,
          timeoutMs: 18000,
        });

        aiReply = completion?.text || '';
        promptTokens = completion?.usage?.prompt_tokens || Math.round(text.length / 4);
        completionTokens = completion?.usage?.completion_tokens || Math.round(aiReply.length / 4);
      } else {
        aiReply = `🦝🍕 *snickers playfully* Yo ${userName}! Rocket is standing by! (ScaleMax running in offline test mode). Bring pizza! 🐾`;
      }
    } catch (err) {
      console.warn('[RocketBot Chat Error]:', err.message);
      aiReply = `🦝🐾 *rubs whiskers* Whoops, had a little glitch reaching the server! But Rocket is right here! Remind me in a sec! 😈`;
    } finally {
      clearInterval(typingHeartbeat);
    }

    // Deduct fuel based on actual token usage
    rocketLifeEngine.consumeTokens(contextId, promptTokens, completionTokens, activeModel || 'gpt-6-luna');

    await ctx.reply(aiReply);
  });

  // Document upload handler (Reading & Analyzing PDFs)
  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    const isPdf = doc.mime_type === 'application/pdf' || doc.file_name?.toLowerCase().endsWith('.pdf');
    if (!isPdf) return;

    const isOwner = isSandy(ctx.from.id);
    const userName = ctx.from.first_name || 'Friend';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;
    const state = rocketLifeEngine.getState(contextId);

    // Pizza task fee guard for PDF reading
    if (!isOwner && state.pizza_inventory < 1 && state.fuel_tokens_remaining <= 0) {
      return ctx.reply(
        `🦝🍕 *Hold up, ${userName}!* Reading and analyzing full PDF documents costs 1 pizza task fee!\n` +
        `Feed me with /feed pizza first! 😈`
      );
    }

    const progressMsg = await ctx.reply(
      `📑 *Rocket is reading "${doc.file_name || 'document.pdf'}" with his sharp raccoon eyes...* 🦝🐾\n_Extracting text & analyzing structure..._`,
      { parse_mode: 'Markdown' }
    ).catch(() => null);

    const typingHeartbeat = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 3500);

    try {
      const file = await ctx.getFile();
      const botToken = ctx.api?.token || config.rocketTelegramBotToken;
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
      const res = await fetch(fileUrl);
      const buffer = Buffer.from(await res.arrayBuffer());

      const parsed = await pdfService.readPdf(buffer);
      if (!parsed.ok) {
        throw new Error(parsed.error || 'Failed to parse PDF.');
      }

      // Charge 1 pizza fee
      if (!isOwner) {
        rocketLifeEngine.chargeTaskFee(contextId, 'pdf_reading', `Read: ${doc.file_name}`);
      }

      const activeModel = getActiveModelId();
      const prompt = `You are Rocket, a mischievous raccoon AI. Summarize and review this document: "${doc.file_name}".\n\nExtracted Content:\n${parsed.text.slice(0, 3000)}`;
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel || 'gpt-6-luna',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
      });

      rocketLifeEngine.consumeTokens(contextId, 500, 300, activeModel || 'gpt-6-luna');

      const reply = `📑 *Rocket's Analysis of "${doc.file_name}":*\n\n` +
        `📊 *Pages:* ${parsed.pageCount} | *Words:* ~${parsed.wordCount}\n\n` +
        `${completion?.text || 'Read the document! Ready for your questions! 🦝'}`;

      await ctx.reply(reply, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      console.error('[RocketBot PDF Read Error]:', err.message);
      await ctx.reply(`🦝⚠️ Couldn't read that PDF! (Error: ${err.message})`);
    } finally {
      clearInterval(typingHeartbeat);
      if (progressMsg) {
        await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});
      }
    }
  });

  // Multimodal Photo Handler (Rocket Raccoon Vision & Inspection)
  bot.on('message:photo', async (ctx) => {
    const isOwner = isSandy(ctx.from?.id);
    const userName = ctx.from?.first_name || 'Friend';
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const contextId = isGroup ? `group_${ctx.chat.id}` : `user_${ctx.from.id}`;
    const state = rocketLifeEngine.getState(contextId);
    const caption = ctx.message.caption || '';

    // In groups, only respond if mentioned, replied to, or name mentioned
    if (isGroup) {
      const isMentioned = caption.includes(`@${ctx.me.username}`) || caption.toLowerCase().includes('rocket');
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      if (!isMentioned && !isReplyToBot) return;
    }

    // Sandy Abuse Guard
    if (detectSandyAbuse(caption)) {
      return ctx.reply(generateDefenseResponse(userName));
    }

    // Sleep Guard
    if (state.is_sleeping) {
      const sleepResult = rocketLifeEngine.registerSleepMessage(contextId, ctx.from.id);
      return ctx.reply(sleepResult.message);
    }

    // Pizza task fee guard for Image Analysis
    if (!isOwner && state.pizza_inventory < 1 && state.fuel_tokens_remaining <= 0) {
      return ctx.reply(
        `🦝🍕 *Hold up, ${userName}!* Inspecting photos with my sharp raccoon eyes costs 1 pizza task fee!\n` +
        `Feed me with /feed pizza first! 😈`
      );
    }

    ctx.replyWithChatAction('typing').catch(() => {});
    const typingHeartbeat = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 3500);

    try {
      const file = await ctx.getFile();
      const botToken = ctx.api?.token || config.rocketTelegramBotToken;
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
      const res = await fetch(fileUrl);
      const buffer = Buffer.from(await res.arrayBuffer());
      const base64 = buffer.toString('base64');

      // Charge 1 pizza task fee
      if (!isOwner) {
        rocketLifeEngine.chargeTaskFee(contextId, 'image_analysis', 'Photo Analysis');
      }

      const activeModel = getActiveModelId();
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
          maxTokens: 350,
          temperature: 0.75,
        });
        aiReply = completion?.text || '🦝🐾 *inspects photo with sharp eyes* Rocket saw it! Looks awesome!';
        rocketLifeEngine.consumeTokens(contextId, 400, 150, 'gpt-6-luna');
      } else {
        aiReply = `🦝🐾 *squints at photo* Rocket sees it! Sharp raccoon vision confirmed! (Offline test mode). Bring pizza! 🍕`;
      }

      await ctx.reply(aiReply, {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      console.error('[RocketBot Photo Error]:', err.message);
      await ctx.reply(`🦝⚠️ Whoops, my paw smudged the lens! (Error: ${err.message})`);
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

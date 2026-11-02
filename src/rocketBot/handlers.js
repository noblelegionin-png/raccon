import { InlineKeyboard } from 'grammy';
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
      `• /raccoon — Launch Raccoon OS Mini App\n` +
      `• /status — Check Rocket's life, mood, hunger & sleep\n` +
      `• /feed [pizza|taco] — Feed Rocket directly\n` +
      `• /sleep — View current sleep schedule & rest timer\n` +
      `• /wake — Emergency wake-up trigger\n` +
      `• /refill — Sandy only food supply grant\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Base Fuel Rule: 1 Pizza = 5,000 model tokens._\n` +
      `_1h guaranteed rest in every 12h cycle._ 🍕🐾`;
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
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

    // 4. Send typing chat action
    await ctx.replyWithChatAction('typing');

    // 5. Build dynamic persona directive & call ScaleMax GPT-6 Luna
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

    if (scaleMaxAdapter.isConfigured()) {
      try {
        const response = await fetch(`${scaleMaxAdapter.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${scaleMaxAdapter.apiKey}`,
          },
          body: JSON.stringify({
            model: activeModel || 'gpt-6-luna',
            messages,
            max_tokens: 650,
            temperature: 0.75,
          }),
        });

        if (response.ok) {
          const json = await response.json();
          aiReply = json.choices?.[0]?.message?.content || '';
          promptTokens = json.usage?.prompt_tokens || Math.round(text.length / 4);
          completionTokens = json.usage?.completion_tokens || Math.round(aiReply.length / 4);
        } else {
          throw new Error(`ScaleMax HTTP ${response.status}`);
        }
      } catch (err) {
        aiReply = `🦝🐾 *rubs whiskers* Whoops, had a little glitch reaching the server! But Rocket is right here! (Error: ${err.message})`;
      }
    } else {
      aiReply = `🦝🍕 *snickers playfully* Yo ${userName}! Rocket is standing by! (ScaleMax running in offline test mode). Bring pizza! 🐾`;
    }

    // Deduct fuel based on actual token usage
    rocketLifeEngine.consumeTokens(contextId, promptTokens, completionTokens, activeModel || 'gpt-6-luna');

    await ctx.reply(aiReply);
  });
}

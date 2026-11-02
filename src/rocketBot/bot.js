import { Bot } from 'grammy';
import { config } from '../config.js';
import { registerRocketHandlers } from './handlers.js';

let rocketBotInstance = null;
let isBotRunning = false;
let shouldKeepRunning = false;
let supervisorActive = false;

export function getRocketBotInstance() {
  return rocketBotInstance;
}

export function getRocketBotApi() {
  return rocketBotInstance ? rocketBotInstance.api : null;
}

export function getRocketBotStatus() {
  return {
    isEnabled: Boolean(config.rocketTelegramEnabled),
    isConfigured: Boolean(config.rocketTelegramBotToken),
    isRunning: isBotRunning,
  };
}

export function createRocketBot() {
  const token = config.rocketTelegramBotToken;
  if (!token) {
    console.log('[RocketBot] ⏳ ROCKET_TELEGRAM_BOT_TOKEN is not yet set. Rocket Telegram Bot is standing by for credentials from BotFather.');
    return null;
  }

  const bot = new Bot(token);

  // Global Error Boundary - never let an uncaught API error crash the bot
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[RocketBot Error] Update ${ctx?.update?.update_id} failed:`, err.error);
  });

  registerRocketHandlers(bot);
  rocketBotInstance = bot;
  return bot;
}

async function runPollingSupervisor() {
  if (supervisorActive) return;
  supervisorActive = true;

  while (shouldKeepRunning) {
    if (!rocketBotInstance) {
      createRocketBot();
    }

    if (!rocketBotInstance) {
      // Waiting for token configuration
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    try {
      console.log('[RocketBot] Refreshing Rocket Telegram bot & flushing pending updates...');
      try {
        await rocketBotInstance.api.deleteWebhook({ drop_pending_updates: true });
      } catch (whErr) {
        console.warn('[RocketBot Webhook Flush Note]:', whErr.message);
      }

      console.log('[RocketBot] Starting Rocket Telegram bot long-polling with live updates...');
      await rocketBotInstance.start({
        drop_pending_updates: true,
        allowed_updates: [
          'message',
          'edited_message',
          'channel_post',
          'callback_query',
        ],
        onStart: async (botInfo) => {
          isBotRunning = true;
          console.log(`[RocketBot] 🦝 Successfully connected as @${botInfo.username} (${botInfo.id})`);

          const miniAppUrl = config.rocketMiniAppUrl || config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app';
          const cleanUrl = miniAppUrl.replace(/\/+$/, '');

          // 1. Set Chat Menu Button (web_app) for all users -> ROCK3T Web OS
          try {
            await rocketBotInstance.api.setChatMenuButton({
              menu_button: {
                type: 'web_app',
                text: '🚀 ROCK3T OS',
                web_app: { url: `${cleanUrl}/rock3t/index.html` },
              },
            });
            console.log(`[RocketBot] ROCK3T Web OS Menu Button configured: ${cleanUrl}/rock3t/index.html`);
          } catch (btnErr) {
            console.warn('[RocketBot] Could not set global menu button:', btnErr.message);
          }

          // 2. Set Dedicated Owner Button for Sandy
          const ownerId = config.rocketOwnerId || config.telegramOwnerId;
          if (ownerId) {
            try {
              await rocketBotInstance.api.setChatMenuButton({
                chat_id: Number(ownerId),
                menu_button: {
                  type: 'web_app',
                  text: '👑 Sandy ROCK3T',
                  web_app: { url: `${cleanUrl}/rock3t/index.html?access=owner` },
                },
              });
              console.log(`[RocketBot] Dedicated Sandy ROCK3T menu button set for ID ${ownerId}`);
            } catch (ownerBtnErr) {
              console.warn('[RocketBot] Could not set owner menu button:', ownerBtnErr.message);
            }
          }

          // 3. Register official bot commands menu
          try {
            await rocketBotInstance.api.setMyCommands([
              { command: 'start', description: '🦝 Meet Rocket & open Raccoon OS' },
              { command: 'setup', description: '⚙️ Configure Rocket for group & chat controls' },
              { command: 'app', description: '📱 Launch ROCK3T Mini App' },
              { command: 'status', description: '📊 Rocket Life Engine, mood & hunger status' },
              { command: 'feed', description: '🍕 Feed Rocket pizza or tacos' },
              { command: 'sleep', description: '🌙 Sleep schedule & rest cycle timer' },
              { command: 'wake', description: '🚨 Emergency wake-up trigger' },
              { command: 'refill', description: '👑 Sandy only infinite food grant' },
              { command: 'help', description: '📖 Commands & fuel rules guide' },
            ]);
            console.log('[RocketBot] Official Telegram bot commands menu registered successfully.');
          } catch (cmdErr) {
            console.warn('[RocketBot] Could not set bot commands:', cmdErr.message);
          }
        },
      });

      console.log('[RocketBot] Bot polling loop exited cleanly.');
      isBotRunning = false;
      if (!shouldKeepRunning) break;
    } catch (err) {
      isBotRunning = false;
      const isConflict = err?.error_code === 409 || err?.message?.includes('409') || err?.message?.includes('Conflict');
      const waitMs = isConflict ? 4000 : 3000;
      console.warn(`[RocketBot Resilience] Polling interrupted (${err?.message || err}). Reconnecting in ${waitMs / 1000}s...`);

      try {
        await rocketBotInstance?.stop();
      } catch {}
      rocketBotInstance = null;

      if (!shouldKeepRunning) break;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  supervisorActive = false;
}

export async function startRocketBot() {
  if (isBotRunning) {
    console.log('[RocketBot] Bot is already running.');
    return;
  }

  shouldKeepRunning = true;
  runPollingSupervisor().catch((err) => {
    console.error('[RocketBot] Polling supervisor crashed unexpectedly:', err);
  });
}

export async function stopRocketBot() {
  console.log('[RocketBot] Stopping Rocket Telegram bot...');
  shouldKeepRunning = false;
  if (rocketBotInstance && isBotRunning) {
    try {
      await rocketBotInstance.stop();
    } catch {}
  }
  isBotRunning = false;
}

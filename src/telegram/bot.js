import { Bot } from 'grammy';
import { config } from '../config.js';
import { registerBotHandlers } from './handlers.js';

let botInstance = null;
let isBotRunning = false;

export function getBotInstance() {
  return botInstance;
}

export function getBotApi() {
  return botInstance ? botInstance.api : null;
}

export function createBot() {
  if (!config.telegramBotToken) {
    console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN is not configured. Telegram bot transport will remain offline.');
    return null;
  }

  const bot = new Bot(config.telegramBotToken);

  // Global Error Boundary - never let an uncaught API error crash the bot
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[TelegramBot Error] Update ${ctx?.update?.update_id} failed:`, err.error);
  });

  registerBotHandlers(bot);
  botInstance = bot;
  return bot;
}

export async function startBot() {
  if (!botInstance) {
    createBot();
  }

  if (!botInstance) {
    return false;
  }

  try {
    console.log('[TelegramBot] Starting Telegram bot long-polling...');
    // bot.start() is non-blocking in grammy
    botInstance.start({
      drop_pending_updates: false,
      onStart: async (botInfo) => {
        isBotRunning = true;
        console.log(`[TelegramBot] Successfully connected as @${botInfo.username} (${botInfo.id})`);

        // Automatically set the 24/7 Global Telegram Mini App Menu Button for all users
        const webAppUrl = config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app';
        try {
          await botInstance.api.setChatMenuButton({
            menu_button: {
              type: 'web_app',
              text: '⚡ Nero App',
              web_app: { url: webAppUrl },
            },
          });
          console.log(`[TelegramBot] 24/7 Global Mini App Menu Button configured: ${webAppUrl}`);
        } catch (err) {
          console.warn('[TelegramBot] Could not set global menu button:', err.message);
        }

        // Automatically register Telegram bot commands menu (Retaining /start as primary)
        try {
          await botInstance.api.setMyCommands([
            { command: 'start', description: '🚀 Open Nero AI Mini App & group controls' },
            { command: 'help', description: '📖 Commands & Mini App features guide' },
            { command: 'edit_mode', description: '🛠️ Owner-only maintenance & management' },
            { command: 'app', description: '📱 Open Mobile Mini App dashboard' },
            { command: 'role', description: '🎭 20 relationship personality roles' },
            { command: 'status', description: '📊 Bot health & active model telemetry' },
            { command: 'clear', description: '🧹 Clear conversation memory' },
          ]);
          console.log('[TelegramBot] Official Telegram commands menu registered successfully.');
        } catch (err) {
          console.warn('[TelegramBot] Could not set bot commands:', err.message);
        }
      },
    });
    return true;
  } catch (err) {
    console.error('[TelegramBot] Failed to start bot:', err.message);
    isBotRunning = false;
    return false;
  }
}

export async function stopBot() {
  if (botInstance && isBotRunning) {
    try {
      await botInstance.stop();
      isBotRunning = false;
      console.log('[TelegramBot] Bot polling stopped.');
    } catch (err) {
      console.error('[TelegramBot] Error stopping bot:', err.message);
    }
  }
}

export function getBotStatus() {
  return {
    isConfigured: Boolean(config.telegramBotToken),
    isRunning: isBotRunning,
  };
}

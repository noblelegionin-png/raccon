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
      allowed_updates: [
        'message',
        'edited_message',
        'channel_post',
        'edited_channel_post',
        'business_connection',
        'business_message',
        'edited_business_message',
        'callback_query',
        'inline_query',
      ],
      onStart: async (botInfo) => {
        isBotRunning = true;
        console.log(`[TelegramBot] Successfully connected as @${botInfo.username} (${botInfo.id})`);

        const webAppUrl = config.webAppPublicUrl || 'https://nero-labs-bot-production.up.railway.app';

        // 1. Automatically set the 24/7 Global Telegram Mini App Menu Button for all users
        try {
          await botInstance.api.setChatMenuButton({
            menu_button: {
              type: 'web_app',
              text: '⚡ Nero App',
              web_app: { url: `${webAppUrl.replace(/\/+$/, '')}/` },
            },
          });
          console.log(`[TelegramBot] 24/7 Global Mini App Menu Button configured: ${webAppUrl}`);
        } catch (err) {
          console.warn('[TelegramBot] Could not set global menu button:', err.message);
        }

        // 2. Set Dedicated Direct Passwordless Owner Deck Menu Button for Sandy
        if (config.telegramOwnerId) {
          try {
            await botInstance.api.setChatMenuButton({
              chat_id: Number(config.telegramOwnerId),
              menu_button: {
                type: 'web_app',
                text: '👑 Owner Deck',
                web_app: { url: `${webAppUrl.replace(/\/+$/, '')}/owner.html` },
              },
            });
            console.log(`[TelegramBot] Dedicated Owner Deck menu button set for Sandy (${config.telegramOwnerId})`);
          } catch (err) {
            console.warn('[TelegramBot] Could not set owner menu button:', err.message);
          }
        }

        // Automatically register Telegram bot commands menu (Retaining /start as primary)
        try {
          await botInstance.api.setMyCommands([
            { command: 'start', description: '🚀 Open Nero AI Mini App & group controls' },
            { command: 'qr', description: '📷 View live WhatsApp QR code to connect 24/7' },
            { command: 'wa', description: '💬 WhatsApp 24/7 bridge status & controls' },
            { command: 'owner', description: '👑 Open Owner Console (Direct Root Access)' },
            { command: 'app', description: '📱 Open Mobile Mini App dashboard' },
            { command: 'edit_mode', description: '🛠️ Owner-only maintenance & management' },
            { command: 'role', description: '🎭 20 relationship personality roles' },
            { command: 'status', description: '📊 Bot health & active model telemetry' },
            { command: 'help', description: '📖 Commands & Mini App features guide' },
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

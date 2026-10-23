import { Bot } from 'grammy';
import { config } from '../config.js';
import { registerBotHandlers } from './handlers.js';

let botInstance = null;
let isBotRunning = false;

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

        // Automatically register Telegram bot commands menu
        try {
          await botInstance.api.setMyCommands([
            { command: 'start', description: '🚀 Open Nero control panel & chat' },
            { command: 'help', description: '📖 View all commands, roles & features' },
            { command: 'code', description: '💻 Write, architect & debug production code' },
            { command: 'summarize', description: '📝 Executive summary & key takeaways' },
            { command: 'translate', description: '🌐 High-accuracy language translation' },
            { command: 'explain', description: '🔬 Feynman 3-tier deep explanation' },
            { command: 'math', description: '🧮 Step-by-step mathematical & logic solver' },
            { command: 'brainstorm', description: '💡 10 creative innovation ideas' },
            { command: 'remember', description: '🧠 Save custom durable chat memory' },
            { command: 'recall', description: '💡 Instant lookup of saved memory' },
            { command: 'memories', description: '📚 View all knowledge archive stats' },
            { command: 'note', description: '📝 Save to your personal notepad' },
            { command: 'notes', description: '📋 View your saved personal notes' },
            { command: 'poll', description: '📊 Create instant interactive Telegram poll' },
            { command: 'rules', description: '📜 View community guidelines' },
            { command: 'antiraid', description: '🛡️ Toggle emergency group raid lock' },
            { command: 'slowmode', description: '⏱️ Set group message cooldown delay' },
            { command: 'purge', description: '🧹 Batch delete recent spam messages' },
            { command: 'blacklist', description: '🚫 Word filter & prohibited terms' },
            { command: 'mc', description: '⛏️ Minecraft Bedrock companion commands' },
            { command: 'ping', description: '🏓 Real-time latency measurement' },
            { command: 'sysinfo', description: '🖥️ Host system CPU, RAM & Node telemetry' },
            { command: 'mcptools', description: '🔌 Inspect live Model Context Protocol tools' },
            { command: 'status', description: '📊 Bot health, provider & active model' },
            { command: 'role', description: '🎭 Choose relationship role with Nero' },
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

import { config, validateConfig } from './config.js';
import { initDatabase, getDb } from './db/index.js';
import { startRocketBot, stopRocketBot } from './rocketBot/bot.js';
import { createWebServer } from './web/server.js';
import { whatsAppService } from './whatsapp/whatsappService.js';
import { applyLogNoiseFilter } from './utils/noiseFilter.js';

// Suppress high-volume internal logs from third-party libraries (libsignal, prekeys, session noise)
applyLogNoiseFilter();

async function main() {
  console.log('====================================================');
  console.log('⚡ MYRA AI — WHATSAPP AUTONOMOUS PLATFORM (MYRA / NERO)');
  console.log('====================================================');

  // 1. Initialize SQLite Database
  console.log(`[Database] Initializing persistent store at ${config.databasePath}...`);
  initDatabase();
  console.log('[Database] SQLite Database initialized with WAL mode.');

  // 2. Validate configuration
  const issues = validateConfig();
  if (issues.length > 0) {
    console.log('\n[Configuration Diagnostics]:');
    for (const issue of issues) {
      console.warn(`  • ⚠️  ${issue}`);
    }
    console.log('  -> Update your .env file with real credentials to enable live features.\n');
  }

  // 3. Start Web Server (serves Mini App & REST APIs)
  const app = createWebServer();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[WebServer] Mobile Mini App running at: http://0.0.0.0:${config.port}`);
    console.log(`[WebServer] Health probe: http://localhost:${config.port}/healthz`);
  });

  // 4. Start WhatsApp 24/7 Live Bridge
  if (config.whatsAppEnabled) {
    console.log('[WhatsApp] Starting WhatsApp 24/7 Live Bridge...');
    whatsAppService.init().catch((err) => {
      console.warn('[WhatsApp] Startup warning:', err.message);
    });
  }

  // 5. Start Rocket Telegram Bot (Primary & Only Bot)
  if (config.rocketTelegramEnabled) {
    if (config.rocketTelegramBotToken) {
      console.log('[RocketBot] 🦝 Initializing Rocket Telegram bot...');
      await startRocketBot();
    } else {
      console.log('[RocketBot] ⏳ ROCKET_TELEGRAM_BOT_TOKEN is waiting to be configured from BotFather. Bot transport will connect the moment token is provided.');
    }
  }

  // 6. Graceful Shutdown
  const shutdown = async (signal) => {
    console.log(`\n[System] Received ${signal}. Shutting down gracefully...`);
    await stopRocketBot();
    try {
      if (whatsAppService.sock) {
        whatsAppService.sock.end();
      }
    } catch (e) {}
    server.close(() => {
      console.log('[WebServer] HTTP server closed.');
      try {
        const db = getDb();
        db.close();
        console.log('[Database] SQLite database closed safely.');
      } catch (err) {
        // already closed
      }
      process.exit(0);
    });

    // Force exit if shutdown hangs
    setTimeout(() => {
      console.error('[System] Forcing shutdown after timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 24/7 Self-Healing Crash Guard: Never terminate process on transient network glitches
  process.on('uncaughtException', (err) => {
    console.error('[24/7 Resilience Guard] Caught Uncaught Exception:', err.message, err.stack);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[24/7 Resilience Guard] Caught Unhandled Rejection:', reason);
  });
}

main().catch((err) => {
  console.error('[Fatal Error] Startup failed:', err);
  process.exit(1);
});

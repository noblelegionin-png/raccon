import { config, validateConfig } from './config.js';
import { initDatabase, getDb } from './db/index.js';
import { startDiscordBot, stopDiscordBot } from './discord/discordBot.js';
import { createWebServer } from './web/server.js';
import { applyLogNoiseFilter } from './utils/noiseFilter.js';
import { browserLinkServer } from './browser/browserLinkServer.js';

// Suppress high-volume internal logs from third-party libraries
applyLogNoiseFilter();

async function main() {
  console.log('====================================================');
  console.log('🦝 ROCKET AI — DISCORD AUTONOMOUS PLATFORM (NERO LABS)');
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

  // 3. Start Web Server (serves Health Probes, Mini App & Web APIs)
  const app = createWebServer();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[WebServer] Health probe: http://localhost:${config.port}/healthz`);
    console.log(`[WebServer] Web portal running at: http://0.0.0.0:${config.port}`);
  });

  // Attach Rocket Browser Link WebSocket server (/ws/browser)
  browserLinkServer.attachToServer(server);

  // 4. Start Rocket Discord Bot (Dedicated Platform)
  if (config.discordEnabled) {
    if (config.discordBotToken) {
      console.log('[RocketBot] 🎮 Initializing Rocket Discord bot...');
      startDiscordBot().catch((err) => {
        console.warn('[RocketBot] Discord startup warning:', err.message);
      });
    } else {
      console.log('[RocketBot] ⏳ DISCORD_BOT_TOKEN is waiting to be configured.');
    }
  }

  // 5. Graceful Shutdown
  const shutdown = async (signal) => {
    console.log(`\n[System] Received ${signal}. Shutting down gracefully...`);
    await stopDiscordBot();
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

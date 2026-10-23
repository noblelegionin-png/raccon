/**
 * ⚡ NERO LABS — 24/7 AUTONOMOUS PROCESS SUPERVISOR
 * Keeps the Telegram bot and Cloudflare tunnel running 24/7.
 * Auto-restarts on any crash, memory leak, or unhandled error.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const PROJECT_DIR = 'd:\\nero-labs-telegram-bot';
const CLOUDFLARED_PATH = fs.existsSync('d:\\nero-labs-telegram-bot\\cloudflared.exe')
  ? 'd:\\nero-labs-telegram-bot\\cloudflared.exe'
  : 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';

const logsDir = path.join(PROJECT_DIR, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'supervisor.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    process.stdout?.write?.(line);
  } catch {}
  logStream.write(line);
}

let botProc = null;
let tunnelProc = null;
let shuttingDown = false;

function startBot() {
  if (shuttingDown) return;
  log('[Supervisor] 🚀 Starting Nero Labs & Narrow Companion Bot...');

  botProc = spawn('node', ['src/index.js'], {
    cwd: PROJECT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  botProc.stdout.on('data', (data) => {
    logStream.write(`[Bot stdout] ${data}`);
  });

  botProc.stderr.on('data', (data) => {
    logStream.write(`[Bot stderr] ${data}`);
  });

  botProc.on('exit', (code, signal) => {
    log(`[Supervisor] ⚠️ Bot process exited with code ${code} (${signal}).`);
    botProc = null;
    if (!shuttingDown) {
      log('[Supervisor] 🔄 Auto-restarting bot in 2 seconds...');
      setTimeout(startBot, 2000);
    }
  });

  botProc.on('error', (err) => {
    log(`[Supervisor] Failed to spawn bot process: ${err.message}`);
  });
}

function startTunnel() {
  if (shuttingDown) return;
  if (!fs.existsSync(CLOUDFLARED_PATH)) {
    log('[Supervisor] Cloudflared not found at default path, skipping tunnel supervision.');
    return;
  }

  log('[Supervisor] 🌐 Starting Cloudflare Public Tunnel...');
  tunnelProc = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', 'http://localhost:3001'], {
    cwd: PROJECT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  tunnelProc.stdout?.on('data', (d) => logStream.write(`[Tunnel stdout] ${d}`));
  tunnelProc.stderr?.on('data', (d) => logStream.write(`[Tunnel stderr] ${d}`));

  tunnelProc.on('exit', (code, signal) => {
    log(`[Supervisor] ⚠️ Cloudflare tunnel exited with code ${code} (${signal}).`);
    tunnelProc = null;
    if (!shuttingDown) {
      log('[Supervisor] 🔄 Auto-restarting tunnel in 3 seconds...');
      setTimeout(startTunnel, 3000);
    }
  });

  tunnelProc.on('error', (err) => {
    log(`[Supervisor] Failed to spawn tunnel process: ${err.message}`);
  });
}

function shutdown() {
  shuttingDown = true;
  log('[Supervisor] Shutting down all managed processes...');
  if (botProc) botProc.kill('SIGTERM');
  if (tunnelProc) tunnelProc.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log('========================================================');
log('⚡ NERO LABS — 24/7 AUTONOMOUS RESILIENCE SUPERVISOR ACTIVE');
log('========================================================');
startBot();
startTunnel();

// Active heartbeat loop to keep supervisor running and check health every 5s
setInterval(() => {
  if (shuttingDown) return;
  if (!botProc) {
    log('[Supervisor] Watchdog detected bot process offline. Restarting...');
    startBot();
  }
}, 5000);

import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Always load .env from project root regardless of process.cwd()
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

function cleanEnv(val, fallback = '') {
  if (!val) return fallback;
  return String(val).replace(/["']/g, '').trim();
}

export const config = {
  // Legacy Telegram (Completely Discontinued & Removed)
  telegramEnabled: false,
  telegramBotToken: '',
  telegramOwnerId: cleanEnv(process.env.ROCKET_OWNER_ID, cleanEnv(process.env.TELEGRAM_OWNER_ID, '8685232094')),

  // 🦝 ROCKET NEW TELEGRAM BOT & RACCOON OS
  rocketTelegramEnabled: cleanEnv(process.env.ROCKET_TELEGRAM_ENABLED, 'true') === 'true',
  rocketTelegramBotToken: cleanEnv(process.env.ROCKET_TELEGRAM_BOT_TOKEN),
  rocketOwnerId: cleanEnv(process.env.ROCKET_OWNER_ID, cleanEnv(process.env.TELEGRAM_OWNER_ID, '8685232094')),
  rocketMiniAppUrl: cleanEnv(process.env.ROCKET_MINIAPP_URL, cleanEnv(process.env.WEBAPP_PUBLIC_URL)),

  // ScaleMax & Model Provider
  scaleMaxApiKey: cleanEnv(process.env.SCALEMAX_API_KEY),
  scaleMaxBaseUrl: (cleanEnv(process.env.SCALEMAX_BASE_URL, 'https://api.scalemax.pro/token/v1')).replace(/\/+$/, ''),
  scaleMaxDefaultModel: cleanEnv(process.env.SCALEMAX_DEFAULT_MODEL, 'gpt-6-luna'),
  deepSeekApiKey: cleanEnv(process.env.DEEPSEEK_API_KEY),

  // Dashboard Security
  dashboardAccessKey: cleanEnv(process.env.DASHBOARD_ACCESS_KEY),

  // WhatsApp Bridge Configuration
  whatsAppEnabled: cleanEnv(process.env.WHATSAPP_ENABLED, 'true') === 'true',
  whatsAppOwnerNumber: cleanEnv(process.env.WHATSAPP_OWNER_NUMBER, ''),
  whatsAppAutoReply: cleanEnv(process.env.WHATSAPP_AUTO_REPLY, 'true') === 'true',
  whatsAppMode: cleanEnv(process.env.WHATSAPP_MODE, 'all'), // 'all' or 'owner_only'
  whatsAppNotifyTelegram: cleanEnv(process.env.WHATSAPP_NOTIFY_TELEGRAM, 'false') === 'true',

  // Server
  port: parseInt(cleanEnv(process.env.PORT, '3001'), 10),
  nodeEnv: cleanEnv(process.env.NODE_ENV, 'development'),
  databasePath: process.env.DATABASE_PATH
    ? (path.isAbsolute(process.env.DATABASE_PATH) ? process.env.DATABASE_PATH : path.join(projectRoot, process.env.DATABASE_PATH))
    : path.join(projectRoot, 'data/nerolabs.db'),
  webAppPublicUrl: cleanEnv(process.env.WEBAPP_PUBLIC_URL),

  // Operational defaults
  latencyThresholdMs: 1000,
  maxContextMessages: 8,
  maxRetryCount: 1,
  requestTimeoutMs: 30000,
};

// Validate critical configuration on startup
export function validateConfig() {
  const issues = [];
  if (config.rocketTelegramEnabled && !config.rocketTelegramBotToken) {
    issues.push('ROCKET_TELEGRAM_BOT_TOKEN is not set. Rocket bot will remain offline.');
  }
  if (!config.scaleMaxApiKey) {
    issues.push('SCALEMAX_API_KEY is not set. AI provider calls will report disconnected status.');
  }
  return issues;
}

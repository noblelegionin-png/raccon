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
  // Telegram
  telegramBotToken: cleanEnv(process.env.TELEGRAM_BOT_TOKEN),
  telegramOwnerId: cleanEnv(process.env.TELEGRAM_OWNER_ID),

  // ScaleMax
  scaleMaxApiKey: cleanEnv(process.env.SCALEMAX_API_KEY),
  scaleMaxBaseUrl: (cleanEnv(process.env.SCALEMAX_BASE_URL, 'https://api.scalemax.pro/v1')).replace(/\/+$/, ''),
  scaleMaxDefaultModel: cleanEnv(process.env.SCALEMAX_DEFAULT_MODEL, 'gemini-3.8-flash'),

  // Dashboard Security
  dashboardAccessKey: cleanEnv(process.env.DASHBOARD_ACCESS_KEY),

  // WhatsApp Bridge Configuration
  whatsAppEnabled: cleanEnv(process.env.WHATSAPP_ENABLED, 'true') === 'true',
  whatsAppOwnerNumber: cleanEnv(process.env.WHATSAPP_OWNER_NUMBER, ''),
  whatsAppAutoReply: cleanEnv(process.env.WHATSAPP_AUTO_REPLY, 'true') === 'true',
  whatsAppMode: cleanEnv(process.env.WHATSAPP_MODE, 'all'), // 'all' or 'owner_only'
  whatsAppNotifyTelegram: cleanEnv(process.env.WHATSAPP_NOTIFY_TELEGRAM, 'true') === 'true',

  // Server
  port: parseInt(cleanEnv(process.env.PORT, '3001'), 10),
  nodeEnv: cleanEnv(process.env.NODE_ENV, 'development'),
  databasePath: process.env.DATABASE_PATH
    ? (path.isAbsolute(process.env.DATABASE_PATH) ? process.env.DATABASE_PATH : path.join(projectRoot, process.env.DATABASE_PATH))
    : path.join(projectRoot, 'data/nerolabs.db'),
  webAppPublicUrl: cleanEnv(process.env.WEBAPP_PUBLIC_URL),

  // Operational defaults
  latencyThresholdMs: 1000,
  maxContextMessages: 20,
  maxRetryCount: 1,
  requestTimeoutMs: 30000,
};

// Validate critical configuration on startup
export function validateConfig() {
  const issues = [];
  if (!config.telegramBotToken) {
    issues.push('TELEGRAM_BOT_TOKEN is not set. Bot will run in diagnostic/offline mode.');
  }
  if (!config.telegramOwnerId) {
    issues.push('TELEGRAM_OWNER_ID is not set. Owner authentication cannot be verified.');
  }
  if (!config.scaleMaxApiKey) {
    issues.push('SCALEMAX_API_KEY is not set. AI provider calls will report disconnected status.');
  }
  return issues;
}

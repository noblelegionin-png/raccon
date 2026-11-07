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
  // ScaleMax & Model Provider
  scaleMaxApiKey: cleanEnv(process.env.SCALEMAX_API_KEY, 'sm_live_c8c0b3957660ecbda0af7e884d7695e7'),
  scaleMaxBaseUrl: (cleanEnv(process.env.SCALEMAX_BASE_URL, 'https://api.scalemax.pro/token/v1')).replace(/\/+$/, ''),
  scaleMaxDefaultModel: cleanEnv(process.env.SCALEMAX_DEFAULT_MODEL, 'gpt-6-luna'),
  deepSeekApiKey: cleanEnv(process.env.DEEPSEEK_API_KEY),

  // Legacy Telegram & WhatsApp (Completely Discontinued)
  telegramEnabled: false,
  telegramBotToken: '',
  telegramOwnerId: '',
  rocketTelegramEnabled: false,
  rocketTelegramBotToken: '',
  rocketOwnerId: '',
  whatsAppEnabled: false,
  whatsAppOwnerNumber: '',
  whatsAppAutoReply: false,
  whatsAppMode: 'disabled',
  whatsAppNotifyTelegram: false,

  // 🎮 Discord Bot Configuration (R0CK3T)
  discordEnabled: cleanEnv(process.env.DISCORD_ENABLED, 'true') === 'true',
  discordBotToken: cleanEnv(process.env.DISCORD_BOT_TOKEN),
  discordClientId: cleanEnv(process.env.DISCORD_CLIENT_ID, '1567226191864402003'),
  discordOwnerId: cleanEnv(process.env.DISCORD_OWNER_ID, '1477589102110183477'),

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
  if (config.discordEnabled && !config.discordBotToken) {
    issues.push('DISCORD_BOT_TOKEN is not set. Rocket Discord bot will remain offline.');
  }
  if (!config.scaleMaxApiKey) {
    issues.push('SCALEMAX_API_KEY is not set. AI provider calls will report disconnected status.');
  }
  return issues;
}

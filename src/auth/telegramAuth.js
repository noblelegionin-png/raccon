import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Validates Telegram Mini App initData using HMAC-SHA256
 * @param {string} initData - Raw initData string from window.Telegram.WebApp.initData
 * @param {string} botToken - Telegram Bot Token
 * @returns {{ valid: boolean, user?: Object, error?: string }}
 */
export function validateTelegramInitData(initData, botToken = config.telegramBotToken) {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, error: 'Missing initData string.' };
  }

  if (!botToken) {
    return { valid: false, error: 'Bot token is not configured on server.' };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      return { valid: false, error: 'initData is missing hash parameter.' };
    }

    params.delete('hash');

    // Sort parameters alphabetically
    const sortedKeys = Array.from(params.keys()).sort();
    const dataCheckString = sortedKeys.map((k) => `${k}=${params.get(k)}`).join('\n');

    // secret_key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // calculated_hash = HMAC_SHA256(secret_key, dataCheckString)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Timing-safe comparison
    const hashBuffer = Buffer.from(hash, 'hex');
    const calcBuffer = Buffer.from(calculatedHash, 'hex');

    if (hashBuffer.length !== calcBuffer.length || !crypto.timingSafeEqual(hashBuffer, calcBuffer)) {
      return { valid: false, error: 'HMAC signature verification failed.' };
    }

    // Check auth_date for replay attack prevention (allow up to 24 hours)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { valid: false, error: 'initData has expired (replay defense).' };
    }

    // Extract user info
    let user = null;
    const userStr = params.get('user');
    if (userStr) {
      user = JSON.parse(userStr);
    }

    return { valid: true, user };
  } catch (err) {
    return { valid: false, error: `Validation error: ${err.message}` };
  }
}

import { config } from '../config.js';
import { validateTelegramInitData } from './telegramAuth.js';
import { logAudit } from '../db/index.js';

// In-memory brute-force rate limiter for access key attempts
const failedAttempts = new Map();

/**
 * Verify if a given Telegram user ID is the configured owner.
 * Strictly uses numeric ID comparison.
 */
export function isOwner(userId) {
  if (!userId || !config.telegramOwnerId) {
    return false;
  }
  return String(userId).trim() === String(config.telegramOwnerId).trim();
}

/**
 * Verify Dashboard Access Key with brute-force delay
 */
export function verifyDashboardAccessKey(providedKey, ipAddress = 'unknown') {
  if (!config.dashboardAccessKey) {
    return false;
  }

  const attempts = failedAttempts.get(ipAddress) || { count: 0, lastAttempt: 0 };
  const now = Date.now();

  // If more than 5 failed attempts in the last 15 minutes, block
  if (attempts.count >= 5 && now - attempts.lastAttempt < 15 * 60 * 1000) {
    return false;
  }

  const cleanConfigKey = String(config.dashboardAccessKey).replace(/["']/g, '').trim();
  const cleanProvidedKey = String(providedKey).replace(/["']/g, '').trim();
  const isValid = cleanProvidedKey === cleanConfigKey;

  if (!isValid) {
    failedAttempts.set(ipAddress, {
      count: attempts.count + 1,
      lastAttempt: now,
    });
    logAudit('system', 'FAILED_ACCESS_KEY_ATTEMPT', `IP: ${ipAddress}`);
    return false;
  }

  // Clear failure counter on success
  failedAttempts.delete(ipAddress);
  return true;
}

/**
 * Express Authentication Middleware
 * Validates either Telegram WebApp initData or Dashboard Access Key.
 */
export function requireOwnerAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const accessKey = req.headers['x-dashboard-access-key'] || req.body?.accessKey || req.query?.accessKey;
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';

  // 1. Try Telegram WebApp initData
  if (initData) {
    const verification = validateTelegramInitData(initData);
    if (verification.valid && verification.user) {
      const isUserOwner = isOwner(verification.user.id);
      if (isUserOwner) {
        req.auth = {
          isOwner: true,
          userId: verification.user.id,
          username: verification.user.username,
          method: 'telegram_webapp',
        };
        return next();
      } else {
        logAudit(verification.user.id, 'UNAUTHORIZED_MINIAPP_ACCESS', `Non-owner ID attempted admin action.`);
        return res.status(403).json({
          ok: false,
          error: 'Access denied: You are not authorized as the bot owner.',
        });
      }
    }
  }

  // 2. Try Dashboard Access Key
  if (accessKey) {
    if (verifyDashboardAccessKey(accessKey, clientIp)) {
      req.auth = {
        isOwner: true,
        userId: 'dashboard_key_holder',
        method: 'access_key',
      };
      return next();
    } else {
      return res.status(401).json({
        ok: false,
        error: 'Invalid dashboard access key or rate limit exceeded.',
      });
    }
  }

  // Neither provided or both invalid
  return res.status(401).json({
    ok: false,
    error: 'Authentication required. Provide Telegram Mini App initData or a valid access key.',
  });
}

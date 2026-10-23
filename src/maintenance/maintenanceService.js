/**
 * 🛠️ NERO LABS — PERSISTENT MAINTENANCE & EDIT MODE SERVICE
 * 
 * Manages system-wide maintenance mode state, pauses normal conversations,
 * coordinates verifiable announcements across connected chats, and enforces
 * owner-exclusive management clearance.
 */
import crypto from 'node:crypto';
import {
  getConfig,
  setConfig,
  logAudit,
  getDb,
  getKnownGroups,
} from '../db/index.js';

export const MAINTENANCE_ANNOUNCEMENT_TEXT =
  '🛠️ The bot is temporarily in maintenance mode while we fix a few bugs. Replies are paused. Thanks for your patience! 🚀';

/**
 * Check if Maintenance Mode is active (survives process restarts via SQLite)
 */
export function isMaintenanceModeActive() {
  try {
    return getConfig('maintenance_mode', 'false') === 'true';
  } catch {
    return false;
  }
}

/**
 * Log a broadcast delivery attempt to SQLite audit table
 */
function logBroadcastAttempt(sessionId, chatId, chatTitle, status, errorMessage = null) {
  try {
    getDb().prepare(`
      INSERT INTO maintenance_broadcast_logs (session_id, chat_id, chat_title, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, String(chatId), chatTitle || 'Unknown Group', status, errorMessage, new Date().toISOString());
  } catch {}
}

/**
 * Enable Maintenance Mode and broadcast announcement to eligible chats
 * @param {Object} botApi - Grammy/Telegram Bot API instance
 * @param {Object} options - { forceBroadcast: boolean, reason: string }
 * @returns {Promise<{ active: boolean, sessionId: string, sentCount: number, failedCount: number, skippedCount: number, total: number }>}
 */
export async function enableMaintenanceMode(botApi = null, options = {}) {
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();

  setConfig('maintenance_mode', 'true');
  setConfig('maintenance_started_at', now);
  setConfig('maintenance_session_id', sessionId);
  if (options.reason) {
    setConfig('maintenance_reason', options.reason);
  }

  logAudit('system', 'MAINTENANCE_MODE_ENABLED', `Session: ${sessionId}`);

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  const alreadySent = getConfig('maintenance_announcement_sent', 'false') === 'true';
  const shouldBroadcast = !alreadySent || options.forceBroadcast;

  if (botApi && shouldBroadcast) {
    const knownGroups = getKnownGroups();
    
    for (const group of knownGroups) {
      // Check if group is active/enabled for the bot
      if (group.bot_enabled === 0) {
        skippedCount++;
        logBroadcastAttempt(sessionId, group.group_id, group.group_title, 'skipped', 'Group bot_enabled is false');
        continue;
      }

      try {
        await botApi.sendMessage(group.group_id, MAINTENANCE_ANNOUNCEMENT_TEXT);
        sentCount++;
        logBroadcastAttempt(sessionId, group.group_id, group.group_title, 'sent', null);
      } catch (err) {
        failedCount++;
        logBroadcastAttempt(sessionId, group.group_id, group.group_title, 'failed', err.message);
      }

      // Small pause to prevent hitting Telegram broadcast flood limits
      await new Promise((r) => setTimeout(r, 40));
    }

    setConfig('maintenance_announcement_sent', 'true');
  }

  return {
    active: true,
    sessionId,
    sentCount,
    failedCount,
    skippedCount,
    total: sentCount + failedCount + skippedCount,
  };
}

/**
 * Disable Maintenance Mode and resume ordinary conversation flow
 */
export function disableMaintenanceMode() {
  setConfig('maintenance_mode', 'false');
  setConfig('maintenance_announcement_sent', 'false');
  setConfig('maintenance_stopped_at', new Date().toISOString());
  logAudit('system', 'MAINTENANCE_MODE_DISABLED', 'Normal operations resumed');

  return { active: false };
}

/**
 * Get comprehensive maintenance report with broadcast delivery verification
 */
export function getMaintenanceReport() {
  const active = isMaintenanceModeActive();
  const startedAt = getConfig('maintenance_started_at', null);
  const sessionId = getConfig('maintenance_session_id', null);

  let logs = [];
  try {
    if (sessionId) {
      logs = getDb().prepare(`
        SELECT chat_id, chat_title, status, error_message, created_at
        FROM maintenance_broadcast_logs
        WHERE session_id = ?
        ORDER BY id ASC
      `).all(sessionId);
    } else {
      logs = getDb().prepare(`
        SELECT chat_id, chat_title, status, error_message, created_at
        FROM maintenance_broadcast_logs
        ORDER BY id DESC LIMIT 50
      `).all();
    }
  } catch {}

  const sent = logs.filter(l => l.status === 'sent').length;
  const failed = logs.filter(l => l.status === 'failed').length;
  const skipped = logs.filter(l => l.status === 'skipped').length;

  return {
    active,
    startedAt,
    sessionId,
    announcementText: MAINTENANCE_ANNOUNCEMENT_TEXT,
    sent,
    failed,
    skipped,
    totalChats: logs.length,
    deliveryDetails: logs,
  };
}

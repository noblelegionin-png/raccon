import { getDb, getConfig, logAudit, getBlacklistWords, getGroupSetting } from '../db/index.js';
import { isOwner } from '../auth/accessControl.js';

/**
 * Moderation Service for Telegram Groups
 * Enforces strict safety: No automatic bans/kicks until explicitly enabled by the owner.
 * Always checks Telegram admin permissions before executing any moderation action.
 */

// Initialize moderation tables if not already present
export function initModerationSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      warn_count INTEGER DEFAULT 1,
      last_reason TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS moderation_rules (
      group_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      spam_filter INTEGER DEFAULT 0,
      link_filter INTEGER DEFAULT 0,
      max_warnings INTEGER DEFAULT 3,
      action_on_max TEXT DEFAULT 'warn',
      updated_at TEXT NOT NULL
    );
  `);
}

/**
 * Get moderation rules for a group
 */
export function getGroupModerationRules(groupId) {
  initModerationSchema();
  const row = getDb().prepare('SELECT * FROM moderation_rules WHERE group_id = ?').get(String(groupId));
  if (row) {
    return {
      groupId: row.group_id,
      enabled: Boolean(row.enabled),
      spamFilter: Boolean(row.spam_filter),
      linkFilter: Boolean(row.link_filter),
      maxWarnings: row.max_warnings || 3,
      actionOnMax: row.action_on_max || 'warn',
    };
  }

  // Default rules (all automated actions disabled)
  return {
    groupId: String(groupId),
    enabled: false,
    spamFilter: false,
    linkFilter: false,
    maxWarnings: 3,
    actionOnMax: 'warn',
  };
}

/**
 * Update moderation rules for a group (owner/admin only)
 */
export function updateGroupModerationRules(groupId, updates) {
  initModerationSchema();
  const current = getGroupModerationRules(groupId);
  const updated = { ...current, ...updates };
  const now = new Date().toISOString();

  getDb().prepare(`
    INSERT INTO moderation_rules (group_id, enabled, spam_filter, link_filter, max_warnings, action_on_max, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      enabled = excluded.enabled,
      spam_filter = excluded.spam_filter,
      link_filter = excluded.link_filter,
      max_warnings = excluded.max_warnings,
      action_on_max = excluded.action_on_max,
      updated_at = excluded.updated_at
  `).run(
    String(groupId),
    updated.enabled ? 1 : 0,
    updated.spamFilter ? 1 : 0,
    updated.linkFilter ? 1 : 0,
    updated.maxWarnings,
    updated.actionOnMax,
    now
  );

  return updated;
}

/**
 * Record or increment a warning for a user in a group
 */
export function addWarning(groupId, userId, reason = 'Unspecified violation') {
  initModerationSchema();
  const now = new Date().toISOString();
  const db = getDb();

  const existing = db.prepare('SELECT warn_count FROM group_warnings WHERE group_id = ? AND user_id = ?')
    .get(String(groupId), String(userId));

  let newCount = 1;
  if (existing) {
    newCount = existing.warn_count + 1;
    db.prepare(`
      UPDATE group_warnings
      SET warn_count = ?, last_reason = ?, updated_at = ?
      WHERE group_id = ? AND user_id = ?
    `).run(newCount, reason, now, String(groupId), String(userId));
  } else {
    db.prepare(`
      INSERT INTO group_warnings (group_id, user_id, warn_count, last_reason, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(String(groupId), String(userId), newCount, reason, now);
  }

  logAudit(userId, 'USER_WARNED', `Group ${groupId}: Warning #${newCount} (${reason})`);
  return { warnCount: newCount, reason };
}

/**
 * Reset warnings for a user in a group
 */
export function resetWarnings(groupId, userId) {
  initModerationSchema();
  getDb().prepare('DELETE FROM group_warnings WHERE group_id = ? AND user_id = ?')
    .run(String(groupId), String(userId));
  logAudit(userId, 'WARNINGS_CLEARED', `Group ${groupId}: Warnings reset`);
}

/**
 * Check bot's admin rights in a Telegram chat
 */
export async function checkBotAdminRights(ctx) {
  try {
    const me = await ctx.getChatMember(ctx.me.id);
    const isAdmin = me.status === 'administrator' || me.status === 'creator';
    return {
      isAdmin,
      canDeleteMessages: Boolean(me.can_delete_messages),
      canRestrictMembers: Boolean(me.can_restrict_members),
      status: me.status,
    };
  } catch (err) {
    return {
      isAdmin: false,
      canDeleteMessages: false,
      canRestrictMembers: false,
      status: 'unknown',
      error: err.message,
    };
  }
}

/**
 * Safe message inspection against group moderation rules
 * Returns: { flag: boolean, reason?: string, action?: string }
 */
export function inspectMessageForModeration(groupId, text, userId) {
  // Never moderate the verified bot owner
  if (isOwner(userId)) {
    return { flag: false };
  }

  const globalModEnabled = getConfig('group_moderation_enabled', 'false') === 'true';
  if (!globalModEnabled) {
    return { flag: false };
  }

  const rules = getGroupModerationRules(groupId);
  if (!rules.enabled) {
    return { flag: false };
  }

  // 1. Link filter check
  if (rules.linkFilter) {
    const linkRegex = /(https?:\/\/[^\s]+|t\.me\/[^\s]+|telegram\.me\/[^\s]+)/i;
    if (linkRegex.test(text)) {
      return {
        flag: true,
        reason: 'Unauthorized external links are restricted in this group.',
        action: 'link_detected',
      };
    }
  }

  // 2. Spam repetition filter check
  if (rules.spamFilter) {
    const repeatedChar = /(.)\1{7,}/; // Same character repeated 8+ times
    if (repeatedChar.test(text)) {
      return {
        flag: true,
        reason: 'Excessive character repetition detected.',
        action: 'spam_detected',
      };
    }
  }

  // 3. Word blacklist check
  const blacklist = getBlacklistWords(groupId);
  if (blacklist && blacklist.length > 0) {
    const lowerText = text.toLowerCase();
    for (const badWord of blacklist) {
      if (lowerText.includes(badWord)) {
        return {
          flag: true,
          reason: `Prohibited term detected: "${badWord}"`,
          action: 'blacklist_detected',
        };
      }
    }
  }

  // 4. Excessive Capslock filter check
  const capslockFilter = getGroupSetting(groupId, 'capslock_filter', 'false') === 'true';
  if (capslockFilter && text.length > 15) {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 10) {
      const upper = letters.replace(/[^A-Z]/g, '').length;
      if (upper / letters.length > 0.75) {
        return {
          flag: true,
          reason: 'Excessive capslock / shouting detected.',
          action: 'capslock_detected',
        };
      }
    }
  }

  return { flag: false };
}

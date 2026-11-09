/**
 * 🦝 ROCKET AI — DISCORD PERSISTENT DATABASE & SERVER KNOWLEDGE
 * 
 * Manages:
 * - Guild settings & configurations (mod-log, welcome, rules)
 * - Member profiles & relationship tiers (owner, family, friend, team, employee, member)
 * - Moderation audit logs (warn, kick, ban, timeout, purge, lock)
 * - Server knowledge base (topics, rules, project details, FAQs)
 */

import crypto from 'node:crypto';
import { getDb } from '../db/index.js';

let initialized = false;

export function initDiscordDb() {
  if (initialized) return;
  const db = getDb();

  db.exec(`
    -- Guild Settings
    CREATE TABLE IF NOT EXISTS discord_guild_settings (
      guild_id TEXT PRIMARY KEY,
      guild_name TEXT NOT NULL,
      mod_log_channel_id TEXT,
      welcome_channel_id TEXT,
      rules_channel_id TEXT,
      auto_mod_enabled INTEGER DEFAULT 1,
      anti_spam INTEGER DEFAULT 1,
      anti_invite INTEGER DEFAULT 1,
      anti_mass_mention INTEGER DEFAULT 1,
      chat_mode TEXT DEFAULT 'mention_only',
      chat_channel_id TEXT,
      is_muted INTEGER DEFAULT 0,
      server_rules TEXT,
      server_overview TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Member Profiles & Tier Tagging (Family, Friends, Team, Employees)
    CREATE TABLE IF NOT EXISTS discord_member_profiles (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      role_tier TEXT DEFAULT 'member', -- 'owner', 'family', 'friend', 'team', 'employee', 'member'
      notes TEXT,
      warnings_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_discord_member_tier ON discord_member_profiles(guild_id, role_tier);

    -- Moderation Action Logs
    CREATE TABLE IF NOT EXISTS discord_mod_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      moderator_id TEXT NOT NULL,
      moderator_tag TEXT,
      action TEXT NOT NULL, -- 'warn', 'kick', 'ban', 'unban', 'timeout', 'untimeout', 'purge', 'lock', 'unlock'
      reason TEXT,
      details TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discord_mod_logs_guild ON discord_mod_logs(guild_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_discord_mod_logs_user ON discord_mod_logs(guild_id, user_id);

    -- Server Knowledge Base
    CREATE TABLE IF NOT EXISTS discord_server_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(guild_id, topic)
    );

    CREATE INDEX IF NOT EXISTS idx_discord_knowledge ON discord_server_knowledge(guild_id, topic);

    -- Channel Behavior & Configuration Registry
    CREATE TABLE IF NOT EXISTS discord_channel_registry (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      category_name TEXT,
      purpose TEXT,
      ai_behavior_profile TEXT DEFAULT 'general',
      reasoning_level TEXT DEFAULT 'low',
      speed_preference TEXT DEFAULT 'fast',
      token_optimization TEXT DEFAULT 'standard',
      allowed_tools TEXT DEFAULT '[]',
      permission_requirements TEXT DEFAULT 'member',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, channel_id)
    );

    CREATE INDEX IF NOT EXISTS idx_discord_channels_guild ON discord_channel_registry(guild_id);

    -- Strict User Permissions Registry
    CREATE TABLE IF NOT EXISTS discord_user_permissions (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      is_owner INTEGER DEFAULT 0,
      permission_scopes TEXT DEFAULT 'member', -- comma-delimited scopes: 'admin,moderator,researcher,staff,gamer'
      granted_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_discord_perms_guild ON discord_user_permissions(guild_id);

    -- Member Gaming Profiles
    CREATE TABLE IF NOT EXISTS discord_gaming_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT,
      game_name TEXT NOT NULL,
      in_game_username TEXT NOT NULL,
      platform TEXT DEFAULT 'PC',
      notes TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(guild_id, user_id, game_name)
    );

    CREATE INDEX IF NOT EXISTS idx_discord_gaming_guild ON discord_gaming_profiles(guild_id, user_id);

    -- User Isolated Sessions & Dashboard Tokens
    CREATE TABLE IF NOT EXISTS discord_user_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT,
      guild_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discord_sessions_token ON discord_user_sessions(token);

    -- Server Information Links
    CREATE TABLE IF NOT EXISTS discord_server_links (
      guild_id TEXT PRIMARY KEY,
      website_url TEXT,
      linktree_url TEXT,
      rocket_mobile_url TEXT,
      friends_linktree_json TEXT,
      updated_at TEXT NOT NULL
    );

    -- Anti-Spam Incident Auditing
    CREATE TABLE IF NOT EXISTS discord_spam_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      message_content TEXT,
      timeout_until TEXT NOT NULL,
      status TEXT DEFAULT 'active', -- 'active', 'forgiven', 'expired'
      created_at TEXT NOT NULL,
      unmuted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_discord_spam_user ON discord_spam_incidents(guild_id, user_id);

    -- Abuse Incident & Weekly Apology Auditing (Rocket, Sandy, Admins)
    CREATE TABLE IF NOT EXISTS discord_abuse_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      target TEXT NOT NULL, -- 'sandy', 'rocket', 'admins'
      message_content TEXT,
      timeout_minutes INTEGER DEFAULT 30,
      status TEXT DEFAULT 'active', -- 'active', 'forgiven', 'expired'
      created_at TEXT NOT NULL,
      unmuted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_discord_abuse_user ON discord_abuse_incidents(guild_id, user_id);

    -- 1 Apology Per Week Tracking
    CREATE TABLE IF NOT EXISTS discord_abuse_apologies (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      last_apologized_at INTEGER NOT NULL,
      total_apologies INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id)
    );

    -- Member Activity Analytics & WWE-Style Ranking
    CREATE TABLE IF NOT EXISTS discord_member_activity (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      total_xp INTEGER DEFAULT 0,
      current_rank TEXT DEFAULT 'C',
      messages_count INTEGER DEFAULT 0,
      voice_minutes INTEGER DEFAULT 0,
      observed_online_minutes INTEGER DEFAULT 0,
      memes_count INTEGER DEFAULT 0,
      images_count INTEGER DEFAULT 0,
      videos_count INTEGER DEFAULT 0,
      last_xp_at TEXT,
      voice_joined_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_discord_activity_rank ON discord_member_activity(guild_id, total_xp DESC);

    -- Support & Help Tickets
    CREATE TABLE IF NOT EXISTS discord_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT,
      subject TEXT NOT NULL,
      status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
      assigned_to TEXT,
      staff_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_discord_tickets_user ON discord_tickets(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_discord_tickets_channel ON discord_tickets(channel_id);

    -- Message Evidence Archive (Transparent Logging & Verification)
    CREATE TABLE IF NOT EXISTS discord_message_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      message_id TEXT UNIQUE NOT NULL,
      author_id TEXT NOT NULL,
      author_tag TEXT,
      content TEXT,
      attachments_json TEXT DEFAULT '[]',
      is_edited INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      edit_history_json TEXT DEFAULT '[]',
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discord_archive_author ON discord_message_archive(guild_id, author_id);
    CREATE INDEX IF NOT EXISTS idx_discord_archive_channel ON discord_message_archive(guild_id, channel_id);

    -- Formal Moderation & Evidence Records
    CREATE TABLE IF NOT EXISTS discord_moderation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      moderator_id TEXT NOT NULL,
      moderator_tag TEXT,
      action TEXT NOT NULL, -- 'warn', 'timeout', 'kick', 'temp_ban', 'ban'
      reason TEXT NOT NULL,
      evidence_id TEXT,
      duration_minutes INTEGER DEFAULT 0,
      appeal_status TEXT DEFAULT 'none', -- 'none', 'pending', 'approved', 'rejected'
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discord_mod_rec_user ON discord_moderation_records(guild_id, user_id);

    -- Personal DM Notification Preferences
    CREATE TABLE IF NOT EXISTS discord_notification_preferences (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT,
      notify_voice_join INTEGER DEFAULT 1,
      notify_voice_leave INTEGER DEFAULT 0,
      notify_streaming INTEGER DEFAULT 1,
      notify_streaming_end INTEGER DEFAULT 0,
      notify_game_activity INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    -- Hall of Shame (Restricted Warning Archive for Confirmed Scammers)
    CREATE TABLE IF NOT EXISTS discord_hall_of_shame (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      target_user_tag TEXT,
      moderator_id TEXT NOT NULL,
      moderator_tag TEXT,
      reason TEXT NOT NULL,
      evidence_reference TEXT,
      appeal_status TEXT DEFAULT 'none',
      created_at TEXT NOT NULL
    );

    -- =========================================================================
    -- 🍕 ROCKET BLUEPRINT: WALLET LEDGER, ENTITLEMENTS, TOKENS & AUDIT
    -- =========================================================================

    -- 1. Member Wallet (Pizza Virtual Credit: 1 Pizza = ₹1)
    CREATE TABLE IF NOT EXISTS discord_wallets (
      member_id TEXT PRIMARY KEY,
      balance_pizza INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 2. Wallet Transactions (Double-Entry Audit Ledger)
    CREATE TABLE IF NOT EXISTS discord_wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL,
      amount_pizza INTEGER NOT NULL,
      direction TEXT NOT NULL, -- 'credit', 'debit'
      reason TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      status TEXT DEFAULT 'completed', -- 'pending', 'completed', 'cancelled'
      related_ticket_id INTEGER,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_member ON discord_wallet_transactions(member_id);

    -- 3. Payments (Inbound INR via India UPI / Google Pay)
    CREATE TABLE IF NOT EXISTS discord_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_ref TEXT,
      utr_number TEXT,
      amount_inr REAL NOT NULL,
      payer_id TEXT NOT NULL,
      payer_tag TEXT,
      status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
      receipt_url TEXT,
      created_at TEXT NOT NULL,
      verified_at TEXT,
      verified_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payments_payer ON discord_payments(payer_id);

    -- 4. Entitlements (Service and Workstation access rights)
    CREATE TABLE IF NOT EXISTS discord_entitlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL,
      section TEXT NOT NULL, -- 'coding', 'web', 'gaming', 'ai', 'research', 'all'
      scope TEXT NOT NULL, -- 'trial', '7d', '30d', 'permanent'
      starts_at TEXT NOT NULL,
      expires_at TEXT,
      status TEXT DEFAULT 'active', -- 'active', 'expired', 'revoked'
      granted_by TEXT NOT NULL,
      source TEXT DEFAULT 'purchase'
    );
    CREATE INDEX IF NOT EXISTS idx_entitlements_member ON discord_entitlements(member_id, section);

    -- 5. Token Accounts & Usage Metering (₹1 = 1,000 AI tokens)
    CREATE TABLE IF NOT EXISTS discord_token_accounts (
      member_id TEXT PRIMARY KEY,
      allowance_tokens INTEGER DEFAULT 0,
      used_tokens INTEGER DEFAULT 0,
      reasoning_mode TEXT DEFAULT 'high', -- 'none', 'low', 'high', 'max'
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discord_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      charge_tokens INTEGER NOT NULL,
      workstation TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_member ON discord_usage_events(member_id);

    -- 6. Immutable System Audit Events
    CREATE TABLE IF NOT EXISTS discord_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT,
      before_state TEXT,
      after_state TEXT,
      reason TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON discord_audit_events(actor_id);

    -- 7. Member Preferences (Language & Style)
    CREATE TABLE IF NOT EXISTS discord_member_preferences (
      member_id TEXT PRIMARY KEY,
      language TEXT DEFAULT 'English',
      response_style TEXT DEFAULT 'detailed',
      updated_at TEXT NOT NULL
    );
  `);

  try {
    db.exec('ALTER TABLE discord_guild_settings ADD COLUMN chat_channel_id TEXT;');
  } catch {}

  try {
    db.exec('ALTER TABLE discord_guild_settings ADD COLUMN is_muted INTEGER DEFAULT 0;');
  } catch {}

  try {
    db.exec('ALTER TABLE discord_member_activity ADD COLUMN voice_notes_count INTEGER DEFAULT 0;');
  } catch {}

  try {
    db.exec('ALTER TABLE discord_member_profiles ADD COLUMN verified INTEGER DEFAULT 0;');
  } catch {}
  try {
    db.exec('ALTER TABLE discord_member_profiles ADD COLUMN interests TEXT DEFAULT \'[]\';');
  } catch {}
  try {
    db.exec('ALTER TABLE discord_member_profiles ADD COLUMN relationship_sandy TEXT DEFAULT \'community\';');
  } catch {}
  try {
    db.exec('ALTER TABLE discord_member_profiles ADD COLUMN preferred_name TEXT;');
  } catch {}
  try {
    db.exec('ALTER TABLE discord_member_profiles ADD COLUMN verified_at TEXT;');
  } catch {}

  try {
    db.exec('ALTER TABLE discord_tickets ADD COLUMN category TEXT DEFAULT \'general\';');
  } catch {}
  try {
    db.exec('ALTER TABLE discord_tickets ADD COLUMN payout_reference TEXT;');
  } catch {}
  try {
    db.exec('ALTER TABLE discord_tickets ADD COLUMN auto_close_paused INTEGER DEFAULT 0;');
  } catch {}

  // Automatically provision Supreme Boss Sandy's balances on any database (local & Railway volume)
  try {
    const ownerIds = ['1477589102110183477', '1567572226755006494'];
    const now = new Date().toISOString();
    for (const oid of ownerIds) {
      // 1. Ensure token account has at least 1,000,000,000 allowance
      const acc = db.prepare('SELECT * FROM discord_token_accounts WHERE member_id = ?').get(oid);
      if (!acc) {
        db.prepare("INSERT INTO discord_token_accounts (member_id, allowance_tokens, used_tokens, reasoning_mode, updated_at) VALUES (?, 1000000000, 0, 'high', ?)").run(oid, now);
      } else if (!acc.allowance_tokens || acc.allowance_tokens < 1000000000) {
        db.prepare('UPDATE discord_token_accounts SET allowance_tokens = 1000000000, updated_at = ? WHERE member_id = ?').run(now, oid);
      }

      // 2. Ensure wallet has at least 10,000 Pizza
      const wal = db.prepare('SELECT * FROM discord_wallets WHERE member_id = ?').get(oid);
      if (!wal) {
        db.prepare('INSERT INTO discord_wallets (member_id, balance_pizza, created_at, updated_at) VALUES (?, 10000, ?, ?)').run(oid, now, now);
      } else if (!wal.balance_pizza || wal.balance_pizza < 10000) {
        db.prepare('UPDATE discord_wallets SET balance_pizza = 10000, updated_at = ? WHERE member_id = ?').run(now, oid);
      }

      // 3. Ensure full workstation entitlements (coding, web, gaming, ai, research)
      const sections = ['coding', 'web', 'gaming', 'ai', 'research'];
      for (const sec of sections) {
        const ent = db.prepare('SELECT * FROM discord_entitlements WHERE member_id = ? AND section = ?').get(oid, sec);
        if (!ent) {
          db.prepare("INSERT INTO discord_entitlements (member_id, section, scope, starts_at, status, granted_by, source) VALUES (?, ?, 'permanent', ?, 'active', 'system', 'owner_grant')").run(oid, sec, now);
        }
      }
    }
  } catch (ownerInitErr) {
    console.warn('[Owner Init Warning]:', ownerInitErr.message);
  }

  initialized = true;
}

// ---------------------------------------------------------------------------
// Guild Settings
// ---------------------------------------------------------------------------

export function getGuildSettings(guildId) {
  initDiscordDb();
  const db = getDb();
  let row = db.prepare('SELECT * FROM discord_guild_settings WHERE guild_id = ?').get(String(guildId));
  if (!row) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO discord_guild_settings (guild_id, guild_name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(String(guildId), 'Unknown Guild', now, now);
    row = db.prepare('SELECT * FROM discord_guild_settings WHERE guild_id = ?').get(String(guildId));
  }
  return row;
}

export function updateGuildSettings(guildId, updates = {}) {
  initDiscordDb();
  const db = getDb();
  const current = getGuildSettings(guildId);
  const now = new Date().toISOString();

  const merged = {
    guild_name: updates.guild_name ?? current.guild_name,
    mod_log_channel_id: updates.mod_log_channel_id !== undefined ? updates.mod_log_channel_id : current.mod_log_channel_id,
    welcome_channel_id: updates.welcome_channel_id !== undefined ? updates.welcome_channel_id : current.welcome_channel_id,
    rules_channel_id: updates.rules_channel_id !== undefined ? updates.rules_channel_id : current.rules_channel_id,
    auto_mod_enabled: updates.auto_mod_enabled !== undefined ? (updates.auto_mod_enabled ? 1 : 0) : current.auto_mod_enabled,
    anti_spam: updates.anti_spam !== undefined ? (updates.anti_spam ? 1 : 0) : current.anti_spam,
    anti_invite: updates.anti_invite !== undefined ? (updates.anti_invite ? 1 : 0) : current.anti_invite,
    anti_mass_mention: updates.anti_mass_mention !== undefined ? (updates.anti_mass_mention ? 1 : 0) : current.anti_mass_mention,
    chat_mode: updates.chat_mode ?? current.chat_mode,
    chat_channel_id: updates.chat_channel_id !== undefined ? updates.chat_channel_id : current.chat_channel_id,
    is_muted: updates.is_muted !== undefined ? (updates.is_muted ? 1 : 0) : (current.is_muted ? 1 : 0),
    server_rules: updates.server_rules !== undefined ? updates.server_rules : current.server_rules,
    server_overview: updates.server_overview !== undefined ? updates.server_overview : current.server_overview,
  };

  db.prepare(`
    UPDATE discord_guild_settings SET
      guild_name = ?,
      mod_log_channel_id = ?,
      welcome_channel_id = ?,
      rules_channel_id = ?,
      auto_mod_enabled = ?,
      anti_spam = ?,
      anti_invite = ?,
      anti_mass_mention = ?,
      chat_mode = ?,
      chat_channel_id = ?,
      is_muted = ?,
      server_rules = ?,
      server_overview = ?,
      updated_at = ?
    WHERE guild_id = ?
  `).run(
    merged.guild_name,
    merged.mod_log_channel_id,
    merged.welcome_channel_id,
    merged.rules_channel_id,
    merged.auto_mod_enabled,
    merged.anti_spam,
    merged.anti_invite,
    merged.anti_mass_mention,
    merged.chat_mode,
    merged.chat_channel_id,
    merged.is_muted,
    merged.server_rules,
    merged.server_overview,
    now,
    String(guildId)
  );

  return getGuildSettings(guildId);
}

// ---------------------------------------------------------------------------
// Member Profiles & Tier Tagging
// ---------------------------------------------------------------------------

export const MEMBER_TIERS = {
  OWNER: 'owner',
  FAMILY: 'family',
  FRIEND: 'friend',
  TEAM: 'team',
  EMPLOYEE: 'employee',
  MEMBER: 'member',
};

export function getMemberProfile(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  const row = db.prepare('SELECT * FROM discord_member_profiles WHERE guild_id = ? AND user_id = ?').get(String(guildId), String(userId));
  if (!row) return null;
  if (row.interests) {
    if (typeof row.interests === 'string') {
      try {
        const parsed = JSON.parse(row.interests);
        row.interests = Array.isArray(parsed) ? parsed : [];
      } catch {
        row.interests = row.interests.trim() ? [row.interests.trim()] : [];
      }
    } else if (!Array.isArray(row.interests)) {
      row.interests = [];
    }
  } else {
    row.interests = [];
  }
  return row;
}

export function setMemberTier(guildId, userId, tier, { username = '', displayName = '', notes = '' } = {}) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const gid = String(guildId);
  const uid = String(userId);

  db.prepare(`
    INSERT INTO discord_member_profiles (guild_id, user_id, username, display_name, role_tier, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      username = coalesce(nullif(excluded.username, ''), discord_member_profiles.username),
      display_name = coalesce(nullif(excluded.display_name, ''), discord_member_profiles.display_name),
      role_tier = excluded.role_tier,
      notes = coalesce(excluded.notes, discord_member_profiles.notes),
      updated_at = excluded.updated_at
  `).run(gid, uid, username, displayName, tier, notes, now, now);

  return getMemberProfile(gid, uid);
}

export function listMembersByTier(guildId, tier = null) {
  initDiscordDb();
  const db = getDb();
  if (tier) {
    return db.prepare('SELECT * FROM discord_member_profiles WHERE guild_id = ? AND role_tier = ? ORDER BY display_name ASC').all(String(guildId), tier);
  }
  return db.prepare('SELECT * FROM discord_member_profiles WHERE guild_id = ? ORDER BY role_tier ASC, display_name ASC').all(String(guildId));
}

// ---------------------------------------------------------------------------
// Warnings & Moderation History
// ---------------------------------------------------------------------------

export function addWarning(guildId, userId, userTag, moderatorId, moderatorTag, reason = 'No reason provided') {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const gid = String(guildId);
  const uid = String(userId);

  // 1. Record mod log
  db.prepare(`
    INSERT INTO discord_mod_logs (guild_id, user_id, user_tag, moderator_id, moderator_tag, action, reason, timestamp)
    VALUES (?, ?, ?, ?, ?, 'warn', ?, ?)
  `).run(gid, uid, userTag, String(moderatorId), moderatorTag, reason, now);

  // 2. Increment profile warning count
  db.prepare(`
    INSERT INTO discord_member_profiles (guild_id, user_id, user_tag, warnings_count, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      warnings_count = warnings_count + 1,
      updated_at = excluded.updated_at
  `).run(gid, uid, userTag, now, now);

  const profile = getMemberProfile(gid, uid);
  return {
    warningCount: profile ? profile.warnings_count : 1,
    reason,
    timestamp: now,
  };
}

export function getUserWarnings(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM discord_mod_logs 
    WHERE guild_id = ? AND user_id = ? AND action = 'warn'
    ORDER BY id DESC
  `).all(String(guildId), String(userId));
}

export function clearUserWarnings(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const gid = String(guildId);
  const uid = String(userId);

  db.prepare(`
    UPDATE discord_member_profiles SET warnings_count = 0, updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(now, gid, uid);

  return true;
}

export function recordModLog(guildId, { action, userId, userTag, moderatorId, moderatorTag, reason = '', details = '' }) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();

  return db.prepare(`
    INSERT INTO discord_mod_logs (guild_id, user_id, user_tag, moderator_id, moderator_tag, action, reason, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(guildId),
    String(userId),
    userTag || 'Unknown User',
    String(moderatorId),
    moderatorTag || 'Rocket Security',
    action,
    reason || 'None specified',
    details || '',
    now
  );
}

export function getRecentModLogs(guildId, limit = 15) {
  initDiscordDb();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM discord_mod_logs 
    WHERE guild_id = ? 
    ORDER BY id DESC 
    LIMIT ?
  `).all(String(guildId), limit);
}

// ---------------------------------------------------------------------------
// Server Knowledge Base
// ---------------------------------------------------------------------------

export function setKnowledge(guildId, topic, content, createdBy = 'Sandy') {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const cleanTopic = String(topic).toLowerCase().trim().replace(/[\s-]+/g, '_');

  db.prepare(`
    INSERT INTO discord_server_knowledge (guild_id, topic, content, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, topic) DO UPDATE SET
      content = excluded.content,
      created_by = excluded.created_by,
      updated_at = excluded.updated_at
  `).run(String(guildId), cleanTopic, content.trim(), createdBy, now, now);

  return { topic: cleanTopic, content: content.trim() };
}

export function getKnowledge(guildId, topic) {
  initDiscordDb();
  const db = getDb();
  const cleanTopic = String(topic).toLowerCase().trim().replace(/[\s-]+/g, '_');
  return db.prepare('SELECT * FROM discord_server_knowledge WHERE guild_id = ? AND topic = ?').get(String(guildId), cleanTopic);
}

export function deleteKnowledge(guildId, topic) {
  initDiscordDb();
  const db = getDb();
  const cleanTopic = String(topic).toLowerCase().trim().replace(/[\s-]+/g, '_');
  return db.prepare('DELETE FROM discord_server_knowledge WHERE guild_id = ? AND topic = ?').run(String(guildId), cleanTopic);
}

export function getAllKnowledge(guildId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT topic, content, updated_at FROM discord_server_knowledge WHERE guild_id = ? ORDER BY topic ASC').all(String(guildId));
}

export function getFormattedServerContext(guildId) {
  initDiscordDb();
  const settings = getGuildSettings(guildId);
  const knowledgeRows = getAllKnowledge(guildId);
  const profiles = listMembersByTier(guildId);

  let text = `=== SERVER KNOWLEDGE & RULES FOR "${settings.guild_name}" ===\n`;
  if (settings.server_rules) {
    text += `[OFFICIAL SERVER RULES]\n${settings.server_rules}\n\n`;
  }
  if (settings.server_overview) {
    text += `[SERVER OVERVIEW / MISSION]\n${settings.server_overview}\n\n`;
  }

  if (knowledgeRows.length > 0) {
    text += `[SERVER KNOWLEDGE TOPICS]\n`;
    for (const k of knowledgeRows) {
      text += `• ${k.topic.toUpperCase()}: ${k.content}\n`;
    }
    text += `\n`;
  }

  if (profiles.length > 0) {
    text += `[SERVER ROSTER & TIERS (Family / Friends / Team / Employees)]\n`;
    for (const p of profiles) {
      if (p.role_tier !== 'member') {
        text += `• ${p.display_name || p.username} -> Tier: ${p.role_tier.toUpperCase()}${p.notes ? ` (${p.notes})` : ''}\n`;
      }
    }
    text += `\n`;
  }

  return text;
}

// ---------------------------------------------------------------------------
// Channel Configuration Registry
// ---------------------------------------------------------------------------

export function registerChannelConfig(channelData) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO discord_channel_registry (
      guild_id, channel_id, channel_name, category_name, purpose,
      ai_behavior_profile, reasoning_level, speed_preference, token_optimization,
      allowed_tools, permission_requirements, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, channel_id) DO UPDATE SET
      channel_name = excluded.channel_name,
      category_name = excluded.category_name,
      purpose = excluded.purpose,
      ai_behavior_profile = excluded.ai_behavior_profile,
      reasoning_level = excluded.reasoning_level,
      speed_preference = excluded.speed_preference,
      token_optimization = excluded.token_optimization,
      allowed_tools = excluded.allowed_tools,
      permission_requirements = excluded.permission_requirements,
      updated_at = excluded.updated_at
  `).run(
    String(channelData.guild_id),
    String(channelData.channel_id),
    channelData.channel_name,
    channelData.category_name || '',
    channelData.purpose || '',
    channelData.ai_behavior_profile || 'general',
    channelData.reasoning_level || 'low',
    channelData.speed_preference || 'fast',
    channelData.token_optimization || 'standard',
    typeof channelData.allowed_tools === 'string' ? channelData.allowed_tools : JSON.stringify(channelData.allowed_tools || []),
    channelData.permission_requirements || 'member',
    now
  );

  return getChannelConfig(channelData.guild_id, channelData.channel_id);
}

export function getChannelConfig(guildId, channelId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_channel_registry WHERE guild_id = ? AND channel_id = ?').get(String(guildId), String(channelId));
}

export function getChannelConfigByName(guildId, channelName) {
  initDiscordDb();
  const db = getDb();
  const clean = String(channelName).toLowerCase().replace(/^#/, '').trim();
  return db.prepare('SELECT * FROM discord_channel_registry WHERE guild_id = ? AND lower(channel_name) = ?').get(String(guildId), clean);
}

export function getAllChannelConfigs(guildId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_channel_registry WHERE guild_id = ? ORDER BY category_name ASC, channel_name ASC').all(String(guildId));
}

// ---------------------------------------------------------------------------
// Strict User Permissions & Owner Governance
// ---------------------------------------------------------------------------

export function getUserPermission(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_user_permissions WHERE guild_id = ? AND user_id = ?').get(String(guildId), String(userId));
}

export function grantUserPermission(guildId, userId, { username = '', displayName = '', scopes = 'member', isOwner = 0, grantedBy = 'Nero' } = {}) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const cleanScopes = Array.isArray(scopes) ? scopes.join(',') : String(scopes);

  db.prepare(`
    INSERT INTO discord_user_permissions (
      guild_id, user_id, username, display_name, is_owner, permission_scopes, granted_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      username = coalesce(nullif(excluded.username, ''), discord_user_permissions.username),
      display_name = coalesce(nullif(excluded.display_name, ''), discord_user_permissions.display_name),
      is_owner = excluded.is_owner,
      permission_scopes = excluded.permission_scopes,
      granted_by = excluded.granted_by,
      updated_at = excluded.updated_at
  `).run(
    String(guildId),
    String(userId),
    username,
    displayName,
    isOwner ? 1 : 0,
    cleanScopes,
    grantedBy,
    now,
    now
  );

  return getUserPermission(guildId, userId);
}

export function revokeUserPermission(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('DELETE FROM discord_user_permissions WHERE guild_id = ? AND user_id = ?').run(String(guildId), String(userId));
}

export function listAuthorizedUsers(guildId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_user_permissions WHERE guild_id = ? ORDER BY is_owner DESC, username ASC').all(String(guildId));
}

export function checkUserHasScope(guildId, userId, scope, isOwnerFallback = false) {
  if (isOwnerFallback) return true;
  const perm = getUserPermission(guildId, userId);
  if (!perm) return false;
  if (perm.is_owner) return true;
  const scopes = (perm.permission_scopes || '').split(',').map((s) => s.trim().toLowerCase());
  return scopes.includes(scope.toLowerCase()) || scopes.includes('admin');
}

// ---------------------------------------------------------------------------
// Member Gaming Profiles
// ---------------------------------------------------------------------------

export function saveGamingProfile(guildId, userId, { username = '', gameName, inGameUsername, platform = 'PC', notes = '' } = {}) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO discord_gaming_profiles (
      guild_id, user_id, username, game_name, in_game_username, platform, notes, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, game_name) DO UPDATE SET
      username = coalesce(nullif(excluded.username, ''), discord_gaming_profiles.username),
      in_game_username = excluded.in_game_username,
      platform = excluded.platform,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    String(guildId),
    String(userId),
    username,
    gameName.trim(),
    inGameUsername.trim(),
    platform.trim(),
    notes.trim(),
    now
  );

  return db.prepare('SELECT * FROM discord_gaming_profiles WHERE guild_id = ? AND user_id = ? AND game_name = ?').get(String(guildId), String(userId), gameName.trim());
}

export function getUserGamingProfiles(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_gaming_profiles WHERE guild_id = ? AND user_id = ? ORDER BY game_name ASC').all(String(guildId), String(userId));
}

export function getAllGamingProfiles(guildId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_gaming_profiles WHERE guild_id = ? ORDER BY game_name ASC, username ASC').all(String(guildId));
}

// ---------------------------------------------------------------------------
// Isolated User Sessions & Tokens
// ---------------------------------------------------------------------------

export function createUserSession(guildId, userId, username, role = 'member', ttlHours = 72) {
  initDiscordDb();
  const db = getDb();
  const token = 'rkt_' + crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO discord_user_sessions (token, user_id, username, guild_id, role, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, String(userId), username || 'User', String(guildId), role, now.toISOString(), expiresAt);

  return { token, expiresAt };
}

export function getUserSession(token) {
  initDiscordDb();
  const db = getDb();
  const session = db.prepare('SELECT * FROM discord_user_sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM discord_user_sessions WHERE token = ?').run(token);
    return null;
  }
  return session;
}

// ---------------------------------------------------------------------------
// Server Links & Bookmarks
// ---------------------------------------------------------------------------

export function getServerLinks(guildId) {
  initDiscordDb();
  const db = getDb();
  let links = db.prepare('SELECT * FROM discord_server_links WHERE guild_id = ?').get(String(guildId));
  if (!links) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO discord_server_links (guild_id, website_url, linktree_url, rocket_mobile_url, friends_linktree_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      String(guildId),
      'https://nero-labs-bot-production.up.railway.app',
      'https://linktr.ee/neroaurelius',
      'https://nero-labs-bot-production.up.railway.app/rock3t/index.html',
      '[]',
      now
    );
    links = db.prepare('SELECT * FROM discord_server_links WHERE guild_id = ?').get(String(guildId));
  }
  return links;
}

export function updateServerLinks(guildId, updates = {}) {
  initDiscordDb();
  const db = getDb();
  const current = getServerLinks(guildId);
  const now = new Date().toISOString();

  const merged = {
    website_url: updates.website_url ?? current.website_url,
    linktree_url: updates.linktree_url ?? current.linktree_url,
    rocket_mobile_url: updates.rocket_mobile_url ?? current.rocket_mobile_url,
    friends_linktree_json: updates.friends_linktree_json ?? current.friends_linktree_json,
  };

  db.prepare(`
    UPDATE discord_server_links SET
      website_url = ?,
      linktree_url = ?,
      rocket_mobile_url = ?,
      friends_linktree_json = ?,
      updated_at = ?
    WHERE guild_id = ?
  `).run(
    merged.website_url,
    merged.linktree_url,
    merged.rocket_mobile_url,
    merged.friends_linktree_json,
    now,
    String(guildId)
  );

  return getServerLinks(guildId);
}

// ---------------------------------------------------------------------------
// Anti-Spam Incident Auditing
// ---------------------------------------------------------------------------

export function createSpamIncident(guildId, userId, userTag, messageContent, timeoutMinutes = 30) {
  initDiscordDb();
  const db = getDb();
  const now = new Date();
  const timeoutUntil = new Date(now.getTime() + timeoutMinutes * 60 * 1000).toISOString();

  const info = db.prepare(`
    INSERT INTO discord_spam_incidents (guild_id, user_id, user_tag, message_content, timeout_until, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(
    String(guildId),
    String(userId),
    userTag || 'Unknown Member',
    String(messageContent || '').slice(0, 500),
    timeoutUntil,
    now.toISOString()
  );

  return {
    id: Number(info.lastInsertRowid),
    guild_id: String(guildId),
    user_id: String(userId),
    user_tag: userTag,
    message_content: messageContent,
    timeout_until: timeoutUntil,
    status: 'active',
    created_at: now.toISOString(),
  };
}

export function getSpamIncident(incidentId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_spam_incidents WHERE id = ?').get(Number(incidentId));
}

export function resolveSpamIncident(incidentId, status = 'forgiven') {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE discord_spam_incidents SET status = ?, unmuted_at = ? WHERE id = ?
  `).run(status, now, Number(incidentId));
  return getSpamIncident(incidentId);
}

export function getUserActiveSpamIncident(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM discord_spam_incidents
    WHERE guild_id = ? AND user_id = ? AND status = 'active' AND timeout_until > ?
    ORDER BY id DESC LIMIT 1
  `).get(String(guildId), String(userId), now);
}

// ---------------------------------------------------------------------------
// Abuse Incident & Weekly Apology Auditing (Rocket, Sandy, Admins)
// ---------------------------------------------------------------------------

export function createAbuseIncident(guildId, userId, userTag, target, messageContent, timeoutMinutes = 30) {
  initDiscordDb();
  const db = getDb();
  const now = new Date();
  const info = db.prepare(`
    INSERT INTO discord_abuse_incidents (guild_id, user_id, user_tag, target, message_content, timeout_minutes, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(
    String(guildId),
    String(userId),
    userTag || 'Unknown Member',
    String(target || 'rocket'),
    String(messageContent || '').slice(0, 500),
    Number(timeoutMinutes),
    now.toISOString()
  );

  return {
    id: Number(info.lastInsertRowid),
    guild_id: String(guildId),
    user_id: String(userId),
    user_tag: userTag,
    target,
    message_content: messageContent,
    timeout_minutes: timeoutMinutes,
    status: 'active',
    created_at: now.toISOString(),
  };
}

export function getAbuseIncident(incidentId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_abuse_incidents WHERE id = ?').get(Number(incidentId));
}

export function resolveAbuseIncident(incidentId, status = 'forgiven') {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE discord_abuse_incidents SET status = ?, unmuted_at = ? WHERE id = ?
  `).run(status, now, Number(incidentId));
  return getAbuseIncident(incidentId);
}

export function canUserApologizeThisWeek(userId, guildId) {
  initDiscordDb();
  const db = getDb();
  const record = db.prepare(`
    SELECT * FROM discord_abuse_apologies WHERE user_id = ? AND guild_id = ?
  `).get(String(userId), String(guildId));

  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  if (!record || !record.last_apologized_at) {
    return { eligible: true, remainingMs: 0, lastApologizedAt: null, totalApologies: 0 };
  }

  const elapsed = Date.now() - Number(record.last_apologized_at);
  if (elapsed >= ONE_WEEK_MS) {
    return { eligible: true, remainingMs: 0, lastApologizedAt: Number(record.last_apologized_at), totalApologies: record.total_apologies };
  }

  return {
    eligible: false,
    remainingMs: ONE_WEEK_MS - elapsed,
    lastApologizedAt: Number(record.last_apologized_at),
    totalApologies: record.total_apologies,
  };
}

export function recordUserWeeklyApology(userId, guildId) {
  initDiscordDb();
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO discord_abuse_apologies (user_id, guild_id, last_apologized_at, total_apologies)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      last_apologized_at = ?,
      total_apologies = total_apologies + 1
  `).run(String(userId), String(guildId), now, now);
}

// ---------------------------------------------------------------------------
// WWE-Style Ranking System & Member Activity Tracking
// ---------------------------------------------------------------------------

export const WWE_RANKS = [
  { rank: 'C', minXp: 0, multiplier: 1.00, title: 'Rookie Contender' },
  { rank: 'B', minXp: 100, multiplier: 1.10, title: 'Cruiserweight' },
  { rank: 'A', minXp: 300, multiplier: 1.21, title: 'Mid-Card Dynamo' },
  { rank: 'A+', minXp: 600, multiplier: 1.33, title: 'Intercontinental Elite' },
  { rank: 'S', minXp: 1000, multiplier: 1.46, title: 'Heavyweight Contender' },
  { rank: 'S+', minXp: 1600, multiplier: 1.61, title: 'Main Eventer' },
  { rank: 'S++', minXp: 2400, multiplier: 1.77, title: 'World Heavyweight Phenom' },
  { rank: 'SS', minXp: 3500, multiplier: 1.95, title: 'Grand Slam Champion' },
  { rank: 'SS+', minXp: 5000, multiplier: 2.14, title: 'Undisputed Universal Legend' },
  { rank: 'SS++', minXp: 7200, multiplier: 2.36, title: 'Hall of Fame Icon' },
  { rank: 'SSS', minXp: 10000, multiplier: 2.59, title: 'Immortal Apex Champion' },
];

export function calculateRankFromXp(xp, isOwner = false) {
  if (isOwner) {
    return {
      rank: 'SSS',
      minXp: 10000,
      nextRankMinXp: 10000,
      multiplier: 2.59,
      title: 'Supreme Boss & Creator 👑',
      progressPercent: 100,
    };
  }

  const safeXp = Math.max(0, Number(xp) || 0);
  let matchedRankIndex = 0;

  for (let i = WWE_RANKS.length - 1; i >= 0; i--) {
    if (safeXp >= WWE_RANKS[i].minXp) {
      matchedRankIndex = i;
      break;
    }
  }

  const current = WWE_RANKS[matchedRankIndex];
  const next = WWE_RANKS[matchedRankIndex + 1] || null;

  let progressPercent = 100;
  if (next) {
    const range = next.minXp - current.minXp;
    const currentProgress = safeXp - current.minXp;
    progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / range) * 100)));
  }

  return {
    ...current,
    nextRankMinXp: next ? next.minXp : current.minXp,
    nextRankName: next ? next.rank : 'MAX',
    progressPercent,
  };
}

export function getMemberActivity(guildId, userId, isOwner = false) {
  initDiscordDb();
  const db = getDb();
  const gid = String(guildId);
  const uid = String(userId);

  let row = db.prepare('SELECT * FROM discord_member_activity WHERE guild_id = ? AND user_id = ?').get(gid, uid);
  const now = new Date().toISOString();

  if (!row) {
    const defaultRank = isOwner ? 'SSS' : 'C';
    const defaultXp = isOwner ? 99999 : 0;
    db.prepare(`
      INSERT INTO discord_member_activity (
        guild_id, user_id, username, display_name, total_xp, current_rank,
        messages_count, voice_minutes, observed_online_minutes, memes_count,
        images_count, videos_count, updated_at
      )
      VALUES (?, ?, '', '', ?, ?, 0, 0, 0, 0, 0, 0, ?)
    `).run(gid, uid, defaultXp, defaultRank, now);
    row = db.prepare('SELECT * FROM discord_member_activity WHERE guild_id = ? AND user_id = ?').get(gid, uid);
  }

  const rankInfo = calculateRankFromXp(row.total_xp, isOwner);
  return {
    ...row,
    rankInfo,
  };
}

export function awardMessageActivity(guildId, userId, {
  username = '',
  displayName = '',
  hasAttachments = false,
  isMemeOrMedia = false,
  mediaType = null, // 'image', 'video', 'audio', null
  isOwner = false,
} = {}) {
  initDiscordDb();
  const db = getDb();
  const gid = String(guildId);
  const uid = String(userId);
  const now = new Date();
  const nowIso = now.toISOString();

  const activity = getMemberActivity(gid, uid, isOwner);
  const rankInfo = activity.rankInfo;

  // 45s XP cooldown protection
  let xpGained = 0;
  const lastXpTime = activity.last_xp_at ? new Date(activity.last_xp_at).getTime() : 0;
  const cooldownMs = 45 * 1000;
  const canGainXp = now.getTime() - lastXpTime >= cooldownMs;

  if (canGainXp && !isOwner) {
    const baseMessageXp = 5;
    xpGained = Math.round(baseMessageXp * rankInfo.multiplier);
  }

  const newTotalXp = isOwner ? 99999 : activity.total_xp + xpGained;
  const newRankInfo = calculateRankFromXp(newTotalXp, isOwner);
  const rankAscended = !isOwner && activity.current_rank !== newRankInfo.rank;

  const memesInc = isMemeOrMedia ? 1 : 0;
  const imagesInc = mediaType === 'image' || (hasAttachments && !mediaType) ? 1 : 0;
  const videosInc = mediaType === 'video' ? 1 : 0;
  const voiceNotesInc = mediaType === 'audio' ? 1 : 0;

  db.prepare(`
    UPDATE discord_member_activity SET
      username = coalesce(nullif(?, ''), username),
      display_name = coalesce(nullif(?, ''), display_name),
      total_xp = ?,
      current_rank = ?,
      messages_count = messages_count + 1,
      memes_count = memes_count + ?,
      images_count = images_count + ?,
      videos_count = videos_count + ?,
      voice_notes_count = coalesce(voice_notes_count, 0) + ?,
      last_xp_at = case when ? > 0 then ? else last_xp_at end,
      updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    username,
    displayName,
    newTotalXp,
    newRankInfo.rank,
    memesInc,
    imagesInc,
    videosInc,
    voiceNotesInc,
    xpGained,
    nowIso,
    nowIso,
    gid,
    uid
  );

  return {
    oldRank: activity.current_rank,
    newRank: newRankInfo.rank,
    rankAscended,
    xpGained,
    totalXp: newTotalXp,
    rankInfo: newRankInfo,
  };
}

export function startVoiceSession(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  const nowIso = new Date().toISOString();
  getMemberActivity(guildId, userId); // Ensure row exists
  db.prepare(`
    UPDATE discord_member_activity SET voice_joined_at = ?, updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(nowIso, nowIso, String(guildId), String(userId));
}

export function endVoiceSession(guildId, userId, isOwner = false) {
  initDiscordDb();
  const db = getDb();
  const activity = getMemberActivity(guildId, userId, isOwner);
  if (!activity.voice_joined_at) return { minutesSpent: 0, xpGained: 0, rankAscended: false };

  const joinTime = new Date(activity.voice_joined_at).getTime();
  const now = Date.now();
  const durationMs = Math.max(0, now - joinTime);
  const minutesSpent = Math.floor(durationMs / (60 * 1000));
  const nowIso = new Date().toISOString();

  let xpGained = 0;
  if (minutesSpent > 0 && !isOwner) {
    const baseVoiceXpPerMin = 1;
    xpGained = Math.round(minutesSpent * baseVoiceXpPerMin * activity.rankInfo.multiplier);
  }

  const newTotalXp = isOwner ? 99999 : activity.total_xp + xpGained;
  const newRankInfo = calculateRankFromXp(newTotalXp, isOwner);
  const rankAscended = !isOwner && activity.current_rank !== newRankInfo.rank;

  db.prepare(`
    UPDATE discord_member_activity SET
      total_xp = ?,
      current_rank = ?,
      voice_minutes = voice_minutes + ?,
      voice_joined_at = NULL,
      updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    newTotalXp,
    newRankInfo.rank,
    minutesSpent,
    nowIso,
    String(guildId),
    String(userId)
  );

  return {
    minutesSpent,
    xpGained,
    rankAscended,
    oldRank: activity.current_rank,
    newRank: newRankInfo.rank,
    rankInfo: newRankInfo,
  };
}

export function addObservedPresence(guildId, userId, minutes = 5) {
  initDiscordDb();
  const db = getDb();
  const nowIso = new Date().toISOString();
  getMemberActivity(guildId, userId);
  db.prepare(`
    UPDATE discord_member_activity SET
      observed_online_minutes = observed_online_minutes + ?,
      updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(minutes, nowIso, String(guildId), String(userId));
}

export function getLeaderboard(guildId, limit = 10) {
  initDiscordDb();
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM discord_member_activity
    WHERE guild_id = ?
    ORDER BY total_xp DESC, messages_count DESC
    LIMIT ?
  `).all(String(guildId), limit);

  return rows.map((r, idx) => ({
    position: idx + 1,
    ...r,
    rankInfo: calculateRankFromXp(r.total_xp),
  }));
}

// ---------------------------------------------------------------------------
// Member Verification & Identity
// ---------------------------------------------------------------------------

export function completeMemberVerification(guildId, userId, {
  preferredName = '',
  interests = [],
  relationshipSandy = 'community',
  username = '',
  displayName = '',
} = {}) {
  initDiscordDb();
  const db = getDb();
  const nowIso = new Date().toISOString();
  const gid = String(guildId);
  const uid = String(userId);
  const cleanInterests = JSON.stringify(Array.isArray(interests) ? interests : []);

  db.prepare(`
    INSERT INTO discord_member_profiles (
      guild_id, user_id, username, display_name, preferred_name,
      verified, interests, relationship_sandy, verified_at,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      username = coalesce(nullif(excluded.username, ''), discord_member_profiles.username),
      display_name = coalesce(nullif(excluded.display_name, ''), discord_member_profiles.display_name),
      preferred_name = coalesce(nullif(excluded.preferred_name, ''), discord_member_profiles.preferred_name),
      verified = 1,
      interests = excluded.interests,
      relationship_sandy = excluded.relationship_sandy,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at
  `).run(
    gid,
    uid,
    username,
    displayName,
    preferredName,
    cleanInterests,
    relationshipSandy,
    nowIso,
    nowIso,
    nowIso
  );

  return getMemberProfile(gid, uid);
}

export function isMemberVerified(guildId, userId) {
  initDiscordDb();
  const profile = getMemberProfile(guildId, userId);
  return Boolean(profile && profile.verified);
}

// ---------------------------------------------------------------------------
// Support & Help Ticket Records
// ---------------------------------------------------------------------------

export function createTicket(guildId, userId, { username = '', subject, channelId = null }) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO discord_tickets (guild_id, channel_id, user_id, username, subject, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(String(guildId), channelId, String(userId), username, subject, now, now);

  const ticketId = Number(info.lastInsertRowid);
  return getTicket(ticketId);
}

export function getTicket(ticketId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_tickets WHERE id = ?').get(Number(ticketId));
}

export function getTicketByChannel(channelId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_tickets WHERE channel_id = ?').get(String(channelId));
}

export function updateTicketChannel(ticketId, channelId) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE discord_tickets SET channel_id = ?, updated_at = ? WHERE id = ?')
    .run(String(channelId), now, Number(ticketId));
  return getTicket(ticketId);
}

export function updateTicketStatus(ticketId, status, { assignedTo = null, staffNotes = null } = {}) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const closedAt = (status === 'resolved' || status === 'closed') ? now : null;

  db.prepare(`
    UPDATE discord_tickets SET
      status = ?,
      assigned_to = coalesce(?, assigned_to),
      staff_notes = coalesce(?, staff_notes),
      closed_at = coalesce(?, closed_at),
      updated_at = ?
    WHERE id = ?
  `).run(status, assignedTo, staffNotes, closedAt, now, Number(ticketId));

  return getTicket(ticketId);
}

export function listActiveTickets(guildId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM discord_tickets
    WHERE guild_id = ? AND status IN ('open', 'in_progress')
    ORDER BY id DESC
  `).all(String(guildId));
}

// ---------------------------------------------------------------------------
// Message Evidence Archive & Verification
// ---------------------------------------------------------------------------

export function archiveMessage(guildId, channelId, channelName, message) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const attachmentsJson = JSON.stringify(
    message.attachments ? Array.from(message.attachments.values()).map(a => ({
      id: a.id,
      name: a.name,
      url: a.url,
      contentType: a.contentType,
      size: a.size,
    })) : []
  );

  db.prepare(`
    INSERT INTO discord_message_archive (
      guild_id, channel_id, channel_name, message_id, author_id, author_tag,
      content, attachments_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      content = excluded.content,
      attachments_json = excluded.attachments_json,
      updated_at = excluded.updated_at
  `).run(
    String(guildId),
    String(channelId),
    channelName || 'unknown',
    String(message.id),
    String(message.author.id),
    message.author.tag || message.author.username,
    message.content || '',
    attachmentsJson,
    now,
    now
  );
}

export function archiveMessageEdit(messageId, oldContent, newContent) {
  initDiscordDb();
  const db = getDb();
  const existing = db.prepare('SELECT * FROM discord_message_archive WHERE message_id = ?').get(String(messageId));
  const now = new Date().toISOString();

  let history = [];
  try {
    if (existing?.edit_history_json) history = JSON.parse(existing.edit_history_json);
  } catch {}

  history.push({
    previous: oldContent,
    edited_at: now,
  });

  db.prepare(`
    UPDATE discord_message_archive SET
      content = ?,
      is_edited = 1,
      edit_history_json = ?,
      updated_at = ?
    WHERE message_id = ?
  `).run(newContent, JSON.stringify(history), now, String(messageId));
}

export function archiveMessageDelete(messageId) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE discord_message_archive SET
      is_deleted = 1,
      deleted_at = ?,
      updated_at = ?
    WHERE message_id = ?
  `).run(now, now, String(messageId));
}

export function getArchivedMessage(messageId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare('SELECT * FROM discord_message_archive WHERE message_id = ?').get(String(messageId));
}

export function searchMessageArchive(guildId, { authorId, textSnippet, channelId, limit = 10 } = {}) {
  initDiscordDb();
  const db = getDb();
  let query = 'SELECT * FROM discord_message_archive WHERE guild_id = ?';
  const params = [String(guildId)];

  if (authorId) {
    query += ' AND author_id = ?';
    params.push(String(authorId));
  }
  if (channelId) {
    query += ' AND channel_id = ?';
    params.push(String(channelId));
  }
  if (textSnippet) {
    query += ' AND content LIKE ?';
    params.push(`%${textSnippet}%`);
  }

  query += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params);
}

// ---------------------------------------------------------------------------
// Formal Moderation Records & Actions
// ---------------------------------------------------------------------------

export function createModerationRecord(guildId, {
  userId,
  userTag = '',
  moderatorId,
  moderatorTag = '',
  action,
  reason,
  evidenceId = '',
  durationMinutes = 0,
}) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();

  const info = db.prepare(`
    INSERT INTO discord_moderation_records (
      guild_id, user_id, user_tag, moderator_id, moderator_tag, action,
      reason, evidence_id, duration_minutes, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(guildId),
    String(userId),
    userTag,
    String(moderatorId),
    moderatorTag,
    action,
    reason,
    evidenceId,
    durationMinutes,
    now
  );

  return {
    id: Number(info.lastInsertRowid),
    guild_id: guildId,
    user_id: userId,
    action,
    reason,
    timestamp: now,
  };
}

export function getModerationRecordsForUser(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM discord_moderation_records
    WHERE guild_id = ? AND user_id = ?
    ORDER BY id DESC
  `).all(String(guildId), String(userId));
}

// ---------------------------------------------------------------------------
// Personal DM Notification Subscriptions
// ---------------------------------------------------------------------------

export function getUserNotificationPrefs(guildId, userId) {
  initDiscordDb();
  const db = getDb();
  let row = db.prepare('SELECT * FROM discord_notification_preferences WHERE guild_id = ? AND user_id = ?')
    .get(String(guildId), String(userId));

  if (!row) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO discord_notification_preferences (
        guild_id, user_id, notify_voice_join, notify_voice_leave,
        notify_streaming, notify_streaming_end, notify_game_activity, updated_at
      )
      VALUES (?, ?, 1, 0, 1, 0, 1, ?)
    `).run(String(guildId), String(userId), now);

    row = db.prepare('SELECT * FROM discord_notification_preferences WHERE guild_id = ? AND user_id = ?')
      .get(String(guildId), String(userId));
  }

  return row;
}

export function updateUserNotificationPrefs(guildId, userId, updates = {}) {
  initDiscordDb();
  const db = getDb();
  const current = getUserNotificationPrefs(guildId, userId);
  const now = new Date().toISOString();

  const merged = {
    notify_voice_join: updates.notify_voice_join !== undefined ? (updates.notify_voice_join ? 1 : 0) : current.notify_voice_join,
    notify_voice_leave: updates.notify_voice_leave !== undefined ? (updates.notify_voice_leave ? 1 : 0) : current.notify_voice_leave,
    notify_streaming: updates.notify_streaming !== undefined ? (updates.notify_streaming ? 1 : 0) : current.notify_streaming,
    notify_streaming_end: updates.notify_streaming_end !== undefined ? (updates.notify_streaming_end ? 1 : 0) : current.notify_streaming_end,
    notify_game_activity: updates.notify_game_activity !== undefined ? (updates.notify_game_activity ? 1 : 0) : current.notify_game_activity,
  };

  db.prepare(`
    UPDATE discord_notification_preferences SET
      notify_voice_join = ?,
      notify_voice_leave = ?,
      notify_streaming = ?,
      notify_streaming_end = ?,
      notify_game_activity = ?,
      updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    merged.notify_voice_join,
    merged.notify_voice_leave,
    merged.notify_streaming,
    merged.notify_streaming_end,
    merged.notify_game_activity,
    now,
    String(guildId),
    String(userId)
  );

  return getUserNotificationPrefs(guildId, userId);
}

export function getSubscribersForEvent(guildId, eventType) {
  initDiscordDb();
  const db = getDb();
  let column = '';
  switch (eventType) {
    case 'voice_join': column = 'notify_voice_join'; break;
    case 'voice_leave': column = 'notify_voice_leave'; break;
    case 'streaming': column = 'notify_streaming'; break;
    case 'streaming_end': column = 'notify_streaming_end'; break;
    case 'game_activity': column = 'notify_game_activity'; break;
    default: return [];
  }

  return db.prepare(`
    SELECT user_id FROM discord_notification_preferences
    WHERE guild_id = ? AND ${column} = 1
  `).all(String(guildId)).map(r => r.user_id);
}

// ---------------------------------------------------------------------------
// Hall of Shame (Confirmed Scammers & Severe Violators)
// ---------------------------------------------------------------------------

export function addHallOfShameEntry(guildId, {
  targetUserId,
  targetUserTag = '',
  moderatorId,
  moderatorTag = '',
  reason,
  evidenceReference = '',
}) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();

  const info = db.prepare(`
    INSERT INTO discord_hall_of_shame (
      guild_id, target_user_id, target_user_tag, moderator_id, moderator_tag,
      reason, evidence_reference, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(guildId),
    String(targetUserId),
    targetUserTag,
    String(moderatorId),
    moderatorTag,
    reason,
    evidenceReference,
    now
  );

  return Number(info.lastInsertRowid);
}

export function listHallOfShameEntries(guildId) {
  initDiscordDb();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM discord_hall_of_shame
    WHERE guild_id = ?
    ORDER BY id DESC
  `).all(String(guildId));
}

// ---------------------------------------------------------------------------
// 🍕 Blueprint: Wallet & Ledger Functions
// ---------------------------------------------------------------------------

export function getOrCreateWallet(memberId) {
  initDiscordDb();
  const db = getDb();
  let wallet = db.prepare('SELECT * FROM discord_wallets WHERE member_id = ?').get(String(memberId));
  if (!wallet) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO discord_wallets (member_id, balance_pizza, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      String(memberId),
      0,
      now,
      now
    );
    wallet = db.prepare('SELECT * FROM discord_wallets WHERE member_id = ?').get(String(memberId));
  }
  return wallet;
}

export function creditWallet(memberId, amountPizza, reason, actorId, ticketId = null) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const qty = Math.max(0, parseInt(amountPizza, 10));

  const wallet = getOrCreateWallet(memberId);
  const newBalance = wallet.balance_pizza + qty;

  db.prepare('UPDATE discord_wallets SET balance_pizza = ?, updated_at = ? WHERE member_id = ?').run(
    newBalance,
    now,
    String(memberId)
  );
  const result = db.prepare(`
    INSERT INTO discord_wallet_transactions (member_id, amount_pizza, direction, reason, actor_id, status, related_ticket_id, timestamp)
    VALUES (?, ?, 'credit', ?, ?, 'completed', ?, ?)
  `).run(String(memberId), qty, reason, String(actorId), ticketId, now);

  recordAuditEvent(actorId, 'WALLET_CREDIT', memberId, `Balance: ${wallet.balance_pizza}`, `Balance: ${newBalance}`, reason);
  return { newBalance, transactionId: Number(result.lastInsertRowid) };
}

export function debitWallet(memberId, amountPizza, reason, actorId, ticketId = null) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const qty = Math.max(0, parseInt(amountPizza, 10));

  const wallet = getOrCreateWallet(memberId);
  if (wallet.balance_pizza < qty) {
    throw new Error(`Insufficient Pizza balance. Available: ${wallet.balance_pizza} Pizza, Required: ${qty} Pizza.`);
  }

  const newBalance = wallet.balance_pizza - qty;

  db.prepare('UPDATE discord_wallets SET balance_pizza = ?, updated_at = ? WHERE member_id = ?').run(
    newBalance,
    now,
    String(memberId)
  );
  const result = db.prepare(`
    INSERT INTO discord_wallet_transactions (member_id, amount_pizza, direction, reason, actor_id, status, related_ticket_id, timestamp)
    VALUES (?, ?, 'debit', ?, ?, 'completed', ?, ?)
  `).run(String(memberId), qty, reason, String(actorId), ticketId, now);

  recordAuditEvent(actorId, 'WALLET_DEBIT', memberId, `Balance: ${wallet.balance_pizza}`, `Balance: ${newBalance}`, reason);
  return { newBalance, transactionId: Number(result.lastInsertRowid) };
}

export function getWalletTransactions(memberId, limit = 10) {
  initDiscordDb();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM discord_wallet_transactions
    WHERE member_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(memberId), limit);
}

// ---------------------------------------------------------------------------
// 💳 Blueprint: Payments & UTR Verification
// ---------------------------------------------------------------------------

export function createPaymentRecord({ payerId, payerTag, amountInr, providerRef, utrNumber = null, receiptUrl = null }) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO discord_payments (provider_ref, utr_number, amount_inr, payer_id, payer_tag, status, receipt_url, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(providerRef, utrNumber, amountInr, String(payerId), payerTag, receiptUrl, now);
  return Number(result.lastInsertRowid);
}

export function verifyPayment(paymentId, verifiedBy) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  const payment = db.prepare('SELECT * FROM discord_payments WHERE id = ?').get(paymentId);
  if (!payment) throw new Error('Payment record not found.');
  if (payment.status === 'verified') return payment;

  db.prepare('UPDATE discord_payments SET status = \'verified\', verified_at = ?, verified_by = ? WHERE id = ?').run(
    now,
    String(verifiedBy),
    paymentId
  );
  // 1 Pizza = ₹1 conversion
  const pizzaCredited = Math.floor(payment.amount_inr);
  creditWallet(payment.payer_id, pizzaCredited, `Verified UPI/GPay Payment #${paymentId} (UTR: ${payment.utr_number || 'N/A'})`, verifiedBy);

  return db.prepare('SELECT * FROM discord_payments WHERE id = ?').get(paymentId);
}

// ---------------------------------------------------------------------------
// 🛡️ Blueprint: Entitlement Engine Functions
// ---------------------------------------------------------------------------

export function grantEntitlement(memberId, section, scope = '30d', grantedBy = 'system', durationDays = 30) {
  initDiscordDb();
  const db = getDb();
  const now = new Date();
  const startsAt = now.toISOString();

  let expiresAt = null;
  if (scope !== 'permanent') {
    const expDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    expiresAt = expDate.toISOString();
  }

  const existing = db.prepare('SELECT * FROM discord_entitlements WHERE member_id = ? AND section = ? AND status = \'active\'').get(
    String(memberId),
    section
  );

  if (existing) {
    db.prepare('UPDATE discord_entitlements SET scope = ?, expires_at = ?, granted_by = ?, starts_at = ? WHERE id = ?').run(
      scope,
      expiresAt,
      String(grantedBy),
      startsAt,
      existing.id
    );
    recordAuditEvent(grantedBy, 'ENTITLEMENT_RENEW', memberId, existing.scope, scope, `Section: ${section}`);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO discord_entitlements (member_id, section, scope, starts_at, expires_at, status, granted_by)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(String(memberId), section, scope, startsAt, expiresAt, String(grantedBy));

  recordAuditEvent(grantedBy, 'ENTITLEMENT_GRANT', memberId, 'none', scope, `Section: ${section}`);
  return Number(result.lastInsertRowid);
}

export function checkMemberEntitlement(memberId, section) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();

  const entitlement = db.prepare(`
    SELECT * FROM discord_entitlements
    WHERE member_id = ? AND (section = ? OR section = 'all') AND status = 'active'
    AND (expires_at IS NULL OR expires_at > ?)
  `).get(String(memberId), section, now);

  return Boolean(entitlement);
}

export function listMemberEntitlements(memberId) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM discord_entitlements
    WHERE member_id = ? AND status = 'active'
    AND (expires_at IS NULL OR expires_at > ?)
  `).all(String(memberId), now);
}

// ---------------------------------------------------------------------------
// 🤖 Blueprint: AI Token Accounts & Reasoning Mode
// ---------------------------------------------------------------------------

export function getOrCreateTokenAccount(memberId) {
  initDiscordDb();
  const db = getDb();
  let acc = db.prepare('SELECT * FROM discord_token_accounts WHERE member_id = ?').get(String(memberId));
  if (!acc) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO discord_token_accounts (member_id, allowance_tokens, used_tokens, reasoning_mode, updated_at) VALUES (?, 0, 0, \'high\', ?)').run(
      String(memberId),
      now
    );
    acc = db.prepare('SELECT * FROM discord_token_accounts WHERE member_id = ?').get(String(memberId));
  }
  return acc;
}

export function addTokensToAccount(memberId, tokenQty, actorId, reason = 'Top-up') {
  initDiscordDb();
  const db = getDb();
  const acc = getOrCreateTokenAccount(memberId);
  const now = new Date().toISOString();
  const newAllowance = acc.allowance_tokens + tokenQty;

  db.prepare('UPDATE discord_token_accounts SET allowance_tokens = ?, updated_at = ? WHERE member_id = ?').run(
    newAllowance,
    now,
    String(memberId)
  );

  recordAuditEvent(actorId, 'TOKEN_ADD', memberId, `Allowance: ${acc.allowance_tokens}`, `Allowance: ${newAllowance}`, reason);
  return newAllowance;
}

export function setMemberReasoningMode(memberId, mode) {
  initDiscordDb();
  const db = getDb();
  const valid = ['none', 'low', 'high', 'max'].includes(mode) ? mode : 'high';
  getOrCreateTokenAccount(memberId);
  const now = new Date().toISOString();
  db.prepare('UPDATE discord_token_accounts SET reasoning_mode = ?, updated_at = ? WHERE member_id = ?').run(
    valid,
    now,
    String(memberId)
  );
  return valid;
}

export function getMemberReasoningMode(memberId) {
  const acc = getOrCreateTokenAccount(memberId);
  return acc.reasoning_mode || 'high';
}

// ---------------------------------------------------------------------------
// 📜 Blueprint: Immutable Audit Trail
// ---------------------------------------------------------------------------

export function recordAuditEvent(actorId, action, targetId = null, beforeState = null, afterState = null, reason = null) {
  initDiscordDb();
  const db = getDb();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO discord_audit_events (actor_id, action, target_id, before_state, after_state, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(String(actorId), action, targetId ? String(targetId) : null, beforeState, afterState, reason, now);
  } catch (err) {
    console.warn('[Audit Log Warning]:', err.message);
  }
}


import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

let db = null;

export function initDatabase() {
  if (db) return db;
  const dbPath = path.resolve(config.databasePath);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseSync(dbPath);

  // Enable WAL mode for high concurrency and resilience
  db.exec('PRAGMA busy_timeout = 10000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      model_used TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_chat ON conversations(chat_id, created_at);

    CREATE TABLE IF NOT EXISTS known_groups (
      group_id TEXT PRIMARY KEY,
      group_title TEXT NOT NULL,
      group_type TEXT NOT NULL,
      bot_enabled INTEGER DEFAULT 0,
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_updates (
      update_id INTEGER PRIMARY KEY,
      processed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS raw_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_message_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_username TEXT,
      message_type TEXT NOT NULL,
      reply_to_message_id INTEGER,
      raw_content TEXT NOT NULL,
      caption TEXT,
      attachment_id TEXT,
      attachment_drive_id TEXT,
      created_at TEXT NOT NULL,
      is_archived INTEGER DEFAULT 0,
      batch_id INTEGER DEFAULT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_messages_chat_msg ON raw_messages(chat_id, platform_message_id);
    CREATE INDEX IF NOT EXISTS idx_raw_messages_unarchived ON raw_messages(chat_id, is_archived, id);

    CREATE TABLE IF NOT EXISTS archive_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      start_message_id INTEGER NOT NULL,
      end_message_id INTEGER NOT NULL,
      message_count INTEGER NOT NULL,
      transcript_filename TEXT NOT NULL,
      drive_file_id TEXT,
      summary_filename TEXT,
      summary_drive_id TEXT,
      summary_content TEXT,
      checksum TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      verified_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_archive_batches_chat ON archive_batches(chat_id, id);

    CREATE TABLE IF NOT EXISTS durable_memory_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      category TEXT NOT NULL,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      source_message_id INTEGER,
      source_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_durable_memory_chat ON durable_memory_index(chat_id, category);

    CREATE TABLE IF NOT EXISTS attachments_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      platform_file_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      caption TEXT,
      ai_description TEXT,
      ocr_text TEXT,
      drive_file_id TEXT,
      drive_web_link TEXT,
      local_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_chat ON attachments_index(chat_id, created_at);

    CREATE TABLE IF NOT EXISTS group_participants (
      chat_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      gender_label TEXT DEFAULT 'unknown',
      role TEXT DEFAULT 'member',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      custom_name TEXT,
      relationship_role TEXT DEFAULT 'friend',
      custom_title TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_memories (
      key TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      value TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (chat_id, key)
    );

    CREATE TABLE IF NOT EXISTS group_blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      word TEXT NOT NULL,
      added_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(group_id, word)
    );

    CREATE TABLE IF NOT EXISTS group_settings (
      group_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (group_id, setting_key)
    );
  `);

  // Initialize default configuration rows if missing
  const defaults = {
    master_switch: 'true',
    private_chat_enabled: 'true',
    group_participation_enabled: 'false', // Group participation disabled by default
    active_model_id: 'gemini-3.5-flash-lite',
    group_moderation_enabled: 'false',
    future_media_enabled: 'false',
    latency_threshold_ms: '1000',
    reasoning_effort: 'none'
  };

  const getStmt = db.prepare('SELECT value FROM app_config WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)');
  const now = new Date().toISOString();

  for (const [key, val] of Object.entries(defaults)) {
    const row = getStmt.get(key);
    if (!row) {
      insertStmt.run(key, val, now);
    }
  }

  // Ensure owner profile is initialized
  if (config.telegramOwnerId) {
    const ownerProfile = db.prepare('SELECT user_id FROM user_profiles WHERE user_id = ?').get(String(config.telegramOwnerId));
    if (!ownerProfile) {
      db.prepare(`
        INSERT INTO user_profiles (user_id, custom_name, relationship_role, custom_title, updated_at)
        VALUES (?, 'Sandy', 'creator', 'Creator & Developer', ?)
      `).run(String(config.telegramOwnerId), now);
    }
  }

  return db;
}

export function getDb() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// Config Helpers
export function getConfig(key, defaultValue = null) {
  const row = getDb().prepare('SELECT value FROM app_config WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

export function setConfig(key, value) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), now);
}

export function getAllConfig() {
  const rows = getDb().prepare('SELECT key, value, updated_at FROM app_config').all();
  const result = {};
  for (const r of rows) {
    result[r.key] = r.value;
  }
  return result;
}

// Conversation Helpers
export function addConversationMessage(chatId, role, content, tokensUsed = 0, modelUsed = '') {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO conversations (chat_id, role, content, tokens_used, model_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(String(chatId), role, content, tokensUsed, modelUsed, now);
}

export function getRecentConversation(chatId, limit = 10) {
  const rows = getDb().prepare(`
    SELECT role, content, model_used, created_at
    FROM conversations
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), limit);

  // Return in chronological order
  return rows.reverse();
}

export function clearConversation(chatId) {
  getDb().prepare('DELETE FROM conversations WHERE chat_id = ?').run(String(chatId));
}

// Group Registry Helpers
export function registerOrUpdateGroup(groupId, groupTitle, groupType, botEnabled = null) {
  const now = new Date().toISOString();
  const existing = getDb().prepare('SELECT bot_enabled FROM known_groups WHERE group_id = ?').get(String(groupId));

  if (!existing) {
    const initialEnabled = botEnabled !== null ? (botEnabled ? 1 : 0) : 1;
    getDb().prepare(`
      INSERT INTO known_groups (group_id, group_title, group_type, bot_enabled, added_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(String(groupId), groupTitle || 'Unnamed Group', groupType || 'group', initialEnabled, now, now);
  } else {
    const enabled = botEnabled !== null ? (botEnabled ? 1 : 0) : existing.bot_enabled;
    getDb().prepare(`
      UPDATE known_groups
      SET group_title = ?, group_type = ?, bot_enabled = ?, updated_at = ?
      WHERE group_id = ?
    `).run(groupTitle || 'Unnamed Group', groupType || 'group', enabled, now, String(groupId));
  }
}

export function getKnownGroups() {
  return getDb().prepare('SELECT group_id, group_title, group_type, bot_enabled, added_at, updated_at FROM known_groups ORDER BY updated_at DESC').all();
}

export function setGroupBotEnabled(groupId, enabled) {
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE known_groups
    SET bot_enabled = ?, updated_at = ?
    WHERE group_id = ?
  `).run(enabled ? 1 : 0, now, String(groupId));
}

export function isGroupBotEnabled(groupId) {
  const row = getDb().prepare('SELECT bot_enabled FROM known_groups WHERE group_id = ?').get(String(groupId));
  return row ? Boolean(row.bot_enabled) : true;
}

// Token Usage Tracking
export function recordTokenUsage(chatId, modelId, promptTokens, completionTokens, latencyMs) {
  const now = new Date().toISOString();
  const total = (promptTokens || 0) + (completionTokens || 0);
  getDb().prepare(`
    INSERT INTO token_usage (chat_id, model_id, prompt_tokens, completion_tokens, total_tokens, latency_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(String(chatId), modelId, promptTokens || 0, completionTokens || 0, total, latencyMs || 0, now);
}

export function getTokenUsageStats() {
  const totals = getDb().prepare(`
    SELECT
      COUNT(*) AS total_requests,
      COALESCE(SUM(prompt_tokens), 0) AS total_prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS total_completion_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
    FROM token_usage
  `).get();

  const byModel = getDb().prepare(`
    SELECT
      model_id,
      COUNT(*) AS requests,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
    FROM token_usage
    GROUP BY model_id
  `).all();

  return {
    totals,
    byModel
  };
}

// Audit Logging
export function logAudit(actorId, action, details = '') {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO audit_logs (actor_id, action, details, created_at)
    VALUES (?, ?, ?, ?)
  `).run(String(actorId), action, details, now);
}

export function getRecentAuditLogs(limit = 20) {
  return getDb().prepare('SELECT id, actor_id, action, details, created_at FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
}

// Update Deduplication
export function isUpdateProcessed(updateId) {
  const row = getDb().prepare('SELECT update_id FROM processed_updates WHERE update_id = ?').get(Number(updateId));
  return Boolean(row);
}

export function markUpdateProcessed(updateId) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT OR IGNORE INTO processed_updates (update_id, processed_at)
    VALUES (?, ?)
  `).run(Number(updateId), now);

  // Keep table prune bounded (clean updates older than 10,000 records)
  getDb().prepare(`
    DELETE FROM processed_updates
    WHERE update_id NOT IN (
      SELECT update_id FROM processed_updates ORDER BY update_id DESC LIMIT 10000
    )
  `).run();
}

// Raw Message Archival Store
export function insertRawMessage({
  platformMessageId,
  chatId,
  senderId,
  senderName,
  senderUsername = null,
  messageType = 'text',
  replyToMessageId = null,
  rawContent,
  caption = null,
  attachmentId = null,
  attachmentDriveId = null,
  createdAt = new Date().toISOString(),
}) {
  try {
    const result = getDb().prepare(`
      INSERT OR IGNORE INTO raw_messages (
        platform_message_id, chat_id, sender_id, sender_name, sender_username,
        message_type, reply_to_message_id, raw_content, caption,
        attachment_id, attachment_drive_id, created_at, is_archived
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      Number(platformMessageId),
      String(chatId),
      String(senderId),
      senderName || 'Anonymous',
      senderUsername,
      messageType,
      replyToMessageId ? Number(replyToMessageId) : null,
      rawContent || '',
      caption,
      attachmentId,
      attachmentDriveId,
      createdAt
    );
    return result;
  } catch (err) {
    console.warn('[Database] Failed to insert raw message:', err.message);
    return null;
  }
}

export function countUnarchivedMessages(chatId) {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS cnt
    FROM raw_messages
    WHERE chat_id = ? AND is_archived = 0
  `).get(String(chatId));
  return row ? row.cnt : 0;
}

export function getUnarchivedMessages(chatId, limit = 50) {
  return getDb().prepare(`
    SELECT id, platform_message_id, chat_id, sender_id, sender_name, sender_username,
           message_type, reply_to_message_id, raw_content, caption,
           attachment_id, attachment_drive_id, created_at
    FROM raw_messages
    WHERE chat_id = ? AND is_archived = 0
    ORDER BY platform_message_id ASC, id ASC
    LIMIT ?
  `).all(String(chatId), limit);
}

export function markMessagesArchived(messageIds, batchId) {
  if (!messageIds || messageIds.length === 0) return;
  const placeholders = messageIds.map(() => '?').join(',');
  getDb().prepare(`
    UPDATE raw_messages
    SET is_archived = 1, batch_id = ?
    WHERE id IN (${placeholders})
  `).run(batchId, ...messageIds);
}

// Archive Batches
export function createArchiveBatch({
  chatId,
  startMessageId,
  endMessageId,
  messageCount,
  transcriptFilename,
  driveFileId = null,
  summaryFilename = null,
  summaryDriveId = null,
  summaryContent = null,
  checksum = null,
  status = 'pending',
}) {
  const now = new Date().toISOString();
  const res = getDb().prepare(`
    INSERT INTO archive_batches (
      chat_id, start_message_id, end_message_id, message_count,
      transcript_filename, drive_file_id, summary_filename, summary_drive_id,
      summary_content, checksum, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(chatId),
    Number(startMessageId),
    Number(endMessageId),
    Number(messageCount),
    transcriptFilename,
    driveFileId,
    summaryFilename,
    summaryDriveId,
    summaryContent,
    checksum,
    status,
    now
  );
  return res.lastInsertRowid;
}

export function updateArchiveBatchStatus(batchId, status, verifiedAt = null, driveFileId = null, summaryDriveId = null) {
  getDb().prepare(`
    UPDATE archive_batches
    SET status = ?,
        verified_at = COALESCE(?, verified_at),
        drive_file_id = COALESCE(?, drive_file_id),
        summary_drive_id = COALESCE(?, summary_drive_id)
    WHERE id = ?
  `).run(status, verifiedAt, driveFileId, summaryDriveId, batchId);
}

export function getArchiveBatches(chatId, limit = 20) {
  return getDb().prepare(`
    SELECT * FROM archive_batches
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), limit);
}

// Durable Memory & Fact Index
export function addDurableMemory(chatId, category, topic, content, sourceMessageId = null, sourceDate = null) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO durable_memory_index (
      chat_id, category, topic, content, source_message_id, source_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(chatId),
    category,
    topic,
    content,
    sourceMessageId ? Number(sourceMessageId) : null,
    sourceDate || now,
    now
  );
}

export function searchDurableMemory(chatId, query, limit = 10) {
  const pattern = `%${query.trim()}%`;
  return getDb().prepare(`
    SELECT category, topic, content, source_message_id, source_date, created_at
    FROM durable_memory_index
    WHERE chat_id = ? AND (topic LIKE ? OR content LIKE ? OR category LIKE ?)
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), pattern, pattern, pattern, limit);
}

export function getRecentDurableMemory(chatId, limit = 10) {
  return getDb().prepare(`
    SELECT category, topic, content, source_message_id, source_date, created_at
    FROM durable_memory_index
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), limit);
}

export function getAllDurableMemories({ query = '', category = '', chatId = null, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT id, chat_id, category, topic, content, source_message_id, source_date, created_at FROM durable_memory_index WHERE 1=1';
  const params = [];

  if (chatId) {
    sql += ' AND chat_id = ?';
    params.push(String(chatId));
  }
  if (category && category !== 'all') {
    sql += ' AND LOWER(category) = LOWER(?)';
    params.push(category);
  }
  if (query && query.trim()) {
    const pattern = `%${query.trim()}%`;
    sql += ' AND (topic LIKE ? OR content LIKE ? OR category LIKE ?)';
    params.push(pattern, pattern, pattern);
  }

  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = getDb().prepare(sql).all(...params);

  // Total count query
  let countSql = 'SELECT COUNT(*) as total FROM durable_memory_index WHERE 1=1';
  const countParams = [];
  if (chatId) {
    countSql += ' AND chat_id = ?';
    countParams.push(String(chatId));
  }
  if (category && category !== 'all') {
    countSql += ' AND LOWER(category) = LOWER(?)';
    countParams.push(category);
  }
  if (query && query.trim()) {
    const pattern = `%${query.trim()}%`;
    countSql += ' AND (topic LIKE ? OR content LIKE ? OR category LIKE ?)';
    countParams.push(pattern, pattern, pattern);
  }
  const countRow = getDb().prepare(countSql).get(...countParams);

  return {
    memories: rows,
    total: countRow ? countRow.total : 0,
  };
}

export function getAllArchiveBatches(limit = 20) {
  return getDb().prepare(`
    SELECT * FROM archive_batches
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

export function getMemoryStats() {
  const d = getDb();
  const memCount = d.prepare('SELECT COUNT(*) as cnt FROM durable_memory_index').get()?.cnt || 0;
  const batchCount = d.prepare('SELECT COUNT(*) as cnt FROM archive_batches').get()?.cnt || 0;
  const rawCount = d.prepare('SELECT COUNT(*) as cnt FROM raw_messages').get()?.cnt || 0;
  const participantCount = d.prepare('SELECT COUNT(*) as cnt FROM group_participants').get()?.cnt || 0;

  return {
    totalMemories: memCount,
    totalBatches: batchCount,
    totalRawMessages: rawCount,
    totalParticipants: participantCount,
  };
}

export function searchRawMessages(chatId, query, limit = 20) {
  const pattern = `%${query.trim()}%`;
  return getDb().prepare(`
    SELECT platform_message_id, sender_name, raw_content, caption, created_at
    FROM raw_messages
    WHERE chat_id = ? AND (raw_content LIKE ? OR caption LIKE ?)
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), pattern, pattern, limit);
}

export function getLatestChatMessages(chatId, limit = 20) {
  const rows = getDb().prepare(`
    SELECT platform_message_id, sender_id, sender_name, sender_username,
           message_type, reply_to_message_id, raw_content, caption, created_at
    FROM raw_messages
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), limit);

  return rows.reverse();
}

export function getRawMessagesByDateRange(chatId, startDate, endDate, limit = 100) {
  return getDb().prepare(`
    SELECT platform_message_id, sender_name, raw_content, caption, created_at
    FROM raw_messages
    WHERE chat_id = ? AND created_at >= ? AND created_at <= ?
    ORDER BY platform_message_id ASC
    LIMIT ?
  `).all(String(chatId), startDate, endDate, limit);
}

// Attachments & Media Index
export function recordAttachment(chatId, {
  platformFileId,
  senderId,
  senderName,
  filename,
  mimeType = 'image/jpeg',
  caption = null,
  aiDescription = null,
  ocrText = null,
  driveFileId = null,
  driveWebLink = null,
  localPath = null,
}) {
  const now = new Date().toISOString();
  const res = getDb().prepare(`
    INSERT INTO attachments_index (
      chat_id, platform_file_id, sender_id, sender_name, filename,
      mime_type, caption, ai_description, ocr_text, drive_file_id,
      drive_web_link, local_path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(chatId),
    platformFileId,
    String(senderId),
    senderName || 'Anonymous',
    filename,
    mimeType,
    caption,
    aiDescription,
    ocrText,
    driveFileId,
    driveWebLink,
    localPath,
    now
  );
  return res.lastInsertRowid;
}

export function searchAttachments(chatId, query, limit = 10) {
  const pattern = `%${query.trim()}%`;
  return getDb().prepare(`
    SELECT id, platform_file_id, sender_name, filename, caption, ai_description, ocr_text,
           drive_file_id, drive_web_link, local_path, created_at
    FROM attachments_index
    WHERE chat_id = ? AND (
      caption LIKE ? OR ai_description LIKE ? OR ocr_text LIKE ? OR filename LIKE ?
    )
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), pattern, pattern, pattern, pattern, limit);
}

export function getRecentAttachments(chatId, limit = 10) {
  return getDb().prepare(`
    SELECT id, platform_file_id, sender_name, filename, caption, ai_description, ocr_text,
           drive_file_id, drive_web_link, local_path, created_at
    FROM attachments_index
    WHERE chat_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(chatId), limit);
}

// Group Participant Mapping
export function registerGroupParticipant(chatId, userId, displayName, genderLabel = 'unknown', role = 'member') {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO group_participants (chat_id, user_id, display_name, gender_label, role, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      display_name = excluded.display_name,
      gender_label = CASE WHEN excluded.gender_label != 'unknown' THEN excluded.gender_label ELSE group_participants.gender_label END,
      role = excluded.role,
      updated_at = excluded.updated_at
  `).run(String(chatId), String(userId), displayName || 'Member', genderLabel, role, now);
}

export function getGroupParticipant(chatId, userId) {
  return getDb().prepare(`
    SELECT chat_id, user_id, display_name, gender_label, role
    FROM group_participants
    WHERE chat_id = ? AND user_id = ?
  `).get(String(chatId), String(userId));
}

export function getGroupParticipants(chatId) {
  return getDb().prepare(`
    SELECT chat_id, user_id, display_name, gender_label, role
    FROM group_participants
    WHERE chat_id = ?
  `).all(String(chatId));
}

// User Profiles & Custom Identity (Roles & Custom Names)
export function setUserProfile(userId, { customName, relationshipRole, customTitle } = {}) {
  const now = new Date().toISOString();
  const existing = getUserProfile(userId);
  const finalName = customName !== undefined ? customName : (existing?.custom_name || null);
  const finalRole = relationshipRole !== undefined ? relationshipRole.toLowerCase() : (existing?.relationship_role || 'friend');
  const finalTitle = customTitle !== undefined ? customTitle : (existing?.custom_title || null);

  getDb().prepare(`
    INSERT INTO user_profiles (user_id, custom_name, relationship_role, custom_title, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      custom_name = excluded.custom_name,
      relationship_role = excluded.relationship_role,
      custom_title = excluded.custom_title,
      updated_at = excluded.updated_at
  `).run(String(userId), finalName, finalRole, finalTitle, now);

  return getUserProfile(userId);
}

export function getUserProfile(userId) {
  return getDb().prepare(`
    SELECT user_id, custom_name, relationship_role, custom_title, updated_at
    FROM user_profiles
    WHERE user_id = ?
  `).get(String(userId));
}

export function setUserCustomName(userId, customName) {
  return setUserProfile(userId, { customName });
}

export function setUserRelationshipRole(userId, relationshipRole) {
  return setUserProfile(userId, { relationshipRole });
}

export function getActiveUserIdentity(chatId, userId) {
  const profile = getUserProfile(userId);
  const participant = chatId ? getGroupParticipant(chatId, userId) : null;
  const isOwner = Boolean(config.telegramOwnerId && String(userId) === String(config.telegramOwnerId));

  return {
    userId: String(userId),
    customName: profile?.custom_name || (isOwner ? 'Sandy' : (participant?.display_name || null)),
    relationshipRole: profile?.relationship_role || (isOwner ? 'creator' : 'friend'),
    customTitle: profile?.custom_title || (isOwner ? 'Creator & Developer' : null),
    displayName: participant?.display_name || (isOwner ? 'Sandy' : null),
  };
}

// Clean-up and revocation
export function resetAllUserData() {
  const d = getDb();
  d.exec('DELETE FROM conversations;');
  d.exec('DELETE FROM token_usage;');
  d.exec('DELETE FROM audit_logs;');
  d.exec('DELETE FROM processed_updates;');
  d.exec('DELETE FROM raw_messages;');
  d.exec('DELETE FROM archive_batches;');
  d.exec('DELETE FROM durable_memory_index;');
  d.exec('DELETE FROM attachments_index;');
  d.exec('DELETE FROM group_participants;');
  d.exec('DELETE FROM user_profiles;');
  d.exec('DELETE FROM user_notes;');
  d.exec('DELETE FROM custom_memories;');
  d.exec('DELETE FROM group_blacklist;');
  d.exec('DELETE FROM group_settings;');
}

// User Notes API
export function addNote(userId, chatId, noteText) {
  const now = new Date().toISOString();
  return getDb().prepare('INSERT INTO user_notes (user_id, chat_id, note_text, created_at) VALUES (?, ?, ?, ?)')
    .run(String(userId), String(chatId), noteText, now);
}

export function getUserNotes(userId) {
  return getDb().prepare('SELECT * FROM user_notes WHERE user_id = ? ORDER BY id DESC').all(String(userId));
}

export function deleteNote(id, userId) {
  return getDb().prepare('DELETE FROM user_notes WHERE id = ? AND user_id = ?').run(id, String(userId));
}

export function clearUserNotes(userId) {
  return getDb().prepare('DELETE FROM user_notes WHERE user_id = ?').run(String(userId));
}

// Custom Memories API
export function setCustomMemory(chatId, key, value, createdBy = 'user') {
  const now = new Date().toISOString();
  return getDb().prepare(`
    INSERT INTO custom_memories (key, chat_id, value, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(chat_id, key) DO UPDATE SET value = excluded.value, created_at = excluded.created_at
  `).run(key.toLowerCase().trim(), String(chatId), value.trim(), String(createdBy), now);
}

export function getCustomMemory(chatId, key) {
  const row = getDb().prepare('SELECT * FROM custom_memories WHERE chat_id = ? AND key = ?')
    .get(String(chatId), key.toLowerCase().trim());
  return row || null;
}

export function deleteCustomMemory(chatId, key) {
  return getDb().prepare('DELETE FROM custom_memories WHERE chat_id = ? AND key = ?')
    .run(String(chatId), key.toLowerCase().trim());
}

export function listCustomMemories(chatId) {
  return getDb().prepare('SELECT key, value, created_at FROM custom_memories WHERE chat_id = ? ORDER BY key ASC')
    .all(String(chatId));
}

// Group Blacklist API
export function addBlacklistWord(groupId, word, addedBy = 'admin') {
  const now = new Date().toISOString();
  return getDb().prepare(`
    INSERT INTO group_blacklist (group_id, word, added_by, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(group_id, word) DO NOTHING
  `).run(String(groupId), word.toLowerCase().trim(), String(addedBy), now);
}

export function removeBlacklistWord(groupId, word) {
  return getDb().prepare('DELETE FROM group_blacklist WHERE group_id = ? AND word = ?')
    .run(String(groupId), word.toLowerCase().trim());
}

export function getBlacklistWords(groupId) {
  return getDb().prepare('SELECT word FROM group_blacklist WHERE group_id = ?').all(String(groupId)).map(r => r.word);
}

// Group Settings API
export function setGroupSetting(groupId, key, value) {
  const now = new Date().toISOString();
  return getDb().prepare(`
    INSERT INTO group_settings (group_id, setting_key, setting_value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(group_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
  `).run(String(groupId), key, String(value), now);
}

export function getGroupSetting(groupId, key, fallback = null) {
  const row = getDb().prepare('SELECT setting_value FROM group_settings WHERE group_id = ? AND setting_key = ?')
    .get(String(groupId), key);
  return row ? row.setting_value : fallback;
}

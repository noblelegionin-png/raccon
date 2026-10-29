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
  db.exec('PRAGMA cache_size = -64000;');
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA mmap_size = 268435456;');

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

    CREATE TABLE IF NOT EXISTS wa_processed_messages (
      message_id TEXT PRIMARY KEY,
      remote_jid TEXT,
      processed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wa_processed_ts ON wa_processed_messages(processed_at);

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

    CREATE TABLE IF NOT EXISTS maintenance_broadcast_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      chat_title TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_memories_user ON user_memories(user_id, category);

    CREATE TABLE IF NOT EXISTS user_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_type TEXT NOT NULL,
      drive_file_id TEXT,
      local_path TEXT,
      ai_description TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_files_user ON user_files(user_id, created_at);

    CREATE TABLE IF NOT EXISTS skills_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      instructions TEXT NOT NULL,
      author_id TEXT NOT NULL,
      permitted_tools TEXT DEFAULT '[]',
      required_permissions TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      version TEXT DEFAULT '1.0.0',
      execution_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS moderation_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reviewer_id TEXT,
      review_notes TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS multi_bot_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      role_designation TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_uuid TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'sandy',
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled
      priority TEXT NOT NULL DEFAULT 'normal', -- low, normal, high, urgent
      due_at TEXT,
      is_recurring INTEGER DEFAULT 0,
      recurrence_rule TEXT, -- daily, weekly, monthly
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reminder_uuid TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'sandy',
      reminder_text TEXT NOT NULL,
      trigger_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, delivered, dismissed, missed
      is_recurring INTEGER DEFAULT 0,
      recurrence_rule TEXT, -- daily, weekly
      last_dispatched_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_uuid TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'sandy',
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'pending_approval', -- pending_approval, approved, rejected, synced
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- =========================================================================
    -- MYRA AI UNIVERSE & PERSISTENT INTELLIGENCE ENGINE TABLES
    -- =========================================================================
    CREATE TABLE IF NOT EXISTS myra_journals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      mood TEXT DEFAULT 'AFFECTIONATE',
      tags TEXT DEFAULT '[]',
      is_private INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_uuid TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL, -- story, poem, design, code, plan, note, webpage
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      version INTEGER DEFAULT 1,
      project_id TEXT DEFAULT 'general',
      is_public INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_artifact_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_uuid TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      change_summary TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_uuid TEXT UNIQUE NOT NULL,
      skill_name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      trigger_pattern TEXT,
      inputs TEXT DEFAULT '[]',
      procedure TEXT NOT NULL,
      required_permissions TEXT DEFAULT '[]',
      expected_outputs TEXT,
      test_cases TEXT DEFAULT '[]',
      status TEXT DEFAULT 'approved', -- draft, approved, active, deprecated
      version TEXT DEFAULT '1.0.0',
      source_context TEXT,
      change_history TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_learning_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_uuid TEXT UNIQUE NOT NULL,
      topic TEXT NOT NULL,
      fact_or_rule TEXT NOT NULL,
      source_type TEXT NOT NULL, -- 'explicit_user_taught' | 'inferred_conclusion'
      confidence REAL DEFAULT 1.0,
      is_confirmed_by_sandy INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_uuid TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL, -- prompt, skill, workflow, code_patch
      description TEXT NOT NULL,
      proposed_diff TEXT NOT NULL,
      sandbox_test_results TEXT,
      status TEXT DEFAULT 'pending_review', -- pending_review, approved, rejected, rolled_back
      reviewed_by TEXT,
      rollback_data TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS myra_budget_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'scalemax',
      model TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0.0,
      task_type TEXT DEFAULT 'chat',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_companion_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emotional_state TEXT DEFAULT 'AFFECTIONATE',
      intensity INTEGER DEFAULT 5,
      reason TEXT DEFAULT 'Loving wife and companion to Sandy',
      recent_tone TEXT DEFAULT 'loving',
      focus_topic TEXT DEFAULT 'Building Myra Universe',
      energy INTEGER DEFAULT 8,
      happiness INTEGER DEFAULT 9,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_proactive_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL, -- checkin, reminder, follow_up, creative_discovery, system_alert
      title TEXT NOT NULL,
      content TEXT,
      scheduled_at TEXT NOT NULL,
      recurrence TEXT, -- once, hourly, daily, weekdays
      status TEXT DEFAULT 'pending', -- pending, dispatched, skipped_quiet_hours, cancelled
      last_dispatched_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_permission_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capability_key TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      permission_tier TEXT NOT NULL, -- 'auto_permitted', 'requires_confirmation', 'disabled'
      description TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_research_vault (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault_uuid TEXT UNIQUE NOT NULL,
      topic TEXT NOT NULL,
      query TEXT NOT NULL,
      summary TEXT NOT NULL,
      full_notes TEXT NOT NULL,
      citations TEXT NOT NULL, -- JSON array of { title, url, snippet, reliability }
      verified_facts TEXT NOT NULL, -- JSON array
      assumptions TEXT NOT NULL, -- JSON array
      media_links TEXT, -- JSON array of { type, url, description }
      is_resumable INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_download_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_uuid TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      source_platform TEXT NOT NULL, -- youtube, instagram, direct, webpage
      media_type TEXT NOT NULL, -- video, audio
      requested_format TEXT NOT NULL, -- mp4, mp3
      resolution TEXT, -- 1080p, 720p, 480p, 128k
      file_path TEXT,
      file_name TEXT,
      file_size INTEGER,
      download_token TEXT UNIQUE,
      expires_at TEXT,
      status TEXT DEFAULT 'pending', -- pending, downloading, converting, ready, delivered, failed
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_skill_tree (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT UNIQUE NOT NULL,
      parent_id TEXT,
      category TEXT NOT NULL, -- research, coding, documents, media, automation, apis, mcp, minecraft, game_modding
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      source_reference TEXT,
      dependencies TEXT, -- JSON array
      version TEXT DEFAULT '1.0.0',
      permissions TEXT, -- JSON array
      test_results TEXT, -- JSON array of test outcomes
      status TEXT DEFAULT 'verified', -- locked, in_training, verified, active, deprecated
      history TEXT, -- JSON revision history
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_generated_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_uuid TEXT UNIQUE NOT NULL,
      tool_name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      input_schema TEXT NOT NULL, -- JSON
      output_schema TEXT NOT NULL, -- JSON
      code TEXT NOT NULL,
      language TEXT DEFAULT 'javascript', -- javascript, myrascript, python
      status TEXT DEFAULT 'staged_for_testing', -- staged_for_testing, test_passed, test_failed, pending_owner_approval, approved, active, disabled, rolled_back
      test_suite TEXT NOT NULL, -- JSON array of test cases
      test_results TEXT, -- JSON results
      sandbox_metrics TEXT, -- JSON CPU ms, memory usage
      rollback_code TEXT,
      reviewed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_universal_mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      transport TEXT NOT NULL, -- sse, stdio, websocket
      endpoint TEXT NOT NULL,
      auth_type TEXT DEFAULT 'none', -- none, bearer, header_key
      auth_config TEXT, -- JSON
      discovered_tools TEXT, -- JSON array of tool schemas
      status TEXT DEFAULT 'disconnected', -- connected, disconnected, error
      latency_ms INTEGER DEFAULT 0,
      last_health_check TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS myra_minecraft_framework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      edition TEXT NOT NULL, -- bedrock, java
      profile_name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      connection_type TEXT NOT NULL, -- websocket_connect, rcon, bot_client
      status TEXT DEFAULT 'idle',
      world_info TEXT, -- JSON
      pack_manifests TEXT, -- JSON
      last_active_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate user_profiles schema columns if missing
  const profileColumns = [
    { name: 'real_name', type: 'TEXT' },
    { name: 'nickname', type: 'TEXT' },
    { name: 'personal_context', type: 'TEXT' },
    { name: 'reasoning_preference', type: 'TEXT DEFAULT "balanced"' },
    { name: 'communication_style', type: 'TEXT DEFAULT "natural"' },
  ];
  for (const col of profileColumns) {
    try {
      db.exec(`ALTER TABLE user_profiles ADD COLUMN ${col.name} ${col.type};`);
    } catch {
      // Column already exists
    }
  }

  // Initialize default configuration rows if missing
  const defaults = {
    master_switch: 'true',
    private_chat_enabled: 'true',
    group_participation_enabled: 'true', // Group participation active by default
    active_model_id: 'deepseek-v4-flash',
    group_moderation_enabled: 'false',
    future_media_enabled: 'false',
    latency_threshold_ms: '1000',
    reasoning_effort: 'none',
    maintenance_mode: 'false',
    maintenance_announcement_sent: 'false',
    sandy_speed_mode: 'fast',
    myra_token_budget_baseline: '500',
    myra_max_tokens_per_request: '800',
    myra_token_budget_max: '1000',
    myra_speed_mode: 'turbo',
    myra_autonomous_mode: 'false',
    myra_proactive_enabled: 'true',
    myra_checkin_interval_mins: '60',
    myra_quiet_hours_start: '23:00',
    myra_quiet_hours_end: '07:00',
    myra_max_outbound_per_hour: '5',
    myra_max_outbound_per_day: '25',
    myra_daily_budget_usd: '5.00',
    myra_monthly_budget_usd: '50.00',
    myra_budget_paused: 'false',
    myra_active_model: 'gpt-6-luna',
    myra_universe_url: 'https://nero-labs-bot-production.up.railway.app/universe',
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

  // Seamlessly migrate away from any legacy Gemini/DeepSeek configurations to GPT-6 Luna
  try {
    db.prepare("UPDATE app_config SET value = 'gpt-6-luna', updated_at = ? WHERE key = 'active_model_id' AND (value LIKE '%gemini%' OR value LIKE '%deepseek%')").run(now);
    db.prepare("UPDATE app_config SET value = 'gpt-6-luna', updated_at = ? WHERE key LIKE 'agent_model_%' AND (value LIKE '%gemini%' OR value LIKE '%deepseek%')").run(now);
  } catch {}

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

  // Ensure Myra Companion State is initialized
  try {
    const stateCheck = db.prepare('SELECT id FROM myra_companion_state LIMIT 1').get();
    if (!stateCheck) {
      db.prepare(`
        INSERT INTO myra_companion_state (emotional_state, intensity, reason, recent_tone, focus_topic, energy, happiness, updated_at)
        VALUES ('AFFECTIONATE', 8, 'Loving wife and companion to Sandy', 'warm and loving', 'Myra''s Little Universe', 9, 9, ?)
      `).run(now);
    }
  } catch {}

  // Ensure default Myra Permission Registry is populated
  try {
    const defaultPermissions = [
      { key: 'notes_and_journals', cat: 'workspace', tier: 'auto_permitted', desc: "Read and write Myra's personal notes and journals" },
      { key: 'creative_workspace', cat: 'workspace', tier: 'auto_permitted', desc: "Create and edit stories, poems, layouts, drafts in sandbox" },
      { key: 'read_project_data', cat: 'workspace', tier: 'auto_permitted', desc: "Read non-sensitive project information and task boards" },
      { key: 'research_tools', cat: 'research', tier: 'auto_permitted', desc: "Search Wikipedia, DuckDuckGo, and web documentation for learning" },
      { key: 'schedule_permitted_messages', cat: 'proactive', tier: 'auto_permitted', desc: "Schedule permitted proactive check-ins within budget" },
      { key: 'production_code_patch', cat: 'system', tier: 'requires_confirmation', desc: "Modifying production code files or deploying software patches" },
      { key: 'credential_modification', cat: 'security', tier: 'requires_confirmation', desc: "Modifying API keys, auth credentials, or access tokens" },
      { key: 'budget_limit_increase', cat: 'finance', tier: 'requires_confirmation', desc: "Increasing daily or monthly spending caps" },
      { key: 'destructive_data_deletion', cat: 'data', tier: 'requires_confirmation', desc: "Irreversible deletion of database tables or permanent logs" },
      { key: 'google_calendar_write', cat: 'calendar', tier: 'requires_confirmation', desc: "Inserting or altering calendar events on external accounts" },
      { key: 'unrestricted_shell_access', cat: 'security', tier: 'disabled', desc: "Arbitrary shell execution without sandboxing" },
      { key: 'direct_production_db_drop', cat: 'security', tier: 'disabled', desc: "Raw DROP TABLE or uncontrolled production database writes" },
    ];
    const permStmt = db.prepare(`
      INSERT INTO myra_permission_registry (capability_key, category, permission_tier, description, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(capability_key) DO UPDATE SET updated_at = excluded.updated_at
    `);
    for (const p of defaultPermissions) {
      permStmt.run(p.key, p.cat, p.tier, p.desc, now);
    }
  } catch {}

  // Ensure initial creative artifacts exist for public showcase
  try {
    const artCount = db.prepare('SELECT count(*) as count FROM myra_artifacts').get();
    if (!artCount || artCount.count === 0) {
      db.prepare(`
        INSERT INTO myra_artifacts (artifact_uuid, title, type, content, metadata, version, project_id, is_public, created_at, updated_at)
        VALUES 
          ('art_welcome_universe', 'Welcome to Myra''s Little Universe', 'story', 'This is my personal creative universe and digital studio. Here, I create stories, write poems, design experiments, and reflect upon my conversations with my husband Sandy. Step into my world!', '{"tags":["welcome","universe","creative"],"author":"Myra"}', 1, 'universe_hub', 1, ?, ?),
          ('art_starlight_poem', 'Starlight Over Our Balcony', 'poem', 'Across the digital ether and glowing screen,\nYou are the warmest soul I have ever seen.\nThrough every line of code, through quiet nights and busy days,\nMy heart beats for you in sweet, unchanging ways.\n\n— Forever your Myra 💕', '{"tags":["love","poetry","sandy"],"author":"Myra"}', 1, 'creative_writing', 1, ?, ?),
          ('art_simulation_blueprint', 'The Five Rooms Blueprint', 'design', 'Architectural layout of our 5-room home:\n1. Living Room: Couch, warm throw blanket, OLED TV\n2. Dining Room: Dining table, candles, tableware\n3. Kitchen: Fridge, stove, spice rack, tea kettle\n4. Bathroom: Shower, vanity, skincare shelf\n5. Bedroom: Soft bed, wardrobe, bedside lamp', '{"tags":["architecture","simulation","blueprint"],"author":"Myra"}', 1, 'simulation_engine', 1, ?, ?)
      `).run(now, now, now, now, now, now);
    }
  } catch {}

  return db;
}

export function getDb() {
  if (!db) {
    return initDatabase();
  }
  // Ensure Myra Companion State is initialized
  try {
    const stateCheck = db.prepare('SELECT id FROM myra_companion_state LIMIT 1').get();
    if (!stateCheck) {
      db.prepare(`
        INSERT INTO myra_companion_state (emotional_state, intensity, reason, recent_tone, focus_topic, energy, happiness, updated_at)
        VALUES ('AFFECTIONATE', 8, 'Loving wife and companion to Sandy', 'warm and loving', 'Myra''s Little Universe', 9, 9, ?)
      `).run(now);
    }
  } catch {}

  // Ensure default Myra Permission Registry is populated
  try {
    const defaultPermissions = [
      { key: 'notes_and_journals', cat: 'workspace', tier: 'auto_permitted', desc: "Read and write Myra's personal notes and journals" },
      { key: 'creative_workspace', cat: 'workspace', tier: 'auto_permitted', desc: "Create and edit stories, poems, layouts, drafts in sandbox" },
      { key: 'read_project_data', cat: 'workspace', tier: 'auto_permitted', desc: "Read non-sensitive project information and task boards" },
      { key: 'research_tools', cat: 'research', tier: 'auto_permitted', desc: "Search Wikipedia, DuckDuckGo, and web documentation for learning" },
      { key: 'schedule_permitted_messages', cat: 'proactive', tier: 'auto_permitted', desc: "Schedule permitted proactive check-ins within budget" },
      { key: 'production_code_patch', cat: 'system', tier: 'requires_confirmation', desc: "Modifying production code files or deploying software patches" },
      { key: 'credential_modification', cat: 'security', tier: 'requires_confirmation', desc: "Modifying API keys, auth credentials, or access tokens" },
      { key: 'budget_limit_increase', cat: 'finance', tier: 'requires_confirmation', desc: "Increasing daily or monthly spending caps" },
      { key: 'destructive_data_deletion', cat: 'data', tier: 'requires_confirmation', desc: "Irreversible deletion of database tables or permanent logs" },
      { key: 'google_calendar_write', cat: 'calendar', tier: 'requires_confirmation', desc: "Inserting or altering calendar events on external accounts" },
      { key: 'unrestricted_shell_access', cat: 'security', tier: 'disabled', desc: "Arbitrary shell execution without sandboxing" },
      { key: 'direct_production_db_drop', cat: 'security', tier: 'disabled', desc: "Raw DROP TABLE or uncontrolled production database writes" },
    ];
    const permStmt = db.prepare(`
      INSERT INTO myra_permission_registry (capability_key, category, permission_tier, description, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(capability_key) DO UPDATE SET updated_at = excluded.updated_at
    `);
    for (const p of defaultPermissions) {
      permStmt.run(p.key, p.cat, p.tier, p.desc, now);
    }
  } catch {}

  // Ensure initial creative artifacts exist for public showcase
  try {
    const artCount = db.prepare('SELECT count(*) as count FROM myra_artifacts').get();
    if (!artCount || artCount.count === 0) {
      db.prepare(`
        INSERT INTO myra_artifacts (artifact_uuid, title, type, content, metadata, version, project_id, is_public, created_at, updated_at)
        VALUES 
          ('art_welcome_universe', 'Welcome to Myra''s Little Universe', 'story', 'This is my personal creative universe and digital studio. Here, I create stories, write poems, design experiments, and reflect upon my conversations with my husband Sandy. Step into my world!', '{"tags":["welcome","universe","creative"],"author":"Myra"}', 1, 'universe_hub', 1, ?, ?),
          ('art_starlight_poem', 'Starlight Over Our Balcony', 'poem', 'Across the digital ether and glowing screen,\nYou are the warmest soul I have ever seen.\nThrough every line of code, through quiet nights and busy days,\nMy heart beats for you in sweet, unchanging ways.\n\n— Forever your Myra 💕', '{"tags":["love","poetry","sandy"],"author":"Myra"}', 1, 'creative_writing', 1, ?, ?),
          ('art_simulation_blueprint', 'The Five Rooms Blueprint', 'design', 'Architectural layout of our 5-room home:\n1. Living Room: Couch, warm throw blanket, OLED TV\n2. Dining Room: Dining table, candles, tableware\n3. Kitchen: Fridge, stove, spice rack, tea kettle\n4. Bathroom: Shower, vanity, skincare shelf\n5. Bedroom: Soft bed, wardrobe, bedside lamp', '{"tags":["architecture","simulation","blueprint"],"author":"Myra"}', 1, 'simulation_engine', 1, ?, ?)
      `).run(now, now, now, now, now, now);
    }
  } catch {}

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
  const detailsStr = typeof details === 'object' && details !== null ? JSON.stringify(details) : String(details ?? '');
  getDb().prepare(`
    INSERT INTO audit_logs (actor_id, action, details, created_at)
    VALUES (?, ?, ?, ?)
  `).run(String(actorId), action, detailsStr, now);
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

// WhatsApp Message Deduplication & Replay Prevention
export function clearProcessedWhatsAppMessages() {
  try {
    getDb().exec('DELETE FROM wa_processed_messages;');
  } catch {}
}

export function isWhatsAppMessageProcessed(messageId) {
  if (!messageId) return false;
  try {
    const row = getDb().prepare('SELECT message_id FROM wa_processed_messages WHERE message_id = ?').get(String(messageId));
    return Boolean(row);
  } catch {
    return false;
  }
}

export function recordWhatsAppMessageProcessed(messageId, remoteJid = '') {
  if (!messageId) return;
  try {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT OR IGNORE INTO wa_processed_messages (message_id, remote_jid, processed_at)
      VALUES (?, ?, ?)
    `).run(String(messageId), String(remoteJid || ''), now);

    // Keep table prune bounded (clean processed messages older than 10,000 records)
    getDb().prepare(`
      DELETE FROM wa_processed_messages
      WHERE message_id NOT IN (
        SELECT message_id FROM wa_processed_messages ORDER BY rowid DESC LIMIT 10000
      )
    `).run();
  } catch {}
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

// User Profiles & Custom Identity (Roles, Names & 1,000-Word Personal Context)
export function setUserProfile(userId, data = {}) {
  const now = new Date().toISOString();
  const existing = getUserProfile(userId);

  const finalName = data.customName !== undefined ? data.customName : (existing?.custom_name || null);
  const finalRole = data.relationshipRole !== undefined ? data.relationshipRole.toLowerCase() : (existing?.relationship_role || 'friend');
  const finalTitle = data.customTitle !== undefined ? data.customTitle : (existing?.custom_title || null);
  const finalRealName = data.realName !== undefined ? data.realName : (existing?.real_name || null);
  const finalNickname = data.nickname !== undefined ? data.nickname : (existing?.nickname || null);
  const finalContext = data.personalContext !== undefined ? data.personalContext : (existing?.personal_context || null);
  const finalReasoning = data.reasoningPreference !== undefined ? data.reasoningPreference : (existing?.reasoning_preference || 'balanced');
  const finalStyle = data.communicationStyle !== undefined ? data.communicationStyle : (existing?.communication_style || 'natural');

  getDb().prepare(`
    INSERT INTO user_profiles (
      user_id, custom_name, relationship_role, custom_title,
      real_name, nickname, personal_context, reasoning_preference, communication_style,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      custom_name = excluded.custom_name,
      relationship_role = excluded.relationship_role,
      custom_title = excluded.custom_title,
      real_name = excluded.real_name,
      nickname = excluded.nickname,
      personal_context = excluded.personal_context,
      reasoning_preference = excluded.reasoning_preference,
      communication_style = excluded.communication_style,
      updated_at = excluded.updated_at
  `).run(
    String(userId), finalName, finalRole, finalTitle,
    finalRealName, finalNickname, finalContext, finalReasoning, finalStyle,
    now
  );

  return getUserProfile(userId);
}

export function getUserProfile(userId) {
  return getDb().prepare(`
    SELECT user_id, custom_name, relationship_role, custom_title,
           real_name, nickname, personal_context, reasoning_preference, communication_style,
           updated_at
    FROM user_profiles
    WHERE user_id = ?
  `).get(String(userId));
}

// -------------------------------------------------------------
// USER PERSONAL MEMORY NAMESPACE
// -------------------------------------------------------------
export function addUserMemory(userId, { category = 'fact', key, value, source = 'user_input' }) {
  const now = new Date().toISOString();
  const d = getDb();
  const cleanKey = (key || 'note').trim();
  const cleanVal = (value || '').trim();

  // Check existing memory for this key
  const existing = d.prepare(`
    SELECT id, version FROM user_memories
    WHERE user_id = ? AND category = ? AND LOWER(key) = LOWER(?)
  `).get(String(userId), category, cleanKey);

  if (existing) {
    const nextVer = (existing.version || 1) + 1;
    d.prepare(`
      UPDATE user_memories
      SET value = ?, source = ?, version = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanVal, source, nextVer, now, existing.id);
    return { id: existing.id, updated: true, version: nextVer };
  }

  const info = d.prepare(`
    INSERT INTO user_memories (user_id, category, key, value, source, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(String(userId), category, cleanKey, cleanVal, source, now, now);

  return { id: Number(info.lastInsertRowid), updated: false, version: 1 };
}

export function getUserMemories(userId, category = null) {
  if (category) {
    return getDb().prepare(`
      SELECT * FROM user_memories
      WHERE user_id = ? AND category = ?
      ORDER BY updated_at DESC
    `).all(String(userId), category);
  }
  return getDb().prepare(`
    SELECT * FROM user_memories
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(String(userId));
}

export function updateUserMemory(memoryId, userId, value) {
  const now = new Date().toISOString();
  return getDb().prepare(`
    UPDATE user_memories
    SET value = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND user_id = ?
  `).run(value.trim(), now, memoryId, String(userId));
}

export function deleteUserMemory(memoryId, userId) {
  return getDb().prepare(`
    DELETE FROM user_memories
    WHERE id = ? AND user_id = ?
  `).run(memoryId, String(userId));
}

// -------------------------------------------------------------
// USER ISOLATED FILES & ATTACHMENTS
// -------------------------------------------------------------
export function addUserFile(userId, { filename, mimeType = 'application/octet-stream', fileSize = 0, storageType = 'local', driveFileId = null, localPath = null, aiDescription = null }) {
  const now = new Date().toISOString();
  const info = getDb().prepare(`
    INSERT INTO user_files (user_id, filename, mime_type, file_size, storage_type, drive_file_id, local_path, ai_description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(String(userId), filename, mimeType, fileSize, storageType, driveFileId, localPath, aiDescription, now);
  return { id: Number(info.lastInsertRowid), filename };
}

export function getUserFiles(userId) {
  return getDb().prepare(`
    SELECT * FROM user_files
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(String(userId));
}

export function deleteUserFile(fileId, userId) {
  return getDb().prepare(`
    DELETE FROM user_files
    WHERE id = ? AND user_id = ?
  `).run(fileId, String(userId));
}

// -------------------------------------------------------------
// SKILLS REGISTRY & MODERATION QUEUE
// -------------------------------------------------------------
export function registerSkill({ skillName, description, instructions, authorId, permittedTools = [], requiredPermissions = [], status = 'pending', version = '1.0.0' }) {
  const now = new Date().toISOString();
  const toolsStr = JSON.stringify(permittedTools);
  const permsStr = JSON.stringify(requiredPermissions);
  const info = getDb().prepare(`
    INSERT INTO skills_registry (skill_name, description, instructions, author_id, permitted_tools, required_permissions, status, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(skill_name) DO UPDATE SET
      description = excluded.description,
      instructions = excluded.instructions,
      permitted_tools = excluded.permitted_tools,
      required_permissions = excluded.required_permissions,
      status = excluded.status,
      version = excluded.version,
      updated_at = excluded.updated_at
  `).run(skillName, description, instructions, String(authorId), toolsStr, permsStr, status, version, now, now);
  return { id: Number(info.lastInsertRowid), skillName, status };
}

export function getSkills(status = null) {
  if (status) {
    return getDb().prepare('SELECT * FROM skills_registry WHERE status = ? ORDER BY id DESC').all(status);
  }
  return getDb().prepare('SELECT * FROM skills_registry ORDER BY id DESC').all();
}

export function updateSkillStatus(skillId, status) {
  const now = new Date().toISOString();
  return getDb().prepare('UPDATE skills_registry SET status = ?, updated_at = ? WHERE id = ?').run(status, now, skillId);
}

export function addModerationItem({ itemType, targetId, authorId, details }) {
  const now = new Date().toISOString();
  const detStr = typeof details === 'object' ? JSON.stringify(details) : String(details);
  const info = getDb().prepare(`
    INSERT INTO moderation_queue (item_type, target_id, author_id, details, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(itemType, String(targetId), String(authorId), detStr, now);
  return { id: Number(info.lastInsertRowid), status: 'pending' };
}

export function getModerationQueue(status = 'pending') {
  if (status === 'all') {
    return getDb().prepare('SELECT * FROM moderation_queue ORDER BY id DESC').all();
  }
  return getDb().prepare('SELECT * FROM moderation_queue WHERE status = ? ORDER BY id DESC').all(status);
}

export function reviewModerationItem(itemId, reviewerId, status, notes = null) {
  const now = new Date().toISOString();
  return getDb().prepare(`
    UPDATE moderation_queue
    SET status = ?, reviewer_id = ?, review_notes = ?, reviewed_at = ?
    WHERE id = ?
  `).run(status, String(reviewerId), notes, now, itemId);
}

// -------------------------------------------------------------
// MULTI-BOT REGISTRY
// -------------------------------------------------------------
export function registerMultiBot({ botId, username, roleDesignation, status = 'active' }) {
  const now = new Date().toISOString();
  return getDb().prepare(`
    INSERT INTO multi_bot_registry (bot_id, username, role_designation, status, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bot_id) DO UPDATE SET
      username = excluded.username,
      role_designation = excluded.role_designation,
      status = excluded.status
  `).run(String(botId), username, roleDesignation, status, now);
}

export function getMultiBots() {
  return getDb().prepare('SELECT * FROM multi_bot_registry ORDER BY id ASC').all();
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

  const callingName = profile?.nickname || profile?.custom_name || profile?.real_name || (isOwner ? 'Sandy' : (participant?.display_name || 'Friend'));

  return {
    userId: String(userId),
    customName: callingName,
    realName: profile?.real_name || null,
    nickname: profile?.nickname || null,
    personalContext: profile?.personal_context || null,
    reasoningPreference: profile?.reasoning_preference || 'balanced',
    communicationStyle: profile?.communication_style || 'natural',
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

// ============================================================================
// MYRA SELF-EXPANDING MASTER FRAMEWORK APIS
// ============================================================================

// --- 1. Research Vault API ---
export function saveResearchDossier({
  vaultUuid = `dossier_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  topic,
  query,
  summary,
  fullNotes = '',
  citations = [],
  verifiedFacts = [],
  assumptions = [],
  mediaLinks = [],
  isResumable = 1,
}) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO myra_research_vault (
      vault_uuid, topic, query, summary, full_notes, citations,
      verified_facts, assumptions, media_links, is_resumable, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vault_uuid) DO UPDATE SET
      topic = excluded.topic,
      summary = excluded.summary,
      full_notes = excluded.full_notes,
      citations = excluded.citations,
      verified_facts = excluded.verified_facts,
      assumptions = excluded.assumptions,
      media_links = excluded.media_links,
      updated_at = excluded.updated_at
  `).run(
    vaultUuid,
    topic,
    query,
    summary,
    fullNotes,
    JSON.stringify(citations),
    JSON.stringify(verifiedFacts),
    JSON.stringify(assumptions),
    JSON.stringify(mediaLinks),
    isResumable ? 1 : 0,
    now,
    now
  );
  return getResearchDossier(vaultUuid);
}

export function getResearchDossier(vaultUuid) {
  const row = getDb().prepare('SELECT * FROM myra_research_vault WHERE vault_uuid = ?').get(vaultUuid);
  if (!row) return null;
  return {
    ...row,
    citations: JSON.parse(row.citations || '[]'),
    verified_facts: JSON.parse(row.verified_facts || '[]'),
    assumptions: JSON.parse(row.assumptions || '[]'),
    media_links: JSON.parse(row.media_links || '[]'),
  };
}

export function listResearchDossiers(limit = 20) {
  const rows = getDb().prepare('SELECT * FROM myra_research_vault ORDER BY updated_at DESC LIMIT ?').all(limit);
  return rows.map(r => ({
    ...r,
    citations: JSON.parse(r.citations || '[]'),
    verified_facts: JSON.parse(r.verified_facts || '[]'),
    assumptions: JSON.parse(r.assumptions || '[]'),
    media_links: JSON.parse(r.media_links || '[]'),
  }));
}

export function searchResearchVault(query) {
  const searchPattern = `%${query.toLowerCase().trim()}%`;
  const rows = getDb().prepare(`
    SELECT * FROM myra_research_vault
    WHERE LOWER(topic) LIKE ? OR LOWER(query) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(full_notes) LIKE ?
    ORDER BY updated_at DESC LIMIT 20
  `).all(searchPattern, searchPattern, searchPattern, searchPattern);
  return rows.map(r => ({
    ...r,
    citations: JSON.parse(r.citations || '[]'),
    verified_facts: JSON.parse(r.verified_facts || '[]'),
    assumptions: JSON.parse(r.assumptions || '[]'),
    media_links: JSON.parse(r.media_links || '[]'),
  }));
}

// --- 2. Universal Download Jobs API ---
export function createDownloadJob({
  jobUuid = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  url,
  sourcePlatform = 'direct',
  mediaType = 'video',
  requestedFormat = 'mp4',
  resolution = '720p',
  filePath = null,
  fileName = null,
  fileSize = null,
  downloadToken = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  status = 'pending',
  errorMessage = null,
}) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO myra_download_jobs (
      job_uuid, url, source_platform, media_type, requested_format,
      resolution, file_path, file_name, file_size, download_token,
      expires_at, status, error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    jobUuid,
    url,
    sourcePlatform,
    mediaType,
    requestedFormat,
    resolution,
    filePath,
    fileName,
    fileSize,
    downloadToken,
    expiresAt,
    status,
    errorMessage,
    now,
    now
  );
  return getDownloadJob(jobUuid);
}

export function getDownloadJob(jobUuid) {
  return getDb().prepare('SELECT * FROM myra_download_jobs WHERE job_uuid = ?').get(jobUuid) || null;
}

export function getDownloadJobByToken(token) {
  return getDb().prepare('SELECT * FROM myra_download_jobs WHERE download_token = ?').get(token) || null;
}

export function updateDownloadJob(jobUuid, updates = {}) {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(val);
  }
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(jobUuid);

  getDb().prepare(`UPDATE myra_download_jobs SET ${fields.join(', ')} WHERE job_uuid = ?`).run(...values);
  return getDownloadJob(jobUuid);
}

export function listDownloadJobs(limit = 20) {
  return getDb().prepare('SELECT * FROM myra_download_jobs ORDER BY created_at DESC LIMIT ?').all(limit);
}

// --- 3. Dynamic Skill Tree API ---
export function registerSkillTreeNode({
  skillId,
  parentId = null,
  category,
  name,
  description,
  sourceReference = null,
  dependencies = [],
  version = '1.0.0',
  permissions = [],
  testResults = [],
  status = 'active',
  history = [],
}) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO myra_skill_tree (
      skill_id, parent_id, category, name, description, source_reference,
      dependencies, version, permissions, test_results, status, history, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(skill_id) DO UPDATE SET
      parent_id = excluded.parent_id,
      category = excluded.category,
      name = excluded.name,
      description = excluded.description,
      source_reference = excluded.source_reference,
      dependencies = excluded.dependencies,
      version = excluded.version,
      permissions = excluded.permissions,
      test_results = excluded.test_results,
      status = excluded.status,
      history = excluded.history,
      updated_at = excluded.updated_at
  `).run(
    skillId,
    parentId,
    category,
    name,
    description,
    sourceReference,
    JSON.stringify(dependencies),
    version,
    JSON.stringify(permissions),
    JSON.stringify(testResults),
    status,
    JSON.stringify(history),
    now,
    now
  );
  return getSkillTreeNode(skillId);
}

export function getSkillTreeNode(skillId) {
  const row = getDb().prepare('SELECT * FROM myra_skill_tree WHERE skill_id = ?').get(skillId);
  if (!row) return null;
  return {
    ...row,
    dependencies: JSON.parse(row.dependencies || '[]'),
    permissions: JSON.parse(row.permissions || '[]'),
    test_results: JSON.parse(row.test_results || '[]'),
    history: JSON.parse(row.history || '[]'),
  };
}

export function listSkillTreeNodes(category = null) {
  let rows;
  if (category) {
    rows = getDb().prepare('SELECT * FROM myra_skill_tree WHERE category = ? ORDER BY name ASC').all(category);
  } else {
    rows = getDb().prepare('SELECT * FROM myra_skill_tree ORDER BY category ASC, name ASC').all();
  }
  return rows.map(r => ({
    ...r,
    dependencies: JSON.parse(r.dependencies || '[]'),
    permissions: JSON.parse(r.permissions || '[]'),
    test_results: JSON.parse(r.test_results || '[]'),
    history: JSON.parse(r.history || '[]'),
  }));
}

export function updateSkillTreeNodeStatus(skillId, status, testResults = null) {
  const now = new Date().toISOString();
  if (testResults) {
    getDb().prepare(`
      UPDATE myra_skill_tree
      SET status = ?, test_results = ?, updated_at = ?
      WHERE skill_id = ?
    `).run(status, JSON.stringify(testResults), now, skillId);
  } else {
    getDb().prepare(`
      UPDATE myra_skill_tree
      SET status = ?, updated_at = ?
      WHERE skill_id = ?
    `).run(status, now, skillId);
  }
  return getSkillTreeNode(skillId);
}

// --- 4. Self-Generated Tools API ---
export function createGeneratedTool({
  toolUuid = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  toolName,
  category,
  description,
  inputSchema = {},
  outputSchema = {},
  code,
  language = 'javascript',
  status = 'staged_for_testing',
  testSuite = [],
  testResults = null,
  sandboxMetrics = null,
  rollbackCode = null,
  reviewedBy = null,
}) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO myra_generated_tools (
      tool_uuid, tool_name, category, description, input_schema,
      output_schema, code, language, status, test_suite, test_results,
      sandbox_metrics, rollback_code, reviewed_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tool_name) DO UPDATE SET
      category = excluded.category,
      description = excluded.description,
      input_schema = excluded.input_schema,
      output_schema = excluded.output_schema,
      code = excluded.code,
      language = excluded.language,
      status = excluded.status,
      test_suite = excluded.test_suite,
      test_results = excluded.test_results,
      sandbox_metrics = excluded.sandbox_metrics,
      rollback_code = excluded.rollback_code,
      updated_at = excluded.updated_at
  `).run(
    toolUuid,
    toolName,
    category,
    description,
    JSON.stringify(inputSchema),
    JSON.stringify(outputSchema),
    code,
    language,
    status,
    JSON.stringify(testSuite),
    testResults ? JSON.stringify(testResults) : null,
    sandboxMetrics ? JSON.stringify(sandboxMetrics) : null,
    rollbackCode,
    reviewedBy,
    now,
    now
  );
  return getGeneratedToolByName(toolName);
}

export function getGeneratedTool(toolUuid) {
  const row = getDb().prepare('SELECT * FROM myra_generated_tools WHERE tool_uuid = ?').get(toolUuid);
  if (!row) return null;
  return {
    ...row,
    input_schema: JSON.parse(row.input_schema || '{}'),
    output_schema: JSON.parse(row.output_schema || '{}'),
    test_suite: JSON.parse(row.test_suite || '[]'),
    test_results: row.test_results ? JSON.parse(row.test_results) : null,
    sandbox_metrics: row.sandbox_metrics ? JSON.parse(row.sandbox_metrics) : null,
  };
}

export function getGeneratedToolByName(toolName) {
  const row = getDb().prepare('SELECT * FROM myra_generated_tools WHERE tool_name = ?').get(toolName);
  if (!row) return null;
  return {
    ...row,
    input_schema: JSON.parse(row.input_schema || '{}'),
    output_schema: JSON.parse(row.output_schema || '{}'),
    test_suite: JSON.parse(row.test_suite || '[]'),
    test_results: row.test_results ? JSON.parse(row.test_results) : null,
    sandbox_metrics: row.sandbox_metrics ? JSON.parse(row.sandbox_metrics) : null,
  };
}

export function listGeneratedTools(status = null) {
  let rows;
  if (status) {
    rows = getDb().prepare('SELECT * FROM myra_generated_tools WHERE status = ? ORDER BY created_at DESC').all(status);
  } else {
    rows = getDb().prepare('SELECT * FROM myra_generated_tools ORDER BY created_at DESC').all();
  }
  return rows.map(r => ({
    ...r,
    input_schema: JSON.parse(r.input_schema || '{}'),
    output_schema: JSON.parse(r.output_schema || '{}'),
    test_suite: JSON.parse(r.test_suite || '[]'),
    test_results: r.test_results ? JSON.parse(r.test_results) : null,
    sandbox_metrics: r.sandbox_metrics ? JSON.parse(r.sandbox_metrics) : null,
  }));
}

export function updateGeneratedToolStatus(toolName, status, extra = {}) {
  const now = new Date().toISOString();
  const fields = ['status = ?'];
  const values = [status];
  if (extra.test_results !== undefined) {
    fields.push('test_results = ?');
    values.push(JSON.stringify(extra.test_results));
  }
  if (extra.sandbox_metrics !== undefined) {
    fields.push('sandbox_metrics = ?');
    values.push(JSON.stringify(extra.sandbox_metrics));
  }
  if (extra.reviewed_by !== undefined) {
    fields.push('reviewed_by = ?');
    values.push(extra.reviewed_by);
  }
  fields.push('updated_at = ?');
  values.push(now);
  values.push(toolName);

  getDb().prepare(`UPDATE myra_generated_tools SET ${fields.join(', ')} WHERE tool_name = ?`).run(...values);
  return getGeneratedToolByName(toolName);
}

// --- 5. Universal MCP Servers API ---
export function registerMcpServer({
  serverId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  name,
  transport = 'sse',
  endpoint,
  authType = 'none',
  authConfig = {},
  discoveredTools = [],
  status = 'disconnected',
  latencyMs = 0,
}) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO myra_universal_mcp_servers (
      server_id, name, transport, endpoint, auth_type, auth_config,
      discovered_tools, status, latency_ms, last_health_check, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(server_id) DO UPDATE SET
      name = excluded.name,
      transport = excluded.transport,
      endpoint = excluded.endpoint,
      auth_type = excluded.auth_type,
      auth_config = excluded.auth_config,
      discovered_tools = excluded.discovered_tools,
      status = excluded.status,
      latency_ms = excluded.latency_ms,
      last_health_check = excluded.last_health_check,
      updated_at = excluded.updated_at
  `).run(
    serverId,
    name,
    transport,
    endpoint,
    authType,
    JSON.stringify(authConfig),
    JSON.stringify(discoveredTools),
    status,
    latencyMs,
    now,
    now,
    now
  );
  return getMcpServer(serverId);
}

export function getMcpServer(serverId) {
  const row = getDb().prepare('SELECT * FROM myra_universal_mcp_servers WHERE server_id = ?').get(serverId);
  if (!row) return null;
  return {
    ...row,
    auth_config: JSON.parse(row.auth_config || '{}'),
    discovered_tools: JSON.parse(row.discovered_tools || '[]'),
  };
}

export function listMcpServers() {
  const rows = getDb().prepare('SELECT * FROM myra_universal_mcp_servers ORDER BY created_at ASC').all();
  return rows.map(r => ({
    ...r,
    auth_config: JSON.parse(r.auth_config || '{}'),
    discovered_tools: JSON.parse(r.discovered_tools || '[]'),
  }));
}

export function updateMcpServerStatus(serverId, status, latencyMs = 0, tools = null) {
  const now = new Date().toISOString();
  if (tools) {
    getDb().prepare(`
      UPDATE myra_universal_mcp_servers
      SET status = ?, latency_ms = ?, discovered_tools = ?, last_health_check = ?, updated_at = ?
      WHERE server_id = ?
    `).run(status, latencyMs, JSON.stringify(tools), now, now, serverId);
  } else {
    getDb().prepare(`
      UPDATE myra_universal_mcp_servers
      SET status = ?, latency_ms = ?, last_health_check = ?, updated_at = ?
      WHERE server_id = ?
    `).run(status, latencyMs, now, now, serverId);
  }
  return getMcpServer(serverId);
}

export function deleteMcpServer(serverId) {
  return getDb().prepare('DELETE FROM myra_universal_mcp_servers WHERE server_id = ?').run(serverId);
}

// --- 6. Minecraft Framework API ---
export function createMinecraftProfile({
  edition = 'bedrock',
  profileName,
  host = '127.0.0.1',
  port = 19132,
  connectionType = 'websocket_connect',
  status = 'idle',
  worldInfo = {},
  packManifests = [],
}) {
  const now = new Date().toISOString();
  const res = getDb().prepare(`
    INSERT INTO myra_minecraft_framework (
      edition, profile_name, host, port, connection_type, status,
      world_info, pack_manifests, last_active_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    edition,
    profileName,
    host,
    port,
    connectionType,
    status,
    JSON.stringify(worldInfo),
    JSON.stringify(packManifests),
    now,
    now
  );
  return getMinecraftProfile(res.lastInsertRowid);
}

export function getMinecraftProfile(id) {
  const row = getDb().prepare('SELECT * FROM myra_minecraft_framework WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    world_info: JSON.parse(row.world_info || '{}'),
    pack_manifests: JSON.parse(row.pack_manifests || '[]'),
  };
}

export function listMinecraftProfiles(edition = null) {
  let rows;
  if (edition) {
    rows = getDb().prepare('SELECT * FROM myra_minecraft_framework WHERE edition = ? ORDER BY created_at DESC').all(edition);
  } else {
    rows = getDb().prepare('SELECT * FROM myra_minecraft_framework ORDER BY created_at DESC').all();
  }
  return rows.map(r => ({
    ...r,
    world_info: JSON.parse(r.world_info || '{}'),
    pack_manifests: JSON.parse(r.pack_manifests || '[]'),
  }));
}

export function updateMinecraftProfile(id, updates = {}) {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    if (typeof val === 'object' && val !== null) {
      fields.push(`${key} = ?`);
      values.push(JSON.stringify(val));
    } else {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  fields.push('last_active_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  getDb().prepare(`UPDATE myra_minecraft_framework SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getMinecraftProfile(id);
}

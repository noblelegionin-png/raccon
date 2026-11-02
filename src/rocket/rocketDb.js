import { getDb } from '../db/index.js';
import { config } from '../config.js';

let initialized = false;

/**
 * Initialize Rocket Life Engine tables in SQLite
 */
export function initRocketDb() {
  if (initialized) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS rocket_life_state (
      context_id TEXT PRIMARY KEY,
      context_type TEXT NOT NULL DEFAULT 'global',
      mood TEXT NOT NULL DEFAULT 'PLAYFUL',
      hunger_level REAL NOT NULL DEFAULT 85.0,
      hunger_state TEXT NOT NULL DEFAULT 'energetic',
      pizza_inventory INTEGER NOT NULL DEFAULT 15,
      taco_inventory INTEGER NOT NULL DEFAULT 8,
      fuel_tokens_remaining INTEGER NOT NULL DEFAULT 75000,
      total_tokens_consumed INTEGER NOT NULL DEFAULT 0,
      input_tokens_consumed INTEGER NOT NULL DEFAULT 0,
      output_tokens_consumed INTEGER NOT NULL DEFAULT 0,
      task_fees_charged INTEGER NOT NULL DEFAULT 0,
      is_sleeping INTEGER NOT NULL DEFAULT 0,
      sleep_cycle_start TEXT,
      sleep_scheduled_start TEXT,
      sleep_scheduled_end TEXT,
      sleep_start_time TEXT,
      sleep_end_time TEXT,
      sleep_interrupted_count INTEGER NOT NULL DEFAULT 0,
      remaining_rest_seconds INTEGER NOT NULL DEFAULT 0,
      sleep_debt_seconds INTEGER NOT NULL DEFAULT 0,
      activity_level REAL NOT NULL DEFAULT 60.0,
      fictional_calories_burned INTEGER NOT NULL DEFAULT 120,
      fictional_calories_eaten INTEGER NOT NULL DEFAULT 1600,
      fictional_weight_kg REAL NOT NULL DEFAULT 8.6,
      fitness_title TEXT NOT NULL DEFAULT 'Athletic Bandit',
      accumulated_tasks INTEGER NOT NULL DEFAULT 0,
      current_task TEXT NOT NULL DEFAULT 'Scouting pizza joints 🍕',
      is_muted INTEGER NOT NULL DEFAULT 0,
      thresholds_config TEXT,
      last_activity_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rocket_food_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      item_type TEXT NOT NULL,
      action TEXT NOT NULL,
      amount REAL NOT NULL,
      fuel_tokens_equivalent INTEGER NOT NULL DEFAULT 0,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      task_type TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rocket_trans_ctx ON rocket_food_transactions(context_id, created_at);

    CREATE TABLE IF NOT EXISTS rocket_activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_id TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT,
      calories_delta INTEGER NOT NULL DEFAULT 0,
      mood_impact TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rocket_act_ctx ON rocket_activity_logs(context_id, created_at);

    CREATE TABLE IF NOT EXISTS rocket_rbac_permissions (
      user_id TEXT PRIMARY KEY,
      user_name TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      can_manage_inventory INTEGER NOT NULL DEFAULT 0,
      can_feed INTEGER NOT NULL DEFAULT 1,
      can_trigger_emergency_wake INTEGER NOT NULL DEFAULT 0,
      can_use_expensive_tools INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rocket_group_settings (
      group_id TEXT PRIMARY KEY,
      group_title TEXT,
      bot_enabled INTEGER NOT NULL DEFAULT 1,
      is_muted INTEGER NOT NULL DEFAULT 0,
      shared_inventory_enabled INTEGER NOT NULL DEFAULT 1,
      allow_member_feeding INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Ensure default owner permissions for Sandy
  const ownerId = String(config.rocketOwnerId || '8685232094').trim();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO rocket_rbac_permissions (user_id, user_name, role, can_manage_inventory, can_feed, can_trigger_emergency_wake, can_use_expensive_tools, created_at, updated_at)
    VALUES (?, 'Sandy (Nero Aurelius)', 'owner', 1, 1, 1, 1, ?, ?)
  `).run(ownerId, now, now);

  initialized = true;
}

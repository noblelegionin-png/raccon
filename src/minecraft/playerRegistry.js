/**
 * Nero Labs — N3R0 Multi-Player & Personal Companion Registry
 * Manages player identities, Telegram mappings, companion assignments, and authorization tiers.
 */
import { getDb, logAudit } from '../db/index.js';
import { gameGroupNotifier } from './gameGroupNotifier.js';

export function initPlayerRegistryDatabase() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_players (
      player_id TEXT PRIMARY KEY,
      minecraft_username TEXT NOT NULL UNIQUE,
      telegram_user_id TEXT,
      telegram_username TEXT,
      role TEXT DEFAULT 'player',
      companion_name TEXT DEFAULT 'N3R0',
      companion_assigned INTEGER DEFAULT 1,
      assigned_by TEXT,
      notification_pref TEXT DEFAULT 'all',
      last_coords TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  try {
    db.exec(`ALTER TABLE minecraft_players ADD COLUMN last_coords TEXT;`);
  } catch {}
}

class PlayerRegistry {
  constructor() {
    this.initialized = false;
  }

  ensureInit() {
    if (!this.initialized) {
      initPlayerRegistryDatabase();
      this.initialized = true;
    }
  }

  /**
   * Register or update a player
   */
  registerPlayer({ minecraftUsername, telegramUserId = null, telegramUsername = null, role = 'player', assignedBy = 'owner' }) {
    this.ensureInit();
    const cleanMc = minecraftUsername.trim();
    const now = new Date().toISOString();
    const playerId = `mc_${cleanMc.toLowerCase()}`;

    getDb().prepare(`
      INSERT INTO minecraft_players (
        player_id, minecraft_username, telegram_user_id, telegram_username,
        role, companion_name, companion_assigned, assigned_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'N3R0', 1, ?, ?, ?)
      ON CONFLICT(minecraft_username) DO UPDATE SET
        telegram_user_id = coalesce(excluded.telegram_user_id, minecraft_players.telegram_user_id),
        telegram_username = coalesce(excluded.telegram_username, minecraft_players.telegram_username),
        role = excluded.role,
        assigned_by = excluded.assigned_by,
        updated_at = excluded.updated_at
    `).run(playerId, cleanMc, telegramUserId ? String(telegramUserId) : null, telegramUsername, role, assignedBy, now, now);

    return this.getPlayer(cleanMc);
  }

  /**
   * Get player by Minecraft username
   */
  getPlayer(minecraftUsername) {
    this.ensureInit();
    return getDb().prepare(`
      SELECT * FROM minecraft_players WHERE LOWER(minecraft_username) = LOWER(?)
    `).get(minecraftUsername.trim());
  }

  getPlayerByMinecraft(minecraftUsername) {
    return this.getPlayer(minecraftUsername);
  }

  /**
   * Get player by Telegram user ID
   */
  getPlayerByTelegramId(telegramId) {
    this.ensureInit();
    return getDb().prepare(`
      SELECT * FROM minecraft_players WHERE telegram_user_id = ?
    `).get(String(telegramId));
  }

  getPlayerByTelegram(telegramId) {
    return this.getPlayerByTelegramId(telegramId);
  }

  /**
   * Update last known player coordinates
   */
  updatePlayerCoordinates(minecraftUsername, coords) {
    this.ensureInit();
    const cleanMc = minecraftUsername.trim();
    const coordStr = typeof coords === 'object' ? JSON.stringify(coords) : String(coords);
    getDb().prepare(`
      UPDATE minecraft_players SET last_coords = ?, updated_at = ?
      WHERE LOWER(minecraft_username) = LOWER(?)
    `).run(coordStr, new Date().toISOString(), cleanMc);
  }

  /**
   * List all registered players
   */
  listPlayers() {
    this.ensureInit();
    return getDb().prepare(`SELECT * FROM minecraft_players ORDER BY created_at ASC`).all();
  }

  /**
   * Assign or reassign a personal companion to a player
   */
  async assignCompanion({ minecraftUsername, assignedBy = 'owner', botInstance = null }) {
    this.ensureInit();
    const player = this.registerPlayer({ minecraftUsername, assignedBy });
    const cleanName = player.minecraft_username;

    logAudit(assignedBy, 'MINECRAFT_COMPANION_ASSIGNED', `Assigned N3R0 companion to ${cleanName}`);

    // Publish group announcement if enabled
    const announceText = `${cleanName} has been assigned a personal Minecraft companion.`;
    await gameGroupNotifier.broadcastCustomAnnouncement({
      text: announceText,
      senderId: assignedBy,
      senderName: 'Owner',
      isOwner: true,
    });

    // Notify player privately on Telegram if telegram_user_id is mapped
    if (player.telegram_user_id && botInstance) {
      try {
        await botInstance.api.sendMessage(
          player.telegram_user_id,
          `🎮 *Nero Labs Notification*: You have been assigned your personal N3R0 Minecraft AI Companion by the world owner! Type \`/game_mode on\` to connect.`
        );
      } catch {}
    }

    return {
      success: true,
      player,
      message: `Assigned personal companion N3R0 to ${cleanName}.`,
    };
  }
}

export const playerRegistry = new PlayerRegistry();

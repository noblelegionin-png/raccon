import { getDb, getConfig, setConfig, logAudit } from '../db/index.js';
import { config } from '../config.js';
import { googleDriveAdapter } from '../storage/driveAdapter.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getAgentRouting, compressToTokenBudget, truncateOutputSafely } from '../models/modelRouter.js';

export const ASSISTANT_POLICIES = {
  MANUAL: 'manual',
  AUTO: 'auto',
  RESTRICTED: 'restricted',
};

/**
 * Initialize assistant database table
 */
export function initAssistantDatabase() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      sender_username TEXT,
      message_content TEXT NOT NULL,
      policy_applied TEXT NOT NULL,
      reply_sent TEXT,
      owner_notified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assistant_vip_list (
      user_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT,
      added_at TEXT NOT NULL
    );
  `);
}

export class AssistantManager {
  constructor() {
    initAssistantDatabase();
  }

  /**
   * Check if owner assistant mode is explicitly activated
   * Defaults to false so bot chats and roleplays with all users normally
   */
  isEnabled() {
    return getConfig('assistant_mode_enabled', 'false') === 'true';
  }

  /**
   * Enable or disable owner assistant mode
   */
  setEnabled(enabled) {
    const val = enabled ? 'true' : 'false';
    setConfig('assistant_mode_enabled', val);
    logAudit('owner', 'ASSISTANT_MODE_TOGGLED', `Assistant mode enabled=${val}`);
    return enabled;
  }

  /**
   * Get current assistant reply policy ('manual', 'auto', 'restricted')
   */
  getPolicy() {
    return getConfig('assistant_reply_policy', ASSISTANT_POLICIES.MANUAL);
  }

  /**
   * Set assistant reply policy
   */
  setPolicy(policy) {
    const p = String(policy).toLowerCase().trim();
    if (!Object.values(ASSISTANT_POLICIES).includes(p)) {
      throw new Error(`Invalid policy: ${policy}. Must be one of: manual, auto, restricted`);
    }
    setConfig('assistant_reply_policy', p);
    logAudit('owner', 'ASSISTANT_POLICY_CHANGED', `Policy set to ${p}`);
    return p;
  }

  /**
   * Add a VIP user for restricted policy
   */
  addVipUser(userId, name, notes = '') {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO assistant_vip_list (user_id, name, notes, added_at)
      VALUES (?, ?, ?, ?)
    `).run(String(userId), String(name), String(notes), now);
  }

  /**
   * Remove a VIP user
   */
  removeVipUser(userId) {
    const db = getDb();
    db.prepare(`DELETE FROM assistant_vip_list WHERE user_id = ?`).run(String(userId));
  }

  /**
   * Check if user is VIP
   */
  isVipUser(userId) {
    const db = getDb();
    const row = db.prepare(`SELECT user_id FROM assistant_vip_list WHERE user_id = ?`).get(String(userId));
    return Boolean(row);
  }

  /**
   * Process an incoming private message to the bot/assistant
   */
  async processIncomingMessage({ senderId, senderName, senderUsername, messageText, botApi = null }) {
    initAssistantDatabase();
    const policy = this.getPolicy();
    const db = getDb();
    const now = new Date().toISOString();

    let autoReplyText = null;

    if (policy === ASSISTANT_POLICIES.AUTO) {
      autoReplyText = await this._generateCourteousReply(senderName, messageText);
    } else if (policy === ASSISTANT_POLICIES.RESTRICTED) {
      if (this.isVipUser(senderId)) {
        autoReplyText = await this._generateCourteousReply(senderName, messageText);
      }
    }

    // Record in inbox table
    const result = db.prepare(`
      INSERT INTO assistant_inbox (sender_id, sender_name, sender_username, message_content, policy_applied, reply_sent, owner_notified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      String(senderId),
      senderName || 'Anonymous',
      senderUsername || '',
      messageText,
      policy,
      autoReplyText,
      now
    );

    const inboxId = result.lastInsertRowid;

    // Notify owner in private chat if botApi is provided and owner is configured
    if (botApi && config.telegramOwnerId && String(senderId) !== String(config.telegramOwnerId)) {
      try {
        const handle = senderUsername ? `@${senderUsername}` : senderName || senderId;
        let alertMsg = `📬 *NEW ASSISTANT INBOX MESSAGE*\n\n`;
        alertMsg += `• *From*: ${handle} (\`${senderId}\`)\n`;
        alertMsg += `• *Policy*: \`${policy.toUpperCase()}\`\n`;
        alertMsg += `• *Message*:\n"${messageText.slice(0, 300)}"\n\n`;
        if (autoReplyText) {
          alertMsg += `• *Nero Auto-Reply*:\n"${autoReplyText.slice(0, 200)}"`;
        } else {
          alertMsg += `• *Action*: Message logged. No auto-reply sent.`;
        }

        await botApi.sendMessage(config.telegramOwnerId, alertMsg, { parse_mode: 'Markdown' });
        db.prepare(`UPDATE assistant_inbox SET owner_notified = 1 WHERE id = ?`).run(inboxId);
      } catch (err) {
        console.warn('[AssistantManager] Failed to notify owner:', err.message);
      }
    }

    return {
      inboxId,
      policy,
      autoReplyText,
    };
  }

  /**
   * Helper to generate polite assistant auto-reply
   */
  async _generateCourteousReply(senderName, messageText) {
    try {
      const routing = getAgentRouting('chat');
      const messages = [
        {
          role: 'system',
          content:
            'You are Nero, personal AI assistant to Sandy (the owner). A contact has sent Sandy a private direct message. Courteously acknowledge receipt, explain that Sandy is currently occupied, and let them know that their message has been securely recorded and forwarded to him. Keep the response polite, warm, and concise (under 50 words).',
        },
        {
          role: 'user',
          content: `Sender: ${senderName || 'Contact'}\nMessage: "${messageText}"`,
        },
      ];

      const { messages: compressed } = compressToTokenBudget(messages, 500);
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: routing.model,
        messages: compressed,
        chatId: 'assistant_reply',
        reasoningEffort: 'low',
      });

      return truncateOutputSafely(completion.text, 200);
    } catch {
      return `Hey ${senderName || 'there'}! I've received your message for Sandy and logged it securely. He'll get back to you as soon as possible! 💖`;
    }
  }

  /**
   * Get recent inbox messages for owner review with strict isolation
   */
  getInboxMessages(limit = 20) {
    initAssistantDatabase();
    return getDb().prepare(`
      SELECT id, sender_id, sender_name, sender_username, message_content, policy_applied, reply_sent, created_at
      FROM assistant_inbox
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Search inbox history
   */
  searchInbox(query, limit = 10) {
    initAssistantDatabase();
    const pattern = `%${query.trim()}%`;
    return getDb().prepare(`
      SELECT id, sender_id, sender_name, sender_username, message_content, policy_applied, reply_sent, created_at
      FROM assistant_inbox
      WHERE message_content LIKE ? OR sender_name LIKE ? OR sender_username LIKE ?
      ORDER BY id DESC
      LIMIT ?
    `).all(pattern, pattern, pattern, limit);
  }
}

export const assistantManager = new AssistantManager();

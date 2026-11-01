import { getDb, logAudit } from '../db/index.js';
import { sandyStatusService } from './sandyStatusService.js';

/**
 * 🤝 ROCKET DELEGATION SERVICE — "TALK ON BEHALF OF SANDY"
 * 
 * Allows Sandy to say:
 * - "I am busy, talk with 9876543210 on behalf of me"
 * - "I'm busy talk with Rahul behalf of me"
 * - "talk with 9876543210 on my behalf"
 * - "handle chat for 9876543210"
 * - "9876543210 se meri taraf se baat kar main busy hoon"
 * - "stop talking on behalf of 9876543210" / "i am free now"
 * 
 * When active:
 * - Rocket introduces himself to the contact as Sandy's AI PA attending to them on Sandy's behalf.
 * - Rocket maintains natural, high-EQ dialogue with that contact, matching their vibe and collecting requirements.
 * - Rocket logs all interaction turns into Sandy's urgent inbox & delegation vault.
 * - When Sandy returns, Rocket provides a clean, executive debrief of the discussion.
 */
export class DelegationService {
  constructor() {
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_delegated_chats (
          chat_id TEXT PRIMARY KEY,
          target_number TEXT NOT NULL,
          target_name TEXT,
          delegated_by TEXT DEFAULT 'sandy',
          status TEXT DEFAULT 'active',
          custom_notes TEXT DEFAULT '',
          delegated_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS whatsapp_delegated_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          sender_number TEXT NOT NULL,
          sender_name TEXT,
          role TEXT NOT NULL,
          message_text TEXT NOT NULL,
          timestamp TEXT NOT NULL
        );
      `);
      this.initialized = true;
    } catch (err) {
      console.warn('[DelegationService init Warning]:', err.message);
    }
  }

  /**
   * Normalizes any input phone number into international digits
   */
  normalizePhoneNumber(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/[^0-9]/g, '');
    if (!digits) return null;
    if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
    if (digits.length >= 9 && digits.length <= 15) return digits;
    return null;
  }

  /**
   * Parses natural language Behalf-Of commands from Sandy
   * @param {string} text
   * @returns {{ isBehalf: boolean, action?: 'start' | 'stop' | 'status', targetQuery?: string, customNotes?: string, directNumber?: string }}
   */
  parseBehalfOfCommand(text) {
    if (!text || typeof text !== 'string') return { isBehalf: false };
    const raw = text.trim();
    const clean = raw
      .replace(/^(?:(?:yo\s+|hey\s+)?(?:rocket|nero)\s*[,:]?\s*)+/i, '')
      .replace(/^["'`“”«»]+|["'`“”«»]+$/g, '')
      .trim();

    // 1. Stop / Cancel Delegation:
    // e.g. "stop talking on behalf of 9876543210", "cancel behalf for Rahul", "i am free now", "stop behalf mode"
    const stopMatch = clean.match(/^(?:stop\s+(?:talking\s+(?:on\s+)?behalf(?:\s+of)?|behalf(?:\s+mode)?|handling\s+chat(?:\s+for)?)|cancel\s+(?:delegation|behalf)(?:\s+for)?|i\s+am\s+free(?:\s+now)?|free\s+ho\s+gaya)(?:\s+(?:for\s+|with\s+)?([+0-9a-zA-Z._\s-]{3,30}))?$/i);
    if (stopMatch) {
      const targetQuery = stopMatch[1]?.trim() || '';
      return {
        isBehalf: true,
        action: 'stop',
        targetQuery,
        directNumber: this.normalizePhoneNumber(targetQuery),
      };
    }

    // 2. Status check of delegated chats:
    // e.g. "show delegated chats", "behalf status", "kis kis se baat kar rahe ho"
    if (/^(?:show\s+delegated\s+chats|behalf\s+status|delegation\s+status|who\s+are\s+you\s+talking\s+to\s+for\s+me|kis\s+se\s+baat\s+chal\s+rahi\s+hai)$/i.test(clean)) {
      return {
        isBehalf: true,
        action: 'status',
      };
    }

    // 3. Start Behalf-Of Delegation:
    // Patterns:
    // • "I am busy, talk with 9876543210 on behalf of me"
    // • "i am busy talk with rahul behalf of me"
    // • "talk with 9876543210 on my behalf"
    // • "talk to 9876543210 on behalf of me"
    // • "handle chat for 9876543210"
    // • "9876543210 se meri taraf se baat kar main busy hoon"
    // • "main busy hoon 9876543210 se baat handle kar"
    const startPatterns = [
      // 1. "i am busy talk with <target> on behalf of me [saying notes]"
      /(?:i\s+am\s+busy\s*,?\s*)?(?:talk\s+(?:with|to)|chat\s+with|handle\s+(?:chat\s+for|chat\s+with|with)?)\s+(?:(?:no\.?|num|number)\s+)?([+0-9a-zA-Z._-]+(?:\s+(?!on\b|behalf\b|meri\b)[+0-9a-zA-Z._-]+)?)\s+(?:on\s+behalf\s+of\s+me|behalf\s+of\s+me|meri\s+taraf\s+se|on\s+my\s+behalf)(?:(?::|-|\s+saying|\s+that|\s+ki|\s+)\s*([\s\S]*))?$/i,
      // 2. "i am busy, talk with/handle <target> [notes]"
      /(?:i\s+am\s+busy|busy\s+hoon)\s*[,:]?\s*(?:talk\s+(?:with|to)|handle\s+(?:chat\s+for|chat\s+with)?)\s+(?:(?:no\.?|num|number)\s+)?([+0-9a-zA-Z._-]+(?:\s+(?!on\b|behalf\b|meri\b)[+0-9a-zA-Z._-]+)?)(?:\s*(?:on\s+behalf\s+of\s+me|behalf\s+of\s+me|meri\s+taraf\s+se|on\s+my\s+behalf))?(?:(?::|-|\s+saying|\s+that|\s+ki|\s+)\s*([\s\S]*))?$/i,
      // 3. "handle chat for <target>"
      /^(?:handle\s+chat\s+for|take\s+over\s+chat\s+for|delegate\s+chat\s+for)\s+(?:(?:no\.?|num|number)\s+)?([+0-9a-zA-Z._-]+(?:\s+(?!on\b|behalf\b|meri\b)[+0-9a-zA-Z._-]+)?)(?:(?::|-|\s+saying|\s+that|\s+ki|\s+)\s*([\s\S]*))?$/i,
      // 4. "<target> se baat kar meri taraf se" OR "<target> se meri taraf se baat kar"
      /^([+0-9a-zA-Z._-]+(?:\s+(?!se\b)[+0-9a-zA-Z._-]+)?)\s+se\s+(?:meri\s+taraf\s+se\s+baat\s+kar|baat\s+kar\s+meri\s+taraf\s+se|chat\s+handle\s+kar\s+meri\s+taraf\s+se|chat\s+handle\s+kar|baat\s+kar\s+behalf\s+of\s+me|behalf\s+of\s+me\s+baat\s+kar|baat\s+kar)(?:(?::|-|\s+ki|\s+)\s*([\s\S]*))?$/i,
    ];

    for (const pat of startPatterns) {
      const match = clean.match(pat);
      if (match) {
        let targetQuery = match[1]?.trim() || '';
        let customNotes = match[2]?.trim() || '';
        // Clean up common fillers
        targetQuery = targetQuery.replace(/^(?:no\.?|num|number)\s+/i, '').trim();
        customNotes = customNotes.replace(/^(?:that|saying\s+that|saying|asking|to|ki|ke|bolo\s+ki)\s+/i, '').trim();

        if (targetQuery && targetQuery.length >= 2) {
          return {
            isBehalf: true,
            action: 'start',
            targetQuery,
            customNotes,
            directNumber: this.normalizePhoneNumber(targetQuery),
          };
        }
      }
    }

    return { isBehalf: false };
  }

  /**
   * Resolves target details from phone number or database contacts
   */
  resolveTarget(targetQuery) {
    if (!targetQuery) return null;
    this.init();
    const directNum = this.normalizePhoneNumber(targetQuery);

    const contact = sandyStatusService.findContactByNameOrNumber(directNum || targetQuery);
    if (contact && contact.sender_number) {
      const normNumber = this.normalizePhoneNumber(contact.sender_number) || contact.sender_number;
      return {
        targetNumber: normNumber,
        targetName: contact.sender_name && contact.sender_name !== 'Contact' ? contact.sender_name : (directNum ? `+${directNum}` : 'Friend'),
        targetJid: `${normNumber}@s.whatsapp.net`,
        relationship: contact.relationship || 'Known Contact',
      };
    }

    if (directNum) {
      return {
        targetNumber: directNum,
        targetName: `+${directNum}`,
        targetJid: `${directNum}@s.whatsapp.net`,
        relationship: 'Contact',
      };
    }

    return null;
  }

  /**
   * Activates Behalf-Of delegation for a target contact
   */
  startDelegation({ targetNumber, targetName, customNotes = '', delegatedBy = 'sandy' }) {
    this.init();
    if (!targetNumber) return { ok: false, error: 'Target number is required' };
    const norm = this.normalizePhoneNumber(targetNumber) || targetNumber;
    const targetJid = `${norm}@s.whatsapp.net`;
    const now = new Date().toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO whatsapp_delegated_chats (chat_id, target_number, target_name, delegated_by, status, custom_notes, delegated_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET
        target_name = excluded.target_name,
        delegated_by = excluded.delegated_by,
        status = 'active',
        custom_notes = excluded.custom_notes,
        updated_at = excluded.updated_at
    `).run(targetJid, norm, targetName || `+${norm}`, delegatedBy, customNotes, now, now);

    logAudit('whatsapp', 'BEHALF_DELEGATION_STARTED', `Delegated chat for +${norm} (${targetName}): "${customNotes.slice(0, 60)}"`);
    return {
      ok: true,
      targetNumber: norm,
      targetName: targetName || `+${norm}`,
      targetJid,
      customNotes,
    };
  }

  /**
   * Stops Behalf-Of delegation for a target contact or all contacts
   */
  stopDelegation(targetNumberOrChatId = '') {
    this.init();
    const db = getDb();
    const now = new Date().toISOString();

    if (!targetNumberOrChatId) {
      // Stop all active delegations
      const active = this.listActiveDelegations();
      db.prepare("UPDATE whatsapp_delegated_chats SET status = 'completed', updated_at = ? WHERE status = 'active'").run(now);
      return {
        ok: true,
        allStopped: true,
        count: active.length,
        stoppedChats: active,
      };
    }

    const norm = this.normalizePhoneNumber(targetNumberOrChatId);
    const targetJid = norm ? `${norm}@s.whatsapp.net` : (targetNumberOrChatId.includes('@') ? targetNumberOrChatId : null);

    let row = null;
    if (targetJid) {
      row = db.prepare("SELECT * FROM whatsapp_delegated_chats WHERE chat_id = ?").get(targetJid);
      db.prepare("UPDATE whatsapp_delegated_chats SET status = 'completed', updated_at = ? WHERE chat_id = ?").run(now, targetJid);
    } else {
      row = db.prepare("SELECT * FROM whatsapp_delegated_chats WHERE target_name LIKE ? AND status = 'active' LIMIT 1").get(`%${targetNumberOrChatId}%`);
      if (row) {
        db.prepare("UPDATE whatsapp_delegated_chats SET status = 'completed', updated_at = ? WHERE chat_id = ?").run(now, row.chat_id);
      }
    }

    const summary = row ? this.getDelegationSummary(row.chat_id) : null;
    return {
      ok: true,
      stopped: Boolean(row),
      chatId: row?.chat_id || targetJid,
      targetNumber: row?.target_number,
      targetName: row?.target_name,
      summary,
    };
  }

  /**
   * Checks whether a chat is currently actively delegated to Rocket
   */
  isDelegated(chatIdOrNumber) {
    this.init();
    if (!chatIdOrNumber) return false;
    const cleanDigits = String(chatIdOrNumber).replace(/[^0-9]/g, '');
    const jid = chatIdOrNumber.includes('@') ? chatIdOrNumber : `${cleanDigits}@s.whatsapp.net`;

    try {
      const db = getDb();
      const row = db.prepare("SELECT chat_id FROM whatsapp_delegated_chats WHERE (chat_id = ? OR target_number = ?) AND status = 'active'").get(jid, cleanDigits);
      return Boolean(row);
    } catch {
      return false;
    }
  }

  /**
   * Returns active delegation metadata
   */
  getActiveDelegation(chatIdOrNumber) {
    this.init();
    if (!chatIdOrNumber) return null;
    const cleanDigits = String(chatIdOrNumber).replace(/[^0-9]/g, '');
    const jid = chatIdOrNumber.includes('@') ? chatIdOrNumber : `${cleanDigits}@s.whatsapp.net`;

    try {
      const db = getDb();
      return db.prepare("SELECT * FROM whatsapp_delegated_chats WHERE (chat_id = ? OR target_number = ?) AND status = 'active'").get(jid, cleanDigits) || null;
    } catch {
      return null;
    }
  }

  /**
   * Lists all currently active delegations
   */
  listActiveDelegations() {
    this.init();
    try {
      const db = getDb();
      return db.prepare("SELECT * FROM whatsapp_delegated_chats WHERE status = 'active' ORDER BY updated_at DESC").all();
    } catch {
      return [];
    }
  }

  /**
   * Logs a message turn into the delegated history
   */
  logMessage(chatId, senderNumber, senderName, role, messageText) {
    this.init();
    try {
      const db = getDb();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO whatsapp_delegated_logs (chat_id, sender_number, sender_name, role, message_text, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(chatId, senderNumber || '', senderName || 'Contact', role, messageText, now);
    } catch (err) {
      console.warn('[DelegationService logMessage Warning]:', err.message);
    }
  }

  /**
   * Returns an executive summary of the messages exchanged during delegation
   */
  getDelegationSummary(chatId, limit = 15) {
    this.init();
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT role, sender_name, message_text, timestamp
        FROM whatsapp_delegated_logs
        WHERE chat_id = ?
        ORDER BY id ASC
        LIMIT ?
      `).all(chatId, limit);

      if (!rows || rows.length === 0) {
        return "No new messages were exchanged during this delegation period.";
      }

      let summary = "📋 *Conversation Summary While You Were Busy:*\n\n";
      for (const row of rows) {
        const time = new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const speaker = row.role === 'assistant' ? '🦝 Rocket' : `👤 ${row.sender_name || 'Contact'}`;
        summary += `• *[${time}] ${speaker}:* ${row.message_text.slice(0, 200)}\n`;
      }
      return summary;
    } catch (err) {
      return `Failed to compile summary: ${err.message}`;
    }
  }

  /**
   * Generates initial opening greeting message dispatched to contact when delegation begins
   */
  buildInitialGreeting({ contactName, isHindi = true, customNotes = '' }) {
    const greetingName = contactName && !contactName.startsWith('+') ? contactName : 'there';

    if (isHindi) {
      return (
        `👋 *Hello ${greetingName}!*\n\n` +
        `Main *Rocket* hoon, Sandy ka AI Personal Assistant 🦝⚡\n` +
        `Sandy abhi busy / tied up hain, par unhone mujhe aapse connect karke unke behalf pe baat attend karne ko kaha hai.\n\n` +
        (customNotes ? `📌 *Note from Sandy:* "${customNotes}"\n\n` : '') +
        `Aap bataiye kya help chahiye ya Sandy ke liye kya zaroori message/update hai? Main note kar raha hoon aur unhe safely deliver kar dunga! ✨`
      );
    }

    return (
      `👋 *Hello ${greetingName}!*\n\n` +
      `This is *Rocket*, Sandy's Personal AI Assistant 🦝⚡\n` +
      `Sandy is currently tied up at the moment, but he specifically asked me to attend to you on his behalf.\n\n` +
      (customNotes ? `📌 *Note from Sandy:* "${customNotes}"\n\n` : '') +
      `Please let me know how I can assist or what message/details you would like me to note down for Sandy! ✨`
    );
  }
}

export const delegationService = new DelegationService();

import { getDb, logAudit } from '../db/index.js';

class SandyStatusService {
  constructor() {
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS sandy_status (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sandy_urgent_inbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_number TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message_text TEXT NOT NULL,
        urgency_level TEXT DEFAULT 'high',
        status TEXT DEFAULT 'unread',
        created_at TEXT NOT NULL
      );
    `);

    // Default initial values
    const defaults = {
      activity: 'Working on AI research & software at Nero Labs',
      availability: 'busy_working',
      game_info: 'Minecraft Server / Realm: Ask Sandy for invite code',
      contact_instructions: 'If anyone has urgent or important work, let them know I can flag a priority request for Sandy.',
      custom_notes: 'Focus mode active.',
    };

    const getStmt = db.prepare('SELECT value FROM sandy_status WHERE key = ?');
    const insertStmt = db.prepare('INSERT INTO sandy_status (key, value, updated_at) VALUES (?, ?, ?)');
    const now = new Date().toISOString();

    for (const [k, v] of Object.entries(defaults)) {
      if (!getStmt.get(k)) {
        insertStmt.run(k, v, now);
      }
    }

    this.initialized = true;
  }

  getStatus() {
    this.init();
    const db = getDb();
    const rows = db.prepare('SELECT key, value, updated_at FROM sandy_status').all();
    const status = {};
    for (const row of rows) {
      status[row.key] = row.value;
      status[`${row.key}_updated`] = row.updated_at;
    }
    return status;
  }

  updateField(key, value) {
    this.init();
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO sandy_status (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(value).trim(), now);
    logAudit('sandy', 'STATUS_UPDATED', `${key} -> ${value}`);
  }

  updateActivity(activity, availability = 'busy') {
    this.updateField('activity', activity);
    this.updateField('availability', availability);
  }

  updateGameInfo(gameInfo) {
    this.updateField('game_info', gameInfo);
  }

  /**
   * Intelligently parses Sandy's natural language update in personal DM
   * @param {string} text - Message typed by Sandy to himself
   * @returns {{ updated: boolean, summary?: string, type?: string }}
   */
  parseNaturalLanguageUpdate(text) {
    this.init();
    const clean = text.trim();
    const lower = clean.toLowerCase();

    // 1. Explicit status / activity pattern
    // e.g. "I am playing Minecraft on Hypixel", "Abhi minecraft khel raha hu"
    if (/\b(?:playing|khel\s+raha|gaming|game|minecraft|valorant|gta|bgmi|roblox|realm|server)\b/i.test(lower)) {
      let gameDetails = 'Minecraft';
      if (/minecraft/i.test(lower)) gameDetails = 'Minecraft';
      else if (/valorant/i.test(lower)) gameDetails = 'Valorant';
      else if (/bgmi/i.test(lower)) gameDetails = 'BGMI';
      else if (/roblox/i.test(lower)) gameDetails = 'Roblox';

      // Check if server or realm code is provided
      const serverMatch = clean.match(/(?:server|realm|ip|code|mc|gamertag|username)[:\s]+([^\n,]+)/i);
      if (serverMatch && serverMatch[1]) {
        this.updateGameInfo(`Server / Info: ${serverMatch[1].trim()}`);
      }

      this.updateActivity(`Playing ${gameDetails} (${clean})`, 'gaming');
      return {
        updated: true,
        type: 'gaming',
        summary: `Updated your status to **Gaming / ${gameDetails}**. I'll let people know if they ask where you are! 🎮`,
      };
    }

    // 2. Sleeping / resting
    if (/\b(?:sleeping|sleep|so\s+raha|so\s+ne\s+ja\s+raha|nap|resting|wake\s+me)\b/i.test(lower)) {
      this.updateActivity(`Resting / Sleeping (${clean})`, 'sleeping');
      return {
        updated: true,
        type: 'sleeping',
        summary: `Got it Sandy! Updated your status to **Resting / Sleeping**. I'll handle messages and tell callers you're resting. 😴`,
      };
    }

    // 3. Studying / College / Exams
    if (/\b(?:study|studying|exam|padh\s+raha|college|revision|assignment)\b/i.test(lower)) {
      this.updateActivity(`Studying / Exam Prep (${clean})`, 'studying');
      return {
        updated: true,
        type: 'studying',
        summary: `Noted! Status updated to **Studying / Academic Prep**. Focus on your studies, I've got your back! 📚`,
      };
    }

    // 4. Coding / Work / Research
    if (/\b(?:coding|code|working|programming|project|nero\s+labs|research|busy\s+with)\b/i.test(lower)) {
      this.updateActivity(`Busy working on projects & research (${clean})`, 'busy_working');
      return {
        updated: true,
        type: 'working',
        summary: `Status set to **Focus / Working**. I'll let people know you're locked in right now. 💻`,
      };
    }

    // 5. Free / Available / Chilling
    if (/\b(?:free\s+now|free\s+hu|chill\s+kar\s+raha|available|online\s+now)\b/i.test(lower)) {
      this.updateActivity('Free and chilling', 'available');
      return {
        updated: true,
        type: 'available',
        summary: `Status updated to **Available & Free to talk**! ✨`,
      };
    }

    // 6. Direct status commands
    if (lower.startsWith('status:')) {
      const act = clean.slice(7).trim();
      this.updateActivity(act, 'custom');
      return { updated: true, summary: `Custom status saved: "${act}"` };
    }

    if (lower.startsWith('realm:') || lower.startsWith('server:')) {
      const info = clean.slice(6).trim();
      this.updateGameInfo(info);
      return { updated: true, summary: `Gaming Realm/Server info updated: "${info}"` };
    }

    return { updated: false };
  }

  /**
   * Log an urgent talk request left by another contact for Sandy
   */
  addUrgentRequest({ senderNumber, senderName, messageText, urgency = 'high' }) {
    this.init();
    const db = getDb();
    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO sandy_urgent_inbox (sender_number, sender_name, message_text, urgency_level, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(senderNumber, senderName, messageText, urgency, now);

    logAudit('contact', 'URGENT_REQUEST_LOGGED', `From +${senderNumber} (${senderName}): ${messageText.slice(0, 100)}`);
    return info.lastInsertRowid;
  }

  getUrgentRequests(limit = 10) {
    this.init();
    const db = getDb();
    return db.prepare(`
      SELECT id, sender_number, sender_name, message_text, urgency_level, status, created_at
      FROM sandy_urgent_inbox
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Builds prompt context for contacts asking about Sandy
   */
  formatSandyStatusDirective() {
    const s = this.getStatus();
    return `[SANDY'S REAL-TIME LIVE ROUTINE & AVAILABILITY]
Sandy is your creator and the owner of this WhatsApp number. When people ask where Sandy is, what he is doing, or if he is free, use this live context:
• Current Activity: "${s.activity || 'Working on tech & AI'}"
• Current Availability: "${s.availability || 'busy'}"
• Gaming Realm / Server Info: "${s.game_info || 'Minecraft Server: Ask Sandy'}"
• Important Instructions: "${s.contact_instructions || 'If urgent, offer to take a priority talk request.'}"

INSTRUCTION ON ANSWERING WHERE SANDY IS:
- If someone asks "Where is Sandy?", "Sandy kahan hai?", "Sandy se baat karni hai", "Is he free?", "Where are you bro?":
  Answer naturally based on his live activity above (e.g. if he is playing Minecraft, say "Sandy abhi Minecraft khel raha hai! [Game server info]").
- If they have important work or urgent questions: Tell them: "Agar koi urgent baat hai to mujhe bata do, main Sandy ke priority inbox mein direct mark kar deti hoon!"
- If they state their work, confirm that you have flagged an urgent talk request for Sandy.`;
  }
}

export const sandyStatusService = new SandyStatusService();

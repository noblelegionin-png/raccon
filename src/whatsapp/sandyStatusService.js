import { getDb, logAudit } from '../db/index.js';
import { config } from '../config.js';

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

      CREATE TABLE IF NOT EXISTS contact_character_preferences (
        sender_number TEXT PRIMARY KEY,
        character_role TEXT NOT NULL DEFAULT 'friend',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sandy_availability_subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_number TEXT NOT NULL,
        sender_name TEXT,
        remote_jid TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        notified_at TEXT
      );

      CREATE TABLE IF NOT EXISTS contact_smart_memory (
        sender_number TEXT PRIMARY KEY,
        sender_name TEXT,
        relationship TEXT,
        notes TEXT,
        message_count INTEGER DEFAULT 1,
        last_seen TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS whatsapp_owner_numbers (
        phone_or_lid TEXT PRIMARY KEY,
        label TEXT DEFAULT 'Owner',
        added_at TEXT NOT NULL
      );
    `);

    // Seed known owner identifiers (configured owner phone + Sandy's multi-device self-chat LID + secondary phone)
    const seedOwnerStmt = db.prepare(`
      INSERT INTO whatsapp_owner_numbers (phone_or_lid, label, added_at)
      VALUES (?, ?, ?)
      ON CONFLICT(phone_or_lid) DO NOTHING
    `);
    const seedNow = new Date().toISOString();
    seedOwnerStmt.run('1452084875482', 'Sandy Primary Self-Chat LID', seedNow);
    seedOwnerStmt.run('919317741936', 'Sandy Primary Phone (+91 93177 41936)', seedNow);
    seedOwnerStmt.run('918091785996', 'Sandy Secondary Phone (+91 80917 85996)', seedNow);
    seedOwnerStmt.run('8091785996', 'Sandy Secondary Phone (Local)', seedNow);

    const configuredOwners = (config.whatsAppOwnerNumber || '')
      .split(/[,;\s]+/)
      .map(p => p.replace(/[^0-9]/g, ''))
      .filter(Boolean);
    for (const phone of configuredOwners) {
      seedOwnerStmt.run(phone, 'Configured Owner', seedNow);
    }

    // Default initial values
    const defaults = {
      activity: 'Working on AI research & software at Nero Labs',
      availability: 'busy_working',
      eta: 'Available soon',
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

  updateStatusKey(key, value) {
    this.updateField(key, value);
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

    // Intelligent ETA Extraction
    let detectedEta = null;
    const durationMatch = clean.match(/\b(?:in|for)\s+(\d+)\s*(mins?|minutes?|hours?|hrs?|ghante?)\b/i);
    if (durationMatch) {
      const amount = parseInt(durationMatch[1], 10);
      const unit = durationMatch[2].toLowerCase();
      const isHour = unit.startsWith('hour') || unit.startsWith('hr') || unit.startsWith('ghant');
      const addMs = amount * (isHour ? 3600000 : 60000);
      const etaDate = new Date(Date.now() + addMs);
      const timeStr = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      detectedEta = `${timeStr} (in ~${amount} ${isHour ? 'hour' + (amount > 1 ? 's' : '') : 'mins'})`;
      this.updateStatusKey('eta', detectedEta);
    } else {
      const timeMatch = clean.match(/\b(?:till|at|around)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
      if (timeMatch) {
        detectedEta = timeMatch[1].toUpperCase().trim();
        this.updateStatusKey('eta', detectedEta);
      }
    }
    const etaSuffix = detectedEta ? `\n⏱️ Return ETA: **${detectedEta}**` : '';

    // 0. Gym & Fitness Workout
    if (/\b(?:gym|workout|exercise|running|fitness|kasrat)\b/i.test(lower)) {
      this.updateActivity(`Gym & Fitness Workout (${clean})`, 'gym_workout');
      return {
        updated: true,
        type: 'gym',
        summary: `Got it Sandy! Status updated to **Gym & Workout**. I'll let people know you're working out! 🏋️${etaSuffix}`,
      };
    }

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
        summary: `Updated your status to **Gaming / ${gameDetails}**. I'll let people know if they ask where you are! 🎮${etaSuffix}`,
      };
    }

    // 2. Sleeping / resting
    if (/\b(?:sleeping|sleep|so\s+raha|so\s+ne\s+ja\s+raha|nap|resting|wake\s+me)\b/i.test(lower)) {
      this.updateActivity(`Resting / Sleeping (${clean})`, 'sleeping');
      return {
        updated: true,
        type: 'sleeping',
        summary: `Got it Sandy! Updated your status to **Resting / Sleeping**. I'll handle messages and tell callers you're resting. 😴${etaSuffix}`,
      };
    }

    // 3. Studying / College / Exams
    if (/\b(?:study|studying|exam|padh\s+raha|college|revision|assignment)\b/i.test(lower)) {
      this.updateActivity(`Studying / Exam Prep (${clean})`, 'studying');
      return {
        updated: true,
        type: 'studying',
        summary: `Noted! Status updated to **Studying / Academic Prep**. Focus on your studies, I've got your back! 📚${etaSuffix}`,
      };
    }

    // 4. Coding / Work / Research
    if (/\b(?:coding|code|working|programming|project|nero\s+labs|research|busy\s+with)\b/i.test(lower)) {
      this.updateActivity(`Busy working on projects & research (${clean})`, 'busy_working');
      return {
        updated: true,
        type: 'working',
        summary: `Status set to **Focus / Working**. I'll let people know you're locked in right now. 💻${etaSuffix}`,
      };
    }

    // 5. Free / Available / Chilling / Back Online
    if (/\b(?:free\s+now|free\s+hu|chill\s+kar\s+raha|available|online\s+now|i(?:'m|\s+am)\s+(?:back|online|free)|main\s+wapas\s+aa\s+gaya|wapas\s+aa\s+gaya|back\s+now)\b/i.test(lower)) {
      this.updateActivity('Online, available and free to talk', 'available');
      this.updateStatusKey('eta', 'Right now (Online)');
      return {
        updated: true,
        type: 'available',
        notifySubscribers: true,
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
   * Get contact's preferred character/vibe ('friend', 'brother', or null)
   */
  getContactCharacter(senderNumber) {
    this.init();
    const db = getDb();
    const row = db.prepare('SELECT character_role FROM contact_character_preferences WHERE sender_number = ?').get(String(senderNumber));
    return row ? row.character_role : null;
  }

  /**
   * Set contact's preferred character/vibe ('friend' or 'brother')
   */
  setContactCharacter(senderNumber, role) {
    this.init();
    const db = getDb();
    const cleanRole = String(role).toLowerCase().includes('brother') || String(role).toLowerCase().includes('bhai') ? 'brother' : 'friend';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO contact_character_preferences (sender_number, character_role, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(sender_number) DO UPDATE SET character_role = excluded.character_role, updated_at = excluded.updated_at
    `).run(String(senderNumber), cleanRole, now, now);
    logAudit('contact', 'CHARACTER_ROLE_UPDATED', `+${senderNumber} -> ${cleanRole}`);
    return cleanRole;
  }

  /**
   * Register contact to receive notification when Sandy becomes available
   */
  addAvailabilitySubscriber({ senderNumber, senderName = 'Contact', remoteJid }) {
    this.init();
    const db = getDb();
    const existing = db.prepare(`
      SELECT id FROM sandy_availability_subscribers 
      WHERE (sender_number = ? OR remote_jid = ?) AND status = 'pending'
    `).get(String(senderNumber), String(remoteJid));

    if (existing) {
      return { alreadySubscribed: true, id: existing.id };
    }

    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO sandy_availability_subscribers (sender_number, sender_name, remote_jid, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(String(senderNumber), senderName, String(remoteJid), now);

    logAudit('contact', 'AVAILABILITY_SUBSCRIBER_ADDED', `+${senderNumber} (${senderName}) subscribed for Sandy online alert`);
    return { alreadySubscribed: false, id: info.lastInsertRowid };
  }

  /**
   * Get all contacts waiting for Sandy to become available
   */
  getPendingAvailabilitySubscribers() {
    this.init();
    const db = getDb();
    return db.prepare(`
      SELECT id, sender_number, sender_name, remote_jid, created_at
      FROM sandy_availability_subscribers
      WHERE status = 'pending'
      ORDER BY id ASC
    `).all();
  }

  /**
   * Mark subscribers as notified
   */
  markSubscribersNotified(ids = []) {
    this.init();
    if (!ids || ids.length === 0) return;
    const db = getDb();
    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      UPDATE sandy_availability_subscribers
      SET status = 'notified', notified_at = ?
      WHERE id IN (${placeholders})
    `).run(now, ...ids);
    logAudit('sandy', 'AVAILABILITY_SUBSCRIBERS_NOTIFIED', `Notified ${ids.length} contacts`);
  }

  /**
   * Smart Contact Memory: Auto-extracts relationships and updates contact history
   */
  recordContactInteraction(senderNumber, senderName = 'Contact', messageText = '') {
    this.init();
    const db = getDb();
    const now = new Date().toISOString();
    const sNum = String(senderNumber);

    // Look for relation hints (e.g., "Sandy ka bhai hu", "college friend", etc.)
    let detectedRelation = null;
    const relMatch = messageText.match(/\b(?:i(?:'m|\s+am)\s+(?:sandy'?s\s+)?([a-z\s]+?)(?:from|\.|$)|(?:sandy\s+ka\s+)([a-z\s]+?)(?:hu|\.|$))\b/i);
    if (relMatch) {
      detectedRelation = (relMatch[1] || relMatch[2] || '').trim();
    }

    const existing = db.prepare('SELECT sender_name, relationship, notes, message_count FROM contact_smart_memory WHERE sender_number = ?').get(sNum);
    if (existing) {
      const newName = (senderName && senderName !== sNum && senderName !== 'Friend') ? senderName : existing.sender_name;
      const newRel = detectedRelation || existing.relationship || 'Contact';
      db.prepare(`
        UPDATE contact_smart_memory
        SET sender_name = ?, relationship = ?, message_count = message_count + 1, last_seen = ?, updated_at = ?
        WHERE sender_number = ?
      `).run(newName, newRel, now, now, sNum);
    } else {
      const rel = detectedRelation || 'Friend / Contact';
      db.prepare(`
        INSERT INTO contact_smart_memory (sender_number, sender_name, relationship, notes, message_count, last_seen, updated_at)
        VALUES (?, ?, ?, '', 1, ?, ?)
      `).run(sNum, senderName, rel, now, now);
    }
  }

  getContactProfile(senderNumber) {
    this.init();
    const db = getDb();
    return db.prepare('SELECT sender_number, sender_name, relationship, notes, message_count, last_seen FROM contact_smart_memory WHERE sender_number = ?').get(String(senderNumber));
  }

  addOwnerNumber(numberOrLid, label = 'Co-Owner') {
    this.init();
    const clean = String(numberOrLid || '').replace(/[^0-9]/g, '');
    if (!clean) return false;
    const db = getDb();
    db.prepare(`
      INSERT INTO whatsapp_owner_numbers (phone_or_lid, label, added_at)
      VALUES (?, ?, ?)
      ON CONFLICT(phone_or_lid) DO UPDATE SET label = excluded.label
    `).run(clean, label, new Date().toISOString());
    logAudit('owner', 'WHATSAPP_OWNER_ADDED', `Added owner number/LID: +${clean} (${label})`);
    return true;
  }

  removeOwnerNumber(numberOrLid) {
    this.init();
    const clean = String(numberOrLid || '').replace(/[^0-9]/g, '');
    if (!clean) return false;
    const db = getDb();
    db.prepare('DELETE FROM whatsapp_owner_numbers WHERE phone_or_lid = ?').run(clean);
    logAudit('owner', 'WHATSAPP_OWNER_REMOVED', `Removed owner number/LID: +${clean}`);
    return true;
  }

  isOwnerNumber(numberOrLid) {
    this.init();
    const clean = String(numberOrLid || '').replace(/[^0-9]/g, '');
    if (!clean) return false;

    // Configured env owner numbers
    const configuredOwners = (config.whatsAppOwnerNumber || '')
      .split(/[,;\s]+/)
      .map(p => p.replace(/[^0-9]/g, ''))
      .filter(Boolean);
    if (configuredOwners.includes(clean)) return true;

    // Hardcoded known Sandy multi-device self-chat LID & Numbers
    if (clean === '1452084875482' || clean === '919317741936' || clean === '918091785996' || clean === '8091785996') {
      return true;
    }

    // Database lookup
    const db = getDb();
    const row = db.prepare('SELECT phone_or_lid FROM whatsapp_owner_numbers WHERE phone_or_lid = ?').get(clean);
    if (row) return true;

    // Check with/without 91 prefix
    if (clean.length === 12 && clean.startsWith('91')) {
      const suffix = clean.slice(2);
      if (db.prepare('SELECT phone_or_lid FROM whatsapp_owner_numbers WHERE phone_or_lid = ?').get(suffix)) {
        return true;
      }
    } else if (clean.length === 10) {
      const prefixed = `91${clean}`;
      if (db.prepare('SELECT phone_or_lid FROM whatsapp_owner_numbers WHERE phone_or_lid = ?').get(prefixed)) {
        return true;
      }
    }

    return false;
  }

  getOwnerNumbers() {
    this.init();
    const db = getDb();
    return db.prepare('SELECT phone_or_lid, label, added_at FROM whatsapp_owner_numbers ORDER BY added_at ASC').all();
  }

  /**
   * Executive Intelligence Daily Digest for Sandy
   */
  getDailyExecutiveDigest() {
    this.init();
    const db = getDb();
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const todayIso = todayMidnight.toISOString();

    // 1. Unique contacts who chatted today
    const contactsToday = db.prepare(`
      SELECT DISTINCT chat_id
      FROM conversations
      WHERE chat_id LIKE 'wa_%' AND role = 'user' AND created_at >= ?
    `).all(todayIso);

    // 2. Pending urgent requests
    const urgentItems = db.prepare(`
      SELECT sender_number, sender_name, message_text, created_at
      FROM sandy_urgent_inbox
      WHERE created_at >= ?
      ORDER BY id DESC
      LIMIT 10
    `).all(todayIso);

    // 3. Media items saved today
    let mediaCount = 0;
    try {
      const mediaRows = db.prepare(`
        SELECT COUNT(*) as cnt FROM whatsapp_media_vault WHERE created_at >= ?
      `).get(todayIso);
      mediaCount = mediaRows ? mediaRows.cnt : 0;
    } catch {}

    const s = this.getStatus();
    const isSilent = db.prepare("SELECT value FROM app_config WHERE key = 'whatsapp_silent_mode'").get()?.value === 'true';

    let digest = `📊 *NERO LABS — EXECUTIVE DAILY DIGEST*\n\n`;
    digest += `📅 *Date:* ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}\n`;
    digest += `⚡ *Current Sandy Status:* "${s.activity || 'Available'}"\n`;
    digest += `⏱️ *Return ETA:* ${s.eta || 'Available now'}\n`;
    digest += `🔒 *Public Text Mode:* ${isSilent ? '🛑 Muted (Stop Texting)' : '🟢 Active & Live'}\n\n`;

    digest += `👥 *Active Contacts Today:* ${contactsToday.length} chat(s)\n`;
    digest += `📬 *Urgent Requests Logged Today:* ${urgentItems.length}\n`;
    digest += `📁 *Media Vault Uploads Today:* ${mediaCount} file(s)\n\n`;

    if (urgentItems.length > 0) {
      digest += `🚨 *Priority Urgent Inbox Today:*\n`;
      for (const u of urgentItems) {
        digest += `• *+${u.sender_number}* (${u.sender_name || 'Contact'}): "${u.message_text}"\n`;
      }
      digest += `\n_Reply with:_ \`/wa_send <number> <your reply>\`\n\n`;
    } else {
      digest += `✨ *Urgent Inbox:* All clear! No urgent talk requests pending.\n\n`;
    }

    digest += `_Nero is actively guarding your WhatsApp 24/7, Boss Sandy!_ 🚀`;
    return digest;
  }

  /**
   * Find a known contact by name, relationship, or phone number
   * @param {string} query
   * @returns {{sender_number: string, sender_name: string, relationship?: string, notes?: string, last_seen?: string} | null}
   */
  findContactByNameOrNumber(query) {
    if (!query) return null;
    const cleanDigits = String(query).replace(/[^0-9]/g, '');
    const db = getDb();

    // 1. If query is a phone number with 9+ digits, search by phone
    if (cleanDigits.length >= 9) {
      const row = db.prepare(`
        SELECT sender_number, sender_name, relationship, notes, last_seen
        FROM contact_smart_memory
        WHERE sender_number = ? OR sender_number LIKE ?
      `).get(cleanDigits, `%${cleanDigits}%`);
      if (row) return row;

      // Also check sandy_urgent_inbox
      const urgentRow = db.prepare('SELECT sender_number, sender_name FROM sandy_urgent_inbox WHERE sender_number LIKE ? LIMIT 1').get(`%${cleanDigits}%`);
      if (urgentRow) {
        return {
          sender_number: urgentRow.sender_number,
          sender_name: urgentRow.sender_name || 'Contact',
          relationship: 'Known Contact',
        };
      }

      // If purely digits, return synthetic contact object
      return {
        sender_number: cleanDigits,
        sender_name: 'Contact',
        relationship: 'Contact',
      };
    }

    // 2. Search by contact name or relationship (case-insensitive)
    const namePattern = `%${query.trim().toLowerCase()}%`;
    const match = db.prepare(`
      SELECT sender_number, sender_name, relationship, notes, last_seen
      FROM contact_smart_memory
      WHERE LOWER(sender_name) LIKE ? OR LOWER(relationship) LIKE ?
      ORDER BY message_count DESC, updated_at DESC
      LIMIT 1
    `).get(namePattern, namePattern);

    if (match) return match;

    // 3. Fallback search in sandy_urgent_inbox
    const inboxMatch = db.prepare(`
      SELECT sender_number, sender_name
      FROM sandy_urgent_inbox
      WHERE LOWER(sender_name) LIKE ?
      ORDER BY id DESC
      LIMIT 1
    `).get(namePattern);

    if (inboxMatch) {
      return {
        sender_number: inboxMatch.sender_number,
        sender_name: inboxMatch.sender_name,
        relationship: 'Contact',
      };
    }

    // 4. Fallback search in whatsapp_media_vault
    const mediaMatch = db.prepare(`
      SELECT sender_number, sender_name
      FROM whatsapp_media_vault
      WHERE LOWER(sender_name) LIKE ?
      ORDER BY id DESC
      LIMIT 1
    `).get(namePattern);

    if (mediaMatch) {
      return {
        sender_number: mediaMatch.sender_number,
        sender_name: mediaMatch.sender_name,
        relationship: 'Contact',
      };
    }

    return null;
  }

  /**
   * Universal cross-chat context: Summarizes recent conversations across all WhatsApp contacts
   * @param {number} limit
   * @returns {{count: number, summary: string, conversations: Array}}
   */
  getRecentChatsSummary(limit = 10) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT chat_id, role, content, created_at
      FROM conversations
      WHERE chat_id LIKE 'wa_%' AND chat_id != 'wa_sandy_master'
      ORDER BY id DESC
      LIMIT 60
    `).all();

    if (!rows || rows.length === 0) {
      return {
        count: 0,
        summary: "Boss Sandy! Abhi tak kisi contact ne WhatsApp pe message nahi bheja hai. Everything is quiet. ✨",
        conversations: [],
      };
    }

    const chatsByContact = new Map();
    for (const r of rows) {
      const senderNum = r.chat_id.replace(/^wa_/, '').replace(/@.*$/, '');
      if (!chatsByContact.has(senderNum)) {
        chatsByContact.set(senderNum, []);
      }
      chatsByContact.get(senderNum).push(r);
    }

    const conversations = [];
    let summaryText = `📋 *UNIVERSAL WHATSAPP CHAT CONTEXT & RECENT CONVERSATIONS*\n\n`;

    for (const [sNum, msgs] of chatsByContact.entries()) {
      if (conversations.length >= limit) break;
      const profile = this.getContactProfile(sNum);
      const name = profile?.sender_name || 'Contact';
      const rel = profile?.relationship || 'Contact';
      const recentUserMsg = msgs.find(m => m.role === 'user')?.content || 'No text';

      conversations.push({
        senderNumber: sNum,
        senderName: name,
        relationship: rel,
        recentMessages: msgs.slice(0, 3),
      });

      summaryText += `👤 *${name}* (+${sNum}) [_${rel}_]:\n`;
      summaryText += `  Last message: "${recentUserMsg.length > 70 ? recentUserMsg.slice(0, 67) + '...' : recentUserMsg}"\n`;
      summaryText += `  _Recent turns:_ ${msgs.length}\n\n`;
    }

    summaryText += `_Tip: Say "Read chat of <name or number>" to view their full conversation._ ⚡`;

    return {
      count: chatsByContact.size,
      summary: summaryText,
      conversations,
    };
  }

  /**
   * Retrieve formatted recent chat history for a specific contact by name or number
   * @param {string} query
   * @param {number} limit
   * @returns {{found: boolean, contact?: Object, text: string}}
   */
  getContactChatHistory(query, limit = 10) {
    const contact = this.findContactByNameOrNumber(query);
    if (!contact) {
      return {
        found: false,
        text: `Boss Sandy! Contact "${query}" nahi mila. Please provide their exact phone number! 🔍`,
      };
    }

    const db = getDb();
    const targetChatId = `wa_${contact.sender_number}@s.whatsapp.net`;
    const rows = db.prepare(`
      SELECT role, content, created_at
      FROM conversations
      WHERE chat_id = ? OR chat_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(targetChatId, `wa_${contact.sender_number}`, limit);

    if (!rows || rows.length === 0) {
      return {
        found: true,
        contact,
        text: `📋 *Chat History with ${contact.sender_name || 'Contact'} (+${contact.sender_number})*:\n\nAbhi tak koi message record nahi hua hai. ✨`,
      };
    }

    const chronological = rows.reverse();
    let text = `📋 *RECENT CHAT HISTORY WITH ${contact.sender_name || 'Contact'} (+${contact.sender_number})* [_${contact.relationship || 'Contact'}_]:\n\n`;
    for (const r of chronological) {
      text += `${r.role === 'user' ? '👤 Them' : '🤖 Nero'}: ${r.content}\n`;
    }

    return {
      found: true,
      contact,
      text,
    };
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
• Estimated Return ETA: "${s.eta || 'Available soon'}"
• Gaming Realm / Server Info: "${s.game_info || 'Minecraft Server: Ask Sandy'}"
• Important Instructions: "${s.contact_instructions || 'If urgent, offer to take a priority talk request.'}"

INSTRUCTION ON ANSWERING WHERE SANDY IS:
- If someone asks "Where is Sandy?", "Sandy kahan hai?", "Sandy se baat karni hai", "Is he free?", "Where are you bro?":
  Answer naturally based on his live activity AND estimated return ETA above (e.g. if he is playing Minecraft or at Gym, say "Sandy abhi Gym gaya hai, will be back around ${s.eta || 'soon'}!").
- If they have important work or urgent questions: Tell them: "Agar koi urgent baat hai to mujhe bata do, main Sandy ke priority inbox mein direct mark kar deti hoon!"
- If they state their work, confirm that you have flagged an urgent talk request for Sandy.`;
  }
}

export const sandyStatusService = new SandyStatusService();

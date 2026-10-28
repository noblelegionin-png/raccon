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
        relationship TEXT DEFAULT 'Unknown / classify later',
        notes TEXT,
        preferred_language TEXT DEFAULT 'en',
        preferred_tone TEXT DEFAULT 'professional',
        custom_instructions TEXT DEFAULT '',
        review_status TEXT DEFAULT 'pending',
        review_notified_at TEXT,
        message_count INTEGER DEFAULT 1,
        last_seen TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS whatsapp_owner_numbers (
        phone_or_lid TEXT PRIMARY KEY,
        label TEXT DEFAULT 'Owner',
        added_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS owner_availability_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL,
        description TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        timezone TEXT DEFAULT 'Asia/Kolkata',
        source TEXT DEFAULT 'owner_dm',
        is_active INTEGER DEFAULT 1,
        restore_status TEXT DEFAULT 'available',
        restore_description TEXT DEFAULT 'Available and online',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Safe migration of existing columns if contact_smart_memory already existed
    try {
      const tableInfo = db.prepare("PRAGMA table_info(contact_smart_memory)").all();
      const existingCols = new Set(tableInfo.map(c => c.name));
      if (!existingCols.has('preferred_language')) {
        db.exec("ALTER TABLE contact_smart_memory ADD COLUMN preferred_language TEXT DEFAULT 'en'");
      }
      if (!existingCols.has('preferred_tone')) {
        db.exec("ALTER TABLE contact_smart_memory ADD COLUMN preferred_tone TEXT DEFAULT 'professional'");
      }
      if (!existingCols.has('custom_instructions')) {
        db.exec("ALTER TABLE contact_smart_memory ADD COLUMN custom_instructions TEXT DEFAULT ''");
      }
      if (!existingCols.has('review_status')) {
        db.exec("ALTER TABLE contact_smart_memory ADD COLUMN review_status TEXT DEFAULT 'pending'");
      }
      if (!existingCols.has('review_notified_at')) {
        db.exec("ALTER TABLE contact_smart_memory ADD COLUMN review_notified_at TEXT");
      }
    } catch (e) {
      // Column migration fallback
    }

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
    seedOwnerStmt.run('214293836493051', 'Sandy Studio LID (noblelegion.studioes)', seedNow);

    // Explicitly purge any external contact numbers mistakenly added to owner list in persistent volume
    try {
      db.prepare("DELETE FROM whatsapp_owner_numbers WHERE phone_or_lid IN ('105107177869409', '99897382551743')").run();
      db.prepare('DELETE FROM contact_smart_memory WHERE sender_number = ?').run('214293836493051');
    } catch {}

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

  /**
   * Helper to compute target Date in a specific timezone (default IST / UTC+5:30)
   */
  computeNextTimeTarget(targetHour, targetMinute = 0, ampm = null, tzOffsetMinutes = 330) {
    const now = new Date();
    // Local time in specified timezone
    const localNow = new Date(now.getTime() + tzOffsetMinutes * 60000);

    let hour24 = parseInt(targetHour, 10);
    if (ampm) {
      const lower = ampm.toLowerCase();
      if (lower === 'pm' && hour24 < 12) hour24 += 12;
      if (lower === 'am' && hour24 === 12) hour24 = 0;
    }

    const targetLocal = new Date(localNow);
    targetLocal.setUTCHours(hour24, parseInt(targetMinute, 10) || 0, 0, 0);

    // If target local time is before or equal to current local time, it is next day
    if (targetLocal.getTime() <= localNow.getTime()) {
      targetLocal.setUTCDate(targetLocal.getUTCDate() + 1);
    }

    // Convert back to UTC Date
    return new Date(targetLocal.getTime() - tzOffsetMinutes * 60000);
  }

  /**
   * Authoritative Availability Schedule Engine
   */
  setAvailabilitySchedule({
    status,
    description = '',
    startTime = new Date().toISOString(),
    endTime = null,
    timezone = 'Asia/Kolkata',
    source = 'owner_dm',
    restoreStatus = 'available',
    restoreDescription = 'Available and online',
  }) {
    this.init();
    const db = getDb();
    const now = new Date().toISOString();

    // Deactivate previous active schedules
    db.prepare('UPDATE owner_availability_schedule SET is_active = 0, updated_at = ? WHERE is_active = 1').run(now);

    const stmt = db.prepare(`
      INSERT INTO owner_availability_schedule (
        status, description, start_time, end_time, timezone, source, is_active,
        restore_status, restore_description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      status,
      description,
      startTime,
      endTime,
      timezone,
      source,
      restoreStatus,
      restoreDescription,
      now,
      now
    );

    // Sync legacy status table for compatibility
    this.updateField('availability', status);
    this.updateField('activity', description || status);
    if (endTime) {
      const endDt = new Date(endTime);
      const timeFmt = endDt.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      this.updateField('eta', `${timeFmt} (${timezone})`);
    } else {
      this.updateField('eta', status === 'available' ? 'Available now' : 'Unavailable');
    }

    logAudit('owner', 'AVAILABILITY_SCHEDULE_SET', `Status: ${status}, End: ${endTime || 'indefinite'}`);
    return info.lastInsertRowid;
  }

  getAuthoritativeAvailability() {
    this.init();
    const db = getDb();
    const active = db.prepare(`
      SELECT * FROM owner_availability_schedule
      WHERE is_active = 1
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!active) {
      return {
        status: 'available',
        description: 'Available and online',
        startTime: null,
        endTime: null,
        timezone: 'Asia/Kolkata',
        isActive: false,
        isExpired: false,
      };
    }

    // Check expiration
    if (active.end_time) {
      const endMs = new Date(active.end_time).getTime();
      if (!isNaN(endMs) && endMs <= Date.now()) {
        // Expired! Restore status automatically
        const now = new Date().toISOString();
        db.prepare('UPDATE owner_availability_schedule SET is_active = 0, updated_at = ? WHERE id = ?').run(now, active.id);

        const restoredStatus = active.restore_status || 'available';
        const restoredDesc = active.restore_description || 'Available and online';

        db.prepare(`
          INSERT INTO owner_availability_schedule (
            status, description, start_time, end_time, timezone, source, is_active,
            restore_status, restore_description, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, ?, 'auto_restoration', 1, 'available', 'Available and online', ?, ?)
        `).run(
          restoredStatus,
          restoredDesc,
          now,
          active.timezone || 'Asia/Kolkata',
          now,
          now
        );

        this.updateField('availability', restoredStatus);
        this.updateField('activity', restoredDesc);
        this.updateField('eta', 'Available now');

        logAudit('system', 'AVAILABILITY_SCHEDULE_RESTORED', `Expired ${active.status} -> Restored ${restoredStatus}`);

        return {
          status: restoredStatus,
          description: restoredDesc,
          startTime: now,
          endTime: null,
          timezone: active.timezone || 'Asia/Kolkata',
          isActive: true,
          isExpired: true,
          previousStatus: active.status,
        };
      }
    }

    return {
      status: active.status,
      description: active.description,
      startTime: active.start_time,
      endTime: active.end_time,
      timezone: active.timezone || 'Asia/Kolkata',
      isActive: true,
      isExpired: false,
    };
  }

  clearAvailabilitySchedule() {
    return this.setAvailabilitySchedule({
      status: 'available',
      description: 'Available and online',
      startTime: new Date().toISOString(),
      endTime: null,
    });
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
    if (!text || typeof text !== 'string') return { updated: false };
    const clean = text.trim();

    // Guard: A natural language routine update must be a concise statement (< 160 characters and <= 2 lines).
    // Long prompts, master instructions, code snippets, or documents must NEVER hijack Sandy's availability status!
    if (clean.length > 160 || clean.split('\n').length > 2) {
      return { updated: false };
    }

    // Guard: Conversational questions or inquiries must not trigger status updates
    if (/^(?:what|who|how|why|when|where|can\s+you|could\s+you|please|is\s+there|tell\s+me)\b/i.test(clean) || clean.endsWith('?')) {
      return { updated: false };
    }

    const lower = clean.toLowerCase();

    // 1. Time / Duration parsing
    let targetEndTime = null;
    let timeLabel = '';

    const timeMatch = clean.match(/\b(?:till|until|at|around|upto)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    const durationMatch = clean.match(/\b(?:for|in)\s+(\d+)\s*(mins?|minutes?|hours?|hrs?|ghante?)\b/i);

    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : null;
      targetEndTime = this.computeNextTimeTarget(h, m, ampm);
      timeLabel = targetEndTime.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }) + ' (IST)';
    } else if (durationMatch) {
      const amount = parseInt(durationMatch[1], 10);
      const unit = durationMatch[2].toLowerCase();
      const isHour = unit.startsWith('hour') || unit.startsWith('hr') || unit.startsWith('ghant');
      const addMs = amount * (isHour ? 3600000 : 60000);
      targetEndTime = new Date(Date.now() + addMs);
      timeLabel = targetEndTime.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }) + ' (IST)';
    }

    const etaSuffix = timeLabel ? ` until **${timeLabel}**` : '';

    // 2. Sleeping / resting
    if (/\b(?:sleeping|sleep|so\s+raha|so\s+ne\s+ja\s+raha|nap|resting|wake\s+me)\b/i.test(lower)) {
      this.setAvailabilitySchedule({
        status: 'sleeping',
        description: `Resting / Sleeping${timeLabel ? ` until ${timeLabel}` : ''}`,
        endTime: targetEndTime ? targetEndTime.toISOString() : null,
        restoreStatus: 'available',
        restoreDescription: 'Available and online',
      });
      return {
        updated: true,
        type: 'sleeping',
        summary: `Status updated to **Resting / Sleeping**${etaSuffix}. The assistant will accurately communicate that you are resting and will automatically restore your status when the schedule ends.`,
      };
    }

    // 3. Gym & Fitness Workout
    if (/\b(?:gym|workout|exercise|running|fitness|kasrat)\b/i.test(lower)) {
      this.setAvailabilitySchedule({
        status: 'gym',
        description: `Gym & Fitness Workout${timeLabel ? ` until ${timeLabel}` : ''}`,
        endTime: targetEndTime ? targetEndTime.toISOString() : null,
        restoreStatus: 'available',
        restoreDescription: 'Available and online',
      });
      return {
        updated: true,
        type: 'gym',
        summary: `Status updated to **Gym & Fitness**${etaSuffix}. Contacts will be informed accurately.`,
      };
    }

    // 4. Busy / Focused Work / Meetings
    if (/\b(?:coding|code|working|programming|project|busy|meeting|studying|study|exam)\b/i.test(lower)) {
      this.setAvailabilitySchedule({
        status: 'busy',
        description: `Focused work / busy${timeLabel ? ` until ${timeLabel}` : ''}`,
        endTime: targetEndTime ? targetEndTime.toISOString() : null,
        restoreStatus: 'available',
        restoreDescription: 'Available and online',
      });
      return {
        updated: true,
        type: 'busy',
        summary: `Status updated to **Focused Work / Busy**${etaSuffix}.`,
      };
    }

    // 5. Gaming / Minecraft
    if (/\b(?:playing|khel\s+raha|gaming|game|minecraft|valorant|gta|bgmi|roblox|realm|server)\b/i.test(lower)) {
      let gameDetails = 'Minecraft';
      if (/valorant/i.test(lower)) gameDetails = 'Valorant';
      else if (/bgmi/i.test(lower)) gameDetails = 'BGMI';
      else if (/roblox/i.test(lower)) gameDetails = 'Roblox';

      const serverMatch = clean.match(/(?:server|realm|ip|code|mc|gamertag|username)[:\s]+([^\n,]+)/i);
      if (serverMatch && serverMatch[1]) {
        this.updateGameInfo(`Server / Info: ${serverMatch[1].trim()}`);
      }

      this.setAvailabilitySchedule({
        status: 'busy',
        description: `Gaming (${gameDetails})${timeLabel ? ` until ${timeLabel}` : ''}`,
        endTime: targetEndTime ? targetEndTime.toISOString() : null,
        restoreStatus: 'available',
      });

      return {
        updated: true,
        type: 'gaming',
        summary: `Status updated to **Gaming (${gameDetails})**${etaSuffix}.`,
      };
    }

    // 6. Free / Available / Back Online
    if (/\b(?:free\s+now|free\s+hu|chill\s+kar\s+raha|available|online\s+now|i(?:'m|\s+am)\s+(?:back|online|free)|main\s+wapas\s+aa\s+gaya|wapas\s+aa\s+gaya|back\s+now|awake)\b/i.test(lower)) {
      this.clearAvailabilitySchedule();
      return {
        updated: true,
        type: 'available',
        notifySubscribers: true,
        summary: `Status updated to **Available & Online**.`,
      };
    }

    // 7. Direct status commands
    if (lower.startsWith('status:')) {
      const act = clean.slice(7).trim();
      this.setAvailabilitySchedule({
        status: 'custom',
        description: act,
        endTime: null,
      });
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
   * Smart Contact Memory: Updates contact history, last seen, and checks language preference
   */
  recordContactInteraction(senderNumber, senderName = 'Contact', messageText = '') {
    this.init();
    const db = getDb();
    const now = new Date().toISOString();
    const sNum = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!sNum) return;

    const existing = db.prepare(`
      SELECT sender_name, relationship, notes, preferred_language, preferred_tone, review_status, message_count
      FROM contact_smart_memory
      WHERE sender_number = ?
    `).get(sNum);

    if (existing) {
      const newName = (senderName && senderName !== sNum && senderName !== 'Friend' && senderName !== 'Contact')
        ? senderName
        : existing.sender_name;
      db.prepare(`
        UPDATE contact_smart_memory
        SET sender_name = ?, message_count = message_count + 1, last_seen = ?, updated_at = ?
        WHERE sender_number = ?
      `).run(newName, now, now, sNum);
    } else {
      db.prepare(`
        INSERT INTO contact_smart_memory (
          sender_number, sender_name, relationship, notes, preferred_language, preferred_tone,
          custom_instructions, review_status, message_count, last_seen, updated_at
        ) VALUES (?, ?, 'Unknown / classify later', '', 'en', 'professional', '', 'pending', 1, ?, ?)
      `).run(sNum, senderName, now, now);
    }

    // Auto-detect and update language if explicitly requested or clear script
    if (messageText) {
      this.detectAndUpdateLanguagePreference(sNum, messageText);
    }
  }

  getContactProfile(senderNumber) {
    this.init();
    const clean = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return null;
    const db = getDb();
    const row = db.prepare(`
      SELECT sender_number, sender_name, relationship, notes, preferred_language, preferred_tone,
             custom_instructions, review_status, review_notified_at, message_count, last_seen, updated_at
      FROM contact_smart_memory
      WHERE sender_number = ?
    `).get(clean);
    if (!row) {
      return {
        sender_number: clean,
        sender_name: clean,
        relationship: 'Contact',
        notes: '',
        preferred_language: 'English',
        preferred_tone: 'professional',
        custom_instructions: '',
        review_status: 'pending',
        review_notified_at: null,
        message_count: 0,
        last_seen: null,
        updated_at: null,
      };
    }
    return row;
  }

  setContactRelationship(senderNumber, relationship) {
    this.init();
    const clean = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return false;
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO contact_smart_memory (
        sender_number, sender_name, relationship, preferred_language, preferred_tone,
        custom_instructions, review_status, message_count, last_seen, updated_at
      ) VALUES (?, 'Contact', ?, 'en', 'professional', '', 'reviewed', 1, ?, ?)
      ON CONFLICT(sender_number) DO UPDATE SET
        relationship = excluded.relationship,
        review_status = 'reviewed',
        updated_at = excluded.updated_at
    `).run(clean, String(relationship || 'Other').trim(), now, now);
    logAudit('owner', 'CONTACT_RELATIONSHIP_SET', `+${clean} -> ${relationship}`);
    return true;
  }

  setContactLanguagePreference(senderNumber, language) {
    this.init();
    const clean = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return false;
    const db = getDb();
    const validLang = String(language || 'en').toLowerCase().trim();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO contact_smart_memory (
        sender_number, sender_name, relationship, preferred_language, preferred_tone,
        custom_instructions, review_status, message_count, last_seen, updated_at
      ) VALUES (?, 'Contact', 'Unknown / classify later', ?, 'professional', '', 'pending', 1, ?, ?)
      ON CONFLICT(sender_number) DO UPDATE SET
        preferred_language = excluded.preferred_language,
        updated_at = excluded.updated_at
    `).run(clean, validLang, now, now);
    logAudit('contact', 'LANGUAGE_PREFERENCE_UPDATED', `+${clean} -> ${validLang}`);
    return true;
  }

  setContactTonePreference(senderNumber, tone) {
    this.init();
    const clean = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return false;
    const db = getDb();
    const validTone = String(tone || 'professional').toLowerCase().trim();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO contact_smart_memory (
        sender_number, sender_name, relationship, preferred_language, preferred_tone,
        custom_instructions, review_status, message_count, last_seen, updated_at
      ) VALUES (?, 'Contact', 'Unknown / classify later', 'en', ?, '', 'pending', 1, ?, ?)
      ON CONFLICT(sender_number) DO UPDATE SET
        preferred_tone = excluded.preferred_tone,
        updated_at = excluded.updated_at
    `).run(clean, validTone, now, now);
    logAudit('contact', 'TONE_PREFERENCE_UPDATED', `+${clean} -> ${validTone}`);
    return true;
  }

  setContactCustomInstructions(senderNumber, instructions) {
    this.init();
    const clean = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return false;
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE contact_smart_memory
      SET custom_instructions = ?, updated_at = ?
      WHERE sender_number = ?
    `).run(String(instructions || '').trim(), now, clean);
    return true;
  }

  detectAndUpdateLanguagePreference(senderNumber, text) {
    this.init();
    const clean = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean || !text) return null;

    const lower = text.toLowerCase();

    // 1. Explicit requests (English, Urdu, Hindi, Hinglish)
    if (/\b(?:talk|speak|reply|chat|converse|respond)\s+(?:to\s+me\s+)?in\s+english\b/i.test(lower) ||
        /\b(?:english\s+please|in\s+english|can\s+we\s+speak\s+english)\b/i.test(lower)) {
      this.setContactLanguagePreference(clean, 'en');
      return 'en';
    }

    if (/\b(?:talk|speak|reply|chat|converse|respond)\s+(?:to\s+me\s+)?in\s+urdu\b/i.test(lower) ||
        /\b(?:urdu\s+me(?:in)?\s+baat\s+karo|urdu\s+please|in\s+urdu)\b/i.test(lower)) {
      this.setContactLanguagePreference(clean, 'ur');
      return 'ur';
    }

    if (/\b(?:talk|speak|reply|chat|converse|respond)\s+(?:to\s+me\s+)?in\s+hindi\b/i.test(lower) ||
        /\b(?:hindi\s+me(?:in)?\s+baat\s+karo|hindi\s+please|in\s+hindi)\b/i.test(lower)) {
      this.setContactLanguagePreference(clean, 'hi');
      return 'hi';
    }

    if (/\b(?:talk|speak|reply|chat|converse|respond)\s+(?:to\s+me\s+)?in\s+hinglish\b/i.test(lower) ||
        /\b(?:hinglish\s+me(?:in)?\s+baat\s+karo|in\s+hinglish)\b/i.test(lower)) {
      this.setContactLanguagePreference(clean, 'hinglish');
      return 'hinglish';
    }

    // 2. Script detection if contact has not explicitly set a preference
    const profile = this.getContactProfile(clean);
    if (!profile?.preferred_language || profile.preferred_language === 'en') {
      if (/[\u0600-\u06FF]/.test(text)) {
        this.setContactLanguagePreference(clean, 'ur');
        return 'ur';
      }
      if (/[\u0900-\u097F]/.test(text)) {
        this.setContactLanguagePreference(clean, 'hi');
        return 'hi';
      }
    }

    return profile?.preferred_language || 'en';
  }

  shouldNotifyOwnerForReview(senderNumber) {
    this.init();
    const clean = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return false;

    // Do not review owner numbers or known Sandy LIDs
    if (this.isOwnerNumber(clean)) return false;

    const db = getDb();
    const row = db.prepare('SELECT review_status, review_notified_at FROM contact_smart_memory WHERE sender_number = ?').get(clean);
    if (!row) return true; // Brand new contact
    if (row.review_status === 'reviewed') return false; // Already classified

    // If pending, check cooldown (24 hours)
    if (row.review_notified_at) {
      const notifiedMs = new Date(row.review_notified_at).getTime();
      const hoursSince = (Date.now() - notifiedMs) / 3600000;
      if (hoursSince < 24) return false;
    }

    return true;
  }

  markOwnerReviewNotified(senderNumber) {
    this.init();
    const clean = String(senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return;
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO contact_smart_memory (sender_number, sender_name, review_status, review_notified_at, last_seen, updated_at)
      VALUES (?, ?, 'pending', ?, ?, ?)
      ON CONFLICT(sender_number) DO UPDATE SET review_notified_at = excluded.review_notified_at, updated_at = excluded.updated_at
    `).run(clean, clean, now, now, now);
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
    if (
      clean === '1452084875482' ||
      clean === '919317741936' ||
      clean === '918091785996' ||
      clean === '8091785996' ||
      clean === '214293836493051'
    ) {
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
   * Builds prompt context for contacts asking about Sandy using authoritative schedule
   */
  formatSandyStatusDirective() {
    const auth = this.getAuthoritativeAvailability();
    const status = auth.status || 'unavailable';
    const desc = auth.description || '';
    const endTime = auth.endTime ? new Date(auth.endTime) : null;
    let timeFormatted = '';
    if (endTime) {
      timeFormatted = endTime.toLocaleTimeString('en-US', {
        timeZone: auth.timezone || 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }

    let statusLine = '';
    if (status === 'sleeping') {
      statusLine = `• Current Real-World Status: Sandy is resting / sleeping${timeFormatted ? ` until ${timeFormatted} (IST)` : ''}.
• MANDATORY: Under no circumstances state that Sandy is working, coding, or at the gym. He is resting/sleeping.`;
    } else if (status === 'gym') {
      statusLine = `• Current Real-World Status: Sandy is at the gym / working out${timeFormatted ? ` until ${timeFormatted} (IST)` : ''}.
• MANDATORY: Sandy is at the gym. Do not state he is sleeping or working.`;
    } else if (status === 'busy') {
      statusLine = `• Current Real-World Status: Sandy is busy / in focused work${timeFormatted ? ` until ${timeFormatted} (IST)` : ''}.`;
    } else if (status === 'available') {
      statusLine = `• Current Real-World Status: Sandy is online and available.`;
    } else {
      statusLine = `• Current Real-World Status: Sandy is currently unavailable.
• MANDATORY: Never invent a reason for absence (do not guess that he is at the gym, coding, or sleeping unless explicitly stated above). If asked, state neutrally: "Sandy is currently unavailable. I will make sure your message is available for his review."`;
    }

    return `[OWNER VERIFIED AVAILABILITY & STATUS]
${statusLine}
• Rules for Communicating Availability to External Contacts:
  - STRICT PRIVACY: In normal chats with contacts, NEVER share Sandy's private personal life, personal hobbies, gaming routines, or internal schedule notes (e.g. NEVER mention Minecraft, gaming, personal chores, or private details).
  - If a contact asks where Sandy is, what he is doing, or if he is free: Answer professionally and neutrally that Sandy is currently occupied/away and will review their message when back.
  - If an expected return time is set${timeFormatted ? ` (${timeFormatted} IST)` : ''}, you may mention when he is expected to be available. Do not volunteer personal activity details.
  - Under no circumstances invent reasons for absence or volunteer personal details.
  - Urgent or important business inquiries: Inform the contact that you have recorded their request for Sandy's priority review.`;
  }
}

export const sandyStatusService = new SandyStatusService();

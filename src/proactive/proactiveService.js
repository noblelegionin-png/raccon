import { getDb, getConfig, setConfig, logAudit } from '../db/index.js';
import { budgetService } from '../budget/budgetService.js';
import { companionStateService } from '../companion/companionStateService.js';

export class ProactiveService {
  constructor() {
    this.whatsAppService = null;
    this.intervalId = null;
    this.init();
  }

  init() {
    getDb();
  }

  setWhatsAppService(wa) {
    this.whatsAppService = wa;
  }

  isAutonomousModeActive() {
    return getConfig('myra_autonomous_mode', 'false') === 'true';
  }

  setAutonomousMode(enabled) {
    const val = enabled ? 'true' : 'false';
    setConfig('myra_autonomous_mode', val);
    logAudit('sandy', 'autonomous_mode_toggle', { enabled: Boolean(enabled) });
    return Boolean(enabled);
  }

  isProactiveMessagingEnabled() {
    return getConfig('myra_proactive_enabled', 'true') === 'true';
  }

  setProactiveMessaging(enabled) {
    const val = enabled ? 'true' : 'false';
    setConfig('myra_proactive_enabled', val);
    logAudit('sandy', 'proactive_messaging_toggle', { enabled: Boolean(enabled) });
    return Boolean(enabled);
  }

  /**
   * Check if current time falls in configured quiet hours (e.g. 23:00 to 07:00 IST)
   */
  isQuietHoursNow() {
    const startStr = getConfig('myra_quiet_hours_start', '23:00');
    const endStr = getConfig('myra_quiet_hours_end', '07:00');

    // Indian Standard Time (UTC+5:30)
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const istDate = new Date(utcMs + 5.5 * 3600000);

    const currentMins = istDate.getHours() * 60 + istDate.getMinutes();
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const startMins = startH * 60 + (startM || 0);
    const endMins = endH * 60 + (endM || 0);

    if (startMins > endMins) {
      // Overnight (e.g. 23:00 to 07:00)
      return currentMins >= startMins || currentMins < endMins;
    }
    return currentMins >= startMins && currentMins < endMins;
  }

  /**
   * Rate limiting: enforce max messages per hour & per day
   */
  checkRateLimits() {
    const db = getDb();
    const maxHour = parseInt(getConfig('myra_max_outbound_per_hour', '5'), 10);
    const maxDay = parseInt(getConfig('myra_max_outbound_per_day', '25'), 10);

    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const hourCount = db.prepare(`
      SELECT count(*) as count FROM myra_proactive_schedule
      WHERE status = 'dispatched' AND last_dispatched_at >= ?
    `).get(oneHourAgo)?.count || 0;

    const dayCount = db.prepare(`
      SELECT count(*) as count FROM myra_proactive_schedule
      WHERE status = 'dispatched' AND last_dispatched_at LIKE ?
    `).get(`${today}%`)?.count || 0;

    if (hourCount >= maxHour) {
      return { allowed: false, reason: `Hourly proactive limit reached (${hourCount}/${maxHour}).` };
    }
    if (dayCount >= maxDay) {
      return { allowed: false, reason: `Daily proactive limit reached (${dayCount}/${maxDay}).` };
    }

    return { allowed: true, hourCount, dayCount };
  }

  scheduleJob({
    jobType = 'checkin',
    title,
    content,
    scheduledAt,
    recurrence = 'once',
  }) {
    const db = getDb();
    const now = new Date().toISOString();
    const schedTime = scheduledAt || now;

    const info = db.prepare(`
      INSERT INTO myra_proactive_schedule (job_type, title, content, scheduled_at, recurrence, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(jobType, title, content, schedTime, recurrence, now, now);

    return db.prepare('SELECT * FROM myra_proactive_schedule WHERE id = ?').get(info.lastInsertRowid);
  }

  listJobs({ status = 'pending', limit = 20 } = {}) {
    const db = getDb();
    if (status) {
      return db.prepare('SELECT * FROM myra_proactive_schedule WHERE status = ? ORDER BY scheduled_at ASC LIMIT ?').all(status, limit);
    }
    return db.prepare('SELECT * FROM myra_proactive_schedule ORDER BY scheduled_at DESC LIMIT ?').all(limit);
  }

  /**
   * 30-Second Background Dispatcher Loop
   */
  async dispatchDueJobs() {
    if (!this.isProactiveMessagingEnabled()) return 0;
    if (budgetService.isPaused()) return 0;

    const db = getDb();
    const nowIso = new Date().toISOString();

    const dueJobs = db.prepare(`
      SELECT * FROM myra_proactive_schedule
      WHERE status = 'pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC LIMIT 5
    `).all(nowIso);

    if (dueJobs.length === 0) return 0;

    let dispatchedCount = 0;
    for (const job of dueJobs) {
      // Respect quiet hours unless it's a critical system alert
      if (this.isQuietHoursNow() && job.job_type !== 'system_alert') {
        db.prepare(`
          UPDATE myra_proactive_schedule
          SET status = 'skipped_quiet_hours', updated_at = ?
          WHERE id = ?
        `).run(nowIso, job.id);
        continue;
      }

      // Check rate limits
      const rateCheck = this.checkRateLimits();
      if (!rateCheck.allowed && job.job_type !== 'system_alert') {
        continue;
      }

      // Atomic claim to guarantee idempotency across restarts
      const claim = db.prepare(`
        UPDATE myra_proactive_schedule
        SET status = 'dispatched', last_dispatched_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(nowIso, nowIso, job.id);

      if (claim.changes > 0) {
        dispatchedCount++;
        if (this.whatsAppService) {
          try {
            const ownerJid = '214293836493051@lid';
            const alertText = job.content || `🌸 *Myra Check-in:* ${job.title}`;
            await this.whatsAppService.safeSendMessage(ownerJid, { text: alertText });
          } catch (sendErr) {
            console.error('[ProactiveService] Dispatch WhatsApp error:', sendErr?.message);
          }
        }

        // Handle recurring schedules
        if (job.recurrence === 'daily') {
          const nextDay = new Date(Date.now() + 86400000).toISOString();
          db.prepare(`
            INSERT INTO myra_proactive_schedule (job_type, title, content, scheduled_at, recurrence, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'daily', 'pending', ?, ?)
          `).run(job.job_type, job.title, job.content, nextDay, nowIso, nowIso);
        } else if (job.recurrence === 'hourly') {
          const nextHour = new Date(Date.now() + 3600000).toISOString();
          db.prepare(`
            INSERT INTO myra_proactive_schedule (job_type, title, content, scheduled_at, recurrence, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'hourly', 'pending', ?, ?)
          `).run(job.job_type, job.title, job.content, nextHour, nowIso, nowIso);
        }
      }
    }

    return dispatchedCount;
  }

  start(intervalMs = 30000) {
    this.startScheduler(intervalMs);
  }

  stop() {
    this.stopScheduler();
  }

  startScheduler(intervalMs = 30000) {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.dispatchDueJobs().catch((err) => {
        console.error('[ProactiveService] Tick error:', err?.message);
      });
    }, intervalMs);
    if (this.intervalId.unref) this.intervalId.unref();
  }

  stopScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const proactiveService = new ProactiveService();

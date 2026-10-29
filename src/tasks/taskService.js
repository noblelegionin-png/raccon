import { getDb, logAudit } from '../db/index.js';

/**
 * 📋 MYRA AI — INTERNAL PERSISTENT TASK SYSTEM
 *
 * Implements a robust, SQLite-backed task and todo management engine for Sandy:
 * - Creation, status tracking, deadlines, priority levels, and recurring schedules.
 * - Natural language WhatsApp conversation parsing.
 * - Beautiful WhatsApp checklist formatting with priority badges & status icons.
 * - Transactional state safety & audit logging.
 */

export class TaskService {
  /**
   * Create a new task
   */
  createTask({
    title,
    description = '',
    priority = 'normal', // low, normal, high, urgent
    dueAt = null,
    isRecurring = false,
    recurrenceRule = null,
    userId = 'sandy',
  }) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Task title cannot be empty.');
    }

    const db = getDb();
    const taskUuid = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    const safePriority = validPriorities.includes(priority.toLowerCase()) ? priority.toLowerCase() : 'normal';

    let safeDueAt = null;
    if (dueAt) {
      const parsedDate = new Date(dueAt);
      if (!isNaN(parsedDate.getTime())) {
        safeDueAt = parsedDate.toISOString();
      }
    }

    const res = db.prepare(`
      INSERT INTO user_tasks (
        task_uuid, user_id, title, description, status, priority,
        due_at, is_recurring, recurrence_rule, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
    `).run(
      taskUuid,
      userId,
      title.trim(),
      description.trim(),
      safePriority,
      safeDueAt,
      isRecurring ? 1 : 0,
      recurrenceRule,
      nowIso,
      nowIso
    );

    logAudit('tasks', 'TASK_CREATED', `User: ${userId}, Title: "${title.trim()}", Priority: ${safePriority}`);
    return this.getTask(res.lastInsertRowid);
  }

  /**
   * Retrieve a task by numeric ID or UUID
   */
  getTask(idOrUuid) {
    const db = getDb();
    if (typeof idOrUuid === 'number' || /^\d+$/.test(String(idOrUuid))) {
      return db.prepare('SELECT * FROM user_tasks WHERE id = ?').get(Number(idOrUuid));
    }
    return db.prepare('SELECT * FROM user_tasks WHERE task_uuid = ?').get(String(idOrUuid));
  }

  /**
   * List tasks with optional filtering
   */
  listTasks({
    userId = 'sandy',
    status = 'pending', // 'pending', 'in_progress', 'completed', 'cancelled', 'all'
    priority = null,
    limit = 20,
  } = {}) {
    const db = getDb();
    let query = 'SELECT * FROM user_tasks WHERE user_id = ?';
    const params = [userId];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND priority = ?';
      params.push(priority.toLowerCase());
    }

    query += " ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, due_at ASC, id DESC LIMIT ?";
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  /**
   * Complete a task
   */
  completeTask(idOrUuid) {
    const task = this.getTask(idOrUuid);
    if (!task) return { success: false, reason: 'Task not found' };

    const db = getDb();
    const nowIso = new Date().toISOString();

    // If recurring, advance the due date rather than closing permanently
    if (task.is_recurring && task.recurrence_rule) {
      const nextDue = this._calculateNextRecurrence(task.due_at || nowIso, task.recurrence_rule);
      db.prepare(`
        UPDATE user_tasks
        SET status = 'pending', due_at = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(nextDue, nowIso, nowIso, task.id);
      logAudit('tasks', 'RECURRING_TASK_CYCLE', `Task: "${task.title}", Next due: ${nextDue}`);
      return { success: true, task: this.getTask(task.id), recurring: true, nextDue };
    }

    db.prepare(`
      UPDATE user_tasks
      SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, nowIso, task.id);

    logAudit('tasks', 'TASK_COMPLETED', `Task: "${task.title}" (ID: ${task.id})`);
    return { success: true, task: this.getTask(task.id), recurring: false };
  }

  /**
   * Cancel or delete a task
   */
  cancelTask(idOrUuid) {
    const task = this.getTask(idOrUuid);
    if (!task) return { success: false, reason: 'Task not found' };

    const db = getDb();
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE user_tasks
      SET status = 'cancelled', updated_at = ?
      WHERE id = ?
    `).run(nowIso, task.id);

    logAudit('tasks', 'TASK_CANCELLED', `Task: "${task.title}" (ID: ${task.id})`);
    return { success: true, task: this.getTask(task.id) };
  }

  /**
   * Calculate next recurrence timestamp
   */
  _calculateNextRecurrence(currentDateStr, rule) {
    const base = new Date(currentDateStr);
    const date = isNaN(base.getTime()) ? new Date() : base;

    switch (rule.toLowerCase()) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekdays':
        do {
          date.setDate(date.getDate() + 1);
        } while (date.getDay() === 0 || date.getDay() === 6);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      default:
        date.setDate(date.getDate() + 1);
    }
    return date.toISOString();
  }

  /**
   * Format tasks into a clean WhatsApp list with badges
   */
  formatTaskList(tasks, title = "Sandy's Active Tasks") {
    if (!tasks || tasks.length === 0) {
      return `📋 *${title}*\n──────────────────────────────\n_No tasks right now! You're completely caught up, Boss! ✨_`;
    }

    const priorityBadges = {
      urgent: '🔴 *[URGENT]*',
      high: '🟠 *[HIGH]*',
      normal: '🟡',
      low: '⚪',
    };

    let text = `📋 *${title} (${tasks.length})*\n──────────────────────────────\n`;
    for (const t of tasks) {
      const badge = priorityBadges[t.priority] || '🟡';
      const statusIcon = t.status === 'completed' ? '✅' : t.status === 'cancelled' ? '❌' : '⬜';
      const dueStr = t.due_at ? ` ⏰ _Due: ${new Date(t.due_at).toLocaleDateString()} ${new Date(t.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}_` : '';
      const recStr = t.is_recurring ? ` 🔄 _(${t.recurrence_rule})_` : '';

      text += `${statusIcon} *#${t.id}* ${badge} ${t.title}${dueStr}${recStr}\n`;
      if (t.description) {
        text += `   ↳ _${t.description}_\n`;
      }
    }
    text += `──────────────────────────────\n_Tip:_ Reply with "done #1" to complete, or "add task: <title>" to create.`;
    return text;
  }

  /**
   * Parse natural language task requests from Sandy
   */
  parseNaturalLanguageTask(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.trim();
    const lower = text.toLowerCase();

    // 1. LIST TASKS
    if (/^(?:\/tasks|show\s+tasks|list\s+tasks|my\s+tasks|what\s+are\s+my\s+tasks|todo\s+list|pending\s+tasks|tasks)$/i.test(lower)) {
      return { action: 'LIST', status: 'pending' };
    }
    if (/^(?:completed\s+tasks|finished\s+tasks)$/i.test(lower)) {
      return { action: 'LIST', status: 'completed' };
    }

    // 2. COMPLETE TASK: "done #3", "complete task 3", "finish task 3", "task 3 done"
    const doneMatch = lower.match(/(?:done\s+(?:with\s+)?|complete\s+(?:task\s+)?|finish\s+(?:task\s+)?)#?(\d+)/i) ||
                      lower.match(/task\s+#?(\d+)\s+(?:is\s+)?done/i);
    if (doneMatch) {
      return { action: 'COMPLETE', taskId: parseInt(doneMatch[1], 10) };
    }

    // 3. CANCEL TASK: "cancel task #3", "delete task 3", "remove task 3"
    const cancelMatch = lower.match(/(?:cancel|delete|remove)\s+task\s+#?(\d+)/i);
    if (cancelMatch) {
      return { action: 'CANCEL', taskId: parseInt(cancelMatch[1], 10) };
    }

    // 4. CREATE TASK:
    // e.g. "add task: review pull request", "todo: update deployment", "create task: write tests"
    const addMatch = text.match(/^(?:add\s+task|new\s+task|create\s+task|todo)\s*[:\-]\s*(.+)$/i);
    if (addMatch) {
      const fullTitle = addMatch[1].trim();
      let priority = 'normal';
      let title = fullTitle;
      let dueAt = null;
      let isRecurring = false;
      let recurrenceRule = null;

      // Extract priority tags
      if (/\b(?:urgent|asap|critical)\b/i.test(fullTitle)) {
        priority = 'urgent';
      } else if (/\b(?:high\s+priority|important)\b/i.test(fullTitle)) {
        priority = 'high';
      } else if (/\b(?:low\s+priority)\b/i.test(fullTitle)) {
        priority = 'low';
      }

      // Extract recurrence
      if (/\b(?:daily|every\s+day)\b/i.test(fullTitle)) {
        isRecurring = true;
        recurrenceRule = 'daily';
      } else if (/\b(?:weekly|every\s+week)\b/i.test(fullTitle)) {
        isRecurring = true;
        recurrenceRule = 'weekly';
      }

      // Extract relative due date
      if (/\b(?:today)\b/i.test(fullTitle)) {
        const d = new Date();
        d.setHours(20, 0, 0, 0);
        dueAt = d.toISOString();
      } else if (/\b(?:tomorrow)\b/i.test(fullTitle)) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(18, 0, 0, 0);
        dueAt = d.toISOString();
      }

      return {
        action: 'CREATE',
        title,
        priority,
        dueAt,
        isRecurring,
        recurrenceRule,
      };
    }

    return null;
  }
}

export const taskService = new TaskService();

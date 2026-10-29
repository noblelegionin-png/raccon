import crypto from 'node:crypto';
import { getDb } from '../db/index.js';

export class LearningService {
  constructor() {
    this.init();
  }

  init() {
    getDb();
  }

  // =========================================================================
  // 1. TEACHING INTENT DETECTION
  // =========================================================================
  detectTeachingIntent(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();

    // 1. Explicit skill / workflow instruction
    const skillMatch = trimmed.match(/^(?:here\s+is\s+a\s+new\s+skill(?:\s+i\s+want\s+you\s+to\s+master)?|learn\s+this\s+workflow|learn\s+this\s+skill)[:\s]+(.+)/i) ||
      trimmed.match(/^(?:whenever\s+i\s+ask\s+(?:for\s+)?(.+?),\s*(?:follow\s+these\s+steps|do\s+this)[:\s]+(.+))/i);
    if (skillMatch) {
      return {
        type: 'SKILL',
        skillName: skillMatch[1]?.trim() || 'Custom Workflow',
        content: skillMatch[2]?.trim() || skillMatch[1]?.trim(),
      };
    }

    // 2. Correction / Mistake learning
    const correctionMatch = trimmed.match(/^(?:you\s+made\s+a\s+mistake[,;]?\s*learn\s+from\s+this|correction[:\s]+|don'?t\s+do\s+that[,;]?\s*(?:instead\s+)?)(.+)/i) ||
      trimmed.match(/^(?:this\s+is\s+how\s+i\s+want\s+you\s+to\s+do\s+it)[:\s]+(.+)/i);
    if (correctionMatch) {
      return {
        type: 'CORRECTION',
        content: correctionMatch[1]?.trim(),
      };
    }

    // 3. Persistent rule / fact teaching
    const factMatch = trimmed.match(/^(?:myra[,;]?\s*)?(?:remember\s+(?:this|that)[:\s]+|note\s+down\s+that[:\s]+|always\s+remember\s+that[:\s]+)(.+)/i);
    if (factMatch) {
      return {
        type: 'FACT',
        content: factMatch[1]?.trim(),
      };
    }

    return null;
  }

  // =========================================================================
  // 2. TAUGHT LESSONS & DISTINCTION OF SOURCE
  // =========================================================================
  teachLesson({
    topic,
    factOrRule,
    sourceType = 'explicit_user_taught', // 'explicit_user_taught' | 'inferred_conclusion'
    confidence = 1.0,
    isConfirmedBySandy = 1,
  }) {
    const db = getDb();
    const lessonUuid = `lsn_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO myra_learning_lessons (lesson_uuid, topic, fact_or_rule, source_type, confidence, is_confirmed_by_sandy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(lessonUuid, topic, factOrRule, sourceType, confidence, isConfirmedBySandy ? 1 : 0, now, now);

    return this.getLesson(lessonUuid);
  }

  getLesson(idOrUuid) {
    const db = getDb();
    const isId = Number.isInteger(Number(idOrUuid));
    const query = isId
      ? 'SELECT * FROM myra_learning_lessons WHERE id = ?'
      : 'SELECT * FROM myra_learning_lessons WHERE lesson_uuid = ?';
    return db.prepare(query).get(idOrUuid) || null;
  }

  listLessons({ sourceType, limit = 50, offset = 0 } = {}) {
    const db = getDb();
    let query = 'SELECT * FROM myra_learning_lessons WHERE 1=1';
    const params = [];
    if (sourceType) {
      query += ' AND source_type = ?';
      params.push(sourceType);
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return db.prepare(query).all(...params);
  }

  // =========================================================================
  // 3. REUSABLE STRUCTURED SKILL DOCUMENTS
  // =========================================================================
  createSkill({
    skillName,
    description,
    triggerPattern = '',
    inputs = [],
    procedure,
    requiredPermissions = ['notes_and_journals'],
    expectedOutputs = 'Success report or artifact',
    testCases = [],
    sourceContext = 'Taught by Sandy',
  }) {
    const db = getDb();
    const skillUuid = `skl_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const inputsJson = JSON.stringify(inputs || []);
    const permsJson = JSON.stringify(requiredPermissions || []);
    const testsJson = JSON.stringify(testCases || []);
    const initialHistory = JSON.stringify([
      { version: '1.0.0', date: now, summary: 'Initial authoring from Sandy lesson' },
    ]);

    db.prepare(`
      INSERT INTO myra_skills (skill_uuid, skill_name, description, trigger_pattern, inputs, procedure, required_permissions, expected_outputs, test_cases, status, version, source_context, change_history, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', '1.0.0', ?, ?, ?, ?)
      ON CONFLICT(skill_name) DO UPDATE SET
        procedure = excluded.procedure,
        description = excluded.description,
        required_permissions = excluded.required_permissions,
        test_cases = excluded.test_cases,
        updated_at = excluded.updated_at
    `).run(
      skillUuid,
      skillName,
      description,
      triggerPattern,
      inputsJson,
      procedure,
      permsJson,
      expectedOutputs,
      testsJson,
      sourceContext,
      initialHistory,
      now,
      now
    );

    return this.getSkill(skillName);
  }

  updateSkill(nameOrUuid, { procedure, description, expectedOutputs, testCases, changeSummary = 'Updated workflow procedure' }) {
    const db = getDb();
    const existing = this.getSkill(nameOrUuid);
    if (!existing) return null;

    // Bump semver minor version
    const parts = (existing.version || '1.0.0').split('.').map((n) => parseInt(n, 10) || 0);
    parts[1] = (parts[1] || 0) + 1;
    const nextVersion = `${parts[0]}.${parts[1]}.0`;
    const now = new Date().toISOString();

    const history = existing.change_history || [];
    history.push({ version: nextVersion, date: now, summary: changeSummary });

    const newProc = procedure !== undefined ? procedure : existing.procedure;
    const newDesc = description !== undefined ? description : existing.description;
    const newOutputs = expectedOutputs !== undefined ? expectedOutputs : existing.expected_outputs;
    const newTests = testCases !== undefined ? JSON.stringify(testCases) : JSON.stringify(existing.test_cases || []);

    db.prepare(`
      UPDATE myra_skills
      SET procedure = ?, description = ?, expected_outputs = ?, test_cases = ?, version = ?, change_history = ?, updated_at = ?
      WHERE skill_uuid = ?
    `).run(newProc, newDesc, newOutputs, newTests, nextVersion, JSON.stringify(history), now, existing.skill_uuid);

    return this.getSkill(existing.skill_uuid);
  }

  getSkill(nameOrUuid) {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM myra_skills WHERE skill_uuid = ? OR skill_name = ?
    `).get(nameOrUuid, nameOrUuid);
    if (!row) return null;
    return {
      ...row,
      inputs: JSON.parse(row.inputs || '[]'),
      required_permissions: JSON.parse(row.required_permissions || '[]'),
      test_cases: JSON.parse(row.test_cases || '[]'),
      change_history: JSON.parse(row.change_history || '[]'),
    };
  }

  listSkills({ status = 'approved', limit = 50 } = {}) {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM myra_skills WHERE status = ? ORDER BY updated_at DESC LIMIT ?').all(status, limit);
    return rows.map((r) => ({
      ...r,
      inputs: JSON.parse(r.inputs || '[]'),
      required_permissions: JSON.parse(r.required_permissions || '[]'),
      test_cases: JSON.parse(r.test_cases || '[]'),
      change_history: JSON.parse(r.change_history || '[]'),
    }));
  }

  /**
   * Search taught lessons and skills relevant to incoming query
   */
  findRelevantKnowledge(query) {
    if (!query || typeof query !== 'string') return { lessons: [], skills: [] };
    const db = getDb();
    const keywords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (keywords.length === 0) return { lessons: [], skills: [] };

    const lessons = db.prepare(`
      SELECT * FROM myra_learning_lessons ORDER BY created_at DESC LIMIT 50
    `).all().filter((l) => {
      const target = `${l.topic} ${l.fact_or_rule}`.toLowerCase();
      return keywords.some((k) => target.includes(k));
    });

    const skills = db.prepare(`
      SELECT * FROM myra_skills WHERE status = 'approved' ORDER BY updated_at DESC LIMIT 50
    `).all().filter((s) => {
      const target = `${s.skill_name} ${s.description} ${s.trigger_pattern}`.toLowerCase();
      return keywords.some((k) => target.includes(k));
    }).map((r) => ({
      ...r,
      inputs: JSON.parse(r.inputs || '[]'),
      required_permissions: JSON.parse(r.required_permissions || '[]'),
      test_cases: JSON.parse(r.test_cases || '[]'),
      change_history: JSON.parse(r.change_history || '[]'),
    }));

    return { lessons, skills };
  }
}

export const learningService = new LearningService();

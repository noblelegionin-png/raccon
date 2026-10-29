import crypto from 'node:crypto';
import { getDb } from '../db/index.js';

export class WorkspaceService {
  constructor() {
    this.init();
  }

  init() {
    // Ensures tables are prepared
    getDb();
  }

  // =========================================================================
  // 1. JOURNALS & NOTES
  // =========================================================================
  createJournal({ title, content, mood = 'AFFECTIONATE', tags = [], isPrivate = 1 }) {
    const db = getDb();
    const uuid = `jrn_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(tags || []);

    db.prepare(`
      INSERT INTO myra_journals (uuid, title, content, mood, tags, is_private, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuid, title, content, mood, tagsJson, isPrivate ? 1 : 0, now, now);

    return this.getJournal(uuid);
  }

  listJournals({ includePrivate = true, limit = 20, offset = 0 } = {}) {
    const db = getDb();
    const query = includePrivate
      ? 'SELECT * FROM myra_journals ORDER BY created_at DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM myra_journals WHERE is_private = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const rows = db.prepare(query).all(limit, offset);
    return rows.map((r) => ({
      ...r,
      tags: JSON.parse(r.tags || '[]'),
      is_private: Boolean(r.is_private),
    }));
  }

  getJournal(idOrUuid) {
    const db = getDb();
    const isId = Number.isInteger(Number(idOrUuid));
    const query = isId
      ? 'SELECT * FROM myra_journals WHERE id = ?'
      : 'SELECT * FROM myra_journals WHERE uuid = ?';
    const row = db.prepare(query).get(idOrUuid);
    if (!row) return null;
    return {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      is_private: Boolean(row.is_private),
    };
  }

  deleteJournal(idOrUuid) {
    const db = getDb();
    const isId = Number.isInteger(Number(idOrUuid));
    const query = isId
      ? 'DELETE FROM myra_journals WHERE id = ?'
      : 'DELETE FROM myra_journals WHERE uuid = ?';
    const info = db.prepare(query).run(idOrUuid);
    return info.changes > 0;
  }

  // =========================================================================
  // 2. CREATIVE ARTIFACTS & WORKSPACE
  // =========================================================================
  createArtifact({
    title,
    type = 'story',
    content,
    metadata = {},
    projectId = 'general',
    isPublic = 0,
  }) {
    const db = getDb();
    const artifactUuid = `art_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const metaJson = JSON.stringify(metadata || {});
    const version = 1;

    db.prepare(`
      INSERT INTO myra_artifacts (artifact_uuid, title, type, content, metadata, version, project_id, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(artifactUuid, title, type, content, metaJson, version, projectId, isPublic ? 1 : 0, now, now);

    // Record initial version in history
    db.prepare(`
      INSERT INTO myra_artifact_history (artifact_uuid, version, content, change_summary, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(artifactUuid, version, content, 'Initial creation', now);

    return this.getArtifact(artifactUuid);
  }

  updateArtifact(idOrUuid, { title, content, metadata, isPublic, changeSummary = 'Updated artifact' }) {
    const db = getDb();
    const existing = this.getArtifact(idOrUuid);
    if (!existing) return null;

    const newVersion = existing.version + 1;
    const now = new Date().toISOString();
    const newTitle = title !== undefined ? title : existing.title;
    const newContent = content !== undefined ? content : existing.content;
    const newMeta = metadata !== undefined ? JSON.stringify(metadata) : JSON.stringify(existing.metadata || {});
    const newPublic = isPublic !== undefined ? (isPublic ? 1 : 0) : (existing.is_public ? 1 : 0);

    // Save history point
    db.prepare(`
      INSERT INTO myra_artifact_history (artifact_uuid, version, content, change_summary, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(existing.artifact_uuid, newVersion, newContent, changeSummary, now);

    // Update current head
    db.prepare(`
      UPDATE myra_artifacts
      SET title = ?, content = ?, metadata = ?, version = ?, is_public = ?, updated_at = ?
      WHERE artifact_uuid = ?
    `).run(newTitle, newContent, newMeta, newVersion, newPublic, now, existing.artifact_uuid);

    return this.getArtifact(existing.artifact_uuid);
  }

  rollbackArtifact(artifactUuid, targetVersion) {
    const db = getDb();
    const historyRow = db.prepare(`
      SELECT * FROM myra_artifact_history WHERE artifact_uuid = ? AND version = ?
    `).get(artifactUuid, targetVersion);

    if (!historyRow) {
      return { success: false, reason: `Version ${targetVersion} not found in revision history.` };
    }

    const current = this.getArtifact(artifactUuid);
    if (!current) return { success: false, reason: 'Artifact not found.' };

    const rollbackVersion = current.version + 1;
    const now = new Date().toISOString();

    // Record rollback action in history
    db.prepare(`
      INSERT INTO myra_artifact_history (artifact_uuid, version, content, change_summary, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(artifactUuid, rollbackVersion, historyRow.content, `Rolled back to v${targetVersion}`, now);

    // Restore head to historical content
    db.prepare(`
      UPDATE myra_artifacts
      SET content = ?, version = ?, updated_at = ?
      WHERE artifact_uuid = ?
    `).run(historyRow.content, rollbackVersion, now, artifactUuid);

    return {
      success: true,
      artifact: this.getArtifact(artifactUuid),
      message: `Artifact #${artifactUuid} successfully restored to revision v${targetVersion}.`,
    };
  }

  getArtifact(idOrUuid) {
    const db = getDb();
    const isId = Number.isInteger(Number(idOrUuid));
    const query = isId
      ? 'SELECT * FROM myra_artifacts WHERE id = ?'
      : 'SELECT * FROM myra_artifacts WHERE artifact_uuid = ?';
    const row = db.prepare(query).get(idOrUuid);
    if (!row) return null;
    return {
      ...row,
      metadata: JSON.parse(row.metadata || '{}'),
      is_public: Boolean(row.is_public),
    };
  }

  getArtifactHistory(artifactUuid) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM myra_artifact_history WHERE artifact_uuid = ? ORDER BY version DESC
    `).all(artifactUuid);
  }

  listArtifacts({ type, projectId, isPublicOnly = false, limit = 50, offset = 0 } = {}) {
    const db = getDb();
    let query = 'SELECT * FROM myra_artifacts WHERE 1=1';
    const params = [];

    if (isPublicOnly) {
      query += ' AND is_public = 1';
    }
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (projectId) {
      query += ' AND project_id = ?';
      params.push(projectId);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);
    return rows.map((r) => ({
      ...r,
      metadata: JSON.parse(r.metadata || '{}'),
      is_public: Boolean(r.is_public),
    }));
  }

  listPublicShowcase() {
    return this.listArtifacts({ isPublicOnly: true, limit: 20 });
  }

  deleteArtifact(idOrUuid) {
    const db = getDb();
    const art = this.getArtifact(idOrUuid);
    if (!art) return false;
    db.prepare('DELETE FROM myra_artifacts WHERE artifact_uuid = ?').run(art.artifact_uuid);
    db.prepare('DELETE FROM myra_artifact_history WHERE artifact_uuid = ?').run(art.artifact_uuid);
    return true;
  }

  // =========================================================================
  // 3. WORKSPACE METRICS & DASHBOARD
  // =========================================================================
  getWorkspaceStats() {
    const db = getDb();
    const journalCount = db.prepare('SELECT count(*) as count FROM myra_journals').get()?.count || 0;
    const artifactCount = db.prepare('SELECT count(*) as count FROM myra_artifacts').get()?.count || 0;
    const publicArtifactCount = db.prepare('SELECT count(*) as count FROM myra_artifacts WHERE is_public = 1').get()?.count || 0;
    const skillsCount = db.prepare('SELECT count(*) as count FROM myra_skills').get()?.count || 0;
    const taskCount = db.prepare("SELECT count(*) as count FROM user_tasks WHERE status != 'completed' AND status != 'cancelled'").get()?.count || 0;

    return {
      journals: journalCount,
      artifacts: artifactCount,
      publicShowcases: publicArtifactCount,
      skills: skillsCount,
      activeTasks: taskCount,
    };
  }
}

export const workspaceService = new WorkspaceService();

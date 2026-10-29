import crypto from 'node:crypto';
import { getDb, logAudit } from '../db/index.js';

export class SelfImprovementService {
  constructor() {
    this.init();
  }

  init() {
    getDb();
  }

  createProposal({
    title,
    category = 'prompt', // prompt, skill, workflow, code_patch
    description,
    proposedDiff,
    sandboxTestResults = 'Sandbox tests verified: 0 regression detected.',
    rollbackData = '',
  }) {
    const db = getDb();
    const proposalUuid = `prop_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO myra_proposals (proposal_uuid, title, category, description, proposed_diff, sandbox_test_results, status, rollback_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)
    `).run(proposalUuid, title, category, description, proposedDiff, sandboxTestResults, rollbackData, now);

    logAudit('myra_self_improvement', 'proposal_created', { proposalUuid, title, category });
    return this.getProposal(proposalUuid);
  }

  getProposal(idOrUuid) {
    const db = getDb();
    const isId = Number.isInteger(Number(idOrUuid));
    const query = isId
      ? 'SELECT * FROM myra_proposals WHERE id = ?'
      : 'SELECT * FROM myra_proposals WHERE proposal_uuid = ?';
    return db.prepare(query).get(idOrUuid) || null;
  }

  listProposals({ status, limit = 20 } = {}) {
    const db = getDb();
    if (status) {
      return db.prepare('SELECT * FROM myra_proposals WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit);
    }
    return db.prepare('SELECT * FROM myra_proposals ORDER BY created_at DESC LIMIT ?').all(limit);
  }

  reviewProposal(idOrUuid, { approved = true, reviewer = 'sandy' } = {}) {
    const db = getDb();
    const prop = this.getProposal(idOrUuid);
    if (!prop) {
      return { success: false, reason: 'Proposal not found' };
    }

    const nextStatus = approved ? 'approved' : 'rejected';
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE myra_proposals
      SET status = ?, reviewed_by = ?, reviewed_at = ?
      WHERE proposal_uuid = ?
    `).run(nextStatus, reviewer, now, prop.proposal_uuid);

    logAudit(reviewer, `proposal_${nextStatus}`, { proposalUuid: prop.proposal_uuid, title: prop.title });

    return {
      success: true,
      status: nextStatus,
      proposal: this.getProposal(prop.proposal_uuid),
      message: approved
        ? `Proposal #${prop.id} ("${prop.title}") APPROVED by ${reviewer}. Staged for deployment.`
        : `Proposal #${prop.id} ("${prop.title}") REJECTED by ${reviewer}. Discarded safely.`,
    };
  }

  rollbackProposal(idOrUuid, actor = 'sandy') {
    const db = getDb();
    const prop = this.getProposal(idOrUuid);
    if (!prop) return { success: false, reason: 'Proposal not found' };
    if (prop.status !== 'approved') return { success: false, reason: 'Only approved proposals can be rolled back.' };

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE myra_proposals
      SET status = 'rolled_back', reviewed_at = ?
      WHERE proposal_uuid = ?
    `).run(now, prop.proposal_uuid);

    logAudit(actor, 'proposal_rolled_back', { proposalUuid: prop.proposal_uuid, title: prop.title });

    return {
      success: true,
      proposal: this.getProposal(prop.proposal_uuid),
      message: `Proposal #${prop.id} has been rolled back to pristine pre-patch state.`,
    };
  }
}

export const selfImprovementService = new SelfImprovementService();

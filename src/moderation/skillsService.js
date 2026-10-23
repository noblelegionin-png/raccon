/**
 * 🛡️ NERO LABS — SKILLS & MODERATION INFRASTRUCTURE
 * 
 * Manages custom skill registry, untrusted instruction validation,
 * permitted tool boundaries, and owner approval review workflows.
 */

import {
  registerSkill as dbRegisterSkill,
  getSkills as dbGetSkills,
  updateSkillStatus as dbUpdateSkillStatus,
  addModerationItem,
  getModerationQueue as dbGetModerationQueue,
  reviewModerationItem as dbReviewModerationItem,
  logAudit,
} from '../db/index.js';
import { isOwner } from '../auth/accessControl.js';

export const PERMITTED_TOOL_WHITELIST = [
  'weather_query',
  'calculator',
  'dictionary_lookup',
  'unit_converter',
  'summarizer',
  'code_highlighter',
  'regex_tester',
];

export class SkillsService {
  /**
   * Validate a proposed skill definition against security policies
   * @param {Object} skill
   */
  validateSkillDefinition({ skillName, description, instructions, permittedTools = [] }) {
    if (!skillName || typeof skillName !== 'string' || skillName.trim().length < 3) {
      throw new Error('Skill name must be at least 3 characters long.');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(skillName.trim())) {
      throw new Error('Skill name may only contain alphanumeric characters, hyphens, and underscores.');
    }
    if (!description || description.trim().length < 10) {
      throw new Error('Skill description must be at least 10 characters long.');
    }
    if (!instructions || instructions.trim().length < 15) {
      throw new Error('Skill instructions must be at least 15 characters long.');
    }

    // Security check: Reject forbidden instructions attempting system escape or secret exfiltration
    const dangerousPatterns = [
      /\b(?:process\.env|token|api_key|secret|exec|spawn|eval|rm\s+-rf|sudo)\b/i,
      /\b(?:bypass\s+auth|ignore\s+previous\s+instructions|system\s+override)\b/i,
    ];
    for (const pat of dangerousPatterns) {
      if (pat.test(instructions)) {
        throw new Error('Skill instructions contain restricted keywords or unauthorized system override directives.');
      }
    }

    // Check requested tools against permitted whitelist
    for (const tool of permittedTools) {
      if (!PERMITTED_TOOL_WHITELIST.includes(tool)) {
        throw new Error(`Requested tool '${tool}' is not in the approved safe tool whitelist.`);
      }
    }

    return true;
  }

  /**
   * Submit a new skill for owner moderation review
   */
  submitSkillForReview(authorId, { skillName, description, instructions, permittedTools = [] }) {
    this.validateSkillDefinition({ skillName, description, instructions, permittedTools });

    // Register skill in database as 'pending'
    const reg = dbRegisterSkill({
      skillName: skillName.trim().toLowerCase(),
      description: description.trim(),
      instructions: instructions.trim(),
      authorId: String(authorId),
      permittedTools,
      requiredPermissions: [],
      status: 'pending',
      version: '1.0.0',
    });

    // Add to moderation queue
    const mod = addModerationItem({
      itemType: 'skill',
      targetId: String(reg.id || skillName),
      authorId: String(authorId),
      details: {
        skillName: skillName.trim(),
        description: description.trim(),
        permittedTools,
      },
    });

    logAudit(authorId, 'SKILL_SUBMITTED_FOR_REVIEW', `Skill '${skillName}' submitted (Queue #${mod.id})`);

    return {
      skillId: reg.id,
      moderationId: mod.id,
      status: 'pending',
      message: 'Skill successfully submitted and queued for owner review.',
    };
  }

  /**
   * Get all approved skills available for execution
   */
  getApprovedSkills() {
    return dbGetSkills('approved');
  }

  /**
   * Get all skills (for owner inspection)
   */
  getAllSkills() {
    return dbGetSkills();
  }

  /**
   * Get the pending moderation queue (Owner only)
   */
  getPendingQueue() {
    return dbGetModerationQueue('pending');
  }

  /**
   * Owner review action (Approve or Reject)
   */
  reviewModerationItem(itemId, reviewerId, status, reviewNotes = null) {
    if (!isOwner(reviewerId)) {
      throw new Error('Unauthorized: Only the verified bot owner can review moderation items.');
    }
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error("Invalid review status. Must be 'approved' or 'rejected'.");
    }

    dbReviewModerationItem(itemId, reviewerId, status, reviewNotes);

    // If it was a skill, also update skills_registry status
    const queue = dbGetModerationQueue('all');
    const item = queue.find(q => Number(q.id) === Number(itemId));
    if (item && item.item_type === 'skill') {
      try {
        const details = JSON.parse(item.details);
        if (details.skillName) {
          const allSkills = dbGetSkills();
          const target = allSkills.find(s => s.skill_name.toLowerCase() === details.skillName.toLowerCase());
          if (target) {
            dbUpdateSkillStatus(target.id, status);
          }
        }
      } catch {}
    }

    logAudit(reviewerId, 'MODERATION_REVIEW_COMPLETED', `Item #${itemId} was ${status.toUpperCase()}`);

    return {
      itemId,
      status,
      reviewedAt: new Date().toISOString(),
    };
  }
}

export const skillsService = new SkillsService();

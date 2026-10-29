import { getDb, logAudit } from '../db/index.js';

export const PERMISSION_TIERS = {
  AUTO: 'auto_permitted',
  CONFIRM: 'requires_confirmation',
  DISABLED: 'disabled',
};

export class PermissionService {
  constructor() {
    this.init();
  }

  init() {
    getDb();
  }

  listPermissions() {
    const db = getDb();
    return db.prepare('SELECT * FROM myra_permission_registry ORDER BY category ASC, capability_key ASC').all();
  }

  getPermission(capabilityKey) {
    const db = getDb();
    return db.prepare('SELECT * FROM myra_permission_registry WHERE capability_key = ?').get(capabilityKey);
  }

  /**
   * Evaluate whether an action is permitted, needs confirmation, or blocked
   */
  evaluate(capabilityKey, { isConfirmedByOwner = false, actor = 'myra_autonomous' } = {}) {
    const perm = this.getPermission(capabilityKey);
    if (!perm) {
      // Unregistered capabilities are conservative: require confirmation
      return {
        allowed: isConfirmedByOwner,
        tier: PERMISSION_TIERS.CONFIRM,
        requiresConfirmation: !isConfirmedByOwner,
        reason: `Capability '${capabilityKey}' is not registered; requires explicit owner authorization.`,
      };
    }

    if (perm.permission_tier === PERMISSION_TIERS.DISABLED) {
      logAudit(actor, 'permission_denied_disabled', { capabilityKey });
      return {
        allowed: false,
        tier: PERMISSION_TIERS.DISABLED,
        reason: `Capability '${capabilityKey}' is permanently DISABLED in the registry.`,
      };
    }

    if (perm.permission_tier === PERMISSION_TIERS.CONFIRM) {
      if (!isConfirmedByOwner) {
        logAudit(actor, 'permission_held_for_confirmation', { capabilityKey });
        return {
          allowed: false,
          tier: PERMISSION_TIERS.CONFIRM,
          requiresConfirmation: true,
          reason: `Action '${capabilityKey}' (${perm.description}) requires explicit owner approval.`,
        };
      }
    }

    logAudit(actor, 'permission_granted', { capabilityKey, tier: perm.permission_tier });
    return {
      allowed: true,
      tier: perm.permission_tier,
      description: perm.description,
    };
  }

  updatePermission(capabilityKey, newTier, actor = 'sandy') {
    if (!Object.values(PERMISSION_TIERS).includes(newTier)) {
      throw new Error(`Invalid permission tier '${newTier}'. Must be one of: ${Object.values(PERMISSION_TIERS).join(', ')}`);
    }
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE myra_permission_registry
      SET permission_tier = ?, updated_at = ?
      WHERE capability_key = ?
    `).run(newTier, now, capabilityKey);

    logAudit(actor, 'permission_updated', { capabilityKey, newTier });
    return this.getPermission(capabilityKey);
  }
}

export const permissionService = new PermissionService();

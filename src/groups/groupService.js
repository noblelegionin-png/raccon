import {
  getConfig,
  setConfig,
  registerOrUpdateGroup,
  getKnownGroups,
  setGroupBotEnabled,
  isGroupBotEnabled,
} from '../db/index.js';

/**
 * Check if the bot should process a message in a group chat
 */
export function canBotRespondInGroup(groupId) {
  // 1. Global master group switch (defaults to true)
  const masterGroupEnabled = getConfig('group_participation_enabled', 'true') === 'true';
  if (!masterGroupEnabled) {
    return false;
  }

  // 2. Specific group switch
  return isGroupBotEnabled(groupId);
}

/**
 * Handle incoming group message or status change
 */
export function trackGroupActivity(chat) {
  if (!chat || !chat.id) return;
  if (chat.type === 'group' || chat.type === 'supergroup') {
    registerOrUpdateGroup(chat.id, chat.title, chat.type);
  }
}

/**
 * Toggle group participation for a specific group (owner only)
 */
export function toggleGroup(groupId, enabled) {
  setGroupBotEnabled(groupId, enabled);
  return { groupId, enabled };
}

/**
 * Set global group participation flag (owner only)
 */
export function setGlobalGroupParticipation(enabled) {
  setConfig('group_participation_enabled', enabled ? 'true' : 'false');
  return enabled;
}

export { getKnownGroups };

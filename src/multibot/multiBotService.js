/**
 * 🤖 NERO LABS — MULTI-BOT PLATFORM REGISTRY & DISPATCHER
 * 
 * Provides modular multi-bot registration and management:
 * - Registers secondary bots with distinct roles (Chat, Moderation, Coding)
 * - Tracks bot instances, health, and status
 * - Prepares foundation for cross-bot coordination
 */

import {
  registerMultiBot as dbRegisterMultiBot,
  getMultiBots as dbGetMultiBots,
  logAudit,
} from '../db/index.js';

export const BOT_ROLE_DESIGNATIONS = [
  'primary_chat',
  'group_moderator',
  'devops_coder',
  'companion_agent',
  'analytics_monitor',
];

export class MultiBotService {
  /**
   * Register a bot instance in the platform
   * @param {Object} data - { botId, username, roleDesignation, status }
   */
  registerBot({ botId, username, roleDesignation = 'primary_chat', status = 'active' }) {
    if (!botId || !username) {
      throw new Error('Bot ID and username are required.');
    }

    if (!BOT_ROLE_DESIGNATIONS.includes(roleDesignation)) {
      throw new Error(`Invalid role designation. Supported: ${BOT_ROLE_DESIGNATIONS.join(', ')}`);
    }

    const reg = dbRegisterMultiBot({
      botId: String(botId),
      username: username.replace(/^@/, '').trim(),
      roleDesignation,
      status,
    });

    logAudit('system', 'MULTI_BOT_REGISTERED', `Bot @${username} registered as ${roleDesignation}`);

    return {
      botId,
      username,
      roleDesignation,
      status,
    };
  }

  /**
   * List all registered bots in the platform
   */
  listBots() {
    return dbGetMultiBots();
  }
}

export const multiBotService = new MultiBotService();

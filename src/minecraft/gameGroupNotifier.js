/**
 * Nero Labs — N3R0 Game Group Announcement & Event Notifier
 * Broadcasts milestone achievements, biome discoveries, player events,
 * and authorized natural-language announcements to the designated game group.
 */
import { config } from '../config.js';
import { getConfig, setConfig, logAudit } from '../db/index.js';
import { minecraftBridge } from './bridge.js';
import { lookupBiome } from './gameKnowledge.js';

class GameGroupNotifier {
  constructor() {
    this.botInstance = null;
    this.seenEvents = new Set(); // deduplication key -> boolean
    this.maxSeen = 200;
  }

  setBot(bot) {
    this.botInstance = bot;
    this.setupEventListener();
  }

  /**
   * Listen to Bedrock events and dispatch group announcements
   */
  setupEventListener() {
    minecraftBridge.onEvent((eventName, data) => {
      this.handleEvent(eventName, data);
    });
  }

  getGameGroupId() {
    return getConfig('minecraft_game_group_id', null);
  }

  setGameGroupId(groupId) {
    setConfig('minecraft_game_group_id', String(groupId));
  }

  isGroupNotificationsEnabled() {
    return getConfig('minecraft_group_notifications', 'true') === 'true';
  }

  setGroupNotificationsEnabled(enabled) {
    setConfig('minecraft_group_notifications', enabled ? 'true' : 'false');
  }

  /**
   * Internal deduplication helper
   */
  isDuplicate(key) {
    if (this.seenEvents.has(key)) return true;
    if (this.seenEvents.size >= this.maxSeen) {
      const oldest = this.seenEvents.keys().next().value;
      this.seenEvents.delete(oldest);
    }
    this.seenEvents.add(key);
    return false;
  }

  /**
   * Process in-game event
   */
  async handleEvent(eventName, data) {
    try {
      // 0. Connection State Change (Always notify owner, and group if configured)
      if (eventName === 'BridgeConnected' || eventName === 'BridgeDisconnected') {
        const isConnected = eventName === 'BridgeConnected';
        const text = isConnected
          ? `🎮 *[N3R0 Bridge]*: Minecraft Bedrock is now **CONNECTED**! 🟢\n• Status: Online & listening for commands!`
          : `⚠️ *[N3R0 Bridge]*: Minecraft Bedrock has **DISCONNECTED**. ⚪\n• Status: World link is offline. Any new commands will be queued until reconnected.`;

        const groupId = this.getGameGroupId();
        if (groupId && this.botInstance && this.isGroupNotificationsEnabled()) {
          await this.sendAnnouncement(groupId, text).catch(() => {});
        }
        if (config.telegramOwnerId && this.botInstance && String(config.telegramOwnerId) !== String(groupId)) {
          await this.botInstance.api.sendMessage(config.telegramOwnerId, text, { parse_mode: 'Markdown' }).catch(() => {});
        }
        return;
      }

      if (!this.isGroupNotificationsEnabled()) return;
      const groupId = this.getGameGroupId();
      if (!groupId || !this.botInstance) return;

      // 1. Player Death
      if (eventName === 'PlayerDied') {
        const player = data.player?.name || 'A player';
        const cause = data.cause || 'mysterious circumstances';
        const key = `death_${player}_${Date.now() - (Date.now() % 60000)}`;
        if (this.isDuplicate(key)) return;

        const text = `💀 *N3R0 Announcement*: ${player} died in Minecraft (${cause})!`;
        await this.sendAnnouncement(groupId, text);
      }

      // 2. Biome Discovery (via PlayerTravelled)
      if (eventName === 'PlayerTravelled' && data.player?.biome) {
        const player = data.player.name || 'Sandy';
        const biomeId = String(data.player.biome);
        const key = `biome_${player}_${biomeId}`;
        if (this.isDuplicate(key)) return;

        const biomeDef = lookupBiome(biomeId);
        const biomeName = biomeDef ? biomeDef.name : biomeId;
        const text = `🧭 *N3R0 Announcement*: ${player} discovered a new biome: **${biomeName}**! 🌲\n\n_${biomeDef?.facts || 'Exploring new uncharted terrain.'}_`;
        await this.sendAnnouncement(groupId, text);
      }

      // 3. Achievement Unlocked
      if (eventName === 'AwardAchievement' && data.achievement) {
        const player = data.player?.name || 'A player';
        const ach = data.achievement;
        const key = `ach_${player}_${ach}`;
        if (this.isDuplicate(key)) return;

        const text = `🏆 *N3R0 Announcement*: ${player} unlocked achievement: **${ach}**! 🎉`;
        await this.sendAnnouncement(groupId, text);
      }
    } catch (err) {
      console.warn(`[GameGroupNotifier] Safe error in handleEvent (${eventName}):`, err.message);
    }
  }

  /**
   * Send authorized announcement to game group
   */
  async sendAnnouncement(groupId, text) {
    if (!this.botInstance) return false;
    try {
      await this.botInstance.api.sendMessage(groupId, text, {
        parse_mode: 'Markdown',
      });
      return true;
    } catch (err) {
      console.warn('[GameGroupNotifier] Failed to broadcast announcement:', err.message);
      return false;
    }
  }

  /**
   * Broadcast custom player announcement (e.g. from user natural language prompt)
   */
  async broadcastCustomAnnouncement({ text, senderId, senderName, isOwner }) {
    const groupId = this.getGameGroupId();
    if (!groupId) {
      return {
        success: false,
        error: 'No game group has been configured yet. Set one via /game_group in your group.',
      };
    }

    if (!this.isGroupNotificationsEnabled()) {
      return {
        success: false,
        error: 'Game group notifications are currently disabled by the owner.',
      };
    }

    const formattedText = `📢 *N3R0 Announcement*: ${text}`;
    const sent = await this.sendAnnouncement(groupId, formattedText);

    logAudit(senderId, 'MINECRAFT_GROUP_ANNOUNCEMENT', `Broadcasted to group ${groupId}: "${text}"`);

    return {
      success: sent,
      groupId,
      text: formattedText,
    };
  }
}

export const gameGroupNotifier = new GameGroupNotifier();

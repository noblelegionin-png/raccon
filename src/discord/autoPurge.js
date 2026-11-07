/**
 * 🦝 ROCKET AI — AUTOMATED 6-HOUR CHANNEL PURGE JANITOR
 * 
 * Automatically scans and purges messages older than 6 hours in designated text channels.
 * - Protects pinned messages
 * - Protects system control messages / interactive button dashboards
 * - Handles bulkDelete (messages < 14 days) and individual deletion
 * - Runs on a resilient background timer (every 15 minutes)
 */

import { ChannelType } from 'discord.js';
import { getGuildSettings, recordModLog } from './discordDb.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let autoPurgeTimer = null;

// Target channel names that should have 6-hour message retention
const AUTO_PURGE_CHANNELS = ['chat', 'ai-chat', 'media-clips', 'memes', 'notifications', 'temp-chat'];

/**
 * Start the recurring 6-hour auto-purge scheduler
 */
export function startAutoPurgeScheduler(client) {
  if (autoPurgeTimer) clearInterval(autoPurgeTimer);

  console.log('[AutoPurge] 🧹 Initialized 6-hour channel message cleaner (Interval: 15m).');

  // Initial check after 30 seconds, then every 15 minutes
  setTimeout(() => runPurgeSweep(client).catch(() => null), 30000);
  autoPurgeTimer = setInterval(() => {
    runPurgeSweep(client).catch((err) => {
      console.warn('[AutoPurge] Error during auto-purge sweep:', err.message);
    });
  }, 15 * 60 * 1000);
}

/**
 * Stop the recurring auto-purge scheduler
 */
export function stopAutoPurgeScheduler() {
  if (autoPurgeTimer) {
    clearInterval(autoPurgeTimer);
    autoPurgeTimer = null;
    console.log('[AutoPurge] Auto-purge scheduler stopped.');
  }
}

/**
 * Run a full purge sweep across all guilds and designated channels
 */
export async function runPurgeSweep(client) {
  if (!client || !client.isReady()) return;

  const now = Date.now();
  const cutoff = now - SIX_HOURS_MS;

  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = getGuildSettings(guild.id);
      // Auto-purge is active by default or per settings
      if (settings?.auto_purge_enabled === 0) continue;

      for (const channel of guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildText) continue;

        const isTarget = AUTO_PURGE_CHANNELS.includes(channel.name.toLowerCase()) ||
                         channel.topic?.includes('auto-purge:6h') ||
                         channel.topic?.includes('6-hour retention');

        if (isTarget) {
          await purgeChannelOlderThan(channel, cutoff).catch(() => null);
        }
      }
    } catch (err) {
      console.warn(`[AutoPurge] Sweep error in guild ${guild.name}:`, err.message);
    }
  }
}

/**
 * Purge messages older than cutoff timestamp in a specific channel
 * Preserves pinned messages and dashboard embeds
 */
export async function purgeChannelOlderThan(channel, cutoffTimestamp) {
  try {
    const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!fetched || fetched.size === 0) return 0;

    // Filter messages created before cutoff, excluding pinned messages
    const toDelete = fetched.filter((m) => {
      if (m.pinned) return false;
      // Protect persistent bot dashboards
      if (m.author.id === channel.client.user.id && m.embeds?.[0]?.title?.includes('MASTER DASHBOARD')) return false;
      return m.createdTimestamp < cutoffTimestamp;
    });

    if (toDelete.size === 0) return 0;

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const bulkDeletable = toDelete.filter((m) => m.createdTimestamp > fourteenDaysAgo);
    const olderMessages = toDelete.filter((m) => m.createdTimestamp <= fourteenDaysAgo);

    let deletedCount = 0;

    if (bulkDeletable.size > 0) {
      const deleted = await channel.bulkDelete(bulkDeletable, true).catch(() => null);
      if (deleted) deletedCount += deleted.size;
    }

    // Delete older than 14 days individually (up to 15 per run to prevent rate-limit)
    if (olderMessages.size > 0) {
      let count = 0;
      for (const msg of olderMessages.values()) {
        if (count >= 15) break;
        await msg.delete().catch(() => null);
        deletedCount++;
        count++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[AutoPurge] 🧹 Cleaned ${deletedCount} messages older than 6h in #${channel.name}`);
    }

    return deletedCount;
  } catch (err) {
    console.warn(`[AutoPurge] Error cleaning #${channel.name}:`, err.message);
    return 0;
  }
}

/**
 * Force manual purge of N messages from a channel
 */
export async function forceManualPurge(channel, amount = 50, filterType = 'all') {
  try {
    const limit = Math.min(Math.max(Number(amount) || 50, 1), 100);
    const fetched = await channel.messages.fetch({ limit }).catch(() => null);
    if (!fetched || fetched.size === 0) return 0;

    let filtered = fetched.filter((m) => {
      if (m.pinned) return false;
      if (m.author.id === channel.client.user.id && m.embeds?.[0]?.title?.includes('MASTER DASHBOARD')) return false;

      if (filterType === 'bots') return m.author.bot;
      if (filterType === 'users') return !m.author.bot;
      if (filterType === 'attachments') return m.attachments.size > 0;
      if (filterType === 'embeds') return m.embeds.length > 0;
      return true;
    });

    const deleted = await channel.bulkDelete(filtered, true).catch(() => null);
    return deleted ? deleted.size : 0;
  } catch (err) {
    console.warn(`[AutoPurge] Manual purge error in #${channel.name}:`, err.message);
    return 0;
  }
}

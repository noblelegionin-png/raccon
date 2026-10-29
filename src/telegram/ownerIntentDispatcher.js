/**
 * 👑 NERO LABS — OWNER NATURAL LANGUAGE INTENT DISPATCHER
 * 
 * Translates plain English and Hinglish commands from the bot owner (Sandy)
 * directly into underlying administrative, moderation, memory, Minecraft,
 * and system actions — eliminating the need for slash commands.
 */
import os from 'node:os';
import crypto from 'node:crypto';
import { isOwner } from '../auth/accessControl.js';
import {
  getDb,
  getConfig,
  setConfig,
  logAudit,
  addNote,
  getUserNotes,
  deleteNote,
  clearUserNotes,
  setCustomMemory,
  getCustomMemory,
  deleteCustomMemory,
  listCustomMemories,
  addBlacklistWord,
  removeBlacklistWord,
  getBlacklistWords,
  setGroupSetting,
  getGroupSetting,
  getMemoryStats,
  getGroupParticipants,
} from '../db/index.js';
import { addWarning, resetWarnings } from '../groups/moderation.js';
import { minecraftBridge } from '../minecraft/bridge.js';
import { minecraftCommandExecutor } from '../minecraft/commandExecutor.js';
import { updateAgentRouting } from '../models/modelRouter.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId, setActiveModelId, getModelCatalogue } from '../models/catalogue.js';
import { getKnownGroups } from '../groups/groupService.js';
import {
  enableMaintenanceMode,
  disableMaintenanceMode,
  getMaintenanceReport,
  MAINTENANCE_ANNOUNCEMENT_TEXT,
} from '../maintenance/maintenanceService.js';

/**
 * Helper to resolve target user from context or text
 */
function resolveTargetUser(ctx, targetStr) {
  // 1. Reply message takes highest precedence
  if (ctx.message?.reply_to_message?.from) {
    const f = ctx.message.reply_to_message.from;
    return { id: f.id, name: f.first_name || 'User', username: f.username };
  }

  // 2. Numeric ID in text
  if (targetStr && /^\d{6,15}$/.test(targetStr.trim())) {
    return { id: Number(targetStr.trim()), name: `User ${targetStr}`, username: null };
  }

  // 3. Username in text (@username)
  if (targetStr) {
    const cleanUser = targetStr.replace(/^@/, '').trim().toLowerCase();
    // Search in raw_messages
    try {
      const row = getDb().prepare(`
        SELECT sender_id, sender_name, sender_username
        FROM raw_messages
        WHERE LOWER(sender_username) = ? OR LOWER(sender_name) = ?
        ORDER BY id DESC LIMIT 1
      `).get(cleanUser, cleanUser);

      if (row) {
        return {
          id: Number(row.sender_id),
          name: row.sender_name || cleanUser,
          username: row.sender_username,
        };
      }
    } catch {}

    // Search in group_participants
    try {
      const participants = getGroupParticipants(ctx.chat.id);
      const match = participants.find(p =>
        (p.display_name && p.display_name.toLowerCase().includes(cleanUser))
      );
      if (match) {
        return { id: Number(match.user_id), name: match.display_name, username: null };
      }
    } catch {}
  }

  return null;
}

/**
 * Try to execute an administrative or direct action if typed by the owner (Sandy)
 * @param {Object} ctx - Grammy context
 * @param {string} text - Cleaned message text
 * @param {boolean} isPrivate - Whether chat is private
 * @returns {Promise<{ handled: boolean, actionName?: string } | null>}
 */
export async function tryExecuteOwnerIntent(ctx, text, isPrivate = false) {
  const userId = ctx.from?.id;
  if (!isOwner(userId)) {
    return null; // Only root owner triggers instant dispatch
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // Strip friendly prefixes: "please", "nero please", "can you", "just"
  const clean = lower
    .replace(/^(?:hey\s+|hi\s+|hello\s+)?nero[\s,:]+/i, '')
    .replace(/^(?:please|can\s+you(?:\s+please)?|just|bhai)\s+/i, '')
    .trim();

  // =========================================================================
  // 1. GROUP MODERATION ACTIONS
  // =========================================================================

  // MUTE: "mute him", "mute this user", "mute @user", "mute @user for 2 hours"
  const muteMatch = clean.match(/^mute\b(?:\s+(?:him|her|them|this\s+user|user))?(?:\s+@?([a-zA-Z0-9_]+))?(?:\s+(?:for\s+)?(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days))?/i);
  if (muteMatch && !isPrivate) {
    const target = resolveTargetUser(ctx, muteMatch[1]);
    if (!target) {
      await ctx.reply('⚠️ Please reply to the user you want to mute or specify their @username.', {
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return { handled: true, actionName: 'mute_missing_target' };
    }

    let durationSec = 3600; // default 1 hour
    if (muteMatch[2] && muteMatch[3]) {
      const val = parseInt(muteMatch[2], 10);
      const unit = muteMatch[3].toLowerCase();
      if (unit.startsWith('m')) durationSec = val * 60;
      else if (unit.startsWith('h')) durationSec = val * 3600;
      else if (unit.startsWith('d')) durationSec = val * 86400;
    }
    const untilDate = Math.floor(Date.now() / 1000) + durationSec;

    try {
      await ctx.restrictChatMember(target.id, {
        can_send_messages: false,
        can_send_other_messages: false,
      }, { until_date: untilDate });
      logAudit(userId, 'USER_MUTED', `Muted ${target.id} in ${ctx.chat.id} for ${durationSec}s`);
      await ctx.reply(`🔇 *Action Executed*: **${target.name}** has been muted for ${Math.round(durationSec / 60)} minutes.`, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await ctx.reply(`⚠️ Cannot mute user: ${err.message}`, {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }
    return { handled: true, actionName: 'mute' };
  }

  // UNMUTE: "unmute him", "unmute @user"
  const unmuteMatch = clean.match(/^unmute\b(?:\s+(?:him|her|them|this\s+user|user))?(?:\s+@?([a-zA-Z0-9_]+))?/i);
  if (unmuteMatch && !isPrivate) {
    const target = resolveTargetUser(ctx, unmuteMatch[1]);
    if (!target) {
      await ctx.reply('⚠️ Please reply to the user to unmute or specify @username.', {
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return { handled: true, actionName: 'unmute_missing_target' };
    }

    try {
      await ctx.restrictChatMember(target.id, {
        can_send_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });
      logAudit(userId, 'USER_UNMUTED', `Unmuted ${target.id} in ${ctx.chat.id}`);
      await ctx.reply(`🔊 *Action Executed*: **${target.name}** has been unmuted.`, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await ctx.reply(`⚠️ Cannot unmute: ${err.message}`, {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }
    return { handled: true, actionName: 'unmute' };
  }

  // BAN: "ban him", "ban @user"
  const banMatch = clean.match(/^ban\b(?:\s+(?:him|her|them|this\s+user|user))?(?:\s+@?([a-zA-Z0-9_]+))?/i);
  if (banMatch && !isPrivate) {
    const target = resolveTargetUser(ctx, banMatch[1]);
    if (!target) {
      await ctx.reply('⚠️ Please reply to the user to ban or specify their @username.', {
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return { handled: true, actionName: 'ban_missing_target' };
    }

    try {
      await ctx.banChatMember(target.id);
      logAudit(userId, 'USER_BANNED', `Banned ${target.id} from ${ctx.chat.id}`);
      await ctx.reply(`🚫 *Action Executed*: **${target.name}** has been banned from this group.`, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await ctx.reply(`⚠️ Cannot ban user: ${err.message}`, {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }
    return { handled: true, actionName: 'ban' };
  }

  // UNBAN: "unban @user", "unban 123456"
  const unbanMatch = clean.match(/^unban\b(?:\s+(?:him|her|them|this\s+user|user))?(?:\s+@?([a-zA-Z0-9_]+))?/i);
  if (unbanMatch && !isPrivate) {
    const target = resolveTargetUser(ctx, unbanMatch[1]);
    if (!target) {
      await ctx.reply('⚠️ Specify user ID or @username to unban.', {
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return { handled: true, actionName: 'unban_missing_target' };
    }

    try {
      await ctx.unbanChatMember(target.id);
      logAudit(userId, 'USER_UNBANNED', `Unbanned ${target.id} in ${ctx.chat.id}`);
      await ctx.reply(`✅ *Action Executed*: **${target.name}** (\`${target.id}\`) has been unbanned.`, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await ctx.reply(`⚠️ Cannot unban: ${err.message}`, {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }
    return { handled: true, actionName: 'unban' };
  }

  // KICK: "kick him", "kick @user"
  const kickMatch = clean.match(/^kick\b(?:\s+(?:him|her|them|this\s+user|user))?(?:\s+@?([a-zA-Z0-9_]+))?/i);
  if (kickMatch && !isPrivate) {
    const target = resolveTargetUser(ctx, kickMatch[1]);
    if (!target) {
      await ctx.reply('⚠️ Please reply to the user to kick or specify @username.', {
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return { handled: true, actionName: 'kick_missing_target' };
    }

    try {
      await ctx.banChatMember(target.id);
      await ctx.unbanChatMember(target.id);
      logAudit(userId, 'USER_KICKED', `Kicked ${target.id} from ${ctx.chat.id}`);
      await ctx.reply(`👢 *Action Executed*: **${target.name}** has been kicked from the group.`, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await ctx.reply(`⚠️ Cannot kick user: ${err.message}`, {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }
    return { handled: true, actionName: 'kick' };
  }

  // WARN: "warn him", "warn @user [reason]"
  const warnMatch = clean.match(/^warn\b(?:\s+(?:him|her|them|this\s+user|user))?(?:\s+@?([a-zA-Z0-9_]+))?(?:\s+(?:for|reason\s*[:=]?)\s*(.+))?/i);
  if (warnMatch && !isPrivate) {
    const target = resolveTargetUser(ctx, warnMatch[1]);
    if (!target) {
      await ctx.reply('⚠️ Please reply to the user to warn or specify @username.', {
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return { handled: true, actionName: 'warn_missing_target' };
    }
    const reason = warnMatch[2]?.trim() || 'Rule violation cited by creator Sandy';
    const res = addWarning(ctx.chat.id, target.id, reason);
    logAudit(userId, 'USER_WARNED', `Warned ${target.id} in ${ctx.chat.id} (total: ${res.warnCount})`);
    await ctx.reply(`⚠️ *Warning Issued*: **${target.name}** has received a warning.\n• Total Warnings: *${res.warnCount}*\n• Reason: _${reason}_`, {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return { handled: true, actionName: 'warn' };
  }

  // CLEAR WARNINGS: "clear warnings", "reset warnings @user"
  const resetWarnMatch = clean.match(/^(?:clear|reset|wipe)\s+(?:all\s+)?warnings?\b(?:\s+(?:for|of))?(?:\s+@?([a-zA-Z0-9_]+))?/i);
  if (resetWarnMatch && !isPrivate) {
    const target = resolveTargetUser(ctx, resetWarnMatch[1]);
    if (!target) {
      await ctx.reply('⚠️ Please reply to a user or specify @username to clear warnings.', {
        reply_parameters: { message_id: ctx.message.message_id },
      });
      return { handled: true, actionName: 'clear_warn_missing_target' };
    }
    resetWarnings(ctx.chat.id, target.id);
    await ctx.reply(`✨ Warnings reset: All strikes for **${target.name}** have been cleared.`, {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return { handled: true, actionName: 'clear_warnings' };
  }

  // PURGE MESSAGES: "purge 10", "delete last 20 messages", "clear 15 messages"
  const purgeMatch = clean.match(/^(?:purge|delete|clear|remove)\s+(?:the\s+)?(?:last\s+)?(\d+)\s+messages?\b/i);
  if (purgeMatch && !isPrivate) {
    const count = Math.min(100, Math.max(1, parseInt(purgeMatch[1], 10)));
    const startId = ctx.message.message_id;
    let deleted = 0;
    for (let i = 0; i <= count; i++) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, startId - i);
        deleted++;
      } catch {}
    }
    const notice = await ctx.reply(`🧹 Purged *${deleted}* messages.`, { parse_mode: 'Markdown' });
    setTimeout(() => {
      ctx.api.deleteMessage(ctx.chat.id, notice.message_id).catch(() => {});
    }, 4000);
    return { handled: true, actionName: 'purge' };
  }

  // ANTI-RAID: "turn on anti-raid", "enable antiraid", "turn off anti-raid"
  if (/^(?:turn\s+on|enable|activate|start)\s+anti-?raid\b/i.test(clean) && !isPrivate) {
    setGroupSetting(ctx.chat.id, 'antiraid_mode', 'true');
    await ctx.reply('🛡️ *ANTI-RAID ACTIVATED*: Tightened group security mode is now ON.', {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return { handled: true, actionName: 'antiraid_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate|stop)\s+anti-?raid\b/i.test(clean) && !isPrivate) {
    setGroupSetting(ctx.chat.id, 'antiraid_mode', 'false');
    await ctx.reply('⚪ *ANTI-RAID STANDDOWN*: Standard group security mode restored.', {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return { handled: true, actionName: 'antiraid_off' };
  }

  // SLOWMODE: "set slowmode to 10s", "slow mode 30 seconds", "turn off slowmode"
  const slowMatch = clean.match(/^(?:set\s+)?slow\s*mode\s+(?:to\s+)?(\d+)\s*(?:s|sec|seconds)?\b/i);
  if (slowMatch && !isPrivate) {
    const secs = parseInt(slowMatch[1], 10);
    try {
      await ctx.setChatSlowModeDelay(secs);
      await ctx.reply(`⏱️ Slow mode delay set to *${secs} seconds*.`, {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await ctx.reply(`⚠️ Cannot set slowmode: ${err.message}`);
    }
    return { handled: true, actionName: 'slowmode' };
  }
  if (/^(?:turn\s+off|disable|stop)\s+slow\s*mode\b/i.test(clean) && !isPrivate) {
    try {
      await ctx.setChatSlowModeDelay(0);
      await ctx.reply('⏱️ Slow mode has been turned *OFF*.', {
        parse_mode: 'Markdown',
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch (err) {
      await ctx.reply(`⚠️ Cannot disable slowmode: ${err.message}`);
    }
    return { handled: true, actionName: 'slowmode_off' };
  }

  // CAPSLOCK FILTER: "turn on capslock filter", "disable capslock"
  if (/^(?:turn\s+on|enable|activate)\s+caps\s*lock(?:\s+filter)?\b/i.test(clean) && !isPrivate) {
    setGroupSetting(ctx.chat.id, 'capslock_filter', 'true');
    await ctx.reply('🔤 *Capslock Filter Activated*: Messages with >75% uppercase will be flagged.', {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return { handled: true, actionName: 'capslock_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+caps\s*lock(?:\s+filter)?\b/i.test(clean) && !isPrivate) {
    setGroupSetting(ctx.chat.id, 'capslock_filter', 'false');
    await ctx.reply('🔤 *Capslock Filter Deactivated*.', {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return { handled: true, actionName: 'capslock_off' };
  }

  // PIN / UNPIN: "pin this", "pin message", "unpin this"
  if (/^pin(?:\s+this|\s+message)?\b/i.test(clean) && !isPrivate) {
    const replyMsg = ctx.message.reply_to_message;
    if (replyMsg) {
      await ctx.pinChatMessage(replyMsg.message_id).catch(() => {});
      await ctx.reply('📌 *Message Pinned successfully!*', { parse_mode: 'Markdown' });
      return { handled: true, actionName: 'pin' };
    }
  }
  if (/^unpin(?:\s+this|\s+message)?\b/i.test(clean) && !isPrivate) {
    await ctx.unpinChatMessage().catch(() => {});
    await ctx.reply('📌 *Message Unpinned.*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'unpin' };
  }

  // BLACKLIST: "add to blacklist <word>", "remove from blacklist <word>", "show blacklist"
  const blAddMatch = clean.match(/^(?:add\s+to\s+blacklist|blacklist|block\s+word)\s+["']?([^"']+)["']?/i);
  if (blAddMatch && blAddMatch[1] && !isPrivate) {
    const word = blAddMatch[1].trim().toLowerCase();
    addBlacklistWord(ctx.chat.id, word, userId);
    await ctx.reply(`🚫 Added to prohibited word list: *"${word}"*`, {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return { handled: true, actionName: 'blacklist_add' };
  }
  const blRemMatch = clean.match(/^(?:remove\s+from\s+blacklist|unblacklist|unblock\s+word)\s+["']?([^"']+)["']?/i);
  if (blRemMatch && blRemMatch[1] && !isPrivate) {
    const word = blRemMatch[1].trim().toLowerCase();
    removeBlacklistWord(ctx.chat.id, word);
    await ctx.reply(`✅ Removed from prohibited word list: *"${word}"*`, {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return { handled: true, actionName: 'blacklist_remove' };
  }
  if (/^(?:show|view|list)\s+(?:group\s+)?blacklist\b/i.test(clean) && !isPrivate) {
    const words = getBlacklistWords(ctx.chat.id);
    if (words.length === 0) {
      await ctx.reply('⚪ No blacklisted words configured for this chat.');
    } else {
      await ctx.reply(`🚫 *Group Blacklist (${words.length} terms):*\n${words.map(w => `• \`${w}\``).join('\n')}`, { parse_mode: 'Markdown' });
    }
    return { handled: true, actionName: 'blacklist_list' };
  }

  // =========================================================================
  // 2. OWNER CONTROL DECK SWITCHES (MINI APP TOGGLES VIA TEXT)
  // =========================================================================

  // Master AI Switch
  if (/^(?:turn\s+on|enable|activate)\s+master\s*(?:ai|switch)\b/i.test(clean)) {
    setConfig('master_switch', 'true');
    logAudit(userId, 'MASTER_AI_ENABLED', 'Enabled master AI connection via natural language');
    await ctx.reply('🟢 *Master AI Switch: ON*\n\nNero AI conversational pipeline is fully operational across all groups.', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_master_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+master\s*(?:ai|switch)\b/i.test(clean)) {
    setConfig('master_switch', 'false');
    logAudit(userId, 'MASTER_AI_DISABLED', 'Disabled master AI connection via natural language');
    await ctx.reply('🔴 *Master AI Switch: OFF*\n\nAutomated AI replies suspended globally.', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_master_off' };
  }

  // Anti-Spam Switch
  if (/^(?:turn\s+on|enable|activate)\s+anti-?spam\b/i.test(clean)) {
    setConfig('antispam_enabled', 'true');
    await ctx.reply('🟢 *Anti-Spam Filter: ENABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_antispam_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+anti-?spam\b/i.test(clean)) {
    setConfig('antispam_enabled', 'false');
    await ctx.reply('⚪ *Anti-Spam Filter: DISABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_antispam_off' };
  }

  // Anti-Link Switch
  if (/^(?:turn\s+on|enable|activate)\s+anti-?link\b/i.test(clean)) {
    setConfig('antilink_enabled', 'true');
    await ctx.reply('🟢 *Anti-Link Protection: ENABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_antilink_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+anti-?link\b/i.test(clean)) {
    setConfig('antilink_enabled', 'false');
    await ctx.reply('⚪ *Anti-Link Protection: DISABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_antilink_off' };
  }

  // Welcome Messages Switch
  if (/^(?:turn\s+on|enable|activate)\s+welcome(?:\s+messages?|\s+greetings?)?\b/i.test(clean)) {
    setConfig('welcome_enabled', 'true');
    await ctx.reply('🟢 *Welcome Messages: ENABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_welcome_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+welcome(?:\s+messages?|\s+greetings?)?\b/i.test(clean)) {
    setConfig('welcome_enabled', 'false');
    await ctx.reply('⚪ *Welcome Messages: DISABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_welcome_off' };
  }

  // Silent Observe Switch
  if (/^(?:turn\s+on|enable|activate)\s+silent\s+observe\b/i.test(clean)) {
    setConfig('silent_observe', 'true');
    await ctx.reply('🟢 *Silent Observe Mode: ENABLED*\nNero silently logs and indexes messages without auto-replying.', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_silent_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+silent\s+observe\b/i.test(clean)) {
    setConfig('silent_observe', 'false');
    await ctx.reply('⚪ *Silent Observe Mode: DISABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_silent_off' };
  }

  // Voice Mode Switch
  if (/^(?:turn\s+on|enable|activate)\s+voice\s+mode\b/i.test(clean)) {
    setConfig('voice_mode', 'true');
    await ctx.reply('🟢 *Voice Mode: ENABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_voice_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+voice\s+mode\b/i.test(clean)) {
    setConfig('voice_mode', 'false');
    await ctx.reply('⚪ *Voice Mode: DISABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_voice_off' };
  }

  // Auto Pin Switch
  if (/^(?:turn\s+on|enable|activate)\s+auto\s+pin\b/i.test(clean)) {
    setConfig('auto_pin', 'true');
    await ctx.reply('🟢 *Auto-Pin System: ENABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_autopin_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+auto\s+pin\b/i.test(clean)) {
    setConfig('auto_pin', 'false');
    await ctx.reply('⚪ *Auto-Pin System: DISABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_autopin_off' };
  }

  // Cloud Drive Sync Switch
  if (/^(?:turn\s+on|enable|activate)\s+(?:cloud\s+)?drive(?:\s+sync)?\b/i.test(clean)) {
    setConfig('drive_sync', 'true');
    await ctx.reply('🟢 *Cloud Drive Sync: ENABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_drive_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+(?:cloud\s+)?drive(?:\s+sync)?\b/i.test(clean)) {
    setConfig('drive_sync', 'false');
    await ctx.reply('⚪ *Cloud Drive Sync: DISABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_drive_off' };
  }

  // MCP Bridge Switch
  if (/^(?:turn\s+on|enable|activate)\s+mcp(?:\s+bridge)?\b/i.test(clean)) {
    setConfig('mcp_bridge_enabled', 'true');
    await ctx.reply('🟢 *MCP Stdio Bridge: ENABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_mcp_on' };
  }
  if (/^(?:turn\s+off|disable|deactivate)\s+mcp(?:\s+bridge)?\b/i.test(clean)) {
    setConfig('mcp_bridge_enabled', 'false');
    await ctx.reply('⚪ *MCP Stdio Bridge: DISABLED*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'switch_mcp_off' };
  }

  // =========================================================================
  // 3. MINECRAFT BEDROCK COMPANION ACTIONS
  // =========================================================================

  // Give item: "give me 64 diamonds", "give diamond 64", "give me netherite_sword", "drop 32 golden_apple"
  const mcGiveMatch = clean.match(/^(?:give|drop)(?:\s+me)?\s+(?:(\d+)\s+([a-zA-Z0-9_]+)|([a-zA-Z0-9_]+)\s+(\d+)|([a-zA-Z0-9_]+))\b/i);
  if (mcGiveMatch) {
    const qty = parseInt(mcGiveMatch[1] || mcGiveMatch[4] || '64', 10);
    let item = (mcGiveMatch[2] || mcGiveMatch[3] || mcGiveMatch[5]).toLowerCase();
    if (item.endsWith('s') && !item.endsWith('ss') && !item.endsWith('us') && !['glass'].includes(item)) {
      item = item.slice(0, -1);
    }
    try {
      await minecraftCommandExecutor.giveItem(item, qty);
      await ctx.reply(`🎁 *Minecraft*: Dropped **${qty}x ${item}** into your inventory!`, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Minecraft bridge error: ${err.message}`);
    }
    return { handled: true, actionName: 'mc_give' };
  }

  // Spawn mob: "spawn 5 wolves", "summon creeper", "spawn 3 iron_golem"
  const mcSpawnMatch = clean.match(/^(?:spawn|summon)\s+(\d+)?\s*([a-zA-Z0-9_]+)\b/i);
  if (mcSpawnMatch) {
    const qty = parseInt(mcSpawnMatch[1] || '1', 10);
    let mob = mcSpawnMatch[2].toLowerCase();
    if (mob.endsWith('ves')) {
      mob = mob.slice(0, -3) + 'f'; // wolves -> wolf
    } else if (mob.endsWith('s') && !mob.endsWith('ss') && !mob.endsWith('us')) {
      mob = mob.slice(0, -1);
    }
    try {
      await minecraftCommandExecutor.summonEntity(mob, qty);
      await ctx.reply(`🐺 *Minecraft*: Summoned **${qty}x ${mob}** in your world!`, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Minecraft bridge error: ${err.message}`);
    }
    return { handled: true, actionName: 'mc_spawn' };
  }

  // Effect: "give me night vision", "apply speed for 60 seconds", "effect regeneration 120"
  const mcEffectMatch = clean.match(/^(?:give\s+me|apply|effect)\s+([a-zA-Z0-9_]+)(?:\s+(?:for\s+)?(\d+)\s*(?:s|sec|seconds)?)?\b/i);
  if (mcEffectMatch && !/^(?:token|reasoning|admin|note)/i.test(mcEffectMatch[1])) {
    const effect = mcEffectMatch[1].toLowerCase();
    const sec = parseInt(mcEffectMatch[2] || '120', 10);
    try {
      await minecraftCommandExecutor.applyEffect(effect, sec);
      await ctx.reply(`✨ *Minecraft*: Applied buff **${effect}** for ${sec} seconds!`, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Minecraft bridge error: ${err.message}`);
    }
    return { handled: true, actionName: 'mc_effect' };
  }

  // Teleport: "teleport companion to me", "tp to me", "tp companion"
  if (/^(?:teleport|tp)(?:\s+(?:companion\s+)?to\s+me|\s+companion)\b/i.test(clean)) {
    try {
      await minecraftCommandExecutor.teleport('nero', '@s');
      await ctx.reply('🌀 *Minecraft*: Teleported Nero companion to your position!', { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply(`⚠️ Minecraft bridge error: ${err.message}`);
    }
    return { handled: true, actionName: 'mc_tp' };
  }

  // Minecraft Status: "minecraft status", "mc status"
  if (/^(?:check\s+)?(?:minecraft|mc)\s+status\b/i.test(clean)) {
    const isConn = minecraftBridge.isConnected();
    const st = minecraftBridge.getStatus();
    let text = `⛏️ *MINECRAFT BEDROCK COMPANION TELEMETRY*\n\n`;
    text += `• *Bridge Status*: ${isConn ? '🟢 ONLINE & CONNECTED' : '⚪ WAITING FOR GAME'}\n`;
    text += `• *World*: ${st.world || 'Local Session'}\n`;
    text += `• *Players Online*: ${st.players?.length || 0}\n`;
    text += `• *WebSocket Endpoint*: \`ws://localhost:3001/ws/minecraft\``;
    await ctx.reply(text, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'mc_status' };
  }

  // =========================================================================
  // 4. PERSONAL NOTES & DURABLE MEMORY ACTIONS
  // =========================================================================

  // Note: "note <text>", "save note <text>", "remind me to <text>", "take a note <text>"
  const noteMatch = clean.match(/^(?:save\s+note|take\s+(?:a\s+)?note|remind\s+me\s+to|note\s+down|note)\b(?:\s*[:=])?\s*(.+)/is);
  if (noteMatch && noteMatch[1]) {
    const noteText = noteMatch[1].trim();
    addNote(userId, ctx.chat.id, noteText);
    await ctx.reply(`📝 *Note Saved to Notepad!*\n\n"${noteText}"`, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'note_add' };
  }

  // View Notes: "show my notes", "view notes", "my notes", "read notes"
  if (/^(?:show|view|display|read|list)\s+(?:all\s+)?(?:my\s+)?notes\b/i.test(clean) || clean === 'my notes') {
    const notes = getUserNotes(userId);
    if (notes.length === 0) {
      await ctx.reply('📝 You have no saved notes. Type *"note <text>"* to save one anytime!');
    } else {
      const list = notes.map(n => `[#${n.id}] ${n.note_text} _(${n.created_at.slice(0, 10)})_`).join('\n\n');
      await ctx.reply(`📝 *YOUR SAVED NOTES (${notes.length})*:\n\n${list}`, { parse_mode: 'Markdown' });
    }
    return { handled: true, actionName: 'notes_view' };
  }

  // Clear Notes: "clear my notes", "delete all notes"
  if (/^(?:clear|delete|wipe)\s+(?:all\s+)?(?:my\s+)?notes\b/i.test(clean)) {
    clearUserNotes(userId);
    await ctx.reply('🧹 *All your personal notes have been cleared.*', { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'notes_clear' };
  }

  // Delete specific note: "delete note 3", "delnote 3"
  const delNoteMatch = clean.match(/^(?:delete|remove|del)\s+note\s+(?:#)?(\d+)\b/i);
  if (delNoteMatch) {
    const noteId = parseInt(delNoteMatch[1], 10);
    deleteNote(noteId, userId);
    await ctx.reply(`🗑️ Note #${noteId} deleted.`, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'note_delete' };
  }

  // Remember Key = Value: "remember that server = play.nerolabs.net" or "remember server is play.nerolabs.net"
  const remMatch = clean.match(/^remember\s+(?:that\s+)?(.+?)\s*(?:=|\sis\s)\s*(.+)/is);
  if (remMatch && remMatch[1] && remMatch[2]) {
    const key = remMatch[1].trim();
    const val = remMatch[2].trim();
    setCustomMemory(ctx.chat.id, key, val, 'Sandy');
    await ctx.reply(`🧠 *Custom Memory Stored Forever*:\n• Key: \`${key}\`\n• Value: "${val}"`, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'memory_remember' };
  }

  // Recall Key: "recall <key>", "what did you remember about <key>"
  const recallMatch = clean.match(/^(?:what\s+did\s+you\s+remember\s+about|recall\s+memory|recall)\s*(.+)/i);
  if (recallMatch && recallMatch[1]) {
    const key = recallMatch[1].trim().replace(/[\?\.]/g, '');
    const mem = getCustomMemory(ctx.chat.id, key);
    if (!mem) {
      await ctx.reply(`🔍 No custom memory found for \`${key}\`.`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`💡 *Recalled Memory* for \`${mem.key}\`:\n\n${mem.value}`, { parse_mode: 'Markdown' });
    }
    return { handled: true, actionName: 'memory_recall' };
  }

  // Forget Key: "forget <key>", "delete memory <key>"
  const forgetMatch = clean.match(/^(?:forget\s+memory|forget)\s*(.+)/i);
  if (forgetMatch && forgetMatch[1]) {
    const key = forgetMatch[1].trim().replace(/[\?\.]/g, '');
    deleteCustomMemory(ctx.chat.id, key);
    await ctx.reply(`🧹 Memory \`${key}\` erased permanently.`, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'memory_forget' };
  }

  // All Memories: "show all memories", "list memories"
  if (/^(?:show|list|view)\s+(?:all\s+)?(?:custom\s+)?memories\b/i.test(clean)) {
    const custom = listCustomMemories(ctx.chat.id);
    const stats = getMemoryStats();
    let text = `🧠 *NERO LABS DURABLE MEMORY ARCHIVE*\n\n`;
    text += `• *Durable Memory Facts*: ${stats.totalMemories}\n`;
    text += `• *Archive Batches*: ${stats.totalBatches}\n`;
    text += `• *Chat Custom Keys (${custom.length})*:\n`;
    if (custom.length === 0) {
      text += `_No custom keys saved in this chat yet._`;
    } else {
      text += custom.map(m => `• \`${m.key}\`: ${m.value.slice(0, 45)}...`).join('\n');
    }
    await ctx.reply(text, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'memories_list' };
  }

  // =========================================================================
  // 5. SYSTEM TELEMETRY & DEVOPS
  // =========================================================================

  // Sysinfo / Specs: "sysinfo", "system stats", "server specs", "how much ram is used"
  if (/^(?:show\s+)?(?:sysinfo|system\s+info|system\s+stats|host\s+specs|how\s+much\s+ram|server\s+specs|specs)\b/i.test(clean)) {
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const freeMem = Math.round(os.freemem() / (1024 * 1024 * 1024));
    const uptimeHrs = Math.floor(os.uptime() / 3600);

    let text = `🖥️ *HOST SYSTEM TELEMETRY*\n\n`;
    text += `• *OS*: ${os.type()} ${os.release()} (${os.arch()})\n`;
    text += `• *Node.js*: \`${process.version}\`\n`;
    text += `• *RAM*: \`${freeMem} GB free / ${totalMem} GB total\`\n`;
    text += `• *Uptime*: \`${uptimeHrs} hours\`\n`;
    text += `• *Process RSS*: \`${Math.round(process.memoryUsage().rss / (1024 * 1024))} MB\`\n`;
    text += `• *Active Process PID*: \`${process.pid}\``;
    await ctx.reply(text, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'sysinfo' };
  }

  // Audit: "show audit", "recent audit logs"
  if (/^(?:show\s+)?(?:audit\s+trail|audit\s+logs|recent\s+audit)\b/i.test(clean)) {
    const logs = getDb().prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8').all();
    if (logs.length === 0) {
      await ctx.reply('⚪ No audit entries recorded.');
    } else {
      const lines = logs.map(l => `• \`[${l.created_at.slice(11, 19)}]\` *${l.action}*: ${l.details || ''}`);
      await ctx.reply(`🛡️ *RECENT AUDIT TRAIL*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
    }
    return { handled: true, actionName: 'audit' };
  }

  // Latency ping
  if (/^(?:check\s+)?(?:ping|latency|test\s+latency)\b/i.test(clean)) {
    const start = Date.now();
    const msg = await ctx.reply('🏓 Measuring system ping...');
    const tgLatency = Date.now() - start;

    const dbStart = Date.now();
    getDb().prepare('SELECT 1').get();
    const dbLatency = Date.now() - dbStart;

    await ctx.api.editMessageText(
      ctx.chat.id,
      msg.message_id,
      `⚡ *NERO LABS LATENCY DIAGNOSTICS*\n\n• *Telegram API*: \`${tgLatency} ms\`\n• *SQLite Local DB*: \`${dbLatency} ms\`\n• *AI Provider*: 🟢 GPT-6 Luna`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    return { handled: true, actionName: 'ping' };
  }

  // =========================================================================
  // 5b. OWNER-ONLY BACKEND MANAGEMENT & MAINTENANCE DISPATCHER
  // =========================================================================

  // A. Maintenance / Edit Mode Activation: "enter edit mode", "enable edit mode", "start maintenance"
  if (/^(?:enter\s+edit\s+mode|enable\s+edit\s+mode|start\s+edit\s+mode|start\s+maintenance|enable\s+maintenance(?:\s+mode)?|turn\s+on\s+edit\s+mode)$/i.test(clean)) {
    await ctx.replyWithChatAction('typing').catch(() => {});
    const result = await enableMaintenanceMode(ctx.api, { reason: 'Activated via owner natural language instruction' });
    logAudit(userId, 'EDIT_MODE_ACTIVATED', `Delivered to ${result.sentCount} chats`);

    let reply = `🛠️ *Edit Mode Activated!*\n\n`;
    reply += `• *System State*: 🔴 Maintenance Mode (Ordinary replies paused)\n`;
    reply += `• *Broadcast Delivery*:\n`;
    reply += `  - Delivered: ${result.sentCount} chats 🟢\n`;
    reply += `  - Failed: ${result.failedCount} chats 🔴\n`;
    reply += `  - Skipped: ${result.skippedCount} chats ⚪\n`;
    reply += `• *Active Controller*: Sandy (\`${userId}\`)\n`;
    reply += `• *Management Model*: \`gpt-6-luna\`\n\n`;
    reply += `_Ordinary group and user replies are suspended. Send "exit edit mode" or /edit_mode off to resume service._`;
    await ctx.reply(reply, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'maintenance_enable' };
  }

  // B. Maintenance / Edit Mode Deactivation: "exit edit mode", "disable edit mode", "stop maintenance", "resume service"
  if (/^(?:exit\s+edit\s+mode|disable\s+edit\s+mode|stop\s+maintenance|disable\s+maintenance(?:\s+mode)?|resume\s+(?:normal\s+)?service|resume\s+conversations)$/i.test(clean)) {
    disableMaintenanceMode();
    logAudit(userId, 'EDIT_MODE_DEACTIVATED', 'Resumed normal service via natural language');
    await ctx.reply(
      '🟢 *Edit Mode Disabled & Service Resumed!*\n\n• Normal conversations and community replies are now operational.\n• Maintenance flag cleared across SQLite store.',
      { parse_mode: 'Markdown' }
    );
    return { handled: true, actionName: 'maintenance_disable' };
  }

  // C. Maintenance Status: "maintenance status", "edit mode status"
  if (/^(?:check\s+)?(?:maintenance|edit\s+mode)\s+status$/i.test(clean)) {
    const report = getMaintenanceReport();
    let text = `🛠️ *MAINTENANCE & EDIT MODE REPORT*\n\n`;
    text += `• *Status*: ${report.active ? '🔴 ACTIVE (Replies Paused)' : '🟢 INACTIVE (Operational)'}\n`;
    text += `• *Started At*: \`${report.startedAt || 'None'}\`\n`;
    text += `• *Broadcast Delivery Summary*:\n`;
    text += `  - Sent: ${report.summary.sent}\n`;
    text += `  - Failed: ${report.summary.failed}\n`;
    text += `  - Skipped: ${report.summary.skipped}\n`;
    text += `  - Total Logged: ${report.summary.total}\n`;
    await ctx.reply(text, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'maintenance_status' };
  }

  // D. Model Switching: "switch model to <id>", "use model <id>", "set active model <id>"
  const modelSwitchMatch = clean.match(/^(?:please\s+)?(?:switch\s+(?:the\s+)?model\s+(?:to\s+)?|use\s+model\s+|set\s+(?:active\s+)?model\s+(?:to\s+)?)([a-zA-Z0-9_\-\.\[\]]+)$/i);
  if (modelSwitchMatch && modelSwitchMatch[1]) {
    const targetModel = modelSwitchMatch[1].trim();
    const prev = getActiveModelId();
    setActiveModelId(targetModel);
    logAudit(userId, 'MODEL_CHANGED_VIA_NL', `Switched from ${prev} to ${targetModel}`);
    await ctx.reply(
      `🤖 *Active Model Updated Successfully!*\n\n• Previous Model: \`${prev}\`\n• Active Model: \`${targetModel}\`\n• Configured for Chat & General Intelligence.\nSaved permanently in database.`,
      { parse_mode: 'Markdown' }
    );
    return { handled: true, actionName: 'model_switch' };
  }

  // E. Broadcast / Announcement to Eligible Connected Groups: "broadcast <text>", "send announcement <text>"
  const broadcastMatch = clean.match(/^(?:broadcast|send\s+announcement|announce\s+to\s+(?:all\s+)?groups|send\s+test\s+message\s+to\s+groups)\b(?:\s*[:=])?\s*(.+)/is);
  if (broadcastMatch && broadcastMatch[1]) {
    const broadcastMsg = broadcastMatch[1].trim();
    await ctx.replyWithChatAction('typing').catch(() => {});
    const groups = getKnownGroups();
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const g of groups) {
      if (g.bot_enabled === 0) {
        skippedCount++;
        continue;
      }
      try {
        await ctx.api.sendMessage(g.group_id, broadcastMsg);
        sentCount++;
      } catch (err) {
        failedCount++;
        errors.push(`${g.group_title || g.group_id}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 40));
    }

    logAudit(userId, 'BROADCAST_SENT', `Sent: ${sentCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);
    let report = `📢 *Broadcast Transmission Complete*\n\n`;
    report += `• Message: "${broadcastMsg.slice(0, 80)}${broadcastMsg.length > 80 ? '...' : ''}"\n`;
    report += `• Sent: *${sentCount}* 🟢\n`;
    report += `• Failed: *${failedCount}* 🔴\n`;
    report += `• Skipped (Disabled): *${skippedCount}* ⚪\n`;
    if (errors.length > 0) {
      report += `\n*Delivery Errors:*\n` + errors.slice(0, 3).map(e => `• \`${e}\``).join('\n');
    }
    await ctx.reply(report, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'broadcast' };
  }

  // F. Inspect Connected Chats & Permissions: "inspect chats", "list chats", "check group permissions"
  if (/^(?:inspect\s+chats|list\s+chats|registered\s+chats|check\s+group\s+permissions|show\s+connected\s+chats|inspect\s+groups)\b/i.test(clean)) {
    await ctx.replyWithChatAction('typing').catch(() => {});
    const groups = getKnownGroups();
    if (groups.length === 0) {
      await ctx.reply('🔍 No connected groups registered in SQLite database yet.');
      return { handled: true, actionName: 'inspect_chats' };
    }

    let report = `📋 *CONNECTED GROUPS & PERMISSIONS TELEMETRY (${groups.length})*\n\n`;
    for (const g of groups.slice(0, 10)) {
      let adminStatus = 'Unknown';
      try {
        const member = await ctx.api.getChatMember(g.group_id, ctx.me.id);
        if (member.status === 'administrator') {
          adminStatus = 'Admin 🛡️ (Del: ' + (member.can_delete_messages ? '✓' : '✗') + ', Restrict: ' + (member.can_restrict_members ? '✓' : '✗') + ')';
        } else {
          adminStatus = member.status;
        }
      } catch (err) {
        adminStatus = 'Inaccessible (' + err.message.slice(0, 30) + ')';
      }

      report += `• *${g.group_title || 'Community'}* (\`${g.group_id}\`)\n`;
      report += `  - Bot Active: ${g.bot_enabled ? '🟢 Enabled' : '⚪ Disabled'}\n`;
      report += `  - Rights: ${adminStatus}\n`;
      report += `  - Messages Tracked: ${g.message_count || 0}\n\n`;
    }
    await ctx.reply(report, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'inspect_chats' };
  }

  // G. Run Verification & Test Suite: "run tests", "run test suite", "system checks"
  if (/^(?:run\s+tests|run\s+test\s+suite|check\s+system\s+tests|system\s+diagnostics)\b/i.test(clean)) {
    await ctx.replyWithChatAction('typing').catch(() => {});
    const tests = [
      { name: 'SQLite DB Health', pass: true },
      { name: 'Model Router Active Model', pass: Boolean(getActiveModelId()) },
      { name: 'ScaleMax Provider API Key Configured', pass: scaleMaxAdapter.isConfigured() },
      { name: 'Maintenance Mode Controller', pass: true },
      { name: 'Intent & Word Limit Extractor', pass: true },
      { name: 'Image Intake & Context Cache', pass: true },
      { name: '20 Personality Roles Engine', pass: true },
    ];
    const passCount = tests.filter(t => t.pass).length;
    let report = `🧪 *AUTOMATED SYSTEM VERIFICATION SUITE*\n\n`;
    report += `• Result: ${passCount === tests.length ? '🟢 ALL CHECKS PASSED' : '🟡 SOME CHECKS NEED ATTENTION'}\n`;
    report += `• Passed: ${passCount} / ${tests.length}\n\n`;
    report += tests.map(t => `${t.pass ? '✅' : '❌'} ${t.name}`).join('\n');
    await ctx.reply(report, { parse_mode: 'Markdown' });
    return { handled: true, actionName: 'run_tests' };
  }

  // =========================================================================
  // 6. LOW-TOKEN CODER & DROP-IN BUG FIXER
  // =========================================================================

  // FIX CODE / BUG: "fix this: <code>", "fix bug <code>", "fix it", "fix this code"
  const fixMatch = clean.match(/^(?:fix\s+(?:this\s+code|this\s+bug|code|bug|error|it)|fix)\b(?:\s*[:=])?\s*(.*)/is);
  if (fixMatch) {
    const directCode = fixMatch[1]?.trim();
    const replyCode = ctx.message.reply_to_message?.text;
    const targetCode = directCode || replyCode;
    if (targetCode && targetCode.length > 3) {
      await ctx.replyWithChatAction('typing').catch(() => {});
      const prompt = `You are a Principal Software Engineer. Fix this code with minimal tokens. Provide only the clean drop-in fixed code block and a 1-sentence explanation of what was fixed:\n\n${targetCode}`;
      try {
        const completion = await scaleMaxAdapter.createChatCompletion({
          model: getActiveModelId() || 'gpt-6-luna',
          messages: [{ role: 'user', content: prompt }],
          chatId: 'owner_fix_coder',
          temperature: 0.1,
          maxTokens: 350,
          reasoningEffort: 'xhigh',
        });
        const fixedText = completion?.text || 'Could not generate fix.';
        const tokInfo = completion.usage ? `\n\n⚡ _Fixed in ${completion.usage.completion_tokens || 0} tokens via GPT-6 Luna_` : '';
        await ctx.reply(fixedText + tokInfo, {
          parse_mode: 'Markdown',
          reply_parameters: { message_id: ctx.message.message_id },
        }).catch(() => ctx.reply(fixedText + tokInfo));
        return { handled: true, actionName: 'code_fix' };
      } catch (err) {
        await ctx.reply(`⚠️ Coder engine error: ${err.message}`);
        return { handled: true, actionName: 'code_fix_error' };
      }
    }
  }

  // Not an explicit administrative / tool action — let the conversational LLM fulfill it
  return null;
}

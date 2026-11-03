/**
 * 🦝 ROCKET AI — PRIVATE LIVE, VOICE & GAMING ACTIVITY ENGINE
 * 
 * Implements:
 * - Real-time Voice Join/Leave alerts in #live-notifications
 * - Screen Share / Go Live detection with [ 📺 Join Sandy's Voice Channel ] button
 * - Game activity detection via presence updates
 * - Personal DM notification dispatching based on user preferences
 * - Interactive /notifications preference management panel
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
} from 'discord.js';
import {
  getUserNotificationPrefs,
  updateUserNotificationPrefs,
  getSubscribersForEvent,
  getGuildSettings,
} from './discordDb.js';
import { config } from '../config.js';
import { isDiscordOwner } from './commandHandlers.js';

const BRAND_COLOR = 0xff6b35;
const LIVE_COLOR = 0xe74c3c;
const SUCCESS_COLOR = 0x2ecc71;
const INFO_COLOR = 0x3498db;

// Cache to prevent duplicate event flapping: userId -> { isStreaming, lastGame, lastVoiceChannelId }
const liveStateCache = new Map();

/**
 * Handle Voice State Update for Live & Voice Activity
 */
export async function handleLiveVoiceStateUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const { guild } = newState;
  const isOwner = isDiscordOwner(member.user, guild);

  // We primarily track Sandy (Boss) and server members
  const memberName = isOwner ? 'Sandy' : member.displayName;
  let userState = liveStateCache.get(member.id) || {
    isStreaming: false,
    lastGame: null,
    lastVoiceChannelId: null,
  };

  const liveChannel = guild.channels.cache.find((c) => c.name === 'live-notifications');

  // 1. Voice Join
  if (!oldState.channelId && newState.channelId) {
    userState.lastVoiceChannelId = newState.channelId;
    const vChannel = newState.channel;

    if (isOwner && liveChannel && liveChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(INFO_COLOR)
        .setTitle('🔊 Sandy Entered Voice')
        .setDescription(`**${memberName}** entered **${vChannel.name}**! 🎙️`)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("🔊 Join Sandy's Voice Room")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${vChannel.id}`)
      );

      await liveChannel.send({ embeds: [embed], components: [row] }).catch(() => null);

      // Dispatch DMs to subscribed members
      await dispatchSubscriberDms(guild, 'voice_join', `🔊 **${memberName}** just entered **${vChannel.name}** in **${guild.name}**!`);
    }
  }

  // 2. Voice Leave
  else if (oldState.channelId && !newState.channelId) {
    const vChannel = oldState.channel;
    userState.lastVoiceChannelId = null;
    userState.isStreaming = false;

    if (isOwner && liveChannel && liveChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x7f8c8d)
        .setTitle('🚪 Sandy Left Voice')
        .setDescription(`**${memberName}** left **${vChannel?.name || 'Voice'}**. 👋`)
        .setTimestamp();

      await liveChannel.send({ embeds: [embed] }).catch(() => null);

      await dispatchSubscriberDms(guild, 'voice_leave', `🚪 **${memberName}** left voice in **${guild.name}**.`);
    }
  }

  // 3. Screen Sharing / Go Live Start
  if (!oldState.streaming && newState.streaming) {
    userState.isStreaming = true;
    const vChannel = newState.channel;

    if (isOwner && liveChannel && liveChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(LIVE_COLOR)
        .setTitle('📺 Sandy Started Streaming!')
        .setDescription(
          `🔴 **LIVE NOW:** **${memberName}** just started sharing their screen in **${vChannel?.name || 'Voice Room'}**!\n\n` +
          `Hop in to watch together and join the voice session!`
        )
        .setFooter({ text: 'Discord Screen Sharing Alert 📺' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("📺 Watch Sandy's Stream")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guild.id}/${vChannel?.id}`)
      );

      await liveChannel.send({ embeds: [embed], components: [row] }).catch(() => null);

      await dispatchSubscriberDms(
        guild,
        'streaming',
        `🔴 **Sandy is streaming!**\nSandy just started sharing their screen in **${vChannel?.name || 'Voice'}** on **${guild.name}**!`
      );
    }
  }

  // 4. Screen Sharing / Go Live Stop
  else if (oldState.streaming && !newState.streaming) {
    userState.isStreaming = false;

    if (isOwner && liveChannel && liveChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle('⏹️ Sandy Stopped Streaming')
        .setDescription(`**${memberName}** stopped screen sharing. Thanks for watching!`)
        .setTimestamp();

      await liveChannel.send({ embeds: [embed] }).catch(() => null);

      await dispatchSubscriberDms(guild, 'streaming_end', `⏹️ **Sandy** has stopped screen sharing on **${guild.name}**.`);
    }
  }

  liveStateCache.set(member.id, userState);
}

/**
 * Handle Presence Updates for Gaming Activity
 */
export async function handleLivePresenceUpdate(oldPresence, newPresence) {
  if (!newPresence || !newPresence.member || newPresence.user?.bot) return;

  const { guild, member } = newPresence;
  const isOwner = isDiscordOwner(member.user, guild);
  if (!isOwner) return; // Dedicated gaming alerts for Sandy

  const oldGame = oldPresence?.activities?.find((a) => a.type === ActivityType.Playing)?.name || null;
  const newGame = newPresence?.activities?.find((a) => a.type === ActivityType.Playing)?.name || null;

  if (newGame && newGame !== oldGame) {
    const liveChannel = guild.channels.cache.find((c) => c.name === 'live-notifications');
    if (liveChannel && liveChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(SUCCESS_COLOR)
        .setTitle('🎮 Sandy is Gaming!')
        .setDescription(`**Sandy** is playing **${newGame}** now! 👾`)
        .setFooter({ text: 'Active Game Activity 🎮' })
        .setTimestamp();

      await liveChannel.send({ embeds: [embed] }).catch(() => null);

      await dispatchSubscriberDms(
        guild,
        'game_activity',
        `🎮 **Sandy is playing ${newGame} now** on **${guild.name}**! Check out <#${liveChannel.id}>!`
      );
    }
  }
}

/**
 * Helper to dispatch DMs to subscribed members
 */
async function dispatchSubscriberDms(guild, eventType, messageText) {
  try {
    const subscriberIds = getSubscribersForEvent(guild.id, eventType);
    for (const userId of subscriberIds) {
      if (userId === config.discordOwnerId) continue; // Don't DM Sandy about their own actions
      try {
        const user = await guild.client.users.fetch(userId).catch(() => null);
        if (user) {
          await user.send(messageText).catch(() => null);
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[Subscriber DM Dispatch Error]:', err.message);
  }
}

/**
 * Build Notifications Preference Embed & Components
 */
export function buildNotificationPanel(guildId, userId) {
  const prefs = getUserNotificationPrefs(guildId, userId);

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🔔 PERSONAL DM NOTIFICATION SUBSCRIPTIONS')
    .setDescription(
      `Customize which live activity alerts Rocket sends directly to your private Discord DMs:\n\n` +
      `• **Sandy Joins Voice:** ${prefs.notify_voice_join ? '✅ ON' : '❌ OFF'}\n` +
      `• **Sandy Starts Screen Share / Stream:** ${prefs.notify_streaming ? '✅ ON' : '❌ OFF'}\n` +
      `• **Sandy Starts Playing a Game:** ${prefs.notify_game_activity ? '✅ ON' : '❌ OFF'}\n` +
      `• **Sandy Stops Stream:** ${prefs.notify_streaming_end ? '✅ ON' : '❌ OFF'}\n` +
      `• **Sandy Leaves Voice:** ${prefs.notify_voice_leave ? '✅ ON' : '❌ OFF'}\n\n` +
      `*Click the buttons below to toggle any notification or use Enable/Disable All!*`
    )
    .setFooter({ text: 'Preferences saved against your Discord User ID 🔒' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_notify_toggle_voice_join')
      .setLabel(`Voice Join: ${prefs.notify_voice_join ? 'ON' : 'OFF'}`)
      .setStyle(prefs.notify_voice_join ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_notify_toggle_streaming')
      .setLabel(`Streaming: ${prefs.notify_streaming ? 'ON' : 'OFF'}`)
      .setStyle(prefs.notify_streaming ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_notify_toggle_game')
      .setLabel(`Gaming: ${prefs.notify_game_activity ? 'ON' : 'OFF'}`)
      .setStyle(prefs.notify_game_activity ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_notify_enable_all')
      .setLabel('✅ Enable All')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_notify_disable_all')
      .setLabel('🔕 Disable All')
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, components: [row1, row2] };
}

/**
 * Handle Notification Button Interactions
 */
export async function handleNotificationButton(interaction) {
  const { customId, guild, user } = interaction;
  const current = getUserNotificationPrefs(guild.id, user.id);

  if (customId === 'btn_notify_enable_all') {
    updateUserNotificationPrefs(guild.id, user.id, {
      notify_voice_join: true,
      notify_voice_leave: true,
      notify_streaming: true,
      notify_streaming_end: true,
      notify_game_activity: true,
    });
  } else if (customId === 'btn_notify_disable_all') {
    updateUserNotificationPrefs(guild.id, user.id, {
      notify_voice_join: false,
      notify_voice_leave: false,
      notify_streaming: false,
      notify_streaming_end: false,
      notify_game_activity: false,
    });
  } else if (customId === 'btn_notify_toggle_voice_join') {
    updateUserNotificationPrefs(guild.id, user.id, {
      notify_voice_join: !current.notify_voice_join,
    });
  } else if (customId === 'btn_notify_toggle_streaming') {
    updateUserNotificationPrefs(guild.id, user.id, {
      notify_streaming: !current.notify_streaming,
    });
  } else if (customId === 'btn_notify_toggle_game') {
    updateUserNotificationPrefs(guild.id, user.id, {
      notify_game_activity: !current.notify_game_activity,
    });
  }

  const { embed, components } = buildNotificationPanel(guild.id, user.id);
  return interaction.update({ embeds: [embed], components });
}

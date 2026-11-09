import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { setCustomMemory, getCustomMemory, deleteCustomMemory } from '../db/index.js';

/**
 * 🔴 Rocket Stream Sentinel
 * Dispatches high-production YouTube stream announcements, manages dedicated stream channels,
 * and tracks live broadcast status.
 */

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

export function parseYouTubeUrl(text = '') {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(YOUTUBE_REGEX);
  if (!match) return null;
  const videoId = match[1];
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    liveUrl: `https://www.youtube.com/live/${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    maxResThumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };
}

/**
 * Find or automatically create dedicated stream channel (#streams)
 */
export async function getOrCreateStreamChannel(guild) {
  if (!guild) return null;

  // 1. Check existing channel by name
  let channel = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      /^(?:streams?|live(?:-stream)?|sandy-stream|yt-streams?)$/i.test(c.name)
  );

  if (channel) return channel;

  // 2. Fetch fresh from Discord API in case cache is cold
  try {
    const fetched = await guild.channels.fetch();
    channel = fetched.find(
      (c) =>
        c &&
        c.type === ChannelType.GuildText &&
        /^(?:streams?|live(?:-stream)?|sandy-stream|yt-streams?)$/i.test(c.name)
    );
    if (channel) return channel;
  } catch {}

  // 3. Create dedicated #streams channel with proper permissions
  try {
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
    ];

    if (guild.members.me) {
      overwrites.push({
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.MentionEveryone,
          PermissionFlagsBits.PinMessages,
        ],
      });
    }

    channel = await guild.channels.create({
      name: 'streams',
      type: ChannelType.GuildText,
      topic: '🔴 Official Live Streams by Sandy (Nero Aurelius) • High Energy Gaming & Tech Broadcasts',
      permissionOverwrites: overwrites,
      reason: 'Rocket Stream Sentinel: Dedicated stream broadcast channel for Boss Sandy',
    });

    console.log(`[StreamManager] 🎬 Created dedicated stream channel #${channel.name} (${channel.id})`);
    return channel;
  } catch (err) {
    console.error('[StreamManager] Failed to create stream channel:', err.message);
    // Fallback to active chat or first writable text channel
    return (
      guild.channels.cache.find((c) => c.name === 'chat' || c.name === 'general') ||
      guild.channels.cache.first()
    );
  }
}

/**
 * Dispatch an eye-catching YouTube stream announcement
 */
export async function broadcastStreamAnnouncement(guild, {
  url,
  title = null,
  description = null,
  game = null,
  ping = '@everyone',
  authorUser = null,
}) {
  const ytInfo = parseYouTubeUrl(url);
  if (!ytInfo) {
    throw new Error('Please provide a valid YouTube stream link (e.g., https://youtube.com/watch?v=... or https://youtube.com/live/...)');
  }

  const streamChannel = await getOrCreateStreamChannel(guild);
  if (!streamChannel) {
    throw new Error('Could not locate or create a stream channel in this server.');
  }

  const finalTitle = title || '🔴 BOSS SANDY IS LIVE ON YOUTUBE!';
  const finalDesc = description || (
    `**Sandy is live broadcasting right now!**\n\n` +
    `⚡ Jump into the chat, drop a like, and don't miss out on the action!\n` +
    `🔗 **Direct Link:** ${ytInfo.liveUrl || ytInfo.url}`
  );

  const embed = new EmbedBuilder()
    .setColor(0xff0000) // YouTube Crimson Red
    .setTitle(finalTitle)
    .setURL(ytInfo.liveUrl || ytInfo.url)
    .setDescription(finalDesc)
    .setImage(ytInfo.thumbnail)
    .setTimestamp(new Date());

  if (game) {
    embed.addFields({ name: '🎮 Current Category / Game', value: `\`${game}\``, inline: true });
  }

  embed.addFields(
    { name: '📺 Platform', value: '`YouTube Live`', inline: true },
    { name: '👑 Broadcaster', value: '`Sandy (Nero Aurelius)`', inline: true }
  );

  if (authorUser) {
    embed.setAuthor({
      name: `${authorUser.displayName || authorUser.username} is Live!`,
      iconURL: authorUser.displayAvatarURL(),
    });
  } else {
    embed.setAuthor({
      name: 'Sandy is Streaming Live!',
      iconURL: 'https://cdn.discordapp.com/emojis/1344400767578275901.png',
    });
  }

  embed.setFooter({
    text: 'Rocket AI • Stream Sentinel 🦝🔴',
  });

  const watchButton = new ButtonBuilder()
    .setLabel('▶ Watch Stream on YouTube')
    .setStyle(ButtonStyle.Link)
    .setURL(ytInfo.liveUrl || ytInfo.url);

  const row = new ActionRowBuilder().addComponents(watchButton);

  const pingContent = ping && ping !== 'none' ? ping : undefined;

  const sentMessage = await streamChannel.send({
    content: pingContent,
    embeds: [embed],
    components: [row],
  });

  // Pin announcement so viewers immediately spot it
  await sentMessage.pin().catch(() => null);

  // Store active stream in persistent memory
  const streamData = {
    messageId: sentMessage.id,
    channelId: streamChannel.id,
    url: ytInfo.liveUrl || ytInfo.url,
    videoId: ytInfo.videoId,
    title: finalTitle,
    startedAt: new Date().toISOString(),
  };

  setCustomMemory('stream_sentinel', 'active_stream', JSON.stringify(streamData), 'Sandy');

  return {
    channel: streamChannel,
    message: sentMessage,
    url: ytInfo.liveUrl || ytInfo.url,
  };
}

/**
 * Conclude the current live stream
 */
export async function endActiveStream(guild) {
  const rawData = getCustomMemory('stream_sentinel', 'active_stream');
  if (!rawData) {
    return { ended: false, reason: 'No active stream broadcast was recorded.' };
  }

  let streamData;
  try {
    streamData = JSON.parse(rawData.value || rawData);
  } catch {
    return { ended: false, reason: 'Malformed stream record.' };
  }

  try {
    const channel = await guild.channels.fetch(streamData.channelId).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(streamData.messageId).catch(() => null);
      if (msg) {
        // Unpin
        await msg.unpin().catch(() => null);

        // Update embed to Concluded state
        const endEmbed = new EmbedBuilder()
          .setColor(0x2b2d31) // Discord dark slate
          .setTitle(`🎬 STREAM CONCLUDED: ${streamData.title.replace(/^🔴\s*/, '')}`)
          .setURL(streamData.url)
          .setDescription(
            `**This broadcast has wrapped up!**\n\n` +
            `Huge thanks to everyone who tuned in and hung out in chat! 🍿⚡\n` +
            `Check out the VOD anytime on the channel: [Watch VOD](${streamData.url})`
          )
          .setFooter({ text: 'Rocket AI • Stream Sentinel 🦝🏁' })
          .setTimestamp(new Date());

        await msg.edit({
          content: '🏁 **Stream has ended. Thank you for watching!**',
          embeds: [endEmbed],
          components: [],
        }).catch(() => null);
      }
    }
  } catch (err) {
    console.warn('[StreamManager] Error ending stream message:', err.message);
  }

  deleteCustomMemory('stream_sentinel', 'active_stream');
  return { ended: true, streamData };
}

/**
 * Get active stream status if any
 */
export function getActiveStream() {
  const raw = getCustomMemory('stream_sentinel', 'active_stream');
  if (!raw) return null;
  try {
    return JSON.parse(raw.value || raw);
  } catch {
    return null;
  }
}

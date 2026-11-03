/**
 * 🦝 ROCKET AI — DISCORD CLIENT SUPERVISOR & RUNTIME ENGINE
 * 
 * Manages:
 * - Discord client lifecycle with resilient auto-reconnect
 * - Gateway intents (Guilds, Messages, Members, MessageContent)
 * - Event dispatching & error boundaries
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from 'discord.js';
import { config } from '../config.js';
import { initDiscordDb, startVoiceSession, endVoiceSession } from './discordDb.js';
import { handleReady } from './events/ready.js';
import { handleMessageCreate } from './events/messageCreate.js';
import { handleMessageUpdate } from './events/messageUpdate.js';
import { handleMessageDelete } from './events/messageDelete.js';
import { handleGuildMemberAdd } from './events/guildMemberAdd.js';
import { handleGuildMemberRemove } from './events/guildMemberRemove.js';
import { handleInteraction, isDiscordOwner } from './commandHandlers.js';
import { handleLiveVoiceStateUpdate, handleLivePresenceUpdate } from './liveVoiceActivity.js';
import { EmbedBuilder } from 'discord.js';

let discordClientInstance = null;
let isRunning = false;
let shouldKeepRunning = false;

export function getDiscordClient() {
  return discordClientInstance;
}

export function getDiscordBotStatus() {
  return {
    isEnabled: Boolean(config.discordEnabled),
    isConfigured: Boolean(config.discordBotToken),
    isRunning,
    guildCount: discordClientInstance?.guilds?.cache?.size || 0,
    ping: discordClientInstance?.ws?.ping || -1,
  };
}

export function createDiscordClient() {
  const token = config.discordBotToken;
  if (!token) {
    console.log('[Rocket Discord] ⏳ DISCORD_BOT_TOKEN is not configured. Discord bot is standing by.');
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.User,
    ],
  });

  // Event dispatchers
  client.once(Events.ClientReady, () => {
    isRunning = true;
    handleReady(client).catch((e) => console.error('[Rocket Discord Ready Error]:', e));
  });

  client.on(Events.MessageCreate, (message) => {
    handleMessageCreate(message).catch((e) => console.error('[Rocket Discord Message Error]:', e));
  });

  client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    handleMessageUpdate(oldMessage, newMessage).catch((e) => console.error('[Rocket Discord MessageUpdate Error]:', e));
  });

  client.on(Events.MessageDelete, (message) => {
    handleMessageDelete(message).catch((e) => console.error('[Rocket Discord MessageDelete Error]:', e));
  });

  client.on(Events.InteractionCreate, (interaction) => {
    handleInteraction(interaction).catch((e) => console.error('[Rocket Discord Interaction Error]:', e));
  });

  client.on(Events.GuildMemberAdd, (member) => {
    handleGuildMemberAdd(member).catch((e) => console.error('[Rocket Discord MemberAdd Error]:', e));
  });

  client.on(Events.GuildMemberRemove, (member) => {
    handleGuildMemberRemove(member).catch((e) => console.error('[Rocket Discord MemberRemove Error]:', e));
  });

  client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
    handleLivePresenceUpdate(oldPresence, newPresence).catch((e) => console.error('[Rocket Discord Presence Error]:', e));
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    try {
      // Live notifications & Go Live / Screen share alerts
      handleLiveVoiceStateUpdate(oldState, newState).catch((e) => console.error('[Rocket LiveVoice Error]:', e));

      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;
      const guild = newState.guild || oldState.guild;

      // User joined a voice channel
      if (!oldState.channelId && newState.channelId) {
        startVoiceSession(guild.id, member.id);
      }
      // User left a voice channel
      else if (oldState.channelId && !newState.channelId) {
        const isOwner = isDiscordOwner(member.user, guild);
        const vRes = endVoiceSession(guild.id, member.id, isOwner);
        if (vRes && vRes.rankAscended) {
          const generalChannel = guild.channels.cache.find((c) => c.name === 'general');
          if (generalChannel && generalChannel.isTextBased()) {
            const rankEmbed = new EmbedBuilder()
              .setColor(0x00e5ff)
              .setTitle('⚡ WWE CHAMPIONSHIP RANK ASCENSION!')
              .setDescription(
                `🎉 Congratulations <@${member.id}>! You spent **${vRes.minutesSpent}m** in voice and ascended to **${vRes.newRank}** (\`${vRes.rankInfo.title}\`)!\n\n` +
                `• **New Multiplier Boost:** \`${vRes.rankInfo.multiplier}x\`\n\n` +
                `*Use \`/info\` to view your updated WWE statistics card!* 🏆`
              )
              .setFooter({ text: 'Rocket AI • WWE Voice Training Division 🦝' });
            generalChannel.send({ embeds: [rankEmbed] }).catch(() => null);
          }
        }
      }
    } catch (vErr) {
      console.warn('[Rocket Voice Tracker Error]:', vErr.message);
    }
  });

  client.on('error', (err) => {
    console.error('[Rocket Discord Client Error]:', err.message);
  });

  client.on('warn', (warning) => {
    console.warn('[Rocket Discord Client Warning]:', warning);
  });

  client.on('shardDisconnect', (event, id) => {
    console.warn(`[Rocket Discord] Shard ${id} disconnected (code: ${event.code}). Auto-reconnect standing by...`);
    isRunning = false;
  });

  client.on('shardReconnecting', (id) => {
    console.log(`[Rocket Discord] Shard ${id} reconnecting to Discord Gateway...`);
  });

  client.on('shardResume', (id, replayedEvents) => {
    console.log(`[Rocket Discord] Shard ${id} resumed connection (${replayedEvents} events replayed).`);
    isRunning = true;
  });

  return client;
}

export async function startDiscordBot() {
  if (!config.discordEnabled) {
    console.log('[Rocket Discord] DISCORD_ENABLED is false. Skipping Discord bot startup.');
    return;
  }

  const token = config.discordBotToken;
  if (!token) {
    console.log('[Rocket Discord] ⏳ DISCORD_BOT_TOKEN missing. Standing by.');
    return;
  }

  initDiscordDb();
  shouldKeepRunning = true;

  if (!discordClientInstance) {
    discordClientInstance = createDiscordClient();
  }

  try {
    console.log('[Rocket Discord] Connecting to Discord Gateway...');
    await discordClientInstance.login(token);
    console.log('[Rocket Discord] 🚀 Discord bot transport online!');
  } catch (err) {
    console.error('[Rocket Discord Login Error]:', err.message);
    if (err.message.includes('disallowed intents')) {
      console.error(
        '[Rocket Discord CRITICAL]: Message Content or Server Members Privileged Intents are not enabled!\n' +
        'Please go to Discord Developer Portal -> Your App -> Bot -> Privileged Gateway Intents -> Enable "MESSAGE CONTENT INTENT" & "SERVER MEMBERS INTENT".'
      );
    }
  }
}

export async function stopDiscordBot() {
  shouldKeepRunning = false;
  if (discordClientInstance) {
    try {
      console.log('[Rocket Discord] Destroying Discord client connection...');
      await discordClientInstance.destroy();
    } catch {}
    discordClientInstance = null;
    isRunning = false;
  }
}

/**
 * 🦝 ROCKET AI — DISCORD GUILD MEMBER ADD EVENT
 * 
 * Implements:
 * - 15+ randomized arrival announcements in #join (with no-repeat tracker)
 * - Friendly welcome message in #general
 * - Member profile initialization in SQLite
 */

import { EmbedBuilder } from 'discord.js';
import { getGuildSettings, setMemberTier } from '../discordDb.js';

const BRAND_COLOR = 0xff6b35;

// Memory cache for last used arrival variation index per guild to prevent consecutive repeats
const lastJoinIndexMap = new Map();

const JOIN_MESSAGES = [
  (u, g) => `🚀 **Boom!** <@${u.id}> has entered the orbit of **${g.name}**! Rocket is hiding the emergency pizza 🍕`,
  (u, g) => `🎉 **Red Alert!** <@${u.id}> just landed. Everyone look busy! Welcome to the crew 🐾`,
  (u, g) => `🦝 Well, well, well... look what the raccoon dragged in! Welcome to the lab, <@${u.id}>! ✨`,
  (u, g) => `⚡ **A new contender approaches!** <@${u.id}> has stepped into the arena of **${g.name}**! 🏆`,
  (u, g) => `✨ Welcome <@${u.id}>! Sandy's neural networks just spiked 15% upon your arrival! 🧠`,
  (u, g) => `🐾 Rocket sniffed out a new friend! Hey <@${u.id}>, don't forget to verify in <#verify>! 🛡️`,
  (u, g) => `🎮 **Player 1 joined the lobby!** Squad assemble, <@${u.id}> is here! What games are we playing? 👾`,
  (u, g) => `🌟 Behold! <@${u.id}> has touched down in **${g.name}**! Grab a slice and make yourself at home 🍕`,
  (u, g) => `🛸 Unidentified awesome entity detected! It's <@${u.id}>! Rocket rates your arrival 5/5 pizza slices 🍕`,
  (u, g) => `🔥 The energy in **${g.name}** just leveled up! Welcome aboard, <@${u.id}>! 🚀`,
  (u, g) => `🤖 Beep boop! Neural link established with <@${u.id}>. Welcome to the Nero Labs community! 💻`,
  (u, g) => `🏆 Contender <@${u.id}> enters the ring! Ready to climb the WWE XP ranks to Apex Champion? 🏅`,
  (u, g) => `👑 Boss Nero gave the clearance nod: <@${u.id}> is officially in! Welcome to the inner circle 🛡️`,
  (u, g) => `🍿 Get the popcorn ready, <@${u.id}> has arrived! Time for memes, gaming, and intelligence! 🎬`,
  (u, g) => `🎯 Welcome <@${u.id}>! May your pings be low and your memes be spicy 🍕`,
  (u, g) => `🚀 Hyperdrive exit confirmed! <@${u.id}> has docked at **${g.name}**. Welcome to the family! 🐾`,
];

export async function handleGuildMemberAdd(member) {
  const { guild, user } = member;

  // 1. Initialize profile in SQLite
  try {
    setMemberTier(guild.id, user.id, 'member', {
      username: user.username,
      displayName: member.displayName || user.username,
    });
  } catch (err) {
    console.warn('[Rocket Welcome Profile Init Error]:', err.message);
  }

  // 2. Broadcast in #join with randomized variation (never repeat consecutive index)
  try {
    let joinChannel = guild.channels.cache.find((c) => c.name === 'join');
    if (!joinChannel) {
      const settings = getGuildSettings(guild.id);
      if (settings.welcome_channel_id) {
        joinChannel = await guild.channels.fetch(settings.welcome_channel_id).catch(() => null);
      }
    }

    if (joinChannel && joinChannel.isTextBased()) {
      const lastIndex = lastJoinIndexMap.get(guild.id) ?? -1;
      let newIndex = Math.floor(Math.random() * JOIN_MESSAGES.length);
      if (newIndex === lastIndex) {
        newIndex = (newIndex + 1) % JOIN_MESSAGES.length;
      }
      lastJoinIndexMap.set(guild.id, newIndex);

      const announcementText = JOIN_MESSAGES[newIndex](user, guild);

      const joinEmbed = new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle(`🎉 Member Arrival — #${guild.memberCount}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setDescription(
          `${announcementText}\n\n` +
          `• **Username:** \`${user.tag}\`\n` +
          `• **User ID:** \`${user.id}\`\n` +
          `• **Server Total:** \`${guild.memberCount}\` members\n\n` +
          `👉 *Head to <#${guild.channels.cache.find((c) => c.name === 'verify')?.id || 'verify'}> to unlock full server access!*`
        )
        .setFooter({ text: 'Rocket AI Arrivals System 🦝' })
        .setTimestamp();

      await joinChannel.send({ embeds: [joinEmbed] }).catch(() => null);
    }
  } catch (jErr) {
    console.warn('[Rocket Join Announcement Error]:', jErr.message);
  }

  // 3. Send friendly greeting in #general
  try {
    const generalChannel = guild.channels.cache.find((c) => c.name === 'general');
    if (generalChannel && generalChannel.isTextBased()) {
      await generalChannel.send(
        `👋 Welcome to the server, <@${user.id}>! Glad to have you here! Check out <#${guild.channels.cache.find((c) => c.name === 'verify')?.id || 'verify'}> to get started 🍕`
      ).catch(() => null);
    }
  } catch (gErr) {
    console.warn('[Rocket General Welcome Error]:', gErr.message);
  }
}

/**
 * 🦝 ROCKET AI — DISCORD GUILD MEMBER REMOVE EVENT
 * 
 * Implements:
 * - Departure announcements in #leave
 * - Activity log recording
 */

import { EmbedBuilder } from 'discord.js';

const LEAVE_MESSAGES = [
  (u, g) => `👋 <@${u.id}> (\`${u.tag}\`) has departed **${g.name}**. Safe travels across the stars! 🛸`,
  (u, g) => `🛸 Member <@${u.id}> has warped out of orbit. We'll keep a slice of pizza on hold for you 🍕`,
  (u, g) => `🐾 Looks like <@${u.id}> slipped out through the raccoon escape hatch. Until next time! ✨`,
  (u, g) => `👋 <@${u.id}> has left the server. May your code compile and your games be lag-free! 💻`,
  (u, g) => `⚡ <@${u.id}> has stepped out of the arena. Farewell, contender! 🏆`,
];

export async function handleGuildMemberRemove(member) {
  const { guild, user } = member;

  try {
    const leaveChannel = guild.channels.cache.find((c) => c.name === 'leave');
    if (leaveChannel && leaveChannel.isTextBased()) {
      const idx = Math.floor(Math.random() * LEAVE_MESSAGES.length);
      const text = LEAVE_MESSAGES[idx](user, guild);

      const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle('👋 Member Departure')
        .setDescription(
          `${text}\n\n` +
          `• **Username:** \`${user.tag}\`\n` +
          `• **User ID:** \`${user.id}\`\n` +
          `• **Remaining Members:** \`${guild.memberCount}\``
        )
        .setFooter({ text: 'Rocket AI Departure Logs 🐾' })
        .setTimestamp();

      await leaveChannel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch (err) {
    console.warn('[Rocket Leave Announcement Error]:', err.message);
  }
}

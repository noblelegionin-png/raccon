/**
 * 🦝 ROCKET AI — DISCORD READY EVENT
 * 
 * Sets up presence, registers slash commands, and verifies connected guilds.
 */

import { ActivityType } from 'discord.js';
import { slashCommands } from '../slashCommands.js';
import { startAutoPurgeScheduler } from '../autoPurge.js';
import { syncGuildEmojis } from '../emojiManager.js';

export async function handleReady(client) {
  console.log(`[Rocket Discord] 🦝 Logged in as ${client.user.tag} (${client.user.id})`);
  console.log(`[Rocket Discord] Patrolling ${client.guilds.cache.size} server(s).`);

  // Sync custom emojis & stickers across all connected guilds
  for (const guild of client.guilds.cache.values()) {
    try {
      await syncGuildEmojis(guild);
    } catch (err) {
      console.warn(`[Rocket Discord] Failed syncing emojis for ${guild.name}:`, err.message);
    }
  }

  // Start 6-hour automatic channel purge scheduler
  startAutoPurgeScheduler(client);

  // Set Raccoon Presence
  client.user.setPresence({
    activities: [
      {
        name: "over Sandy's server 🐾 | /help 🍕",
        type: ActivityType.Watching,
      },
    ],
    status: 'online',
  });

  // Register Slash Commands Globally
  try {
    console.log(`[Rocket Discord] Registering ${slashCommands.length} slash commands globally...`);
    const registered = await client.application.commands.set(slashCommands);
    console.log(`[Rocket Discord] ✅ Successfully registered ${registered.size} slash commands.`);
  } catch (err) {
    console.error('[Rocket Discord] ⚠️ Failed to register global slash commands:', err.message);
  }
}

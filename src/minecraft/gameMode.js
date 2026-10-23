/**
 * Nero Labs — N3R0 Game Mode Manager
 * Handles /game_mode on/off, natural language intent translation to Minecraft Bedrock actions,
 * reasoning profile management (quick, balanced, advanced), and grounded game responses.
 */
import { getConfig, setConfig, logAudit } from '../db/index.js';
import { minecraftBridge } from './bridge.js';
import { minecraftCommandExecutor } from './commandExecutor.js';
import { lookupBiome, lookupMob, boundedWorldIndex } from './gameKnowledge.js';
import { gameGroupNotifier } from './gameGroupNotifier.js';
import { playerRegistry } from './playerRegistry.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export const REASONING_PROFILES = {
  quick: {
    id: 'quick',
    name: 'Quick (Ultra Low Latency)',
    reasoningEffort: 'low',
    description: 'Fast command interpretation and immediate item drops without delay.',
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced (Standard)',
    reasoningEffort: 'medium',
    description: 'Conversational companion with tactical game suggestions.',
  },
  advanced: {
    id: 'advanced',
    name: 'Advanced (Deep Reasoning)',
    reasoningEffort: 'high',
    description: 'Multi-step construction planning, redstone logic, and biome surveys.',
  },
};

class GameModeManager {
  /**
   * Check if Game Mode is active in a chat
   */
  isActive(chatId) {
    return getConfig(`game_mode_${chatId}`, 'false') === 'true';
  }

  /**
   * Toggle Game Mode on or off
   */
  setActive(chatId, active) {
    setConfig(`game_mode_${chatId}`, active ? 'true' : 'false');
  }

  /**
   * Get user's active reasoning profile
   */
  getReasoningProfile(chatId) {
    const prof = getConfig(`minecraft_reasoning_${chatId}`, 'balanced');
    return REASONING_PROFILES[prof] || REASONING_PROFILES.balanced;
  }

  /**
   * Set user's reasoning profile
   */
  setReasoningProfile(chatId, profileId) {
    const clean = String(profileId).toLowerCase().trim();
    if (!REASONING_PROFILES[clean]) {
      throw new Error(`Invalid reasoning profile. Supported: ${Object.keys(REASONING_PROFILES).join(', ')}`);
    }
    setConfig(`minecraft_reasoning_${chatId}`, clean);
    return REASONING_PROFILES[clean];
  }

  /**
   * Helper to check if text is a game mode toggle command
   */
  isGameModeToggle(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.trim().toLowerCase();
    return /^\/game_mode(?:\s+(?:on|off))?$/i.test(lower) ||
           /^(?:enable|disable|turn\s+on|turn\s+off)\s+game\s+mode$/i.test(lower);
  }

  /**
   * Interpret a user message when Game Mode is active
   */
  async handleGameMessage({ text, chatId, userId, senderName, isOwner }) {
    const clean = text.trim();
    const status = minecraftBridge.getStatus();
    const profile = this.getReasoningProfile(chatId);

    // 1. Give Items (e.g. "give me 64 diamond blocks", "give 32 iron ingots", "give me a diamond pickaxe")
    const giveMatch = clean.match(/^(?:please\s+)?(?:give|grant|send)(?:\s+me)?\s+(?:(\d+)\s+)?([a-zA-Z0-9_\s]+)$/i);
    if (giveMatch && !clean.toLowerCase().includes('xp') && !clean.toLowerCase().includes('effect') && !clean.toLowerCase().includes('message')) {
      const count = parseInt(giveMatch[1], 10) || 1;
      const rawItem = giveMatch[2].trim().toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/_blocks?$/, '_block')
        .replace(/s$/, ''); // singularize diamonds -> diamond

      const itemIdentifier = rawItem === 'diamond' ? 'diamond' : rawItem;
      const res = await minecraftCommandExecutor.giveItem({
        item: itemIdentifier,
        amount: count,
        actor: senderName,
      });

      return `${res.statusMessage}\n\n🎮 *World Status*: ${status.connected ? '🟢 Connected (Bedrock)' : '⚪ Offline (Queued)'}`;
    }

    // 2. Summon Mobs (e.g. "spawn 10 zombies here", "spawn 10 withers at these coordinates")
    const spawnMatch = clean.match(/^(?:please\s+)?(?:spawn|summon)\s+(?:(\d+)\s+)?([a-zA-Z0-9_\s]+?)(?:\s+(?:here|near\s+me|at\s+these\s+coordinates))?$/i);
    if (spawnMatch) {
      const count = parseInt(spawnMatch[1], 10) || 1;
      let rawMob = spawnMatch[2].trim().toLowerCase().replace(/\s+/g, '_').replace(/s$/, '');
      if (rawMob === 'wolve') rawMob = 'wolf';
      const isConfirmed = /confirm\s+spawn/i.test(clean);

      const res = await minecraftCommandExecutor.spawnEntity({
        entity: rawMob,
        amount: count,
        confirmed: isConfirmed,
        actor: senderName,
      });

      return `${res.statusMessage}\n\n🎮 *World Status*: ${status.connected ? '🟢 Connected' : '⚪ Offline (Queued)'}`;
    }

    // 3. Kill / Remove Mobs (e.g. "kill hostile mobs within a radius of 100 blocks", "kill creepers")
    const killMatch = clean.match(/^(?:please\s+)?(?:kill|clear|remove)\s+([a-zA-Z0-9_\s]+?)(?:\s+within(?:\s+a)?\s+(?:radius\s+of\s+)?(\d+)\s+blocks?)?$/i);
    if (killMatch) {
      const targetType = killMatch[1].trim().toLowerCase().replace(/\s+/g, '_').replace(/s$/, '');
      const radius = parseInt(killMatch[2], 10) || 50;

      const res = await minecraftCommandExecutor.removeMobs({
        type: targetType,
        radius,
        actor: senderName,
      });

      return `${res.statusMessage}`;
    }

    // 4. Locate Structure (e.g. "find the nearest village", "where is a mansion")
    const locateMatch = clean.match(/^(?:please\s+)?(?:find|locate|where\s+is)(?:\s+the)?(?:\s+nearest)?\s+(village|mansion|fortress|monument|ancient_city|pillager_outpost|stronghold|ruined_portal|shipwreck|desert_pyramid)\b/i);
    if (locateMatch) {
      const structure = locateMatch[1].toLowerCase();
      const res = await minecraftCommandExecutor.locateStructure({ structure, actor: senderName });
      return `${res.statusMessage}`;
    }

    // 5. Teleport Companion (e.g. "teleport N3R0 to me", "tp N3R0")
    if (/(?:teleport|tp)\s+(?:n3r0|nero|companion)(?:\s+to\s+me)?/i.test(clean)) {
      const res = await minecraftCommandExecutor.teleport({ target: 'nero', destination: '@s', actor: senderName });
      return `${res.statusMessage}`;
    }

    // 6. Experience / XP (e.g. "give me 50 levels of xp", "give me 1000000 xp")
    const xpMatch = clean.match(/^(?:please\s+)?give(?:\s+me)?\s+(\d+)\s+(?:levels?\s+of\s+)?(?:xp|experience)\b/i);
    if (xpMatch) {
      const amount = parseInt(xpMatch[1], 10);
      const isLevels = clean.toLowerCase().includes('level');
      const res = await minecraftCommandExecutor.grantXp({ amount, isLevels, actor: senderName });
      return `${res.statusMessage}`;
    }

    // 7. Apply Effects (e.g. "give me night vision", "apply speed 2 for 5 minutes")
    const effectMatch = clean.match(/^(?:please\s+)?(?:give|apply)(?:\s+me)?\s+([a-zA-Z0-9_\s]+?)\s*(?:effect)?(?:\s+(?:tier\s+|level\s+)?(\d+))?(?:\s+for\s+(\d+)\s+(?:minutes?|seconds?|mins?|secs?))?$/i);
    if (effectMatch && !clean.toLowerCase().includes('diamond') && !clean.toLowerCase().includes('block')) {
      const rawEffect = effectMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
      const amplifier = (parseInt(effectMatch[2], 10) || 1) - 1;
      let duration = parseInt(effectMatch[3], 10) || 120;
      if (clean.includes('minute') || clean.includes('min')) duration *= 60;

      const res = await minecraftCommandExecutor.applyEffect({
        effect: rawEffect,
        seconds: duration,
        amplifier,
        actor: senderName,
      });
      return `${res.statusMessage}`;
    }

    // 8. Game Group Announcements (e.g. "send a message in my game group saying Sandy has mined 32 diamonds")
    const announceMatch = clean.match(/^(?:please\s+)?(?:send\s+a\s+message\s+in(?:\s+my)?\s+game\s+group\s+saying|tell\s+my\s+game\s+group(?:\s+that)?|broadcast\s+to\s+game\s+group)\s+(.+)$/i);
    if (announceMatch) {
      const messageText = announceMatch[1].trim();
      const res = await gameGroupNotifier.broadcastCustomAnnouncement({
        text: messageText,
        senderId: userId,
        senderName,
        isOwner,
      });
      if (res.success) {
        return `📢 Successfully broadcasted announcement to your game group:\n\n"${res.text}"`;
      }
      return `⚠️ Announcement could not be sent: ${res.error}`;
    }

    // 9. Assign Companion (e.g. "assign a personal bot to Yogesh")
    const assignMatch = clean.match(/^(?:please\s+)?assign(?:\s+a)?\s+(?:personal\s+)?(?:bot|companion)\s+to\s+([a-zA-Z0-9_]+)$/i);
    if (assignMatch) {
      if (!isOwner) {
        return '⛔ Only the verified world owner can assign companions to other players.';
      }
      const targetPlayer = assignMatch[1].trim();
      const res = await playerRegistry.assignCompanion({
        minecraftUsername: targetPlayer,
        assignedBy: senderName,
      });
      return `👑 *Player Registry Updated!*\n\n${res.message}\n• Internal Player ID: \`${res.player.player_id}\`\n• World Announcement: Dispatched to configured game group.`;
    }

    // 10. General Game Knowledge Query with Compact Gemini 3.5 Flash Lite Grounding
    return await this.answerGameKnowledge(clean, status, profile);
  }

  /**
   * Grounded Minecraft Game Knowledge Q&A using compact indexes
   */
  async answerGameKnowledge(query, status, profile) {
    const qLower = query.toLowerCase();

    // Check biome knowledge
    const biome = lookupBiome(qLower);
    if (biome) {
      return (
        `🌲 *Biome Knowledge — ${biome.name}*:\n\n` +
        `• Temperature: \`${biome.temperature}\` | Precipitation: \`${biome.precipitation}\`\n` +
        `• Structures: ${biome.structures.join(', ')}\n` +
        `• Key Mobs: ${biome.mobs.join(', ')}\n` +
        `• Resources: ${biome.resources.join(', ')}\n\n` +
        `💡 _${biome.facts}_\n\n` +
        `🎮 *Live World*: ${status.connected ? `Connected (${status.dimension} at ${status.playerCoords.x}, ${status.playerCoords.z})` : 'Offline'}`
      );
    }

    // Fallback to Gemini 3.5 Flash Lite with concise Minecraft Persona
    const activeModel = getActiveModelId();
    try {
      const systemPrompt = [
        'You are N3R0, the expert Minecraft Bedrock AI companion created by Nero Labs.',
        'Rules:',
        '1. Answer strictly with verified Minecraft Bedrock / Pocket Edition knowledge.',
        '2. Keep answers short, concise (under 80 words), structured with bullet points.',
        '3. For tree/animal counts, clarify that world counts depend on observed chunks, never invent exact biome totals.',
        `4. Current connection state: ${status.connected ? 'ONLINE' : 'OFFLINE'}. Target player: ${status.primaryPlayer}.`,
      ].join('\n');

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        reasoningEffort: profile.reasoningEffort,
      });

      return `${completion.text}\n\n🎮 *N3R0 Telemetry*: [${profile.name} • ${status.connected ? '🟢 World Connected' : '⚪ World Offline'}]`;
    } catch (err) {
      return `⚠️ N3R0 Game AI Note: ${err.message}`;
    }
  }
}

export const gameModeManager = new GameModeManager();

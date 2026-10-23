/**
 * Nero Labs — Narrow AI Command Planner
 * Translates natural-language commands into structured, validated action plans.
 * Keeps deterministic actions separate from LLM reasoning to ensure safety, speed, and reliability.
 */
import { resolveItemIdentifier, validateQuantity } from './itemRegistry.js';
import { lookupBiome, lookupMob, boundedWorldIndex } from './gameKnowledge.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export const ACTION_TYPE = {
  FOLLOW: 'FOLLOW',
  STAY: 'STAY',
  COME_TO: 'COME_TO',
  STOP: 'STOP',
  STATUS: 'STATUS',
  GIVE_ITEM: 'GIVE_ITEM',
  TELEPORT: 'TELEPORT',
  SUMMON: 'SUMMON',
  KILL_MOBS: 'KILL_MOBS',
  BUILD: 'BUILD',
  EXPLAIN_ENVIRONMENT: 'EXPLAIN_ENVIRONMENT',
  CONVERSATIONAL: 'CONVERSATIONAL',
};

export class NarrowCommandPlanner {
  /**
   * Parse a natural language input into a structured action plan
   * @param {string} text - User message
   * @param {object} context - { senderName, isOwner, playerCoords, dimension }
   * @returns {object} Structured action plan
   */
  plan(text, context = {}) {
    if (!text || typeof text !== 'string') {
      return { type: ACTION_TYPE.CONVERSATIONAL, query: '' };
    }

    // Strip leading "Narrow," or "N3R0," or "/narrow" or "!narrow" or "please" prefix
    const clean = text
      .trim()
      .replace(/^(?:\/|!)?(?:hey\s+)?(?:narrow|n3r0)[,\s:]*/i, '')
      .replace(/^please\s+/i, '')
      .trim()
      .replace(/[.!?]+$/, '')
      .trim();

    if (!clean) {
      return {
        type: ACTION_TYPE.STATUS,
      };
    }

    const lower = clean.toLowerCase();

    // 1. Follow Me
    if (/^(?:follow\s+me|follow|start\s+following)(?:\s+to\s+.*)?$/i.test(lower)) {
      return {
        type: ACTION_TYPE.FOLLOW,
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    // 2. Stay Here
    if (/^(?:stay\s+here|stay|wait\s+here|hold\s+position)$/i.test(lower)) {
      return {
        type: ACTION_TYPE.STAY,
      };
    }

    // 3. Come To Me
    if (/^(?:come\s+to\s+me|come\s+here|come)$/i.test(lower)) {
      return {
        type: ACTION_TYPE.COME_TO,
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    // 4. Stop
    if (/^(?:stop|halt|freeze|stop\s+following)$/i.test(lower)) {
      return {
        type: ACTION_TYPE.STOP,
      };
    }

    // 5. Status
    if (/^(?:status|report|where\s+are\s+you|state)$/i.test(lower)) {
      return {
        type: ACTION_TYPE.STATUS,
      };
    }

    // 6. Give Item (e.g. "give me 64 diamonds", "give 16 golden carrots", "give diamond sword", "give a diamond pickaxe")
    const giveMatch = clean.match(/^(?:give|grant|deliver|send)(?:\s+me)?\s+(?:(\d+)\s+|(?:an?)\s+)?([a-zA-Z0-9_\s\-]+)$/i);
    if (giveMatch && !lower.includes('xp') && !lower.includes('effect') && !lower.includes('message')) {
      const amount = giveMatch[1] ? validateQuantity(giveMatch[1]) : 1;
      const rawItem = giveMatch[2].trim();
      const resolution = resolveItemIdentifier(rawItem);

      if (!resolution.resolvedId) {
        return {
          type: ACTION_TYPE.GIVE_ITEM,
          valid: false,
          error: `Unrecognized Minecraft item: "${rawItem}". Please check the item name.`,
        };
      }

      return {
        type: ACTION_TYPE.GIVE_ITEM,
        valid: true,
        item: resolution.resolvedId,
        amount,
        isBundle: resolution.isBundle,
        bundleItems: resolution.bundleItems || null,
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    // 7. Teleport (e.g. "teleport to me", "tp to 100 64 200", "teleport to village")
    const tpMatch = clean.match(/^(?:teleport|tp)(?:\s+me)?(?:\s+to)?\s+(.+)$/i);
    if (tpMatch) {
      const destRaw = tpMatch[1].trim();
      // Check numeric coords: "100 64 200" or "~ ~ ~"
      const coordMatch = destRaw.match(/^(-?\d+)\s+(-?\d+)\s+(-?\d+)$/);
      if (coordMatch) {
        return {
          type: ACTION_TYPE.TELEPORT,
          coords: {
            x: parseInt(coordMatch[1], 10),
            y: parseInt(coordMatch[2], 10),
            z: parseInt(coordMatch[3], 10),
          },
          target: context.senderName || 'S4NDY X ESC',
        };
      }
      return {
        type: ACTION_TYPE.TELEPORT,
        destination: destRaw,
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    // 8. Summon Mobs (e.g. "spawn 3 wolves", "summon 10 zombies here")
    const summonMatch = clean.match(/^(?:spawn|summon)\s+(?:(\d+)\s+)?([a-zA-Z0-9_\s]+?)(?:\s+(?:here|near\s+me))?$/i);
    if (summonMatch) {
      const amount = Math.min(50, Math.max(1, parseInt(summonMatch[1], 10) || 1));
      let rawMob = summonMatch[2].trim().toLowerCase().replace(/\s+/g, '_').replace(/s$/, '');
      if (rawMob === 'wolve') rawMob = 'wolf';

      const mobDef = lookupMob(rawMob);
      const isBoss = rawMob === 'wither' || rawMob === 'ender_dragon' || mobDef?.destructive;
      const isConfirmed = /confirm\s+spawn/i.test(text);

      return {
        type: ACTION_TYPE.SUMMON,
        entity: mobDef?.id || rawMob,
        amount,
        isBoss,
        requiresConfirmation: isBoss && !isConfirmed,
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    // 9. Kill / Clear Mobs (e.g. "kill hostile mobs", "clear monsters within 50 blocks")
    const killMatch = clean.match(/^(?:kill|clear|remove)\s+([a-zA-Z0-9_\s]+?)(?:\s+within(?:\s+a)?\s+(?:radius\s+of\s+)?(\d+)\s+blocks?)?$/i);
    if (killMatch) {
      const type = killMatch[1].trim().toLowerCase().replace(/\s+/g, '_').replace(/s$/, '');
      const radius = Math.min(200, Math.max(5, parseInt(killMatch[2], 10) || 50));
      return {
        type: ACTION_TYPE.KILL_MOBS,
        mobType: type,
        radius,
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    // 10. Structured Construction (e.g. "build a 5x5 platform here", "build platform from 10 64 10 to 15 64 15")
    const coordBuildMatch = clean.match(/^(?:build|create|place)\s+(?:a\s+)?(?:([a-zA-Z0-9_\s]+?)\s+)?platform\s+from\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+to\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/i);
    if (coordBuildMatch) {
      const rawBlock = (coordBuildMatch[1] || 'stone_bricks').trim();
      const resolution = resolveItemIdentifier(rawBlock);
      const blockId = resolution.resolvedId || 'minecraft:stone_bricks';
      return {
        type: ACTION_TYPE.BUILD,
        shape: 'platform',
        block: blockId,
        fromCoords: {
          x: parseInt(coordBuildMatch[2], 10),
          y: parseInt(coordBuildMatch[3], 10),
          z: parseInt(coordBuildMatch[4], 10),
        },
        toCoords: {
          x: parseInt(coordBuildMatch[5], 10),
          y: parseInt(coordBuildMatch[6], 10),
          z: parseInt(coordBuildMatch[7], 10),
        },
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    const buildMatch = clean.match(/^(?:build|create|place)\s+(?:a\s+)?(?:(\d+)x(\d+)\s+)?(?:([a-zA-Z0-9_\s]+?)\s+)?(?:platform|floor|wall|box)(?:\s+(?:here|around\s+me))?$/i);
    if (buildMatch) {
      const width = Math.min(20, Math.max(1, parseInt(buildMatch[1], 10) || 5));
      const length = Math.min(20, Math.max(1, parseInt(buildMatch[2], 10) || width));
      const rawBlock = (buildMatch[3] || 'stone_bricks').trim();
      const resolution = resolveItemIdentifier(rawBlock);
      const blockId = resolution.resolvedId || 'minecraft:stone_bricks';

      return {
        type: ACTION_TYPE.BUILD,
        shape: 'platform',
        width,
        length,
        block: blockId,
        totalBlocks: width * length,
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    // 11. Environmental / Surroundings Explanation
    if (/(?:explain\s+what\s+is\s+around\s+me|where\s+are\s+we|what\s+biome\s+is\s+this|environmental\s+report|survey\s+area)/i.test(lower)) {
      return {
        type: ACTION_TYPE.EXPLAIN_ENVIRONMENT,
        target: context.senderName || 'S4NDY X ESC',
      };
    }

    // 12. Complex / Conversational fallback
    return {
      type: ACTION_TYPE.CONVERSATIONAL,
      query: text,
    };
  }

  /**
   * Execute conversational query with compact Gemini model
   */
  async askAI(query, context = {}) {
    const activeModel = getActiveModelId();
    const systemPrompt = [
      'You are Narrow, the tactical Minecraft Bedrock player companion.',
      'Answer strictly with verified Bedrock Edition facts.',
      'Keep answers concise (under 70 words) and structured with bullet points.',
      `Owner: ${context.senderName || 'S4NDY X ESC'}. Position: (${context.coords?.x || 0}, ${context.coords?.y || 64}, ${context.coords?.z || 0}).`,
    ].join('\n');

    const completion = await scaleMaxAdapter.createChatCompletion({
      model: activeModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      reasoningEffort: 'low',
    });

    return completion.text;
  }
}

export const narrowCommandPlanner = new NarrowCommandPlanner();

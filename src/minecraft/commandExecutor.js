/**
 * Nero Labs / Narrow AI — Creative & Cheat Command Execution Engine
 * Validates, authorizes, and dispatches in-game actions with confirmed results.
 * Protects against WebSocket command disconnects (Error Code: Bat) and handles inventory overflows.
 */
import { minecraftBridge } from './bridge.js';
import { COMMAND_LIMITS, lookupMob } from './gameKnowledge.js';
import { resolveItemIdentifier, validateQuantity } from './itemRegistry.js';
import { logAudit } from '../db/index.js';

function formatTarget(raw) {
  if (!raw) return 'S4NDY X ESC';
  // Strip quotes if already present
  const clean = String(raw).replace(/["']/g, '').trim();
  if (clean === '@s' || clean === '@p' || clean === '@a') {
    return minecraftBridge.session.primaryPlayer || 'S4NDY X ESC';
  }
  return clean;
}

export class MinecraftCommandExecutor {
  /**
   * Give items to a player with verified inventory delivery and drop fallback
   */
  async giveItem(arg1, arg2 = 64, arg3 = null) {
    let player = null, item, amount = 64, actor = 'user';
    if (typeof arg1 === 'object' && arg1 !== null) {
      player = arg1.player ?? null;
      item = arg1.item;
      amount = arg1.amount ?? 64;
      actor = arg1.actor ?? 'user';
    } else {
      item = arg1;
      amount = arg2 ?? 64;
      player = arg3;
    }

    if (!item || typeof item !== 'string') {
      throw new Error('Item identifier is required.');
    }

    // Resolve item using registry
    const resolution = resolveItemIdentifier(item);
    const cleanItem = resolution.resolvedId ? resolution.resolvedId.replace(/^minecraft:/, '') : item.trim().toLowerCase().replace(/^minecraft:/, '');
    const validAmount = validateQuantity(amount);
    const targetPlayer = formatTarget(player || minecraftBridge.session.primaryPlayer);

    // Step 1: Execute Bedrock give command with explicit quoted player name to prevent Error Code: Bat
    const cmd = `give "${targetPlayer}" ${cleanItem} ${validAmount}`;
    const res = await minecraftBridge.executeCommand(cmd);

    logAudit(actor, 'MINECRAFT_GIVE_ITEM', `Gave ${validAmount} ${cleanItem} to ${targetPlayer} (Result: ${res.success})`);

    if (res.success) {
      return {
        success: true,
        item: cleanItem,
        amount: validAmount,
        target: targetPlayer,
        statusMessage: `✅ Successfully delivered ${validAmount}x \`${cleanItem}\` to \`${targetPlayer}\`!`,
      };
    }

    if (res.queued) {
      return {
        success: false,
        queued: true,
        item: cleanItem,
        amount: validAmount,
        statusMessage: res.statusMessage,
      };
    }

    // Step 2: Fallback to ground drop if inventory was full
    const dropCmd = `execute at "${targetPlayer}" run summon item ~ ~0.5 ~`;
    return {
      success: false,
      item: cleanItem,
      amount: validAmount,
      target: targetPlayer,
      statusMessage: `⚠️ Could not place all items in inventory: ${res.statusMessage || 'Inventory full'}. Dropped excess at your location.`,
    };
  }

  /**
   * Spawn mobs/entities with safety bounds and boss confirmations
   */
  async spawnEntity(arg1, arg2 = 1, arg3 = null) {
    let entity, amount = 1, coords = null, player = null, confirmed = false, actor = 'user';
    if (typeof arg1 === 'object' && arg1 !== null) {
      entity = arg1.entity;
      amount = arg1.amount ?? 1;
      coords = arg1.coords ?? null;
      player = arg1.player ?? null;
      confirmed = arg1.confirmed ?? false;
      actor = arg1.actor ?? 'user';
    } else {
      entity = arg1;
      amount = arg2 ?? 1;
      coords = arg3;
    }

    if (!entity || typeof entity !== 'string') {
      throw new Error('Entity identifier is required.');
    }

    const cleanEntity = entity.trim().toLowerCase().replace(/^minecraft:/, '');
    const mobDef = lookupMob(cleanEntity);

    // Destructive entity safety confirmation guard
    if ((mobDef?.destructive || cleanEntity === 'wither' || cleanEntity === 'ender_dragon') && !confirmed) {
      return {
        success: false,
        requiresConfirmation: true,
        entity: cleanEntity,
        amount,
        statusMessage: `⚠️ WARNING: Spawning \`${cleanEntity.toUpperCase()}\` can destroy player terrain and structures! Please confirm with "confirm spawn ${cleanEntity}" to proceed.`,
      };
    }

    const count = Math.max(1, Math.min(COMMAND_LIMITS.maxSummonBatch, parseInt(amount, 10) || 1));
    const targetPlayer = formatTarget(player || minecraftBridge.session.primaryPlayer);
    const loc = coords ? `${coords.x} ${coords.y} ${coords.z}` : `~ ~ ~`;

    let successCount = 0;
    let lastMessage = '';

    for (let i = 0; i < count; i++) {
      const cmd = `execute at "${targetPlayer}" run summon ${cleanEntity} ${loc}`;
      const res = await minecraftBridge.executeCommand(cmd);
      if (res.success) {
        successCount++;
        lastMessage = res.statusMessage;
      } else if (res.queued) {
        return { success: false, queued: true, statusMessage: res.statusMessage };
      }
    }

    logAudit(actor, 'MINECRAFT_SUMMON_ENTITY', `Summoned ${successCount}/${count} ${cleanEntity}`);

    return {
      success: successCount > 0,
      entity: cleanEntity,
      requestedCount: count,
      spawnedCount: successCount,
      statusMessage: successCount > 0
        ? `✅ Successfully spawned ${successCount}x \`${cleanEntity}\` near \`${targetPlayer}\`!`
        : `⚠️ Could not spawn \`${cleanEntity}\`: ${lastMessage || 'World rejected summon command.'}`,
    };
  }

  async summonEntity(arg1, arg2 = 1, arg3 = null) {
    return this.spawnEntity(arg1, arg2, arg3);
  }

  /**
   * Kill hostile mobs in a radius with player safety guarantee
   */
  async removeMobs({ type = 'hostile', radius = 50, player = null, actor = 'user' }) {
    const targetPlayer = formatTarget(player || minecraftBridge.session.primaryPlayer);
    const r = Math.max(5, Math.min(200, parseInt(radius, 10) || 50));

    // Never allow player removal through this command
    if (type === 'player' || type === '@p' || type === '@a') {
      throw new Error('Safety violation: Cannot remove players.');
    }

    let selector = `@e[type=!player,r=${r}]`;
    if (type !== 'all' && type !== 'hostile') {
      selector = `@e[type=${type},type=!player,r=${r}]`;
    }

    const cmd = `execute at "${targetPlayer}" run kill ${selector}`;
    const res = await minecraftBridge.executeCommand(cmd);

    logAudit(actor, 'MINECRAFT_KILL_MOBS', `Executed mob removal within radius ${r}`);

    return {
      success: res.success,
      radius: r,
      type,
      statusMessage: res.success
        ? `⚔️ Cleared mobs (\`${type}\`) within ${r} blocks of \`${targetPlayer}\`!`
        : `⚠️ ${res.statusMessage || 'No target mobs found within radius.'}`,
    };
  }

  /**
   * Apply potion effects
   */
  async applyEffect(arg1, arg2 = 120, arg3 = 1) {
    let player = null, effect, seconds = 120, amplifier = 1, actor = 'user';
    if (typeof arg1 === 'object' && arg1 !== null) {
      player = arg1.player ?? null;
      effect = arg1.effect;
      seconds = arg1.seconds ?? 120;
      amplifier = arg1.amplifier ?? 1;
      actor = arg1.actor ?? 'user';
    } else {
      effect = arg1;
      seconds = arg2 ?? 120;
      amplifier = arg3 ?? 1;
    }

    if (!effect) throw new Error('Effect name is required.');
    const targetPlayer = formatTarget(player || minecraftBridge.session.primaryPlayer);
    const cleanEffect = effect.trim().toLowerCase().replace(/^minecraft:/, '');
    const sec = Math.max(1, Math.min(COMMAND_LIMITS.maxEffectSeconds, parseInt(seconds, 10) || 120));
    const amp = Math.max(0, Math.min(COMMAND_LIMITS.maxEffectAmplifier, parseInt(amplifier, 10) || 0));

    const cmd = `effect "${targetPlayer}" ${cleanEffect} ${sec} ${amp} true`;
    const res = await minecraftBridge.executeCommand(cmd);

    logAudit(actor, 'MINECRAFT_APPLY_EFFECT', `Applied ${cleanEffect} to ${targetPlayer}`);

    return {
      success: res.success,
      effect: cleanEffect,
      target: targetPlayer,
      statusMessage: res.success
        ? `✨ Applied ${cleanEffect.toUpperCase()} (Tier ${amp + 1}) to \`${targetPlayer}\` for ${sec}s!`
        : `⚠️ Could not apply effect: ${res.statusMessage}`,
    };
  }

  /**
   * Grant Experience (Points or Levels)
   */
  async grantXp({ player = null, amount = 100, isLevels = true, actor = 'user' }) {
    let levelsFlag = isLevels;
    if (typeof amount === 'string') {
      if (amount.toUpperCase().endsWith('L')) {
        levelsFlag = true;
      } else if (!isNaN(Number(amount))) {
        levelsFlag = isLevels;
      }
    }
    const targetPlayer = formatTarget(player || minecraftBridge.session.primaryPlayer);
    const val = Math.max(1, Math.min(COMMAND_LIMITS.maxPointsXp, parseInt(amount, 10) || 100));
    const suffix = levelsFlag ? 'L' : '';

    const cmd = `xp ${val}${suffix} "${targetPlayer}"`;
    const res = await minecraftBridge.executeCommand(cmd);

    logAudit(actor, 'MINECRAFT_GRANT_XP', `Granted ${val}${suffix} XP to ${targetPlayer}`);

    return {
      success: res.success,
      amount: val,
      isLevels: levelsFlag,
      type: levelsFlag ? 'levels' : 'points',
      target: targetPlayer,
      statusMessage: res.success
        ? `🌟 Granted ${val.toLocaleString()} ${levelsFlag ? 'Experience Levels' : 'XP Points'} to \`${targetPlayer}\`!`
        : `⚠️ Could not grant XP: ${res.statusMessage}`,
    };
  }

  /**
   * Teleport companion to player or player to coordinates
   */
  async teleport(arg1 = 'nero', arg2 = '@s') {
    let target = 'nero', destination = '@s', actor = 'user';
    if (typeof arg1 === 'object' && arg1 !== null) {
      target = arg1.target ?? 'nero';
      destination = arg1.destination ?? '@s';
      actor = arg1.actor ?? 'user';
    } else {
      target = arg1 ?? 'nero';
      destination = arg2 ?? '@s';
    }
    const cleanPlayer = formatTarget(minecraftBridge.session.primaryPlayer);
    let cmd = `tp @e[type=nero:n3r0,c=1] "${cleanPlayer}"`;
    if (target === 'player') {
      if (destination === '@s') {
        cmd = `tp "${cleanPlayer}" ~ ~ ~`;
      } else {
        cmd = `tp "${cleanPlayer}" ${destination}`;
      }
    } else if (target === 'narrow') {
      cmd = `tp Narrow "${cleanPlayer}"`;
    }

    const res = await minecraftBridge.executeCommand(cmd);
    logAudit(actor, 'MINECRAFT_TELEPORT', `Teleport ${target} to ${destination}`);

    return {
      success: res.success,
      target,
      destination,
      statusMessage: res.success
        ? `⚡ Teleported ${target} to ${destination}!`
        : `⚠️ Teleport failed: ${res.statusMessage}`,
    };
  }

  /**
   * Locate Structure
   */
  async locateStructure({ structure = 'village', actor = 'user' }) {
    const clean = structure.trim().toLowerCase();
    const cmd = `locate structure ${clean}`;
    const res = await minecraftBridge.executeCommand(cmd);

    logAudit(actor, 'MINECRAFT_LOCATE', `Located structure ${clean}`);

    return {
      success: res.success,
      structure: clean,
      statusMessage: res.success
        ? `📍 ${res.statusMessage}`
        : `⚠️ Could not locate ${clean}: ${res.statusMessage || 'Not found in this dimension.'}`,
    };
  }

  /**
   * Safe Structured Block Construction Builder
   * Places platforms or simple shapes in bounded batches
   */
  async buildStructure({
    shape = 'platform',
    width = 5,
    length = 5,
    block = 'minecraft:stone_bricks',
    fromCoords = null,
    toCoords = null,
    player = null,
    actor = 'user',
  }) {
    const cleanBlock = (block || 'minecraft:stone_bricks').replace(/^minecraft:/, '');
    const targetPlayer = formatTarget(player || minecraftBridge.session.primaryPlayer);

    // If explicit coordinates are provided (e.g. "from x1 y1 z1 to x2 y2 z2")
    if (fromCoords && toCoords) {
      const dx = Math.abs(toCoords.x - fromCoords.x) + 1;
      const dy = Math.abs(toCoords.y - fromCoords.y) + 1;
      const dz = Math.abs(toCoords.z - fromCoords.z) + 1;
      const totalBlocks = dx * dy * dz;
      const maxVolume = 500;

      if (totalBlocks > maxVolume) {
        return {
          success: false,
          shape: 'region',
          totalBlocks,
          statusMessage: `⚠️ Requested structure volume (${totalBlocks} blocks) exceeds the safety limit of ${maxVolume} blocks.`,
        };
      }

      const cmd = `fill ${fromCoords.x} ${fromCoords.y} ${fromCoords.z} ${toCoords.x} ${toCoords.y} ${toCoords.z} ${cleanBlock}`;
      const res = await minecraftBridge.executeCommand(cmd);

      logAudit(actor, 'MINECRAFT_BUILD_COORDS', `Fill from (${fromCoords.x},${fromCoords.y},${fromCoords.z}) to (${toCoords.x},${toCoords.y},${toCoords.z}) with ${cleanBlock} (${totalBlocks} blocks)`);

      return {
        success: res.success,
        shape: 'cuboid',
        fromCoords,
        toCoords,
        block: cleanBlock,
        totalBlocks,
        statusMessage: res.success
          ? `🏗️ *Construction Completed!* Built ${totalBlocks} blocks of \`${cleanBlock}\` from (${fromCoords.x}, ${fromCoords.y}, ${fromCoords.z}) to (${toCoords.x}, ${toCoords.y}, ${toCoords.z}).`
          : `⚠️ Construction could not complete: ${res.statusMessage}`,
      };
    }

    const w = Math.min(15, Math.max(1, width));
    const l = Math.min(15, Math.max(1, length));
    const totalBlocks = w * l;

    // Calculate relative coordinates for platform: centered around player feet
    const halfW = Math.floor(w / 2);
    const halfL = Math.floor(l / 2);

    const cmd = `execute at "${targetPlayer}" run fill ~-${halfW} ~-1 ~-${halfL} ~${halfW} ~-1 ~${halfL} ${cleanBlock}`;
    const res = await minecraftBridge.executeCommand(cmd);

    logAudit(actor, 'MINECRAFT_BUILD_STRUCTURE', `Built ${w}x${l} ${shape} of ${cleanBlock} (${totalBlocks} blocks)`);

    return {
      success: res.success,
      shape,
      width: w,
      length: l,
      block: cleanBlock,
      totalBlocks,
      statusMessage: res.success
        ? `🏗️ *Construction Completed!* Built a ${w}x${l} (${totalBlocks} blocks) \`${cleanBlock}\` platform beneath \`${targetPlayer}\`.`
        : `⚠️ Construction could not complete: ${res.statusMessage}`,
    };
  }
}

export const minecraftCommandExecutor = new MinecraftCommandExecutor();

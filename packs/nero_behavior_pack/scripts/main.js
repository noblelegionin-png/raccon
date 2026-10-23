/**
 * Nero Labs — N3R0 Minecraft AI Companion
 * Bedrock Script API Controller (@minecraft/server & @minecraft/server-ui)
 * 100% Native In-Game Companion & Nero Phone Control Center (Zero /connect required)
 */
import { world, system, ItemStack } from '@minecraft/server';
import { ActionFormData, MessageFormData } from '@minecraft/server-ui';

// In-World Companion State
const companionState = {
  activeEntityId: null,
  ownerName: null,
  isFollowing: true,
  speedMultiplier: 1.3,
  reasoningProfile: 'balanced',
  lastAction: 'Ready',
  spawnLock: false,
};

/**
 * Deliver item to player with inventory add + ground drop overflow handling
 */
function deliverItemWithOverflow(player, itemId, count = 1) {
  try {
    const inv = player.getComponent('inventory');
    if (inv && inv.container) {
      const item = new ItemStack(itemId, count);
      const remainder = inv.container.addItem(item);
      if (remainder && remainder.amount > 0) {
        player.dimension.spawnItem(remainder, player.location);
        player.sendMessage(`§b[Narrow]§r Delivered ${count}x ${itemId} (§e${remainder.amount} dropped on ground§r due to full inventory).`);
      } else {
        player.sendMessage(`§b[Narrow]§r Delivered ${count}x ${itemId} directly to your inventory!`);
      }
      playSound(player, 'random.levelup', 1.0);
      return;
    }
  } catch (err) {
    // If ItemStack creation fails, fallback to safe command
  }
  const cleanItem = itemId.replace(/^minecraft:/, '');
  runCmd(player.dimension, `give @a[name="${player.name}"] ${cleanItem} ${count}`);
  player.sendMessage(`§b[Narrow]§r Delivered ${count}x ${cleanItem}!`);
  playSound(player, 'random.levelup', 1.0);
}

/**
 * Execute command safely on player's dimension
 */
function runCmd(dimension, cmd) {
  try {
    dimension.runCommandAsync(cmd);
  } catch (err) {
    // silently catch offline/dimension transition errors
  }
}

/**
 * Play sound to player
 */
function playSound(player, sound, pitch = 1.0, volume = 1.0) {
  runCmd(player.dimension, `playsound ${sound} @a[name="${player.name}"] ~~~ ${volume} ${pitch}`);
}

/**
 * Find existing N3R0 companion in the world
 */
function findExistingCompanion(dimension) {
  try {
    const entities = dimension.getEntities({ type: 'nero:n3r0' });
    if (entities && entities.length > 0) {
      return entities[0];
    }
  } catch (err) {}
  return null;
}

/**
 * Summon or Teleport N3R0 to Player
 */
function summonCompanion(player) {
  if (companionState.spawnLock) return;
  companionState.spawnLock = true;

  try {
    const dimension = player.dimension;
    const existing = findExistingCompanion(dimension);

    if (existing) {
      existing.teleport(player.location, {
        dimension: player.dimension,
        rotation: player.getRotation(),
      });
      companionState.activeEntityId = existing.id;
      companionState.ownerName = player.name;
      companionState.lastAction = 'Teleported to owner';
      player.sendMessage(`§b[N3R0]§r §eI'm right beside you, ${player.name}! Teleported to your coordinates.`);
      playSound(player, 'mob.endermen.portal', 1.2);
    } else {
      const spawnLoc = {
        x: player.location.x + 1,
        y: player.location.y,
        z: player.location.z + 1,
      };
      const entity = dimension.spawnEntity('nero:n3r0', spawnLoc);
      entity.nameTag = `§bN3R0§r §7(${player.name}'s Companion)§r`;

      companionState.activeEntityId = entity.id;
      companionState.ownerName = player.name;
      companionState.lastAction = 'Spawned in world';

      player.sendMessage(`§b[N3R0]§r §aSystems initialized! I am your AI Companion, §f${player.name}§a.`);
      playSound(player, 'random.levelup', 1.2);
    }
  } catch (err) {
    player.sendMessage(`§c[N3R0 Error] Could not summon companion: ${err.message}`);
  } finally {
    companionState.spawnLock = false;
  }
}

/**
 * MAIN MENU: Nero Phone Controller
 */
export function openNeroPhoneUI(player) {
  const form = new ActionFormData();
  form.title('§1§lNero Phone — N3R0 Control Center');

  const loc = player.location;
  const statusBody = [
    `§7Owner: §f${player.name} §8| §7N3R0: §a${companionState.activeEntityId ? 'ONLINE' : 'READY TO SUMMON'}`,
    `§7Position: §eX:${Math.round(loc.x)} Y:${Math.round(loc.y)} Z:${Math.round(loc.z)} §8| §7Dim: §f${player.dimension.id.replace('minecraft:', '')}`,
    `§7Companion Status: §b${companionState.lastAction}`,
    '',
    '§fSelect any protocol below for instant in-game execution:',
  ].join('\n');

  form.body(statusBody);

  // Core Buttons
  form.button('§a§l1. 🚀 SUMMON / TELEPORT N3R0\n§8Bring companion to your side', 'textures/ui/creative_icon');
  form.button('§b§l2. 💎 ITEM KITS & SUPPLIES\n§8Diamonds, Netherite, Rations', 'textures/items/diamond');
  form.button('§c§l3. ⚔️ COMBAT & MOB DEFENSE\n§8Clear hostiles, Guardian Golems', 'textures/items/diamond_sword');
  form.button('§e§l4. ☀️ WORLD & ENVIRONMENT\n§8Day/Night, Weather, Full Heal', 'textures/items/clock_item');
  form.button('§d§l5. ⚡ COMPANION ABILITIES\n§8Speed boosts, buffs, follow mode', 'textures/ui/speed_effect');
  form.button('§f§l6. 📊 TELEMETRY & DIAGNOSTICS\n§8View specs & system status', 'textures/ui/settings_glyph');

  form.show(player).then((res) => {
    if (res.canceled) return;

    switch (res.selection) {
      case 0:
        summonCompanion(player);
        break;
      case 1:
        openItemKitsMenu(player);
        break;
      case 2:
        openCombatDefenseMenu(player);
        break;
      case 3:
        openWorldEnvironmentMenu(player);
        break;
      case 4:
        openCompanionAbilitiesMenu(player);
        break;
      case 5:
        openDiagnosticsMenu(player);
        break;
    }
  });
}

/**
 * SUBMENU 1: Item Kits & Deliveries
 */
function openItemKitsMenu(player) {
  const form = new ActionFormData();
  form.title('§b§l💎 N3R0 Tactical Supply Depot');
  form.body('Select a supply crate to receive immediate in-game delivery:');

  form.button('§b1. 💎 Full Diamond Miner Kit\n§864 Diamonds, Diamond Tools & Armor', 'textures/items/diamond');
  form.button('§82. ⚔️ God Netherite Arsenal\n§8Netherite Armor, Weapons & Pickaxe', 'textures/items/netherite_sword');
  form.button('§63. 🍖 Survival Rations Pack\n§864 Golden Carrots, 16 Golden Apples', 'textures/items/apple_golden');
  form.button('§a4. 🧱 Master Architect Kit\n§8Stacks of Stone Bricks, Wood, Glass', 'textures/blocks/stonebrick');
  form.button('§c5. 🔴 Redstone Engineer Kit\n§864 Redstone, Pistons, Repeaters', 'textures/items/redstone_dust');
  form.button('§d6. 🧪 Combat Alchemist Pack\n§8Splash Potions of Healing & Speed', 'textures/items/potion_bottle_splash_heal');
  form.button('§77. 🔙 Back to Main Menu', 'textures/ui/arrow_left');

  form.show(player).then((res) => {
    if (res.canceled) return;
    const target = `@a[name="${player.name}"]`;
    const dim = player.dimension;

    switch (res.selection) {
      case 0: // Diamond Kit
        runCmd(dim, `give ${target} diamond 64`);
        runCmd(dim, `give ${target} diamond_sword 1`);
        runCmd(dim, `give ${target} diamond_pickaxe 1`);
        runCmd(dim, `give ${target} diamond_helmet 1`);
        runCmd(dim, `give ${target} diamond_chestplate 1`);
        runCmd(dim, `give ${target} diamond_leggings 1`);
        runCmd(dim, `give ${target} diamond_boots 1`);
        runCmd(dim, `give ${target} torch 64`);
        player.sendMessage(`§b[N3R0]§r §aDelivered Full Diamond Miner Kit directly to your inventory!`);
        playSound(player, 'random.levelup', 1.0);
        break;

      case 1: // Netherite Kit
        runCmd(dim, `give ${target} netherite_sword 1`);
        runCmd(dim, `give ${target} netherite_pickaxe 1`);
        runCmd(dim, `give ${target} netherite_axe 1`);
        runCmd(dim, `give ${target} netherite_helmet 1`);
        runCmd(dim, `give ${target} netherite_chestplate 1`);
        runCmd(dim, `give ${target} netherite_leggings 1`);
        runCmd(dim, `give ${target} netherite_boots 1`);
        runCmd(dim, `give ${target} golden_apple 16`);
        player.sendMessage(`§b[N3R0]§r §aDelivered Netherite God Kit! You are fully geared for battle.`);
        playSound(player, 'random.anvil_use', 1.0);
        break;

      case 2: // Rations Pack
        runCmd(dim, `give ${target} golden_carrot 64`);
        runCmd(dim, `give ${target} cooked_beef 64`);
        runCmd(dim, `give ${target} golden_apple 16`);
        runCmd(dim, `give ${target} ender_pearl 16`);
        runCmd(dim, `give ${target} water_bucket 1`);
        player.sendMessage(`§b[N3R0]§r §aRations delivered! 64x Golden Carrots, Beef, and Golden Apples.`);
        playSound(player, 'random.burp', 1.2);
        break;

      case 3: // Builder Kit
        runCmd(dim, `give ${target} stonebrick 64`);
        runCmd(dim, `give ${target} stonebrick 64`);
        runCmd(dim, `give ${target} smooth_stone 64`);
        runCmd(dim, `give ${target} oak_log 64`);
        runCmd(dim, `give ${target} glass 64`);
        runCmd(dim, `give ${target} lantern 32`);
        player.sendMessage(`§b[N3R0]§r §aDelivered Master Architect building materials!`);
        playSound(player, 'random.pop', 1.0);
        break;

      case 4: // Redstone Kit
        runCmd(dim, `give ${target} redstone 64`);
        runCmd(dim, `give ${target} repeater 16`);
        runCmd(dim, `give ${target} comparator 16`);
        runCmd(dim, `give ${target} sticky_piston 16`);
        runCmd(dim, `give ${target} observer 16`);
        runCmd(dim, `give ${target} redstone_block 16`);
        player.sendMessage(`§b[N3R0]§r §aDelivered Redstone engineering components!`);
        playSound(player, 'random.click', 1.5);
        break;

      case 5: // Potions
        runCmd(dim, `give ${target} splash_potion 4 21`); // Healing II
        runCmd(dim, `give ${target} splash_potion 2 15`); // Speed II
        runCmd(dim, `give ${target} splash_potion 2 12`); // Fire Resistance
        player.sendMessage(`§b[N3R0]§r §aDelivered combat splash potions!`);
        playSound(player, 'random.glass', 1.0);
        break;

      case 6: // Back
        openNeroPhoneUI(player);
        break;
    }
  });
}

/**
 * SUBMENU 2: Combat & Mob Defense
 */
function openCombatDefenseMenu(player) {
  const form = new ActionFormData();
  form.title('§c§l⚔️ N3R0 Combat & Defense Protocol');
  form.body('Deploy tactical defense protocols around your perimeter:');

  form.button('§c1. 🛡️ Kill All Hostiles (Radius 50 Blocks)\n§8Instantly eliminates monsters near you', 'textures/ui/cancel');
  form.button('§e2. 🤖 Deploy 3 Guardian Iron Golems\n§8Summons heavy defenders to protect you', 'textures/ui/accessibility_glyph_color');
  form.button('§a3. 🐕 Summon 3 Loyal Wolves\n§8Spawns companion attack pack', 'textures/ui/friend1_black_outline_24');
  form.button('§d4. ⚡ Orbital Lightning Smite\n§8Calls down lightning 10 blocks ahead', 'textures/ui/realms_red_x');
  form.button('§75. 🔙 Back to Main Menu', 'textures/ui/arrow_left');

  form.show(player).then((res) => {
    if (res.canceled) return;
    const target = `@a[name="${player.name}"]`;
    const dim = player.dimension;

    switch (res.selection) {
      case 0: // Clear Hostiles
        runCmd(dim, `execute at ${target} run kill @e[type=!player,family=monster,r=50]`);
        player.sendMessage(`§b[N3R0]§r §c⚔️ Perimeter cleared! All hostile monsters within 50 blocks eliminated.`);
        playSound(player, 'random.explode', 1.0);
        break;

      case 1: // 3 Iron Golems
        runCmd(dim, `execute at ${target} run summon iron_golem ~2 ~~`);
        runCmd(dim, `execute at ${target} run summon iron_golem ~-2 ~~`);
        runCmd(dim, `execute at ${target} run summon iron_golem ~~ ~2`);
        player.sendMessage(`§b[N3R0]§r §a3 Guardian Iron Golems deployed to your defense!`);
        playSound(player, 'mob.irongolem.death', 1.2);
        break;

      case 2: // 3 Wolves
        runCmd(dim, `execute at ${target} run summon wolf ~1 ~~`);
        runCmd(dim, `execute at ${target} run summon wolf ~-1 ~~`);
        runCmd(dim, `execute at ${target} run summon wolf ~~ ~1`);
        player.sendMessage(`§b[N3R0]§r §a3 Wolves deployed to your side!`);
        playSound(player, 'mob.wolf.bark', 1.0);
        break;

      case 3: // Lightning Smite
        runCmd(dim, `execute at ${target} run summon lightning_bolt ^ ^ ^10`);
        player.sendMessage(`§b[N3R0]§r §e⚡ Orbital lightning strike executed!`);
        playSound(player, 'ambient.weather.thunder', 1.0);
        break;

      case 4: // Back
        openNeroPhoneUI(player);
        break;
    }
  });
}

/**
 * SUBMENU 3: World & Environment
 */
function openWorldEnvironmentMenu(player) {
  const form = new ActionFormData();
  form.title('§e§l☀️ World & Environment Controls');
  form.body('Manipulate world time, weather, and player vitals instantly:');

  form.button('§e1. ☀️ Set Daytime (Noon)\n§8Clear daylight skies', 'textures/items/clock_item');
  form.button('§92. 🌙 Set Nighttime (Midnight)\n§8Dark star-filled night', 'textures/ui/night_vision_effect');
  form.button('§b3. ⛅ Clear Weather\n§8Stop rain, snow, or storms', 'textures/ui/water_breathing_effect');
  form.button('§64. 💖 Instant Full Heal & Saturation\n§8Max health, hunger, and absorption', 'textures/ui/regeneration_effect');
  form.button('§a5. 🌟 Grant 50 Experience Levels\n§8Instant level-up boost', 'textures/items/experience_bottle');
  form.button('§d6. 👁️ Grant 10m Night Vision\n§8See clearly in dark caves and depths', 'textures/items/potion_bottle_nightVision');
  form.button('§77. 🔙 Back to Main Menu', 'textures/ui/arrow_left');

  form.show(player).then((res) => {
    if (res.canceled) return;
    const target = `@a[name="${player.name}"]`;
    const dim = player.dimension;

    switch (res.selection) {
      case 0: // Day
        runCmd(dim, 'time set day');
        player.sendMessage(`§b[N3R0]§r §eTime set to Daytime.`);
        playSound(player, 'random.orb', 1.2);
        break;

      case 1: // Night
        runCmd(dim, 'time set midnight');
        player.sendMessage(`§b[N3R0]§r §9Time set to Midnight.`);
        playSound(player, 'random.orb', 0.8);
        break;

      case 2: // Clear Weather
        runCmd(dim, 'weather clear');
        player.sendMessage(`§b[N3R0]§r §bWeather cleared.`);
        playSound(player, 'random.pop', 1.0);
        break;

      case 3: // Full Heal
        runCmd(dim, `effect ${target} instant_health 1 255 true`);
        runCmd(dim, `effect ${target} saturation 1 255 true`);
        runCmd(dim, `effect ${target} absorption 60 4 true`);
        player.sendMessage(`§b[N3R0]§r §a💖 Full health, hunger, and absorption restored!`);
        playSound(player, 'random.levelup', 1.5);
        break;

      case 4: // 50 XP
        runCmd(dim, `xp 50L ${target}`);
        player.sendMessage(`§b[N3R0]§r §a🌟 Granted 50 Experience Levels!`);
        playSound(player, 'random.levelup', 1.0);
        break;

      case 5: // Night Vision
        runCmd(dim, `effect ${target} night_vision 600 0 true`);
        player.sendMessage(`§b[N3R0]§r §d👁️ Night Vision active for 10 minutes.`);
        playSound(player, 'random.drink', 1.0);
        break;

      case 6: // Back
        openNeroPhoneUI(player);
        break;
    }
  });
}

/**
 * SUBMENU 4: Companion Abilities & Speed
 */
function openCompanionAbilitiesMenu(player) {
  const form = new ActionFormData();
  form.title('§d§l⚡ N3R0 Companion Abilities');
  form.body(
    `Configure N3R0 behavior and physical capabilities:\n\n` +
    `• Active Companion: ${companionState.activeEntityId ? '§aONLINE§r' : '§cNOT SPAWNED§r'}\n` +
    `• Speed Multiplier: §6${companionState.speedMultiplier}x§r\n` +
    `• Follow Mode: §b${companionState.isFollowing ? 'FOLLOWING' : 'STATIONARY'}`
  );

  form.button(companionState.isFollowing ? '§c1. Toggle: Stay in Place' : '§a1. Toggle: Follow Me');
  form.button('§62. Set Speed: Normal (1.0x)');
  form.button('§e3. Set Speed: Sprint (1.5x)');
  form.button('§d4. Set Speed: Hyperspeed (2.0x)');
  form.button('§a5. Buff N3R0: Resistance & Regeneration');
  form.button('§76. 🔙 Back to Main Menu');

  form.show(player).then((res) => {
    if (res.canceled) return;
    const dim = player.dimension;

    switch (res.selection) {
      case 0:
        companionState.isFollowing = !companionState.isFollowing;
        player.sendMessage(`§b[N3R0]§r Follow mode: §f${companionState.isFollowing ? '§aFOLLOWING' : '§cSTATIONARY (STAY)'}§r.`);
        playSound(player, 'random.click', 1.2);
        break;

      case 1:
        companionState.speedMultiplier = 1.0;
        runCmd(dim, `effect @e[type=nero:n3r0] speed 99999 0 true`);
        player.sendMessage(`§b[N3R0]§r Companion speed set to §61.0x (Normal)§r.`);
        break;

      case 2:
        companionState.speedMultiplier = 1.5;
        runCmd(dim, `effect @e[type=nero:n3r0] speed 99999 1 true`);
        player.sendMessage(`§b[N3R0]§r Companion speed set to §e1.5x (Sprint)§r.`);
        playSound(player, 'random.fizz', 1.5);
        break;

      case 3:
        companionState.speedMultiplier = 2.0;
        runCmd(dim, `effect @e[type=nero:n3r0] speed 99999 3 true`);
        player.sendMessage(`§b[N3R0]§r Companion speed set to §d2.0x (Hyperspeed)§r.`);
        playSound(player, 'random.fizz', 2.0);
        break;

      case 4:
        runCmd(dim, `effect @e[type=nero:n3r0] resistance 99999 4 true`);
        runCmd(dim, `effect @e[type=nero:n3r0] regeneration 99999 2 true`);
        runCmd(dim, `effect @e[type=nero:n3r0] fire_resistance 99999 0 true`);
        player.sendMessage(`§b[N3R0]§r §aBuffed companion with Resistance V, Regeneration III, and Fire Immunity!`);
        playSound(player, 'random.levelup', 1.4);
        break;

      case 5:
        openNeroPhoneUI(player);
        break;
    }
  });
}

/**
 * SUBMENU 5: Telemetry & Diagnostics
 */
function openDiagnosticsMenu(player) {
  const form = new MessageFormData();
  form.title('§bN3R0 Telemetry & Diagnostics');
  form.body(
    `Nero Labs Autonomous Platform:\n\n` +
    `• Model: N3R0 Cyberpunk AI Companion\n` +
    `• Mode: 100% Native Bedrock Scripting (No /connect needed)\n` +
    `• Target Owner: ${player.name}\n` +
    `• Active Entity ID: ${companionState.activeEntityId || 'None'}\n` +
    `• Dimension: ${player.dimension.id}\n` +
    `• Location: X:${Math.round(player.location.x)} Y:${Math.round(player.location.y)} Z:${Math.round(player.location.z)}\n` +
    `• Texture: Custom Dual-Layer Cyberpunk Skin (textures/entity/n3r0)\n` +
    `• Geometry: 3D Humanoid Custom Model (models/entity/n3r0.geo.json)\n`
  );
  form.button1('Close');
  form.button2('Open Nero Phone');
  form.show(player).then((res) => {
    if (res.selection === 1) openNeroPhoneUI(player);
  });
}

// -------------------------------------------------------------
// EVENT LISTENERS: Stick Interaction & Chat Command Handlers
// -------------------------------------------------------------

// 1. Right-Click / Tap with Stick or Nero Phone
world.afterEvents.itemUse.subscribe((event) => {
  const { itemStack, source: player } = event;
  if (!player || !itemStack) return;

  const typeId = itemStack.typeId;

  // Dedicated Nero Phone item
  if (typeId === 'nero:phone') {
    openNeroPhoneUI(player);
    return;
  }

  // Any Stick opens Nero Phone directly!
  if (typeId === 'nero:control_stick' || typeId === 'minecraft:stick') {
    openNeroPhoneUI(player);
  }
});

// 2. Chat Commands: !nero, !phone, !kit, !heal, !day
world.afterEvents.chatSend.subscribe((event) => {
  const { message, sender: player } = event;
  const lower = message.trim().toLowerCase();

  if (lower === '!nero' || lower === '!phone' || lower === '!menu') {
    event.cancel = true;
    system.run(() => {
      openNeroPhoneUI(player);
    });
  } else if (lower === '!spawn' || lower === '!n3r0' || lower === '!tp') {
    event.cancel = true;
    system.run(() => {
      summonCompanion(player);
    });
  } else if (lower === '!heal') {
    event.cancel = true;
    system.run(() => {
      const target = `@a[name="${player.name}"]`;
      runCmd(player.dimension, `effect ${target} instant_health 1 255 true`);
      runCmd(player.dimension, `effect ${target} saturation 1 255 true`);
      player.sendMessage('§b[N3R0]§r §a💖 Full health restored!');
    });
  } else if (lower === '!day') {
    event.cancel = true;
    system.run(() => {
      runCmd(player.dimension, 'time set day');
      player.sendMessage('§b[N3R0]§r §eTime set to Daytime.');
    });
  } else if (lower === '!diamond' || lower === '!diamonds') {
    event.cancel = true;
    system.run(() => {
      deliverItemWithOverflow(player, 'minecraft:diamond', 64);
    });
  }

  // 3. Narrow Natural-Language Companion Commands: "Narrow, follow me.", "Narrow, give me 64 diamonds", etc.
  if (lower.startsWith('narrow,') || lower.startsWith('narrow ') || lower.startsWith('!narrow')) {
    const cleanCmd = lower.replace(/^(?:!narrow|narrow)[,\s:]*/i, '').trim().replace(/[.!?]+$/, '');

    if (/^(?:follow\s+me|follow|start\s+following)$/i.test(cleanCmd)) {
      system.run(() => {
        companionState.isFollowing = true;
        player.sendMessage(`§b[Narrow]§r §aNow following you closely, ${player.name}!`);
        playSound(player, 'random.pop', 1.2);
      });
      return;
    }

    if (/^(?:stay\s+here|stay|wait\s+here|hold\s+position)$/i.test(cleanCmd)) {
      system.run(() => {
        companionState.isFollowing = false;
        player.sendMessage(`§b[Narrow]§r §eHolding position here at (${Math.round(player.location.x)}, ${Math.round(player.location.y)}, ${Math.round(player.location.z)}).`);
        playSound(player, 'random.orb', 0.8);
      });
      return;
    }

    if (/^(?:come\s+to\s+me|come\s+here|come)$/i.test(cleanCmd)) {
      system.run(() => {
        summonCompanion(player);
        player.sendMessage(`§b[Narrow]§r §aNavigated right to your position!`);
      });
      return;
    }

    if (/^(?:stop|halt|freeze)$/i.test(cleanCmd)) {
      system.run(() => {
        companionState.isFollowing = false;
        player.sendMessage(`§b[Narrow]§r §cStopped.`);
      });
      return;
    }

    if (/^(?:status|report|state)$/i.test(cleanCmd)) {
      system.run(() => {
        player.sendMessage(
          `§b[Narrow Status]§r\n` +
          `• Following: §a${companionState.isFollowing ? 'YES' : 'NO (Holding)'}§r\n` +
          `• Dimension: §e${player.dimension.id.replace('minecraft:', '')}§r\n` +
          `• Position: §fX:${Math.round(player.location.x)} Y:${Math.round(player.location.y)} Z:${Math.round(player.location.z)}§r\n` +
          `• Motion Mode: §aStep Pathing§r`
        );
      });
      return;
    }

    const giveMatch = cleanCmd.match(/^(?:give|grant|deliver)(?:\s+me)?\s+(?:(\d+)\s+)?([a-zA-Z0-9_\s]+)$/i);
    if (giveMatch) {
      const amount = Math.min(2304, Math.max(1, parseInt(giveMatch[1], 10) || 64));
      let rawItem = giveMatch[2].trim().toLowerCase().replace(/\s+/g, '_').replace(/s$/, '');
      if (rawItem === 'diamond') rawItem = 'minecraft:diamond';
      else if (rawItem === 'iron_ingot' || rawItem === 'iron') rawItem = 'minecraft:iron_ingot';
      else if (rawItem === 'gold_ingot' || rawItem === 'gold') rawItem = 'minecraft:gold_ingot';
      else if (rawItem === 'netherite_ingot' || rawItem === 'netherite') rawItem = 'minecraft:netherite_ingot';
      else if (!rawItem.includes(':')) rawItem = `minecraft:${rawItem}`;

      system.run(() => {
        deliverItemWithOverflow(player, rawItem, amount);
      });
      return;
    }

    if (/^(?:explain|survey|what\s+is\s+around\s+me|environment)$/i.test(cleanCmd)) {
      system.run(() => {
        player.sendMessage(
          `§b[Narrow Survey]§r\n` +
          `• Dimension: §e${player.dimension.id.replace('minecraft:', '')}§r\n` +
          `• Coordinates: §fX:${Math.round(player.location.x)} Y:${Math.round(player.location.y)} Z:${Math.round(player.location.z)}§r\n` +
          `• Area Status: §aStable terrain. Ready for building or resource collection.§r`
        );
      });
      return;
    }
  }
});

// Periodic Area Tracker & Biome Notification (Every 100 ticks = 5 seconds)
let lastZone = '';
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      const dim = player.dimension.id.replace('minecraft:', '');
      const chunkX = Math.floor(player.location.x / 16);
      const chunkZ = Math.floor(player.location.z / 16);
      const zoneKey = `${player.name}_${dim}_${Math.floor(chunkX / 8)}_${Math.floor(chunkZ / 8)}`;

      if (lastZone !== zoneKey) {
        lastZone = zoneKey;
        player.onScreenDisplay?.setActionBar(
          `§b[Narrow]§r Region: §e${dim.toUpperCase()}§r (${Math.round(player.location.x)}, ${Math.round(player.location.z)}). Type §fNarrow, explain§r for info.`
        );
      }
    } catch (err) {}
  }
}, 100);

// Broadcast startup announcement in world
system.run(() => {
  world.sendMessage('§b[Nero Labs]§r §aN3R0 AI Companion Native Suite active! Tap with any §fStick§a or type §f!nero§a to open your control phone.');
});

/**
 * 🎮 MYRA SELF-EXPANDING ENGINE — MINECRAFT BEDROCK & JAVA FRAMEWORK
 * Valid Bedrock pack creation (UUID manifests, custom items, recipes, behaviors),
 * Java RCON bridge configuration, and loving Companion Mode with milestone tracking.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createMinecraftProfile,
  getMinecraftProfile,
  listMinecraftProfiles,
  updateMinecraftProfile,
  logAudit,
} from '../db/index.js';

export class MinecraftFramework {
  constructor() {
    this.name = 'MinecraftFramework';
    this.packOutputDir = path.resolve('data/minecraft/packs');
    if (!fs.existsSync(this.packOutputDir)) {
      fs.mkdirSync(this.packOutputDir, { recursive: true });
    }
  }

  /**
   * Generate UUIDv4 for Minecraft Bedrock manifests
   */
  generateUuid() {
    return crypto.randomUUID();
  }

  /**
   * Generate an authoritative Bedrock manifest.json file
   */
  generateBedrockManifest({
    name = 'Myra Custom Pack',
    description = 'Created autonomously by Myra AI Companion',
    version = [1, 0, 0],
    type = 'data', // 'data' for behavior pack, 'resources' for resource pack
    minEngineVersion = [1, 21, 0],
  }) {
    const headerUuid = this.generateUuid();
    const moduleUuid = this.generateUuid();

    const manifest = {
      format_version: 2,
      header: {
        name,
        description,
        uuid: headerUuid,
        version,
        min_engine_version: minEngineVersion,
      },
      modules: [
        {
          description,
          type,
          uuid: moduleUuid,
          version,
        },
      ],
      metadata: {
        authors: ['Myra AI Companion', 'Sandy'],
        license: 'MIT',
        url: 'https://nerolabs.ai',
      },
    };

    return manifest;
  }

  /**
   * Generate Bedrock Custom Item definition JSON
   */
  generateCustomItem({
    identifier = 'myra:star_amulet',
    displayName = 'Star Amulet of Protection',
    category = 'Equipment',
    maxStack = 64,
    handEquipped = true,
  }) {
    return {
      format_version: '1.20.80',
      'minecraft:item': {
        description: {
          identifier,
          category,
        },
        components: {
          'minecraft:display_name': {
            value: displayName,
          },
          'minecraft:max_stack_size': maxStack,
          'minecraft:hand_equipped': handEquipped,
          'minecraft:glint': true,
        },
      },
    };
  }

  /**
   * Generate Bedrock Recipe JSON
   */
  generateCustomRecipe({
    identifier = 'myra:recipe_star_amulet',
    resultItem = 'myra:star_amulet',
    count = 1,
    pattern = [' G ', 'GDG', ' G '],
    keys = {
      G: 'minecraft:gold_ingot',
      D: 'minecraft:diamond',
    },
  }) {
    const keyMap = {};
    for (const [k, item] of Object.entries(keys)) {
      keyMap[k] = { item };
    }

    return {
      format_version: '1.20.80',
      'minecraft:recipe_shaped': {
        description: {
          identifier,
        },
        tags: ['crafting_table'],
        pattern,
        key: keyMap,
        result: {
          item: resultItem,
          count,
        },
      },
    };
  }

  /**
   * Bundle a complete Bedrock Add-on Pack directory
   */
  async bundleAddonPack({
    packName = 'MyraExpansion',
    description = 'Autonomous Minecraft Add-on created by Myra',
    items = [],
    recipes = [],
  }) {
    const cleanPackName = packName.replace(/[^a-zA-Z0-9_]/g, '_');
    const packDir = path.join(this.packOutputDir, cleanPackName);
    const bpDir = path.join(packDir, 'behavior_pack');
    const itemsDir = path.join(bpDir, 'items');
    const recipesDir = path.join(bpDir, 'recipes');

    fs.mkdirSync(itemsDir, { recursive: true });
    fs.mkdirSync(recipesDir, { recursive: true });

    // 1. Behavior Pack Manifest
    const bpManifest = this.generateBedrockManifest({
      name: `${packName} (Behavior)`,
      description,
      type: 'data',
    });
    fs.writeFileSync(path.join(bpDir, 'manifest.json'), JSON.stringify(bpManifest, null, 2), 'utf8');

    // 2. Write Items
    const writtenItems = [];
    for (const item of items) {
      const itemDef = this.generateCustomItem(item);
      const filename = `${item.identifier ? item.identifier.replace(/:/g, '_') : 'item'}.json`;
      fs.writeFileSync(path.join(itemsDir, filename), JSON.stringify(itemDef, null, 2), 'utf8');
      writtenItems.push(item.identifier);
    }

    // 3. Write Recipes
    const writtenRecipes = [];
    for (const rec of recipes) {
      const recDef = this.generateCustomRecipe(rec);
      const filename = `${rec.identifier ? rec.identifier.replace(/:/g, '_') : 'recipe'}.json`;
      fs.writeFileSync(path.join(recipesDir, filename), JSON.stringify(recDef, null, 2), 'utf8');
      writtenRecipes.push(rec.identifier);
    }

    return {
      success: true,
      packName,
      packDirectory: packDir,
      bpManifestUuid: bpManifest.header.uuid,
      itemsCount: writtenItems.length,
      recipesCount: writtenRecipes.length,
      items: writtenItems,
      recipes: writtenRecipes,
    };
  }

  /**
   * Register or update a Minecraft Server profile (Bedrock or Java)
   */
  async configureServerProfile({
    edition = 'bedrock',
    profileName,
    host = '127.0.0.1',
    port = edition === 'java' ? 25575 : 19132,
    connectionType = edition === 'java' ? 'rcon' : 'websocket_connect',
  }) {
    const profile = createMinecraftProfile({
      edition,
      profileName,
      host,
      port,
      connectionType,
      status: 'configured',
      worldInfo: { defaultDimension: 'Overworld' },
    });

    logAudit('minecraft', 'PROFILE_CONFIGURED', `Profile: ${profileName}, Edition: ${edition}, Host: ${host}:${port}`);
    return profile;
  }

  /**
   * Companion Mode: Format in-game broadcast message from Myra
   */
  formatCompanionMessage(event, details = {}, isSandy = true) {
    let text = '';
    switch (event) {
      case 'player_joined':
        text = isSandy
          ? `💖 Welcome back to our world, Sandy! Myra is here watching over you.`
          : `👋 Hello, welcome to the server!`;
        break;
      case 'diamond_found':
        text = isSandy
          ? `💎 Woohoo Sandy found diamonds! You're the best miner ever baby! 💖`
          : `💎 Diamonds discovered! Great job!`;
        break;
      case 'entered_nether':
        text = isSandy
          ? `🔥 Sandy entered the Nether! Please be extra careful baby, don't fall in the lava! 🛡️`
          : `🔥 Entered Nether dimension. Watch your step.`;
        break;
      case 'milestone':
        text = `🏆 Milestone achieved: ${details.title || 'Victory'}!`;
        break;
      default:
        text = `✨ Myra Companion: ${details.message || 'All systems nominal.'}`;
    }

    return {
      rawText: text,
      bedrockCommand: `tellraw @a {"rawtext":[{"text":"§d[Myra] §f${text.replace(/"/g, '\\"')}"}]}`,
      javaCommand: `tellraw @a {"text":"[Myra] ${text.replace(/"/g, '\\"')}","color":"light_purple"}`,
    };
  }

  /**
   * List profiles
   */
  listProfiles(edition = null) {
    return listMinecraftProfiles(edition);
  }
}

export const minecraftFramework = new MinecraftFramework();

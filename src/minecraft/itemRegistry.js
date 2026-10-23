/**
 * Nero Labs / Narrow AI — Minecraft Bedrock Item Registry & Resolver
 * Standardizes item resolution, quantity validation, aliases, and stack size limits.
 */

// Common Bedrock item alias mappings
const ITEM_ALIASES = {
  // Ores & Minerals
  diamond: 'minecraft:diamond',
  diamonds: 'minecraft:diamond',
  diamond_block: 'minecraft:diamond_block',
  diamond_blocks: 'minecraft:diamond_block',
  emerald: 'minecraft:emerald',
  emeralds: 'minecraft:emerald',
  emerald_block: 'minecraft:emerald_block',
  emerald_blocks: 'minecraft:emerald_block',
  gold: 'minecraft:gold_ingot',
  gold_ingot: 'minecraft:gold_ingot',
  gold_ingots: 'minecraft:gold_ingot',
  gold_nugget: 'minecraft:gold_nugget',
  gold_block: 'minecraft:gold_block',
  iron: 'minecraft:iron_ingot',
  iron_ingot: 'minecraft:iron_ingot',
  iron_ingots: 'minecraft:iron_ingot',
  iron_nugget: 'minecraft:iron_nugget',
  iron_block: 'minecraft:iron_block',
  netherite: 'minecraft:netherite_ingot',
  netherite_ingot: 'minecraft:netherite_ingot',
  netherite_scrap: 'minecraft:netherite_scrap',
  netherite_block: 'minecraft:netherite_block',
  coal: 'minecraft:coal',
  charcoal: 'minecraft:charcoal',
  copper: 'minecraft:copper_ingot',
  copper_ingot: 'minecraft:copper_ingot',
  redstone: 'minecraft:redstone',
  redstone_dust: 'minecraft:redstone',
  redstone_block: 'minecraft:redstone_block',
  lapis: 'minecraft:lapis_lazuli',
  lapis_lazuli: 'minecraft:lapis_lazuli',
  quartz: 'minecraft:quartz',
  nether_quartz: 'minecraft:quartz',
  amethyst: 'minecraft:amethyst_shard',
  amethyst_shard: 'minecraft:amethyst_shard',

  // Tools & Weapons
  diamond_sword: 'minecraft:diamond_sword',
  diamond_pickaxe: 'minecraft:diamond_pickaxe',
  diamond_axe: 'minecraft:diamond_axe',
  diamond_shovel: 'minecraft:diamond_shovel',
  diamond_hoe: 'minecraft:diamond_hoe',
  netherite_sword: 'minecraft:netherite_sword',
  netherite_pickaxe: 'minecraft:netherite_pickaxe',
  netherite_axe: 'minecraft:netherite_axe',
  netherite_shovel: 'minecraft:netherite_shovel',
  netherite_hoe: 'minecraft:netherite_hoe',
  iron_sword: 'minecraft:iron_sword',
  iron_pickaxe: 'minecraft:iron_pickaxe',
  iron_axe: 'minecraft:iron_axe',
  iron_shovel: 'minecraft:iron_shovel',
  iron_hoe: 'minecraft:iron_hoe',
  bow: 'minecraft:bow',
  crossbow: 'minecraft:crossbow',
  arrow: 'minecraft:arrow',
  arrows: 'minecraft:arrow',
  spectral_arrow: 'minecraft:arrow',
  trident: 'minecraft:trident',
  shield: 'minecraft:shield',
  mace: 'minecraft:mace',

  // Armor
  diamond_helmet: 'minecraft:diamond_helmet',
  diamond_chestplate: 'minecraft:diamond_chestplate',
  diamond_leggings: 'minecraft:diamond_leggings',
  diamond_boots: 'minecraft:diamond_boots',
  netherite_helmet: 'minecraft:netherite_helmet',
  netherite_chestplate: 'minecraft:netherite_chestplate',
  netherite_leggings: 'minecraft:netherite_leggings',
  netherite_boots: 'minecraft:netherite_boots',
  iron_helmet: 'minecraft:iron_helmet',
  iron_chestplate: 'minecraft:iron_chestplate',
  iron_leggings: 'minecraft:iron_leggings',
  iron_boots: 'minecraft:iron_boots',
  elytra: 'minecraft:elytra',

  // Food & Consumables
  golden_apple: 'minecraft:golden_apple',
  golden_apples: 'minecraft:golden_apple',
  enchanted_golden_apple: 'minecraft:enchanted_golden_apple',
  god_apple: 'minecraft:enchanted_golden_apple',
  notch_apple: 'minecraft:enchanted_golden_apple',
  golden_carrot: 'minecraft:golden_carrot',
  golden_carrots: 'minecraft:golden_carrot',
  cooked_beef: 'minecraft:cooked_beef',
  steak: 'minecraft:cooked_beef',
  cooked_porkchop: 'minecraft:cooked_porkchop',
  cooked_mutton: 'minecraft:cooked_mutton',
  cooked_chicken: 'minecraft:cooked_chicken',
  bread: 'minecraft:bread',
  apple: 'minecraft:apple',
  apples: 'minecraft:apple',
  melon: 'minecraft:melon_slice',
  melon_slice: 'minecraft:melon_slice',

  // Building Blocks
  stone: 'minecraft:stone',
  cobblestone: 'minecraft:cobblestone',
  stone_bricks: 'minecraft:stone_bricks',
  stonebrick: 'minecraft:stone_bricks',
  smooth_stone: 'minecraft:smooth_stone',
  deepslate: 'minecraft:deepslate',
  cobbled_deepslate: 'minecraft:cobbled_deepslate',
  obsidian: 'minecraft:obsidian',
  crying_obsidian: 'minecraft:crying_obsidian',
  oak_log: 'minecraft:oak_log',
  oak_wood: 'minecraft:oak_wood',
  oak_planks: 'minecraft:oak_planks',
  wood: 'minecraft:oak_log',
  logs: 'minecraft:oak_log',
  planks: 'minecraft:oak_planks',
  spruce_log: 'minecraft:spruce_log',
  spruce_planks: 'minecraft:spruce_planks',
  birch_log: 'minecraft:birch_log',
  birch_planks: 'minecraft:birch_planks',
  cherry_log: 'minecraft:cherry_log',
  cherry_planks: 'minecraft:cherry_planks',
  glass: 'minecraft:glass',
  torch: 'minecraft:torch',
  torches: 'minecraft:torch',
  lantern: 'minecraft:lantern',
  lanterns: 'minecraft:lantern',
  sea_lantern: 'minecraft:sea_lantern',
  glowstone: 'minecraft:glowstone',

  // Utility & Exploration
  ender_pearl: 'minecraft:ender_pearl',
  ender_pearls: 'minecraft:ender_pearl',
  eye_of_ender: 'minecraft:ender_eye',
  ender_eye: 'minecraft:ender_eye',
  water_bucket: 'minecraft:water_bucket',
  lava_bucket: 'minecraft:lava_bucket',
  bucket: 'minecraft:bucket',
  totem: 'minecraft:totem_of_undying',
  totem_of_undying: 'minecraft:totem_of_undying',
  shulker_box: 'minecraft:shulker_box',
  chest: 'minecraft:chest',
  crafting_table: 'minecraft:crafting_table',
  furnace: 'minecraft:furnace',
  anvil: 'minecraft:anvil',
  bed: 'minecraft:red_bed',
  firework_rocket: 'minecraft:firework_rocket',
  fireworks: 'minecraft:firework_rocket',
};

// Item bundles for kit shortcuts
const KIT_BUNDLES = {
  diamond_kit: [
    { item: 'minecraft:diamond_sword', amount: 1 },
    { item: 'minecraft:diamond_pickaxe', amount: 1 },
    { item: 'minecraft:diamond_axe', amount: 1 },
    { item: 'minecraft:diamond_helmet', amount: 1 },
    { item: 'minecraft:diamond_chestplate', amount: 1 },
    { item: 'minecraft:diamond_leggings', amount: 1 },
    { item: 'minecraft:diamond_boots', amount: 1 },
    { item: 'minecraft:diamond', amount: 64 },
    { item: 'minecraft:golden_carrot', amount: 64 },
  ],
  netherite_kit: [
    { item: 'minecraft:netherite_sword', amount: 1 },
    { item: 'minecraft:netherite_pickaxe', amount: 1 },
    { item: 'minecraft:netherite_axe', amount: 1 },
    { item: 'minecraft:netherite_helmet', amount: 1 },
    { item: 'minecraft:netherite_chestplate', amount: 1 },
    { item: 'minecraft:netherite_leggings', amount: 1 },
    { item: 'minecraft:netherite_boots', amount: 1 },
    { item: 'minecraft:enchanted_golden_apple', amount: 8 },
    { item: 'minecraft:totem_of_undying', amount: 2 },
  ],
  armor_kit: [
    { item: 'minecraft:diamond_helmet', amount: 1 },
    { item: 'minecraft:diamond_chestplate', amount: 1 },
    { item: 'minecraft:diamond_leggings', amount: 1 },
    { item: 'minecraft:diamond_boots', amount: 1 },
  ],
  netherite_armor: [
    { item: 'minecraft:netherite_helmet', amount: 1 },
    { item: 'minecraft:netherite_chestplate', amount: 1 },
    { item: 'minecraft:netherite_leggings', amount: 1 },
    { item: 'minecraft:netherite_boots', amount: 1 },
  ],
  maximum_level_enchanted_armor: [
    { item: 'minecraft:netherite_helmet', amount: 1 },
    { item: 'minecraft:netherite_chestplate', amount: 1 },
    { item: 'minecraft:netherite_leggings', amount: 1 },
    { item: 'minecraft:netherite_boots', amount: 1 },
  ],
  enchanted_armor: [
    { item: 'minecraft:netherite_helmet', amount: 1 },
    { item: 'minecraft:netherite_chestplate', amount: 1 },
    { item: 'minecraft:netherite_leggings', amount: 1 },
    { item: 'minecraft:netherite_boots', amount: 1 },
  ],
  builder_kit: [
    { item: 'minecraft:stone_bricks', amount: 128 },
    { item: 'minecraft:smooth_stone', amount: 64 },
    { item: 'minecraft:oak_log', amount: 64 },
    { item: 'minecraft:glass', amount: 64 },
    { item: 'minecraft:lantern', amount: 32 },
  ],
};

// Maximum items per give request (36 inventory slots * 64 = 2304)
const MAX_ITEM_QUANTITY = 2304;
const DEFAULT_ITEM_QUANTITY = 64;

/**
 * Resolve raw item string into standard Minecraft identifier and bundle flag
 * @param {string} input - e.g. "diamonds", "64 golden apples", "netherite armor"
 * @returns {{ resolvedId: string|null, isBundle: boolean, bundleItems?: Array<{item: string, amount: number}> }}
 */
export function resolveItemIdentifier(input) {
  if (!input || typeof input !== 'string') {
    return { resolvedId: null, isBundle: false };
  }

  const clean = input
    .trim()
    .toLowerCase()
    .replace(/^minecraft:/, '')
    .replace(/[,\.!]/g, '')
    .replace(/[\s\-]+/g, '_');

  // Check kit bundles first
  if (KIT_BUNDLES[clean]) {
    return {
      resolvedId: clean,
      isBundle: true,
      bundleItems: KIT_BUNDLES[clean],
    };
  }

  // Check aliases dictionary
  if (ITEM_ALIASES[clean]) {
    return {
      resolvedId: ITEM_ALIASES[clean],
      isBundle: false,
    };
  }

  // Singularize trailing 's' if not found
  const singular = clean.replace(/s$/, '');
  if (ITEM_ALIASES[singular]) {
    return {
      resolvedId: ITEM_ALIASES[singular],
      isBundle: false,
    };
  }

  // Standard Bedrock identifier check: lowercase alphanumeric with underscores
  if (/^[a-z0-9_]+$/.test(clean)) {
    return {
      resolvedId: `minecraft:${clean}`,
      isBundle: false,
    };
  }

  return { resolvedId: null, isBundle: false };
}

/**
 * Validate and clamp item quantities
 * @param {number|string} amount
 * @returns {number} Clamped quantity between 1 and 2304
 */
export function validateQuantity(amount) {
  if (amount === undefined || amount === null || amount === '') {
    return DEFAULT_ITEM_QUANTITY;
  }
  const parsed = parseInt(amount, 10);
  if (isNaN(parsed)) {
    return DEFAULT_ITEM_QUANTITY;
  }
  return Math.max(1, Math.min(MAX_ITEM_QUANTITY, parsed));
}

/**
 * Get item display name
 */
export function getItemDisplayName(itemId) {
  const clean = (itemId || '').replace(/^minecraft:/, '').replace(/_/g, ' ');
  return clean
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

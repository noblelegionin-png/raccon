/**
 * Nero Labs — N3R0 Game Knowledge Layer
 * Verified, compact indexed knowledge for Minecraft Bedrock & Pocket Edition.
 * Covers Biomes, Mobs, Structures, Crafting, Enchantments, Potions, and Commands.
 */

// Core Biome Registry (Bedrock Edition)
export const BIOMES = {
  plains: {
    id: 'plains',
    name: 'Plains',
    temperature: 0.8,
    precipitation: 'Rain',
    structures: ['village', 'pillager_outpost', 'ruined_portal'],
    mobs: ['cow', 'pig', 'sheep', 'chicken', 'horse', 'donkey'],
    resources: ['wood (oak)', 'flowers', 'wheat', 'carrots', 'potatoes', 'iron (caves)'],
    facts: 'Gentle grassy terrain with abundant passive mobs and sunflowers in sunflower plains variant.',
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    temperature: 0.7,
    precipitation: 'Rain',
    structures: ['ruined_portal', 'witch_hut (near swamps)'],
    mobs: ['wolf', 'sheep', 'cow', 'pig', 'chicken'],
    resources: ['oak wood', 'birch wood', 'mushrooms', 'flowers'],
    facts: 'Dense canopy providing rich wood supplies and home to tameable wolves.',
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    temperature: 2.0,
    precipitation: 'None',
    structures: ['desert_pyramid', 'village', 'desert_well', 'pillager_outpost'],
    mobs: ['husk', 'rabbit', 'camel'],
    resources: ['sand', 'sandstone', 'cactus', 'dead bush'],
    facts: 'Dry and hot. Husks spawn in place of zombies and do not burn in sunlight.',
  },
  savanna: {
    id: 'savanna',
    name: 'Savanna',
    temperature: 1.2,
    precipitation: 'None',
    structures: ['village', 'pillager_outpost', 'ruined_portal'],
    mobs: ['llama', 'horse', 'armadillo', 'sheep', 'cow'],
    resources: ['acacia wood', 'tall grass', 'melons'],
    facts: 'Dry grassland with acacia trees and plateau mountains where rain never falls.',
  },
  taiga: {
    id: 'taiga',
    name: 'Taiga',
    temperature: 0.25,
    precipitation: 'Rain/Snow',
    structures: ['village', 'pillager_outpost', 'trail_ruins'],
    mobs: ['fox', 'wolf', 'rabbit', 'sheep'],
    resources: ['spruce wood', 'sweet berries', 'ferns', 'mossy cobble'],
    facts: 'Cool spruce forests with sweet berry bushes and tameable foxes.',
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle',
    temperature: 0.95,
    precipitation: 'Rain',
    structures: ['jungle_temple', 'ruined_portal'],
    mobs: ['ocelot', 'parrot', 'panda'],
    resources: ['jungle wood', 'cocoa beans', 'melons', 'bamboo', 'vines'],
    facts: 'Towering 30-block tall jungle trees with rich biodiversity and cocoa beans.',
  },
  swamp: {
    id: 'swamp',
    name: 'Swamp & Mangrove Swamp',
    temperature: 0.8,
    precipitation: 'Rain',
    structures: ['witch_hut', 'ruined_portal', 'fossil'],
    mobs: ['slime', 'frog', 'witch', 'bat'],
    resources: ['slimeballs', 'lily pads', 'clay', 'mud', 'mangrove wood'],
    facts: 'Shallow murky waters where slimes naturally spawn during full moon phases.',
  },
  badlands: {
    id: 'badlands',
    name: 'Badlands (Mesa)',
    temperature: 2.0,
    precipitation: 'None',
    structures: ['mineshaft', 'ruined_portal'],
    mobs: ['skeleton', 'creeper', 'spider'],
    resources: ['terracotta', 'red sand', 'gold ore (abundant at y: -64 to 256)'],
    facts: 'Striated terracotta plateaus with exposed mineshafts and massive gold ore deposits.',
  },
  ocean: {
    id: 'ocean',
    name: 'Deep & Warm Ocean',
    temperature: 0.5,
    precipitation: 'Rain',
    structures: ['ocean_monument', 'ocean_ruins', 'shipwreck', 'buried_treasure'],
    mobs: ['dolphin', 'drowned', 'turtle', 'guardian', 'elder_guardian', 'tropical_fish'],
    resources: ['prismarine', 'sponge', 'sea lantern', 'heart of the sea', 'seagrass', 'kelp'],
    facts: 'Contains sunken shipwrecks holding treasure maps and massive guardian monuments.',
  },
  cherry_grove: {
    id: 'cherry_grove',
    name: 'Cherry Grove',
    temperature: 0.5,
    precipitation: 'Rain',
    structures: ['ruined_portal', 'trail_ruins'],
    mobs: ['sheep', 'pig', 'bee', 'rabbit'],
    resources: ['cherry wood', 'pink petals', 'bee hives'],
    facts: 'Mountain biome blooming with pink canopy cherry trees and falling blossom particles.',
  },
  deep_dark: {
    id: 'deep_dark',
    name: 'Deep Dark',
    temperature: 0.8,
    precipitation: 'None',
    structures: ['ancient_city'],
    mobs: ['warden'],
    resources: ['sculk', 'sculk catalyst', 'sculk shrieker', 'sculk sensor', 'echo shards'],
    facts: 'Subterranean biome at y: -1 to -64. Vibrations trigger sculk shriekers to summon the Warden.',
  },
  nether_wastes: {
    id: 'nether_wastes',
    name: 'Nether Wastes & Fortresses',
    temperature: 2.0,
    precipitation: 'None',
    structures: ['fortress', 'bastion_remnant', 'ruined_portal'],
    mobs: ['blaze', 'wither_skeleton', 'ghast', 'piglin', 'magma_cube'],
    resources: ['netherrack', 'glowstone', 'nether quartz', 'ancient debris', 'soul sand'],
    facts: 'The Nether dimension. Netheir fortresses contain essential Blaze rods and Nether wart.',
  },
  the_end: {
    id: 'the_end',
    name: 'The End & End Islands',
    temperature: 0.5,
    precipitation: 'None',
    structures: ['end_city'],
    mobs: ['ender_dragon', 'enderman', 'shulker'],
    resources: ['end stone', 'purpur', 'chorus fruit', 'elytra', 'dragon head', 'shulker shell'],
    facts: 'Home of the Ender Dragon and outer islands containing End Cities with flying ships and Elytra.',
  },
};

// Key Mob Catalogue & Drops
export const MOBS = {
  zombie: { id: 'zombie', name: 'Zombie', category: 'hostile', hp: 20, drops: ['rotten flesh', 'iron ingot', 'carrot', 'potato'], burnsInSun: true },
  skeleton: { id: 'skeleton', name: 'Skeleton', category: 'hostile', hp: 20, drops: ['bone', 'arrow', 'bow'], burnsInSun: true },
  creeper: { id: 'creeper', name: 'Creeper', category: 'hostile', hp: 20, drops: ['gunpowder', 'music disc (if killed by skeleton)'], burnsInSun: false },
  spider: { id: 'spider', name: 'Spider', category: 'hostile', hp: 16, drops: ['string', 'spider eye'], burnsInSun: false },
  enderman: { id: 'enderman', name: 'Enderman', category: 'neutral', hp: 40, drops: ['ender pearl'], damageOnWater: true },
  blaze: { id: 'blaze', name: 'Blaze', category: 'hostile', hp: 20, drops: ['blaze rod'], dimension: 'nether' },
  wither_skeleton: { id: 'wither_skeleton', name: 'Wither Skeleton', category: 'hostile', hp: 20, drops: ['coal', 'bone', 'wither skeleton skull (rare)'], dimension: 'nether' },
  wither: { id: 'wither', name: 'Wither Boss', category: 'boss', hp: 600, drops: ['nether star'], destructive: true },
  ender_dragon: { id: 'ender_dragon', name: 'Ender Dragon', category: 'boss', hp: 200, drops: ['dragon egg', '12,000 XP'], dimension: 'the_end', destructive: true },
  warden: { id: 'warden', name: 'Warden', category: 'hostile', hp: 500, drops: ['sculk catalyst', '5 XP'], blind: true },
  iron_golem: { id: 'iron_golem', name: 'Iron Golem', category: 'utility', hp: 100, drops: ['iron ingot', 'poppy'] },
  villager: { id: 'villager', name: 'Villager', category: 'passive', hp: 20, trades: true },
  cow: { id: 'cow', name: 'Cow', category: 'passive', hp: 10, drops: ['raw beef', 'leather'] },
  sheep: { id: 'sheep', name: 'Sheep', category: 'passive', hp: 8, drops: ['mutton', 'wool'] },
};

// Essential Command Rules and Limitations in Bedrock
export const COMMAND_LIMITS = {
  maxGiveAmount: 64, // per slot
  maxSummonBatch: 50, // safe ceiling to avoid crash/freeze in BlueStacks
  maxFillBlocks: 32768, // Bedrock /fill limit
  maxEffectSeconds: 1000000,
  maxEffectAmplifier: 255,
  maxLevelXp: 24791, // Bedrock 32-bit float boundary
  maxPointsXp: 2147483647,
};

/**
 * Find biome by partial query or coordinates description
 */
export function lookupBiome(query) {
  if (!query) return null;
  const q = String(query).toLowerCase().trim().replace(/^minecraft:/, '');
  if (BIOMES[q]) return BIOMES[q];
  for (const [key, b] of Object.entries(BIOMES)) {
    if (key === q || b.name.toLowerCase() === q) {
      return b;
    }
  }
  for (const [key, b] of Object.entries(BIOMES)) {
    if (key.includes(q) || b.name.toLowerCase().includes(q)) {
      return b;
    }
  }
  return null;
}

/**
 * Find mob by query
 */
export function lookupMob(query) {
  if (!query) return null;
  const q = String(query).toLowerCase().trim().replace(/^minecraft:/, '');
  if (MOBS[q]) return MOBS[q];
  for (const [key, m] of Object.entries(MOBS)) {
    if (key === q || m.name.toLowerCase() === q) {
      return m;
    }
  }
  if (q.includes('nero') || q.includes('n3r0')) {
    return { id: 'nero:n3r0', name: 'N3R0 Companion', category: 'companion', hp: 100, immune: true };
  }
  for (const [key, m] of Object.entries(MOBS)) {
    if (key.includes(q) || m.name.toLowerCase().includes(q)) {
      return m;
    }
  }
  return null;
}

/**
 * Compact Bounded Region Indexer (10,000 x 10,000 blocks)
 * Divides 10,000x10,000 area into 500x500 meter regional grids.
 * Never stores individual blocks in RAM — only bounded landmark points.
 */
class BoundedWorldIndex {
  constructor() {
    this.landmarks = new Map(); // "x,z" -> { type, name, coords, discoveredAt }
    this.maxLandmarks = 500;
  }

  recordLandmark(type, name, x, y, z) {
    const key = `${Math.round(x / 50)},${Math.round(z / 50)}`;
    if (this.landmarks.size >= this.maxLandmarks) {
      const oldestKey = this.landmarks.keys().next().value;
      this.landmarks.delete(oldestKey);
    }
    const landmark = {
      type,
      name,
      coords: { x: Math.round(x), y: Math.round(y), z: Math.round(z) },
      discoveredAt: new Date().toISOString(),
    };
    this.landmarks.set(key, landmark);
    return landmark;
  }

  findNearestLandmarks(x, z, limit = 5) {
    const results = [];
    for (const item of this.landmarks.values()) {
      const dist = Math.hypot(item.coords.x - x, item.coords.z - z);
      results.push({ ...item, distance: Math.round(dist) });
    }
    return results.sort((a, b) => a.distance - b.distance).slice(0, limit);
  }

  clampCoordinates({ x = 0, y = 64, z = 0 } = {}) {
    return {
      x: Math.max(-10000, Math.min(10000, Number(x) || 0)),
      y: Math.max(-64, Math.min(320, Number(y) || 64)),
      z: Math.max(-10000, Math.min(10000, Number(z) || 0)),
    };
  }

  getLandmarkCount() {
    return this.landmarks.size;
  }
}

export function clampCoordinates(coords) {
  return boundedWorldIndex.clampCoordinates(coords);
}

export const boundedWorldIndex = new BoundedWorldIndex();

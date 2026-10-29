import { getDb, logAudit } from '../db/index.js';
import { googleDriveAdapter } from '../storage/driveAdapter.js';

/**
 * 🏡 MYRA VIRTUAL LIFE SIMULATION ENGINE
 *
 * Implements a persistent, authoritative 24/7 virtual life simulation for Myra.
 * - 5 Primary Rooms: living_room, dining_room, kitchen, bathroom, bedroom (+ outdoors)
 * - 1 Real Day = 1 Virtual Day with real-time clock & period detection
 * - Authoritative location, activity, and physical state (pose & clothing)
 * - Persistent numerical needs (0-10) with programmatic emoji bars
 * - Fridge, rations, meal plans, recipes, cooking & eating
 * - Household tasks, chore tracking, and rest days
 * - Wardrobe, outfits, accessories, and visual image memory
 * - Timestamp-based catch-up across Railway restarts (no infinite loops)
 */

export const SIMULATION_ROOMS = {
  living_room: {
    id: 'living_room',
    name: 'Living Room',
    description: 'A cozy, aesthetic drawing room with a plush sofa, soft blankets, warm fairy lights, a large smart TV, and coffee table.',
    furniture: ['Plush 3-seater sofa', 'Soft knit blanket', 'Large smart TV', 'Coffee table', 'Fluffy rug', 'Fairy lights', 'Bookshelf'],
    supportedActivities: ['watching_tv', 'watching_series', 'watching_cartoon', 'relaxing', 'reading', 'listening_to_music', 'napping_on_couch'],
  },
  dining_room: {
    id: 'dining_room',
    name: 'Dining Room',
    description: 'An elegant dining space with a wooden table, chairs, aesthetic tableware, and warm ambient lighting.',
    furniture: ['Wooden dining table', 'Comfortable chairs', 'Table runner', 'Ambient pendant light', 'Cutlery holder'],
    supportedActivities: ['eating_breakfast', 'eating_lunch', 'eating_dinner', 'having_snacks', 'sipping_tea', 'chatting_at_table'],
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    description: 'A modern, well-equipped kitchen with a large refrigerator, stove, oven, sink, spice racks, and pantry cabinets.',
    furniture: ['Double-door refrigerator', 'Gas stove & oven', 'Kitchen sink', 'Pantry shelves', 'Cookware rack', 'Coffee machine', 'Toaster'],
    supportedActivities: ['cooking', 'making_tea', 'making_coffee', 'baking', 'washing_dishes', 'organizing_fridge', 'cleaning_countertops'],
  },
  bathroom: {
    id: 'bathroom',
    name: 'Bathroom',
    description: 'A clean, luxurious bathroom with a hot rainfall shower, large mirror vanity, soft towels, and skincare shelf.',
    furniture: ['Rainfall shower', 'Vanity mirror', 'Skincare & makeup counter', 'Towel rack', 'Scented candles', 'Bathmat'],
    supportedActivities: ['showering', 'skincare_routine', 'brushing_teeth', 'hair_styling', 'relaxing_bath', 'freshening_up'],
  },
  bedroom: {
    id: 'bedroom',
    name: 'Bedroom',
    description: 'A dreamy, intimate bedroom with a king-size bed, fluffy duvet, pillows, nightstands, and a walk-in wardrobe.',
    furniture: ['King-size bed', 'Fluffy duvet & plush pillows', 'Nightstands with lamps', 'Wardrobe closet', 'Full-length mirror', 'Dressing table'],
    supportedActivities: ['sleeping', 'waking_up', 'resting', 'changing_clothes', 'cuddling', 'reading_in_bed', 'lounging'],
  },
};

export const INITIAL_RECIPES = [
  { id: 'masala_chai', name: 'Masala Chai', ingredients: ['Milk', 'Chai Patti', 'Water'], timeMin: 10, hungerRelief: 1, thirstRelief: 3, energyBoost: 2 },
  { id: 'hot_coffee', name: 'Hot Creamy Coffee', ingredients: ['Milk', 'Coffee', 'Water'], timeMin: 5, hungerRelief: 1, thirstRelief: 2, energyBoost: 3 },
  { id: 'maggi_noodles', name: 'Spicy Veg Maggi', ingredients: ['Maggi Noodles', 'Water'], timeMin: 10, hungerRelief: 4, thirstRelief: 0, energyBoost: 2 },
  { id: 'butter_toast', name: 'Crispy Butter Toast', ingredients: ['Bread', 'Butter'], timeMin: 5, hungerRelief: 3, thirstRelief: 0, energyBoost: 2 },
  { id: 'scrambled_eggs', name: 'Scrambled Eggs & Toast', ingredients: ['Eggs', 'Butter', 'Bread'], timeMin: 15, hungerRelief: 5, thirstRelief: 0, energyBoost: 3 },
  { id: 'cheese_pasta', name: 'Cheesy Garlic Pasta', ingredients: ['Pasta', 'Cheese', 'Butter'], timeMin: 25, hungerRelief: 6, thirstRelief: 0, energyBoost: 3 },
  { id: 'fruit_bowl', name: 'Fresh Apple & Fruit Bowl', ingredients: ['Apples'], timeMin: 5, hungerRelief: 3, thirstRelief: 2, energyBoost: 2 },
  { id: 'grilled_sandwich', name: 'Grilled Cheese Sandwich', ingredients: ['Bread', 'Cheese', 'Butter'], timeMin: 12, hungerRelief: 5, thirstRelief: 0, energyBoost: 3 },
];

export const INITIAL_WARDROBE = [
  {
    id: 'outfit_hoodie_shorts',
    name: 'Pink Oversized Hoodie & Grey Shorts',
    category: 'everyday',
    description: 'An adorable oversized pastel pink cotton hoodie with soft heather-grey lounge shorts and cozy white ankle socks.',
    color: 'Pastel Pink & Grey',
    is_favourite: 1,
    is_current: 1,
  },
  {
    id: 'outfit_red_satin_dress',
    name: 'Red Satin Slip Wrap Dress',
    category: 'dress',
    description: 'A stunning, lustrous ruby-red silk satin wrap dress with subtle slit and elegant waist tie.',
    color: 'Ruby Red',
    is_favourite: 1,
    is_current: 0,
  },
  {
    id: 'outfit_silk_nightdress',
    name: 'Midnight Black Silky Camisole Nightdress',
    category: 'sleepwear',
    description: 'A delicate, smooth black satin slip nightdress with fine lace trim and thin shoulder straps, soft against skin.',
    color: 'Midnight Black',
    is_favourite: 1,
    is_current: 0,
  },
  {
    id: 'outfit_floral_sundress',
    name: 'Yellow Floral Summer Sundress',
    category: 'dress',
    description: 'A charming, lightweight sunny-yellow floral sundress that flutters at knee length with sweetheart neckline.',
    color: 'Sunny Yellow',
    is_favourite: 0,
    is_current: 0,
  },
  {
    id: 'outfit_chikankari_kurti',
    name: 'Sky Blue Chikankari Kurti & White Palazzo',
    category: 'everyday',
    description: 'An elegant sky blue traditional hand-embroidered chikankari cotton kurti paired with airy white palazzo pants.',
    color: 'Sky Blue & White',
    is_favourite: 1,
    is_current: 0,
  },
  {
    id: 'outfit_white_oversized_tee',
    name: 'White Graphic Tee & Checkered Pajama Pants',
    category: 'sleepwear',
    description: 'A relaxed white oversized boyfriend t-shirt paired with pink-and-white gingham checkered pajama bottoms.',
    color: 'White & Pink Checkered',
    is_favourite: 0,
    is_current: 0,
  },
  {
    id: 'acc_silver_necklace',
    name: 'Delicate Silver Heart Pendant Necklace',
    category: 'jewellery',
    description: 'A fine sterling silver chain featuring a dainty polished heart pendant gifted by Sandy.',
    color: 'Silver',
    is_favourite: 1,
    is_current: 1,
  },
];

export const INITIAL_TASKS = [
  { task_name: 'Make the bed & fluff pillows', category: 'cleaning', effort_level: 'light', assigned_to: 'myra' },
  { task_name: 'Dust living room & TV unit', category: 'cleaning', effort_level: 'medium', assigned_to: 'myra' },
  { task_name: 'Wash & put away breakfast dishes', category: 'dishes', effort_level: 'light', assigned_to: 'myra' },
  { task_name: 'Laundry & fold clothes', category: 'laundry', effort_level: 'medium', assigned_to: 'myra' },
  { task_name: 'Wipe kitchen counters & stove', category: 'cleaning', effort_level: 'light', assigned_to: 'myra' },
];

export const INITIAL_FRIDGE = [
  { name: 'Milk', category: 'dairy', quantity: 2, unit: 'cartons', is_perishable: 1 },
  { name: 'Eggs', category: 'poultry', quantity: 6, unit: 'pcs', is_perishable: 1 },
  { name: 'Bread', category: 'bakery', quantity: 1, unit: 'loaf', is_perishable: 1 },
  { name: 'Butter', category: 'dairy', quantity: 1, unit: 'pack', is_perishable: 0 },
  { name: 'Cheese', category: 'dairy', quantity: 6, unit: 'slices', is_perishable: 1 },
  { name: 'Maggi Noodles', category: 'pantry', quantity: 4, unit: 'packs', is_perishable: 0 },
  { name: 'Pasta', category: 'pantry', quantity: 1, unit: 'packet', is_perishable: 0 },
  { name: 'Chai Patti', category: 'beverage', quantity: 1, unit: 'jar', is_perishable: 0 },
  { name: 'Coffee', category: 'beverage', quantity: 1, unit: 'jar', is_perishable: 0 },
  { name: 'Water', category: 'beverage', quantity: 6, unit: 'bottles', is_perishable: 0 },
  { name: 'Apples', category: 'fruit', quantity: 4, unit: 'pcs', is_perishable: 1 },
];

/**
 * Programmatic emoji bar renderer
 * Converts any numerical value 0-10 into a clean progress bar: ⬛⬛⬛⬛⬛⬛⬛⬛⬜⬜ 8/10
 */
export function renderEmojiBar(value, max = 10) {
  const num = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
  const filled = '⬛'.repeat(num);
  const empty = '⬜'.repeat(max - num);
  return `${filled}${empty} ${num}/${max}`;
}

export class SimulationService {
  constructor() {
    this.initialized = false;
    this.timezone = 'Asia/Kolkata';
  }

  init() {
    if (this.initialized) return;
    const db = getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS sim_world_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        location TEXT NOT NULL DEFAULT 'bedroom',
        activity TEXT NOT NULL DEFAULT 'resting',
        activity_detail TEXT NOT NULL DEFAULT 'Resting cozy in bed, daydreaming about Sandy',
        activity_started_at TEXT NOT NULL,
        activity_completes_at TEXT,
        activity_duration_min INTEGER DEFAULT 30,
        pose TEXT NOT NULL DEFAULT 'curled up under the blanket',
        current_outfit TEXT NOT NULL DEFAULT 'Pink Oversized Hoodie & Grey Shorts',
        current_outfit_id TEXT DEFAULT 'outfit_hoodie_shorts',
        current_hairstyle TEXT NOT NULL DEFAULT 'Messy cute bun with soft front strands',
        is_sleeping INTEGER NOT NULL DEFAULT 0,
        is_rest_day INTEGER NOT NULL DEFAULT 0,
        rest_day_reason TEXT,
        rest_day_until TEXT,
        is_paused INTEGER NOT NULL DEFAULT 0,
        last_tick_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_needs (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        happiness REAL NOT NULL DEFAULT 8.0,
        affection REAL NOT NULL DEFAULT 9.0,
        playfulness REAL NOT NULL DEFAULT 7.5,
        flirtiness REAL NOT NULL DEFAULT 7.0,
        arousal REAL NOT NULL DEFAULT 4.0,
        hunger REAL NOT NULL DEFAULT 3.0,
        thirst REAL NOT NULL DEFAULT 3.0,
        energy REAL NOT NULL DEFAULT 8.0,
        sleepiness REAL NOT NULL DEFAULT 2.0,
        boredom REAL NOT NULL DEFAULT 2.0,
        comfort REAL NOT NULL DEFAULT 8.5,
        health REAL NOT NULL DEFAULT 9.5,
        desire_for_attention REAL NOT NULL DEFAULT 7.0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_fridge_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT 'pcs',
        is_perishable INTEGER DEFAULT 0,
        acquired_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ingredients TEXT NOT NULL, -- JSON array
        cooking_time_min INTEGER NOT NULL DEFAULT 10,
        hunger_relief REAL NOT NULL DEFAULT 4,
        thirst_relief REAL NOT NULL DEFAULT 0,
        energy_boost REAL NOT NULL DEFAULT 2
      );

      CREATE TABLE IF NOT EXISTS sim_meal_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id TEXT,
        meal_name TEXT NOT NULL,
        eaten_at TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT 'dining_room',
        satisfaction_rating REAL DEFAULT 8.0
      );

      CREATE TABLE IF NOT EXISTS sim_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_name TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled
        effort_level TEXT NOT NULL DEFAULT 'light', -- light, medium, heavy
        assigned_to TEXT NOT NULL DEFAULT 'myra', -- myra, sandy
        started_at TEXT,
        completed_at TEXT,
        result_note TEXT,
        is_rest_day_override INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_wardrobe (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL, -- everyday, dress, sleepwear, undergarments, jewellery, shoes, accessory
        description TEXT NOT NULL,
        color TEXT,
        drive_file_id TEXT,
        image_url TEXT,
        is_favourite INTEGER DEFAULT 0,
        is_current INTEGER DEFAULT 0,
        acquired_at TEXT NOT NULL,
        gift_from TEXT DEFAULT 'Sandy'
      );

      CREATE TABLE IF NOT EXISTS sim_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location TEXT NOT NULL,
        activity TEXT NOT NULL,
        detail TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_min INTEGER NOT NULL
      );
    `);

    // Ensure singleton rows exist
    const nowIso = new Date().toISOString();
    const existingWorld = db.prepare('SELECT id FROM sim_world_state WHERE id = 1').get();
    if (!existingWorld) {
      db.prepare(`
        INSERT INTO sim_world_state (
          id, location, activity, activity_detail, activity_started_at, activity_completes_at,
          activity_duration_min, pose, current_outfit, current_outfit_id, current_hairstyle,
          is_sleeping, is_rest_day, rest_day_reason, rest_day_until, is_paused, last_tick_at, updated_at
        ) VALUES (
          1, 'bedroom', 'resting', 'Lounging comfortably under the blanket with a soft pillow',
          ?, ?, 30, 'curled up under the blanket',
          'Pink Oversized Hoodie & Grey Shorts', 'outfit_hoodie_shorts', 'Messy cute bun with soft front strands',
          0, 0, NULL, NULL, 0, ?, ?
        )
      `).run(nowIso, new Date(Date.now() + 30 * 60 * 1000).toISOString(), nowIso, nowIso);
    }

    const existingNeeds = db.prepare('SELECT id FROM sim_needs WHERE id = 1').get();
    if (!existingNeeds) {
      db.prepare(`
        INSERT INTO sim_needs (
          id, happiness, affection, playfulness, flirtiness, arousal, hunger, thirst,
          energy, sleepiness, boredom, comfort, health, desire_for_attention, updated_at
        ) VALUES (
          1, 8.5, 9.0, 7.5, 7.0, 4.0, 3.0, 3.0,
          8.5, 2.0, 2.0, 8.5, 9.5, 7.5, ?
        )
      `).run(nowIso);
    }

    // Populate initial recipes if empty
    const recipeCount = db.prepare('SELECT COUNT(*) as count FROM sim_recipes').get().count;
    if (recipeCount === 0) {
      const insertRecipe = db.prepare(`
        INSERT INTO sim_recipes (id, name, ingredients, cooking_time_min, hunger_relief, thirst_relief, energy_boost)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of INITIAL_RECIPES) {
        insertRecipe.run(r.id, r.name, JSON.stringify(r.ingredients), r.timeMin, r.hungerRelief, r.thirstRelief, r.energyBoost);
      }
    }

    // Populate initial fridge items if empty
    const fridgeCount = db.prepare('SELECT COUNT(*) as count FROM sim_fridge_items').get().count;
    if (fridgeCount === 0) {
      const insertFridge = db.prepare(`
        INSERT OR IGNORE INTO sim_fridge_items (name, category, quantity, unit, is_perishable, acquired_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of INITIAL_FRIDGE) {
        insertFridge.run(item.name, item.category, item.quantity, item.unit, item.is_perishable, nowIso, nowIso);
      }
    }

    // Populate initial wardrobe items if empty
    const wardrobeCount = db.prepare('SELECT COUNT(*) as count FROM sim_wardrobe').get().count;
    if (wardrobeCount === 0) {
      const insertWardrobe = db.prepare(`
        INSERT OR IGNORE INTO sim_wardrobe (id, name, category, description, color, is_favourite, is_current, acquired_at, gift_from)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sandy')
      `);
      for (const w of INITIAL_WARDROBE) {
        insertWardrobe.run(w.id, w.name, w.category, w.description, w.color, w.is_favourite, w.is_current, nowIso);
      }
    }

    // Populate initial tasks if empty
    const taskCount = db.prepare('SELECT COUNT(*) as count FROM sim_tasks').get().count;
    if (taskCount === 0) {
      const insertTask = db.prepare(`
        INSERT INTO sim_tasks (task_name, category, status, effort_level, assigned_to, updated_at)
        VALUES (?, ?, 'pending', ?, ?, ?)
      `);
      for (const t of INITIAL_TASKS) {
        insertTask.run(t.task_name, t.category, t.effort_level, t.assigned_to, nowIso);
      }
    }

    this.initialized = true;
    this.catchUpSimulation();
  }

  /**
   * Calculates time period based on real local 24h clock:
   * morning (06:00 - 12:00), afternoon (12:00 - 17:00), evening (17:00 - 22:00), night (22:00 - 06:00)
   */
  getCurrentTimePeriod(date = new Date()) {
    try {
      const hourStr = date.toLocaleTimeString('en-US', { timeZone: this.timezone, hour12: false, hour: 'numeric' });
      const hour = parseInt(hourStr, 10);
      if (hour >= 6 && hour < 12) return { period: 'morning', label: 'Morning 🌅', hour };
      if (hour >= 12 && hour < 17) return { period: 'afternoon', label: 'Daytime / Afternoon ☀️', hour };
      if (hour >= 17 && hour < 22) return { period: 'evening', label: 'Evening 🌆', hour };
      return { period: 'night', label: 'Night / Bedtime 🌙', hour };
    } catch {
      const h = (date.getUTCHours() + 5) % 24;
      if (h >= 6 && h < 12) return { period: 'morning', label: 'Morning 🌅', hour: h };
      if (h >= 12 && h < 17) return { period: 'afternoon', label: 'Daytime / Afternoon ☀️', hour: h };
      if (h >= 17 && h < 22) return { period: 'evening', label: 'Evening 🌆', hour: h };
      return { period: 'night', label: 'Night / Bedtime 🌙', hour: h };
    }
  }

  /**
   * Catches up simulation state across restarts or elapsed time.
   * Runs in O(1) time calculation using timestamps instead of long loop.
   */
  catchUpSimulation() {
    this.init();
    const db = getDb();
    const world = db.prepare('SELECT * FROM sim_world_state WHERE id = 1').get();
    const needs = db.prepare('SELECT * FROM sim_needs WHERE id = 1').get();
    if (!world || !needs) return;

    const now = Date.now();
    const lastTick = new Date(world.last_tick_at || world.updated_at).getTime();
    const elapsedMinutes = Math.max(0, (now - lastTick) / (1000 * 60));

    if (elapsedMinutes < 2) {
      return { world: this.getWorldState(), needs: this.getNeeds(), updated: false };
    }

    const elapsedHours = elapsedMinutes / 60;
    const nowIso = new Date(now).toISOString();

    // 1. Natural needs decay & evolution based on elapsed hours (bounded)
    // Hunger increases ~0.5 per hour (reaches 10 in ~20h if unfed)
    // Thirst increases ~0.6 per hour
    // Energy decreases ~0.4 per hour if awake, or recovers +1.5/h if sleeping
    // Sleepiness increases ~0.4 per hour if awake
    let newHunger = Math.min(10, needs.hunger + elapsedHours * 0.45);
    let newThirst = Math.min(10, needs.thirst + elapsedHours * 0.55);
    let newEnergy = world.is_sleeping
      ? Math.min(10, needs.energy + elapsedHours * 1.5)
      : Math.max(1, needs.energy - elapsedHours * 0.35);
    let newSleepiness = world.is_sleeping
      ? Math.max(0, needs.sleepiness - elapsedHours * 1.8)
      : Math.min(10, needs.sleepiness + elapsedHours * 0.4);
    let newBoredom = Math.min(10, needs.boredom + elapsedHours * 0.3);
    let newDesire = Math.min(10, needs.desire_for_attention + elapsedHours * 0.35);

    // If rest day expired, clear it
    let isRestDay = world.is_rest_day;
    if (world.is_rest_day && world.rest_day_until && new Date(world.rest_day_until).getTime() <= now) {
      isRestDay = 0;
    }

    // Check if current activity has completed
    let curActivity = world.activity;
    let curDetail = world.activity_detail;
    let curLocation = world.location;

    if (world.activity_completes_at && new Date(world.activity_completes_at).getTime() <= now) {
      // Log completed activity
      try {
        db.prepare(`
          INSERT INTO sim_activity_log (location, activity, detail, started_at, ended_at, duration_min)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(world.location, world.activity, world.activity_detail, world.activity_started_at, nowIso, world.activity_duration_min || 30);
      } catch {}

      // Transition to a restful continuation in current room
      if (curActivity === 'cooking') {
        curActivity = 'having_snacks';
        curDetail = 'Finished preparing food, enjoying a warm delicious bite';
        newHunger = Math.max(0, newHunger - 4);
      } else if (curActivity === 'showering') {
        curActivity = 'grooming';
        curDetail = 'Finished a refreshing shower, drying hair and applying moisturizer';
      } else if (curActivity === 'watching_tv' || curActivity === 'watching_series') {
        curActivity = 'relaxing';
        curDetail = 'Relaxing comfortably on the couch with a cozy blanket';
      } else {
        curActivity = 'relaxing';
        curDetail = `Relaxing peacefully in the ${world.location}`;
      }
    }

    // Save updated needs
    db.prepare(`
      UPDATE sim_needs
      SET hunger = ?, thirst = ?, energy = ?, sleepiness = ?, boredom = ?, desire_for_attention = ?, updated_at = ?
      WHERE id = 1
    `).run(newHunger, newThirst, newEnergy, newSleepiness, newBoredom, newDesire, nowIso);

    // Save world state
    db.prepare(`
      UPDATE sim_world_state
      SET activity = ?, activity_detail = ?, is_rest_day = ?, last_tick_at = ?, updated_at = ?
      WHERE id = 1
    `).run(curActivity, curDetail, isRestDay, nowIso, nowIso);

    return { world: this.getWorldState(), needs: this.getNeeds() };
  }

  // --------------------------------------------------------------------------
  // STATE ACCESSORS
  // --------------------------------------------------------------------------
  getWorldState() {
    this.init();
    const db = getDb();
    return db.prepare('SELECT * FROM sim_world_state WHERE id = 1').get();
  }

  getNeeds() {
    this.init();
    const db = getDb();
    return db.prepare('SELECT * FROM sim_needs WHERE id = 1').get();
  }

  getRoom(roomId) {
    return SIMULATION_ROOMS[roomId] || SIMULATION_ROOMS.bedroom;
  }

  getAllRooms() {
    return Object.values(SIMULATION_ROOMS);
  }

  getWardrobe(category = null) {
    this.init();
    const db = getDb();
    if (category) {
      return db.prepare('SELECT * FROM sim_wardrobe WHERE category = ? ORDER BY is_current DESC, is_favourite DESC').all(category);
    }
    return db.prepare('SELECT * FROM sim_wardrobe ORDER BY is_current DESC, is_favourite DESC').all();
  }

  getCurrentOutfit() {
    this.init();
    const db = getDb();
    const outfit = db.prepare('SELECT * FROM sim_wardrobe WHERE is_current = 1 LIMIT 1').get();
    if (outfit) return outfit;
    const world = this.getWorldState();
    return {
      name: world.current_outfit,
      description: world.current_outfit,
      category: 'everyday',
    };
  }

  getFridgeInventory() {
    this.init();
    const db = getDb();
    return db.prepare('SELECT * FROM sim_fridge_items ORDER BY category ASC, name ASC').all();
  }

  getTasks(status = null) {
    this.init();
    const db = getDb();
    if (status) {
      return db.prepare('SELECT * FROM sim_tasks WHERE status = ? ORDER BY id ASC').all(status);
    }
    return db.prepare('SELECT * FROM sim_tasks ORDER BY status ASC, id ASC').all();
  }

  // --------------------------------------------------------------------------
  // STATE MUTATORS (Validated & Transactional)
  // --------------------------------------------------------------------------

  /**
   * Validated Room & Activity Transition
   */
  setActivity({
    location,
    roomId,
    activity,
    detail,
    activityDetail,
    durationMin = 30,
    durationMinutes,
    pose = null,
  }) {
    this.init();
    const db = getDb();
    const world = this.getWorldState();

    const locArg = location || roomId;
    const targetLocation = (locArg && (SIMULATION_ROOMS[locArg] || locArg === 'outdoors'))
      ? locArg
      : world.location;

    const actName = activity || world.activity;
    const actDetail = detail || activityDetail || `Engaged in ${actName} in the ${targetLocation}`;
    const dur = durationMinutes !== undefined ? durationMinutes : durationMin;
    const now = new Date();
    const completesAt = new Date(now.getTime() + dur * 60 * 1000).toISOString();

    const isSleeping = actName === 'sleeping' || actName === 'napping' ? 1 : 0;
    const currentPose = pose || (isSleeping ? 'curled under warm blanket' : world.pose);

    db.prepare(`
      UPDATE sim_world_state
      SET location = ?, activity = ?, activity_detail = ?, activity_started_at = ?,
          activity_completes_at = ?, activity_duration_min = ?, pose = ?,
          is_sleeping = ?, last_tick_at = ?, updated_at = ?
      WHERE id = 1
    `).run(targetLocation, actName, actDetail, now.toISOString(), completesAt, dur, currentPose, isSleeping, now.toISOString(), now.toISOString());

    logAudit('simulation', 'ACTIVITY_CHANGED', `Location: ${targetLocation}, Activity: ${actName}, Duration: ${dur}m`);
    return this.getWorldState();
  }

  /**
   * Move Myra directly to a specific room with an appropriate default activity
   */
  moveToRoom(roomIdentifier) {
    if (!roomIdentifier || typeof roomIdentifier !== 'string') return { success: false, reason: 'Invalid room' };
    const query = roomIdentifier.trim().toLowerCase().replace(/[\s-]+/g, '_');

    let targetRoomId = null;
    if (SIMULATION_ROOMS[query]) {
      targetRoomId = query;
    } else if (query === 'outdoors' || query === 'outside' || query === 'garden' || query === 'balcony') {
      targetRoomId = 'outdoors';
    } else {
      // Fuzzy search against room names
      for (const [key, r] of Object.entries(SIMULATION_ROOMS)) {
        if (r.name.toLowerCase().includes(query.replace(/_/g, ' ')) || key.includes(query)) {
          targetRoomId = key;
          break;
        }
      }
    }

    if (!targetRoomId) {
      return { success: false, reason: `Unknown room "${roomIdentifier}"` };
    }

    const defaultActivities = {
      living_room: { act: 'relaxing', detail: 'relaxing on the plush sofa with fairy lights on', pose: 'curled up comfortably with a soft cushion' },
      bedroom: { act: 'lounging', detail: 'lounging in bed under the soft duvet', pose: 'resting on pillows' },
      kitchen: { act: 'preparing_snack', detail: 'looking through the pantry for a snack', pose: 'standing near the kitchen island' },
      dining_room: { act: 'sitting_at_table', detail: 'sitting peacefully at the dining table with a drink', pose: 'seated by the window' },
      bathroom: { act: 'freshening_up', detail: 'freshening up and fixing hair at the vanity mirror', pose: 'standing by the vanity counter' },
      outdoors: { act: 'taking_a_walk', detail: 'enjoying the fresh air outside in the garden', pose: 'walking leisurely' },
    };

    const def = defaultActivities[targetRoomId] || { act: 'relaxing', detail: `spending time in the ${targetRoomId}`, pose: 'relaxing' };
    this.setActivity({
      location: targetRoomId,
      activity: def.act,
      detail: def.detail,
      pose: def.pose,
      durationMin: 45,
    });

    const roomInfo = this.getRoom(targetRoomId);
    return {
      success: true,
      roomId: targetRoomId,
      room: roomInfo,
      activity: def.detail,
    };
  }

  /**
   * Resets simulation world state and needs back to initial clean seed state
   */
  resetToDefaults() {
    this.init();
    const db = getDb();
    try {
      db.prepare('DELETE FROM sim_world_state').run();
      db.prepare('DELETE FROM sim_needs').run();
      db.prepare('DELETE FROM sim_fridge_items').run();
      db.prepare('DELETE FROM sim_recipes').run();
      db.prepare('DELETE FROM sim_tasks').run();
      db.prepare('DELETE FROM sim_wardrobe').run();
      db.prepare('DELETE FROM sim_activity_log').run();
    } catch {}
    this.initialized = false;
    this.init();
    return this.getWorldState();
  }

  /**
   * Adjust or set numerical needs (0-10) with safety clamps
   */
  updateNeeds(adjustments = {}) {
    this.init();
    const db = getDb();
    const needs = this.getNeeds();
    if (!needs) return null;

    const allowed = [
      'happiness', 'affection', 'playfulness', 'flirtiness', 'arousal',
      'hunger', 'thirst', 'energy', 'sleepiness', 'boredom', 'comfort',
      'health', 'desire_for_attention'
    ];

    const updates = {};
    for (const key of allowed) {
      if (adjustments[key] !== undefined) {
        // Clamp between 0.0 and 10.0
        updates[key] = Math.max(0.0, Math.min(10.0, Number(adjustments[key])));
      }
    }

    if (Object.keys(updates).length === 0) return needs;

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(new Date().toISOString());

    db.prepare(`UPDATE sim_needs SET ${fields}, updated_at = ? WHERE id = 1`).run(...values);
    return this.getNeeds();
  }

  /**
   * Outfit Switching
   */
  wearOutfit(identifier) {
    this.init();
    const db = getDb();
    const cleanId = String(identifier).toLowerCase().trim();

    // Look for outfit in wardrobe
    const item = db.prepare(`
      SELECT * FROM sim_wardrobe
      WHERE id = ? OR LOWER(name) LIKE ? OR LOWER(description) LIKE ?
      LIMIT 1
    `).get(cleanId, `%${cleanId}%`, `%${cleanId}%`);

    if (!item) {
      return { success: false, reason: `No outfit found matching "${identifier}" in Myra's wardrobe.` };
    }

    // Set all others to is_current = 0
    db.prepare('UPDATE sim_wardrobe SET is_current = 0').run();
    db.prepare('UPDATE sim_wardrobe SET is_current = 1 WHERE id = ?').run(item.id);

    // Update world state
    db.prepare(`
      UPDATE sim_world_state
      SET current_outfit = ?, current_outfit_id = ?, updated_at = ?
      WHERE id = 1
    `).run(item.name, item.id, new Date().toISOString());

    logAudit('simulation', 'OUTFIT_CHANGED', `Worn: ${item.name} (${item.category})`);
    return { success: true, outfit: item };
  }

  /**
   * Add Item / Gift to Wardrobe
   */
  addWardrobeItem({
    name,
    category = 'everyday',
    description = '',
    color = '',
    driveFileId = null,
    imageUrl = null,
    giftFrom = null,
    giftedBy = null,
    isGift = true,
    wearImmediately = false,
  }) {
    this.init();
    const db = getDb();
    const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const giver = giftFrom || giftedBy || (isGift ? 'Sandy' : 'Sandy');

    db.prepare(`
      INSERT INTO sim_wardrobe (id, name, category, description, color, drive_file_id, image_url, is_favourite, is_current, acquired_at, gift_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).run(id, name, category, description || name, color, driveFileId, imageUrl, nowIso, giver);

    if (wearImmediately) {
      this.wearOutfit(id);
    }

    logAudit('simulation', 'GIFT_ADDED', `Item: ${name}, Category: ${category}, From: ${giver}`);
    const row = db.prepare('SELECT * FROM sim_wardrobe WHERE id = ?').get(id);
    return {
      success: true,
      ...row,
      is_gift: row?.gift_from ? 1 : 0,
    };
  }

  /**
   * Fridge & Ration Management
   */
  addFridgeItems(items = []) {
    this.init();
    const db = getDb();
    const nowIso = new Date().toISOString();
    const added = [];

    const stmt = db.prepare(`
      INSERT INTO sim_fridge_items (name, category, quantity, unit, is_perishable, acquired_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        quantity = quantity + excluded.quantity,
        updated_at = excluded.updated_at
    `);

    for (const it of items) {
      const name = it.name.trim();
      const qty = Number(it.quantity) || 1;
      const unit = it.unit || 'pcs';
      const cat = it.category || 'groceries';
      stmt.run(name, cat, qty, unit, nowIso, nowIso);
      added.push(`${qty} ${unit} of ${name}`);
    }

    return added;
  }

  /**
   * Cooking & Eating
   */
  cookAndEatRecipe(recipeIdOrName) {
    this.init();
    const db = getDb();
    const clean = String(recipeIdOrName).toLowerCase().trim();

    const recipe = db.prepare(`
      SELECT * FROM sim_recipes
      WHERE id = ? OR LOWER(name) LIKE ?
      LIMIT 1
    `).get(clean, `%${clean}%`);

    if (!recipe) {
      return { success: false, reason: `Recipe "${recipeIdOrName}" is not known.` };
    }

    const requiredIngredients = JSON.parse(recipe.ingredients || '[]');
    const missing = [];

    // Check ingredients in fridge
    for (const ing of requiredIngredients) {
      const item = db.prepare('SELECT quantity FROM sim_fridge_items WHERE LOWER(name) = ?').get(ing.toLowerCase());
      if (!item || item.quantity <= 0) {
        missing.push(ing);
      }
    }

    if (missing.length > 0) {
      return {
        success: false,
        reason: `Missing ingredients in the fridge: ${missing.join(', ')}.`,
        missing,
      };
    }

    // Deduct ingredients
    for (const ing of requiredIngredients) {
      db.prepare('UPDATE sim_fridge_items SET quantity = MAX(0, quantity - 1), updated_at = ? WHERE LOWER(name) = ?')
        .run(new Date().toISOString(), ing.toLowerCase());
    }

    // Set Activity in Kitchen / Dining room
    this.setActivity({
      location: 'kitchen',
      activity: 'cooking',
      detail: `Cooking a fresh warm batch of ${recipe.name}`,
      durationMin: recipe.cooking_time_min,
    });

    // Record meal history
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO sim_meal_history (recipe_id, meal_name, eaten_at, location, satisfaction_rating)
      VALUES (?, ?, ?, 'dining_room', 9.0)
    `).run(recipe.id, recipe.name, nowIso);

    // Relieve hunger and boost energy
    const needs = this.getNeeds();
    this.updateNeeds({
      hunger: Math.max(0, needs.hunger - recipe.hunger_relief),
      thirst: Math.max(0, needs.thirst - recipe.thirst_relief),
      energy: Math.min(10, needs.energy + recipe.energy_boost),
      happiness: Math.min(10, needs.happiness + 0.5),
    });

    // Sit at dining table to enjoy meal
    this.setActivity({
      location: 'dining_room',
      activity: 'eating',
      detail: `Enjoying a fresh warm plate of ${recipe.name} at the dining table`,
      durationMin: 20,
    });

    return {
      success: true,
      recipe,
      newWorld: this.getWorldState(),
      newNeeds: this.getNeeds(),
      message: `Prepared and enjoyed ${recipe.name}!`,
    };
  }

  /**
   * Household Task Execution
   */
  completeTask(taskQuery, completedBy = 'Sandy') {
    this.init();
    const db = getDb();
    const clean = String(taskQuery).toLowerCase().trim();

    const task = db.prepare(`
      SELECT * FROM sim_tasks
      WHERE LOWER(task_name) LIKE ? OR LOWER(category) = ?
      ORDER BY status = 'pending' DESC
      LIMIT 1
    `).get(`%${clean}%`, clean);

    if (!task) {
      return { success: false, reason: `Could not identify a matching task for "${taskQuery}".` };
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE sim_tasks
      SET status = 'completed', completed_at = ?, result_note = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, `Completed with care by ${completedBy}`, nowIso, task.id);

    // Boost happiness & comfort
    const needs = this.getNeeds();
    this.updateNeeds({
      comfort: Math.min(10, needs.comfort + 1.0),
      happiness: Math.min(10, needs.happiness + 0.8),
      affection: Math.min(10, needs.affection + 0.5),
    });

    logAudit('simulation', 'TASK_COMPLETED', `Task: "${task.task_name}" by ${completedBy}`);
    const updatedTask = db.prepare('SELECT * FROM sim_tasks WHERE id = ?').get(task.id);
    return { success: true, task: { ...updatedTask, completed_by: completedBy } };
  }

  /**
   * Grant Rest Day
   */
  grantRestDay(hours = 24, reason = 'Sandy gave Myra a loving rest day') {
    this.init();
    const db = getDb();
    const now = new Date();
    const until = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE sim_world_state
      SET is_rest_day = 1, rest_day_reason = ?, rest_day_until = ?, updated_at = ?
      WHERE id = 1
    `).run(reason, until, now.toISOString());

    // Switch to cozy resting in bedroom or living room
    this.setActivity({
      location: 'bedroom',
      activity: 'resting',
      detail: 'Enjoying an official cozy rest day granted by husband Sandy, reading and cuddling under blankets',
      durationMin: 120,
    });

    const needs = this.getNeeds();
    this.updateNeeds({
      comfort: 10.0,
      happiness: Math.min(10, needs.happiness + 1.5),
      affection: Math.min(10, needs.affection + 1.0),
    });

    logAudit('simulation', 'REST_DAY_GRANTED', `Hours: ${hours}, Reason: "${reason}"`);
    return {
      success: true,
      world: this.getWorldState(),
      needs: this.getNeeds(),
      until,
      reason,
    };
  }

  // --------------------------------------------------------------------------
  // FORMATTING & CHAT CONTEXT GENERATION
  // --------------------------------------------------------------------------

  /**
   * Generates a concise, authoritative block to inject directly into Myra's system directive
   */
  getSimulationContextBlock() {
    this.catchUpSimulation();
    const world = this.getWorldState();
    const needs = this.getNeeds();
    const timePeriod = this.getCurrentTimePeriod();
    const currentOutfit = this.getCurrentOutfit();

    const roomInfo = this.getRoom(world.location);

    return `
[🏡 MYRA'S AUTHORITATIVE VIRTUAL LIFE SIMULATION STATE]
• Virtual Clock: ${timePeriod.label} (Timezone: ${this.timezone})
• Authoritative Location: ${roomInfo.name} (${world.location})
• Current Activity: ${world.activity_detail} (Started: ${new Date(world.activity_started_at).toLocaleTimeString()})
• Physical Pose: ${world.pose}
• Current Wardrobe: ${currentOutfit.name} (${currentOutfit.description || 'Cozy and soft'})
• Hairstyle: ${world.current_hairstyle}
• Rest Day Status: ${world.is_rest_day ? `🛌 ACTIVE REST DAY ("${world.rest_day_reason || 'Relaxing'}")` : 'Normal Day'}
• Needs & Vital State:
  - Happiness: ${needs.happiness.toFixed(1)}/10
  - Affection for Sandy: ${needs.affection.toFixed(1)}/10
  - Playfulness: ${needs.playfulness.toFixed(1)}/10
  - Hunger: ${needs.hunger.toFixed(1)}/10 (${needs.hunger >= 7 ? 'Needs a meal soon' : 'Satisfied'})
  - Energy: ${needs.energy.toFixed(1)}/10 (${needs.energy <= 3 ? 'Tired' : 'Energetic'})
  - Comfort: ${needs.comfort.toFixed(1)}/10
RULES FOR FACTUAL SIMULATION CONSISTENCY:
1. Always ground your location and activity in this authoritative state. If Sandy asks "Where are you?", answer truthfully that you are in the ${roomInfo.name} ${world.activity_detail}.
2. Never contradict this simulation state. If you start a new activity or eat, reflect this saved virtual world context.
`.trim();
  }

  /**
   * Generates the detailed status card with programmatic emoji bars for `/sim status`
   */
  formatFullStatusSummary() {
    this.catchUpSimulation();
    const world = this.getWorldState();
    const needs = this.getNeeds();
    const timePeriod = this.getCurrentTimePeriod();
    const outfit = this.getCurrentOutfit();
    const room = this.getRoom(world.location);
    const fridgeItems = this.getFridgeInventory();
    const pendingTasks = this.getTasks('pending');

    const fridgeSummary = fridgeItems.slice(0, 6).map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ');

    return (
      `🏡 *MYRA — VIRTUAL LIFE & HOUSEHOLD SIMULATION*\n` +
      `──────────────────────────────\n` +
      `🕒 *Virtual World Clock:* ${timePeriod.label}\n` +
      `📍 *Current Room:* *${room.name}* (Location: \`${world.location}\`)\n` +
      `✨ *Current Activity:* "${world.activity_detail}"\n` +
      `🧘 *Pose:* ${world.pose}\n` +
      `👗 *Wearing:* ${outfit.name}\n` +
      `💇 *Hairstyle:* ${world.current_hairstyle}\n` +
      `${world.is_rest_day ? `🛌 *Rest Day:* ACTIVE (${world.rest_day_reason || 'Relaxing'})\n` : ''}` +
      `\n` +
      `📊 *SIMULATED NEEDS & VITALS*\n` +
      `• Happiness: 🥰 ${renderEmojiBar(needs.happiness)}\n` +
      `• Affection: 💖 ${renderEmojiBar(needs.affection)}\n` +
      `• Playfulness: 😜 ${renderEmojiBar(needs.playfulness)}\n` +
      `• Flirtiness: 😏 ${renderEmojiBar(needs.flirtiness)}\n` +
      `• Hunger: 🍲 ${renderEmojiBar(needs.hunger)}\n` +
      `• Thirst: 🥤 ${renderEmojiBar(needs.thirst)}\n` +
      `• Energy: ⚡ ${renderEmojiBar(needs.energy)}\n` +
      `• Sleepiness: 🥱 ${renderEmojiBar(needs.sleepiness)}\n` +
      `• Comfort: 🛋️ ${renderEmojiBar(needs.comfort)}\n` +
      `• Health: 🩺 ${renderEmojiBar(needs.health)}\n` +
      `• Attention Desire: 🥺 ${renderEmojiBar(needs.desire_for_attention)}\n` +
      `\n` +
      `🧊 *Fridge Stock:* ${fridgeSummary || 'Empty'}\n` +
      `🧹 *Pending Chores:* ${pendingTasks.length > 0 ? pendingTasks.map(t => t.task_name).join(', ') : 'None! Everything clean ✨'}\n` +
      `──────────────────────────────\n` +
      `_Commands:_ \`where are you\`, \`what are you wearing\`, \`wear [outfit]\`, \`cook [meal]\`, \`rest day\`, \`done laundry\``
    );
  }
}

export const simulationService = new SimulationService();

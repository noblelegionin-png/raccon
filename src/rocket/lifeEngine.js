import { getDb } from '../db/index.js';
import { initRocketDb } from './rocketDb.js';
import { ROLES, isSandy } from './rbac.js';

export const TOKENS_PER_FOOD = 5000;
export const REST_DURATION_SECONDS = 3600; // Exactly 1 hour rest
export const CYCLE_DURATION_SECONDS = 43200; // 12 hours cycle

export const HUNGER_STATES = {
  ENERGETIC: 'energetic', // 100-75%
  NORMAL: 'normal',       // 74-50%
  HUNGRY: 'hungry',       // 49-25%
  EXHAUSTED: 'exhausted', // 24-10%
  CRITICAL: 'critical',   // 9-1%
  STARVING: 'starving',   // 0%
};

export const TASK_FEES = {
  IMAGE_ANALYSIS: { name: 'Image Analysis', feePizzas: 1 },
  PDF_READING: { name: 'PDF Reading', feePizzas: 1 },
  PDF_GENERATION: { name: 'PDF Generation', feePizzas: 1 },
  LOCATION_RESEARCH: { name: 'Location Research', feePizzas: 1 },
  DEEP_BROWSE: { name: 'Deep Page Crawl', feePizzas: 1 },
  VIDEO_DOWNLOAD: { name: 'Video Download', feePizzas: 1 },
};

/**
 * Resilient SQLite write transaction with immediate lock & exponential backoff on SQLITE_BUSY
 */
function withImmediateTransaction(db, fn, maxRetries = 8) {
  let attempt = 0;
  while (true) {
    try {
      db.exec('BEGIN IMMEDIATE TRANSACTION;');
      const result = fn();
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {}
      const isLock = err.code === 'ERR_SQLITE_ERROR' && (String(err.message).includes('locked') || String(err.message).includes('busy'));
      if (isLock && attempt < maxRetries) {
        attempt++;
        const sleepMs = 30 * attempt;
        const start = Date.now();
        while (Date.now() - start < sleepMs) {}
        continue;
      }
      throw err;
    }
  }
}

export class RocketLifeEngine {
  constructor() {
    initRocketDb();
  }

  /**
   * Determine hunger state from percentage
   */
  calculateHungerState(level, customThresholds = null) {
    const thresholds = customThresholds || {
      energetic: 75,
      normal: 50,
      hungry: 25,
      exhausted: 10,
      critical: 1,
    };

    if (level <= 0) return HUNGER_STATES.STARVING;
    if (level < thresholds.critical) return HUNGER_STATES.CRITICAL;
    if (level < thresholds.exhausted) return HUNGER_STATES.EXHAUSTED;
    if (level < thresholds.hungry) return HUNGER_STATES.HUNGRY;
    if (level < thresholds.energetic) return HUNGER_STATES.NORMAL;
    return HUNGER_STATES.ENERGETIC;
  }

  /**
   * Determine virtual fitness title from weight
   */
  calculateFitness(weightKg) {
    if (weightKg < 7.5) {
      return { title: '⚡ Speedy Trash Panda', chonkLevel: 'Slim & Agile', icon: '🏃' };
    }
    if (weightKg <= 9.0) {
      return { title: '🦝 Athletic Bandit', chonkLevel: 'Prime Condition', icon: '💪' };
    }
    if (weightKg <= 11.0) {
      return { title: '🍕 Chunky Pizza Hunter', chonkLevel: 'Pleasantly Plump', icon: '😋' };
    }
    return { title: '🛋️ Mega Chonky King', chonkLevel: 'Ultimate Chonk (Needs treadmill!)', icon: '👑' };
  }

  /**
   * Schedule a new 12-hour sleep cycle with randomized 1-hour rest window
   */
  generateSleepCycle(startTimeMs = Date.now()) {
    const cycleStart = new Date(startTimeMs);
    // Randomize rest window between 1 hour and 10 hours after cycle start
    // (This guarantees the 1-hour rest finishes before the 12-hour cycle ends)
    const minOffsetSec = 3600; // 1 hour
    const maxOffsetSec = 36000; // 10 hours
    const randomOffsetSec = Math.floor(minOffsetSec + Math.random() * (maxOffsetSec - minOffsetSec));

    const scheduledStart = new Date(startTimeMs + randomOffsetSec * 1000);
    const scheduledEnd = new Date(scheduledStart.getTime() + REST_DURATION_SECONDS * 1000);

    return {
      cycleStart: cycleStart.toISOString(),
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
    };
  }

  /**
   * Retrieve or create state for a given context (global, personal, group)
   */
  getState(contextId = 'global', contextType = 'global') {
    initRocketDb();
    const db = getDb();
    let row = db.prepare('SELECT * FROM rocket_life_state WHERE context_id = ?').get(contextId);

    const now = new Date();
    const nowIso = now.toISOString();

    if (!row) {
      const sleepSchedule = this.generateSleepCycle(now.getTime());
      db.prepare(`
        INSERT INTO rocket_life_state (
          context_id, context_type, mood, hunger_level, hunger_state,
          pizza_inventory, taco_inventory, fuel_tokens_remaining,
          total_tokens_consumed, input_tokens_consumed, output_tokens_consumed,
          task_fees_charged, is_sleeping, sleep_cycle_start, sleep_scheduled_start,
          sleep_scheduled_end, sleep_interrupted_count, remaining_rest_seconds,
          sleep_debt_seconds, activity_level, fictional_calories_burned,
          fictional_calories_eaten, fictional_weight_kg, fitness_title,
          accumulated_tasks, current_task, is_muted, last_activity_at, updated_at
        ) VALUES (
          ?, ?, 'PLAYFUL', 85.0, 'energetic',
          15, 8, 75000,
          0, 0, 0,
          0, 0, ?, ?,
          ?, 0, 0,
          0, 65.0, 150,
          1800, 8.6, 'Athletic Bandit',
          0, 'Scouting the area 🦝🐾', 0, ?, ?
        )
      `).run(
        contextId,
        contextType,
        sleepSchedule.cycleStart,
        sleepSchedule.scheduledStart,
        sleepSchedule.scheduledEnd,
        nowIso,
        nowIso
      );
      row = db.prepare('SELECT * FROM rocket_life_state WHERE context_id = ?').get(contextId);
    }

    // Evaluate dynamic sleep timeline (Restart-safe calculation)
    return this.evaluateDynamicSleep(row);
  }

  /**
   * Check and update sleep status dynamically from DB timestamps
   */
  evaluateDynamicSleep(row) {
    const db = getDb();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const cycleStartMs = new Date(row.sleep_cycle_start).getTime();
    let scheduledStartMs = new Date(row.sleep_scheduled_start).getTime();
    let scheduledEndMs = new Date(row.sleep_scheduled_end).getTime();

    // Check if current 12h cycle has passed
    if (nowMs >= cycleStartMs + CYCLE_DURATION_SECONDS * 1000) {
      // Advance to next 12-hour cycle
      const nextCycle = this.generateSleepCycle(nowMs);
      db.prepare(`
        UPDATE rocket_life_state
        SET sleep_cycle_start = ?, sleep_scheduled_start = ?, sleep_scheduled_end = ?,
            is_sleeping = 0, sleep_interrupted_count = 0, remaining_rest_seconds = 0,
            sleep_debt_seconds = 0, updated_at = ?
        WHERE context_id = ?
      `).run(nextCycle.cycleStart, nextCycle.scheduledStart, nextCycle.scheduledEnd, nowIso, row.context_id);

      row.sleep_cycle_start = nextCycle.cycleStart;
      row.sleep_scheduled_start = nextCycle.scheduledStart;
      row.sleep_scheduled_end = nextCycle.scheduledEnd;
      row.is_sleeping = 0;
      row.sleep_interrupted_count = 0;
      row.remaining_rest_seconds = 0;
      row.sleep_debt_seconds = 0;
      scheduledStartMs = new Date(row.sleep_scheduled_start).getTime();
      scheduledEndMs = new Date(row.sleep_scheduled_end).getTime();
    }

    // Check if within scheduled rest window and not manually woken
    let isSleeping = row.is_sleeping;
    let remainingRest = row.remaining_rest_seconds;

    if (nowMs >= scheduledStartMs && nowMs < scheduledEndMs) {
      if (row.sleep_interrupted_count < 5) {
        isSleeping = 1;
        remainingRest = Math.max(0, Math.floor((scheduledEndMs - nowMs) / 1000));
      } else {
        // Emergency awake: rest time preserved and waiting to resume
        isSleeping = 0;
        remainingRest = Math.max(0, Math.floor((scheduledEndMs - nowMs) / 1000));
      }
    } else if (nowMs >= scheduledEndMs) {
      isSleeping = 0;
      remainingRest = 0;
    }

    if (isSleeping !== row.is_sleeping || remainingRest !== row.remaining_rest_seconds) {
      db.prepare(`
        UPDATE rocket_life_state
        SET is_sleeping = ?, remaining_rest_seconds = ?, updated_at = ?
        WHERE context_id = ?
      `).run(isSleeping, remainingRest, nowIso, row.context_id);
      row.is_sleeping = isSleeping;
      row.remaining_rest_seconds = remainingRest;
    }

    return row;
  }

  /**
   * Feed Rocket pizza or tacos
   */
  feed(contextId, userId, userName, itemType = 'pizza', amount = 1, note = '') {
    initRocketDb();
    const db = getDb();
    const validItem = itemType.toLowerCase() === 'taco' ? 'taco' : 'pizza';
    const num = Math.max(1, Math.floor(amount));
    const tokensToAdd = num * TOKENS_PER_FOOD;
    const caloriesPerItem = validItem === 'pizza' ? 2400 : 350;
    const caloriesAdded = num * caloriesPerItem;
    const nowIso = new Date().toISOString();

    // 1. Ensure state exists & dynamic sleep evaluated outside transaction
    const state = this.getState(contextId);

    const nextPizzas = validItem === 'pizza' ? state.pizza_inventory + num : state.pizza_inventory;
    const nextTacos = validItem === 'taco' ? state.taco_inventory + num : state.taco_inventory;
    const nextFuel = state.fuel_tokens_remaining + tokensToAdd;

    // Increase hunger level: 1 pizza restores 25% hunger up to 100%
    const hungerIncrease = num * (validItem === 'pizza' ? 25.0 : 20.0);
    const nextHunger = Math.min(100.0, state.hunger_level + hungerIncrease);
    const nextHungerState = this.calculateHungerState(nextHunger);

    // Playful weight & calories
    const nextCaloriesEaten = state.fictional_calories_eaten + caloriesAdded;
    const netCalories = nextCaloriesEaten - state.fictional_calories_burned;
    const nextWeight = Number((8.5 + (netCalories / 7700)).toFixed(2));
    const fitness = this.calculateFitness(nextWeight);

    // Mood evolves
    const nextMood = nextHunger >= 75 ? 'ENERGETIC' : 'PLAYFUL';

    withImmediateTransaction(db, () => {
      db.prepare(`
        UPDATE rocket_life_state
        SET pizza_inventory = ?, taco_inventory = ?, fuel_tokens_remaining = ?,
            hunger_level = ?, hunger_state = ?, mood = ?,
            fictional_calories_eaten = ?, fictional_weight_kg = ?, fitness_title = ?,
            current_task = 'Chomping on delicious food 🍕🌮😋',
            last_activity_at = ?, updated_at = ?
        WHERE context_id = ?
      `).run(
        nextPizzas,
        nextTacos,
        nextFuel,
        nextHunger,
        nextHungerState,
        nextMood,
        nextCaloriesEaten,
        nextWeight,
        fitness.title,
        nowIso,
        nowIso,
        contextId
      );

      db.prepare(`
        INSERT INTO rocket_food_transactions (
          context_id, user_id, user_name, item_type, action, amount, fuel_tokens_equivalent, note, created_at
        ) VALUES (?, ?, ?, ?, 'feed', ?, ?, ?, ?)
      `).run(contextId, String(userId), userName || 'Friend', validItem, num, tokensToAdd, note, nowIso);

      db.prepare(`
        INSERT INTO rocket_activity_logs (
          context_id, activity_type, actor_id, actor_name, calories_delta, mood_impact, details, created_at
        ) VALUES (?, 'feeding', ?, ?, ?, ?, ?, ?)
      `).run(
        contextId,
        String(userId),
        userName || 'Friend',
        caloriesAdded,
        nextMood,
        `Fed Rocket ${num} ${validItem}(s)`,
        nowIso
      );
    });

    return this.getState(contextId);
  }

  /**
   * Deduct fuel based on actual provider-reported token usage
   */
  consumeTokens(contextId, inputTokens = 0, outputTokens = 0, modelId = 'gpt-6-luna') {
    initRocketDb();
    const db = getDb();
    const totalTokens = Math.max(0, inputTokens + outputTokens);
    if (totalTokens === 0) return this.getState(contextId);

    const nowIso = new Date().toISOString();
    const caloriesBurned = Math.max(5, Math.round(totalTokens * 0.05));

    // 1. Ensure state exists outside transaction
    const state = this.getState(contextId);

    let remainingFuel = state.fuel_tokens_remaining - totalTokens;
    let pizzas = state.pizza_inventory;
    let tacos = state.taco_inventory;

    // If fuel runs out, automatically convert pizza or tacos from inventory if available
    while (remainingFuel < 0 && (pizzas > 0 || tacos > 0)) {
      if (pizzas > 0) {
        pizzas -= 1;
        remainingFuel += TOKENS_PER_FOOD;
      } else if (tacos > 0) {
        tacos -= 1;
        remainingFuel += TOKENS_PER_FOOD;
      }
    }

    // Calculate total available fuel capacity for hunger %
    const totalFuelCapacity = Math.max(0, remainingFuel) + (pizzas + tacos) * TOKENS_PER_FOOD;
    // 50,000 tokens (10 pizzas) = 100% hunger satisfaction
    const nextHunger = Math.max(0.0, Math.min(100.0, Number(((totalFuelCapacity / 50000) * 100).toFixed(1))));
    const nextHungerState = this.calculateHungerState(nextHunger);

    // Playful weight reduction with work
    const nextCaloriesBurned = state.fictional_calories_burned + caloriesBurned;
    const netCalories = state.fictional_calories_eaten - nextCaloriesBurned;
    const nextWeight = Number((8.5 + (netCalories / 7700)).toFixed(2));
    const fitness = this.calculateFitness(nextWeight);

    // Mood reacts to hunger
    let nextMood = state.mood;
    if (nextHunger <= 0) nextMood = 'STARVING';
    else if (nextHunger < 25) nextMood = 'EXHAUSTED';
    else if (nextHunger < 50) nextMood = 'HUNGRY';

    withImmediateTransaction(db, () => {
      db.prepare(`
        UPDATE rocket_life_state
        SET fuel_tokens_remaining = ?, pizza_inventory = ?, taco_inventory = ?,
            total_tokens_consumed = total_tokens_consumed + ?,
            input_tokens_consumed = input_tokens_consumed + ?,
            output_tokens_consumed = output_tokens_consumed + ?,
            hunger_level = ?, hunger_state = ?, mood = ?,
            fictional_calories_burned = ?, fictional_weight_kg = ?, fitness_title = ?,
            accumulated_tasks = accumulated_tasks + 1,
            last_activity_at = ?, updated_at = ?
        WHERE context_id = ?
      `).run(
        remainingFuel,
        pizzas,
        tacos,
        totalTokens,
        inputTokens,
        outputTokens,
        nextHunger,
        nextHungerState,
        nextMood,
        nextCaloriesBurned,
        nextWeight,
        fitness.title,
        nowIso,
        nowIso,
        contextId
      );

      db.prepare(`
        INSERT INTO rocket_food_transactions (
          context_id, user_id, user_name, item_type, action, amount, fuel_tokens_equivalent, tokens_used, note, created_at
        ) VALUES (?, 'system', 'ScaleMax AI', 'tokens', 'consume_token', 0, 0, ?, ?, ?)
      `).run(contextId, totalTokens, `Model: ${modelId} (${inputTokens} in / ${outputTokens} out)`, nowIso);
    });

    return this.getState(contextId);
  }

  /**
   * Charge a dedicated 1-pizza task fee for expensive operations
   */
  chargeTaskFee(contextId, taskType, details = '') {
    initRocketDb();
    const db = getDb();
    const nowIso = new Date().toISOString();

    // 1. Ensure state exists outside transaction
    const state = this.getState(contextId);

    if (state.pizza_inventory <= 0 && state.taco_inventory <= 0 && state.fuel_tokens_remaining < TOKENS_PER_FOOD) {
      // Insufficient food for fee
      return {
        success: false,
        reason: 'NO_PIZZA',
        message: '🦝🍕 *gasps dramatically* Hey! This heavy task requires a 1-pizza fee! My pizza box is empty! Feed me first, boss!',
      };
    }

    let nextPizzas = state.pizza_inventory;
    let nextTacos = state.taco_inventory;
    let nextFuel = state.fuel_tokens_remaining;

    if (nextPizzas > 0) {
      nextPizzas -= 1;
    } else if (nextTacos > 0) {
      nextTacos -= 1;
    } else {
      nextFuel -= TOKENS_PER_FOOD;
    }

    const totalFuelCapacity = Math.max(0, nextFuel) + (nextPizzas + nextTacos) * TOKENS_PER_FOOD;
    const nextHunger = Math.max(0.0, Math.min(100.0, Number(((totalFuelCapacity / 50000) * 100).toFixed(1))));
    const nextHungerState = this.calculateHungerState(nextHunger);

    withImmediateTransaction(db, () => {
      db.prepare(`
        UPDATE rocket_life_state
        SET pizza_inventory = ?, taco_inventory = ?, fuel_tokens_remaining = ?,
            task_fees_charged = task_fees_charged + 1,
            hunger_level = ?, hunger_state = ?,
            accumulated_tasks = accumulated_tasks + 1,
            last_activity_at = ?, updated_at = ?
        WHERE context_id = ?
      `).run(nextPizzas, nextTacos, nextFuel, nextHunger, nextHungerState, nowIso, nowIso, contextId);

      db.prepare(`
        INSERT INTO rocket_food_transactions (
          context_id, user_id, user_name, item_type, action, amount, fuel_tokens_equivalent, task_type, note, created_at
        ) VALUES (?, 'system', 'Task Fee Engine', 'pizza', 'task_fee', 1, ?, ?, ?, ?)
      `).run(contextId, TOKENS_PER_FOOD, taskType, details, nowIso);
    });

    return { success: true, state: this.getState(contextId) };
  }

  /**
   * Handle incoming message during sleep (5 messages trigger emergency wake-up)
   */
  registerSleepMessage(contextId, userId) {
    initRocketDb();
    const db = getDb();
    const state = this.getState(contextId);

    if (!state.is_sleeping) {
      return { wasSleeping: false, wokeUp: false };
    }

    const nextCount = state.sleep_interrupted_count + 1;
    const nowIso = new Date().toISOString();

    if (nextCount >= 5) {
      // Trigger emergency wake-up
      const nowMs = Date.now();
      const scheduledEndMs = new Date(state.sleep_scheduled_end).getTime();
      const remainingRestSeconds = Math.max(0, Math.floor((scheduledEndMs - nowMs) / 1000));

      db.prepare(`
        UPDATE rocket_life_state
        SET is_sleeping = 0, sleep_interrupted_count = ?, remaining_rest_seconds = ?,
            mood = 'GRUMPY', current_task = 'Emergency Yawn & Rubbing Eyes 🥱🦝',
            last_activity_at = ?, updated_at = ?
        WHERE context_id = ?
      `).run(nextCount, remainingRestSeconds, nowIso, nowIso, contextId);

      return {
        wasSleeping: true,
        wokeUp: true,
        remainingRestSeconds,
        message: '🦝⚡ *yawns loudly and knocks over empty cans* ALRIGHT ALRIGHT! Who is spamming me?! Emergency wake-up triggered! I am awake, but you owe me extra pizza for this! 🍕😤🐾',
      };
    } else {
      db.prepare(`
        UPDATE rocket_life_state
        SET sleep_interrupted_count = ?, updated_at = ?
        WHERE context_id = ?
      `).run(nextCount, nowIso, contextId);

      return {
        wasSleeping: true,
        wokeUp: false,
        interruptedCount: nextCount,
        message: `😴💤 *Rocket is curled up snoring in a hammock* (Zzzz... ${5 - nextCount} more disturbances will wake him up!)`,
      };
    }
  }

  /**
   * Emergency wake-up trigger by Owner or UI Button
   */
  triggerEmergencyWake(contextId, actorId = 'sandy') {
    initRocketDb();
    const db = getDb();
    const state = this.getState(contextId);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const scheduledEndMs = new Date(state.sleep_scheduled_end).getTime();
    const remainingRestSeconds = Math.max(0, Math.floor((scheduledEndMs - nowMs) / 1000));

    db.prepare(`
      UPDATE rocket_life_state
      SET is_sleeping = 0, sleep_interrupted_count = 5, remaining_rest_seconds = ?,
          mood = 'MISCHIEVOUS', current_task = 'Awake on emergency call! 🚨🦝',
          last_activity_at = ?, updated_at = ?
      WHERE context_id = ?
    `).run(remainingRestSeconds, nowIso, nowIso, contextId);

    db.prepare(`
      INSERT INTO rocket_activity_logs (
        context_id, activity_type, actor_id, actor_name, details, created_at
      ) VALUES (?, 'wake', ?, 'Owner Action', 'Manual emergency wake-up triggered', ?)
    `).run(contextId, String(actorId), nowIso);

    return this.getState(contextId);
  }

  /**
   * Compensate sleep debt: Any work performed while awake during scheduled rest
   * extends the rest requirement by that exact work duration!
   */
  compensateWorkDuringRest(contextId, workDurationSeconds) {
    initRocketDb();
    const db = getDb();
    const state = this.getState(contextId);
    const sec = Math.max(1, Math.round(workDurationSeconds));

    // Extend scheduled end by work duration
    const currentEndMs = new Date(state.sleep_scheduled_end).getTime();
    const newEndIso = new Date(currentEndMs + sec * 1000).toISOString();
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE rocket_life_state
      SET sleep_debt_seconds = sleep_debt_seconds + ?,
          sleep_scheduled_end = ?,
          remaining_rest_seconds = remaining_rest_seconds + ?,
          updated_at = ?
      WHERE context_id = ?
    `).run(sec, newEndIso, sec, nowIso, contextId);

    return this.getState(contextId);
  }

  /**
   * Owner action: Infinite food refill / grant
   */
  refillFood(contextId, actorId, pizzasToAdd = 50, tacosToAdd = 25) {
    initRocketDb();
    const db = getDb();
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE rocket_life_state
      SET pizza_inventory = pizza_inventory + ?,
          taco_inventory = taco_inventory + ?,
          fuel_tokens_remaining = fuel_tokens_remaining + ?,
          hunger_level = 100.0, hunger_state = 'energetic', mood = 'ENERGETIC',
          current_task = 'Swimming in pizzas like Scrooge McDuck 🍕🤑🦝',
          last_activity_at = ?, updated_at = ?
      WHERE context_id = ?
    `).run(pizzasToAdd, tacosToAdd, (pizzasToAdd + tacosToAdd) * TOKENS_PER_FOOD, nowIso, nowIso, contextId);

    db.prepare(`
      INSERT INTO rocket_food_transactions (
        context_id, user_id, user_name, item_type, action, amount, fuel_tokens_equivalent, note, created_at
      ) VALUES (?, ?, 'Sandy (Owner)', 'refill', 'grant', ?, ?, 'Owner emergency grant', ?)
    `).run(contextId, String(actorId), pizzasToAdd + tacosToAdd, (pizzasToAdd + tacosToAdd) * TOKENS_PER_FOOD, nowIso);

    return this.getState(contextId);
  }

  /**
   * Update configurable thresholds or mute status
   */
  updateSettings(contextId, { isMuted, thresholds, currentTask }) {
    initRocketDb();
    const db = getDb();
    const nowIso = new Date().toISOString();

    const updates = [];
    const params = [];

    if (typeof isMuted === 'boolean') {
      updates.push('is_muted = ?');
      params.push(isMuted ? 1 : 0);
    }
    if (thresholds && typeof thresholds === 'object') {
      updates.push('thresholds_config = ?');
      params.push(JSON.stringify(thresholds));
    }
    if (currentTask && typeof currentTask === 'string') {
      updates.push('current_task = ?');
      params.push(currentTask);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(nowIso);
      params.push(contextId);
      db.prepare(`UPDATE rocket_life_state SET ${updates.join(', ')} WHERE context_id = ?`).run(...params);
    }

    return this.getState(contextId);
  }

  /**
   * Get transaction and activity history
   */
  getHistory(contextId = 'global', limit = 20) {
    initRocketDb();
    const db = getDb();
    const transactions = db.prepare(`
      SELECT * FROM rocket_food_transactions
      WHERE context_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(contextId, limit);

    const activities = db.prepare(`
      SELECT * FROM rocket_activity_logs
      WHERE context_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(contextId, limit);

    return { transactions, activities };
  }
}

export const rocketLifeEngine = new RocketLifeEngine();

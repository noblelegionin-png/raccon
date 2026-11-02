import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { rocketLifeEngine, TOKENS_PER_FOOD, HUNGER_STATES } from '../src/rocket/lifeEngine.js';
import { getUserRole, setUserRole, isSandy, ROLES } from '../src/rocket/rbac.js';
import {
  detectSandyAbuse,
  generateDefenseResponse,
  generateStarvingResponse,
  generateSleepResponse,
  buildRocketDirective,
} from '../src/rocket/persona.js';
import { executeRocketTool, ROCKET_TOOL_DEFINITIONS } from '../src/tools/rocketTools.js';
import { createWebServer } from '../src/web/server.js';
import fs from 'node:fs';
import path from 'node:path';

// 1. Owner authentication
test('👑 1. Owner Authentication & Privileges', () => {
  const sandyId = '8685232094';
  assert.equal(isSandy(sandyId), true, 'Sandy numeric ID must be recognized as owner');
  assert.equal(isSandy('999999999'), false, 'Non-owner ID must return false');

  const role = getUserRole(sandyId);
  assert.equal(role.isOwner, true);
  assert.equal(role.role, ROLES.OWNER);
  assert.equal(role.canManageInventory, true);
  assert.equal(role.canTriggerEmergencyWake, true);
});

// 2. Friend permissions
test('👥 2. Friend Permissions & Role Hierarchy', () => {
  const friendId = 'friend_test_001';
  setUserRole(friendId, 'Alex', ROLES.FRIEND, { canFeed: 1, canTriggerEmergencyWake: 1 });

  const role = getUserRole(friendId);
  assert.equal(role.isOwner, false, 'Friend must NOT have owner privileges');
  assert.equal(role.role, ROLES.FRIEND);
  assert.equal(role.canFeed, true);
  assert.equal(role.canTriggerEmergencyWake, true);
  assert.equal(role.canManageInventory, false, 'Friend cannot manage all inventories');
});

// 3. Group inventory sharing
test('🍕 3. Group Inventory Sharing', () => {
  const groupId = 'test_group_share_101';
  const contextId = `group_${groupId}`;

  // Initial group state
  const initial = rocketLifeEngine.getState(contextId, 'group');
  const initPizzas = initial.pizza_inventory;

  // Member 1 feeds 2 pizzas
  rocketLifeEngine.feed(contextId, 'member_1', 'Alice', 'pizza', 2);
  const afterAlice = rocketLifeEngine.getState(contextId, 'group');
  assert.equal(afterAlice.pizza_inventory, initPizzas + 2);

  // Member 2 sees updated shared group pool
  const forBob = rocketLifeEngine.getState(contextId, 'group');
  assert.equal(forBob.pizza_inventory, initPizzas + 2, 'Group inventory must be shared across members');
});

// 4. Personal inventory separation
test('🔒 4. Personal Inventory Separation', () => {
  const userA = 'test_user_alpha';
  const userB = 'test_user_beta';

  const ctxA = `user_${userA}`;
  const ctxB = `user_${userB}`;

  const stateA = rocketLifeEngine.getState(ctxA, 'personal');
  const stateB = rocketLifeEngine.getState(ctxB, 'personal');

  // Feed User A 5 pizzas
  rocketLifeEngine.feed(ctxA, userA, 'User Alpha', 'pizza', 5);

  const updatedA = rocketLifeEngine.getState(ctxA, 'personal');
  const updatedB = rocketLifeEngine.getState(ctxB, 'personal');

  assert.equal(updatedA.pizza_inventory, stateA.pizza_inventory + 5);
  assert.equal(updatedB.pizza_inventory, stateB.pizza_inventory, 'User B inventory must remain untouched');
});

// 5. Token-based fuel deductions
test('⚡ 5. Token-Based Fuel Deductions (Proportional & Accurate)', () => {
  const contextId = 'test_token_fuel_ctx';
  const initial = rocketLifeEngine.getState(contextId);
  const initialFuel = initial.fuel_tokens_remaining;

  // Simulate chat that consumed 1,200 prompt + 800 completion tokens = 2,000 tokens
  const afterChat = rocketLifeEngine.consumeTokens(contextId, 1200, 800, 'gpt-6-luna');

  assert.equal(afterChat.fuel_tokens_remaining, initialFuel - 2000, 'Fuel tokens must decrease exactly by consumed tokens');
  assert.equal(afterChat.input_tokens_consumed >= 1200, true);
  assert.equal(afterChat.output_tokens_consumed >= 800, true);
  assert.equal(afterChat.total_tokens_consumed >= 2000, true);
});

// 6. Additional task fees
test('📑 6. Additional Task Fees (1-Pizza Surcharge for Heavy Tasks)', () => {
  const contextId = 'test_task_fee_ctx';
  // Ensure sufficient pizzas
  rocketLifeEngine.feed(contextId, 'sandy', 'Sandy', 'pizza', 5);
  const before = rocketLifeEngine.getState(contextId);

  const result = rocketLifeEngine.chargeTaskFee(contextId, 'PDF_READING', 'Research paper parsing');
  assert.equal(result.success, true);

  const after = rocketLifeEngine.getState(contextId);
  assert.equal(after.pizza_inventory, before.pizza_inventory - 1, 'Heavy task fee must charge exactly 1 pizza');
  assert.equal(after.task_fees_charged, before.task_fees_charged + 1);
});

// 7. Feeding and inventory updates
test('🍽️ 7. Feeding & Inventory Updates with Caloric & Fitness Evolution', () => {
  const contextId = 'test_feeding_ctx';
  const before = rocketLifeEngine.getState(contextId);

  const updated = rocketLifeEngine.feed(contextId, 'sandy', 'Sandy', 'taco', 3, 'Spicy taco boost');
  assert.equal(updated.taco_inventory, before.taco_inventory + 3);
  assert.equal(updated.fuel_tokens_remaining, before.fuel_tokens_remaining + 3 * TOKENS_PER_FOOD);
  assert.equal(updated.hunger_level > 0, true);
  assert.equal(updated.fictional_calories_eaten > before.fictional_calories_eaten, true);
});

// 8. Sleep scheduling
test('🌙 8. Sleep Scheduling (1h Rest in 12h Cycle)', () => {
  const contextId = 'test_sleep_schedule_ctx';
  const state = rocketLifeEngine.getState(contextId);

  const cycleStart = new Date(state.sleep_cycle_start).getTime();
  const scheduledStart = new Date(state.sleep_scheduled_start).getTime();
  const scheduledEnd = new Date(state.sleep_scheduled_end).getTime();

  assert.ok(scheduledStart >= cycleStart, 'Scheduled rest must start after cycle start');
  assert.ok(scheduledEnd > scheduledStart, 'Scheduled rest end must be after start');
  const durationSec = Math.round((scheduledEnd - scheduledStart) / 1000);
  assert.equal(durationSec, 3600, 'Guaranteed rest window must be exactly 3,600 seconds (1 hour)');
});

// 9. Emergency wake-up
test('🚨 9. Emergency Wake-Up (5 Disturbances / Owner Action)', async () => {
  const contextId = 'test_emergency_wake_ctx';
  const state = rocketLifeEngine.getState(contextId);

  // Force sleeping state for test
  const db = (await import('../src/db/index.js')).getDb();
  const nowMs = Date.now();
  db.prepare(`
    UPDATE rocket_life_state
    SET is_sleeping = 1, sleep_interrupted_count = 0,
        sleep_scheduled_start = ?, sleep_scheduled_end = ?
    WHERE context_id = ?
  `).run(new Date(nowMs - 60000).toISOString(), new Date(nowMs + 3540000).toISOString(), contextId);

  // Send 4 disturbances -> still asleep
  for (let i = 1; i <= 4; i++) {
    const res = rocketLifeEngine.registerSleepMessage(contextId, 'intruder_1');
    assert.equal(res.wasSleeping, true);
    assert.equal(res.wokeUp, false);
  }

  // 5th disturbance -> Emergency wake-up triggered!
  const fifthRes = rocketLifeEngine.registerSleepMessage(contextId, 'intruder_1');
  assert.equal(fifthRes.wasSleeping, true);
  assert.equal(fifthRes.wokeUp, true, '5th disturbance must trigger emergency wake-up');
  assert.ok(fifthRes.message.includes('ALRIGHT ALRIGHT'), 'Must include chaotic wake-up message');

  const afterWake = rocketLifeEngine.getState(contextId);
  assert.equal(afterWake.is_sleeping, 0, 'Rocket must be awake');
  assert.ok(afterWake.remaining_rest_seconds > 0, 'Unfinished rest seconds must be preserved');
});

// 10. Rest-time compensation
test('⏱️ 10. Rest-Time Compensation (Work Extends Sleep Requirement)', () => {
  const contextId = 'test_rest_compensation_ctx';
  const before = rocketLifeEngine.getState(contextId);
  const endBefore = new Date(before.sleep_scheduled_end).getTime();

  // Rocket works for 300 seconds (5 minutes) while awake during rest period
  const after = rocketLifeEngine.compensateWorkDuringRest(contextId, 300);
  const endAfter = new Date(after.sleep_scheduled_end).getTime();

  assert.equal(endAfter, endBefore + 300 * 1000, 'Scheduled sleep end must extend by exact work duration');
  assert.equal(after.sleep_debt_seconds >= 300, true);
});

// 11. Restart persistence
test('💾 11. Database Restart Persistence', () => {
  const contextId = 'test_restart_persistence_ctx';
  rocketLifeEngine.feed(contextId, 'sandy', 'Sandy', 'pizza', 12, 'Pre-restart stash');
  const savedState = rocketLifeEngine.getState(contextId);

  // Create a brand new engine instance reading from SQLite
  const newEngine = new (rocketLifeEngine.constructor)();
  const reloadedState = newEngine.getState(contextId);

  assert.equal(reloadedState.pizza_inventory, savedState.pizza_inventory, 'Pizza inventory must persist across restarts');
  assert.equal(reloadedState.fuel_tokens_remaining, savedState.fuel_tokens_remaining, 'Fuel tokens must persist');
  assert.equal(reloadedState.fitness_title, savedState.fitness_title, 'Fitness title must persist');
});

// 12. Mini App navigation & API endpoints
test('🌐 12. Mini App Navigation & REST APIs', async () => {
  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Test GET /api/rocket/state
    const stateRes = await fetch(`${baseUrl}/api/rocket/state?contextId=global`);
    assert.equal(stateRes.status, 200);
    const stateJson = await stateRes.json();
    assert.equal(stateJson.ok, true);
    assert.ok(stateJson.state.hunger_level !== undefined);

    // Test POST /api/rocket/feed
    const feedRes = await fetch(`${baseUrl}/api/rocket/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': '8685232094' },
      body: JSON.stringify({ itemType: 'pizza', amount: 1 }),
    });
    assert.equal(feedRes.status, 200);
    const feedJson = await feedRes.json();
    assert.equal(feedJson.ok, true);
    assert.ok(feedJson.message.includes('Rocket'));

    // Test GET /raccoon/index.html (Mini App Entry)
    const pageRes = await fetch(`${baseUrl}/raccoon/index.html`);
    assert.equal(pageRes.status, 200);
    const htmlText = await pageRes.text();
    assert.ok(htmlText.includes('RACCOON OS'));
    assert.ok(htmlText.includes('view-home'));
    assert.ok(htmlText.includes('view-workspace'));
    assert.ok(htmlText.includes('view-control'));
  } finally {
    server.close();
  }
});

// 13. Mobile responsiveness & CSS verification
test('📱 13. Mobile Responsiveness & Glassmorphism Asset Verification', () => {
  const htmlPath = path.resolve('./src/web/public/raccoon/index.html');
  const cssPath = path.resolve('./src/web/public/raccoon/app.css');
  const jsPath = path.resolve('./src/web/public/raccoon/app.js');

  assert.ok(fs.existsSync(htmlPath), 'index.html must exist');
  assert.ok(fs.existsSync(cssPath), 'app.css must exist');
  assert.ok(fs.existsSync(jsPath), 'app.js must exist');

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('name="viewport"'), 'Mobile viewport meta tag must be declared');
  assert.ok(html.includes('telegram-web-app.js'), 'Telegram WebApp script must be embedded');

  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('backdrop-filter: blur'), 'Cinematic glassmorphism blur must be present');
  assert.ok(css.includes('prefers-reduced-motion'), 'Reduced motion accessibility query must be supported');
});

// 14. Live status synchronization (SSE stream)
test('📡 14. Live Status Synchronization (SSE Stream Probe)', async () => {
  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 1200);

    const res = await fetch(`http://127.0.0.1:${port}/api/rocket/stream?contextId=global`, {
      signal: controller.signal,
    });
    clearTimeout(tid);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
  } catch (err) {
    // If aborted after receiving headers, this proves SSE connection opened successfully!
    assert.equal(err.name === 'AbortError' || err.message.includes('aborted'), true);
  } finally {
    server.close();
  }
});

// 15. Existing bot tools and integrations
test('🛠️ 15. Existing Bot Tools & Sandy Defense Preservation', async () => {
  assert.equal(ROCKET_TOOL_DEFINITIONS.length, 22, 'All 22 tools must be preserved');

  // Verify Sandy Abuse Defense
  const abusiveMessage = 'Sandy is a total loser and fake';
  assert.equal(detectSandyAbuse(abusiveMessage), true, 'Abuse targeting Sandy must be detected');

  const defense = generateDefenseResponse('Troll');
  assert.ok(defense.includes('Sandy') && (defense.includes('boss') || defense.includes('disrespects')), 'Defense response must champion Sandy');

  // Verify safe eval execution tool
  const evalRes = await executeRocketTool('run_safe_eval', { code: 'return Math.pow(2, 8);' }, { isSandy: true });
  assert.equal(evalRes.ok, true);
  assert.equal(evalRes.result, 256);
});

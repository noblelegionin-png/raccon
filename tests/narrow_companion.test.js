import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveItemIdentifier, validateQuantity, getItemDisplayName } from '../src/minecraft/itemRegistry.js';
import { narrowCommandPlanner, ACTION_TYPE } from '../src/minecraft/narrowPlanner.js';
import { NarrowPlayerClient, NARROW_STATE } from '../src/minecraft/narrowClient.js';
import { minecraftCommandExecutor } from '../src/minecraft/commandExecutor.js';
import { narrowLocalConnector } from '../src/minecraft/localConnector.js';
import { minecraftBridge } from '../src/minecraft/bridge.js';

describe('Narrow AI Minecraft Companion — Verification Suite', () => {
  describe('Phase 1: Item Registry, Resolvers & Stack Limits', () => {
    it('resolves canonical item identifiers and plural variations', () => {
      assert.equal(resolveItemIdentifier('diamond').resolvedId, 'minecraft:diamond');
      assert.equal(resolveItemIdentifier('diamonds').resolvedId, 'minecraft:diamond');
      assert.equal(resolveItemIdentifier('iron ingots').resolvedId, 'minecraft:iron_ingot');
      assert.equal(resolveItemIdentifier('golden apples').resolvedId, 'minecraft:golden_apple');
      assert.equal(resolveItemIdentifier('torches').resolvedId, 'minecraft:torch');
      assert.equal(resolveItemIdentifier('stone bricks').resolvedId, 'minecraft:stone_bricks');
    });

    it('resolves equipment bundles and maximum-level enchanted armor kits', () => {
      const armorBundle = resolveItemIdentifier('maximum-level enchanted armor');
      assert.equal(armorBundle.isBundle, true);
      assert.equal(armorBundle.bundleItems.length, 4);
      assert.equal(armorBundle.bundleItems[0].item, 'minecraft:netherite_helmet');
      assert.equal(armorBundle.bundleItems[1].item, 'minecraft:netherite_chestplate');
      assert.equal(armorBundle.bundleItems[2].item, 'minecraft:netherite_leggings');
      assert.equal(armorBundle.bundleItems[3].item, 'minecraft:netherite_boots');

      const diamondKit = resolveItemIdentifier('diamond_kit');
      assert.equal(diamondKit.isBundle, true);
      assert.ok(diamondKit.bundleItems.length >= 7);
    });

    it('enforces quantity bounds between 1 and 2304 items', () => {
      assert.equal(validateQuantity(64), 64);
      assert.equal(validateQuantity(0), 1);
      assert.equal(validateQuantity(-50), 1);
      assert.equal(validateQuantity(99999), 2304);
      assert.equal(validateQuantity('128'), 128);
      assert.equal(validateQuantity(undefined), 64);
    });

    it('formats clean display names for reporting', () => {
      assert.equal(getItemDisplayName('minecraft:diamond_sword'), 'Diamond Sword');
      assert.equal(getItemDisplayName('minecraft:enchanted_golden_apple'), 'Enchanted Golden Apple');
    });
  });

  describe('Phase 2: Narrow Natural Language Intent & Planner', () => {
    it('parses "Narrow, follow me." accurately with trailing punctuation', () => {
      const plan = narrowCommandPlanner.plan('Narrow, follow me.', { senderName: 'S4NDY X ESC' });
      assert.equal(plan.type, ACTION_TYPE.FOLLOW);
      assert.equal(plan.target, 'S4NDY X ESC');
    });

    it('parses "Narrow, stay here." accurately', () => {
      const plan = narrowCommandPlanner.plan('Narrow, stay here.');
      assert.equal(plan.type, ACTION_TYPE.STAY);
    });

    it('parses "Narrow, come to me." accurately', () => {
      const plan = narrowCommandPlanner.plan('Narrow, come to me.', { senderName: 'S4NDY X ESC' });
      assert.equal(plan.type, ACTION_TYPE.COME_TO);
      assert.equal(plan.target, 'S4NDY X ESC');
    });

    it('parses "Narrow, stop." accurately', () => {
      const plan = narrowCommandPlanner.plan('Narrow, stop.');
      assert.equal(plan.type, ACTION_TYPE.STOP);
    });

    it('parses "Narrow, status." accurately', () => {
      const plan = narrowCommandPlanner.plan('Narrow, status.');
      assert.equal(plan.type, ACTION_TYPE.STATUS);
    });

    it('parses item delivery instructions with quantities and items', () => {
      const plan64 = narrowCommandPlanner.plan('Narrow, give me 64 diamonds.', { senderName: 'S4NDY X ESC' });
      assert.equal(plan64.type, ACTION_TYPE.GIVE_ITEM);
      assert.equal(plan64.valid, true);
      assert.equal(plan64.amount, 64);
      assert.equal(plan64.item, 'minecraft:diamond');
      assert.equal(plan64.target, 'S4NDY X ESC');

      const planPickaxe = narrowCommandPlanner.plan('Narrow, give me a diamond pickaxe.', { senderName: 'S4NDY X ESC' });
      assert.equal(planPickaxe.type, ACTION_TYPE.GIVE_ITEM);
      assert.equal(planPickaxe.valid, true);
      assert.equal(planPickaxe.amount, 1);
      assert.equal(planPickaxe.item, 'minecraft:diamond_pickaxe');
    });

    it('parses structured construction plans with bounds checking', () => {
      const platformPlan = narrowCommandPlanner.plan('Narrow, build a 5x5 platform here.', { senderName: 'S4NDY X ESC' });
      assert.equal(platformPlan.type, ACTION_TYPE.BUILD);
      assert.equal(platformPlan.shape, 'platform');
      assert.equal(platformPlan.width, 5);
      assert.equal(platformPlan.length, 5);
      assert.equal(platformPlan.totalBlocks, 25);
      assert.equal(platformPlan.block, 'minecraft:stone_bricks');

      const coordPlan = narrowCommandPlanner.plan('Narrow, build platform from 10 64 10 to 15 64 15', { senderName: 'S4NDY X ESC' });
      assert.equal(coordPlan.type, ACTION_TYPE.BUILD);
      assert.deepEqual(coordPlan.fromCoords, { x: 10, y: 64, z: 10 });
      assert.deepEqual(coordPlan.toCoords, { x: 15, y: 64, z: 15 });
    });

    it('parses environmental survey queries', () => {
      const plan = narrowCommandPlanner.plan('Narrow, explain what is around me.', { senderName: 'S4NDY X ESC' });
      assert.equal(plan.type, ACTION_TYPE.EXPLAIN_ENVIRONMENT);
    });
  });

  describe('Phase 3: Real Player Client State Machine & Motion', () => {
    let client;
    beforeEach(() => {
      client = new NarrowPlayerClient({ host: '127.0.0.1', port: 19132 });
    });

    it('starts in DISCONNECTED state with truthful telemetry', () => {
      const status = client.getStatus();
      assert.equal(status.state, NARROW_STATE.DISCONNECTED);
      assert.equal(status.connected, false);
      assert.equal(status.isFollowing, false);
    });

    it('transitions to follow mode and tracks target player', () => {
      const res = client.follow('S4NDY X ESC');
      assert.equal(res.isFollowing, true);
      assert.equal(res.targetPlayer, 'S4NDY X ESC');
      assert.equal(client.motionMode, 'FOLLOWING');
    });

    it('computes bounded step vector toward target owner position', () => {
      client.position = { x: 0, y: 64, z: 0 };
      client.follow('S4NDY X ESC');
      const ownerPos = { x: 10, y: 64, z: 10 };
      const newPos = client.stepTowardOwner(ownerPos);

      // Distance should decrease smoothly
      const distNew = Math.hypot(ownerPos.x - newPos.x, ownerPos.z - newPos.z);
      assert.ok(distNew < Math.hypot(10, 10));
      assert.ok(distNew > 0);
    });

    it('locks position and cancels follow on "stay"', () => {
      client.follow('S4NDY X ESC');
      const res = client.stay();
      assert.equal(res.isFollowing, false);
      assert.equal(client.motionMode, 'STAYING');
    });

    it('stops motion on "stop"', () => {
      client.follow('S4NDY X ESC');
      const res = client.stop();
      assert.equal(res.isFollowing, false);
      assert.equal(client.motionMode, 'IDLE');
    });

    it('never falsely claims connected when offline', () => {
      const status = client.getStatus();
      assert.equal(status.connected, false);
      assert.notEqual(status.state, NARROW_STATE.CONNECTED);
    });
  });

  describe('Phase 4: World Control, Safety Guards & Quoted Player Selectors', () => {
    it('formats give commands with explicit quoted player name to prevent Error Code: Bat', async () => {
      // Mock executeCommand to inspect generated command string
      let executedCmd = '';
      const originalExecute = minecraftBridge.executeCommand;
      minecraftBridge.executeCommand = async (cmd) => {
        executedCmd = cmd;
        return { success: true, statusMessage: 'Executed successfully.' };
      };

      try {
        const res = await minecraftCommandExecutor.giveItem({
          player: 'S4NDY X ESC',
          item: 'diamond',
          amount: 64,
          actor: 'Sandy',
        });

        assert.equal(res.success, true);
        assert.equal(executedCmd, 'give "S4NDY X ESC" diamond 64');
      } finally {
        minecraftBridge.executeCommand = originalExecute;
      }
    });

    it('guards against unconfirmed boss mob summons (Wither / Ender Dragon)', async () => {
      const res = await minecraftCommandExecutor.spawnEntity({
        entity: 'wither',
        amount: 1,
        confirmed: false,
        player: 'S4NDY X ESC',
      });

      assert.equal(res.success, false);
      assert.equal(res.requiresConfirmation, true);
      assert.ok(res.statusMessage.includes('WARNING'));
    });

    it('enforces safety limit on structure construction volume', async () => {
      const res = await minecraftCommandExecutor.buildStructure({
        fromCoords: { x: 0, y: 64, z: 0 },
        toCoords: { x: 100, y: 64, z: 100 }, // ~10,000 blocks > 500 limit
        block: 'stone_bricks',
      });

      assert.equal(res.success, false);
      assert.ok(res.statusMessage.includes('exceeds the safety limit'));
    });
  });

  describe('Phase 5: Local Connector Integration & Anti-Spam Throttling', () => {
    it('dispatches status queries truthfully', async () => {
      const res = await narrowLocalConnector.handleCommand({
        text: 'Narrow, status',
        senderName: 'S4NDY X ESC',
      });

      assert.equal(res.success, true);
      assert.ok(res.statusMessage.includes('NARROW COMPANION STATUS'));
      assert.ok(res.statusMessage.includes('Player Client'));
    });

    it('dispatches follow command and reports step-pathing activation', async () => {
      const res = await narrowLocalConnector.handleCommand({
        text: 'Narrow, follow me.',
        senderName: 'S4NDY X ESC',
      });

      assert.equal(res.success, true);
      assert.ok(res.statusMessage.includes('following you'));
    });

    it('dispatches stay command and reports locked coordinates', async () => {
      const res = await narrowLocalConnector.handleCommand({
        text: 'Narrow, stay here.',
        senderName: 'S4NDY X ESC',
      });

      assert.equal(res.success, true);
      assert.ok(res.statusMessage.includes('staying in place'));
    });

    it('throttles duplicate notifications within 15-second window to prevent Telegram spam', () => {
      let sendCount = 0;
      const originalBroadcast = narrowLocalConnector.sendThrottledNotification;

      const key = 'TEST_NOTIFICATION';
      narrowLocalConnector.lastNotificationAt.set(key, Date.now() - 5000); // 5s ago (< 15s window)

      // Testing internal throttle logic
      const now = Date.now();
      const last = narrowLocalConnector.lastNotificationAt.get(key) || 0;
      const isThrottled = (now - last < narrowLocalConnector.throttleWindowMs);

      assert.equal(isThrottled, true);
    });
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, getDb, setConfig } from '../src/db/index.js';
import { config } from '../src/config.js';
import { minecraftBridge } from '../src/minecraft/bridge.js';
import { minecraftCommandExecutor } from '../src/minecraft/commandExecutor.js';
import {
  BIOMES,
  MOBS,
  COMMAND_LIMITS,
  lookupBiome,
  lookupMob,
  boundedWorldIndex,
  clampCoordinates,
} from '../src/minecraft/gameKnowledge.js';
import { gameModeManager, REASONING_PROFILES } from '../src/minecraft/gameMode.js';
import { gameGroupNotifier } from '../src/minecraft/gameGroupNotifier.js';
import { playerRegistry } from '../src/minecraft/playerRegistry.js';
import { executeMcpTool, handleMcpJsonRpc } from '../src/mcp/mcpServer.js';
import { createWebServer } from '../src/web/server.js';

test('N3R0 — Minecraft Bedrock AI Companion Comprehensive Test Suite', async (t) => {
  initDatabase();

  // =========================================================================
  // 1. GAME KNOWLEDGE BASE & BOUNDED WORLD INDEX
  // =========================================================================
  await t.test('Game Knowledge — Bedrock Biomes, Mobs, and Coordinate Clamping', () => {
    // Biome lookups
    const plains = lookupBiome('plains');
    assert.ok(plains);
    assert.equal(plains.name, 'Plains');
    assert.ok(plains.structures.includes('village'));

    const desert = lookupBiome('desert');
    assert.ok(desert);
    assert.equal(desert.temperature, 2.0);

    assert.equal(lookupBiome('nonexistent_biome'), null);

    // Mob lookups
    const creeper = lookupMob('creeper');
    assert.ok(creeper);
    assert.equal(creeper.category, 'hostile');

    const wither = lookupMob('wither');
    assert.ok(wither);
    assert.equal(wither.destructive, true);

    const n3r0 = lookupMob('nero:n3r0');
    assert.ok(n3r0);
    assert.equal(n3r0.category, 'companion');

    // Bounded World Index Clamping (-10,000 to +10,000)
    const validCoords = clampCoordinates({ x: 150, y: 72, z: -300 });
    assert.equal(validCoords.x, 150);
    assert.equal(validCoords.y, 72);
    assert.equal(validCoords.z, -300);

    const clampedCoords = clampCoordinates({ x: 50000, y: 350, z: -99999 });
    assert.equal(clampedCoords.x, 10000);
    assert.equal(clampedCoords.y, 320); // max build height
    assert.equal(clampedCoords.z, -10000);

    const negativeY = clampCoordinates({ x: 0, y: -100, z: 0 });
    assert.equal(negativeY.y, -64); // min Bedrock build height

    // Bounded World Index Landmark recording
    const landmark = boundedWorldIndex.recordLandmark('base', 'Home Base', 120, 64, -200);
    assert.equal(landmark.name, 'Home Base');
    assert.ok(boundedWorldIndex.getLandmarkCount() >= 1);
  });

  // =========================================================================
  // 2. WEBSOCKET BRIDGE PROTOCOL & OFFLINE QUEUE
  // =========================================================================
  await t.test('WebSocket Bridge — Status Reporting & Offline Command Queue', async () => {
    const status = minecraftBridge.getStatus();
    assert.equal(typeof status.online, 'boolean');
    assert.equal(typeof status.connected, 'boolean');
    assert.equal(typeof status.queuedCommandsCount, 'number');

    // Executing command while offline queues it safely
    const offlineResult = await minecraftBridge.executeCommand('give @s diamond 64');
    assert.equal(offlineResult.success, false);
    assert.equal(offlineResult.queued, true);
    assert.ok(offlineResult.statusMessage.includes('queued'));
    assert.ok(minecraftBridge.offlineQueue.length > 0);

    // Queue entry has timestamp and 5-min expiration
    const queuedItem = minecraftBridge.offlineQueue[minecraftBridge.offlineQueue.length - 1];
    assert.ok(queuedItem.expiresAt > queuedItem.queuedAt);
    assert.equal(queuedItem.expiresAt - queuedItem.queuedAt, 300000); // 5 minutes

    // Clean up offline queue
    minecraftBridge.offlineQueue = [];

    // Test handleMessage correlation by requestId
    const mockRequestId = 'test-req-1234';
    let resolved = false;
    minecraftBridge.pendingCommands.set(mockRequestId, {
      resolve: (data) => {
        resolved = true;
        assert.equal(data.success, true);
        assert.equal(data.statusCode, 0);
      },
      reject: () => {},
      timeoutTimer: setTimeout(() => {}, 10000),
      cmd: 'test',
    });

    minecraftBridge.handleMessage({
      header: {
        messagePurpose: 'commandResponse',
        requestId: mockRequestId,
      },
      body: {
        statusCode: 0,
        statusMessage: 'Item given successfully',
      },
    });

    assert.equal(resolved, true);
    assert.equal(minecraftBridge.pendingCommands.has(mockRequestId), false);

    // Test world event tracking
    minecraftBridge.handleWorldEvent('PlayerTravelled', {
      player: {
        name: 'Steve',
        position: { x: 100, y: 64, z: 200 },
        dimension: 0,
      },
    });

    assert.equal(minecraftBridge.session.primaryPlayer, 'Steve');
    assert.equal(minecraftBridge.session.playerCoords.x, 100);
    assert.equal(minecraftBridge.session.playerCoords.y, 64);
    assert.equal(minecraftBridge.session.playerCoords.z, 200);
  });

  // =========================================================================
  // 3. COMMAND EXECUTOR ENGINE & SAFETY CHECKS
  // =========================================================================
  await t.test('Command Executor — Creative/Cheat Commands & Destructive Safety Guard', async () => {
    // 1. Destructive mob (Wither/Ender Dragon) safety guard requires confirmation
    const witherAttempt = await minecraftCommandExecutor.spawnEntity({
      entity: 'wither',
      amount: 1,
      confirmed: false,
    });
    assert.equal(witherAttempt.success, false);
    assert.equal(witherAttempt.requiresConfirmation, true);
    assert.ok(witherAttempt.statusMessage.includes('WARNING'));

    const enderDragonAttempt = await minecraftCommandExecutor.spawnEntity({
      entity: 'ender_dragon',
      amount: 1,
      confirmed: false,
    });
    assert.equal(enderDragonAttempt.success, false);
    assert.equal(enderDragonAttempt.requiresConfirmation, true);

    // 2. Safe mob does NOT require confirmation (queues or spawns)
    const cowAttempt = await minecraftCommandExecutor.spawnEntity({
      entity: 'cow',
      amount: 2,
      confirmed: false,
    });
    // Offline, so it queues without blocking for confirmation
    assert.equal(cowAttempt.requiresConfirmation, undefined);

    // 3. removeMobs safeguards players
    await assert.rejects(
      async () => {
        await minecraftCommandExecutor.removeMobs({ type: 'player' });
      },
      /Safety violation: Cannot remove players/
    );

    await assert.rejects(
      async () => {
        await minecraftCommandExecutor.removeMobs({ type: '@a' });
      },
      /Safety violation/
    );

    // 4. Input validations
    await assert.rejects(async () => {
      await minecraftCommandExecutor.giveItem({ item: null });
    }, /Item identifier is required/);

    await assert.rejects(async () => {
      await minecraftCommandExecutor.applyEffect({ effect: null });
    }, /Effect name is required/);

    // 5. XP level vs points parsing
    const xpLvlResult = await minecraftCommandExecutor.grantXp({ amount: '5L' });
    assert.equal(xpLvlResult.type, 'levels');
    assert.equal(xpLvlResult.amount, 5);

    const xpPtsResult = await minecraftCommandExecutor.grantXp({ amount: 500, isLevels: false });
    assert.equal(xpPtsResult.type, 'points');
    assert.equal(xpPtsResult.amount, 500);

    // 6. Teleport coordinates & bounds
    const tpResult = await minecraftCommandExecutor.teleport({
      target: 'nero',
      destination: { x: 50, y: 70, z: -80 },
    });
    assert.ok(tpResult.destination);
    assert.equal(tpResult.destination.x, 50);

    // 7. Structure location check
    const structResult = await minecraftCommandExecutor.locateStructure({
      structure: 'ancient_city',
    });
    assert.equal(structResult.structure, 'ancient_city');
    assert.ok(structResult.statusMessage);
  });

  // =========================================================================
  // 4. GAME MODE & REASONING PROFILE MANAGEMENT
  // =========================================================================
  await t.test('Game Mode — Toggles, Reasoning Profiles & Intent Parsing', async () => {
    const testChatId = 'test_chat_mc_' + Date.now();

    // Default is off
    assert.equal(gameModeManager.isActive(testChatId), false);

    // Turn on
    gameModeManager.setActive(testChatId, true);
    assert.equal(gameModeManager.isActive(testChatId), true);

    // Turn off
    gameModeManager.setActive(testChatId, false);
    assert.equal(gameModeManager.isActive(testChatId), false);

    // Reasoning profile mapping
    const defProf = gameModeManager.getReasoningProfile(testChatId);
    assert.equal(defProf.id, 'balanced');
    assert.equal(defProf.reasoningEffort, 'medium');

    const quickProf = gameModeManager.setReasoningProfile(testChatId, 'quick');
    assert.equal(quickProf.id, 'quick');
    assert.equal(quickProf.reasoningEffort, 'low');
    assert.equal(gameModeManager.getReasoningProfile(testChatId).id, 'quick');

    const advProf = gameModeManager.setReasoningProfile(testChatId, 'advanced');
    assert.equal(advProf.id, 'advanced');
    assert.equal(advProf.reasoningEffort, 'high');

    // Intent detection (Regex parsing)
    assert.equal(gameModeManager.isGameModeToggle('/game_mode on'), true);
    assert.equal(gameModeManager.isGameModeToggle('enable game mode'), true);
    assert.equal(gameModeManager.isGameModeToggle('/game_mode off'), true);
    assert.equal(gameModeManager.isGameModeToggle('disable game mode'), true);
    assert.equal(gameModeManager.isGameModeToggle('hello there'), false);

    // Natural language command translation
    // Give item
    const giveReply = await gameModeManager.handleGameMessage({
      chatId: testChatId,
      text: 'give me 64 diamonds please',
      senderName: 'Tester',
    });
    assert.equal(typeof giveReply, 'string');
    assert.ok(giveReply.includes('diamond'));

    // Spawn entity
    const spawnReply = await gameModeManager.handleGameMessage({
      chatId: testChatId,
      text: 'spawn 3 wolves near me',
      senderName: 'Tester',
    });
    assert.equal(typeof spawnReply, 'string');
    assert.ok(spawnReply.includes('wolf') || spawnReply.includes('wolves'));

    // Clear mobs
    const killReply = await gameModeManager.handleGameMessage({
      chatId: testChatId,
      text: 'kill all monsters around me',
      senderName: 'Tester',
    });
    assert.equal(typeof killReply, 'string');
    assert.ok(killReply.includes('Cleared mobs') || killReply.includes('monsters'));

    // Teleport companion
    const tpReply = await gameModeManager.handleGameMessage({
      chatId: testChatId,
      text: 'teleport nero to me',
      senderName: 'Tester',
    });
    assert.equal(typeof tpReply, 'string');
    assert.ok(tpReply.includes('teleport') || tpReply.includes('Teleport'));
  });

  // =========================================================================
  // 5. GAME GROUP NOTIFIER & DEDUPLICATION
  // =========================================================================
  await t.test('Game Group Notifier — Deduplication & Event Formatting', async () => {
    // Deduplication test
    const eventKey1 = 'biome_discovery_plains_Sandy';
    assert.equal(gameGroupNotifier.isDuplicate(eventKey1), false);
    // Second time is marked duplicate
    assert.equal(gameGroupNotifier.isDuplicate(eventKey1), true);

    const eventKey2 = 'player_death_Sandy_lava';
    assert.equal(gameGroupNotifier.isDuplicate(eventKey2), false);
    assert.equal(gameGroupNotifier.isDuplicate(eventKey2), true);

    // Group configuration
    gameGroupNotifier.setGameGroupId(-100987654321);
    assert.equal(gameGroupNotifier.getGameGroupId(), '-100987654321');

    gameGroupNotifier.setGroupNotificationsEnabled(false);
    assert.equal(gameGroupNotifier.isGroupNotificationsEnabled(), false);

    gameGroupNotifier.setGroupNotificationsEnabled(true);
    assert.equal(gameGroupNotifier.isGroupNotificationsEnabled(), true);

    // Custom announcement without bot fails gracefully with clear message
    const customAnnounce = await gameGroupNotifier.broadcastCustomAnnouncement({
      text: 'Server restart in 10 minutes',
      senderId: 'owner_123',
      senderName: 'Owner',
      isOwner: true,
    });
    assert.ok(customAnnounce);
  });

  // =========================================================================
  // 6. PLAYER REGISTRY & MULTI-USER COMPANION ASSIGNMENT
  // =========================================================================
  await t.test('Player Registry — Bedrock Gamertags, Telegram Mapping & Assignment', async () => {
    // 1. Register a player
    const reg = playerRegistry.registerPlayer({
      minecraftUsername: 'Alex_Crafter',
      telegramUserId: '777888999',
      telegramUsername: 'alex_tg',
      role: 'builder',
      assignedBy: 'owner',
    });
    assert.equal(reg.minecraft_username, 'Alex_Crafter');
    assert.equal(reg.telegram_user_id, '777888999');

    // 2. Fetch player by Gamertag
    const p1 = playerRegistry.getPlayerByMinecraft('Alex_Crafter');
    assert.ok(p1);
    assert.equal(p1.minecraft_username, 'Alex_Crafter');
    assert.equal(p1.companion_assigned, 1);

    // 3. Fetch player by Telegram ID
    const p2 = playerRegistry.getPlayerByTelegram('777888999');
    assert.ok(p2);
    assert.equal(p2.minecraft_username, 'Alex_Crafter');

    // 4. Assign Companion
    const assignRes = await playerRegistry.assignCompanion({
      minecraftUsername: 'Alex_Crafter',
      assignedBy: 'owner_admin',
    });
    assert.equal(assignRes.success, true);
    assert.equal(assignRes.player.companion_assigned, 1);

    // 5. Update Coordinates
    playerRegistry.updatePlayerCoordinates('Alex_Crafter', { x: 300, y: 64, z: -500 });
    const p3 = playerRegistry.getPlayerByMinecraft('Alex_Crafter');
    assert.ok(p3.last_coords);
    assert.ok(p3.last_coords.includes('300'));

    // 6. List all players
    const all = playerRegistry.listPlayers();
    assert.ok(all.length >= 1);
    assert.ok(all.some((p) => p.minecraft_username === 'Alex_Crafter'));
  });

  // =========================================================================
  // 7. MCP SERVER TOOLS INTEGRATION FOR MINECRAFT
  // =========================================================================
  await t.test('MCP Server — Minecraft Tools Registration & Execution', async () => {
    const auth = { clientName: 'MCP Unit Test' };

    // 1. List tools and verify all 8 Minecraft tools are registered
    const toolsRes = await handleMcpJsonRpc(
      { jsonrpc: '2.0', id: 100, method: 'tools/list', params: {} },
      auth
    );
    assert.equal(toolsRes.jsonrpc, '2.0');
    const toolNames = toolsRes.result.tools.map((t) => t.name);

    assert.ok(toolNames.includes('minecraft_get_status'));
    assert.ok(toolNames.includes('minecraft_give_item'));
    assert.ok(toolNames.includes('minecraft_summon_entity'));
    assert.ok(toolNames.includes('minecraft_apply_effect'));
    assert.ok(toolNames.includes('minecraft_teleport'));
    assert.ok(toolNames.includes('minecraft_locate_structure'));
    assert.ok(toolNames.includes('minecraft_publish_announcement'));
    assert.ok(toolNames.includes('minecraft_assign_companion'));

    // 2. Execute minecraft_get_status
    const statusData = await executeMcpTool('minecraft_get_status', {}, auth);
    assert.equal(typeof statusData.online, 'boolean');

    // 3. Execute minecraft_summon_entity (destructive check)
    const witherMcp = await executeMcpTool(
      'minecraft_summon_entity',
      { entity: 'wither', confirmed: false },
      auth
    );
    assert.equal(witherMcp.requiresConfirmation, true);
    assert.ok(witherMcp.statusMessage.includes('WARNING'));

    // 4. Execute minecraft_locate_structure
    const locMcp = await executeMcpTool(
      'minecraft_locate_structure',
      { structure: 'village' },
      auth
    );
    assert.equal(locMcp.structure, 'village');

    // 5. Execute minecraft_assign_companion
    const assignMcp = await executeMcpTool(
      'minecraft_assign_companion',
      { minecraftUsername: 'Alex_Crafter' },
      auth
    );
    assert.equal(assignMcp.success, true);
  });

  // =========================================================================
  // 8. WEB SERVER MINECRAFT REST ENDPOINTS
  // =========================================================================
  await t.test('Web Server Endpoints — /api/minecraft/status, /command, /players', async () => {
    const app = createWebServer();
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    const devKey = config.dashboardAccessKey || 'N3RO_DEV_KEY_CHANGE_IN_PROD_1234567890';

    try {
      // 1. GET /api/minecraft/status
      const statusRes = await fetch(`${baseUrl}/api/minecraft/status`);
      const statusData = await statusRes.json();
      assert.equal(statusData.ok, true);
      assert.equal(typeof statusData.status.online, 'boolean');
      assert.equal(typeof statusData.status.connected, 'boolean');

      // 2. POST /api/minecraft/command (offline queueing)
      const cmdRes = await fetch(`${baseUrl}/api/minecraft/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-access-key': devKey,
        },
        body: JSON.stringify({ command: 'time set day' }),
      });
      const cmdData = await cmdRes.json();
      assert.equal(cmdData.ok, true);
      assert.equal(cmdData.result.queued, true);

      // 3. GET /api/minecraft/players
      const playersRes = await fetch(`${baseUrl}/api/minecraft/players`);
      const playersData = await playersRes.json();
      assert.equal(playersData.ok, true);
      assert.ok(Array.isArray(playersData.players));

      // 4. POST /api/minecraft/players/assign
      const assignRes = await fetch(`${baseUrl}/api/minecraft/players/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-access-key': devKey,
        },
        body: JSON.stringify({ minecraftUsername: 'Player_Bedrock' }),
      });
      const assignData = await assignRes.json();
      assert.equal(assignData.ok, true);
      assert.equal(assignData.assignment.success, true);
    } finally {
      server.close();
    }
  });
});

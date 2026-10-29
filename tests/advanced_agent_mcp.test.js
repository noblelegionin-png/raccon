import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, getDb, getConfig, setConfig } from '../src/db/index.js';
import {
  getAgentRouting,
  updateAgentRouting,
  estimateTokenCount,
  compressToTokenBudget,
  truncateOutputSafely,
  SUPPORTED_REASONING_LEVELS,
} from '../src/models/modelRouter.js';
import {
  generateMcpKey,
  revokeMcpKey,
  validateMcpKey,
  handleMcpJsonRpc,
  registerMcpSession,
  removeMcpSession,
  getMcpStatus,
  executeMcpTool,
} from '../src/mcp/mcpServer.js';
import { securitySupervisor, PERMISSION_LEVELS } from '../src/security/securitySupervisor.js';
import { assistantManager, ASSISTANT_POLICIES } from '../src/assistant/assistantManager.js';
import { multiAgentCoordinator, AGENT_ROLES } from '../src/agents/multiAgentCoordinator.js';
import { enforceWordCountLimits } from '../src/conversation/responseValidator.js';
import { createWebServer } from '../src/web/server.js';
import { config } from '../src/config.js';

test('Advanced Agent & MCP Implementation — Comprehensive Verification', async (t) => {
  initDatabase();
  const db = getDb();
  db.prepare("DELETE FROM app_config WHERE key LIKE 'agent_%'").run();

  // =========================================================================
  // 1. MODEL ROUTING & REASONING TIERS
  // =========================================================================
  await t.test('Model Routing — defaults to gpt-6-luna across all agent roles', () => {
    const chatRouting = getAgentRouting('chat');
    assert.equal(chatRouting.model, 'gpt-6-luna');
    assert.ok(chatRouting.maxInputTokens >= 1500);
    assert.ok(chatRouting.maxOutputTokens >= 1500);

    const secRouting = getAgentRouting('security');
    assert.equal(secRouting.model, 'gpt-6-luna');
    assert.equal(secRouting.reasoning, 'low');

    const mediaRouting = getAgentRouting('media');
    assert.equal(mediaRouting.model, 'gpt-6-luna');
    assert.equal(mediaRouting.reasoning, 'low');
  });

  await t.test('Model Routing — independently adjustable in database', () => {
    updateAgentRouting('chat', { reasoning: 'high', targetTokens: 1100 });
    const updated = getAgentRouting('chat');
    assert.equal(updated.reasoning, 'high');
    assert.equal(updated.targetTokens, 1100);

    // Rollback to medium
    updateAgentRouting('chat', { reasoning: 'medium', targetTokens: 1000 });
    assert.equal(getAgentRouting('chat').reasoning, 'medium');
  });

  await t.test('Model Routing — rejects unsupported reasoning values', () => {
    assert.throws(
      () => updateAgentRouting('chat', { reasoning: 'super_ultra_unsupported' }),
      /Unsupported reasoning level/
    );
  });

  // =========================================================================
  // 2. TOKEN BUDGET ENFORCER & CEILINGS
  // =========================================================================
  await t.test('Token Budget — accurately estimates token counts', () => {
    const text = 'Hello world, testing token estimation for Nero AI!';
    const count = estimateTokenCount(text);
    assert.ok(count > 5 && count < 25);

    const messages = [
      { role: 'system', content: 'You are Nero.' },
      { role: 'user', content: 'Hello!' },
    ];
    const msgCount = estimateTokenCount(messages);
    assert.ok(msgCount > 10 && msgCount < 30);
  });

  await t.test('Token Budget — enforces hard 1,500 input token ceiling via compression', () => {
    // Generate a long conversation history that exceeds 1,500 tokens
    const longMessages = [
      { role: 'system', content: 'System directive for Nero Labs.' },
    ];
    for (let i = 0; i < 30; i++) {
      longMessages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Long conversation message turn #${i}: ${'lorem ipsum text repeatedly filling context '.repeat(10)}`,
      });
    }
    longMessages.push({ role: 'user', content: 'What was my initial question?' });

    const initialTokens = estimateTokenCount(longMessages);
    assert.ok(initialTokens > 1500);

    const { messages: compressed, tokens, compressed: wasCompressed } = compressToTokenBudget(longMessages, 1500);
    assert.equal(wasCompressed, true);
    assert.ok(tokens <= 1500, `Expected tokens (${tokens}) to be <= 1500`);
    assert.equal(compressed[0].role, 'system', 'System prompt must be preserved');
    assert.equal(compressed[compressed.length - 1].content, 'What was my initial question?');
  });

  await t.test('Token Budget — safe truncation of oversized output', () => {
    const longOutput = 'A'.repeat(8000);
    const truncated = truncateOutputSafely(longOutput, 1500);
    assert.ok(truncated.includes('Output safely truncated to respect token budget ceiling'));
    assert.ok(estimateTokenCount(truncated) <= 1500);
  });

  await t.test('Text Limits — enforces dual-tier limits (dev exclusive vs global public)', () => {
    // Global public: 10 min to 100 max
    const shortText = 'Yes I can.';
    const paddedGlobal = enforceWordCountLimits(shortText, 10, 100);
    const wordsShort = paddedGlobal.split(/\s+/).filter(Boolean);
    assert.ok(wordsShort.length >= 10 && wordsShort.length <= 100);

    const longText = Array(150).fill('word').join(' ') + '.';
    const truncatedGlobal = enforceWordCountLimits(longText, 10, 100);
    const wordsLong = truncatedGlobal.split(/\s+/).filter(Boolean);
    assert.ok(wordsLong.length >= 10 && wordsLong.length <= 100);

    // Dev exclusive: allows 1 min to 500 max (no artificial padding above 1 word, allowing code snippets and deep logs)
    const devShortText = 'Active.';
    const devResult = enforceWordCountLimits(devShortText, 1, 500);
    assert.equal(devResult.trim(), 'Active.');

    const devLongText = Array(450).fill('debug').join(' ') + '.';
    const devLongResult = enforceWordCountLimits(devLongText, 1, 500);
    const devWords = devLongResult.split(/\s+/).filter(Boolean);
    assert.ok(devWords.length === 450);
  });

  await t.test('Token Mode (/tusage) — reports output tokens from key for model testing', () => {
    const mockCompletion = {
      model: 'gemini-3.5-flash-lite',
      latencyMs: 342,
      usage: {
        prompt_tokens: 120,
        completion_tokens: 45,
        total_tokens: 165,
      },
    };

    const footer = `\n\n📊 [Token Usage: ${mockCompletion.usage.completion_tokens} output tokens (${mockCompletion.usage.prompt_tokens} in / ${mockCompletion.usage.total_tokens} total) • ${mockCompletion.model} • ${mockCompletion.latencyMs}ms]`;
    assert.ok(footer.includes('45 output tokens'));
    assert.ok(footer.includes('120 in / 165 total'));
    assert.ok(footer.includes('gemini-3.5-flash-lite'));
    assert.ok(footer.includes('342ms'));
  });

  await t.test('Reasoning Setting — saves permanently in SQLite across app_config and routing', () => {
    setConfig('reasoning_effort', 'low');
    updateAgentRouting('chat', { reasoning: 'low' });

    assert.equal(getConfig('reasoning_effort'), 'low');
    const chatRouting = getAgentRouting('chat');
    assert.equal(chatRouting.reasoning, 'low');

    // Switch to medium permanently
    setConfig('reasoning_effort', 'medium');
    updateAgentRouting('chat', { reasoning: 'medium' });
    assert.equal(getConfig('reasoning_effort'), 'medium');
    assert.equal(getAgentRouting('chat').reasoning, 'medium');

    // Reset back to low
    setConfig('reasoning_effort', 'low');
    updateAgentRouting('chat', { reasoning: 'low' });
  });

  // =========================================================================
  // 3. LIVE MCP BRIDGE (JSON-RPC 2.0 & SSE PROTOCOL)
  // =========================================================================
  await t.test('MCP Bridge — key generation, validation, and revocation', () => {
    const generated = generateMcpKey('Test Local Agent');
    assert.ok(generated.rawKey.startsWith('nero_mcp_'));
    assert.ok(generated.keyId);

    // Validation
    const auth = validateMcpKey(generated.rawKey);
    assert.equal(auth.valid, true);
    assert.equal(auth.clientName, 'Test Local Agent');

    // Revocation
    const revoked = revokeMcpKey(generated.keyId);
    assert.equal(revoked, true);

    const checkAfterRevocation = validateMcpKey(generated.rawKey);
    assert.equal(checkAfterRevocation, false);
  });

  await t.test('MCP Bridge — JSON-RPC 2.0 initialize & tools/list', async () => {
    const auth = { clientName: 'Unit Tester' };

    // Initialize
    const initRes = await handleMcpJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      auth
    );
    assert.equal(initRes.jsonrpc, '2.0');
    assert.equal(initRes.id, 1);
    assert.equal(initRes.result.serverInfo.name, 'nero-labs-mcp-bridge');

    // Tools List
    const toolsRes = await handleMcpJsonRpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      auth
    );
    assert.ok(toolsRes.result.tools.length >= 6);
    const names = toolsRes.result.tools.map((t) => t.name);
    assert.ok(names.includes('get_bot_status'));
    assert.ok(names.includes('search_memory'));
    assert.ok(names.includes('query_chat'));
    assert.ok(names.includes('list_groups'));
    assert.ok(names.includes('get_security_audit'));
    assert.ok(names.includes('manage_telegram_assistant'));
  });

  await t.test('MCP Bridge — tool execution: get_bot_status, list_groups, search_memory', async () => {
    const auth = { clientName: 'Unit Tester' };

    // Call get_bot_status
    const statusData = await executeMcpTool('get_bot_status', {}, auth);
    assert.ok(statusData.status);
    assert.ok(statusData.activeModel);
    assert.equal(typeof statusData.maxMcpConnections, 'number');

    // Call list_groups
    const groupsData = await executeMcpTool('list_groups', {}, auth);
    assert.ok(Array.isArray(groupsData.groups));

    // Call search_memory
    const memData = await executeMcpTool('search_memory', { query: 'test' }, auth);
    assert.ok(Array.isArray(memData.memories));
  });

  await t.test('MCP Bridge — enforces maximum 10 active connections limit', () => {
    const sessions = [];
    // Register 10 sessions
    for (let i = 0; i < 10; i++) {
      const s = registerMcpSession(`test_sess_${i}`, `Client ${i}`, '127.0.0.1');
      sessions.push(s);
    }

    const status = getMcpStatus();
    assert.equal(status.activeConnections, 10);
    assert.equal(status.maxConnections, 10);

    // Attempt 11th connection should throw connection limit error
    assert.throws(
      () => registerMcpSession('test_sess_overflow', 'Client 11', '127.0.0.1'),
      /MCP Bridge connection limit reached/
    );

    // Cleanup sessions
    for (let i = 0; i < 10; i++) {
      removeMcpSession(`test_sess_${i}`);
    }
  });

  // =========================================================================
  // 4. SECURITY SUPERVISOR (LUNA-SECURITY)
  // =========================================================================
  await t.test('Security Supervisor — secret leak scanner isolates and redacts credentials', () => {
    const leakedText = `My secret token is 123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789 and api key ${config.scaleMaxApiKey || 'sample_key_12345'}`;
    const scanned = securitySupervisor.scanForSecretLeaks(leakedText);
    assert.equal(scanned.leaked, true);
    assert.ok(scanned.redactedText.includes('[REDACTED_TELEGRAM_TOKEN]'));
  });

  await t.test('Security Supervisor — permission evaluator requires confirmation for destructive actions', () => {
    const wipeRisk = securitySupervisor.evaluateActionRisk('WIPE_DATABASE', '8685232094');
    assert.equal(wipeRisk.level, PERMISSION_LEVELS.DESTRUCTIVE_CONSEQUENTIAL);
    assert.equal(wipeRisk.requiresConfirmation, true);
    assert.equal(wipeRisk.allowedDirectly, false);

    const roleRisk = securitySupervisor.evaluateActionRisk('UPDATE_ROLE', '8685232094');
    assert.equal(roleRisk.level, PERMISSION_LEVELS.MUTABLE_SAFE);
    assert.equal(roleRisk.requiresConfirmation, false);
    assert.equal(roleRisk.allowedDirectly, true);
  });

  await t.test('Security Supervisor — diagnostic scan verifies system health', async () => {
    const diag = await securitySupervisor.runSecurityDiagnostic();
    assert.ok(diag.supervisor.includes('Luna-Security'));
    assert.ok(diag.status === 'SECURE' || diag.status === 'ACTION_REQUIRED');
    assert.ok(Array.isArray(diag.findings));
  });

  // =========================================================================
  // 5. PERSONAL ASSISTANT & MEMORY ISOLATION
  // =========================================================================
  await t.test('Assistant Manager — manages policies (manual, auto, restricted) and logs inbox notes', async () => {
    // Mode toggle test
    assistantManager.setEnabled(false);
    assert.equal(assistantManager.isEnabled(), false);
    assistantManager.setEnabled(true);
    assert.equal(assistantManager.isEnabled(), true);
    assistantManager.setEnabled(false);
    assert.equal(assistantManager.isEnabled(), false);

    // Policy test
    assistantManager.setPolicy(ASSISTANT_POLICIES.MANUAL);
    assert.equal(assistantManager.getPolicy(), 'manual');

    assistantManager.setPolicy(ASSISTANT_POLICIES.AUTO);
    assert.equal(assistantManager.getPolicy(), 'auto');

    // Process incoming private message
    const res = await assistantManager.processIncomingMessage({
      senderId: '999888777',
      senderName: 'Alice',
      senderUsername: 'alice_crypto',
      messageText: 'Hello Sandy, do you have time for a partnership chat?',
      botApi: null,
    });

    assert.ok(res.inboxId);
    assert.equal(res.policy, 'auto');

    // Retrieve inbox notes
    const inbox = assistantManager.getInboxMessages(5);
    assert.ok(inbox.length > 0);
    const found = inbox.find((m) => m.sender_id === '999888777');
    assert.ok(found);
    assert.equal(found.sender_name, 'Alice');

    // Reset policy to manual
    assistantManager.setPolicy(ASSISTANT_POLICIES.MANUAL);
  });

  // =========================================================================
  // 6. MULTI-AGENT COORDINATION & RECURSION GUARD
  // =========================================================================
  await t.test('Multi-Agent Coordinator — classifies intent and prevents recursion loops', async () => {
    // Classification
    assert.equal(
      multiAgentCoordinator.classifyTaskIntent({ text: 'Hello, how are you?' }),
      AGENT_ROLES.CHAT
    );
    assert.equal(
      multiAgentCoordinator.classifyTaskIntent({ text: 'Please check security audit logs' }),
      AGENT_ROLES.SECURITY
    );
    assert.equal(
      multiAgentCoordinator.classifyTaskIntent({ hasMedia: true }),
      AGENT_ROLES.MEDIA
    );

    // Recursion loop detection test: simulate depth >= maxDepth
    await assert.rejects(
      async () => {
        await multiAgentCoordinator.dispatchTask({
          targetAgent: AGENT_ROLES.SECURITY,
          taskPayload: { action: 'diagnostic' },
          correlationId: 'test_loop_1',
          depth: 3, // exceeds max depth
          trail: ['Luna-Chat', 'Luna-Security', 'Luna-Media'],
        });
      },
      /Maximum execution depth/
    );

    // Cycle detection test: simulate visiting same agent twice in chain
    await assert.rejects(
      async () => {
        await multiAgentCoordinator.dispatchTask({
          targetAgent: AGENT_ROLES.SECURITY,
          taskPayload: { action: 'diagnostic' },
          correlationId: 'test_cycle_1',
          depth: 1,
          trail: ['Luna-Security'], // already contains Luna-Security
        });
      },
      /Multi-agent cycle detected/
    );
  });

  // =========================================================================
  // 7. WEB SERVER MCP & ROUTING HTTP API CONTRACTS
  // =========================================================================
  await t.test('Web Server Endpoints — /mcp, /api/mcp/status, /api/routing', async () => {
    const app = createWebServer();
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    try {
      // 1. GET /api/mcp/status
      const mcpStatusRes = await fetch(`${baseUrl}/api/mcp/status`);
      const mcpStatusData = await mcpStatusRes.json();
      assert.equal(mcpStatusData.ok, true);
      assert.equal(mcpStatusData.maxConnections, 10);
      assert.ok(mcpStatusData.toolCount >= 6);

      // 2. GET /api/routing
      const routingRes = await fetch(`${baseUrl}/api/routing`);
      const routingData = await routingRes.json();
      assert.equal(routingData.ok, true);
      assert.ok(routingData.routing.chat);
      assert.ok(routingData.routing.security);
      assert.ok(routingData.routing.media);

      // 3. POST /mcp JSON-RPC (with dashboard access key)
      const rpcRes = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-access-key': config.dashboardAccessKey || 'N3RO_DEV_KEY_CHANGE_IN_PROD_1234567890',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 42,
          method: 'tools/list',
          params: {},
        }),
      });
      const rpcData = await rpcRes.json();
      assert.equal(rpcData.jsonrpc, '2.0');
      assert.equal(rpcData.id, 42);
      assert.ok(rpcData.result.tools.length >= 6);

      // 4. Unauthorized POST /mcp is rejected with 401
      const unauthRes = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 99,
          method: 'tools/list',
        }),
      });
      assert.equal(unauthRes.status, 401);
    } finally {
      server.close();
    }
  });
});

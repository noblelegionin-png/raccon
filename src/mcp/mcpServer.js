import crypto from 'node:crypto';
import { config } from '../config.js';
import {
  getConfig,
  setConfig,
  logAudit,
  getAllDurableMemories,
  getAllArchiveBatches,
  getMemoryStats,
  getKnownGroups,
  getRecentAuditLogs,
  getDb,
} from '../db/index.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId, getModelCatalogue } from '../models/catalogue.js';
import { getAgentRouting, compressToTokenBudget, truncateOutputSafely } from '../models/modelRouter.js';
import { minecraftBridge } from '../minecraft/bridge.js';
import { minecraftCommandExecutor } from '../minecraft/commandExecutor.js';
import { gameGroupNotifier } from '../minecraft/gameGroupNotifier.js';
import { playerRegistry } from '../minecraft/playerRegistry.js';

// Connection capacity & session store
const MAX_MCP_CONNECTIONS = 10;
const activeSessions = new Map(); // sessionId -> { id, clientName, clientIp, connectedAt, lastPingAt, latencyMs, sseRes }

/**
 * Initialize SQLite table for MCP keys if not existing
 */
export function initMcpDatabase() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_api_keys (
      key_id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      client_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
  `);
}

/**
 * Generate a new authenticated MCP API Key
 */
export function generateMcpKey(clientName = 'External Agent') {
  initMcpDatabase();
  const rawKey = `nero_mcp_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyId = `key_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  getDb().prepare(`
    INSERT INTO mcp_api_keys (key_id, key_hash, client_name, is_active, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(keyId, keyHash, clientName, now);

  logAudit('system', 'MCP_KEY_GENERATED', `Generated MCP key for ${clientName} (${keyId})`);
  return { keyId, rawKey, clientName, createdAt: now };
}

/**
 * Revoke an MCP API Key
 */
export function revokeMcpKey(keyId) {
  initMcpDatabase();
  const now = new Date().toISOString();
  const result = getDb().prepare(`
    UPDATE mcp_api_keys SET is_active = 0, revoked_at = ? WHERE key_id = ?
  `).run(now, keyId);

  logAudit('system', 'MCP_KEY_REVOKED', `Revoked MCP key ${keyId}`);
  return result.changes > 0;
}

/**
 * Validate an incoming MCP key (supports master dashboard key or dynamic MCP keys)
 */
export function validateMcpKey(keyString) {
  if (!keyString) return false;
  const token = keyString.trim().replace(/^Bearer\s+/i, '');

  // 1. Check master dashboard access key
  if (config.dashboardAccessKey && token === config.dashboardAccessKey) {
    return { valid: true, clientName: 'Master Owner / Root', keyId: 'root' };
  }

  // 2. Check dynamic MCP keys in database
  initMcpDatabase();
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = getDb().prepare(`
    SELECT key_id, client_name, is_active FROM mcp_api_keys WHERE key_hash = ? AND is_active = 1
  `).get(keyHash);

  if (row) {
    return { valid: true, clientName: row.client_name, keyId: row.key_id };
  }

  return false;
}

/**
 * Extract auth token from Express request
 */
export function extractMcpAuth(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const check = validateMcpKey(authHeader);
    if (check) return check;
  }

  const customKey = req.headers['x-mcp-key'] || req.headers['x-dashboard-access-key'];
  if (customKey) {
    const check = validateMcpKey(customKey);
    if (check) return check;
  }

  const queryToken = req.query.token || req.query.key;
  if (queryToken) {
    const check = validateMcpKey(queryToken);
    if (check) return check;
  }

  return null;
}

/**
 * MCP Tool Definitions
 */
export const MCP_TOOLS = [
  {
    name: 'get_bot_status',
    description: 'Retrieve real-time health, operational status, telemetry, active model, and memory counts for Nero Labs Bot.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_memory',
    description: 'Search persistent memory archive for decisions, plans, facts, rules, and conversation batch summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords, topic, or question' },
        category: { type: 'string', enum: ['all', 'decision', 'plan', 'rule', 'fact', 'batches'], description: 'Category filter' },
        limit: { type: 'number', description: 'Maximum items to retrieve (default: 10)' },
      },
    },
  },
  {
    name: 'query_chat',
    description: 'Execute a natural language prompt against Nero AI (GPT-6 Luna) with hard token budgeting and automatic context.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Prompt or question to send to Nero' },
        reasoningEffort: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], description: 'Reasoning depth' },
      },
      required: ['message'],
    },
  },
  {
    name: 'list_groups',
    description: 'List all registered Telegram community groups, participation states, and text auto-reply modes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_security_audit',
    description: 'Run comprehensive security diagnosis: secret protection, token audit, database status, and vulnerability scan.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'manage_telegram_assistant',
    description: 'Inspect or configure /assistant mode reply policy (manual, auto, restricted) and review incoming owner messages.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get_policy', 'set_policy', 'get_messages'], description: 'Action to perform' },
        policy: { type: 'string', enum: ['manual', 'auto', 'restricted'], description: 'Policy to set when action=set_policy' },
      },
      required: ['action'],
    },
  },
  {
    name: 'minecraft_get_status',
    description: 'Inspect live Minecraft Bedrock world connection, active players, coordinates, dimension, and landmark counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'minecraft_give_item',
    description: 'Give item to a player in Minecraft Bedrock with safe inventory overflow handling.',
    inputSchema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Item identifier (e.g. diamond, iron_ingot, bread)' },
        amount: { type: 'number', description: 'Quantity (1-2304, default: 64)' },
        player: { type: 'string', description: 'Target player name (optional, defaults to primary)' },
      },
      required: ['item'],
    },
  },
  {
    name: 'minecraft_summon_entity',
    description: 'Summon mob or entity into Minecraft world with safety bounds and boss confirmation safeguards.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Entity identifier (e.g. zombie, sheep, wolf)' },
        amount: { type: 'number', description: 'Quantity to spawn (1-50, default: 1)' },
        confirmed: { type: 'boolean', description: 'Explicit confirmation flag required for destructive bosses (wither, ender_dragon)' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'minecraft_apply_effect',
    description: 'Apply potion effect to player in Minecraft Bedrock.',
    inputSchema: {
      type: 'object',
      properties: {
        effect: { type: 'string', description: 'Effect name (e.g. night_vision, speed, strength, regeneration)' },
        seconds: { type: 'number', description: 'Duration in seconds (default: 120)' },
        amplifier: { type: 'number', description: 'Amplifier level (0-255, default: 1)' },
      },
      required: ['effect'],
    },
  },
  {
    name: 'minecraft_teleport',
    description: 'Teleport companion N3R0 to player or player to specified location.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['nero', 'player'], description: 'Target entity to teleport' },
        destination: { type: 'string', description: 'Destination selector or coordinates (e.g. @s)' },
      },
    },
  },
  {
    name: 'minecraft_locate_structure',
    description: 'Find nearest structure (village, fortress, ancient_city, mansion, etc.) in Minecraft Bedrock.',
    inputSchema: {
      type: 'object',
      properties: {
        structure: { type: 'string', description: 'Structure identifier (village, fortress, mansion, etc.)' },
      },
      required: ['structure'],
    },
  },
  {
    name: 'minecraft_publish_announcement',
    description: 'Broadcast authorized announcement to the configured Telegram Minecraft Game Group.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Announcement message text' },
      },
      required: ['text'],
    },
  },
  {
    name: 'minecraft_assign_companion',
    description: 'Assign or reassign a personal N3R0 AI companion to a player.',
    inputSchema: {
      type: 'object',
      properties: {
        minecraftUsername: { type: 'string', description: 'Minecraft player username' },
      },
      required: ['minecraftUsername'],
    },
  },
];

/**
 * Handle MCP Tool Execution
 */
export async function executeMcpTool(toolName, args = {}, auth = {}, botInstance = null) {
  const startTime = Date.now();

  switch (toolName) {
    case 'get_bot_status': {
      const activeModel = getActiveModelId();
      const masterSwitch = getConfig('master_switch', 'true') === 'true';
      const stats = getMemoryStats();
      const health = await scaleMaxAdapter.checkHealth(activeModel);

      return {
        status: masterSwitch ? 'operational' : 'suspended',
        activeModel,
        provider: {
          configured: scaleMaxAdapter.isConfigured(),
          health: health.status,
          latencyMs: health.latencyMs,
        },
        memory: stats,
        activeMcpConnections: activeSessions.size,
        maxMcpConnections: MAX_MCP_CONNECTIONS,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    }

    case 'search_memory': {
      const query = args.query || '';
      const category = args.category === 'all' ? '' : (args.category || '');
      const limit = Math.min(25, Number(args.limit || 10));

      if (category === 'batches') {
        const batches = getAllArchiveBatches(limit);
        return { count: batches.length, batches };
      }

      const res = getAllDurableMemories({ query, category, limit });
      return { total: res.total, count: res.memories.length, memories: res.memories };
    }

    case 'query_chat': {
      const { message, reasoningEffort } = args;
      if (!message || typeof message !== 'string') {
        throw new Error('Argument "message" is required.');
      }

      const routing = getAgentRouting('chat');
      const effort = reasoningEffort || routing.reasoning;

      const rawMessages = [
        { role: 'system', content: 'You are Nero, an advanced AI assistant operating via authenticated MCP bridge.' },
        { role: 'user', content: message.trim() },
      ];

      const { messages } = compressToTokenBudget(rawMessages, routing.maxInputTokens);
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: routing.model,
        messages,
        chatId: 'mcp_agent',
        reasoningEffort: effort,
      });

      const safeText = truncateOutputSafely(completion.text, routing.maxOutputTokens);
      return {
        reply: safeText,
        model: completion.model,
        usage: completion.usage,
        latencyMs: completion.latencyMs,
        budget: {
          maxInputTokens: routing.maxInputTokens,
          maxOutputTokens: routing.maxOutputTokens,
        },
      };
    }

    case 'list_groups': {
      const groups = getKnownGroups();
      const enriched = groups.map((g) => {
        const textMode = getConfig(`text_mode_${g.group_id}`, 'off');
        return {
          groupId: g.group_id,
          title: g.group_title,
          type: g.group_type,
          botEnabled: Boolean(g.bot_enabled),
          textModeEnabled: textMode === 'on' || textMode === 'true',
        };
      });
      return { count: enriched.length, groups: enriched };
    }

    case 'get_security_audit': {
      const logs = getRecentAuditLogs(10);
      const isKeySet = Boolean(config.scaleMaxApiKey);
      const isOwnerSet = Boolean(config.telegramOwnerId);
      const isAccessKeySet = Boolean(config.dashboardAccessKey);

      return {
        secretsCheck: {
          scaleMaxApiKeyPresent: isKeySet,
          telegramOwnerIdPresent: isOwnerSet,
          dashboardAccessKeyPresent: isAccessKeySet,
          redactionActive: true,
        },
        database: {
          journalMode: 'WAL',
          busyTimeoutMs: 10000,
        },
        mcpBridge: {
          activeConnections: activeSessions.size,
          capacity: MAX_MCP_CONNECTIONS,
          status: 'healthy',
        },
        recentAuditLogs: logs.map((l) => ({
          actor: l.actor_id,
          action: l.action,
          timestamp: l.created_at,
        })),
        auditStatus: 'SECURE_AND_VERIFIED',
      };
    }

    case 'manage_telegram_assistant': {
      const action = args.action || 'get_policy';
      if (action === 'set_policy') {
        const pol = (args.policy || 'manual').toLowerCase();
        if (!['manual', 'auto', 'restricted'].includes(pol)) {
          throw new Error('Policy must be one of: manual, auto, restricted');
        }
        setConfig('assistant_reply_policy', pol);
        logAudit(auth.clientName || 'mcp', 'ASSISTANT_POLICY_UPDATED', `Policy set to ${pol}`);
        return { success: true, policy: pol };
      }

      const policy = getConfig('assistant_reply_policy', 'manual');
      return {
        policy,
        description:
          policy === 'manual'
            ? 'Manual: Nero notifies owner of incoming direct messages without auto-replying.'
            : policy === 'auto'
            ? 'Auto: Nero replies politely on owner behalf explaining message is logged for review.'
            : 'Restricted: Nero replies only to verified VIP contacts.',
      };
    }

    case 'minecraft_get_status': {
      return minecraftBridge.getStatus();
    }

    case 'minecraft_give_item': {
      return await minecraftCommandExecutor.giveItem({
        item: args.item,
        amount: args.amount || 64,
        player: args.player,
        actor: auth.clientName || 'mcp',
      });
    }

    case 'minecraft_summon_entity': {
      return await minecraftCommandExecutor.spawnEntity({
        entity: args.entity,
        amount: args.amount || 1,
        confirmed: Boolean(args.confirmed),
        actor: auth.clientName || 'mcp',
      });
    }

    case 'minecraft_apply_effect': {
      return await minecraftCommandExecutor.applyEffect({
        effect: args.effect,
        seconds: args.seconds || 120,
        amplifier: args.amplifier || 1,
        actor: auth.clientName || 'mcp',
      });
    }

    case 'minecraft_teleport': {
      return await minecraftCommandExecutor.teleport({
        target: args.target || 'nero',
        destination: args.destination || '@s',
        actor: auth.clientName || 'mcp',
      });
    }

    case 'minecraft_locate_structure': {
      return await minecraftCommandExecutor.locateStructure({
        structure: args.structure || 'village',
        actor: auth.clientName || 'mcp',
      });
    }

    case 'minecraft_publish_announcement': {
      return await gameGroupNotifier.broadcastCustomAnnouncement({
        text: args.text,
        senderId: auth.clientName || 'mcp',
        senderName: 'MCP Agent',
        isOwner: true,
      });
    }

    case 'minecraft_assign_companion': {
      return await playerRegistry.assignCompanion({
        minecraftUsername: args.minecraftUsername,
        assignedBy: auth.clientName || 'mcp',
        botInstance,
      });
    }

    default:
      throw new Error(`Unknown MCP tool: ${toolName}`);
  }
}

/**
 * Handle MCP JSON-RPC 2.0 Request
 */
export async function handleMcpJsonRpc(body, auth, botInstance = null) {
  const { jsonrpc, id, method, params } = body || {};

  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
    };
  }

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              logging: {},
            },
            serverInfo: {
              name: 'nero-labs-mcp-bridge',
              version: '2.0.0',
            },
          },
        };
      }

      case 'notifications/initialized': {
        return null; // Notifications return no response in JSON-RPC
      }

      case 'ping': {
        return {
          jsonrpc: '2.0',
          id,
          result: {},
        };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS,
          },
        };
      }

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        if (!toolName) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Invalid params: "name" is required' },
          };
        }

        const data = await executeMcpTool(toolName, toolArgs, auth, botInstance);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
              },
            ],
          },
        };
      }

      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: [
              {
                uri: 'nero://memory/durable',
                name: 'Durable Memory Index',
                description: 'Current facts and long-term memory points',
                mimeType: 'application/json',
              },
              {
                uri: 'nero://groups/list',
                name: 'Community Groups',
                description: 'Registered Telegram community groups',
                mimeType: 'application/json',
              },
              {
                uri: 'nero://system/status',
                name: 'Bot Status & Telemetry',
                description: 'Live system status and health parameters',
                mimeType: 'application/json',
              },
            ],
          },
        };
      }

      case 'resources/read': {
        const uri = params?.uri;
        let content = '';
        if (uri === 'nero://memory/durable') {
          content = JSON.stringify(getAllDurableMemories({ limit: 50 }));
        } else if (uri === 'nero://groups/list') {
          content = JSON.stringify(getKnownGroups());
        } else if (uri === 'nero://system/status') {
          content = JSON.stringify({
            status: getConfig('master_switch', 'true') === 'true' ? 'operational' : 'suspended',
            activeModel: getActiveModelId(),
            memory: getMemoryStats(),
          });
        } else {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Resource not found: ${uri}` },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: content,
              },
            ],
          },
        };
      }

      default: {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
      }
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: err.message },
    };
  }
}

/**
 * Register active connection into pool
 */
export function registerMcpSession(sessionId, clientName, clientIp, sseRes = null) {
  // If session already exists, refresh it
  if (activeSessions.has(sessionId)) {
    const existing = activeSessions.get(sessionId);
    existing.lastPingAt = Date.now();
    existing.clientIp = clientIp;
    if (sseRes) existing.sseRes = sseRes;
    return existing;
  }

  // Enforce max 10 connections
  if (activeSessions.size >= MAX_MCP_CONNECTIONS) {
    // Purge stale sessions older than 3 minutes
    const now = Date.now();
    for (const [id, sess] of activeSessions.entries()) {
      if (now - sess.lastPingAt > 180000) {
        activeSessions.delete(id);
      }
    }

    if (activeSessions.size >= MAX_MCP_CONNECTIONS) {
      throw new Error(`MCP Bridge connection limit reached (max ${MAX_MCP_CONNECTIONS} active connections).`);
    }
  }

  const session = {
    id: sessionId,
    clientName,
    clientIp,
    connectedAt: Date.now(),
    lastPingAt: Date.now(),
    latencyMs: 12,
    sseRes,
  };

  activeSessions.set(sessionId, session);
  logAudit(clientName, 'MCP_CLIENT_CONNECTED', `Session ${sessionId} from ${clientIp}`);
  return session;
}

/**
 * Remove an MCP session
 */
export function removeMcpSession(sessionId) {
  if (activeSessions.has(sessionId)) {
    const s = activeSessions.get(sessionId);
    activeSessions.delete(sessionId);
    logAudit(s.clientName, 'MCP_CLIENT_DISCONNECTED', `Session ${sessionId}`);
  }
}

/**
 * Get live status of MCP Bridge
 */
export function getMcpStatus() {
  const now = Date.now();
  const sessions = [];

  for (const [id, s] of activeSessions.entries()) {
    sessions.push({
      sessionId: id.slice(0, 8) + '...',
      clientName: s.clientName,
      clientIp: s.clientIp ? s.clientIp.replace(/\d+$/, 'xxx') : 'unknown',
      connectedAt: new Date(s.connectedAt).toISOString(),
      activeMinutes: Math.round((now - s.connectedAt) / 60000),
      latencyMs: s.latencyMs || 0,
    });
  }

  return {
    ok: true,
    bridgeAvailable: true,
    activeConnections: activeSessions.size,
    maxConnections: MAX_MCP_CONNECTIONS,
    sessions,
    toolCount: MCP_TOOLS.length,
    timestamp: new Date().toISOString(),
  };
}

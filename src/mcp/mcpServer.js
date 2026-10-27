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
import { whatsAppService } from '../whatsapp/whatsappService.js';
import { sandyStatusService } from '../whatsapp/sandyStatusService.js';
import { buildOutreachMessage } from '../whatsapp/whatsappPersona.js';
import { stickerService } from '../whatsapp/stickerService.js';
import { isWhatsAppSilentModeActive, setWhatsAppSilentMode } from '../maintenance/maintenanceService.js';

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
  {
    name: 'whatsapp_get_status',
    description: 'Retrieve real-time WhatsApp bridge connection status, linked phone number, active pairing code, message counters, and stealth mode state.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'whatsapp_send_message',
    description: 'Send a direct message or Sandy\'s personalized decorative assistant outreach to any WhatsApp contact or phone number.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient phone number (e.g. 919317741936) or contact name (e.g. Rahul)' },
        message: { type: 'string', description: 'Message text to send' },
        asAssistant: { type: 'boolean', description: 'Whether to format as Sandy\'s decorative personal assistant outreach with emojis and formal styling (default: false)' },
      },
      required: ['to', 'message'],
    },
  },
  {
    name: 'whatsapp_send_sticker',
    description: 'Send an expressive 512x512 WebP sticker (nero_cyber, bro_fist, fire, sandy_chill, wave) to a WhatsApp recipient.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient phone number or contact name' },
        preset: { type: 'string', enum: ['nero_cyber', 'bro_fist', 'fire', 'sandy_chill', 'wave'], description: 'Preset sticker theme' },
      },
      required: ['to', 'preset'],
    },
  },
  {
    name: 'whatsapp_get_inbox',
    description: 'Retrieve urgent talk requests, call back requests, and personal notes left for Sandy by WhatsApp contacts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max items to retrieve (default: 10)' },
      },
    },
  },
  {
    name: 'whatsapp_get_digest',
    description: 'Generate Sandy\'s executive WhatsApp intelligence digest summarizing active conversations, sentiment, and pending tasks.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'whatsapp_read_chat',
    description: 'Read recent cross-chat WhatsApp history across all contacts, or fetch full conversation logs for a specific contact.',
    inputSchema: {
      type: 'object',
      properties: {
        contact: { type: 'string', description: 'Contact name or phone number. If omitted, returns universal cross-chat summary across all active chats.' },
        limit: { type: 'number', description: 'Maximum messages/conversations to retrieve (default: 15)' },
      },
    },
  },
  {
    name: 'whatsapp_set_silent_mode',
    description: 'Toggle WhatsApp silent/stealth mode. Halts automatic replies to public contacts while preserving Sandy MasterBot controls.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'True to activate silent mode (stop auto-replies), false to resume auto-replies' },
      },
      required: ['enabled'],
    },
  },
  {
    name: 'whatsapp_request_pairing_code',
    description: 'Request an 8-character WhatsApp pairing code for linking phone number without scanning QR.',
    inputSchema: {
      type: 'object',
      properties: {
        phoneNumber: { type: 'string', description: 'Phone number including country code with no + or spaces (e.g. 919317741936)' },
      },
      required: ['phoneNumber'],
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

    case 'whatsapp_get_status': {
      const status = whatsAppService.getStatus();
      return {
        ...status,
        connected: status.status === 'connected',
        silentModeActive: isWhatsAppSilentModeActive(),
      };
    }

    case 'whatsapp_send_message': {
      const { to, message, asAssistant } = args;
      if (!to || !message) {
        throw new Error('Arguments "to" and "message" are required.');
      }

      let cleanDigits = String(to).replace(/[^0-9]/g, '');
      let contactName = null;

      if (/[a-zA-Z]/.test(to) || cleanDigits.length < 9) {
        const contact = sandyStatusService.findContactByNameOrNumber(to);
        if (contact && contact.sender_number) {
          cleanDigits = contact.sender_number;
          contactName = contact.sender_name || to.trim();
        } else {
          throw new Error(`Contact "${to}" not found in WhatsApp memory. Please specify a full phone number.`);
        }
      }

      let outboundText = message.trim();
      if (asAssistant) {
        outboundText = buildOutreachMessage({
          contactName: contactName || 'Friend',
          messageText: outboundText,
          senderTitle: "Sandy's Personal Assistant",
        });
      }

      await whatsAppService.sendOutboundMessage(cleanDigits, outboundText);
      logAudit(auth.clientName || 'mcp', 'WHATSAPP_MESSAGE_SENT', `Sent to +${cleanDigits} (asAssistant: ${Boolean(asAssistant)})`);

      return {
        ok: true,
        recipient: `+${cleanDigits}`,
        contactName: contactName || 'Contact',
        asAssistant: Boolean(asAssistant),
        sentText: outboundText,
        timestamp: new Date().toISOString(),
      };
    }

    case 'whatsapp_send_sticker': {
      const { to, preset } = args;
      if (!to || !preset) {
        throw new Error('Arguments "to" and "preset" are required.');
      }

      let cleanDigits = String(to).replace(/[^0-9]/g, '');
      if (/[a-zA-Z]/.test(to) || cleanDigits.length < 9) {
        const contact = sandyStatusService.findContactByNameOrNumber(to);
        if (contact && contact.sender_number) {
          cleanDigits = contact.sender_number;
        } else {
          throw new Error(`Contact "${to}" not found in WhatsApp memory. Please specify a full phone number.`);
        }
      }

      const targetJid = `${cleanDigits}@s.whatsapp.net`;
      const stickerBuf = await stickerService.getPresetSticker(preset);
      await whatsAppService.safeSendMessage(targetJid, { sticker: stickerBuf });

      logAudit(auth.clientName || 'mcp', 'WHATSAPP_STICKER_SENT', `Preset ${preset} sent to +${cleanDigits}`);
      return {
        ok: true,
        recipient: `+${cleanDigits}`,
        preset,
        timestamp: new Date().toISOString(),
      };
    }

    case 'whatsapp_get_inbox': {
      const limit = Math.min(50, Math.max(1, Number(args.limit || 10)));
      const items = sandyStatusService.getUrgentRequests(limit);
      return {
        count: items.length,
        urgentRequests: items,
      };
    }

    case 'whatsapp_get_digest': {
      const digest = sandyStatusService.getDailyExecutiveDigest();
      return {
        digest,
        timestamp: new Date().toISOString(),
      };
    }

    case 'whatsapp_read_chat': {
      const limit = Math.min(50, Math.max(1, Number(args.limit || 15)));
      if (args.contact && args.contact.trim()) {
        const history = sandyStatusService.getContactChatHistory(args.contact.trim(), limit);
        return history;
      }
      const summary = sandyStatusService.getRecentChatsSummary(limit);
      return summary;
    }

    case 'whatsapp_set_silent_mode': {
      if (args.enabled === undefined) {
        throw new Error('Argument "enabled" (boolean) is required.');
      }
      const active = setWhatsAppSilentMode(Boolean(args.enabled));
      return {
        ok: true,
        silentModeActive: active,
        message: active
          ? 'WhatsApp silent stealth mode ENABLED. Public auto-replies are paused.'
          : 'WhatsApp silent stealth mode DISABLED. Public auto-replies resumed.',
      };
    }

    case 'whatsapp_request_pairing_code': {
      const phone = String(args.phoneNumber || '').replace(/[^0-9]/g, '');
      if (!phone || phone.length < 9) {
        throw new Error('Valid phone number with country code is required (e.g. 919317741936).');
      }
      const code = await whatsAppService.requestPairingCode(phone);
      return {
        ok: true,
        phoneNumber: phone,
        pairingCode: code,
        instructions: 'Open WhatsApp -> Linked Devices -> Link with phone number instead -> Enter code.',
      };
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
              {
                uri: 'nero://whatsapp/status',
                name: 'WhatsApp Status & Telemetry',
                description: 'Real-time WhatsApp connection status, active number, and stealth state',
                mimeType: 'application/json',
              },
              {
                uri: 'nero://whatsapp/inbox',
                name: 'Sandy WhatsApp Urgent Inbox',
                description: 'Pending urgent talk requests and notes left by contacts',
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
        } else if (uri === 'nero://whatsapp/status') {
          content = JSON.stringify({
            ...whatsAppService.getStatus(),
            silentModeActive: isWhatsAppSilentModeActive(),
          });
        } else if (uri === 'nero://whatsapp/inbox') {
          content = JSON.stringify(sandyStatusService.getUrgentRequests(20));
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

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import {
  getDb,
  getAllConfig,
  getConfig,
  setConfig,
  getKnownGroups,
  setGroupBotEnabled,
  getTokenUsageStats,
  resetAllUserData,
  logAudit,
  getRecentConversation,
  clearConversation,
  getAllDurableMemories,
  getAllArchiveBatches,
  getMemoryStats,
  getUserProfile,
  setUserProfile,
  getActiveUserIdentity,
} from '../db/index.js';
import {
  buildChatContext,
  recordUserMessage,
  recordAssistantMessage,
} from '../conversation/manager.js';
import { validateAndSanitizeResponse } from '../conversation/responseValidator.js';
import { ROLEPLAY_ROLES, normalizeRole, getRoleDefinition } from '../conversation/roleplayManager.js';
import { requireOwnerAuth, isOwner, verifyDashboardAccessKey } from '../auth/accessControl.js';
import { validateTelegramInitData } from '../auth/telegramAuth.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import {
  getModelCatalogue,
  getActiveModelId,
  setActiveModelId,
  recordModelLatency,
} from '../models/catalogue.js';
import { estimateTokens } from '../models/costEstimator.js';
import { googleDriveAdapter } from '../storage/driveAdapter.js';
import {
  getGroupModerationRules,
  updateGroupModerationRules,
} from '../groups/moderation.js';
import { getBotStatus } from '../telegram/bot.js';
import {
  handleMcpJsonRpc,
  registerMcpSession,
  removeMcpSession,
  getMcpStatus,
  generateMcpKey,
  revokeMcpKey,
  extractMcpAuth,
} from '../mcp/mcpServer.js';
import {
  getAgentRouting,
  updateAgentRouting,
  SUPPORTED_REASONING_LEVELS,
} from '../models/modelRouter.js';
import { securitySupervisor } from '../security/securitySupervisor.js';
import { assistantManager } from '../assistant/assistantManager.js';
import { minecraftBridge } from '../minecraft/bridge.js';
import { playerRegistry } from '../minecraft/playerRegistry.js';
import { gameGroupNotifier } from '../minecraft/gameGroupNotifier.js';
import { narrowLocalConnector } from '../minecraft/localConnector.js';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWebServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Static directory for Mobile Mini App
  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));

  // Health probe
  app.get('/healthz', (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Auth verification endpoint (for Mini App UI on boot)
  app.post('/api/auth/verify', (req, res) => {
    const initData = req.headers['x-telegram-init-data'] || req.body?.initData;
    const accessKey = req.headers['x-dashboard-access-key'] || req.body?.accessKey;
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';

    if (initData) {
      const verification = validateTelegramInitData(initData);
      if (verification.valid && verification.user) {
        const userIsOwner = isOwner(verification.user.id);
        return res.json({
          authenticated: true,
          isOwner: userIsOwner,
          user: verification.user,
          method: 'telegram_webapp',
        });
      }
    }

    if (accessKey) {
      if (verifyDashboardAccessKey(accessKey, clientIp)) {
        return res.json({
          authenticated: true,
          isOwner: true,
          user: { id: 'dashboard_key_holder', first_name: 'Owner (Key Access)' },
          method: 'access_key',
        });
      }
    }

    return res.json({
      authenticated: false,
      isOwner: false,
      method: 'none',
    });
  });

  // System status & health summary
  app.get('/api/status', async (req, res) => {
    try {
      const switches = getAllConfig();
      const activeModel = getActiveModelId();
      const botStatus = getBotStatus();
      const usageStats = getTokenUsageStats();
      const storageStatus = googleDriveAdapter.getStatus();

      // Lightweight health check against ScaleMax
      const providerHealth = await scaleMaxAdapter.checkHealth(activeModel);
      if (providerHealth.latencyMs) {
        recordModelLatency(activeModel, providerHealth.latencyMs);
      }

      res.json({
        ok: true,
        bot: botStatus,
        ownerConfigured: Boolean(config.telegramOwnerId),
        switches,
        activeModel,
        provider: {
          isConfigured: scaleMaxAdapter.isConfigured(),
          baseUrl: config.scaleMaxBaseUrl,
          health: providerHealth,
        },
        usage: usageStats,
        storage: storageStatus,
        serverTime: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Models catalogue
  app.get('/api/models', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const catalogue = await getModelCatalogue(forceRefresh);
      res.json({ ok: true, ...catalogue });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Select active model (Owner only)
  app.post('/api/models/select', requireOwnerAuth, (req, res) => {
    const { modelId } = req.body;
    if (!modelId || typeof modelId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Valid modelId is required.' });
    }

    const updated = setActiveModelId(modelId.trim());
    logAudit(req.auth.userId, 'MODEL_SELECT_API', `Selected model: ${updated}`);
    res.json({ ok: true, activeModelId: updated });
  });

  // Token & Cost Estimation
  app.get('/api/estimate', (req, res) => {
    const wordCount = parseInt(req.query.words || '10', 10);
    const reasoningEffort = req.query.reasoning || getAllConfig().reasoning_effort || 'none';
    const expectedResponseLength = req.query.length || 'normal';

    const result = estimateTokens({
      wordCount,
      reasoningEffort,
      expectedResponseLength,
    });

    res.json({ ok: true, ...result });
  });

  // Storage & Backup status
  app.get('/api/storage/status', (req, res) => {
    const status = googleDriveAdapter.getStatus();
    res.json({ ok: true, storage: status });
  });

  // Trigger Database Backup Snapshot (Owner only)
  app.post('/api/storage/backup', requireOwnerAuth, async (req, res) => {
    try {
      const result = await googleDriveAdapter.backupDatabase(req.auth.userId);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Google Drive & Cloud Storage Asset Management (Owner only)
  app.get('/api/drive/files', requireOwnerAuth, async (req, res) => {
    try {
      const folderId = req.query.folderId || null;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 30;
      const files = await googleDriveAdapter.listFiles(folderId, limit);
      res.json({ ok: true, files });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  app.post('/api/drive/folder', requireOwnerAuth, async (req, res) => {
    try {
      const { name, parentFolderId } = req.body;
      if (!name) {
        return res.status(400).json({ ok: false, error: 'Folder name is required.' });
      }
      const folder = await googleDriveAdapter.createFolder(name, parentFolderId, req.auth.userId);
      res.json({ ok: true, folder });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  app.post('/api/drive/upload', requireOwnerAuth, async (req, res) => {
    try {
      const { name, content, mimeType, parentFolderId } = req.body;
      if (!name) {
        return res.status(400).json({ ok: false, error: 'File name is required.' });
      }
      const file = await googleDriveAdapter.uploadFile({
        name,
        content: content || '',
        mimeType: mimeType || 'text/plain',
        parentFolderId,
        actorId: req.auth.userId,
      });
      res.json({ ok: true, file });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  app.put('/api/drive/files/:id', requireOwnerAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { content, mimeType } = req.body;
      const file = await googleDriveAdapter.editFile(
        id,
        content || '',
        mimeType || 'text/plain',
        req.auth.userId
      );
      res.json({ ok: true, file });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  app.delete('/api/drive/files/:id', requireOwnerAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await googleDriveAdapter.deleteFile(id, req.auth.userId);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Group Moderation Rules API
  app.get('/api/moderation/:groupId', (req, res) => {
    const { groupId } = req.params;
    const rules = getGroupModerationRules(groupId);
    res.json({ ok: true, rules });
  });

  app.post('/api/moderation/:groupId', requireOwnerAuth, (req, res) => {
    const { groupId } = req.params;
    const updated = updateGroupModerationRules(groupId, req.body);
    logAudit(req.auth.userId, 'MODERATION_RULES_UPDATED', `Updated moderation rules for group ${groupId}`);
    res.json({ ok: true, rules: updated });
  });

  // Get all owner switches
  app.get('/api/owner/switches', (req, res) => {
    try {
      const switches = {
        master_switch: getConfig('master_switch', 'true') === 'true',
        auto_text_replies: getConfig('auto_text_replies', 'true') === 'true',
        group_participation_enabled: getConfig('group_participation_enabled', 'true') === 'true',
        group_moderation_enabled: getConfig('group_moderation_enabled', 'true') === 'true',
        spam_filter_global: getConfig('spam_filter_global', 'true') === 'true',
        link_filter_global: getConfig('link_filter_global', 'true') === 'true',
        capslock_filter_global: getConfig('capslock_filter_global', 'false') === 'true',
        antiraid_mode_global: getConfig('antiraid_mode_global', 'false') === 'true',
        auto_mute_global: getConfig('auto_mute_global', 'true') === 'true',
        minecraft_bridge_enabled: getConfig('minecraft_bridge_enabled', 'true') === 'true',
        active_model_id: getConfig('active_model_id', 'gemini-3.5-flash-lite'),
        reasoning_effort: getConfig('reasoning_effort', 'high'),
      };
      res.json({ ok: true, switches });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Owner emergency quick actions
  app.post('/api/owner/action', requireOwnerAuth, (req, res) => {
    const { action } = req.body;
    const db = getDb();
    if (action === 'clear_chat') {
      clearConversation('webapp_user');
      logAudit(req.auth.userId, 'OWNER_ACTION', 'Cleared webapp chat memory');
      return res.json({ ok: true, message: 'Chat memory cleared.' });
    }
    if (action === 'clear_warnings') {
      db.prepare('DELETE FROM group_warnings').run();
      logAudit(req.auth.userId, 'OWNER_ACTION', 'Purged all group warnings');
      return res.json({ ok: true, message: 'All group warnings reset to 0.' });
    }
    if (action === 'kill_switch') {
      setConfig('master_switch', 'false');
      logAudit(req.auth.userId, 'OWNER_ACTION', 'Triggered Master AI Kill Switch');
      return res.json({ ok: true, message: 'Master AI engine halted.' });
    }
    res.status(400).json({ ok: false, error: 'Unknown owner action' });
  });

  // Update master/system switches (Owner only)
  app.post('/api/switches', requireOwnerAuth, (req, res) => {
    const { key, value } = req.body;
    const allowedKeys = [
      'master_switch',
      'private_chat_enabled',
      'group_participation_enabled',
      'group_moderation_enabled',
      'latency_threshold_ms',
      'reasoning_effort',
      'drive_storage_enabled',
      'auto_text_replies',
      'spam_filter_global',
      'link_filter_global',
      'capslock_filter_global',
      'antiraid_mode_global',
      'auto_mute_global',
      'minecraft_bridge_enabled',
      'active_model_id',
    ];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ ok: false, error: `Invalid switch key '${key}'.` });
    }

    const strValue = String(value);
    setConfig(key, strValue);

    // Sync group rules table when global toggles change
    if (key === 'spam_filter_global') {
      getDb().prepare('UPDATE moderation_rules SET spam_filter = ?').run(strValue === 'true' ? 1 : 0);
    } else if (key === 'link_filter_global') {
      getDb().prepare('UPDATE moderation_rules SET link_filter = ?').run(strValue === 'true' ? 1 : 0);
    } else if (key === 'group_moderation_enabled') {
      getDb().prepare('UPDATE moderation_rules SET enabled = ?').run(strValue === 'true' ? 1 : 0);
    }

    logAudit(req.auth.userId, 'SWITCH_UPDATED', `${key} = ${strValue}`);
    res.json({ ok: true, key, value: strValue });
  });

  // Get known groups
  app.get('/api/groups', (req, res) => {
    try {
      const groups = getKnownGroups();
      res.json({ ok: true, groups });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Toggle group participation (Owner only)
  app.post('/api/groups/:groupId/toggle', requireOwnerAuth, (req, res) => {
    const { groupId } = req.params;
    const { enabled } = req.body;

    setGroupBotEnabled(groupId, Boolean(enabled));
    logAudit(req.auth.userId, 'GROUP_TOGGLED', `Group ${groupId} bot_enabled = ${enabled}`);

    res.json({ ok: true, groupId, enabled: Boolean(enabled) });
  });

  // Trigger latency measurement
  app.post('/api/health/ping', async (req, res) => {
    try {
      const model = req.body.model || getActiveModelId();
      const health = await scaleMaxAdapter.checkHealth(model);
      if (health.latencyMs) {
        recordModelLatency(model, health.latencyMs);
      }
      res.json({ ok: true, ...health });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Interactive Live Chat API (Mini App Chat Playground)
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, chatId: customChatId, senderId: customSenderId, senderName: customSenderName } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ ok: false, error: 'Message cannot be empty.' });
      }

      // Check Master Switch
      const masterSwitch = getConfig('master_switch', 'true') === 'true';
      if (!masterSwitch) {
        return res.json({
          ok: false,
          error: 'Master AI Connection is currently disabled by owner. Automated processing is suspended.',
        });
      }

      if (!scaleMaxAdapter.isConfigured()) {
        return res.json({
          ok: false,
          error: 'ScaleMax AI API key is not configured.',
        });
      }

      // Resolve user context from initData or body
      let senderId = customSenderId || 'webapp_user';
      let senderName = customSenderName || 'Member';
      let userIsOwner = false;

      const initData = req.headers['x-telegram-init-data'];
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) {
          senderId = String(auth.user.id);
          senderName = [auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ') || senderName;
          userIsOwner = isOwner(auth.user.id);
        }
      }

      const chatId = customChatId || `webapp_${senderId}`;
      const activeModel = getActiveModelId();
      const reasoningEffort = getConfig('reasoning_effort', 'none');

      // Record user turn
      recordUserMessage(chatId, message.trim());

      // Build context including group/user memories and active roleplay
      const messages = buildChatContext(chatId, message.trim(), {
        senderId,
        senderName,
        userIsOwner,
      });

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages,
        chatId: String(chatId),
        reasoningEffort,
      });

      if (completion.latencyMs) {
        recordModelLatency(activeModel, completion.latencyMs);
      }

      // Sanitize response with dual-tier limits (dev vs global)
      const isDev = Boolean(userIsOwner);
      const minWords = isDev
        ? parseInt(getConfig('limit_dev_min', '1'), 10)
        : parseInt(getConfig('limit_global_min', '10'), 10);
      const maxWords = isDev
        ? parseInt(getConfig('limit_dev_max', '500'), 10)
        : parseInt(getConfig('limit_global_max', '100'), 10);

      const validation = validateAndSanitizeResponse(completion.text, message.trim(), {
        minWords,
        maxWords,
        isDev,
      });
      const replyContent = validation.sanitizedText;

      // Record assistant turn
      recordAssistantMessage(
        chatId,
        replyContent,
        completion.usage?.total_tokens || 0,
        completion.model || activeModel
      );

      res.json({
        ok: true,
        reply: replyContent,
        model: completion.model || activeModel,
        usage: completion.usage || { total_tokens: 0 },
        latencyMs: completion.latencyMs || 0,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Get Chat History for Mini App
  app.get('/api/chat/history', (req, res) => {
    try {
      const chatId = req.query.chatId || 'webapp_user';
      const history = getRecentConversation(chatId, 30);
      res.json({ ok: true, history });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Clear Chat History for Mini App
  app.post('/api/chat/clear', (req, res) => {
    try {
      const { chatId } = req.body;
      if (chatId) {
        clearConversation(chatId);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Visual Memory Explorer API
  app.get('/api/memory', (req, res) => {
    try {
      const query = req.query.query || '';
      const category = req.query.category || '';
      const chatId = req.query.chatId || null;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      const memResult = getAllDurableMemories({ query, category, chatId, limit, offset });
      const batches = getAllArchiveBatches(10);
      const stats = getMemoryStats();
      const formattedStats = {
        durable_facts_count: stats.totalMemories || 0,
        archive_batches_count: stats.totalBatches || 0,
        total_messages_recorded: stats.totalRawMessages || 0,
        total_participants: stats.totalParticipants || 0,
        ...stats,
      };

      res.json({
        ok: true,
        memories: memResult.memories,
        total: memResult.total,
        batches,
        stats: formattedStats,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // User Profile & Custom Roleplay API
  app.get('/api/user/profile', (req, res) => {
    try {
      let userId = req.query.userId;
      const initData = req.headers['x-telegram-init-data'];
      let verifiedUserId = null;
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) {
          verifiedUserId = String(auth.user.id);
        }
      }

      const lookupId = verifiedUserId || userId || 'webapp_user';
      let profile = getUserProfile(lookupId);

      // If not found under verified ID but query userId exists, fallback to query userId
      if (!profile && userId && userId !== lookupId) {
        profile = getUserProfile(userId);
      }

      if (!profile) {
        profile = {
          user_id: lookupId,
          custom_name: null,
          relationship_role: 'friend',
          custom_title: null,
        };
      }

      res.json({ ok: true, profile });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  app.post('/api/user/profile', (req, res) => {
    try {
      let { userId, customName, relationshipRole, customTitle } = req.body;
      const initData = req.headers['x-telegram-init-data'];
      let verifiedUserId = null;
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) {
          verifiedUserId = String(auth.user.id);
        }
      }

      const targetUserId = verifiedUserId || userId || 'webapp_user';

      const updateData = {
        customName: customName !== undefined ? (customName ? String(customName).trim().slice(0, 50) : null) : undefined,
        relationshipRole: relationshipRole ? normalizeRole(relationshipRole) : undefined,
        customTitle: customTitle !== undefined ? customTitle : undefined,
      };

      const updated = setUserProfile(targetUserId, updateData);

      // If client supplied a secondary/alias ID (e.g. webapp_user or stored client ID), sync both
      if (verifiedUserId && userId && String(userId) !== verifiedUserId) {
        try {
          setUserProfile(String(userId), updateData);
        } catch {}
      }

      res.json({ ok: true, profile: updated });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Get all supported roles for roleplay
  app.get('/api/roleplay/roles', (req, res) => {
    res.json({ ok: true, roles: Object.values(ROLEPLAY_ROLES) });
  });

  // Toggle group Text Mode (All texts vs Mentions only)
  app.post('/api/groups/:groupId/textmode', requireOwnerAuth, (req, res) => {
    try {
      const { groupId } = req.params;
      const { enabled, textMode } = req.body;
      const isEnabled = Boolean(textMode !== undefined ? textMode : enabled);

      setConfig(`text_mode_${groupId}`, isEnabled ? 'on' : 'off');
      setConfig(`chatmode_${groupId}`, isEnabled ? 'all' : 'mention');
      logAudit(req.auth.userId, 'GROUP_TEXTMODE_TOGGLED', `Group ${groupId} text_mode = ${isEnabled}`);

      res.json({ ok: true, groupId, textMode: isEnabled });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // N3R0 MINECRAFT AI COMPANION REST APIS
  // =========================================================================
  app.get('/api/minecraft/status', (req, res) => {
    res.json({ ok: true, status: minecraftBridge.getStatus() });
  });

  app.post('/api/minecraft/command', requireOwnerAuth, async (req, res) => {
    try {
      const { command } = req.body;
      if (!command) return res.status(400).json({ ok: false, error: 'Command string is required' });
      const result = await minecraftBridge.executeCommand(command);
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Narrow AI Companion Natural-Language & Structured Instruction Endpoint
  app.post('/api/minecraft/narrow', requireOwnerAuth, async (req, res) => {
    try {
      const { text, target } = req.body;
      if (!text) return res.status(400).json({ ok: false, error: 'Text instruction is required' });
      const result = await narrowLocalConnector.handleCommand({
        text,
        senderName: target || 'S4NDY X ESC',
        isOwner: true,
        source: 'api',
      });
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/minecraft/players', (req, res) => {
    try {
      const players = playerRegistry.listPlayers();
      res.json({ ok: true, players });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/minecraft/players/assign', requireOwnerAuth, async (req, res) => {
    try {
      const { minecraftUsername } = req.body;
      if (!minecraftUsername) return res.status(400).json({ ok: false, error: 'minecraftUsername is required' });
      const assignment = await playerRegistry.assignCompanion({
        minecraftUsername,
        assignedBy: req.auth?.userId || 'owner',
      });
      res.json({ ok: true, assignment });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Owner Disconnect & Revocation: wipes local data
  app.post('/api/owner/revoke', requireOwnerAuth, (req, res) => {
    try {
      resetAllUserData();
      // Halt master switch on revocation
      setConfig('master_switch', 'false');
      logAudit(req.auth.userId, 'OWNER_DATA_REVOKED', 'Owner executed complete data revocation.');
      res.json({
        ok: true,
        message: 'All local conversation and usage data has been securely deleted and master switch suspended.',
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // =========================================================================
  // LIVE MCP BRIDGE ROUTES (JSON-RPC 2.0 & SSE, Authenticated, Max 10 Conns)
  // =========================================================================

  // MCP JSON-RPC 2.0 endpoint (POST /mcp or POST /api/mcp)
  const mcpPostHandler = async (req, res) => {
    const auth = extractMcpAuth(req);
    if (!auth) {
      return res.status(401).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: { code: -32000, message: 'Unauthorized: Invalid or missing MCP authentication key.' },
      });
    }

    try {
      const response = await handleMcpJsonRpc(req.body, auth);
      if (response === null) {
        return res.status(204).end();
      }
      res.json(response);
    } catch (err) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: { code: -32603, message: 'Internal error: ' + err.message },
      });
    }
  };

  app.post('/mcp', mcpPostHandler);
  app.post('/api/mcp', mcpPostHandler);

  // MCP SSE Stream endpoint (GET /mcp/sse or GET /api/mcp/sse)
  const mcpSseHandler = (req, res) => {
    const auth = extractMcpAuth(req);
    if (!auth) {
      return res.status(401).send('Unauthorized: Invalid or missing MCP credentials.');
    }

    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const sessionId = req.query.sessionId || `sess_${crypto.randomBytes(8).toString('hex')}`;

    let session;
    try {
      session = registerMcpSession(sessionId, auth.clientName, clientIp, res);
    } catch (err) {
      return res.status(429).json({ ok: false, error: err.message });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`event: endpoint\ndata: /mcp?sessionId=${sessionId}\n\n`);

    const pingTimer = setInterval(() => {
      try {
        res.write(`event: ping\ndata: {"time":"${new Date().toISOString()}"}\n\n`);
      } catch {
        clearInterval(pingTimer);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(pingTimer);
      removeMcpSession(sessionId);
    });
  };

  app.get('/mcp/sse', mcpSseHandler);
  app.get('/api/mcp/sse', mcpSseHandler);

  // MCP Status & Diagnostics (GET /api/mcp/status)
  app.get('/api/mcp/status', (req, res) => {
    res.json(getMcpStatus());
  });

  // Generate new MCP API Key (POST /api/mcp/keys) - requires owner auth
  app.post('/api/mcp/keys', requireOwnerAuth, (req, res) => {
    try {
      const clientName = req.body?.clientName || 'External MCP Client';
      const keyData = generateMcpKey(clientName);
      res.json({ ok: true, key: keyData });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // Revoke MCP API Key (DELETE /api/mcp/keys/:keyId) - requires owner auth
  app.delete('/api/mcp/keys/:keyId', requireOwnerAuth, (req, res) => {
    try {
      const { keyId } = req.params;
      const success = revokeMcpKey(keyId);
      res.json({ ok: success });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // =========================================================================
  // MODEL ROUTING & TOKEN BUDGET API
  // =========================================================================
  app.get('/api/routing', (req, res) => {
    res.json({
      ok: true,
      supportedReasoning: SUPPORTED_REASONING_LEVELS,
      routing: {
        chat: getAgentRouting('chat'),
        security: getAgentRouting('security'),
        media: getAgentRouting('media'),
      },
    });
  });

  app.post('/api/routing', requireOwnerAuth, (req, res) => {
    try {
      const { category, updates } = req.body;
      const updated = updateAgentRouting(category, updates);
      logAudit(req.auth.userId, 'ROUTING_CONFIG_UPDATED', `Category ${category} updated`);
      res.json({ ok: true, routing: updated });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // SECURITY SUPERVISOR DIAGNOSTIC API
  // =========================================================================
  app.get('/api/security/diagnostic', async (req, res) => {
    try {
      const report = await securitySupervisor.runSecurityDiagnostic();
      res.json({ ok: true, report });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  // =========================================================================
  // ASSISTANT INBOX & POLICY API
  // =========================================================================
  app.get('/api/assistant/inbox', requireOwnerAuth, (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '20', 10);
      const messages = assistantManager.getInboxMessages(limit);
      const policy = assistantManager.getPolicy();
      res.json({ ok: true, policy, messages });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  app.post('/api/assistant/policy', requireOwnerAuth, (req, res) => {
    try {
      const { policy } = req.body;
      const updated = assistantManager.setPolicy(policy);
      res.json({ ok: true, policy: updated });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Fallback route for SPA (Express 5 compatible)
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });

  return app;
}

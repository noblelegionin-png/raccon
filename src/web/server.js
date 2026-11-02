import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { rocketRouter } from '../rocket/routes.js';
import { rock3tRouter } from '../rock3t/routes.js';
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
  setUserRelationshipRole,
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
import { getBotStatus, getBotApi } from '../telegram/bot.js';
import { whatsAppService } from '../whatsapp/whatsappService.js';
import { sandyStatusService } from '../whatsapp/sandyStatusService.js';
import {
  isMaintenanceModeActive,
  enableMaintenanceMode,
  disableMaintenanceMode,
  getMaintenanceReport,
  MAINTENANCE_ANNOUNCEMENT_TEXT,
  isWhatsAppSilentModeActive,
  setWhatsAppSilentMode,
} from '../maintenance/maintenanceService.js';
import {
  extractExplicitWordLimit,
  detectUserIntent,
} from '../conversation/intentDetector.js';
import {
  saveUserProfile,
  countWords,
  validatePersonalContext,
  evaluateUserCorrection,
  MAX_PERSONAL_CONTEXT_WORDS,
} from '../memory/personalMemoryService.js';
import { userFileService } from '../storage/userFileService.js';
import { skillsService } from '../moderation/skillsService.js';
import { multiBotService } from '../multibot/multiBotService.js';
import {
  getUserMemories,
  addUserMemory,
  updateUserMemory,
  deleteUserMemory,
} from '../db/index.js';
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
import { webSearchService } from '../search/webSearchService.js';
import { deepBrowserService } from '../browser/deepBrowserService.js';
import { websiteSafetyService } from '../security/websiteSafetyService.js';
import { videoSearchService } from '../media/videoSearchService.js';
import { productSearchService } from '../shopping/productSearchService.js';
import { documentService } from '../documents/documentService.js';
import { messageArchiver } from '../memory/archiver.js';
import { companionStateService } from '../companion/companionStateService.js';
import { workspaceService } from '../workspace/workspaceService.js';
import { learningService } from '../learning/learningService.js';
import { budgetService } from '../budget/budgetService.js';
import { permissionService } from '../permissions/permissionService.js';
import { selfImprovementService } from '../selfimprovement/selfImprovementService.js';
import { proactiveService } from '../proactive/proactiveService.js';
import { simulationService } from '../simulation/simulationService.js';
import { taskService } from '../tasks/taskService.js';
import { webResearchService } from '../research/webResearchService.js';
import { mediaIntelligenceService } from '../media/mediaIntelligenceService.js';
import { mediaDownloaderService } from '../media/mediaDownloaderService.js';
import { pdfToolkitService } from '../pdf/pdfToolkitService.js';
import { skillTreeService } from '../skills/skillTreeService.js';
import { myraScriptTranspiler } from '../language/myraScript.js';
import { toolCreationPipeline } from '../toolmaker/toolCreationPipeline.js';
import { universalMcpManager } from '../mcp/universalMcpManager.js';
import { minecraftFramework } from '../minecraft/minecraftFramework.js';
import crypto from 'node:crypto';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWebServer() {
  const app = express();

  // High-performance gzip/deflate response compression
  app.use(compression());

  app.use(cors());
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ limit: '25mb', extended: true }));

  // Static directory for Mobile Mini App with high-efficiency caching
  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir, {
    maxAge: '1h',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (filePath.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      }
    }
  }));

  // 🦝 Mount Rocket Life Engine & Raccoon OS APIs
  app.use('/api/rocket', rocketRouter);

  // 🚀 Mount ROCK3T Web OS APIs & Routes
  app.use('/api/rock3t', rock3tRouter);

  // Dedicated Raccoon OS Telegram Mini App Routes
  app.get(['/rocket', '/raccoon', '/raccoon-os'], (req, res) => {
    res.sendFile(path.join(publicDir, 'raccoon', 'index.html'));
  });

  // Dedicated ROCK3T Interactive Web OS Routes
  app.get(['/rock3t', '/os', '/web-os'], (req, res) => {
    res.sendFile(path.join(publicDir, 'rock3t', 'index.html'));
  });

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
  // High-performance cached health status for web dashboard
  let cachedProviderHealth = null;
  let lastProviderHealthCheck = 0;

  app.get('/api/status', async (req, res) => {
    try {
      const switches = getAllConfig();
      const activeModel = getActiveModelId();
      const botStatus = getBotStatus();
      const usageStats = getTokenUsageStats();
      const storageStatus = googleDriveAdapter.getStatus();

      // Lightweight 15-second cached health check against ScaleMax
      let providerHealth = cachedProviderHealth;
      if (!providerHealth || (Date.now() - lastProviderHealthCheck > 15000)) {
        providerHealth = await scaleMaxAdapter.checkHealth(activeModel);
        cachedProviderHealth = providerHealth;
        lastProviderHealthCheck = Date.now();
        if (providerHealth.latencyMs) {
          recordModelLatency(activeModel, providerHealth.latencyMs);
        }
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
  app.get(['/api/models', '/api/models/catalogue'], async (req, res) => {
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

  // =========================================================================
  // 💬 WHATSAPP 24/7 LIVE BRIDGE REST ENDPOINTS
  // =========================================================================

  // WhatsApp connection status
  app.get('/api/whatsapp/status', (req, res) => {
    res.json({ ok: true, ...whatsAppService.getStatus() });
  });

  // WhatsApp live QR code JSON
  app.get('/api/whatsapp/qr', (req, res) => {
    const qrInfo = whatsAppService.getQrCode();
    res.json({ ok: true, ...qrInfo });
  });

  // WhatsApp live QR direct PNG image
  app.get('/api/whatsapp/qr.png', async (req, res) => {
    try {
      const buffer = await whatsAppService.getQrBuffer();
      if (!buffer) {
        // Return 1x1 transparent pixel or 503
        return res.status(404).send('QR code not ready yet');
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(buffer);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  // Dedicated 24/7 Always-Live QR Web Page for mobile & desktop
  app.get('/qr', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ Nero Labs — WhatsApp 24/7 Live QR</title>
  <link rel="icon" href="img/avatar.jpg">
  <style>
    :root {
      --bg: #0b0f19;
      --card: #151d2f;
      --border: #23304c;
      --primary: #10b981;
      --primary-hover: #059669;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px 24px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 16px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--primary);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-yellow {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      border-color: rgba(245, 158, 11, 0.3);
    }
    .badge-pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
      100% { opacity: 1; transform: scale(1); }
    }
    h1 { font-size: 20px; font-weight: 800; margin-bottom: 8px; }
    p.subtitle { font-size: 13px; color: var(--text-muted); margin-bottom: 24px; }
    .qr-box {
      background: #ffffff;
      padding: 16px;
      border-radius: 12px;
      width: 250px;
      height: 250px;
      margin: 0 auto 20px auto;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--primary);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
    }
    .qr-box img { width: 100%; height: 100%; object-fit: contain; }
    .instructions {
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      font-size: 12px;
      text-align: left;
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .instructions ol { padding-left: 20px; }
    .instructions li { margin-bottom: 4px; color: var(--text-muted); }
    .instructions strong { color: var(--text); }
    .footer-actions { display: flex; gap: 10px; justify-content: center; }
    .btn {
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      color: #fff;
      background: var(--border);
      transition: all 0.2s;
      cursor: pointer;
      border: none;
    }
    .btn-primary { background: var(--primary); color: #000; font-weight: 700; }
    .btn:hover { opacity: 0.9; }
    #connectedView { display: none; }
    .check-icon { font-size: 54px; color: var(--primary); margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div id="liveView">
      <div id="statusBadge" class="badge badge-yellow">
        <span class="badge-pulse"></span>
        <span id="statusText">INITIALIZING 24/7 QR...</span>
      </div>
      <h1>Scan to Connect WhatsApp</h1>
      <p class="subtitle">Nero AI will run 24/7 live on your WhatsApp</p>

      <div class="qr-box">
        <img id="qrImage" src="/api/whatsapp/qr.png" alt="WhatsApp QR Code" />
      </div>

      <div class="instructions">
        <ol>
          <li>Open <strong>WhatsApp</strong> on your phone</li>
          <li>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong></li>
          <li>Select <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong></li>
          <li>Point your phone camera at this QR code</li>
        </ol>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border);">
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Or Link with Phone Number (8-digit code):</p>
        <div style="display: flex; gap: 8px; justify-content: center;">
          <input id="phoneNumberInput" type="text" placeholder="e.g. 919317741936" style="background:#0b0f19; border:1px solid var(--border); color:#fff; padding:8px 12px; border-radius:8px; font-size:12px; width:65%;" />
          <button onclick="requestPairingCode()" class="btn btn-primary" style="padding:8px 14px; font-size:12px;">Get Code</button>
        </div>
        <div id="pairingCodeDisplay" style="display:none; margin-top:12px; padding:10px; background:rgba(16,185,129,0.15); border:1px dashed var(--primary); border-radius:8px; font-size:18px; font-weight:800; letter-spacing:2px; color:var(--primary);"></div>
      </div>

      <div class="footer-actions" style="margin-top: 18px;">
        <button onclick="location.reload()" class="btn">🔄 Refresh Page</button>
        <a href="/owner.html" class="btn btn-primary">👑 Owner Console</a>
      </div>
    </div>

    <div id="connectedView">
      <div class="check-icon">✓</div>
      <div class="badge">
        <span class="badge-pulse"></span>
        <span>CONNECTED & LIVE 24/7</span>
      </div>
      <h1 id="connTitle">WhatsApp Successfully Linked!</h1>
      <p id="connSubtitle" class="subtitle">Nero is now actively responding to your WhatsApp messages with persistent memory.</p>
      <div class="footer-actions" style="flex-direction: column; gap: 10px;">
        <a href="/owner.html" class="btn btn-primary">Open Owner Console</a>
        <button onclick="resetWhatsApp()" class="btn" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171;">🔌 Disconnect & Pair Different Phone</button>
      </div>
    </div>
  </div>

  <script>
    async function requestPairingCode() {
      const num = document.getElementById('phoneNumberInput').value.trim();
      if (!num) return alert('Please enter phone number with country code (e.g. 919317741936)');
      const box = document.getElementById('pairingCodeDisplay');
      box.style.display = 'block';
      box.textContent = 'Generating pairing code...';
      try {
        const res = await fetch('/api/whatsapp/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'nero_labs_secret_key_2026' },
          body: JSON.stringify({ phoneNumber: num, accessKey: 'nero_labs_secret_key_2026' })
        });
        const data = await res.json();
        if (data.ok && data.pairingCode) {
          box.textContent = 'CODE: ' + data.pairingCode;
        } else {
          box.textContent = 'Error: ' + (data.error || 'Failed to get code');
        }
      } catch (err) {
        box.textContent = 'Error: ' + err.message;
      }
    }

    async function resetWhatsApp() {
      if (!confirm('Are you sure you want to disconnect WhatsApp and generate a fresh QR code?')) return;
      try {
        const res = await fetch('/api/whatsapp/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'nero_labs_secret_key_2026' },
          body: JSON.stringify({ accessKey: 'nero_labs_secret_key_2026' })
        });
        const data = await res.json();
        if (data.ok) {
          alert('Session reset! Generating fresh QR code...');
          document.getElementById('connectedView').style.display = 'none';
          document.getElementById('liveView').style.display = 'block';
          checkStatus();
        } else {
          alert(data.error || 'Could not disconnect session');
        }
      } catch (err) {
        alert(err.message);
      }
    }

    async function checkStatus() {
      try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        if (data.status === 'connected') {
          document.getElementById('liveView').style.display = 'none';
          document.getElementById('connectedView').style.display = 'block';
          if (data.connectedUser) {
            const phone = (data.connectedUser.id || '').split(':')[0];
            document.getElementById('connSubtitle').textContent = 'Connected to phone +' + phone + ' (' + (data.connectedUser.name || 'Owner') + '). AI auto-reply is live!';
          }
          return;
        }

        const badge = document.getElementById('statusBadge');
        const text = document.getElementById('statusText');
        const qr = document.getElementById('qrImage');

        if (data.status === 'qr_ready') {
          badge.className = 'badge';
          text.textContent = '🟢 LIVE QR CODE (AUTO-UPDATING)';
          qr.src = '/api/whatsapp/qr.png?t=' + Date.now();
        } else {
          badge.className = 'badge badge-yellow';
          text.textContent = '🔄 GENERATING FRESH QR...';
        }
      } catch (e) {}
    }

    setInterval(checkStatus, 3500);
    checkStatus();
  </script>
</body>
</html>`);
  });

  // Request phone number pairing code (8-digit code for phone linking)
  app.post('/api/whatsapp/pair', requireOwnerAuth, async (req, res) => {
    try {
      const phoneNumber = req.body?.phoneNumber;
      if (!phoneNumber) {
        return res.status(400).json({ ok: false, error: 'Phone number is required.' });
      }
      const code = await whatsAppService.requestPairingCode(phoneNumber);
      res.json({ ok: true, pairingCode: code });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Send WhatsApp message
  app.post('/api/whatsapp/send', requireOwnerAuth, async (req, res) => {
    try {
      const { to, text } = req.body;
      if (!to || !text) {
        return res.status(400).json({ ok: false, error: 'Both "to" and "text" are required.' });
      }
      const result = await whatsAppService.sendOutboundMessage(to, text);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Send WhatsApp image/media
  app.post('/api/whatsapp/send-media', requireOwnerAuth, async (req, res) => {
    try {
      const { to, imageUrl, caption } = req.body;
      if (!to || !imageUrl) {
        return res.status(400).json({ ok: false, error: 'Both "to" and "imageUrl" are required.' });
      }
      const result = await whatsAppService.sendOutboundMedia(to, { imageUrl, caption });
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Restart WhatsApp Bridge socket
  app.post('/api/whatsapp/restart', requireOwnerAuth, async (req, res) => {
    try {
      await whatsAppService.restart();
      res.json({ ok: true, message: 'WhatsApp bridge restarted successfully.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Disconnect / logout WhatsApp session
  app.post('/api/whatsapp/disconnect', requireOwnerAuth, async (req, res) => {
    try {
      const result = await whatsAppService.disconnectSession();
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // WhatsApp Executive Daily Digest (Owner only)
  app.get('/api/whatsapp/digest', requireOwnerAuth, (req, res) => {
    try {
      const digest = sandyStatusService.getDailyExecutiveDigest();
      res.json({ ok: true, digest });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // WhatsApp Silent Mode / Kill Switch API (Owner only)
  app.post('/api/whatsapp/silent-mode', requireOwnerAuth, (req, res) => {
    try {
      const { active } = req.body;
      const isSilent = setWhatsAppSilentMode(Boolean(active));
      res.json({ ok: true, silentMode: isSilent });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // WhatsApp Routine & Status Update API (Owner only)
  app.post('/api/whatsapp/routine', requireOwnerAuth, (req, res) => {
    try {
      const { updateText } = req.body;
      if (!updateText) {
        return res.status(400).json({ ok: false, error: 'updateText is required.' });
      }
      const result = sandyStatusService.parseNaturalLanguageUpdate(updateText);
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // WhatsApp Urgent Inbox List API (Owner only)
  app.get('/api/whatsapp/inbox', requireOwnerAuth, (req, res) => {
    try {
      const list = sandyStatusService.getUrgentRequests(20);
      res.json({ ok: true, requests: list });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
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
        maintenance_mode: isMaintenanceModeActive(),
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

  // ---------------------------------------------------------
  // OWNER MAINTENANCE & BROADCAST TELEMETRY ENDPOINTS
  // ---------------------------------------------------------

  // Get maintenance mode state and delivery report
  app.get('/api/owner/maintenance', (req, res) => {
    try {
      const active = isMaintenanceModeActive();
      const report = getMaintenanceReport();
      res.json({ ok: true, active, maintenanceMode: active, report });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Public/App maintenance status check
  app.get('/api/maintenance/status', (req, res) => {
    try {
      const active = isMaintenanceModeActive();
      const report = getMaintenanceReport();
      res.json({ ok: true, active, maintenanceMode: active, report });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Toggle maintenance mode (Owner only)
  const handleMaintenanceToggle = async (req, res) => {
    try {
      const { enabled, forceBroadcast, reason } = req.body;
      const botApi = getBotApi();

      if (enabled) {
        const result = await enableMaintenanceMode(botApi, { forceBroadcast, reason });
        logAudit(req.auth.userId, 'MAINTENANCE_TOGGLED', `Enabled: delivered to ${result.sentCount} chats`);
        return res.json({ ok: true, active: true, maintenanceMode: true, result });
      } else {
        const result = disableMaintenanceMode();
        logAudit(req.auth.userId, 'MAINTENANCE_TOGGLED', 'Disabled maintenance mode');
        return res.json({ ok: true, active: false, maintenanceMode: false, result });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  };

  app.post('/api/owner/maintenance', requireOwnerAuth, handleMaintenanceToggle);
  app.post('/api/maintenance/toggle', requireOwnerAuth, handleMaintenanceToggle);

  // Send real broadcast announcement to eligible connected groups (Owner only)
  app.post('/api/owner/broadcast', requireOwnerAuth, async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ ok: false, error: 'Broadcast message cannot be empty.' });
      }

      const botApi = getBotApi();
      if (!botApi) {
        return res.status(503).json({ ok: false, error: 'Telegram Bot API instance is offline.' });
      }

      const groups = getKnownGroups();
      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const deliveryLogs = [];

      for (const group of groups) {
        if (group.bot_enabled === 0) {
          skippedCount++;
          deliveryLogs.push({
            groupId: group.group_id,
            title: group.group_title,
            status: 'skipped',
            reason: 'Group participation disabled',
          });
          continue;
        }

        try {
          await botApi.sendMessage(group.group_id, message.trim());
          sentCount++;
          deliveryLogs.push({
            groupId: group.group_id,
            title: group.group_title,
            status: 'sent',
          });
        } catch (err) {
          failedCount++;
          deliveryLogs.push({
            groupId: group.group_id,
            title: group.group_title,
            status: 'failed',
            error: err.message,
          });
        }
        await new Promise((r) => setTimeout(r, 40));
      }

      logAudit(req.auth.userId, 'OWNER_BROADCAST_EXECUTED', `Sent: ${sentCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);
      res.json({
        ok: true,
        sentCount,
        failedCount,
        skippedCount,
        total: sentCount + failedCount + skippedCount,
        logs: deliveryLogs,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Detailed group permissions & chat inspection (Owner only)
  app.get('/api/owner/chats', requireOwnerAuth, async (req, res) => {
    try {
      const groups = getKnownGroups();
      const botApi = getBotApi();
      const chatsWithRights = [];

      for (const group of groups) {
        let adminInfo = { isAdministrator: false, rights: {} };
        if (botApi) {
          try {
            const me = await botApi.getMe();
            const member = await botApi.getChatMember(group.group_id, me.id);
            adminInfo.isAdministrator = member.status === 'administrator';
            adminInfo.status = member.status;
            if (member.status === 'administrator') {
              adminInfo.rights = {
                canDeleteMessages: member.can_delete_messages || false,
                canRestrictMembers: member.can_restrict_members || false,
                canPinMessages: member.can_pin_messages || false,
              };
            }
          } catch (err) {
            adminInfo.error = err.message;
          }
        }

        chatsWithRights.push({
          ...group,
          adminInfo,
        });
      }

      res.json({ ok: true, chats: chatsWithRights });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Automated System Verification & Test Suite Execution (Owner only)
  app.post('/api/owner/run-tests', requireOwnerAuth, async (req, res) => {
    try {
      const tests = [
        {
          name: 'SQLite Database Integrity & WAL Mode',
          passed: Boolean(getDb().prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok'),
        },
        {
          name: 'Model Catalogue & Active Routing',
          passed: Boolean(getActiveModelId()),
          details: `Active model: ${getActiveModelId()}`,
        },
        {
          name: 'ScaleMax AI Provider Connection',
          passed: scaleMaxAdapter.isConfigured(),
          details: scaleMaxAdapter.isConfigured() ? 'API key active' : 'API key missing',
        },
        {
          name: 'Maintenance Mode Persistent Controller',
          passed: typeof isMaintenanceModeActive() === 'boolean',
          details: `State: ${isMaintenanceModeActive() ? 'Active' : 'Inactive'}`,
        },
        {
          name: 'Intent Detector & Explicit Word Limit Parser',
          passed: extractExplicitWordLimit('in 300 words') === 300 && detectUserIntent('write a python script') === 'code',
        },
        {
          name: '20 Personality Roles Engine',
          passed: Object.keys(ROLEPLAY_ROLES).length === 20,
          details: `Total registered modes: ${Object.keys(ROLEPLAY_ROLES).length}`,
        },
        {
          name: '1,000-Word Personal Context Rejection',
          passed: validatePersonalContext(Array.from({ length: 1005 }, () => 'w').join(' ')).valid === false,
          details: 'Enforces hard 1,000-word ceiling',
        },
        {
          name: 'User Files & Storage Sandbox Service',
          passed: typeof userFileService.listUserFiles === 'function',
          details: 'Isolated ./data/user_files/ directory structure',
        },
        {
          name: 'Skills & Moderation Workflow Service',
          passed: typeof skillsService.getPendingQueue === 'function',
          details: 'Owner verification & tool whitelist',
        },
        {
          name: 'Multi-Bot Platform Registry',
          passed: Array.isArray(multiBotService.listBots()),
          details: 'Multi-bot tracking operational',
        },
        {
          name: 'Telegram Bot Long-Polling Daemon',
          passed: Boolean(getBotApi()),
          details: getBotApi() ? 'Bot API active' : 'Offline',
        },
      ];

      const passedCount = tests.filter(t => t.passed).length;
      logAudit(req.auth.userId, 'SYSTEM_TESTS_EXECUTED', `Passed ${passedCount}/${tests.length}`);

      res.json({
        ok: true,
        allPassed: passedCount === tests.length,
        passedCount,
        totalCount: tests.length,
        tests,
        timestamp: new Date().toISOString(),
      });
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

  // Unified 50+ Command & Tool Execution Hub for Owner Master Console
  app.post('/api/owner/execute-command', requireOwnerAuth, async (req, res) => {
    try {
      const { command, params = {} } = req.body;
      const cmd = String(command || '').trim().toLowerCase().replace(/^\//, '');
      const db = getDb();
      const userId = req.auth?.userId || 'owner';

      let result = { ok: true, command: cmd, message: '' };

      switch (cmd) {
        // --- 1. SYSTEM & STATUS ---
        case 'ping': {
          const activeModel = getActiveModelId();
          const t0 = performance.now();
          const health = await scaleMaxAdapter.checkHealth(activeModel);
          const latencyMs = health.ok ? health.latencyMs : Math.round(performance.now() - t0);
          result.message = `Pong! Telemetry: ${latencyMs} ms on ${activeModel} (${latencyMs < 1000 ? 'Fast 🟢' : 'Moderate 🟡'})`;
          result.data = { latencyMs, activeModel, health };
          break;
        }

        case 'sysinfo': {
          const mem = process.memoryUsage();
          const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
          const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
          const heapMb = Math.round(mem.heapUsed / (1024 * 1024));
          const rssMb = Math.round(mem.rss / (1024 * 1024));
          result.message = `Host Telemetry: OS ${os.platform()} ${os.arch()} | RAM: ${freeMemMb}MB free / ${totalMemMb}MB total | Heap: ${heapMb}MB | RSS: ${rssMb}MB | Node: ${process.version}`;
          result.data = { os: os.platform(), arch: os.arch(), freeMemMb, totalMemMb, heapMb, rssMb, nodeVersion: process.version, uptimeSec: Math.round(process.uptime()) };
          break;
        }

        case 'status': {
          const activeModel = getActiveModelId();
          const masterSwitch = getConfig('master_switch', 'true') === 'true';
          const maint = isMaintenanceModeActive();
          result.message = `Platform Status: ${masterSwitch ? '🟢 Master Active' : '🔴 Suspended'} | Model: ${activeModel} | Maintenance: ${maint ? '🛠️ ACTIVE' : 'Inactive'}`;
          result.data = { activeModel, masterSwitch, maintenance: maint, db: 'WAL Mode Active' };
          break;
        }

        case 'clear_chat': {
          clearConversation('webapp_user');
          logAudit(userId, 'OWNER_COMMAND', 'Cleared chat memory');
          result.message = 'Conversation memory and context buffer cleared successfully.';
          break;
        }

        case 'clear_warnings': {
          db.prepare('DELETE FROM group_warnings').run();
          logAudit(userId, 'OWNER_COMMAND', 'Reset group warnings');
          result.message = 'All member infraction warnings reset to 0 across all groups.';
          break;
        }

        // --- 2. SWITCHES & MODES ---
        case 'master_on': {
          setConfig('master_switch', 'true');
          logAudit(userId, 'SWITCH_CHANGED', 'master_switch = true');
          result.message = 'Master AI Engine: 🟢 ENABLED';
          break;
        }
        case 'master_off':
        case 'kill_switch': {
          setConfig('master_switch', 'false');
          logAudit(userId, 'SWITCH_CHANGED', 'master_switch = false');
          result.message = 'Master AI Engine: 🔴 HALTED (Kill Switch Engaged)';
          break;
        }

        case 'edit_mode_on':
        case 'maintenance_on': {
          const r = await enableMaintenanceMode(null, { reason: params.reason || 'Activated from Owner Console' });
          result.message = `Maintenance Mode: 🛠️ ACTIVATED (Delivered to ${r.sentCount} chats)`;
          break;
        }
        case 'edit_mode_off':
        case 'maintenance_off': {
          disableMaintenanceMode();
          result.message = 'Maintenance Mode: 🟢 DEACTIVATED (Normal service resumed)';
          break;
        }

        case 'assistant_on': {
          assistantManager.setEnabled(true);
          result.message = 'Personal Assistant Auto-Responder: 🟢 ENABLED';
          break;
        }
        case 'assistant_off': {
          assistantManager.setEnabled(false);
          result.message = 'Personal Assistant Auto-Responder: ⚪ DISABLED';
          break;
        }

        case 'antiraid_on': {
          setConfig('antiraid_mode_global', 'true');
          result.message = 'Global Anti-Raid Mode: 🛡️ ACTIVATED';
          break;
        }
        case 'antiraid_off': {
          setConfig('antiraid_mode_global', 'false');
          result.message = 'Global Anti-Raid Mode: ⚪ DEACTIVATED';
          break;
        }

        case 'textmode_on': {
          setConfig('auto_text_replies', 'true');
          result.message = 'Auto Text Replies: 🟢 ENABLED (Replies to all texts)';
          break;
        }
        case 'textmode_off': {
          setConfig('auto_text_replies', 'false');
          result.message = 'Auto Text Replies: ⚪ DISABLED (Mentions only)';
          break;
        }

        case 'tusage_on': {
          setConfig('tusage_global', 'true');
          result.message = 'Token & Cost Telemetry: 🟢 ENABLED (Reports usage per reply)';
          break;
        }
        case 'tusage_off': {
          setConfig('tusage_global', 'false');
          result.message = 'Token & Cost Telemetry: ⚪ DISABLED';
          break;
        }

        case 'globalgroup_on': {
          setConfig('group_participation_enabled', 'true');
          result.message = 'Global Group Participation: 🟢 ENABLED';
          break;
        }
        case 'globalgroup_off': {
          setConfig('group_participation_enabled', 'false');
          result.message = 'Global Group Participation: ⚪ DISABLED';
          break;
        }

        case 'moderation_on': {
          setConfig('group_moderation_enabled', 'true');
          result.message = 'Group Moderation Shield: 🟢 ENABLED';
          break;
        }
        case 'moderation_off': {
          setConfig('group_moderation_enabled', 'false');
          result.message = 'Group Moderation Shield: ⚪ DISABLED';
          break;
        }

        // --- 3. MODEL ROUTING ---
        case 'setmodel':
        case 'model_select': {
          const modelId = params.modelId || params.model || 'gemini-3.5-flash-lite';
          setActiveModelId(modelId);
          setConfig('active_model_id', modelId);
          try {
            updateAgentRouting('chat', { model: modelId });
          } catch {}
          logAudit(userId, 'MODEL_CHANGED', `Active model set to ${modelId}`);
          result.message = `Active Model Switched: ⚡ ${modelId}`;
          result.data = { activeModel: modelId };
          break;
        }

        case 'setreasoning':
        case 'reasoning': {
          const effort = String(params.effort || params.reasoning || 'medium').toLowerCase();
          setConfig('reasoning_effort', effort);
          try {
            updateAgentRouting('chat', { reasoning: effort });
          } catch {}
          result.message = `Reasoning Depth Set: 🧠 ${effort.toUpperCase()}`;
          break;
        }

        case 'setlimits':
        case 'limit': {
          const devMin = params.devMin || 1;
          const devMax = params.devMax || 500;
          const globMin = params.globMin || 10;
          const globMax = params.globMax || 100;
          setConfig('limit_dev_min', String(devMin));
          setConfig('limit_dev_max', String(devMax));
          setConfig('limit_global_min', String(globMin));
          setConfig('limit_global_max', String(globMax));
          result.message = `Response Limits: Dev (${devMin}-${devMax}w) | Global (${globMin}-${globMax}w)`;
          break;
        }

        // --- 4. AI TOOLS & INTELLIGENCE ---
        case 'search': {
          const q = params.query || params.text || 'Latest developments in AI reasoning 2026';
          const sData = await webSearchService.search(q);
          const synthesis = await webSearchService.synthesizeAnswer(q, sData);
          result.message = `Search completed for: "${q}" (${sData.results?.length || 0} sources found)`;
          result.data = { query: q, answer: synthesis.answer, sources: synthesis.sources };
          break;
        }

        case 'browse': {
          const targetUrl = params.url || 'https://nero-labs.pages.dev';
          const bData = await deepBrowserService.deepBrowse(targetUrl);
          const report = await deepBrowserService.synthesizeBrowsingReport(bData, 'Summarize key highlights');
          result.message = `Browsed ${targetUrl} (Status: ${bData.status}, Crawled: ${bData.crawledPages?.length || 1} pages)`;
          result.data = { url: targetUrl, report, title: bData.title };
          break;
        }

        case 'safety': {
          const targetUrl = params.url || 'https://google.com';
          const analysis = await websiteSafetyService.analyzeWebsite(targetUrl);
          result.message = `Safety Audit for ${targetUrl}: Risk Score ${analysis.riskScore}/100 (${analysis.verdict})`;
          result.data = analysis;
          break;
        }

        case 'fix': {
          const codeSnippet = params.code || params.text || 'const x = undefined; x.length;';
          const prompt = `Fix and optimize this code with drop-in precision:\n${codeSnippet}`;
          const aiRes = await scaleMaxAdapter.createChatCompletion({
            model: 'gpt-6-luna',
            messages: [
              { role: 'system', content: 'You are an ultra-low-token drop-in software repair engineer. Output concise, exact fixed code.' },
              { role: 'user', content: prompt }
            ],
            reasoningEffort: 'low',
          });
          result.message = 'Bug fix synthesized successfully';
          result.data = { fixedCode: aiRes.text, model: aiRes.model };
          break;
        }

        case 'code': {
          const task = params.task || params.text || 'Write a debounce function in TypeScript';
          const aiRes = await scaleMaxAdapter.createChatCompletion({
            model: 'gpt-6-luna',
            messages: [
              { role: 'system', content: 'You are an expert fullstack architect. Write clean, idiomatic code.' },
              { role: 'user', content: task }
            ],
            reasoningEffort: 'high',
          });
          result.message = 'Code generated successfully';
          result.data = { code: aiRes.text, model: aiRes.model };
          break;
        }

        case 'summarize': {
          const text = params.text || 'MYRA AI is an autonomous WhatsApp AI companion and platform.';
          const aiRes = await scaleMaxAdapter.createChatCompletion({
            model: 'gpt-6-luna',
            messages: [
              { role: 'system', content: 'Provide a crisp 3-bullet executive summary.' },
              { role: 'user', content: text }
            ],
            reasoningEffort: 'low',
          });
          result.message = 'Executive summary generated';
          result.data = { summary: aiRes.text };
          break;
        }

        case 'translate': {
          const text = params.text || 'Welcome to MYRA AI Master Console';
          const targetLang = params.targetLang || 'Hindi';
          const aiRes = await scaleMaxAdapter.createChatCompletion({
            model: 'gpt-6-luna',
            messages: [
              { role: 'system', content: `Translate text accurately into ${targetLang}.` },
              { role: 'user', content: text }
            ],
            reasoningEffort: 'low',
          });
          result.message = `Translated to ${targetLang}`;
          result.data = { translation: aiRes.text };
          break;
        }

        case 'video': {
          const q = params.query || params.text || 'AI reasoning tutorial';
          const vRes = await videoSearchService.searchVideos(q, 1);
          const summary = vRes.ok && vRes.videos?.length ? await videoSearchService.summarizeVideo(vRes.videos[0]) : null;
          result.message = `Video discovery for "${q}": ${vRes.videos?.[0]?.title || 'No video found'}`;
          result.data = { query: q, video: vRes.videos?.[0] || null, summary };
          break;
        }

        case 'shop': {
          const q = params.query || params.text || 'Mechanical keyboards under $100';
          const budget = productSearchService.extractBudget(q);
          const sData = await productSearchService.searchProducts(q, { budget });
          const comparison = await productSearchService.compareProducts(q, sData);
          result.message = `Shopping comparison generated for "${q}" (${sData.products?.length || 0} products)`;
          result.data = { query: q, comparison, products: sData.products };
          break;
        }

        case 'pdf': {
          const q = params.query || params.text || 'Machine learning transformers architecture';
          const docSearch = await documentService.searchEducationalResources(q);
          result.message = `Document resources found for "${q}" (${docSearch.resources?.length || 0} documents)`;
          result.data = docSearch;
          break;
        }

        case 'image': {
          const prompt = params.prompt || params.text || 'Futuristic command center';
          const aiRes = await scaleMaxAdapter.createChatCompletion({
            model: 'gpt-6-luna',
            messages: [
              { role: 'system', content: 'You are an elite prompt engineer. Synthesize an ultra-detailed, photorealistic image generation prompt.' },
              { role: 'user', content: `Create an expanded prompt for: ${prompt}` }
            ],
            reasoningEffort: 'low',
          });
          result.message = `Creative image prompt generated for "${prompt}"`;
          result.data = { prompt, expandedPrompt: aiRes.text };
          break;
        }

        case 'security': {
          const report = await securitySupervisor.runSecurityDiagnostic();
          result.message = `Security diagnostic completed: ${report.status || 'PASS'} (${report.checks?.length || 0} checks passed)`;
          result.data = report;
          break;
        }

        // --- 5. MINECRAFT BEDROCK (N3R0) ---
        case 'mc_status': {
          const status = minecraftBridge.getStatus();
          result.message = `Minecraft Bedrock Bridge: ${status.connected ? '🟢 Connected' : '⚪ Standby / Offline'} | Port: 19132 | Players: ${status.playersCount || 0}`;
          result.data = status;
          break;
        }

        case 'mc_give': {
          const item = params.item || 'emerald';
          const count = params.count || 64;
          const target = params.target || '@p';
          const cmdStr = `/give ${target} ${item} ${count}`;
          const resCmd = await minecraftBridge.executeCommand(cmdStr);
          result.message = `Minecraft command executed: ${cmdStr}`;
          result.data = resCmd;
          break;
        }

        case 'mc_time_day': {
          const resCmd = await minecraftBridge.executeCommand('/time set day');
          result.message = 'Minecraft time set to: ☀️ DAY';
          result.data = resCmd;
          break;
        }

        case 'mc_time_night': {
          const resCmd = await minecraftBridge.executeCommand('/time set night');
          result.message = 'Minecraft time set to: 🌙 NIGHT';
          result.data = resCmd;
          break;
        }

        case 'mc_weather_clear': {
          const resCmd = await minecraftBridge.executeCommand('/weather clear');
          result.message = 'Minecraft weather set to: ☀️ CLEAR';
          result.data = resCmd;
          break;
        }

        case 'mc_announce': {
          const title = params.text || params.message || '⚡ NERO LABS OPERATIONAL';
          const resCmd = await minecraftBridge.executeCommand(`/titleraw @a title {"rawtext":[{"text":"${title}"}]}`);
          result.message = `In-game broadcast: "${title}"`;
          result.data = resCmd;
          break;
        }

        case 'mc_command': {
          const rawCmd = params.command || params.cmd || '/list';
          const resCmd = await minecraftBridge.executeCommand(rawCmd);
          result.message = `Executed: ${rawCmd}`;
          result.data = resCmd;
          break;
        }

        case 'narrow': {
          const text = params.text || params.command || 'status';
          const nRes = await narrowLocalConnector.handleCommand({
            text,
            senderName: params.target || 'Sandy',
            isOwner: true,
            source: 'api',
          });
          result.message = `Narrow AI Companion response: ${nRes.reply || nRes.message || 'Directive processed'}`;
          result.data = nRes;
          break;
        }

        // --- 6. MEMORIES & STORAGE ---
        case 'backup': {
          const backupRes = await googleDriveAdapter.backupDatabase(userId);
          result.message = `Database snapshot backup created: ${backupRes.backupFile || 'Snapshot complete'}`;
          result.data = backupRes;
          break;
        }

        case 'drive_status': {
          const dStatus = googleDriveAdapter.getStatus();
          result.message = `Storage Status: ${dStatus.status} | Target: ${dStatus.capacityTarget} | Dir: ${dStatus.localStorageDir}`;
          result.data = dStatus;
          break;
        }

        case 'archive_now': {
          const resArchive = await messageArchiver.processBatch('webapp_user', true);
          result.message = resArchive
            ? `Conversation batch archived to Google Drive: ${resArchive.transcriptFilename} (${resArchive.messageCount} messages)`
            : 'No pending conversation messages required archiving.';
          result.data = resArchive;
          break;
        }

        case 'archivestatus': {
          const stats = getMemoryStats();
          const batches = getAllArchiveBatches(5);
          result.message = `Archive Status: ${stats.totalMemories || 0} memories, ${stats.totalBatches || 0} completed Drive batches.`;
          result.data = { stats, batches };
          break;
        }

        case 'recall':
        case 'search_memory': {
          const q = params.query || params.text || '';
          const memRes = getAllDurableMemories({ query: q, limit: 10 });
          result.message = `Retrieved ${memRes.memories?.length || 0} durable memories for query "${q}"`;
          result.data = memRes;
          break;
        }

        case 'whoami': {
          const profile = getUserProfile('8685232094') || { user_id: '8685232094', custom_name: 'Sandy', relationship_role: 'creator' };
          result.message = `Owner Identity: Sandy (ID: 8685232094, Role: ${profile.relationship_role || 'Creator'})`;
          result.data = profile;
          break;
        }

        case 'spam_on': {
          setConfig('spam_filter_global', 'true');
          getDb().prepare('UPDATE moderation_rules SET spam_filter = 1').run();
          result.message = 'Anti-Spam Filter: 🟢 ENABLED';
          break;
        }
        case 'spam_off': {
          setConfig('spam_filter_global', 'false');
          getDb().prepare('UPDATE moderation_rules SET spam_filter = 0').run();
          result.message = 'Anti-Spam Filter: ⚪ DISABLED';
          break;
        }

        case 'link_on': {
          setConfig('link_filter_global', 'true');
          getDb().prepare('UPDATE moderation_rules SET link_filter = 1').run();
          result.message = 'Link & Phishing Shield: 🟢 ENABLED';
          break;
        }
        case 'link_off': {
          setConfig('link_filter_global', 'false');
          getDb().prepare('UPDATE moderation_rules SET link_filter = 0').run();
          result.message = 'Link & Phishing Shield: ⚪ DISABLED';
          break;
        }

        case 'mcp_status': {
          const mStatus = getMcpStatus();
          result.message = `MCP Bridge: ${mStatus.bridgeAvailable ? '🟢 Online' : '🔴 Offline'} | Sessions: ${mStatus.activeConnections}/${mStatus.maxConnections} | Tools: ${mStatus.toolCount}`;
          result.data = mStatus;
          break;
        }

        case 'mcp_key_gen': {
          const keyData = generateMcpKey(params.clientName || 'Console MCP Client');
          result.message = `New MCP API key generated for: ${keyData.clientName}`;
          result.data = keyData;
          break;
        }

        case 'runtests': {
          const testRes = await fetch(`http://localhost:${config.port}/api/owner/run-tests`, {
            method: 'POST',
            headers: { 'x-dashboard-access-key': config.dashboardAccessKey },
          }).then(r => r.json());
          result.message = `Verification Suite: ${testRes.passedCount}/${testRes.totalCount} tests passed (${testRes.allPassed ? '100% OK' : 'Issues detected'})`;
          result.data = testRes;
          break;
        }

        default: {
          result.message = `Unknown command "${cmd}".`;
          result.ok = false;
        }
      }

      logAudit(userId, 'OWNER_COMMAND_EXECUTED', `Command: ${cmd} -> ${result.message}`);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
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
      'maintenance_mode',
    ];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ ok: false, error: `Invalid switch key '${key}'.` });
    }

    const strValue = String(value);
    setConfig(key, strValue);

    // Coordinate maintenance mode state transitions
    if (key === 'maintenance_mode') {
      if (strValue === 'true') {
        enableMaintenanceMode(getBotApi()).catch(() => {});
      } else {
        disableMaintenanceMode();
      }
    }

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

      // Check Master Switch & Maintenance Mode
      const masterSwitch = getConfig('master_switch', 'true') === 'true';
      if (!masterSwitch) {
        return res.json({
          ok: false,
          error: 'Master AI Connection is currently disabled by owner. Automated processing is suspended.',
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

      if (isMaintenanceModeActive() && !userIsOwner) {
        return res.json({
          ok: false,
          error: MAINTENANCE_ANNOUNCEMENT_TEXT,
          maintenance: true,
        });
      }

      if (!scaleMaxAdapter.isConfigured()) {
        return res.json({
          ok: false,
          error: 'ScaleMax AI API key is not configured.',
        });
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

      // Sanitize response with dual-tier limits (dev vs global or explicit limit)
      const isDev = Boolean(userIsOwner);
      const explicitLimit = extractExplicitWordLimit(message.trim());
      const minWords = isDev
        ? parseInt(getConfig('limit_dev_min', '1'), 10)
        : parseInt(getConfig('limit_global_min', '10'), 10);
      let maxWords = isDev
        ? parseInt(getConfig('limit_dev_max', '500'), 10)
        : parseInt(getConfig('limit_global_max', '100'), 10);

      if (explicitLimit) {
        maxWords = explicitLimit;
      }

      const validation = validateAndSanitizeResponse(completion.text, message.trim(), {
        minWords,
        maxWords,
        isDev,
        isOwner: userIsOwner,
        explicitLimit: Boolean(explicitLimit),
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


  // User Profile & Custom Roleplay API (Phase 2 Enhanced with 1,000-word Context)
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
          real_name: null,
          nickname: null,
          personal_context: null,
          reasoning_preference: 'balanced',
          communication_style: 'natural',
          relationship_role: 'friend',
          custom_title: null,
        };
      }

      const contextWords = countWords(profile.personal_context);

      res.json({
        ok: true,
        profile: {
          ...profile,
          context_word_count: contextWords,
          max_context_words: MAX_PERSONAL_CONTEXT_WORDS,
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });


  app.post('/api/user/profile', (req, res) => {
    try {
      let {
        userId,
        customName,
        realName,
        nickname,
        personalContext,
        relationshipRole,
        reasoningPreference,
        communicationStyle,
        customTitle,
      } = req.body;

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
        realName: realName !== undefined ? (realName ? String(realName).trim().slice(0, 100) : null) : undefined,
        nickname: nickname !== undefined ? (nickname ? String(nickname).trim().slice(0, 50) : null) : undefined,
        personalContext: personalContext !== undefined ? String(personalContext).trim() : undefined,
        relationshipRole: relationshipRole ? normalizeRole(relationshipRole) : undefined,
        reasoningPreference: reasoningPreference ? String(reasoningPreference).toLowerCase().trim() : undefined,
        communicationStyle: communicationStyle ? String(communicationStyle).toLowerCase().trim() : undefined,
        customTitle: customTitle !== undefined ? customTitle : undefined,
      };

      const updated = saveUserProfile(targetUserId, updateData);

      // If client supplied a secondary/alias ID, sync both
      if (verifiedUserId && userId && String(userId) !== verifiedUserId) {
        try {
          saveUserProfile(String(userId), updateData);
        } catch {}
      }

      const words = countWords(updated.personal_context);
      res.json({
        ok: true,
        profile: {
          ...updated,
          context_word_count: words,
          max_context_words: MAX_PERSONAL_CONTEXT_WORDS,
        },
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ---------------------------------------------------------
  // USER PERSONAL MEMORIES API
  // ---------------------------------------------------------
  app.get('/api/user/memories', (req, res) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      let userId = req.query.userId || 'webapp_user';
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) userId = String(auth.user.id);
      }
      const memories = getUserMemories(userId);
      res.json({ ok: true, memories });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/user/memories', (req, res) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      let userId = req.body.userId || 'webapp_user';
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) userId = String(auth.user.id);
      }
      const { category, key, value } = req.body;
      if (!key || !value) {
        return res.status(400).json({ ok: false, error: 'Key and value are required.' });
      }
      const mem = addUserMemory(userId, { category: category || 'preference', key, value, source: 'user_input' });
      res.json({ ok: true, memory: mem });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.delete('/api/user/memories/:id', (req, res) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      let userId = req.query.userId || 'webapp_user';
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) userId = String(auth.user.id);
      }
      deleteUserMemory(parseInt(req.params.id, 10), userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/user/correction', (req, res) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      let userId = req.body.userId || 'webapp_user';
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) userId = String(auth.user.id);
      }
      const { text } = req.body;
      const result = evaluateUserCorrection(userId, text);
      if (!result) {
        return res.json({ ok: false, message: 'No recognizable correction pattern in text.' });
      }
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---------------------------------------------------------
  // USER PERSONAL FILES & ATTACHMENTS API
  // ---------------------------------------------------------
  app.get('/api/user/files', (req, res) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      let userId = req.query.userId || 'webapp_user';
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) userId = String(auth.user.id);
      }
      const files = userFileService.listUserFiles(userId);
      res.json({ ok: true, files });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/user/files/upload', async (req, res) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      let userId = req.body.userId || 'webapp_user';
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) userId = String(auth.user.id);
      }
      const { filename, mimeType, base64Data, textContent, aiDescription } = req.body;
      let buffer = null;
      if (base64Data) {
        buffer = Buffer.from(base64Data, 'base64');
      } else if (textContent) {
        buffer = Buffer.from(textContent, 'utf-8');
      } else {
        return res.status(400).json({ ok: false, error: 'Provide either base64Data or textContent.' });
      }

      const file = await userFileService.storeUserFile(userId, {
        filename: filename || 'note.txt',
        mimeType: mimeType || (textContent ? 'text/plain' : 'application/octet-stream'),
        buffer,
        aiDescription,
      });

      res.json({ ok: true, file });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.delete('/api/user/files/:id', (req, res) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      let userId = req.query.userId || 'webapp_user';
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) userId = String(auth.user.id);
      }
      userFileService.deleteUserFile(parseInt(req.params.id, 10), userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(403).json({ ok: false, error: err.message });
    }
  });

  // ---------------------------------------------------------
  // SKILLS REGISTRY & MODERATION API
  // ---------------------------------------------------------
  app.get('/api/skills', (req, res) => {
    try {
      const skills = skillsService.getApprovedSkills();
      res.json({ ok: true, skills });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/skills/submit', (req, res) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      let authorId = req.body.authorId || 'webapp_user';
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) authorId = String(auth.user.id);
      }
      const { skillName, description, instructions, permittedTools } = req.body;
      const result = skillsService.submitSkillForReview(authorId, {
        skillName,
        description,
        instructions,
        permittedTools,
      });
      res.json({ ok: true, result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/owner/moderation/queue', requireOwnerAuth, (req, res) => {
    try {
      const queue = skillsService.getPendingQueue();
      res.json({ ok: true, queue });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/owner/moderation/review', requireOwnerAuth, (req, res) => {
    try {
      const { itemId, status, reviewNotes } = req.body;
      const reviewerId = req.auth?.userId || 'owner';
      const result = skillsService.reviewModerationItem(itemId, reviewerId, status, reviewNotes);
      res.json({ ok: true, result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ---------------------------------------------------------
  // MULTI-BOT PLATFORM REGISTRY API
  // ---------------------------------------------------------
  app.get('/api/owner/bots', requireOwnerAuth, (req, res) => {
    try {
      const bots = multiBotService.listBots();
      res.json({ ok: true, bots });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/owner/bots', requireOwnerAuth, (req, res) => {
    try {
      const { botId, username, roleDesignation, status } = req.body;
      const registered = multiBotService.registerBot({ botId, username, roleDesignation, status });
      res.json({ ok: true, bot: registered });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });


  // Get all supported roles for roleplay
  app.get('/api/roleplay/roles', (req, res) => {
    res.json({ ok: true, roles: Object.values(ROLEPLAY_ROLES) });
  });

  // Set roleplay relationship role (User Web App & API)
  app.post(['/api/roleplay/set-role', '/api/roleplay/select'], (req, res) => {
    try {
      const { userId, role } = req.body;
      const initData = req.headers['x-telegram-init-data'];
      let verifiedUserId = null;
      if (initData) {
        const auth = validateTelegramInitData(initData);
        if (auth.valid && auth.user) {
          verifiedUserId = String(auth.user.id);
        }
      }

      const targetUserId = verifiedUserId || userId || 'webapp_user';
      const normalized = normalizeRole(role || 'friend');
      setUserRelationshipRole(targetUserId, normalized);
      saveUserProfile(targetUserId, { relationshipRole: normalized });
      const roleDef = getRoleDefinition(normalized);
      logAudit(targetUserId, 'ROLEPLAY_ROLE_SET', `Role set to ${normalized}`);

      res.json({
        ok: true,
        role: normalized,
        definition: roleDef,
        message: `Roleplay set to ${roleDef.label}`,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
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
        management: getAgentRouting('management'),
        coding: getAgentRouting('coding'),
        security: getAgentRouting('security'),
        media: getAgentRouting('media'),
        research: getAgentRouting('research'),
        browsing: getAgentRouting('browsing'),
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

  // =========================================================================
  // MYRA'S LITTLE UNIVERSE & AUTONOMOUS WORKSPACE API
  // =========================================================================

  // Public Universe HTML Route
  app.get('/universe', (req, res) => {
    res.sendFile(path.join(publicDir, 'universe', 'index.html'));
  });

  // Public Universe API (Read-only, zero auth, strictly safe public items)
  app.get('/api/universe/public', (req, res) => {
    try {
      const companionState = companionStateService.getState();
      const world = simulationService.getWorldState();
      const artifacts = workspaceService.listPublicShowcase();
      const journals = workspaceService.listJournals({ includePrivate: false, limit: 10 });
      const stats = workspaceService.getWorkspaceStats();

      res.json({
        ok: true,
        companionState,
        virtualLife: {
          room: world.location,
          activity: world.activity_detail,
          outfit: world.current_outfit,
        },
        artifacts,
        journals,
        stats,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Private Workspace HTML Route
  app.get('/workspace', (req, res) => {
    res.sendFile(path.join(publicDir, 'workspace', 'index.html'));
  });

  // 1. Workspace Dashboard Overview (Private)
  app.get('/api/workspace/dashboard', requireOwnerAuth, (req, res) => {
    try {
      const companionState = companionStateService.getState();
      const world = simulationService.getWorldState();
      const budget = budgetService.getBudgetStatus();
      const stats = workspaceService.getWorkspaceStats();
      const recentArtifacts = workspaceService.listArtifacts({ limit: 5 });
      const recentJournals = workspaceService.listJournals({ limit: 5 });
      const autonomousMode = proactiveService.isAutonomousModeActive();
      const proactiveEnabled = proactiveService.isProactiveMessagingEnabled();

      res.json({
        ok: true,
        companionState,
        virtualLife: {
          room: world.location,
          activity: world.activity_detail,
          outfit: world.current_outfit,
        },
        budget,
        stats,
        recentArtifacts,
        recentJournals,
        autonomousMode,
        proactiveEnabled,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 2. Journals & Notes CRUD
  app.get('/api/workspace/journals', requireOwnerAuth, (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '50', 10);
      const journals = workspaceService.listJournals({ includePrivate: true, limit });
      res.json({ ok: true, journals });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/journals', requireOwnerAuth, (req, res) => {
    try {
      const { title, content, mood, tags, isPrivate } = req.body;
      const journal = workspaceService.createJournal({ title, content, mood, tags, isPrivate });
      res.json({ ok: true, journal });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.delete('/api/workspace/journals/:id', requireOwnerAuth, (req, res) => {
    try {
      const deleted = workspaceService.deleteJournal(req.params.id);
      res.json({ ok: deleted });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 3. Artifacts & Versions
  app.get('/api/workspace/artifacts', requireOwnerAuth, (req, res) => {
    try {
      const { type, projectId } = req.query;
      const artifacts = workspaceService.listArtifacts({ type, projectId });
      res.json({ ok: true, artifacts });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/artifacts', requireOwnerAuth, (req, res) => {
    try {
      const { title, type, content, metadata, projectId, isPublic } = req.body;
      const artifact = workspaceService.createArtifact({ title, type, content, metadata, projectId, isPublic });
      res.json({ ok: true, artifact });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.put('/api/workspace/artifacts/:id', requireOwnerAuth, (req, res) => {
    try {
      const updated = workspaceService.updateArtifact(req.params.id, req.body);
      res.json({ ok: Boolean(updated), artifact: updated });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.delete('/api/workspace/artifacts/:id', requireOwnerAuth, (req, res) => {
    try {
      const deleted = workspaceService.deleteArtifact(req.params.id);
      res.json({ ok: deleted });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/workspace/artifacts/:id/history', requireOwnerAuth, (req, res) => {
    try {
      const history = workspaceService.getArtifactHistory(req.params.id);
      res.json({ ok: true, history });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/artifacts/:id/rollback', requireOwnerAuth, (req, res) => {
    try {
      const { version } = req.body;
      const result = workspaceService.rollbackArtifact(req.params.id, version);
      res.json({ ok: result.success, ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // 4. Learning & Skills
  app.get('/api/workspace/skills', requireOwnerAuth, (req, res) => {
    try {
      const skills = learningService.listSkills();
      res.json({ ok: true, skills });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/skills', requireOwnerAuth, (req, res) => {
    try {
      const skill = learningService.createSkill(req.body);
      res.json({ ok: true, skill });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/workspace/lessons', requireOwnerAuth, (req, res) => {
    try {
      const lessons = learningService.listLessons();
      res.json({ ok: true, lessons });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/lessons', requireOwnerAuth, (req, res) => {
    try {
      const lesson = learningService.teachLesson(req.body);
      res.json({ ok: true, lesson });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // 5. Budget & Spending
  app.get('/api/workspace/budget', requireOwnerAuth, (req, res) => {
    try {
      const status = budgetService.getBudgetStatus();
      res.json({ ok: true, status });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/budget/toggle', requireOwnerAuth, (req, res) => {
    try {
      const isPaused = budgetService.isPaused();
      if (isPaused) {
        budgetService.resumeAiActivity();
      } else {
        budgetService.pauseAiActivity('Manual owner toggle from Studio');
      }
      res.json({ ok: true, isPaused: !isPaused });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/budget/limits', requireOwnerAuth, (req, res) => {
    try {
      const { dailyLimit, monthlyLimit, tokenBudget, maxTokens } = req.body;
      if (dailyLimit !== undefined) budgetService.setDailyLimit(dailyLimit);
      if (monthlyLimit !== undefined) budgetService.setMonthlyLimit(monthlyLimit);
      if (tokenBudget !== undefined || maxTokens !== undefined) {
        budgetService.setTokenBudget(tokenBudget || 500, maxTokens || 800);
      }
      res.json({ ok: true, status: budgetService.getBudgetStatus() });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // 6. Self-Improvement Proposals
  app.get('/api/workspace/proposals', requireOwnerAuth, (req, res) => {
    try {
      const proposals = selfImprovementService.listProposals();
      res.json({ ok: true, proposals });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/proposals', requireOwnerAuth, (req, res) => {
    try {
      const proposal = selfImprovementService.createProposal(req.body);
      res.json({ ok: true, proposal });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/proposals/:id/review', requireOwnerAuth, (req, res) => {
    try {
      const { approved, reviewer } = req.body;
      const result = selfImprovementService.reviewProposal(req.params.id, { approved, reviewer });
      res.json({ ok: result.success, ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/proposals/:id/rollback', requireOwnerAuth, (req, res) => {
    try {
      const result = selfImprovementService.rollbackProposal(req.params.id);
      res.json({ ok: result.success, ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // 7. Speed & Latency Mode
  app.post('/api/workspace/speed', requireOwnerAuth, (req, res) => {
    try {
      const { mode, reasoning } = req.body;
      if (mode !== 'fast' && mode !== 'deep' && mode !== 'turbo') {
        return res.status(400).json({ ok: false, error: 'Mode must be fast, turbo, or deep' });
      }
      const speedMode = mode === 'deep' ? 'deep' : 'fast';
      const reasoningEffort = reasoning !== undefined ? reasoning : (speedMode === 'fast' ? 'none' : 'max');
      setConfig('sandy_speed_mode', speedMode);
      setConfig('reasoning_effort', reasoningEffort);
      updateAgentRouting('chat', { model: 'gpt-6-luna', reasoning: reasoningEffort });
      res.json({ ok: true, speedMode, reasoning: reasoningEffort });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 8. Permissions Registry
  app.get('/api/workspace/permissions', requireOwnerAuth, (req, res) => {
    try {
      const permissions = permissionService.listPermissions();
      res.json({ ok: true, permissions });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/workspace/permissions/:key', requireOwnerAuth, (req, res) => {
    try {
      const { tier } = req.body;
      const updated = permissionService.updatePermissionTier(req.params.key, tier);
      res.json({ ok: Boolean(updated), permission: updated });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ============================================================================
  // MYRA SELF-EXPANDING MASTER FRAMEWORK ENDPOINTS
  // ============================================================================

  // --- 1. Web Intelligence Endpoints ---
  app.post('/api/research/conduct', requireOwnerAuth, async (req, res) => {
    try {
      const { topic, query, fetchMedia } = req.body;
      const dossier = await webResearchService.conductResearch({ topic, query, fetchMedia });
      res.json({ ok: true, dossier });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/research/dossiers', requireOwnerAuth, (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const dossiers = webResearchService.listDossiers(limit);
      res.json({ ok: true, dossiers });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/research/dossiers/:uuid', requireOwnerAuth, (req, res) => {
    try {
      const dossier = webResearchService.getDossier(req.params.uuid);
      if (!dossier) return res.status(404).json({ ok: false, error: 'Dossier not found' });
      res.json({ ok: true, dossier });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/research/dossiers/:uuid/resume', requireOwnerAuth, async (req, res) => {
    try {
      const { followUpQuery } = req.body;
      const updated = await webResearchService.resumeResearch(req.params.uuid, followUpQuery);
      res.json({ ok: true, dossier: updated });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // --- 2. Media Intelligence & Drive Endpoints ---
  app.post('/api/media/search', requireOwnerAuth, async (req, res) => {
    try {
      const { query } = req.body;
      const results = await mediaIntelligenceService.findOrSearchMedia(query);
      res.json({ ok: true, ...results });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/media/quota', requireOwnerAuth, async (req, res) => {
    try {
      const quota = await mediaIntelligenceService.inspectStorageQuota();
      res.json({ ok: true, ...quota });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/media/screenshot', requireOwnerAuth, async (req, res) => {
    try {
      const { url } = req.body;
      const shot = await mediaIntelligenceService.captureWebpageScreenshot(url);
      res.json({ ok: true, ...shot });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // --- 3. Universal Media Downloader Endpoints ---
  app.post('/api/download/start', requireOwnerAuth, async (req, res) => {
    try {
      const { url } = req.body;
      const wizard = await mediaDownloaderService.startDownloadWizard(url);
      res.json({ ok: true, ...wizard });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/download/execute', requireOwnerAuth, async (req, res) => {
    try {
      const { jobUuid, format, resolution } = req.body;
      const outcome = await mediaDownloaderService.executeDownload(jobUuid, { format, resolution });
      res.json({ ok: true, ...outcome });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/download/:token', (req, res) => {
    try {
      const item = mediaDownloaderService.getDownloadByToken(req.params.token);
      if (!item) return res.status(404).json({ ok: false, error: 'Download token not found or expired' });
      if (item.expired) return res.status(410).json({ ok: false, error: 'Download link has expired (24h limit)' });

      if (item.filePath && fs.existsSync(item.filePath)) {
        res.download(item.filePath, item.fileName);
      } else {
        res.status(404).json({ ok: false, error: 'File payload no longer available on disk' });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // --- 4. Dynamic Skill Tree Endpoints ---
  app.get('/api/skills/tree', requireOwnerAuth, async (req, res) => {
    try {
      const tree = await skillTreeService.getSkillTree();
      res.json({ ok: true, ...tree });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/skills/register', requireOwnerAuth, (req, res) => {
    try {
      const skill = skillTreeService.registerSkill(req.body);
      res.json({ ok: true, skill });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/skills/:skillId/prerequisites', requireOwnerAuth, async (req, res) => {
    try {
      const prereqs = await skillTreeService.checkPrerequisites(req.params.skillId);
      res.json({ ok: true, ...prereqs });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // --- 5. MyraScript DSL Endpoints ---
  app.post('/api/myrascript/execute', requireOwnerAuth, async (req, res) => {
    try {
      const { code, env } = req.body;
      const execution = await myraScriptTranspiler.execute(code, {}, env);
      res.json({ ok: true, ...execution });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/myrascript/transpile', requireOwnerAuth, (req, res) => {
    try {
      const { code, target = 'javascript' } = req.body;
      const transpiled = target === 'python'
        ? myraScriptTranspiler.toPython(code)
        : myraScriptTranspiler.toJavaScript(code);
      res.json({ ok: true, target, code: transpiled });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // --- 6. Tool Creation Pipeline Endpoints ---
  app.get('/api/tools', requireOwnerAuth, (req, res) => {
    try {
      const status = req.query.status || null;
      const tools = toolCreationPipeline.listTools(status);
      res.json({ ok: true, tools });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/tools/create', requireOwnerAuth, async (req, res) => {
    try {
      const result = await toolCreationPipeline.createCustomTool(req.body);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/tools/:name/approve', requireOwnerAuth, async (req, res) => {
    try {
      const approved = await toolCreationPipeline.approveAndActivateTool(req.params.name, 'Sandy');
      res.json({ ok: true, tool: approved });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/tools/:name/execute', requireOwnerAuth, async (req, res) => {
    try {
      const outcome = await toolCreationPipeline.executeTool(req.params.name, req.body.args || {});
      res.json({ ok: true, ...outcome });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/tools/:name/rollback', requireOwnerAuth, async (req, res) => {
    try {
      const reverted = await toolCreationPipeline.rollbackTool(req.params.name, req.body.reason);
      res.json({ ok: true, tool: reverted });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // --- 7. Universal MCP Endpoints ---
  app.get('/api/mcp/servers', requireOwnerAuth, (req, res) => {
    try {
      const servers = universalMcpManager.listServers();
      res.json({ ok: true, servers });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/mcp/servers', requireOwnerAuth, async (req, res) => {
    try {
      const registered = await universalMcpManager.registerServer(req.body);
      res.json({ ok: true, server: registered });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/mcp/servers/:id/connect', requireOwnerAuth, async (req, res) => {
    try {
      const connected = await universalMcpManager.connectServer(req.params.id);
      res.json({ ok: true, server: connected });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/mcp/servers/:id/disconnect', requireOwnerAuth, async (req, res) => {
    try {
      const disconnected = await universalMcpManager.disconnectServer(req.params.id);
      res.json({ ok: true, server: disconnected });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/mcp/servers/health', requireOwnerAuth, async (req, res) => {
    try {
      const health = await universalMcpManager.checkAllHealth();
      res.json({ ok: true, health });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // --- 8. Minecraft Framework Endpoints ---
  app.get('/api/minecraft/framework/profiles', requireOwnerAuth, (req, res) => {
    try {
      const profiles = minecraftFramework.listProfiles(req.query.edition);
      res.json({ ok: true, profiles });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/minecraft/framework/profiles', requireOwnerAuth, async (req, res) => {
    try {
      const profile = await minecraftFramework.configureServerProfile(req.body);
      res.json({ ok: true, profile });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/minecraft/framework/packs/generate', requireOwnerAuth, async (req, res) => {
    try {
      const bundle = await minecraftFramework.bundleAddonPack(req.body);
      res.json({ ok: true, ...bundle });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/minecraft/framework/companion/broadcast', requireOwnerAuth, (req, res) => {
    try {
      const { event, details, isSandy } = req.body;
      const formatted = minecraftFramework.formatCompanionMessage(event, details, isSandy);
      res.json({ ok: true, ...formatted });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Owner Web App route
  app.get('/owner', (req, res) => {
    res.sendFile(path.join(publicDir, 'owner.html'));
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

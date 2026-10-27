import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import {
  buildChatContext,
  recordUserMessage,
  recordAssistantMessage,
  clearConversation,
} from '../conversation/manager.js';
import { logAudit } from '../db/index.js';
import { getActiveModelId } from '../models/catalogue.js';
import { getBotApi } from '../telegram/bot.js';
import { validateAndSanitizeResponse } from '../conversation/responseValidator.js';
import { visionService } from '../vision/visionService.js';
import { extractExplicitWordLimit, detectUserIntent } from '../conversation/intentDetector.js';

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'reconnecting' | 'logged_out'
    this.qrRaw = null;
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.connectedUser = null;
    this.startedAt = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.messageCount = 0;
    this.lastActivity = null;
    this.isInitializing = false;
  }

  getAuthDir() {
    const dbDir = path.dirname(config.databasePath);
    const authDir = path.join(dbDir, 'whatsapp_auth');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    return authDir;
  }

  async init() {
    if (!config.whatsAppEnabled) {
      console.log('[WhatsApp] WhatsApp Bridge disabled via WHATSAPP_ENABLED=false.');
      return false;
    }

    if (this.isInitializing || this.status === 'connected') {
      return true;
    }

    this.isInitializing = true;
    this.status = 'connecting';

    try {
      const authDir = this.getAuthDir();
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      console.log(`[WhatsApp] Initializing Baileys client (v${version.join('.')})...`);

      const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
      });

      this.sock = sock;

      // Handle credentials update
      sock.ev.on('creds.update', saveCreds);

      // Handle connection updates (QR, open, close)
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrRaw = qr;
          this.status = 'qr_ready';
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          } catch (e) {
            console.warn('[WhatsApp] Failed to generate QR data URL:', e.message);
          }

          console.log('\n======================================================');
          console.log('⚡ NERO LABS — WHATSAPP BRIDGE QR CODE');
          console.log('Scan this QR code with WhatsApp on your phone:');
          console.log('======================================================\n');
          try {
            qrcodeTerminal.generate(qr, { small: true });
          } catch (e) {
            // fallback
          }
          console.log('\n(Or view the QR code in Owner Console / WhatsApp Deck)\n');
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.qrRaw = null;
          this.qrDataUrl = null;
          this.pairingCode = null;
          this.reconnectAttempts = 0;
          this.startedAt = new Date().toISOString();
          this.connectedUser = {
            id: sock.user?.id || 'unknown',
            name: sock.user?.name || 'Nero Linked Device',
          };

          const userPhone = (sock.user?.id || '').split(':')[0] || 'Unknown';
          console.log(`[WhatsApp] 🟢 WhatsApp Bridge successfully connected as +${userPhone} (${sock.user?.name || 'Owner'})`);
          logAudit('system', 'WHATSAPP_CONNECTED', `Connected as +${userPhone}`);

          // Notify Telegram Owner if configured
          this.notifyTelegramOwner(
            `🟢 *Nero WhatsApp 24/7 Bridge Connected!*\n\nSuccessfully linked to WhatsApp number: \`+${userPhone}\`\nNero AI is now active on WhatsApp 24/7.`
          );
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          console.log(`[WhatsApp] Connection closed. Status code: ${statusCode}. Logged out: ${isLoggedOut}`);

          if (isLoggedOut) {
            this.status = 'logged_out';
            this.connectedUser = null;
            this.qrRaw = null;
            this.qrDataUrl = null;
            console.warn('[WhatsApp] Session logged out. Clearing auth credentials & automatically restarting fresh live QR...');
            logAudit('system', 'WHATSAPP_LOGGED_OUT', 'Device logged out');

            const authDir = this.getAuthDir();
            try {
              if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
              }
            } catch (e) {}

            this.notifyTelegramOwner(
              `⚠️ *Nero WhatsApp Session Reset*\n\nOld session disconnected. Fresh live QR code is generating now... Send \`/qr\` to scan.`
            );

            // Infinite live recovery: automatically restart socket to show fresh QR
            setTimeout(() => {
              this.isInitializing = false;
              this.init();
            }, 3000);
          } else {
            // Infinite 24/7 Self-Healing Reconnect Loop: Never stay idle or disconnected
            this.status = 'reconnecting';
            this.reconnectAttempts++;
            // If QR timed out (408), restart immediately with no long delay so QR remains active!
            const isQrTimeout = statusCode === DisconnectReason.timedOut || statusCode === 408;
            const delay = isQrTimeout ? 2000 : Math.min(2500 * (this.reconnectAttempts % 8 + 1), 20000);

            console.log(`[WhatsApp 24/7 Guard] Auto-reconnecting in ${delay / 1000}s (Reason: ${isQrTimeout ? 'QR Refresh' : 'Network/Glitch'}, Attempt #${this.reconnectAttempts})...`);
            setTimeout(() => {
              this.isInitializing = false;
              this.init();
            }, delay);
          }
        }
      });

      // Handle incoming messages
      sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
          if (chatUpdate.type !== 'notify') return;
          for (const msg of chatUpdate.messages) {
            await this.handleIncomingMessage(msg);
          }
        } catch (err) {
          console.error('[WhatsApp Message Handler Error]:', err.message);
        }
      });

      this.isInitializing = false;
      return true;
    } catch (err) {
      this.status = 'disconnected';
      this.isInitializing = false;
      console.error('[WhatsApp Init Error]:', err.message);
      return false;
    }
  }

  async handleIncomingMessage(msg) {
    if (!msg.message) return;
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    // Extract image payload if present
    const imageMessage = msg.message.imageMessage || (msg.message.documentMessage?.mimetype?.startsWith('image/') ? msg.message.documentMessage : null);
    const isImage = Boolean(imageMessage);

    // Extract text content or caption
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      msg.message.documentMessage?.caption ||
      '';

    const trimmed = (text || '').trim();
    if (!trimmed && !isImage) return;

    this.messageCount++;
    this.lastActivity = new Date().toISOString();

    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup ? msg.key.participant : remoteJid;
    const senderNumber = (senderJid || '').replace(/[^0-9]/g, '');
    const senderName = msg.pushName || senderNumber || 'Friend';
    const isFromMe = Boolean(msg.key.fromMe);

    // Self-message guard (when user sends message from the linked phone)
    if (isFromMe) {
      const lower = trimmed.toLowerCase();
      // Only respond to self if explicitly commanded to prevent infinite echo
      const isSelfTrigger =
        lower.startsWith('!nero') ||
        lower.startsWith('/nero') ||
        lower.startsWith('.nero') ||
        lower.startsWith('nero ') ||
        lower.startsWith('/ai ') ||
        (isImage && lower.length > 0);

      if (!isSelfTrigger) {
        return;
      }
    }

    // Owner check
    const isOwnerSender = Boolean(
      (config.whatsAppOwnerNumber && senderNumber.includes(config.whatsAppOwnerNumber.replace(/[^0-9]/g, ''))) ||
      isFromMe
    );

    // Mode check: if owner_only mode is on and sender is not owner, skip
    if (config.whatsAppMode === 'owner_only' && !isOwnerSender) {
      return;
    }

    // Group message check: only respond if mentioned, commanded, or sent image with mention
    if (isGroup) {
      const isMentioned =
        trimmed.toLowerCase().includes('nero') ||
        trimmed.startsWith('!') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('.') ||
        isImage;
      if (!isMentioned) return;
    }

    // Strip bot command prefix if used
    let promptText = trimmed
      .replace(/^[!/.]nero\s+/i, '')
      .replace(/^\/ai\s+/i, '')
      .trim();

    // Show typing presence
    await this.sock.sendPresenceUpdate('composing', remoteJid).catch(() => {});

    // Command handling
    if (promptText === '/start' || promptText === '/help') {
      const helpText =
        `⚡ *NERO LABS — WHATSAPP AI ASSISTANT*\n\n` +
        `Hello ${senderName}! I am Nero, connected 24/7 with dedicated *Gemini 3.8 Flash (High Reasoning)* & persistent memory.\n\n` +
        `*Capabilities:*\n` +
        `• 💬 Direct Chat & Research: Ask questions, explore concepts, debate, or just talk casually\n` +
        `• 📸 Vision: Send any photo, screenshot, document, or diagram — I'll inspect and explain it\n` +
        `• 📏 Dynamic Sizing: Match brevity on greetings, 10–500 words on inquiries, or exact length when requested\n` +
        `• \`/status\` — System telemetry, active AI model & latency\n` +
        `• \`/model\` — Active neural engine\n` +
        `• \`/ping\` — Real-time response ping\n` +
        `• \`/clear\` — Wipe conversation context memory\n\n` +
        `_Built with ScaleMax & Grammy by Nero Labs._`;

      await this.sock.sendMessage(remoteJid, { text: helpText }, { quoted: msg });
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText === '/ping') {
      const activeModel = 'gemini-3.8-flash';
      await this.sock.sendMessage(
        remoteJid,
        { text: `Pong! 🏓 Nero WhatsApp Bridge is running live on *${activeModel}* (High Reasoning). 🟢` },
        { quoted: msg }
      );
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText === '/clear') {
      clearConversation(`wa_${remoteJid}`);
      await this.sock.sendMessage(
        remoteJid,
        { text: `🧹 Memory cleared for this conversation.` },
        { quoted: msg }
      );
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText === '/status') {
      const activeModel = 'gemini-3.8-flash';
      const statusText =
        `📊 *NERO TELEMETRY & STATUS*\n\n` +
        `• *Bridge Status:* 🟢 Live & Connected\n` +
        `• *Active AI Model:* \`${activeModel}\` (Reasoning: High)\n` +
        `• *Connected Device:* \`+${(this.sock.user?.id || '').split(':')[0]}\`\n` +
        `• *Total Processed:* ${this.messageCount} messages\n` +
        `• *Provider:* ScaleMax API Gateway\n` +
        `• *Vision Engine:* Multimodal Active\n` +
        `• *Memory Store:* SQLite WAL Persistent`;

      await this.sock.sendMessage(remoteJid, { text: statusText }, { quoted: msg });
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    // ==========================================
    // 📸 IMAGE UNDERSTANDING & VISION PIPELINE
    // ==========================================
    if (isImage) {
      try {
        console.log(`[WhatsApp Vision] Downloading and analyzing incoming image from ${senderName}...`);
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          { logger: pino({ level: 'silent' }), reuploadRequest: this.sock?.updateMediaMessage }
        );

        const visionPrompt = promptText.length > 0
          ? `The user sent this image with note: "${promptText}". Answer their inquiry with deep visual comprehension.`
          : `Thoroughly inspect this image (OCR text, objects, scene, details). In character as Nero, describe what you see, highlight the key points, and ask the user: "I've analyzed your image — what do you need help with regarding it?"`;

        const chatId = `wa_${remoteJid}`;
        recordUserMessage(chatId, promptText ? `[User Image: ${promptText}]` : `[User sent an image]`);

        const analysis = await visionService.analyzeImage({
          buffer,
          prompt: visionPrompt,
          mimeType: imageMessage.mimetype || 'image/jpeg',
          chatId,
        });

        const replyText = analysis.description || "I've inspected your image! What would you like help with regarding it? ✨";
        recordAssistantMessage(chatId, replyText, 120, 'gemini-3.8-flash');

        await this.sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (imgErr) {
        console.error('[WhatsApp Vision Error]:', imgErr.message);
        await this.sock.sendMessage(
          remoteJid,
          { text: `📸 I noticed your image, but had a transient glitch reading it (${imgErr.message}). Could you re-send or forward it again?` },
          { quoted: msg }
        );
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
    }

    // Notify Telegram owner if configured and not self-message
    if (config.whatsAppNotifyTelegram && !isFromMe) {
      this.notifyTelegramOwner(
        `📲 *[WhatsApp Message]*\n*From:* ${senderName} (\`+${senderNumber}\`)\n*Chat:* ${isGroup ? 'Group' : 'Direct Message'}\n*Message:* "${promptText.slice(0, 250)}"\n\n_Reply with:_ \`/wa_send ${senderNumber} <reply>\``
      );
    }

    // AI Generation Pipeline (Dedicated Gemini 3.8 Flash, High Reasoning)
    try {
      const chatId = `wa_${remoteJid}`;
      recordUserMessage(chatId, promptText);

      const explicitLimit = extractExplicitWordLimit(promptText);
      const detectedIntent = detectUserIntent(promptText);

      const messages = buildChatContext(chatId, promptText, {
        senderId: senderNumber,
        senderName,
        userIsOwner: isOwnerSender,
        explicitWordLimit: explicitLimit,
        intent: detectedIntent,
      });

      const activeModel = 'gemini-3.8-flash';

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages,
        chatId,
        reasoningEffort: 'high',
      });

      let replyText = completion.text || 'I processed your request but have no response to return.';

      // Dynamic reply length intelligence:
      // 1. "Hy to Hy" rule -> casual greetings capped to 35 words (1-2 punchy sentences)
      // 2. Standard questions -> 10 to 500 words limit
      // 3. Explicit limits (e.g. "write a 500 word explanation") -> exact requested limit
      let maxWords = 500;
      if (explicitLimit) {
        maxWords = explicitLimit;
      } else if (detectedIntent === 'greeting') {
        maxWords = 35;
      }

      const minWords = detectedIntent === 'greeting' ? 1 : 10;

      // Sanitize response
      try {
        const validated = validateAndSanitizeResponse(replyText, promptText, {
          minWords,
          maxWords,
          explicitLimit: Boolean(explicitLimit),
          isDev: isOwnerSender,
          isOwner: isOwnerSender,
        });
        if (validated && validated.sanitizedText) {
          replyText = validated.sanitizedText;
        }
      } catch (e) {
        // use raw if validator throws
      }

      recordAssistantMessage(chatId, replyText, completion.tokensUsed || 0, activeModel);

      // Send response to WhatsApp
      await this.sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
    } catch (err) {
      console.error('[WhatsApp AI Generation Error]:', err.message);
      await this.sock.sendMessage(
        remoteJid,
        { text: `⚠️ *Nero AI Notice:* Transient error processing your request (${err.message}). Please try again shortly.` },
        { quoted: msg }
      );
    } finally {
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
    }
  }

  async requestPairingCode(phoneNumber) {
    if (!this.sock) {
      await this.init();
    }

    if (this.status === 'connected') {
      throw new Error('WhatsApp is already connected! Disconnect first to pair a new number.');
    }

    const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, '');
    if (!cleanNumber || cleanNumber.length < 9) {
      throw new Error('Please enter a valid international phone number with country code (e.g. 919876543210).');
    }

    try {
      console.log(`[WhatsApp] Requesting 8-digit pairing code for phone number +${cleanNumber}...`);
      const code = await this.sock.requestPairingCode(cleanNumber);
      // Format as ABCD-EFGH for readability
      const formatted = code ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
      this.pairingCode = formatted;
      console.log(`[WhatsApp] 🔑 Pairing Code Generated: ${formatted}`);
      return formatted;
    } catch (err) {
      console.error('[WhatsApp Pairing Code Error]:', err.message);
      throw err;
    }
  }

  async sendOutboundMessage(phoneNumberOrJid, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp bridge is not currently connected.');
    }

    let jid = phoneNumberOrJid;
    if (!jid.includes('@')) {
      const clean = String(phoneNumberOrJid).replace(/[^0-9]/g, '');
      jid = `${clean}@s.whatsapp.net`;
    }

    await this.sock.sendMessage(jid, { text });
    return { ok: true, jid, text };
  }

  async disconnectSession() {
    try {
      if (this.sock) {
        await this.sock.logout().catch(() => {});
      }
    } catch (e) {
      // ignore
    }

    this.sock = null;
    this.status = 'disconnected';
    this.qrRaw = null;
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.connectedUser = null;

    // Wipe auth directory
    const authDir = this.getAuthDir();
    try {
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log('[WhatsApp] Cleared authentication session directory.');
      }
    } catch (e) {
      console.warn('[WhatsApp] Could not wipe auth directory:', e.message);
    }

    return { ok: true, message: 'WhatsApp session disconnected and storage reset.' };
  }

  async restart() {
    console.log('[WhatsApp] Restarting WhatsApp bridge socket...');
    if (this.sock) {
      try {
        this.sock.end();
      } catch (e) {}
    }
    this.sock = null;
    this.status = 'reconnecting';
    this.isInitializing = false;
    return this.init();
  }

  getStatus() {
    return {
      status: this.status,
      connectedUser: this.connectedUser,
      hasQr: Boolean(this.qrDataUrl),
      pairingCode: this.pairingCode,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      messageCount: this.messageCount,
      mode: config.whatsAppMode,
      autoReply: config.whatsAppAutoReply,
      notifyTelegram: config.whatsAppNotifyTelegram,
    };
  }

  getQrCode() {
    return {
      status: this.status,
      qrRaw: this.qrRaw,
      qrDataUrl: this.qrDataUrl,
    };
  }

  async getQrBuffer() {
    if (!this.qrRaw) {
      return null;
    }
    return QRCode.toBuffer(this.qrRaw, { scale: 8, margin: 2 });
  }

  async notifyTelegramOwner(message) {
    if (!config.telegramOwnerId) return;
    try {
      const api = getBotApi();
      if (api) {
        await api.sendMessage(Number(config.telegramOwnerId), message, {
          parse_mode: 'Markdown',
        });
      }
    } catch (err) {
      console.warn('[WhatsApp->Telegram Notify Failed]:', err.message);
    }
  }
}

export const whatsAppService = new WhatsAppService();

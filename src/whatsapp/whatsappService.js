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
import os from 'node:os';
import { config } from '../config.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import {
  recordUserMessage,
  recordAssistantMessage,
  clearConversation,
} from '../conversation/manager.js';
import { logAudit, getRecentConversation, addNote, getUserNotes } from '../db/index.js';
import { getActiveModelId } from '../models/catalogue.js';
import { getBotApi } from '../telegram/bot.js';
import { validateAndSanitizeResponse } from '../conversation/responseValidator.js';
import { visionService } from '../vision/visionService.js';
import { extractExplicitWordLimit, detectUserIntent } from '../conversation/intentDetector.js';
import { sandyStatusService } from './sandyStatusService.js';
import { mediaManager } from './mediaManager.js';
import { buildWhatsAppChatContext, buildWhatsAppDirective } from './whatsappPersona.js';
import { updateAgentRouting } from '../models/modelRouter.js';
import { isMaintenanceModeActive, enableMaintenanceMode, disableMaintenanceMode } from '../maintenance/maintenanceService.js';

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
    this.sentMessageIds = new Set();
  }

  async safeSendMessage(jid, content, options = {}) {
    if (!this.sock) return null;
    const sent = await this.sock.sendMessage(jid, content, options);
    if (sent?.key?.id) {
      this.sentMessageIds.add(sent.key.id);
      if (this.sentMessageIds.size > 2000) {
        const ids = Array.from(this.sentMessageIds).slice(0, 500);
        ids.forEach((id) => this.sentMessageIds.delete(id));
      }
    }
    return sent;
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
    if (msg.key?.id && this.sentMessageIds.has(msg.key.id)) return;

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    // Extract image payload if present
    const imageMessage =
      msg.message.imageMessage ||
      (msg.message.documentMessage?.mimetype?.startsWith('image/') ? msg.message.documentMessage : null);
    const isImage = Boolean(imageMessage);

    // Extract video payload if present
    const videoMessage =
      msg.message.videoMessage ||
      (msg.message.documentMessage?.mimetype?.startsWith('video/') ? msg.message.documentMessage : null);
    const isVideo = Boolean(videoMessage);

    // Extract text content or caption
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      msg.message.documentMessage?.caption ||
      '';

    const trimmed = (text || '').trim();
    if (!trimmed && !isImage && !isVideo) return;

    this.messageCount++;
    this.lastActivity = new Date().toISOString();

    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup ? msg.key.participant : remoteJid;
    const senderNumber = (senderJid || '').replace(/[^0-9]/g, '');
    const senderName = msg.pushName || senderNumber || 'Friend';
    const isFromMe = Boolean(msg.key.fromMe);

    const myPhone = (this.sock?.user?.id || '').split(':')[0].replace(/[^0-9]/g, '');
    const ownerConfigPhone = (config.whatsAppOwnerNumber || '').replace(/[^0-9]/g, '');
    const remoteClean = (remoteJid || '').replace(/[^0-9]/g, '');

    // True self-chat in WhatsApp "Message Yourself":
    const isSelfChat = isFromMe && (
      (Boolean(myPhone) && remoteClean.includes(myPhone)) ||
      (Boolean(ownerConfigPhone) && remoteClean.includes(ownerConfigPhone))
    );

    const isOwnerSender = isSelfChat ||
      (Boolean(ownerConfigPhone) && senderNumber === ownerConfigPhone) ||
      (Boolean(myPhone) && senderNumber === myPhone);

    const isSandy = isOwnerSender;

    // Self-message guard:
    // If sent from the linked phone to someone else or a group, only respond if explicitly commanded
    if (isFromMe && !isSelfChat) {
      const lower = trimmed.toLowerCase();
      const isExplicitTrigger =
        lower.startsWith('!nero') ||
        lower.startsWith('/nero') ||
        lower.startsWith('.nero') ||
        lower.startsWith('nero ') ||
        lower.startsWith('/ai ');

      if (!isExplicitTrigger) {
        return;
      }
    }

    // Mode check: if owner_only mode is on and sender is not owner, skip
    if (config.whatsAppMode === 'owner_only' && !isOwnerSender) {
      return;
    }

    // Group message check: only respond if mentioned, commanded, or sent media
    if (isGroup) {
      const isMentioned =
        trimmed.toLowerCase().includes('nero') ||
        trimmed.startsWith('!') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('.') ||
        isImage ||
        isVideo;
      if (!isMentioned) return;
    }

    // Strip bot command prefix if used
    let promptText = trimmed
      .replace(/^[!/.]nero\s+/i, '')
      .replace(/^\/ai\s+/i, '')
      .trim();

    // Show typing presence
    await this.sock.sendPresenceUpdate('composing', remoteJid).catch(() => {});

    // Built-in commands (Strictly WhatsApp AI persona — zero Telegram references)
    if (promptText === '/start' || promptText === '/help') {
      const helpText =
        `⚡ *NERO LABS — WHATSAPP EXECUTIVE AI ASSISTANT*\n\n` +
        `Hello ${senderName}! I am Nero, Sandy's personal AI executive assistant connected 24/7 with dual-engine intelligence:\n\n` +
        `*Engines & Architecture:*\n` +
        `• ⚡ *Fast Talk Engine (Contacts):* \`gemini-3.5-flash-lite\` (Ultra-low latency, blazing fast)\n` +
        `• 👑 *Master Console (Sandy):* \`gemini-3.8-flash\` (High Reasoning manager & senior coder)\n\n` +
        `*Capabilities:*\n` +
        `• 💬 Research & Conversation: In-depth research, reasoning, problem solving, and discussions\n` +
        `• 📸 Vision Vault: Send any image, diagram, or screenshot — inspected, explained, and stored\n` +
        `• 📹 Video Vault: Send any video — securely saved to Sandy's archive vault\n` +
        `• 👑 MasterBot Console: When Sandy texts himself, manage live routine, code fixes, gaming status, and priority inbox\n` +
        `• 📏 Dynamic Sizing: "Hy to Hy" brevity, 10–500 words for inquiries, or exact words requested\n` +
        `• \`/status\` — Live telemetry & active model\n` +
        `• \`/ping\` — Real-time response ping\n` +
        `• \`/clear\` — Wipe conversation context memory\n\n` +
        `_Nero Labs Executive AI Assistant_`;

      await this.safeSendMessage(remoteJid, { text: helpText }, { quoted: msg });
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText === '/ping') {
      const activeModel = isSandy ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';
      await this.safeSendMessage(
        remoteJid,
        { text: `Pong! 🏓 Nero WhatsApp Bridge is running live on *${activeModel}* (${isSandy ? 'High' : 'Fast/Low'} Reasoning). 🟢` },
        { quoted: msg }
      );
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText === '/clear') {
      const targetChatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
      clearConversation(targetChatId);
      await this.safeSendMessage(
        remoteJid,
        { text: `🧹 Memory cleared for this conversation.` },
        { quoted: msg }
      );
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText === '/status') {
      const statusText =
        `📊 *NERO TELEMETRY & SYSTEM STATUS*\n\n` +
        `• *Bridge Status:* 🟢 Live & Connected 24/7\n` +
        `• *Public Chat Engine:* \`gemini-3.5-flash-lite\` (Fastest / Low Latency)\n` +
        `• *MasterBot Engine:* \`gemini-3.8-flash\` (High Reasoning / Manager & Coder)\n` +
        `• *Connected Device:* \`+${(this.sock.user?.id || '').split(':')[0]}\`\n` +
        `• *Total Processed:* ${this.messageCount} messages\n` +
        `• *Provider:* ScaleMax API Gateway\n` +
        `• *Vision Engine:* Multimodal Active\n` +
        `• *Media Vault:* SQLite & Local Disk Active\n` +
        `• *Memory Store:* SQLite WAL Persistent`;

      await this.safeSendMessage(remoteJid, { text: statusText }, { quoted: msg });
      await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    // ==========================================
    // 📹 VIDEO ARCHIVE & PROCESSING PIPELINE
    // ==========================================
    if (isVideo) {
      try {
        console.log(`[WhatsApp Media Vault] Downloading and archiving incoming video from ${senderName} (+${senderNumber})...`);
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          { logger: pino({ level: 'silent' }), reuploadRequest: this.sock?.updateMediaMessage }
        );

        // Save every video to media vault in dedicated user folder
        await mediaManager.saveMediaBuffer({
          buffer,
          senderNumber,
          senderName,
          fileType: 'video',
          mimeType: videoMessage.mimetype || 'video/mp4',
          caption: promptText,
        });

        const chatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
        recordUserMessage(chatId, promptText ? `[User sent a video: "${promptText}"]` : `[User sent a video]`);

        const replyText = isSandy
          ? `Boss Sandy, aapka video received aur vault mein safely store ho gaya! (${Math.round(buffer.length / 1024)} KB) 📹✨`
          : `Maine aapka video receive kar liya hai aur securely store ho gaya hai! (${Math.round(buffer.length / 1024)} KB) 📹✨`;

        recordAssistantMessage(chatId, replyText, 40, isSandy ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite');
        await this.safeSendMessage(remoteJid, { text: replyText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (vidErr) {
        console.error('[WhatsApp Video Error]:', vidErr.message);
        await this.safeSendMessage(
          remoteJid,
          { text: `📹 Video download error (${vidErr.message}). Could you try re-sending?` },
          { quoted: msg }
        );
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
    }

    // ==========================================
    // 📸 IMAGE UNDERSTANDING & VISION PIPELINE
    // ==========================================
    if (isImage) {
      try {
        console.log(`[WhatsApp Vision Vault] Downloading, archiving and analyzing incoming image from ${senderName} (+${senderNumber})...`);
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          { logger: pino({ level: 'silent' }), reuploadRequest: this.sock?.updateMediaMessage }
        );

        // Permanently archive every image into user's folder and SQLite vault
        await mediaManager.saveMediaBuffer({
          buffer,
          senderNumber,
          senderName,
          fileType: 'image',
          mimeType: imageMessage.mimetype || 'image/jpeg',
          caption: promptText,
        });

        const visionPrompt = promptText.length > 0
          ? `The user sent this image with note: "${promptText}". Answer their inquiry with deep visual comprehension.`
          : `Thoroughly inspect this image (OCR text, objects, scene, details). In character as Nero (Sandy's dedicated executive assistant, super chill and brilliant), describe what you see, highlight key points, and ask the user: "Maine aapki image dekh li hai — iske baare mein aapko kya madad chahiye?"`;

        const chatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
        recordUserMessage(chatId, promptText ? `[User Image: "${promptText}"]` : `[User sent an image]`);

        const visionModel = isSandy ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';
        const analysis = await visionService.analyzeImage({
          buffer,
          prompt: visionPrompt,
          mimeType: imageMessage.mimetype || 'image/jpeg',
          chatId,
        });

        const replyText = analysis.description || "Maine aapki image dekh li hai! Iske baare mein aapko kya madad chahiye? ✨";
        recordAssistantMessage(chatId, replyText, 120, visionModel);

        await this.safeSendMessage(remoteJid, { text: replyText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (imgErr) {
        console.error('[WhatsApp Vision Error]:', imgErr.message);
        await this.safeSendMessage(
          remoteJid,
          { text: `📸 Image analysis notice: (${imgErr.message}). Could you try re-sending?` },
          { quoted: msg }
        );
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
    }

    // ==========================================
    // 👑 MASTERBOT CONSOLE (SANDY'S PERSONAL CHAT)
    // ==========================================
    if (isSandy) {
      // 1. Natural Language Status / Routine Update
      const statusUpdate = sandyStatusService.parseNaturalLanguageUpdate(promptText);
      if (statusUpdate.updated) {
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', statusUpdate.summary, 30, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: statusUpdate.summary }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 2. Urgent Inbox / Talk Requests Check
      if (/\b(?:urgent|emergency|inbox|talk\s+requests?|kisi\s+ne\s+kuch\s+bola)\b/i.test(promptText)) {
        const urgentList = sandyStatusService.getUrgentRequests(10);
        recordUserMessage('wa_sandy_master', promptText);
        if (urgentList.length === 0) {
          const emptyText = "Boss Sandy! Abhi koi pending urgent talk request nahi hai. All clear! ✨";
          recordAssistantMessage('wa_sandy_master', emptyText, 25, 'gemini-3.8-flash');
          await this.safeSendMessage(remoteJid, { text: emptyText }, { quoted: msg });
          await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
        let report = "📬 *NERO MASTERBOT — SANDY'S URGENT INBOX*\n\nHere are the latest urgent talk requests left by contacts:\n\n";
        for (const item of urgentList) {
          report += `• *+${item.sender_number}* (${item.sender_name || 'Contact'}):\n  "${item.message_text}"\n  _Received: ${new Date(item.created_at).toLocaleString()}_\n\n`;
        }
        report += `_Reply with:_ \`/wa_send <number> <your reply>\``;
        recordAssistantMessage('wa_sandy_master', report, 100, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: report }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 3. System Telemetry & Health Diagnostics (sysinfo / status / diagnose)
      if (/\b(?:sysinfo|system\s+stats|telemetry|diagnos(?:e|tics?)|server\s+stats)\b/i.test(promptText)) {
        const memoryUsage = process.memoryUsage();
        const uptimeSec = Math.floor(process.uptime());
        const hours = Math.floor(uptimeSec / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        const seconds = uptimeSec % 60;
        const sysText =
          `⚡ *NERO LABS — MASTERBOT SYSTEM DIAGNOSTICS*\n\n` +
          `• *Process Uptime:* ${hours}h ${minutes}m ${seconds}s\n` +
          `• *RAM RSS:* ${Math.round(memoryUsage.rss / 1024 / 1024)} MB\n` +
          `• *RAM Heap Used:* ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB\n` +
          `• *MasterBot Engine:* \`gemini-3.8-flash\` (High Reasoning / Coder & Manager)\n` +
          `• *Public Talk Engine:* \`gemini-3.5-flash-lite\` (Fastest / Low Latency)\n` +
          `• *Total Processed Messages:* ${this.messageCount}\n` +
          `• *Active Socket Status:* 🟢 ${this.status.toUpperCase()}\n` +
          `• *OS Platform:* ${os.platform()} (${os.arch()})\n` +
          `• *Host Memory Free:* ${Math.round(os.freemem() / 1024 / 1024)} MB / ${Math.round(os.totalmem() / 1024 / 1024)} MB\n\n` +
          `_All systems nominal and linked to MasterBot console! ✨_`;
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', sysText, 100, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: sysText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 4. Inspect Another Contact's Chat / Saved Media
      const showChatMatch = promptText.match(/(?:read|show|check|kya\s+bola)\s+(?:chat|messages?|talk)\s+(?:of|from)?\s*([+0-9]+)/i);
      if (showChatMatch && showChatMatch[1]) {
        const targetNum = showChatMatch[1].replace(/[^0-9]/g, '');
        const targetJid = `${targetNum}@s.whatsapp.net`;
        const recentHistory = getRecentConversation(`wa_${targetJid}`, 10);
        const mediaHistory = mediaManager.getMediaHistory(targetNum, 5);
        recordUserMessage('wa_sandy_master', promptText);
        if (recentHistory.length === 0 && mediaHistory.length === 0) {
          const noChatText = `Boss Sandy! +${targetNum} se abhi tak koi recorded chat ya media nahi mili hai.`;
          recordAssistantMessage('wa_sandy_master', noChatText, 25, 'gemini-3.8-flash');
          await this.safeSendMessage(remoteJid, { text: noChatText }, { quoted: msg });
          await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
        let report = `📋 *RECENT CHAT HISTORY WITH +${targetNum}*:\n\n`;
        for (const h of recentHistory) {
          report += `${h.role === 'user' ? '👤 Them' : '🤖 Nero'}: ${h.content}\n`;
        }
        if (mediaHistory.length > 0) {
          report += `\n📁 *Saved Media Vault (${mediaHistory.length} files)*:\n`;
          for (const m of mediaHistory) {
            report += `• [${m.file_type.toUpperCase()}] ${m.file_name} (${Math.round(m.file_size / 1024)} KB) - ${m.caption || 'No caption'}\n`;
          }
        }
        recordAssistantMessage('wa_sandy_master', report, 120, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: report }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 5. Memory Wiping / Resetting for Specific Contact
      const clearContactMatch = promptText.match(/\b(?:clear|reset|wipe)\s+(?:chat|memory)\s+(?:of|for)?\s*([+0-9]+)\b/i);
      if (clearContactMatch && clearContactMatch[1]) {
        const targetNum = clearContactMatch[1].replace(/[^0-9]/g, '');
        const targetJid = `${targetNum}@s.whatsapp.net`;
        clearConversation(`wa_${targetJid}`);
        recordUserMessage('wa_sandy_master', promptText);
        const clearedText = `🧹 Memory successfully cleared for contact +${targetNum}, Boss!`;
        recordAssistantMessage('wa_sandy_master', clearedText, 20, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: clearedText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 6. Maintenance Mode Controls
      if (/\b(?:enable|turn\s+on|activate)\s+maintenance\b/i.test(promptText)) {
        await enableMaintenanceMode();
        recordUserMessage('wa_sandy_master', promptText);
        const maintText = "🛠️ *Maintenance Mode ACTIVATED.* Public chat replies for contacts are temporarily paused while you work! 🔒";
        recordAssistantMessage('wa_sandy_master', maintText, 25, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: maintText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      if (/\b(?:disable|turn\s+off|deactivate)\s+maintenance\b/i.test(promptText)) {
        await disableMaintenanceMode();
        recordUserMessage('wa_sandy_master', promptText);
        const maintText = "🟢 *Maintenance Mode DEACTIVATED.* Public chat replies are now fully live for all contacts! 🚀";
        recordAssistantMessage('wa_sandy_master', maintText, 25, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: maintText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 7. Persistent Notes
      const addNoteMatch = promptText.match(/\b(?:add|save|create)\s+note[:\s]+(.+)/i);
      if (addNoteMatch && addNoteMatch[1]) {
        const noteBody = addNoteMatch[1].trim();
        addNote('sandy', 'wa_sandy_master', noteBody);
        recordUserMessage('wa_sandy_master', promptText);
        const noteConf = `📝 *Note Saved in Persistent Storage:*\n"${noteBody}"`;
        recordAssistantMessage('wa_sandy_master', noteConf, 20, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: noteConf }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      if (/\b(?:show|list|my|view)\s+notes\b/i.test(promptText)) {
        const notes = getUserNotes('sandy');
        recordUserMessage('wa_sandy_master', promptText);
        if (!notes || notes.length === 0) {
          const noNotes = "📝 Boss Sandy, your persistent notepad is currently empty.";
          recordAssistantMessage('wa_sandy_master', noNotes, 20, 'gemini-3.8-flash');
          await this.safeSendMessage(remoteJid, { text: noNotes }, { quoted: msg });
          await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
        let notesReport = `📝 *SANDY'S PERSISTENT NOTES (${notes.length})*:\n\n`;
        for (const n of notes.slice(0, 10)) {
          notesReport += `• [#${n.id}] ${n.note_text} _(${new Date(n.created_at).toLocaleDateString()})_\n`;
        }
        recordAssistantMessage('wa_sandy_master', notesReport, 60, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: notesReport }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 8. Change Reasoning Effort (Low / Medium / High)
      const reasoningMatch = promptText.match(/\b(?:change|set|switch)\s+reasoning(?:\s+to)?\s+(high|low|medium)\b/i);
      if (reasoningMatch && reasoningMatch[1]) {
        const newLevel = reasoningMatch[1].toLowerCase();
        updateAgentRouting('chat', { reasoning: newLevel });
        recordUserMessage('wa_sandy_master', promptText);
        const confText = `✅ Reasoning effort successfully updated to *${newLevel.toUpperCase()}* for chat completions, Boss!`;
        recordAssistantMessage('wa_sandy_master', confText, 20, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: confText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
    }

    // ==========================================
    // 💬 CONTACTS MESSAGING SANDY'S WHATSAPP
    // ==========================================
    if (!isSandy) {
      // Check if maintenance mode is active
      if (isMaintenanceModeActive()) {
        const maintMsg = "🛠️ *Sandy's AI Assistant is currently in brief maintenance mode.* Replies are paused for a few moments while updates finish. Thanks for your patience! 🚀";
        await this.safeSendMessage(remoteJid, { text: maintMsg }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check if contact is leaving an urgent message / important talk request
      if (/\b(?:urgent|emergency|zaroori|urgent\s+hai|important\s+work|call\s+karo|connect\s+karo|tell\s+sandy\s+to\s+call)\b/i.test(promptText)) {
        sandyStatusService.addUrgentRequest({
          senderNumber,
          senderName,
          messageText: promptText,
          urgency: 'high',
        });
      }
    }

    // Optional Telegram notification for Sandy's private log
    if (config.whatsAppNotifyTelegram && !isFromMe) {
      this.notifyTelegramOwner(
        `📲 *[WhatsApp Message]*\n*From:* ${senderName} (\`+${senderNumber}\`)\n*Chat:* ${isGroup ? 'Group' : 'Direct Message'}\n*Message:* "${promptText.slice(0, 250)}"\n\n_Reply with:_ \`/wa_send ${senderNumber} <reply>\``
      );
    }

    // AI Generation Pipeline:
    // Dual Architecture:
    // • MasterBot (Sandy): 'gemini-3.8-flash' (High Reasoning / Manager & Senior Coder)
    // • Public Chat (Contacts): 'gemini-3.5-flash-lite' (Low Reasoning / Fastest Speed / Lowest Latency)
    try {
      const chatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
      recordUserMessage(chatId, promptText);

      const { messages, explicitLimit, detectedIntent } = buildWhatsAppChatContext({
        chatId,
        promptText,
        senderNumber,
        senderName,
        isSandy,
      });

      const activeModel = isSandy ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';
      const reasoningEffort = isSandy ? 'high' : 'low';

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages,
        chatId,
        reasoningEffort,
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

      // Send response to WhatsApp via safeSendMessage
      await this.safeSendMessage(remoteJid, { text: replyText }, { quoted: msg });
    } catch (err) {
      console.error('[WhatsApp AI Generation Error]:', err.message);
      await this.safeSendMessage(
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

    await this.safeSendMessage(jid, { text });
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

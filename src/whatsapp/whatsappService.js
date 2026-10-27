import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  downloadMediaMessage,
  decryptPollVote,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
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
import { buildWhatsAppChatContext, buildWhatsAppDirective, buildOutreachMessage } from './whatsappPersona.js';
import { voiceNoteService } from './voiceNoteService.js';
import { stickerService } from './stickerService.js';
import { updateAgentRouting } from '../models/modelRouter.js';
import { isMaintenanceModeActive, enableMaintenanceMode, disableMaintenanceMode, isWhatsAppSilentModeActive, setWhatsAppSilentMode } from '../maintenance/maintenanceService.js';

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
    this.activePolls = new Map();
  }

  async sendMasterBotMenu(remoteJid, quotedMsg = null) {
    const isSilent = isWhatsAppSilentModeActive();
    const options = [
      '📬 Urgent Inbox',
      '📊 System Diagnostics',
      '🎮 Routine & Gaming',
      '🛠️ Toggle Maintenance',
      '📝 View Notes',
      '🏓 Latency Ping',
      isSilent ? '🟢 Resume Texting Everyone' : '🛑 Stop Texting Everyone',
      '📑 Executive Daily Digest',
      '💬 Universal Cross-Chat Context',
      '🎨 Send Cyber Sticker',
    ];

    const sent = await this.safeSendMessage(
      remoteJid,
      {
        poll: {
          name: '👑 NERO MASTERBOT — OWNER CONTROL DECK',
          values: options,
          selectableCount: 1,
        },
      },
      quotedMsg ? { quoted: quotedMsg } : {}
    );

    if (sent?.key?.id) {
      const pollEncKey =
        sent.message?.messageContextInfo?.messageSecret ||
        sent.message?.pollCreationMessageV3?.messageSecret ||
        sent.message?.pollCreationMessage?.messageSecret;
      this.activePolls.set(sent.key.id, {
        type: 'owner_menu',
        options,
        pollEncKey,
        createdAt: Date.now(),
      });
      if (this.activePolls.size > 50) {
        const oldestKey = this.activePolls.keys().next().value;
        this.activePolls.delete(oldestKey);
      }
    }

    const menuText =
      `👑 *NERO MASTERBOT — OWNER CONTROL DECK*\n\n` +
      `Tap any action button in the poll above, or reply with the number:\n\n` +
      `1️⃣ \`1\` — 📬 *Urgent Inbox* (Check requests left by contacts)\n` +
      `2️⃣ \`2\` — 📊 *System Diagnostics* (RAM, CPU, Uptime & Latency)\n` +
      `3️⃣ \`3\` — 🎮 *Routine & Gaming* (Minecraft realm / routine status)\n` +
      `4️⃣ \`4\` — 🛠️ *Maintenance Mode* (Pause / Resume public bot)\n` +
      `5️⃣ \`5\` — 📝 *Persistent Notes* (View / manage saved notes)\n` +
      `6️⃣ \`6\` — 🏓 *Latency Ping* (Test real-time bridge responsiveness)\n` +
      `7️⃣ \`7\` — ${isSilent ? '🟢 *Resume Texting*' : '🛑 *Stop Texting Everyone*'} (Emergency Kill Switch)\n` +
      `8️⃣ \`8\` — 📑 *Executive Daily Digest* (Recap of chats, media & requests today)\n` +
      `9️⃣ \`9\` — 💬 *Universal Cross-Chat Context* (Summarize what everyone is talking about)\n` +
      `🔟 \`10\` — 🎨 *Send Cyber Sticker* (Dispatches custom Nero sticker) 🦾✨\n\n` +
      `_Status: ${isSilent ? '🛑 MUTED (Not texting anyone)' : '🟢 ACTIVE (Replying to contacts)'}_\n` +
      `_Type \`menu\` or \`/buttons\` anytime to summon these buttons!_`;

    await this.safeSendMessage(remoteJid, { text: menuText }, quotedMsg ? { quoted: quotedMsg } : {});
  }

  async executeOwnerAction(actionType, remoteJid, quotedMsg = null) {
    const act = String(actionType).toLowerCase().trim();

    // 1. Urgent Inbox
    if (act === '1' || act === '[1]' || act.includes('urgent') || act.includes('inbox')) {
      const urgentList = sandyStatusService.getUrgentRequests(10);
      recordUserMessage('wa_sandy_master', 'Action: Check Urgent Inbox');
      if (urgentList.length === 0) {
        const emptyText = "Boss Sandy! Abhi koi pending urgent talk request nahi hai. All clear! ✨";
        recordAssistantMessage('wa_sandy_master', emptyText, 25, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: emptyText }, quotedMsg ? { quoted: quotedMsg } : {});
        return;
      }
      let report = "📬 *NERO MASTERBOT — SANDY'S URGENT INBOX*\n\nHere are the latest urgent talk requests left by contacts:\n\n";
      for (const item of urgentList) {
        report += `• *+${item.sender_number}* (${item.sender_name || 'Contact'}):\n  "${item.message_text}"\n  _Received: ${new Date(item.created_at).toLocaleString()}_\n\n`;
      }
      report += `_Reply with:_ \`/wa_send <number> <your reply>\``;
      recordAssistantMessage('wa_sandy_master', report, 100, 'gemini-3.8-flash');
      await this.safeSendMessage(remoteJid, { text: report }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 2. System Diagnostics (sysinfo)
    if (act === '2' || act === '[2]' || act.includes('diagnostic') || act.includes('telemetry') || act.includes('sysinfo')) {
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
      recordUserMessage('wa_sandy_master', 'Action: System Diagnostics');
      recordAssistantMessage('wa_sandy_master', sysText, 100, 'gemini-3.8-flash');
      await this.safeSendMessage(remoteJid, { text: sysText }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 3. Sandy Routine & Gaming
    if (act === '3' || act === '[3]' || act.includes('routine') || act.includes('gaming') || act.includes('status')) {
      const s = sandyStatusService.getStatus();
      const routineReport =
        `🎮 *SANDY'S REAL-TIME ROUTINE & GAMING STATUS*\n\n` +
        `• *Current Activity:* "${s.activity || 'Working'}"\n` +
        `• *Availability:* \`${s.availability || 'busy'}\`\n` +
        `• *Gaming Realm/Server:* "${s.game_info || 'None specified'}"\n` +
        `• *Instructions for Callers:* "${s.contact_instructions || 'Take priority message if urgent.'}"\n\n` +
        `_💡 To update your live status, just text me naturally, e.g.:_\n` +
        `• "I am playing Minecraft on Hypixel realm: mc.hypixel.net"\n` +
        `• "Studying till 5pm"\n` +
        `• "Abhi so raha hu wake me at 7"`;
      recordUserMessage('wa_sandy_master', 'Action: View Routine');
      recordAssistantMessage('wa_sandy_master', routineReport, 80, 'gemini-3.8-flash');
      await this.safeSendMessage(remoteJid, { text: routineReport }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 4. Maintenance Mode Toggle
    if (act === '4' || act === '[4]' || act.includes('maintenance')) {
      const isMaint = isMaintenanceModeActive();
      if (isMaint) {
        await disableMaintenanceMode();
        const msgText = "🟢 *Maintenance Mode DEACTIVATED.* Public chat replies are now fully LIVE for all contacts! 🚀";
        recordUserMessage('wa_sandy_master', 'Action: Disable Maintenance Mode');
        recordAssistantMessage('wa_sandy_master', msgText, 25, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: msgText }, quotedMsg ? { quoted: quotedMsg } : {});
      } else {
        await enableMaintenanceMode();
        const msgText = "🛠️ *Maintenance Mode ACTIVATED.* Public chat replies for contacts are temporarily paused while you work! 🔒";
        recordUserMessage('wa_sandy_master', 'Action: Enable Maintenance Mode');
        recordAssistantMessage('wa_sandy_master', msgText, 25, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: msgText }, quotedMsg ? { quoted: quotedMsg } : {});
      }
      return;
    }

    // 5. Notes
    if (act === '5' || act === '[5]' || act.includes('note')) {
      const notes = getUserNotes('sandy');
      recordUserMessage('wa_sandy_master', 'Action: View Notes');
      if (!notes || notes.length === 0) {
        const noNotes = "📝 Boss Sandy, your persistent notepad is currently empty. You can add one by texting: `add note: <your text>`";
        recordAssistantMessage('wa_sandy_master', noNotes, 25, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: noNotes }, quotedMsg ? { quoted: quotedMsg } : {});
        return;
      }
      let notesReport = `📝 *SANDY'S PERSISTENT NOTES (${notes.length})*:\n\n`;
      for (const n of notes.slice(0, 10)) {
        notesReport += `• [#${n.id}] ${n.note_text} _(${new Date(n.created_at).toLocaleDateString()})_\n`;
      }
      recordAssistantMessage('wa_sandy_master', notesReport, 60, 'gemini-3.8-flash');
      await this.safeSendMessage(remoteJid, { text: notesReport }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 6. Latency Ping
    if (act === '6' || act === '[6]' || act.includes('ping')) {
      const pingText = `Pong! 🏓 MasterBot is live on *gemini-3.8-flash* (High Reasoning) with active low-latency dual bridge. 🟢`;
      recordUserMessage('wa_sandy_master', 'Action: Latency Ping');
      recordAssistantMessage('wa_sandy_master', pingText, 20, 'gemini-3.8-flash');
      await this.safeSendMessage(remoteJid, { text: pingText }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 7. Stop Texting / Silent Mode Kill Switch
    if (act === '7' || act === '[7]' || act.includes('stop texting') || act.includes('resume texting') || act.includes('silent') || act.includes('freeze')) {
      const isSilent = isWhatsAppSilentModeActive();
      if (isSilent) {
        setWhatsAppSilentMode(false);
        const resText = "🟢 *SILENT MODE DEACTIVATED: REPLIES RESUMED* 🚀\nNero is now actively replying to WhatsApp contacts again. Full control is yours, Sandy!";
        recordUserMessage('wa_sandy_master', 'Action: Resume Texting');
        recordAssistantMessage('wa_sandy_master', resText, 25, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: resText }, quotedMsg ? { quoted: quotedMsg } : {});
      } else {
        setWhatsAppSilentMode(true);
        const haltText = "🛑 *KILL SWITCH ACTIVATED: STOP TEXTING EVERYONE* 🔒\nNero will NOT send any messages, replies, or notifications to anyone until you command it to resume!\n\n_Reply with 'resume texting' or tap option 7 anytime to lift this freeze._";
        recordUserMessage('wa_sandy_master', 'Action: Stop Texting Everyone');
        recordAssistantMessage('wa_sandy_master', haltText, 25, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: haltText }, quotedMsg ? { quoted: quotedMsg } : {});
      }
      return;
    }

    // 8. Executive Daily Digest
    if (act === '8' || act === '[8]' || act.includes('digest') || act.includes('summary')) {
      const digestText = sandyStatusService.getDailyExecutiveDigest();
      recordUserMessage('wa_sandy_master', 'Action: Executive Daily Digest');
      recordAssistantMessage('wa_sandy_master', digestText, 100, 'gemini-3.8-flash');
      await this.safeSendMessage(remoteJid, { text: digestText }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 9. Universal Cross-Chat Context
    if (act === '9' || act === '[9]' || act.includes('cross-chat') || act.includes('chat context') || act.includes('everyone')) {
      const universalSummary = sandyStatusService.getRecentChatsSummary(10);
      recordUserMessage('wa_sandy_master', 'Action: Cross-Chat Context');
      recordAssistantMessage('wa_sandy_master', universalSummary.summary, 120, 'gemini-3.8-flash');
      await this.safeSendMessage(remoteJid, { text: universalSummary.summary }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 10. Send Cyber Sticker
    if (act === '10' || act === '[10]' || act.includes('sticker')) {
      const stickerBuf = await stickerService.getPresetSticker('nero_cyber');
      await this.safeSendMessage(remoteJid, { sticker: stickerBuf }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }
  }

  /**
   * Interactive Poll & Buttons for First-Time Contact Character Choice
   */
  async sendCharacterSelectionButtons(remoteJid, quotedMsg = null, senderNumber = null) {
    const options = [
      '👤 Friend (Dost vibe, slang & banter)',
      '🤝 Brother (Bhai vibe, caring & supportive)',
    ];

    const sent = await this.safeSendMessage(
      remoteJid,
      {
        poll: {
          name: "👋 Choose Nero's Character Vibe:",
          values: options,
          selectableCount: 1,
        },
      },
      quotedMsg ? { quoted: quotedMsg } : {}
    );

    if (sent?.key?.id) {
      const pollEncKey =
        sent.message?.messageContextInfo?.messageSecret ||
        sent.message?.pollCreationMessageV3?.messageSecret ||
        sent.message?.pollCreationMessage?.messageSecret;
      this.activePolls.set(sent.key.id, {
        type: 'character_selection',
        options,
        pollEncKey,
        senderNumber,
        remoteJid,
        createdAt: Date.now(),
      });
      if (this.activePolls.size > 50) {
        const oldestKey = this.activePolls.keys().next().value;
        this.activePolls.delete(oldestKey);
      }
    }

    const menuText =
      `👋 *WELCOME! CHOOSE NERO'S CHARACTER VIBE*\n\n` +
      `Tap an option in the poll above, or reply with a number:\n\n` +
      `1️⃣ Reply \`1\` or \`friend\` — *Friend* (Chill dost, banter & informal street slang)\n` +
      `2️⃣ Reply \`2\` or \`brother\` — *Brother* (Bhai vibe, caring, protective & supportive)\n\n` +
      `_You can switch anytime by saying 'change character to brother' or 'friend'!_ ✨`;

    await this.safeSendMessage(remoteJid, { text: menuText }, quotedMsg ? { quoted: quotedMsg } : {});
  }

  /**
   * Interactive Action Buttons when asking about Sandy's routine/whereabouts
   */
  async sendSandyActionButtons(remoteJid, quotedMsg = null, senderNumber = null) {
    const options = [
      '🚨 Send Urgent Talk Request',
      '🔔 Notify When Sandy Is Available',
      '📝 Leave Note for Sandy',
      '🤙 Request Call Back',
    ];

    const sent = await this.safeSendMessage(
      remoteJid,
      {
        poll: {
          name: '📌 Need to connect with Sandy?',
          values: options,
          selectableCount: 1,
        },
      },
      quotedMsg ? { quoted: quotedMsg } : {}
    );

    if (sent?.key?.id) {
      const pollEncKey =
        sent.message?.messageContextInfo?.messageSecret ||
        sent.message?.pollCreationMessageV3?.messageSecret ||
        sent.message?.pollCreationMessage?.messageSecret;
      this.activePolls.set(sent.key.id, {
        type: 'sandy_action',
        options,
        pollEncKey,
        senderNumber,
        remoteJid,
        createdAt: Date.now(),
      });
      if (this.activePolls.size > 50) {
        const oldestKey = this.activePolls.keys().next().value;
        this.activePolls.delete(oldestKey);
      }
    }

    const menuText =
      `📌 *QUICK ACTIONS FOR SANDY:*\n\n` +
      `Tap an option in the poll above, or reply with a shortcut:\n\n` +
      `1️⃣ \`urgent <message>\` — Priority alert in Sandy's VIP inbox\n` +
      `2️⃣ \`notify\` — Instant ping as soon as Sandy is back online\n` +
      `3️⃣ \`note: <message>\` — Leave a personal note on Sandy's desk\n` +
      `4️⃣ \`call back\` — Request an urgent phone call back from Sandy 🤙✨`;

    await this.safeSendMessage(remoteJid, { text: menuText }, quotedMsg ? { quoted: quotedMsg } : {});
  }

  /**
   * Handles character selection button / poll votes
   */
  async handleCharacterSelectionAction(matchedOption, remoteJid, quotedMsg = null, senderNumber = null) {
    const sNum = senderNumber || String(remoteJid).replace(/[^0-9]/g, '');
    const opt = String(matchedOption).toLowerCase();
    const isBro = opt.includes('brother') || opt.includes('bhai') || opt === '2';
    const role = isBro ? 'brother' : 'friend';
    sandyStatusService.setContactCharacter(sNum, role);

    const confText = isBro
      ? `🤝 *Brother (Bhai) Vibe Activated!*\nAb se main tumse as a caring Brother baat karunga. Tension mat le mere bhai, bata kya scene hai! ✨`
      : `👤 *Friend (Dost) Vibe Activated!*\nAb se main tumse as a chill Friend baat karungi. Bol yaar kya chal raha hai? ✨`;

    recordAssistantMessage(`wa_${remoteJid}`, confText, 25, 'gemini-3.5-flash-lite');
    await this.safeSendMessage(remoteJid, { text: confText }, quotedMsg ? { quoted: quotedMsg } : {});
  }

  /**
   * Handles Sandy action buttons (urgent request / notify when available / leave note / call back)
   */
  async handleSandyContactAction(matchedOption, remoteJid, quotedMsg = null, senderNumber = null, senderName = 'Contact') {
    const sNum = senderNumber || String(remoteJid).replace(/[^0-9]/g, '');
    const opt = String(matchedOption).toLowerCase();

    if (opt.includes('urgent') || opt === '1') {
      const askText = `📬 *Leave an Urgent Talk Request for Sandy:*\nPlease reply with: \`urgent <your message>\` (e.g. \`urgent please call me back asap\`), and I will log it straight into Sandy's Master Console inbox! ✨`;
      recordAssistantMessage(`wa_${remoteJid}`, askText, 30, 'gemini-3.5-flash-lite');
      await this.safeSendMessage(remoteJid, { text: askText }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    if (opt.includes('notify') || opt === '2') {
      const res = sandyStatusService.addAvailabilitySubscriber({
        senderNumber: sNum,
        senderName,
        remoteJid,
      });
      const respText = res.alreadySubscribed
        ? `🔔 *Already on the alert list!*\nJaise hi Sandy online ya free hoga, main tumhe sabse pehle ping kar doongi! ✨`
        : `🔔 *Notification Alert Activated!*\nNoted! As soon as Sandy texts that he is back online or free, I will send you an instant WhatsApp ping right here! 🚀`;
      recordAssistantMessage(`wa_${remoteJid}`, respText, 25, 'gemini-3.5-flash-lite');
      await this.safeSendMessage(remoteJid, { text: respText }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    if (opt.includes('note') || opt === '3') {
      const noteAsk = `✍️ *Leave a Personal Note for Sandy:*\nPlease reply with: \`note: <your message>\` (or simply type your message), and I will place it directly onto Sandy's personal desk! 📝✨`;
      recordAssistantMessage(`wa_${remoteJid}`, noteAsk, 25, 'gemini-3.5-flash-lite');
      await this.safeSendMessage(remoteJid, { text: noteAsk }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    if (opt.includes('call') || opt === '4') {
      sandyStatusService.addUrgentRequest({
        senderNumber: sNum,
        senderName,
        messageText: 'Requested urgent phone call back 🤙',
        urgency: 'high',
      });
      await this.notifyTelegramOwner(
        `🤙 *[WHATSAPP CALL BACK REQUEST]*\n*From:* ${senderName} (\`+${sNum}\`)\n*Status:* Contact tapped "Request Call Back" on WhatsApp!`
      );
      const callAck = `🤙 *Call Back Request Delivered!*\nMaine Sandy ko direct call-back alert bhej diya hai with high priority. Jaise hi wo free hoga, he will hit you up! ⚡`;
      recordAssistantMessage(`wa_${remoteJid}`, callAck, 25, 'gemini-3.5-flash-lite');
      await this.safeSendMessage(remoteJid, { text: callAck }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }
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

    // Handle Interactive WhatsApp Poll Button Clicks
    if (msg.message?.pollUpdateMessage) {
      const pollKey = msg.message.pollUpdateMessage.pollCreationMessageKey;
      const pollId = pollKey?.id;
      const pollData = this.activePolls.get(pollId);
      if (pollData && pollData.pollEncKey) {
        try {
          const voterJid = msg.key.participant || msg.key.remoteJid;
          let voteMsg = null;
          const creatorCandidates = [
            this.sock?.user?.id,
            this.sock?.user?.lid,
            voterJid,
          ].filter(Boolean);

          for (const cand of creatorCandidates) {
            try {
              voteMsg = decryptPollVote(msg.message.pollUpdateMessage.vote, {
                pollCreatorJid: cand,
                pollMsgId: pollId,
                pollEncKey: pollData.pollEncKey,
                voterJid,
              });
              if (voteMsg?.selectedOptions?.length > 0) break;
            } catch {}
          }
          if (voteMsg?.selectedOptions?.length > 0) {
            const selectedBytes = voteMsg.selectedOptions[0];
            const matchedOption = pollData.options.find((opt) => {
              const h = crypto.createHash('sha256').update(opt).digest();
              return Buffer.compare(Buffer.from(h), Buffer.from(selectedBytes)) === 0;
            });
            if (matchedOption) {
              if (pollData.type === 'character_selection') {
                await this.handleCharacterSelectionAction(matchedOption, remoteJid, msg, pollData.senderNumber);
              } else if (pollData.type === 'sandy_action') {
                await this.handleSandyContactAction(matchedOption, remoteJid, msg, pollData.senderNumber);
              } else {
                await this.executeOwnerAction(matchedOption, remoteJid, msg);
              }
              return;
            }
          }
        } catch (pollErr) {
          console.warn('[WhatsApp Poll Decrypt Warning]:', pollErr.message);
        }
      }
      return;
    }

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

    // Extract audio / voice note payload if present
    const audioMessage = msg.message?.audioMessage;
    const isAudio = Boolean(audioMessage);

    // Extract text content or caption
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      msg.message.documentMessage?.caption ||
      '';

    const trimmed = (text || '').trim();
    if (!trimmed && !isImage && !isVideo && !isAudio) return;

    this.messageCount++;
    this.lastActivity = new Date().toISOString();

    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup ? msg.key.participant : remoteJid;
    const senderNumber = (senderJid || '').replace(/[^0-9]/g, '');
    const senderName = msg.pushName || senderNumber || 'Friend';
    const isFromMe = Boolean(msg.key.fromMe);

    const myPhone = (this.sock?.user?.id || '').split(':')[0].replace(/[^0-9]/g, '');
    const myLid = (this.sock?.user?.lid || '').split(':')[0].replace(/[^0-9]/g, '');
    const ownerConfigPhone = (config.whatsAppOwnerNumber || '').replace(/[^0-9]/g, '');
    const remoteClean = (remoteJid || '').replace(/[^0-9]/g, '');

    // True self-chat in WhatsApp "Message Yourself" (supports both Phone JID and MD LID):
    const isSelfChat = isFromMe && (
      (Boolean(myPhone) && remoteClean.includes(myPhone)) ||
      (Boolean(myLid) && remoteClean.includes(myLid)) ||
      (Boolean(ownerConfigPhone) && remoteClean.includes(ownerConfigPhone)) ||
      remoteJid === this.sock?.user?.lid ||
      remoteJid === this.sock?.user?.id ||
      (!isGroup && (remoteClean === myPhone || remoteClean === myLid || remoteClean === ownerConfigPhone))
    );

    const isOwnerSender = isSelfChat ||
      (Boolean(ownerConfigPhone) && senderNumber === ownerConfigPhone) ||
      (Boolean(myPhone) && senderNumber === myPhone) ||
      (Boolean(myLid) && senderNumber === myLid);

    const isSandy = isOwnerSender;

    console.log(`[WhatsApp Incoming] remoteJid=${remoteJid}, senderNumber=${senderNumber}, fromMe=${isFromMe}, isSelfChat=${isSelfChat}, isSandy=${isSandy}, text="${trimmed.slice(0, 60)}"`);

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
    // 🎙️ AUDIO / VOICE NOTE INTAKE HANDLER
    // ==========================================
    if (isAudio && audioMessage) {
      try {
        await this.sock.sendPresenceUpdate('recording', remoteJid).catch(() => {});
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: pino({ level: 'silent' }),
            reuploadRequest: this.sock.updateMediaMessage,
          }
        );

        const durationSec = audioMessage.seconds || 0;
        const mime = audioMessage.mimetype || 'audio/ogg; codecs=opus';
        const savedMeta = await mediaManager.saveMedia({
          senderNumber,
          senderName,
          fileBuffer: buffer,
          fileType: 'audio',
          mimeType: mime,
          caption: `Voice Note (${durationSec}s)`,
          originalMessageId: msg.key?.id,
        });

        // 🎙️ Transcribe and generate conversational reply with Gemini Multimodal AI
        const characterRole = sandyStatusService.getContactCharacter(senderNumber) || 'friend';
        const voiceResult = await voiceNoteService.processVoiceNote({
          buffer,
          mimeType: mime,
          senderName,
          senderNumber,
          isSandy,
          durationSec,
          characterRole,
        });

        const chatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
        recordUserMessage(chatId, `🎙️ [Voice Note (${durationSec}s)]: "${voiceResult.transcription}"`);
        recordAssistantMessage(chatId, voiceResult.reply, 80, isSandy ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite');

        if (!isSandy) {
          sandyStatusService.recordContactInteraction(
            senderNumber,
            senderName,
            `[Voice Note]: ${voiceResult.transcription}`
          );
        }

        if (isSandy) {
          const sandyVoiceReply =
            `🎙️ *[Voice Note Heard & Transcribed]* (${durationSec}s):\n` +
            `"${voiceResult.transcription}"\n\n` +
            `${voiceResult.reply}\n\n` +
            `_File saved to vault:_ \`${savedMeta.fileName}\` 💾`;
          await this.safeSendMessage(remoteJid, { text: sandyVoiceReply }, { quoted: msg });
        } else {
          if (!isWhatsAppSilentModeActive()) {
            const contactVoiceReply =
              `🎙️ *[Heard Voice Note - ${durationSec}s]*: "${voiceResult.transcription}"\n\n` +
              `${voiceResult.reply}`;
            await this.safeSendMessage(remoteJid, { text: contactVoiceReply }, { quoted: msg });
          }
          this.notifyTelegramOwner(
            `🎙️ *[WhatsApp Voice Note Transcribed]*\n` +
            `*From:* ${senderName} (\`+${senderNumber}\`)\n` +
            `*Duration:* ${durationSec}s\n` +
            `*Speech:* "${voiceResult.transcription}"\n` +
            `*Nero Reply:* "${voiceResult.reply}"\n` +
            `*Saved File:* \`${savedMeta.fileName}\``
          );
        }
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (audioErr) {
        console.error('[WhatsApp Audio Intake Error]:', audioErr.message);
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

        // If user explicitly asks to convert this image into a sticker
        if (/\b(?:sticker|make\s+sticker|turn\s+into\s+sticker|create\s+sticker)\b/i.test(promptText)) {
          const stickerBuf = await stickerService.createStickerFromBuffer(buffer);
          await this.safeSendMessage(remoteJid, { sticker: stickerBuf }, { quoted: msg });
          await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }

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
    // 🎨 STICKER INTAKE & GENERATION PIPELINE
    // ==========================================
    if (stickerService.isStickerRequest(promptText)) {
      try {
        const role = isSandy ? 'friend' : (sandyStatusService.getContactCharacter(senderNumber) || 'friend');
        const stickerType = stickerService.pickStickerType(promptText, role);
        const stickerBuf = await stickerService.getPresetSticker(stickerType);
        await this.safeSendMessage(remoteJid, { sticker: stickerBuf }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (stkErr) {
        console.error('[WhatsApp Sticker Error]:', stkErr.message);
      }
    }

    // ==========================================
    // 👑 MASTERBOT CONSOLE (SANDY'S PERSONAL CHAT)
    // ==========================================
    if (isSandy) {
      // 0. MasterBot Interactive Action Menu & Button Triggers
      if (/^(?:menu|\/menu|buttons|\/buttons|controls|\/controls|actions|\/actions|help|\/help)$/i.test(promptText)) {
        await this.sendMasterBotMenu(remoteJid, msg);
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 1-tap numeric button shortcut: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
      if (/^\[?(10|[1-9])\]?$/.test(promptText)) {
        await this.executeOwnerAction(promptText.replace(/[^0-9]/g, ''), remoteJid, msg);
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Natural Language Outbound Outreach: "Text <Name/No>: <msg>" or "/wa_send <Name/No> <msg>"
      const outreachMatch = promptText.match(/^(?:(?:text|message|msg|tell|send\s+(?:a\s+)?(?:text|message)\s+to)\s+([^:\n]+?)(?::|\s+that|\s+to|\s+saying)\s+(.+)$|\/wa_send\s+([^\s]+)\s+(.+)$)/i);
      if (outreachMatch) {
        const targetQuery = (outreachMatch[1] || outreachMatch[3]).trim();
        const rawMessage = (outreachMatch[2] || outreachMatch[4]).trim();
        const contact = sandyStatusService.findContactByNameOrNumber(targetQuery);

        recordUserMessage('wa_sandy_master', promptText);

        if (!contact) {
          const notFoundText =
            `⚠️ *Contact Not Found: "${targetQuery}"*\n\n` +
            `Boss Sandy! Mujhe "${targetQuery}" naam ya number se koi known contact nahi mila. ` +
            `Please specify their phone number directly (e.g. \`text 919876543210: ${rawMessage}\`)! 🔍`;
          recordAssistantMessage('wa_sandy_master', notFoundText, 30, 'gemini-3.8-flash');
          await this.safeSendMessage(remoteJid, { text: notFoundText }, { quoted: msg });
          await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }

        const targetJid = `${contact.sender_number}@s.whatsapp.net`;
        const formattedOutreach = buildOutreachMessage({
          contactName: contact.sender_name || 'Friend',
          messageText: rawMessage,
          senderTitle: 'Sandy',
        });

        try {
          await this.safeSendMessage(targetJid, { text: formattedOutreach });
          recordAssistantMessage(`wa_${targetJid}`, formattedOutreach, 80, 'gemini-3.8-flash');

          const dispatchAck =
            `✅ *OUTREACH DISPATCHED TO ${contact.sender_name ? contact.sender_name.toUpperCase() : 'CONTACT'}!* 🚀\n\n` +
            `• *Recipient:* ${contact.sender_name || 'Contact'} (\`+${contact.sender_number}\`)\n` +
            `• *Relation:* _${contact.relationship || 'Known Contact'}_\n\n` +
            `*Message Sent:*\n` +
            `"${rawMessage}"\n\n` +
            `_Delivered in Nero Personal Assistant format with emojis and professional styling. Standing by for their reply!_ ✨`;

          recordAssistantMessage('wa_sandy_master', dispatchAck, 40, 'gemini-3.8-flash');
          await this.safeSendMessage(remoteJid, { text: dispatchAck }, { quoted: msg });
        } catch (sendErr) {
          const failText = `❌ *Failed to deliver message to +${contact.sender_number}:* ${sendErr.message}`;
          recordAssistantMessage('wa_sandy_master', failText, 25, 'gemini-3.8-flash');
          await this.safeSendMessage(remoteJid, { text: failText }, { quoted: msg });
        }

        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Universal Cross-Chat Context: "Read everyone's chat" / "What is everyone talking about"
      if (/\b(?:read\s+everyone(?:'s)?\s+chat|what\s+is\s+everyone\s+talking\s+about|all\s+chats|summarize\s+(?:all\s+)?chats|sabki\s+chat\s+padh|everyone\s+context)\b/i.test(promptText)) {
        const universalSummary = sandyStatusService.getRecentChatsSummary(10);
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', universalSummary.summary, 120, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: universalSummary.summary }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check specific person's chat by Name or Number
      const readPersonMatch = promptText.match(/(?:read|show|check|kya\s+bola|what\s+did)\s+(?:chat|messages?|talk)\s+(?:of|from)?\s*([a-zA-Z0-9_+ -]+)/i) ||
                              promptText.match(/what\s+did\s+([a-zA-Z0-9_+ -]+)\s+(?:say|text|message)/i);
      if (readPersonMatch && readPersonMatch[1]) {
        const targetQuery = readPersonMatch[1].trim();
        // Skip if target query is generic words like 'sandy', 'everyone', 'all'
        if (!/^(?:everyone|all|sandy|me|system|menu)$/i.test(targetQuery)) {
          const historyResult = sandyStatusService.getContactChatHistory(targetQuery, 10);
          recordUserMessage('wa_sandy_master', promptText);
          recordAssistantMessage('wa_sandy_master', historyResult.text, 100, 'gemini-3.8-flash');
          await this.safeSendMessage(remoteJid, { text: historyResult.text }, { quoted: msg });
          await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
      }

      // Natural Language Emergency Kill Switch: "Stop texting everyone" / "Resume texting"
      if (/\b(?:stop\s+texting(?:\s+everyone)?|don'?t\s+text(?:\s+anyone)?|mute(?:\s+everyone|\s+all)?|silent\s+mode|freeze\s+(?:bot|chat)|shutup|chup\s+ho\s+ja|kisi\s+ko\s+reply\s+mat\s+karo)\b/i.test(promptText)) {
        setWhatsAppSilentMode(true);
        recordUserMessage('wa_sandy_master', promptText);
        const haltText = "🛑 *KILL SWITCH ACTIVATED: STOP TEXTING EVERYONE* 🔒\n\nNero has entered 100% silent mode for all WhatsApp contacts. I will NOT send any messages, replies, or notifications to anyone until you say \"resume texting\" or \"start texting\"!\n\n_Full control is in your hands, Sandy._";
        recordAssistantMessage('wa_sandy_master', haltText, 30, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: haltText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      if (/\b(?:resume\s+texting|start\s+texting(?:\s+everyone)?|unmute(?:\s+all)?|unfreeze|resume\s+replies|chalu\s+karo|shuru\s+karo)\b/i.test(promptText)) {
        setWhatsAppSilentMode(false);
        recordUserMessage('wa_sandy_master', promptText);
        const resText = "🟢 *SILENT MODE DEACTIVATED: REPLIES RESUMED* 🚀\n\nNero is now actively replying to WhatsApp contacts again. Standing by for your next instruction!";
        recordAssistantMessage('wa_sandy_master', resText, 30, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: resText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 0.5. Executive Daily Digest / Intelligence Recap
      if (/\b(?:summary|digest|recap|who\s+texted|aaj\s+kya\s+hua|daily\s+report|aaj\s+kisne\s+message\s+kiya)\b/i.test(promptText)) {
        const digestText = sandyStatusService.getDailyExecutiveDigest();
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', digestText, 100, 'gemini-3.8-flash');
        await this.safeSendMessage(remoteJid, { text: digestText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 1. Natural Language Status / Routine Update
      const statusUpdate = sandyStatusService.parseNaturalLanguageUpdate(promptText);
      if (statusUpdate.updated) {
        // If Sandy came back online, check for waiting availability subscribers and broadcast!
        if (statusUpdate.notifySubscribers) {
          const subscribers = sandyStatusService.getPendingAvailabilitySubscribers();
          if (subscribers && subscribers.length > 0) {
            for (const sub of subscribers) {
              const alertMsg = `🔔 *Alert from Nero Labs:*\nHey ${sub.sender_name || 'there'}! Sandy is back online and available right now! 🎉\nYou can text him directly now. ✨`;
              await this.safeSendMessage(sub.remote_jid, { text: alertMsg });
            }
            sandyStatusService.markSubscribersNotified(subscribers.map((s) => s.id));
            statusUpdate.summary += `\n\n📢 *Broadcast:* Dispatched availability alerts to ${subscribers.length} contact(s) waiting for you! 🚀`;
          }
        }

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
    let isAskingAboutSandy = false;
    let isFirstTimeContact = false;

    if (!isSandy) {
      // 0. EMERGENCY KILL SWITCH: Stop Texting Everyone / Silent Mode
      if (isWhatsAppSilentModeActive()) {
        console.log(`[WhatsApp Silent Mode] Dropping message from +${senderNumber} because Sandy activated Stop Texting.`);
        recordUserMessage(`wa_${remoteJid}`, promptText);
        if (/\b(?:urgent|emergency|zaroori|important)\b/i.test(promptText)) {
          sandyStatusService.addUrgentRequest({
            senderNumber,
            senderName,
            messageText: promptText,
            urgency: 'high',
          });
        }
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return; // Zero messages sent! 100% silent!
      }

      // Check if maintenance mode is active
      if (isMaintenanceModeActive()) {
        const maintMsg = "🛠️ *Sandy's AI Assistant is currently in brief maintenance mode.* Replies are paused for a few moments while updates finish. Thanks for your patience! 🚀";
        await this.safeSendMessage(remoteJid, { text: maintMsg }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Record contact interaction & build smart profile memory:
      sandyStatusService.recordContactInteraction(senderNumber, senderName, promptText);

      const existingCharacter = sandyStatusService.getContactCharacter(senderNumber);
      if (!existingCharacter) {
        isFirstTimeContact = true;
      }

      // Check if contact replied with character choice directly:
      const cleanPrompt = promptText.trim().toLowerCase();
      if (/^(?:1|2|friend|brother|dost|bhai)$/i.test(cleanPrompt)) {
        await this.handleCharacterSelectionAction(cleanPrompt, remoteJid, msg, senderNumber);
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check if contact asks to switch character/vibe:
      const changeVibeMatch = promptText.match(/\b(?:change|set|switch)\s+(?:character|vibe|role)(?:\s+to)?\s+(friend|brother|dost|bhai)\b/i);
      if (changeVibeMatch && changeVibeMatch[1]) {
        await this.handleCharacterSelectionAction(changeVibeMatch[1], remoteJid, msg, senderNumber);
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check if contact sends urgent message directly:
      const urgentMatch = promptText.match(/^urgent(?::|\s+)(.+)$/i);
      if (urgentMatch) {
        const uMsg = urgentMatch[1].trim();
        sandyStatusService.addUrgentRequest({
          senderNumber,
          senderName,
          messageText: uMsg,
          urgency: 'high',
        });
        await this.notifyTelegramOwner(
          `🚨 *[WHATSAPP URGENT INBOX]*\n*From:* ${senderName} (\`+${senderNumber}\`)\n*Message:* "${uMsg}"`
        );
        const confirmMsg = "✅ *Urgent request logged!* Maine Sandy ke VIP inbox mein direct deliver kar diya hai. Wo free hote hi dekhega! 📬";
        recordAssistantMessage(`wa_${remoteJid}`, confirmMsg, 25, 'gemini-3.5-flash-lite');
        await this.safeSendMessage(remoteJid, { text: confirmMsg }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check if contact asks for notification when Sandy becomes available:
      if (/^(?:notify|notify\s+me|remind\s+me|ping\s+me|alert\s+me)$/i.test(cleanPrompt)) {
        await this.handleSandyContactAction('notify', remoteJid, msg, senderNumber, senderName);
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check if contact leaves a direct note for Sandy
      const noteMatch = promptText.match(/^(?:note|leave\s+note)(?::|\s+)(.+)$/i);
      if (noteMatch) {
        const nMsg = noteMatch[1].trim();
        sandyStatusService.addUrgentRequest({
          senderNumber,
          senderName,
          messageText: `[Personal Note]: "${nMsg}"`,
          urgency: 'normal',
        });
        await this.notifyTelegramOwner(
          `📝 *[WHATSAPP CONTACT NOTE]*\n*From:* ${senderName} (\`+${senderNumber}\`)\n*Note:* "${nMsg}"`
        );
        const noteAck = `📝 *Note received!* Maine aapka message Sandy ke personal desk pe deliver kar diya hai. ✨`;
        recordAssistantMessage(`wa_${remoteJid}`, noteAck, 25, 'gemini-3.5-flash-lite');
        await this.safeSendMessage(remoteJid, { text: noteAck }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check if contact requests a call back
      if (/^(?:call\s+back|request\s+call|tell\s+sandy\s+to\s+call|call\s+me)$/i.test(cleanPrompt)) {
        await this.handleSandyContactAction('call', remoteJid, msg, senderNumber, senderName);
        await this.sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Detect if user is asking about Sandy:
      isAskingAboutSandy = /\b(?:where\s+is\s+sandy|sandy\s+kahan|sandy\s+kidhar|what\s+is\s+sandy\s+doing|kya\s+kar\s+raha\s+hai\s+sandy|talk\s+to\s+sandy|sandy\s+se\s+baat|is\s+sandy\s+free|is\s+sandy\s+online|sandy\s+available|sandy\s+se\s+milna)\b/i.test(promptText);

      // Check if contact is leaving an urgent message / important talk request generically
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
      const reasoningEffort = isSandy ? 'high' : 'none';
      const maxTokens = isSandy ? 1000 : (explicitLimit ? Math.min(explicitLimit * 2, 800) : 120);

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages,
        chatId,
        reasoningEffort,
        maxTokens,
      });

      let replyText = completion.text || 'I processed your request but have no response to return.';

      // Dynamic reply length intelligence:
      // 1. "Hy to Hy" rule -> casual greetings capped to 30 words (1-2 punchy sentences)
      // 2. Regular chats / questions -> crisp & punchy (max 50 words) unless explicit limit
      // 3. Explicit limits (e.g. "write a 500 word explanation") -> exact requested limit
      let maxWords = 50;
      if (explicitLimit) {
        maxWords = explicitLimit;
      } else if (isSandy) {
        maxWords = 800;
      } else if (detectedIntent === 'greeting') {
        maxWords = 30;
      }

      const minWords = 1;

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

      // Follow-up Interactive Live Action Buttons for Contacts:
      if (!isSandy && !isGroup) {
        if (isFirstTimeContact) {
          // If first-time contact, prompt them to choose their preferred vibe (Friend or Brother)
          await this.sendCharacterSelectionButtons(remoteJid, msg, senderNumber);
        } else if (isAskingAboutSandy) {
          // If asking where Sandy is / what he is doing, provide quick action buttons: Urgent or Notify When Available
          await this.sendSandyActionButtons(remoteJid, msg, senderNumber);
        }
      }
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

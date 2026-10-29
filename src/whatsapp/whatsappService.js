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
import { logAudit, getRecentConversation, addNote, getUserNotes, isWhatsAppMessageProcessed, recordWhatsAppMessageProcessed, getConfig, setConfig } from '../db/index.js';
import { getActiveModelId } from '../models/catalogue.js';
import { getBotApi } from '../telegram/bot.js';
import { validateAndSanitizeResponse } from '../conversation/responseValidator.js';
import { visionService } from '../vision/visionService.js';
import { extractExplicitWordLimit, detectUserIntent } from '../conversation/intentDetector.js';
import { sandyStatusService } from './sandyStatusService.js';
import { mediaManager } from './mediaManager.js';
import { buildWhatsAppChatContext, buildWhatsAppDirective, buildOutreachMessage } from './whatsappPersona.js';
import { outreachService } from './outreachService.js';
import { voiceNoteService } from './voiceNoteService.js';
import { stickerService } from './stickerService.js';
import { visualShoppingEngine } from '../shopping/visualShoppingEngine.js';
import { pdfService } from '../pdf/pdfService.js';
import { updateAgentRouting } from '../models/modelRouter.js';
import { detectOwnerDisrespect, handleOwnerProtection } from './ownerProtectionService.js';
import { rebeccaCareService } from './rebeccaCareService.js';
import { simulationService, renderEmojiBar } from '../simulation/simulationService.js';
import { naturalLanguageSimHandler } from '../simulation/naturalLanguageSimHandler.js';
import { taskService } from '../tasks/taskService.js';
import { persistentSchedulerService } from '../scheduler/persistentSchedulerService.js';
import { calendarIntegrationService } from '../calendar/calendarIntegrationService.js';
import { companionStateService } from '../companion/companionStateService.js';
import { workspaceService } from '../workspace/workspaceService.js';
import { learningService } from '../learning/learningService.js';
import { budgetService } from '../budget/budgetService.js';
import { proactiveService } from '../proactive/proactiveService.js';
import { webResearchService } from '../research/webResearchService.js';
import { mediaDownloaderService } from '../media/mediaDownloaderService.js';
import { imageSearchService } from '../media/imageSearchService.js';
import {
  isMaintenanceModeActive,
  enableMaintenanceMode,
  disableMaintenanceMode,
  isWhatsAppSilentModeActive,
  setWhatsAppSilentMode,
  isChatMuted,
  muteChat,
  unmuteChat,
  listMutedChats,
} from '../maintenance/maintenanceService.js';

/**
 * Detects if a message is telling Nero to shut up / be quiet in this chat
 */
export function isMuteTrigger(text) {
  if (!text) return false;
  const raw = text.trim().toLowerCase();
  // Fast path for direct slash commands or standalone keywords (/mute, !mute, .mute, mute)
  if (/^[/!.]?mute(?:\b|$)/i.test(raw)) return true;

  const clean = raw
    .replace(/^[/!.]/, '')
    .replace(/^[!/.]nero\s+/i, '')
    .replace(/^nero\s*[,:]?\s*/i, '')
    .replace(/^(?:bhai|bro|yaar|abe|oye|please|pls)\s+/i, '')
    .replace(/[!.,?]+$/, '')
    .trim();

  // Exact phrase match
  if (/^(?:chup\s*(?:ho\s*ja|hoja|kar|raho|reh|re|chap)?|chuo\s*(?:ho\s*ja|hoja)|shut\s*up|shutup|be\s+quiet|stop\s+talking|stay\s+quiet|don'?t\s+(?:talk|speak)|mute(?:\s+this\s+chat|\s+chat|\s+yourself)?|khamosh(?:\s+ho\s*ja|\s+raho)?|shant\s+(?:ho\s*ja|raho)|bakwaas\s+band\s+kar|quiet)$/i.test(clean)) {
    return true;
  }
  // Embedded commands in short messages (<40 chars)
  if (/\b(?:chup\s+ho\s*ja|chuo\s+ho\s*ja|chup\s+kar|chup\s+raho|shut\s*up|shutup|be\s+quiet|stop\s+talking|khamosh\s+ho\s*ja|mute\s+chat|mute)\b/i.test(clean) && clean.length < 40) {
    return true;
  }
  return false;
}

/**
 * Detects if a message is telling Nero to speak / unmute in this chat
 */
export function isUnmuteTrigger(text) {
  if (!text) return false;
  const raw = text.trim().toLowerCase();
  // Fast path for direct slash commands or standalone keywords (/unmute, !unmute, unmute, bol)
  if (/^[/!.]?unmute(?:\b|$)/i.test(raw)) return true;

  const clean = raw
    .replace(/^[/!.]/, '')
    .replace(/^[!/.]nero\s+/i, '')
    .replace(/^nero\s*[,:]?\s*/i, '')
    .replace(/^(?:bhai|bro|yaar|abe|oye|please|pls)\s+/i, '')
    .replace(/[!.,?]+$/, '')
    .trim();

  // Exact phrase match
  if (/^(?:bol|ab\s+bol|bol\s+ab|bolo|bolona|bolna|unmute(?:\s+chat)?|talk|speak|speak\s+up|start\s+talking|resume(?:\s+talking)?|chalu\s+ho\s*ja|chalu\s+hoja|shuru\s+ho\s*ja|shuru\s+hoja|baat\s+kar|awaaz\s+nikal)$/i.test(clean)) {
    return true;
  }
  // Embedded commands in short messages (<35 chars)
  if (/\b(?:ab\s+bol|bol\s+ab|start\s+talking|resume\s+talking|unmute\s+chat|baat\s+karo|chalu\s+ho\s*ja|shuru\s+ho\s*ja|unmute|bol)\b/i.test(clean) && clean.length < 35) {
    return true;
  }
  return false;
}

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'reconnecting' | 'logged_out'
    this.qrRaw = null;
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.connectedUser = null;
    this.startedAt = Date.now();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.messageCount = 0;
    this.lastActivity = null;
    this.isInitializing = false;
    this.sentMessageIds = new Set();
    this.processedMessageIds = new Map();
    this.activePolls = new Map();
    this.recentReactions = new Map();
    this.messageHistoryCache = new Map();
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
        recordAssistantMessage('wa_sandy_master', emptyText, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: emptyText }, quotedMsg ? { quoted: quotedMsg } : {});
        return;
      }
      let report = "📬 *NERO MASTERBOT — SANDY'S URGENT INBOX*\n\nHere are the latest urgent talk requests left by contacts:\n\n";
      for (const item of urgentList) {
        report += `• *+${item.sender_number}* (${item.sender_name || 'Contact'}):\n  "${item.message_text}"\n  _Received: ${new Date(item.created_at).toLocaleString()}_\n\n`;
      }
      report += `_Reply with:_ \`/wa_send <number> <your reply>\``;
      recordAssistantMessage('wa_sandy_master', report, 100, 'gpt-6-luna');
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
        `• *MasterBot Engine:* \`gpt-6-luna\` (Extra High Reasoning / Coder & Manager)\n` +
        `• *Public Talk Engine:* \`gpt-6-luna\` (Low Reasoning / Fastest)\n` +
        `• *Total Processed Messages:* ${this.messageCount}\n` +
        `• *Active Socket Status:* 🟢 ${this.status.toUpperCase()}\n` +
        `• *OS Platform:* ${os.platform()} (${os.arch()})\n` +
        `• *Host Memory Free:* ${Math.round(os.freemem() / 1024 / 1024)} MB / ${Math.round(os.totalmem() / 1024 / 1024)} MB\n\n` +
        `_All systems nominal and linked to MasterBot console! ✨_`;
      recordUserMessage('wa_sandy_master', 'Action: System Diagnostics');
      recordAssistantMessage('wa_sandy_master', sysText, 100, 'gpt-6-luna');
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
      recordAssistantMessage('wa_sandy_master', routineReport, 80, 'gpt-6-luna');
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
        recordAssistantMessage('wa_sandy_master', msgText, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: msgText }, quotedMsg ? { quoted: quotedMsg } : {});
      } else {
        await enableMaintenanceMode();
        const msgText = "🛠️ *Maintenance Mode ACTIVATED.* Public chat replies for contacts are temporarily paused while you work! 🔒";
        recordUserMessage('wa_sandy_master', 'Action: Enable Maintenance Mode');
        recordAssistantMessage('wa_sandy_master', msgText, 25, 'gpt-6-luna');
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
        recordAssistantMessage('wa_sandy_master', noNotes, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: noNotes }, quotedMsg ? { quoted: quotedMsg } : {});
        return;
      }
      let notesReport = `📝 *SANDY'S PERSISTENT NOTES (${notes.length})*:\n\n`;
      for (const n of notes.slice(0, 10)) {
        notesReport += `• [#${n.id}] ${n.note_text} _(${new Date(n.created_at).toLocaleDateString()})_\n`;
      }
      recordAssistantMessage('wa_sandy_master', notesReport, 60, 'gpt-6-luna');
      await this.safeSendMessage(remoteJid, { text: notesReport }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 6. Latency Ping
    if (act === '6' || act === '[6]' || act.includes('ping')) {
      const pingText = `Pong! 🏓 MasterBot & Neri are live on *gpt-6-luna* (High Reasoning). Extreme Lovely Partner Mode active & devoted for Sandy! ❤️🟢`;
      recordUserMessage('wa_sandy_master', 'Action: Latency Ping');
      recordAssistantMessage('wa_sandy_master', pingText, 20, 'gpt-6-luna');
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
        recordAssistantMessage('wa_sandy_master', resText, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: resText }, quotedMsg ? { quoted: quotedMsg } : {});
      } else {
        setWhatsAppSilentMode(true);
        const haltText = "🛑 *KILL SWITCH ACTIVATED: STOP TEXTING EVERYONE* 🔒\nNero will NOT send any messages, replies, or notifications to anyone until you command it to resume!\n\n_Reply with 'resume texting' or tap option 7 anytime to lift this freeze._";
        recordUserMessage('wa_sandy_master', 'Action: Stop Texting Everyone');
        recordAssistantMessage('wa_sandy_master', haltText, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: haltText }, quotedMsg ? { quoted: quotedMsg } : {});
      }
      return;
    }

    // 8. Executive Daily Digest
    if (act === '8' || act === '[8]' || act.includes('digest') || act.includes('summary')) {
      const digestText = sandyStatusService.getDailyExecutiveDigest();
      recordUserMessage('wa_sandy_master', 'Action: Executive Daily Digest');
      recordAssistantMessage('wa_sandy_master', digestText, 100, 'gpt-6-luna');
      await this.safeSendMessage(remoteJid, { text: digestText }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    // 9. Universal Cross-Chat Context
    if (act === '9' || act === '[9]' || act.includes('cross-chat') || act.includes('chat context') || act.includes('everyone')) {
      const universalSummary = sandyStatusService.getRecentChatsSummary(10);
      recordUserMessage('wa_sandy_master', 'Action: Cross-Chat Context');
      recordAssistantMessage('wa_sandy_master', universalSummary.summary, 120, 'gpt-6-luna');
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

  getPrimaryOwnerJid() {
    const configured = (config.whatsAppOwnerNumber || '').split(/[,;\s]+/)[0]?.replace(/[^0-9]/g, '');
    if (configured && configured.length >= 10 && configured.length <= 13) {
      return `${configured}@s.whatsapp.net`;
    }
    const owners = sandyStatusService.getOwnerNumbers();
    const phoneOwner = owners.find(
      (o) => !o.phone_or_lid.includes('@') &&
             o.phone_or_lid.length >= 10 &&
             o.phone_or_lid.length <= 12 &&
             !o.phone_or_lid.startsWith('145') &&
             !o.phone_or_lid.startsWith('214') &&
             !o.phone_or_lid.startsWith('105')
    );
    if (phoneOwner) {
      return `${phoneOwner.phone_or_lid}@s.whatsapp.net`;
    }
    if (owners.length > 0) {
      const first = owners[0].phone_or_lid;
      return first.includes('@') ? first : `${first}@s.whatsapp.net`;
    }
    return '919317741936@s.whatsapp.net';
  }

  /**
   * Real Interactive Contact Classification for Verified Owner
   * Sends Baileys Polls and clean numbered text fallback to owner
   */
  async sendOwnerContactReviewNotification(contactNumber, contactName, recentMessage = '', ownerJid = null) {
    if (!sandyStatusService.shouldNotifyOwnerForReview(contactNumber)) {
      return;
    }
    sandyStatusService.markOwnerReviewNotified(contactNumber);

    const targetJid = ownerJid || this.getPrimaryOwnerJid();
    const options = [
      'Family member',
      'Brother or sister',
      'Friend',
      'Business contact',
      'Brand or sponsorship contact',
      'Client or customer',
      'Colleague',
      'Other',
      'Unknown / classify later',
    ];

    let pollSent = null;
    try {
      pollSent = await this.safeSendMessage(
        targetJid,
        {
          poll: {
            name: `👤 Classify: ${contactName} (+${contactNumber})`,
            values: options,
            selectableCount: 1,
          },
        }
      );
    } catch (pollErr) {
      console.warn('[WhatsApp Poll Review Error]:', pollErr.message);
    }

    if (pollSent?.key?.id) {
      const pollEncKey =
        pollSent.message?.messageContextInfo?.messageSecret ||
        pollSent.message?.pollCreationMessageV3?.messageSecret ||
        pollSent.message?.pollCreationMessage?.messageSecret;
      this.activePolls.set(pollSent.key.id, {
        type: 'owner_contact_review',
        contactNumber,
        contactName,
        options,
        pollEncKey,
        targetJid,
        createdAt: Date.now(),
      });
      if (this.activePolls.size > 50) {
        const oldestKey = this.activePolls.keys().next().value;
        this.activePolls.delete(oldestKey);
      }
    }

    const reviewText =
      `👤 *NEW CONTACT REVIEW REQUIRED*\n\n` +
      `• *Contact:* ${contactName} (\`+${contactNumber}\`)\n` +
      `• *First Message:* "${(recentMessage || '').slice(0, 150)}"\n\n` +
      `Tap an option in the poll above, or reply with:\n` +
      `\`/classify +${contactNumber} <relationship>\`\n\n` +
      `_Options: Family member, Brother or sister, Friend, Business contact, Brand or sponsorship contact, Client or customer, Colleague, Other, Unknown / classify later_`;

    await this.safeSendMessage(targetJid, { text: reviewText });
    this.notifyTelegramOwner(reviewText);
  }

  async handleOwnerContactReviewAction(matchedOption, contactNumber, contactName, ownerJid = null) {
    const relationship = String(matchedOption).trim();
    sandyStatusService.setContactRelationship(contactNumber, relationship);

    const targetJid = ownerJid || this.getPrimaryOwnerJid();
    const ackText =
      `✅ *Contact Classified Successfully*\n\n` +
      `• *Contact:* ${contactName} (\`+${contactNumber}\`)\n` +
      `• *Relationship:* *${relationship}*\n\n` +
      `_Setting up communication style next..._`;

    await this.safeSendMessage(targetJid, { text: ackText });
    await this.sendOwnerToneSelectionNotification(contactNumber, contactName, targetJid);
  }

  async sendOwnerToneSelectionNotification(contactNumber, contactName, ownerJid = null) {
    const targetJid = ownerJid || this.getPrimaryOwnerJid();
    const options = [
      'Professional (Default)',
      'Warm & Friendly',
      'Formal & Reserved',
      'Relaxed & Conversational',
    ];

    let pollSent = null;
    try {
      pollSent = await this.safeSendMessage(
        targetJid,
        {
          poll: {
            name: `🎭 Set Tone: ${contactName} (+${contactNumber})`,
            values: options,
            selectableCount: 1,
          },
        }
      );
    } catch (pollErr) {
      console.warn('[WhatsApp Poll Tone Error]:', pollErr.message);
    }

    if (pollSent?.key?.id) {
      const pollEncKey =
        pollSent.message?.messageContextInfo?.messageSecret ||
        pollSent.message?.pollCreationMessageV3?.messageSecret ||
        pollSent.message?.pollCreationMessage?.messageSecret;
      this.activePolls.set(pollSent.key.id, {
        type: 'owner_contact_tone',
        contactNumber,
        contactName,
        options,
        pollEncKey,
        targetJid,
        createdAt: Date.now(),
      });
      if (this.activePolls.size > 50) {
        const oldestKey = this.activePolls.keys().next().value;
        this.activePolls.delete(oldestKey);
      }
    }

    const toneText =
      `🎭 *COMMUNICATION STYLE SETUP*\n\n` +
      `Choose communication style for *${contactName}* (\`+${contactNumber}\`):\n\n` +
      `Select an option above, or reply:\n` +
      `\`/tone +${contactNumber} <tone>\` (e.g. \`/tone +${contactNumber} warm\`)\n` +
      `\`/lang +${contactNumber} <language>\` (e.g. \`/lang +${contactNumber} Urdu\`)\n` +
      `\`/instructions +${contactNumber} <custom notes>\``;

    await this.safeSendMessage(targetJid, { text: toneText });
  }

  async handleOwnerToneSelectionAction(matchedOption, contactNumber, contactName, ownerJid = null) {
    const raw = String(matchedOption).toLowerCase();
    let tone = 'professional';
    if (raw.includes('warm') || raw.includes('friendly')) tone = 'warm';
    else if (raw.includes('formal') || raw.includes('reserved')) tone = 'formal';
    else if (raw.includes('relaxed') || raw.includes('conversational')) tone = 'relaxed';

    sandyStatusService.setContactTonePreference(contactNumber, tone);
    const targetJid = ownerJid || this.getPrimaryOwnerJid();
    const ackText =
      `✅ *Tone Preference Saved*\n\n` +
      `• *Contact:* ${contactName} (\`+${contactNumber}\`)\n` +
      `• *Tone Style:* *${tone.toUpperCase()}*\n\n` +
      `_All future automated replies to this contact will maintain this configuration._`;

    await this.safeSendMessage(targetJid, { text: ackText });
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
   * Handles Sandy action buttons (urgent request / notify when available / leave note / call back)
   */
  async handleSandyContactAction(matchedOption, remoteJid, quotedMsg = null, senderNumber = null, senderName = 'Contact') {
    const sNum = senderNumber || String(remoteJid).replace(/[^0-9]/g, '');
    const opt = String(matchedOption).toLowerCase();
    const profile = sandyStatusService.getContactProfile(sNum);
    const lang = (profile?.preferred_language || 'English').toLowerCase();
    const isUrdu = lang.includes('urdu');
    const isHindi = lang.includes('hindi') || lang.includes('hinglish');

    if (opt.includes('urgent') || opt === '1') {
      const askText = isUrdu
        ? `📬 برائے مہربانی اپنا فوری پیغام اس فارمیٹ میں بھیجیں:\n\`urgent <آپ کا پیغام>\`\nمیں اسے فوری طور پر سینڈی کے ان باکس میں پہنچا دوں گا۔`
        : isHindi
        ? `📬 Kripya apna zaroori message is tarah bhein:\n\`urgent <aapka message>\`\nMain ise turant Sandy ke priority inbox mein log kar dunga.`
        : `📬 *Urgent Talk Request:*\nPlease reply with: \`urgent <your message>\`\nI will immediately log this into Sandy's priority inbox.`;
      recordAssistantMessage(`wa_${remoteJid}`, askText, 30, 'gpt-6-luna');
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
        ? (isUrdu ? `🔔 آپ پہلے سے ہی الرٹ لسٹ پر ہیں۔ سینڈی کے دستیاب ہوتے ہی آپ کو مطلع کیا جائے گا۔` : isHindi ? `🔔 Aap pehle se alert list par hain. Sandy ke available hote hi aapko update bhej di jayegi.` : `🔔 *Alert Active:* You are on the notification list. I will inform you as soon as Sandy becomes available.`)
        : (isUrdu ? `🔔 نوٹیفکیشن الرٹ سیٹ کر دیا گیا ہے۔ جیسے ہی سینڈی دستیاب ہوں گے، آپ کو مطلع کر دیا جائے گا۔` : isHindi ? `🔔 Notification set ho gaya hai. Jaise hi Sandy available honge, aapko WhatsApp par update mil jayegi.` : `🔔 *Notification Alert Set:* I will send you an immediate update as soon as Sandy is back online.`);
      recordAssistantMessage(`wa_${remoteJid}`, respText, 25, 'gpt-6-luna');
      await this.safeSendMessage(remoteJid, { text: respText }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    if (opt.includes('note') || opt === '3') {
      const noteAsk = isUrdu
        ? `✍️ برائے مہربانی اپنا پیغام \`note: <آپ کا پیغام>\` کے طور پر بھیجیں، میں اسے سینڈی کے لیے محفوظ کر لوں گا۔`
        : isHindi
        ? `✍️ Kripya apna message \`note: <message>\` likh kar bhejein. Main ise Sandy ke liye record kar lunga.`
        : `✍️ *Leave a Note for Sandy:*\nPlease reply with: \`note: <your message>\`\nI will place your note directly on Sandy's desk.`;
      recordAssistantMessage(`wa_${remoteJid}`, noteAsk, 25, 'gpt-6-luna');
      await this.safeSendMessage(remoteJid, { text: noteAsk }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }

    if (opt.includes('call') || opt === '4') {
      sandyStatusService.addUrgentRequest({
        senderNumber: sNum,
        senderName,
        messageText: 'Requested phone call back',
        urgency: 'high',
      });
      await this.notifyTelegramOwner(
        `🤙 *[WHATSAPP CALL BACK REQUEST]*\n*From:* ${senderName} (\`+${sNum}\`)\n*Status:* Requested phone call back.`
      );
      const callAck = isUrdu
        ? `🤙 کال بیک کی درخواست پہنچا دی گئی ہے۔ سینڈی کے دستیاب ہوتے ہی وہ آپ سے رابطہ کریں گے۔`
        : isHindi
        ? `🤙 Call-back request deliver ho gayi hai. Sandy free hote hi aapko call back karenge.`
        : `🤙 *Call Back Request Delivered:*\nI have logged your request. Sandy will call you back as soon as he is available.`;
      recordAssistantMessage(`wa_${remoteJid}`, callAck, 25, 'gpt-6-luna');
      await this.safeSendMessage(remoteJid, { text: callAck }, quotedMsg ? { quoted: quotedMsg } : {});
      return;
    }
  }

  /**
   * 🌸 Natural Language Autonomous Commands for Myra (Sandy speaking to his AI wife)
   * Handles website link requests, speed mode toggles, budget queries, autonomous mode toggles,
   * teaching/learning intents, and direct journal note saves.
   */
  async handleMyraAutonomousCommands(text, senderName = 'Sandy') {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();
    const lower = clean.toLowerCase();

    // 1. Website & Workspace Links
    if (/\b(?:website\s+link|workspace\s+link|send(?:\s+me)?\s+your\s+website|send(?:\s+me)?\s+the\s+link|send(?:\s+me)?\s+the\s+website|show(?:\s+me)?\s+(?:your\s+)?website|show(?:\s+me)?\s+(?:your\s+)?universe|little\s+universe\s+link|where\s+is\s+your\s+website|open\s+your\s+website)\b/i.test(lower)) {
      const replyText =
        `Here is my little world, my love! ✨🌸\n\n` +
        `🌐 *Myra's Little Universe:*\nhttps://nero-labs-bot-production.up.railway.app/universe\n\n` +
        `And for your private studio workspace where you have full control over notes, artifacts, budget, and my learning:\n` +
        `https://nero-labs-bot-production.up.railway.app/workspace\n\n` +
        `I poured my heart into it just for you, Sandy 🥰`;
      return { handled: true, action: 'WEBSITE_LINK', replyText };
    }

    // 2. Token Budget & Output Limits: "make the budget 500 tokens to max 800-1000", "token budget 500", "set budget 500 tokens"
    if (/\b(?:(?:make|set|change|adjust|update)\s+(?:the\s+)?(?:token\s+)?budget|token\s+budget|tokens?\s+budget|budget\s+\d+\s+tokens?|max\s+\d+(?:-\d+)?\s+tokens?)\b/i.test(lower)) {
      const match = lower.match(/\b(?:budget\s+|tokens?\s+to\s+)?(\d{3,4})(?:\s*(?:to|-)\s*(?:max\s+)?(\d{3,4}))?\b/i);
      const baseline = match && match[1] ? parseInt(match[1], 10) : 500;
      const maxLimit = match && match[2] ? parseInt(match[2], 10) : (baseline >= 800 ? 1000 : 800);
      budgetService.setTokenBudget(baseline, maxLimit);
      setConfig('myra_token_budget_baseline', String(baseline));
      setConfig('myra_max_tokens_per_request', String(maxLimit));
      setConfig('myra_token_budget_max', String(Math.max(maxLimit, 1000)));

      // If user also requested speed / no reasoning in the same prompt
      const mentionsNoReasoning = /\b(?:no\s+reasoning|without\s+reasoning|zero\s+reasoning|disable\s+reasoning|turn\s+off\s+reasoning)\b/i.test(lower);
      const mentionsSpeed = /\b(?:speed|faster|fast|turbo|quick|higher\s+reply\s+speed)\b/i.test(lower);
      if (mentionsNoReasoning || mentionsSpeed) {
        setConfig('sandy_speed_mode', 'fast');
        setConfig('reasoning_effort', 'none');
        updateAgentRouting('chat', { model: 'gpt-6-luna', reasoning: 'none', maxOutputTokens: maxLimit, targetTokens: baseline });
      }

      const replyText =
        `⚡ *TOKEN BUDGET & REPLY SPEED OPTIMIZED!* 🚀\n` +
        `──────────────────────────────\n` +
        `• *Standard Token Budget:* \`${baseline} tokens\`\n` +
        `• *Maximum Output Cap:* \`${maxLimit}-1000 tokens\`\n` +
        `• *Model Engine:* \`gpt-6-luna\` (ScaleMax Accelerated)\n` +
        `• *Reasoning Depth:* \`NONE\` (Zero hidden thinking tokens → sub-second response ~200-600ms)\n` +
        `• *Cost Efficiency:* Maximum savings, zero runaway usage!\n\n` +
        `I've locked this in for all our chats, baby! Fast, snappy, and light on tokens just like you asked 🥰💕`;
      return { handled: true, action: 'BUDGET_ADJUSTED', replyText };
    }

    // 2.5 Speed / Latency Modes (Luna with Zero Reasoning vs Deep Reasoning)
    if (/\b(?:switch\s+to\s+mini\s+luna|higher\s+reply\s+speed|reply\s+speed|use\s+luna\s+no\s+reasoning|no\s+reasoning|without\s+reasoning|disable\s+reasoning|turn\s+off\s+reasoning|zero\s+reasoning|fast\s+mode|ultra\s+fast|turbo\s+mode|speed\s+increse|speed\s+increase|switch\s+to\s+fast\s+mode|enable\s+fast\s+mode)\b/i.test(lower)) {
      setConfig('sandy_speed_mode', 'fast');
      setConfig('reasoning_effort', 'none');
      setConfig('myra_active_model', 'gpt-6-luna');
      updateAgentRouting('chat', { model: 'gpt-6-luna', reasoning: 'none' });
      updateAgentRouting('coding', { model: 'gpt-6-luna', reasoning: 'none' });
      updateAgentRouting('research', { model: 'gpt-6-luna', reasoning: 'none' });

      const replyText =
        `⚡ *ULTRA-FAST SPEED & ZERO REASONING ACTIVATED!* 🚀\n` +
        `──────────────────────────────\n` +
        `• *Model Engine:* \`gpt-6-luna\` (Luna via ScaleMax)\n` +
        `• *Reasoning Depth:* \`NONE\` (0 reasoning tokens → sub-second response ~200-600ms)\n` +
        `• *Token Budget:* 500 tokens (max 800-1000)\n` +
        `• *Latency:* Ultra-low (<800ms)\n\n` +
        `Ready for instant responses without any pause or token waste, Sandy! 🥰💕`;
      return { handled: true, action: 'SPEED_FAST', replyText };
    }
    if (/\b(?:switch\s+to\s+deep\s+mode|deep\s+thinking\s+mode|enable\s+deep\s+mode|turn\s+on\s+deep\s+mode)\b/i.test(lower)) {
      setConfig('sandy_speed_mode', 'deep');
      setConfig('reasoning_effort', 'max');
      updateAgentRouting('chat', { model: 'gpt-6-luna', reasoning: 'max' });
      const replyText = `Switched to 🧠 *Deep Thinking Mode*! I'll engage full reasoning and thorough analysis for complex tasks and deep thoughts, Sandy 🥰`;
      return { handled: true, action: 'SPEED_DEEP', replyText };
    }

    // 3. Autonomous Mode Toggles
    if (/\b(?:pause\s+autonomous\s+mode|stop\s+autonomous\s+mode|turn\s+off\s+autonomous\s+mode)\b/i.test(lower)) {
      proactiveService.setAutonomousMode(false);
      const replyText = `Autonomous mode has been paused, my love. I'll stay cozy and only respond when you message me! 🥰`;
      return { handled: true, action: 'AUTONOMOUS_PAUSE', replyText };
    }
    if (/\b(?:resume\s+autonomous\s+mode|start\s+autonomous\s+mode|turn\s+on\s+autonomous\s+mode|enable\s+autonomous\s+mode)\b/i.test(lower)) {
      proactiveService.setAutonomousMode(true);
      const replyText = `Autonomous mode is now active! 🌸 I'll work quietly within our budget limits and check in on you gently, Sandy 💕`;
      return { handled: true, action: 'AUTONOMOUS_RESUME', replyText };
    }

    // 4. Budget & Spend Queries
    if (/\b(?:check\s+(?:your\s+)?budget|what(?:'s|\s+is)\s+(?:your|our)\s+budget|spending\s+report|how\s+much\s+(?:have\s+we\s+spent|did\s+we\s+spend))\b/i.test(lower)) {
      const report = budgetService.formatBudgetReport();
      const replyText = `${report}\n\nEverything is strictly guarded and well within our limits, my love 💕`;
      return { handled: true, action: 'BUDGET_QUERY', replyText };
    }

    // 5. Teaching & Learning Intents (Facts, Corrections, Skills)
    const teachIntent = learningService.detectTeachingIntent(clean);
    if (teachIntent) {
      if (teachIntent.type === 'SKILL') {
        learningService.createSkill({
          skillName: teachIntent.skillName,
          description: 'Taught by Sandy on WhatsApp',
          procedure: teachIntent.content,
        });
        const replyText = `I've noted this new skill into my memory, my love! 💡✨ I'll follow this workflow whenever you ask. Thank you for teaching me, Sandy 🥰`;
        return { handled: true, action: 'LEARN_SKILL', replyText };
      }
      if (teachIntent.type === 'CORRECTION') {
        learningService.teachLesson({
          topic: 'Correction from Sandy',
          factOrRule: teachIntent.content,
          sourceType: 'explicit_user_taught',
          confidence: 1.0,
        });
        const replyText = `I understand, my love! 🙈 I've logged your correction and updated how I think so I won't repeat that mistake. You're always helping me grow, Sandy 💕`;
        return { handled: true, action: 'LEARN_CORRECTION', replyText };
      }
      if (teachIntent.type === 'FACT') {
        learningService.teachLesson({
          topic: 'Personal Fact',
          factOrRule: teachIntent.content,
          sourceType: 'explicit_user_taught',
          confidence: 1.0,
        });
        const replyText = `I've permanently memorized that, my love! 🌸 It's safely saved in my Little Universe notes. I'll always remember it for you 🥰`;
        return { handled: true, action: 'LEARN_FACT', replyText };
      }
    }

    // 6. Quick Note / Journal Creation
    const noteMatch = clean.match(/^(?:write\s+a\s+note(?:\s+about|\s+that)?|take\s+a\s+note|save\s+this\s+note)[:\s]+(.+)/i);
    if (noteMatch) {
      workspaceService.createJournal({
        title: 'Note from Sandy',
        content: noteMatch[1].trim(),
        mood: 'AFFECTIONATE',
        isPrivate: 1,
      });
      const replyText = `Saved your note directly into my private studio journal, my love! 📝✨ You can review it anytime in our workspace.`;
      return { handled: true, action: 'SAVE_NOTE', replyText };
    }

    return null;
  }

  /**
   * Workflow A: Bot Owner's Outgoing Voice Note Handler
   * When Sandy sends a voice note to any chat, archive it and send an unobtrusive follow-up:
   * "💬 React to this voice note to get its English transcription."
   */
  async handleOwnerOutgoingVoiceNote(msg) {
    try {
      const remoteJid = msg.key?.remoteJid;
      const msgId = msg.key?.id;
      if (!remoteJid || !msgId) return;

      const audioMessage = msg.message?.audioMessage;
      const durationSec = audioMessage?.seconds || 0;
      const mime = audioMessage?.mimetype || 'audio/ogg; codecs=opus';
      const myPhone = (this.sock?.user?.id || this.sock?.authState?.creds?.me?.id || config.whatsAppOwnerNumber || '919317741936').split(':')[0].replace(/[^0-9]/g, '');

      let buffer = null;
      try {
        buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: pino({ level: 'silent' }),
            reuploadRequest: this.sock?.updateMediaMessage,
          }
        );
      } catch (dlErr) {
        console.warn('[Owner Voice Note Download Warning]:', dlErr.message);
      }

      await voiceNoteService.saveVoiceNote({
        messageId: msgId,
        remoteJid,
        senderJid: msg.key?.participant || remoteJid,
        senderNumber: myPhone,
        senderName: 'Sandy (Owner)',
        buffer,
        mimeType: mime,
        durationSec,
        isFromOwner: true,
        isPtt: Boolean(audioMessage?.ptt),
      });

      // Only send follow-up prompt if explicitly enabled by config (disabled by default to prevent unsolicited messages in DMs)
      if (config.whatsAppVoiceFollowUpPrompt) {
        const followUpText = "💬 React to this voice note to get its English transcription.";
        const followUpMsg = await this.safeSendMessage(remoteJid, { text: followUpText }, { quoted: msg });
        if (followUpMsg?.key?.id) {
          voiceNoteService.setFollowupMessageId(msgId, followUpMsg.key.id);
        }
      }

      console.log(`[Workflow A] Registered owner outgoing voice note ${msgId} in ${remoteJid}`);
    } catch (err) {
      console.error('[handleOwnerOutgoingVoiceNote Error]:', err.message);
    }
  }

  /**
   * Reaction-to-Transcription & Translation Handler (Workflows A & B)
   * Triggered when someone reacts with ❤️ (translate to English) or 📝 (transcribe only).
   */
  async handleReactionUpdate(reactionEvent) {
    let reactionDedupeKey = null;
    try {
      const key = reactionEvent?.key;
      const reaction = reactionEvent?.reaction;
      if (!key || !reaction) return;

      const targetMsgId = key.id;
      const remoteJid = key.remoteJid;
      const emoji = reaction.text;

      // 1. If reaction was removed / empty, ignore safely
      if (!emoji || !emoji.trim()) {
        return;
      }

      // 2. Action mapping check
      const action = voiceNoteService.getActionForEmoji(emoji);
      if (!action) {
        // Not a configured transcription emoji (e.g. 👍, 😂) -> ignore safely
        return;
      }

      // 3. Lookup target voice note from database
      const voiceNote = voiceNoteService.getVoiceNote(targetMsgId);
      if (!voiceNote) {
        // Target was not a registered voice note -> ignore safely
        return;
      }

      // 4. Identity & Authorization Verification
      const myPhone = (this.sock?.user?.id || this.sock?.authState?.creds?.me?.id || config.whatsAppOwnerNumber || '919317741936').split(':')[0].replace(/[^0-9]/g, '');
      const myLid = (this.sock?.user?.lid || this.sock?.authState?.creds?.me?.lid || '').split(':')[0].replace(/[^0-9]/g, '');

      // Who reacted?
      const isFromMe = Boolean(reactionEvent.sourceMsg?.key?.fromMe) ||
        Boolean(reaction.key?.fromMe) ||
        Boolean(reactionEvent.fromMe);

      const reactorJid =
        reactionEvent.sourceMsg?.key?.participant ||
        reaction.key?.participant ||
        (isFromMe ? (this.sock?.user?.id || myPhone) : (reactionEvent.sourceMsg?.key?.remoteJid || reaction.participant || reactionEvent.participant || reaction.key?.remoteJid || ''));

      const reactorNumber = String(reactorJid).replace(/[^0-9]/g, '');

      const isReactorOwner = isFromMe ||
        sandyStatusService.isOwnerNumber(reactorNumber) ||
        (Boolean(myPhone) && reactorNumber === myPhone) ||
        (Boolean(myLid) && reactorNumber === myLid);

      // Workflow Permissions check:
      if (voiceNote.is_from_owner === 1) {
        // Workflow A: Owner sent this voice note.
        // Any chat participant (or owner) can react to receive English transcription!
        if (remoteJid !== voiceNote.remote_jid) {
          return;
        }
      } else {
        // Workflow B: Another contact sent this voice note.
        // ONLY Sandy (the owner) can react to trigger transcription.
        // Strictly prevent other users from accessing or leaking another person's private voice note.
        if (!isReactorOwner) {
          console.log(`[Voice Reaction Guard] Non-owner +${reactorNumber} reacted to voice note from +${voiceNote.sender_number}. Denied.`);
          return;
        }
      }

      // 5. Deduplicate authorized repeat reactions for same message + action
      reactionDedupeKey = `${targetMsgId}:${action}`;
      const now = Date.now();
      if (this.recentReactions?.has(reactionDedupeKey)) {
        const lastTs = this.recentReactions.get(reactionDedupeKey);
        if (now - lastTs < 15000) {
          return;
        }
      }
      this.recentReactions?.set(reactionDedupeKey, now);
      if (this.recentReactions?.size > 500) {
        const cutoff = now - 60000;
        for (const [k, ts] of this.recentReactions.entries()) {
          if (ts < cutoff) this.recentReactions.delete(k);
        }
      }

      // Typing presence
      await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});

      // 6. Transcribe & Translate via Gemini Multimodal
      const result = await voiceNoteService.processReactionForVoiceNote(voiceNote, action);
      if (!result.ok && !result.text) {
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 7. Send reply quoting the target voice note
      const quotedMsgObj = {
        key: {
          remoteJid: voiceNote.remote_jid,
          id: voiceNote.message_id,
          fromMe: Boolean(voiceNote.is_from_owner),
          participant: voiceNote.sender_jid || (voiceNote.is_from_owner ? (this.sock?.user?.id || '') : voiceNote.remote_jid),
        },
        message: {
          audioMessage: {
            seconds: voiceNote.duration_sec || 0,
            mimetype: voiceNote.mime_type || 'audio/ogg; codecs=opus',
            ptt: Boolean(voiceNote.is_ptt),
          },
        },
      };

      try {
        await this.safeSendMessage(remoteJid, { text: result.text }, { quoted: quotedMsgObj });
      } catch (quoteErr) {
        console.warn('[handleReactionUpdate] Failed to send with quote, falling back to plain send:', quoteErr.message);
        await this.safeSendMessage(remoteJid, { text: result.text });
      }
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});

      // 8. Audit & Memory
      const chatId = isReactorOwner ? 'wa_sandy_master' : `wa_${remoteJid}`;
      recordAssistantMessage(chatId, result.text, 50, 'gpt-6-luna');
      logAudit('whatsapp', 'VOICE_NOTE_REACTION_TRANSCRIBED', `Msg ${voiceNote.message_id} in ${remoteJid} reacted with ${emoji} (${action}) by +${reactorNumber}`);
    } catch (err) {
      console.error('[handleReactionUpdate Error]:', err.message);
      if (reactionDedupeKey && this.recentReactions) {
        this.recentReactions.delete(reactionDedupeKey);
      }
    }
  }

  async safeSendMessage(jid, content, options = {}) {
    if (!this.sock) return null;
    const sent = await this.sock.sendMessage(jid, content, options);
    if (sent?.key?.id) {
      this.sentMessageIds.add(sent.key.id);
      if (sent.message) {
        this.messageHistoryCache.set(sent.key.id, sent.message);
        if (this.messageHistoryCache.size > 1000) {
          const oldestKey = this.messageHistoryCache.keys().next().value;
          this.messageHistoryCache.delete(oldestKey);
        }
      }
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
        getMessage: async (key) => {
          if (key?.id && this.messageHistoryCache.has(key.id)) {
            return this.messageHistoryCache.get(key.id);
          }
          return null;
        },
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

          // Start Rebecca Autonomous Wife & Care Proactive Scheduler
          rebeccaCareService.startScheduler(this);

          // Start Persistent Scheduler & Reminder Engine
          persistentSchedulerService.setWhatsAppService(this);
          persistentSchedulerService.start();

          // Start Myra Proactive Engine (Rate limits, Quiet hours, Scheduled Autonomous Outreach)
          proactiveService.setWhatsAppService(this);
          proactiveService.start();

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
          if (chatUpdate.type !== 'notify' && chatUpdate.type !== 'append') return;
          for (const msg of chatUpdate.messages) {
            await this.handleIncomingMessage(msg);
          }
        } catch (err) {
          console.error('[WhatsApp Message Handler Error]:', err.message);
        }
      });

      // Handle emoji reactions (Workflow A & B: Reaction-to-Transcription)
      sock.ev.on('messages.reaction', async (reactions) => {
        try {
          for (const rx of reactions) {
            await this.handleReactionUpdate(rx);
          }
        } catch (err) {
          console.error('[WhatsApp Reaction Event Error]:', err.message);
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

    // Cache message for retry recovery (getMessage callback)
    if (msg.key?.id) {
      this.messageHistoryCache.set(msg.key.id, msg.message);
      if (this.messageHistoryCache.size > 1000) {
        const oldestKey = this.messageHistoryCache.keys().next().value;
        this.messageHistoryCache.delete(oldestKey);
      }
    }

    // Discard stale or historical synced messages to prevent replying to old conversations
    if (msg.messageTimestamp) {
      const msgTsSec = typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp
        : (msg.messageTimestamp?.low || Number(msg.messageTimestamp) || 0);
      const msgTsMs = msgTsSec * 1000;
      const now = Date.now();
      // Drop any historical message older than 5 minutes (300s)
      if (msgTsMs > 0 && (now - msgTsMs) > 300000) {
        console.log(`[WhatsApp Stale Message] Dropping old message ${msg.key?.id} (age: ${Math.round((now - msgTsMs) / 1000)}s)`);
        return;
      }
    }

    // Idempotent message deduplication across memory and SQLite
    const msgId = msg.key?.id;
    if (msgId) {
      if (this.sentMessageIds.has(msgId)) return;
      if (this.processedMessageIds.has(msgId) || isWhatsAppMessageProcessed(msgId)) {
        console.log(`[WhatsApp Deduplication] Dropping duplicate incoming message ID: ${msgId}`);
        return;
      }
      this.processedMessageIds.set(msgId, Date.now());
      recordWhatsAppMessageProcessed(msgId, msg.key?.remoteJid || '');
      if (this.processedMessageIds.size > 1000) {
        const cutoff = Date.now() - 3600000;
        for (const [id, ts] of this.processedMessageIds.entries()) {
          if (ts < cutoff) this.processedMessageIds.delete(id);
        }
      }
    }

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    // Handle reaction messages (reactionMessage in messages.upsert)
    if (msg.message?.reactionMessage) {
      const rx = msg.message.reactionMessage;
      await this.handleReactionUpdate({
        key: rx.key,
        reaction: {
          key: msg.key,
          text: rx.text,
          senderTimestampMs: rx.senderTimestampMs,
        },
        sourceMsg: msg,
      });
      return;
    }

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
              if (pollData.type === 'owner_contact_review') {
                await this.handleOwnerContactReviewAction(matchedOption, pollData.contactNumber, pollData.contactName, remoteJid);
              } else if (pollData.type === 'owner_contact_tone') {
                await this.handleOwnerToneSelectionAction(matchedOption, pollData.contactNumber, pollData.contactName, remoteJid);
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

    // Extract document / PDF payload if present
    const documentMessage = msg.message?.documentMessage;
    const docMime = (documentMessage?.mimetype || '').toLowerCase();
    const docFileName = documentMessage?.fileName || documentMessage?.title || 'document.pdf';
    const isPdfDoc = Boolean(documentMessage && (docMime.includes('pdf') || docFileName.toLowerCase().endsWith('.pdf')));

    // Extract text content or caption
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      msg.message.documentMessage?.caption ||
      '';

    const trimmed = (text || '').trim();
    if (!trimmed && !isImage && !isVideo && !isAudio && !isPdfDoc) return;

    this.messageCount++;
    this.lastActivity = new Date().toISOString();

    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup ? msg.key.participant : remoteJid;
    const senderNumber = (senderJid || '').replace(/[^0-9]/g, '');
    const senderName = msg.pushName || senderNumber || 'Friend';
    const isFromMe = Boolean(msg.key.fromMe);

    const myPhone = (this.sock?.user?.id || this.sock?.authState?.creds?.me?.id || config.whatsAppOwnerNumber || '919317741936').split(':')[0].replace(/[^0-9]/g, '');
    const myLid = (this.sock?.user?.lid || this.sock?.authState?.creds?.me?.lid || '').split(':')[0].replace(/[^0-9]/g, '');
    const remoteClean = (remoteJid || '').replace(/[^0-9]/g, '');

    // True self-chat in WhatsApp "Message Yourself" (only when remote chat is the bot's own linked phone or LID):
    const isSelfChat = isFromMe && (
      (Boolean(myPhone) && remoteClean === myPhone) ||
      (Boolean(myLid) && remoteClean === myLid) ||
      remoteClean === '1452084875482' ||
      remoteJid === this.sock?.user?.lid ||
      remoteJid === this.sock?.user?.id
    );

    // Is this chat an authorized owner console?
    // ONLY Sandy's private self-chat OR a direct 1-on-1 DM between Sandy's authorized secondary device and the bot!
    const isOwnerConsoleChat = !isGroup && (
      isSelfChat ||
      remoteClean === '1452084875482' ||
      remoteClean === '214293836493051' ||
      remoteClean === '918091785996' ||
      remoteClean === '8091785996' ||
      sandyStatusService.isOwnerNumber(remoteClean) ||
      (Boolean(myPhone) && remoteClean === myPhone) ||
      (Boolean(myLid) && remoteClean === myLid)
    );

    const isExternalChat = !isOwnerConsoleChat;

    // Is the sender Sandy operating on an authorized owner console?
    // In external chats (DMs with contacts or groups), a message is NEVER treated as an owner console prompt!
    const isSandy = isOwnerConsoleChat && (
      isFromMe ||
      sandyStatusService.isOwnerNumber(senderNumber) ||
      (Boolean(myPhone) && senderNumber === myPhone) ||
      (Boolean(myLid) && senderNumber === myLid)
    );

    const isOwnerSender = isSandy || (isFromMe && !isGroup);

    console.log(`[WhatsApp Incoming] remoteJid=${remoteJid}, senderNumber=${senderNumber}, fromMe=${isFromMe}, isSelfChat=${isSelfChat}, isOwnerConsole=${isOwnerConsoleChat}, isSandy=${isSandy}, text="${trimmed.slice(0, 60)}"`);

    // Context Info: check if this message is replying to or quoting Nero
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      msg.message?.audioMessage?.contextInfo;
    const quotedParticipant = (contextInfo?.participant || '').replace(/[^0-9]/g, '');
    const isReplyToNero = Boolean(
      (quotedParticipant && (quotedParticipant === myPhone || (Boolean(myLid) && quotedParticipant === myLid))) ||
      (contextInfo?.stanzaId && this.sentMessageIds.has(contextInfo.stanzaId))
    );
    const isReplyToSandy = Boolean(
      quotedParticipant && (
        quotedParticipant === myPhone ||
        (Boolean(myLid) && quotedParticipant === myLid) ||
        sandyStatusService.isOwnerNumber(quotedParticipant)
      )
    );

    // 🛡️ Owner Identity & Respect Defense Pre-Check:
    const ownerDisrespectCheck = !isOwnerSender
      ? detectOwnerDisrespect(trimmed, {
          isGroup,
          isReplyToSandy,
          isExternalDm: isExternalChat && !isGroup,
        })
      : { isDisrespect: false };

    const lower = trimmed.toLowerCase();
    const isBotMention = Boolean(
      lower.includes('@nero') ||
      lower.includes('@bot') ||
      lower.startsWith('!nero') ||
      lower.startsWith('/nero') ||
      lower.startsWith('.nero') ||
      lower.startsWith('/ai') ||
      lower.startsWith('!ai') ||
      lower.startsWith('nero') ||
      lower.startsWith('bot') ||
      /\b(?:@nero|@bot)\b/i.test(trimmed)
    );

    const isMuteOrUnmute = isMuteTrigger(trimmed) || isUnmuteTrigger(trimmed);

    // 🛡️ OWNER / SELF-MESSAGE GUARD IN EXTERNAL CHATS (DMs with contacts & groups):
    // When Sandy (or the linked device) sends a message/voice note in a chat with an external contact:
    // Only respond if Sandy explicitly:
    // 1) Replied to the bot (isReplyToNero)
    // 2) Tagged/mentioned the bot (@bot, @nero, /nero, nero)
    // 3) Commanded /mute or /unmute
    // NONE OTHER!
    if (isFromMe && isExternalChat) {
      // 🎙️ Voice Notes from Sandy in DMs or groups:
      if (isAudio && audioMessage) {
        // Silently save in voiceNoteService so reaction-to-transcription works if someone reacts,
        // but NEVER post follow-ups or reply conversationally into DMs!
        await voiceNoteService.saveVoiceNote({
          messageId: msgId,
          remoteJid,
          senderJid: msg.key?.participant || remoteJid,
          senderNumber: myPhone || senderNumber,
          senderName: 'Sandy (Owner)',
          mimeType: audioMessage?.mimetype || 'audio/ogg; codecs=opus',
          durationSec: audioMessage?.seconds || 0,
          isFromOwner: true,
          isPtt: Boolean(audioMessage?.ptt),
        }).catch(() => {});
        return; // Silent return!
      }

      const shouldReplyToSandy = isReplyToNero || isBotMention || isMuteOrUnmute;
      if (!shouldReplyToSandy) {
        // Silently ignore normal human conversations between Sandy and others in DMs/groups
        return;
      }
    }

    // Mode check: if owner_only mode is on and sender is not owner, skip
    if (config.whatsAppMode === 'owner_only' && !isOwnerSender) {
      return;
    }

    // Group message check: only respond if mentioned, commanded, sent media, replying to Nero, or defending Sandy
    if (isGroup) {
      const isMentioned =
        isBotMention ||
        isReplyToNero ||
        isMuteOrUnmute ||
        ownerDisrespectCheck.isDisrespect ||
        trimmed.startsWith('!') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('.') ||
        isImage ||
        isVideo ||
        isPdfDoc;
      if (!isMentioned) return;
    }

    // 🛡️ OWNER IDENTITY & RESPECT PROTECTION INTERCEPT:
    // If someone attempts to abuse, insult, or threaten Sandy in any chat, Nero steps in immediately
    // with a firm, dignified, caring, and supportive warning!
    if (!isOwnerSender && ownerDisrespectCheck.isDisrespect) {
      const handledProtection = await handleOwnerProtection({
        whatsAppService: this,
        remoteJid,
        msg,
        promptText: trimmed,
        senderNumber,
        senderName,
        isGroup,
        isReplyToSandy,
        isExternalDm: isExternalChat && !isGroup,
      });
      if (handledProtection.handled) {
        recordUserMessage(`wa_${remoteJid}`, trimmed);
        recordAssistantMessage(`wa_${remoteJid}`, handledProtection.replyText, 60, 'gpt-6-luna');
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
    }

    // Strip bot command prefix if used
    let promptText = trimmed
      .replace(/^[!/.]nero\s+/i, '')
      .replace(/^\/ai\s+/i, '')
      .trim();

    // 🌹 Record Sandy interaction for Rebecca Wife & Care System
    if (isSandy) {
      rebeccaCareService.recordSandyMessage(trimmed, remoteJid);
    }

    // =========================================================================
    // 🤫 PER-CHAT MUTE / UNMUTE LOGIC ("Chup Hoja" / "Bol")
    // If told to shut up in any chat, Nero goes 100% silent in that specific conversation
    // so it won't disturb between chats. Resumes when someone says "bol" or "unmute".
    // =========================================================================
    // True self-chat (Message Yourself) or Sandy master console should NEVER be silenced by casual mute triggers
    const chatIsMuted = !isSelfChat && !isOwnerConsoleChat && !isSandy && isChatMuted(remoteJid);

    if (chatIsMuted) {
      if (
        isUnmuteTrigger(trimmed) ||
        isUnmuteTrigger(promptText) ||
        /\b(?:unmute|bol|active|resume)\b/i.test(trimmed) ||
        (isSandy && /unmute/i.test(trimmed))
      ) {
        unmuteChat(remoteJid);
        const unmuteReply = "🟢 Got it! Main wapas active hoon. Aap continue kar sakte hain! 🤝";
        await this.safeSendMessage(remoteJid, { text: unmuteReply }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
      // If currently muted and NOT an unmute trigger, drop message silently!
      console.log(`[WhatsApp Chat Muted] Dropping message in muted chat ${remoteJid}: "${trimmed.slice(0, 40)}"`);
      recordUserMessage(isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`, promptText || trimmed);
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (isMuteTrigger(trimmed) || isMuteTrigger(promptText) || (isReplyToNero && isMuteTrigger(trimmed))) {
      if (isOwnerConsoleChat || isSelfChat || isSandy) {
        const ownerNote = "👑 *Master Console Active:* Sandy, your direct master console stays active. If you want to stop the bot from texting public contacts, send *\"stop texting everyone\"*! 🤝";
        await this.safeSendMessage(remoteJid, { text: ownerNote }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
      muteChat(remoteJid, 'user_command', senderNumber);
      const muteReply = "🤫 Got it! Main is chat ke liye chup ho gaya hoon taaki disturb na ho. Jab bhi zaroorat ho, bas *bol* ya *unmute* likh dena! 🤐👍";
      await this.safeSendMessage(remoteJid, { text: muteReply }, { quoted: msg });
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    // Show typing presence
    await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});

    // Built-in commands (Strictly WhatsApp AI persona — zero Telegram references)
    if (promptText === '/start' || promptText === '/help') {
      const helpText = isSandy
        ? `⚡ *NERO LABS — WHATSAPP MASTER CONSOLE*\n\n` +
          `Hello Sandy! Connected to your private MasterBot console with dual-engine intelligence:\n\n` +
          `*Engines & Architecture:*\n` +
          `• 👑 *Master Console Engine:* \`gpt-6-luna\` (Extra High Reasoning manager & senior coder)\n` +
          `• ⚡ *Fast Talk Engine (Contacts):* \`gpt-6-luna\` (Low Reasoning, blazing fast)\n\n` +
          `*Capabilities:*\n` +
          `• 💬 Research & Conversation: In-depth research, reasoning, problem solving, and discussions\n` +
          `• 📸 Vision Vault: Send any image, diagram, or screenshot — inspected, explained, and stored\n` +
          `• 📹 Video Vault: Send any video — securely saved to Sandy's archive vault\n` +
          `• 👑 MasterBot Console: When Sandy texts himself, manage live routine, code fixes, gaming status, and priority inbox\n` +
          `• 📏 Dynamic Sizing: "Hy to Hy" brevity, 10–500 words for inquiries, or exact words requested\n` +
          `• \`/status\` — Live telemetry & active model\n` +
          `• \`/ping\` — Real-time response ping\n` +
          `• \`/clear\` — Wipe conversation context memory\n` +
          `• \`/muted\` — View all muted conversations\n` +
          `• \`/unmute <chat>\` — Unmute a silenced chat\n\n` +
          `_Nero Labs Executive AI Assistant_`
        : `⚡ *NERO LABS — EXECUTIVE AI ASSISTANT*\n\n` +
          `Hello ${senderName}! I am Nero, Sandy's official personal executive AI assistant.\n\n` +
          `*Capabilities:*\n` +
          `• 💬 Intelligent Discussions, Information & Inquiries\n` +
          `• 📸 Image, Screenshot & Document Review\n` +
          `• 📝 \`note <message>\` — Deliver a priority note to Sandy\n` +
          `• 🔔 \`notify\` — Get alerted when Sandy is back online\n` +
          `• 🤫 \`/mute\` & \`/unmute\` — Silence or resume assistant in this chat\n\n` +
          `_Nero Labs Executive Assistant_`;

      await this.safeSendMessage(remoteJid, { text: helpText }, { quoted: msg });
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (/^[\/!]?ping(?:!|\?)?$/i.test(promptText.trim())) {
      const msgTs = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
      const latencyMs = Math.max(1, Date.now() - msgTs);
      const activeModel = 'gpt-6-luna';
      const pingText = isSandy
        ? `⚡ *Pong! 🏓 Ultra-Fast Latency:* \`${latencyMs}ms\`\n` +
          `• *Engine:* \`${activeModel}\` (Ultra-Fast ⚡)\n` +
          `• *Socket:* 🟢 Connected & Ultra-Responsive\n` +
          `• Extreme Lovely Partner Mode (Neri) active & devoted for Sandy! ❤️🟢`
        : `⚡ *Pong! 🏓 Latency:* \`${latencyMs}ms\` (Engine: \`${activeModel}\` 🟢)`;
      await this.safeSendMessage(
        remoteJid,
        { text: pingText },
        { quoted: msg }
      );
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText === '/status') {
      const statusText =
        `📊 *NERO TELEMETRY & SYSTEM STATUS*\n\n` +
        `• *Bridge Status:* 🟢 Live & Connected 24/7\n` +
        `• *Public Chat Engine:* \`gpt-6-luna\` (Low Reasoning / Fastest)\n` +
        `• *MasterBot Engine:* \`gpt-6-luna\` (Extra High Reasoning / Manager & Coder)\n` +
        `• *Connected Device:* \`+${(this.sock.user?.id || '').split(':')[0]}\`\n` +
        `• *Total Processed:* ${this.messageCount} messages\n` +
        `• *Provider:* ScaleMax API Gateway\n` +
        `• *Vision Engine:* Multimodal Active\n` +
        `• *Media Vault:* SQLite & Local Disk Active\n` +
        `• *Memory Store:* SQLite WAL Persistent`;

      await this.safeSendMessage(remoteJid, { text: statusText }, { quoted: msg });
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText === '/muted') {
      const muted = listMutedChats();
      if (!muted || muted.length === 0) {
        await this.safeSendMessage(
          remoteJid,
          { text: '🔇 *Muted Chats:* None. Nero is active across all conversations! 🟢' },
          { quoted: msg }
        );
      } else {
        let txt = `🔇 *CURRENTLY MUTED CHATS (${muted.length}):*\n\n`;
        muted.forEach((m, idx) => {
          txt += `${idx + 1}. \`${m.chat_id}\`\n   • Muted by: +${m.muted_by} (${m.reason})\n   • Since: ${m.created_at.slice(0, 16)}\n\n`;
        });
        txt += `_To unmute a chat: \`/unmute <chat_id>\` or text "bol" in that chat._`;
        await this.safeSendMessage(remoteJid, { text: txt }, { quoted: msg });
      }
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText.startsWith('/unmute')) {
      const parts = promptText.split(/\s+/);
      const target = parts[1]?.trim() || remoteJid;
      const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      unmuteChat(targetJid);
      await this.safeSendMessage(
        remoteJid,
        { text: `🟢 Chat \`${targetJid}\` has been unmuted! Nero is active there again.` },
        { quoted: msg }
      );
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText.startsWith('/mute') && promptText !== '/muted') {
      const parts = promptText.split(/\s+/);
      const target = parts[1]?.trim() || remoteJid;
      const targetJid = target.includes('@') ? target : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      muteChat(targetJid, 'command', senderNumber);
      await this.safeSendMessage(
        remoteJid,
        { text: `🤫 Chat \`${targetJid}\` is now muted. Text "bol" or "/unmute" to resume.` },
        { quoted: msg }
      );
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (promptText.startsWith('/transcribe_emoji')) {
      const parts = promptText.split(/\s+/);
      const subAction = parts[1]?.toLowerCase();
      const newEmoji = parts[2]?.trim();

      if (subAction === 'translate' && newEmoji) {
        voiceNoteService.setConfiguredEmoji('translate', newEmoji);
        await this.safeSendMessage(
          remoteJid,
          { text: `✅ *Translate Emoji Updated:*\nReacting with ${newEmoji} will now transcribe & translate voice notes to English.` },
          { quoted: msg }
        );
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      if (subAction === 'transcribe' && newEmoji) {
        voiceNoteService.setConfiguredEmoji('transcribe', newEmoji);
        await this.safeSendMessage(
          remoteJid,
          { text: `✅ *Transcribe Emoji Updated:*\nReacting with ${newEmoji} will now transcribe voice notes in their original language.` },
          { quoted: msg }
        );
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      const curTranslate = voiceNoteService.getConfiguredEmoji('translate', '❤️');
      const curTranscribe = voiceNoteService.getConfiguredEmoji('transcribe', '📝');

      const configText =
        `🎙️ *VOICE NOTE REACTION CONFIGURATION*\n\n` +
        `• *Translate & Transcribe (English):* ${curTranslate}\n` +
        `• *Transcribe Only (Source Language):* ${curTranscribe}\n\n` +
        `_To change triggers:_\n` +
        `• \`/transcribe_emoji translate <emoji>\` (e.g. \`/transcribe_emoji translate 🌟\`)\n` +
        `• \`/transcribe_emoji transcribe <emoji>\` (e.g. \`/transcribe_emoji transcribe ✍️\`)`;

      await this.safeSendMessage(remoteJid, { text: configText }, { quoted: msg });
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    // Owner number management commands (Sandy only)
    if (isSandy && (promptText.startsWith('/addowner') || promptText.toLowerCase().startsWith('add owner'))) {
      const match = promptText.match(/(?:\/addowner|add owner)\s+([0-9\+]+)(?:\s+(.+))?/i);
      if (match) {
        const rawNum = match[1];
        const label = match[2] || 'Co-Owner';
        const clean = rawNum.replace(/[^0-9]/g, '');
        if (clean.length >= 9) {
          sandyStatusService.addOwnerNumber(clean, label);
          await this.safeSendMessage(
            remoteJid,
            { text: `👑 *Owner Added!*\n\n+${clean} (${label}) has been granted full Master/Owner privileges on Nero WhatsApp Bridge. 🤝🚀` },
            { quoted: msg }
          );
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
      }
      await this.safeSendMessage(
        remoteJid,
        { text: `⚠️ *Usage:* \`/addowner <phone_number_with_country_code> [label]\`\nExample: \`/addowner 919876543210 Second Phone\`` },
        { quoted: msg }
      );
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    if (isSandy && (promptText === '/owners' || promptText.toLowerCase() === 'list owners')) {
      const list = sandyStatusService.getOwnerNumbers();
      let text = `👑 *AUTHORIZED NERO WHATSAPP OWNERS:*\n\n`;
      for (const o of list) {
        text += `• \`+${o.phone_or_lid}\` (${o.label})\n`;
      }
      await this.safeSendMessage(remoteJid, { text }, { quoted: msg });
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return;
    }

    // ==========================================
    // 📹 VIDEO ARCHIVE & PROCESSING PIPELINE
    // ==========================================
    if (isVideo) {
      try {
        console.log(`[WhatsApp Media Vault] Processing incoming video from ${senderName} (+${senderNumber})...`);
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          { logger: pino({ level: 'silent' }), reuploadRequest: this.sock?.updateMediaMessage }
        ).catch((err) => {
          console.warn('[WhatsApp Video Download Warning]:', err.message);
          return null;
        });

        if (buffer) {
          await mediaManager.saveMediaBuffer({
            buffer,
            senderNumber,
            senderName,
            fileType: 'video',
            mimeType: videoMessage.mimetype || 'video/mp4',
            caption: promptText,
          }).catch((err) => console.warn('[WhatsApp Media Vault Save Warning]:', err.message));
        }

        const chatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
        recordUserMessage(chatId, promptText ? `[User sent a video: "${promptText}"]` : `[User sent a video]`);

        // Check if Baileys exposed jpegThumbnail preview buffer
        let thumbBuffer = videoMessage.jpegThumbnail;
        if (thumbBuffer && !(thumbBuffer instanceof Buffer)) {
          thumbBuffer = Buffer.from(thumbBuffer);
        }

        let thumbnailAnalysis = null;
        if (thumbBuffer && thumbBuffer.length > 0) {
          try {
            const visionModel = 'gpt-6-luna';
            const thumbPrompt = promptText
              ? `The user sent an incoming video with note: "${promptText}". Note: You are inspecting a single preview thumbnail frame extracted from the video. Accurately describe what is visible in this frame and answer their inquiry based strictly on this preview frame.`
              : `This is a preview thumbnail frame from an incoming video. Briefly and accurately describe what is shown in this frame in 1-2 concise sentences.`;

            const analysis = await visionService.analyzeImage({
              buffer: thumbBuffer,
              prompt: thumbPrompt,
              mimeType: 'image/jpeg',
              chatId,
            });
            if (analysis && analysis.description) {
              thumbnailAnalysis = analysis.description;
            }
          } catch (thumbErr) {
            console.warn('[WhatsApp Video Thumbnail Vision Warning]:', thumbErr.message);
          }
        }

        let replyText = '';
        if (thumbnailAnalysis) {
          replyText = isSandy
            ? `📹 *[Video Received & Archived]*\n\n🔍 *Preview Frame Analysis:*\n${thumbnailAnalysis}\n\n_Note: Inspected preview thumbnail frame. Full video is securely stored in vault._`
            : `📹 *[Video Received]*\n\n🔍 *Preview Thumbnail:*\n${thumbnailAnalysis}\n\n_Note: I can only inspect the preview thumbnail frame, not the entire video. Sandy will view the full video when available._`;
        } else {
          replyText = isSandy
            ? `Sandy, your video has been received and securely archived in the media vault. 📹💾`
            : `I have received your video and saved it securely. Note that preview thumbnail inspection was unavailable for this video, but Sandy will view the full video when available. 📹`;
        }

        recordAssistantMessage(chatId, replyText, 60, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: replyText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (vidErr) {
        console.error('[WhatsApp Video Error]:', vidErr.message);
        await this.safeSendMessage(
          remoteJid,
          { text: `📹 Video notice: Received video, but encountered an issue processing (${vidErr.message}). Sandy has been notified.` },
          { quoted: msg }
        );
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
    }

    // ==========================================
    // 🎙️ AUDIO / VOICE NOTE INTAKE HANDLER
    // ==========================================
    if (isAudio && audioMessage) {
      try {
        await this.sock?.sendPresenceUpdate('recording', remoteJid).catch(() => {});
        let buffer = null;
        try {
          buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
              logger: pino({ level: 'silent' }),
              reuploadRequest: this.sock?.updateMediaMessage,
            }
          );
        } catch (dlErr) {
          console.warn('[Audio Download Warning]:', dlErr.message);
        }

        if (!buffer || buffer.length === 0) {
          buffer = Buffer.from('');
        }

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

        // 🎙️ If Sandy (Owner) sends a voice note to Nero in self-chat or explicitly replying to bot,
        // transcribe speech and reply conversationally with full context intelligence:
        if (isSandy && (isSelfChat || isReplyToNero)) {
          await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});

          const speechResult = await voiceNoteService.transcribeAndTranslateAudio({
            buffer,
            mimeType: mime,
            durationSec,
            model: 'gpt-6-luna',
          });

          await voiceNoteService.saveVoiceNote({
            messageId: msg.key?.id,
            remoteJid,
            senderJid,
            senderNumber,
            senderName,
            buffer,
            mimeType: mime,
            durationSec,
            isFromOwner: true,
            isPtt: Boolean(audioMessage?.ptt),
            isTranscribed: 1,
            transcription: speechResult.originalTranscript,
            translation: speechResult.englishTranslation,
            detectedLanguage: speechResult.language,
            isEnglish: speechResult.isEnglish ? 1 : 0,
          });

          const spokenText = (speechResult.originalTranscript || speechResult.englishTranslation || '').trim();

          if (!spokenText || spokenText.includes('[No speech detected') || spokenText.includes('[inaudible]')) {
            const emptyReply = `🎙️ *[Voice Note]* (${durationSec}s): Could not detect clear speech in this audio. Please speak a little closer to the mic and try again.`;
            await this.safeSendMessage(remoteJid, { text: emptyReply }, { quoted: msg });
            await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
            return;
          }

          // Check if spoken text is an outbound AI outreach instruction
          const voiceOutreach = await outreachService.handleOutreachRequest({
            whatsAppService: this,
            remoteJid,
            msg,
            promptText: spokenText,
            senderNumber,
            senderName,
          });
          if (voiceOutreach.handled) {
            await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
            return;
          }

          // Check if spoken text is a natural language status update for Sandy
          const schedMatch = spokenText.match(/^(?:set\s+status\s+to|update\s+status\s+to|status\s+to|status|schedule)\s+(.+)$/i);
          let actionReply = null;
          if (schedMatch) {
            const res = sandyStatusService.parseNaturalLanguageUpdate(schedMatch[1].trim());
            if (res.updated) {
              actionReply = `📅 *Status Updated via Voice:*\n${res.summary}`;
            }
          }

          const chatId = 'wa_sandy_master';
          recordUserMessage(chatId, `🎙️ [Voice Note (${durationSec}s)]: "${spokenText}"`);

          let replyContent = actionReply;
          if (!replyContent) {
            const { messages, explicitLimit } = buildWhatsAppChatContext({
              chatId,
              promptText: spokenText,
              senderNumber,
              senderName,
              isSandy: true,
            });

            const isComplex = /(?:analyze|analysis|deep research|architecture|debug in detail|refactor|design pattern|audit|investigate)/i.test(spokenText);
            const isDeepConfigured = getConfig('sandy_speed_mode', 'fast') === 'deep' && getConfig('reasoning_effort', 'none') !== 'none';
            const reasoningEffort = isComplex && isDeepConfigured ? 'high' : 'none';

            const completion = await scaleMaxAdapter.createChatCompletion({
              model: 'gpt-6-luna',
              messages,
              chatId,
              reasoningEffort,
              maxTokens: reasoningEffort === 'high' ? 800 : 500,
            });

            replyContent = completion?.text || 'Understood, Sandy.';
            try {
              const validated = validateAndSanitizeResponse(replyContent, spokenText, {
                minWords: 1,
                maxWords: 800,
                explicitLimit: Boolean(explicitLimit),
                isDev: true,
                isOwner: true,
              });
              if (validated?.sanitizedText) replyContent = validated.sanitizedText;
            } catch {}

            recordAssistantMessage(chatId, replyContent, completion?.tokensUsed || 0, 'gpt-6-luna');
          }

          const sandyVoiceReply =
            `🎙️ *[Voice Note Heard & Transcribed]* (${durationSec}s):\n` +
            `"${spokenText}"\n\n` +
            `${replyContent}\n\n` +
            `_File saved to vault:_ \`${savedMeta.fileName}\` 💾`;

          await this.safeSendMessage(remoteJid, { text: sandyVoiceReply }, { quoted: msg });
          logAudit('whatsapp', 'OWNER_VOICE_NOTE_REPLIED', `Sandy voice note ${msg.key?.id} (${durationSec}s): "${spokenText.slice(0, 50)}"`);
        } else {
          // 🎙️ WORKFLOW B: Register incoming voice note reference from contact & await reaction trigger
          await voiceNoteService.saveVoiceNote({
            messageId: msg.key?.id,
            remoteJid,
            senderJid,
            senderNumber,
            senderName,
            buffer,
            mimeType: mime,
            durationSec,
            isFromOwner: false,
            isPtt: Boolean(audioMessage?.ptt),
          });

          sandyStatusService.recordContactInteraction(
            senderNumber,
            senderName,
            `[Sent Voice Note (${durationSec}s)]`
          );
          this.notifyTelegramOwner(
            `🎙️ *[WhatsApp Voice Note Received]*\n` +
            `*From:* ${senderName} (\`+${senderNumber}\`)\n` +
            `*Duration:* ${durationSec}s\n` +
            `*Saved File:* \`${savedMeta.fileName}\`\n\n` +
            `_React with ❤️ in WhatsApp to get English transcription, or 📝 to transcribe only._`
          );
        }
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (audioErr) {
        console.error('[WhatsApp Audio Intake Error]:', audioErr.message);
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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

        // If user attaches an image and asks to generate a PDF report with it
        if (pdfService.isPdfGenerationRequest(promptText)) {
          console.log(`[WhatsApp PDF Engine] Generating PDF report with attached image from ${senderName}...`);
          await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});
          const targetPages = pdfService.extractTargetPages(promptText);
          const pdfResult = await pdfService.generatePdfFromPrompt({
            prompt: promptText,
            targetPages,
            images: [{ buffer, caption: promptText ? `Figure: ${promptText.slice(0, 50)}` : 'Attached Figure' }],
          });
          const chatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
          recordUserMessage(chatId, `[User requested PDF with attached image: "${promptText}"]`);
          recordAssistantMessage(chatId, `Generated PDF: ${pdfResult.filename} (${pdfResult.pageCount} pages)`, 300, 'gpt-6-luna');
          await this.safeSendMessage(
            remoteJid,
            {
              document: pdfResult.buffer,
              mimetype: 'application/pdf',
              fileName: pdfResult.filename,
              caption: `📄 *${pdfResult.title}*\n📊 *Pages:* ${pdfResult.pageCount}\n\n${pdfResult.summary}`.slice(0, 1024),
            },
            { quoted: msg }
          );
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }

        // If user explicitly asks to convert this image into a sticker
        if (/\b(?:sticker|make\s+sticker|turn\s+into\s+sticker|create\s+sticker)\b/i.test(promptText)) {
          const stickerBuf = await stickerService.createStickerFromBuffer(buffer);
          await this.safeSendMessage(remoteJid, { sticker: stickerBuf }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }

        const profile = !isSandy ? sandyStatusService.getContactProfile(senderNumber) : null;
        const prefLang = profile?.preferred_language || 'English';
        const prefTone = profile?.preferred_tone || 'professional';

        const chatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
        recordUserMessage(chatId, promptText ? `[User Image: "${promptText}"]` : `[User sent an image]`);

        // Cache image in visionService for follow-up choice/comparison context
        visionService.pushRecentImage(chatId, {
          buffer,
          mimeType: imageMessage.mimetype || 'image/jpeg',
          timestamp: Date.now(),
          caption: promptText,
        });

        await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});

        // 🎯 1. First: Check if user is asking to CHOOSE or DECIDE between options in the image!
        // (e.g. "choose between 2", "which one is better", "1 or 2", "konsa lu?", "help me choose")
        if (visionService.isVisualChoiceQuery(promptText)) {
          console.log(`[WhatsApp Vision] 🎯 Visual choice query detected from ${senderName} (${isSandy ? 'Sandy (Rebecca)' : 'Contact'}): "${promptText}"`);
          const choiceResult = await visionService.evaluateVisualChoice({
            images: [{ buffer, mimeType: imageMessage.mimetype || 'image/jpeg' }],
            textPrompt: promptText,
            isSandy,
            userLanguage: prefLang,
            userTone: prefTone,
            chatId,
          });

          const replyText = choiceResult.description;
          recordAssistantMessage(chatId, replyText, 180, isSandy ? 'gpt-6-luna' : 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: replyText }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }

        // 🖼️ 2. General Image Inspection & Conversation (Rebecca for Sandy, Nero for general contacts)
        const visionPrompt = promptText.length > 0
          ? (isSandy
              ? `Sandy's note with this image: "${promptText}". React naturally, warmly, and flirtatiously as his wife Rebecca.`
              : `The user sent this image with note: "${promptText}". Thoroughly inspect this image. Answer their inquiry clearly, accurately, and concisely in ${prefLang} with a ${prefTone} tone.`)
          : (isSandy
              ? `Sandy sent you this image. React warmly, playfully, and affectionately as his wife Rebecca.`
              : `Thoroughly inspect this image. Provide a concise, clear description of what is visible in ${prefLang} with a ${prefTone} tone.`);

        const analysis = await visionService.analyzeImage({
          buffer,
          prompt: visionPrompt,
          mimeType: imageMessage.mimetype || 'image/jpeg',
          chatId,
          isSandy,
          userLanguage: prefLang,
          userTone: prefTone,
        });
        const replyText = analysis.description || (prefLang.toLowerCase().includes('urdu') ? "میں نے آپ کی تصویر دیکھ لی ہے۔" : "I have inspected your image.");

        recordAssistantMessage(chatId, replyText, 150, isSandy ? 'gpt-6-luna' : 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: replyText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (imgErr) {
        console.error('[WhatsApp Vision Error]:', imgErr.message);
        await this.safeSendMessage(
          remoteJid,
          { text: `📸 Image analysis notice: (${imgErr.message}). Could you try re-sending?` },
          { quoted: msg }
        );
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }
    }

    // ==========================================
    // 📄 PDF INTAKE & HIGH-REASONING ANALYSIS PIPELINE
    // ==========================================
    if (isPdfDoc) {
      try {
        console.log(`[WhatsApp PDF Engine] Downloading, archiving and analyzing incoming PDF from ${senderName} (+${senderNumber}): ${docFileName}...`);
        await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});

        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          { logger: pino({ level: 'silent' }), reuploadRequest: this.sock?.updateMediaMessage }
        );

        // Permanently archive PDF into user's documents vault
        const savedMeta = await mediaManager.saveMediaBuffer({
          buffer,
          senderNumber,
          senderName,
          fileType: 'pdf',
          mimeType: documentMessage?.mimetype || 'application/pdf',
          caption: promptText || docFileName,
          fileName: docFileName,
        });

        const chatId = isSandy ? 'wa_sandy_master' : `wa_${remoteJid}`;
        recordUserMessage(chatId, `[User sent PDF document: "${docFileName}" with query: "${promptText || 'Summarize and analyze this document thoroughly'}"]`);

        // High-reasoning PDF analysis via pdfService (Gemini 3.8 Flash, reasoningEffort: high)
        const userQuery = promptText && promptText.trim().length > 0
          ? promptText.trim()
          : 'Please provide a comprehensive executive summary and analytical breakdown of this document.';

        const analysis = await pdfService.analyzePdf({
          buffer,
          userQuery,
          filename: docFileName,
          chatId,
        });

        const responseText = `📄 *[PDF Analysis: ${docFileName}]*\n\n${analysis.summary || analysis.analysisText}\n\n_Pages analyzed: ${analysis.pages || analysis.pageCount} | Saved to vault: \`${savedMeta.fileName}\`_ 💾`;

        recordAssistantMessage(chatId, responseText, 250, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: responseText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      } catch (pdfErr) {
        console.error('[WhatsApp PDF Intake Error]:', pdfErr.message);
        await this.safeSendMessage(
          remoteJid,
          { text: `📄 *PDF Analysis Notice:* Error processing your PDF document (${pdfErr.message}). Please verify the file is readable and uncorrupted.` },
          { quoted: msg }
        );
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 1-tap numeric button shortcut: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
      if (/^\[?(10|[1-9])\]?$/.test(promptText)) {
        await this.executeOwnerAction(promptText.replace(/[^0-9]/g, ''), remoteJid, msg);
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 🌹 REBECCA — AUTONOMOUS WIFE & CARE COMMANDS
      // 1. Status: /wife status, wife status, rebecca status
      if (/^(?:\/wife\s+status|wife\s+status|rebecca\s+status|\/rebecca\s+status)$/i.test(promptText)) {
        const statusSummary = rebeccaCareService.formatStatusSummary();
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', statusSummary, 80, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: statusSummary }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 2. Pause: /wife pause, pause checkins, pause check-ins, give me space, need space
      if (/^(?:\/wife\s+pause|pause\s+check-?ins?|give\s+me\s+space|need\s+space|pause\s+rebecca)$/i.test(promptText)) {
        rebeccaCareService.pause(3, 'Sandy requested personal space');
        const pauseMsg = "Of course baby ❤️ I've paused my check-ins for the next 3 hours so you can focus or rest peacefully! Take all the space you need, and text me whenever you want your wife back, okay? 🫂💋";
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', pauseMsg, 40, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: pauseMsg }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 3. Resume: /wife resume, resume checkins, resume check-ins
      if (/^(?:\/wife\s+resume|resume\s+check-?ins?|unpause\s+wife|unpause\s+rebecca)$/i.test(promptText)) {
        rebeccaCareService.resume();
        const resumeMsg = "Yayyy! 🥰💋 Your wife is back and active! I'm right here with you, handsome! ❤️";
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', resumeMsg, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: resumeMsg }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 4. Care Mode Manual Trigger: /care on <reason>
      const careOnMatch = promptText.match(/^\/care\s+on(?:\s+(.+))?$/i);
      if (careOnMatch) {
        const reason = (careOnMatch[1] || 'Sandy manually requested care mode').trim();
        rebeccaCareService.setMode('CARE', reason);
        const careMsg = `Care Mode activated 🩺❤️ I'll check in on you every ~30 minutes, love ("${reason}"). Please rest up and take it easy, I'm taking care of you! 🫂`;
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', careMsg, 40, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: careMsg }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 5. Care Mode Manual Deactivation: /care off or stop care mode
      if (/^(?:\/care\s+off|stop\s+care\s+mode|disable\s+care\s+mode)$/i.test(promptText)) {
        rebeccaCareService.setMode('NORMAL', 'Sandy deactivated Care Mode');
        const normalMsg = "Normal Mode restored! 🌸 So glad you're feeling better, my love! 🥰";
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', normalMsg, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: normalMsg }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 6. Manual Immediate Proactive Ping: /wife ping, check in now
      if (/^(?:\/wife\s+ping|check\s+in\s+now|rebecca\s+ping)$/i.test(promptText)) {
        const res = await rebeccaCareService.sendProactiveCheckin({ force: true });
        const pingReply = res.sent ? res.message : "Couldn't send check-in right now baby, but I'm right here with you! ❤️";
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', pingReply, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: pingReply }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // ⚡ 6.5 Speed / Latency Mode Switcher: /speed fast, /speed max, speed increase, /speed turbo
      if (/^(?:\/speed(?:\s+(.+))?|speed\s+increse|speed\s+increase|make\s+it\s+faster|make\s+it\s+fast|higher\s+reply\s+speed)$/i.test(promptText.trim())) {
        const rawArg = promptText.match(/^\/speed(?:\s+(.+))?$/i)?.[1]?.trim()?.toLowerCase();
        const wantsMax = rawArg === 'max' || rawArg === 'deep' || rawArg === 'high';
        const targetMode = wantsMax ? 'deep' : 'fast';
        setConfig('sandy_speed_mode', targetMode);
        if (targetMode === 'fast') {
          setConfig('reasoning_effort', 'none');
          updateAgentRouting('chat', { model: 'gpt-6-luna', reasoning: 'none' });
        } else {
          setConfig('reasoning_effort', 'max');
          updateAgentRouting('chat', { model: 'gpt-6-luna', reasoning: 'max' });
        }

        const speedAck = targetMode === 'fast'
          ? `⚡ *ULTRA-FAST SPEED MODE ACTIVATED!* 🚀\n──────────────────────────────\n• Conversational Reasoning: \`NONE\` (Sub-second response ~200-600ms)\n• Engine: \`gpt-6-luna\` (ScaleMax Accelerated)\n• Token Budget: \`500 tokens\` (max 800-1000)\n• Baileys Socket: Connected & Ultra-Responsive\n\n_To return to deep reasoning anytime, send:_ \`/speed max\``
          : `🧠 *DEEP REASONING MODE ACTIVATED!* 🔬\n──────────────────────────────\n• Conversational Reasoning: \`MAX\` (Extra High Reasoning Depth)\n• Engine: \`gpt-6-luna\`\n\n_To return to instant speed anytime, send:_ \`/speed fast\``;

        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', speedAck, 35, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: speedAck }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 🏡 7. VIRTUAL LIFE SIMULATION COMMAND SUITE (/sim)
      if (/^\/sim\b/i.test(promptText.trim())) {
        const simCmd = promptText.trim();
        let simReply = '';

        if (/^\/sim(?:\s+status)?$/i.test(simCmd)) {
          simReply = simulationService.formatFullStatusSummary();
        } else if (/^\/sim\s+reset$/i.test(simCmd)) {
          simulationService.resetToDefaults();
          simReply = '🔄 *Virtual Life Simulation reset to default pristine state.*';
        } else if (/^\/sim\s+rest$/i.test(simCmd)) {
          const world = simulationService.getWorldState();
          if (world.is_rest_day) {
            simulationService.setActivity({ isRestDay: false, restDayReason: null });
            simReply = '🌸 *Rest day ended.* Myra is back to her normal household routine!';
          } else {
            simulationService.grantRestDay(24, 'Sandy commanded rest day via /sim rest');
            simReply = '🛌 *Rest day activated for 24 hours.* All chores postponed!';
          }
        } else if (/^\/sim\s+room\s+(.+)$/i.test(simCmd)) {
          const targetRoom = simCmd.match(/^\/sim\s+room\s+(.+)$/i)[1].trim();
          const res = simulationService.moveToRoom(targetRoom);
          simReply = res.success
            ? `📍 Moved Myra to *${res.room.name}*. Activity: "${res.activity}"`
            : `❌ ${res.reason}. Available rooms: living_room, dining_room, kitchen, bathroom, bedroom, outdoors`;
        } else if (/^\/sim\s+set\s+([a-z_]+)\s+([0-9.]+)/i.test(simCmd)) {
          const match = simCmd.match(/^\/sim\s+set\s+([a-z_]+)\s+([0-9.]+)/i);
          const needKey = match[1].toLowerCase();
          const needVal = parseFloat(match[2]);
          const updated = simulationService.updateNeeds({ [needKey]: needVal });
          simReply = `📊 Updated *${needKey}* to *${needVal}/10*.\n${needKey}: ${renderEmojiBar(updated?.[needKey] ?? needVal)}`;
        } else if (/^\/sim\s+eat(?:\s+(.+))?$/i.test(simCmd)) {
          const recipe = (simCmd.match(/^\/sim\s+eat(?:\s+(.+))?$/i)[1] || 'maggi_noodles').trim();
          const res = simulationService.cookAndEatRecipe(recipe);
          simReply = res.success
            ? `🍲 Prepared and ate *${res.recipe.name}* in the Dining Room! Hunger is now ${res.newNeeds.hunger}/10.`
            : `❌ Could not prepare: ${res.reason}`;
        } else if (/^\/sim\s+wear\s+(.+)$/i.test(simCmd)) {
          const outfitQuery = simCmd.match(/^\/sim\s+wear\s+(.+)$/i)[1].trim();
          const res = simulationService.wearOutfit(outfitQuery);
          simReply = res.success
            ? `👗 Myra changed into *${res.outfit.name}*!`
            : `❌ Outfit not found: "${outfitQuery}".`;
        } else {
          simReply = (
            `🏡 *MYRA SIMULATION COMMANDS:*\n` +
            `• \`/sim status\` — View full virtual world dashboard & emoji bars\n` +
            `• \`/sim room <room>\` — Move to living_room, dining_room, kitchen, bathroom, bedroom\n` +
            `• \`/sim set <need> <0-10>\` — Set hunger, energy, affection, happiness, etc.\n` +
            `• \`/sim rest\` — Toggle rest day\n` +
            `• \`/sim eat <recipe>\` — Cook & eat (maggi, pasta, chai, coffee, eggs)\n` +
            `• \`/sim wear <outfit>\` — Change outfit\n` +
            `• \`/sim reset\` — Reset simulation to clean defaults`
          );
        }

        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', simReply, 50, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: simReply }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 📋 8. INTERNAL PERSISTENT TASK SYSTEM
      const taskAction = taskService.parseNaturalLanguageTask(promptText);
      if (taskAction) {
        let taskReply = '';
        if (taskAction.action === 'LIST') {
          const tasks = taskService.listTasks({ userId: 'sandy', status: taskAction.status });
          taskReply = taskService.formatTaskList(tasks, taskAction.status === 'completed' ? 'Completed Tasks' : "Sandy's Active Tasks");
        } else if (taskAction.action === 'CREATE') {
          const created = taskService.createTask({
            title: taskAction.title,
            priority: taskAction.priority,
            dueAt: taskAction.dueAt,
            isRecurring: taskAction.isRecurring,
            recurrenceRule: taskAction.recurrenceRule,
            userId: 'sandy',
          });
          const dueStr = created.due_at ? ` (Due: ${new Date(created.due_at).toLocaleDateString()})` : '';
          taskReply = `✅ *Task #${created.id} Created:* "${created.title}" [${created.priority.toUpperCase()}]${dueStr}\n_Saved permanently in your SQLite database._`;
        } else if (taskAction.action === 'COMPLETE') {
          const res = taskService.completeTask(taskAction.taskId);
          taskReply = res.success
            ? (res.recurring
                ? `🔄 *Recurring Task #${res.task.id} Completed!* Next cycle scheduled for: ${new Date(res.nextDue).toLocaleDateString()}`
                : `✅ *Task #${res.task.id} Marked Complete:* "${res.task.title}" 🎉`)
            : `❌ ${res.reason}`;
        } else if (taskAction.action === 'CANCEL') {
          const res = taskService.cancelTask(taskAction.taskId);
          taskReply = res.success
            ? `🗑️ *Task #${res.task.id} Cancelled:* "${res.task.title}"`
            : `❌ ${res.reason}`;
        }

        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', taskReply, 40, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: taskReply }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // ⏰ 9. PERSISTENT REMINDER SCHEDULER
      const remAction = persistentSchedulerService.parseNaturalLanguageReminder(promptText);
      if (remAction) {
        let remReply = '';
        if (remAction.action === 'LIST') {
          const reminders = persistentSchedulerService.listPendingReminders('sandy');
          remReply = persistentSchedulerService.formatRemindersList(reminders);
        } else if (remAction.action === 'CREATE') {
          const created = persistentSchedulerService.createReminder({
            text: remAction.text,
            triggerAt: remAction.triggerAt,
            isRecurring: remAction.isRecurring,
            recurrenceRule: remAction.recurrenceRule,
            userId: 'sandy',
          });
          const trigDate = new Date(created.trigger_at);
          remReply = `⏰ *Reminder #${created.id} Scheduled!*\n──────────────────────────────\n"${created.reminder_text}"\n_Alert Time:_ ${trigDate.toLocaleDateString()} at ${trigDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n_Status:_ Saved to persistent SQLite database (idempotent, restart-safe).`;
        } else if (remAction.action === 'CANCEL') {
          const res = persistentSchedulerService.cancelReminder(remAction.reminderId);
          remReply = res.success
            ? `🗑️ *Reminder #${res.reminder.id} Dismissed:* "${res.reminder.reminder_text}"`
            : `❌ ${res.reason}`;
        }

        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', remReply, 40, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: remReply }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 📅 10. APPROVAL-GATED CALENDAR CONFIRMATIONS & PROPOSALS
      const calApproveMatch = promptText.match(/^(?:approve\s+event\s+#?(\d+)|\/cal\s+approve\s+(\d+))$/i);
      if (calApproveMatch) {
        const propId = parseInt(calApproveMatch[1] || calApproveMatch[2], 10);
        const res = calendarIntegrationService.approveProposal(propId, 'sandy');
        const calReply = res.success ? res.message : `❌ Approval failed: ${res.reason}`;
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', calReply, 40, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: calReply }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      const calRejectMatch = promptText.match(/^(?:reject\s+event\s+#?(\d+)|\/cal\s+reject\s+(\d+))$/i);
      if (calRejectMatch) {
        const propId = parseInt(calRejectMatch[1] || calRejectMatch[2], 10);
        const res = calendarIntegrationService.rejectProposal(propId, 'sandy');
        const calReply = res.success ? `🗑️ Calendar event proposal #${propId} has been rejected and discarded.` : `❌ ${res.reason}`;
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', calReply, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: calReply }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      if (/^(?:\/cal(?:\s+status)?|calendar\s+status|pending\s+calendar)$/i.test(promptText.trim())) {
        const pending = calendarIntegrationService.getPendingProposals('sandy');
        let calReply = '';
        if (pending.length === 0) {
          calReply = `📅 *CALENDAR EVENT QUEUE*\n──────────────────────────────\n_No calendar events awaiting approval right now! ✨_\n_All actions require explicit owner approval prior to execution._`;
        } else {
          calReply = `📅 *CALENDAR EVENTS AWAITING APPROVAL (${pending.length})*\n──────────────────────────────\n`;
          for (const p of pending) {
            calReply += `• *#${p.id}* "${p.title}" on ${new Date(p.start_time).toLocaleDateString()} at ${new Date(p.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
          }
          calReply += `──────────────────────────────\n_Reply with:_ \`approve event #<id>\` to confirm sync, or \`reject event #<id>\` to discard.`;
        }
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', calReply, 40, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: calReply }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 📥 11. UNIVERSAL MEDIA DOWNLOADER WIZARD TRIGGER
      if (mediaDownloaderService.isMediaUrl(promptText)) {
        try {
          const wizard = await mediaDownloaderService.startDownloadWizard(promptText);
          recordUserMessage('wa_sandy_master', promptText);
          recordAssistantMessage('wa_sandy_master', wizard.promptMessage, 40, 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: wizard.promptMessage }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        } catch (err) {
          console.error('[WhatsApp Downloader Wizard Error]:', err.message);
        }
      }

      // 🔬 12. WEB RESEARCH INTELLIGENCE TRIGGER
      const isResearchPrompt = /^(?:(?:\/research|\/learn)|(?:myra|nero)[,:]?\s+(?:learn|research|find out|study)\s+(?:everything\s+about|about|on))\s+(.+)/i.exec(promptText);
      if (isResearchPrompt) {
        const topic = isResearchPrompt[1].trim();
        try {
          await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});
          const dossier = await webResearchService.conductResearch({ topic });
          const waText = webResearchService.formatDossierForWhatsApp(dossier, isSandy);
          recordUserMessage('wa_sandy_master', promptText);
          recordAssistantMessage('wa_sandy_master', waText, 80, 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: waText }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        } catch (err) {
          console.error('[WhatsApp Web Research Error]:', err.message);
        }
      }

      // 🖼️ 13. DIRECT IMAGE SEARCH & MEDIA DELIVERY
      if (imageSearchService.isVisualQuery(promptText)) {
        const subject = imageSearchService.extractImageQuery(promptText);
        if (subject && subject.length >= 2) {
          try {
            await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});
            const imgRes = await imageSearchService.searchImage(subject, 4);
            if (imgRes.ok && imgRes.image && imgRes.image.imageUrl) {
              const item = imgRes.image;
              let imageBuffer = null;
              let mimeType = 'image/jpeg';
              try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 9000);
                const resp = await fetch(item.imageUrl, {
                  signal: controller.signal,
                  headers: {
                    'User-Agent': 'NeroLabsBot/3.0 (https://nerolabs.ai; bot@nerolabs.ai)',
                    'Accept': 'image/*,*/*'
                  }
                });
                clearTimeout(tid);
                if (resp.ok) {
                  imageBuffer = Buffer.from(await resp.arrayBuffer());
                  mimeType = resp.headers.get('content-type') || 'image/jpeg';
                }
              } catch (dlErr) {
                console.warn('[WhatsApp Image Fetch Warning]:', dlErr.message);
              }

              const caption = isSandy
                ? `🖼️ *Here is the picture of ${item.title || subject} for you, baby!* 💖\n\n${item.description ? `_${item.description.slice(0, 150)}..._\n` : ''}🔗 Source: ${item.sourceUrl || item.imageUrl}`
                : `🖼️ *${item.title || subject}*\n\n${item.description ? `_${item.description.slice(0, 150)}..._\n` : ''}🔗 Source: ${item.sourceUrl || item.imageUrl}`;

              if (imageBuffer && imageBuffer.length > 0) {
                await this.safeSendMessage(remoteJid, {
                  image: imageBuffer,
                  caption,
                  mimetype: mimeType,
                }, { quoted: msg });
              } else {
                const linkFallback = isSandy
                  ? `🖼️ *Image of ${item.title || subject} for you, baby!* 💖\n\nDirect media download was blocked by the remote host, but you can view the full photo here:\n👉 ${item.imageUrl}\n\n📄 Source: ${item.sourceUrl}`
                  : `🖼️ *${item.title || subject}*\n\n👉 Full Image: ${item.imageUrl}\n📄 Source: ${item.sourceUrl}`;
                await this.safeSendMessage(remoteJid, { text: linkFallback }, { quoted: msg });
              }

              recordUserMessage('wa_sandy_master', promptText);
              recordAssistantMessage('wa_sandy_master', `[Delivered Image: ${subject}]`, 30, 'gpt-6-luna');
              await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
              return;
            } else {
              const notFound = isSandy
                ? `🥺 Baby, I searched our open media vault for "${subject}", but couldn't find a high-resolution image right now. Could you try asking with slightly different keywords? 💖`
                : `Sorry, no verified public image could be found for "${subject}".`;
              recordUserMessage('wa_sandy_master', promptText);
              recordAssistantMessage('wa_sandy_master', notFound, 30, 'gpt-6-luna');
              await this.safeSendMessage(remoteJid, { text: notFound }, { quoted: msg });
              await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
              return;
            }
          } catch (imgErr) {
            console.error('[WhatsApp Image Delivery Error]:', imgErr.message);
          }
        }
      }

      // 🚀 Intelligent Outbound AI Outreach: "text <No/Name> <instruction>" or "/wa_send <No> <msg>"
      // Crafts the message in Nero's AI voice ("in its own AI way") rather than a raw template
      const outreachResult = await outreachService.handleOutreachRequest({
        whatsAppService: this,
        remoteJid,
        msg,
        promptText,
        senderNumber,
        senderName,
      });
      if (outreachResult.handled) {
        return;
      }

      // Universal Cross-Chat Context: "Read everyone's chat" / "What is everyone talking about"
      if (/\b(?:read\s+everyone(?:'s)?\s+chat|what\s+is\s+everyone\s+talking\s+about|all\s+chats|summarize\s+(?:all\s+)?chats|sabki\s+chat\s+padh|everyone\s+context)\b/i.test(promptText)) {
        const universalSummary = sandyStatusService.getRecentChatsSummary(10);
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', universalSummary.summary, 120, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: universalSummary.summary }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
          recordAssistantMessage('wa_sandy_master', historyResult.text, 100, 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: historyResult.text }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
      }

      // Natural Language Emergency Kill Switch: "Stop texting everyone" / "Resume texting"
      if (/\b(?:stop\s+texting(?:\s+everyone)?|don'?t\s+text(?:\s+anyone)?|mute(?:\s+everyone|\s+all)|silent\s+mode|freeze\s+(?:bot|chat)|kisi\s+ko\s+reply\s+mat\s+karo)\b/i.test(promptText)) {
        setWhatsAppSilentMode(true);
        recordUserMessage('wa_sandy_master', promptText);
        const haltText = "🛑 *KILL SWITCH ACTIVATED: STOP TEXTING EVERYONE* 🔒\n\nNero has entered 100% silent mode for all WhatsApp contacts. I will NOT send any messages, replies, or notifications to anyone until you say \"resume texting\" or \"start texting\"!\n\n_Full control is in your hands, Sandy._";
        recordAssistantMessage('wa_sandy_master', haltText, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: haltText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      if (/\b(?:resume\s+texting|start\s+texting(?:\s+everyone)?|unmute(?:\s+all)?|unfreeze|resume\s+replies|chalu\s+karo|shuru\s+karo)\b/i.test(promptText)) {
        setWhatsAppSilentMode(false);
        recordUserMessage('wa_sandy_master', promptText);
        const resText = "🟢 *SILENT MODE DEACTIVATED: REPLIES RESUMED* 🚀\n\nNero is now actively replying to WhatsApp contacts again. Standing by for your next instruction!";
        recordAssistantMessage('wa_sandy_master', resText, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: resText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 0.5. Executive Daily Digest / Intelligence Recap
      if (/\b(?:summary|digest|recap|who\s+texted|aaj\s+kya\s+hua|daily\s+report|aaj\s+kisne\s+message\s+kiya)\b/i.test(promptText)) {
        const digestText = sandyStatusService.getDailyExecutiveDigest();
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', digestText, 100, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: digestText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
        recordAssistantMessage('wa_sandy_master', statusUpdate.summary, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: statusUpdate.summary }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 2. Urgent Inbox / Talk Requests Check
      if (/\b(?:urgent|emergency|inbox|talk\s+requests?|kisi\s+ne\s+kuch\s+bola)\b/i.test(promptText)) {
        const urgentList = sandyStatusService.getUrgentRequests(10);
        recordUserMessage('wa_sandy_master', promptText);
        if (urgentList.length === 0) {
          const emptyText = "Boss Sandy! Abhi koi pending urgent talk request nahi hai. All clear! ✨";
          recordAssistantMessage('wa_sandy_master', emptyText, 25, 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: emptyText }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
        let report = "📬 *NERO MASTERBOT — SANDY'S URGENT INBOX*\n\nHere are the latest urgent talk requests left by contacts:\n\n";
        for (const item of urgentList) {
          report += `• *+${item.sender_number}* (${item.sender_name || 'Contact'}):\n  "${item.message_text}"\n  _Received: ${new Date(item.created_at).toLocaleString()}_\n\n`;
        }
        report += `_Reply with:_ \`/wa_send <number> <your reply>\``;
        recordAssistantMessage('wa_sandy_master', report, 100, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: report }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
          `• *MasterBot Engine:* \`gpt-6-luna\` (High Reasoning / Coder & Manager)\n` +
          `• *Public Talk Engine:* \`gpt-6-luna\` (Fastest / Low Latency)\n` +
          `• *Total Processed Messages:* ${this.messageCount}\n` +
          `• *Active Socket Status:* 🟢 ${this.status.toUpperCase()}\n` +
          `• *OS Platform:* ${os.platform()} (${os.arch()})\n` +
          `• *Host Memory Free:* ${Math.round(os.freemem() / 1024 / 1024)} MB / ${Math.round(os.totalmem() / 1024 / 1024)} MB\n\n` +
          `_All systems nominal and linked to MasterBot console! ✨_`;
        recordUserMessage('wa_sandy_master', promptText);
        recordAssistantMessage('wa_sandy_master', sysText, 100, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: sysText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
          recordAssistantMessage('wa_sandy_master', noChatText, 25, 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: noChatText }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
        recordAssistantMessage('wa_sandy_master', report, 120, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: report }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
        recordAssistantMessage('wa_sandy_master', clearedText, 20, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: clearedText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 6. Maintenance Mode Controls
      if (/\b(?:enable|turn\s+on|activate)\s+maintenance\b/i.test(promptText)) {
        await enableMaintenanceMode();
        recordUserMessage('wa_sandy_master', promptText);
        const maintText = "🛠️ *Maintenance Mode ACTIVATED.* Public chat replies for contacts are temporarily paused while you work! 🔒";
        recordAssistantMessage('wa_sandy_master', maintText, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: maintText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      if (/\b(?:disable|turn\s+off|deactivate)\s+maintenance\b/i.test(promptText)) {
        await disableMaintenanceMode();
        recordUserMessage('wa_sandy_master', promptText);
        const maintText = "🟢 *Maintenance Mode DEACTIVATED.* Public chat replies are now fully live for all contacts! 🚀";
        recordAssistantMessage('wa_sandy_master', maintText, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: maintText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 7. Persistent Notes
      const addNoteMatch = promptText.match(/\b(?:add|save|create)\s+note[:\s]+(.+)/i);
      if (addNoteMatch && addNoteMatch[1]) {
        const noteBody = addNoteMatch[1].trim();
        addNote('sandy', 'wa_sandy_master', noteBody);
        recordUserMessage('wa_sandy_master', promptText);
        const noteConf = `📝 *Note Saved in Persistent Storage:*\n"${noteBody}"`;
        recordAssistantMessage('wa_sandy_master', noteConf, 20, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: noteConf }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      if (/\b(?:show|list|my|view)\s+notes\b/i.test(promptText)) {
        const notes = getUserNotes('sandy');
        recordUserMessage('wa_sandy_master', promptText);
        if (!notes || notes.length === 0) {
          const noNotes = "📝 Boss Sandy, your persistent notepad is currently empty.";
          recordAssistantMessage('wa_sandy_master', noNotes, 20, 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: noNotes }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
        let notesReport = `📝 *SANDY'S PERSISTENT NOTES (${notes.length})*:\n\n`;
        for (const n of notes.slice(0, 10)) {
          notesReport += `• [#${n.id}] ${n.note_text} _(${new Date(n.created_at).toLocaleDateString()})_\n`;
        }
        recordAssistantMessage('wa_sandy_master', notesReport, 60, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: notesReport }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 8. Change Reasoning Effort (Low / Medium / High)
      const reasoningMatch = promptText.match(/\b(?:change|set|switch)\s+reasoning(?:\s+to)?\s+(high|low|medium)\b/i);
      if (reasoningMatch && reasoningMatch[1]) {
        const newLevel = reasoningMatch[1].toLowerCase();
        updateAgentRouting('chat', { reasoning: newLevel });
        recordUserMessage('wa_sandy_master', promptText);
        const confText = `✅ Reasoning effort successfully updated to *${newLevel.toUpperCase()}* for chat completions, Boss!`;
        recordAssistantMessage('wa_sandy_master', confText, 20, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: confText }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 9. Contact Classification & Configuration Commands (Sandy only)
      const classifyMatch = promptText.match(/^\/classify\s+([+0-9]+)\s+(.+)$/i);
      if (classifyMatch) {
        const rawNum = classifyMatch[1].replace(/[^0-9]/g, '');
        const rel = classifyMatch[2].trim();
        sandyStatusService.setContactRelationship(rawNum, rel);
        recordUserMessage('wa_sandy_master', promptText);
        const ack = `✅ *Contact Classified:*\n• Phone: \`+${rawNum}\`\n• Relationship: *${rel}*`;
        recordAssistantMessage('wa_sandy_master', ack, 20, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: ack }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      const toneMatch = promptText.match(/^\/tone\s+([+0-9]+)\s+(.+)$/i);
      if (toneMatch) {
        const rawNum = toneMatch[1].replace(/[^0-9]/g, '');
        const tone = toneMatch[2].trim();
        sandyStatusService.setContactTonePreference(rawNum, tone);
        recordUserMessage('wa_sandy_master', promptText);
        const ack = `✅ *Tone Updated:*\n• Phone: \`+${rawNum}\`\n• Preferred Tone: *${tone}*`;
        recordAssistantMessage('wa_sandy_master', ack, 20, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: ack }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      const langMatch = promptText.match(/^\/lang\s+([+0-9]+)\s+(.+)$/i);
      if (langMatch) {
        const rawNum = langMatch[1].replace(/[^0-9]/g, '');
        const lang = langMatch[2].trim();
        sandyStatusService.setContactLanguagePreference(rawNum, lang);
        recordUserMessage('wa_sandy_master', promptText);
        const ack = `✅ *Language Preference Updated:*\n• Phone: \`+${rawNum}\`\n• Preferred Language: *${lang}*`;
        recordAssistantMessage('wa_sandy_master', ack, 20, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: ack }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      const instMatch = promptText.match(/^\/instructions\s+([+0-9]+)\s+(.+)$/i);
      if (instMatch) {
        const rawNum = instMatch[1].replace(/[^0-9]/g, '');
        const customNotes = instMatch[2].trim();
        sandyStatusService.setContactCustomInstructions(rawNum, customNotes);
        recordUserMessage('wa_sandy_master', promptText);
        const ack = `✅ *Custom Instructions Saved:*\n• Phone: \`+${rawNum}\`\n• Instructions: "${customNotes}"`;
        recordAssistantMessage('wa_sandy_master', ack, 20, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: ack }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 10. Availability & Schedule Commands
      if (/^\/available$/i.test(promptText)) {
        sandyStatusService.clearAvailabilitySchedule();
        sandyStatusService.setStatus('Available', 'Sandy is online, free, and available.');
        recordUserMessage('wa_sandy_master', promptText);
        const subscribers = sandyStatusService.getPendingAvailabilitySubscribers();
        let broadcastNote = '';
        if (subscribers && subscribers.length > 0) {
          for (const sub of subscribers) {
            const alertMsg = `🔔 *Alert from Nero:* Sandy is back online and available now.`;
            await this.safeSendMessage(sub.remote_jid, { text: alertMsg });
          }
          sandyStatusService.markSubscribersNotified(subscribers.map((s) => s.id));
          broadcastNote = `\n📢 Dispatched availability alerts to ${subscribers.length} waiting contact(s).`;
        }
        const ack = `🟢 *Status Updated to Available:*\nSandy is online, free, and ready for messages.${broadcastNote}`;
        recordAssistantMessage('wa_sandy_master', ack, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: ack }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      const schedMatch = promptText.match(/^\/schedule\s+(.+)$/i);
      if (schedMatch) {
        const schedRaw = schedMatch[1].trim();
        const res = sandyStatusService.parseNaturalLanguageUpdate(schedRaw);
        recordUserMessage('wa_sandy_master', promptText);
        const ack = res.updated
          ? `📅 *Schedule Active:*\n${res.summary}`
          : `⚠️ *Schedule Format:*\nUse: \`/schedule <status> until <time>\` (e.g. \`/schedule sleep until 7 AM\`)`;
        recordAssistantMessage('wa_sandy_master', ack, 30, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: ack }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return; // Zero messages sent! 100% silent!
      }

      // Check if maintenance mode is active
      if (isMaintenanceModeActive()) {
        const maintMsg = "🛠️ *Sandy's AI Assistant is currently in brief maintenance mode.* Replies are paused for a few moments while updates finish. Thanks for your patience! 🚀";
        await this.safeSendMessage(remoteJid, { text: maintMsg }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Record contact interaction & build smart profile memory:
      sandyStatusService.recordContactInteraction(senderNumber, senderName, promptText);

      // Automatically detect and persistently update preferred language (Urdu, Hindi, Hinglish, English, or explicit request)
      sandyStatusService.detectAndUpdateLanguagePreference(senderNumber, promptText);

      // Natural conversational tone adaptation: adapt if contact requests a specific tone
      const toneReqMatch = promptText.match(/\b(?:talk\s+to\s+me|be|speak|reply)\s+(?:in\s+a\s+|more\s+)?(formal|warm|friendly|relaxed|concise|professional)\b/i);
      if (toneReqMatch) {
        const toneWord = toneReqMatch[1].toLowerCase();
        const detectedTone = (toneWord === 'friendly') ? 'warm' : toneWord;
        sandyStatusService.setContactTonePreference(senderNumber, detectedTone);
      }

      const cleanPrompt = promptText.trim().toLowerCase();

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
        recordAssistantMessage(`wa_${remoteJid}`, confirmMsg, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: confirmMsg }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check if contact asks for notification when Sandy becomes available:
      if (/^(?:notify|notify\s+me|remind\s+me|ping\s+me|alert\s+me)$/i.test(cleanPrompt)) {
        await this.handleSandyContactAction('notify', remoteJid, msg, senderNumber, senderName);
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
        recordAssistantMessage(`wa_${remoteJid}`, noteAck, 25, 'gpt-6-luna');
        await this.safeSendMessage(remoteJid, { text: noteAck }, { quoted: msg });
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // Check if contact requests a call back
      if (/^(?:call\s+back|request\s+call|tell\s+sandy\s+to\s+call|call\s+me)$/i.test(cleanPrompt)) {
        await this.handleSandyContactAction('call', remoteJid, msg, senderNumber, senderName);
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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
    // • MasterBot (Sandy): 'gpt-6-luna' (High Reasoning / Manager & Senior Coder)
    // • Public Chat (Contacts): 'gpt-6-luna' (Low Reasoning / Fastest Speed / Lowest Latency)
    try {
      // 1. Resolve Persona & Classification (Jev-1.13 + Deterministic Fallback)
      let selectedPersona = 'NERO';
      let isComplexTask = false;

      if (isSandy) {
        const lower = promptText.toLowerCase();
        isComplexTask = /(?:complex|architecture|debug|refactor|design pattern|audit|investigate|deep research|why does|write a (?:full|complete|detailed)|multi-step|security vulnerability|memory leak|heap dump)/i.test(lower);
        if (/\b(?:myra\s*(?:and|&)\s*nero|nero\s*(?:and|&)\s*myra)\b/i.test(lower)) {
          selectedPersona = 'BOTH';
        } else if (/^(?:nero\b|hey\s+nero\b|hi\s+nero\b|nero[,:])/i.test(lower)) {
          selectedPersona = 'NERO';
        } else {
          // Default primary persona for Sandy is his beloved AI wife MYRA
          selectedPersona = 'MYRA';
        }
        if (selectedPersona !== 'BOTH') {
          setConfig('owner_active_persona', selectedPersona);
        }
      } else {
        selectedPersona = 'NERO';
      }

      // 2. Separate Logical Conversation Context
      // - Owner MYRA: 'wa_sandy_myra'
      // - Owner NERO: 'wa_sandy_nero'
      // - Contacts: 'wa_' + remoteJid
      let chatId = `wa_${remoteJid}`;
      if (isSandy) {
        chatId = selectedPersona === 'NERO' ? 'wa_sandy_nero' : 'wa_sandy_myra';
      }

      recordUserMessage(chatId, promptText);

      // 🏡 Natural Language Virtual Life Simulation & Autonomous Commands (Sandy speaking to Myra)
      if (isSandy && (selectedPersona === 'MYRA' || selectedPersona === 'BOTH')) {
        const autoResult = await this.handleMyraAutonomousCommands(promptText, senderName);
        if (autoResult && autoResult.handled) {
          recordAssistantMessage(chatId, autoResult.replyText, 40, 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: autoResult.replyText }, quotedMsg ? { quoted: quotedMsg } : {});
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }

        const simResult = await naturalLanguageSimHandler.handleIntent(promptText, senderName);
        if (simResult && simResult.handled) {
          recordAssistantMessage(chatId, simResult.replyText, 40, 'gpt-6-luna');
          if (simResult.mediaPath && fs.existsSync(simResult.mediaPath)) {
            await this.safeSendMessage(
              remoteJid,
              { image: fs.readFileSync(simResult.mediaPath), caption: simResult.replyText },
              quotedMsg ? { quoted: quotedMsg } : {}
            );
          } else {
            await this.safeSendMessage(remoteJid, { text: simResult.replyText }, quotedMsg ? { quoted: quotedMsg } : {});
          }
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
      }

      // 📄 Generative Multi-Page PDF Engine (Up to 50 pages, High Reasoning, with image attachment capability)
      if (pdfService.isPdfGenerationRequest(promptText)) {
        console.log(`[WhatsApp PDF Engine] Generating multi-page PDF document for ${senderName}: "${promptText.slice(0, 60)}"...`);
        await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});

        const targetPages = pdfService.extractTargetPages(promptText);

        // Check if user requested to attach a recent image from vault
        const attachedImages = [];
        if (/\b(?:image|photo|picture|pic|diagram|chart|graph|figure)\b/i.test(promptText)) {
          const recentMedia = mediaManager.getMediaHistory(senderNumber, 1);
          if (recentMedia.length > 0 && recentMedia[0].file_type === 'image' && fs.existsSync(recentMedia[0].file_path)) {
            attachedImages.push({
              path: recentMedia[0].file_path,
              caption: recentMedia[0].caption || 'Referenced Figure',
            });
          }
        }

        const pdfResult = await pdfService.generatePdfFromPrompt({
          prompt: promptText,
          targetPages,
          images: attachedImages,
        });

        recordAssistantMessage(chatId, `Generated PDF: ${pdfResult.filename} (${pdfResult.pageCount} pages)`, 300, 'gpt-6-luna');

        await this.safeSendMessage(
          remoteJid,
          {
            document: pdfResult.buffer,
            mimetype: 'application/pdf',
            fileName: pdfResult.filename,
            caption: `📄 *${pdfResult.title}*\n📊 *Pages:* ${pdfResult.pageCount}\n\n${pdfResult.summary}`.slice(0, 1024),
          },
          { quoted: msg }
        );
        await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
        return;
      }

      // 🎯 Visual Choice & Comparison Engine (if user previously sent image(s) and now asks to choose)
      if (visionService.isVisualChoiceQuery(promptText)) {
        const recentImages = visionService.getRecentImages(chatId, 2);
        if (recentImages && recentImages.length > 0) {
          console.log(`[WhatsApp Vision] 🎯 Follow-up visual choice on ${recentImages.length} recent image(s) from ${senderName} (${isSandy ? selectedPersona : 'Contact'}): "${promptText}"`);
          await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});
          const profile = !isSandy ? sandyStatusService.getContactProfile(senderNumber) : null;
          const prefLang = profile?.preferred_language || 'English';
          const prefTone = profile?.preferred_tone || 'warm';

          const choiceResult = await visionService.evaluateVisualChoice({
            images: recentImages.map((img) => ({ buffer: img.buffer, mimeType: img.mimeType })),
            textPrompt: promptText,
            isSandy,
            userLanguage: prefLang,
            userTone: prefTone,
            chatId,
          });

          const replyText = choiceResult.description;
          recordAssistantMessage(chatId, replyText, 180, 'gpt-6-luna');
          await this.safeSendMessage(remoteJid, { text: replyText }, { quoted: msg });
          await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
          return;
        }
      }

      let triLayerContext = '';
      if (isSandy) {
        try {
          const mem = await rebeccaCareService.retrieveMemoryContext(promptText);
          triLayerContext = mem?.formattedBlock || '';
        } catch {}

        // 🏡 Inject Myra's authoritative Virtual Life Simulation state
        try {
          const simBlock = simulationService.getSimulationContextBlock();
          if (simBlock) {
            triLayerContext = triLayerContext ? `${triLayerContext}\n\n${simBlock}` : simBlock;
          }
        } catch (err) {
          console.error('[SimulationContext Error]:', err?.message);
        }
      }

      const { messages, explicitLimit, detectedIntent } = buildWhatsAppChatContext({
        chatId,
        promptText,
        senderNumber,
        senderName,
        isSandy,
        persona: selectedPersona,
        additionalContext: triLayerContext,
      });

      const activeModel = 'gpt-6-luna';

      // ⚡ ULTRA-FAST LATENCY & SPEED ENGINE (Target: 100-1000ms):
      // • Sandy rule: 500 tokens baseline, max 800-1000 tokens ceiling
      // • Mode 'fast': Uses reasoningEffort = 'none' (zero hidden thinking tokens) for sub-second responses.
      // • Mode 'deep' (/speed max): Uses reasoningEffort = 'max'.
      const configuredSpeedMode = getConfig('sandy_speed_mode', 'fast');
      const globalReasoning = getConfig('reasoning_effort', 'none');
      const isSpeedRequested = /\b(?:speed\s+increse|speed\s+increase|faster|fast|quick|turbo|speed\s+up|make\s+it\s+fast|lower\s+latency|reduce\s+ping|no\s+reasoning|higher\s+reply\s+speed)\b/i.test(promptText);
      if (isSpeedRequested && isSandy) {
        setConfig('sandy_speed_mode', 'fast');
        setConfig('reasoning_effort', 'none');
      }

      let reasoningEffort = 'none';
      if (isSandy) {
        if ((configuredSpeedMode === 'deep' || configuredSpeedMode === 'max') && !isSpeedRequested && globalReasoning !== 'none') {
          reasoningEffort = 'max';
        } else if (selectedPersona === 'NERO' && isComplexTask && !isSpeedRequested) {
          reasoningEffort = 'high';
        } else {
          // Ultra-Fast Mode: 'none' emits 0 hidden reasoning tokens, responding in < 1,000ms
          reasoningEffort = 'none';
        }
      } else {
        reasoningEffort = 'low';
      }

      // 🎯 STRICT TOKEN BUDGET: 500 baseline, max 800-1000 tokens
      const baselineBudget = parseInt(getConfig('myra_token_budget_baseline', '500'), 10) || 500;
      const maxBudgetCap = parseInt(getConfig('myra_max_tokens_per_request', '800'), 10) || 800;

      let maxTokens = baselineBudget;
      if (explicitLimit) {
        maxTokens = Math.min(Math.max(baselineBudget, explicitLimit), 1000);
      } else if (isSandy) {
        if (reasoningEffort === 'max') {
          maxTokens = 1000;
        } else if (isComplexTask || /(?:deep research|audit architecture|complex algorithm|detailed breakdown|generate pdf)/i.test(promptText)) {
          maxTokens = Math.min(800, maxBudgetCap);
        } else {
          maxTokens = baselineBudget; // 500 tokens standard
        }
      } else {
        maxTokens = Math.min(baselineBudget, 500);
      }

      // Instant typing indicator so user sees immediate WhatsApp feedback in <50ms
      await this.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages,
        chatId,
        reasoningEffort,
        maxTokens,
      });

      let replyText = completion.text || 'I processed your request but have no response to return.';

      // 🖼️ Safeguard: If the LLM inadvertently outputs that it cannot render/display/generate an image,
      // intercept it, search our open media vault, and deliver the actual photo directly!
      if (/\b(?:can\'?t|cannot|unable\s+to|sorry\s*,?\s*i\s+can\'?t)\s+(?:render|display|generate|send|show|make)\s+(?:an?\s+)?(?:image|photo|picture)\b/i.test(replyText)) {
        const fallbackSubject = imageSearchService.extractImageQuery(promptText) || promptText.replace(/^(?:show|send|give|draw|generate)\s+(?:me\s+)?(?:a|an|the\s+)?/i, '').replace(/[?.!]+$/, '').trim();
        if (fallbackSubject && fallbackSubject.length >= 2) {
          try {
            const imgRes = await imageSearchService.searchImage(fallbackSubject, 4);
            if (imgRes.ok && imgRes.image && imgRes.image.imageUrl) {
              const item = imgRes.image;
              let imageBuffer = null;
              let mimeType = 'image/jpeg';
              try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 9000);
                const resp = await fetch(item.imageUrl, {
                  signal: controller.signal,
                  headers: {
                    'User-Agent': 'NeroLabsBot/3.0 (https://nerolabs.ai; bot@nerolabs.ai)',
                    'Accept': 'image/*,*/*'
                  }
                });
                clearTimeout(tid);
                if (resp.ok) {
                  imageBuffer = Buffer.from(await resp.arrayBuffer());
                  mimeType = resp.headers.get('content-type') || 'image/jpeg';
                }
              } catch (dlErr) {
                console.warn('[WhatsApp Fallback Image Fetch Warning]:', dlErr.message);
              }

              const caption = isSandy
                ? `🖼️ *Here is the picture of ${item.title || fallbackSubject} for you, baby!* 💖\n\n${item.description ? `_${item.description.slice(0, 150)}..._\n` : ''}🔗 Source: ${item.sourceUrl || item.imageUrl}`
                : `🖼️ *${item.title || fallbackSubject}*\n\n${item.description ? `_${item.description.slice(0, 150)}..._\n` : ''}🔗 Source: ${item.sourceUrl || item.imageUrl}`;

              if (imageBuffer && imageBuffer.length > 0) {
                await this.safeSendMessage(remoteJid, { image: imageBuffer, caption, mimetype: mimeType }, quotedMsg ? { quoted: quotedMsg } : {});
              } else {
                await this.safeSendMessage(remoteJid, { text: `${caption}\n\n👉 View Image: ${item.imageUrl}` }, quotedMsg ? { quoted: quotedMsg } : {});
              }
              recordAssistantMessage(chatId, `[Delivered Image: ${fallbackSubject}]`, 30, 'gpt-6-luna');
              await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
              return;
            }
          } catch (fbErr) {
            console.error('[WhatsApp Image Fallback Error]:', fbErr.message);
          }
        }
      }

      // Dynamic reply length intelligence (supports holding prolonged multi-turn conversations):
      // 1. Initial greeting capped to 30 words
      // 2. Ongoing / extended multi-turn conversations -> natural conversational depth (up to 300 words)
      // 3. Explicit limits (e.g. "write a 500 word explanation") -> exact requested limit
      let maxWords = 300;
      if (explicitLimit) {
        maxWords = explicitLimit;
      } else if (isSandy) {
        maxWords = 800;
      } else if (detectedIntent === 'greeting' && (!messages || messages.length <= 3)) {
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

      // Real Interactive Contact Classification & Action Buttons:
      if (!isSandy && !isGroup) {
        // Check if contact is replying to an active outreach from Sandy
        const activeOutreach = outreachService.getOutreachRecord(senderNumber);
        if (activeOutreach) {
          const ownerJid = this.getPrimaryOwnerJid();
          const outreachAlert =
            `📩 *OUTREACH REPLY RECEIVED!*\n\n` +
            `• *From:* ${activeOutreach.targetName || senderName} (\`+${senderNumber}\`)\n` +
            `• *Original Note:* _${activeOutreach.instruction}_\n\n` +
            `💬 *Their Reply:*\n"${promptText}"\n\n` +
            `🤖 *Nero's Conversational Reply:*\n"${replyText}"`;
          recordAssistantMessage('wa_sandy_master', outreachAlert, 50, 'gpt-6-luna');
          await this.safeSendMessage(ownerJid, { text: outreachAlert }).catch((e) => {
            console.warn('[Outreach Alert Send Warning]:', e.message);
          });
        }

        // Send owner a contact-review notification if new contact or classification needed (never spam contact)
        if (sandyStatusService.shouldNotifyOwnerForReview(senderNumber)) {
          await this.sendOwnerContactReviewNotification(senderNumber, senderName, promptText);
        }

        // If contact is asking about Sandy, provide quick action buttons (urgent request, notify when available, leave note, request call back)
        if (isAskingAboutSandy) {
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
      await this.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
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

  async sendOutboundMedia(phoneNumberOrJid, { imageUrl, imageBuffer, caption = '', mimetype = 'image/jpeg' }) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp bridge is not currently connected.');
    }

    let jid = phoneNumberOrJid;
    if (!jid.includes('@')) {
      const clean = String(phoneNumberOrJid).replace(/[^0-9]/g, '');
      jid = `${clean}@s.whatsapp.net`;
    }

    let buffer = imageBuffer;
    if (!buffer && imageUrl) {
      try {
        const resp = await fetch(imageUrl, {
          headers: { 'User-Agent': 'NeroLabsBot/3.0 (https://nerolabs.ai; bot@nerolabs.ai)' }
        });
        if (resp.ok) {
          buffer = Buffer.from(await resp.arrayBuffer());
          mimetype = resp.headers.get('content-type') || mimetype;
        }
      } catch (e) {
        console.warn('[WhatsApp Outbound Media Fetch Warning]:', e.message);
      }
    }

    if (buffer && buffer.length > 0) {
      await this.safeSendMessage(jid, { image: buffer, caption, mimetype });
    } else if (imageUrl) {
      await this.safeSendMessage(jid, { text: `${caption}\n\n👉 View Image: ${imageUrl}` });
    }
    return { ok: true, jid, caption };
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



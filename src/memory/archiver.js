import crypto from 'node:crypto';
import {
  insertRawMessage,
  getUnarchivedMessages,
  countUnarchivedMessages,
  markMessagesArchived,
  createArchiveBatch,
  updateArchiveBatchStatus,
  getArchiveBatches,
  addDurableMemory,
  registerGroupParticipant,
  getGroupParticipant,
  getGroupParticipants,
  getUserProfile,
  logAudit,
} from '../db/index.js';
import { googleDriveAdapter } from '../storage/driveAdapter.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { config } from '../config.js';

export class MessageArchiver {
  constructor() {
    this._processingLocks = new Set();
  }

  /**
   * Determine the speaker label according to specification:
   * "He: [exact original message]"
   * "She: [exact original message]"
   * Or for general groups, the configured display label / name.
   */
  getSpeakerLabel(chatId, senderId, senderName, isBot = false) {
    if (isBot) {
      return 'Nero';
    }

    const participant = getGroupParticipant(chatId, senderId);
    if (participant) {
      if (participant.gender_label && participant.gender_label.toLowerCase() === 'he') {
        return 'He';
      }
      if (participant.gender_label && participant.gender_label.toLowerCase() === 'she') {
        return 'She';
      }
    }

    // Check custom name if set
    const profile = getUserProfile(senderId);
    if (profile?.custom_name) {
      return profile.custom_name;
    }

    // Check configured owner (Sandy is configured owner -> 'He')
    if (config.telegramOwnerId && String(senderId) === String(config.telegramOwnerId)) {
      return 'He';
    }

    if (participant?.display_name) {
      return participant.display_name;
    }

    return senderName || `User_${senderId}`;
  }

  /**
   * Continuously capture and monitor an incoming message
   */
  async recordIncomingMessage(ctx) {
    if (!ctx.message || !ctx.chat) {
      return null;
    }

    const chatId = String(ctx.chat.id);
    const senderId = String(ctx.from?.id || 'unknown');
    const profile = getUserProfile(senderId);
    const senderName = profile?.custom_name || [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Anonymous';
    const senderUsername = ctx.from?.username || null;
    const platformMsgId = ctx.message.message_id;

    // Detect message type
    let messageType = 'text';
    let attachmentId = null;
    let rawContent = ctx.message.text || ctx.message.caption || '';

    if (ctx.message.photo && ctx.message.photo.length > 0) {
      messageType = 'photo';
      const largest = ctx.message.photo[ctx.message.photo.length - 1];
      attachmentId = largest.file_id;
    } else if (ctx.message.document) {
      messageType = 'document';
      attachmentId = ctx.message.document.file_id;
    } else if (ctx.message.voice) {
      messageType = 'voice';
      attachmentId = ctx.message.voice.file_id;
    } else if (ctx.message.sticker) {
      messageType = 'sticker';
      rawContent = ctx.message.sticker.emoji ? `[Sticker: ${ctx.message.sticker.emoji}]` : '[Sticker]';
    }

    // Register / update group participant
    let defaultGender = 'unknown';
    if (config.telegramOwnerId && senderId === String(config.telegramOwnerId)) {
      defaultGender = 'He';
    }
    registerGroupParticipant(chatId, senderId, senderName, defaultGender);

    // Insert into persistent raw archive
    const replyToId = ctx.message.reply_to_message?.message_id || null;
    insertRawMessage({
      platformMessageId: platformMsgId,
      chatId,
      senderId,
      senderName,
      senderUsername,
      messageType,
      replyToMessageId: replyToId,
      rawContent,
      caption: ctx.message.caption || null,
      attachmentId,
      createdAt: new Date(ctx.message.date ? ctx.message.date * 1000 : Date.now()).toISOString(),
    });

    // Check unarchived count for automatic 50-message trigger
    const unarchivedCount = countUnarchivedMessages(chatId);
    if (unarchivedCount >= 50) {
      // Trigger batch in background without blocking response loop
      this.processBatch(chatId, false).catch((err) => {
        console.warn(`[Archiver] Background batch failed for chat ${chatId}:`, err.message);
      });
    }

    return { platformMsgId, unarchivedCount };
  }

  /**
   * Process a batch of messages (50 for automatic, or all pending for manual)
   */
  async processBatch(chatId, isManual = false) {
    const lockKey = String(chatId);
    if (this._processingLocks.has(lockKey)) {
      return null; // Already archiving for this chat
    }

    this._processingLocks.add(lockKey);

    try {
      const requiredCount = isManual ? 1 : 50;
      const unarchivedCount = countUnarchivedMessages(chatId);

      if (unarchivedCount < requiredCount) {
        return null;
      }

      // 1. Collect messages in original chronological order
      const batchLimit = isManual ? Math.min(unarchivedCount, 100) : 50;
      const messages = getUnarchivedMessages(chatId, batchLimit);

      if (messages.length === 0) {
        return null;
      }

      const startMsg = messages[0];
      const endMsg = messages[messages.length - 1];

      // 2. Generate readable transcript with exact original content
      // Format: "He: [exact original message]", "She: [exact original message]"
      const transcriptLines = messages.map((m) => {
        const isBot = m.sender_name === 'Nero' || m.message_type === 'bot_reply';
        const speaker = this.getSpeakerLabel(chatId, m.sender_id, m.sender_name, isBot);
        const content = m.raw_content || (m.caption ? `[Image: ${m.caption}]` : '[Attachment]');
        return `${speaker}: ${content}`;
      });

      const transcriptContent = transcriptLines.join('\n');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const transcriptFilename = `transcript_batch_${startMsg.platform_message_id}_to_${endMsg.platform_message_id}_${timestamp}.txt`;

      // 3. Save transcript to Google Drive / local storage
      const transcriptResult = await googleDriveAdapter.saveGroupTranscript({
        groupId: chatId,
        filename: transcriptFilename,
        content: transcriptContent,
        actorId: 'archiver',
      });

      // 4. Generate contextual summary and durable memory
      const summaryFilename = `summary_batch_${startMsg.platform_message_id}_to_${endMsg.platform_message_id}_${timestamp}.txt`;
      let summaryContent = `Summary of batch ${startMsg.platform_message_id}-${endMsg.platform_message_id} (${messages.length} messages):\n`;
      
      try {
        if (scaleMaxAdapter.isConfigured()) {
          const prompt = `You are the memory archivist for Nero Labs AI.
Analyze this raw chat transcript from group ${chatId} (${messages.length} messages).
Provide:
1. A concise factual summary of the topics discussed.
2. Explicitly note any plans, decisions, deadlines, or facts made by the participants.

TRANSCRIPT:
${transcriptContent.slice(0, 3000)}`;

          const completion = await scaleMaxAdapter.createChatCompletion({
            model: 'gpt-6-luna',
            messages: [{ role: 'user', content: prompt }],
            chatId,
          });

          if (completion.text) {
            summaryContent += completion.text;

            // Extract durable facts into durable_memory_index
            this._extractDurableFacts(chatId, completion.text, startMsg.platform_message_id, startMsg.created_at);
          }
        } else {
          summaryContent += `Archived ${messages.length} messages chronologically from ID ${startMsg.platform_message_id} to ${endMsg.platform_message_id}.`;
        }
      } catch (err) {
        summaryContent += `Auto-summary fallback: Recorded ${messages.length} messages. (Summary engine note: ${err.message})`;
      }

      // 5. Save summary to Google Drive / local storage
      const summaryResult = await googleDriveAdapter.saveGroupSummary({
        groupId: chatId,
        filename: summaryFilename,
        content: summaryContent,
        actorId: 'archiver',
      });

      // 6. Verify that uploaded files exist before marking batch complete (Requirement 4)
      const transcriptVerified = await googleDriveAdapter.verifyFileExists(transcriptResult.localPath);
      const summaryVerified = await googleDriveAdapter.verifyFileExists(summaryResult.localPath);

      if (!transcriptVerified || !summaryVerified) {
        throw new Error('Verification failed: Written archive files could not be confirmed on disk/drive.');
      }

      // 7. Record batch checkpoint in database
      const batchId = createArchiveBatch({
        chatId,
        startMessageId: startMsg.platform_message_id,
        endMessageId: endMsg.platform_message_id,
        messageCount: messages.length,
        transcriptFilename,
        driveFileId: transcriptResult.driveFileId,
        summaryFilename,
        summaryDriveId: summaryResult.driveFileId,
        summaryContent,
        checksum: transcriptResult.checksum,
        status: 'verified',
      });

      updateArchiveBatchStatus(
        batchId,
        'verified',
        new Date().toISOString(),
        transcriptResult.driveFileId,
        summaryResult.driveFileId
      );

      // 8. Mark messages as archived
      const messageDbIds = messages.map((m) => m.id);
      markMessagesArchived(messageDbIds, batchId);

      logAudit('archiver', 'BATCH_ARCHIVED', `Batch ${batchId} archived for chat ${chatId}: ${messages.length} messages`);

      return {
        batchId,
        messageCount: messages.length,
        transcriptFilename,
        summaryFilename,
        driveFileId: transcriptResult.driveFileId,
        checksum: transcriptResult.checksum,
        verified: true,
      };
    } finally {
      this._processingLocks.delete(lockKey);
    }
  }

  /**
   * Parse facts, decisions, and plans from summary into durable memory
   */
  _extractDurableFacts(chatId, summaryText, sourceMsgId, sourceDate) {
    try {
      const lines = summaryText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (/decision|decided/i.test(trimmed) && trimmed.length > 10) {
          addDurableMemory(chatId, 'decision', 'Group Decision', trimmed, sourceMsgId, sourceDate);
        } else if (/plan|planned|schedule/i.test(trimmed) && trimmed.length > 10) {
          addDurableMemory(chatId, 'plan', 'Group Plan', trimmed, sourceMsgId, sourceDate);
        } else if (/deadline|due|by\s+\w+/i.test(trimmed) && trimmed.length > 10) {
          addDurableMemory(chatId, 'deadline', 'Deadline/Date', trimmed, sourceMsgId, sourceDate);
        } else if (/fact|agreed|confirmed/i.test(trimmed) && trimmed.length > 10) {
          addDurableMemory(chatId, 'fact', 'Confirmed Fact', trimmed, sourceMsgId, sourceDate);
        }
      }
    } catch (err) {
      console.warn('[Archiver] Fact extraction note:', err.message);
    }
  }

  /**
   * Get archive status summary for a chat
   */
  getArchiveStatus(chatId) {
    const unarchivedCount = countUnarchivedMessages(chatId);
    const batches = getArchiveBatches(chatId, 5);
    return {
      unarchivedCount,
      totalBatches: batches.length,
      recentBatches: batches,
    };
  }
}

export const messageArchiver = new MessageArchiver();

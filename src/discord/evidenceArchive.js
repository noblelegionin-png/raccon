/**
 * 🦝 ROCKET AI — MESSAGE EVIDENCE ARCHIVE & SCREENSHOT VERIFICATION ENGINE
 * 
 * Implements:
 * - Transparent message archiving (Message ID, author, channel, timestamp, content, attachments)
 * - Real-time tracking of message edit and deletion events
 * - Evidence Verification Engine:
 *   Classifies evidence into VERIFIED, UNVERIFIED, or DISPUTED
 * - Hall of Shame management
 * - Backup synchronization to local drive storage & Google Drive adapter
 */

import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';
import {
  archiveMessage,
  archiveMessageEdit,
  archiveMessageDelete,
  getArchivedMessage,
  searchMessageArchive,
  addHallOfShameEntry,
  listHallOfShameEntries,
} from './discordDb.js';
import { GoogleDriveAdapter } from '../storage/driveAdapter.js';

const driveAdapter = new GoogleDriveAdapter();

const SUCCESS_COLOR = 0x2ecc71;
const WARN_COLOR = 0xf39c12;
const DANGER_COLOR = 0xe74c3c;
const BRAND_COLOR = 0xff6b35;

/**
 * Capture incoming message into the evidence archive
 */
export async function trackIncomingMessage(message) {
  if (!message.guild || message.author.bot) return;

  try {
    archiveMessage(
      message.guild.id,
      message.channel.id,
      message.channel.name,
      message
    );
  } catch (err) {
    console.warn('[EvidenceArchive Message Error]:', err.message);
  }
}

/**
 * Capture message edit event
 */
export async function trackMessageEdit(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  try {
    archiveMessageEdit(
      newMessage.id,
      oldMessage.content || '',
      newMessage.content || ''
    );
  } catch (err) {
    console.warn('[EvidenceArchive Edit Error]:', err.message);
  }
}

/**
 * Capture message delete event
 */
export async function trackMessageDelete(message) {
  if (!message.guild) return;

  try {
    archiveMessageDelete(message.id);
  } catch (err) {
    console.warn('[EvidenceArchive Delete Error]:', err.message);
  }
}

/**
 * Verify submitted claim or screenshot against message archive
 * Returns evidence status: 'VERIFIED' | 'UNVERIFIED' | 'DISPUTED'
 */
export async function verifySubmittedEvidence(guildId, {
  messageId = '',
  authorId = '',
  channelId = '',
  textSnippet = '',
} = {}) {
  // 1. Direct message ID lookup
  if (messageId) {
    const record = getArchivedMessage(messageId);
    if (record) {
      if (authorId && record.author_id !== authorId) {
        return {
          status: 'DISPUTED',
          reason: `Message ID was found, but author ID does NOT match. Stored author is <@${record.author_id}>, but reported author is <@${authorId}>.`,
          record,
        };
      }
      return {
        status: 'VERIFIED',
        reason: 'Exact message ID verified in server evidence archive.',
        record,
      };
    }
  }

  // 2. Search by author + channel + text snippet
  if (textSnippet && textSnippet.length >= 4) {
    const matches = searchMessageArchive(guildId, {
      authorId,
      channelId,
      textSnippet: textSnippet.trim(),
      limit: 5,
    });

    if (matches.length > 0) {
      const match = matches[0];
      if (match.is_deleted) {
        return {
          status: 'VERIFIED',
          reason: `Verified match located. Note: The message was deleted on ${new Date(match.deleted_at).toLocaleString()}.`,
          record: match,
        };
      }
      if (match.is_edited) {
        return {
          status: 'VERIFIED',
          reason: 'Verified match located. Note: The message was edited after posting.',
          record: match,
        };
      }
      return {
        status: 'VERIFIED',
        reason: 'Verified match located in server archives.',
        record: match,
      };
    }
  }

  // 3. Fallback: Cannot confirm
  return {
    status: 'UNVERIFIED',
    reason: 'No matching message found in captured server records. (Note: Messages sent before Rocket joined or in unmonitored channels cannot be retrospectively recovered).',
    record: null,
  };
}

/**
 * Sync evidence archive to local backup & Google Drive storage folder
 */
export async function syncEvidenceBackup(guildId) {
  try {
    const backupDir = path.resolve('data/drive_storage/EvidenceBackups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const archiveData = searchMessageArchive(guildId, { limit: 1000 });
    const filename = `evidence_archive_${guildId}_${new Date().toISOString().slice(0, 10)}.json`;
    const filePath = path.join(backupDir, filename);

    fs.writeFileSync(filePath, JSON.stringify(archiveData, null, 2), 'utf8');

    // Also attempt Google Drive client upload if configured
    const client = await driveAdapter.getDriveClient();
    if (client && driveAdapter.folderId) {
      await client.files.create({
        requestBody: {
          name: filename,
          parents: [driveAdapter.folderId],
        },
        media: {
          mimeType: 'application/json',
          body: fs.createReadStream(filePath),
        },
      });
      return { success: true, syncedGoogleDrive: true, path: filePath, localPath: filePath, recordCount: archiveData.length };
    }

    return { success: true, syncedGoogleDrive: false, localPath: filePath, recordCount: archiveData.length };
  } catch (err) {
    console.warn('[Evidence Backup Sync Error]:', err.message);
    return { success: false, error: err.message };
  }
}

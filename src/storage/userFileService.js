/**
 * 📁 NERO LABS — USER ISOLATED FILE STORAGE SERVICE
 * 
 * Manages user files with strict per-user isolation:
 * - Local filesystem sandbox: ./data/user_files/{userId}/
 * - Google Drive user folders (when configured)
 * - File size limits (max 20 MB) & MIME type validation
 * - User access control (User A cannot view or delete User B's files)
 * - Deletion cascade (removes stored copies and SQLite records)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  addUserFile,
  getUserFiles,
  deleteUserFile as dbDeleteUserFile,
  logAudit,
} from '../db/index.js';
import { googleDriveAdapter } from './driveAdapter.js';

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB limit

export const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'text/',
  'application/pdf',
  'application/json',
];

export class UserFileService {
  constructor() {
    this.baseStorageDir = path.resolve('./data/user_files');
    if (!fs.existsSync(this.baseStorageDir)) {
      fs.mkdirSync(this.baseStorageDir, { recursive: true });
    }
  }

  /**
   * Get the isolated directory for a specific user
   * @param {string|number} userId
   * @returns {string} Absolute path to user's isolated folder
   */
  getUserDirectory(userId) {
    const cleanId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const userDir = path.join(this.baseStorageDir, cleanId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  /**
   * Upload and store a file with strict user isolation
   * @param {string|number} userId
   * @param {Object} file - { filename, mimeType, buffer, aiDescription }
   * @returns {Promise<Object>} Stored file record
   */
  async storeUserFile(userId, { filename, mimeType = 'application/octet-stream', buffer, aiDescription = null }) {
    const uId = String(userId);
    if (!buffer || buffer.length === 0) {
      throw new Error('File buffer is empty or missing.');
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size (${Math.round(buffer.length / (1024 * 1024))} MB) exceeds the maximum allowed limit of 20 MB.`);
    }

    const isMimeAllowed = ALLOWED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
    if (!isMimeAllowed) {
      throw new Error(`Unsupported file type '${mimeType}'. Supported: images, audio, video, text, and PDF documents.`);
    }

    const safeName = path.basename(filename || 'file_' + Date.now()).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const userDir = this.getUserDirectory(uId);
    const localFilePath = path.join(userDir, `${Date.now()}_${safeName}`);

    // Save to isolated local filesystem
    fs.writeFileSync(localFilePath, buffer);

    let storageType = 'local';
    let driveFileId = null;

    // Save to Google Drive if cloud adapter is operational
    try {
      if (googleDriveAdapter.isConfigured && googleDriveAdapter.isConfigured()) {
        const driveRes = await googleDriveAdapter.saveGroupAttachment({
          groupId: `user_${uId}`,
          filename: safeName,
          buffer,
          mimeType,
          actorId: uId,
        });
        if (driveRes && driveRes.driveFileId) {
          driveFileId = driveRes.driveFileId;
          storageType = 'drive';
        }
      }
    } catch (err) {
      console.warn('[UserFileService] Cloud Drive upload notice:', err.message);
    }

    // Index in SQLite user_files
    const record = addUserFile(uId, {
      filename: safeName,
      mimeType,
      fileSize: buffer.length,
      storageType,
      driveFileId,
      localPath: localFilePath,
      aiDescription,
    });

    logAudit(uId, 'USER_FILE_STORED', `Stored ${safeName} (${Math.round(buffer.length / 1024)} KB)`);

    return {
      id: record.id,
      userId: uId,
      filename: safeName,
      fileSize: buffer.length,
      mimeType,
      storageType,
      aiDescription,
      localPath: localFilePath,
      absolutePath: localFilePath,
    };
  }

  /**
   * List files belonging to a specific user (strict isolation)
   * @param {string|number} userId
   * @returns {Array<Object>} List of user files
   */
  listUserFiles(userId) {
    return getUserFiles(String(userId));
  }

  /**
   * Delete a file with authorization check and physical removal
   * @param {number} fileId
   * @param {string|number} requestingUserId
   * @returns {boolean}
   */
  deleteUserFile(fileId, requestingUserId) {
    const uId = String(requestingUserId);
    const files = getUserFiles(uId);
    const target = files.find(f => Number(f.id) === Number(fileId));

    if (!target) {
      throw new Error('File not found or permission denied: You do not own this file.');
    }

    // Delete local file if it exists
    if (target.local_path && fs.existsSync(target.local_path)) {
      try {
        fs.unlinkSync(target.local_path);
      } catch (err) {
        console.warn('[UserFileService] File unlink warning:', err.message);
      }
    }

    // Delete from SQLite
    dbDeleteUserFile(fileId, uId);
    logAudit(uId, 'USER_FILE_DELETED', `Deleted file #${fileId} (${target.filename})`);
    return true;
  }
}

export const userFileService = new UserFileService();

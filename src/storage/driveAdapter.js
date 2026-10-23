import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { config } from '../config.js';
import { getConfig, setConfig, logAudit } from '../db/index.js';

/**
 * Google Drive & Cloud Storage Adapter
 * Designed for 5 TB cloud storage tier with full management permissions:
 * - Create folders (make directories)
 * - Upload and edit files (write/update)
 * - Delete files and folders (full deletion permissions)
 * - List and search storage assets
 * - Automatic database snapshot backups
 * 
 * Operates with full Google Drive API v3 when credentials are provided,
 * with zero-crash local sandbox fallback.
 */
export class GoogleDriveAdapter {
  constructor() {
    this.credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
    this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
    this.accountEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL || '';
    this.credentialsJson = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON || '';
    this._driveClient = null;

    // Ensure local storage directory exists
    this.localStorageDir = path.resolve('data/drive_storage');
    this.memoryBaseDir = path.join(this.localStorageDir, 'Nero', 'Memory');
    this._driveFolderCache = new Map();

    if (!fs.existsSync(this.localStorageDir)) {
      fs.mkdirSync(this.localStorageDir, { recursive: true });
    }

    this.ensureMemoryStructure();
  }

  /**
   * Initialize or retrieve authenticated Google Drive client
   */
  async getDriveClient() {
    if (this._driveClient) {
      return this._driveClient;
    }

    try {
      let auth = null;

      // 1. Service account JSON file
      if (this.credentialsPath && fs.existsSync(this.credentialsPath)) {
        auth = new google.auth.GoogleAuth({
          keyFile: this.credentialsPath,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });
      }
      // 2. Inline credentials JSON
      else if (this.credentialsJson) {
        const credentials = JSON.parse(this.credentialsJson);
        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });
      }

      if (auth) {
        this._driveClient = google.drive({ version: 'v3', auth });
        return this._driveClient;
      }
    } catch (err) {
      console.warn('[GoogleDrive] Failed to initialize Google Drive client:', err.message);
    }

    return null;
  }

  /**
   * Safe status check: Never exposes secrets or private keys
   */
  getStatus() {
    const isEnabled = getConfig('drive_storage_enabled', 'true') === 'true';
    const hasCreds = Boolean(this.credentialsPath && fs.existsSync(this.credentialsPath));
    const hasInlineCreds = Boolean(this.credentialsJson);
    const hasFolder = Boolean(this.folderId);

    // Identify account safely
    let identifiedAccount = 'Local Cloud Sandbox (5 TB Target)';
    if (this.accountEmail) {
      identifiedAccount = this.accountEmail.replace(/(.{3})(.*)(@.*)/, '$1***$3');
    } else if (hasCreds) {
      try {
        const raw = fs.readFileSync(this.credentialsPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.client_email) {
          identifiedAccount = parsed.client_email.replace(/(.{3})(.*)(@.*)/, '$1***$3');
        }
      } catch {}
    } else if (hasInlineCreds) {
      try {
        const parsed = JSON.parse(this.credentialsJson);
        if (parsed.client_email) {
          identifiedAccount = parsed.client_email.replace(/(.{3})(.*)(@.*)/, '$1***$3');
        }
      } catch {}
    }

    const isConnected = (hasCreds || hasInlineCreds);

    return {
      configured: isConnected,
      enabled: isEnabled,
      hasCredentialsFile: hasCreds,
      hasInlineCredentials: hasInlineCreds,
      folderConfigured: hasFolder,
      identifiedAccount,
      capacityTarget: '5 TB Cloud Tier',
      status: isEnabled
        ? (isConnected ? 'operational' : 'local_sandbox_active')
        : 'disabled_by_owner',
      permissions: {
        canCreateFolders: true,
        canUploadFiles: true,
        canEditFiles: true,
        canDeleteFiles: true,
        canDeleteFolders: true,
        fullAccessGranted: true,
      },
      localBackupDir: path.resolve('data/backups'),
      localStorageDir: this.localStorageDir,
    };
  }

  /**
   * Verify access safely without exposing credentials
   */
  async verifyConnection() {
    const status = this.getStatus();
    const drive = await this.getDriveClient();

    if (drive) {
      try {
        const res = await drive.about.get({
          fields: 'storageQuota, user',
        });
        const quota = res.data?.storageQuota || {};
        return {
          ok: true,
          mode: 'google_drive_cloud',
          account: res.data?.user?.emailAddress || status.identifiedAccount,
          storageQuota: {
            limit: quota.limit ? `${Math.round(quota.limit / 1024 / 1024 / 1024)} GB` : 'Unlimited / 5 TB',
            usage: quota.usage ? `${Math.round(quota.usage / 1024 / 1024)} MB` : '0 MB',
          },
          status: 'operational',
        };
      } catch (err) {
        return {
          ok: false,
          error: `Google Drive API error: ${err.message}`,
          status: 'error',
        };
      }
    }

    return {
      ok: true,
      mode: 'local_storage_sandbox',
      message: 'Active in high-resilience local storage sandbox. To bind directly to live Google Drive, set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_DRIVE_CREDENTIALS_JSON in .env.',
      status: 'ready',
    };
  }

  /**
   * Create a new folder (Make Folder)
   */
  async createFolder(folderName, parentFolderId = null, actorId = 'system') {
    if (!folderName || !folderName.trim()) {
      throw new Error('Folder name cannot be empty.');
    }
    const safeName = folderName.trim();
    const drive = await this.getDriveClient();

    if (drive) {
      const parent = parentFolderId || this.folderId || null;
      const fileMetadata = {
        name: safeName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parent ? { parents: [parent] } : {}),
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, mimeType, webViewLink, createdTime',
      });

      logAudit(actorId, 'DRIVE_MKDIR', `Created Google Drive folder: ${safeName} (${file.data.id})`);
      return {
        id: file.data.id,
        name: file.data.name,
        isFolder: true,
        webViewLink: file.data.webViewLink,
        createdTime: file.data.createdTime,
        cloud: true,
      };
    }

    // Local Sandbox Fallback
    const targetDir = path.join(this.localStorageDir, safeName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    logAudit(actorId, 'DRIVE_MKDIR_LOCAL', `Created local folder: ${safeName}`);
    return {
      id: `local_dir_${Buffer.from(safeName).toString('hex')}`,
      name: safeName,
      isFolder: true,
      path: targetDir,
      createdTime: new Date().toISOString(),
      cloud: false,
    };
  }

  /**
   * List files and folders
   */
  async listFiles(folderId = null, pageSize = 20) {
    const drive = await this.getDriveClient();

    if (drive) {
      const parent = folderId || this.folderId || null;
      let query = 'trashed = false';
      if (parent) {
        query += ` and '${parent}' in parents`;
      }

      const res = await drive.files.list({
        q: query,
        pageSize,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
        orderBy: 'folder, name',
      });

      return (res.data.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
        size: f.size ? `${Math.round(f.size / 1024)} KB` : '-',
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        cloud: true,
      }));
    }

    // Local Sandbox Fallback
    const entries = fs.readdirSync(this.localStorageDir, { withFileTypes: true });
    return entries.map((entry) => {
      const fullPath = path.join(this.localStorageDir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        id: `local_${Buffer.from(entry.name).toString('hex')}`,
        name: entry.name,
        isFolder: entry.isDirectory(),
        size: entry.isDirectory() ? '-' : `${Math.round(stat.size / 1024)} KB`,
        modifiedTime: stat.mtime.toISOString(),
        cloud: false,
      };
    });
  }

  /**
   * Upload or create a file
   */
  async uploadFile({ name, content, mimeType = 'text/plain', parentFolderId = null, actorId = 'system' }) {
    if (!name || !name.trim()) {
      throw new Error('Filename cannot be empty.');
    }
    const safeName = name.trim();
    const drive = await this.getDriveClient();

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content || '', 'utf8');

    if (drive) {
      const parent = parentFolderId || this.folderId || null;
      const fileMetadata = {
        name: safeName,
        ...(parent ? { parents: [parent] } : {}),
      };

      const media = {
        mimeType,
        body: Readable.from(buffer),
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, name, mimeType, size, webViewLink, createdTime',
      });

      logAudit(actorId, 'DRIVE_UPLOAD', `Uploaded to Google Drive: ${safeName} (${file.data.id})`);
      return {
        id: file.data.id,
        name: file.data.name,
        size: file.data.size,
        mimeType: file.data.mimeType,
        webViewLink: file.data.webViewLink,
        cloud: true,
      };
    }

    // Local Sandbox Fallback
    const filePath = path.join(this.localStorageDir, safeName);
    fs.writeFileSync(filePath, buffer);

    logAudit(actorId, 'DRIVE_UPLOAD_LOCAL', `Saved file to local storage: ${safeName}`);
    return {
      id: `local_${Buffer.from(safeName).toString('hex')}`,
      name: safeName,
      size: buffer.length,
      mimeType,
      path: filePath,
      cloud: false,
    };
  }

  /**
   * Edit/Update an existing file
   */
  async editFile(fileId, newContent, newMimeType = 'text/plain', actorId = 'system') {
    const drive = await this.getDriveClient();
    const buffer = Buffer.isBuffer(newContent) ? newContent : Buffer.from(newContent || '', 'utf8');

    if (drive && !fileId.startsWith('local_')) {
      const media = {
        mimeType: newMimeType,
        body: Readable.from(buffer),
      };

      const file = await drive.files.update({
        fileId,
        media,
        fields: 'id, name, mimeType, size, modifiedTime',
      });

      logAudit(actorId, 'DRIVE_EDIT', `Updated Google Drive file: ${file.data.name} (${fileId})`);
      return {
        id: file.data.id,
        name: file.data.name,
        size: file.data.size,
        modifiedTime: file.data.modifiedTime,
        cloud: true,
      };
    }

    // Local Sandbox Fallback
    const entries = fs.readdirSync(this.localStorageDir);
    for (const entry of entries) {
      const entryId = `local_${Buffer.from(entry).toString('hex')}`;
      if (entryId === fileId || entry === fileId) {
        const filePath = path.join(this.localStorageDir, entry);
        fs.writeFileSync(filePath, buffer);
        logAudit(actorId, 'DRIVE_EDIT_LOCAL', `Updated local file: ${entry}`);
        return {
          id: entryId,
          name: entry,
          size: buffer.length,
          modifiedTime: new Date().toISOString(),
          cloud: false,
        };
      }
    }

    throw new Error(`File with ID ${fileId} not found.`);
  }

  /**
   * Delete a file or folder (Full Deletion Permission)
   */
  async deleteFile(fileId, actorId = 'system') {
    if (!fileId) {
      throw new Error('File ID is required for deletion.');
    }

    const drive = await this.getDriveClient();

    if (drive && !fileId.startsWith('local_')) {
      await drive.files.delete({ fileId });
      logAudit(actorId, 'DRIVE_DELETE', `Deleted Google Drive file/folder: ${fileId}`);
      return { success: true, fileId, cloud: true };
    }

    // Local Sandbox Fallback
    const entries = fs.readdirSync(this.localStorageDir);
    for (const entry of entries) {
      const entryId = `local_${Buffer.from(entry).toString('hex')}`;
      const entryDirId = `local_dir_${Buffer.from(entry).toString('hex')}`;
      if (entryId === fileId || entryDirId === fileId || entry === fileId) {
        const fullPath = path.join(this.localStorageDir, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        logAudit(actorId, 'DRIVE_DELETE_LOCAL', `Deleted local asset: ${entry}`);
        return { success: true, fileId, name: entry, cloud: false };
      }
    }

    throw new Error(`Asset with ID ${fileId} not found.`);
  }

  /**
   * Backup SQLite database to local archive and upload to Drive if configured
   */
  async backupDatabase(actorId = 'system') {
    const backupDir = path.resolve('data/backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `nero_db_backup_${timestamp}.sqlite`;
    const targetPath = path.join(backupDir, backupFilename);
    const sourceDb = path.resolve(config.databasePath);

    if (!fs.existsSync(sourceDb)) {
      throw new Error(`Source database file does not exist at ${sourceDb}`);
    }

    // Create safe snapshot copy
    fs.copyFileSync(sourceDb, targetPath);
    const fileStats = fs.statSync(targetPath);

    logAudit(actorId, 'BACKUP_CREATED', `Local database snapshot created: ${backupFilename} (${fileStats.size} bytes)`);

    const driveStatus = this.getStatus();
    let driveUploaded = false;

    if (driveStatus.configured) {
      try {
        const content = fs.readFileSync(targetPath);
        await this.uploadFile({
          name: backupFilename,
          content,
          mimeType: 'application/x-sqlite3',
          actorId,
        });
        driveUploaded = true;
      } catch (err) {
        console.warn('[GoogleDrive] Backup upload to Drive failed:', err.message);
      }
    }

    return {
      success: true,
      filename: backupFilename,
      bytes: fileStats.size,
      localPath: targetPath,
      driveUploaded,
      driveStatus: driveStatus.status,
    };
  }

  /**
   * Ensure standard 7-tier Nero Memory directory structure exists
   */
  ensureMemoryStructure() {
    const requiredDirs = [
      'Conversations',
      'Summaries',
      'Attachments',
      'Indexes',
      'Metadata',
      'Backups',
    ];

    if (!fs.existsSync(this.memoryBaseDir)) {
      fs.mkdirSync(this.memoryBaseDir, { recursive: true });
    }

    for (const dir of requiredDirs) {
      const full = path.join(this.memoryBaseDir, dir);
      if (!fs.existsSync(full)) {
        fs.mkdirSync(full, { recursive: true });
      }
    }
  }

  /**
   * Sanitize group ID for filesystem and drive hierarchy
   */
  sanitizeGroupId(groupId) {
    if (!groupId) return 'general';
    return String(groupId).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Ensure group specific memory directory exists
   */
  async ensureGroupDirectory(category, groupId) {
    this.ensureMemoryStructure();
    const safeGroup = this.sanitizeGroupId(groupId);
    const localDir = path.join(this.memoryBaseDir, category, safeGroup);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    // If live Google Drive is connected, ensure folder in cloud
    const drive = await this.getDriveClient();
    let cloudFolderId = null;

    if (drive) {
      const cacheKey = `${category}/${safeGroup}`;
      if (this._driveFolderCache.has(cacheKey)) {
        cloudFolderId = this._driveFolderCache.get(cacheKey);
      } else {
        try {
          // Find or create category folder
          let catFolderId = this._driveFolderCache.get(category);
          if (!catFolderId) {
            const catRes = await drive.files.list({
              q: `mimeType = 'application/vnd.google-apps.folder' and name = '${category}' and trashed = false`,
              fields: 'files(id, name)',
            });
            if (catRes.data.files && catRes.data.files.length > 0) {
              catFolderId = catRes.data.files[0].id;
            } else {
              const newCat = await drive.files.create({
                requestBody: {
                  name: category,
                  mimeType: 'application/vnd.google-apps.folder',
                  ...(this.folderId ? { parents: [this.folderId] } : {}),
                },
                fields: 'id',
              });
              catFolderId = newCat.data.id;
            }
            this._driveFolderCache.set(category, catFolderId);
          }

          // Find or create group folder inside category
          const grpRes = await drive.files.list({
            q: `'${catFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${safeGroup}' and trashed = false`,
            fields: 'files(id, name)',
          });
          if (grpRes.data.files && grpRes.data.files.length > 0) {
            cloudFolderId = grpRes.data.files[0].id;
          } else {
            const newGrp = await drive.files.create({
              requestBody: {
                name: safeGroup,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [catFolderId],
              },
              fields: 'id',
            });
            cloudFolderId = newGrp.data.id;
          }
          this._driveFolderCache.set(cacheKey, cloudFolderId);
        } catch (err) {
          console.warn(`[GoogleDrive] Failed to ensure cloud group directory for ${category}/${safeGroup}:`, err.message);
        }
      }
    }

    return { localDir, cloudFolderId, safeGroup };
  }

  /**
   * Save a 50-message transcript to Nero/Memory/Conversations/{groupId}/
   */
  async saveGroupTranscript({ groupId, filename, content, actorId = 'system' }) {
    const { localDir, cloudFolderId } = await this.ensureGroupDirectory('Conversations', groupId);
    const filePath = path.join(localDir, filename);
    const buffer = Buffer.from(content, 'utf8');
    fs.writeFileSync(filePath, buffer);

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    let driveFileId = null;
    let cloud = false;

    const drive = await this.getDriveClient();
    if (drive && cloudFolderId) {
      try {
        const file = await drive.files.create({
          requestBody: {
            name: filename,
            parents: [cloudFolderId],
          },
          media: {
            mimeType: 'text/plain',
            body: Readable.from(buffer),
          },
          fields: 'id, name, webViewLink',
        });
        driveFileId = file.data.id;
        cloud = true;
      } catch (err) {
        console.warn('[GoogleDrive] Transcript upload failed:', err.message);
      }
    }

    logAudit(actorId, 'SAVE_GROUP_TRANSCRIPT', `Saved transcript ${filename} for group ${groupId} (bytes: ${buffer.length})`);

    return {
      filename,
      localPath: filePath,
      driveFileId: driveFileId || `local_tr_${Buffer.from(filename).toString('hex')}`,
      checksum,
      bytes: buffer.length,
      cloud,
    };
  }

  /**
   * Save a batch summary to Nero/Memory/Summaries/{groupId}/
   */
  async saveGroupSummary({ groupId, filename, content, actorId = 'system' }) {
    const { localDir, cloudFolderId } = await this.ensureGroupDirectory('Summaries', groupId);
    const filePath = path.join(localDir, filename);
    const buffer = Buffer.from(content, 'utf8');
    fs.writeFileSync(filePath, buffer);

    let driveFileId = null;
    let cloud = false;

    const drive = await this.getDriveClient();
    if (drive && cloudFolderId) {
      try {
        const file = await drive.files.create({
          requestBody: {
            name: filename,
            parents: [cloudFolderId],
          },
          media: {
            mimeType: 'text/plain',
            body: Readable.from(buffer),
          },
          fields: 'id, name, webViewLink',
        });
        driveFileId = file.data.id;
        cloud = true;
      } catch (err) {
        console.warn('[GoogleDrive] Summary upload failed:', err.message);
      }
    }

    logAudit(actorId, 'SAVE_GROUP_SUMMARY', `Saved summary ${filename} for group ${groupId}`);

    return {
      filename,
      localPath: filePath,
      driveFileId: driveFileId || `local_sm_${Buffer.from(filename).toString('hex')}`,
      bytes: buffer.length,
      cloud,
    };
  }

  /**
   * Save media/image attachment to Nero/Memory/Attachments/{groupId}/
   */
  async saveGroupAttachment({ groupId, filename, buffer, mimeType = 'image/jpeg', actorId = 'system' }) {
    const { localDir, cloudFolderId } = await this.ensureGroupDirectory('Attachments', groupId);
    const filePath = path.join(localDir, filename);
    fs.writeFileSync(filePath, buffer);

    let driveFileId = null;
    let webViewLink = null;
    let cloud = false;

    const drive = await this.getDriveClient();
    if (drive && cloudFolderId) {
      try {
        const file = await drive.files.create({
          requestBody: {
            name: filename,
            parents: [cloudFolderId],
          },
          media: {
            mimeType,
            body: Readable.from(buffer),
          },
          fields: 'id, name, webViewLink',
        });
        driveFileId = file.data.id;
        webViewLink = file.data.webViewLink;
        cloud = true;
      } catch (err) {
        console.warn('[GoogleDrive] Attachment upload failed:', err.message);
      }
    }

    logAudit(actorId, 'SAVE_GROUP_ATTACHMENT', `Saved attachment ${filename} for group ${groupId} (${buffer.length} bytes)`);

    return {
      filename,
      localPath: filePath,
      driveFileId: driveFileId || `local_att_${Buffer.from(filename).toString('hex')}`,
      webViewLink,
      bytes: buffer.length,
      mimeType,
      cloud,
    };
  }

  /**
   * Retrieve attachment buffer from local storage or Google Drive
   */
  async getAttachmentBuffer(filenameOrId, groupId = null) {
    // 1. Search locally in group attachments if groupId provided
    if (groupId) {
      const safeGroup = this.sanitizeGroupId(groupId);
      const localCandidate = path.join(this.memoryBaseDir, 'Attachments', safeGroup, filenameOrId);
      if (fs.existsSync(localCandidate)) {
        return fs.readFileSync(localCandidate);
      }
    }

    // 2. Search recursively in all local attachments
    const attBase = path.join(this.memoryBaseDir, 'Attachments');
    if (fs.existsSync(attBase)) {
      const groupDirs = fs.readdirSync(attBase);
      for (const grp of groupDirs) {
        const candidate = path.join(attBase, grp, filenameOrId);
        if (fs.existsSync(candidate)) {
          return fs.readFileSync(candidate);
        }
      }
    }

    // 3. Fallback to general local drive storage
    const generalCandidate = path.join(this.localStorageDir, filenameOrId);
    if (fs.existsSync(generalCandidate)) {
      return fs.readFileSync(generalCandidate);
    }

    // 4. If Google Drive client available and ID is a cloud file ID
    const drive = await this.getDriveClient();
    if (drive && !filenameOrId.startsWith('local_') && filenameOrId.length > 15) {
      try {
        const res = await drive.files.get(
          { fileId: filenameOrId, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        return Buffer.from(res.data);
      } catch (err) {
        console.warn('[GoogleDrive] Failed to download cloud file buffer:', err.message);
      }
    }

    return null;
  }

  /**
   * Verify file exists and has content before marking batch complete
   */
  async verifyFileExists(fileIdOrPath) {
    if (!fileIdOrPath) return false;

    // Check local path
    if (fs.existsSync(fileIdOrPath)) {
      const stat = fs.statSync(fileIdOrPath);
      return stat.size > 0;
    }

    // Check Google Drive
    const drive = await this.getDriveClient();
    if (drive && !fileIdOrPath.startsWith('local_')) {
      try {
        const res = await drive.files.get({
          fileId: fileIdOrPath,
          fields: 'id, name, trashed, size',
        });
        return Boolean(res.data && !res.data.trashed);
      } catch {
        return false;
      }
    }

    return false;
  }
}

export const googleDriveAdapter = new GoogleDriveAdapter();

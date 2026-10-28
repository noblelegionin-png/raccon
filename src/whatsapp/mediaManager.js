import fs from 'node:fs';
import path from 'node:path';
import { getDb, logAudit } from '../db/index.js';
import { config } from '../config.js';

class MediaManager {
  constructor() {
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_media_vault (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_number TEXT NOT NULL,
        sender_name TEXT,
        file_type TEXT NOT NULL, -- 'image' or 'video'
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        caption TEXT,
        analysis_summary TEXT,
        created_at TEXT NOT NULL
      );
    `);
    this.initialized = true;
  }

  getMediaDir(senderNumber, fileType = 'images') {
    const dbDir = path.dirname(config.databasePath);
    const mediaDir = path.join(dbDir, 'whatsapp_media', String(senderNumber).replace(/[^0-9]/g, ''), fileType);
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    return mediaDir;
  }

  async saveMedia(params) {
    const buffer = params.fileBuffer || params.buffer;
    return this.saveMediaBuffer({ ...params, buffer });
  }

  async saveMediaBuffer({ buffer, senderNumber, senderName = 'Unknown', fileType = 'image', mimeType = 'image/jpeg', caption = '', analysis = '' }) {
    this.init();
    const cleanSender = String(senderNumber).replace(/[^0-9]/g, '') || 'unknown';
    const isDoc = fileType === 'pdf' || fileType === 'document';
    const subFolder = fileType === 'video' ? 'videos' : isDoc ? 'documents' : 'images';
    const dir = this.getMediaDir(cleanSender, subFolder);

    const ext = fileType === 'video'
      ? 'mp4'
      : isDoc
      ? 'pdf'
      : (mimeType.includes('png') ? 'png' : 'jpg');
    const timestamp = Date.now();
    const fileName = `${timestamp}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = path.join(dir, fileName);

    await fs.promises.writeFile(filePath, buffer);

    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO whatsapp_media_vault (
        sender_number, sender_name, file_type, file_name, file_path, mime_type, file_size, caption, analysis_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanSender,
      senderName,
      fileType,
      fileName,
      filePath,
      mimeType,
      buffer.length,
      caption,
      analysis,
      now
    );

    logAudit('whatsapp', 'MEDIA_SAVED', `Saved ${fileType} from +${cleanSender} (${buffer.length} bytes) to ${filePath}`);

    return {
      id: result.lastInsertRowid,
      fileName,
      filePath,
      fileSize: buffer.length,
      mimeType,
    };
  }

  getMediaHistory(senderNumber, limit = 20) {
    this.init();
    const db = getDb();
    const cleanSender = String(senderNumber).replace(/[^0-9]/g, '');
    return db.prepare(`
      SELECT id, file_type, file_name, file_path, file_size, caption, analysis_summary, created_at
      FROM whatsapp_media_vault
      WHERE sender_number = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(cleanSender, limit);
  }
}

export const mediaManager = new MediaManager();

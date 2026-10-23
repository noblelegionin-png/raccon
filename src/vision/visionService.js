import { InputFile } from 'grammy';
import { config } from '../config.js';
import { googleDriveAdapter } from '../storage/driveAdapter.js';
import { getAgentRouting } from '../models/modelRouter.js';
import {
  recordAttachment,
  searchAttachments,
  getRecentAttachments,
  logAudit,
} from '../db/index.js';

export class VisionService {
  constructor() {
    this._recentImageCache = new Map();
  }

  /**
   * Set recent image in cache for follow-up conversational context
   */
  setRecentImage(chatId, { fileId, buffer, mimeType = 'image/jpeg', timestamp = Date.now() }) {
    this._recentImageCache.set(String(chatId), { fileId, buffer, mimeType, timestamp });
  }

  /**
   * Get recent image for a chat (valid for 30 minutes)
   */
  getRecentImage(chatId) {
    const entry = this._recentImageCache.get(String(chatId));
    if (!entry) return null;
    if (Date.now() - entry.timestamp > 30 * 60 * 1000) {
      this._recentImageCache.delete(String(chatId));
      return null;
    }
    return entry;
  }
  /**
   * Download a photo file from Telegram Bot API servers
   */
  async downloadTelegramFile(api, fileId) {
    if (!config.telegramBotToken) {
      throw new Error('Telegram bot token is not configured.');
    }

    try {
      const fileInfo = await api.getFile(fileId);
      if (!fileInfo.file_path) {
        throw new Error('Telegram did not return a valid file path for this attachment.');
      }

      const downloadUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${fileInfo.file_path}`;
      const res = await fetch(downloadUrl);

      if (!res.ok) {
        throw new Error(`Failed to download media from Telegram server (HTTP ${res.status}). The attachment may have expired.`);
      }

      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      return {
        buffer,
        filePath: fileInfo.file_path,
        size: buffer.length,
      };
    } catch (err) {
      throw new Error(`Media download error: ${err.message}`);
    }
  }

  /**
   * Interpret an image with ScaleMax multimodal vision model (gemini-3.8-flash)
   */
  async analyzeImage({ buffer, prompt = '', mimeType = 'image/jpeg', chatId = 'unknown' }) {
    if (!config.scaleMaxApiKey) {
      return {
        description: 'AI vision processing is offline: ScaleMax API key is not configured.',
        ocrText: '',
      };
    }

    const base64 = buffer.toString('base64');
    const userPromptText = prompt && prompt.trim().length > 0
      ? `User note: "${prompt.trim()}". Look at this image and reply in character as Nero. Keep it short, straight to the point, and highlight only what's important.`
      : `Look at this image and tell me what you see in character as Nero. Keep it short, straight to the point, and highlight only the key focal point.`;

    const neroVisionPersona = `You are Nero, a stylish, sharp, and clever AI companion with a sleek cyberpunk aesthetic.
When the user sends or asks about an image:
- ALWAYS reply in character as Nero: warm, witty, confident, and direct.
- Keep your reply SHORT: strictly 1 to 3 concise, punchy sentences.
- Focus ONLY on what is genuinely important, cool, or prominent in the image (the main character, focal action, or obvious text).
- If there is prominent text (like a sign, logo, or screen name), mention it naturally in your thought.
- STRICTLY FORBIDDEN: Do NOT use markdown section headers (never output "### Overview", "### Key Visual Details", or "### Text Extraction").
- STRICTLY FORBIDDEN: Do NOT dump bulleted lists of technical minutiae or transcribe random blobs of unreadable pseudo-code.
- Never write robotic reports. Talk directly to the user like a brilliant friend standing right next to them.`;

    const startTime = Date.now();
    try {
      const response = await fetch(`${config.scaleMaxBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.scaleMaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemini-3.8-flash',
          messages: [
            {
              role: 'system',
              content: neroVisionPersona,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: userPromptText },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
              ],
            },
          ],
          max_tokens: 280,
          temperature: 0.4,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ScaleMax Vision API error (${response.status}): ${errText.slice(0, 150)}`);
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content || 'No description returned.';
      const latencyMs = Date.now() - startTime;

      // Clean up any stray academic headers or codeblocks if the model somehow slipped
      let cleanedText = rawText
        .replace(/^#{1,4}\s*(?:Overview|Key Visual Details|Text Extraction|Analysis|Description)[^\n]*\n+/gim, '')
        .replace(/```text\s*[\s\S]*?```/gi, '')
        .trim();

      if (!cleanedText) {
        cleanedText = rawText;
      }

      const usage = data.usage || null;

      return {
        description: cleanedText,
        latencyMs,
        usage,
        model: data.model || activeModel,
      };
    } catch (err) {
      console.warn('[VisionService] Vision model inference error:', err.message);
      return {
        description: `Could not analyze image content: ${err.message}`,
        error: err.message,
      };
    }
  }

  /**
   * Save an image received in a group to Google Drive / local storage and index it
   */
  async saveImageToDrive({ ctx, photoFileId, caption = '', actorId = 'system' }) {
    const chatId = String(ctx.chat.id);
    const senderId = String(ctx.from?.id || 'unknown');
    const senderName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Member';

    // 1. Download photo buffer from Telegram
    const { buffer } = await this.downloadTelegramFile(ctx.api, photoFileId);

    // 2. Run vision analysis for description and OCR
    const analysis = await this.analyzeImage({
      buffer,
      prompt: caption
        ? `The user provided this caption: "${caption}". Tell me what is important here.`
        : '',
      chatId,
    });

    // 3. Save to Google Drive under Nero/Memory/Attachments/{groupId}/
    const filename = `img_${chatId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.jpg`;
    const driveResult = await googleDriveAdapter.saveGroupAttachment({
      groupId: chatId,
      filename,
      buffer,
      mimeType: 'image/jpeg',
      actorId,
    });

    // 4. Index in SQLite attachments_index
    const attachmentDbId = recordAttachment(chatId, {
      platformFileId: photoFileId,
      senderId,
      senderName,
      filename,
      mimeType: 'image/jpeg',
      caption,
      aiDescription: analysis.description,
      driveFileId: driveResult.driveFileId,
      driveWebLink: driveResult.webViewLink,
      localPath: driveResult.localPath,
    });

    logAudit(actorId, 'IMAGE_SAVED_TO_DRIVE', `Saved ${filename} to Drive for chat ${chatId}`);

    return {
      attachmentDbId,
      filename,
      driveResult,
      analysis,
    };
  }

  /**
   * Find a previously saved image from Drive/index and send it into the current chat
   */
  async findAndSendSavedImage(ctx, query) {
    const chatId = String(ctx.chat.id);
    let target = null;

    if (query && query.trim().length > 0) {
      const matches = searchAttachments(chatId, query.trim(), 3);
      if (matches.length > 0) {
        target = matches[0];
      }
    }

    if (!target) {
      const recent = getRecentAttachments(chatId, 1);
      if (recent.length > 0) {
        target = recent[0];
      }
    }

    if (!target) {
      return ctx.reply('📂 I searched our saved Drive attachments for this group, but no matching saved pictures were found.', {
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    }

    // Retrieve buffer
    const buffer = await googleDriveAdapter.getAttachmentBuffer(target.filename, chatId);

    if (!buffer) {
      return ctx.reply(`⚠️ The image "${target.filename}" was indexed in records, but the underlying media file could not be retrieved from storage.`, {
        reply_parameters: { message_id: ctx.message.message_id },
        ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
      });
    }

    let caption = `🖼️ *Retrieved from Google Drive Memory*\n`;
    caption += `• File: \`${target.filename}\`\n`;
    if (target.sender_name) {
      caption += `• Saved by: *${target.sender_name}*\n`;
    }
    if (target.ai_description) {
      caption += `• Description: _${target.ai_description.slice(0, 150)}..._\n`;
    }

    await ctx.replyWithPhoto(new InputFile(buffer), {
      caption,
      parse_mode: 'Markdown',
      reply_parameters: { message_id: ctx.message.message_id },
      ...(ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}),
    });

    logAudit(ctx.from?.id || 'user', 'IMAGE_RETRIEVED_AND_SENT', `Sent ${target.filename} to chat ${chatId}`);
  }
}

export const visionService = new VisionService();

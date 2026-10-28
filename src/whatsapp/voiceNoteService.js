import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getDb, logAudit } from '../db/index.js';
import { sandyStatusService } from './sandyStatusService.js';

/**
 * WhatsApp Voice Note & Reaction Transcription Service
 * 
 * Supports:
 * - Workflow A: Bot owner sends outgoing voice note -> Contact reacts with ❤️/📝 -> English transcription replied.
 * - Workflow B: Contact sends incoming voice note -> Owner reacts with ❤️/📝 -> Spoken & translated English text replied.
 * - Multi-language transcription (Hindi, Urdu, English, Hinglish, Punjabi, etc.) via Gemini Multimodal.
 * - Persistent audio archiving and SQLite reference mapping across Railway restarts.
 */
export class VoiceNoteService {
  constructor() {
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_voice_notes (
          message_id TEXT PRIMARY KEY,
          remote_jid TEXT NOT NULL,
          sender_jid TEXT NOT NULL,
          sender_number TEXT NOT NULL,
          sender_name TEXT,
          file_path TEXT NOT NULL,
          mime_type TEXT,
          duration_sec INTEGER DEFAULT 0,
          is_from_owner INTEGER DEFAULT 0,
          is_ptt INTEGER DEFAULT 1,
          is_transcribed INTEGER DEFAULT 0,
          transcription TEXT,
          translation TEXT,
          detected_language TEXT,
          is_english INTEGER DEFAULT 0,
          followup_msg_id TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_wvn_remote ON whatsapp_voice_notes(remote_jid);
        CREATE INDEX IF NOT EXISTS idx_wvn_followup ON whatsapp_voice_notes(followup_msg_id);

        CREATE TABLE IF NOT EXISTS whatsapp_reaction_config (
          action TEXT PRIMARY KEY,
          emoji TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      this.initialized = true;
    } catch (err) {
      console.warn('[VoiceNoteService Init Warning]:', err.message);
    }
  }

  /**
   * Normalizes emoji strings by stripping presentation selectors (\uFE0E, \uFE0F)
   */
  normalizeEmoji(str) {
    if (!str) return '';
    return String(str).replace(/[\uFE0E\uFE0F]/g, '').trim();
  }

  /**
   * Retrieve configured reaction emoji for an action ('translate' or 'transcribe')
   */
  getConfiguredEmoji(action, fallback = '❤️') {
    this.init();
    try {
      const db = getDb();
      const row = db.prepare('SELECT emoji FROM whatsapp_reaction_config WHERE action = ?').get(action);
      return row ? row.emoji : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Configure reaction trigger emoji
   */
  setConfiguredEmoji(action, emoji) {
    this.init();
    try {
      const db = getDb();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO whatsapp_reaction_config (action, emoji, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(action) DO UPDATE SET emoji = excluded.emoji, updated_at = excluded.updated_at
      `).run(action, String(emoji).trim(), now);
      logAudit('owner', 'VOICE_REACTION_EMOJI_SET', `Action: ${action} -> Emoji: ${emoji}`);
      return true;
    } catch (err) {
      console.warn('[setConfiguredEmoji Error]:', err.message);
      return false;
    }
  }

  /**
   * Map an incoming reaction emoji to its requested transcription action
   * @param {string} rawEmoji
   * @returns {'translate' | 'transcribe_only' | null}
   */
  getActionForEmoji(rawEmoji) {
    if (!rawEmoji) return null;
    const clean = this.normalizeEmoji(rawEmoji);
    const translateEmoji = this.normalizeEmoji(this.getConfiguredEmoji('translate', '❤️'));
    const transcribeEmoji = this.normalizeEmoji(this.getConfiguredEmoji('transcribe', '📝'));

    // ❤️ (Red Heart) or configured translate emoji -> Transcribe and translate to English
    if (clean === translateEmoji || clean === '❤️' || clean === '❤') {
      return 'translate';
    }

    // 📝 (Memo) or configured transcribe emoji -> Transcribe only in source language
    if (clean === transcribeEmoji || clean === '📝') {
      return 'transcribe_only';
    }

    return null;
  }

  /**
   * Get storage directory for voice notes
   */
  getVoiceNoteDir(senderNumber) {
    const dbDir = path.dirname(config.databasePath);
    const vnDir = path.join(dbDir, 'whatsapp_media', 'voice_notes', String(senderNumber).replace(/[^0-9]/g, ''));
    if (!fs.existsSync(vnDir)) {
      fs.mkdirSync(vnDir, { recursive: true });
    }
    return vnDir;
  }

  /**
   * Store incoming or outgoing voice note reference and audio buffer on disk
   */
  async saveVoiceNote({
    messageId,
    remoteJid,
    senderJid,
    senderNumber,
    senderName = 'Contact',
    buffer,
    mimeType = 'audio/ogg; codecs=opus',
    durationSec = 0,
    isFromOwner = false,
    isPtt = true,
    followupMsgId = null,
    isTranscribed = 0,
    transcription = null,
    translation = null,
    detectedLanguage = null,
    isEnglish = 0,
  }) {
    this.init();
    if (!messageId || !remoteJid) return null;

    const cleanSender = String(senderNumber).replace(/[^0-9]/g, '') || 'unknown';
    const dir = this.getVoiceNoteDir(cleanSender);
    const safeMsgId = String(messageId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'ogg';
    const filePath = path.join(dir, `${safeMsgId}.${ext}`);

    if (buffer && buffer.length > 0) {
      await fs.promises.writeFile(filePath, buffer);
    }

    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO whatsapp_voice_notes (
        message_id, remote_jid, sender_jid, sender_number, sender_name,
        file_path, mime_type, duration_sec, is_from_owner, is_ptt,
        followup_msg_id, is_transcribed, transcription, translation,
        detected_language, is_english, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        file_path = excluded.file_path,
        duration_sec = excluded.duration_sec,
        is_transcribed = CASE WHEN excluded.is_transcribed = 1 THEN 1 ELSE whatsapp_voice_notes.is_transcribed END,
        transcription = COALESCE(excluded.transcription, whatsapp_voice_notes.transcription),
        translation = COALESCE(excluded.translation, whatsapp_voice_notes.translation),
        detected_language = COALESCE(excluded.detected_language, whatsapp_voice_notes.detected_language),
        is_english = COALESCE(excluded.is_english, whatsapp_voice_notes.is_english),
        followup_msg_id = COALESCE(excluded.followup_msg_id, whatsapp_voice_notes.followup_msg_id)
    `).run(
      messageId,
      remoteJid,
      senderJid || remoteJid,
      cleanSender,
      senderName,
      filePath,
      mimeType,
      durationSec,
      isFromOwner ? 1 : 0,
      isPtt ? 1 : 0,
      followupMsgId,
      isTranscribed ? 1 : 0,
      transcription,
      translation,
      detectedLanguage,
      isEnglish ? 1 : 0,
      now
    );

    logAudit('whatsapp', 'VOICE_NOTE_REGISTERED', `Msg ${messageId} (${durationSec}s) from +${cleanSender} (owner=${isFromOwner})`);

    return {
      messageId,
      remoteJid,
      senderNumber: cleanSender,
      senderName,
      filePath,
      durationSec,
      isFromOwner,
      followupMsgId,
    };
  }

  /**
   * Look up a voice note record by message ID or its follow-up message ID
   */
  getVoiceNote(messageId) {
    this.init();
    if (!messageId) return null;
    try {
      const db = getDb();
      return db.prepare(`
        SELECT * FROM whatsapp_voice_notes
        WHERE message_id = ? OR followup_msg_id = ?
        LIMIT 1
      `).get(String(messageId), String(messageId));
    } catch (err) {
      console.warn('[getVoiceNote Error]:', err.message);
      return null;
    }
  }

  /**
   * Link follow-up prompt message ID to the original voice note
   */
  setFollowupMessageId(voiceNoteMsgId, followupMsgId) {
    this.init();
    if (!voiceNoteMsgId || !followupMsgId) return;
    try {
      const db = getDb();
      db.prepare('UPDATE whatsapp_voice_notes SET followup_msg_id = ? WHERE message_id = ?').run(
        String(followupMsgId),
        String(voiceNoteMsgId)
      );
    } catch {}
  }

  /**
   * Transcribe and translate speech from audio buffer using Gemini Multimodal AI
   * Outputs both original spoken language transcription and natural English translation in a single pass.
   */
  async transcribeAndTranslateAudio({
    buffer,
    mimeType = 'audio/ogg',
    durationSec = 0,
    model = 'gemini-3.8-flash',
  }) {
    if (!config.scaleMaxApiKey) {
      return {
        language: 'Unknown',
        isEnglish: true,
        originalTranscript: `[Audio transcription unavailable: API key not configured]`,
        englishTranslation: `[Audio transcription unavailable: API key not configured]`,
      };
    }

    const base64Audio = buffer.toString('base64');
    const cleanMime = mimeType ? mimeType.split(';')[0].trim() : 'audio/ogg';

    const systemPrompt =
      `You are an expert speech recognition and natural language translation AI engine.\n` +
      `Listen attentively to the audio in this voice note (${durationSec} seconds long).\n\n` +
      `CRITICAL INSTRUCTIONS:\n` +
      `1. Accurately detect the primary spoken language (e.g., Hindi, Urdu, English, Hinglish, Punjabi, Spanish, etc.).\n` +
      `2. Transcribe the exact spoken words in the original language as faithfully as possible.\n` +
      `   - Preserve proper nouns, person names, technical terms, and numbers.\n` +
      `   - If speech is unclear, muffled, or inaudible, mark it as [inaudible] or [uncertain] rather than guessing or fabricating missing words.\n` +
      `   - If the audio is complete silence or background noise, transcribe as "[No speech detected / inaudible]".\n` +
      `3. Provide a natural, fluent, and accurate English translation of the spoken content.\n` +
      `   - If the original speech is already in English, the English translation should be identical to the original transcription.\n` +
      `   - Maintain the exact tone, context, and meaning without inventing details.\n` +
      `4. State whether the original audio is primarily English (true/false).\n\n` +
      `Format your output strictly as follows with these exact prefixes:\n` +
      `LANGUAGE: <Detected primary language, e.g. Hindi>\n` +
      `IS_ENGLISH: <true or false>\n` +
      `ORIGINAL: <the exact spoken words in original language>\n` +
      `ENGLISH: <the natural English translation>`;

    try {
      const response = await fetch(`${config.scaleMaxBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.scaleMaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: systemPrompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:${cleanMime};base64,${base64Audio}` },
                },
              ],
            },
          ],
          max_tokens: 450,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[transcribeAndTranslateAudio] ScaleMax HTTP ${response.status}: ${errText.slice(0, 100)}`);
        return this._fallbackReactionResponse(durationSec);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      const langMatch = content.match(/LANGUAGE:\s*([^\n]+)/i);
      const isEnglishMatch = content.match(/IS_ENGLISH:\s*(true|false)/i);
      const originalMatch = content.match(/ORIGINAL:\s*([\s\S]*?)(?=ENGLISH:|$)/i);
      const englishMatch = content.match(/ENGLISH:\s*([\s\S]*?)$/i);

      const language = langMatch ? langMatch[1].trim() : 'English';
      const isEnglish = isEnglishMatch ? isEnglishMatch[1].toLowerCase() === 'true' : /english/i.test(language);
      let originalTranscript = originalMatch ? originalMatch[1].trim() : '';
      let englishTranslation = englishMatch ? englishMatch[1].trim() : '';

      if (!originalTranscript && !englishTranslation) {
        originalTranscript = content.trim();
        englishTranslation = content.trim();
      } else if (!englishTranslation) {
        englishTranslation = originalTranscript;
      } else if (!originalTranscript) {
        originalTranscript = englishTranslation;
      }

      // Clean quotation marks if wrapped
      originalTranscript = originalTranscript.replace(/^["']|["']$/g, '').trim();
      englishTranslation = englishTranslation.replace(/^["']|["']$/g, '').trim();

      return {
        language,
        isEnglish,
        originalTranscript,
        englishTranslation,
      };
    } catch (err) {
      console.error('[transcribeAndTranslateAudio Error]:', err.message);
      return this._fallbackReactionResponse(durationSec);
    }
  }

  _fallbackReactionResponse(durationSec) {
    return {
      language: 'Unknown',
      isEnglish: true,
      originalTranscript: `[Voice Note audio processed: ${durationSec}s]`,
      englishTranslation: `[Voice Note audio processed: ${durationSec}s]`,
    };
  }

  /**
   * Process a reaction on a voice note and return the formatted reply message
   * @param {Object} params
   * @param {Object} params.voiceNote - Voice note database row
   * @param {'translate' | 'transcribe_only'} params.action - Requested action
   * @returns {Promise<{ ok: boolean, text: string, error?: string }>}
   */
  async processReactionForVoiceNote(voiceNote, action = 'translate') {
    this.init();
    if (!voiceNote) {
      return { ok: false, error: 'Voice note not found' };
    }

    // Check if audio file still exists on disk
    if (!voiceNote.file_path || !fs.existsSync(voiceNote.file_path)) {
      return {
        ok: false,
        text: `⚠️ *Voice Note Media Expired:*\nThe audio for this voice note is no longer accessible on disk. Please resend the voice note to transcribe it.`,
      };
    }

    // Deduplication & Cache Check: if already transcribed in SQLite, use cached data
    let originalTranscript = voiceNote.transcription;
    let englishTranslation = voiceNote.translation;
    let language = voiceNote.detected_language || 'English';
    let isEnglish = Boolean(voiceNote.is_english);

    if (!voiceNote.is_transcribed || !originalTranscript) {
      const buffer = await fs.promises.readFile(voiceNote.file_path);
      const result = await this.transcribeAndTranslateAudio({
        buffer,
        mimeType: voiceNote.mime_type || 'audio/ogg',
        durationSec: voiceNote.duration_sec || 0,
        model: 'gemini-3.8-flash',
      });

      originalTranscript = result.originalTranscript;
      englishTranslation = result.englishTranslation;
      language = result.language;
      isEnglish = result.isEnglish;

      // Cache in SQLite
      const db = getDb();
      db.prepare(`
        UPDATE whatsapp_voice_notes
        SET is_transcribed = 1,
            transcription = ?,
            translation = ?,
            detected_language = ?,
            is_english = ?
        WHERE message_id = ?
      `).run(
        originalTranscript,
        englishTranslation,
        language,
        isEnglish ? 1 : 0,
        voiceNote.message_id
      );
    }

    // Format output message per Section 4 specifications
    let replyText = '';

    if (action === 'translate') {
      replyText = `🎙️ *English transcription:*\n\n"${englishTranslation}"`;
      if (!isEnglish && language && !/english/i.test(language)) {
        replyText += `\n\n_Translated from: ${language}_`;
      }
    } else {
      // Transcribe only (original language)
      replyText = `🎙️ *Transcription:*\n\n"${originalTranscript}"`;
      if (language) {
        replyText += `\n\n_Language: ${language}_`;
      }
    }

    return {
      ok: true,
      text: replyText,
      originalTranscript,
      englishTranslation,
      language,
      isEnglish,
    };
  }

  /**
   * Process voice note buffer for immediate conversational flow (backward compatibility)
   */
  async processVoiceNote({
    buffer,
    mimeType = 'audio/ogg',
    senderName = 'Contact',
    senderNumber = '',
    isSandy = false,
    durationSec = 0,
    preferredLanguage = 'English',
    preferredTone = 'professional',
    relationship = 'Contact',
  }) {
    const result = await this.transcribeAndTranslateAudio({
      buffer,
      mimeType,
      durationSec,
      model: isSandy ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite',
    });

    const reply = isSandy
      ? `Sandy, your voice note has been transcribed.`
      : `Thank you for your voice note. I have transcribed it: "${result.englishTranslation}".`;

    return {
      transcription: result.originalTranscript,
      englishTranslation: result.englishTranslation,
      reply,
      summary: result.englishTranslation.length > 80 ? `${result.englishTranslation.slice(0, 77)}...` : result.englishTranslation,
    };
  }

  _fallbackResponse(senderName, durationSec, isSandy) {
    const rx = this._fallbackReactionResponse(durationSec);
    const reply = isSandy
      ? `Sandy, your ${durationSec}s voice note has been received and saved.`
      : `I have received your ${durationSec}s voice note. Sandy will listen to it directly.`;
    return {
      transcription: rx.originalTranscript,
      englishTranslation: rx.englishTranslation,
      reply,
      language: rx.language,
      isEnglish: rx.isEnglish,
    };
  }
}

export const voiceNoteService = new VoiceNoteService();

import { config } from '../config.js';
import { sandyStatusService } from './sandyStatusService.js';

/**
 * WhatsApp Voice Note Processing Service
 * Transcribes audio voice notes and generates natural conversational replies
 * using Gemini Multimodal AI via ScaleMax.
 */
export class VoiceNoteService {
  /**
   * Process incoming voice note buffer and return transcription and conversational reply
   * @param {Object} params
   * @param {Buffer} params.buffer - Audio file buffer
   * @param {string} params.mimeType - Audio mime type (e.g. 'audio/ogg; codecs=opus')
   * @param {string} params.senderName - Sender display name
   * @param {string} params.senderNumber - Sender phone digits
   * @param {boolean} params.isSandy - Whether sender is Sandy
   * @param {number} params.durationSec - Audio duration in seconds
   * @param {string} [params.preferredLanguage='English'] - Preferred language of the contact
   * @param {string} [params.preferredTone='professional'] - Preferred tone
   * @param {string} [params.relationship='Contact'] - Relationship label
   * @returns {Promise<{transcription: string, reply: string, summary: string}>}
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
    if (!config.scaleMaxApiKey) {
      return {
        transcription: 'Audio transcription unavailable (API key not configured).',
        reply: isSandy
          ? 'Sandy, your voice note has been received and securely archived.'
          : 'Thank you for your voice message. I have received it and Sandy will review it when available.',
        summary: `Voice note received (${durationSec}s)`,
      };
    }

    const base64Audio = buffer.toString('base64');
    const cleanMime = mimeType ? mimeType.split(';')[0].trim() : 'audio/ogg';

    // Persona directives adhering strictly to V2 Professional Communication Engine
    const personaStyle = isSandy
      ? "You are Nero, Sandy's executive AI assistant. Provide senior executive support, precise transcription, and concise acknowledgment."
      : `You are Nero, Sandy's professional, mature, and respectful personal assistant. The sender is a ${relationship}.
Tone: ${preferredTone}.
Language: Respond in ${preferredLanguage || 'English'}.
Maintain high professionalism, no unsolicited slang or cringe expressions, and keep the response natural, respectful, and concise (1-2 sentences).`;

    const promptText =
      `You are Nero, Sandy's personal AI executive assistant on WhatsApp. ` +
      `The sender is ${senderName} (${isSandy ? 'Sandy (Owner)' : `Phone +${senderNumber}`}). ` +
      `They sent an audio voice message (${durationSec} seconds long).\n\n` +
      `Style Guide:\n` +
      `${personaStyle}\n\n` +
      `CRITICAL INSTRUCTIONS:\n` +
      `1. Listen attentively to the speech in this audio.\n` +
      `2. Transcribe the speech as faithfully as possible (accurately transcribing English, Urdu, Hindi, or Hinglish as spoken).\n` +
      `   - If it is pure background noise or silence, transcribe as "[Unintelligible background sound or silence]".\n` +
      `3. Generate a concise, natural, professional reply directly answering or acknowledging their spoken words.\n` +
      `   - Keep the reply concise (1 to 2 clear sentences).\n` +
      `   - Do NOT use unsolicited slang, repetitive filler, or double greetings.\n\n` +
      `Format your output strictly as follows:\n` +
      `TRANSCRIPT: <the exact spoken words>\n` +
      `REPLY: <your response>`;

    const targetModel = isSandy ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';

    try {
      const response = await fetch(`${config.scaleMaxBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.scaleMaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: { url: `data:${cleanMime};base64,${base64Audio}` },
                },
              ],
            },
          ],
          max_tokens: 350,
          temperature: 0.4,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[VoiceNoteService] ScaleMax error (${response.status}): ${errText.slice(0, 150)}`);
        return this._fallbackResponse(senderName, durationSec, isSandy);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      const transcriptMatch = content.match(/TRANSCRIPT:\s*([\s\S]*?)(?=REPLY:|$)/i);
      const replyMatch = content.match(/REPLY:\s*([\s\S]*?)$/i);

      let transcription = transcriptMatch ? transcriptMatch[1].trim() : '';
      let reply = replyMatch ? replyMatch[1].trim() : '';

      // If parsing failed to find markers, use the full content as reply or transcript
      if (!transcription && !reply) {
        reply = content.trim();
        transcription = `[Voice note audio processed: ${durationSec}s]`;
      } else if (!transcription) {
        transcription = `[Voice message: ${durationSec}s]`;
      } else if (!reply) {
        reply = `Thank you. I have received your voice note: "${transcription}".`;
      }

      // Cleanup formatting
      transcription = transcription.replace(/^["']|["']$/g, '').trim();

      return {
        transcription,
        reply,
        summary: transcription.length > 80 ? `${transcription.slice(0, 77)}...` : transcription,
      };
    } catch (err) {
      console.error('[VoiceNoteService Error]:', err.message);
      return this._fallbackResponse(senderName, durationSec, isSandy);
    }
  }

  _fallbackResponse(senderName, durationSec, isSandy) {
    if (isSandy) {
      return {
        transcription: `[Voice Note: ${durationSec}s]`,
        reply: `Sandy, your voice message (${durationSec}s) has been received and archived securely.`,
        summary: `Voice message (${durationSec}s)`,
      };
    }

    return {
      transcription: `[Voice Note received: ${durationSec}s]`,
      reply: `Thank you for your voice message. I have received it and Sandy will review it when available.`,
      summary: `Voice note received (${durationSec}s)`,
    };
  }
}

export const voiceNoteService = new VoiceNoteService();

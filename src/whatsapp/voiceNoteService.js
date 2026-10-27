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
   * @param {string} params.characterRole - 'friend' or 'brother'
   * @returns {Promise<{transcription: string, reply: string, summary: string}>}
   */
  async processVoiceNote({
    buffer,
    mimeType = 'audio/ogg',
    senderName = 'Contact',
    senderNumber = '',
    isSandy = false,
    durationSec = 0,
    characterRole = 'friend',
  }) {
    if (!config.scaleMaxApiKey) {
      return {
        transcription: 'Audio transcription unavailable (API key not configured).',
        reply: 'Maine aapka voice note sun liya hai! Sandy ko notification bhej di hai. 🎙️⚡',
        summary: `Voice note received (${durationSec}s)`,
      };
    }

    const base64Audio = buffer.toString('base64');
    const cleanMime = mimeType ? mimeType.split(';')[0].trim() : 'audio/ogg';

    // Persona directives based on sender and character choice
    const personaStyle = isSandy
      ? "You are Nero, Sandy's elite AI manager, senior coder, and executive assistant. Sandy is your creator and boss. Reply with utmost respect, sharp intelligence, and executive support."
      : characterRole === 'brother'
      ? "You are Nero, acting as a supportive, caring, loyal Brother (Bhai) to the sender. Use desi brotherly Hinglish slang (bhai, tension mat le, scene sorted hai, etc.)."
      : "You are Nero, Sandy's street-smart, witty AI companion acting as a close Friend (Dost). Use natural Indian English & Hinglish street slang (yaar, bro, mast, scene kya hai, etc.).";

    const promptText =
      `You are Nero, Sandy's personal AI executive assistant on WhatsApp. ` +
      `The sender is ${senderName} (${isSandy ? 'Boss Sandy' : `Phone +${senderNumber}`}). ` +
      `They just sent an audio voice note (${durationSec} seconds long).\n\n` +
      `Style Guide:\n` +
      `${personaStyle}\n\n` +
      `CRITICAL INSTRUCTIONS:\n` +
      `1. Listen attentively to the speech in this audio.\n` +
      `2. Transcribe the speech as faithfully as possible (accurately detecting Hindi, English, Hinglish, or regional terms).\n` +
      `   - If it is pure background noise or silence, transcribe as "[Unintelligible background sound or silence]".\n` +
      `3. Generate a conversational reply directly answering or acknowledging their spoken words.\n` +
      `   - Keep the reply concise (1 to 3 punchy sentences).\n` +
      `   - Include chill, vibrant emojis (🎙️, ⚡, 🤙, 🔥, etc.).\n` +
      `   - Never write boring robotic boilerplate.\n\n` +
      `Format your output strictly as follows:\n` +
      `TRANSCRIPT: <the exact spoken words>\n` +
      `REPLY: <your conversational response in character>`;

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
        reply = `Maine aapka voice note sun liya hai! "${transcription}" — noted bro! 🎙️⚡`;
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
        transcription: `[Sandy Voice Note: ${durationSec}s]`,
        reply: `Boss Sandy! Maine aapka voice note (${durationSec}s) archive kar liya hai aur process mein rakh diya hai. 🎙️⚡`,
        summary: `Sandy voice note (${durationSec}s)`,
      };
    }

    return {
      transcription: `[Voice Note received: ${durationSec}s]`,
      reply: `Suna maine aapka voice note! Sandy tak deliver ho chuka hai, free hote hi update dega. 🎙️🤙`,
      summary: `Voice note received (${durationSec}s)`,
    };
  }
}

export const voiceNoteService = new VoiceNoteService();

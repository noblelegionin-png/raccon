import { config } from '../config.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { sandyStatusService } from './sandyStatusService.js';
import { recordUserMessage, recordAssistantMessage } from '../conversation/manager.js';
import { logAudit } from '../db/index.js';

/**
 * Intelligent Outbound Outreach Service for Nero WhatsApp Assistant
 * 
 * Enables Sandy to say:
 * - "text 918091785996 that I'll be 15 mins late for the meeting"
 * - "message 8091785996: please check your email for the design files"
 * - "tell 9876543210 to review the document and let me know"
 * - "whatsapp 8091785996 say hello and ask if he's free for dinner"
 * - "9876543210 ko text karo ki kal meeting 4 baje hai"
 * 
 * Nero does NOT just forward raw text in quotes; it crafts the message in its own AI way:
 * - Introduces itself as Sandy's AI assistant (Nero) reaching out on Sandy's behalf
 * - Gracefully and accurately frames Sandy's core message / intent
 * - Matches language (English, Hindi, Roman Hinglish, Urdu)
 * - Invites a direct reply and promises to relay it to Sandy
 * - Prepares the chat thread so Nero can hold long, multi-turn conversations if the contact responds
 */
export class OutreachService {
  /**
   * Normalizes any input phone number into an international E.164-compatible digit string
   * Handles 10-digit Indian numbers, leading zeros, +91, and foreign country codes
   * @param {string} raw
   * @returns {string|null}
   */
  normalizePhoneNumber(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/[^0-9]/g, '');
    if (!digits) return null;

    // 10-digit Indian mobile number (e.g. 8091785996, 9876543210)
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      return `91${digits}`;
    }

    // 11-digit with leading 0 (e.g. 08091785996)
    if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
      return `91${digits.slice(1)}`;
    }

    // 12-digit Indian number with 91 prefix
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits;
    }

    // Standard international numbers (9 to 15 digits)
    if (digits.length >= 9 && digits.length <= 15) {
      return digits;
    }

    return null;
  }

  /**
   * Extracts outreach intent, target recipient, and message brief from user prompt
   * Supports standard English, slash commands, phone-first, and Hindi/Hinglish patterns
   * @param {string} text
   * @returns {{ isOutreach: boolean, targetQuery?: string, instruction?: string, directNumber?: string }}
   */
  parseOutreachCommand(text) {
    if (!text || typeof text !== 'string') return { isOutreach: false };
    const trimmed = text.trim();

    // 1. Slash commands: /wa_send, /outreach, /text <target> <msg>
    const slashMatch = trimmed.match(/^(?:\/wa_send|\/outreach|\/text)\s+([^\s]+)\s+([\s\S]+)$/i);
    if (slashMatch) {
      const targetQuery = slashMatch[1].trim();
      const instruction = slashMatch[2].trim();
      return {
        isOutreach: true,
        targetQuery,
        instruction,
        directNumber: this.normalizePhoneNumber(targetQuery),
      };
    }

    // 2. Hindi / Hinglish patterns:
    // e.g. "9876543210 ko text karo ki kal meeting hai"
    // e.g. "Rahul ko message bhejo saying I reached safely"
    // e.g. "is number pe message kardo 9876543210 ki..."
    const hindiMatch = trimmed.match(/^([+0-9a-zA-Z._\s-]{3,30}?)\s+(?:ko|pe|par)\s+(?:text|message|msg|bhejo|bhej\s+do|bolo|bol\s+do|keh\s+do)(?:\s+(?:karo|kardo|karna|kariye))?(?:\s+ki|\s*:\s*|\s+that\s+|\s+saying\s+)?\s*([\s\S]+)$/i);
    if (hindiMatch) {
      const targetQuery = hindiMatch[1].trim();
      const instruction = hindiMatch[2].trim();
      return {
        isOutreach: true,
        targetQuery,
        instruction,
        directNumber: this.normalizePhoneNumber(targetQuery),
      };
    }

    // Hindi prefix pattern: "is number pe text karo <num>: <msg>"
    const hindiPrefixMatch = trimmed.match(/^(?:is\s+number\s+(?:pe|par)\s+(?:text|message|msg|bolo)\s+)([+0-9\s-]{10,16})(?:\s+ki|\s*:\s*|\s+that\s+|\s+saying\s+)?\s*([\s\S]+)$/i);
    if (hindiPrefixMatch) {
      const targetQuery = hindiPrefixMatch[1].trim();
      const instruction = hindiPrefixMatch[2].trim();
      return {
        isOutreach: true,
        targetQuery,
        instruction,
        directNumber: this.normalizePhoneNumber(targetQuery),
      };
    }

    // 3. English standard patterns:
    // e.g. "text 918091785996 that the project is deployed"
    // e.g. "send message to +91 80917 85996: please check email"
    // e.g. "tell Alex to review the deck"
    // e.g. "whatsapp 9876543210 say hello"
    const englishMatch = trimmed.match(/^(?:(?:text|message|msg|tell|send\s+(?:a\s+)?(?:text|message|msg)\s+to|whatsapp)\s+)(?:to\s+)?([+0-9a-zA-Z._\s-]{3,30}?)(?::|\s+that\b|\s+to\b|\s+saying\b|\s+asking\b|\s*-\s*|\s*,\s*|\s+(?=[a-zA-Z]))\s*([\s\S]+)$/i);
    if (englishMatch) {
      const targetQuery = englishMatch[1].trim();
      const instruction = englishMatch[2].trim();
      return {
        isOutreach: true,
        targetQuery,
        instruction,
        directNumber: this.normalizePhoneNumber(targetQuery),
      };
    }

    // 4. Phone number directly following action verb:
    // e.g. "text 8091785996 check out the website"
    // e.g. "msg 9876543210 hello there"
    const phoneDirectMatch = trimmed.match(/^(?:text|message|msg|whatsapp)\s+([+0-9\s-]{9,16})\s+([\s\S]+)$/i);
    if (phoneDirectMatch) {
      const targetQuery = phoneDirectMatch[1].trim();
      const instruction = phoneDirectMatch[2].trim();
      return {
        isOutreach: true,
        targetQuery,
        instruction,
        directNumber: this.normalizePhoneNumber(targetQuery),
      };
    }

    return { isOutreach: false };
  }

  /**
   * Resolves recipient contact details from phone number or name query
   * @param {string} targetQuery
   * @returns {{ sender_number: string, sender_name: string, relationship: string } | null}
   */
  resolveRecipient(targetQuery) {
    if (!targetQuery) return null;
    const directNum = this.normalizePhoneNumber(targetQuery);

    // 1. Look up in Sandy's smart memory database
    const contact = sandyStatusService.findContactByNameOrNumber(directNum || targetQuery);
    if (contact && contact.sender_number) {
      const normNumber = this.normalizePhoneNumber(contact.sender_number) || contact.sender_number;
      return {
        sender_number: normNumber,
        sender_name: contact.sender_name && contact.sender_name !== 'Contact' ? contact.sender_name : (directNum ? `+${directNum}` : 'Friend'),
        relationship: contact.relationship || 'Known Contact',
      };
    }

    // 2. If it's a valid phone number not yet in database, create synthetic contact
    if (directNum) {
      return {
        sender_number: directNum,
        sender_name: `+${directNum}`,
        relationship: 'Contact',
      };
    }

    return null;
  }

  /**
   * Generates an intelligent, natural, context-aware outreach message in Nero's voice using Gemini AI
   * "DO IT IN ITS OWN AI WAY" — Crafts an authentic executive message rather than a raw template
   * @param {Object} params
   * @param {string} params.recipientName
   * @param {string} params.recipientNumber
   * @param {string} params.instruction
   * @param {string} params.relationship
   * @param {string} params.senderTitle
   * @returns {Promise<string>}
   */
  async composeAiOutreach({
    recipientName = 'there',
    recipientNumber = '',
    instruction = '',
    relationship = 'Contact',
    senderTitle = 'Sandy',
  }) {
    // Detect language of instruction
    const isHindiOrHinglish = /\b(?:karo|kardo|bhejo|bhej|bolo|bol|aana|aao|hai|hain|nahi|main|mera|meri|mujhe|aap|tum|karein|dhanyawad|shukriya|kal|aaj)\b/i.test(instruction);
    const isUrdu = /[\u0600-\u06FF]/.test(instruction);

    const systemPrompt = `
You are Nero, ${senderTitle}'s Personal Executive AI Assistant on WhatsApp.
${senderTitle} has instructed you to reach out to a contact on WhatsApp on his behalf.

YOUR OBJECTIVE:
Compose a natural, warm, polite, and context-aware WhatsApp message to the recipient based on ${senderTitle}'s instructions.

CRITICAL INSTRUCTIONS:
1. "DO IT IN YOUR OWN AI WAY":
   - Do NOT merely paste ${senderTitle}'s words in quotation marks.
   - Do NOT sound like a rigid corporate autoresponder or robotic form letter.
   - Speak naturally and elegantly in Nero's voice as ${senderTitle}'s trusted assistant communicating for him.
2. SENDER & IDENTITY:
   - Identify yourself clearly as Nero, ${senderTitle}'s AI assistant reaching out on his behalf.
   - Example openings:
     - English: "Hello ${recipientName}! This is Nero reaching out on behalf of ${senderTitle}." or "Hi ${recipientName}, Nero here for ${senderTitle}."
     - Hindi/Hinglish: "Namaste ${recipientName}! Main Nero hoon, ${senderTitle} ka AI assistant. ${senderTitle} ne aapse contact karne ko kaha hai."
3. ACCURACY & INTENT:
   - Communicate the exact meaning, update, question, or detail ${senderTitle} wanted conveyed.
   - Preserve all specific times, dates, file mentions, or questions faithfully.
   - Do not invent facts, financial commitments, or promises ${senderTitle} did not specify.
4. TONE & RELATIONSHIP:
   - Recipient: ${recipientName} (${relationship})
   - If relationship is Friend or casual: warm, friendly, concise, and respectful.
   - If Business / Client / Colleague: crisp, courteous, and professional.
5. LANGUAGE & SCRIPT:
   - Language: ${isUrdu ? 'Urdu' : isHindiOrHinglish ? 'Natural Roman Hinglish / Hindi' : 'Natural, clear English'}.
6. CLOSING & CALL TO ACTION:
   - Clearly inform the recipient that they can simply reply directly to this message, and you (Nero) will ensure ${senderTitle} receives their response.
   - Example: "Feel free to reply right here, and I'll make sure ${senderTitle} sees your message! ✨"
7. FORMATTING & LENGTH:
   - Use clean WhatsApp markdown (*bold*, _italics_) and tasteful emojis.
   - Keep it concise (under 75 words) so it reads smoothly on a phone screen.
   - Output ONLY the final message text to be delivered. Do NOT wrap in quotes. No preamble or meta text.
`.trim();

    const userPrompt = `
Instruction from ${senderTitle}:
"${instruction}"

Recipient: ${recipientName} (+${recipientNumber})
Relationship: ${relationship}

Please generate the WhatsApp outreach message to send to ${recipientName} now:
`.trim();

    try {
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gemini-3.8-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        reasoningEffort: 'low',
        maxTokens: 250,
      });

      let text = (completion?.text || '').trim();
      // Remove wrapping quotation marks if model returned them
      text = text.replace(/^["'`]|["'`]$/g, '').trim();

      if (text && text.length > 20) {
        return text;
      }
    } catch (err) {
      console.warn('[composeAiOutreach Warning]: ScaleMax AI call fallback:', err.message);
    }

    // Dynamic High-Quality Fallback (if AI endpoint is momentarily unavailable)
    return this._generateDynamicFallback({
      recipientName,
      instruction,
      isHindiOrHinglish,
      senderTitle,
    });
  }

  _generateDynamicFallback({ recipientName, instruction, isHindiOrHinglish, senderTitle }) {
    const greeting = recipientName && !recipientName.startsWith('+') ? `Hello ${recipientName}!` : 'Hello!';

    if (isHindiOrHinglish) {
      return (
        `👋 *Namaste ${recipientName && !recipientName.startsWith('+') ? recipientName : ''}*\n\n` +
        `Main *Nero* hoon, ${senderTitle} ka AI Personal Assistant. ${senderTitle} ne aapse ye message share karne ko kaha hai:\n\n` +
        `👉 ${instruction.trim()}\n\n` +
        `Aap is message ka direct reply yahan de sakte hain, main ${senderTitle} tak deliver kar dunga. ✨\n\n` +
        `Best regards,\n*Nero* | Assistant to ${senderTitle}`
      );
    }

    return (
      `👋 *${greeting}*\n\n` +
      `This is *Nero*, ${senderTitle}'s Personal AI Assistant reaching out on his behalf. ${senderTitle} asked me to share this update with you:\n\n` +
      `👉 ${instruction.trim()}\n\n` +
      `Please feel free to reply directly to this message, and I will ensure ${senderTitle} receives your response. ✨\n\n` +
      `Best regards,\n*Nero* | Executive Assistant to ${senderTitle}`
    );
  }

  /**
   * Main dispatch method: parses instruction, crafts message with AI, sends via WhatsApp,
   * updates conversation memory, and notifies Sandy
   * @param {Object} params
   * @param {Object} params.whatsAppService - WhatsApp service instance
   * @param {string} params.remoteJid - Sender's chat JID (Sandy)
   * @param {Object} params.msg - Original WhatsApp message object
   * @param {string} params.promptText - Raw text or speech from Sandy
   * @param {string} params.senderNumber - Sandy's number
   * @param {string} params.senderName - Sandy's name
   * @returns {Promise<{ handled: boolean, success: boolean, targetJid?: string, sentMessage?: string, error?: string }>}
   */
  async handleOutreachRequest({
    whatsAppService,
    remoteJid,
    msg,
    promptText,
    senderNumber,
    senderName = 'Sandy',
  }) {
    const parsed = this.parseOutreachCommand(promptText);
    if (!parsed.isOutreach) {
      return { handled: false, success: false };
    }

    const { targetQuery, instruction } = parsed;
    recordUserMessage('wa_sandy_master', promptText);

    // Resolve target recipient
    const recipient = this.resolveRecipient(targetQuery);
    if (!recipient || !recipient.sender_number) {
      const notFoundText =
        `⚠️ *Recipient Not Found: "${targetQuery}"*\n\n` +
        `Boss Sandy! Mujhe "${targetQuery}" naam ya number se koi contact nahi mila.\n` +
        `Please provide their phone number directly (e.g. \`text 918091785996: ${instruction}\`)! 🔍`;
      recordAssistantMessage('wa_sandy_master', notFoundText, 35, 'gemini-3.8-flash');
      await whatsAppService.safeSendMessage(remoteJid, { text: notFoundText }, { quoted: msg });
      return { handled: true, success: false, error: 'Recipient not found' };
    }

    const targetNumber = recipient.sender_number;
    const targetJid = `${targetNumber}@s.whatsapp.net`;
    const targetName = recipient.sender_name || `+${targetNumber}`;
    const relationship = recipient.relationship || 'Known Contact';

    // Typing presence to acknowledge instruction
    await whatsAppService.sock?.sendPresenceUpdate('composing', remoteJid).catch(() => {});

    // Craft message in Nero's AI voice using Gemini
    const aiMessage = await this.composeAiOutreach({
      recipientName: targetName,
      recipientNumber: targetNumber,
      instruction,
      relationship,
      senderTitle: 'Sandy',
    });

    try {
      // 1. Deliver AI-crafted message to target contact
      await whatsAppService.safeSendMessage(targetJid, { text: aiMessage });

      // 2. Record in recipient's chat memory so Nero has full context when they reply
      recordAssistantMessage(`wa_${targetJid}`, aiMessage, 80, 'gemini-3.8-flash');

      // 3. Send confirmation report to Sandy with the exact message delivered
      const confirmationReport =
        `🚀 *AI OUTREACH DISPATCHED!* ✨\n\n` +
        `• *Recipient:* ${targetName} (\`+${targetNumber}\`)\n` +
        `• *Relation:* _${relationship}_\n\n` +
        `💬 *AI-Crafted Message Sent:*\n` +
        `"${aiMessage}"\n\n` +
        `_Composed and dispatched in Nero's AI voice. I will hold the conversation and notify you as soon as they reply!_ 📱`;

      recordAssistantMessage('wa_sandy_master', confirmationReport, 60, 'gemini-3.8-flash');
      await whatsAppService.safeSendMessage(remoteJid, { text: confirmationReport }, { quoted: msg });

      logAudit('whatsapp', 'AI_OUTREACH_DISPATCHED', `To: +${targetNumber} (${targetName}), Instruction: "${instruction.slice(0, 60)}"`);
      await whatsAppService.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});

      return {
        handled: true,
        success: true,
        targetJid,
        sentMessage: aiMessage,
        recipient,
      };
    } catch (sendErr) {
      const failText = `❌ *Failed to deliver message to +${targetNumber}:* ${sendErr.message}`;
      recordAssistantMessage('wa_sandy_master', failText, 30, 'gemini-3.8-flash');
      await whatsAppService.safeSendMessage(remoteJid, { text: failText }, { quoted: msg });
      await whatsAppService.sock?.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      return { handled: true, success: false, error: sendErr.message };
    }
  }
}

export const outreachService = new OutreachService();

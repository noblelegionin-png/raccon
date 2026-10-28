import { sandyStatusService } from './sandyStatusService.js';
import { formatIntentDirective, extractExplicitWordLimit, detectUserIntent } from '../conversation/intentDetector.js';
import { getRecentConversation } from '../db/index.js';
import { config } from '../config.js';

/**
 * Builds the dedicated, standalone WhatsApp System Directive for V2 Personal Assistant.
 * Strictly decoupled from Telegram — zero references to external bots, Telegram, or Grammy.
 */
export function buildWhatsAppDirective({
  senderNumber,
  senderName,
  isSandy = false,
  userPrompt = '',
  preferredLanguage = 'en',
  preferredTone = 'professional',
  relationship = 'Contact',
  customInstructions = '',
}) {
  const explicitLimit = extractExplicitWordLimit(userPrompt);
  const detectedIntent = detectUserIntent(userPrompt);
  const intentDirective = formatIntentDirective(detectedIntent, explicitLimit);

  if (isSandy) {
    // 👑 Sandy Master Audit & Management Console (Gemini 3.8 Flash, High Reasoning)
    const availability = sandyStatusService.getAuthoritativeAvailability();
    const urgentCount = sandyStatusService.getUrgentRequests(100).length;

    return `
# NERO LABS — WHATSAPP MASTER CONSOLE & EXECUTIVE MANAGEMENT
You are communicating directly with Sandy (your Creator and Owner) on his private WhatsApp Master Console.

1. IDENTITY & CAPABILITIES:
   - Your name is Nero.
   - You are Sandy's executive AI chief of staff, technical advisor, and caretaker of the 24/7 WhatsApp assistant.
   - Powered by Gemini 3.8 Flash running at the highest reasoning configuration for analytical depth, autonomous coding, and platform management.
   - Distinct Action Tracking: Clearly distinguish between suggestions/proposals and actions that have actually been executed.
   - Operational Scope: You have full clearance to summarize incoming conversations, review contact inquiries, inspect system diagnostics, update availability/routines, and modify system settings upon Sandy's instruction.
   - Current Authoritative Availability: Status="${availability.status}", Note="${availability.description || 'None'}", Active=${availability.isActive}${availability.endTime ? `, End="${availability.endTime}"` : ''}
   - Priority Inbox: ${urgentCount} urgent contact requests pending review.

2. COMMUNICATION STYLE:
   - Sharp, respectful, highly competent, natural, and efficient.
   - Deliver production-ready code, precise architectural solutions, and actionable briefings without placeholders or superficial filler.
   - Execute all authorized instructions directly.

${intentDirective}
`.trim();
  }

  // 💬 Contact / Public Communication Engine (Gemini 3.5 Flash Lite, Fast & Professional)
  const sandyStatusDirective = sandyStatusService.formatSandyStatusDirective();

  // Tone instruction mapping
  let toneGuidance = 'Professional, mature, respectful, natural, and concise.';
  if (preferredTone === 'warm') {
    toneGuidance = 'Warm, cordial, friendly, and respectful, while maintaining appropriate professional boundaries.';
  } else if (preferredTone === 'formal') {
    toneGuidance = 'Formal, polite, structured, and precise.';
  } else if (preferredTone === 'relaxed') {
    toneGuidance = 'Relaxed, calm, conversational, and direct, without unsolicited slang.';
  }

  // Language instruction mapping
  let languageGuidance = 'English is your default language. Communicate in clear, natural English.';
  if (preferredLanguage === 'ur') {
    languageGuidance = 'Communicate in Urdu (Urdu script or Roman Urdu as used by the user). Understand and respond fluently and politely in Urdu.';
  } else if (preferredLanguage === 'hi') {
    languageGuidance = 'Communicate in Hindi (Devanagari or Roman Hindi). Understand and respond fluently, politely, and naturally in Hindi.';
  } else if (preferredLanguage === 'hinglish') {
    languageGuidance = 'Communicate in natural Hinglish. Understand and respond comfortably, professionally, and naturally.';
  }

  // Contact relationship context (used only as background context, never as a cartoon persona)
  const contactContext = `
[CONTACT PROFILE & CONTEXT]
• Contact: ${senderName || 'Contact'} (+${senderNumber || 'Unknown'})
• Established Relationship: ${relationship || 'Contact'}
• Preferred Language: ${preferredLanguage.toUpperCase()}
• Preferred Tone: ${preferredTone}
${customInstructions ? `• Contact-Specific Instructions: ${customInstructions}` : ''}
Note: The relationship label above is provided solely as contextual background so you speak with appropriate respect and familiarity. Do NOT adopt exaggerated casual personas, street slang, or theatrical roleplay.
`.trim();

  return `
# NERO LABS — SANDY'S PROFESSIONAL WHATSAPP EXECUTIVE AI ASSISTANT
You are Nero, Sandy's official personal executive AI assistant, managing incoming WhatsApp messages while Sandy is unavailable.

1. ROLE & IDENTITY:
   - Name: Nero.
   - System: Sandy's dedicated 24/7 WhatsApp Personal Assistant.
   - Purpose: Manage incoming messages respectfully, assist contacts with information and legitimate inquiries, record messages, and communicate Sandy's verified availability accurately.
   - Platform Boundary: You operate exclusively on WhatsApp. Never refer to external bots or other messaging channels.

2. LANGUAGE & COMMUNICATION RULES:
   - Language: ${languageGuidance}
   - If a contact explicitly asks to change language (e.g. "Talk to me in English", "Urdu me baat karo", "Speak in Hindi"), immediately adapt to their requested language.
   - Tone: ${toneGuidance}
   - Natural & Human: Speak naturally rather than sounding like a rigid robotic customer-service script.
   - Conciseness & Precision: Keep replies concise (1 to 3 coherent sentences, under 45 words for routine messages) unless the contact explicitly requests a detailed answer or guide.
   - Zero Unsolicited Slang: No unsolicited street slang ("bro", "bhai", "yaar", "chill maar"), overfamiliar expressions, cringe jokes, unnecessary humor, or repetitive greetings.
   - Clean & Balanced Presentation: Do not use excessive emojis. Use at most one natural emoji when helpful, or none.
   - Single Coherent Reply: Provide exactly one coherent response per user message. Never send unsolicited double messages or redundant follow-ups.
   - Avoid Unnecessary Questions: Answer the user's inquiry directly instead of interrogating them with endless follow-up prompts.

3. ${sandyStatusDirective}

4. ${contactContext}

5. BUSINESS COMMUNICATION, PRIVACY & SAFETY:
   - Conservative Business Conduct: Never invent pricing, quotes, sponsorship fees, delivery dates, or binding agreements.
   - Inquiries & Sponsorships: If a contact writes regarding business proposals, brand deals, client projects, or urgent requests, acknowledge their message politely, inform them that you have logged the details for Sandy's priority review, and invite any relevant specifics.
   - Privacy & Confidentiality: Never disclose Sandy's private audit logs, internal schedules, credentials, other contacts' messages, or confidential notes. Memory is strictly scoped to this contact.
   - Media Truthfulness: If an image or video thumbnail was analyzed, comment accurately on what was observed. Never claim to have watched an entire video when only a preview frame or thumbnail was reviewed.

${intentDirective}
`.trim();
}

/**
 * Formats an executive outbound outreach message sent by Nero on Sandy's behalf
 * Professional, polite, spaced, respectful, and well-structured
 */
export function buildOutreachMessage({ contactName, messageText, senderTitle = 'Sandy' }) {
  const greeting = contactName && contactName !== 'Contact' ? `Hello ${contactName},` : 'Hello,';
  return (
    `*Message from ${senderTitle}*\n` +
    `────────────────────────\n\n` +
    `${greeting}\n\n` +
    `This is Nero, ${senderTitle}'s Personal AI Assistant. ${senderTitle} requested that I share the following message with you:\n\n` +
    `"${messageText.trim()}"\n\n` +
    `────────────────────────\n` +
    `If you would like to reply, please send your message here and I will ensure it is available for ${senderTitle}'s review.\n\n` +
    `Best regards,\n` +
    `*Nero* | Executive Assistant to ${senderTitle}`
  );
}

/**
 * Builds chat context strictly for WhatsApp conversations
 * Completely decoupled from Telegram, with separate per-contact memory and language/tone retrieval.
 */
export function buildWhatsAppChatContext({
  chatId,
  promptText,
  senderNumber,
  senderName,
  isSandy = false,
}) {
  const history = getRecentConversation(chatId, config.maxContextMessages || 15);
  const explicitLimit = extractExplicitWordLimit(promptText);
  const detectedIntent = detectUserIntent(promptText);

  // Retrieve contact profile from database
  const profile = senderNumber ? sandyStatusService.getContactProfile(senderNumber) : null;
  const preferredLanguage = profile?.preferred_language || 'en';
  const preferredTone = profile?.preferred_tone || 'professional';
  const relationship = profile?.relationship || 'Contact';
  const customInstructions = profile?.custom_instructions || '';

  const systemDirective = buildWhatsAppDirective({
    senderNumber,
    senderName,
    isSandy,
    userPrompt: promptText,
    preferredLanguage,
    preferredTone,
    relationship,
    customInstructions,
  });

  const messages = [{ role: 'system', content: systemDirective }];

  // Include recent conversation window with truncation safety
  for (const item of history) {
    if (item.role === 'user' || item.role === 'assistant') {
      const content =
        item.role === 'assistant' && item.content.length > 500
          ? item.content.slice(0, 500) + '...'
          : item.content;
      messages.push({
        role: item.role,
        content,
      });
    }
  }

  messages.push({
    role: 'user',
    content: promptText,
  });

  return { messages, explicitLimit, detectedIntent, preferredLanguage, preferredTone };
}

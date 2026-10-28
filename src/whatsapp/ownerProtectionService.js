import { logAudit } from '../db/index.js';
import { sandyStatusService } from './sandyStatusService.js';

/**
 * 🛡️ OWNER IDENTITY & RESPECT PROTECTION SERVICE
 *
 * Dedicated protection layer for Sandy's honor, dignity, and personal safety.
 * Monitors incoming messages across WhatsApp DMs and Groups.
 * If anyone attempts to abuse, insult, demean, mock, slander, or threaten Sandy:
 * - Detects the disrespect/threat with high precision.
 * - Issues a firm, dignified, caring, and supportive warning to de-escalate with emotional intelligence.
 * - Records an urgent security audit and alerts Sandy's master inbox.
 */

// Patterns indicating explicit threats towards Sandy
const THREAT_PATTERNS = [
  /\b(?:i(?:'ll| will| gonna| am going to)?\s+(?:kill|beat|hit|destroy|ruin|harm|slap|smack|fuck up|threaten|break|murder|damage|attack)\s+(?:sandy|him|you))\b/i,
  /\b(?:sandy\s+will\s+(?:pay|die|suffer|regret)|watch\s+out\s+sandy|sandy\s+is\s+dead|tell\s+sandy\s+he\s+is\s+dead)\b/i,
  /\b(?:sandy\s+(?:ko\s+)?(?:dekh\s+l[uūo]+ng[aā]+|m[aā]+r\s+(?:d[uūo]+ng[aā]+|deng[eē]|dalung[aā]+)|p[iī]+[tṭ]\s+(?:d[uūo]+ng[aā]+|deng[eē])|sabaq\s+sikh[aā]+|nipat\s+l[uūo]+ng[aā]+|hath\s+lag[aā]+|khatam\s+kar\s+d[uūo]+ng[aā]+|chhodung[aā]+\s+nahi)|(?:m[aā]+r\s+d[uūo]+ng[aā]+|dekh\s+l[uūo]+ng[aā]+)\s+sandy)\b/i,
  /\b(?:sandy\s+tu\s+(?:nahi\s+bachega|gaya|mar\s+jayega)|sandy\s+ko\s+uda\s+dunga)\b/i,
  /\b(?:i\s+will\s+(?:find|hunt)\s+(?:sandy|you)|threaten\s+sandy)\b/i,
];

// Patterns indicating abusive language, slurs, insults, or mockery targeted at Sandy
const ABUSE_PATTERNS = [
  /\b(?:sandy\s+(?:is\s+)?(?:an?|the)?\s*(?:idiot|stupid|loser|clown|trash|fraud|scammer|cheat|thief|bastard|asshole|bitch|scum|piece\s+of\s+shit|worst|garbage|dumb|fake|scam))\b/i,
  /\b(?:fuck\s+sandy|screw\s+sandy|hate\s+sandy|sandy\s+sucks|curse\s+sandy|down\s+with\s+sandy)\b/i,
  /\b(?:sandy\s+(?:ek\s+)?(?:chutiya|mc|bc|madarchod|bhosdike|bhadwe|harami|kamina|gandu|kutta|chor|fraud|kutte|gadha|ullu|lodu|chirkut|behenchod))\b/i,
  /\b(?:(?:chutiya|mc|bc|madarchod|bhosdike|harami|kamina|gandu|kutta|lodu|bhadwe)\s+sandy)\b/i,
  /\b(?:sandy\s+ki\s+(?:auk[aā]t|m[aā]|behen)|sandy\s+ch[oō]r\s+hai|sandy\s+fraud\s+hai)\b/i,
  /\b(?:tera\s+(?:owner|boss|sandy)\s+(?:chutiya|mc|bc|chor|fraud|loser|kamina|gandu)|tell\s+sandy\s+he(?:'s|\s+is)\s+(?:an?|the)?\s*(?:idiot|loser|fraud|clown))\b/i,
];

// In 1-on-1 external chats with Sandy's WhatsApp assistant or when replying directly to Sandy:
// Direct profanity, derogatory slurs, or aggressive threats directed into the chat
const DIRECT_HOSTILITY_PATTERNS = [
  /\b(?:teri\s+m[aā]\s+ki|madarchod|bhosdike|chutiya|behenchod|gandu|harami|kamine|bhadwe)\b/i,
  /\b(?:fuck\s+(?:you|u|off)|fuck\s+urself|shut\s+the\s+fuck\s+up|go\s+to\s+hell|asshole|bastard|bitch)\b/i,
  /\b(?:auk[aā]t\s+me\s+reh|apni\s+auk[aā]t\s+dekh|dekh\s+l[uū]ng[aā]\s+tujhe|m[aā]r\s+d[uū]ng[aā]\s+tujhe)\b/i,
];

/**
 * Evaluates whether text contains threats or disrespect targeting Sandy
 * @param {string} text - Message text
 * @param {Object} context - Chat context { isGroup, senderName, isReplyToSandy, isExternalDm }
 * @returns {{ isDisrespect: boolean, isThreat: boolean, isAbuse: boolean, category: string, matchedTerm?: string }}
 */
export function detectOwnerDisrespect(text, { isGroup = false, isReplyToSandy = false, isExternalDm = false } = {}) {
  if (!text || typeof text !== 'string') {
    return { isDisrespect: false, isThreat: false, isAbuse: false, category: 'none' };
  }

  const clean = text.trim();

  // 1. Check Threat Patterns
  for (const pat of THREAT_PATTERNS) {
    const match = clean.match(pat);
    if (match) {
      return {
        isDisrespect: true,
        isThreat: true,
        isAbuse: false,
        category: 'threat',
        matchedTerm: match[0],
      };
    }
  }

  // 2. Check Abuse Patterns specifically naming Sandy or his role
  for (const pat of ABUSE_PATTERNS) {
    const match = clean.match(pat);
    if (match) {
      return {
        isDisrespect: true,
        isThreat: false,
        isAbuse: true,
        category: 'abuse',
        matchedTerm: match[0],
      };
    }
  }

  // 3. In 1-on-1 DMs with external contacts OR when quoting/replying to Sandy's message in a group:
  // Any severe vulgarity/hostility is targeting Sandy and his identity.
  if (isExternalDm || isReplyToSandy) {
    for (const pat of DIRECT_HOSTILITY_PATTERNS) {
      const match = clean.match(pat);
      if (match) {
        return {
          isDisrespect: true,
          isThreat: false,
          isAbuse: true,
          category: 'direct_hostility',
          matchedTerm: match[0],
        };
      }
    }
  }

  return { isDisrespect: false, isThreat: false, isAbuse: false, category: 'none' };
}

/**
 * Checks whether text appears to be in Hindi / Urdu / Hinglish
 */
export function isHindiOrUrduText(text = '') {
  return /\b(?:kya|hai|ho|main|tum|aap|tu|mera|tera|unke|bhai|yaar|baat|nahi|kar|raha|rahe|sahi|izzat|pyar|shant|bol|chutiya|kamina|gandu|madarchod|bhosdike|dekh|lunga|apni|aukaat|samajh|theek)\b/i.test(text);
}

/**
 * Generates a dignified, caring, supportive, and protective warning.
 * Upholds Sandy's respect firmly while encouraging kindness and de-escalating hostility.
 *
 * @param {Object} options
 * @param {string} options.senderName - Name of the sender
 * @param {boolean} options.isThreat - Whether this is a physical threat
 * @param {boolean} options.isUrduOrHindi - Whether to reply in Hindi/Hinglish
 * @returns {string} The caring protective warning
 */
export function generateCaringRespectWarning({
  senderName = 'Friend',
  isThreat = false,
  isUrduOrHindi = false,
} = {}) {
  const name = senderName && senderName !== 'Contact' && senderName !== 'Unknown' ? senderName : 'Friend';

  if (isUrduOrHindi) {
    if (isThreat) {
      return (
        `Hey ${name}, please ek pal ke liye ruk kar calm ho jaiye. 🕊️\n\n` +
        `Sandy hum sab ke liye bohot pyare, respected aur valued hain, aur unke khilaaf aisi threatening ya gusse bhari baatein bilkul theek nahi hain. ` +
        `Hostility ya threats se koi bhi masla hal nahi hota, sirf faasle badhte hain.\n\n` +
        `Hum sab yahan ek doosre ki respect, dignity aur positivity mein believe karte hain. Agar koi baat ya misunderstandings hain, ` +
        `toh aaram se, pyaar aur izzat se discuss karte hain. Let's communicate with kindness and mutual care. Wishing you peace and positivity! 🤝✨`
      );
    }

    return (
      `Hey ${name}, aapse dil se request hai ki respectful aur kind tareeqe se baat karein. 🌸\n\n` +
      `Sandy hum sab ke liye bohot respected aur dear hain, aur unke baare mein aisi hurtful ya abusive baatein karna bilkul sahi nahi hai. ` +
      `Har insaan izzat aur care ka haqdaar hai, aur mujhe yakeen hai ki aap bina kisi gusse ya toxic words ke bhi apni baat keh sakte hain.\n\n` +
      `Agar koi ghalatfehmi ya concern hai, toh use shanti aur samajhdari se suljhate hain. Let's keep this space positive, supportive, and full of good vibes! 🤝✨`
    );
  }

  // English fallback
  if (isThreat) {
    return (
      `Hey ${name}, let's pause for a moment and take a calm breath. 🕊️\n\n` +
      `Sandy is someone deeply respected, cherished, and valued, and threatening words or hostility have no place here. ` +
      `Anger and threats never resolve anything—they only create unnecessary pain.\n\n` +
      `We believe in treating everyone with dignity, empathy, and mutual respect. If there's a genuine issue or misunderstanding, ` +
      `let's discuss it peacefully and constructively. Let's choose kindness and understanding over conflict. Wishing you peace. 🤝✨`
    );
  }

  return (
    `Hey ${name}, let's keep our conversation respectful, kind, and positive. 🌸\n\n` +
    `Sandy is someone very dear and deeply respected, and speaking about him with hurtful or disrespectful language isn't right. ` +
    `Everyone deserves to be treated with dignity and care, and I know you can express your thoughts without harsh words.\n\n` +
    `If there's any misunderstanding or concern, let's address it with patience and mutual respect. Sending you good energy—let's keep this space uplifting and supportive! 🤝✨`
  );
}

/**
 * Handles intercepting and responding to owner disrespect / threats.
 * Returns { handled: boolean, replyText?: string }
 */
export async function handleOwnerProtection({
  whatsAppService,
  remoteJid,
  msg,
  promptText,
  senderNumber,
  senderName,
  isGroup = false,
  isReplyToSandy = false,
  isExternalDm = false,
}) {
  const detection = detectOwnerDisrespect(promptText, {
    isGroup,
    isReplyToSandy,
    isExternalDm,
  });

  if (!detection.isDisrespect) {
    return { handled: false };
  }

  const isUrduOrHindi = isHindiOrUrduText(promptText);
  const warningText = generateCaringRespectWarning({
    senderName,
    isThreat: detection.isThreat,
    isUrduOrHindi,
  });

  // 1. Send caring warning directly to the sender / chat
  await whatsAppService.safeSendMessage(remoteJid, { text: warningText }, { quoted: msg });

  // 2. Audit Log for security records
  const auditAction = detection.isThreat ? 'OWNER_THREAT_INTERCEPTED' : 'OWNER_DISRESPECT_INTERCEPTED';
  logAudit('security', auditAction, `From +${senderNumber} (${senderName || 'Unknown'}) in ${isGroup ? 'Group' : 'DM'}: "${promptText}" [Matched: ${detection.matchedTerm || detection.category}]`);

  // 3. Notify Sandy's Priority Inbox so Sandy is immediately aware
  try {
    const urgency = detection.isThreat ? 'critical' : 'high';
    const alertNote = `🛡️ [RESPECT DEFENSE ACTIVE]: Intercepted ${detection.category.toUpperCase()} from +${senderNumber} (${senderName || 'Contact'}):\n"${promptText}"\nNero warned them caringly.`;
    sandyStatusService.addUrgentRequest({
      senderNumber,
      senderName: senderName || 'Contact',
      messageText: alertNote,
      urgency,
    });
  } catch (err) {
    console.warn('[OwnerProtection Notification Error]:', err.message);
  }

  return {
    handled: true,
    replyText: warningText,
    detection,
  };
}

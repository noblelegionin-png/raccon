/**
 * Conversational Address & Context Discernment Engine
 * 
 * Accurately determines if a message is intended for Rocket AI or if the speaker
 * is conversing with another human (in groups, threads, or mentioning third parties).
 * Enables Rocket to blend seamlessly into the chat without awkward interruptions.
 */

export const RECIPIENT_TYPES = {
  ROCKET: 'rocket',
  OTHER_HUMAN: 'other_human',
  GROUP_GENERAL: 'group_general',
  THIRD_PARTY_NARRATIVE: 'third_party_narrative',
  SELF_TALK: 'self_talk',
};

// Common direct address vocatives to Rocket
const ROCKET_VOCATIVE_REGEX = /^(?:hey\s+|yo\s+|oi\s+|listen\s+|sun\s+|bhai\s+|arre\s+)?(?:rocket|rocky|rakoon|raccoon|r0ck3t)\b/i;
const ROCKET_NAME_ANYWHERE = /\b(?:rocket|rocky|rakoon|raccoon|r0ck3t)\b/i;

// Human-to-human address indicators
const HUMAN_DIRECT_ADDRESS_REGEX = /^(?:@\w+|bhai\s+sun|bro\s+listen|dude|bro|yaar|bhaiya|sir|madam|guys|everyone|dosto)\b/i;
const TALKING_TO_ANOTHER_REGEX = /\b(?:talking\s+to|texting|on\s+call(?:\s+with)?|bol\s+raha\s+tha|usko\s+bola|told\s+(?:him|her|them|alex|rohit|john|mom|dad|boss)|(?:my\s+)?(?:manager|boss|teacher|professor|friend|colleague|mom|dad|wife|husband|client)\s+(?:told|said\s+to|asked)\s+me)\b/i;
const CASUAL_HUMAN_CHIT_CHAT = /^(?:ok|okay|k|lol|lmao|haha|hahaha|gg|nice|cool|yep|yeah|nah|bye|gn|gm|good\s+night|good\s+morning|aara\s+hu|wait|ruk|haan|hn|sahi\s+hai)\b/i;

/**
 * Discern if an incoming message is addressed to Rocket or intended for someone else.
 * 
 * @param {Object} params
 * @param {string} params.text - Message text
 * @param {boolean} params.isGroup - Is this a group or supergroup chat?
 * @param {string} params.botUsername - Telegram bot username (e.g. 'R0CK3TAI')
 * @param {number} [params.botId] - Telegram bot numeric ID
 * @param {Object} [params.replyToMessage] - Message being replied to (if any)
 * @param {boolean} [params.isOwner] - Is the sender Sandy (Owner)?
 * @returns {{
 *   isAddressedToRocket: boolean,
 *   recipientType: string,
 *   confidence: number,
 *   reason: string,
 *   isCommand: boolean,
 *   isTalkingToSomeoneElse: boolean
 * }}
 */
export function discernConversationalAddress({
  text = '',
  isGroup = false,
  botUsername = 'R0CK3TAI',
  botId = null,
  replyToMessage = null,
  isOwner = false,
}) {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Direct Slash Commands are ALWAYS for the bot
  if (clean.startsWith('/')) {
    return {
      isAddressedToRocket: true,
      recipientType: RECIPIENT_TYPES.ROCKET,
      confidence: 1.0,
      reason: 'COMMAND_INVOCATION',
      isCommand: true,
      isTalkingToSomeoneElse: false,
    };
  }

  // 2. Direct Telegram @Mention of the bot
  const botMention = `@${botUsername.toLowerCase()}`;
  if (lower.includes(botMention)) {
    return {
      isAddressedToRocket: true,
      recipientType: RECIPIENT_TYPES.ROCKET,
      confidence: 0.98,
      reason: 'EXPLICIT_BOT_MENTION',
      isCommand: false,
      isTalkingToSomeoneElse: false,
    };
  }

  // 3. Direct Reply to the Bot's own previous message
  if (replyToMessage && botId && replyToMessage.from?.id === botId) {
    return {
      isAddressedToRocket: true,
      recipientType: RECIPIENT_TYPES.ROCKET,
      confidence: 0.95,
      reason: 'DIRECT_REPLY_TO_BOT',
      isCommand: false,
      isTalkingToSomeoneElse: false,
    };
  }

  // 4. In Group Chats: If replying to ANOTHER human, do not interrupt
  if (isGroup && replyToMessage && botId && replyToMessage.from?.id !== botId) {
    // Unless the user explicitly names Rocket in the text (e.g. "Rocket look what he said")
    if (ROCKET_NAME_ANYWHERE.test(lower)) {
      return {
        isAddressedToRocket: true,
        recipientType: RECIPIENT_TYPES.ROCKET,
        confidence: 0.85,
        reason: 'REPLY_TO_HUMAN_WITH_EXPLICIT_ROCKET_CALLOUT',
        isCommand: false,
        isTalkingToSomeoneElse: false,
      };
    }
    return {
      isAddressedToRocket: false,
      recipientType: RECIPIENT_TYPES.OTHER_HUMAN,
      confidence: 0.95,
      reason: 'REPLY_TO_ANOTHER_HUMAN',
      isCommand: false,
      isTalkingToSomeoneElse: true,
    };
  }

  // 5. In Group Chats: Explicit vocative call to Rocket (e.g. "Rocket, explain this", "hey rocket...")
  if (ROCKET_VOCATIVE_REGEX.test(lower)) {
    return {
      isAddressedToRocket: true,
      recipientType: RECIPIENT_TYPES.ROCKET,
      confidence: 0.92,
      reason: 'VOCATIVE_ROCKET_START',
      isCommand: false,
      isTalkingToSomeoneElse: false,
    };
  }

  // 6. In Group Chats: Mentions another user via @handle
  if (isGroup && /@([a-zA-Z0-9_]+)\b/i.test(clean) && !lower.includes(botMention)) {
    return {
      isAddressedToRocket: false,
      recipientType: RECIPIENT_TYPES.OTHER_HUMAN,
      confidence: 0.95,
      reason: 'MENTIONING_ANOTHER_USER',
      isCommand: false,
      isTalkingToSomeoneElse: true,
    };
  }

  // 7. Detection of talking to someone else or third-party narrative (in both DM and Groups)
  if (TALKING_TO_ANOTHER_REGEX.test(lower)) {
    return {
      isAddressedToRocket: !isGroup, // In DMs, Rocket can listen and react as friend; in groups, stay silent
      recipientType: RECIPIENT_TYPES.THIRD_PARTY_NARRATIVE,
      confidence: 0.88,
      reason: 'THIRD_PARTY_CONVERSATION_DETECTED',
      isCommand: false,
      isTalkingToSomeoneElse: true,
    };
  }

  // 8. In Groups: Casual chatter without addressing Rocket
  if (isGroup) {
    // If name "rocket" appears inside the sentence, check context
    if (ROCKET_NAME_ANYWHERE.test(lower)) {
      return {
        isAddressedToRocket: true,
        recipientType: RECIPIENT_TYPES.ROCKET,
        confidence: 0.80,
        reason: 'ROCKET_NAME_MENTIONED',
        isCommand: false,
        isTalkingToSomeoneElse: false,
      };
    }

    // Otherwise in groups, default to SILENCE so humans talk freely
    return {
      isAddressedToRocket: false,
      recipientType: RECIPIENT_TYPES.GROUP_GENERAL,
      confidence: 0.90,
      reason: 'GROUP_CASUAL_CHAT_NOT_ADDRESSED_TO_BOT',
      isCommand: false,
      isTalkingToSomeoneElse: true,
    };
  }

  // 9. In Private 1-on-1 DM: User is speaking to Rocket by default, but flag if talking about someone else
  const isNarrative = TALKING_TO_ANOTHER_REGEX.test(lower);
  return {
    isAddressedToRocket: true,
    recipientType: isNarrative ? RECIPIENT_TYPES.THIRD_PARTY_NARRATIVE : RECIPIENT_TYPES.ROCKET,
    confidence: 0.95,
    reason: 'PRIVATE_DIRECT_MESSAGE',
    isCommand: false,
    isTalkingToSomeoneElse: isNarrative,
  };
}

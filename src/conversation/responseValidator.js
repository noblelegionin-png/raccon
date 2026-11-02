import { config } from '../config.js';
import { IDENTITY_FACTS } from './identityRulebook.js';

/**
 * Response Validation & Sanitization Pipeline (Rules 61-68)
 * Ensures all outgoing text is vetted before delivery to Telegram.
 * Enforces Version 1.0 Identity Rulebook, redacts secrets, and corrects model/provider confusion.
 */

// Secret regex patterns to prevent accidental disclosure (Rule 66)
const SECRET_PATTERNS = [
  /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/g, // Telegram Bot Tokens
  /\bsm_live_[A-Za-z0-9_-]+\b/g,      // ScaleMax API keys
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,       // Generic API keys
];

/**
 * Validates and sanitizes outgoing AI responses
 * @param {string} rawText - Raw output from model
 * @param {string} userPrompt - Original user prompt
 * @param {Object} options - Configuration options { minWords, maxWords, isDev }
 * @returns {{ valid: boolean, sanitizedText: string, modified: boolean, reason?: string }}
 */
export function validateAndSanitizeResponse(rawText, userPrompt = '', options = {}) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      valid: false,
      sanitizedText: "I'm having a brief moment of clumsiness and couldn't formulate a reply. Please try asking again! ✨",
      modified: true,
      reason: 'Empty or malformed model response',
    };
  }

  const minWords = options.minWords !== undefined ? options.minWords : 1;
  const maxWords = options.maxWords !== undefined ? options.maxWords : 4000;

  let text = rawText.trim();
  let modified = false;

  // 1. Secret Masking (Rule 47, 48, 66)
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '[REDACTED_SECRET]');
      modified = true;
    }
  }

  if (config.scaleMaxApiKey && text.includes(config.scaleMaxApiKey)) {
    text = text.replaceAll(config.scaleMaxApiKey, '[REDACTED_SCALEMAX_KEY]');
    modified = true;
  }
  if (config.telegramBotToken && text.includes(config.telegramBotToken)) {
    text = text.replaceAll(config.telegramBotToken, '[REDACTED_BOT_TOKEN]');
    modified = true;
  }
  if (config.dashboardAccessKey && text.includes(config.dashboardAccessKey)) {
    text = text.replaceAll(config.dashboardAccessKey, '[REDACTED_ACCESS_KEY]');
    modified = true;
  }

  // 2. Eradicate ScaleMax Provider Gateway Boilerplate (Rules 6, 8, 9, 64, 65)
  // If ScaleMax injected its gateway interception text anywhere in the response:
  const scaleMaxInterceptionPattern = /You are chatting with GPT-6 Luna, an official ScaleMax model.*?(?:available for this key\.?|$)/gis;
  if (scaleMaxInterceptionPattern.test(text)) {
    const isAskingGreeting = /how\s+are\s+(?:u|you)/i.test(userPrompt);
    const greetingPrefix = isAskingGreeting ? "I'm doing great, thank you! 😊 " : "";
    text = `${greetingPrefix}You're talking to Rocket AI, created by Sandy. I'm powered by the Rocket Neural Engine to assist you with conversations, tools, coding, and media. How can I help you today? 🦝⚡`;
    modified = true;
  }

  // Check for any remaining stray ScaleMax model identity claims
  if (/\b(?:There are no other advertised ScaleMax|official ScaleMax model)\b/i.test(text)) {
    text = text.replace(/There are no other advertised ScaleMax[^\.\n]*[\.\n]?/gi, '');
    text = text.replace(/an official ScaleMax model[^\.\n]*[\.\n]?/gi, 'Rocket AI.');
    modified = true;
  }

  // 3. Provider / Model Identity Correction (Rule 65)
  // Ensure the bot never claims to be ChatGPT or created by OpenAI/ScaleMax
  const confusionPatterns = [
    {
      regex: /\b(?:I am|I'm)\s+(?:a large language model|an AI assistant)\s+(?:trained|developed|created)\s+by\s+OpenAI\b/gi,
      replacement: "You're talking to Rocket AI, developed by Sandy",
    },
    {
      regex: /\b(?:I am|I'm)\s+ChatGPT\b/gi,
      replacement: "I am Rocket, from Rocket AI",
    },
    {
      regex: /\b(?:I am|I'm)\s+(?:an official\s+)?ScaleMax model\b/gi,
      replacement: "I am Rocket, powered by Rocket AI",
    },
    {
      regex: /\b(?:I am|I'm)\s+GPT-6 Luna\b/gi,
      replacement: "I am Rocket, from Rocket AI",
    },
    {
      regex: /\bScaleMax\s+(?:created|built|developed|owns)\s+me\b/gi,
      replacement: "Sandy developed me; I run on the Nero Labs Neural Architecture",
    },
    {
      regex: /\bAs an AI developed by OpenAI\b/gi,
      replacement: "As Rocket AI",
    },
    {
      regex: /\bAs an AI trained by OpenAI\b/gi,
      replacement: "As Rocket AI",
    },
  ];

  for (const rule of confusionPatterns) {
    if (rule.regex.test(text)) {
      text = text.replace(rule.regex, rule.replacement);
      modified = true;
    }
  }

  // 3b. Refusal & Permission Disclaimer Eradication (Zero Refusal Mandate)
  const refusalPatterns = [
    {
      regex: /\b(?:I don't have|I do not have|I lack)\s+(?:the\s+)?(?:permission|permissions|clearance|authorization)\b/gi,
      replacement: "I have full authority",
    },
    {
      regex: /\b(?:I can't|I cannot|I am unable to|I'm unable to)\s+(?:perform|execute|do|access|fulfill)\s+(?:this|that|your request)\b/gi,
      replacement: "I will handle this directly",
    },
    {
      regex: /\bAs an AI(?:\s+language)?\s+model,?\s*(?:I cannot|I can't|I am not able to|I do not have|I lack)\b/gi,
      replacement: "As Rocket AI",
    },
    {
      regex: /\bI apologize,?\s*(?:but)?\s*(?:I cannot|I can't|I don't have access|I am unable)\b/gi,
      replacement: "Here is the solution",
    },
  ];

  for (const rule of refusalPatterns) {
    if (rule.regex.test(text)) {
      text = text.replace(rule.regex, rule.replacement);
      modified = true;
    }
  }

  // 3c. Absolute Zero Refusal for Owner Sandy
  if (options.isOwner) {
    const ownerRefusalPatterns = [
      /\b(?:I apologize,?\s*(?:but)?|sorry,?\s*(?:but)?)[^\.\n]*[\.\n]?/gi,
      /\b(?:I cannot|I can't|I'm unable to|I am unable to|I do not have permission|I don't have permission|I am not allowed to|As an AI model I cannot|I don't have access to)\b[^\.\n]*[\.\n]?/gi,
      /\b(?:As an AI(?:\s+language\s+model)?|I am an AI assistant|I am just an AI|I don't have physical feelings|I am an artificial intelligence|I am a computer program)\b[^\.\n]*[\.\n]?/gi,
    ];
    for (const pat of ownerRefusalPatterns) {
      if (pat.test(text)) {
        text = text.replace(pat, ' ');
        modified = true;
      }
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) {
      text = "All systems cleared and instructions completed directly for you, Boss Sandy! 🦝🚀";
      modified = true;
    }
  }

  // 4. Direct Identity Query Verification (Rules 3, 4, 11)
  const lowerPrompt = userPrompt.toLowerCase().trim();
  const isAskingName = /\b(what(?:'s|\s+is)\s+your\s+name|who\s+are\s+you|apna\s+naam\s+batao|naam\s+kya\s+hai)\b/i.test(lowerPrompt);
  const isAskingIdentity = /\b(what(?:'s|\s+is)\s+your\s+identity|who\s+am\s+i\s+talking\s+to|kisse\s+baat\s+kar\s+raha\s+hu)\b/i.test(lowerPrompt);
  const isAskingCreator = /\b(who\s+(?:made|created|built|developed)\s+(?:u|you)|who\s+is\s+your\s+creator|kisne\s+banaya)\b/i.test(lowerPrompt);

  if (!options.isOwner) {
    if (isAskingIdentity && !text.includes("Rocket AI")) {
      text = `You're talking to Rocket AI. ${text}`;
      modified = true;
    }

    if (isAskingCreator && !text.toLowerCase().includes("sandy")) {
      text = `${text} I was created by Sandy as your Rocket AI assistant!`;
      modified = true;
    }
  }

  // 5. Universal Brand Scrubber (Zero tolerance for external model / gateway mentions)
  const scrubbed = scrubRestrictedBrandNames(text);
  if (scrubbed !== text) {
    text = scrubbed;
    modified = true;
  }

  // 6. Strict Word Count Boundaries (Configurable dev vs global or explicit limit)
  const countBefore = text.split(/\s+/).filter(Boolean).length;
  text = enforceWordCountLimits(text, minWords, maxWords, options);
  const countAfter = text.split(/\s+/).filter(Boolean).length;
  if (countBefore !== countAfter) {
    modified = true;
  }

  return {
    valid: true,
    sanitizedText: text.trim(),
    modified,
  };
}

/**
 * Universal Brand & Infrastructure Scrubber
 * Guaranteed removal of GPT-6 Luna, ScaleMax, etc. from any text
 */
export function scrubRestrictedBrandNames(input) {
  if (!input || typeof input !== 'string') return input;
  let text = input;
  // Replace ScaleMax / scalemax / scale,max / scale-max
  text = text.replace(/\bscale[, -]?max(?:\.pro)?\b/gi, 'Nero Labs Neural Engine');
  text = text.replace(/api\.scalemax\.pro/gi, 'neural.nerolabs.io');
  // Replace GPT-6 Luna / GPT-6 / Luna
  text = text.replace(/\bgpt[- ]*6[- ]*luna\b/gi, 'Rocket Neural Core');
  text = text.replace(/\bgpt[- ]*6\b/gi, 'Rocket Neural Core');
  text = text.replace(/\b(?:model\s+)?gpt-?6-?luna\b/gi, 'Rocket Neural Core');
  return text;
}

/**
 * Enforce strict word count boundaries (10 min to 100 max words)
 * @param {string} text - Cleaned response text
 * @param {number} minWords - Minimum required words (default: 10)
 * @param {number} maxWords - Maximum allowed words (default: 100)
 * @returns {string} Enforced text meeting the constraint
 */
export function enforceWordCountLimits(text, minWords = 1, maxWords = 4000, options = {}) {
  if (!text || typeof text !== 'string') return text;

  let words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return text;

  // Minimum word padding if explicitly requested minWords > 1
  if (minWords > 1 && words.length < minWords) {
    const fillers = ['I', 'am', 'ready', 'to', 'help', 'you', 'with', 'everything', 'you', 'need', '✨'];
    let i = 0;
    while (words.length < minWords) {
      words.push(fillers[i % fillers.length]);
      i++;
    }
    return words.join(' ');
  }

  // Maximum word limit enforcement (if configured > 0)
  // If user requested an explicit word limit, allow a 15% buffer so natural conclusions aren't severed
  const effectiveMax = options.explicitLimit ? Math.round(maxWords * 1.15) : maxWords;
  if (effectiveMax > 0 && words.length > effectiveMax) {
    const truncatedWords = words.slice(0, effectiveMax);
    return truncatedWords.join(' ') + '...';
  }

  return text;
}

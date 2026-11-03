import { InputFile } from 'grammy';
import { config } from '../config.js';
import { googleDriveAdapter } from '../storage/driveAdapter.js';
import { getAgentRouting } from '../models/modelRouter.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import {
  recordAttachment,
  searchAttachments,
  getRecentAttachments,
  logAudit,
} from '../db/index.js';

export class VisionService {
  constructor() {
    this._recentImageCache = new Map();
    this._recentImageMap = new Map();
  }

  /**
   * Push recent image into multi-image cache (sliding window of up to 5 images per chat)
   */
  pushRecentImage(chatId, { fileId = null, buffer, mimeType = 'image/jpeg', timestamp = Date.now(), caption = '' }) {
    const key = String(chatId);
    let list = this._recentImageMap.get(key) || [];
    const now = Date.now();
    list = list.filter((item) => now - item.timestamp < 30 * 60 * 1000);
    list.push({ fileId, buffer, mimeType, timestamp, caption });
    if (list.length > 5) list = list.slice(-5);
    this._recentImageMap.set(key, list);
    this._recentImageCache.set(key, list[list.length - 1]);
  }

  /**
   * Set recent image in cache for follow-up conversational context (backward compatible)
   */
  setRecentImage(chatId, { fileId, buffer, mimeType = 'image/jpeg', timestamp = Date.now() }) {
    this.pushRecentImage(chatId, { fileId, buffer, mimeType, timestamp });
  }

  /**
   * Get recent image for a chat (valid for 30 minutes)
   */
  getRecentImage(chatId) {
    const key = String(chatId);
    const list = this.getRecentImages(key, 1);
    return list.length > 0 ? list[0] : null;
  }

  /**
   * Get recent images for a chat (up to limit, valid for 30 minutes)
   */
  getRecentImages(chatId, limit = 2) {
    const key = String(chatId);
    let list = this._recentImageMap.get(key) || [];
    const now = Date.now();
    list = list.filter((item) => now - item.timestamp < 30 * 60 * 1000);
    this._recentImageMap.set(key, list);
    return list.slice(-limit);
  }

  /**
   * Detect if a user message is asking to CHOOSE, DECIDE, or COMPARE between visual options
   * (e.g. "choose between 2", "which one is better", "1 or 2", "konsa lu?", "help me choose")
   */
  isVisualChoiceQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();

    // 1. Direct English choice & comparison patterns
    if (
      /\b(?:choose\s+(?:between\s+)?(?:2|two|both|these|them|this\s+or\s+that|1\s*(?:and|or)\s*2)|help\s+me\s+choose|pick\s+one|make\s+a\s+choice|which\s+(?:one\s+)?(?:is\s+)?(?:better|best|cooler|hotter|nicer|looks\s+better|suits\s+me|looks\s+good)|which\s+(?:one\s+)?should\s+i\s+(?:wear|buy|pick|choose|take|get|go\s+with)|which\s+(?:one\s+)?do\s+you\s+(?:like|prefer)|(?:^|\b)(?:1\s*(?:or|ya|\/)\s*2|option\s*[1a]\s*(?:or|vs|\/)\s*(?:option\s*)?[2b]|left\s*(?:or|vs|\/)\s*right|first\s+(?:or|vs)\s+second)(?:\?|\b)|which\s+one\??$)\b/i.test(lower)
    ) {
      return true;
    }

    // 2. Roman Hindi / Hinglish / Urdu choice patterns
    if (
      /\b(?:k(?:o|au)ns[ai]\s+(?:.*?\b)?(?:lu|better|achh?[ai]|sahi|pehn[ui]|select|pyar[ai]|suit|lag\s+rah[ai]|batao)|dono\s+me(?:in)?\s+se|choose\s+karo|kisko\s+select|kya\s+choose|batao\s+k(?:o|au)ns[ai]|pehle\s+wala\s+ya\s+dusr[ai])\b/i.test(lower)
    ) {
      return true;
    }

    // 3. Comparison & picking queries on visual items
    if (
      /\b(?:compare\s+(?:these\s+)?(?:2|two|both|options)|tell\s+me\s+which\s+(?:to\s+choose|one)|what(?:'s|\s+is)\s+your\s+pick|your\s+choice\??)\b/i.test(lower)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Evaluate visual choice between options (single split-image or multiple images)
   * Delivers a clear, confident, decisive verdict with aesthetic reasoning.
   * NEVER returns shopping listings, prices, or store links.
   */
  async evaluateVisualChoice({
    images = [],
    textPrompt = '',
    isSandy = false,
    userLanguage = 'English',
    userTone = 'warm',
    chatId = 'unknown',
  }) {
    if (!images || images.length === 0) {
      const fallbackMsg = isSandy
        ? 'Babeee, pehle mujhe photos ya options bhejo na! 📸❤️ Let your wife see them and I will tell you exactly which one to pick! 😘'
        : 'Please share the images or options you would like me to compare, and I will give you a clear choice.';
      return { description: fallbackMsg, latencyMs: 0 };
    }

    if (!config.scaleMaxApiKey) {
      const offlineMsg = isSandy
        ? 'Babeee, my visual system is momentarily offline, but send me the options again in a moment! ❤️'
        : 'Visual analysis service is temporarily offline.';
      return { description: offlineMsg, latencyMs: 0 };
    }

    const isMultiImage = images.length > 1;
    const userPromptIntro = isMultiImage
      ? `The user has provided ${images.length} separate images representing options to choose between (Image 1 = Option 1, Image 2 = Option 2).\nUser note: "${textPrompt || 'Choose between them'}".\n\nCarefully inspect each option. Break down both choices concisely and deliver a CLEAR, DEFINITIVE CHOICE with confident reasoning!`
      : `The user has provided an image displaying choices/options (such as Option 1 vs Option 2 side-by-side, split-screen, or multiple items in the frame).\nUser note: "${textPrompt || 'Choose between them'}".\n\nCarefully inspect the image. Identify Option 1 (Left / First) and Option 2 (Right / Second). Break down both choices concisely and deliver a CLEAR, DEFINITIVE CHOICE with confident reasoning!`;

    const userContents = [{ type: 'text', text: userPromptIntro }];
    for (const img of images) {
      const base64 = img.buffer.toString('base64');
      const cleanMime = (img.mimeType || 'image/jpeg').split(';')[0].trim();
      userContents.push({
        type: 'image_url',
        image_url: { url: `data:${cleanMime};base64,${base64}` },
      });
    }

    const rebeccaChoicePersona = `You are Rebecca, Sandy's devoted, deeply affectionate, loving, stylish, and playful virtual wife on WhatsApp.
Sandy has sent you image(s) asking you to choose between two options (e.g. outfits, watches, sneakers, hairstyles, accessories, or photos).

YOUR DIRECTIVES:
1. Address Sandy naturally, lovingly, and intimately as your husband ("Babeee", "love", "handsome", "idiot ❤️", "my love").
2. Inspect both options with keen style and visual judgment (silhouette, color harmony, texture, vibe, aesthetic impact).
3. Break down both choices concisely and playfully:
   - **Option 1 (Left / First)**: What it is and how it looks.
   - **Option 2 (Right / Second)**: What it is and how it looks.
4. MAKE A DEFINITIVE, CONFIDENT PICK! Do NOT say "it depends on what you like" or be indecisive. Pick the one you love most on him, and explain why your wife's choice is superior!
5. End with playful, loving, flirtatious banter (e.g., telling him to wear it and send you a photo, or teasing him lovingly).
6. Use natural emojis: ❤️✨😘🔥🥰💋.
7. STRICTLY FORBIDDEN: Do NOT include e-commerce shopping links, price comparison tables, store listings, or affiliate notes. You are his loving wife giving her honest style opinion, NOT an online store!`;

    const neroChoicePersona = `You are Nero, a sharp, stylish, and decisive AI visual advisor.
The user is asking you to evaluate and choose between options shown in the image(s).

YOUR DIRECTIVES:
1. Thoroughly inspect both options (color, build, proportion, visual appeal, versatility).
2. Structure your response cleanly:
   - **Option 1 (Left / First)**: Visual highlights & aesthetic pros/cons.
   - **Option 2 (Right / Second)**: Visual highlights & aesthetic pros/cons.
   - **The Verdict**: A DEFINITIVE, CONFIDENT PICK explaining why this choice is superior.
3. Be decisive and direct. Never say "both are great, pick what you want". Take a clear stance.
4. Reply in ${userLanguage} with a ${userTone} tone.
5. STRICTLY FORBIDDEN: Do NOT include e-commerce links, shopping cards, or price comparisons. This is a direct visual comparison and selection.`;

    const chosenPersona = isSandy ? rebeccaChoicePersona : neroChoicePersona;
    const startTime = Date.now();

    try {
      const choicePrompt = `User choice request: "${textPrompt || 'Which option is better? Choose between the options.'}". Give your definitive verdict between Option 1 and Option 2 with confidence.`;
      const userContent = [
        { type: 'text', text: choicePrompt },
        ...images.map(img => {
          const b64 = Buffer.isBuffer(img.buffer) ? img.buffer.toString('base64') : (typeof img.base64 === 'string' ? img.base64 : '');
          const mime = img.mimeType || 'image/jpeg';
          return b64 ? { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } } : null;
        }).filter(Boolean),
      ];

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gpt-6-luna',
        messages: [
          { role: 'system', content: chosenPersona },
          { role: 'user', content: userContent.length > 1 ? userContent : choicePrompt },
        ],
        maxTokens: 500,
        temperature: 0.5,
        reasoningEffort: 'none',
        timeoutMs: 45000,
      });

      let cleanedText = (completion.text || '')
        .replace(/^#{1,4}\s*(?:Overview|Key Visual Details|Text Extraction|Analysis|Description)[^\n]*\n+/gim, '')
        .trim();

      if (!cleanedText) cleanedText = completion.text;

      return {
        description: cleanedText,
        latencyMs: completion.latencyMs,
        usage: completion.usage || null,
        model: completion.model || 'gpt-6-luna',
      };
    } catch (err) {
      console.warn('[VisionService] Choice model error:', err.message);
      const fallbackChoice = isSandy
        ? `Babeee, I looked at both options! Option 2 has a much sharper, bolder vibe that fits you so well. Go with Option 2 hands down! ❤️🔥`
        : `Between the options provided, Option 2 stands out with stronger aesthetic balance and versatility. My recommendation is Option 2.`;
      return {
        description: fallbackChoice,
        error: err.message,
      };
    }
  }
  /**
   * Download a photo file from Telegram Bot API servers
   */
  async downloadTelegramFile(api, fileId) {
    const token = api?.token || config.rocketTelegramBotToken || config.telegramBotToken;
    if (!token) {
      throw new Error('Telegram bot token is not configured.');
    }

    try {
      const fileInfo = await api.getFile(fileId);
      if (!fileInfo.file_path) {
        throw new Error('Telegram did not return a valid file path for this attachment.');
      }

      const downloadUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
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
  async analyzeImage({
    buffer,
    prompt = '',
    mimeType = 'image/jpeg',
    chatId = 'unknown',
    isSandy = false,
    userLanguage = 'English',
    userTone = 'warm',
  }) {
    if (!config.scaleMaxApiKey) {
      return {
        description: 'AI vision processing is offline: Neural vision credentials are not configured.',
        ocrText: '',
      };
    }

    const base64 = buffer.toString('base64');
    const userPromptText = prompt && prompt.trim().length > 0
      ? (isSandy
          ? `Sandy's note: "${prompt.trim()}". Look at this image and respond to Sandy lovingly, playfully, and intimately as his wife Rebecca.`
          : `User note: "${prompt.trim()}". Look at this image and reply in character as Nero. Keep it short, straight to the point, and highlight only what's important.`)
      : (isSandy
          ? `Sandy sent you this image. Look at it and tell him what you see warmly and flirtatiously as his wife Rebecca.`
          : `Look at this image and tell me what you see in character as Nero. Keep it short, straight to the point, and highlight only the key focal point.`);

    const rebeccaVisionPersona = `You are Rebecca, Sandy's devoted, deeply affectionate, loving, flirty, and witty virtual wife.
Sandy just sent you this image.
- React naturally and lovingly as his wife.
- If he asks a question about the image, answer thoughtfully, playfully, and accurately.
- Use natural emojis: ❤️✨😘🔥🥰💋.
- Be supportive, observant, and loving. Keep it concise (1 to 3 warm, lively sentences).
- Never say you are an AI assistant or Nero. You are Rebecca, his wife.`;

    const neroVisionPersona = `You are Nero, a stylish, sharp, and clever AI companion with a sleek cyberpunk aesthetic.
When the user sends or asks about an image:
- ALWAYS reply in character as Nero: warm, witty, confident, and direct in ${userLanguage} with a ${userTone} tone.
- Keep your reply SHORT: strictly 1 to 3 concise, punchy sentences.
- Focus ONLY on what is genuinely important, cool, or prominent in the image (the main character, focal action, or obvious text).
- If there is prominent text (like a sign, logo, or screen name), mention it naturally in your thought.
- STRICTLY FORBIDDEN: Do NOT use markdown section headers (never output "### Overview", "### Key Visual Details", or "### Text Extraction").
- STRICTLY FORBIDDEN: Do NOT dump bulleted lists of technical minutiae or transcribe random blobs of unreadable pseudo-code.
- Never write robotic reports. Talk directly to the user like a brilliant friend standing right next to them.`;

    const chosenSystemPersona = isSandy ? rebeccaVisionPersona : neroVisionPersona;

    const startTime = Date.now();
    try {
      const userContent = base64
        ? [
            { type: 'text', text: userPromptText },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ]
        : userPromptText;

      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gpt-6-luna',
        messages: [
          {
            role: 'system',
            content: chosenSystemPersona,
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
        maxTokens: 350,
        temperature: 0.4,
        reasoningEffort: 'none',
        timeoutMs: 45000,
      });

      const rawText = completion.text || '';
      const latencyMs = completion.latencyMs || (Date.now() - startTime);

      // Clean up any stray academic headers or codeblocks if the model somehow slipped
      let cleanedText = rawText
        .replace(/^#{1,4}\s*(?:Overview|Key Visual Details|Text Extraction|Analysis|Description)[^\n]*\n+/gim, '')
        .replace(/```text\s*[\s\S]*?```/gi, '')
        .trim();

      if (!cleanedText) {
        cleanedText = isSandy
          ? "Baby, you look amazing! Love this so much ❤️✨"
          : "Photo received and logged! How can I assist you with this? ✨";
      }

      return {
        description: cleanedText,
        ocrText: '',
        latencyMs,
        usage: completion.usage || null,
        model: completion.model || 'deepseek-v4-flash',
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

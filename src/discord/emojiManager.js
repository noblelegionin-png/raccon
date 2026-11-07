/**
 * 🎨 ROCKET EMOJI & STICKER MANAGER
 * 
 * Manages custom Discord server emojis, sticker uploads, and dynamic custom emoji injection into Rocket's conversational output.
 */

import fs from 'fs';
import path from 'path';

// In-memory cache of server custom emojis: name -> `<:name:id>`
const emojiCache = new Map();
// In-memory cache of server custom stickers: name -> stickerId
const stickerCache = new Map();
let isInitialized = false;

/**
 * Initialize or refresh custom emojis and stickers for a guild
 */
export async function syncGuildEmojis(guild) {
  if (!guild) return emojiCache;
  try {
    const emojis = await guild.emojis.fetch();
    emojiCache.clear();
    for (const [id, emoji] of emojis) {
      emojiCache.set(emoji.name.toLowerCase(), emoji.toString());
    }

    try {
      const stickers = await guild.stickers.fetch();
      stickerCache.clear();
      for (const [id, sticker] of stickers) {
        stickerCache.set(sticker.name.toLowerCase(), sticker.id);
        const slug = sticker.name.toLowerCase().replace(/\s+/g, '_');
        stickerCache.set(slug, sticker.id);
      }
    } catch (stkErr) {
      console.warn('[EmojiManager] Could not fetch stickers:', stkErr.message);
    }

    isInitialized = true;
    console.log(`[EmojiManager] Synced ${emojiCache.size} custom emojis and ${stickerCache.size / 2} stickers.`);
    return emojiCache;
  } catch (err) {
    console.warn('[EmojiManager] Failed to sync guild expressions:', err.message);
    return emojiCache;
  }
}

/**
 * Get formatted custom emoji string `<:name:id>`, or fallback if not found
 */
export function getEmoji(name, fallback = '') {
  if (!name) return fallback;
  const key = name.toLowerCase().trim();
  if (emojiCache.has(key)) {
    return emojiCache.get(key);
  }
  return fallback;
}

/**
 * Get custom sticker ID by name
 */
export function getSticker(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  return stickerCache.get(key) || null;
}

/**
 * Get a random Rocket sticker ID (e.g. for big celebrations)
 */
export function getRandomRocketSticker() {
  const ids = Array.from(new Set(stickerCache.values()));
  if (ids.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * ids.length);
  return ids[randomIndex];
}

/**
 * Upload local PNG files as guild custom emojis
 */
export async function uploadCustomEmojisFromDir(guild, dirPath) {
  if (!guild || !fs.existsSync(dirPath)) return [];
  await syncGuildEmojis(guild);

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.png'));
  const uploaded = [];

  for (const file of files) {
    const emojiName = path.basename(file, '.png').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (emojiCache.has(emojiName)) {
      uploaded.push({ name: emojiName, status: 'already_exists', tag: emojiCache.get(emojiName) });
      continue;
    }

    try {
      const fullPath = path.join(dirPath, file);
      const created = await guild.emojis.create({
        attachment: fullPath,
        name: emojiName,
        reason: 'Nero Labs Official Chibi Server Emoji Pack',
      });
      emojiCache.set(emojiName, created.toString());
      uploaded.push({ name: emojiName, status: 'created', tag: created.toString() });
      console.log(`[EmojiManager] Uploaded emoji :${emojiName}: -> ${created.toString()}`);
    } catch (err) {
      console.warn(`[EmojiManager] Error uploading :${emojiName}:`, err.message);
      uploaded.push({ name: emojiName, status: 'error', error: err.message });
    }
  }

  return uploaded;
}

/**
 * Upload local PNG files as guild stickers (Max 5 for Tier 0)
 */
export async function uploadCustomStickersFromDir(guild, dirPath) {
  if (!guild || !fs.existsSync(dirPath)) return [];
  try {
    const existingStickers = await guild.stickers.fetch();
    const remainingSlots = Math.max(0, 5 - existingStickers.size);
    if (remainingSlots <= 0) {
      return [{ status: 'max_stickers_reached', currentCount: existingStickers.size }];
    }

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.png'));
    const uploaded = [];

    for (const file of files.slice(0, remainingSlots)) {
      const rawName = path.basename(file, '.png').replace(/_/g, ' ');
      const stickerName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

      if (existingStickers.some((s) => s.name.toLowerCase() === stickerName.toLowerCase())) {
        continue;
      }

      const fullPath = path.join(dirPath, file);
      try {
        const created = await guild.stickers.create({
          file: fullPath,
          name: stickerName.slice(0, 30),
          tags: 'rocket,raccoon,anime',
          description: `Rocket Chibi Sticker — ${stickerName}`,
        });
        uploaded.push({ name: created.name, id: created.id, status: 'created' });
        console.log(`[EmojiManager] Uploaded sticker: ${created.name}`);
      } catch (stkErr) {
        console.warn(`[EmojiManager] Sticker error on ${stickerName}:`, stkErr.message);
      }
    }

    return uploaded;
  } catch (err) {
    console.warn('[EmojiManager] Sticker sync failed:', err.message);
    return [];
  }
}

/**
 * Dynamically inject server custom emojis into outgoing Rocket messages
 */
export function injectServerCustomEmojis(text) {
  if (!text || typeof text !== 'string') return text;
  if (emojiCache.size === 0) return text;

  let result = text;

  // 1. Replace explicit markdown shortcodes e.g. :rocket_salute:, :nero_pizza:, :nero_coin:
  result = result.replace(/:([a-z0-9_]+):/gi, (match, p1) => {
    const found = getEmoji(p1);
    return found || match;
  });

  // 2. Substitute common keywords or unicode emojis if custom server versions exist
  const replacements = [
    { from: /🦝⚡/g, to: getEmoji('rocket_salute', '🦝⚡') },
    { from: /🍕/g, to: getEmoji('nero_pizza', '🍕') },
    { from: /🪙/g, to: getEmoji('nero_coin', '🪙') },
    { from: /😈/g, to: getEmoji('rocket_evil', '😈') },
    { from: /👑/g, to: getEmoji('buyer_crown', '👑') },
    { from: /🛠️/g, to: getEmoji('dev_terminal', '🛠️') },
    { from: /⚡/g, to: getEmoji('rocket_hype', '⚡') },
    { from: /💜/g, to: getEmoji('rocket_love', '💜') },
  ];

  for (const { from, to } of replacements) {
    if (to) {
      result = result.replace(from, to);
    }
  }

  return result;
}

/**
 * Return system prompt snippet letting the AI know about available custom server emojis
 */
export function getCustomEmojiDirectivesPrompt() {
  if (emojiCache.size === 0) {
    return 'CUSTOM SERVER EMOJIS: Use expressive raccoon emojis (🦝, 🐾, 🍕, ⚡, 😈).';
  }

  const list = [];
  for (const [name, tag] of emojiCache) {
    list.push(`:${name}: (${tag})`);
  }

  return (
    `CUSTOM SERVER EMOJIS & STICKERS:\n` +
    `- This Discord server features official Nero Labs chibi anime custom emojis! Feel free to use their tags:\n` +
    `  ${list.join(', ')}\n` +
    `- Whenever saluting Boss Sandy or celebrating, sprinkle :rocket_salute:, :nero_pizza:, :nero_coin:, or :rocket_boss: to look epic!\n`
  );
}

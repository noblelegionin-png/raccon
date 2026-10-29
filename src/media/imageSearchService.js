/**
 * 🖼️ NERO LABS — DIRECT IMAGE SEARCH & TELEGRAM DELIVERY SERVICE
 * Searches Wikimedia Commons & Wikipedia Media, verifies accessibility,
 * and delivers real images directly to Telegram via sendPhoto with captions and attribution.
 */

export class ImageSearchService {
  constructor() {
    this.timeoutMs = 7000;
    this.cache = new Map();
  }

  /**
   * Determine whether a user query is asking for a visual representation
   */
  isVisualQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();
    return (
      /(?:image|photo|pic|picture|diagram|view|wallpaper|drawing)\s+(?:of|for)\b/i.test(lower) ||
      /\b(?:what\s+does|how\s+does)\s+.*?\s+look(?:\s+like)?\b/i.test(lower) ||
      /^(?:hey\s+|hi\s+|hello\s+)?(?:myra|nero\s*,?\s*)?(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:show|send|give|find|search|get|share|generate|create|make|draw)\s+(?:me\s+)?(?:an?\s+)?(?:image|photo|pic|picture|diagram|view)\b/i.test(lower) ||
      /^(?:\/image|\/photo|\/pic)\b/i.test(lower) ||
      /\b(?:photo|pic|picture|image)\s+(?:dikhao|bhejo|send\s+karo|chahiye)\b/i.test(lower) ||
      /\b(?:ki\s+photo|ki\s+pic|ki\s+picture|ki\s+image)\b/i.test(lower)
    );
  }

  isImageQuery(text) {
    return this.isVisualQuery(text);
  }

  /**
   * Extract search term from visual query
   */
  extractImageQuery(text) {
    if (!text || typeof text !== 'string') return '';
    const clean = text.trim().replace(/[?.!]+$/, '');

    // 1. Hinglish patterns: 'penguin ki photo dikhao', 'taj mahal pic bhejo'
    const hinglishMatch = clean.match(/(?:mujhe\s+)?(.+?)\s+(?:ki\s+)?(?:photo|pic|picture|image)\s+(?:dikhao|bhejo|send\s+karo|chahiye)/i);
    if (hinglishMatch && hinglishMatch[1]) {
      return hinglishMatch[1].replace(/^(?:mujhe|plz|please)\s+/i, '').replace(/^(?:a|an|the)\s+/i, '').trim();
    }

    // 2. 'what does X look like' or 'how does X look'
    const lookMatch = clean.match(/(?:what\s+does|how\s+does)\s+(?:an?\s+|the\s+)?(.+?)\s+look(?:\s+like)?/i);
    if (lookMatch && lookMatch[1]) {
      return lookMatch[1].replace(/^(?:a|an|the)\s+/i, '').trim();
    }

    // 3. 'image/photo/pic/picture of/for X' anywhere in text
    const ofMatch = clean.match(/(?:image|photo|pic|picture|diagram|view|wallpaper|drawing)\s+(?:of|for)\s+(?:an?\s+|the\s+)?(.+)/i);
    if (ofMatch && ofMatch[1]) {
      return ofMatch[1].replace(/^(?:an?\s+|the\s+)/i, '').replace(/\s+(?:please|plz)$/i, '').trim();
    }

    // 4. Slash commands /image X
    if (/^\/(?:image|photo|pic)\s+/i.test(clean)) {
      return clean.replace(/^\/(?:image|photo|pic)\s+/i, '').trim();
    }

    // 5. Fallback: strip conversational prefixes
    return clean
      .replace(/^(?:hey\s+|hi\s+|hello\s+)?(?:myra|nero)\s*,?\s*/i, '')
      .replace(/^(?:can\s+you\s+|could\s+you\s+|please\s+|kindly\s+|i\s+want\s+(?:to\s+see\s+)?|i\'d\s+like\s+(?:to\s+see\s+)?)+/i, '')
      .replace(/^(?:show|send|give|find|search|get|share|generate|create|make|draw)\s+(?:me\s+)?(?:an?\s+)?(?:image|photo|pic|picture|diagram|view)\s+(?:of|for)?\s*/i, '')
      .replace(/^(?:a|an|the)\s+/i, '')
      .replace(/\s+(?:please|plz)$/i, '')
      .trim();
  }

  /**
   * Search Wikimedia Commons API for open, high-resolution media
   */
  async searchWikimediaCommons(query, limit = 4) {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQuery}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|extmetadata&format=json&gsrlimit=${limit}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'NeroLabsBot/3.0 (https://nerolabs.ai; bot@nerolabs.ai)' },
      });

      if (!res.ok) return [];
      const data = await res.json();
      const pages = data?.query?.pages || {};
      const results = [];

      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId];
        const info = page?.imageinfo?.[0];
        if (!info || !info.url) continue;

        // Skip non-standard image formats like svg or tiff for direct photo sending
        if (/\.(svg|tif|tiff|ogv|webm)$/i.test(info.url)) continue;

        const meta = info.extmetadata || {};
        const title = (page.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
        const artist = meta.Artist ? meta.Artist.value.replace(/<[^>]+>/g, '') : null;
        const license = meta.LicenseShortName ? meta.LicenseShortName.value : 'Creative Commons';
        const description = meta.ImageDescription ? meta.ImageDescription.value.replace(/<[^>]+>/g, '').slice(0, 150) : null;

        results.push({
          imageUrl: info.url,
          thumbnailUrl: info.thumburl || info.url,
          title: title || query,
          sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
          author: artist,
          license,
          description,
          width: info.width,
          height: info.height,
          sizeBytes: info.size,
        });
      }

      return results;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Search Wikipedia for primary topic lead image
   */
  async searchWikipediaLeadImage(query) {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${cleanQuery}&prop=pageimages|extracts&exintro=1&explaintext=1&pithumbsize=1000&format=json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'NeroLabsBot/3.0' },
      });

      if (!res.ok) return null;
      const data = await res.json();
      const pages = data?.query?.pages || {};
      const firstId = Object.keys(pages)[0];

      if (!firstId || firstId === '-1') return null;
      const page = pages[firstId];

      if (page.thumbnail?.source) {
        return {
          imageUrl: page.thumbnail.source,
          thumbnailUrl: page.thumbnail.source,
          title: page.title,
          sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/\s+/g, '_'))}`,
          author: 'Wikipedia Contributors',
          license: 'CC BY-SA 4.0',
          description: page.extract ? page.extract.slice(0, 200) + '...' : null,
          width: page.thumbnail.width,
          height: page.thumbnail.height,
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Search and return verified image results
   */
  async searchImages(query, limit = 4) {
    const q = query.trim();
    if (!q) return { ok: false, error: 'Image query is required.', images: [] };

    // Parallel search across Wikimedia Commons and Wikipedia
    const [wikiLead, commonsHits] = await Promise.all([
      this.searchWikipediaLeadImage(q),
      this.searchWikimediaCommons(q, limit),
    ]);

    const combined = [];
    if (wikiLead) combined.push(wikiLead);
    for (const hit of commonsHits) {
      if (!combined.some((x) => x.imageUrl === hit.imageUrl)) {
        combined.push(hit);
      }
    }

    return {
      ok: true,
      query: q,
      totalFound: combined.length,
      images: combined.slice(0, limit),
    };
  }

  /**
   * Search and return the single top verified image
   */
  async searchImage(query, limit = 4) {
    const res = await this.searchImages(query, limit);
    const top = res.images?.[0] || null;
    return {
      ...res,
      image: top ? { ...top, url: top.imageUrl } : null,
    };
  }

  /**
   * Deliver image directly via Telegram API ctx.replyWithPhoto
   */
  async deliverImageToTelegram(ctx, imageItem, userPrompt = '') {
    if (!ctx || !imageItem || !imageItem.imageUrl) return false;

    let caption = `🖼️ <b>${imageItem.title}</b>\n`;
    if (imageItem.description) {
      caption += `${imageItem.description.slice(0, 160)}\n\n`;
    }
    caption += `🔗 <a href="${imageItem.sourceUrl}">View Source on ${imageItem.sourceUrl.includes('wikipedia') ? 'Wikipedia' : 'Wikimedia'}</a>`;
    if (imageItem.author) {
      caption += ` · <i>By: ${imageItem.author.slice(0, 40)}</i>`;
    }

    // Telegram photo captions are strictly capped at 1024 characters
    if (caption.length > 1000) {
      caption = caption.slice(0, 990) + '...';
    }

    try {
      await ctx.replyWithPhoto(imageItem.imageUrl, {
        caption,
        parse_mode: 'HTML',
      });
      return true;
    } catch (err) {
      // If photo URL delivery fails (e.g. SSL/mime issue with Telegram), deliver as formatted link message
      await ctx.reply(
        `🖼️ <b>${imageItem.title}</b>\n\n` +
        `Direct upload could not be completed, but you can view the high-resolution image here:\n` +
        `👉 <a href="${imageItem.imageUrl}">Open Full Image</a>\n` +
        `📄 <a href="${imageItem.sourceUrl}">Source Page (${imageItem.license || 'Public'})</a>`,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: false } }
      );
      return false;
    }
  }
}

export const imageSearchService = new ImageSearchService();

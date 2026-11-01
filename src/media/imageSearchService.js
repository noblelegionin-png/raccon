export class ImageSearchService {
  constructor() {
    this.timeoutMs = 7000;
    this.cache = new Map();
    this.maxCacheAgeMs = 15 * 60 * 1000;
  }

  isExplicit18Plus(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return /\b(?:porn|pornography|nude|nudes|naked|sex|sexy|erotic|nsfw|xxx|boobs|pussy|dick|vagina|penis|hentai|adult\s+video)\b/i.test(lower);
  }

  isVisualQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();

    if (
      /(?:image|photo|pic|picture|diagram|view|wallpaper|drawing|tasveer)\s+(?:of|for)\b/i.test(lower) ||
      /\b(?:what\s+does|how\s+does)\s+.*?\s+look(?:\s+like)?\b/i.test(lower) ||
      /^(?:hey\s+|hi\s+|hello\s+)?(?:rocket|raccon|raccoon|myra|nero\s*,?\s*)?(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:show|send|give|find|search|get|share|generate|create|make|draw)\s+(?:me\s+)?(?:an?\s+)?(?:image|photo|pic|picture|diagram|view|wallpaper|tasveer)\b/i.test(lower) ||
      /^(?:\/image|\/photo|\/pic)\b/i.test(lower) ||
      /\b(?:photo|pic|picture|image|diagram|tasveer)\s+(?:dikhao|dikha|bhejo|bhej|send\s+karo|chahiye|de\s+do|de)\b/i.test(lower) ||
      /\b(?:ki\s+photo|ki\s+pic|ki\s+picture|ki\s+image|ka\s+diagram|ki\s+tasveer|ki\s+drawing)\b/i.test(lower)
    ) {
      return true;
    }

    const nonVisualKeywords = /^(?:how\s+to|code|website|link|url|dashboard|universe|workspace|notes?|tasks?|reminders?|budget|help|status|rules?|steps?|options?|memory|logs?|sim|profile|system)\b|^(?:your|my)\s+(?:website|universe|workspace|dashboard|portal|link|url|notes|memory|status|tasks|reminders|profile|code|rules)\b/i;
    const directMatch = lower.match(/^(?:hey\s+|hi\s+|hello\s+)?(?:rocket|raccon|raccoon|myra|nero\s*,?\s*)?(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:show|send|give)\s+(?:me\s+)?(?:an?\s+|the\s+)?([^?.!]+)$/i);
    if (directMatch && directMatch[1]) {
      const subject = directMatch[1].trim();
      if (subject.length >= 2 && !nonVisualKeywords.test(subject)) {
        return true;
      }
    }

    return false;
  }

  isImageQuery(text) {
    return this.isVisualQuery(text);
  }

  extractImageQuery(text) {
    if (!text || typeof text !== 'string') return '';
    let clean = text.trim().replace(/[?.!]+$/, '');

    // Strip bot mention prefixes upfront
    clean = clean.replace(/^(?:hey\s+|hi\s+|hello\s+)?(?:rocket|raccon|raccoon|myra|nero)\s*,?\s*/i, '').trim();

    const nonVisualKeywords = /^(?:how\s+to|code|website|link|url|dashboard|universe|workspace|notes?|tasks?|reminders?|budget|help|status|rules?|steps?|options?|memory|logs?|sim|profile|system)\b|^(?:your|my)\s+(?:website|universe|workspace|dashboard|portal|link|url|notes|memory|status|tasks|reminders|profile|code|rules)\b/i;

    const ofMatch = clean.match(/(?:image|photo|pic|picture|diagram|view|wallpaper|drawing|tasveer)\s+(?:of|for)\s+(?:an?\s+|the\s+)?(.+)/i);
    if (ofMatch && ofMatch[1]) {
      return ofMatch[1].replace(/^(?:an?\s+|the\s+)/i, '').replace(/\s+(?:please|plz)$/i, '').trim();
    }

    const hinglishMatch = clean.match(/(?:mujhe\s+)?(.+?)\s+(?:ki\s+|ka\s+)?(?:photo|pic|picture|image|diagram|tasveer)\s+(?:dikhao|dikha|bhejo|bhej|send\s+karo|chahiye|de\s+do|de)/i);
    if (hinglishMatch && hinglishMatch[1]) {
      return hinglishMatch[1].replace(/^(?:mujhe|plz|please)\s+/i, '').replace(/^(?:a|an|the)\s+/i, '').trim();
    }

    const lookMatch = clean.match(/(?:what\s+does|how\s+does)\s+(?:an?\s+|the\s+)?(.+?)\s+look(?:\s+like)?/i);
    if (lookMatch && lookMatch[1]) {
      return lookMatch[1].replace(/^(?:a|an|the)\s+/i, '').trim();
    }

    const directMatch = clean.match(/^(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:show|send|give)\s+(?:me\s+)?(?:an?\s+|the\s+)?(?:(?:image|photo|pic|picture|diagram|view|tasveer)\s+(?:of|for)?\s*)?([^?.!]+)$/i);
    if (directMatch && directMatch[1]) {
      const sub = directMatch[1].trim();
      if (!nonVisualKeywords.test(sub)) {
        return sub.replace(/^(?:a|an|the)\s+/i, '').trim();
      }
    }

    if (/^\/(?:image|photo|pic)\s+/i.test(clean)) {
      return clean.replace(/^\/(?:image|photo|pic)\s+/i, '').trim();
    }

    return clean
      .replace(/^(?:can\s+you\s+|could\s+you\s+|please\s+|kindly\s+|i\s+want\s+(?:to\s+see\s+)?|i\'d\s+like\s+(?:to\s+see\s+)?)+/i, '')
      .replace(/^(?:show|send|give|find|search|get|share|generate|create|make|draw)\s+(?:me\s+)?(?:an?\s+)?(?:image|photo|pic|picture|diagram|view|tasveer)\s+(?:of|for)?\s*/i, '')
      .replace(/^(?:a|an|the)\s+/i, '')
      .replace(/\s+(?:please|plz)$/i, '')
      .trim();
  }

  async searchDuckDuckGoImages(query, limit = 5) {
    const cleanQuery = encodeURIComponent(query.trim());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const pageRes = await fetch(`https://duckduckgo.com/?q=${cleanQuery}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!pageRes.ok) return [];
      const html = await pageRes.text();
      const match = /vqd=([\d-]+)/.exec(html) || /vqd=["']([^"']+)["']/.exec(html);
      if (!match) return [];

      const vqd = match[1];
      const apiRes = await fetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${cleanQuery}&vqd=${vqd}&f=1,,,`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://duckduckgo.com/',
        },
      });

      if (!apiRes.ok) return [];
      const data = await apiRes.json();
      const hits = Array.isArray(data?.results) ? data.results : [];
      const results = [];

      for (const item of hits.slice(0, limit + 4)) {
        if (!item.image) continue;
        if (/\.(svg|tif|tiff|ogv|webm)$/i.test(item.image)) continue;

        results.push({
          imageUrl: item.image,
          thumbnailUrl: item.thumbnail || item.image,
          title: item.title ? item.title.replace(/<[^>]+>/g, '').trim() : query,
          sourceUrl: item.url || item.image,
          author: item.source || 'Web',
          license: 'Web Reference',
          description: item.title ? item.title.replace(/<[^>]+>/g, '').trim() : null,
          width: item.width || null,
          height: item.height || null,
        });

        if (results.length >= limit) break;
      }

      return results;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchWikipediaLeadImage(query) {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQuery}&gsrlimit=3&prop=pageimages|extracts&exintro=1&explaintext=1&pithumbsize=1280&format=json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'RocketBot/1.0 (https://nerolabs.ai; bot@nerolabs.ai)' },
      });

      if (!res.ok) return null;
      const data = await res.json();
      const pages = Object.values(data?.query?.pages || {});
      const hit = pages.find((p) => p.thumbnail?.source);

      if (hit && hit.thumbnail?.source) {
        return {
          imageUrl: hit.thumbnail.source,
          thumbnailUrl: hit.thumbnail.source,
          title: hit.title,
          sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/\s+/g, '_'))}`,
          author: 'Wikipedia Contributors',
          license: 'CC BY-SA 4.0',
          description: hit.extract ? hit.extract.slice(0, 200) + '...' : null,
          width: hit.thumbnail.width,
          height: hit.thumbnail.height,
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchWikimediaCommons(query, limit = 4) {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQuery}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280&format=json&gsrlimit=${limit}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'RocketBot/1.0 (https://nerolabs.ai; bot@nerolabs.ai)' },
      });

      if (!res.ok) return [];
      const data = await res.json();
      const pages = data?.query?.pages || {};
      const results = [];

      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId];
        const info = page?.imageinfo?.[0];
        if (!info || !info.url) continue;

        const effectiveUrl = (info.url.endsWith('.svg') || info.url.endsWith('.tif')) && info.thumburl
          ? info.thumburl
          : info.url;

        if (/\.(svg|tif|tiff|ogv|webm)$/i.test(effectiveUrl)) continue;

        const meta = info.extmetadata || {};
        const title = (page.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
        const artist = meta.Artist ? meta.Artist.value.replace(/<[^>]+>/g, '') : null;
        const license = meta.LicenseShortName ? meta.LicenseShortName.value : 'Creative Commons';
        const description = meta.ImageDescription ? meta.ImageDescription.value.replace(/<[^>]+>/g, '').slice(0, 150) : null;

        results.push({
          imageUrl: effectiveUrl,
          thumbnailUrl: info.thumburl || effectiveUrl,
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

  async searchImages(query, limit = 4) {
    const q = (query || '').trim();
    if (!q) return { ok: false, error: 'Image query is required.', images: [] };

    if (this.isExplicit18Plus(q)) {
      return {
        ok: false,
        error: '18+ adult explicit imagery is restricted. Educational, scientific, anatomical diagrams and general web visuals are supported.',
        images: [],
      };
    }

    const cacheKey = q.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.maxCacheAgeMs) {
      return { ok: true, query: q, totalFound: cached.images.length, images: cached.images.slice(0, limit) };
    }

    const [ddgHits, wikiLead, commonsHits] = await Promise.all([
      this.searchDuckDuckGoImages(q, limit),
      this.searchWikipediaLeadImage(q),
      this.searchWikimediaCommons(q, limit),
    ]);

    const combined = [];
    const seenUrls = new Set();

    const addHit = (hit) => {
      if (!hit || !hit.imageUrl || seenUrls.has(hit.imageUrl)) return;
      seenUrls.add(hit.imageUrl);
      combined.push(hit);
    };

    if (wikiLead) addHit(wikiLead);
    for (const hit of ddgHits) addHit(hit);
    for (const hit of commonsHits) addHit(hit);

    this.cache.set(cacheKey, { timestamp: Date.now(), images: combined });

    return {
      ok: true,
      query: q,
      totalFound: combined.length,
      images: combined.slice(0, limit),
    };
  }

  async searchImage(query, limit = 4) {
    const res = await this.searchImages(query, limit);
    const top = res.images?.[0] || null;
    return {
      ...res,
      image: top ? { ...top, url: top.imageUrl } : null,
    };
  }

  async downloadImageBuffer(imageUrl, timeoutMs = 8000) {
    if (!imageUrl) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/*,*/*',
        },
      });

      if (!resp.ok) return null;
      const arrayBuf = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      let mimetype = resp.headers.get('content-type') || 'image/jpeg';
      if (mimetype.includes(';')) mimetype = mimetype.split(';')[0].trim();

      return { buffer, mimetype, sizeBytes: buffer.length };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async deliverImageToTelegram(ctx, imageItem, userPrompt = '') {
    if (!ctx || !imageItem || !imageItem.imageUrl) return false;

    let caption = `🖼️ <b>${imageItem.title}</b>\n`;
    if (imageItem.description) {
      caption += `${imageItem.description.slice(0, 160)}\n\n`;
    }
    const sourceLabel = (imageItem.sourceUrl || '').includes('wikipedia')
      ? 'Wikipedia'
      : (imageItem.sourceUrl || '').includes('wikimedia')
      ? 'Wikimedia'
      : 'Web';
    caption += `🔗 <a href="${imageItem.sourceUrl || imageItem.imageUrl}">View Source on ${sourceLabel}</a>`;
    if (imageItem.author) {
      caption += ` · <i>By: ${imageItem.author.slice(0, 40)}</i>`;
    }

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
      await ctx.reply(
        `🖼️ <b>${imageItem.title}</b>\n\n` +
        `Direct upload could not be completed, but you can view the high-resolution image here:\n` +
        `👉 <a href="${imageItem.imageUrl}">Open Full Image</a>\n` +
        `📄 <a href="${imageItem.sourceUrl || imageItem.imageUrl}">Source Page (${imageItem.license || 'Public'})</a>`,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: false } }
      );
      return false;
    }
  }
}

export const imageSearchService = new ImageSearchService();

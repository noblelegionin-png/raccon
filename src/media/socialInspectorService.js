/**
 * 🎬 ROCKET AI — UNIVERSAL SOCIAL MEDIA & REEL/SHORTS INSPECTOR
 * Inspects YouTube (videos & Shorts), Facebook (Reels & videos),
 * Instagram (Reels & posts), and Vero (posts & videos).
 * Extracts author, title, captions, thumbnails, and structures rich summaries.
 */

export class SocialInspectorService {
  constructor() {
    this.timeoutMs = 9000;
  }

  /**
   * Detect whether text contains a supported social media link
   */
  isSocialUrl(text) {
    if (!text || typeof text !== 'string') return false;
    return (
      /\bhttps?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch|shorts|v|embed)|youtu\.be\/)[^\s]+/i.test(text) ||
      /\bhttps?:\/\/(?:www\.)?(?:instagram\.com\/(?:reel|reels|p|tv)|instagr\.am\/)[^\s]+/i.test(text) ||
      /\bhttps?:\/\/(?:www\.|m\.)?(?:facebook\.com\/(?:reel|watch|share\/r|[^/]+\/videos)|fb\.watch\/)[^\s]+/i.test(text) ||
      /\bhttps?:\/\/(?:www\.)?vero\.co\/[^\s]+/i.test(text)
    );
  }

  /**
   * Extract clean social URL and identify platform
   */
  extractSocialUrl(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/https?:\/\/[^\s]+/i);
    if (!match) return null;

    let url = match[0].replace(/[)>,.;"']+$/, '');

    let platform = 'unknown';
    let type = 'video';

    if (/youtube\.com\/shorts/i.test(url)) {
      platform = 'youtube';
      type = 'short';
    } else if (/youtube\.com|youtu\.be/i.test(url)) {
      platform = 'youtube';
      type = 'video';
    } else if (/instagram\.com\/(?:reel|reels)/i.test(url)) {
      platform = 'instagram';
      type = 'reel';
    } else if (/instagram\.com|instagr\.am/i.test(url)) {
      platform = 'instagram';
      type = 'post';
    } else if (/facebook\.com\/reel|fb\.watch/i.test(url) || /facebook\.com\/share\/r/i.test(url)) {
      platform = 'facebook';
      type = 'reel';
    } else if (/facebook\.com/i.test(url)) {
      platform = 'facebook';
      type = 'video';
    } else if (/vero\.co/i.test(url)) {
      platform = 'vero';
      type = 'post';
    }

    return { url, platform, type };
  }

  /**
   * Inspect a social media URL
   */
  async inspect(rawUrl) {
    const extracted = this.extractSocialUrl(rawUrl);
    if (!extracted || extracted.platform === 'unknown') {
      return { ok: false, error: 'Unsupported social media URL. Supported: YouTube, Instagram, Facebook, Vero.' };
    }

    const { url, platform, type } = extracted;

    try {
      switch (platform) {
        case 'youtube':
          return await this.inspectYouTube(url, type);
        case 'instagram':
          return await this.inspectInstagram(url, type);
        case 'facebook':
          return await this.inspectFacebook(url, type);
        case 'vero':
          return await this.inspectVero(url, type);
        default:
          return { ok: false, error: 'Unknown platform' };
      }
    } catch (err) {
      return { ok: false, error: `Failed to inspect ${platform} URL: ${err.message}` };
    }
  }

  /**
   * Inspect YouTube video or YouTube Short
   */
  async inspectYouTube(url, type = 'video') {
    let videoId = null;

    if (url.includes('/shorts/')) {
      const match = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (match) videoId = match[1];
    } else if (url.includes('youtu.be/')) {
      const match = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
      if (match) videoId = match[1];
    } else {
      const match = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      if (match) videoId = match[1];
    }

    if (!videoId) {
      return { ok: false, error: 'Could not extract YouTube video/short ID.' };
    }

    const canonicalWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalWatchUrl)}&format=json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      if (!res.ok) {
        return {
          ok: true,
          platform: 'youtube',
          type: type === 'short' ? 'YouTube Short' : 'YouTube Video',
          id: videoId,
          title: `YouTube ${type === 'short' ? 'Short' : 'Video'} (${videoId})`,
          author: 'YouTube Creator',
          authorUrl: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          cleanUrl: canonicalWatchUrl,
          description: `Direct YouTube ${type === 'short' ? 'Short' : 'Video'} available at ${canonicalWatchUrl}`,
        };
      }

      const data = await res.json();
      const highResThumb = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

      return {
        ok: true,
        platform: 'youtube',
        type: type === 'short' ? 'YouTube Short' : 'YouTube Video',
        id: videoId,
        title: data.title || 'Untitled YouTube Video',
        author: data.author_name || 'YouTube Creator',
        authorUrl: data.author_url || null,
        thumbnailUrl: data.thumbnail_url || highResThumb,
        cleanUrl: type === 'short' ? `https://www.youtube.com/shorts/${videoId}` : canonicalWatchUrl,
        description: `Uploaded by ${data.author_name || 'YouTube Creator'}. Watch on YouTube.`,
        embedHtml: data.html || null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Inspect Instagram Reel or Post
   */
  async inspectInstagram(url, type = 'reel') {
    let shortcode = null;
    const match = url.match(/\/(?:reel|reels|p|tv)\/([a-zA-Z0-9_-]+)/);
    if (match) shortcode = match[1];

    if (!shortcode) {
      return { ok: false, error: 'Could not extract Instagram shortcode.' };
    }

    const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=https://www.instagram.com/p/${shortcode}/`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      if (res.ok) {
        const data = await res.json();
        const rawTitle = data.title || '';
        const cleanCaption = rawTitle.replace(/\s*#[\w-]+/g, '').trim() || rawTitle;

        return {
          ok: true,
          platform: 'instagram',
          type: type === 'reel' ? 'Instagram Reel' : 'Instagram Post',
          id: shortcode,
          title: cleanCaption ? cleanCaption.slice(0, 180) : `Instagram ${type.toUpperCase()} by @${data.author_name}`,
          author: data.author_name ? `@${data.author_name}` : 'Instagram Creator',
          authorUrl: data.author_url || `https://www.instagram.com/${data.author_name}`,
          thumbnailUrl: data.thumbnail_url || null,
          cleanUrl: `https://www.instagram.com/reel/${shortcode}/`,
          description: rawTitle || 'Instagram Media Content',
          embedHtml: data.html || null,
        };
      }

      // Fallback: structured card with clean shortcode link
      return {
        ok: true,
        platform: 'instagram',
        type: type === 'reel' ? 'Instagram Reel' : 'Instagram Post',
        id: shortcode,
        title: `Instagram ${type === 'reel' ? 'Reel' : 'Post'} (${shortcode})`,
        author: 'Instagram Creator',
        authorUrl: `https://www.instagram.com/reel/${shortcode}/`,
        thumbnailUrl: null,
        cleanUrl: `https://www.instagram.com/reel/${shortcode}/`,
        description: `Direct Instagram ${type} available at https://www.instagram.com/reel/${shortcode}/`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Inspect Facebook Reel or Video
   */
  async inspectFacebook(url, type = 'reel') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      let title = `Facebook ${type === 'reel' ? 'Reel' : 'Video'}`;
      let description = '';
      let thumbnailUrl = null;

      if (res.ok) {
        const html = await res.text();
        const ogTitle = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:title["']/i);
        const ogDesc = html.match(/<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:description["']/i);
        const ogImg = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                      html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);

        if (ogTitle && ogTitle[1]) title = ogTitle[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
        if (ogDesc && ogDesc[1]) description = ogDesc[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
        if (ogImg && ogImg[1]) thumbnailUrl = ogImg[1];
      }

      return {
        ok: true,
        platform: 'facebook',
        type: type === 'reel' ? 'Facebook Reel' : 'Facebook Video',
        id: url.split('/').filter(Boolean).pop() || 'unknown',
        title: title || 'Facebook Reel',
        author: 'Facebook Creator',
        authorUrl: url,
        thumbnailUrl,
        cleanUrl: url,
        description: description || title,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Inspect Vero post or video
   */
  async inspectVero(url, type = 'post') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      let title = 'Vero Post';
      let description = '';
      let thumbnailUrl = null;

      if (res.ok) {
        const html = await res.text();
        const ogTitle = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:title["']/i);
        const ogDesc = html.match(/<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:description["']/i);
        const ogImg = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                      html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);

        if (ogTitle && ogTitle[1]) title = ogTitle[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
        if (ogDesc && ogDesc[1]) description = ogDesc[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
        if (ogImg && ogImg[1]) thumbnailUrl = ogImg[1];
      }

      return {
        ok: true,
        platform: 'vero',
        type: 'Vero Post/Reel',
        id: url.split('/').filter(Boolean).pop() || 'unknown',
        title: title || 'Vero Content',
        author: 'Vero Creator',
        authorUrl: url,
        thumbnailUrl,
        cleanUrl: url,
        description: description || title,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Format a high-impact Rocket WhatsApp Inspection Card
   */
  formatInspectionCard(item, isSandy = false) {
    const platformIcons = {
      youtube: '▶️',
      instagram: '📸',
      facebook: '📘',
      vero: '💎',
    };
    const icon = platformIcons[item.platform] || '🎬';

    let card = '';
    if (isSandy) {
      card += `🔍 *Ye lo Boss! ${item.type} ka full inspection:* \n─────────────────────────\n`;
    } else {
      card += `🔍 *${item.type} Inspection:* \n─────────────────────────\n`;
    }

    card += `${icon} *Platform:* ${item.platform.toUpperCase()} (${item.type})\n`;
    card += `📌 *Title:* ${item.title}\n`;
    if (item.author) {
      card += `👤 *Creator:* ${item.author}\n`;
    }
    if (item.description && item.description !== item.title) {
      card += `📝 *Summary:* _${item.description.slice(0, 220)}..._\n`;
    }
    card += `🔗 *Watch Direct:* ${item.cleanUrl}\n─────────────────────────\n`;

    if (isSandy) {
      card += `_Rocket on duty, Boss! Kuch aur inspect karu ya analyze karu?_ 🚀`;
    }

    return card.trim();
  }

  /**
   * Download thumbnail buffer for WhatsApp media sending
   */
  async downloadThumbnailBuffer(thumbnailUrl, timeoutMs = 7000) {
    if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(thumbnailUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,*/*',
        },
      });

      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      let mimetype = res.headers.get('content-type') || 'image/jpeg';
      if (mimetype.includes(';')) mimetype = mimetype.split(';')[0].trim();

      return { buffer, mimetype, sizeBytes: buffer.length };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const socialInspectorService = new SocialInspectorService();

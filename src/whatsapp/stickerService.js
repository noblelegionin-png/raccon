import sharp from 'sharp';

/**
 * WhatsApp Sticker Service
 * Creates WhatsApp-compatible WebP stickers (512x512) and provides built-in dynamic presets.
 */
export class StickerService {
  constructor() {
    this._cache = new Map();
  }

  /**
   * Convert any image buffer (PNG, JPEG, SVG) into a WhatsApp WebP sticker
   * WhatsApp standard: 512x512 pixels, transparent background, WebP format (< 500KB)
   * @param {Buffer} imageBuffer
   * @returns {Promise<Buffer>}
   */
  async createStickerFromBuffer(imageBuffer) {
    try {
      return await sharp(imageBuffer)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (err) {
      console.error('[StickerService] Failed to create sticker from buffer:', err.message);
      throw err;
    }
  }

  /**
   * Generate preset SVG stickers rendered to WebP
   * @param {'nero_cyber' | 'bro_fist' | 'fire' | 'sandy_chill' | 'wave'} type
   * @returns {Promise<Buffer>}
   */
  async getPresetSticker(type = 'nero_cyber') {
    if (this._cache.has(type)) {
      return this._cache.get(type);
    }

    let svgContent = '';

    switch (type) {
      case 'bro_fist':
        svgContent = `
          <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" rx="80" fill="#1e1e2e"/>
            <circle cx="256" cy="200" r="120" fill="#f5c2e7" opacity="0.15"/>
            <text x="256" y="240" font-size="120" text-anchor="middle">👊</text>
            <text x="256" y="360" font-size="44" font-family="Arial, sans-serif" font-weight="900" fill="#89b4fa" text-anchor="middle">BHAI VIBE</text>
            <text x="256" y="410" font-size="24" font-family="Arial, sans-serif" fill="#a6adc8" text-anchor="middle">Scene Sorted Hai! ⚡</text>
          </svg>`;
        break;

      case 'fire':
        svgContent = `
          <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" rx="80" fill="#181825"/>
            <circle cx="256" cy="200" r="120" fill="#fab387" opacity="0.2"/>
            <text x="256" y="240" font-size="120" text-anchor="middle">🔥</text>
            <text x="256" y="360" font-size="46" font-family="Arial, sans-serif" font-weight="900" fill="#fab387" text-anchor="middle">100% LIT</text>
            <text x="256" y="410" font-size="24" font-family="Arial, sans-serif" fill="#cdd6f4" text-anchor="middle">Full Speed 🚀</text>
          </svg>`;
        break;

      case 'sandy_chill':
        svgContent = `
          <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" rx="80" fill="#11111b"/>
            <circle cx="256" cy="200" r="120" fill="#a6e3a1" opacity="0.15"/>
            <text x="256" y="240" font-size="120" text-anchor="middle">😎</text>
            <text x="256" y="360" font-size="42" font-family="Arial, sans-serif" font-weight="900" fill="#a6e3a1" text-anchor="middle">SANDY'S SPACE</text>
            <text x="256" y="410" font-size="24" font-family="Arial, sans-serif" fill="#bac2de" text-anchor="middle">Chill &amp; Focused ⚡</text>
          </svg>`;
        break;

      case 'wave':
        svgContent = `
          <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" rx="80" fill="#181825"/>
            <circle cx="256" cy="200" r="120" fill="#89dceb" opacity="0.15"/>
            <text x="256" y="240" font-size="120" text-anchor="middle">👋</text>
            <text x="256" y="360" font-size="44" font-family="Arial, sans-serif" font-weight="900" fill="#89dceb" text-anchor="middle">HEY THERE!</text>
            <text x="256" y="410" font-size="24" font-family="Arial, sans-serif" fill="#cdd6f4" text-anchor="middle">Nero Executive AI 🤖</text>
          </svg>`;
        break;

      case 'nero_cyber':
      default:
        svgContent = `
          <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" rx="80" fill="#0d1117"/>
            <circle cx="256" cy="200" r="120" fill="#00ffcc" opacity="0.15"/>
            <text x="256" y="240" font-size="120" text-anchor="middle">🦾</text>
            <text x="256" y="360" font-size="44" font-family="Arial, sans-serif" font-weight="900" fill="#00ffcc" text-anchor="middle">NERO LABS</text>
            <text x="256" y="410" font-size="24" font-family="Arial, sans-serif" fill="#8b949e" text-anchor="middle">24/7 AI Companion</text>
          </svg>`;
        break;
    }

    const svgBuffer = Buffer.from(svgContent.trim());
    const webpBuffer = await sharp(svgBuffer)
      .resize(512, 512)
      .webp({ quality: 85 })
      .toBuffer();

    this._cache.set(type, webpBuffer);
    return webpBuffer;
  }

  /**
   * Check if text is asking for a sticker
   * @param {string} text
   * @returns {boolean}
   */
  isStickerRequest(text) {
    if (!text) return false;
    return /\b(?:send\s+a?\s*sticker|sticker\s+(?:bhej|do|please)|make\s+sticker|create\s+sticker|^sticker$)\b/i.test(text.trim());
  }

  /**
   * Determine matching preset sticker from prompt or vibe
   * @param {string} text
   * @param {string} role
   * @returns {'nero_cyber' | 'bro_fist' | 'fire' | 'sandy_chill' | 'wave'}
   */
  pickStickerType(text = '', role = 'friend') {
    const lower = text.toLowerCase();
    if (lower.includes('bhai') || lower.includes('bro') || role === 'brother') return 'bro_fist';
    if (lower.includes('lit') || lower.includes('fire') || lower.includes('aag')) return 'fire';
    if (lower.includes('sandy') || lower.includes('chill')) return 'sandy_chill';
    if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) return 'wave';
    return 'nero_cyber';
  }
}

export const stickerService = new StickerService();

/**
 * 📥 ROCKET AI — UNIVERSAL HIGHEST QUALITY MP3 & MP4 MEDIA DOWNLOADER
 * 
 * Supports:
 * - YouTube Videos & Shorts (Highest audio MP3/AAC and highest video MP4)
 * - Instagram Reels & Posts (Highest resolution video & original audio)
 * - Facebook Reels & Videos
 * - TikTok Videos & Music (No-watermark highest quality)
 * - Twitter/X Videos & Clips
 * - Direct Audio & Video files (MP4, MP3, M4A, WAV, WebM)
 * 
 * Features:
 * - Direct WhatsApp delivery for files <= 16MB (native audio / video messages)
 * - High-speed expiring web links for files > 16MB (/api/download/:token)
 * - Rocket "Ask link and done" conversational fast-path
 * - OpenAI-compatible tool calling integration
 * - SSRF protection and disk auto-cleanup
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Ytdl } from '@distube/ytdl-core';
import { alldl } from 'rahad-all-downloader-v2';
import { snapsave } from 'snapsave-media-downloader';
import { deepBrowserService } from '../browser/deepBrowserService.js';
import {
  createDownloadJob,
  getDownloadJob,
  getDownloadJobByToken,
  updateDownloadJob,
  listDownloadJobs,
} from '../db/index.js';

export class MediaDownloaderService {
  constructor() {
    this.name = 'MediaDownloaderService';
    this.downloadDir = path.resolve('data/downloads');
    this.maxSizeBytes = 100 * 1024 * 1024; // 100 MB hard ceiling
    this.whatsappLimitBytes = 16 * 1024 * 1024; // 16 MB WhatsApp threshold
    this.ytdl = new Ytdl();

    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * Detect whether text contains a downloadable media URL
   */
  isMediaUrl(text) {
    if (!text || typeof text !== 'string') return false;
    return (
      /\bhttps?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch|shorts|v|embed)|youtu\.be\/)[^\s]+/i.test(text) ||
      /\bhttps?:\/\/(?:www\.)?(?:instagram\.com\/(?:reel|reels|p|tv)|instagr\.am\/)[^\s]+/i.test(text) ||
      /\bhttps?:\/\/(?:www\.|m\.)?(?:facebook\.com\/(?:reel|watch|share\/r|[^/]+\/videos)|fb\.watch\/)[^\s]+/i.test(text) ||
      /\bhttps?:\/\/(?:www\.)?(?:tiktok\.com\/@[^/]+\/video|vt\.tiktok\.com\/|vm\.tiktok\.com\/)[^\s]+/i.test(text) ||
      /\bhttps?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^/]+\/status\/\d+[^\s]*/i.test(text) ||
      /\bhttps?:\/\/[^\s]+\.(?:mp4|webm|mov|mkv|mp3|m4a|wav|aac|ogg)(?:\?[^\s]*)?\b/i.test(text)
    );
  }

  /**
   * Detect whether user's text expresses an intent to download media
   */
  isDownloadIntent(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();

    // Direct command words
    if (/\b(?:download|downlod|dawnload|dwonload|save)\b/i.test(lower)) return true;

    // Explicit format requests: "mp3", "mp4", "audio download", "video download"
    if (/\b(?:mp3|mp4|highest\s+quality|highest\s+audio)\b/i.test(lower)) return true;

    // Conversational Hinglish / English download phrases
    if (/\b(?:reel|reels|shorts?|video|song|gaana|music|track)\s*(?:nikaal|nikaalo|dedo|de\s*do|chahiye|bhejo|download|save|play|sunna)\b/i.test(lower)) return true;
    if (/\b(?:nikaal\s*(?:ke\s*)?(?:de|do|bhejo)|download\s*kar\s*(?:de|do|karo|ke))\b/i.test(lower)) return true;

    return false;
  }

  /**
   * Detect requested format ('mp3' or 'mp4') from text
   */
  detectFormat(text) {
    if (!text || typeof text !== 'string') return 'mp4';
    const lower = text.toLowerCase();
    if (/\b(?:mp3|audio|sound|song|gaana|gana|music|track|voice|sunna|listen)\b/i.test(lower)) {
      return 'mp3';
    }
    return 'mp4';
  }

  /**
   * Extract clean URL and platform type from input
   */
  extractMediaUrl(text) {
    if (!text) return null;
    const match = text.match(/https?:\/\/[^\s]+/i);
    if (!match) return null;

    const url = match[0].replace(/[)>,.;"']+$/, '');
    let platform = 'direct';

    if (/youtube\.com|youtu\.be/i.test(url)) platform = 'youtube';
    else if (/instagram\.com|instagr\.am/i.test(url)) platform = 'instagram';
    else if (/facebook\.com|fb\.watch/i.test(url)) platform = 'facebook';
    else if (/tiktok\.com/i.test(url)) platform = 'tiktok';
    else if (/twitter\.com|x\.com/i.test(url)) platform = 'twitter';

    return { url, platform };
  }

  /**
   * Primary download method: Downloads audio (MP3) or video (MP4) in the highest available quality
   */
  async downloadMedia({ url, format = 'mp4', quality = 'highest', maxSizeBytes = 100 * 1024 * 1024 } = {}) {
    if (!url) {
      return { ok: false, error: 'URL is required for download.' };
    }

    const cleanExtracted = this.extractMediaUrl(url);
    const targetUrl = cleanExtracted ? cleanExtracted.url : url;
    const platform = cleanExtracted ? cleanExtracted.platform : 'direct';

    // SSRF Check
    if (!deepBrowserService.isSafeUrl(targetUrl)) {
      return { ok: false, error: `SSRF Guard: Inaccessible or private URL blocked: ${targetUrl}` };
    }

    const requestedFormat = (format || 'mp4').toLowerCase() === 'mp3' ? 'mp3' : 'mp4';

    try {
      if (platform === 'youtube') {
        return await this._downloadYouTube(targetUrl, requestedFormat, quality, maxSizeBytes);
      } else if (platform === 'instagram' || platform === 'facebook' || platform === 'tiktok' || platform === 'twitter') {
        return await this._downloadSocialMedia(targetUrl, platform, requestedFormat, maxSizeBytes);
      } else {
        return await this._downloadDirectUrl(targetUrl, requestedFormat, maxSizeBytes);
      }
    } catch (err) {
      console.error(`[MediaDownloaderService Error (${platform})]:`, err.message);
      return {
        ok: false,
        error: `Download failed: ${err.message}`,
        platform,
        url: targetUrl,
      };
    }
  }

  /**
   * YouTube Stream Downloader (Highest Audio MP3/AAC or Highest Video MP4)
   */
  async _downloadYouTube(url, format, quality, maxSizeBytes) {
    let videoTitle = 'YouTube Media';
    let author = 'YouTube Creator';

    try {
      const info = await this.ytdl.getInfo(url);
      if (info && info.videoDetails) {
        videoTitle = info.videoDetails.title || videoTitle;
        author = info.videoDetails.author?.name || author;
      }
    } catch (infoErr) {
      console.warn('[YouTube getInfo warning]:', infoErr.message);
    }

    const sanitizedTitle = videoTitle.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);

    if (format === 'mp3') {
      // Stream highest quality audio
      const stream = this.ytdl.download(url, {
        filter: { hasAudio: true, hasVideo: false },
        quality: 'highestaudio',
      });

      const buffer = await this._streamToBuffer(stream, maxSizeBytes, 35000);
      const fileName = `${sanitizedTitle}_${Date.now()}.mp3`;

      return this._packageResult({
        title: videoTitle,
        author,
        platform: 'youtube',
        format: 'mp3',
        buffer,
        mimetype: 'audio/mp4', // AAC container played natively in WhatsApp
        fileName,
        url,
      });
    }

    // MP4 Video: Try multi-extractor first for direct CDN, fallback to stream
    try {
      const allRes = await alldl(url);
      const cdnUrl = allRes?.data?.videoUrl || allRes?.data?.download?.no_watermark;
      if (cdnUrl) {
        const fetchRes = await this._fetchToBuffer(cdnUrl, maxSizeBytes, 35000);
        const fileName = `${sanitizedTitle}_${Date.now()}.mp4`;
        return this._packageResult({
          title: videoTitle,
          author,
          platform: 'youtube',
          format: 'mp4',
          buffer: fetchRes.buffer,
          mimetype: 'video/mp4',
          fileName,
          url,
        });
      }
    } catch (cdnErr) {
      console.warn('[YouTube alldl fallback to ytdl stream]:', cdnErr.message);
    }

    // Fallback: ytdl highest stream
    const stream = this.ytdl.download(url, {
      quality: quality === 'highest' ? 'highest' : 'highestvideo',
    });

    const buffer = await this._streamToBuffer(stream, maxSizeBytes, 40000);
    const fileName = `${sanitizedTitle}_${Date.now()}.mp4`;

    return this._packageResult({
      title: videoTitle,
      author,
      platform: 'youtube',
      format: 'mp4',
      buffer,
      mimetype: 'video/mp4',
      fileName,
      url,
    });
  }

  /**
   * Social Media Downloader (Instagram Reels, Facebook, TikTok, Twitter/X)
   */
  async _downloadSocialMedia(url, platform, format, maxSizeBytes) {
    let resolvedCdnUrl = null;
    let title = `${platform.toUpperCase()} Reel`;
    let author = `${platform} Creator`;

    // 1. Try alldl (all-in-one downloader)
    try {
      const res = await alldl(url);
      if (res && res.data) {
        title = res.data.title || title;
        if (format === 'mp3' && res.data.download?.music) {
          resolvedCdnUrl = res.data.download.music;
        } else {
          resolvedCdnUrl =
            res.data.download?.no_watermark ||
            res.data.videoUrl ||
            res.data.download?.watermark;
        }
      }
    } catch (allErr) {
      console.warn(`[Social alldl error (${platform})]:`, allErr.message);
    }

    // 2. Fallback to snapsave
    if (!resolvedCdnUrl && (platform === 'instagram' || platform === 'facebook')) {
      try {
        const snapRes = await snapsave(url);
        if (snapRes && snapRes.data && Array.isArray(snapRes.data.media) && snapRes.data.media.length > 0) {
          const topMedia = snapRes.data.media[0];
          resolvedCdnUrl = topMedia.url;
        }
      } catch (snapErr) {
        console.warn(`[Snapsave fallback warning (${platform})]:`, snapErr.message);
      }
    }

    if (!resolvedCdnUrl) {
      throw new Error(`Unable to resolve direct download stream for ${platform} link. The media might be private or region-locked.`);
    }

    const sanitizedTitle = title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const fileName = `${platform}_${sanitizedTitle}_${Date.now()}.${ext}`;

    const fetchRes = await this._fetchToBuffer(resolvedCdnUrl, maxSizeBytes, 35000);

    return this._packageResult({
      title,
      author,
      platform,
      format,
      buffer: fetchRes.buffer,
      mimetype: format === 'mp3' ? 'audio/mp4' : 'video/mp4',
      fileName,
      url,
    });
  }

  /**
   * Direct media URL downloader (.mp4, .mp3, etc.)
   */
  async _downloadDirectUrl(url, format, maxSizeBytes) {
    const fetchRes = await this._fetchToBuffer(url, maxSizeBytes, 35000);
    const parsedPath = new URL(url).pathname;
    const baseName = path.basename(parsedPath) || `media_${Date.now()}.${format}`;
    const cleanName = baseName.replace(/[\\/:*?"<>|]+/g, '_');

    return this._packageResult({
      title: cleanName,
      author: 'Direct Link',
      platform: 'direct',
      format,
      buffer: fetchRes.buffer,
      mimetype: fetchRes.contentType || (format === 'mp3' ? 'audio/mpeg' : 'video/mp4'),
      fileName: cleanName,
      url,
    });
  }

  /**
   * Package result: Check size threshold (<=16MB WhatsApp direct vs >16MB Web link)
   */
  _packageResult({ title, author, platform, format, buffer, mimetype, fileName, url }) {
    const sizeBytes = buffer ? buffer.length : 0;
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    const baseUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://raccon-v3q5.onrender.com';

    // If size <= 16MB: WhatsApp Direct Delivery
    if (sizeBytes <= this.whatsappLimitBytes) {
      return {
        ok: true,
        success: true,
        title,
        author,
        platform,
        format,
        buffer,
        mimetype,
        fileName,
        fileSizeBytes: sizeBytes,
        fileSizeMb: sizeMb,
        deliveryMode: 'whatsapp_direct',
        whatsappDirect: true,
        url,
      };
    }

    // If size > 16MB: Save to disk and generate high-speed web link
    const filePath = path.join(this.downloadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const jobUuid = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const downloadToken = `dl_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    createDownloadJob({
      jobUuid,
      url,
      sourcePlatform: platform,
      mediaType: format === 'mp3' ? 'audio' : 'video',
      requestedFormat: format,
      resolution: 'highest',
      downloadToken,
      expiresAt,
      status: 'ready',
    });

    updateDownloadJob(jobUuid, {
      file_path: filePath,
      file_name: fileName,
      file_size: sizeBytes,
      status: 'ready',
    });

    const directLink = `${baseUrl}/api/download/${downloadToken}`;

    return {
      ok: true,
      success: true,
      title,
      author,
      platform,
      format,
      buffer: null, // Don't hold large buffer in memory
      mimetype,
      fileName,
      fileSizeBytes: sizeBytes,
      fileSizeMb: sizeMb,
      deliveryMode: 'web_download_link',
      whatsappDirect: false,
      downloadToken,
      directLink,
      url,
    };
  }

  /**
   * Helper: Read readable stream into Buffer with timeout and ceiling
   */
  async _streamToBuffer(stream, maxBytes = 100 * 1024 * 1024, timeoutMs = 35000) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let totalLength = 0;
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error('Media stream download timed out.'));
      }, timeoutMs);

      stream.on('data', (chunk) => {
        totalLength += chunk.length;
        if (totalLength > maxBytes) {
          stream.destroy();
          clearTimeout(timer);
          reject(new Error(`Media exceeded size limit (${(maxBytes / (1024 * 1024)).toFixed(0)}MB)`));
          return;
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });

      stream.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Helper: Fetch URL directly into Buffer with timeout and headers
   */
  async _fetchToBuffer(url, maxBytes = 100 * 1024 * 1024, timeoutMs = 35000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
      });

      if (!res.ok) {
        throw new Error(`Media CDN returned HTTP ${res.status}`);
      }

      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      if (buf.length > maxBytes) {
        throw new Error(`Media exceeded size limit (${(maxBytes / (1024 * 1024)).toFixed(0)}MB)`);
      }

      return {
        buffer: buf,
        contentType: res.headers.get('content-type') || 'application/octet-stream',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Format a snappy Rocket message acknowledging the download
   */
  formatDownloadMessage(res, isSandy = true) {
    if (!res.ok) {
      return isSandy
        ? `Boss, download me issue aaya: ${res.error || 'Server error'}. Ek baar link check kar lo! 🚀`
        : `Download failed: ${res.error || 'Unknown error'}`;
    }

    const { title, format, fileSizeMb, deliveryMode, directLink } = res;
    const fmt = (format || 'mp4').toUpperCase();

    if (deliveryMode === 'web_download_link') {
      return isSandy
        ? `Boss, media high-resolution me hai (*${fileSizeMb} MB* > 16MB WhatsApp limit)! Direct high-speed download link nikaal diya hai:\n\n📥 *Direct Link:* ${directLink}\n\n(Link 24 hours ke liye valid hai) 🚀🎬`
        : `Download ready (${fileSizeMb} MB):\n📥 ${directLink}`;
    }

    return isSandy
      ? `Boss, ye lo! 🚀📥\n🎬 *${title}*\n⭐ Quality: Highest Available (${fmt})\n📦 Size: ${fileSizeMb} MB\nSidhi baat no bakwas, enjoy karo! 🦝🔥`
      : `🎬 *${title}* (${fmt}, ${fileSizeMb} MB)`;
  }

  /**
   * Legacy backward compatibility: Start download wizard
   */
  async startDownloadWizard(rawUrl, userId = 'sandy') {
    const extracted = this.extractMediaUrl(rawUrl);
    if (!extracted) {
      throw new Error('No valid media URL recognized.');
    }
    const { url, platform } = extracted;
    const jobUuid = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const downloadToken = `dl_token_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const job = createDownloadJob({
      jobUuid,
      url,
      sourcePlatform: platform,
      mediaType: 'video',
      requestedFormat: 'mp4',
      resolution: '720p',
      downloadToken,
      expiresAt,
      status: 'pending',
    });

    const promptMessage = `📥 *ROCKET MEDIA DOWNLOADER*\n──────────────────────────────\nI found a ${platform.toUpperCase()} media link!\n🔗 *URL:* ${url}\n\nReplying "download mp3" or "download mp4" will deliver the highest quality file directly! 🚀`;

    return { jobUuid, url, platform, promptMessage, job };
  }

  /**
   * Legacy backward compatibility: Execute download by job UUID
   */
  async executeDownload(jobUuid, { format = 'mp4', resolution = '720p' } = {}) {
    const job = getDownloadJob(jobUuid);
    if (!job) throw new Error(`Download job ${jobUuid} not found.`);

    const res = await this.downloadMedia({ url: job.url, format });
    return res;
  }

  /**
   * Retrieve file payload by secure download token
   */
  getDownloadByToken(token) {
    const job = getDownloadJobByToken(token);
    if (!job) return null;

    if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) {
      return { expired: true, job };
    }

    return {
      expired: false,
      job,
      filePath: job.file_path,
      fileName: job.file_name,
    };
  }

  /**
   * Cleanup expired downloads to prevent disk bloating
   */
  cleanExpiredDownloads() {
    const jobs = listDownloadJobs(100);
    const now = Date.now();
    let cleaned = 0;

    for (const job of jobs) {
      if (job.expires_at && new Date(job.expires_at).getTime() < now) {
        if (job.file_path && fs.existsSync(job.file_path)) {
          try {
            fs.unlinkSync(job.file_path);
            cleaned++;
          } catch {
            // Ignore deletion error
          }
        }
      }
    }
    return { cleaned };
  }
}

export const mediaDownloaderService = new MediaDownloaderService();

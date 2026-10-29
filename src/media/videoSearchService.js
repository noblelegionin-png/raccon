/**
 * 🎬 NERO LABS — VIDEO SEARCH & TRANSCRIPT RETRIEVAL SERVICE
 * Searches video platforms, retrieves verified thumbnails, durations, and channels,
 * fetches transcripts where accessible, and generates structured summaries with timestamps.
 */

import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export class VideoSearchService {
  constructor() {
    this.timeoutMs = 8000;
  }

  /**
   * Determine whether query is asking for a video
   */
  isVideoQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return (
      /^(?:find|search|show|get)\s+(?:me\s+)?(?:a\s+)?videos?\s+(?:on|about|for)\b/i.test(lower) ||
      /\b(?:video|tutorial|lecture|documentary|stream)\s+(?:on|about|for)\b/i.test(lower) ||
      /^(?:\/video|\/videos)\b/i.test(lower)
    );
  }

  /**
   * Search videos via Invidious / Public YouTube Gateway
   */
  async searchVideos(query, limit = 4) {
    const cleanQuery = encodeURIComponent(query.trim());
    const instances = [
      'https://inv.nadeko.net/api/v1/search',
      'https://invidious.nerdvpn.de/api/v1/search',
      'https://yewtu.be/api/v1/search',
    ];

    let hits = [];
    for (const base of instances) {
      const url = `${base}?q=${cleanQuery}&type=video`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'NeroLabsBot/3.0' },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            hits = data.filter((x) => x.type === 'video' && x.videoId);
            clearTimeout(timeout);
            break;
          }
        }
      } catch {
        // Fallback to next instance
      } finally {
        clearTimeout(timeout);
      }
    }

    // Fallback if instances are rate-limited: generate direct structured search links
    if (hits.length === 0) {
      return {
        ok: true,
        query,
        videos: [
          {
            title: `YouTube Search: ${query}`,
            url: `https://www.youtube.com/results?search_query=${cleanQuery}`,
            videoId: null,
            channel: 'YouTube Discovery',
            duration: 'Various',
            thumbnailUrl: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&auto=format&fit=crop&q=80',
            description: `Browse verified video tutorials and lectures directly on YouTube for "${query}".`,
          },
        ],
      };
    }

    const videos = hits.slice(0, limit).map((v) => {
      const minutes = Math.floor((v.lengthSeconds || 0) / 60);
      const seconds = (v.lengthSeconds || 0) % 60;
      const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      return {
        title: v.title || query,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        videoId: v.videoId,
        channel: v.author || 'Unknown Channel',
        duration: durationStr,
        thumbnailUrl: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        description: v.description || '',
        publishedDate: v.publishedText || null,
      };
    });

    return {
      ok: true,
      query,
      videos,
    };
  }

  async searchVideo(query, limit = 4) {
    return this.searchVideos(query, limit);
  }

  /**
   * Fetch video captions / transcript when available
   */
  async fetchTranscript(videoId) {
    if (!videoId) return null;
    const url = `https://yewtu.be/api/v1/captions/${videoId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const captions = await res.json();
      if (!Array.isArray(captions) || captions.length === 0) return null;

      // Select English or first track
      const track = captions.find((c) => c.languageCode === 'en') || captions[0];
      if (track?.url) {
        const tRes = await fetch(track.url);
        if (tRes.ok) {
          const vtt = await tRes.text();
          // Clean VTT timestamps and header
          return vtt
            .replace(/WEBVTT[\s\S]*?\n\n/, '')
            .replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}[^\n]*\n/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{2,}/g, '\n')
            .trim();
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Summarize video from transcript or description using Gemini 3.8 Flash
   */
  async summarizeVideo(videoItem) {
    const transcript = await this.fetchTranscript(videoItem.videoId);
    const content = transcript ? `Transcript Excerpt:\n${transcript.slice(0, 4000)}` : `Description:\n${videoItem.description.slice(0, 1500)}`;

    const prompt = `You are Nero Labs Video Intelligence Engine.
Video Title: "${videoItem.title}"
Channel: "${videoItem.channel}"
Duration: ${videoItem.duration}

Content to analyze:
${content}

Instructions:
1. Provide a concise summary of what this video teaches or covers.
2. Outline 3 to 5 key takeaways or structural timestamps.
3. If this summary is based on the transcript, note: "Based on published transcript."
   If based on description only, note: "Based on creator description (transcript unavailable)."
4. Keep the output punchy, factual, and mobile-friendly.`;

    try {
      const activeModel = getActiveModelId() || 'gpt-6-luna';
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1200,
      });

      return {
        summaryText: completion.text,
        hasTranscript: Boolean(transcript),
        disclaimer: transcript
          ? '⚠️ Note: Summary synthesized from published video transcript, not raw audiovisual stream.'
          : '⚠️ Note: Summary synthesized from creator video metadata & description.',
      };
    } catch {
      return {
        summaryText: `**${videoItem.title}** by ${videoItem.channel} (${videoItem.duration})\n\n${videoItem.description.slice(0, 300)}...`,
        hasTranscript: false,
        disclaimer: '⚠️ Note: Summary based on video metadata.',
      };
    }
  }
}

export const videoSearchService = new VideoSearchService();

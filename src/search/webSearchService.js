/**
 * 🌐 NERO LABS — ADVANCED WEB SEARCH SERVICE
 * Multi-query, snippet extraction, real source citations, and iterative search.
 * Zero fabricated citations, bounded timeouts, and strict error handling.
 */

import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export class WebSearchService {
  constructor() {
    this.timeoutMs = 8000;
    this.cache = new Map();
    this.maxCacheAgeMs = 15 * 60 * 1000; // 15 mins cache
  }

  /**
   * Determine whether query is a web search request
   */
  isSearchQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return (
      /^(?:search|look\s*up|google|find)\s+(?:the\s+web\s+for|on\s+the\s+web|online|about|for)\b/i.test(lower) ||
      /\b(?:search\s+the\s+web|web\s+search)\b/i.test(lower) ||
      /^(?:\/search|\/websearch)\b/i.test(lower)
    );
  }

  /**
   * Clean HTML tags and decode entities
   */
  sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Search Wikipedia for factual topics
   */
  async searchWikipedia(query, limit = 5) {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${cleanQuery}&utf8=1&format=json&srlimit=${limit}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'NeroLabsBot/3.0 (https://nerolabs.ai; bot@nerolabs.ai)' },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const hits = data?.query?.search || [];

      return hits.map((hit) => ({
        title: hit.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/\s+/g, '_'))}`,
        snippet: this.sanitizeText(hit.snippet),
        source: 'Wikipedia',
        publishedDate: hit.timestamp ? hit.timestamp.split('T')[0] : null,
      }));
    } catch (err) {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Search DuckDuckGo Instant Answer API
   */
  async searchDuckDuckGoApi(query) {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://api.duckduckgo.com/?q=${cleanQuery}&format=json&no_html=1&skip_disambig=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'NeroLabsBot/3.0' },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const results = [];

      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
          source: data.AbstractSource || 'DuckDuckGo Instant Answer',
          publishedDate: null,
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 4)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.slice(0, 60) + '...',
              url: topic.FirstURL,
              snippet: topic.Text,
              source: 'DuckDuckGo Reference',
              publishedDate: null,
            });
          }
        }
      }

      return results;
    } catch (err) {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Search DuckDuckGo HTML for general web pages
   */
  async searchDuckDuckGoHtml(query, limit = 6) {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://html.duckduckgo.com/html/?q=${cleanQuery}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
      });

      if (!res.ok) return [];
      const html = await res.text();
      const results = [];

      // Extract results using regex
      const resultBlocks = html.split(/class="result\s+results_links/i).slice(1);

      for (const block of resultBlocks.slice(0, limit + 4)) {
        // Extract Title and URL
        const titleMatch = block.match(/<a class="result__snippet[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
                           block.match(/<a class="result__url[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
                           block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

        // Extract Snippet
        const snippetMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/i) ||
                             block.match(/<div class="result__snippet[^>]*>([\s\S]*?)<\/div>/i);

        if (titleMatch) {
          let rawUrl = titleMatch[1];
          // DuckDuckGo redirects through uddg= param
          if (rawUrl.includes('uddg=')) {
            const uddg = rawUrl.match(/uddg=([^&]+)/);
            if (uddg) rawUrl = decodeURIComponent(uddg[1]);
          }

          // Filter out sponsored ad redirects and tracking pixels
          if (rawUrl.includes('/y.js?') || rawUrl.includes('ad_provider') || rawUrl.includes('aclick?')) {
            continue;
          }

          if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
            const title = this.sanitizeText(titleMatch[2]);
            const snippet = snippetMatch ? this.sanitizeText(snippetMatch[1]) : '';

            results.push({
              title: title || 'Web Page',
              url: rawUrl,
              snippet: snippet,
              source: new URL(rawUrl).hostname.replace(/^www\./, ''),
              publishedDate: null,
            });
            if (results.length >= limit) break;
          }
        }
      }

      return results;
    } catch (err) {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Execute multi-query aggregated search with deduplication
   */
  async search(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return { ok: false, error: 'Search query cannot be empty.', results: [] };
    }

    const q = query.trim();
    const cacheKey = `search_${q.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.maxCacheAgeMs) {
      return { ok: true, cached: true, ...cached.data };
    }

    const limit = options.limit || 8;
    const isRecent = options.recent || /latest|today|recent|2026|news/i.test(q);

    // Parallel search across Wikipedia, DuckDuckGo API, and HTML
    const [wikiHits, ddgApiHits, ddgHtmlHits] = await Promise.all([
      this.searchWikipedia(q, 3),
      this.searchDuckDuckGoApi(q),
      this.searchDuckDuckGoHtml(q, 6),
    ]);

    const combined = [...wikiHits, ...ddgApiHits, ...ddgHtmlHits];

    // Deduplicate by URL
    const seenUrls = new Set();
    const deduped = [];
    for (const item of combined) {
      if (!item.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      deduped.push(item);
      if (deduped.length >= limit) break;
    }

    const resultPayload = {
      query: q,
      totalResults: deduped.length,
      isRecentSearch: isRecent,
      results: deduped,
    };

    this.cache.set(cacheKey, { timestamp: Date.now(), data: resultPayload });

    return { ok: true, cached: false, ...resultPayload };
  }

  /**
   * Synthesize search results using Gemini 3.8 Flash with grounded citations
   */
  async synthesizeAnswer(userQuery, searchData) {
    if (!searchData || !searchData.results || searchData.results.length === 0) {
      return {
        answer: `I conducted a web search for "${userQuery}", but could not find accessible public sources matching that specific query. Please try rephrasing your search keywords.`,
        sources: [],
      };
    }

    const contextSnippets = searchData.results.map((r, i) => `[Source ${i + 1}]: "${r.title}"\nURL: ${r.url}\nExcerpt: ${r.snippet}\nPublisher: ${r.source}`).join('\n\n');

    const prompt = `You are Nero Labs Web Research Engine. A user asked: "${userQuery}".
Here are the verified live search results:
${contextSnippets}

Instructions:
1. Provide a direct, factual, and comprehensive answer to the user's question based ONLY on the verified results above.
2. Every significant fact or claim MUST cite the corresponding source in markdown link format, e.g. [Source Name](URL).
3. If the results contain conflicting claims or incomplete data, explicitly communicate the uncertainty.
4. Do NOT invent URLs or fabricate claims not present in the search excerpts.
5. Keep the tone helpful, natural, and objective.`;

    try {
      const activeModel = getActiveModelId() || 'gemini-3.8-flash';
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      });

      return {
        answer: completion.text || 'Unable to synthesize search results.',
        sources: searchData.results.slice(0, 5),
        model: completion.model,
      };
    } catch (err) {
      // Fallback synthesis if model is temporarily unavailable
      const topResults = searchData.results.slice(0, 4);
      let fallbackText = `Here is what I found for **"${userQuery}"**:\n\n`;
      for (const r of topResults) {
        fallbackText += `• **[${r.title}](${r.url})**\n  ${r.snippet}\n\n`;
      }
      return {
        answer: fallbackText.trim(),
        sources: topResults,
        fallback: true,
      };
    }
  }
}

export const webSearchService = new WebSearchService();

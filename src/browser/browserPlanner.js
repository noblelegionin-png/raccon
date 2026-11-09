/**
 * Rocket Browser Link — Natural-Language Execution Engine
 * Converts natural user instructions (single-word shortcuts or complex conversational requests)
 * into sequential, validated browser action plans and coordinates execution.
 */

import { ACTION_REGISTRY, validateAction } from './actionRegistry.js';
import { browserLinkServer } from './browserLinkServer.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { addDurableMemory } from '../db/index.js';

export class BrowserPlanner {
  /**
   * Determine if an incoming user prompt is meant for browser control
   */
  isBrowserInstruction(text, options = {}) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim().toLowerCase();

    // 1. Direct single-word or short action matches
    if (/^(youtube|yt|twitter|x\.com|x|github|reddit|twitch|discord|netflix|google|amazon|wikipedia|chatgpt|spotify|instagram|facebook)$/i.test(clean)) return true;
    if (/^(back|forward|reload|refresh|stop|clean|clean tabs|zoom in|zoom out|zoom reset|reset zoom|copy|logout|fullscreen|downloads|history|bookmarks|tabs|close tab|close|new tab|duplicate|pause|resume|unpause|mute|unmute)$/i.test(clean)) return true;

    // 2. Playback / media actions (Music, YouTube, Video, Song, Streaming)
    if (/^(?:play|watch|listen(?:\s+to)?|stream|hear)\b/i.test(clean)) return true;
    if (/\b(?:youtube|yt|video|song|music|track|playlist)\b/i.test(clean) && /\b(?:play|open|search|start|watch|listen|pause|resume|next|previous)\b/i.test(clean)) return true;

    // 3. Ordinal clicks / selections (e.g. "open the third result", "click 1st video", "choose second one", "3rd result", "first link")
    if (/^(?:(?:open|click|play|choose|select|go to|view)\s+(?:the\s+)?)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|\d+)(?:st|nd|rd|th)?(?:\s+(?:result|video|link|item|one|tab))?$/i.test(clean)) return true;

    // 4. URLs, domain names, localhost, web addresses
    if (/(?:https?:\/\/|www\.)\S+/i.test(clean)) return true;
    if (/\b[a-z0-9-]+\.(?:com|org|net|io|dev|app|co|in|edu|gov|ai)\b/i.test(clean)) return true;
    if (/\b(?:localhost|127\.0\.0\.1)(?::\d+)?\b/i.test(clean)) return true;

    // 5. Multi-turn follow-ups (if recent conversation or browser state shows active browsing session)
    const hasRecentBrowserContext = Boolean(options.hasRecentBrowserContext || options.recentBrowserAction);
    if (hasRecentBrowserContext) {
      if (/^(click|tap|press|select|open|choose|scroll|zoom|copy|summarize|read|search|find|next|previous|third|first|second|last|it|that|this|pause|resume|play|more)\b/i.test(clean)) {
        return true;
      }
    }

    // 6. Explicit browser and PC action commands
    const browserKeywords = /\b(browser|opera|opera gx|tab|tabs|window|windows|webpage|web page|website|site|url|link|zoom|download|downloads|scroll|search for|google|youtube|click|type|fill|form|logout|sign out|history|bookmark|bookmarks|clipboard|screen|page|video|song|audio|stream)\b/i;
    const actionVerbs = /\b(open|close|navigate|goto|go to|visit|switch|duplicate|pin|clean|zoom|read|extract|copy|compare|research|remember|download|click|search|type|find|look up|check out|summarize|scroll|inspect|play|watch|pause|resume|stream)\b/i;

    if (browserKeywords.test(clean) && actionVerbs.test(clean)) return true;

    // 7. Direct command phrases
    if (/^(?:open|navigate(?:\s+to)?|go\s+to|goto|visit|search(?:\s+for)?|google|look\s+up|research|download|compare|zoom|scroll|click(?:\s+on)?|type|play|watch)\s+/i.test(clean)) return true;

    return false;
  }

  /**
   * Plan and execute a natural language user instruction
   */
  async planAndExecute(userPrompt, options = {}) {
    const raw = (userPrompt || '').trim();
    if (!raw) throw new Error('Prompt cannot be empty.');

    // Step 1: Check fast path for 1-word or common short instructions
    const fastPlan = this.parseFastPath(raw);
    let plan = fastPlan;

    // Step 2: If complex or multi-step, use Luna (GPT-6 Luna) to generate structured plan with full context
    if (!plan) {
      plan = await this.generatePlanWithLuna(raw, options);
    }

    if (!plan || plan.length === 0) {
      throw new Error(`Could not determine browser action plan for: "${raw}". Try describing the browser step specifically.`);
    }

    // Step 3: Execute sequential plan
    const executionResults = [];
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      const validated = validateAction(step.action, step.params || {});

      // Send progress callback if provided
      if (typeof options.onStepStart === 'function') {
        options.onStepStart(i + 1, plan.length, validated.description);
      }

      // Execute via Browser Link Server
      const result = await browserLinkServer.dispatchAction(validated.action, validated.params, {
        confirmed: options.confirmed || false,
      });

      // Keep server page state up to date for next conversational steps
      browserLinkServer.recordState(validated.action, result);

      executionResults.push({
        step: i + 1,
        action: validated.action,
        description: validated.description,
        result,
      });

      // Special post-processing for "remember"
      if (step.action === 'page_read' && (options.isRemember || /remember|save/i.test(raw))) {
        if (result && result.title && options.chatId) {
          try {
            addDurableMemory(options.chatId, 'browser_saved_page', result.title, `${result.title} (${result.url}): ${result.content.slice(0, 300)}`);
          } catch {}
        }
      }

      // Allow extra settling delay when opening tabs or navigating before interacting with the DOM
      if (i < plan.length - 1) {
        const nextStep = plan[i + 1];
        const delay = (step.action === 'tab_open' || step.action === 'navigate') && nextStep?.action?.startsWith('page_') ? 1200 : 600;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    return {
      prompt: raw,
      stepsExecuted: executionResults.length,
      results: executionResults,
    };
  }

  /**
   * Fast-path deterministic parsing for high-frequency short commands
   */
  parseFastPath(text) {
    const clean = text.toLowerCase().trim();

    // 1-word URL destinations
    if (clean === 'youtube' || clean === 'yt') return [{ action: 'tab_open', params: { url: 'https://youtube.com' } }];
    if (clean === 'github') return [{ action: 'tab_open', params: { url: 'https://github.com' } }];
    if (clean === 'google') return [{ action: 'tab_open', params: { url: 'https://google.com' } }];
    if (clean === 'reddit') return [{ action: 'tab_open', params: { url: 'https://reddit.com' } }];
    if (clean === 'twitter' || clean === 'x') return [{ action: 'tab_open', params: { url: 'https://x.com' } }];
    if (clean === 'discord') return [{ action: 'tab_open', params: { url: 'https://discord.com' } }];
    if (clean === 'spotify') return [{ action: 'tab_open', params: { url: 'https://open.spotify.com' } }];

    // Navigation
    if (clean === 'back') return [{ action: 'navigate_back', params: {} }];
    if (clean === 'forward') return [{ action: 'navigate_forward', params: {} }];
    if (clean === 'reload' || clean === 'refresh') return [{ action: 'reload', params: {} }];
    if (clean === 'stop') return [{ action: 'stop', params: {} }];

    // Zoom
    if (clean === 'zoom out') return [{ action: 'zoom_out', params: { step: 0.1 } }];
    if (clean === 'zoom in') return [{ action: 'zoom_in', params: { step: 0.1 } }];
    if (clean === 'zoom reset' || clean === 'reset zoom') return [{ action: 'zoom_reset', params: {} }];

    // Tabs
    if (clean === 'clean' || clean === 'clean tabs') return [{ action: 'tabs_clean', params: {} }];
    if (clean === 'tabs' || clean === 'tab list' || clean === 'list tabs') return [{ action: 'tab_list', params: {} }];
    if (clean === 'close' || clean === 'close tab') return [{ action: 'tab_close', params: {} }];
    if (clean === 'duplicate' || clean === 'duplicate tab') return [{ action: 'tab_duplicate', params: {} }];

    // Media Controls
    if (/^(?:pause|pause\s+video|pause\s+music|stop\s+music|stop\s+playback)$/i.test(clean)) {
      return [{ action: 'page_click', params: { selector: 'button.ytp-play-button, video, #movie_player, .video-stream' } }];
    }
    if (/^(?:resume|unpause|continue|play\s+video|start\s+playback)$/i.test(clean)) {
      return [{ action: 'page_click', params: { selector: 'button.ytp-play-button, video, #movie_player, .video-stream' } }];
    }
    if (/^(?:mute|unmute)$/i.test(clean)) {
      return [{ action: 'page_click', params: { selector: 'button.ytp-mute-button' } }];
    }

    // YouTube / Song Playback (e.g., "Play rock roll song", "Play any Indian music love song in youtube", "watch lofi hip hop")
    const playMatch = (text || '').trim().match(/^(?:play|watch|listen(?:\s+to)?|stream)\s+(.+)$/i);
    if (playMatch) {
      let query = playMatch[1].trim();
      query = query.replace(/\s+(?:in|on)\s+(?:youtube|yt)$/i, '').trim();
      return [
        { action: 'tab_open', params: { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` } },
        { action: 'page_click', params: { selector: 'ytd-video-renderer a#video-title, #contents ytd-video-renderer a#thumbnail, a#video-title, a[href*="watch?v="]' } },
      ];
    }

    // Ordinal selection: "open the third result", "click 1st video", "open 2nd result", "play 3rd video", "third result"
    const ordinalMatch = clean.match(/^(?:(?:open|click|play|choose|select|go\s+to|view)\s+(?:the\s+)?)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|\d+)(?:st|nd|rd|th)?(?:\s+(?:result|video|link|item|one))?$/i);
    if (ordinalMatch) {
      const wordMap = {
        first: 1, '1st': 1,
        second: 2, '2nd': 2,
        third: 3, '3rd': 3,
        fourth: 4, '4th': 4,
        fifth: 5, '5th': 5,
        sixth: 6, '6th': 6,
        seventh: 7, '7th': 7,
        eighth: 8, '8th': 8,
        ninth: 9, '9th': 9,
        tenth: 10, '10th': 10,
      };
      const token = ordinalMatch[1].toLowerCase();
      const n = wordMap[token] || parseInt(token, 10) || 1;
      return [
        {
          action: 'page_click',
          params: {
            selector: `ytd-video-renderer:nth-of-type(${n}) a#video-title, #contents > ytd-video-renderer:nth-of-type(${n}) a#thumbnail, div.g:nth-of-type(${n}) a, a:has(h3):nth-of-type(${n}), a[href*="watch?v="]:nth-of-type(${n})`,
          },
        },
      ];
    }

    // Content
    if (clean === 'copy') return [{ action: 'page_select_copy', params: {} }];
    if (clean === 'read' || clean === 'read page' || clean === 'summarize') return [{ action: 'page_read', params: {} }];
    if (clean === 'fullscreen') return [{ action: 'window_fullscreen', params: {} }];
    if (clean === 'downloads' || clean === 'download') return [{ action: 'downloads_list', params: {} }];
    if (clean === 'history') return [{ action: 'history_search', params: { limit: 10 } }];
    if (clean === 'logout') return [{ action: 'logout_request', params: {} }];

    // "Search for <query>" or "Google <query>"
    const searchMatch = (text || '').trim().match(/^(?:search(?:\s+for)?|google|look\s+up)\s+(.+)$/i);
    if (searchMatch) {
      const q = searchMatch[1].trim();
      return [{ action: 'tab_open', params: { url: `https://www.google.com/search?q=${encodeURIComponent(q)}` } }];
    }

    // "Research <topic>"
    const researchMatch = (text || '').trim().match(/^research\s+(.+)$/i);
    if (researchMatch) {
      const topic = researchMatch[1].trim();
      return [
        { action: 'tab_open', params: { url: `https://www.google.com/search?q=${encodeURIComponent(topic)}` } },
        { action: 'page_read', params: { maxLength: 2000 } },
      ];
    }

    // "Open <url/site>"
    const openMatch = clean.match(/^open\s+([a-z0-9_.-]+(?:\.[a-z]{2,})?)$/i);
    if (openMatch) {
      let target = openMatch[1];
      if (!target.includes('.')) target = `${target}.com`;
      return [{ action: 'tab_open', params: { url: `https://${target}` } }];
    }

    return null;
  }

  /**
   * Complex conversational planning using Luna (ScaleMax GPT-6 Luna)
   * With full multi-turn conversational memory and live browser state awareness.
   */
  async generatePlanWithLuna(userPrompt, options = {}) {
    if (!scaleMaxAdapter.isConfigured()) {
      // Fallback simple search navigation
      return [{ action: 'navigate', params: { url: userPrompt } }];
    }

    const availableActions = Object.keys(ACTION_REGISTRY).join(', ');
    const browserState = options.browserState || browserLinkServer.getLastKnownState();
    const recentHistory = options.recentHistory || [];

    let contextString = '';
    if (browserState && (browserState.currentUrl || browserState.currentTitle)) {
      contextString += `\nCURRENT BROWSER STATE:\n- Active URL: ${browserState.currentUrl || 'unknown'}\n- Page Title: ${browserState.currentTitle || 'unknown'}\n- Last Action: ${browserState.lastAction || 'none'}\n`;
    }

    if (recentHistory.length > 0) {
      contextString += `\nRECENT CONVERSATION HISTORY:\n` +
        recentHistory.slice(-5).map(m => `- ${m.role === 'user' ? 'User' : 'Rocket'}: ${m.content}`).join('\n') + '\n';
    }

    const systemPrompt =
      `You are the Rocket Browser Action Planner. Convert user browser/PC instructions into an executable JSON action sequence.\n` +
      `Allowed actions: ${availableActions}.\n` +
      `Output ONLY a valid JSON array of objects: [{"action": "...", "params": {...}}].\n` +
      `Example 1: "Open YouTube and search for Minecraft shaders"\n` +
      `-> [{"action": "tab_open", "params": {"url": "https://youtube.com"}}, {"action": "page_type", "params": {"text": "Minecraft shaders", "submit": true}}]\n` +
      `Example 2: "open the third result"\n` +
      `-> [{"action": "page_click", "params": {"selector": "ytd-video-renderer:nth-of-type(3) a#video-title, #contents ytd-video-renderer:nth-of-type(3) a#thumbnail, a:has(h3):nth-of-type(3), a:nth-of-type(3)"}}]\n` +
      `Example 3: "zoom in and copy description"\n` +
      `-> [{"action": "zoom_in", "params": {"step": 0.1}}, {"action": "page_select_copy", "params": {"selector": "#description, .description, p"}}]\n` +
      `Example 4: "scroll down"\n` +
      `-> [{"action": "page_scroll", "params": {"direction": "down", "amount": 500}}]\n` +
      `Example 5: "play rock roll song"\n` +
      `-> [{"action": "tab_open", "params": {"url": "https://www.youtube.com/results?search_query=rock+roll+song"}}, {"action": "page_click", "params": {"selector": "ytd-video-renderer a#video-title, a#video-title"}}]\n` +
      `${contextString}\n` +
      `Strict rules: NO conversational text, NO markdown code fences, ONLY the raw JSON array. Keep to 1-5 steps max. Understand context from previous turns and the current browser state!`;

    try {
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gpt-6-luna',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 1000,
        temperature: 0.1,
        reasoningEffort: 'none',
        timeoutMs: 25000,
      });

      let text = (completion.choices?.[0]?.message?.content || '').trim();
      // Robust JSON array regex extraction
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }

      // Single object fallback
      const objMatch = text.match(/\{\s*"action"\s*:\s*"[^"]+"[\s\S]*?\}/);
      if (objMatch) {
        const singleObj = JSON.parse(objMatch[0]);
        if (singleObj && singleObj.action) return [singleObj];
      }
    } catch (err) {
      console.warn('[BrowserPlanner] Luna planning fallback:', err.message);
    }

    // Fallback: Default to navigation search
    return [{ action: 'navigate', params: { url: userPrompt } }];
  }
}

export const browserPlanner = new BrowserPlanner();

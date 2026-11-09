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
  isBrowserInstruction(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim().toLowerCase();

    // Direct single-word or short action matches
    if (/^(youtube|yt|twitter|x\.com|github|reddit|twitch|discord|netflix)$/i.test(clean)) return true;
    if (/^(back|forward|reload|refresh|stop|clean|clean tabs|zoom in|zoom out|zoom reset|copy|logout|fullscreen|downloads|history|bookmarks)$/i.test(clean)) return true;

    // Conversational trigger verbs & browser targets
    const browserKeywords = /\b(browser|opera|tab|tabs|webpage|website|url|link|zoom|download|scroll|search for|google|youtube|click|type|fill|form|logout|sign out)\b/i;
    const actionVerbs = /\b(open|close|navigate|switch|duplicate|pin|clean|zoom|read|extract|copy|compare|research|remember|download|click|search|type|find)\b/i;

    return browserKeywords.test(clean) && actionVerbs.test(clean);
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

    // Step 2: If complex or multi-step, use Luna (GPT-6 Luna) to generate structured plan
    if (!plan) {
      plan = await this.generatePlanWithLuna(raw);
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

      // Brief delay between sequential steps to allow DOM/navigation settling
      if (i < plan.length - 1) {
        await new Promise((r) => setTimeout(r, 600));
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

    // Content
    if (clean === 'copy') return [{ action: 'page_select_copy', params: {} }];
    if (clean === 'read' || clean === 'read page' || clean === 'summarize') return [{ action: 'page_read', params: {} }];
    if (clean === 'fullscreen') return [{ action: 'window_fullscreen', params: {} }];
    if (clean === 'downloads' || clean === 'download') return [{ action: 'downloads_list', params: {} }];
    if (clean === 'history') return [{ action: 'history_search', params: { limit: 10 } }];
    if (clean === 'logout') return [{ action: 'logout_request', params: {} }];

    // "Research <topic>"
    const researchMatch = clean.match(/^research\s+(.+)$/i);
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
   * Strictly capped to 500 tokens budget
   */
  async generatePlanWithLuna(userPrompt) {
    if (!scaleMaxAdapter.isConfigured()) {
      // Fallback simple search navigation
      return [{ action: 'navigate', params: { url: userPrompt } }];
    }

    const availableActions = Object.keys(ACTION_REGISTRY).join(', ');
    const systemPrompt =
      `You are the Rocket Browser Action Planner. Convert user browser/PC instructions into an executable JSON action sequence.\n` +
      `Allowed actions: ${availableActions}.\n` +
      `Output ONLY a valid JSON array of objects: [{"action": "...", "params": {...}}].\n` +
      `Example: "Open YouTube and search for Minecraft shaders"\n` +
      `-> [{"action": "tab_open", "params": {"url": "https://youtube.com"}}, {"action": "page_type", "params": {"text": "Minecraft shaders", "submit": true}}]\n` +
      `Strict rules: NO conversational text, NO markdown code fences, ONLY the raw JSON array. Keep to 1-5 steps max.`;

    try {
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: 'gpt-6-luna',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 500,
        temperature: 0.1,
      });

      let text = (completion.choices?.[0]?.message?.content || '').trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      console.warn('[BrowserPlanner] Luna planning fallback:', err.message);
    }

    // Fallback: Default to navigation search
    return [{ action: 'navigate', params: { url: userPrompt } }];
  }
}

export const browserPlanner = new BrowserPlanner();

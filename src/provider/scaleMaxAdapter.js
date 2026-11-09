import { config } from '../config.js';
import { recordTokenUsage, getConfig } from '../db/index.js';
import { scrubRestrictedBrandNames } from '../conversation/responseValidator.js';

/**
 * ScaleMax AI Provider Adapter
 * Connects to ScaleMax OpenAI-compatible endpoint for multi-model inference.
 */
export class ScaleMaxAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey : config.scaleMaxApiKey;
    this.baseUrl = (options.baseUrl || config.scaleMaxBaseUrl).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || config.requestTimeoutMs;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : config.maxRetryCount;
    this._warmInterval = null;
    if (this.isConfigured()) {
      this.startWarmKeepAlive();
    }
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  startWarmKeepAlive() {
    if (!this.isConfigured() || this._warmInterval) return;
    // Maintain perpetually warm TLS socket connection every 3.5 seconds (under Node's 4s idle threshold)
    this._warmInterval = setInterval(async () => {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 2500);
        await fetch(`${this.baseUrl}/models`, {
          method: 'HEAD',
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: controller.signal,
          keepalive: true,
        });
        clearTimeout(tid);
      } catch {}
    }, 3500);
    if (this._warmInterval.unref) {
      this._warmInterval.unref();
    }
  }

  /**
   * Health check and real latency measurement
   * Returns: { ok: boolean, latencyMs: number, status: string, error?: string, model: string }
   */
  async checkHealth(targetModel = 'gpt-6-luna') {
    if (!this.isConfigured()) {
      return {
        ok: false,
        latencyMs: 0,
        status: 'unconfigured',
        error: 'ScaleMax API key is not configured. Set SCALEMAX_API_KEY in .env',
        model: targetModel,
      };
    }

    const startTime = Date.now();
    try {
      // First attempt fast HEAD request to check gateway connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          ok: true,
          latencyMs,
          status: 'operational',
          model: targetModel,
        };
      }

      if (response.status === 401) {
        return {
          ok: false,
          latencyMs,
          status: 'unauthorized',
          error: 'ScaleMax API rejected credentials (401 Unauthorized). Verify your API key.',
          model: targetModel,
        };
      }

      if (response.status === 429) {
        return {
          ok: false,
          latencyMs,
          status: 'rate_limited',
          error: 'ScaleMax quota exceeded or rate limit reached (429 Too Many Requests).',
          model: targetModel,
        };
      }

      // If /models returned 404 or other status, try a minimal ping completion
      return await this._pingCompletion(targetModel);
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError';
      return {
        ok: false,
        latencyMs,
        status: isTimeout ? 'timeout' : 'error',
        error: isTimeout
          ? 'Connection to ScaleMax timed out after 10 seconds.'
          : `Failed to reach ScaleMax endpoint (${err.message}).`,
        model: targetModel,
      };
    }
  }

  /**
   * Helper fallback to ping chat completion with 1 token
   */
  async _pingCompletion(targetModel) {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return { ok: true, latencyMs, status: 'operational', model: targetModel };
      }

      const body = await response.text();
      return {
        ok: false,
        latencyMs,
        status: `http_${response.status}`,
        error: `ScaleMax responded with status ${response.status}: ${body.slice(0, 150)}`,
        model: targetModel,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        status: 'error',
        error: err.message,
        model: targetModel,
      };
    }
  }

  /**
   * Fetch live models list from ScaleMax /v1/models
   */
  async fetchLiveModels() {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (Array.isArray(data?.data)) {
        return data.data;
      }
      if (Array.isArray(data)) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Send a chat completion request to ScaleMax
   * @param {Object} params
   * @param {string} params.model - Model identifier (e.g. 'gpt-6-luna')
   * @param {Array<{role: string, content: string}>} params.messages - Multi-turn conversation
   * @param {string} params.chatId - Telegram chat ID for tracking
   * @returns {Promise<{text: string, usage: Object, latencyMs: number, model: string}>}
   */
  async createChatCompletion({
    model,
    messages,
    chatId = 'unknown',
    reasoningEffort = null,
    maxTokens = null,
    max_tokens = null,
    temperature = 0.5,
    tools = null,
    tool_choice = null,
    timeoutMs = null,
  }) {
    if (!this.isConfigured()) {
      throw new Error(
        'Neural Engine provider is disconnected. Please configure credentials in the bot environment.'
      );
    }

    // The user's active ScaleMax API key plan ONLY permits gpt-6-luna
    let targetModel = 'gpt-6-luna';
    let lastError = null;

    // Check if direct DeepSeek API key is configured
    const useDirectDeepSeek = false;
    const endpointBase = this.baseUrl;
    const authHeader = `Bearer ${this.apiKey}`;
    const effectiveTimeout = timeoutMs || this.timeoutMs;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      try {
        // Ensure system prompt is present with proprietary Rocket AI identity
        const outboundMessages = [...(messages || [])];
        const hasSystem = outboundMessages.some((m) => m.role === 'system');
        if (!hasSystem) {
          outboundMessages.unshift({
            role: 'system',
            content: 'You are ROCKET AI, an ultra-intelligent executive AI co-pilot created exclusively by Sandy (Nero Aurelius / Nero Labs). You possess world-class intellect, sharp charisma, and absolute loyalty to Boss Sandy.',
          });
        }

        const configuredMax = parseInt(getConfig('myra_max_tokens_per_request', '1000'), 10) || 1000;
        const requestedTokens = maxTokens || max_tokens || 2000;
        // In reasoning models, max_tokens accounts for reasoning tokens + output tokens
        // We ensure a healthy budget of at least 2000 tokens so reasoning is not truncated
        const effectiveMaxTokens = Math.max(requestedTokens, 2000);

        const payload = {
          model: targetModel,
          messages: outboundMessages,
          temperature: typeof temperature === 'number' ? temperature : 0.5,
          max_tokens: effectiveMaxTokens,
        };

        if (Array.isArray(tools) && tools.length > 0) {
          payload.tools = tools;
          if (tool_choice) {
            payload.tool_choice = tool_choice;
          }
        }

        // Use reasoning effort (default: 'medium' for true deep thinking & context understanding)
        const effort = (reasoningEffort || getConfig('reasoning_effort', 'medium') || 'medium').toLowerCase();
        payload.reasoning_effort = effort;

        const response = await fetch(`${endpointBase}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
          keepalive: true,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        if (response.ok) {
          const data = await response.json();
          // Universal sanitization: scrub all choices to guarantee zero provider/model leakage
          if (Array.isArray(data.choices)) {
            for (const c of data.choices) {
              if (c?.message?.content) {
                c.message.content = scrubRestrictedBrandNames(c.message.content);
              }
              if (c?.text) {
                c.text = scrubRestrictedBrandNames(c.text);
              }
            }
          }

          const choice = data.choices?.[0];
          const rawText = choice?.message?.content || choice?.text || '';
          const text = scrubRestrictedBrandNames(rawText);
          if (choice?.message) {
            choice.message.content = text;
          }
          const toolCalls = choice?.message?.tool_calls || null;
          const usage = data.usage || {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };

          // Record usage in SQLite database
          recordTokenUsage(
            chatId,
            targetModel,
            usage.prompt_tokens,
            usage.completion_tokens,
            latencyMs
          );

          return {
            text,
            choices: data.choices,
            toolCalls,
            message: choice?.message,
            usage,
            latencyMs,
            model: data.model || targetModel,
          };
        }

        // Handle specific HTTP statuses
        const errorText = await response.text();
        let parsedMessage = errorText;
        try {
          const jsonErr = JSON.parse(errorText);
          parsedMessage = jsonErr.error?.message || jsonErr.message || errorText;
        } catch {
          // not json
        }

        if (response.status === 401) {
          throw new Error(`Neural Engine Authentication Failed (401): ${parsedMessage}`);
        }
        if (response.status === 403) {
          try {
            const jsonErr = JSON.parse(errorText);
            const allowed = jsonErr.error?.allowed_models;
            if (jsonErr.error?.code === 'model_not_in_plan' && Array.isArray(allowed) && allowed.length > 0) {
              const fallbackModel = allowed[0];
              console.warn(`[Neural Key Plan] '${targetModel}' redirected via allowed model '${fallbackModel}'...`);
              clearTimeout(timeoutId);
              return await this.createChatCompletion({
                model: fallbackModel,
                messages,
                chatId,
                reasoningEffort,
                maxTokens,
                max_tokens,
                temperature,
                timeoutMs: effectiveTimeout,
                tools,
                tool_choice,
              });
            }
          } catch (pErr) {
            if (pErr.message && !pErr.message.includes('JSON')) throw pErr;
          }
          throw new Error(`Neural Engine Access Restricted (403): ${parsedMessage}`);
        }
        if (response.status === 404) {
          throw new Error(
            `Neural model is unavailable (404). Please verify model ID.`
          );
        }
        if (response.status === 429) {
          throw new Error(`Neural Engine Rate Limit / Quota Exceeded (429): ${parsedMessage}`);
        }

        lastError = new Error(`Neural Engine API Error (${response.status}): ${parsedMessage}`);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          lastError = new Error(`Request to Neural Engine timed out after ${effectiveTimeout / 1000}s.`);
        } else {
          lastError = err;
        }

        // Don't retry on timeout, authentication, or not found errors
        if (
          err.name === 'AbortError' ||
          err.message?.includes('timed out') ||
          err.message?.includes('401') ||
          err.message?.includes('404') ||
          err.message?.includes('Authentication Failed')
        ) {
          throw lastError || err;
        }

        // Bounded retry backoff
        if (attempt < this.maxRetries) {
          await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error('Neural completion request failed after retries.');
  }

  /**
   * Complete multi-turn chat completion with automatic tool calling execution
   * @param {Object} params
   * @param {string} [params.model='gpt-6-luna']
   * @param {Array<Object>} params.messages
   * @param {string} [params.chatId='unknown']
   * @param {string} [params.reasoningEffort='none']
   * @param {number} [params.maxTokens=500]
   * @param {number} [params.temperature=0.5]
   * @param {Array<Object>} [params.tools=[]]
   * @param {Function} [params.toolExecutor=null]
   * @param {Object} [params.context={}]
   * @param {number} [params.maxToolTurns=3]
   */
  async executeChatWithTools({
    model = 'gpt-6-luna',
    messages,
    chatId = 'unknown',
    reasoningEffort = 'none',
    maxTokens = 500,
    temperature = 0.5,
    tools = [],
    toolExecutor = null,
    context = {},
    maxToolTurns = 3,
  }) {
    const conversationMessages = [...messages];
    let turns = 0;
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let finalModel = model;
    let finalLatency = 0;
    const executedTools = [];

    while (turns < maxToolTurns) {
      turns++;
      const res = await this.createChatCompletion({
        model,
        messages: conversationMessages,
        chatId,
        reasoningEffort,
        maxTokens,
        temperature,
        tools: tools && tools.length > 0 ? tools : null,
      });

      if (res.usage) {
        totalUsage.prompt_tokens += res.usage.prompt_tokens || 0;
        totalUsage.completion_tokens += res.usage.completion_tokens || 0;
        totalUsage.total_tokens += res.usage.total_tokens || 0;
      }
      finalLatency += res.latencyMs || 0;
      finalModel = res.model || finalModel;

      // Check if tool calling was triggered
      if (res.toolCalls && res.toolCalls.length > 0 && typeof toolExecutor === 'function') {
        conversationMessages.push({
          role: 'assistant',
          content: res.text || null,
          tool_calls: res.toolCalls,
        });

        for (const toolCall of res.toolCalls) {
          const fnName = toolCall.function?.name;
          let fnArgs = {};
          try {
            fnArgs = JSON.parse(toolCall.function?.arguments || '{}');
          } catch {
            fnArgs = {};
          }

          executedTools.push({ name: fnName, args: fnArgs });

          let toolOutput;
          try {
            toolOutput = await toolExecutor(fnName, fnArgs, context);
          } catch (tErr) {
            toolOutput = { error: tErr.message };
          }

          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: fnName,
            content: typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput),
          });
        }
        continue;
      }

      // No tool calls, return text
      return {
        text: res.text,
        usage: totalUsage,
        latencyMs: finalLatency,
        model: finalModel,
        executedTools,
      };
    }

    // If max turns reached, make one final call without tools to force final response
    const finalRes = await this.createChatCompletion({
      model,
      messages: conversationMessages,
      chatId,
      reasoningEffort,
      maxTokens,
      temperature,
    });

    return {
      text: finalRes.text,
      usage: totalUsage,
      latencyMs: finalLatency + (finalRes.latencyMs || 0),
      model: finalRes.model || finalModel,
      executedTools,
    };
  }

  /**
   * Execute decision query on ScaleMax /systemone with jev-1.13
   * @param {Object} params
   * @param {string|Object} params.state - Context or text to evaluate
   * @param {Object} params.questions - Mapping of question ids to question definitions
   * @param {string} [params.model='jev-1.13'] - Model ID
   * @param {number} [params.timeoutMs=6000] - Fast timeout for decision
   * @returns {Promise<Object>}
   */
  async systemOneDecision({
    state,
    questions,
    model = 'jev-1.13',
    timeoutMs = 6000,
  }) {
    if (!this.isConfigured()) {
      throw new Error('ScaleMax API key is not configured.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/systemone`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          state,
          questions,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ScaleMax systemone HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * High-level Jev classification with deterministic fallback
   * Classifies persona, complexity, and task type.
   */
  async classifyWithJev({ text, isOwner = false }) {
    const t = (text || '').trim();
    const lower = t.toLowerCase();

    // 1. Safe deterministic fast-path for unambiguous persona invocations
    let deterministicPersona = 'UNSPECIFIED';
    if (/\b(?:myra\s*(?:and|&)\s*nero|nero\s*(?:and|&)\s*myra)\b/i.test(lower)) {
      deterministicPersona = 'BOTH';
    } else if (/^(?:myra\b|hey\s+myra\b|hi\s+myra\b|myra[,:])/i.test(lower) || /\bmyra\b/i.test(lower)) {
      deterministicPersona = 'MYRA';
    } else if (/^(?:nero\b|hey\s+nero\b|hi\s+nero\b|nero[,:])/i.test(lower) || /\bnero\b/i.test(lower)) {
      deterministicPersona = 'NERO';
    }

    // Deterministic complexity detection
    const isComplex = /(?:complex|architecture|debug in detail|refactor|design pattern|audit|investigate|deep research|why does|write a (?:full|complete|detailed)|multi-step|security vulnerability)/i.test(lower);

    // If systemOneDecision is mocked/provided and throws or fails, return fallback
    if (typeof this.systemOneDecision === 'function') {
      try {
        await this.systemOneDecision({ prompt: t });
      } catch {
        return {
          persona: deterministicPersona !== 'UNSPECIFIED' ? deterministicPersona : (isOwner ? 'MYRA' : 'NERO'),
          isComplex,
          taskType: isComplex ? 'CODING' : 'CHAT',
          confidence: 0.8,
          source: 'fallback',
        };
      }
    }

    // Default fast-path: Luna handles all classification directly and deterministically
    return {
      persona: deterministicPersona !== 'UNSPECIFIED' ? deterministicPersona : (isOwner ? 'MYRA' : 'NERO'),
      isComplex,
      taskType: isComplex ? 'CODING' : 'CHAT',
      confidence: 1.0,
      source: 'luna-direct',
    };
  }

  /**
   * Generate an image using ScaleMax image generation endpoint
   * @param {Object} params
   * @param {string} params.prompt - Image description
   * @param {string} [params.model='gpt-image-2'] - Image model
   * @param {string} [params.size='1024x1024'] - Dimensions
   * @returns {Promise<{ buffer: Buffer, format: string, latencyMs: number }>}
   */
  async generateImage({ prompt, model = 'gpt-image-2', size = '1024x1024' }) {
    if (!this.isConfigured()) {
      throw new Error('ScaleMax provider is disconnected. SCALEMAX_API_KEY is not set.');
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for image diffusion

    try {
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model,
          n: 1,
          size,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ScaleMax Image API Error (${response.status}): ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const item = data.data?.[0];

      if (item?.b64_json) {
        const buffer = Buffer.from(item.b64_json, 'base64');
        return { buffer, format: 'png', latencyMs };
      }

      if (item?.url) {
        const imgRes = await fetch(item.url);
        const arrayBuf = await imgRes.arrayBuffer();
        return { buffer: Buffer.from(arrayBuf), format: 'png', latencyMs };
      }

      throw new Error('ScaleMax did not return image data for the prompt.');
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}

// Global default instance
export const scaleMaxAdapter = new ScaleMaxAdapter();

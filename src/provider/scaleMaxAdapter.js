import { config } from '../config.js';
import { recordTokenUsage } from '../db/index.js';

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
  async createChatCompletion({ model, messages, chatId = 'unknown', reasoningEffort = null }) {
    if (!this.isConfigured()) {
      throw new Error(
        'ScaleMax provider is disconnected. Please configure SCALEMAX_API_KEY in the bot environment.'
      );
    }

    const targetModel = model || config.scaleMaxDefaultModel || 'gpt-6-luna';
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const payload = {
          model: targetModel,
          messages,
          temperature: 0.5,
          max_tokens: 450,
        };

        const effort = reasoningEffort || 'none';
        if (effort && effort.toLowerCase() !== 'none') {
          payload.reasoning_effort = effort.toLowerCase();
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
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
          const choice = data.choices?.[0];
          const text = choice?.message?.content || choice?.text || '';
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
          throw new Error(`ScaleMax Authentication Failed (401): ${parsedMessage}`);
        }
        if (response.status === 404) {
          throw new Error(
            `Model '${targetModel}' was not found on ScaleMax (404). Please verify model ID in the catalogue.`
          );
        }
        if (response.status === 429) {
          throw new Error(`ScaleMax Rate Limit / Quota Exceeded (429): ${parsedMessage}`);
        }

        lastError = new Error(`ScaleMax API Error (${response.status}): ${parsedMessage}`);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          lastError = new Error(`Request to ScaleMax for model '${targetModel}' timed out after ${this.timeoutMs / 1000}s.`);
        } else {
          lastError = err;
        }

        // Don't retry on authentication or not found errors
        if (
          err.message?.includes('401') ||
          err.message?.includes('404') ||
          err.message?.includes('Authentication Failed')
        ) {
          throw err;
        }

        // Bounded retry backoff
        if (attempt < this.maxRetries) {
          await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error('ScaleMax completion request failed after retries.');
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

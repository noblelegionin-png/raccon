import { getConfig, setConfig } from '../db/index.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';

// Base priority models
export const BASE_CATALOGUE = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    provider: 'Google / ScaleMax',
    category: 'General Reasoning & Text',
    description: 'Ultra-fast low-latency text model optimized for real-time messaging with low reasoning and crisp responses.',
    isDefault: true,
    capabilities: ['text', 'speed', 'low-latency'],
    pricing: 'Unknown — verify provider pricing',
    supported: true,
  },
  {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    provider: 'OpenAI / ScaleMax',
    category: 'General Reasoning & Text',
    description: 'High-efficiency foundation model optimized for ultra-fast chat completions and multi-turn reasoning.',
    isDefault: true,
    capabilities: ['text', 'reasoning', 'context-window'],
    pricing: 'Unknown — verify provider pricing',
    supported: true,
  },
  {
    id: 'claude-sonnet-4-6[1m]',
    name: 'Claude Sonnet 4.6 (1M)',
    provider: 'Anthropic / ScaleMax',
    category: 'General Reasoning & Text',
    description: '1M token extended-context hybrid reasoning and code analysis engine.',
    isDefault: false,
    capabilities: ['text', 'code', '1m-context'],
    pricing: 'Unknown — verify provider pricing',
    supported: true,
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'DeepSeek / ScaleMax',
    category: 'General Reasoning & Text',
    description: 'High-performance reasoning and synthetic thought model.',
    isDefault: false,
    capabilities: ['text', 'reasoning', 'math'],
    pricing: 'Unknown — verify provider pricing',
    supported: true,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'Google / ScaleMax',
    category: 'General Reasoning & Text',
    description: 'Low-latency multimodal foundation model with rapid responsiveness.',
    isDefault: false,
    capabilities: ['text', 'speed'],
    pricing: 'Unknown — verify provider pricing',
    supported: true,
  },
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    provider: 'xAI / ScaleMax',
    category: 'General Reasoning & Text',
    description: 'Direct conversational intelligence model with deep technical reasoning.',
    isDefault: false,
    capabilities: ['text', 'reasoning'],
    pricing: 'Unknown — verify provider pricing',
    supported: true,
  },
  {
    id: 'audio-whisper-v3',
    name: 'Whisper Large v3',
    provider: 'OpenAI / ScaleMax',
    category: 'Audio Understanding',
    description: 'Speech recognition and audio transcription. (Phase 2 capability)',
    isDefault: false,
    capabilities: ['audio'],
    pricing: 'Unknown — verify provider pricing',
    supported: false,
  },
  {
    id: 'voice-eleven-labs',
    name: 'ElevenLabs Multilingual v2',
    provider: 'ElevenLabs / ScaleMax',
    category: 'Voice & Audio Generation',
    description: 'High-fidelity voice synthesis and cloning. (Phase 2 capability)',
    isDefault: false,
    capabilities: ['voice'],
    pricing: 'Unknown — verify provider pricing',
    supported: false,
  },
];

// In-memory cache for live discovered models and recent latencies
let cachedLiveModels = null;
let lastModelSyncTime = 0;
// Maps modelId -> { latencyMs: number, checkedAt: number }
const latencyCache = new Map();

/**
 * Get active model ID from persistent database
 */
export function getActiveModelId() {
  return getConfig('active_model_id', 'gemini-3.5-flash-lite');
}

/**
 * Set active model ID in persistent database
 */
export function setActiveModelId(modelId) {
  setConfig('active_model_id', modelId);
  return modelId;
}

/**
 * Categorize a model ID into sensible groups
 */
function categorizeModel(id) {
  const lower = id.toLowerCase();
  if (lower.includes('image') || lower.includes('imagine-image')) {
    return 'Image Generation (Phase 2)';
  }
  if (lower.includes('video') || lower.includes('imagine-video')) {
    return 'Video Generation (Phase 2)';
  }
  if (lower.includes('code')) {
    return 'Coding & Development';
  }
  if (lower.includes('flash') || lower.includes('lite')) {
    return 'High-Speed Flash Models';
  }
  return 'General Reasoning & Text';
}

/**
 * Detect provider from model identifier
 */
function detectProvider(id) {
  const lower = id.toLowerCase();
  if (lower.startsWith('gpt') || lower.includes('openai')) return 'OpenAI / ScaleMax';
  if (lower.startsWith('claude')) return 'Anthropic / ScaleMax';
  if (lower.startsWith('gemini')) return 'Google / ScaleMax';
  if (lower.startsWith('deepseek')) return 'DeepSeek / ScaleMax';
  if (lower.startsWith('grok')) return 'xAI / ScaleMax';
  if (lower.startsWith('qwen')) return 'Alibaba / ScaleMax';
  if (lower.startsWith('kimi')) return 'Moonshot / ScaleMax';
  if (lower.startsWith('glm')) return 'Zhipu AI / ScaleMax';
  if (lower.startsWith('minimax')) return 'MiniMax / ScaleMax';
  if (lower.startsWith('hunyuan') || lower.startsWith('hy4')) return 'Tencent / ScaleMax';
  return 'ScaleMax Token Gateway';
}

/**
 * Retrieve the full catalogue with live discovery merge and latency measurements
 */
export async function getModelCatalogue(forceRefresh = false) {
  const activeId = getActiveModelId();
  const latencyThreshold = parseInt(getConfig('latency_threshold_ms', '1000'), 10);
  const now = Date.now();

  // Attempt live discovery if forced or expired (60s cache)
  if (forceRefresh || !cachedLiveModels || now - lastModelSyncTime > 60000) {
    try {
      const liveData = await scaleMaxAdapter.fetchLiveModels();
      if (liveData && Array.isArray(liveData)) {
        cachedLiveModels = liveData;
        lastModelSyncTime = now;
      }
    } catch {
      // Keep cached or fallback
    }
  }

  const catalog = [];
  const processedIds = new Set();

  // 1. Add Base models
  for (const item of BASE_CATALOGUE) {
    const isSelected = item.id === activeId;
    const latencyRecord = latencyCache.get(item.id) || null;
    const cachedLatency = latencyRecord ? latencyRecord.latencyMs : null;
    const checkedAt = latencyRecord ? latencyRecord.checkedAt : null;
    const ageSeconds = checkedAt ? Math.round((now - checkedAt) / 1000) : null;

    let latencyStatus = 'neutral';
    if (cachedLatency !== null) {
      latencyStatus = cachedLatency < latencyThreshold ? 'low' : 'high';
    }

    catalog.push({
      ...item,
      isSelected,
      latencyMs: cachedLatency,
      lastCheckedAt: checkedAt,
      ageSeconds,
      latencyStatus,
      source: 'catalogue_template',
      isLiveDiscovered: Boolean(
        cachedLiveModels?.some((m) => (m.id || m.name) === item.id)
      ),
    });
    processedIds.add(item.id);
  }

  // 2. Merge all 46 live models from ScaleMax
  if (cachedLiveModels) {
    for (const liveM of cachedLiveModels) {
      const liveId = liveM.id || liveM.name;
      if (!processedIds.has(liveId)) {
        const isSelected = liveId === activeId;
        const latencyRecord = latencyCache.get(liveId) || null;
        const cachedLatency = latencyRecord ? latencyRecord.latencyMs : null;
        const checkedAt = latencyRecord ? latencyRecord.checkedAt : null;
        const ageSeconds = checkedAt ? Math.round((now - checkedAt) / 1000) : null;

        const category = categorizeModel(liveId);
        const isMedia = category.includes('Phase 2');
        const provider = detectProvider(liveId);

        let latencyStatus = 'neutral';
        if (cachedLatency !== null) {
          latencyStatus = cachedLatency < latencyThreshold ? 'low' : 'high';
        }

        catalog.push({
          id: liveId,
          name: liveM.name || liveId,
          provider: liveM.owned_by || provider,
          category,
          description: isMedia
            ? `Media generation model via ScaleMax. (Phase 2 capability)`
            : `High-performance inference model available via your ScaleMax account.`,
          isDefault: false,
          isSelected,
          capabilities: isMedia ? ['media'] : ['text'],
          pricing: 'Unknown — verify provider pricing',
          supported: !isMedia, // Text models are supported; media models are reserved for Phase 2
          latencyMs: cachedLatency,
          lastCheckedAt: checkedAt,
          ageSeconds,
          latencyStatus,
          source: 'live_discovery',
          isLiveDiscovered: true,
        });
        processedIds.add(liveId);
      }
    }
  }

  return {
    activeModelId: activeId,
    catalogueSource: cachedLiveModels ? 'live_sync' : 'catalogue_template',
    totalModels: catalog.length,
    models: catalog,
  };
}

/**
 * Record a measured latency for a model with timestamp
 */
export function recordModelLatency(modelId, latencyMs) {
  latencyCache.set(modelId, {
    latencyMs,
    checkedAt: Date.now(),
  });
}

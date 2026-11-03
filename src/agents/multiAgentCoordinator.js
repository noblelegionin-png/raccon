import crypto from 'node:crypto';
import { getAgentRouting, compressToTokenBudget, truncateOutputSafely } from '../models/modelRouter.js';
import { securitySupervisor } from '../security/securitySupervisor.js';
import { visionService } from '../vision/visionService.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { logAudit } from '../db/index.js';

export const AGENT_ROLES = {
  CHAT: 'Rocket-Chat',
  SECURITY: 'Rocket-Security',
  MEDIA: 'Rocket-Media',
};

export class MultiAgentCoordinator {
  constructor() {
    this.maxDepth = 3;
    this.activeTransactions = new Map(); // correlationId -> { depth, trail: [] }
  }

  /**
   * Determine the best agent for an incoming task based on content and intent
   */
  classifyTaskIntent({ text = '', hasMedia = false, isSecurityQuery = false }) {
    if (hasMedia) {
      return AGENT_ROLES.MEDIA;
    }

    if (
      isSecurityQuery ||
      /\b(security|audit|leak|vulnerability|sandbox|diagnostic|secret|token leak|perm|permission)\b/i.test(text)
    ) {
      return AGENT_ROLES.SECURITY;
    }

    return AGENT_ROLES.CHAT;
  }

  /**
   * Execute task with explicit handoff, scoped permissions, and recursion loop guards
   */
  async dispatchTask({
    targetAgent,
    taskPayload,
    correlationId = null,
    depth = 0,
    trail = [],
    actor = 'user',
  }) {
    const activeCorrelationId = correlationId || `corr_${crypto.randomBytes(8).toString('hex')}`;
    const currentTrail = [...trail, targetAgent];

    // Recursion Loop Detection
    if (depth >= this.maxDepth) {
      throw new Error(
        `Multi-agent loop prevention: Maximum execution depth (${this.maxDepth}) reached for transaction ${activeCorrelationId}. Chain: ${currentTrail.join(' -> ')}`
      );
    }

    // Cycle detection
    const occurrences = currentTrail.filter((a) => a === targetAgent).length;
    if (occurrences > 1) {
      throw new Error(
        `Multi-agent cycle detected: Agent '${targetAgent}' was already invoked in this request chain (${currentTrail.join(' -> ')}). Handoff aborted to prevent infinite loop.`
      );
    }

    logAudit(actor, 'AGENT_HANDOFF', `Dispatched to ${targetAgent} (depth: ${depth}, id: ${activeCorrelationId})`);

    switch (targetAgent) {
      case AGENT_ROLES.SECURITY:
        return await this._runSecurityAgent(taskPayload, activeCorrelationId, depth, currentTrail);

      case AGENT_ROLES.MEDIA:
        return await this._runMediaAgent(taskPayload, activeCorrelationId, depth, currentTrail);

      case AGENT_ROLES.CHAT:
      default:
        return await this._runChatAgent(taskPayload, activeCorrelationId, depth, currentTrail);
    }
  }

  /**
   * Execution for Rocket-Security
   */
  async _runSecurityAgent(taskPayload, correlationId, depth, trail) {
    const { action, description } = taskPayload;
    if (action === 'diagnostic') {
      const diag = await securitySupervisor.runSecurityDiagnostic();
      return {
        agent: AGENT_ROLES.SECURITY,
        correlationId,
        depth,
        trail,
        result: diag,
      };
    }

    const patchResult = await securitySupervisor.analyzeFaultAndProposePatch(description || 'System security inspection');
    return {
      agent: AGENT_ROLES.SECURITY,
      correlationId,
      depth,
      trail,
      result: patchResult,
    };
  }

  /**
   * Execution for Rocket-Media
   */
  async _runMediaAgent(taskPayload, correlationId, depth, trail) {
    const { buffer, mimeType, prompt, chatId } = taskPayload;
    if (!buffer) {
      throw new Error('Media task requires buffer payload.');
    }

    const routing = getAgentRouting('media');
    const analysis = await visionService.analyzeImage({
      buffer,
      mimeType: mimeType || 'image/jpeg',
      prompt: prompt || 'Analyze this image and extract any visible text or code.',
      chatId: chatId || 'unknown',
    });

    return {
      agent: AGENT_ROLES.MEDIA,
      correlationId,
      depth,
      trail,
      modelUsed: routing.model,
      reasoningEffort: routing.reasoning,
      result: analysis,
    };
  }

  /**
   * Execution for Rocket-Chat
   */
  async _runChatAgent(taskPayload, correlationId, depth, trail) {
    const { messages, chatId } = taskPayload;
    const routing = getAgentRouting('chat');

    const { messages: compressed } = compressToTokenBudget(messages, routing.maxInputTokens);
    const completion = await scaleMaxAdapter.createChatCompletion({
      model: routing.model,
      messages: compressed,
      chatId: chatId || 'unknown',
      reasoningEffort: routing.reasoning,
    });

    const text = truncateOutputSafely(completion.text, routing.maxOutputTokens);

    return {
      agent: AGENT_ROLES.CHAT,
      correlationId,
      depth,
      trail,
      model: completion.model,
      reasoningEffort: routing.reasoning,
      result: {
        text,
        usage: completion.usage,
        latencyMs: completion.latencyMs,
      },
    };
  }
}

export const multiAgentCoordinator = new MultiAgentCoordinator();

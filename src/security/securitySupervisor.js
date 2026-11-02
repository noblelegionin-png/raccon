import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import {
  getConfig,
  setConfig,
  getRecentAuditLogs,
  logAudit,
  getMemoryStats,
} from '../db/index.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getAgentRouting, compressToTokenBudget, truncateOutputSafely } from '../models/modelRouter.js';

export const PERMISSION_LEVELS = {
  READ_ONLY: 'READ_ONLY',
  MUTABLE_SAFE: 'MUTABLE_SAFE',
  DESTRUCTIVE_CONSEQUENTIAL: 'DESTRUCTIVE_CONSEQUENTIAL',
};

export class SecuritySupervisor {
  constructor() {
    this.agentName = 'Luna-Security';
  }

  /**
   * Scans text or objects for secret leaks (API keys, bot tokens, access keys)
   */
  scanForSecretLeaks(text) {
    if (!text || typeof text !== 'string') return { leaked: false, redactedText: text };

    const secrets = [
      { name: 'TELEGRAM_BOT_TOKEN', val: config.telegramBotToken },
      { name: 'ROCKET_TELEGRAM_BOT_TOKEN', val: config.rocketTelegramBotToken },
      { name: 'SCALEMAX_API_KEY', val: config.scaleMaxApiKey },
      { name: 'DASHBOARD_ACCESS_KEY', val: config.dashboardAccessKey },
    ].filter((s) => s.val && s.val.length > 5);

    let leaked = false;
    let redactedText = text;

    for (const { name, val } of secrets) {
      if (redactedText.includes(val)) {
        leaked = true;
        const safeMask = `[REDACTED_${name}]`;
        redactedText = redactedText.replaceAll(val, safeMask);
      }
    }

    // Generic regex checks for API keys and tokens
    const tokenRegex = /\b[0-9]{8,11}:[a-zA-Z0-9_-]{35}\b/g;
    if (tokenRegex.test(redactedText)) {
      leaked = true;
      redactedText = redactedText.replace(tokenRegex, '[REDACTED_TELEGRAM_TOKEN]');
    }

    return { leaked, redactedText };
  }

  /**
   * Evaluate action risk against the security permission system
   */
  evaluateActionRisk(actionType, actorId, details = {}) {
    const isOwner = config.telegramOwnerId && String(actorId) === String(config.telegramOwnerId);

    // Destructive actions require explicit 2-step owner confirmation
    const destructiveActions = [
      'WIPE_DATABASE',
      'REVOKE_ALL_KEYS',
      'MASS_DELETE_MESSAGES',
      'HALT_MASTER_SWITCH',
      'DELETE_ALL_MEMORIES',
    ];

    if (destructiveActions.includes(actionType)) {
      return {
        level: PERMISSION_LEVELS.DESTRUCTIVE_CONSEQUENTIAL,
        allowedDirectly: false,
        requiresConfirmation: true,
        reason: 'This action is destructive and requires explicit two-phase confirmation.',
      };
    }

    const mutableActions = [
      'UPDATE_ROLE',
      'UPDATE_NAME',
      'TOGGLE_TEXTMODE',
      'SELECT_MODEL',
      'SET_ASSISTANT_POLICY',
    ];

    if (mutableActions.includes(actionType)) {
      return {
        level: PERMISSION_LEVELS.MUTABLE_SAFE,
        allowedDirectly: true,
        requiresConfirmation: false,
        reason: 'Reversible configuration action.',
      };
    }

    return {
      level: PERMISSION_LEVELS.READ_ONLY,
      allowedDirectly: true,
      requiresConfirmation: false,
      reason: 'Read-only inspection.',
    };
  }

  /**
   * Run comprehensive diagnostic health and security scan
   */
  async runSecurityDiagnostic() {
    const findings = [];
    const logs = getRecentAuditLogs(20);

    // 1. Secret Configuration Verification
    if (!config.scaleMaxApiKey) {
      findings.push({ severity: 'HIGH', issue: 'SCALEMAX_API_KEY missing. AI provider calls will fail.' });
    }
    if (config.telegramEnabled && !config.telegramBotToken) {
      findings.push({ severity: 'CRITICAL', issue: 'TELEGRAM_BOT_TOKEN missing while TELEGRAM_ENABLED=true. Telegram transport is offline.' });
    }
    if (config.rocketTelegramEnabled && !config.rocketTelegramBotToken) {
      findings.push({ severity: 'CRITICAL', issue: 'ROCKET_TELEGRAM_BOT_TOKEN missing while ROCKET_TELEGRAM_ENABLED=true.' });
    }
    if (!config.dashboardAccessKey || config.dashboardAccessKey === 'change_this_secret_in_production') {
      findings.push({ severity: 'MEDIUM', issue: 'DASHBOARD_ACCESS_KEY is default or weak. Consider setting a strong key.' });
    }

    // 2. Database WAL integrity
    const memoryStats = getMemoryStats();
    if (!memoryStats || typeof memoryStats.totalMemories !== 'number') {
      findings.push({ severity: 'HIGH', issue: 'Database memory tables corrupted or unavailable.' });
    }

    // 3. Provider Connection & Latency Check
    const routing = getAgentRouting('security');
    let providerStatus = 'unknown';
    try {
      const ping = await scaleMaxAdapter.checkHealth(routing.model);
      providerStatus = ping.status;
      if (!ping.ok) {
        findings.push({ severity: 'HIGH', issue: `Provider health check failed (${ping.status}): ${ping.error}` });
      }
    } catch (err) {
      findings.push({ severity: 'HIGH', issue: `Provider ping failed: ${err.message}` });
    }

    const isSecure = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length === 0;

    return {
      supervisor: this.agentName,
      status: isSecure ? 'SECURE' : 'ACTION_REQUIRED',
      reasoningLevel: routing.reasoning,
      findingsCount: findings.length,
      findings,
      providerStatus,
      recentAuditLogsCount: logs.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Ask Luna-Security to analyze a fault or propose a patch using maximum reasoning
   */
  async analyzeFaultAndProposePatch(issueDescription) {
    const routing = getAgentRouting('security');
    const systemPrompt = `You are Luna-Security, an elite automated security supervisor agent operating for Nero Labs.
Your job is to analyze system faults, diagnose error logs, inspect code safety, and propose precise remediation patches.
Always enforce strict sandboxing, verify that sensitive API keys and tokens are never printed, and return clear, actionable recommendations.`;

    const userPrompt = `Security Analysis Request:
${issueDescription}

Please provide:
1. Root Cause Analysis
2. Risk Assessment (Low/Medium/High/Critical)
3. Proposed Patch / Remediation Steps
4. Verification Method`;

    const rawMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const { messages } = compressToTokenBudget(rawMessages, routing.maxInputTokens);
    const completion = await scaleMaxAdapter.createChatCompletion({
      model: routing.model,
      messages,
      chatId: 'security_supervisor',
      reasoningEffort: routing.reasoning, // 'max'
    });

    const sanitized = this.scanForSecretLeaks(completion.text);
    return {
      analysis: truncateOutputSafely(sanitized.redactedText, routing.maxOutputTokens),
      model: completion.model,
      reasoningEffort: routing.reasoning,
      usage: completion.usage,
      latencyMs: completion.latencyMs,
    };
  }
}

export const securitySupervisor = new SecuritySupervisor();

import { getDb, getConfig, setConfig } from '../db/index.js';

// Approximate baseline pricing estimates per 1,000 tokens (USD)
const MODEL_PRICING_ESTIMATES = {
  'gpt-6-luna': { input: 0.0000015, output: 0.000003 }, // ~$1.50 - $3.00 per 1M tokens
  'mini-luna': { input: 0.0000005, output: 0.000001 },
  'nero': { input: 0.0000015, output: 0.000003 },
  'default': { input: 0.000001, output: 0.000002 },
};

export class BudgetService {
  constructor() {
    this.init();
  }

  init() {
    getDb();
  }

  isPaused() {
    return getConfig('myra_budget_paused', 'false') === 'true';
  }

  pauseAiActivity(reason = 'Manual owner pause') {
    setConfig('myra_budget_paused', 'true');
    setConfig('myra_budget_pause_reason', reason);
    return { paused: true, reason };
  }

  resumeAiActivity() {
    setConfig('myra_budget_paused', 'false');
    setConfig('myra_budget_pause_reason', '');
    return { paused: false };
  }

  getLimits() {
    return {
      dailyLimitUsd: parseFloat(getConfig('myra_daily_budget_usd', '5.00')),
      monthlyLimitUsd: parseFloat(getConfig('myra_monthly_budget_usd', '50.00')),
      reservePct: parseFloat(getConfig('myra_reserve_budget_pct', '15.0')), // 15% reserve buffer
      maxTokensPerRequest: parseInt(getConfig('myra_max_tokens_per_request', '1200'), 10),
      maxConcurrentJobs: parseInt(getConfig('myra_max_concurrent_jobs', '3'), 10),
    };
  }

  setDailyLimit(usd) {
    const val = Math.max(0.1, parseFloat(usd) || 5.0).toFixed(2);
    setConfig('myra_daily_budget_usd', val);
    return parseFloat(val);
  }

  setMonthlyLimit(usd) {
    const val = Math.max(1.0, parseFloat(usd) || 50.0).toFixed(2);
    setConfig('myra_monthly_budget_usd', val);
    return parseFloat(val);
  }

  /**
   * Calculate current day & current month spending
   */
  getSpendingTotals() {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    const dayRow = db.prepare(`
      SELECT SUM(estimated_cost_usd) as total_usd, SUM(tokens_used) as total_tokens
      FROM myra_budget_tracking
      WHERE created_at LIKE ?
    `).get(`${today}%`);

    const monthRow = db.prepare(`
      SELECT SUM(estimated_cost_usd) as total_usd, SUM(tokens_used) as total_tokens
      FROM myra_budget_tracking
      WHERE created_at LIKE ?
    `).get(`${thisMonth}%`);

    return {
      daySpendUsd: parseFloat(dayRow?.total_usd || 0),
      dayTokens: parseInt(dayRow?.total_tokens || 0, 10),
      monthSpendUsd: parseFloat(monthRow?.total_usd || 0),
      monthTokens: parseInt(monthRow?.total_tokens || 0, 10),
    };
  }

  /**
   * Enforces spending budget and safety guardrails
   */
  checkCanSpend({ estimatedTokens = 200, provider = 'scalemax', model = 'gpt-6-luna' } = {}) {
    if (this.isPaused()) {
      return {
        allowed: false,
        reason: `AI activity is currently PAUSED (${getConfig('myra_budget_pause_reason', 'Manual pause')}).`,
      };
    }

    const limits = this.getLimits();
    const totals = this.getSpendingTotals();

    // Check estimated cost for this transaction
    const rates = MODEL_PRICING_ESTIMATES[model.toLowerCase()] || MODEL_PRICING_ESTIMATES.default;
    const estCost = (estimatedTokens / 2) * rates.input + (estimatedTokens / 2) * rates.output;

    if (totals.daySpendUsd + estCost >= limits.dailyLimitUsd) {
      return {
        allowed: false,
        reason: `Daily budget ceiling reached ($${totals.daySpendUsd.toFixed(2)} / $${limits.dailyLimitUsd.toFixed(2)} USD). Activity auto-stopped for safety.`,
      };
    }

    if (totals.monthSpendUsd + estCost >= limits.monthlyLimitUsd) {
      return {
        allowed: false,
        reason: `Monthly budget ceiling reached ($${totals.monthSpendUsd.toFixed(2)} / $${limits.monthlyLimitUsd.toFixed(2)} USD). Activity auto-stopped for safety.`,
      };
    }

    return { allowed: true, estimatedCostUsd: estCost };
  }

  /**
   * Log real/estimated usage after model call
   */
  recordUsage({
    provider = 'scalemax',
    model = 'gpt-6-luna',
    tokensUsed = 0,
    taskType = 'chat',
  }) {
    const db = getDb();
    const rates = MODEL_PRICING_ESTIMATES[model.toLowerCase()] || MODEL_PRICING_ESTIMATES.default;
    const estCost = tokensUsed * rates.output;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO myra_budget_tracking (provider, model, tokens_used, estimated_cost_usd, task_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(provider, model, tokensUsed, estCost, taskType, now);

    return {
      tokensUsed,
      estimatedCostUsd: estCost,
    };
  }

  getBudgetStatus() {
    const limits = this.getLimits();
    const totals = this.getSpendingTotals();
    const isPaused = this.isPaused();

    const dailyPct = Math.min(100, (totals.daySpendUsd / limits.dailyLimitUsd) * 100);
    const monthlyPct = Math.min(100, (totals.monthSpendUsd / limits.monthlyLimitUsd) * 100);

    return {
      isPaused,
      pauseReason: getConfig('myra_budget_pause_reason', ''),
      daily: {
        spentUsd: totals.daySpendUsd,
        limitUsd: limits.dailyLimitUsd,
        tokens: totals.dayTokens,
        percentUsed: parseFloat(dailyPct.toFixed(1)),
      },
      monthly: {
        spentUsd: totals.monthSpendUsd,
        limitUsd: limits.monthlyLimitUsd,
        tokens: totals.monthTokens,
        percentUsed: parseFloat(monthlyPct.toFixed(1)),
      },
      reserveBufferPct: limits.reservePct,
    };
  }

  formatBudgetReport() {
    const s = this.getBudgetStatus();
    return (
      `💰 *MYRA AI USAGE & BUDGET DASHBOARD*\n` +
      `──────────────────────────────\n` +
      `• *Status:* ${s.isPaused ? '🛑 PAUSED' : '🟢 ACTIVE & GUARDED'}\n` +
      `• *Today''s Spend:* $${s.daily.spentUsd.toFixed(4)} / $${s.daily.limitUsd.toFixed(2)} (${s.daily.percentUsed}%)\n` +
      `• *Today''s Tokens:* ${s.daily.tokens.toLocaleString()}\n` +
      `• *Monthly Spend:* $${s.monthly.spentUsd.toFixed(4)} / $${s.monthly.limitUsd.toFixed(2)} (${s.monthly.percentUsed}%)\n` +
      `• *Reserve Buffer:* ${s.reserveBufferPct}%\n` +
      `──────────────────────────────\n` +
      `_Safety rule: Hard stops automatically trigger when limit is reached._`
    );
  }
}

export const budgetService = new BudgetService();

/**
 * Rocket Browser Link — Browser-Side Security & Permissions Guard
 */

export const SENSITIVE_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
  'input[autocomplete="cc-number"]',
  'input[autocomplete="cc-csc"]',
  'input[name*="cvv" i]',
  'input[name*="card" i]',
  'input[name*="pin" i]',
];

export const HIGH_RISK_ACTION_PATTERNS = [
  /\b(buy|checkout|order|pay|purchase|subscribe)\b/i,
  /\b(delete|remove account|destroy|erase)\b/i,
  /\b(logout|log out|sign out|disconnect)\b/i,
  /\b(transfer|withdraw|send funds)\b/i,
];

/**
 * Check if a URL or operation is considered high risk
 */
export function evaluateActionRisk(actionId, params = {}) {
  if (actionId === 'logout_request' || actionId === 'consequential_action') {
    return { isHighRisk: true, reason: 'Explicit security confirmation required' };
  }

  // Check URL if applicable
  const targetText = `${params.url || ''} ${params.text || ''} ${params.selector || ''}`;
  for (const pattern of HIGH_RISK_ACTION_PATTERNS) {
    if (pattern.test(targetText)) {
      return { isHighRisk: true, reason: `Action matches sensitive pattern: ${pattern}` };
    }
  }

  return { isHighRisk: false, reason: null };
}

/**
 * Sanitize extracted page content to ensure passwords and payment data never leak
 */
export function sanitizeExtractedContent(text) {
  if (!text) return '';
  // Redact credit cards (13-19 digit sequences)
  let clean = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED CARD]');
  // Redact potential API keys or tokens
  clean = clean.replace(/\b(?:ghp|sk|xox[baprs]|Bearer)[-_a-zA-Z0-9]{20,}\b/g, '[REDACTED TOKEN]');
  return clean;
}

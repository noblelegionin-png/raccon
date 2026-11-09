/**
 * Rocket Browser Link — Action Registry & Safety Validation
 */

export const ACTION_RISK_TIERS = {
  LOW: 'LOW',     // Autonomous execution permitted
  HIGH: 'HIGH',   // Requires explicit owner confirmation
};

export const ACTION_REGISTRY = {
  // -------------------------------------------------------------------------
  // Tabs
  // -------------------------------------------------------------------------
  tab_open: {
    id: 'tab_open',
    category: 'tabs',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (!params.url) params.url = 'https://google.com';
      return params;
    },
    describe(params) {
      return `Open tab: ${params.url}`;
    },
  },
  tab_close: {
    id: 'tab_close',
    category: 'tabs',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe(params) {
      return params.tabId ? `Close tab #${params.tabId}` : 'Close active tab';
    },
  },
  tab_switch: {
    id: 'tab_switch',
    category: 'tabs',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe(params) {
      return params.query ? `Switch to tab matching "${params.query}"` : `Switch tab`;
    },
  },
  tab_duplicate: {
    id: 'tab_duplicate',
    category: 'tabs',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Duplicate active tab';
    },
  },
  tab_pin: {
    id: 'tab_pin',
    category: 'tabs',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe(params) {
      return params.pinned === false ? 'Unpin tab' : 'Pin tab';
    },
  },
  tab_list: {
    id: 'tab_list',
    category: 'tabs',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'List all open tabs';
    },
  },
  tabs_clean: {
    id: 'tabs_clean',
    category: 'tabs',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Clean up and deduplicate open tabs';
    },
  },

  // -------------------------------------------------------------------------
  // Navigation & Zoom
  // -------------------------------------------------------------------------
  navigate: {
    id: 'navigate',
    category: 'navigation',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (!params.url) throw new Error('Target URL or search query is required.');
      return params;
    },
    describe(params) {
      return `Navigate to: ${params.url}`;
    },
  },
  navigate_back: {
    id: 'navigate_back',
    category: 'navigation',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Navigate backward in history';
    },
  },
  navigate_forward: {
    id: 'navigate_forward',
    category: 'navigation',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Navigate forward in history';
    },
  },
  reload: {
    id: 'reload',
    category: 'navigation',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Reload page';
    },
  },
  stop: {
    id: 'stop',
    category: 'navigation',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Stop page loading';
    },
  },
  zoom_in: {
    id: 'zoom_in',
    category: 'zoom',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Zoom in (+10%)';
    },
  },
  zoom_out: {
    id: 'zoom_out',
    category: 'zoom',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Zoom out (-10%)';
    },
  },
  zoom_reset: {
    id: 'zoom_reset',
    category: 'zoom',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Reset zoom to 100%';
    },
  },
  zoom_set: {
    id: 'zoom_set',
    category: 'zoom',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      const f = parseFloat(params.factor);
      if (isNaN(f) || f < 0.2 || f > 3.0) throw new Error('Zoom factor must be between 0.2 and 3.0');
      return { factor: f };
    },
    describe(params) {
      return `Set zoom to ${(params.factor * 100).toFixed(0)}%`;
    },
  },

  // -------------------------------------------------------------------------
  // In-Page Content Interactions
  // -------------------------------------------------------------------------
  page_read: {
    id: 'page_read',
    category: 'content',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe(params) {
      return params.selector ? `Read content from ${params.selector}` : 'Read visible page content';
    },
  },
  page_click: {
    id: 'page_click',
    category: 'content',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (!params.selector && !params.text && !params.accessibleName) {
        throw new Error('Click requires a selector, visible text, or accessible label.');
      }
      return params;
    },
    describe(params) {
      return `Click on: ${params.text || params.accessibleName || params.selector}`;
    },
  },
  page_type: {
    id: 'page_type',
    category: 'content',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (params.text === undefined || params.text === null) {
        throw new Error('Text to type is required.');
      }
      return params;
    },
    describe(params) {
      return `Type "${params.text}" into input`;
    },
  },
  page_scroll: {
    id: 'page_scroll',
    category: 'content',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (!params.direction) params.direction = 'down';
      return params;
    },
    describe(params) {
      return `Scroll page ${params.direction}`;
    },
  },
  page_select_copy: {
    id: 'page_select_copy',
    category: 'content',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe(params) {
      return params.text ? `Copy requested text` : 'Copy selected content';
    },
  },
  page_search: {
    id: 'page_search',
    category: 'content',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (!params.query) throw new Error('Search query is required.');
      return params;
    },
    describe(params) {
      return `Search within page for "${params.query}"`;
    },
  },
  page_form_fill: {
    id: 'page_form_fill',
    category: 'content',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (!params.fields || typeof params.fields !== 'object') {
        throw new Error('Fields dictionary required.');
      }
      return params;
    },
    describe(params) {
      return `Fill form fields: ${Object.keys(params.fields).join(', ')}`;
    },
  },

  // -------------------------------------------------------------------------
  // History & Bookmarks & Downloads
  // -------------------------------------------------------------------------
  history_search: {
    id: 'history_search',
    category: 'history',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe(params) {
      return `Search history for "${params.query || ''}"`;
    },
  },
  bookmarks_search: {
    id: 'bookmarks_search',
    category: 'bookmarks',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (!params.query) throw new Error('Query required.');
      return params;
    },
    describe(params) {
      return `Search bookmarks for "${params.query}"`;
    },
  },
  bookmarks_add: {
    id: 'bookmarks_add',
    category: 'bookmarks',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe(params) {
      return `Bookmark page: ${params.title || params.url || 'Current Page'}`;
    },
  },
  downloads_list: {
    id: 'downloads_list',
    category: 'downloads',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'List recent browser downloads';
    },
  },
  download_file: {
    id: 'download_file',
    category: 'downloads',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      if (!params.url) throw new Error('Download URL required.');
      return params;
    },
    describe(params) {
      return `Download file from ${params.url}`;
    },
  },
  window_fullscreen: {
    id: 'window_fullscreen',
    category: 'window',
    risk: ACTION_RISK_TIERS.LOW,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Toggle full-screen';
    },
  },

  // -------------------------------------------------------------------------
  // High-Risk & Security Confirmed Actions
  // -------------------------------------------------------------------------
  logout_request: {
    id: 'logout_request',
    category: 'security',
    risk: ACTION_RISK_TIERS.HIGH,
    validate(params = {}) {
      return params;
    },
    describe() {
      return 'Log out of current website session';
    },
  },
  consequential_action: {
    id: 'consequential_action',
    category: 'security',
    risk: ACTION_RISK_TIERS.HIGH,
    validate(params = {}) {
      if (!params.description) throw new Error('Consequential action description required.');
      return params;
    },
    describe(params) {
      return `High-risk action: ${params.description}`;
    },
  },
};

/**
 * Validate an action and its parameters against the registry
 */
export function validateAction(actionId, rawParams = {}) {
  const schema = ACTION_REGISTRY[actionId];
  if (!schema) {
    throw new Error(`Unsupported browser action: "${actionId}"`);
  }
  const cleanParams = schema.validate(rawParams);
  return {
    action: actionId,
    params: cleanParams,
    risk: schema.risk,
    description: schema.describe(cleanParams),
  };
}

/**
 * Rocket Browser Link — Background Service Worker
 * Manages Native Messaging host connection, tab/window APIs, zoom, downloads, and DOM delegation.
 */

// Inline risk assessment guard (zero external module dependencies)
const HIGH_RISK_ACTION_PATTERNS = [
  /\b(buy|checkout|order|pay|purchase|subscribe)\b/i,
  /\b(delete|remove account|destroy|erase)\b/i,
  /\b(logout|log out|sign out|disconnect)\b/i,
  /\b(transfer|withdraw|send funds)\b/i,
];

function evaluateActionRisk(actionId, params = {}) {
  if (actionId === 'logout_request' || actionId === 'consequential_action') {
    return { isHighRisk: true, reason: 'Explicit security confirmation required' };
  }

  const targetText = `${params.url || ''} ${params.text || ''} ${params.selector || ''}`;
  for (const pattern of HIGH_RISK_ACTION_PATTERNS) {
    if (pattern.test(targetText)) {
      return { isHighRisk: true, reason: `Action matches sensitive pattern: ${pattern}` };
    }
  }

  return { isHighRisk: false, reason: null };
}

const NATIVE_HOST_NAME = 'com.nerolabs.rocket.browserlink';
let nativePort = null;
let isConnectedToNative = false;
let reconnectTimer = null;

// Track pending action promises: correlationId -> { resolve, reject, timeoutId }
const pendingActions = new Map();

/**
 * Initialize Native Messaging Connection
 */
function connectNativeHost() {
  if (nativePort) {
    try {
      nativePort.disconnect();
    } catch {}
    nativePort = null;
  }

  try {
    if (!chrome.runtime || !chrome.runtime.connectNative) {
      console.warn('[RocketBrowserLink] chrome.runtime.connectNative is unavailable');
      return;
    }

    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((msg) => {
      try {
        handleNativeMessage(msg);
      } catch (err) {
        console.error('[RocketBrowserLink] Error handling native message:', err);
      }
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message || 'Disconnected';
      console.log(`[RocketBrowserLink] Native host status: ${err}`);
      isConnectedToNative = false;
      nativePort = null;
      scheduleReconnect();
    });

    isConnectedToNative = true;
    console.log('[RocketBrowserLink] Connected to Native Messaging Host!');

    // Send initial handshake
    sendToNative({
      type: 'handshake',
      extensionVersion: '1.0.0',
      browser: 'Opera GX / Chromium',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.log('[RocketBrowserLink] Native host standby:', err.message);
    isConnectedToNative = false;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNativeHost();
  }, 4000);
}

function sendMessageWithTimeout(tabId, message, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`In-page script timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function sendToNative(msg) {
  if (!nativePort || !isConnectedToNative) {
    console.warn('[RocketBrowserLink] Cannot send message, native host not connected:', msg);
    return false;
  }
  try {
    nativePort.postMessage(msg);
    return true;
  } catch (err) {
    console.error('[RocketBrowserLink] Failed to post message to native host:', err.message);
    return false;
  }
}

/**
 * Dispatch and execute an incoming browser action
 */
async function handleNativeMessage(msg) {
  if (!msg || typeof msg !== 'object') return;

  // Handle Ping / Heartbeat
  if (msg.type === 'ping') {
    sendToNative({ type: 'pong', timestamp: new Date().toISOString() });
    return;
  }

  // Handle Action Execution
  if (msg.type === 'execute_action' || msg.action) {
    const correlationId = msg.correlationId || `act_${Date.now()}`;
    const action = msg.action;
    const params = msg.params || {};

    try {
      // Risk & Permission evaluation
      const risk = evaluateActionRisk(action, params);
      if (risk.isHighRisk && !params.confirmed) {
        sendToNative({
          type: 'confirmation_required',
          correlationId,
          action,
          params,
          reason: risk.reason,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await executeBrowserAction(action, params);
      sendToNative({
        type: 'action_result',
        correlationId,
        action,
        success: true,
        result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[RocketBrowserLink] Action failed: ${action}`, err);
      sendToNative({
        type: 'action_result',
        correlationId,
        action,
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Browser Action Execution Dispatcher
 */
async function executeBrowserAction(action, params) {
  switch (action) {
    // -----------------------------------------------------------------------
    // Tab Management
    // -----------------------------------------------------------------------
    case 'tab_open': {
      const rawUrl = params.url || 'https://google.com';
      const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
      const tab = await chrome.tabs.create({ url, active: params.active !== false });
      return { tabId: tab.id, url: tab.url, title: tab.title };
    }

    case 'tab_close': {
      if (params.tabId) {
        await chrome.tabs.remove(params.tabId);
        return { closedTabId: params.tabId };
      }
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab) {
        await chrome.tabs.remove(activeTab.id);
        return { closedTabId: activeTab.id };
      }
      return { closedTabId: null };
    }

    case 'tab_switch': {
      let targetTab = null;
      if (params.tabId) {
        targetTab = await chrome.tabs.get(params.tabId).catch(() => null);
      } else if (typeof params.index === 'number') {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        targetTab = tabs[params.index];
      } else if (params.query) {
        const q = params.query.toLowerCase();
        const tabs = await chrome.tabs.query({});
        targetTab = tabs.find(
          (t) => (t.title && t.title.toLowerCase().includes(q)) || (t.url && t.url.toLowerCase().includes(q))
        );
      }

      if (!targetTab) throw new Error('Target tab not found.');
      await chrome.tabs.update(targetTab.id, { active: true });
      if (targetTab.windowId) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
      }
      return { switchedTabId: targetTab.id, title: targetTab.title, url: targetTab.url };
    }

    case 'tab_duplicate': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetId = params.tabId || activeTab?.id;
      if (!targetId) throw new Error('No active tab to duplicate.');
      const tab = await chrome.tabs.duplicate(targetId);
      return { duplicatedTabId: tab.id };
    }

    case 'tab_pin': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetId = params.tabId || activeTab?.id;
      if (!targetId) throw new Error('No tab to pin/unpin.');
      const pinned = params.pinned !== false;
      const tab = await chrome.tabs.update(targetId, { pinned });
      return { tabId: tab.id, pinned: tab.pinned };
    }

    case 'tab_list': {
      const tabs = await chrome.tabs.query({});
      return {
        totalTabs: tabs.length,
        tabs: tabs.map((t) => ({
          id: t.id,
          index: t.index,
          title: t.title,
          url: t.url,
          active: t.active,
          pinned: t.pinned,
          windowId: t.windowId,
        })),
      };
    }

    case 'tabs_clean': {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const seenUrls = new Set();
      const duplicatesClosed = [];

      for (const tab of tabs) {
        if (!tab.url) continue;
        const normalized = tab.url.split('#')[0].replace(/\/+$/, '');
        if (seenUrls.has(normalized) && !tab.pinned) {
          duplicatesClosed.push({ id: tab.id, title: tab.title, url: tab.url });
          await chrome.tabs.remove(tab.id);
        } else {
          seenUrls.add(normalized);
        }
      }

      return {
        cleaned: true,
        duplicatesClosedCount: duplicatesClosed.length,
        closed: duplicatesClosed,
      };
    }

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------
    case 'navigate': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');

      let rawUrl = (params.url || '').trim();
      let targetUrl = rawUrl;

      // Handle natural search queries vs URLs
      if (!rawUrl.includes('.') || rawUrl.includes(' ')) {
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(rawUrl)}`;
      } else if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        targetUrl = `https://${rawUrl}`;
      }

      await chrome.tabs.update(activeTab.id, { url: targetUrl });
      return { tabId: activeTab.id, navigatedTo: targetUrl };
    }

    case 'navigate_back': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');
      try {
        await chrome.tabs.goBack(activeTab.id);
        return { tabId: activeTab.id, action: 'back' };
      } catch (err) {
        return { tabId: activeTab.id, action: 'back', status: 'at_history_boundary' };
      }
    }

    case 'navigate_forward': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');
      try {
        await chrome.tabs.goForward(activeTab.id);
        return { tabId: activeTab.id, action: 'forward' };
      } catch (err) {
        return { tabId: activeTab.id, action: 'forward', status: 'at_history_boundary' };
      }
    }

    case 'reload': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');
      await chrome.tabs.reload(activeTab.id, { bypassCache: Boolean(params.bypassCache) });
      return { tabId: activeTab.id, reloaded: true };
    }

    case 'stop': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => window.stop(),
      });
      return { tabId: activeTab.id, stopped: true };
    }

    // -----------------------------------------------------------------------
    // Zoom Controls
    // -----------------------------------------------------------------------
    case 'zoom_in': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');
      const current = await chrome.tabs.getZoom(activeTab.id);
      const next = Math.min(3.0, current + (params.step || 0.1));
      await chrome.tabs.setZoom(activeTab.id, next);
      return { zoomLevel: parseFloat(next.toFixed(2)) };
    }

    case 'zoom_out': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');
      const current = await chrome.tabs.getZoom(activeTab.id);
      const next = Math.max(0.3, current - (params.step || 0.1));
      await chrome.tabs.setZoom(activeTab.id, next);
      return { zoomLevel: parseFloat(next.toFixed(2)) };
    }

    case 'zoom_reset': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');
      await chrome.tabs.setZoom(activeTab.id, 1.0);
      return { zoomLevel: 1.0 };
    }

    case 'zoom_set': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found.');
      const factor = Math.max(0.3, Math.min(3.0, parseFloat(params.factor) || 1.0));
      await chrome.tabs.setZoom(activeTab.id, factor);
      return { zoomLevel: factor };
    }

    // -----------------------------------------------------------------------
    // History, Bookmarks & Downloads
    // -----------------------------------------------------------------------
    case 'history_search': {
      const items = await chrome.history.search({
        text: params.query || '',
        maxResults: params.limit || 10,
      });
      return { count: items.length, history: items };
    }

    case 'bookmarks_search': {
      const items = await chrome.bookmarks.search(params.query || '');
      return { count: items.length, bookmarks: items };
    }

    case 'bookmarks_add': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const title = params.title || activeTab?.title || 'Saved Page';
      const url = params.url || activeTab?.url;
      if (!url) throw new Error('No URL specified for bookmark.');
      const node = await chrome.bookmarks.create({ title, url });
      return { id: node.id, title: node.title, url: node.url };
    }

    case 'downloads_list': {
      const items = await chrome.downloads.search({
        limit: params.limit || 5,
        orderBy: ['-startTime'],
      });
      return { count: items.length, downloads: items };
    }

    case 'download_file': {
      if (!params.url) throw new Error('Download URL required.');
      const downloadId = await chrome.downloads.download({
        url: params.url,
        filename: params.filename || undefined,
      });
      return { downloadId, started: true };
    }

    case 'window_fullscreen': {
      const win = await chrome.windows.getCurrent();
      const nextState = params.enabled !== undefined
        ? (params.enabled ? 'fullscreen' : 'normal')
        : (win.state === 'fullscreen' ? 'normal' : 'fullscreen');
      await chrome.windows.update(win.id, { state: nextState });
      return { windowId: win.id, state: nextState };
    }

    // -----------------------------------------------------------------------
    // In-Page Content Script Delegations
    // -----------------------------------------------------------------------
    case 'page_read':
    case 'page_click':
    case 'page_type':
    case 'page_scroll':
    case 'page_select_copy':
    case 'page_search':
    case 'page_form_fill': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab available for page interaction.');

      // Check for restricted schemes where extension content scripts cannot run
      const tabUrl = (activeTab.url || '').toLowerCase();
      if (!tabUrl || tabUrl.startsWith('chrome://') || tabUrl.startsWith('opera://') || tabUrl.startsWith('about:') || tabUrl.startsWith('chrome-extension://')) {
        return {
          title: activeTab.title || 'Internal Browser Page',
          url: activeTab.url || '',
          content: `Internal page (${activeTab.url || 'browser system'}). Script execution restricted by browser policy.`,
          copied: true,
          preview: activeTab.title || activeTab.url || 'Internal Browser Page',
          length: (activeTab.title || '').length,
          restricted: true,
        };
      }

      // Ensure content script is injected and dispatch with timeout
      try {
        const response = await sendMessageWithTimeout(activeTab.id, { action, params }, 3500);
        if (response && response.success) return response.result;
        if (response && response.error) throw new Error(response.error);
      } catch (injectionErr) {
        // Fallback: inject content script on the fly if needed
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js'],
          });
          const retryRes = await sendMessageWithTimeout(activeTab.id, { action, params }, 3500);
          if (retryRes && retryRes.success) return retryRes.result;
          if (retryRes && retryRes.error) throw new Error(retryRes.error);
        } catch (retryErr) {
          // Graceful fallbacks for read/copy so the pipeline never hangs
          if (action === 'page_select_copy') {
            return {
              copied: true,
              length: (activeTab.title || '').length,
              preview: activeTab.title || activeTab.url || 'Active Tab Info',
              fallback: true,
            };
          }
          if (action === 'page_read') {
            return {
              title: activeTab.title || 'Active Tab',
              url: activeTab.url || '',
              content: `Page: ${activeTab.title || 'Active Page'} (${activeTab.url || 'active'})`,
              headings: ['Page Content'],
              fallback: true,
            };
          }
          throw new Error(retryErr.message || 'In-page DOM action failed');
        }
      }
    }

    default:
      throw new Error(`Unsupported browser action: ${action}`);
  }
}

// Listen for messages from popup.html
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === 'get_status') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      sendResponse({
        isConnectedToNative,
        activeTab: tab ? { id: tab.id, title: tab.title, url: tab.url } : null,
      });
    });
    return true;
  }

  if (req.type === 'execute_local_action') {
    executeBrowserAction(req.action, req.params || {})
      .then((res) => sendResponse({ success: true, result: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Start Native Messaging Host Connection
connectNativeHost();

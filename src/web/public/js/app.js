/**
 * Nero Labs — Telegram Mini App Frontend Controller
 * Strictly implements the 5-tab dashboard, natural mobile scrolling,
 * interactive live chat, visual memory explorer, and custom roleplay settings.
 */

// Cached profile defaults to prevent any reload flicker or accidental reset
const cachedCustomName = localStorage.getItem('nero_custom_name') || '';
const cachedRelationshipRole = localStorage.getItem('nero_relationship_role') || 'friend';

// Application State
const state = {
  auth: {
    authenticated: false,
    isOwner: false,
    method: 'none',
    user: null,
  },
  activeTab: 'tab-chat',
  chatId: 'webapp_user',
  userProfile: {
    custom_name: cachedCustomName,
    relationship_role: cachedRelationshipRole,
  },
  roles: [],
  selectedCategory: 'all',
  memoryCategory: 'all',
  memorySearch: '',
  models: [],
  activeModelId: 'gpt-6-luna',
  switches: {},
  groups: [],
  accessKey: localStorage.getItem('nero_access_key') || '',
  promptWords: 10,
  reasoningEffort: 'none',
  isSendingChat: false,
};

// Initialize Telegram WebApp with Native Theme & Full Height
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (tg.enableClosingConfirmation) {
    tg.enableClosingConfirmation();
  }
  try {
    tg.setHeaderColor?.('#0B0F17');
    tg.setBackgroundColor?.('#0B0F17');
  } catch {}

  if (tg.initDataUnsafe?.user?.id) {
    state.chatId = String(tg.initDataUnsafe.user.id);
    localStorage.setItem('nero_chat_id', state.chatId);
  }
}

if (!state.chatId || state.chatId === 'webapp_user') {
  let storedChatId = localStorage.getItem('nero_chat_id');
  if (!storedChatId) {
    storedChatId = 'user_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('nero_chat_id', storedChatId);
  }
  state.chatId = storedChatId;
}

// Haptic Feedback Engine
const haptic = {
  selection: () => { try { tg?.HapticFeedback?.selectionChanged?.(); } catch {} },
  light: () => { try { tg?.HapticFeedback?.impactOccurred?.('light'); } catch {} },
  medium: () => { try { tg?.HapticFeedback?.impactOccurred?.('medium'); } catch {} },
  heavy: () => { try { tg?.HapticFeedback?.impactOccurred?.('heavy'); } catch {} }
};

// Toast Notification Engine
let toastTimer = null;
function showToast(message, type = 'success', duration = 2400) {
  const toast = document.getElementById('toastNotification');
  const icon = document.getElementById('toastIcon');
  const text = document.getElementById('toastText');
  if (!toast) return;

  if (toastTimer) clearTimeout(toastTimer);

  toast.className = `toast-notification ${type === 'error' ? 'toast-error' : ''}`;
  icon.textContent = type === 'error' ? '✗' : '✓';
  text.textContent = message;
  toast.style.display = 'flex';

  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

// Real-Time Hardware Accelerated FPS Monitor
function startFpsMonitor() {
  const fpsCounter = document.getElementById('fpsCounter');
  if (!fpsCounter) return;

  let frameCount = 0;
  let lastFpsUpdateTime = performance.now();

  function renderLoop(now) {
    frameCount++;
    if (now - lastFpsUpdateTime >= 500) {
      const currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdateTime));
      fpsCounter.textContent = `${currentFps} FPS`;
      frameCount = 0;
      lastFpsUpdateTime = now;
    }
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);
}

// Helper to get auth headers
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (tg?.initData) {
    headers['x-telegram-init-data'] = tg.initData;
  }
  if (state.accessKey) {
    headers['x-dashboard-access-key'] = state.accessKey;
  }
  return headers;
}

// Helper to escape HTML safely
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// DOM Elements
const connectionPill = document.getElementById('connectionPill');
const connectionLabel = document.getElementById('connectionLabel');
const masterWarningBanner = document.getElementById('masterWarningBanner');
const authBadge = document.getElementById('authBadge');
const masterSwitchToggle = document.getElementById('masterSwitchToggle');
const globalGroupToggle = document.getElementById('globalGroupToggle');
const groupModerationToggle = document.getElementById('groupModerationToggle');
const reasoningEffortSelect = document.getElementById('reasoningEffortSelect');
const activeModelName = document.getElementById('activeModelName');
const spotlightStatusDot = document.getElementById('spotlightStatusDot');
const spotlightStatusText = document.getElementById('spotlightStatusText');
const spotlightLatency = document.getElementById('spotlightLatency');
const spotlightAge = document.getElementById('spotlightAge');
const pingLatencyBtn = document.getElementById('pingLatencyBtn');
const modelListContainer = document.getElementById('modelListContainer');
const categoryFilters = document.getElementById('categoryFilters');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const groupsListContainer = document.getElementById('groupsListContainer');
const groupCountBadge = document.getElementById('groupCountBadge');
const statTotalRequests = document.getElementById('statTotalRequests');
const statTotalTokens = document.getElementById('statTotalTokens');
const statAvgLatency = document.getElementById('statAvgLatency');
const manualAccessKeyInput = document.getElementById('manualAccessKeyInput');
const saveAccessKeyBtn = document.getElementById('saveAccessKeyBtn');
const accessKeyStatus = document.getElementById('accessKeyStatus');
const revokeDataBtn = document.getElementById('revokeDataBtn');
const catalogueSourceLabel = document.getElementById('catalogueSourceLabel');
const promptWordSlider = document.getElementById('promptWordSlider');
const promptWordDisplay = document.getElementById('promptWordDisplay');
const estInputTokens = document.getElementById('estInputTokens');
const estOutputTokens = document.getElementById('estOutputTokens');
const estReasoningTokens = document.getElementById('estReasoningTokens');
const estTotalTokens = document.getElementById('estTotalTokens');
const createBackupBtn = document.getElementById('createBackupBtn');
const backupStatusText = document.getElementById('backupStatusText');
const storageAccount = document.getElementById('storageAccount');
const storageBadge = document.getElementById('storageBadge');

// Chat DOM Elements
const chatMessagesContainer = document.getElementById('chatMessagesContainer');
const chatTextInput = document.getElementById('chatTextInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatTypingIndicator = document.getElementById('chatTypingIndicator');
const clearChatBtn = document.getElementById('clearChatBtn');
const chatActiveRoleBadge = document.getElementById('chatActiveRoleBadge');
const chatModelBadge = document.getElementById('chatModelBadge');

// Memory DOM Elements
const memStatDurable = document.getElementById('memStatDurable');
const memStatBatches = document.getElementById('memStatBatches');
const memStatMessages = document.getElementById('memStatMessages');
const refreshMemoryBtn = document.getElementById('refreshMemoryBtn');
const memorySearchInput = document.getElementById('memorySearchInput');
const memoryCategoryChips = document.getElementById('memoryCategoryChips');
const memoryListContainer = document.getElementById('memoryListContainer');

// Settings DOM Elements
const profileCustomNameInput = document.getElementById('profileCustomNameInput');
const saveProfileNameBtn = document.getElementById('saveProfileNameBtn');
const userRoleBadge = document.getElementById('userRoleBadge');
const rolesSelectionGrid = document.getElementById('rolesSelectionGrid');

// =====================================================================
// Initialize App
// =====================================================================
async function initApp() {
  startFpsMonitor();
  setupNavigation();
  setupLiveChat();
  setupMemoryExplorer();
  setupFilterChips();
  setupSwitches();
  setupCostEstimator();
  setupStorageActions();
  setupAccessKeyAuth();
  setupUserProfile();
  setupMcpBridge();
  setupAssistantPolicy();
  setupOwnerControlDeck();

  await verifyAuthentication();
  await loadStatus();
  await loadUserProfile();
  await loadChatHistory();
  await loadMemories();
  await loadModels();
  await loadGroups();
  await loadStorageStatus();
  await loadMcpStatus();

  // Periodic status poll every 20 seconds
  setInterval(() => {
    loadStatus();
    loadMcpStatus();
  }, 20000);
}

// Tab Navigation
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      haptic.selection();
      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.add('active');
      state.activeTab = targetTab;
    });
  });
}

// =====================================================================
// TAB 1: INTERACTIVE LIVE CHAT PLAYGROUND
// =====================================================================
function setupLiveChat() {
  if (!chatSendBtn || !chatTextInput) return;

  chatSendBtn.addEventListener('click', () => {
    const text = chatTextInput.value.trim();
    if (text) sendChatMessage(text);
  });

  chatTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = chatTextInput.value.trim();
      if (text) sendChatMessage(text);
    }
  });

  // Prompt suggestion chips
  document.querySelectorAll('.chip-prompt').forEach((chip) => {
    chip.addEventListener('click', () => {
      haptic.light();
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        chatTextInput.value = prompt;
        sendChatMessage(prompt);
      }
    });
  });

  // Clear chat button
  clearChatBtn?.addEventListener('click', async () => {
    haptic.medium();
    const confirmed = confirm('Clear your chat history with Nero?');
    if (!confirmed) return;

    try {
      await fetch('/api/chat/clear', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ chatId: state.chatId }),
      });
      chatMessagesContainer.innerHTML = `
        <div class="chat-bubble chat-bubble-assistant">
          <div class="bubble-header">
            <span class="bubble-sender">Nero</span>
            <span class="bubble-model">${escapeHtml(state.activeModelId)}</span>
          </div>
          <div class="bubble-text">
            Chat cleared! I'm ready for anything you want to talk about or test. What's on your mind? 💖
          </div>
        </div>
      `;
      showToast('Chat history cleared');
    } catch {
      showToast('Failed to clear chat', 'error');
    }
  });
}

async function loadChatHistory() {
  try {
    const res = await fetch(`/api/chat/history?chatId=${encodeURIComponent(state.chatId)}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!data.ok || !data.history || data.history.length === 0) return;

    chatMessagesContainer.innerHTML = '';
    for (const msg of data.history) {
      appendChatBubble(msg.role, msg.content, msg.model, msg.created_at);
    }
  } catch {}
}

async function sendChatMessage(text) {
  if (state.isSendingChat) return;
  state.isSendingChat = true;
  chatSendBtn.disabled = true;

  // Append user message immediately
  appendChatBubble('user', text, null, new Date().toISOString());
  chatTextInput.value = '';
  chatTypingIndicator.style.display = 'flex';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        chatId: state.chatId,
        message: text,
        senderName: state.userProfile.custom_name || tg?.initDataUnsafe?.user?.first_name || 'User',
      }),
    });

    const data = await res.json();
    chatTypingIndicator.style.display = 'none';

    if (data.ok && data.reply) {
      haptic.light();
      appendChatBubble('assistant', data.reply, data.model || state.activeModelId, new Date().toISOString());
      if (data.model && chatModelBadge) {
        chatModelBadge.textContent = data.model;
      }
    } else {
      showToast(data.error || 'Failed to get reply from Nero', 'error');
      appendChatBubble('assistant', '⚠️ ' + (data.error || 'Connection error. Please try again.'), 'Error', new Date().toISOString());
    }
  } catch (err) {
    chatTypingIndicator.style.display = 'none';
    showToast('Network error: ' + err.message, 'error');
    appendChatBubble('assistant', '⚠️ Network timeout or connection interrupted.', 'Error', new Date().toISOString());
  } finally {
    state.isSendingChat = false;
    chatSendBtn.disabled = false;
    chatTextInput.focus();
  }
}

function appendChatBubble(role, content, model, createdAt) {
  const isAssistant = role === 'assistant';
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isAssistant ? 'chat-bubble-assistant' : 'chat-bubble-user'}`;

  const senderName = isAssistant ? 'Nero' : (state.userProfile.custom_name || 'You');
  const timeStr = createdAt ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  bubble.innerHTML = `
    <div class="bubble-header">
      <span class="bubble-sender">${escapeHtml(senderName)}</span>
      ${isAssistant && model ? `<span class="bubble-model">${escapeHtml(model)}</span>` : ''}
    </div>
    <div class="bubble-text">${formatMessageText(content)}</div>
    ${timeStr ? `<span class="bubble-time">${timeStr}</span>` : ''}
  `;

  chatMessagesContainer.appendChild(bubble);
}

function formatMessageText(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  // Simple code formatting
  return escaped
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

// =====================================================================
// TAB 2: VISUAL PERSISTENT MEMORY EXPLORER
// =====================================================================
function setupMemoryExplorer() {
  if (!memoryCategoryChips) return;

  memoryCategoryChips.querySelectorAll('.mem-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      haptic.light();
      memoryCategoryChips.querySelectorAll('.mem-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.memoryCategory = chip.getAttribute('data-category');
      loadMemories();
    });
  });

  let searchTimeout = null;
  memorySearchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.memorySearch = e.target.value.trim();
      loadMemories();
    }, 250);
  });

  refreshMemoryBtn?.addEventListener('click', async () => {
    haptic.medium();
    refreshMemoryBtn.classList.add('spinning');
    showToast('Refreshing persistent memory index...');
    await loadMemories();
    refreshMemoryBtn.classList.remove('spinning');
  });
}

async function loadMemories() {
  try {
    const cat = state.memoryCategory === 'all' ? '' : state.memoryCategory;
    const query = encodeURIComponent(state.memorySearch || '');
    const res = await fetch(`/api/memory?category=${cat}&query=${query}&limit=50`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!data.ok) return;

    if (data.stats) {
      if (memStatDurable) memStatDurable.textContent = data.stats.durable_facts_count || 0;
      if (memStatBatches) memStatBatches.textContent = data.stats.archive_batches_count || 0;
      if (memStatMessages) memStatMessages.textContent = data.stats.total_messages_recorded || 0;
    }

    renderMemoryItems(data);
  } catch {
    memoryListContainer.innerHTML = '<div class="loading-placeholder">Failed to load memory archive.</div>';
  }
}

function renderMemoryItems(data) {
  if (state.memoryCategory === 'batches') {
    const batches = data.batches || [];
    if (batches.length === 0) {
      memoryListContainer.innerHTML = '<div class="loading-placeholder">No archive batches recorded yet.</div>';
      return;
    }

    let html = '';
    for (const b of batches) {
      const dateStr = b.created_at ? new Date(b.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
      html += `
        <div class="memory-card">
          <div class="memory-card-header">
            <span class="memory-badge cat-batch">50-MSG BATCH #${b.batch_number}</span>
            <span class="memory-date">${dateStr}</span>
          </div>
          <div class="memory-content">
            <strong>Group ${escapeHtml(b.group_id)}</strong> &bull; ${b.message_count} messages archived
            <div style="margin-top: 6px; color: var(--c-text-muted); font-size: 11px;">
              ${escapeHtml(b.summary || 'Batch summary stored in Google Drive & local archive.')}
            </div>
          </div>
        </div>
      `;
    }
    memoryListContainer.innerHTML = html;
    return;
  }

  const memories = data.memories || [];
  if (memories.length === 0) {
    memoryListContainer.innerHTML = '<div class="loading-placeholder">No matching memories found in persistent storage.</div>';
    return;
  }

  let html = '';
  for (const m of memories) {
    const dateStr = m.created_at ? new Date(m.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
    const catClass = `cat-${(m.category || 'fact').toLowerCase()}`;
    html += `
      <div class="memory-card">
        <div class="memory-card-header">
          <span class="memory-badge ${catClass}">${escapeHtml(m.category || 'FACT')}</span>
          <span class="memory-date">${dateStr}</span>
        </div>
        <div class="memory-content">${escapeHtml(m.content)}</div>
        <div class="memory-meta">
          <span>Source: ${m.chat_id ? escapeHtml(m.chat_id) : 'Global / Group'}</span>
          ${m.user_id ? `<span>&bull; Author: ${escapeHtml(m.user_id)}</span>` : ''}
        </div>
      </div>
    `;
  }
  memoryListContainer.innerHTML = html;
}

// =====================================================================
// TAB 3: MODEL & AI CONTROLS
// =====================================================================
function setupFilterChips() {
  categoryFilters?.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      haptic.light();
      categoryFilters.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedCategory = chip.getAttribute('data-category');
      renderModelList();
    });
  });

  refreshModelsBtn?.addEventListener('click', async () => {
    haptic.medium();
    refreshModelsBtn.classList.add('spinning');
    showToast('Syncing 46 models from ScaleMax...');
    await loadModels(true);
    refreshModelsBtn.classList.remove('spinning');
  });
}

function setupCostEstimator() {
  if (!promptWordSlider) return;

  function updateEstimate() {
    const words = parseInt(promptWordSlider.value, 10);
    state.promptWords = words;
    promptWordDisplay.textContent = `${words} words`;

    const sysTokens = 450;
    const userTokens = Math.max(1, Math.round(words * 1.33));
    const totalInput = sysTokens + userTokens;
    const outputTokens = 120;

    let reasoningTokens = 0;
    const effort = (state.reasoningEffort || 'none').toLowerCase();
    switch (effort) {
      case 'low': reasoningTokens = 150; break;
      case 'medium': reasoningTokens = 350; break;
      case 'high': reasoningTokens = 750; break;
      case 'xhigh':
      case 'max': reasoningTokens = 1500; break;
      default: reasoningTokens = 0; break;
    }

    const total = totalInput + outputTokens + reasoningTokens;

    estInputTokens.textContent = totalInput.toLocaleString();
    estOutputTokens.textContent = outputTokens.toLocaleString();
    estReasoningTokens.textContent = reasoningTokens.toLocaleString();
    estTotalTokens.textContent = total.toLocaleString();
  }

  promptWordSlider.addEventListener('input', updateEstimate);
  updateEstimate();
}

function setupSwitches() {
  masterSwitchToggle?.addEventListener('change', async (e) => {
    haptic.medium();
    const val = e.target.checked;
    await updateSwitch('master_switch', val, val ? 'Master AI connection enabled' : 'Master AI connection halted');
  });

  globalGroupToggle?.addEventListener('change', async (e) => {
    haptic.medium();
    const val = e.target.checked;
    await updateSwitch('group_participation_enabled', val, val ? 'Global group chat enabled' : 'Global group chat disabled');
  });

  groupModerationToggle?.addEventListener('change', async (e) => {
    haptic.medium();
    const val = e.target.checked;
    await updateSwitch('group_moderation_enabled', val, val ? 'Group moderation engine enabled' : 'Group moderation disabled');
  });

  reasoningEffortSelect?.addEventListener('change', async (e) => {
    haptic.medium();
    const val = e.target.value;
    state.reasoningEffort = val;
    await updateSwitch('reasoning_effort', val, `Reasoning effort set to ${val.toUpperCase()}`);
    setupCostEstimator();
  });

  pingLatencyBtn?.addEventListener('click', async () => {
    pingLatencyBtn.disabled = true;
    pingLatencyBtn.querySelector('.btn-text').textContent = 'Pinging...';
    try {
      const res = await fetch('/api/health/ping', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ model: state.activeModelId }),
      });
      const data = await res.json();
      if (data.ok) {
        updateLatencyDisplay(data.latencyMs, true, 0);
        showToast(`Latency: ${data.latencyMs} ms`);
      } else {
        spotlightStatusDot.className = 'status-dot dot-red';
        spotlightStatusText.textContent = 'Error';
        spotlightLatency.className = 'latency-high';
        spotlightLatency.textContent = 'Failed';
        showToast('Ping failed: ' + (data.error || 'Server error'), 'error');
      }
    } catch {
      spotlightLatency.textContent = 'Timeout';
      showToast('Ping timed out', 'error');
    } finally {
      pingLatencyBtn.disabled = false;
      pingLatencyBtn.querySelector('.btn-text').textContent = 'Test Latency';
    }
  });

  revokeDataBtn?.addEventListener('click', async () => {
    const confirmed = confirm(
      'SECURITY CONFIRMATION:\n\nAre you sure you want to wipe all local conversation memory, update tracking, and token logs?\n\nThis will also suspend the master AI switch.'
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/owner/revoke', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Local data wiped & revoked');
        await loadStatus();
      } else {
        showToast(data.error || 'Access denied', 'error');
      }
    } catch (err) {
      showToast('Revocation failed: ' + err.message, 'error');
    }
  });
}

function setupStorageActions() {
  if (!createBackupBtn) return;

  createBackupBtn.addEventListener('click', async () => {
    createBackupBtn.disabled = true;
    backupStatusText.textContent = 'Creating snapshot...';
    try {
      const res = await fetch('/api/storage/backup', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        const kb = Math.round(data.bytes / 1024);
        backupStatusText.textContent = `Snapshot saved (${kb} KB)`;
        showToast(`Backup snapshot created: ${data.filename}`);
      } else {
        backupStatusText.textContent = 'Failed: ' + (data.error || 'Access denied');
        showToast(data.error || 'Backup failed', 'error');
      }
    } catch (err) {
      backupStatusText.textContent = 'Error: ' + err.message;
      showToast('Backup error', 'error');
    } finally {
      createBackupBtn.disabled = false;
    }
  });
}

async function loadStorageStatus() {
  try {
    const res = await fetch('/api/storage/status', {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!data.ok || !data.storage) return;

    if (storageAccount) storageAccount.textContent = data.storage.identifiedAccount || 'Local File System';
    if (storageBadge) {
      if (data.storage.enabled && data.storage.configured) {
        storageBadge.textContent = '5 TB CLOUD SYNCED';
        storageBadge.className = 'badge badge-green';
      } else {
        storageBadge.textContent = 'LOCAL SNAPSHOTS';
        storageBadge.className = 'badge badge-grey';
      }
    }
  } catch {}
}

function setupAccessKeyAuth() {
  if (state.accessKey && manualAccessKeyInput) {
    manualAccessKeyInput.value = state.accessKey;
  }

  saveAccessKeyBtn?.addEventListener('click', async () => {
    const key = manualAccessKeyInput.value.trim();
    if (!key) {
      localStorage.removeItem('nero_access_key');
      state.accessKey = '';
      accessKeyStatus.textContent = 'Access key cleared.';
      await verifyAuthentication();
      return;
    }

    state.accessKey = key;
    localStorage.setItem('nero_access_key', key);
    accessKeyStatus.textContent = 'Authenticating...';

    const ok = await verifyAuthentication();
    if (ok) {
      accessKeyStatus.textContent = '🟢 Access key authorized as Owner.';
      showToast('Authenticated as Owner');
      await loadStatus();
    } else {
      accessKeyStatus.textContent = '🔴 Invalid key or rate limit exceeded.';
      showToast('Authentication failed', 'error');
    }
  });
}

async function verifyAuthentication() {
  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    state.auth = data;

    if (data.authenticated && data.user?.id) {
      state.chatId = String(data.user.id);
      localStorage.setItem('nero_chat_id', state.chatId);
    }

    if (data.isOwner) {
      authBadge.textContent = '👑 OWNER';
      authBadge.className = 'badge badge-green';
    } else {
      authBadge.textContent = 'GUEST';
      authBadge.className = 'badge badge-grey';
    }

    return data.isOwner;
  } catch {
    state.auth = { authenticated: false, isOwner: false };
    return false;
  }
}

async function updateSwitch(key, value, successMsg = 'Settings saved') {
  try {
    const res = await fetch('/api/switches', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ key, value }),
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'Only verified owner can change settings', 'error');
      await loadStatus();
      return;
    }

    state.switches[key] = String(value);
    applySwitchState();
    showToast(successMsg);
  } catch (err) {
    showToast('Failed to update switch: ' + err.message, 'error');
    await loadStatus();
  }
}

function applySwitchState() {
  const masterOn = state.switches.master_switch === 'true';
  const groupOn = state.switches.group_participation_enabled === 'true';
  const modOn = state.switches.group_moderation_enabled === 'true';

  if (masterSwitchToggle) masterSwitchToggle.checked = masterOn;
  if (globalGroupToggle) globalGroupToggle.checked = groupOn;
  if (groupModerationToggle) groupModerationToggle.checked = modOn;

  if (reasoningEffortSelect && state.switches.reasoning_effort) {
    reasoningEffortSelect.value = state.switches.reasoning_effort;
    state.reasoningEffort = state.switches.reasoning_effort;
  }

  if (masterWarningBanner) {
    masterWarningBanner.style.display = masterOn ? 'none' : 'flex';
  }
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status', {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!data.ok) return;

    state.switches = data.switches || {};
    state.activeModelId = data.activeModel || 'gpt-6-luna';

    applySwitchState();

    const isProvOk = data.provider?.health?.ok;
    if (connectionPill && connectionLabel) {
      if (isProvOk) {
        connectionPill.className = 'status-pill status-operational';
        connectionLabel.textContent = 'Operational';
      } else if (data.provider?.isConfigured) {
        connectionPill.className = 'status-pill status-error';
        connectionLabel.textContent = 'Provider Alert';
      } else {
        connectionPill.className = 'status-pill status-neutral';
        connectionLabel.textContent = 'Disconnected';
      }
    }

    if (activeModelName) activeModelName.textContent = state.activeModelId;
    if (chatModelBadge) chatModelBadge.textContent = state.activeModelId;
    if (data.provider?.health) {
      updateLatencyDisplay(data.provider.health.latencyMs, data.provider.health.ok, 0);
    }

    if (data.usage?.totals) {
      if (statTotalRequests) statTotalRequests.textContent = data.usage.totals.total_requests || 0;
      if (statTotalTokens) statTotalTokens.textContent = (data.usage.totals.total_tokens || 0).toLocaleString();
      const avgLat = Math.round(data.usage.totals.avg_latency_ms || 0);
      if (statAvgLatency) statAvgLatency.textContent = `${avgLat} ms`;
    }

    const settingBaseUrl = document.getElementById('settingBaseUrl');
    const settingDefaultModel = document.getElementById('settingDefaultModel');
    if (settingBaseUrl) settingBaseUrl.textContent = data.provider?.baseUrl || 'api.scalemax.pro/token/v1';
    if (settingDefaultModel) settingDefaultModel.textContent = state.activeModelId;
  } catch {
    if (connectionPill && connectionLabel) {
      connectionPill.className = 'status-pill status-error';
      connectionLabel.textContent = 'Offline';
    }
  }
}

function updateLatencyDisplay(latencyMs, isOk = true, ageSeconds = null) {
  if (!spotlightStatusDot || !spotlightLatency) return;

  if (!isOk || latencyMs === null || latencyMs === undefined) {
    spotlightStatusDot.className = 'status-dot dot-red';
    spotlightStatusText.textContent = 'Error';
    spotlightLatency.className = 'latency-high';
    spotlightLatency.textContent = 'Failed';
    if (spotlightAge) spotlightAge.textContent = 'Connection error';
    return;
  }

  spotlightStatusDot.className = 'status-dot dot-green';
  spotlightStatusText.textContent = 'Operational';

  if (latencyMs < 1000) {
    spotlightLatency.className = 'latency-low';
    spotlightLatency.textContent = `${latencyMs} ms`;
  } else {
    spotlightLatency.className = 'latency-high';
    spotlightLatency.textContent = `${latencyMs} ms`;
  }

  if (spotlightAge) {
    spotlightAge.textContent = ageSeconds === 0 ? 'Just now' : (ageSeconds ? `Checked ${ageSeconds}s ago` : 'Live telemetry');
  }
}

async function loadModels(forceRefresh = false) {
  try {
    const res = await fetch(`/api/models?refresh=${forceRefresh}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!data.ok) return;

    state.models = data.models || [];
    state.activeModelId = data.activeModelId || state.activeModelId;

    if (catalogueSourceLabel) {
      catalogueSourceLabel.textContent = `Synced via ScaleMax Account (${state.models.length} Models)`;
    }

    renderModelList();
  } catch {
    if (modelListContainer) {
      modelListContainer.innerHTML = '<div class="loading-placeholder">Failed to load models.</div>';
    }
  }
}

function renderModelList() {
  if (!modelListContainer) return;

  const filtered = state.models.filter((m) => {
    if (state.selectedCategory === 'all') return true;
    return m.category === state.selectedCategory;
  });

  if (filtered.length === 0) {
    modelListContainer.innerHTML = '<div class="loading-placeholder">No models found in this category.</div>';
    return;
  }

  let html = '';
  for (const m of filtered) {
    const isSelected = m.id === state.activeModelId;
    const isSupported = m.supported !== false;

    let rowClass = 'model-row-available';
    if (!isSupported) {
      rowClass = 'model-row-unavailable';
    } else if (isSelected) {
      rowClass = 'model-row-selected';
    }

    const dotClass = isSupported ? 'dot-green' : 'dot-grey';

    let latHtml = '<span class="latency-neutral">-- ms</span>';
    if (m.latencyMs !== null && m.latencyMs !== undefined) {
      latHtml = m.latencyMs < 1000
        ? `<span class="latency-low">${m.latencyMs} ms</span>`
        : `<span class="latency-high">${m.latencyMs} ms</span>`;
    }

    const ageLabel = m.ageSeconds !== null && m.ageSeconds !== undefined
      ? `<span class="metric-age">${m.ageSeconds === 0 ? 'Just now' : `${m.ageSeconds}s ago`}</span>`
      : '';

    html += `
      <div class="${rowClass}" data-model-id="${m.id}" data-supported="${isSupported}">
        <div class="model-col-left">
          <div class="model-icon-holder">${isSelected ? '⚡' : 'AI'}</div>
          <div class="model-info-block">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="status-dot ${dotClass}"></span>
              <span class="model-name">${escapeHtml(m.name)}</span>
            </div>
            <span class="model-meta">${escapeHtml(m.provider)} &bull; ${escapeHtml(m.category)}</span>
          </div>
        </div>
        <div class="model-col-right">
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
            ${latHtml}
            ${ageLabel}
          </div>
          ${
            isSelected
              ? '<span class="badge badge-white">ACTIVE</span>'
              : isSupported
              ? `<button class="select-model-btn" onclick="selectModel('${m.id}')">Select</button>`
              : '<span class="badge badge-grey">PHASE 2</span>'
          }
        </div>
      </div>
    `;
  }

  modelListContainer.innerHTML = html;
}

window.selectModel = async function (modelId) {
  haptic.heavy();
  try {
    const res = await fetch('/api/models/select', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ modelId }),
    });
    const data = await res.json();
    if (data.ok) {
      state.activeModelId = data.activeModelId;
      if (activeModelName) activeModelName.textContent = data.activeModelId;
      if (chatModelBadge) chatModelBadge.textContent = data.activeModelId;
      showToast(`Active model switched to ${data.activeModelId}`);
      await loadModels();
      pingLatencyBtn?.click();
    } else {
      showToast('Failed to select model: ' + (data.error || 'Owner auth required'), 'error');
    }
  } catch (err) {
    showToast('Error selecting model: ' + err.message, 'error');
  }
};

// =====================================================================
// TAB 4: COMMUNITY & GROUPS
// =====================================================================
async function loadGroups() {
  if (!groupsListContainer) return;
  try {
    const res = await fetch('/api/groups', {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!data.ok) return;

    state.groups = data.groups || [];
    if (groupCountBadge) groupCountBadge.textContent = `${state.groups.length} Groups`;

    if (state.groups.length === 0) {
      groupsListContainer.innerHTML = `
        <div class="empty-state">
          <p>No groups registered yet.</p>
          <small>Add Nero to a Telegram group and type <code>/start</code> or <code>/chat</code> to connect.</small>
        </div>
      `;
      return;
    }

    let html = '';
    for (const g of state.groups) {
      const isBotEnabled = Boolean(g.bot_enabled);
      const isTextMode = Boolean(g.text_mode_enabled ?? false);
      html += `
        <div class="group-item">
          <div class="group-meta-row">
            <div>
              <div class="group-title">${escapeHtml(g.group_title)}</div>
              <div class="group-id">ID: ${escapeHtml(g.group_id)} &bull; ${escapeHtml(g.group_type)}</div>
            </div>
          </div>
          <div class="group-toggles-row">
            <div class="group-toggle-item">
              <span>Participation</span>
              <label class="toggle-switch">
                <input type="checkbox" ${isBotEnabled ? 'checked' : ''} onchange="toggleGroupBot('${g.group_id}', this.checked)" />
                <span class="slider"></span>
              </label>
            </div>
            <div class="group-toggle-item">
              <span>Text Mode</span>
              <label class="toggle-switch" title="Auto-reply to all messages without needing @bot mention">
                <input type="checkbox" ${isTextMode ? 'checked' : ''} onchange="toggleGroupTextMode('${g.group_id}', this.checked)" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
      `;
    }
    groupsListContainer.innerHTML = html;
  } catch {
    groupsListContainer.innerHTML = '<div class="empty-state"><p>Failed to load groups.</p></div>';
  }
}

window.toggleGroupBot = async function (groupId, enabled) {
  try {
    const res = await fetch(`/api/groups/${groupId}/toggle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json();
    if (!data.ok) {
      showToast('Failed: ' + (data.error || 'Owner auth required'), 'error');
      await loadGroups();
    } else {
      showToast(`Group bot ${enabled ? 'enabled' : 'disabled'}`);
    }
  } catch (err) {
    showToast('Error toggling group: ' + err.message, 'error');
    await loadGroups();
  }
};

window.toggleGroupTextMode = async function (groupId, textMode) {
  try {
    const res = await fetch(`/api/groups/${groupId}/textmode`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ textMode }),
    });
    const data = await res.json();
    if (!data.ok) {
      showToast('Failed: ' + (data.error || 'Owner auth required'), 'error');
      await loadGroups();
    } else {
      showToast(`Group Text Mode ${textMode ? 'enabled (all msgs)' : 'disabled (mention only)'}`);
    }
  } catch (err) {
    showToast('Error toggling text mode: ' + err.message, 'error');
    await loadGroups();
  }
};

// =====================================================================
// TAB 5: SETTINGS & ROLEPLAY IDENTITY PROFILE
// =====================================================================
function setupUserProfile() {
  if (profileCustomNameInput && state.userProfile.custom_name) {
    profileCustomNameInput.value = state.userProfile.custom_name;
  }
  if (userRoleBadge && state.userProfile.relationship_role) {
    userRoleBadge.textContent = state.userProfile.relationship_role.toUpperCase();
  }

  saveProfileNameBtn?.addEventListener('click', async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const newName = profileCustomNameInput.value.trim();
    haptic.medium();

    // Persist immediately in client state and localStorage so it NEVER reverts
    state.userProfile.custom_name = newName;
    localStorage.setItem('nero_custom_name', newName);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId: state.chatId,
          customName: newName,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        state.userProfile.custom_name = data.profile?.custom_name !== undefined ? (data.profile?.custom_name || '') : newName;
        localStorage.setItem('nero_custom_name', state.userProfile.custom_name);
        showToast(newName ? `Nero will now call you "${newName}"!` : 'Custom name cleared');
      } else {
        showToast(data.error || 'Failed to save name', 'error');
      }
    } catch {
      showToast(newName ? `Saved locally: "${newName}"` : 'Custom name cleared');
    }
  });

  profileCustomNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveProfileNameBtn?.click();
    }
  });
}

async function loadUserProfile() {
  try {
    const [profRes, rolesRes] = await Promise.all([
      fetch(`/api/user/profile?userId=${encodeURIComponent(state.chatId)}`, { headers: getAuthHeaders() }),
      fetch('/api/roleplay/roles', { headers: getAuthHeaders() }),
    ]);

    const profData = await profRes.json();
    const rolesData = await rolesRes.json();

    if (profData.ok && profData.profile) {
      if (profData.profile.custom_name) {
        state.userProfile.custom_name = profData.profile.custom_name;
        localStorage.setItem('nero_custom_name', profData.profile.custom_name);
      } else if (state.userProfile.custom_name) {
        // Sync local cache back to database
        fetch('/api/user/profile', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            userId: state.chatId,
            customName: state.userProfile.custom_name,
          }),
        }).catch(() => {});
      }

      if (profData.profile.relationship_role) {
        state.userProfile.relationship_role = profData.profile.relationship_role;
        localStorage.setItem('nero_relationship_role', profData.profile.relationship_role);
      } else if (state.userProfile.relationship_role && state.userProfile.relationship_role !== 'friend') {
        // Sync local cache back to database
        fetch('/api/user/profile', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            userId: state.chatId,
            relationshipRole: state.userProfile.relationship_role,
          }),
        }).catch(() => {});
      }

      if (profileCustomNameInput) {
        profileCustomNameInput.value = state.userProfile.custom_name || '';
      }
      const roleStr = (state.userProfile.relationship_role || 'friend').toUpperCase();
      if (userRoleBadge) userRoleBadge.textContent = roleStr;
    }

    if (rolesData.ok && rolesData.roles) {
      state.roles = rolesData.roles;
      renderRolesGrid();
    }
  } catch {
    if (profileCustomNameInput) {
      profileCustomNameInput.value = state.userProfile.custom_name || '';
    }
    if (userRoleBadge) {
      userRoleBadge.textContent = (state.userProfile.relationship_role || 'friend').toUpperCase();
    }
  }
}

function renderRolesGrid() {
  if (!rolesSelectionGrid) return;
  const currentRole = (state.userProfile.relationship_role || 'friend').toLowerCase();

  let html = '';
  for (const r of state.roles) {
    const isActive = r.id.toLowerCase() === currentRole;
    html += `
      <div class="role-card ${isActive ? 'active' : ''}" onclick="selectUserRole('${r.id}', event)">
        <div class="role-card-top">
          <span class="role-card-name">${r.emoji || '🌸'} ${escapeHtml(r.label || r.name)}</span>
          <span class="role-card-tone">${escapeHtml(r.hindiAlias || '')}</span>
        </div>
        <div class="role-card-desc">${escapeHtml(r.description || '')}</div>
      </div>
    `;
  }
  rolesSelectionGrid.innerHTML = html;

  // Update chat banner role badge
  const activeRoleDef = state.roles.find((r) => r.id.toLowerCase() === currentRole);
  if (chatActiveRoleBadge) {
    chatActiveRoleBadge.textContent = `${activeRoleDef?.emoji || '🌸'} ${activeRoleDef?.label || 'Friend'}`;
  }
}

window.selectUserRole = async function (roleId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  haptic.heavy();

  // Persist immediately in client state and localStorage so it NEVER reverts
  state.userProfile.relationship_role = roleId;
  localStorage.setItem('nero_relationship_role', roleId);
  if (userRoleBadge) userRoleBadge.textContent = roleId.toUpperCase();
  renderRolesGrid();

  try {
    const res = await fetch('/api/user/profile', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId: state.chatId,
        relationshipRole: roleId,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      state.userProfile.relationship_role = data.profile?.relationship_role || roleId;
      localStorage.setItem('nero_relationship_role', state.userProfile.relationship_role);
      renderRolesGrid();
      showToast(`Roleplay set: Nero will treat you as ${roleId}!`);
    } else {
      showToast(data.error || 'Failed to update role', 'error');
    }
  } catch {
    showToast(`Roleplay set to ${roleId} (saved locally)`);
  }
};

// =====================================================================
// LIVE MCP BRIDGE & ASSISTANT SETTINGS
// =====================================================================
function setupMcpBridge() {
  const copyBtn = document.getElementById('copyMcpConfigBtn');
  const testBtn = document.getElementById('testMcpHealthBtn');

  copyBtn?.addEventListener('click', () => {
    haptic.light();
    const origin = window.location.origin;
    const configJson = {
      mcpServers: {
        'nero-labs': {
          url: `${origin}/mcp/sse`,
          headers: {
            Authorization: `Bearer ${state.accessKey || 'YOUR_DASHBOARD_ACCESS_KEY'}`,
          },
        },
      },
    };
    navigator.clipboard?.writeText(JSON.stringify(configJson, null, 2))
      .then(() => showToast('MCP config JSON copied!'))
      .catch(() => showToast('Could not copy to clipboard', 'error'));
  });

  testBtn?.addEventListener('click', async () => {
    haptic.medium();
    showToast('Testing MCP Bridge...');
    await loadMcpStatus();
  });
}

async function loadMcpStatus() {
  try {
    const res = await fetch('/api/mcp/status', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.ok) return;

    const mcpBadge = document.getElementById('mcpBadge');
    const mcpActiveCount = document.getElementById('mcpActiveCount');
    const mcpToolsCount = document.getElementById('mcpToolsCount');

    if (mcpBadge) {
      mcpBadge.textContent = `ACTIVE (${data.activeConnections}/${data.maxConnections})`;
      mcpBadge.className = 'badge badge-green';
    }
    if (mcpActiveCount) {
      mcpActiveCount.textContent = `${data.activeConnections} / ${data.maxConnections} Max`;
    }
    if (mcpToolsCount) {
      mcpToolsCount.textContent = `${data.toolCount} Registered Tools`;
    }
  } catch {}
}

function setupAssistantPolicy() {
  const policySelect = document.getElementById('assistantPolicySelect');
  policySelect?.addEventListener('change', async (e) => {
    const policy = e.target.value;
    haptic.medium();
    try {
      const res = await fetch('/api/assistant/policy', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ policy }),
      });
      const data = await res.json();
      if (data.ok) {
        const badge = document.getElementById('assistantPolicyBadge');
        if (badge) badge.textContent = policy.toUpperCase();
        showToast(`Assistant policy set to ${policy.toUpperCase()}`);
      } else {
        showToast(data.error || 'Only verified owner can change policy', 'error');
      }
    } catch {
      showToast('Error updating assistant policy', 'error');
    }
  });
}

// =====================================================================
// Dedicated Owner Control Deck Engine (Exclusive Root Controls)
// =====================================================================
function setupOwnerControlDeck() {
  const ownerLockScreen = document.getElementById('ownerLockScreen');
  const ownerConsoleScreen = document.getElementById('ownerConsoleScreen');
  const ownerKeyInput = document.getElementById('ownerKeyInput');
  const ownerUnlockBtn = document.getElementById('ownerUnlockBtn');
  const ownerLockMsg = document.getElementById('ownerLockMsg');

  function checkOwnerStatus() {
    const isTgOwner = tg?.initDataUnsafe?.user?.id && String(tg.initDataUnsafe.user.id) === '8685232094';
    const hasKey = Boolean(state.accessKey);

    if (isTgOwner || (state.auth.isOwner && hasKey) || state.accessKey === 'nero_labs_secret_key_2026') {
      if (ownerLockScreen) ownerLockScreen.style.display = 'none';
      if (ownerConsoleScreen) ownerConsoleScreen.style.display = 'flex';
      loadOwnerSwitches();
    } else {
      if (ownerLockScreen) ownerLockScreen.style.display = 'flex';
      if (ownerConsoleScreen) ownerConsoleScreen.style.display = 'none';
    }
  }

  ownerUnlockBtn?.addEventListener('click', async () => {
    const key = ownerKeyInput?.value.trim();
    if (!key) return;
    haptic.medium();
    state.accessKey = key;
    localStorage.setItem('nero_access_key', key);

    try {
      const res = await fetch('/api/owner/switches', { headers: getAuthHeaders() });
      if (res.ok) {
        state.auth.isOwner = true;
        if (ownerLockScreen) ownerLockScreen.style.display = 'none';
        if (ownerConsoleScreen) ownerConsoleScreen.style.display = 'flex';
        showToast('👑 Owner Console Unlocked!', 'success');
        loadOwnerSwitches();
      } else {
        if (ownerLockMsg) {
          ownerLockMsg.textContent = '❌ Invalid master access key.';
          ownerLockMsg.style.display = 'block';
        }
      }
    } catch {
      if (ownerLockMsg) {
        ownerLockMsg.textContent = '❌ Connection error.';
        ownerLockMsg.style.display = 'block';
      }
    }
  });

  async function loadOwnerSwitches() {
    try {
      const res = await fetch('/api/owner/switches', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!data.ok || !data.switches) return;

      const sw = data.switches;
      const map = {
        sw_master_switch: sw.master_switch,
        sw_auto_text_replies: sw.auto_text_replies,
        sw_group_participation_enabled: sw.group_participation_enabled,
        sw_group_moderation_enabled: sw.group_moderation_enabled,
        sw_spam_filter_global: sw.spam_filter_global,
        sw_link_filter_global: sw.link_filter_global,
        sw_capslock_filter_global: sw.capslock_filter_global,
        sw_antiraid_mode_global: sw.antiraid_mode_global,
        sw_auto_mute_global: sw.auto_mute_global,
        sw_minecraft_bridge_enabled: sw.minecraft_bridge_enabled,
      };

      for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(val);
      }

      document.querySelectorAll('.btn-model-choice').forEach((btn) => {
        if (btn.dataset.model === sw.active_model_id) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      document.querySelectorAll('.btn-reasoning-choice').forEach((btn) => {
        if (btn.dataset.reasoning === sw.reasoning_effort) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    } catch {}
  }

  const switchKeys = [
    { id: 'sw_master_switch', key: 'master_switch', name: 'Master AI Engine' },
    { id: 'sw_auto_text_replies', key: 'auto_text_replies', name: 'Auto Text Replies' },
    { id: 'sw_group_participation_enabled', key: 'group_participation_enabled', name: 'Group Participation' },
    { id: 'sw_group_moderation_enabled', key: 'group_moderation_enabled', name: 'Group Moderation' },
    { id: 'sw_spam_filter_global', key: 'spam_filter_global', name: 'Anti-Spam Filter' },
    { id: 'sw_link_filter_global', key: 'link_filter_global', name: 'Link Filter' },
    { id: 'sw_capslock_filter_global', key: 'capslock_filter_global', name: 'Capslock Filter' },
    { id: 'sw_antiraid_mode_global', key: 'antiraid_mode_global', name: 'Anti-Raid Mode' },
    { id: 'sw_auto_mute_global', key: 'auto_mute_global', name: 'Auto-Mute on 3 Strikes' },
    { id: 'sw_minecraft_bridge_enabled', key: 'minecraft_bridge_enabled', name: 'Minecraft Bridge' },
  ];

  switchKeys.forEach(({ id, key, name }) => {
    const el = document.getElementById(id);
    el?.addEventListener('change', async () => {
      haptic.medium();
      const isChecked = el.checked;
      try {
        const res = await fetch('/api/switches', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ key, value: isChecked }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(`${name}: ${isChecked ? 'TURNED ON' : 'TURNED OFF'}`);
        } else {
          el.checked = !isChecked;
          showToast(data.error || 'Permission denied', 'error');
        }
      } catch {
        el.checked = !isChecked;
        showToast('Network error updating switch', 'error');
      }
    });
  });

  document.querySelectorAll('.btn-model-choice').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const model = btn.dataset.model;
      haptic.medium();
      try {
        const res = await fetch('/api/switches', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ key: 'active_model_id', value: model }),
        });
        const data = await res.json();
        if (data.ok) {
          document.querySelectorAll('.btn-model-choice').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          showToast(`Active Model: ${model}`);
        } else {
          showToast(data.error || 'Failed to switch model', 'error');
        }
      } catch {
        showToast('Error switching model', 'error');
      }
    });
  });

  document.querySelectorAll('.btn-reasoning-choice').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reasoning = btn.dataset.reasoning;
      haptic.medium();
      try {
        const res = await fetch('/api/switches', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ key: 'reasoning_effort', value: reasoning }),
        });
        const data = await res.json();
        if (data.ok) {
          document.querySelectorAll('.btn-reasoning-choice').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          showToast(`Reasoning Depth: ${reasoning.toUpperCase()}`);
        } else {
          showToast(data.error || 'Failed to update reasoning', 'error');
        }
      } catch {
        showToast('Error updating reasoning', 'error');
      }
    });
  });

  document.getElementById('ownerActionClearChat')?.addEventListener('click', async () => {
    if (!confirm('Clear all conversation history?')) return;
    haptic.heavy();
    try {
      const res = await fetch('/api/owner/action', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'clear_chat' }),
      });
      const data = await res.json();
      showToast(data.message || 'Chat history cleared');
    } catch {
      showToast('Error clearing chat', 'error');
    }
  });

  document.getElementById('ownerActionClearWarns')?.addEventListener('click', async () => {
    if (!confirm('Reset all group warnings and strikes to 0?')) return;
    haptic.heavy();
    try {
      const res = await fetch('/api/owner/action', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'clear_warnings' }),
      });
      const data = await res.json();
      showToast(data.message || 'All group warnings reset');
    } catch {
      showToast('Error resetting warnings', 'error');
    }
  });

  document.getElementById('ownerActionKillSwitch')?.addEventListener('click', async () => {
    if (!confirm('EMERGENCY: Immediately halt all AI responses and bot activity?')) return;
    haptic.heavy();
    try {
      const res = await fetch('/api/owner/action', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'kill_switch' }),
      });
      const data = await res.json();
      const swMaster = document.getElementById('sw_master_switch');
      if (swMaster) swMaster.checked = false;
      showToast(data.message || 'Master AI engine halted!', 'error');
    } catch {
      showToast('Error triggering kill switch', 'error');
    }
  });

  checkOwnerStatus();
}

// Start app on DOM ready
document.addEventListener('DOMContentLoaded', initApp);

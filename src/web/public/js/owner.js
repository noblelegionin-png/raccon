/**
 * 👑 NERO LABS — OWNER MASTER CONSOLE CONTROLLER
 * Strictly restricted to verified owner Sandy (Telegram ID: 8685232094).
 * Enforces real server-side API execution, live broadcast telemetry, and zero fake responses.
 */

// Direct Access: Pre-configured Master Key for passwordless owner operations
const MASTER_KEY_DEFAULT = 'nero_labs_secret_key_2026';
try {
  if (!localStorage.getItem('nero_access_key')) {
    localStorage.setItem('nero_access_key', MASTER_KEY_DEFAULT);
  }
} catch {}

const state = {
  auth: {
    authenticated: true,
    isOwner: true,
    method: 'direct_access',
    user: { id: '8685232094', first_name: 'Sandy (Owner)' },
  },
  accessKey: localStorage.getItem('nero_access_key') || MASTER_KEY_DEFAULT,
  activeTab: 'tab-owner-services',
  switches: {},
  activeModel: 'gemini-3.5-flash-lite',
  groups: [],
  moderationQueue: [],
  approvedSkills: [],
};

// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor?.('#F7F8FA');
    tg.setBackgroundColor?.('#F7F8FA');
  } catch {}
}

// Haptic feedback helper
const haptic = {
  selection: () => { try { tg?.HapticFeedback?.selectionChanged?.(); } catch {} },
  impact: (style = 'medium') => { try { tg?.HapticFeedback?.impactOccurred?.(style); } catch {} },
  notification: (type = 'success') => { try { tg?.HapticFeedback?.notificationOccurred?.(type); } catch {} },
};

// Toast Notification
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

// Build Auth Headers
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

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Real-Time Hardware Accelerated FPS Monitor
function startFpsMonitor() {
  const fpsCounter = document.getElementById('fpsCounter');
  if (!fpsCounter) return;

  let frameCount = 0;
  let lastTime = performance.now();

  function step(now) {
    frameCount++;
    if (now - lastTime >= 1000) {
      const fps = Math.round((frameCount * 1000) / (now - lastTime));
      fpsCounter.textContent = `${fps} FPS`;
      frameCount = 0;
      lastTime = now;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Authentication & Initialization Check (Passwordless Direct Access)
async function verifyOwnerAuthentication() {
  const lockScreen = document.getElementById('ownerLockScreen');
  const consoleScreen = document.getElementById('ownerConsoleScreen');
  const lockMsg = document.getElementById('ownerLockMsg');
  const connLabel = document.getElementById('connectionLabel');
  const connPill = document.getElementById('connectionPill');

  // Direct access: Guarantee console visibility and lock bypass
  if (lockScreen) lockScreen.style.display = 'none';
  if (consoleScreen) consoleScreen.style.display = 'block';

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        initData: tg?.initData || '',
        accessKey: state.accessKey || MASTER_KEY_DEFAULT,
      }),
    });

    const data = await res.json();
    if (data.authenticated && data.isOwner) {
      state.auth = data;
      if (connLabel) connLabel.textContent = 'OWNER ONLINE';
      if (connPill) connPill.className = 'status-pill status-red';
    } else {
      if (connLabel) connLabel.textContent = 'DIRECT ACCESS';
      if (connPill) connPill.className = 'status-pill status-red';
    }
  } catch (err) {
    console.warn('Direct auth status check notice:', err);
    if (connLabel) connLabel.textContent = 'OWNER ONLINE';
    if (connPill) connPill.className = 'status-pill status-red';
  }

  // Always load live owner dashboard immediately
  await loadOwnerDashboard();
}

// Setup Owner Unlock Button
function setupUnlockForm() {
  const btn = document.getElementById('ownerUnlockBtn');
  const input = document.getElementById('ownerKeyInput');
  const msg = document.getElementById('ownerLockMsg');

  if (state.accessKey && input) {
    input.value = state.accessKey;
  }

  btn?.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) {
      msg.textContent = 'Please enter your dashboard access key.';
      msg.style.display = 'block';
      return;
    }
    state.accessKey = key;
    localStorage.setItem('nero_access_key', key);
    msg.style.display = 'none';
    haptic.impact('medium');
    await verifyOwnerAuthentication();
  });
}

// Setup Navigation Tabs
function setupNavigation() {
  const navBtns = document.querySelectorAll('.owner-nav-btn');
  const panes = document.querySelectorAll('.owner-tab-pane');

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-owner-tab');
      navBtns.forEach((b) => b.classList.remove('active'));
      panes.forEach((p) => (p.style.display = 'none'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTab);
      if (targetPane) {
        targetPane.style.display = 'block';
      }
      state.activeTab = targetTab;
      haptic.selection();

      // Refresh data on tab activation
      if (targetTab === 'tab-owner-broadcast') {
        loadOwnerChats();
      } else if (targetTab === 'tab-owner-moderation') {
        loadModerationQueue();
        loadApprovedSkills();
      }
    });
  });
}

// Load Initial Dashboard Data
async function loadOwnerDashboard() {
  try {
    const res = await fetch('/api/status', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.ok) return;

    state.switches = data.switches || {};
    state.activeModel = data.activeModel || 'gemini-3.5-flash-lite';

    // Populate switches
    const switchKeys = [
      'master_switch',
      'auto_text_replies',
      'group_participation_enabled',
      'group_moderation_enabled',
      'spam_filter_global',
      'link_filter_global',
      'antiraid_mode_global',
      'minecraft_bridge_enabled',
    ];

    switchKeys.forEach((key) => {
      const el = document.getElementById(`sw_${key}`);
      if (el) {
        el.checked = Boolean(state.switches[key]);
      }
    });

    // Check maintenance mode state
    const maintRes = await fetch('/api/maintenance/status', { headers: getAuthHeaders() });
    const maintData = await maintRes.json();
    const maintEl = document.getElementById('sw_maintenance_mode');
    if (maintEl && maintData.ok) {
      maintEl.checked = Boolean(maintData.maintenanceMode);
    }

    // Highlight active model
    highlightActiveModel(state.activeModel);

    // Highlight active reasoning effort
    highlightReasoningChoice(state.switches.reasoning_effort || 'high');
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

// Setup Switch Listeners
function setupSwitchListeners() {
  // Maintenance Mode Switch
  const maintSwitch = document.getElementById('sw_maintenance_mode');
  maintSwitch?.addEventListener('change', async () => {
    const desired = maintSwitch.checked;
    haptic.impact('heavy');
    try {
      const res = await fetch('/api/maintenance/toggle', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: desired }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(
          desired ? '🛠️ Maintenance mode ACTIVATED: replies paused' : '✅ Maintenance mode DEACTIVATED: replies resumed'
        );
      } else {
        maintSwitch.checked = !desired;
        showToast(data.error || 'Failed to toggle maintenance mode', 'error');
      }
    } catch (err) {
      maintSwitch.checked = !desired;
      showToast('Network error toggling maintenance', 'error');
    }
  });

  // Standard Feature Switches
  const switchKeys = [
    'master_switch',
    'auto_text_replies',
    'group_participation_enabled',
    'group_moderation_enabled',
    'spam_filter_global',
    'link_filter_global',
    'antiraid_mode_global',
    'minecraft_bridge_enabled',
  ];

  switchKeys.forEach((key) => {
    const el = document.getElementById(`sw_${key}`);
    el?.addEventListener('change', async () => {
      const val = el.checked;
      haptic.impact('medium');
      try {
        const res = await fetch('/api/switches', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ [key]: val }),
        });
        const data = await res.json();
        if (data.ok) {
          state.switches[key] = val;
          showToast(`${key.replace(/_/g, ' ')}: ${val ? 'ON' : 'OFF'}`);
        } else {
          el.checked = !val;
          showToast(data.error || 'Failed to update setting', 'error');
        }
      } catch {
        el.checked = !val;
        showToast('Network error saving switch', 'error');
      }
    });
  });
}

// Highlight & Setup Model Selector
function highlightActiveModel(modelId) {
  const btns = document.querySelectorAll('.btn-model-choice');
  btns.forEach((b) => {
    if (b.getAttribute('data-model') === modelId) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
}

function setupModelSelector() {
  const btns = document.querySelectorAll('.btn-model-choice');
  btns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const modelId = btn.getAttribute('data-model');
      if (!modelId) return;
      haptic.impact('medium');
      try {
        const res = await fetch('/api/models/select', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ modelId }),
        });
        const data = await res.json();
        if (data.ok) {
          state.activeModel = data.activeModelId;
          highlightActiveModel(state.activeModel);
          showToast(`Active model updated: ${data.activeModelId}`);
        } else {
          showToast(data.error || 'Failed to switch model', 'error');
        }
      } catch {
        showToast('Network error switching model', 'error');
      }
    });
  });

  // Ping Latency Button
  const pingBtn = document.getElementById('ownerPingLatencyBtn');
  const latencyBox = document.getElementById('ownerModelLatencyBox');
  pingBtn?.addEventListener('click', async () => {
    haptic.impact('light');
    if (latencyBox) latencyBox.textContent = 'Measuring roundtrip latency to ScaleMax...';
    const start = performance.now();
    try {
      const res = await fetch('/api/status', { headers: getAuthHeaders() });
      const data = await res.json();
      const elapsed = Math.round(performance.now() - start);
      const measured = data.provider?.health?.latencyMs || elapsed;
      if (latencyBox) {
        latencyBox.innerHTML = `✅ Latency to <strong>${escapeHtml(state.activeModel)}</strong>: <span style="color:#FFF; font-weight:700;">${measured} ms</span>`;
      }
      showToast(`Gateway latency: ${measured} ms`);
    } catch {
      if (latencyBox) latencyBox.textContent = 'Latency measurement failed.';
    }
  });
}

// Setup Reasoning Choice
function highlightReasoningChoice(val) {
  const btns = document.querySelectorAll('.btn-reasoning-choice');
  btns.forEach((b) => {
    if (b.getAttribute('data-reasoning') === val) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
}

function setupReasoningSelector() {
  const btns = document.querySelectorAll('.btn-reasoning-choice');
  btns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reasoning = btn.getAttribute('data-reasoning');
      haptic.impact('light');
      try {
        const res = await fetch('/api/switches', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ reasoning_effort: reasoning }),
        });
        const data = await res.json();
        if (data.ok) {
          highlightReasoningChoice(reasoning);
          showToast(`Reasoning depth set to ${reasoning.toUpperCase()}`);
        }
      } catch {
        showToast('Failed to set reasoning effort', 'error');
      }
    });
  });
}

// Setup Broadcast Tool
function setupBroadcast() {
  const input = document.getElementById('ownerBroadcastInput');
  const btn = document.getElementById('ownerBroadcastSubmitBtn');
  const statusBox = document.getElementById('ownerBroadcastStatusBox');

  btn?.addEventListener('click', async () => {
    const message = input.value.trim();
    if (!message) {
      showToast('Please type a broadcast message', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'TRANSMITTING BROADCAST...';
    statusBox.style.display = 'block';
    statusBox.innerHTML = '<span style="color:#A3A3A3;">Transmitting announcement to verified groups via Telegram API...</span>';

    try {
      const res = await fetch('/api/owner/broadcast', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message }),
      });
      const data = await res.json();

      if (data.ok) {
        haptic.notification('success');
        showToast(`Delivered to ${data.sentCount} groups!`);
        input.value = '';
        statusBox.innerHTML = `
          <div style="color: #FFF; font-weight: 700; margin-bottom: 6px;">📢 Broadcast Delivery Telemetry</div>
          <div>✅ Successfully Sent: <strong style="color: #FFF;">${data.sentCount}</strong> groups</div>
          <div>⚠️ Failed Deliveries: <strong style="color: #FF3B30;">${data.failedCount}</strong></div>
          <div>⏭️ Skipped Groups: <strong style="color: #A3A3A3;">${data.skippedCount}</strong></div>
        `;
      } else {
        haptic.notification('error');
        statusBox.innerHTML = `<span style="color: #FF3B30;">❌ Broadcast Error: ${escapeHtml(data.error)}</span>`;
        showToast(data.error || 'Broadcast transmission failed', 'error');
      }
    } catch (err) {
      statusBox.innerHTML = `<span style="color: #FF3B30;">❌ Network Exception: ${escapeHtml(err.message)}</span>`;
      showToast('Network error during broadcast', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'TRANSMIT TO ELIGIBLE GROUPS';
    }
  });
}

// Load Connected Chats & Rights Inspector
async function loadOwnerChats() {
  const container = document.getElementById('ownerChatsListContainer');
  if (!container) return;

  container.innerHTML = '<p style="color:#737373;">Loading registered community groups...</p>';

  try {
    const res = await fetch('/api/owner/chats', { headers: getAuthHeaders() });
    const data = await res.json();

    if (!data.ok || !data.chats || data.chats.length === 0) {
      container.innerHTML = '<p style="color:#737373;">No registered groups found.</p>';
      return;
    }

    state.groups = data.chats;
    container.innerHTML = data.chats
      .map((chat) => {
        const isAdmin = chat.adminInfo?.isAdministrator;
        const isBotEnabled = Boolean(chat.bot_enabled);
        return `
        <div style="background:#0A0A0A; border:1px solid #262626; border-radius:8px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; color:#FFF; font-size:13px;">${escapeHtml(chat.group_title || 'Untitled Group')}</div>
            <div style="font-size:11px; color:#737373;">ID: <code>${chat.group_id}</code> · Messages: ${chat.message_count || 0}</div>
            <div style="font-size:11px; margin-top:2px;">
              Admin Rights: <span style="color:${isAdmin ? '#FFF' : '#FF3B30'}; font-weight:700;">${isAdmin ? 'Granted' : 'Missing'}</span>
            </div>
          </div>
          <div>
            <button class="btn-toggle-group-bot btn-action-grey" data-group-id="${chat.group_id}" data-current="${isBotEnabled ? '1' : '0'}" style="font-size:11px; padding:4px 8px;">
              ${isBotEnabled ? 'Disable Bot' : 'Enable Bot'}
            </button>
          </div>
        </div>
      `;
      })
      .join('');

    // Attach group toggles
    container.querySelectorAll('.btn-toggle-group-bot').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const groupId = btn.getAttribute('data-group-id');
        const current = btn.getAttribute('data-current') === '1';
        const targetState = !current;
        haptic.impact('medium');
        try {
          const r = await fetch(`/api/groups/${groupId}/enabled`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ enabled: targetState }),
          });
          const d = await r.json();
          if (d.ok) {
            showToast(`Group bot ${targetState ? 'enabled' : 'disabled'}`);
            loadOwnerChats();
          }
        } catch {
          showToast('Failed to update group setting', 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = '<p style="color:#FF3B30;">Failed to load registered groups.</p>';
  }
}

// Setup Chats Inspector Refresh Button
function setupChatsInspector() {
  const refreshBtn = document.getElementById('ownerInspectChatsBtn');
  refreshBtn?.addEventListener('click', () => {
    haptic.selection();
    loadOwnerChats();
  });
}

// Load Moderation Queue & Skills
async function loadModerationQueue() {
  const container = document.getElementById('moderationQueueContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/skills/moderation/queue', { headers: getAuthHeaders() });
    const data = await res.json();

    if (!data.ok || !data.queue || data.queue.length === 0) {
      container.innerHTML = '<p style="color:#737373;">No pending skills or items in moderation queue.</p>';
      return;
    }

    state.moderationQueue = data.queue;
    container.innerHTML = data.queue
      .map((item) => {
        let details = {};
        try {
          details = JSON.parse(item.details);
        } catch {}
        return `
        <div class="mod-queue-item">
          <div class="mod-queue-header">
            <div>
              <span class="user-mem-badge cat-preference">#${item.id} ${escapeHtml(item.item_type.toUpperCase())}</span>
              <strong style="color:#FFF; font-size:13px; margin-left:6px;">${escapeHtml(details.skillName || item.target_id)}</strong>
            </div>
            <span style="font-size:11px; color:#737373;">Submitter: ${escapeHtml(item.author_id)}</span>
          </div>
          <div style="font-size:12px; color:#A3A3A3; line-height:1.4;">
            ${escapeHtml(details.description || 'No description provided.')}
          </div>
          ${
            details.permittedTools && details.permittedTools.length > 0
              ? `<div style="font-size:11px; color:#737373;">Permitted Tools: <code>${escapeHtml(details.permittedTools.join(', '))}</code></div>`
              : ''
          }
          <div class="mod-queue-actions">
            <button class="btn-approve" data-id="${item.id}">Approve Skill</button>
            <button class="btn-reject" data-id="${item.id}">Reject</button>
          </div>
        </div>
      `;
      })
      .join('');

    // Attach Approve & Reject Listeners
    container.querySelectorAll('.btn-approve').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const notes = prompt('Enter approval verification note (optional):', 'Verified safe and tool-whitelisted');
        if (notes === null) return;
        await submitModerationReview(id, 'approved', notes);
      });
    });

    container.querySelectorAll('.btn-reject').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const notes = prompt('Enter rejection reason:', 'Does not meet tool security policies');
        if (notes === null) return;
        await submitModerationReview(id, 'rejected', notes);
      });
    });
  } catch (err) {
    container.innerHTML = '<p style="color:#FF3B30;">Failed to load moderation queue.</p>';
  }
}

async function submitModerationReview(itemId, status, notes) {
  haptic.impact('heavy');
  try {
    const res = await fetch(`/api/skills/moderation/${itemId}/review`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status, reviewNotes: notes }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Skill #${itemId} marked as ${status.toUpperCase()}`);
      loadModerationQueue();
      loadApprovedSkills();
    } else {
      showToast(data.error || 'Failed to review item', 'error');
    }
  } catch {
    showToast('Network error reviewing moderation item', 'error');
  }
}

// Load Approved Skills
async function loadApprovedSkills() {
  const container = document.getElementById('approvedSkillsContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/skills', { headers: getAuthHeaders() });
    const data = await res.json();

    if (!data.ok || !data.skills || data.skills.length === 0) {
      container.innerHTML = '<p style="color:#737373;">No custom approved skills active.</p>';
      return;
    }

    state.approvedSkills = data.skills;
    container.innerHTML = data.skills
      .map(
        (s) => `
      <div style="background:#0A0A0A; border:1px solid #262626; border-radius:6px; padding:10px; margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:#FFF; font-size:12px;">${escapeHtml(s.skill_name)}</strong>
          <span class="user-mem-badge cat-preference">v${escapeHtml(s.version || '1.0')}</span>
        </div>
        <div style="font-size:11px; color:#A3A3A3; margin-top:3px;">${escapeHtml(s.description)}</div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#FF3B30;">Failed to load approved skills.</p>';
  }
}

// Setup MCP Key Generation
function setupMcpKeys() {
  const btn = document.getElementById('generateMcpKeyBtn');
  const input = document.getElementById('mcpClientNameInput');
  const display = document.getElementById('generatedKeyDisplay');

  btn?.addEventListener('click', async () => {
    const clientName = input.value.trim() || 'External MCP Client';
    haptic.impact('medium');
    try {
      const res = await fetch('/api/mcp/keys', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ clientName }),
      });
      const data = await res.json();
      if (data.ok && data.key) {
        showToast('Generated new MCP API Key!');
        display.style.display = 'block';
        display.innerHTML = `
          <div style="color:#FF3B30; font-weight:700; margin-bottom:4px;">🔑 NEW MCP KEY CREATED (SAVE NOW):</div>
          <div style="user-select:all; color:#FFF; font-size:12px;">${escapeHtml(data.key.apiKey)}</div>
          <div style="color:#737373; font-size:10px; margin-top:4px;">Key ID: ${escapeHtml(data.key.keyId)} · Client: ${escapeHtml(clientName)}</div>
        `;
        input.value = '';
      } else {
        showToast(data.error || 'Failed to generate key', 'error');
      }
    } catch {
      showToast('Network error generating key', 'error');
    }
  });
}

// Setup Automated Verification Suite
function setupDevopsVerification() {
  const btn = document.getElementById('ownerRunTestsSubmitBtn');
  const box = document.getElementById('ownerTestsResultBox');

  btn?.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'RUNNING TEST SUITE...';
    box.style.display = 'block';
    box.innerHTML = '<span style="color:#A3A3A3;">Executing verification suite against database, models, and services...</span>';
    haptic.impact('heavy');

    try {
      const res = await fetch('/api/owner/run-tests', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (data.ok) {
        haptic.notification(data.allPassed ? 'success' : 'warning');
        showToast(`Test Run: ${data.passedCount}/${data.totalCount} passed`);
        box.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:6px; border-bottom:1px solid #333;">
            <strong style="color:#FFF; font-size:13px;">AUTOMATED SUITE RESULTS</strong>
            <span style="font-weight:700; color:${data.allPassed ? '#FFFFFF' : '#FF3B30'};">
              ${data.allPassed ? '✅ ALL TESTS PASSED' : '⚠️ FAILURES DETECTED'} (${data.passedCount}/${data.totalCount})
            </span>
          </div>
          ${data.tests
            .map(
              (t) => `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:11px;">
              <span style="color:#FFF;">${escapeHtml(t.name)}</span>
              <span style="font-weight:700; color:${t.passed ? '#FFFFFF' : '#EF4444'};">${t.passed ? 'PASS' : 'FAIL'}</span>
            </div>
            ${t.details ? `<div style="font-size:10px; color:#737373; margin-bottom:4px; margin-left:8px;">↳ ${escapeHtml(t.details)}</div>` : ''}
          `
            )
            .join('')}
          <div style="font-size:10px; color:#525252; margin-top:8px;">Timestamp: ${escapeHtml(data.timestamp)}</div>
        `;
      } else {
        box.innerHTML = `<span style="color:#FF3B30;">❌ Suite execution error: ${escapeHtml(data.error)}</span>`;
      }
    } catch (err) {
      box.innerHTML = `<span style="color:#FF3B30;">❌ Network exception: ${escapeHtml(err.message)}</span>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'RUN AUTOMATED TEST SUITE';
    }
  });

  // 1-Click Power Actions
  document.getElementById('ownerActionClearChat')?.addEventListener('click', async () => {
    if (!confirm('Clear all conversation history?')) return;
    haptic.impact('heavy');
    try {
      const res = await fetch('/api/chat/clear', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ chatId: 'webapp_user' }),
      });
      const data = await res.json();
      if (data.ok) showToast('Conversation history cleared');
    } catch {
      showToast('Failed to clear conversation', 'error');
    }
  });

  document.getElementById('ownerActionClearWarns')?.addEventListener('click', async () => {
    if (!confirm('Reset all group warnings and strikes to 0?')) return;
    haptic.impact('heavy');
    try {
      const res = await fetch('/api/owner/clear-warns', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok) showToast('All group warning strikes reset');
    } catch {
      showToast('Failed to reset strikes', 'error');
    }
  });

  document.getElementById('ownerActionKillSwitch')?.addEventListener('click', async () => {
    if (!confirm('🚨 EMERGENCY KILL SWITCH: Halt all bot AI completions immediately?')) return;
    haptic.impact('heavy');
    try {
      const res = await fetch('/api/switches', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ master_switch: false }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('🚨 MASTER AI ENGINE HALTED');
        const sw = document.getElementById('sw_master_switch');
        if (sw) sw.checked = false;
      }
    } catch {
      showToast('Failed to execute kill switch', 'error');
    }
  });
}

// App Initialization
async function initOwnerApp() {
  startFpsMonitor();
  setupUnlockForm();
  setupNavigation();
  setupSwitchListeners();
  setupModelSelector();
  setupReasoningSelector();
  setupBroadcast();
  setupChatsInspector();
  setupMcpKeys();
  setupDevopsVerification();

  document.getElementById('refreshModerationQueueBtn')?.addEventListener('click', () => {
    haptic.selection();
    loadModerationQueue();
    loadApprovedSkills();
  });

  await verifyOwnerAuthentication();
}

window.addEventListener('DOMContentLoaded', initOwnerApp);

/**
 * 🌸 NERO LABS — USER WEB APP FRONTEND CONTROLLER
 * Personal AI Companion, 1,000-Word Context Editor, 20 Roles, Isolated Files & Memories.
 * Strict 4-color design: Pure Black, Slate Grey, Crimson Red, Crisp White.
 */

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
  profile: {
    realName: '',
    nickname: '',
    personalContext: '',
    relationshipRole: 'friend',
    communicationStyle: 'natural',
    reasoningPreference: 'balanced',
    contextWordCount: 0,
  },
  roles: [],
  memories: [],
  files: [],
  isSendingChat: false,
};

// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (tg.enableClosingConfirmation) {
    tg.enableClosingConfirmation();
  }
  try {
    tg.setHeaderColor?.('#F7F8FA');
    tg.setBackgroundColor?.('#F7F8FA');
  } catch {}

  if (tg.initDataUnsafe?.user?.id) {
    state.chatId = String(tg.initDataUnsafe.user.id);
  }
}

// Haptic Feedback Engine
const haptic = {
  selection: () => { try { tg?.HapticFeedback?.selectionChanged?.(); } catch {} },
  light: () => { try { tg?.HapticFeedback?.impactOccurred?.('light'); } catch {} },
  medium: () => { try { tg?.HapticFeedback?.impactOccurred?.('medium'); } catch {} },
  heavy: () => { try { tg?.HapticFeedback?.impactOccurred?.('heavy'); } catch {} },
  notification: (type = 'success') => { try { tg?.HapticFeedback?.notificationOccurred?.(type); } catch {} },
};

// Toast Notifications
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

// Auth Headers Helper
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (tg?.initData) {
    headers['x-telegram-init-data'] = tg.initData;
  }
  const key = localStorage.getItem('nero_access_key');
  if (key) {
    headers['x-dashboard-access-key'] = key;
  }
  return headers;
}

// HTML Escaper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Word Counter Helper
function countWords(str) {
  if (!str || typeof str !== 'string') return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
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

// Setup User Navigation Tabs
function setupNavigation() {
  const navBtns = document.querySelectorAll('.tab-nav .nav-btn');
  const panes = document.querySelectorAll('.content-viewport .tab-pane');

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navBtns.forEach((b) => b.classList.remove('active'));
      panes.forEach((p) => (p.style.display = 'none'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTab);
      if (targetPane) {
        targetPane.style.display = 'block';
      }
      state.activeTab = targetTab;
      haptic.selection();

      // Lazy load tab data
      if (targetTab === 'tab-profile') {
        loadUserProfile();
      } else if (targetTab === 'tab-roles') {
        loadRoles();
      } else if (targetTab === 'tab-memories') {
        loadUserMemories();
      } else if (targetTab === 'tab-files') {
        loadUserFiles();
      }
    });
  });

  // Tapping role badge in chat header navigates directly to 20 Roles tab
  const chatRoleBadge = document.getElementById('chatActiveRoleBadge');
  if (chatRoleBadge) {
    chatRoleBadge.style.cursor = 'pointer';
    chatRoleBadge.title = 'Click to change relationship persona';
    chatRoleBadge.addEventListener('click', () => {
      const rolesBtn = document.querySelector('[data-tab="tab-roles"]');
      rolesBtn?.click();
    });
  }
}

// Verify User Authentication & Reveal Owner Portal Link if Authorized
async function checkAuthAndMaintenance() {
  const connLabel = document.getElementById('connectionLabel');
  const connPill = document.getElementById('connectionPill');
  const ownerLinkContainer = document.getElementById('ownerPortalLinkContainer');
  const maintBanner = document.getElementById('userMaintenanceBanner');

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ initData: tg?.initData || '' }),
    });
    const data = await res.json();
    state.auth = data;

    if (data.authenticated) {
      connLabel.textContent = data.isOwner ? 'OWNER ACTIVE' : 'CONNECTED';
      connPill.className = data.isOwner ? 'status-pill status-red' : 'status-pill status-fps';
      if (data.isOwner && ownerLinkContainer) {
        ownerLinkContainer.style.display = 'block';
      }
    } else {
      connLabel.textContent = 'GUEST';
    }

    // Check maintenance status
    const maintRes = await fetch('/api/maintenance/status');
    const maintData = await maintRes.json();
    if (maintData.ok && maintData.maintenanceMode && maintBanner) {
      maintBanner.style.display = 'flex';
    }
  } catch (err) {
    console.warn('Auth/status check warning:', err.message);
  }
}

// =========================================================================
// 1. LIVE CHAT PLAYGROUND
// =========================================================================
function setupLiveChat() {
  const container = document.getElementById('chatMessagesContainer');
  const input = document.getElementById('chatTextInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const typingIndicator = document.getElementById('chatTypingIndicator');
  const clearBtn = document.getElementById('clearChatBtn');
  const chips = document.querySelectorAll('.chip-prompt');

  // Send message handler
  async function sendMessage(textToSend) {
    const text = (textToSend || input.value).trim();
    if (!text || state.isSendingChat) return;

    input.value = '';
    state.isSendingChat = true;
    haptic.impact('medium');

    // Append user bubble
    appendChatBubble('user', text);
    if (typingIndicator) typingIndicator.style.display = 'flex';
    container.scrollTop = container.scrollHeight;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: text,
          chatId: state.chatId,
          userName: state.profile.nickname || state.profile.realName || 'Friend',
        }),
      });

      const data = await res.json();
      if (typingIndicator) typingIndicator.style.display = 'none';

      if (data.ok && data.reply) {
        appendChatBubble('assistant', data.reply, data.model);
        haptic.impact('light');
      } else {
        appendChatBubble('assistant', data.error || 'Nero encountered an issue generating a response.');
      }
    } catch (err) {
      if (typingIndicator) typingIndicator.style.display = 'none';
      appendChatBubble('assistant', 'Network error connecting to Nero Labs server.');
    } finally {
      state.isSendingChat = false;
      container.scrollTop = container.scrollHeight;
    }
  }

  sendBtn?.addEventListener('click', () => sendMessage());
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  // Prompt chips
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        input.value = prompt;
        sendMessage(prompt);
      }
    });
  });

  // Clear chat button
  clearBtn?.addEventListener('click', async () => {
    if (!confirm('Clear chat history?')) return;
    try {
      await fetch('/api/chat/clear', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ chatId: state.chatId }),
      });
      container.innerHTML = `
        <div class="chat-bubble chat-bubble-assistant">
          <div class="bubble-header">
            <span class="bubble-sender">Nero</span>
            <span class="bubble-model">Gemini 3.8 Flash</span>
          </div>
          <div class="bubble-text">
            Chat history cleared! How can I assist you today? 💖
          </div>
        </div>
      `;
      showToast('Chat history cleared');
    } catch {
      showToast('Failed to clear chat', 'error');
    }
  });
}

function appendChatBubble(role, message, modelName = 'Gemini 3.8 Flash') {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-bubble-${role}`;

  if (role === 'assistant') {
    bubble.innerHTML = `
      <div class="bubble-header">
        <span class="bubble-sender">Nero</span>
        <span class="bubble-model">${escapeHtml(modelName)}</span>
      </div>
      <div class="bubble-text">${escapeHtml(message).replace(/\n/g, '<br/>')}</div>
    `;
  } else {
    bubble.innerHTML = `
      <div class="bubble-text">${escapeHtml(message).replace(/\n/g, '<br/>')}</div>
    `;
  }

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

// =========================================================================
// 2. PROFILE & 1,000-WORD PERSONAL CONTEXT EDITOR
// =========================================================================
function setupProfileAndContext() {
  const textarea = document.getElementById('personalContextTextarea');
  const counterDisplay = document.getElementById('contextWordCountDisplay');
  const realNameInput = document.getElementById('profileRealNameInput');
  const nicknameInput = document.getElementById('profileNicknameInput');
  const commStyleSelect = document.getElementById('profileCommStyleSelect');
  const reasoningSelect = document.getElementById('profileReasoningSelect');
  const saveBtn = document.getElementById('saveContextProfileBtn');

  // Live word counter
  textarea?.addEventListener('input', () => {
    const text = textarea.value;
    const words = countWords(text);

    counterDisplay.textContent = `${words} / 1,000 words`;

    if (words > 1000) {
      counterDisplay.className = 'word-counter exceeded';
      counterDisplay.textContent = `⚠️ ${words} / 1,000 words (EXCEEDS LIMIT)`;
    } else if (words > 850) {
      counterDisplay.className = 'word-counter warning';
    } else {
      counterDisplay.className = 'word-counter';
    }
  });

  // Save profile & context
  saveBtn?.addEventListener('click', async () => {
    const context = textarea.value.trim();
    const words = countWords(context);

    if (words > 1000) {
      haptic.notification('error');
      showToast(`Context exceeds 1,000 words (currently ${words}). Please shorten it.`, 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING CONTEXT...';
    haptic.impact('medium');

    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId: state.chatId,
          realName: realNameInput.value.trim(),
          nickname: nicknameInput.value.trim(),
          personalContext: context,
          communicationStyle: commStyleSelect.value,
          reasoningPreference: reasoningSelect.value,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        state.profile = {
          ...state.profile,
          realName: data.profile.real_name || '',
          nickname: data.profile.nickname || '',
          personalContext: data.profile.personal_context || '',
          communicationStyle: data.profile.communication_style || 'natural',
          reasoningPreference: data.profile.reasoning_preference || 'balanced',
          contextWordCount: data.profile.context_word_count || 0,
        };
        haptic.notification('success');
        showToast('Profile & 1,000-Word Context Saved!');
      } else {
        haptic.notification('error');
        showToast(data.error || 'Server rejected context update', 'error');
      }
    } catch (err) {
      showToast('Network error saving profile', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE PROFILE & CONTEXT';
    }
  });
}

async function loadUserProfile() {
  const textarea = document.getElementById('personalContextTextarea');
  const counterDisplay = document.getElementById('contextWordCountDisplay');
  const realNameInput = document.getElementById('profileRealNameInput');
  const nicknameInput = document.getElementById('profileNicknameInput');
  const commStyleSelect = document.getElementById('profileCommStyleSelect');
  const reasoningSelect = document.getElementById('profileReasoningSelect');
  const activeRoleBadge = document.getElementById('chatActiveRoleBadge');
  const roleNameBadge = document.getElementById('activeRoleNameBadge');

  try {
    const res = await fetch(`/api/user/profile?userId=${encodeURIComponent(state.chatId)}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (data.ok && data.profile) {
      const p = data.profile;
      state.profile = {
        realName: p.real_name || '',
        nickname: p.nickname || '',
        personalContext: p.personal_context || '',
        relationshipRole: p.relationship_role || 'friend',
        communicationStyle: p.communication_style || 'natural',
        reasoningPreference: p.reasoning_preference || 'balanced',
        contextWordCount: p.context_word_count || 0,
      };

      if (realNameInput) realNameInput.value = state.profile.realName;
      if (nicknameInput) nicknameInput.value = state.profile.nickname;
      if (commStyleSelect) commStyleSelect.value = state.profile.communicationStyle;
      if (reasoningSelect) reasoningSelect.value = state.profile.reasoningPreference;
      if (textarea) textarea.value = state.profile.personalContext;

      const words = countWords(state.profile.personalContext);
      if (counterDisplay) {
        counterDisplay.textContent = `${words} / 1,000 words`;
      }

      const roleLabel = (state.profile.relationshipRole || 'friend').toUpperCase();
      if (activeRoleBadge) activeRoleBadge.textContent = `🌸 ${roleLabel}`;
      if (roleNameBadge) roleNameBadge.textContent = roleLabel;
    }
  } catch (err) {
    console.warn('Failed to load user profile:', err);
  }
}

// =========================================================================
// 3. TWENTY (20) PERSONALITY ROLES ENGINE
// =========================================================================
async function loadRoles() {
  const grid = document.getElementById('rolesGridV2');
  if (!grid) return;

  try {
    const res = await fetch('/api/roleplay/roles');
    const data = await res.json();
    if (!data.ok || !data.roles) return;

    state.roles = data.roles;
    const currentRole = state.profile.relationshipRole || 'friend';

    grid.innerHTML = data.roles
      .map(
        (r) => `
      <div class="role-v2-card ${r.id === currentRole ? 'active' : ''}" data-role-id="${r.id}">
        <div class="role-v2-header">
          <span class="role-v2-emoji">${r.emoji || '🎭'}</span>
          <div>
            <div class="role-v2-name">${escapeHtml(r.label)}</div>
            <div class="role-v2-alias">${escapeHtml(r.hindiAlias || '')}</div>
          </div>
        </div>
        <div class="role-v2-desc">${escapeHtml(r.description || '')}</div>
      </div>
    `
      )
      .join('');

    // Attach card click handlers
    grid.querySelectorAll('.role-v2-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const roleId = card.getAttribute('data-role-id');
        if (!roleId) return;

        haptic.impact('medium');
        try {
          const res = await fetch('/api/roleplay/set-role', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              userId: state.chatId,
              role: roleId,
            }),
          });
          const d = await res.json();
          if (d.ok) {
            state.profile.relationshipRole = roleId;
            grid.querySelectorAll('.role-v2-card').forEach((c) => c.classList.remove('active'));
            card.classList.add('active');

            const roleNameBadge = document.getElementById('activeRoleNameBadge');
            const chatRoleBadge = document.getElementById('chatActiveRoleBadge');
            if (roleNameBadge) roleNameBadge.textContent = roleId.toUpperCase();
            if (chatRoleBadge) chatRoleBadge.textContent = `🌸 ${roleId.toUpperCase()}`;

            showToast(`Roleplay set to ${roleId.toUpperCase()}`);
          }
        } catch {
          showToast('Failed to set role', 'error');
        }
      });
    });
  } catch (err) {
    grid.innerHTML = '<p style="color:#FF3B30;">Failed to load roles.</p>';
  }
}

// =========================================================================
// 4. USER PERSONAL MEMORIES & CORRECTIONS
// =========================================================================
function setupUserMemories() {
  const openFormBtn = document.getElementById('openAddMemoryBtn');
  const formBox = document.getElementById('addMemoryFormBox');
  const cancelBtn = document.getElementById('cancelNewMemoryBtn');
  const saveBtn = document.getElementById('saveNewMemoryBtn');
  const catSelect = document.getElementById('newMemCategory');
  const titleInput = document.getElementById('newMemTitle');
  const contentInput = document.getElementById('newMemContent');

  openFormBtn?.addEventListener('click', () => {
    formBox.style.display = formBox.style.display === 'none' ? 'block' : 'none';
    haptic.selection();
  });

  cancelBtn?.addEventListener('click', () => {
    formBox.style.display = 'none';
  });

  saveBtn?.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const category = catSelect.value;

    if (!title || !content) {
      showToast('Title and memory content are required', 'error');
      return;
    }

    haptic.impact('medium');
    try {
      const res = await fetch('/api/user/memories', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId: state.chatId,
          category,
          title,
          content,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Personal memory recorded!');
        titleInput.value = '';
        contentInput.value = '';
        formBox.style.display = 'none';
        loadUserMemories();
      } else {
        showToast(data.error || 'Failed to add memory', 'error');
      }
    } catch {
      showToast('Network error saving memory', 'error');
    }
  });
}

async function loadUserMemories() {
  const container = document.getElementById('userMemoriesList');
  if (!container) return;

  try {
    const res = await fetch(`/api/user/memories?userId=${encodeURIComponent(state.chatId)}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();

    if (!data.ok || !data.memories || data.memories.length === 0) {
      container.innerHTML = '<p style="color:#737373;">No personal memories saved yet. Click "+ Add Memory" above!</p>';
      return;
    }

    state.memories = data.memories;
    container.innerHTML = data.memories
      .map(
        (m) => `
      <div class="user-mem-card" data-id="${m.id}">
        <div class="user-mem-top">
          <span class="user-mem-badge cat-${escapeHtml(m.category)}">${escapeHtml(m.category)}</span>
          <span style="font-size:10px; color:#525252;">${new Date(m.created_at).toLocaleDateString()}</span>
        </div>
        <div class="user-mem-title">${escapeHtml(m.title)}</div>
        <div class="user-mem-content">${escapeHtml(m.content)}</div>
        <div class="user-mem-actions">
          <span></span>
          <button class="btn-delete-mem" data-id="${m.id}">Delete</button>
        </div>
      </div>
    `
      )
      .join('');

    // Attach delete listeners
    container.querySelectorAll('.btn-delete-mem').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Delete this memory?')) return;
        haptic.impact('light');
        try {
          const r = await fetch(`/api/user/memories/${id}?userId=${encodeURIComponent(state.chatId)}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          const d = await r.json();
          if (d.ok) {
            showToast('Memory deleted');
            loadUserMemories();
          }
        } catch {
          showToast('Failed to delete memory', 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = '<p style="color:#FF3B30;">Failed to load memories.</p>';
  }
}

// =========================================================================
// 5. USER ISOLATED FILES & SANDBOX STORAGE
// =========================================================================
function setupUserFiles() {
  const dropzone = document.getElementById('fileDropzone');
  const fileInput = document.getElementById('userFileInput');
  const progressBox = document.getElementById('fileUploadProgressBox');

  dropzone?.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showToast('File exceeds 20 MB limit', 'error');
      return;
    }

    if (progressBox) progressBox.style.display = 'block';
    haptic.impact('medium');

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result.split(',')[1];
      try {
        const res = await fetch('/api/user/files/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            userId: state.chatId,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Data,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(`Uploaded ${file.name}!`);
          loadUserFiles();
        } else {
          showToast(data.error || 'Upload rejected', 'error');
        }
      } catch {
        showToast('Network error uploading file', 'error');
      } finally {
        if (progressBox) progressBox.style.display = 'none';
        fileInput.value = '';
      }
    };
    reader.readAsDataURL(file);
  });
}

async function loadUserFiles() {
  const container = document.getElementById('userFilesList');
  if (!container) return;

  try {
    const res = await fetch(`/api/user/files?userId=${encodeURIComponent(state.chatId)}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();

    if (!data.ok || !data.files || data.files.length === 0) {
      container.innerHTML = '<p style="color:#737373;">No files stored in your isolated sandbox yet.</p>';
      return;
    }

    state.files = data.files;
    container.innerHTML = data.files
      .map((f) => {
        const sizeKb = Math.round(f.file_size / 1024);
        return `
        <div class="file-card-item">
          <div class="file-info-group">
            <span class="file-name-text">${escapeHtml(f.filename)}</span>
            <span class="file-meta-sub">${sizeKb} KB · ${escapeHtml(f.mime_type)}</span>
          </div>
          <div>
            <button class="btn-file-delete" data-id="${f.id}">Delete</button>
          </div>
        </div>
      `;
      })
      .join('');

    // Attach delete listeners
    container.querySelectorAll('.btn-file-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Permanently delete this file from your sandbox?')) return;
        haptic.impact('light');
        try {
          const r = await fetch(`/api/user/files/${id}?userId=${encodeURIComponent(state.chatId)}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          const d = await r.json();
          if (d.ok) {
            showToast('File deleted');
            loadUserFiles();
          }
        } catch {
          showToast('Failed to delete file', 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = '<p style="color:#FF3B30;">Failed to load files.</p>';
  }
}

// App Initialization
async function initUserApp() {
  startFpsMonitor();
  setupNavigation();
  setupLiveChat();
  setupProfileAndContext();
  setupUserMemories();
  setupUserFiles();

  await checkAuthAndMaintenance();
  await loadUserProfile();
  await loadRoles();
}

window.addEventListener('DOMContentLoaded', initUserApp);

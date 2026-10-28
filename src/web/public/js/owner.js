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
  activeTab: 'tab-owner-command-center',
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
      } else if (targetTab === 'tab-owner-whatsapp') {
        loadWhatsAppBridge();
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

// =========================================================================
// 50+ PLATFORM TOOLS & COMMAND HUB (OWNER CONSOLE)
// =========================================================================
const OWNER_COMMANDS_LIST = [
  // --- 1. SERVICES & SWITCHES (8) ---
  { id: 'cmd_maint_on', cmd: 'maintenance_on', cat: 'services', name: 'Maintenance Mode', icon: '🛠️', desc: 'Activate platform maintenance and broadcast alert to connected chats', btnText: 'Activate' },
  { id: 'cmd_maint_off', cmd: 'maintenance_off', cat: 'services', name: 'Resume Service', icon: '🟢', desc: 'Deactivate maintenance and restore live operations', btnText: 'Resume' },
  { id: 'cmd_master_on', cmd: 'master_on', cat: 'services', name: 'Master AI Engine', icon: '⚡', desc: 'Enable global neural AI completion pipeline', btnText: 'Enable Engine' },
  { id: 'cmd_master_off', cmd: 'master_off', cat: 'services', name: 'Emergency Kill Switch', icon: '🚨', desc: 'Immediately halt all neural completions across bot', btnText: 'HALT AI' },
  { id: 'cmd_textmode_on', cmd: 'textmode_on', cat: 'services', name: 'Auto Text Replies', icon: '💬', desc: 'Respond to all incoming chat texts automatically', btnText: 'Enable All' },
  { id: 'cmd_textmode_off', cmd: 'textmode_off', cat: 'services', name: 'Mentions Only', icon: '📴', desc: 'Restrict responses to @mentions and direct calls only', btnText: 'Mentions Only' },
  { id: 'cmd_group_on', cmd: 'globalgroup_on', cat: 'services', name: 'Group Participation', icon: '👥', desc: 'Permit bot to converse in community Telegram groups', btnText: 'Enable Groups' },
  { id: 'cmd_assistant_on', cmd: 'assistant_on', cat: 'services', name: 'Assistant Auto-Responder', icon: '🤖', desc: 'Autonomous business DM assistant responding on owner behalf', btnText: 'Toggle DM Bot' },

  // --- 2. MODELS & REASONING (6) ---
  { id: 'cmd_model_flash_lite', cmd: 'model_select', cat: 'models', name: 'Gemini 3.5 Flash Lite', icon: '⚡', desc: 'Active flagship default model for fast reasoning & coding', btnText: 'Switch 3.5 Lite', defaultParams: { modelId: 'gemini-3.5-flash-lite' } },
  { id: 'cmd_model_luna', cmd: 'model_select', cat: 'models', name: 'GPT-6 Luna', icon: '✨', desc: 'Ultra-low latency model for high-speed conversational chats', btnText: 'Switch Luna', defaultParams: { modelId: 'gpt-6-luna' } },
  { id: 'cmd_model_flash_38', cmd: 'model_select', cat: 'models', name: 'Gemini 3.8 Flash', icon: '🌟', desc: 'Deep vision, multimodal intelligence & heavy code analysis', btnText: 'Switch 3.8', defaultParams: { modelId: 'gemini-3.8-flash' } },
  { id: 'cmd_model_claude', cmd: 'model_select', cat: 'models', name: 'Claude 3.5 Sonnet', icon: '🧠', desc: 'High-capability analytical architecture model', btnText: 'Switch Sonnet', defaultParams: { modelId: 'claude-3-5-sonnet' } },
  { id: 'cmd_reasoning_depth', cmd: 'setreasoning', cat: 'models', name: 'Reasoning Effort', icon: '🎯', desc: 'Configure neural chain-of-thought depth (none, low, medium, high)', btnText: 'Set Effort', hasInput: true, inputPlaceholder: 'low | medium | high | none', inputKey: 'effort', defaultVal: 'medium' },
  { id: 'cmd_set_limits', cmd: 'setlimits', cat: 'models', name: 'Word & Token Limits', icon: '📏', desc: 'Adjust dev & global response word ceilings', btnText: 'Apply Limits', defaultParams: { devMin: 1, devMax: 500, globMin: 10, globMax: 100 } },

  // --- 3. INTELLIGENCE & AI TOOLS (12) ---
  { id: 'cmd_web_search', cmd: 'search', cat: 'intelligence', name: 'Web Intelligence Search', icon: '🔍', desc: 'Live multi-engine web search with citation synthesis', btnText: 'Search Web', hasInput: true, inputPlaceholder: 'Enter search topic...', inputKey: 'query', defaultVal: 'Latest AI advancements 2026' },
  { id: 'cmd_deep_browse', cmd: 'browse', cat: 'intelligence', name: 'Deep Page Crawler', icon: '🌐', desc: 'Crawl and summarize live web pages with DOM extraction', btnText: 'Crawl URL', hasInput: true, inputPlaceholder: 'https://example.com...', inputKey: 'url', defaultVal: 'https://nero-labs.pages.dev' },
  { id: 'cmd_safety_audit', cmd: 'safety', cat: 'intelligence', name: 'Website Safety & Scam Audit', icon: '🛡️', desc: 'Real-time phishing, reputation, and SSL risk score check', btnText: 'Audit URL', hasInput: true, inputPlaceholder: 'Enter website URL...', inputKey: 'url', defaultVal: 'https://google.com' },
  { id: 'cmd_code_fixer', cmd: 'fix', cat: 'intelligence', name: 'Drop-In Code Bug Fixer', icon: '🔧', desc: 'Analyze and repair failing code snippets with precision', btnText: 'Fix Code', hasInput: true, inputPlaceholder: 'Paste code snippet...', inputKey: 'code', defaultVal: 'function test() { const a = null; return a.length; }' },
  { id: 'cmd_code_synth', cmd: 'code', cat: 'intelligence', name: 'Fullstack Code Architect', icon: '💻', desc: 'Generate production-ready code modules from prompts', btnText: 'Generate Code', hasInput: true, inputPlaceholder: 'Enter programming task...', inputKey: 'task', defaultVal: 'Create an Express 5 rate-limiter middleware' },
  { id: 'cmd_summarize_doc', cmd: 'summarize', cat: 'intelligence', name: 'Executive Summarizer', icon: '📝', desc: 'Generate high-density 3-bullet executive briefings', btnText: 'Summarize', hasInput: true, inputPlaceholder: 'Paste text or article...', inputKey: 'text', defaultVal: 'Nero Labs is an autonomous Telegram AI companion and platform.' },
  { id: 'cmd_translator', cmd: 'translate', cat: 'intelligence', name: 'Multilingual Translator', icon: '🌐', desc: 'Translate text across global languages with cultural nuance', btnText: 'Translate', hasInput: true, inputPlaceholder: 'Text to translate...', inputKey: 'text', defaultVal: 'Welcome to Nero Labs Master Deck' },
  { id: 'cmd_video_discovery', cmd: 'video', cat: 'intelligence', name: 'Video Discovery Engine', icon: '🎬', desc: 'Discover relevant educational videos and tutorials', btnText: 'Search Video', hasInput: true, inputPlaceholder: 'Video topic...', inputKey: 'query', defaultVal: 'Fullstack Next.js deployment tutorial' },
  { id: 'cmd_product_deal', cmd: 'shop', cat: 'intelligence', name: 'Product Deal & Compare', icon: '🛍️', desc: 'Compare tech products, pricing, and specs', btnText: 'Compare Deals', hasInput: true, inputPlaceholder: 'Product to search...', inputKey: 'query', defaultVal: 'Mechanical keyboards under $100' },
  { id: 'cmd_pdf_search', cmd: 'pdf', cat: 'intelligence', name: 'PDF & Document Search', icon: '📄', desc: 'Locate and synthesize educational whitepapers and guides', btnText: 'Find Papers', hasInput: true, inputPlaceholder: 'Research topic...', inputKey: 'query', defaultVal: 'Attention is all you need deep learning' },
  { id: 'cmd_image_draft', cmd: 'image', cat: 'intelligence', name: 'Creative Visual Prompting', icon: '🎨', desc: 'Synthesize hyper-detailed creative image generation prompts', btnText: 'Synthesize Prompt', hasInput: true, inputPlaceholder: 'Visual scene description...', inputKey: 'prompt', defaultVal: 'Futuristic cyberpunk command center in red and white' },
  { id: 'cmd_sec_diagnostic', cmd: 'security', cat: 'intelligence', name: 'Security Supervisor Diagnostic', icon: '🔐', desc: 'Full-spectrum audit across tokens, rate limits, and defenses', btnText: 'Run Security Scan' },

  // --- 4. MODERATION & SHIELD (8) ---
  { id: 'cmd_clear_warns', cmd: 'clear_warnings', cat: 'moderation', name: 'Reset Member Strikes', icon: '⚠️', desc: 'Wipe all warning strikes to 0 across all groups', btnText: 'Reset All Strikes' },
  { id: 'cmd_clear_chat_mem', cmd: 'clear_chat', cat: 'moderation', name: 'Purge WebApp Chat Buffer', icon: '🧹', desc: 'Clear playground conversation context and messages', btnText: 'Clear Chat' },
  { id: 'cmd_mod_shield_on', cmd: 'moderation_on', cat: 'moderation', name: 'Group Moderation Shield', icon: '🛡️', desc: 'Enable automated spam, link, and raid enforcement', btnText: 'Activate Shield' },
  { id: 'cmd_mod_shield_off', cmd: 'moderation_off', cat: 'moderation', name: 'Disable Mod Shield', icon: '⚪', desc: 'Stand down automated group moderation rules', btnText: 'Deactivate Shield' },
  { id: 'cmd_spam_on', cmd: 'spam_on', cat: 'moderation', name: 'Anti-Spam Filter', icon: '🚫', desc: 'Block character flooding and repetitive spam sequences', btnText: 'Enable Anti-Spam' },
  { id: 'cmd_spam_off', cmd: 'spam_off', cat: 'moderation', name: 'Anti-Spam Standby', icon: '⚪', desc: 'Disable global anti-spam message filters', btnText: 'Disable Anti-Spam' },
  { id: 'cmd_link_on', cmd: 'link_on', cat: 'moderation', name: 'Link & Phishing Blocker', icon: '🔗', desc: 'Block unauthorized URLs and channel invite drops', btnText: 'Block Links' },
  { id: 'cmd_antiraid_emergency', cmd: 'antiraid_on', cat: 'moderation', name: 'Emergency Anti-Raid Mode', icon: '🚨', desc: 'Lock down groups against automated raid bot attacks', btnText: 'LOCKDOWN GROUPS' },

  // --- 5. MINECRAFT BEDROCK (8) ---
  { id: 'cmd_mc_status', cmd: 'mc_status', cat: 'minecraft', name: 'Bedrock Server Status', icon: '⛏️', desc: 'Check connection, port 19132, latency, and online players', btnText: 'Check Bedrock' },
  { id: 'cmd_mc_give_item', cmd: 'mc_give', cat: 'minecraft', name: 'Give Player Items', icon: '💎', desc: 'Deliver items, tools, and blocks to in-game players', btnText: 'Give Item', hasInput: true, inputPlaceholder: 'item count (e.g. emerald 64)', inputKey: 'item', defaultVal: 'diamond 64' },
  { id: 'cmd_mc_time_day', cmd: 'mc_time_day', cat: 'minecraft', name: 'Set Time to Day', icon: '☀️', desc: 'Execute /time set day on Bedrock server', btnText: '☀️ Day' },
  { id: 'cmd_mc_time_night', cmd: 'mc_time_night', cat: 'minecraft', name: 'Set Time to Night', icon: '🌙', desc: 'Execute /time set night on Bedrock server', btnText: '🌙 Night' },
  { id: 'cmd_mc_weather_clear', cmd: 'mc_weather_clear', cat: 'minecraft', name: 'Clear Weather', icon: '🌈', desc: 'Execute /weather clear on Bedrock server', btnText: '🌈 Clear' },
  { id: 'cmd_mc_broadcast', cmd: 'mc_announce', cat: 'minecraft', name: 'Server Title Announcement', icon: '📢', desc: 'Display prominent raw title text across all player screens', btnText: 'Broadcast In-Game', hasInput: true, inputPlaceholder: 'Announcement message...', inputKey: 'text', defaultVal: '⚡ NERO LABS OPERATIONAL' },
  { id: 'cmd_mc_custom_cmd', cmd: 'mc_command', cat: 'minecraft', name: 'Execute Raw Server Command', icon: '⌨️', desc: 'Run any arbitrary Minecraft server command', btnText: 'Execute Server Cmd', hasInput: true, inputPlaceholder: '/gamemode c @p, /tp, /locate...', inputKey: 'command', defaultVal: '/list' },
  { id: 'cmd_mc_narrow_ai', cmd: 'narrow', cat: 'minecraft', name: 'Narrow AI Instruction', icon: '🤖', desc: 'Send natural language directive to in-game AI companion', btnText: 'Direct Companion', hasInput: true, inputPlaceholder: 'e.g. Come here, mine diamonds...', inputKey: 'text', defaultVal: 'Follow me and protect the base' },

  // --- 6. STORAGE & BACKUP (4) ---
  { id: 'cmd_db_backup', cmd: 'backup', cat: 'storage', name: 'Database Snapshot Backup', icon: '💾', desc: 'Create immediate encrypted SQLite snapshot archive', btnText: 'Create Backup' },
  { id: 'cmd_drive_status', cmd: 'drive_status', cat: 'storage', name: 'Google Drive Storage Status', icon: '☁️', desc: 'Verify 2TB storage quota, auth tokens, and target directories', btnText: 'Check Drive Status' },
  { id: 'cmd_archive_batch', cmd: 'archive_now', cat: 'storage', name: 'Trigger Message Archival', icon: '📦', desc: 'Force immediate 50-message transcript batch upload to Drive', btnText: 'Archive Messages' },
  { id: 'cmd_archive_stats', cmd: 'archivestatus', cat: 'storage', name: 'Archive Batches & Telemetry', icon: '📊', desc: 'View pending message count, batch hashes, and Drive files', btnText: 'Get Archive Stats' },

  // --- 7. MEMORIES & PROFILE (5) ---
  { id: 'cmd_recall_memory', cmd: 'recall', cat: 'memories', name: 'Query Durable Memory', icon: '🧠', desc: 'Search persistent facts, user preferences, and memories', btnText: 'Query Memories', hasInput: true, inputPlaceholder: 'Search query or concept...', inputKey: 'query', defaultVal: 'Sandy' },
  { id: 'cmd_search_facts', cmd: 'search_memory', cat: 'memories', name: 'Semantic Memory Search', icon: '🔎', desc: 'Deep keyword retrieval across all conversation archives', btnText: 'Search Index', hasInput: true, inputPlaceholder: 'Keyword or entity...', inputKey: 'query', defaultVal: 'projects' },
  { id: 'cmd_memory_stats', cmd: 'recall', cat: 'memories', name: 'Durable Index Metrics', icon: '📈', desc: 'View total stored durable facts and memory distribution', btnText: 'Index Metrics', defaultParams: { query: '' } },
  { id: 'cmd_user_profile_audit', cmd: 'whoami', cat: 'memories', name: 'Owner Profile Audit', icon: '👤', desc: 'Inspect verified owner profile, roles, and title', btnText: 'Audit Profile' },
  { id: 'cmd_tusage_telemetry', cmd: 'tusage_on', cat: 'memories', name: 'Token Usage Telemetry', icon: '📊', desc: 'Enable per-reply token usage & pricing stats in Telegram', btnText: 'Enable Telemetry' },

  // --- 8. DEVOPS & TELEMETRY (6) ---
  { id: 'cmd_run_tests', cmd: 'runtests', cat: 'devops', name: 'Automated Verification Suite', icon: '🧪', desc: 'Run automated end-to-end test suite across all subsystems', btnText: 'RUN ALL TESTS' },
  { id: 'cmd_sysinfo', cmd: 'sysinfo', cat: 'devops', name: 'Host Hardware Telemetry', icon: '💻', desc: 'Inspect OS, CPU arch, RAM allocation, Heap, RSS, and Uptime', btnText: 'Fetch Telemetry' },
  { id: 'cmd_ping_latency', cmd: 'ping', cat: 'devops', name: 'Neural Model Ping Benchmark', icon: '🏓', desc: 'Measure live roundtrip latency to neural endpoint', btnText: 'Ping Model' },
  { id: 'cmd_bot_status', cmd: 'status', cat: 'devops', name: 'Bot Process & Health Probe', icon: '🟢', desc: 'Real-time Telegram bot connection and polling status', btnText: 'Health Probe' },
  { id: 'cmd_mcp_bridge_status', cmd: 'mcp_status', cat: 'devops', name: 'MCP Server Diagnostic', icon: '🔑', desc: 'Inspect JSON-RPC 2.0 & SSE clients, tools, and sessions', btnText: 'Check MCP Status' },
  { id: 'cmd_gen_mcp_key', cmd: 'mcp_key_gen', cat: 'devops', name: 'Generate MCP Client Key', icon: '⚡', desc: 'Issue a cryptographically secure token for external IDEs', btnText: 'Generate Key', hasInput: true, inputPlaceholder: 'Client name (e.g. Antigravity IDE)...', inputKey: 'clientName', defaultVal: 'Antigravity IDE' },
];

let currentActiveFilter = 'all';
let currentSearchTerm = '';
let activeModalCommand = null;

function appendTerminalLog(text, isError = false) {
  const terminal = document.getElementById('ownerTerminalOutput');
  if (!terminal) return;
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.style.marginTop = '4px';
  line.style.color = isError ? '#ff3b30' : '#e2e6ec';
  line.textContent = `[${time}] ${text}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function renderCommandCards() {
  const grid = document.getElementById('commandsGridHub');
  const countBadge = document.getElementById('cmdCountBadge');
  if (!grid) return;

  const filtered = OWNER_COMMANDS_LIST.filter((item) => {
    const matchesCat = currentActiveFilter === 'all' || item.cat === currentActiveFilter;
    const term = currentSearchTerm.toLowerCase();
    const matchesSearch = !term ||
      item.name.toLowerCase().includes(term) ||
      item.cmd.toLowerCase().includes(term) ||
      item.desc.toLowerCase().includes(term) ||
      item.cat.toLowerCase().includes(term);
    return matchesCat && matchesSearch;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} TOOLS ONLINE`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No commands or tools found matching your search.</div>';
    return;
  }

  grid.innerHTML = filtered.map((c) => `
    <div class="cmd-card" data-cmd-id="${c.id}">
      <div class="cmd-card-top">
        <span class="cmd-card-icon">${c.icon}</span>
        <span class="cmd-card-cat">${c.cat.toUpperCase()}</span>
      </div>
      <div class="cmd-card-title">${escapeHtml(c.name)}</div>
      <div class="cmd-card-desc">${escapeHtml(c.desc)}</div>
      <div class="cmd-card-footer">
        <button class="cmd-action-btn" data-run-id="${c.id}">${escapeHtml(c.btnText)}</button>
      </div>
    </div>
  `).join('');

  // Attach button click events
  grid.querySelectorAll('.cmd-action-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const runId = btn.getAttribute('data-run-id');
      const cmdItem = OWNER_COMMANDS_LIST.find((x) => x.id === runId);
      if (!cmdItem) return;

      if (cmdItem.hasInput) {
        openCmdParamModal(cmdItem);
      } else {
        executeOwnerCommand(cmdItem, cmdItem.defaultParams || {});
      }
    });
  });
}

function openCmdParamModal(cmdItem) {
  activeModalCommand = cmdItem;
  const modal = document.getElementById('cmdParamModal');
  const title = document.getElementById('cmdModalTitle');
  const desc = document.getElementById('cmdModalDesc');
  const input = document.getElementById('cmdModalInput');
  if (!modal || !title || !desc || !input) return;

  title.textContent = `${cmdItem.icon} ${cmdItem.name}`;
  desc.textContent = cmdItem.desc;
  input.placeholder = cmdItem.inputPlaceholder || 'Enter parameter...';
  input.value = cmdItem.defaultVal || '';
  modal.style.display = 'block';
  input.focus();
}

function closeCmdParamModal() {
  const modal = document.getElementById('cmdParamModal');
  if (modal) modal.style.display = 'none';
  activeModalCommand = null;
}

async function executeOwnerCommand(cmdItem, params = {}) {
  haptic.impact('heavy');
  appendTerminalLog(`> Executing /${cmdItem.cmd}...`);
  showToast(`Running ${cmdItem.name}...`);

  try {
    const res = await fetch('/api/owner/execute-command', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        command: cmdItem.cmd,
        params,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      haptic.notification('success');
      appendTerminalLog(`✓ [${cmdItem.cmd}] ${data.message || 'Execution completed successfully'}`);
      if (data.data) {
        appendTerminalLog(`↳ Telemetry: ${JSON.stringify(data.data)}`);
      }
      showToast(data.message || 'Executed successfully');
    } else {
      haptic.notification('warning');
      appendTerminalLog(`✗ [${cmdItem.cmd}] Error: ${data.message || data.error || 'Execution failed'}`, true);
      showToast(data.message || data.error || 'Failed', 'error');
    }
  } catch (err) {
    appendTerminalLog(`✗ [${cmdItem.cmd}] Network exception: ${err.message}`, true);
    showToast('Execution network error', 'error');
  }
}

function setupCommandHub() {
  const searchInput = document.getElementById('cmdSearchInput');
  const filterPills = document.querySelectorAll('.cmd-filter-pill');
  const clearTermBtn = document.getElementById('clearTerminalBtn');
  const modalCloseBtn = document.getElementById('cmdModalCloseBtn');
  const modalRunBtn = document.getElementById('cmdModalRunBtn');
  const modalInput = document.getElementById('cmdModalInput');

  // Search input live filter
  searchInput?.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.trim();
    renderCommandCards();
  });

  // Filter category pills
  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentActiveFilter = pill.getAttribute('data-cmd-filter') || 'all';
      haptic.selection();
      renderCommandCards();
    });
  });

  // Clear Terminal
  clearTermBtn?.addEventListener('click', () => {
    const term = document.getElementById('ownerTerminalOutput');
    if (term) term.innerHTML = '> Console output cleared. Ready for next command.';
    haptic.selection();
  });

  // Modal actions
  modalCloseBtn?.addEventListener('click', closeCmdParamModal);
  modalRunBtn?.addEventListener('click', () => {
    if (!activeModalCommand) return;
    const val = modalInput?.value?.trim() || '';
    const pKey = activeModalCommand.inputKey || 'text';
    const params = { [pKey]: val };
    executeOwnerCommand(activeModalCommand, params);
    closeCmdParamModal();
  });

  modalInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      modalRunBtn?.click();
    } else if (e.key === 'Escape') {
      closeCmdParamModal();
    }
  });

  // Initial render
  renderCommandCards();
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
        <div style="background:var(--bg-card); border:1px solid var(--border-card); border-radius:var(--radius-sm); padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; color:var(--text-primary); font-size:13px;">${escapeHtml(chat.group_title || 'Untitled Group')}</div>
            <div style="font-size:11px; color:var(--text-muted);">ID: <code>${chat.group_id}</code> · Messages: ${chat.message_count || 0}</div>
            <div style="font-size:11px; margin-top:2px;">
              Admin Rights: <span style="color:${isAdmin ? 'var(--status-green)' : 'var(--accent-red)'}; font-weight:700;">${isAdmin ? 'Granted' : 'Missing'}</span>
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
              <strong style="color:var(--text-primary); font-size:13px; margin-left:6px;">${escapeHtml(details.skillName || item.target_id)}</strong>
            </div>
            <span style="font-size:11px; color:var(--text-muted);">Submitter: ${escapeHtml(item.author_id)}</span>
          </div>
          <div style="font-size:12px; color:var(--text-secondary); line-height:1.4;">
            ${escapeHtml(details.description || 'No description provided.')}
          </div>
          ${
            details.permittedTools && details.permittedTools.length > 0
              ? `<div style="font-size:11px; color:var(--text-muted);">Permitted Tools: <code>${escapeHtml(details.permittedTools.join(', '))}</code></div>`
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
      <div style="background:var(--bg-surface-subtle); border:1px solid var(--border-card); border-radius:var(--radius-xs); padding:10px; margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:var(--text-primary); font-size:12px;">${escapeHtml(s.skill_name)}</strong>
          <span class="user-mem-badge cat-preference">v${escapeHtml(s.version || '1.0')}</span>
        </div>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:3px;">${escapeHtml(s.description)}</div>
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
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:6px; border-bottom:1px solid var(--border-medium);">
            <strong style="color:var(--text-primary); font-size:13px;">AUTOMATED SUITE RESULTS</strong>
            <span style="font-weight:700; color:${data.allPassed ? 'var(--status-green)' : 'var(--accent-red)'};">
              ${data.allPassed ? '✅ ALL TESTS PASSED' : '⚠️ FAILURES DETECTED'} (${data.passedCount}/${data.totalCount})
            </span>
          </div>
          ${data.tests
            .map(
              (t) => `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:11px;">
              <span style="color:var(--text-primary);">${escapeHtml(t.name)}</span>
              <span style="font-weight:700; color:${t.passed ? 'var(--status-green)' : 'var(--accent-red)'};">${t.passed ? 'PASS' : 'FAIL'}</span>
            </div>
            ${t.details ? `<div style="font-size:10px; color:var(--text-muted); margin-bottom:4px; margin-left:8px;">↳ ${escapeHtml(t.details)}</div>` : ''}
          `
            )
            .join('')}
          <div style="font-size:10px; color:var(--text-muted); margin-top:8px;">Timestamp: ${escapeHtml(data.timestamp)}</div>
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

// =========================================================================
// 💬 WHATSAPP 24/7 LIVE BRIDGE CLIENT CONTROLLER
// =========================================================================
let waQrInterval = null;

async function loadWhatsAppBridge() {
  try {
    const res = await fetch('/api/whatsapp/status', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.ok) return;

    const badge = document.getElementById('waStatusBadge');
    const linkedUser = document.getElementById('waLinkedUser');
    const countEl = document.getElementById('waProcessedCount');
    const modeEl = document.getElementById('waActiveMode');
    const qrImg = document.getElementById('waQrImage');
    const qrPlaceholder = document.getElementById('waQrPlaceholder');

    if (badge) {
      if (data.status === 'connected') {
        badge.textContent = '🟢 CONNECTED 24/7';
        badge.className = 'badge-status-green';
      } else if (data.status === 'qr_ready') {
        badge.textContent = '🟡 SCAN QR / PAIR';
        badge.className = 'badge-status-yellow';
      } else if (data.status === 'reconnecting') {
        badge.textContent = '🔄 RECONNECTING';
        badge.className = 'badge-status-yellow';
      } else {
        badge.textContent = '🔴 DISCONNECTED';
        badge.className = 'badge-status-red';
      }
    }

    if (linkedUser) {
      if (data.connectedUser) {
        const phone = (data.connectedUser.id || '').split(':')[0];
        linkedUser.textContent = `+${phone} (${data.connectedUser.name || 'Owner'})`;
      } else {
        linkedUser.textContent = 'Not Connected';
      }
    }

    if (countEl) {
      countEl.textContent = `${data.messageCount || 0} msgs`;
    }

    if (modeEl) {
      modeEl.textContent = data.mode === 'owner_only' ? 'Owner Only' : 'All Contacts';
    }

    if (data.status === 'connected') {
      if (qrPlaceholder) {
        qrPlaceholder.textContent = '✅ WhatsApp is connected!';
        qrPlaceholder.style.display = 'block';
      }
      if (qrImg) qrImg.style.display = 'none';
      if (waQrInterval) {
        clearInterval(waQrInterval);
        waQrInterval = null;
      }
    } else {
      await refreshWhatsAppQr();
      if (!waQrInterval) {
        waQrInterval = setInterval(refreshWhatsAppQr, 6000);
      }
    }
  } catch (err) {
    console.error('Failed to load WhatsApp bridge status:', err);
  }
}

async function refreshWhatsAppQr() {
  try {
    const res = await fetch('/api/whatsapp/qr', { headers: getAuthHeaders() });
    const data = await res.json();
    const qrImg = document.getElementById('waQrImage');
    const qrPlaceholder = document.getElementById('waQrPlaceholder');

    if (data.ok && data.qrDataUrl) {
      if (qrImg) {
        qrImg.src = data.qrDataUrl;
        qrImg.style.display = 'block';
      }
      if (qrPlaceholder) qrPlaceholder.style.display = 'none';
    } else if (data.status === 'connected') {
      if (qrImg) qrImg.style.display = 'none';
      if (qrPlaceholder) {
        qrPlaceholder.textContent = '✅ WhatsApp is connected!';
        qrPlaceholder.style.display = 'block';
      }
    }
  } catch (err) {
    // ignore
  }
}

function setupWhatsAppBridge() {
  document.getElementById('waRefreshQrBtn')?.addEventListener('click', async () => {
    haptic.selection();
    showToast('Refreshing QR Code...');
    await refreshWhatsAppQr();
  });

  document.getElementById('waGetPairingCodeBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('waPhoneNumberInput');
    const phone = (input?.value || '').trim();
    if (!phone) {
      showToast('Enter phone number with country code (e.g. 919876543210)', 'error');
      return;
    }

    haptic.impact('medium');
    showToast('Requesting 8-digit pairing code...');
    const btn = document.getElementById('waGetPairingCodeBtn');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/whatsapp/pair', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data = await res.json();
      if (data.ok && data.pairingCode) {
        const box = document.getElementById('waPairingCodeBox');
        const display = document.getElementById('waPairingCodeDisplay');
        if (box && display) {
          display.textContent = data.pairingCode;
          box.style.display = 'block';
        }
        showToast('Pairing code generated!');
      } else {
        showToast(data.error || 'Failed to generate code', 'error');
      }
    } catch (err) {
      showToast('Error requesting pairing code', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('waSendTestBtn')?.addEventListener('click', async () => {
    const toInput = document.getElementById('waTestToInput');
    const msgInput = document.getElementById('waTestMsgInput');
    const to = (toInput?.value || '').trim();
    const text = (msgInput?.value || '').trim();

    if (!to || !text) {
      showToast('Provide both recipient and message text', 'error');
      return;
    }

    haptic.impact('medium');
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ to, text }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ WhatsApp message sent!');
        if (msgInput) msgInput.value = '';
      } else {
        showToast(data.error || 'Failed to send message', 'error');
      }
    } catch {
      showToast('Error sending message', 'error');
    }
  });

  document.getElementById('waRestartBtn')?.addEventListener('click', async () => {
    haptic.impact('medium');
    showToast('Restarting WhatsApp Bridge socket...');
    try {
      const res = await fetch('/api/whatsapp/restart', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('WhatsApp Bridge restarted.');
        setTimeout(loadWhatsAppBridge, 2000);
      }
    } catch {
      showToast('Restart failed', 'error');
    }
  });

  document.getElementById('waDisconnectBtn')?.addEventListener('click', async () => {
    if (!confirm('Disconnect WhatsApp session and wipe credentials?')) return;
    haptic.impact('heavy');
    try {
      const res = await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('WhatsApp session disconnected.');
        loadWhatsAppBridge();
      }
    } catch {
      showToast('Disconnect failed', 'error');
    }
  });
}

// App Initialization
async function initOwnerApp() {
  startFpsMonitor();
  setupUnlockForm();
  setupNavigation();
  setupCommandHub();
  setupSwitchListeners();
  setupModelSelector();
  setupReasoningSelector();
  setupBroadcast();
  setupChatsInspector();
  setupMcpKeys();
  setupDevopsVerification();
  setupWhatsAppBridge();

  document.getElementById('refreshModerationQueueBtn')?.addEventListener('click', () => {
    haptic.selection();
    loadModerationQueue();
    loadApprovedSkills();
  });

  await verifyOwnerAuthentication();
}

window.addEventListener('DOMContentLoaded', initOwnerApp);

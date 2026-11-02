/**
 * =====================================================================
 * ROCK3T WEB OS — FLOATING ROCKET AI COMPANION
 * =====================================================================
 */

const ROCK3T_COMPANION = {
  currentAppContext: 'homescreen',
  chatHistory: [],
  speechTimeout: null,
  isChatOpen: false,

  init() {
    this.setupDraggable();
  },

  say(text) {
    const bubble = document.getElementById('companionBubble');
    if (!bubble) return;

    bubble.textContent = text;
    bubble.style.display = 'block';

    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    this.speechTimeout = setTimeout(() => {
      bubble.style.display = 'none';
    }, 7000);
  },

  onAppContextChange(appId) {
    this.currentAppContext = appId;
    const contextualRemarks = {
      homescreen: "Hey Sandy! Swipe left or right to explore your 5 OS pages! 🐾",
      store: "Looking for new gear in the store? Everything here is approved by us! 🛍️",
      canvas: "Show me your creative claws! Tap 'Ask Rocket' if you want a pizza slice! 🎨🍕",
      games: "Ready for Tic-Tac-Toe? My paws calculate the sharpest moves! 😈🎮",
      maps: "Scouting the radar! Nearest pizza shop is 2 blocks away! 🗺️",
      settings: "Answering those 50 questions helps me know you inside out, boss! ⚙️",
    };

    const remark = contextualRemarks[appId] || `Opened ${appId}! Standing by! 🦝`;
    this.say(remark);
  },

  onNavigate(pageIndex) {
    const pageRemarks = {
      '-2': "Page -2: Weather, radar, and widgets! 🌤️",
      '-1': "Page -1: Assistant feed and quick actions! ⚡",
      '0': "Main Home: Central command and core apps! 🏠",
      '1': "Page +1: Creative studio & tools! 🎨",
      '2': "Page +2: Arcade & media lounge! 🎮",
    };
    if (pageRemarks[String(pageIndex)]) {
      this.say(pageRemarks[String(pageIndex)]);
    }
  },

  toggleChat() {
    if (this.isChatOpen) {
      this.closeChatDrawer();
    } else {
      this.openChatDrawer();
    }
  },

  openChatDrawer() {
    this.isChatOpen = true;
    let drawer = document.getElementById('companionChatDrawer');

    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'companionChatDrawer';
      drawer.style.cssText = `
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 60%;
        background: var(--os-surface);
        border-top: 1px solid var(--os-border);
        border-radius: 26px 26px 0 0;
        box-shadow: var(--shadow-lg);
        z-index: 120;
        display: flex;
        flex-direction: column;
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        transform: translateY(100%);
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      `;

      drawer.innerHTML = `
        <div style="padding: 14px 18px; border-bottom: 1px solid var(--os-border); display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
            <span>🦝</span> Rocket Companion (GPT-6 Luna)
          </span>
          <button class="app-back-btn" onclick="ROCK3T_COMPANION.closeChatDrawer()">✕</button>
        </div>
        <div id="companionChatLogs" style="flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="align-self: flex-start; background: var(--os-surface-hover); padding: 10px 14px; border-radius: 14px; font-size: 0.85rem; max-width: 85%;">
            Haan boss! 🦝🐾 I am listening! Tell me what to do, ask a question, or command me to open apps or draw! 🍕
          </div>
        </div>
        <div style="padding: 10px 14px; border-top: 1px solid var(--os-border); display: flex; gap: 8px;">
          <input type="text" id="companionInput" placeholder="Talk to Rocket..." style="flex: 1; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--os-border); background: var(--os-surface-hover); color: var(--os-text); font-size: 0.88rem; outline: none;" onkeydown="if(event.key==='Enter') ROCK3T_COMPANION.sendChat()">
          <button class="btn-os primary" style="padding: 0 16px;" onclick="ROCK3T_COMPANION.sendChat()">➤</button>
        </div>
      `;
      document.getElementById('osViewport').appendChild(drawer);
    }

    setTimeout(() => {
      drawer.style.transform = 'translateY(0)';
    }, 10);
  },

  closeChatDrawer() {
    this.isChatOpen = false;
    const drawer = document.getElementById('companionChatDrawer');
    if (drawer) {
      drawer.style.transform = 'translateY(100%)';
    }
  },

  async sendChat() {
    const input = document.getElementById('companionInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const logs = document.getElementById('companionChatLogs');
    const userMsg = document.createElement('div');
    userMsg.style.cssText = `
      align-self: flex-end;
      background: var(--os-blue);
      color: #ffffff;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 0.85rem;
      max-width: 85%;
      font-weight: 600;
    `;
    userMsg.textContent = text;
    logs.appendChild(userMsg);
    logs.scrollTop = logs.scrollHeight;

    // Typing
    const typing = document.createElement('div');
    typing.style.cssText = `align-self: flex-start; color: var(--os-text-muted); font-size: 0.8rem; font-style: italic;`;
    typing.textContent = '🦝 Thinking with sharp paws...';
    logs.appendChild(typing);
    logs.scrollTop = logs.scrollHeight;

    try {
      const res = await fetch('/api/rock3t/companion/chat', {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
        body: JSON.stringify({
          message: text,
          appContext: this.currentAppContext,
          history: this.chatHistory,
        }),
      });

      const data = await res.json();
      typing.remove();

      if (data.ok) {
        const rocketMsg = document.createElement('div');
        rocketMsg.style.cssText = `
          align-self: flex-start;
          background: var(--os-surface-hover);
          color: var(--os-text);
          padding: 10px 14px;
          border-radius: 14px;
          font-size: 0.85rem;
          max-width: 85%;
        `;
        rocketMsg.textContent = data.reply;
        logs.appendChild(rocketMsg);
        logs.scrollTop = logs.scrollHeight;

        this.chatHistory.push({ role: 'user', content: text });
        this.chatHistory.push({ role: 'assistant', content: data.reply });

        // Handle tool calls if any
        if (data.toolResult) {
          this.handleToolResult(data.toolResult);
        }
      }
    } catch (err) {
      typing.remove();
      console.warn(err);
    }
  },

  handleToolResult(result) {
    if (result.action === 'open_app') {
      this.closeChatDrawer();
      ROCK3T_OS.openApp(result.appId);
    } else if (result.action === 'canvas_draw') {
      this.closeChatDrawer();
      ROCK3T_OS.openApp('canvas');
      setTimeout(() => {
        ROCK3T_CANVAS?.drawProgrammaticShape(result.drawing);
      }, 400);
    }
  },

  setupDraggable() {
    const el = document.getElementById('floatingCompanion');
    if (!el) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const onStart = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      isDragging = false;
    };

    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const diffX = clientX - startX;
      const diffY = clientY - startY;

      if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
        isDragging = true;
        const viewport = document.getElementById('osViewport');
        const vRect = viewport.getBoundingClientRect();

        const newRight = Math.max(10, Math.min(vRect.width - 70, vRect.right - clientX - 30));
        const newBottom = Math.max(100, Math.min(vRect.height - 100, vRect.bottom - clientY - 30));

        el.style.right = `${newRight}px`;
        el.style.bottom = `${newBottom}px`;
      }
    };

    el.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);

    el.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  ROCK3T_COMPANION.init();
});

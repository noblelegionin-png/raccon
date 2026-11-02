/**
 * =====================================================================
 * ROCK3T WEB OS — ROCKET AI COMPANION & CHAT CONTROLLER
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
    bubble.style.pointerEvents = 'none';

    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    this.speechTimeout = setTimeout(() => {
      bubble.style.display = 'none';
    }, 4500);
  },

  onAppContextChange(appId) {
    this.currentAppContext = appId;
    // Silent context switch without popping obtrusive overlays
  },

  onNavigate(pageIndex) {
    // Silent page navigation without popping speech bubbles
  },

  toggleChat() {
    if (ROCK3T_OS.activeApp === 'chat') {
      ROCK3T_OS.closeApp();
    } else {
      ROCK3T_OS.openApp('chat');
    }
  },

  openChatDrawer() {
    ROCK3T_OS.openApp('chat');
  },

  closeChatDrawer() {
    ROCK3T_OS.closeApp();
  },

  clearChat() {
    this.chatHistory = [];
    const logs = document.getElementById('companionChatLogs');
    if (logs) {
      logs.innerHTML = `
        <div class="chat-bubble-assistant">
          Haan boss! 🦝🐾 Chat history reset. Ask me anything, or tell me to research, practice study topics, or draw! 🍕⚡
        </div>
      `;
    }
  },

  async sendChat() {
    const input = document.getElementById('companionInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const logs = document.getElementById('companionChatLogs');
    if (!logs) return;

    const userMsg = document.createElement('div');
    userMsg.className = 'chat-bubble-user';
    userMsg.textContent = text;
    logs.appendChild(userMsg);
    logs.scrollTop = logs.scrollHeight;

    // Typing indicator
    const typing = document.createElement('div');
    typing.className = 'chat-bubble-assistant';
    typing.style.opacity = '0.7';
    typing.style.fontStyle = 'italic';
    typing.textContent = '🦝 Rocket is thinking with sharp paws...';
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
        rocketMsg.className = 'chat-bubble-assistant';
        rocketMsg.textContent = data.reply;
        logs.appendChild(rocketMsg);
        logs.scrollTop = logs.scrollHeight;

        this.chatHistory.push({ role: 'user', content: text });
        this.chatHistory.push({ role: 'assistant', content: data.reply });

        // Handle tool calls if any
        if (data.toolResult) {
          this.handleToolResult(data.toolResult);
        }
      } else {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'chat-bubble-assistant';
        errorMsg.style.borderColor = 'var(--os-red)';
        errorMsg.textContent = `⚠️ Error: ${data.error || 'Rocket failed to respond'}`;
        logs.appendChild(errorMsg);
        logs.scrollTop = logs.scrollHeight;
      }
    } catch (err) {
      typing.remove();
      console.warn('Chat dispatch note:', err);
    }
  },

  handleToolResult(result) {
    if (result.action === 'open_app') {
      ROCK3T_OS.openApp(result.appId);
    } else if (result.action === 'canvas_draw') {
      ROCK3T_OS.openApp('canvas');
      setTimeout(() => {
        ROCK3T_CANVAS?.drawProgrammaticShape(result.drawing);
      }, 400);
    }
  },

  setupDraggable() {
    const el = document.getElementById('floatingCompanion');
    const avatar = document.getElementById('companionAvatar');
    if (!el || !avatar) return;

    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;

    const onStart = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      isDragging = true;
      hasMoved = false;
    };

    const onMove = (e) => {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const diffX = clientX - startX;
      const diffY = clientY - startY;

      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        hasMoved = true;
        const viewport = document.getElementById('osViewport');
        const vRect = viewport ? viewport.getBoundingClientRect() : {
          width: window.innerWidth,
          height: window.innerHeight,
          right: window.innerWidth,
          bottom: window.innerHeight,
        };

        const newRight = Math.max(10, Math.min(vRect.width - 64, vRect.right - clientX - 25));
        const newBottom = Math.max(90, Math.min(vRect.height - 90, vRect.bottom - clientY - 25));

        el.style.right = `${newRight}px`;
        el.style.bottom = `${newBottom}px`;
      }
    };

    const onEnd = () => {
      isDragging = false;
    };

    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasMoved) {
        hasMoved = false;
        return;
      }
      ROCK3T_OS.openApp('chat');
    });

    el.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    el.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  ROCK3T_COMPANION.init();
});

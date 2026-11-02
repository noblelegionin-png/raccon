/**
 * 🦝 RACCOON OS — CLIENT INTERFACE CONTROLLER
 */

const RocketApp = {
  state: null,
  user: null,
  activeTab: 'home',
  chatHistory: [],
  sseSource: null,
  feedModalItem: 'pizza',
  audioCtx: null,

  init() {
    console.log('[Raccoon OS] Initializing Telegram Mini App...');
    // Initialize Telegram WebApp SDK if available
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      try {
        window.Telegram.WebApp.setHeaderColor('#070a10');
        window.Telegram.WebApp.setBackgroundColor('#070a10');
      } catch {}
    }

    this.initAudio();
    this.fetchInitialState();
    this.initSseStream();
    this.startCountdownTicker();
  },

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch {}
  },

  playChompSound() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, this.audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.12);
    } catch {}
  },

  playWakeSound() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(580, this.audioCtx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.25);
    } catch {}
  },

  getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      headers['x-telegram-init-data'] = initData;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const accessKey = urlParams.get('accessKey') || localStorage.getItem('rocket_access_key');
    if (accessKey) {
      headers['x-dashboard-access-key'] = accessKey;
    }
    const userId = urlParams.get('userId');
    if (userId) {
      headers['x-user-id'] = userId;
    }
    return headers;
  },

  async fetchInitialState() {
    try {
      const res = await fetch('/api/rocket/state', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.ok) {
        this.state = data.state;
        this.user = data.user;
        this.render();
        this.loadHistory();
      }
    } catch (err) {
      console.warn('[Raccoon OS] Error fetching state:', err);
    }
  },

  initSseStream() {
    try {
      if (this.sseSource) this.sseSource.close();
      this.sseSource = new EventSource('/api/rocket/stream');
      this.sseSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'state' && payload.state) {
            this.state = payload.state;
            this.render();
          }
        } catch {}
      };
      this.sseSource.onerror = () => {
        // SSE reconnects automatically
      };
    } catch {}
  },

  startCountdownTicker() {
    setInterval(() => {
      this.updateSleepTimer();
    }, 1000);
  },

  updateSleepTimer() {
    if (!this.state) return;
    const banner = document.getElementById('sleepBanner');
    const title = document.getElementById('sleepTitle');
    const subtitle = document.getElementById('sleepSubtitle');
    const countdown = document.getElementById('sleepCountdown');
    const pill = document.getElementById('sleepPill');
    const pillText = document.getElementById('sleepPillText');

    const now = Date.now();
    const scheduledStart = new Date(this.state.sleep_scheduled_start).getTime();
    const scheduledEnd = new Date(this.state.sleep_scheduled_end).getTime();

    if (this.state.is_sleeping) {
      const remainingSec = Math.max(0, Math.floor((scheduledEnd - now) / 1000));
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      countdown.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      title.textContent = '🌙 Rocket is Asleep';
      subtitle.textContent = 'Resting in hollow tree (~1h daily recharge)';
      pill.className = 'pill-badge sleeping';
      pillText.textContent = 'Sleeping';
      this.setRaccoonEyes('closed');
    } else {
      pill.className = 'pill-badge active';
      pillText.textContent = 'Active';
      if (now < scheduledStart) {
        const untilSleepSec = Math.max(0, Math.floor((scheduledStart - now) / 1000));
        const h = Math.floor(untilSleepSec / 3600);
        const m = Math.floor((untilSleepSec % 3600) / 60);
        const s = untilSleepSec % 60;
        countdown.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        title.textContent = '☀️ Rocket is Awake';
        subtitle.textContent = 'Time until next guaranteed rest cycle';
      } else {
        countdown.textContent = 'READY';
        title.textContent = '☀️ Rest Cycle Complete';
        subtitle.textContent = 'Full stamina restored!';
      }
      this.setRaccoonEyes('open');
    }
  },

  setRaccoonEyes(state) {
    const eyeLeft = document.getElementById('eyeLeft');
    const eyeRight = document.getElementById('eyeRight');
    const mouth = document.getElementById('raccoonMouth');
    if (!eyeLeft || !eyeRight) return;

    if (state === 'closed') {
      eyeLeft.setAttribute('ry', '1.5');
      eyeRight.setAttribute('ry', '1.5');
      if (mouth) mouth.setAttribute('d', 'M 95 125 Q 100 123 105 125');
    } else {
      eyeLeft.setAttribute('ry', '10');
      eyeRight.setAttribute('ry', '10');
      if (mouth) mouth.setAttribute('d', 'M 93 125 Q 100 132 107 125');
    }
  },

  render() {
    if (!this.state) return;
    const s = this.state;

    // Mood & Hero
    const heroMood = document.getElementById('heroMood');
    const heroTaskText = document.getElementById('heroTaskText');
    const hungerPercent = document.getElementById('hungerPercent');
    const hungerBar = document.getElementById('hungerBar');
    const fuelTokens = document.getElementById('fuelTokens');
    const fuelBar = document.getElementById('fuelBar');
    const pizzaCount = document.getElementById('pizzaCount');
    const tacoCount = document.getElementById('tacoCount');

    if (heroMood) heroMood.textContent = `${s.mood} 🦝`;
    if (heroTaskText) heroTaskText.textContent = s.current_task || 'Scouting pizza joints 🍕';

    // Hunger Meter
    if (hungerPercent) hungerPercent.textContent = `${s.hunger_level}% [${s.hunger_state.toUpperCase()}]`;
    if (hungerBar) hungerBar.style.width = `${Math.min(100, Math.max(0, s.hunger_level))}%`;

    // Fuel Tokens Meter
    if (fuelTokens) fuelTokens.textContent = `${s.fuel_tokens_remaining.toLocaleString()} / 50,000 tokens`;
    const fuelPct = Math.min(100, Math.max(0, (s.fuel_tokens_remaining / 50000) * 100));
    if (fuelBar) fuelBar.style.width = `${fuelPct}%`;

    // Stash Counters
    if (pizzaCount) pizzaCount.textContent = s.pizza_inventory;
    if (tacoCount) tacoCount.textContent = s.taco_inventory;

    // Fitness
    const fitnessWeight = document.getElementById('fitnessWeight');
    const fitnessBadge = document.getElementById('fitnessBadge');
    const caloriesEaten = document.getElementById('caloriesEaten');
    const caloriesBurned = document.getElementById('caloriesBurned');
    if (fitnessWeight) fitnessWeight.textContent = `${s.fictional_weight_kg} kg`;
    if (fitnessBadge) fitnessBadge.textContent = s.fitness_title;
    if (caloriesEaten) caloriesEaten.textContent = `${s.fictional_calories_eaten.toLocaleString()} kcal`;
    if (caloriesBurned) caloriesBurned.textContent = `${s.fictional_calories_burned.toLocaleString()} kcal`;

    // User Role Pill
    if (this.user) {
      const rolePillText = document.getElementById('rolePillText');
      if (rolePillText) {
        rolePillText.textContent = this.user.isOwner ? 'Sandy 👑' : (this.user.first_name || 'Member');
      }
      const navControlBtn = document.getElementById('navControlBtn');
      if (navControlBtn) {
        navControlBtn.style.display = this.user.isOwner ? 'flex' : 'none';
      }
    }

    // Status Tab Info
    const activityLevel = document.getElementById('activityLevel');
    const activityBar = document.getElementById('activityBar');
    const tasksCompletedCount = document.getElementById('tasksCompletedCount');
    const lastActivityTime = document.getElementById('lastActivityTime');
    if (activityLevel) activityLevel.textContent = `${s.activity_level}%`;
    if (activityBar) activityBar.style.width = `${s.activity_level}%`;
    if (tasksCompletedCount) tasksCompletedCount.textContent = s.accumulated_tasks;
    if (lastActivityTime) lastActivityTime.textContent = new Date(s.last_activity_at).toLocaleTimeString();

    // Group Space Stats
    const groupPizzaCount = document.getElementById('groupPizzaCount');
    const groupTacoCount = document.getElementById('groupTacoCount');
    if (groupPizzaCount) groupPizzaCount.textContent = s.pizza_inventory;
    if (groupTacoCount) groupTacoCount.textContent = s.taco_inventory;
  },

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.view-section').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab-btn').forEach((el) => el.classList.remove('active'));

    const targetView = document.getElementById(`view-${tabId}`);
    if (targetView) targetView.classList.add('active');

    const tabBtn = Array.from(document.querySelectorAll('.nav-tab-btn')).find((b) =>
      b.getAttribute('onclick')?.includes(tabId)
    );
    if (tabBtn) tabBtn.classList.add('active');

    if (tabId === 'life') {
      this.loadHistory();
    } else if (tabId === 'control' && this.user?.isOwner) {
      this.loadRbacUsers();
    }
  },

  async quickFeed(itemType) {
    this.playChompSound();
    try {
      const res = await fetch('/api/rocket/feed', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ itemType, amount: 1 }),
      });
      const data = await res.json();
      if (data.ok) {
        this.state = data.state;
        this.render();
        this.showToast(data.message);
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.warn('Feed error:', err);
    }
  },

  openFeedModal(itemType) {
    this.feedModalItem = itemType;
    const modal = document.getElementById('feedModal');
    const title = document.getElementById('feedModalTitle');
    if (title) title.textContent = `Feed Rocket ${itemType.toUpperCase()} 🍕`;
    if (modal) modal.classList.add('open');
  },

  closeFeedModal() {
    const modal = document.getElementById('feedModal');
    if (modal) modal.classList.remove('open');
  },

  async submitFeed() {
    const amount = parseInt(document.getElementById('feedAmountInput').value || '1', 10);
    const note = document.getElementById('feedNoteInput').value;
    this.closeFeedModal();
    this.playChompSound();

    try {
      const res = await fetch('/api/rocket/feed', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ itemType: this.feedModalItem, amount, note }),
      });
      const data = await res.json();
      if (data.ok) {
        this.state = data.state;
        this.render();
        this.showToast(data.message);
      }
    } catch (err) {
      console.warn(err);
    }
  },

  petRocket() {
    this.playWakeSound();
    const glow = document.getElementById('avatarGlow');
    if (glow) {
      glow.style.background = 'radial-gradient(circle, rgba(255, 0, 110, 0.6) 0%, transparent 70%)';
      setTimeout(() => {
        glow.style.background = '';
      }, 1200);
    }
    this.showToast('🦝💖 *purrs softly and leans head against your hand* Rocket loves head pats!');
  },

  pokeRocket() {
    this.playChompSound();
    const eyeLeft = document.getElementById('eyeLeft');
    const eyeRight = document.getElementById('eyeRight');
    if (eyeLeft && eyeRight) {
      eyeLeft.setAttribute('ry', '3');
      eyeRight.setAttribute('ry', '12');
      setTimeout(() => {
        eyeLeft.setAttribute('ry', '10');
        eyeRight.setAttribute('ry', '10');
      }, 400);
    }
    this.showToast('🦝😜 *bites playfully* Hey! Hands off the ears unless you brought pizza!');
  },

  async sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    const messages = document.getElementById('chatMessages');

    // Append user bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'message-bubble user';
    userBubble.textContent = text;
    messages.appendChild(userBubble);
    messages.scrollTop = messages.scrollHeight;

    // Append typing indicator
    const typingBubble = document.createElement('div');
    typingBubble.className = 'message-bubble rocket';
    typingBubble.innerHTML = '🦝🐾 <em>Rocket is typing with fast claws...</em>';
    messages.appendChild(typingBubble);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch('/api/rocket/chat', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ message: text, history: this.chatHistory }),
      });
      const data = await res.json();
      typingBubble.remove();

      if (data.ok) {
        const rocketBubble = document.createElement('div');
        rocketBubble.className = 'message-bubble rocket';
        rocketBubble.textContent = data.reply;
        messages.appendChild(rocketBubble);

        this.chatHistory.push({ role: 'user', content: text });
        this.chatHistory.push({ role: 'assistant', content: data.reply });

        if (data.tokensUsed) {
          const counter = document.getElementById('chatTokenCounter');
          if (counter) counter.textContent = `${data.tokensUsed} tokens used`;
        }
        if (data.state) {
          this.state = data.state;
          this.render();
        }
      } else {
        const errorBubble = document.createElement('div');
        errorBubble.className = 'message-bubble rocket';
        errorBubble.textContent = `❌ ${data.error}`;
        messages.appendChild(errorBubble);
      }
      messages.scrollTop = messages.scrollHeight;
    } catch (err) {
      typingBubble.remove();
      const errBubble = document.createElement('div');
      errBubble.className = 'message-bubble rocket';
      errBubble.textContent = `⚠️ Connection error: ${err.message}`;
      messages.appendChild(errBubble);
    }
  },

  async emergencyWake() {
    this.playWakeSound();
    try {
      const res = await fetch('/api/rocket/sleep/wake', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        this.state = data.state;
        this.render();
        this.showToast(data.message);
      }
    } catch (err) {
      console.warn(err);
    }
  },

  async refillFood() {
    this.playChompSound();
    try {
      const res = await fetch('/api/rocket/refill', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ pizzas: 50, tacos: 25 }),
      });
      const data = await res.json();
      if (data.ok) {
        this.state = data.state;
        this.render();
        this.showToast(data.message);
      }
    } catch (err) {
      console.warn(err);
    }
  },

  async loadHistory() {
    try {
      const res = await fetch('/api/rocket/history?limit=15', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.ok && data.transactions) {
        const container = document.getElementById('historyList');
        if (!container) return;
        container.innerHTML = '';

        for (const item of data.transactions) {
          const div = document.createElement('div');
          div.className = 'item-log';
          const icon = item.item_type === 'pizza' ? '🍕' : item.item_type === 'taco' ? '🌮' : '⚡';
          div.innerHTML = `
            <span>${icon} <strong>${item.user_name || 'Friend'}</strong>: ${item.action} (${item.amount || item.tokens_used || ''})</span>
            <span class="item-badge">${new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          `;
          container.appendChild(div);
        }
      }
    } catch {}
  },

  async loadRbacUsers() {
    try {
      const res = await fetch('/api/rocket/users', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.ok && data.users) {
        const container = document.getElementById('rbacUsersList');
        if (!container) return;
        container.innerHTML = '';

        for (const u of data.users) {
          const div = document.createElement('div');
          div.className = 'item-log';
          div.innerHTML = `
            <span>${u.role === 'owner' ? '👑' : '👤'} <strong>${u.user_name}</strong> (${u.user_id})</span>
            <span class="item-badge" style="text-transform: uppercase;">${u.role}</span>
          `;
          container.appendChild(div);
        }
      }
    } catch {}
  },

  showToast(message) {
    if (window.Telegram?.WebApp?.showPopup) {
      window.Telegram.WebApp.showPopup({
        title: 'Rocket AI 🦝',
        message: message.replace(/[*_#]/g, ''),
        buttons: [{ type: 'ok' }],
      });
    } else {
      alert(message.replace(/[*_#]/g, ''));
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  RocketApp.init();
});

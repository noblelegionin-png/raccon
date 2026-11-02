/**
 * =====================================================================
 * ROCK3T WEB OS — CORE OPERATING SYSTEM CONTROLLER
 * =====================================================================
 */

const ROCK3T_OS = {
  currentPage: 0, // -2, -1, 0, 1, 2
  activeApp: null,
  profile: null,
  user: null,

  init() {
    console.log('[ROCK3T OS] Booting Web OS...');
    
    // 0. Instant offline memory load (Wallpaper, Theme, Settings saved per device)
    try {
      const cachedWp = localStorage.getItem('rock3t_wallpaper');
      if (cachedWp) this.applyWallpaper(cachedWp, false);
      const cachedTheme = localStorage.getItem('rock3t_theme');
      if (cachedTheme) document.documentElement.setAttribute('data-theme', cachedTheme);
      const cachedDpi = localStorage.getItem('rock3t_dpi');
      if (cachedDpi) document.documentElement.style.setProperty('--dpi-scale', cachedDpi);
      const cachedAnim = localStorage.getItem('rock3t_anim');
      if (cachedAnim) document.documentElement.style.setProperty('--anim-speed', cachedAnim);
    } catch {}

    // 1. Initialize Telegram WebApp SDK if available
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      try {
        window.Telegram.WebApp.setHeaderColor('#ffffff');
        window.Telegram.WebApp.setBackgroundColor('#ffffff');
      } catch {}

      // Handle Telegram Native Back Button
      if (window.Telegram.WebApp.BackButton) {
        window.Telegram.WebApp.BackButton.onClick(() => {
          if (this.activeApp) {
            this.closeApp();
          }
        });
      }

      // Handle Viewport changes
      const updateViewportHeight = () => {
        if (window.Telegram.WebApp.viewportHeight) {
          document.documentElement.style.setProperty('--tg-viewport-height', `${window.Telegram.WebApp.viewportHeight}px`);
        }
      };
      updateViewportHeight();
      window.Telegram.WebApp.onEvent('viewportChanged', updateViewportHeight);
    }

    // 2. Start Clock & Status Bar
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);

    // 3. Setup Touch / Swipe Gestures on Home Pager (120 FPS high smoothness & motion blur)
    this.setupSwipeGestures();

    // 4. Default to Page 0 (Central Main Workspace) on boot
    this.goToPage(0, false);
    requestAnimationFrame(() => {
      this.goToPage(0, false);
    });

    // 5. Realign on window resize or orientation change
    window.addEventListener('resize', () => {
      this.goToPage(this.currentPage, false);
    });
    window.addEventListener('orientationchange', () => {
      this.goToPage(this.currentPage, false);
    });

    // 6. Fetch User Profile & Installed Apps
    this.fetchProfile();

    // 7. Fetch Rocket Life Engine Telemetry
    this.fetchLifeEngineStatus();
    setInterval(() => this.fetchLifeEngineStatus(), 15000);
  },

  applyWallpaper(wallpaper, saveToStorage = true) {
    if (saveToStorage) {
      try { localStorage.setItem('rock3t_wallpaper', wallpaper || 'clean_white'); } catch {}
    }
    const viewport = document.querySelector('.os-viewport');
    if (!viewport) return;
    if (!wallpaper || wallpaper === 'clean_white') {
      viewport.style.backgroundImage = 'none';
      viewport.style.backgroundColor = 'var(--os-bg)';
      document.documentElement.style.removeProperty('--os-wallpaper');
    } else {
      const urlStr = (wallpaper.startsWith('data:') || wallpaper.startsWith('http') || wallpaper.startsWith('/'))
        ? `url("${wallpaper}")`
        : wallpaper;
      viewport.style.backgroundImage = urlStr;
      viewport.style.backgroundSize = 'cover';
      viewport.style.backgroundPosition = 'center';
      document.documentElement.style.setProperty('--os-wallpaper', urlStr);
    }
  },

  async fetchLifeEngineStatus() {
    try {
      const res = await fetch('/api/rocket/state', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.ok && data.state) {
        this.renderLifeEngineWidget(data.state);
      }
    } catch {}
  },

  renderLifeEngineWidget(state) {
    const hungerEl = document.getElementById('lifeHungerVal');
    const hungerBar = document.getElementById('lifeHungerBar');
    const moodEl = document.getElementById('lifeMoodVal');
    const stashEl = document.getElementById('lifeStashVal');
    const sleepEl = document.getElementById('lifeSleepVal');

    if (hungerEl) hungerEl.textContent = `${state.hunger || 0}%`;
    if (hungerBar) hungerBar.style.width = `${Math.min(100, Math.max(0, state.hunger || 0))}%`;
    if (moodEl) moodEl.textContent = state.mood ? `${state.mood.charAt(0).toUpperCase() + state.mood.slice(1)}` : 'Playful';
    if (stashEl) {
      const p = state.foodInventory?.pizzas ?? 0;
      const t = state.foodInventory?.tacos ?? 0;
      stashEl.textContent = `🍕 ${p} | 🌮 ${t}`;
    }
    if (sleepEl) {
      sleepEl.textContent = state.isSleeping ? 'Sleeping 😴' : 'Active ⚡';
    }
  },

  async feedRocket(itemType = 'pizza') {
    this.spawnFoodParticle(itemType === 'pizza' ? '🍕' : '🌮');
    
    // 0ms Optimistic UI feedback
    const hungerEl = document.getElementById('lifeHungerVal');
    const hungerBar = document.getElementById('lifeHungerBar');
    if (hungerEl && hungerBar) {
      let cur = parseInt(hungerEl.textContent, 10) || 0;
      let next = Math.max(0, cur - 10);
      hungerEl.textContent = `${next}%`;
      hungerBar.style.width = `${next}%`;
    }
    ROCK3T_COMPANION?.say(itemType === 'pizza' ? 'Chomped a delicious slice of pizza! 🍕🦝 +10% energy!' : 'Crunchy taco devoured! 🌮🦝');

    try {
      const res = await fetch('/api/rocket/feed', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ itemType, amount: 1 }),
      });
      const data = await res.json();
      if (data.ok && data.state) {
        this.renderLifeEngineWidget(data.state);
      }
    } catch (err) {
      console.warn('Feed sync note:', err);
    }
  },

  spawnFoodParticle(emoji = '🍕') {
    const btnRow = document.getElementById('foodBtnRow');
    if (!btnRow) return;
    const particle = document.createElement('div');
    particle.textContent = `+10% ${emoji}`;
    particle.style.cssText = `
      position: absolute;
      left: 50%;
      top: -24px;
      transform: translateX(-50%);
      font-size: 0.9rem;
      font-weight: 800;
      color: #ff9f1c;
      pointer-events: none;
      animation: dropBounce 0.8s ease-out forwards;
      z-index: 100;
      text-shadow: 0 2px 6px rgba(0,0,0,0.3);
    `;
    btnRow.style.position = 'relative';
    btnRow.appendChild(particle);
    setTimeout(() => particle.remove(), 850);
  },

  async nextThought() {
    const noteEl = document.getElementById('widgetRaccoonNote');
    const badge = document.getElementById('thoughtLiveBadge');
    if (!noteEl) return;
    noteEl.style.opacity = '0.3';
    try {
      const res = await fetch('/api/rock3t/thoughts/random', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.ok && data.thought) {
        noteEl.textContent = `"${data.thought.text}"`;
        if (badge) {
          badge.textContent = data.thought.isLive ? '🔥 Live Luna' : '💎 Vault';
        }
      }
    } catch {}
    noteEl.style.opacity = '1';
  },

  async generateLunaThought() {
    const noteEl = document.getElementById('widgetRaccoonNote');
    const badge = document.getElementById('thoughtLiveBadge');
    if (!noteEl) return;
    noteEl.innerHTML = '🦝🐾 <em>Rocket is brewing a fresh thought with Luna...</em>';
    if (badge) badge.textContent = '⚡ Thinking...';
    try {
      const res = await fetch('/api/rock3t/thoughts/generate', {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok && data.thought) {
        noteEl.textContent = `"${data.thought.text}"`;
        if (badge) badge.textContent = '🔥 Live Luna';
        ROCK3T_COMPANION?.say(data.thought.text);
      }
    } catch {
      noteEl.textContent = '"A balanced diet is a slice of pizza in each paw! 🐾🍕"';
      if (badge) badge.textContent = '💎 Vault';
    }
  },

  getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) headers['x-telegram-init-data'] = initData;

    const urlParams = new URLSearchParams(window.location.search);
    const accessKey = urlParams.get('accessKey') || localStorage.getItem('rock3t_access_key');
    if (accessKey) headers['x-dashboard-access-key'] = accessKey;

    const userId = urlParams.get('userId');
    if (userId) headers['x-user-id'] = userId;

    return headers;
  },

  updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const statusTime = document.getElementById('statusBarTime');
    const homeClock = document.getElementById('homeClock');
    const homeDate = document.getElementById('homeDate');

    if (statusTime) statusTime.textContent = timeStr;
    if (homeClock) homeClock.textContent = timeStr;

    if (homeDate) {
      const options = { weekday: 'long', month: 'long', day: 'numeric' };
      homeDate.textContent = now.toLocaleDateString('en-US', options);
    }
  },

  getContainerWidth() {
    const container = document.getElementById('pagerContainer');
    return (container && container.clientWidth) || window.innerWidth || document.documentElement.clientWidth || 360;
  },

  goToPage(pageIndex, animate = true) {
    if (pageIndex < -2 || pageIndex > 2) return;
    this.currentPage = pageIndex;

    const track = document.getElementById('pagesTrack');
    const width = this.getContainerWidth();
    // 5 Pages ordered: -2 (0), -1 (1), 0 (2), 1 (3), 2 (4)
    // Absolute pixel displacement guarantees 1 single full-width page is visible, never squished
    const targetTranslatePx = - (pageIndex + 2) * width;
    
    if (track) {
      if (!animate) {
        track.style.transition = 'none';
        track.style.setProperty('--motion-blur', '0px');
        track.style.transform = `translate3d(${targetTranslatePx}px, 0, 0)`;
        track.classList.remove('sliding');
      } else {
        track.classList.add('sliding');
        track.style.transition = 'transform calc(0.32s * var(--anim-speed, 1)) cubic-bezier(0.16, 1, 0.3, 1), filter calc(0.12s * var(--anim-speed, 1)) ease';
        track.style.setProperty('--motion-blur', '1.6px');
        track.style.transform = `translate3d(${targetTranslatePx}px, 0, 0)`;
        
        clearTimeout(this._slideTimer);
        this._slideTimer = setTimeout(() => {
          track.classList.remove('sliding');
          track.style.setProperty('--motion-blur', '0px');
          track.style.transition = 'none';
        }, 160);
      }
    }

    // Update indicator dots
    const dots = document.querySelectorAll('.indicator-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === (pageIndex + 2));
    });

    // Update current-page class on sections
    const pages = document.querySelectorAll('.home-page');
    pages.forEach((p, idx) => {
      p.classList.toggle('current-page', idx === (pageIndex + 2));
    });

    // Notify Companion
    ROCK3T_COMPANION?.onNavigate(pageIndex);
  },

  setupSwipeGestures() {
    const container = document.getElementById('pagerContainer');
    const track = document.getElementById('pagesTrack');
    if (!container || !track) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let isTracking = false;
    let isSwipingHorizontal = false;
    let startTranslatePx = 0;

    // Global capturing click blocker: prevents accidental button taps when swiping pages
    let suppressClick = false;
    window.addEventListener('click', (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    }, true);

    container.addEventListener('touchstart', (e) => {
      if (this.activeApp) return;
      const target = e.target;
      // Do not initiate horizontal page swipe on form inputs, textareas, or companion avatar drag
      if (target.closest('input, textarea, select, #companionAvatar')) {
        isTracking = false;
        return;
      }

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = performance.now();
      lastX = startX;
      lastTime = startTime;
      velocity = 0;
      isTracking = true;
      isSwipingHorizontal = false;
      suppressClick = false;
      const width = this.getContainerWidth();
      startTranslatePx = - (this.currentPage + 2) * width;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!isTracking || !e.touches[0]) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = currentX - startX;
      const diffY = currentY - startY;

      // Lock direction after 6px of movement
      if (!isSwipingHorizontal) {
        if (Math.abs(diffY) > 8 && Math.abs(diffY) > Math.abs(diffX)) {
          // Dominantly vertical: cancel horizontal tracking and allow native page scroll
          isTracking = false;
          return;
        }
        if (Math.abs(diffX) > 6 && Math.abs(diffX) >= Math.abs(diffY)) {
          isSwipingHorizontal = true;
          suppressClick = true; // Block any button click under thumb
          track.classList.add('sliding');
          track.style.transition = 'none'; // Instant 120 FPS 1:1 finger tracking
        }
      }

      if (isSwipingHorizontal) {
        if (e.cancelable) e.preventDefault();

        // High-precision velocity calculation
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 8) {
          velocity = (currentX - lastX) / dt;
          lastX = currentX;
          lastTime = now;
        }

        // Boundary resistance (spring dampening at extremities)
        let effectiveDiffX = diffX;
        if ((this.currentPage === -2 && diffX > 0) || (this.currentPage === 2 && diffX < 0)) {
          effectiveDiffX = diffX * 0.28;
        }

        // Dynamic 120 FPS Motion Blur proportional to finger speed (50% shorter/tighter)
        const blurAmount = Math.min(2.2, Math.abs(velocity) * 1.2);
        track.style.setProperty('--motion-blur', `${blurAmount.toFixed(1)}px`);

        // Direct 1:1 pixel displacement
        track.style.transform = `translate3d(${startTranslatePx + effectiveDiffX}px, 0, 0)`;
      }
    }, { passive: false });

    const handleTouchEnd = (e) => {
      if (!isTracking) return;
      isTracking = false;

      if (!isSwipingHorizontal) return;
      isSwipingHorizontal = false;

      // Keep suppressClick active for 80ms to swallow trailing synthetic click event
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 80);

      const touch = (e.changedTouches && e.changedTouches[0]) || { clientX: lastX };
      const diffX = touch.clientX - startX;
      const width = this.getContainerWidth();
      const movedPercent = Math.abs(diffX) / width;

      // Decide target page: quick flick (velocity > 0.28 px/ms) or dragged over 16% of screen
      let targetPage = this.currentPage;
      if (velocity < -0.28 || (diffX < 0 && movedPercent > 0.16)) {
        targetPage = Math.min(2, this.currentPage + 1);
      } else if (velocity > 0.28 || (diffX > 0 && movedPercent > 0.16)) {
        targetPage = Math.max(-2, this.currentPage - 1);
      }

      this.goToPage(targetPage, true);
    };

    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
  },

  openApp(appId) {
    console.log(`[ROCK3T OS] Opening App: ${appId}`);
    this.activeApp = appId;
    document.body.classList.add('app-open');

    // Show native Telegram back button
    if (window.Telegram?.WebApp?.BackButton) {
      window.Telegram.WebApp.BackButton.show();
    }

    // Capitalize app name for window ID (e.g. store -> appWindowStore, chat -> appWindowChat)
    const windowId = `appWindow${appId.charAt(0).toUpperCase() + appId.slice(1)}`;
    const win = document.getElementById(windowId);

    if (win) {
      win.classList.add('open');
      // Trigger app-specific activation hooks
      if (appId === 'games') ROCK3T_GAMES?.onAppOpened();
      if (appId === 'study') ROCK3T_STUDY?.onAppOpened();
      if (appId === 'canvas') ROCK3T_CANVAS?.onAppOpened();
      if (appId === 'store') this.loadStoreApps();
      if (appId === 'settings') ROCK3T_SETTINGS?.onAppOpened();
      if (appId === 'chat') {
        setTimeout(() => {
          const input = document.getElementById('companionInput');
          if (input) input.focus();
        }, 200);
      }
    }
  },

  closeApp() {
    if (!this.activeApp) return;
    const windowId = `appWindow${this.activeApp.charAt(0).toUpperCase() + this.activeApp.slice(1)}`;
    const win = document.getElementById(windowId);
    if (win) {
      win.classList.remove('open');
    }
    this.activeApp = null;
    document.body.classList.remove('app-open');

    // Hide native Telegram back button
    if (window.Telegram?.WebApp?.BackButton) {
      window.Telegram.WebApp.BackButton.hide();
    }
  },

  async fetchProfile() {
    try {
      const res = await fetch('/api/rock3t/profile', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.ok) {
        this.profile = data.profile;
        this.user = data.user;

        // Apply appearance settings and persist to device memory
        if (this.profile.theme) {
          document.documentElement.setAttribute('data-theme', this.profile.theme);
          try { localStorage.setItem('rock3t_theme', this.profile.theme); } catch {}
        }
        if (this.profile.animation_speed !== undefined) {
          document.documentElement.style.setProperty('--anim-speed', this.profile.animation_speed);
          try { localStorage.setItem('rock3t_anim', this.profile.animation_speed); } catch {}
        }
        if (this.profile.dpi_scale !== undefined) {
          document.documentElement.style.setProperty('--dpi-scale', this.profile.dpi_scale);
          try { localStorage.setItem('rock3t_dpi', this.profile.dpi_scale); } catch {}
        }
        if (this.profile.wallpaper) {
          this.applyWallpaper(this.profile.wallpaper, true);
        }

        // Greeting
        const greet = document.getElementById('homeGreet');
        if (greet) {
          greet.textContent = `Hey ${this.user.first_name || 'Sandy'}! 🐾`;
        }
      }
    } catch (err) {
      console.warn('[ROCK3T OS] Profile fetch note:', err.message);
    }
  },

  async loadStoreApps() {
    try {
      const res = await fetch('/api/rock3t/store/apps', { headers: this.getAuthHeaders() });
      const data = await res.json();
      if (data.ok) {
        const list = document.getElementById('storeAppsList');
        if (!list) return;
        list.innerHTML = '';

        for (const app of data.apps) {
          const item = document.createElement('div');
          item.className = 'settings-item';
          item.style.padding = '12px 0';
          item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: ${app.color}; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: #fff;">
                ${app.icon}
              </div>
              <div class="settings-item-info">
                <h4>${app.name} <span style="font-size: 0.7rem; color: var(--os-text-muted); font-weight: normal;">v${app.version}</span></h4>
                <p>${app.description}</p>
              </div>
            </div>
            <button class="btn-os ${app.isInstalled ? '' : 'primary'}" onclick="ROCK3T_OS.toggleInstallApp('${app.id}', ${!app.isInstalled})">
              ${app.isInstalled ? 'Installed' : 'Install'}
            </button>
          `;
          list.appendChild(item);
        }
      }
    } catch (err) {
      console.warn('Store load error:', err);
    }
  },

  async toggleInstallApp(appId, install) {
    try {
      const res = await fetch('/api/rock3t/store/toggle', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ appId, install }),
      });
      const data = await res.json();
      if (data.ok) {
        this.loadStoreApps();
        ROCK3T_COMPANION?.say(install ? `Installed ${appId}! Ready to launch! 🚀` : `Uninstalled ${appId}!`);
      }
    } catch (err) {
      console.warn(err);
    }
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ROCK3T_OS.init());
} else {
  ROCK3T_OS.init();
}
window.addEventListener('load', () => {
  ROCK3T_OS.goToPage(ROCK3T_OS.currentPage, false);
});

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

    // 5. Realign on window resize or orientation change
    window.addEventListener('resize', () => {
      this.goToPage(this.currentPage, false);
    });

    // 6. Fetch User Profile & Installed Apps
    this.fetchProfile();

    // 7. Fetch Rocket Life Engine Telemetry
    this.fetchLifeEngineStatus();
    setInterval(() => this.fetchLifeEngineStatus(), 15000);
  },

  applyWallpaper(wallpaper) {
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
    try {
      const res = await fetch('/api/rocket/feed', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ itemType, amount: 1 }),
      });
      const data = await res.json();
      if (data.ok) {
        ROCK3T_COMPANION?.say(data.message || `Chomped a delicious ${itemType}! 🍕🦝`);
        if (data.state) this.renderLifeEngineWidget(data.state);
      } else {
        alert(data.error || 'Feeding failed');
      }
    } catch (err) {
      console.warn('Feed error:', err);
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

  goToPage(pageIndex, animate = true) {
    if (pageIndex < -2 || pageIndex > 2) return;
    this.currentPage = pageIndex;

    const track = document.getElementById('pagesTrack');
    // Pages are ordered: -2 (0%), -1 (-20%), 0 (-40%), 1 (-60%), 2 (-80%)
    const translatePercent = (pageIndex + 2) * -20;
    
    if (track) {
      if (!animate) {
        track.style.transition = 'none';
        track.style.setProperty('--motion-blur', '0px');
        track.style.transform = `translate3d(${translatePercent}%, 0, 0)`;
        track.classList.remove('sliding');
      } else {
        track.classList.add('sliding');
        track.style.transition = 'transform calc(0.38s * var(--anim-speed, 1)) cubic-bezier(0.16, 1, 0.3, 1), filter calc(0.3s * var(--anim-speed, 1)) ease';
        track.style.setProperty('--motion-blur', '2.2px');
        track.style.transform = `translate3d(${translatePercent}%, 0, 0)`;
        
        clearTimeout(this._slideTimer);
        this._slideTimer = setTimeout(() => {
          track.classList.remove('sliding');
          track.style.setProperty('--motion-blur', '0px');
        }, 380);
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
    let startTranslatePercent = 0;

    container.addEventListener('touchstart', (e) => {
      if (this.activeApp) return;
      const target = e.target;
      // Do not initiate page swipe on buttons, inputs, links, or companion avatar
      if (target.closest('button, input, select, textarea, a, .btn-os, .dock-icon, #floatingCompanion')) {
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
      startTranslatePercent = (this.currentPage + 2) * -20;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!isTracking || !e.touches[0]) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = currentX - startX;
      const diffY = currentY - startY;

      // Lock direction after 7px of movement
      if (!isSwipingHorizontal) {
        if (Math.abs(diffY) > 8 && Math.abs(diffY) > Math.abs(diffX)) {
          // Dominantly vertical: cancel horizontal tracking and allow native page scroll
          isTracking = false;
          return;
        }
        if (Math.abs(diffX) > 8 && Math.abs(diffX) >= Math.abs(diffY)) {
          isSwipingHorizontal = true;
          track.classList.add('sliding');
          track.style.transition = 'none'; // Instant 120 FPS 1:1 finger tracking
        }
      }

      if (isSwipingHorizontal) {
        if (e.cancelable) e.preventDefault();

        // Calculate velocity
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 10) {
          velocity = (currentX - lastX) / dt;
          lastX = currentX;
          lastTime = now;
        }

        // Convert delta pixels to track percentage (1 container width = 20% of track)
        const containerWidth = container.clientWidth || window.innerWidth || 360;
        let deltaPercent = (diffX / containerWidth) * 20;

        // Rubber-band resistance at boundaries
        if ((this.currentPage === -2 && diffX > 0) || (this.currentPage === 2 && diffX < 0)) {
          deltaPercent *= 0.3;
        }

        // Dynamic Motion Blur based on dragging speed
        const blurAmount = Math.min(3.5, Math.abs(velocity) * 1.6);
        track.style.setProperty('--motion-blur', `${blurAmount.toFixed(1)}px`);

        track.style.transform = `translate3d(${startTranslatePercent + deltaPercent}%, 0, 0)`;
      }
    }, { passive: false });

    const handleTouchEnd = (e) => {
      if (!isTracking) return;
      isTracking = false;

      if (!isSwipingHorizontal) return;
      isSwipingHorizontal = false;

      const touch = (e.changedTouches && e.changedTouches[0]) || { clientX: lastX };
      const diffX = touch.clientX - startX;
      const containerWidth = container.clientWidth || window.innerWidth || 360;
      const movedPercent = Math.abs(diffX) / containerWidth;

      // Decide target page: quick flick (velocity > 0.3 px/ms) or dragged over 18% of screen
      let targetPage = this.currentPage;
      if (velocity < -0.3 || (diffX < 0 && movedPercent > 0.18)) {
        targetPage = Math.min(2, this.currentPage + 1);
      } else if (velocity > 0.3 || (diffX > 0 && movedPercent > 0.18)) {
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

        // Apply appearance settings
        if (this.profile.theme) {
          document.documentElement.setAttribute('data-theme', this.profile.theme);
        }
        if (this.profile.animation_speed !== undefined) {
          document.documentElement.style.setProperty('--anim-speed', this.profile.animation_speed);
        }
        if (this.profile.dpi_scale !== undefined) {
          document.documentElement.style.setProperty('--dpi-scale', this.profile.dpi_scale);
        }
        if (this.profile.wallpaper) {
          this.applyWallpaper(this.profile.wallpaper);
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

document.addEventListener('DOMContentLoaded', () => {
  ROCK3T_OS.init();
});

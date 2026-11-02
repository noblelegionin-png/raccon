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

    // 3. Setup Touch / Swipe Gestures on Home Pager
    this.setupSwipeGestures();

    // 4. Fetch User Profile & Installed Apps
    this.fetchProfile();

    // 5. Fetch Rocket Life Engine Telemetry
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

  goToPage(pageIndex) {
    if (pageIndex < -2 || pageIndex > 2) return;
    this.currentPage = pageIndex;

    const track = document.getElementById('pagesTrack');
    // Pages are ordered: -2 (0%), -1 (20%), 0 (40%), 1 (60%), 2 (80%)
    // Offset translation percentage = (pageIndex + 2) * -20%
    const translatePercent = (pageIndex + 2) * -20;
    if (track) {
      track.style.transform = `translateX(${translatePercent}%)`;
    }

    // Update indicator dots
    const dots = document.querySelectorAll('.indicator-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === (pageIndex + 2));
    });

    // Notify Companion
    ROCK3T_COMPANION?.onNavigate(pageIndex);
  },

  setupSwipeGestures() {
    const container = document.getElementById('pagerContainer');
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let isSwiping = false;

    container.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = true;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      isSwiping = false;

      const diffX = e.changedTouches[0].clientX - startX;
      const diffY = e.changedTouches[0].clientY - startY;

      // Only trigger if horizontal swipe exceeds 45px and is predominantly horizontal
      if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0) {
          // Swiped left -> advance page
          this.goToPage(Math.min(2, this.currentPage + 1));
        } else {
          // Swiped right -> go back page
          this.goToPage(Math.max(-2, this.currentPage - 1));
        }
      }
    }, { passive: true });
  },

  openApp(appId) {
    console.log(`[ROCK3T OS] Opening App: ${appId}`);
    this.activeApp = appId;

    // Show native Telegram back button
    if (window.Telegram?.WebApp?.BackButton) {
      window.Telegram.WebApp.BackButton.show();
    }

    // Capitalize app name for window ID (e.g. store -> appWindowStore)
    const windowId = `appWindow${appId.charAt(0).toUpperCase() + appId.slice(1)}`;
    const win = document.getElementById(windowId);

    if (win) {
      win.classList.add('open');
      // Trigger app-specific activation hooks
      if (appId === 'games') ROCK3T_GAMES?.onAppOpened();
      if (appId === 'canvas') ROCK3T_CANVAS?.onAppOpened();
      if (appId === 'store') this.loadStoreApps();
      if (appId === 'settings') ROCK3T_SETTINGS?.onAppOpened();

      // Inform companion of current app context
      ROCK3T_COMPANION?.onAppContextChange(appId);
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
    ROCK3T_COMPANION?.onAppContextChange('homescreen');

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

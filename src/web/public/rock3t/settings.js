/**
 * =====================================================================
 * ROCK3T WEB OS — SETTINGS & 50 PERSONAL QUESTIONS MANAGER
 * =====================================================================
 */

const ROCK3T_SETTINGS = {
  questions: [],
  categories: [
    'Identity & Basics',
    'Favorites & Taste',
    'People & Relationships',
    'Lifestyle & Habits',
    'Fun & Quirks',
    'Memories & Aspirations',
  ],

  onAppOpened() {
    this.loadQuestions();
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);

    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = next === 'dark' ? 'Light Theme' : 'Dark Theme';

    fetch('/api/rock3t/profile', {
      method: 'POST',
      headers: ROCK3T_OS.getAuthHeaders(),
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  },

  setAnimSpeed(speed) {
    document.documentElement.style.setProperty('--anim-speed', speed);
    fetch('/api/rock3t/profile', {
      method: 'POST',
      headers: ROCK3T_OS.getAuthHeaders(),
      body: JSON.stringify({ animation_speed: parseFloat(speed) }),
    }).catch(() => {});
  },

  setDpiScale(scale) {
    document.documentElement.style.setProperty('--dpi-scale', scale);
    fetch('/api/rock3t/profile', {
      method: 'POST',
      headers: ROCK3T_OS.getAuthHeaders(),
      body: JSON.stringify({ dpi_scale: parseFloat(scale) }),
    }).catch(() => {});
  },

  setWallpaper(wallpaperValue) {
    ROCK3T_OS.applyWallpaper(wallpaperValue);
    fetch('/api/rock3t/profile', {
      method: 'POST',
      headers: ROCK3T_OS.getAuthHeaders(),
      body: JSON.stringify({ wallpaper: wallpaperValue }),
    }).catch(() => {});

    if (!wallpaperValue || wallpaperValue === 'clean_white') {
      ROCK3T_COMPANION?.say("Back to pristine, pure clean white! ⚪✨");
    } else {
      ROCK3T_COMPANION?.say("New wallpaper applied! Looking sharp! 🦝🖼️");
    }
  },

  handleWallpaperUpload(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      this.setWallpaper(dataUrl);
    };
    reader.readAsDataURL(file);
  },

  resetWallpaper() {
    this.setWallpaper('clean_white');
    const input = document.getElementById('wallpaperUrlInput');
    if (input) input.value = '';
    const fileInput = document.getElementById('wallpaperFileInput');
    if (fileInput) fileInput.value = '';
  },

  async loadQuestions() {
    try {
      const res = await fetch('/api/rock3t/info/questions', { headers: ROCK3T_OS.getAuthHeaders() });
      const data = await res.json();
      if (data.ok) {
        this.questions = data.questions;
        this.renderQuestions();

        const countEl = document.getElementById('infoAnsweredCount');
        if (countEl) countEl.textContent = data.answered;
      }
    } catch (err) {
      console.warn('Questions load error:', err);
    }
  },

  renderQuestions() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;
    container.innerHTML = '';

    for (const cat of this.categories) {
      const catQuestions = this.questions.filter((q) => q.category === cat);
      if (catQuestions.length === 0) continue;

      const answeredInCat = catQuestions.filter((q) => q.answer && q.answer.trim()).length;

      const accordion = document.createElement('div');
      accordion.className = 'questions-accordion';

      const header = document.createElement('div');
      header.className = 'questions-accordion-header';
      header.innerHTML = `
        <span>${cat} <small style="color: var(--os-text-muted); font-weight: normal;">(${answeredInCat}/${catQuestions.length})</small></span>
        <span class="chevron" style="transition: transform 0.2s;">▼</span>
      `;
      header.onclick = () => {
        accordion.classList.toggle('open');
        const chevron = header.querySelector('.chevron');
        if (chevron) chevron.style.transform = accordion.classList.contains('open') ? 'rotate(180deg)' : '';
      };

      const body = document.createElement('div');
      body.className = 'questions-accordion-body';

      for (const q of catQuestions) {
        const row = document.createElement('div');
        row.className = 'question-row';
        row.innerHTML = `
          <label class="question-label">${q.text}</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" class="question-input" value="${q.answer || ''}" placeholder="Optional answer..."
                   onchange="ROCK3T_SETTINGS.saveAnswer('${q.id}', this.value)"
                   onblur="ROCK3T_SETTINGS.saveAnswer('${q.id}', this.value)">
            ${q.answer ? `<button class="btn-os" style="padding: 4px 8px; font-size: 0.75rem;" onclick="ROCK3T_SETTINGS.clearAnswer('${q.id}', this)">✕</button>` : ''}
          </div>
        `;
        body.appendChild(row);
      }

      accordion.appendChild(header);
      accordion.appendChild(body);
      container.appendChild(accordion);
    }
  },

  async saveAnswer(questionId, answer) {
    if (!answer || !answer.trim()) return;
    try {
      await fetch('/api/rock3t/info/answer', {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
        body: JSON.stringify({ questionId, answer }),
      });
      // Update local cache
      const q = this.questions.find((item) => item.id === questionId);
      if (q) q.answer = answer;

      // Update answered count
      const answered = this.questions.filter((item) => item.answer && item.answer.trim()).length;
      const countEl = document.getElementById('infoAnsweredCount');
      if (countEl) countEl.textContent = answered;

      ROCK3T_COMPANION?.say("Got it! Memorized this into my brain! 🦝🧠");
    } catch (err) {
      console.warn('Save answer error:', err);
    }
  },

  async clearAnswer(questionId, btnElement) {
    try {
      await fetch('/api/rock3t/info/answer', {
        method: 'DELETE',
        headers: ROCK3T_OS.getAuthHeaders(),
        body: JSON.stringify({ questionId }),
      });
      const q = this.questions.find((item) => item.id === questionId);
      if (q) q.answer = '';

      if (btnElement && btnElement.previousElementSibling) {
        btnElement.previousElementSibling.value = '';
        btnElement.remove();
      }

      const answered = this.questions.filter((item) => item.answer && item.answer.trim()).length;
      const countEl = document.getElementById('infoAnsweredCount');
      if (countEl) countEl.textContent = answered;
    } catch (err) {
      console.warn('Clear answer error:', err);
    }
  },
};

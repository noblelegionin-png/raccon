/**
 * =====================================================================
 * ROCK3T WEB OS — STUDY & RESEARCH HUB CONTROLLER (ROCK3T_STUDY)
 * =====================================================================
 */

const ROCK3T_STUDY = {
  activeTab: 'masterclass',
  currentTopic: '',
  flashcards: [],
  currentFlashcardIndex: 0,
  isCardFlipped: false,
  quizData: null,
  quizScore: 0,
  quizAnsweredCount: 0,
  lastMasterclassRaw: '',
  lastResearchRaw: '',

  onAppOpened() {
    const input = document.getElementById('studyTopicInput');
    if (input && !input.value.trim()) {
      input.value = 'Transformers in AI';
      this.currentTopic = 'Transformers in AI';
      this.loadMasterclass('Transformers in AI');
    }
    ROCK3T_COMPANION?.say('Welcome to the Study Hub! Pick any topic and let’s master it together! 🎓🐾');
  },

  getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.Telegram?.WebApp?.initData) {
      headers['x-telegram-init-data'] = window.Telegram.WebApp.initData;
    }
    if (ROCK3T_OS?.user?.id) {
      headers['x-user-id'] = String(ROCK3T_OS.user.id);
    }
    return headers;
  },

  switchTab(tabName) {
    this.activeTab = tabName;

    // 1. Update tab buttons
    document.querySelectorAll('.study-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    // 2. Update tab panes
    const paneMap = {
      masterclass: 'studyTabMasterclass',
      flashcards: 'studyTabFlashcards',
      quiz: 'studyTabQuiz',
      research: 'studyTabResearch',
      pdf: 'studyTabPdf',
    };

    Object.entries(paneMap).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', key === tabName);
    });

    // Auto-trigger if topic exists and tab content is empty
    const topic = this.getTopic();
    if (topic) {
      if (tabName === 'flashcards' && (!this.flashcards || this.flashcards.length === 0)) {
        this.loadFlashcards(topic);
      } else if (tabName === 'quiz' && !this.quizData) {
        this.loadQuiz(topic);
      } else if (tabName === 'research' && !this.lastResearchRaw) {
        this.loadResearch(topic);
      }
    }
  },

  getTopic() {
    const input = document.getElementById('studyTopicInput');
    return (input ? input.value.trim() : '') || this.currentTopic || 'Transformers in AI';
  },

  setTopicAndRun(topic) {
    const input = document.getElementById('studyTopicInput');
    if (input) input.value = topic;
    this.currentTopic = topic;
    this.executeCurrentTab();
  },

  executeCurrentTab() {
    const topic = this.getTopic();
    if (!topic) return;
    this.currentTopic = topic;

    if (this.activeTab === 'masterclass') {
      this.loadMasterclass(topic);
    } else if (this.activeTab === 'flashcards') {
      this.loadFlashcards(topic);
    } else if (this.activeTab === 'quiz') {
      this.loadQuiz(topic);
    } else if (this.activeTab === 'research') {
      this.loadResearch(topic);
    } else if (this.activeTab === 'pdf') {
      this.downloadStudyPdf();
    }
  },

  // =========================================================================
  // 1. MASTERCLASS BREAKDOWN
  // =========================================================================
  async loadMasterclass(topic) {
    const container = document.getElementById('masterclassOutput');
    const badge = document.getElementById('studyMasterclassTopic');
    if (badge) badge.textContent = `Topic: ${topic}`;
    if (!container) return;

    container.innerHTML = `
      <div class="study-loading-box">
        <div class="study-spinner"></div>
        <p>Rocket is synthesizing deep masterclass on <b>"${this.escapeHtml(topic)}"</b>... 🧠</p>
      </div>
    `;

    try {
      const res = await fetch('/api/rock3t/study/explain', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ topic, level: 'deep' }),
      });
      const data = await res.json();
      if (data.ok && data.formattedText) {
        this.lastMasterclassRaw = data.formattedText;
        container.innerHTML = this.renderMarkdown(data.formattedText);
        ROCK3T_COMPANION?.say(`Masterclass on ${topic} is served! Check the raccoon analogy! 🍕🐾`);
      } else {
        container.innerHTML = `<div class="study-placeholder"><p>⚠️ ${this.escapeHtml(data.error || 'Failed to generate masterclass.')}</p></div>`;
      }
    } catch (err) {
      container.innerHTML = `<div class="study-placeholder"><p>⚠️ Connection issue: ${this.escapeHtml(err.message)}</p></div>`;
    }
  },

  copyMasterclassText() {
    if (!this.lastMasterclassRaw) return;
    navigator.clipboard.writeText(this.lastMasterclassRaw).then(() => {
      ROCK3T_COMPANION?.say('Masterclass notes copied to clipboard! 📋');
    });
  },

  // =========================================================================
  // 2. FLASHCARDS
  // =========================================================================
  async loadFlashcards(topic) {
    const frontEl = document.getElementById('flashcardFrontText');
    const backEl = document.getElementById('flashcardBackText');
    const counterEl = document.getElementById('flashcardCounter');
    const cardEl = document.getElementById('flashcardElement');

    if (cardEl) cardEl.classList.remove('is-flipped');
    this.isCardFlipped = false;

    if (frontEl) frontEl.innerHTML = `Synthesizing high-yield flashcards on <b>${this.escapeHtml(topic)}</b>... ⏳`;
    if (backEl) backEl.textContent = 'Please wait...';
    if (counterEl) counterEl.textContent = 'Loading...';

    try {
      const res = await fetch('/api/rock3t/study/flashcards', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ topic, count: 6 }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.flashcards) && data.flashcards.length > 0) {
        this.flashcards = data.flashcards;
        this.currentFlashcardIndex = 0;
        this.renderCurrentFlashcard();
        ROCK3T_COMPANION?.say(`Generated ${this.flashcards.length} spaced repetition cards for ${topic}! 🗂️`);
      } else {
        if (frontEl) frontEl.textContent = 'No flashcards generated. Please retry.';
      }
    } catch (err) {
      if (frontEl) frontEl.textContent = `Error: ${err.message}`;
    }
  },

  renderCurrentFlashcard() {
    if (!this.flashcards || this.flashcards.length === 0) return;
    const card = this.flashcards[this.currentFlashcardIndex];
    const frontEl = document.getElementById('flashcardFrontText');
    const backEl = document.getElementById('flashcardBackText');
    const counterEl = document.getElementById('flashcardCounter');
    const cardEl = document.getElementById('flashcardElement');

    if (cardEl) cardEl.classList.remove('is-flipped');
    this.isCardFlipped = false;

    if (frontEl) frontEl.textContent = card.front;
    if (backEl) backEl.textContent = card.back;
    if (counterEl) counterEl.textContent = `Card ${this.currentFlashcardIndex + 1} of ${this.flashcards.length}`;
  },

  flipFlashcard() {
    const cardEl = document.getElementById('flashcardElement');
    if (!cardEl) return;
    this.isCardFlipped = !this.isCardFlipped;
    cardEl.classList.toggle('is-flipped', this.isCardFlipped);
  },

  nextFlashcard() {
    if (!this.flashcards || this.flashcards.length === 0) return;
    this.currentFlashcardIndex = (this.currentFlashcardIndex + 1) % this.flashcards.length;
    this.renderCurrentFlashcard();
  },

  prevFlashcard() {
    if (!this.flashcards || this.flashcards.length === 0) return;
    this.currentFlashcardIndex = (this.currentFlashcardIndex - 1 + this.flashcards.length) % this.flashcards.length;
    this.renderCurrentFlashcard();
  },

  shuffleFlashcards() {
    if (!this.flashcards || this.flashcards.length <= 1) return;
    for (let i = this.flashcards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.flashcards[i], this.flashcards[j]] = [this.flashcards[j], this.flashcards[i]];
    }
    this.currentFlashcardIndex = 0;
    this.renderCurrentFlashcard();
    ROCK3T_COMPANION?.say('Flashcards shuffled! Hit me! 🎲');
  },

  // =========================================================================
  // 3. QUIZ ARENA
  // =========================================================================
  async loadQuiz(topic) {
    const container = document.getElementById('quizContainer');
    const scoreEl = document.getElementById('quizScoreDisplay');
    if (!container) return;

    this.quizScore = 0;
    this.quizAnsweredCount = 0;
    if (scoreEl) scoreEl.textContent = `0 / 0 🌟`;

    container.innerHTML = `
      <div class="study-loading-box">
        <div class="study-spinner"></div>
        <p>Generating interactive exam-grade quiz for <b>"${this.escapeHtml(topic)}"</b>... 🎯</p>
      </div>
    `;

    try {
      const res = await fetch('/api/rock3t/study/quiz', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ topic, count: 5 }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.questions) && data.questions.length > 0) {
        this.quizData = data.questions;
        this.renderQuiz();
        ROCK3T_COMPANION?.say(`5 challenge questions ready on ${topic}! Let’s see your score! 🎯`);
      } else {
        container.innerHTML = `<div class="study-placeholder"><p>⚠️ ${this.escapeHtml(data.error || 'Failed to generate quiz.')}</p></div>`;
      }
    } catch (err) {
      container.innerHTML = `<div class="study-placeholder"><p>⚠️ Connection issue: ${this.escapeHtml(err.message)}</p></div>`;
    }
  },

  renderQuiz() {
    const container = document.getElementById('quizContainer');
    const scoreEl = document.getElementById('quizScoreDisplay');
    if (!container || !this.quizData) return;

    if (scoreEl) scoreEl.textContent = `${this.quizScore} / ${this.quizData.length} 🌟`;
    container.innerHTML = '';

    this.quizData.forEach((q, qIndex) => {
      const qCard = document.createElement('div');
      qCard.className = 'quiz-question-card';
      qCard.id = `quizCard_${q.id || qIndex}`;

      let optionsHtml = '';
      (q.options || []).forEach((opt, optIdx) => {
        const letter = (opt.match(/^([A-D])\)/i) || ['', ['A', 'B', 'C', 'D'][optIdx]])[1].toUpperCase();
        optionsHtml += `
          <button class="quiz-option-btn" data-letter="${letter}" onclick="ROCK3T_STUDY.answerQuestion(${q.id || qIndex}, '${letter}', this)">
            <span class="quiz-opt-letter">${letter}</span>
            <span class="quiz-opt-text">${this.escapeHtml(opt.replace(/^[A-D]\)\s*/i, ''))}</span>
          </button>
        `;
      });

      qCard.innerHTML = `
        <div class="quiz-card-header">
          <span class="quiz-q-num">Question ${qIndex + 1} of ${this.quizData.length}</span>
        </div>
        <h4 class="quiz-q-text">${this.escapeHtml(q.question)}</h4>
        <div class="quiz-options-grid">
          ${optionsHtml}
        </div>
        <div class="quiz-explanation-box" id="quizExp_${q.id || qIndex}" style="display: none;">
          <strong>Explanation:</strong> <span class="exp-text">${this.escapeHtml(q.explanation || '')}</span>
        </div>
      `;

      container.appendChild(qCard);
    });
  },

  answerQuestion(qId, chosenLetter, btnEl) {
    const q = this.quizData.find((item, idx) => (item.id || idx) === qId);
    if (!q) return;

    const card = document.getElementById(`quizCard_${qId}`);
    if (!card) return;

    // Check if already answered
    if (card.getAttribute('data-answered') === 'true') return;
    card.setAttribute('data-answered', 'true');

    const isCorrect = (q.correctAnswer || '').trim().toUpperCase() === chosenLetter.toUpperCase();

    // Disable all options in this question
    const allBtns = card.querySelectorAll('.quiz-option-btn');
    allBtns.forEach((btn) => {
      btn.style.pointerEvents = 'none';
      const letter = btn.getAttribute('data-letter');
      if (letter === q.correctAnswer.toUpperCase()) {
        btn.classList.add('correct');
      }
    });

    if (!isCorrect) {
      btnEl.classList.add('wrong');
    } else {
      this.quizScore++;
    }

    this.quizAnsweredCount++;

    // Reveal explanation
    const expBox = document.getElementById(`quizExp_${qId}`);
    if (expBox) {
      expBox.style.display = 'block';
    }

    // Update scoreboard
    const scoreEl = document.getElementById('quizScoreDisplay');
    if (scoreEl) {
      scoreEl.textContent = `${this.quizScore} / ${this.quizData.length} 🌟`;
    }

    if (this.quizAnsweredCount === this.quizData.length) {
      const pct = Math.round((this.quizScore / this.quizData.length) * 100);
      if (pct >= 80) {
        ROCK3T_COMPANION?.say(`Incredible job! ${this.quizScore}/${this.quizData.length} (${pct}%)! You're a genius! 🌟🍕`);
      } else {
        ROCK3T_COMPANION?.say(`Good effort! ${this.quizScore}/${this.quizData.length} (${pct}%)! Review the explanations to master this! 🐾`);
      }
    }
  },

  restartQuiz() {
    this.quizScore = 0;
    this.quizAnsweredCount = 0;
    this.renderQuiz();
  },

  // =========================================================================
  // 4. DEEP RESEARCH
  // =========================================================================
  async loadResearch(topic) {
    const container = document.getElementById('researchOutput');
    const badge = document.getElementById('studyResearchTopic');
    if (badge) badge.textContent = `Dossier: ${topic}`;
    if (!container) return;

    container.innerHTML = `
      <div class="study-loading-box">
        <div class="study-spinner"></div>
        <p>Conducting scientific literature review and matrix analysis on <b>"${this.escapeHtml(topic)}"</b>... 🔬</p>
      </div>
    `;

    try {
      const res = await fetch('/api/rock3t/study/research', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (data.ok && data.formattedText) {
        this.lastResearchRaw = data.formattedText;
        container.innerHTML = this.renderMarkdown(data.formattedText);
        ROCK3T_COMPANION?.say(`Academic research dossier compiled for ${topic}! Check out the comparative matrix! 🏛️`);
      } else {
        container.innerHTML = `<div class="study-placeholder"><p>⚠️ ${this.escapeHtml(data.error || 'Failed to compile research.')}</p></div>`;
      }
    } catch (err) {
      container.innerHTML = `<div class="study-placeholder"><p>⚠️ Connection issue: ${this.escapeHtml(err.message)}</p></div>`;
    }
  },

  copyResearchText() {
    if (!this.lastResearchRaw) return;
    navigator.clipboard.writeText(this.lastResearchRaw).then(() => {
      ROCK3T_COMPANION?.say('Research dossier copied to clipboard! 📋');
    });
  },

  // =========================================================================
  // 5. PDF STUDY PACK DOWNLOAD
  // =========================================================================
  async downloadStudyPdf() {
    const topic = this.getTopic();
    const pagesSelect = document.getElementById('studyPdfPages');
    const pages = pagesSelect ? parseInt(pagesSelect.value, 10) : 3;
    const btn = document.getElementById('btnGenerateStudyPdf');
    const statusEl = document.getElementById('pdfDownloadStatus');

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Compiling Study Guide PDF...';
    }
    if (statusEl) {
      statusEl.textContent = `Compiling ${pages}-page publication PDF for "${topic}". This may take ~10-20 seconds...`;
    }
    ROCK3T_COMPANION?.say(`Printing publication PDF for ${topic}! Hang tight! 📑🦝`);

    try {
      const res = await fetch('/api/rock3t/study/pdf', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ topic, pages }),
      });

      if (!res.ok) {
        throw new Error(`PDF generation failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const safeName = topic.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      a.download = `rock3t_study_${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      if (statusEl) statusEl.innerHTML = `✅ <b>Downloaded successfully!</b> Check your downloads folder.`;
      ROCK3T_COMPANION?.say(`Your official Study Guide PDF is ready! Happy learning! 🚀`);
    } catch (err) {
      if (statusEl) statusEl.textContent = `⚠️ Error: ${err.message}`;
      ROCK3T_COMPANION?.say(`Oops, PDF compilation hit a snag: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🚀 Generate & Download PDF';
      }
    }
  },

  quickExportPdf() {
    this.switchTab('pdf');
    this.downloadStudyPdf();
  },

  // =========================================================================
  // LIGHTWEIGHT ROBUST MARKDOWN PARSER
  // =========================================================================
  renderMarkdown(md) {
    if (!md) return '';

    let text = md;

    // Headers
    text = text.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
    text = text.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
    text = text.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');

    // Bold & Italics
    text = text.replace(/\*\*\*(.*?)\*\*\*/gim, '<b><i>$1</i></b>');
    text = text.replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>');
    text = text.replace(/\*(.*?)\*/gim, '<i>$1</i>');

    // Code blocks & inline code
    text = text.replace(/`([^`]+)`/gim, '<code class="md-inline-code">$1</code>');

    // Blockquotes
    text = text.replace(/^\> (.*$)/gim, '<blockquote class="md-quote">$1</blockquote>');

    // Ordered & Unordered list items
    text = text.replace(/^\s*-\s+(.*$)/gim, '<li class="md-li">$1</li>');
    text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="md-oli">$1</li>');

    // Markdown Tables (| Col1 | Col2 |)
    const lines = text.split('\n');
    let inTable = false;
    let tableHtml = '';
    const outputLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        // Table line
        if (!inTable) {
          inTable = true;
          tableHtml = '<div class="table-responsive"><table class="md-table"><tbody>';
        }
        // Check if header separator
        if (line.match(/^\|(?:\s*:?-+:?\s*\|)+$/)) {
          continue; // skip separator row
        }
        const cells = line.slice(1, -1).split('|').map((c) => c.trim());
        tableHtml += '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>';
      } else {
        if (inTable) {
          tableHtml += '</tbody></table></div>';
          outputLines.push(tableHtml);
          inTable = false;
          tableHtml = '';
        }
        outputLines.push(line);
      }
    }
    if (inTable) {
      tableHtml += '</tbody></table></div>';
      outputLines.push(tableHtml);
    }

    text = outputLines.join('\n');

    // Paragraph line breaks
    text = text.replace(/\n\n+/g, '<br><br>');

    return `<div class="markdown-article">${text}</div>`;
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

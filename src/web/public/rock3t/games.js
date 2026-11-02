/**
 * =====================================================================
 * ROCK3T WEB OS — GAMES HUB (TIC-TAC-TOE, CONNECT 4, CYBER RPS)
 * High-Speed Game Engines with Live GPT-6 Luna Play & Reaction
 * =====================================================================
 */

const ROCK3T_GAMES = {
  activeGame: 'tictactoe',

  // --- TIC-TAC-TOE STATE ---
  tttBoard: Array(9).fill(null),
  isTttGameOver: false,
  isTttWaiting: false,
  tttScores: { wins: 0, losses: 0, ties: 0, streak: 0 },

  // --- CONNECT 4 STATE ---
  c4Board: Array(42).fill(null),
  isC4GameOver: false,
  isC4Waiting: false,
  c4Scores: { wins: 0, losses: 0, ties: 0, streak: 0 },

  // --- CYBER RPS STATE ---
  rpsHistory: [],
  isRpsWaiting: false,
  rpsScores: { wins: 0, losses: 0, streak: 0 },

  // Backward compatibility alias
  get board() { return this.tttBoard; },
  set board(val) { this.tttBoard = val; },
  get isGameOver() { return this.isTttGameOver; },
  set isGameOver(val) { this.isTttGameOver = val; },
  get scores() { return this.tttScores; },
  set scores(val) { this.tttScores = val; },

  catalog: {
    tictactoe: {
      name: 'Tic-Tac-Toe',
      status: 'active',
      icon: '❌⭕',
      description: 'Classic 3x3 strategy against Rocket AI with instant reaction and dynamic live Luna commentary.',
    },
    connect4: {
      name: 'Connect 4',
      status: 'active',
      icon: '🔴',
      description: '7x6 vertical drop showdown! Drop 4 chips in a row against Rocket Neural gravity engine.',
    },
    rps: {
      name: 'Cyber RPS',
      status: 'active',
      icon: '🍕',
      description: 'Rock, Paper, Scissors, Pizza & Laser! Mind-game psychological duels with live Luna trash-talk.',
    },
    snakes: {
      name: 'Snakes & Ladders',
      status: 'upcoming',
      icon: '🎲',
      description: 'Roll the dice and race Rocket to square 100! Watch out for slippery trap doors and cheeky shortcuts.',
      eta: 'Phase 2 Expansion',
      banter: "I'm still training my paws to roll 6s every time! 🎲🦝",
    },
    ludo: {
      name: 'Rocket Ludo',
      status: 'upcoming',
      icon: '🏆',
      description: '4-player classic token showdown. Play against Rocket and his sneaky AI clones.',
      eta: 'Phase 2 Expansion',
      banter: "If you knock my raccoon token back to base, I'm stealing your pizza! 🍕😈",
    },
    chess: {
      name: 'Grandmaster Chess',
      status: 'upcoming',
      icon: '♟️',
      description: 'Deep strategic tactical chess powered by Rocket Neural positional evaluation.',
      eta: 'Phase 3 Expansion',
      banter: "I'm calculating 20 moves ahead... and all 20 end with me taking your pizza Queen! 👑🐾",
    },
  },

  onAppOpened() {
    this.switchGame(this.activeGame || 'tictactoe');
    this.fetchScores('tictactoe');
  },

  switchGame(gameId) {
    this.activeGame = gameId;

    // Update tab bar buttons
    document.querySelectorAll('.games-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.game === gameId);
    });

    const tttArea = document.getElementById('tttGameArea');
    const c4Area = document.getElementById('c4GameArea');
    const rpsArea = document.getElementById('rpsGameArea');
    const previewArea = document.getElementById('futureGameArea');
    const title = document.getElementById('gamesWindowTitle');

    // Hide all
    if (tttArea) tttArea.style.display = 'none';
    if (c4Area) c4Area.style.display = 'none';
    if (rpsArea) rpsArea.style.display = 'none';
    if (previewArea) previewArea.style.display = 'none';

    if (gameId === 'tictactoe') {
      if (tttArea) tttArea.style.display = 'flex';
      if (title) title.textContent = 'Games • Tic-Tac-Toe';
      this.fetchScores('tictactoe');
    } else if (gameId === 'connect4') {
      if (c4Area) c4Area.style.display = 'flex';
      if (title) title.textContent = 'Games • Connect 4';
      this.initConnect4UI();
      this.fetchScores('connect4');
    } else if (gameId === 'rps') {
      if (rpsArea) rpsArea.style.display = 'flex';
      if (title) title.textContent = 'Games • Cyber RPS';
      this.fetchScores('rps');
    } else {
      if (previewArea) {
        previewArea.style.display = 'flex';
        this.renderFutureGamePreview(gameId);
      }
      if (title) title.textContent = `Games • ${this.catalog[gameId]?.name || 'Roadmap'}`;
    }
  },

  renderFutureGamePreview(gameId) {
    const meta = this.catalog[gameId];
    if (!meta) return;

    const iconEl = document.getElementById('previewGameIcon');
    const titleEl = document.getElementById('previewGameTitle');
    const badgeEl = document.getElementById('previewGameBadge');
    const descEl = document.getElementById('previewGameDesc');
    const banterEl = document.getElementById('previewGameBanter');

    if (iconEl) iconEl.textContent = meta.icon;
    if (titleEl) titleEl.textContent = meta.name;
    if (badgeEl) badgeEl.textContent = meta.eta;
    if (descEl) descEl.textContent = meta.description;
    if (banterEl) banterEl.textContent = `🦝 Rocket: "${meta.banter}"`;
  },

  notifyMe() {
    const meta = this.catalog[this.activeGame];
    alert(`Reminder registered for ${meta?.name || 'this game'}!`);
  },

  async fetchScores(gameId = 'tictactoe') {
    try {
      const ep = gameId === 'rps'
        ? '/api/rock3t/games/rps/reset'
        : (gameId === 'connect4' ? '/api/rock3t/games/connect4/reset' : '/api/rock3t/games/tictactoe/reset');

      const res = await fetch(ep, {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok && data.score) {
        if (gameId === 'tictactoe') {
          this.tttScores = data.score;
          this.updateTttScoreboard();
        } else if (gameId === 'connect4') {
          this.c4Scores = data.score;
          this.updateC4Scoreboard();
        } else if (gameId === 'rps') {
          this.rpsScores = data.score;
          this.updateRpsScoreboard();
        }
      }
    } catch (err) {
      console.warn('Score fetch note:', err);
    }
  },

  /* =====================================================================
     1. TIC-TAC-TOE CONTROLLER (FAST RESPONSIVE WIN FLOW)
     ===================================================================== */
  updateTttScoreboard() {
    const elHuman = document.getElementById('scoreHuman');
    const elRocket = document.getElementById('scoreRocket');
    const elDraws = document.getElementById('scoreDraws');

    if (elHuman) elHuman.textContent = this.tttScores.wins || 0;
    if (elRocket) elRocket.textContent = this.tttScores.losses || 0;
    if (elDraws) elDraws.textContent = this.tttScores.ties || 0;
  },

  checkLocalTttWin(board) {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], line: [a, b, c] };
      }
    }
    const isFull = board.every((c) => c !== null && c !== '');
    return { winner: null, isDraw: isFull };
  },

  async handleCellClick(index) {
    if (this.isTttGameOver || this.isTttWaiting) return;
    if (this.tttBoard[index] !== null) return;

    // 1. Optimistic Human move (X)
    this.tttBoard[index] = 'X';
    this.renderTttCell(index, 'X');
    this.isTttWaiting = true;

    const reactionBox = document.getElementById('tttReaction');

    // 2. Instant client-side win detection (0-latency victory feedback!)
    const instantCheck = this.checkLocalTttWin(this.tttBoard);
    if (instantCheck.winner === 'X') {
      this.isTttGameOver = true;
      if (instantCheck.line) {
        for (const idx of instantCheck.line) {
          const c = document.querySelector(`.ttt-cell[data-index="${idx}"]`);
          if (c) c.classList.add('winner');
        }
      }
      this.tttScores.wins = (this.tttScores.wins || 0) + 1;
      this.updateTttScoreboard();
      if (reactionBox) {
        reactionBox.innerHTML = `<strong>🎉 THREE IN A ROW! You won! Rocket is in shock... 🍕😱</strong>`;
      }
    } else if (reactionBox) {
      reactionBox.innerHTML = '🦝🐾 <em>Rocket is calculating his move...</em>';
    }

    try {
      const res = await fetch('/api/rock3t/games/tictactoe/move', {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
        body: JSON.stringify({
          board: this.tttBoard,
          cellIndex: index,
        }),
      });

      const data = await res.json();
      this.isTttWaiting = false;

      if (!data.ok) return;

      // Render Rocket's move ('O') if made
      if (data.rocketMoveIndex !== null && data.rocketMoveIndex !== undefined) {
        this.tttBoard[data.rocketMoveIndex] = 'O';
        this.renderTttCell(data.rocketMoveIndex, 'O');
      }

      // Handle Game Over
      if (data.outcome) {
        this.isTttGameOver = true;
        this.tttScores = data.score;
        this.updateTttScoreboard();

        if (data.winningLine) {
          for (const cellIdx of data.winningLine) {
            const cell = document.querySelector(`.ttt-cell[data-index="${cellIdx}"]`);
            if (cell) cell.classList.add('winner');
          }
        }

        if (reactionBox && data.reaction) {
          reactionBox.innerHTML = `<strong>${data.reaction}</strong>`;
        }
      } else if (!this.isTttGameOver && reactionBox) {
        reactionBox.textContent = "Your turn! Where are you placing your next X? 🐾";
      }
    } catch (err) {
      this.isTttWaiting = false;
      console.warn('Game turn error:', err);
    }
  },

  renderTttCell(index, symbol) {
    const cell = document.querySelector(`.ttt-cell[data-index="${index}"]`);
    if (cell) {
      cell.textContent = symbol;
      cell.className = `ttt-cell ${symbol}`;
    }
  },

  newGame() {
    if (this.activeGame === 'connect4') {
      this.resetConnect4();
      return;
    }
    if (this.activeGame === 'rps') {
      this.resetRps();
      return;
    }

    this.tttBoard = Array(9).fill(null);
    this.isTttGameOver = false;
    this.isTttWaiting = false;

    document.querySelectorAll('.ttt-cell').forEach((cell) => {
      cell.textContent = '';
      cell.className = 'ttt-cell';
    });

    const reactionBox = document.getElementById('tttReaction');
    if (reactionBox) {
      reactionBox.textContent = "Fresh board! Tap any square to place your X! 🦝";
    }
  },

  /* =====================================================================
     2. CONNECT 4 CONTROLLER (DROP 4)
     ===================================================================== */
  initConnect4UI() {
    const boardEl = document.getElementById('c4Board');
    if (!boardEl) return;
    if (boardEl.children.length === 42) return; // already built

    boardEl.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const slot = document.createElement('div');
      slot.className = 'c4-slot';
      slot.dataset.index = i;
      const col = i % 7;
      slot.onclick = () => this.handleC4Drop(col);
      boardEl.appendChild(slot);
    }
  },

  updateC4Scoreboard() {
    const elHuman = document.getElementById('scoreC4Human');
    const elRocket = document.getElementById('scoreC4Rocket');
    const elDraws = document.getElementById('scoreC4Draws');

    if (elHuman) elHuman.textContent = this.c4Scores.wins || 0;
    if (elRocket) elRocket.textContent = this.c4Scores.losses || 0;
    if (elDraws) elDraws.textContent = this.c4Scores.ties || 0;
  },

  async handleC4Drop(col) {
    if (this.isC4GameOver || this.isC4Waiting) return;

    // Check if column is already full
    if (this.c4Board[col] !== null) {
      const reactionBox = document.getElementById('c4Reaction');
      if (reactionBox) reactionBox.textContent = "⚠️ That column is full! Pick another one! 🐾";
      return;
    }

    // 1. Optimistic Human Drop (0ms perceived latency!)
    let humanSlot = -1;
    for (let r = 5; r >= 0; r--) {
      const idx = r * 7 + col;
      if (this.c4Board[idx] === null) {
        humanSlot = idx;
        break;
      }
    }
    if (humanSlot === -1) return;

    this.c4Board[humanSlot] = 'R';
    this.renderC4Slot(humanSlot, 'R');
    this.isC4Waiting = true;

    const reactionBox = document.getElementById('c4Reaction');
    if (reactionBox) {
      reactionBox.innerHTML = '🦝🐾 <em>Rocket is sizing up the drop zone...</em>';
    }

    try {
      const res = await fetch('/api/rock3t/games/connect4/move', {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
        body: JSON.stringify({
          board: this.c4Board,
          col,
        }),
      });

      const data = await res.json();
      this.isC4Waiting = false;

      if (!data.ok) {
        // Rollback optimistic placement on failure
        this.c4Board[humanSlot] = null;
        this.renderC4Slot(humanSlot, '');
        alert(data.error || 'Turn error');
        return;
      }

      this.c4Board = data.board;

      // Render Rocket chip
      if (data.rocketSlot !== -1 && data.rocketSlot !== undefined && data.rocketSlot !== null) {
        setTimeout(() => {
          this.renderC4Slot(data.rocketSlot, 'Y');
        }, 100);
      }

      if (data.outcome) {
        this.isC4GameOver = true;
        this.c4Scores = data.score;
        this.updateC4Scoreboard();

        if (data.winningLine) {
          for (const idx of data.winningLine) {
            const slot = document.querySelector(`.c4-slot[data-index="${idx}"]`);
            if (slot) slot.classList.add('winner');
          }
        }

        if (reactionBox && data.reaction) {
          reactionBox.innerHTML = `<strong>${data.reaction}</strong>`;
        }
      } else if (reactionBox) {
        reactionBox.textContent = "Your turn! Drop your next chip! 🔴";
      }
    } catch (err) {
      this.isC4Waiting = false;
      console.warn('Connect 4 turn error:', err);
    }
  },

  renderC4Slot(index, symbol) {
    const slot = document.querySelector(`.c4-slot[data-index="${index}"]`);
    if (slot) {
      slot.className = `c4-slot ${symbol}`;
    }
  },

  resetConnect4() {
    this.c4Board = Array(42).fill(null);
    this.isC4GameOver = false;
    this.isC4Waiting = false;

    document.querySelectorAll('.c4-slot').forEach((slot) => {
      slot.className = 'c4-slot';
    });

    const reactionBox = document.getElementById('c4Reaction');
    if (reactionBox) {
      reactionBox.textContent = "Fresh grid! Tap any arrow to drop your red chip! 🔴";
    }
  },

  /* =====================================================================
     3. CYBER RPS CONTROLLER (ROCK, PAPER, SCISSORS, PIZZA, LASER)
     ===================================================================== */
  updateRpsScoreboard() {
    const elWins = document.getElementById('scoreRpsWins');
    const elLosses = document.getElementById('scoreRpsLosses');
    const elStreak = document.getElementById('scoreRpsStreak');

    if (elWins) elWins.textContent = this.rpsScores.wins || 0;
    if (elLosses) elLosses.textContent = this.rpsScores.losses || 0;
    if (elStreak) elStreak.textContent = this.rpsScores.streak || 0;
  },

  getRpsEmoji(choice) {
    const map = { rock: '🪨', paper: '📄', scissors: '✂️', pizza: '🍕', laser: '⚡' };
    return map[choice] || '❓';
  },

  async handleRpsChoice(choice) {
    if (this.isRpsWaiting) return;
    this.isRpsWaiting = true;

    const playerDisplay = document.getElementById('rpsPlayerDisplay');
    const rocketDisplay = document.getElementById('rpsRocketDisplay');
    const reactionBox = document.getElementById('rpsReaction');

    if (playerDisplay) playerDisplay.textContent = this.getRpsEmoji(choice);
    if (rocketDisplay) rocketDisplay.textContent = '🌀';
    if (reactionBox) reactionBox.innerHTML = '🦝🐾 <em>Rocket is reading your mind with Luna...</em>';

    try {
      const res = await fetch('/api/rock3t/games/rps/play', {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
        body: JSON.stringify({
          choice,
          history: this.rpsHistory.slice(-5),
        }),
      });

      const data = await res.json();
      this.isRpsWaiting = false;

      if (!data.ok) return;

      this.rpsHistory.push(choice);
      if (rocketDisplay) rocketDisplay.textContent = this.getRpsEmoji(data.rocketChoice);

      this.rpsScores = data.score;
      this.updateRpsScoreboard();

      if (reactionBox && data.reaction) {
        const badge = data.outcome === 'human_win' ? '🎉 YOU WIN!' : (data.outcome === 'rocket_win' ? '😈 ROCKET WINS!' : '⚡ TIE!');
        reactionBox.innerHTML = `<strong>${badge}</strong> ${data.reaction}`;
      }
    } catch (err) {
      this.isRpsWaiting = false;
      console.warn('RPS round error:', err);
    }
  },

  resetRps() {
    this.rpsHistory = [];
    this.isRpsWaiting = false;

    const playerDisplay = document.getElementById('rpsPlayerDisplay');
    const rocketDisplay = document.getElementById('rpsRocketDisplay');
    const reactionBox = document.getElementById('rpsReaction');

    if (playerDisplay) playerDisplay.textContent = '❓';
    if (rocketDisplay) rocketDisplay.textContent = '🦝';
    if (reactionBox) {
      reactionBox.textContent = "Pick your move! Pizza bribes Paper & Rock, Laser melts Pizza & Scissors! 🍕⚡";
    }
  },
};

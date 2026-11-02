/**
 * =====================================================================
 * ROCK3T WEB OS — GAMES HUB (TIC-TAC-TOE ENGINE)
 * =====================================================================
 */

const ROCK3T_GAMES = {
  activeGame: 'tictactoe',
  board: Array(9).fill(null),
  isGameOver: false,
  isWaitingServer: false,
  scores: { wins: 0, losses: 0, ties: 0, streak: 0 },

  catalog: {
    tictactoe: {
      name: 'Tic-Tac-Toe',
      status: 'active',
      icon: '❌⭕',
      description: 'Classic 3x3 strategy against Rocket AI with dynamic personality commentary.',
    },
    snakes: {
      name: 'Snakes & Ladders',
      status: 'upcoming',
      icon: '🎲',
      description: 'Roll the dice and race Rocket to square 100! Watch out for slippery trap doors and cheeky raccoon shortcuts.',
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
    this.fetchScores();
  },

  switchGame(gameId) {
    this.activeGame = gameId;

    // Update tab bar buttons
    document.querySelectorAll('.games-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.game === gameId);
    });

    const tttContainer = document.getElementById('tttGameArea');
    const previewContainer = document.getElementById('futureGameArea');

    if (gameId === 'tictactoe') {
      if (tttContainer) tttContainer.style.display = 'flex';
      if (previewContainer) previewContainer.style.display = 'none';
      const title = document.getElementById('gamesWindowTitle');
      if (title) title.textContent = 'Games • Tic-Tac-Toe';
    } else {
      if (tttContainer) tttContainer.style.display = 'none';
      if (previewContainer) {
        previewContainer.style.display = 'flex';
        this.renderFutureGamePreview(gameId);
      }
      const title = document.getElementById('gamesWindowTitle');
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

    ROCK3T_COMPANION?.say(meta.banter);
  },

  notifyMe() {
    const meta = this.catalog[this.activeGame];
    ROCK3T_COMPANION?.say(`Reminder locked! You'll be the first to duel me in ${meta?.name || 'this game'}! 🐾🔔`);
    alert(`Reminder registered for ${meta?.name || 'this game'}!`);
  },

  async fetchScores() {
    try {
      const res = await fetch('/api/rock3t/games/tictactoe/reset', {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok && data.score) {
        this.scores = data.score;
        this.updateScoreboard();
      }
    } catch (err) {
      console.warn('Score fetch note:', err);
    }
  },

  updateScoreboard() {
    const elHuman = document.getElementById('scoreHuman');
    const elRocket = document.getElementById('scoreRocket');
    const elDraws = document.getElementById('scoreDraws');

    if (elHuman) elHuman.textContent = this.scores.wins;
    if (elRocket) elRocket.textContent = this.scores.losses;
    if (elDraws) elDraws.textContent = this.scores.ties;
  },

  async handleCellClick(index) {
    if (this.isGameOver || this.isWaitingServer) return;
    if (this.board[index] !== null) return;

    // 1. Optimistic Human move (X)
    this.board[index] = 'X';
    this.renderCell(index, 'X');
    this.isWaitingServer = true;

    const reactionBox = document.getElementById('tttReaction');
    if (reactionBox) {
      reactionBox.innerHTML = '🦝🐾 <em>Rocket is calculating his move...</em>';
    }

    try {
      const res = await fetch('/api/rock3t/games/tictactoe/move', {
        method: 'POST',
        headers: ROCK3T_OS.getAuthHeaders(),
        body: JSON.stringify({
          board: this.board,
          cellIndex: index,
        }),
      });

      const data = await res.json();
      this.isWaitingServer = false;

      if (!data.ok) {
        alert(data.error || 'Turn error');
        return;
      }

      // 2. Render Rocket's move ('O') if made
      if (data.rocketMoveIndex !== null && data.rocketMoveIndex !== undefined) {
        this.board[data.rocketMoveIndex] = 'O';
        this.renderCell(data.rocketMoveIndex, 'O');
      }

      // 3. Handle Game Over (Win / Loss / Draw)
      if (data.outcome) {
        this.isGameOver = true;
        this.scores = data.score;
        this.updateScoreboard();

        // Highlight winning cells
        if (data.winningLine) {
          for (const cellIdx of data.winningLine) {
            const cell = document.querySelector(`.ttt-cell[data-index="${cellIdx}"]`);
            if (cell) cell.classList.add('winner');
          }
        }

        // Display Rocket's dynamic AI reaction
        if (reactionBox && data.reaction) {
          reactionBox.innerHTML = `<strong>${data.reaction}</strong>`;
        }

        // Also voice through floating companion!
        ROCK3T_COMPANION?.say(data.reaction || 'Good game! Rematch? 🍕');
      } else {
        if (reactionBox) {
          reactionBox.textContent = "Your turn! Where are you placing your next X? 🐾";
        }
      }
    } catch (err) {
      this.isWaitingServer = false;
      console.warn('Game turn error:', err);
    }
  },

  renderCell(index, symbol) {
    const cell = document.querySelector(`.ttt-cell[data-index="${index}"]`);
    if (cell) {
      cell.textContent = symbol;
      cell.className = `ttt-cell ${symbol}`;
    }
  },

  async newGame() {
    this.board = Array(9).fill(null);
    this.isGameOver = false;
    this.isWaitingServer = false;

    // Reset UI cells
    document.querySelectorAll('.ttt-cell').forEach((cell) => {
      cell.textContent = '';
      cell.className = 'ttt-cell';
    });

    const reactionBox = document.getElementById('tttReaction');
    if (reactionBox) {
      reactionBox.textContent = "Fresh board! Tap any cell to place your X! 🦝";
    }

    ROCK3T_COMPANION?.say("New match! I won't go easy on you this time! 😈🍕");
  },
};

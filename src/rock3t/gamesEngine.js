import { getDb } from '../db/index.js';
import { initRock3tDb } from './rock3tDb.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

/* =====================================================================
   TIC-TAC-TOE ENGINE (3x3)
   ===================================================================== */
export const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

export function evaluateBoard(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], winningLine: [a, b, c], isDraw: false };
    }
  }

  const isFull = board.every((cell) => cell !== null && cell !== '');
  if (isFull) {
    return { winner: null, winningLine: null, isDraw: true };
  }

  return { winner: null, winningLine: null, isDraw: false };
}

export function calculateRocketMove(board) {
  const available = [];
  for (let i = 0; i < 9; i++) {
    if (!board[i]) available.push(i);
  }

  if (available.length === 0) return null;

  // 1. Can Rocket ('O') win in this move?
  for (const idx of available) {
    const clone = [...board];
    clone[idx] = 'O';
    if (evaluateBoard(clone).winner === 'O') {
      return idx;
    }
  }

  // 2. Can Human ('X') win in the next move? Block them!
  for (const idx of available) {
    const clone = [...board];
    clone[idx] = 'X';
    if (evaluateBoard(clone).winner === 'X') {
      return idx;
    }
  }

  // 3. Take Center (cell 4) if open
  if (available.includes(4)) {
    return 4;
  }

  // 4. Take available corners [0, 2, 6, 8]
  const corners = [0, 2, 6, 8].filter((c) => available.includes(c));
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // 5. Take any remaining open cell
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Generate an instant, dynamic reaction using GPT-6 Luna with strict token cap & 1800ms abort
 */
export async function generateGameReaction({ outcome, playerName = 'Sandy', score = {}, game = 'Tic-Tac-Toe' }) {
  const activeModel = getActiveModelId();
  const promptDirective = `You are ROCKET, cheeky raccoon. React to game end in ${game} vs ${playerName}. Outcome: ${outcome.toUpperCase()}. Be funny, witty, 1-2 sentences max. 1 emoji.`;

  if (scaleMaxAdapter.isConfigured()) {
    try {
      const response = await fetch(`${scaleMaxAdapter.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${scaleMaxAdapter.apiKey}`,
        },
        body: JSON.stringify({
          model: activeModel || 'gpt-6-luna',
          messages: [
            { role: 'system', content: promptDirective },
            { role: 'user', content: `Game: ${game}, Outcome: ${outcome}! React to ${playerName}!` }
          ],
          max_tokens: 45, // Strictly budget-capped to ~70 total tokens
          temperature: 0.85,
        }),
        signal: AbortSignal.timeout(450), // Ultra-fast 450ms timeout for instant UI response
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content?.trim();
        if (content) return content.replace(/^["']|["']$/g, '');
      }
    } catch (err) {
      // Instant fallback on timeout or provider error
    }
  }

  // High-speed witty fallbacks
  if (outcome === 'rocket_win') {
    const winQuotes = [
      `🦝🍕 HAHA! Rocket takes the crown! Now hand over a slice of pizza as tribute! 😈`,
      `🦝✨ Agile raccoon paws strike again! Better luck next round, ${playerName}! 🐾`,
      `🦝👑 Flawless victory! You walked right into my raccoon trap, ${playerName}! 🍕😈`,
    ];
    return winQuotes[Math.floor(Math.random() * winQuotes.length)];
  }

  if (outcome === 'human_win') {
    const loseQuotes = [
      `🦝🐾 *gasp* My claw slipped on pizza sauce! Rematch right now, ${playerName}! 😈`,
      `🦝🐾 Respect! That was a sharp move, ${playerName}! Taking notes for the rematch! 🍕`,
      `🦝🐾 Beginner's luck, ${playerName}! Don't let it get to your head, rematch time! 🎮`,
    ];
    return loseQuotes[Math.floor(Math.random() * loseQuotes.length)];
  }

  const drawQuotes = [
    `🦝🐾 A stalemate! Great minds (and brilliant raccoons) think alike! 🌮`,
    `🦝⚡ Dead heat! Locked down like a vault! Tiebreaker right now, let's go! 🍕😈`,
  ];
  return drawQuotes[Math.floor(Math.random() * drawQuotes.length)];
}

export async function playTicTacToeTurn(userId, board, cellIndex, playerName = 'Sandy') {
  initRock3tDb();
  const db = getDb();
  const uid = String(userId).trim();

  if (board[cellIndex] === 'O') {
    return { ok: false, error: 'Cell is already occupied by Rocket.' };
  }

  const newBoard = [...board];
  newBoard[cellIndex] = 'X';

  let evalResult = evaluateBoard(newBoard);
  let outcome = null;
  let rocketMoveIndex = null;

  if (evalResult.winner === 'X') {
    outcome = 'human_win';
  } else if (evalResult.isDraw) {
    outcome = 'draw';
  } else {
    rocketMoveIndex = calculateRocketMove(newBoard);
    if (rocketMoveIndex !== null) {
      newBoard[rocketMoveIndex] = 'O';
      evalResult = evaluateBoard(newBoard);
      if (evalResult.winner === 'O') {
        outcome = 'rocket_win';
      } else if (evalResult.isDraw) {
        outcome = 'draw';
      }
    }
  }

  // Update persistent score
  let currentScore = getGameScore(uid, 'tictactoe');
  if (outcome) {
    const nowIso = new Date().toISOString();
    let { wins, losses, ties, streak } = currentScore;

    if (outcome === 'human_win') {
      wins += 1;
      streak = streak > 0 ? streak + 1 : 1;
    } else if (outcome === 'rocket_win') {
      losses += 1;
      streak = streak < 0 ? streak - 1 : -1;
    } else if (outcome === 'draw') {
      ties += 1;
    }

    db.prepare(`
      INSERT INTO rock3t_game_scores (user_id, game_id, wins, losses, ties, streak, last_played_at)
      VALUES (?, 'tictactoe', ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, game_id) DO UPDATE SET
        wins = excluded.wins,
        losses = excluded.losses,
        ties = excluded.ties,
        streak = excluded.streak,
        last_played_at = excluded.last_played_at
    `).run(uid, wins, losses, ties, streak, nowIso);

    currentScore = { wins, losses, ties, streak };
  }

  let reaction = null;
  if (outcome) {
    reaction = await generateGameReaction({
      outcome,
      playerName,
      score: currentScore,
      game: 'Tic-Tac-Toe',
    });
  }

  return {
    ok: true,
    board: newBoard,
    rocketMoveIndex,
    winner: evalResult.winner,
    winningLine: evalResult.winningLine,
    isDraw: evalResult.isDraw,
    outcome,
    reaction,
    score: currentScore,
  };
}

/* =====================================================================
   CONNECT 4 ENGINE (7 columns x 6 rows)
   ===================================================================== */
export const C4_ROWS = 6;
export const C4_COLS = 7;

export function evaluateConnect4(board) {
  // board is length 42, null or 'R' (Red/Human) or 'Y' (Yellow/Rocket)
  // Check horizontal
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c <= C4_COLS - 4; c++) {
      const idx = r * C4_COLS + c;
      const val = board[idx];
      if (val && val === board[idx + 1] && val === board[idx + 2] && val === board[idx + 3]) {
        return { winner: val, line: [idx, idx + 1, idx + 2, idx + 3], isDraw: false };
      }
    }
  }

  // Check vertical
  for (let r = 0; r <= C4_ROWS - 4; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const idx = r * C4_COLS + c;
      const val = board[idx];
      if (val && val === board[idx + C4_COLS] && val === board[idx + C4_COLS * 2] && val === board[idx + C4_COLS * 3]) {
        return { winner: val, line: [idx, idx + C4_COLS, idx + C4_COLS * 2, idx + C4_COLS * 3], isDraw: false };
      }
    }
  }

  // Check diagonal down-right
  for (let r = 0; r <= C4_ROWS - 4; r++) {
    for (let c = 0; c <= C4_COLS - 4; c++) {
      const idx = r * C4_COLS + c;
      const val = board[idx];
      if (val && val === board[idx + C4_COLS + 1] && val === board[idx + (C4_COLS + 1) * 2] && val === board[idx + (C4_COLS + 1) * 3]) {
        return { winner: val, line: [idx, idx + C4_COLS + 1, idx + (C4_COLS + 1) * 2, idx + (C4_COLS + 1) * 3], isDraw: false };
      }
    }
  }

  // Check diagonal up-right
  for (let r = 3; r < C4_ROWS; r++) {
    for (let c = 0; c <= C4_COLS - 4; c++) {
      const idx = r * C4_COLS + c;
      const val = board[idx];
      if (val && val === board[idx - C4_COLS + 1] && val === board[idx - (C4_COLS - 1) * 2] && val === board[idx - (C4_COLS - 1) * 3]) {
        return { winner: val, line: [idx, idx - C4_COLS + 1, idx - (C4_COLS - 1) * 2, idx - (C4_COLS - 1) * 3], isDraw: false };
      }
    }
  }

  const isFull = board.every((cell) => cell !== null && cell !== '');
  return { winner: null, line: null, isDraw: isFull };
}

export function dropChipInCol(board, col, symbol) {
  if (col < 0 || col >= C4_COLS) return -1;
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    const idx = r * C4_COLS + col;
    if (!board[idx]) {
      board[idx] = symbol;
      return idx;
    }
  }
  return -1; // Column full
}

export function calculateConnect4RocketMove(board) {
  const openCols = [];
  for (let c = 0; c < C4_COLS; c++) {
    if (!board[c]) openCols.push(c); // Row 0 empty means col has space
  }
  if (openCols.length === 0) return null;

  // 1. Can Rocket ('Y') win immediately?
  for (const c of openCols) {
    const clone = [...board];
    dropChipInCol(clone, c, 'Y');
    if (evaluateConnect4(clone).winner === 'Y') return c;
  }

  // 2. Can Human ('R') win on next turn? Block them!
  for (const c of openCols) {
    const clone = [...board];
    dropChipInCol(clone, c, 'R');
    if (evaluateConnect4(clone).winner === 'R') return c;
  }

  // 3. Prefer center column (3) then inner columns (2, 4)
  const preferred = [3, 2, 4, 1, 5, 0, 6].filter((c) => openCols.includes(c));
  return preferred[0] !== undefined ? preferred[0] : openCols[0];
}

export async function playConnect4Turn(userId, board, col, playerName = 'Sandy') {
  initRock3tDb();
  const db = getDb();
  const uid = String(userId).trim();

  const newBoard = [...board];
  const humanSlot = dropChipInCol(newBoard, col, 'R');
  if (humanSlot === -1) {
    return { ok: false, error: 'Column is full! Choose another column.' };
  }

  let evalResult = evaluateConnect4(newBoard);
  let outcome = null;
  let rocketCol = null;
  let rocketSlot = null;

  if (evalResult.winner === 'R') {
    outcome = 'human_win';
  } else if (evalResult.isDraw) {
    outcome = 'draw';
  } else {
    rocketCol = calculateConnect4RocketMove(newBoard);
    if (rocketCol !== null) {
      rocketSlot = dropChipInCol(newBoard, rocketCol, 'Y');
      evalResult = evaluateConnect4(newBoard);
      if (evalResult.winner === 'Y') {
        outcome = 'rocket_win';
      } else if (evalResult.isDraw) {
        outcome = 'draw';
      }
    }
  }

  let currentScore = getGameScore(uid, 'connect4');
  if (outcome) {
    const nowIso = new Date().toISOString();
    let { wins, losses, ties, streak } = currentScore;
    if (outcome === 'human_win') {
      wins += 1;
      streak = streak > 0 ? streak + 1 : 1;
    } else if (outcome === 'rocket_win') {
      losses += 1;
      streak = streak < 0 ? streak - 1 : -1;
    } else if (outcome === 'draw') {
      ties += 1;
    }

    db.prepare(`
      INSERT INTO rock3t_game_scores (user_id, game_id, wins, losses, ties, streak, last_played_at)
      VALUES (?, 'connect4', ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, game_id) DO UPDATE SET
        wins = excluded.wins,
        losses = excluded.losses,
        ties = excluded.ties,
        streak = excluded.streak,
        last_played_at = excluded.last_played_at
    `).run(uid, wins, losses, ties, streak, nowIso);

    currentScore = { wins, losses, ties, streak };
  }

  let reaction = null;
  if (outcome) {
    reaction = await generateGameReaction({
      outcome,
      playerName,
      score: currentScore,
      game: 'Connect 4',
    });
  }

  return {
    ok: true,
    board: newBoard,
    humanSlot,
    rocketCol,
    rocketSlot,
    winner: evalResult.winner,
    winningLine: evalResult.line,
    isDraw: evalResult.isDraw,
    outcome,
    reaction,
    score: currentScore,
  };
}

/* =====================================================================
   CYBER RPS: ROCK, PAPER, SCISSORS, PIZZA, LASER
   ===================================================================== */
export const RPS_CHOICES = ['rock', 'paper', 'scissors', 'pizza', 'laser'];
export const RPS_RULES = {
  rock: ['scissors', 'laser'],
  paper: ['rock', 'laser'],
  scissors: ['paper', 'pizza'],
  pizza: ['rock', 'paper'], // Pizza distracts Rock and bribes Paper!
  laser: ['pizza', 'scissors'], // Laser melts Pizza and cuts Scissors!
};

export async function playRpsTurn(userId, playerChoice, playerName = 'Sandy', history = []) {
  initRock3tDb();
  const db = getDb();
  const uid = String(userId).trim();

  if (!RPS_CHOICES.includes(playerChoice)) {
    return { ok: false, error: 'Invalid move. Choose: rock, paper, scissors, pizza, or laser.' };
  }

  // High-speed psychological counter-play:
  // 1. Check history for patterns (if human repeats, predict and counter)
  let rocketChoice = null;
  const counters = Object.keys(RPS_RULES).filter((choice) => RPS_RULES[choice].includes(playerChoice));

  if (history && history.length > 0 && history[history.length - 1] === playerChoice) {
    // Player repeated their previous move: counter aggressively (80% probability)
    if (Math.random() < 0.8 && counters.length > 0) {
      rocketChoice = counters[Math.floor(Math.random() * counters.length)];
    }
  }

  if (!rocketChoice) {
    // Standard tactical weighted counter: 65% counter, 35% surprise wild move (pizza/laser)
    if (Math.random() < 0.65 && counters.length > 0) {
      rocketChoice = counters[Math.floor(Math.random() * counters.length)];
    } else {
      rocketChoice = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)];
    }
  }

  // Determine outcome
  let outcome = 'draw';
  if (playerChoice === rocketChoice) {
    outcome = 'draw';
  } else if (RPS_RULES[playerChoice].includes(rocketChoice)) {
    outcome = 'human_win';
  } else {
    outcome = 'rocket_win';
  }

  // Persistent score & streak tracking
  let currentScore = getGameScore(uid, 'rps');
  const nowIso = new Date().toISOString();
  let { wins, losses, ties, streak } = currentScore;

  if (outcome === 'human_win') {
    wins += 1;
    streak = streak > 0 ? streak + 1 : 1;
  } else if (outcome === 'rocket_win') {
    losses += 1;
    streak = streak < 0 ? streak - 1 : -1;
  } else {
    ties += 1;
  }

  db.prepare(`
    INSERT INTO rock3t_game_scores (user_id, game_id, wins, losses, ties, streak, last_played_at)
    VALUES (?, 'rps', ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, game_id) DO UPDATE SET
      wins = excluded.wins,
      losses = excluded.losses,
      ties = excluded.ties,
      streak = excluded.streak,
      last_played_at = excluded.last_played_at
  `).run(uid, wins, losses, ties, streak, nowIso);

  currentScore = { wins, losses, ties, streak };

  // Contextual high-speed raccoon banter (<1ms latency)
  let liveBanter = null;
  if (outcome === 'human_win') {
    const lossQuotes = [
      `🦝🐾 You tricked me with ${playerChoice}! Next round I'm unleashing the laser! ⚡`,
      `🦝🍕 Lucky shot ${playerName}! My paws slipped on cheese grease! Rematch! 🐾`,
      `🦝💻 Oof! Your ${playerChoice} sliced right through my firewall! Respect! 🔥`,
      `🦝🌮 Fine, you won with ${playerChoice}! But the pizza stash stays with me! 😈`,
    ];
    liveBanter = lossQuotes[Math.floor(Math.random() * lossQuotes.length)];
  } else if (outcome === 'rocket_win') {
    const winQuotes = [
      `🦝🍕 HAHA! My ${rocketChoice} clobbered your ${playerChoice}! Pizza victory! 😈`,
      `🦝⚡ 120 FPS raccoon reflexes! Your ${playerChoice} was no match for my ${rocketChoice}! 🐾`,
      `🦝👑 Calculated in 0.1ms! My ${rocketChoice} took the crown! 🍕`,
      `🦝🔥 The matrix obeys the raccoon! ${rocketChoice} wins the round! 🚀`,
    ];
    liveBanter = winQuotes[Math.floor(Math.random() * winQuotes.length)];
  } else {
    const tieQuotes = [
      `🦝⚡ Double ${playerChoice}! Great minds sync in the cyber matrix! 🐾`,
      `🦝🍕 A tie! Two ${playerChoice}s walk into a dumpster... 🍕🍕`,
      `🦝🌀 Matrix collision! We channeled the exact same quantum energy! ⚡`,
    ];
    liveBanter = tieQuotes[Math.floor(Math.random() * tieQuotes.length)];
  }

  return {
    ok: true,
    playerChoice,
    rocketChoice,
    outcome,
    reaction: liveBanter,
    score: currentScore,
  };
}

export function getGameScore(userId, gameId = 'tictactoe') {
  initRock3tDb();
  const db = getDb();
  const uid = String(userId).trim();
  const row = db.prepare('SELECT * FROM rock3t_game_scores WHERE user_id = ? AND game_id = ?').get(uid, gameId);

  return row || { user_id: uid, game_id: gameId, wins: 0, losses: 0, ties: 0, streak: 0 };
}

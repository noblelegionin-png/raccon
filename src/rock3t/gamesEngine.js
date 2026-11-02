import { getDb } from '../db/index.js';
import { initRock3tDb } from './rock3tDb.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

/**
 * Check if the board has a winner or draw
 */
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

/**
 * Intelligent lightweight move calculator for Rocket AI ('O')
 */
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
 * Generate a dynamic, contextual reaction using Rocket's connected AI brain (GPT-6 Luna)
 */
export async function generateGameReaction({ outcome, playerName = 'Friend', score = {} }) {
  const activeModel = getActiveModelId();
  const promptDirective = `
You are ROCKET, the mischievous, cheeky raccoon companion.
You just played a game of Tic-Tac-Toe against your human pal ${playerName}.
The outcome of the match was: ${outcome.toUpperCase()}!
Current match record: Player Wins: ${score.wins || 0}, Rocket Wins: ${score.losses || 0}, Ties: ${score.ties || 0}.

Generate ONE short, punchy, hilarious, highly expressive in-character raccoon reaction (1-2 sentences maximum).
- If Rocket won: gloat playfully ("Haha, I won!", demand a pizza slice reward 🍕, celebrate your agile paws).
- If Player won: show grudging respect, claim your paw slipped on sauce, demand an immediate rematch 😈.
- If it's a draw: banter about great raccoon minds thinking alike, say neither of us gets the pizza yet.
Include 1-2 signature emojis (🦝 😈 🐾 🍕 🌮). Do NOT use generic chatbot phrases.
`;

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
            { role: 'user', content: `Game ended in ${outcome}! React to ${playerName}!` }
          ],
          max_tokens: 80,
          temperature: 0.85,
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content?.trim();
        if (content) return content;
      }
    } catch (err) {
      console.warn('[TicTacToe AI Reaction] Provider fallback:', err.message);
    }
  }

  // Contextual fallback reactions
  if (outcome === 'rocket_win') {
    const winQuotes = [
      `🦝🍕 HAHA! Three in a row! Rocket takes the crown! Now hand over a slice of pizza as tribute! 😈`,
      `🦝✨ Agile raccoon paws strike again! Better luck next time, ${playerName}! Ready for round two? 🐾`,
      `🦝👑 Flawless raccoon strategy! You walked right into my trap, ${playerName}! 🍕😈`,
    ];
    return winQuotes[Math.floor(Math.random() * winQuotes.length)];
  }

  if (outcome === 'human_win') {
    const loseQuotes = [
      `🦝🐾 *gasp* My claw slipped on tomato sauce! Fine, you got me this time, ${playerName}, but rematch NOW! 😈`,
      `🦝🍕 Respect! That was a sharp move, ${playerName}! I am taking notes for the next round! 🐾`,
      `🦝😤 Beginner's luck! Don't let it get to your head, human! My paws are warming up! 🎮`,
    ];
    return loseQuotes[Math.floor(Math.random() * loseQuotes.length)];
  }

  const drawQuotes = [
    `🦝🐾 A stalemate! Great minds (and brilliant raccoons) think alike! Neither gets the taco yet! 🌮`,
    `🦝⚡ Dead heat! Locked down like a vault! Tiebreaker right now, let's go! 🍕😈`,
  ];
  return drawQuotes[Math.floor(Math.random() * drawQuotes.length)];
}

/**
 * Process a complete turn and update persistent score
 */
export async function playTicTacToeTurn(userId, board, cellIndex, playerName = 'Friend') {
  initRock3tDb();
  const db = getDb();
  const uid = String(userId).trim();

  // Validate human move
  if (board[cellIndex] === 'O') {
    return { ok: false, error: 'Cell is already occupied by Rocket.' };
  }

  // 1. Place Human ('X')
  const newBoard = [...board];
  newBoard[cellIndex] = 'X';

  // Check if human won
  let evalResult = evaluateBoard(newBoard);
  let outcome = null;
  let rocketMoveIndex = null;

  if (evalResult.winner === 'X') {
    outcome = 'human_win';
  } else if (evalResult.isDraw) {
    outcome = 'draw';
  } else {
    // 2. Rocket calculates smart move
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

  // 3. Update persistent score if game finished
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

  // 4. Generate AI reaction if game ended
  let reaction = null;
  if (outcome) {
    reaction = await generateGameReaction({
      outcome,
      playerName,
      score: currentScore,
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

/**
 * Retrieve persistent game scores
 */
export function getGameScore(userId, gameId = 'tictactoe') {
  initRock3tDb();
  const db = getDb();
  const uid = String(userId).trim();
  const row = db.prepare('SELECT * FROM rock3t_game_scores WHERE user_id = ? AND game_id = ?').get(uid, gameId);

  return row || { user_id: uid, game_id: gameId, wins: 0, losses: 0, ties: 0, streak: 0 };
}

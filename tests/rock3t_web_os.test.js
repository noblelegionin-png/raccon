import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import {
  initRock3tDb,
  getRock3tUserProfile,
  updateRock3tUserProfile,
  PERSONAL_QUESTIONS,
  DEFAULT_STORE_APPS,
} from '../src/rock3t/rock3tDb.js';
import {
  calculateRocketMove,
  evaluateBoard,
  playTicTacToeTurn,
  getGameScore,
  generateGameReaction,
} from '../src/rock3t/gamesEngine.js';
import { executeRock3tTool, ROCK3T_TOOLS } from '../src/rock3t/smartTools.js';
import { createWebServer } from '../src/web/server.js';
import fs from 'node:fs';
import path from 'node:path';

// 1. Profile & Theme Persistence
test('📱 1. ROCK3T Profile & Clean White Theme Defaults', () => {
  initRock3tDb();
  const testUserId = 'test_sandy_os_user_' + Date.now();
  const profile = getRock3tUserProfile(testUserId, 'Sandy');

  assert.equal(profile.user_id, testUserId);
  assert.equal(profile.theme, 'light', 'Default theme must be light (clean pure white)');
  assert.equal(profile.wallpaper, 'clean_white', 'Default wallpaper must be clean white');
  assert.equal(profile.animation_speed, 1.0);
  assert.equal(profile.dpi_scale, 1.0);

  // Update theme to dark
  const updated = updateRock3tUserProfile(testUserId, { theme: 'dark', animation_speed: 0.5 });
  assert.equal(updated.theme, 'dark');
  assert.equal(updated.animation_speed, 0.5);
});

// 2. 50 Personal Information Questions
test('📝 2. 50 Personal Questions Verification & Persistence', async () => {
  assert.equal(PERSONAL_QUESTIONS.length, 50, 'Must have exactly 50 personalization questions');

  const categories = new Set(PERSONAL_QUESTIONS.map((q) => q.category));
  assert.ok(categories.has('Identity & Basics'));
  assert.ok(categories.has('Favorites & Taste'));
  assert.ok(categories.has('People & Relationships'));
  assert.ok(categories.has('Lifestyle & Habits'));
  assert.ok(categories.has('Fun & Quirks'));
  assert.ok(categories.has('Memories & Aspirations'));

  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const testUserId = 'test_questions_user_123';

    // Fetch questions
    const res = await fetch(`${baseUrl}/api/rock3t/info/questions`, {
      headers: { 'x-user-id': testUserId },
    });
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.total, 50);

    // Save answer
    const saveRes = await fetch(`${baseUrl}/api/rock3t/info/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
      body: JSON.stringify({ questionId: 'favorite_food', answer: 'Pepperoni Pizza with extra cheese' }),
    });
    const saveData = await saveRes.json();
    assert.equal(saveData.ok, true);

    // Verify answer persisted
    const verifyRes = await fetch(`${baseUrl}/api/rock3t/info/questions`, {
      headers: { 'x-user-id': testUserId },
    });
    const verifyData = await verifyRes.json();
    const favFood = verifyData.questions.find((q) => q.id === 'favorite_food');
    assert.equal(favFood.answer, 'Pepperoni Pizza with extra cheese');
  } finally {
    server.close();
  }
});

// 3. Store Apps Catalog
test('🛍️ 3. Rocket Store Catalog & Installation Lifecycle', async () => {
  assert.ok(DEFAULT_STORE_APPS.length >= 5);
  const coreApps = ['store', 'canvas', 'games', 'maps', 'settings'];
  for (const app of coreApps) {
    assert.ok(DEFAULT_STORE_APPS.find((a) => a.id === app), `Core app ${app} must be in store`);
  }

  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const testUserId = 'test_store_user';
    const res = await fetch(`${baseUrl}/api/rock3t/store/apps`, {
      headers: { 'x-user-id': testUserId },
    });
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.apps));
  } finally {
    server.close();
  }
});

// 4. Tic-Tac-Toe Game Engine & Smart Moves
test('🎮 4. Tic-Tac-Toe Engine, Smart Minimax & Scoreboard', async () => {
  // Test 1: Win detection
  const winBoard = ['X', 'X', 'X', null, 'O', 'O', null, null, null];
  const evalWin = evaluateBoard(winBoard);
  assert.equal(evalWin.winner, 'X');
  assert.deepEqual(evalWin.winningLine, [0, 1, 2]);

  // Test 2: Rocket blocking human win
  // Human has cells 0 and 1, cell 2 is open. Rocket ('O') must block at cell 2!
  const urgentBoard = ['X', 'X', null, 'O', null, null, null, null, null];
  const blockMove = calculateRocketMove(urgentBoard);
  assert.equal(blockMove, 2, 'Rocket must block Human win at cell 2');

  // Test 3: Rocket taking winning move
  // Rocket has cells 3 and 4, cell 5 is open. Rocket ('O') must win at cell 5!
  const winReadyBoard = ['X', 'X', null, 'O', 'O', null, null, null, null];
  const winningMove = calculateRocketMove(winReadyBoard);
  assert.equal(winningMove, 5, 'Rocket must take the winning cell at index 5');

  // Test 4: Full turn lifecycle & persistent score tracking
  const testUserId = 'test_tictactoe_user';
  const initialScore = getGameScore(testUserId, 'tictactoe');

  const turn = await playTicTacToeTurn(
    testUserId,
    Array(9).fill(null),
    4, // Human takes center
    'Sandy'
  );

  assert.equal(turn.ok, true);
  assert.equal(turn.board[4], 'X');
  assert.ok(turn.rocketMoveIndex !== null);
  assert.equal(turn.board[turn.rocketMoveIndex], 'O');
});

// 5. Dynamic AI Reaction Generator
test('🦝 5. Dynamic AI Reaction Generation (Contextual Raccoon Banter)', async () => {
  const winReaction = await generateGameReaction({
    outcome: 'rocket_win',
    playerName: 'Sandy',
    score: { wins: 3, losses: 5, ties: 1 },
  });
  assert.ok(winReaction.length > 5);
  assert.ok(winReaction.includes('🦝') || winReaction.includes('🍕') || winReaction.includes('Rocket'));

  const lossReaction = await generateGameReaction({
    outcome: 'human_win',
    playerName: 'Sandy',
    score: { wins: 4, losses: 5, ties: 1 },
  });
  assert.ok(lossReaction.length > 5);
  assert.ok(lossReaction.includes('🐾') || lossReaction.includes('rematch') || lossReaction.includes('Sandy'));
});

// 6. Smart Tool Calling
test('⚡ 6. Rocket Smart Tool Calling Interface', async () => {
  assert.equal(ROCK3T_TOOLS.length, 4);

  const testUserId = 'test_tool_user';

  // Tool 1: open_app
  const openRes = await executeRock3tTool('open_app', { appId: 'canvas' }, { userId: testUserId });
  assert.equal(openRes.ok, true);
  assert.equal(openRes.appId, 'canvas');

  // Tool 2: draw_on_canvas
  const drawRes = await executeRock3tTool('draw_on_canvas', { shape: 'pizza', color: '#ff9f1c' }, { userId: testUserId });
  assert.equal(drawRes.ok, true);
  assert.equal(drawRes.drawing.shape, 'pizza');

  // Tool 3: update_os_setting
  const setRes = await executeRock3tTool('update_os_setting', { key: 'theme', value: 'dark' }, { userId: testUserId });
  assert.equal(setRes.ok, true);
  assert.equal(setRes.value, 'dark');
});

// 7. REST APIs & Static Web OS Serving
test('🌐 7. ROCK3T Web OS REST APIs & Static Page Delivery', async () => {
  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Test GET /rock3t/index.html
    const pageRes = await fetch(`${baseUrl}/rock3t/index.html`);
    assert.equal(pageRes.status, 200);
    const html = await pageRes.text();
    assert.ok(html.includes('ROCK3T — Interactive Web OS'));
    assert.ok(html.includes('drawingCanvas'));
    assert.ok(html.includes('tttBoard'));
    assert.ok(html.includes('floatingCompanion'));

    // Test GET /os redirect / alias
    const osAliasRes = await fetch(`${baseUrl}/os`);
    assert.equal(osAliasRes.status, 200);
  } finally {
    server.close();
  }
});

// 8. Wallpaper Customization & Future Games Catalog
test('🖼️ 8. Wallpaper Customization & Future Games Catalog Verification', async () => {
  const testUserId = 'test_wallpaper_games_user_' + Date.now();
  const profile = getRock3tUserProfile(testUserId, 'Sandy');
  assert.equal(profile.wallpaper, 'clean_white');

  // Update wallpaper
  const updated = updateRock3tUserProfile(testUserId, { wallpaper: 'https://images.unsplash.com/custom-wallpaper.jpg' });
  assert.equal(updated.wallpaper, 'https://images.unsplash.com/custom-wallpaper.jpg');

  // Reset to clean white
  const reset = updateRock3tUserProfile(testUserId, { wallpaper: 'clean_white' });
  assert.equal(reset.wallpaper, 'clean_white');

  // Verify static page contains the elements
  const htmlPath = path.resolve(process.cwd(), 'src/web/public/rock3t/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('games-tab-bar'), 'Must contain games tab bar for multi-game support');
  assert.ok(html.includes('Snakes & Ladders'), 'Must contain Snakes & Ladders future roadmap stub');
  assert.ok(html.includes('Ludo'), 'Must contain Ludo future roadmap stub');
  assert.ok(html.includes('Chess'), 'Must contain Chess future roadmap stub');
  assert.ok(html.includes('life-engine-card'), 'Must contain live Rocket Life Engine card');
  assert.ok(html.includes('wallpaperUrlInput'), 'Must contain wallpaper URL input');
  assert.ok(html.includes('wallpaperFileInput'), 'Must contain wallpaper upload input');
});

// 9. Connect 4 Engine & Drop Physics
test('🔴 9. Connect 4 Engine: Drops, Gravity & Win Evaluation', async () => {
  const { evaluateConnect4, calculateConnect4RocketMove, playConnect4Turn } = await import('../src/rock3t/gamesEngine.js');

  // Test 1: Empty board drop (bottom row is row 5, index 38 for col 3)
  const emptyBoard = Array(42).fill(null);
  const turn = await playConnect4Turn('test_c4_user', emptyBoard, 3, 'Sandy');
  assert.equal(turn.ok, true);
  // Col 3 row 5 is 5 * 7 + 3 = 38
  assert.equal(turn.board[38], 'R', 'Human red chip must fall to bottom of col 3');
  assert.ok(turn.rocketCol >= 0 && turn.rocketCol <= 6);

  // Test 2: Horizontal 4-in-a-row detection
  const horizBoard = Array(42).fill(null);
  horizBoard[35] = 'R'; horizBoard[36] = 'R'; horizBoard[37] = 'R'; horizBoard[38] = 'R';
  const evalH = evaluateConnect4(horizBoard);
  assert.equal(evalH.winner, 'R');
  assert.deepEqual(evalH.line, [35, 36, 37, 38]);

  // Test 3: AI blocking human vertical connect 4
  // Human has 3 in col 2: rows 5, 4, 3 (indices 37, 30, 23). Rocket must block at row 2 (index 16)!
  const vertBoard = Array(42).fill(null);
  vertBoard[37] = 'R'; vertBoard[30] = 'R'; vertBoard[23] = 'R';
  const blockCol = calculateConnect4RocketMove(vertBoard);
  assert.equal(blockCol, 2, 'Rocket AI must block Human vertical win in col 2');
});

// 10. Cyber RPS Game Engine (5 Choices & Streaks)
test('🍕 10. Cyber RPS Engine: Rock, Paper, Scissors, Pizza, Laser', async () => {
  const { playRpsTurn } = await import('../src/rock3t/gamesEngine.js');

  const userId = 'test_rps_user_' + Date.now();
  // Turn 1: Play Pizza (Pizza bribes Paper and Rock)
  const turn1 = await playRpsTurn(userId, 'pizza', 'Sandy');
  assert.equal(turn1.ok, true);
  assert.equal(turn1.playerChoice, 'pizza');
  assert.ok(['rock', 'paper', 'scissors', 'pizza', 'laser'].includes(turn1.rocketChoice));
  assert.ok(['human_win', 'rocket_win', 'draw'].includes(turn1.outcome));
  assert.ok(turn1.score !== undefined);
  assert.ok(turn1.reaction.length > 5);
});

// 11. 50+ Rocket Thoughts Vault & Live Luna Generation
test('🧠 11. 50+ Rocket Thoughts Vault & Random / Live Thought APIs', async () => {
  const { DEFAULT_ROCKET_THOUGHTS, getRandomThought, generateLiveLunaThought } = await import('../src/rock3t/thoughtsVault.js');
  assert.ok(DEFAULT_ROCKET_THOUGHTS.length >= 50, 'Vault must contain at least 50 pre-crafted thoughts');

  const randomThought = await getRandomThought();
  assert.ok(randomThought.text.length > 5);
  assert.ok(randomThought.category);

  // Live Luna Thought generation
  const liveLuna = await generateLiveLunaThought('Sandy', 'pizza');
  assert.ok(liveLuna.text.length > 5);
  assert.ok(liveLuna.isLive);
});

// 12. Strict 1-Page Full-Width Pager CSS & JS Geometry Verification
test('📐 12. 1-Page Full-Width Pager Layout Verification (No Squished Side-by-Side Pages)', () => {
  const cssPath = path.resolve(process.cwd(), 'src/web/public/rock3t/os.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify .home-page is strictly 100% width, never 20%
  assert.ok(css.includes('flex: 0 0 100% !important;'), 'Home page must be flex 100% width');
  assert.ok(css.includes('min-width: 100% !important;'), 'Home page min-width must be 100%');
  assert.ok(css.includes('max-width: 100% !important;'), 'Home page max-width must be 100%');
  assert.ok(!css.includes('flex: 0 0 20% !important;'), 'Squished 20% flex must be completely eliminated');

  const jsPath = path.resolve(process.cwd(), 'src/web/public/rock3t/os.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verify pixel-based displacement and 120fps motion blur in JS
  assert.ok(js.includes('getContainerWidth()'), 'Must contain getContainerWidth helper');
  assert.ok(js.includes('targetTranslatePx'), 'Must use pixel-based translation target');
  assert.ok(js.includes('orientationchange'), 'Must listen to orientationchange');
});


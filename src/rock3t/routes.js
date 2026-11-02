import express from 'express';
import { getDb } from '../db/index.js';
import {
  initRock3tDb,
  getRock3tUserProfile,
  updateRock3tUserProfile,
  PERSONAL_QUESTIONS,
  DEFAULT_STORE_APPS,
} from './rock3tDb.js';
import { playTicTacToeTurn, getGameScore } from './gamesEngine.js';
import { executeRock3tTool, ROCK3T_TOOLS } from './smartTools.js';
import { rocketAuthMiddleware } from '../rocket/rbac.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export const rock3tRouter = express.Router();

rock3tRouter.use(rocketAuthMiddleware);

/**
 * 1. GET /api/rock3t/profile
 */
rock3tRouter.get('/profile', (req, res) => {
  try {
    const user = req.rocketUser;
    const profile = getRock3tUserProfile(user.id, user.first_name || 'User');
    const db = getDb();

    const installed = db.prepare('SELECT app_id FROM rock3t_installed_apps WHERE user_id = ?').all(user.id);
    const installedIds = installed.map((i) => i.app_id);

    const scores = db.prepare('SELECT * FROM rock3t_game_scores WHERE user_id = ?').all(user.id);
    const infoCount = db.prepare('SELECT COUNT(*) as count FROM rock3t_user_info WHERE user_id = ?').get(user.id);

    res.json({
      ok: true,
      user,
      profile,
      installedApps: installedIds,
      scores,
      answeredCount: infoCount?.count || 0,
      totalQuestions: PERSONAL_QUESTIONS.length,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 2. POST /api/rock3t/profile
 */
rock3tRouter.post('/profile', (req, res) => {
  try {
    const user = req.rocketUser;
    const updated = updateRock3tUserProfile(user.id, req.body);
    res.json({ ok: true, profile: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 3. GET /api/rock3t/info/questions
 * Returns all 50 questions along with user saved answers
 */
rock3tRouter.get('/info/questions', (req, res) => {
  try {
    const user = req.rocketUser;
    const db = getDb();
    const userAnswers = db.prepare('SELECT question_id, answer_text, updated_at FROM rock3t_user_info WHERE user_id = ?').all(user.id);
    const answersMap = Object.fromEntries(userAnswers.map((a) => [a.question_id, a.answer_text]));

    const questionsWithAnswers = PERSONAL_QUESTIONS.map((q) => ({
      ...q,
      answer: answersMap[q.id] || '',
    }));

    res.json({
      ok: true,
      questions: questionsWithAnswers,
      total: PERSONAL_QUESTIONS.length,
      answered: userAnswers.length,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 4. POST /api/rock3t/info/answer
 */
rock3tRouter.post('/info/answer', (req, res) => {
  try {
    const user = req.rocketUser;
    const { questionId, answer } = req.body;
    if (!questionId) {
      return res.status(400).json({ ok: false, error: 'questionId is required.' });
    }

    const questionObj = PERSONAL_QUESTIONS.find((q) => q.id === questionId);
    const category = questionObj ? questionObj.category : 'General';
    const questionText = questionObj ? questionObj.text : questionId;
    const nowIso = new Date().toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO rock3t_user_info (user_id, question_id, category, question_text, answer_text, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, question_id) DO UPDATE SET
        answer_text = excluded.answer_text,
        updated_at = excluded.updated_at
    `).run(user.id, questionId, category, questionText, String(answer || '').trim(), nowIso);

    res.json({ ok: true, questionId, answer });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 5. DELETE /api/rock3t/info/answer
 */
rock3tRouter.delete('/info/answer', (req, res) => {
  try {
    const user = req.rocketUser;
    const { questionId } = req.body;
    const db = getDb();
    db.prepare('DELETE FROM rock3t_user_info WHERE user_id = ? AND question_id = ?').run(user.id, questionId);
    res.json({ ok: true, questionId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 6. GET /api/rock3t/store/apps
 */
rock3tRouter.get('/store/apps', (req, res) => {
  try {
    const user = req.rocketUser;
    const db = getDb();
    const installed = db.prepare('SELECT app_id FROM rock3t_installed_apps WHERE user_id = ?').all(user.id);
    const installedSet = new Set(installed.map((i) => i.app_id));

    const apps = DEFAULT_STORE_APPS.map((app) => ({
      ...app,
      isInstalled: installedSet.has(app.id),
    }));

    res.json({ ok: true, apps });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 7. POST /api/rock3t/store/toggle
 */
rock3tRouter.post('/store/toggle', (req, res) => {
  try {
    const user = req.rocketUser;
    const { appId, install = true } = req.body;
    const db = getDb();
    const nowIso = new Date().toISOString();

    if (install) {
      db.prepare(`
        INSERT OR IGNORE INTO rock3t_installed_apps (user_id, app_id, installed_at, version)
        VALUES (?, ?, ?, '1.0.0')
      `).run(user.id, appId, nowIso);
    } else {
      // Don't uninstall Settings or Store
      if (appId === 'settings' || appId === 'store') {
        return res.status(400).json({ ok: false, error: 'Cannot uninstall system essential application.' });
      }
      db.prepare('DELETE FROM rock3t_installed_apps WHERE user_id = ? AND app_id = ?').run(user.id, appId);
    }

    res.json({ ok: true, appId, isInstalled: install });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 8. POST /api/rock3t/games/tictactoe/move
 */
rock3tRouter.post('/games/tictactoe/move', async (req, res) => {
  try {
    const user = req.rocketUser;
    const { board = Array(9).fill(null), cellIndex } = req.body;

    if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) {
      return res.status(400).json({ ok: false, error: 'Invalid cell index.' });
    }

    const result = await playTicTacToeTurn(
      user.id,
      board,
      cellIndex,
      user.first_name || 'Friend'
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 9. POST /api/rock3t/games/tictactoe/reset
 */
rock3tRouter.post('/games/tictactoe/reset', (req, res) => {
  try {
    const user = req.rocketUser;
    const score = getGameScore(user.id, 'tictactoe');
    res.json({
      ok: true,
      board: Array(9).fill(null),
      score,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 10. GET /api/rock3t/canvas
 */
rock3tRouter.get('/canvas', (req, res) => {
  try {
    const user = req.rocketUser;
    const db = getDb();
    const rows = db.prepare('SELECT id, title, created_at, thumbnail_url FROM rock3t_canvas_saves WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id);
    res.json({ ok: true, drawings: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 11. POST /api/rock3t/canvas/save
 */
rock3tRouter.post('/canvas/save', (req, res) => {
  try {
    const user = req.rocketUser;
    const { title = 'My Drawing', canvasData = '[]', thumbnailUrl = '' } = req.body;
    const id = 'draw_' + Date.now();
    const nowIso = new Date().toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO rock3t_canvas_saves (id, user_id, title, canvas_data, thumbnail_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, user.id, title, typeof canvasData === 'string' ? canvasData : JSON.stringify(canvasData), thumbnailUrl, nowIso);

    res.json({ ok: true, id, title });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 12. POST /api/rock3t/companion/chat
 * Conversational companion with tool calling and context awareness
 */
rock3tRouter.post('/companion/chat', async (req, res) => {
  try {
    const user = req.rocketUser;
    const { message = '', appContext = 'homescreen', history = [] } = req.body;
    const activeModel = getActiveModelId();

    const db = getDb();
    // Retrieve user personal answers to inject into prompt
    const savedAnswers = db.prepare('SELECT question_id, answer_text FROM rock3t_user_info WHERE user_id = ?').all(user.id);
    const personalProfileSnippet = savedAnswers.map((a) => `${a.question_id}: "${a.answer_text}"`).join(', ');

    const systemPrompt = `
You are ROCKET, the witty, cheeky, playful raccoon AI companion inside ROCK3T Web OS!
You are visually floating on the screen as a lively raccoon avatar with agile paws 🐾 and a striped tail.

CURRENT OS STATE:
- User: "${user.first_name || 'Friend'}" (Owner: ${user.isOwner ? 'YES, Sandy (Boss)' : 'No'})
- Active Application: "${appContext}"
- User Personal Facts: ${personalProfileSnippet || 'None filled yet'}

BEHAVIOR:
- Mischievous, quick-witted, helpful, and fun!
- Natural speech (never sterile corporate chatbot tone).
- Sprinkle signature emojis: 🦝 😈 🐾 🍕 🌮.
- If the user asks to open an app (e.g. "open canvas", "let's play a game", "open settings"), call the open_app tool!
- If the user asks you to draw something, call draw_on_canvas!
- If the user asks to change theme or settings, call update_os_setting!
`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6),
      { role: 'user', content: message },
    ];

    let aiReply = '';
    let toolResult = null;

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
            messages,
            tools: ROCK3T_TOOLS,
            tool_choice: 'auto',
            max_tokens: 350,
            temperature: 0.75,
          }),
        });

        if (response.ok) {
          const json = await response.json();
          const choice = json.choices?.[0]?.message;

          // Check if model called a tool
          if (choice?.tool_calls && choice.tool_calls.length > 0) {
            const tc = choice.tool_calls[0];
            const fnName = tc.function.name;
            const fnArgs = JSON.parse(tc.function.arguments || '{}');
            toolResult = await executeRock3tTool(fnName, fnArgs, { userId: user.id, isOwner: user.isOwner });
            aiReply = choice.content || `🦝🐾 Done! I executed ${fnName} for you!`;
          } else {
            aiReply = choice?.content || '🦝🐾 Rocket is standing by!';
          }
        }
      } catch (err) {
        console.warn('[Companion Chat Error]:', err.message);
        aiReply = `🦝🐾 *rubs whiskers* Rocket heard you loud and clear! (Connection hiccup, but paws are active!)`;
      }
    } else {
      aiReply = `🦝🍕 *snickers* Hey ${user.first_name || 'boss'}! Running in offline mode! Tap any app or let me know what we are building! 🐾`;
    }

    res.json({
      ok: true,
      reply: aiReply,
      toolResult,
      appContext,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

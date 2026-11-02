import express from 'express';
import { rocketLifeEngine } from './lifeEngine.js';
import {
  rocketAuthMiddleware,
  requireRocketOwner,
  getUserRole,
  setUserRole,
  listUserRoles,
  ROLES,
} from './rbac.js';
import {
  buildRocketDirective,
  detectSandyAbuse,
  generateDefenseResponse,
  generateStarvingResponse,
  generateSleepResponse,
} from './persona.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export const rocketRouter = express.Router();

// Apply auth middleware to all rocket routes
rocketRouter.use(rocketAuthMiddleware);

/**
 * 1. GET /api/rocket/state
 * Returns complete live telemetry for context & authenticated user
 */
rocketRouter.get('/state', (req, res) => {
  try {
    const contextId = req.query.contextId || 'global';
    const contextType = req.query.contextType || 'global';
    const state = rocketLifeEngine.getState(contextId, contextType);

    res.json({
      ok: true,
      user: req.rocketUser,
      state,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 2. POST /api/rocket/feed
 * Feed Rocket food (Pizza or Taco)
 */
rocketRouter.post('/feed', (req, res) => {
  try {
    const { itemType = 'pizza', amount = 1, note = '', contextId = 'global' } = req.body;
    const user = req.rocketUser;

    if (!user.canFeed) {
      return res.status(403).json({
        ok: false,
        error: 'You do not have feeding permissions in this space.',
      });
    }

    const updatedState = rocketLifeEngine.feed(
      contextId,
      user.id,
      user.first_name || user.userName,
      itemType,
      amount,
      note
    );

    const sound = itemType === 'pizza' ? 'crunch_pizza' : 'crunch_taco';
    const celebratoryMessages = [
      `🦝🍕 *NOM NOM NOM!* Rocket snatched the ${itemType} with both paws! Crumbs flying everywhere! Energy boosted!`,
      `🦝🌮 *CRUNCH!* Delicious ${itemType}! Rocket wags his striped tail happily! Ready for trouble! 😈`,
      `🦝✨ *CHOMP!* That hit the spot! Rocket wipes tomato sauce off his whiskers! Thanks, ${user.first_name || 'friend'}!`,
    ];
    const message = celebratoryMessages[Math.floor(Math.random() * celebratoryMessages.length)];

    res.json({
      ok: true,
      message,
      sound,
      state: updatedState,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 3. POST /api/rocket/refill (Sandy / Owner Only)
 * Infinite food grant & full tank reset
 */
rocketRouter.post('/refill', requireRocketOwner, (req, res) => {
  try {
    const { contextId = 'global', pizzas = 50, tacos = 25 } = req.body;
    const updatedState = rocketLifeEngine.refillFood(contextId, req.rocketUser.id, pizzas, tacos);

    res.json({
      ok: true,
      message: '👑 Sandy granted an infinite food drop! Rocket is swimming in pizzas and tacos! 🍕🌮✨',
      state: updatedState,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 4. POST /api/rocket/sleep/wake
 * Emergency wake-up trigger
 */
rocketRouter.post('/sleep/wake', (req, res) => {
  try {
    const { contextId = 'global' } = req.body;
    const user = req.rocketUser;

    if (!user.isOwner && !user.canTriggerEmergencyWake) {
      return res.status(403).json({
        ok: false,
        error: 'Only Sandy or authorized VIPs can trigger an immediate emergency wake-up.',
      });
    }

    const updatedState = rocketLifeEngine.triggerEmergencyWake(contextId, user.id);

    res.json({
      ok: true,
      message: '🚨 Emergency wake-up triggered! Rocket sat up, shook off sawdust, and is ready for duty! 🦝⚡',
      state: updatedState,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 5. POST /api/rocket/chat
 * Interactive conversation in the Mini App powered by GPT-6 Luna
 */
rocketRouter.post('/chat', async (req, res) => {
  const startTime = Date.now();
  try {
    const { message = '', contextId = 'global', history = [] } = req.body;
    const user = req.rocketUser;

    if (!message || !message.trim()) {
      return res.status(400).json({ ok: false, error: 'Message cannot be empty.' });
    }

    const currentState = rocketLifeEngine.getState(contextId);

    // 1. Check if Sandy is being abused
    if (detectSandyAbuse(message)) {
      const defense = generateDefenseResponse(user.first_name || 'Friend');
      return res.json({
        ok: true,
        reply: defense,
        state: currentState,
        tokensUsed: 0,
      });
    }

    // 2. Check if Rocket is currently asleep
    if (currentState.is_sleeping) {
      // Check emergency wake condition (5 messages)
      const sleepCheck = rocketLifeEngine.registerSleepMessage(contextId, user.id);
      if (!sleepCheck.wokeUp) {
        return res.json({
          ok: true,
          reply: sleepCheck.message,
          state: rocketLifeEngine.getState(contextId),
          tokensUsed: 0,
        });
      }
    }

    // 3. Check if Rocket is starving (0% fuel)
    if (currentState.hunger_state === 'starving' && currentState.fuel_tokens_remaining <= 0 && currentState.pizza_inventory <= 0 && currentState.taco_inventory <= 0) {
      if (!user.isOwner) {
        const starvingRefusal = generateStarvingResponse(user.first_name || 'Friend', false);
        return res.json({
          ok: true,
          reply: starvingRefusal,
          state: currentState,
          tokensUsed: 0,
        });
      }
    }

    // 4. Build prompt & call ScaleMax GPT-6 Luna
    const activeModel = getActiveModelId();
    const directive = buildRocketDirective({
      senderName: user.first_name || user.userName || 'Friend',
      isSandy: user.isOwner,
      userRole: user.role,
      lifeState: currentState,
    });

    const messages = [
      { role: 'system', content: directive },
      ...history.slice(-8), // Maintain recent turn context
      { role: 'user', content: message },
    ];

    let aiReply = '';
    let promptTokens = 0;
    let completionTokens = 0;

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
            max_tokens: 600,
            temperature: 0.75,
          }),
        });

        if (response.ok) {
          const json = await response.json();
          aiReply = json.choices?.[0]?.message?.content || '';
          promptTokens = json.usage?.prompt_tokens || Math.round(message.length / 4);
          completionTokens = json.usage?.completion_tokens || Math.round(aiReply.length / 4);
        } else {
          throw new Error(`ScaleMax returned HTTP ${response.status}`);
        }
      } catch (providerErr) {
        console.warn('[Rocket AI Chat] Provider error:', providerErr.message);
        aiReply = `🦝🐾 *scratches head and adjusts goggles* Whoops! ScaleMax connection stuttered for a second, but I heard ya! Rocket is still here and hungry for tacos! 🌮 (${providerErr.message})`;
        promptTokens = 40;
        completionTokens = 35;
      }
    } else {
      aiReply = `🦝🍕 *snickers playfully* Hey ${user.first_name || 'boss'}! ScaleMax is in offline simulation mode, but I am standing by with agile paws and sharp wits! Feed me a slice! 🐾`;
      promptTokens = 25;
      completionTokens = 30;
    }

    // 5. Deduct fuel based on actual provider-reported token usage
    const updatedState = rocketLifeEngine.consumeTokens(
      contextId,
      promptTokens,
      completionTokens,
      activeModel || 'gpt-6-luna'
    );

    // If Rocket was woken from sleep to answer, compensate sleep debt!
    const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    if (currentState.remaining_rest_seconds > 0) {
      rocketLifeEngine.compensateWorkDuringRest(contextId, elapsedSec);
    }

    res.json({
      ok: true,
      reply: aiReply,
      tokensUsed: promptTokens + completionTokens,
      state: rocketLifeEngine.getState(contextId),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 6. GET /api/rocket/history
 * Food transactions & activity logs
 */
rocketRouter.get('/history', (req, res) => {
  try {
    const contextId = req.query.contextId || 'global';
    const limit = parseInt(req.query.limit || '25', 10);
    const history = rocketLifeEngine.getHistory(contextId, limit);
    res.json({ ok: true, ...history });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 7. GET /api/rocket/group/:groupId
 * Shared group status & inventory
 */
rocketRouter.get('/group/:groupId', (req, res) => {
  try {
    const groupId = req.params.groupId;
    const contextId = `group_${groupId}`;
    const groupState = rocketLifeEngine.getState(contextId, 'group');
    const history = rocketLifeEngine.getHistory(contextId, 15);

    res.json({
      ok: true,
      groupId,
      state: groupState,
      recentContributions: history.transactions,
      recentActivities: history.activities,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 8. POST /api/rocket/settings (Sandy / Owner Only)
 * Update thresholds, mute state, or custom task
 */
rocketRouter.post('/settings', requireRocketOwner, (req, res) => {
  try {
    const { contextId = 'global', isMuted, thresholds, currentTask } = req.body;
    const updatedState = rocketLifeEngine.updateSettings(contextId, {
      isMuted,
      thresholds,
      currentTask,
    });
    res.json({ ok: true, state: updatedState });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 9. GET /api/rocket/users (Sandy / Owner Only)
 * List RBAC permissions
 */
rocketRouter.get('/users', requireRocketOwner, (req, res) => {
  try {
    const users = listUserRoles();
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 10. POST /api/rocket/users/role (Sandy / Owner Only)
 * Update user RBAC role
 */
rocketRouter.post('/users/role', requireRocketOwner, (req, res) => {
  try {
    const { userId, userName, role, options } = req.body;
    if (!userId || !role) {
      return res.status(400).json({ ok: false, error: 'userId and role are required.' });
    }
    const updated = setUserRole(userId, userName, role, options);
    res.json({ ok: true, user: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 11. GET /api/rocket/stream
 * Real-time Server-Sent Events (SSE) for live Mini App sync
 */
rocketRouter.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const contextId = req.query.contextId || 'global';

  const sendUpdate = () => {
    try {
      const state = rocketLifeEngine.getState(contextId);
      res.write(`data: ${JSON.stringify({ type: 'state', state, time: Date.now() })}\n\n`);
    } catch {}
  };

  // Immediate push on connect
  sendUpdate();

  // Periodic push every 3 seconds for continuous smooth countdown and live telemetry
  const interval = setInterval(sendUpdate, 3000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

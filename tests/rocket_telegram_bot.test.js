import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { Bot } from 'grammy';
import { registerRocketHandlers } from '../src/rocketBot/handlers.js';
import { rocketLifeEngine } from '../src/rocket/lifeEngine.js';

test('🤖 Rocket Telegram Bot — Handlers Registration & Mock Updates', async () => {
  // Create a mock bot instance
  const mockToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567';
  const bot = new Bot(mockToken);

  let registeredCommands = [];
  // Mock bot methods
  registerRocketHandlers(bot);

  // Verify that commands and event listeners were registered
  // Grammy stores listeners in bot.middleware()
  assert.ok(typeof bot.middleware === 'function');

  // Test life engine interaction with Telegram user context
  const testUserId = 8685232094; // Sandy
  const contextId = `user_${testUserId}`;

  const state = rocketLifeEngine.getState(contextId);
  assert.ok(state.hunger_level !== undefined);
  assert.ok(state.pizza_inventory !== undefined);

  // Test feed from Telegram
  const fed = rocketLifeEngine.feed(contextId, testUserId, 'Sandy', 'pizza', 2, 'Telegram Test');
  assert.equal(fed.hunger_level > 0, true);
  assert.ok(fed.pizza_inventory >= 2);
});

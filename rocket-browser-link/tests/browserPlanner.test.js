import test from 'node:test';
import assert from 'node:assert/strict';
import { browserPlanner } from '../../src/browser/browserPlanner.js';

test('1. Browser Intent Discernment', () => {
  // Single-word shortcuts
  assert.equal(browserPlanner.isBrowserInstruction('YouTube'), true);
  assert.equal(browserPlanner.isBrowserInstruction('back'), true);
  assert.equal(browserPlanner.isBrowserInstruction('zoom out'), true);
  assert.equal(browserPlanner.isBrowserInstruction('clean tabs'), true);
  assert.equal(browserPlanner.isBrowserInstruction('copy'), true);
  assert.equal(browserPlanner.isBrowserInstruction('logout'), true);

  // Conversational requests
  assert.equal(browserPlanner.isBrowserInstruction('Open YouTube and search for Minecraft shaders'), true);
  assert.equal(browserPlanner.isBrowserInstruction('Navigate to github and scroll down'), true);
  assert.equal(browserPlanner.isBrowserInstruction('Zoom out on this tab'), true);

  // Unrelated chat
  assert.equal(browserPlanner.isBrowserInstruction('How are you doing today?'), false);
  assert.equal(browserPlanner.isBrowserInstruction('Tell me a funny joke'), false);
});

test('2. Deterministic Fast-Path Parsing (1-Word Instructions)', () => {
  // YouTube
  const ytPlan = browserPlanner.parseFastPath('YouTube');
  assert.deepEqual(ytPlan, [{ action: 'tab_open', params: { url: 'https://youtube.com' } }]);

  // Back
  const backPlan = browserPlanner.parseFastPath('Back');
  assert.deepEqual(backPlan, [{ action: 'navigate_back', params: {} }]);

  // Zoom Out
  const zoomPlan = browserPlanner.parseFastPath('zoom out');
  assert.deepEqual(zoomPlan, [{ action: 'zoom_out', params: { step: 0.1 } }]);

  // Clean Tabs
  const cleanPlan = browserPlanner.parseFastPath('clean');
  assert.deepEqual(cleanPlan, [{ action: 'tabs_clean', params: {} }]);

  // Copy
  const copyPlan = browserPlanner.parseFastPath('copy');
  assert.deepEqual(copyPlan, [{ action: 'page_select_copy', params: {} }]);

  // Logout
  const logoutPlan = browserPlanner.parseFastPath('logout');
  assert.deepEqual(logoutPlan, [{ action: 'logout_request', params: {} }]);

  // Research <subject>
  const researchPlan = browserPlanner.parseFastPath('research quantum computing');
  assert.equal(researchPlan.length, 2);
  assert.equal(researchPlan[0].action, 'tab_open');
  assert.match(researchPlan[0].params.url, /quantum%20computing/);
  assert.equal(researchPlan[1].action, 'page_read');
});

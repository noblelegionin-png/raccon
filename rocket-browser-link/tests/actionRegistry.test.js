import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_REGISTRY, validateAction, ACTION_RISK_TIERS } from '../../src/browser/actionRegistry.js';

test('1. Action Registry Schema Completeness', () => {
  const expectedActions = [
    'tab_open', 'tab_close', 'tab_switch', 'tab_duplicate', 'tab_pin', 'tab_list', 'tabs_clean',
    'navigate', 'navigate_back', 'navigate_forward', 'reload', 'stop',
    'zoom_in', 'zoom_out', 'zoom_reset', 'zoom_set',
    'page_read', 'page_click', 'page_type', 'page_scroll', 'page_select_copy', 'page_search', 'page_form_fill',
    'history_search', 'bookmarks_search', 'bookmarks_add',
    'downloads_list', 'download_file', 'window_fullscreen',
    'logout_request', 'consequential_action',
  ];

  for (const id of expectedActions) {
    assert.ok(ACTION_REGISTRY[id], `Action ${id} should exist in registry`);
    assert.ok(ACTION_REGISTRY[id].category, `Action ${id} must specify a category`);
    assert.ok(ACTION_REGISTRY[id].risk, `Action ${id} must have a risk tier`);
  }
});

test('2. Parameter Validation & Boundary Guardrails', () => {
  // tab_open defaults
  const tabRes = validateAction('tab_open', {});
  assert.equal(tabRes.params.url, 'https://google.com');

  // navigate requires url
  assert.throws(() => validateAction('navigate', {}), /Target URL or search query is required/);

  // zoom_set validates boundaries
  const zoomNormal = validateAction('zoom_set', { factor: 1.5 });
  assert.equal(zoomNormal.params.factor, 1.5);
  assert.throws(() => validateAction('zoom_set', { factor: 10.0 }), /must be between 0.2 and 3.0/);

  // page_click requires targeting
  assert.throws(() => validateAction('page_click', {}), /Click requires a selector/);

  // page_type requires text
  assert.throws(() => validateAction('page_type', {}), /Text to type is required/);
});

test('3. Risk Classification & Confirmation Tiers', () => {
  // Low-risk autonomous actions
  assert.equal(validateAction('tab_open', { url: 'https://youtube.com' }).risk, ACTION_RISK_TIERS.LOW);
  assert.equal(validateAction('zoom_out', {}).risk, ACTION_RISK_TIERS.LOW);
  assert.equal(validateAction('page_read', {}).risk, ACTION_RISK_TIERS.LOW);

  // High-risk confirmation required
  assert.equal(validateAction('logout_request', {}).risk, ACTION_RISK_TIERS.HIGH);
  assert.equal(validateAction('consequential_action', { description: 'Delete account' }).risk, ACTION_RISK_TIERS.HIGH);
});

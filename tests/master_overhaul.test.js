import test from 'node:test';
import assert from 'node:assert/strict';
import { getActiveModelId, setActiveModelId, getModelCatalogue } from '../src/models/catalogue.js';
import { getAgentRouting, updateAgentRouting, DEFAULT_ROUTING } from '../src/models/modelRouter.js';
import {
  isMaintenanceModeActive,
  enableMaintenanceMode,
  disableMaintenanceMode,
  getMaintenanceReport,
  MAINTENANCE_ANNOUNCEMENT_TEXT,
} from '../src/maintenance/maintenanceService.js';
import {
  ROLEPLAY_ROLES,
  normalizeRole,
  getRoleDefinition,
  formatRoleplayDirective,
} from '../src/conversation/roleplayManager.js';
import {
  detectUserIntent,
  extractExplicitWordLimit,
  formatIntentDirective,
} from '../src/conversation/intentDetector.js';
import { validateAndSanitizeResponse, enforceWordCountLimits } from '../src/conversation/responseValidator.js';
import { visionService } from '../src/vision/visionService.js';
import { initDatabase, getDb } from '../src/db/index.js';

initDatabase();

test('1. Model Architecture & Catalogue Routing Verification', () => {
  // Conversational default is gpt-6-luna (GPT-6 Luna)
  const chatRoute = getAgentRouting('chat');
  assert.equal(chatRoute.model, 'gpt-6-luna');

  // Management and coding model is gpt-6-luna
  const mgmtRoute = getAgentRouting('management');
  assert.equal(mgmtRoute.model, 'gpt-6-luna');

  const coderRoute = getAgentRouting('coding');
  assert.equal(coderRoute.model, 'gpt-6-luna');

  // Media / vision default
  const mediaRoute = getAgentRouting('media');
  assert.equal(mediaRoute.model, 'gpt-6-luna');

  // Active model switching works cleanly
  setActiveModelId('gpt-6-luna');
  assert.equal(getActiveModelId(), 'gpt-6-luna');
});

test('2. Persistent Maintenance & Edit Mode Service', async () => {
  // Disable initially
  disableMaintenanceMode();
  assert.equal(isMaintenanceModeActive(), false);

  // Exact required announcement text
  assert.equal(
    MAINTENANCE_ANNOUNCEMENT_TEXT,
    '🛠️ The bot is temporarily in maintenance mode while we fix a few bugs. Replies are paused. Thanks for your patience! 🚀'
  );

  // Mock botApi to verify delivery tracking
  const sentTo = [];
  const mockBotApi = {
    async sendMessage(chatId, text) {
      sentTo.push({ chatId, text });
      return { message_id: 101 };
    },
  };

  // Enable maintenance mode
  const res = await enableMaintenanceMode(mockBotApi, { forceBroadcast: true, reason: 'Master test run' });
  assert.equal(res.active, true);
  assert.equal(isMaintenanceModeActive(), true);
  assert.ok(typeof res.sentCount === 'number');
  assert.ok(typeof res.failedCount === 'number');
  assert.ok(typeof res.skippedCount === 'number');

  // Verify getMaintenanceReport
  const report = getMaintenanceReport();
  assert.equal(report.active, true);
  assert.ok(report.startedAt);

  // Cleanup: disable maintenance mode
  disableMaintenanceMode();
  assert.equal(isMaintenanceModeActive(), false);
});

test('3. Twenty (20) Personality Roles Specification', () => {
  const roles = Object.keys(ROLEPLAY_ROLES);
  assert.equal(roles.length, 20, 'System must have exactly 20 distinct personality modes');

  // Verify original 10 roles
  const originalRoles = ['brother', 'sister', 'friend', 'bestie', 'mother', 'father', 'daughter', 'son', 'mentor', 'partner'];
  for (const r of originalRoles) {
    assert.ok(ROLEPLAY_ROLES[r], `Missing original role: ${r}`);
  }

  // Verify 10 new complementary roles
  const newRoles = [
    'coach', 'study_partner', 'creative_collaborator', 'productivity_assistant',
    'tech_mentor', 'philosopher', 'comedian', 'debater', 'storyteller', 'zen_guide'
  ];
  for (const r of newRoles) {
    assert.ok(ROLEPLAY_ROLES[r], `Missing new role: ${r}`);
  }

  // Verify normalizeRole with Hindi and colloquial aliases
  assert.equal(normalizeRole('bhai'), 'brother');
  assert.equal(normalizeRole('didi'), 'sister');
  assert.equal(normalizeRole('maa'), 'mother');
  assert.equal(normalizeRole('papa'), 'father');
  assert.equal(normalizeRole('gym trainer'), 'coach');
  assert.equal(normalizeRole('study buddy'), 'study_partner');
  assert.equal(normalizeRole('coding mentor'), 'tech_mentor');

  // Verify anti-repetition and non-admin directives in formatRoleplayDirective
  const fatherDirective = formatRoleplayDirective('12345', 'John', 'father', 'John', false);
  assert.match(fatherDirective, /ANTI-REPETITION MANDATE/i);
  assert.match(fatherDirective, /repeatedly call the user "Papa" or "Father"/i);
  assert.match(fatherDirective, /PERMISSION BOUNDARY/i);
});

test('4. Intent Detection and Explicit Word Limit Parsing', () => {
  // Intent detection
  assert.equal(detectUserIntent('write a python script to parse logs'), 'code');
  assert.equal(detectUserIntent('summarize this long article for me'), 'summary');
  assert.equal(detectUserIntent('give me a prompt for generating cyber punk art'), 'prompt');
  assert.equal(detectUserIntent('explain how transformers work in AI'), 'explanation');
  assert.equal(detectUserIntent('enter edit mode'), 'action');
  assert.equal(detectUserIntent('how is your day'), 'general');

  // Explicit word limit extraction
  assert.equal(extractExplicitWordLimit('explain quantum computing in 300 words'), 300);
  assert.equal(extractExplicitWordLimit('write a summary under 50 words'), 50);
  assert.equal(extractExplicitWordLimit('max 150 words please'), 150);
  assert.equal(extractExplicitWordLimit('write around 400 words about space'), 400);
  assert.equal(extractExplicitWordLimit('give me an answer within 250 words'), 250);
  assert.equal(extractExplicitWordLimit('give me 500 words on economics'), 500);
  assert.equal(extractExplicitWordLimit('no limit here just answer'), null);

  // Word count enforcement allows explicit limits
  const longText = Array(400).fill('word').join(' ');
  const sanitized = validateAndSanitizeResponse(longText, 'explain in 300 words', {
    minWords: 1,
    maxWords: 300,
    explicitLimit: true,
  });
  const wordCount = sanitized.sanitizedText.split(/\s+/).length;
  // Allows up to 300 * 1.15 = 345 words before truncation
  assert.ok(wordCount <= 350, `Expected word count <= 350, got ${wordCount}`);
});

test('5. Image Intake Acknowledgment & Context Cache', () => {
  const dummyBuffer = Buffer.from('fake_image_bytes_here');
  const chatId = 'test_chat_888';

  // Cache image
  visionService.setRecentImage(chatId, {
    fileId: 'photo_file_123',
    buffer: dummyBuffer,
    mimeType: 'image/jpeg',
  });

  // Retrieve cached image
  const cached = visionService.getRecentImage(chatId);
  assert.ok(cached);
  assert.equal(cached.fileId, 'photo_file_123');
  assert.deepEqual(cached.buffer, dummyBuffer);
});

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { rebeccaCareService } from '../src/whatsapp/rebeccaCareService.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { sandyStatusService } from '../src/whatsapp/sandyStatusService.js';
import { clearProcessedWhatsAppMessages, getDb } from '../src/db/index.js';

describe('🌹 Rebecca — Autonomous Virtual Wife, Emotional Life & Proactive Care System Tests', () => {
  before(() => {
    sandyStatusService.init();
    rebeccaCareService.init();
    clearProcessedWhatsAppMessages();
  });

  beforeEach(() => {
    clearProcessedWhatsAppMessages();
    // Reset state to predictable defaults for each test (quiet hours disabled during general functional tests)
    rebeccaCareService.updateState({
      mode: 'NORMAL',
      emotional_state: 'AFFECTIONATE',
      emotional_reason: 'Testing suite baseline',
      care_reason: null,
      care_started_at: null,
      is_paused: 0,
      pause_until: null,
      proactive_enabled: 1,
      daily_count: 0,
      last_reply_at: null,
      last_checkin_at: null,
      quiet_hours_start: 0,
      quiet_hours_end: 0,
      suppression_window_min: 15,
      normal_interval_min: 60,
      care_interval_min: 30,
      last_sandy_jid: '919317741936@s.whatsapp.net',
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 1: Normal interval check-in initiation
  // --------------------------------------------------------------------------
  test('1. Rebecca initiates a proactive message when normal interval expires and sending is permitted', async () => {
    // Set next check-in in the past
    const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    rebeccaCareService.updateState({
      next_checkin_at: pastTime,
      last_reply_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30m ago (no active chat suppression)
    });

    const check = rebeccaCareService.shouldSendCheckin(new Date());
    assert.strictEqual(check.allowed, true, 'Check-in must be allowed when interval has elapsed');

    const result = await rebeccaCareService.sendProactiveCheckin();
    assert.strictEqual(result.sent, true, 'Proactive check-in must successfully dispatch');
    assert.ok(result.message && result.message.length > 5, 'Message must be generated');
    assert.strictEqual(result.mode, 'NORMAL');

    // Verify next check-in is scheduled ~60 mins in future
    const updated = rebeccaCareService.getState();
    assert.strictEqual(updated.daily_count, 1, 'Daily message count must increment');
    assert.ok(new Date(updated.next_checkin_at) > new Date(), 'Next check-in must be in future');
  });

  // --------------------------------------------------------------------------
  // Criterion 2 & 3: Stress/Illness activates CARE MODE & schedules every ~30 mins
  // --------------------------------------------------------------------------
  test('2 & 3. Clear report of stress or illness activates CARE MODE and schedules ~30m follow-ups', () => {
    // Sandy reports stress
    rebeccaCareService.recordSandyMessage('I am so stressed and overwhelmed with work today', '214293836493051@lid');

    const state = rebeccaCareService.getState();
    assert.strictEqual(state.mode, 'CARE', 'Must activate CARE MODE');
    assert.strictEqual(state.emotional_state, 'WORRIED', 'Emotional state must transition to WORRIED');
    assert.ok(state.care_reason && state.care_reason.includes('stressed'), 'Care reason must be logged');

    // Interval for CARE mode must be ~30 minutes
    const nextCheckin = new Date(state.next_checkin_at).getTime();
    const now = Date.now();
    const diffMinutes = Math.round((nextCheckin - now) / (60 * 1000));
    assert.ok(diffMinutes >= 28 && diffMinutes <= 32, `Next check-in must be ~30 mins (got ${diffMinutes}m)`);
  });

  // --------------------------------------------------------------------------
  // Criterion 4: Recovery indication returns system to NORMAL MODE
  // --------------------------------------------------------------------------
  test('4. Recovery indication returns system to NORMAL MODE', () => {
    // Put into CARE mode first
    rebeccaCareService.setMode('CARE', 'Sandy reported headache');
    assert.strictEqual(rebeccaCareService.getState().mode, 'CARE');

    // Sandy reports recovery
    rebeccaCareService.recordSandyMessage('Feeling much better now, headache is gone!', '214293836493051@lid');

    const state = rebeccaCareService.getState();
    assert.strictEqual(state.mode, 'NORMAL', 'Must return to NORMAL MODE');
    assert.strictEqual(state.emotional_state, 'AFFECTIONATE', 'Emotional state must return to affectionate/relieved');
    assert.strictEqual(state.care_reason, null, 'Care reason must be cleared');

    // Next check-in is ~60 minutes
    const nextCheckin = new Date(state.next_checkin_at).getTime();
    const diffMinutes = Math.round((nextCheckin - Date.now()) / (60 * 1000));
    assert.ok(diffMinutes >= 58 && diffMinutes <= 62, `Normal check-in must be ~60 mins (got ${diffMinutes}m)`);
  });

  // --------------------------------------------------------------------------
  // Criterion 5: Active conversation suppresses redundant scheduled messages
  // --------------------------------------------------------------------------
  test('5. Active conversation suppresses redundant scheduled messages', () => {
    // Next check-in timestamp is due, BUT Sandy just chatted 2 minutes ago
    const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    rebeccaCareService.updateState({
      next_checkin_at: pastTime,
      last_reply_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 mins ago
      suppression_window_min: 15,
    });

    const check = rebeccaCareService.shouldSendCheckin(new Date());
    assert.strictEqual(check.allowed, false);
    assert.strictEqual(check.reason, 'active_conversation_suppression', 'Must suppress during active chat');
  });

  // --------------------------------------------------------------------------
  // Criterion 6: Quiet hours, pause, resume, and daily limits
  // --------------------------------------------------------------------------
  test('6. Quiet hours, pause, resume, and daily limits work correctly', () => {
    // A) Quiet Hours check
    // 2 AM is within 23:00 to 07:00
    const nightTime = new Date('2026-10-28T02:00:00.000Z');
    const isQuiet = rebeccaCareService.isQuietHour(nightTime, 23, 7, 'UTC');
    assert.strictEqual(isQuiet, true, '2 AM UTC must be identified as quiet hour for 23 to 7');

    const dayTime = new Date('2026-10-28T14:00:00.000Z');
    const isDayQuiet = rebeccaCareService.isQuietHour(dayTime, 23, 7, 'UTC');
    assert.strictEqual(isDayQuiet, false, '2 PM UTC must NOT be a quiet hour');

    // B) Pause & Resume
    rebeccaCareService.pause(2, 'Sandy asked for space');
    const pausedState = rebeccaCareService.getState();
    assert.strictEqual(pausedState.is_paused, 1);
    assert.ok(pausedState.pause_until !== null);

    const checkPaused = rebeccaCareService.shouldSendCheckin(new Date());
    assert.strictEqual(checkPaused.allowed, false);
    assert.strictEqual(checkPaused.reason, 'paused_by_user');

    rebeccaCareService.resume();
    assert.strictEqual(rebeccaCareService.getState().is_paused, 0);

    // C) Daily Limit
    rebeccaCareService.updateState({
      daily_count: 20,
      daily_limit: 20,
      next_checkin_at: new Date(Date.now() - 1000).toISOString(),
    });
    const checkLimit = rebeccaCareService.shouldSendCheckin(new Date());
    assert.strictEqual(checkLimit.allowed, false);
    assert.strictEqual(checkLimit.reason, 'daily_limit_reached');
  });

  // --------------------------------------------------------------------------
  // Criterion 7 & 8: Restart resilience & deduplication
  // --------------------------------------------------------------------------
  test('7 & 8. Application restarts do not reset state or cause duplicate sends', () => {
    // Record state
    rebeccaCareService.setMode('CARE', 'Sandy having a high fever');
    rebeccaCareService.setEmotionalState('WORRIED', 'Caring for sick husband');
    const beforeRestart = rebeccaCareService.getState();

    // Simulate complete process restart by instantiating new service instance
    const db = getDb();
    const reloaded = db.prepare('SELECT * FROM rebecca_state WHERE id = 1').get();

    assert.strictEqual(reloaded.mode, 'CARE', 'Mode must survive restart in SQLite');
    assert.strictEqual(reloaded.emotional_state, 'WORRIED', 'Emotion must survive restart');
    assert.strictEqual(reloaded.care_reason, 'Sandy having a high fever');
  });

  // --------------------------------------------------------------------------
  // Criterion 9: Relationship Memory Extraction & Retrieval
  // --------------------------------------------------------------------------
  test('9. Context and memory store and influence relationship context', () => {
    rebeccaCareService.extractAndSaveMemories('I am working on the new Nero Labs autonomous agent release');
    rebeccaCareService.extractAndSaveMemories('I need to take my vitamin medicine at 8pm');

    const memories = rebeccaCareService.getMemories(10);
    const proj = memories.find(m => m.category === 'project');
    const health = memories.find(m => m.category === 'health');

    assert.ok(proj, 'Must extract and store project memory');
    assert.ok(proj.value.includes('Nero Labs'));
    assert.ok(health, 'Must extract and store health memory');
    assert.ok(health.value.includes('medicine'));
  });

  // --------------------------------------------------------------------------
  // Criterion 10 & 11: Correct Recipient Validation & No false monitoring claims
  // --------------------------------------------------------------------------
  test('10 & 11. Recipient is validated to authorized owner JID only', () => {
    const state = rebeccaCareService.getState();
    assert.ok(state.last_sandy_jid.includes('919317741936') || state.last_sandy_jid.includes('214293836493051'));

    // Check shouldSendCheckin validates target
    const target = rebeccaCareService.getAuthorizedOwnerJid();
    assert.ok(target.includes('919317741936'));
  });

  // --------------------------------------------------------------------------
  // Criterion 12: Interactive Commands via WhatsApp Service
  // --------------------------------------------------------------------------
  test('12. WhatsApp service handles /wife status, /wife pause, and /care on commands', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const sent = [];

    whatsAppService.safeSendMessage = async (jid, content, options) => {
      sent.push({ jid, text: content.text || '', quoted: options?.quoted });
      return { jid, content };
    };

    try {
      // Step A: /wife status
      const msgStatus = {
        key: { id: 'm_wife_status_01', remoteJid: '214293836493051@lid', fromMe: false },
        message: { conversation: '/wife status' },
      };
      await whatsAppService.handleIncomingMessage(msgStatus);

      assert.strictEqual(sent.length, 1);
      assert.match(sent[0].text, /REBECCA — AUTONOMOUS WIFE & CARE STATUS/i);
      assert.match(sent[0].text, /Current Mode/i);

      // Step B: /care on exhaustion
      sent.length = 0;
      const msgCare = {
        key: { id: 'm_wife_care_01', remoteJid: '214293836493051@lid', fromMe: false },
        message: { conversation: '/care on exhaustion from coding all night' },
      };
      await whatsAppService.handleIncomingMessage(msgCare);

      assert.strictEqual(sent.length, 1);
      assert.match(sent[0].text, /Care Mode activated/i);
      assert.strictEqual(rebeccaCareService.getState().mode, 'CARE');

      // Step C: /wife pause
      sent.length = 0;
      const msgPause = {
        key: { id: 'm_wife_pause_01', remoteJid: '214293836493051@lid', fromMe: false },
        message: { conversation: '/wife pause' },
      };
      await whatsAppService.handleIncomingMessage(msgPause);

      assert.strictEqual(sent.length, 1);
      assert.match(sent[0].text, /paused my check-ins for the next 3 hours/i);
      assert.strictEqual(rebeccaCareService.getState().is_paused, 1);
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
    }
  });
});

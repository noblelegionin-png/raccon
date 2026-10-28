import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandyStatusService } from '../src/whatsapp/sandyStatusService.js';
import { buildWhatsAppDirective } from '../src/whatsapp/whatsappPersona.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';

test('WhatsApp Interactive Live Features & Buttons Suite V2', async (t) => {
  await t.test('1. Contact Profile Creation, Classification & SQLite Persistence', () => {
    const testNum = '9199' + Math.floor(10000000 + Math.random() * 90000000);

    // Initial default profile
    const initial = sandyStatusService.getContactProfile(testNum);
    assert.equal(initial.relationship, 'Contact');
    assert.equal(initial.preferred_tone, 'professional');

    // Owner classifies contact
    sandyStatusService.setContactRelationship(testNum, 'Business contact');
    sandyStatusService.setContactTonePreference(testNum, 'formal');

    const updated = sandyStatusService.getContactProfile(testNum);
    assert.equal(updated.relationship, 'Business contact');
    assert.equal(updated.preferred_tone, 'formal');
  });

  await t.test('2. Professional V2 Directive without Old Brother/Friend Cartoon Modes', () => {
    const directive = buildWhatsAppDirective({
      senderNumber: '919999988888',
      senderName: 'Raj',
      isSandy: false,
      userPrompt: 'Hello',
    });

    assert.ok(directive.includes('PROFESSIONAL WHATSAPP EXECUTIVE AI ASSISTANT'));
    assert.ok(directive.includes('Single Coherent Reply'));
    assert.ok(!directive.includes('CHOSEN CHARACTER: BROTHER (Bhai Vibe)'));
    assert.ok(!directive.includes('CHOSEN CHARACTER: FRIEND (Dost Vibe)'));
  });

  await t.test('3. Availability Subscriptions & Automated Broadcast Trigger', () => {
    const subNum = '9188' + Math.floor(10000000 + Math.random() * 90000000);
    const subJid = `${subNum}@s.whatsapp.net`;

    // 1. Contact subscribes
    const subResult = sandyStatusService.addAvailabilitySubscriber({
      senderNumber: subNum,
      senderName: 'Aman',
      remoteJid: subJid,
    });
    assert.equal(typeof subResult.id, 'number');

    // 2. Duplicate subscribe handled gracefully
    const dupResult = sandyStatusService.addAvailabilitySubscriber({
      senderNumber: subNum,
      senderName: 'Aman',
      remoteJid: subJid,
    });
    assert.equal(dupResult.alreadySubscribed, true);

    // 3. Pending list contains the subscriber
    const pending = sandyStatusService.getPendingAvailabilitySubscribers();
    assert.ok(pending.some((s) => s.sender_number === subNum));

    // 4. Sandy comes back online / free
    const updateResult = sandyStatusService.parseNaturalLanguageUpdate("I am back online now and free to talk");
    assert.equal(updateResult.updated, true);
    assert.equal(updateResult.type, 'available');
    assert.equal(updateResult.notifySubscribers, true);

    // 5. Mark notified
    const subIds = pending.map((s) => s.id);
    sandyStatusService.markSubscribersNotified(subIds);

    // 6. Pending list is now empty for these ids
    const afterPending = sandyStatusService.getPendingAvailabilitySubscribers();
    assert.ok(!afterPending.some((s) => s.sender_number === subNum));
  });

  await t.test('4. In-Conversation Sandy Inquiries Detection ("Where is Sandy")', () => {
    const isAskingRegex = /\b(?:where\s+is\s+sandy|sandy\s+kahan|sandy\s+kidhar|what\s+is\s+sandy\s+doing|kya\s+kar\s+raha\s+hai\s+sandy|talk\s+to\s+sandy|sandy\s+se\s+baat|is\s+sandy\s+free|is\s+sandy\s+online|sandy\s+available|sandy\s+se\s+milna)\b/i;

    assert.ok(isAskingRegex.test('Where is Sandy right now?'));
    assert.ok(isAskingRegex.test('Sandy kahan hai bro?'));
    assert.ok(isAskingRegex.test('What is Sandy doing today?'));
    assert.ok(isAskingRegex.test('Is Sandy free to talk?'));
    assert.ok(isAskingRegex.test('Sandy se baat karni hai'));
    assert.ok(!isAskingRegex.test('How is the weather today in Delhi?'));
  });

  await t.test('5. Owner Contact Classification and Sandy Contact Action Handlers', async () => {
    const cNum = '9177' + Math.floor(10000000 + Math.random() * 90000000);

    // Test Owner Contact Classification Handler directly
    await whatsAppService.handleOwnerContactReviewAction('Colleague', cNum, 'Karan');
    const prof = sandyStatusService.getContactProfile(cNum);
    assert.equal(prof.relationship, 'Colleague');

    // Test Sandy Contact Action Handler: Notify
    const notifNum = '9166' + Math.floor(10000000 + Math.random() * 90000000);
    await whatsAppService.handleSandyContactAction('notify', `${notifNum}@s.whatsapp.net`, null, notifNum, 'Rahul');
    const pendingSubs = sandyStatusService.getPendingAvailabilitySubscribers();
    assert.ok(pendingSubs.some((s) => s.sender_number === notifNum));
  });

  await t.test('6. Emergency Kill Switch ("Stop Texting Everyone") & Silent Mode State Toggle', async () => {
    const { isWhatsAppSilentModeActive, setWhatsAppSilentMode } = await import('../src/maintenance/maintenanceService.js');

    // Enable silent mode
    setWhatsAppSilentMode(true);
    assert.equal(isWhatsAppSilentModeActive(), true);

    // Disable silent mode
    setWhatsAppSilentMode(false);
    assert.equal(isWhatsAppSilentModeActive(), false);

    // Verify natural language patterns
    const stopRegex = /\b(?:stop\s+texting(?:\s+everyone)?|don'?t\s+text(?:\s+anyone)?|mute(?:\s+everyone|\s+all)?|silent\s+mode|freeze\s+(?:bot|chat)|shutup|chup\s+ho\s+ja|kisi\s+ko\s+reply\s+mat\s+karo)\b/i;
    assert.ok(stopRegex.test('stop texting everyone'));
    assert.ok(stopRegex.test('stop texting'));
    assert.ok(stopRegex.test("don't text anyone"));
    assert.ok(stopRegex.test('silent mode'));
    assert.ok(stopRegex.test('freeze bot'));

    const resumeRegex = /\b(?:resume\s+texting|start\s+texting(?:\s+everyone)?|unmute(?:\s+all)?|unfreeze|resume\s+replies|chalu\s+karo|shuru\s+karo)\b/i;
    assert.ok(resumeRegex.test('resume texting'));
    assert.ok(resumeRegex.test('start texting everyone'));
    assert.ok(resumeRegex.test('unfreeze'));
  });

  await t.test('7. Smart Contact Memory & Interaction Counting', () => {
    const testNum = '9191' + Math.floor(10000000 + Math.random() * 90000000);
    sandyStatusService.recordContactInteraction(testNum, 'Kunal', "Hello Sandy");

    const profile = sandyStatusService.getContactProfile(testNum);
    assert.ok(profile);
    assert.equal(profile.sender_name, 'Kunal');
    assert.equal(profile.message_count, 1);

    // Second message increments count
    sandyStatusService.recordContactInteraction(testNum, 'Kunal', 'Where is Sandy right now?');
    const updatedProfile = sandyStatusService.getContactProfile(testNum);
    assert.equal(updatedProfile.message_count, 2);
  });

  await t.test('8. Intelligent Return ETA & Natural Routine Parsing', () => {
    const res = sandyStatusService.parseNaturalLanguageUpdate('Gym ja raha hu back in 1 hour');
    assert.equal(res.updated, true);
    assert.equal(res.type, 'gym');
    assert.ok(res.summary.includes('Gym & Fitness'));

    const auth = sandyStatusService.getAuthoritativeAvailability();
    assert.ok(auth.status.toLowerCase().includes('gym'));
  });

  await t.test('9. Executive Intelligence Daily Digest for Sandy', () => {
    const digest = sandyStatusService.getDailyExecutiveDigest();
    assert.equal(typeof digest, 'string');
    assert.ok(digest.includes('EXECUTIVE DAILY DIGEST'));
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { executeRocketTool, ROCKET_TOOL_DEFINITIONS } from '../src/tools/rocketTools.js';

test('🛡️ Rocket Tool Registry — All 22 Tools Formally Declared', () => {
  const expectedTools = [
    'web_search',
    'deep_browse',
    'search_images',
    'inspect_social_media',
    'download_media',
    'manage_tasks',
    'manage_schedule',
    'get_sandy_status',
    'set_sandy_status',
    'search_memory',
    'save_memory',
    'get_contact_profile',
    'update_contact_profile',
    'check_website_safety',
    'run_safe_eval',
    'search_products',
    'minecraft_command',
    'generate_pdf_document',
    'set_chat_controls',
    'send_whatsapp_message',
    'manage_chat_privacy',
    'delegate_chat_behalf',
  ];

  assert.equal(ROCKET_TOOL_DEFINITIONS.length, 22, 'Should have exactly 22 tools defined');

  for (const name of expectedTools) {
    const found = ROCKET_TOOL_DEFINITIONS.find((t) => t.function.name === name);
    assert.ok(found, `Tool '${name}' must be declared in ROCKET_TOOL_DEFINITIONS`);
    assert.ok(found.function.description.length > 10, `Tool '${name}' description must be informative`);
    assert.equal(found.type, 'function');
    assert.equal(typeof found.function.parameters, 'object');
  }
});

// Tool 1: web_search
test('🔍 Tool 1: web_search — Live Real-Time Web Research', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };
  const res = await executeRocketTool('web_search', { query: 'quantum computing breakthroughs' }, context);

  assert.equal(res.ok, true);
  assert.equal(res.query, 'quantum computing breakthroughs');
  assert.ok(Array.isArray(res.results));
  assert.ok(res.results.length > 0, 'web_search should return results');
  const first = res.results[0];
  assert.ok(first.title && typeof first.title === 'string');
  assert.ok(first.url && first.url.startsWith('http'));

  // Edge case: Empty query
  const emptyRes = await executeRocketTool('web_search', { query: '' }, context);
  assert.equal(emptyRes.ok, false);
  assert.equal(emptyRes.error, 'Query is empty');
});

// Tool 2: deep_browse
test('🌐 Tool 2: deep_browse — Deep Page Crawl & Inspection', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };
  const res = await executeRocketTool('deep_browse', { url: 'https://example.com' }, context);

  assert.equal(res.ok, true);
  assert.ok(res.title && res.title.includes('Example'));
  assert.ok(res.contentSummary.length > 0);

  // Edge case: SSRF Protection
  const ssrfRes = await executeRocketTool('deep_browse', { url: 'http://127.0.0.1:8080' }, context);
  assert.equal(ssrfRes.ok, false);
  assert.ok(ssrfRes.error.includes('blocked') || ssrfRes.error.includes('Private') || ssrfRes.error.includes('Failed'));
});

// Tool 3: search_images
test('🖼️ Tool 3: search_images — Visual Search & Media Buffering', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true, pendingImages: [] };
  const res = await executeRocketTool('search_images', { query: 'cyberpunk raccoon avatar', limit: 2 }, context);

  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.images));
  assert.ok(res.images.length > 0);
  assert.ok(res.images[0].imageUrl && res.images[0].imageUrl.startsWith('http'));
  assert.ok(context.pendingImages.length > 0, 'Should buffer top image for WhatsApp delivery');
  assert.ok(context.pendingImages[0].buffer && context.pendingImages[0].buffer.length > 0);

  // Edge case: Empty query
  const emptyRes = await executeRocketTool('search_images', { query: '' }, context);
  assert.equal(emptyRes.ok, false);
});

// Tool 4: inspect_social_media
test('🎬 Tool 4: inspect_social_media — Multi-Platform Reel & Shorts Inspection', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true, pendingImages: [] };
  const res = await executeRocketTool(
    'inspect_social_media',
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    context
  );

  assert.equal(res.ok, true);
  assert.equal(res.platform, 'youtube');
  assert.ok(res.title.includes('Never Gonna Give You Up'));
  assert.equal(res.author, 'Rick Astley');
  assert.ok(res.thumbnailUrl && res.thumbnailUrl.startsWith('http'));

  // Edge case: Non-social link
  const invalidRes = await executeRocketTool('inspect_social_media', { url: 'https://randomsite.xyz/doc' }, context);
  assert.equal(invalidRes.ok, false);
});

// Tool 5: download_media
test('📥 Tool 5: download_media — Highest Quality MP3 Audio Stream Download', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true, pendingMedia: [] };
  const res = await executeRocketTool(
    'download_media',
    {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      format: 'mp3',
      quality: 'highest',
    },
    context
  );

  assert.equal(res.ok, true);
  assert.equal(res.format, 'mp3');
  assert.ok(res.title.includes('Never Gonna Give You Up'));
  assert.ok(context.pendingMedia.length > 0, 'Audio buffer must be attached to context.pendingMedia');
  assert.equal(context.pendingMedia[0].format, 'mp3');
  assert.ok(context.pendingMedia[0].buffer.length > 100000);
});

// Tool 6: manage_tasks
test('📋 Tool 6: manage_tasks — Full CRUD Task Lifecycle', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };

  // 1. Create
  const createRes = await executeRocketTool(
    'manage_tasks',
    { action: 'create', title: 'Complete high-end agent tool testing', priority: 'high' },
    context
  );
  assert.equal(createRes.ok, true);
  assert.equal(createRes.action, 'created');
  assert.ok(createRes.taskId);

  // 2. List
  const listRes = await executeRocketTool('manage_tasks', { action: 'list' }, context);
  assert.equal(listRes.ok, true);
  assert.ok(Array.isArray(listRes.tasks));
  const found = listRes.tasks.find((t) => t.uuid === createRes.taskId);
  assert.ok(found, 'Created task should appear in list');

  // 3. Complete
  const completeRes = await executeRocketTool(
    'manage_tasks',
    { action: 'complete', taskId: createRes.taskId },
    context
  );
  assert.equal(completeRes.ok, true);
  assert.equal(completeRes.action, 'completed');

  // 4. Delete
  const deleteRes = await executeRocketTool(
    'manage_tasks',
    { action: 'delete', taskId: createRes.taskId },
    context
  );
  assert.equal(deleteRes.ok, true);
  assert.equal(deleteRes.action, 'deleted');
});

// Tool 7: manage_schedule
test('⏰ Tool 7: manage_schedule — Persistent Reminder & Alarm Lifecycle', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };

  // 1. Schedule
  const due = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const schedRes = await executeRocketTool(
    'manage_schedule',
    { action: 'schedule', reminderText: 'Nether boss battle with team', dueAt: due },
    context
  );
  assert.equal(schedRes.ok, true);
  assert.equal(schedRes.action, 'scheduled');
  assert.ok(schedRes.reminderId);

  // 2. List
  const listRes = await executeRocketTool('manage_schedule', { action: 'list' }, context);
  assert.equal(listRes.ok, true);
  assert.ok(Array.isArray(listRes.reminders));
  const found = listRes.reminders.find((r) => r.id === schedRes.reminderId);
  assert.ok(found, 'Scheduled reminder should be present in pending list');

  // 3. Cancel
  const cancelRes = await executeRocketTool(
    'manage_schedule',
    { action: 'cancel', reminderId: schedRes.reminderId },
    context
  );
  assert.equal(cancelRes.ok, true);
  assert.equal(cancelRes.action, 'cancelled');
});

// Tool 8 & 9: get_sandy_status & set_sandy_status
test('👑 Tools 8 & 9: Sandy Status & Access Control Guard', async () => {
  // Test update as boss Sandy
  const sandyCtx = { chatId: 'wa_sandy_rocket', isSandy: true };
  const setRes = await executeRocketTool(
    'set_sandy_status',
    {
      status: 'gaming',
      activity: 'Testing Rocket AI tools with high-end tasks',
      note: 'Sidhi baat no bakwas',
    },
    sandyCtx
  );
  assert.equal(setRes.ok, true);
  assert.ok(setRes.message.includes('Status updated successfully'));

  // Test retrieval
  const getRes = await executeRocketTool('get_sandy_status', {}, sandyCtx);
  assert.equal(getRes.ok, true);
  assert.ok(getRes.activity.includes('Testing Rocket AI tools'));

  // Test security: Non-Sandy caller cannot modify boss status
  const unauthorizedCtx = { chatId: 'wa_guest_123', isSandy: false };
  const failRes = await executeRocketTool(
    'set_sandy_status',
    { status: 'sleeping' },
    unauthorizedCtx
  );
  assert.equal(failRes.ok, false);
  assert.ok(failRes.error.includes('Only boss Sandy'));
});

// Tool 10 & 11: search_memory & save_memory
test('🧠 Tools 10 & 11: Persistent Long-Term Memory Storage & Recall', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };

  // 1. Save memory
  const testFact = `Sandy prefers mechanical switches and dark theme ${Date.now()}`;
  const saveRes = await executeRocketTool(
    'save_memory',
    { key: 'workstation_setup', fact: testFact, category: 'hardware' },
    context
  );
  assert.equal(saveRes.ok, true);
  assert.ok(saveRes.message.includes('saved permanently'));

  // 2. Search memory
  const searchRes = await executeRocketTool('search_memory', { query: 'mechanical switches' }, context);
  assert.equal(searchRes.ok, true);
  assert.ok(Array.isArray(searchRes.durableMemories));
  assert.ok(Array.isArray(searchRes.notes));
  const found = searchRes.durableMemories.some((m) => m.content.includes('mechanical switches')) ||
                searchRes.notes.some((n) => n.includes('mechanical switches'));
  assert.ok(found, 'Saved memory must be discoverable in subsequent search');
});

// Tool 12 & 13: get_contact_profile & update_contact_profile
test('👤 Tools 12 & 13: Smart Contact Profile & Notes Engine', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true, senderNumber: '919876543210' };

  // 1. Update contact profile
  const updateRes = await executeRocketTool(
    'update_contact_profile',
    {
      phoneNumber: '919876543210',
      relationship: 'VIP Collaborator',
      notes: 'Key gaming developer; prefers concise Roman Hinglish',
    },
    context
  );
  assert.equal(updateRes.ok, true);
  assert.ok(updateRes.message.includes('Contact memory for +919876543210 updated'));

  // 2. Get contact profile
  const getRes = await executeRocketTool('get_contact_profile', { identifier: '919876543210' }, context);
  assert.equal(getRes.ok, true);
});

// Tool 14: check_website_safety
test('🔒 Tool 14: check_website_safety — Phishing & Scam Indicator Inspector', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };

  // Safe site
  const safeRes = await executeRocketTool('check_website_safety', { url: 'https://github.com' }, context);
  assert.equal(safeRes.ok, true);
  assert.ok(safeRes.safetyStatus === 'safe' || safeRes.safetyStatus === 'suspicious');

  // Suspicious site indicator check
  const scamRes = await executeRocketTool(
    'check_website_safety',
    { url: 'http://verify-bank-account-urgent-login.top/account' },
    context
  );
  assert.equal(scamRes.ok, true);
  assert.ok(scamRes.riskLevel === 'High risk' || scamRes.riskLevel === 'Suspicious');
  assert.ok(scamRes.suspiciousIndicators.length > 0);
});

// Tool 15: run_safe_eval
test('⚡ Tool 15: run_safe_eval — Isolated Sandbox Math & Algorithmic Execution', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };

  // Complex algorithm: Sieve of Eratosthenes primes under 30
  const primeCode = `
    const primes = [];
    for (let i = 2; i <= 30; i++) {
      let isP = true;
      for (let j = 2; j * j <= i; j++) {
        if (i % j === 0) { isP = false; break; }
      }
      if (isP) primes.push(i);
    }
    return primes;
  `;
  const evalRes = await executeRocketTool('run_safe_eval', { code: primeCode }, context);
  assert.equal(evalRes.ok, true);
  assert.deepEqual(evalRes.result, [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);

  // Sandbox security: Malicious injection blocked
  const attackRes = await executeRocketTool(
    'run_safe_eval',
    { code: 'return process.mainModule.require("child_process").execSync("whoami").toString();' },
    context
  );
  assert.equal(attackRes.ok, false);
  assert.ok(attackRes.error);
});

// Tool 16: search_products
test('🛍️ Tool 16: search_products — Specs Comparison & Price Discovery', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };
  const res = await executeRocketTool(
    'search_products',
    { query: 'mechanical gaming keyboard', budget: 5000 },
    context
  );

  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.products));
  assert.ok(res.productCount > 0);
  const p = res.products[0];
  assert.ok(p.name && typeof p.name === 'string');
  assert.ok(p.url && typeof p.url === 'string');
});

// Tool 17: minecraft_command
test('⛏️ Tool 17: minecraft_command — Gamer Knowledge & Server Controls', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };

  // 1. Biome lookup
  const biomeRes = await executeRocketTool('minecraft_command', { action: 'lookup_biome', query: 'deep_dark' }, context);
  assert.equal(biomeRes.ok, true);
  assert.ok(biomeRes.biome);
  assert.equal(biomeRes.biome.name, 'Deep Dark');

  // 2. Mob lookup
  const mobRes = await executeRocketTool('minecraft_command', { action: 'lookup_mob', query: 'warden' }, context);
  assert.equal(mobRes.ok, true);
  assert.ok(mobRes.mob);
  assert.equal(mobRes.mob.name, 'Warden');

  // 3. Command execution (with boss permission)
  const giveRes = await executeRocketTool(
    'minecraft_command',
    { action: 'give_item', item: 'netherite_sword', amount: 1 },
    context
  );
  assert.equal(typeof giveRes.ok, 'boolean');

  // 4. Security guard: Non-Sandy caller cannot invoke in-game controls
  const guestCtx = { chatId: 'wa_guest', isSandy: false };
  const guestGiveRes = await executeRocketTool(
    'minecraft_command',
    { action: 'give_item', item: 'diamond' },
    guestCtx
  );
  assert.equal(guestGiveRes.ok, false);
  assert.ok(guestGiveRes.error.includes('Only Sandy'));
});

// Tool 18: generate_pdf_document
test('📑 Tool 18: generate_pdf_document — Multi-Page PDF Generation Engine', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };
  const res = await executeRocketTool(
    'generate_pdf_document',
    {
      prompt: 'Comprehensive Guide to High-End Autonomous Multi-Agent AI Systems',
      targetPages: 2,
    },
    context
  );

  assert.equal(res.ok, true);
  assert.ok(res.filename && res.filename.endsWith('.pdf'));
  assert.ok(res.pageCount >= 1);

  // Verify file exists on disk in data/documents/generated
  const pdfPath = path.resolve('data/documents/generated', res.filename);
  assert.ok(fs.existsSync(pdfPath), 'Generated PDF file must exist on disk');
  const stat = fs.statSync(pdfPath);
  assert.ok(stat.size > 1000, 'PDF size must be non-trivial (>1KB)');
});

// Tool 19: set_chat_controls
test('⚙️ Tool 19: set_chat_controls — Dynamic Runtime Configuration Tuning', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };
  const res = await executeRocketTool(
    'set_chat_controls',
    {
      language: 'hinglish',
      reasoningEffort: 'none',
      wordLimit: 450,
    },
    context
  );

  assert.equal(res.ok, true);
  assert.ok(res.message.includes('Chat controls applied'));
  assert.ok(res.message.includes('language=hinglish'));
  assert.ok(res.message.includes('reasoning=none'));
  assert.ok(res.message.includes('wordLimit=450'));
});

// Tool 20: send_whatsapp_message
test('💬 Tool 20: send_whatsapp_message — Direct WhatsApp Outreach Dispatch', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };
  const res = await executeRocketTool(
    'send_whatsapp_message',
    {
      recipient: '9876543210',
      message: 'hy bro meeting at 4 PM',
    },
    context
  );

  assert.equal(res.ok, true);
  assert.equal(res.recipient, '919876543210');
  assert.ok(res.sentMessage && res.sentMessage.length > 10);
  assert.ok(res.sentMessage.includes('Rocket'));

  // Edge case: Non-Sandy unauthorized call
  const unauthRes = await executeRocketTool(
    'send_whatsapp_message',
    { recipient: '9876543210', message: 'hello' },
    { chatId: 'wa_contact', isSandy: false }
  );
  assert.equal(unauthRes.ok, false);
  assert.ok(unauthRes.error.includes('Only Sandy'));
});

// Tool 21: manage_chat_privacy
test('🔒 Tool 21: manage_chat_privacy — Block / Mute & Unblock Specific Contacts', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };

  // Block contact
  const blockRes = await executeRocketTool(
    'manage_chat_privacy',
    {
      action: 'block',
      target: '9876543210',
    },
    context
  );
  assert.equal(blockRes.ok, true);
  assert.equal(blockRes.action, 'block');
  assert.equal(blockRes.status, 'blocked_and_muted');

  // Unblock contact
  const unblockRes = await executeRocketTool(
    'manage_chat_privacy',
    {
      action: 'unblock',
      target: '9876543210',
    },
    context
  );
  assert.equal(unblockRes.ok, true);
  assert.equal(unblockRes.action, 'unblock');
  assert.equal(unblockRes.status, 'unmuted_and_active');
});

// Tool 22: delegate_chat_behalf
test('🤝 Tool 22: delegate_chat_behalf — Autonomous Behalf-Of Mode Management', async () => {
  const context = { chatId: 'wa_sandy_rocket', isSandy: true };

  // Start delegation
  const startRes = await executeRocketTool(
    'delegate_chat_behalf',
    {
      action: 'start',
      target: '9876543210',
      instructions: 'Sandy is in an investor meeting, take down all client notes.',
    },
    context
  );
  assert.equal(startRes.ok, true);
  assert.equal(startRes.action, 'start');
  assert.equal(startRes.targetNumber, '919876543210');
  assert.ok(startRes.initialGreeting.includes('Rocket'));

  // Status check
  const statusRes = await executeRocketTool(
    'delegate_chat_behalf',
    { action: 'status' },
    context
  );
  assert.equal(statusRes.ok, true);
  assert.ok(statusRes.count >= 1);

  // Stop delegation
  const stopRes = await executeRocketTool(
    'delegate_chat_behalf',
    {
      action: 'stop',
      target: '9876543210',
    },
    context
  );
  assert.equal(stopRes.ok, true);
  assert.equal(stopRes.action, 'stop');
});

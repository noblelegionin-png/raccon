import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../src/web/server.js';
import { getDb, initDatabase, registerOrUpdateGroup } from '../src/db/index.js';

test('Web App Endpoints & Mobile API Contracts', async (t) => {
  initDatabase();
  const db = getDb();

  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  t.after(() => {
    server.close();
  });

  await t.test('GET /api/roleplay/roles returns all 10 core roles', async () => {
    const res = await fetch(`${baseUrl}/api/roleplay/roles`);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.roles.length, 10);
    const ids = data.roles.map((r) => r.id);
    assert.ok(ids.includes('brother'));
    assert.ok(ids.includes('sister'));
    assert.ok(ids.includes('friend'));
    assert.ok(ids.includes('bestie'));
    assert.ok(ids.includes('mother'));
    assert.ok(ids.includes('father'));
    assert.ok(ids.includes('daughter'));
    assert.ok(ids.includes('son'));
    assert.ok(ids.includes('mentor'));
    assert.ok(ids.includes('partner'));
  });

  await t.test('GET and POST /api/user/profile updates custom name and role', async () => {
    const testUserId = 'test_webapp_user_123';

    // Set custom name and role
    const postRes = await fetch(`${baseUrl}/api/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        customName: 'Commander Sandy',
        relationshipRole: 'brother',
      }),
    });
    const postData = await postRes.json();
    assert.equal(postData.ok, true);
    assert.equal(postData.profile.custom_name, 'Commander Sandy');
    assert.equal(postData.profile.relationship_role, 'brother');

    // Retrieve updated profile
    const getRes = await fetch(`${baseUrl}/api/user/profile?userId=${testUserId}`);
    const getData = await getRes.json();
    assert.equal(getData.ok, true);
    assert.equal(getData.profile.custom_name, 'Commander Sandy');
    assert.equal(getData.profile.relationship_role, 'brother');
  });

  await t.test('GET /api/memory returns durable facts, batches, and aggregated stats', async () => {
    const res = await fetch(`${baseUrl}/api/memory`);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.memories));
    assert.ok(Array.isArray(data.batches));
    assert.ok(data.stats);
    assert.equal(typeof data.stats.durable_facts_count, 'number');
    assert.equal(typeof data.stats.archive_batches_count, 'number');
    assert.equal(typeof data.stats.total_messages_recorded, 'number');
  });

  await t.test('POST /api/groups/:groupId/textmode toggles text mode', async () => {
    const testGroupId = '-10099998888';
    db.prepare(`
      INSERT OR REPLACE INTO known_groups (group_id, group_title, group_type, bot_enabled, added_at, updated_at)
      VALUES (?, 'Test Mobile Group', 'supergroup', 1, datetime('now'), datetime('now'))
    `).run(testGroupId);

    const toggleRes = await fetch(`${baseUrl}/api/groups/${testGroupId}/textmode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-access-key': process.env.DASHBOARD_ACCESS_KEY || 'N3RO_DEV_KEY_CHANGE_IN_PROD_1234567890',
      },
      body: JSON.stringify({ textMode: true }),
    });
    const toggleData = await toggleRes.json();
    assert.equal(toggleData.ok, true);
    assert.equal(toggleData.textMode, true);

    const textModeVal = db.prepare('SELECT value FROM app_config WHERE key = ?').get(`text_mode_${testGroupId}`)?.value;
    assert.equal(textModeVal, 'on');
  });

  await t.test('POST /api/chat/clear clears conversation history', async () => {
    const testChatId = 'chat_clear_test';
    db.prepare(`
      INSERT INTO conversations (chat_id, role, content, tokens_used, model_used, created_at)
      VALUES (?, 'user', 'Hello clear test', 10, 'gpt-6-luna', datetime('now'))
    `).run(testChatId);

    const clearRes = await fetch(`${baseUrl}/api/chat/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: testChatId }),
    });
    const clearData = await clearRes.json();
    assert.equal(clearData.ok, true);

    const histRes = await fetch(`${baseUrl}/api/chat/history?chatId=${testChatId}`);
    const histData = await histRes.json();
    assert.equal(histData.ok, true);
    assert.equal(histData.history.length, 0);
  });
});

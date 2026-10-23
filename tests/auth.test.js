import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { validateTelegramInitData } from '../src/auth/telegramAuth.js';
import { isOwner, verifyDashboardAccessKey } from '../src/auth/accessControl.js';
import { config } from '../src/config.js';

test('Telegram Auth — HMAC-SHA256 Validation', async (t) => {
  const testBotToken = '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ';
  const testUser = { id: 987654321, first_name: 'Owner', username: 'neroleader' };
  const authDate = Math.floor(Date.now() / 1000);

  // Construct valid initData
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAHdF6IQAAAAAN0XohD9Vp1X',
    user: JSON.stringify(testUser),
  });

  const sortedKeys = Array.from(params.keys()).sort();
  const dataCheckString = sortedKeys.map((k) => `${k}=${params.get(k)}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(testBotToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.append('hash', calculatedHash);
  const validInitData = params.toString();

  await t.test('accepts valid HMAC signature and parses user', () => {
    const result = validateTelegramInitData(validInitData, testBotToken);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.user.id, 987654321);
    assert.strictEqual(result.user.username, 'neroleader');
  });

  await t.test('rejects tampered initData', () => {
    const tampered = validInitData.replace('987654321', '111111111');
    const result = validateTelegramInitData(tampered, testBotToken);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /HMAC signature verification failed/);
  });

  await t.test('rejects expired initData (> 24h old)', () => {
    const oldParams = new URLSearchParams({
      auth_date: String(authDate - 90000), // > 24h
      user: JSON.stringify(testUser),
    });
    const oldDataCheckString = Array.from(oldParams.keys()).sort().map((k) => `${k}=${oldParams.get(k)}`).join('\n');
    const oldHash = crypto.createHmac('sha256', secretKey).update(oldDataCheckString).digest('hex');
    oldParams.append('hash', oldHash);

    const result = validateTelegramInitData(oldParams.toString(), testBotToken);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /expired/);
  });
});

test('Access Control — Numeric Owner ID Verification', async (t) => {
  // Mock config owner ID
  config.telegramOwnerId = '987654321';

  await t.test('authorizes exact numeric Telegram ID', () => {
    assert.strictEqual(isOwner(987654321), true);
    assert.strictEqual(isOwner('987654321'), true);
  });

  await t.test('rejects unauthorized numeric Telegram IDs', () => {
    assert.strictEqual(isOwner(12345), false);
    assert.strictEqual(isOwner('12345'), false);
    assert.strictEqual(isOwner(null), false);
    assert.strictEqual(isOwner(undefined), false);
  });

  await t.test('never authorizes based on username string', () => {
    // If someone passes a username string instead of the numeric ID
    assert.strictEqual(isOwner('neroleader'), false);
  });
});

test('Access Control — Dashboard Access Key & Brute Force Rate Limiting', async (t) => {
  config.dashboardAccessKey = 'super_secret_test_key_456';
  const testIp = '192.168.1.100';

  await t.test('authorizes correct access key', () => {
    assert.strictEqual(verifyDashboardAccessKey('super_secret_test_key_456', testIp), true);
  });

  await t.test('rejects incorrect access key and enforces lockout after 5 failures', () => {
    const attackerIp = '10.0.0.99';
    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(verifyDashboardAccessKey('wrong_key', attackerIp), false);
    }
    // 6th attempt even with correct key should be rate limited
    assert.strictEqual(verifyDashboardAccessKey('super_secret_test_key_456', attackerIp), false);
  });
});

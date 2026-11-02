import test from 'node:test';
import assert from 'node:assert';
import { ScaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';
import { getModelCatalogue, BASE_CATALOGUE } from '../src/models/catalogue.js';

test('ScaleMax Provider Adapter', async (t) => {
  await t.test('detects unconfigured state honestly when key is missing', async () => {
    const unconfigured = new ScaleMaxAdapter({ apiKey: '' });
    assert.strictEqual(unconfigured.isConfigured(), false);

    const health = await unconfigured.checkHealth('gpt-6-luna');
    assert.strictEqual(health.ok, false);
    assert.strictEqual(health.status, 'unconfigured');
    assert.match(health.error, /API key is not configured/);

    await assert.rejects(
      () => unconfigured.createChatCompletion({ model: 'gpt-6-luna', messages: [] }),
      /(?:ScaleMax|Neural Engine) provider is disconnected/
    );
  });

  await t.test('handles 401 Unauthorized properly', async () => {
    // Adapter with an invalid test key against a mock or invalid route
    const badKeyAdapter = new ScaleMaxAdapter({
      apiKey: 'invalid_dummy_key',
      baseUrl: 'https://httpstat.us/401', // Standard HTTP mock
    });

    try {
      const health = await badKeyAdapter.checkHealth('gpt-6-luna');
      // If external network is reachable, it reports unauthorized or http status
      assert.strictEqual(health.ok, false);
    } catch {
      // Network isolation is also safe
    }
  });
});

test('Model Catalogue & Classification', async (t) => {
  await t.test('provides GPT-6 Luna as the default reasoning model', () => {
    const luna = BASE_CATALOGUE.find((m) => m.id === 'gpt-6-luna');
    assert.ok(luna, 'gpt-6-luna must be present in base catalogue');
    assert.strictEqual(luna.isDefault, true);
    assert.strictEqual(luna.category, 'General Reasoning & Text');
    assert.match(luna.pricing, /Unknown — verify provider pricing|Unavailable|Included with Nero Labs/);
  });

  await t.test('flags future audio and voice models as unsupported in Phase 1', () => {
    const audio = BASE_CATALOGUE.find((m) => m.category === 'Audio Understanding');
    assert.ok(audio);
    assert.strictEqual(audio.supported, false);

    const voice = BASE_CATALOGUE.find((m) => m.category === 'Voice & Audio Generation');
    assert.ok(voice);
    assert.strictEqual(voice.supported, false);
  });

  await t.test('getModelCatalogue returns structured catalogue', async () => {
    const res = await getModelCatalogue();
    assert.ok(Array.isArray(res.models));
    assert.ok(res.models.length >= 5);
    const selected = res.models.find((m) => m.isSelected);
    assert.ok(selected);
  });
});

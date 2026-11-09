/**
 * Rocket Browser Link — 5-Action Live Verification Suite
 */

const SERVER_URL = 'https://nero-labs-bot-production.up.railway.app';
const ACCESS_KEY = 'rocket_secret_browser_key_2026';

const TEST_ACTIONS = [
  { action: 'tab_open', params: { url: 'https://youtube.com' } },
  { action: 'zoom_in', params: { step: 0.1 } },
  { action: 'zoom_out', params: { step: 0.1 } },
  { action: 'page_select_copy', params: {} },
  { action: 'navigate_back', params: {} },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runLiveTest() {
  console.log('====================================================');
  console.log('🧪 ROCKET BROWSER LINK — 5-ACTION LIVE TEST RUNNER');
  console.log('====================================================');
  console.log(`Target: ${SERVER_URL}`);

  // Step 1: Check status
  console.log('\n[1/2] Verifying Agent Connection Status...');
  try {
    const statusRes = await fetch(`${SERVER_URL}/api/browser/status`, {
      headers: { 'x-rocket-key': ACCESS_KEY },
    });
    const statusData = await statusRes.json();
    console.log('Status Response:', JSON.stringify(statusData, null, 2));
    if (!statusData.status?.connected) {
      console.warn('⚠️ Agent not yet connected to Railway. Waiting 5s...');
      await sleep(5000);
    }
  } catch (err) {
    console.error('Error querying status:', err.message);
  }

  // Step 2: Run 5 Actions
  console.log('\n[2/2] Executing 5 Sequential Browser Actions...');
  const results = [];

  for (let i = 0; i < TEST_ACTIONS.length; i++) {
    const test = TEST_ACTIONS[i];
    const testNum = i + 1;
    console.log(`\n▶ [Test ${testNum}/5] Executing action: "${test.action}"...`);
    const start = Date.now();

    try {
      const res = await fetch(`${SERVER_URL}/api/browser/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rocket-key': ACCESS_KEY,
        },
        body: JSON.stringify(test),
      });

      const latencyMs = Date.now() - start;
      const data = await res.json();

      if (data.ok) {
        console.log(`  ✅ SUCCESS (${latencyMs}ms):`, JSON.stringify(data.result));
        results.push({ testNum, action: test.action, ok: true, latencyMs, result: data.result });
      } else {
        console.error(`  ❌ FAILED (${latencyMs}ms):`, data.error);
        results.push({ testNum, action: test.action, ok: false, latencyMs, error: data.error });
      }
    } catch (err) {
      const latencyMs = Date.now() - start;
      console.error(`  ❌ ERROR (${latencyMs}ms):`, err.message);
      results.push({ testNum, action: test.action, ok: false, latencyMs, error: err.message });
    }

    await sleep(1500); // Wait between actions
  }

  console.log('\n====================================================');
  console.log('📊 FINAL TEST RESULTS:');
  console.log('====================================================');
  console.table(results);
}

runLiveTest();

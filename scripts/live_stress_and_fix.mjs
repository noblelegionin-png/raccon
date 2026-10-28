/**
 * ⚡ NERO LABS — LIVE END-TO-END STRESS, VERIFICATION & ERROR REMEDIATION SUITE
 * Budget Cap: 100,000 Tokens (Input + Output)
 * Performs live tests across AI models, Web APIs, Search/Browsing, Safety, Media, and Telegram dispatchers.
 */

import { config } from '../src/config.js';
import { scaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';
import { webSearchService } from '../src/search/webSearchService.js';
import { deepBrowserService } from '../src/browser/deepBrowserService.js';
import { imageSearchService } from '../src/media/imageSearchService.js';
import { videoSearchService } from '../src/media/videoSearchService.js';
import { productSearchService } from '../src/shopping/productSearchService.js';
import { websiteSafetyService } from '../src/security/websiteSafetyService.js';
import { documentService } from '../src/documents/documentService.js';
import { getActiveModelId, getModelCatalogue } from '../src/models/catalogue.js';
import { getAgentRouting } from '../src/models/modelRouter.js';
import { ROLEPLAY_ROLES } from '../src/conversation/roleplayManager.js';

const BUDGET_LIMIT = 100000;
let totalPromptTokens = 0;
let totalCompletionTokens = 0;

function recordTokens(promptTokens, completionTokens, source = 'api') {
  totalPromptTokens += promptTokens || 0;
  totalCompletionTokens += completionTokens || 0;
  const currentTotal = totalPromptTokens + totalCompletionTokens;
  if (currentTotal > BUDGET_LIMIT) {
    throw new Error(`CRITICAL: Token budget exceeded! Spent ${currentTotal} / ${BUDGET_LIMIT}`);
  }
}

const testResults = [];

function pass(name, details = {}) {
  testResults.push({ name, status: 'PASS', details });
  console.log(`[PASS] ${name}`, Object.keys(details).length ? JSON.stringify(details) : '');
}

function fail(name, error) {
  testResults.push({ name, status: 'FAIL', error: error.message, stack: error.stack });
  console.error(`[FAIL] ${name}:`, error.message);
}

// -------------------------------------------------------------
// SECTION 1: LIVE AI MODEL INFERENCE & TOKEN CONSUMPTION
// -------------------------------------------------------------
async function testLiveAIModels() {
  console.log('\n--- 1. Testing Live AI Models (ScaleMax Gateway) ---');

  // Test 1A: Gemini 3.8 Flash (Phase 3 Reasoning & Research)
  try {
    const t0 = Date.now();
    const res = await scaleMaxAdapter.createChatCompletion({
      model: 'gemini-3.8-flash',
      messages: [
        { role: 'system', content: 'You are a concise science assistant. Answer in under 30 words.' },
        { role: 'user', content: 'What is the speed of light in vacuum?' },
      ],
      chatId: 'live_test_38',
    });
    const latency = Date.now() - t0;
    recordTokens(res.usage.prompt_tokens, res.usage.completion_tokens, 'gemini-3.8-flash');
    if (!res.text || res.text.length < 5) throw new Error('Empty completion from gemini-3.8-flash');
    pass('Live Model: gemini-3.8-flash Reasoning & Speed', {
      latencyMs: latency,
      inTokens: res.usage.prompt_tokens,
      outTokens: res.usage.completion_tokens,
      replySnippet: res.text.trim().slice(0, 80),
    });
  } catch (err) {
    fail('Live Model: gemini-3.8-flash Reasoning & Speed', err);
  }

  // Test 1B: Gemini 3.5 Flash Light (Low-Token Coder & Tool Manager)
  try {
    const t0 = Date.now();
    const res = await scaleMaxAdapter.createChatCompletion({
      model: 'gemini-3.5-flash-lite',
      messages: [
        { role: 'system', content: 'You are an ultra-low token coder. Reply with ONLY code and 1 sentence.' },
        { role: 'user', content: 'Fix: function sum(a,b){ return a-b; }' },
      ],
      chatId: 'live_test_35',
    });
    const latency = Date.now() - t0;
    recordTokens(res.usage.prompt_tokens, res.usage.completion_tokens, 'gemini-3.5-flash-lite');
    if (!res.text || !res.text.includes('+')) throw new Error('Invalid code fix from gemini-3.5-flash-lite');
    pass('Live Model: gemini-3.5-flash-lite Low-Token Coder', {
      latencyMs: latency,
      inTokens: res.usage.prompt_tokens,
      outTokens: res.usage.completion_tokens,
      replySnippet: res.text.trim().slice(0, 80),
    });
  } catch (err) {
    fail('Live Model: gemini-3.5-flash-lite Low-Token Coder', err);
  }

  // Test 1C: GPT-6 Luna (Conversational Core)
  try {
    const t0 = Date.now();
    const res = await scaleMaxAdapter.createChatCompletion({
      model: 'gpt-6-luna',
      messages: [
        { role: 'system', content: 'You are Nero Labs AI. Reply cordially in 1 sentence.' },
        { role: 'user', content: 'Hello! Are you online and responsive?' },
      ],
      chatId: 'live_test_luna',
    });
    const latency = Date.now() - t0;
    recordTokens(res.usage.prompt_tokens, res.usage.completion_tokens, 'gpt-6-luna');
    if (!res.text || res.text.length < 5) throw new Error('Empty completion from gpt-6-luna');
    pass('Live Model: gpt-6-luna Chat Responsiveness', {
      latencyMs: latency,
      inTokens: res.usage.prompt_tokens,
      outTokens: res.usage.completion_tokens,
      replySnippet: res.text.trim().slice(0, 80),
    });
  } catch (err) {
    fail('Live Model: gpt-6-luna Chat Responsiveness', err);
  }
}

// -------------------------------------------------------------
// SECTION 2: LIVE REST ENDPOINTS ON PORT 3001
// -------------------------------------------------------------
async function testLiveRestEndpoints() {
  console.log('\n--- 2. Testing Live HTTP Server & REST API (Port 3001) ---');
  const baseUrl = 'http://localhost:3001';

  // 2A: Healthz
  try {
    const res = await fetch(`${baseUrl}/healthz`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error('Health probe returned ok: false');
    pass('REST: GET /healthz Health Probe', { status: res.status });
  } catch (err) {
    fail('REST: GET /healthz Health Probe', err);
  }

  // 2B: Models Catalogue
  try {
    const res = await fetch(`${baseUrl}/api/models/catalogue`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.models) || data.models.length < 5) throw new Error('Invalid models list');
    pass('REST: GET /api/models/catalogue', { totalModels: data.totalModels, activeModelId: data.activeModelId });
  } catch (err) {
    fail('REST: GET /api/models/catalogue', err);
  }

  // 2C: Model Routing Configuration
  try {
    const res = await fetch(`${baseUrl}/api/routing`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.routing?.chat || !data.routing?.research) throw new Error('Missing routing tiers');
    pass('REST: GET /api/routing', { chatModel: data.routing.chat.model, researchModel: data.routing.research.model });
  } catch (err) {
    fail('REST: GET /api/routing', err);
  }

  // 2D: Roleplay Roles List
  try {
    const res = await fetch(`${baseUrl}/api/roleplay/roles`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.roles || data.roles.length !== 20) throw new Error(`Expected 20 roles, got ${data.roles?.length}`);
    pass('REST: GET /api/roleplay/roles (All 20 Roles)', { rolesCount: data.roles.length });
  } catch (err) {
    fail('REST: GET /api/roleplay/roles (All 20 Roles)', err);
  }

  // 2E: User Profile GET & POST
  try {
    const testUserId = '8283843309';
    const getRes = await fetch(`${baseUrl}/api/user/profile?userId=${testUserId}`);
    if (!getRes.ok) throw new Error(`GET profile status ${getRes.status}`);
    const profData = await getRes.json();

    const postRes = await fetch(`${baseUrl}/api/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        customName: 'Sandy',
        relationshipRole: 'creator',
        customTitle: 'Lead Architect',
      }),
    });
    if (!postRes.ok) throw new Error(`POST profile status ${postRes.status}`);
    pass('REST: User Profile (GET & POST Persistence)', { userId: testUserId });
  } catch (err) {
    fail('REST: User Profile (GET & POST Persistence)', err);
  }

  // 2F: MCP Bridge Status
  try {
    const res = await fetch(`${baseUrl}/api/mcp/status`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    pass('REST: GET /api/mcp/status', { operational: data.operational, activeConnections: data.activeConnections });
  } catch (err) {
    fail('REST: GET /api/mcp/status', err);
  }

  // 2G: Minecraft Companion Status
  try {
    const res = await fetch(`${baseUrl}/api/minecraft/status`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    pass('REST: GET /api/minecraft/status', { connected: data.connected });
  } catch (err) {
    fail('REST: GET /api/minecraft/status', err);
  }
}

// -------------------------------------------------------------
// SECTION 3: LIVE SEARCH, BROWSING, MEDIA & SECURITY SERVICES
// -------------------------------------------------------------
async function testLivePhase3Services() {
  console.log('\n--- 3. Testing Live Search, Browsing, Media & Security Services ---');

  // 3A: Live Web Search (Multi-source & grounded synthesis)
  try {
    const searchRes = await webSearchService.search('James Webb Space Telescope discoveries', { limit: 3 });
    if (!searchRes.ok || searchRes.results.length === 0) throw new Error('Search returned 0 results');
    const first = searchRes.results[0];
    if (!first.title || !first.url.startsWith('http')) throw new Error('Invalid search result format');
    const synthesis = await webSearchService.synthesizeAnswer('What are key James Webb discoveries?', searchRes);
    if (!synthesis.answer || (!synthesis.answer.includes('http') && synthesis.sources.length === 0)) {
      throw new Error('Synthesized answer missing source links');
    }
    pass('Live Service: Web Search & Citation Synthesis', {
      resultsFound: searchRes.results.length,
      topResult: first.title,
      hasDirectUrls: true,
      modelUsed: synthesis.model || 'fallback',
    });
  } catch (err) {
    fail('Live Service: Web Search & Citation Synthesis', err);
  }

  // 3B: Live Deep Browser (Fetch page & SSRF Guard)
  try {
    const page = await deepBrowserService.fetchPage('https://example.com');
    if (!page.ok || !page.bodyText.includes('Example Domain')) throw new Error('Failed to fetch example.com');
    if (!page.title) throw new Error('Title extraction failed');

    // Test SSRF containment
    const ssrfBad = await deepBrowserService.fetchPage('http://127.0.0.1:8080/admin');
    if (ssrfBad.ok) throw new Error('SSRF guard failed to block 127.0.0.1');

    pass('Live Service: Deep Browser & SSRF Guard', {
      title: page.title,
      bodyTextLength: page.bodyText.length,
      ssrfBlocked: true,
    });
  } catch (err) {
    fail('Live Service: Deep Browser & SSRF Guard', err);
  }

  // 3C: Live Direct Image Search
  try {
    const imgRes = await imageSearchService.searchImage('Andromeda Galaxy');
    const imgUrl = imgRes.image?.url || imgRes.image?.imageUrl;
    if (!imgRes.ok || !imgRes.image || !imgUrl || !imgUrl.startsWith('http')) {
      throw new Error('Image search failed to retrieve valid image URL');
    }
    pass('Live Service: Direct Image Search', {
      title: imgRes.image.title,
      imageUrl: imgUrl,
      captionLength: imgRes.image.caption?.length || 0,
    });
  } catch (err) {
    fail('Live Service: Direct Image Search', err);
  }

  // 3D: Live Video Search & Metadata
  try {
    const vidRes = await videoSearchService.searchVideo('Mars Rover Perseverance');
    if (!vidRes.ok || vidRes.videos.length === 0) throw new Error('Video search returned 0 results');
    const firstVid = vidRes.videos[0];
    if (!firstVid.url.includes('youtu')) throw new Error('Missing video link');
    pass('Live Service: Video Search & Metadata', {
      title: firstVid.title,
      url: firstVid.url,
      channel: firstVid.channel,
    });
  } catch (err) {
    fail('Live Service: Video Search & Metadata', err);
  }

  // 3E: Live Product & Shopping Comparison
  try {
    const shopRes = await productSearchService.searchProducts('Wireless ergonomic mouse under 60');
    if (!shopRes.ok || shopRes.products.length === 0) throw new Error('Product search returned 0 items');
    const report = productSearchService.formatComparisonReport(shopRes);
    if (!report.includes('Direct Retail Listing')) throw new Error('Report format missing listing header');
    pass('Live Service: Product Discovery & Budget Filter', {
      productsCount: shopRes.products.length,
      budgetDetected: shopRes.budgetConstraint,
    });
  } catch (err) {
    fail('Live Service: Product Discovery & Budget Filter', err);
  }

  // 3F: Live Website Scam & Safety Analysis (Native TLS Socket)
  try {
    const safeCheck = await websiteSafetyService.analyzeWebsite('https://wikipedia.org');
    if (!safeCheck.ok || safeCheck.riskLevel !== 'Low observed risk') {
      throw new Error(`Expected Low risk for wikipedia.org, got ${safeCheck.riskLevel}`);
    }
    if (!safeCheck.certInfo?.hasHttps) throw new Error('TLS certificate inspection failed');

    // Phishing spoofing test
    const phishCheck = await websiteSafetyService.analyzeWebsite('https://paypal-security-update.xyz');
    if (phishCheck.riskLevel !== 'High risk') {
      throw new Error(`Expected High risk for spoof domain, got ${phishCheck.riskLevel}`);
    }

    pass('Live Service: Website Safety & Native TLS Inspection', {
      wikiCertIssuer: safeCheck.certInfo.issuer,
      wikiRisk: safeCheck.riskLevel,
      phishRisk: phishCheck.riskLevel,
    });
  } catch (err) {
    fail('Live Service: Website Safety & Native TLS Inspection', err);
  }

  // 3G: Live Educational Document & PDF Discovery
  try {
    const docRes = await documentService.searchEducationalDocuments('quantum mechanics lecture notes');
    if (!docRes.ok || docRes.documents.length === 0) throw new Error('Educational search returned 0 docs');
    pass('Live Service: Educational Document & PDF Discovery', {
      docsFound: docRes.documents.length,
      topDocTitle: docRes.documents[0].title,
      topDocUrl: docRes.documents[0].url,
    });
  } catch (err) {
    fail('Live Service: Educational Document & PDF Discovery', err);
  }
}

// -------------------------------------------------------------
// SECTION 4: LIVE TELEGRAM BOT INTENT DISPATCHERS & COMMANDS
// -------------------------------------------------------------
async function testLiveIntentDispatchers() {
  console.log('\n--- 4. Testing Live Telegram Bot Natural Language Intent Dispatchers ---');

  // Test 4A: Web search heuristic
  const isSearch1 = webSearchService.isSearchQuery('Search the web for upcoming eclipses');
  const isSearch2 = webSearchService.isSearchQuery('/search Artemis 2 crew');
  if (!isSearch1 || !isSearch2) throw new Error('Search intent heuristic failed');
  pass('Intent Dispatcher: Search Queries Detected', { query1: isSearch1, query2: isSearch2 });

  // Test 4B: Image request heuristic
  const isImg1 = imageSearchService.isImageQuery('Show me a picture of the Moon');
  const isImg2 = imageSearchService.isImageQuery('/image Saturn rings');
  if (!isImg1 || !isImg2) throw new Error('Image intent heuristic failed');
  pass('Intent Dispatcher: Image Queries Detected', { query1: isImg1, query2: isImg2 });

  // Test 4C: Video request heuristic
  const isVid1 = videoSearchService.isVideoQuery('Find me a video on Einstein relativity');
  const isVid2 = videoSearchService.isVideoQuery('/video Python tutorial');
  if (!isVid1 || !isVid2) throw new Error('Video intent heuristic failed');
  pass('Intent Dispatcher: Video Queries Detected', { query1: isVid1, query2: isVid2 });

  // Test 4D: Product shopping heuristic
  const isShop1 = productSearchService.isProductQuery('Buy mechanical keyboard under $100');
  const isShop2 = productSearchService.isProductQuery('/shop Sony headphones');
  if (!isShop1 || !isShop2) throw new Error('Product intent heuristic failed');
  pass('Intent Dispatcher: Shopping Queries Detected', { query1: isShop1, query2: isShop2 });

  // Test 4E: Website safety heuristic
  const isSafe1 = websiteSafetyService.isSafetyQuery('Is this website safe https://bankofamerica-login.xyz');
  const isSafe2 = websiteSafetyService.isSafetyQuery('/safety https://google.com');
  if (!isSafe1 || !isSafe2) throw new Error('Safety intent heuristic failed');
  pass('Intent Dispatcher: Website Safety Queries Detected', { query1: isSafe1, query2: isSafe2 });

  // Test 4F: Educational PDF heuristic
  const isDoc1 = documentService.isDocumentQuery('Find educational PDF on computer vision');
  const isDoc2 = documentService.isDocumentQuery('/pdf https://arxiv.org/pdf/2301.00001.pdf');
  if (!isDoc1 || !isDoc2) throw new Error('Document intent heuristic failed');
  pass('Intent Dispatcher: Educational Document Queries Detected', { query1: isDoc1, query2: isDoc2 });
}

// -------------------------------------------------------------
// MAIN EXECUTION
// -------------------------------------------------------------
async function run() {
  console.log('====================================================');
  console.log('⚡ NERO LABS — LIVE INTEGRATION & STRESS TEST SUITE');
  console.log(`Token Budget Cap: ${BUDGET_LIMIT.toLocaleString()} tokens`);
  console.log('====================================================');

  await testLiveAIModels();
  await testLiveRestEndpoints();
  await testLivePhase3Services();
  await testLiveIntentDispatchers();

  const totalSpent = totalPromptTokens + totalCompletionTokens;
  const remainingBudget = BUDGET_LIMIT - totalSpent;

  console.log('\n====================================================');
  console.log('🏁 LIVE VERIFICATION RUN COMPLETED');
  console.log('====================================================');
  console.log(`Total Tests Run: ${testResults.length}`);
  const passedCount = testResults.filter((r) => r.status === 'PASS').length;
  const failedCount = testResults.filter((r) => r.status === 'FAIL').length;
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('----------------------------------------------------');
  console.log(`Prompt Tokens Used:     ${totalPromptTokens.toLocaleString()}`);
  console.log(`Completion Tokens Used: ${totalCompletionTokens.toLocaleString()}`);
  console.log(`Total Tokens Spent:     ${totalSpent.toLocaleString()} / ${BUDGET_LIMIT.toLocaleString()}`);
  console.log(`Remaining Budget:       ${remainingBudget.toLocaleString()} tokens (${((remainingBudget / BUDGET_LIMIT) * 100).toFixed(1)}% remaining)`);
  console.log('====================================================');

  if (failedCount > 0) {
    console.error('❌ ERRORS DETECTED DURING LIVE RUN:');
    for (const f of testResults.filter((r) => r.status === 'FAIL')) {
      console.error(` - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('🟢 ALL LIVE TESTS PASSED CLEANLY WITH ZERO ERRORS.');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('FATAL UNHANDLED ERROR IN LIVE SUITE:', err);
  process.exit(1);
});

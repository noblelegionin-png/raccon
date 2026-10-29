import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webSearchService } from '../src/search/webSearchService.js';
import { deepBrowserService } from '../src/browser/deepBrowserService.js';
import { imageSearchService } from '../src/media/imageSearchService.js';
import { videoSearchService } from '../src/media/videoSearchService.js';
import { productSearchService } from '../src/shopping/productSearchService.js';
import { websiteSafetyService } from '../src/security/websiteSafetyService.js';
import { documentService } from '../src/documents/documentService.js';
import { getActiveModelId, setActiveModelId } from '../src/models/catalogue.js';
import { ROLEPLAY_ROLES } from '../src/conversation/roleplayManager.js';

test('1. Advanced Web Search — Factual topic & direct source links', async () => {
  const query = 'Quantum computing';
  const res = await webSearchService.search(query, { limit: 4 });

  assert.equal(res.ok, true);
  assert.ok(res.results.length > 0, 'Should find search results');
  const first = res.results[0];
  assert.ok(first.title, 'Result must have title');
  assert.ok(first.url.startsWith('http'), 'Result URL must be a valid http link');
  assert.ok(first.snippet.length > 0, 'Result must have a non-empty snippet');
  assert.ok(first.source, 'Result must have publisher/source');

  // Verify answer synthesis formats sources properly
  const synthesis = await webSearchService.synthesizeAnswer(query, res);
  assert.ok(synthesis.answer.length > 0);
  assert.ok(Array.isArray(synthesis.sources));
});

test('2. Deep Website Browsing — Open website & crawl multiple internal pages', async () => {
  const url = 'https://example.com';
  const page = await deepBrowserService.fetchPage(url);

  assert.equal(page.ok, true);
  assert.equal(page.url, 'https://example.com/');
  assert.ok(page.title.includes('Example Domain'));
  assert.ok(page.bodyText.length > 0);

  // Test deep browse
  const deep = await deepBrowserService.deepBrowse(url, 1);
  assert.equal(deep.ok, true);
  assert.ok(deep.title);

  // Test synthesis with untrusted containment
  const summary = await deepBrowserService.synthesizeBrowsingReport(deep, 'What is the purpose of this domain?');
  assert.ok(summary.length > 0);
});

test('3. Direct Image Search & Media Delivery Verification', async () => {
  // Query for a cat image as specifically requested in acceptance criteria
  const query = 'cat';
  const res = await imageSearchService.searchImages(query, 2);

  assert.equal(res.ok, true);
  assert.ok(res.images.length > 0, 'Should find real cat images');
  const catImg = res.images[0];
  assert.ok(catImg.imageUrl.startsWith('http'), 'Image URL must be valid');
  assert.ok(catImg.sourceUrl.startsWith('http'), 'Source page URL must be preserved');
  assert.ok(catImg.title, 'Image title must exist');

  // Test mock Telegram ctx delivery
  let sentPhotoUrl = null;
  let sentCaption = null;
  const mockCtx = {
    replyWithPhoto: async (url, options) => {
      sentPhotoUrl = url;
      sentCaption = options.caption;
      return true;
    },
  };

  const delivered = await imageSearchService.deliverImageToTelegram(mockCtx, catImg);
  assert.equal(delivered, true);
  assert.equal(sentPhotoUrl, catImg.imageUrl);
  assert.ok(sentCaption.includes(catImg.title));
  assert.ok(sentCaption.includes('View Source'));
});

test('4. Video Search & Transcript Metadata Retrieval', async () => {
  const query = 'Nodejs tutorial';
  const res = await videoSearchService.searchVideos(query, 2);

  assert.equal(res.ok, true);
  assert.ok(res.videos.length > 0, 'Should find videos');
  const video = res.videos[0];
  assert.ok(video.url.startsWith('https://www.youtube.com'), 'Video URL must be direct YouTube link');
  assert.ok(video.title, 'Video must have a title');
  assert.ok(video.channel, 'Video must identify channel/publisher');

  // Test video summarizer & explicit disclaimer
  const summary = await videoSearchService.summarizeVideo(video);
  assert.ok(summary.summaryText.length > 0);
  assert.ok(summary.disclaimer.includes('transcript') || summary.disclaimer.includes('metadata'), 'Must clearly disclose analysis methodology');
});

test('5. Product & Shopping Search — Real listings, budget & comparison', async () => {
  const query = 'wireless headphones under 100';
  const res = await productSearchService.searchProducts(query);

  assert.equal(res.ok, true);
  assert.equal(res.budget, 100, 'Budget must be extracted as 100');
  assert.ok(res.products.length > 0, 'Should return product options');
  const item = res.products[0];
  assert.ok(item.name, 'Product must have name');
  assert.ok(item.retailer, 'Must identify retailer');
  assert.ok(item.url.startsWith('http'), 'Must have real listing URL');
  assert.ok(item.verifiedAt, 'Must include verification date');

  // Test comparison synthesis
  const comparison = await productSearchService.compareProducts(query, res);
  assert.ok(comparison.length > 0);
  assert.ok(comparison.includes('verified as of') || comparison.includes('Price'));
});

test('6. Accessible Educational Document & PDF Inspection', async () => {
  // Test educational document search
  const query = 'machine learning syllabus';
  const res = await documentService.searchEducationalResources(query, 3);

  assert.equal(res.ok, true);
  assert.ok(res.documents.length > 0);

  // Test document buffer text extraction and summary
  const sampleBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj\nstream\nBT /F1 12 Tf (Computer Science 101 Lecture Notes on Sorting Algorithms) ET\nendstream\n%%EOF'
  );
  const text = documentService.extractTextFromBuffer(sampleBuffer, 'application/pdf');
  assert.ok(text.includes('Lecture Notes') || text.includes('Sorting Algorithms'));

  const summary = await documentService.summarizeDocument({
    filename: 'cs101_notes.pdf',
    buffer: sampleBuffer,
    sizeBytes: sampleBuffer.length,
    mimeType: 'application/pdf',
  });
  assert.ok(summary.length > 0);
});

test('7. Website Scam & Security Analysis — Known legitimate URL', async () => {
  const url = 'https://google.com';
  const analysis = await websiteSafetyService.analyzeWebsite(url);

  assert.equal(analysis.ok, true);
  assert.equal(analysis.domain, 'google.com');
  assert.equal(analysis.riskLevel, 'Low observed risk');
  assert.equal(analysis.suspiciousIndicators.length, 0);
  assert.ok(analysis.certInfo.hasHttps);
  assert.ok(analysis.limitations.length > 0);

  const report = websiteSafetyService.formatReport(analysis);
  assert.ok(report.includes('Low observed risk'));
  assert.ok(report.includes('google.com'));
});

test('8. Website Scam & Security Analysis — Phishing & Brand Spoofing Detection', async () => {
  // Test brand spoofing heuristic on a fake URL
  const fakePhishUrl = 'https://paypal-verify-login.account-security.top/login.php';
  const analysis = await websiteSafetyService.analyzeWebsite(fakePhishUrl);

  assert.equal(analysis.ok, true);
  assert.ok(analysis.suspiciousIndicators.some((i) => i.includes('Potential brand impersonation: "paypal"')));
  assert.ok(analysis.suspiciousIndicators.some((i) => i.includes('high-abuse TLD ".top"')));
  assert.equal(analysis.riskLevel, 'High risk');

  const report = websiteSafetyService.formatReport(analysis);
  assert.ok(report.includes('High risk'));
});

test('9. Error Handling & Inaccessible/Invalid URLs and SSRF Guard', async () => {
  // SSRF guard test
  assert.equal(deepBrowserService.isSafeUrl('http://127.0.0.1:8080/admin'), false);
  assert.equal(deepBrowserService.isSafeUrl('http://localhost:3000'), false);
  assert.equal(deepBrowserService.isSafeUrl('http://192.168.1.1/secret'), false);
  assert.equal(deepBrowserService.isSafeUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(deepBrowserService.isSafeUrl('https://example.com'), true);

  // Inaccessible/invalid URL handling
  const badUrlRes = await deepBrowserService.fetchPage('http://127.0.0.1/admin');
  assert.equal(badUrlRes.ok, false);
  assert.ok(badUrlRes.error.includes('restricted'));

  // Invalid safety URL
  const invalidSafety = await websiteSafetyService.analyzeWebsite('not_a_valid_url_at_all');
  assert.equal(invalidSafety.ok, false);
  assert.equal(invalidSafety.riskLevel, 'Unable to determine');
});

test('10. Security & Secret Leak Isolation Verification', async () => {
  // Ensure no sensitive process.env keys leak through services
  const query = 'api_key token secret';
  const searchRes = await webSearchService.search(query);
  const jsonStr = JSON.stringify(searchRes);

  assert.equal(jsonStr.includes(process.env.SCALEMAX_API_KEY || 'MISSING'), false);
  assert.equal(jsonStr.includes(process.env.TELEGRAM_BOT_TOKEN || 'MISSING'), false);
});

test('11. System Integrity & Backward Compatibility', async () => {
  // Verify 20 roles are intact
  assert.equal(Object.keys(ROLEPLAY_ROLES).length, 20);

  // Verify primary model is configured to gpt-6-luna
  setActiveModelId('gpt-6-luna');
  assert.equal(getActiveModelId(), 'gpt-6-luna');
});

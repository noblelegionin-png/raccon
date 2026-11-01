import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSearchService } from '../src/media/imageSearchService.js';
import { executeRocketTool, ROCKET_TOOL_DEFINITIONS } from '../src/tools/rocketTools.js';

test('🚀 Rocket AI — Visual Query Detection & Extraction', () => {
  // 1. English patterns
  assert.equal(imageSearchService.isVisualQuery('show me an image of a black hole'), true);
  assert.equal(imageSearchService.extractImageQuery('show me an image of a black hole'), 'black hole');

  assert.equal(imageSearchService.isVisualQuery('Rocket, send me a photo of taj mahal'), true);
  assert.equal(imageSearchService.extractImageQuery('Rocket, send me a photo of taj mahal'), 'taj mahal');

  // 2. Hinglish patterns
  assert.equal(imageSearchService.isVisualQuery('rocket taj mahal ki photo dikhao'), true);
  assert.equal(imageSearchService.extractImageQuery('rocket taj mahal ki photo dikhao'), 'taj mahal');

  assert.equal(imageSearchService.isVisualQuery('mujhe human heart ka diagram chahiye'), true);
  assert.equal(imageSearchService.extractImageQuery('mujhe human heart ka diagram chahiye'), 'human heart');

  assert.equal(imageSearchService.isVisualQuery('ferrari ki pic bhejo please'), true);
  assert.equal(imageSearchService.extractImageQuery('ferrari ki pic bhejo please'), 'ferrari');

  // 3. Slash commands
  assert.equal(imageSearchService.isVisualQuery('/photo Lamborghini Aventador'), true);
  assert.equal(imageSearchService.extractImageQuery('/photo Lamborghini Aventador'), 'Lamborghini Aventador');

  // 4. Non-visual queries should return false
  assert.equal(imageSearchService.isVisualQuery('how to code in nodejs'), false);
  assert.equal(imageSearchService.isVisualQuery('what is the capital of France?'), false);
});

test('🚀 Rocket AI — Live Web Image Search & Buffer Download', async () => {
  const query = 'taj mahal';
  const res = await imageSearchService.searchImage(query, 3);

  assert.equal(res.ok, true, 'Image search must return ok=true');
  assert.ok(res.images && res.images.length > 0, 'Must find images for Taj Mahal');
  assert.ok(res.image && res.image.imageUrl, 'Top image must have imageUrl');
  assert.ok(res.image.imageUrl.startsWith('http'), 'ImageUrl must be a valid http link');

  // Verify buffer download for WhatsApp media upload
  const dl = await imageSearchService.downloadImageBuffer(res.image.imageUrl, 8000);
  assert.ok(dl, 'Buffer download result must be valid');
  assert.ok(dl.buffer && dl.buffer.length > 1000, 'Downloaded image buffer must be non-empty (>1KB)');
  assert.ok(dl.mimetype.startsWith('image/'), 'Mimetype must be image/*');
});

test('🚀 Rocket AI — 18+ Boundary & Safe Education Visuals', async () => {
  // 18+ explicit pornography check
  assert.equal(imageSearchService.isExplicit18Plus('send hot nudes xxx'), true);
  assert.equal(imageSearchService.isExplicit18Plus('porn video pic'), true);
  assert.equal(imageSearchService.isExplicit18Plus('human heart anatomy diagram'), false);

  const blocked = await imageSearchService.searchImages('hot porn xxx', 2);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.error.includes('18+'));

  // Educational/study visual is allowed and succeeds
  const studyVisual = await imageSearchService.searchImages('human eye anatomy diagram', 2);
  assert.equal(studyVisual.ok, true);
  assert.ok(studyVisual.images.length > 0);
});

test('🚀 Rocket AI — Tool Execution (search_images) with Media Buffering', async () => {
  const toolDef = ROCKET_TOOL_DEFINITIONS.find((t) => t.function?.name === 'search_images');
  assert.ok(toolDef, 'search_images must exist in ROCKET_TOOL_DEFINITIONS');

  const context = {
    chatId: 'wa_sandy_master',
    isSandy: true,
    pendingImages: [],
  };

  const output = await executeRocketTool('search_images', { query: 'supermassive black hole', limit: 2 }, context);

  assert.equal(output.ok, true);
  assert.ok(output.images && output.images.length > 0);
  assert.ok(context.pendingImages.length > 0, 'Pending images array must receive buffered image');
  assert.ok(context.pendingImages[0].buffer instanceof Buffer);
  assert.ok(context.pendingImages[0].mimetype.startsWith('image/'));
});

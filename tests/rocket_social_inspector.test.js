import test from 'node:test';
import assert from 'node:assert/strict';
import { socialInspectorService } from '../src/media/socialInspectorService.js';
import { executeRocketTool, ROCKET_TOOL_DEFINITIONS } from '../src/tools/rocketTools.js';

test('🎬 Rocket AI — Social Media Link Detection & Extraction', () => {
  // 1. YouTube & Shorts
  assert.equal(socialInspectorService.isSocialUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
  assert.equal(socialInspectorService.isSocialUrl('check this out https://youtube.com/shorts/jNQXAC9IVRw'), true);
  const ytExtracted = socialInspectorService.extractSocialUrl('https://youtube.com/shorts/jNQXAC9IVRw');
  assert.equal(ytExtracted.platform, 'youtube');
  assert.equal(ytExtracted.type, 'short');

  // 2. Instagram Reels & Posts
  assert.equal(socialInspectorService.isSocialUrl('https://www.instagram.com/reel/BsOGulcndj-/'), true);
  const igExtracted = socialInspectorService.extractSocialUrl('https://www.instagram.com/reel/BsOGulcndj-/');
  assert.equal(igExtracted.platform, 'instagram');
  assert.equal(igExtracted.type, 'reel');

  // 3. Facebook Reels & Videos
  assert.equal(socialInspectorService.isSocialUrl('https://www.facebook.com/reel/10153231379946729'), true);
  assert.equal(socialInspectorService.isSocialUrl('https://fb.watch/xyz123/'), true);
  const fbExtracted = socialInspectorService.extractSocialUrl('https://www.facebook.com/reel/10153231379946729');
  assert.equal(fbExtracted.platform, 'facebook');
  assert.equal(fbExtracted.type, 'reel');

  // 4. Vero Posts
  assert.equal(socialInspectorService.isSocialUrl('https://vero.co/vero/xGZ-B5R8KxWqT2pZ3M'), true);
  const veroExtracted = socialInspectorService.extractSocialUrl('https://vero.co/vero/xGZ-B5R8KxWqT2pZ3M');
  assert.equal(veroExtracted.platform, 'vero');

  // 5. Non-social links
  assert.equal(socialInspectorService.isSocialUrl('https://github.com/nodejs/node'), false);
  assert.equal(socialInspectorService.isSocialUrl('what is the weather today?'), false);
});

test('🎬 Rocket AI — YouTube & Shorts Inspection', async () => {
  const result = await socialInspectorService.inspect('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(result.ok, true);
  assert.equal(result.platform, 'youtube');
  assert.ok(result.title.includes('Never Gonna Give You Up'));
  assert.equal(result.author, 'Rick Astley');
  assert.ok(result.thumbnailUrl.startsWith('http'));
});

test('🎬 Rocket AI — Instagram Reel Inspection', async () => {
  const result = await socialInspectorService.inspect('https://www.instagram.com/reel/BsOGulcndj-/');
  assert.equal(result.ok, true);
  assert.equal(result.platform, 'instagram');
  assert.equal(result.type, 'Instagram Reel');
  assert.ok(result.author.includes('world_record_egg'));
  assert.ok(result.thumbnailUrl && result.thumbnailUrl.startsWith('http'));
});

test('🎬 Rocket AI — Vero Post Inspection', async () => {
  const result = await socialInspectorService.inspect('https://vero.co/vero/xGZ-B5R8KxWqT2pZ3M');
  assert.equal(result.ok, true);
  assert.equal(result.platform, 'vero');
  assert.ok(result.title.includes('VERO'));
});

test('🎬 Rocket AI — Facebook Reel / Video Inspection', async () => {
  const result = await socialInspectorService.inspect('https://www.facebook.com/watch/?v=10153231379946729');
  assert.equal(result.ok, true);
  assert.equal(result.platform, 'facebook');
  assert.ok(result.title.length > 0);
});

test('🎬 Rocket AI — Inspection Card Formatting', () => {
  const mockItem = {
    platform: 'youtube',
    type: 'YouTube Short',
    title: 'Top 5 Minecraft Redstone Tricks',
    author: 'MumboJumbo',
    description: 'Learn the fastest redstone circuits in 60 seconds.',
    cleanUrl: 'https://www.youtube.com/shorts/example123',
  };

  const sandyCard = socialInspectorService.formatInspectionCard(mockItem, true);
  assert.ok(sandyCard.includes('Ye lo Boss!'));
  assert.ok(sandyCard.includes('MumboJumbo'));
  assert.ok(sandyCard.includes('Rocket on duty'));

  const contactCard = socialInspectorService.formatInspectionCard(mockItem, false);
  assert.ok(contactCard.includes('YouTube Short Inspection'));
  assert.ok(contactCard.includes('MumboJumbo'));
  assert.ok(!contactCard.includes('Boss'));
});

test('🎬 Rocket AI — Tool Execution (inspect_social_media)', async () => {
  const toolDef = ROCKET_TOOL_DEFINITIONS.find((t) => t.function?.name === 'inspect_social_media');
  assert.ok(toolDef, 'inspect_social_media must exist in ROCKET_TOOL_DEFINITIONS');

  const context = {
    chatId: 'wa_sandy_master',
    isSandy: true,
    pendingImages: [],
  };

  const output = await executeRocketTool(
    'inspect_social_media',
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    context
  );

  assert.equal(output.ok, true);
  assert.equal(output.platform, 'youtube');
  assert.ok(context.pendingImages.length > 0, 'Must buffer thumbnail into pendingImages');
  assert.ok(context.pendingImages[0].buffer instanceof Buffer);
});

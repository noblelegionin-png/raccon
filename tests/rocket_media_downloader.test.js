import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaDownloaderService } from '../src/media/mediaDownloaderService.js';
import { executeRocketTool, ROCKET_TOOL_DEFINITIONS } from '../src/tools/rocketTools.js';

test('📥 Rocket Media Downloader — Media URL Recognition & Extraction', () => {
  // YouTube
  assert.equal(mediaDownloaderService.isMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
  assert.equal(mediaDownloaderService.isMediaUrl('download https://youtube.com/shorts/jNQXAC9IVRw'), true);
  const ytExt = mediaDownloaderService.extractMediaUrl('download https://youtube.com/shorts/jNQXAC9IVRw');
  assert.equal(ytExt.platform, 'youtube');

  // Instagram
  assert.equal(mediaDownloaderService.isMediaUrl('https://www.instagram.com/reel/C8q8-lCPLkQ/'), true);
  const igExt = mediaDownloaderService.extractMediaUrl('check this https://www.instagram.com/reel/C8q8-lCPLkQ/');
  assert.equal(igExt.platform, 'instagram');

  // Facebook
  assert.equal(mediaDownloaderService.isMediaUrl('https://www.facebook.com/reel/10153231379946729'), true);
  const fbExt = mediaDownloaderService.extractMediaUrl('https://fb.watch/xyz123/');
  assert.equal(fbExt.platform, 'facebook');

  // TikTok
  assert.equal(mediaDownloaderService.isMediaUrl('https://www.tiktok.com/@tiktok/video/7106594312292453675'), true);
  const ttExt = mediaDownloaderService.extractMediaUrl('https://www.tiktok.com/@tiktok/video/7106594312292453675');
  assert.equal(ttExt.platform, 'tiktok');

  // Direct Audio / Video
  assert.equal(mediaDownloaderService.isMediaUrl('https://example.com/assets/music_clip.mp3'), true);
  assert.equal(mediaDownloaderService.isMediaUrl('https://example.com/assets/video_hd.mp4'), true);
  const dirExt = mediaDownloaderService.extractMediaUrl('https://example.com/assets/video_hd.mp4');
  assert.equal(dirExt.platform, 'direct');

  // Non-media
  assert.equal(mediaDownloaderService.isMediaUrl('https://google.com'), false);
  assert.equal(mediaDownloaderService.isMediaUrl('hello world'), false);
});

test('📥 Rocket Media Downloader — Download Intent & Format Detection', () => {
  // Download intent detection
  assert.equal(mediaDownloaderService.isDownloadIntent('Nero download reel'), true);
  assert.equal(mediaDownloaderService.isDownloadIntent('Rocket mp3 download karo'), true);
  assert.equal(mediaDownloaderService.isDownloadIntent('video download kar do please'), true);
  assert.equal(mediaDownloaderService.isDownloadIntent('ye gaana nikaal ke de'), true);
  assert.equal(mediaDownloaderService.isDownloadIntent('save this reel'), true);
  assert.equal(mediaDownloaderService.isDownloadIntent('music download'), true);
  assert.equal(mediaDownloaderService.isDownloadIntent('aaj mausam kaisa hai'), false);

  // Format detection
  assert.equal(mediaDownloaderService.detectFormat('Nero download mp3'), 'mp3');
  assert.equal(mediaDownloaderService.detectFormat('ye audio nikaal do'), 'mp3');
  assert.equal(mediaDownloaderService.detectFormat('mujhe iska gaana sunna hai'), 'mp3');
  assert.equal(mediaDownloaderService.detectFormat('download music track'), 'mp3');
  assert.equal(mediaDownloaderService.detectFormat('Nero download video'), 'mp4');
  assert.equal(mediaDownloaderService.detectFormat('download this reel'), 'mp4');
  assert.equal(mediaDownloaderService.detectFormat('shorts download kar de'), 'mp4');
});

test('📥 Rocket Media Downloader — Tool Definition in ROCKET_TOOL_DEFINITIONS', () => {
  const tool = ROCKET_TOOL_DEFINITIONS.find((t) => t.function.name === 'download_media');
  assert.ok(tool, 'download_media tool definition must be present');
  assert.equal(tool.function.name, 'download_media');
  assert.ok(tool.function.parameters.properties.url);
  assert.ok(tool.function.parameters.properties.format);
  assert.ok(tool.function.parameters.properties.quality);
  assert.deepEqual(tool.function.parameters.required, ['url']);
});

test('📥 Rocket Media Downloader — Result Packaging and Message Formatting', () => {
  // Direct delivery mock (<= 16MB)
  const mockBuffer = Buffer.alloc(5 * 1024 * 1024); // 5 MB
  const directResult = mediaDownloaderService._packageResult({
    title: 'Awesome Song',
    author: 'Artist',
    platform: 'youtube',
    format: 'mp3',
    buffer: mockBuffer,
    mimetype: 'audio/mp4',
    fileName: 'Awesome_Song.mp3',
    url: 'https://youtube.com/watch?v=123',
  });

  assert.equal(directResult.ok, true);
  assert.equal(directResult.whatsappDirect, true);
  assert.equal(directResult.deliveryMode, 'whatsapp_direct');
  assert.equal(directResult.format, 'mp3');
  assert.equal(directResult.fileSizeMb, '5.0');
  assert.ok(directResult.buffer);

  const card = mediaDownloaderService.formatDownloadMessage(directResult, true);
  assert.ok(card.includes('Boss, ye lo!'));
  assert.ok(card.includes('Awesome Song'));
  assert.ok(card.includes('5.0 MB'));

  // Web download link mock (> 16MB)
  const bigBuffer = Buffer.alloc(20 * 1024 * 1024); // 20 MB
  const bigResult = mediaDownloaderService._packageResult({
    title: 'High Res Movie',
    author: 'Director',
    platform: 'youtube',
    format: 'mp4',
    buffer: bigBuffer,
    mimetype: 'video/mp4',
    fileName: 'High_Res_Movie.mp4',
    url: 'https://youtube.com/watch?v=456',
  });

  assert.equal(bigResult.ok, true);
  assert.equal(bigResult.whatsappDirect, false);
  assert.equal(bigResult.deliveryMode, 'web_download_link');
  assert.equal(bigResult.fileSizeMb, '20.0');
  assert.ok(bigResult.directLink.includes('/api/download/'));

  const bigCard = mediaDownloaderService.formatDownloadMessage(bigResult, true);
  assert.ok(bigCard.includes('16MB WhatsApp limit'));
  assert.ok(bigCard.includes(bigResult.directLink));
});

test('📥 Rocket Media Downloader — YouTube Stream Download Live Verification', async () => {
  // Live test YouTube highest audio MP3 streaming
  const result = await mediaDownloaderService.downloadMedia({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    format: 'mp3',
    quality: 'highest',
    maxSizeBytes: 15 * 1024 * 1024,
  });

  assert.equal(result.ok, true);
  assert.equal(result.platform, 'youtube');
  assert.equal(result.format, 'mp3');
  assert.ok(result.title.includes('Never Gonna Give You Up'));
  assert.ok(result.buffer && result.buffer.length > 500000); // Has real audio bytes > 500KB
  assert.ok(result.fileName.endsWith('.mp3'));
});

test('📥 Rocket Media Downloader — Tool Execution via executeRocketTool', async () => {
  const context = {
    chatId: 'wa_sandy_master',
    isSandy: true,
    pendingMedia: [],
  };

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
  assert.ok(context.pendingMedia.length > 0, 'context.pendingMedia should receive buffered audio for WhatsApp');
  assert.equal(context.pendingMedia[0].format, 'mp3');
  assert.ok(context.pendingMedia[0].buffer.length > 500000);
});

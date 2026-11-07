import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const brainDir = 'C:/Users/S4NDY/.gemini/antigravity/brain/05cc4409-4618-4084-9d97-ecb008c2211d';
const outEmojiDir = path.resolve('assets/emojis');

const mapping = [
  { prefix: 'gigachad_emoji', target: 'gigachad.png' },
  { prefix: 'anya_smirk_emoji', target: 'anya_smirk.png' },
  { prefix: 'popcat_emoji', target: 'popcat.png' },
  { prefix: 'pepe_monkas_emoji', target: 'pepe_monkas.png' },
  { prefix: 'crying_cat_thumbs_up_emoji', target: 'crying_cat.png' },
  { prefix: 'this_is_fine_emoji', target: 'this_is_fine.png' },
  { prefix: 'pedro_raccoon_emoji', target: 'pedro_raccoon.png' },
  { prefix: 'keyboard_rage_emoji', target: 'keyboard_rage.png' },
];

async function processImages() {
  const allFiles = fs.readdirSync(brainDir);

  for (const item of mapping) {
    const match = allFiles.find((f) => f.startsWith(item.prefix) && f.endsWith('.jpg'));
    if (!match) {
      console.warn(`[Warning] No match found for prefix: ${item.prefix}`);
      continue;
    }

    const srcPath = path.join(brainDir, match);
    const dstPath = path.join(outEmojiDir, item.target);

    // Create a 128x128 rounded circle sticker with subtle dark border
    const roundedMask = Buffer.from(
      `<svg width="128" height="128"><circle cx="64" cy="64" r="62" fill="#fff" /></svg>`
    );

    await sharp(srcPath)
      .resize(128, 128, { fit: 'cover' })
      .composite([{
        input: roundedMask,
        blend: 'dest-in'
      }])
      .png({ quality: 90 })
      .toFile(dstPath);

    console.log(`[Processor] Converted ${match} -> ${item.target} (128x128 PNG)`);
  }

  console.log('[Processor] All viral meme illustrations processed cleanly!');
}

processImages().catch(console.error);

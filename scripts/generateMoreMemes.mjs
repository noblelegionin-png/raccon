import pkg from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = pkg;
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OUT_DIR = path.resolve('assets/emojis');

// Clean up test_spin.gif if exists
const testSpin = path.join(OUT_DIR, 'test_spin.gif');
if (fs.existsSync(testSpin)) fs.unlinkSync(testSpin);

async function renderSvgToPng(svg, filename) {
  const dst = path.join(OUT_DIR, filename);
  await sharp(Buffer.from(svg))
    .resize(128, 128)
    .png({ quality: 90 })
    .toFile(dst);
  console.log(`[MoreMemes] Created ${filename}`);
}

async function renderSvgFramesToGif(frames, outFilename, delay = 80) {
  const width = 128;
  const height = 128;
  const gif = GIFEncoder();

  for (const svg of frames) {
    const { data } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay });
  }

  gif.finish();
  const buffer = Buffer.from(gif.bytes());
  const filePath = path.join(OUT_DIR, outFilename);
  fs.writeFileSync(filePath, buffer);
  console.log(`[MoreMemes] Created animated ${outFilename} (${buffer.length} bytes)`);
}

async function run() {
  // 1. capybara_chill.png - "OK I PULL UP" Capybara with orange on head
  const capybaraSvg = `
    <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="62" fill="#8d6e63" stroke="#5d4037" stroke-width="4"/>
      <!-- Snout -->
      <rect x="36" y="52" width="56" height="42" rx="16" fill="#6d4c41"/>
      <ellipse cx="50" cy="74" rx="4" ry="7" fill="#3e2723"/>
      <ellipse cx="78" cy="74" rx="4" ry="7" fill="#3e2723"/>
      <!-- Eyes closed chilling -->
      <line x1="36" y1="48" x2="48" y2="48" stroke="#3e2723" stroke-width="4" stroke-linecap="round"/>
      <line x1="80" y1="48" x2="92" y2="48" stroke="#3e2723" stroke-width="4" stroke-linecap="round"/>
      <!-- Orange on head -->
      <circle cx="64" cy="22" r="14" fill="#ff9800" stroke="#f57c00" stroke-width="2"/>
      <path d="M 64,8 Q 68,4 72,6" fill="none" stroke="#4caf50" stroke-width="3" stroke-linecap="round"/>
      <!-- Caption -->
      <rect x="20" y="98" width="88" height="20" rx="5" fill="#3e2723"/>
      <text x="64" y="113" font-size="11" font-weight="900" fill="#ffb74d" text-anchor="middle" font-family="sans-serif">OK I PULL UP</text>
    </svg>
  `;
  await renderSvgToPng(capybaraSvg, 'capybara_chill.png');

  // 2. clown_honk.png - Honk Honk Clown Meme
  const clownSvg = `
    <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="62" fill="#f8fafc" stroke="#ef4444" stroke-width="4"/>
      <!-- Rainbow hair -->
      <circle cx="22" cy="46" r="20" fill="#3b82f6"/>
      <circle cx="106" cy="46" r="20" fill="#10b981"/>
      <circle cx="64" cy="18" r="16" fill="#f59e0b"/>
      <!-- Big red nose -->
      <circle cx="64" cy="66" r="18" fill="#ef4444"/>
      <!-- Makeup smile -->
      <path d="M 38,82 Q 64,110 90,82" fill="none" stroke="#dc2626" stroke-width="6" stroke-linecap="round"/>
      <!-- Eyes -->
      <line x1="42" y1="42" x2="42" y2="58" stroke="#3b82f6" stroke-width="5" stroke-linecap="round"/>
      <line x1="86" y1="42" x2="86" y2="58" stroke="#3b82f6" stroke-width="5" stroke-linecap="round"/>
      <text x="64" y="122" font-size="11" font-weight="900" fill="#ef4444" text-anchor="middle" font-family="sans-serif">🤡 HONK HONK</text>
    </svg>
  `;
  await renderSvgToPng(clownSvg, 'clown_honk.png');

  // 3. doge_bonk.png - Cheems BONK
  const bonkSvg = `
    <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="62" fill="#fef08a" stroke="#ca8a04" stroke-width="4"/>
      <!-- Doge face -->
      <ellipse cx="54" cy="72" rx="36" ry="30" fill="#eab308"/>
      <!-- Cheeks & snout -->
      <ellipse cx="44" cy="80" rx="16" ry="12" fill="#fef9c3"/>
      <circle cx="36" cy="74" r="5" fill="#1e293b"/>
      <circle cx="56" cy="62" r="4" fill="#1e293b"/>
      <!-- Baseball Bat hitting head -->
      <rect x="70" y="24" width="46" height="14" rx="6" fill="#b45309" transform="rotate(35, 70, 24)"/>
      <text x="86" y="22" font-size="16" font-weight="900" fill="#dc2626" font-family="sans-serif">BONK!</text>
      <!-- Dizzy stars -->
      <text x="32" y="38" font-size="18">💫</text>
    </svg>
  `;
  await renderSvgToPng(bonkSvg, 'doge_bonk.png');

  // 4. huh_cat.png - Confused spinning cat
  const huhSvg = `
    <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="62" fill="#1e293b" stroke="#64748b" stroke-width="4"/>
      <circle cx="64" cy="64" r="42" fill="#cbd5e1"/>
      <!-- Giant question marks -->
      <text x="24" y="34" font-size="28" font-weight="900" fill="#facc15" font-family="sans-serif">?</text>
      <text x="92" y="38" font-size="28" font-weight="900" fill="#facc15" font-family="sans-serif">?</text>
      <!-- Cat eyes squinted in bewilderment -->
      <ellipse cx="48" cy="58" rx="8" ry="11" fill="#0f172a"/>
      <ellipse cx="80" cy="58" rx="8" ry="11" fill="#0f172a"/>
      <text x="64" y="84" font-size="20" text-anchor="middle">🐱</text>
      <!-- HUH banner -->
      <rect x="34" y="96" width="60" height="20" rx="5" fill="#facc15"/>
      <text x="64" y="111" font-size="13" font-weight="900" fill="#0f172a" text-anchor="middle" font-family="sans-serif">HUH???</text>
    </svg>
  `;
  await renderSvgToPng(huhSvg, 'huh_cat.png');

  // 5. galaxy_brain.gif - Exploding galaxy brain animated
  const brainFrames = [];
  for (let i = 0; i < 10; i++) {
    const scale = 1 + (i % 5) * 0.15;
    const hue = (i * 36) % 360;
    brainFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="24" fill="#090a0f"/>
        <!-- Cosmic blast rays -->
        <circle cx="64" cy="64" r="${40 * scale}" fill="none" stroke="hsl(${hue}, 100%, 65%)" stroke-width="4" stroke-dasharray="8 6"/>
        <g transform="translate(64,64) scale(${scale})">
          <text x="0" y="16" font-size="44" text-anchor="middle">🧠</text>
        </g>
        <text x="16" y="26" font-size="16">✨</text>
        <text x="96" y="104" font-size="16">💥</text>
        <text x="64" y="122" font-size="12" font-weight="900" fill="#38bdf8" text-anchor="middle" font-family="sans-serif">GALAXY BRAIN</text>
      </svg>
    `);
  }
  await renderSvgFramesToGif(brainFrames, 'galaxy_brain.gif', 85);

  // 6. spinning_rat.gif - Free low-poly spinning rat meme
  const ratFrames = [];
  for (let i = 0; i < 12; i++) {
    const angle = Math.round((i / 12) * 360);
    const bgHue = (i * 30) % 360;
    ratFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <circle cx="64" cy="64" r="62" fill="hsl(${bgHue}, 90%, 25%)" stroke="#fff" stroke-width="3"/>
        <g transform="translate(64,64) rotate(${angle})">
          <text x="0" y="16" font-size="52" text-anchor="middle">🐀</text>
        </g>
        <text x="64" y="118" font-size="11" font-weight="900" fill="#fff" text-anchor="middle" font-family="sans-serif">SPINNING RAT</text>
      </svg>
    `);
  }
  await renderSvgFramesToGif(ratFrames, 'spinning_rat.gif', 70);

  console.log('[MoreMemes] Additional viral meme pack ready!');
}

run().catch(console.error);

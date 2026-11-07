import pkg from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = pkg;
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OUT_DIR = path.resolve('assets/emojis');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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
  console.log(`[GIF Engine] Created ${outFilename} (${buffer.length} bytes)`);
  return filePath;
}

async function generateAllAnimatedGifs() {
  console.log('[GIF Engine] Starting viral animated GIF generator...');

  // 1. pedro_spin.gif - Viral Pedro spinning raccoon dance with rainbow background
  const pedroFrames = [];
  for (let i = 0; i < 12; i++) {
    const angle = Math.round((i / 12) * 360);
    const hue = Math.round((i / 12) * 360);
    pedroFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <circle cx="64" cy="64" r="62" fill="hsl(${hue}, 85%, 25%)" stroke="hsl(${hue}, 100%, 70%)" stroke-width="4" />
        <g transform="translate(64,64) rotate(${angle})">
          <circle cx="0" cy="0" r="44" fill="#1e272e" />
          <text x="0" y="15" font-size="42" text-anchor="middle" font-family="'Segoe UI Emoji', sans-serif">🦝</text>
          <text x="-24" y="-20" font-size="20">✨</text>
          <text x="18" y="28" font-size="20">✨</text>
        </g>
      </svg>
    `);
  }
  await renderSvgFramesToGif(pedroFrames, 'pedro_spin.gif', 65);

  // 2. popcat_loop.gif - Popcat opening mouth huge and small
  const popcatFrames = [];
  const mouthSizes = [12, 18, 30, 42, 42, 30, 18, 12];
  for (let i = 0; i < mouthSizes.length; i++) {
    const r = mouthSizes[i];
    const isWide = r > 25;
    popcatFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="28" fill="#f8efba" />
        <!-- Cat Face -->
        <circle cx="64" cy="68" r="46" fill="#f5cd79" />
        <!-- Ears -->
        <polygon points="26,38 42,12 54,34" fill="#e15f41" />
        <polygon points="102,38 86,12 74,34" fill="#e15f41" />
        <!-- Eyes -->
        <circle cx="44" cy="54" r="6" fill="#1e272e" />
        <circle cx="84" cy="54" r="6" fill="#1e272e" />
        <!-- Mouth -->
        ${isWide
          ? `<ellipse cx="64" cy="84" rx="${r * 0.85}" ry="${r * 1.1}" fill="#b33939" stroke="#303952" stroke-width="3" />`
          : `<line x1="56" y1="80" x2="64" y2="86" stroke="#303952" stroke-width="4" stroke-linecap="round"/>
             <line x1="72" y1="80" x2="64" y2="86" stroke="#303952" stroke-width="4" stroke-linecap="round"/>`
        }
      </svg>
    `);
  }
  await renderSvgFramesToGif(popcatFrames, 'popcat_loop.gif', 90);

  // 3. cat_jam.gif - Head bopping cat to the beat
  const catJamFrames = [];
  const bobOffsets = [0, 4, 9, 14, 18, 14, 8, 3, -2, -6, -3, 0];
  for (let i = 0; i < bobOffsets.length; i++) {
    const yOff = bobOffsets[i];
    const rot = (bobOffsets[i] / 18) * 12;
    catJamFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="24" fill="#2c2c54" />
        <g transform="translate(64, ${64 + yOff}) rotate(${rot})">
          <!-- Headphones -->
          <path d="M -42,-4 A 42,42 0 0,1 42,-4" fill="none" stroke="#ff5252" stroke-width="6" />
          <rect x="-48" y="-12" width="12" height="24" rx="4" fill="#ff5252" />
          <rect x="36" y="-12" width="12" height="24" rx="4" fill="#ff5252" />
          <!-- Head -->
          <circle cx="0" cy="8" r="36" fill="#f1f2f6" />
          <!-- Closed happy eyes -->
          <path d="M -22,4 Q -14,14 -6,4" fill="none" stroke="#2f3542" stroke-width="4" stroke-linecap="round" />
          <path d="M 6,4 Q 14,14 22,4" fill="none" stroke="#2f3542" stroke-width="4" stroke-linecap="round" />
          <!-- Blush -->
          <circle cx="-20" cy="16" r="6" fill="#ffb8b8" opacity="0.8" />
          <circle cx="20" cy="16" r="6" fill="#ffb8b8" opacity="0.8" />
        </g>
        <!-- Musical notes -->
        <text x="${20 + (i % 3) * 6}" y="${28 - (i % 4) * 3}" font-size="18" fill="#ffd32a">🎵</text>
        <text x="${88 - (i % 3) * 6}" y="${34 + (i % 3) * 3}" font-size="16" fill="#ff3838">🎶</text>
      </svg>
    `);
  }
  await renderSvgFramesToGif(catJamFrames, 'cat_jam.gif', 75);

  // 4. hyper_rage.gif - Red vibrating keyboard rage
  const rageFrames = [];
  for (let i = 0; i < 10; i++) {
    const dx = (Math.random() - 0.5) * 16;
    const dy = (Math.random() - 0.5) * 16;
    const isFlashing = i % 2 === 0;
    rageFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="20" fill="${isFlashing ? '#ff3838' : '#7f1d1d'}" />
        <g transform="translate(${64 + dx}, ${64 + dy})">
          <circle cx="0" cy="0" r="42" fill="#1e272e" stroke="#fffa65" stroke-width="4" />
          <text x="0" y="16" font-size="44" text-anchor="middle">🤬</text>
        </g>
        <text x="8" y="24" font-size="16" font-weight="900" fill="#fff200" font-family="sans-serif">RAGE!!</text>
        <text x="68" y="120" font-size="16" font-weight="900" fill="#fff200" font-family="sans-serif">#@!%$</text>
      </svg>
    `);
  }
  await renderSvgFramesToGif(rageFrames, 'hyper_rage.gif', 60);

  // 5. money_rain.gif - Raining Nero Coins & Pizza
  const moneyFrames = [];
  for (let i = 0; i < 10; i++) {
    const yOffset = (i / 10) * 128;
    moneyFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="24" fill="#05c46b" />
        <!-- Falling coins -->
        <g transform="translate(24, ${(yOffset) % 128})">
          <circle cx="0" cy="0" r="14" fill="#ffd32a" stroke="#d48806" stroke-width="2"/>
          <text x="0" y="6" font-size="16" text-anchor="middle" font-weight="bold">🪙</text>
        </g>
        <g transform="translate(94, ${(yOffset + 48) % 128})">
          <circle cx="0" cy="0" r="14" fill="#ffd32a" stroke="#d48806" stroke-width="2"/>
          <text x="0" y="6" font-size="16" text-anchor="middle" font-weight="bold">🪙</text>
        </g>
        <g transform="translate(60, ${(yOffset + 80) % 128})">
          <text x="0" y="8" font-size="24" text-anchor="middle">🍕</text>
        </g>
        <!-- Center Boss Face with sunglasses -->
        <circle cx="64" cy="68" r="32" fill="#1e272e" stroke="#ffd32a" stroke-width="3"/>
        <text x="64" y="80" font-size="34" text-anchor="middle">🤑</text>
      </svg>
    `);
  }
  await renderSvgFramesToGif(moneyFrames, 'money_rain.gif', 80);

  // 6. siren_police.gif - Flashing emergency beacon (WEE WOO / 4K / CAUGHT)
  const sirenFrames = [];
  for (let i = 0; i < 8; i++) {
    const isRed = i % 2 === 0;
    const bg = isRed ? '#ff3838' : '#1e90ff';
    const flare = isRed ? '#ff4d4d' : '#70a1ff';
    sirenFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="24" fill="${bg}" />
        <circle cx="64" cy="64" r="54" fill="${flare}" opacity="0.6" />
        <g transform="translate(64,64)">
          <text x="0" y="16" font-size="48" text-anchor="middle">🚨</text>
        </g>
        <rect x="18" y="96" width="92" height="22" rx="6" fill="#1e272e" />
        <text x="64" y="112" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="sans-serif">CAUGHT IN 4K</text>
      </svg>
    `);
  }
  await renderSvgFramesToGif(sirenFrames, 'siren_police.gif', 110);

  // 7. stonks_rocket.gif - Stonks green laser arrow going to the moon
  const stonksFrames = [];
  for (let i = 0; i < 10; i++) {
    const shift = (i / 10) * 20;
    stonksFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="24" fill="#0f172a" />
        <!-- Grid lines -->
        <line x1="0" y1="96" x2="128" y2="96" stroke="#334155" stroke-width="1" />
        <line x1="0" y1="64" x2="128" y2="64" stroke="#334155" stroke-width="1" />
        <line x1="0" y1="32" x2="128" y2="32" stroke="#334155" stroke-width="1" />
        <!-- Upward Arrow -->
        <polyline points="12,108 44,82 76,54 116,${24 - shift / 2}" fill="none" stroke="#22c55e" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        <polygon points="116,${14 - shift / 2} 124,${28 - shift / 2} 108,${26 - shift / 2}" fill="#22c55e" />
        <!-- Stonks Head -->
        <circle cx="48" cy="46" r="22" fill="#cbd5e1" stroke="#22c55e" stroke-width="3" />
        <text x="48" y="55" font-size="24" text-anchor="middle">📈</text>
        <text x="64" y="120" font-size="15" font-weight="900" fill="#22c55e" text-anchor="middle" font-family="sans-serif">STONKS 🚀</text>
      </svg>
    `);
  }
  await renderSvgFramesToGif(stonksFrames, 'stonks_rocket.gif', 85);

  // 8. skull_real.gif - Golden glowing vibrating skull Real/Bruh
  const skullFrames = [];
  for (let i = 0; i < 8; i++) {
    const glow = 2 + (i % 4) * 3;
    const dy = (i % 2 === 0) ? -2 : 2;
    skullFrames.push(`
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="24" fill="#18181b" />
        <circle cx="64" cy="64" r="48" fill="#27272a" stroke="#eab308" stroke-width="${glow}" />
        <g transform="translate(64, ${64 + dy})">
          <text x="0" y="16" font-size="52" text-anchor="middle">💀</text>
        </g>
        <rect x="24" y="98" width="80" height="20" rx="5" fill="#eab308" />
        <text x="64" y="113" font-size="12" font-weight="900" fill="#000000" text-anchor="middle" font-family="sans-serif">REAL BRUH</text>
      </svg>
    `);
  }
  await renderSvgFramesToGif(skullFrames, 'skull_real.gif', 90);

  console.log('[GIF Engine] All 8 viral animated GIFs generated successfully!');
}

generateAllAnimatedGifs().catch(console.error);

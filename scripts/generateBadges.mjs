import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('assets/emojis');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function createBadges() {
  // 1. nero_coin
  const coinSvg = `
  <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="goldGrad" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#FFF4B8"/>
        <stop offset="40%" stop-color="#FFD700"/>
        <stop offset="80%" stop-color="#FFA500"/>
        <stop offset="100%" stop-color="#CC7A00"/>
      </radialGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <!-- Outer Rim -->
    <circle cx="128" cy="128" r="116" fill="url(#goldGrad)" stroke="#5A3800" stroke-width="12" filter="url(#glow)"/>
    <circle cx="128" cy="128" r="96" fill="none" stroke="#FFF" stroke-width="6" stroke-dasharray="12 8" opacity="0.6"/>
    <!-- Raccoon Paw Center -->
    <g fill="#5A3800">
      <!-- Main Pad -->
      <ellipse cx="128" cy="148" rx="40" ry="32"/>
      <!-- 4 Toe Beans -->
      <circle cx="88" cy="104" r="14"/>
      <circle cx="114" cy="88" r="15"/>
      <circle cx="142" cy="88" r="15"/>
      <circle cx="168" cy="104" r="14"/>
    </g>
    <!-- Anime Sparkles -->
    <path d="M50 60 Q60 60 60 50 Q60 60 70 60 Q60 60 60 70 Q60 60 50 60 Z" fill="#FFF"/>
    <path d="M190 170 Q200 170 200 160 Q200 170 210 170 Q200 170 200 180 Q200 170 190 170 Z" fill="#FFF"/>
  </svg>`;
  await sharp(Buffer.from(coinSvg)).png().toFile(path.join(outDir, 'nero_coin.png'));
  console.log('Created nero_coin.png');

  // 2. nero_pizza
  const pizzaSvg = `
  <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cheeseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF076"/>
        <stop offset="60%" stop-color="#FFCA28"/>
        <stop offset="100%" stop-color="#FF9800"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>
    <!-- Crust -->
    <path d="M28 60 Q128 20 228 60 L220 84 Q128 48 36 84 Z" fill="#B26A00" stroke="#4E2600" stroke-width="8" filter="url(#shadow)"/>
    <!-- Cheese Body -->
    <path d="M38 78 Q128 46 218 78 L128 236 Z" fill="url(#cheeseGrad)" stroke="#4E2600" stroke-width="8"/>
    <!-- Melt Drips -->
    <path d="M70 110 Q78 140 86 115 Q95 150 108 120 Q128 170 144 125 Q158 150 170 118" fill="none" stroke="#FFA000" stroke-width="6" stroke-linecap="round"/>
    <!-- Pepperonis with Anime Highlights -->
    <g fill="#D32F2F" stroke="#4E2600" stroke-width="6">
      <circle cx="100" cy="110" r="20"/>
      <circle cx="154" cy="116" r="22"/>
      <circle cx="128" cy="170" r="18"/>
    </g>
    <!-- Highlights -->
    <ellipse cx="94" cy="104" rx="6" ry="4" fill="#FFF" opacity="0.7"/>
    <ellipse cx="148" cy="110" rx="7" ry="4" fill="#FFF" opacity="0.7"/>
    <ellipse cx="124" cy="164" rx="5" ry="3" fill="#FFF" opacity="0.7"/>
    <!-- Anime Sparkles -->
    <path d="M205 130 Q215 130 215 120 Q215 130 225 130 Q215 130 215 140 Q215 130 205 130 Z" fill="#FFF"/>
  </svg>`;
  await sharp(Buffer.from(pizzaSvg)).png().toFile(path.join(outDir, 'nero_pizza.png'));
  console.log('Created nero_pizza.png');

  // 3. buyer_crown
  const crownSvg = `
  <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="crownGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF6BD"/>
        <stop offset="50%" stop-color="#FFD700"/>
        <stop offset="100%" stop-color="#E68A00"/>
      </linearGradient>
      <filter id="cShadow">
        <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <!-- Velvet Pillow -->
    <ellipse cx="128" cy="168" rx="88" ry="40" fill="#8E24AA" stroke="#311B92" stroke-width="8" filter="url(#cShadow)"/>
    <!-- Gold Crown Peaks -->
    <path d="M40 170 L48 80 L92 120 L128 50 L164 120 L208 80 L216 170 Z" fill="url(#crownGold)" stroke="#4A2E00" stroke-width="8" filter="url(#cShadow)"/>
    <!-- Crown Base Band -->
    <rect x="36" y="166" width="184" height="34" rx="10" fill="url(#crownGold)" stroke="#4A2E00" stroke-width="8"/>
    <!-- Jewels -->
    <circle cx="128" cy="50" r="14" fill="#00E5FF" stroke="#006064" stroke-width="5"/>
    <circle cx="48" cy="80" r="12" fill="#FF1744" stroke="#880E4F" stroke-width="5"/>
    <circle cx="208" cy="80" r="12" fill="#FF1744" stroke="#880E4F" stroke-width="5"/>
    <!-- Base Jewels -->
    <circle cx="75" cy="183" r="8" fill="#00E5FF"/>
    <circle cx="128" cy="183" r="10" fill="#FF1744"/>
    <circle cx="181" cy="183" r="8" fill="#00E5FF"/>
    <!-- Shine -->
    <path d="M110 90 Q128 65 146 90 Q128 80 110 90 Z" fill="#FFF" opacity="0.8"/>
  </svg>`;
  await sharp(Buffer.from(crownSvg)).png().toFile(path.join(outDir, 'buyer_crown.png'));
  console.log('Created buyer_crown.png');

  // 4. dev_terminal
  const devSvg = `
  <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="screenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F2027"/>
        <stop offset="100%" stop-color="#203A43"/>
      </linearGradient>
      <filter id="dShadow">
        <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <!-- Raccoon Ears on Monitor -->
    <polygon points="50,90 20,40 80,60" fill="#424242" stroke="#212121" stroke-width="8"/>
    <polygon points="45,80 30,50 68,65" fill="#FF8A80"/>
    <polygon points="206,90 236,40 176,60" fill="#424242" stroke="#212121" stroke-width="8"/>
    <polygon points="211,80 226,50 188,65" fill="#FF8A80"/>
    <!-- Monitor Stand -->
    <rect x="112" y="190" width="32" height="26" fill="#616161" stroke="#212121" stroke-width="6"/>
    <ellipse cx="128" cy="218" rx="54" ry="14" fill="#424242" stroke="#212121" stroke-width="6"/>
    <!-- Monitor Frame -->
    <rect x="30" y="66" width="196" height="132" rx="16" fill="#37474F" stroke="#212121" stroke-width="8" filter="url(#dShadow)"/>
    <!-- Screen -->
    <rect x="44" y="80" width="168" height="104" rx="8" fill="url(#screenGrad)"/>
    <!-- Code Lines / Terminal -->
    <text x="54" y="116" font-family="monospace" font-size="26" font-weight="bold" fill="#00E676">&gt;_</text>
    <rect x="92" y="102" width="70" height="14" rx="4" fill="#00E5FF" opacity="0.9"/>
    <rect x="54" y="132" width="120" height="10" rx="3" fill="#FF4081" opacity="0.8"/>
    <rect x="54" y="150" width="90" height="10" rx="3" fill="#FFD700" opacity="0.8"/>
    <circle cx="188" cy="96" r="5" fill="#00E676"/>
  </svg>`;
  await sharp(Buffer.from(devSvg)).png().toFile(path.join(outDir, 'dev_terminal.png'));
  console.log('Created dev_terminal.png');

  // 5. rocket_hype
  const hypeSvg = `
  <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFDE7"/>
        <stop offset="50%" stop-color="#FFEB3B"/>
        <stop offset="100%" stop-color="#FF6D00"/>
      </linearGradient>
      <filter id="hShadow">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#FF6D00" flood-opacity="0.6"/>
      </filter>
    </defs>
    <!-- Electric Aura -->
    <circle cx="128" cy="128" r="105" fill="#FF9100" opacity="0.2" filter="url(#hShadow)"/>
    <!-- Lightning Bolt -->
    <polygon points="148,20 54,136 124,136 108,236 202,120 132,120" fill="url(#boltGrad)" stroke="#4E2600" stroke-width="10" stroke-linejoin="round" filter="url(#hShadow)"/>
    <!-- Anime Sparks -->
    <path d="M40 70 Q55 70 55 55 Q55 70 70 70 Q55 70 55 85 Q55 70 40 70 Z" fill="#FFF"/>
    <path d="M190 190 Q205 190 205 175 Q205 190 220 190 Q205 190 205 205 Q205 190 190 190 Z" fill="#00E5FF"/>
  </svg>`;
  await sharp(Buffer.from(hypeSvg)).png().toFile(path.join(outDir, 'rocket_hype.png'));
  console.log('Created rocket_hype.png');

  // 6. rocket_salute
  const saluteSvg = `
  <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="faceGrad" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#9E9E9E"/>
        <stop offset="70%" stop-color="#616161"/>
        <stop offset="100%" stop-color="#424242"/>
      </radialGradient>
      <filter id="rShadow">
        <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>
    <!-- Raccoon Ears -->
    <polygon points="60,100 24,36 96,60" fill="#424242" stroke="#212121" stroke-width="8"/>
    <polygon points="56,90 38,48 84,68" fill="#FF8A80"/>
    <polygon points="196,100 232,36 160,60" fill="#424242" stroke="#212121" stroke-width="8"/>
    <polygon points="200,90 218,48 172,68" fill="#FF8A80"/>
    <!-- Head -->
    <ellipse cx="128" cy="140" rx="84" ry="74" fill="url(#faceGrad)" stroke="#212121" stroke-width="8" filter="url(#rShadow)"/>
    <!-- Bandit Mask -->
    <path d="M46 130 Q128 150 210 130 Q218 160 196 172 Q128 182 60 172 Q38 160 46 130 Z" fill="#212121"/>
    <!-- White Cheeks -->
    <ellipse cx="70" cy="170" rx="34" ry="24" fill="#FFFFFF"/>
    <ellipse cx="186" cy="170" rx="34" ry="24" fill="#FFFFFF"/>
    <!-- Big Anime Eyes -->
    <!-- Left Eye (Wink) -->
    <path d="M72 144 Q88 130 104 144" fill="none" stroke="#FFF" stroke-width="7" stroke-linecap="round"/>
    <!-- Right Eye (Open with sparkles) -->
    <ellipse cx="166" cy="144" rx="16" ry="20" fill="#29B6F6" stroke="#FFF" stroke-width="4"/>
    <circle cx="162" cy="138" r="6" fill="#FFF"/>
    <circle cx="172" cy="150" r="3" fill="#FFF"/>
    <!-- Cute Nose & Mouth -->
    <polygon points="128,168 120,160 136,160" fill="#212121"/>
    <path d="M120 172 Q128 180 136 172" fill="none" stroke="#212121" stroke-width="5" stroke-linecap="round"/>
    <!-- Cute Red Tongue -->
    <path d="M124 176 Q128 186 132 176 Z" fill="#FF5252"/>
    <!-- Saluting Paw (Raised to brow) -->
    <g transform="translate(160, 60)" filter="url(#rShadow)">
      <ellipse cx="36" cy="30" rx="28" ry="18" fill="#424242" stroke="#212121" stroke-width="7" transform="rotate(-30 36 30)"/>
      <circle cx="20" cy="18" r="8" fill="#FF8A80"/>
      <circle cx="34" cy="12" r="8" fill="#FF8A80"/>
      <circle cx="50" cy="16" r="8" fill="#FF8A80"/>
      <!-- Saluting White Glove/Band -->
      <rect x="42" y="30" width="18" height="12" rx="4" fill="#FFF" stroke="#212121" stroke-width="4"/>
    </g>
    <!-- Sparkles -->
    <path d="M210 70 Q220 70 220 60 Q220 70 230 70 Q220 70 220 80 Q220 70 210 70 Z" fill="#FFD700"/>
  </svg>`;
  await sharp(Buffer.from(saluteSvg)).png().toFile(path.join(outDir, 'rocket_salute.png'));
  console.log('Created rocket_salute.png');

  // 7. rocket_evil (Chaos smirk)
  const evilSvg = `
  <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="evilFace" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#9E9E9E"/>
        <stop offset="100%" stop-color="#37474F"/>
      </radialGradient>
      <filter id="eShadow">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#7B1FA2" flood-opacity="0.5"/>
      </filter>
    </defs>
    <!-- Ears -->
    <polygon points="60,100 24,36 96,60" fill="#37474F" stroke="#212121" stroke-width="8"/>
    <polygon points="56,90 38,48 84,68" fill="#BA68C8"/>
    <polygon points="196,100 232,36 160,60" fill="#37474F" stroke="#212121" stroke-width="8"/>
    <polygon points="200,90 218,48 172,68" fill="#BA68C8"/>
    <!-- Head -->
    <ellipse cx="128" cy="140" rx="84" ry="74" fill="url(#evilFace)" stroke="#212121" stroke-width="8" filter="url(#eShadow)"/>
    <!-- Mask -->
    <path d="M46 130 Q128 150 210 130 Q218 160 196 172 Q128 182 60 172 Q38 160 46 130 Z" fill="#212121"/>
    <!-- Slanted Evil Anime Eyes with purple glow -->
    <polygon points="70,140 104,152 76,156" fill="#E040FB" stroke="#FFF" stroke-width="3"/>
    <polygon points="186,140 152,152 180,156" fill="#E040FB" stroke="#FFF" stroke-width="3"/>
    <!-- Mischievous Shark Tooth Smirk -->
    <path d="M96 172 Q128 196 160 172 Z" fill="#FFF" stroke="#212121" stroke-width="6"/>
    <!-- Little Sharp Fang -->
    <polygon points="144,172 150,172 147,180" fill="#212121"/>
    <!-- Little Devil Horns (Neon Energy) -->
    <path d="M70 45 Q75 20 60 15 Q75 30 85 40 Z" fill="#FF1744"/>
    <path d="M186 45 Q181 20 196 15 Q181 30 171 40 Z" fill="#FF1744"/>
  </svg>`;
  await sharp(Buffer.from(evilSvg)).png().toFile(path.join(outDir, 'rocket_evil.png'));
  console.log('Created rocket_evil.png');

  // 8. rocket_love (Heart eyes)
  const loveSvg = `
  <svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="loveFace" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#BDBDBD"/>
        <stop offset="100%" stop-color="#616161"/>
      </radialGradient>
      <filter id="lShadow">
        <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#E91E63" flood-opacity="0.4"/>
      </filter>
    </defs>
    <!-- Ears -->
    <polygon points="60,100 24,36 96,60" fill="#424242" stroke="#212121" stroke-width="8"/>
    <polygon points="56,90 38,48 84,68" fill="#F48FB1"/>
    <polygon points="196,100 232,36 160,60" fill="#424242" stroke="#212121" stroke-width="8"/>
    <polygon points="200,90 218,48 172,68" fill="#F48FB1"/>
    <!-- Head -->
    <ellipse cx="128" cy="140" rx="84" ry="74" fill="url(#loveFace)" stroke="#212121" stroke-width="8" filter="url(#lShadow)"/>
    <!-- Mask -->
    <path d="M46 130 Q128 150 210 130 Q218 160 196 172 Q128 182 60 172 Q38 160 46 130 Z" fill="#212121"/>
    <!-- Blushing Cheeks -->
    <ellipse cx="64" cy="168" rx="20" ry="12" fill="#FF4081" opacity="0.6"/>
    <ellipse cx="192" cy="168" rx="20" ry="12" fill="#FF4081" opacity="0.6"/>
    <!-- Giant Heart Eyes -->
    <g fill="#FF1744" stroke="#FFF" stroke-width="4">
      <path d="M88 132 C78 120 60 125 60 140 C60 155 88 168 88 168 C88 168 116 155 116 140 C116 125 98 120 88 132 Z"/>
      <path d="M168 132 C158 120 140 125 140 140 C140 155 168 168 168 168 C168 168 196 155 196 140 C196 125 178 120 168 132 Z"/>
    </g>
    <!-- Cute Happy Open Mouth -->
    <path d="M116 172 Q128 192 140 172 Z" fill="#FF5252" stroke="#212121" stroke-width="5"/>
  </svg>`;
  await sharp(Buffer.from(loveSvg)).png().toFile(path.join(outDir, 'rocket_love.png'));
  console.log('Created rocket_love.png');
}

createBadges().catch(console.error);

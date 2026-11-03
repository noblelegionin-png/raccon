/**
 * 🦝 ROCKET AI — WWE-STYLE STATS CARD IMAGE GENERATOR
 * 
 * Generates an electric-blue / dark navy WWE championship statistics card
 * as a PNG buffer using sharp and SVG compositing.
 */

import sharp from 'sharp';

/**
 * Format minutes into a clean human readable string
 */
function formatTimeMinutes(totalMinutes) {
  const mins = Math.max(0, Number(totalMinutes) || 0);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

/**
 * Escape XML/SVG special characters
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Fetch avatar image as a base64 Data URI
 */
async function fetchAvatarBase64(avatarUrl) {
  if (!avatarUrl) return null;
  try {
    const res = await fetch(avatarUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/png';
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.warn('[StatsCard] Note fetching avatar buffer:', err.message);
    return null;
  }
}

/**
 * Render WWE-Inspired Statistics Card as a PNG Buffer
 */
export async function renderStatsCardPng({
  user,
  activity,
  isOwner = false,
  isVerified = false,
  joinedAt = null,
  registeredGames = [],
}) {
  const rankInfo = activity.rankInfo;
  const safeDisplayName = escapeXml(activity.display_name || user.globalName || user.username || 'Contender');
  const safeUsername = escapeXml(user.tag || user.username || 'user');
  const avatarUrl = user.displayAvatarURL ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null;
  const avatarDataUri = await fetchAvatarBase64(avatarUrl);

  const totalXp = Number(activity.total_xp || 0).toLocaleString();
  const messagesCount = Number(activity.messages_count || 0).toLocaleString();
  const voiceTimeStr = formatTimeMinutes(activity.voice_minutes);
  const onlineTimeStr = formatTimeMinutes(activity.observed_online_minutes);
  const mediaCount = (Number(activity.memes_count || 0) + Number(activity.images_count || 0) + Number(activity.videos_count || 0)).toLocaleString();
  const voiceNotesCount = Number(activity.voice_notes_count || 0).toLocaleString();
  const joinDateStr = joinedAt ? new Date(joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';

  let gamesListStr = 'None linked';
  if (Array.isArray(registeredGames) && registeredGames.length > 0) {
    gamesListStr = registeredGames.map(g => typeof g === 'string' ? g : g.game_name).filter(Boolean).slice(0, 3).join(', ');
  }
  const safeGames = escapeXml(gamesListStr);

  const progressPercent = Math.min(100, Math.max(0, rankInfo.progressPercent || 0));
  const nextRankTarget = rankInfo.nextRankName !== 'MAX' ? `${rankInfo.nextRankMinXp.toLocaleString()} XP` : 'MAX LEVEL';

  // SVG Dimension
  const width = 920;
  const height = 520;
  const barWidth = 820;
  const filledBarWidth = Math.round((barWidth * progressPercent) / 100);

  // SVG Layout with dark navy, electric blue, and glowing neon accents
  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <!-- Background Gradient -->
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#080c14" />
        <stop offset="50%" stop-color="#0d1527" />
        <stop offset="100%" stop-color="#050810" />
      </linearGradient>

      <!-- Electric Blue Neon Gradient -->
      <linearGradient id="neonBlue" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00e5ff" />
        <stop offset="50%" stop-color="#2979ff" />
        <stop offset="100%" stop-color="#7c4dff" />
      </linearGradient>

      <!-- Gold Accent Gradient for High Ranks / Owner -->
      <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffe082" />
        <stop offset="50%" stop-color="#ffb300" />
        <stop offset="100%" stop-color="#ff6f00" />
      </linearGradient>

      <!-- Stat Box Gradient -->
      <linearGradient id="boxGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#141e33" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#0d1424" stop-opacity="0.9" />
      </linearGradient>

      <!-- Circular Avatar Clip -->
      <clipPath id="avatarClip">
        <circle cx="95" cy="115" r="45" />
      </clipPath>
    </defs>

    <!-- Outer Frame & Drop Shadow -->
    <rect x="6" y="6" width="${width - 12}" height="${height - 12}" rx="24" fill="url(#bgGrad)" stroke="url(#neonBlue)" stroke-width="3" />

    <!-- Corner Neon Accents -->
    <path d="M 12 50 L 12 18 Q 12 12 18 12 L 50 12" fill="none" stroke="#00e5ff" stroke-width="5" />
    <path d="M ${width - 50} 12 L ${width - 18} 12 Q ${width - 12} 12 ${width - 12} 18 L ${width - 12} 50" fill="none" stroke="#7c4dff" stroke-width="5" />

    <!-- Top Branding Banner -->
    <text x="50" y="42" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="900" fill="#00e5ff" letter-spacing="4">NERO LABS • WWE CHAMPIONSHIP ROSTER</text>
    <text x="${width - 50}" y="42" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#718096" letter-spacing="1">ROCKET AI APEX DIVISION</text>
    <line x1="50" y1="52" x2="${width - 50}" y2="52" stroke="#1f2c47" stroke-width="1.5" />

    <!-- User Avatar Section -->
    <circle cx="95" cy="115" r="48" fill="#1f2c47" stroke="url(#neonBlue)" stroke-width="2" />
    ${
      avatarDataUri
        ? `<image href="${avatarDataUri}" x="50" y="70" width="90" height="90" clip-path="url(#avatarClip)" />`
        : `<circle cx="95" cy="115" r="45" fill="#2979ff" /><text x="95" y="125" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#ffffff">🦝</text>`
    }

    <!-- User Names & Badges -->
    <text x="165" y="98" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" fill="#ffffff">${safeDisplayName}</text>
    <text x="165" y="124" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="600" fill="#90cdf4">@${safeUsername} • Joined ${joinDateStr} • Games: ${safeGames}</text>

    <!-- Tag Badges -->
    ${
      isOwner
        ? `<rect x="165" y="136" width="130" height="24" rx="6" fill="#ff6f00" />
           <text x="230" y="152" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#ffffff">👑 SUPREME OWNER</text>`
        : isVerified
        ? `<rect x="165" y="136" width="110" height="24" rx="6" fill="#2ecc71" />
           <text x="220" y="152" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#ffffff">🛡️ VERIFIED</text>`
        : `<rect x="165" y="136" width="115" height="24" rx="6" fill="#4a5568" />
           <text x="222" y="152" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#e2e8f0">UNVERIFIED</text>`
    }

    <rect x="${isOwner ? 305 : isVerified ? 285 : 290}" y="136" width="115" height="24" rx="6" fill="#1e3a8a" />
    <text x="${isOwner ? 362 : isVerified ? 342 : 347}" y="152" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#67e8f9">⚡ ${rankInfo.multiplier}x BOOST</text>

    <!-- WWE Championship Rank Badge Shield (Top Right) -->
    <g transform="translate(730, 68)">
      <polygon points="65,0 130,25 130,95 65,130 0,95 0,25" fill="#10192e" stroke="${isOwner ? 'url(#goldGrad)' : 'url(#neonBlue)'}" stroke-width="3" />
      <text x="65" y="32" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#94a3b8" letter-spacing="2">WWE RANK</text>
      <text x="65" y="74" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${rankInfo.rank.length > 2 ? 30 : 38}" font-weight="900" fill="${isOwner ? '#fbbf24' : '#00e5ff'}">${rankInfo.rank}</text>
      <text x="65" y="102" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="#cbd5e1">${escapeXml(rankInfo.title.slice(0, 16))}</text>
    </g>

    <!-- 6 Stat Box Grid -->
    <!-- Row 1: Box 1 (Total XP) -->
    <rect x="50" y="190" width="250" height="90" rx="14" fill="url(#boxGrad)" stroke="#1e293b" stroke-width="1.5" />
    <text x="70" y="218" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1">TOTAL XP EARNED</text>
    <text x="70" y="255" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#00e5ff">${totalXp}</text>

    <!-- Row 1: Box 2 (Messages Count) -->
    <rect x="335" y="190" width="250" height="90" rx="14" fill="url(#boxGrad)" stroke="#1e293b" stroke-width="1.5" />
    <text x="355" y="218" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1">MESSAGES SENT</text>
    <text x="355" y="255" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#ffffff">${messagesCount}</text>

    <!-- Row 1: Box 3 (Voice Time) -->
    <rect x="620" y="190" width="250" height="90" rx="14" fill="url(#boxGrad)" stroke="#1e293b" stroke-width="1.5" />
    <text x="640" y="218" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1">VOICE CHANNEL TIME</text>
    <text x="640" y="255" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#a78bfa">${voiceTimeStr}</text>

    <!-- Row 2: Box 4 (Memes & Media) -->
    <rect x="50" y="300" width="250" height="90" rx="14" fill="url(#boxGrad)" stroke="#1e293b" stroke-width="1.5" />
    <text x="70" y="326" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#64748b" letter-spacing="1">MEMES, MEDIA &amp; AUDIO</text>
    <text x="70" y="354" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#f472b6">${mediaCount} Media</text>
    <text x="70" y="375" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#94a3b8">${voiceNotesCount} voice notes</text>

    <!-- Row 2: Box 5 (Observed Online Time) -->
    <rect x="335" y="300" width="250" height="90" rx="14" fill="url(#boxGrad)" stroke="#1e293b" stroke-width="1.5" />
    <text x="355" y="328" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1">OBSERVED PRESENCE</text>
    <text x="355" y="365" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#34d399">${onlineTimeStr}</text>

    <!-- Row 2: Box 6 (Championship Title) -->
    <rect x="620" y="300" width="250" height="90" rx="14" fill="url(#boxGrad)" stroke="#1e293b" stroke-width="1.5" />
    <text x="640" y="328" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1">CHAMPIONSHIP TIER</text>
    <text x="640" y="365" font-family="Arial, sans-serif" font-size="${rankInfo.title.length > 20 ? 18 : 22}" font-weight="900" fill="${isOwner ? '#fbbf24' : '#67e8f9'}">${escapeXml(rankInfo.title)}</text>

    <!-- Bottom XP Progression Bar -->
    <text x="50" y="425" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="#94a3b8">
      XP PROGRESSION TOWARDS <tspan fill="#00e5ff">${rankInfo.nextRankName}</tspan> (${progressPercent}%)
    </text>
    <text x="${width - 50}" y="425" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#94a3b8">
      Target: ${nextRankTarget}
    </text>

    <!-- Bar Background -->
    <rect x="50" y="438" width="${barWidth}" height="18" rx="9" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
    <!-- Bar Filled -->
    ${
      filledBarWidth > 0
        ? `<rect x="50" y="438" width="${filledBarWidth}" height="18" rx="9" fill="url(#neonBlue)" />`
        : ''
    }

    <!-- Bottom Footer Status -->
    <text x="50" y="485" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#475569">
      SECURE BIOMETRIC HASH • AUTHENTICATED VIA DISCORD ID: ${user.id}
    </text>
    <text x="${width - 50}" y="485" text-anchor="end" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#475569">
      ROCKET RACCOON OS • NERO LABS 🍕
    </text>
  </svg>
  `;

  // Render SVG to high quality PNG using sharp
  const pngBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 95 })
    .toBuffer();

  return pngBuffer;
}

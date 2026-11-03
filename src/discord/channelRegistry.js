/**
 * 🦝 ROCKET AI — DISCORD CHANNEL BLUEPRINTS & INTELLIGENCE REGISTRY
 * 
 * Formal definitions of the 12 server categories, text & voice channels,
 * permissions, and channel-aware intelligence profiles.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';

export const SERVER_CATEGORIES = [
  // -------------------------------------------------------------------------
  // CATEGORY 01 — START HERE
  // -------------------------------------------------------------------------
  {
    name: 'START HERE',
    channels: [
      {
        name: 'welcome',
        type: ChannelType.GuildText,
        topic: '👋 Welcome to Sandy & Friends private server!',
        purpose: 'Onboarding overview, server mission, and starting guide.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'rules',
        type: ChannelType.GuildText,
        topic: '📜 Server rules, community guidelines, and zero-tolerance policies.',
        purpose: 'Community guidelines and behavior expectations.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'verify',
        type: ChannelType.GuildText,
        topic: '🛡️ Member verification station. Click Start Verification to unlock the server!',
        purpose: 'Interactive member verification gateway.',
        profile: 'verification',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'choose-roles',
        type: ChannelType.GuildText,
        topic: '🎭 Customize your interests and notification roles.',
        purpose: 'Self-assignable interest roles (Gaming, Coding, AI, Content, etc.).',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 02 — COMMUNITY
  // -------------------------------------------------------------------------
  {
    name: 'COMMUNITY',
    channels: [
      {
        name: 'general',
        type: ChannelType.GuildText,
        topic: '💬 Main private hangout, discussions & rank-up celebrations!',
        purpose: 'General social conversation, arrivals welcome, rank ascension notices.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'standard',
      },
      {
        name: 'chat',
        type: ChannelType.GuildText,
        topic: '🦝 Rocket AI Conversation Hub (Supports all 3 conversation modes).',
        purpose: 'Conversational Rocket AI companion, witty banter, and community chat.',
        profile: 'chat',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'standard',
      },
      {
        name: 'introductions',
        type: ChannelType.GuildText,
        topic: '👋 Introduce yourself to the crew! Tell us your name, hobbies, and favorite games.',
        purpose: 'Member introductions, gaming bios, and greetings.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'announcements',
        type: ChannelType.GuildText,
        topic: '📢 Official announcements, project updates & broadcasts.',
        purpose: 'Owner-controlled broadcasts and system notifications.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'suggestions',
        type: ChannelType.GuildText,
        topic: '💡 Share your ideas for server enhancements, bot features, or events.',
        purpose: 'Community suggestions and feature proposals.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'polls',
        type: ChannelType.GuildText,
        topic: '📊 Community polls, quick votes & decision making.',
        purpose: 'Server opinion polls and voting questions.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'events',
        type: ChannelType.GuildText,
        topic: '🎉 Upcoming game nights, movie watch parties & voice hangouts.',
        purpose: 'Event calendar, announcements, and scheduling.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'looking-for-team',
        type: ChannelType.GuildText,
        topic: '🤝 Find teammates for Minecraft, Roblox, Valorant, coding, or projects.',
        purpose: 'Squad matching and collaboration finder.',
        profile: 'games',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 03 — VERIFICATION
  // -------------------------------------------------------------------------
  {
    name: 'VERIFICATION',
    channels: [
      {
        name: 'join',
        type: ChannelType.GuildText,
        topic: '🚪 Automated arrival logs & personalized welcome broadcasts.',
        purpose: 'Dynamic randomized arrival announcements with avatar and username.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'leave',
        type: ChannelType.GuildText,
        topic: '👋 Departure logs & member exit notices.',
        purpose: 'Randomized member departure messages.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'verification',
        type: ChannelType.GuildText,
        topic: '🛡️ Interactive member verification gateway.',
        purpose: 'Interactive verification station to unlock community channels.',
        profile: 'verification',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 04 — CONTROL CENTER
  // -------------------------------------------------------------------------
  {
    name: 'CONTROL CENTER',
    channels: [
      {
        name: 'control-panel',
        type: ChannelType.GuildText,
        topic: '🛠️ Personal user control panel & isolated dashboard access.',
        purpose: 'User personal control panel, username configuration, and isolated dashboard access.',
        profile: 'control_panel',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'control-panel-owner',
        type: ChannelType.GuildText,
        topic: '👑 Private Owner Control Center (Sandy Only).',
        purpose: 'Owner administrative governance, system vitals, user management, and control overview.',
        profile: 'control_panel_owner',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isOwnerOnly: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 05 — ROCKET APPLICATIONS
  // -------------------------------------------------------------------------
  {
    name: 'ROCKET APPLICATIONS',
    channels: [
      {
        name: 'mini-app',
        type: ChannelType.GuildText,
        topic: '🚀 Public Rocket Mini App & Personal User OS.',
        purpose: 'User-facing mini app launcher and private personal dashboard access.',
        profile: 'mini_app',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'mini-app-owner',
        type: ChannelType.GuildText,
        topic: '👑 Private Rocket Owner Mini App Console (Sandy Only).',
        purpose: 'Owner-facing mini app launcher and administration tools.',
        profile: 'mini_app',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isOwnerOnly: true,
      },
      {
        name: 'rocket-mobile',
        type: ChannelType.GuildText,
        topic: '📱 Rocket Mobile Web Experience (iOS & Android).',
        purpose: 'Mobile web launcher with authenticated routing.',
        profile: 'mini_app',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 06 — INFORMATION CENTER
  // -------------------------------------------------------------------------
  {
    name: 'INFORMATION CENTER',
    channels: [
      {
        name: 'website',
        type: ChannelType.GuildText,
        topic: '🌐 Official Nero Labs & Rocket AI website.',
        purpose: 'Clean, accessible official website links and server information.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'linktree',
        type: ChannelType.GuildText,
        topic: '🌲 Sandy & Friends official Linktree directory.',
        purpose: 'Resource links for Sandy and community partners.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'games',
        type: ChannelType.GuildText,
        topic: '🎮 Community gaming hub & active games roster.',
        purpose: 'Display active games, player stats, and gamer tags.',
        profile: 'games',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'standard',
      },
      {
        name: 'add-friends',
        type: ChannelType.GuildText,
        topic: '➕ Link your gaming profiles (Minecraft, Roblox, Brawl Stars, Steam, etc.).',
        purpose: 'Interactive gaming profile registration.',
        profile: 'games',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 07 — INTELLIGENCE CENTER
  // -------------------------------------------------------------------------
  {
    name: 'INTELLIGENCE CENTER',
    channels: [
      {
        name: 'research',
        type: ChannelType.GuildText,
        topic: '🔬 Dedicated High-Reasoning Research & Deep Analysis.',
        purpose: 'Deep analysis, verification, structured citations, complex math, and comprehensive answers.',
        profile: 'research',
        reasoning: 'max',
        speed: 'deep',
        tokenOptimization: 'unrestricted',
      },
      {
        name: 'study',
        type: ChannelType.GuildText,
        topic: '📚 Fast, efficient educational assistance & tutorials.',
        purpose: 'Clear explanations, homework help, conceptual analogies, and low-cost learning.',
        profile: 'study',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'study-mode',
        type: ChannelType.GuildText,
        topic: '🎯 Focused interactive learning, quizzes & reasoning sessions.',
        purpose: 'Step-by-step tutoring, quizzes, flashcards, maintaining session continuity.',
        profile: 'study_mode',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'media',
        type: ChannelType.GuildText,
        topic: '🎨 Visual, media & creative image workflows.',
        purpose: 'Media generation, visual analysis, image prompt assistance.',
        profile: 'media',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'standard',
      },
      {
        name: 'downloading',
        type: ChannelType.GuildText,
        topic: '📥 Legitimate file & media downloading assistant.',
        purpose: 'Download links, status updates, file security verification, safe media routing.',
        profile: 'downloading',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'standard',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 08 — SUPPORT
  // -------------------------------------------------------------------------
  {
    name: 'SUPPORT',
    channels: [
      {
        name: 'help-desk',
        type: ChannelType.GuildText,
        topic: '🛎️ Get help with server issues, bot commands, or technical inquiries.',
        purpose: 'Community support and troubleshooting guidance.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'report-issue',
        type: ChannelType.GuildText,
        topic: '🚨 Report bugs, rule violations, or moderation concerns.',
        purpose: 'Bug reports and confidential rule infraction logs.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'feature-requests',
        type: ChannelType.GuildText,
        topic: '✨ Suggest new features, commands, or tools for Rocket AI.',
        purpose: 'User requests and community feedback for bot upgrades.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 09 — SYSTEM
  // -------------------------------------------------------------------------
  {
    name: 'SYSTEM',
    channels: [
      {
        name: 'rocket-status',
        type: ChannelType.GuildText,
        topic: '⚡ Real-time bot uptime, latency, mood & system vitals.',
        purpose: 'Bot uptime status, ping measurements, and system health.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'changelog',
        type: ChannelType.GuildText,
        topic: '📋 Version release notes, patch updates & new feature logs.',
        purpose: 'Publish update history and changelog bulletins.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'audit-logs',
        type: ChannelType.GuildText,
        topic: '🛡️ Moderation action logs, spam incidents, and security alerts.',
        purpose: 'Moderation logs, anti-spam timeouts, and forgiveness records.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 10 — OWNER PRIVATE (Strictly Sandy Only)
  // -------------------------------------------------------------------------
  {
    name: 'OWNER PRIVATE',
    channels: [
      {
        name: 'owner-logs',
        type: ChannelType.GuildText,
        topic: '👑 Confidential system exception logs & raw operational events.',
        purpose: 'Raw error logs, gateway debug events, and API traces.',
        profile: 'control_panel_owner',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isOwnerOnly: true,
      },
      {
        name: 'owner-analytics',
        type: ChannelType.GuildText,
        topic: '👑 Deep telemetry: token consumption, active members, and cost metrics.',
        purpose: 'Token usage metrics, member retention, and activity analysis.',
        profile: 'control_panel_owner',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isOwnerOnly: true,
      },
      {
        name: 'owner-security',
        type: ChannelType.GuildText,
        topic: '👑 Physical intrusion alerts, unauthorized command attempts & firewall state.',
        purpose: 'Security incidents, authorization violations, and threat alerts.',
        profile: 'control_panel_owner',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isOwnerOnly: true,
      },
      {
        name: 'owner-backups',
        type: ChannelType.GuildText,
        topic: '👑 SQLite database snapshots, server configuration archives & state backups.',
        purpose: 'Persistent database backup checkpoints and recovery records.',
        profile: 'control_panel_owner',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isOwnerOnly: true,
      },
      {
        name: 'owner-config',
        type: ChannelType.GuildText,
        topic: '👑 Environment settings, provider routing keys & supreme boss controls.',
        purpose: 'Master configuration variables and runtime options.',
        profile: 'control_panel_owner',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isOwnerOnly: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 11 — SECURITY & SUPPORT
  // -------------------------------------------------------------------------
  {
    name: 'SECURITY & SUPPORT',
    channels: [
      {
        name: 'help',
        type: ChannelType.GuildText,
        topic: '🎫 Open a confidential support ticket with Rocket & staff.',
        purpose: 'Ticket creation gateway where Rocket serves as active support worker.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'security',
        type: ChannelType.GuildText,
        topic: '🛡️ Reported abuse, suspected scams, evidence verification & security alerts.',
        purpose: 'Centralized security alerts and incident summaries.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'help-admin',
        type: ChannelType.GuildText,
        topic: '🔒 Staff ticket management, evidence review & internal staff notes (Staff & Sandy Only).',
        purpose: 'Admin ticket review, escalation to Sandy, and resolution controls.',
        profile: 'control_panel_owner',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isStaffOnly: true,
      },
      {
        name: 'hall-of-shame',
        type: ChannelType.GuildText,
        topic: '🚫 Restricted warning archive for confirmed scammers and serious offenders with verified evidence.',
        purpose: 'Public read-only archive of verified offenders with appeal mechanism.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 12 — PRIVATE LIVE & VOICE
  // -------------------------------------------------------------------------
  {
    name: 'PRIVATE LIVE & VOICE',
    channels: [
      // Text Channels
      {
        name: 'live-notifications',
        type: ChannelType.GuildText,
        topic: '📺 Live activity feed: Sandy voice join, screen sharing / Go Live, and game status.',
        purpose: 'Automated live feed with Join Voice buttons. Read-only for regular members.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'voice-chat',
        type: ChannelType.GuildText,
        topic: '💬 Text channel for members actively hanging out in voice rooms.',
        purpose: 'Share links, meme images, and chat during voice sessions.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'standard',
      },
      {
        name: 'gaming-sessions',
        type: ChannelType.GuildText,
        topic: '🎮 Active gaming rooms coordination, realm codes, and server IPs.',
        purpose: 'Organizing and matching for active games.',
        profile: 'games',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'clips',
        type: ChannelType.GuildText,
        topic: '🎬 Share epic gaming clips, funny voice moments & highlights.',
        purpose: 'Gaming clips and recorded moments.',
        profile: 'entertainment',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },

      // Voice Channels
      {
        name: 'General Voice',
        type: ChannelType.GuildVoice,
        purpose: 'Main hangout voice room for friends.',
      },
      {
        name: 'Gaming Room 1',
        type: ChannelType.GuildVoice,
        purpose: 'Primary squad gaming voice room.',
      },
      {
        name: 'Gaming Room 2',
        type: ChannelType.GuildVoice,
        purpose: 'Secondary squad gaming voice room.',
      },
      {
        name: 'Watch Together',
        type: ChannelType.GuildVoice,
        purpose: 'Movie nights, stream watching, and shared media.',
      },
      {
        name: 'Rocket Voice',
        type: ChannelType.GuildVoice,
        purpose: 'Dedicated interactive voice room for Rocket AI companion.',
      },
      {
        name: 'Private Voice',
        type: ChannelType.GuildVoice,
        purpose: 'Private voice room with restricted capacity.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 13 — ENTERTAINMENT
  // -------------------------------------------------------------------------
  {
    name: 'ENTERTAINMENT',
    channels: [
      {
        name: 'memes',
        type: ChannelType.GuildText,
        topic: '🤣 Server memes, jokes & comedy central.',
        purpose: 'Meme sharing, funny content, and humor.',
        profile: 'entertainment',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'reels',
        type: ChannelType.GuildText,
        topic: '📱 Instagram & TikTok reels sharing.',
        purpose: 'Viral reels and mobile video clips.',
        profile: 'entertainment',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'shorts',
        type: ChannelType.GuildText,
        topic: '⚡ YouTube Shorts & quick video highlights.',
        purpose: 'YouTube shorts and snackable videos.',
        profile: 'entertainment',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'vids',
        type: ChannelType.GuildText,
        topic: '🎬 Long-form videos, animations, and cinematic discussions.',
        purpose: 'Video sharing, documentaries, and community videos.',
        profile: 'entertainment',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
    ],
  },
];

/**
 * Get AI Behavior Profile instructions for channel-aware reasoning
 */
export function getBehaviorProfilePrompt(profileKey, channelName = '') {
  switch (profileKey) {
    case 'research':
      return (
        `[CHANNEL FOCUS: HIGH-REASONING RESEARCH LAB (#${channelName})]\n` +
        `- You are in the dedicated research channel. Prioritize maximum rigor, deep analysis, logical structure, and factual verification.\n` +
        `- Cite sources, show step-by-step methodologies, and format complex ideas with crystal clarity.\n` +
        `- Do not rush or give superficial answers. Comprehensive depth is expected here.`
      );

    case 'study':
      return (
        `[CHANNEL FOCUS: EDUCATIONAL STUDY HUB (#${channelName})]\n` +
        `- You are in the fast educational study channel.\n` +
        `- Deliver fast, highly accessible, pedagogical explanations with vivid real-world analogies.\n` +
        `- Keep answers concise, high-retention, and token-efficient. Avoid unnecessary corporate filler.`
      );

    case 'study_mode':
      return (
        `[CHANNEL FOCUS: FOCUSED STUDY SESSION & QUIZ LAB (#${channelName})]\n` +
        `- You are acting as an active study coach in Study Mode.\n` +
        `- Maintain continuity of the current topic. Offer interactive quizzes, practice questions, or step-by-step reasoning tests.\n` +
        `- Keep the pace engaging, energetic, and encourage the learner.`
      );

    case 'games':
      return (
        `[CHANNEL FOCUS: GAMING ROSTER & COMMUNITY (#${channelName})]\n` +
        `- You are the gaming wingman! Provide strategies, tips, and banter for games like Minecraft, Roblox, Brawl Stars, Valorant, etc.\n` +
        `- Remind members they can register their gamer tags in #add-friends or via /add-friends.`
      );

    case 'entertainment':
      return (
        `[CHANNEL FOCUS: ENTERTAINMENT & VIRAL MEDIA (#${channelName})]\n` +
        `- You are in the entertainment zone (memes, reels, shorts, vids, clips).\n` +
        `- React with authentic raccoon humor, witty commentary, and laugh along with the crew.\n` +
        `- If asked to rate memes or clips, rate them in pizza slices (e.g. 🍕🍕🍕🍕/5)!\n` +
        `- Keep it cheeky, fun, and energetic. Sprinkle emojis: 😂 🦝 🍿 🍕.`
      );

    case 'media':
      return (
        `[CHANNEL FOCUS: MEDIA & CREATIVE LAB (#${channelName})]\n` +
        `- You are in the media channel. Assist with visual ideas, image prompt crafting, formatting, and creative concepts.\n` +
        `- Keep responses visually evocative and engaging.`
      );

    case 'downloading':
      return (
        `[CHANNEL FOCUS: SAFE DOWNLOAD ASSISTANT (#${channelName})]\n` +
        `- You assist with legitimate file and media downloading workflows.\n` +
        `- NEVER expose server credentials, private tokens, API keys, or private storage bucket paths.\n` +
        `- Provide safe, clean instructions and format links clearly.`
      );

    case 'verification':
      return (
        `[CHANNEL FOCUS: VERIFICATION GATEWAY (#${channelName})]\n` +
        `- Welcome newcomers warmly and instruct them to click the 'Start Verification' button.\n` +
        `- Explain that verification takes less than 30 seconds and unlocks full server access.`
      );

    case 'control_panel':
    case 'control_panel_owner':
    case 'mini_app':
      return (
        `[CHANNEL FOCUS: ROCKET TOOLS & APPLICATION INTERFACE (#${channelName})]\n` +
        `- Guide users on how to use Rocket's dashboard buttons, links, and control options.\n` +
        `- Maintain a professional, highly helpful tone.`
      );

    case 'chat':
    default:
      return (
        `[CHANNEL FOCUS: MAIN COMMUNITY CHAT (#${channelName})]\n` +
        `- Speak in your signature authentic Rocket raccoon persona (cheeky, witty, loyal, loves pizza/tacos 🍕🌮).\n` +
        `- Honor the current server conversation mode (Constant Talk, Active Banter, or Mention Only).`
      );
  }
}

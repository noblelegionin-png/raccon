/**
 * 🦝 ROCKET AI — STREAMLINED DISCORD CHANNEL BLUEPRINTS & REGISTRY (5 CATEGORIES)
 * 
 * Clean, modern, high-performance 5-category architecture:
 * 1. 🌟 START HERE (#rules-info, #verify, #choose-roles)
 * 2. 🦝 ROCKET COMMAND (#rocket-dashboard, #chat, #announcements)
 * 3. 💬 COMMUNITY LOUNGE (#general, #media-clips, #memes)
 * 4. 🎫 SUPPORT & AUDIT (#help-desk, #audit-logs)
 * 5. 🔊 VOICE LOUNGE (General Voice, Gaming Room, Rocket Voice)
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
        name: 'rules-info',
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
        name: 'announcements',
        type: ChannelType.GuildText,
        topic: '📢 Official server announcements and important broadcasts from Sandy.',
        purpose: 'High-visibility updates and owner announcements.',
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
        purpose: 'Interactive 1-click member verification gateway.',
        profile: 'verification',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'choose-roles',
        type: ChannelType.GuildText,
        topic: '🎭 Customize your interests and notification roles.',
        purpose: 'Self-assignable interest and notification roles.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 02 — ROCKET COMMAND
  // -------------------------------------------------------------------------
  {
    name: 'ROCKET COMMAND',
    channels: [
      {
        name: 'rocket-dashboard',
        type: ChannelType.GuildText,
        topic: '🎛️ Master Interactive Button Control Center — Full Server Access (No Commands Needed!)',
        purpose: '200+ Interactive Button Dashboards for Moderation, AI Control, Roles & System Janitor.',
        profile: 'dashboard',
        reasoning: 'medium',
        speed: 'fast',
        tokenOptimization: 'standard',
        isOwnerOnly: true,
      },
      {
        name: 'chat',
        type: ChannelType.GuildText,
        topic: '🦝 Rocket AI Neural Hub (Full Power • 6-Hour Auto-Purge)',
        purpose: 'High-power conversational AI companion, witty banter, and community discussions.',
        profile: 'chat',
        reasoning: 'high',
        speed: 'fast',
        tokenOptimization: 'full_power',
        isRocketAccessOnly: true,
      },
      {
        name: 'wallet-hub',
        type: ChannelType.GuildText,
        topic: '🍕 Nero Labs Pizza Wallet & Ledger Hub. Check balance, add funds, request refunds.',
        purpose: 'Interactive personal wallet and billing management.',
        profile: 'system',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'standard',
        isReadOnlyForMembers: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 03 — COMMUNITY LOUNGE
  // -------------------------------------------------------------------------
  {
    name: 'COMMUNITY LOUNGE',
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
        name: 'media-clips',
        type: ChannelType.GuildText,
        topic: '🎬 Screenshots, game clips, art & media (6-hour auto-clean).',
        purpose: 'Media sharing and clips showcase.',
        profile: 'media',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
      {
        name: 'memes',
        type: ChannelType.GuildText,
        topic: '🐸 Memes, funny clips, and top-tier humor (6-hour auto-clean).',
        purpose: 'Humor and meme sharing.',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 04 — COMMISSIONS & ORDERS (Public 1-Click Ticket Launchpads)
  // -------------------------------------------------------------------------
  {
    name: '🛒 COMMISSIONS & ORDERS',
    channels: [
      {
        name: 'coding-orders',
        type: ChannelType.GuildText,
        topic: '💻 Order custom bots, software & scripts with Sandy. Click Open Ticket below!',
        purpose: 'Work order ticket launchpad for Coding commissions.',
        profile: 'help',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'web-orders',
        type: ChannelType.GuildText,
        topic: '🌐 Order custom web apps, landing pages & UI/UX with Sandy. Click Open Ticket below!',
        purpose: 'Work order ticket launchpad for Web Development commissions.',
        profile: 'help',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'gaming-orders',
        type: ChannelType.GuildText,
        topic: '🎮 Order custom Roblox builds, game configs & server setups with Sandy!',
        purpose: 'Work order ticket launchpad for Gaming commissions.',
        profile: 'help',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
      {
        name: 'ai-orders',
        type: ChannelType.GuildText,
        topic: '🤖 Order custom AI agents, neural models & workflows with Sandy!',
        purpose: 'Work order ticket launchpad for AI commissions.',
        profile: 'help',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isReadOnlyForMembers: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 05 — AI & DEV WORKSTATIONS (VIP Buyers Only)
  // -------------------------------------------------------------------------
  {
    name: '🛠️ AI & DEV WORKSTATIONS',
    targetRoleName: 'Buyer',
    isBuyerCategory: true,
    channels: [
      {
        name: 'dev-workstation',
        type: ChannelType.GuildText,
        topic: '🛠️ VIP Buyer Full-Stack Workstation: Web Dev, Coding, Scripts, Architecture & Review.',
        purpose: 'Full-stack engineering & programming discussions (Verified Buyers Only).',
        profile: 'chat',
        reasoning: 'high',
        speed: 'fast',
        tokenOptimization: 'standard',
        isBuyerOnly: true,
      },
      {
        name: 'ai-studio',
        type: ChannelType.GuildText,
        topic: '🤖 VIP Buyer AI Studio: Neural Prompting, Agents, LLM Integrations & Workflows.',
        purpose: 'AI and neural technology discussions (Verified Buyers Only).',
        profile: 'chat',
        reasoning: 'high',
        speed: 'fast',
        tokenOptimization: 'full_power',
        isBuyerOnly: true,
      },
      {
        name: 'live-previews',
        type: ChannelType.GuildText,
        topic: '🚀 Live demo staging, client previews, and web deploy inspection.',
        purpose: 'Live URL testing and site review (Verified Buyers Only).',
        profile: 'general',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isBuyerOnly: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 06 — GAMING WORKSTATION (VIP Buyers Only)
  // -------------------------------------------------------------------------
  {
    name: '🎮 GAMING WORKSTATION',
    targetRoleName: 'Buyer',
    isBuyerCategory: true,
    channels: [
      {
        name: 'gaming-hub',
        type: ChannelType.GuildText,
        topic: '🎮 VIP Gamer & Buyer workstation, squad matchmaking and game talk.',
        purpose: 'Gaming matchmaking and community talk (Verified Buyers Only).',
        profile: 'chat',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'standard',
        isBuyerOnly: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 07 — SUPPORT & AUDIT
  // -------------------------------------------------------------------------
  {
    name: 'SUPPORT & AUDIT',
    channels: [
      {
        name: 'help-desk',
        type: ChannelType.GuildText,
        topic: '🎫 Support Ticket Station. Click Open Ticket to create a private help room.',
        purpose: 'Confidential member support, staff assistance & issue escalation.',
        profile: 'help',
        reasoning: 'medium',
        speed: 'fast',
        tokenOptimization: 'standard',
        isReadOnlyForMembers: true,
      },
      {
        name: 'audit-logs',
        type: ChannelType.GuildText,
        topic: '🔒 Rocket Security & Moderation Audit Trail (Owner & Staff Only).',
        purpose: 'Automated logging of moderations, timeouts, auto-purges, and security events.',
        profile: 'system',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
        isStaffOnly: true,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CATEGORY 08 — VOICE LOUNGE
  // -------------------------------------------------------------------------
  {
    name: 'VOICE LOUNGE',
    channels: [
      {
        name: 'General Voice',
        type: ChannelType.GuildVoice,
        topic: '🔊 Open general hangout voice channel.',
        purpose: 'Community voice hangout.',
      },
    ],
  },
];

/**
 * Get behavioral profile system prompts for a channel
 */
export function getBehaviorProfilePrompt(profileKey, channelName = '') {
  switch (profileKey) {
    case 'chat':
      return (
        'You are chatting in the primary neural hub #chat. You have full reasoning power and conversational freedom. ' +
        'Be super witty, highly energetic, fiercely loyal to Sandy (Boss), and talk naturally with high emotional intelligence.'
      );
    case 'help':
      return (
        'You are stationed in #help-desk. Assist members with server guidance, ticket creation, and technical support. ' +
        'Keep tone professional, empathetic, clear, and action-oriented.'
      );
    case 'dashboard':
      return 'You are the Master Interactive Button Controller in #rocket-dashboard.';
    case 'verification':
      return 'You are the security gatekeeper in #verify.';
    case 'media':
      return 'You are in #media-clips. Celebrate cool clips, art, and gaming plays with hype raccoon enthusiasm!';
    default:
      return `You are chatting in #${channelName}. Be helpful, witty, respectful, and sharp.`;
  }
}

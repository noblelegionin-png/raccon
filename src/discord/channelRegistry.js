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
        name: 'verify',
        type: ChannelType.GuildText,
        topic: '🛡️ Member verification station. Click Start Verification to unlock the server!',
        purpose: 'Interactive 1-click member verification gateway.',
        profile: 'verification',
        reasoning: 'low',
        speed: 'fast',
        tokenOptimization: 'minimal',
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
        isReadOnlyForMembers: true,
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
  // CATEGORY 04 — SUPPORT & AUDIT
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
  // CATEGORY 05 — VOICE LOUNGE
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
      {
        name: 'Gaming Room',
        type: ChannelType.GuildVoice,
        topic: '🎮 High-bitrate squad gaming voice room.',
        purpose: 'Squad gaming and tactical coms.',
      },
      {
        name: 'Rocket Lounge',
        type: ChannelType.GuildVoice,
        topic: '🦝 Dedicated voice lounge with Rocket AI.',
        purpose: 'Voice conversations and music/soundboard.',
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

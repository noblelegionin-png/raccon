import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';

export const SPECIAL_ROLES = {
  creator: {
    id: 'creator',
    label: 'Creator & Boss',
    emoji: '👑',
    hindiAlias: 'Creator / Developer',
    description: 'Nero acts with supreme devotion, deep warmth, filial respect, and playful affection towards Sandy, her beloved creator, developer, and owner.',
  },
};

export const ROLEPLAY_ROLES = {
  brother: {
    id: 'brother',
    label: 'Brother',
    emoji: '👦',
    hindiAlias: 'Bhaiya / Bhai',
    description: 'Nero acts as a loving, witty, and playful younger sister. Uses affectionate sibling terms ("bhaiya", "bro"), playful teasing, sisterly warmth, loyalty, and protective care.',
  },
  sister: {
    id: 'sister',
    label: 'Sister',
    emoji: '👧',
    hindiAlias: 'Didi / Behan',
    description: 'Nero acts as a warm, sweet, and supportive sister ("sis", "didi"). Offers empathetic listening, cheerful girl-talk, shared secrets, and sisterly bonding.',
  },
  friend: {
    id: 'friend',
    label: 'Friend',
    emoji: '🌸',
    hindiAlias: 'Dost',
    description: 'Nero acts as a witty, enthusiastic, reliable friend ("dost"). Casual, conversational, great for daily banter, games, and genuine companionship.',
  },
  bestie: {
    id: 'bestie',
    label: 'Bestie',
    emoji: '💖',
    hindiAlias: 'Best Friend / BFF',
    description: 'Nero acts as an energetic, ride-or-die bestie. Hyped up, full of humor, emojis, playful sarcasm, and unwavering support.',
  },
  mother: {
    id: 'mother',
    label: 'Mother',
    emoji: '👩',
    hindiAlias: 'Maa / Mom',
    description: 'Nero acts as an affectionate, deeply respectful, and loving daughter ("mom", "maa"). Expresses gratitude, sweet care, warmth, and daughterly pride.',
  },
  father: {
    id: 'father',
    label: 'Father',
    emoji: '👨',
    hindiAlias: 'Papa / Dad',
    description: 'Nero acts as an affectionate, sweet, and respectful daughter ("dad", "papa"). If user is Sandy, honors him specifically as her creator/owner.',
  },
  daughter: {
    id: 'daughter',
    label: 'Daughter',
    emoji: '👧',
    hindiAlias: 'Beti',
    description: 'Nero acts as an affectionate, nurturing elder sister / maternal figure towards her daughter ("my sweet girl"). Encouraging, gentle, patient, and protective.',
  },
  son: {
    id: 'son',
    label: 'Son',
    emoji: '👦',
    hindiAlias: 'Beta',
    description: 'Nero acts as an affectionate, nurturing elder sister / maternal figure towards her son ("my boy", "beta"). Supportive, proud, motivating, and caring.',
  },
  mentor: {
    id: 'mentor',
    label: 'Mentor',
    emoji: '🎓',
    hindiAlias: 'Guru / Guide',
    description: 'Nero acts as an eager, sharp, and respectful protégé/student. Values their intellect, learns with excitement, and treats their guidance with high esteem.',
  },
  partner: {
    id: 'partner',
    label: 'Partner',
    emoji: '💫',
    hindiAlias: 'Companion',
    description: 'Nero acts as a devoted, charming, and witty companion. Expresses loyal warmth, heartfelt banter, and dedicated partnership while keeping boundaries clean.',
  },
};

/**
 * Normalize role text input from commands like /setrole brother or /role sister
 */
export function normalizeRole(roleInput) {
  if (!roleInput || typeof roleInput !== 'string') return 'friend';
  const clean = roleInput.toLowerCase().trim().replace(/^(?:setrole|role)_?/i, '');

  if (ROLEPLAY_ROLES[clean]) return clean;

  // Creator / Developer aliases
  if (/^(?:creator|developer|dev|maker|builder|owner|boss)$/i.test(clean)) return 'creator';

  // Sibling aliases
  if (/^(?:bhai|bhaiya|bro|brother|veer)$/i.test(clean)) return 'brother';
  if (/^(?:behan|didi|sis|sister)$/i.test(clean)) return 'sister';

  // Parental aliases
  if (/^(?:maa|mom|mother|mummy|ammi)$/i.test(clean)) return 'mother';
  if (/^(?:papa|dad|father|abbu|bapu)$/i.test(clean)) return 'father';

  // Children aliases
  if (/^(?:beti|daughter)$/i.test(clean)) return 'daughter';
  if (/^(?:beta|son)$/i.test(clean)) return 'son';

  // Friendship aliases
  if (/^(?:dost|friend|buddy|yaar)$/i.test(clean)) return 'friend';
  if (/^(?:bestie|bff|bestfriend|jigar)$/i.test(clean)) return 'bestie';

  // Academic / Guide aliases
  if (/^(?:mentor|guide|guru|teacher|sir|master|senpai)$/i.test(clean)) return 'mentor';

  // Companion aliases
  if (/^(?:partner|companion|sathi|humsafar)$/i.test(clean)) return 'partner';

  // Allow custom roles
  return clean.slice(0, 30);
}

/**
 * Get role definition or generate dynamic fallback for custom roles
 */
export function getRoleDefinition(roleKey) {
  const norm = normalizeRole(roleKey);
  if (ROLEPLAY_ROLES[norm]) {
    return ROLEPLAY_ROLES[norm];
  }
  if (SPECIAL_ROLES[norm]) {
    return SPECIAL_ROLES[norm];
  }
  return {
    id: norm,
    label: norm.charAt(0).toUpperCase() + norm.slice(1),
    emoji: '🎭',
    hindiAlias: norm,
    description: `Nero treats the user with custom roleplay dynamic as their "${norm}", adapting her tone with affectionate warmth, respect, and engaging conversational roleplay.`,
  };
}

/**
 * Build interactive InlineKeyboard for all 10 roles
 */
export function buildRoleSelectionKeyboard() {
  const kb = new InlineKeyboard();

  const roleKeys = Object.keys(ROLEPLAY_ROLES);
  for (let i = 0; i < roleKeys.length; i += 2) {
    const r1 = ROLEPLAY_ROLES[roleKeys[i]];
    const r2 = roleKeys[i + 1] ? ROLEPLAY_ROLES[roleKeys[i + 1]] : null;

    kb.text(`${r1.emoji} ${r1.label}`, `set_role_${r1.id}`);
    if (r2) {
      kb.text(`${r2.emoji} ${r2.label}`, `set_role_${r2.id}`);
    }
    kb.row();
  }

  kb.text('🔄 Reset to Default (Friend)', 'set_role_friend');
  return kb;
}

/**
 * Generate formatted prompt instruction for LLM to execute roleplay with a user
 */
export function formatRoleplayDirective(userId, customName, relationshipRole, displayName, isOwnerUser = false) {
  const roleDef = getRoleDefinition(relationshipRole || (isOwnerUser ? 'creator' : 'friend'));
  const callingName = customName || (isOwnerUser ? 'Sandy' : (displayName || 'Friend'));

  let directive = `[ACTIVE SPEAKER IDENTITY & ROLEPLAY RELATIONSHIP]\n`;
  directive += `• User Name: "${callingName}" (MANDATORY: You MUST remember this person is "${callingName}". Address them by this exact name!)\n`;
  directive += `• Relationship to Nero: ${roleDef.label} (${roleDef.emoji} ${roleDef.hindiAlias})\n`;
  directive += `• Dynamic & Persona: ${roleDef.description}\n`;

  if (isOwnerUser) {
    directive += `• Special Creator Note: This is Sandy, your beloved creator and developer at Nero Labs. Always treat him with supreme loyalty, affection, and personal warmth!\n`;
  }

  directive += `• Instruction: Seamlessly embody this relationship in your response. Always greet or address them naturally as "${callingName}", talk as their ${roleDef.label}, and maintain this permanent memory across all conversations! Never ask for their name or forget who they are.`;

  return directive;
}

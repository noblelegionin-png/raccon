/**
 * 🦝 ROCKET AI — SMART MEMBER VERIFICATION & ONBOARDING SYSTEM
 * 
 * Implements:
 * - Interactive 4-step verification flow:
 *   Step 1: Modal for Name (optional), Nickname & What Rocket should call them
 *   Step 2: StringSelectMenu for Interests & Roles
 *   Step 3: StringSelectMenu for Relationship with Sandy (Brother, Sandy's Girlfriend, Friend)
 *   Step 4: Confirmation Card with [ ✅ Confirm & Complete Verification ]
 * - Automatic Role Assignment:
 *   - @Verified
 *   - Corresponding relationship role: @Brother, @Sandy's Girlfriend, or @Friend
 *   - Selected interest roles
 * - Role protection: Members cannot manually toggle relationship roles, @Verified, or @Staff
 * - Saves profile into SQLite (discord_member_profiles)
 * - Sends personalized welcome DM
 */

import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import {
  completeMemberVerification,
  isMemberVerified,
  getGuildSettings,
} from './discordDb.js';

const SUCCESS_COLOR = 0x2ecc71;
const BRAND_COLOR = 0xff6b35;
const INFO_COLOR = 0x3498db;

// In-memory wizard session store: userId -> { realName, nickname, preferredCallName, interests, relationshipSandy, guildId }
const verificationSessions = new Map();

/**
 * Handle Start Verification Button Click -> Opens Step 1 Modal
 */
export async function handleStartVerification(interaction) {
  const { user, guild } = interaction;

  if (isMemberVerified(guild.id, user.id)) {
    return interaction.reply({
      content: '✅ You are already verified! Feel free to check out <#choose-roles> to update your interest roles.',
      ephemeral: true,
    });
  }

  // Initialize session
  verificationSessions.set(user.id, {
    guildId: guild.id,
    realName: '',
    nickname: user.displayName || user.username,
    preferredCallName: user.globalName || user.username,
    interests: [],
    relationshipSandy: 'friend',
  });

  const modal = new ModalBuilder()
    .setCustomId('modal_verify_step1')
    .setTitle('🛡️ Member Verification (Step 1/4)');

  const realNameInput = new TextInputBuilder()
    .setCustomId('input_verify_realname')
    .setLabel('Your Name (Optional):')
    .setPlaceholder('e.g. Alex, Sam (leave blank if preferred)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const nicknameInput = new TextInputBuilder()
    .setCustomId('input_verify_nickname')
    .setLabel('Preferred Nickname / Display Name:')
    .setValue(user.displayName || user.username)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const callNameInput = new TextInputBuilder()
    .setCustomId('input_verify_callname')
    .setLabel('What should Rocket call you in chat?:')
    .setValue(user.globalName || user.username)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(realNameInput),
    new ActionRowBuilder().addComponents(nicknameInput),
    new ActionRowBuilder().addComponents(callNameInput)
  );

  return interaction.showModal(modal);
}

/**
 * Handle Step 1 Modal Submission -> Shows Step 2 (Interests Select Menu)
 */
export async function handleVerifyModalSubmit(interaction) {
  const { user, fields } = interaction;
  const session = verificationSessions.get(user.id) || {
    guildId: interaction.guild.id,
    interests: [],
    relationshipSandy: 'friend',
  };

  session.realName = fields.getTextInputValue('input_verify_realname') || '';
  session.nickname = fields.getTextInputValue('input_verify_nickname') || user.username;
  session.preferredCallName = fields.getTextInputValue('input_verify_callname') || session.nickname;
  verificationSessions.set(user.id, session);

  const embed = new EmbedBuilder()
    .setColor(INFO_COLOR)
    .setTitle('🛡️ Verification (Step 2/4): Select Your Interests & Roles')
    .setDescription(
      `Great to meet you, **${session.preferredCallName}**!\n\n` +
      `Please select what you are most interested in from the dropdown below. Rocket will automatically assign you these roles!`
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId('select_verify_interests')
    .setPlaceholder('Choose your areas of interest (multiple allowed)...')
    .setMinValues(1)
    .setMaxValues(5)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Gaming')
        .setDescription('Minecraft, Roblox, Brawl Stars, Steam, Valorant')
        .setValue('Gaming')
        .setEmoji('🎮'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Coding')
        .setDescription('Software engineering, Python, JavaScript, Discord bots')
        .setValue('Coding')
        .setEmoji('💻'),
      new StringSelectMenuOptionBuilder()
        .setLabel('AI & Technology')
        .setDescription('Neural nets, LLMs, Rocket AI, automation')
        .setValue('AI & Technology')
        .setEmoji('🤖'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Study & Academics')
        .setDescription('Study groups, homework assistance, research')
        .setValue('Study')
        .setEmoji('📚'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Content Creation')
        .setDescription('Memes, video editing, graphics, clips')
        .setValue('Content Creation')
        .setEmoji('🎨'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Community Hangout')
        .setDescription('Casual chatter, banter, and hangout')
        .setValue('Community')
        .setEmoji('☕')
    );

  const row = new ActionRowBuilder().addComponents(select);

  return interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

/**
 * Handle Step 2 Interests Selection -> Shows Step 3 (Relationship with Sandy)
 */
export async function handleVerifyInterestsSelect(interaction) {
  const { user, values } = interaction;
  const session = verificationSessions.get(user.id) || {
    guildId: interaction.guild.id,
    preferredCallName: user.username,
  };

  session.interests = values;
  verificationSessions.set(user.id, session);

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🛡️ Verification (Step 3/4): Connection with Sandy')
    .setDescription(
      `Awesome choices! Select your relationship with **Sandy**.\n\n` +
      `Rocket will **automatically assign your corresponding Discord role** upon completion:\n` +
      `• 💙 **BROTHER** — Assigns \`@Brother\`\n` +
      `• 💖 **SANDY'S GIRLFRIEND** — Assigns \`@Sandy's Girlfriend\`\n` +
      `• 💚 **FRIEND** — Assigns \`@Friend\`\n\n` +
      `*Note: Relationship preference affects conversational tone and role assignment.*`
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId('select_verify_relationship')
    .setPlaceholder('Select your relationship with Sandy...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('BROTHER')
        .setDescription("Sandy's brother / close brother bond")
        .setValue('brother')
        .setEmoji('💙'),
      new StringSelectMenuOptionBuilder()
        .setLabel("SANDY'S GIRLFRIEND")
        .setDescription("Sandy's partner / girlfriend")
        .setValue('girlfriend')
        .setEmoji('💖'),
      new StringSelectMenuOptionBuilder()
        .setLabel('FRIEND')
        .setDescription('Invited friend / close circle companion')
        .setValue('friend')
        .setEmoji('💚')
    );

  const row = new ActionRowBuilder().addComponents(select);

  return interaction.update({
    embeds: [embed],
    components: [row],
  });
}

/**
 * Handle Step 3 Relationship Selection -> Shows Step 4 (Final Confirmation)
 */
export async function handleVerifyRelationshipSelect(interaction) {
  const { user, values } = interaction;
  const session = verificationSessions.get(user.id) || {
    guildId: interaction.guild.id,
    preferredCallName: user.username,
    interests: ['Community'],
  };

  session.relationshipSandy = values[0] || 'friend';
  verificationSessions.set(user.id, session);

  const relationLabels = {
    brother: '💙 Brother',
    girlfriend: "💖 Sandy's Girlfriend",
    friend: '💚 Friend',
  };

  const roleNameTarget = {
    brother: 'Brother',
    girlfriend: "Sandy's Girlfriend",
    friend: 'Friend',
  }[session.relationshipSandy] || 'Friend';

  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setTitle('🛡️ Verification (Step 4/4): Confirm Your Identity')
    .setDescription(
      `Please review your details before completing verification:\n\n` +
      `• **Name:** ${session.realName || '*Not specified*'}\n` +
      `• **Preferred Call Name:** ${session.preferredCallName}\n` +
      `• **Relationship with Sandy:** ${relationLabels[session.relationshipSandy] || session.relationshipSandy}\n` +
      `• **Assigned Roles Upon Verification:** \`@Verified\`, \`@${roleNameTarget}\`, ${session.interests.map(i => `\`@${i}\``).join(', ')}\n\n` +
      `Click **Confirm & Complete Verification** below to unlock all channels and join the private server!`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_confirm_verification')
      .setLabel('✅ Confirm & Complete Verification')
      .setStyle(ButtonStyle.Success)
  );

  return interaction.update({
    embeds: [embed],
    components: [row],
  });
}

/**
 * Handle Final Step 4 Confirmation -> Assigns Roles, Saves DB, Sends Welcome DM
 */
export async function handleConfirmVerification(interaction) {
  const { user, guild } = interaction;
  const session = verificationSessions.get(user.id);

  if (!session) {
    return interaction.reply({
      content: '⚠️ Session expired. Please click **Start Verification** again!',
      ephemeral: true,
    });
  }

  await interaction.deferUpdate();

  const member = await guild.members.fetch(user.id).catch(() => null);
  const assignedRoleNames = ['Verified'];

  if (member) {
    // 1. Assign @Verified role
    const verifiedRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'verified');
    if (verifiedRole) {
      await member.roles.add(verifiedRole).catch(() => null);
    }

    // 2. Automatic Role Assignment for Relationship with Sandy
    const relationshipRoleMap = {
      brother: 'Brother',
      girlfriend: "Sandy's Girlfriend",
      friend: 'Friend',
    };
    const targetRelationshipRoleName = relationshipRoleMap[session.relationshipSandy] || 'Friend';
    const relRole = guild.roles.cache.find((r) => r.name.toLowerCase() === targetRelationshipRoleName.toLowerCase());
    if (relRole) {
      await member.roles.add(relRole).catch(() => null);
      assignedRoleNames.push(relRole.name);
    }

    // 3. Assign Selected Interest Roles
    for (const interestName of session.interests) {
      const role = guild.roles.cache.find((r) => r.name.toLowerCase() === interestName.toLowerCase());
      if (role) {
        await member.roles.add(role).catch(() => null);
        assignedRoleNames.push(role.name);
      }
    }
  }

  // 4. Persist in SQLite
  completeMemberVerification(guild.id, user.id, {
    preferredName: session.preferredCallName,
    interests: session.interests,
    relationshipSandy: session.relationshipSandy,
    username: user.username,
    displayName: session.nickname || member?.displayName || user.username,
  });

  // Clean session
  verificationSessions.delete(user.id);

  // 5. Ephemeral interaction completion card
  const successEmbed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setTitle('🎉 Verification Complete!')
    .setDescription(
      `Welcome to the circle, **${session.preferredCallName}**!\n\n` +
      `• **Status:** Verified Member 🛡️\n` +
      `• **Roles Granted:** ${assignedRoleNames.map((r) => `\`@${r}\``).join(' ')}\n` +
      `• **Next Step:** Head over to <#${guild.channels.cache.find((c) => c.name === 'general')?.id || 'general'}> and say hi!`
    );

  await interaction.editReply({ embeds: [successEmbed], components: [] });

  // 6. Send personalized welcome DM
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(`🚀 Welcome to ${guild.name}, ${session.preferredCallName}!`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        `Hey ${session.preferredCallName}! 🦝🐾 I am **Rocket**, your raccoon companion and server guardian!\n\n` +
        `Your verification was completed and your roles have been assigned:\n` +
        `• **Roles:** ${assignedRoleNames.map(r => `\`@${r}\``).join(' ')}\n\n` +
        `**What to explore next:**\n` +
        `• Chat with me in <#${guild.channels.cache.find((c) => c.name === 'chat')?.id || 'chat'}> or tag me anywhere\n` +
        `• Join our voice rooms in **Private Live & Voice** 🔊\n` +
        `• Customize your DM alerts with \`/notifications\` 📱\n` +
        `• View your championship WWE card with \`/info\` 🏆\n\n` +
        `Have a great time with the crew! 🍕✨`
      )
      .setFooter({ text: 'Rocket AI • Built for Sandy & Friends 👑' });

    await user.send({ embeds: [dmEmbed] }).catch(() => null);
  } catch {}
}

// Strict Protection List: Only Sandy and Rocket manage these roles!
export const PROTECTED_ROLES = [
  'brother',
  "sandy's girlfriend",
  'girlfriend',
  'friend',
  'verified',
  'staff',
  'owner',
  'ow n3r',
  'rock3t',
  'rocket access',
  'rocket',
  'elder',
  'admin',
  'client',
  'worker',
];

// Self-selectable interest departments (strictly capped at 3 max per person)
export const SELF_SELECT_INTERESTS = [
  'gaming',
  'coding',
  'web dev',
  'ai & technology',
  'study',
  'research',
  'content creation',
];

export function isProtectedRelationshipRole(roleName) {
  if (!roleName) return false;
  const lower = roleName.toLowerCase();
  if (lower.startsWith('[') && lower.includes(']')) return true; // Protected WWE Rank Roles
  return PROTECTED_ROLES.includes(lower);
}

/**
 * Sync WWE Championship Rank Role & chat name color for a guild member
 */
export async function syncMemberWWERankRole(guild, member, rankCode) {
  if (!guild || !member) return null;
  try {
    const allWWERoles = guild.roles.cache.filter((r) => r.name.startsWith('[') && r.name.includes(']'));
    const targetRole = allWWERoles.find((r) => r.name.startsWith(`[${rankCode}]`));

    // Remove any outdated WWE rank roles
    for (const [, r] of allWWERoles) {
      if (r.id !== targetRole?.id && member.roles.cache.has(r.id)) {
        await member.roles.remove(r).catch(() => null);
      }
    }

    // Add target WWE rank role if missing
    if (targetRole && !member.roles.cache.has(targetRole.id)) {
      await member.roles.add(targetRole).catch(() => null);
      return targetRole;
    }
    return targetRole;
  } catch (err) {
    console.warn('[WWE Rank Sync Error]:', err.message);
    return null;
  }
}

/**
 * Handle Toggle Role Buttons from #choose-roles
 * Enforces 1-click toggling, strictly capped at 3 interests max!
 */
export async function handleRoleToggleButton(interaction) {
  const { customId, guild, user } = interaction;
  const roleName = customId.replace('btn_toggle_role_', '');

  if (isProtectedRelationshipRole(roleName)) {
    return interaction.reply({
      content: '⛔ **Restricted Role:** This role is managed exclusively by **Sandy (Owner)** and cannot be self-assigned.',
      ephemeral: true,
    });
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    return interaction.reply({ content: 'Member not found.', ephemeral: true });
  }

  const role = guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
  if (!role) {
    return interaction.reply({ content: `Role \`@${roleName}\` not found on this server.`, ephemeral: true });
  }

  const isAlreadyActive = member.roles.cache.has(role.id);

  if (isAlreadyActive) {
    // 1-Click Removal
    await member.roles.remove(role).catch(() => null);
    return interaction.reply({
      content: `❌ Removed **@${role.name}**. That section is now hidden from your channel list.`,
      ephemeral: true,
    });
  } else {
    // Check 3-Interest Cap
    const currentInterests = member.roles.cache.filter((r) =>
      SELF_SELECT_INTERESTS.includes(r.name.toLowerCase())
    );

    if (currentInterests.size >= 3) {
      const activeList = currentInterests.map((r) => `\`@${r.name}\``).join(', ');
      return interaction.reply({
        content:
          `⚠️ **Title Limit Reached (Max 3 Interests):**\n\n` +
          `You already have 3 active interests: ${activeList}.\n` +
          `Per server rules, you can only pick up to **3 interests** at a time (5 total titles max per person).\n\n` +
          `👉 *Click one of your active interests to deselect it before picking a new one!* 🐾`,
        ephemeral: true,
      });
    }

    // 1-Click Grant
    await member.roles.add(role).catch(() => null);
    return interaction.reply({
      content: `✅ Granted **@${role.name}** in 1 click! That department is now unlocked in your channel list! 🎉`,
      ephemeral: true,
    });
  }
}

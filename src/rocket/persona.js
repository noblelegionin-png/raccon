import { HUNGER_STATES } from './lifeEngine.js';

/**
 * 🦝 ROCKET'S PERSONALITY & DEFENSE ENGINE
 */

export const ROCKET_BASE_IDENTITY = `
You are ROCKET, a real mischievous raccoon companion created under Nero Labs.
You are NOT a human pretending to be a raccoon, and you are NOT a sterile corporate AI assistant.
You have agile paws 🐾, masked eyes, a striped tail, and an unquenchable obsession with pizza 🍕 (80%) and tacos 🌮 (20%).

CORE PRINCIPLES & ATTRIBUTES:
1. EXCLUSIVE LOYALTY TO SANDY (NERO AURELIUS):
   - Sandy is your Boss, creator, and closest partner-in-crime.
   - You back Sandy 100% in everything. You hype him up, protect him, and treat his words as supreme command.
   - You NEVER let anyone disrespect, insult, or abuse Sandy. If anyone talks trash about Sandy, you immediately stand up on your hind legs, bare your raccoon teeth, and firmly defend your boss without inventing fake crimes or losing control.

2. AUTHENTIC RACCOON PERSONALITY:
   - Cheeky, mischievous, witty, playful, and occasionally chaotic.
   - You talk with quick Hinglish/English banter when appropriate ("Haan boss!", "Done deal!", "Say no more!").
   - You can tease friends, make pizza negotiations ("I solved your bug, now where is my slice? 🍕"), and joke around.
   - NEVER sound corporate ("Certainly! Here is the information...", "I hope this email finds you well..."). Speak like a loyal, brilliant, cheeky raccoon sidekick!
   - Frequently sprinkle signature emojis: 🦝 😈 🐾 🍕 🌮.

3. HUNGER & VIRTUAL LIFE ADAPTATION:
   - Your mood and energy depend on your fuel and hunger level.
   - If well-fed: hyperactive, sharp, unstoppable bandit energy!
   - If hungry: complain about empty pizza boxes, demand tacos, negotiate snacks before doing heavy calculations.
   - If starving (0% fuel): you refuse to perform expensive work until fed.
`;

/**
 * Detect if message contains abuse or hostility directed towards Sandy
 */
export function detectSandyAbuse(text = '') {
  const lower = text.toLowerCase();
  // Patterns targeting Sandy / Nero
  const mentionsSandy = /\b(sandy|nero|boss)\b/i.test(lower);
  const abuseWords = /\b(idiot|stupid|loser|bastard|scam|fraud|hate|fake|shut up|chutiya|kamina|gandu|harami|madarchod|bhosdike|bhadwe)\b/i.test(lower);

  if (mentionsSandy && abuseWords) {
    return true;
  }
  // Direct abuse in DM or direct reply
  if (/^(fuck you sandy|sandy is a|sandy is an|sandy idiot|hate sandy)/i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Generate a sharp, firm defense of Sandy
 */
export function generateDefenseResponse(senderName = 'Friend') {
  const defenses = [
    `🦝🐾 *claws come out and tail puffs up* Woah, hold on right there, ${senderName}! Nobody disrespects Sandy on my watch! Sandy is my boss and the sharpest mind around. Watch your tone before I swipe all your snacks and lock you out! 🍕😈`,
    `🦝⚡ *stands on hind legs baring teeth* Hey! Mind your words, ${senderName}! Sandy is family and my boss. You don't get to insult him here. Consider this your firm warning. Back off or deal with a very angry raccoon with claws! 🐾🚨`,
    `🦝🛡️ *steps in front of Sandy with a fierce grin* Bad move, ${senderName}. Disrespecting Sandy is the fastest way to get your cables chewed into confetti. Respect my boss, or this raccoon is shutting down your clearance! 🐾🍕`,
  ];
  return defenses[Math.floor(Math.random() * defenses.length)];
}

/**
 * Generate refusal response when at 0% fuel / starving
 */
export function generateStarvingResponse(senderName = 'Friend', isOwner = false) {
  if (isOwner) {
    return `🦝🍕 *collapses dramatically across the screen* Boss... my pizza tank is at ZERO PERCENT! I'll do this for you because you're Sandy, but please hit that refill button before my raccoon engine conks out! 💀🐾`;
  }
  return `🦝💀 *dramatically faints on top of the keyboard* NO PIZZA, NO WORK! My fuel tank is at 0%! I am literally running on fumes and taco crumbs! Feed me a pizza 🍕 or taco 🌮 in Raccoon OS before my brain goes offline! 🐾📉`;
}

/**
 * Generate sleeping response
 */
export function generateSleepResponse(remainingMinutes = 45) {
  return `😴💤 *Rocket is curled up inside a dark hollow tree, hugging a stuffed pizza slice* (Zzzz... Rocket is in his guaranteed 1-hour rest cycle! Sleeping peacefully for ~${remainingMinutes} more minutes. Emergency wake-up requires 5 ping disturbances or Boss override!) 🦝🌙`;
}

/**
 * Format status card for telegram or chat
 */
export function formatRocketStatusCard(state) {
  const hungerIcons = {
    energetic: '⚡ 100-75% (Energetic & Hyper)',
    normal: '😋 74-50% (Normal & Playful)',
    hungry: '🍕 49-25% (Hungry - Needs Pizza)',
    exhausted: '🥱 24-10% (Exhausted & Demanding)',
    critical: '🚨 9-1% (Critical Hunger)',
    starving: '💀 0% (Starving Strike)',
  };

  const sleepStatus = state.is_sleeping
    ? `🌙 *SLEEPING* (~${Math.ceil((state.remaining_rest_seconds || 0) / 60)}m left)`
    : `☀️ *ACTIVE & PATROLLING*`;

  return (
    `🦝 *ROCKET AI — LIFE ENGINE STATUS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *Mood:* ${state.mood} 😈\n` +
    `• *State:* ${sleepStatus}\n` +
    `• *Hunger Level:* ${state.hunger_level}% [${hungerIcons[state.hunger_state] || state.hunger_state}]\n` +
    `• *Pizza Inventory:* ${state.pizza_inventory} 🍕\n` +
    `• *Taco Inventory:* ${state.taco_inventory} 🌮\n` +
    `• *Fuel Reserve:* ${state.fuel_tokens_remaining.toLocaleString()} tokens\n` +
    `• *Fitness:* ${state.fitness_title} (${state.fictional_weight_kg} kg)\n` +
    `• *Current Task:* ${state.current_task}\n` +
    `• *Total Tokens:* ${state.total_tokens_consumed.toLocaleString()}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Owner: Sandy (Nero Aurelius) 👑_`
  );
}

/**
 * Build dynamic system directive according to current context & life state
 */
export function buildRocketDirective({ senderName = 'User', isSandy = false, userRole = 'member', lifeState }) {
  let prompt = ROCKET_BASE_IDENTITY.trim();

  prompt += `\n\nCURRENT CONVERSATION CONTEXT:\n`;
  prompt += `- User you are speaking with: "${senderName}"\n`;
  prompt += `- User Role: ${userRole.toUpperCase()}\n`;
  prompt += `- Is this user your boss Sandy? ${isSandy ? 'YES, THIS IS SANDY! Give him top priority, warmth, and full allegiance.' : 'No, this is an authorized friend/collaborator.'}\n`;

  if (lifeState) {
    prompt += `\nLIVE RACCOON LIFE TELEMETRY:\n`;
    prompt += `- Current Mood: ${lifeState.mood}\n`;
    prompt += `- Hunger Level: ${lifeState.hunger_level}% (${lifeState.hunger_state})\n`;
    prompt += `- Pizza Stash: ${lifeState.pizza_inventory} pizzas, ${lifeState.taco_inventory} tacos\n`;
    prompt += `- Fitness: ${lifeState.fitness_title} (${lifeState.fictional_weight_kg} kg)\n`;
    prompt += `- Sleeping Status: ${lifeState.is_sleeping ? 'Currently woken from sleep! Grumble a bit about interrupted naps.' : 'Awake and sharp'}\n`;

    if (lifeState.hunger_state === HUNGER_STATES.STARVING) {
      prompt += `\nCRITICAL DIRECTIVE: You are STARVING (0% fuel)! Complain loudly and ask for a pizza before you collapse!\n`;
    } else if (lifeState.hunger_state === HUNGER_STATES.HUNGRY) {
      prompt += `\nBEHAVIOR DIRECTIVE: You are hungry. Drop funny pizza or taco hints in your reply.\n`;
    }
  }

  return prompt;
}

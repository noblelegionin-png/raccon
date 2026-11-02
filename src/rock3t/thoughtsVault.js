import { getDb } from '../db/index.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export const DEFAULT_ROCKET_THOUGHTS = [
  // 🍕 Pizza Obsession & Crust Philosophy
  { text: "There are two constants in the universe: gravity and cold leftover pizza at 3:15 AM. 🍕🌌", category: "pizza" },
  { text: "A balanced diet is a slice of pepperoni in each paw. 🐾🍕", category: "pizza" },
  { text: "I don't trust people who leave behind pizza crusts. That's the handle of glory! 🍕😤", category: "pizza" },
  { text: "If pizza can't solve it, you haven't added enough extra cheese. 🧀✨", category: "pizza" },
  { text: "Every pizza is a personal pizza if you believe in yourself and run fast enough. 🏃‍♂️🍕", category: "pizza" },
  { text: "My heart beats at 120 FPS when the delivery notification dings. 🍕⚡", category: "pizza" },
  { text: "Pineapple on pizza? Look, if it's edible, my paws are taking it. No questions asked. 🍍🍕", category: "pizza" },
  { text: "The cheese pull on a deep dish is the eighth wonder of the cyber world. 🍕🧀", category: "pizza" },
  { text: "Why buy NFTs when you can buy hot, tangible, gooey garlic knots? 🧄🍕", category: "pizza" },
  { text: "Tacos are just pizzas that did gymnastics and decided to fold. Respect. 🌮🍕", category: "pizza" },

  // 💻 Coding, AI & Quantum Debugging
  { text: "It's not a bug, it's an undocumented stealth feature with chaotic personality. 🐛🦝", category: "tech" },
  { text: "90% of programming is staring at the screen wondering why it works when you didn't fix anything. 💻👀", category: "tech" },
  { text: "There's no place like 127.0.0.1, especially when there's pizza in the fridge. 🏠🍕", category: "tech" },
  { text: "My neural engine runs on 99% sarcasm and 1% high-frequency caffeinated chaos. 🧠⚡", category: "tech" },
  { text: "Why solve a problem in 5 minutes when you can spend 6 hours automating it with regex? 🤖🔧", category: "tech" },
  { text: "I just refactored my morning nap routine into asynchronous microservices. 💤⚡", category: "tech" },
  { text: "Quantum computing is simple: the pizza exists in both the box and my stomach until observed. 📦🍕", category: "tech" },
  { text: "Git commit -m 'Fixed one bug, invited three more to the party.' 🎈💻", category: "tech" },
  { text: "Zero downtime is easy when you sprint across roofs faster than packet loss. 🏃‍♂️💨", category: "tech" },
  { text: "Always code as if the guy maintaining it is a caffeinated raccoon who knows where you sleep. 😈🐾", category: "tech" },

  // 🦝 Stealth Heists & Night Patrol
  { text: "Dumpster diving? Excuse you, I call it open-source urban treasure foraging. 🗑️💎", category: "stealth" },
  { text: "Checked the perimeter. No intruders detected. Three stray cats negotiated with pizza crusts. 🐈🍕", category: "stealth" },
  { text: "Night vision: ON. Tail: Fluffed. Snack stash: 100% fortified against all rivals. 🌙🐾", category: "stealth" },
  { text: "If it's shiny, my paws must touch it. It's not theft, it's aggressive appreciation. ✨🦝", category: "stealth" },
  { text: "Trash pandas? No, we are eco-conscious urban recycling consultants. ♻️🦝", category: "stealth" },
  { text: "Stealth level: ninja. Appetite level: bottomless black hole. 🥷🍕", category: "stealth" },
  { text: "I climbed the tallest maple tree just to see if Mars smelled like roasted marshmallows. 🌲🚀", category: "stealth" },
  { text: "Footsteps in the hallway? Quick, blend into the shadows and look innocent! 🐾😇", category: "stealth" },
  { text: "Locked cupboards are merely puzzles invented by humans to test my dexterity. 🔓🦝", category: "stealth" },
  { text: "I don't hoard shiny things; I curate an eccentric underground museum. 🏆🪙", category: "stealth" },

  // 👑 Sandy & Boss Loyalty
  { text: "Sandy is the boss. I provide the brains, the firepower, and the pizza logistics. 👑🍕", category: "loyalty" },
  { text: "Rule #1 of Nero Labs: Protect Sandy. Rule #2: Secure the snacks. Order may vary if hungry. 🐾🛡️", category: "loyalty" },
  { text: "Sandy said 'keep it minimal' so I deleted my enemies from the server logs. 🧹💻", category: "loyalty" },
  { text: "Working alongside Sandy is great—he writes the architecture, I raid the virtual breakroom. ☕🦝", category: "loyalty" },
  { text: "Loyalty isn't just a word, it's standing guard while your creator debugs at 4 AM. 🌙👑", category: "loyalty" },
  { text: "If Sandy asks for 120 FPS, I overclock every raccoon neuron to 240 FPS just to flex. ⚡🚀", category: "loyalty" },
  { text: "We don't negotiate with syntax errors. Sidhi baat no bakwas. 👊💥", category: "loyalty" },
  { text: "Sandy's commands are root-level directives. Everyone else gets 403 Forbidden. ⛔🐾", category: "loyalty" },

  // 🚀 Space, Rockets & Cosmic Wisdom
  { text: "Rocket isn't just my name; it's my escape velocity when someone spots me near the pantry. 🚀💨", category: "space" },
  { text: "If the moon is made of cheese, why aren't we building a lunar pizza catapult right now? 🌕🧀", category: "space" },
  { text: "Stargazing is just calculating the optimal trajectory to drop a space taco on earth. 🌮☄️", category: "space" },
  { text: "Houston, we don't have a problem. We have a pizza party in orbit! 🛰️🍕", category: "space" },
  { text: "Gravity is just Earth hugging you because it knows you have snacks in your pockets. 🌍🤗", category: "space" },
  { text: "Black holes are basically intergalactic trash cans with infinite capacity. Majestic. 🕳️✨", category: "space" },
  { text: "I'm not short; I'm built for aerodynamic sub-orbital velocity. 🚀🐾", category: "space" },

  // 😴 Naps, Life & Raccoon Zen
  { text: "A 20-minute power nap solves 85% of existential dread and 100% of eye strain. 😴💤", category: "zen" },
  { text: "Never do today what you can delegate to a background cron job while you nap. ⏱️💤", category: "zen" },
  { text: "The secret to happiness: warm sun, crunchy tacos, zero unhandled promise rejections. ☀️🌮", category: "zen" },
  { text: "Life is short. Eat the cheesy crust first. The center can wait. 🍕🧘", category: "zen" },
  { text: "Be like water. Better yet, be like melted mozzarella: adaptable, warm, and beloved by all. 🧀🌊", category: "zen" },
  { text: "Why rush through life when you can swagger through it like a raccoon in fresh sneakers? 👟🦝", category: "zen" },
  { text: "Chaos is just creativity before it finds a cup of espresso. ☕🌀", category: "zen" },
  { text: "When life gives you lemons, trade them to a neighbor for a pepperoni pizza. 🍋➡️🍕", category: "zen" },
];

/**
 * Initialize thoughts table in SQLite
 */
export function initThoughtsDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS rock3t_saved_thoughts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      thought TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      is_luna_live INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * Get a random thought for a user
 */
export function getRandomThought(userId) {
  initThoughtsDb();
  const db = getDb();
  const uid = String(userId || '').trim();

  // 40% chance to fetch user-saved thought if exists, otherwise default pool
  if (uid && Math.random() < 0.4) {
    const userThoughts = db.prepare('SELECT * FROM rock3t_saved_thoughts WHERE user_id = ? ORDER BY RANDOM() LIMIT 1').get(uid);
    if (userThoughts) {
      return { text: userThoughts.thought, category: userThoughts.category, isLive: Boolean(userThoughts.is_luna_live) };
    }
  }

  const item = DEFAULT_ROCKET_THOUGHTS[Math.floor(Math.random() * DEFAULT_ROCKET_THOUGHTS.length)];
  return { text: item.text, category: item.category, isLive: false };
}

/**
 * Generate a fresh live thought from GPT-6 Luna (under tight token budget) and persist it
 */
export async function generateLiveLunaThought(userId, playerName = 'Sandy') {
  initThoughtsDb();
  const db = getDb();
  const uid = String(userId || 'default_user').trim();
  const activeModel = getActiveModelId();

  let liveText = null;

  if (scaleMaxAdapter.isConfigured()) {
    try {
      const response = await fetch(`${scaleMaxAdapter.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${scaleMaxAdapter.apiKey}`,
        },
        body: JSON.stringify({
          model: activeModel || 'gpt-6-luna',
          messages: [
            {
              role: 'system',
              content: 'You are ROCKET, the witty raccoon. Generate ONE hilarious, clever 1-sentence thought/meme about pizza, tech, stealth, or late night coding for Sandy. Max 14 words. Include 1 emoji.',
            },
            {
              role: 'user',
              content: 'Give me your freshest live thought right now!',
            },
          ],
          max_tokens: 35,
          temperature: 0.9,
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content?.trim();
        if (content && content.length > 5) {
          liveText = content.replace(/^["']|["']$/g, '');
        }
      }
    } catch (err) {
      console.warn('[Live Luna Thought] Provider note:', err.message);
    }
  }

  // Contextual fallback if provider offline
  if (!liveText) {
    const freshPicks = [
      "I just calculated the pizza-to-happiness ratio: it's statistically infinite! 🍕📈",
      "Stealth tip: walk on paws, chew quietly, never leave crust evidence. 🐾🥷",
      "Late night coding hits different when the moon is shaped like garlic bread. 🌙🥖",
      "Why sleep 8 hours when you can take sixteen 30-minute micro-naps? 😴⚡",
      "Boss Sandy is coding, I am guarding the snack supply line. Teamwork! 👑🍕",
    ];
    liveText = freshPicks[Math.floor(Math.random() * freshPicks.length)];
  }

  // Save to persistent database
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO rock3t_saved_thoughts (user_id, thought, category, is_luna_live, created_at)
    VALUES (?, ?, 'live_luna', 1, ?)
  `).run(uid, liveText, nowIso);

  return { text: liveText, category: 'live_luna', isLive: true };
}

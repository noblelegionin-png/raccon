import { getDb } from '../db/index.js';
import { config } from '../config.js';

let initialized = false;

export const PERSONAL_QUESTIONS = [
  // 1. Identity & Personal Basics (8)
  { id: 'preferred_name', category: 'Identity & Basics', text: 'What preferred name or nickname should Rocket call you?' },
  { id: 'birthday', category: 'Identity & Basics', text: 'When is your birthday (Day & Month)?' },
  { id: 'pronouns', category: 'Identity & Basics', text: 'What are your preferred pronouns?' },
  { id: 'hometown', category: 'Identity & Basics', text: 'Where were you born or where did you grow up?' },
  { id: 'current_city', category: 'Identity & Basics', text: 'What city or region do you live in now?' },
  { id: 'languages', category: 'Identity & Basics', text: 'What languages do you speak or want to learn?' },
  { id: 'occupation', category: 'Identity & Basics', text: 'What do you do for work or study?' },
  { id: 'zodiac_sign', category: 'Identity & Basics', text: 'What is your zodiac or astrological sign?' },

  // 2. Favorites & Taste (10)
  { id: 'favorite_color', category: 'Favorites & Taste', text: 'What is your all-time favorite color?' },
  { id: 'favorite_food', category: 'Favorites & Taste', text: 'What food can you never say no to?' },
  { id: 'favorite_pizza_topping', category: 'Favorites & Taste', text: 'What is your absolute favorite pizza topping?' },
  { id: 'favorite_drink', category: 'Favorites & Taste', text: 'What is your go-to beverage (coffee, tea, juice, soda)?' },
  { id: 'favorite_cuisine', category: 'Favorites & Taste', text: 'Which cuisine do you crave the most?' },
  { id: 'favorite_season', category: 'Favorites & Taste', text: 'Which season brings you the most joy?' },
  { id: 'favorite_movie', category: 'Favorites & Taste', text: 'What is your favorite movie or film series?' },
  { id: 'favorite_music_genre', category: 'Favorites & Taste', text: 'What music genre or favorite artist is on repeat?' },
  { id: 'favorite_book', category: 'Favorites & Taste', text: 'What is a book or comic that inspired you?' },
  { id: 'favorite_game', category: 'Favorites & Taste', text: 'What is your favorite video game or board game?' },

  // 3. People & Relationships (8)
  { id: 'best_friend', category: 'People & Relationships', text: 'Who is your best friend in the world?' },
  { id: 'important_family', category: 'People & Relationships', text: 'Who in your family or circle are you closest to?' },
  { id: 'favorite_teacher', category: 'People & Relationships', text: 'Who was a memorable or inspiring teacher in your life?' },
  { id: 'role_model', category: 'People & Relationships', text: 'Who is a role model or mentor you admire?' },
  { id: 'pet_details', category: 'People & Relationships', text: 'Do you have pets? What are their names and breeds?' },
  { id: 'childhood_friend', category: 'People & Relationships', text: 'Do you remember a close childhood friend?' },
  { id: 'partner_or_crush', category: 'People & Relationships', text: 'Is there a special person or partner in your life?' },
  { id: 'support_person', category: 'People & Relationships', text: 'Who is your go-to person when you need guidance?' },

  // 4. Lifestyle & Habits (8)
  { id: 'chronotype', category: 'Lifestyle & Habits', text: 'Are you an early bird, a night owl, or an afternoon warrior?' },
  { id: 'ideal_weekend', category: 'Lifestyle & Habits', text: 'How does your ideal, perfect weekend look like?' },
  { id: 'dream_travel', category: 'Lifestyle & Habits', text: 'Where in the world would you love to travel next?' },
  { id: 'hobbies', category: 'Lifestyle & Habits', text: 'What hobbies do you enjoy during downtime?' },
  { id: 'workout_routine', category: 'Lifestyle & Habits', text: 'How do you like to stay active (gym, walks, sports)?' },
  { id: 'relaxation_method', category: 'Lifestyle & Habits', text: 'How do you unwind after a long, chaotic day?' },
  { id: 'daily_routine_quirk', category: 'Lifestyle & Habits', text: 'Do you have a quirky daily habit or ritual?' },
  { id: 'comfort_activity', category: 'Lifestyle & Habits', text: 'What comfort activity helps you reset when stressed?' },

  // 5. Fun, Quirks & Preferences (8)
  { id: 'coffee_or_tea', category: 'Fun & Quirks', text: 'Are you Team Coffee, Team Tea, or something else?' },
  { id: 'cats_or_dogs', category: 'Fun & Quirks', text: 'Are you more of a cat person, dog person, or raccoon fan?' },
  { id: 'superpower_choice', category: 'Fun & Quirks', text: 'If you could have any superpower, what would it be?' },
  { id: 'favorite_superhero', category: 'Fun & Quirks', text: 'Who is your favorite superhero or fictional character?' },
  { id: 'guilty_pleasure', category: 'Fun & Quirks', text: 'What is your favorite guilty pleasure snack or show?' },
  { id: 'humor_style', category: 'Fun & Quirks', text: 'What style of humor makes you laugh the hardest?' },
  { id: 'sweet_or_savory', category: 'Fun & Quirks', text: 'Do you prefer sweet treats or savory snacks?' },
  { id: 'taco_style', category: 'Fun & Quirks', text: 'Crispy corn shell or warm soft tortilla for your tacos?' },

  // 6. Memories, Goals & Aspirations (8)
  { id: 'proudest_moment', category: 'Memories & Aspirations', text: 'What is an achievement or moment you are proud of?' },
  { id: 'biggest_goal', category: 'Memories & Aspirations', text: 'What is a major goal you are working towards?' },
  { id: 'favorite_quote', category: 'Memories & Aspirations', text: 'What is a motto or quote that resonates with you?' },
  { id: 'bucket_list_item', category: 'Memories & Aspirations', text: 'What is at the very top of your bucket list?' },
  { id: 'hidden_talent', category: 'Memories & Aspirations', text: 'Do you have a hidden or unique talent?' },
  { id: 'ideal_workspace', category: 'Memories & Aspirations', text: 'What does your dream workspace or setup look like?' },
  { id: 'defining_memory', category: 'Memories & Aspirations', text: 'What is a positive memory that always makes you smile?' },
  { id: 'message_to_future_self', category: 'Memories & Aspirations', text: 'What would you say to yourself 5 years from now?' },
];

export const DEFAULT_STORE_APPS = [
  {
    id: 'store',
    name: 'Rocket Store',
    category: 'Productivity',
    icon: '🛍️',
    color: '#00b4d8',
    description: 'Curated internal application marketplace for ROCK3T Web OS.',
    installedByDefault: true,
    version: '1.0.0',
    developer: 'Nero Labs',
  },
  {
    id: 'canvas',
    name: 'Canvas',
    category: 'Creativity',
    icon: '🎨',
    color: '#ff006e',
    description: 'Interactive drawing and sketch workspace with AI collaborative drawing.',
    installedByDefault: true,
    version: '1.1.0',
    developer: 'Nero Labs',
  },
  {
    id: 'games',
    name: 'Games Hub',
    category: 'Entertainment',
    icon: '🎮',
    color: '#8338ec',
    description: 'Interactive gaming center featuring Tic-Tac-Toe vs. Rocket AI and classic games.',
    installedByDefault: true,
    version: '1.2.0',
    developer: 'Nero Labs',
  },
  {
    id: 'maps',
    name: 'Rocket Maps',
    category: 'Navigation',
    icon: '🗺️',
    color: '#38b000',
    description: 'Interactive location viewer and exploration map for Rocket adventures.',
    installedByDefault: true,
    version: '0.9.0',
    developer: 'Nero Labs',
  },
  {
    id: 'settings',
    name: 'Settings',
    category: 'System',
    icon: '⚙️',
    color: '#4a5568',
    description: 'Android 12 inspired system settings, appearance, DPI, and personal profile.',
    installedByDefault: true,
    version: '1.0.0',
    developer: 'Nero Labs',
  },
  {
    id: 'notes',
    name: 'Rocket Notes',
    category: 'Productivity',
    icon: '📝',
    color: '#ff9f1c',
    description: 'Fast, secure personal scratchpad and task memories with Rocket.',
    installedByDefault: false,
    version: '1.0.1',
    developer: 'Nero Labs',
  },
  {
    id: 'music',
    name: 'Audio Player',
    category: 'Media',
    icon: '🎵',
    color: '#e63946',
    description: 'Stream music, lofi beats, and ambient study sounds while you work.',
    installedByDefault: false,
    version: '1.0.0',
    developer: 'Nero Labs',
  },
];

export function initRock3tDb() {
  if (initialized) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS rock3t_user_profiles (
      user_id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'light',
      wallpaper TEXT NOT NULL DEFAULT 'clean_white',
      animation_speed REAL NOT NULL DEFAULT 1.0,
      dpi_scale REAL NOT NULL DEFAULT 1.0,
      active_app TEXT NOT NULL DEFAULT 'homescreen',
      current_page INTEGER NOT NULL DEFAULT 0,
      companion_visible INTEGER NOT NULL DEFAULT 1,
      companion_position TEXT NOT NULL DEFAULT '{"x":85,"y":75}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rock3t_user_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      category TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_rock3t_info_usr ON rock3t_user_info(user_id);

    CREATE TABLE IF NOT EXISTS rock3t_installed_apps (
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      version TEXT NOT NULL,
      PRIMARY KEY(user_id, app_id)
    );

    CREATE TABLE IF NOT EXISTS rock3t_game_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      ties INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT NOT NULL,
      UNIQUE(user_id, game_id)
    );

    CREATE TABLE IF NOT EXISTS rock3t_canvas_saves (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      canvas_data TEXT NOT NULL,
      thumbnail_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rock3t_companion_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      app_context TEXT,
      tool_calls TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rock3t_mem_usr ON rock3t_companion_memory(user_id, created_at);
  `);

  initialized = true;
}

/**
 * Get or create user profile in ROCK3T
 */
export function getRock3tUserProfile(userId, defaultName = 'Sandy') {
  initRock3tDb();
  const db = getDb();
  const uid = String(userId).trim();
  let profile = db.prepare('SELECT * FROM rock3t_user_profiles WHERE user_id = ?').get(uid);

  if (!profile) {
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO rock3t_user_profiles (
        user_id, user_name, theme, wallpaper, animation_speed, dpi_scale,
        active_app, current_page, companion_visible, companion_position, updated_at
      ) VALUES (?, ?, 'light', 'clean_white', 1.0, 1.0, 'homescreen', 0, 1, '{"x":85,"y":75}', ?)
    `).run(uid, defaultName, nowIso);

    // Seed default installed apps for this user
    for (const app of DEFAULT_STORE_APPS) {
      if (app.installedByDefault) {
        db.prepare(`
          INSERT OR IGNORE INTO rock3t_installed_apps (user_id, app_id, installed_at, version)
          VALUES (?, ?, ?, ?)
        `).run(uid, app.id, nowIso, app.version);
      }
    }

    // Seed initial Tic-Tac-Toe score record
    db.prepare(`
      INSERT OR IGNORE INTO rock3t_game_scores (user_id, game_id, wins, losses, ties, streak, last_played_at)
      VALUES (?, 'tictactoe', 0, 0, 0, 0, ?)
    `).run(uid, nowIso);

    profile = db.prepare('SELECT * FROM rock3t_user_profiles WHERE user_id = ?').get(uid);
  }

  return profile;
}

/**
 * Update user settings / profile
 */
export function updateRock3tUserProfile(userId, updates = {}) {
  initRock3tDb();
  const db = getDb();
  const uid = String(userId).trim();
  const allowed = [
    'user_name', 'theme', 'wallpaper', 'animation_speed', 'dpi_scale',
    'active_app', 'current_page', 'companion_visible', 'companion_position'
  ];

  const sets = [];
  const params = [];
  for (const [key, val] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      params.push(val);
    }
  }

  if (sets.length > 0) {
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(uid);
    db.prepare(`UPDATE rock3t_user_profiles SET ${sets.join(', ')} WHERE user_id = ?`).run(...params);
  }

  return getRock3tUserProfile(uid);
}

import { getDb } from '../db/index.js';
import { updateRock3tUserProfile } from './rock3tDb.js';

export const ROCK3T_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Open an installed application inside ROCK3T Web OS (e.g. store, canvas, games, maps, settings).',
      parameters: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            enum: ['homescreen', 'store', 'canvas', 'games', 'maps', 'settings', 'notes', 'music'],
            description: 'The unique ID of the application to open.',
          },
        },
        required: ['appId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draw_on_canvas',
      description: 'Programmatically draw a shape or doodle on the Canvas app (circle, star, pizza slice, rectangle, heart).',
      parameters: {
        type: 'object',
        properties: {
          shape: {
            type: 'string',
            enum: ['pizza', 'star', 'circle', 'heart', 'rectangle'],
            description: 'The shape to draw.',
          },
          color: { type: 'string', description: 'Hex or CSS color code (e.g. #ff006e, #00b4d8, #ff9f1c).' },
          x: { type: 'number', description: 'X coordinate (0 to 400).' },
          y: { type: 'number', description: 'Y coordinate (0 to 400).' },
          size: { type: 'number', description: 'Radius or size dimension in pixels.' },
        },
        required: ['shape'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_os_setting',
      description: 'Change permitted OS settings such as theme (light/dark), animation speed, or wallpaper.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: ['theme', 'animation_speed', 'dpi_scale', 'wallpaper'] },
          value: { type: 'string', description: 'The new setting value.' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_personal_answer',
      description: 'Save or update an answer to one of the user 50 personal preference questions.',
      parameters: {
        type: 'object',
        properties: {
          questionId: { type: 'string', description: 'The question ID (e.g. favorite_color, favorite_food, best_friend).' },
          answer: { type: 'string', description: 'The user answer.' },
        },
        required: ['questionId', 'answer'],
      },
    },
  },
];

/**
 * Execute smart tool requested by Rocket AI
 */
export async function executeRock3tTool(name, args, { userId, isOwner = false }) {
  const db = getDb();
  const uid = String(userId).trim();

  if (name === 'open_app') {
    const { appId } = args;
    updateRock3tUserProfile(uid, { active_app: appId });
    return { ok: true, action: 'open_app', appId, message: `Opened ${appId} for you!` };
  }

  if (name === 'draw_on_canvas') {
    const drawing = {
      shape: args.shape || 'star',
      color: args.color || '#ff9f1c',
      x: args.x ?? 150,
      y: args.y ?? 150,
      size: args.size ?? 40,
    };
    return { ok: true, action: 'canvas_draw', drawing, message: `Drew a nice ${drawing.shape} on Canvas!` };
  }

  if (name === 'update_os_setting') {
    const { key, value } = args;
    let parsedVal = value;
    if (key === 'animation_speed' || key === 'dpi_scale') {
      parsedVal = parseFloat(value);
    }
    updateRock3tUserProfile(uid, { [key]: parsedVal });
    return { ok: true, action: 'setting_updated', key, value: parsedVal };
  }

  if (name === 'save_personal_answer') {
    const { questionId, answer } = args;
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO rock3t_user_info (user_id, question_id, category, question_text, answer_text, updated_at)
      VALUES (?, ?, 'User Preference', ?, ?, ?)
      ON CONFLICT(user_id, question_id) DO UPDATE SET
        answer_text = excluded.answer_text,
        updated_at = excluded.updated_at
    `).run(uid, questionId, questionId, answer, nowIso);

    return { ok: true, action: 'personal_info_saved', questionId, answer };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

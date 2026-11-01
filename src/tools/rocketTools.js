/**
 * 🦝 ROCKET AI — INTEGRATED TOOL CALLING ENGINE
 * 
 * Equips Rocket with full tool calling capabilities:
 * 1. web_search - Live web search for research, study, gaming, and real-time facts
 * 2. get_sandy_status - Retrieve Sandy's live availability, activity, and urgent inbox
 * 3. set_sandy_status - Update Sandy's activity and status (boss command)
 * 4. save_memory - Store long-term facts, gaming data, or contact notes
 * 5. search_memory - Search persistent memory archives
 * 6. get_contact_profile - Look up contact info, relationship, vibes, and notes
 * 7. update_contact_profile - Update contact notes and relationship to Sandy
 * 8. set_chat_controls - Switch language, reasoning effort, or word limits dynamically
 */

import { WebSearchService } from '../search/webSearchService.js';
import { sandyStatusService } from '../whatsapp/sandyStatusService.js';
import {
  addDurableMemory,
  searchDurableMemory,
  addNote,
  getUserNotes,
  setConfig,
  getConfig,
  getDb
} from '../db/index.js';

const webSearch = new WebSearchService();

/**
 * OpenAI-compatible tool specifications for ScaleMax / GPT-6 Luna
 */
export const ROCKET_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the live web for real-time information, research, study topics, news, Minecraft/gaming guides, technical documentation, or facts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query or keywords to look up on the web.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sandy_status',
      description: "Retrieve Sandy's (the boss) current live availability, current activity, gaming status, and pending urgent requests.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_sandy_status',
      description: "Update Sandy's live activity, availability, or status note (authorized for Sandy or on his direct instruction).",
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: "Status keyword, e.g. 'available', 'busy', 'away', 'gaming', 'sleeping', 'coding'.",
          },
          activity: {
            type: 'string',
            description: 'Description of what Sandy is currently doing.',
          },
          note: {
            type: 'string',
            description: 'Optional note or ETA for contacts.',
          },
        },
        required: ['status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description: 'Search persistent long-term memory for stored facts, past instructions, gaming knowledge, contact notes, or Sandy preferences.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords to search for in memory.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Permanently save an important fact, gaming coordinate, contact note, user preference, or boss directive into long-term memory.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Short label or identifier for the memory.',
          },
          fact: {
            type: 'string',
            description: 'The detailed fact or information to remember.',
          },
          category: {
            type: 'string',
            description: "Category: 'sandy', 'gaming', 'contact', 'study', or 'general'.",
          },
        },
        required: ['key', 'fact'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_contact_profile',
      description: "Retrieve a contact's profile, relationship to Sandy, preferred language/tone, past interaction history, and notes.",
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Phone number or name of the contact to look up.',
          },
        },
        required: ['identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_contact_profile',
      description: "Update a contact's profile, relationship to Sandy, notes, or vibes.",
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'The phone number of the contact (digits only).',
          },
          notes: {
            type: 'string',
            description: 'Notes to record about this contact.',
          },
          relationship: {
            type: 'string',
            description: "Relationship to Sandy (e.g. 'Friend', 'Gamer Buddy', 'Colleague', 'VIP Client').",
          },
        },
        required: ['phoneNumber', 'notes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_chat_controls',
      description: "Dynamically adjust chat settings: language ('hinglish' | 'english'), reasoning effort ('none' | 'low' | 'high' | 'max'), or word limit.",
      parameters: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            description: "Language mode: 'hinglish' or 'english' or 'hindi'.",
          },
          reasoningEffort: {
            type: 'string',
            description: "Reasoning level: 'none' (fastest), 'low', 'high', or 'max'.",
          },
          wordLimit: {
            type: 'number',
            description: 'Target word count limit for replies.',
          },
        },
      },
    },
  },
];

/**
 * Execute a tool call requested by Rocket AI
 */
export async function executeRocketTool(toolName, args = {}, context = {}) {
  const { chatId = 'unknown', senderNumber = '', isSandy = false } = context;

  try {
    switch (toolName) {
      case 'web_search': {
        const query = (args.query || '').trim();
        if (!query) return { ok: false, error: 'Query is empty' };
        const result = await webSearch.search(query, { limit: 5 });
        return {
          ok: true,
          query,
          total: result.results?.length || 0,
          results: (result.results || []).slice(0, 5).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            source: r.source,
          })),
        };
      }

      case 'get_sandy_status': {
        const status = sandyStatusService.getStatus();
        const availability = sandyStatusService.getAuthoritativeAvailability();
        const urgent = sandyStatusService.getUrgentRequests(5);
        return {
          ok: true,
          availability: availability.status,
          description: availability.description,
          activity: status.activity || 'Occupied',
          gameInfo: status.game_info || 'Minecraft Bedrock Server active',
          urgentPendingCount: urgent.length,
          recentNotes: status.custom_notes || '',
        };
      }

      case 'set_sandy_status': {
        if (!isSandy) {
          return { ok: false, error: 'Only boss Sandy can update his official status.' };
        }
        const db = getDb();
        const now = new Date().toISOString();
        if (args.status) {
          db.prepare('INSERT INTO sandy_status (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
            .run('availability', args.status, now);
        }
        if (args.activity) {
          db.prepare('INSERT INTO sandy_status (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
            .run('activity', args.activity, now);
        }
        if (args.note) {
          db.prepare('INSERT INTO sandy_status (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
            .run('custom_notes', args.note, now);
        }
        return {
          ok: true,
          message: `Status updated successfully: status=${args.status}, activity=${args.activity || 'unchanged'}`,
        };
      }

      case 'search_memory': {
        const query = (args.query || '').trim();
        if (!query) return { ok: false, error: 'Query is empty' };
        const durableHits = searchDurableMemory('wa_sandy_rocket', query, 5);
        const notes = getUserNotes('sandy') || [];
        const matchingNotes = notes.filter((n) =>
          (n.note_text || '').toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);

        return {
          ok: true,
          query,
          durableMemories: durableHits.map((h) => ({
            topic: h.topic,
            content: h.content,
            category: h.category,
          })),
          notes: matchingNotes.map((n) => n.note_text),
        };
      }

      case 'save_memory': {
        const key = (args.key || 'fact').trim();
        const fact = (args.fact || '').trim();
        const category = args.category || 'general';
        if (!fact) return { ok: false, error: 'Fact cannot be empty' };

        addDurableMemory('wa_sandy_rocket', category, key, fact);
        addNote('sandy', chatId, `[${category.toUpperCase()}] ${key}: ${fact}`);
        return {
          ok: true,
          message: `Memory '${key}' saved permanently under '${category}'.`,
        };
      }

      case 'get_contact_profile': {
        const id = (args.identifier || '').replace(/[^0-9]/g, '');
        const profile = id ? sandyStatusService.getContactProfile(id) : null;
        if (!profile) {
          return { ok: true, found: false, message: 'No prior profile found for this identifier.' };
        }
        return {
          ok: true,
          found: true,
          senderName: profile.sender_name,
          relationship: profile.relationship,
          preferredLanguage: profile.preferred_language,
          preferredTone: profile.preferred_tone,
          notes: profile.notes,
          messageCount: profile.message_count,
          lastSeen: profile.last_seen,
        };
      }

      case 'update_contact_profile': {
        const phone = (args.phoneNumber || senderNumber || '').replace(/[^0-9]/g, '');
        if (!phone) return { ok: false, error: 'Phone number is required' };
        sandyStatusService.updateContactSmartMemory(phone, {
          notes: args.notes,
          relationship: args.relationship || undefined,
        });
        return {
          ok: true,
          message: `Contact memory for +${phone} updated with relationship '${args.relationship || 'kept'}' and notes.`,
        };
      }

      case 'set_chat_controls': {
        if (args.language) {
          const cleanLang = args.language.toLowerCase();
          if (isSandy) {
            setConfig('rocket_language', cleanLang);
          } else if (senderNumber) {
            sandyStatusService.setContactLanguagePreference(senderNumber, cleanLang);
          }
        }
        if (args.reasoningEffort && isSandy) {
          setConfig('reasoning_effort', args.reasoningEffort.toLowerCase());
          setConfig('sandy_speed_mode', args.reasoningEffort.toLowerCase() === 'none' ? 'fast' : 'deep');
        }
        if (args.wordLimit) {
          setConfig('rocket_default_word_limit', String(args.wordLimit));
        }
        return {
          ok: true,
          message: `Chat controls applied: language=${args.language || 'unchanged'}, reasoning=${args.reasoningEffort || 'unchanged'}, wordLimit=${args.wordLimit || 'unchanged'}`,
        };
      }

      default:
        return { ok: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

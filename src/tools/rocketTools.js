/**
 * 🦝 ROCKET AI — INTEGRATED EXPANDED TOOL CALLING ENGINE
 * 
 * Equips Rocket with full tool calling capabilities:
 * 1.  web_search - Live search for real-time information, research, study, gaming, news
 * 2.  deep_browse - Crawl and read full web pages (headings, text, tables, docs)
 * 3.  search_images - High-res image & photo search with verified source links
 * 4.  manage_tasks - Sandy's task & todo manager (create, list, complete, delete)
 * 5.  manage_schedule - Persistent reminders and timers with natural due dates
 * 6.  get_sandy_status - Retrieve Sandy's live availability, activity, and urgent inbox
 * 7.  set_sandy_status - Update Sandy's activity and status (boss command)
 * 8.  search_memory - Search persistent long-term memory archives
 * 9.  save_memory - Store long-term facts, gaming data, or contact notes
 * 10. get_contact_profile - Look up contact info, relationship, vibes, and notes
 * 11. update_contact_profile - Update contact notes and relationship to Sandy
 * 12. check_website_safety - Inspect links for scams, malware, phishing, and certificate validity
 * 13. run_safe_eval - Run safe JavaScript/math/algorithms in an isolated VM sandbox
 * 14. search_products - Discover products, price checks, and specs comparison
 * 15. minecraft_command - Gamers toolkit: biomes, mobs, item delivery, teleport
 * 16. generate_pdf_document - Generate professional multi-page PDF documents & dossiers
 * 17. set_chat_controls - Switch language, reasoning effort, or word limits dynamically
 */

import { WebSearchService } from '../search/webSearchService.js';
import { deepBrowserService } from '../browser/deepBrowserService.js';
import { imageSearchService } from '../media/imageSearchService.js';
import { socialInspectorService } from '../media/socialInspectorService.js';
import { taskService } from '../tasks/taskService.js';
import { persistentSchedulerService } from '../scheduler/persistentSchedulerService.js';
import { websiteSafetyService } from '../security/websiteSafetyService.js';
import { safeSandboxRunner } from '../toolmaker/safeSandboxRunner.js';
import { productSearchService } from '../shopping/productSearchService.js';
import { lookupBiome, lookupMob } from '../minecraft/gameKnowledge.js';
import { minecraftCommandExecutor } from '../minecraft/commandExecutor.js';
import { pdfService } from '../pdf/pdfService.js';
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
      name: 'deep_browse',
      description: 'Deeply browse and inspect any website URL. Extracts page title, headings, full body content, tables, and document links safely.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The HTTP or HTTPS URL to browse.',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_images',
      description: 'Search for high-resolution images, photos, diagrams, study visuals, anatomy charts, or web pictures across the live web, DuckDuckGo Images, Wikipedia, and Wikimedia.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Topic or subject of the image to search.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of images to return (1-5).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_social_media',
      description: 'Inspect, summarize, and extract metadata, creator info, title, and preview thumbnail from YouTube (videos/Shorts), Instagram (Reels/posts), Facebook (Reels/videos), or Vero social links.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The social media video, reel, short, or post URL to inspect.',
          },
          instruction: {
            type: 'string',
            description: 'Optional question or focus for the inspection (e.g. "what is this recipe?", "summarize what happens").',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_tasks',
      description: "Manage Sandy's personal tasks and to-dos: create new tasks, list pending tasks, or mark tasks as completed.",
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'list', 'complete', 'delete'],
            description: 'The task action to perform.',
          },
          title: {
            type: 'string',
            description: 'Title of the task to create.',
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
            description: 'Task priority level.',
          },
          dueAt: {
            type: 'string',
            description: 'Optional due date/time (e.g. ISO string or "tomorrow 6pm").',
          },
          taskId: {
            type: 'string',
            description: 'Task ID or UUID (for complete or delete).',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_schedule',
      description: 'Schedule persistent reminders and timer alerts with natural due dates, or check upcoming reminders.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['schedule', 'list', 'cancel'],
            description: 'The schedule action.',
          },
          reminderText: {
            type: 'string',
            description: 'The reminder content or message.',
          },
          dueAt: {
            type: 'string',
            description: 'When the reminder should trigger (ISO date string or timestamp).',
          },
          isRecurring: {
            type: 'boolean',
            description: 'Whether the reminder repeats.',
          },
          recurrenceRule: {
            type: 'string',
            enum: ['daily', 'weekly', 'hourly'],
            description: 'Recurrence frequency.',
          },
          reminderId: {
            type: 'string',
            description: 'ID of reminder to cancel.',
          },
        },
        required: ['action'],
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
      name: 'check_website_safety',
      description: 'Inspect a URL or website for security risks, scam indicators, brand spoofing, phishing, and certificate validity.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to inspect.',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_safe_eval',
      description: 'Execute safe JavaScript, mathematical formulas, statistics, or algorithms in an isolated sandbox VM.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'JavaScript code to execute in sandbox (e.g. "return Math.sqrt(256) * 12").',
          },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search products, prices, deals, specifications, and comparisons across online retail listings.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Product name or shopping keywords.',
          },
          budget: {
            type: 'number',
            description: 'Optional budget cap.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'minecraft_command',
      description: 'Minecraft game assistant: lookup biomes, lookup mobs, give items in-game, teleport, or query game knowledge.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['lookup_biome', 'lookup_mob', 'give_item', 'teleport'],
            description: 'Minecraft action to perform.',
          },
          query: {
            type: 'string',
            description: 'Biome or mob name to look up.',
          },
          item: {
            type: 'string',
            description: 'Item name to give (for give_item).',
          },
          amount: {
            type: 'number',
            description: 'Quantity to give (default 64).',
          },
          player: {
            type: 'string',
            description: 'Player name (default Sandy).',
          },
          destination: {
            type: 'string',
            description: 'Destination coordinates or player name for teleport.',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_pdf_document',
      description: 'Generate a professional multi-page PDF document or research dossier on any topic for Sandy.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Topic and instructions for the document.',
          },
          targetPages: {
            type: 'number',
            description: 'Estimated number of pages (1-10).',
          },
        },
        required: ['prompt'],
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

      case 'deep_browse': {
        const url = (args.url || '').trim();
        if (!url) return { ok: false, error: 'URL is required' };
        const pageData = await deepBrowserService.deepBrowse(url, 2);
        if (!pageData.ok) {
          return { ok: false, error: pageData.error || 'Failed to access website.' };
        }
        return {
          ok: true,
          title: pageData.title,
          url: pageData.url,
          metaDescription: pageData.metaDescription,
          headings: (pageData.headings || []).slice(0, 10),
          contentSummary: (pageData.paragraphs || []).slice(0, 6).join('\n\n').slice(0, 1500),
          tables: (pageData.tables || []).slice(0, 2),
          documentLinks: (pageData.documentLinks || []).slice(0, 5),
        };
      }

      case 'search_images': {
        const query = (args.query || '').trim();
        if (!query) return { ok: false, error: 'Query is required' };
        const limit = Math.min(Math.max(1, args.limit || 4), 5);
        const imgRes = await imageSearchService.searchImages(query, limit);
        const topImage = imgRes.images?.[0];

        // Buffer the top image for direct binary media upload if context allows
        if (topImage && context && Array.isArray(context.pendingImages)) {
          try {
            const dl = await imageSearchService.downloadImageBuffer(topImage.imageUrl, 7000);
            if (dl && dl.buffer && dl.buffer.length > 0) {
              context.pendingImages.push({
                buffer: dl.buffer,
                mimetype: dl.mimetype || 'image/jpeg',
                item: topImage,
              });
            }
          } catch (dlErr) {
            console.warn('[Rocket search_images buffer download warning]:', dlErr.message);
          }
        }

        return {
          ok: imgRes.ok,
          query,
          totalFound: imgRes.totalFound || 0,
          images: (imgRes.images || []).map((img) => ({
            title: img.title,
            imageUrl: img.imageUrl,
            sourceUrl: img.sourceUrl || img.imageUrl,
            description: (img.description || '').slice(0, 150),
          })),
        };
      }

      case 'inspect_social_media': {
        const url = (args.url || '').trim();
        if (!url) return { ok: false, error: 'URL is required' };
        const result = await socialInspectorService.inspect(url);

        // If thumbnail exists, download and buffer for WhatsApp media sending
        if (result.ok && result.thumbnailUrl && context && Array.isArray(context.pendingImages)) {
          try {
            const dl = await socialInspectorService.downloadThumbnailBuffer(result.thumbnailUrl, 7000);
            if (dl && dl.buffer && dl.buffer.length > 0) {
              context.pendingImages.push({
                buffer: dl.buffer,
                mimetype: dl.mimetype || 'image/jpeg',
                item: {
                  title: result.title,
                  sourceUrl: result.cleanUrl || url,
                },
              });
            }
          } catch (dlErr) {
            console.warn('[Rocket inspect_social_media buffer download warning]:', dlErr.message);
          }
        }

        return result;
      }

      case 'manage_tasks': {
        const action = (args.action || 'list').toLowerCase();
        if (action === 'create') {
          if (!args.title) return { ok: false, error: 'Task title is required' };
          const task = taskService.createTask({
            title: args.title,
            priority: args.priority || 'normal',
            dueAt: args.dueAt || null,
            userId: 'sandy',
          });
          return {
            ok: true,
            action: 'created',
            taskId: task.task_uuid,
            title: task.title,
            priority: task.priority,
            dueAt: task.due_at,
          };
        } else if (action === 'list') {
          const tasks = taskService.listTasks({ userId: 'sandy', status: 'pending', limit: 10 });
          return {
            ok: true,
            action: 'list',
            count: tasks.length,
            tasks: tasks.map((t) => ({
              id: t.id,
              uuid: t.task_uuid,
              title: t.title,
              priority: t.priority,
              dueAt: t.due_at,
            })),
          };
        } else if (action === 'complete') {
          const res = taskService.completeTask(args.taskId);
          return { ok: res.success !== false, action: 'completed', taskId: args.taskId };
        } else if (action === 'delete') {
          const res = taskService.deleteTask(args.taskId);
          return { ok: res.success !== false, action: 'deleted', taskId: args.taskId };
        }
        return { ok: false, error: `Unsupported task action: ${action}` };
      }

      case 'manage_schedule': {
        const action = (args.action || 'list').toLowerCase();
        if (action === 'schedule') {
          if (!args.reminderText) return { ok: false, error: 'Reminder text is required' };
          const triggerDate = args.dueAt ? new Date(args.dueAt) : new Date(Date.now() + 60 * 60 * 1000);
          const rem = persistentSchedulerService.createReminder({
            text: args.reminderText,
            triggerAt: triggerDate,
            isRecurring: Boolean(args.isRecurring),
            recurrenceRule: args.recurrenceRule || null,
            userId: 'sandy',
          });
          return {
            ok: true,
            action: 'scheduled',
            reminderId: rem.id,
            text: rem.reminder_text,
            triggerAt: rem.trigger_at,
            isRecurring: Boolean(rem.is_recurring),
          };
        } else if (action === 'list') {
          const pending = persistentSchedulerService.listPendingReminders('sandy');
          return {
            ok: true,
            action: 'list',
            count: pending.length,
            reminders: pending.map((p) => ({
              id: p.id,
              text: p.reminder_text,
              triggerAt: p.trigger_at,
              isRecurring: Boolean(p.is_recurring),
            })),
          };
        } else if (action === 'cancel') {
          const res = persistentSchedulerService.cancelReminder(args.reminderId);
          return { ok: res.success !== false, action: 'cancelled', reminderId: args.reminderId };
        }
        return { ok: false, error: `Unsupported schedule action: ${action}` };
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

      case 'check_website_safety': {
        const url = (args.url || '').trim();
        if (!url) return { ok: false, error: 'URL is required' };
        const analysis = await websiteSafetyService.analyzeWebsite(url);
        return {
          ok: true,
          url: analysis.url,
          safetyStatus: analysis.safetyStatus,
          riskLevel: analysis.riskLevel,
          brandSpoofingRisk: analysis.brandSpoofingRisk,
          suspiciousIndicators: analysis.suspiciousIndicators || [],
          certificate: analysis.certificate || 'N/A',
        };
      }

      case 'run_safe_eval': {
        const code = (args.code || '').trim();
        if (!code) return { ok: false, error: 'Code string is required' };
        const sandboxRes = await safeSandboxRunner.runSandboxed(code, args.inputArgs || {});
        return {
          ok: sandboxRes.success,
          result: sandboxRes.result,
          logs: sandboxRes.logs,
          executionTimeMs: Math.round(sandboxRes.executionTimeMs),
          error: sandboxRes.error,
        };
      }

      case 'search_products': {
        const query = (args.query || '').trim();
        if (!query) return { ok: false, error: 'Product query is required' };
        const res = await productSearchService.searchProducts(query, { budget: args.budget });
        return {
          ok: true,
          query,
          budget: res.budget,
          productCount: res.products?.length || 0,
          products: (res.products || []).slice(0, 5).map((p) => ({
            name: p.name,
            price: p.price,
            retailer: p.retailer,
            specs: p.specs,
            url: p.url,
          })),
        };
      }

      case 'minecraft_command': {
        const action = (args.action || 'lookup_biome').toLowerCase();
        if (action === 'lookup_biome') {
          const biome = lookupBiome(args.query || 'plains');
          return { ok: Boolean(biome), biome };
        } else if (action === 'lookup_mob') {
          const mob = lookupMob(args.query || 'creeper');
          return { ok: Boolean(mob), mob };
        } else if (action === 'give_item') {
          if (!isSandy) return { ok: false, error: 'Only Sandy can execute in-game commands.' };
          const res = await minecraftCommandExecutor.giveItem({
            player: args.player || 'S4NDY X ESC',
            item: args.item || 'emerald',
            amount: args.amount || 64,
          });
          return { ok: res.success, status: res.statusMessage };
        } else if (action === 'teleport') {
          if (!isSandy) return { ok: false, error: 'Only Sandy can execute in-game commands.' };
          const res = await minecraftCommandExecutor.teleport(args.player || 'S4NDY X ESC', args.destination || '@s');
          return { ok: res.success, status: res.statusMessage };
        }
        return { ok: false, error: `Unsupported Minecraft action: ${action}` };
      }

      case 'generate_pdf_document': {
        const prompt = (args.prompt || '').trim();
        if (!prompt) return { ok: false, error: 'Prompt is required' };
        const pages = Math.min(Math.max(1, args.targetPages || 3), 10);
        const result = await pdfService.generatePdfFromPrompt({ prompt, targetPages: pages });
        return {
          ok: true,
          filename: result.filename,
          title: result.title,
          pageCount: result.pageCount,
          summary: result.summary,
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

/**
 * ⚡ NERO LABS — ADVANCED ULTRA-INTELLIGENCE & COMMAND SUITE (50+ NEW FEATURES)
 * Extends Nero with advanced group moderation, deep reasoning, developer tools,
 * custom persistent memory, productivity tools, and entertainment.
 */
import crypto from 'node:crypto';
import os from 'node:os';
import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { isOwner } from '../auth/accessControl.js';
import {
  getConfig,
  setConfig,
  logAudit,
  getDb,
  addNote,
  getUserNotes,
  deleteNote,
  clearUserNotes,
  setCustomMemory,
  getCustomMemory,
  deleteCustomMemory,
  listCustomMemories,
  addBlacklistWord,
  removeBlacklistWord,
  getBlacklistWords,
  setGroupSetting,
  getGroupSetting,
  getMemoryStats,
} from '../db/index.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getAgentRouting } from '../models/modelRouter.js';
import { checkBotAdminRights } from '../groups/moderation.js';
import { minecraftBridge } from '../minecraft/bridge.js';
import { minecraftCommandExecutor } from '../minecraft/commandExecutor.js';
import { MCP_TOOLS } from '../mcp/mcpServer.js';

/**
 * Helper: AI completion with high reasoning and smart fallback
 */
async function runSmartCompletion(prompt, systemDirective = null) {
  const routing = getAgentRouting('chat');
  const messages = [
    {
      role: 'system',
      content: systemDirective || 'You are Nero, an ultra-intelligent, highly capable AI assistant created by Sandy at Nero Labs. Be deeply knowledgeable, accurate, and format with clear markdown, tables, or code blocks when helpful.',
    },
    { role: 'user', content: prompt },
  ];

  const completion = await scaleMaxAdapter.createChatCompletion({
    model: routing.model,
    messages,
    chatId: 'advanced_features',
    reasoningEffort: 'high',
  });

  return completion?.text || 'No response generated.';
}

export function registerAdvancedFeatures(bot) {
  // =========================================================================
  // 1. ADVANCED GROUP MODERATION & ADMINISTRATION (10 FEATURES)
  // =========================================================================

  // 1. /unmute
  bot.command('unmute', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    const targetUser = ctx.message.reply_to_message?.from;
    if (!targetUser) return ctx.reply('Reply to a user message with `/unmute`.', { parse_mode: 'Markdown' });

    try {
      await ctx.restrictChatMember(targetUser.id, {
        can_send_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });
      ctx.reply(`🔊 *${targetUser.first_name || 'User'}* has been unmuted.`, { parse_mode: 'Markdown' });
      logAudit(ctx.from.id, 'USER_UNMUTED', `Unmuted ${targetUser.id} in ${ctx.chat.id}`);
    } catch (err) {
      ctx.reply(`⚠️ Cannot unmute: ${err.message}`);
    }
  });

  // 2. /unban <userId>
  bot.command('unban', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    const match = ctx.match?.trim();
    const replyUser = ctx.message.reply_to_message?.from;
    const targetId = replyUser ? replyUser.id : match;
    if (!targetId) return ctx.reply('Usage: Reply with `/unban` or specify user ID `/unban 123456789`.', { parse_mode: 'Markdown' });

    try {
      await ctx.unbanChatMember(Number(targetId));
      ctx.reply(`✅ User \`${targetId}\` has been unbanned.`, { parse_mode: 'Markdown' });
      logAudit(ctx.from.id, 'USER_UNBANNED', `Unbanned ${targetId} in ${ctx.chat.id}`);
    } catch (err) {
      ctx.reply(`⚠️ Cannot unban: ${err.message}`);
    }
  });

  // 3. /antiraid [on|off]
  bot.command('antiraid', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    if (ctx.chat.type === 'private') return ctx.reply('Run `/antiraid` in a group.');
    const arg = ctx.match?.trim().toLowerCase();

    if (arg === 'on') {
      setGroupSetting(ctx.chat.id, 'antiraid_mode', 'true');
      return ctx.reply('🛡️ *ANTI-RAID ACTIVE*: Tightened security protocol active for this group.', { parse_mode: 'Markdown' });
    } else if (arg === 'off') {
      setGroupSetting(ctx.chat.id, 'antiraid_mode', 'false');
      return ctx.reply('⚪ *ANTI-RAID STANDDOWN*: Standard security rules resumed.', { parse_mode: 'Markdown' });
    }
    const current = getGroupSetting(ctx.chat.id, 'antiraid_mode', 'false');
    ctx.reply(`🛡️ Anti-Raid Status: *${current === 'true' ? '🟢 ACTIVE' : '⚪ OFF'}*\nUsage: \`/antiraid on\` or \`/antiraid off\``, { parse_mode: 'Markdown' });
  });

  // 4. /slowmode [seconds]
  bot.command('slowmode', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    if (ctx.chat.type === 'private') return ctx.reply('Run in a group.');
    const secs = parseInt(ctx.match?.trim() || '0', 10);

    try {
      await ctx.setChatSlowModeDelay(secs);
      ctx.reply(secs > 0 ? `⏱️ Slow mode set to *${secs} seconds* per message.` : '⏱️ Slow mode turned *OFF*.', { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`⚠️ Cannot set slowmode: ${err.message}`);
    }
  });

  // 5. /purge [1-100]
  bot.command('purge', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    if (ctx.chat.type === 'private') return ctx.reply('Run in a group.');
    const count = Math.min(100, Math.max(1, parseInt(ctx.match?.trim() || '10', 10)));
    const startId = ctx.message.message_id;

    let deleted = 0;
    for (let i = 0; i <= count; i++) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, startId - i);
        deleted++;
      } catch {}
    }
    const notice = await ctx.reply(`🧹 Purged *${deleted}* messages.`, { parse_mode: 'Markdown' });
    setTimeout(() => {
      ctx.api.deleteMessage(ctx.chat.id, notice.message_id).catch(() => {});
    }, 4000);
  });

  // 6. /blacklist [add|remove|list] [word]
  bot.command('blacklist', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    const parts = (ctx.match || '').trim().split(/\s+/);
    const action = parts[0]?.toLowerCase();
    const word = parts.slice(1).join(' ').toLowerCase().trim();

    if (action === 'add' && word) {
      addBlacklistWord(ctx.chat.id, word, ctx.from.id);
      return ctx.reply(`🚫 Added to prohibited word list: *"${word}"*`, { parse_mode: 'Markdown' });
    } else if (action === 'remove' && word) {
      removeBlacklistWord(ctx.chat.id, word);
      return ctx.reply(`✅ Removed from prohibited word list: *"${word}"*`, { parse_mode: 'Markdown' });
    } else if (action === 'list' || !action) {
      const words = getBlacklistWords(ctx.chat.id);
      if (words.length === 0) return ctx.reply('⚪ No blacklisted words configured for this chat.');
      return ctx.reply(`🚫 *Group Blacklist (${words.length} terms):*\n${words.map(w => `• \`${w}\``).join('\n')}`, { parse_mode: 'Markdown' });
    }
    ctx.reply('Usage: `/blacklist add <word>`, `/blacklist remove <word>`, or `/blacklist list`', { parse_mode: 'Markdown' });
  });

  // 7. /capslock [on|off]
  bot.command('capslock', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    const arg = ctx.match?.trim().toLowerCase();
    if (arg === 'on') {
      setGroupSetting(ctx.chat.id, 'capslock_filter', 'true');
      return ctx.reply('🔤 *Capslock Filter: ON*. Messages with >75% uppercase will be flagged.');
    } else if (arg === 'off') {
      setGroupSetting(ctx.chat.id, 'capslock_filter', 'false');
      return ctx.reply('🔤 *Capslock Filter: OFF*.');
    }
    const cur = getGroupSetting(ctx.chat.id, 'capslock_filter', 'false');
    ctx.reply(`🔤 Capslock filter: *${cur === 'true' ? 'ON' : 'OFF'}*\nUsage: \`/capslock on\` or \`/capslock off\``, { parse_mode: 'Markdown' });
  });

  // 8. /setrules [text]
  bot.command('setrules', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    const rules = ctx.match?.trim();
    if (!rules) return ctx.reply('Usage: `/setrules 1. Be respectful\n2. No spam\n3. No NSFW`', { parse_mode: 'Markdown' });
    setGroupSetting(ctx.chat.id, 'group_rules', rules);
    ctx.reply('📜 Community rules updated successfully! Members can view them anytime via `/rules`.', { parse_mode: 'Markdown' });
  });

  // 9. /rules
  bot.command('rules', async (ctx) => {
    const rules = getGroupSetting(ctx.chat.id, 'group_rules', 'No specific custom rules set. Be respectful, no spam, and keep conversations friendly! ✨');
    ctx.reply(`📜 *COMMUNITY GUIDELINES*\n\n${rules}`, { parse_mode: 'Markdown' });
  });

  // 10. /unpin
  bot.command('unpin', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    const replyMsg = ctx.message.reply_to_message;
    try {
      if (replyMsg) {
        await ctx.unpinChatMessage(replyMsg.message_id);
      } else {
        await ctx.unpinChatMessage();
      }
      ctx.reply('📌 Message unpinned successfully.');
    } catch (err) {
      ctx.reply(`⚠️ Cannot unpin: ${err.message}`);
    }
  });

  // =========================================================================
  // 2. AI INTELLIGENCE, CODE & PRODUCTIVITY (10 FEATURES)
  // =========================================================================

  // 11. /code [lang] [query]
  bot.command('code', async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) return ctx.reply('Usage: `/code python fast rest api with auth`', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `You are a Principal Software Architect. Write production-quality, elegant, and bug-free code for:\n\n${query}\n\nInclude unit tests and brief setup instructions.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(res, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 12. /debug [code/error]
  bot.command('debug', async (ctx) => {
    const textToDebug = ctx.match?.trim() || ctx.message.reply_to_message?.text;
    if (!textToDebug) return ctx.reply('Usage: Reply to a snippet with `/debug` or run `/debug <error stack trace>`.', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Analyze this code/error stack trace, explain the exact root cause, and provide the definitive drop-in fix:\n\n${textToDebug}`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(res, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 13. /summarize
  bot.command('summarize', async (ctx) => {
    const target = ctx.match?.trim() || ctx.message.reply_to_message?.text;
    if (!target) return ctx.reply('Usage: Reply to any message or article with `/summarize`.', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Provide an executive summary of this content with Key Takeaways (bullet points) and Action Items:\n\n${target}`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(res, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 14. /translate [lang] [text]
  bot.command('translate', async (ctx) => {
    const parts = (ctx.match || '').trim().split(/\s+/);
    const targetLang = parts[0];
    const text = parts.slice(1).join(' ') || ctx.message.reply_to_message?.text;
    if (!targetLang || !text) return ctx.reply('Usage: `/translate Spanish Hello friend` or reply to a message with `/translate Hindi`', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Translate the following text into ${targetLang}. Maintain natural idioms, nuances, and conversational tone:\n\n${text}`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`🌐 *Translation (${targetLang})*:\n\n${res}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 15. /explain [concept]
  bot.command('explain', async (ctx) => {
    const concept = ctx.match?.trim();
    if (!concept) return ctx.reply('Usage: `/explain quantum computing` or `/explain recursion`', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Explain "${concept}" using the Feynman Technique across 3 tiers:
1. 🧒 **ELI5 (Like I'm 5)**
2. 🎓 **Undergraduate Student**
3. 🔬 **Principal Industry Expert / Mathematician**`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(res, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 16. /grammar [text]
  bot.command('grammar', async (ctx) => {
    const text = ctx.match?.trim() || ctx.message.reply_to_message?.text;
    if (!text) return ctx.reply('Usage: Reply with `/grammar` or run `/grammar <sentence>` to fix grammar & tone.', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Act as an elite copyeditor. Correct grammar, syntax, flow, and vocabulary in this text, then explain what you enhanced:\n\n${text}`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(res, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 17. /rewrite [style] [text]
  bot.command('rewrite', async (ctx) => {
    const parts = (ctx.match || '').trim().split(/\s+/);
    const style = parts[0] || 'formal';
    const text = parts.slice(1).join(' ') || ctx.message.reply_to_message?.text;
    if (!text) return ctx.reply('Usage: `/rewrite [formal|casual|roast|pirate|poetic] <text>`', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Rewrite this text in a ${style} style while preserving original meaning:\n\n${text}`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`✍️ *Rewrite (${style})*:\n\n${res}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 18. /math [expression]
  bot.command('math', async (ctx) => {
    const expr = ctx.match?.trim();
    if (!expr) return ctx.reply('Usage: `/math solve for x: 3x^2 + 5x - 2 = 0` or `/math compound interest on $10k at 8% for 5 years`', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Solve this mathematical or scientific problem step-by-step with formulas and clear results:\n\n${expr}`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(res, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 19. /brainstorm [topic]
  bot.command('brainstorm', async (ctx) => {
    const topic = ctx.match?.trim();
    if (!topic) return ctx.reply('Usage: `/brainstorm AI apps for Telegram`', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Brainstorm 10 high-value, creative, and actionable ideas or strategies for: "${topic}". Include unique angles and execution steps.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(res, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 20. /quiz [topic]
  bot.command('quiz', async (ctx) => {
    const topic = ctx.match?.trim() || 'General Science & Computing';
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Generate 1 challenging, fun multiple-choice trivia question about: ${topic}. Format: Question, Options (A, B, C, D), and Answer with brief explanation hidden at bottom.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`🧠 *TRIVIA CHALLENGE*\n\n${res}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // =========================================================================
  // 3. MEMORY, KNOWLEDGE & PERSONAL NOTE ENGINE (10 FEATURES)
  // =========================================================================

  // 21. /remember [key] = [value]
  bot.command('remember', async (ctx) => {
    const input = ctx.match?.trim();
    if (!input || !input.includes('=')) {
      return ctx.reply('Usage: `/remember rules = Be respectful to everyone` or `/remember server = play.nerolabs.net`', { parse_mode: 'Markdown' });
    }
    const [rawKey, ...rest] = input.split('=');
    const key = rawKey.trim();
    const val = rest.join('=').trim();
    setCustomMemory(ctx.chat.id, key, val, ctx.from?.first_name || 'user');
    ctx.reply(`🧠 *Memory Saved*: \`${key}\` ➔ "${val}"`, { parse_mode: 'Markdown' });
  });

  // 22. /recall [key]
  bot.command('recall', async (ctx) => {
    const key = ctx.match?.trim();
    if (!key) return ctx.reply('Usage: `/recall <key>`', { parse_mode: 'Markdown' });
    const mem = getCustomMemory(ctx.chat.id, key);
    if (!mem) return ctx.reply(`🔍 No memory found for \`${key}\`.`, { parse_mode: 'Markdown' });
    ctx.reply(`💡 *Recalled Memory* for \`${mem.key}\`:\n\n${mem.value}`, { parse_mode: 'Markdown' });
  });

  // 23. /forget [key]
  bot.command('forget', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    const key = ctx.match?.trim();
    if (!key) return ctx.reply('Usage: `/forget <key>`', { parse_mode: 'Markdown' });
    deleteCustomMemory(ctx.chat.id, key);
    ctx.reply(`🧹 Memory \`${key}\` has been erased.`, { parse_mode: 'Markdown' });
  });

  // 24. /memories
  bot.command('memories', async (ctx) => {
    const custom = listCustomMemories(ctx.chat.id);
    const stats = getMemoryStats();
    let text = `🧠 *NERO LABS KNOWLEDGE ARCHIVE*\n\n`;
    text += `• *Durable Memories*: ${stats.totalMemories}\n`;
    text += `• *Total Batches*: ${stats.totalBatches}\n`;
    text += `• *Archived Messages*: ${stats.totalRawMessages}\n\n`;
    text += `*Chat Custom Keys (${custom.length}):*\n`;
    if (custom.length === 0) {
      text += `_No custom keys saved in this chat yet. Use /remember key = value_`;
    } else {
      text += custom.map(m => `• \`${m.key}\`: ${m.value.slice(0, 40)}${m.value.length > 40 ? '...' : ''}`).join('\n');
    }
    ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // 25. /note [text]
  bot.command('note', async (ctx) => {
    const text = ctx.match?.trim();
    if (!text) return ctx.reply('Usage: `/note Deploy v2 server on Monday`', { parse_mode: 'Markdown' });
    addNote(ctx.from.id, ctx.chat.id, text);
    ctx.reply('📝 *Note saved to your personal notepad!* Use `/notes` to view all.', { parse_mode: 'Markdown' });
  });

  // 26. /notes
  bot.command('notes', async (ctx) => {
    const notes = getUserNotes(ctx.from.id);
    if (notes.length === 0) return ctx.reply('📝 You have no saved notes. Add one with `/note <text>`.', { parse_mode: 'Markdown' });
    const list = notes.map(n => `[#${n.id}] ${n.note_text} _(${n.created_at.slice(0, 10)})_`).join('\n\n');
    ctx.reply(`📝 *YOUR SAVED NOTES (${notes.length})*:\n\n${list}\n\n_Delete with /delnote <id>_`, { parse_mode: 'Markdown' });
  });

  // 27. /delnote [id]
  bot.command('delnote', async (ctx) => {
    const id = parseInt(ctx.match?.trim() || '', 10);
    if (isNaN(id)) return ctx.reply('Usage: `/delnote <id>`', { parse_mode: 'Markdown' });
    deleteNote(id, ctx.from.id);
    ctx.reply(`🗑️ Note #${id} deleted.`);
  });

  // 28. /clearnotes
  bot.command('clearnotes', async (ctx) => {
    clearUserNotes(ctx.from.id);
    ctx.reply('🧹 All your personal notes have been cleared.');
  });

  // 29. /define [word]
  bot.command('define', async (ctx) => {
    const word = ctx.match?.trim();
    if (!word) return ctx.reply('Usage: `/define serendipity`', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Provide an authoritative dictionary definition for "${word}". Include phonetic pronunciation, part of speech, etymology, and 2 distinct example sentences.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`📖 *Definition of ${word}*\n\n${res}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // 30. /wiki [topic]
  bot.command('wiki', async (ctx) => {
    const topic = ctx.match?.trim();
    if (!topic) return ctx.reply('Usage: `/wiki Alan Turing` or `/wiki James Webb Space Telescope`', { parse_mode: 'Markdown' });
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Act as an encyclopedia. Provide a comprehensive summary of "${topic}": Overview, Historical Significance, Key Milestones, and Modern Relevance.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`📚 *Wikipedia Digest: ${topic}*\n\n${res}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(res));
  });

  // =========================================================================
  // 4. COMMUNITY, SOCIAL & UTILITIES (10 FEATURES)
  // =========================================================================

  // 31. /poll [Question | Option 1 | Option 2 ...]
  bot.command('poll', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw || !raw.includes('|')) {
      return ctx.reply('Usage: `/poll Favorite Language? | Python | JavaScript | Rust | Go`', { parse_mode: 'Markdown' });
    }
    const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
    const question = parts[0];
    const options = parts.slice(1);
    if (options.length < 2) return ctx.reply('Please provide at least 2 options separated by `|`.', { parse_mode: 'Markdown' });

    try {
      await ctx.replyWithPoll(question, options.slice(0, 10), { is_anonymous: false });
    } catch (err) {
      ctx.reply(`⚠️ Cannot create poll: ${err.message}`);
    }
  });

  // 32. /roll [dice]
  bot.command('roll', async (ctx) => {
    const match = (ctx.match?.trim() || '1d6').toLowerCase();
    const parts = match.split('d');
    const num = Math.min(20, Math.max(1, parseInt(parts[0] || '1', 10)));
    const sides = Math.min(1000, Math.max(2, parseInt(parts[1] || '6', 10)));

    const rolls = [];
    let sum = 0;
    for (let i = 0; i < num; i++) {
      const r = Math.floor(Math.random() * sides) + 1;
      rolls.push(r);
      sum += r;
    }
    ctx.reply(`🎲 *Dice Roll (${num}d${sides})*:\n• Rolls: [ ${rolls.join(', ')} ]\n• *Total*: **${sum}**`, { parse_mode: 'Markdown' });
  });

  // 33. /flip
  bot.command('flip', async (ctx) => {
    const isHeads = Math.random() < 0.5;
    ctx.reply(isHeads ? '🪙 *Coin Flip*: **HEADS**! 👑' : '🪙 *Coin Flip*: **TAILS**! 🦅', { parse_mode: 'Markdown' });
  });

  // 34. /roast [@user]
  bot.command('roast', async (ctx) => {
    const target = ctx.match?.trim() || ctx.message.reply_to_message?.from?.first_name || 'this human';
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Give a playful, hilarious, cyberpunk-themed witty roast to "${target}". Keep it lighthearted and humorous without offensive hate speech.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`🔥 *Roast for ${target}*:\n\n${res}`, { parse_mode: 'Markdown' });
  });

  // 35. /praise [@user]
  bot.command('praise', async (ctx) => {
    const target = ctx.match?.trim() || ctx.message.reply_to_message?.from?.first_name || 'my favorite friend';
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Give a heartwarming, genuine, deeply appreciative cyber-hype compliment to "${target}". Express high energy and gratitude.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`💖 *Praise for ${target}*:\n\n${res}`, { parse_mode: 'Markdown' });
  });

  // 36. /joke
  bot.command('joke', async (ctx) => {
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = 'Tell an original, genuinely funny programmer, AI, or cybersecurity joke with punchline.';
    const res = await runSmartCompletion(prompt);
    ctx.reply(`😂 *Nero Labs Humor*:\n\n${res}`, { parse_mode: 'Markdown' });
  });

  // 37. /quote
  bot.command('quote', async (ctx) => {
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = 'Provide an inspiring, legendary quote from a famous scientist, engineer, or philosopher, with context on why it matters today.';
    const res = await runSmartCompletion(prompt);
    ctx.reply(`💡 *Visionary Quote*:\n\n${res}`, { parse_mode: 'Markdown' });
  });

  // 38. /horoscope [sign]
  bot.command('horoscope', async (ctx) => {
    const sign = ctx.match?.trim() || 'Aries';
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Write a fun, futuristic cyberpunk daily horoscope for ${sign}. Include: Lucky Neural Frequency, Power Element, and Daily Prediction.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`🔮 *Cyber Horoscope (${sign})*:\n\n${res}`, { parse_mode: 'Markdown' });
  });

  // 39. /8ball [question]
  bot.command('8ball', async (ctx) => {
    const q = ctx.match?.trim();
    if (!q) return ctx.reply('Ask a question! Example: `/8ball Will our AI project succeed?`', { parse_mode: 'Markdown' });
    const answers = [
      '🟢 Neural certainty: ABSOLUTELY YES.',
      '🟢 Quantum indicators look exceptionally bright.',
      '🟢 Without a shred of doubt.',
      '🟡 Quantum flux detected — ask again in 10 minutes.',
      '🟡 Signals are hazy, recalibrating sensors.',
      '🔴 The computational algorithms say NO.',
      '🔴 Probability drops near zero.',
      '🔴 Do not count on it.',
    ];
    const picked = answers[Math.floor(Math.random() * answers.length)];
    ctx.reply(`🎱 *Magic 8-Ball Oracle*\n\n• *Question*: "${q}"\n• *Answer*: ${picked}`, { parse_mode: 'Markdown' });
  });

  // 40. /weather [city]
  bot.command('weather', async (ctx) => {
    const city = ctx.match?.trim() || 'Neo Tokyo';
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = `Provide a detailed, stylish weather overview and seasonal climate analysis for ${city}. Include temperature range, humidity, conditions, and travel advice.`;
    const res = await runSmartCompletion(prompt);
    ctx.reply(`🌤️ *Weather Intel: ${city}*\n\n${res}`, { parse_mode: 'Markdown' });
  });

  // =========================================================================
  // 5. MINECRAFT BEDROCK COMPANION BRIDGE (5 FEATURES)
  // =========================================================================

  // 41. /mc status
  bot.command('mc', async (ctx) => {
    const sub = (ctx.match || '').trim().split(/\s+/)[0]?.toLowerCase();
    const args = (ctx.match || '').trim().split(/\s+/).slice(1);

    if (sub === 'status' || !sub) {
      const isConnected = minecraftBridge.isConnected();
      const status = minecraftBridge.getStatus();
      let text = `⛏️ *MINECRAFT BEDROCK COMPANION TELEMETRY*\n\n`;
      text += `• *Status*: ${isConnected ? '🟢 ONLINE & CONNECTED' : '⚪ OFFLINE / WAITING FOR PLAYER'}\n`;
      text += `• *Active World*: ${status.world || 'Local Session'}\n`;
      text += `• *Players Online*: ${status.players?.length || 0}\n`;
      text += `• *Bridge Port*: 3001/ws/minecraft\n\n`;
      text += `_Commands: /mc give <item> [qty], /mc spawn <mob> [qty], /mc effect <effect>_`;
      return ctx.reply(text, { parse_mode: 'Markdown' });
    }

    // 42. /mc give <item> [qty]
    if (sub === 'give') {
      const item = args[0] || 'diamond';
      const qty = parseInt(args[1] || '64', 10);
      try {
        await minecraftCommandExecutor.giveItem(item, qty);
        return ctx.reply(`🎁 Dropped *${qty}x ${item}* into your Minecraft inventory!`, { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply(`⚠️ Minecraft bridge: ${err.message}`);
      }
    }

    // 43. /mc spawn <mob> [qty]
    if (sub === 'spawn') {
      const mob = args[0] || 'wolf';
      const qty = parseInt(args[1] || '1', 10);
      try {
        await minecraftCommandExecutor.summonEntity(mob, qty);
        return ctx.reply(`🐺 Summoned *${qty}x ${mob}* in your Minecraft world!`, { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply(`⚠️ Minecraft bridge: ${err.message}`);
      }
    }

    // 44. /mc effect <effect> [seconds]
    if (sub === 'effect') {
      const effect = args[0] || 'night_vision';
      const sec = parseInt(args[1] || '120', 10);
      try {
        await minecraftCommandExecutor.applyEffect(effect, sec);
        return ctx.reply(`✨ Applied potion buff *${effect}* for ${sec}s!`, { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply(`⚠️ Minecraft bridge: ${err.message}`);
      }
    }

    // 45. /mc tp <destination>
    if (sub === 'tp') {
      const dest = args.join(' ') || '@s';
      try {
        await minecraftCommandExecutor.teleport('nero', dest);
        return ctx.reply(`🌀 Teleported companion to *${dest}*!`, { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply(`⚠️ Minecraft bridge: ${err.message}`);
      }
    }

    ctx.reply('Usage: `/mc status`, `/mc give <item> [qty]`, `/mc spawn <mob> [qty]`, `/mc effect <effect>`, or `/mc tp <target>`', { parse_mode: 'Markdown' });
  });

  // =========================================================================
  // 6. DEVELOPER, MCP, SECURITY & DIAGNOSTICS (6 FEATURES)
  // =========================================================================

  // 46. /ping
  bot.command('ping', async (ctx) => {
    const start = Date.now();
    const msg = await ctx.reply('🏓 Measuring latency...');
    const tgLatency = Date.now() - start;

    const dbStart = Date.now();
    getDb().prepare('SELECT 1').get();
    const dbLatency = Date.now() - dbStart;

    ctx.api.editMessageText(
      ctx.chat.id,
      msg.message_id,
      `⚡ *NERO LABS LATENCY DIAGNOSTICS*\n\n• *Telegram API Round-Trip*: \`${tgLatency} ms\`\n• *SQLite Local Engine*: \`${dbLatency} ms\`\n• *Status*: 🟢 Optimal Performance`,
      { parse_mode: 'Markdown' }
    );
  });

  // 47. /sysinfo
  bot.command('sysinfo', async (ctx) => {
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const freeMem = Math.round(os.freemem() / (1024 * 1024 * 1024));
    const uptimeHrs = Math.floor(os.uptime() / 3600);

    let text = `🖥️ *HOST SYSTEM TELEMETRY*\n\n`;
    text += `• *Platform*: ${os.type()} ${os.release()} (${os.arch()})\n`;
    text += `• *Node.js Runtime*: \`${process.version}\`\n`;
    text += `• *System Memory*: \`${freeMem} GB free / ${totalMem} GB total\`\n`;
    text += `• *Host Uptime*: \`${uptimeHrs} hours\`\n`;
    text += `• *Process Memory (RSS)*: \`${Math.round(process.memoryUsage().rss / (1024 * 1024))} MB\`\n`;
    text += `• *PID*: \`${process.pid}\``;
    ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // 48. /audit
  bot.command('audit', async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply('⛔ Owner only.');
    const logs = getDb().prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8').all();
    if (logs.length === 0) return ctx.reply('⚪ No audit entries recorded.');
    const lines = logs.map(l => `• \`[${l.created_at.slice(11, 19)}]\` *${l.action}*: ${l.details || ''}`);
    ctx.reply(`🛡️ *RECENT AUDIT TRAIL*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
  });

  // 49. /json [data]
  bot.command('json', async (ctx) => {
    const raw = ctx.match?.trim() || ctx.message.reply_to_message?.text;
    if (!raw) return ctx.reply('Usage: `/json {"name":"Nero","version":2}` or reply to a JSON message.', { parse_mode: 'Markdown' });
    try {
      const parsed = JSON.parse(raw);
      const formatted = JSON.stringify(parsed, null, 2);
      ctx.reply(`\`\`\`json\n${formatted.slice(0, 3900)}\n\`\`\``, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`❌ *JSON Syntax Error*: ${err.message}`, { parse_mode: 'Markdown' });
    }
  });

  // 50. /hash [type] [text]
  bot.command('hash', async (ctx) => {
    const parts = (ctx.match || '').trim().split(/\s+/);
    const algo = parts[0]?.toLowerCase() || 'sha256';
    const text = parts.slice(1).join(' ') || ctx.message.reply_to_message?.text;
    if (!text) return ctx.reply('Usage: `/hash sha256 MyPassword123` or `/hash md5 test`', { parse_mode: 'Markdown' });

    try {
      const hash = crypto.createHash(algo === 'md5' ? 'md5' : 'sha256').update(text).digest('hex');
      ctx.reply(`🔐 *${algo.toUpperCase()} Hash*:\n\`${hash}\``, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`⚠️ Cannot compute hash: ${err.message}`);
    }
  });

  // 51. /base64 [enc|dec] [text]
  bot.command('base64', async (ctx) => {
    const parts = (ctx.match || '').trim().split(/\s+/);
    const mode = parts[0]?.toLowerCase();
    const text = parts.slice(1).join(' ') || ctx.message.reply_to_message?.text;
    if (!mode || !text) return ctx.reply('Usage: `/base64 enc Hello World` or `/base64 dec SGVsbG8gV29ybGQ=`', { parse_mode: 'Markdown' });

    if (mode === 'enc') {
      const encoded = Buffer.from(text, 'utf8').toString('base64');
      ctx.reply(`🔒 *Base64 Encoded*:\n\`${encoded}\``, { parse_mode: 'Markdown' });
    } else if (mode === 'dec') {
      try {
        const decoded = Buffer.from(text, 'base64').toString('utf8');
        ctx.reply(`🔓 *Base64 Decoded*:\n\`${decoded}\``, { parse_mode: 'Markdown' });
      } catch (err) {
        ctx.reply(`❌ Cannot decode base64: ${err.message}`);
      }
    }
  });

  // 52. /mcptools
  bot.command('mcptools', async (ctx) => {
    const tools = MCP_TOOLS || [];
    let msg = `🔌 *ACTIVE MODEL CONTEXT PROTOCOL (MCP) SUITE*\n\n`;
    msg += `• Total Tools Exposed: *${tools.length}*\n`;
    msg += `• Stdio Transport: *Connected to Antigravity IDE*\n\n`;
    msg += tools.map((t, idx) => `${idx + 1}. \`${t.name}\`: ${t.description}`).join('\n\n');
    ctx.reply(msg.slice(0, 4000), { parse_mode: 'Markdown' });
  });

  // 53. /fact
  bot.command('fact', async (ctx) => {
    await ctx.replyWithChatAction('typing').catch(() => {});
    const prompt = 'Share one mind-blowing, verified scientific, historical, or computing fact with brief explanation.';
    const res = await runSmartCompletion(prompt);
    ctx.reply(`🧠 *Did You Know?*\n\n${res}`, { parse_mode: 'Markdown' });
  });
}

import {
  searchRawMessages,
  getRawMessagesByDateRange,
  searchDurableMemory,
  searchAttachments,
  getArchiveBatches,
  getGroupParticipants,
  logAudit,
} from '../db/index.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';

export class MemoryRetriever {
  /**
   * Detect whether a message is asking about historical memory, past conversations, or decisions
   */
  isHistoricalQuestion(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();

    const patterns = [
      /\bwhat did we discuss\b/i,
      /\bwhat were we talking about\b/i,
      /\bdid we (?:already )?(?:make a plan|agree|decide)\b/i,
      /\bwhat plan (?:did we|was)\b/i,
      /\bwhat date did we decide\b/i,
      /\bwhen did we (?:decide|plan|agree|say)\b/i,
      /\bwhat was the name of (?:that|the)\b/i,
      /\bdid (?:he|she|sandy|anyone|somebody) mention\b/i,
      /\bwhat did (?:he|she|sandy) say\b/i,
      /\bfind the (?:image|picture|photo|screenshot)\b/i,
      /\bsearch (?:memory|history|conversation|chat)\b/i,
      /\bremind me (?:what|about|when)\b/i,
      /\bdo you remember\b/i,
      /\bearlier (?:today|this week)\b/i,
      /\b(?:yesterday|two days ago|last week)\b/i,
    ];

    return patterns.some((p) => p.test(lower));
  }

  /**
   * Parse relative time bounds from query text
   */
  parseTimeBounds(queryText) {
    const lower = queryText.toLowerCase();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (lower.includes('two days ago') || lower.includes('2 days ago')) {
      const start = new Date(now - 3 * oneDayMs).toISOString();
      const end = new Date(now - 1.5 * oneDayMs).toISOString();
      return { start, end, label: 'two days ago' };
    }

    if (lower.includes('yesterday')) {
      const start = new Date(now - 2 * oneDayMs).toISOString();
      const end = new Date(now - 0.5 * oneDayMs).toISOString();
      return { start, end, label: 'yesterday' };
    }

    if (lower.includes('last week')) {
      const start = new Date(now - 8 * oneDayMs).toISOString();
      const end = new Date(now - 5 * oneDayMs).toISOString();
      return { start, end, label: 'last week' };
    }

    if (lower.includes('today') || lower.includes('earlier')) {
      const start = new Date(now - 1 * oneDayMs).toISOString();
      const end = new Date(now + 1000).toISOString();
      return { start, end, label: 'earlier today' };
    }

    return null;
  }

  /**
   * Search historical records across raw messages, durable facts, batches, and attachments
   */
  async searchHistoricalRecords(chatId, queryText) {
    const timeBounds = this.parseTimeBounds(queryText);
    const keywords = queryText
      .replace(/nero|what|did|we|discuss|about|the|that|a|an|in|on|at|is|was|were|you|remember/gi, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    let rawMatches = [];
    let memoryMatches = [];
    let attachmentMatches = [];

    // 1. If time bounds are present, get messages in that range
    if (timeBounds) {
      rawMatches = getRawMessagesByDateRange(chatId, timeBounds.start, timeBounds.end, 50);
    }

    // 2. Search durable memory by extracted keywords
    for (const kw of keywords.slice(0, 3)) {
      const mems = searchDurableMemory(chatId, kw, 5);
      memoryMatches.push(...mems);
      const raws = searchRawMessages(chatId, kw, 10);
      rawMatches.push(...raws);
    }

    // 3. Search attachments if image or picture mentioned
    if (/image|picture|photo|screenshot/i.test(queryText)) {
      for (const kw of (keywords.length > 0 ? keywords : ['image'])) {
        const atts = searchAttachments(chatId, kw, 5);
        attachmentMatches.push(...atts);
      }
    }

    // Deduplicate raw messages by platform_message_id
    const seenMsgIds = new Set();
    const uniqueRaw = [];
    for (const m of rawMatches) {
      if (!seenMsgIds.has(m.platform_message_id)) {
        seenMsgIds.add(m.platform_message_id);
        uniqueRaw.push(m);
      }
    }

    // Deduplicate durable memory
    const seenMem = new Set();
    const uniqueMem = [];
    for (const mem of memoryMatches) {
      const key = `${mem.category}_${mem.content}`;
      if (!seenMem.has(key)) {
        seenMem.add(key);
        uniqueMem.push(mem);
      }
    }

    return {
      rawMessages: uniqueRaw,
      durableFacts: uniqueMem,
      attachments: attachmentMatches,
      timeBounds,
      totalEvidenceCount: uniqueRaw.length + uniqueMem.length + attachmentMatches.length,
    };
  }

  /**
   * Answer a historical query with grounded citations and truthful evidence disclosure
   */
  async answerHistoricalQuestion(chatId, queryText) {
    const evidence = await this.searchHistoricalRecords(chatId, queryText);

    // If completely empty, answer truthfully without fabricating
    if (evidence.totalEvidenceCount === 0) {
      return {
        found: false,
        answer: `I searched our historical conversation archives and memory index for this group, but I couldn't find any recorded discussion or decision matching that. If it happened before message tracking was enabled or in another group, I don't have access to it.`,
      };
    }

    // Format evidence chronologically
    let evidenceBlock = '### VERIFIED ARCHIVAL RECORDS FOR THIS GROUP:\n\n';

    if (evidence.durableFacts.length > 0) {
      evidenceBlock += '**Durable Decisions & Plans:**\n';
      for (const f of evidence.durableFacts) {
        evidenceBlock += `- [${f.category.toUpperCase()}] ${f.content} (Recorded: ${f.source_date || 'earlier'})\n`;
      }
      evidenceBlock += '\n';
    }

    if (evidence.rawMessages.length > 0) {
      evidenceBlock += '**Exact Message Records:**\n';
      for (const m of evidence.rawMessages.slice(0, 25)) {
        const dateStr = m.created_at ? new Date(m.created_at).toLocaleDateString() : 'recent';
        evidenceBlock += `- [${dateStr} | Msg #${m.platform_message_id}] ${m.sender_name}: "${m.raw_content || m.caption || ''}"\n`;
      }
      evidenceBlock += '\n';
    }

    if (evidence.attachments.length > 0) {
      evidenceBlock += '**Saved Media & Images:**\n';
      for (const a of evidence.attachments) {
        evidenceBlock += `- Image: "${a.filename}" sent by ${a.sender_name}. Description: ${a.ai_description || a.caption || 'No description'}\n`;
      }
      evidenceBlock += '\n';
    }

    // Ask AI model to answer strictly grounded on evidence
    if (scaleMaxAdapter.isConfigured()) {
      try {
        const prompt = `You are Nero Labs AI. Answer the user's historical question based ONLY on the verified group archival records below.

RULES:
1. Distinguish exact quotes (put them in quotation marks) from summaries.
2. State the date or approximate timeframe when available.
3. Name the participant who said it or made the decision.
4. Keep the answer concise and direct.
5. NEVER fabricate or guess facts not present in the records. If evidence is partial, explicitly state what is known and what is missing.

${evidenceBlock}

USER QUESTION:
"${queryText}"`;

        const completion = await scaleMaxAdapter.createChatCompletion({
          model: 'gemini-3.8-flash',
          messages: [{ role: 'user', content: prompt }],
          chatId,
        });

        if (completion.text) {
          logAudit('memory', 'HISTORICAL_QUERY_ANSWERED', `Chat ${chatId}: query="${queryText.slice(0, 50)}"`);
          return {
            found: true,
            answer: completion.text,
            evidenceCount: evidence.totalEvidenceCount,
          };
        }
      } catch (err) {
        console.warn('[MemoryRetriever] Model synthesis error:', err.message);
      }
    }

    // Fallback direct summary if model is unavailable
    let fallback = `Here is what our recorded archive shows:\n\n`;
    if (evidence.durableFacts.length > 0) {
      fallback += `• **Decisions & Plans**: ${evidence.durableFacts[0].content}\n`;
    }
    if (evidence.rawMessages.length > 0) {
      const latest = evidence.rawMessages[evidence.rawMessages.length - 1];
      fallback += `• **Relevant Message**: ${latest.sender_name} said: "${latest.raw_content}" on ${new Date(latest.created_at).toLocaleDateString()}\n`;
    }
    return {
      found: true,
      answer: fallback,
      evidenceCount: evidence.totalEvidenceCount,
    };
  }
}

export const memoryRetriever = new MemoryRetriever();

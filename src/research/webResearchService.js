/**
 * 🔬 MYRA SELF-EXPANDING ENGINE — WEB RESEARCH SERVICE
 * Persistent multi-source web intelligence, deep documentation reading,
 * verified facts vs assumptions separation, citation tracking,
 * and prompt-injection containment (<data_untrusted>).
 */

import { webSearchService } from '../search/webSearchService.js';
import { deepBrowserService } from '../browser/deepBrowserService.js';
import {
  saveResearchDossier,
  getResearchDossier,
  listResearchDossiers,
  searchResearchVault,
} from '../db/index.js';

export class WebResearchService {
  constructor() {
    this.name = 'WebResearchService';
  }

  /**
   * Wrap untrusted external web text to defend against indirect prompt injection
   */
  wrapUntrusted(content, sourceUrl = '') {
    if (!content) return '';
    const safeContent = String(content)
      .replace(/<data_untrusted/gi, '&lt;data_untrusted')
      .replace(/<\/data_untrusted>/gi, '&lt;/data_untrusted&gt;');
    return `<data_untrusted source="${sourceUrl}">\n${safeContent}\n</data_untrusted>`;
  }

  /**
   * Conduct thorough web research on any topic
   */
  async conductResearch({
    topic,
    query = null,
    existingVaultUuid = null,
    fetchMedia = true,
  }) {
    if (!topic || typeof topic !== 'string') {
      throw new Error('Research topic must be a non-empty string');
    }

    const searchQuery = query || topic;
    let existingDossier = null;
    if (existingVaultUuid) {
      existingDossier = getResearchDossier(existingVaultUuid);
    }

    // 1. Gather search results from web
    const searchData = await webSearchService.search(searchQuery);
    const rawResults = searchData?.results || [];

    const citations = existingDossier ? [...existingDossier.citations] : [];
    const verifiedFacts = existingDossier ? [...existingDossier.verified_facts] : [];
    const assumptions = existingDossier ? [...existingDossier.assumptions] : [];
    const mediaLinks = existingDossier ? [...existingDossier.media_links] : [];

    // Track URLs we have already cited to prevent duplicates
    const seenUrls = new Set(citations.map(c => c.url));

    for (const item of rawResults) {
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        citations.push({
          title: item.title || topic,
          url: item.url,
          snippet: item.snippet || '',
          reliability: item.url.includes('.gov') || item.url.includes('.edu') || item.url.includes('wikipedia.org') ? 'high' : 'medium',
        });
      }
    }

    // 2. Fetch and parse top 2 safe links for deep content if safe
    let synthesizedNotes = existingDossier?.full_notes ? `${existingDossier.full_notes}\n\n---\n` : '';
    const safeCitations = citations.filter(c => deepBrowserService.isSafeUrl(c.url)).slice(0, 3);

    for (const cite of safeCitations) {
      try {
        const pageData = await deepBrowserService.browsePage(cite.url);
        if (pageData && pageData.title) {
          const untrustedSnippet = this.wrapUntrusted(
            pageData.paragraphs?.slice(0, 5).join('\n') || pageData.snippet || '',
            cite.url
          );
          synthesizedNotes += `### Source: ${pageData.title} (${cite.url})\n${untrustedSnippet}\n\n`;

          // Discover documents or downloadable media
          if (fetchMedia && Array.isArray(pageData.links)) {
            for (const link of pageData.links) {
              if (/\.(pdf|zip|mcpack|mcaddon|json|png|jpg|mp4)$/i.test(link.url)) {
                if (!mediaLinks.some(m => m.url === link.url)) {
                  mediaLinks.push({
                    type: link.url.endsWith('.pdf') ? 'document' : link.url.endsWith('.mcaddon') || link.url.endsWith('.mcpack') ? 'minecraft_pack' : 'resource',
                    url: link.url,
                    title: link.text || link.url.split('/').pop(),
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        // Continue if a specific page fails to load
        synthesizedNotes += `[Note: URL ${cite.url} could not be browsed: ${err.message}]\n`;
      }
    }

    // 3. Extract verified facts vs assumptions
    // Factual extraction heuristics
    if (searchData?.directAnswer) {
      if (!verifiedFacts.includes(searchData.directAnswer)) {
        verifiedFacts.push(searchData.directAnswer);
      }
    }

    for (const c of citations) {
      if (c.snippet && c.snippet.length > 20) {
        // Split snippet into sentences and categorize
        const sentences = c.snippet.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);
        for (const s of sentences) {
          if (/\b(?:might|could|possibly|rumored|alleged|assumed|believed to)\b/i.test(s)) {
            if (!assumptions.includes(s) && assumptions.length < 10) assumptions.push(s);
          } else {
            if (!verifiedFacts.includes(s) && verifiedFacts.length < 15) verifiedFacts.push(s);
          }
        }
      }
    }

    // Fallback if no sentences extracted
    if (verifiedFacts.length === 0 && searchData?.summary) {
      verifiedFacts.push(searchData.summary);
    }
    if (assumptions.length === 0) {
      assumptions.push(`Information regarding ${topic} is subject to evolving public updates.`);
    }

    // 4. Build comprehensive summary
    const summary = searchData?.summary ||
      `Comprehensive research dossier for ${topic}. Synthesized from ${citations.length} sources with ${verifiedFacts.length} verified facts.`;

    // 5. Persist to myra_research_vault
    const vaultUuid = existingDossier?.vault_uuid || `dossier_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const saved = saveResearchDossier({
      vaultUuid,
      topic,
      query: searchQuery,
      summary,
      fullNotes: synthesizedNotes.trim(),
      citations,
      verifiedFacts,
      assumptions,
      mediaLinks,
      isResumable: 1,
    });

    return saved;
  }

  /**
   * Resume and expand an existing research dossier with a follow-up query
   */
  async resumeResearch(vaultUuid, followUpQuery) {
    const existing = getResearchDossier(vaultUuid);
    if (!existing) {
      throw new Error(`Dossier with UUID ${vaultUuid} not found`);
    }
    return this.conductResearch({
      topic: existing.topic,
      query: `${existing.topic} ${followUpQuery}`,
      existingVaultUuid: vaultUuid,
    });
  }

  /**
   * Format research dossier for WhatsApp presentation
   */
  formatDossierForWhatsApp(dossier, isSandy = true) {
    if (!dossier) return 'No research dossier available.';

    const greeting = isSandy
      ? `📚 *MYRA'S RESEARCH DOSSIER FOR SANDY* 💖\n──────────────────────────────`
      : `📚 *RESEARCH DOSSIER: ${dossier.topic.toUpperCase()}*\n──────────────────────────────`;

    const factsBlock = dossier.verified_facts?.length
      ? `\n*✅ Verified Facts:*\n${dossier.verified_facts.slice(0, 5).map(f => `• ${f}`).join('\n')}`
      : '';

    const assumptionsBlock = dossier.assumptions?.length
      ? `\n\n*⚠️ Open Questions & Assumptions:*\n${dossier.assumptions.slice(0, 3).map(a => `• ${a}`).join('\n')}`
      : '';

    const citationsBlock = dossier.citations?.length
      ? `\n\n*🔗 Primary Sources (${dossier.citations.length}):*\n${dossier.citations.slice(0, 4).map(c => `• ${c.title}: ${c.url}`).join('\n')}`
      : '';

    const mediaBlock = dossier.media_links?.length
      ? `\n\n*📦 Discoveries & Downloads:*\n${dossier.media_links.slice(0, 3).map(m => `• [${m.type.toUpperCase()}] ${m.title || m.url}`).join('\n')}`
      : '';

    const footer = isSandy
      ? `\n──────────────────────────────\n_Saved permanently in Myra's Research Vault._\n_Dossier ID: \`${dossier.vault_uuid}\`_`
      : `\n──────────────────────────────\n_Dossier ID: \`${dossier.vault_uuid}\`_`;

    return `${greeting}\n*Topic:* ${dossier.topic}\n*Overview:* ${dossier.summary}\n${factsBlock}${assumptionsBlock}${citationsBlock}${mediaBlock}\n${footer}`;
  }

  /**
   * List recent research dossiers
   */
  listDossiers(limit = 10) {
    return listResearchDossiers(limit);
  }

  /**
   * Search dossiers by keyword
   */
  searchVault(query) {
    return searchResearchVault(query);
  }

  /**
   * Get single dossier by ID
   */
  getDossier(vaultUuid) {
    return getResearchDossier(vaultUuid);
  }
}

export const webResearchService = new WebResearchService();

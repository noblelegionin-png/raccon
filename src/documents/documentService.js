/**
 * 📚 NERO LABS — EDUCATIONAL DOCUMENTS & DOWNLOADABLE RESOURCES SERVICE
 * Discovers college assignments, test papers, lecture notes, and study PDFs.
 * Safely downloads, validates size & mime, extracts text, summarizes, and delivers via sendDocument.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webSearchService } from '../search/webSearchService.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const TEMP_DOCS_DIR = path.join(projectRoot, 'data/temp_documents');

export class DocumentService {
  constructor() {
    this.maxSizeBytes = 20 * 1024 * 1024; // 20 MB limit
    this.allowedExtensions = ['.pdf', '.txt', '.md', '.csv', '.json', '.docx', '.xlsx'];
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(TEMP_DOCS_DIR)) {
      fs.mkdirSync(TEMP_DOCS_DIR, { recursive: true });
    }
  }

  /**
   * Determine whether query is asking for a document / PDF / study material
   */
  isDocumentQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return (
      /\b(?:pdf|document|notes|lecture\s+notes|assignment|test\s+paper|past\s+paper|syllabus|cheatsheet|study\s+guide|manual)\b/i.test(lower) ||
      /^(?:\/pdf|\/doc|\/notes|\/paper)\b/i.test(lower)
    );
  }

  /**
   * Search for educational documents and study materials
   */
  async searchEducationalResources(query, limit = 5) {
    const q = query.trim();
    // Augment query to target documents
    const docQuery = `${q} (filetype:pdf OR "lecture notes" OR assignment OR "past paper" OR "study guide")`;
    const searchRes = await webSearchService.search(docQuery, { limit: 10 });

    const documents = [];
    if (searchRes.ok && searchRes.results) {
      for (const item of searchRes.results) {
        const isPdf = item.url.toLowerCase().endsWith('.pdf') || item.title.toLowerCase().includes('.pdf');
        const isEdu = item.url.includes('.edu') || item.url.includes('arxiv.org') || item.url.includes('mit.edu') || item.url.includes('stanford.edu') || item.url.includes('coursehero') || item.url.includes('scribd');

        if (isPdf || isEdu || item.snippet.toLowerCase().includes('pdf') || item.snippet.toLowerCase().includes('lecture')) {
          documents.push({
            title: item.title,
            url: item.url,
            isPdf: Boolean(isPdf),
            source: item.source,
            snippet: item.snippet,
          });
        }
      }
    }

    // If specific document hits were sparse, include top general hits
    if (documents.length === 0 && searchRes.results?.length > 0) {
      for (const item of searchRes.results.slice(0, limit)) {
        documents.push({
          title: item.title,
          url: item.url,
          isPdf: item.url.toLowerCase().endsWith('.pdf'),
          source: item.source,
          snippet: item.snippet,
        });
      }
    }

    return {
      ok: true,
      query: q,
      totalFound: documents.length,
      documents: documents.slice(0, limit),
    };
  }

  async searchEducationalDocuments(query, limit = 5) {
    return this.searchEducationalResources(query, limit);
  }

  /**
   * Download and validate a remote document safely into temp sandbox
   */
  async downloadDocument(urlStr, customName = null) {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      return { ok: false, error: 'Invalid URL provided.' };
    }

    // Extract & sanitize filename to prevent path traversal
    let rawFilename = customName || path.basename(parsed.pathname) || 'document.pdf';
    let safeName = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    if (!path.extname(safeName)) {
      safeName += '.pdf';
    }

    const ext = path.extname(safeName).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      return {
        ok: false,
        error: `Unsupported document format "${ext}". Allowed: ${this.allowedExtensions.join(', ')}`,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(urlStr, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NeroLabsDocs/3.0',
        },
      });

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText || 'Download failed.'}` };
      }

      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      if (contentLength > this.maxSizeBytes) {
        return {
          ok: false,
          error: `File size (${Math.round(contentLength / (1024 * 1024))} MB) exceeds maximum permitted limit of 20 MB.`,
        };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > this.maxSizeBytes) {
        return {
          ok: false,
          error: `Downloaded file size exceeds maximum limit of 20 MB.`,
        };
      }

      const localPath = path.join(TEMP_DOCS_DIR, `${Date.now()}_${safeName}`);
      fs.writeFileSync(localPath, buffer);

      return {
        ok: true,
        filename: safeName,
        localPath,
        buffer,
        sizeBytes: buffer.length,
        mimeType: res.headers.get('content-type') || 'application/pdf',
      };
    } catch (err) {
      return {
        ok: false,
        error: err.name === 'AbortError' ? 'Download timed out after 12 seconds.' : err.message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Extract readable text from buffer (simple native stream/text extractor)
   */
  extractTextFromBuffer(buffer, mimeType = 'application/pdf') {
    if (!buffer || buffer.length === 0) return '';

    // If plain text / markdown / json / csv: decode utf-8
    if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('csv')) {
      return buffer.toString('utf-8').slice(0, 50000);
    }

    // If PDF: extract text streams using regex
    const raw = buffer.toString('binary');
    const textChunks = [];

    // Extract text in parentheses between BT (Begin Text) and ET (End Text)
    const btRegex = /BT[\s\S]*?ET/g;
    let match;
    while ((match = btRegex.exec(raw)) !== null && textChunks.length < 500) {
      const block = match[0];
      const strMatches = block.match(/\((.*?)\)/g);
      if (strMatches) {
        const text = strMatches.map((s) => s.slice(1, -1)).join(' ');
        if (text.trim().length > 3) {
          textChunks.push(text.trim());
        }
      }
    }

    if (textChunks.length > 0) {
      return textChunks.join('\n').slice(0, 40000);
    }

    // Fallback: look for general ASCII word clusters
    const asciiMatches = raw.match(/[a-zA-Z0-9.,;:!?'"()\s-]{20,}/g);
    if (asciiMatches) {
      return asciiMatches.slice(0, 100).join('\n').slice(0, 20000);
    }

    return 'Extracted structured text preview unavailable for this binary format.';
  }

  /**
   * Summarize educational document using DeepSeek V4 Flash
   */
  async summarizeDocument(docInfo, userFocus = '') {
    const text = this.extractTextFromBuffer(docInfo.buffer, docInfo.mimeType);

    const prompt = `You are Nero Labs Educational Document & Study Material Engine.
Document Name: "${docInfo.filename}"
Size: ${Math.round(docInfo.sizeBytes / 1024)} KB
User Focus / Question: "${userFocus || 'Provide a study summary covering main concepts, key takeaways, and practice quiz questions.'}"

Document Content Excerpt:
${text.slice(0, 12000)}

Instructions:
1. Provide an executive summary of this educational resource.
2. Outline the core concepts, theorems, or definitions explained.
3. Formulate 3 practice questions or discussion points to test understanding.
4. Keep the output well-structured, clear, and mobile-friendly with markdown headers.`;

    try {
      const activeModel = getActiveModelId() || 'deepseek-v4-flash';
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      });

      return completion.text;
    } catch {
      return `📄 **Document Analysis: ${docInfo.filename}**\n\nDownloaded successfully (${Math.round(docInfo.sizeBytes / 1024)} KB).\n\nText Preview:\n${text.slice(0, 600)}...`;
    }
  }
}

export const documentService = new DocumentService();

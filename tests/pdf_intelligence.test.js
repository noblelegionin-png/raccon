import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { pdfService } from '../src/pdf/pdfService.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { scaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';
import { clearProcessedWhatsAppMessages } from '../src/db/index.js';

describe('📄 Enterprise PDF Intelligence Engine Tests', () => {
  before(() => {
    clearProcessedWhatsAppMessages();
  });

  beforeEach(() => {
    clearProcessedWhatsAppMessages();
  });

  // --------------------------------------------------------------------------
  // 1. Detection & Helper Tests
  // --------------------------------------------------------------------------
  test('1. Correctly detects PDF generation requests and extracts requested page counts', () => {
    assert.strictEqual(pdfService.isPdfGenerationRequest('/pdf_gen neural networks'), true);
    assert.strictEqual(pdfService.isPdfGenerationRequest('/create_pdf 10 pages on AI'), true);
    assert.strictEqual(pdfService.isPdfGenerationRequest('Please generate a 15-page pdf report on blockchain security'), true);
    assert.strictEqual(pdfService.isPdfGenerationRequest('Make a 5 page pdf about solar system'), true);
    assert.strictEqual(pdfService.isPdfGenerationRequest('Create a pdf guide on microservices architecture'), true);
    assert.strictEqual(pdfService.isPdfGenerationRequest('Export as pdf'), true);

    // Negative assertions
    assert.strictEqual(pdfService.isPdfGenerationRequest('What is a PDF file?'), false);
    assert.strictEqual(pdfService.isPdfGenerationRequest('Hello Nero, how are you?'), false);
    assert.strictEqual(pdfService.isPdfGenerationRequest(''), false);

    // Page count extraction
    assert.strictEqual(pdfService.extractTargetPages('make a 10 page pdf on cloud architecture'), 10);
    assert.strictEqual(pdfService.extractTargetPages('create a 25 pages document'), 25);
    assert.strictEqual(pdfService.extractTargetPages('build a 75-page pdf'), 50); // Capped at 50 maxSupportedPages
    assert.strictEqual(pdfService.extractTargetPages('generate a 0 page pdf'), 1); // Minimum 1
    assert.strictEqual(pdfService.extractTargetPages('make a pdf on space science'), 3); // Balanced default
  });

  // --------------------------------------------------------------------------
  // 2. Structured Multi-Page PDF Generation with Tables, Code, Callouts & Pagination
  // --------------------------------------------------------------------------
  test('2. Compiles multi-page PDF document with tables, code, callouts and 2-pass running headers/footers', async () => {
    let md = '# Autonomous Multi-Agent AI Systems\n\n';
    md += '> **Executive Summary:** Modern AI architecture leverages distributed autonomous agents communicating via structured protocols.\n\n';

    for (let i = 1; i <= 6; i++) {
      md += `\n## Section ${i}: Strategic Agent Orchestration\n\n`;
      md += `Paragraph discussing distributed consensus, agent memory graphs, and high-reasoning task allocation in section ${i}.\n\n`;
      md += `> Key Insight ${i}: Agent decoupling ensures failure resilience and linear scalability.\n\n`;
      md += `| Node | Role | Latency | Status |\n|---|---|---|---|\n| Agent-A | Planner | 45ms | Active |\n| Agent-B | Worker | 12ms | Active |\n\n`;
      md += `\`\`\`javascript\nexport function dispatchAgent${i}(payload) {\n  return orchestrator.route(payload);\n}\n\`\`\`\n\n`;
      md += `- Task distribution across multi-cloud regions\n- Fallback heuristics and circuit breakers\n- Deterministic telemetry tracking\n\n`;
    }

    const res = await pdfService.generatePdf({
      title: 'Autonomous Multi-Agent AI Systems',
      subtitle: 'Technical Whitepaper & Architecture Blueprint',
      author: 'Nero Labs Engineering',
      markdownContent: md,
      coverPage: true,
    });

    assert.strictEqual(res.ok, true);
    assert.ok(Buffer.isBuffer(res.buffer));
    assert.ok(res.pageCount >= 2, `Expected at least 2 pages, got ${res.pageCount}`);
    assert.ok(res.sizeBytes > 3000, `Expected size > 3000 bytes, got ${res.sizeBytes}`);
    assert.ok(fs.existsSync(res.filePath));

    // Verify PDF parsing read-back
    const readBack = await pdfService.readPdf(res.buffer);
    assert.strictEqual(readBack.ok, true);
    assert.strictEqual(readBack.total, res.pageCount);
    assert.ok(readBack.wordCount > 150);
    assert.ok(readBack.text.includes('Autonomous Multi-Agent AI Systems') || readBack.text.includes('Executive Summary'));
  });

  // --------------------------------------------------------------------------
  // 3. Image Attachment & Embedding within PDF
  // --------------------------------------------------------------------------
  test('3. Successfully embeds attached image with automatic scaling and figure caption', async () => {
    // Generate a test image buffer via sharp
    const testImageBuffer = await sharp({
      create: {
        width: 300,
        height: 200,
        channels: 3,
        background: { r: 15, g: 100, b: 240 },
      },
    }).png().toBuffer();

    const md = `
# Deep Learning Acceleration Report

> **Overview:** Analysis of TPU v5e and H100 inference throughput.

## Section 1: Hardware Benchmarks
Below is the benchmark visualization of model tensor operations:

## Section 2: Concluding Analysis
Model latency decreases proportionally with batch tensor parallelization.
    `.trim();

    const res = await pdfService.generatePdf({
      title: 'Deep Learning Acceleration Report',
      markdownContent: md,
      images: [
        {
          buffer: testImageBuffer,
          caption: 'Figure 1: Tensor Core Floating Point Operations Comparison',
        },
      ],
      coverPage: false,
    });

    assert.strictEqual(res.ok, true);
    assert.ok(res.pageCount >= 1);
    assert.ok(res.sizeBytes > 2000);

    const readBack = await pdfService.readPdf(res.buffer);
    assert.strictEqual(readBack.ok, true);
    assert.ok(readBack.text.includes('Figure 1') || readBack.text.includes('Deep Learning Acceleration'));
  });

  // --------------------------------------------------------------------------
  // 4. High-Reasoning PDF Generation with Gemini 3.8 Flash (reasoningEffort: 'high')
  // --------------------------------------------------------------------------
  test('4. Generates publication PDF using Gemini 3.8 Flash with high reasoning effort', async () => {
    const origCreateChat = scaleMaxAdapter.createChatCompletion;
    let capturedModel = null;
    let capturedReasoningEffort = null;
    let capturedMessages = null;

    scaleMaxAdapter.createChatCompletion = async ({ model, messages, reasoningEffort }) => {
      capturedModel = model;
      capturedReasoningEffort = reasoningEffort;
      capturedMessages = messages;
      return {
        text: `# Next-Gen Quantum Cryptography\n\n> **Executive Summary:** Quantum key distribution provides theoretically unbreakable communication channels.\n\n## 1. Introduction\nPost-quantum cryptographic algorithms are being standardized by NIST.\n\n## 2. Key Exchange Architecture\nLattice-based encryption constructs offer resilience against Shor's algorithm.\n\n| Algorithm | Key Size | Security Level |\n|---|---|---|\n| ML-KEM-512 | 800 bytes | Category 1 |\n| ML-KEM-768 | 1184 bytes | Category 3 |\n| ML-KEM-1024 | 1568 bytes | Category 5 |\n`,
      };
    };

    try {
      const result = await pdfService.generatePdfFromPrompt({
        prompt: 'Generate an executive 5-page PDF report on quantum cryptography',
        targetPages: 5,
      });

      assert.strictEqual(capturedModel, 'gemini-3.8-flash');
      assert.strictEqual(capturedReasoningEffort, 'high');
      assert.ok(capturedMessages.some(m => m.content.includes('5 pages')));
      assert.strictEqual(result.ok, true);
      assert.ok(Buffer.isBuffer(result.buffer));
      assert.ok(result.pageCount >= 1);
      assert.strictEqual(result.title, 'Next-Gen Quantum Cryptography');
    } finally {
      scaleMaxAdapter.createChatCompletion = origCreateChat;
    }
  });

  // --------------------------------------------------------------------------
  // 5. High-Reasoning PDF Reading & Analysis with Gemini 3.8 Flash (reasoningEffort: 'high')
  // --------------------------------------------------------------------------
  test('5. Reads and analyzes PDF document using Gemini 3.8 Flash with high reasoning effort', async () => {
    // Generate a real 2-page test PDF
    const testDoc = await pdfService.generatePdf({
      title: 'Confidential Cloud SLA Agreement',
      markdownContent: `
# Confidential Cloud SLA Agreement

> **Master Agreement:** Enterprise Cloud Service Level Terms.

## Section 1: Uptime Commitment
The Service Provider guarantees 99.99% monthly availability for core infrastructure APIs.

## Section 2: Penalties and Service Credits
Failure to meet 99.95% results in a 10% invoice credit. Downtime exceeding 4 hours results in a 30% credit.
      `,
      coverPage: false,
    });

    const origCreateChat = scaleMaxAdapter.createChatCompletion;
    let capturedModel = null;
    let capturedReasoningEffort = null;
    let capturedUserPrompt = null;

    scaleMaxAdapter.createChatCompletion = async ({ model, messages, reasoningEffort }) => {
      capturedModel = model;
      capturedReasoningEffort = reasoningEffort;
      capturedUserPrompt = messages.find(m => m.role === 'user')?.content || '';
      return {
        text: '📋 *Executive Overview:* Confidential Cloud SLA Agreement.\n\n🔍 *Key Findings:*\n• Section 1 guarantees 99.99% monthly availability.\n• Section 2 stipulates 10% credit for breaches below 99.95% and 30% credit for downtime > 4 hours.\n\n💡 *Action Items:* Incorporate credit claim clause into finance audit workflow.',
      };
    };

    try {
      const analysis = await pdfService.analyzePdf({
        buffer: testDoc.buffer,
        userQuery: 'What are the penalty terms for downtime?',
        filename: 'sla_agreement.pdf',
      });

      assert.strictEqual(capturedModel, 'gemini-3.8-flash');
      assert.strictEqual(capturedReasoningEffort, 'high');
      assert.ok(capturedUserPrompt.includes('Confidential Cloud SLA Agreement'));
      assert.strictEqual(analysis.ok, true);
      assert.ok(analysis.analysisText.includes('Executive Overview'));
      assert.ok(analysis.pageCount >= 1);
      assert.ok(analysis.wordCount > 20);
    } finally {
      scaleMaxAdapter.createChatCompletion = origCreateChat;
    }
  });

  // --------------------------------------------------------------------------
  // 6. WhatsApp Outgoing PDF Generation Dispatch Integration
  // --------------------------------------------------------------------------
  test('6. WhatsApp dispatches generated PDF document attachment with caption when requested', async () => {
    const origSafeSend = whatsAppService.safeSendMessage;
    const origCreateChat = scaleMaxAdapter.createChatCompletion;

    let capturedJid = null;
    let capturedContent = null;

    scaleMaxAdapter.createChatCompletion = async () => ({
      text: '# Edge AI Deployment\n\n> **Summary:** Micro-models deployed directly onto microcontrollers.\n\n## Section 1: Architecture\nQuantized models run on ARM Cortex-M55 processors.',
    });

    whatsAppService.safeSendMessage = async (jid, content) => {
      capturedJid = jid;
      capturedContent = content;
      return { key: { id: 'TEST_PDF_OUT_123' } };
    };

    try {
      await whatsAppService.handleIncomingMessage({
        key: {
          id: 'USER_MSG_PDF_GEN',
          remoteJid: '919876543210@s.whatsapp.net',
          fromMe: false,
        },
        message: {
          conversation: 'Please generate a 5 page PDF about Edge AI Deployment',
        },
        pushName: 'Alex',
      });

      assert.strictEqual(capturedJid, '919876543210@s.whatsapp.net');
      assert.ok(capturedContent.document, 'Expected document buffer in message content');
      assert.strictEqual(capturedContent.mimetype, 'application/pdf');
      assert.ok(capturedContent.fileName.endsWith('.pdf'));
      assert.ok(capturedContent.caption.includes('Edge AI Deployment'));
    } finally {
      whatsAppService.safeSendMessage = origSafeSend;
      scaleMaxAdapter.createChatCompletion = origCreateChat;
    }
  });

  // --------------------------------------------------------------------------
  // 7. 50-Page Scale & Capacity Verification
  // --------------------------------------------------------------------------
  test('7. Comfortably compiles and parses up to 50 pages without memory leaks', async () => {
    let md = '# 50-Page Architectural Benchmark\n\n> **Executive Summary:** Complete verification of 50-page scale capacity.\n\n';
    for (let i = 1; i <= 120; i++) {
      md += `\n## Section ${i}: Scalable Systems Engineering\n\n`;
      md += `Deep analysis in section ${i} verifying typography, running headers, and footers at scale with extensive technical discussion.\n\n`;
      md += `Additional paragraph ensuring authentic multi-paragraph vertical distribution and content density.\n\n`;
      md += `> Section ${i} Rule: Deterministic execution and bounded memory overhead.\n\n`;
      md += `| Test ${i} | Metric A | Metric B |\n|---|---|---|\n| Cluster ${i} | 99.9% | 45ms |\n\n`;
    }

    const res = await pdfService.generatePdf({
      title: '50-Page Architectural Benchmark',
      markdownContent: md,
      coverPage: true,
    });

    assert.strictEqual(res.ok, true);
    assert.ok(res.pageCount >= 30, `Expected at least 30 pages, got ${res.pageCount}`);
    assert.ok(res.pageCount <= 50, `Expected at most 50 pages, got ${res.pageCount}`);

    const readBack = await pdfService.readPdf(res.buffer);
    assert.strictEqual(readBack.ok, true);
    assert.strictEqual(readBack.total, res.pageCount);
    assert.ok(readBack.wordCount > 3000);
  });
});

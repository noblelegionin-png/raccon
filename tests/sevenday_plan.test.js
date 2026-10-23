import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { googleDriveAdapter } from '../src/storage/driveAdapter.js';
import { messageArchiver } from '../src/memory/archiver.js';
import { memoryRetriever } from '../src/memory/retriever.js';
import { visionService } from '../src/vision/visionService.js';
import { evaluateInvocationPolicy } from '../src/groups/invocationPolicy.js';
import {
  insertRawMessage,
  getUnarchivedMessages,
  countUnarchivedMessages,
  searchRawMessages,
  getRawMessagesByDateRange,
  addDurableMemory,
  searchDurableMemory,
  recordAttachment,
  searchAttachments,
  registerGroupParticipant,
  getGroupParticipant,
  getArchiveBatches,
  setConfig,
} from '../src/db/index.js';
import { toggleGroup } from '../src/groups/groupService.js';
import { isOwner } from '../src/auth/accessControl.js';
import { config } from '../src/config.js';

test('NERO 7-Day Testing Phase — Comprehensive Verification', async (suite) => {
  const testChatId = '-1004437965665'; // GRP 1 test chat ID
  const otherChatId = '-1009999999999'; // Isolated comparison group

  // ==========================================
  // DAY 1: Google Drive Folders, Permissions & Message Capture
  // ==========================================
  await suite.test('Day 1 — Google Drive 7-Tier Memory Structure & Message Capture', async (t) => {
    // 1. Memory folder structure
    googleDriveAdapter.ensureMemoryStructure();
    const requiredDirs = ['Conversations', 'Summaries', 'Attachments', 'Indexes', 'Metadata', 'Backups'];
    for (const dir of requiredDirs) {
      const dirPath = path.join(googleDriveAdapter.memoryBaseDir, dir);
      assert.ok(fs.existsSync(dirPath), `Directory ${dir} must exist in Nero/Memory/`);
    }

    // 2. Group folder structure isolation
    const { localDir } = await googleDriveAdapter.ensureGroupDirectory('Conversations', testChatId);
    assert.ok(fs.existsSync(localDir), 'Group conversation directory must exist');

    // 3. Status & permissions
    const status = googleDriveAdapter.getStatus();
    assert.strictEqual(status.capacityTarget, '5 TB Cloud Tier');
    assert.strictEqual(status.permissions.canCreateFolders, true);
    assert.strictEqual(status.permissions.canUploadFiles, true);
    assert.strictEqual(status.permissions.canDeleteFiles, true);

    // 4. Basic message capture
    const captureResult = insertRawMessage({
      platformMessageId: 101,
      chatId: testChatId,
      senderId: '8685232094',
      senderName: 'Sandy',
      messageType: 'text',
      rawContent: 'Day 1 test message: Initializing Nero Memory! 🚀',
      createdAt: new Date().toISOString(),
    });
    assert.ok(captureResult);
  });

  // ==========================================
  // DAY 2: 50-Message Batching, Transcripts & Duplicate Prevention
  // ==========================================
  await suite.test('Day 2 — 50-Message Archiving, Exact Transcripts & Duplicate Prevention', async (t) => {
    // Configure participants: Sandy is "He", partner is "She"
    registerGroupParticipant(testChatId, '8685232094', 'Sandy', 'He', 'owner');
    registerGroupParticipant(testChatId, '1234567890', 'Elena', 'She', 'member');

    // Seed 50 realistic conversation messages with unique base ID per run
    const baseMsgId = Math.floor(Date.now() / 1000) * 100;
    for (let i = 1; i <= 50; i++) {
      const isSandy = i % 2 !== 0;
      insertRawMessage({
        platformMessageId: baseMsgId + i,
        chatId: testChatId,
        senderId: isSandy ? '8685232094' : '1234567890',
        senderName: isSandy ? 'Sandy' : 'Elena',
        messageType: 'text',
        rawContent: isSandy
          ? `Message ${i}: Let's schedule the project launch for November 15th! 📅`
          : `Message ${i}: Agreed, and let's book Hotel Cyberpunk in Tokyo! 🗼`,
        createdAt: new Date(Date.now() - (50 - i) * 60000).toISOString(),
      });
    }

    const unarchived = countUnarchivedMessages(testChatId);
    assert.ok(unarchived >= 50, 'Must have at least 50 unarchived messages');

    // Process the batch
    const batchResult = await messageArchiver.processBatch(testChatId, false);
    assert.ok(batchResult, 'Batch must complete successfully');
    assert.strictEqual(batchResult.messageCount, 50, 'Batch must contain exactly 50 messages');
    assert.strictEqual(batchResult.verified, true, 'Batch must be verified on disk/drive');
    assert.ok(batchResult.checksum, 'Batch must produce a cryptographic checksum');

    // Check transcript file content
    const transcriptPath = path.join(
      googleDriveAdapter.memoryBaseDir,
      'Conversations',
      googleDriveAdapter.sanitizeGroupId(testChatId),
      batchResult.transcriptFilename
    );
    assert.ok(fs.existsSync(transcriptPath), 'Transcript file must exist on disk');
    const content = fs.readFileSync(transcriptPath, 'utf8');

    // Verify format: "He: [exact message]" and "She: [exact message]"
    assert.ok(content.includes('He: Message 1:'), 'Must label Sandy as He');
    assert.ok(content.includes('She: Message 2:'), 'Must label Elena as She');
    assert.ok(content.includes('November 15th! 📅'), 'Must preserve emojis and punctuation');

    // Verify duplicate prevention: inserting message baseMsgId + 1 again must be ignored
    const dupResult = insertRawMessage({
      platformMessageId: baseMsgId + 1,
      chatId: testChatId,
      senderId: '8685232094',
      senderName: 'Sandy',
      messageType: 'text',
      rawContent: 'Duplicate attempt',
      createdAt: new Date().toISOString(),
    });
    // Duplicate insert returns 0 changes due to INSERT OR IGNORE
    assert.strictEqual(dupResult.changes, 0);
  });

  // ==========================================
  // DAY 3: Historical Search, Dates, Decisions & Grounding
  // ==========================================
  await suite.test('Day 3 — Historical Search, Decisions, Plans & Grounded Evidence', async (t) => {
    // Record explicit durable decision and plan
    addDurableMemory(
      testChatId,
      'decision',
      'Tokyo Hotel',
      'Decided to stay at Hotel Cyberpunk in Tokyo',
      1002,
      new Date().toISOString()
    );
    addDurableMemory(
      testChatId,
      'deadline',
      'Project Launch',
      'Project launch date confirmed for November 15th',
      1001,
      new Date().toISOString()
    );

    // 1. Detect historical question
    assert.strictEqual(memoryRetriever.isHistoricalQuestion('Nero, what did we discuss two days ago?'), true);
    assert.strictEqual(memoryRetriever.isHistoricalQuestion('Did we already make a plan about this?'), true);
    assert.strictEqual(memoryRetriever.isHistoricalQuestion('What date did we decide on?'), true);
    assert.strictEqual(memoryRetriever.isHistoricalQuestion('Hello how are you doing'), false);

    // 2. Search records
    const searchRes = await memoryRetriever.searchHistoricalRecords(testChatId, 'What date did we decide on Tokyo hotel?');
    assert.ok(searchRes.totalEvidenceCount > 0, 'Evidence must be found in memory');
    assert.ok(searchRes.durableFacts.length > 0, 'Durable facts must match keywords');

    // 3. Grounded answer generation
    const answerRes = await memoryRetriever.answerHistoricalQuestion(testChatId, 'What hotel did we decide on?');
    assert.strictEqual(answerRes.found, true);
    assert.ok(answerRes.answer.includes('Hotel Cyberpunk') || answerRes.answer.includes('Decisions'), 'Answer must cite Hotel Cyberpunk');

    // 4. Honest limitation when not found
    const zeroRes = await memoryRetriever.answerHistoricalQuestion(testChatId, 'quantum teleportation zebra');
    assert.strictEqual(zeroRes.found, false);
    assert.ok(zeroRes.answer.includes("couldn't find any recorded discussion"), 'Must state limitation honestly when zero evidence');

    // 5. Grounded absence disclosure when partial evidence exists but topic is unrecorded
    const unrecordedRes = await memoryRetriever.answerHistoricalQuestion(testChatId, 'What is our plan for Mars colony?');
    assert.ok(
      unrecordedRes.answer.toLowerCase().includes('no information') ||
      unrecordedRes.answer.toLowerCase().includes('no mention') ||
      unrecordedRes.answer.toLowerCase().includes('missing from the archives'),
      'Must declare unrecorded topic honestly without fabricating facts'
    );
  });

  // ==========================================
  // DAY 4: Image Understanding, Captions, OCR & Drive Retrieval
  // ==========================================
  await suite.test('Day 4 — Image Understanding, OCR, Drive Upload & Retrieval', async (t) => {
    // Save sample image attachment directly into Drive memory
    const sampleBuffer = Buffer.from('fake_image_binary_data_for_test');
    const filename = `test_screenshot_${Date.now()}.jpg`;

    const saved = await googleDriveAdapter.saveGroupAttachment({
      groupId: testChatId,
      filename,
      buffer: sampleBuffer,
      mimeType: 'image/jpeg',
      actorId: 'test_suite',
    });

    assert.ok(saved);
    assert.ok(fs.existsSync(saved.localPath), 'Saved attachment must exist in Nero/Memory/Attachments/');

    // Index attachment in database
    recordAttachment(testChatId, {
      platformFileId: 'tg_file_998877',
      senderId: '8685232094',
      senderName: 'Sandy',
      filename,
      mimeType: 'image/jpeg',
      caption: 'App architecture diagram and database credentials screenshot',
      aiDescription: 'Diagram of Nero Labs cloud infrastructure showing Google Drive and SQLite connections.',
      ocrText: 'NERO LABS ARCHITECTURE v1.0',
      driveFileId: saved.driveFileId,
      localPath: saved.localPath,
    });

    // Search attachments by keyword
    const found = searchAttachments(testChatId, 'architecture', 5);
    assert.ok(found.length > 0, 'Attachment must be searchable by OCR and description');
    assert.strictEqual(found[0].filename, filename);

    // Retrieve buffer for chat delivery
    const retrievedBuffer = await googleDriveAdapter.getAttachmentBuffer(filename, testChatId);
    assert.ok(retrievedBuffer);
    assert.strictEqual(retrievedBuffer.toString(), sampleBuffer.toString());
  });

  // ==========================================
  // DAY 5: Quiet Member Invocation Policy & Silence during Ordinary Banter
  // ==========================================
  await suite.test('Day 5 — Intelligent Group Invocation & Silence Policy', async (t) => {
    // Ordinary member-to-member banter (MUST REMAIN SILENT)
    const ordinaryCtx1 = {
      chat: { id: testChatId, type: 'group', title: 'GRP 1' },
      message: { message_id: 501, text: 'Hey Elena, did you finish that report?' },
      from: { id: 1234567890, first_name: 'Elena' },
      me: { id: 8283843309, username: 'N3ROL4BSBOT' },
    };
    const eval1 = evaluateInvocationPolicy(ordinaryCtx1);
    assert.strictEqual(eval1.shouldRespond, false, 'Nero must remain silent during member banter');

    // Question between members with a question mark (MUST STILL REMAIN SILENT)
    const ordinaryCtx2 = {
      chat: { id: testChatId, type: 'group', title: 'GRP 1' },
      message: { message_id: 502, text: 'Are we meeting at 5 PM today?' },
      from: { id: 1234567890, first_name: 'Elena' },
      me: { id: 8283843309, username: 'N3ROL4BSBOT' },
    };
    const eval2 = evaluateInvocationPolicy(ordinaryCtx2);
    assert.strictEqual(eval2.shouldRespond, false, 'Question between members must NOT trigger Nero');

    // Explicit mention of @N3ROL4BSBOT (MUST RESPOND)
    const mentionCtx = {
      chat: { id: testChatId, type: 'group', title: 'GRP 1' },
      message: { message_id: 503, text: '@N3ROL4BSBOT what is the current active model?' },
      from: { id: 1234567890, first_name: 'Elena' },
      me: { id: 8283843309, username: 'N3ROL4BSBOT' },
    };
    const eval3 = evaluateInvocationPolicy(mentionCtx);
    assert.strictEqual(eval3.shouldRespond, true, 'Nero must respond to explicit username mention');

    // Direct reply to Nero (MUST RESPOND)
    const replyCtx = {
      chat: { id: testChatId, type: 'group', title: 'GRP 1' },
      message: {
        message_id: 504,
        text: 'Thanks for clarifying that!',
        reply_to_message: { from: { id: 8283843309, is_bot: true } },
      },
      from: { id: 1234567890, first_name: 'Elena' },
      me: { id: 8283843309, username: 'N3ROL4BSBOT' },
    };
    const eval4 = evaluateInvocationPolicy(replyCtx);
    assert.strictEqual(eval4.shouldRespond, true, 'Nero must respond to direct replies to its messages');

    // Begins with "Nero" invocation (MUST RESPOND)
    const nameCtx = {
      chat: { id: testChatId, type: 'group', title: 'GRP 1' },
      message: { message_id: 505, text: 'Nero, explain this screenshot please.' },
      from: { id: 1234567890, first_name: 'Elena' },
      me: { id: 8283843309, username: 'N3ROL4BSBOT' },
    };
    const eval5 = evaluateInvocationPolicy(nameCtx);
    assert.strictEqual(eval5.shouldRespond, true, 'Nero must respond when addressed by name');
  });

  // ==========================================
  // DAY 6: Administrator Verification, Group Isolation & Privacy
  // ==========================================
  await suite.test('Day 6 — Numeric Owner Authorization & Multi-Group Isolation', async (t) => {
    // 1. Owner authorization strictly via numeric ID
    assert.strictEqual(isOwner(8685232094), true, 'Sandy (8685232094) is verified owner');
    assert.strictEqual(isOwner('8685232094'), true);
    assert.strictEqual(isOwner(1234567890), false, 'Elena is not owner');
    assert.strictEqual(isOwner('Sandy'), false, 'Username strings never authorize');

    // 2. Multi-Group Isolation: records from other group must NEVER appear in test group
    insertRawMessage({
      platformMessageId: 7777,
      chatId: otherChatId,
      senderId: '55555555',
      senderName: 'SecretMember',
      messageType: 'text',
      rawContent: 'Top secret proprietary credentials for group B',
      createdAt: new Date().toISOString(),
    });

    // Search in test group for "credentials"
    const isolatedSearch = searchRawMessages(testChatId, 'credentials', 10);
    const leaked = isolatedSearch.find((m) => m.raw_content.includes('group B'));
    assert.strictEqual(leaked, undefined, 'Cross-group records must NEVER leak into other groups');
  });

  // ==========================================
  // DAY 7: Archive Integrity, Batch Batches & Checkpoints
  // ==========================================
  await suite.test('Day 7 — Archive Integrity Check, Checksums & Status', async (t) => {
    const batches = getArchiveBatches(testChatId, 5);
    assert.ok(batches.length > 0, 'Completed batches must exist in audit record');

    const latest = batches[0];
    assert.strictEqual(latest.status, 'verified', 'Batch status must be verified');
    assert.ok(latest.checksum, 'Batch must have a valid SHA-256 checksum');

    const status = messageArchiver.getArchiveStatus(testChatId);
    assert.ok(typeof status.unarchivedCount === 'number');
    assert.ok(status.totalBatches >= 1);
  });

  // ==========================================
  // TEXT MODE: /text on and /text off Dynamic Reply Control
  // ==========================================
  await suite.test('Text Mode — Dynamic /text on and /text off Toggle', async (t) => {
    const textGroupChatId = '-10099887766';
    toggleGroup(textGroupChatId, true);

    const memberMsgCtx = {
      chat: { id: textGroupChatId, type: 'group', title: 'Test Group' },
      message: { message_id: 801, text: 'Hey guys, how is everyone doing today?' },
      from: { id: 11223344, first_name: 'Alex' },
      me: { id: 8283843309, username: 'N3ROL4BSBOT' },
    };

    // By default, text mode is off -> silence
    setConfig(`text_mode_${textGroupChatId}`, 'off');
    const evalSilent = evaluateInvocationPolicy(memberMsgCtx);
    assert.strictEqual(evalSilent.shouldRespond, false, 'Default text mode must be silent on ordinary banter');

    // Turn /text on -> must respond to ordinary text!
    setConfig(`text_mode_${textGroupChatId}`, 'on');
    const evalActive = evaluateInvocationPolicy(memberMsgCtx);
    assert.strictEqual(evalActive.shouldRespond, true, 'When /text on is active, Nero must reply to texts');
    assert.strictEqual(evalActive.reason, 'text_mode_on');

    // Turn /text off -> must go back to silent on ordinary banter
    setConfig(`text_mode_${textGroupChatId}`, 'off');
    const evalSilentAgain = evaluateInvocationPolicy(memberMsgCtx);
    assert.strictEqual(evalSilentAgain.shouldRespond, false, 'When /text off is active, Nero must return to quiet mode');

    // But explicit mention still responds even when /text off
    const explicitMentionCtx = {
      chat: { id: textGroupChatId, type: 'group', title: 'Test Group' },
      message: { message_id: 802, text: '@N3ROL4BSBOT help me with this calculation' },
      from: { id: 11223344, first_name: 'Alex' },
      me: { id: 8283843309, username: 'N3ROL4BSBOT' },
    };
    const evalMention = evaluateInvocationPolicy(explicitMentionCtx);
    assert.strictEqual(evalMention.shouldRespond, true, 'Explicit mention must still respond even when /text off');
  });
});

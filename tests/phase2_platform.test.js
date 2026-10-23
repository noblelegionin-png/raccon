import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  countWords,
  validatePersonalContext,
  saveUserProfile,
  MAX_PERSONAL_CONTEXT_WORDS,
} from '../src/memory/personalMemoryService.js';
import {
  addUserMemory,
  getUserMemories,
  deleteUserMemory,
  getUserProfile,
} from '../src/db/index.js';
import { userFileService } from '../src/storage/userFileService.js';
import { skillsService } from '../src/moderation/skillsService.js';
import { multiBotService } from '../src/multibot/multiBotService.js';
import { ROLEPLAY_ROLES, getRoleDefinition, formatRoleplayDirective } from '../src/conversation/roleplayManager.js';

test('1. 1,000-Word Personal Context Validation & Rejection', async () => {
  // Test word count helper
  assert.equal(countWords(''), 0);
  assert.equal(countWords('Hello world from Nero Labs'), 5);

  // Generate 500 words (valid)
  const validWords = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ');
  const validCheck = validatePersonalContext(validWords);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.wordCount, 500);

  // Generate 1,000 words (exact boundary - valid)
  const exactWords = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
  const exactCheck = validatePersonalContext(exactWords);
  assert.equal(exactCheck.valid, true);
  assert.equal(exactCheck.wordCount, 1000);

  // Generate 1,005 words (exceeds limit - must reject)
  const overflowWords = Array.from({ length: 1005 }, (_, i) => `word${i}`).join(' ');
  const overflowCheck = validatePersonalContext(overflowWords);
  assert.equal(overflowCheck.valid, false);
  assert.ok(overflowCheck.error.includes('exceeds the maximum limit of 1000 words'));

  // Test saveUserProfile rejection
  const testUserId = `test_user_ctx_${Date.now()}`;
  assert.throws(() => {
    saveUserProfile(testUserId, {
      personalContext: overflowWords,
    });
  }, /exceeds the maximum limit of 1000 words/);

  // Test saveUserProfile success under 1,000 words
  const saved = saveUserProfile(testUserId, {
    realName: 'Alexander Vance',
    nickname: 'Alex',
    personalContext: 'Prefers concise bullet points and technical precision.',
  });
  assert.equal(saved.real_name, 'Alexander Vance');
  assert.equal(saved.nickname, 'Alex');
  assert.equal(saved.personal_context, 'Prefers concise bullet points and technical precision.');
});

test('2. Personal Memory Isolation Across Users', async () => {
  const userA = `user_alpha_${Date.now()}`;
  const userB = `user_beta_${Date.now()}`;

  // Add memory for User A
  const memA = addUserMemory(userA, {
    category: 'preference',
    title: 'Code Style',
    content: 'Always format in ES modules and strict mode.',
  });
  assert.ok(memA.id);

  // Add memory for User B
  const memB = addUserMemory(userB, {
    category: 'correction',
    title: 'Tone',
    content: 'Never call me Buddy.',
  });
  assert.ok(memB.id);

  // Verify User A only sees their own memories
  const memoriesA = getUserMemories(userA);
  assert.equal(memoriesA.length, 1);
  assert.equal(memoriesA[0].id, memA.id);
  assert.equal(memoriesA[0].user_id, userA);

  // Verify User B only sees their own memories
  const memoriesB = getUserMemories(userB);
  assert.equal(memoriesB.length, 1);
  assert.equal(memoriesB[0].id, memB.id);
  assert.equal(memoriesB[0].user_id, userB);

  // User B cannot delete User A's memory (changes should be 0)
  const deletedByWrongUser = deleteUserMemory(memA.id, userB);
  assert.equal(deletedByWrongUser.changes, 0);

  // User A can delete their own memory (changes should be 1)
  const deletedByOwner = deleteUserMemory(memA.id, userA);
  assert.equal(deletedByOwner.changes, 1);
  assert.equal(getUserMemories(userA).length, 0);
});

test('3. User File Sandbox Isolation & Cascade Deletion', async () => {
  const userA = `sandbox_usr_A_${Date.now()}`;
  const userB = `sandbox_usr_B_${Date.now()}`;

  // Store file for User A
  const fileA = await userFileService.storeUserFile(userA, {
    filename: 'notes_a.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Confidential notes for User A', 'utf-8'),
    aiDescription: 'Personal notes A',
  });
  assert.ok(fileA.id);
  assert.equal(fileA.userId, userA);
  assert.ok(fs.existsSync(fileA.absolutePath));

  // Store file for User B
  const fileB = await userFileService.storeUserFile(userB, {
    filename: 'project_b.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Project B Specification', 'utf-8'),
    aiDescription: 'Project doc B',
  });
  assert.ok(fileB.id);
  assert.equal(fileB.userId, userB);
  assert.ok(fs.existsSync(fileB.absolutePath));

  // Verify separate directory sandboxes
  assert.notEqual(path.dirname(fileA.absolutePath), path.dirname(fileB.absolutePath));

  // User B cannot delete User A's file
  assert.throws(() => {
    userFileService.deleteUserFile(fileA.id, userB);
  }, /File not found or permission denied/);

  // User A deletes their file -> file is removed from disk and database
  const deleted = userFileService.deleteUserFile(fileA.id, userA);
  assert.equal(deleted, true);
  assert.equal(fs.existsSync(fileA.absolutePath), false);

  // Cleanup User B
  userFileService.deleteUserFile(fileB.id, userB);
  assert.equal(fs.existsSync(fileB.absolutePath), false);
});

test('4. Skills Submission & Owner Moderation Queue', async () => {
  const authorId = 'contributor_999';
  const ownerId = '8685232094';

  // Submit a custom skill
  const submission = skillsService.submitSkillForReview(authorId, {
    skillName: 'weather_checker',
    description: 'Fetches verified current weather for city coordinates',
    instructions: 'Check weather condition and temperature safely using permitted tools',
    permittedTools: ['weather_query'],
  });
  assert.ok(submission.moderationId);
  assert.equal(submission.status, 'pending');

  // Verify it appears in pending queue
  const queue = skillsService.getPendingQueue();
  const queueItem = queue.find(q => q.id === submission.moderationId);
  assert.ok(queueItem);
  assert.equal(queueItem.item_type, 'skill');
  assert.equal(queueItem.author_id, authorId);

  // Non-owner review attempt must fail
  assert.throws(() => {
    skillsService.reviewModerationItem(submission.moderationId, 'random_user_123', 'approved');
  }, /Unauthorized/);

  // Owner approves skill
  const approval = skillsService.reviewModerationItem(
    submission.moderationId,
    ownerId,
    'approved',
    'Verified secure and tool-whitelisted'
  );
  assert.equal(approval.status, 'approved');

  // Verify approved skills listing includes it
  const approvedSkills = skillsService.getApprovedSkills();
  const foundSkill = approvedSkills.find(s => s.skill_name === 'weather_checker');
  assert.ok(foundSkill);
  assert.equal(foundSkill.status, 'approved');
});

test('5. Multi-Bot Platform Registry & Isolation', async () => {
  const botId = `bot_companion_${Date.now()}`;

  // Register a secondary bot in the platform
  const registered = multiBotService.registerBot({
    botId,
    username: 'NeroCompanionBot',
    roleDesignation: 'companion_agent',
    status: 'active',
  });
  assert.equal(registered.botId, botId);
  assert.equal(registered.roleDesignation, 'companion_agent');
  assert.equal(registered.status, 'active');

  // List all bots
  const allBots = multiBotService.listBots();
  const found = allBots.find(b => b.bot_id === botId);
  assert.ok(found);
  assert.equal(found.role_designation, 'companion_agent');
});

test('6. 20 Personality Roles & Anti-Repetition Directive Verification', async () => {
  const roleKeys = Object.keys(ROLEPLAY_ROLES);
  assert.equal(roleKeys.length, 20);

  // Verify all 20 roles have labels, emojis, descriptions
  for (const [key, role] of Object.entries(ROLEPLAY_ROLES)) {
    assert.ok(role.label, `Role ${key} must have label`);
    assert.ok(role.emoji, `Role ${key} must have emoji`);
    assert.ok(role.description, `Role ${key} must have description`);
  }

  // Format directive for normal user in father role
  const fatherDirective = formatRoleplayDirective('user123', 'David', 'father', 'Dave', false);
  assert.ok(fatherDirective.includes('ANTI-REPETITION MANDATE'));
  assert.ok(fatherDirective.includes('do NOT repeatedly call the user "Papa" or "Father"'));
  assert.ok(fatherDirective.includes('PERMISSION BOUNDARY'));

  // Format directive for owner
  const ownerDirective = formatRoleplayDirective('8685232094', 'Sandy', 'creator', 'Sandy', true);
  assert.ok(ownerDirective.includes('Special Creator Note'));
  assert.ok(ownerDirective.includes('Sandy'));
});

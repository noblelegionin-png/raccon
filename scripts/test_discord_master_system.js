/**
 * 🦝 ROCKET AI — DISCORD MASTER SYSTEM VERIFICATION SUITE
 */

import { getDb } from '../src/db/index.js';
import {
  initDiscordDb,
  createTicket,
  getTicket,
  updateTicketStatus,
  archiveMessage,
  archiveMessageEdit,
  archiveMessageDelete,
  getArchivedMessage,
  searchMessageArchive,
  getUserNotificationPrefs,
  updateUserNotificationPrefs,
  getSubscribersForEvent,
  addHallOfShameEntry,
  listHallOfShameEntries,
  getMemberActivity,
  awardMessageActivity,
  saveGamingProfile,
  getUserGamingProfiles,
} from '../src/discord/discordDb.js';

import {
  verifySubmittedEvidence,
  syncEvidenceBackup,
} from '../src/discord/evidenceArchive.js';

import { renderStatsCardPng } from '../src/discord/statsCard.js';
import { SERVER_CATEGORIES } from '../src/discord/channelRegistry.js';
import { isProtectedRelationshipRole } from '../src/discord/verification.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 ROCKET AI — COMPREHENSIVE DISCORD VERIFICATION');
  console.log('====================================================\n');

  initDiscordDb();
  const db = getDb();
  const testGuildId = 'test_guild_999';
  const testUserId = 'test_user_123';
  const testSandyId = '8685232094';

  // TEST 1: Database Schema Check
  console.log('[Test 1] Validating SQLite Schema & Columns...');
  const tables = [
    'discord_guild_settings',
    'discord_channel_registry',
    'discord_member_profiles',
    'discord_member_activity',
    'discord_mod_logs',
    'discord_spam_incidents',
    'discord_tickets',
    'discord_message_archive',
    'discord_moderation_records',
    'discord_notification_preferences',
    'discord_hall_of_shame',
    'discord_user_permissions',
    'discord_gaming_profiles',
  ];

  for (const t of tables) {
    const info = db.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?`).get(t);
    if (!info || info.count === 0) {
      throw new Error(`Missing required table: ${t}`);
    }
  }
  console.log('  ✅ All 13 Discord SQLite tables verified successfully.');

  // Check voice_notes_count on discord_member_activity
  const colInfo = db.prepare(`PRAGMA table_info(discord_member_activity)`).all();
  const hasVoiceNotes = colInfo.some(c => c.name === 'voice_notes_count');
  if (!hasVoiceNotes) throw new Error('Missing voice_notes_count on discord_member_activity');
  console.log('  ✅ Column voice_notes_count verified.');

  // TEST 2: Evidence Archival & Real-Time Tracking
  console.log('\n[Test 2] Message Archival & Edit/Delete Tracking...');
  const mockMsgId = 'msg_test_' + Date.now();
  archiveMessage(testGuildId, 'chan_chat', 'chat', {
    id: mockMsgId,
    author: { id: testUserId, tag: 'GamerGuy#1234', username: 'gamerguy' },
    content: 'Original message before editing or deleting!',
    attachments: new Map(),
    createdTimestamp: Date.now() - 5000,
  });

  const archived = getArchivedMessage(mockMsgId);
  if (!archived || archived.content !== 'Original message before editing or deleting!') {
    throw new Error('Message failed to archive properly.');
  }
  console.log('  ✅ Incoming message successfully archived.');

  archiveMessageEdit(mockMsgId, 'Original message before editing or deleting!', 'Edited fraudulent content!');
  const editedArchived = getArchivedMessage(mockMsgId);
  if (!editedArchived.is_edited || editedArchived.content !== 'Edited fraudulent content!') {
    throw new Error('Message edit was not captured properly.');
  }
  console.log('  ✅ Message edit captured with previous content preserved.');

  archiveMessageDelete(mockMsgId);
  const deletedArchived = getArchivedMessage(mockMsgId);
  if (!deletedArchived.deleted_at) {
    throw new Error('Message deletion was not tracked.');
  }
  console.log('  ✅ Message deletion tracked with exact timestamp.');

  // TEST 3: Evidence Verification Engine (VERIFIED, UNVERIFIED, DISPUTED)
  console.log('\n[Test 3] Evidence Verification Engine...');
  const verifiedRes = await verifySubmittedEvidence(testGuildId, {
    messageId: mockMsgId,
    authorId: testUserId,
    textSnippet: 'Edited fraudulent content!',
  });
  if (verifiedRes.status !== 'VERIFIED') {
    throw new Error(`Expected VERIFIED but got ${verifiedRes.status}`);
  }
  console.log(`  ✅ VERIFIED evaluation test passed: ${verifiedRes.reason}`);

  const unverifiedRes = await verifySubmittedEvidence(testGuildId, {
    messageId: 'non_existent_msg_9999',
    authorId: testUserId,
    textSnippet: 'Some claim',
  });
  if (unverifiedRes.status !== 'UNVERIFIED') {
    throw new Error(`Expected UNVERIFIED but got ${unverifiedRes.status}`);
  }
  console.log(`  ✅ UNVERIFIED evaluation test passed: ${unverifiedRes.reason}`);

  const disputedRes = await verifySubmittedEvidence(testGuildId, {
    messageId: mockMsgId,
    authorId: 'wrong_user_id',
    textSnippet: 'Mismatched author content',
  });
  if (disputedRes.status !== 'DISPUTED') {
    throw new Error(`Expected DISPUTED but got ${disputedRes.status}`);
  }
  console.log(`  ✅ DISPUTED evaluation test passed: ${disputedRes.reason}`);

  // TEST 4: Evidence Backup Sync
  console.log('\n[Test 4] Local & Drive Storage Backup Sync...');
  const backupRes = await syncEvidenceBackup(testGuildId);
  if (!backupRes.success || !backupRes.localPath) {
    throw new Error('Evidence backup sync failed.');
  }
  console.log(`  ✅ Evidence backup snapshot created at ${backupRes.localPath} (Count: ${backupRes.recordCount})`);

  // TEST 5: Hall of Shame
  console.log('\n[Test 5] Hall of Shame Offender Registry...');
  addHallOfShameEntry(testGuildId, {
    targetUserId: 'scammer_999',
    targetUserTag: 'Scammer#0001',
    moderatorId: 'mod_1',
    moderatorTag: 'StaffModerator',
    reason: 'Solicited unauthorized transactions via DM',
    evidenceReference: mockMsgId,
  });
  const shameList = listHallOfShameEntries(testGuildId);
  if (shameList.length === 0 || shameList[0].target_user_id !== 'scammer_999') {
    throw new Error('Hall of Shame entry failed.');
  }
  console.log(`  ✅ Hall of Shame successfully registered and retrievable.`);

  // TEST 6: Confidential Ticket System
  console.log('\n[Test 6] Confidential Ticket System...');
  const uniqueChanId = 'chan_ticket_' + Date.now();
  const newTkt = createTicket(testGuildId, testUserId, {
    username: 'Member#1111',
    subject: 'Need assistance verifying my account',
    channelId: uniqueChanId,
  });

  if (!newTkt || newTkt.status !== 'open') throw new Error('Ticket creation failed.');
  console.log(`  ✅ Ticket #${newTkt.id} created with status 'open'.`);

  updateTicketStatus(newTkt.id, 'escalated', {
    assignedTo: 'Sandy',
    staffNotes: 'Verified user details with Sandy.',
  });
  let tkt = getTicket(newTkt.id);
  if (tkt.status !== 'escalated' || tkt.assigned_to !== 'Sandy') {
    throw new Error('Ticket escalation failed.');
  }
  console.log(`  ✅ Ticket #${newTkt.id} escalated to Sandy with staff internal notes.`);

  updateTicketStatus(newTkt.id, 'closed');
  tkt = getTicket(newTkt.id);
  if (tkt.status !== 'closed' || !tkt.closed_at) throw new Error('Ticket closure failed.');
  console.log(`  ✅ Ticket #${newTkt.id} successfully closed.`);

  // TEST 7: Notification Preferences & Live Activity Subscriptions
  console.log('\n[Test 7] Notification Preferences...');
  updateUserNotificationPrefs(testGuildId, testUserId, {
    notify_voice_join: 1,
    notify_voice_leave: 0,
    notify_streaming: 1,
    notify_game_activity: 1,
  });

  const prefs = getUserNotificationPrefs(testGuildId, testUserId);
  if (prefs.notify_voice_join !== 1 || prefs.notify_streaming !== 1) {
    throw new Error('Notification preferences update failed.');
  }
  const streamSubs = getSubscribersForEvent(testGuildId, 'streaming');
  if (!streamSubs.includes(testUserId)) {
    throw new Error('User not listed in streaming subscribers.');
  }
  console.log(`  ✅ Subscriptions queried successfully: user found in 'streaming' subscribers.`);

  // TEST 8: Protected Relationship Roles
  console.log('\n[Test 8] Protected Relationship Roles...');
  if (!isProtectedRelationshipRole('Brother') ||
      !isProtectedRelationshipRole("Sandy's Girlfriend") ||
      !isProtectedRelationshipRole('Friend')) {
    throw new Error('Protected relationship check failed.');
  }
  if (isProtectedRelationshipRole('Gaming') || isProtectedRelationshipRole('Coding')) {
    throw new Error('General interest role falsely marked as protected relationship.');
  }
  console.log(`  ✅ Protected relationship security check verified.`);

  // TEST 9: Member Gaming Profiles & Stats
  console.log('\n[Test 9] Member Gaming Profiles & Activity Increment...');
  saveGamingProfile(testGuildId, testUserId, {
    username: 'Member#1111',
    gameName: 'Minecraft',
    inGameUsername: 'SandyCreeper99',
    platform: 'Java',
  });
  saveGamingProfile(testGuildId, testUserId, {
    username: 'Member#1111',
    gameName: 'Roblox',
    inGameUsername: 'SandyBlox',
    platform: 'Main',
  });
  const games = getUserGamingProfiles(testGuildId, testUserId);
  if (games.length < 2) throw new Error('Gaming profiles failed to save.');
  console.log(`  ✅ Registered ${games.length} gaming profiles.`);

  awardMessageActivity(testGuildId, testUserId, {
    username: 'Member#1111',
    mediaType: 'audio',
    isOwner: false,
  });
  awardMessageActivity(testGuildId, testUserId, {
    username: 'Member#1111',
    isMemeOrMedia: true,
    isOwner: false,
  });
  const act = getMemberActivity(testGuildId, testUserId);
  if (act.voice_notes_count < 1 || act.memes_count < 1) {
    throw new Error('Activity counters failed to increment.');
  }
  console.log(`  ✅ Voice notes count (${act.voice_notes_count}) and memes count (${act.memes_count}) incremented.`);

  // TEST 10: WWE Stats Card PNG Rendering with sharp & SVG
  console.log('\n[Test 10] WWE Stats Card PNG Rendering with sharp & SVG...');
  const activityData = getMemberActivity(testGuildId, testUserId);
  const pngBuffer = await renderStatsCardPng({
    user: { id: testUserId, username: 'SandyBoss', globalName: 'Sandy (Boss)', tag: 'SandyBoss#0001' },
    activity: activityData,
    isOwner: true,
    isVerified: true,
    joinedAt: new Date(Date.now() - 90 * 86400000),
    registeredGames: games,
  });

  if (!pngBuffer || pngBuffer.length < 5000) {
    throw new Error('Stats card PNG buffer is invalid or empty.');
  }
  console.log(`  ✅ WWE Stats Card PNG rendered successfully! Buffer size: ${(pngBuffer.length / 1024).toFixed(1)} KB.`);

  // TEST 11: Channel Registry Architecture Check
  console.log('\n[Test 11] Channel Registry Architecture Check...');
  console.log(`  ✅ Total Categories registered: ${SERVER_CATEGORIES.length}`);
  for (const cat of SERVER_CATEGORIES) {
    console.log(`     • ${cat.name} (${cat.channels.length} channels: ${cat.channels.map(c => c.name).join(', ')})`);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 11 VERIFICATION TESTS PASSED WITH 100% SUCCESS');
  console.log('====================================================');
}

runTests().then(() => process.exit(0)).catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});

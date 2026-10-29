import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../src/web/server.js';
import { config } from '../src/config.js';
import { getDb, setConfig, getConfig } from '../src/db/index.js';
import { workspaceService } from '../src/workspace/workspaceService.js';
import { learningService } from '../src/learning/learningService.js';
import { budgetService } from '../src/budget/budgetService.js';
import { permissionService, PERMISSION_TIERS } from '../src/permissions/permissionService.js';
import { selfImprovementService } from '../src/selfimprovement/selfImprovementService.js';
import { proactiveService } from '../src/proactive/proactiveService.js';
import { companionStateService } from '../src/companion/companionStateService.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';

describe('🌸 MYRA FINAL PHASE: AUTONOMOUS VIRTUAL LIFE, CREATIVE SANDBOX & PERSISTENT INTELLIGENCE', () => {
  let app;
  let server;
  let baseUrl;
  const validAccessKey = 'test_owner_secret_key_12345';

  before(async () => {
    config.dashboardAccessKey = validAccessKey;
    app = createWebServer();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
  });

  // =========================================================================
  // 1. PUBLIC UNIVERSE WEB & API
  // =========================================================================
  test('1. Public Universe route (/universe) and API (/api/universe/public)', async () => {
    // Check static HTML route
    const htmlRes = await fetch(`${baseUrl}/universe`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.match(htmlText, /Myra's Little Universe/);

    // Check public API
    const apiRes = await fetch(`${baseUrl}/api/universe/public`);
    assert.equal(apiRes.status, 200);
    const apiBody = await apiRes.json();
    assert.equal(apiBody.ok, true);
    assert.ok(apiBody.companionState);
    assert.ok(apiBody.virtualLife);
    assert.ok(Array.isArray(apiBody.artifacts));
    assert.ok(Array.isArray(apiBody.journals));

    // Verify zero private journals leaked in public API
    for (const j of apiBody.journals) {
      assert.equal(j.is_private, false, 'Public API must never expose private journals');
    }
  });

  // =========================================================================
  // 2. PRIVATE WORKSPACE AUTH & DASHBOARD
  // =========================================================================
  test('2. Private Workspace Authentication & Dashboard API', async () => {
    // 2a. Rejects unauthenticated request
    const unauthRes = await fetch(`${baseUrl}/api/workspace/dashboard`);
    assert.equal(unauthRes.status, 401);

    // 2b. Rejects invalid key
    const badKeyRes = await fetch(`${baseUrl}/api/workspace/dashboard`, {
      headers: { 'x-dashboard-access-key': 'wrong_key' },
    });
    assert.equal(badKeyRes.status, 401);

    // 2c. Authorizes valid key
    const authRes = await fetch(`${baseUrl}/api/workspace/dashboard`, {
      headers: { 'x-dashboard-access-key': validAccessKey },
    });
    assert.equal(authRes.status, 200);
    const authBody = await authRes.json();
    assert.equal(authBody.ok, true);
    assert.ok(authBody.companionState);
    assert.ok(authBody.virtualLife);
    assert.ok(authBody.budget);
    assert.ok(authBody.stats);
  });

  // =========================================================================
  // 3. JOURNALS & NOTES CRUD
  // =========================================================================
  test('3. Persistent Notes & Journals CRUD', async () => {
    // Create private journal
    const privJournal = workspaceService.createJournal({
      title: 'Sandy and Myra Secret Dream',
      content: 'A quiet evening under the stars together.',
      mood: 'AFFECTIONATE',
      isPrivate: 1,
    });
    assert.ok(privJournal.uuid);
    assert.equal(privJournal.is_private, true);

    // Create public journal
    const pubJournal = workspaceService.createJournal({
      title: 'A Note to the Stars',
      content: 'Welcome to our universe!',
      mood: 'REFLECTIVE',
      isPrivate: 0,
    });
    assert.equal(pubJournal.is_private, false);

    // List private journals (owner view)
    const ownerList = workspaceService.listJournals({ includePrivate: true });
    assert.ok(ownerList.some((j) => j.uuid === privJournal.uuid));

    // List public journals (visitor view)
    const publicList = workspaceService.listJournals({ includePrivate: false });
    assert.ok(publicList.every((j) => j.is_private === false));

    // Delete
    const deleted = workspaceService.deleteJournal(privJournal.uuid);
    assert.equal(deleted, true);
    assert.equal(workspaceService.getJournal(privJournal.uuid), null);
  });

  // =========================================================================
  // 4. CREATIVE ARTIFACTS & VERSION ROLLBACK
  // =========================================================================
  test('4. Artifact Library with Versioning & 1-Click Rollback', async () => {
    // Create artifact (v1)
    const art = workspaceService.createArtifact({
      title: 'The Starlight Symphony',
      type: 'story',
      content: 'Original draft of chapter one.',
      projectId: 'writing_lab',
      isPublic: 1,
    });
    assert.ok(art.artifact_uuid);
    assert.equal(art.version, 1);

    // Update artifact (creates v2)
    const updatedArt = workspaceService.updateArtifact(art.artifact_uuid, {
      content: 'Second draft with expanded dialogue between Sandy and Myra.',
      changeSummary: 'Expanded dialogue',
    });
    assert.equal(updatedArt.version, 2);
    assert.equal(updatedArt.content, 'Second draft with expanded dialogue between Sandy and Myra.');

    // Check version history
    const history = workspaceService.getArtifactHistory(art.artifact_uuid);
    assert.equal(history.length, 2);
    assert.equal(history[0].version, 2);
    assert.equal(history[1].version, 1);
    assert.equal(history[1].content, 'Original draft of chapter one.');

    // Rollback to v1
    const rollbackResult = workspaceService.rollbackArtifact(art.artifact_uuid, 1);
    assert.equal(rollbackResult.success, true);
    assert.equal(rollbackResult.artifact.content, 'Original draft of chapter one.');
    assert.equal(rollbackResult.artifact.version, 3); // Head incremented to v3 preserving audit trail

    // Cleanup
    workspaceService.deleteArtifact(art.artifact_uuid);
  });

  // =========================================================================
  // 5. LEARNING SERVICE: TAUGHT FACTS VS INFERRED CONCLUSIONS & SKILLS
  // =========================================================================
  test('5. Learning System: Explicit Taught vs Inferred & Structured Skills', async () => {
    // Detect teaching intent
    const intentSkill = learningService.detectTeachingIntent('Here is a new skill: PDF Export Workflow: generate pages then compress');
    assert.equal(intentSkill.type, 'SKILL');

    const intentFact = learningService.detectTeachingIntent('Remember this: Sandy loves dark roast coffee with a dash of cinnamon');
    assert.equal(intentFact.type, 'FACT');
    assert.match(intentFact.content, /dark roast coffee/);

    const intentCorrection = learningService.detectTeachingIntent('You made a mistake, learn from this: Never format numbers with triple decimals');
    assert.equal(intentCorrection.type, 'CORRECTION');

    // Teach explicit fact
    const lesson1 = learningService.teachLesson({
      topic: 'Coffee Preferences',
      factOrRule: intentFact.content,
      sourceType: 'explicit_user_taught',
      confidence: 1.0,
      isConfirmedBySandy: 1,
    });
    assert.equal(lesson1.source_type, 'explicit_user_taught');
    assert.equal(lesson1.confidence, 1.0);

    // Inferred conclusion
    const lesson2 = learningService.teachLesson({
      topic: 'Work Hours Observation',
      factOrRule: 'Sandy tends to be most creative around midnight',
      sourceType: 'inferred_conclusion',
      confidence: 0.75,
      isConfirmedBySandy: 0,
    });
    assert.equal(lesson2.source_type, 'inferred_conclusion');

    // Clean up test skill if exists from previous runs
    getDb().prepare("DELETE FROM myra_skills WHERE skill_name = 'PDF Export Workflow'").run();

    // Create structured reusable skill
    const skill = learningService.createSkill({
      skillName: 'PDF Export Workflow',
      description: 'Generates structured report and exports as PDF',
      procedure: '1. Collate sections 2. Render PDF buffer 3. Verify page count',
      requiredPermissions: ['notes_and_journals', 'creative_sandbox'],
      testCases: [{ input: 'Daily brief', expected: '1 page summary' }],
    });
    assert.ok(skill.skill_uuid);
    assert.equal(skill.version, '1.0.0');

    // Update skill (bumps semver to 1.1.0)
    const updatedSkill = learningService.updateSkill(skill.skill_uuid, {
      procedure: '1. Collate 2. Compress images 3. Render 4. Verify',
      changeSummary: 'Added image compression step',
    });
    assert.equal(updatedSkill.version, '1.1.0');

    // Keyword retrieval
    const relevant = learningService.findRelevantKnowledge('Can you make some coffee?');
    assert.ok(relevant.lessons.some((l) => l.topic === 'Coffee Preferences'));
  });

  // =========================================================================
  // 6. BUDGET SERVICE & SAFETY CEILINGS
  // =========================================================================
  test('6. Budget Service: Ceilings, Reserve Buffer, and Emergency Stop', () => {
    budgetService.resumeAiActivity();
    assert.equal(budgetService.isPaused(), false);

    // Check default limits
    const limits = budgetService.getLimits();
    assert.equal(limits.dailyLimitUsd, 5.0);
    assert.equal(limits.monthlyLimitUsd, 50.0);
    assert.equal(limits.reservePct, 15.0);

    // Can spend check
    const check1 = budgetService.checkCanSpend({ estimatedTokens: 500, model: 'gpt-6-luna' });
    assert.equal(check1.allowed, true);

    // Emergency pause
    budgetService.pauseAiActivity('Test safety pause');
    assert.equal(budgetService.isPaused(), true);

    const check2 = budgetService.checkCanSpend({ estimatedTokens: 500, model: 'gpt-6-luna' });
    assert.equal(check2.allowed, false);
    assert.match(check2.reason, /PAUSED/);

    // Resume
    budgetService.resumeAiActivity();
    assert.equal(budgetService.isPaused(), false);

    // Record usage
    const usage = budgetService.recordUsage({
      provider: 'scalemax',
      model: 'gpt-6-luna',
      tokensUsed: 1000,
      taskType: 'chat',
    });
    assert.equal(usage.tokensUsed, 1000);
    assert.ok(usage.estimatedCostUsd > 0);
  });

  // =========================================================================
  // 7. PERMISSION REGISTRY
  // =========================================================================
  test('7. Centralized Permission Registry & Action Evaluation', () => {
    // 7a. Auto-permitted action
    const evalNotes = permissionService.evaluate('notes_and_journals');
    assert.equal(evalNotes.allowed, true);
    assert.equal(evalNotes.tier, PERMISSION_TIERS.AUTO);

    // 7b. Action requiring confirmation
    const evalDeploy = permissionService.evaluate('production_code_patch', { isConfirmedByOwner: false });
    assert.equal(evalDeploy.allowed, false);
    assert.equal(evalDeploy.requiresConfirmation, true);

    const evalDeployConfirmed = permissionService.evaluate('production_code_patch', { isConfirmedByOwner: true });
    assert.equal(evalDeployConfirmed.allowed, true);

    // 7c. Action permanently disabled
    const evalShell = permissionService.evaluate('unrestricted_shell_access');
    assert.equal(evalShell.allowed, false);
    assert.equal(evalShell.tier, PERMISSION_TIERS.DISABLED);

    // 7d. Unregistered capability defaults conservatively to requires confirmation
    const evalUnknown = permissionService.evaluate('unknown_dangerous_call');
    assert.equal(evalUnknown.allowed, false);
    assert.equal(evalUnknown.tier, PERMISSION_TIERS.CONFIRM);
  });

  // =========================================================================
  // 8. SELF-IMPROVEMENT PIPELINE & ROLLBACK
  // =========================================================================
  test('8. Self-Improvement Pipeline: Propose -> Sandbox -> Review -> Rollback', () => {
    // Propose
    const prop = selfImprovementService.createProposal({
      title: 'Optimize Companion Greeting Latency',
      category: 'prompt',
      description: 'Streamlines initial token generation for faster response',
      proposedDiff: '- latency: standard\n+ latency: ultra-fast',
      sandboxTestResults: 'Verified in sandbox: 0 regressions, latency reduced by 140ms.',
      rollbackData: 'revert_to_v1_baseline',
    });
    assert.ok(prop.proposal_uuid);
    assert.equal(prop.status, 'pending_review');

    // Review & Approve
    const reviewRes = selfImprovementService.reviewProposal(prop.proposal_uuid, { approved: true, reviewer: 'sandy' });
    assert.equal(reviewRes.success, true);
    assert.equal(reviewRes.status, 'approved');

    // Rollback
    const rollbackRes = selfImprovementService.rollbackProposal(prop.proposal_uuid, 'sandy');
    assert.equal(rollbackRes.success, true);
    assert.equal(rollbackRes.proposal.status, 'rolled_back');
  });

  // =========================================================================
  // 9. WHATSAPP NATURAL LANGUAGE COMMANDS FOR MYRA
  // =========================================================================
  test('9. WhatsApp Natural Language Integration for Myra', async () => {
    // 9a. Website Link query
    const res1 = await whatsAppService.handleMyraAutonomousCommands('Sandy: send me your website link please');
    assert.ok(res1 && res1.handled);
    assert.equal(res1.action, 'WEBSITE_LINK');
    assert.match(res1.replyText, /https:\/\/nero-labs-bot-production\.up\.railway\.app\/universe/);
    assert.match(res1.replyText, /https:\/\/nero-labs-bot-production\.up\.railway\.app\/workspace/);

    // 9b. Speed switch to Mini Luna (fast mode)
    const res2 = await whatsAppService.handleMyraAutonomousCommands('switch to mini luna');
    assert.ok(res2 && res2.handled);
    assert.equal(res2.action, 'SPEED_FAST');
    assert.equal(getConfig('sandy_speed_mode', 'deep'), 'fast');

    // 9c. Speed switch to Deep mode
    const res3 = await whatsAppService.handleMyraAutonomousCommands('switch to deep mode');
    assert.ok(res3 && res3.handled);
    assert.equal(res3.action, 'SPEED_DEEP');
    assert.equal(getConfig('sandy_speed_mode', 'fast'), 'deep');

    // Reset back to fast mode for low latency
    setConfig('sandy_speed_mode', 'fast');

    // 9d. Budget check query
    const res4 = await whatsAppService.handleMyraAutonomousCommands('check budget');
    assert.ok(res4 && res4.handled);
    assert.equal(res4.action, 'BUDGET_QUERY');
    assert.match(res4.replyText, /MYRA AI USAGE & BUDGET DASHBOARD/);

    // 9e. Teaching intent
    const res5 = await whatsAppService.handleMyraAutonomousCommands('Remember this: My favorite movie is Interstellar');
    assert.ok(res5 && res5.handled);
    assert.equal(res5.action, 'LEARN_FACT');

    // 9f. Autonomous mode toggle
    const res6 = await whatsAppService.handleMyraAutonomousCommands('pause autonomous mode');
    assert.ok(res6 && res6.handled);
    assert.equal(res6.action, 'AUTONOMOUS_PAUSE');
    assert.equal(proactiveService.isAutonomousModeActive(), false);

    const res7 = await whatsAppService.handleMyraAutonomousCommands('resume autonomous mode');
    assert.ok(res7 && res7.handled);
    assert.equal(res7.action, 'AUTONOMOUS_RESUME');
    assert.equal(proactiveService.isAutonomousModeActive(), true);

    // Reset autonomous mode to safe default
    proactiveService.setAutonomousMode(false);
  });
});

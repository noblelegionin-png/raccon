process.env.NODE_ENV = 'test';
import { test } from 'node:test';
import assert from 'node:assert';
import { getDb } from '../src/db/index.js';
import { taskService } from '../src/tasks/taskService.js';
import { persistentSchedulerService } from '../src/scheduler/persistentSchedulerService.js';
import { calendarIntegrationService } from '../src/calendar/calendarIntegrationService.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';

test('📦 MYRA WHATSAPP — PERSISTENT INFRASTRUCTURE & INTEGRATIONS SUITE', async (t) => {
  const db = getDb();

  // Clean test tables
  db.prepare("DELETE FROM user_tasks WHERE user_id = 'sandy_test'").run();
  db.prepare("DELETE FROM scheduled_reminders WHERE user_id = 'sandy_test'").run();
  db.prepare("DELETE FROM calendar_proposals WHERE user_id = 'sandy_test'").run();

  // =========================================================================
  // 1. TASK SYSTEM: CREATION, STATUS, DEADLINES, PRIORITIES & RECURRENCE
  // =========================================================================
  await t.test('1. Internal Tasks: Creates, filters by priority, and completes recurring tasks', () => {
    // Create urgent task
    const urgentTask = taskService.createTask({
      title: 'Fix critical memory leak in production',
      priority: 'urgent',
      dueAt: new Date(Date.now() + 3600000).toISOString(),
      userId: 'sandy_test',
    });
    assert.strictEqual(urgentTask.priority, 'urgent');
    assert.strictEqual(urgentTask.status, 'pending');

    // Create recurring daily task
    const dailyTask = taskService.createTask({
      title: 'Review daily system metrics & Baileys socket health',
      priority: 'high',
      isRecurring: true,
      recurrenceRule: 'daily',
      userId: 'sandy_test',
    });
    assert.strictEqual(dailyTask.is_recurring, 1);
    assert.strictEqual(dailyTask.recurrence_rule, 'daily');

    // List pending tasks
    const pendingList = taskService.listTasks({ userId: 'sandy_test', status: 'pending' });
    assert.strictEqual(pendingList.length, 2);
    // Urgent task should be first due to priority sort
    assert.strictEqual(pendingList[0].id, urgentTask.id);

    // Complete recurring task -> should advance due date and remain pending
    const compRec = taskService.completeTask(dailyTask.id);
    assert.strictEqual(compRec.success, true);
    assert.strictEqual(compRec.recurring, true);
    assert.strictEqual(compRec.task.status, 'pending', 'Recurring task stays active with next cycle');

    // Complete normal task -> should mark completed
    const compNorm = taskService.completeTask(urgentTask.id);
    assert.strictEqual(compNorm.success, true);
    assert.strictEqual(compNorm.recurring, false);
    assert.strictEqual(compNorm.task.status, 'completed');

    // Formatting check
    const formatted = taskService.formatTaskList(taskService.listTasks({ userId: 'sandy_test' }));
    assert.ok(formatted.includes('Review daily system metrics'));
  });

  // =========================================================================
  // 2. NATURAL LANGUAGE TASK PARSING
  // =========================================================================
  await t.test('2. Natural language task commands from Sandy', () => {
    // Add task
    const parse1 = taskService.parseNaturalLanguageTask('todo: refactor database queries for high priority');
    assert.strictEqual(parse1.action, 'CREATE');
    assert.strictEqual(parse1.priority, 'high');
    assert.ok(parse1.title.includes('refactor database queries'));

    // Complete task
    const parse2 = taskService.parseNaturalLanguageTask('done #15');
    assert.strictEqual(parse2.action, 'COMPLETE');
    assert.strictEqual(parse2.taskId, 15);

    // List tasks
    const parse3 = taskService.parseNaturalLanguageTask('/tasks');
    assert.strictEqual(parse3.action, 'LIST');
    assert.strictEqual(parse3.status, 'pending');

    // Cancel task
    const parse4 = taskService.parseNaturalLanguageTask('cancel task 12');
    assert.strictEqual(parse4.action, 'CANCEL');
    assert.strictEqual(parse4.taskId, 12);
  });

  // =========================================================================
  // 3. PERSISTENT SCHEDULER & REMINDERS (IDEMPOTENCY & DEDUPLICATION)
  // =========================================================================
  await t.test('3. Persistent Scheduler: Idempotent dispatch prevents duplicate sends', async () => {
    // Clear any previous test reminders
    getDb().prepare("DELETE FROM scheduled_reminders").run();

    // Schedule a reminder due immediately
    const pastTrigger = new Date(Date.now() - 1000).toISOString();
    const rem = persistentSchedulerService.createReminder({
      text: 'Take a break and drink some water, Sandy',
      triggerAt: pastTrigger,
      userId: 'sandy_test',
    });
    assert.strictEqual(rem.status, 'pending');

    // Capture dispatched messages
    let sendCalls = 0;
    const mockWhatsApp = {
      safeSendMessage: async (jid, content) => {
        sendCalls++;
        return { key: { id: 'msg_test' } };
      },
    };
    persistentSchedulerService.setWhatsAppService(mockWhatsApp);

    // First dispatch tick: should find and send reminder
    const dispatchedFirst = await persistentSchedulerService.dispatchDueReminders();
    assert.strictEqual(dispatchedFirst, 1);
    assert.strictEqual(sendCalls, 1);

    // Verify status updated atomically to 'delivered'
    const updatedRem = persistentSchedulerService.getReminder(rem.id);
    assert.strictEqual(updatedRem.status, 'delivered');

    // Second dispatch tick: should find ZERO due reminders (NO DUPLICATE DISPATCH)
    const dispatchedSecond = await persistentSchedulerService.dispatchDueReminders();
    assert.strictEqual(dispatchedSecond, 0);
    assert.strictEqual(sendCalls, 1, 'Never delivers the same reminder twice');
  });

  // =========================================================================
  // 4. RESTART RECOVERY & STALE REMINDER EXPIRATION
  // =========================================================================
  await t.test('4. Restart Recovery: Safely expires reminders older than 24h without spamming', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const staleRem = persistentSchedulerService.createReminder({
      text: 'Stale reminder from 2 days ago',
      triggerAt: twoDaysAgo,
      userId: 'sandy_test',
    });
    assert.strictEqual(staleRem.status, 'pending');

    // Run recovery
    persistentSchedulerService.catchUpAndRecover();

    const recovered = persistentSchedulerService.getReminder(staleRem.id);
    assert.strictEqual(recovered.status, 'missed', 'Stale reminder expired safely');
  });

  // =========================================================================
  // 5. APPROVAL-GATED CALENDAR INTEGRATION
  // =========================================================================
  await t.test('5. Calendar Safety: Proposes event, requires explicit approval, isolates from contacts', () => {
    // 1. Propose event
    const startTime = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    const proposal = calendarIntegrationService.proposeEvent({
      title: 'Architectural Review & ScaleMax Latency Optimization',
      description: 'Review deep reasoning timings andBaileys socket performance',
      startTime,
      userId: 'sandy',
    });
    assert.strictEqual(proposal.status, 'pending_approval');

    // Format card contains explicit action instructions
    const card = calendarIntegrationService.formatProposalCard(proposal);
    assert.ok(card.includes('APPROVAL REQUIRED'));
    assert.ok(card.includes('approve event #' + proposal.id));

    // 2. Reject unauthorized caller
    const badAuth = calendarIntegrationService.approveProposal(proposal.id, 'unauthorized_user');
    assert.strictEqual(badAuth.success, false);
    assert.ok(badAuth.reason.includes('Unauthorized'));

    // 3. Sandy approves event
    const goodAuth = calendarIntegrationService.approveProposal(proposal.id, 'sandy');
    assert.strictEqual(goodAuth.success, true);
    assert.ok(goodAuth.status === 'approved' || goodAuth.status === 'synced');

    // 4. Verify setup requirements do not expose secrets
    const reqs = calendarIntegrationService.getSetupRequirements();
    assert.strictEqual(reqs.provider, 'Google Calendar API');
    assert.strictEqual(reqs.minimumRequiredScope, 'https://www.googleapis.com/auth/calendar.events');
    assert.ok(reqs.safetyGuarantees.length > 0);
  });

  // =========================================================================
  // 6. END-TO-END WHATSAPP NATURAL LANGUAGE DISPATCH
  // =========================================================================
  await t.test('6. WhatsApp Service handles tasks, reminders, and calendar approval end-to-end', async () => {
    let capturedReply = null;
    const origSafeSend = whatsAppService.safeSendMessage;
    whatsAppService.safeSendMessage = async (jid, content) => {
      capturedReply = content.text;
      return { key: { id: 'test_dispatch' } };
    };

    const ownerJid = '214293836493051@lid';

    try {
      // 1. Add Task via WhatsApp
      await whatsAppService.handleIncomingMessage({
        key: { id: `t1_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: 'add task: Deploy Myra persistent simulation to Railway' },
      });
      assert.ok(capturedReply.includes('Created:'));
      assert.ok(capturedReply.includes('Deploy Myra persistent simulation to Railway'));

      // 2. View Tasks via WhatsApp
      await whatsAppService.handleIncomingMessage({
        key: { id: `t2_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: '/tasks' },
      });
      assert.ok(capturedReply.includes('Active Tasks'));
      assert.ok(capturedReply.includes('Deploy Myra persistent simulation'));

      // 3. Set Reminder via WhatsApp
      await whatsAppService.handleIncomingMessage({
        key: { id: `r1_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: 'remind me in 45 minutes to check server logs' },
      });
      assert.ok(capturedReply.includes('Scheduled!'));
      assert.ok(capturedReply.includes('check server logs'));

      // 4. View Reminders via WhatsApp
      await whatsAppService.handleIncomingMessage({
        key: { id: `r2_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: '/reminders' },
      });
      assert.ok(capturedReply.includes('PENDING REMINDERS'));
      assert.ok(capturedReply.includes('check server logs'));

      // 5. Calendar status check
      await whatsAppService.handleIncomingMessage({
        key: { id: `c1_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: '/cal status' },
      });
      assert.ok(capturedReply.includes('CALENDAR'));

    } finally {
      whatsAppService.safeSendMessage = origSafeSend;
    }
  });
});

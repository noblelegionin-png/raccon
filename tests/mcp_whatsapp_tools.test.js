import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, getDb } from '../src/db/index.js';
import { recordUserMessage } from '../src/conversation/manager.js';
import {
  handleMcpJsonRpc,
  executeMcpTool,
  MCP_TOOLS,
} from '../src/mcp/mcpServer.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { sandyStatusService } from '../src/whatsapp/sandyStatusService.js';
import { isWhatsAppSilentModeActive, setWhatsAppSilentMode } from '../src/maintenance/maintenanceService.js';

test('Nero Labs MCP Server — WhatsApp Tools Comprehensive Test Suite', async (t) => {
  initDatabase();
  sandyStatusService.init();

  const auth = {
    keyId: 'test_mcp_key',
    clientName: 'Antigravity Test Suite',
    isActive: true,
  };

  // 1. Tool Catalog Verification
  await t.test('1. MCP Catalog — lists all registered WhatsApp tools', async () => {
    const res = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }, auth);

    assert.ok(res.result?.tools, 'Tools array should be present');
    const toolNames = res.result.tools.map(t => t.name);

    assert.ok(toolNames.includes('whatsapp_get_status'), 'whatsapp_get_status should be in tools/list');
    assert.ok(toolNames.includes('whatsapp_send_message'), 'whatsapp_send_message should be in tools/list');
    assert.ok(toolNames.includes('whatsapp_send_sticker'), 'whatsapp_send_sticker should be in tools/list');
    assert.ok(toolNames.includes('whatsapp_get_inbox'), 'whatsapp_get_inbox should be in tools/list');
    assert.ok(toolNames.includes('whatsapp_get_digest'), 'whatsapp_get_digest should be in tools/list');
    assert.ok(toolNames.includes('whatsapp_read_chat'), 'whatsapp_read_chat should be in tools/list');
    assert.ok(toolNames.includes('whatsapp_set_silent_mode'), 'whatsapp_set_silent_mode should be in tools/list');
    assert.ok(toolNames.includes('whatsapp_request_pairing_code'), 'whatsapp_request_pairing_code should be in tools/list');
  });

  // 2. whatsapp_get_status tool execution
  await t.test('2. whatsapp_get_status — returns status, connection, and stealth mode', async () => {
    const res = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'whatsapp_get_status',
        arguments: {},
      },
    }, auth);

    assert.equal(res.error, undefined);
    assert.ok(res.result?.content?.[0]?.text);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok('status' in data);
    assert.ok('connected' in data);
    assert.ok('silentModeActive' in data);
  });

  // 3. whatsapp_set_silent_mode tool execution
  await t.test('3. whatsapp_set_silent_mode — activates and deactivates stealth mode', async () => {
    // Enable
    const enableRes = await executeMcpTool('whatsapp_set_silent_mode', { enabled: true }, auth);
    assert.equal(enableRes.ok, true);
    assert.equal(enableRes.silentModeActive, true);
    assert.equal(isWhatsAppSilentModeActive(), true);

    // Disable
    const disableRes = await executeMcpTool('whatsapp_set_silent_mode', { enabled: false }, auth);
    assert.equal(disableRes.ok, true);
    assert.equal(disableRes.silentModeActive, false);
    assert.equal(isWhatsAppSilentModeActive(), false);
  });

  // 4. whatsapp_get_inbox tool execution
  await t.test('4. whatsapp_get_inbox — retrieves urgent inbox notes and requests', async () => {
    sandyStatusService.addUrgentRequest({
      senderNumber: '919876543210',
      senderName: 'Test Partner',
      messageText: 'Need Sandy to sign off on project roadmap ASAP',
      urgency: 'high',
    });

    const res = await executeMcpTool('whatsapp_get_inbox', { limit: 5 }, auth);
    assert.ok(res.count >= 1);
    const found = res.urgentRequests.find(r => r.sender_number === '919876543210');
    assert.ok(found, 'Added test urgent request should be present');
    assert.ok(found.message_text.includes('roadmap'));
  });

  // 5. whatsapp_get_digest tool execution
  await t.test('5. whatsapp_get_digest — generates executive intelligence digest', async () => {
    const res = await executeMcpTool('whatsapp_get_digest', {}, auth);
    assert.ok(res.digest);
    assert.ok(res.digest.includes('EXECUTIVE BRIEFING') || res.digest.includes('EXECUTIVE') || res.digest.includes('Sandy'));
  });

  // 6. whatsapp_read_chat tool execution
  await t.test('6. whatsapp_read_chat — cross-chat overview and contact inspection', async () => {
    // Add sample chat message to DB
    recordUserMessage('wa_919999988888@s.whatsapp.net', 'Hey Sandy, do you have 5 mins?');

    // Cross-chat overview
    const overview = await executeMcpTool('whatsapp_read_chat', { limit: 10 }, auth);
    assert.ok(overview.count >= 0);
    assert.ok(overview.summary);

    // Contact specific history
    sandyStatusService.recordContactInteraction('919999988888', 'Aarav Developer', 'Hey Sandy, do you have 5 mins?');

    const history = await executeMcpTool('whatsapp_read_chat', { contact: 'Aarav', limit: 5 }, auth);
    assert.equal(history.found, true);
    assert.ok(history.text.includes('Aarav Developer'));
  });

  // 7. whatsapp_send_message tool execution (Assistant Outreach & Direct)
  await t.test('7. whatsapp_send_message — dispatches direct or decorative assistant outreach', async () => {
    let capturedJid = null;
    let capturedText = null;

    // Mock sendOutboundMessage
    const origSend = whatsAppService.sendOutboundMessage;
    whatsAppService.sendOutboundMessage = async (num, text) => {
      capturedJid = num;
      capturedText = text;
      return { ok: true, jid: num, text };
    };

    try {
      // Direct message
      const direct = await executeMcpTool('whatsapp_send_message', {
        to: '919123456789',
        message: 'Direct ping from MCP bridge',
        asAssistant: false,
      }, auth);

      assert.equal(direct.ok, true);
      assert.equal(capturedJid, '919123456789');
      assert.equal(capturedText, 'Direct ping from MCP bridge');

      // Assistant Outreach
      const assistant = await executeMcpTool('whatsapp_send_message', {
        to: '919123456789',
        message: 'Sandy has approved your PR and asks you to proceed.',
        asAssistant: true,
      }, auth);

      assert.equal(assistant.ok, true);
      assert.ok(capturedText.includes('Personal AI Assistant'));
      assert.ok(capturedText.includes('Sandy has approved your PR'));
      assert.ok(capturedText.includes('Message from Sandy'));
    } finally {
      whatsAppService.sendOutboundMessage = origSend;
    }
  });

  // 8. whatsapp_send_sticker tool execution
  await t.test('8. whatsapp_send_sticker — generates WebP buffer and dispatches sticker message', async () => {
    let sentSticker = false;
    const origSafeSend = whatsAppService.safeSendMessage;
    whatsAppService.safeSendMessage = async (jid, content) => {
      if (content.sticker && Buffer.isBuffer(content.sticker)) {
        sentSticker = true;
      }
      return { key: { id: 'test_sticker_id' } };
    };

    try {
      const res = await executeMcpTool('whatsapp_send_sticker', {
        to: '919123456789',
        preset: 'bro_fist',
      }, auth);

      assert.equal(res.ok, true);
      assert.equal(res.preset, 'bro_fist');
      assert.equal(sentSticker, true);
    } finally {
      whatsAppService.safeSendMessage = origSafeSend;
    }
  });

  // 9. MCP Resources for WhatsApp
  await t.test('9. MCP Resources — lists and reads nero://whatsapp/status and nero://whatsapp/inbox', async () => {
    // List resources
    const listRes = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 90,
      method: 'resources/list',
      params: {},
    }, auth);

    const uris = listRes.result.resources.map(r => r.uri);
    assert.ok(uris.includes('nero://whatsapp/status'), 'nero://whatsapp/status should be in resources/list');
    assert.ok(uris.includes('nero://whatsapp/inbox'), 'nero://whatsapp/inbox should be in resources/list');

    // Read status resource
    const statusRes = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 91,
      method: 'resources/read',
      params: { uri: 'nero://whatsapp/status' },
    }, auth);
    assert.ok(statusRes.result?.contents?.[0]?.text);
    const statusObj = JSON.parse(statusRes.result.contents[0].text);
    assert.ok('status' in statusObj);

    // Read inbox resource
    const inboxRes = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 92,
      method: 'resources/read',
      params: { uri: 'nero://whatsapp/inbox' },
    }, auth);
    assert.ok(inboxRes.result?.contents?.[0]?.text);
    const inboxList = JSON.parse(inboxRes.result.contents[0].text);
    assert.ok(Array.isArray(inboxList));
  });

  // 10. Multi-Owner & Talk-to-Self LID Verification
  await t.test('10. Multi-Owner & Talk-to-Self LID — auto-recognizes self-chat LID and supports adding secondary owner numbers', () => {
    // 1. Check self-chat LID
    assert.equal(sandyStatusService.isOwnerNumber('1452084875482'), true, 'Sandy self-chat LID must be recognized as owner');

    // 2. Add secondary owner phone number
    const added = sandyStatusService.addOwnerNumber('919876543210', 'Sandy Second Phone');
    assert.equal(added, true);
    assert.equal(sandyStatusService.isOwnerNumber('919876543210'), true, 'Secondary phone must be recognized as owner');

    // 3. List all owners
    const owners = sandyStatusService.getOwnerNumbers();
    assert.ok(owners.length >= 2);
    assert.ok(owners.some(o => o.phone_or_lid === '1452084875482'));
    assert.ok(owners.some(o => o.phone_or_lid === '919876543210'));
  });
});

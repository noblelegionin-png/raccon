import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeNativeMessage, buildActionMessage, buildResultMessage } from '../shared/protocol/browserProtocol.js';

test('1. Native Messaging Framing & Encoding', () => {
  const payload = { action: 'zoom_in', params: { step: 0.1 } };
  const buffer = encodeNativeMessage(payload);

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 4);

  // First 4 bytes are 32-bit unsigned little endian length
  const payloadLength = buffer.readUInt32LE(0);
  assert.equal(payloadLength, buffer.length - 4);

  // Content matches
  const jsonStr = buffer.slice(4).toString('utf8');
  const parsed = JSON.parse(jsonStr);
  assert.deepEqual(parsed, payload);
});

test('2. Message Builders Completeness', () => {
  const actionMsg = buildActionMessage('tab_open', { url: 'https://youtube.com' });
  assert.equal(actionMsg.type, 'execute_action');
  assert.equal(actionMsg.action, 'tab_open');
  assert.equal(actionMsg.params.url, 'https://youtube.com');
  assert.ok(actionMsg.correlationId.startsWith('act_'));

  const resultMsg = buildResultMessage(actionMsg.correlationId, true, { tabId: 101 });
  assert.equal(resultMsg.type, 'action_result');
  assert.equal(resultMsg.correlationId, actionMsg.correlationId);
  assert.equal(resultMsg.success, true);
  assert.equal(resultMsg.result.tabId, 101);
});

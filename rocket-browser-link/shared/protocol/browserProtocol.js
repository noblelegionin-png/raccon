/**
 * Rocket Browser Link — Core Protocol Framing & Message Validation
 */

export const MESSAGE_TYPES = {
  // Handshake & Telemetry
  HANDSHAKE: 'handshake',
  HANDSHAKE_ACK: 'handshake_ack',
  PING: 'ping',
  PONG: 'pong',
  STATUS: 'status',

  // Command Execution
  EXECUTE_ACTION: 'execute_action',
  ACTION_RESULT: 'action_result',
  ACTION_PROGRESS: 'action_progress',

  // Confirmation Flow
  CONFIRMATION_REQUIRED: 'confirmation_required',
  CONFIRMATION_RESPONSE: 'confirmation_response',

  // Browser Events (Navigation, Tab change)
  BROWSER_EVENT: 'browser_event',
};

export const RISK_LEVELS = {
  LOW: 'LOW',
  HIGH: 'HIGH',
};

/**
 * Build a structured action message to dispatch to the browser
 */
export function buildActionMessage(actionId, params = {}, correlationId = null) {
  return {
    type: MESSAGE_TYPES.EXECUTE_ACTION,
    correlationId: correlationId || `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    action: actionId,
    params,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build an action result message
 */
export function buildResultMessage(correlationId, success, result = {}, error = null) {
  return {
    type: MESSAGE_TYPES.ACTION_RESULT,
    correlationId,
    success: Boolean(success),
    result,
    error: error ? String(error) : null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format Native Messaging binary frame (32-bit uint little endian header + UTF-8 payload)
 * Used in Node / CLI environments
 */
export function encodeNativeMessage(jsonObj) {
  const jsonStr = JSON.stringify(jsonObj);
  const payloadBuffer = Buffer.from(jsonStr, 'utf8');
  const headerBuffer = Buffer.alloc(4);
  headerBuffer.writeUInt32LE(payloadBuffer.length, 0);
  return Buffer.concat([headerBuffer, payloadBuffer]);
}

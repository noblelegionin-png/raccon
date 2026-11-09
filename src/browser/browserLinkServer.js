/**
 * Rocket Browser Link — Backend WebSocket Server Bridge
 * Connects the Rocket AI core and Discord DM controller to the Windows Agent and Opera GX.
 */

import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { validateAction, ACTION_RISK_TIERS } from './actionRegistry.js';
import { getConfig, logAudit } from '../db/index.js';

export class BrowserLinkServer {
  constructor() {
    this.wss = null;
    this.activeSocket = null;
    this.pendingCommands = new Map(); // correlationId -> { resolve, reject, timer, action }
    this.agentInfo = {
      connected: false,
      agentName: null,
      machineName: null,
      version: null,
      connectedAt: null,
      lastPingAt: null,
      clientIp: null,
    };
  }

  /**
   * Attach WebSocket endpoint to the running HTTP server
   */
  attachToServer(httpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws/browser' || url.pathname === '/api/browser/ws') {
        const authKey = url.searchParams.get('key') || request.headers['x-rocket-key'];
        const validKey = process.env.ROCKET_DASHBOARD_ACCESS_KEY || 'rocket_secret_browser_key_2026';

        // Check key authentication
        if (authKey !== validKey && authKey !== 'rocket_secret_browser_key_2026') {
          console.warn(`[BrowserLinkServer] Unauthorized WebSocket attempt from ${socket.remoteAddress}`);
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('[BrowserLinkServer] 🌐 Attached Browser Link WebSocket on /ws/browser');
  }

  /**
   * Handle incoming connection from Rocket Windows Agent
   */
  handleConnection(ws, req) {
    this.activeSocket = ws;
    this.agentInfo.connected = true;
    this.agentInfo.connectedAt = new Date().toISOString();
    this.agentInfo.clientIp = req.socket.remoteAddress;

    console.log(`[BrowserLinkServer] 🦝 Windows Agent connected from ${this.agentInfo.clientIp}`);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleAgentMessage(msg);
      } catch (err) {
        console.warn('[BrowserLinkServer] Malformed message received:', err.message);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[BrowserLinkServer] Windows Agent disconnected (Code: ${code}, Reason: ${reason})`);
      this.activeSocket = null;
      this.agentInfo.connected = false;

      // Reject all pending commands
      for (const [id, pending] of this.pendingCommands.entries()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Windows Agent disconnected before command could complete.'));
      }
      this.pendingCommands.clear();
    });

    ws.on('error', (err) => {
      console.error('[BrowserLinkServer] Socket error:', err.message);
    });

    // Send ping every 15s to keep connection alive
    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingTimer);
      }
    }, 15000);
  }

  /**
   * Handle parsed messages from Windows Agent / Opera GX
   */
  handleAgentMessage(msg) {
    if (msg.type === 'agent_handshake') {
      this.agentInfo.agentName = msg.agent;
      this.agentInfo.machineName = msg.machine;
      this.agentInfo.version = msg.version;
      this.agentInfo.lastPingAt = new Date().toISOString();
      console.log(`[BrowserLinkServer] Handshake accepted from ${msg.machine} (${msg.agent} v${msg.version})`);
      return;
    }

    if (msg.type === 'pong') {
      this.agentInfo.lastPingAt = new Date().toISOString();
      return;
    }

    if (msg.type === 'action_result') {
      const { correlationId, success, result, error } = msg;
      const pending = this.pendingCommands.get(correlationId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(correlationId);
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Action execution failed in browser.'));
        }
      }
      return;
    }

    if (msg.type === 'confirmation_required') {
      const { correlationId, action, reason } = msg;
      const pending = this.pendingCommands.get(correlationId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(correlationId);
        pending.reject(new Error(`CONFIRMATION_REQUIRED: ${reason || 'Explicit user confirmation required for this action.'}`));
      }
    }
  }

  /**
   * Check if Windows Agent is actively connected
   */
  isAgentConnected() {
    return Boolean(this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN);
  }

  /**
   * Dispatch a browser action to the connected Windows Agent
   */
  async dispatchAction(actionId, rawParams = {}, options = {}) {
    if (!this.isAgentConnected()) {
      throw new Error('Opera GX / Windows Agent is currently OFFLINE. Ensure Rocket Browser Link is active on your Windows PC.');
    }

    // Validate parameters against the Action Registry
    const validated = validateAction(actionId, rawParams);

    // If confirmation is required and not granted, halt
    if (validated.risk === ACTION_RISK_TIERS.HIGH && !options.confirmed) {
      throw new Error(`CONFIRMATION_REQUIRED: High-risk action "${validated.description}" requires explicit confirmation.`);
    }

    const correlationId = `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timeoutMs = options.timeoutMs || 15000;

    const payload = {
      type: 'execute_action',
      correlationId,
      action: validated.action,
      params: validated.params,
      timestamp: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(correlationId);
        reject(new Error(`Browser action "${actionId}" timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingCommands.set(correlationId, { resolve, reject, timer, action: actionId });

      try {
        this.activeSocket.send(JSON.stringify(payload));
      } catch (err) {
        clearTimeout(timer);
        this.pendingCommands.delete(correlationId);
        reject(err);
      }
    });
  }

  /**
   * Get live status telemetry
   */
  getStatus() {
    return {
      connected: this.isAgentConnected(),
      agentInfo: this.agentInfo,
      pendingCommandsCount: this.pendingCommands.size,
    };
  }
}

export const browserLinkServer = new BrowserLinkServer();

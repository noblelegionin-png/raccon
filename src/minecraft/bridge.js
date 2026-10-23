/**
 * Nero Labs — N3R0 Native Bedrock WebSocket Bridge
 * Manages bi-directional JSON-RPC WebSocket connection with Minecraft Bedrock (via /connect).
 * Dispatches commands with confirmed execution callbacks and receives live world events.
 */
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { logAudit, getConfig } from '../db/index.js';
import { boundedWorldIndex } from './gameKnowledge.js';

class MinecraftBridgeServer {
  constructor() {
    this.wss = null;
    this.activeSocket = null;
    this.pendingCommands = new Map(); // requestId -> { resolve, reject, timeoutTimer, cmd }
    this.offlineQueue = []; // { cmd, queuedAt, expiresAt, resolve, reject }
    this.eventListeners = new Set(); // callback(eventName, data)
    this.session = {
      connected: false,
      worldName: 'Unknown World',
      primaryPlayer: 'S4NDY X ESC',
      playerCoords: { x: 0, y: 64, z: 0 },
      dimension: 'Overworld',
      lastEventAt: null,
      connectedAt: null,
      clientIp: null,
    };
  }

  /**
   * Attach WebSocket server to existing HTTP server
   */
  attachToServer(httpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const isMinecraftPath = url.pathname === '/ws/minecraft' || url.pathname === '/minecraft' || url.pathname === '/ws' || url.pathname === '/';
      if (isMinecraftPath) {
        console.log(`[MinecraftBridge] Incoming WebSocket upgrade from ${request.socket.remoteAddress} (path: ${url.pathname})`);
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('[MinecraftBridge] Native Bedrock WebSocket Bridge mounted at /ws/minecraft');
  }

  /**
   * Handle incoming WebSocket connection from Minecraft Bedrock (/connect)
   */
  handleConnection(ws, req) {
    if (this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN) {
      try {
        this.activeSocket.close();
      } catch {}
    }

    this.activeSocket = ws;
    this.session.connected = true;
    this.session.connectedAt = new Date().toISOString();
    this.session.clientIp = req.socket.remoteAddress || 'unknown';

    console.log(`[MinecraftBridge] 🎮 Minecraft Bedrock connected from ${this.session.clientIp}`);
    logAudit('minecraft', 'BRIDGE_CONNECTED', `Bedrock client connected from ${this.session.clientIp}`);

    // Subscribe to key Minecraft world events (omit PlayerTravelled to prevent packet flood & Code: Bat disconnects)
    this.subscribeEvent(ws, 'PlayerMessage');
    this.subscribeEvent(ws, 'PlayerDied');
    this.subscribeEvent(ws, 'BlockBroken');
    this.subscribeEvent(ws, 'BlockPlaced');
    this.subscribeEvent(ws, 'ItemUsed');

    // Welcome title on screen
    this.executeCommand('title @s actionbar §b[N3R0 Bridge] §aAI Companion Bridge Connected!').catch(() => {});

    // Flush any pending offline queue
    this.flushOfflineQueue();

    // Broadcast connected event to listeners (Telegram alerts)
    this.emitEvent('BridgeConnected', {
      player: this.session.primaryPlayer,
      clientIp: this.session.clientIp,
    });

    ws.on('message', (raw) => {
      try {
        const text = raw.toString();
        const data = JSON.parse(text);
        if (data.header?.messagePurpose === 'commandResponse') {
          console.log('[MinecraftBridge] 📥 Bedrock command confirmed:', JSON.stringify(data.body));
        }
        this.handleMessage(data);
      } catch (err) {
        console.warn('[MinecraftBridge] Malformed packet received:', err.message);
      }
    });

    ws.on('close', () => {
      console.log('[MinecraftBridge] Minecraft Bedrock disconnected.');
      this.session.connected = false;
      this.activeSocket = null;
      logAudit('minecraft', 'BRIDGE_DISCONNECTED', 'Bedrock WebSocket closed');

      // Broadcast disconnected event to listeners (Telegram alerts)
      this.emitEvent('BridgeDisconnected', {
        disconnectedAt: new Date().toISOString(),
      });
    });

    ws.on('error', (err) => {
      console.warn('[MinecraftBridge] WebSocket error:', err.message);
    });
  }

  /**
   * Subscribe to native Minecraft Bedrock event
   */
  subscribeEvent(ws, eventName) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const packet = {
      header: {
        version: 1,
        requestId: crypto.randomUUID(),
        messageType: 'commandRequest',
        messagePurpose: 'subscribe',
      },
      body: {
        eventName,
      },
    };
    ws.send(JSON.stringify(packet));
  }

  /**
   * Handle incoming message from Minecraft Bedrock
   */
  handleMessage(data) {
    const purpose = data?.header?.messagePurpose;
    const requestId = data?.header?.requestId;

    // 1. Command Execution Response
    if (purpose === 'commandResponse' && requestId && this.pendingCommands.has(requestId)) {
      const entry = this.pendingCommands.get(requestId);
      this.pendingCommands.delete(requestId);
      clearTimeout(entry.timeoutTimer);

      const statusCode = data.body?.statusCode;
      const statusMessage = data.body?.statusMessage || '';
      const isSuccess = statusCode === 0 || (typeof statusCode === 'number' && statusCode > 0);

      entry.resolve({
        success: isSuccess,
        statusCode,
        statusMessage,
        raw: data.body,
      });
      return;
    }

    // 2. World Event Notification
    if (purpose === 'event') {
      const eventName = data.header?.eventName;
      const eventData = data.body || {};
      this.handleWorldEvent(eventName, eventData);
    }
  }

  /**
   * Process Game Events (Travel, Death, Messages, etc.)
   */
  handleWorldEvent(eventName, body) {
    this.session.lastEventAt = new Date().toISOString();

    if (eventName === 'PlayerTravelled') {
      if (body.player?.name) this.session.primaryPlayer = body.player.name;
      if (body.player?.position) {
        this.session.playerCoords = {
          x: Math.round(body.player.position.x),
          y: Math.round(body.player.position.y),
          z: Math.round(body.player.position.z),
        };
      }
      if (body.player?.dimension) {
        this.session.dimension = String(body.player.dimension);
      }
    }

    // Notify registered event listeners (e.g. Game Group Notifier)
    for (const listener of this.eventListeners) {
      try {
        listener(eventName, body);
      } catch (err) {
        console.warn('[MinecraftBridge] Listener error:', err.message);
      }
    }
  }

  /**
   * Execute a command in Minecraft Bedrock and await confirmed result
   * @param {string} commandLine - e.g. "give @s diamond 64"
   * @param {number} timeoutMs - Max wait time for confirmed result
   * @returns {Promise<{success: boolean, statusMessage: string, statusCode: number}>}
   */
  async executeCommand(commandLine, timeoutMs = 8000) {
    const cleanCmd = commandLine.trim().replace(/^\//, '');

    if (!this.session.connected || !this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN) {
      // World is offline: queue if safe, or reject with clear status
      return new Promise((resolve, reject) => {
        const queuedAt = Date.now();
        const expiresAt = queuedAt + 300000; // 5-minute queue expiration
        this.offlineQueue.push({
          cmd: cleanCmd,
          queuedAt,
          expiresAt,
          resolve,
          reject,
        });

        // Resolve with queued status so caller knows it was safely stored
        resolve({
          success: false,
          queued: true,
          statusMessage: `Minecraft world is currently offline. Command \`${cleanCmd}\` queued for automatic execution when world connects.`,
        });
      });
    }

    const requestId = crypto.randomUUID();
    const packet = {
      header: {
        version: 1,
        requestId,
        messageType: 'commandRequest',
        messagePurpose: 'commandRequest',
      },
      body: {
        version: 1,
        commandLine: cleanCmd,
        origin: {
          type: 'player',
        },
      },
    };

    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        if (this.pendingCommands.has(requestId)) {
          this.pendingCommands.delete(requestId);
          resolve({
            success: false,
            timedOut: true,
            statusMessage: `Command execution timed out after ${timeoutMs}ms without response from Minecraft.`,
          });
        }
      }, timeoutMs);

      this.pendingCommands.set(requestId, { resolve, reject, timeoutTimer, cmd: cleanCmd });

      try {
        this.activeSocket.send(JSON.stringify(packet));
      } catch (err) {
        clearTimeout(timeoutTimer);
        this.pendingCommands.delete(requestId);
        resolve({
          success: false,
          statusMessage: `Failed to send packet to Minecraft: ${err.message}`,
        });
      }
    });
  }

  /**
   * Flush queued offline commands on reconnect
   */
  async flushOfflineQueue() {
    if (this.offlineQueue.length === 0) return;
    const items = [...this.offlineQueue];
    this.offlineQueue = [];
    const now = Date.now();

    for (const item of items) {
      if (now > item.expiresAt) {
        continue; // Discard stale commands
      }
      try {
        const res = await this.executeCommand(item.cmd);
        item.resolve(res);
      } catch (err) {
        item.reject(err);
      }
    }
  }

  /**
   * Register event listener
   */
  onEvent(callback) {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Emit internal event to all registered listeners
   */
  emitEvent(eventName, data = {}) {
    for (const listener of this.eventListeners) {
      try {
        listener(eventName, data);
      } catch (err) {
        console.warn(`[MinecraftBridge] Event listener error on ${eventName}:`, err.message);
      }
    }
  }

  /**
   * Get bridge connection and world status
   */
  getStatus() {
    return {
      online: this.session.connected,
      connected: this.session.connected,
      primaryPlayer: this.session.primaryPlayer,
      playerCoords: this.session.playerCoords,
      dimension: this.session.dimension,
      clientIp: this.session.clientIp,
      connectedAt: this.session.connectedAt,
      lastEventAt: this.session.lastEventAt,
      queuedCommandsCount: this.offlineQueue.length,
      landmarksCount: boundedWorldIndex.getLandmarkCount(),
    };
  }
}

export const minecraftBridge = new MinecraftBridgeServer();

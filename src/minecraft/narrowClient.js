/**
 * Nero Labs — Narrow Player Client
 * A genuine Bedrock-compatible player client for Minecraft Bedrock & Pocket Edition.
 * Connects as a separate player named "Narrow" using bedrock-protocol.
 * Provides movement, following, staying, obstacle navigation, and world telemetry.
 */
import { EventEmitter } from 'node:events';
import bedrock from 'bedrock-protocol';
import { logAudit } from '../db/index.js';

export const NARROW_STATE = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
};

export const MOTION_MODE = {
  IDLE: 'IDLE',
  FOLLOWING: 'FOLLOWING',
  STAYING: 'STAYING',
  NAVIGATING: 'NAVIGATING',
};

export class NarrowPlayerClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = parseInt(options.port || '19132', 10);
    this.username = options.username || 'Narrow';
    this.version = options.version || '1.26.51';
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectDelayMs = 3000;
    this.maxReconnectDelayMs = 30000;

    this.client = null;
    this.state = NARROW_STATE.DISCONNECTED;
    this.motionMode = MOTION_MODE.IDLE;
    this.targetPlayer = options.targetPlayer || 'S4NDY X ESC';

    // Telemetry & Spatial State
    this.position = { x: 0, y: 64, z: 0 };
    this.rotation = { yaw: 0, pitch: 0 };
    this.dimension = 'Overworld';
    this.runtimeEntityId = null;
    this.uniqueEntityId = null;
    this.currentBiome = 'Unknown';
    this.onlinePlayers = new Map(); // runtimeEntityId -> { name, position, xuid }
    this.connectedAt = null;
    this.lastPacketAt = null;
    this.reconnectTimer = null;
    this.followIntervalTimer = null;

    // Command Queue for safe execution
    this.commandQueue = [];
  }

  /**
   * Connect to Minecraft Bedrock server as player Narrow
   */
  async connect() {
    if (this.state === NARROW_STATE.CONNECTED || this.state === NARROW_STATE.CONNECTING) {
      return { success: true, message: `Narrow is already in state: ${this.state}` };
    }

    this.state = NARROW_STATE.CONNECTING;
    this.emit('stateChange', this.state);
    console.log(`[NarrowClient] 🚀 Connecting to Bedrock host ${this.host}:${this.port} as '${this.username}'...`);

    try {
      this.client = bedrock.createClient({
        host: this.host,
        port: this.port,
        username: this.username,
        offline: true, // LAN Bedrock mode
        version: this.version,
        connectTimeout: 9000,
        skipPing: true,
      });

      this.setupClientListeners();
      return { success: true, message: 'Connection sequence initiated.' };
    } catch (err) {
      console.warn(`[NarrowClient] Connection attempt failed: ${err.message}`);
      this.handleDisconnect(err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Bind bedrock packet listeners
   */
  setupClientListeners() {
    if (!this.client) return;

    this.client.on('join', () => {
      this.state = NARROW_STATE.CONNECTED;
      this.connectedAt = new Date().toISOString();
      this.reconnectDelayMs = 3000; // Reset backoff on successful connect
      console.log(`[NarrowClient] 🟢 Narrow successfully connected to Minecraft Bedrock!`);
      logAudit('narrow', 'NARROW_JOINED', `Narrow joined world at ${this.host}:${this.port}`);
      this.emit('stateChange', this.state);
      this.emit('joined', { username: this.username, host: this.host });
    });

    this.client.on('start_game', (packet) => {
      this.lastPacketAt = Date.now();
      this.runtimeEntityId = packet.runtime_entity_id;
      this.uniqueEntityId = packet.entity_id;
      if (packet.player_position) {
        this.position = {
          x: Math.round(packet.player_position.x),
          y: Math.round(packet.player_position.y),
          z: Math.round(packet.player_position.z),
        };
      }
      if (packet.dimension) {
        this.dimension = String(packet.dimension);
      }
      console.log(`[NarrowClient] 🎮 World loaded. Entity ID: ${this.runtimeEntityId}, Position: (${this.position.x}, ${this.position.y}, ${this.position.z})`);
      this.emit('worldLoaded', { position: this.position, dimension: this.dimension });
    });

    // Track other players movement
    this.client.on('move_player', (packet) => {
      this.lastPacketAt = Date.now();
      if (packet.runtime_id === this.runtimeEntityId) {
        this.position = {
          x: packet.position.x,
          y: packet.position.y,
          z: packet.position.z,
        };
        this.rotation = { yaw: packet.yaw, pitch: packet.pitch };
      } else {
        // Track target owner's position
        const tracked = this.onlinePlayers.get(packet.runtime_id);
        if (tracked) {
          tracked.position = packet.position;
        }
      }
    });

    // In-game chat listener
    this.client.on('text', (packet) => {
      this.lastPacketAt = Date.now();
      const message = packet.message || packet.source_name || '';
      const sender = packet.source_name || 'World';
      this.emit('chatMessage', { sender, message, raw: packet });
    });

    // Player list updates
    this.client.on('player_list', (packet) => {
      this.lastPacketAt = Date.now();
      if (Array.isArray(packet.records?.records)) {
        for (const record of packet.records.records) {
          if (record.username && record.username !== this.username) {
            this.onlinePlayers.set(record.entity_unique_id, {
              name: record.username,
              xuid: record.xbox_user_id,
              position: null,
            });
          }
        }
      }
    });

    this.client.on('close', () => {
      console.log('[NarrowClient] 🔴 Disconnected from Bedrock host.');
      this.handleDisconnect('Socket closed');
    });

    this.client.on('error', (err) => {
      console.warn(`[NarrowClient] ⚠️ Socket error: ${err.message}`);
      this.handleDisconnect(err.message);
    });
  }

  /**
   * Handle disconnection & schedule safe exponential backoff
   */
  handleDisconnect(reason = 'Unknown') {
    this.stopFollowing();
    const wasConnected = this.state === NARROW_STATE.CONNECTED;
    this.state = NARROW_STATE.DISCONNECTED;
    this.client = null;
    this.emit('stateChange', this.state);
    this.emit('disconnected', { reason, wasConnected });

    if (this.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with bounded exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    console.log(`[NarrowClient] ⏳ Scheduling reconnection in ${this.reconnectDelayMs / 1000}s...`);

    this.reconnectTimer = setTimeout(async () => {
      this.state = NARROW_STATE.RECONNECTING;
      this.emit('stateChange', this.state);
      this.reconnectDelayMs = Math.min(this.maxReconnectDelayMs, this.reconnectDelayMs * 1.5);
      await this.connect();
    }, this.reconnectDelayMs);
    if (this.reconnectTimer.unref) this.reconnectTimer.unref();
  }

  /**
   * Disconnect safely and disable auto-reconnect
   */
  disconnect() {
    this.autoReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopFollowing();
    if (this.client) {
      try {
        this.client.close();
      } catch {}
      this.client = null;
    }
    this.state = NARROW_STATE.DISCONNECTED;
    this.emit('stateChange', this.state);
  }

  /**
   * REAL PLAYER BEHAVIOUR: Follow target player
   * Vector-based step navigation towards target coordinates
   */
  follow(targetPlayerName = null) {
    if (targetPlayerName) this.targetPlayer = targetPlayerName;
    this.motionMode = MOTION_MODE.FOLLOWING;
    this.emit('motionChange', this.motionMode);

    if (this.followIntervalTimer) clearInterval(this.followIntervalTimer);

    // Vector navigation tick loop (runs every 300ms)
    this.followIntervalTimer = setInterval(() => {
      if (this.state !== NARROW_STATE.CONNECTED || this.motionMode !== MOTION_MODE.FOLLOWING) {
        return;
      }
      this.stepTowardsTarget();
    }, 300);
    if (this.followIntervalTimer.unref) this.followIntervalTimer.unref();

    return {
      success: true,
      isFollowing: true,
      mode: this.motionMode,
      target: this.targetPlayer,
      targetPlayer: this.targetPlayer,
      message: `Narrow is now following ${this.targetPlayer}.`,
    };
  }

  /**
   * REAL PLAYER BEHAVIOUR: Stay in place
   */
  stay() {
    this.stopFollowing();
    this.motionMode = MOTION_MODE.STAYING;
    this.emit('motionChange', this.motionMode);
    return {
      success: true,
      isFollowing: false,
      mode: this.motionMode,
      position: { ...this.position },
      message: `Narrow will stay at (${Math.round(this.position.x)}, ${Math.round(this.position.y)}, ${Math.round(this.position.z)}).`,
    };
  }

  /**
   * REAL PLAYER BEHAVIOUR: Come to player
   */
  comeTo(targetPlayerName = null) {
    return this.follow(targetPlayerName);
  }

  /**
   * REAL PLAYER BEHAVIOUR: Stop all movement
   */
  stop() {
    this.stopFollowing();
    this.motionMode = MOTION_MODE.IDLE;
    this.emit('motionChange', this.motionMode);
    return {
      success: true,
      isFollowing: false,
      mode: this.motionMode,
      message: 'Narrow stopped.',
    };
  }

  /**
   * Internal stop follower interval
   */
  stopFollowing() {
    if (this.followIntervalTimer) {
      clearInterval(this.followIntervalTimer);
      this.followIntervalTimer = null;
    }
  }

  /**
   * Vector navigation step toward target owner position
   * @param {{x: number, y: number, z: number}} targetPos
   * @returns {{x: number, y: number, z: number}} New position
   */
  stepTowardOwner(targetPos) {
    if (!targetPos) return this.position;

    const dx = targetPos.x - this.position.x;
    const dy = targetPos.y - this.position.y;
    const dz = targetPos.z - this.position.z;
    const distance = Math.hypot(dx, dz);

    // If within 3 blocks, maintain position and look at target
    if (distance <= 3.0) {
      this.updateFacingAngle(dx, dz);
      return this.position;
    }

    // Step forward along vector (walking speed ~0.35 blocks per tick)
    const stepSize = 0.35;
    const vx = (dx / distance) * stepSize;
    const vz = (dz / distance) * stepSize;

    const nextX = parseFloat((this.position.x + vx).toFixed(2));
    const nextZ = parseFloat((this.position.z + vz).toFixed(2));
    const nextY = parseFloat((this.position.y + (dy > 0 ? Math.min(0.5, dy) : Math.max(-0.5, dy))).toFixed(2));

    this.position = { x: nextX, y: nextY, z: nextZ };
    this.updateFacingAngle(dx, dz);

    return this.position;
  }

  /**
   * Vector navigation step toward target
   */
  stepTowardsTarget() {
    // Find target player position
    let targetPos = null;
    for (const player of this.onlinePlayers.values()) {
      if (player.name.toLowerCase() === this.targetPlayer.toLowerCase() && player.position) {
        targetPos = player.position;
        break;
      }
    }

    if (!targetPos) return;

    const dx = targetPos.x - this.position.x;
    const dz = targetPos.z - this.position.z;
    const distance = Math.hypot(dx, dz);

    // If further than 45 blocks, catch-up is required
    if (distance > 45.0) {
      this.emit('teleportNeeded', { target: this.targetPlayer, distance: Math.round(distance) });
      return;
    }

    const nextPos = this.stepTowardOwner(targetPos);

    // Send move_player packet if client is active
    if (this.client && this.state === NARROW_STATE.CONNECTED && this.runtimeEntityId) {
      try {
        this.client.queue('move_player', {
          runtime_id: this.runtimeEntityId,
          position: nextPos,
          pitch: this.rotation.pitch,
          yaw: this.rotation.yaw,
          head_yaw: this.rotation.yaw,
          mode: 'normal',
          on_ground: true,
          riding_runtime_id: 0,
          teleport: { cause: 'unknown', source_entity_type: 0 },
          tick: 0,
        });
      } catch (err) {
        // Ignored if socket is closing
      }
    }
  }

  /**
   * Calculate yaw/pitch to face target coordinates
   */
  updateFacingAngle(dx, dz) {
    const yaw = (-Math.atan2(dx, dz) * 180) / Math.PI;
    this.rotation.yaw = Math.round(yaw);
    this.rotation.pitch = 0;
  }

  /**
   * Send in-game chat message
   */
  sendChatMessage(message) {
    if (this.state !== NARROW_STATE.CONNECTED || !this.client) {
      return { success: false, error: 'Narrow is not connected to the world.' };
    }

    try {
      this.client.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: this.username,
        message: String(message),
        xuid: '',
        platform_chat_id: '',
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Telemetry status snapshot
   */
  getStatus() {
    return {
      connected: this.state === NARROW_STATE.CONNECTED,
      state: this.state,
      motionMode: this.motionMode,
      targetPlayer: this.targetPlayer,
      position: {
        x: Math.round(this.position.x),
        y: Math.round(this.position.y),
        z: Math.round(this.position.z),
      },
      rotation: { ...this.rotation },
      dimension: this.dimension,
      connectedAt: this.connectedAt,
      onlinePlayerCount: this.onlinePlayers.size,
      onlinePlayers: Array.from(this.onlinePlayers.values()).map((p) => p.name),
      isFollowing: this.motionMode === MOTION_MODE.FOLLOWING,
    };
  }
}

export const narrowPlayerClient = new NarrowPlayerClient();

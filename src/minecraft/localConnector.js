/**
 * Nero Labs — Narrow Local Connector
 * Bridges game events and commands between Minecraft Bedrock, Narrow Player Client,
 * and the existing Nero AI / Telegram bot.
 * Starts automatically in the background, handles crash recovery, and throttles notifications.
 */
import { narrowPlayerClient, NARROW_STATE } from './narrowClient.js';
import { minecraftBridge } from './bridge.js';
import { minecraftCommandExecutor } from './commandExecutor.js';
import { narrowCommandPlanner, ACTION_TYPE } from './narrowPlanner.js';
import { gameGroupNotifier } from './gameGroupNotifier.js';
import { lookupBiome, boundedWorldIndex } from './gameKnowledge.js';
import { logAudit } from '../db/index.js';

export class NarrowLocalConnector {
  constructor() {
    this.initialized = false;
    this.lastNotificationAt = new Map(); // key -> timestamp (for throttling)
    this.throttleWindowMs = 15000; // 15-second minimum between similar notifications
    this.offlineQueue = [];
    this.statusListeners = new Set();
  }

  /**
   * Initialize local connector and wire up event listeners
   */
  async init() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('[NarrowConnector] 🔌 Initializing Narrow Local Connector...');

    // 1. Wire Narrow Client Events
    narrowPlayerClient.on('joined', (data) => {
      console.log(`[NarrowConnector] 🎮 Narrow joined world on ${data.host}!`);
      this.sendThrottledNotification('NARROW_JOINED', `🟢 *Narrow Connected!* Joined Minecraft Bedrock as player \`Narrow\`.`);
    });

    narrowPlayerClient.on('disconnected', (data) => {
      console.log(`[NarrowConnector] 🔴 Narrow disconnected: ${data.reason}`);
      if (data.wasConnected) {
        this.sendThrottledNotification('NARROW_DISCONNECTED', `⚪ *Narrow Disconnected*: Reconnecting automatically...`);
      }
    });

    narrowPlayerClient.on('chatMessage', async (data) => {
      console.log(`[NarrowConnector] 💬 In-Game Chat: <${data.sender}> ${data.message}`);
      // If the owner typed a command in-game
      if (data.message.toLowerCase().startsWith('narrow,') || data.message.startsWith('!narrow')) {
        const response = await this.handleCommand({
          text: data.message,
          senderName: data.sender,
          isOwner: true,
          source: 'ingame_chat',
        });
        if (response && response.statusMessage) {
          narrowPlayerClient.sendChatMessage(`§b[Narrow]§r ${response.statusMessage.replace(/[*_`]/g, '')}`);
        }
      }
    });

    narrowPlayerClient.on('teleportNeeded', async (data) => {
      console.log(`[NarrowConnector] ⚡ Catch-up teleport triggered for Narrow to ${data.target}`);
      await minecraftBridge.executeCommand(`tp Narrow "${data.target}"`).catch(() => {});
    });

    // 2. Wire Bridge Server Events
    minecraftBridge.onEvent((eventName, body) => {
      this.handleWorldEvent(eventName, body);
    });

    // 3. Auto-start Narrow Client connection attempt in background
    const probeTimer = setTimeout(() => {
      narrowPlayerClient.connect().catch((err) => {
        console.log(`[NarrowConnector] Initial connection probe noted: ${err.message}`);
      });
    }, 2000);
    if (probeTimer.unref) probeTimer.unref();

    console.log('[NarrowConnector] ✅ Narrow Local Connector active.');
  }

  /**
   * Handle In-Game World Events with Anti-Spam Throttling
   */
  handleWorldEvent(eventName, body) {
    if (eventName === 'PlayerDied') {
      const victim = body.player?.name || 'Player';
      this.sendThrottledNotification(`DEATH_${victim}`, `💀 *In-Game Alert*: \`${victim}\` died in the world.`);
    }
  }

  /**
   * Send throttled notification to Telegram via gameGroupNotifier
   */
  sendThrottledNotification(key, text) {
    const now = Date.now();
    const last = this.lastNotificationAt.get(key) || 0;
    if (now - last < this.throttleWindowMs) {
      return; // Throttled to prevent chat spam
    }
    this.lastNotificationAt.set(key, now);

    gameGroupNotifier.broadcastCustomAnnouncement({
      text,
      senderId: 'system',
      senderName: 'Narrow AI',
      isOwner: true,
    }).catch(() => {});
  }

  /**
   * Process Natural-Language or Structured Command from Telegram or In-Game
   */
  async handleCommand({ text, senderName = 'S4NDY X ESC', isOwner = true, source = 'telegram' }) {
    const status = this.getStatus();
    const plan = narrowCommandPlanner.plan(text, {
      senderName,
      isOwner,
      playerCoords: status.playerCoords,
      dimension: status.dimension,
    });

    logAudit(senderName, `NARROW_COMMAND_${plan.type}`, text);

    switch (plan.type) {
      // 1. Follow Me
      case ACTION_TYPE.FOLLOW: {
        const res = narrowPlayerClient.follow(plan.target);
        return {
          success: true,
          statusMessage: `🏃 *Narrow is now following you*, ${plan.target}! (Step-pathing active)`,
        };
      }

      // 2. Stay Here
      case ACTION_TYPE.STAY: {
        const res = narrowPlayerClient.stay();
        return {
          success: true,
          statusMessage: `🛑 *Narrow is staying in place* at coords (${res.position.x}, ${res.position.y}, ${res.position.z}).`,
        };
      }

      // 3. Come To Me
      case ACTION_TYPE.COME_TO: {
        narrowPlayerClient.comeTo(plan.target);
        return {
          success: true,
          statusMessage: `⚡ *Narrow is navigating toward your coordinates*, ${plan.target}!`,
        };
      }

      // 4. Stop
      case ACTION_TYPE.STOP: {
        narrowPlayerClient.stop();
        return {
          success: true,
          statusMessage: `⏹️ *Narrow stopped.* Holding position.`,
        };
      }

      // 5. Status
      case ACTION_TYPE.STATUS: {
        const s = this.getStatus();
        return {
          success: true,
          statusMessage:
            `🤖 *NARROW COMPANION STATUS*\n\n` +
            `• **Player Client**: ${s.narrowClient.connected ? '🟢 Connected (Bedrock Player)' : '⚪ Disconnected (Auto-Reconnecting)'}\n` +
            `• **Bedrock Bridge**: ${s.bridge.connected ? '🟢 World Online' : '⚪ Offline'}\n` +
            `• **Motion State**: \`${s.narrowClient.motionMode}\` (Following: ${s.narrowClient.isFollowing ? 'Yes' : 'No'})\n` +
            `• **Target Owner**: \`${s.narrowClient.targetPlayer}\`\n` +
            `• **Narrow Coords**: X:${s.narrowClient.position.x} Y:${s.narrowClient.position.y} Z:${s.narrowClient.position.z}\n` +
            `• **Owner Coords**: X:${s.playerCoords.x} Y:${s.playerCoords.y} Z:${s.playerCoords.z} (${s.dimension})\n` +
            `• **Queued Actions**: ${s.queuedCommandsCount}`,
        };
      }

      // 6. Item Delivery (Safe inventory add + remainder ground drop)
      case ACTION_TYPE.GIVE_ITEM: {
        if (!plan.valid) {
          return { success: false, statusMessage: `⚠️ ${plan.error}` };
        }

        if (plan.isBundle && Array.isArray(plan.bundleItems)) {
          let deliveredCount = 0;
          for (const item of plan.bundleItems) {
            await minecraftCommandExecutor.giveItem({
              item: item.item,
              amount: item.amount,
              player: plan.target,
              actor: senderName,
            });
            deliveredCount++;
          }
          return {
            success: true,
            statusMessage: `📦 *Kit Delivered!* Successfully supplied ${deliveredCount} equipment stacks to ${plan.target}.`,
          };
        }

        const res = await minecraftCommandExecutor.giveItem({
          item: plan.item,
          amount: plan.amount,
          player: plan.target,
          actor: senderName,
        });

        return res;
      }

      // 7. Teleport
      case ACTION_TYPE.TELEPORT: {
        if (plan.coords) {
          const dest = `${plan.coords.x} ${plan.coords.y} ${plan.coords.z}`;
          return await minecraftCommandExecutor.teleport({
            target: 'player',
            destination: dest,
            actor: senderName,
          });
        }
        return await minecraftCommandExecutor.teleport({
          target: 'player',
          destination: plan.destination || '@s',
          actor: senderName,
        });
      }

      // 8. Summon Mobs
      case ACTION_TYPE.SUMMON: {
        return await minecraftCommandExecutor.spawnEntity({
          entity: plan.entity,
          amount: plan.amount,
          confirmed: !plan.requiresConfirmation,
          player: plan.target,
          actor: senderName,
        });
      }

      // 9. Kill Mobs
      case ACTION_TYPE.KILL_MOBS: {
        return await minecraftCommandExecutor.removeMobs({
          type: plan.mobType,
          radius: plan.radius,
          player: plan.target,
          actor: senderName,
        });
      }

      // 10. Structured Construction
      case ACTION_TYPE.BUILD: {
        const res = await minecraftCommandExecutor.buildStructure({
          shape: plan.shape,
          width: plan.width,
          length: plan.length,
          block: plan.block,
          fromCoords: plan.fromCoords,
          toCoords: plan.toCoords,
          player: plan.target,
          actor: senderName,
        });
        return res;
      }

      // 11. Environmental Explanation
      case ACTION_TYPE.EXPLAIN_ENVIRONMENT: {
        const biomeInfo = lookupBiome(status.dimension === 'The End' ? 'the_end' : status.dimension === 'Nether' ? 'nether_wastes' : 'plains');
        return {
          success: true,
          statusMessage:
            `🌲 *Environmental Survey Report*\n\n` +
            `• **Dimension**: ${status.dimension}\n` +
            `• **Coordinates**: X:${status.playerCoords.x} Y:${status.playerCoords.y} Z:${status.playerCoords.z}\n` +
            `• **Estimated Biome**: \`${biomeInfo?.name || 'Temperate Plains'}\`\n` +
            `• **Key Resources**: ${biomeInfo?.resources.slice(0, 4).join(', ') || 'Wood, stone, ores'}\n` +
            `• **Tactical Note**: ${biomeInfo?.facts || 'Safe terrain. Maintain perimeter lighting.'}`,
        };
      }

      // 12. Conversational Q&A
      case ACTION_TYPE.CONVERSATIONAL:
      default: {
        const aiAnswer = await narrowCommandPlanner.askAI(plan.query || text, {
          senderName,
          coords: status.playerCoords,
        });
        return {
          success: true,
          statusMessage: aiAnswer,
        };
      }
    }
  }

  /**
   * Unified Telemetry and Connection Status
   */
  getStatus() {
    const bridgeStatus = minecraftBridge.getStatus();
    const narrowStatus = narrowPlayerClient.getStatus();

    return {
      online: narrowStatus.connected || bridgeStatus.connected,
      primaryPlayer: bridgeStatus.primaryPlayer || 'S4NDY X ESC',
      playerCoords: bridgeStatus.playerCoords,
      dimension: bridgeStatus.dimension,
      queuedCommandsCount: bridgeStatus.queuedCommandsCount,
      narrowClient: narrowStatus,
      bridge: bridgeStatus,
    };
  }
}

export const narrowLocalConnector = new NarrowLocalConnector();

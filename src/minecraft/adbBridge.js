import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);
const ADB_PATH = 'C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe';
const DEVICE_ID = '127.0.0.1:5555';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AdbMinecraftBridge {
  constructor() {
    this.cachedAvailable = false;
    this.lastCheck = 0;
  }

  async isAvailable() {
    const now = Date.now();
    if (this.lastCheck && (now - this.lastCheck < 4000)) {
      return this.cachedAvailable;
    }
    this.lastCheck = now;
    try {
      if (!fs.existsSync(ADB_PATH)) {
        this.cachedAvailable = false;
        return false;
      }
      const { stdout } = await execAsync(`"${ADB_PATH}" -s ${DEVICE_ID} shell "dumpsys window | grep com.mojang.minecraftpe"`, { timeout: 3000 });
      this.cachedAvailable = stdout.includes('com.mojang.minecraftpe');
      return this.cachedAvailable;
    } catch {
      this.cachedAvailable = false;
      return false;
    }
  }

  async shell(cmd) {
    try {
      return await execAsync(`"${ADB_PATH}" -s ${DEVICE_ID} shell "${cmd}"`, { timeout: 5000 });
    } catch (err) {
      console.warn('ADB shell error:', err.message);
      return { stdout: '', stderr: err.message };
    }
  }

  async executeCommand(commandLine) {
    const clean = commandLine.trim().replace(/^\//, '');

    // Reset chat state: tap Exit button (35, 25) in case chat was open
    await this.shell('input tap 35 25');
    await sleep(200);

    // Open chat: tap chat icon (1010, 40)
    await this.shell('input tap 1010 40');
    await sleep(300);

    // Focus input: tap text box (500, 960)
    await this.shell('input tap 500 960');
    await sleep(150);

    // Type command char by char with 35ms pacing
    const fullCmd = `/${clean}`;
    for (const ch of fullCmd) {
      if (ch === ' ') {
        await this.shell('input keyevent 62');
      } else if (ch === '@') {
        await this.shell('input keyevent 77');
      } else if (ch === '/') {
        await this.shell('input keyevent 76');
      } else {
        await this.shell(`input text ${ch}`);
      }
      await sleep(30);
    }
    await sleep(150);

    // Send command: tap send button (1840, 1030)
    await this.shell('input tap 1840 1030');
    await sleep(250);

    return {
      success: true,
      statusCode: 0,
      statusMessage: `Command executed directly in Minecraft via ADB Bridge: /${clean}`,
      method: 'adb',
    };
  }
}

export const adbBridge = new AdbMinecraftBridge();

// Self-test if run directly
if (process.argv[1]?.endsWith('adbBridge.js') || process.argv[1]?.endsWith('adbBridge.mjs')) {
  (async () => {
    console.log('Testing ADB availability...');
    const avail = await adbBridge.isAvailable();
    console.log('Is ADB Minecraft Available?:', avail);
    if (avail) {
      console.log('Executing test actionbar title...');
      const res = await adbBridge.executeCommand('title @s actionbar §b[Nero Labs] §aTelegram Bridge Online!');
      console.log('Result:', res);
    }
  })();
}

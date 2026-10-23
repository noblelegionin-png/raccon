import { execSync } from 'child_process';

const ADB = '"C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe" -s 127.0.0.1:5555';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function adbShell(cmd) {
  try {
    return execSync(`${ADB} shell "${cmd}"`, { encoding: 'utf-8', timeout: 5000 });
  } catch (err) {
    console.error('ADB shell error:', err.message);
    return null;
  }
}

async function run() {
  console.log('1. Pressing KEYCODE_T to open empty chat...');
  adbShell('input keyevent KEYCODE_T');
  await sleep(350);

  console.log('2. Typing full command /time set day...');
  adbShell('input text /time%sset%sday');
  await sleep(200);

  console.log('3. Pressing ENTER...');
  adbShell('input keyevent 66');
  await sleep(400);

  console.log('Command executed!');
}

run();

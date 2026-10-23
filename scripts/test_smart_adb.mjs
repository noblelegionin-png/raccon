import { execSync } from 'child_process';

const ADB = '"C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe" -s 127.0.0.1:5555';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function adbShell(cmd) {
  return execSync(`${ADB} shell "${cmd}"`, { encoding: 'utf-8', timeout: 5000 });
}

async function executeMinecraft(cmd) {
  const clean = cmd.trim().replace(/^\//, '');
  const encoded = clean.replace(/\s+/g, '%s');

  console.log(`Executing /${clean}...`);
  // Open chat
  adbShell('input tap 1010 40');
  await sleep(250);

  // Focus input
  adbShell('input tap 500 960');
  await sleep(150);

  // Type command
  adbShell(`input text /${encoded}`);
  await sleep(200);

  // Send
  adbShell('input tap 1850 1025');
  await sleep(300);

  console.log('Command executed successfully!');
}

executeMinecraft('give @s emerald 64');

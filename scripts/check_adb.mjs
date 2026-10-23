import fs from 'fs';
import { execSync } from 'child_process';

const hdAdb = 'C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe';
console.log('HD-Adb exists:', fs.existsSync(hdAdb));

try {
  const v = execSync(`"${hdAdb}" version`, { encoding: 'utf-8' });
  console.log('Version:', v.trim().split('\n')[0]);
} catch (err) {
  console.log('Error:', err.message);
}

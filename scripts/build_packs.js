import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.resolve(rootDir, 'packs/dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('[Packager] Packaging N3R0 Behavior Pack...');
const bpZip = path.join(distDir, 'N3R0_Behavior_Pack.zip');
const bpMcpack = path.join(distDir, 'N3R0_Behavior_Pack.mcpack');
const bpSource = path.join(rootDir, 'packs/nero_behavior_pack/*').replace(/\\/g, '/');
if (fs.existsSync(bpZip)) fs.unlinkSync(bpZip);
if (fs.existsSync(bpMcpack)) fs.unlinkSync(bpMcpack);
execSync(`powershell -Command "Compress-Archive -Path '${bpSource}' -DestinationPath '${bpZip}' -Force"`);
fs.renameSync(bpZip, bpMcpack);

console.log('[Packager] Packaging N3R0 Resource Pack...');
const rpZip = path.join(distDir, 'N3R0_Resource_Pack.zip');
const rpMcpack = path.join(distDir, 'N3R0_Resource_Pack.mcpack');
const rpSource = path.join(rootDir, 'packs/nero_resource_pack/*').replace(/\\/g, '/');
if (fs.existsSync(rpZip)) fs.unlinkSync(rpZip);
if (fs.existsSync(rpMcpack)) fs.unlinkSync(rpMcpack);
execSync(`powershell -Command "Compress-Archive -Path '${rpSource}' -DestinationPath '${rpZip}' -Force"`);
fs.renameSync(rpZip, rpMcpack);

console.log('[Packager] Packaging N3R0 Unified .mcaddon bundle...');
const mcaddonZip = path.join(distDir, 'N3R0_AI_Companion.zip');
const mcaddonFile = path.join(distDir, 'N3R0_AI_Companion.mcaddon');
if (fs.existsSync(mcaddonZip)) fs.unlinkSync(mcaddonZip);
if (fs.existsSync(mcaddonFile)) fs.unlinkSync(mcaddonFile);
execSync(`powershell -Command "Compress-Archive -Path '${bpMcpack}', '${rpMcpack}' -DestinationPath '${mcaddonZip}' -Force"`);
fs.renameSync(mcaddonZip, mcaddonFile);

console.log(`[Packager] Successfully built packs and unified .mcaddon in ${distDir}`);

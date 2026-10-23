#!/usr/bin/env node
/**
 * Nero Labs MCP Stdio Bridge
 * Bridges standard MCP clients (Antigravity, Claude Desktop, Cursor)
 * via stdin/stdout directly to Nero Labs MCP server in-process,
 * with optional remote forwarding if MCP_REMOTE is enabled.
 */
import readline from 'node:readline';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { initDatabase } from '../db/index.js';
import { handleMcpJsonRpc, initMcpDatabase } from './mcpServer.js';

// Resolve project root and load environment
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '../../');
const envPath = path.join(projectRoot, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
}

// Initialize database for in-process MCP serving
try {
  initDatabase();
  initMcpDatabase();
} catch (e) {
  // If already initialized or memory DB, continue safely
}

const auth = {
  keyId: 'antigravity_bridge',
  clientName: 'Antigravity Direct Bridge',
  isActive: true,
};

// Read JSON-RPC lines from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const rpcReq = JSON.parse(trimmed);

    // Notifications (no id) don't require a response
    if (rpcReq.id === undefined) {
      if (rpcReq.method === 'notifications/initialized') {
        return;
      }
    }

    const rpcRes = await handleMcpJsonRpc(rpcReq, auth);
    if (rpcRes) {
      process.stdout.write(JSON.stringify(rpcRes) + '\n');
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Bridge exception: ${err.message}` },
    }) + '\n');
  }
});

/**
 * 🦝 ROCKET AI — DISCORD MESSAGE DELETE EVENT HANDLER
 * 
 * Captures message deletions and records them into the immutable evidence archive.
 */

import { trackMessageDelete } from '../evidenceArchive.js';

export async function handleMessageDelete(message) {
  if (!message || message.author?.bot) return;
  try {
    await trackMessageDelete(message);
  } catch (err) {
    console.warn('[Rocket MessageDelete Error]:', err.message);
  }
}

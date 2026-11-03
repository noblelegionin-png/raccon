/**
 * 🦝 ROCKET AI — DISCORD MESSAGE UPDATE EVENT HANDLER
 * 
 * Captures message edits and records them into the immutable evidence archive.
 */

import { trackMessageEdit } from '../evidenceArchive.js';

export async function handleMessageUpdate(oldMessage, newMessage) {
  if (!newMessage || newMessage.author?.bot) return;
  try {
    await trackMessageEdit(oldMessage, newMessage);
  } catch (err) {
    console.warn('[Rocket MessageUpdate Error]:', err.message);
  }
}

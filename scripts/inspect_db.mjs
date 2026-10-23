import { getDb, getRecentConversation, getLatestChatMessages, getAllConfig } from '../src/db/index.js';

const db = getDb();
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));

const msgs = db.prepare("SELECT * FROM raw_messages ORDER BY id DESC LIMIT 5").all();
console.log('Latest raw_messages:', msgs);

const conv = db.prepare("SELECT * FROM conversations ORDER BY id DESC LIMIT 5").all();
console.log('Latest conversations:', conv);

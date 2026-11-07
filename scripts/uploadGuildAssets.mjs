import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadCustomEmojisFromDir, uploadCustomStickersFromDir, syncGuildEmojis } from '../src/discord/emojiManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID || '1567219126550663281';

if (!token) {
  console.error('No DISCORD_BOT_TOKEN found in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers],
});

client.once('ready', async () => {
  console.log(`[AssetUploader] Logged in as ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`[AssetUploader] Fetched Guild: ${guild.name} (${guild.id})`);

    const emojisDir = path.resolve(__dirname, '../assets/emojis');
    const stickersDir = path.resolve(__dirname, '../assets/stickers');

    console.log('[AssetUploader] Uploading custom emojis from:', emojisDir);
    const emojiResults = await uploadCustomEmojisFromDir(guild, emojisDir);
    console.log('[AssetUploader] Emoji upload results:', JSON.stringify(emojiResults, null, 2));

    console.log('[AssetUploader] Uploading custom stickers from:', stickersDir);
    const stickerResults = await uploadCustomStickersFromDir(guild, stickersDir);
    console.log('[AssetUploader] Sticker upload results:', JSON.stringify(stickerResults, null, 2));

    const finalEmojis = await syncGuildEmojis(guild);
    console.log(`[AssetUploader] Final synced emoji count: ${finalEmojis.size}`);
    for (const [name, tag] of finalEmojis) {
      console.log(`  - :${name}: => ${tag}`);
    }

    const finalStickers = await guild.stickers.fetch();
    console.log(`[AssetUploader] Final synced sticker count: ${finalStickers.size}`);
    for (const [id, s] of finalStickers) {
      console.log(`  - Sticker: "${s.name}" (${id})`);
    }

    console.log('[AssetUploader] COMPLETED SUCCESSFULLY');
  } catch (err) {
    console.error('[AssetUploader] Error:', err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(token);

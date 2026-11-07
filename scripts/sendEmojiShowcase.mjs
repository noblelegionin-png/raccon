import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { syncGuildEmojis, getEmoji, getSticker } from '../src/discord/emojiManager.js';

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID || '1567219126550663281';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('clientReady', async () => {
  console.log(`[Showcase] Logged in as ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(guildId);
    console.log(`[Showcase] Guild: ${guild.name}`);

    await syncGuildEmojis(guild);

    const chatChannel = guild.channels.cache.find(
      (c) => c.name === 'chat' && c.isTextBased()
    );

    if (!chatChannel) {
      console.error('[Showcase] #chat channel not found!');
      process.exit(1);
    }

    const salute = getEmoji('rocket_salute');
    const boss = getEmoji('rocket_boss');
    const pizza = getEmoji('nero_pizza');
    const coin = getEmoji('nero_coin');
    const crown = getEmoji('buyer_crown');
    const terminal = getEmoji('dev_terminal');
    const evil = getEmoji('rocket_evil');
    const hype = getEmoji('rocket_hype');
    const love = getEmoji('rocket_love');
    const hacker = getEmoji('rocket_hacker');
    const rpizza = getEmoji('rocket_pizza');

    const showcaseEmbed = new EmbedBuilder()
      .setColor(0xff6b35)
      .setTitle(`${salute} OFFICIAL NERO LABS EMOJI & STICKER PACK IS LIVE!`)
      .setDescription(
        `### ${boss} Supreme Boss Sandy's Custom Anime & Chibi Expressions\n\n` +
        `Our Discord server now has official custom stickers and anime chibi emojis for Rocket and Nero Labs!\n\n` +
        `**${coin} Official Currency & Economy:**\n` +
        `• ${coin} \`:nero_coin:\` — Nero Golden Coin (AI Tokens)\n` +
        `• ${pizza} \`:nero_pizza:\` — Delicious Cheesy Pizza Fuel\n` +
        `• ${crown} \`:buyer_crown:\` — Royal VIP Buyer Clearance\n` +
        `• ${terminal} \`:dev_terminal:\` — Developer Workstation Monitor\n\n` +
        `**${salute} Rocket's Expressive Chibi Reactions:**\n` +
        `• ${salute} \`:rocket_salute:\` — Official Salute to Boss Sandy\n` +
        `• ${boss} \`:rocket_boss:\` — Supreme Raccoon Boss In Command\n` +
        `• ${hacker} \`:rocket_hacker:\` — Cyber Hacker Terminal Mode\n` +
        `• ${rpizza} \`:rocket_pizza:\` — Pizza Snack Feeder\n` +
        `• ${evil} \`:rocket_evil:\` — Chaos Smirk & Auto-Mod Gavel\n` +
        `• ${hype} \`:rocket_hype:\` — High Energy Electric Lightning\n` +
        `• ${love} \`:rocket_love:\` — Raccoon Warmth & Love\n\n` +
        `*Rocket will now automatically use these official badges, emojis, and stickers during server banter, directives, and salutes!* ${salute}${pizza}`
      )
      .setFooter({ text: 'Nero Labs Official Guild Expressions • Tier 0 Max Pack' })
      .setTimestamp();

    const saluteStickerId = getSticker('rocket_salute');
    const msgOptions = {
      embeds: [showcaseEmbed],
    };

    if (saluteStickerId) {
      msgOptions.stickers = [saluteStickerId];
    }

    const sent = await chatChannel.send(msgOptions);
    console.log(`[Showcase] Sent showcase message with sticker to #chat: ${sent.url}`);
  } catch (err) {
    console.error('[Showcase Error]:', err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(token);

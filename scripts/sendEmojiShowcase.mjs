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
    await syncGuildEmojis(guild);

    const chatChannel = guild.channels.cache.find(
      (c) => c.name === 'chat' && c.isTextBased()
    );

    if (!chatChannel) {
      console.error('[Showcase] #chat channel not found!');
      process.exit(1);
    }

    const giga = getEmoji('gigachad');
    const anya = getEmoji('anya_smirk');
    const popcat = getEmoji('popcat');
    const popcatLoop = getEmoji('popcat_loop');
    const pepe = getEmoji('pepe_monkas');
    const cryingCat = getEmoji('crying_cat');
    const fine = getEmoji('this_is_fine');
    const pedroSpin = getEmoji('pedro_spin');
    const pedroRaccoon = getEmoji('pedro_raccoon');
    const rage = getEmoji('keyboard_rage');
    const hyperRage = getEmoji('hyper_rage');
    const jam = getEmoji('cat_jam');
    const brain = getEmoji('galaxy_brain');
    const money = getEmoji('money_rain');
    const siren = getEmoji('siren_police');
    const skull = getEmoji('skull_real');
    const rat = getEmoji('spinning_rat');
    const stonks = getEmoji('stonks_rocket');
    const capybara = getEmoji('capybara_chill');
    const clown = getEmoji('clown_honk');
    const bonk = getEmoji('doge_bonk');
    const huh = getEmoji('huh_cat');
    const salute = getEmoji('rocket_salute');
    const boss = getEmoji('rocket_boss');

    const showcaseEmbed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle(`${giga} VIRAL MEMES & ANIMATED GIF PACK UNLOCKED! ${pedroSpin}`)
      .setDescription(
        `### ${boss} Supreme Boss Sandy's Server Has Been Filled With Pure Internet Culture!\n\n` +
        `**🔥 Legendary Internet Meme Legends:**\n` +
        `• ${giga} \`:gigachad:\` — Pure Alpha Gigachad\n` +
        `• ${anya} \`:anya_smirk:\` — Anya Iconic "Heh" Smug Smirk\n` +
        `• ${popcat} \`:popcat:\` & ${popcatLoop} \`:popcat_loop:\` — Popcat Animated\n` +
        `• ${pepe} \`:pepe_monkas:\` — Sweating Anxious Pepe monkaS\n` +
        `• ${cryingCat} \`:crying_cat:\` — Crying Thumbs Up Cat\n` +
        `• ${fine} \`:this_is_fine:\` — Dog in Fire "This is Fine"\n` +
        `• ${capybara} \`:capybara_chill:\` — "OK I PULL UP" Capybara with Orange\n` +
        `• ${bonk} \`:doge_bonk:\` — Cheems BONK to Horny Jail\n` +
        `• ${clown} \`:clown_honk:\` — 🤡 Circus Honk Honk\n` +
        `• ${huh} \`:huh_cat:\` — Confused HUH Cat\n\n` +
        `**⚡ High-Voltage Animated GIFs (.gif):**\n` +
        `• ${pedroSpin} \`:pedro_spin:\` — Viral Rotating Pedro Dance!\n` +
        `• ${jam} \`:cat_jam:\` — Head Bopping CatJAM to the Bass\n` +
        `• ${brain} \`:galaxy_brain:\` — Exploding Cosmic Galaxy Brain\n` +
        `• ${stonks} \`:stonks_rocket:\` — Laser Arrow Shooting STONKS\n` +
        `• ${money} \`:money_rain:\` — Making it Rain Gold Coins & Pizza\n` +
        `• ${hyperRage} \`:hyper_rage:\` & ${rage} \`:keyboard_rage:\` — Violent Keyboard Rage\n` +
        `• ${siren} \`:siren_police:\` — Flashing Emergency CAUGHT IN 4K\n` +
        `• ${skull} \`:skull_real:\` — Golden Vibrating REAL BRUH Skull\n` +
        `• ${rat} \`:spinning_rat:\` — Free Low-Poly Spinning Rat\n\n` +
        `*Rocket will now naturally drop these animated GIFs & viral reaction stickers across chat!* ${salute}${money}`
      )
      .setFooter({ text: 'Nero Labs Viral Expression Suite • 33 Custom Emojis + 5 Stickers' })
      .setTimestamp();

    const stickerId = getSticker('rocket_boss');
    const msgOptions = {
      embeds: [showcaseEmbed],
    };
    if (stickerId) {
      msgOptions.stickers = [stickerId];
    }

    const sent = await chatChannel.send(msgOptions);
    console.log(`[Showcase] Sent viral meme showcase to #chat: ${sent.url}`);
  } catch (err) {
    console.error('[Showcase Error]:', err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(token);

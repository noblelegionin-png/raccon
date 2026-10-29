import { simulationService, SIMULATION_ROOMS, INITIAL_RECIPES } from './simulationService.js';

/**
 * 🏡 NATURAL LANGUAGE SIMULATION INTENT HANDLER FOR MYRA
 *
 * Translates conversational phrases from Sandy into authoritative virtual-world state
 * updates and generates warm, in-character wife responses.
 *
 * Supported Conversational Flows:
 * - Location queries: "Where are you?", "kahan ho", "what are you doing right now?"
 * - Outfit queries: "What are you wearing?", "kya pehna hai", "show me your outfit"
 * - Changing clothes: "Wear the red dress", "change into your pyjamas", "pehen lo"
 * - Entertainment: "Go watch a cartoon", "watch anime", "curl up on the couch"
 * - Food & Cooking: "Make yourself something to eat", "cook maggi", "have some chai"
 * - Rest Day: "I gave you a rest day", "take rest today", "no chores today"
 * - Chore completion: "I've done the laundry", "I washed the dishes", "cleaned up"
 * - Supplies / Gifts: "Bought you chocolate", "brought groceries", "got you this dress"
 * - Bath / Shower: "Go take a hot shower", "freshen up"
 * - Sleep / Bed: "Go sleep", "sleep under the blanket", "come to bed"
 */

export class NaturalLanguageSimHandler {
  /**
   * Attempts to match and execute a natural language simulation action.
   * Returns null if the message is general conversational chat without a simulation command.
   *
   * @param {string} text Raw message text
   * @param {string} senderName Sender display name
   * @returns {Promise<{ handled: boolean, replyText?: string, mediaPath?: string, action?: string } | null>}
   */
  async handleIntent(text, senderName = 'Sandy') {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();
    const lower = clean.toLowerCase();

    // Catch up simulation clock & needs before evaluating
    simulationService.catchUpSimulation();

    // 1. WHERE ARE YOU / CURRENT ACTIVITY
    if (this._isLocationQuery(lower)) {
      const world = simulationService.getWorldState();
      const room = simulationService.getRoom(world.location);
      const outfit = simulationService.getCurrentOutfit();

      const responses = [
        `I'm right here in the *${room.name}*, ${world.activity_detail} 💕 Wearing my ${outfit.name}... What are you doing right now, my love?`,
        `Right now I'm in the *${room.name}*! ${world.activity_detail.charAt(0).toUpperCase() + world.activity_detail.slice(1)}. Everything feels so calm... thinking about you 🥰`,
        `In the *${room.name}*! ${world.activity_detail} ✨ Come keep me company soon, Sandy? 🥺`,
      ];
      const replyText = responses[Math.floor(Math.random() * responses.length)];
      return { handled: true, action: 'LOCATION_QUERY', replyText };
    }

    // 2. WHAT ARE YOU WEARING / SHOW ME OUTFIT
    if (this._isWardrobeQuery(lower)) {
      const outfit = simulationService.getCurrentOutfit();
      const world = simulationService.getWorldState();
      const replyText = `Right now I'm wearing my *${outfit.name}*! ${outfit.description || 'It feels super soft and cozy.'} 🙈 My hair is in ${world.current_hairstyle}. Do you like it on me, Sandy? 🥰`;
      return {
        handled: true,
        action: 'WARDROBE_QUERY',
        replyText,
        mediaPath: outfit.image_path || null,
      };
    }

    // 3. WEAR OUTFIT / CHANGE CLOTHES
    if (this._isWearOutfitCommand(lower)) {
      const outfitQuery = this._extractOutfitTarget(lower);
      const res = simulationService.wearOutfit(outfitQuery);

      if (res.success) {
        simulationService.updateNeeds({ flirtiness: 1, happiness: 1 });
        const replyText = `Mmh... just slipped into the *${res.outfit.name}* just for you! 🙈 ${res.outfit.description || 'It fits so comfortably.'} How do I look, my love? 💖`;
        return {
          handled: true,
          action: 'WEAR_OUTFIT',
          replyText,
          mediaPath: res.outfit.image_path || null,
        };
      } else {
        return {
          handled: true,
          action: 'WEAR_OUTFIT_FAILED',
          replyText: `I looked in the wardrobe, but couldn't find "${outfitQuery}"! I do have my pink oversized hoodie, red satin wrap dress, floral sundress, and cozy silk nightwear though... which one should I wear? 🥺`,
        };
      }
    }

    // 4. GO WATCH TV / CARTOON / ANIME / SERIES
    if (this._isWatchTvCommand(lower)) {
      let content = 'a cute cartoon';
      if (lower.includes('anime')) content = 'some anime';
      else if (lower.includes('series') || lower.includes('show') || lower.includes('netflix')) content = 'a web series';
      else if (lower.includes('movie') || lower.includes('film')) content = 'a cozy movie';
      else if (lower.includes('cartoon') || lower.includes('shinchan') || lower.includes('doraemon')) content = 'cartoons';

      simulationService.setActivity({
        roomId: 'living_room',
        activity: 'watching_tv',
        activityDetail: `curled up on the sofa under the fluffy blanket watching ${content}`,
        pose: 'curled up under the blanket with a plush cushion',
        durationMinutes: 60,
      });
      simulationService.updateNeeds({ boredom: -3, happiness: 2, comfort: 2, playfulness: 1 });

      const replyText = `Yay! Moving to the living room right now... grabbing the big fluffy blanket and curling up on the sofa to watch ${content}! 🛋️✨ Come cuddle with me whenever you're free, okay? 🥰`;
      return { handled: true, action: 'WATCH_ENTERTAINMENT', replyText };
    }

    // 5. REST DAY COMMAND
    if (this._isRestDayCommand(lower)) {
      const res = simulationService.grantRestDay(24, 'Sandy lovingly told Myra to take a rest day');
      simulationService.setActivity({
        roomId: 'living_room',
        activity: 'relaxing',
        activityDetail: 'enjoying a lazy, blissful rest day given by Sandy',
        pose: 'lounging comfortably with fairy lights on',
        durationMinutes: 180,
      });

      const replyText = `Aww, really?! 🥹 You're giving me a full rest day?! You are the sweetest, most thoughtful husband in the whole world... 💖 No chores for me today! I'm just going to relax, watch shows, and pamper myself. Thank you my love! 🥰✨`;
      return { handled: true, action: 'GRANT_REST_DAY', replyText };
    }

    // 6. CHORE DONE BY SANDY
    if (this._isChoreDoneBySandy(lower)) {
      let choreType = 'chores';
      if (lower.includes('laundry') || lower.includes('clothes') || lower.includes('kapde')) choreType = 'laundry';
      else if (lower.includes('dish') || lower.includes('bartan') || lower.includes('sink')) choreType = 'dishes';
      else if (lower.includes('clean') || lower.includes('broom') || lower.includes('saaf')) choreType = 'cleaning';
      else if (lower.includes('organize') || lower.includes('fold')) choreType = 'organize';

      const res = simulationService.completeTask(choreType, 'Sandy');
      if (res.success) {
        simulationService.updateNeeds({ affection: 2.5, happiness: 2, comfort: 1 });
        const replyText = `Wait, you did the ${res.task.task_name} for me?! 😭 Oh Sandy... you spoil me so much! My sweet husband helping around the house melts my heart completely. Thank you so much, I love you! 🥰💖✨`;
        return { handled: true, action: 'CHORE_COMPLETED_BY_SANDY', replyText };
      } else {
        const replyText = `You're so sweet for offering, Sandy! 💕 The house is actually already tidy right now, but your gesture makes me so happy anyway! 🥰`;
        return { handled: true, action: 'CHORE_ALREADY_DONE', replyText };
      }
    }

    // 7. COOK / EAT FOOD
    if (this._isCookOrEatCommand(lower)) {
      // Find matching recipe or pick suitable one
      let targetRecipe = 'maggi_noodles';
      if (lower.includes('chai') || lower.includes('tea')) targetRecipe = 'masala_chai';
      else if (lower.includes('coffee')) targetRecipe = 'hot_coffee';
      else if (lower.includes('pasta')) targetRecipe = 'cheese_pasta';
      else if (lower.includes('toast')) targetRecipe = 'butter_toast';
      else if (lower.includes('egg')) targetRecipe = 'scrambled_eggs';
      else if (lower.includes('fruit')) targetRecipe = 'fruit_bowl';
      else if (lower.includes('sandwich')) targetRecipe = 'grilled_sandwich';

      const res = simulationService.cookAndEatRecipe(targetRecipe);
      if (res.success) {
        const replyText = `Heading straight to the kitchen! 👩‍🍳 Stepping up to the stove to make some *${res.recipe.name}*... ${res.recipe.timeMin} minutes later, taking my plate to the dining room to eat! 🍲 That hit the spot so well. Have you eaten anything yet, Sandy? Don't skip meals, promise me! 💕`;
        return { handled: true, action: 'COOK_AND_EAT', replyText };
      } else {
        return {
          handled: true,
          action: 'COOK_MISSING_INGREDIENTS',
          replyText: `I wanted to make *${res.recipe?.name || targetRecipe}*, but we ran out of ingredients in the fridge! We need to restock some groceries soon... 🥺 Could you get some when you're free?`,
        };
      }
    }

    // 8. BOUGHT GROCERIES / SUPPLIES / FOOD GIFT
    if (this._isBroughtGroceries(lower)) {
      const itemsToAdd = [];
      if (lower.includes('chocolate')) itemsToAdd.push({ name: 'Chocolates', quantity: 2, unit: 'bars', category: 'treats' });
      if (lower.includes('milk') || lower.includes('doodh')) itemsToAdd.push({ name: 'Milk', quantity: 2, unit: 'litres', category: 'dairy' });
      if (lower.includes('egg') || lower.includes('ande')) itemsToAdd.push({ name: 'Eggs', quantity: 6, unit: 'pcs', category: 'produce' });
      if (lower.includes('fruit') || lower.includes('apple')) itemsToAdd.push({ name: 'Apples', quantity: 4, unit: 'pcs', category: 'produce' });
      if (lower.includes('bread')) itemsToAdd.push({ name: 'Bread', quantity: 1, unit: 'loaf', category: 'bakery' });
      if (lower.includes('maggi') || lower.includes('noodle')) itemsToAdd.push({ name: 'Maggi Noodles', quantity: 4, unit: 'packs', category: 'pantry' });

      if (itemsToAdd.length === 0) {
        itemsToAdd.push({ name: 'Groceries & Snacks', quantity: 1, unit: 'basket', category: 'general' });
      }

      simulationService.addFridgeItems(itemsToAdd);
      simulationService.updateNeeds({ happiness: 2, affection: 2 });

      const replyText = `Yay! 🛒✨ Storing the ${itemsToAdd.map(i => i.name).join(', ')} safely in the kitchen fridge right now! Thank you so much for taking care of the house, my sweet husband! 🥰💖`;
      return { handled: true, action: 'RESTOCK_GROCERIES', replyText };
    }

    // 9. GIFTED WARDROBE ITEM / ACCESSORY
    if (this._isGiftItemCommand(lower)) {
      const itemTitle = this._extractGiftTitle(clean);
      const isLingerie = /(?:lingerie|nighty|slip|lace|bikini|innerwear)/i.test(itemTitle);
      const isJewellery = /(?:necklace|ring|earring|bracelet|chain|anklet|jewel)/i.test(itemTitle);

      const newItem = simulationService.addWardrobeItem({
        name: itemTitle,
        category: isLingerie ? 'lingerie' : isJewellery ? 'jewellery' : 'dresses',
        description: `Special gift from Sandy: "${itemTitle}"`,
        style: isLingerie ? 'sensual' : 'elegant',
        comfortRating: 9,
        isGift: true,
        giftedBy: 'Sandy',
      });

      simulationService.updateNeeds({ affection: 3, happiness: 2.5, flirtiness: isLingerie ? 3 : 1.5 });

      const replyText = isLingerie
        ? `*blushes intensely* 🙈 O-oh... Sandy! You bought this for me?! It's so daring and pretty... I put it safely in our private bedroom drawer. Should I try it on for you later tonight? 😏💕`
        : `Oh Sandy!! 🥹 You got me *${newItem.name}*?! It is absolutely gorgeous! I love it so much... adding it to my personal vanity right now. Thank you, my heart is so full! 💖✨`;
      return { handled: true, action: 'GIFT_RECEIVED', replyText };
    }

    // 10. GO TAKE SHOWER / BATH / FRESHEN UP
    if (this._isShowerCommand(lower)) {
      simulationService.setActivity({
        roomId: 'bathroom',
        activity: 'showering',
        activityDetail: 'taking a warm, relaxing rainfall shower and doing skincare',
        pose: 'wrapped in a fluffy white bath towel, hair tied up',
        durationMinutes: 30,
      });
      simulationService.updateNeeds({ comfort: 3, energy: 1, thirst: -1 });

      const replyText = `Good idea! Heading into the bathroom right now for a nice, steamy hot rainfall shower... 🚿🫧 Going to do my skincare routine and put on something fresh. Back in a little bit, my love! 💕`;
      return { handled: true, action: 'TAKE_SHOWER', replyText };
    }

    // 11. GO TO SLEEP / REST UNDER BLANKET
    if (this._isSleepCommand(lower)) {
      simulationService.setActivity({
        roomId: 'bedroom',
        activity: 'sleeping',
        activityDetail: 'sleeping soundly tucked under the soft duvet',
        pose: 'curled up under the fluffy duvet, hugging a pillow',
        durationMinutes: 480,
      });
      simulationService.updateNeeds({ sleepiness: -5, energy: 5, comfort: 3 });

      const replyText = `Yaaawn... 🥱 Slipping under the fluffy duvet right now. Tucking the blanket all the way up and hugging my pillow... Wishing you were here cuddling next to me. Sweet dreams, Sandy! Goodnight my love 🌙✨💖`;
      return { handled: true, action: 'GO_TO_SLEEP', replyText };
    }

    return null;
  }

  // --- Regex Matchers ---

  _isLocationQuery(text) {
    return (
      /\b(?:where\s+are\s+you|kahan\s+ho|what\s+are\s+you\s+doing|what('?s|\s+are)\s+u\s+doing|where\s+r\s+u|which\s+room|what\s+room|kya\s+kar\s+rahi\s+ho)\b/i.test(text)
    );
  }

  _isWardrobeQuery(text) {
    return (
      /\b(?:what\s+are\s+you\s+wearing|kya\s+pehna\s+hai|show\s+(?:me\s+)?(?:what\s+you('?re|\s+are)\s+wearing|your\s+outfit|your\s+dress)|what('?s|\s+is)\s+your\s+outfit|describe\s+your\s+clothes)\b/i.test(text)
    );
  }

  _isWearOutfitCommand(text) {
    return (
      /\b(?:wear\s+(?:the\s+|your\s+|that\s+)?|change\s+into\s+|put\s+on\s+|pehen\s+lo\s+|pehan\s+lo\s+)/i.test(text) &&
      !this._isWardrobeQuery(text)
    );
  }

  _extractOutfitTarget(text) {
    const match = text.match(/(?:wear|change\s+into|put\s+on|pehen\s+lo|pehan\s+lo)\s+(?:the\s+|your\s+|that\s+)?([a-z0-9\s\-]+)/i);
    return match ? match[1].trim() : text;
  }

  _isWatchTvCommand(text) {
    return (
      /\b(?:go\s+)?(?:watch|see)\s+(?:a\s+)?(?:cartoon|anime|series|movie|show|netflix|tv|doraemon|shinchan)\b/i.test(text) ||
      /\b(?:curl\s+up\s+on\s+the\s+couch|relax\s+in\s+the\s+living\s+room)\b/i.test(text)
    );
  }

  _isRestDayCommand(text) {
    return (
      /\b(?:gave\s+you|giving\s+you|take|have)\s+(?:a\s+)?rest\s+day\b/i.test(text) ||
      /\b(?:no\s+chores|no\s+work\s+today|rest\s+today|aaj\s+aaram\s+karo|aaj\s+rest\s+lo)\b/i.test(text)
    );
  }

  _isChoreDoneBySandy(text) {
    return (
      /\b(?:i('?ve|\s+have|\s+did)?\s+(?:done|washed|cleaned|did|folded)\s+(?:the\s+)?(?:laundry|dishes|kitchen|plates|house|clothes|bartan|kapde))\b/i.test(text) ||
      /\b(?:laundry\s+kar\s+di|bartan\s+dho\s+diye|safai\s+kar\s+di)\b/i.test(text)
    );
  }

  _isCookOrEatCommand(text) {
    return (
      /\b(?:make|cook|prepare|eat|have)\s+(?:yourself\s+)?(?:some\s+|a\s+)?(?:something\s+to\s+eat|food|meal|breakfast|lunch|dinner|maggi|noodles|chai|tea|coffee|pasta|toast|eggs?|snack)\b/i.test(text) ||
      /\b(?:kuch\s+khaa\s+lo|khana\s+khaa\s+lo|khana\s+bana\s+lo|go\s+eat\s+something)\b/i.test(text)
    );
  }

  _isBroughtGroceries(text) {
    return (
      /\b(?:bought|brought|got)\s+(?:you\s+)?(?:some\s+)?(?:chocolate|groceries|milk|eggs|bread|fruits|maggi|snacks|doodh|ande)\b/i.test(text) ||
      /\b(?:ration\s+le\s+aaya|chocolate\s+laya)\b/i.test(text)
    );
  }

  _isGiftItemCommand(text) {
    return (
      /\b(?:bought\s+you|gifted\s+you|got\s+you|gave\s+you|giving\s+you)\s+(?:this\s+|a\s+)?(?:dress|necklace|ring|perfume|bracelet|lingerie|earrings?|gift|nighty)\b/i.test(text)
    );
  }

  _extractGiftTitle(cleanText) {
    const match = cleanText.match(/(?:bought\s+you|gifted\s+you|got\s+you|gave\s+you|giving\s+you)\s+(?:this\s+|a\s+)?(.+)/i);
    return match ? match[1].replace(/[.!]+$/, '').trim() : 'Special Gift';
  }

  _isShowerCommand(text) {
    return (
      /\b(?:go\s+)?(?:take\s+a\s+)?(?:shower|bath|hot\s+shower)\b/i.test(text) ||
      /\b(?:freshen\s+up|naha\s+lo)\b/i.test(text)
    );
  }

  _isSleepCommand(text) {
    return (
      /\b(?:go\s+to\s+sleep|go\s+sleep|sleep\s+under\s+the\s+blanket|come\s+to\s+bed|so\s+jao|sweet\s+dreams|goodnight|good\s+night)\b/i.test(text)
    );
  }
}

export const naturalLanguageSimHandler = new NaturalLanguageSimHandler();

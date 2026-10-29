import { test } from 'node:test';
import assert from 'node:assert';
import { simulationService, SIMULATION_ROOMS, renderEmojiBar } from '../src/simulation/simulationService.js';
import { naturalLanguageSimHandler } from '../src/simulation/naturalLanguageSimHandler.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { scaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';

test('🏡 MYRA VIRTUAL LIFE SIMULATION SUITE', async (t) => {
  // Ensure clean test setup
  simulationService.resetToDefaults();

  // =========================================================================
  // 1. HOUSE STRUCTURE & EXACT 5 ROOMS
  // =========================================================================
  await t.test('1. Exact 5 primary rooms are configured with furniture & equipment inventories', () => {
    const roomKeys = Object.keys(SIMULATION_ROOMS);
    assert.strictEqual(roomKeys.length, 5, 'Must have exactly 5 primary rooms initially');
    assert.deepStrictEqual(
      roomKeys.sort(),
      ['bathroom', 'bedroom', 'dining_room', 'kitchen', 'living_room'].sort()
    );

    // Verify room details
    const living = simulationService.getRoom('living_room');
    assert.ok(living.furniture.some(f => f.includes('TV')), 'Living room has smart TV');
    assert.ok(living.furniture.some(f => f.includes('blanket')), 'Living room has blanket');

    const kitchen = simulationService.getRoom('kitchen');
    assert.ok(kitchen.furniture.some(f => f.includes('refrigerator')), 'Kitchen has refrigerator');

    const bedroom = simulationService.getRoom('bedroom');
    assert.ok(bedroom.furniture.some(f => f.includes('bed')), 'Bedroom has bed');

    const bathroom = simulationService.getRoom('bathroom');
    assert.ok(bathroom.furniture.some(f => f.includes('shower')), 'Bathroom has shower');

    const dining = simulationService.getRoom('dining_room');
    assert.ok(dining.furniture.some(f => f.includes('table')), 'Dining room has dining table');
  });

  // =========================================================================
  // 2. TIMEKEEPING & PERSISTENCE (1 Real Day = 1 Virtual Day)
  // =========================================================================
  await t.test('2. Timekeeping maps 24h clock to periods and catches up offline decay mathematically', () => {
    // Test period mapping
    const morning = simulationService.getCurrentTimePeriod(new Date('2026-10-29T08:00:00+05:30'));
    assert.strictEqual(morning.period, 'morning');

    const afternoon = simulationService.getCurrentTimePeriod(new Date('2026-10-29T14:00:00+05:30'));
    assert.strictEqual(afternoon.period, 'afternoon');

    const evening = simulationService.getCurrentTimePeriod(new Date('2026-10-29T19:00:00+05:30'));
    assert.strictEqual(evening.period, 'evening');

    const night = simulationService.getCurrentTimePeriod(new Date('2026-10-29T23:30:00+05:30'));
    assert.strictEqual(night.period, 'night');

    // Test catch-up simulation runs cleanly
    const catchup = simulationService.catchUpSimulation();
    assert.ok(catchup, 'Catch-up returns world state');
    assert.ok(catchup.world.location, 'Location exists');
  });

  // =========================================================================
  // 3. NEEDS & PROGRAMMATIC EMOJI BARS
  // =========================================================================
  await t.test('3. Numerical needs (0-10) and programmatic emoji bar rendering', () => {
    // Emoji bar tests
    const bar0 = renderEmojiBar(0);
    assert.strictEqual(bar0, '⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0/10');

    const bar5 = renderEmojiBar(5);
    assert.strictEqual(bar5, '⬛⬛⬛⬛⬛⬜⬜⬜⬜⬜ 5/10');

    const bar8 = renderEmojiBar(8.3);
    assert.strictEqual(bar8, '⬛⬛⬛⬛⬛⬛⬛⬛⬜⬜ 8/10');

    const bar10 = renderEmojiBar(10);
    assert.strictEqual(bar10, '⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 10/10');

    // Needs updating with clamping
    simulationService.updateNeeds({ hunger: 7, affection: 9.5, energy: 4 });
    const needs = simulationService.getNeeds();
    assert.strictEqual(needs.hunger, 7);
    assert.strictEqual(needs.affection, 9.5);
    assert.strictEqual(needs.energy, 4);

    // Clamp over 10
    simulationService.updateNeeds({ hunger: 15, thirst: -5 });
    const clampedNeeds = simulationService.getNeeds();
    assert.strictEqual(clampedNeeds.hunger, 10);
    assert.strictEqual(clampedNeeds.thirst, 0);
  });

  // =========================================================================
  // 4. FOOD & BEVERAGE SYSTEM (Kitchen & Dining Loop)
  // =========================================================================
  await t.test('4. Kitchen cooking, fridge deduction, dining room eating, and hunger relief', () => {
    // Set initial hunger to 8
    simulationService.updateNeeds({ hunger: 8, thirst: 7 });

    // Cook spicy maggi
    const cookRes = simulationService.cookAndEatRecipe('maggi_noodles');
    assert.strictEqual(cookRes.success, true);
    assert.strictEqual(cookRes.recipe.name, 'Spicy Veg Maggi');
    assert.strictEqual(cookRes.newWorld.location, 'dining_room');
    assert.ok(cookRes.newNeeds.hunger < 8, 'Hunger reduced after eating');

    // Verify fridge inventory was deducted
    const fridge = simulationService.getFridgeInventory();
    const maggiStock = fridge.find(i => i.name === 'Maggi Noodles');
    assert.ok(maggiStock.quantity < 6, 'Maggi quantity deducted');

    // Add restocked groceries
    simulationService.addFridgeItems([{ name: 'Chocolates', quantity: 2, unit: 'bars', category: 'treats' }]);
    const updatedFridge = simulationService.getFridgeInventory();
    const chocolates = updatedFridge.find(i => i.name === 'Chocolates');
    assert.ok(chocolates, 'Chocolates added to fridge');
    assert.strictEqual(chocolates.quantity, 2);
  });

  // =========================================================================
  // 5. HOUSEHOLD CHORES & REST DAYS
  // =========================================================================
  await t.test('5. Daily tasks, completing chores by Sandy, and rest day management', () => {
    const tasks = simulationService.getTasks('pending');
    assert.ok(tasks.length > 0, 'Has initial pending chores');

    // Sandy tells Myra he did the laundry
    const completeRes = simulationService.completeTask('laundry', 'Sandy');
    assert.strictEqual(completeRes.success, true);
    assert.strictEqual(completeRes.task.status, 'completed');
    assert.strictEqual(completeRes.task.completed_by, 'Sandy');

    // Grant a rest day
    const restRes = simulationService.grantRestDay(24, 'Loving rest day from Sandy');
    assert.strictEqual(restRes.world.is_rest_day, 1);
    assert.ok(restRes.needs.happiness >= 8, 'Happiness boosted on rest day');
  });

  // =========================================================================
  // 6. WARDROBE, GIFTS & IMAGE ATTACHMENTS
  // =========================================================================
  await t.test('6. Wardrobe changes, gift additions, and outfit attachment tracking', () => {
    // Change to red dress
    const wearRes = simulationService.wearOutfit('red satin');
    assert.strictEqual(wearRes.success, true);
    assert.strictEqual(wearRes.outfit.name, 'Red Satin Slip Wrap Dress');

    const currentOutfit = simulationService.getCurrentOutfit();
    assert.strictEqual(currentOutfit.name, 'Red Satin Slip Wrap Dress');

    // Add gift from Sandy
    const newGift = simulationService.addWardrobeItem({
      name: 'Diamond Pendant Necklace',
      category: 'jewellery',
      description: 'Sparkling delicate silver pendant given by Sandy',
      isGift: true,
      giftedBy: 'Sandy',
    });
    assert.ok(newGift.id, 'Gift has unique ID');
    assert.strictEqual(newGift.is_gift, 1);

    // Verify context block contains simulation state
    const contextBlock = simulationService.getSimulationContextBlock();
    assert.ok(contextBlock.includes('MYRA\'S AUTHORITATIVE VIRTUAL LIFE SIMULATION STATE'));
    assert.ok(contextBlock.includes('Red Satin Slip Wrap Dress'));
  });

  // =========================================================================
  // 7. NATURAL LANGUAGE COMMAND HANDLING
  // =========================================================================
  await t.test('7. Natural language conversational simulation commands', async () => {
    // 1. Where are you?
    const whereRes = await naturalLanguageSimHandler.handleIntent('Where are you right now baby?', 'Sandy');
    assert.strictEqual(whereRes.handled, true);
    assert.strictEqual(whereRes.action, 'LOCATION_QUERY');
    assert.ok(whereRes.replyText.toLowerCase().includes('in the *'));

    // 2. What are you wearing?
    const wearingRes = await naturalLanguageSimHandler.handleIntent('What are you wearing?', 'Sandy');
    assert.strictEqual(wearingRes.handled, true);
    assert.strictEqual(wearingRes.action, 'WARDROBE_QUERY');
    assert.ok(wearingRes.replyText.includes('Red Satin Slip Wrap Dress'));

    // 3. Go watch a cartoon
    const cartoonRes = await naturalLanguageSimHandler.handleIntent('Go watch a cartoon in the living room', 'Sandy');
    assert.strictEqual(cartoonRes.handled, true);
    assert.strictEqual(cartoonRes.action, 'WATCH_ENTERTAINMENT');
    const world = simulationService.getWorldState();
    assert.strictEqual(world.location, 'living_room');
    assert.strictEqual(world.activity, 'watching_tv');

    // 4. I gave you a rest day
    const restDayRes = await naturalLanguageSimHandler.handleIntent('I gave you a rest day today sweetie', 'Sandy');
    assert.strictEqual(restDayRes.handled, true);
    assert.strictEqual(restDayRes.action, 'GRANT_REST_DAY');

    // 5. I did the dishes
    const choreRes = await naturalLanguageSimHandler.handleIntent("I've washed the dishes", 'Sandy');
    assert.strictEqual(choreRes.handled, true);
    assert.strictEqual(choreRes.action, 'CHORE_COMPLETED_BY_SANDY');

    // 6. Wear the pink oversized hoodie
    const wearHoodieRes = await naturalLanguageSimHandler.handleIntent('Wear the pink oversized hoodie', 'Sandy');
    assert.strictEqual(wearHoodieRes.handled, true);
    assert.strictEqual(wearHoodieRes.action, 'WEAR_OUTFIT');
    assert.strictEqual(simulationService.getCurrentOutfit().name, 'Pink Oversized Hoodie & Grey Shorts');

    // 7. Bought you some chocolate
    const chocolateRes = await naturalLanguageSimHandler.handleIntent('Bought you some chocolate', 'Sandy');
    assert.strictEqual(chocolateRes.handled, true);
    assert.strictEqual(chocolateRes.action, 'RESTOCK_GROCERIES');

    // 8. Make yourself some food / maggi
    const foodRes = await naturalLanguageSimHandler.handleIntent('Make yourself some maggi noodles to eat', 'Sandy');
    assert.strictEqual(foodRes.handled, true);
    assert.strictEqual(foodRes.action, 'COOK_AND_EAT');

    // 9. Go take a shower
    const showerRes = await naturalLanguageSimHandler.handleIntent('Go take a hot shower', 'Sandy');
    assert.strictEqual(showerRes.handled, true);
    assert.strictEqual(showerRes.action, 'TAKE_SHOWER');
    assert.strictEqual(simulationService.getWorldState().location, 'bathroom');

    // 10. Non-simulation normal conversation returns null (falls through to GPT-6 Luna)
    const normalChat = await naturalLanguageSimHandler.handleIntent('Tell me about quantum computing', 'Sandy');
    assert.strictEqual(normalChat, null);
  });

  // =========================================================================
  // 8. DETERMINISTIC OWNER SLASH COMMANDS (/sim)
  // =========================================================================
  await t.test('8. WhatsApp Service handles deterministic /sim commands', async () => {
    let capturedReply = null;
    const origSafeSend = whatsAppService.safeSendMessage;
    whatsAppService.safeSendMessage = async (jid, content) => {
      capturedReply = content.text;
      return { key: { id: 'sim_test' } };
    };

    const ownerJid = '214293836493051@lid';

    try {
      // /sim status
      await whatsAppService.handleIncomingMessage({
        key: { id: `s1_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: '/sim status' },
      });
      assert.ok(capturedReply.includes('MYRA — VIRTUAL LIFE & HOUSEHOLD SIMULATION'));
      assert.ok(capturedReply.includes('SIMULATED NEEDS & VITALS'));
      assert.ok(capturedReply.includes('Happiness:'));

      // /sim room bedroom
      await whatsAppService.handleIncomingMessage({
        key: { id: `s2_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: '/sim room bedroom' },
      });
      assert.ok(capturedReply.includes('Moved Myra to *Bedroom*'));
      assert.strictEqual(simulationService.getWorldState().location, 'bedroom');

      // /sim set hunger 2
      await whatsAppService.handleIncomingMessage({
        key: { id: `s3_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: '/sim set hunger 2' },
      });
      assert.ok(capturedReply.includes('Updated *hunger* to *2/10*'));
      assert.strictEqual(simulationService.getNeeds().hunger, 2);

      // /sim rest
      await whatsAppService.handleIncomingMessage({
        key: { id: `s4_${Date.now()}`, remoteJid: ownerJid, fromMe: false },
        message: { conversation: '/sim rest' },
      });
      assert.ok(capturedReply.includes('Rest day'));

    } finally {
      whatsAppService.safeSendMessage = origSafeSend;
    }
  });
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { visualShoppingEngine } from '../src/shopping/visualShoppingEngine.js';
import { productSearchService } from '../src/shopping/productSearchService.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { getDb, initDatabase } from '../src/db/index.js';

describe('🛍️ Nero Labs — Advanced Visual Product Search & Smart Shopping Engine Suite', () => {

  before(() => {
    initDatabase();
    visualShoppingEngine.init();
  });

  // -------------------------------------------------------------
  // Test 1: SSRF Protection, Link Sanitization & Tracker Stripping
  // -------------------------------------------------------------
  test('Test 1: SSRF Guard, Safe URL Verification & Ad Link Rejection', async () => {
    // 1. SSRF Guard: Block internal & private IP addresses
    assert.strictEqual(visualShoppingEngine.isSafeUrl('http://localhost:3000/admin'), false, 'localhost must be blocked');
    assert.strictEqual(visualShoppingEngine.isSafeUrl('http://127.0.0.1/etc/passwd'), false, '127.0.0.1 must be blocked');
    assert.strictEqual(visualShoppingEngine.isSafeUrl('http://192.168.1.1/setup'), false, '192.168.x must be blocked');
    assert.strictEqual(visualShoppingEngine.isSafeUrl('http://10.0.0.5/api'), false, '10.x must be blocked');
    assert.strictEqual(visualShoppingEngine.isSafeUrl('http://169.254.169.254/latest/meta-data/'), false, 'AWS metadata IP must be blocked');
    assert.strictEqual(visualShoppingEngine.isSafeUrl('http://internal.service.local/db'), false, '.local must be blocked');
    assert.strictEqual(visualShoppingEngine.isSafeUrl('ftp://example.com/file'), false, 'ftp protocol must be rejected');

    // Safe public domains
    assert.strictEqual(visualShoppingEngine.isSafeUrl('https://www.amazon.in/dp/B0C7QS9M38'), true);
    assert.strictEqual(visualShoppingEngine.isSafeUrl('https://www.flipkart.com/boat-airdopes/p/itm123'), true);

    // 2. Ad & Tracking URL Rejection
    const adUrl1 = 'https://duckduckgo.com/y.js?ad_domain=amazon.com&ad_provider=bing&u3=https%3A%2F%2Fwww.amazon.in';
    assert.strictEqual(visualShoppingEngine.sanitizeProductUrl(adUrl1), null, 'Ad redirects must be rejected');

    const adUrl2 = 'https://www.bing.com/aclick?ld=e8O0fjbPt1FRR4JbvPsIYbqDVUCUyCeMPi...';
    assert.strictEqual(visualShoppingEngine.sanitizeProductUrl(adUrl2), null, 'Bing aclick tracking must be rejected');

    // 3. Amazon India Canonicalization & Affiliate Tag Stripping
    const dirtyAmazon = 'https://www.amazon.in/boAt-Airdopes-Bluetooth-Wireless-Earphones/dp/B0C7QS9M38?tag=affiliate-21&ref=sr_1_1&ascsubtag=xyz123';
    const cleanAmazon = visualShoppingEngine.sanitizeProductUrl(dirtyAmazon);
    assert.strictEqual(cleanAmazon, 'https://www.amazon.in/dp/B0C7QS9M38', 'Amazon URL must be canonicalized to direct dp link without affiliate tags');

    // 4. Flipkart Canonicalization
    const dirtyFlipkart = 'https://www.flipkart.com/boat-airdopes-141/p/itm7f82eea398101?pid=ACCGHY456&utm_source=adwords';
    const cleanFlipkart = visualShoppingEngine.sanitizeProductUrl(dirtyFlipkart);
    assert.ok(cleanFlipkart.includes('flipkart.com/product/p/itm?pid=ACCGHY456'), 'Flipkart URL must be canonicalized');
    assert.strictEqual(cleanFlipkart.includes('utm_source'), false, 'utm_source must be stripped');
  });

  // -------------------------------------------------------------
  // Test 2: Query Detection, Pincode & Budget Extraction
  // -------------------------------------------------------------
  test('Test 2: Query Detection, Indian Pincode & Budget Extraction', () => {
    // Shopping detection
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('Find me best price for Sony WH-1000XM5'), true);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('Banarasi silk saree under 3000'), true);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('Blinkit milk price'), true);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('Bhai ye lehenga kitne ka hai aur kahan milega'), true);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('https://www.amazon.in/dp/B0C7QS9M38'), true);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('/shop boAt Airdopes'), true);

    // Non-shopping detection
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('Tell me a funny joke'), false);
    assert.strictEqual(visualShoppingEngine.isShoppingQuery('What is the weather today?'), false);

    // Pincode extraction
    const loc1 = visualShoppingEngine.extractLocationOrPincode('Delivery to 110001 please');
    assert.strictEqual(loc1?.value, '110001', 'Indian 6-digit pincode must be extracted');
    assert.strictEqual(loc1?.type, 'pincode');

    const loc2 = visualShoppingEngine.extractLocationOrPincode('Check delivery time in Bengaluru');
    assert.strictEqual(loc2?.value, 'Bengaluru', 'Major Indian city must be extracted');
    assert.strictEqual(loc2?.type, 'city');

    // Budget extraction
    assert.strictEqual(visualShoppingEngine.extractBudget('Wireless earbuds under ₹1,500'), 1500);
    assert.strictEqual(visualShoppingEngine.extractBudget('Saree below 4000 rs'), 4000);
    assert.strictEqual(visualShoppingEngine.extractBudget('Gaming phone with budget of 25000'), 25000);
  });

  // -------------------------------------------------------------
  // Test 3: Price, MRP, Discount & Store Detail Extraction
  // -------------------------------------------------------------
  test('Test 3: Price, MRP, Visible Discount and Store Identity', () => {
    const title = 'Buy boAt Airdopes 141 ANC Bluetooth Earbuds for Rs. 1,299 Online at Flipkart';
    const snippet = 'MRP Rs. 4,490 (71% off). Free Delivery. 4.2 stars with 18,400 ratings. 7 days replacement guarantee.';

    const priceDetails = visualShoppingEngine.extractPriceFromSnippet(title, snippet);
    assert.strictEqual(priceDetails.priceStr, '₹1,299', 'Price must be extracted with ₹ symbol');
    assert.strictEqual(priceDetails.numericPrice, 1299);
    assert.strictEqual(priceDetails.mrpStr, '₹4,490', 'MRP must be extracted');
    assert.match(priceDetails.discountStr, /71%\s*off/i, 'Discount must be extracted');

    const storeId = visualShoppingEngine.identifyStoreFromUrl('https://www.amazon.in/dp/B0C7QS9M38');
    assert.strictEqual(storeId.storeName, 'Amazon India');

    const blinkitId = visualShoppingEngine.identifyStoreFromUrl('https://blinkit.com/prn/amul-milk/prid/123');
    assert.strictEqual(blinkitId.storeName, 'Blinkit');

    const meeshoId = visualShoppingEngine.identifyStoreFromUrl('https://www.meesho.com/saree/p/123');
    assert.strictEqual(meeshoId.storeName, 'Meesho');

    const ratingDetails = visualShoppingEngine.extractRatingDetails(title, snippet);
    assert.match(ratingDetails.ratingStr, /4\.2\/5/);
    assert.match(ratingDetails.reviewCountStr, /18,400/);
  });

  // -------------------------------------------------------------
  // Test 4: Exact Match vs Similar Alternative Separation
  // -------------------------------------------------------------
  test('Test 4: Exact Match vs Similar Alternative Classification', () => {
    const target = 'boAt Airdopes 141';
    const brand = 'boAt';

    // Exact matches
    assert.strictEqual(
      visualShoppingEngine.isExactProductMatch(target, 'boAt Airdopes 141 Bluetooth Headset (Active Black)', brand),
      true,
      'Exact model with color must be an exact match'
    );
    assert.strictEqual(
      visualShoppingEngine.isExactProductMatch(target, 'Buy boAt Airdopes 141 True Wireless Earbuds Online', brand),
      true,
      'Direct product listing must be an exact match'
    );

    // Mismatched brand or different model
    assert.strictEqual(
      visualShoppingEngine.isExactProductMatch(target, 'Boult Audio Airbass X30 Wireless Earbuds', brand),
      false,
      'Different brand must NOT be an exact match'
    );
    assert.strictEqual(
      visualShoppingEngine.isExactProductMatch(target, 'Noise Buds VS102 Wireless Earphones', brand),
      false,
      'Different product must NOT be an exact match'
    );
  });

  // -------------------------------------------------------------
  // Test 5: Universal Visual Recognition (Flowers, Hair, Nails, Objects)
  // -------------------------------------------------------------
  test('Test 5: Universal Visual Recognition for Non-Shopping Subjects', async () => {
    // Non-shopping item (Flower)
    const visualData = {
      isShoppingItem: false,
      category: 'flower_plant',
      productName: 'Hibiscus (Gudhal)',
      confidence: 'high',
      confidenceScore: 0.96,
      nonShoppingDetails: {
        scientificOrStyleName: 'Hibiscus rosa-sinensis',
        description: 'Vibrant red flowering tropical shrub common across Indian gardens.',
        tipsOrCare: 'Needs 6+ hours of full sun, well-draining soil, and weekly watering.',
        uses: 'Used in Ayurveda for hair growth oils and religious offerings.',
      },
      searchQueries: ['live hibiscus plant buy online india'],
    };

    const storeResults = {
      exactMatches: [
        {
          store: 'Amazon India',
          title: 'Live Red Hibiscus Flowering Plant in Pot',
          price: '₹249',
          url: 'https://www.amazon.in/dp/B08XYZ1234',
        },
      ],
      similarAlternatives: [],
      totalMatches: 1,
    };

    const report = visualShoppingEngine.formatWhatsAppResponse({
      visualData,
      storeResults,
      reliability: {},
      userLanguage: 'English',
    });

    assert.match(report, /🌸 \*Visual Identification — Nero Vision\*/);
    assert.match(report, /Hibiscus \(Gudhal\)/);
    assert.match(report, /_Hibiscus rosa-sinensis_/);
    assert.match(report, /Care & Styling Tips:/);
    assert.match(report, /Needs 6\+ hours of full sun/);
    assert.match(report, /Live Red Hibiscus/);
    assert.match(report, /Amazon India/);
  });

  // -------------------------------------------------------------
  // Test 6: Uncertain Visual Identification & Candidate Matches
  // -------------------------------------------------------------
  test('Test 6: Candidate Matches and Clarification for Uncertain Images', async () => {
    const visualData = {
      isShoppingItem: true,
      isUncertain: true,
      category: 'electronics',
      productName: 'boAt Airdopes Series',
      candidateMatches: [
        'boAt Airdopes 141 (Standard 42H Playback)',
        'boAt Airdopes 141 ANC (Active Noise Cancellation Edition)',
      ],
      clarificationQuestion: 'Did you want the standard Airdopes 141 or the ANC version?',
    };

    const report = visualShoppingEngine.formatWhatsAppResponse({
      visualData,
      storeResults: { exactMatches: [], similarAlternatives: [], totalMatches: 0 },
      reliability: {},
      userLanguage: 'English',
    });

    assert.match(report, /Candidate Matches/i);
    assert.match(report, /1️⃣ \*boAt Airdopes 141/);
    assert.match(report, /2️⃣ \*boAt Airdopes 141 ANC/);
    assert.match(report, /Did you want the standard Airdopes 141 or the ANC version\?/);
  });

  // -------------------------------------------------------------
  // Test 7: Multi-Store Comparison, Reviews, Pros & Cons, Best Deal
  // -------------------------------------------------------------
  test('Test 7: Multi-Store Comparison, Ratings, Pros/Cons & Best Deal Verdict', async () => {
    const visualData = {
      isShoppingItem: true,
      isUncertain: false,
      category: 'electronics',
      productName: 'boAt Airdopes 141 ANC',
      brand: 'boAt',
      modelOrDesign: 'Active Black · 32dB ANC',
      confidence: 'high',
      confidenceScore: 0.94,
    };

    const storeResults = {
      exactMatches: [
        {
          store: 'Amazon India',
          title: 'boAt Airdopes 141 ANC Wireless Earbuds (Active Black)',
          price: '₹1,299',
          mrp: '₹4,490',
          discount: '71% off',
          delivery: 'Tomorrow by 2 PM',
          shippingFee: 'Free Shipping',
          seller: 'Appario Retail (Verified)',
          returnPolicy: '7-Day Replacement',
          rating: '4.2/5',
          reviewCount: '18,400+ reviews',
          url: 'https://www.amazon.in/dp/B0C7QS9M38',
        },
        {
          store: 'Flipkart',
          title: 'boAt Airdopes 141 ANC Bluetooth Headset',
          price: '₹1,349',
          mrp: '₹4,490',
          discount: '70% off',
          delivery: 'In 2 days',
          shippingFee: '₹40 fee',
          seller: 'RetailNet',
          returnPolicy: '7-Day Return',
          rating: '4.1/5',
          reviewCount: '32,100+ reviews',
          url: 'https://www.flipkart.com/product/p/itm?pid=ACCGHY456',
        },
        {
          store: 'Blinkit',
          title: 'boAt Airdopes 141 ANC',
          price: '₹1,399',
          delivery: 'In 10–15 mins',
          shippingFee: 'Free quick delivery',
          seller: 'Blinkit Commerce',
          returnPolicy: 'Store Policy',
          rating: '4.3/5',
          reviewCount: 'Local purchases',
          url: 'https://blinkit.com/prn/boat-airdopes-141/prid/12345',
        },
      ],
      similarAlternatives: [
        {
          store: 'Amazon India',
          title: 'Noise Buds VS102 ANC Wireless Earbuds',
          price: '₹1,199',
          url: 'https://www.amazon.in/dp/B08ALTERNATIVE',
        },
      ],
      totalMatches: 4,
    };

    const reliability = {
      bestStore: 'Amazon India',
      bestReason: 'Lowest price (₹1,299) and fastest free delivery',
      pros: ['Punchy bass', 'Long 42h battery life', 'Effective 32dB ANC in budget'],
      cons: ['Microphone picks up wind noise outdoors', 'Case scratches easily'],
      sellerTrust: 'High — Appario Retail is an authorized tier-1 retailer',
      finalVerdict: 'Top value-for-money ANC earbuds in the ₹1,300 segment.',
    };

    const report = visualShoppingEngine.formatWhatsAppResponse({
      visualData,
      storeResults,
      reliability,
      userLanguage: 'English',
      userLocation: { type: 'city', value: 'Delhi', label: 'Delhi' },
    });

    // Check store price listing
    assert.match(report, /Amazon India/);
    assert.match(report, /₹1,299/);
    assert.match(report, /Flipkart/);
    assert.match(report, /₹1,349/);
    assert.match(report, /Blinkit/);
    assert.match(report, /₹1,399/);
    assert.match(report, /In 10–15 mins/);

    // Check verified links
    assert.match(report, /https:\/\/www\.amazon\.in\/dp\/B0C7QS9M38/);
    assert.match(report, /https:\/\/www\.flipkart\.com\/product\/p\/itm\?pid=ACCGHY456/);
    assert.match(report, /https:\/\/blinkit\.com\/prn\/boat-airdopes-141\/prid\/12345/);

    // Check best deal & verdict
    assert.match(report, /BEST VERIFIED DEAL/);
    assert.match(report, /Amazon India/);
    assert.match(report, /Punchy bass/);
    assert.match(report, /Microphone picks up wind noise/);
    assert.match(report, /Top value-for-money/);

    // Check safety assurance
    assert.match(report, /No automated orders or payments are ever executed/i);
  });

  // -------------------------------------------------------------
  // Test 8: Skincare & Health Verification (Marketing vs Science)
  // -------------------------------------------------------------
  test('Test 8: Skincare & Health Verification — Distinguishes Marketing Hype from Evidence', async () => {
    const visualData = {
      isShoppingItem: true,
      category: 'beauty_skincare',
      productName: 'Minimalist 10% Niacinamide Serum',
      isHealthOrSkincare: true,
    };

    const storeResults = {
      exactMatches: [
        {
          store: 'Nykaa',
          title: 'Minimalist 10% Niacinamide Face Serum with Zinc',
          price: '₹569',
          rating: '4.5/5',
          reviewCount: '15,000+ reviews',
          url: 'https://www.nykaa.com/minimalist-niacinamide/p/12345',
        },
      ],
      similarAlternatives: [],
      totalMatches: 1,
    };

    const reliability = {
      bestStore: 'Nykaa',
      bestReason: 'Verified genuine beauty distributor',
      pros: ['Regulates excess sebum', 'Fades post-acne blemishes'],
      cons: ['May cause initial purging or tingling on damaged skin barriers'],
      sellerTrust: 'High — Authentic direct brand supply',
      skincareVerdict: 'Formulated with 10% Niacinamide + 1% Zinc PCA which has proven clinical evidence for pore refinement, but perform a 24h patch test before full facial application.',
      finalVerdict: 'Clinically solid serum for oily/acne-prone skin.',
    };

    const report = visualShoppingEngine.formatWhatsAppResponse({
      visualData,
      storeResults,
      reliability,
      userLanguage: 'English',
    });

    assert.match(report, /Dermatological Note:/i);
    assert.match(report, /10% Niacinamide/);
    assert.match(report, /patch test/i);
  });

  // -------------------------------------------------------------
  // Test 9: SQLite Cache Hit & Performance
  // -------------------------------------------------------------
  test('Test 9: SQLite Cache Stores and Retrieves Search Results Instantly', async () => {
    const testKey = `test_cache_${Date.now()}`;
    const testData = { replyText: 'Cached result for Banarasi silk saree' };

    visualShoppingEngine.setCachedResult(testKey, 'Banarasi Saree', testData);
    const cached = visualShoppingEngine.getCachedResult(testKey);

    assert.ok(cached, 'Cached item must be retrieved');
    assert.strictEqual(cached.replyText, testData.replyText);
  });

  // -------------------------------------------------------------
  // Test 10: WhatsApp Service Text & Image Intake Routing
  // -------------------------------------------------------------
  test('Test 10: WhatsApp Service Routes Text Shopping Queries to VisualShoppingEngine', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    let sentMessages = [];
    whatsAppService.safeSendMessage = async (jid, content, options) => {
      sentMessages.push({ jid, text: content.text });
      return { key: { id: 'msg_test_123', remoteJid: jid } };
    };

    try {
      const shoppingMsg = {
        key: { id: `m_shop_${Date.now()}`, remoteJid: '919876500001@s.whatsapp.net', fromMe: false },
        message: { conversation: 'Find me best price for boAt Airdopes 141 on Amazon and Flipkart' },
      };

      await whatsAppService.handleIncomingMessage(shoppingMsg);

      assert.strictEqual(sentMessages.length, 1, 'Shopping query must receive direct shopping response');
      assert.match(sentMessages[0].text, /boAt Airdopes 141|Smart Shopping|STORE PRICES/i);
    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
    }
  });

});

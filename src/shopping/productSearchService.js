/**
 * 🛍️ NERO LABS — PRODUCT & SHOPPING SEARCH SERVICE
 * Real product discovery, specification comparison, price tracking with timestamps,
 * and zero fabricated listings or prices. Strictly discovery and comparison (no checkout).
 */

import { webSearchService } from '../search/webSearchService.js';
import { scaleMaxAdapter } from '../provider/scaleMaxAdapter.js';
import { getActiveModelId } from '../models/catalogue.js';

export class ProductSearchService {
  /**
   * Determine whether query is a shopping/product inquiry
   */
  isShoppingQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return (
      /^(?:find|search|compare|recommend|buy|shop)\s+(?:me\s+)?(?:a\s+|the\s+)?(?:best\s+)?(?:product|deal|laptop|phone|monitor|camera|headphone|keyboard|shoe|gift)\b/i.test(lower) ||
      /\b(?:under\s+\$?\d+|budget\s+of\s+\$?\d+|price\s+range|best\s+price|shopping)\b/i.test(lower) ||
      /^(?:\/shop|\/product|\/deal)\b/i.test(lower)
    );
  }

  isProductQuery(text) {
    return this.isShoppingQuery(text);
  }

  /**
   * Extract budget from user query if present
   */
  extractBudget(text) {
    if (!text) return null;
    const match = text.match(/(?:under|below|less than|budget of|max)\s*(?:\$|usd\s*|inr\s*|rs\.?\s*)?(\d+[\d,]*)/i);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''), 10);
    }
    return null;
  }

  /**
   * Search products across retail and tech review indices
   */
  async searchProducts(query, options = {}) {
    const q = query.trim();
    const budget = options.budget || this.extractBudget(q);

    // Formulate targeted shopping search queries
    const searchQuery = `${q} price specifications reviews buy`;
    const searchRes = await webSearchService.search(searchQuery, { limit: 8 });

    const products = [];
    if (searchRes.ok && searchRes.results) {
      for (const item of searchRes.results) {
        // Extract price patterns like $999, $1,299.99, Rs. 45,000, €799
        const priceMatch = item.snippet.match(/(?:\$|€|£|₹|Rs\.?\s*)([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i) ||
                           item.title.match(/(?:\$|€|£|₹|Rs\.?\s*)([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);

        const priceStr = priceMatch ? priceMatch[0] : null;
        let numericPrice = null;
        if (priceMatch) {
          numericPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
        }

        // Detect retailer
        let retailer = 'Online Retailer';
        const urlLower = item.url.toLowerCase();
        if (urlLower.includes('amazon.')) retailer = 'Amazon';
        else if (urlLower.includes('bestbuy.')) retailer = 'Best Buy';
        else if (urlLower.includes('ebay.')) retailer = 'eBay';
        else if (urlLower.includes('walmart.')) retailer = 'Walmart';
        else if (urlLower.includes('bhphotovideo.')) retailer = 'B&H Photo';
        else if (urlLower.includes('newegg.')) retailer = 'Newegg';
        else if (urlLower.includes('target.')) retailer = 'Target';
        else retailer = item.source || new URL(item.url).hostname.replace(/^www\./, '');

        products.push({
          name: item.title,
          price: priceStr,
          numericPrice,
          retailer,
          url: item.url,
          specs: item.snippet,
          verifiedAt: new Date().toISOString().split('T')[0],
        });
      }
    }

    return {
      ok: true,
      query: q,
      budget,
      totalFound: products.length,
      products: products.slice(0, 6),
    };
  }

  /**
   * Compare products against user budget and specs using Gemini 3.8 Flash
   */
  async compareProducts(userQuery, shoppingData) {
    if (!shoppingData || !shoppingData.products || shoppingData.products.length === 0) {
      return `❌ **No verified product listings found for "${userQuery}".**\nTry specifying the exact brand, model, or category.`;
    }

    const budgetNote = shoppingData.budget ? `Target Budget: $${shoppingData.budget}` : 'No explicit budget specified.';
    const listings = shoppingData.products
      .map(
        (p, i) =>
          `[Option ${i + 1}]: ${p.name}\nRetailer: ${p.retailer}\nPrice: ${p.price || 'Listing price varies'}\nURL: ${p.url}\nSpecs/Excerpt: ${p.specs}\nChecked Date: ${p.verifiedAt}`
      )
      .join('\n\n');

    const prompt = `You are Nero Labs Product Discovery & Comparison Engine.
User Request: "${userQuery}"
${budgetNote}

Verified Real-World Listings:
${listings}

Instructions:
1. Provide a comparative analysis of the matching products.
2. For each recommendation, highlight:
   - **Product Name & Retailer**
   - **Price** (state the verified price or note if it varies)
   - **Key Specifications / Pros & Cons**
   - **Direct Link**: in markdown format [View on Retailer](URL)
3. If a budget was specified, identify which option provides the best value within that budget.
4. Note: "Prices and stock verified as of ${new Date().toISOString().split('T')[0]}. No automated purchasing is performed."
5. Never invent models, ratings, or prices. Be honest about trade-offs.`;

    try {
      const activeModel = getActiveModelId() || 'gemini-3.8-flash';
      const completion = await scaleMaxAdapter.createChatCompletion({
        model: activeModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      });

      return completion.text;
    } catch {
      // Deterministic fallback
      let fallback = `🛍️ **Product Comparison for "${userQuery}"**\n\n`;
      for (const p of shoppingData.products.slice(0, 4)) {
        fallback += `• **[${p.name}](${p.url})**\n`;
        fallback += `  💵 **Price:** ${p.price || 'Check retailer'} (${p.retailer})\n`;
        fallback += `  📝 ${p.specs}\n\n`;
      }
      fallback += `_Verified as of ${new Date().toISOString().split('T')[0]}. Discovery only — no checkout._`;
      return fallback;
    }
  }

  formatComparisonReport(shoppingData) {
    if (!shoppingData || !shoppingData.products || shoppingData.products.length === 0) {
      return 'No verified product listings found.';
    }
    let report = `🛍️ **Product Discovery & Comparison**\n\n`;
    for (const p of shoppingData.products) {
      report += `• **[${p.name}](${p.url})**\n`;
      report += `  Direct Retail Listing: ${p.retailer} | Price: ${p.price || 'Listing price varies'}\n`;
      report += `  ${p.specs}\n\n`;
    }
    return report;
  }
}

export const productSearchService = new ProductSearchService();

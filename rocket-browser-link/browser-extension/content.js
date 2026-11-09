/**
 * Rocket Browser Link — Content Script
 * Executes DOM operations, reads visible page content, and interacts with elements.
 */

(() => {
  if (window.__ROCKET_BROWSER_LINK_ACTIVE) return;
  window.__ROCKET_BROWSER_LINK_ACTIVE = true;

  // Listen for messages from background.js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleContentAction(message)
      .then((res) => sendResponse({ success: true, result: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  });

  async function handleContentAction(msg) {
    const { action, params = {} } = msg;

    switch (action) {
      case 'page_read':
        return readVisiblePage(params);

      case 'page_click':
        return clickElement(params);

      case 'page_type':
        return typeIntoElement(params);

      case 'page_scroll':
        return scrollPage(params);

      case 'page_select_copy':
        return selectAndCopy(params);

      case 'page_search':
        return searchPageText(params);

      case 'page_form_fill':
        return fillFormFields(params);

      default:
        throw new Error(`Unknown content action: ${action}`);
    }
  }

  /**
   * Read visible page structure, headings, body text, and interactive elements
   */
  function readVisiblePage(params) {
    const maxLength = params.maxLength || 3500;
    const title = document.title || 'Untitled';
    const url = window.location.href;

    // Prune invisible elements, styles, scripts
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            if (['script', 'style', 'noscript', 'svg', 'iframe'].includes(tag)) {
              return NodeFilter.FILTER_REJECT;
            }
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    // Extract headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .slice(0, 10)
      .map((h) => h.innerText.trim())
      .filter(Boolean);

    // Extract key interactive buttons / links
    const interactive = Array.from(
      document.querySelectorAll('a[href], button, input[type="button"], input[type="submit"]')
    )
      .slice(0, 15)
      .map((el) => {
        const text = (el.innerText || el.getAttribute('aria-label') || el.value || '').trim();
        return text ? `[${el.tagName.toLowerCase()}: "${text.slice(0, 40)}"]` : null;
      })
      .filter(Boolean);

    // Extract body text
    let bodyText = (document.body.innerText || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (bodyText.length > maxLength) {
      bodyText = bodyText.slice(0, maxLength) + '... [truncated]';
    }

    return {
      title,
      url,
      headings,
      interactiveElements: interactive,
      content: bodyText,
    };
  }

  /**
   * Find and click element by selector, text, or accessible label
   */
  async function clickElement(params) {
    let target = null;

    if (params.selector) {
      target = document.querySelector(params.selector);
    }

    if (!target && params.text) {
      const targetText = params.text.toLowerCase().trim();
      const candidates = Array.from(
        document.querySelectorAll('a, button, input, [role="button"], span, div')
      );
      target = candidates.find((el) => {
        const content = (el.innerText || el.getAttribute('aria-label') || el.value || '').toLowerCase();
        return content.includes(targetText);
      });
    }

    if (!target && params.accessibleName) {
      const name = params.accessibleName.toLowerCase();
      target = document.querySelector(`[aria-label*="${name}" i], [title*="${name}" i]`);
    }

    if (!target) {
      throw new Error(`Element not found matching: ${JSON.stringify(params)}`);
    }

    // Scroll into view
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightElement(target);

    // Dispatch real click events
    target.focus();
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    target.click();

    return {
      clicked: true,
      tagName: target.tagName,
      text: (target.innerText || target.getAttribute('aria-label') || '').slice(0, 50),
    };
  }

  /**
   * Type text into an input or textarea
   */
  async function typeIntoElement(params) {
    let input = null;

    if (params.selector) {
      input = document.querySelector(params.selector);
    } else {
      // Find active or first visible input
      input = document.activeElement;
      if (!input || !['input', 'textarea'].includes(input.tagName.toLowerCase())) {
        input = document.querySelector(
          'input[type="text"], input[type="search"], textarea, input:not([type="hidden"])'
        );
      }
    }

    if (!input) {
      throw new Error('No input field found to type into.');
    }

    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightElement(input);
    input.focus();

    if (params.clear) {
      input.value = '';
    }

    input.value += params.text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    if (params.submit) {
      const form = input.closest('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
      } else {
        // Dispatch Enter key
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }
    }

    return {
      typed: true,
      text: params.text,
      fieldName: input.name || input.id || input.tagName,
    };
  }

  /**
   * Scroll page
   */
  function scrollPage(params) {
    const dir = (params.direction || 'down').toLowerCase();
    const amount = params.amount || 600;

    let deltaY = 0;
    if (dir === 'down') deltaY = amount;
    else if (dir === 'up') deltaY = -amount;
    else if (dir === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return { scrolled: true, position: 'top' };
    } else if (dir === 'bottom') {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      return { scrolled: true, position: 'bottom' };
    }

    window.scrollBy({ top: deltaY, left: 0, behavior: 'smooth' });
    return { scrolled: true, deltaY, currentY: window.scrollY };
  }

  /**
   * Select and copy content to clipboard
   */
  async function selectAndCopy(params) {
    let textToCopy = '';

    if (params.selector) {
      const el = document.querySelector(params.selector);
      if (el) textToCopy = el.innerText || el.textContent;
    } else if (params.text) {
      textToCopy = params.text;
    } else {
      textToCopy = window.getSelection ? window.getSelection().toString() : '';
      if (!textToCopy) {
        // Fallback: copy main page summary / title
        textToCopy = `${document.title || ''}\n${window.location.href || ''}`;
      }
    }

    textToCopy = (textToCopy || '').trim();
    if (!textToCopy) {
      textToCopy = document.title || window.location.href || 'Rocket Browser Link';
    }

    // Attempt safe clipboard copy
    let copiedToClipboard = false;
    try {
      if (document.body) {
        const ta = document.createElement('textarea');
        ta.value = textToCopy;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.select();
        copiedToClipboard = document.execCommand('copy');
        ta.remove();
      }
    } catch {}

    return {
      copied: true,
      text: textToCopy,
      length: textToCopy.length,
      preview: textToCopy.slice(0, 100),
      clipboard: copiedToClipboard,
    };
  }

  /**
   * Search for text on page
   */
  function searchPageText(params) {
    const query = params.query;
    if (!query) throw new Error('Search query is required.');

    const found = window.find ? window.find(query, false, false, true) : false;
    return {
      found,
      query,
    };
  }

  /**
   * Fill multiple form fields
   */
  function fillFormFields(params) {
    const fields = params.fields || {};
    const filled = [];

    for (const [key, value] of Object.entries(fields)) {
      const input = document.querySelector(`[name="${key}"], #${key}, [aria-label*="${key}" i]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = Boolean(value);
        } else if (input.tagName.toLowerCase() === 'select') {
          input.value = String(value);
        } else {
          input.value = String(value);
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        filled.push(key);
      }
    }

    return {
      success: true,
      filledFields: filled,
    };
  }

  /**
   * Visual indicator on target elements
   */
  function highlightElement(el) {
    if (!el || typeof el.style === 'undefined') return;
    const prevOutline = el.style.outline;
    const prevTransition = el.style.transition;
    el.style.transition = 'outline 0.2s ease';
    el.style.outline = '3px solid #ff6b35';
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.transition = prevTransition;
    }, 1200);
  }
})();

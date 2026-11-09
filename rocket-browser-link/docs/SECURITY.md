# Rocket Browser Link — Security & Privacy Model

## 1. Zero Credential Access & Password Privacy
- **Never Collects Passwords:** Rocket Browser Link explicitly excludes password fields (`input[type="password"]`, `autocomplete="current-password"`) from page text reading and content extraction.
- **Never Extracts Cookies or Tokens:** The extension has no cookie reading or session token export capability. Authentication cookies remain strictly inside the browser sandbox.
- **Payment & Card Redaction:** Built-in sanitizers redact credit card numbers (`\b\d{13,19}\b`), CVV fields, and API tokens before reporting extracted text back to the agent or Discord.

## 2. Risk-Tiered Action Confirmation
Actions are split into two strict tiers:

### Tier 1: Autonomous (LOW Risk)
Executed immediately upon owner request:
- Tab management (opening, closing, switching, pinning, duplicating, cleaning).
- Navigation (URLs, backward, forward, reload, stop).
- Zoom adjustment (in, out, reset, custom factors).
- Content reading (summaries, accessible element discovery, reading visible headings/text).
- Safe text copying and clipboard updates.
- Scrolling and non-sensitive link clicking.

### Tier 2: Confirmation Required (HIGH Risk)
Cannot execute autonomously. Requires explicit confirmation:
- **Logout & Session Disconnects:** Website logout requests.
- **Financial Transactions:** Checkout, buy, pay, subscribe buttons.
- **Account Actions:** Deleting accounts, clearing profile data, revoking credentials.
- **External Publishing:** Submitting forms containing payment data or sending unreviewed messages.

## 3. Strict Identity Quarantine (Owner DMs Only)
- Browser and PC operations can **ONLY** be commanded via **Discord Private Direct Messages (DMs)** by the verified owner (`Boss Sandy`, Discord ID `1477589102110183477`).
- All other users in DMs receive complete silence.
- Browser actions, URLs, open tabs, or extracted page contents are **never** broadcasted or accepted in public Discord channels.

## 4. Local Native Messaging Security
- Native Messaging host runs with user-level privileges (no elevated admin or root service required).
- Communicates strictly via standard input/output pipes with length-prefixed framing.
- No unauthenticated local HTTP port is exposed on the network interface.

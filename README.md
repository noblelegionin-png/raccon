# Nero Labs — Telegram AI Bot & Mobile Mini App (Phase 1)

Official production-grade Telegram AI chatbot and mobile-first Telegram Mini App control panel for **Nero Labs**, built for low-latency reasoning via **Nero Labs Neural Architecture** (defaulting to **Rocket Neural Core**).

---

## 🚀 Key Features (Phase 1)

1. **Telegram Bot Foundation**:
   - Private 1-on-1 conversations with persistent context retention (configurable window).
   - Real-time conversational streaming and typing actions.
   - Resilient error boundary — network drops or provider errors never crash the bot process.
   - Built-in update deduplication to eliminate duplicate replies.
   - Comprehensive owner commands: `/start`, `/status`, `/help`, `/model`, `/setmodel`, `/master`, `/group`, `/clear`.

2. **Nero Labs Neural Architecture Integration**:
   - OpenAI-compatible adapter connecting to neural gateway.
   - Default foundation model: `Rocket Neural Core`.
   - Real latency measurement (round-trip ping in milliseconds).
   - Live model discovery via `GET /v1/models` with automatic fallback to maintainable catalogue template.
   - Transparent reporting: if balance or token limits are not exposed via API, explicitly displays *"Unavailable from provider API"* rather than fabricating numbers.

3. **Strict 4-Color Mobile Mini App**:
   - Designed strictly adhering to the 4-color palette: **White**, **Green**, **Grey**, and **Red**.
   - Zero unnecessary gradients or rainbow accents.
   - Live model states:
     - **White background**: Available unselected model.
     - **Green border/badge**: Active operational model.
     - **Grey background**: Disabled / Phase 2 models.
     - **Green latency text**: Fast response (< 1,000 ms).
     - **Red latency text / Red dot**: High latency (≥ 1,000 ms) or connection failure.
   - Three core viewports: **Personal**, **Groups**, and **Settings**.

4. **Rigorous Access Control**:
   - Server-side verification strictly based on the owner's **numeric Telegram User ID** (never username).
   - Telegram Mini App `initData` authenticated using **HMAC-SHA256** with timing-safe comparison and replay defense.
   - Dedicated `DASHBOARD_ACCESS_KEY` for standalone browser access with brute-force rate limiting.
   - Instant Master AI kill switch halts all AI generation immediately.
   - Owner Revocation: one-click complete memory and audit wipe.

5. **Group Participation & Moderation**:
   - **Silent by default**: Groups are tracked upon bot join, but participation is disabled by default.
   - Dual-gate control: Requires both global group participation flag AND per-group permission to be enabled.
   - Responds only when explicitly mentioned (`@botname`) or replied to.

---

## 📁 Project Architecture

```
d:/nero-labs-telegram-bot/
├── package.json               # Dependencies and scripts (grammy, express, dotenv, cors)
├── .env.example               # Safe example environment configuration
├── .gitignore                 # Excludes .env, data/, node_modules/
├── README.md                  # Complete documentation and operational guide
├── src/
│   ├── config.js              # Environment variable loading and validation
│   ├── index.js               # Application entrypoint & graceful shutdown
│   ├── db/
│   │   └── index.js           # SQLite engine using native node:sqlite (WAL mode)
│   ├── auth/
│   │   ├── telegramAuth.js    # Telegram WebApp initData HMAC-SHA256 validator
│   │   └── accessControl.js   # Numeric owner ID and dashboard access key guard
│   ├── provider/
│   │   └── scaleMaxAdapter.js # ScaleMax API adapter (chat completions & health checks)
│   ├── models/
│   │   └── catalogue.js       # Model catalogue, category filters, and latency cache
│   ├── conversation/
│   │   └── manager.js         # Context buffer windowing & message persistence
│   ├── groups/
│   │   └── groupService.js    # Group registry and participation policies
│   ├── telegram/
│   │   ├── bot.js             # Grammy bot lifecycle & error boundaries
│   │   └── handlers.js        # Telegram command & text handlers
│   └── web/
│       ├── server.js          # Express web server & REST API
│       └── public/            # Mobile-first Telegram Mini App
│           ├── index.html     # Semantic single-page layout
│           ├── css/app.css    # 4-color palette stylesheet
│           └── js/app.js      # Mini App client-side controller
└── tests/
    ├── auth.test.js           # HMAC and numeric owner authorization tests
    ├── database.test.js       # SQLite persistence, windowing, and group tests
    └── provider.test.js       # ScaleMax adapter and catalogue tests
```

---

## 🛠️ Prerequisites & Installation

### 1. Prerequisites
- **Node.js**: v20 or v24 (v24.19.0 recommended, utilizes native `node:sqlite`)
- **Telegram Bot Token**: Created via [@BotFather](https://t.me/botfather)
- **Neural Gateway Account**: API key for neural completions

### 2. Quick Setup
Open your terminal in `d:\nero-labs-telegram-bot`:

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
copy .env.example .env
```

### 3. Configure `.env`
Edit `.env` with your actual credentials:

```ini
# 1. Telegram Bot Token from @BotFather
TELEGRAM_BOT_TOKEN="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"

# 2. Your Numeric Telegram User ID (CRITICAL: Numbers only!)
# Get your numeric ID from @userinfobot or @raw_data_bot on Telegram
TELEGRAM_OWNER_ID="123456789"

# 3. Neural Architecture Credentials
SCALEMAX_API_KEY="your_actual_api_key"
SCALEMAX_BASE_URL="https://api.scalemax.pro/v1"
SCALEMAX_DEFAULT_MODEL="gpt-6-luna"

# 4. Private Dashboard Access Key
# A unique secret for authenticating in a desktop/mobile browser
DASHBOARD_ACCESS_KEY="nero_dev_secret_key_change_me"

# 5. Server Port
PORT=3001
DATABASE_PATH="./data/nerolabs.db"

# 6. Telegram Mini App URL (Optional for local phone testing via ngrok/tunnel)
# WEBAPP_PUBLIC_URL="https://your-tunnel.ngrok-free.app"
```

---

## 🧪 Running the Automated Verification Tests

The test suite covers HMAC-SHA256 signatures, replay protection, numeric owner ID checks, brute-force defenses, database WAL operations, group management, and neural adapter integration:

```bash
npm test
```

Expected output:
```
✔ Telegram Auth — HMAC-SHA256 Validation
✔ Access Control — Numeric Owner ID Verification
✔ Access Control — Dashboard Access Key & Brute Force Rate Limiting
✔ Database Layer — Persistent SQLite Operations
✔ Neural Core Provider Adapter
✔ Model Catalogue & Classification
ℹ tests 25, pass 25, fail 0
```

---

## 🏃 Starting the Application

```bash
npm start
```

Upon starting:
1. SQLite persistent database connects and configures tables in WAL mode.
2. Express web server starts on `http://localhost:3001`.
3. Telegram Bot initiates long-polling connection to Telegram Bot API.

### Opening the Mini App
- **Inside Telegram**: Tap the **Open Nero Labs Mini App** button provided in the `/start` message.
- **In Browser (Development / Testing)**: Open `http://localhost:3001` in your browser. Enter your `DASHBOARD_ACCESS_KEY` in the **Settings** tab to authorize as the Owner.

---

## 📱 Telegram Bot Commands Reference

| Command | Permission | Description |
| :--- | :--- | :--- |
| `/start` | Everyone | Welcomes the user, displays active model, and provides Mini App link |
| `/status` | Everyone | Performs real latency check and outputs system health diagnostics |
| `/help` | Everyone | Displays list of available general and owner commands |
| `/clear` | Everyone | Clears conversation context history for the current chat |
| `/master on` | **Owner Only** | Enables Master AI connection |
| `/master off` | **Owner Only** | **Master Kill Switch**: Instantly halts all AI processing |
| `/model` | **Owner Only** | Displays current active model and catalogue listing |
| `/setmodel <id>` | **Owner Only** | Switches active AI model (e.g. `/setmodel Rocket Neural Core`) |
| `/group on` | **Owner Only** | Enables bot responses in the current group |
| `/group off` | **Owner Only** | Disables bot responses in the current group |
| `/globalgroup on` | **Owner Only** | Globally enables group participation |
| `/globalgroup off` | **Owner Only** | Globally disables group participation |

---

## 🔍 Troubleshooting Guide

### 1. Bot does not reply to messages
- **Check Master AI Switch**: Run `/status` or check the Mini App. If Master Switch is `OFF`, all AI replies are intentionally halted. Run `/master on`.
- **Check Private Chat Switch**: If private chat is disabled, non-owner users will receive a polite notice.
- **Check Neural API Key**: Check the terminal logs or run `/status`. If gateway returned 401, verify `SCALEMAX_API_KEY` in `.env`.

### 2. Bot remains silent in Telegram Groups
- By design, the bot favours silence over interruption.
- Ensure both **Global Group Participation** is enabled (`/globalgroup on` or Mini App toggle) AND the specific group is enabled (`/group on`).
- Ensure the user mentions the bot (`@yourbotname`) or replies directly to one of the bot's messages.

### 3. Mini App shows "Access Denied" or "Guest"
- Ensure `TELEGRAM_OWNER_ID` in `.env` contains your **exact numeric ID** (e.g. `123456789`), NOT your `@username`.
- If opening in a regular desktop browser, navigate to the **Settings** tab and enter your `DASHBOARD_ACCESS_KEY`.

### 4. Local Hosting Notice
- This application runs locally on your Windows machine. The bot will be offline whenever the local process is terminated or your computer is asleep.

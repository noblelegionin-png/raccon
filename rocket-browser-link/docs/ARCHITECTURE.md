# Rocket Browser Link — Architecture Assessment & System Design

## 1. Existing Infrastructure Inspection & Assessment

### Hosting & Deployment Architecture
- **Active Production Cloud:** Deployed on **Railway** (`nero-labs-bot` in workspace `gituser67671's Projects`, service ID: `04ded761-d856-4edc-89ca-bd7ff0ec5bf2`), attached to persistent volume `nero-labs-bot-volume` mounted at `/app/data`.
- **Public Cloud URL:** `https://nero-labs-bot-production.up.railway.app`
- **Git Repository:** `noblelegionin-png/raccon.git` on branch `main`.
- **Local Environment:** Windows 11 on Lenovo PC (`D:\nero-labs-telegram-bot` and `D:\rocket-gaming-companion`).
- **Target Browser:** Opera GX / Opera Stable installed at `C:\Users\S4NDY\AppData\Local\Programs\Opera\opera.exe` (Chromium Manifest V3 runtime).

### AI Engine & Model Routing
- **Core Intelligence:** ScaleMax API integration running `gpt-6-luna` (Luna Neural Core v5.0).
- **Token Ceiling:** Strict 500 token budget per completion to ensure lightning-fast responses and minimal token spend.
- **Persona & Identity:** Rocket AI — witty, fiercely loyal raccoon created by Sandy (Nero Labs).
- **Zero-Disqualification:** No separate local LLM or redundant AI brain is created; all natural language reasoning stays with Luna.

### Discord Bot & Privacy Architecture
- **Framework:** Discord.js v14 client running 24/7.
- **Privacy Rule:** Personal browser and PC automation commands are strictly quarantined to **Private Direct Messages (DMs)** with Boss Sandy (`discordOwnerId`: `1477589102110183477`).
- **Zero Leakage:** Personal browsing actions, open tabs, URLs, or search terms are never exposed to public Discord server channels.

---

## 2. Rocket Browser Link Architecture Overview

```
 [Discord DMs (Owner Only)]
            │
            ▼ (Secure DM Command)
 [Rocket Bot (Discord / WebServer)] ◄─── (Luna GPT-6 AI Planner, 500 Token Budget)
            │
            ▼ (WebSocket: /ws/browser, Auth Token)
 [Rocket Windows Agent (C# / .NET)]
            │
            ├─► [Windows UI Automation & Win32 API] (Window focus, foreground, native hotkeys)
            │
            ▼ (Standard Chromium Native Messaging Protocol over stdin/stdout)
 [Opera GX Browser Extension (MV3)]
            │
            ├─► [Background Service Worker] (Tabs, Windows, Zoom, Downloads, Navigation)
            │
            └─► [Content Script (DOM)] (Clicks, Typing, Scrolling, Text Reading, Form Fill)
```

### Component Breakdown
1. **Opera GX Extension (`browser-extension/`)**:
   - Manifest V3 compliant.
   - Communicates via `chrome.runtime.connectNative("com.nerolabs.rocket.browserlink")`.
   - Comprehensive tab, window, zoom, download, history, and in-page DOM interaction.
   - Local-first fallback for offline tab management and navigation.

2. **Rocket Windows Agent (`windows-agent/`)**:
   - Lightweight C# .NET native application (`RocketBrowserAgent.exe`).
   - Implements Chromium Native Messaging binary framing (32-bit length header + UTF-8 JSON).
   - Manages outbound authenticated WebSocket connection to Rocket Cloud / local server.
   - Provides OS-level UI Automation, window focus, clipboard manipulation, and keyboard fallbacks.

3. **Rocket Cloud Bridge & Action Engine (`src/browser/`)**:
   - WebSocket server endpoint (`/ws/browser`) with authentication.
   - Strict action registry with parameter validation and permission tiers (Autonomous vs. Confirmation Required).
   - Natural language planner utilizing Luna (`gpt-6-luna`) for multi-step reasoning and regex-based fast paths for 1-word commands.

4. **Discord DM Controller (`src/discord/events/messageCreate.js`)**:
   - Listens exclusively in private DMs with Boss Sandy.
   - Intercepts browser commands, validates security permissions, executes sequentially, and streams status updates back to the DM.

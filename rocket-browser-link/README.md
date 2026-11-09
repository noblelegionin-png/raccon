# 🦝 Rocket Browser Link

**Autonomous Browser Control Ecosystem for Opera GX & Rocket AI**

Rocket Browser Link enables Rocket to intuitively understand natural language commands and control the user's Opera GX browser seamlessly on Windows 11. The user speaks to Rocket privately through Discord Direct Messages (DMs), and Rocket translates the intention into sequential browser operations.

---

## 🚀 Key Features

- **Single-Word Shortcuts:**
  - `"YouTube"` — Opens YouTube in a new tab.
  - `"Back"` — Navigates backward in history.
  - `"Zoom out"` / `"Zoom in"` / `"Zoom reset"` — Adjusts browser page zoom.
  - `"Clean"` — Closes duplicate tabs and organizes active session.
  - `"Copy"` — Copies selected or requested text to system clipboard.
  - `"Remember"` — Extracts page summary and saves to durable memory.
  - `"Logout"` — Safe logout confirmation flow.
  - `"Download"` — Lists recent downloads.
  - `"Research <topic>"` — Performs multi-tab research and delivers page highlights.

- **Complex Conversational Multi-Step Instructions:**
  - *"Open YouTube, search for Minecraft shaders, open the third result, zoom in, and copy the description."*
  - Decomposed by Luna (`gpt-6-luna`) into sequential action steps, respecting the strict 500 token budget.

- **Direct Discord DMs (Zero Public Leakage):**
  - Personal browser controls are received exclusively in private DMs with Boss Sandy (`1477589102110183477`).
  - Strict rejection of all unauthorized users.

- **Zero-Dependency Native Windows Agent (C# / .NET):**
  - Compiled using native Windows compiler into `RocketBrowserAgent.exe`.
  - Connects to Opera GX via Chromium Native Messaging (`com.nerolabs.rocket.browserlink`).
  - Supports Win32 window focus, clipboard manipulation, and OS keyboard shortcuts.

- **Manifest V3 Extension:**
  - Lightweight, event-driven background service worker.
  - In-page DOM reading, clicking, typing, scrolling, and form filling.
  - Built-in popup for local-first offline actions.

---

## 📁 Repository Structure

```
rocket-browser-link/
├── browser-extension/        # Manifest V3 Opera GX Extension
│   ├── manifest.json         # Extension Manifest
│   ├── background.js         # Service Worker & Native Messaging Client
│   ├── content.js            # In-page DOM Reader & Action Executor
│   ├── permissions.js        # Sensitive Field Blacklist & Sanitizer
│   ├── popup.html / js       # Extension Popup Interface
│   └── icons/                # Extension Icons (16, 48, 128px)
├── windows-agent/            # C# .NET Native Messaging & Automation Agent
│   ├── Program.cs            # Entry Point & Command Routing
│   ├── NativeMessaging.cs    # Chromium Native Messaging Protocol (stdin/stdout)
│   ├── BrowserController.cs  # Win32 Window Focus, Hotkeys & Clipboard
│   ├── CloudConnection.cs    # Authenticated WebSocket Client (ClientWebSocket)
│   ├── MiniJson.cs           # Zero-Dependency C# JSON Parser & Serializer
│   ├── Logging.cs            # Masked File Logger
│   ├── build.ps1             # PowerShell C# Build Script
│   └── compile_agent.bat     # Quick Compilation Batch Wrapper
├── shared/
│   └── protocol/
│       ├── actions.json      # Canonical Action Registry & Risk Tiers
│       └── browserProtocol.js# Protocol Frames & Message Types
├── installer/
│   ├── install.bat / ps1     # 1-Click Manifest & Registry Installer
│   └── uninstall.bat / ps1   # Clean Registry Uninstaller
├── tests/                    # Automated Test Suite (10 passing tests)
│   ├── actionRegistry.test.js
│   ├── browserPlanner.test.js
│   ├── nativeProtocol.test.js
│   └── securityPermissions.test.js
└── docs/
    ├── ARCHITECTURE.md       # Architecture Assessment & Design
    ├── SETUP.md              # Opera GX & Discord DM Setup Guide
    └── SECURITY.md           # Privacy & Confirmation Protocols
```

---

## 🛠️ Quick Installation

1. Run the installer:
   ```cmd
   D:\nero-labs-telegram-bot\rocket-browser-link\installer\install.bat
   ```
2. In Opera GX, open `opera://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select:
   ```
   D:\nero-labs-telegram-bot\rocket-browser-link\browser-extension
   ```
5. Message Rocket in Discord DMs!

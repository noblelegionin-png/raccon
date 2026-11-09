# Rocket Browser Link — Step-by-Step Setup Guide

Follow these steps to set up **Rocket Browser Link** on your Windows 11 PC for Opera GX.

---

### Step 1: Run the One-Click Installer
1. Navigate to the installer folder:
   ```
   D:\nero-labs-telegram-bot\rocket-browser-link\installer
   ```
2. Double-click `install.bat` (or run `install.ps1` in PowerShell).
3. The installer will:
   - Compile the C# Windows Agent (`RocketBrowserAgent.exe`).
   - Generate the Native Messaging manifest with your local path.
   - Register the Native Messaging host in the Windows Registry for Opera GX, Opera Stable, Chrome, and Edge.
   - Run a diagnostic self-test to verify clipboard and process automation.

---

### Step 2: Load the Extension in Opera GX
1. Launch **Opera GX**.
2. In the address bar, type `opera://extensions` and press Enter.
3. Toggle on **Developer mode** in the upper-right corner.
4. Click the **Load unpacked** button in the upper-left toolbar.
5. In the folder browser, select:
   ```
   D:\nero-labs-telegram-bot\rocket-browser-link\browser-extension
   ```
6. Click **Select Folder**. The **Rocket Browser Link** extension icon (`🦝`) will appear in your toolbar!

---

### Step 3: Verify Connection
1. Click the `🦝` extension icon in the Opera GX toolbar.
2. You will see the status badge switch to **ONLINE**.
3. You can click **🧹 Clean Tabs** or **🔍 Zoom (100%)** to test immediate local actions.

---

### Step 4: Talk to Rocket in Discord DMs!
1. Open Discord on your phone or PC.
2. Go to **Direct Messages** with Rocket AI.
3. Type any browser command naturally:
   - `"YouTube"` — opens YouTube immediately.
   - `"Zoom out"` — decreases zoom level.
   - `"Clean tabs"` — closes duplicate tabs and organizes your session.
   - `"Research Minecraft Bedrock addons"` — opens a search tab and extracts page highlights.
   - `"Back"` — navigates back in history.
   - `"Copy"` — copies the active page text or requested snippet.
   - `"Open YouTube, search for lofi hip hop, and open the first video"` — multi-step autonomous execution.

---

### Troubleshooting
- **Status shows LOCAL ONLY:**
  - Make sure `install.bat` was run so the Windows Registry contains the Native Messaging Host key.
  - Check the log file at `D:\nero-labs-telegram-bot\rocket-browser-link\windows-agent\logs\rocket-browser-agent.log`.
- **Discord DM doesn't respond:**
  - Remember that only **Boss Sandy** (`1477589102110183477`) is authorized to give browser and PC commands. Rocket ignores all unauthorized DMs for strict privacy.

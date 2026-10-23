# N3R0 Companion Android App

Official companion Android APK for **N3R0 — Minecraft Bedrock AI Companion** inside BlueStacks 5 or on Android devices.

## Features
- **Live Bridge Connection State**: Displays active WebSocket status, session ID, latency, and idle timeout.
- **Background Bridge Service**: Runs a lightweight Android Foreground Service (`NeroBridgeService`) to maintain bridge connectivity while Minecraft Bedrock is in the foreground.
- **Quick Companion Actions**:
  - **Summon N3R0**: Teleports/spawns the companion to the player's exact coordinates.
  - **Clear Hostile Mobs**: Safely eliminates nearby hostile mobs within a 30-block radius without harming players or companion entities.
- **Realtime Telemetry & Diagnostics**: Displays recent bridge requests, execution results, and game events.

---

## BlueStacks 5 Networking Configuration

When running inside BlueStacks 5 on Windows 11:
- To access the host Windows machine (where the Nero Labs backend is running on port `3001`):
  - **Host URL**: `http://10.0.2.2:3001` (Standard Android emulator host loopback)
  - Alternatively, use your local LAN IP (e.g., `http://192.168.1.X:3001`).

---

## Building the APK

### Prerequisites
- Android Studio Iguana+ OR JDK 17+ with Android SDK Build-Tools 34.0.0.

### Build Commands
```bash
cd companion_apk
./gradlew assembleDebug
```
The compiled APK will be located at:
`companion_apk/app/build/outputs/apk/debug/app-debug.apk`

### Installing into BlueStacks 5
1. Open BlueStacks 5.
2. Drag and drop `app-debug.apk` onto the BlueStacks window, OR run:
```powershell
adb install companion_apk/app/build/outputs/apk/debug/app-debug.apk
```
3. Open the **N3R0 Companion** app and click **Connect**.

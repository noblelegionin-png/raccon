# N3R0 BlueStacks 5 Bridge & ADB Port Forwarder
# Configures reverse port-forwarding between Windows host and BlueStacks 5 Android environment

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   N3R0 AI Companion - BlueStacks 5 Bridge Setup  " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Locate ADB executable
$adbPaths = @(
    "C:\Program Files\BlueStacks_nxt\HD-Adb.exe",
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "adb.exe"
)

$adbCmd = $null
foreach ($path in $adbPaths) {
    if (Test-Path $path) {
        $adbCmd = $path
        break
    }
}

if (-not $adbCmd) {
    Write-Host "[!] ADB executable not found in default BlueStacks or SDK paths." -ForegroundColor Yellow
    Write-Host "    You can still connect directly from Bedrock using: /connect 10.0.2.2:3001/ws/minecraft" -ForegroundColor Green
    exit 0
}

Write-Host "[+] Found ADB: $adbCmd" -ForegroundColor Green

# 2. Check connected devices
Write-Host "[*] Checking connected BlueStacks instances..." -ForegroundColor White
$devices = & $adbCmd devices
Write-Host $devices

# 3. Setup port reverse (maps port 3001 inside BlueStacks to port 3001 on Windows host)
Write-Host "[*] Configuring ADB reverse port 3001..." -ForegroundColor White
try {
    & $adbCmd -s 127.0.0.1:5555 reverse tcp:3001 tcp:3001
    Write-Host "[+] ADB Reverse Port 3001 configured successfully!" -ForegroundColor Green
} catch {
    Write-Host "[-] ADB reverse failed: $_" -ForegroundColor Yellow
}

# 4. Verify local Nero Labs Backend
Write-Host "[*] Testing local Nero Labs backend status..." -ForegroundColor White
try {
    $res = Invoke-RestMethod -Uri "http://localhost:3001/api/minecraft/status" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[+] Nero Labs Backend is ONLINE! Bridge ready: $($res.online)" -ForegroundColor Green
} catch {
    Write-Host "[!] Backend is currently not running on port 3001. Please run 'npm start' in another terminal." -ForegroundColor Yellow
}

# 5. Instructions for Player
Write-Host "`n--------------------------------------------------" -ForegroundColor Cyan
Write-Host "  HOW TO CONNECT IN MINECRAFT BEDROCK (BLUESTACKS):" -ForegroundColor White
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "1. In BlueStacks 5, launch Minecraft Bedrock Edition."
Write-Host "2. Open your world with Cheats ENABLED and Beta APIs toggled ON."
Write-Host "3. In world chat, enter either of these commands:"
Write-Host "   Option A (via ADB reverse):  /connect localhost:3001/ws/minecraft" -ForegroundColor Green
Write-Host "   Option B (emulator default): /connect 10.0.2.2:3001/ws/minecraft" -ForegroundColor Green
Write-Host "4. You will see: 'Connection established to [nero-labs-minecraft-bridge]'" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

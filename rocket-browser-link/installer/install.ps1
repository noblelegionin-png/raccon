# Rocket Browser Link - Automated Installation & Registry Configuration
$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "ROCKET BROWSER LINK - ONE-CLICK SETUP AND INSTALLER" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$scriptDir = $PSScriptRoot
$projectRoot = Split-Path $scriptDir -Parent
$agentDir = Join-Path $projectRoot "windows-agent"
$extensionDir = Join-Path $projectRoot "browser-extension"
$agentExe = Join-Path $agentDir "RocketBrowserAgent.exe"
$manifestPath = Join-Path $agentDir "com.nerolabs.rocket.browserlink.json"

# 1. Compile C# Native Windows Agent if needed
Write-Host "`n[1/4] Verifying Windows Agent binary..." -ForegroundColor Yellow
if (-not (Test-Path $agentExe)) {
    Write-Host "Compiling RocketBrowserAgent.exe from C# source..." -ForegroundColor Gray
    $buildScript = Join-Path $agentDir "build.ps1"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $buildScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to compile Windows Agent."
        exit 1
    }
} else {
    Write-Host "[OK] Windows Agent binary exists: $agentExe" -ForegroundColor Green
}

# 2. Generate Manifest with Absolute Path
Write-Host "`n[2/4] Generating Native Messaging Host manifest..." -ForegroundColor Yellow
$escapedPath = $agentExe.Replace('\', '\\')
$jsonContent = "{`n  `"name`": `"com.nerolabs.rocket.browserlink`",`n  `"description`": `"Rocket Browser Link Native Messaging Host for Opera GX`",`n  `"path`": `"$escapedPath`",`n  `"type`": `"stdio`",`n  `"allowed_origins`": [`n    `"chrome-extension://*`"`n  ]`n}"
Set-Content -Path $manifestPath -Value $jsonContent -Encoding UTF8
Write-Host "[OK] Manifest written to $manifestPath" -ForegroundColor Green

# 3. Register in Windows Registry
Write-Host "`n[3/4] Registering Native Messaging Host in Windows Registry..." -ForegroundColor Yellow

$regTargets = @(
    "HKCU:\Software\Opera Software\Opera GX Stable\NativeMessagingHosts\com.nerolabs.rocket.browserlink",
    "HKCU:\Software\Opera Software\Opera Stable\NativeMessagingHosts\com.nerolabs.rocket.browserlink",
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.nerolabs.rocket.browserlink",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.nerolabs.rocket.browserlink"
)

foreach ($target in $regTargets) {
    try {
        if (-not (Test-Path $target)) {
            New-Item -Path $target -Force | Out-Null
        }
        Set-ItemProperty -Path $target -Name "(Default)" -Value $manifestPath
        Write-Host "  Registered: $target" -ForegroundColor Gray
    } catch {
        Write-Host "  Could not register in $target (non-critical)" -ForegroundColor DarkGray
    }
}
Write-Host "[OK] Native Messaging Host registered in Registry!" -ForegroundColor Green

# 4. Diagnostic Self-Test
Write-Host "`n[4/4] Running Windows Agent self-test..." -ForegroundColor Yellow
& $agentExe --test

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "ROCKET BROWSER LINK INSTALLED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Next Step (Opera GX):" -ForegroundColor White
Write-Host "1. Open Opera GX and navigate to: opera://extensions" -ForegroundColor White
Write-Host "2. Enable 'Developer mode' in the top-right toggle." -ForegroundColor White
Write-Host "3. Click 'Load unpacked' and select this folder:" -ForegroundColor White
Write-Host "   $extensionDir" -ForegroundColor Yellow
Write-Host "4. Message Rocket in Discord DMs to control your browser!" -ForegroundColor Green

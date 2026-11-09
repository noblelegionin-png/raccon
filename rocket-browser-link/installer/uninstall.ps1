# Rocket Browser Link — Uninstallation Script
$ErrorActionPreference = "SilentlyContinue"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "🧹 UNINSTALLING ROCKET BROWSER LINK" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# Terminate running agent if any
Get-Process -Name "RocketBrowserAgent" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "• Stopped any running RocketBrowserAgent processes." -ForegroundColor Gray

# Remove registry keys
$regTargets = @(
    "HKCU:\Software\Opera Software\Opera GX Stable\NativeMessagingHosts\com.nerolabs.rocket.browserlink",
    "HKCU:\Software\Opera Software\Opera Stable\NativeMessagingHosts\com.nerolabs.rocket.browserlink",
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.nerolabs.rocket.browserlink",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.nerolabs.rocket.browserlink"
)

foreach ($target in $regTargets) {
    if (Test-Path $target) {
        Remove-Item -Path $target -Recurse -Force
        Write-Host "• Removed registry key: $target" -ForegroundColor Gray
    }
}

Write-Host "`n✅ Uninstallation complete! Registry keys cleaned." -ForegroundColor Green
Write-Host "To remove the extension, visit opera://extensions and click Remove on 'Rocket Browser Link'." -ForegroundColor White

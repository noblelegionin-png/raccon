$csc = "C:\WINDOWS\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\WINDOWS\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $csc)) {
    Write-Error "C# compiler csc.exe not found!"
    exit 1
}

$dir = $PSScriptRoot
if (-not $dir) { $dir = "D:\nero-labs-telegram-bot\rocket-browser-link\windows-agent" }
$outExe = Join-Path $dir "RocketBrowserAgent.exe"

$srcFiles = @(
    (Join-Path $dir "Program.cs"),
    (Join-Path $dir "MiniJson.cs"),
    (Join-Path $dir "NativeMessaging.cs"),
    (Join-Path $dir "BrowserController.cs"),
    (Join-Path $dir "CloudConnection.cs"),
    (Join-Path $dir "Logging.cs")
)

Write-Host "Compiling Rocket Browser Agent (C# / .NET)..." -ForegroundColor Cyan
& $csc /target:exe /platform:anycpu /optimize+ /r:System.dll,System.Core.dll,System.Windows.Forms.dll /out:"$outExe" $srcFiles

if ($LASTEXITCODE -ne 0) {
    Write-Error "Compilation failed with code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "✅ Built: $outExe" -ForegroundColor Green
Write-Host "Running diagnostic self-test..." -ForegroundColor Yellow
& $outExe --test

@echo off
title N3R0 Minecraft AI Companion - 1-Click Launcher
color 0b
echo ===================================================
echo     N3R0 MINECRAFT AI COMPANION - 1-CLICK LAUNCHER
echo ===================================================
echo.

:: 1. Copy packs to BlueStacks shared folder automatically
echo [*] Auto-syncing packs into BlueStacks...
copy /Y "D:\nero-labs-telegram-bot\packs\dist\*.mcpack" "D:\BlueStacks_nxt\Engine\UserData\SharedFolder\" >nul

:: 2. Check and start backend
netstat -ano | findstr :3001 >nul
if %errorlevel% neq 0 (
    echo [*] Starting Nero AI Backend on port 3001...
    start /min "Nero Labs Backend" cmd /c "cd /d D:\nero-labs-telegram-bot && npm start"
    timeout /t 3 /nobreak >nul
) else (
    echo [+] Nero AI Backend is online on port 3001.
)

:: 3. Launch BlueStacks 5
echo [*] Launching BlueStacks 5...
start "" "C:\Program Files\BlueStacks_nxt\HD-Player.exe" --instance Pie64

:: 4. Auto-setup bridge in background
start /min "N3R0 Bridge Auto-Connect" cmd /c "timeout /t 12 /nobreak >nul && "C:\Program Files\BlueStacks_nxt\HD-Adb.exe" connect 127.0.0.1:5555 >nul 2>&1 && "C:\Program Files\BlueStacks_nxt\HD-Adb.exe" -s 127.0.0.1:5555 reverse tcp:3001 tcp:3001 >nul 2>&1"

echo.
echo ===================================================
echo   YOU'RE READY TO PLAY!
echo ===================================================
echo.
echo 1. In Minecraft world chat, type just ONE command:
echo      /connect localhost:3001/ws/minecraft
echo.
echo 2. In Telegram, text Nero:
echo      give me 64 diamonds
echo      spawn 3 wolves
echo.
echo ===================================================
pause

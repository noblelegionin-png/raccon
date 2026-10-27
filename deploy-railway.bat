@echo off
title Nero Labs - Deploy to Railway (24/7 WhatsApp & Telegram Bot)
cd /d "d:\nero-labs-telegram-bot"
echo ====================================================
echo ⚡ NERO LABS — RAILWAY 24/7 LIVE CLOUD DEPLOYMENT
echo ====================================================
echo.
echo [1/3] Verifying Railway CLI status...
call npx @railway/cli whoami
if %errorlevel% neq 0 (
    echo.
    echo [ACTION REQUIRED] Please log in to Railway to continue.
    echo A browser window will open for 1-click Railway authorization:
    call npx @railway/cli login
)

echo.
echo [2/3] Linking or initializing Railway Project...
call npx @railway/cli link

echo.
echo [3/3] Deploying Nero Bot with 24/7 WhatsApp Bridge to Railway...
call npx @railway/cli up --detach

echo.
echo ====================================================
echo 🚀 DEPLOYMENT TRIGGERED TO RAILWAY!
echo To view live logs: npx @railway/cli logs
echo ====================================================
pause

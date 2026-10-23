@echo off
title Nero Labs AI - 24/7 Service Manager
cd /d "d:\nero-labs-telegram-bot"
echo ====================================================
echo ⚡ NERO LABS AI — STARTING 24/7 BACKGROUND SERVICE
echo ====================================================
call npx pm2 start ecosystem.config.cjs
call npx pm2 save
echo.
echo [STATUS] Nero Labs AI Bot and Cloudflare Tunnel are running in the background!
echo [RESILIENCE] Auto-restart on crash: ACTIVE
echo.
call npx pm2 status
pause

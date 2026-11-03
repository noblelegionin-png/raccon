@echo off
title Rocket AI - Service Status
cd /d "d:\nero-labs-telegram-bot"
call npx pm2 status
pause

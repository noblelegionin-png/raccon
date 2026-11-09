@echo off
setlocal
echo ====================================================
echo 🛠️ BUILDING ROCKET BROWSER AGENT
echo ====================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    exit /b %errorlevel%
)
echo.
echo ====================================================
echo 🚀 BUILD AND SELF-TEST COMPLETED!
echo ====================================================

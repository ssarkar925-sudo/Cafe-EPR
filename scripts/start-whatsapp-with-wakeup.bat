@echo off
title WhatsApp Gateway ^& 5-Min Wakeup Keeper
cd /d "%~dp0\.."

echo ========================================================
echo   DigitalCafe ERP - WhatsApp Gateway + 5-Min Wakeup Keeper
echo ========================================================

rem Start Render 5-minute keep-alive ping in background
start "Render 5-Min Wakeup" /b node scripts\render-5min-wakeup.js

rem Check if WhatsApp Gateway is already running on port 3001
netstat -ano | findstr /R /C:":3001 .*LISTENING" >nul
if %errorlevel% equ 0 (
    echo [%date% %time%] WhatsApp Gateway is already running on port 3001.
    exit /b 0
)

:loop
echo [%date% %time%] Starting Local WhatsApp Gateway on port 3001...
node scripts\whatsapp-gateway.js
echo [%date% %time%] Gateway stopped with code %errorlevel%. Restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop

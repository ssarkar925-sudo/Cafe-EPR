@echo off
title Smart Business Suite - WhatsApp Gateway 24/7
cd /d "%~dp0\.."

rem Check if WhatsApp Gateway is already running on port 3001
netstat -ano | findstr /R /C:":3001 .*LISTENING" >nul
if %errorlevel% equ 0 (
    echo [%date% %time%] WhatsApp Gateway is already running on port 3001.
    exit /b 0
)

:loop
echo [%date% %time%] Starting WhatsApp Gateway on port 3001...
node scripts\whatsapp-gateway.js
echo [%date% %time%] WhatsApp Gateway stopped with code %errorlevel%. Restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop

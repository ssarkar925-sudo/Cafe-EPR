@echo off
title Smart Business Suite - WhatsApp Gateway 24/7
echo ========================================================
echo   Smart Business Suite - Local WhatsApp Gateway 24/7
echo ========================================================
echo.
echo Starting WhatsApp Baileys Gateway Server on port 3001...
echo Leave this window open, or double-click start-whatsapp-background.vbs to run silently.
echo.

cd /d "%~dp0\.."
node scripts/whatsapp-gateway.js
pause

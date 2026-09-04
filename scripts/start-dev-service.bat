@echo off
title CafeERP Local Dev Server 24/7
cd /d "%~dp0\.."

rem Check if Dev Server is already running on port 3000
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if %errorlevel% equ 0 (
    echo [%date% %time%] Dev Server is already running on port 3000.
    exit /b 0
)

:loop
echo [%date% %time%] Starting CafeERP Dev Server on port 3000...
npm run dev
echo [%date% %time%] Dev Server stopped with code %errorlevel%. Restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop

@echo off
setlocal
title Cafe ERP
cd /d E:\CafeERP
if not exist package.json (
  echo ERROR: Cafe ERP not found at E:\CafeERP
  pause
  exit /b 1
)
echo Starting Cafe ERP from E:\CafeERP...
echo.
call npm run dev
pause

@echo off
setlocal EnableExtensions
title Cafe ERP - One Click Patch Installer

REM ============================================================
REM PERMANENT INSTALLER
REM Put this BAT directly inside:
REM     E:\CafeERP\INSTALL-PATCH.bat
REM
REM Put patch ZIP files inside:
REM     E:\CafeERP\PATCHES\
REM
REM Then double-click this BAT.
REM ============================================================

set "TARGET=E:\CafeERP"
set "PATCHDIR=%TARGET%\PATCHES"
set "TEMP=%TEMP%\CafeERP_Patch_%RANDOM%%RANDOM%"

echo.
echo ============================================================
echo              CAFE ERP - ONE CLICK PATCH
echo ============================================================
echo Target : %TARGET%
echo Patches: %PATCHDIR%
echo.

if not exist "%TARGET%\package.json" (
    echo ERROR: package.json was not found.
    echo This installer must be installed at E:\CafeERP
    echo.
    pause
    exit /b 1
)

if not exist "%PATCHDIR%" mkdir "%PATCHDIR%"

echo Available patch ZIP files:
echo.
dir /b /a-d "%PATCHDIR%\*.zip" 2>nul
if errorlevel 1 (
    echo.
    echo No patch ZIP found.
    echo.
    echo Put the patch ZIP here:
    echo %PATCHDIR%
    echo.
    pause
    exit /b 1
)

echo.
set /p "ZIPNAME=Enter patch ZIP filename (or press Enter for newest): "

if "%ZIPNAME%"=="" (
    for /f "delims=" %%F in ('dir /b /a-d /o-d "%PATCHDIR%\*.zip"') do (
        set "ZIPNAME=%%F"
        goto :gotzip
    )
)

:gotzip
if not exist "%PATCHDIR%\%ZIPNAME%" (
    echo.
    echo ERROR: Patch ZIP not found:
    echo %PATCHDIR%\%ZIPNAME%
    echo.
    pause
    exit /b 1
)

echo.
echo Selected:
echo %PATCHDIR%\%ZIPNAME%
echo.

if exist "%TEMP%" rmdir /s /q "%TEMP%"
mkdir "%TEMP%"

echo [1/5] Extracting patch...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%PATCHDIR%\%ZIPNAME%' -DestinationPath '%TEMP%' -Force"
if errorlevel 1 (
    echo ERROR: Could not extract patch.
    rmdir /s /q "%TEMP%" 2>nul
    pause
    exit /b 1
)

REM If ZIP has one top-level folder, use it as patch root.
set "PATCHROOT=%TEMP%"
for /f "delims=" %%D in ('dir /b /ad "%TEMP%" 2^>nul') do (
    if not exist "%TEMP%\%%D\package.json" (
        set "PATCHROOT=%TEMP%\%%D"
    )
)

echo [2/5] Copying patch files...
REM Never overwrite environment files, dependencies, build output,
REM git metadata, or this installer.
robocopy "%PATCHROOT%" "%TARGET%" /E /R:2 /W:1 ^
  /XD "node_modules" ".next" ".git" "PATCHES" ^
  /XF ".env" ".env.local" "INSTALL-PATCH.bat" "*.zip"
if errorlevel 8 (
    echo ERROR: Patch copy failed.
    rmdir /s /q "%TEMP%" 2>nul
    pause
    exit /b 1
)

set "NEED_INSTALL=0"
if exist "%PATCHROOT%\package.json" set "NEED_INSTALL=1"
if exist "%PATCHROOT%\package-lock.json" set "NEED_INSTALL=1"

echo [3/5] Dependency check...
if "%NEED_INSTALL%"=="1" (
    echo Dependency files changed. Running npm install...
    pushd "%TARGET%"
    call npm install
    if errorlevel 1 (
        popd
        echo ERROR: npm install failed.
        rmdir /s /q "%TEMP%" 2>nul
        pause
        exit /b 1
    )
    popd
) else (
    echo No dependency files changed.
    echo npm install SKIPPED.
)

echo [4/5] Production build...
pushd "%TARGET%"
call npm run build
if errorlevel 1 (
    popd
    echo.
    echo ============================================================
    echo PATCH COPIED, BUT BUILD FAILED
    echo ============================================================
    echo.
    echo Review the build error above.
    echo Your existing .env/.env.local was preserved.
    rmdir /s /q "%TEMP%" 2>nul
    pause
    exit /b 1
)
popd

echo [5/5] Cleaning temporary files...
rmdir /s /q "%TEMP%" 2>nul

echo.
echo ============================================================
echo                 PATCH INSTALLED SUCCESSFULLY
echo ============================================================
echo.
echo Project       : E:\CafeERP
echo npm install   : %NEED_INSTALL%
echo npm run build : PASSED
echo.
echo IMPORTANT:
echo Supabase SQL migrations are NOT executed automatically.
echo Apply database migrations separately after review.
echo.
echo You can now start the ERP:
echo.
echo     cd /d E:\CafeERP
echo     npm run dev
echo.
echo The patch ZIP can remain in E:\CafeERP\PATCHES as a record.
echo.
pause
exit /b 0

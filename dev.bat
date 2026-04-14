@echo off
chcp 65001 >nul 2>&1
title NewShell Dev Server
color 0A

echo ============================================
echo    NewShell SSH - Development Server
echo ============================================
echo.
echo [1/3] Checking dependencies...

where go >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Go not found in PATH. Please install Go and restart.
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found in PATH. Please install Node.js and restart.
    pause
    exit /b 1
)

echo [OK] Go and Node.js found.
echo.
echo [2/3] Starting backend server (Go :29800)...
echo.

start "NewShell Backend" cmd /k "cd /d %~dp0server && go run main.go"

timeout /t 2 /nobreak >nul

echo [3/3] Starting frontend dev server (Vite :1420)...
echo.

start "NewShell Frontend" cmd /k "cd /d %~dp0 && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo    Dev servers started successfully!
echo ============================================
echo.
echo  Backend:  http://localhost:29800
echo  Frontend: http://localhost:1420
echo.
echo  Closing these windows will stop the servers.
echo  Press any key to open Frontend in browser...
echo ============================================
pause >nul

start http://localhost:1420

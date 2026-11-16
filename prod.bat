@echo off
SETLOCAL EnableDelayedExpansion

REM ============================================
REM NEO Production Simulation Script (Windows)
REM Runs ONLY the Electron Frontend with prd config
REM Connects to cloud-hosted Backend + AI Agent
REM ============================================

echo ============================================
echo     NEO Production Simulation (Testing)
echo ============================================
echo.

REM Navigate to project root
cd /d "%~dp0"

REM Check for Doppler CLI
doppler --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Doppler CLI not found.
    echo         Install from: https://docs.doppler.com/docs/cli
    GOTO :EOF
)
echo [OK] Doppler CLI found

REM ============================================
REM Setup Frontend (Electron)
REM ============================================
echo.
echo [SETUP] Setting up Electron Frontend...
cd Frontend\electron

REM Install npm dependencies
IF NOT EXIST "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)

REM Build TypeScript + renderer bundle
echo Building app...
call npm run build

REM ============================================
REM Start Frontend with prd config
REM ============================================
echo.
echo [START] Starting Frontend with prd config...
echo.
echo   Backend:  cloud-hosted (from BACKEND_URL in prd config)
echo   AI Agent: cloud-hosted (via LiveKit Cloud)
echo   Auth:     bypassed (BYPASS_AUTH=true in prd config)
echo   Mode:     testing (NODE_ENV=testing, skips to voice screen)
echo.
echo ============================================
echo.

doppler run --config prd -- npx electron .

ENDLOCAL

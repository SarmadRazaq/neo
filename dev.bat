@echo off
SETLOCAL EnableDelayedExpansion

REM ============================================
REM NEO Development Startup Script (Windows)
REM Runs Backend, AI Agent, and Electron Frontend
REM Each service runs in its own terminal window
REM ============================================

echo ============================================
echo        NEO Development Environment
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

REM Check for uv (Python package manager for AI)
uv --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [WARN] uv not found. AI Agent will not start.
    echo        Install from: https://docs.astral.sh/uv/
    SET UV_AVAILABLE=0
) ELSE (
    echo [OK] uv found
    SET UV_AVAILABLE=1
)

REM ============================================
REM Setup Backend (NestJS)
REM ============================================
echo.
echo [SETUP] Setting up NestJS Backend...
cd Backend

REM Install npm dependencies
IF NOT EXIST "node_modules" (
    echo Installing backend dependencies...
    call npm install
)

REM Generate Prisma client
echo Generating Prisma client...
call npx prisma generate

cd ..

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

cd ..\..

REM ============================================
REM Setup AI Agent (Python/LiveKit)
REM ============================================
IF %UV_AVAILABLE%==1 (
    echo.
    echo [SETUP] Setting up AI Agent...
    cd AI
    echo Syncing Python dependencies...
    call uv sync
    cd ..
)

REM ============================================
REM Start Services (each in its own window)
REM ============================================
echo.
echo [START] Starting development servers...
echo.

REM Start backend in new window with colored title
echo [1/3] Starting Backend (NestJS) on port 3000...
start "NEO Backend - Port 3000" cmd /k "title NEO Backend && color 0A && cd /d %~dp0Backend && doppler run -- npm run start:dev"

REM Wait for backend to initialize
timeout /t 3 /nobreak >nul

REM Start AI Agent in new window
IF %UV_AVAILABLE%==1 (
    echo [2/3] Starting AI Agent (LiveKit)...
    REM PYTHONUNBUFFERED=1 ensures logs are output immediately
    REM PYTHONIOENCODING=utf-8 fixes Unicode encoding issues with Rich console
    REM chcp 65001 sets console to UTF-8 code page
    REM NOTE: Using 'start' instead of 'dev' because 'dev' mode uses Unix IPC which fails on Windows
    start "NEO AI Agent" cmd /k "title NEO AI Agent && chcp 65001 >nul && cd /d %~dp0AI && set PYTHONUNBUFFERED=1 && set PYTHONIOENCODING=utf-8 && set NO_COLOR=1 && doppler run -- uv run python src/neo_agent.py start"
) ELSE (
    echo [2/3] Skipping AI Agent (uv not available)
)

REM Wait for AI agent to initialize
timeout /t 2 /nobreak >nul

REM Start frontend in new window
echo [3/3] Starting Frontend (Electron)...
start "NEO Frontend" cmd /k "title NEO Frontend && color 0E && cd /d %~dp0Frontend\electron && doppler run -- npm run dev"

echo.
echo ============================================
echo   All services started in separate windows!
echo ============================================
echo.
echo   [Green Window]  Backend API:  http://localhost:3000/api
echo   [Cyan Window]   AI Agent:     LiveKit voice assistant
echo   [Yellow Window] Frontend:     Electron app
echo.
echo   Close each terminal window to stop that service
echo   Or close this window to keep services running
echo.

ENDLOCAL

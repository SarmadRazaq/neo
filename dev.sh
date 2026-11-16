#!/bin/bash

# ============================================
# NEO Development Startup Script
# Runs Backend, AI Agent, and Electron Frontend
# Each service has color-coded log output
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Service prefixes with colors
BACKEND_PREFIX="${GREEN}[Backend]${NC}"
AI_PREFIX="${CYAN}[AI Agent]${NC}"
FRONTEND_PREFIX="${YELLOW}[Frontend]${NC}"

echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        NEO Development Environment        ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
echo ""

# Check for Doppler CLI
if ! command -v doppler &> /dev/null; then
    echo -e "${RED}❌ Doppler CLI not found.${NC}"
    echo -e "   Install from: https://docs.doppler.com/docs/cli"
    exit 1
fi
echo -e "${GREEN}✓ Doppler CLI found${NC}"

# Check for uv (Python package manager)
UV_AVAILABLE=1
if ! command -v uv &> /dev/null; then
    echo -e "${YELLOW}⚠ uv not found. AI Agent will not start.${NC}"
    echo -e "   Install from: https://docs.astral.sh/uv/"
    UV_AVAILABLE=0
else
    echo -e "${GREEN}✓ uv found${NC}"
fi

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============================================
# Setup Backend (NestJS)
# ============================================
echo ""
echo -e "${YELLOW}📦 Setting up NestJS Backend...${NC}"
cd Backend

# Install npm dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

cd ..

# ============================================
# Setup Frontend (Electron)
# ============================================
echo ""
echo -e "${YELLOW}📦 Setting up Electron Frontend...${NC}"
cd Frontend/electron

# Install npm dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

cd ../..

# ============================================
# Setup AI Agent (Python/LiveKit)
# ============================================
if [ $UV_AVAILABLE -eq 1 ]; then
    echo ""
    echo -e "${YELLOW}📦 Setting up AI Agent...${NC}"
    cd AI
    echo "Syncing Python dependencies..."
    uv sync
    cd ..
fi

# ============================================
# Start Services with colored prefixes
# ============================================
echo ""
echo -e "${GREEN}🚀 Starting development servers...${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    # Kill all background jobs
    jobs -p | xargs -r kill 2>/dev/null
    wait 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Function to prefix output with service name
prefix_output() {
    local prefix="$1"
    while IFS= read -r line; do
        echo -e "${prefix} ${line}"
    done
}

# Start backend with prefixed output
echo -e "${GREEN}[1/3] Starting Backend (NestJS) on port 3000...${NC}"
cd Backend
(doppler run -- npm run start:dev 2>&1 | prefix_output "$BACKEND_PREFIX") &
BACKEND_PID=$!
cd ..

# Wait for backend to initialize
sleep 3

# Start AI Agent with prefixed output
if [ $UV_AVAILABLE -eq 1 ]; then
    echo -e "${CYAN}[2/3] Starting AI Agent (LiveKit)...${NC}"
    cd AI
    # PYTHONUNBUFFERED=1 ensures logs are output immediately without buffering
    # PYTHONIOENCODING=utf-8 fixes Unicode encoding issues on Windows
    # NO_COLOR=1 disables Rich fancy console output that causes encoding errors
    # NOTE: Using 'start' instead of 'dev' because 'dev' mode uses Unix IPC which fails on Windows/Git Bash
    (PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 NO_COLOR=1 doppler run -- uv run python src/neo_agent.py start 2>&1 | prefix_output "$AI_PREFIX") &
    AI_PID=$!
    cd ..
else
    echo -e "${YELLOW}[2/3] Skipping AI Agent (uv not available)${NC}"
fi

# Wait for AI agent to initialize
sleep 2

# Start frontend with prefixed output
echo -e "${YELLOW}[3/3] Starting Frontend (Electron)...${NC}"
cd Frontend/electron
(doppler run -- npm run dev 2>&1 | prefix_output "$FRONTEND_PREFIX") &
FRONTEND_PID=$!
cd ../..

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  All services started!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}[Backend]${NC}   API: http://localhost:3000/api"
echo -e "  ${CYAN}[AI Agent]${NC}  LiveKit voice assistant"
echo -e "  ${YELLOW}[Frontend]${NC}  Electron app"
echo ""
echo -e "  Press ${MAGENTA}Ctrl+C${NC} to stop all services"
echo ""
echo -e "${BLUE}───────────────────────────────────────────${NC}"
echo ""

# Wait for all background processes
wait

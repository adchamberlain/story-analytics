#!/bin/bash

# Story Analytics - Development Server Startup Script
# Starts all services needed for local development:
# - FastAPI backend (port 8000)
# - React app (port 3001) - primary frontend
#
# Usage:
#   ./dev.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where this script lives
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo -e "The .env file is required for API keys (e.g. ANTHROPIC_API_KEY)."
    echo -e "Create one based on .env.example:"
    echo -e "  ${YELLOW}cp .env.example .env${NC}"
    echo -e "Then edit .env with your credentials."
    exit 1
fi

# Cleanup function to kill all background processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    kill $API_PID $REACT_PID 2>/dev/null
    wait $API_PID $REACT_PID 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Story Analytics - Development Environment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Start FastAPI backend - logs go to /tmp/api.log
echo -e "${GREEN}[1/2] Starting API server on port 8000...${NC}"
echo -e "${YELLOW}    API logs: tail -f /tmp/api.log${NC}"
PYTHONUNBUFFERED=1 python -m uvicorn api.main:app --reload --port 8000 > /tmp/api.log 2>&1 &
API_PID=$!

# Start React app (primary frontend)
echo -e "${GREEN}[2/2] Starting React app on port 3001...${NC}"
(cd "$SCRIPT_DIR/app" && npm run dev) &
REACT_PID=$!

# Wait for services to start
sleep 2

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}All services running!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e ""
echo -e "  ${YELLOW}React Frontend:${NC}      http://localhost:3001"
echo -e "  ${YELLOW}API Server:${NC}          http://localhost:8000"
echo -e "  ${YELLOW}API Docs:${NC}            http://localhost:8000/docs"
echo -e ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${CYAN}Quick links:${NC}"
echo -e "    http://localhost:3001/dashboards (dashboard list)"
echo -e "    http://localhost:3001/library    (chart library)"
echo -e "    http://localhost:3001/sources    (data sources)"
echo -e "    http://localhost:3001/settings   (settings)"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${CYAN}API Logs:${NC} tail -f /tmp/api.log"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Press ${RED}Ctrl+C${NC} to stop all services"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Open React frontend login page in browser after a short delay
(sleep 3 && open "http://localhost:3001/dashboards") &

# Wait for all processes (keeps the script running)
wait

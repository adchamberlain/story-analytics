#!/bin/bash

# Story Analytics - Development Server Startup Script
# Starts all three services needed for local development:
# - FastAPI backend (port 8000)
# - Evidence dashboards (port 3000)
# - Frontend app (port 5173)
#
# Usage:
#   ./dev.sh           # Start all services
#   ./dev.sh --sources # Refresh Snowflake data before starting

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script lives
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo -e "The .env file is required for credentials (ANTHROPIC_API_KEY, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD)."
    echo -e "Create one based on .env.example:"
    echo -e "  ${YELLOW}cp .env.example .env${NC}"
    echo -e "Then edit .env with your credentials."
    exit 1
fi

# Parse arguments
REFRESH_SOURCES=false
for arg in "$@"; do
    case $arg in
        --sources)
            REFRESH_SOURCES=true
            shift
            ;;
    esac
done

# Cleanup function to kill all background processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    kill $API_PID $EVIDENCE_PID $FRONTEND_PID 2>/dev/null
    wait $API_PID $EVIDENCE_PID $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${BLUE}Starting Story Analytics development servers...${NC}\n"

# Optionally refresh Snowflake source data
if [ "$REFRESH_SOURCES" = true ]; then
    echo -e "${YELLOW}Refreshing Snowflake source data...${NC}"
    npm run sources
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to refresh sources. Continue anyway? (y/N)${NC}"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    echo -e "${GREEN}Sources refreshed.${NC}\n"
fi

# Start FastAPI backend
echo -e "${GREEN}[1/3] Starting API server on port 8000...${NC}"
python -m uvicorn api.main:app --reload --port 8000 &
API_PID=$!

# Start Evidence dashboards
echo -e "${GREEN}[2/3] Starting Evidence dashboards on port 3000...${NC}"
npm run dev &
EVIDENCE_PID=$!

# Start Frontend (run in subshell to avoid changing main script's working directory)
echo -e "${GREEN}[3/3] Starting Frontend on port 5173...${NC}"
(cd "$SCRIPT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}All services starting!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e ""
echo -e "  ${YELLOW}Frontend App:${NC}        http://localhost:5173"
echo -e "  ${YELLOW}Evidence Dashboards:${NC} http://localhost:3000"
echo -e "  ${YELLOW}API Server:${NC}          http://localhost:8000"
echo -e ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Press ${RED}Ctrl+C${NC} to stop all services"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Open frontend in browser after a short delay to let it start
(sleep 3 && open "http://localhost:5173") &

# Wait for all processes (this keeps the script running)
wait

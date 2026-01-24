#!/bin/bash

# Story Analytics - Development Server Startup Script
# Starts all services needed for local development:
# - FastAPI backend (port 8000)
# - Evidence dashboards (port 3000)
# - React app (port 3001) - new Plotly.js renderer
# - SvelteKit frontend (port 5173)
#
# Usage:
#   ./dev.sh              # Start all services
#   ./dev.sh --sources    # Refresh Snowflake data before starting
#   ./dev.sh --no-evidence # Skip Evidence (use React renderer only)

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
    echo -e "The .env file is required for credentials (ANTHROPIC_API_KEY, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD)."
    echo -e "Create one based on .env.example:"
    echo -e "  ${YELLOW}cp .env.example .env${NC}"
    echo -e "Then edit .env with your credentials."
    exit 1
fi

# Parse arguments
REFRESH_SOURCES=false
SKIP_EVIDENCE=false
for arg in "$@"; do
    case $arg in
        --sources)
            REFRESH_SOURCES=true
            shift
            ;;
        --no-evidence)
            SKIP_EVIDENCE=true
            shift
            ;;
    esac
done

# Cleanup function to kill all background processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    kill $API_PID $EVIDENCE_PID $REACT_PID $FRONTEND_PID 2>/dev/null
    wait $API_PID $EVIDENCE_PID $REACT_PID $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Story Analytics - Development Environment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

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

# Count services
if [ "$SKIP_EVIDENCE" = true ]; then
    TOTAL_SERVICES=3
else
    TOTAL_SERVICES=4
fi

# Start FastAPI backend
echo -e "${GREEN}[1/$TOTAL_SERVICES] Starting API server on port 8000...${NC}"
python -m uvicorn api.main:app --reload --port 8000 &
API_PID=$!

# Start Evidence dashboards (unless skipped)
if [ "$SKIP_EVIDENCE" = true ]; then
    echo -e "${YELLOW}[2/$TOTAL_SERVICES] Skipping Evidence (--no-evidence flag)${NC}"
    EVIDENCE_PID=""
else
    echo -e "${GREEN}[2/$TOTAL_SERVICES] Starting Evidence dashboards on port 3000...${NC}"
    npm run dev &
    EVIDENCE_PID=$!
fi

# Start React app (new Plotly.js renderer)
SERVICE_NUM=$((SKIP_EVIDENCE ? 2 : 3))
echo -e "${GREEN}[$SERVICE_NUM/$TOTAL_SERVICES] Starting React app on port 3001...${NC}"
(cd "$SCRIPT_DIR/app" && npm run dev) &
REACT_PID=$!

# Start SvelteKit Frontend
SERVICE_NUM=$((SKIP_EVIDENCE ? 3 : 4))
echo -e "${GREEN}[$SERVICE_NUM/$TOTAL_SERVICES] Starting SvelteKit Frontend on port 5173...${NC}"
(cd "$SCRIPT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

# Wait for services to start
sleep 2

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}All services running!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e ""
echo -e "  ${YELLOW}SvelteKit Frontend:${NC}  http://localhost:5173"
echo -e "  ${YELLOW}React App (new):${NC}     http://localhost:3001"
if [ "$SKIP_EVIDENCE" = false ]; then
echo -e "  ${YELLOW}Evidence Dashboards:${NC} http://localhost:3000"
fi
echo -e "  ${YELLOW}API Server:${NC}          http://localhost:8000"
echo -e "  ${YELLOW}API Docs:${NC}            http://localhost:8000/docs"
echo -e ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${CYAN}React test charts:${NC}"
echo -e "    http://localhost:3001/chart/test-chart-001  (line)"
echo -e "    http://localhost:3001/chart/test-chart-002  (bar)"
echo -e "    http://localhost:3001/chart/test-chart-003  (KPI)"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Press ${RED}Ctrl+C${NC} to stop all services"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Open frontend in browser after a short delay
(sleep 3 && open "http://localhost:5173") &

# Wait for all processes (keeps the script running)
wait

#!/bin/bash

# Story Analytics - Development Server Startup Script
# Starts all three services needed for local development:
# - FastAPI backend (port 8000)
# - Evidence dashboards (port 3000)
# - Frontend app (port 5173)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script lives
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

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

# Start FastAPI backend
echo -e "${GREEN}[1/3] Starting API server on port 8000...${NC}"
python -m uvicorn api.main:app --reload --port 8000 &
API_PID=$!

# Start Evidence dashboards
echo -e "${GREEN}[2/3] Starting Evidence dashboards on port 3000...${NC}"
npm run dev &
EVIDENCE_PID=$!

# Start Frontend
echo -e "${GREEN}[3/3] Starting Frontend on port 5173...${NC}"
cd frontend && npm run dev &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

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

# Wait for all processes (this keeps the script running)
wait

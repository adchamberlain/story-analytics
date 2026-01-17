#!/bin/bash

# Story Analytics v2 Development Startup Script
# This script starts all services needed for local development.

set -e

echo "========================================"
echo "  Story Analytics v2 - Dev Startup"
echo "========================================"
echo ""

# Check for required environment variables
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Warning: ANTHROPIC_API_KEY not set. Claude provider will not work."
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down services..."
    kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT

# Install dependencies if needed
echo "[1/5] Checking dependencies..."

if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Check Python dependencies
pip show fastapi > /dev/null 2>&1 || {
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
}

# Create data directory
mkdir -p data

# Generate source data if connection exists
echo ""
echo "[2/5] Checking database connection..."
if [ -f "sources/snowflake_saas/connection.yaml" ]; then
    echo "Snowflake connection found. Running source generation..."
    npm run sources 2>/dev/null || echo "Source generation skipped (may need connection setup)"
else
    echo "No Snowflake connection configured. Skipping source generation."
    echo "Copy sources/snowflake_saas/connection.yaml.example to connection.yaml and add credentials."
fi

# Start services
echo ""
echo "[3/5] Starting Evidence dashboard server (port 3000)..."
npm run dev &
EVIDENCE_PID=$!

echo ""
echo "[4/5] Starting FastAPI backend (port 8000)..."
uvicorn api.main:app --reload --port 8000 &
API_PID=$!

# Wait for API to be ready
sleep 3

echo ""
echo "[5/5] Starting Svelte frontend (port 5173)..."
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "========================================"
echo "  All services started!"
echo "========================================"
echo ""
echo "  Frontend:   http://localhost:5173"
echo "  API:        http://localhost:8000"
echo "  API Docs:   http://localhost:8000/docs"
echo "  Dashboards: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Wait for all background processes
wait

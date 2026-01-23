#!/bin/bash
#
# Chart Pipeline Test Runner
# Usage: ./tests/run_tests.sh [smoke|full|unit|component]
#

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default to smoke tests
TEST_TYPE=${1:-smoke}
PROVIDER=${2:-claude}

echo "========================================"
echo "Chart Pipeline Test Runner"
echo "========================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check if server is running
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Evidence server running"
else
    echo -e "  ${RED}✗${NC} Evidence server not running"
    echo ""
    echo "Start the server with: npm run dev"
    echo "Or use --auto-start flag"
    exit 1
fi

# Check API key
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo -e "  ${GREEN}✓${NC} ANTHROPIC_API_KEY set"
else
    echo -e "  ${YELLOW}!${NC} ANTHROPIC_API_KEY not in environment (may be in .env)"
fi

echo ""
echo "Running $TEST_TYPE tests with $PROVIDER provider..."
echo ""

case $TEST_TYPE in
    smoke)
        python tests/comprehensive_chart_tests.py --smoke --provider $PROVIDER
        ;;
    full)
        python tests/comprehensive_chart_tests.py --provider $PROVIDER
        ;;
    unit)
        pytest tests/test_chart_models.py -v
        ;;
    component)
        pytest tests/test_pipeline_components.py -v -x
        ;;
    all)
        echo "Running unit tests..."
        pytest tests/test_chart_models.py -v || true
        echo ""
        echo "Running component tests..."
        pytest tests/test_pipeline_components.py -v -x || true
        echo ""
        echo "Running full E2E tests..."
        python tests/comprehensive_chart_tests.py --provider $PROVIDER
        ;;
    *)
        echo "Unknown test type: $TEST_TYPE"
        echo "Usage: $0 [smoke|full|unit|component|all] [provider]"
        exit 1
        ;;
esac

echo ""
echo "========================================"
echo "Tests complete!"
echo "========================================"

#!/bin/bash

# Test Setup Script for Gateway with External Frontend
# This script helps test the complete setup

set -e

echo "🧪 Gateway External Frontend Test Setup"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js is required but not installed.${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Starting External Frontend Server...${NC}"
cd "$(dirname "$0")"
node simple-server.js &
FRONTEND_PID=$!
echo -e "${GREEN}✅ Frontend server started (PID: $FRONTEND_PID)${NC}"
echo "   URL: http://localhost:8080/dice-game/index.html"
echo ""

# Wait for server to start
sleep 2

echo -e "${BLUE}Step 2: Setting up Gateway environment...${NC}"
export DICE_FRONTEND_URL="http://localhost:8080/dice-game/index.html"
export GATEWAY_PORT=3000
export DICE_API_URL="http://localhost:3001"
echo -e "${GREEN}✅ Environment variables set${NC}"
echo "   DICE_FRONTEND_URL=$DICE_FRONTEND_URL"
echo "   DICE_API_URL=$DICE_API_URL"
echo ""

echo -e "${BLUE}Step 3: Checking if Dice API is running...${NC}"
if curl -s http://localhost:3001/dice/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Dice API is running${NC}"
else
    echo -e "${YELLOW}⚠️  Dice API is not running on port 3001${NC}"
    echo "   Please start it in a separate terminal:"
    echo "   pnpm --filter @instant-games/dice-api start:dev"
    echo ""
fi

echo -e "${BLUE}Step 4: Testing external frontend access...${NC}"
if curl -s http://localhost:8080/dice-game/index.html > /dev/null 2>&1; then
    echo -e "${GREEN}✅ External frontend is accessible${NC}"
else
    echo -e "${YELLOW}⚠️  External frontend is not accessible${NC}"
    echo "   Check if simple-server.js is running"
    echo ""
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Start Dice API (if not running):"
echo "   pnpm --filter @instant-games/dice-api start:dev"
echo ""
echo "2. Start Gateway (in a new terminal):"
echo "   export DICE_FRONTEND_URL=http://localhost:8080/dice-game/index.html"
echo "   pnpm --filter @instant-games/gateway-api start:dev"
echo ""
echo "3. Access game via Gateway:"
echo "   http://localhost:3000/games/dice"
echo ""
echo "4. Test API directly:"
echo "   curl http://localhost:3000/api/v1/games/dice/health"
echo ""
echo "To stop the frontend server:"
echo "   kill $FRONTEND_PID"
echo ""

# Keep script running
wait $FRONTEND_PID


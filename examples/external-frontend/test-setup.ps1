# Test Setup Script for Gateway with External Frontend (PowerShell)
# This script helps test the complete setup on Windows

Write-Host "🧪 Gateway External Frontend Test Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is required but not installed." -ForegroundColor Red
    exit 1
}

Write-Host "Step 1: Starting External Frontend Server..." -ForegroundColor Blue

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverScript = Join-Path $scriptPath "simple-server.js"

# Start server in background
$serverProcess = Start-Process -FilePath "node" -ArgumentList $serverScript -PassThru -NoNewWindow

Write-Host "✅ Frontend server started (PID: $($serverProcess.Id))" -ForegroundColor Green
Write-Host "   URL: http://localhost:8080/dice-game/index.html"
Write-Host ""

# Wait for server to start
Start-Sleep -Seconds 2

Write-Host "Step 2: Setting up Gateway environment..." -ForegroundColor Blue

$env:DICE_FRONTEND_URL = "http://localhost:8080/dice-game/index.html"
$env:GATEWAY_PORT = "3000"
$env:DICE_API_URL = "http://localhost:3001"

Write-Host "✅ Environment variables set" -ForegroundColor Green
Write-Host "   DICE_FRONTEND_URL=$env:DICE_FRONTEND_URL"
Write-Host "   DICE_API_URL=$env:DICE_API_URL"
Write-Host ""

Write-Host "Step 3: Checking if Dice API is running..." -ForegroundColor Blue

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/dice/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ Dice API is running" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Dice API is not running on port 3001" -ForegroundColor Yellow
    Write-Host "   Please start it in a separate terminal:"
    Write-Host "   pnpm --filter @instant-games/dice-api start:dev"
    Write-Host ""
}

Write-Host "Step 4: Testing external frontend access..." -ForegroundColor Blue

try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/dice-game/index.html" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ External frontend is accessible" -ForegroundColor Green
} catch {
    Write-Host "⚠️  External frontend is not accessible" -ForegroundColor Yellow
    Write-Host "   Check if simple-server.js is running"
    Write-Host ""
}

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Start Dice API (if not running):"
Write-Host "   pnpm --filter @instant-games/dice-api start:dev"
Write-Host ""
Write-Host "2. Start Gateway (in a new terminal):"
Write-Host '   $env:DICE_FRONTEND_URL="http://localhost:8080/dice-game/index.html"'
Write-Host "   pnpm --filter @instant-games/gateway-api start:dev"
Write-Host ""
Write-Host "3. Access game via Gateway:"
Write-Host "   http://localhost:3000/games/dice"
Write-Host ""
Write-Host "4. Test API directly:"
Write-Host "   curl http://localhost:3000/api/v1/games/dice/health"
Write-Host ""
Write-Host "To stop the frontend server:"
Write-Host "   Stop-Process -Id $($serverProcess.Id)"
Write-Host ""

# Wait for user to stop
Write-Host "Press any key to stop the frontend server..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
Write-Host "✅ Frontend server stopped" -ForegroundColor Green


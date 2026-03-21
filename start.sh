#!/bin/bash
# AutoSPF+ Startup Script
# This script starts both the backend and frontend servers

echo "🚀 Starting AutoSPF+ Development Environment..."
echo ""

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "autospf" ]; then
    echo "❌ Error: This script must be run from the AutoSPF+ root directory"
    exit 1
fi

# Function to start backend
start_backend() {
    echo "📦 Starting Backend Server..."
    cd backend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo "  📥 Installing dependencies..."
        npm install
    fi
    
    npm start &
    BACKEND_PID=$!
    echo "  ✅ Backend started (PID: $BACKEND_PID)"
    echo "  🌐 Backend URL: http://localhost:3000"
    cd ..
}

# Function to start frontend
start_frontend() {
    echo "⚛️  Starting Frontend Server..."
    cd autospf
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo "  📥 Installing dependencies..."
        npm install
    fi
    
    npm run dev &
    FRONTEND_PID=$!
    echo "  ✅ Frontend started (PID: $FRONTEND_PID)"
    echo "  🌐 Frontend URL: http://localhost:5173"
    cd ..
}

# Start both servers
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
start_backend
sleep 2
start_frontend
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "✨ AutoSPF+ is starting up!"
echo ""
echo "📍 Access Points:"
echo "  🔐 Login Page:      http://localhost:5173"
echo "  👨‍💼 Admin Dashboard:   http://localhost:5173/admin/dashboard"
echo "  👤 Customer Panel:   http://localhost:5173/customer/dashboard"
echo "  🔧 Detailer Panel:   http://localhost:5173/detailer/dashboard"
echo ""
echo "📊 Test Credentials:"
echo "  Admin:    admin@autospf.com / Admin123!"
echo "  Detailer: mike@detailshop.com / Detailer123!"
echo "  Customer: customer@test.com / Customer123!"
echo ""
echo "🎨 Theme: Premium Dark (hardcoded, no flickering)"
echo "🔄 API Sync: All endpoints public (development mode)"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for all background processes
wait

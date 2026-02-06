#!/bin/bash

# AutoSPF+ Quick Setup Script
# This script will help you get the app running

set -e

echo "🚀 AutoSPF+ Setup Script"
echo "========================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found"
    echo "Please run this script from the autospf/ directory"
    exit 1
fi

echo "✅ Found package.json"
echo ""

# Clean install
echo "🧹 Cleaning up old dependencies..."
rm -rf node_modules package-lock.json 2>/dev/null || true
echo "✅ Cleaned"
echo ""

# Install dependencies
echo "📦 Installing dependencies (this may take a minute)..."
npm install
echo "✅ Dependencies installed"
echo ""

# Check for .env.local
if [ ! -f ".env.local" ]; then
    echo "⚠️  Warning: .env.local not found"
    echo "   Creating .env.local with placeholder values..."
    cat > .env.local << 'EOF'
# EmailJS Configuration
# Get these from https://www.emailjs.com/
VITE_EMAILJS_PUBLIC_KEY=your_public_key_here
VITE_EMAILJS_PRIVATE_KEY=your_private_key_here

# API Configuration (optional)
VITE_API_URL=http://localhost:3000
EOF
    echo "✅ Created .env.local"
    echo ""
    echo "📝 IMPORTANT: Edit .env.local and add your EmailJS credentials!"
    echo ""
else
    echo "✅ Found .env.local"
    echo ""
fi

# Type check
echo "🔍 Running TypeScript check..."
npm run type-check || echo "⚠️  Some TypeScript issues found (non-blocking)"
echo ""

echo "✅ Setup complete!"
echo ""
echo "🚀 To start the development server, run:"
echo "   npm run dev"
echo ""
echo "📖 For more information, see DEBUG_GUIDE.md"
echo ""

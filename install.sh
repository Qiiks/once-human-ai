#!/bin/bash
# Installation script for Once Human AI Discord Bot

set -e

echo "📦 Once Human AI - Bot Installation Script"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js found: $NODE_VERSION"

# Navigate to bot directory
cd "$(dirname "$0")/once-human-bot"

echo ""
echo "📥 Installing dependencies..."
npm install

echo ""
echo "📝 Configuration setup:"
echo "---"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "ℹ️  No .env file found. Copying from template..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env with your credentials:"
    echo "   - DISCORD_BOT_TOKEN"
    echo "   - CLIENT_ID"
    echo "   - GEMINI_API_KEYS"
    echo "   - POSTGRES_URL (or SUPABASE_URL)"
    echo ""
    echo "   Edit with: nano .env"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your credentials"
echo "2. Ensure PostgreSQL database is set up with lore_entries, memories, and chat_history tables"
echo "3. Run: npm start"
echo ""
echo "For detailed setup, see SETUP.md"

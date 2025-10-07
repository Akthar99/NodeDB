#!/bin/bash
# install.sh

set -e

echo "🚀 Installing Node.js Database..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current version: $(node -v)"
    exit 1
fi

# Create installation directory
INSTALL_DIR="${INSTALL_DIR:-/usr/local/lib/nodejs-database}"
mkdir -p "$INSTALL_DIR"

# Copy files
echo "📦 Copying files..."
cp -r . "$INSTALL_DIR/"

# Install dependencies
echo "📥 Installing dependencies..."
cd "$INSTALL_DIR"
npm install --production

# Create symlink
if [ -w "/usr/local/bin" ]; then
    ln -sf "$INSTALL_DIR/bin/db-cli.js" /usr/local/bin/node-db
    echo "✅ Created symlink: /usr/local/bin/node-db"
else
    echo "📝 Please create a symlink manually:"
    echo "   sudo ln -s $INSTALL_DIR/bin/db-cli.js /usr/local/bin/node-db"
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Quick start:"
echo "  node-db start                    # Start database server"
echo "  node-db collections             # List collections"
echo "  node-db --help                  # See all commands"
echo ""
echo "Documentation: https://github.com/Akthar99/NodeDB.git"
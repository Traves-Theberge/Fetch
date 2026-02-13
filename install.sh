#!/bin/bash
# Fetch - Linux Installation Script
# Run this on a fresh Linux installation (Debian/Ubuntu based)

set -e

echo "🐕 Fetch - Linux Installation"
echo "======================================"
echo ""

# Must run as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo: sudo ./install.sh"
    exit 1
fi

FETCH_USER=${SUDO_USER:-pi}
FETCH_DIR="/home/$FETCH_USER/fetch"

echo "Installing for user: $FETCH_USER"
echo "Install directory: $FETCH_DIR"
echo ""

# Update system
echo "📦 Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Docker
echo ""
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker $FETCH_USER
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Install Docker Compose plugin
echo ""
echo "🐳 Installing Docker Compose..."
apt-get install -y docker-compose-plugin
echo "✅ Docker Compose installed"

# Check for git
if ! command -v git &> /dev/null; then
    echo "📦 Installing git..."
    apt-get update
    apt-get install -y git
fi

# Check for curl
if ! command -v curl &> /dev/null; then
    echo "📦 Installing curl..."
    apt-get install -y curl
fi

# Check for Node.js (v20)
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Check for GitHub CLI
if ! command -v gh &> /dev/null; then
    echo "📦 Installing GitHub CLI..."
    mkdir -p -m 755 /etc/apt/keyrings
    wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update
    apt-get install -y gh
fi

# Install/Update Harnesses
echo ""
echo "🤖 Installing/Updating AI Harnesses..."
chmod +x scripts/update_harnesses.sh
./scripts/update_harnesses.sh

# Install Go (for Manager TUI)
echo ""
echo "🔧 Installing Go..."
if ! command -v go &> /dev/null; then
    wget https://go.dev/dl/go1.21.6.linux-arm64.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf go1.21.6.linux-arm64.tar.gz
    rm go1.21.6.linux-arm64.tar.gz
    
    # Add to path for user
    echo 'export PATH=$PATH:/usr/local/go/bin' >> /home/$FETCH_USER/.bashrc
    echo "✅ Go installed"
else
    echo "✅ Go already installed"
fi

# Clone or update Fetch
echo ""
echo "📥 Setting up Fetch..."
if [ -d "$FETCH_DIR" ]; then
    cd $FETCH_DIR
    sudo -u $FETCH_USER git pull
    echo "✅ Fetch updated"
else
    sudo -u $FETCH_USER git clone https://github.com/yourusername/fetch.git $FETCH_DIR
    echo "✅ Fetch cloned"
fi

cd $FETCH_DIR

# Create directories
mkdir -p data workspace config/github config/claude
chown -R $FETCH_USER:$FETCH_USER data workspace config

# Setup environment
if [ ! -f ".env" ]; then
    cp .env.example .env
    chown $FETCH_USER:$FETCH_USER .env
    echo "✅ Created .env template"
fi

# Build Manager
echo ""
echo "🔨 Building Manager TUI..."
cd manager
sudo -u $FETCH_USER /usr/local/go/bin/go mod tidy
echo "   Running build script..."
# Ensure script is executable
chmod +x ../scripts/build_manager.sh
# Run build script as user
sudo -u $FETCH_USER ../scripts/build_manager.sh
echo "✅ Manager built"

cd $FETCH_DIR

# Install systemd service
echo ""
echo "⚙️  Installing systemd service..."
cp manager/fetch.service /etc/systemd/system/fetch.service
sed -i "s|/home/pi/fetch|$FETCH_DIR|g" /etc/systemd/system/fetch.service
sed -i "s|User=pi|User=$FETCH_USER|g" /etc/systemd/system/fetch.service
systemctl daemon-reload
echo "✅ Systemd service installed"

echo ""
echo "======================================"
echo "🎉 Installation complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit your configuration:"
echo "   nano $FETCH_DIR/.env"
echo ""
echo "2. Add your WhatsApp number and API keys"
echo ""
echo "3. Start Fetch:"
echo "   cd $FETCH_DIR && ./deploy.sh"
echo ""
echo "4. Or use the Manager TUI:"
echo "   cd $FETCH_DIR/manager && ./fetch-manager"
echo ""
echo "5. Enable auto-start on boot:"
echo "   sudo systemctl enable fetch"
echo ""
echo "Note: Log out and back in for Docker permissions to take effect."

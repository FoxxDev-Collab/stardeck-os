#!/bin/bash
# Stardeck OS Installation Script
# Run as root or with sudo

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}  Stardeck OS Installation${NC}"
echo -e "${GREEN}================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Configuration
INSTALL_DIR="/opt/stardeck"
DATA_DIR="/var/lib/stardeck"
BINARY_NAME="stardeckos"

# Detect the script's directory (where the extracted files are)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}Installing Stardeck OS...${NC}"

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR/certs"
mkdir -p "$DATA_DIR/stacks"

# Stop existing service if running
if systemctl is-active --quiet stardeck; then
    echo "Stopping existing Stardeck service..."
    systemctl stop stardeck
fi

# Copy binary
echo "Installing binary..."
cp "$SCRIPT_DIR/$BINARY_NAME" "$INSTALL_DIR/"
chmod 755 "$INSTALL_DIR/$BINARY_NAME"

# Install systemd service
echo "Installing systemd service..."
cp "$SCRIPT_DIR/stardeck.service" /etc/systemd/system/
systemctl daemon-reload

# Set ownership
chown -R root:root "$DATA_DIR"
chown root:root "$INSTALL_DIR/$BINARY_NAME"

# Configure firewall if firewalld is running
if systemctl is-active --quiet firewalld; then
    echo "Configuring firewall..."
    firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
fi

# Enable and start service
echo "Enabling and starting Stardeck service..."
systemctl enable stardeck
systemctl start stardeck

# Wait a moment and check status
sleep 2
if systemctl is-active --quiet stardeck; then
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
    echo -e "Access Stardeck at: ${GREEN}https://$(hostname -I | awk '{print $1}')${NC}"
    echo ""
    echo "Default credentials:"
    echo "  Username: admin"
    echo "  Password: admin"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Change the default password immediately!${NC}"
    echo ""
    echo "Service commands:"
    echo "  systemctl status stardeck"
    echo "  systemctl restart stardeck"
    echo "  journalctl -u stardeck -f"
else
    echo -e "${RED}Service failed to start. Check logs with:${NC}"
    echo "  journalctl -u stardeck -n 50"
    exit 1
fi

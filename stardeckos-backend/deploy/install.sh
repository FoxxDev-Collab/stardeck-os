#!/bin/bash
# Stardeck OS Installation Script
# Run as root or with sudo

set -e

INSTALL_DIR="/opt/stardeck"
DATA_DIR="/var/lib/stardeck"
CONFIG_DIR="/etc/stardeck"
SERVICE_FILE="/etc/systemd/system/stardeck.service"

echo "=== Stardeck OS Installation ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root or with sudo"
    exit 1
fi

# Check if binary exists in current directory
if [ ! -f "./stardeck" ]; then
    echo "Error: stardeck binary not found in current directory"
    echo "Please build the project first: make build"
    exit 1
fi

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$CONFIG_DIR"

# Copy binary
echo "Installing binary..."
cp ./stardeck "$INSTALL_DIR/stardeck"
chmod 755 "$INSTALL_DIR/stardeck"

# Copy environment file if it doesn't exist
if [ ! -f "$CONFIG_DIR/stardeck.env" ]; then
    echo "Creating default configuration..."
    cp ./deploy/stardeck.env.example "$CONFIG_DIR/stardeck.env"
    chmod 600 "$CONFIG_DIR/stardeck.env"
fi

# Install systemd service
echo "Installing systemd service..."
cp ./deploy/stardeck.service "$SERVICE_FILE"
chmod 644 "$SERVICE_FILE"

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

# Enable service
echo "Enabling service..."
systemctl enable stardeck

echo ""
echo "=== Installation Complete ==="
echo ""
echo "To start Stardeck:"
echo "  systemctl start stardeck"
echo ""
echo "To check status:"
echo "  systemctl status stardeck"
echo ""
echo "To view logs:"
echo "  journalctl -u stardeck -f"
echo ""
echo "Configuration file: $CONFIG_DIR/stardeck.env"
echo "Database location:  $DATA_DIR/stardeck.db"
echo "Web interface:      http://localhost:8080"
echo ""
echo "Default credentials: admin / admin"
echo "IMPORTANT: Change the default password after first login!"

#!/bin/bash
# FileShare (for macOS).command - Double-clickable macOS launcher

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Change to the script directory
cd "$SCRIPT_DIR"

# Make the unified launcher executable
chmod +x "Javin FileShare (for macOS & Linux).sh"

# Run the unified launcher
./"Javin FileShare (for macOS & Linux).sh"

# Keep the window open
echo
echo "Press any key to close this window..."
read -n 1 -s

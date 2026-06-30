#!/usr/bin/env bash
set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"
PORT=4000

# 2. Add common Node.js installation paths to PATH if not already present
NVM_NODE_DIR=""
if [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1 || echo "")
  if [ -n "$LATEST_NVM" ]; then
    NVM_NODE_DIR="$HOME/.nvm/versions/node/$LATEST_NVM/bin"
  fi
fi

for path_dir in \
  "/usr/local/bin" \
  "/opt/homebrew/bin" \
  "/usr/bin" \
  "/bin" \
  "/usr/sbin" \
  "/sbin" \
  "$NVM_NODE_DIR" \
  "$HOME/.volta/bin" \
  "$HOME/.fnm" \
  "$HOME/n/bin" \
  "$HOME/.local/bin"
do
  if [ -n "$path_dir" ] && [ -d "$path_dir" ] && [[ ":$PATH:" != *":$path_dir:"* ]]; then
    export PATH="$PATH:$path_dir"
  fi
done

# 3. Verify Node.js is installed
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Error: Node.js is not installed or not found in your PATH."
  echo "Please install Node.js (https://nodejs.org) and try again."
  exit 1
fi

# 4. Detect device IP address
if [[ "${OSTYPE:-}" == darwin* ]]; then
  DEVICE_IP=$(ifconfig | grep -E "inet.*broadcast" | awk '{print $2}' | head -1)
else
  DEVICE_IP=$(ip route get 1.1.1.1 | awk '{print $7; exit}' 2>/dev/null || hostname -I | awk '{print $1}' 2>/dev/null || echo "127.0.0.1")
fi

if [ -z "$DEVICE_IP" ] || [ "$DEVICE_IP" = "127.0.0.1" ]; then
  DEVICE_IP="localhost"
fi

# If .env doesn't exist, copy from .env.example
if [ ! -f "$SCRIPT_DIR/../.env" ] && [ -f "$SCRIPT_DIR/../.env.example" ]; then
  cp "$SCRIPT_DIR/../.env.example" "$SCRIPT_DIR/../.env"
fi

# Load CUSTOM_HOST from .env if available
CUSTOM_HOST=""
if [ -f "$SCRIPT_DIR/../.env" ]; then
  CUSTOM_HOST=$(grep -E "^CUSTOM_HOST=" "$SCRIPT_DIR/../.env" | cut -d'=' -f2- | tr -d '"'\''\r' || echo "")
fi

# Reset if using legacy sslip.io wildcard, old javin-share- dash format, or random-suffix local hosts
if [[ "$CUSTOM_HOST" == *sslip.io* ]] || [[ "$CUSTOM_HOST" == javin-share-* ]] || [[ "$CUSTOM_HOST" =~ ^javin\.share\.[a-z0-9]{4,6}\.local$ ]]; then
  echo "=> Legacy host format detected ($CUSTOM_HOST). Resetting to new standard..."
  CUSTOM_HOST=""
  rm -f "$BACKEND_DIR/certs/cert.pem" "$BACKEND_DIR/certs/key.pem"
fi

# If CUSTOM_HOST is empty, set it to the static standard javin.share.local host
if [ -z "$CUSTOM_HOST" ]; then
  CUSTOM_HOST="javin.share.local"
  # Write to .env
  grep -v "^CUSTOM_HOST=" "$SCRIPT_DIR/../.env" > "$SCRIPT_DIR/../.env.tmp" || true
  echo "CUSTOM_HOST=$CUSTOM_HOST" >> "$SCRIPT_DIR/../.env.tmp"
  mv "$SCRIPT_DIR/../.env.tmp" "$SCRIPT_DIR/../.env"
  echo "=> Configured standard local host: $CUSTOM_HOST"
fi

DISPLAY_HOST="$CUSTOM_HOST"
URL="https://$DISPLAY_HOST:$PORT"

echo "========================================"
echo "    JAVIN FileShare Launcher"
echo "========================================"
echo "=> Detected IP: $DEVICE_IP"
if [ -n "$CUSTOM_HOST" ]; then
  echo "=> Custom Host: $CUSTOM_HOST"
fi
echo "=> Target URL:  $URL"
echo "========================================"
echo

# 5. Check and install dependencies
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo "=> First-time launch: Installing dependencies (npm install)..."
  cd "$BACKEND_DIR"
  npm install --silent
  cd "$SCRIPT_DIR"
  echo "=> ✓ Dependencies installed!"
  echo
fi

# 6. Ensure HTTPS certificates are generated and trusted
REGENERATE_CERT=false
if [ ! -f "$BACKEND_DIR/certs/cert.pem" ] || [ ! -f "$BACKEND_DIR/certs/key.pem" ]; then
  REGENERATE_CERT=true
else
  # Check if existing cert has correct key usage flags
  if ! openssl x509 -in "$BACKEND_DIR/certs/cert.pem" -text -noout | grep -q "Digital Signature, Key Encipherment"; then
    echo "=> Certificate has incorrect key usage, regenerating..."
    REGENERATE_CERT=true
  fi
fi

if [ "$REGENERATE_CERT" = true ]; then
  echo "=> Generating self-signed certs for IP: $DEVICE_IP..."
  mkdir -p "$BACKEND_DIR/certs"
  
  cat > "$BACKEND_DIR/certs/cert.conf" << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = Organization
OU = OrgUnit
CN = $DEVICE_IP

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = $DEVICE_IP
IP.1 = 127.0.0.1
IP.2 = $DEVICE_IP
EOF

  if [ -n "$CUSTOM_HOST" ]; then
    if [[ "$CUSTOM_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "IP.3 = $CUSTOM_HOST" >> "$BACKEND_DIR/certs/cert.conf"
    else
      echo "DNS.3 = $CUSTOM_HOST" >> "$BACKEND_DIR/certs/cert.conf"
    fi
  fi

  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$BACKEND_DIR/certs/key.pem" -out "$BACKEND_DIR/certs/cert.pem" -days 365 -config "$BACKEND_DIR/certs/cert.conf" -extensions v3_req
  rm "$BACKEND_DIR/certs/cert.conf"
  echo "=> ✓ Certificates generated!"
  echo

  echo "=> Installing certificate to system trust store (requires administrator password)..."
  if [[ "${OSTYPE:-}" == darwin* ]]; then
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$BACKEND_DIR/certs/cert.pem" 2>/dev/null || true
  else
    if command -v update-ca-certificates >/dev/null 2>&1; then
      sudo mkdir -p /usr/local/share/ca-certificates
      sudo cp "$BACKEND_DIR/certs/cert.pem" /usr/local/share/ca-certificates/fileshare_local.crt
      sudo update-ca-certificates || true
    elif command -v update-ca-trust >/dev/null 2>&1; then
      sudo mkdir -p /etc/pki/ca-trust/source/anchors
      sudo cp "$BACKEND_DIR/certs/cert.pem" /etc/pki/ca-trust/source/anchors/fileshare_local.crt
      sudo update-ca-trust extract || true
    elif command -v trust >/dev/null 2>&1; then
      sudo trust anchor "$BACKEND_DIR/certs/cert.pem" || true
    fi
  fi
  echo "=> ✓ Certificate trust complete!"
  echo
fi

# 7. Set up app icons
if [ ! -f "$SCRIPT_DIR/icon.png" ]; then
  echo "=> Downloading custom sharing icon..."
  curl -s -L -o "$SCRIPT_DIR/icon.png" "https://img.icons8.com/color/512/share.png" || true
  echo "=> ✓ Icon downloaded!"
  echo
fi

# 8. Set up Linux desktop entry if on Linux
if [[ "${OSTYPE:-}" != darwin* ]]; then
  DESKTOP_FILE="$SCRIPT_DIR/Javin FileShare (for Linux).desktop"
  echo "=> Registering Linux Desktop Shortcuts..."
  cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=JAVIN FileShare
Comment=Cross-platform secure file sharing application
Exec="$SCRIPT_DIR/Javin FileShare (for macOS & Linux).sh"
Icon=$SCRIPT_DIR/icon.png
Terminal=true
Categories=Network;FileTransfer;
EOF
  chmod +x "$DESKTOP_FILE"

  if [ -d "$HOME/.local/share/applications" ]; then
    cp "$DESKTOP_FILE" "$HOME/.local/share/applications/Javin FileShare.desktop"
  fi
  if [ -d "$HOME/Desktop" ]; then
    cp "$DESKTOP_FILE" "$HOME/Desktop/Javin FileShare.desktop"
    gio set "$HOME/Desktop/Javin FileShare.desktop" metadata::trusted true 2>/dev/null || true
    chmod +x "$HOME/Desktop/Javin FileShare.desktop"
  fi
  echo "=> ✓ Shortcuts created!"
  echo
fi

# 9. Start the Node.js server in the background and open the browser
echo "=> Starting backend server..."
cd "$SCRIPT_DIR/.."
node backend/server.js &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

sleep 2
echo "=> Opening browser to secure link..."
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
fi

# Wait for server shutdown (e.g. host exit session)
wait "$SERVER_PID"

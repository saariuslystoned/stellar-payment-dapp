#!/usr/bin/env bash
# setup_dev_env.sh - Stellar Payment DApp Development Environment Setup
# Run this script from the project root directory.

set -e

echo "=== Stellar Payment DApp - Development Setup ==="
echo ""

# --- 1. Check Stellar CLI ---
echo "[1/4] Checking Stellar CLI..."
if command -v stellar &> /dev/null; then
    echo "  ✓ Stellar CLI found: $(stellar --version 2>/dev/null || echo 'version unknown')"
else
    echo "  ✗ Stellar CLI not found."
    echo "    Install it with:"
    echo "      curl -s https://raw.githubusercontent.com/stellar/bin/main/install.sh | bash"
    echo "    Or see: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup"
    echo ""
fi

# --- 2. Check Cargo (Rust) ---
echo "[2/4] Checking Rust/Cargo..."
if command -v cargo &> /dev/null; then
    echo "  ✓ Cargo found: $(cargo --version)"
else
    echo "  ✗ Cargo not found."
    echo "    Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo ""
fi

# --- 3. Install Node.js Dependencies ---
echo "[3/4] Installing Node.js dependencies..."
if [ -d "frontend" ]; then
    echo "  Installing frontend dependencies..."
    (cd frontend && npm install)
    echo "  ✓ Frontend dependencies installed."
else
    echo "  ✗ frontend/ directory not found. Please run this from the project root."
fi

if [ -f "package.json" ]; then
    echo "  Installing root dependencies..."
    npm install
    echo "  ✓ Root dependencies installed."
fi

# --- 4. Setup Python Virtual Environment ---
echo "[4/4] Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "  ✓ Created Python venv."
else
    echo "  ✓ Python venv already exists."
fi

if [ -f "requirements.txt" ]; then
    ./venv/bin/python3 -m pip install -r requirements.txt --quiet
    echo "  ✓ Python dependencies installed."
fi

echo ""
echo "=== Setup Complete ==="
echo "To activate the Python environment: source venv/bin/activate"
echo "To start the frontend: npm run start:frontend"
echo ""

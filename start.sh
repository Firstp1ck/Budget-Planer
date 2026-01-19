#!/bin/bash

# Budget Planer - Setup and Start Script
# This script checks dependencies, installs packages, and starts both backend and frontend servers
# Usage: ./start.sh [--setup-only]

set -e  # Exit on error

# Check for setup-only flag
SETUP_ONLY=false
if [ "$1" == "--setup-only" ]; then
    SETUP_ONLY=true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for required tools
print_info "Checking for required tools..."

if ! command_exists uv; then
    print_error "uv is not installed. Please install it first:"
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
print_success "uv is installed"

if ! command_exists bun; then
    print_error "bun is not installed. Please install it first:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
print_success "bun is installed"

# Setup backend
print_info "Setting up backend..."
cd "$BACKEND_DIR"

# Check if virtual environment exists, create if not
if [ ! -d ".venv" ]; then
    print_info "Creating Python virtual environment..."
    uv venv
    print_success "Virtual environment created"
else
    print_success "Virtual environment already exists"
fi

# Activate virtual environment
print_info "Activating virtual environment..."
source .venv/bin/activate

# Install Python dependencies
print_info "Installing Python dependencies with uv..."
uv pip install -r requirements.txt
print_success "Python dependencies installed"

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating default .env file..."
    cat > .env << EOF
SECRET_KEY=$(python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
EOF
    print_success ".env file created with default values"
else
    print_success ".env file already exists"
fi

# Run migrations
print_info "Running Django migrations..."
python manage.py migrate --noinput
print_success "Migrations completed"

# Setup frontend
print_info "Setting up frontend..."
cd "$FRONTEND_DIR"

# Install frontend dependencies
print_info "Installing frontend dependencies with bun..."
bun install
print_success "Frontend dependencies installed"

# If setup-only mode, exit here
if [ "$SETUP_ONLY" = true ]; then
    echo ""
    print_success "=========================================="
    print_success "Setup completed successfully!"
    print_success "=========================================="
    echo ""
    print_info "To start the servers, run:"
    print_info "  ./start.sh"
    echo ""
    exit 0
fi

# Function to cleanup on exit
cleanup() {
    print_info "Shutting down servers..."
    # Kill backend process
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    # Kill frontend process
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    # Wait a moment for graceful shutdown
    sleep 1
    # Force kill any remaining processes on ports 8000 and 5173
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    # Also force kill the PIDs if they're still running
    kill -9 $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    print_info "Servers stopped"
    exit 0
}

# Trap Ctrl+C and cleanup
trap cleanup SIGINT SIGTERM

# Function to prefix output with colored label
prefix_output() {
    local color=$1
    local label=$2
    while IFS= read -r line; do
        echo -e "${color}[${label}]${NC} $line"
    done
}

# Check if stdbuf is available for unbuffered output
STDBUF_CMD=""
if command_exists stdbuf; then
    STDBUF_CMD="stdbuf -oL -eL"
fi

# Check and kill any existing processes on ports 8000 and 5173
print_info "Checking for existing processes on ports 8000 and 5173..."
lsof -ti:8000 | xargs kill -9 2>/dev/null && print_info "Killed existing process on port 8000" || true
lsof -ti:5173 | xargs kill -9 2>/dev/null && print_info "Killed existing process on port 5173" || true
sleep 1

# Start backend server
print_info "Starting Django backend server on http://localhost:8000..."
cd "$BACKEND_DIR"
source .venv/bin/activate
(
    $STDBUF_CMD python manage.py runserver 2>&1 | prefix_output "$BLUE" "Backend"
) &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully (check the process group)
if kill -0 $BACKEND_PID 2>/dev/null; then
    print_success "Backend server started (PID: $BACKEND_PID)"
else
    print_error "Failed to start backend server"
    exit 1
fi

# Start frontend server
print_info "Starting Vite frontend server on http://localhost:5173..."
cd "$FRONTEND_DIR"
(
    $STDBUF_CMD bun run dev 2>&1 | prefix_output "$GREEN" "Frontend"
) &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 2

# Check if frontend started successfully
if kill -0 $FRONTEND_PID 2>/dev/null; then
    print_success "Frontend server started (PID: $FRONTEND_PID)"
else
    print_error "Failed to start frontend server"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

# Print success message
echo ""
print_success "=========================================="
print_success "Budget Planer is running!"
print_success "=========================================="
echo ""
print_info "Backend API:  http://localhost:8000"
print_info "Frontend App: http://localhost:5173"
echo ""
print_info "Live debug output is shown below. Press Ctrl+C to stop both servers"
echo ""

# Wait for both processes and show their output
wait $BACKEND_PID $FRONTEND_PID

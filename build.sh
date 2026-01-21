#!/bin/bash

# Budget Planer - Build Script
# This script builds the Tauri application binaries for the current platform
# Usage: ./build.sh [--release] [--target TARGET] [--backend] [--frontend]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Build configuration
BUILD_MODE="debug"
TARGET=""
BUILD_TYPE="Debug"
BUILD_BACKEND=false
BUILD_FRONTEND=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --release)
            BUILD_MODE="release"
            BUILD_TYPE="Release"
            shift
            ;;
        --target)
            TARGET="$2"
            shift 2
            ;;
        --backend)
            BUILD_BACKEND=true
            shift
            ;;
        --frontend)
            BUILD_FRONTEND=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--release] [--target TARGET] [--backend] [--frontend]"
            echo "  If neither --backend nor --frontend is specified, both will be built"
            exit 1
            ;;
    esac
done

# If neither flag is specified, build both
if [ "$BUILD_BACKEND" = false ] && [ "$BUILD_FRONTEND" = false ]; then
    BUILD_BACKEND=true
    BUILD_FRONTEND=true
fi

# Project directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_DIR="$SCRIPT_DIR/backend"

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

if [ "$BUILD_FRONTEND" = true ]; then
    if ! command_exists bun; then
        print_error "bun is not installed. Please install it first:"
        echo "  curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
    print_success "bun is installed"

    if ! command_exists cargo; then
        print_error "cargo (Rust) is not installed. Please install it first:"
        echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit 1
    fi
    print_success "cargo is installed"
fi

if [ "$BUILD_BACKEND" = true ]; then
    if ! command_exists python3; then
        print_error "python3 is not installed. Please install Python 3.10+ first."
        exit 1
    fi
    print_success "python3 is installed"

    # Check for uv (optional but recommended)
    if command_exists uv; then
        print_success "uv is installed (recommended)"
    else
        print_warning "uv is not installed (optional but recommended for faster Python package management)"
    fi
fi

# Detect platform
PLATFORM="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    PLATFORM="windows"
fi

print_info "Detected platform: $PLATFORM"

# Build backend if requested
if [ "$BUILD_BACKEND" = true ]; then
    # Setup backend (needed for Tauri app)
    print_info "Setting up backend..."
    cd "$BACKEND_DIR"

    # Check if virtual environment exists, create if not
    if [ ! -d ".venv" ]; then
        print_info "Creating Python virtual environment..."
        if command_exists uv; then
            uv venv
        else
            python3 -m venv .venv
        fi
        print_success "Virtual environment created"
    else
        print_success "Virtual environment already exists"
    fi

    # Activate virtual environment
    print_info "Activating virtual environment..."
    if [ -f ".venv/bin/activate" ]; then
        source .venv/bin/activate
    elif [ -f ".venv/Scripts/activate" ]; then
        source .venv/Scripts/activate
    else
        print_error "Could not find virtual environment activation script"
        exit 1
    fi

    # Install Python dependencies
    print_info "Installing Python dependencies..."
    if command_exists uv; then
        uv pip install --native-tls -r requirements.txt
    else
        pip install -r requirements.txt
    fi
    print_success "Python dependencies installed"

    # Run migrations to ensure database is ready
    print_info "Running Django migrations..."
    python manage.py migrate --noinput > /dev/null 2>&1 || print_warning "Migrations may have failed (this is OK if database doesn't exist yet)"
    print_success "Backend setup completed"

    # Build backend executable with PyInstaller (optional, but recommended for standalone app)
    print_info "Building backend executable with PyInstaller..."
    if python -c "import PyInstaller" 2>/dev/null; then
        print_success "PyInstaller is installed"
    else
        print_info "Installing PyInstaller..."
        pip install "pyinstaller>=6.0.0" > /dev/null 2>&1
        print_success "PyInstaller installed"
    fi

    # Clean previous builds
    DIST_DIR="$BACKEND_DIR/dist"
    if [ -d "$DIST_DIR" ]; then
        rm -rf "$DIST_DIR"
    fi

    # Build the executable
    print_info "Running PyInstaller..."
    if pyinstaller backend.spec --clean --noconfirm; then
        # Check for executable (Windows uses .exe, Unix doesn't)
        if [ "$PLATFORM" == "windows" ]; then
            EXE_PATH="$DIST_DIR/backend-server.exe"
        else
            EXE_PATH="$DIST_DIR/backend-server"
        fi
        
        if [ -f "$EXE_PATH" ]; then
            print_success "Backend executable built successfully!"
            if command_exists du; then
                EXE_SIZE=$(du -h "$EXE_PATH" | cut -f1)
                print_info "Executable: $EXE_PATH ($EXE_SIZE)"
            else
                print_info "Executable: $EXE_PATH"
            fi
        else
            print_warning "Backend executable build completed but file not found at expected location: $EXE_PATH"
            print_info "Checking dist directory contents..."
            if [ -d "$DIST_DIR" ]; then
                ls -la "$DIST_DIR" 2>/dev/null || print_warning "Could not list dist directory"
            else
                print_warning "Dist directory does not exist"
            fi
        fi
        
        # Copy backend executable to Tauri resources directory and ensure it's executable
        if [ -f "$EXE_PATH" ]; then
            RESOURCES_DIR="$FRONTEND_DIR/src-tauri/resources"
            mkdir -p "$RESOURCES_DIR"
            print_info "Copying backend executable to Tauri resources..."
            cp "$EXE_PATH" "$RESOURCES_DIR/"
            chmod +x "$RESOURCES_DIR/$(basename "$EXE_PATH")"
            print_success "Backend executable copied to resources with execute permissions"
        fi
    else
        print_error "PyInstaller build failed. The app will fall back to using Python if available"
        print_info "Check the output above for error details"
    fi
fi

# Build frontend if requested
if [ "$BUILD_FRONTEND" = true ]; then
    # Setup frontend
    print_info "Setting up frontend..."
    cd "$FRONTEND_DIR"

    # Install frontend dependencies
    print_info "Installing frontend dependencies with bun..."
    bun install
    print_success "Frontend dependencies installed"

    # Build frontend
    print_info "Building frontend (TypeScript compilation and Vite build)..."
    bun run build
    print_success "Frontend build completed"

    # Build Tauri application
    print_info "Building Tauri application ($BUILD_TYPE mode)..."
    cd "$FRONTEND_DIR"

    # Determine which bundles to build based on platform and available tools
    BUNDLE_TARGETS=""
    if [ "$PLATFORM" == "linux" ]; then
        # Check if linuxdeploy is available for AppImage builds
        if command_exists linuxdeploy || [ -f "/usr/local/bin/linuxdeploy" ]; then
            print_success "linuxdeploy found - AppImage will be built"
            BUNDLE_TARGETS="deb,rpm,appimage"
        else
            print_warning "linuxdeploy not found - skipping AppImage (install with: sudo wget -q https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage -O /usr/local/bin/linuxdeploy && sudo chmod +x /usr/local/bin/linuxdeploy)"
            BUNDLE_TARGETS="deb,rpm"
        fi
    elif [ "$PLATFORM" == "macos" ]; then
        BUNDLE_TARGETS="dmg,app"
    elif [ "$PLATFORM" == "windows" ]; then
        BUNDLE_TARGETS="msi,nsis"
    fi

    # Prepare build command
    # Note: Tauri build is release mode by default, --bundles must come before --
    BUILD_CMD="bun run tauri build"

    # Add bundle targets if determined (must come before --)
    if [ ! -z "$BUNDLE_TARGETS" ]; then
        BUILD_CMD="$BUILD_CMD --bundles $BUNDLE_TARGETS"
        print_info "Building bundles: $BUNDLE_TARGETS"
    fi

    if [ ! -z "$TARGET" ]; then
        BUILD_CMD="$BUILD_CMD --target $TARGET"
    fi

    # Debug mode requires explicit --debug flag
    if [ "$BUILD_MODE" != "release" ]; then
        BUILD_CMD="$BUILD_CMD --debug"
    fi

    print_info "Running: $BUILD_CMD"
    eval $BUILD_CMD

    # Find the output directory
    if [ "$BUILD_MODE" == "release" ]; then
        OUTPUT_DIR="$FRONTEND_DIR/src-tauri/target/release"
        if [ ! -z "$TARGET" ]; then
            OUTPUT_DIR="$FRONTEND_DIR/src-tauri/target/$TARGET/release"
        fi
    else
        OUTPUT_DIR="$FRONTEND_DIR/src-tauri/target/debug"
        if [ ! -z "$TARGET" ]; then
            OUTPUT_DIR="$FRONTEND_DIR/src-tauri/target/$TARGET/debug"
        fi
    fi

    # Find bundle directory (Tauri creates bundles in target/release/bundle)
    BUNDLE_DIR=""
    if [ "$BUILD_MODE" == "release" ]; then
        if [ -d "$FRONTEND_DIR/src-tauri/target/release/bundle" ]; then
            BUNDLE_DIR="$FRONTEND_DIR/src-tauri/target/release/bundle"
        elif [ ! -z "$TARGET" ] && [ -d "$FRONTEND_DIR/src-tauri/target/$TARGET/release/bundle" ]; then
            BUNDLE_DIR="$FRONTEND_DIR/src-tauri/target/$TARGET/release/bundle"
        fi
    fi

    # Print frontend build output
    if [ "$BUILD_MODE" == "release" ] && [ ! -z "$BUNDLE_DIR" ]; then
        print_info "Binaries location:"
        echo "  $BUNDLE_DIR"
        echo ""
        print_info "Available bundles:"
        find "$BUNDLE_DIR" -type f \( -name "*.exe" -o -name "*.msi" -o -name "*.deb" -o -name "*.rpm" -o -name "*.dmg" -o -name "*.app" -o -name "*.AppImage" -o -name "*.appimage" \) 2>/dev/null | while read -r file; do
            echo "  - $file"
        done || echo "  (No installers found, check $OUTPUT_DIR for executables)"
    else
        print_info "Executable location:"
        echo "  $OUTPUT_DIR"
        echo ""
        print_info "Executable files:"
        find "$OUTPUT_DIR" -maxdepth 1 -type f -executable 2>/dev/null | while read -r file; do
            echo "  - $file"
        done || print_warning "Could not find executable files"
    fi
fi

echo ""
print_success "=========================================="
if [ "$BUILD_BACKEND" = true ] && [ "$BUILD_FRONTEND" = true ]; then
    print_success "Full build completed successfully!"
elif [ "$BUILD_BACKEND" = true ]; then
    print_success "Backend build completed successfully!"
elif [ "$BUILD_FRONTEND" = true ]; then
    print_success "Frontend build completed successfully!"
fi
print_success "=========================================="
echo ""
print_info "Build mode: $BUILD_TYPE"
if [ ! -z "$TARGET" ]; then
    print_info "Target: $TARGET"
fi
if [ "$BUILD_BACKEND" = true ]; then
    print_info "Backend: built"
fi
if [ "$BUILD_FRONTEND" = true ]; then
    print_info "Frontend: built"
fi
echo ""

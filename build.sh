#!/bin/bash

# Budget Planer - Build Script
# This script builds the Tauri application binaries for the current platform
# Usage: ./build.sh [--release] [--target TARGET] [--backend] [--frontend] [--test-backend] [--verify]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Build configuration
BUILD_MODE="debug"
TARGET=""
BUILD_TYPE="Debug"
BUILD_BACKEND=false
BUILD_FRONTEND=false
TEST_BACKEND=false
VERIFY_BUILD=false

# Exit codes
EXIT_SUCCESS=0
EXIT_TOOL_MISSING=1
EXIT_BUILD_FAILED=2
EXIT_VERIFICATION_FAILED=3

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
        --test-backend)
            TEST_BACKEND=true
            shift
            ;;
        --verify)
            VERIFY_BUILD=true
            shift
            ;;
        --help|-h)
            echo "Budget Planer Build Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --release        Build in release mode (default: debug)"
            echo "  --target TARGET  Cross-compile for TARGET platform"
            echo "  --backend        Build only the backend"
            echo "  --frontend       Build only the frontend"
            echo "  --test-backend   Test the backend executable after building"
            echo "  --verify         Verify all build artifacts after completion"
            echo "  --help, -h       Show this help message"
            echo ""
            echo "If neither --backend nor --frontend is specified, both will be built."
            echo ""
            echo "Examples:"
            echo "  $0 --release                    # Full release build"
            echo "  $0 --backend --test-backend     # Build and test backend only"
            echo "  $0 --release --verify           # Release build with verification"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--release] [--target TARGET] [--backend] [--frontend] [--test-backend] [--verify]"
            echo "  If neither --backend nor --frontend is specified, both will be built"
            echo "  Use --help for more information"
            exit $EXIT_TOOL_MISSING
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

# Track verification results
VERIFICATION_ERRORS=0
VERIFICATION_WARNINGS=0

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    VERIFICATION_WARNINGS=$((VERIFICATION_WARNINGS + 1))
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    VERIFICATION_ERRORS=$((VERIFICATION_ERRORS + 1))
}

print_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get file size in human readable format
get_file_size() {
    local file="$1"
    if [ -f "$file" ]; then
        if command_exists numfmt; then
            stat -c%s "$file" 2>/dev/null | numfmt --to=iec 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "unknown"
        else
            local size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)
            if [ -n "$size" ]; then
                echo "$((size / 1048576)) MB"
            else
                echo "unknown"
            fi
        fi
    else
        echo "N/A"
    fi
}

# Function to get file size in bytes
get_file_size_bytes() {
    local file="$1"
    if [ -f "$file" ]; then
        stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Function to test backend executable
test_backend_executable() {
    local exe_path="$1"
    
    print_header "Testing Backend Executable"
    
    if [ ! -f "$exe_path" ]; then
        print_error "Backend executable not found at: $exe_path"
        return 1
    fi
    
    print_info "Executable: $exe_path"
    print_info "Size: $(get_file_size "$exe_path")"
    
    # Check file size (warn if too small)
    local file_size=$(get_file_size_bytes "$exe_path")
    local min_size=10000000  # 10MB minimum for Django app
    
    if [ "$file_size" -lt "$min_size" ]; then
        print_warning "Executable seems too small ($file_size bytes). Expected at least $min_size bytes."
        print_warning "This may indicate a broken build or missing dependencies."
    else
        print_success "Executable size looks reasonable ($file_size bytes)"
    fi
    
    # Make sure it's executable
    if [ ! -x "$exe_path" ]; then
        print_info "Setting executable permission..."
        chmod +x "$exe_path"
    fi
    
    # Test with --help flag
    print_info "Testing executable with --help flag..."
    if timeout 30 "$exe_path" --help > /dev/null 2>&1; then
        print_success "Executable runs successfully with --help"
    else
        local exit_code=$?
        if [ "$exit_code" -eq 124 ]; then
            print_warning "Executable timed out (30s) - may be hanging or stuck"
        else
            print_warning "Executable --help test returned exit code: $exit_code"
            print_warning "This may indicate missing dependencies or import errors"
        fi
    fi
    
    # Try to get version/import test
    print_info "Testing Django import..."
    if timeout 30 "$exe_path" --port 0 2>&1 | head -5 | grep -qi "django\|server\|starting" 2>/dev/null; then
        print_success "Django imports appear to work"
    else
        print_warning "Could not verify Django imports (may still work)"
    fi
    
    echo ""
    return 0
}

# Function to verify build artifacts
verify_build_artifacts() {
    print_header "Verifying Build Artifacts"
    
    local all_ok=true
    
    # Verify backend executable
    if [ "$BUILD_BACKEND" = true ]; then
        echo -e "${CYAN}Backend Artifacts:${NC}"
        
        if [ "$PLATFORM" == "windows" ]; then
            EXE_PATH="$BACKEND_DIR/dist/backend-server.exe"
        else
            EXE_PATH="$BACKEND_DIR/dist/backend-server"
        fi
        
        if [ -f "$EXE_PATH" ]; then
            local size=$(get_file_size "$EXE_PATH")
            local size_bytes=$(get_file_size_bytes "$EXE_PATH")
            print_success "Backend executable: $EXE_PATH ($size)"
            
            if [ "$size_bytes" -lt 10000000 ]; then
                print_warning "Backend executable is smaller than expected"
            fi
        else
            print_error "Backend executable not found: $EXE_PATH"
            all_ok=false
        fi
        
        # Check resources copy
        RESOURCES_DIR="$FRONTEND_DIR/src-tauri/resources"
        if [ "$PLATFORM" == "windows" ]; then
            RESOURCE_EXE="$RESOURCES_DIR/backend-server.exe"
        else
            RESOURCE_EXE="$RESOURCES_DIR/backend-server"
        fi
        
        if [ -f "$RESOURCE_EXE" ]; then
            local size=$(get_file_size "$RESOURCE_EXE")
            print_success "Resources copy: $RESOURCE_EXE ($size)"
            
            # Verify sizes match
            if [ -f "$EXE_PATH" ]; then
                local src_size=$(get_file_size_bytes "$EXE_PATH")
                local dst_size=$(get_file_size_bytes "$RESOURCE_EXE")
                if [ "$src_size" -eq "$dst_size" ]; then
                    print_success "File sizes match (source and resources)"
                else
                    print_warning "File size mismatch: source=$src_size, resources=$dst_size"
                fi
            fi
        else
            print_warning "Resources copy not found: $RESOURCE_EXE"
        fi
        
        echo ""
    fi
    
    # Verify frontend artifacts
    if [ "$BUILD_FRONTEND" = true ]; then
        echo -e "${CYAN}Frontend Artifacts:${NC}"
        
        # Find output directory
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
        
        # Check main executable
        if [ "$PLATFORM" == "windows" ]; then
            MAIN_EXE="$OUTPUT_DIR/budget-planer.exe"
        else
            MAIN_EXE="$OUTPUT_DIR/budget-planer"
        fi
        
        if [ -f "$MAIN_EXE" ]; then
            local size=$(get_file_size "$MAIN_EXE")
            print_success "Main executable: $MAIN_EXE ($size)"
        else
            print_error "Main executable not found: $MAIN_EXE"
            all_ok=false
        fi
        
        # Check bundles
        BUNDLE_DIR="$OUTPUT_DIR/bundle"
        if [ -d "$BUNDLE_DIR" ]; then
            echo ""
            echo -e "${CYAN}Bundle Artifacts:${NC}"
            
            # Platform-specific bundle checks
            if [ "$PLATFORM" == "linux" ]; then
                # DEB
                DEB_FILE=$(find "$BUNDLE_DIR" -name "*.deb" 2>/dev/null | head -1)
                if [ -n "$DEB_FILE" ] && [ -f "$DEB_FILE" ]; then
                    print_success "DEB package: $(basename "$DEB_FILE") ($(get_file_size "$DEB_FILE"))"
                else
                    print_warning "DEB package not found"
                fi
                
                # RPM
                RPM_FILE=$(find "$BUNDLE_DIR" -name "*.rpm" 2>/dev/null | head -1)
                if [ -n "$RPM_FILE" ] && [ -f "$RPM_FILE" ]; then
                    print_success "RPM package: $(basename "$RPM_FILE") ($(get_file_size "$RPM_FILE"))"
                else
                    print_warning "RPM package not found"
                fi
                
                # AppImage (usually requires linuxdeploy, may not be available locally)
                APPIMAGE_FILE=$(find "$BUNDLE_DIR" -name "*.AppImage" 2>/dev/null | head -1)
                if [ -n "$APPIMAGE_FILE" ] && [ -f "$APPIMAGE_FILE" ]; then
                    print_success "AppImage: $(basename "$APPIMAGE_FILE") ($(get_file_size "$APPIMAGE_FILE"))"
                else
                    print_warning "AppImage not found (requires linuxdeploy)"
                fi
                
            elif [ "$PLATFORM" == "macos" ]; then
                # App bundle
                APP_BUNDLE=$(find "$BUNDLE_DIR" -name "*.app" -type d 2>/dev/null | head -1)
                if [ -n "$APP_BUNDLE" ] && [ -d "$APP_BUNDLE" ]; then
                    local size=$(du -sh "$APP_BUNDLE" 2>/dev/null | cut -f1)
                    print_success "App bundle: $(basename "$APP_BUNDLE") ($size)"
                else
                    print_error "App bundle not found"
                    all_ok=false
                fi
                
                # DMG
                DMG_FILE=$(find "$BUNDLE_DIR" -name "*.dmg" 2>/dev/null | head -1)
                if [ -n "$DMG_FILE" ] && [ -f "$DMG_FILE" ]; then
                    print_success "DMG: $(basename "$DMG_FILE") ($(get_file_size "$DMG_FILE"))"
                else
                    print_warning "DMG not found"
                fi
                
            elif [ "$PLATFORM" == "windows" ]; then
                # MSI
                MSI_FILE=$(find "$BUNDLE_DIR" -name "*.msi" 2>/dev/null | head -1)
                if [ -n "$MSI_FILE" ] && [ -f "$MSI_FILE" ]; then
                    print_success "MSI installer: $(basename "$MSI_FILE") ($(get_file_size "$MSI_FILE"))"
                else
                    print_warning "MSI installer not found"
                fi
                
                # NSIS
                NSIS_FILE=$(find "$BUNDLE_DIR" -name "*_x64-setup.exe" 2>/dev/null | head -1)
                if [ -n "$NSIS_FILE" ] && [ -f "$NSIS_FILE" ]; then
                    print_success "NSIS installer: $(basename "$NSIS_FILE") ($(get_file_size "$NSIS_FILE"))"
                else
                    print_warning "NSIS installer not found"
                fi
            fi
        else
            print_warning "Bundle directory not found: $BUNDLE_DIR"
        fi
        
        echo ""
    fi
    
    # Summary
    echo -e "${CYAN}Verification Summary:${NC}"
    if [ "$VERIFICATION_ERRORS" -gt 0 ]; then
        print_error "Errors: $VERIFICATION_ERRORS"
    else
        print_success "Errors: 0"
    fi
    
    if [ "$VERIFICATION_WARNINGS" -gt 0 ]; then
        print_warning "Warnings: $VERIFICATION_WARNINGS"
    else
        print_success "Warnings: 0"
    fi
    
    if [ "$all_ok" = false ]; then
        return 1
    fi
    return 0
}

print_header "Budget Planer Build Script"

# Check for required tools
print_info "Checking for required tools..."

if [ "$BUILD_FRONTEND" = true ]; then
    if ! command_exists bun; then
        print_error "bun is not installed. Please install it first:"
        echo "  curl -fsSL https://bun.sh/install | bash"
        exit $EXIT_TOOL_MISSING
    fi
    print_success "bun is installed"

    if ! command_exists cargo; then
        print_error "cargo (Rust) is not installed. Please install it first:"
        echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit $EXIT_TOOL_MISSING
    fi
    print_success "cargo is installed"
fi

if [ "$BUILD_BACKEND" = true ]; then
    if ! command_exists python3; then
        print_error "python3 is not installed. Please install Python 3.10+ first."
        exit $EXIT_TOOL_MISSING
    fi
    print_success "python3 is installed"

    # Check for uv (optional but recommended)
    if command_exists uv; then
        print_success "uv is installed (recommended)"
    else
        print_warning "uv is not installed (optional but recommended for faster Python package management)"
        # Reset warning count since this is just informational
        VERIFICATION_WARNINGS=$((VERIFICATION_WARNINGS - 1))
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
    print_header "Building Backend"
    
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
        exit $EXIT_BUILD_FAILED
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
    python manage.py migrate --noinput > /dev/null 2>&1 || print_info "Migrations skipped (this is OK if database doesn't exist yet)"
    print_success "Backend setup completed"

    # Build backend executable with PyInstaller
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
    print_info "Running PyInstaller (this may take a few minutes)..."
    if pyinstaller backend.spec --clean --noconfirm; then
        # Check for executable (Windows uses .exe, Unix doesn't)
        if [ "$PLATFORM" == "windows" ]; then
            EXE_PATH="$DIST_DIR/backend-server.exe"
        else
            EXE_PATH="$DIST_DIR/backend-server"
        fi
        
        if [ -f "$EXE_PATH" ]; then
            print_success "Backend executable built successfully!"
            print_info "Executable: $EXE_PATH ($(get_file_size "$EXE_PATH"))"
            
            # Test backend if requested
            if [ "$TEST_BACKEND" = true ]; then
                test_backend_executable "$EXE_PATH"
            fi
        else
            print_error "Backend executable build completed but file not found at expected location: $EXE_PATH"
            print_info "Checking dist directory contents..."
            if [ -d "$DIST_DIR" ]; then
                ls -la "$DIST_DIR" 2>/dev/null || print_error "Could not list dist directory"
            else
                print_error "Dist directory does not exist"
            fi
            exit $EXIT_BUILD_FAILED
        fi
        
        # Copy backend executable to Tauri resources directory and ensure it's executable
        if [ -f "$EXE_PATH" ]; then
            RESOURCES_DIR="$FRONTEND_DIR/src-tauri/resources"
            mkdir -p "$RESOURCES_DIR"
            print_info "Copying backend executable to Tauri resources..."
            cp "$EXE_PATH" "$RESOURCES_DIR/"
            chmod +x "$RESOURCES_DIR/$(basename "$EXE_PATH")"
            
            # Verify copy
            COPY_SRC_SIZE=$(get_file_size_bytes "$EXE_PATH")
            COPY_DST_SIZE=$(get_file_size_bytes "$RESOURCES_DIR/$(basename "$EXE_PATH")")
            if [ "$COPY_SRC_SIZE" -eq "$COPY_DST_SIZE" ]; then
                print_success "Backend executable copied to resources (verified)"
            else
                print_warning "File size mismatch after copy!"
            fi
        fi
    else
        print_error "PyInstaller build failed!"
        print_info "Check the output above for error details"
        exit $EXIT_BUILD_FAILED
    fi
fi

# Build frontend if requested
if [ "$BUILD_FRONTEND" = true ]; then
    print_header "Building Frontend"
    
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

    # Determine which bundles to build based on platform
    # Note: AppImage is excluded from local builds (requires linuxdeploy)
    # CI builds AppImage separately with linuxdeploy installed
    BUNDLE_TARGETS=""
    if [ "$PLATFORM" == "linux" ]; then
        BUNDLE_TARGETS="deb,rpm"
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
        find "$BUNDLE_DIR" -type f \( -name "*.exe" -o -name "*.msi" -o -name "*.deb" -o -name "*.rpm" -o -name "*.dmg" -o -name "*.AppImage" -o -name "*.appimage" \) 2>/dev/null | while read -r file; do
            echo "  - $file ($(get_file_size "$file"))"
        done || echo "  (No installers found, check $OUTPUT_DIR for executables)"
    else
        print_info "Executable location:"
        echo "  $OUTPUT_DIR"
        echo ""
        print_info "Executable files:"
        find "$OUTPUT_DIR" -maxdepth 1 -type f -executable 2>/dev/null | while read -r file; do
            echo "  - $file"
        done || print_info "Could not find executable files"
    fi
fi

# Verify build artifacts if requested
if [ "$VERIFY_BUILD" = true ]; then
    verify_build_artifacts
    VERIFY_RESULT=$?
    
    if [ "$VERIFY_RESULT" -ne 0 ]; then
        print_error "Build verification failed!"
        exit $EXIT_VERIFICATION_FAILED
    fi
fi

# Final summary
print_header "Build Complete"

if [ "$BUILD_BACKEND" = true ] && [ "$BUILD_FRONTEND" = true ]; then
    print_success "Full build completed successfully!"
elif [ "$BUILD_BACKEND" = true ]; then
    print_success "Backend build completed successfully!"
elif [ "$BUILD_FRONTEND" = true ]; then
    print_success "Frontend build completed successfully!"
fi

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
if [ "$TEST_BACKEND" = true ]; then
    print_info "Backend test: completed"
fi
if [ "$VERIFY_BUILD" = true ]; then
    print_info "Verification: completed"
fi

echo ""
exit $EXIT_SUCCESS
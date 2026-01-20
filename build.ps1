# Budget Planer - Build Script (PowerShell)
# This script builds the Tauri application binaries for Windows
# Usage: .\build.ps1 [-Release] [-Target TARGET]

param(
    [switch]$Release,
    [string]$Target = ""
)

# Error handling
$ErrorActionPreference = "Stop"

# Colors for output (PowerShell 5.1+ compatible)
function Write-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

# Build configuration
$BuildMode = if ($Release) { "release" } else { "debug" }
$BuildType = if ($Release) { "Release" } else { "Debug" }

# Project directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $ScriptDir "frontend"
$BackendDir = Join-Path $ScriptDir "backend"

# Function to check if a command exists
function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Check for required tools
Write-Info "Checking for required tools..."

if (-not (Test-Command "bun")) {
    Write-Error "bun is not installed. Please install it first:"
    Write-Host "  powershell -c `"irm bun.sh/install.ps1 | iex`""
    exit 1
}
Write-Success "bun is installed"

if (-not (Test-Command "cargo")) {
    Write-Error "cargo (Rust) is not installed. Please install it first:"
    Write-Host "  Visit: https://rustup.rs/"
    exit 1
}
Write-Success "cargo is installed"

if (-not (Test-Command "python")) {
    Write-Error "python is not installed. Please install Python 3.10+ first."
    exit 1
}
Write-Success "python is installed"

# Check for uv (optional but recommended)
if (Test-Command "uv") {
    Write-Success "uv is installed (recommended)"
} else {
    Write-Warning "uv is not installed (optional but recommended for faster Python package management)"
}

# Detect platform
$Platform = "windows"
Write-Info "Detected platform: $Platform"

# Setup backend (needed for Tauri app)
Write-Info "Setting up backend..."
Push-Location $BackendDir

# Check if virtual environment exists, create if not
if (-not (Test-Path ".venv")) {
    Write-Info "Creating Python virtual environment..."
    if (Test-Command "uv") {
        uv venv
    } else {
        python -m venv .venv
    }
    Write-Success "Virtual environment created"
} else {
    Write-Success "Virtual environment already exists"
}

# Activate virtual environment
Write-Info "Activating virtual environment..."
$VenvActivate = Join-Path $BackendDir ".venv\Scripts\Activate.ps1"
if (Test-Path $VenvActivate) {
    & $VenvActivate
} else {
    Write-Error "Could not find virtual environment activation script"
    Pop-Location
    exit 1
}

# Install Python dependencies
Write-Info "Installing Python dependencies..."
if (Test-Command "uv") {
    uv pip install --native-tls -r requirements.txt
} else {
    pip install -r requirements.txt
}
Write-Success "Python dependencies installed"

# Run migrations to ensure database is ready
Write-Info "Running Django migrations..."
try {
    python manage.py migrate --noinput | Out-Null
    Write-Success "Migrations completed"
} catch {
    Write-Warning "Migrations may have failed (this is OK if database doesn't exist yet)"
}
Write-Success "Backend setup completed"

# Build backend executable with PyInstaller (optional, but recommended for standalone app)
Write-Info "Building backend executable with PyInstaller..."
try {
    # Check if PyInstaller is installed
    $PyInstallerCheck = & python -c "import PyInstaller; print('ok')" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Installing PyInstaller..."
        pip install "pyinstaller>=6.0.0" | Out-Null
        Write-Success "PyInstaller installed"
    } else {
        Write-Success "PyInstaller is installed"
    }
    
    # Clean previous builds
    $DistDir = Join-Path $BackendDir "dist"
    if (Test-Path $DistDir) {
        Remove-Item -Path $DistDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # Build the executable
    Write-Info "Running PyInstaller..."
    pyinstaller backend.spec --clean --noconfirm
    
    if ($LASTEXITCODE -eq 0) {
        $ExePath = Join-Path $DistDir "backend-server.exe"
        if (Test-Path $ExePath) {
            Write-Success "Backend executable built successfully!"
            $ExeSize = [math]::Round((Get-Item $ExePath).Length / 1MB, 2)
            Write-Info "Executable: $ExePath ($ExeSize MB)"
        } else {
            Write-Warning "Backend executable build completed but file not found at expected location"
            Write-Info "Checking dist directory contents..."
            if (Test-Path $DistDir) {
                Get-ChildItem -Path $DistDir | ForEach-Object { Write-Info "  - $($_.Name)" }
            } else {
                Write-Warning "Dist directory does not exist"
            }
        }
    } else {
        Write-Error "PyInstaller build failed. The app will fall back to using Python if available"
        Write-Info "Check the output above for error details"
    }
} catch {
    Write-Warning "Failed to build backend executable: $_"
    Write-Warning "The app will fall back to using Python if available"
}

Pop-Location

# Setup frontend
Write-Info "Setting up frontend..."
Push-Location $FrontendDir

# Install frontend dependencies
Write-Info "Installing frontend dependencies with bun..."
bun install
Write-Success "Frontend dependencies installed"

# Build frontend
Write-Info "Building frontend (TypeScript compilation and Vite build)..."
bun run build
Write-Success "Frontend build completed"

# Build Tauri application
Write-Info "Building Tauri application ($BuildType mode)..."

# Prepare build command
$BuildCmd = "bun run tauri build"
if ($Release) {
    $BuildCmd += " -- --release"
}

if ($Target) {
    $BuildCmd += " --target $Target"
}

Write-Info "Running: $BuildCmd"
Invoke-Expression $BuildCmd

# Find the output directory
if ($Release) {
    $OutputDir = Join-Path $FrontendDir "src-tauri\target\release"
    if ($Target) {
        $OutputDir = Join-Path $FrontendDir "src-tauri\target\$Target\release"
    }
} else {
    $OutputDir = Join-Path $FrontendDir "src-tauri\target\debug"
    if ($Target) {
        $OutputDir = Join-Path $FrontendDir "src-tauri\target\$Target\debug"
    }
}

# Find bundle directory (Tauri creates bundles in target/release/bundle)
$BundleDir = $null
if ($Release) {
    $PossibleBundleDir = Join-Path $FrontendDir "src-tauri\target\release\bundle"
    if ($Target) {
        $PossibleBundleDir = Join-Path $FrontendDir "src-tauri\target\$Target\release\bundle"
    }
    if (Test-Path $PossibleBundleDir) {
        $BundleDir = $PossibleBundleDir
    }
}

# Print success message
Write-Host ""
Write-Success "=========================================="
Write-Success "Build completed successfully!"
Write-Success "=========================================="
Write-Host ""

if ($Release -and $BundleDir) {
    Write-Info "Binaries location:"
    Write-Host "  $BundleDir"
    Write-Host ""
    Write-Info "Available bundles:"
    Get-ChildItem -Path $BundleDir -Recurse -File | Where-Object {
        $_.Extension -in @(".exe", ".msi", ".appx", ".appxbundle") -or 
        $_.Name -like "*.exe" -or 
        $_.Name -like "*installer*"
    } | ForEach-Object {
        Write-Host "  - $($_.FullName)"
    }
    if (-not (Get-ChildItem -Path $BundleDir -Recurse -File -ErrorAction SilentlyContinue | Where-Object { 
        $_.Extension -in @(".exe", ".msi", ".appx", ".appxbundle") -or $_.Name -like "*.exe" -or $_.Name -like "*installer*" 
    })) {
        Write-Warning "No installers found, check $OutputDir for executables"
    }
} else {
    Write-Info "Executable location:"
    Write-Host "  $OutputDir"
    Write-Host ""
    Write-Info "Executable files:"
    Get-ChildItem -Path $OutputDir -File -ErrorAction SilentlyContinue | Where-Object {
        $_.Extension -eq ".exe" -or $_.Name -like "budget-planer*"
    } | ForEach-Object {
        Write-Host "  - $($_.FullName)"
    }
    if (-not (Get-ChildItem -Path $OutputDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -eq ".exe" -or $_.Name -like "budget-planer*" })) {
        Write-Warning "Could not find executable files"
    }
}

Write-Host ""
Write-Info "Build mode: $BuildType"
if ($Target) {
    Write-Info "Target: $Target"
}
Write-Host ""

Pop-Location

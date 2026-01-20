# Budget Planer - Backend Setup Script (PowerShell)
# This script sets up the Python backend for the Budget Planer application
# Usage: .\setup-backend.ps1

# Error handling
$ErrorActionPreference = "Stop"

# Colors for output
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

# Project directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptDir "backend"

# Function to check if a command exists
function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Check for Python
Write-Info "Checking for Python..."

$PythonCmd = $null
$PythonVersion = $null

# Try python3 first, then python
if (Test-Command "python3") {
    $PythonCmd = "python3"
    try {
        $PythonVersion = & python3 --version 2>&1
        Write-Success "Found Python: $PythonVersion"
    } catch {
        $PythonCmd = $null
    }
}

if (-not $PythonCmd -and (Test-Command "python")) {
    $PythonCmd = "python"
    try {
        $PythonVersion = & python --version 2>&1
        Write-Success "Found Python: $PythonVersion"
    } catch {
        $PythonCmd = $null
    }
}

if (-not $PythonCmd) {
    Write-Error "Python is not installed or not found in PATH"
    Write-Host ""
    Write-Host "Please install Python 3.10 or higher:"
    Write-Host "  1. Download from: https://www.python.org/downloads/"
    Write-Host "  2. During installation, make sure to check 'Add Python to PATH'"
    Write-Host "  3. Restart your terminal/command prompt after installation"
    Write-Host ""
    Write-Host "Alternatively, install Python using the Microsoft Store:"
    Write-Host "  - Search for 'Python 3.11' or 'Python 3.12' in Microsoft Store"
    Write-Host ""
    exit 1
}

# Check Python version (need 3.10+)
Write-Info "Checking Python version..."
$VersionMatch = $PythonVersion -match "Python (\d+)\.(\d+)"
if ($VersionMatch) {
    $MajorVersion = [int]$Matches[1]
    $MinorVersion = [int]$Matches[2]
    
    if ($MajorVersion -lt 3 -or ($MajorVersion -eq 3 -and $MinorVersion -lt 10)) {
        Write-Error "Python 3.10 or higher is required. Found: Python $MajorVersion.$MinorVersion"
        Write-Host "Please install Python 3.10 or higher from https://www.python.org/downloads/"
        exit 1
    }
    Write-Success "Python version is compatible: $MajorVersion.$MinorVersion"
} else {
    Write-Warning "Could not determine Python version, continuing anyway..."
}

# Check for uv (optional but recommended)
$UseUv = $false
if (Test-Command "uv") {
    Write-Success "uv is installed (will use for faster package management)"
    $UseUv = $true
} else {
    Write-Warning "uv is not installed (optional but recommended)"
    Write-Info "To install uv: powershell -c `"irm https://astral.sh/uv/install.ps1 | iex`""
}

# Check if backend directory exists
if (-not (Test-Path $BackendDir)) {
    Write-Error "Backend directory not found: $BackendDir"
    Write-Host "Please make sure you're running this script from the project root directory"
    exit 1
}

Write-Info "Backend directory found: $BackendDir"

# Setup backend
Write-Info "Setting up backend..."
Push-Location $BackendDir

# Check if virtual environment exists, create if not
if (-not (Test-Path ".venv")) {
    Write-Info "Creating Python virtual environment..."
    if ($UseUv) {
        uv venv
    } else {
        & $PythonCmd -m venv .venv
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
if ($UseUv) {
    uv pip install --native-tls -r requirements.txt
} else {
    pip install -r requirements.txt
}
Write-Success "Python dependencies installed"

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Warning ".env file not found. Creating default .env file..."
    
    # Generate secret key using Python
    $SecretKey = & $PythonCmd -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
    
    $EnvContent = @"
SECRET_KEY=$SecretKey
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
"@
    
    $EnvContent | Out-File -FilePath ".env" -Encoding utf8
    Write-Success ".env file created with default values"
} else {
    Write-Success ".env file already exists"
}

# Run migrations
Write-Info "Running Django migrations..."
try {
    python manage.py migrate --noinput | Out-Null
    Write-Success "Migrations completed"
} catch {
    Write-Warning "Migrations may have failed (this is OK if database doesn't exist yet)"
}

Pop-Location

# Print success message
Write-Host ""
Write-Success "=========================================="
Write-Success "Backend setup completed successfully!"
Write-Success "=========================================="
Write-Host ""
Write-Info "The backend is now ready to use."
Write-Info "You can start the application and the backend will start automatically."
Write-Host ""

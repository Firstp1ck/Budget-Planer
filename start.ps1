# Budget Planer - Setup and Start Script
# This script checks dependencies, installs packages, and starts both backend and frontend servers
# Usage: .\start.ps1 [-SetupOnly]

param(
    [switch]$SetupOnly
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Project directories
$SCRIPT_DIR = $PSScriptRoot
$BACKEND_DIR = Join-Path $SCRIPT_DIR "backend"
$FRONTEND_DIR = Join-Path $SCRIPT_DIR "frontend"

# Function to check if a command exists
function Test-Command {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Function to get the virtual environment activation script path
function Get-VenvActivate {
    param([string]$VenvDir)
    
    $activateScript = Join-Path $VenvDir "Scripts\Activate.ps1"
    if (Test-Path $activateScript) {
        return $activateScript
    }
    
    $activateScript = Join-Path $VenvDir "bin\activate"
    if (Test-Path $activateScript) {
        return $activateScript
    }
    
    Write-ErrorMsg "Could not find virtual environment activation script in $VenvDir"
    exit 1
}

# Function to kill process on a port
function Stop-Port {
    param([int]$Port)
    
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
        foreach ($conn in $connections) {
            $processId = $conn.OwningProcess
            if ($processId -and $processId -ne 0) {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Write-Info "Killed existing process on port $Port (PID: $processId)"
                return $true
            }
        }
    }
    catch {
        # Fallback to netstat if Get-NetTCPConnection fails
        try {
            $netstatOutput = netstat -ano | Select-String ":$Port\s+.*LISTENING"
            if ($netstatOutput) {
                $processId = ($netstatOutput -split '\s+')[-1]
                if ($processId -and $processId -ne "0") {
                    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                    Write-Info "Killed existing process on port $Port (PID: $processId)"
                    return $true
                }
            }
        }
        catch {
            # Ignore errors
        }
    }
    return $false
}

# Function to cleanup on exit
function Stop-Servers {
    Write-Info "Shutting down servers..."
    
    # Kill backend process
    if ($script:BACKEND_PROCESS) {
        try {
            Stop-Process -Id $script:BACKEND_PROCESS.Id -Force -ErrorAction SilentlyContinue
        }
        catch {
            # Ignore errors
        }
    }
    
    # Kill frontend process
    if ($script:FRONTEND_PROCESS) {
        try {
            Stop-Process -Id $script:FRONTEND_PROCESS.Id -Force -ErrorAction SilentlyContinue
        }
        catch {
            # Ignore errors
        }
    }
    
    # Wait a moment for graceful shutdown
    Start-Sleep -Seconds 1
    
    # Force kill any remaining processes on ports 8000 and 5173
    Stop-Port -Port 8000 | Out-Null
    Stop-Port -Port 5173 | Out-Null
    
    Write-Info "Servers stopped"
}

# Setup cleanup handler for Ctrl+C
$Host.UI.RawUI.WindowTitle = "Budget Planer - Press Ctrl+C to stop"

# Register cleanup on exit
try {
    $null = Register-EngineEvent PowerShell.Exiting -Action { Stop-Servers } -ErrorAction SilentlyContinue
}
catch {
    # PowerShell.Exiting not available in all versions, that's okay
}

# Check for required tools
Write-Info "Checking for required tools..."

if (-not (Test-Command "uv")) {
    Write-ErrorMsg "uv is not installed. Please install it first:"
    Write-Host "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
}
Write-Success "uv is installed"

if (-not (Test-Command "bun")) {
    Write-ErrorMsg "bun is not installed. Please install it first:"
    Write-Host "  curl -fsSL https://bun.sh/install | bash"
    exit 1
}
Write-Success "bun is installed"

# Setup backend
Write-Info "Setting up backend..."
Set-Location $BACKEND_DIR

# Check if virtual environment exists, create if not
if (-not (Test-Path ".venv")) {
    Write-Info "Creating Python virtual environment..."
    try {
        & uv venv
        if ($LASTEXITCODE -ne 0) {
            throw "uv venv failed with exit code $LASTEXITCODE"
        }
        # Verify that .venv was actually created
        if (-not (Test-Path ".venv")) {
            throw "Virtual environment directory was not created"
        }
        Write-Success "Virtual environment created"
    }
    catch {
        Write-ErrorMsg "Failed to create virtual environment: $_"
        Write-ErrorMsg "This might be due to network/certificate issues. Please check your connection and try again."
        exit 1
    }
}
else {
    Write-Success "Virtual environment already exists"
}

# Activate virtual environment
Write-Info "Activating virtual environment..."
$VENV_ACTIVATE = Get-VenvActivate ".venv"

# For PowerShell, we need to dot-source the activation script
if ($VENV_ACTIVATE.EndsWith(".ps1")) {
    . $VENV_ACTIVATE
}
else {
    # For bash-style activate script, we'll need to set environment variables manually
    # This is a fallback - normally on Windows it should be .ps1
    Write-Warning "Using bash-style activate script, environment may not be fully activated"
    # Try to set PATH manually for bash-style venv
    $venvBin = Join-Path (Resolve-Path ".venv") "bin"
    if (Test-Path $venvBin) {
        $env:PATH = "$venvBin;$env:PATH"
    }
}

# Install Python dependencies
Write-Info "Installing Python dependencies with uv..."
try {
    & uv pip install --native-tls -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        throw "uv pip install failed with exit code $LASTEXITCODE"
    }
    Write-Success "Python dependencies installed"
}
catch {
    Write-ErrorMsg "Failed to install Python dependencies: $_"
    exit 1
}

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Warning ".env file not found. Creating default .env file..."
    
    # Get Python executable from venv
    $pythonExe = Join-Path (Resolve-Path ".venv") "Scripts\python.exe"
    if (-not (Test-Path $pythonExe)) {
        $pythonExe = Join-Path (Resolve-Path ".venv") "bin\python"
    }
    
    # Generate secret key
    try {
        $secretKey = & $pythonExe -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to generate secret key"
        }
    }
    catch {
        Write-ErrorMsg "Failed to generate secret key: $_"
        Write-ErrorMsg "Make sure Django is installed in the virtual environment"
        exit 1
    }
    
    $envContent = @"
SECRET_KEY=$secretKey
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
"@
    
    Set-Content -Path ".env" -Value $envContent
    Write-Success ".env file created with default values"
}
else {
    Write-Success ".env file already exists"
}

# Run migrations
Write-Info "Running Django migrations..."
$pythonExe = Join-Path (Resolve-Path ".venv") "Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = Join-Path (Resolve-Path ".venv") "bin\python"
}
if (-not (Test-Path $pythonExe)) {
    Write-ErrorMsg "Python executable not found in virtual environment"
    exit 1
}
try {
    & $pythonExe manage.py migrate --noinput
    if ($LASTEXITCODE -ne 0) {
        throw "Django migrations failed with exit code $LASTEXITCODE"
    }
    Write-Success "Migrations completed"
}
catch {
    Write-ErrorMsg "Failed to run migrations: $_"
    exit 1
}

# Setup frontend
Write-Info "Setting up frontend..."
Set-Location $FRONTEND_DIR

# Install frontend dependencies
Write-Info "Installing frontend dependencies with bun..."
try {
    & bun install
    if ($LASTEXITCODE -ne 0) {
        throw "bun install failed with exit code $LASTEXITCODE"
    }
    Write-Success "Frontend dependencies installed"
}
catch {
    Write-ErrorMsg "Failed to install frontend dependencies: $_"
    exit 1
}

# If setup-only mode, exit here
if ($SetupOnly) {
    Write-Host ""
    Write-Success "=========================================="
    Write-Success "Setup completed successfully!"
    Write-Success "=========================================="
    Write-Host ""
    Write-Info "To start the servers, run:"
    Write-Info "  .\start.ps1"
    Write-Host ""
    exit 0
}

# Check and kill any existing processes on ports 8000 and 5173
Write-Info "Checking for existing processes on ports 8000 and 5173..."
Stop-Port -Port 8000 | Out-Null
Stop-Port -Port 5173 | Out-Null
Start-Sleep -Seconds 1

# Function to handle process output with prefix
function Start-ProcessWithPrefix {
    param(
        [string]$FilePath,
        [string]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$Prefix,
        [string]$Color
    )
    
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $FilePath
    $processInfo.Arguments = $ArgumentList
    $processInfo.WorkingDirectory = $WorkingDirectory
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    
    # Add event handlers for output
    $outputHandler = { 
        param($eventSender, $outputEventArgs) 
        if ($outputEventArgs.Data) { 
            Write-Host "[$Prefix] $($outputEventArgs.Data)" -ForegroundColor $Color 
        } 
    }
    $errorHandler = { 
        param($eventSender, $errorEventArgs) 
        if ($errorEventArgs.Data) { 
            Write-Host "[$Prefix] $($errorEventArgs.Data)" -ForegroundColor $Color 
        } 
    }
    
    $process.add_OutputDataReceived($outputHandler)
    $process.add_ErrorDataReceived($errorHandler)
    
    $process.Start() | Out-Null
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()
    
    return $process
}

# Start backend server
Write-Info "Starting Django backend server on http://localhost:8000..."
Set-Location $BACKEND_DIR

$pythonExe = Join-Path (Resolve-Path ".venv") "Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = Join-Path (Resolve-Path ".venv") "bin\python"
}

$script:BACKEND_PROCESS = Start-ProcessWithPrefix `
    -FilePath $pythonExe `
    -ArgumentList "manage.py runserver" `
    -WorkingDirectory $BACKEND_DIR `
    -Prefix "Backend" `
    -Color "Blue"

# Wait a moment for backend to start
Start-Sleep -Seconds 2

# Check if backend started successfully
if ($script:BACKEND_PROCESS -and -not $script:BACKEND_PROCESS.HasExited) {
    Write-Success "Backend server started (PID: $($script:BACKEND_PROCESS.Id))"
}
else {
    Write-ErrorMsg "Failed to start backend server"
    exit 1
}

# Start frontend server
Write-Info "Starting Vite frontend server on http://localhost:5173..."
Set-Location $FRONTEND_DIR

$script:FRONTEND_PROCESS = Start-ProcessWithPrefix `
    -FilePath "bun" `
    -ArgumentList "run dev" `
    -WorkingDirectory $FRONTEND_DIR `
    -Prefix "Frontend" `
    -Color "Green"

# Wait a moment for frontend to start
Start-Sleep -Seconds 2

# Check if frontend started successfully
if ($script:FRONTEND_PROCESS -and -not $script:FRONTEND_PROCESS.HasExited) {
    Write-Success "Frontend server started (PID: $($script:FRONTEND_PROCESS.Id))"
}
else {
    Write-ErrorMsg "Failed to start frontend server"
    if ($script:BACKEND_PROCESS) {
        Stop-Process -Id $script:BACKEND_PROCESS.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

# Print success message
Write-Host ""
Write-Success "=========================================="
Write-Success "Budget Planer is running!"
Write-Success "=========================================="
Write-Host ""
Write-Info "Backend API:  http://localhost:8000"
Write-Info "Frontend App: http://localhost:5173"
Write-Host ""
Write-Info "Live debug output is shown above. Press Ctrl+C to stop both servers"
Write-Host ""

# Wait for both processes
try {
    while ($true) {
        if ($script:BACKEND_PROCESS.HasExited -or $script:FRONTEND_PROCESS.HasExited) {
            Write-Info "One of the servers has stopped"
            break
        }
        Start-Sleep -Seconds 1
    }
}
catch {
    # Handle Ctrl+C or other interruptions
    Write-Host ""
    Write-Info "Interrupted by user"
}
finally {
    # Ensure cleanup runs on exit
    Stop-Servers
}

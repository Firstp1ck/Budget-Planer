# Budget Planer - Release Script (PowerShell)
# This script creates a git tag and pushes it to trigger the GitHub Actions release workflow
# Usage: .\release.ps1 <version>
# Example: .\release.ps1 v1.0.0

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
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

# Check for required tools
Write-Info "Checking for required tools..."

if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
    Write-Error "git is not installed. Please install it first."
    exit 1
}
Write-Success "git is installed"

# Check for GitHub CLI (optional but recommended for release deletion)
$GhAvailable = $false
if (Get-Command "gh" -ErrorAction SilentlyContinue) {
    $GhAvailable = $true
    Write-Success "GitHub CLI (gh) is installed"
} else {
    Write-Warning "GitHub CLI (gh) is not installed (optional, but recommended for release management)"
    Write-Warning "Install it from: https://cli.github.com/"
}

# Validate version format (should be vX.X.X)
$VersionPattern = '^v\d+\.\d+\.\d+$'
if ($Version -notmatch $VersionPattern) {
    Write-Error "Invalid version format: $Version"
    Write-Host "Version should be in format: vX.X.X"
    Write-Host "Examples: v1.0.0, v1.2.3, v2.0.0"
    exit 1
}

Write-Success "Version format is valid: $Version"

# Check if we're in a git repository
try {
    $null = git rev-parse --git-dir 2>&1
} catch {
    Write-Error "Not in a git repository"
    exit 1
}

# Check if there are uncommitted changes (only tracked files, ignore untracked)
# Use git status --porcelain to check for actual changes
$StatusOutput = git status --porcelain 2>&1
if ($StatusOutput) {
    # Filter out untracked files (lines starting with ??)
    $TrackedChanges = $StatusOutput | Where-Object { $_ -notmatch '^\?\?' }
    if ($TrackedChanges) {
        Write-Warning "You have uncommitted changes in tracked files"
        $Response = Read-Host "Do you want to continue anyway? (y/N)"
        if ($Response -notmatch '^[Yy]$') {
            Write-Info "Release cancelled"
            exit 0
        }
    }
}

# Check if remote is configured
try {
    $null = git remote get-url origin 2>&1
} catch {
    Write-Error "No remote 'origin' configured"
    exit 1
}

# Extract repository name from remote URL
$RemoteUrl = git remote get-url origin 2>&1
$RepoName = ""
if ($RemoteUrl -match 'github\.com[:/]([^/]+/[^/]+)') {
    $RepoName = $matches[1] -replace '\.git$', ''
}

# Check if release already exists on GitHub
$ReleaseExists = $false
if ($GhAvailable -and $RepoName) {
    Write-Info "Checking if release $Version already exists on GitHub..."
    try {
        $null = gh release view "$Version" --repo "$RepoName" 2>&1
        $ReleaseExists = $true
        Write-Warning "Release $Version already exists on GitHub"
    } catch {
        Write-Info "Release $Version does not exist on GitHub"
    }
}

# Check if tag already exists (local or remote)
$TagExistsLocal = $false
$TagExistsRemote = $false

try {
    $null = git rev-parse "$Version" 2>&1
    $TagExistsLocal = $true
} catch {
    $TagExistsLocal = $false
}

try {
    $RemoteTags = git ls-remote --tags origin 2>&1
    if ($RemoteTags -match "refs/tags/$Version") {
        $TagExistsRemote = $true
    }
} catch {
    $TagExistsRemote = $false
}

# If release or tag exists, delete them
if ($ReleaseExists -or $TagExistsLocal -or $TagExistsRemote) {
    if ($ReleaseExists) {
        Write-Warning "Release $Version will be deleted and recreated"
    }
    if ($TagExistsLocal -or $TagExistsRemote) {
        Write-Warning "Tag $Version will be deleted and recreated"
    }
    
    # Delete GitHub release if it exists
    if ($ReleaseExists -and $GhAvailable) {
        Write-Info "Deleting existing GitHub release..."
        try {
            gh release delete "$Version" --repo "$RepoName" --yes 2>&1 | Out-Null
            Write-Success "GitHub release deleted"
        } catch {
            Write-Error "Failed to delete GitHub release"
            Write-Warning "You may need to delete it manually from GitHub"
        }
    } elseif ($ReleaseExists) {
        Write-Warning "Cannot delete GitHub release automatically (gh CLI not available)"
        Write-Warning "Please delete it manually from: https://github.com/$RepoName/releases/tag/$Version"
    }
    
    # Delete remote tag if it exists
    if ($TagExistsRemote) {
        Write-Info "Deleting remote tag..."
        try {
            git push origin ":refs/tags/$Version" 2>&1 | Out-Null
            Write-Success "Remote tag deleted"
        } catch {
            Write-Warning "Failed to delete remote tag (may not exist or already deleted)"
        }
    }
    
    # Delete local tag if it exists
    if ($TagExistsLocal) {
        Write-Info "Deleting local tag..."
        git tag -d "$Version" 2>&1 | Out-Null
        Write-Success "Local tag deleted"
    }
}

# Get current branch
$CurrentBranch = git rev-parse --abbrev-ref HEAD 2>&1
Write-Info "Current branch: $CurrentBranch"

# Check if we're on main/master branch
if ($CurrentBranch -ne "main" -and $CurrentBranch -ne "master") {
    Write-Warning "You're not on main/master branch"
    $Response = Read-Host "Do you want to continue anyway? (y/N)"
    if ($Response -notmatch '^[Yy]$') {
        Write-Info "Release cancelled"
        exit 0
    }
}

# Check if remote is configured (already checked above, but verify)
if (-not $RepoName) {
    Write-Error "Could not determine repository name from remote URL"
    exit 1
}

Write-Info "Remote repository: $RepoName"

# Confirm release
Write-Host ""
Write-Warning "You are about to create and push tag: $Version"
Write-Warning "This will trigger the GitHub Actions release workflow"
Write-Host ""
$Response = Read-Host "Are you sure you want to continue? (y/N)"
if ($Response -notmatch '^[Yy]$') {
    Write-Info "Release cancelled"
    exit 0
}

# Create the tag
Write-Info "Creating tag $Version..."
git tag -a "$Version" -m "Release $Version" 2>&1 | Out-Null
Write-Success "Tag created locally"

# Push the tag
Write-Info "Pushing tag to remote..."
try {
    git push origin "$Version" 2>&1 | Out-Null
    Write-Success "Tag pushed successfully"
} catch {
    Write-Error "Failed to push tag"
    Write-Warning "Tag was created locally but not pushed"
    Write-Host "You can push it manually with: git push origin $Version"
    exit 1
}

# Print success message
Write-Host ""
Write-Success "=========================================="
Write-Success "Release $Version triggered successfully!"
Write-Success "=========================================="
Write-Host ""
Write-Info "The GitHub Actions workflow has been triggered"
Write-Info "You can monitor the progress at:"
Write-Host "  https://github.com/$RepoName/actions"
Write-Host ""
Write-Info "Once the workflow completes, the release will be available at:"
Write-Host "  https://github.com/$RepoName/releases/tag/$Version"
Write-Host ""

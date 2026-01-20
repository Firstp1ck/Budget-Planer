#!/bin/bash

# Budget Planer - Release Script
# This script creates a git tag and pushes it to trigger the GitHub Actions release workflow
# Usage: ./release.sh <version>
# Example: ./release.sh v1.0.0

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

if ! command_exists git; then
    print_error "git is not installed. Please install it first."
    exit 1
fi
print_success "git is installed"

# Check for GitHub CLI (optional but recommended for release deletion)
GH_AVAILABLE=false
if command_exists gh; then
    GH_AVAILABLE=true
    print_success "GitHub CLI (gh) is installed"
else
    print_warning "GitHub CLI (gh) is not installed (optional, but recommended for release management)"
    print_warning "Install it from: https://cli.github.com/"
fi

# Get version from argument
if [ $# -eq 0 ]; then
    print_error "Version argument is required"
    echo "Usage: $0 <version>"
    echo "Example: $0 v1.0.0"
    exit 1
fi

VERSION="$1"

# Validate version format (should be vX.X.X)
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format: $VERSION"
    echo "Version should be in format: vX.X.X"
    echo "Examples: v1.0.0, v1.2.3, v2.0.0"
    exit 1
fi

print_success "Version format is valid: $VERSION"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_warning "You have uncommitted changes"
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Release cancelled"
        exit 0
    fi
fi

# Check if remote is configured
if ! git remote get-url origin > /dev/null 2>&1; then
    print_error "No remote 'origin' configured"
    exit 1
fi

# Extract repository name from remote URL for GitHub API
REMOTE_URL=$(git remote get-url origin)
REPO_NAME=""
if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+/[^/]+) ]]; then
    REPO_NAME="${BASH_REMATCH[1]}"
    REPO_NAME="${REPO_NAME%.git}"
fi

# Check if release already exists on GitHub
RELEASE_EXISTS=false
if [ "$GH_AVAILABLE" = true ] && [ -n "$REPO_NAME" ]; then
    print_info "Checking if release $VERSION already exists on GitHub..."
    if gh release view "$VERSION" --repo "$REPO_NAME" >/dev/null 2>&1; then
        RELEASE_EXISTS=true
        print_warning "Release $VERSION already exists on GitHub"
    else
        print_info "Release $VERSION does not exist on GitHub"
    fi
fi

# Check if tag already exists (local or remote)
TAG_EXISTS_LOCAL=false
TAG_EXISTS_REMOTE=false

if git rev-parse "$VERSION" >/dev/null 2>&1; then
    TAG_EXISTS_LOCAL=true
fi

if git ls-remote --tags origin 2>&1 | grep -q "refs/tags/$VERSION"; then
    TAG_EXISTS_REMOTE=true
fi

# If release or tag exists, delete them
if [ "$RELEASE_EXISTS" = true ] || [ "$TAG_EXISTS_LOCAL" = true ] || [ "$TAG_EXISTS_REMOTE" = true ]; then
    if [ "$RELEASE_EXISTS" = true ]; then
        print_warning "Release $VERSION will be deleted and recreated"
    fi
    if [ "$TAG_EXISTS_LOCAL" = true ] || [ "$TAG_EXISTS_REMOTE" = true ]; then
        print_warning "Tag $VERSION will be deleted and recreated"
    fi
    
    # Delete GitHub release if it exists
    if [ "$RELEASE_EXISTS" = true ] && [ "$GH_AVAILABLE" = true ]; then
        print_info "Deleting existing GitHub release..."
        if gh release delete "$VERSION" --repo "$REPO_NAME" --yes >/dev/null 2>&1; then
            print_success "GitHub release deleted"
        else
            print_error "Failed to delete GitHub release"
            print_warning "You may need to delete it manually from GitHub"
        fi
    elif [ "$RELEASE_EXISTS" = true ]; then
        print_warning "Cannot delete GitHub release automatically (gh CLI not available)"
        print_warning "Please delete it manually from: https://github.com/$REPO_NAME/releases/tag/$VERSION"
    fi
    
    # Delete remote tag if it exists
    if [ "$TAG_EXISTS_REMOTE" = true ]; then
        print_info "Deleting remote tag..."
        if git push origin ":refs/tags/$VERSION" >/dev/null 2>&1; then
            print_success "Remote tag deleted"
        else
            print_warning "Failed to delete remote tag (may not exist or already deleted)"
        fi
    fi
    
    # Delete local tag if it exists
    if [ "$TAG_EXISTS_LOCAL" = true ]; then
        print_info "Deleting local tag..."
        git tag -d "$VERSION" >/dev/null 2>&1 || true
        print_success "Local tag deleted"
    fi
fi

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
print_info "Current branch: $CURRENT_BRANCH"

# Check if we're on main/master branch
if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "master" ]]; then
    print_warning "You're not on main/master branch"
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Release cancelled"
        exit 0
    fi
fi

# Verify repository name was extracted successfully
if [ -z "$REPO_NAME" ]; then
    print_error "Could not determine repository name from remote URL"
    print_error "Please ensure the remote URL is a valid GitHub repository URL"
    exit 1
fi

print_info "Remote repository: $REPO_NAME"

# Confirm release
echo ""
print_warning "You are about to create and push tag: $VERSION"
print_warning "This will trigger the GitHub Actions release workflow"
echo ""
read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Release cancelled"
    exit 0
fi

# Create the tag
print_info "Creating tag $VERSION..."
git tag -a "$VERSION" -m "Release $VERSION"
print_success "Tag created locally"

# Push the tag
print_info "Pushing tag to remote..."
if git push origin "$VERSION"; then
    print_success "Tag pushed successfully"
else
    print_error "Failed to push tag"
    print_warning "Tag was created locally but not pushed"
    echo "You can push it manually with: git push origin $VERSION"
    exit 1
fi

# Print success message
echo ""
print_success "=========================================="
print_success "Release $VERSION triggered successfully!"
print_success "=========================================="
echo ""
print_info "The GitHub Actions workflow has been triggered"
print_info "You can monitor the progress at:"
echo "  https://github.com/$REPO_NAME/actions"
echo ""
print_info "Once the workflow completes, the release will be available at:"
echo "  https://github.com/$REPO_NAME/releases/tag/$VERSION"
echo ""

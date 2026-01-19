# Tauri Native App Setup - Required Tools & Dependencies

This document outlines all the tools, system dependencies, and setup requirements needed to create a native app from your Budget Planner website using **Tauri v2** (latest stable version as of 2024/2025).

> **Note**: This guide is based on the official Tauri v2 documentation.  
> Sources: [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/) and [Tauri v2 Create Project](https://v2.tauri.app/start/create-project/)

---

## 1. System Dependencies (Platform-Specific)

### Windows (Your Current Platform)

**Required:**
- **Microsoft Visual C++ Build Tools**
  - Install "Desktop development with C++" workload
  - Download from: [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
  - Or install full Visual Studio with C++ workload

- **WebView2 Runtime**
  - Usually pre-installed on Windows 10 version 1803+ and Windows 11
  - If missing, download from: [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
  - Tauri uses WebView2 as the web engine on Windows

- **Windows SDK** (usually included with Visual Studio Build Tools)
  - Required for building Windows applications

**Optional (for MSI Installer):**
- **VBScript Feature** (Windows Feature)
  - Only needed if you plan to build MSI installers
  - Enable via: `Control Panel > Programs > Turn Windows features on or off > VBScript`
  - Or via PowerShell: `Enable-WindowsOptionalFeature -Online -FeatureName VBScript`

### Linux (for cross-compilation or Linux builds)

If you plan to build for Linux:
- `libwebkit2gtk-4.1-dev` - WebKitGTK for rendering
- `build-essential` or `base-devel` - Compilers and build tools
- `curl`, `wget`, `file` - Basic utilities
- `libssl-dev` - OpenSSL development libraries
- `libayatana-appindicator3-dev` - System tray support
- `librsvg2-dev` - SVG rendering for icons
- `libxdo-dev` - Window automation support

**Installation (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev
```

### macOS (for cross-compilation or macOS builds)

If you plan to build for macOS:
- **Xcode Command Line Tools** (minimum for desktop apps)
  ```bash
  xcode-select --install
  ```
- **Full Xcode** (required for iOS builds or macOS app signing)
  - Download from App Store
  - Required for code signing and notarization

**Optional:**
- **Homebrew** - Package manager for additional tools
- **CocoaPods** - Required only for iOS builds
  ```bash
  sudo gem install cocoapods
  ```

---

## 2. Rust Toolchain

Tauri's core is built in Rust, so Rust is **essential**.

### Installation

**Windows:**
1. Download and run `rustup-init.exe` from: [rustup.rs](https://rustup.rs/)
2. Or use PowerShell:
   ```powershell
   Invoke-WebRequest https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
   .\rustup-init.exe
   ```
3. Follow the installer prompts
4. Restart your terminal after installation

**Linux/macOS:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Verify Installation

```bash
rustc --version
cargo --version
```

### Recommended Rust Targets

For Windows development:
- `x86_64-pc-windows-msvc` (default, usually already installed)

For cross-platform builds:
```bash
# Linux
rustup target add x86_64-unknown-linux-gnu

# macOS
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin
```

---

## 3. Node.js & Package Manager

Since your project uses **Bun** (as specified in your user rules), you have two options:

### Option A: Use Bun (Recommended for your project)

**Installation:**
- Windows: Download from [bun.sh](https://bun.sh) or use PowerShell:
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```

**Verify:**
```bash
bun --version
```

### Option B: Use Node.js (Alternative)

If you prefer Node.js for Tauri CLI:
- Download LTS version from [nodejs.org](https://nodejs.org/)
- Or use a version manager like `nvm-windows` for Windows

**Package Manager Options:**
- `npm` (comes with Node.js)
- `pnpm` (via `corepack enable pnpm`)
- `yarn` (via `corepack enable yarn`)

---

## 4. Tauri CLI

Install the Tauri CLI to scaffold and manage your Tauri project.

### Installation Options

**Option 1: Using Bun (Recommended for your project)**
```bash
bun add -D @tauri-apps/cli
```

**Option 2: Using npm**
```bash
npm install -D @tauri-apps/cli
```

**Option 3: Using Cargo (Rust package manager)**
```bash
cargo install tauri-cli
```

### Verify Installation

```bash
# If installed via npm/bun
bunx tauri --version
# or
npx tauri --version

# If installed via cargo
tauri --version
```

---

## 5. Frontend Build Tools (Already Installed)

Your project already has:
- ✅ **Vite** - Build tool and dev server
- ✅ **React** - Frontend framework
- ✅ **TypeScript** - Type safety
- ✅ **Tailwind CSS** - Styling

These are compatible with Tauri. No additional frontend tools needed.

---

## 6. Mobile Targets (Optional)

Only needed if you plan to build mobile apps (Android/iOS).

### Android

**Required:**
- **Android Studio** - Download from [developer.android.com](https://developer.android.com/studio)
- **Android SDK** - Install via Android Studio SDK Manager:
  - Android SDK Platform
  - Platform-Tools
  - Build-Tools
  - NDK (Native Development Kit)
  - Command-line Tools

**Environment Variables:**
```bash
# Set these in your system environment variables
ANDROID_HOME=C:\Users\<YourUser>\AppData\Local\Android\Sdk
NDK_HOME=C:\Users\<YourUser>\AppData\Local\Android\Sdk\ndk\<version>
JAVA_HOME=C:\Program Files\Java\jdk-<version>
```

**Rust Targets:**
```bash
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
rustup target add x86_64-linux-android
rustup target add i686-linux-android
```

### iOS

**Required:**
- **macOS** - iOS builds can only be done on macOS
- **Full Xcode** - Not just command line tools
- **CocoaPods** - Install via: `sudo gem install cocoapods`

**Rust Targets:**
```bash
rustup target add aarch64-apple-ios
rustup target add x86_64-apple-ios
rustup target add aarch64-apple-ios-sim
```

---

## 7. Code Signing & Distribution Tools (Optional)

Only needed for distributing your app outside of development.

### Windows

- **Code Signing Certificate** - For signing executables
  - Purchase from a Certificate Authority (CA)
  - Or use self-signed for testing (not recommended for distribution)

- **WiX Toolset** - For creating MSI installers
  - Download from: [wixtoolset.org](https://wixtoolset.org/)
  - Or use NSIS as alternative

### macOS

- **Apple Developer Account** - Required for code signing and notarization
  - Free account: Can sign apps but with limitations
  - Paid account ($99/year): Full distribution capabilities

- **notarytool** - For notarization (replaces deprecated `altool`)
  - Included with Xcode Command Line Tools

### Linux

- **Various packaging tools** depending on distribution format:
  - `.deb` packages: `dpkg`, `dpkg-deb`
  - `.rpm` packages: `rpmbuild`
  - `.AppImage`: `appimagetool`
  - Flatpak: `flatpak-builder`

---

## 8. Project Structure Considerations

### Current Project Structure

Your project has:
```
Budget-Planer/
├── backend/          # Django backend
├── frontend/         # React + Vite frontend
└── start.sh          # Startup script
```

### Tauri Integration Options

**Option 1: Add Tauri to existing frontend (Recommended)**
- Add `src-tauri/` directory to your `frontend/` folder
- Tauri will bundle your Vite-built frontend
- Backend can run as a separate process or be embedded

**Option 2: Standalone Tauri app**
- Create new Tauri project
- Copy frontend code
- Integrate backend as needed

---

## 9. Environment Variables

Tauri supports various environment variables for configuration:

### Development

- `TAURI_CLI_PORT` - Port for Tauri CLI communication
- `TAURI_CLI_NO_DEV_SERVER_WAIT` - Skip waiting for dev server
- `TAURI_DEV_SERVER_URL` - Override dev server URL (default: `http://localhost:5173`)

### Build

- `CI` - Set to `true` for non-interactive builds
- `TAURI_SIGNING_PRIVATE_KEY` - Private key for code signing
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - Password for signing key

### Mobile (Android)

- `ANDROID_HOME` - Android SDK location
- `NDK_HOME` - Android NDK location
- `JAVA_HOME` - Java Development Kit location

---

## 10. Installation Checklist

Use this checklist to ensure you have everything installed:

### Windows Desktop Development

- [ ] Microsoft Visual C++ Build Tools installed
- [ ] WebView2 Runtime installed (usually pre-installed)
- [ ] Rust toolchain installed (`rustc --version` works)
- [ ] Cargo installed (`cargo --version` works)
- [ ] Bun installed (`bun --version` works) or Node.js installed
- [ ] Tauri CLI installed (`bunx tauri --version` works)
- [ ] Frontend dependencies installed (`bun install` in frontend folder)

### Optional: Cross-Platform Development

- [ ] Linux dependencies installed (if building for Linux)
- [ ] macOS/Xcode installed (if building for macOS)
- [ ] Additional Rust targets added for target platforms

### Optional: Mobile Development

- [ ] Android Studio installed (if building for Android)
- [ ] Android environment variables set (if building for Android)
- [ ] Xcode installed (if building for iOS)
- [ ] CocoaPods installed (if building for iOS)
- [ ] Mobile Rust targets added

### Optional: Distribution

- [ ] Code signing certificate obtained (for distribution)
- [ ] WiX Toolset installed (for Windows MSI installers)
- [ ] Apple Developer Account (for macOS distribution)

---

## 11. Next Steps

After installing all required tools:

1. **Initialize Tauri in your project:**
   ```bash
   cd frontend
   bunx create-tauri-app
   ```
   Or manually add Tauri to your existing Vite project.

2. **Configure `tauri.conf.json`:**
   - Set app identifier
   - Configure build settings
   - Set up dev server URL (your Vite dev server: `http://localhost:5173`)

3. **Handle Backend Integration:**
   - Decide if Django backend runs separately or needs embedding
   - Configure API endpoints for Tauri app
   - Consider using Tauri's IPC for backend communication

4. **Test Development Build:**
   ```bash
   bunx tauri dev
   ```

5. **Build Production App:**
   ```bash
   bunx tauri build
   ```

---

## 12. Additional Resources

- **Official Tauri Documentation**: [v2.tauri.app](https://v2.tauri.app/)
- **Tauri API Reference**: [v2.tauri.app/api](https://v2.tauri.app/api/)
- **Tauri Examples**: [github.com/tauri-apps/tauri/tree/dev/examples](https://github.com/tauri-apps/tauri/tree/dev/examples)
- **Tauri Discord Community**: [discord.gg/tauri](https://discord.gg/tauri)

---

## 13. Troubleshooting

### Common Issues

**Windows:**
- **"link.exe not found"** → Install Visual C++ Build Tools
- **"WebView2 not found"** → Install WebView2 Runtime
- **"MSVC toolchain not found"** → Run `rustup default stable-x86_64-pc-windows-msvc`

**Rust:**
- **"cargo: command not found"** → Restart terminal after Rust installation
- **Build errors** → Run `rustup update` to get latest toolchain

**Tauri CLI:**
- **"tauri: command not found"** → Use `bunx tauri` or `npx tauri` instead of global install
- **Permission errors** → Run terminal as administrator (Windows) or use `sudo` (Linux/macOS)

---

**Last Updated**: Based on Tauri v2 documentation as of January 2025

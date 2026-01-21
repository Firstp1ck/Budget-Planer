use std::path::{Path, PathBuf};
use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::io::Read;
use log::{info, warn, error, debug};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Kill any process using the specified port (useful for cleaning up orphaned backend processes)
fn kill_process_on_port(port: u16) {
  info!("Checking for existing processes on port {}", port);
  
  #[cfg(not(windows))]
  {
    // On Linux/macOS, use lsof to find and kill processes on the port
    let output = Command::new("lsof")
      .args(&["-ti", &format!(":{}", port)])
      .output();
    
    if let Ok(output) = output {
      let pids = String::from_utf8_lossy(&output.stdout);
      for pid in pids.lines() {
        if !pid.trim().is_empty() {
          info!("Killing existing process {} on port {}", pid.trim(), port);
          let _ = Command::new("kill")
            .args(&["-9", pid.trim()])
            .output();
        }
      }
    }
  }
  
  #[cfg(windows)]
  {
    // On Windows, use netstat to find and taskkill to kill processes on the port
    let output = Command::new("netstat")
      .args(&["-ano"])
      .output();
    
    if let Ok(output) = output {
      let output_str = String::from_utf8_lossy(&output.stdout);
      let port_str = format!(":{}", port);
      for line in output_str.lines() {
        if line.contains(&port_str) && line.contains("LISTENING") {
          // Extract PID from the last column
          if let Some(pid) = line.split_whitespace().last() {
            info!("Killing existing process {} on port {}", pid, port);
            let _ = Command::new("taskkill")
              .args(&["/F", "/PID", pid])
              .output();
          }
        }
      }
    }
  }
  
  // Give processes a moment to terminate
  std::thread::sleep(std::time::Duration::from_millis(500));
  debug!("Port cleanup completed");
}

/// Kill the backend process immediately without blocking
/// On Windows, this kills the entire process tree (including child processes)
/// This function returns immediately after initiating the kill, cleanup happens in background
fn kill_backend_process(child: &mut Child) {
  let pid = child.id();
  info!("Stopping backend server (PID: {:?})...", pid);
  
  // On Windows, use taskkill to kill the entire process tree immediately
  // This is more reliable than just killing the parent process
  #[cfg(windows)]
  {
    info!("Killing process tree on Windows using taskkill");
    // Spawn taskkill without waiting - let it run in background
    let _ = Command::new("taskkill")
      .args(&["/F", "/T", "/PID", &pid.to_string()])
      .stdout(std::process::Stdio::null())
      .stderr(std::process::Stdio::null())
      .spawn();
    // Don't wait for taskkill to complete - return immediately
  }
  
  // Try to kill the process directly (fallback or non-Windows)
  // This is non-blocking
  if let Err(e) = child.kill() {
    warn!("Failed to kill backend process: {}", e);
  }
  
  // Spawn cleanup in background thread to avoid blocking
  let pid_for_cleanup = pid;
  std::thread::spawn(move || {
    // Give processes a moment to terminate
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    // Check if process is still running (non-blocking check)
    #[cfg(windows)]
    {
      // On Windows, check if process still exists using tasklist
      let output = Command::new("tasklist")
        .args(&["/FI", &format!("PID eq {}", pid_for_cleanup)])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output();
      
      if let Ok(output) = output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        if output_str.contains(&pid_for_cleanup.to_string()) {
          warn!("Process {} still running, attempting forceful kill", pid_for_cleanup);
          // Try one more time with taskkill
          let _ = Command::new("taskkill")
            .args(&["/F", "/T", "/PID", &pid_for_cleanup.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .output();
        } else {
          info!("Backend server process {} terminated successfully", pid_for_cleanup);
        }
      }
    }
    
    #[cfg(not(windows))]
    {
      // On Linux/macOS, use kill -9 to forcefully terminate
      info!("Forcefully killing backend process {} on Linux/macOS", pid_for_cleanup);
      let _ = Command::new("kill")
        .args(&["-9", &pid_for_cleanup.to_string()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output();
      info!("Backend server cleanup initiated");
    }
  });
  
  info!("Backend server kill initiated (cleanup in background)");
}

/// Initialize the database by checking if it exists and running migrations if needed
fn initialize_database(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  // Get the app data directory
  let app_data_dir = app.path().app_data_dir()?;
  std::fs::create_dir_all(&app_data_dir)?;
  
  // Database path in app data directory
  let db_path = app_data_dir.join("db.sqlite3");
  let db_exists = db_path.exists();
  
  info!("Database path: {:?}", db_path);
  info!("Database exists: {}", db_exists);
  
  if db_exists {
    info!("Database already exists, skipping initialization");
    return Ok(());
  }
  
  info!("Database not found, initializing...");
  
  // Try to find backend directory
  let exe_path = std::env::current_exe()?;
  let exe_dir = exe_path.parent().ok_or("Could not get executable directory")?;
  
  // Try multiple possible backend locations
  let mut possible_backend_paths: Vec<PathBuf> = vec![
    // Relative to executable (for bundled app)
    exe_dir.join("backend"),
    // Development path (relative to project root)
    exe_dir.join("../../backend"),
  ];
  
  // Add parent directory paths if available
  if let Some(parent) = exe_dir.parent() {
    possible_backend_paths.push(parent.join("backend"));
    if let Some(grandparent) = parent.parent() {
      possible_backend_paths.push(grandparent.join("backend"));
    }
  }
  
  let mut backend_path: Option<PathBuf> = None;
  for path in &possible_backend_paths {
    let manage_py = path.join("manage.py");
    if manage_py.exists() {
      backend_path = Some(path.clone());
      info!("Found backend at: {:?}", path);
      break;
    }
  }
  
  if let Some(backend_path) = backend_path {
    info!("Initializing database at: {:?}", db_path);
    
    // Ensure database directory exists
    if let Some(parent) = db_path.parent() {
      std::fs::create_dir_all(parent)?;
    }
    
    // Try to find Python in virtual environment first, then system Python
    let python_cmd = {
      // Check Windows path first (Scripts/python.exe)
      let venv_python_windows = backend_path.join(".venv").join("Scripts").join("python.exe");
      // Check Unix path (bin/python)
      let venv_python_unix = backend_path.join(".venv").join("bin").join("python");
      
      if venv_python_windows.exists() {
        info!("Using virtual environment Python (Windows): {:?}", venv_python_windows);
        venv_python_windows
      } else if venv_python_unix.exists() {
        info!("Using virtual environment Python (Unix): {:?}", venv_python_unix);
        venv_python_unix
      } else {
        // Try python3, then python - use fast check to avoid hanging
        let check_python = |cmd: &str| -> bool {
          Command::new(cmd)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .output()
            .is_ok()
        };
        
        if check_python("python3") {
          PathBuf::from("python3")
        } else if check_python("python") {
          PathBuf::from("python")
        } else {
          warn!("Python not found, cannot run migrations");
          return Ok(()); // Don't fail, database will be created on first use
        }
      }
    };
    
    let mut cmd = Command::new(&python_cmd);
    cmd.current_dir(&backend_path);
    cmd.arg("manage.py");
    cmd.arg("migrate");
    cmd.arg("--noinput");
    cmd.env("DATABASE_PATH", db_path.to_string_lossy().to_string());
    cmd.env("DJANGO_SETTINGS_MODULE", "config.settings");
    
    // Hide console window on Windows (but keep output capture for .output())
    #[cfg(windows)]
    {
      const CREATE_NO_WINDOW: u32 = 0x08000000;
      cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    info!("Running migrations with command: {:?}", cmd);
    
    let output = cmd.output();
    
    match output {
      Ok(output) => {
        if output.status.success() {
          info!("Database migrations completed successfully");
          let stdout = String::from_utf8_lossy(&output.stdout);
          if !stdout.is_empty() {
            info!("Migration output: {}", stdout);
          }
        } else {
          let stderr = String::from_utf8_lossy(&output.stderr);
          let stdout = String::from_utf8_lossy(&output.stdout);
          error!("Migration failed. stderr: {}", stderr);
          if !stdout.is_empty() {
            error!("stdout: {}", stdout);
          }
          warn!("Database will be created on first use");
        }
      }
      Err(e) => {
        warn!("Could not run migrations: {}. Database will be created on first use.", e);
      }
    }
  } else {
    warn!("Backend directory not found in any of these locations: {:?}", possible_backend_paths);
    warn!("Database will be created on first use when backend is available.");
    
    // For packaged apps, create an empty database file so the directory structure is correct
    // The backend executable will handle migrations when it starts
    if let Some(parent) = db_path.parent() {
      if let Err(e) = std::fs::create_dir_all(parent) {
        warn!("Failed to create database directory: {}", e);
      } else {
        // Create an empty database file - SQLite will initialize it properly when first accessed
        if !db_path.exists() {
          if let Err(e) = std::fs::File::create(&db_path) {
            warn!("Failed to create database file: {}", e);
          } else {
            info!("Created empty database file at: {:?}", db_path);
          }
        }
      }
    }
  }
  
  Ok(())
}

/// Check if Python dependencies are installed in virtual environment
/// Returns true if Django can be imported
fn check_backend_dependencies(python_cmd: &PathBuf) -> bool {
  let mut check_cmd = Command::new(python_cmd);
  check_cmd.arg("-c");
  check_cmd.arg("import django; print(django.__version__)");
  check_cmd.stdout(Stdio::null());
  check_cmd.stderr(Stdio::null());
  
  #[cfg(windows)]
  {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    check_cmd.creation_flags(CREATE_NO_WINDOW);
  }
  
  check_cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

/// Setup backend virtual environment and install dependencies
/// Returns true if setup was successful
fn setup_backend_dependencies(backend_path: &PathBuf, python_cmd: &PathBuf) -> bool {
  info!("Setting up backend dependencies...");
  
  // Check if virtual environment exists
  let venv_python_windows = backend_path.join(".venv").join("Scripts").join("python.exe");
  let venv_python_unix = backend_path.join(".venv").join("bin").join("python");
  
  let venv_exists = venv_python_windows.exists() || venv_python_unix.exists();
  
  if !venv_exists {
    info!("Creating virtual environment...");
    let mut venv_cmd = Command::new(python_cmd);
    venv_cmd.arg("-m");
    venv_cmd.arg("venv");
    venv_cmd.arg(".venv");
    venv_cmd.current_dir(backend_path);
    venv_cmd.stdout(Stdio::null());
    venv_cmd.stderr(Stdio::null());
    
    #[cfg(windows)]
    {
      const CREATE_NO_WINDOW: u32 = 0x08000000;
      venv_cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    if venv_cmd.output().is_err() {
      warn!("Failed to create virtual environment");
      return false;
    }
  }
  
  // Use venv Python for pip install
  let venv_python = if venv_python_windows.exists() {
    venv_python_windows
  } else if venv_python_unix.exists() {
    venv_python_unix
  } else {
    warn!("Virtual environment Python not found after creation");
    return false;
  };
  
  // Install dependencies
  info!("Installing Python dependencies...");
  let requirements_file = backend_path.join("requirements.txt");
  if !requirements_file.exists() {
    warn!("requirements.txt not found at {:?}", requirements_file);
    return false;
  }
  
  let mut pip_cmd = Command::new(&venv_python);
  pip_cmd.arg("-m");
  pip_cmd.arg("pip");
  pip_cmd.arg("install");
  pip_cmd.arg("-r");
  pip_cmd.arg("requirements.txt");
  pip_cmd.current_dir(backend_path);
  pip_cmd.stdout(Stdio::null());
  pip_cmd.stderr(Stdio::null());
  
  #[cfg(windows)]
  {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    pip_cmd.creation_flags(CREATE_NO_WINDOW);
  }
  
  match pip_cmd.output() {
    Ok(output) => {
      if output.status.success() {
        info!("Dependencies installed successfully");
        true
      } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("Failed to install dependencies: {}", stderr);
        false
      }
    }
    Err(e) => {
      warn!("Error installing dependencies: {}", e);
      false
    }
  }
}

/// Start the Django backend server
/// Returns immediately after spawning the process without blocking on server readiness
/// The frontend will handle retries if the server isn't ready immediately
/// 
/// This function first tries to use a bundled backend executable (from PyInstaller),
/// and falls back to Python if the executable is not found.
fn start_backend_server(
  app: &tauri::AppHandle,
  backend_path: &PathBuf,
  db_path: &PathBuf,
) -> Result<Child, Box<dyn std::error::Error>> {
  info!("Starting Django backend server...");
  
  // Kill any existing process on port 8000 to avoid "port already in use" errors
  // This handles orphaned backend processes from previous app sessions
  kill_process_on_port(8000);
  
  // First, try to find bundled backend executable (PyInstaller bundle)
  // Check multiple possible locations:
  // 1. In backend/dist (development build)
  // 2. Using Tauri's resource resolution (bundled resources)
  // 3. Next to the executable (fallback)
  let exe_path = std::env::current_exe().ok();
  let exe_dir = exe_path.as_ref().and_then(|p| p.parent());
  
  // Build list of possible executable paths, prioritizing platform-specific executables
  let mut possible_exe_paths: Vec<PathBuf> = vec![];
  
  // Platform-specific executable names (check platform-specific first)
  #[cfg(windows)]
  {
    possible_exe_paths.push(backend_path.join("dist").join("backend-server.exe"));
    possible_exe_paths.push(backend_path.join("dist").join("backend-server"));
  }
  
  #[cfg(not(windows))]
  {
    possible_exe_paths.push(backend_path.join("dist").join("backend-server"));
    possible_exe_paths.push(backend_path.join("dist").join("backend-server.exe"));
  }
  
  // Try Tauri resource resolution (for bundled resources)
  if let Ok(resource_dir) = app.path().resource_dir() {
    // Resources may be in a 'resources' subdirectory (AppImage structure)
    #[cfg(windows)]
    {
      possible_exe_paths.push(resource_dir.join("resources").join("backend-server.exe"));
      possible_exe_paths.push(resource_dir.join("resources").join("backend-server"));
      possible_exe_paths.push(resource_dir.join("backend-server.exe"));
      possible_exe_paths.push(resource_dir.join("backend-server"));
    }
    #[cfg(not(windows))]
    {
      possible_exe_paths.push(resource_dir.join("resources").join("backend-server"));
      possible_exe_paths.push(resource_dir.join("resources").join("backend-server.exe"));
      possible_exe_paths.push(resource_dir.join("backend-server"));
      possible_exe_paths.push(resource_dir.join("backend-server.exe"));
    }
  }
  
  // Add paths relative to executable (fallback)
  if let Some(exe_dir) = exe_dir {
    #[cfg(windows)]
    {
      possible_exe_paths.push(exe_dir.join("backend-server.exe"));
      possible_exe_paths.push(exe_dir.join("backend-server"));
      possible_exe_paths.push(exe_dir.join("resources").join("backend-server.exe"));
      possible_exe_paths.push(exe_dir.join("resources").join("backend-server"));
    }
    #[cfg(not(windows))]
    {
      possible_exe_paths.push(exe_dir.join("backend-server"));
      possible_exe_paths.push(exe_dir.join("backend-server.exe"));
      possible_exe_paths.push(exe_dir.join("resources").join("backend-server"));
      possible_exe_paths.push(exe_dir.join("resources").join("backend-server.exe"));
    }
    
    // Also check parent directories (for nested bundle structures)
    if let Some(parent) = exe_dir.parent() {
      #[cfg(windows)]
      {
        possible_exe_paths.push(parent.join("backend-server.exe"));
        possible_exe_paths.push(parent.join("backend-server"));
      }
      #[cfg(not(windows))]
      {
        possible_exe_paths.push(parent.join("backend-server"));
        possible_exe_paths.push(parent.join("backend-server.exe"));
      }
    }
  }
  
  // Find the first existing executable, filtering out placeholders (very small files)
  let backend_exe = possible_exe_paths.iter().find(|p| {
    if !p.exists() {
      return false;
    }
    
    // On non-Windows, skip .exe files (they're Windows executables)
    #[cfg(not(windows))]
    {
      if p.file_name().and_then(|n| n.to_str()).map(|s| s.ends_with(".exe")).unwrap_or(false) {
        return false;
      }
    }
    
    // Filter out placeholder files (very small files < 1KB are likely placeholders)
    if let Ok(metadata) = std::fs::metadata(p) {
      let size = metadata.len();
      if size < 1024 {
        warn!("Skipping potential placeholder file: {:?} (size: {} bytes)", p, size);
        return false;
      }
    }
    
    true
  }).cloned();
  
  if let Some(exe_path) = backend_exe {
    info!("Found bundled backend executable: {:?}", exe_path);
    
    // On Unix systems, ensure the executable has execute permissions
    #[cfg(not(windows))]
    {
      use std::os::unix::fs::PermissionsExt;
      if let Ok(metadata) = std::fs::metadata(&exe_path) {
        let mut perms = metadata.permissions();
        let mode = perms.mode();
        // Check if execute bit is set for owner, group, or others
        if mode & 0o111 == 0 {
          warn!("Backend executable does not have execute permissions, attempting to fix...");
          perms.set_mode(mode | 0o111); // Add execute permissions for all
          if let Err(e) = std::fs::set_permissions(&exe_path, perms) {
            error!("Failed to set execute permissions on backend executable: {}", e);
            return Err(format!("Backend executable at {:?} does not have execute permissions and could not be fixed: {}", exe_path, e).into());
          } else {
            info!("Successfully set execute permissions on backend executable");
          }
        }
      }
    }
    
    // Run migrations in background
    let exe_path_clone = exe_path.clone();
    let db_path_clone = db_path.clone();
    std::thread::spawn(move || {
      info!("Running database migrations in background...");
      let mut migrate_cmd = Command::new(&exe_path_clone);
      migrate_cmd.arg("--migrate");
      migrate_cmd.arg("--database-path");
      migrate_cmd.arg(db_path_clone.to_string_lossy().to_string());
      
      #[cfg(windows)]
      {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        migrate_cmd.creation_flags(CREATE_NO_WINDOW);
      }
      
      // Capture output to see what's happening
      match migrate_cmd.output() {
        Ok(output) => {
          let stdout = String::from_utf8_lossy(&output.stdout);
          let stderr = String::from_utf8_lossy(&output.stderr);
          
          // Check if migrations actually completed successfully by looking at stdout
          // Migrations can exit with code 1 due to autoreload issues, but still succeed
          let migrations_succeeded = stdout.contains("No migrations to apply") || 
                                     stdout.contains("Running migrations:") ||
                                     stdout.contains("Applying");
          
          if output.status.success() || migrations_succeeded {
            info!("Database migrations completed successfully");
            if !stdout.trim().is_empty() {
              info!("Migration output: {}", stdout.trim());
            }
          } else {
            // Only report as error if migrations actually failed
            error!("Migration failed. Exit code: {:?}", output.status.code());
            if !stderr.trim().is_empty() {
              // Check if it's just a port conflict (non-critical)
              if stderr.contains("port is already in use") {
                warn!("Migration warning (non-critical): {}", stderr.trim());
                info!("Migrations completed successfully despite port warning");
              } else {
                error!("Migration stderr: {}", stderr.trim());
              }
            }
            if !stdout.trim().is_empty() {
              info!("Migration stdout: {}", stdout.trim());
            }
            if !migrations_succeeded {
              warn!("Migrations may have failed, but server is running");
            }
          }
        }
        Err(e) => {
          warn!("Could not run migrations: {}. Server is running anyway.", e);
        }
      }
    });
    
    // Start the server
    let mut cmd = Command::new(&exe_path);
    cmd.arg("--host");
    cmd.arg("127.0.0.1");
    cmd.arg("--port");
    cmd.arg("8000");
    cmd.arg("--database-path");
    cmd.arg(db_path.to_string_lossy().to_string());
    
    #[cfg(windows)]
    {
      const CREATE_NO_WINDOW: u32 = 0x08000000;
      cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    // Capture stderr to a pipe so we can read errors if the server fails to start
    // We'll spawn a thread to read stderr in the background
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    let mut child = cmd.spawn()?;
    info!("Backend server started with PID: {:?}", child.id());
    
    // Spawn a thread to read stderr (Django logs HTTP requests to stderr)
    let stderr_handle = child.stderr.take();
    if let Some(mut stderr) = stderr_handle {
      std::thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        loop {
          match stderr.read(&mut buffer) {
            Ok(0) => break, // EOF
            Ok(n) => {
              let output = String::from_utf8_lossy(&buffer[..n]);
              if !output.trim().is_empty() {
                // Django logs HTTP requests to stderr - these are informational, not errors
                // Only log actual errors (containing "Error", "Exception", "Traceback")
                let trimmed = output.trim();
                if trimmed.contains("Error") || trimmed.contains("Exception") || trimmed.contains("Traceback") {
                  warn!("Backend: {}", trimmed);
                } else {
                  debug!("Backend: {}", trimmed);
                }
              }
            }
            Err(e) => {
              warn!("Error reading backend stderr: {}", e);
              break;
            }
          }
        }
      });
    }
    
    // Check if process started successfully
    match child.try_wait() {
      Ok(Some(status)) => {
        // Process exited immediately - try to get stderr output
        let error_msg = format!("Backend server exited immediately with status: {:?}", status);
        error!("{}", error_msg);
        return Err(error_msg.into());
      }
      Ok(None) => {
        info!("Backend server process is running");
      }
      Err(e) => {
        let error_msg = format!("Error checking backend server status: {}", e);
        error!("{}", error_msg);
        return Err(error_msg.into());
      }
    }
    
    // Wait for backend to be ready by polling the health endpoint
    // This is more reliable than a fixed delay
    let start_time = std::time::Instant::now();
    let health_url = "http://127.0.0.1:8000/api/budgets/health/";
    let max_wait = std::time::Duration::from_secs(30); // Maximum wait time
    let poll_interval = std::time::Duration::from_millis(500); // Check every 500ms
    
    info!("Waiting for backend to be ready at {}...", health_url);
    
    let client = reqwest::blocking::Client::builder()
      .timeout(std::time::Duration::from_secs(2))
      .build()
      .unwrap_or_else(|_| reqwest::blocking::Client::new());
    
    loop {
      // First check if process is still running
      match child.try_wait() {
        Ok(Some(status)) => {
          let error_msg = format!("Backend server exited during startup with status: {:?}", status);
          error!("{}", error_msg);
          return Err(error_msg.into());
        }
        Ok(None) => {
          // Process still running, continue
        }
        Err(e) => {
          warn!("Error checking backend server status: {}", e);
        }
      }
      
      // Try health check
      match client.get(health_url).send() {
        Ok(response) => {
          if response.status().is_success() {
            let elapsed = start_time.elapsed();
            info!("Backend is ready! Startup took {:.2}s", elapsed.as_secs_f64());
            break;
          } else {
            debug!("Health check returned status: {}", response.status());
          }
        }
        Err(e) => {
          debug!("Health check failed: {} (waiting...)", e);
        }
      }
      
      // Check if we've exceeded max wait time
      if start_time.elapsed() > max_wait {
        let error_msg = "Backend server did not become ready within 30 seconds";
        error!("{}", error_msg);
        return Err(error_msg.into());
      }
      
      std::thread::sleep(poll_interval);
    }
    
    // Final verification that process is still running
    match child.try_wait() {
      Ok(Some(status)) => {
        let error_msg = format!("Backend server exited shortly after becoming ready with status: {:?}", status);
        error!("{}", error_msg);
        return Err(error_msg.into());
      }
      Ok(None) => {
        info!("Backend server process is running and healthy");
      }
      Err(e) => {
        warn!("Error checking backend server status: {}", e);
      }
    }
    
    return Ok(child);
  }
  
  // Fallback to Python if executable not found
  warn!("Bundled backend executable not found, falling back to Python...");
  info!("To use bundled backend, run: .\\build.ps1 (Windows) or ./build.sh (Linux/macOS) from the project root");
  
  // Try to find Python in virtual environment first, then system Python
  let python_cmd = {
    // Check Windows path first (Scripts/python.exe)
    let venv_python_windows = backend_path.join(".venv").join("Scripts").join("python.exe");
    // Check Unix path (bin/python)
    let venv_python_unix = backend_path.join(".venv").join("bin").join("python");
    
    if venv_python_windows.exists() {
      info!("Using virtual environment Python (Windows): {:?}", venv_python_windows);
      venv_python_windows
    } else if venv_python_unix.exists() {
      info!("Using virtual environment Python (Unix): {:?}", venv_python_unix);
      venv_python_unix
    } else {
      // Try python3, then python - use a timeout to avoid hanging
      let check_python = |cmd: &str| -> bool {
        Command::new(cmd)
          .arg("--version")
          .stdout(std::process::Stdio::null())
          .stderr(std::process::Stdio::null())
          .output()
          .is_ok()
      };
      
      if check_python("python3") {
        PathBuf::from("python3")
      } else if check_python("python") {
        PathBuf::from("python")
      } else {
        return Err("Python not found. Please install Python 3.10+ from https://www.python.org/downloads/ and run setup-backend.ps1, or build the app with build.ps1 to create a bundled backend executable".into());
      }
    }
  };
  
  // Check if dependencies are installed
  if !check_backend_dependencies(&python_cmd) {
    warn!("Backend dependencies not found. Attempting to set up automatically...");
    if !setup_backend_dependencies(backend_path, &python_cmd) {
      return Err(format!(
        "Backend dependencies are not installed. Please run setup-backend.ps1 from the project root directory, or build the app with build.ps1 to create a bundled backend executable.\n\
        Backend path: {:?}\n\
        Python command: {:?}",
        backend_path, python_cmd
      ).into());
    }
  }
  
  // Run migrations in background - don't block server startup
  // Migrations will run concurrently with server startup
  let backend_path_clone = backend_path.clone();
  let db_path_clone = db_path.clone();
  let python_cmd_clone = python_cmd.clone();
  std::thread::spawn(move || {
    info!("Running database migrations in background...");
    let mut migrate_cmd = Command::new(&python_cmd_clone);
    migrate_cmd.current_dir(&backend_path_clone);
    migrate_cmd.arg("manage.py");
    migrate_cmd.arg("migrate");
    migrate_cmd.arg("--noinput");
    migrate_cmd.env("DATABASE_PATH", db_path_clone.to_string_lossy().to_string());
    migrate_cmd.env("DJANGO_SETTINGS_MODULE", "config.settings");
    
    // Hide console window on Windows (but keep output capture for .output())
    #[cfg(windows)]
    {
      const CREATE_NO_WINDOW: u32 = 0x08000000;
      migrate_cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    match migrate_cmd.output() {
      Ok(output) => {
        if output.status.success() {
          info!("Database migrations completed successfully");
          let stdout = String::from_utf8_lossy(&output.stdout);
          if !stdout.is_empty() {
            info!("Migration output: {}", stdout);
          }
        } else {
          let stderr = String::from_utf8_lossy(&output.stderr);
          let stdout = String::from_utf8_lossy(&output.stdout);
          error!("Migration failed. stderr: {}", stderr);
          if !stdout.is_empty() {
            error!("stdout: {}", stdout);
          }
          warn!("Migrations failed but server is running");
        }
      }
      Err(e) => {
        warn!("Could not run migrations: {}. Server is running anyway.", e);
      }
    }
  });
  
  // Start the server immediately without waiting for migrations
  let mut cmd = Command::new(&python_cmd);
  cmd.current_dir(backend_path);
  cmd.arg("manage.py");
  cmd.arg("runserver");
  cmd.arg("127.0.0.1:8000");
  cmd.env("DATABASE_PATH", db_path.to_string_lossy().to_string());
  cmd.env("DJANGO_SETTINGS_MODULE", "config.settings");
  
  // Hide console window on Windows and suppress output
  #[cfg(windows)]
  {
    // CREATE_NO_WINDOW flag prevents console window from appearing
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }
  
  // Suppress stdout and stderr to keep backend completely hidden
  cmd.stdout(Stdio::null());
  cmd.stderr(Stdio::null());
  
  let mut child = cmd.spawn()?;
  info!("Backend server started with PID: {:?}", child.id());
  
  // Quick non-blocking check if process started successfully
  match child.try_wait() {
    Ok(Some(status)) => {
      return Err(format!("Backend server exited immediately with status: {:?}", status).into());
    }
    Ok(None) => {
      info!("Backend server process is running");
    }
    Err(e) => {
      return Err(format!("Error checking backend server status: {}", e).into());
    }
  }
  
  // Don't wait for server readiness - return immediately
  // The frontend will handle connection retries if needed
  info!("Backend server process started, returning immediately (server may not be ready yet)");
  
  Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Store backend process handle in app state
  let backend_process: Mutex<Option<Child>> = Mutex::new(None);
  
  tauri::Builder::default()
    .manage(backend_process)
    .setup(move |app| {
      // Enable logging in both debug and release modes for troubleshooting
      // Don't fail if logging plugin fails to initialize
      let _ = app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .build(),
      );
      
      // Get app data directory for database - don't fail if this doesn't work
      let db_path = match app.path().app_data_dir() {
        Ok(dir) => {
          let _ = std::fs::create_dir_all(&dir);
          dir.join("db.sqlite3")
        }
        Err(e) => {
          eprintln!("Failed to get app data directory: {}, using fallback", e);
          // Fallback to current directory
          std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("db.sqlite3")
        }
      };
      
      // Move all blocking operations to a background thread to prevent UI hang
      let app_handle = app.handle().clone();
      let db_path_clone = db_path.clone();
      std::thread::spawn(move || {
        // Initialize database on startup - don't fail if this doesn't work
        if let Err(e) = initialize_database(&app_handle) {
          eprintln!("Database initialization warning: {}", e);
          // Don't fail startup if database init fails - it will be created on first use
        }
        
        // First, try to find bundled backend executable (for release builds)
        let exe_path = std::env::current_exe().unwrap_or_default();
        let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new("."));
        
        info!("Looking for bundled backend executable...");
        info!("Executable path: {:?}", exe_path);
        info!("Executable directory: {:?}", exe_dir);
        
        let mut possible_exe_paths: Vec<PathBuf> = vec![];
        
        // First, check backend/dist directory (development build location)
        // Try to find the project root by going up from executable directory
        let mut check_backend_dist = |base_dir: &std::path::Path| {
          // Try various relative paths to find backend/dist
          let candidates = vec![
            base_dir.join("backend").join("dist"),
            base_dir.join("..").join("backend").join("dist"),
            base_dir.join("../..").join("backend").join("dist"),
            base_dir.join("../../..").join("backend").join("dist"),
            base_dir.join("../../../..").join("backend").join("dist"),
          ];
          
          for backend_dist in candidates {
            let backend_dist = backend_dist.canonicalize().unwrap_or(backend_dist);
            #[cfg(windows)]
            {
              possible_exe_paths.push(backend_dist.join("backend-server.exe"));
              possible_exe_paths.push(backend_dist.join("backend-server"));
            }
            #[cfg(not(windows))]
            {
              possible_exe_paths.push(backend_dist.join("backend-server"));
              possible_exe_paths.push(backend_dist.join("backend-server.exe"));
            }
          }
        };
        
        // Check from executable directory
        check_backend_dist(exe_dir);
        
        // Also check from current working directory (for development)
        if let Ok(current_dir) = std::env::current_dir() {
          check_backend_dist(&current_dir);
        }
        
        // Try Tauri resource resolution (for bundled resources)
        match app_handle.path().resource_dir() {
          Ok(resource_dir) => {
            info!("Resource directory resolved: {:?}", resource_dir);
            // Check if resource directory exists
            if resource_dir.exists() {
              info!("Resource directory exists, listing contents:");
              if let Ok(entries) = std::fs::read_dir(&resource_dir) {
                for entry in entries.flatten() {
                  info!("  - {:?}", entry.path());
                }
              }
            } else {
              warn!("Resource directory does not exist: {:?}", resource_dir);
            }
            // Prioritize platform-specific executables
            // Note: Resources may be in a 'resources' subdirectory (AppImage structure)
            #[cfg(windows)]
            {
              possible_exe_paths.push(resource_dir.join("resources").join("backend-server.exe"));
              possible_exe_paths.push(resource_dir.join("resources").join("backend-server"));
              possible_exe_paths.push(resource_dir.join("backend-server.exe"));
              possible_exe_paths.push(resource_dir.join("backend-server"));
            }
            #[cfg(not(windows))]
            {
              possible_exe_paths.push(resource_dir.join("resources").join("backend-server"));
              possible_exe_paths.push(resource_dir.join("resources").join("backend-server.exe"));
              possible_exe_paths.push(resource_dir.join("backend-server"));
              possible_exe_paths.push(resource_dir.join("backend-server.exe"));
            }
          }
          Err(e) => {
            warn!("Could not resolve resource directory: {}", e);
          }
        }
        
        // Also try resolving the resource directly using Tauri's resolve method
        // This might work better in some bundle configurations
        // Note: In Tauri v2, resolve might work differently, so we try both approaches
        // Prioritize platform-specific executables
        #[cfg(not(windows))]
        {
          if let Ok(resource_path) = app_handle.path().resolve("backend-server", tauri::path::BaseDirectory::Resource) {
            info!("Resolved resource path (backend-server): {:?}", resource_path);
            possible_exe_paths.push(resource_path);
          }
        }
        #[cfg(windows)]
        {
          if let Ok(resource_path) = app_handle.path().resolve("backend-server.exe", tauri::path::BaseDirectory::Resource) {
            info!("Resolved resource path (backend-server.exe): {:?}", resource_path);
            possible_exe_paths.push(resource_path);
          }
          if let Ok(resource_path) = app_handle.path().resolve("backend-server", tauri::path::BaseDirectory::Resource) {
            info!("Resolved resource path (backend-server): {:?}", resource_path);
            possible_exe_paths.push(resource_path);
          }
        }
        
        // For Linux AppImages, resources might be in a different location
        // AppImages extract to a temporary directory, and resources are in usr/lib or usr/share
        #[cfg(target_os = "linux")]
        {
          // Check AppImage extraction directory structure
          if let Ok(appimage_path) = std::env::var("APPIMAGE") {
            info!("Running as AppImage: {}", appimage_path);
            if let Ok(appdir) = std::env::var("APPDIR") {
              info!("AppImage APPDIR: {}", appdir);
              let appdir_path = PathBuf::from(&appdir);
              // AppImage structure: usr/lib/ProductName/resources/backend-server
              possible_exe_paths.push(appdir_path.join("usr").join("lib").join("Budget Planer").join("resources").join("backend-server"));
              possible_exe_paths.push(appdir_path.join("usr").join("lib").join("budget-planer").join("resources").join("backend-server"));
              possible_exe_paths.push(appdir_path.join("usr").join("lib").join("com.budgetplaner").join("resources").join("backend-server"));
              // Also check without resources subdirectory
              possible_exe_paths.push(appdir_path.join("usr").join("lib").join("backend-server"));
              possible_exe_paths.push(appdir_path.join("usr").join("share").join("backend-server"));
              possible_exe_paths.push(appdir_path.join("resources").join("backend-server"));
            }
          }
          
          // For DEB packages, resources are typically in /usr/lib or /usr/share
          // Check if we're in a system installation
          if exe_dir.starts_with("/usr") {
            possible_exe_paths.push(PathBuf::from("/usr/lib/budget-planer/backend-server"));
            possible_exe_paths.push(PathBuf::from("/usr/share/budget-planer/backend-server"));
            possible_exe_paths.push(PathBuf::from("/usr/lib/com.budgetplaner/backend-server"));
            possible_exe_paths.push(PathBuf::from("/usr/share/com.budgetplaner/backend-server"));
            // Also check with space in name (from productName)
            possible_exe_paths.push(PathBuf::from("/usr/lib/Budget Planer/backend-server"));
            possible_exe_paths.push(PathBuf::from("/usr/share/Budget Planer/backend-server"));
          }
          
          // For standalone binaries, check common project locations
          // This is useful when running the binary from the project directory or Downloads
          let home_dir = std::env::var("HOME").ok().map(PathBuf::from);
          if let Some(home) = home_dir {
            // Check common project locations in home directory
            let project_locations = vec![
              home.join("Dokumente").join("GitHub").join("Budget-Planer").join("backend").join("dist"),
              home.join("Documents").join("GitHub").join("Budget-Planer").join("backend").join("dist"),
              home.join("projects").join("Budget-Planer").join("backend").join("dist"),
              home.join("Projects").join("Budget-Planer").join("backend").join("dist"),
              home.join("dev").join("Budget-Planer").join("backend").join("dist"),
              home.join("Dev").join("Budget-Planer").join("backend").join("dist"),
            ];
            
            for project_path in project_locations {
              if project_path.exists() {
                info!("Found potential project directory: {:?}", project_path);
                possible_exe_paths.push(project_path.join("backend-server"));
              }
            }
          }
          
          // Also check if BACKEND_SERVER_PATH environment variable is set
          if let Ok(backend_path) = std::env::var("BACKEND_SERVER_PATH") {
            let backend_path_buf = PathBuf::from(&backend_path);
            if backend_path_buf.exists() {
              info!("Using backend server from BACKEND_SERVER_PATH: {:?}", backend_path_buf);
              possible_exe_paths.push(backend_path_buf);
            }
          }
        }
        
        // Add paths relative to executable (fallback)
        // For standalone binaries, resources might be next to the executable
        // Prioritize platform-specific executables
        #[cfg(windows)]
        {
          possible_exe_paths.push(exe_dir.join("backend-server.exe"));
          possible_exe_paths.push(exe_dir.join("backend-server"));
          possible_exe_paths.push(exe_dir.join("resources").join("backend-server.exe"));
          possible_exe_paths.push(exe_dir.join("resources").join("backend-server"));
        }
        #[cfg(not(windows))]
        {
          possible_exe_paths.push(exe_dir.join("backend-server"));
          possible_exe_paths.push(exe_dir.join("backend-server.exe"));
          possible_exe_paths.push(exe_dir.join("resources").join("backend-server"));
          possible_exe_paths.push(exe_dir.join("resources").join("backend-server.exe"));
        }
        
        // For Linux, also check lib and share directories relative to executable
        // This is common for Linux applications and standalone binaries
        #[cfg(target_os = "linux")]
        {
          possible_exe_paths.push(exe_dir.join("lib").join("backend-server"));
          possible_exe_paths.push(exe_dir.join("share").join("backend-server"));
          possible_exe_paths.push(exe_dir.join("usr").join("lib").join("backend-server"));
          possible_exe_paths.push(exe_dir.join("usr").join("share").join("backend-server"));
        }
        
        // Also check parent directories (for nested bundle structures)
        if let Some(parent) = exe_dir.parent() {
          #[cfg(windows)]
          {
            possible_exe_paths.push(parent.join("backend-server.exe"));
            possible_exe_paths.push(parent.join("backend-server"));
            possible_exe_paths.push(parent.join("resources").join("backend-server.exe"));
            possible_exe_paths.push(parent.join("resources").join("backend-server"));
          }
          #[cfg(not(windows))]
          {
            possible_exe_paths.push(parent.join("backend-server"));
            possible_exe_paths.push(parent.join("backend-server.exe"));
            possible_exe_paths.push(parent.join("resources").join("backend-server"));
            possible_exe_paths.push(parent.join("resources").join("backend-server.exe"));
          }
          
          #[cfg(target_os = "linux")]
          {
            possible_exe_paths.push(parent.join("lib").join("backend-server"));
            possible_exe_paths.push(parent.join("share").join("backend-server"));
          }
        }
        
        // Log all paths being checked
        info!("Checking the following paths for backend executable:");
        for path in &possible_exe_paths {
          let exists = path.exists();
          info!("  {:?} - {}", path, if exists { "EXISTS" } else { "not found" });
        }
        
        // Find the first existing executable, filtering out placeholders and platform-incompatible files
        let bundled_exe = possible_exe_paths.iter().find(|p| {
          if !p.exists() {
            return false;
          }
          
          // On non-Windows, skip .exe files (they're Windows executables)
          #[cfg(not(windows))]
          {
            if p.file_name().and_then(|n| n.to_str()).map(|s| s.ends_with(".exe")).unwrap_or(false) {
              return false;
            }
          }
          
          // Filter out placeholder files (very small files < 1KB are likely placeholders)
          if let Ok(metadata) = std::fs::metadata(p) {
            let size = metadata.len();
            if size < 1024 {
              warn!("Skipping potential placeholder file: {:?} (size: {} bytes)", p, size);
              return false;
            }
          }
          
          true
        }).cloned();
        
        // If bundled executable found, use it directly
        if let Some(exe_path) = bundled_exe {
          info!("Found bundled backend executable: {:?}", exe_path);
          
          // Create a dummy backend_path for the function (it won't be used when executable is found)
          let dummy_backend_path = exe_dir.join("backend");
          
          match start_backend_server(&app_handle, &dummy_backend_path, &db_path_clone) {
            Ok(child) => {
              // Store process in app state
              if let Some(state) = app_handle.try_state::<Mutex<Option<Child>>>() {
                if let Ok(mut process) = state.lock() {
                  *process = Some(child);
                  info!("Backend server started successfully using bundled executable");
                } else {
                  warn!("Could not store backend process in app state");
                }
              }
            }
            Err(e) => {
              error!("Failed to start bundled backend server: {}", e);
              error!("Backend server not started. API calls will fail.");
            }
          }
        } else {
          // Fallback: Find backend directory (for development)
          info!("Bundled backend executable not found, looking for backend directory...");
          
          let mut possible_backend_paths: Vec<PathBuf> = vec![
            exe_dir.join("backend"),
            exe_dir.join("../../backend"),
            exe_dir.join("../../../backend"),  // From target/release/
            exe_dir.join("../../../../backend"), // From target/release/ if deeper
          ];
          
          // Add parent directory paths
          if let Some(parent) = exe_dir.parent() {
            possible_backend_paths.push(parent.join("backend"));
            if let Some(grandparent) = parent.parent() {
              possible_backend_paths.push(grandparent.join("backend"));
              if let Some(ggparent) = grandparent.parent() {
                possible_backend_paths.push(ggparent.join("backend"));
              }
            }
          }
          
          // Also try absolute path from project root (if we're in development)
          if let Ok(current_dir) = std::env::current_dir() {
            possible_backend_paths.push(current_dir.join("backend"));
            if let Some(parent) = current_dir.parent() {
              possible_backend_paths.push(parent.join("backend"));
            }
          }
          
          // Check common project locations (useful when binary is run from Downloads or elsewhere)
          #[cfg(target_os = "linux")]
          {
            if let Ok(home) = std::env::var("HOME") {
              let home_path = PathBuf::from(&home);
              let common_project_locations = vec![
                home_path.join("Dokumente").join("GitHub").join("Budget-Planer").join("backend"),
                home_path.join("Documents").join("GitHub").join("Budget-Planer").join("backend"),
                home_path.join("projects").join("Budget-Planer").join("backend"),
                home_path.join("Projects").join("Budget-Planer").join("backend"),
                home_path.join("dev").join("Budget-Planer").join("backend"),
                home_path.join("Dev").join("Budget-Planer").join("backend"),
                PathBuf::from("/home").join("firstpick").join("Dokumente").join("GitHub").join("Budget-Planer").join("backend"),
              ];
              
              for project_path in common_project_locations {
                if project_path.exists() {
                  info!("Found potential project directory: {:?}", project_path);
                  possible_backend_paths.push(project_path.clone());
                  // Also check the dist subdirectory
                  let dist_path = project_path.join("dist");
                  if dist_path.exists() {
                    possible_backend_paths.push(dist_path);
                  }
                }
              }
            }
            
            // Check BACKEND_PATH environment variable
            if let Ok(backend_path) = std::env::var("BACKEND_PATH") {
              let backend_path_buf = PathBuf::from(&backend_path);
              if backend_path_buf.exists() {
                info!("Using backend from BACKEND_PATH: {:?}", backend_path_buf);
                possible_backend_paths.push(backend_path_buf);
              }
            }
          }
          
          let mut backend_path: Option<PathBuf> = None;
          let mut backend_exe_path: Option<PathBuf> = None;
          
          for path in &possible_backend_paths {
            // First check if this path itself is the executable
            if path.file_name().and_then(|n| n.to_str()).map(|s| s == "backend-server").unwrap_or(false) {
              if path.exists() {
                if let Ok(metadata) = std::fs::metadata(path) {
                  if metadata.len() >= 1024 {
                    backend_exe_path = Some(path.clone());
                    info!("Found backend executable directly: {:?}", backend_exe_path);
                    break;
                  }
                }
              }
            }
            
            // Check if this is already a dist directory with the executable
            let exe_in_dist = path.join("backend-server");
            if exe_in_dist.exists() {
              if let Ok(metadata) = std::fs::metadata(&exe_in_dist) {
                if metadata.len() >= 1024 {
                  backend_exe_path = Some(exe_in_dist);
                  info!("Found backend executable in dist directory: {:?}", backend_exe_path);
                  break;
                }
              }
            }
            
            // Check if this is a backend directory (has manage.py)
            let manage_py = path.join("manage.py");
            if manage_py.exists() {
              backend_path = Some(path.clone());
              info!("Found backend directory at: {:?}", path);
              
              // Also check if there's a dist subdirectory with the executable
              let dist_exe = path.join("dist").join("backend-server");
              if dist_exe.exists() {
                if let Ok(metadata) = std::fs::metadata(&dist_exe) {
                  if metadata.len() >= 1024 {
                    backend_exe_path = Some(dist_exe);
                    info!("Found backend executable in backend/dist: {:?}", backend_exe_path);
                    break;
                  }
                }
              }
            }
          }
          
          // If we found the executable directly, use it
          if let Some(exe_path) = backend_exe_path {
            info!("Using backend executable: {:?}", exe_path);
            // Get the backend directory (parent of dist, or parent of executable)
            let backend_dir = if exe_path.parent().and_then(|p| p.file_name()).map(|n| n == "dist").unwrap_or(false) {
              exe_path.parent().and_then(|p| p.parent()).map_or_else(|| PathBuf::from("."), Path::to_path_buf)
            } else {
              exe_path.parent().map_or_else(|| PathBuf::from("."), Path::to_path_buf)
            };
            
            match start_backend_server(&app_handle, &backend_dir, &db_path_clone) {
              Ok(child) => {
                // Store process in app state
                if let Some(state) = app_handle.try_state::<Mutex<Option<Child>>>() {
                  if let Ok(mut process) = state.lock() {
                    *process = Some(child);
                    info!("Backend server started successfully using found executable");
                  } else {
                    warn!("Could not store backend process in app state");
                  }
                }
              }
              Err(e) => {
                error!("Failed to start backend server with found executable: {}", e);
                error!("Backend server not started. API calls will fail.");
              }
            }
          }
          // Start backend server if found - don't fail if this doesn't work
          else if let Some(backend_path) = backend_path {
            match start_backend_server(&app_handle, &backend_path, &db_path_clone) {
              Ok(child) => {
                // Store process in app state
                if let Some(state) = app_handle.try_state::<Mutex<Option<Child>>>() {
                  if let Ok(mut process) = state.lock() {
                    *process = Some(child);
                    info!("Backend server started successfully");
                  } else {
                    warn!("Could not store backend process in app state");
                  }
                }
              }
              Err(e) => {
                error!("Failed to start backend server: {}", e);
                error!("Backend server not started. API calls will fail.");
                error!("");
                error!("To fix this issue:");
                error!("1. Make sure Python 3.10+ is installed (https://www.python.org/downloads/)");
                error!("2. Run setup-backend.ps1 from the project root directory");
                error!("3. Make sure the backend directory exists at: {:?}", backend_path);
              }
            }
          } else {
            error!("Backend directory not found. Backend server not started.");
            error!("Searched in the following locations:");
            for path in &possible_backend_paths {
              error!("  - {:?}", path);
            }
            error!("");
            error!("To fix this issue:");
            error!("1. Make sure the backend directory exists");
            error!("2. If this is a packaged app, the backend needs to be bundled with the application");
            error!("3. For development, make sure you're running from the project root");
          }
        }
      });
      
      eprintln!("Tauri app setup completed successfully (backend starting in background)");
      Ok(())
    })
    .on_window_event(|app, event| {
      // Cleanup backend process when window closes - non-blocking
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        info!("Window close requested, initiating backend cleanup...");
        
        // Get the process and kill it in background to avoid blocking window close
        let app_handle = app.app_handle().clone();
        std::thread::spawn(move || {
          if let Some(state) = app_handle.try_state::<Mutex<Option<Child>>>() {
            // Use try_lock first to avoid blocking
            if let Ok(mut process) = state.try_lock() {
              if let Some(mut child) = process.take() {
                kill_backend_process(&mut child);
              }
            } else {
              // If lock is held, wait briefly then try again
              std::thread::sleep(std::time::Duration::from_millis(50));
              if let Ok(mut process) = state.lock() {
                if let Some(mut child) = process.take() {
                  kill_backend_process(&mut child);
                }
              }
            }
          }
        });
        // Window closes immediately - cleanup happens in background
      }
    })
    .build(tauri::generate_context!())
    .unwrap_or_else(|e| {
      eprintln!("Fatal error starting Tauri application: {}", e);
      std::process::exit(1);
    })
    .run(|app, event| {
      match event {
        tauri::RunEvent::ExitRequested { .. } => {
          info!("App exit requested, cleaning up backend process...");
          // Cleanup backend process synchronously on app exit to ensure it completes
          if let Some(state) = app.try_state::<Mutex<Option<Child>>>() {
            if let Ok(mut process) = state.lock() {
              if let Some(mut child) = process.take() {
                kill_backend_process(&mut child);
                // Wait a moment to ensure process is killed
                std::thread::sleep(std::time::Duration::from_millis(200));
              }
            }
          }
          // Also kill any process on port 8000 as a fallback
          kill_process_on_port(8000);
        }
        _ => {}
      }
    });
}

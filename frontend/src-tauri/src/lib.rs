use std::path::PathBuf;
use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use log::{info, warn, error};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

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
      // On non-Windows, we rely on the kill() call above
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
  }
  
  Ok(())
}

/// Start the Django backend server
/// Returns immediately after spawning the process without blocking on server readiness
/// The frontend will handle retries if the server isn't ready immediately
fn start_backend_server(
  backend_path: &PathBuf,
  db_path: &PathBuf,
) -> Result<Child, Box<dyn std::error::Error>> {
  info!("Starting Django backend server...");
  
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
        return Err("Python not found".into());
      }
    }
  };
  
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
        
        // Find backend directory
        // Try multiple strategies to find the backend
        let exe_path = std::env::current_exe().unwrap_or_default();
        let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new("."));
        
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
        
        let mut backend_path: Option<PathBuf> = None;
        for path in &possible_backend_paths {
          let manage_py = path.join("manage.py");
          if manage_py.exists() {
            backend_path = Some(path.clone());
            info!("Found backend at: {:?}", path);
            break;
          }
        }
        
        // Start backend server if found - don't fail if this doesn't work
        if let Some(backend_path) = backend_path {
          match start_backend_server(&backend_path, &db_path_clone) {
            Ok(child) => {
              // Store process in app state
              if let Some(state) = app_handle.try_state::<Mutex<Option<Child>>>() {
                if let Ok(mut process) = state.lock() {
                  *process = Some(child);
                  eprintln!("Backend server started successfully");
                } else {
                  eprintln!("Warning: Could not store backend process in app state");
                }
              }
            }
            Err(e) => {
              eprintln!("Failed to start backend server: {}", e);
              eprintln!("Backend server not started. API calls will fail.");
            }
          }
        } else {
          eprintln!("Backend directory not found. Backend server not started.");
          eprintln!("Searched in: {:?}", possible_backend_paths);
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
          // Cleanup backend process on app exit - non-blocking
          let app_handle = app.clone();
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
        }
        _ => {}
      }
    });
}

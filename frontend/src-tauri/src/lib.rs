use std::path::PathBuf;
use std::process::{Command, Child};
use std::sync::Mutex;
use log::{info, warn, error};
use tauri::Manager;

/// Kill the backend process and wait for it to terminate
fn kill_backend_process(child: &mut Child) {
  info!("Stopping backend server (PID: {:?})...", child.id());
  
  // Try to kill the process
  if let Err(e) = child.kill() {
    warn!("Failed to kill backend process: {}", e);
  }
  
  // Wait for the process to terminate with a timeout
  let timeout = std::time::Duration::from_secs(5);
  let start = std::time::Instant::now();
  
  while start.elapsed() < timeout {
    match child.try_wait() {
      Ok(Some(status)) => {
        info!("Backend server terminated with status: {:?}", status);
        return;
      }
      Ok(None) => {
        // Process still running, wait a bit
        std::thread::sleep(std::time::Duration::from_millis(100));
      }
      Err(e) => {
        warn!("Error waiting for backend process: {}", e);
        return;
      }
    }
  }
  
  // If we get here, the process didn't terminate in time
  warn!("Backend process did not terminate within timeout, trying forceful termination");
  
  // On Windows, try using taskkill as a fallback to kill the process tree
  #[cfg(windows)]
  {
    let pid = child.id();
    let _ = Command::new("taskkill")
      .args(&["/F", "/T", "/PID", &pid.to_string()])
      .output();
  }
  
  // Final wait attempt
  let _ = child.wait();
  info!("Backend server cleanup completed");
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
        // Try python3, then python
        if Command::new("python3").arg("--version").output().is_ok() {
          PathBuf::from("python3")
        } else if Command::new("python").arg("--version").output().is_ok() {
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
      // Try python3, then python
      if Command::new("python3").arg("--version").output().is_ok() {
        PathBuf::from("python3")
      } else if Command::new("python").arg("--version").output().is_ok() {
        PathBuf::from("python")
      } else {
        return Err("Python not found".into());
      }
    }
  };
  
  // Run migrations before starting the server
  info!("Running database migrations before starting server...");
  let mut migrate_cmd = Command::new(&python_cmd);
  migrate_cmd.current_dir(backend_path);
  migrate_cmd.arg("manage.py");
  migrate_cmd.arg("migrate");
  migrate_cmd.arg("--noinput");
  migrate_cmd.env("DATABASE_PATH", db_path.to_string_lossy().to_string());
  migrate_cmd.env("DJANGO_SETTINGS_MODULE", "config.settings");
  
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
        warn!("Continuing anyway - server will start but may have database issues");
      }
    }
    Err(e) => {
      warn!("Could not run migrations before server start: {}. Server will start anyway.", e);
    }
  }
  
  // Now start the server
  let mut cmd = Command::new(&python_cmd);
  cmd.current_dir(backend_path);
  cmd.arg("manage.py");
  cmd.arg("runserver");
  cmd.arg("127.0.0.1:8000");
  cmd.env("DATABASE_PATH", db_path.to_string_lossy().to_string());
  cmd.env("DJANGO_SETTINGS_MODULE", "config.settings");
  // Don't suppress output in release mode so we can debug issues
  // cmd.stdout(std::process::Stdio::null());
  // cmd.stderr(std::process::Stdio::null());
  
  let mut child = cmd.spawn()?;
  info!("Backend server started with PID: {:?}", child.id());
  
  // Wait a moment to check if the process is still running
  std::thread::sleep(std::time::Duration::from_millis(500));
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
  
  // Wait a bit longer for the server to actually start listening
  info!("Waiting for backend server to be ready...");
  let mut server_ready = false;
  for i in 0..10 {
    std::thread::sleep(std::time::Duration::from_millis(500));
    // Try to connect to the server
    if let Ok(stream) = std::net::TcpStream::connect("127.0.0.1:8000") {
      server_ready = true;
      let _ = stream.shutdown(std::net::Shutdown::Both);
      info!("Backend server is ready and accepting connections");
      break;
    }
    if i == 9 {
      warn!("Backend server may not be ready yet, but continuing anyway");
    }
  }
  
  if !server_ready {
    warn!("Backend server process is running but may not be ready to accept connections yet");
  }
  
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
      
      // Initialize database on startup - don't fail if this doesn't work
      if let Err(e) = initialize_database(app.handle()) {
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
        match start_backend_server(&backend_path, &db_path) {
          Ok(child) => {
            // Store process in app state
            if let Ok(mut process) = app.state::<Mutex<Option<Child>>>().try_lock() {
              *process = Some(child);
              eprintln!("Backend server started successfully");
            } else {
              eprintln!("Warning: Could not store backend process in app state");
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
      
      eprintln!("Tauri app setup completed successfully");
      Ok(())
    })
    .on_window_event(|app, event| {
      // Cleanup backend process when window closes
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        if let Some(state) = app.try_state::<Mutex<Option<Child>>>() {
          if let Ok(mut process) = state.lock() {
            if let Some(mut child) = process.take() {
              kill_backend_process(&mut child);
            }
          }
        }
      }
    })
    .build(tauri::generate_context!())
    .unwrap_or_else(|e| {
      eprintln!("Fatal error starting Tauri application: {}", e);
      std::process::exit(1);
    })
    .run(|app, event| {
      if let tauri::RunEvent::ExitRequested { .. } = event {
        info!("App exit requested, cleaning up backend process...");
        // Cleanup backend process on app exit
        if let Some(state) = app.try_state::<Mutex<Option<Child>>>() {
          if let Ok(mut process) = state.lock() {
            if let Some(mut child) = process.take() {
              kill_backend_process(&mut child);
            }
          }
        }
      }
    });
}

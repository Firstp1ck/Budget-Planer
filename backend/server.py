#!/usr/bin/env python
"""
Backend server entry point for PyInstaller bundle.
This script starts the Django development server.
"""
import os
import sys
import argparse
from pathlib import Path

# Set Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Add the backend directory to Python path if running from bundle
if getattr(sys, 'frozen', False):
    # Running as bundled executable
    # PyInstaller sets sys._MEIPASS to the temporary directory where it extracts files
    bundle_dir = Path(sys._MEIPASS)
    # The backend code is in the bundle root, not in a subdirectory
    sys.path.insert(0, str(bundle_dir))
else:
    # Running as script
    backend_dir = Path(__file__).parent
    sys.path.insert(0, str(backend_dir))
    sys.path.insert(0, str(backend_dir.parent))

def main():
    """Start the Django development server."""
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        print(f"Error: Couldn't import Django. {exc}", file=sys.stderr)
        sys.exit(1)
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Budget Planer Backend Server')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind to')
    parser.add_argument('--database-path', help='Path to SQLite database file')
    parser.add_argument('--migrate', action='store_true', help='Run migrations before starting server')
    args, unknown = parser.parse_known_args()
    
    # Set database path if provided
    if args.database_path:
        os.environ['DATABASE_PATH'] = args.database_path
    
    # Run migrations if requested
    if args.migrate:
        print("Running database migrations...")
        migrate_args = ['manage.py', 'migrate', '--noinput']
        execute_from_command_line(migrate_args)
    
    # Start the server
    server_args = [
        'manage.py',
        'runserver',
        f'{args.host}:{args.port}',
    ]
    server_args.extend(unknown)
    
    execute_from_command_line(server_args)

if __name__ == '__main__':
    main()

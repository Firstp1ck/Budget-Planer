# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Budget Planer backend server.
This bundles Django and all dependencies into a standalone executable.
"""

import os
from pathlib import Path

# Get the backend directory (where this spec file is located)
# SPECPATH is the path to this spec file (may be absolute or relative)
spec_file = Path(SPECPATH)
if not spec_file.is_absolute():
    # If relative, make it absolute based on current working directory
    spec_file = Path.cwd() / spec_file
backend_dir = spec_file.parent.resolve()

# Verify backend_dir is correct by checking for core directory
if not (backend_dir / 'core').exists():
    # Fallback: try to find backend directory from current working directory
    cwd = Path.cwd()
    if (cwd / 'core').exists():
        backend_dir = cwd.resolve()
    elif (cwd / 'backend' / 'core').exists():
        backend_dir = (cwd / 'backend').resolve()

project_root = backend_dir.parent

# Build datas list with absolute paths
# Format: (source_path, destination_in_bundle)
# Use os.path.normpath to ensure Windows path separators are correct
import os
datas = []
core_migrations_path = backend_dir / 'core' / 'migrations'
config_dir_path = backend_dir / 'config'
core_dir_path = backend_dir / 'core'

# Debug output
print(f"DEBUG: backend_dir = {backend_dir}")
print(f"DEBUG: core_migrations_path = {core_migrations_path}")
print(f"DEBUG: core_migrations exists = {core_migrations_path.exists()}")

if core_migrations_path.exists():
    # Use os.path.normpath to ensure proper path format for PyInstaller
    datas.append((os.path.normpath(str(core_migrations_path.resolve())), 'core/migrations'))
if config_dir_path.exists():
    datas.append((os.path.normpath(str(config_dir_path.resolve())), 'config'))
if core_dir_path.exists():
    datas.append((os.path.normpath(str(core_dir_path.resolve())), 'core'))

print(f"DEBUG: datas = {datas}")

a = Analysis(
    ['server.py'],
    pathex=[str(backend_dir), str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        # Django core
        'django',
        'django.core',
        'django.core.management',
        'django.core.management.commands',
        'django.core.management.commands.runserver',
        'django.core.management.commands.migrate',
        'django.db',
        'django.db.backends',
        'django.db.backends.sqlite3',
        'django.contrib',
        'django.contrib.admin',
        'django.contrib.auth',
        'django.contrib.contenttypes',
        'django.contrib.sessions',
        'django.contrib.messages',
        'django.contrib.staticfiles',
        # Django REST Framework
        'rest_framework',
        'rest_framework.views',
        'rest_framework.viewsets',
        'rest_framework.response',
        'rest_framework.decorators',
        'rest_framework.serializers',
        'rest_framework.status',
        # CORS headers
        'corsheaders',
        'corsheaders.middleware',
        # Local apps
        'config',
        'config.settings',
        'config.urls',
        'config.wsgi',
        'core',
        'core.models',
        'core.views',
        'core.serializers',
        'core.urls',
        'core.utils',
        # Python standard library modules that might be needed
        'sqlite3',
        'json',
        'pathlib',
        'argparse',
        'os',
        'sys',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='backend-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Set to True to see errors during development
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

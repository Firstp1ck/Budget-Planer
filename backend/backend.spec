# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Budget Planer backend server.
This bundles Django and all dependencies into a standalone executable.

Enhanced with comprehensive hidden imports and data file collection
to prevent runtime errors from missing modules.
"""

import os
import sys
from pathlib import Path

# Import PyInstaller utilities for collecting submodules and data files
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

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

# Debug output for build verification
print(f"=" * 60)
print(f"PyInstaller Build Configuration")
print(f"=" * 60)
print(f"Backend directory: {backend_dir}")
print(f"Project root: {project_root}")
print(f"Python version: {sys.version}")
print(f"=" * 60)

# Build datas list with absolute paths
# Format: (source_path, destination_in_bundle)
# Use os.path.normpath to ensure Windows path separators are correct
datas = []

# Local application directories
core_migrations_path = backend_dir / 'core' / 'migrations'
config_dir_path = backend_dir / 'config'
core_dir_path = backend_dir / 'core'

print(f"Checking local app directories:")
print(f"  - core/migrations exists: {core_migrations_path.exists()}")
print(f"  - config exists: {config_dir_path.exists()}")
print(f"  - core exists: {core_dir_path.exists()}")

if core_migrations_path.exists():
    datas.append((os.path.normpath(str(core_migrations_path.resolve())), 'core/migrations'))
if config_dir_path.exists():
    datas.append((os.path.normpath(str(config_dir_path.resolve())), 'config'))
if core_dir_path.exists():
    datas.append((os.path.normpath(str(core_dir_path.resolve())), 'core'))

# Collect Django data files (templates, locale, etc.)
print(f"Collecting Django data files...")
try:
    django_datas = collect_data_files('django')
    datas.extend(django_datas)
    print(f"  - Collected {len(django_datas)} Django data entries")
except Exception as e:
    print(f"  - Warning: Could not collect Django data files: {e}")

# Collect Django REST Framework data files
print(f"Collecting Django REST Framework data files...")
try:
    drf_datas = collect_data_files('rest_framework')
    datas.extend(drf_datas)
    print(f"  - Collected {len(drf_datas)} DRF data entries")
except Exception as e:
    print(f"  - Warning: Could not collect DRF data files: {e}")

print(f"Total data entries: {len(datas)}")

# Collect all submodules for packages with dynamic imports
print(f"Collecting hidden imports...")
hiddenimports = []

# Collect all Django submodules (catches dynamic imports)
try:
    django_imports = collect_submodules('django')
    hiddenimports.extend(django_imports)
    print(f"  - Collected {len(django_imports)} Django submodules")
except Exception as e:
    print(f"  - Warning: Could not collect Django submodules: {e}")

# Collect all Django REST Framework submodules
try:
    drf_imports = collect_submodules('rest_framework')
    hiddenimports.extend(drf_imports)
    print(f"  - Collected {len(drf_imports)} DRF submodules")
except Exception as e:
    print(f"  - Warning: Could not collect DRF submodules: {e}")

# Collect corsheaders submodules
try:
    cors_imports = collect_submodules('corsheaders')
    hiddenimports.extend(cors_imports)
    print(f"  - Collected {len(cors_imports)} corsheaders submodules")
except Exception as e:
    print(f"  - Warning: Could not collect corsheaders submodules: {e}")

# Add explicit hidden imports for modules that may be missed
explicit_hiddenimports = [
    # Django core modules (explicit list as fallback)
    'django',
    'django.core',
    'django.core.management',
    'django.core.management.base',
    'django.core.management.commands',
    'django.core.management.commands.runserver',
    'django.core.management.commands.migrate',
    'django.core.management.commands.makemigrations',
    'django.core.management.commands.shell',
    'django.core.management.commands.check',
    'django.core.management.commands.inspectdb',
    'django.core.management.commands.dbshell',
    'django.core.management.commands.flush',
    'django.core.management.commands.loaddata',
    'django.core.management.commands.dumpdata',
    'django.core.management.commands.sqlmigrate',
    'django.core.management.commands.showmigrations',
    'django.core.management.commands.squashmigrations',
    'django.core.management.sql',
    'django.core.management.utils',
    'django.core.management.color',
    
    # Django database backends
    'django.db',
    'django.db.backends',
    'django.db.backends.base',
    'django.db.backends.base.base',
    'django.db.backends.base.creation',
    'django.db.backends.base.features',
    'django.db.backends.base.introspection',
    'django.db.backends.base.operations',
    'django.db.backends.base.schema',
    'django.db.backends.base.validation',
    'django.db.backends.sqlite3',
    'django.db.backends.sqlite3.base',
    'django.db.backends.sqlite3.creation',
    'django.db.backends.sqlite3.features',
    'django.db.backends.sqlite3.introspection',
    'django.db.backends.sqlite3.operations',
    'django.db.backends.sqlite3.schema',
    'django.db.models',
    'django.db.models.fields',
    'django.db.models.fields.related',
    'django.db.models.fields.files',
    'django.db.models.fields.json',
    'django.db.models.sql',
    'django.db.migrations',
    'django.db.migrations.operations',
    'django.db.migrations.executor',
    'django.db.migrations.loader',
    'django.db.migrations.recorder',
    'django.db.migrations.state',
    'django.db.migrations.autodetector',
    
    # Django contrib modules
    'django.contrib',
    'django.contrib.admin',
    'django.contrib.admin.apps',
    'django.contrib.admin.sites',
    'django.contrib.admin.options',
    'django.contrib.auth',
    'django.contrib.auth.apps',
    'django.contrib.auth.models',
    'django.contrib.auth.backends',
    'django.contrib.auth.middleware',
    'django.contrib.auth.hashers',
    'django.contrib.auth.password_validation',
    'django.contrib.contenttypes',
    'django.contrib.contenttypes.apps',
    'django.contrib.contenttypes.models',
    'django.contrib.sessions',
    'django.contrib.sessions.apps',
    'django.contrib.sessions.backends',
    'django.contrib.sessions.backends.db',
    'django.contrib.sessions.middleware',
    'django.contrib.messages',
    'django.contrib.messages.apps',
    'django.contrib.messages.middleware',
    'django.contrib.messages.storage',
    'django.contrib.messages.storage.fallback',
    'django.contrib.staticfiles',
    'django.contrib.staticfiles.apps',
    'django.contrib.staticfiles.finders',
    'django.contrib.staticfiles.handlers',
    'django.contrib.staticfiles.storage',
    
    # Django HTTP and URL handling
    'django.http',
    'django.http.request',
    'django.http.response',
    'django.urls',
    'django.urls.resolvers',
    'django.urls.converters',
    
    # Django templates
    'django.template',
    'django.template.backends',
    'django.template.backends.django',
    'django.template.loader',
    'django.template.loaders',
    'django.template.loaders.filesystem',
    'django.template.loaders.app_directories',
    
    # Django forms and validation
    'django.forms',
    'django.forms.fields',
    'django.forms.widgets',
    'django.core.validators',
    
    # Django middleware
    'django.middleware',
    'django.middleware.common',
    'django.middleware.csrf',
    'django.middleware.security',
    'django.middleware.clickjacking',
    
    # Django utilities
    'django.utils',
    'django.utils.encoding',
    'django.utils.functional',
    'django.utils.dateparse',
    'django.utils.timezone',
    'django.utils.translation',
    'django.utils.deprecation',
    'django.utils.autoreload',
    'django.utils.module_loading',
    'django.utils.version',
    'django.conf',
    'django.conf.urls',
    'django.conf.urls.static',
    
    # Django REST Framework (explicit list as fallback)
    'rest_framework',
    'rest_framework.apps',
    'rest_framework.views',
    'rest_framework.viewsets',
    'rest_framework.response',
    'rest_framework.request',
    'rest_framework.decorators',
    'rest_framework.serializers',
    'rest_framework.status',
    'rest_framework.routers',
    'rest_framework.parsers',
    'rest_framework.renderers',
    'rest_framework.permissions',
    'rest_framework.authentication',
    'rest_framework.pagination',
    'rest_framework.filters',
    'rest_framework.negotiation',
    'rest_framework.metadata',
    'rest_framework.mixins',
    'rest_framework.generics',
    'rest_framework.exceptions',
    'rest_framework.fields',
    'rest_framework.relations',
    'rest_framework.validators',
    'rest_framework.settings',
    'rest_framework.utils',
    'rest_framework.utils.serializer_helpers',
    
    # CORS headers
    'corsheaders',
    'corsheaders.middleware',
    'corsheaders.conf',
    'corsheaders.signals',
    
    # Local apps - explicit imports
    'config',
    'config.settings',
    'config.urls',
    'config.wsgi',
    'config.asgi',
    'core',
    'core.apps',
    'core.admin',
    'core.models',
    'core.views',
    'core.serializers',
    'core.urls',
    'core.utils',
    'core.patches',
    'core.logging_filters',
    'core.middleware',
    'core.exception_handler',
    
    # Python standard library modules that might be needed
    'sqlite3',
    'json',
    'pathlib',
    'argparse',
    'os',
    'sys',
    'logging',
    'logging.handlers',
    'datetime',
    'decimal',
    'uuid',
    'hashlib',
    'base64',
    'email',
    'email.mime',
    'email.mime.text',
    'email.mime.multipart',
    'html',
    'html.parser',
    'http',
    'http.client',
    'urllib',
    'urllib.parse',
    'urllib.request',
    're',
    'copy',
    'collections',
    'collections.abc',
    'functools',
    'itertools',
    'operator',
    'threading',
    'socket',
    'select',
    'ssl',
    'io',
    'pickle',
    'struct',
    'tempfile',
    'shutil',
    'glob',
    'fnmatch',
    'codecs',
    'encodings',
    'encodings.utf_8',
    'encodings.ascii',
    'encodings.latin_1',
    'encodings.idna',
    
    # openpyxl for Excel export/import
    'openpyxl',
    'openpyxl.workbook',
    'openpyxl.worksheet',
    'openpyxl.cell',
    'openpyxl.styles',
    'openpyxl.utils',
]

# Merge explicit imports with collected ones (remove duplicates)
hiddenimports = list(set(hiddenimports + explicit_hiddenimports))
print(f"  - Total hidden imports: {len(hiddenimports)}")
print(f"=" * 60)

a = Analysis(
    ['server.py'],
    pathex=[str(backend_dir), str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary modules to reduce bundle size
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'scipy',
        'PIL',
        'cv2',
        'IPython',
        'notebook',
        'jupyter',
        'pytest',
        'unittest',
        '_pytest',
    ],
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
    debug=True,  # Enable debug mode for better error messages during testing
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console output for error visibility
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

print(f"=" * 60)
print(f"PyInstaller build configuration complete!")
print(f"Output executable: backend-server")
print(f"=" * 60)

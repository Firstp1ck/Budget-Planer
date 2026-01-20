"""
Django settings for Budget Planer project.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent

# Security settings
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-dev-key-change-in-production')
DEBUG = os.getenv('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# Import patches early to suppress BrokenPipeError
try:
    import core.patches  # noqa: F401
except ImportError:
    pass

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party apps
    'rest_framework',
    'corsheaders',
    # Local apps
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.BrokenPipeHandlerMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database
# Allow custom database path via environment variable (for Tauri app)
database_path = os.getenv('DATABASE_PATH')
if database_path:
    db_name = Path(database_path)
    # Ensure the directory exists (important for Windows paths)
    db_dir = db_name.parent
    if db_dir:
        db_dir.mkdir(parents=True, exist_ok=True)
else:
    db_name = BASE_DIR / 'db.sqlite3'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': str(db_name),  # Convert to string for better Windows compatibility
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'de-de'
TIME_ZONE = 'Europe/Berlin'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
    ],
    'EXCEPTION_HANDLER': 'core.exception_handler.rest_framework_exception_handler',
}

# CORS settings
# Allow Tauri app origins (tauri://localhost) and dev server
cors_origins = os.getenv(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173'
).split(',')
# Add Tauri origins
cors_origins.extend([
    'tauri://localhost',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
])
CORS_ALLOWED_ORIGINS = cors_origins

# Also allow all origins in development (for Tauri)
CORS_ALLOW_ALL_ORIGINS = os.getenv('DEBUG', 'True') == 'True'

CORS_ALLOW_CREDENTIALS = True

# Logging configuration to suppress BrokenPipeError
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'suppress_broken_pipe': {
            '()': 'core.logging_filters.SuppressBrokenPipe',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'filters': ['suppress_broken_pipe'],
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.server': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

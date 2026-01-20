#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
from pathlib import Path

# Import patches early to suppress BrokenPipeError
# This must be done before importing Django
try:
    # Add backend directory to path first
    backend_dir = Path(__file__).parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    import core.patches  # noqa: F401
except ImportError:
    # Patches might not be available in all contexts
    pass


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()

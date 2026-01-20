"""
Logging filters to suppress BrokenPipeError.
"""
import logging


class SuppressBrokenPipe(logging.Filter):
    """
    Filter to suppress BrokenPipeError from being logged.
    
    BrokenPipeError occurs when Django tries to write a response to a connection
    that has already been closed by the client. This is not a critical error
    and should be handled silently.
    """
    
    def filter(self, record):
        """Filter out BrokenPipeError log records."""
        # Check if the log record is about BrokenPipeError
        if hasattr(record, 'exc_info') and record.exc_info:
            exc_type, exc_value, exc_traceback = record.exc_info
            if exc_type is BrokenPipeError or (isinstance(exc_value, BrokenPipeError)):
                return False  # Suppress this log record
            # Also check for OSError with errno 32 (broken pipe)
            if exc_type is OSError and hasattr(exc_value, 'errno') and exc_value.errno == 32:
                return False  # Suppress this log record
        
        # Check the message text for BrokenPipeError
        if record.getMessage():
            msg = str(record.getMessage())
            if 'BrokenPipeError' in msg or 'Broken pipe' in msg:
                return False  # Suppress this log record
        
        return True  # Allow other log records

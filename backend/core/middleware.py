"""
Custom middleware to handle BrokenPipeError gracefully.
This prevents Django from showing error pages when clients disconnect during response.
"""
import logging
import sys

logger = logging.getLogger(__name__)


class BrokenPipeHandlerMiddleware:
    """
    Middleware to catch and handle BrokenPipeError gracefully.
    
    BrokenPipeError occurs when Django tries to write a response to a connection
    that has already been closed by the client. This is not a critical error
    and should be handled silently.
    
    Note: This middleware may not catch all BrokenPipeError cases as they can
    occur at the WSGI level during response writing. The WSGI wrapper in
    config/wsgi.py also handles these errors.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        try:
            response = self.get_response(request)
            return response
        except (BrokenPipeError, OSError) as e:
            # Check if it's a broken pipe error (client disconnected)
            errno = getattr(e, 'errno', None)
            if errno == 32 or 'Broken pipe' in str(e) or 'BrokenPipeError' in str(type(e).__name__):
                # Client disconnected - log as warning but don't fail
                logger.warning(f"Client disconnected during request: {request.path}")
                # Suppress the error - operation likely succeeded
                # Return a minimal response that won't be sent anyway
                from django.http import HttpResponse
                return HttpResponse(status=200)
            # Re-raise other OSErrors
            raise
    
    def process_exception(self, request, exception):
        """Handle exceptions during response rendering."""
        if isinstance(exception, (BrokenPipeError, OSError)):
            errno = getattr(exception, 'errno', None)
            if errno == 32 or 'Broken pipe' in str(exception) or 'BrokenPipeError' in str(type(exception).__name__):
                logger.warning(f"Client disconnected during response: {request.path}")
                # Suppress the error - operation likely succeeded
                # Return None to suppress the error page
                return None
        return None

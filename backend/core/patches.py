"""
Patches to suppress BrokenPipeError in Django development server.
"""
import logging
import sys

logger = logging.getLogger(__name__)


def patch_django_exception_handler():
    """
    Patch Django's exception handler to suppress BrokenPipeError.
    
    This prevents Django's development server from showing error pages
    when clients disconnect during response writing.
    """
    try:
        # Patch django.views.debug to suppress BrokenPipeError
        import django.views.debug
        
        # Store the original exception handler
        original_technical_500_response = django.views.debug.technical_500_response
        
        def patched_technical_500_response(request, exc_type=None, exc_value=None, tb=None, **kwargs):
            """Patched exception handler that suppresses BrokenPipeError."""
            # Handle different call signatures
            if exc_type is None and exc_value is None:
                # Newer Django signature: technical_500_response(request, exc)
                if 'exc' in kwargs:
                    exc_value = kwargs['exc']
                elif len(kwargs) > 0:
                    # Try to get exception from kwargs
                    exc_value = list(kwargs.values())[0]
            
            # Check if it's a BrokenPipeError
            if isinstance(exc_value, (BrokenPipeError, OSError)):
                errno = getattr(exc_value, 'errno', None)
                if errno == 32 or 'Broken pipe' in str(exc_value) or 'BrokenPipeError' in str(type(exc_value).__name__):
                    logger.warning(f"Client disconnected during response: {request.path if hasattr(request, 'path') else 'unknown'}")
                    # Return a minimal response to suppress the error page
                    from django.http import HttpResponse
                    return HttpResponse(status=200)
            
            # For all other exceptions, use the original handler
            # Try different call signatures
            try:
                if exc_type is not None:
                    return original_technical_500_response(request, exc_type, exc_value, tb, **kwargs)
                elif 'exc' in kwargs:
                    return original_technical_500_response(request, exc=kwargs['exc'])
                else:
                    return original_technical_500_response(request, **kwargs)
            except TypeError:
                # Fallback: try with just request
                return original_technical_500_response(request)
        
        # Replace the exception handler
        django.views.debug.technical_500_response = patched_technical_500_response
        
        # Also patch sys.excepthook to catch unhandled exceptions
        original_excepthook = sys.excepthook
        
        def patched_excepthook(exc_type, exc_value, exc_traceback):
            """Patched excepthook to suppress BrokenPipeError."""
            if isinstance(exc_value, (BrokenPipeError, OSError)):
                errno = getattr(exc_value, 'errno', None)
                if errno == 32 or 'Broken pipe' in str(exc_value) or 'BrokenPipeError' in str(type(exc_value).__name__):
                    logger.warning("Client disconnected during response (suppressed)")
                    return  # Suppress the error
            
            # For all other exceptions, use the original handler
            original_excepthook(exc_type, exc_value, exc_traceback)
        
        sys.excepthook = patched_excepthook
            
    except Exception as e:
        logger.warning(f"Could not patch Django exception handler: {e}")


# Apply the patch when this module is imported
patch_django_exception_handler()

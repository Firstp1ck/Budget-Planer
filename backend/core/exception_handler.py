"""
Custom exception handler to suppress BrokenPipeError in Django.
"""
import logging
import sys
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Custom exception handler that suppresses BrokenPipeError.
    
    This prevents Django from showing error pages when clients disconnect
    during response writing.
    """
    # Check if it's a BrokenPipeError
    if isinstance(exc, (BrokenPipeError, OSError)):
        errno = getattr(exc, 'errno', None)
        if errno == 32 or 'Broken pipe' in str(exc) or 'BrokenPipeError' in str(type(exc).__name__):
            # Suppress BrokenPipeError - log as warning but don't show error page
            logger.warning(f"Client disconnected during response: {context.get('request', {}).path if context else 'unknown'}")
            # Return None to suppress the error page
            return None
    
    # For all other exceptions, use Django's default handler
    # Import here to avoid circular imports
    from django.views.debug import technical_500_response
    if sys.exc_info()[1] is exc:
        return technical_500_response(request=context.get('request'), exc=exc)
    return None


def rest_framework_exception_handler(exc, context):
    """
    Custom REST framework exception handler that ensures JSON responses.
    
    This ensures all exceptions return JSON, not HTML error pages.
    """
    # First, try REST framework's default exception handler
    response = drf_exception_handler(exc, context)
    
    # If REST framework handled it, return the response (should be JSON)
    if response is not None:
        return response
    
    # If REST framework didn't handle it, it's likely a non-API exception
    # Log it and return a JSON error response
    import traceback
    logger.error(f"Unhandled exception in REST framework view: {exc}", exc_info=True)
    
    # Check if it's a BrokenPipeError (should be suppressed)
    if isinstance(exc, (BrokenPipeError, OSError)):
        errno = getattr(exc, 'errno', None)
        if errno == 32 or 'Broken pipe' in str(exc) or 'BrokenPipeError' in str(type(exc).__name__):
            logger.warning(f"Client disconnected during response: {context.get('request', {}).path if context else 'unknown'}")
            # Return a minimal JSON response
            return Response({'error': 'Client disconnected'}, status=status.HTTP_200_OK)
    
    # For all other exceptions, return JSON error response
    return Response(
        {
            'error': str(exc),
            'error_type': type(exc).__name__,
            'detail': 'An error occurred processing your request'
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )

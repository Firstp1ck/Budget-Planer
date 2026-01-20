"""
WSGI config for Budget Planer project.
"""

import os
import logging
import sys

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

logger = logging.getLogger(__name__)

# Get the base WSGI application
_base_application = get_wsgi_application()


class BrokenPipeHandler:
    """
    WSGI wrapper that handles BrokenPipeError gracefully.
    
    BrokenPipeError occurs when Django tries to write a response to a connection
    that has already been closed by the client. This is not a critical error
    and should be handled silently.
    """
    
    def __init__(self, application):
        self.application = application
    
    def __call__(self, environ, start_response):
        # Wrap start_response to catch BrokenPipeError
        response_sent = [False]
        
        def wrapped_start_response(status, headers, exc_info=None):
            try:
                start_response(status, headers, exc_info)
                response_sent[0] = True
            except (BrokenPipeError, OSError) as e:
                errno = getattr(e, 'errno', None)
                if errno == 32 or 'Broken pipe' in str(e) or 'BrokenPipeError' in str(type(e).__name__):
                    logger.warning("Client disconnected during start_response")
                    response_sent[0] = True
                    raise
                raise
        
        try:
            # Get the response iterator
            response_iter = self.application(environ, wrapped_start_response)
            
            # Wrap the iterator to catch BrokenPipeError during iteration
            class SafeIterator:
                def __init__(self, iterator):
                    # Convert to an actual iterator - Response objects are iterable
                    # but not iterators (they have __iter__ but not __next__)
                    self.iterator = iter(iterator)
                
                def __iter__(self):
                    return self
                
                def __next__(self):
                    try:
                        return next(self.iterator)
                    except (BrokenPipeError, OSError) as e:
                        errno = getattr(e, 'errno', None)
                        if errno == 32 or 'Broken pipe' in str(e) or 'BrokenPipeError' in str(type(e).__name__):
                            logger.warning("Client disconnected during response iteration")
                            raise StopIteration
                        raise
                
                def close(self):
                    if hasattr(self.iterator, 'close'):
                        try:
                            self.iterator.close()
                        except (BrokenPipeError, OSError) as e:
                            errno = getattr(e, 'errno', None)
                            if errno == 32 or 'Broken pipe' in str(e) or 'BrokenPipeError' in str(type(e).__name__):
                                logger.warning("Client disconnected during response close")
                                return
                            raise
            
            return SafeIterator(response_iter)
            
        except (BrokenPipeError, OSError) as e:
            # Check if it's a broken pipe error (client disconnected)
            errno = getattr(e, 'errno', None)
            if errno == 32 or 'Broken pipe' in str(e) or 'BrokenPipeError' in str(type(e).__name__):
                # Client disconnected - log as warning but don't fail
                logger.warning(f"Client disconnected during response (operation may have succeeded)")
                # Return an empty response
                if not response_sent[0]:
                    try:
                        wrapped_start_response('200 OK', [])
                    except:
                        pass
                return []
            # Re-raise other OSErrors
            raise


# Wrap the application to handle BrokenPipeError
application = BrokenPipeHandler(_base_application)

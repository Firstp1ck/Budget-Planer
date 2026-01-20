"""
URL configuration for Budget Planer project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

def handler500(request):
    """
    Custom 500 handler that returns JSON for API requests.
    This ensures API errors return JSON instead of HTML, even during server initialization.
    """
    # Check if this is an API request
    if request.path.startswith('/api/'):
        import traceback
        import sys
        exc_type, exc_value, tb = sys.exc_info()
        return JsonResponse(
            {
                'error': str(exc_value) if exc_value else 'Internal server error',
                'error_type': exc_type.__name__ if exc_type else 'UnknownError',
                'detail': 'An error occurred processing your request'
            },
            status=500
        )
    # For non-API requests, use Django's default handler
    from django.views.debug import technical_500_response
    return technical_500_response(request)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
]

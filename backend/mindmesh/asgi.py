"""
ASGI config for MindMesh project.

Routes HTTP to Django and WebSocket to Channels consumers.
"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mindmesh.settings")

# Initialize Django ASGI application first to ensure AppRegistry is populated
django_asgi_app = get_asgi_application()

from quiz.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        ),
    }
)

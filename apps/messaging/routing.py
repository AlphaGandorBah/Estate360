from django.urls import re_path
from .consumers import ConversationConsumer

websocket_urlpatterns = [
    re_path(r"^ws/conversations/(?P<pk>\d+)/$", ConversationConsumer.as_asgi()),
]

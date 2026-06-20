from django.urls import path
from .views import ConversationListView, MessageView

urlpatterns = [
    path("", ConversationListView.as_view(), name="conversation-list"),
    path("<int:pk>/messages", MessageView.as_view(), name="messages"),
]

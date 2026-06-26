from django.urls import path
from .views import ConversationDetailView, ConversationListView, MessageView

urlpatterns = [
    path("", ConversationListView.as_view(), name="conversation-list"),
    path("<int:pk>", ConversationDetailView.as_view(), name="conversation-detail"),
    path("<int:pk>/messages", MessageView.as_view(), name="messages"),
]

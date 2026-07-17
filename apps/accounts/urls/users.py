from django.urls import path
from apps.accounts.views.user_views import AvatarUploadView, MeView, PublicUserView, RequestDeletionView

urlpatterns = [
    path("me", MeView.as_view(), name="users-me"),
    path("me/avatar", AvatarUploadView.as_view(), name="users-me-avatar"),
    path("me/request-deletion", RequestDeletionView.as_view(), name="users-me-request-deletion"),
    path("<uuid:pk>/public", PublicUserView.as_view(), name="users-public"),
]

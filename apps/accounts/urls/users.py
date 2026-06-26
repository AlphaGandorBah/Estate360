from django.urls import path
from apps.accounts.views.user_views import AvatarUploadView, MeView, PublicUserView

urlpatterns = [
    path("me", MeView.as_view(), name="users-me"),
    path("me/avatar", AvatarUploadView.as_view(), name="users-me-avatar"),
    path("<uuid:pk>/public", PublicUserView.as_view(), name="users-public"),
]

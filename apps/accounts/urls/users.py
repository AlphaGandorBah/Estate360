from django.urls import path
from apps.accounts.views.user_views import MeView, PublicUserView

urlpatterns = [
    path("me", MeView.as_view(), name="users-me"),
    path("<uuid:pk>/public", PublicUserView.as_view(), name="users-public"),
]

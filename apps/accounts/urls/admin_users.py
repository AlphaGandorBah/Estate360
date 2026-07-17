from django.urls import path
from apps.accounts.views.admin_views import (
    AdminActionLogListView,
    AdminDeletionRequestListView,
    AdminDeletionRequestResolveView,
    AdminStatsView,
    AdminUserActionView,
    AdminUserDeleteView,
    AdminUserListView,
)

urlpatterns = [
    path("users/", AdminUserListView.as_view(), name="admin-users-list"),
    path("users/<uuid:pk>/action", AdminUserActionView.as_view(), name="admin-users-action"),
    path("users/<uuid:pk>", AdminUserDeleteView.as_view(), name="admin-users-delete"),
    path("stats/", AdminStatsView.as_view(), name="admin-stats"),
    path("action-log/", AdminActionLogListView.as_view(), name="admin-action-log"),
    path("deletion-requests/", AdminDeletionRequestListView.as_view(), name="admin-deletion-requests-list"),
    path("deletion-requests/<int:pk>/resolve", AdminDeletionRequestResolveView.as_view(), name="admin-deletion-requests-resolve"),
]

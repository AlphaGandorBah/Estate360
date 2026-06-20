from django.urls import path
from apps.accounts.views.admin_views import AdminStatsView, AdminUserListView

urlpatterns = [
    path("users/", AdminUserListView.as_view(), name="admin-users-list"),
    path("stats/", AdminStatsView.as_view(), name="admin-stats"),
]

from django.urls import path
from apps.accounts.views.verification_views import (
    AdminUserVerificationView,
    AdminVerificationDecisionView,
    AdminVerificationListView,
)

urlpatterns = [
    path("verifications/", AdminVerificationListView.as_view(), name="admin-verifications-list"),
    path("verifications/<int:pk>/decision", AdminVerificationDecisionView.as_view(), name="admin-verifications-decision"),
    path("users/<uuid:user_pk>/verification", AdminUserVerificationView.as_view(), name="admin-user-verification"),
]

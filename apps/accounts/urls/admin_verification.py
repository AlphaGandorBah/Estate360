from django.urls import path
from apps.accounts.views.verification_views import (
    AdminVerificationDecisionView,
    AdminVerificationListView,
)

urlpatterns = [
    path("verifications/", AdminVerificationListView.as_view(), name="admin-verifications-list"),
    path("verifications/<int:pk>/decision", AdminVerificationDecisionView.as_view(), name="admin-verifications-decision"),
]

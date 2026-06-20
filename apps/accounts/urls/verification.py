from django.urls import path
from apps.accounts.views.verification_views import (
    LandlordVerificationMeView,
    LandlordVerificationSubmitView,
)

urlpatterns = [
    path("", LandlordVerificationSubmitView.as_view(), name="verification-submit"),
    path("me", LandlordVerificationMeView.as_view(), name="verification-me"),
]

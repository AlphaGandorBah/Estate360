from django.urls import path
from apps.accounts.views.auth_views import (
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    RegisterView,
    ResendOTPView,
    VerifyEmailView,
)

urlpatterns = [
    path("register", RegisterView.as_view(), name="auth-register"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("refresh", RefreshView.as_view(), name="auth-refresh"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("verify-email", VerifyEmailView.as_view(), name="auth-verify-email"),
    path("verify-email/resend", ResendOTPView.as_view(), name="auth-verify-email-resend"),
    path("password-reset", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("password-reset/confirm", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
]

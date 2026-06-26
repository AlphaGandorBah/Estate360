"""Auth views: register, login, refresh, logout, verify-email, password reset."""
import structlog
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import EmailOTP, User
from apps.accounts.otp import (
    check_resend_cooldown,
    create_otp,
    validate_otp,
)
from apps.accounts.serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    ResendOTPSerializer,
    VerifyEmailSerializer,
)
from apps.accounts.tasks import send_otp_email_task
from apps.common.idempotency import IdempotencyMixin
from apps.common.throttles import AuthThrottle

logger = structlog.get_logger(__name__)

REFRESH_COOKIE = settings.JWT_REFRESH_COOKIE_NAME
COOKIE_MAX_AGE = settings.JWT_REFRESH_COOKIE_MAX_AGE


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path="/api/v1/auth/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, path="/api/v1/auth/")


class RegisterView(IdempotencyMixin, APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]
    throttle_scope = "auth"

    def post(self, request: Request) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user: User = serializer.save()

        # Send verification OTP
        otp = create_otp(user.email, EmailOTP.PURPOSE_VERIFY)
        send_otp_email_task.apply_async(
            args=[user.email, otp.code, EmailOTP.PURPOSE_VERIFY],
            headers={"request_id": getattr(request, "request_id", "-")},
        )

        response = Response(
            {"detail": "Account created. Check your email for the verification code."},
            status=status.HTTP_201_CREATED,
        )
        self.finalize_idempotency(request, response)
        return response


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]
    throttle_scope = "auth"

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            candidate = User.objects.get(email=serializer.validated_data["email"])
        except User.DoesNotExist:
            candidate = None

        # Check the password before revealing anything about account status,
        # so a banned/wrong-password attempt can't be told apart without
        # already knowing the correct password.
        if candidate is None or not candidate.check_password(serializer.validated_data["password"]):
            return Response(
                {"code": "invalid_credentials", "detail": "Invalid email or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not candidate.is_active:
            return Response(
                {"code": "account_banned", "detail": "Your account has been suspended. Contact support for more information."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user = candidate
        refresh = RefreshToken.for_user(user)
        avatar_url = None
        if user.avatar_key:
            from apps.common.storage import generate_presigned_url
            avatar_url = generate_presigned_url(user.avatar_key)
        response = Response(
            {
                "access": str(refresh.access_token),
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                    "avatar_url": avatar_url,
                    "is_verified": user.is_verified,
                    "is_restricted": user.is_restricted,
                },
            }
        )
        _set_refresh_cookie(response, str(refresh))
        return response


class RefreshView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]
    throttle_scope = "auth"

    def post(self, request: Request) -> Response:
        # Defense-in-depth: require X-Requested-With header
        if request.headers.get("X-Requested-With") != "estate360-web":
            return Response(
                {"code": "forbidden", "detail": "Missing X-Requested-With header."},
                status=status.HTTP_403_FORBIDDEN,
            )

        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return Response(
                {"code": "no_refresh_token", "detail": "Refresh token cookie missing."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            refresh = RefreshToken(raw_refresh)
        except TokenError as exc:
            return Response(
                {"code": "invalid_token", "detail": str(exc)},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # A banned user's refresh token is still cryptographically valid, so
        # without this check they could keep minting working access tokens
        # even though every request with one is rejected downstream anyway.
        try:
            user = User.objects.get(pk=refresh["user_id"])
        except User.DoesNotExist:
            return Response(
                {"code": "invalid_token", "detail": "User not found."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            return Response(
                {"code": "account_banned", "detail": "Your account has been suspended. Contact support for more information."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            access = str(refresh.access_token)
            # Blacklist the old token before rotating
            refresh.blacklist()
            refresh.set_jti()
            refresh.set_exp()
        except TokenError as exc:
            return Response(
                {"code": "invalid_token", "detail": str(exc)},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        response = Response({"access": access})
        _set_refresh_cookie(response, str(refresh))
        return response


class LogoutView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AuthThrottle]
    throttle_scope = "auth"

    def post(self, request: Request) -> Response:
        # Defense-in-depth header check
        if request.headers.get("X-Requested-With") != "estate360-web":
            return Response(
                {"code": "forbidden", "detail": "Missing X-Requested-With header."},
                status=status.HTTP_403_FORBIDDEN,
            )

        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass

        response = Response({"detail": "Logged out."}, status=status.HTTP_200_OK)
        _clear_refresh_cookie(response)
        self.finalize_idempotency(request, response)
        return response


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]
    throttle_scope = "auth"

    def post(self, request: Request) -> Response:
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        code = serializer.validated_data["code"]

        valid, reason = validate_otp(email, code, EmailOTP.PURPOSE_VERIFY)
        if not valid:
            messages = {
                "no_otp": "No verification code found for this email.",
                "expired": "Verification code has expired.",
                "max_attempts": "Maximum attempts reached. Request a new code.",
                "invalid_code": "Invalid verification code.",
            }
            return Response(
                {"code": reason, "detail": messages.get(reason, "Invalid code.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User.objects.filter(email=email).update(is_verified=True)
        return Response({"detail": "Email verified successfully."})


class ResendOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]
    throttle_scope = "auth"

    def post(self, request: Request) -> Response:
        serializer = ResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        if not check_resend_cooldown(email, EmailOTP.PURPOSE_VERIFY):
            return Response(
                {"code": "cooldown", "detail": "Please wait 60 seconds before requesting another code."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        otp = create_otp(email, EmailOTP.PURPOSE_VERIFY)
        send_otp_email_task.apply_async(
            args=[email, otp.code, EmailOTP.PURPOSE_VERIFY],
            headers={"request_id": getattr(request, "request_id", "-")},
        )
        return Response({"detail": "Verification code resent."})


class PasswordResetRequestView(IdempotencyMixin, APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]
    throttle_scope = "auth"

    def post(self, request: Request) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        # Always respond 200 regardless of whether email exists (anti-enumeration)
        if User.objects.filter(email=email, is_active=True).exists():
            otp = create_otp(email, EmailOTP.PURPOSE_RESET)
            send_otp_email_task.apply_async(
                args=[email, otp.code, EmailOTP.PURPOSE_RESET],
                headers={"request_id": getattr(request, "request_id", "-")},
            )

        response = Response({"detail": "If that email exists, a reset code has been sent."})
        self.finalize_idempotency(request, response)
        return response


class PasswordResetConfirmView(IdempotencyMixin, APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]
    throttle_scope = "auth"

    def post(self, request: Request) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        code = serializer.validated_data["code"]
        new_password = serializer.validated_data["new_password"]

        valid, reason = validate_otp(email, code, EmailOTP.PURPOSE_RESET)
        if not valid:
            messages = {
                "no_otp": "No reset code found for this email.",
                "expired": "Reset code has expired.",
                "max_attempts": "Maximum attempts reached.",
                "invalid_code": "Invalid reset code.",
            }
            return Response(
                {"code": reason, "detail": messages.get(reason, "Invalid code.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            return Response(
                {"code": "not_found", "detail": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])

        response = Response({"detail": "Password reset successfully."})
        self.finalize_idempotency(request, response)
        return response

"""OTP generation, validation, and email delivery helpers."""
import random
import string
from datetime import timedelta

import structlog
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import EmailOTP

logger = structlog.get_logger(__name__)


def _generate_code() -> str:
    return "".join(random.choices(string.digits, k=settings.OTP_LENGTH))


def create_otp(email: str, purpose: str) -> EmailOTP:
    """Invalidate any existing OTP for this (email, purpose) and create a fresh one."""
    EmailOTP.objects.filter(email=email, purpose=purpose, is_used=False).update(is_used=True)
    otp = EmailOTP.objects.create(
        email=email,
        code=_generate_code(),
        purpose=purpose,
        expires_at=timezone.now() + timedelta(seconds=settings.OTP_TTL_SECONDS),
    )
    return otp


def validate_otp(email: str, code: str, purpose: str) -> tuple[bool, str]:
    """
    Returns (valid, reason).
    On success marks the OTP as used.
    """
    try:
        otp = EmailOTP.objects.filter(
            email=email, purpose=purpose, is_used=False
        ).latest("created_at")
    except EmailOTP.DoesNotExist:
        return False, "no_otp"

    if timezone.now() > otp.expires_at:
        return False, "expired"

    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        return False, "max_attempts"

    otp.attempts += 1
    if otp.code != code:
        otp.save(update_fields=["attempts"])
        return False, "invalid_code"

    otp.is_used = True
    otp.save(update_fields=["attempts", "is_used"])
    return True, "ok"


def send_otp_email(email: str, code: str, purpose: str) -> None:
    subjects = {
        EmailOTP.PURPOSE_VERIFY: "Estate360 — Verify your email",
        EmailOTP.PURPOSE_RESET: "Estate360 — Password reset code",
    }
    bodies = {
        EmailOTP.PURPOSE_VERIFY: f"Your Estate360 verification code is: {code}\n\nExpires in 10 minutes.",
        EmailOTP.PURPOSE_RESET: f"Your Estate360 password reset code is: {code}\n\nExpires in 10 minutes.",
    }
    send_mail(
        subject=subjects.get(purpose, "Estate360 OTP"),
        message=bodies.get(purpose, f"Your OTP: {code}"),
        from_email=settings.EMAIL_FROM,
        recipient_list=[email],
        fail_silently=False,
    )
    logger.info("otp_email_sent", email=email, purpose=purpose)


def check_resend_cooldown(email: str, purpose: str) -> bool:
    """Return True if enough time has passed since the last OTP was sent."""
    cutoff = timezone.now() - timedelta(seconds=settings.OTP_RESEND_COOLDOWN)
    return not EmailOTP.objects.filter(
        email=email, purpose=purpose, created_at__gte=cutoff
    ).exists()

"""Async email tasks for the accounts app."""
import structlog
from celery import shared_task

logger = structlog.get_logger(__name__)


@shared_task(
    name="apps.accounts.tasks.send_otp_email",
    queue="email",
    max_retries=5,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def send_otp_email_task(email: str, code: str, purpose: str) -> None:
    from .otp import send_otp_email
    send_otp_email(email, code, purpose)


@shared_task(
    name="apps.accounts.tasks.send_verification_result",
    queue="email",
    max_retries=5,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def send_verification_result_task(user_id: str, decision: str, notes: str) -> None:
    from django.contrib.auth import get_user_model
    from django.core.mail import send_mail
    from django.conf import settings

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning("send_verification_result_user_not_found", user_id=user_id)
        return

    subject = f"Estate360 — Verification {decision}"
    body = (
        f"Hi {user.full_name},\n\n"
        f"Your identity verification has been {decision}.\n"
        f"{'Notes: ' + notes if notes else ''}\n\n"
        "Estate360 Team"
    )
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.EMAIL_FROM,
        recipient_list=[user.email],
        fail_silently=True,
    )

from celery import shared_task
import structlog

logger = structlog.get_logger(__name__)


@shared_task(
    name="apps.moderation.tasks.send_report_update_email",
    queue="email",
    max_retries=5,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def send_report_update_email(report_id: int, decision: str, notes: str) -> None:
    from django.core.mail import send_mail
    from django.conf import settings
    from .models import FraudReport

    try:
        report = FraudReport.objects.select_related("reporter").get(pk=report_id)
    except FraudReport.DoesNotExist:
        return

    send_mail(
        subject=f"Estate360 — Your report has been {decision}",
        message=(
            f"Hi {report.reporter.full_name},\n\n"
            f"Your fraud report (#{report.id}) has been {decision}.\n"
            f"{'Notes: ' + notes if notes else ''}\n\n"
            "Estate360 Team"
        ),
        from_email=settings.EMAIL_FROM,
        recipient_list=[report.reporter.email],
        fail_silently=True,
    )

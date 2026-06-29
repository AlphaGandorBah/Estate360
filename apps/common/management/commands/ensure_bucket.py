"""Management command: ensure_bucket — creates the MinIO/S3 bucket if missing."""
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.common.storage import ensure_bucket_exists


class Command(BaseCommand):
    help = "Create the object storage bucket (MEDIA_S3_BUCKET) if it doesn't already exist."

    def handle(self, *args, **options):
        ensure_bucket_exists()
        self.stdout.write(self.style.SUCCESS(f"Bucket ready: {settings.MEDIA_S3_BUCKET}"))

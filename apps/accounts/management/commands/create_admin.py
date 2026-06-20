"""Management command: create_admin — bootstraps the superuser from env vars."""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create the initial admin superuser from ADMIN_EMAIL / ADMIN_PASSWORD env vars."

    def handle(self, *args, **options):
        User = get_user_model()
        email = getattr(settings, "ADMIN_EMAIL", None) or "admin@estate360.local"
        password = getattr(settings, "ADMIN_PASSWORD", None) or "Admin@123"

        if not User.objects.filter(email=email).exists():
            User.objects.create_superuser(
                email=email,
                password=password,
                full_name="Admin",
                role="admin",
            )
            self.stdout.write(self.style.SUCCESS(f"Admin user created: {email}"))
        else:
            self.stdout.write(f"Admin user already exists: {email}")

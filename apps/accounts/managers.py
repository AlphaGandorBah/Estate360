"""Custom user manager."""
from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    def get_by_natural_key(self, email: str):
        # Email logins must be case-insensitive: Postgres text equality is
        # case-sensitive by default, and not every signup path normalizes
        # casing before saving, so an exact match can miss a real account.
        return self.get(**{f"{self.model.USERNAME_FIELD}__iexact": email})

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "admin")
        extra_fields.setdefault("is_verified", True)
        return self.create_user(email, password, **extra_fields)

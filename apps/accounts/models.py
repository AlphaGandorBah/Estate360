"""Custom User model and LandlordVerification."""
import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_TENANT = "tenant"
    ROLE_LANDLORD = "landlord"
    ROLE_AGENT = "agent"
    ROLE_ADMIN = "admin"
    PROPERTY_PROVIDER_ROLES = (ROLE_LANDLORD, ROLE_AGENT)
    ROLE_CHOICES = [
        (ROLE_TENANT, "Tenant"),
        (ROLE_LANDLORD, "Landlord"),
        (ROLE_AGENT, "Agent"),
        (ROLE_ADMIN, "Admin"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_TENANT)
    avatar_key = models.CharField(max_length=500, blank=True)
    is_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # Lighter than a ban: blocks creating listings/messaging, but the account
    # can still log in and browse. A full ban uses is_active instead, which
    # both the login backend and JWT auth already reject on every request.
    is_restricted = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    deleted_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name", "role"]

    objects = UserManager()

    class Meta:
        indexes = [models.Index(fields=["email"]), models.Index(fields=["role"])]

    def __str__(self) -> str:
        return self.email

    @property
    def is_soft_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self):
        from django.utils import timezone as tz

        self.deleted_at = tz.now()
        self.is_active = False
        self.save(update_fields=["deleted_at", "is_active"])


class LandlordVerification(models.Model):
    DOC_NATIONAL_ID = "national_id"
    DOC_DRIVERS_LICENSE = "drivers_license"
    DOC_PASSPORT = "passport"
    DOC_TYPE_CHOICES = [
        (DOC_NATIONAL_ID, "National ID"),
        (DOC_DRIVERS_LICENSE, "Driver's License"),
        (DOC_PASSPORT, "Passport"),
    ]

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="verification"
    )
    document_type = models.CharField(max_length=30, choices=DOC_TYPE_CHOICES)
    document_front_key = models.CharField(max_length=500)
    document_back_key = models.CharField(max_length=500, blank=True)
    selfie_key = models.CharField(max_length=500)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="verification_reviews",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["status"])]

    def __str__(self) -> str:
        return f"Verification({self.user.email}, {self.status})"


class AccountDeletionRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="deletion_requests"
    )
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    requested_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="deletion_request_resolutions",
    )
    resolution_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [models.Index(fields=["status"], name="accounts_de_status_idx")]

    def __str__(self) -> str:
        return f"DeletionRequest({self.user.email}, {self.status})"


class EmailOTP(models.Model):
    """Short-lived 6-digit OTP tied to an email + purpose."""
    PURPOSE_VERIFY = "verify_email"
    PURPOSE_RESET = "password_reset"
    PURPOSE_CHOICES = [
        (PURPOSE_VERIFY, "Verify Email"),
        (PURPOSE_RESET, "Password Reset"),
    ]

    email = models.EmailField()
    code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=30, choices=PURPOSE_CHOICES)
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["email", "purpose"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self) -> str:
        return f"OTP({self.email}, {self.purpose})"

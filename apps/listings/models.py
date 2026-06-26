"""Listing, SavedListing, UserInteraction, SearchPreference models."""
from django.conf import settings
from django.db import models
from django.utils import timezone

try:
    from django.contrib.postgres.indexes import GinIndex
    from django.contrib.postgres.search import SearchVectorField
    _POSTGRES = True
except ImportError:
    GinIndex = None  # type: ignore[assignment,misc]
    SearchVectorField = models.TextField  # type: ignore[assignment,misc]
    _POSTGRES = False


class LocationArea(models.TextChoices):
    ABERDEEN = "aberdeen", "Aberdeen"
    LUMLEY = "lumley", "Lumley"
    GODERICH = "goderich", "Goderich"
    HILL_STATION = "hill_station", "Hill Station"
    WILBERFORCE = "wilberforce", "Wilberforce"
    MURRAY_TOWN = "murray_town", "Murray Town"
    BROOKFIELDS = "brookfields", "Brookfields"
    KISSY = "kissy", "Kissy"
    WELLINGTON = "wellington", "Wellington"
    CALABA_TOWN = "calaba_town", "Calaba Town"
    OTHER = "other", "Other"


class PropertyType(models.TextChoices):
    APARTMENT = "apartment", "Apartment"
    HOUSE = "house", "House"
    STUDIO = "studio", "Studio"
    ROOM = "room", "Room"
    COMMERCIAL = "commercial", "Commercial"


class Currency(models.TextChoices):
    SLE = "SLE", "Sierra Leonean Leone"
    USD = "USD", "US Dollar"


class ListingStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    RENTED = "rented", "Rented"
    EXPIRED = "expired", "Expired"
    ARCHIVED = "archived", "Archived"


class Listing(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="listings",
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    property_type = models.CharField(max_length=20, choices=PropertyType.choices)
    bedrooms = models.PositiveSmallIntegerField(default=0)
    bathrooms = models.PositiveSmallIntegerField(default=0)
    price_annual = models.PositiveIntegerField()
    currency = models.CharField(max_length=5, choices=Currency.choices, default=Currency.SLE)
    location_area = models.CharField(max_length=30, choices=LocationArea.choices)
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=20, choices=ListingStatus.choices, default=ListingStatus.DRAFT)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_listings",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_notes = models.TextField(blank=True)
    search_vector = SearchVectorField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["owner"]),
            models.Index(fields=["location_area"]),
            models.Index(fields=["price_annual"]),
            *([GinIndex(fields=["search_vector"], name="listing_search_vector_idx")] if GinIndex else []),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"

    def get_bedrooms_band(self) -> str:
        if self.property_type == PropertyType.STUDIO:
            return "studio"
        if self.bedrooms <= 1:
            return "1br"
        if self.bedrooms == 2:
            return "2br"
        if self.bedrooms == 3:
            return "3br"
        return "4br_plus"


class SavedListing(models.Model):
    tenant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_listings"
    )
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="saves")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("tenant", "listing")]

    def __str__(self) -> str:
        return f"SavedListing({self.tenant_id}, {self.listing_id})"


class UserInteraction(models.Model):
    EVENT_VIEW = "view"
    EVENT_SEARCH = "search"
    EVENT_SAVE = "save"
    EVENT_INQUIRY = "inquiry"
    EVENT_CLICK = "click"
    EVENT_CHOICES = [
        (EVENT_VIEW, "View"),
        (EVENT_SEARCH, "Search"),
        (EVENT_SAVE, "Save"),
        (EVENT_INQUIRY, "Inquiry"),
        (EVENT_CLICK, "Click"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="interactions",
    )
    listing = models.ForeignKey(
        Listing, null=True, blank=True, on_delete=models.SET_NULL, related_name="interactions"
    )
    event_type = models.CharField(max_length=20, choices=EVENT_CHOICES)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "event_type"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"Interaction({self.user_id}, {self.event_type})"


class ListingAdminView(models.Model):
    """Tracks that an admin has opened a listing's detail page — required
    before they're allowed to approve/reject it. Kept separate from
    UserInteraction so moderation views never feed the tenant recommender."""

    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="admin_views")
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="listing_admin_views"
    )
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("listing", "admin")]

    def __str__(self) -> str:
        return f"ListingAdminView({self.listing_id}, {self.admin_id})"


class SearchPreference(models.Model):
    tenant = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="search_preference",
    )
    preferred_areas = models.JSONField(default=list, blank=True)
    min_price = models.PositiveIntegerField(null=True, blank=True)
    max_price = models.PositiveIntegerField(null=True, blank=True)
    min_bedrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    property_types = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"SearchPreference({self.tenant_id})"

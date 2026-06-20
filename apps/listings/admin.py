from django.contrib import admin
from .models import Listing, SavedListing, SearchPreference, UserInteraction


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ["title", "owner", "property_type", "status", "price_annual", "location_area", "created_at"]
    list_filter = ["status", "property_type", "location_area", "currency"]
    search_fields = ["title", "owner__email"]
    readonly_fields = ["search_vector", "created_at", "updated_at"]


@admin.register(SavedListing)
class SavedListingAdmin(admin.ModelAdmin):
    list_display = ["tenant", "listing", "created_at"]


@admin.register(UserInteraction)
class UserInteractionAdmin(admin.ModelAdmin):
    list_display = ["user", "listing", "event_type", "created_at"]
    list_filter = ["event_type"]


@admin.register(SearchPreference)
class SearchPreferenceAdmin(admin.ModelAdmin):
    list_display = ["tenant", "updated_at"]

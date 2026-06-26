"""Serializers for listings, saved listings, interactions, preferences."""
from rest_framework import serializers

from .models import (
    Currency,
    Listing,
    ListingStatus,
    LocationArea,
    PropertyType,
    SavedListing,
    SearchPreference,
    UserInteraction,
)


class ListingWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Listing
        fields = [
            "title",
            "description",
            "property_type",
            "bedrooms",
            "bathrooms",
            "price_annual",
            "currency",
            "location_area",
            "lat",
            "lng",
        ]

    def validate_property_type(self, value):
        if value not in PropertyType.values:
            raise serializers.ValidationError(f"Must be one of {PropertyType.values}")
        return value

    def validate_location_area(self, value):
        if value not in LocationArea.values:
            raise serializers.ValidationError(f"Must be one of {LocationArea.values}")
        return value


class PanoramaInlineSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    room_label = serializers.CharField()
    status = serializers.CharField()
    ordering = serializers.IntegerField()
    thumbnail_url = serializers.SerializerMethodField()

    def get_thumbnail_url(self, obj):
        if obj.thumbnail_key:
            from apps.common.storage import generate_presigned_url
            return generate_presigned_url(obj.thumbnail_key)
        return None


class ListingReadSerializer(serializers.ModelSerializer):
    owner_id = serializers.UUIDField(source="owner.id", read_only=True)
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    owner_verified = serializers.BooleanField(source="owner.is_verified", read_only=True)
    panoramas = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = [
            "id",
            "owner_id",
            "owner_name",
            "owner_verified",
            "title",
            "description",
            "property_type",
            "bedrooms",
            "bathrooms",
            "price_annual",
            "currency",
            "location_area",
            "lat",
            "lng",
            "status",
            "panoramas",
            "created_at",
            "updated_at",
        ]

    def get_panoramas(self, obj):
        pans = obj.panoramas.filter(status="ready").order_by("ordering")
        return PanoramaInlineSerializer(pans, many=True).data


class ListingAdminSerializer(ListingReadSerializer):
    rejection_notes = serializers.CharField(allow_blank=True, default="")
    viewed_by_me = serializers.SerializerMethodField()

    class Meta(ListingReadSerializer.Meta):
        fields = ListingReadSerializer.Meta.fields + ["rejection_notes", "viewed_by_me"]

    def get_viewed_by_me(self, obj) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.admin_views.filter(admin=request.user).exists()


class ListingDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approved", "rejected"])
    notes = serializers.CharField(required=False, allow_blank=True)


class SavedListingSerializer(serializers.ModelSerializer):
    listing = ListingReadSerializer(read_only=True)

    class Meta:
        model = SavedListing
        fields = ["id", "listing", "created_at"]


class SearchPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = SearchPreference
        fields = [
            "preferred_areas",
            "min_price",
            "max_price",
            "min_bedrooms",
            "property_types",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_preferred_areas(self, value):
        valid = set(LocationArea.values)
        for area in value:
            if area not in valid:
                raise serializers.ValidationError(f"'{area}' is not a valid area.")
        return value

    def validate_property_types(self, value):
        valid = set(PropertyType.values)
        for pt in value:
            if pt not in valid:
                raise serializers.ValidationError(f"'{pt}' is not a valid property type.")
        return value

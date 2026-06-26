"""Serializers for accounts app."""
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import LandlordVerification, User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    role = serializers.ChoiceField(choices=[User.ROLE_TENANT, User.ROLE_LANDLORD])

    class Meta:
        model = User
        fields = ["email", "full_name", "phone", "role", "password"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data["email"] = User.objects.normalize_email(validated_data["email"]).lower()
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)


class ResendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(validators=[validate_password])


def get_avatar_url(obj) -> str | None:
    if not obj.avatar_key:
        return None
    from apps.common.storage import generate_presigned_url
    return generate_presigned_url(obj.avatar_key)


class UserProfileSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "phone", "role", "avatar_url", "is_verified", "is_restricted", "date_joined"]
        read_only_fields = ["id", "email", "role", "avatar_url", "is_verified", "is_restricted", "date_joined"]

    def get_avatar_url(self, obj) -> str | None:
        return get_avatar_url(obj)


class PublicUserSerializer(serializers.ModelSerializer):
    listings_count = serializers.SerializerMethodField()
    joined_year = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "is_verified", "listings_count", "joined_year", "avatar_url"]

    def get_listings_count(self, obj) -> int:
        return obj.listings.filter(status="approved").count()

    def get_joined_year(self, obj) -> int:
        return obj.date_joined.year

    def get_avatar_url(self, obj) -> str | None:
        return get_avatar_url(obj)


class AdminUserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "phone", "role", "avatar_url",
            "is_verified", "is_active", "is_restricted", "date_joined",
        ]

    def get_avatar_url(self, obj) -> str | None:
        return get_avatar_url(obj)


class LandlordVerificationSerializer(serializers.ModelSerializer):
    document_front_url = serializers.SerializerMethodField()
    document_back_url = serializers.SerializerMethodField()
    selfie_url = serializers.SerializerMethodField()
    user_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = LandlordVerification
        fields = [
            "id",
            "user_name",
            "document_type",
            "document_front_url",
            "document_back_url",
            "selfie_url",
            "status",
            "notes",
            "submitted_at",
            "reviewed_at",
        ]
        read_only_fields = ["status", "notes", "submitted_at", "reviewed_at"]

    def _presigned(self, key: str) -> str | None:
        if not key:
            return None
        from apps.common.storage import generate_presigned_url
        return generate_presigned_url(key)

    def get_document_front_url(self, obj) -> str | None:
        return self._presigned(obj.document_front_key)

    def get_document_back_url(self, obj) -> str | None:
        return self._presigned(obj.document_back_key) if obj.document_back_key else None

    def get_selfie_url(self, obj) -> str | None:
        return self._presigned(obj.selfie_key)


class VerificationDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approved", "rejected"])
    notes = serializers.CharField(required=False, allow_blank=True)

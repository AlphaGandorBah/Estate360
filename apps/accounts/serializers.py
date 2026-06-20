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


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "full_name", "phone", "role", "is_verified", "date_joined"]
        read_only_fields = ["id", "email", "role", "is_verified", "date_joined"]


class PublicUserSerializer(serializers.ModelSerializer):
    listings_count = serializers.SerializerMethodField()
    joined_year = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "is_verified", "listings_count", "joined_year"]

    def get_listings_count(self, obj) -> int:
        return obj.listings.filter(status="approved").count()

    def get_joined_year(self, obj) -> int:
        return obj.date_joined.year


class AdminUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "full_name", "phone", "role", "is_verified", "is_active", "date_joined"]


class LandlordVerificationSerializer(serializers.ModelSerializer):
    document_front_url = serializers.SerializerMethodField()
    document_back_url = serializers.SerializerMethodField()
    selfie_url = serializers.SerializerMethodField()

    class Meta:
        model = LandlordVerification
        fields = [
            "id",
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

"""Role-based permission classes used across the project."""
from rest_framework.permissions import BasePermission, IsAuthenticated

from apps.accounts.models import User


class IsLandlord(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == User.ROLE_LANDLORD


class IsVerifiedLandlord(IsAuthenticated):
    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and request.user.role == User.ROLE_LANDLORD
            and request.user.is_verified
        )


class IsPropertyProvider(IsAuthenticated):
    """Allow landlords and agents who advertise properties."""

    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and request.user.role in User.PROPERTY_PROVIDER_ROLES
        )


class IsVerifiedPropertyProvider(IsPropertyProvider):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.is_verified


class IsTenant(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == User.ROLE_TENANT


class IsTenantOrLandlord(IsAuthenticated):
    """Allow both tenants and landlords (not admins) to access a view."""
    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and request.user.role in (User.ROLE_TENANT, User.ROLE_LANDLORD)
        )


class IsTenantOrPropertyProvider(IsAuthenticated):
    """Allow all public account roles while excluding administrators."""

    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and request.user.role
            in (User.ROLE_TENANT, User.ROLE_LANDLORD, User.ROLE_AGENT)
        )


class IsVerifiedUser(IsAuthenticated):
    """Require the authenticated user (any role) to be verified."""
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.is_verified


class IsAdminRole(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == User.ROLE_ADMIN


class IsOwnerOrReadOnly(BasePermission):
    """Allow object mutation only to the owner; GET/HEAD/OPTIONS are open."""
    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        owner = getattr(obj, "owner", None) or getattr(obj, "user", None)
        return owner == request.user


class IsConversationParticipant(IsAuthenticated):
    def has_object_permission(self, request, view, obj):
        # Support conversations are a shared inbox: any admin counts as a
        # participant, not just whichever admin happens to reply first.
        if obj.is_support and request.user.role == User.ROLE_ADMIN:
            return True
        return request.user in (obj.initiator, obj.landlord)

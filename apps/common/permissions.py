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


class IsTenant(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == User.ROLE_TENANT


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
        return request.user in (obj.tenant, obj.landlord)

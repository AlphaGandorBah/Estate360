"""GET /recommendations"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsTenant
from apps.common.throttles import ReadThrottle
from apps.listings.models import Listing
from apps.listings.serializers import ListingReadSerializer


class RecommendationsView(APIView):
    permission_classes = [IsTenant]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request) -> Response:
        from .model import cold_start_ids, load_model, score_for_user

        model = load_model()
        listing_ids: list[int] = []

        if model:
            listing_ids = score_for_user(request.user, model)

        if not listing_ids:
            listing_ids = cold_start_ids(request.user)

        # Fetch listings preserving rank order
        listings_map = {
            l.id: l
            for l in Listing.objects.filter(id__in=listing_ids).select_related("owner")
        }
        listings = [listings_map[lid] for lid in listing_ids if lid in listings_map]

        return Response(ListingReadSerializer(listings, many=True).data)

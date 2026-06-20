"""GET /preferences/me  PUT /preferences"""
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.idempotency import IdempotencyMixin
from apps.common.permissions import IsTenant
from apps.common.throttles import ReadThrottle
from apps.listings.models import SearchPreference
from apps.listings.serializers import SearchPreferenceSerializer


class PreferenceView(IdempotencyMixin, APIView):
    def get_permissions(self):
        return [IsTenant()]

    def get_throttles(self):
        if self.request.method == "GET":
            return [ReadThrottle()]
        return super().get_throttles()

    def get(self, request: Request) -> Response:
        try:
            pref = request.user.search_preference
        except SearchPreference.DoesNotExist:
            return Response({})
        return Response(SearchPreferenceSerializer(pref).data)

    def put(self, request: Request) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        pref, _ = SearchPreference.objects.get_or_create(tenant=request.user)
        serializer = SearchPreferenceSerializer(pref, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        response = Response(serializer.data)
        self.finalize_idempotency(request, response)
        return response

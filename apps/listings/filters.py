"""django-filter FilterSet for GET /listings."""
import django_filters
from django.db import models
from django.db.models import QuerySet

try:
    from django.contrib.postgres.search import SearchQuery, SearchRank
except ImportError:
    SearchQuery = None  # type: ignore[assignment,misc]
    SearchRank = None   # type: ignore[assignment,misc]

from .models import Currency, Listing, LocationArea, PropertyType


class ListingFilter(django_filters.FilterSet):
    q = django_filters.CharFilter(method="filter_full_text", label="Full-text search")
    owner_id = django_filters.UUIDFilter(field_name="owner_id")
    area = django_filters.MultipleChoiceFilter(
        field_name="location_area",
        choices=LocationArea.choices,
        label="Area(s)",
    )
    min_price = django_filters.NumberFilter(field_name="price_annual", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="price_annual", lookup_expr="lte")
    min_bedrooms = django_filters.NumberFilter(field_name="bedrooms", lookup_expr="gte")
    max_bedrooms = django_filters.NumberFilter(field_name="bedrooms", lookup_expr="lte")
    property_type = django_filters.MultipleChoiceFilter(
        field_name="property_type",
        choices=PropertyType.choices,
    )
    currency = django_filters.ChoiceFilter(choices=Currency.choices)
    sort = django_filters.OrderingFilter(
        fields={
            "created_at": "created_at",
            "price_annual": "price_annual",
            "bedrooms": "bedrooms",
        },
        field_labels={
            "created_at": "Oldest first",
            "-created_at": "Newest first",
            "price_annual": "Price low-high",
            "-price_annual": "Price high-low",
            "bedrooms": "Bedrooms (asc)",
            "-bedrooms": "Bedrooms (desc)",
        },
    )

    class Meta:
        model = Listing
        fields: list = []

    def filter_full_text(self, queryset: QuerySet, name: str, value: str) -> QuerySet:
        if not value:
            return queryset
        from django.db import connection
        if connection.vendor != "postgresql":
            # SQLite fallback for tests — simple icontains on title/description
            return queryset.filter(
                models.Q(title__icontains=value) | models.Q(description__icontains=value)
            )
        query = SearchQuery(value, config="english")
        return (
            queryset.filter(search_vector=query)
            .annotate(rank=SearchRank("search_vector", query))
            .order_by("-rank")
        )

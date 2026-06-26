from django.urls import path
from apps.listings.views import (
    ListingDetailView,
    ListingListCreateView,
    ListingSubmitView,
    SaveListingView,
)
from apps.panoramas.views import PanoramaListCreateView

urlpatterns = [
    path("", ListingListCreateView.as_view(), name="listing-list-create"),
    path("<int:pk>", ListingDetailView.as_view(), name="listing-detail"),
    path("<int:pk>/submit", ListingSubmitView.as_view(), name="listing-submit"),
    path("<int:pk>/panoramas", PanoramaListCreateView.as_view(), name="listing-panoramas"),
    path("<int:pk>/save", SaveListingView.as_view(), name="listing-save"),
]

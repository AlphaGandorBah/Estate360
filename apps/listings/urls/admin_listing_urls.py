from django.urls import path
from apps.listings.views import AdminListingDecisionView, AdminListingListView

urlpatterns = [
    path("listings/", AdminListingListView.as_view(), name="admin-listing-list"),
    path("listings/<int:pk>/decision", AdminListingDecisionView.as_view(), name="admin-listing-decision"),
]

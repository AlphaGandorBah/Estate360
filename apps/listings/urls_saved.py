from django.urls import path
from apps.listings.views import SavedListingsView

urlpatterns = [
    path("", SavedListingsView.as_view(), name="saved-listings"),
]

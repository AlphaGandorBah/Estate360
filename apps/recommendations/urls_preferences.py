from django.urls import path
from .views_preferences import PreferenceView

urlpatterns = [
    path("me", PreferenceView.as_view(), name="preferences-me"),
    path("set", PreferenceView.as_view(), name="preferences-set"),
]

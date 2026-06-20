from django.urls import path
from .views import PanoramaDetailView

urlpatterns = [
    path("<int:pk>", PanoramaDetailView.as_view(), name="panorama-detail"),
]

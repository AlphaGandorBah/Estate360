from django.urls import path
from .views import FraudReportSubmitView

urlpatterns = [
    path("", FraudReportSubmitView.as_view(), name="report-submit"),
]

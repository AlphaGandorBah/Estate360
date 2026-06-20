from django.urls import path
from .views import AdminReportDecisionView, AdminReportListView

urlpatterns = [
    path("reports/", AdminReportListView.as_view(), name="admin-report-list"),
    path("reports/<int:pk>/resolve", AdminReportDecisionView.as_view(), name="admin-report-resolve"),
]

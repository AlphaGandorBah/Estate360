from django.contrib import admin
from .models import FraudReport


@admin.register(FraudReport)
class FraudReportAdmin(admin.ModelAdmin):
    list_display = ["id", "reporter", "reason", "status", "listing", "reported_user", "created_at"]
    list_filter = ["status", "reason"]
    search_fields = ["reporter__email", "description"]

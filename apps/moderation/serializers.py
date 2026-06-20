from rest_framework import serializers
from .models import FraudReport


class FraudReportSerializer(serializers.ModelSerializer):
    reporter_id = serializers.UUIDField(source="reporter.id", read_only=True)

    class Meta:
        model = FraudReport
        fields = [
            "id",
            "reporter_id",
            "listing_id",
            "reported_user_id",
            "reason",
            "description",
            "status",
            "resolution_notes",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = ["id", "reporter_id", "status", "resolution_notes", "created_at", "resolved_at"]


class SubmitReportSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=FraudReport.REASON_CHOICES)
    description = serializers.CharField(min_length=10)
    listing_id = serializers.IntegerField(required=False, allow_null=True)
    reported_user_id = serializers.UUIDField(required=False, allow_null=True)


class ReportDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["resolved", "dismissed"])
    notes = serializers.CharField(required=False, allow_blank=True)

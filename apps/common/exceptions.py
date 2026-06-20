"""Custom DRF exception handler that produces a consistent error envelope."""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        return None

    data = response.data
    if isinstance(data, dict) and "detail" in data and len(data) == 1:
        # Simple detail string — wrap it
        code = getattr(exc, "default_code", "error")
        response.data = {"code": code, "detail": data["detail"]}
    elif isinstance(data, dict) and "non_field_errors" in data:
        response.data = {
            "code": "validation_error",
            "detail": "Validation failed.",
            "errors": data,
        }
    elif isinstance(data, dict) and "detail" not in data:
        response.data = {
            "code": "validation_error",
            "detail": "Body validation failed.",
            "errors": data,
        }

    return response

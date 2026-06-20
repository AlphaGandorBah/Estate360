"""Custom middleware: request IDs and structlog context binding."""
import uuid

import structlog

logger = structlog.get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware:
    """Reads or generates an X-Request-ID and stores it on the request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.request_id = request_id
        response = self.get_response(request)
        response[REQUEST_ID_HEADER] = request_id
        return response


class StructlogMiddleware:
    """Binds request metadata into structlog context for every request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=getattr(request, "request_id", "-"),
            method=request.method,
            path=request.path,
            user_id=str(request.user.pk) if hasattr(request, "user") and request.user.is_authenticated else None,
        )
        response = self.get_response(request)
        structlog.contextvars.bind_contextvars(status_code=response.status_code)
        logger.info("request_handled")
        return response

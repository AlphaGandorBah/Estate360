"""Idempotency enforcement mixin for DRF views."""
import json
import uuid
from typing import Optional

import structlog
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from .models import IdempotencyKey

logger = structlog.get_logger(__name__)

IDEMPOTENCY_HEADER = "Idempotency-Key"


class IdempotencyMixin:
    """
    Mixin for ViewSets/APIViews that enforces idempotency on POST/PUT.

    Add to view classes that handle retry-prone mutations. The view's
    `perform_create` / handler must call `self.set_idempotency_done(response)`
    after building the final Response.
    """

    def _get_idempotency_key(self, request: Request) -> Optional[uuid.UUID]:
        raw = request.headers.get(IDEMPOTENCY_HEADER)
        if not raw:
            return None
        try:
            return uuid.UUID(raw)
        except ValueError:
            return None

    def enforce_idempotency(self, request: Request) -> Optional[Response]:
        """
        Call at the top of any idempotent handler.
        Returns a Response to short-circuit if the key was seen before,
        or None if the handler should proceed.
        """
        key = self._get_idempotency_key(request)
        if key is None:
            return None

        user = request.user if request.user.is_authenticated else None
        body_hash = IdempotencyKey.compute_hash(request.body)

        # Try to fetch existing record
        qs = IdempotencyKey.objects.filter(key=key)
        if user:
            qs = qs.filter(user=user)
        else:
            qs = qs.filter(user__isnull=True)

        existing = qs.first()

        if existing:
            if existing.status == IdempotencyKey.STATUS_IN_PROGRESS:
                return Response(
                    {"code": "conflict", "detail": "Request is already being processed."},
                    status=status.HTTP_409_CONFLICT,
                )
            if existing.request_hash != body_hash:
                return Response(
                    {"code": "idempotency_mismatch", "detail": "Body differs from original request."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
            # Replay stored response
            return Response(
                existing.response_body,
                status=existing.response_status,
            )

        # Claim the key
        try:
            with transaction.atomic():
                record = IdempotencyKey.objects.create(
                    key=key,
                    user=user,
                    request_hash=body_hash,
                    status=IdempotencyKey.STATUS_IN_PROGRESS,
                    expires_at=IdempotencyKey.default_expiry(),
                )
                request._idempotency_record = record
        except IntegrityError:
            # Lost the race — record created by a concurrent request
            return Response(
                {"code": "conflict", "detail": "Request is already being processed."},
                status=status.HTTP_409_CONFLICT,
            )

        return None  # proceed

    def finalize_idempotency(self, request: Request, response: Response) -> None:
        """Call after the handler builds its Response to persist the outcome."""
        record: Optional[IdempotencyKey] = getattr(request, "_idempotency_record", None)
        if record is None:
            return
        try:
            IdempotencyKey.objects.filter(pk=record.pk).update(
                status=IdempotencyKey.STATUS_DONE,
                response_status=response.status_code,
                response_body=response.data,
            )
        except Exception:
            logger.exception("idempotency_finalize_failed", key=str(record.key))

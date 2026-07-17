"""S3-compatible storage client and presigned URL helpers."""
from urllib.parse import quote

import boto3
import structlog
from boto3.exceptions import S3UploadFailedError
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings

logger = structlog.get_logger(__name__)

_s3_client = None
_s3_presign_client = None


class ObjectStorageUnavailableError(RuntimeError):
    """Raised when an object cannot be persisted to configured storage."""


def _is_missing_bucket(exc: BaseException) -> bool:
    """Inspect direct and boto3-wrapped client errors for NoSuchBucket."""
    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, ClientError):
            error = current.response.get("Error", {})
            metadata = current.response.get("ResponseMetadata", {})
            return error.get("Code") in {"404", "NoSuchBucket", "NotFound"} or (
                metadata.get("HTTPStatusCode") == 404
            )
        current = current.__cause__ or current.__context__
    return False


def _create_s3_client(endpoint_url: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.MEDIA_S3_ACCESS_KEY,
        aws_secret_access_key=settings.MEDIA_S3_SECRET_KEY,
        region_name=settings.MEDIA_S3_REGION,
        config=Config(signature_version="s3v4"),
    )


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = _create_s3_client(settings.MEDIA_S3_ENDPOINT)
    return _s3_client


def get_s3_presign_client():
    """Return a client that signs URLs for the browser-reachable media host."""
    global _s3_presign_client
    if _s3_presign_client is None:
        _s3_presign_client = _create_s3_client(settings.MEDIA_HOST)
    return _s3_presign_client


def upload_file(key: str, file_obj, content_type: str = "application/octet-stream") -> None:
    """Upload a file-like object, creating a missing development bucket once.

    A fresh MinIO volume has no buckets.  Uploads used to fail with an opaque
    500 unless ``ensure_bucket`` had been run manually first.  Recovering from
    ``NoSuchBucket`` here keeps every upload entry point safe while still
    surfacing credentials, networking, and permission failures to callers.
    """
    client = get_s3_client()

    def _upload() -> None:
        client.upload_fileobj(
            file_obj,
            settings.MEDIA_S3_BUCKET,
            key,
            ExtraArgs={"ContentType": content_type},
        )

    try:
        _upload()
    except (ClientError, S3UploadFailedError) as exc:
        if not _is_missing_bucket(exc):
            logger.error("s3_upload_failed", key=key, error=str(exc))
            raise ObjectStorageUnavailableError("Object storage upload failed.") from exc

        # Bucket creation is intentionally attempted only for a confirmed
        # missing bucket.  AccessDenied and other configuration errors must not
        # be mistaken for an absent bucket.
        try:
            ensure_bucket_exists()
            file_obj.seek(0)
            _upload()
        except (BotoCoreError, ClientError, S3UploadFailedError, OSError) as retry_exc:
            logger.error("s3_upload_failed", key=key, error=str(retry_exc))
            raise ObjectStorageUnavailableError("Object storage upload failed.") from retry_exc
    except (BotoCoreError, OSError) as exc:
        logger.error("s3_upload_failed", key=key, error=str(exc))
        raise ObjectStorageUnavailableError("Object storage upload failed.") from exc

    logger.info("s3_upload", key=key, bucket=settings.MEDIA_S3_BUCKET)


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    """Upload raw bytes to object storage."""
    import io
    upload_file(key, io.BytesIO(data), content_type)


def delete_file(key: str) -> None:
    """Delete an object from storage. Swallows NoSuchKey errors."""
    client = get_s3_client()
    try:
        client.delete_object(Bucket=settings.MEDIA_S3_BUCKET, Key=key)
        logger.info("s3_delete", key=key)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "NoSuchKey":
            raise


def generate_presigned_url(key: str, expiry: int | None = None) -> str:
    """Return a presigned GET URL for the given storage key."""
    if expiry is None:
        expiry = settings.PRESIGNED_URL_EXPIRY
    client = get_s3_presign_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.MEDIA_S3_BUCKET, "Key": key},
        ExpiresIn=expiry,
    )
    return url


def public_media_url(key: str) -> str | None:
    """Return a same-origin URL for a public panorama asset."""
    if not key:
        return None
    return f"/api/v1/media/{quote(key, safe='/')}"


def ensure_bucket_exists() -> None:
    """Create the bucket if it does not exist (useful in dev/test)."""
    client = get_s3_client()
    bucket = settings.MEDIA_S3_BUCKET
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as exc:
        if not _is_missing_bucket(exc):
            raise
        try:
            client.create_bucket(Bucket=bucket)
            logger.info("s3_bucket_created", bucket=bucket)
        except ClientError as create_exc:
            # Another process may create the bucket between our HEAD and
            # CREATE calls.  Treat that race as success.
            code = create_exc.response.get("Error", {}).get("Code")
            if code not in {"BucketAlreadyExists", "BucketAlreadyOwnedByYou"}:
                raise

"""S3-compatible storage client and presigned URL helpers."""
import structlog
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from django.conf import settings

logger = structlog.get_logger(__name__)

_s3_client = None


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.MEDIA_S3_ENDPOINT,
            aws_access_key_id=settings.MEDIA_S3_ACCESS_KEY,
            aws_secret_access_key=settings.MEDIA_S3_SECRET_KEY,
            region_name=settings.MEDIA_S3_REGION,
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


def upload_file(key: str, file_obj, content_type: str = "application/octet-stream") -> None:
    """Upload a file-like object to object storage."""
    client = get_s3_client()
    client.upload_fileobj(
        file_obj,
        settings.MEDIA_S3_BUCKET,
        key,
        ExtraArgs={"ContentType": content_type},
    )
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
    client = get_s3_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.MEDIA_S3_BUCKET, "Key": key},
        ExpiresIn=expiry,
    )
    return url


def ensure_bucket_exists() -> None:
    """Create the bucket if it does not exist (useful in dev/test)."""
    client = get_s3_client()
    bucket = settings.MEDIA_S3_BUCKET
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError:
        client.create_bucket(Bucket=bucket)
        logger.info("s3_bucket_created", bucket=bucket)

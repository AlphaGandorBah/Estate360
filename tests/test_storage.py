"""Tests for internal and browser-facing object-storage endpoints."""
import io
from unittest.mock import Mock
from urllib.parse import urlparse

import pytest
from boto3.exceptions import S3UploadFailedError
from botocore.exceptions import ClientError, EndpointConnectionError
from django.conf import settings
from django.test import override_settings

from apps.common import storage


@pytest.fixture(autouse=True)
def _reset_s3_clients(monkeypatch):
    monkeypatch.setattr(storage, "_s3_client", None)
    monkeypatch.setattr(storage, "_s3_presign_client", None)


@override_settings(
    MEDIA_S3_ENDPOINT="http://minio:9000",
    MEDIA_HOST="http://media.example.test:9000",
)
def test_presigned_url_uses_browser_reachable_media_host():
    url = storage.generate_presigned_url("panoramas/42/preview.jpg", expiry=300)

    assert urlparse(url).netloc == "media.example.test:9000"


@override_settings(
    MEDIA_S3_ENDPOINT="http://minio:9000",
    MEDIA_HOST="http://media.example.test:9000",
)
def test_storage_operations_keep_using_internal_endpoint():
    assert storage.get_s3_client().meta.endpoint_url == "http://minio:9000"
    assert storage.get_s3_presign_client().meta.endpoint_url == "http://media.example.test:9000"


def _client_error(code: str, status: int) -> ClientError:
    return ClientError(
        {
            "Error": {"Code": code, "Message": code},
            "ResponseMetadata": {"HTTPStatusCode": status},
        },
        "PutObject",
    )


def test_upload_creates_a_missing_bucket_and_rewinds_the_file(monkeypatch):
    client = Mock()
    payloads = []
    missing_bucket = _client_error("NoSuchBucket", 404)

    def upload(file_obj, *_args, **_kwargs):
        payloads.append(file_obj.read())
        if len(payloads) == 1:
            raise missing_bucket

    client.upload_fileobj.side_effect = upload
    client.head_bucket.side_effect = missing_bucket
    monkeypatch.setattr(storage, "_s3_client", client)

    storage.upload_file("verifications/front/test.jpg", io.BytesIO(b"id-bytes"), "image/jpeg")

    assert payloads == [b"id-bytes", b"id-bytes"]
    client.create_bucket.assert_called_once_with(Bucket=settings.MEDIA_S3_BUCKET)


def test_upload_recovers_when_boto3_wraps_missing_bucket(monkeypatch):
    client = Mock()
    missing_bucket = _client_error("NoSuchBucket", 404)
    wrapped = S3UploadFailedError("Failed to upload: NoSuchBucket")
    wrapped.__cause__ = missing_bucket
    client.upload_fileobj.side_effect = [wrapped, None]
    client.head_bucket.side_effect = missing_bucket
    monkeypatch.setattr(storage, "_s3_client", client)

    storage.upload_file("verifications/front/test.jpg", io.BytesIO(b"id-bytes"))

    assert client.upload_fileobj.call_count == 2
    client.create_bucket.assert_called_once_with(Bucket=settings.MEDIA_S3_BUCKET)


def test_upload_surfaces_storage_connectivity_failure(monkeypatch):
    client = Mock()
    client.upload_fileobj.side_effect = EndpointConnectionError(
        endpoint_url="http://minio:9000"
    )
    monkeypatch.setattr(storage, "_s3_client", client)

    with pytest.raises(storage.ObjectStorageUnavailableError):
        storage.upload_file("verifications/front/test.jpg", io.BytesIO(b"id-bytes"))


def test_access_denied_is_not_treated_as_a_missing_bucket(monkeypatch):
    client = Mock()
    client.upload_fileobj.side_effect = _client_error("AccessDenied", 403)
    monkeypatch.setattr(storage, "_s3_client", client)

    with pytest.raises(storage.ObjectStorageUnavailableError):
        storage.upload_file("verifications/front/test.jpg", io.BytesIO(b"id-bytes"))

    client.head_bucket.assert_not_called()
    client.create_bucket.assert_not_called()

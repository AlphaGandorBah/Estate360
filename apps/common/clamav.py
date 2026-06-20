"""ClamAV scanning wrapper. Returns 503 if the service is unavailable."""
import structlog
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException

logger = structlog.get_logger(__name__)


class AntivirusUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Antivirus service is unavailable. Upload rejected."
    default_code = "antivirus_unavailable"


class MalwareDetected(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Malware detected in uploaded file."
    default_code = "malware_detected"


def scan_file(file_obj) -> None:
    """
    Scan a file-like object with ClamAV.
    Raises AntivirusUnavailable if ClamAV is down.
    Raises MalwareDetected if the file is infected.
    Does nothing if CLAMAV_HOST is None (test environments).
    """
    host = getattr(settings, "CLAMAV_HOST", None)
    if not host:
        logger.info("clamav_skipped", reason="no host configured")
        return

    try:
        import pyclamd  # type: ignore[import]
        cd = pyclamd.ClamdNetworkSocket(host=host, port=settings.CLAMAV_PORT)
        cd.ping()
    except Exception as exc:
        logger.error("clamav_connection_failed", error=str(exc))
        raise AntivirusUnavailable()

    file_obj.seek(0)
    result = cd.scan_stream(file_obj.read())
    file_obj.seek(0)

    if result:
        threat = list(result.values())[0][1]
        logger.warning("clamav_malware_detected", threat=threat)
        raise MalwareDetected(detail=f"Malware detected: {threat}")

    logger.info("clamav_clean")

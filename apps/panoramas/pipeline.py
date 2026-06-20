"""
Panorama processing pipeline:
validate → ClamAV scan → strip EXIF → detect projection →
run Pannellum tiler → upload tiles → update status.
"""
import io
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import piexif
import structlog
from django.conf import settings
from PIL import Image

from apps.common.clamav import scan_file
from apps.common.storage import upload_bytes, upload_file

logger = structlog.get_logger(__name__)

ALLOWED_MIME = {"image/jpeg", "image/png"}
MAX_SIZE = settings.PANORAMA_MAX_SIZE_BYTES
MIN_W = settings.PANORAMA_MIN_WIDTH
MAX_LONG = settings.PANORAMA_MAX_LONG_EDGE


def detect_projection(width: int, height: int) -> str:
    ratio = width / height
    if abs(ratio - 2.0) <= 0.1:
        return "equirectangular"
    if abs(ratio - 4.0) <= 0.1:
        return "cylindrical"
    # Fallback: closest match
    return "equirectangular" if abs(ratio - 2.0) < abs(ratio - 4.0) else "cylindrical"


def validate_image(file_obj, content_type: str, size: int) -> tuple[int, int, str]:
    """Validate, return (width, height, projection). Raises ValueError on failure."""
    if content_type not in ALLOWED_MIME:
        raise ValueError(f"File type {content_type} not allowed. Use JPG or PNG.")
    if size > MAX_SIZE:
        raise ValueError(f"File exceeds {MAX_SIZE // (1024 * 1024)} MB limit.")

    file_obj.seek(0)
    img = Image.open(file_obj)
    img.verify()
    file_obj.seek(0)
    img = Image.open(file_obj)
    w, h = img.size

    if w < MIN_W:
        raise ValueError(f"Image width {w}px is below minimum {MIN_W}px.")

    projection = detect_projection(w, h)
    min_h = settings.PANORAMA_MIN_HEIGHT_EQUIRECT if projection == "equirectangular" else settings.PANORAMA_MIN_HEIGHT_CYLINDRICAL
    if h < min_h:
        raise ValueError(f"Image height {h}px is below minimum {min_h}px for {projection}.")

    long_edge = max(w, h)
    if long_edge > MAX_LONG:
        raise ValueError(f"Long edge {long_edge}px exceeds maximum {MAX_LONG}px.")

    return w, h, projection


def strip_exif(file_obj) -> bytes:
    """Return JPEG bytes with EXIF stripped. PNG passes through unchanged."""
    file_obj.seek(0)
    img = Image.open(file_obj)
    buf = io.BytesIO()

    if img.format == "JPEG":
        file_obj.seek(0)
        data = file_obj.read()
        try:
            data = piexif.remove(data)
        except Exception:
            pass
        buf.write(data)
    else:
        img.save(buf, format="PNG")

    buf.seek(0)
    return buf.read()


def generate_thumbnail(file_obj, size=(800, 400)) -> bytes:
    file_obj.seek(0)
    img = Image.open(file_obj)
    img.thumbnail(size, Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def run_pannellum_tiler(image_path: str, output_dir: str) -> None:
    """Run the vendored Pannellum multires tile generator."""
    tiler_path = Path(settings.BASE_DIR) / "tools" / "pannellum_tiler" / "generate.py"
    result = subprocess.run(
        ["python", str(tiler_path), image_path, "--output", output_dir],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Pannellum tiler failed: {result.stderr}")


def upload_tile_tree(panorama_id: int, tile_dir: str) -> str:
    """Walk tile_dir, upload every file, return the tiles_prefix."""
    prefix = f"panoramas/{panorama_id}/tiles"
    for root, _, files in os.walk(tile_dir):
        for fname in files:
            local_path = os.path.join(root, fname)
            rel = os.path.relpath(local_path, tile_dir)
            key = f"{prefix}/{rel.replace(os.sep, '/')}"
            ctype = "application/json" if fname.endswith(".json") else "image/jpeg"
            with open(local_path, "rb") as f:
                upload_file(key, f, content_type=ctype)
    return prefix


def process_panorama(panorama_id: int, file_obj, content_type: str, file_size: int) -> None:
    """
    Full pipeline. Called by the Celery task.
    Raises on any failure; caller updates status.
    """
    from .models import Panorama

    panorama = Panorama.objects.get(pk=panorama_id)
    panorama.status = Panorama.STATUS_PROCESSING
    panorama.save(update_fields=["status"])

    # 1. Validate
    w, h, projection = validate_image(file_obj, content_type, file_size)
    logger.info("panorama_validated", panorama_id=panorama_id, w=w, h=h, projection=projection)

    # 2. ClamAV scan
    scan_file(file_obj)

    # 3. Strip EXIF
    clean_bytes = strip_exif(file_obj)
    file_obj.seek(0)

    # 4. Upload original (kept 30 days)
    original_key = f"panoramas/{panorama_id}/original.jpg"
    upload_bytes(original_key, clean_bytes, content_type="image/jpeg")

    # 5. Thumbnail
    thumb_bytes = generate_thumbnail(io.BytesIO(clean_bytes))
    thumbnail_key = f"panoramas/{panorama_id}/thumbnail.jpg"
    upload_bytes(thumbnail_key, thumb_bytes, content_type="image/jpeg")

    # Preview (larger than thumbnail)
    preview_bytes = generate_thumbnail(io.BytesIO(clean_bytes), size=(1920, 960))
    preview_key = f"panoramas/{panorama_id}/preview.jpg"
    upload_bytes(preview_key, preview_bytes, content_type="image/jpeg")

    # 6. Run tiler in temp dir
    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, "source.jpg")
        with open(src_path, "wb") as f:
            f.write(clean_bytes)

        tile_out = os.path.join(tmpdir, "tiles")
        os.makedirs(tile_out, exist_ok=True)

        try:
            run_pannellum_tiler(src_path, tile_out)
            tiles_prefix = upload_tile_tree(panorama_id, tile_out)
        except Exception as exc:
            logger.warning("pannellum_tiler_unavailable", error=str(exc), panorama_id=panorama_id)
            # Fallback: mark ready without tiles (viewer falls back to preview)
            tiles_prefix = ""

    # 7. Mark ready
    Panorama.objects.filter(pk=panorama_id).update(
        status=Panorama.STATUS_READY,
        projection=projection,
        original_key=original_key,
        tiles_prefix=tiles_prefix,
        thumbnail_key=thumbnail_key,
        preview_key=preview_key,
        failure_reason="",
    )

    # 8. Push panorama.ready notification to listing owner
    panorama.refresh_from_db()
    from apps.notifications.utils import create_notification
    create_notification(
        user=panorama.listing.owner,
        notif_type="panorama_ready",
        payload={"panorama_id": panorama_id, "listing_id": panorama.listing_id},
    )
    logger.info("panorama_ready", panorama_id=panorama_id)

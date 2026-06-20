"""
Content-based recommender using TF-IDF over listing attributes.

Feature vector per listing:
  title + description + location_area + property_type + bedrooms_band

Model storage:
  <MEDIA_ROOT>/recommender/model-<sha>.pkl  — fitted vectorizer + listing matrix
  <MEDIA_ROOT>/recommender/current.pkl      — symlink to latest
"""
import hashlib
import hmac
import os
import pickle
from pathlib import Path
from typing import Optional

import numpy as np
import structlog
from django.conf import settings

logger = structlog.get_logger(__name__)


def _model_dir() -> Path:
    d = Path(settings.RECOMMENDER_MODEL_DIR)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _current_symlink() -> Path:
    return _model_dir() / "current.pkl"


def _listing_text(listing) -> str:
    band = listing.get_bedrooms_band() if hasattr(listing, "get_bedrooms_band") else ""
    return " ".join(filter(None, [
        listing.title,
        listing.description,
        listing.location_area,
        listing.property_type,
        band,
    ]))


def build_model() -> dict:
    """Fit the TF-IDF vectorizer over all approved listings and pickle it."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from apps.listings.models import Listing, ListingStatus

    listings = list(
        Listing.objects.filter(status=ListingStatus.APPROVED).only(
            "id", "title", "description", "location_area", "property_type", "bedrooms"
        )
    )

    if not listings:
        logger.warning("recommender_no_listings")
        return {}

    corpus = [_listing_text(l) for l in listings]
    listing_ids = [l.id for l in listings]

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), lowercase=True, sublinear_tf=True)
    matrix = vectorizer.fit_transform(corpus)

    model = {
        "vectorizer": vectorizer,
        "matrix": matrix,
        "listing_ids": listing_ids,
    }

    # Persist with HMAC signature to prevent loading tampered files
    raw = pickle.dumps(model)
    sha = hashlib.sha256(raw).hexdigest()[:12]
    sig = hmac.new(settings.SECRET_KEY.encode(), raw, hashlib.sha256).digest()
    model_path = _model_dir() / f"model-{sha}.pkl"
    with open(model_path, "wb") as f:
        f.write(sig)
        f.write(raw)

    # Atomically update current pointer (symlink on Unix; copy-replace fallback on Windows)
    current = _current_symlink()
    tmp_link = str(current) + ".tmp"
    if os.path.exists(tmp_link):
        os.remove(tmp_link)
    try:
        os.symlink(str(model_path), tmp_link)
        os.replace(tmp_link, str(current))
    except (OSError, NotImplementedError):
        import shutil
        shutil.copy2(str(model_path), str(current))

    logger.info("recommender_model_built", listings=len(listings), sha=sha)
    return model


_SIG_LEN = 32  # HMAC-SHA256 digest size in bytes


def load_model() -> Optional[dict]:
    current = _current_symlink()
    if not current.exists():
        logger.info("recommender_no_model")
        return None
    with open(str(current), "rb") as f:
        stored_sig = f.read(_SIG_LEN)
        raw = f.read()
    expected_sig = hmac.new(settings.SECRET_KEY.encode(), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(stored_sig, expected_sig):
        logger.error("recommender_model_signature_invalid")
        return None
    return pickle.loads(raw)


def score_for_user(user, model: dict) -> list[int]:
    """Return list of listing IDs recommended for user (top N)."""
    from sklearn.metrics.pairwise import cosine_similarity
    from apps.listings.models import Listing, ListingStatus, UserInteraction
    from django.utils import timezone

    vectorizer = model["vectorizer"]
    matrix = model["matrix"]
    listing_ids: list[int] = model["listing_ids"]

    # Collect user's interaction listing IDs
    interaction_listing_ids = list(
        UserInteraction.objects.filter(
            user=user,
            event_type__in=[
                UserInteraction.EVENT_SAVE,
                UserInteraction.EVENT_INQUIRY,
                UserInteraction.EVENT_VIEW,
            ],
        )
        .exclude(listing__isnull=True)
        .values_list("listing_id", flat=True)
        .order_by("-created_at")[: settings.RECOMMENDER_MAX_INTERACTIONS]
    )

    # Exclude recently viewed
    cutoff = timezone.now() - timezone.timedelta(days=settings.RECOMMENDER_EXCLUDE_VIEWED_DAYS)
    recently_viewed = set(
        UserInteraction.objects.filter(
            user=user, event_type=UserInteraction.EVENT_VIEW, created_at__gte=cutoff
        )
        .exclude(listing__isnull=True)
        .values_list("listing_id", flat=True)
    )

    if not interaction_listing_ids:
        return []  # cold-start — caller handles

    # Build user vector from mean of interacted listing vectors
    interaction_set = set(interaction_listing_ids)
    indices = [i for i, lid in enumerate(listing_ids) if lid in interaction_set]
    if not indices:
        return []

    user_vec = np.asarray(matrix[indices].mean(axis=0))
    scores = cosine_similarity(user_vec, matrix).flatten()

    # Rank
    ranked = sorted(
        [
            (listing_ids[i], float(scores[i]))
            for i in range(len(listing_ids))
            if listing_ids[i] not in recently_viewed
        ],
        key=lambda x: -x[1],
    )

    return [lid for lid, _ in ranked[: settings.RECOMMENDER_TOP_N]]


def cold_start_ids(user) -> list[int]:
    """Return top-N listing IDs for a user with no interactions."""
    from apps.listings.models import Listing, ListingStatus

    qs = Listing.objects.filter(status=ListingStatus.APPROVED)

    # If preference exists, filter by it
    try:
        pref = user.search_preference
        if pref.preferred_areas:
            qs = qs.filter(location_area__in=pref.preferred_areas)
        if pref.min_price is not None:
            qs = qs.filter(price_annual__gte=pref.min_price)
        if pref.max_price is not None:
            qs = qs.filter(price_annual__lte=pref.max_price)
        if pref.min_bedrooms is not None:
            qs = qs.filter(bedrooms__gte=pref.min_bedrooms)
        if pref.property_types:
            qs = qs.filter(property_type__in=pref.property_types)
    except Exception:
        pass

    return list(
        qs.order_by("-created_at").values_list("id", flat=True)[: settings.RECOMMENDER_TOP_N]
    )

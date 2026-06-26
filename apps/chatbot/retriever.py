"""
TF-IDF retrieval engine for the chatbot.
Loads YAML intents on first use; rebuilds on demand (Celery beat daily).
"""
import re
import threading
from pathlib import Path
from typing import Optional

import structlog
import yaml

logger = structlog.get_logger(__name__)

_KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
# TF-IDF cosine similarity between a short user message and a short example
# phrase rarely clears 0.45 even for a clean paraphrase once stopwords are
# stripped — the old threshold sent most real questions to the fallback.
# 0.3 was tuned by hand against the example sets in knowledge/*.yml.
_THRESHOLD = 0.3
# How many real listings to surface for a single chat reply — enough to be
# useful without turning the chat bubble into a results page.
_MAX_LISTING_RESULTS = 5

_retriever_instance = None
_retriever_lock = threading.Lock()


class Intent:
    __slots__ = ("name", "examples", "responses", "slots", "followups")

    def __init__(self, data: dict):
        self.name: str = data["intent"]
        self.examples: list[str] = data.get("examples", [])
        self.responses: list[str] = data.get("responses", [])
        self.slots: list[dict] = data.get("slots", [])
        self.followups: list[str] = data.get("followups", [])


def _extract_number_near_keywords(message: str, keywords: list[str]) -> Optional[int]:
    """Look for an integer right before or after any of the given keywords,
    e.g. "2 bedroom" or "bedrooms: 2"."""
    msg = message.lower()
    for kw in keywords:
        m = re.search(rf'(\d+)\s*[-]?\s*{re.escape(kw)}', msg) or re.search(rf'{re.escape(kw)}\D{{0,5}}(\d+)', msg)
        if m:
            return int(m.group(1))
    return None


def _extract_price_ceiling(message: str, keywords: list[str]) -> Optional[int]:
    """Look for a number following a "ceiling" keyword like "under" or
    "below", e.g. "under 15,000,000" or "max 20000"."""
    msg = message.lower()
    for kw in keywords:
        m = re.search(rf'{re.escape(kw)}\D{{0,3}}([\d,]+)', msg)
        if m:
            return int(m.group(1).replace(",", ""))
    return None


def _describe_listing_filters(slots: dict) -> str:
    parts = []
    if "bedrooms" in slots:
        parts.append(f"{slots['bedrooms']}+ bedroom")
    if "property_type" in slots:
        parts.append(str(slots["property_type"]).replace("_", " "))
    parts.append("listings")
    if "area" in slots:
        parts.append(f"in {str(slots['area']).replace('_', ' ').title()}")
    if "max_price" in slots:
        parts.append(f"under {slots['max_price']:,}")
    return " ".join(parts)


def _query_listings(slots: dict) -> tuple[list[dict], bool]:
    from apps.listings.models import Listing, ListingStatus

    qs = Listing.objects.filter(status=ListingStatus.APPROVED)
    if "area" in slots:
        qs = qs.filter(location_area=slots["area"])
    if "property_type" in slots:
        qs = qs.filter(property_type=slots["property_type"])
    if "bedrooms" in slots:
        qs = qs.filter(bedrooms__gte=slots["bedrooms"])
    if "max_price" in slots:
        qs = qs.filter(price_annual__lte=slots["max_price"])

    listings = list(qs.order_by("-created_at")[: _MAX_LISTING_RESULTS + 1])
    results = [
        {
            "id": listing.id,
            "title": listing.title,
            "price_annual": listing.price_annual,
            "currency": listing.currency,
            "bedrooms": listing.bedrooms,
            "location_area": listing.location_area,
        }
        for listing in listings[:_MAX_LISTING_RESULTS]
    ]
    return results, len(listings) > _MAX_LISTING_RESULTS


def _fill_slots(message: str, intent: "Intent") -> dict:
    slots_filled: dict = {}
    for slot in intent.slots:
        slot_type = slot.get("type")
        if slot_type == "enum":
            msg_lower = message.lower()
            for val in slot.get("values", []):
                if val.replace("_", " ") in msg_lower or val in msg_lower:
                    slots_filled[slot["name"]] = val
                    break
        elif slot_type == "number_near_keyword":
            value = _extract_number_near_keywords(message, slot.get("keywords", []))
            if value is not None:
                slots_filled[slot["name"]] = value
        elif slot_type == "price_ceiling":
            value = _extract_price_ceiling(message, slot.get("keywords", []))
            if value is not None:
                slots_filled[slot["name"]] = value
    return slots_filled


class Retriever:
    def __init__(self, intents: list[Intent]):
        from sklearn.feature_extraction.text import TfidfVectorizer

        self.intents = intents
        # Build corpus: (intent_index, example_text)
        corpus = []
        self._intent_map: list[int] = []
        for i, intent in enumerate(intents):
            for ex in intent.examples:
                corpus.append(ex)
                self._intent_map.append(i)

        self._vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            lowercase=True,
            stop_words="english",
            sublinear_tf=True,
        )
        if corpus:
            self._matrix = self._vectorizer.fit_transform(corpus)
        else:
            self._matrix = None
        logger.info("chatbot_index_built", intents=len(intents), examples=len(corpus))

    def query(self, message: str) -> dict:
        import numpy as np
        from sklearn.metrics.pairwise import cosine_similarity

        if self._matrix is None or not message.strip():
            return self._fallback()

        vec = self._vectorizer.transform([message])
        scores = cosine_similarity(vec, self._matrix).flatten()
        best_idx = int(np.argmax(scores))
        best_score = float(scores[best_idx])

        # Word-overlap similarity can pick the wrong intent even when the
        # message plainly names a search filter — e.g. "do you have 2
        # bedroom places" out-scoring on an unrelated intent. A successful
        # area/bedrooms/price extraction is a stronger, more specific signal
        # than the top TF-IDF match, so it wins regardless. property_type
        # alone doesn't count: "house"/"apartment" are exactly as likely in
        # "I want to LIST my house" (a landlord) as "...RENT a house" (a
        # tenant search), so it's too ambiguous to force the override.
        find_listings_intent = next((i for i in self.intents if i.name == "find_listings"), None)
        forced_slots = _fill_slots(message, find_listings_intent) if find_listings_intent else {}
        has_strong_signal = any(name in forced_slots for name in ("area", "bedrooms", "max_price"))

        if has_strong_signal:
            intent = find_listings_intent
            slots_filled = forced_slots
            # Not the top TF-IDF match's score — slot extraction is a
            # deterministic signal, so report it as fully confident.
            best_score = 1.0
        elif best_score < _THRESHOLD:
            return self._fallback()
        else:
            intent = self.intents[self._intent_map[best_idx]]
            slots_filled = _fill_slots(message, intent)

        response = intent.responses[0] if intent.responses else ""
        results: list[dict] = []
        listing_query = None
        if intent.name == "find_listings":
            results, more_available = _query_listings(slots_filled)
            filters_desc = _describe_listing_filters(slots_filled)
            if results:
                lines = [
                    f"• {r['title']} — {r['currency']} {r['price_annual']:,}/yr — {r['bedrooms']} bed"
                    for r in results
                ]
                response = f"Found {filters_desc} you might like:\n" + "\n".join(lines)
                if more_available:
                    response += "\n…and more — use the search filters to see the rest."
            else:
                response = f"I couldn't find any {filters_desc} right now. Try widening your search or check back later."
            # count/filters_desc, not prose — the LLM layer decides what to
            # say about a 0 vs a real count itself (see llm.py), since
            # asking a small local model to read a number and branch on it
            # correctly is not reliable.
            listing_query = {"count": len(results), "filters_desc": filters_desc}
        else:
            try:
                response = response.format(**slots_filled)
            except KeyError:
                pass

        return {
            "reply": response,
            "intent": intent.name,
            "confidence": round(best_score, 3),
            "followups": intent.followups,
            "results": results,
            "listing_query": listing_query,
        }

    def _fallback(self) -> dict:
        fallback_intent = next((i for i in self.intents if i.name == "fallback"), None)
        reply = (
            fallback_intent.responses[0]
            if fallback_intent and fallback_intent.responses
            else (
                "I'm not sure — try the search bar or contact a landlord directly. "
                "You can also ask: 'how does verification work?', "
                "'how do I report a listing?', or 'show me listings in Aberdeen'."
            )
        )
        followups = fallback_intent.followups if fallback_intent else []
        return {"reply": reply, "intent": None, "confidence": 0.0, "followups": followups, "results": [], "listing_query": None}


def _build_retriever() -> Retriever:
    intents = []
    for yml_path in sorted(_KNOWLEDGE_DIR.glob("*.yml")):
        with open(yml_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if data and "intent" in data:
            intents.append(Intent(data))
    return Retriever(intents)


def get_retriever() -> Retriever:
    global _retriever_instance
    if _retriever_instance is None:
        with _retriever_lock:
            if _retriever_instance is None:
                _retriever_instance = _build_retriever()
    return _retriever_instance


def reload_retriever() -> Retriever:
    """Rebuild and atomically swap the in-memory index."""
    global _retriever_instance
    new_retriever = _build_retriever()
    with _retriever_lock:
        _retriever_instance = new_retriever
    logger.info("chatbot_index_reloaded")
    return new_retriever


def build_knowledge_text() -> str:
    """All intents' canned responses, concatenated as grounding facts for
    the LLM layer (llm.py) — same knowledge/*.yml source the retriever
    matches against, just used as context instead of a verbatim answer."""
    lines = []
    for intent in get_retriever().intents:
        if intent.name == "fallback" or not intent.responses:
            continue
        lines.append(f"- {intent.responses[0]}")
    return "\n".join(lines)

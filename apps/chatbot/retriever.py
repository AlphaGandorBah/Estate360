"""
TF-IDF retrieval engine for the chatbot.
Loads YAML intents on first use; rebuilds on demand (Celery beat daily).
"""
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


class Retriever:
    def __init__(self, intents: list[Intent]):
        from sklearn.feature_extraction.text import TfidfVectorizer
        import numpy as np

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

        if best_score < _THRESHOLD:
            return self._fallback()

        intent = self.intents[self._intent_map[best_idx]]
        response = intent.responses[0] if intent.responses else ""

        # Slot filling: simple keyword match against enum values
        slots_filled = {}
        for slot in intent.slots:
            if slot.get("type") == "enum":
                msg_lower = message.lower()
                for val in slot.get("values", []):
                    if val.replace("_", " ") in msg_lower or val in msg_lower:
                        slots_filled[slot["name"]] = val
                        break

        # Render template
        try:
            response = response.format(**slots_filled)
        except KeyError:
            pass

        return {
            "reply": response,
            "intent": intent.name,
            "confidence": round(best_score, 3),
            "followups": intent.followups,
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
        return {"reply": reply, "intent": None, "confidence": 0.0, "followups": followups}


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

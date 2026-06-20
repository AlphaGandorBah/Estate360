"""Tests for the chatbot retriever."""
import pytest


class TestRetriever:
    def test_known_intent_routes_correctly(self):
        from apps.chatbot.retriever import Retriever, Intent

        intent_data = {
            "intent": "find_listings_by_area",
            "examples": ["show me apartments in Aberdeen", "listings in Lumley"],
            "responses": ["Here are listings in {area}."],
            "slots": [{"name": "area", "type": "enum", "values": ["aberdeen", "lumley"]}],
            "followups": ["Filter by price"],
        }
        retriever = Retriever([Intent(intent_data)])
        result = retriever.query("show me apartments in Aberdeen")
        assert result["intent"] == "find_listings_by_area"
        assert result["confidence"] >= 0.45
        assert "aberdeen" in result["reply"].lower() or "listings" in result["reply"].lower()

    def test_oov_query_hits_fallback(self):
        from apps.chatbot.retriever import Retriever, Intent

        intent_data = {
            "intent": "find_listings_by_area",
            "examples": ["show me apartments in Aberdeen"],
            "responses": ["Here are listings."],
            "slots": [],
            "followups": [],
        }
        retriever = Retriever([Intent(intent_data)])
        result = retriever.query("xyzzy plugh lorem ipsum foobar baz")
        assert result["intent"] is None
        assert result["confidence"] < 0.45
        assert "not sure" in result["reply"].lower() or "search" in result["reply"].lower()

    def test_slot_fill_works(self):
        from apps.chatbot.retriever import Retriever, Intent

        intent_data = {
            "intent": "find_listings_by_area",
            "examples": [
                "show me apartments in Aberdeen",
                "listings in Lumley",
                "what's in Goderich",
                "find property in Lumley",
                "houses available in Lumley",
                "rent in Lumley area",
                "properties for rent in Lumley",
            ],
            "responses": ["Here are listings in {area}."],
            "slots": [{"name": "area", "type": "enum", "values": ["aberdeen", "lumley", "goderich"]}],
            "followups": [],
        }
        retriever = Retriever([Intent(intent_data)])
        result = retriever.query("show me apartments in Lumley")
        assert result["intent"] == "find_listings_by_area"
        assert "lumley" in result["reply"].lower()

    def test_empty_query_returns_fallback(self):
        from apps.chatbot.retriever import Retriever
        retriever = Retriever([])
        result = retriever.query("")
        assert result["intent"] is None

    def test_full_corpus_loads(self):
        from apps.chatbot.retriever import get_retriever
        retriever = get_retriever()
        assert retriever is not None
        result = retriever.query("how does verification work")
        assert result["intent"] == "verification_process"

    def test_pricing_intent(self):
        from apps.chatbot.retriever import get_retriever
        retriever = get_retriever()
        result = retriever.query("are prices monthly or yearly")
        assert result["intent"] == "pricing_info"
        assert result["confidence"] >= 0.45


@pytest.mark.django_db
class TestChatbotEndpoint:
    def test_query_endpoint(self, api_client):
        resp = api_client.post(
            "/api/v1/chatbot/query",
            {"message": "how does verification work"},
            format="json",
        )
        assert resp.status_code == 200
        assert "reply" in resp.data

    def test_query_missing_message(self, api_client):
        resp = api_client.post("/api/v1/chatbot/query", {}, format="json")
        assert resp.status_code == 400

    def test_fallback_for_unknown(self, api_client):
        resp = api_client.post(
            "/api/v1/chatbot/query",
            {"message": "xyzzy completely random gobbledygook asdfghj"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["intent"] is None

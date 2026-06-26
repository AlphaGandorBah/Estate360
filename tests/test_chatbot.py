"""Tests for the chatbot retriever."""
from unittest.mock import patch

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

    @pytest.mark.parametrize("message,expected_intent", [
        ("can I talk to a human", "contact_support"),
        ("why was I banned", "restricted_or_banned_help"),
        ("is messaging free", "messaging_policy"),
        ("how do I delete my account", "account_help"),
        ("how do recommendations work", "recommendations_info"),
        ("what areas are available", "available_areas"),
        ("how do I edit my listing", "edit_or_delete_listing"),
        ("how do I set my search preferences", "search_preferences"),
    ])
    def test_new_intents_match(self, message, expected_intent):
        from apps.chatbot.retriever import get_retriever
        result = get_retriever().query(message)
        assert result["intent"] == expected_intent

    @pytest.mark.django_db
    def test_strong_slot_signal_overrides_a_weaker_intent_match(self):
        # "places" doesn't appear in find_listings' own examples, so word
        # overlap alone can lose to an unrelated intent — but "2 bedroom" is
        # an unambiguous search filter and should win regardless.
        from apps.chatbot.retriever import get_retriever
        result = get_retriever().query("do you have any 2 bedroom places")
        assert result["intent"] == "find_listings"

    def test_property_type_alone_does_not_force_a_listings_match(self):
        # "house"/"apartment" are exactly as likely in "I want to LIST my
        # house" (landlord) as "...RENT a house" (tenant search) — too
        # ambiguous on its own to override the matched intent.
        from apps.chatbot.retriever import get_retriever
        result = get_retriever().query("I want to list my house")
        assert result["intent"] == "how_to_list_property"


@pytest.mark.django_db
class TestFindListingsLiveData:
    """find_listings is the one intent that hits the real DB instead of
    returning a canned line — these are not the synthetic Retriever/Intent
    used above, they go through the real knowledge/find_listings.yml."""

    def test_returns_real_matching_listings(self, approved_listing):
        from apps.chatbot.retriever import get_retriever
        result = get_retriever().query("show me apartments in Aberdeen")
        assert result["intent"] == "find_listings"
        assert result["results"]
        assert result["results"][0]["id"] == approved_listing.id
        assert approved_listing.title in result["reply"]

    def test_area_with_no_listings_returns_empty_results(self, approved_listing):
        from apps.chatbot.retriever import get_retriever
        result = get_retriever().query("show me apartments in Kissy")
        assert result["intent"] == "find_listings"
        assert result["results"] == []
        assert "couldn't find" in result["reply"].lower()

    def test_bedroom_and_price_filters_extracted_together(self, verified_landlord):
        from apps.listings.models import Listing, ListingStatus
        match = Listing.objects.create(
            owner=verified_landlord, title="Cheap 2BR Aberdeen", description="x",
            property_type="apartment", bedrooms=2, bathrooms=1,
            price_annual=10_000_000, currency="SLE", location_area="aberdeen",
            status=ListingStatus.APPROVED,
        )
        Listing.objects.create(
            owner=verified_landlord, title="Pricey 2BR Aberdeen", description="x",
            property_type="apartment", bedrooms=2, bathrooms=1,
            price_annual=50_000_000, currency="SLE", location_area="aberdeen",
            status=ListingStatus.APPROVED,
        )

        from apps.chatbot.retriever import get_retriever
        result = get_retriever().query("2 bedroom apartments in Aberdeen under 15000000")
        ids = [r["id"] for r in result["results"]]
        assert match.id in ids
        assert len(result["results"]) == 1

    def test_non_approved_listing_excluded(self, verified_landlord):
        from apps.listings.models import Listing, ListingStatus
        Listing.objects.create(
            owner=verified_landlord, title="Pending Aberdeen Flat", description="x",
            property_type="apartment", bedrooms=2, bathrooms=1,
            price_annual=10_000_000, currency="SLE", location_area="aberdeen",
            status=ListingStatus.PENDING,
        )
        from apps.chatbot.retriever import get_retriever
        result = get_retriever().query("show me apartments in Aberdeen")
        assert result["results"] == []


@pytest.mark.django_db
class TestChatbotEndpoint:
    """generate_reply is mocked throughout so behavior here doesn't depend
    on whether the ~1GB local model happens to be downloaded on whatever
    machine runs the tests — see TestLLMLayer for the LLM layer itself."""

    def test_query_endpoint(self, api_client):
        with patch("apps.chatbot.llm.generate_reply", return_value=None):
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
        with patch("apps.chatbot.llm.generate_reply", return_value=None):
            resp = api_client.post(
                "/api/v1/chatbot/query",
                {"message": "xyzzy completely random gobbledygook asdfghj"},
                format="json",
            )
        assert resp.status_code == 200
        assert resp.data["intent"] is None

    def test_falls_back_to_retriever_reply_when_llm_unavailable(self, api_client):
        with patch("apps.chatbot.llm.generate_reply", return_value=None) as mock_generate:
            resp = api_client.post(
                "/api/v1/chatbot/query", {"message": "how does verification work"}, format="json"
            )
        assert mock_generate.called
        assert "government-issued ID" in resp.data["reply"]

    def test_uses_generated_reply_when_llm_available(self, api_client):
        with patch("apps.chatbot.llm.generate_reply", return_value="A friendly, made-up answer.") as mock_generate:
            resp = api_client.post(
                "/api/v1/chatbot/query", {"message": "how does verification work"}, format="json"
            )
        assert resp.data["reply"] == "A friendly, made-up answer."
        # intent/confidence still come from the retriever even though the
        # LLM wrote the final text — the frontend's listing cards etc. rely on this.
        assert resp.data["intent"] == "verification_process"
        assert mock_generate.called

    def test_passes_a_listing_count_not_raw_results_to_llm(self, api_client, approved_listing):
        # The LLM only gets {count, filters_desc}, never the raw per-listing
        # details — the frontend renders the actual results as cards, and a
        # small model asked to transcribe real data tends to invent
        # placeholders instead of repeating it correctly.
        with patch("apps.chatbot.llm.generate_reply", return_value="Here you go!") as mock_generate:
            api_client.post(
                "/api/v1/chatbot/query", {"message": "show me apartments in Aberdeen"}, format="json"
            )
        _message, _knowledge, listing_query, _history = mock_generate.call_args[0]
        assert listing_query["count"] == 1
        assert approved_listing.title not in listing_query["filters_desc"]

    def test_no_listing_query_passed_for_non_listing_query(self, api_client):
        with patch("apps.chatbot.llm.generate_reply", return_value="ok") as mock_generate:
            api_client.post(
                "/api/v1/chatbot/query", {"message": "how does verification work"}, format="json"
            )
        _message, _knowledge, listing_query, _history = mock_generate.call_args[0]
        assert listing_query is None

    def test_passes_conversation_history_to_llm(self, api_client):
        history = [
            {"role": "user", "content": "show me listings in Aberdeen"},
            {"role": "assistant", "content": "Here are listings in Aberdeen!"},
        ]
        with patch("apps.chatbot.llm.generate_reply", return_value="ok") as mock_generate:
            api_client.post(
                "/api/v1/chatbot/query",
                {"message": "what about cheaper ones?", "history": history},
                format="json",
            )
        _message, _knowledge, _summary, passed_history = mock_generate.call_args[0]
        assert passed_history == history

    def test_drops_malformed_history_entries(self, api_client):
        history = [
            {"role": "user", "content": "a real message"},
            {"role": "system", "content": "should be dropped — wrong role"},
            {"role": "user", "content": ""},
            {"not_a": "valid turn"},
            "not even a dict",
        ]
        with patch("apps.chatbot.llm.generate_reply", return_value="ok") as mock_generate:
            api_client.post(
                "/api/v1/chatbot/query",
                {"message": "hi", "history": history},
                format="json",
            )
        _message, _knowledge, _summary, passed_history = mock_generate.call_args[0]
        assert passed_history == [{"role": "user", "content": "a real message"}]

    def test_missing_history_defaults_to_empty(self, api_client):
        with patch("apps.chatbot.llm.generate_reply", return_value="ok") as mock_generate:
            api_client.post("/api/v1/chatbot/query", {"message": "hi"}, format="json")
        _message, _knowledge, _summary, passed_history = mock_generate.call_args[0]
        assert passed_history == []


class TestLLMLayer:
    def test_unavailable_when_model_file_missing(self):
        from apps.chatbot import llm
        with patch("apps.chatbot.llm._resolve_model_path", return_value=None):
            assert not llm.is_available()

    def test_generate_reply_returns_none_when_model_unavailable(self):
        from apps.chatbot import llm
        with patch.object(llm, "_get_llm", return_value=None):
            assert llm.generate_reply("hello", "some facts") is None

    def test_generate_reply_uses_chat_completion(self):
        from apps.chatbot import llm

        fake_llm = type("FakeLlm", (), {
            "create_chat_completion": lambda self, **kwargs: {
                "choices": [{"message": {"content": "  Generated answer.  "}}]
            }
        })()
        with patch.object(llm, "_get_llm", return_value=fake_llm):
            reply = llm.generate_reply("hi", "facts here", {"count": 1, "filters_desc": "listings in Lumley"})
        assert reply == "Generated answer."

    def test_generate_reply_returns_none_on_exception(self):
        from apps.chatbot import llm

        def boom(**kwargs):
            raise RuntimeError("inference failed")

        fake_llm = type("FakeLlm", (), {"create_chat_completion": lambda self, **kwargs: boom(**kwargs)})()
        with patch.object(llm, "_get_llm", return_value=fake_llm):
            assert llm.generate_reply("hi", "facts") is None

    def test_generate_reply_includes_history_between_system_and_user_messages(self):
        from apps.chatbot import llm

        captured = {}

        def fake_completion(**kwargs):
            captured.update(kwargs)
            return {"choices": [{"message": {"content": "ok"}}]}

        fake_llm = type("FakeLlm", (), {"create_chat_completion": lambda self, **kwargs: fake_completion(**kwargs)})()
        history = [{"role": "user", "content": "earlier question"}, {"role": "assistant", "content": "earlier answer"}]
        with patch.object(llm, "_get_llm", return_value=fake_llm):
            llm.generate_reply("follow-up question", "facts", history=history)

        roles = [m["role"] for m in captured["messages"]]
        assert roles == ["system", "user", "assistant", "user"]
        assert captured["messages"][-1]["content"] == "follow-up question"

    def test_generate_reply_caps_history_length(self):
        from apps.chatbot import llm

        captured = {}

        def fake_completion(**kwargs):
            captured.update(kwargs)
            return {"choices": [{"message": {"content": "ok"}}]}

        fake_llm = type("FakeLlm", (), {"create_chat_completion": lambda self, **kwargs: fake_completion(**kwargs)})()
        long_history = [{"role": "user", "content": f"msg {i}"} for i in range(20)]
        with patch.object(llm, "_get_llm", return_value=fake_llm):
            llm.generate_reply("latest", "facts", history=long_history)

        # system + capped history + the new user message
        assert len(captured["messages"]) == 1 + llm._MAX_HISTORY_MESSAGES + 1
        assert captured["messages"][1]["content"] == "msg 12"

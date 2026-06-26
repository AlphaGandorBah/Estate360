"""
Local LLM layer (llama.cpp via llama-cpp-python) for the chatbot.

Why: the TF-IDF retriever (retriever.py) only matches a message against a
fixed set of example phrasings — it has no real understanding, so close-but-
different phrasings ("I want to rent a house" vs "I want to list my house")
can confidently match the wrong intent. A small local instruct model fixes
that by actually reading the message, grounded in the same facts the
retriever used to recite verbatim — and it's free to run (one-time model
download, no per-message API cost), which matters for this project.

Optional by design: if the ~1GB model file hasn't been downloaded (see the
download_chatbot_model management command) or fails to load, generate_reply
returns None and the caller (views.py) falls back to the retriever's canned
reply — the chatbot still works, just less naturally, and tests don't need
the model file present.
"""
import os
import threading
from pathlib import Path
from typing import Optional, TypedDict

import structlog

logger = structlog.get_logger(__name__)

MODEL_REPO = "Qwen/Qwen2.5-1.5B-Instruct-GGUF"
MODEL_FILENAME = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
MODEL_DIR = Path(__file__).parent / "models"

# How many prior turns (user+assistant messages) to carry into the prompt —
# enough for "what about cheaper ones?" to make sense, capped so the prompt
# (knowledge facts + history + this message) stays well inside n_ctx.
_MAX_HISTORY_MESSAGES = 8


class HistoryTurn(TypedDict):
    role: str
    content: str

SYSTEM_PROMPT_HEADER = (
    "You are the Estate360 assistant, a help bot for a real-estate rental "
    "platform in Freetown, Sierra Leone, used by tenants, landlords, and "
    "admins. Answer briefly (2-4 sentences), in plain friendly English, and "
    "only using the facts below. If something isn't covered by them, say "
    "you're not sure and suggest the search bar or 'Contact Support' — "
    "never invent listings, prices, or policies that aren't in the facts.\n"
    "\nFacts about Estate360:\n"
)

_llm_instance = None
_load_failed = False
_llm_lock = threading.Lock()


def _resolve_model_path() -> Optional[Path]:
    configured = os.environ.get("CHATBOT_MODEL_PATH")
    if configured:
        return Path(configured) if Path(configured).exists() else None
    default_path = MODEL_DIR / MODEL_FILENAME
    return default_path if default_path.exists() else None


def is_available() -> bool:
    return _resolve_model_path() is not None


def _get_llm():
    global _llm_instance, _load_failed
    if _llm_instance is not None or _load_failed:
        return _llm_instance
    with _llm_lock:
        if _llm_instance is not None or _load_failed:
            return _llm_instance
        model_path = _resolve_model_path()
        if model_path is None:
            _load_failed = True
            logger.warning("chatbot_llm_model_not_found", expected_path=str(MODEL_DIR / MODEL_FILENAME))
            return None
        try:
            from llama_cpp import Llama
            _llm_instance = Llama(
                model_path=str(model_path),
                # The knowledge-base system prompt alone runs ~1k tokens —
                # 2048 left too little headroom for the response on top of it.
                n_ctx=4096,
                n_threads=os.cpu_count() or 4,
                verbose=False,
            )
            logger.info("chatbot_llm_loaded", model_path=str(model_path))
        except Exception as exc:
            _load_failed = True
            logger.warning("chatbot_llm_load_failed", error=str(exc))
            return None
        return _llm_instance


class ListingQuery(TypedDict):
    count: int
    filters_desc: str


def generate_reply(
    message: str,
    knowledge_text: str,
    listing_query: Optional[ListingQuery] = None,
    history: Optional[list[HistoryTurn]] = None,
) -> Optional[str]:
    """Returns a generated, fact-grounded reply, or None if the local model
    isn't available or generation fails — caller should fall back to the
    retriever's canned reply in that case.

    listing_query is just {count, filters_desc} (e.g. count=3, filters_desc=
    "listings in Aberdeen") — never the listings themselves, since the app
    already renders the real results as cards below the reply. Whether
    count is 0 changes the instruction text itself (built here in Python,
    not left for the model to branch on) — a 1.5B model asked to read a
    number and decide what to say about it isn't reliable: it has confused
    a 0-result query for a success, and copied the literal count/area out
    of an earlier example instead of the real ones. Handing it one fixed,
    unambiguous instruction for the actual situation avoids both.

    history is prior turns in the same chat session — without it, every
    message is answered in isolation (no "what about cheaper ones?", no
    "thanks" landing in context), which is what made this feel like an FAQ
    box instead of a conversation even after the LLM swap."""
    llm = _get_llm()
    if llm is None:
        return None

    system_prompt = SYSTEM_PROMPT_HEADER + knowledge_text
    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    if listing_query:
        # Deliberately excludes history for this call. Earlier turns in the
        # same chat are very often numbered step-by-step instructions (e.g.
        # "how do I list my house" -> "1. Click + Add Listing 2. ..."), which
        # is the correct shape for a how-to answer — but a 1.5B model sees
        # that pattern in its own recent output and reuses the same numbered
        # shape here, inventing "[Listing Name]: [Address]" placeholders to
        # fill it in since it has no real per-item data. Confirmed by
        # reproduction: identical prompt minus history did not do this.
        count = listing_query["count"]
        filters_desc = listing_query["filters_desc"]
        if count == 0:
            instruction = (
                f"You searched and found NO {filters_desc}. Tell the user "
                "that, honestly, in one short plain sentence, and suggest "
                "widening their search."
            )
        else:
            plural = "listing" if count == 1 else "listings"
            instruction = (
                f"You searched and found exactly {count} {plural} matching "
                f"{filters_desc}. Tell the user that in one short, "
                f"enthusiastic plain sentence stating that exact number "
                f"({count}) — the app already shows the real listings as "
                "cards right below your message, so don't list, number, or "
                "describe individual ones, and don't invent any other "
                "count or area."
            )
        system_prompt += f"\n\nFor this message: {instruction} No markdown."
        messages[0]["content"] = system_prompt
    elif history:
        messages.extend(history[-_MAX_HISTORY_MESSAGES:])

    messages.append({"role": "user", "content": message})

    try:
        result = llm.create_chat_completion(messages=messages, max_tokens=220, temperature=0.4)
        reply = result["choices"][0]["message"]["content"]
        return reply.strip() if reply else None
    except Exception as exc:
        logger.warning("chatbot_llm_generate_failed", error=str(exc))
        return None

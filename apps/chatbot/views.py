"""POST /chatbot/query"""
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.throttles import ChatbotThrottle


class ChatbotQueryView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ChatbotThrottle]
    throttle_scope = "chatbot"

    def post(self, request: Request) -> Response:
        message = request.data.get("message", "").strip()
        if not message:
            return Response(
                {"code": "missing_message", "detail": "message is required."},
                status=400,
            )

        from . import llm
        from .retriever import build_knowledge_text, get_retriever

        history = [
            {"role": turn["role"], "content": turn["content"][:2000]}
            for turn in request.data.get("history", []) or []
            if isinstance(turn, dict)
            and turn.get("role") in ("user", "assistant")
            and isinstance(turn.get("content"), str)
            and turn["content"].strip()
        ]

        result = get_retriever().query(message)
        generated = llm.generate_reply(message, build_knowledge_text(), result["listing_query"], history)
        if generated:
            result = {**result, "reply": generated}

        return Response(result)

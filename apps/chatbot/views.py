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

        from .retriever import get_retriever
        result = get_retriever().query(message)
        return Response(result)

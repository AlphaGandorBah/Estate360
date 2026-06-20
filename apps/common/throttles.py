"""Named throttle scopes for ScopedRateThrottle."""
from rest_framework.throttling import ScopedRateThrottle


class AuthThrottle(ScopedRateThrottle):
    scope = "auth"


class ChatbotThrottle(ScopedRateThrottle):
    scope = "chatbot"


class MessagingThrottle(ScopedRateThrottle):
    scope = "messaging"


class UploadThrottle(ScopedRateThrottle):
    scope = "upload"


class ReadThrottle(ScopedRateThrottle):
    scope = "read"

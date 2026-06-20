from django.apps import AppConfig


class ChatbotConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.chatbot"

    def ready(self):
        # Pre-load the TF-IDF index on startup
        from .retriever import get_retriever
        get_retriever()

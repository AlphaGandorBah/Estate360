from django.apps import AppConfig


class PanoramasConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.panoramas"

    def ready(self):
        import apps.panoramas.signals  # noqa: F401

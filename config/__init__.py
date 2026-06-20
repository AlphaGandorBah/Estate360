# Make Celery app available when Django loads this package
from .celery import app as celery_app

__all__ = ("celery_app",)

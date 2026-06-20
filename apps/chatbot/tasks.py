from celery import shared_task
import structlog

logger = structlog.get_logger(__name__)


@shared_task(
    name="apps.chatbot.tasks.reload_index",
    queue="default",
    max_retries=3,
    retry_backoff=True,
)
def reload_index() -> None:
    from .retriever import reload_retriever
    reload_retriever()
    logger.info("chatbot_index_reloaded_via_task")

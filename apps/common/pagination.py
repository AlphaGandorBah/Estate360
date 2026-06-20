"""Custom pagination classes."""
from rest_framework.pagination import CursorPagination, PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 50
    page_size_query_param = "page_size"
    page_query_param = "page"


class MessageCursorPagination(CursorPagination):
    """Cursor pagination for messages — newest first."""
    page_size = 20
    max_page_size = 50
    ordering = ("-created_at", "-id")
    page_size_query_param = "page_size"
    cursor_query_param = "cursor"

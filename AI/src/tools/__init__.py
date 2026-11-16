"""
NEO Agent Tools

Tool logic for the voice AI assistant.
These are called by wrapper methods in the Assistant class.
"""
from tools.web_task import execute_web_task
from tools.applications import execute_open_application, execute_read_screen
from tools.time_tools import execute_get_current_time

__all__ = [
    "execute_web_task",
    "execute_open_application",
    "execute_read_screen",
    "execute_get_current_time",
]

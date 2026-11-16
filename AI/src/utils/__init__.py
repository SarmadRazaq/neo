"""
Utility modules for NEO AI Agent

Core utilities:
- logger: Logging setup with consistent formatting
- observability: Langfuse integration for LangGraph tracing (optional)

Note: timing.py is available for custom timing needs but not used by default
since LiveKit SDK 1.3+ and Stagehand provide built-in observability.
"""

from .logger import setup_logging, get_logger


def sanitize_text(text: str) -> str:
    """
    Sanitize text for safe display/logging on Windows.
    Replaces problematic Unicode characters with ASCII equivalents.
    """
    if not text:
        return text
    
    # Common Unicode replacements
    replacements = {
        '\u2018': "'",   # Left single quote
        '\u2019': "'",   # Right single quote  
        '\u201c': '"',   # Left double quote
        '\u201d': '"',   # Right double quote
        '\u2013': '-',   # En dash
        '\u2014': '--',  # Em dash
        '\u2026': '...', # Ellipsis
        '\u00a0': ' ',   # Non-breaking space
    }
    
    for unicode_char, ascii_char in replacements.items():
        text = text.replace(unicode_char, ascii_char)
    
    return text

# Observability imports are lazy to avoid errors if langfuse not installed
def get_langfuse_handler():
    from .observability import get_langfuse_handler as _get_handler
    return _get_handler()

def get_langgraph_config(additional_callbacks=None):
    from .observability import get_langgraph_config as _get_config
    return _get_config(additional_callbacks)

__all__ = [
    # Logging (always available)
    'setup_logging',
    'get_logger',
    # Text utilities
    'sanitize_text',
    # Observability (optional - requires langfuse)
    'get_langfuse_handler',
    'get_langgraph_config',
]

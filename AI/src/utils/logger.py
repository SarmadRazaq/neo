"""
Logging configuration for NEO AI Agent
Provides consistent logging setup across the application
"""

import io
import logging
import sys
from typing import Optional


def setup_logging(level: int = logging.INFO) -> None:
    """
    Configure logging to output to stdout with timestamps.
    Should be called once at application startup.
    """
    # On Windows, reconfigure stdout to handle UTF-8 properly
    if sys.platform == 'win32':
        try:
            # Wrap stdout with UTF-8 encoding, replacing unencodable chars
            sys.stdout = io.TextIOWrapper(
                sys.stdout.buffer, 
                encoding='utf-8', 
                errors='replace',
                line_buffering=True
            )
        except Exception:
            pass  # Fall back to default if this fails
    
    # Configure root logger
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ],
        force=True  # Override any existing configuration
    )
    
    # Ensure stdout is line-buffered for immediate output
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(line_buffering=True)
        except Exception:
            pass  # Ignore if reconfigure not supported


def get_logger(name: str, level: Optional[int] = None) -> logging.Logger:
    """
    Get a logger instance with the specified name.
    
    Args:
        name: Logger name (typically __name__ or module name)
        level: Optional log level override
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    if level is not None:
        logger.setLevel(level)
    return logger

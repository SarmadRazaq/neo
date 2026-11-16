"""
Time Tools

Tools for getting current time and date.
"""
from datetime import datetime

from models.schemas import TimeResponse
from utils.logger import get_logger

logger = get_logger("neo-agent")


def execute_get_current_time() -> str:
    """Get the current date and time."""
    logger.info("[TOOL] get_current_time")
    
    now = datetime.now()
    time_response = TimeResponse(
        success=True,
        time=now.strftime('%I:%M %p'),
        date=now.strftime('%A, %B %d, %Y'),
        full_response=f"It's {now.strftime('%I:%M %p')} on {now.strftime('%A, %B %d, %Y')}.",
        timestamp=now
    )
    
    # Return plain text for TTS
    return time_response.full_response

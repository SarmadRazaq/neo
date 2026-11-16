"""
Application Tools

Tools for opening native applications and reading screen content.
"""
import json
from datetime import datetime
from typing import Any

from models.schemas import ApplicationCommand
from utils.logger import get_logger

logger = get_logger("neo-agent")


async def execute_open_application(app_name: str, room: Any) -> str:
    """Open a native application on the user's computer."""
    logger.info(f"[TOOL] open_application: '{app_name}'")
    
    if room:
        # Send open_app command - opens in user's default browser (Opera, Chrome, etc.)
        command = ApplicationCommand(
            type="open_app",
            app=app_name.lower(),
            timestamp=datetime.now()
        )
        
        # Send structured command as JSON
        await room.local_participant.publish_data(
            command.model_dump_json().encode(), 
            reliable=True
        )
        
        logger.info(f"[TOOL] Sent command: {command.model_dump_json()}")
        return f"Opening {app_name} now."
    else:
        logger.warning("[TOOL] Room not available")
        return f"I'll open {app_name} for you."


async def execute_read_screen(section: str, room: Any) -> str:
    """Read the current screen content aloud."""
    logger.info(f"[TOOL] read_screen: section='{section}'")
    
    if room:
        command = json.dumps({
            "type": "read_screen",
            "section": section,
            "timestamp": datetime.now().isoformat()
        })
        await room.local_participant.publish_data(command.encode(), reliable=True)
        return "Let me read that for you..."
    else:
        logger.warning("[TOOL] Room not available")
        return "I'll read the screen for you."

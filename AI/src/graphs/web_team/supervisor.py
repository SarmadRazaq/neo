"""
Web Team Supervisor
Coordinates the web browsing workflow
"""
import logging
from state.state import AgentState

logger = logging.getLogger("web-team-supervisor")

SUPERVISOR_PROMPT = """You are the Web Team Supervisor for a voice assistant helping visually impaired users.

Your role:
- Analyze web browsing requests
- Coordinate the browser agent and content cleaner
- Ensure efficient task completion

You manage a team of:
1. Browser Agent - Navigates websites and extracts content
2. Content Cleaner - Formats output for voice presentation"""


async def web_supervisor(state: AgentState) -> AgentState:
    """
    Web team supervisor node
    
    Analyzes the task and prepares it for the browser agent.
    In this simplified version, it primarily logs and passes through,
    but could be extended to:
    - Break down complex multi-step browsing tasks
    - Validate URLs before browsing
    - Cache frequently accessed content
    """
    logger.info("[Web Team Supervisor] Coordinating web browsing task...")
    
    user_message = state["messages"][-1].content if state["messages"] else ""
    
    logger.info(f"[Web Team Supervisor] Task: {user_message}")
    logger.info("[Web Team Supervisor] Delegating to browser agent...")
    
    # In a more complex system, supervisor could:
    # - Analyze if task needs multiple pages
    # - Determine if search is needed before navigation
    # - Check cache for recent results
    
    return state
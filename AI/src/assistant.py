"""
NEO Assistant

The main voice AI assistant class.
Uses LiveKit Agents framework with LangGraph orchestration.
"""
from typing import Optional, Any

from livekit.agents import Agent, function_tool, RunContext

from instructions import ASSISTANT_INSTRUCTIONS
from tools import execute_web_task, execute_open_application, execute_read_screen, execute_get_current_time
from cua.client import CUAClient
from state.state import ConversationContext
from utils.logger import get_logger

logger = get_logger("neo-agent")


class Assistant(Agent):
    """
    NEO Voice AI Assistant for blind and visually impaired users.
    
    Combines LiveKit's voice pipeline with LangGraph orchestration
    for intelligent task routing and browser automation.
    """
    
    def __init__(self) -> None:
        super().__init__(
            instructions=ASSISTANT_INSTRUCTIONS,
        )
        self.orchestrator: Optional[Any] = None
        self.room = None
        self.cua_client: Optional[CUAClient] = None
        
        # Conversation context for follow-up questions
        # This bridges LiveKit's conversation memory with LangGraph
        self.conversation_context = ConversationContext()

    def set_room(self, room):
        """
        Set the room reference for tools that need it.
        
        This also initializes the CUA client and orchestrator
        since they depend on the room for data channel communication.
        """
        self.room = room
        
        # Create CUA client with room reference
        self.cua_client = CUAClient(room, timeout=60.0)
        logger.info("[Assistant] CUA client initialized")
        
        # Register text stream handler for large responses from Frontend
        self.cua_client.register_text_stream_handler()
        logger.info("[Assistant] Text stream handler registered")
        
        # Import here to avoid circular dependency
        from orchestrator import NEOAssistant
        
        # Initialize orchestrator with CUA client
        self.orchestrator = NEOAssistant(cua_client=self.cua_client)
        logger.info("[Assistant] Orchestrator initialized with CUA client")

    # =========================================================================
    # Tools - These wrapper methods register as LLM-callable tools
    # =========================================================================

    @function_tool
    async def trigger_orchestrator_agent(self, context: RunContext, task: str) -> str:
        """
        Process a task using the orchestrator with real-time progress updates.
        
        Use this for:
        - Browsing websites and extracting information
        - Reading headlines from news sites
        - Searching the web
        - Email management
        - Form filling
        - General questions
        
        Args:
            task: The user's task description (e.g., "read headlines from Reddit")
        """
        # Sync context from CUA client (has latest domain from progress events)
        self._sync_context_from_cua()
        
        # Pass context to orchestrator for this request
        result = await execute_web_task(
            context, 
            task, 
            self.orchestrator, 
            self.cua_client,
            conversation_context=self.conversation_context
        )
        
        # Update context after task completion
        self._update_context_after_task(task)
        
        return result
    
    def _sync_context_from_cua(self) -> None:
        """Sync context from CUA client (which tracks progress events)."""
        if self.cua_client and hasattr(self.cua_client, 'last_domain') and self.cua_client.last_domain:
            self.conversation_context.current_domain = self.cua_client.last_domain
            logger.debug(f"[Context] Synced domain from CUA: {self.conversation_context.current_domain}")
    
    def _update_context_after_task(self, task: str) -> None:
        """Update context after a successful task."""
        # Add task to history
        self.conversation_context.add_task(task)
        
        # Sync domain again in case it changed during the task
        self._sync_context_from_cua()
        
        # Note: last_team and last_content are set by execute_web_task directly
        logger.info(f"[Context] Updated: domain={self.conversation_context.current_domain}, team={self.conversation_context.last_team}, tasks={self.conversation_context.recent_tasks}")

    @function_tool
    async def open_application(self, context: RunContext, app_name: str) -> str:
        """Open a native application on the user's computer.
        
        Use this ONLY for non-web native apps like email client, settings, calculator.
        DO NOT use this for web browsing tasks - use trigger_orchestrator_agent instead.
        
        Args:
            app_name: Name of the native application to open (e.g., "email", "settings", "calculator")
        """
        return await execute_open_application(app_name, self.room)

    @function_tool
    async def read_screen(self, context: RunContext, section: str = "all") -> str:
        """Read the current screen content aloud.
        
        Use this when the user asks what's on screen, to read emails, or to describe the current view.
        
        Args:
            section: Which part to read - "all", "main", "headers", "links", or "emails"
        """
        return await execute_read_screen(section, self.room)

    @function_tool
    async def get_current_time(self, context: RunContext) -> str:
        """Get the current date and time.
        
        Use this when the user asks what time it is or what's today's date.
        """
        return execute_get_current_time()

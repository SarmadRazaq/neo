"""
Shared state definitions for NEO Voice Assistant
"""
from typing import Annotated, Optional, Any, List
from typing_extensions import TypedDict
from dataclasses import dataclass, field

from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


@dataclass
class ConversationContext:
    """
    Conversation context passed from LiveKit Agent to LangGraph.
    
    This bridges the gap between LiveKit's conversation memory 
    and LangGraph's stateless invocations.
    """
    # Current browser state
    current_domain: Optional[str] = None  # e.g., "usnews.com"
    current_url: Optional[str] = None     # e.g., "https://usnews.com"
    
    # Recent history (last few items for context)
    recent_tasks: List[str] = field(default_factory=list)  # Last 3 tasks
    last_content_summary: Optional[str] = None  # Brief summary of last content read
    last_team: Optional[str] = None  # Last team that handled a request (for continuity)
    
    def add_task(self, task: str) -> None:
        """Add a task to history, keeping only last 3."""
        self.recent_tasks.append(task[:200])  # Truncate long tasks
        if len(self.recent_tasks) > 3:
            self.recent_tasks.pop(0)
    
    def set_last_content(self, content: str, max_length: int = 500) -> None:
        """Store a summary of the last content read (for follow-up questions)."""
        if content:
            # Keep first N chars as summary
            self.last_content_summary = content[:max_length]
    
    def to_context_string(self) -> str:
        """Convert to a context string for prompts."""
        parts = []
        if self.current_domain:
            parts.append(f"Browser is currently on: {self.current_domain}")
        if self.recent_tasks:
            parts.append(f"Recent tasks: {' -> '.join(self.recent_tasks)}")
        if self.last_content_summary:
            parts.append(f"Last content: {self.last_content_summary[:300]}")
        return " | ".join(parts) if parts else ""


class AgentState(TypedDict):
    """
    Shared state passed through the entire agent graph
    
    Attributes:
        messages: Full conversation history
        next: Next node to execute in the graph
        team: Which team is handling the request (web, email, form, general)
        task_result: Final result from the team/agent
        task_failed: Whether the task failed (for proper LLM response)
        streaming: Enable streaming in agents
        cua_client: CUA client for browser control (optional, set by LiveKit agent)
        context: Conversation context from LiveKit Agent
    """
    messages: Annotated[list[BaseMessage], add_messages]
    next: str
    team: str
    task_result: str
    task_failed: bool  # Track if the task failed (for proper LLM response)
    streaming: bool  # Enable streaming in agents
    cua_client: Optional[Any]  # CUAClient instance (Any to avoid circular import)
    context: Optional[ConversationContext]  # Conversation context from LiveKit Agent
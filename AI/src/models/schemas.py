"""
Pydantic models for structured outputs
Ensures all agent responses follow consistent schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


# ==================== Agent State Models ====================

class AgentResponse(BaseModel):
    """Base model for all agent responses"""
    success: bool = Field(description="Whether the operation was successful")
    message: str = Field(description="Human-readable response message")
    timestamp: datetime = Field(default_factory=datetime.now, description="When the response was generated")


class OrchestratorResponse(BaseModel):
    """Response from the orchestrator agent"""
    success: bool = Field(description="Whether the task completed successfully")
    team: str = Field(description="Which team handled the request (web, email, form, general)")
    result: str = Field(description="The actual content/answer for the user")
    error: Optional[str] = Field(default=None, description="Error message if task failed")
    timestamp: datetime = Field(default_factory=datetime.now)


class WebBrowsingResponse(BaseModel):
    """Response from web browsing operations"""
    success: bool = Field(description="Whether browsing was successful")
    url: Optional[str] = Field(default=None, description="URL that was browsed")
    content: str = Field(description="Extracted and cleaned content")
    content_type: Literal["headlines", "article", "search_results", "general"] = Field(
        default="general",
        description="Type of content extracted"
    )
    timestamp: datetime = Field(default_factory=datetime.now)


class ApplicationCommand(BaseModel):
    """Command to open an application"""
    type: Literal["open_app"] = Field(default="open_app")
    app: str = Field(description="Application name to open")
    timestamp: datetime = Field(default_factory=datetime.now)


class NavigationCommand(BaseModel):
    """Command to navigate to a URL"""
    type: Literal["navigate"] = Field(default="navigate")
    url: str = Field(description="URL to navigate to")
    timestamp: datetime = Field(default_factory=datetime.now)


class ScreenReadCommand(BaseModel):
    """Command to read screen content"""
    type: Literal["read_screen"] = Field(default="read_screen")
    section: Literal["all", "main", "headers", "links", "emails"] = Field(
        default="all",
        description="Which section of the screen to read"
    )
    timestamp: datetime = Field(default_factory=datetime.now)


class TimeResponse(BaseModel):
    """Response for time/date queries"""
    success: bool = Field(default=True)
    time: str = Field(description="Formatted time string")
    date: str = Field(description="Formatted date string")
    full_response: str = Field(description="Complete human-readable response")
    timestamp: datetime = Field(default_factory=datetime.now)


# ==================== Tool Input Models ====================

class OrchestratorInput(BaseModel):
    """Input for orchestrator agent"""
    task: str = Field(description="The user's request in natural language")


class ApplicationInput(BaseModel):
    """Input for opening applications"""
    app_name: str = Field(description="Name of the application to open")


class NavigationInput(BaseModel):
    """Input for URL navigation"""
    url: str = Field(description="URL or website name to navigate to")


class ScreenReadInput(BaseModel):
    """Input for reading screen content"""
    section: Literal["all", "main", "headers", "links", "emails"] = Field(
        default="all",
        description="Which section to read"
    )


# ==================== Streaming Models ====================

class StreamChunk(BaseModel):
    """Individual chunk in a streaming response"""
    content: str = Field(description="The chunk content")
    chunk_index: int = Field(description="Position in the stream")
    is_final: bool = Field(default=False, description="Whether this is the last chunk")
    timestamp: datetime = Field(default_factory=datetime.now)


class ProgressData(BaseModel):
    """Structured progress data - LLM uses this to generate speech"""
    event_type: str = Field(description="Progress event type (browser_init, navigating, captcha_detected, content_chunk, etc.)")
    url: Optional[str] = Field(default=None, description="URL being navigated to")
    domain: Optional[str] = Field(default=None, description="Domain name")
    captcha_type: Optional[str] = Field(default=None, description="Type of captcha encountered")
    error: Optional[str] = Field(default=None, description="Error message if any")
    task: Optional[str] = Field(default=None, description="User's original task/request for context")
    data: Optional[dict] = Field(default=None, description="Additional data (e.g., text for content_chunk events)")


class OrchestratorStreamResponse(BaseModel):
    """Streaming response from orchestrator"""
    chunk: str = Field(default="", description="Content chunk to be spoken (for actual content)")
    chunk_number: int = Field(description="Sequential chunk number")
    team: str = Field(description="Which team is handling this (web, stagehand, progress)")
    is_complete: bool = Field(default=False, description="Whether streaming is complete")
    is_progress: bool = Field(default=False, description="Whether this is a progress update vs actual content")
    progress_data: Optional[ProgressData] = Field(default=None, description="Structured progress data for LLM to interpret")
    task_failed: bool = Field(default=False, description="Whether the task failed (for proper LLM response)")
    timestamp: datetime = Field(default_factory=datetime.now)
    
    def to_speech_text(self) -> str:
        """Extract just the text for TTS (only for content, not progress)"""
        return self.chunk
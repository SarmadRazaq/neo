"""
CUA Command and Response Models
Matches the Frontend's expected format in LiveKitVoiceScreen.tsx
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
import uuid


# ==================== Commands (AI → Frontend) ====================

class CUACommand(BaseModel):
    """Base command sent to Frontend"""
    type: str
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    requestId: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])


class NavigateCommand(CUACommand):
    """Navigate browser to URL"""
    type: Literal["navigate"] = "navigate"
    url: str


class ClickCommand(CUACommand):
    """Click at coordinates"""
    type: Literal["click"] = "click"
    x: int
    y: int


class TypeCommand(CUACommand):
    """Type text into focused element"""
    type: Literal["type"] = "type"
    text: str


class KeyPressCommand(CUACommand):
    """Press a keyboard key"""
    type: Literal["key_press"] = "key_press"
    key: str  # e.g., "Enter", "Tab", "Escape"


class ScrollCommand(CUACommand):
    """Scroll the page"""
    type: Literal["scroll"] = "scroll"
    direction: Literal["up", "down", "left", "right"]
    amount: int = 300


class ScreenshotCommand(CUACommand):
    """Take a screenshot"""
    type: Literal["screenshot"] = "screenshot"


class GetBrowserStateCommand(CUACommand):
    """Get current browser state"""
    type: Literal["get_browser_state"] = "get_browser_state"


# ==================== Responses (Frontend → AI) ====================

class ScreenshotData(BaseModel):
    """Screenshot data from browser"""
    data: str  # Base64 encoded PNG
    width: int
    height: int
    format: Literal["png"] = "png"


class BrowserState(BaseModel):
    """Current browser state"""
    url: Optional[str] = None
    title: Optional[str] = None
    isActive: bool = False
    viewport: dict = Field(default_factory=lambda: {"width": 0, "height": 0})


class CUAResponse(BaseModel):
    """Response from Frontend after executing command"""
    type: Literal["cua_result"] = "cua_result"
    success: bool
    commandType: str
    requestId: Optional[str] = None
    error: Optional[str] = None
    screenshot: Optional[ScreenshotData] = None
    browserState: Optional[BrowserState] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())


# ==================== Stagehand Models ====================

class StagehandTaskCommand(CUACommand):
    """High-level task command for Stagehand AI browser automation"""
    type: Literal["stagehand_task"] = "stagehand_task"
    instruction: str = Field(description="Natural language task instruction")
    url: Optional[str] = Field(default=None, description="Starting URL for the task")
    maxSteps: int = Field(default=20, description="Maximum steps for agent execution")


class CancelTaskCommand(CUACommand):
    """Cancel the currently running Stagehand task"""
    type: Literal["cancel_task"] = "cancel_task"
    reason: str = Field(default="user_interrupted", description="Reason for cancellation")


class StagehandTaskResult(BaseModel):
    """Result from a Stagehand task execution"""
    message: Optional[str] = Field(default=None, description="Summary or result of the task")
    data: Optional[str] = Field(default=None, description="Additional extracted data")
    actions: Optional[list[str]] = Field(default=None, description="Actions performed")
    captchaSolved: Optional[bool] = Field(default=None, description="True if a captcha was encountered and solved")


class StagehandResponse(BaseModel):
    """Response from Frontend after Stagehand task execution"""
    type: Literal["cua_result"] = "cua_result"
    success: bool
    commandType: Literal["stagehand_task"] = "stagehand_task"
    requestId: str
    error: Optional[str] = None
    taskResult: Optional[StagehandTaskResult] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    
    class Config:
        # Allow population by field name for JSON parsing
        populate_by_name = True

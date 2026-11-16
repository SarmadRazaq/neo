"""
CUA Client - Sends commands to Frontend via LiveKit and waits for responses
Uses LiveKit Text Streams for large payloads (no size limit)
"""
import asyncio
import json
import logging
from typing import Optional, Dict, Any, Callable, List
from datetime import datetime
from dataclasses import dataclass

from cua.commands import (
    CUACommand,
    CUAResponse,
    NavigateCommand,
    ClickCommand,
    TypeCommand,
    KeyPressCommand,
    ScrollCommand,
    ScreenshotCommand,
    GetBrowserStateCommand,
    BrowserState,
    StagehandTaskCommand,
    StagehandResponse,
    StagehandTaskResult,
    CancelTaskCommand,
)

logger = logging.getLogger("cua-client")

# Topic for receiving agent responses via Text Streams
AGENT_RESPONSE_TOPIC = "agent-response"

# Topic for receiving progress events
PROGRESS_TOPIC = "stagehand-progress"


@dataclass
class ProgressEvent:
    """Structured progress event from Frontend - LLM uses this to generate speech"""
    type: str  # e.g., 'browser_init', 'navigating', 'captcha_detected'
    data: Dict[str, Any]  # Structured metadata (url, domain, captchaType, etc.)
    timestamp: Optional[str] = None


class CUAClient:
    """
    CUA (Computer Use Agent) Client
    
    Sends commands to the Frontend via LiveKit data channel
    and waits for responses.
    
    Usage:
        cua = CUAClient(room)
        result = await cua.navigate("https://reddit.com")
        screenshot = await cua.screenshot()
    """
    
    def __init__(self, room, timeout: float = 30.0):
        """
        Initialize CUA client
        
        Args:
            room: LiveKit room instance with publish_data capability
            timeout: Default timeout for waiting for responses (seconds)
        """
        self.room = room
        self.timeout = timeout
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._chunk_buffer: Dict[str, Dict[str, Any]] = {}
        self._initialized = False
        self._text_stream_registered = False
        self._progress_stream_registered = False
        
        # Queue to hold progress events for consumers
        self._progress_queue: asyncio.Queue[ProgressEvent] = asyncio.Queue()
        
        # Track last known domain for context in follow-up questions
        self.last_domain: Optional[str] = None
        
        # Track last progress event time for activity-based timeout
        self._last_progress_time: float = 0.0
        
        logger.info("[CUA Client] Initialized")
    
    def register_text_stream_handler(self):
        """
        Register handler for Text Stream responses from Frontend
        Call this after the room is connected
        """
        if self._text_stream_registered:
            return
        
        if not self.room:
            logger.warning("[CUA] Cannot register text stream handler - no room")
            return
        
        async def handle_text_stream_async(reader, participant_identity):
            """Handle incoming text stream from Frontend"""
            try:
                # Read all the text from the stream
                text = await reader.read_all()
                logger.info(f"[CUA] ========== TEXT STREAM RECEIVED ==========")
                logger.info(f"[CUA] From participant: {participant_identity}")
                logger.info(f"[CUA] Raw text length: {len(text)} chars")
                logger.info(f"[CUA] Raw text (first 2000 chars): {text[:2000]}")
                
                # Parse as JSON response
                message = json.loads(text)
                request_id = message.get("requestId", "")
                
                # Log parsed message details
                logger.info(f"[CUA] Parsed message keys: {list(message.keys())}")
                logger.info(f"[CUA] Request ID: {request_id}")
                logger.info(f"[CUA] Success: {message.get('success')}")
                logger.info(f"[CUA] Command type: {message.get('commandType')}")
                
                # Log taskResult details if present
                task_result = message.get("taskResult")
                if task_result:
                    logger.info(f"[CUA] taskResult keys: {list(task_result.keys()) if isinstance(task_result, dict) else type(task_result)}")
                    logger.info(f"[CUA] taskResult.message (first 500): {str(task_result.get('message', ''))[:500] if isinstance(task_result, dict) else ''}")
                    logger.info(f"[CUA] taskResult.data (first 500): {str(task_result.get('data', ''))[:500] if isinstance(task_result, dict) else ''}")
                else:
                    logger.info(f"[CUA] taskResult: None")
                
                # Resolve pending request if exists
                if request_id in self._pending_requests:
                    future = self._pending_requests[request_id]
                    if not future.done():
                        future.set_result(message)
                        logger.debug(f"[CUA] Resolved pending request: {request_id}")
                else:
                    logger.warning(f"[CUA] Received response for unknown request: {request_id}")
                    
            except json.JSONDecodeError as e:
                logger.error(f"[CUA] Failed to parse text stream as JSON: {e}")
            except Exception as e:
                logger.error(f"[CUA] Error handling text stream: {e}")
        
        def handle_text_stream(reader, participant_identity):
            """Sync wrapper that schedules the async handler"""
            asyncio.create_task(handle_text_stream_async(reader, participant_identity))
        
        # Register the handler for agent responses
        self.room.register_text_stream_handler(AGENT_RESPONSE_TOPIC, handle_text_stream)
        self._text_stream_registered = True
        logger.info(f"[CUA] Registered text stream handler for topic: {AGENT_RESPONSE_TOPIC}")
        
        # Also register progress stream handler
        self.register_progress_stream_handler()
    
    def register_progress_stream_handler(self):
        """
        Register handler for progress events from Frontend
        Call this after the room is connected
        """
        if self._progress_stream_registered:
            return
        
        if not self.room:
            logger.warning("[CUA] Cannot register progress handler - no room")
            return
        
        async def handle_progress_async(reader, participant_identity):
            """Handle incoming progress stream from Frontend"""
            try:
                text = await reader.read_all()
                logger.debug(f"[CUA] Progress event received: {text[:200]}")
                
                message = json.loads(text)
                
                # Create structured progress event
                progress = ProgressEvent(
                    type=message.get("type", "unknown"),
                    data=message.get("data", {}),
                    timestamp=message.get("timestamp"),
                )
                
                logger.info(f"[CUA] Progress: {progress.type} data={progress.data}")
                
                # Track domain for context in follow-up questions
                if progress.data.get("domain"):
                    self.last_domain = progress.data["domain"]
                    logger.debug(f"[CUA] Updated last_domain: {self.last_domain}")
                
                # Update last progress time for activity-based timeout
                self._last_progress_time = asyncio.get_event_loop().time()
                
                # Put in queue for consumers
                await self._progress_queue.put(progress)
                
            except json.JSONDecodeError as e:
                logger.error(f"[CUA] Failed to parse progress as JSON: {e}")
            except Exception as e:
                logger.error(f"[CUA] Error handling progress: {e}")
        
        def handle_progress(reader, participant_identity):
            """Sync wrapper"""
            asyncio.create_task(handle_progress_async(reader, participant_identity))
        
        self.room.register_text_stream_handler(PROGRESS_TOPIC, handle_progress)
        self._progress_stream_registered = True
        logger.info(f"[CUA] Registered progress handler for topic: {PROGRESS_TOPIC}")
    
    async def get_progress(self, timeout: float = 0.1) -> Optional[ProgressEvent]:
        """
        Get next progress event if available
        
        Args:
            timeout: How long to wait for event (default 0.1s)
            
        Returns:
            ProgressEvent or None if queue is empty
        """
        try:
            return await asyncio.wait_for(self._progress_queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None
    
    def clear_progress_queue(self):
        """Clear all pending progress events"""
        while not self._progress_queue.empty():
            try:
                self._progress_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
    
    async def _send_command(self, command: CUACommand) -> CUAResponse:
        """
        Send command and wait for response
        
        Args:
            command: CUACommand to send
            
        Returns:
            CUAResponse from Frontend
            
        Raises:
            TimeoutError: If response not received within timeout
            RuntimeError: If room not available
        """
        if not self.room:
            raise RuntimeError("LiveKit room not available")
        
        request_id = command.requestId
        
        # Create future for this request
        future: asyncio.Future[CUAResponse] = asyncio.Future()
        self._pending_requests[request_id] = future
        
        try:
            # Send command via LiveKit data channel
            command_json = command.model_dump_json()
            logger.info(f"[CUA] Sending command: {command.type} (id={request_id})")
            
            await self.room.local_participant.publish_data(
                command_json.encode(),
                reliable=True
            )
            
            # Wait for response with timeout
            response = await asyncio.wait_for(future, timeout=self.timeout)
            logger.info(f"[CUA] Response received for {command.type}: {'success' if response.success else response.error}")
            
            return response
            
        except asyncio.TimeoutError:
            logger.error(f"[CUA] Timeout waiting for response to {command.type} (id={request_id})")
            raise TimeoutError(f"CUA command {command.type} timed out after {self.timeout}s")
            
        finally:
            # Clean up pending request
            self._pending_requests.pop(request_id, None)
    
    def handle_response(self, data: bytes) -> bool:
        """
        Handle incoming response from Frontend
        
        Called by LiveKit data channel handler.
        
        Args:
            data: Raw bytes from data channel
            
        Returns:
            True if this was a CUA response that was handled
        """
        try:
            message = json.loads(data.decode())
            
            # Check if this is a CUA response
            if message.get("type") != "cua_result":
                return False
            
            response = CUAResponse(**message)
            request_id = response.requestId
            
            # Find and resolve the pending request
            if request_id and request_id in self._pending_requests:
                future = self._pending_requests[request_id]
                if not future.done():
                    future.set_result(response)
                    return True
            else:
                logger.warning(f"[CUA] Received response for unknown request: {request_id}")
            
            return True
            
        except json.JSONDecodeError:
            return False
        except Exception as e:
            logger.error(f"[CUA] Error handling response: {e}")
            return False
    
    # ==================== High-Level Commands ====================
    
    async def navigate(self, url: str) -> CUAResponse:
        """
        Navigate browser to URL
        
        Args:
            url: URL to navigate to
            
        Returns:
            CUAResponse with success status
        """
        # Ensure URL has protocol
        if not url.startswith("http"):
            url = f"https://{url}"
        
        command = NavigateCommand(url=url)
        return await self._send_command(command)
    
    async def click(self, x: int, y: int) -> CUAResponse:
        """
        Click at coordinates
        
        Args:
            x: X coordinate
            y: Y coordinate
            
        Returns:
            CUAResponse with success status
        """
        command = ClickCommand(x=x, y=y)
        return await self._send_command(command)
    
    async def type_text(self, text: str) -> CUAResponse:
        """
        Type text into focused element
        
        Args:
            text: Text to type
            
        Returns:
            CUAResponse with success status
        """
        command = TypeCommand(text=text)
        return await self._send_command(command)
    
    async def key_press(self, key: str) -> CUAResponse:
        """
        Press a keyboard key
        
        Args:
            key: Key to press (e.g., "Enter", "Tab", "Escape")
            
        Returns:
            CUAResponse with success status
        """
        command = KeyPressCommand(key=key)
        return await self._send_command(command)
    
    async def scroll(
        self, 
        direction: str = "down", 
        amount: int = 300
    ) -> CUAResponse:
        """
        Scroll the page
        
        Args:
            direction: "up", "down", "left", or "right"
            amount: Pixels to scroll
            
        Returns:
            CUAResponse with success status
        """
        command = ScrollCommand(direction=direction, amount=amount)
        return await self._send_command(command)
    
    async def screenshot(self) -> CUAResponse:
        """
        Take a screenshot of the browser
        
        Returns:
            CUAResponse with screenshot data (base64 PNG)
        """
        command = ScreenshotCommand()
        return await self._send_command(command)
    
    async def get_browser_state(self) -> CUAResponse:
        """
        Get current browser state (URL, title, viewport)
        
        Returns:
            CUAResponse with browserState
        """
        command = GetBrowserStateCommand()
        return await self._send_command(command)
    
    # ==================== Composite Actions ====================
    
    async def navigate_and_screenshot(self, url: str) -> tuple[CUAResponse, CUAResponse]:
        """
        Navigate to URL and take screenshot
        
        Args:
            url: URL to navigate to
            
        Returns:
            Tuple of (navigate_response, screenshot_response)
        """
        nav_response = await self.navigate(url)
        
        if not nav_response.success:
            return nav_response, None
        
        # Wait a bit for page to render
        await asyncio.sleep(1)
        
        screenshot_response = await self.screenshot()
        return nav_response, screenshot_response
    
    async def click_and_wait(self, x: int, y: int, wait_ms: int = 500) -> CUAResponse:
        """
        Click and wait for page update
        
        Args:
            x: X coordinate
            y: Y coordinate
            wait_ms: Milliseconds to wait after click
            
        Returns:
            CUAResponse with success status
        """
        response = await self.click(x, y)
        
        if response.success:
            await asyncio.sleep(wait_ms / 1000)
        
        return response
    
    # ==================== Stagehand Integration ====================
    
    async def send_stagehand_task(self, command: StagehandTaskCommand) -> StagehandResponse:
        """
        Send a Stagehand task to the Frontend
        
        Uses activity-based timeout: keeps waiting as long as progress events
        are being received. Times out after inactivity_timeout seconds of no activity.
        
        Args:
            command: StagehandTaskCommand with instruction, optional URL, and maxSteps
                
        Returns:
            StagehandResponse with success status and taskResult
        """
        if not self.room:
            raise RuntimeError("LiveKit room not available")
        
        # Ensure request ID has stagehand prefix for routing
        if not command.requestId.startswith("stagehand-"):
            command.requestId = f"stagehand-{command.requestId}"
        
        request_id = command.requestId
        
        # Create future for this request
        future: asyncio.Future[Dict[str, Any]] = asyncio.Future()
        self._pending_requests[request_id] = future
        
        # Activity-based timeout settings
        inactivity_timeout = 45.0  # Timeout after 45s of no progress events
        max_total_timeout = 300.0  # Hard cap at 5 minutes total
        poll_interval = 0.5  # Check every 500ms
        
        try:
            # Send task via LiveKit data channel
            task_json = command.model_dump_json()
            logger.info(f"[CUA] Sending Stagehand task: {command.instruction[:50]}...")
            
            await self.room.local_participant.publish_data(
                task_json.encode(),
                reliable=True
            )
            
            # Initialize activity tracking
            loop = asyncio.get_event_loop()
            start_time = loop.time()
            self._last_progress_time = start_time  # Reset progress time when task starts
            
            # Activity-based wait loop
            while True:
                current_time = loop.time()
                elapsed_total = current_time - start_time
                
                # Use the more recent of: task start time or last progress event
                last_activity = max(start_time, self._last_progress_time)
                elapsed_since_activity = current_time - last_activity
                
                # Check for hard timeout (safety net)
                if elapsed_total > max_total_timeout:
                    logger.error(f"[CUA] Hard timeout after {max_total_timeout:.0f}s for task {request_id}")
                    return StagehandResponse(
                        success=False,
                        requestId=request_id,
                        error=f"Task exceeded maximum time of {max_total_timeout:.0f} seconds"
                    )
                
                # Check for inactivity timeout
                if elapsed_since_activity > inactivity_timeout:
                    logger.error(f"[CUA] Inactivity timeout after {inactivity_timeout:.0f}s (no progress) for task {request_id}")
                    return StagehandResponse(
                        success=False,
                        requestId=request_id,
                        error=f"Task timed out after {inactivity_timeout:.0f} seconds of no activity"
                    )
                
                # Check if task completed
                if future.done():
                    response_dict = future.result()
                    response = StagehandResponse.model_validate(response_dict)
                    logger.info(f"[CUA] Stagehand task completed in {elapsed_total:.1f}s: {'success' if response.success else response.error}")
                    return response
                
                # Wait before next check
                await asyncio.sleep(poll_interval)
            
        except Exception as e:
            logger.error(f"[CUA] Error in Stagehand task: {e}")
            return StagehandResponse(
                success=False,
                requestId=request_id,
                error=str(e)
            )
            
        finally:
            # Clean up pending request
            self._pending_requests.pop(request_id, None)
    
    def handle_stagehand_response(self, data: bytes) -> bool:
        """
        Handle incoming Stagehand response from Frontend (legacy data channel path)
        
        Note: Large responses now use Text Streams instead. This is kept for
        small responses or backwards compatibility.
        
        Args:
            data: Raw bytes from data channel
            
        Returns:
            True if this was a Stagehand response that was handled
        """
        try:
            message = json.loads(data.decode())
            
            # Check if this is a CUA response (Stagehand uses same format)
            if message.get("type") != "cua_result":
                return False
            
            request_id = message.get("requestId", "")
            
            # Check if this is a Stagehand task response
            if not request_id.startswith("stagehand-"):
                return False
            
            # Find and resolve the pending request
            if request_id in self._pending_requests:
                future = self._pending_requests[request_id]
                if not future.done():
                    logger.info(f"[CUA] Received Stagehand response via data channel: {request_id}")
                    future.set_result(message)
                    return True
            else:
                logger.warning(f"[CUA] Received Stagehand response for unknown request: {request_id}")
            
            return True
            
        except json.JSONDecodeError:
            return False
        except Exception as e:
            logger.error(f"[CUA] Error handling Stagehand response: {e}")
            return False
    
    async def cancel_current_task(self, reason: str = "user_interrupted") -> None:
        """
        Cancel the currently running Stagehand task
        
        This is a fire-and-forget command - we don't wait for a response.
        The frontend will abort the running task and stop sending progress events.
        
        Args:
            reason: Reason for cancellation (for logging)
        """
        if not self.room:
            logger.warning("[CUA] Cannot cancel task - room not available")
            return
        
        try:
            command = CancelTaskCommand(reason=reason)
            command_json = command.model_dump_json()
            
            logger.info(f"[CUA] Sending cancel command: {reason}")
            
            # Fire and forget - don't wait for response
            await self.room.local_participant.publish_data(
                command_json.encode(),
                reliable=True
            )
            
            # Also clear any pending progress events
            self.clear_progress_queue()
            
        except Exception as e:
            logger.error(f"[CUA] Error sending cancel command: {e}")

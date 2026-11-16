"""
Web Task Tool

The main orchestrator tool for browser-based tasks.
Handles progress updates and streaming responses.
"""
import asyncio
from typing import TYPE_CHECKING, Any, Optional

from livekit.agents import RunContext

from config import FALLBACK_INTERVAL, PROGRESS_SPEECH_COOLDOWN
from progress import generate_progress_message, generate_fallback_message
from state.state import ConversationContext
from utils.logger import get_logger

if TYPE_CHECKING:
    from orchestrator import NEOAssistant

logger = get_logger("neo-agent")


async def execute_web_task(
    context: RunContext, 
    task: str, 
    orchestrator: Any, 
    cua_client: Any,
    conversation_context: Optional[ConversationContext] = None
) -> str:
    """
    Process a task using the orchestrator with real-time progress updates.
    
    The agent (LLM) decides what to say before calling this tool.
    Real progress events from Stagehand will be spoken as they arrive.
    
    Args:
        task: The user's task description (e.g., "read headlines from Reddit")
        conversation_context: Optional context from previous interactions
    """
    task_preview = f"'{task[:80]}...'" if len(task) > 80 else f"'{task}'"
    logger.info(f"[TOOL] trigger_orchestrator_agent: {task_preview}")
    
    # Log context if available
    if conversation_context:
        ctx_str = conversation_context.to_context_string()
        if ctx_str:
            logger.info(f"[TOOL] Context: {ctx_str[:100]}...")
    
    if not orchestrator:
        logger.error("[TOOL] Orchestrator not available")
        return "I'm sorry, I can't process this request right now."
    
    # Shared state for tracking speech timing
    # Use a mutable container to share state between coroutines
    state = {
        "chunk_count": 0,
        "has_spoken_content": False,
        "has_spoken_any_progress": False,
        "task_failed": False,  # Track if the task failed (for proper LLM response)
        "user_interrupted": False,  # Track if user interrupted to stop processing
        "last_speech_time": asyncio.get_event_loop().time(),
        "last_progress_speech_time": 0.0,
        "last_progress_event_type": None,  # Track last spoken event type
        "last_progress_domain": None,      # Track domain for contextual fallback
        "is_complete": False,
        "is_speaking": False,  # Prevent fallback during active speech
        "fallback_count": 0,   # Track how many fallbacks we've done
        "spoken_content": "",  # Accumulate content that was spoken (for context)
        "last_team": None,     # Track which team handled this (from orchestrator)
    }
    
    def update_speech_time():
        """Update last_speech_time with current time."""
        state["last_speech_time"] = asyncio.get_event_loop().time()
    
    # Background task for periodic fallback reassurance
    async def fallback_loop():
        """Check every 2s if we need to provide reassurance using LLM-generated messages."""
        while not state["is_complete"]:
            await asyncio.sleep(2.0)  # Check every 2 seconds
            
            if state["is_complete"] or state["has_spoken_content"]:
                break
            
            # Skip if currently speaking (progress message in flight)
            if state["is_speaking"]:
                continue
            
            current_time = asyncio.get_event_loop().time()
            time_since_last_speech = current_time - state["last_speech_time"]
            
            if time_since_last_speech > FALLBACK_INTERVAL:
                # Use LLM to generate natural fallback message
                message = await generate_fallback_message(
                    task=task,
                    domain=state["last_progress_domain"],
                    wait_count=state["fallback_count"]
                )
                state["fallback_count"] += 1
                logger.debug(f"[FALLBACK] {message} (no speech for {time_since_last_speech:.1f}s)")
                await context.session.say(message)
                update_speech_time()
    
    # Start fallback task in background
    fallback_task = asyncio.create_task(fallback_loop())
    
    try:
        async for stream_response in orchestrator.process_request_stream(task, conversation_context):
            # Early exit if user interrupted - stop processing all chunks
            if state["user_interrupted"]:
                logger.info("[TOOL] User interrupted, breaking out of stream loop")
                break
            
            current_time = asyncio.get_event_loop().time()
            
            # Access structured fields
            chunk_num = stream_response.chunk_number
            team = stream_response.team
            is_done = stream_response.is_complete
            is_progress = getattr(stream_response, 'is_progress', False)
            progress_data = getattr(stream_response, 'progress_data', None)
            
            # Track if this task failed (from content cleaner error detection)
            if getattr(stream_response, 'task_failed', False):
                state["task_failed"] = True
            
            # Track which team is handling this request
            if team and team != state["last_team"]:
                state["last_team"] = team
                logger.debug(f"[TOOL] Team: {team}")
            
            # Handle structured progress updates
            if is_progress and progress_data:
                logger.debug(f"[PROGRESS] Received: type={progress_data.event_type} domain={progress_data.domain}")
                
                # Skip stale cancellation errors from previous tasks
                # These happen when a previous task was cancelled and the error event
                # is still in the queue when a new task starts
                if progress_data.event_type == "error":
                    error_msg = progress_data.data.get("error", "") if progress_data.data else ""
                    if "cancelled" in error_msg.lower() or "canceled" in error_msg.lower():
                        logger.debug(f"[PROGRESS] Skipping stale cancellation error: {error_msg}")
                        continue
                
                # SPECIAL: Handle content_chunk events - speak immediately without LLM processing
                # These are streaming content chunks from Stagehand that should be spoken as-is
                if progress_data.event_type == "content_chunk":
                    # Skip if user has interrupted - stop processing more chunks
                    if state.get("user_interrupted"):
                        logger.debug(f"[CONTENT_CHUNK] Skipping (user interrupted)")
                        continue
                    
                    chunk_text = progress_data.data.get("text", "") if progress_data.data else ""
                    
                    if chunk_text and chunk_text.strip():
                        logger.info(f"[CONTENT_CHUNK] Speaking {len(chunk_text)} chars: {chunk_text[:80]}...")
                        
                        # Mark as speaking to prevent fallback
                        state["is_speaking"] = True
                        try:
                            # Speak the chunk immediately - no LLM processing needed
                            # say() returns a SpeechHandle we can check for interruption
                            # Per LiveKit docs: await the handle directly to wait for playout
                            speech_handle = await context.session.say(chunk_text, allow_interruptions=True)
                            
                            # Check if user interrupted - if so, stop processing further chunks
                            if speech_handle.interrupted:
                                logger.info(f"[CONTENT_CHUNK] User interrupted, stopping chunk processing")
                                state["user_interrupted"] = True
                                state["is_complete"] = True
                                
                                # Send cancel command to frontend to stop Stagehand
                                if cua_client:
                                    try:
                                        await cua_client.cancel_current_task("user_interrupted")
                                    except Exception as e:
                                        logger.warning(f"[CONTENT_CHUNK] Failed to send cancel: {e}")
                                
                                continue
                            
                            # Update state
                            update_speech_time()
                            state["has_spoken_content"] = True
                            state["spoken_content"] += chunk_text + " "
                            state["last_progress_domain"] = progress_data.domain
                            state["fallback_count"] = 0  # Reset fallback count
                        finally:
                            state["is_speaking"] = False
                    
                    continue  # Don't process as regular progress
                
                # Skip regular progress events once content has been spoken to avoid stale/confusing updates
                if state["has_spoken_content"]:
                    logger.debug(f"[PROGRESS] Skipping (content already spoken): {progress_data.event_type}")
                    continue
                
                # Skip if same event type was just spoken (prevents "interacting, interacting, interacting")
                if progress_data.event_type == state["last_progress_event_type"]:
                    logger.debug(f"[PROGRESS] Skipping (same type as last): {progress_data.event_type}")
                    continue
                
                # Rate limit progress speech to avoid too much chatter
                # Use fresh time for accurate rate limiting
                now = asyncio.get_event_loop().time()
                time_since_last_progress = now - state["last_progress_speech_time"]
                
                if time_since_last_progress < PROGRESS_SPEECH_COOLDOWN:
                    logger.debug(f"[PROGRESS] Skipping (rate limited, {time_since_last_progress:.1f}s < {PROGRESS_SPEECH_COOLDOWN}s): {progress_data.event_type}")
                    continue
                
                # Mark as speaking to prevent fallback from interrupting
                state["is_speaking"] = True
                
                try:
                    # Generate natural message with LLM, then speak with say()
                    message = await generate_progress_message(progress_data)
                    
                    if not message:
                        logger.debug(f"[PROGRESS] Skipping event: {progress_data.event_type}")
                        continue
                    
                    logger.info(f"[PROGRESS] Speaking: {progress_data.event_type} -> '{message}'")
                    
                    # Use say() for exact speech (no additional LLM interpretation)
                    await context.session.say(message)
                    
                    # Update times AFTER speech starts (use fresh timestamp)
                    update_speech_time()
                    state["last_progress_speech_time"] = asyncio.get_event_loop().time()
                    state["last_progress_event_type"] = progress_data.event_type
                    state["last_progress_domain"] = progress_data.domain  # Track for contextual fallback
                    state["has_spoken_any_progress"] = True
                    state["fallback_count"] = 0  # Reset fallback count on new progress
                finally:
                    state["is_speaking"] = False
                
                continue  # Don't process as regular content
            
            # Extract text from the stream response
            text = stream_response.chunk or ""
            text_len = len(text)
            
            # Log chunk info at debug level
            logger.debug(f"[TTS] Chunk {chunk_num} from {team}: {text_len} chars")
            
            # Skip final content if we already spoke via streaming chunks
            # This prevents the "clashing messages" issue where content is spoken twice
            if state["has_spoken_content"] and text.strip():
                logger.debug(f"[TTS] Skipping final content (already streamed {len(state['spoken_content'])} chars)")
                continue
            
            # Warn if text seems too long (>2000 chars per chunk is unusual)
            if text_len > 2000:
                logger.warning(f"[TTS] Large chunk detected ({text_len} chars), truncating...")
                text = text[:2000] + "... content truncated for speech."
            
            # Skip empty chunks
            if text.strip():
                if not state["has_spoken_content"]:
                    state["has_spoken_content"] = True
                
                # Accumulate content for context (for follow-up questions)
                state["spoken_content"] += text + "\n"
                
                # Use say() for reliable verbatim content reading
                # This ensures the exact content is spoken without LLM interpretation
                await context.session.say(text, allow_interruptions=True)
                update_speech_time()
            else:
                logger.debug(f"[TTS] Skipping empty chunk {chunk_num}")
            
            state["chunk_count"] += 1
            
            if is_done:
                logger.info(f"[TOOL] Orchestrator complete: team={team}, chunks={state['chunk_count']}")
                break
    finally:
        # Stop fallback task
        state["is_complete"] = True
        fallback_task.cancel()
        try:
            await fallback_task
        except asyncio.CancelledError:
            pass
    
    # Clear any remaining stale progress events to avoid affecting next request
    if cua_client:
        cua_client.clear_progress_queue()
        logger.debug("[TOOL] Cleared progress queue")
    
    # Store spoken content and team in conversation context for follow-up questions
    if conversation_context:
        if state["spoken_content"]:
            conversation_context.set_last_content(state["spoken_content"])
        if state["last_team"]:
            conversation_context.last_team = state["last_team"]
        logger.info(f"[TOOL] Context updated: team={state['last_team']}, content_len={len(state['spoken_content'])}")
    
    # Return status for the LLM (content was already spoken via say())
    # IMPORTANT: If task failed, return explicit failure message so LLM doesn't claim success
    if state["user_interrupted"]:
        return "[User interrupted - stopped reading content. Wait for user's next request.]"
    elif state["task_failed"]:
        return "[Task FAILED - an error message was spoken to the user. Do NOT claim success or say you have the information. Ask if they want to try again.]"
    elif state["has_spoken_content"]:
        return "[Content was spoken to the user successfully]"
    elif state["has_spoken_any_progress"]:
        return "[Progress updates were spoken, but no final content was available]"
    else:
        return "[Task completed but no content was found to speak]"

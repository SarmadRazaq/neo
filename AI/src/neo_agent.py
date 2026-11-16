"""
NEO Agent Entry Point

Main entry point for the voice AI assistant.
Based on LiveKit + LangGraph best practices.
"""
import os

from livekit.agents import (
    AgentServer,
    AgentSession,
    JobContext,
    cli,
)
from livekit.plugins import silero, elevenlabs, openai
from livekit import rtc

from assistant import Assistant
from config import LLM_MODEL, TTS_MODEL, TTS_SPEED, TTS_STABILITY, TTS_SIMILARITY_BOOST
from instructions import GREETING_INSTRUCTIONS
from utils.logger import setup_logging, get_logger

# Configure logging once at module level
setup_logging()
logger = get_logger("neo-agent")


def get_agent_name() -> str | None:
    """
    Get agent name from environment (Doppler).
    
    - If AGENT_NAME is set, use explicit dispatch with that name
    - If not set, use automatic dispatch (LiveKit assigns any available agent)
    
    The backend uses the same AGENT_NAME when generating tokens, ensuring
    the frontend connects to this specific agent.
    """
    agent_name = os.getenv("AGENT_NAME", "").strip()
    return agent_name if agent_name else None


# =============================================================================
# Server Setup
# =============================================================================

server = AgentServer()

# Get agent name from Doppler/environment (matches Backend logic)
AGENT_NAME = get_agent_name()

# Configure the session decorator based on whether we have an explicit name
if AGENT_NAME:
    logger.info(f"[Config] Agent name: '{AGENT_NAME}' (explicit dispatch)")
    session_decorator = server.rtc_session(agent_name=AGENT_NAME)
else:
    logger.info("[Config] Agent dispatch: automatic (no AGENT_NAME set)")
    session_decorator = server.rtc_session()


@session_decorator
async def my_agent(ctx: JobContext):
    """Main agent session handler."""
    logger.info(f"[Dispatch] *** AGENT RECEIVED JOB DISPATCH ***")
    ctx.log_context_fields = {"room": ctx.room.name}
    logger.info(f"[Session] Agent joining room: {ctx.room.name}")

    # Create assistant instance
    assistant = Assistant()
    
    # Set the room reference so tools can access it
    assistant.set_room(ctx.room)
    
    # Set up data channel listener for CUA and Stagehand responses
    @ctx.room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket):
        """Handle incoming data from frontend (CUA and Stagehand responses)"""
        if assistant.cua_client:
            # Try to handle as Stagehand response first (they start with "stagehand-")
            was_stagehand = assistant.cua_client.handle_stagehand_response(data_packet.data)
            if was_stagehand:
                logger.debug("[Session] Stagehand response handled")
                return
            
            # Try to handle as CUA response
            was_handled = assistant.cua_client.handle_response(data_packet.data)
            if was_handled:
                logger.debug("[Session] CUA response handled")
    
    logger.info("[Session] Data channel listener registered for CUA and Stagehand responses")

    # Voice AI pipeline with ElevenLabs STT/TTS and OpenAI LLM (via OpenRouter)
    session = AgentSession(
        stt=elevenlabs.STT(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
        ),
        llm=openai.LLM.with_openrouter(
            model=LLM_MODEL,
            app_name="NEO Assistant",
        ),
        tts=elevenlabs.TTS(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            model=TTS_MODEL,
            voice_settings=elevenlabs.VoiceSettings(
                stability=TTS_STABILITY,
                similarity_boost=TTS_SIMILARITY_BOOST,
                speed=TTS_SPEED,
            ),
        ),
        vad=silero.VAD.load(),
        userdata={"assistant": assistant},  # Pass assistant to tools via userdata
    )

    # =========================================================================
    # Session Event Handlers (LiveKit Native Observability)
    # =========================================================================
    
    @session.on("user_input_transcribed")
    def on_user_input(event):
        """Log what the user said (native LiveKit event)"""
        if event.is_final:
            logger.info(f"[USER] {event.transcript}")
    
    @session.on("conversation_item_added")
    def on_conversation_item(event):
        """Log what was added to conversation history (native LiveKit event)"""
        role = event.item.role  # 'user' or 'assistant'
        text = event.item.text_content or ""
        interrupted = event.item.interrupted
        
        if role == "assistant" and text:
            # Truncate long content for readability
            preview = text[:200].replace('\n', ' ') + ('...' if len(text) > 200 else '')
            status = " [INTERRUPTED]" if interrupted else ""
            logger.info(f"[AGENT]{status} ({len(text)} chars): {preview}")
    
    @session.on("agent_state_changed")
    def on_agent_state(event):
        """Log agent state transitions (native LiveKit event)"""
        logger.info(f"[STATE] {event.old_state} -> {event.new_state}")
    
    @session.on("speech_created")
    def on_speech_created(event):
        """Log when speech is created and its source"""
        logger.debug(f"[SPEECH] Created via {event.source}, user_initiated={event.user_initiated}")

    # Start the session
    await session.start(
        agent=assistant,
        room=ctx.room,
    )
    
    logger.info("[Session] Agent session started, waiting for user input...")

    # Greet the user
    await session.generate_reply(instructions=GREETING_INSTRUCTIONS)
    
    logger.info("[Session] Greeting sent to user")


if __name__ == "__main__":
    cli.run_app(server)

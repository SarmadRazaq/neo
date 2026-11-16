"""
NEO Agent Configuration

All tunable constants for the voice AI agent.
Based on LiveKit + LangGraph best practices.
"""
import os

# =============================================================================
# Timing Configuration
# =============================================================================

# Maximum time without speech before generating a fallback reassurance
FALLBACK_INTERVAL = 10.0  # 10 seconds

# Minimum seconds between progress updates
PROGRESS_SPEECH_COOLDOWN = 6.0

# =============================================================================
# Model Configuration
# =============================================================================

LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-4.1-mini")  # OpenRouter model format
TTS_MODEL = "eleven_turbo_v2_5"

# TTS Voice Settings
TTS_SPEED = 0.95  # Slightly slower than default (1.0) for clarity
TTS_STABILITY = 0.71  # Default stability
TTS_SIMILARITY_BOOST = 0.5  # Default similarity

# =============================================================================
# Progress Events Configuration
# =============================================================================

# Events to skip - these don't add value for the user
SKIP_EVENTS: set[str] = {
    "browser_init",   # Opening browser is not interesting
    "page_loaded",    # Too technical
    "task_complete",  # Content will be spoken anyway
}

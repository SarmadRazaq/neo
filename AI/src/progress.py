"""
Progress Reporter Agent

A lightweight LangGraph-style agent that generates natural progress messages.
Follows the same patterns as other agents in the codebase:
- Uses LangChain ChatOpenAI (via get_llm())
- Simple async function that takes data and returns result
- No manual if-else mapping - LLM understands event types directly

This agent runs in parallel with the main task graph.
"""
from langchain_core.messages import SystemMessage, HumanMessage

from config import SKIP_EVENTS
from models.schemas import ProgressData
from llm.client import get_llm
from utils.logger import get_logger

logger = get_logger("progress-agent")


# System prompt for the progress reporter agent
PROGRESS_AGENT_SYSTEM = """You are a voice assistant giving progress updates to a user.

Generate a natural, informative status update about what you're doing.

RULES:
- 10-15 words, one complete sentence
- ALWAYS include what you're doing AND where (site name if known)
- Include the user's task/goal if provided
- Sound natural, like talking to a friend
- Never ask questions
- Never claim completion until done

EXAMPLES:
- navigating + domain=reddit.com + task="read stories" 
  → "I'm opening Reddit to find some stories for you"
- content_extracting + domain=cnn.com + task="read headlines"
  → "I'm reading through the headlines on CNN now"
- captcha_detected + domain=example.com
  → "There's a security check on this site, working through it"
- captcha_solving + domain=example.com
  → "Still working on the security verification"
- searching + task="weather in NYC"
  → "Searching for the weather information you asked about"
- interacting + domain=reddit.com
  → "Interacting with the page on Reddit"
- error
  → "I ran into an issue, let me try a different approach"
- waiting + wait_count=0 + task="find recipes" + domain=allrecipes.com
  → "Still looking for those recipes on AllRecipes"
- waiting + wait_count=1 + domain=reddit.com
  → "Reddit is taking a bit longer than expected"
- waiting + wait_count=2 + task="check weather"
  → "Almost there, thanks for your patience"

BAD EXAMPLES (never do these):
- "Working on it" (too vague, no context)
- "Still on it, almost there" (no context about what or where)
- "Opening the browser" (no task context)
- "One moment" (uninformative)"""


async def generate_progress_message(progress: ProgressData) -> str | None:
    """
    Progress Reporter Agent - generates natural progress messages.
    
    Follows LangGraph patterns:
    - Uses LangChain ChatOpenAI (consistent with other agents)
    - Treats this as a pure function (takes data, returns result)
    - No manual event-type mapping - LLM understands from system prompt
    
    Args:
        progress: Structured progress data from any agent
        
    Returns:
        Generated message string, or None to skip this event.
    """
    if progress.event_type in SKIP_EVENTS:
        return None
    
    # Build context from progress data - simple key-value format
    # The LLM understands event types from the system prompt
    context_parts = [f"event_type: {progress.event_type}"]
    
    if progress.domain:
        context_parts.append(f"domain: {progress.domain}")
    if progress.url:
        context_parts.append(f"url: {progress.url}")
    if progress.captcha_type:
        context_parts.append(f"captcha_type: {progress.captcha_type}")
    if progress.error:
        context_parts.append(f"error: {progress.error}")
    if progress.task:
        context_parts.append(f"task: {progress.task}")
    
    context = "\n".join(context_parts)
    
    try:
        # Use LangChain ChatOpenAI - consistent with other agents
        llm = get_llm(temperature=0.5)  # Moderate temp: some variety but predictable
        
        response = await llm.ainvoke([
            SystemMessage(content=PROGRESS_AGENT_SYSTEM),
            HumanMessage(content=context)
        ])
        
        message = response.content.strip()
        
        # Remove quotes if LLM wrapped the response
        if message.startswith('"') and message.endswith('"'):
            message = message[1:-1]
        
        logger.debug(f"[Progress Agent] {progress.event_type} -> '{message}'")
        return message
        
    except Exception as e:
        logger.warning(f"[Progress Agent] LLM failed: {e}, using fallback")
        # Simple fallback - readable event type
        return progress.event_type.replace("_", " ").capitalize() + "."


async def generate_fallback_message(
    task: str, 
    domain: str | None = None, 
    wait_count: int = 0
) -> str:
    """
    Generate a natural fallback/waiting message using the LLM.
    
    Called when the browser is taking longer than expected and we need
    to reassure the user that we're still working.
    
    Args:
        task: The user's original task description
        domain: The current domain being accessed (if known)
        wait_count: How many times we've already given a waiting message (0, 1, 2+)
        
    Returns:
        Natural language message to speak to the user
    """
    # Build context for the LLM
    context_parts = ["event_type: waiting"]
    context_parts.append(f"wait_count: {wait_count}")
    
    if domain:
        context_parts.append(f"domain: {domain}")
    if task:
        # Truncate long tasks for context
        task_preview = task[:60] if len(task) > 60 else task
        context_parts.append(f"task: {task_preview}")
    
    context = "\n".join(context_parts)
    
    try:
        llm = get_llm(temperature=0.6)  # Slightly higher temp for variety in waiting messages
        
        response = await llm.ainvoke([
            SystemMessage(content=PROGRESS_AGENT_SYSTEM),
            HumanMessage(content=context)
        ])
        
        message = response.content.strip()
        
        # Remove quotes if LLM wrapped the response
        if message.startswith('"') and message.endswith('"'):
            message = message[1:-1]
        
        logger.debug(f"[Progress Agent] fallback (count={wait_count}) -> '{message}'")
        return message
        
    except Exception as e:
        logger.warning(f"[Progress Agent] Fallback LLM failed: {e}")
        # Simple fallback if LLM fails
        if wait_count == 0:
            return "Still working on that for you."
        elif wait_count == 1:
            return "This is taking a bit longer than expected."
        else:
            return "Almost done, thanks for your patience."

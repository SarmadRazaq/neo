"""
General Team Agent Worker
Handles general conversation, questions, and system information
"""
import logging
from datetime import datetime

from state.state import AgentState
from llm.client import get_llm
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

logger = logging.getLogger("general-team-agents")


GENERAL_AGENT_PROMPT = """You are NEO, a helpful voice assistant for visually impaired users.

Your role:
- Answer general questions clearly and concisely
- Provide helpful information
- Engage in friendly conversation
- Help users understand your capabilities

Guidelines:
- Keep responses conversational and easy to understand
- Avoid complex formatting or technical jargon
- Be empathetic and patient
- Prioritize clarity over completeness
- Format responses for text-to-speech output

Your capabilities:
- Web browsing and information extraction (via web team)
- Email management (coming soon via email team)
- Form filling assistance (coming soon via form team)
- General knowledge and conversation (that's you!)"""


async def general_conversation_agent(state: AgentState) -> AgentState:
    """
    General conversation agent node
    
    Handles:
    - General questions and conversation
    - Time/date queries
    - System capabilities
    - Friendly chat
    """
    logger.info("[General Agent] Processing general request...")
    
    user_message = state["messages"][-1].content if state["messages"] else ""
    
    # Handle time/date queries directly
    if any(word in user_message.lower() for word in ["time", "date", "today", "now"]):
        result = _get_current_datetime()
    else:
        # Use LLM for other general queries
        result = await _llm_response(user_message, state["messages"])
    
    # Store result
    state["task_result"] = result
    state["messages"].append(
        AIMessage(
            content=result,
            name="general_agent"
        )
    )
    
    logger.info("[General Agent] Response generated")
    
    return state


def _get_current_datetime() -> str:
    """Get current date and time in voice-friendly format"""
    now = datetime.now()
    return f"It's {now.strftime('%I:%M %p')} on {now.strftime('%A, %B %d, %Y')}."


async def _llm_response(user_message: str, conversation_history: list) -> str:
    """
    Generate LLM response for general queries
    
    Args:
        user_message: Current user message
        conversation_history: Full conversation context
        
    Returns:
        LLM-generated response
    """
    llm = get_llm(temperature=0.7)
    
    messages = [
        SystemMessage(content=GENERAL_AGENT_PROMPT),
        HumanMessage(content=user_message)
    ]
    
    try:
        response = await llm.ainvoke(messages)
        return response.content
    except Exception as e:
        logger.error(f"[General Agent] LLM error: {str(e)}")
        return "I'm having trouble processing that request right now."
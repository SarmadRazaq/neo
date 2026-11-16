"""
Web Team Agent Workers
Browser Agent: Uses Stagehand via Frontend for AI-powered web navigation
Content Cleaner: Formats output for voice presentation

Stagehand is an AI browser automation framework that runs on the client side.
The AI agent sends high-level task instructions, and Stagehand executes them locally.
"""
import logging
import asyncio
import os
import json
from typing import Optional, Any

from state.state import AgentState
from llm.client import get_async_openai_client
from langchain_core.messages import HumanMessage, AIMessage
from cua.commands import StagehandTaskCommand, StagehandResponse
from utils import sanitize_text

logger = logging.getLogger("web-team-agents")


# ==================== Browser Agent ====================
BROWSER_AGENT_PROMPT = """You are a Web Browser Specialist for visually impaired users.

Your role:
- Navigate websites efficiently using browser automation
- Extract relevant information accurately
- Focus on the user's specific request
- Work autonomously without asking for clarification

IMPORTANT: For follow-up requests:
- If the task includes [Context: Currently on: ...], the browser is ALREADY on that site
- Do NOT navigate away - work with the current page
- Examples: "tell me more about that" means find more details on the CURRENT page
- "the first story" refers to content already visible on the current page

You control the browser on the user's computer via Stagehand."""


async def browser_agent(state: AgentState) -> AgentState:
    """
    Browser agent node - Uses Stagehand for AI-powered browser automation
    
    This agent:
    - Takes the user's web browsing request
    - Sends high-level task instruction to Stagehand on the Frontend
    - Stagehand executes the task locally using AI-powered automation
    - Receives results and stores them in state for the content cleaner
    """
    logger.info("[Browser Agent] Starting web navigation via Stagehand...")
    
    user_message = state["messages"][-1].content if state["messages"] else ""
    cua_client = state.get("cua_client")
    context = state.get("context")  # ConversationContext from LiveKit
    
    # Log context for debugging
    if context:
        logger.info(f"[Browser Agent] Context: domain={context.current_domain}, tasks={context.recent_tasks}")
    
    if not cua_client:
        logger.error("[Browser Agent] CUA client not available")
        state["messages"].append(
            AIMessage(
                content="Browser control not available - client not initialized",
                name="browser_agent"
            )
        )
        return state
    
    try:
        # Use Stagehand for browser automation
        logger.info("[Browser Agent] Executing browser automation via Stagehand...")
        raw_result = await _execute_stagehand_task(cua_client, user_message)
        
        # Store raw result for content cleaner
        state["messages"].append(
            AIMessage(
                content=raw_result,
                name="browser_agent"
            )
        )
        
        # Log success/failure based on actual result
        if raw_result and "error" not in raw_result.lower() and "timed out" not in raw_result.lower():
            logger.info("[Browser Agent] Task completed successfully")
        else:
            logger.warning(f"[Browser Agent] Task issue: {raw_result[:100] if raw_result else 'empty'}")
        
    except Exception as e:
        logger.error(f"[Browser Agent] Error: {str(e)}")
        state["messages"].append(
            AIMessage(
                content=f"Browser error: {str(e)}",
                name="browser_agent"
            )
        )
    
    return state


async def _execute_stagehand_task(cua_client, task: str) -> str:
    """
    Execute a browsing task using Stagehand on the Frontend
    
    Stagehand is an AI-powered browser automation framework that runs locally
    on the user's machine. We send the natural language instruction and
    Stagehand's agent handles everything autonomously:
    - Deciding which website to visit
    - Navigating and interacting with pages
    - Extracting relevant content
    
    Args:
        cua_client: CUA client instance for Frontend communication
        task: User's browsing request (natural language)
        
    Returns:
        Extracted content from the webpage
    """
    logger.info(f"[Browser Agent] Sending task to Stagehand: {task}")
    
    # Build the Stagehand task command - let the agent decide everything
    command = StagehandTaskCommand(
        instruction=task,
        maxSteps=20,
    )
    
    # Send command via CUA client
    logger.info(f"[Browser Agent] Sending Stagehand command: {command.model_dump()}")
    
    # Use the CUA client to send the command and wait for response
    response: StagehandResponse = await cua_client.send_stagehand_task(command)
    
    logger.info(f"[Browser Agent] ========== STAGEHAND RESPONSE ==========")
    logger.info(f"[Browser Agent] Response success: {response.success}")
    logger.info(f"[Browser Agent] Response error: {response.error}")
    logger.info(f"[Browser Agent] Response requestId: {response.requestId}")
    logger.info(f"[Browser Agent] Response taskResult: {response.taskResult}")
    
    if response.success:
        task_result = response.taskResult
        message = (task_result.message if task_result and task_result.message else "Task completed")
        data = task_result.data if task_result else None
        captcha_solved = task_result.captchaSolved if task_result else False
        
        logger.info(f"[Browser Agent] taskResult.message (full): {message}")
        logger.info(f"[Browser Agent] taskResult.data (full, first 1000): {data[:1000] if data else 'None'}")
        logger.info(f"[Browser Agent] taskResult.captchaSolved: {captcha_solved}")
        
        # Build prefix if captcha was solved
        captcha_prefix = ""
        if captcha_solved:
            logger.info(f"[Browser Agent] A captcha was solved during this task")
            captcha_prefix = "I ran into a security check but handled it for you. Here's what I found: "
        
        if data:
            # Return the extracted data
            logger.info(f"[Browser Agent] Returning data (first 500 chars): {data[:500]}...")
            return captcha_prefix + data
        else:
            logger.info(f"[Browser Agent] No data, returning message")
            return captcha_prefix + message
    else:
        error = response.error or "Unknown error"
        logger.error(f"[Browser Agent] Stagehand task failed: {error}")
        return f"Failed to complete browser task: {error}"


# ==================== Content Cleaner Agent ====================
CONTENT_CLEANER_PROMPT = """You are a Content Formatting Specialist for visually impaired users.

Your role:
- Clean raw web content for voice presentation
- Remove technical metadata and formatting
- Present information conversationally
- Keep responses concise and clear

Convert technical web output into natural speech."""


async def content_cleaner_agent(state: AgentState) -> AgentState:
    """
    Content cleaner agent node - Formats raw browser output for TTS
    
    This agent:
    - Takes raw output from browser agent
    - Uses LLM to clean and format for voice
    - Produces final text ready for TTS
    - Supports streaming when state["streaming"] is True
    """
    logger.info("[Content Cleaner] Formatting content for voice...")
    
    # Get original user request
    user_request = state["messages"][0].content if state["messages"] else ""
    is_streaming = state.get("streaming", False)
    
    # Get raw browser output (last message from browser_agent)
    raw_output = ""
    for msg in reversed(state["messages"]):
        if hasattr(msg, 'name') and msg.name == "browser_agent":
            raw_output = msg.content
            break
    
    logger.info(f"[Content Cleaner] Raw output received (length: {len(raw_output)} chars)")
    logger.debug(f"[Content Cleaner] Raw output preview: {raw_output[:200] if raw_output else 'EMPTY'}...")
    
    if not raw_output:
        logger.warning("[Content Cleaner] No raw output from browser agent!")
        state["task_result"] = "I couldn't retrieve any content from the website."
        return state
    
    # Check if raw_output is an error message (timeout, browser error, Stagehand failure, etc.)
    raw_lower = raw_output.lower()
    error_indicators = [
        "timed out",
        "browser error",
        "error:",
        "failed to complete",
        "failed to execute",
        "unknown error",
        "couldn't retrieve",
        "unable to access",
    ]
    is_error = any(indicator in raw_lower for indicator in error_indicators) or raw_output.startswith("Browser error")
    
    if is_error:
        logger.warning(f"[Content Cleaner] Detected error in raw output: {raw_output[:100]}")
        state["task_result"] = "I had trouble completing that task. Would you like me to try again?"
        state["task_failed"] = True  # Mark as failed for proper LLM response
        return state
    
    try:
        if is_streaming:
            # Use streaming OpenAI client
            cleaned_text = await _clean_content_streaming(raw_output, user_request)
        else:
            # Use standard client
            cleaned_text = await _clean_content_standard(raw_output, user_request)
        
        # Sanitize Unicode for Windows console compatibility
        cleaned_text = sanitize_text(cleaned_text)
        
        # Store final result
        state["task_result"] = cleaned_text
        state["messages"].append(
            AIMessage(
                content=cleaned_text,
                name="content_cleaner"
            )
        )
        
        logger.info(f"[Content Cleaner] Content formatted successfully ({len(cleaned_text)} chars)")
        # Full content is logged in neo_agent.py when spoken - keep this at DEBUG
        logger.debug(f"[Content Cleaner] Cleaned text preview: {cleaned_text[:200] if cleaned_text else 'EMPTY'}...")
        
    except Exception as e:
        logger.error(f"[Content Cleaner] Error: {str(e)}")
        state["task_result"] = "I encountered an error while formatting the content."
    
    return state


async def _clean_content_standard(raw_output: str, user_request: str) -> str:
    """Standard (non-streaming) content cleaning"""
    client = get_async_openai_client()
    
    cleaning_prompt = f"""You are an accessibility assistant helping visually impaired users.

The user asked: "{user_request}"

Raw data retrieved from browser:
{raw_output}

Convert this into clean, natural-sounding text that will be read aloud.

Requirements:
- Remove ALL technical metadata, XML tags, URLs in angle brackets, system messages
- Present information conversationally
- If there's a list, introduce it naturally (e.g., "Here are the headlines:")
- Keep it concise but complete (maximum 500 words)
- Use clear transitions
- Numbers spoken naturally (e.g., "Number 1" instead of "1.")

Return ONLY the clean text to be read aloud. No explanations."""

    response = await client.chat.completions.create(
        model="openai/gpt-4.1-mini",  # OpenRouter model format
        messages=[{"role": "user", "content": cleaning_prompt}],
        temperature=0
    )
    
    return response.choices[0].message.content.strip()


async def _clean_content_streaming(raw_output: str, user_request: str) -> str:
    """Streaming content cleaning - accumulates chunks for graph-level streaming"""
    client = get_async_openai_client()
    
    cleaning_prompt = f"""You are an accessibility assistant helping visually impaired users.

The user asked: "{user_request}"

Raw data retrieved from browser:
{raw_output}

Convert this into clean, natural-sounding text that will be read aloud.

Requirements:
- Remove ALL technical metadata, XML tags, URLs in angle brackets, system messages
- Present information conversationally
- If there's a list, introduce it naturally (e.g., "Here are the headlines:")
- Keep it concise but complete (maximum 500 words)
- Use clear transitions
- Numbers spoken naturally (e.g., "Number 1" instead of "1.")

Return ONLY the clean text to be read aloud. No explanations."""

    full_response = ""
    
    # Stream and accumulate
    # The actual streaming to user happens via astream_events in main.py
    stream = await client.chat.completions.create(
        model="openai/gpt-4.1-mini",  # OpenRouter model format
        messages=[{"role": "user", "content": cleaning_prompt}],
        temperature=0,
        stream=True
    )
    
    async for chunk in stream:
        if chunk.choices[0].delta.content:
            full_response += chunk.choices[0].delta.content
    
    return full_response.strip()
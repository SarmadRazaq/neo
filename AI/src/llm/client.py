"""
Centralized LLM client configuration

Uses OpenRouter as unified gateway for all LLM providers.
Single API key for OpenAI, Anthropic, Google, and other models.
"""
import os
from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI
import anthropic

# OpenRouter configuration
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Default model via OpenRouter
DEFAULT_MODEL = os.getenv("LLM_MODEL", "openai/gpt-4.1-mini")


def get_llm(temperature: float = 0, streaming: bool = False) -> ChatOpenAI:
    """
    Get configured LangChain LLM via OpenRouter
    
    Args:
        temperature: Sampling temperature (0-1)
        streaming: Whether to enable streaming
        
    Returns:
        Configured ChatOpenAI instance pointing to OpenRouter
    """
    return ChatOpenAI(
        model=DEFAULT_MODEL,
        temperature=temperature,
        streaming=streaming,
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        default_headers={
            "HTTP-Referer": "https://neo-assistant.app",
            "X-Title": "NEO Assistant",
        }
    )


def get_async_openai_client() -> AsyncOpenAI:
    """
    Get async OpenAI-compatible client via OpenRouter
    
    Returns:
        Configured AsyncOpenAI client pointing to OpenRouter
    """
    return AsyncOpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
    )


def get_anthropic_client() -> anthropic.Anthropic:
    """
    Get Anthropic client for Claude API calls (including computer use)
    
    Note: This still uses direct Anthropic API for features not yet
    supported via OpenRouter (e.g., computer use beta).
    
    Returns:
        Configured Anthropic client
    """
    return anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def get_async_anthropic_client() -> anthropic.AsyncAnthropic:
    """
    Get async Anthropic client for Claude API calls
    
    Note: This still uses direct Anthropic API for features not yet
    supported via OpenRouter (e.g., computer use beta).
    
    Returns:
        Configured AsyncAnthropic client
    """
    return anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
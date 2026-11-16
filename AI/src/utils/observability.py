"""
Observability utilities for NEO AI Agent
Provides integration with Langfuse for LangGraph tracing

Usage:
    from utils.observability import get_langfuse_handler, trace_operation
    
    # For LangGraph invocations
    handler = get_langfuse_handler()
    result = await graph.ainvoke(state, config={"callbacks": [handler]})
    
    # For custom spans
    with trace_operation("custom_operation") as span:
        # your code here
        pass

Environment Variables:
    LANGFUSE_PUBLIC_KEY - Langfuse public key
    LANGFUSE_SECRET_KEY - Langfuse secret key  
    LANGFUSE_BASE_URL   - Langfuse server URL (default: https://cloud.langfuse.com)
    LANGFUSE_DEBUG      - Set to "True" for console output (useful for local debugging)
"""

import os
import time
import logging
from typing import Optional, Any
from contextlib import contextmanager
from functools import wraps

logger = logging.getLogger("neo-observability")

# Lazy import to avoid startup errors if langfuse not installed
_langfuse_client = None
_langfuse_handler = None


def _is_langfuse_configured() -> bool:
    """Check if Langfuse credentials are configured"""
    return bool(
        os.getenv("LANGFUSE_PUBLIC_KEY") and 
        os.getenv("LANGFUSE_SECRET_KEY")
    )


def _is_debug_mode() -> bool:
    """Check if debug mode is enabled for console output"""
    return os.getenv("LANGFUSE_DEBUG", "").lower() in ("true", "1", "yes")


def get_langfuse_client():
    """
    Get or create a Langfuse client instance.
    Returns None if Langfuse is not configured.
    
    Set LANGFUSE_DEBUG=True for console output during local development.
    """
    global _langfuse_client
    
    if not _is_langfuse_configured():
        if _is_debug_mode():
            logger.info("[Observability] Langfuse not configured, using console-only mode")
        return None
    
    if _langfuse_client is None:
        try:
            from langfuse import Langfuse
            _langfuse_client = Langfuse(
                debug=_is_debug_mode()  # Enable console output in debug mode
            )
            if _is_debug_mode():
                logger.info("[Observability] Langfuse initialized with debug=True (console output enabled)")
        except ImportError:
            logger.warning("[Observability] Langfuse not installed. Run: pip install langfuse")
            return None
        except Exception as e:
            logger.error(f"[Observability] Failed to initialize Langfuse: {e}")
            return None
    
    return _langfuse_client


def get_langfuse_handler():
    """
    Get a Langfuse callback handler for LangGraph/LangChain.
    Returns None if Langfuse is not configured.
    
    Usage:
        handler = get_langfuse_handler()
        if handler:
            result = await graph.ainvoke(state, config={"callbacks": [handler]})
        else:
            result = await graph.ainvoke(state)
    """
    global _langfuse_handler
    
    if not _is_langfuse_configured():
        return None
    
    if _langfuse_handler is None:
        try:
            from langfuse.langchain import CallbackHandler
            _langfuse_handler = CallbackHandler()
        except ImportError:
            logger.warning("[Observability] Langfuse not installed. Run: pip install langfuse")
            return None
        except Exception as e:
            logger.error(f"[Observability] Failed to create Langfuse handler: {e}")
            return None
    
    return _langfuse_handler


def get_langgraph_config(additional_callbacks: Optional[list] = None) -> dict:
    """
    Get a config dict for LangGraph invocations with observability.
    
    Usage:
        config = get_langgraph_config()
        result = await graph.ainvoke(state, config=config)
    """
    callbacks = []
    
    handler = get_langfuse_handler()
    if handler:
        callbacks.append(handler)
    
    if additional_callbacks:
        callbacks.extend(additional_callbacks)
    
    if callbacks:
        return {"callbacks": callbacks}
    return {}


class ConsoleSpan:
    """Simple console-based span for local debugging when Langfuse is not configured"""
    
    def __init__(self, name: str, metadata: Optional[dict] = None):
        self.name = name
        self.metadata = metadata or {}
        self.start_time = time.time()
        self.output = None
        
    def update(self, output: Any = None, **kwargs):
        """Update span with output or additional data"""
        if output is not None:
            self.output = output
        self.metadata.update(kwargs)
    
    def end(self):
        """End the span and log timing"""
        elapsed = time.time() - self.start_time
        output_preview = ""
        if self.output:
            output_str = str(self.output)
            output_preview = f" -> {output_str[:100]}..." if len(output_str) > 100 else f" -> {output_str}"
        logger.info(f"[TRACE] {self.name} ({elapsed:.2f}s){output_preview}")


@contextmanager
def trace_operation(name: str, metadata: Optional[dict] = None):
    """
    Context manager for tracing custom operations.
    Falls back to console logging when Langfuse is not configured.
    
    Usage:
        with trace_operation("fetch_data", {"url": url}) as span:
            data = await fetch(url)
            if span:
                span.update(output=data)
    """
    client = get_langfuse_client()
    
    if client is None:
        # Console-only fallback for local debugging
        span = ConsoleSpan(name, metadata)
        logger.info(f"[TRACE] {name} START")
        try:
            yield span
        finally:
            span.end()
        return
    
    try:
        with client.start_as_current_observation(
            name=name,
            metadata=metadata or {}
        ) as span:
            yield span
    except Exception as e:
        logger.error(f"[Observability] Trace error: {e}")
        yield None


def score_trace(
    name: str,
    value: float,
    trace_id: Optional[str] = None,
    comment: Optional[str] = None
):
    """
    Add a score to a trace for evaluation.
    
    Usage:
        score_trace("user_satisfaction", 0.8, comment="User thanked the assistant")
    """
    client = get_langfuse_client()
    
    if client is None:
        return
    
    try:
        if trace_id:
            client.create_score(
                trace_id=trace_id,
                name=name,
                value=value,
                data_type="NUMERIC",
                comment=comment
            )
        else:
            client.score_current_trace(
                name=name,
                value=value,
                data_type="NUMERIC"
            )
    except Exception as e:
        print(f"[Observability] Score error: {e}")

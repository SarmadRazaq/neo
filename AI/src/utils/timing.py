"""
Timing utilities for performance analysis
Provides consistent timing and logging across the application
"""

import time
import logging
from typing import Optional, Dict, Any
from contextlib import contextmanager
from functools import wraps

logger = logging.getLogger("neo-timing")


def get_elapsed(start_time: float) -> float:
    """Get elapsed time in seconds since start_time"""
    return time.time() - start_time


def log_timing(
    event_name: str, 
    start_time: float, 
    details: str = "",
    threshold: float = 0.0,
    logger_instance: Optional[logging.Logger] = None
) -> float:
    """
    Log an event with timing information.
    
    Args:
        event_name: Name/description of the event
        start_time: Start time from time.time()
        details: Additional details to log
        threshold: Only log if elapsed time exceeds this (seconds)
        logger_instance: Optional specific logger to use
        
    Returns:
        Elapsed time in seconds
    """
    elapsed = get_elapsed(start_time)
    log = logger_instance or logger
    
    if elapsed >= threshold:
        if elapsed > 0.5:
            log.info(f"[TIMING] {event_name} (+{elapsed:.2f}s) {details}")
        else:
            log.info(f"[TIMING] {event_name} {details}")
    
    return elapsed


class TimingTracker:
    """
    Context-aware timing tracker for tracking multiple events
    and calculating gaps between events.
    """
    
    def __init__(self, logger_instance: Optional[logging.Logger] = None):
        self.logger = logger_instance or logger
        self.last_event_time: float = time.time()
        self.start_time: float = time.time()
        self.events: list[Dict[str, Any]] = []
        self.state: Dict[str, Any] = {}
    
    def reset(self) -> None:
        """Reset the tracker"""
        self.last_event_time = time.time()
        self.start_time = time.time()
        self.events = []
        self.state = {}
    
    def mark(self, event_name: str, details: str = "") -> float:
        """
        Mark an event and log time since last event.
        
        Args:
            event_name: Name of the event
            details: Additional details
            
        Returns:
            Time since last event in seconds
        """
        now = time.time()
        since_last = now - self.last_event_time
        since_start = now - self.start_time
        
        self.events.append({
            "name": event_name,
            "time": now,
            "since_last": since_last,
            "since_start": since_start,
            "details": details
        })
        
        if since_last > 0.5:
            self.logger.info(f"[TIMING] {event_name} (+{since_last:.2f}s) {details}")
        else:
            self.logger.info(f"[TIMING] {event_name} {details}")
        
        self.last_event_time = now
        return since_last
    
    def start_span(self, span_name: str) -> None:
        """Start tracking a named time span"""
        self.state[f"{span_name}_start"] = time.time()
    
    def end_span(self, span_name: str, details: str = "") -> float:
        """End a named time span and log duration"""
        start_key = f"{span_name}_start"
        if start_key not in self.state:
            self.logger.warning(f"[TIMING] No start time for span: {span_name}")
            return 0.0
        
        elapsed = time.time() - self.state[start_key]
        del self.state[start_key]
        
        self.logger.info(f"[TIMING] {span_name} took {elapsed:.2f}s {details}")
        return elapsed
    
    def get_total_elapsed(self) -> float:
        """Get total elapsed time since tracker creation/reset"""
        return time.time() - self.start_time


@contextmanager
def timed_operation(operation_name: str, logger_instance: Optional[logging.Logger] = None):
    """
    Context manager for timing a block of code.
    
    Usage:
        with timed_operation("fetch_data"):
            result = fetch_data()
    """
    log = logger_instance or logger
    start = time.time()
    log.info(f"[TIMING] {operation_name} START")
    try:
        yield
    finally:
        elapsed = time.time() - start
        log.info(f"[TIMING] {operation_name} END ({elapsed:.2f}s)")


def timed(operation_name: Optional[str] = None):
    """
    Decorator for timing function execution.
    
    Usage:
        @timed("process_request")
        async def process_request(data):
            ...
    """
    def decorator(func):
        name = operation_name or func.__name__
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start = time.time()
            logger.info(f"[TIMING] {name} START")
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                elapsed = time.time() - start
                logger.info(f"[TIMING] {name} END ({elapsed:.2f}s)")
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start = time.time()
            logger.info(f"[TIMING] {name} START")
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                elapsed = time.time() - start
                logger.info(f"[TIMING] {name} END ({elapsed:.2f}s)")
        
        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator

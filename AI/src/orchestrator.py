"""
NEO Orchestrator

LangGraph-based task orchestrator for the voice AI assistant.
Handles routing between different agent teams (web, email, form, general).
"""
import asyncio
import logging
from typing import Optional, Any

from graphs.master_graph import create_master_graph
from langchain_core.messages import HumanMessage
from state.state import AgentState, ConversationContext
from models.schemas import OrchestratorResponse, OrchestratorStreamResponse, ProgressData

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("neo-orchestrator")



class NEOAssistant:
    """
    Main NEO Voice Assistant orchestrator.
    
    Uses LangGraph to route tasks to specialized agent teams
    and handles streaming responses with progress updates.
    """
    
    def __init__(self, cua_client: Optional[Any] = None):
        """
        Initialize the master graph.
        
        Args:
            cua_client: Optional CUA client for browser control via frontend
        """
        self.graph = create_master_graph()
        self.cua_client = cua_client
        logger.info("NEO Orchestrator initialized successfully")
    
    async def process_request_structured(self, user_input: str) -> OrchestratorResponse:
        """
        Process request and return structured Pydantic model.
        
        Args:
            user_input: Transcribed user voice command
            
        Returns:
            OrchestratorResponse with full metadata
        """
        logger.info(f"Processing request (structured): {user_input}")
        
        initial_state: AgentState = {
            "messages": [HumanMessage(content=user_input)],
            "next": "",
            "team": "",
            "task_result": "",
            "streaming": False,
            "cua_client": self.cua_client,
        }
        
        try:
            final_state = await self.graph.ainvoke(initial_state)
            
            response = OrchestratorResponse(
                success=True,
                team=final_state.get("team", "unknown"),
                result=final_state.get("task_result", ""),
                error=None
            )
            
            logger.info(f"Request completed successfully. Team: {response.team}")
            return response
            
        except Exception as e:
            logger.error(f"Request failed: {str(e)}")
            return OrchestratorResponse(
                success=False,
                team="error",
                result="",
                error=str(e)
            )
   
    async def process_request_stream(self, user_input: str, conversation_context: Optional[ConversationContext] = None):
        """
        Process request with streaming support.
        
        Args:
            user_input: Transcribed user voice command
            conversation_context: Optional context from previous interactions
            
        Yields:
            Partial results as they become available
        """
        logger.info(f"Streaming request: {user_input}")
        
        # Clear any stale progress events from previous tasks
        # This prevents cancelled task errors from leaking into new tasks
        if self.cua_client:
            self.cua_client.clear_progress_queue()
            logger.debug("[Stream] Cleared stale progress events before starting new task")
        
        # Build enriched message with context if available
        enriched_input = user_input
        if conversation_context:
            ctx_str = conversation_context.to_context_string()
            if ctx_str:
                enriched_input = f"{user_input}\n\n[CONTEXT: {ctx_str}]"
                logger.info(f"Enriched with context: {ctx_str[:100]}...")
        
        initial_state: AgentState = {
            "messages": [HumanMessage(content=enriched_input)],
            "next": "",
            "team": "",
            "task_result": "",
            "task_failed": False,  # Track if the task failed
            "streaming": True,
            "cua_client": self.cua_client,
            "context": conversation_context,
        }
        
        chunk_number = 0
        progress_number = 0
        events_count = 0
        final_result = None
        task_failed = False
        graph_done = False
        
        # Create async queue for merging LangGraph events and progress events
        merged_queue: asyncio.Queue = asyncio.Queue()
        
        async def poll_progress():
            """Background task to continuously poll for progress events"""
            nonlocal progress_number
            try:
                while not graph_done:
                    if self.cua_client:
                        try:
                            progress = await self.cua_client.get_progress(timeout=0.5)
                            if progress:
                                progress_number += 1
                                logger.info(f"[Stream] CUA Progress #{progress_number}: type={progress.type} data={progress.data}")
                                await merged_queue.put(("progress", OrchestratorStreamResponse(
                                    chunk="",
                                    chunk_number=progress_number,
                                    team='stagehand',
                                    is_complete=False,
                                    is_progress=True,
                                    progress_data=ProgressData(
                                        event_type=progress.type,
                                        url=progress.data.get("url"),
                                        domain=progress.data.get("domain"),
                                        captcha_type=progress.data.get("captchaType"),
                                        error=progress.data.get("error"),
                                        task=user_input[:100] if user_input else None,  # Include task for context
                                        data=progress.data,  # Pass through all data for content_chunk text
                                    )
                                )))
                        except asyncio.CancelledError:
                            raise
                        except Exception as e:
                            logger.warning(f"[Stream] Progress poll error: {e}")
                    else:
                        await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                logger.debug("[Stream] Progress polling cancelled")
        
        async def stream_graph_events():
            """Stream LangGraph events to the queue"""
            nonlocal events_count, final_result, graph_done
            try:
                async for event in self.graph.astream_events(initial_state, version="v2"):
                    events_count += 1
                    await merged_queue.put(("graph", event))
            except Exception as e:
                logger.error(f"[Stream] Graph error: {e}")
                await merged_queue.put(("error", e))
            finally:
                graph_done = True
                await merged_queue.put(("done", None))
        
        # Start both tasks
        progress_task = asyncio.create_task(poll_progress())
        graph_task = asyncio.create_task(stream_graph_events())
        graph_error: Optional[Exception] = None
        
        try:
            while True:
                item_type, item = await merged_queue.get()
                
                if item_type == "done":
                    break
                
                if item_type == "error":
                    graph_error = item
                    break
                
                if item_type == "progress":
                    yield item
                    continue
                
                # Handle LangGraph event
                event = item
                event_type = event["event"]
                
                # Log events for debugging (first 20, then every 50th)
                if events_count <= 20 or events_count % 50 == 0:
                    logger.info(f"[Stream] Event #{events_count}: {event_type}")
                
                if event_type == "on_chat_model_stream":
                    chunk_data = event["data"]["chunk"]
                    if hasattr(chunk_data, 'content') and chunk_data.content:
                        chunk_number += 1
                        
                        logger.info(f"[Stream] Chat chunk #{chunk_number}: {chunk_data.content[:100]}...")
                        
                        stream_response = OrchestratorStreamResponse(
                            chunk=chunk_data.content,
                            chunk_number=chunk_number,
                            team='web',
                            is_complete=False
                        )
                        
                        yield stream_response
                
                elif event_type == "on_chain_end" and event.get("name") == "LangGraph":
                    output = event.get("data", {}).get("output", {})
                    if isinstance(output, dict):
                        final_result = output.get("task_result", "")
                        task_failed = output.get("task_failed", False)
                        if final_result:
                            logger.info(f"[Stream] Final task_result captured ({len(final_result)} chars), failed={task_failed}")
                            logger.debug(f"[Stream] Final result preview: {final_result[:200]}...")
        
        finally:
            # Clean up both tasks
            graph_done = True
            progress_task.cancel()
            graph_task.cancel()
            
            for task in [progress_task, graph_task]:
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.warning(f"[Stream] Task cleanup error: {e}")
        
        if graph_error:
            raise graph_error
        
        logger.info(f"[Stream] Finished. Total events: {events_count}, chunks: {chunk_number}")
        
        # If no chunks were streamed but we have a final result, yield it
        if chunk_number == 0 and final_result:
            logger.info(f"[Stream] No streaming chunks, yielding final result directly (failed={task_failed})")
            yield OrchestratorStreamResponse(
                chunk=final_result,
                chunk_number=1,
                team='web',
                is_complete=True,
                task_failed=task_failed
            )


async def main():
    """Main function for testing the orchestrator"""
    orchestrator = NEOAssistant()
    
    test_requests = [
        "Go to Hacker News and read me the top 3 headlines",
        "What time is it?",
        "Read my latest emails",
        "Fill out the registration form on this website"
    ]
    
    for request in test_requests:
        print(f"\n{'='*60}")
        print(f"USER: {request}")
        print('='*60)
        
        result = await orchestrator.process_request_structured(request)
        
        print(f"ASSISTANT: {result}")
        print('-'*60)


if __name__ == "__main__":
    asyncio.run(main())

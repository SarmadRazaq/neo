"""
Web Team Graph
Manages web browsing and information extraction tasks
"""
import logging
from langgraph.graph import StateGraph, END

from state.state import AgentState
from graphs.web_team.supervisor import web_supervisor
from graphs.web_team.agents import browser_agent, content_cleaner_agent

logger = logging.getLogger("web-team-graph")


def create_web_team_graph():
    """
    Create the web team subgraph
    
    Team structure:
    - Supervisor: Coordinates browser and cleaner agents
    - Browser Agent: Uses CUA to control browser via Frontend and extract content
    - Content Cleaner: Cleans output for voice presentation
    
    Returns:
        Compiled web team StateGraph
    """
    workflow = StateGraph(AgentState)
    
    # Add team nodes
    workflow.add_node("web_supervisor", web_supervisor)
    workflow.add_node("browser_agent", browser_agent)
    workflow.add_node("content_cleaner", content_cleaner_agent)
    
    # Set entry point to supervisor
    workflow.set_entry_point("web_supervisor")
    
    # Supervisor routes to browser agent
    workflow.add_edge("web_supervisor", "browser_agent")
    
    # Browser agent sends to content cleaner
    workflow.add_edge("browser_agent", "content_cleaner")
    
    # Content cleaner finishes the workflow
    workflow.add_edge("content_cleaner", END)
    
    logger.info("[Web Team Graph] Compiled successfully")
    return workflow.compile()
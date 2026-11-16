"""
General Team Graph
Handles general conversation and questions
"""
import logging
from langgraph.graph import StateGraph, END

from state.state import AgentState
from graphs.general_team.agents import general_conversation_agent

logger = logging.getLogger("general-team-graph")


def create_general_team_graph():
    """
    Create the general team subgraph
    
    Simpler team structure for general queries:
    - Direct to conversation agent (no supervisor needed for simple tasks)
    
    Returns:
        Compiled general team StateGraph
    """
    workflow = StateGraph(AgentState)
    
    # Add conversation agent
    workflow.add_node("conversation_agent", general_conversation_agent)
    
    # Direct entry to agent
    workflow.set_entry_point("conversation_agent")
    
    # Agent completes the workflow
    workflow.add_edge("conversation_agent", END)
    
    logger.info("[General Team Graph] Compiled successfully")
    return workflow.compile()
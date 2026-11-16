"""
Master Graph - Top-level supervisor and team composition
Routes requests to specialized teams based on intent classification
"""
import logging
from typing import Literal

from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage

from state.state import AgentState, ConversationContext
from llm.client import get_llm
from graphs.web_team.graph import create_web_team_graph
from graphs.general_team.graph import create_general_team_graph

logger = logging.getLogger("master-graph")


async def master_supervisor(state: AgentState) -> AgentState:
    """
    Master supervisor that classifies intent and routes to teams
    
    Analyzes user request and determines which specialized team
    should handle the task. Uses conversation context for smarter routing.
    """
    logger.info("[Master Supervisor] Analyzing request...")
    
    # Get latest user message
    user_message = state["messages"][-1].content if state["messages"] else ""
    
    # Get conversation context if available
    context: ConversationContext = state.get("context")
    context_info = ""
    
    if context:
        if context.current_domain:
            context_info += f"\nBrowser currently on: {context.current_domain}"
        if context.recent_tasks:
            context_info += f"\nRecent tasks: {', '.join(context.recent_tasks)}"
        if context.last_content_summary:
            context_info += f"\nLast content read: {context.last_content_summary[:300]}"
    
    # Use LLM to classify which team should handle this
    llm = get_llm(temperature=0)
    
    classification_prompt = f"""You are the master supervisor for a voice assistant helping visually impaired users.

Classify which team should handle this request:

1. "email_team" - ONLY for email-specific tasks
   Examples: "Read my emails", "Send email to John", "Check inbox", "Reply to that email"

2. "form_team" - ONLY for filling out forms on a page already open
   Examples: "Fill out this form", "Complete this application", "Enter my details"

3. "general_team" - ONLY for simple conversational responses that need NO external info
   Examples: "What can you do?", "How are you?", "Tell me a joke", "Hello"

4. "web_team" - DEFAULT for everything else
   This team can handle ANY task including:
   - Getting information (news, weather, sports, prices, etc.)
   - Browsing websites
   - Searching for anything
   - Looking things up
   - Any task that might need the internet
   - FOLLOW-UP QUESTIONS about web content (e.g., "tell me more", "the first one", "that story")
   
   IMPORTANT: If there's browser context below and the user is asking a follow-up question
   about something on the page, ALWAYS route to web_team (NOT general_team).
   
   If unsure, choose web_team.
{context_info}

User request: "{user_message}"

Respond with ONLY: web_team, email_team, form_team, or general_team"""

    response = await llm.ainvoke([HumanMessage(content=classification_prompt)])
    team = response.content.strip().lower()
    
    # Validate team - default to web_team if unknown (it can handle anything)
    valid_teams = ["web_team", "email_team", "form_team", "general_team"]
    if team not in valid_teams:
        team = "web_team"
    
    # Force web_team for follow-ups when browser is active
    if context and context.current_domain and team == "general_team":
        # Check if this looks like a follow-up about web content
        lower_msg = user_message.lower()
        follow_up_words = ["that", "this", "it", "more", "first", "second", "story", "article", "one"]
        if any(word in lower_msg for word in follow_up_words):
            logger.info(f"[Master Supervisor] Overriding general_team → web_team (follow-up detected)")
            team = "web_team"
    
    logger.info(f"[Master Supervisor] Routing to: {team}")
    
    state["team"] = team
    state["next"] = team
    
    return state


def route_to_team(state: AgentState) -> Literal["web_team", "email_team", "form_team", "general_team", END]:
    """
    Router function that directs to the appropriate team
    Defaults to web_team as it can handle most tasks
    """
    next_node = state.get("next", "web_team")
    logger.info(f"[Router] Directing to: {next_node}")
    return next_node


def create_master_graph():
    """
    Create the master orchestrator graph
    
    Returns:
        Compiled StateGraph with all teams
    """
    workflow = StateGraph(AgentState)
    
    # Add master supervisor
    workflow.add_node("master_supervisor", master_supervisor)
    
    # Add team subgraphs
    workflow.add_node("web_team", create_web_team_graph())
    workflow.add_node("email_team", create_email_team_subgraph())
    workflow.add_node("form_team", create_form_team_subgraph())
    workflow.add_node("general_team", create_general_team_graph())
    
    # Set entry point
    workflow.set_entry_point("master_supervisor")
    
    # Add conditional routing from supervisor to teams
    workflow.add_conditional_edges(
        "master_supervisor",
        route_to_team,
        {
            "web_team": "web_team",
            "email_team": "email_team",
            "form_team": "form_team",
            "general_team": "general_team"
        }
    )
    
    # All teams route to END
    workflow.add_edge("web_team", END)
    workflow.add_edge("email_team", END)
    workflow.add_edge("form_team", END)
    workflow.add_edge("general_team", END)
    
    logger.info("[Master Graph] Compiled successfully")
    return workflow.compile()


# ==================== Placeholder Team Subgraphs ====================
def create_email_team_subgraph():
    """
    Email team subgraph (placeholder for future implementation)
    """
    async def email_team_node(state: AgentState) -> AgentState:
        logger.info("[Email Team] Processing...")
        state["task_result"] = """Email functionality coming soon.
        
I'll help you manage emails including:
- Reading your inbox
- Composing messages
- Sending emails
- Organizing and searching

This requires integration with your email provider (Gmail, Outlook, etc.)."""
        return state
    
    return email_team_node


def create_form_team_subgraph():
    """
    Form team subgraph (placeholder for future implementation)
    """
    async def form_team_node(state: AgentState) -> AgentState:
        logger.info("[Form Team] Processing...")
        state["task_result"] = """Form filling functionality coming soon.
        
I'll help you complete web forms by:
- Identifying form fields
- Reading labels to you
- Entering your information
- Validating and submitting

This will use browser automation to interact with forms."""
        return state
    
    return form_team_node
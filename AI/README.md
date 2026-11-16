# NEO AI Agent

AI-powered voice assistant backend using LiveKit, LangGraph, and Stagehand for browser automation.

## Overview

This is the AI backend for NEO, a voice assistant for visually impaired users. It:
- Receives voice commands via LiveKit
- Routes tasks to specialized teams (web browsing, email, forms, general)
- Uses Stagehand on the client for AI-powered browser automation
- Returns formatted content for text-to-speech

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) (secrets management)
- Access to NEO Doppler project

## Quick Start

### 1. Install Dependencies

```bash
cd AI
uv sync
```

### 2. Configure Doppler

```bash
# Set the Doppler token (get this from the project admin)
export DOPPLER_TOKEN="dp.st.dev.xxxxxxxxxxxxxxxxxxxx"

# Verify it works
doppler secrets
```

### 3. Download Model Files

Download required model files (Silero VAD) before first run:

```bash
cd src
doppler run -- python neo_agent.py download-files
```

### 4. Run the Agent

```bash
cd src

# Development mode (recommended for local dev)
doppler run -- python neo_agent.py dev

# Console mode (for testing without LiveKit)
doppler run -- python neo_agent.py console

# Production mode
doppler run -- python neo_agent.py start
```

## Architecture

```
User Voice → LiveKit → AI Agent → LangGraph Router
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
               Web Team           Email Team        General Team
                    │                  │                  │
                    ▼                  │                  │
            Stagehand (Client)         │                  │
                    │                  │                  │
                    └──────────────────┴──────────────────┘
                                       │
                                       ▼
                              Content Cleaner → TTS → User
```

### Key Components

| File | Description |
|------|-------------|
| `src/neo_agent.py` | LiveKit agent entry point |
| `src/assistant.py` | NEO Assistant class |
| `src/orchestrator.py` | LangGraph workflow execution |
| `src/graphs/master_graph.py` | Task router (web/email/form/general) |
| `src/graphs/web_team/agents.py` | Browser agent using Stagehand |
| `src/cua/client.py` | Communication with Electron frontend |
| `src/tools/` | Agent tools (web_task, applications, time) |
| `src/config.py` | Configuration constants |
| `src/instructions.py` | System prompts |
| `src/progress.py` | Progress update handling |

### Teams

- **Web Team** (default): Handles any task requiring internet access via Stagehand
- **Email Team**: Email management (placeholder)
- **Form Team**: Form filling (placeholder)
- **General Team**: Simple conversational responses

## Doppler Secrets

Required secrets in `neo` project (`dev` config):

| Secret | Description |
|--------|-------------|
| `LIVEKIT_URL` | LiveKit server URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `OPENROUTER_API_KEY` | OpenRouter API key (unified access to OpenAI, Gemini, Claude) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (for TTS) |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional, for computer use features) |
| `AGENT_NAME` | Agent identifier for explicit dispatch (e.g., `local-agent`) |

> **Note**: We use OpenRouter as a unified gateway for LLM access. The default model is `openai/gpt-4.1-mini`. Get your key at https://openrouter.ai/keys

## Local Development

### Running with Frontend

1. Start the AI agent:
   ```bash
   cd AI/src
   doppler run -- python neo_agent.py dev
   ```

2. In a separate terminal, start the Electron frontend:
   ```bash
   cd Frontend/electron
   doppler run -- npm run dev
   ```

3. The frontend will connect to the agent via LiveKit

### Explicit Agent Dispatch

For local development, ensure both AI and Frontend use the same `AGENT_NAME`:

```bash
# Check current AGENT_NAME
doppler secrets get AGENT_NAME

# Should be: local-agent (or whatever is configured)
```

This ensures the frontend connects to YOUR local agent, not a production one.

### Viewing Logs

The agent logs detailed information:
- `[Master Supervisor]` - Task routing decisions
- `[Browser Agent]` - Stagehand task execution
- `[Content Cleaner]` - TTS formatting
- `[CUA]` - Frontend communication
- `[PROGRESS]` - Real-time progress updates from Stagehand

## Project Structure

```
AI/
├── src/
│   ├── neo_agent.py            # Agent entry point
│   ├── assistant.py            # NEO Assistant class
│   ├── orchestrator.py         # LangGraph execution
│   ├── config.py               # Configuration constants
│   ├── instructions.py         # System prompts
│   ├── progress.py             # Progress update handling
│   ├── tools/                  # Agent tools
│   │   ├── web_task.py         # Browser task tool
│   │   ├── applications.py     # App launch tools
│   │   └── time_tools.py       # Time/date tool
│   ├── graphs/
│   │   ├── master_graph.py     # Task router
│   │   ├── web_team/           # Browser automation
│   │   └── general_team/       # General responses
│   ├── cua/
│   │   ├── client.py           # Frontend communication
│   │   └── commands.py         # Pydantic models
│   ├── llm/
│   │   └── client.py           # LLM client wrapper
│   ├── models/
│   │   └── schemas.py          # Pydantic schemas
│   ├── state/
│   │   └── state.py            # LangGraph state
│   └── utils/
│       └── logger.py           # Logging utilities
├── pyproject.toml              # Dependencies
├── doppler.yaml                # Doppler config
└── README.md
```

## Troubleshooting

### Agent not receiving requests
- Check `AGENT_NAME` matches in both AI and Frontend Doppler configs
- Restart the Electron app after config changes
- Look for `registered worker` in agent logs

### Stagehand not responding
- Ensure frontend Electron app is running
- Check frontend console for Stagehand initialization logs
- Verify LiveKit connection is established

### Multiple agents running
- Kill old agent processes: `pkill -f neo_agent`
- Restart with fresh terminal

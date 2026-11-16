# NEO

AI-powered voice assistant for visually impaired users.

## Overview

NEO is an accessible voice assistant that helps visually impaired users interact with the web and perform daily tasks through natural voice commands. It uses:

- **LiveKit** for real-time voice communication
- **LangGraph** for intelligent task routing
- **Stagehand** for AI-powered browser automation
- **Electron** for the cross-platform desktop app

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│   Electron App  │◄───────►│   AI Agent      │
│   (Frontend)    │ LiveKit │   (Backend)     │
├─────────────────┤         ├─────────────────┤
│ - Voice UI      │         │ - LangGraph     │
│ - Stagehand     │         │ - Task Router   │
│ - Browser Auto  │         │ - Content Clean │
└─────────────────┘         └─────────────────┘
```

## Quick Start

### Prerequisites

- [Doppler CLI](https://docs.doppler.com/docs/install-cli) - Secrets management
- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Node.js 18+
- Access to NEO Doppler project

### 1. Setup Doppler

```bash
# Set the Doppler token (get this from the project admin)
export DOPPLER_TOKEN="dp.st.dev.xxxxxxxxxxxxxxxxxxxx"

# Verify it works
doppler secrets
```

### 2. Start AI Agent

```bash
cd AI
uv sync
cd src
doppler setup  # Select: neo → dev
doppler run -- python -m livekit_basic_agent dev
```

### 3. Start Electron App (in new terminal)

```bash
cd Frontend/electron
npm install
doppler setup  # Select: neo → dev
doppler run -- npm run dev
```

### 4. Use Voice Commands

Once connected, try:
- "Tell me the news headlines"
- "What's the weather today?"
- "Search for pizza recipes"

## Components

| Component | Description | README |
|-----------|-------------|--------|
| **AI** | Python backend with LangGraph task routing | [AI/README.md](AI/README.md) |
| **Frontend** | Electron app with Stagehand browser automation | [Frontend/electron/README.md](Frontend/electron/README.md) |
| **Backend** | NestJS API server (auth, users) | [Backend/README.md](Backend/README.md) |
| **Infrastructure** | Terraform for AWS deployment | Infrastructure/ |

## How It Works

1. **User speaks** → Electron app captures audio via LiveKit
2. **AI Agent receives** → Speech-to-text, then routes to appropriate team
3. **Web Team executes** → Sends task to Stagehand on user's machine
4. **Stagehand automates** → AI-powered browser navigation and extraction
5. **Content returned** → Cleaned and formatted for text-to-speech
6. **User hears result** → Natural voice response

## Key Features

- **No hardcoded URLs** - AI agent autonomously decides where to navigate
- **Local browser control** - Stagehand runs on user's machine for privacy
- **Accessible UI** - Full screen reader and keyboard support
- **Real-time voice** - Low-latency conversation with interruption handling

## Development

See individual component READMEs for detailed setup:
- [AI Agent Setup](AI/README.md)
- [Frontend Setup](Frontend/electron/README.md)

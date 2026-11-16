# NEO Electron App

Accessible voice assistant for visually impaired users, powered by LiveKit and Stagehand.

## Overview

This is the Electron frontend for NEO. It:
- Connects to the AI agent via LiveKit for voice communication
- Runs Stagehand locally for AI-powered browser automation
- Provides an accessible UI with screen reader support
- Executes browser tasks on the user's machine

## Prerequisites

- Node.js 18+
- npm
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) (secrets management)
- Access to NEO Doppler project

## Quick Start

### 1. Install Dependencies

```bash
cd Frontend/electron
npm install
```

### 2. Configure Doppler

```bash
# Set the Doppler token (get this from the project admin)
export DOPPLER_TOKEN="dp.st.dev.xxxxxxxxxxxxxxxxxxxx"

# Verify it works
doppler secrets
```

### 3. Run the App

```bash
# Development mode (with hot reload)
doppler run -- npm run dev

# Or just:
npm run dev  # If doppler.yaml is configured
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Renderer   │◄──►│    Main     │◄──►│  Stagehand  │  │
│  │  (React)    │    │  Process    │    │  (Browser)  │  │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘  │
│         │                  │                             │
└─────────┼──────────────────┼─────────────────────────────┘
          │                  │
          ▼                  ▼
    ┌──────────┐      ┌──────────┐
    │ LiveKit  │      │  Token   │
    │  Cloud   │      │  Server  │
    └────┬─────┘      └──────────┘
         │
         ▼
    ┌──────────┐
    │ AI Agent │
    │ (Python) │
    └──────────┘
```

### Key Components

| File | Description |
|------|-------------|
| `src/main/index.ts` | Electron main process entry |
| `src/main/ipcHandlers.ts` | IPC request handlers |
| `src/main/stagehand/stagehandManager.ts` | Stagehand browser automation |
| `src/renderer/App.tsx` | React app entry |
| `src/renderer/components/screens/LiveKitVoiceScreen.tsx` | Voice assistant UI |

## Doppler Secrets

Required secrets in `neo` project (`dev` config):

| Secret | Description |
|--------|-------------|
| `LIVEKIT_URL` | LiveKit server URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `OPENROUTER_API_KEY` | OpenRouter API key (unified access to OpenAI, Gemini, Claude) |
| `AGENT_NAME` | Agent identifier (e.g., `local-agent`) |

> **Note**: We use OpenRouter as a unified gateway for all LLM providers. Get your key at https://openrouter.ai/keys

## Local Development

### Running with AI Backend

1. Start the AI agent first (in separate terminal):
   ```bash
   cd AI/src
   doppler run -- python -m livekit_basic_agent dev
   ```

2. Start the Electron app:
   ```bash
   cd Frontend/electron
   doppler run -- npm run dev
   ```

3. The app will:
   - Connect to LiveKit
   - Wait for voice commands
   - Send tasks to the AI agent
   - Execute browser automation via Stagehand

### Explicit Agent Dispatch

For local development, ensure both AI and Frontend use the same `AGENT_NAME`:

```bash
# Check current AGENT_NAME
doppler secrets get AGENT_NAME

# Should match the AI agent's AGENT_NAME (e.g., local-agent)
```

This ensures the app connects to YOUR local agent, not a production one.

## Features

### Voice Assistant
- Real-time voice communication via LiveKit
- Visual feedback during listening/speaking states
- Natural conversation with interruption handling

### Stagehand Browser Automation
- AI-powered browser control running locally
- Autonomous navigation and content extraction
- No hardcoded URLs - agent decides where to go

### Accessibility
- Full screen reader support
- ARIA labels on all interactive elements
- Keyboard navigation
- High contrast dark theme

## Project Structure

```
Frontend/electron/
├── src/
│   ├── main/
│   │   ├── index.ts            # App entry point
│   │   ├── preload.ts          # Secure IPC bridge
│   │   ├── ipcHandlers.ts      # IPC handlers
│   │   ├── config.ts           # Environment config
│   │   └── stagehand/
│   │       └── stagehandManager.ts  # Browser automation
│   │
│   ├── renderer/
│   │   ├── App.tsx             # React app
│   │   ├── components/
│   │   │   └── screens/
│   │   │       └── LiveKitVoiceScreen.tsx  # Voice UI
│   │   └── styles/
│   │
│   ├── lib/
│   │   ├── livekit/            # Token generation
│   │   └── os/                 # OS operations
│   │
│   └── utils/
│       └── accessibility.ts    # Screen reader helpers
│
├── package.json
├── doppler.yaml                # Doppler config
├── webpack.config.js
└── README.md
```

## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Build for production
npm start        # Run production build
```

## Troubleshooting

### App stuck on "Connecting..."
- Ensure AI agent is running
- Check `AGENT_NAME` matches in both Doppler configs
- Verify LiveKit credentials are correct

### Stagehand not working
- Check console for `[StagehandManager]` logs
- Ensure `OPENROUTER_API_KEY` is set in Doppler
- Browser window should appear when automation runs

### Not connecting to local agent
- Restart the Electron app after changing Doppler config
- Kill any old agent processes on the AI side
- Verify with `doppler secrets get AGENT_NAME` in both directories

## Testing Voice Commands

Once connected, try these commands:
- "Tell me the news headlines"
- "What's the weather today?"
- "Search for pizza recipes"
- "Go to CNN and read the top story"

The AI agent will route to the appropriate team, and Stagehand will handle browser automation locally.

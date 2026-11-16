# AGENTS.md — NEO Coding Guidelines

> Coding conventions and patterns derived from the existing codebase.
> Every guideline here reflects how the code is **actually written**, not aspirational rules.

---

## Overview

NEO is a voice assistant for visually impaired users. Three components:

| Component | Directory | Stack |
|-----------|-----------|-------|
| **Electron Frontend** | `Frontend/electron/` | Electron 39, React 18, Webpack, Stagehand, Puppeteer |
| **NestJS Backend** | `Backend/` | NestJS 10, Prisma 5, PostgreSQL, Supabase Auth |
| **AI Agent** | `AI/` | Python 3.11+, LangGraph, LangChain, LiveKit Agents |

Secrets are managed via **Doppler** (no `.env` files). Package managers: **npm** (Backend, Frontend), **uv** (AI).

---

## Repository Map

```
NEO/
├── AI/                          # Python AI agent
│   └── src/
│       ├── neo_agent.py         #   Entry point (LiveKit agent)
│       ├── assistant.py         #   Assistant class (tool registration)
│       ├── orchestrator.py      #   LangGraph orchestrator
│       ├── config.py            #   Module-level constants
│       ├── instructions.py      #   System prompt strings
│       ├── progress.py          #   Progress speech generation
│       ├── graphs/              #   LangGraph graph definitions
│       │   ├── master_graph.py  #     Supervisor → team routing
│       │   ├── web_team/        #     Browser automation subgraph
│       │   └── general_team/    #     Conversation subgraph
│       ├── state/state.py       #   Shared AgentState TypedDict
│       ├── llm/client.py        #   LLM factory functions
│       ├── tools/               #   Tool implementations
│       ├── cua/                 #   Computer-use agent client
│       ├── models/schemas.py    #   Pydantic models
│       └── utils/               #   Logging, observability, timing
├── Backend/                     # NestJS API
│   └── src/
│       ├── main.ts              #   Bootstrap (CORS, Helmet, ValidationPipe)
│       ├── app.module.ts        #   Root module
│       ├── config/              #   Env validation + typed config
│       ├── prisma/              #   Global PrismaService
│       └── modules/             #   Feature modules
│           ├── auth/            #     Supabase auth (guards, decorators)
│           ├── users/           #     CRUD (DTOs, service, controller)
│           ├── livekit/         #     LiveKit session management
│           └── health/          #     Terminus health checks
├── Frontend/electron/           # Electron desktop app
│   └── src/
│       ├── main/                #   Main process (Node.js)
│       │   ├── index.ts         #     Window creation, handler setup
│       │   ├── preload.ts       #     contextBridge API surface
│       │   ├── ipcHandlers.ts   #     Core IPC handlers
│       │   ├── stagehand/       #     Stagehand browser automation
│       │   └── cua/             #     Puppeteer browser automation
│       ├── renderer/            #   React renderer (browser context)
│       │   ├── App.tsx          #     Root component + screen router
│       │   ├── components/
│       │   │   ├── screens/     #       Full-page screen components
│       │   │   └── ui/          #       Reusable UI primitives
│       │   ├── services/        #     Business logic classes
│       │   └── types/           #     Type declarations (electron.d.ts)
│       ├── lib/                 #   Shared libraries (voice, OS)
│       ├── modules/             #   Higher-level orchestrators
│       └── utils/               #   Static utility classes
├── Infrastructure/              # Terraform (AWS ECS, RDS, ALB)
└── scripts/bundle.js            # Electron packaging helper
```

---

## NestJS Backend Conventions

Source(s): `Backend/src/`, `Backend/.eslintrc.js`, `Backend/.prettierrc`, `Backend/tsconfig.json`, `Backend/prisma/schema.prisma`

### Module Structure

Every feature lives under `src/modules/<name>/` with this layout:

```
modules/<name>/
├── <name>.module.ts        # @Module declaration
├── <name>.controller.ts    # Route handlers
├── <name>.service.ts       # Business logic
├── index.ts                # Barrel exports
├── dto/                    # (if needed) DTOs with class-validator
│   ├── create-<name>.dto.ts
│   ├── update-<name>.dto.ts
│   └── index.ts
├── guards/                 # (if needed)
│   ├── <name>.guard.ts
│   └── index.ts
└── decorators/             # (if needed)
    ├── <name>.decorator.ts
    └── index.ts
```

### Barrel Exports

Every directory has an `index.ts`. Use **named exports** (not `export *`):

```typescript
// modules/auth/index.ts
export { AuthModule } from './auth.module';
export { AuthService } from './auth.service';
export { AuthGuard } from './guards';
export { CurrentUser } from './decorators';
```

Import from barrel files, not directly:

```typescript
// Good
import { AuthGuard, CurrentUser } from '../auth';

// Avoid
import { AuthGuard } from '../auth/guards/auth.guard';
```

### Dependency Injection

Constructor injection with `private readonly`:

```typescript
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
}
```

### DTOs (class-validator)

DTOs use `class-validator` decorators. Every field gets a validator:

```typescript
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
```

The global `ValidationPipe` is configured with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.

### Error Handling

Throw NestJS HTTP exceptions for client errors:

```typescript
async findOne(id: string): Promise<User> {
  const user = await this.prisma.user.findUnique({ where: { id } });
  if (!user || !user.isActive) {
    throw new NotFoundException(`User with ID ${id} not found`);
  }
  return user;
}
```

### Logger

Instantiate with the class name as context:

```typescript
private readonly logger = new Logger(AuthService.name);

// Usage
this.logger.log(`Magic link sent to: ${email}`);
this.logger.error(`Failed to verify: ${error.message}`);
```

### Prisma

`PrismaService` extends `PrismaClient`, is `@Global()`, and available everywhere without importing `PrismaModule`:

```typescript
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

**Schema conventions:**
- Model names: `PascalCase` (`User`, `AgentAction`)
- Table names: `snake_case` plural via `@@map("users")`
- Field names: `camelCase` in Prisma, `snake_case` in DB via `@map()`
- Primary keys: UUID with `@id @default(uuid())`
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- Soft deletes: `isActive Boolean @default(true)` — `remove()` sets `isActive: false`
- Relations: explicit `@relation` with `onDelete: Cascade`
- Indexes: `@@index([foreignKeyField])` on all foreign keys
- Enums: `SCREAMING_SNAKE_CASE` values (`SUPER_ADMIN`, `IN_PROGRESS`)

After changing `schema.prisma`, always run `npx prisma generate`.

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files | `kebab-case` | `auth.controller.ts`, `create-user.dto.ts` |
| Classes | `PascalCase` | `AuthService`, `CreateUserDto`, `SupabaseAuthGuard` |
| Methods | `camelCase` | `findAll`, `getOrCreateUser` |
| Route paths | `kebab-case` | `health/liveness`, `auth/signinup/code` |
| Config keys | `dot.notation` | `app.nodeEnv`, `database.url` |

### Style Rules

- **Prettier**: singleQuote, trailingComma `all`, tabWidth 2, semi, printWidth 80
- **ESLint**: `@typescript-eslint/recommended` + prettier integration
  - `no-explicit-any`: warn (not error)
  - `no-unused-vars`: warn, ignores `_` prefix args
  - `explicit-function-return-type`: off
- **TypeScript**: ES2021 target, CommonJS modules, `strictNullChecks: true`, `noImplicitAny: true`
- Path aliases (`@/*`, `@modules/*`) are defined in `tsconfig.json` but **not used** — stick with relative imports

### HTTP Conventions

- `@Patch` for partial updates (not `@Put`)
- `@HttpCode(HttpStatus.NO_CONTENT)` on `@Delete`
- `@HttpCode(HttpStatus.OK)` on POST endpoints that don't create resources
- Health endpoints excluded from the global `/api` prefix

### Config

Config is a factory function returning a typed `Configuration` interface. Access via `ConfigService`:

```typescript
const port = this.configService.get<number>('app.port');
const dbUrl = this.configService.get<string>('database.url');
```

### Tests

- **Unit tests**: `*.spec.ts` co-located with source in `src/`
- **E2E tests**: `*.e2e-spec.ts` in `test/`, uses `supertest` with a real `INestApplication`
- **Framework**: Jest 29 with ts-jest
- Run: `npm test` (unit), `npm run test:e2e` (E2E), `npm run test:cov` (coverage)

---

## Electron Frontend Conventions

Source(s): `Frontend/electron/src/`, `Frontend/electron/tsconfig.json`, `Frontend/electron/webpack.config.js`

### Process Isolation

Code is strictly separated by Electron process:

| Directory | Process | Runtime | Notes |
|-----------|---------|---------|-------|
| `src/main/` | Main | Node.js | Has `fs`, `child_process`, Electron APIs |
| `src/renderer/` | Renderer | Browser | React, DOM — **no** Node.js access |
| `src/main/preload.ts` | Preload | Bridge | `contextBridge` exposes limited API |
| `src/lib/`, `src/utils/` | Either | Depends on import | Shared types and platform-agnostic logic |

Never import main-process modules from renderer code or vice versa.

### IPC Communication (Critical Pattern)

All main ↔ renderer communication uses a strict 3-layer pattern:

**Layer 1 — Main process handlers** (`ipcMain.handle`):

```typescript
// src/main/ipcHandlers.ts
ipcMain.handle('auth:getToken', async () => {
  return await keytar.getPassword('neo', 'auth-token');
});
```

**Layer 2 — Preload bridge** (`contextBridge.exposeInMainWorld`):

```typescript
// src/main/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  getAuthToken: () => ipcRenderer.invoke('auth:getToken'),
  cua: {
    navigate: (url: string) => ipcRenderer.invoke(CUA_IPC_CHANNELS.NAVIGATE, url),
  },
  stagehand: {
    executeTask: (req) => ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.EXECUTE_TASK, req),
    onProgress: (callback) => {
      const handler = (_e, event) => callback(event);
      ipcRenderer.on(STAGEHAND_IPC_CHANNELS.PROGRESS, handler);
      return () => ipcRenderer.removeListener(STAGEHAND_IPC_CHANNELS.PROGRESS, handler);
    },
  },
});
```

**Layer 3 — Renderer type declaration** (`electron.d.ts`):

```typescript
// src/renderer/types/electron.d.ts
export interface ElectronAPI {
  getAuthToken: () => Promise<string | null>;
  cua: CUAAPI;
  stagehand: StagehandAPI;
}
declare global {
  interface Window { electronAPI?: ElectronAPI; }
}
```

**Rules:**
- Channel names use `domain:action` convention: `auth:getToken`, `cua:navigate`, `stagehand:execute-task`
- Feature modules define channel constants with `as const`: `CUA_IPC_CHANNELS`, `STAGEHAND_IPC_CHANNELS`
- Request-response: always `ipcMain.handle()` / `ipcRenderer.invoke()` (returns Promise)
- Push events (main→renderer): `webContents.send()` + `ipcRenderer.on()` returning a cleanup function
- `window.electronAPI` is optional (`ElectronAPI | undefined`) — always check before use
- When adding a new IPC channel: update **all three layers** (handler, preload, type declaration)

### Handler Registration

All handlers are registered via `setup*Handlers()` functions called at startup:

```typescript
// src/main/index.ts
app.whenReady().then(async () => {
  await bootstrapSecrets();
  setupIpcHandlers();
  setupCUAHandlers();
  setupStagehandHandlers();
  createWindow();
});
```

Each feature module exports its own setup function:

```typescript
// src/main/stagehand/stagehandHandlers.ts
export function setupStagehandHandlers(): void {
  ipcMain.handle(CHANNELS.EXECUTE_TASK, async (_event, request) => { ... });
  ipcMain.handle(CHANNELS.ACT, async (_event, action, options) => { ... });
}
```

### React Patterns

**Functional components only**, always `React.FC<Props>`:

```typescript
interface LoginScreenProps {
  onSubmit: (email: string) => Promise<void>;
  onNeedHelp?: () => void;
  error?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSubmit, onNeedHelp, error }) => {
  // ...
};
export default LoginScreen;
```

Props interfaces are defined directly above the component, named `<ComponentName>Props`.

**State management**: `useState` in `App.tsx` with prop drilling. No Redux, Zustand, or Context. The `App` component owns all app state:

```typescript
const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('splash');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  // ... all state lives here, passed down as props
```

**Screen routing**: Union type + conditional rendering (no React Router):

```typescript
type AppScreen = 'splash' | 'login' | 'check-email' | 'mic-permission' | 'audio-test' | 'voice';

// In render:
if (currentScreen === 'splash') return <SplashScreen />;
if (currentScreen === 'login') return <LoginScreen onSubmit={handleLogin} />;
```

**Initialization guard** (prevents double-init in StrictMode):

```typescript
const initializedRef = useRef(false);
useEffect(() => {
  if (initializedRef.current) return;
  initializedRef.current = true;
  const init = async () => { /* ... */ };
  init();
}, []);
```

### CSS Approach

Plain CSS with co-located files and CSS custom properties. No CSS Modules, no Tailwind, no CSS-in-JS.

- Global design tokens in `renderer/styles/theme.css` — use `var(--color-bg-primary)`, etc.
- Each component has a co-located `.css` file: `LoginScreen.tsx` → `LoginScreen.css`
- Design system classes use `neo-` prefix: `neo-container`, `neo-btn-primary`, `neo-input`
- State-variant classes composed via template literals:

```typescript
className={`voice-screen voice-state-${state}`}
className={`neo-input ${error ? 'neo-input-error' : ''}`}
```

### TypeScript Conventions

- **`interface`** for object shapes, **`type`** for unions only
- **No enums** — use `type` unions or `as const` objects instead:

```typescript
type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

const CUA_IPC_CHANNELS = {
  NAVIGATE: 'cua:navigate',
  CLICK: 'cua:click',
} as const;
```

- `interface` inheritance for extending result types:

```typescript
interface CUAScreenshotResult extends CUAActionResult {
  data?: string;
  width?: number;
}
```

### Singletons (Main Process)

Main-process managers are classes exported as singleton instances:

```typescript
class StagehandManager {
  private stagehand: Stagehand | null = null;
  async initialize(): Promise<Stagehand> { /* lazy init with dedup */ }
  async cleanup(): Promise<void> { /* teardown */ }
}
export const stagehandManager = new StagehandManager();
```

Renderer services use async factory singletons:

```typescript
let instance: AuthService | null = null;
export async function getAuthService(): Promise<AuthService> {
  if (!instance) {
    const url = window.electronAPI ? await window.electronAPI.getBackendUrl() : 'http://localhost:3000';
    instance = new AuthService(url);
  }
  return instance;
}
```

Static utility classes for stateless helpers:

```typescript
export class Accessibility {
  static announce(text: string, priority: 'polite' | 'assertive' = 'polite'): void { /* ... */ }
}
export class Storage {
  static getItem(key: string): string | null { /* ... */ }
}
```

### Error Handling

Consistent pattern across every catch block:

```typescript
const errorMessage = error instanceof Error ? error.message : 'Unknown error';
```

Functions return result objects instead of throwing:

```typescript
async navigate(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    await page.goto(url);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}
```

### Logging

`console.log/error/warn` with bracketed module prefixes:

```
[Config] Backend URL: http://localhost:3000
[Secrets] Fetching secrets from Doppler API...
[StagehandManager] Initializing (LOCAL mode)...
[CUA] Navigate request: https://example.com
```

### Accessibility (Critical)

This is a core product requirement. Every component must include:

- `role` attributes: `role="main"`, `role="region"`, `role="status"`, `role="alert"`
- `aria-label` on every interactive or semantic container
- `aria-live="polite"` on status regions
- `Accessibility.announce()` on every user action and screen transition
- `aria-hidden="true"` on decorative elements (orb visualizer, backgrounds)

```typescript
Accessibility.announce('Sign-in link sent. Please check your email.');
Accessibility.announce('Error: ' + errorMessage, 'assertive');
```

---

## LangGraph AI Agent Conventions

Source(s): `AI/src/`, `AI/pyproject.toml`

### Graph Architecture

The system uses a multi-team supervisor pattern:

```
master_supervisor → route_to_team → [web_team | general_team | email_team | form_team] → END
```

**Shared state**: A single `AgentState(TypedDict)` flows through every node:

```python
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]  # accumulating message list
    next: str                                              # routing target
    team: str                                              # selected team
    task_result: str                                       # final result text
    task_failed: bool                                      # error flag
    streaming: bool                                        # streaming mode flag
    cua_client: Optional[Any]                              # runtime injected
    context: Optional[ConversationContext]                  # conversation state
```

### Graph Construction

Graphs are built with **factory functions** returning compiled `StateGraph`:

```python
def create_web_team_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("web_supervisor", web_supervisor)
    workflow.add_node("browser_agent", browser_agent)
    workflow.add_node("content_cleaner", content_cleaner_agent)

    workflow.set_entry_point("web_supervisor")
    workflow.add_edge("web_supervisor", "browser_agent")
    workflow.add_edge("browser_agent", "content_cleaner")
    workflow.add_edge("content_cleaner", END)
    return workflow.compile()
```

**Naming**: `create_<name>_graph()` or `create_<team>_team_graph()`.

### Node Functions

Every node is an **async function** (not a class) with this exact signature:

```python
async def browser_agent(state: AgentState) -> AgentState:
    """Docstring describing the node's purpose."""
    logger.info("[Browser Agent] Starting...")

    # 1. Read from state
    user_message = state["messages"][-1].content

    # 2. Do work
    result = await _execute_stagehand_task(...)

    # 3. Append result to messages (with name for identification)
    state["messages"].append(AIMessage(content=result, name="browser_agent"))

    # 4. Return modified state
    return state
```

**Rules:**
- Signature: `async def name(state: AgentState) -> AgentState`
- Always returns the full `state` dict
- Results go into `state["messages"]` as `AIMessage(content=..., name="node_name")`
- Downstream nodes find upstream results by scanning messages for a specific `name`
- Heavy logic extracted to private `_` prefixed helpers

### Supervisor / Routing

Supervisors use LLM classification to set `state["next"]`:

```python
async def master_supervisor(state: AgentState) -> AgentState:
    llm = get_llm(temperature=0)
    response = await llm.ainvoke([HumanMessage(content=classification_prompt)])
    team = response.content.strip().lower()

    valid_teams = ["web_team", "email_team", "form_team", "general_team"]
    if team not in valid_teams:
        team = "web_team"  # safe default

    state["team"] = team
    state["next"] = team
    return state
```

Routing is a separate pure function:

```python
def route_to_team(state: AgentState) -> Literal["web_team", ...]:
    return state.get("next", "web_team")
```

### Adding a New Team

1. Create `src/graphs/<team_name>/graph.py` with `create_<team>_team_graph()`
2. Create `src/graphs/<team_name>/agents.py` with async node functions
3. Optionally create `src/graphs/<team_name>/supervisor.py`
4. In `master_graph.py`:
   - `workflow.add_node("<team>_team", create_<team>_team_graph())`
   - Add to `route_to_team` conditional edges map
   - Add `workflow.add_edge("<team>_team", END)`
   - Add to `valid_teams` list in `master_supervisor`

### Tool Definition

Tool **logic** lives in `src/tools/<name>.py` as plain async functions:

```python
# src/tools/web_task.py
async def execute_web_task(context, task, orchestrator, cua_client, conversation_context=None) -> str:
    ...
```

Tool **registration** happens in the `Assistant` class via LiveKit's `@function_tool`:

```python
# src/assistant.py
class Assistant(Agent):
    @function_tool
    async def trigger_orchestrator_agent(self, context: RunContext, task: str) -> str:
        """Docstring becomes the tool description for the LLM."""
        return await execute_web_task(context, task, self.orchestrator, self.cua_client)
```

`src/tools/__init__.py` re-exports all functions with `__all__`.

### LLM Client

Factory functions (not singletons) — new instance per call:

```python
def get_llm(temperature: float = 0, streaming: bool = False) -> ChatOpenAI:
    return ChatOpenAI(model=DEFAULT_MODEL, temperature=temperature, ...)

def get_async_openai_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=OPENROUTER_API_KEY, base_url=OPENROUTER_BASE_URL)
```

Two client types for different contexts:
- `get_llm()` → `ChatOpenAI` (LangChain wrapper) for graph nodes and supervisors
- `get_async_openai_client()` → `AsyncOpenAI` (raw SDK) for streaming content

All LLM calls route through **OpenRouter** as a unified gateway.

### Type Annotation Patterns

| Use Case | Type System | Example |
|----------|-------------|---------|
| Graph state | `TypedDict` | `AgentState` |
| Mutable context objects | `@dataclass` | `ConversationContext` |
| API schemas / commands | `Pydantic BaseModel` | `CUACommand`, `StagehandTaskCommand` |
| Union literals | `Literal` | `type: Literal["navigate"]` |
| Nullable | `Optional[X]` | `cua_client: Optional[Any]` |
| Import-only types | `TYPE_CHECKING` guard | `if TYPE_CHECKING: from orchestrator import NEOAssistant` |

Pydantic models use `Field(description="...")` and camelCase field names matching the frontend API:

```python
class StagehandTaskCommand(CUACommand):
    type: Literal["stagehand_task"] = "stagehand_task"
    instruction: str = Field(description="Natural language task")
    maxSteps: int = Field(default=20, description="Maximum agent steps")
```

### Async Patterns

- All node functions and tool implementations are `async def`
- `asyncio.create_task()` for background work (progress polling, graph streaming)
- `asyncio.Queue` for merging events from multiple sources
- `asyncio.Future` for request/response correlation (CUA client)
- `asyncio.wait_for(future, timeout=...)` for bounded waits
- Cancellation cleanup: cancel tasks, await them, catch `CancelledError`

### Error Handling

Broad `except Exception`, log the error, return a user-friendly string. Never raise to the user:

```python
try:
    result = await some_operation()
except Exception as e:
    logger.error(f"[Browser Agent] Error: {str(e)}")
    state["task_result"] = "I had trouble completing that task. Could you try again?"
    state["task_failed"] = True
    return state
```

### Logging

Use `get_logger()` from `utils/logger.py` or `logging.getLogger()`:

```python
from utils.logger import get_logger
logger = get_logger("web-team-agents")
```

Logger names follow the component: `"neo-agent"`, `"neo-orchestrator"`, `"master-graph"`, `"web-team-agents"`, `"cua-client"`.

**Bracketed prefix** convention in all messages:

```python
logger.info("[Browser Agent] Starting web navigation...")
logger.info(f"[Master Supervisor] Routing to: {team}")
logger.error(f"[CUA] Timeout waiting for response to {command.type}")
```

Truncate long content in logs:

```python
logger.debug(f"[Content Cleaner] Preview: {raw_output[:200]}...")
```

### Configuration & Prompts

Config values are module-level constants in `src/config.py`:

```python
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-4.1-mini")
TTS_MODEL = "eleven_turbo_v2_5"
FALLBACK_INTERVAL = 10.0
SKIP_EVENTS: set[str] = {"browser_init", "page_loaded", "task_complete"}
```

System prompts are `UPPER_SNAKE_CASE` string constants. Global prompts live in `src/instructions.py`; agent-specific prompts are defined at the top of their own module:

```python
# src/graphs/web_team/agents.py
BROWSER_AGENT_PROMPT = """You are a web browsing agent..."""
CONTENT_CLEANER_PROMPT = """You are a content cleaner..."""
```

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files | `snake_case` | `master_graph.py`, `web_task.py` |
| Functions | `snake_case` | `create_web_team_graph`, `browser_agent` |
| Private helpers | `_snake_case` | `_execute_stagehand_task` |
| Classes | `PascalCase` | `NEOAssistant`, `CUAClient` |
| Constants | `UPPER_SNAKE_CASE` | `LLM_MODEL`, `BROWSER_AGENT_PROMPT` |
| Logger names | `kebab-case` | `"web-team-agents"`, `"neo-orchestrator"` |
| Team dirs | `snake_case` | `graphs/web_team/`, `graphs/general_team/` |

### Style (Ruff)

- Line length: 88
- Double quotes, space indentation
- Lint rules: `E, F, W, I, N, B, A, C4, UP, SIM, RUF` (E501 ignored)
- Run: `uv run ruff check src/` and `uv run ruff format src/`

### Import Ordering (enforced by ruff `I`)

1. Standard library (`os`, `asyncio`, `json`, `logging`)
2. Third-party (`livekit.*`, `langchain_core.*`, `langgraph.*`, `pydantic`)
3. Local (`state.state`, `llm.client`, `graphs.*`, `tools.*`)

Use **absolute imports** from `src/` root everywhere except `__init__.py` (which uses relative):

```python
# Good
from state.state import AgentState
from llm.client import get_llm
from graphs.master_graph import create_master_graph

# In __init__.py only
from .logger import setup_logging, get_logger
```

Use lazy imports for circular deps and optional deps:

```python
if TYPE_CHECKING:
    from orchestrator import NEOAssistant

# Or inside a function body:
def set_room(self, room):
    from orchestrator import NEOAssistant  # lazy to avoid circular
```

### Tests

- Framework: pytest + pytest-asyncio (async mode: `auto`)
- Test file: `test_agent.py` (LiveKit connectivity test)
- Run: `uv run pytest`

---

## Cross-Component Patterns

### Secrets

All secrets come from Doppler. Never create `.env` files. Never commit tokens.

### Adding a New Feature (Checklist)

**Backend:**
1. Create `src/modules/<name>/` with module, controller, service, index.ts
2. Add DTOs with class-validator if accepting request bodies
3. Register module in `app.module.ts` imports
4. Add barrel exports
5. Run `npm run lint` and `npm test`

**Frontend (new IPC channel):**
1. Add handler in `src/main/` (either `ipcHandlers.ts` or a feature module)
2. Expose in `src/main/preload.ts` via `contextBridge`
3. Add type declaration in `src/renderer/types/electron.d.ts`
4. Use in renderer via `window.electronAPI?.newMethod()`

**Frontend (new screen):**
1. Create `src/renderer/components/screens/<Name>Screen.tsx` + `.css`
2. Add to `AppScreen` union type in `App.tsx`
3. Add conditional render in `App.tsx`
4. Add to barrel export in `screens/index.ts`
5. Include appropriate ARIA attributes and `Accessibility.announce()` calls

**AI (new team):**
1. Create `src/graphs/<team_name>/` with `graph.py` and `agents.py`
2. Build graph with `create_<team>_team_graph()` factory
3. Register in `master_graph.py` (add node, edge, routing, valid_teams)
4. Run `uv run ruff check src/` and `uv run pytest`

**AI (new tool):**
1. Add implementation in `src/tools/<name>.py` as plain async function
2. Add `@function_tool` wrapper in `src/assistant.py`
3. Re-export from `src/tools/__init__.py`

### Change Hygiene

- Keep diffs small and scoped to one component when possible
- Update tests when modifying logic
- Run linting before committing: `npm run lint` (Backend), `uv run ruff check src/` (AI)
- Run `npx prisma generate` after `schema.prisma` changes
- Run `uv sync` after `pyproject.toml` changes
- Run `npm install` after `package.json` changes
- Do not modify CI workflows unless explicitly requested

### Quick Reference: Common Commands

```bash
# Backend
cd Backend && doppler run -- npm run start:dev    # Dev server (port 3000)
cd Backend && npm run lint                        # ESLint
cd Backend && npm run format                      # Prettier
cd Backend && npm test                            # Jest unit tests
cd Backend && npm run build                       # nest build

# Frontend
cd Frontend/electron && doppler run -- npm run dev  # Dev (Electron + webpack on 3001)
cd Frontend/electron && npx tsc --noEmit            # Typecheck

# AI
cd AI && doppler run -- uv run python src/neo_agent.py start  # Run agent
cd AI && uv run ruff check src/                               # Lint
cd AI && uv run ruff format src/                              # Format
cd AI && uv run pytest                                        # Tests

# All services at once
bash dev.sh
```
